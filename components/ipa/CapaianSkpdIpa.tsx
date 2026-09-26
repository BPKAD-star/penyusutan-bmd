'use client'
// Capaian SKPD — SATU halaman per SKPD penilaian: indeks, jejak per bulan, &
// kesebelas indikator dgn aksinya di barisnya masing-masing (keputusan user
// 2026-09-26, menggantikan dua halaman: rincian SKPD `/ipa/skpd/[id]` yang
// "halaman di dalam dashboard" tanpa menu, & menu Capaian SKPD yang terpisah
// dari angka yang diisinya).
//
// Aksi per indikator, menurut sumbernya:
//   isian (TL BPK, TL Inspektorat) · rekon · pajak → "Isi Capaian" = pop-up
//     form yang dulu jadi menu Capaian SKPD (read-only kalau di luar cakupan).
//   otomatis → 👁 = pop-up daftar barang/dokumen: mana yang sudah terpenuhi &
//     mana yang perlu ditindaklanjuti (`fn_ipa_rincian`).
//
// Tombol "Hitung ulang" & "Isi Capaian" di kanan atas DICABUT. Penggantinya:
// angka otomatis diperbarui SENDIRI saat halaman dibuka, paling banyak sekali
// sehari per SKPD, dan hanya oleh pengguna yang berwenang atas SKPD itu
// (`fn_ipa_simpan_otomatis` menolak yang lain). Waktu hitungnya selalu tampil.
// Admin tetap punya "Hitung Ulang Otomatis" seluruh SKPD di Dashboard IPA.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfilRole } from '@/components/useProfilRole'
import { LABEL_SUMBER, NAMA_BULAN, hitungSkpd, type HasilSkpd, type Indikator } from '@/lib/ipa'
import {
  hitungUlangOtomatis, muatIsian, muatOtomatisMentah, muatReferensi, skpdBolehIsi, snapshotTerakhir, susunNilai,
  type BarisOtomatis, type Isian, type Referensi, type SkpdIpa,
} from '@/lib/ipaData'
import {
  BULAN_INI, KategoriPill, KeadaanNilai, ModalIpa, PesanError, PilihTahunBulan, SkorBar, TAHUN_INI, fmtIndeks, fmtSkor,
} from '@/components/ipa/ipaUi'
import CapaianTl from '@/components/ipa/CapaianTl'
import CapaianRekon from '@/components/ipa/CapaianRekon'
import CapaianPajak from '@/components/ipa/CapaianPajak'
import RincianIndikator from '@/components/ipa/RincianIndikator'

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

type Referensi2 = { ref: Referensi; boleh: SkpdIpa[] }
// `skpdId`/`tahun` ikut disimpan supaya penyegar otomatis tak pernah membaca
// data milik pilihan SEBELUMNYA yang kebetulan belum tergantikan.
type Muatan = { skpdId: number; tahun: number; otomatis: BarisOtomatis[]; isian: Isian[] }
type Segar = { keadaan: 'jalan' } | { keadaan: 'gagal'; pesan: string } | null

const hariSama = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

