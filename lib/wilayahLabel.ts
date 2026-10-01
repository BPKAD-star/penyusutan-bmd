// Nama wilayah berjenjang untuk laporan: Provinsi → Kabupaten → Kecamatan → Desa.
// Dipakai LHI III.B.8 (alamat sebelum/sesudah) & III.B.11 — kolom `wilayah_kode`
// itu kode desa, yang tak terbaca manusia.
//
// ⚠️ BEDA dari `aset.wilayah`/`fn_wilayah_label` (Desa, Kec., Kabupaten — urutan
// terbalik & TANPA provinsi, dipakai kolom Lokasi Daftar Barang Awal). Laporan
// ini sengaja memuat provinsi, urut dari yang terbesar (permintaan user
// 2026-10-01); jangan disatukan, urutannya berlawanan.
import type { SupabaseClient } from '@supabase/supabase-js'
import { paginate } from '@/shared/db/paginate'

export type WilayahRow = { kode: string; nama: string; level: number; parent_kode: string | null }

/** kode → "Jawa Timur, Kediri, Kec. Pare, Tulungrejo". Dihitung SEKALI utk seluruh tabel. */
export function susunLabelWilayah(rows: WilayahRow[]): Record<string, string> {
  const byKode = new Map(rows.map(w => [w.kode, w]))
  const out: Record<string, string> = {}
  for (const w of rows) {
    const bagian: string[] = []
    const lihat = new Set<string>()
    let cur: WilayahRow | undefined = w
    while (cur && !lihat.has(cur.kode)) {
      lihat.add(cur.kode)
      bagian.unshift(cur.level === 3 ? `Kec. ${cur.nama}` : cur.nama)
      cur = cur.parent_kode ? byKode.get(cur.parent_kode) : undefined
    }
    out[w.kode] = bagian.join(', ')
  }
  return out
}

/** Tabel `admin_wilayah` kecil (Jatim + Kab. Kediri, ±400 baris). MELEMPAR saat gagal. */
export async function muatLabelWilayah(supabase: SupabaseClient): Promise<Record<string, string>> {
  const rows = await paginate<string, WilayahRow & { id: string }>('nama wilayah', kursor => {
    let q = supabase.from('admin_wilayah').select('id:kode,kode,nama,level,parent_kode')
    if (kursor !== null) q = q.gt('kode', kursor)
    return q.order('kode').limit(1000)
  })
  return susunLabelWilayah(rows)
}
