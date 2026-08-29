'use client'
// Tabel Laporan Pengadaan format Permendagri 47/2021 (Format IV.A — aset tetap).
// Dipakai ulang oleh tab "Format Permendagri" (components/pelaporan/LaporanPengadaanPermendagri)
// dan halaman cetak (app/cetak/laporan-pengadaan). Header bertingkat 2 baris +
// subtotal per golongan + footer tanda tangan Pengguna Barang (NIP bisa kosong utk
// non-ASN RSUD). Data & grouping ada di lib/laporanPengadaan (satu sumber).
//
// Kolom "Kode Barang" dipecah per level kodefikasi (x|x|x|xx|xx|xx…) seperti format
// aslinya — jumlah sub-kolom = maksimum segmen `kode` pada data (min 6).
//
// SATU BLOK PER SKPD: laporan Permendagri ditandatangani per Pengguna Barang (SKPD
// induk). Pilih satu SKPD → satu blok. Mode se-kabupaten (SKPD kosong) → satu blok
// per SKPD induk (dikelompokkan via root SKPD), masing-masing dgn subtotal, total,
// dan footer tanda tangannya sendiri + page-break saat dicetak.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { useSkpdTree } from '@/components/useSkpdTree'
import { LEMBAR_PERMENDAGRI, labelFormat } from '@/lib/permendagriFormat'
import {
  fetchLaporanPengadaan, groupByGolongan, grandTotal, fetchPenggunaBarangMap,
  type PengadaanRow, type PenggunaBarang,
} from '@/lib/laporanPengadaan'

