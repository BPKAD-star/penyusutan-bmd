// ============================================================================
// Aturan & aritmetika **Penggabungan Barang** — N barang sumber → 1 induk.
//
// Diangkat dari `KoreksiForm` (components/pengelolaan/Koreksi.tsx) 2026-09-15,
// saudara kembar lib/pemecahanNilai.ts. Sama seperti di sana, angkanya masuk
// ledger (`penggabungan_masuk` / `penggabungan`) lalu ikut ke neraca, dan
// sampai hari itu ia tinggal di dalam komponen React tanpa satu pun test.
//
// ⚠️ **BUKAN "Pencatatan Ganda", dan menukarnya merusak neraca diam-diam.**
// Pencatatan Ganda = barang kecatat DUA KALI → duplikat dibuang, total nilai
// TURUN. Penggabungan = satu barang TERPECAH jadi banyak baris (impor e-BMD
// memecah barang bersatuan non-unit) → nilai DIJUMLAHKAN, total TETAP.
// Kasus yang melahirkannya: "Pagar Besi" UPTD SMPN 2 Mojo, 35 baris ×
// Rp721.500 = Rp25.252.500 — itu SATU pagar.
//
// Syarat gabung (keputusan user 2026-08-11): kode barang + nilai perolehan +
// tanggal perolehan sama. Nama, merek, SATUAN, & spesifikasi BOLEH beda —
// justru itu yang selama ini menghalangi kasus pagar, yang tersebar di satuan
// "Meter Persegi"/"unit"/"Buah"/"Set".
//
// Dikunci lib/penggabunganNilai.test.ts.
// ============================================================================
import { keSen } from './pemecahanNilai'

/** Bentuk MINIMAL yang dibutuhkan aturan gabung — sengaja tak menyeret tipe
 *  baris register seutuhnya, supaya lib ini tak bergantung pada komponen. */
export type AnggotaGabung = {
  id: string
  kode: string
  nilai_perolehan: number
  tgl_perolehan: string | null
}

/**
 * Kunci kelayakan gabung — ketiga syarat jadi SATU string.
 *
 * ⚠️ Sengaja satu string, bukan tiga perbandingan: supaya tak ada satu pun
 * tempat yang membandingkan dua dari tiga syaratnya saja lalu meloloskan
 * barang yang tak sejenis.
 *
 * ⚠️⚠️ `Math.round` MEMBULATKAN KE RUPIAH, jadi dua barang yang nilainya
 * membulat ke rupiah yang SAMA dianggap sejenis (mis. 721.500,10 vs
 * 721.500,40) — padahal aturannya "sama PERSIS". Kelonggarannya se-bucket
 * pembulatan, bukan "sen diabaikan": 721.500,49 vs 721.500,51 tetap
 * DIBEDAKAN, karena keduanya melewati titik tengah. Ini DIPERTAHANKAN apa
 * adanya saat pengangkatan (murni pindah), dan hari ini tak tergigit karena
 * KEDUA pintu yang mengisi daftar anggota (`cariGabung` & `muatSejenis`)
 * sudah menyaring `.eq('nilai_perolehan', …)` yang EKSAK — jadi penjaga lapis
 * kedua ini cuma lebih longgar dari pintunya, bukan lebih longgar dari
 * kenyataan. Kalau kelak ada pintu ketiga yang tak menyaring eksak, DI SINI
 * tempatnya diperketat (`keSen`, bukan `Math.round`) — dan itu keputusan yang
 * mengubah kelayakan gabung di data hidup, jadi bukan "sekalian dirapikan".
 * Perilaku ini dikunci test supaya perubahannya tak pernah senyap.
 */
export const kunciGabung = (k: Pick<AnggotaGabung, 'kode' | 'nilai_perolehan' | 'tgl_perolehan'>) =>
  `${k.kode}|${Math.round(k.nilai_perolehan)}|${k.tgl_perolehan || '-'}`

/** Minimal DUA anggota, dan semuanya sekunci dengan yang pertama. */
export function syaratGabungOk(list: readonly AnggotaGabung[]): boolean {
  return list.length >= 2 && list.every(k => kunciGabung(k) === kunciGabung(list[0]))
}

/**
 * Σ nilai perolehan anggota, DIJUMLAH DALAM SEN.
 *
 * ⚠️ `Math.round` per anggota (bentuk lama) membuang sen tiap barang sumber,
 * padahal barang itu duduk di Saldo Awal dengan nilai berdesimalnya —
 * selisihnya jatuh ke Rekonsiliasi. Alasan yang sama persis dengan
 * lib/pemecahanNilai.ts.
 */
export function totalNilaiGabung(list: readonly AnggotaGabung[]): number {
  return list.reduce((s, k) => s + keSen(k.nilai_perolehan), 0) / 100
}

/**
 * Σ akumulasi penyusutan anggota pada periode basis.
 *
 * `basis` null = belum termuat → 0. Anggota yang tak ada di peta dihitung 0,
 * TAPI keadaan itu seharusnya sudah ditolak lebih dulu oleh
 * `anggotaTanpaBasis` — lihat catatan di sana.
 *
 * ⚠️ Dijumlah sebagai float, BUKAN sen — dipertahankan apa adanya dari bentuk
 * lamanya. Beda dari `totalNilaiGabung` di atas, dan perbedaan itu memang ada
 * di kode aslinya; menyeragamkannya mengubah angka yang masuk ledger, jadi ia
 * keputusan tersendiri, bukan kerapian.
 */
export function totalAkumulasiGabung(
  list: readonly AnggotaGabung[],
  basis: Record<string, number> | null,
): number {
  if (!basis) return 0
  return list.reduce((s, k) => s + (basis[k.id] || 0), 0)
}

/**
 * Anggota yang TIDAK punya baris `penyusutan_semester` di periode basis.
 *
 * ⚠️ Wajib memblokir penyimpanan. Kalau akumulasinya diam-diam jatuh ke 0,
 * akumulasi barang itu HILANG dari neraca tanpa satu pun error — dan
 * penggabungan justru peristiwa yang totalnya harus TETAP.
 *
 * Membedakan "tak ada di peta" dari "ada, bernilai 0" itu inti fungsinya:
 * `map[id] === undefined`, bukan `!map[id]`.
 */
export function anggotaTanpaBasis(ids: readonly string[], basis: Record<string, number>): string[] {
  return ids.filter(id => basis[id] === undefined)
}
