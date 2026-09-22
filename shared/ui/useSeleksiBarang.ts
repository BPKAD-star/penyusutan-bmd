'use client'
// ============================================================================
// Centang barang di tabel pemilih — `Record<id, barang>` + centang massal.
//
// Diangkat 2026-09-16 (REFACTOR-PLAN Fase 3) di KEMUNCULAN KELIMA. Bentuk yang
// sama persis — sampai ke urutan pernyataan di dalam `setSel` — ditulis ulang
// di lima tempat:
//   · components/kir/Kir.tsx
//   · components/pengelolaan/PengeluaranInternal.tsx
//   · components/pengelolaan/Reklasifikasi.tsx        (+ predikat `bolehPilih`)
//   · components/pengelolaan/penghapusan/usePemilihBarang.ts (2026-09-22:
//     dipindah & di-rename jadi components/pengelolaan/usePemilihBarangLengkap.ts
//     begitu Pengeluaran Internal jadi pemakai ketiganya — path di atas historis)
//   · components/pengelolaan/Pengamanan.tsx
// Catatan di usePemilihBarangLengkap.ts sudah menuliskan syaratnya:
// *"Kalau menu KETIGA butuh pemilih serupa, barulah angkat bentuk bersamanya."*
//
// ⚠️ Yang diangkat CUMA mesin centangnya, BUKAN pemilihnya. Query kelima menu
// itu memang berbeda nyata (kolom, qual, kotak cari, saringan eligibilitas),
// dan menyatukannya akan melahirkan satu hook ber-belasan bendera — anti-pola
// yang dilarang CODING-STANDARD §1.5. Mesin centangnya sebaliknya: identik,
// dan satu-satunya keragaman yang nyata (Reklasifikasi) muat dalam SATU
// predikat opsional, bukan bendera.
//
// ⚠️ Kenapa ini layak diangkat padahal "cuma" belasan baris: semantiknya punya
// satu keputusan halus yang kalau menyimpang TIDAK menghasilkan satu pun error
// — lihat `toggleAllSel` di bawah. Lima salinan berarti lima kesempatan ia
// menyimpang diam-diam.
// ============================================================================
import { useState } from 'react'

export type PunyaId = { id: string }

/** Selalu boleh dicentang — perilaku empat dari lima pemanggil. */
const SEMUA_BOLEH = () => true

/**
 * Centang / lepas SATU baris.
 *
 * ⚠️ Membuang centang SELALU boleh, bahkan untuk baris yang `bolehPilih`-nya
 * false: barang bisa jadi tak layak SESUDAH tercentang (mis. golongan
 * tujuan diganti di menu Reklasifikasi), dan centang yang tak bisa dilepas
 * akan mengunci operator tanpa jalan keluar.
 */
export function toggleSel<T extends PunyaId>(
  prev: Record<string, T>,
  b: T,
  bolehPilih: (b: T) => boolean = SEMUA_BOLEH,
): Record<string, T> {
  const next = { ...prev }
  if (next[b.id]) { delete next[b.id]; return next }
  if (!bolehPilih(b)) return prev
  next[b.id] = b
  return next
}

/**
 * Centang / lepas SEMUA baris yang sedang tampil.
 *
 * ⚠️ DUA keputusan yang gampang menyimpang & dua-duanya senyap:
 *
 * 1. **`rows` kosong → BUKAN "semua tercentang".** Tanpa penjaga
 *    `valid.length > 0`, `[].every()` mengembalikan true, jadi menekan
 *    kotak kepala di tabel yang kosong akan MEMBUANG seluruh centang yang
 *    sudah dikumpulkan operator dari pencarian sebelumnya.
 * 2. **Melepas hanya mengembalikan `{}` pada keadaan "semua tampil sudah
 *    tercentang".** Konsekuensi yang DISENGAJA: centang di luar hasil filter
 *    ikut terbuang di situ, tapi tak pernah terbuang saat MENAMBAH — itu
 *    yang memungkinkan operator mengumpulkan barang dari beberapa kata
 *    kunci, pola yang sama dengan `draftSeleksi` di menu Pengadaan.
 */
export function toggleAllSel<T extends PunyaId>(
  prev: Record<string, T>,
  rows: readonly T[],
  bolehPilih: (b: T) => boolean = SEMUA_BOLEH,
): Record<string, T> {
  const valid = rows.filter(bolehPilih)
  const semuaTercentang = valid.length > 0 && valid.every(r => prev[r.id])
  if (semuaTercentang) return {}
  const next = { ...prev }
  for (const r of valid) next[r.id] = r
  return next
}

/** Apakah kotak centang di kepala tabel tampil tercentang. */
export function semuaTercentang<T extends PunyaId>(
  sel: Record<string, T>,
  rows: readonly T[],
  bolehPilih: (b: T) => boolean = SEMUA_BOLEH,
): boolean {
  const valid = rows.filter(bolehPilih)
  return valid.length > 0 && valid.every(r => sel[r.id])
}

export type SeleksiBarang<T extends PunyaId> = {
  sel: Record<string, T>
  setSel: React.Dispatch<React.SetStateAction<Record<string, T>>>
  selList: T[]
  allSelected: boolean
  toggle: (b: T) => void
  toggleAll: () => void
  /** Kosongkan centang — dipakai saat filter/konteks berganti. */
  reset: () => void
}

/**
 * @param rows baris yang sedang TAMPIL (sudah tersaring), bukan seluruh hasil.
 * @param bolehPilih predikat opsional; hanya menu Reklasifikasi memakainya
 *   (barang yang tak cocok dengan golongan tujuan tak boleh ikut tercentang).
 *   ⚠️ Dibaca SAAT tombol ditekan, jadi predikat yang menutup state terbaru
 *   tetap benar tanpa perlu ikut jadi dependency apa pun.
 */
export function useSeleksiBarang<T extends PunyaId>(
  rows: readonly T[],
  bolehPilih?: (b: T) => boolean,
): SeleksiBarang<T> {
  const [sel, setSel] = useState<Record<string, T>>({})
  return {
    sel,
    setSel,
    selList: Object.values(sel),
    allSelected: semuaTercentang(sel, rows, bolehPilih),
    toggle: (b: T) => setSel(prev => toggleSel(prev, b, bolehPilih)),
    toggleAll: () => setSel(prev => toggleAllSel(prev, rows, bolehPilih)),
    reset: () => setSel({}),
  }
}