// Pecah kode jadi tepat `n` segmen sel; sel terakhir menyerap sisa segmen.
function kodeSegments(kode: string, n: number): string[] {
  const seg = (kode || '').split('.')
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(i < n - 1 ? (seg[i] ?? '') : seg.slice(n - 1).join('.'))
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

const th = 'brd px-2 py-1 text-center font-semibold bg-gray-50'
const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

// Satu laporan lengkap utk SATU SKPD (judul + tabel + subtotal + total + footer TTD).
function ReportBlock({ nama, periode, rows, kodeCols, pengguna, pageBreak }: {
  nama: string; periode: string; rows: PengadaanRow[]; kodeCols: number
  pengguna: PenggunaBarang | null; pageBreak: boolean
}) {
  const groups = groupByGolongan(rows)
  const total = grandTotal(rows)
  const totalCols = kodeCols + 19

  return (
    <div className={`${pageBreak ? 'print:break-after-page' : ''} mb-10`}>
      {/* Kode format resmi di KANAN ATAS, bukan di nama tab/menu (keputusan user
          2026-08-29). Di sinilah ia berguna: pemeriksa mencocokkan lampiran yang
          diterimanya dengan daftar format di Permendagri. Di layar ia cuma
          jargon — dan di menu Perolehan angka "Model 3" malah menyesatkan,
          karena "Model 1/2/3" di Laporan BMD artinya hal yang lain sama sekali.
          Pola yang sama dgn `kepalaLampiran` (BeritaAcaraRekon) & `KopKanan`
          (cetak RKBMD). */}
      <div className="text-right text-[10px] text-gray-500 mb-1">
        {labelFormat(LEMBAR_PERMENDAGRI['perolehan-pengadaan'])}
      </div>
      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[13px]">Laporan Pengadaan BMD Berupa Aset Tetap</p>
        <p className="font-semibold">SKPD: {nama}</p>
        <p>Semester: {periode || '—'}</p>
      </div>
      <div className="mb-2 text-[11px]">
        <p>Provinsi&nbsp;: Jawa Timur</p>
        <p>Kabupaten&nbsp;: Kediri</p>
      </div>

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

      <div className="mt-6 flex justify-end">
        <div className="text-center text-[11px]">
          <p>Kediri, {tglID()}</p>
          <p>Kuasa Pengguna Barang atau Pengguna Barang</p>
          <div className="h-16" />
          <p className="font-semibold underline">{pengguna?.nama || '(………………………………)'}</p>
          <p>NIP. {pengguna?.nip || '……………………………'}</p>
        </div>
      </div>
    </div>
  )
}

export default function LaporanPengadaanTabel({ periode, skpdId, descIds }: {
  periode: string; skpdId: number | null; descIds: number[] | null
}) {
  const supabase = createClient()
  const { byId, rootOf, loaded } = useSkpdTree()
  const [rows, setRows] = useState<PengadaanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pgMap, setPgMap] = useState<Map<number, PenggunaBarang>>(new Map())
  const [err, setErr] = useState('')
  const descKey = (descIds || []).join(',')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr('')
      // fetchLaporanPengadaan melempar kalau daftar transaksi yang dibatalkan
      // gagal dimuat. Tabel dikosongkan & pesannya ditampilkan — laporan yang
      // memuat barang sudah-dianulir seolah sah jauh lebih berbahaya daripada
      // tabel kosong yang jelas-jelas bilang ada yang salah.
      const data = await fetchLaporanPengadaan(supabase, { periode, descIds })
        .catch((e: Error) => { if (alive) setErr(e.message); return null })
      if (!alive) return
      setRows(data || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [periode, skpdId, descKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Blok per SKPD: single → 1 blok utk SKPD terpilih; se-kab → 1 blok per SKPD induk.
  const blocks = useMemo(() => {
    if (!loaded) return [] as { skpdId: number; nama: string; rows: PengadaanRow[] }[]
    if (skpdId != null) {
      return [{ skpdId, nama: byId.get(skpdId)?.nama || `SKPD #${skpdId}`, rows }]
    }
    const map = new Map<number, PengadaanRow[]>()
    for (const r of rows) {
      const rid = rootOf(r.skpdId)?.id ?? r.skpdId
      const arr = map.get(rid) || []; arr.push(r); map.set(rid, arr)
    }
    return [...map.entries()]
      .map(([rid, rs]) => ({ skpdId: rid, nama: byId.get(rid)?.nama || `SKPD #${rid}`, rows: rs }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [rows, skpdId, loaded, byId, rootOf])

  // Kode sub-kolom seragam lintas blok = maksimum segmen pada seluruh data (min 6).
  const kodeCols = useMemo(
    () => Math.max(6, ...rows.map(r => (r.kode || '').split('.').length)),
    [rows],
  )

  // Ambil Pengguna Barang utk semua SKPD yang muncul (footer per blok).
  const blockIdsKey = blocks.map(b => b.skpdId).join(',')
  useEffect(() => {
    let alive = true
    if (blocks.length === 0) { setPgMap(new Map()); return }
    ;(async () => {
      const m = await fetchPenggunaBarangMap(supabase, blocks.map(b => b.skpdId))
      if (alive) setPgMap(m)
    })()
    return () => { alive = false }
  }, [blockIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-[11px] text-gray-900">
      <style>{`.brd{border:1px solid #9ca3af}`}</style>
      {err ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Gagal menyusun laporan: {err}. Angka tidak ditampilkan supaya barang yang sudah dianulir tidak ikut terbaca sebagai sah.
        </div>
      ) : !periode ? (
        <p className="py-8 text-center text-gray-500">
          Pilih <b>Periode (semester)</b> dulu — laporan format Permendagri disusun per semester.
        </p>
      ) : loading || !loaded ? (
        <p className="py-8 text-center text-gray-400">Memuat data...</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-gray-400">Tidak ada pengadaan pada periode/SKPD ini.</p>
      ) : (
        blocks.map((b, i) => (
          <ReportBlock key={b.skpdId} nama={b.nama} periode={periode} rows={b.rows}
            kodeCols={kodeCols} pengguna={pgMap.get(b.skpdId) || null} pageBreak={i < blocks.length - 1} />
        ))
      )}
    </div>
  )
}
