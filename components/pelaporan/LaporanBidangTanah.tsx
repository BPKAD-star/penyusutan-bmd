'use client'
// Daftar Bidang Tanah — daftar SEMUA bidang (aset_bidang_tanah) untuk DILIHAT &
// DIUNDUH, TANPA kemampuan ubah (permintaan user 2026-09-11: "fungsinya cuman
// ngelihat daftar bidang aja"). Pengerjaan (tambah/ubah/hapus bidang) TETAP di
// menu GIS Tanah (app/dashboard/gis) — halaman itu satu-satunya penulis
// aset_bidang_tanah, di sini murni baca.
//
// Ditaruh di Pelaporan, BUKAN dijadikan sub-menu GIS Tanah: polanya sudah ada
// presedennya — KIR (menu kerja) & Pelaporan → KIR (daftar + Export) sudah
// lebih dulu memisahkan "tempat mengerjakan" dari "tempat melihat & mengunduh
// hasilnya". Halaman ini mengulang pola yang sama utk Tanah.
//
// Cakupan (permintaan user, pola `lockToOperator` yg sudah dipakai LaporanKir
// dkk): pengurus barang → SKPD dia (+ turunannya); admin pemda → se-kabupaten
// (kosongkan filter). RLS `abt_select`/`aset_select` tetap penjaga akhir; ini
// murni UX supaya operator non-admin tak melihat SKPD lain.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import SkpdCombobox from '@/components/SkpdCombobox'

type AsetRow = { id: string; nibar: string | null; kode: string; nama_barang: string | null; skpd_id: number | null; skpd: { nama: string } | null }
type Bidang = {
  id: string; aset_id: string; nama_bidang: string | null; luas: number | null; jenis_hak: string | null
  nomor_dokumen_kepemilikan: string | null; nama_dokumen_kepemilikan: string | null; tanggal_dokumen_kepemilikan: string | null
  tanggal_berakhir_hak: string | null; alamat_detail: string | null; latitude: number | null; longitude: number | null
  sertifikat_path: string | null; keterangan: string | null
}
type Row = Bidang & { namaTanah: string; nibar: string | null; kode: string; skpdNama: string }

const ASET_COLS = 'id,nibar,kode,nama_barang,skpd_id,skpd:skpd_id(nama)'
const BIDANG_COLS = 'id,aset_id,nama_bidang,luas,jenis_hak,nomor_dokumen_kepemilikan,nama_dokumen_kepemilikan,tanggal_dokumen_kepemilikan,tanggal_berakhir_hak,alamat_detail,latitude,longitude,sertifikat_path,keterangan'

const fmtTgl = (s: string | null) => s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
// TANPA suffix "m²" — dipakai di sel tabel yang headernya sudah berjudul
// "Luas (m²)" (pola sama dgn KelolaBidangPanel). Kartu ringkasan menambahkan
// unitnya sendiri di teksnya.
const fmtLuas = (v: number | null) => v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)

