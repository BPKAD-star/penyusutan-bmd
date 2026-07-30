'use client'
// Kendaraan — register kendaraan dinas (golongan Alat Angkutan 1.3.2.02*),
// terinspirasi menu Utilities → Kendaraan di e-SIMBADA. MURNI BACA: tidak ada
// tulis ke aset/ledger sama sekali. Untuk mengubah identitas kendaraan (nopol,
// no rangka/mesin, BPKB, merek/tipe) tetap lewat menu Koreksi → Spesifikasi,
// supaya tidak ada dua pintu edit untuk data yang sama.
//
// WHITELIST prefix 1.3.2.02 (Alat Angkutan) — bukan seluruh 1.3.2 Peralatan &
// Mesin. Yang belum punya No. Polisi TETAP ditampilkan (keputusan user
// 2026-07-17): justru itu gunanya, biar ketahuan mana yang datanya belum
// lengkap dan bisa ditelusuri untuk dilengkapi. Badge "Data belum lengkap"
// menandai baris tanpa nopol/rangka/mesin.
//
// Kolom mengikuti field yang BENAR-BENAR ada di DB. Kolom e-SIMBADA yang belum
// ada padanannya (No. STNK, Tgl. STNK, Bahan Bakar, Tahun Pembuatan, Nama
// Pengguna) SENGAJA tidak dibuat dulu (keputusan user 2026-07-17) — menambah
// kolom sekarang cuma bikin kolom kosong di seluruh baris. Kalau nanti datanya
// ada: tambah kolom di `aset` + daftarkan di TEMPLATE_PERALATAN_MESIN
// (lib/asetFields.ts) supaya bisa diisi lewat Koreksi → Spesifikasi, baru
// tampilkan di sini.
//
// Muat data (2026-07-20, gaya Daftar Barang): TIDAK auto-fetch saat mount —
// baru narik seluruh baris Alat Angkutan (~2.200, paginated tanpa cap) begitu
// user klik "Tampilkan" (atau Enter di kotak cari) pertama kali. Sesudah termuat,
// pencarian berikutnya INSTAN di client tanpa query ulang. Tidak period-aware
// (beda dgn Daftar Barang/Penyusutan): ini register posisi TERKINI (status='aktif').
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { bergeserDariNibar } from '@/lib/kodeRegister'

const PREFIX_ALAT_ANGKUTAN = '1.3.2.02.'

type Row = {
  id: string
  nibar: string | null
  // Kode register 45 digit — DIBACA dari kolom (diterbitkan & dibekukan trigger
  // trg_aset_kode_register), tak pernah dihitung di layar.
  kode_register: string | null
  kode: string
  nama_barang: string | null
  uraian_barang: string | null
  merek_tipe: string | null
  spesifikasi_lainnya: string | null
  no_polisi: string | null
  no_bpkb: string | null
  no_rangka: string | null
  no_mesin: string | null
  tahun_pengadaan: number | null
  tgl_perolehan: string | null
  nilai_perolehan: number
  kondisi_barang: string | null
  penggunaan_pengamanan: string | null   // kolom berlabel "Penggunaan" (lihat lib/asetFields.ts)
  keterangan: string | null
  skpd_id: number | null
}

// Nama SKPD SENGAJA tidak di-embed (`skpd:skpd_id(nama)`) seperti GIS: embed
// bikin query utama makin berat, padahal tabel `aset` sudah 259rb baris dan
// RLS-nya (fn_aset_pernah_dikelola per baris) sudah jadi beban. Nama SKPD
// diresolve dari map id→nama yang di-fetch sekali dari admin_skpd (ratusan
// baris, murah) — pola yang sama dengan Daftar Barang.
const SELECT_COLS =
  'id,nibar,kode_register,kode,nama_barang,uraian_barang,merek_tipe,spesifikasi_lainnya,no_polisi,no_bpkb,no_rangka,no_mesin,tahun_pengadaan,tgl_perolehan,nilai_perolehan,kondisi_barang,penggunaan_pengamanan,keterangan,skpd_id'

// Angka polos bergaya id-ID tanpa "Rp" — sama dengan Daftar Barang (enak di-copas ke Excel).
const angka = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)
const teks = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v).trim()
  return s === '' || s === '-' ? '-' : s
}
const isiKosong = (v: string | null) => {
  const s = (v || '').trim()
  return s === '' || s === '-'
}

