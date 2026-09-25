'use client'
// Dashboard IPA lima aspek — ranking seluruh SKPD penilaian per klaster.
// Angka otomatis dibaca dari snapshot bulanan (`ipa_otomatis`), bukan dihitung
// ulang tiap halaman dibuka: 60 SKPD × 9 indikator terlalu mahal untuk setiap
// kunjungan. Admin memperbaruinya lewat "Hitung Ulang"; waktu hitung terakhir
// selalu ditampilkan supaya angka basi tak terbaca sebagai angka hari ini.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useProfilRole } from '@/components/useProfilRole'
import { useSkpdTree } from '@/components/useSkpdTree'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ASPEK_URUT, KLASTER_URUT, NAMA_BULAN, kategoriDariSkor, type KategoriIndeks, type KodeKlaster } from '@/lib/ipa'
import { hitungUlangOtomatis, muatPenilaian, type DataPenilaian } from '@/lib/ipaData'
import {
  BULAN_INI, KategoriPill, PesanError, PilihTahunBulan, SkorBar, TAHUN_INI, fmtIndeks, fmtSkor,
} from '@/components/ipa/ipaUi'
import { GaugeIndeks } from '@/components/ipa/GaugeIndeks'

const KATEGORI: KategoriIndeks[] = ['Sangat Baik', 'Baik', 'Buruk', 'Sangat Buruk']