export default function CapaianSkpdIpa({ skpdAwal, tahunAwal, bulanAwal }: { skpdAwal?: number; tahunAwal?: number; bulanAwal?: number }) {
  const supabase = createClient()
  const router = useRouter()
  const { role } = useProfilRole()
  const [awal, setAwal] = useState<Referensi2 | null>(null)
  const [errAwal, setErrAwal] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [catatanSkpd, setCatatanSkpd] = useState('')
  const [tahun, setTahun] = useState(tahunAwal ?? TAHUN_INI)
  const [bulan, setBulan] = useState(bulanAwal ?? (tahunAwal && tahunAwal < TAHUN_INI ? 12 : BULAN_INI))
  const [data, setData] = useState<Muatan | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [muatKe, setMuatKe] = useState(0)
  const [segar, setSegar] = useState<Segar>(null)
  const [modal, setModal] = useState<Indikator | null>(null)
  const disegarkan = useRef(new Set<string>())
  const maksBulan = tahun === TAHUN_INI ? BULAN_INI : 12

  // Referensi + daftar SKPD yang boleh diisi — sekali per peran.
  useEffect(() => {
    if (role == null) return
    let alive = true
    void (async () => {
      try {
        const ref = await muatReferensi(supabase)
        const boleh = await skpdBolehIsi(supabase, ref.skpd, role)
        if (!alive) return
        setAwal({ ref, boleh })
        // Admin & pengawas boleh membuka SKPD mana pun; pengurus SKPD hanya
        // SKPD-nya — RLS `ipa_isian` menyembunyikan isian SKPD lain, jadi skor
        // SKPD lain di layarnya akan SALAH (TL tampil "belum"), bukan cuma kurang.
        const bisaDibuka = role === 'admin' || role === 'pengawas' ? ref.skpd : boleh
        const diminta = bisaDibuka.find(s => s.skpd_id === skpdAwal)
        if (skpdAwal != null && !diminta) {
          setCatatanSkpd('Rincian SKPD lain hanya bisa dibuka Pengelola Barang & pengawas — yang ditampilkan SKPD Anda.')
        }
        setSkpdId(diminta?.skpd_id ?? bisaDibuka[0]?.skpd_id ?? null)
      } catch (e) { if (alive) setErrAwal((e as Error).message) }
    })()
    return () => { alive = false }
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  const opsiSkpd = useMemo(() => {
    if (!awal) return []
    return role === 'admin' || role === 'pengawas' ? awal.ref.skpd : awal.boleh
  }, [awal, role])
  const skpd = awal?.ref.skpd.find(s => s.skpd_id === skpdId) ?? null
  const bolehIsi = !!awal && skpdId != null && awal.boleh.some(s => s.skpd_id === skpdId)

  // Data SKPD × tahun. Penanda `seq` membuang hasil pilihan lama yang pulang belakangan.
  const seq = useRef(0)
  useEffect(() => {
    if (skpdId == null) return
    const ke = ++seq.current
    setLoading(true); setErr('')
    void (async () => {
      try {
        const [otomatis, isian] = await Promise.all([
          muatOtomatisMentah(supabase, tahun, maksBulan, skpdId),
          muatIsian(supabase, tahun, { skpdId }),
        ])
        if (ke === seq.current) setData({ skpdId, tahun, otomatis, isian })
      } catch (e) {
        if (ke === seq.current) { setErr((e as Error).message); setData(null) }
      } finally {
        if (ke === seq.current) setLoading(false)
      }
    })()
  }, [skpdId, tahun, muatKe]) // eslint-disable-line react-hooks/exhaustive-deps

  // Penyegar otomatis — pengganti tombol "Hitung ulang". Sekali per sesi per
  // SKPD×tahun (`disegarkan`), dan hanya kalau snapshot bulan ini belum ada
  // atau belum dihitung HARI INI. Gagal = peringatan amber, halaman tetap jalan
  // dgn snapshot yang ada (jangan sampai rincian ikut mati karena hitungnya).
  useEffect(() => {
    if (!data || !bolehIsi || data.tahun !== TAHUN_INI || data.skpdId !== skpdId) return
    const kunci = `${data.skpdId}|${data.tahun}`
    if (disegarkan.current.has(kunci)) return
    disegarkan.current.add(kunci)
    const bulanIni = data.otomatis.filter(o => o.bulan === BULAN_INI)
    if (bulanIni.length > 0 && bulanIni.every(o => hariSama(o.dihitung_at))) return
    setSegar({ keadaan: 'jalan' })
    void hitungUlangOtomatis(supabase, data.tahun, data.skpdId)
      .then(() => { setSegar(null); setMuatKe(k => k + 1) })
      .catch((e: Error) => setSegar({ keadaan: 'gagal', pesan: e.message }))
  }, [data, bolehIsi, skpdId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dataKini = data && data.skpdId === skpdId && data.tahun === tahun ? data : null
  const hitungPada = (b: number): HasilSkpd | null => {
    if (!dataKini || !awal || !skpd) return null
    return hitungSkpd({
      skpdId: skpd.skpd_id, klaster: skpd.klaster, indikator: awal.ref.indikator, bobotAspek: awal.ref.bobotAspek,
      parameter: awal.ref.parameter,
      nilai: susunNilai({ indikator: awal.ref.indikator, otomatis: snapshotTerakhir(dataKini.otomatis, b), isian: dataKini.isian, skpdId: skpd.skpd_id, tahun, bulan: b }),
    })
  }
  const bulanTampil = Math.min(bulan, maksBulan)
  const hasil = useMemo(() => hitungPada(bulanTampil), [dataKini, awal, skpd, bulanTampil]) // eslint-disable-line react-hooks/exhaustive-deps
  const jejak = useMemo(() => Array.from({ length: maksBulan }, (_, i) => ({ b: i + 1, h: hitungPada(i + 1) })), [dataKini, awal, skpd, maksBulan]) // eslint-disable-line react-hooks/exhaustive-deps
  const snapshotBulan = useMemo(
    () => new Map(snapshotTerakhir(dataKini?.otomatis ?? [], bulanTampil).map(o => [o.indikator, o])),
    [dataKini, bulanTampil])
  const dihitungTerakhir = useMemo(() => {
    const t = [...snapshotBulan.values()].map(o => o.dihitung_at).sort().pop()
    return t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : null
  }, [snapshotBulan])

  function gantiSkpd(id: number) {
    setSkpdId(id); setCatatanSkpd(''); setSegar(null)
    router.replace(`/dashboard/ipa/capaian?skpd=${id}&tahun=${tahun}&bulan=${bulanTampil}`, { scroll: false })
  }

  function tutupModal() {
    setModal(null)
    // Isian baru/terhapus mengubah skor — muat ulang sesudah pop-up ditutup.
    setMuatKe(k => k + 1)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capaian SKPD</h1>
          <p className="text-gray-500 text-sm mt-1">
            {skpd
              ? <>Klaster {skpd.klaster} · cakupan data {skpd.sertakan_turunan ? 'SKPD induk + seluruh unit di bawahnya' : 'SKPD induk saja'}</>
              : 'Penilaian IPA per SKPD & isian capaiannya.'}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {opsiSkpd.length > 1 && (
            <label className="text-xs text-gray-500">
              SKPD
              <select className="select-filter block mt-1 w-80" value={skpdId ?? ''} onChange={e => gantiSkpd(Number(e.target.value))}>
                {opsiSkpd.map(s => <option key={s.skpd_id} value={s.skpd_id}>{s.nama}</option>)}
              </select>
            </label>
          )}
          <PilihTahunBulan tahun={tahun} bulan={bulanTampil}
            onTahun={t => { setTahun(t); setBulan(t === TAHUN_INI ? BULAN_INI : 12); setSegar(null) }} onBulan={setBulan} />
        </div>
      </div>

      <PesanError pesan={errAwal || err} />
      {catatanSkpd && <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-700">{catatanSkpd}</div>}
      {awal && opsiSkpd.length === 0 && (
        <div className="card p-6 text-sm text-gray-600">
          Akun Anda tidak terdaftar pada SKPD induk penilaian IPA mana pun. Lihat peringkat seluruh SKPD di{' '}
          <Link href="/dashboard/ipa" className="text-teal hover:underline">Dashboard IPA</Link>.
        </div>
      )}
      {(loading || !awal) && !hasil && !errAwal && !err && <p className="text-sm text-gray-400">Memuat…</p>}

      {skpd && hasil && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="font-semibold text-gray-800 text-base mr-2">{skpd.nama}</span>
            {dihitungTerakhir && <span>Angka otomatis dihitung {dihitungTerakhir}</span>}
            {segar?.keadaan === 'jalan' && <span className="text-teal">· memperbarui angka otomatis…</span>}
            {!bolehIsi && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">hanya lihat</span>}
          </div>
          {segar?.keadaan === 'gagal' && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-700">
              Angka otomatis belum bisa diperbarui ({segar.pesan}). Yang tampil hasil hitung terakhir.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6">
            <div className="card p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Indeks s.d. {NAMA_BULAN[bulanTampil - 1]} {tahun}</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">{fmtIndeks(hasil.indeks)}</p>
              <div className="mt-2 flex items-center gap-2"><KategoriPill k={hasil.kategori} /><span className="text-xs text-gray-500">Skor {fmtSkor(hasil.skor)}</span></div>
              <p className="text-xs text-gray-500 mt-2">
                Bobot berlaku {Math.round(hasil.bobotBerlaku * 100)}% ·{' '}
                {hasil.layakRanking ? `ikut ranking klaster ${hasil.klaster} (lihat Dashboard IPA)` : 'belum ikut ranking'}
              </p>
              {hasil.jumlahBelum > 0 && <p className="text-xs text-amber-600 mt-1">{hasil.jumlahBelum} indikator belum diisi / dihitung</p>}
            </div>
            <div className="card p-5 lg:col-span-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Jejak indeks per bulan</p>
              <div className="flex items-end gap-2 h-28">
                {jejak.map(({ b, h }) => (
                  <button key={b} type="button" onClick={() => setBulan(b)} className="flex-1 flex flex-col items-center gap-1 group" title={`${NAMA_BULAN[b - 1]}: ${fmtIndeks(h?.indeks)}`}>
                    <span className="text-[10px] text-gray-500 tabular-nums">{h?.indeks ? h.indeks.toFixed(2) : ''}</span>
                    <div className={`w-full rounded-t ${b === bulanTampil ? 'bg-teal' : 'bg-teal/30 group-hover:bg-teal/60'}`}
                      style={{ height: `${h?.indeks ? ((h.indeks - 1) / 3) * 80 + 4 : 2}px` }} />
                    <span className="text-[10px] text-gray-500">{NAMA_BULAN[b - 1].slice(0, 3)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {awal!.ref.aspek.map(a => {
              const ha = hasil.aspek.find(x => x.kode === a.kode)!
              const inds = awal!.ref.indikator.filter(i => i.aspek === a.kode)
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
                        const diisi = i.sumber !== 'otomatis'
                        return (
                          <tr key={i.kode} className="border-t border-gray-50 align-top">
                            <td className="table-td">
                              <p className="font-medium text-gray-800">{i.nama}</p>
                              <p className="text-xs text-gray-500">{i.label_pembilang} / {i.label_penyebut}</p>
                              {i.keterangan && <p className="text-xs text-gray-400 mt-0.5">{i.keterangan}</p>}
                              {i.sumber !== 'isian' && <Rincian r={snap?.rincian} />}
                            </td>
                            <td className="table-td text-xs text-gray-500 w-52">{LABEL_SUMBER[i.sumber]}</td>
                            <td className="table-td text-right w-16 text-xs text-gray-500">{Math.round(i.bobot * 100)}%</td>
                            <td className="table-td text-right w-36"><KeadaanNilai n={hi.nilai} /></td>
                            <td className="table-td w-28">
                              <p className="text-right text-sm tabular-nums">{hi.skor == null ? '—' : hi.skor.toFixed(2)}</p>
                              <SkorBar skor={hi.skor} />
                            </td>
                            <td className="table-td w-32 text-right">
                              {diisi && bolehIsi ? (
                                <button type="button" className="btn-primary text-xs px-3 py-1.5" onClick={() => setModal(i)}>Isi Capaian</button>
                              ) : (
                                <button type="button" onClick={() => setModal(i)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-teal border border-teal/30 rounded-lg px-3 py-1.5 hover:bg-teal/5"
                                  title={diisi ? 'Lihat isian capaian' : 'Lihat mana yang sudah terpenuhi & mana yang perlu ditindaklanjuti'}>
                                  👁 Lihat
                                </button>
                              )}
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

      {modal && skpd && (
        <ModalIpa judul={modal.nama}
          sub={`${skpd.nama} · ${tahun} · ${modal.sumber === 'otomatis' ? 'dihitung otomatis dari data aplikasi' : bolehIsi ? 'diisi SKPD, dihitung setelah diverifikasi Pengelola Barang' : 'hanya lihat'}`}
          onTutup={tutupModal}>
          {modal.sumber === 'otomatis' && <RincianIndikator tahun={tahun} skpdId={skpd.skpd_id} indikator={modal.kode} />}
          {modal.sumber === 'isian' && <CapaianTl indikator={modal} skpdId={skpd.skpd_id} tahun={tahun} readOnly={!bolehIsi} />}
          {modal.sumber === 'rekon' && <CapaianRekon skpdId={skpd.skpd_id} tahun={tahun} readOnly={!bolehIsi} />}
          {modal.sumber === 'pajak' && <CapaianPajak skpd={skpd} tahun={tahun} readOnly={!bolehIsi} />}
        </ModalIpa>
      )}
    </div>
  )
}
