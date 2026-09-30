// Pohon SKPD untuk alat baca Asisten AI — dipakai bersama toolsAdmin.ts &
// perolehan.ts supaya semua alat sepakat soal "SKPD ini beserta unit di bawahnya".
import type { SupabaseClient } from '@supabase/supabase-js'

export type SkpdRow = { id: number; nama: string; parent_id: number | null; level: number }

/** Seluruh pohon SKPD (816 baris; PostgREST memotong di 1.000, jadi kalau
 *  hasilnya menyentuh angka itu KITA MENOLAK — pohon terpotong akan diam-diam
 *  menghitung sub-unit yang hilang sebagai "tak ada"). */
export async function muatSkpd(sb: SupabaseClient): Promise<SkpdRow[]> {
  const { data, error } = await sb.from('admin_skpd').select('id,nama,parent_id,level').order('id').limit(1000)
  if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
  const rows = (data || []) as unknown as SkpdRow[]
  if (rows.length >= 1000) throw new Error('daftar SKPD melebihi 1.000 baris & mungkin terpotong — alat ini perlu diperbarui.')
  return rows
}

/** SKPD `akar` BERIKUT seluruh turunannya (sub-unit ikut, sama dgn descendantIds
 *  yang dipakai halaman Laporan BMD). Dipakai rekap_bmd_skpd & hitung_barang —
 *  dua alat yang harus sepakat soal "apa saja yang termasuk SKPD ini". */
export function turunanSkpd(semua: SkpdRow[], akar: number): number[] {
  const anak = new Map<number, number[]>()
  for (const s of semua) if (s.parent_id != null) anak.set(s.parent_id, [...(anak.get(s.parent_id) || []), s.id])
  const ids: number[] = []
  const antre = [akar]
  while (antre.length) {
    const id = antre.pop() as number
    ids.push(id)
    antre.push(...(anak.get(id) || []))
  }
  return ids
}

export type LingkupSkpd = {
  semua: SkpdRow[]
  skpdId: number | null
  /** SKPD itu beserta turunannya; null = se-kabupaten. */
  desc: number[] | null
  label: string
}

/**
 * Terjemahkan masukan `skpd_id` dari model jadi lingkup. Mengembalikan
 * `{ galat }` (teks berawalan "GAGAL:") kalau masukannya tak sah — SATU tempat,
 * supaya semua alat menolak masukan ngawur dgn cara & kalimat yang sama.
 */
export async function lingkupDari(sb: SupabaseClient, skpdId: unknown): Promise<LingkupSkpd | { galat: string }> {
  const kosong = skpdId == null || skpdId === ''
  const akar = kosong ? null : Number(skpdId)
  if (akar !== null && !Number.isInteger(akar)) return { galat: 'GAGAL: skpd_id harus angka bulat (ambil dari cari_skpd).' }
  const semua = await muatSkpd(sb)
  if (akar === null) return { semua, skpdId: null, desc: null, label: 'SELURUH KABUPATEN' }
  const ada = semua.find(x => x.id === akar)
  if (!ada) return { galat: `GAGAL: SKPD dengan id ${akar} tidak ditemukan.` }
  const desc = turunanSkpd(semua, akar)
  return { semua, skpdId: akar, desc, label: `${ada.nama}${desc.length > 1 ? ` beserta ${desc.length - 1} unit di bawahnya` : ''}` }
}

/** SKPD induk (tingkat teratas) dari sebuah unit. */
export function indukSkpd(semua: SkpdRow[], id: number): number {
  const byId = new Map(semua.map(s => [s.id, s]))
  let s = byId.get(id)
  for (let i = 0; s && s.parent_id != null && i < 10; i++) s = byId.get(s.parent_id)
  return s ? s.id : id
}
