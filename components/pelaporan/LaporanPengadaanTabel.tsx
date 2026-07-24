'use client'
// Tabel Laporan Pengadaan format Permendagri 47/2021 (Format IV.A — aset tetap).
// Dipakai ulang oleh tab "Model 3" (components/pelaporan/LaporanPengadaanModel3)
// dan halaman cetak (app/cetak/laporan-pengadaan). Header bertingkat 2 baris +
// subtotal per golongan + footer tanda tangan Pengguna Barang (NIP bisa kosong utk
// non-ASN RSUD). Data & grouping ada di lib/laporanPengadaan (satu sumber).
//
// Kolom "Kode Barang" dipecah per level kodefikasi (x|x|x|xx|xx|xx…) seperti format
// aslinya — jumlah sub-kolom = maksimum segmen `kode` pada data (min 6), supaya
// grid seragam. Kode lebih pendek dipad sel kosong; lebih panjang → sisa diserap
// sel terakhir.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import {
  fetchLaporanPengadaan, groupByGolongan, grandTotal, fetchPenggunaBarang, type PengadaanRow,
} from '@/lib/laporanPengadaan'

// Pecah kode jadi tepat `n` segmen sel; sel terakhir menyerap sisa segmen.
function kodeSegments(kode: string, n: number): string[] {
  const seg = (kode || '').split('.')
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(i < n - 1 ? (seg[i] ?? '') : seg.slice(n - 1).join('.'))
  }
  return out
}

function SubtotalRow({ label, nilai, kodeCols, grand }: {
  label: string; nilai: number; kodeCols: number; grand?: boolean
}) {
  // Kolom "label" sebelum Total Nilai = kodeCols + (Nama, Spesifikasi, Merek,
  // Jumlah, Satuan, Harga Satuan) = kodeCols + 6. Tail setelah Nilai Perolehan = 10.
  return (
    <tr className={grand ? 'bg-gray-200 font-bold' : 'bg-gray-100 font-semibold'}>
      <td className="brd px-2 py-1 text-right" colSpan={kodeCols + 6}>{label}</td>
      <td className="brd px-2 py-1 text-right">{formatRupiah(nilai)}</td>
      <td className="brd px-2 py-1 text-right">{formatRupiah(0)}</td>
      <td className="brd px-2 py-1 text-right">{formatRupiah(nilai)}</td>
      <td className="brd px-2 py-1" colSpan={10}></td>
    </tr>
  )
}

function DataRow({ r, kodeCols }: { r: PengadaanRow; kodeCols: number }) {
  const c = 'brd px-2 py-1 align-top'
  const num = 'brd px-2 py-1 align-top text-right whitespace-nowrap'
  return (
    <tr>
      {kodeSegments(r.kode, kodeCols).map((s, i) => (
        <td key={i} className="brd px-1 py-1 align-top text-center whitespace-nowrap">{s || ''}</td>
      ))}
      <td className={c}>{r.namaBarang || '-'}</td>
      <td className={c}>{r.spesifikasi || '-'}</td>
      <td className={c}>{r.merekTipe || '-'}</td>
      <td className={num}>{r.jumlah}</td>
      <td className={c}>{r.satuan || '-'}</td>
      <td className={num}>{formatRupiah(r.hargaSatuan)}</td>
      <td className={num}>{formatRupiah(r.totalNilai)}</td>
      <td className={num}>{formatRupiah(0)}</td>
      <td className={num}>{formatRupiah(r.totalNilai)}</td>
      <td className={num}>{formatRupiah(r.hargaSatuan)}</td>
      <td className={c + ' whitespace-nowrap'}>{r.kodeSubKegiatan || '-'}</td>
      <td className={c}>{r.namaSubKegiatan || '-'}</td>
      <td className={c + ' whitespace-nowrap'}>{r.kodeRekening || '-'}</td>
      <td className={c}>{r.uraianBelanja || '-'}</td>
      <td className={c + ' whitespace-nowrap'}>{r.tanggal}</td>
      <td className={c}>{r.bentukKontrak}</td>
      <td className={c}>{r.namaPenyedia || '-'}</td>
      <td className={c + ' whitespace-nowrap'}>{r.nomor || '-'}</td>
      <td className={c}>{r.keterangan || '-'}</td>
    </tr>
  )
}

// Satu blok golongan: baris data + baris subtotal (angka 27..30 di format).
function FragmentGroup({ kode, uraian, rows, subtotal, kodeCols, totalCols }: {
  kode: string; uraian: string; rows: PengadaanRow[]; subtotal: number; kodeCols: number; totalCols: number
}) {
  return (
    <>
      <tr className="bg-teal/5">
        <td className="brd px-2 py-1 font-semibold" colSpan={totalCols}>{kode} — {uraian}</td>
      </tr>
      {rows.map((r, i) => <DataRow key={i} r={r} kodeCols={kodeCols} />)}
      <SubtotalRow label={`Jumlah ${uraian}`} nilai={subtotal} kodeCols={kodeCols} />
    </>
  )
}

