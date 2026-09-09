'use client'
// Tabel Laporan Pengadaan format Permendagri 47/2021 (Format IV.A — aset tetap).
// Dipakai ulang oleh tab "Format Permendagri" (components/pelaporan/LaporanPengadaanPermendagri)
// dan halaman cetak (app/cetak/laporan-pengadaan). Kepala tabel satu baris +
// subtotal per golongan + footer tanda tangan Pengguna Barang (NIP bisa kosong utk
// non-ASN RSUD). Data & grouping ada di lib/laporanPengadaan (satu sumber).
//
// SUSUNAN KOLOM DIRAMPINGKAN (permintaan user 2026-09-09) — 15 kolom, sepadan
// dgn tabel di layar tab "Format Permendagri". Yang diubah dari bentuk IV.A
// penuh:
//  - "Kode Barang" tak lagi dipecah per segmen (x|x|x|xx…) → satu sel
//    "Kode Barang / Uraian Barang" (kode di atas, uraian abu-abu di bawah);
//  - Sub Kegiatan & Rekening masing-masing dari 2 kolom → 1 sel bertumpuk;
//  - 3 kolom IV.A DIBUANG: Total Biaya Atribusi, Nilai Perolehan Barang, Harga
//    Satuan Perolehan — di data ini ketiganya selalu 0 / duplikat (atribusi 0 →
//    Nilai Perolehan = Total Nilai; Harga Perolehan = Harga Satuan), jadi tak
//    ada informasi yang hilang;
//  - super-header ("Penggolongan…", "Sub Kegiatan dan Rekening…", "Dokumen
//    Sumber Perolehan") dilepas → kepala tabel satu baris.
// Export Excel SENGAJA tak ikut diubah (masih 20 kolom, pivot-friendly).
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
import { labelPeriodeKop } from '@/lib/formatPermendagri'
import {
  fetchLaporanPengadaan, groupByGolongan, grandTotal, fetchPenggunaBarangMap,
  type PengadaanRow, type PenggunaBarang,
} from '@/lib/laporanPengadaan'

// 15 kolom; `NCOL` dipakai untuk colSpan baris kelompok & "tidak ada data".
const NCOL = 15

// Baris subtotal/total: label rata-kanan menutup 5 kolom pertama, lalu Jumlah
// Barang, Harga Satuan (kosong), Total Nilai, lalu 7 kolom sisa kosong.
function SubtotalRow({ label, jumlah, nilai, grand }: {
  label: string; jumlah: number; nilai: number; grand?: boolean
}) {
  return (
    <tr className={grand ? 'bg-gray-200 font-bold' : 'bg-gray-100 font-semibold'}>
      <td className="brd px-2 py-1 text-right" colSpan={5}>{label}</td>
      <td className="brd px-2 py-1 text-right">{jumlah}</td>
      <td className="brd px-2 py-1" />
      <td className="brd px-2 py-1 text-right">{formatRupiah(nilai)}</td>
      <td className="brd px-2 py-1" colSpan={7} />
    </tr>
  )
}

// Sel bertumpuk: baris 1 kode (nowrap), baris 2 uraian abu-abu (boleh membungkus).
function SelTumpuk({ kode, uraian }: { kode: string; uraian: string }) {
  return (
    <td className="brd px-1.5 py-1 align-top">
      <div className="whitespace-nowrap">{kode || '-'}</div>
      {uraian && <div className="text-gray-500 break-words">{uraian}</div>}
    </td>
  )
}

function DataRow({ r }: { r: PengadaanRow }) {
  const c = 'brd px-1.5 py-1 align-top break-words'
  const num = 'brd px-1.5 py-1 align-top text-right whitespace-nowrap'
  return (
    <tr>
      <SelTumpuk kode={r.kode} uraian={r.namaBarang} />
      <td className={c}>{r.spesifikasi || '-'}</td>
      <td className={c}>{r.merekTipe || '-'}</td>
      <td className={c}>{r.spesifikasiLainnya || '-'}</td>
      <td className={c}>{r.satuan || '-'}</td>
      <td className={num}>{r.jumlah}</td>
      <td className={num}>{formatRupiah(r.hargaSatuan)}</td>
      <td className={num}>{formatRupiah(r.totalNilai)}</td>
      <SelTumpuk kode={r.kodeSubKegiatan} uraian={r.namaSubKegiatan} />
      <SelTumpuk kode={r.kodeRekening} uraian={r.uraianBelanja} />
      <td className={c + ' whitespace-nowrap'}>{r.tanggal}</td>
      <td className={c}>{r.bentukKontrak || '-'}</td>
      <td className={c}>{r.namaPenyedia || '-'}</td>
      <td className={c}>{r.nomor || '-'}</td>
      <td className={c}>{r.keterangan || '-'}</td>
    </tr>
  )
}

