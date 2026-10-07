// Status "masih berlaku / sudah dianulir" tiap baris ledger pada KIBAR.
//
// `transaksi_bmd` append-only: transaksi yang dibatalkan TIDAK hilang, ia dianulir
// oleh baris `batal_*` baru. Karena itu status aktif tak bisa disimpan di baris
// aslinya — ia DIHITUNG saat baca. Bagian I–XII kartu KIBAR (kartu yang DICETAK)
// hanya boleh memuat peristiwa yang masih berlaku; "Riwayat Transaksi Lengkap"
// tetap memuat semuanya sebagai lampiran audit, dengan baris yang dianulir ditandai.
//
// Lima mekanik pembatalan yang berbeda, dan menyamakannya adalah bugnya:
//   1. ber-`payload.target_trx_id(s)` — kapitalisasi (sisi induk), reklas, koreksi
//      (nilai/spesifikasi/ganda), pengalihan & mutasi internal, penggabungan.
//      Dibaca lewat `idTarget` yang DIPAKAI BERSAMA lib/voidedAset.ts & guard.
//   2. `batal_penghapusan` — payload `{}`, tanpa target → replay "peristiwa
//      terakhir menang" (pola `penghapusanEfektif`, lib/laporanPenghapusan.ts).
//   3. `batal_pemanfaatan`/`batal_pengamanan`/`batal_pemecahan*` — tanpa target,
//      kuncinya `header_id` (satu perjanjian / BAST / kartu pemecahan).
//   4. `batal_kapitalisasi` sisi ANAK — tanpa target & tanpa header, hanya urutan.
//   5. `batal_akumulasi_kdp` warisan `{}` — seluruh termin KDP yang lebih tua.
import { idTarget, type BatalPayload } from './voidedAset'

export type TrxStatus = {
  id: number
  jenis: string
  periode: string
  header_id: string | null
  payload: Record<string, unknown> | null
}

const JENIS_PENGHAPUSAN = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

// `batal_*` tanpa target yang kuncinya header_id → jenis baris yang dianulirnya.
const BATAL_PER_HEADER: Record<string, string[]> = {
  batal_pemanfaatan: ['pemanfaatan', 'pemanfaatan_selesai'],
  batal_pengamanan: ['pengamanan', 'pengembalian_pengamanan'],
  batal_pemecahan: ['pemecahan_keluar'],
  batal_pemecahan_masuk: ['pemecahan_masuk'],
}

const urut = <T extends TrxStatus>(rows: T[]) =>
  [...rows].sort((a, b) => (a.periode < b.periode ? -1 : a.periode > b.periode ? 1 : a.id - b.id))

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
  const hapus = urut(trx.filter(t => JENIS_PENGHAPUSAN.includes(t.jenis) || t.jenis === 'batal_penghapusan'))
  for (let i = 0; i < hapus.length; i++) {
    const t = hapus[i]
    if (t.jenis === 'batal_penghapusan') continue
    // Pembatal pertama SESUDAH baris ini, kalau ada.
    const pembatal = hapus.slice(i + 1).find(x => x.jenis === 'batal_penghapusan')
    if (pembatal && !out.has(t.id)) out.set(t.id, pembatal.id)
  }

  // (3) pembatalan per header_id (tanpa target): `batal_*` menganulir baris
  // sejenis milik header YANG SAMA yang lebih tua darinya. Ledger ini per aset,
  // jadi header_id cukup sebagai kunci (satu perjanjian / satu BAST / satu kartu
  // pemecahan).
  for (const [batal, dianulirJenis] of Object.entries(BATAL_PER_HEADER)) {
    for (const b of trx) {
      if (b.jenis !== batal || !b.header_id) continue
      for (const t of trx) {
        if (t.header_id === b.header_id && t.id < b.id && dianulirJenis.includes(t.jenis) && !out.has(t.id)) {
          out.set(t.id, b.id)
        }
      }
    }
  }

  // (4) kapitalisasi sisi ANAK: `batal_kapitalisasi` tanpa target hanya membawa
  // {induk_id, no_dokumen}, jadi yang tersedia cuma URUTAN — "baris terakhir
  // menang" (pola `barisMasihBerlaku`, lib/guardPembatalan.ts): tiap pembatal
  // menganulir `kapitalisasi_serap` terdekat yang belum dianulir.
  const antrian: TrxStatus[] = []
  for (const x of urut(trx.filter(r => r.jenis === 'kapitalisasi_serap'
    || (r.jenis === 'batal_kapitalisasi' && idTarget(r.payload as BatalPayload).length === 0)))) {
    if (x.jenis === 'kapitalisasi_serap') antrian.push(x)
    else {
      const serap = antrian.pop()
      if (serap && !out.has(serap.id)) out.set(serap.id, x.id)
    }
  }

  // (5) termin KDP warisan: `batal_akumulasi_kdp` TANPA target (model Buka
  // Kunci kartu, sebelum 2026-10-07) menganulir SELURUH termin barang ini yang
  // lebih tua. Yang ber-target sudah tertangani di (1). KEMBAR dgn
  // `terminKdpDibatalkan` (lib/voidedAset.ts).
  for (const b of trx) {
    if (b.jenis !== 'batal_akumulasi_kdp' || idTarget(b.payload as BatalPayload).length > 0) continue
    for (const t of trx) {
      if (t.jenis === 'akumulasi_kdp' && t.id < b.id && !out.has(t.id)) out.set(t.id, b.id)
    }
  }

  return out
}

/** Baris yang MASIH BERLAKU (urutan input dipertahankan). */
export function trxBerlaku<T extends TrxStatus>(trx: T[]): T[] {
  const dianulir = petaDianulir(trx)
  return trx.filter(t => !dianulir.has(t.id))
}

/**
 * Riwayat untuk MODE LAPORAN (lampiran administrasi): hanya peristiwa yang masih
 * berlaku. Baris yang dianulir DAN baris pembatal yang menganulirnya sama-sama
 * disembunyikan — percobaan yang sudah dibatalkan bukan perjalanan barang itu.
 * `batal_*` yang tak menganulir apa pun yang dikenali (mis. `batal_pengadaan`)
 * TETAP tampil: maknanya (barang ditarik dari register) tak tertangkap di tempat
 * lain, jadi menyembunyikannya berarti menghilangkan fakta.
 * Mode AUDIT memakai seluruh baris + `petaDianulir` untuk menandai.
 */
export function riwayatLaporan<T extends TrxStatus>(trx: T[]): T[] {
  const peta = petaDianulir(trx)
  const pembatal = new Set(peta.values())
  return trx.filter(t => !peta.has(t.id) && !pembatal.has(t.id))
}
