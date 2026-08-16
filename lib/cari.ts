// Pencocok kata kunci untuk kotak Cari di daftar-daftar master (Daftar Pegawai,
// Daftar User). Sengaja SATU tempat: dua halaman itu mencari hal yang sama
// (nama · NIP · SKPD) dan kalau aturannya disalin, cepat atau lambat yang satu
// menemukan barisnya sementara yang lain tidak — tanpa satu pun error.
//
// Bukan pencarian ke server: kedua daftar itu memang sudah ditarik seluruhnya ke
// browser (ratusan baris, bukan ratusan ribu), jadi menyaring di memori sudah
// tepat & langsung terasa saat diketik. JANGAN pakai pola ini untuk daftar
// beraset (Daftar Barang dsb) — di sana paginasinya wajib di server.

/** Rapikan spasi & samakan huruf besar/kecil. */
export function normalisasiCari(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * `true` kalau seluruh kata kunci ditemukan di salah satu `bidang`.
 *
 * - **AND antar kata**, bukan OR: "sri kecamatan kras" menyaring nama DAN
 *   SKPD sekaligus. Kalau OR, mengetik lebih spesifik justru menambah hasil.
 * - **Kata kunci kosong → semua lolos**, jadi pemanggil tak perlu bercabang.
 * - Cadangan khusus **NIP**: operator biasa menyalinnya berikut pemisah
 *   ("19730502 200312 1 006" / "19730502.200312.1.006"), sementara di DB ia 18
 *   angka rapat. Kalau kata kuncinya memang deretan angka panjang, angkanya
 *   dibandingkan terpisah. Ambang 4 angka supaya kata biasa yang kebetulan
 *   memuat angka tak ikut terseret ke jalur ini.
 */
export function cocokCari(kataKunci: string, bidang: (string | null | undefined)[]): boolean {
  const kunci = normalisasiCari(kataKunci)
  if (!kunci) return true
  const teks = normalisasiCari(bidang.filter(Boolean).join(' · '))
  if (kunci.split(' ').every(t => teks.includes(t))) return true
  const angkaKunci = kunci.replace(/\D/g, '')
  return angkaKunci.length >= 4 && teks.replace(/\D/g, '').includes(angkaKunci)
}
