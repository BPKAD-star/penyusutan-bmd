// Pembacaan & penulisan PERATURAN BMD (bagian atas halaman Dokumen Sumber) —
// satu-satunya tempat yang menyentuh `admin_dokumen` untuk keempat kotak
// peraturan. Aturan bentuknya (daftar jenis, judul baku) ada di
// lib/dokumenSiklus.ts; berkas ini lapisan datanya saja.
//
// ⚠️ SEMUANYA MELEMPAR saat gagal. Daftar kosong yang sebenarnya "query gagal"
// terbaca operator sbg "peraturannya memang belum diunggah" — lalu diunggah
// lagi, dan kotaknya berisi dua salinan.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertOk, assertTulisOk } from '@/shared/db/query'
import { DAFTAR_PERATURAN, judulPeraturan, type PeraturanConfig } from '@/lib/dokumenSiklus'
import { uploadDokumenSiklus, hapusFileDokumen } from '@/lib/dokumenStorage'

export type BarisPeraturan = {
  id: string; tahun: number; judul: string; keterangan: string | null
  file_path: string; created_at: string
}

/** Pagu bucket `dokumen-sumber` (migrasi 20260704_21) — 10 MB. */
export const MAKS_BERKAS_PERATURAN = 10 * 1024 * 1024

/** Seluruh peraturan satu jenis, tahun peraturan TERBARU dulu. */
export async function muatPeraturan(sb: SupabaseClient, p: PeraturanConfig): Promise<BarisPeraturan[]> {
  return assertOk(
    await sb.from('admin_dokumen')
      .select('id,tahun,judul,keterangan,file_path,created_at')
      .eq('siklus', p.dbSiklus)
      .order('tahun', { ascending: false })
      .order('created_at', { ascending: false }),
    `daftar ${p.label}`,
  ) as BarisPeraturan[]
}

/** Banyaknya dokumen per kotak (kunci = `PeraturanConfig.key`). */
export async function hitungPeraturan(sb: SupabaseClient): Promise<Record<string, number>> {
  const rows = assertOk(
    await sb.from('admin_dokumen').select('siklus').in('siklus', DAFTAR_PERATURAN.map(p => p.dbSiklus)),
    'jumlah peraturan',
  ) as { siklus: string }[]
  const out: Record<string, number> = {}
  for (const p of DAFTAR_PERATURAN) out[p.key] = rows.filter(r => r.siklus === p.dbSiklus).length
  return out
}

export async function simpanPeraturan(sb: SupabaseClient, p: PeraturanConfig, isi: {
  nomor: string; tahun: number; tentang: string; file: File
}): Promise<void> {
  const { path, error: upErr } = await uploadDokumenSiklus(isi.file, isi.tahun, p.dbSiklus)
  if (upErr) throw new Error(`gagal mengunggah berkas: ${upErr.message}`)
  try {
    assertTulisOk(
      await sb.from('admin_dokumen').insert({
        tahun: isi.tahun, siklus: p.dbSiklus, skpd_id: null,
        judul: judulPeraturan(p.label, isi.nomor, isi.tahun),
        keterangan: isi.tentang.trim() || null, file_path: path,
      }),
      p.label,
    )
  } catch (e) {
    // Barisnya gagal tercatat → berkas yang terlanjur naik jadi yatim di
    // storage; dibuang supaya tak menumpuk tanpa pemilik.
    await hapusFileDokumen(path)
    throw e
  }
}

export async function hapusPeraturan(sb: SupabaseClient, d: BarisPeraturan): Promise<void> {
  // Baris dulu, berkas kemudian: kalau urutannya dibalik & penghapusan barisnya
  // ditolak (RLS), daftar masih menampilkan dokumen yang berkasnya sudah tiada.
  assertTulisOk(await sb.from('admin_dokumen').delete().eq('id', d.id), 'penghapusan peraturan')
  await hapusFileDokumen(d.file_path)
}