function FragmentGroup({ kode, uraian, rows, subtotal }: {
  kode: string; uraian: string; rows: PengadaanRow[]; subtotal: number
}) {
  const jml = rows.reduce((s, r) => s + r.jumlah, 0)
  return (
    <>
      <tr className="bg-teal/5">
        <td className="brd px-2 py-1 font-semibold" colSpan={NCOL}>{kode} — {uraian}</td>
      </tr>
      {rows.map((r, i) => <DataRow key={i} r={r} />)}
      <SubtotalRow label={`Jumlah ${uraian}`} jumlah={jml} nilai={subtotal} />
    </>
  )
}

const th = 'brd px-2 py-1 text-center font-semibold bg-gray-50'
const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

// Lebar kolom (jumlah = 100) → `table-fixed`, jadi 15 kolom muat A4 landscape
// tanpa geser kanan-kiri; teks panjang membungkus, tinggi baris menyesuaikan.
const LEBAR = [11, 8, 6, 6, 4, 4, 7, 7, 9, 9, 5, 5, 7, 6, 6]

// Satu laporan lengkap utk SATU SKPD (judul + tabel + subtotal + total + footer TTD).
function ReportBlock({ nama, periode, rows, pengguna, pageBreak }: {
  nama: string; periode: string; rows: PengadaanRow[]
  pengguna: PenggunaBarang | null; pageBreak: boolean
}) {
  const groups = groupByGolongan(rows)
  const total = grandTotal(rows)
  const totalJml = rows.reduce((s, r) => s + r.jumlah, 0)

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
        {/* `labelPeriodeKop` — sama dgn keempat menu perolehan manual lain
            (lib/formatPermendagri.ts): '2026-S1' -> Semester I, '2026' (bare
            year) -> Akhir Tahun. Dulu ia mencetak periode mentah ("Semester:
            2026" utk Akhir Tahun), yang salah baca krn '2026' bukan semester. */}
        <p>{labelPeriodeKop(periode).judul} TAHUN {labelPeriodeKop(periode).tahun}</p>
      </div>
      <div className="mb-2 text-[11px]">
        <p>Provinsi&nbsp;: Jawa Timur</p>
        <p>Kabupaten&nbsp;: Kediri</p>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse w-full table-fixed">
          <colgroup>
            {LEBAR.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Kode Barang / Uraian Barang</th>
              <th className={th}>Spesifikasi Nama Barang</th>
              <th className={th}>Merk / Tipe</th>
              <th className={th}>Spesifikasi Lainnya</th>
              <th className={th}>Satuan Barang</th>
              <th className={th}>Jumlah Barang</th>
              <th className={th}>Harga Satuan</th>
              <th className={th}>Total Nilai Barang</th>
              <th className={th}>Kode Sub Kegiatan / Uraian Kegiatan</th>
              <th className={th}>Kode Rekening / Uraian Rekening</th>
              <th className={th}>Tanggal Perolehan</th>
              <th className={th}>Bentuk Kontrak</th>
              <th className={th}>Nama Penyedia</th>
              <th className={th}>Nomor Kontrak</th>
              <th className={th}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <FragmentGroup key={g.kode} kode={g.kode} uraian={g.uraian} rows={g.rows}
                subtotal={g.subtotal} />
            ))}
            <SubtotalRow label="TOTAL" jumlah={totalJml} nilai={total} grand />
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
            pengguna={pgMap.get(b.skpdId) || null} pageBreak={i < blocks.length - 1} />
        ))
      )}
    </div>
  )
}