export default function KendaraanPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [skpdMap, setSkpdMap] = useState<Record<number, string>>({})
  const [applied, setApplied] = useState(false) // gerbang "Tampilkan" — belum ada tabel sebelum diklik
  const [loaded, setLoaded] = useState(false)    // sudah pernah fetch rows sekali
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const map: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data) map[s.id] = s.nama
        if (data.length < 1000) break
      }
      setSkpdMap(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRows() {
    setLoading(true)
    setError(null)
    // Scope SKPD operator (subtree) utk mempercepat — bukan gerbang keamanan,
    // RLS tetap penjaga akhir. Non-admin disuntik .in('skpd_id', ...) supaya
    // idx_aset_skpd kepakai; tanpa ini `kode LIKE` tak bisa jadi index-cond di
    // bawah RLS (operator ~~ tak leakproof) → Seq Scan 400rb+ baris → statement
    // timeout (500) buat pengurus_barang. Admin → null → tanpa filter.
    // `error` RPC ini WAJIB dibaca — lihat catatan sama di GIS Tanah: scope null
    // diam-diam bikin query jalan tanpa filter skpd_id → Seq Scan → timeout,
    // tanpa jejak penyebabnya.
    const { data: scope, error: scopeErr } = await supabase.rpc('fn_my_skpd_scope')
    if (scopeErr) {
      setError(`Gagal membaca scope SKPD (fn_my_skpd_scope): ${scopeErr.message}`)
      setLoaded(true)
      setLoading(false)
      return
    }
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      // `error` WAJIB dibaca: kalau query gagal (mis. RLS aset yang berat bikin
      // statement timeout → 500), `data` cuma null dan tanpa ini halaman diam²
      // tampil "tidak ada kendaraan" seolah datanya memang kosong — persis
      // gejala yang bikin bingung di GIS Tanah.
      let q = supabase.from('aset')
        .select(SELECT_COLS)
        .like('kode', `${PREFIX_ALAT_ANGKUTAN}%`)
        .eq('status', 'aktif')
      if (Array.isArray(scope) && scope.length) q = q.in('skpd_id', scope)
      // ⚠️ `.order('id')` itu PEMECAH SERI, jangan dicopot: barisnya ditarik
      // halaman-demi-halaman pakai `.range()` dan `nilai_perolehan` banyak
      // kembarnya, jadi dgn urutan yang tak total baris kembar tak dijamin
      // jatuh di halaman yang sama tiap query → ada yang terlewat & ada yang
      // dobel TANPA SUARA. Sama dgn yang dipasang di Daftar Barang & Penyusutan.
      const { data, error } = await q
        .order('nilai_perolehan', { ascending: false })
        .order('id')
        .range(from, from + 999)
      if (error) { setError(error.message); break }
      if (!data || data.length === 0) break
      all.push(...(data as unknown as Row[]))
      if (data.length < 1000) break
    }
    setRows(all)
    setLoaded(true)
    setLoading(false)
  }

  function handleTampilkan() {
    setApplied(true)
    if (!loaded) fetchRows()
  }

  const namaSkpd = (r: Row) => (r.skpd_id != null && skpdMap[r.skpd_id]) || '-'

  // SATU kotak pencarian untuk semua (keputusan user 2026-07-17 — tanpa pemilih
  // SKPD terpisah): ketik nama SKPD → keluar semua kendaraan di SKPD itu; ketik
  // No. Polisi / No. Rangka / No. Mesin / merek / spesifikasi → keluar yang cocok.
  // Semua dicocokkan sebagai substring (case-insensitive) di satu daftar field.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => [
      namaSkpd(r), r.nama_barang, r.uraian_barang, r.nibar, r.kode_register, r.kode, r.merek_tipe,
      r.spesifikasi_lainnya, r.no_polisi, r.no_rangka, r.no_mesin, r.no_bpkb, r.keterangan,
    ].some(v => v != null && String(v).toLowerCase().includes(q)))
  }, [rows, search, skpdMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let nilai = 0, lengkap = 0
    for (const r of filtered) {
      nilai += r.nilai_perolehan || 0
      if (!isiKosong(r.no_polisi) || !isiKosong(r.no_rangka) || !isiKosong(r.no_mesin)) lengkap++
    }
    return { jumlah: filtered.length, nilai, lengkap, belum: filtered.length - lengkap }
  }, [filtered])

  function handleExport() {
    exportToExcel(
      // Urutan kolom mengikuti layar (2026-07-30). Yang di layar ditumpuk
      // (kode+uraian, NIBAR+nama) di sini jadi kolom sendiri-sendiri — Excel tak
      // punya "baris kedua" dalam satu sel, dan dipisah justru bisa disaring.
      // Spesifikasi Lainnya SENGAJA tetap ikut walau sudah tak di layar: pola
      // lama repo ini, berkas export memang lebih lengkap dari tampilan.
      filtered.map(r => ({
        'SKPD': teks(namaSkpd(r)),
        'Kode Barang': r.kode,
        'Uraian Barang': teks(r.uraian_barang),
        'Nama Barang': teks(r.nama_barang),
        'NIBAR': teks(r.nibar),
        // String, bukan angka: 45 digit sbg numerik jadi notasi ilmiah di Excel.
        'Kode Register': teks(r.kode_register),
        'Merek / Tipe': teks(r.merek_tipe),
        'Spesifikasi Lainnya': teks(r.spesifikasi_lainnya),
        'Tahun Pengadaan': teks(r.tahun_pengadaan),
        'No. Polisi': teks(r.no_polisi),
        'No. Rangka': teks(r.no_rangka),
        'No. Mesin': teks(r.no_mesin),
        'No. BPKB': teks(r.no_bpkb),
        'Nilai Perolehan': r.nilai_perolehan ?? 0,
        'Kondisi': teks(r.kondisi_barang),
        'Penggunaan': teks(r.penggunaan_pengamanan),
        'Keterangan': teks(r.keterangan),
      })),
      'kendaraan-dinas',
      'Kendaraan',
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kendaraan</h1>
        <p className="text-gray-500 text-sm mt-1">
          Register kendaraan dinas (Alat Angkutan, kode {PREFIX_ALAT_ANGKUTAN}*) — posisi terkini.
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Cari kendaraan</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="SKPD / No. Polisi / No. Rangka / No. Mesin / merek / nama / spesifikasi..."
            className="select-filter flex-1"
            onKeyDown={e => { if (e.key === 'Enter') handleTampilkan() }} />
          <button className="btn-primary" onClick={handleTampilkan} disabled={loading}>
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Kosongkan pencarian lalu klik Tampilkan untuk melihat semua kendaraan, atau ketik dulu untuk mempersempit.
        </p>
      </div>

      {!applied ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Ketik pencarian (opsional) lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {loading ? 'Memuat...' : (
                <>
                  <span className="font-semibold text-gray-900">{angka(stats.jumlah)}</span> kendaraan
                  <span className="text-gray-300 mx-2">·</span>
                  nilai perolehan <span className="font-semibold text-gray-900">{angka(stats.nilai)}</span>
                  {stats.belum > 0 && (
                    <>
                      <span className="text-gray-300 mx-2">·</span>
                      <span className="text-amber-700">{angka(stats.belum)} belum lengkap</span>
                    </>
                  )}
                </>
              )}
            </span>
            <button onClick={handleExport} disabled={loading || filtered.length === 0} className="btn-secondary text-xs">
              Export Excel
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Memuat data kendaraan...</div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-sm text-rose-700 font-medium">Gagal memuat data kendaraan.</p>
              <p className="text-xs text-gray-500 mt-1">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {rows.length === 0 ? 'Belum ada data kendaraan.' : 'Tidak ada kendaraan yang cocok dengan pencarian.'}
            </div>
          ) : (
            // Kolom identitas (kode, NIBAR, nopol, rangka, mesin, nilai) di-nowrap
            // supaya tidak terpotong jadi 2 baris; tabel dibiarkan melebar dan
            // digeser lewat scroll horizontal — lebih terbaca daripada dipaksa muat.
            // ⚠️ TIDAK ADA `truncate` di tabel ini (permintaan user 2026-07-30:
            // "jangan kepotong informasinya"). Dulu NIBAR, spesifikasi, &
            // keterangan dipotong elipsis dgn `max-w` — isinya cuma bisa dilihat
            // lewat tooltip, yang tak kebaca kalau lagi ditelusuri cepat & hilang
            // sama sekali kalau halaman ini dicetak. Teks panjang MEMBUNGKUS
            // (wrap), tak pernah dipangkas. Kalau nanti tergoda memasang
            // `truncate` lagi biar rapi, jangan.
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th whitespace-nowrap">SKPD</th>
                    <th className="table-th whitespace-nowrap">Kode Barang</th>
                    <th className="table-th whitespace-nowrap">Nama Barang</th>
                    <th className="table-th whitespace-nowrap">Merek / Tipe</th>
                    <th className="table-th whitespace-nowrap text-center">Tahun</th>
                    <th className="table-th whitespace-nowrap">No. Polisi</th>
                    <th className="table-th whitespace-nowrap">No. Rangka</th>
                    <th className="table-th whitespace-nowrap">No. Mesin</th>
                    <th className="table-th whitespace-nowrap">No. BPKB</th>
                    <th className="table-th whitespace-nowrap text-right">Nilai Perolehan</th>
                    <th className="table-th whitespace-nowrap text-center">Kondisi</th>
                    <th className="table-th whitespace-nowrap">Penggunaan</th>
                    <th className="table-th whitespace-nowrap">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(r => {
                    const belumLengkap = isiKosong(r.no_polisi) && isiKosong(r.no_rangka) && isiKosong(r.no_mesin)
                    const bergeser = bergeserDariNibar(r.nibar, r.kode_register)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60 align-top">
                        <td className="table-td text-xs text-gray-600 min-w-[150px]">{teks(namaSkpd(r))}</td>
                        {/* Kode barang + uraian baku kodefikasi ditumpuk (pola
                            Daftar Barang). Uraian dari `aset.uraian_barang` —
                            di halaman ini memang salinan yang tersimpan, bukan
                            lookup ke admin_kodefikasi_bmd spt Daftar Barang,
                            karena menu ini murni baca & tak boleh nambah query. */}
                        <td className="table-td text-xs text-gray-600 min-w-[150px]">
                          <div className="whitespace-nowrap">{r.kode}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{teks(r.uraian_barang)}</div>
                        </td>
                        {/* Nama barang · NIBAR · kode register — susunan & penanda
                            ⚠ kembar dgn Daftar Barang & Penyusutan (`bergeser === null`
                            = NIBAR warisan e-BMD yang susunannya beda, sengaja TIDAK
                            ditandai apa pun). Dua nomornya di-nowrap: 45 digit yang
                            membungkus di tengah tak terbaca sbg satu nomor. */}
                        <td className="table-td text-xs min-w-[200px]">
                          <div className="text-gray-800 font-medium">{teks(r.nama_barang)}</div>
                          <div className="text-gray-400 mt-0.5 whitespace-nowrap">{teks(r.nibar)}</div>
                          <div className={`text-[11px] mt-0.5 whitespace-nowrap ${bergeser ? 'text-amber-600 font-medium' : 'text-gray-300'}`}
                            title={bergeser
                              ? 'Kode register: posisi barang ini sudah bergeser dari NIBAR-nya (pernah pindah unit / reklas)'
                              : 'Kode register (posisi terakhir barang)'}>
                            {r.kode_register ? `REG ${r.kode_register}${bergeser ? ' ⚠' : ''}` : 'REG —'}
                          </div>
                          {belumLengkap && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 whitespace-nowrap"
                              title="No. Polisi, No. Rangka, dan No. Mesin semuanya kosong — lengkapi lewat Koreksi → Spesifikasi">
                              Data belum lengkap
                            </span>
                          )}
                        </td>
                        <td className="table-td text-xs text-gray-600 min-w-[120px]">{teks(r.merek_tipe)}</td>
                        <td className="table-td text-xs text-gray-600 text-center whitespace-nowrap">{teks(r.tahun_pengadaan)}</td>
                        <td className="table-td text-xs text-gray-800 font-medium whitespace-nowrap">{teks(r.no_polisi)}</td>
                        <td className="table-td text-xs text-gray-600 whitespace-nowrap">{teks(r.no_rangka)}</td>
                        <td className="table-td text-xs text-gray-600 whitespace-nowrap">{teks(r.no_mesin)}</td>
                        <td className="table-td text-xs text-gray-600 whitespace-nowrap">{teks(r.no_bpkb)}</td>
                        <td className="table-td text-right text-xs whitespace-nowrap tabular-nums">{angka(r.nilai_perolehan)}</td>
                        <td className="table-td text-xs text-gray-600 text-center whitespace-nowrap">{teks(r.kondisi_barang)}</td>
                        <td className="table-td text-xs text-gray-600 min-w-[120px]">{teks(r.penggunaan_pengamanan)}</td>
                        <td className="table-td text-xs text-gray-600 min-w-[160px]">{teks(r.keterangan)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