export default function LaporanPengadaanTabel({ periode, skpdId, descIds }: {
  periode: string; skpdId: number | null; descIds: number[] | null
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<PengadaanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [skpdNama, setSkpdNama] = useState('')
  const [pengguna, setPengguna] = useState<{ nama: string; nip: string | null; jabatan: string | null } | null>(null)
  const descKey = (descIds || []).join(',')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const data = await fetchLaporanPengadaan(supabase, { periode, descIds })
      if (!alive) return
      setRows(data)
      if (skpdId) {
        const [{ data: s }, pb] = await Promise.all([
          supabase.from('admin_skpd').select('nama').eq('id', skpdId).maybeSingle(),
          fetchPenggunaBarang(supabase, skpdId),
        ])
        if (!alive) return
        setSkpdNama((s as { nama?: string } | null)?.nama || '')
        setPengguna(pb)
      } else { setSkpdNama(''); setPengguna(null) }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [periode, skpdId, descKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupByGolongan(rows), [rows])
  const total = useMemo(() => grandTotal(rows), [rows])
  // Jumlah sub-kolom Kode Barang = maksimum segmen pada data (min 6 utk estetika header).
  const kodeCols = useMemo(
    () => Math.max(6, ...rows.map(r => (r.kode || '').split('.').length)),
    [rows],
  )
  const totalCols = kodeCols + 19 // 19 kolom non-kode
  const tglCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  const th = 'brd px-2 py-1 text-center font-semibold bg-gray-50'

  return (
    <div className="text-[11px] text-gray-900">
      <style>{`.brd{border:1px solid #9ca3af}`}</style>

      {/* Judul dokumen */}
      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[13px]">Laporan Pengadaan BMD Berupa Aset Tetap</p>
        <p className="font-semibold">SKPD: {skpdNama || (skpdId ? `#${skpdId}` : 'Seluruh Kabupaten')}</p>
        <p>Semester: {periode || '—'}</p>
      </div>
      <div className="mb-2 text-[11px]">
        <p>Provinsi&nbsp;: Jawa Timur</p>
        <p>Kabupaten&nbsp;: Kediri</p>
      </div>

      {loading ? (
        <p className="py-8 text-center text-gray-400">Memuat data...</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">Tidak ada pengadaan pada periode/SKPD ini.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse w-full">
              <thead>
                <tr>
                  <th className={th} colSpan={kodeCols + 1}>Penggolongan dan Kodefikasi Barang</th>
                  <th className={th} rowSpan={2}>Spesifikasi Nama Barang</th>
                  <th className={th} rowSpan={2}>Merek/Tipe</th>
                  <th className={th} rowSpan={2}>Jumlah Barang</th>
                  <th className={th} rowSpan={2}>Satuan Barang</th>
                  <th className={th} rowSpan={2}>Harga Satuan (Rp)</th>
                  <th className={th} rowSpan={2}>Total Nilai Barang (Rp)</th>
                  <th className={th} rowSpan={2}>Total Biaya Atribusi (Rp)</th>
                  <th className={th} rowSpan={2}>Nilai Perolehan Barang (Rp)</th>
                  <th className={th} rowSpan={2}>Harga Satuan Perolehan (Rp)</th>
                  <th className={th} colSpan={4}>Sub Kegiatan dan Rekening Anggaran Belanja Daerah Atas Pengadaan Barang</th>
                  <th className={th} rowSpan={2}>Tanggal Perolehan</th>
                  <th className={th} colSpan={3}>Dokumen Sumber Perolehan</th>
                  <th className={th} rowSpan={2}>Keterangan</th>
                </tr>
                <tr>
                  <th className={th} colSpan={kodeCols}>Kode Barang</th>
                  <th className={th}>Nama Barang</th>
                  <th className={th}>Kode Sub Kegiatan</th>
                  <th className={th}>Nama Sub Kegiatan</th>
                  <th className={th}>Kode Rekening</th>
                  <th className={th}>Uraian Belanja</th>
                  <th className={th}>Bentuk Kontrak</th>
                  <th className={th}>Nama Penyedia</th>
                  <th className={th}>Nomor</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <FragmentGroup key={g.kode} kode={g.kode} uraian={g.uraian} rows={g.rows}
                    subtotal={g.subtotal} kodeCols={kodeCols} totalCols={totalCols} />
                ))}
                <SubtotalRow label="TOTAL" nilai={total} kodeCols={kodeCols} grand />
              </tbody>
            </table>
          </div>

          {/* Footer tanda tangan (hanya saat satu SKPD dipilih) */}
          {skpdId && (
            <div className="mt-6 flex justify-end">
              <div className="text-center text-[11px]">
                <p>Kediri, {tglCetak}</p>
                <p>Kuasa Pengguna Barang atau Pengguna Barang</p>
                <div className="h-16" />
                <p className="font-semibold underline">{pengguna?.nama || '(………………………………)'}</p>
                <p>NIP. {pengguna?.nip || '……………………………'}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
