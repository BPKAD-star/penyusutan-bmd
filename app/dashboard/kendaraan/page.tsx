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
// Pola muat data = GIS Tanah: semua baris di-fetch SEKALI saat mount
// (paginated, tanpa cap), filter SKPD & pencarian selanjutnya INSTAN di client
// tanpa query ulang — dataset Alat Angkutan ~2.200 baris, murah difilter di
// memori. Tidak period-aware (beda dgn Daftar Barang/Penyusutan): ini register
// posisi TERKINI (status='aktif'), bukan laporan per periode.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'

const PREFIX_ALAT_ANGKUTAN = '1.3.2.02.'

type Row = {
  id: string
  nibar: string | null
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
  keterangan: string | null
  skpd_id: number | null
}

// Nama SKPD SENGAJA tidak di-embed (`skpd:skpd_id(nama)`) seperti GIS: embed
// bikin query utama makin berat, padahal tabel `aset` sudah 259rb baris dan
// RLS-nya (fn_aset_pernah_dikelola per baris) sudah jadi beban. Nama SKPD
// diresolve dari map id→nama yang di-fetch sekali dari admin_skpd (ratusan
// baris, murah) — pola yang sama dengan Daftar Barang.
const SELECT_COLS =
  'id,nibar,kode,nama_barang,uraian_barang,merek_tipe,spesifikasi_lainnya,no_polisi,no_bpkb,no_rangka,no_mesin,tahun_pengadaan,tgl_perolehan,nilai_perolehan,kondisi_barang,keterangan,skpd_id'

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
  const [loading, setLoading] = useState(true)
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
    ;(async () => {
      setLoading(true)
      const all: Row[] = []
      for (let from = 0; ; from += 1000) {
        // `error` WAJIB dibaca: kalau query gagal (mis. RLS aset yang berat bikin
        // statement timeout → 500), `data` cuma null dan tanpa ini halaman diam²
        // tampil "tidak ada kendaraan" seolah datanya memang kosong — persis
        // gejala yang bikin bingung di GIS Tanah.
        const { data, error } = await supabase.from('aset')
          .select(SELECT_COLS)
          .like('kode', `${PREFIX_ALAT_ANGKUTAN}%`)
          .eq('status', 'aktif')
          .order('nilai_perolehan', { ascending: false })
          .range(from, from + 999)
        if (error) { setError(error.message); break }
        if (!data || data.length === 0) break
        all.push(...(data as unknown as Row[]))
        if (data.length < 1000) break
      }
      setRows(all)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const namaSkpd = (r: Row) => (r.skpd_id != null && skpdMap[r.skpd_id]) || '-'

  // SATU kotak pencarian untuk semua (keputusan user 2026-07-17 — tanpa pemilih
  // SKPD terpisah): ketik nama SKPD → keluar semua kendaraan di SKPD itu; ketik
  // No. Polisi / No. Rangka / No. Mesin / merek / spesifikasi → keluar yang cocok.
  // Semua dicocokkan sebagai substring (case-insensitive) di satu daftar field.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => [
      namaSkpd(r), r.nama_barang, r.uraian_barang, r.nibar, r.kode, r.merek_tipe,
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
      filtered.map(r => ({
        'Lokasi / SKPD': teks(namaSkpd(r)),
        'Kode Barang': r.kode,
        'NIBAR': teks(r.nibar),
        'Uraian': teks(r.uraian_barang),
        'Nama Barang': teks(r.nama_barang),
        'Merek / Tipe': teks(r.merek_tipe),
        'Spesifikasi': teks(r.spesifikasi_lainnya),
        'Tahun Pengadaan': teks(r.tahun_pengadaan),
        'No. BPKB': teks(r.no_bpkb),
        'No. Polisi': teks(r.no_polisi),
        'No. Rangka': teks(r.no_rangka),
        'No. Mesin': teks(r.no_mesin),
        'Nilai Perolehan': r.nilai_perolehan ?? 0,
        'Kondisi': teks(r.kondisi_barang),
        'Keterangan': teks(r.keterangan),
      })),
      'kendaraan-dinas',
      'Kendaraan',
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kendaraan</h1>
        <p className="text-sm text-gray-600 mt-1">
          Register kendaraan dinas (Alat Angkutan, kode {PREFIX_ALAT_ANGKUTAN}*) — posisi terkini. Cari
          berdasarkan SKPD, No. Polisi, No. Rangka, No. Mesin, atau spesifikasi.
        </p>
      </div>

      <div className="card">
        <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
          placeholder="Cari SKPD / No. Polisi / No. Rangka / No. Mesin / merek / nama / spesifikasi..."
          className="select-filter w-full" />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{angka(stats.jumlah)}</span> kendaraan
            <span className="text-gray-300 mx-2">|</span>
            nilai perolehan <span className="font-semibold text-gray-900">{angka(stats.nilai)}</span>
            {stats.belum > 0 && (
              <>
                <span className="text-gray-300 mx-2">|</span>
                <span className="text-amber-700">{angka(stats.belum)} belum lengkap</span>
              </>
            )}
          </div>
          <button onClick={handleExport} disabled={loading || filtered.length === 0} className="btn-secondary">
            Export Excel
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Memuat data kendaraan...</p>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-rose-700 font-medium">Gagal memuat data kendaraan.</p>
            <p className="text-xs text-gray-500 mt-1">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            {rows.length === 0 ? 'Belum ada data kendaraan.' : 'Tidak ada kendaraan yang cocok dengan pencarian.'}
          </p>
        ) : (
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="table-th">Lokasi / SKPD</th>
                <th className="table-th">Kode Register</th>
                <th className="table-th">Nama Barang</th>
                <th className="table-th">Merek / Tipe</th>
                <th className="table-th text-center">Tahun</th>
                <th className="table-th">No. BPKB</th>
                <th className="table-th">No. Polisi</th>
                <th className="table-th">No. Rangka</th>
                <th className="table-th">No. Mesin</th>
                <th className="table-th text-right">Nilai Perolehan</th>
                <th className="table-th text-center">Kondisi</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const belumLengkap = isiKosong(r.no_polisi) && isiKosong(r.no_rangka) && isiKosong(r.no_mesin)
                return (
                  <tr key={r.id}>
                    <td className="table-td text-xs text-gray-600">{teks(namaSkpd(r))}</td>
                    <td className="table-td text-xs text-gray-600">
                      <div>{r.kode}</div>
                      {r.nibar && <div className="text-[10px] text-gray-400 font-mono">{r.nibar}</div>}
                    </td>
                    <td className="table-td">
                      <div>{teks(r.nama_barang || r.uraian_barang)}</div>
                      {belumLengkap && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700"
                          title="No. Polisi, No. Rangka, dan No. Mesin semuanya kosong — lengkapi lewat Koreksi → Spesifikasi">
                          Data belum lengkap
                        </span>
                      )}
                      {r.spesifikasi_lainnya && !isiKosong(r.spesifikasi_lainnya) && (
                        <div className="text-[11px] text-gray-500 mt-0.5">{r.spesifikasi_lainnya}</div>
                      )}
                    </td>
                    <td className="table-td text-xs text-gray-600">{teks(r.merek_tipe)}</td>
                    <td className="table-td text-xs text-gray-600 text-center">{teks(r.tahun_pengadaan)}</td>
                    <td className="table-td text-xs text-gray-600">{teks(r.no_bpkb)}</td>
                    <td className="table-td text-xs text-gray-600 font-medium">{teks(r.no_polisi)}</td>
                    <td className="table-td text-xs text-gray-600 font-mono">{teks(r.no_rangka)}</td>
                    <td className="table-td text-xs text-gray-600 font-mono">{teks(r.no_mesin)}</td>
                    <td className="table-td text-right text-xs">{angka(r.nilai_perolehan)}</td>
                    <td className="table-td text-xs text-gray-600 text-center">{teks(r.kondisi_barang)}</td>
                    <td className="table-td text-xs text-gray-600">{teks(r.keterangan)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
