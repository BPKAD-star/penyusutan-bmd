// Nomor HP pegawai (migrasi 20261001_02). SATU pengolah untuk semua pintu
// tulis (halaman Profil & Daftar Pegawai) — DB cuma menegakkan BENTUK akhirnya
// lewat CHECK `^62[0-9]{8,13}$`, jadi dua penormal yang menyimpang akan membuat
// satu pintu menolak nomor yang diterima pintu lain.
//
// Disimpan `62…` (bentuk internasional tanpa +) karena itulah bentuk yang
// dipakai WhatsApp — rencananya chatbot dikenali lewat nomor ini.

/**
 * Terima ketikan bebas ("0812-3456-7890", "+62 812 3456 7890", "812…") → `62…`.
 * Kosong → `null` (menghapus nomor). Tak bisa dijadikan nomor sah → melempar
 * dgn pesan yang bisa ditampilkan apa adanya.
 */
export function normalNoHp(input: string | null | undefined): string | null {
  const mentah = (input || '').trim()
  if (!mentah) return null
  if (/[^\d\s+().-]/.test(mentah)) throw new Error('Nomor HP hanya boleh berisi angka (boleh diawali + dan dipisah spasi/strip).')
  let d = mentah.replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  if (!d.startsWith('62')) throw new Error('Nomor HP harus nomor Indonesia (diawali 08, 62, atau +62).')
  if (!/^62[0-9]{8,13}$/.test(d)) throw new Error('Panjang nomor HP tidak wajar — periksa lagi angkanya.')
  return d
}

/** `6281234567890` → `0812-3456-7890` untuk ditampilkan (bentuk yang dikenal operator). */
export function tampilNoHp(hp: string | null | undefined): string {
  if (!hp) return ''
  const lokal = hp.startsWith('62') ? '0' + hp.slice(2) : hp
  return lokal.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3')
}
