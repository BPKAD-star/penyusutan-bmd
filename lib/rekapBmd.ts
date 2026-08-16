// Turunan angka LAPORAN BMD dari baris mentah RPC `fn_rekap_bmd`.
//
// RPC-nya mengembalikan akumulasi/beban/nilai_buku_akhir APA ADANYA dari LEFT
// JOIN ke `penyusutan_semester` — jadi NOL untuk sel yang tak punya baris
// engine, termasuk seluruh golongan yang memang tak pernah disusutkan
// (1.3.1 Tanah, 1.3.5 Aset Tetap Lainnya, 1.3.6 KDP). Nilai buku barang yang
// tak disusutkan itu = NILAI PEROLEHANNYA, dan selama ini aturan itu diterapkan
// di sisi klien — sendiri-sendiri, di tiap pemakainya.
//
// ⚠️ Itulah yang menggigit 2026-08-16: **Uji Konsistensi** membaca
// `nilai_buku_akhir` mentah lalu melaporkan Tanah & Aset Tetap Lainnya "TIDAK
// COCOK" sebesar SELURUH nilai perolehannya (BKAD 2026-S1: 49.448.614.813 &
// 13.339.400), padahal Laporan BMD yang dibandingkannya menampilkan angka yang
// benar. Halaman yang gunanya justru membuktikan dua laporan sepakat malah
// menuduh keduanya bertengkar — persis kegagalan yang paling mahal, karena
// jawabannya "jangan kirim laporannya dulu".
//
// Aturannya sekarang hidup DI SINI SAJA. Pemakainya:
//   · app/dashboard/pelaporan/bmd/page.tsx        (Laporan BMD Model 1 & 2)
//   · app/dashboard/pelaporan/konsistensi/page.tsx (Uji Konsistensi)
// Dikunci lib/rekapBmd.test.ts.
//
// ⚠️ Aturan yang sama juga hidup di `fetchSnapshotPositions` (lib/rekon.ts,
// `nilaiBuku: susut ? p.nilai_buku_akhir : nilai`) dan `fetchPenyusutanAset` —
// TIDAK bisa disatukan ke sini karena keduanya bekerja PER ASET dari
// `penyusutan_semester`, bukan per sel hasil agregasi SQL. Yang menjaga
// keduanya tetap sepakat adalah halaman Uji Konsistensi itu sendiri.
import { GOLONGAN_REKAP } from '@/lib/bmd'

/** Satu baris hasil `fn_rekap_bmd` (per skpd_id × golongan). */
export type RekapRpcRow = {
  skpd_id: number
  golongan: string
  kuantitas: number
  perolehan: number
  akumulasi: number
  beban: number
  nilai_buku_akhir: number
  count_peny: number
}

export type RekapUkuran = {
  kuantitas: number
  perolehan: number
  akumulasi: number
  beban: number
  nilaiBuku: number
}

export const zeroRekap = (): RekapUkuran => ({ kuantitas: 0, perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })

const GOL_DISUSUTKAN = new Set(GOLONGAN_REKAP.filter(g => g.disusutkan).map(g => g.kode))

/**
 * Apakah hasil engine boleh dipakai untuk SATU baris RPC. Dua syarat, dan
 * keduanya perlu:
 *   1. golongannya memang disusutkan — Tanah/ATL/KDP tak pernah punya baris
 *      engine, jadi nol di sini berarti "tak ada penyusutan", bukan "nilai
 *      bukunya habis";
 *   2. selnya benar-benar punya baris engine (`count_peny > 0`) — golongan yang
 *      disusutkan pun bisa belum pernah dihitung engine (mis. barang baru
 *      di-approve setelah engine terakhir dijalankan).
 */
export function pakaiHasilEngine(r: Pick<RekapRpcRow, 'golongan' | 'count_peny'>): boolean {
  return GOL_DISUSUTKAN.has(r.golongan) && Number(r.count_peny) > 0
}

/**
 * Nilai buku SATU baris RPC sesudah aturan fallback di atas.
 *
 * ⚠️ Diterapkan PER BARIS (per skpd × golongan), bukan sesudah dijumlah per
 * golongan. Versi lama Model 1 menjumlah `nilai_buku_akhir` hanya dari baris
 * yang ber-engine lalu memakai totalnya apa adanya — jadi kalau dalam satu
 * golongan ADA SKPD yang belum dihitung engine, nilai perolehan SKPD itu hilang
 * sama sekali dari kolom Nilai Buku dan identitas `perolehan − akumulasi =
 * nilai buku` patah tanpa satu pun pesan. Per baris, identitas itu utuh lagi.
 */
export function nilaiBukuSel(r: Pick<RekapRpcRow, 'golongan' | 'perolehan' | 'nilai_buku_akhir' | 'count_peny'>): number {
  return pakaiHasilEngine(r) ? Number(r.nilai_buku_akhir) : Number(r.perolehan)
}

/** Agregasi baris RPC → per golongan, dengan aturan nilai buku sudah diterapkan. */
export function rekapPerGolongan(rows: RekapRpcRow[]): Map<string, RekapUkuran> {
  const out = new Map<string, RekapUkuran>()
  for (const r of rows) {
    const c = out.get(r.golongan) ?? zeroRekap()
    c.kuantitas += Number(r.kuantitas)
    c.perolehan += Number(r.perolehan)
    c.akumulasi += Number(r.akumulasi)
    c.beban += Number(r.beban)
    c.nilaiBuku += nilaiBukuSel(r)
    out.set(r.golongan, c)
  }
  return out
}
