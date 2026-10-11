// Aturan MURNI aktivitas pengguna (Admin → Daftar User). Lapisan data:
// lib/aktivitasPenggunaData.ts; migrasi 20261011_02.
//
// Dua sumber digabung per (user, hari WIB):
//   - SESI  — token sesi Supabase (± tiap jam selama tab terbuka). Ada riwayat
//     ke belakang, tapi TIDAK LENGKAP: Supabase membuang token lama secara
//     berkala (terukur 2026-10-11: cuma 314 token tersisa, tertua Juli). Jadi
//     angka dari sumber ini batas BAWAH, bukan hitungan pasti.
//   - LOG   — kunjungan halaman yang dicatat aplikasi sendiri; akurat per menu,
//     baru terisi sejak pencatatnya di-deploy.
// Satu hari dianggap AKTIF bila salah satu sumber mencatat sesuatu.

export type BarisSesi = { user_id: string; tanggal: string; jumlah: number }
export type BarisLog = { user_id: string; tanggal: string; halaman: string; jumlah: number }
export type BarisTerakhir = {
  user_id: string
  login_terakhir: string | null
  sesi_terakhir: string | null
  halaman_terakhir: string | null
}

export type AktivitasHari = { tanggal: string; sesi: number; kunjungan: number }

export type AktivitasUser = {
  /** Satu entri per tanggal di rentang, urut lama → baru (hari kosong ikut, nilainya 0). */
  hari: AktivitasHari[]
  hariAktif: number
  totalKunjungan: number
  /** Paling akhir dari login/sesi/kunjungan; `null` = tak pernah tercatat. */
  terakhir: string | null
  /** Menu yang dibuka dalam rentang, terbanyak dulu. */
  halaman: { halaman: string; jumlah: number }[]
}

/** 'YYYY-MM-DD' menurut WIB untuk sebuah instan. */
export function tanggalWib(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/** `n` tanggal berurutan yang berakhir di `akhir` (inklusif), lama → baru. */
export function deretTanggal(akhir: string, n: number): string[] {
  const [y, m, d] = akhir.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10))
  }
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ANGKA = /^\d+$/

/**
 * Path peramban → kunci halaman yang dicatat. Hanya `/dashboard/...`; segmen
 * yang berupa ID (angka, uuid) diganti `:id` supaya satu menu tak pecah jadi
 * ratusan baris per barang/SKPD. `null` = tak dicatat. KEMBAR dgn CHECK
 * `log_aktivitas.halaman` — yang lolos di sini tak boleh ditolak DB.
 */
export function normalisasiHalaman(pathname: string): string | null {
  const bersih = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (bersih !== '/dashboard' && !bersih.startsWith('/dashboard/')) return null
  const seg = bersih.split('/').slice(1).map(s => (UUID.test(s) || ANGKA.test(s) ? ':id' : s))
  const hasil = '/' + seg.join('/')
  if (hasil.length > 200 || !/^\/dashboard(\/[A-Za-z0-9:_-]+)*$/.test(hasil)) return null
  return hasil
}

/** Label manusiawi: cocok persis di peta menu, lalu awalan terpanjang, lalu dari slug. */
export function labelHalaman(halaman: string, peta: Record<string, string>): string {
  if (peta[halaman]) return peta[halaman]
  const awalan = Object.keys(peta)
    .filter(h => h !== '/dashboard' && halaman.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
  if (awalan) return `${peta[awalan]} › ${halaman.slice(awalan.length + 1).replace(/[-/]/g, ' ')}`
  const slug = halaman.split('/').filter(s => s && s !== 'dashboard' && s !== ':id').pop()
  return slug ? slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : halaman
}

const palingAkhir = (xs: (string | null | undefined)[]): string | null =>
  xs.filter((x): x is string => !!x).sort().pop() ?? null

/** Gabungkan kedua sumber per user untuk rentang `tanggal`. */
export function susunAktivitas(
  tanggal: string[], sesi: BarisSesi[], log: BarisLog[], terakhir: BarisTerakhir[],
): Map<string, AktivitasUser> {
  const dalam = new Set(tanggal)
  const peta = new Map<string, AktivitasUser>()
  const ambil = (uid: string) => {
    let a = peta.get(uid)
    if (!a) {
      a = { hari: tanggal.map(t => ({ tanggal: t, sesi: 0, kunjungan: 0 })), hariAktif: 0, totalKunjungan: 0, terakhir: null, halaman: [] }
      peta.set(uid, a)
    }
    return a
  }
  const idx = new Map(tanggal.map((t, i) => [t, i]))

  for (const s of sesi) {
    if (!dalam.has(s.tanggal)) continue
    ambil(s.user_id).hari[idx.get(s.tanggal)!].sesi += s.jumlah
  }
  const perHalaman = new Map<string, Map<string, number>>()
  for (const l of log) {
    if (!dalam.has(l.tanggal)) continue
    const a = ambil(l.user_id)
    a.hari[idx.get(l.tanggal)!].kunjungan += l.jumlah
    a.totalKunjungan += l.jumlah
    const m = perHalaman.get(l.user_id) ?? new Map<string, number>()
    m.set(l.halaman, (m.get(l.halaman) ?? 0) + l.jumlah)
    perHalaman.set(l.user_id, m)
  }
  for (const t of terakhir) {
    const akhir = palingAkhir([t.login_terakhir, t.sesi_terakhir, t.halaman_terakhir])
    if (akhir) ambil(t.user_id).terakhir = akhir
  }
  for (const [uid, a] of peta) {
    a.hariAktif = a.hari.filter(h => h.sesi > 0 || h.kunjungan > 0).length
    a.halaman = [...(perHalaman.get(uid) ?? new Map<string, number>())]
      .map(([halaman, jumlah]) => ({ halaman, jumlah }))
      .sort((x, y) => y.jumlah - x.jumlah || x.halaman.localeCompare(y.halaman))
  }
  return peta
}

/** Banyaknya user aktif per tanggal (untuk grafik batang). */
export function userAktifPerHari(tanggal: string[], peta: Map<string, AktivitasUser>): number[] {
  return tanggal.map((_, i) => [...peta.values()].filter(a => a.hari[i].sesi > 0 || a.hari[i].kunjungan > 0).length)
}

/** "baru saja" · "15 menit lalu" · "3 jam lalu" · "kemarin" · "5 hari lalu" · tanggal. */
export function waktuRelatif(iso: string | null, kini: Date): string {
  if (!iso) return 'Belum pernah'
  const t = new Date(iso)
  const menit = Math.floor((kini.getTime() - t.getTime()) / 60000)
  if (menit < 2) return 'baru saja'
  if (menit < 60) return `${menit} menit lalu`
  const hariIni = tanggalWib(kini)
  const tgl = tanggalWib(t)
  if (tgl === hariIni) return `${Math.floor(menit / 60)} jam lalu`
  const selisih = Math.round((Date.parse(hariIni) - Date.parse(tgl)) / 86400000)
  if (selisih === 1) return 'kemarin'
  if (selisih < 30) return `${selisih} hari lalu`
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}
