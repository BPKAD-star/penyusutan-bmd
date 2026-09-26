'use client'
// Dashboard IPA lima aspek — ranking seluruh SKPD penilaian.
// Angka otomatis dibaca dari snapshot bulanan (`ipa_otomatis`), bukan dihitung
// ulang tiap halaman dibuka: 60 SKPD × 9 indikator terlalu mahal untuk setiap
// kunjungan. Admin memperbaruinya lewat "Hitung Ulang"; waktu hitung terakhir
// selalu ditampilkan supaya angka basi tak terbaca sebagai angka hari ini.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useProfilRole } from '@/components/useProfilRole'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ASPEK_URUT, NAMA_BULAN, type KodeAspek, type KategoriIndeks } from '@/lib/ipa'
import { hitungUlangOtomatis, muatPenilaian, skpdBolehIsi, type DataPenilaian } from '@/lib/ipaData'
import {
  BULAN_INI, KategoriPill, PesanError, PilihTahunBulan, SkorBar, TAHUN_INI, fmtIndeks, fmtSkor,
} from '@/components/ipa/ipaUi'

const KATEGORI: KategoriIndeks[] = ['Sangat Baik', 'Baik', 'Buruk', 'Sangat Buruk']
// Ranking Sangat Baik→Sangat Buruk, dipakai buat sortir kolom Kategori —
// "ascending" di sini artinya urutan performa (terbaik dulu), bukan abjad
// ("Baik" < "Buruk" < "Sangat Baik" secara alfabet tak berguna di sini).
const RANK_KATEGORI: Record<KategoriIndeks, number> = { 'Sangat Baik': 0, 'Baik': 1, Buruk: 2, 'Sangat Buruk': 3 }

// Klik header kolom = sortir gaya Excel: klik pertama ascending, klik lagi
// pada kolom yang sama membalik arah. `null` = urutan bawaan (klaster →
// peringkat dlm klaster → skor desc → nama), sama seperti sebelum kolom ini
// bisa diklik.
type KunciUrut = 'nama' | 'klaster' | 'bobot' | 'skor' | 'indeks' | 'kategori' | KodeAspek

// Label kolom aspek KHUSUS tabel ranking ini — "Akuntabilitas & Tindak
// Lanjut" kepanjangan utk lebar kolom sesempit ini (permintaan user
// 2026-09-26). Nama lengkap dari `ipa_aspek.nama` tetap dipakai apa adanya
// di Capaian SKPD (kartu per-aspek, lebih lega) & Export Excel.
const LABEL_KOLOM_ASPEK: Partial<Record<KodeAspek, string>> = { AKT: 'Akuntabilitas' }

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
  const [urutKunci, setUrutKunci] = useState<KunciUrut | null>(null)
  const [urutArah, setUrutArah] = useState<'asc' | 'desc'>('asc')
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
  const labelAspek = (a: KodeAspek) => LABEL_KOLOM_ASPEK[a] ?? namaAspek.get(a) ?? a
  const bisaBukaSemua = isAdmin || role === 'pengawas'
  const bisaBuka = (skpdId: number) => bisaBukaSemua || (bolehBuka?.has(skpdId) ?? false)
  const terakhirHitung = useMemo(() => {
    const t = (data?.otomatis ?? []).map(o => o.dihitung_at).sort()
    return t[t.length - 1] ?? null
  }, [data])

  function klikUrut(kunci: KunciUrut) {
    if (urutKunci === kunci) setUrutArah(a => (a === 'asc' ? 'desc' : 'asc'))
    else { setUrutKunci(kunci); setUrutArah('asc') }
  }

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase()
    const daftar = data?.hasil ?? []
    const byNama = (a: (typeof daftar)[number], b: (typeof daftar)[number]) =>
      (namaSkpd.get(a.skpdId) ?? '').localeCompare(namaSkpd.get(b.skpdId) ?? '')
    // Nilai mentah kolom yang sedang jadi kunci sortir — null = tak bisa
    // dinilai (N/A / belum dihitung), SELALU jatuh ke bawah apa pun arahnya
    // (pola sel kosong Excel), bukan disamakan dgn 0 yg justru berarti "nilai
    // terendah yg sungguh terukur".
    const nilai = (h: (typeof daftar)[number], k: KunciUrut): number | string | null => {
      if (k === 'nama') return namaSkpd.get(h.skpdId) ?? ''
      if (k === 'klaster') return h.klaster
      if (k === 'bobot') return h.bobotBerlaku
      if (k === 'skor') return h.skor
      if (k === 'indeks') return h.indeks
      if (k === 'kategori') return h.kategori == null ? null : RANK_KATEGORI[h.kategori]
      return h.aspek.find(x => x.kode === k)?.skor ?? null
    }
    const filtered = daftar.filter(h => !q || (namaSkpd.get(h.skpdId) ?? '').toLowerCase().includes(q))
    if (urutKunci == null) {
      // Bawaan (sebelum kolom bisa diklik): klaster → peringkat dlm klaster → skor desc → nama.
      return filtered.sort((a, b) => a.klaster.localeCompare(b.klaster)
        || (a.peringkat ?? 9999) - (b.peringkat ?? 9999)
        || (b.skor ?? -1) - (a.skor ?? -1)
        || byNama(a, b))
    }
    const arah = urutArah === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const va = nilai(a, urutKunci)
      const vb = nilai(b, urutKunci)
      if (va == null && vb == null) return byNama(a, b)
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
      return arah * cmp || byNama(a, b)
    })
  }, [data, cari, namaSkpd, urutKunci, urutArah])

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

  // Header kolom yang bisa diklik utk sortir — panah ▲/▼ hanya di kolom aktif.
  function Th({ kunci, children, align, title }: { kunci: KunciUrut; children: ReactNode; align?: 'right'; title?: string }) {
    const aktif = urutKunci === kunci
    return (
      <th className={`table-th cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
        title={title} onClick={() => klikUrut(kunci)}>
        {children}{aktif ? (urutArah === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Indeks Pengelolaan Aset</h1>
          <p className="text-gray-500 text-sm mt-1">
            5 aspek · 11 indikator · Indeks 1–4 · klik header kolom utk mengurutkan
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
          <input className="select-filter ml-auto w-64" placeholder="Cari SKPD…" value={cari} onChange={e => setCari(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th" title="Peringkat dalam klaster (urutan bawaan)">Rank</th>
                <Th kunci="nama">SKPD</Th>
                <Th kunci="klaster">Kl.</Th>
                {ASPEK_URUT.map(a => <Th key={a} kunci={a} align="right">{labelAspek(a)}</Th>)}
                <Th kunci="bobot" align="right" title="Bobot aspek yang benar-benar terhitung">Bobot</Th>
                <Th kunci="skor">Skor</Th>
                <Th kunci="indeks" align="right">Indeks</Th>
                <Th kunci="kategori">Kategori</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Memuat…</td></tr>}
              {data && baris.length === 0 && <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10">Tak ada SKPD yang cocok.</td></tr>}
              {baris.map(h => (
                <tr key={h.skpdId} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="table-td font-semibold text-gray-900">{h.peringkat ?? '—'}</td>
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
                    <td key={a.kode} className={`table-td text-right tabular-nums ${a.skor == null ? 'text-gray-300' : ''} ${urutKunci === a.kode ? 'font-semibold bg-teal/5' : ''}`}>
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
        Kolom "Rank" tetap peringkat dalam klaster — tak ikut berubah walau tabelnya diurutkan kolom lain.
      </p>
    </div>
  )
}
