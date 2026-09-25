'use client'
// Rincian IPA satu SKPD: tiap indikator (angka, skor, sumber, rincian) + jejak
// indeks per bulan. Jejak bulanan dibangun dari snapshot `ipa_otomatis` per
// bulan & isian terverifikasi per tanggal capaian — itulah yang membuat
// penilaian tahunan bisa diikuti "berkala setiap bulan" (keputusan user).
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useProfilRole } from '@/components/useProfilRole'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import {
  LABEL_SUMBER, NAMA_BULAN, hitungSkpd, type HasilSkpd,
} from '@/lib/ipa'
import {
  hitungUlangOtomatis, muatIsian, muatOtomatisMentah, muatReferensi, snapshotTerakhir, susunNilai,
  type BarisOtomatis, type Isian, type Referensi,
} from '@/lib/ipaData'
import {
  BULAN_INI, KategoriPill, KeadaanNilai, PesanError, PilihTahunBulan, SkorBar, TAHUN_INI, fmtIndeks, fmtSkor,
} from '@/components/ipa/ipaUi'

type Muatan = { ref: Referensi; otomatis: BarisOtomatis[]; isian: Isian[] }

const LABEL_RINCIAN: Record<string, string> = {
  jumlah_barang: 'Jumlah barang aktif', batas: 'Batas waktu', ta_rkbmd: 'TA RKBMD dinilai',
  batas_hari: 'Batas hari', rata_hari: 'Rata-rata hari BAST → entry', direklas: 'Sudah berkode Aset Lain-Lain RB (tidak dihitung)',
  diusulkan_hapus: 'Diusulkan di RKBMD Penghapusan', dihapus: 'Dihapus tahun ini', jumlah_register: 'Register tanah',
  menunggu: 'Bukti menunggu verifikasi', ditolak: 'Bukti ditolak', jumlah_aset_idle: 'Aset idle',
}

function Rincian({ r }: { r: Record<string, unknown> | undefined }) {
  if (!r) return null
  const isi = Object.entries(r).filter(([k]) => k !== 'dokumen')
  if (isi.length === 0) return null
  return (
    <p className="text-xs text-gray-500 mt-1">
      {isi.map(([k, v]) => `${LABEL_RINCIAN[k] ?? k}: ${typeof v === 'number' ? v.toLocaleString('id-ID') : String(v)}`).join(' · ')}
    </p>
  )
}

