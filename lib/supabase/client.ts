import { createBrowserClient } from '@supabase/ssr'

// ⚠️ Client ini SENGAJA belum diberi tipe `Database` (REFACTOR-PLAN §3, Fase
// 0.8). Bukan karena kelupaan: `createBrowserClient<Database>` dari
// @supabase/ssr 0.5.2 TIDAK meneruskan generic-nya ke supabase-js 2.108.2 —
// ssr menghasilkan `SupabaseClient<Database, "public", Schema>` (3 parameter)
// sementara supabase-js kini menuntut 4. Akibatnya seluruh `.insert()`/
// `.update()` jatuh ke `never` → 239 error typecheck, diukur 2026-08-06.
// Lewat `createClient` dari supabase-js LANGSUNG tipenya bekerja normal, jadi
// yang perlu diselesaikan adalah versi @supabase/ssr, bukan tipenya.
// Sampai itu diputuskan: pakai `Tables<'aset'>` dkk dari
// shared/types/database.types.ts untuk menganotasi baris — itu sudah bisa
// dipakai sekarang tanpa menyentuh client ini.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
