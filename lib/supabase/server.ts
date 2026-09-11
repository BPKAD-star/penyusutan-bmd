import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ⚠️ SEMUA pembacaan Supabase dari SERVER wajib `cache: 'no-store'`.
//
// Insiden 2026-09-11 (KIBAR). Aset tanah direklas 03:54 UTC — `aset.kode`,
// `kode_register`, & `uraian` berubah di DB — tapi halaman
// `/kibar/<nibar>` di DOMAIN PRODUCTION tetap menampilkan nilai LAMA
// berjam-jam sesudahnya, sementara URL deployment PREVIEW dgn commit yang
// SAMA PERSIS menampilkan nilai baru. Dibuktikan bukan salah kolom: yang
// tampil di production persis `aset_kode_register.kode_lama` (foto baris
// SEBELUM reklas) — kode, kode register, uraian, & satuan semuanya versi
// lama dan konsisten satu sama lain.
//
// Sebabnya **Data Cache Vercel**: `fetch` di Next.js App Router dibungkus
// lapisan cache yang PERSISTEN LINTAS DEPLOYMENT dan NAMESPACE-nya TERPISAH
// antara Production & Preview — itu yang membuat preview segar sementara
// production menyajikan hasil query beku. Deploy ulang TIDAK
// membersihkannya, jadi gejalanya terbaca sbg "kodenya belum ke-deploy"
// padahal kodenya sudah benar (label BKAD yang baru ikut tampil di layar
// yang sama).
//
// ⚠️ **`export const dynamic = 'force-dynamic'` TIDAK CUKUP** — halaman KIBAR
// sudah memakainya sejak awal dan tetap kena. Yang menutup lubangnya cuma
// opsi `cache` di panggilan fetch-nya sendiri.
//
// Dipasang DI SINI, bukan di tiap halaman, karena ini repo yang aturannya
// gampang kelupaan disalin: halaman server BARU yang lupa menambahkan
// gerbangnya akan menyajikan angka basi TANPA SATU PUN ERROR — kelas
// kegagalan paling mahal di aplikasi ini. Tak ada satu pun pembaca server di
// sini yang boleh menyajikan data beku: register, ledger, & laporan BMD
// semuanya data hidup.
const fetchTanpaCache: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' })

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchTanpaCache },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: fetchTanpaCache }, cookies: { getAll: () => [], setAll: () => {} } }
  )
}
