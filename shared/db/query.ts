// ============================================================================
// assertOk() — `error` tidak bisa ditelan (rules.md §2.1).
//
// Masalah terukur: 166 pemakaian `const { data } = await supabase…` yang tidak
// menyentuh `error` sama sekali (diukur ulang 2026-08-06 — belum bergerak).
// Query gagal → `data` null → fungsi mengembalikan set/array kosong → terbaca
// sebagai KEBALIKAN kenyataan ("tidak ada yang dibatalkan"), tanpa satu pun
// pesan. docs/insiden.md INS-06, INS-08, INS-09, INS-19.
// ============================================================================

export type HasilTunggal<T> = { data: T | null; error: { message: string } | null }

/**
 * Buka hasil query, MELEMPAR kalau gagal ATAU kalau datanya tidak ada.
 *
 * Dipakai untuk pembacaan yang hasilnya ikut DIHITUNG atau ikut DIFILTER —
 * di situ "tidak ada data" tak pernah boleh diam-diam berarti nol.
 */
export function assertOk<T>(res: HasilTunggal<T>, label: string): T {
  if (res.error) throw new Error(`gagal membaca ${label}: ${res.error.message}`)
  if (res.data == null) throw new Error(`gagal membaca ${label}: data kosong`)
  return res.data
}

/**
 * Untuk pencarian OPSIONAL yang "tidak ketemu" memang bukan kegagalan —
 * mis. `.maybeSingle()` mencari preferensi yang boleh belum ada.
 *
 * Bedanya dengan `const { data } = await …` yang dilarang: ini tetap MELEMPAR
 * kalau query-nya benar-benar gagal. Yang ditoleransi cuma "query sukses, tak
 * ada barisnya".
 *
 * ⚠️ JANGAN dipakai kalau nilainya ikut dihitung/difilter. Lihat `generateNibars`
 * (docs/insiden.md INS-09): lookup gagal → nomor urut diam-diam mengulang dari 1,
 * dan yang menyelamatkan cuma constraint UNIQUE.
 */
export function assertOkOpsional<T>(res: HasilTunggal<T>, label: string): T | null {
  if (res.error) throw new Error(`gagal membaca ${label}: ${res.error.message}`)
  return res.data
}

/**
 * Untuk perintah TULIS yang tidak mengembalikan baris (insert/update/delete
 * tanpa `.select()`). Hanya memeriksa `error`.
 */
export function assertTulisOk(res: { error: { message: string } | null }, label: string): void {
  if (res.error) throw new Error(`gagal menyimpan ${label}: ${res.error.message}`)
}
