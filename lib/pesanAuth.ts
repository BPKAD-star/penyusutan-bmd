// Pesan kegagalan Supabase Auth → bahasa Indonesia (permintaan user 2026-10-01).
// Dipakai SEMUA pintu yang menulis password: halaman Profil (ganti password) dan
// API admin (buat akun, reset password). Kebijakan password-nya satu — ditegakkan
// Supabase Auth, bukan aplikasi ini — jadi terjemahannya juga harus satu.
//
// ⚠️ Kebijakan di server (`weak_password`) LEBIH KETAT daripada aturan di form:
// proteksi password bocor (HaveIBeenPwned) aktif di proyek ini, jadi password yang
// panjangnya cukup pun ditolak kalau pernah bocor di internet (mis. "@dimas04").
// Itu sebab daftar `reasons` dibaca satu per satu, bukan diringkas "password lemah".

/** Bentuk minimal yang dibaca — cocok dgn AuthError supabase-js maupun JSON API kita. */
export type GalatAuth = { message?: string; code?: string; status?: number; reasons?: string[] }

/** Teks aturan password — SATU sumber utk petunjuk di form & pesan galat. */
export const ATURAN_PASSWORD =
  'Minimal 8 karakter, dan sebaiknya memadukan huruf besar, huruf kecil, angka, dan simbol. ' +
  'Jangan memakai password umum, nama, NIP, atau tanggal lahir — password yang pernah bocor di internet akan ditolak.'

const ALASAN_LEMAH: Record<string, string> = {
  length: 'terlalu pendek',
  characters: 'kurang beragam — harus memadukan huruf besar, huruf kecil, angka, dan simbol',
  pwned: 'pernah bocor di internet dan banyak dipakai orang, sehingga mudah ditebak',
}

export function pesanAuthID(e: GalatAuth | null | undefined, fallback = 'Terjadi kesalahan.'): string {
  if (!e) return fallback
  const code = e.code || ''
  const pesan = e.message || ''

  if (code === 'weak_password' || /weak|easy to guess/i.test(pesan)) {
    const alasan = (e.reasons || []).map(r => ALASAN_LEMAH[r]).filter(Boolean)
    const sebab = alasan.length > 0 ? alasan.join('; ') : 'terlalu lemah atau mudah ditebak'
    return `Password ditolak karena ${sebab}. Gunakan password lain. ${ATURAN_PASSWORD}`
  }
  if (code === 'same_password' || /different from the old password/i.test(pesan)) {
    return 'Password baru harus berbeda dari password lama.'
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(pesan)) {
    return 'Password lama salah.'
  }
  if (code === 'reauthentication_needed' || code === 'session_expired' || code === 'session_not_found' ||
      code === 'refresh_token_not_found' || /session/i.test(pesan) && /expired|missing|not found/i.test(pesan)) {
    return 'Sesi login sudah berakhir. Keluar lalu masuk kembali, kemudian ulangi.'
  }
  if (code === 'over_request_rate_limit' || e.status === 429 || /rate limit/i.test(pesan)) {
    return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
  }
  if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered/i.test(pesan)) {
    return 'Username/email ini sudah dipakai akun lain.'
  }
  if (/failed to fetch|network|fetch failed/i.test(pesan)) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.'
  }
  // Tak dikenal: jangan menyembunyikan pesan aslinya — petugas perlu sesuatu
  // untuk dilaporkan ke admin.
  return pesan ? `${fallback} (${pesan})` : fallback
}
