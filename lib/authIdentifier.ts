// Supabase Auth (GoTrue) mewajibkan kolom email berformat valid (ada '@') utk
// login/create user — tak bisa string bebas apa adanya. Supaya operator boleh
// login cukup pakai username bebas (mis. NIP atau "pengurusadimas") TANPA
// kehilangan opsi pakai email asli, kita deteksi otomatis: ada '@' → dipakai
// apa adanya (email asli, perilaku lama tetap aman); tidak ada '@' → dianggap
// username bebas, ditempeli domain sintetis di bawah ini supaya lolos syarat
// format Supabase. Domain ini TIDAK PERNAH dipakai kirim surel sungguhan
// (create-user selalu set email_confirm:true, jadi tak ada verifikasi email).
// Dipakai di app/api/admin/create-user (server) & app/login (client) — harus
// identik supaya identifier yang dibuat admin bisa dipakai login user.
const DOMAIN_SINTETIS = 'pengguna.bmd.internal'

export function toAuthEmail(identifier: string): string {
  const trimmed = identifier.trim().toLowerCase()
  if (trimmed.includes('@')) return trimmed
  const local = trimmed.replace(/[^a-z0-9._-]/g, '')
  return `${local}@${DOMAIN_SINTETIS}`
}
