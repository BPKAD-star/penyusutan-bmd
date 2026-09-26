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
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ASPEK_URUT, KLASTER_URUT, NAMA_BULAN, type KodeAspek, type KategoriIndeks, type KodeKlaster } from '@/lib/ipa'
import { hitungUlangOtomatis, muatPenilaian, skpdBolehIsi, type DataPenilaian } from '@/lib/ipaData'
import {
  BULAN_INI, KategoriPill, PesanError, PilihTahunBulan, SkorBar, TAHUN_INI, fmtIndeks, fmtSkor,
} from '@/components/ipa/ipaUi'

const KATEGORI: KategoriIndeks[] = ['Sangat Baik', 'Baik', 'Buruk', 'Sangat Buruk']
// 'klaster' = bawaan (peringkat per klaster); 'abjad' = nama SKPD A→Z;
// kode aspek = skor aspek itu tertinggi dulu — jawaban langsung atas
// "SKPD mana paling tinggi di aspek X" tanpa perlu menyisir manual.
type Urutan = 'klaster' | 'abjad' | KodeAspek

export default function DashboardIpa() {
  const supabase = createClient()
  const { role } = useProfilRole()
  const isAdmin = role === 'admin'
  // Admin & pengawas melihat SEMUA SKPD (pengawas view-only lintas SKPD —
  // migrasi 20260714_04); pengurus_barang/pengurus_pembantu cuma SKPD dalam
  // `fn_my_skpd_scope()`-nya sendiri, sama gerbang yg dipakai CapaianSkpdIpa
  // utk menentukan siapa boleh MEMBUKA rincian. Nama SKPD di luar itu jadi
  // teks biasa (bukan link) — mengklik cuma akan dilempar balik ke SKPD
  // sendiri disertai catatan, jadi lebih jujur kalau dari awal tak terlihat
  // bisa diklik.
  const [bolehBuka, setBolehBuka] = useState<Set<number> | null>(null)
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [bulan, setBulan] = useState(BULAN_INI)
  const [klaster, setKlaster] = useState<KodeKlaster | ''>('')
  const [urutan, setUrutan] = useState<Urutan>('klaster')
  const [cari, setCari] = useState('')
  const [muatKe, setMuatKe] = useState(0)
  const [progres, setProgres] = useState<{ selesai: number; total: number; gagal: string[] } | null>(null)
  const { data, loading, error, run } = useAsyncData<DataPenilaian>()

  useEffect(() => { void run(() => muatPenilaian(supabase, tahun, bulan)) }, [tahun, bulan, muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || !role) return
    let alive = true
    ;(async () => {
      try {
        const list = await skpdBolehIsi(supabase, data.ref.skpd, role)
        if (alive) setBolehBuka(new Set(list.map(s => s.skpd_id)))
      } catch {
        // Fail-closed: gagal membaca cakupan → jangan tampilkan sbg link sama sekali.
        if (alive) setBolehBuka(new Set())
      }
    })()
    return () => { alive = false }
  }, [data, role, supabase])

  const namaSkpd = useMemo(() => new Map((data?.ref.skpd ?? []).map(s => [s.skpd_id, s.nama])), [data])
  const namaAspek = useMemo(() => new Map((data?.ref.aspek ?? []).map(a => [a.kode, a.nama])), [data])
  const bisaBukaSemua = isAdmin || role === 'pengawas'
  const bisaBuka = (skpdId: number) => bisaBukaSemua || (bolehBuka?.has(skpdId) ?? false)
  const terakhirHitung = useMemo(() => {
    const t = (data?.otomatis ?? []).map(o => o.dihitung_at).sort()
    return t[t.length - 1] ?? null
  }, [data])

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase()
    const daftar = data?.hasil ?? []
    const skor = (h: (typeof daftar)[number]) => h.aspek.find(x => x.kode === urutan)?.skor ?? null
    return daftar
      .filter(h => !klaster || h.klaster === klaster)
      .filter(h => !q || (namaSkpd.get(h.skpdId) ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (urutan === 'abjad') return (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? '')
        if (urutan !== 'klaster') {
          const sa = skor(a)
          const sb = skor(b)
          if (sa == null && sb == null) return (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? '')
          if (sa == null) return 1 // N/A selalu di bawah — bukan "nol", cuma tak bisa dinilai
          if (sb == null) return -1
          return sb - sa || (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? '')
        }
        return a.klaster.localeCompare(b.klaster)
          || (a.peringkat ?? 9999) - (b.peringkat ?? 9999)
          || (b.skor ?? -1) - (a.skor ?? -1)
          || (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? '')
      })
  }, [data, klaster, cari, namaSkpd, urutan])

  const ringkas = useMemo(() => {
    const ber = (data?.hasil ?? []).filter(h => h.skor != null)
    const rata = ber.length ? ber.reduce((s, h) => s + h.indeks!, 0) / ber.length : null
    const perKat = Object.fromEntries(KATEGORI.map(k => [k, ber.filter(h => h.kategori === k).length])) as Record<KategoriIndeks, number>
    const lengkap = (data?.hasil ?? []).filter(h => h.layakRanking).length
    return { rata, perKat, lengkap, total: data?.hasil.length ?? 0 }
  }, [data])

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
        <div className="card p-4 lg:col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Rata-rata Indeks Kabupaten</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{fmtIndeks(ringkas.rata)}</p>
          <p className="text-xs text-gray-500 mt-1">{ringkas.lengkap} dari {ringkas.total} SKPD lengkap & ikut ranking</p>
        </div>
        {KATEGORI.map(k => (
          <div key={k} className="card p-4">
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
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Urutkan
            <select className="select-filter" value={urutan} onChange={e => setUrutan(e.target.value as Urutan)}>
              <option value="klaster">Peringkat per Klaster (bawaan)</option>
              <option value="abjad">Abjad Nama SKPD (A–Z)</option>
              <optgroup label="Skor tertinggi per aspek">
                {ASPEK_URUT.map(a => <option key={a} value={a}>{namaAspek.get(a) ?? a}</option>)}
              </optgroup>
            </select>
          </label>
          <input className="select-filter ml-auto w-64" placeholder="Cari SKPD…" value={cari} onChange={e => setCari(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th" title={urutan === 'klaster' ? 'Peringkat dalam klaster' : 'Nomor urut tampilan saat ini'}>
                  {urutan === 'klaster' ? 'Rank' : 'No.'}
                </th>
                <th className="table-th">SKPD</th>
                <th className="table-th">Kl.</th>
                {ASPEK_URUT.map(a => <th key={a} className="table-th text-right whitespace-nowrap">{namaAspek.get(a) ?? a}</th>)}
                <th className="table-th text-right" title="Bobot aspek yang benar-benar terhitung">Bobot</th>
                <th className="table-th">Skor</th>
                <th className="table-th text-right">Indeks</th>
                <th className="table-th">Kategori</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Memuat…</td></tr>}
              {data && baris.length === 0 && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Tak ada SKPD yang cocok.</td></tr>}
              {baris.map((h, i) => (
                <tr key={h.skpdId} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-semibold text-gray-900">{urutan === 'klaster' ? (h.peringkat ?? '—') : i + 1}</td>
                  <td className="table-td">
                    {bisaBuka(h.skpdId)
                      ? (
                        <Link href={`/dashboard/ipa/capaian?skpd=${h.skpdId}&tahun=${tahun}&bulan=${bulan}`} className="text-teal hover:underline font-medium">
                          {namaSkpd.get(h.skpdId)}
                        </Link>
                        )
                      : (
                        <span className="font-medium text-gray-700" title="Rincian SKPD lain hanya bisa dibuka Pengelola Barang & pengawas">
                          {namaSkpd.get(h.skpdId)}
                        </span>
                        )}
                    {h.jumlahBelum > 0 && <p className="text-xs text-amber-600">{h.jumlahBelum} indikator belum diisi/dihitung</p>}
                    {h.jumlahBelum === 0 && !h.layakRanking && h.skor != null && <p className="text-xs text-amber-600">Bobot berlaku di bawah ambang</p>}
                  </td>
                  <td className="table-td">{h.klaster}</td>
                  {h.aspek.map(a => (
                    <td key={a.kode} className={`table-td text-right tabular-nums ${a.skor == null ? 'text-gray-300' : ''} ${urutan === a.kode ? 'font-semibold bg-teal/5' : ''}`}>
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
