// Status "masih berlaku / sudah dianulir" tiap baris ledger pada KIBAR.
//
// `transaksi_bmd` append-only: transaksi yang dibatalkan TIDAK hilang, ia dianulir
// oleh baris `batal_*` baru. Karena itu status aktif tak bisa disimpan di baris
// aslinya — ia DIHITUNG saat baca. Bagian I–XII kartu KIBAR (kartu yang DICETAK)
// hanya boleh memuat peristiwa yang masih berlaku; "Riwayat Transaksi Lengkap"
// tetap memuat semuanya sebagai lampiran audit, dengan baris yang dianulir ditandai.
//
// Tiga mekanik pembatalan yang berbeda, dan menyamakannya adalah bugnya:
//   1. ber-`payload.target_trx_id(s)` — kapitalisasi (sisi induk), reklas, koreksi
//      (nilai/spesifikasi/ganda), pengalihan & mutasi internal, penggabungan.
//      Dibaca lewat `idTarget` yang DIPAKAI BERSAMA lib/voidedAset.ts & guard.
//   2. `batal_penghapusan` — payload `{}`, tanpa target → replay "peristiwa
//      terakhir menang" (pola `penghapusanEfektif`, lib/laporanPenghapusan.ts).
//   3. `batal_pemanfaatan` — tanpa target, kuncinya `header_id` (satu perjanjian).
import { idTarget, type BatalPayload } from './voidedAset'

export type TrxStatus = {
  id: number
  jenis: string
  periode: string
  header_id: string | null
  payload: Record<string, unknown> | null
}

const JENIS_PENGHAPUSAN = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

/**
 * Id baris yang SUDAH DIANULIR, dipetakan ke id baris pembatalnya.
 * Urutan input tak dipentingkan.
 */
export function petaDianulir(trx: TrxStatus[]): Map<number, number> {
  const out = new Map<number, number>()

  // (1) payload.target_trx_id(s) — pembatalnya = baris `batal_*` itu sendiri.
  for (const t of trx) {
    if (!t.jenis.startsWith('batal_')) continue
    for (const target of idTarget(t.payload as BatalPayload)) {
      if (!out.has(target)) out.set(target, t.id)
    }
  }

  // (2) penghapusan — per aset hanya peristiwa TERAKHIR (periode, id) yang
  // menentukan; kalau itu `batal_penghapusan`, seluruh penghapusan sebelumnya
  // dianulir. Hapus → batal → hapus lagi: hanya yang terakhir yang hidup.
  const hapus = trx
    .filter(t => JENIS_PENGHAPUSAN.includes(t.jenis) || t.jenis === 'batal_penghapusan')
    .sort((a, b) => (a.periode < b.periode ? -1 : a.periode > b.periode ? 1 : a.id - b.id))
  for (let i = 0; i < hapus.length; i++) {
    const t = hapus[i]
    if (t.jenis === 'batal_penghapusan') continue
    // Pembatal pertama SESUDAH baris ini, kalau ada.
    const pembatal = hapus.slice(i + 1).find(x => x.jenis === 'batal_penghapusan')
    if (pembatal && !out.has(t.id)) out.set(t.id, pembatal.id)
  }

  // (3) pemanfaatan — `batal_pemanfaatan` menganulir seluruh perjanjian (header)
  // yang barisnya lebih tua darinya.
  for (const b of trx) {
    if (b.jenis !== 'batal_pemanfaatan' || !b.header_id) continue
    for (const t of trx) {
      if (t.header_id === b.header_id && t.id < b.id
        && (t.jenis === 'pemanfaatan' || t.jenis === 'pemanfaatan_selesai') && !out.has(t.id)) {
        out.set(t.id, b.id)
      }
    }
  }

  return out
}

/** Baris yang MASIH BERLAKU (urutan input dipertahankan). */
export function trxBerlaku<T extends TrxStatus>(trx: T[]): T[] {
  const dianulir = petaDianulir(trx)
  return trx.filter(t => !dianulir.has(t.id))
}
