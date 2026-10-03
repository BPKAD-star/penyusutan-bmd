// Cache angka Dashboard DI BROWSER pengguna (permintaan user 2026-10-03).
//
// ⚠️ INI BUKAN CACHE YANG MELEWATI QUERY. Server SELALU menghitung ulang setiap
// kali Dashboard dibuka; angka tersimpan hanya menggantikan kartu skeleton
// SELAMA angka baru belum tiba, lalu langsung ditimpa. Jadi beban database tidak
// berkurang — yang didapat cuma kunjungan ulang yang langsung berisi. Versi yang
// melewati query akan menyajikan angka lama sebagai angka resmi, dan di aplikasi
// yang angkanya dilaporkan ke inspektorat/BPK itu ditolak.
//
// Tiga penjagaan, dan ketiganya wajib:
//   1. `sessionStorage`, BUKAN `localStorage` — hilang begitu tab ditutup.
//      Komputer kantor sering dipakai bergantian.
//   2. Kunci memuat `uid` — angka dihitung per cakupan SKPD (RLS / cakupan di
//      fn_dashboard_rekap), jadi angka satu pengguna tak boleh terbaca pengguna
//      lain di tab yang sama. Ditambah: seluruh cache dihapus saat logout.
//   3. Kunci memuat `VERSI` — kalau bentuk datanya kelak berubah, naikkan versinya
//      supaya salinan lama tak pernah dirender dgn bentuk yang salah. Isi juga
//      diperiksa bentuknya saat dibaca; yang aneh dianggap tak ada.
//
// Hanya hasil yang SUKSES yang disimpan (pemanggil tak menulis saat `err`) —
// angka nol dari query gagal tak boleh muncul lagi sebagai "angka tersimpan".

export const UMUR_CACHE_MS = 10 * 60 * 1000
export const VERSI_CACHE = 'v1'
const AWALAN = 'bmd_dashboard_cache'

// Hanya seksi yang digambar MURNI dari angka server. Cara Perolehan & Mutasi
// sengaja tak ikut: kartunya menghitung "menunggu" sendiri di browser, jadi
// versi tersimpannya akan menampilkan "0 menunggu · 100%" yang tampak sah.
export type KunciCache = 'scan' | 'hapus'

type Penyimpan = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export const kunciStorage = (uid: string, k: KunciCache) => `${AWALAN}:${VERSI_CACHE}:${uid}:${k}`

export function tulisCache(s: Penyimpan, uid: string, k: KunciCache, data: unknown, sekarang = Date.now()): void {
  try { s.setItem(kunciStorage(uid, k), JSON.stringify({ t: sekarang, data })) } catch { /* penuh / diblokir: cache cuma kenyamanan */ }
}

export function bacaCache<T>(
  s: Penyimpan, uid: string, k: KunciCache, sah: (d: unknown) => d is T, sekarang = Date.now(),
): { data: T; t: number } | null {
  try {
    const mentah = s.getItem(kunciStorage(uid, k))
    if (!mentah) return null
    const o = JSON.parse(mentah) as { t?: unknown; data?: unknown }
    if (typeof o.t !== 'number' || sekarang - o.t > UMUR_CACHE_MS || o.t > sekarang + 60_000) return null
    return sah(o.data) ? { data: o.data, t: o.t } : null
  } catch {
    return null
  }
}

/** Hapus SELURUH cache Dashboard (semua pengguna, semua versi) — dipanggil saat logout. */
export function hapusSemuaCache(s: Penyimpan): void {
  try {
    const buang: string[] = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith(`${AWALAN}:`)) buang.push(k)
    }
    for (const k of buang) s.removeItem(k)
  } catch { /* diblokir: tak ada yang bisa dihapus */ }
}

// ── Bentuk data & pemeriksanya ──────────────────────────────────────────────
export type ScanDashboard = {
  gol: Record<string, { count: number; nilai: number }>
  caraNilai: Record<string, number>
  caraCount: Record<string, number>
  err: string
}
export type JmlNilai = { n: number; nilai: number }
export type HapusDashboard = {
  data: { hibah: JmlNilai; jual: JmlNilai; tukar: JmlNilai; modal: JmlNilai; sebabLain: JmlNilai }
  err: string
}

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const angka = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const petaAngka = (x: unknown) => obj(x) && Object.values(x).every(angka)

export function sahScan(d: unknown): d is ScanDashboard {
  return obj(d) && d.err === '' && obj(d.gol)
    && Object.values(d.gol).every(v => obj(v) && angka(v.count) && angka(v.nilai))
    && petaAngka(d.caraNilai) && petaAngka(d.caraCount)
}

export function sahHapus(d: unknown): d is HapusDashboard {
  if (!obj(d) || d.err !== '' || !obj(d.data)) return false
  const isi = d.data
  return (['hibah', 'jual', 'tukar', 'modal', 'sebabLain'] as const)
    .every(k => obj(isi[k]) && angka((isi[k] as Record<string, unknown>).n) && angka((isi[k] as Record<string, unknown>).nilai))
}

export const jamCache = (t: number) =>
  new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