export default function LaporanBidangTanah() {
  const supabase = createClient()
  const namaSkpd = useNamaSkpd()
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [totalRegister, setTotalRegister] = useState(0)
  const [registerBerbidang, setRegisterBerbidang] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    // Register Tanah dalam scope — keyset (`.range()` + pemecah seri `id`),
    // pola & alasan SAMA PERSIS dgn app/dashboard/gis/page.tsx: banyak nama
    // tanah kembar (2.733 tanah aktif cuma 2.326 nama unik, CLAUDE.md), jadi
    // tanpa pemecah seri baris kembar bisa terlewat/dobel diam-diam begitu
    // jumlahnya >1000.
    const aset: AsetRow[] = []
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('aset').select(ASET_COLS).like('kode', '1.3.1.%').eq('status', 'aktif')
      if (descIds) q = q.in('skpd_id', descIds)
      const { data, error: e } = await q.order('nama_barang', { ascending: true }).order('id').range(from, from + 999)
      if (e) { setError(`Gagal membaca register Tanah: ${e.message}`); setLoading(false); return }
      if (!data || data.length === 0) break
      aset.push(...(data as unknown as AsetRow[]))
      if (data.length < 1000) break
    }
    const asetMap = new Map(aset.map(a => [a.id, a]))

    // Bidang ditarik SEKALI (keyset by id) lalu disaring ke register dlm scope
    // — pola & alasan SAMA dgn GIS Tanah: policy `abt_select` sudah membatasi
    // lewat SKPD induk asetnya, jadi menariknya utuh lebih murah daripada
    // `.in('aset_id', ...)` per-batch, dan hasilnya identik (baris di luar
    // scope cuma dibuang di `asetMap.get` di bawah, bukan ikut ditampilkan).
    const out: Row[] = []
    const registerDenganBidang = new Set<string>()
    let terakhir = '00000000-0000-0000-0000-000000000000'
    for (;;) {
      const { data, error: e } = await supabase.from('aset_bidang_tanah')
        .select(BIDANG_COLS).gt('id', terakhir).order('id', { ascending: true }).limit(1000)
      if (e) { setError(`Gagal membaca bidang tanah: ${e.message}`); setLoading(false); return }
      if (!data || data.length === 0) break
      const batch = data as unknown as Bidang[]
      for (const b of batch) {
        const a = asetMap.get(b.aset_id)
        if (!a) continue // di luar scope SKPD terpilih, atau induknya sudah tak aktif
        registerDenganBidang.add(a.id)
        out.push({ ...b, namaTanah: a.nama_barang || '-', nibar: a.nibar, kode: a.kode, skpdNama: a.skpd?.nama || '-' })
      }
      terakhir = batch[batch.length - 1].id
      if (batch.length < 1000) break
    }
    out.sort((x, y) => x.skpdNama.localeCompare(y.skpdNama) || x.namaTanah.localeCompare(y.namaTanah) || (x.nama_bidang || '').localeCompare(y.nama_bidang || ''))
    setRows(out)
    setTotalRegister(aset.length)
    setRegisterBerbidang(registerDenganBidang.size)
    setLoading(false)
  }, [descIds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function lihatSertifikat(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const q = search.trim().toLowerCase()
  const shown = q
    ? rows.filter(r => r.namaTanah.toLowerCase().includes(q) || (r.nibar || '').toLowerCase().includes(q)
        || r.skpdNama.toLowerCase().includes(q) || (r.nama_bidang || '').toLowerCase().includes(q))
    : rows

  const nLuas = shown.filter(r => r.luas != null).length
  const luasTotal = shown.reduce((s, r) => s + (r.luas || 0), 0)

  async function handleExport() {
    setExporting(true)
    try {
      const baris = shown.map(r => ({
        'SKPD': r.skpdNama, 'Nama Tanah': r.namaTanah, 'NIBAR': r.nibar || '-', 'Kode Barang': r.kode,
        'Nama Bidang': r.nama_bidang || '-', 'Jenis Hak': r.jenis_hak || '-',
        'Nomor Dokumen': r.nomor_dokumen_kepemilikan || '-', 'Nama Dokumen': r.nama_dokumen_kepemilikan || '-',
        'Tanggal Terbit': fmtTgl(r.tanggal_dokumen_kepemilikan), 'Tanggal Berakhir Hak': fmtTgl(r.tanggal_berakhir_hak),
        'Luas (m²)': r.luas ?? '-', 'Alamat / Lokasi Bidang': r.alamat_detail || '-',
        'Latitude': r.latitude ?? '-', 'Longitude': r.longitude ?? '-',
        'Sertifikat': r.sertifikat_path ? 'Ada' : 'Tidak ada', 'Keterangan': r.keterangan || '-',
      }))
      // Tanpa `periode`: posisi TERKINI, bukan rentang periode — pola sama dgn
      // KIR/Pengamanan (lib/namaBerkas.ts). Bidang tak punya dimensi waktu.
      exportToExcel(baris, namaBerkasLaporan({ laporan: 'Daftar Bidang Tanah', golongan: '1.3.1', skpd: namaSkpd.nama }), 'Bidang Tanah')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daftar Bidang Tanah</h1>
          <p className="text-gray-500 text-sm mt-1">
            Daftar bidang (sertifikat/hamparan) Tanah untuk dilihat & diunduh. Kosongkan SKPD untuk se-kabupaten.
            {' '}Untuk menambah/mengubah bidang, buka <Link href="/dashboard/gis" className="text-teal hover:underline">GIS Tanah</Link>.
          </p>
        </div>
        <button onClick={handleExport} disabled={exporting || shown.length === 0} className="btn-primary flex-shrink-0">
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setDescIds(sel.descendantIds); namaSkpd.pilih(sel.skpdId) }}
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD..." />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Cari nama tanah / NIBAR / SKPD</label>
          <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)} placeholder="mis. Tanah Kantor..." />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card p-4"><p className="text-xs text-gray-500">Register Tanah</p><p className="text-lg font-bold text-gray-900 mt-1">{totalRegister.toLocaleString('id-ID')}</p></div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Sudah Berbidang</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{registerBerbidang.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">/ {totalRegister.toLocaleString('id-ID')}</span></p>
        </div>
        <div className="card p-4"><p className="text-xs text-gray-500">Total Bidang</p><p className="text-lg font-bold text-gray-900 mt-1">{shown.length.toLocaleString('id-ID')}</p></div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Luas Terpetakan</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{fmtLuas(luasTotal)} m²</p>
          <p className="text-[10px] text-gray-400 mt-0.5">dari {nLuas.toLocaleString('id-ID')} bidang berluas</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memuat data...</div>
      ) : error ? (
        <div className="card p-12 text-center text-sm"><p className="text-rose-700 font-medium">Gagal memuat data.</p><p className="text-gray-500 text-xs mt-1">{error}</p></div>
      ) : shown.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada bidang tercatat.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th>
                <th className="table-th">Nama Tanah / NIBAR</th>
                <th className="table-th">Nama Bidang</th>
                <th className="table-th">Jenis Hak</th>
                <th className="table-th">Nomor Dokumen</th>
                <th className="table-th">Tanggal Terbit</th>
                <th className="table-th text-right">Luas (m²)</th>
                <th className="table-th">Sertifikat</th>
                <th className="table-th">GIS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map(r => (
                <tr key={r.id}>
                  <td className="table-td text-xs text-gray-600">{r.skpdNama}</td>
                  <td className="table-td text-xs">
                    <p className="font-medium text-gray-800">{r.namaTanah}</p>
                    <p className="text-gray-400">{r.nibar || '-'}</p>
                  </td>
                  <td className="table-td text-xs">{r.nama_bidang || '-'}</td>
                  <td className="table-td text-xs">{r.jenis_hak || '-'}</td>
                  <td className="table-td text-xs">{r.nomor_dokumen_kepemilikan || '-'}</td>
                  <td className="table-td text-xs">{fmtTgl(r.tanggal_dokumen_kepemilikan)}</td>
                  <td className={`table-td text-right text-xs tabular-nums ${r.luas == null ? 'text-gray-300' : ''}`}>{fmtLuas(r.luas)}</td>
                  <td className="table-td text-xs">
                    {r.sertifikat_path ? <button onClick={() => lihatSertifikat(r.sertifikat_path!)} className="text-teal hover:underline">Lihat</button> : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="table-td text-xs">
                    <Link href={`/dashboard/gis?cari=${encodeURIComponent(r.nibar || r.namaTanah)}`} className="text-teal hover:underline">Buka →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