export default function DetailSkpdIpa({ skpdId, tahunAwal, bulanAwal }: { skpdId: number; tahunAwal?: number; bulanAwal?: number }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { role } = useProfilRole()
  const [tahun, setTahun] = useState(tahunAwal ?? TAHUN_INI)
  const [bulan, setBulan] = useState(bulanAwal ?? BULAN_INI)
  const [muatKe, setMuatKe] = useState(0)
  const { data, loading, error, run } = useAsyncData<Muatan>()
  const maksBulan = tahun === TAHUN_INI ? BULAN_INI : 12

  useEffect(() => {
    void run(async () => {
      const [ref, otomatis, isian] = await Promise.all([
        muatReferensi(supabase),
        // Semua bulan (≤ maks) sekaligus: dipakai posisi bulan terpilih & jejak bulanan.
        muatOtomatisMentah(supabase, tahun, maksBulan, skpdId),
        muatIsian(supabase, tahun, { skpdId }),
      ])
      return { ref, otomatis, isian }
    })
  }, [tahun, muatKe, skpdId, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const skpd = data?.ref.skpd.find(s => s.skpd_id === skpdId)

  const hitungPada = (b: number): HasilSkpd | null => {
    if (!data || !skpd) return null
    return hitungSkpd({
      skpdId, klaster: skpd.klaster, indikator: data.ref.indikator, bobotAspek: data.ref.bobotAspek,
      parameter: data.ref.parameter,
      nilai: susunNilai({ indikator: data.ref.indikator, otomatis: snapshotTerakhir(data.otomatis, b), isian: data.isian, skpdId, tahun, bulan: b }),
    })
  }
  const hasil = useMemo(() => hitungPada(Math.min(bulan, maksBulan)), [data, bulan, maksBulan]) // eslint-disable-line react-hooks/exhaustive-deps
  const jejak = useMemo(() => Array.from({ length: maksBulan }, (_, i) => ({ b: i + 1, h: hitungPada(i + 1) })), [data, maksBulan]) // eslint-disable-line react-hooks/exhaustive-deps
  const snapshotBulan = useMemo(
    () => new Map(snapshotTerakhir(data?.otomatis ?? [], bulan).map(o => [o.indikator, o])),
    [data, bulan])

  const bolehHitung = role === 'admin' || role === 'pengurus_barang'

  async function hitungUlang() {
    try {
      await konfirmasi({
        judul: 'Hitung ulang indikator otomatis?', nada: 'teal', labelYa: 'Hitung',
        isi: `Snapshot ${NAMA_BULAN[(tahun === TAHUN_INI ? BULAN_INI : 12) - 1]} ${tahun} untuk SKPD ini akan diperbarui dari data aplikasi terkini.`,
        kerjakan: async () => { await hitungUlangOtomatis(supabase, tahun, skpdId) },
      })
      setBulan(tahun === TAHUN_INI ? BULAN_INI : 12)
      setMuatKe(k => k + 1)
    } catch (e) {
      await konfirmasiGagal(konfirmasi, (e as Error).message, 'Gagal menghitung')
    }
  }

  return (
    <div className="p-6">
      <Link href="/dashboard/ipa" className="text-sm text-teal hover:underline">← Dashboard IPA</Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{skpd?.nama ?? 'SKPD'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Klaster {skpd?.klaster ?? '-'} · cakupan data {skpd?.sertakan_turunan ? 'SKPD induk + seluruh unit di bawahnya' : 'SKPD induk saja'}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <PilihTahunBulan tahun={tahun} bulan={bulan} onTahun={t => { setTahun(t); setBulan(t === TAHUN_INI ? BULAN_INI : 12) }} onBulan={setBulan} />
          {bolehHitung && <button className="btn-secondary" onClick={hitungUlang}>↻ Hitung ulang</button>}
          <Link href={`/dashboard/ipa/capaian?skpd=${skpdId}`} className="btn-primary">Isi Capaian</Link>
        </div>
      </div>

      <PesanError pesan={error} />
      {loading && !data && <p className="text-sm text-gray-400">Memuat…</p>}

      {hasil && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6">
            <div className="card p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Indeks s.d. {NAMA_BULAN[bulan - 1]} {tahun}</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">{fmtIndeks(hasil.indeks)}</p>
              <div className="mt-2 flex items-center gap-2"><KategoriPill k={hasil.kategori} /><span className="text-xs text-gray-500">Skor {fmtSkor(hasil.skor)}</span></div>
              <p className="text-xs text-gray-500 mt-2">
                Bobot berlaku {Math.round(hasil.bobotBerlaku * 100)}% ·{' '}
                {hasil.layakRanking ? `ikut ranking klaster ${hasil.klaster} (lihat Dashboard)` : 'belum ikut ranking'}
              </p>
              {hasil.jumlahBelum > 0 && <p className="text-xs text-amber-600 mt-1">{hasil.jumlahBelum} indikator belum diisi / dihitung</p>}
            </div>
            <div className="card p-5 lg:col-span-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Jejak indeks per bulan</p>
              <div className="flex items-end gap-2 h-28">
                {jejak.map(({ b, h }) => (
                  <button key={b} type="button" onClick={() => setBulan(b)} className="flex-1 flex flex-col items-center gap-1 group" title={`${NAMA_BULAN[b - 1]}: ${fmtIndeks(h?.indeks)}`}>
                    <span className="text-[10px] text-gray-500 tabular-nums">{h?.indeks ? h.indeks.toFixed(2) : ''}</span>
                    <div className={`w-full rounded-t ${b === bulan ? 'bg-teal' : 'bg-teal/30 group-hover:bg-teal/60'}`}
                      style={{ height: `${h?.indeks ? ((h.indeks - 1) / 3) * 80 + 4 : 2}px` }} />
                    <span className="text-[10px] text-gray-500">{NAMA_BULAN[b - 1].slice(0, 3)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {data!.ref.aspek.map(a => {
              const ha = hasil.aspek.find(x => x.kode === a.kode)!
              const inds = data!.ref.indikator.filter(i => i.aspek === a.kode)
              return (
                <div key={a.kode} className="card">
                  <div className="p-4 border-b border-gray-100 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{a.nama}</p>
                      <p className="text-xs text-gray-500">Bobot aspek klaster {hasil.klaster}: {Math.round(ha.bobot * 100)}%</p>
                    </div>
                    <div className="w-40">
                      <p className="text-right text-sm font-semibold tabular-nums">{ha.skor == null ? 'N/A' : ha.skor.toFixed(2)}</p>
                      <SkorBar skor={ha.skor} />
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {inds.map(i => {
                        const hi = hasil.indikator.find(x => x.kode === i.kode)!
                        const snap = snapshotBulan.get(i.kode)
                        return (
                          <tr key={i.kode} className="border-t border-gray-50 align-top">
                            <td className="table-td">
                              <p className="font-medium text-gray-800">{i.nama}</p>
                              <p className="text-xs text-gray-500">{i.label_pembilang} / {i.label_penyebut}</p>
                              {i.keterangan && <p className="text-xs text-gray-400 mt-0.5">{i.keterangan}</p>}
                              {i.sumber !== 'isian' && <Rincian r={snap?.rincian} />}
                            </td>
                            <td className="table-td text-xs text-gray-500 w-56">
                              {LABEL_SUMBER[i.sumber]}
                              {i.sumber !== 'isian' && snap && <p className="text-gray-400">dihitung {new Date(snap.dihitung_at).toLocaleDateString('id-ID')}</p>}
                            </td>
                            <td className="table-td text-right w-16 text-xs text-gray-500">{Math.round(i.bobot * 100)}%</td>
                            <td className="table-td text-right w-40"><KeadaanNilai n={hi.nilai} /></td>
                            <td className="table-td w-32">
                              <p className="text-right text-sm tabular-nums">{hi.skor == null ? '—' : hi.skor.toFixed(2)}</p>
                              <SkorBar skor={hi.skor} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
