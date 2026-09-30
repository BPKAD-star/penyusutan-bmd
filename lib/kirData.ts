// Pemuat Laporan KIR — SATU sumber untuk halaman Pelaporan → KIR
// (components/pelaporan/LaporanKir.tsx) DAN alat baca Asisten AI
// (lib/chatbot/lraKir.ts). Dipindah dari komponennya 2026-09-30.
//
// KIR = POSISI TERKINI penempatan barang di ruangan (non-ledger, tak ber-periode).
//
// ⚠️ MELEMPAR saat query gagal. Sampai 2026-09-30 ketiga query di sini
// `const { data } = await` telanjang: gagal terbaca sbg "belum ada ruangan".
import type { SupabaseClient } from '@supabase/supabase-js'
import { RUANGAN_COLS, ASET_JOIN_COLS, toIsiRuangan, type Ruangan, type IsiRuangan } from '@/lib/kir'

export type KartuKir = Ruangan & { skpdNama: string; isi: IsiRuangan[] }

/** Seluruh ruangan (beserta isinya) di SKPD `descIds`; null/kosong = semua yang boleh dibaca. */
export async function muatKartuKir(supabase: SupabaseClient, descIds: number[] | null): Promise<KartuKir[]> {
  let q = supabase.from('kir_ruangan').select(RUANGAN_COLS)
  if (descIds && descIds.length > 0) q = q.in('skpd_id', descIds)
  const { data: rs, error: rErr } = await q.order('nama')
  if (rErr) throw new Error(`gagal membaca daftar ruangan: ${rErr.message}`)
  const rows = (rs as unknown as Ruangan[]) || []
  if (rows.length === 0) return []

  const skpdIds = [...new Set(rows.map(r => r.skpd_id))]
  const { data: skpdRows, error: sErr } = await supabase.from('admin_skpd').select('id,nama').in('id', skpdIds)
  if (sErr) throw new Error(`gagal membaca nama SKPD: ${sErr.message}`)
  const skpdNama: Record<number, string> = Object.fromEntries(
    ((skpdRows || []) as { id: number; nama: string }[]).map(s => [s.id, s.nama]))

  const list: KartuKir[] = rows.map(r => ({ ...r, skpdNama: skpdNama[r.skpd_id] || `SKPD #${r.skpd_id}`, isi: [] }))
  const byId = new Map(list.map(r => [r.id, r]))

  // Isi ruangan diambil berbatch (daftar ruangan bisa panjang kalau se-kabupaten).
  const ids = list.map(r => r.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { data: isi, error: iErr } = await supabase.from('kir_ruangan_aset')
      .select(`id,ruangan_id,aset_id,keterangan,aset:aset_id(${ASET_JOIN_COLS})`)
      .in('ruangan_id', ids.slice(i, i + 100))
    if (iErr) throw new Error(`gagal membaca isi ruangan: ${iErr.message}`)
    for (const row of (isi || []) as unknown as (Parameters<typeof toIsiRuangan>[0] & { ruangan_id: string })[]) {
      const baris = toIsiRuangan(row)
      if (baris) byId.get(row.ruangan_id)?.isi.push(baris)
    }
  }
  for (const r of list) r.isi.sort((a, b) => (a.nibar || '').localeCompare(b.nibar || ''))
  return list
}
