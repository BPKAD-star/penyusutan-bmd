import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Middleware ini jalan di SETIAP permintaan yang cocok `matcher` di bawah —
// termasuk tiap navigasi RSC di dalam dashboard dan tiap PREFETCH yang
// ditembakkan Next saat pranala di sidebar tersentuh kursor. Isi mahalnya cuma
// satu: `supabase.auth.getUser()`, yang merupakan PANGGILAN JARINGAN ke server
// auth Supabase (`/auth/v1/user`) — bukan pembacaan cookie lokal.
//
// ⚠️ Yang TIDAK boleh dilakukan di sini: menyimpulkan "sudah login" dari isi
// cookie tanpa verifikasi ke server. Cookie bisa dikarang, dan gerbang inilah
// yang menahan orang luar dari /dashboard. Jadi jalur MENGIZINKAN tetap lewat
// `getUser()` apa adanya — termasuk efek sampingnya yang penting, yaitu
// MENYEGARKAN token & menuliskan cookie barunya (tanpa itu sesi operator mati
// sendiri di tengah kerja).
//
// Yang dipangkas cuma jalur MENOLAK, dan itu aman tanpa verifikasi apa pun:
// tanpa cookie sesi sama sekali, mustahil ada sesi sah — jawabannya sudah pasti
// "belum login" sebelum bertanya. Menanyakannya ke Supabase cuma menambah satu
// round-trip penuh untuk mendapat jawaban yang sudah diketahui.
//
// ⚠️ Catatan jujur soal performa: middleware BUKAN penyebab Dashboard lambat.
// Biayanya di kisaran ratusan milidetik, sedangkan yang terukur 7,9 dtk itu
// render server component-nya (`dashboard?_rsc`) — lihat `countPenghapusan` di
// app/dashboard/page.tsx & migrasi 20260814_03. Jangan mencari-cari sisa
// lambatnya di berkas ini.

// Supabase SSR menyimpan sesi di cookie bernama `sb-<project-ref>-auth-token`,
// dan MEMECAHNYA jadi `...auth-token.0`, `...auth-token.1` dst kalau tokennya
// panjang. Karena itu dicocokkan lewat pola nama, bukan nama persis.
function punyaCookieSesi(request: NextRequest): boolean {
  return request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const diDashboard = pathname.startsWith('/dashboard')

  // Jalur cepat TANPA jaringan: belum ada cookie sesi → pasti belum login.
  if (!punyaCookieSesi(request)) {
    return diDashboard
      ? NextResponse.redirect(new URL('/login', request.url))
      : NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user && diDashboard) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
