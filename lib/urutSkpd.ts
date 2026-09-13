// Urutan baris laporan transaksi menurut SKPD.
//
// ⚠️ DIEKSTRAK DI KEMUNCULAN KEDUA, bukan ketiga — dan itu penyimpangan yang
// disengaja dari "rule of three" (CODING-STANDARD §1.2). Alasannya bukan
// kerapian: yang dijaga di sini **pemecah seri `id`**, dan itu satu-satunya
// bagian yang kalau hilang TIDAK menghasilkan error apa pun — daftarnya cuma
// berpindah-pindah sendiri tiap render, dan operator membacanya sebagai
// "datanya berubah". Aturan yang kegagalannya senyap butuh penegak, bukan
// komentar; dikunci lib/urutSkpd.test.ts.
//
// Dipakai: components/pelaporan/LaporanKoreksi.tsx & LaporanReklas.tsx.
// ⚠️ Yang SENGAJA tak ikut diangkat: cara tiap menu MENDAPATKAN nama unit &
// induknya. Laporan Koreksi membacanya dari `skpdById` (pohon SKPD di klien),
// Laporan Reklasifikasi dari `r.skpdNama` yang sudah dibawa pemuatnya. Dua
// jalan itu memang berbeda & keduanya benar; yang harus sama cuma URUTANNYA.

export type NamaSkpdBaris<T> = {
  /** Nama UNIT-nya (Bagian/UPTD), bukan induknya. */
  unit: (r: T) => string
  /** Nama INDUK, atau '' kalau barisnya memang milik SKPD induk itu sendiri. */
  induk: (r: T) => string
}

/**
 * Urut: induk → unit → tanggal TERBARU dulu → `id` menurun (pemecah seri).
 *
 * ⚠️ Mengembalikan array BARU — pemanggil biasanya memegang state React, dan
 * `Array.prototype.sort` mengurutkan di tempat.
 *
 * ⚠️ Baris tanpa induk diurutkan memakai nama UNIT-nya pada kunci pertama,
 * bukan string kosong. Kalau tidak, seluruh SKPD induk berkumpul di pucuk
 * daftar terlepas dari namanya, dan urutannya berhenti terbaca sbg abjad.
 */
export function urutPerSkpd<T extends { tanggal: string; id: number }>(
  rows: readonly T[],
  nama: NamaSkpdBaris<T>,
): T[] {
  return [...rows].sort((a, b) => {
    const ia = nama.induk(a) || nama.unit(a), ib = nama.induk(b) || nama.unit(b)
    if (ia !== ib) return ia.localeCompare(ib, 'id')
    const ua = nama.unit(a), ub = nama.unit(b)
    if (ua !== ub) return ua.localeCompare(ub, 'id')
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1
    return b.id - a.id
  })
}
