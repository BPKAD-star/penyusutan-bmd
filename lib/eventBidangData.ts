// Pembacaan & penulisan EVENT Bidang Pengelolaan BMD (bagian 4 halaman Dokumen
// Sumber) — satu-satunya tempat yang menyentuh `bidang_event`,
// `bidang_event_berkas`, & bucket `event-materi`. Aturan bentuknya:
// lib/eventBidang.ts. Migrasi 20261011_01.
//
// ⚠️ SEMUANYA MELEMPAR saat gagal — daftar kosong yang sebenarnya "query gagal"
// terbaca operator sbg "eventnya memang belum dicatat", lalu dicatat dobel.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertOk, assertTulisOk } from '@/shared/db/query'
import { urutEvent, MAKS_BERKAS_EVENT, type EventBidang, type BerkasEvent, type JenisBerkasEvent } from '@/lib/eventBidang'

const BUCKET = 'event-materi'

const SEL = 'id,nama,tanggal,tempat,keterangan,created_at,' +
  'berkas:bidang_event_berkas(id,event_id,jenis,judul,keterangan,url,file_path,created_at)'

/** Seluruh event berikut berkasnya, terbaru dulu. Jumlahnya puluhan per tahun — tak perlu paginasi. */
export async function muatEvent(sb: SupabaseClient): Promise<EventBidang[]> {
  const rows = assertOk(
    await sb.from('bidang_event').select(SEL).order('tanggal', { ascending: false }).order('id'),
    'daftar event',
  ) as unknown as EventBidang[]
  return rows.map(e => ({ ...e, berkas: e.berkas ?? [] })).sort(urutEvent)
}

export type IsiEvent = { nama: string; tanggal: string; tempat: string; keterangan: string }

const kosongJadiNull = (s: string) => s.trim() || null

/** `id` kosong = event baru. */
export async function simpanEvent(sb: SupabaseClient, id: string | null, isi: IsiEvent): Promise<void> {
  const baris = {
    nama: isi.nama.trim(), tanggal: isi.tanggal,
    tempat: kosongJadiNull(isi.tempat), keterangan: kosongJadiNull(isi.keterangan),
  }
  if (id) {
    const { data, error } = await sb.from('bidang_event').update(baris).eq('id', id).select('id')
    if (error) throw new Error(`gagal menyimpan event: ${error.message}`)
    // UPDATE yang ditolak RLS tak melempar — cuma 0 baris.
    if (!data || data.length === 0) throw new Error('gagal menyimpan event: tidak ada baris yang berubah (hanya admin yang boleh mengubah event).')
  } else {
    assertTulisOk(await sb.from('bidang_event').insert(baris), 'event')
  }
}

export async function hapusEvent(sb: SupabaseClient, e: EventBidang): Promise<void> {
  // Baris dulu, berkas kemudian (pola hapusPeraturan): kalau baris ditolak RLS,
  // daftar tak boleh sudah kehilangan berkas fisiknya.
  const { data, error } = await sb.from('bidang_event').delete().eq('id', e.id).select('id')
  if (error) throw new Error(`gagal menghapus event: ${error.message}`)
  if (!data || data.length === 0) throw new Error('gagal menghapus event: tidak ada baris yang terhapus (hanya admin yang boleh menghapus event).')
  const paths = e.berkas.map(b => b.file_path).filter((p): p is string => !!p)
  if (paths.length) await sb.storage.from(BUCKET).remove(paths)
}

/** Nama berkas aman untuk kunci storage; nama aslinya tetap terbaca dari `judul`. */
const namaAman = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'berkas'

export type IsiBerkas = {
  jenis: JenisBerkasEvent
  judul: string
  keterangan: string
  /** Tepat satu dari `url` / `file` untuk materi; dokumentasi hanya `url`. */
  url?: string
  file?: File
}

export async function tambahBerkas(sb: SupabaseClient, eventId: string, isi: IsiBerkas): Promise<void> {
  let path: string | null = null
  if (isi.file) {
    if (isi.file.size > MAKS_BERKAS_EVENT) throw new Error('berkas melebihi batas 20 MB — tautkan dari Drive saja.')
    path = `${eventId}/${crypto.randomUUID()}/${namaAman(isi.file.name)}`
    const { error } = await sb.storage.from(BUCKET).upload(path, isi.file)
    if (error) throw new Error(`gagal mengunggah berkas: ${error.message}`)
  }
  try {
    assertTulisOk(
      await sb.from('bidang_event_berkas').insert({
        event_id: eventId, jenis: isi.jenis, judul: isi.judul.trim(),
        keterangan: kosongJadiNull(isi.keterangan), url: isi.url ?? null, file_path: path,
      }),
      isi.jenis === 'materi' ? 'materi' : 'dokumentasi',
    )
  } catch (e) {
    // Barisnya gagal tercatat → berkas yang terlanjur naik jadi yatim; dibuang.
    if (path) await sb.storage.from(BUCKET).remove([path])
    throw e
  }
}

export async function hapusBerkas(sb: SupabaseClient, b: BerkasEvent): Promise<void> {
  const { data, error } = await sb.from('bidang_event_berkas').delete().eq('id', b.id).select('id')
  if (error) throw new Error(`gagal menghapus: ${error.message}`)
  if (!data || data.length === 0) throw new Error('gagal menghapus: tidak ada baris yang terhapus (hanya admin yang boleh menghapus).')
  if (b.file_path) await sb.storage.from(BUCKET).remove([b.file_path])
}

/**
 * Buka materi/dokumentasi di tab baru. Tautan langsung dibuka; berkas unggahan
 * lewat signed URL (bucket privat).
 *
 * Tab dibuka SINKRON dulu, baru diarahkan sesudah signed URL jadi: `window.open`
 * sesudah `await` diblokir peramban sbg pop-up (CLAUDE.md, antrean Validasi RKBMD).
 */
export async function bukaBerkasEvent(sb: SupabaseClient, b: BerkasEvent): Promise<void> {
  if (b.url) { window.open(b.url, '_blank', 'noopener,noreferrer'); return }
  if (!b.file_path) throw new Error('berkas ini tak punya tautan maupun file.')
  const tab = window.open('', '_blank')
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(b.file_path, 3600)
  if (error || !data?.signedUrl) {
    tab?.close()
    throw new Error(`gagal membuka berkas: ${error?.message ?? 'tautan tak terbit'}`)
  }
  if (tab) { tab.opener = null; tab.location.href = data.signedUrl } else window.location.assign(data.signedUrl)
}
