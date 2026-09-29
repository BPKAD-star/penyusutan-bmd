// Pengguna ISTIMEWA Asisten AI — akun tertentu yang diberi alat baca tambahan
// (lib/chatbot/toolsAdmin.ts). Keputusan user 2026-09-29: dibuka bertahap,
// TAHAP 1 = hanya-baca; entry (kalau kelak diizinkan) belum ada.
//
// ⚠️ DIKENALI LEWAT USER ID AKUN LOGIN (auth.users.id), BUKAN nama/email/id
// pegawai. Nama pegawai dan email bisa berganti atau dipalsukan, dan id di tabel
// `admin_pegawai` itu id PEGAWAI, bukan id akun — dua id yang berbeda. Yang
// dipakai id akun yang datang dari `supabase.auth.getUser()` di server.
//
// Daftarnya di env `CHATBOT_USER_ISTIMEWA` (dipisah koma), sengaja BUKAN di
// kode: menambah/mencabut orang tak perlu deploy, dan id akun tak masuk repo.
// ⚠️ FAIL-CLOSED: env kosong / tak terbaca / bentuknya bukan UUID = TIDAK ADA
// yang istimewa. Gagal ke arah "tak ada akses tambahan", tak pernah sebaliknya.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bagian murni (bisa diuji): daftar id valid dari string env mentah. */
export function daftarIstimewa(mentah: string | undefined): Set<string> {
  return new Set(
    (mentah || '').split(',').map(s => s.trim().toLowerCase()).filter(s => UUID.test(s)),
  )
}

export function penggunaIstimewa(userId: string | null | undefined): boolean {
  if (!userId) return false
  return daftarIstimewa(process.env.CHATBOT_USER_ISTIMEWA).has(userId.toLowerCase())
}
