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