export default function DashboardIpa() {
  const supabase = createClient()
  const { role, skpdId: profilSkpdId } = useProfilRole()
  const isAdmin = role === 'admin'
  const { rootOf, loaded: skpdTreeLoaded } = useSkpdTree()
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [bulan, setBulan] = useState(BULAN_INI)
  const [klaster, setKlaster] = useState<KodeKlaster | ''>('')
  const [cari, setCari] = useState('')
  const [muatKe, setMuatKe] = useState(0)
  const [progres, setProgres] = useState<{ selesai: number; total: number; gagal: string[] } | null>(null)
  const { data, loading, error, run } = useAsyncData<DataPenilaian>()

  useEffect(() => { void run(() => muatPenilaian(supabase, tahun, bulan)) }, [tahun, bulan, muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const namaSkpd = useMemo(() => new Map((data?.ref.skpd ?? []).map(s => [s.skpd_id, s.nama])), [data])
  const terakhirHitung = useMemo(() => {
    const t = (data?.otomatis ?? []).map(o => o.dihitung_at).sort()
    return t[t.length - 1] ?? null
  }, [data])

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (data?.hasil ?? [])
      .filter(h => !klaster || h.klaster === klaster)
      .filter(h => !q || (namaSkpd.get(h.skpdId) ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.klaster.localeCompare(b.klaster)
        || (a.peringkat ?? 9999) - (b.peringkat ?? 9999)
        || (b.skor ?? -1) - (a.skor ?? -1)
        || (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? ''))
  }, [data, klaster, cari, namaSkpd])

  const ringkas = useMemo(() => {
    const ber = (data?.hasil ?? []).filter(h => h.skor != null)
    // Skor rata-rata dulu, baru diturunkan ke indeks & kategori (linear —
    // hasilnya sama dgn merata-ratakan indeks langsung) supaya gauge kabupaten
    // & tabel selalu sepakat pada kategori yang SAMA untuk angka yang sama.
    const skorRata = ber.length ? ber.reduce((s, h) => s + h.skor!, 0) / ber.length : null
    const rata = skorRata == null ? null : 1 + (skorRata / 100) * 3
    const kategoriRata = skorRata == null ? null : kategoriDariSkor(skorRata)
    const perKat = Object.fromEntries(KATEGORI.map(k => [k, ber.filter(h => h.kategori === k).length])) as Record<KategoriIndeks, number>
    const lengkap = (data?.hasil ?? []).filter(h => h.layakRanking).length
    return { rata, kategoriRata, perKat, lengkap, total: data?.hasil.length ?? 0 }
  }, [data])

  // Gauge: admin/pengawas melihat kabupaten; SKPD (pengurus_barang/pembantu)
  // melihat SKPD-nya SENDIRI — dicari lewat SKPD INDUK (`ipa_skpd` cuma
  // memuat SKPD level-1, jadi sub-unit dinaikkan dulu lewat `rootOf`).
  const gauge = useMemo(() => {
    const lihatKabupaten = role === 'admin' || role === 'pengawas' || profilSkpdId == null
    if (lihatKabupaten) {
      return {
        nilai: ringkas.rata, kategori: ringkas.kategoriRata, label: 'Indeks IPA Kabupaten Kediri',
        keterangan: `${ringkas.lengkap} dari ${ringkas.total} SKPD lengkap & ikut ranking`,
      }
    }
    if (!skpdTreeLoaded || !data) return { nilai: null, kategori: null, label: 'Memuat…', keterangan: '' }
    const rootId = rootOf(profilSkpdId)?.id ?? profilSkpdId
    const h = data.hasil.find(x => x.skpdId === rootId)
    const label = `Indeks IPA ${namaSkpd.get(rootId) ?? 'SKPD Anda'}`
    if (!h) return { nilai: null, kategori: null, label, keterangan: 'SKPD ini belum termasuk daftar penilaian IPA.' }
    const keterangan = h.jumlahBelum > 0
      ? `${h.jumlahBelum} indikator belum diisi/dihitung`
      : h.layakRanking ? `Ikut ranking klaster ${h.klaster}` : 'Bobot berlaku di bawah ambang'
    return { nilai: h.indeks, kategori: h.kategori, label, keterangan }
  }, [role, profilSkpdId, skpdTreeLoaded, rootOf, data, ringkas, namaSkpd])

  async function hitungSemua() {
    if (!data) return
    const daftar = data.ref.skpd
    setProgres({ selesai: 0, total: daftar.length, gagal: [] })
    const gagal: string[] = []
    // Berurutan, bukan paralel: 60 panggilan serentak menumpuk beban DB &
    // satu SKPD besar yang lambat tak boleh menjatuhkan yang lain.
    for (let i = 0; i < daftar.length; i++) {
      try { await hitungUlangOtomatis(supabase, tahun, daftar[i].skpd_id) }
      catch (e) { gagal.push(`${daftar[i].nama}: ${(e as Error).message}`) }
      setProgres({ selesai: i + 1, total: daftar.length, gagal: [...gagal] })
    }
    setBulan(tahun === TAHUN_INI ? BULAN_INI : 12)
    setMuatKe(k => k + 1)
  }

  function exportExcel() {
    if (!data) return
    const rows = baris.map(h => {
      const r: Record<string, unknown> = {
        'Klaster': h.klaster,
        'Peringkat dlm Klaster': h.peringkat ?? '-',
        'SKPD': namaSkpd.get(h.skpdId) ?? h.skpdId,
      }
      for (const a of data.ref.aspek) r[`Skor ${a.nama}`] = h.aspek.find(x => x.kode === a.kode)?.skor?.toFixed(2) ?? 'N/A'
      for (const ind of data.ref.indikator) {
        const hi = h.indikator.find(x => x.kode === ind.kode)!
        r[ind.nama] = hi.nilai.status === 'ada' ? `${hi.nilai.pembilang} / ${hi.nilai.penyebut} (${hi.skor!.toFixed(2)})`
          : hi.nilai.status === 'na' ? 'N/A' : 'Belum'
      }
      r['Bobot Berlaku (%)'] = (h.bobotBerlaku * 100).toFixed(0)
      r['Skor Akhir'] = h.skor?.toFixed(2) ?? '-'
      r['Indeks (1-4)'] = h.indeks?.toFixed(2) ?? '-'
      r['Kategori'] = h.kategori ?? '-'
      r['Catatan'] = h.jumlahBelum > 0 ? `${h.jumlahBelum} indikator belum diisi/dihitung` : (h.layakRanking ? '' : 'Bobot berlaku di bawah ambang')
      return r
    })
    exportToExcel(rows, namaBerkasLaporan({ laporan: 'IPA', periode: tahun, skpd: null, akhiran: [`sd ${NAMA_BULAN[bulan - 1]}`] }), 'IPA')
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Indeks Pengelolaan Aset</h1>
          <p className="text-gray-500 text-sm mt-1">
            5 aspek · 11 indikator · peringkat per klaster · Indeks 1–4
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <PilihTahunBulan tahun={tahun} bulan={bulan} onTahun={t => { setTahun(t); setBulan(t === TAHUN_INI ? BULAN_INI : 12) }} onBulan={setBulan} />
          <button className="btn-secondary" onClick={exportExcel} disabled={!data}>⬇ Export Excel</button>
          {isAdmin && (
            <button className="btn-primary disabled:opacity-60" onClick={hitungSemua} disabled={!data || (progres != null && progres.selesai < progres.total)}>
              ↻ Hitung Ulang Otomatis
            </button>
          )}
        </div>
      </div>

      <PesanError pesan={error} />
      {progres && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-teal/5 border border-teal/20 text-gray-700">
          {progres.selesai < progres.total
            ? <>Menghitung indikator otomatis… {progres.selesai} / {progres.total} SKPD</>
            : <>Selesai menghitung {progres.total} SKPD{progres.gagal.length ? `, ${progres.gagal.length} gagal:` : '.'}</>}
          {progres.gagal.length > 0 && (
            <ul className="mt-1 text-xs text-red-700 list-disc pl-5">{progres.gagal.map(g => <li key={g}>{g}</li>)}</ul>
          )}
        </div>
      )}
      <p className="text-xs text-gray-500 mb-4">
        Indikator otomatis terakhir dihitung: <b>{terakhirHitung ? new Date(terakhirHitung).toLocaleString('id-ID') : 'belum pernah'}</b>
        {!terakhirHitung && isAdmin && ' — tekan "Hitung Ulang Otomatis" untuk mengisi.'}
        {' '}Isian SKPD (TL BPK/Inspektorat) hanya dihitung setelah diverifikasi.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <div className="card p-4 lg:col-span-2 lg:row-span-2 flex flex-col items-center justify-center">
          <GaugeIndeks nilai={gauge.nilai} kategori={gauge.kategori} label={gauge.label} ukuran={220} />
          {gauge.keterangan && <p className="text-xs text-gray-500 mt-2 text-center">{gauge.keterangan}</p>}
        </div>
        {KATEGORI.map(k => (
          <div key={k} className="card p-4 lg:col-span-2">
            <KategoriPill k={k} />
            <p className="text-2xl font-bold text-gray-900 mt-2">{ringkas.perKat[k] ?? 0}</p>
            <p className="text-xs text-gray-500">SKPD</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="p-4 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <div className="flex gap-1">
            <button onClick={() => setKlaster('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${klaster === '' ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'}`}>Semua</button>
            {KLASTER_URUT.map(k => (
              <button key={k} onClick={() => setKlaster(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${klaster === k ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'}`}>
                Klaster {k}
              </button>
            ))}
          </div>
          <input className="select-filter ml-auto w-64" placeholder="Cari SKPD…" value={cari} onChange={e => setCari(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Rank</th>
                <th className="table-th">SKPD</th>
                <th className="table-th">Kl.</th>
                {ASPEK_URUT.map(a => <th key={a} className="table-th text-right">{a}</th>)}
                <th className="table-th text-right" title="Bobot aspek yang benar-benar terhitung">Bobot</th>
                <th className="table-th">Skor</th>
                <th className="table-th text-right">Indeks</th>
                <th className="table-th">Kategori</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Memuat…</td></tr>}
              {data && baris.length === 0 && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Tak ada SKPD yang cocok.</td></tr>}
              {baris.map(h => (
                <tr key={h.skpdId} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-semibold text-gray-900">{h.peringkat ?? '—'}</td>
                  <td className="table-td">
                    <Link href={`/dashboard/ipa/skpd/${h.skpdId}?tahun=${tahun}&bulan=${bulan}`} className="text-teal hover:underline font-medium">
                      {namaSkpd.get(h.skpdId)}
                    </Link>
                    {h.jumlahBelum > 0 && <p className="text-xs text-amber-600">{h.jumlahBelum} indikator belum diisi/dihitung</p>}
                    {h.jumlahBelum === 0 && !h.layakRanking && h.skor != null && <p className="text-xs text-amber-600">Bobot berlaku di bawah ambang</p>}
                  </td>
                  <td className="table-td">{h.klaster}</td>
                  {h.aspek.map(a => (
                    <td key={a.kode} className={`table-td text-right tabular-nums ${a.skor == null ? 'text-gray-300' : ''}`}>
                      {a.skor == null ? 'N/A' : a.skor.toFixed(1)}
                    </td>
                  ))}
                  <td className="table-td text-right tabular-nums">{Math.round(h.bobotBerlaku * 100)}%</td>
                  <td className="table-td w-32">
                    <span className="tabular-nums text-xs">{fmtSkor(h.skor)}</span>
                    <SkorBar skor={h.skor} />
                  </td>
                  <td className="table-td text-right font-semibold tabular-nums">{fmtIndeks(h.indeks)}</td>
                  <td className="table-td"><KategoriPill k={h.kategori} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Indeks = 1 + Skor/100 × 3. Sangat Baik ≥ 3,55 · Baik ≥ 3,10 · Buruk ≥ 2,65 · Sangat Buruk &lt; 2,65.
        Peringkat hanya untuk SKPD yang seluruh indikatornya sudah terisi & bobot berlaku ≥ ambang.
      </p>
    </div>
  )
}
