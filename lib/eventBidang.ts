// Aturan MURNI bagian "Event" di halaman Dokumen Sumber (arsip event Bidang
// Pengelolaan BMD: bimtek, sosialisasi, rakor). Lapisan datanya
// lib/eventBidangData.ts; tampilannya components/dashboard/dokumen/Event*.tsx.
// Migrasi 20261011_01.

export type JenisBerkasEvent = 'materi' | 'dokumentasi'

export type BerkasEvent = {
  id: string
  event_id: string
  jenis: JenisBerkasEvent
  judul: string
  keterangan: string | null
  url: string | null
  file_path: string | null
  created_at: string
}

export type EventBidang = {
  id: string
  nama: string
  tanggal: string
  tempat: string | null
  keterangan: string | null
  created_at: string
  berkas: BerkasEvent[]
}

/** Pagu bucket `event-materi` (migrasi 20261011_01) — 20 MB. */
export const MAKS_BERKAS_EVENT = 20 * 1024 * 1024

/** Untuk atribut `accept` kotak pilih berkas — KEMBAR dgn `allowed_mime_types` bucket. */
export const AKSEP_BERKAS_EVENT = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp'

/**
 * Tautan ketikan operator → tautan sah, atau `null`.
 *
 * Skema `http(s)` WAJIB: tautan dirender sebagai `href`, jadi `javascript:` dkk.
 * tak boleh lolos. Tanpa skema ("drive.google.com/…") dilengkapi `https://`
 * supaya salinan dari bilah alamat yang terpotong tetap diterima. KEMBAR dgn
 * CHECK `bidang_event_berkas_url_sah` — yang lolos di sini tak boleh ditolak DB.
 */
export function normalisasiUrl(s: string): string | null {
  const t = (s || '').trim()
  if (!t || /\s/.test(t)) return null
  const lengkap = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  if (!/^https?:\/\/\S+$/i.test(lengkap)) return null
  try {
    const u = new URL(lengkap)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // "https://abc" (tanpa titik) hampir pasti salah ketik, bukan tautan Drive.
    if (!u.hostname.includes('.')) return null
  } catch {
    return null
  }
  return lengkap
}

/** Nama pendek untuk tautan di daftar: "drive.google.com". */
export function hostTautan(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export const tahunEvent = (tanggal: string): number => Number((tanggal || '').slice(0, 4)) || 0

/** Tahun-tahun yang punya event, terbaru dulu. */
export function daftarTahunEvent(events: EventBidang[]): number[] {
  return [...new Set(events.map(e => tahunEvent(e.tanggal)).filter(Boolean))].sort((a, b) => b - a)
}

export const berkasEvent = (e: EventBidang, jenis: JenisBerkasEvent): BerkasEvent[] =>
  e.berkas.filter(b => b.jenis === jenis)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))

/** Terbaru dulu; `id` sbg pemecah seri supaya urutannya tak bergeser tiap render. */
export const urutEvent = (a: EventBidang, b: EventBidang): number =>
  b.tanggal.localeCompare(a.tanggal) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)

/** Ringkasan di kepala kartu: "3 materi · 1 dokumentasi". */
export function ringkasEvent(e: EventBidang): string {
  const m = berkasEvent(e, 'materi').length
  const d = berkasEvent(e, 'dokumentasi').length
  return `${m} materi · ${d} dokumentasi`
}
