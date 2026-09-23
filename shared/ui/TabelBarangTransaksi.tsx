'use client'
// Bagian LAYAR (bukan cetak) dari standar kolom barang — lihat
// lib/kolomBarangTransaksi.ts utk daftar kolom, urutan, & alasannya.
//
// Tiga ekspor:
//   `<ColgroupBarang ekstra={...}/>`   — <colgroup> lebar TETAP (table-fixed)
//   `<KolomBarangHead/>`               — 12 <th> kanonik, urutan TETAP
//   `<KolomBarangCells barang={...}/>` — 12 <td> kanonik, isi apa adanya
//
// Pemanggil merangkainya dengan kolom ekstra miliknya sendiri (checkbox,
// Foto, Komptabel, Keterangan, Aksi, dst) — lihat komentar di
// lib/kolomBarangTransaksi.ts kenapa keduabelas kolom ini SELALU tampil utuh,
// tak boleh disembunyikan per golongan.
import type { ReactNode } from 'react'
import { KOLOM_BARANG_TRANSAKSI, KOLOM_BARANG_URUTAN, hitungLebarKolom, type BarangTransaksi, type KolomBarangKey } from '@/lib/kolomBarangTransaksi'
import { formatRupiah2 } from '@/lib/export'

const thAlign: Record<'left' | 'right' | 'center', string> = { left: '', right: 'text-right', center: 'text-center' }

/**
 * `<colgroup>` KEDUABELAS kolom kanonik + kolom EKSTRA milik pemanggil, dalam
 * SATU array — urutannya di sini WAJIB sama persis dengan urutan `<th>`/`<td>`
 * yang dirender pemanggil (kolom ekstra bisa muncul sebelum ATAU sesudah
 * blok kanonik, `posisi` menentukan yang mana).
 *
 * ⚠️ Lebarnya dihitung ULANG tiap render dari BOBOT (bukan dihardcode %),
 * supaya menu yang kolom ekstranya lebih sedikit (mis. tanpa Foto) tak
 * menyisakan ruang kosong — kolom kanoniknya justru melebar mengisinya, dan
 * itu tetap konsisten SELAMA kolom ekstra yang sama dipakai di SETIAP kartu
 * pada menu yang sama (itu syarat "rata dari atas ke bawah", bukan
 * byte-per-byte sama antar menu yang beda kolom ekstranya).
 */
export function ColgroupBarang({ sebelum = [], sesudah = [] }: {
  sebelum?: { key: string; berat: number }[]
  sesudah?: { key: string; berat: number }[]
}) {
  const kanonik = KOLOM_BARANG_URUTAN.map(k => ({ key: k, berat: KOLOM_BARANG_TRANSAKSI[k].berat }))
  const lebar = hitungLebarKolom([...sebelum, ...kanonik, ...sesudah])
  return (
    <colgroup>
      {lebar.map(l => <col key={l.key} style={{ width: `${l.pct}%` }} />)}
    </colgroup>
  )
}

/** 12 `<th>` kanonik. */
export function KolomBarangHead() {
  return (
    <>
      {KOLOM_BARANG_URUTAN.map(k => {
        const m = KOLOM_BARANG_TRANSAKSI[k]
        return <th key={k} className={`table-th ${thAlign[m.align || 'left']}`}>{m.header}</th>
      })}
    </>
  )
}

const kosong = <span className="text-gray-300">-</span>
const cell = (isi: ReactNode, extraClass = '') =>
  <td className={`table-td text-xs text-gray-600 ${extraClass}`}>{isi ?? kosong}</td>

/**
 * 12 `<td>` kanonik untuk SATU baris barang. Sel gabungan (kode+uraian,
 * spek+nibar, jumlah+satuan) ditumpuk 2 baris — pola yang sama dgn Daftar
 * Barang/Penyusutan (baris atas isi utama, baris bawah `text-gray-400` kecil).
 */
export function KolomBarangCells({ barang: b }: { barang: BarangTransaksi }) {
  return (
    <>
      <td className="table-td">
        <p className="text-xs text-gray-800 font-medium">{b.kode}</p>
        <p className="text-[11px] text-gray-400">{b.uraianBarang || kosong}</p>
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-600">{b.namaBarang || <span className="text-amber-600">⚠ Belum diisi</span>}</p>
        <p className="text-[10px] text-gray-400 [overflow-wrap:anywhere]">{b.nibar || kosong}</p>
      </td>
      {cell(b.merekTipe)}
      {cell(b.spesifikasiLainnya)}
      {cell(b.noPolisi, 'whitespace-nowrap')}
      {cell(b.noMesin, 'whitespace-nowrap')}
      {cell(b.noRangka, 'whitespace-nowrap')}
      {cell(b.luas == null || b.luas === '' ? null : b.luas, 'text-right')}
      {cell(b.alamatDetail)}
      {cell(b.tglPerolehan, 'text-center whitespace-nowrap')}
      <td className="table-td text-center">
        <p className="text-xs text-gray-700">{b.jumlah ?? 1}</p>
        <p className="text-[11px] text-gray-400">{b.satuan || kosong}</p>
      </td>
      <td className="table-td text-right text-xs text-gray-600">{b.nilai == null ? kosong : formatRupiah2(b.nilai)}</td>
    </>
  )
}

// Re-export supaya pemanggil yang cuma butuh tipenya tak perlu import dua modul.
export type { BarangTransaksi, KolomBarangKey }
