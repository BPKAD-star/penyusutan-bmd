// Penempatan OTOMATIS barang baru ke ruangan KIR saat kartu Cara Perolehan
// disetujui (permintaan user 2026-10-11, dari menu Notes: "penginputan
// pengadaan barang baru masuk secara otomatis di KIR per bidang / per seksi").
//
// Alurnya: operator memilih RUANGAN di popup Edit Spesifikasi (ruangannya harus
// SUDAH dibuat di menu Pembukuan → KIR). Pilihan itu ikut di draft barang
// (`DraftItem.ruanganId`, di jurnal_header.payload — BUKAN di `fields`, karena
// `fields` = kolom tabel `aset` 1:1) dan baru ditulis ke `kir_ruangan_aset`
// SAAT APPROVE, ketika barangnya sungguh punya `aset.id`.
//
// ⚠️ NON-LEDGER & BUKAN penjaga approve: penempatan ruangan itu data administratif
// (lib/kir.ts). Kalau menulisnya gagal, barang yang sudah tercatat TIDAK dibatalkan —
// kegagalannya dilaporkan & operator menempatkannya manual lewat menu KIR.
// Mengembalikan seluruh approve gara-gara sebuah kolom administratif akan
// membuat operator terkurung, dan ledger-nya sudah terlanjur ditulis.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertOk } from '@/shared/db/query'
import { isKirEligible } from '@/lib/kir'

export type RuanganOpsi = { id: string; nama: string; kode_ruangan: string | null; pj_nama: string | null }

export type PenempatanBaru = { aset_id: string; ruangan_id: string }

/** Ruangan baru ditawarkan hanya kalau SEMUA barang yang diedit boleh masuk KIR. */
export const semuaBolehKir = (kodes: string[]): boolean => kodes.length > 0 && kodes.every(k => !!k && isKirEligible(k))

const POTONG = 200
const potong = <T,>(xs: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += POTONG) out.push(xs.slice(i, i + POTONG))
  return out
}

/** Ruangan satu SKPD (tepat SKPD itu, sama dgn yang dikelola menu KIR). MELEMPAR kalau gagal. */
export async function muatRuanganSkpd(sb: SupabaseClient, skpdId: number): Promise<RuanganOpsi[]> {
  return assertOk(
    await sb.from('kir_ruangan').select('id,nama,kode_ruangan,pj_nama').eq('skpd_id', skpdId).order('nama'),
    'daftar ruangan KIR',
  ) as RuanganOpsi[]
}

/**
 * Tulis penempatan sekaligus. Mengembalikan pesan galat (atau `null` kalau
 * beres) — TIDAK melempar, supaya pemanggil (approve) bisa melaporkan tanpa
 * membatalkan barang yang sudah tercatat.
 */
export async function tempatkanDiRuangan(sb: SupabaseClient, pasangan: PenempatanBaru[]): Promise<string | null> {
  if (pasangan.length === 0) return null
  for (const grup of potong(pasangan)) {
    const { data, error } = await sb.from('kir_ruangan_aset').insert(grup).select('id')
    if (error) return error.message
    // INSERT yang ditolak RLS bisa diam (0 baris) — pola yang sama dgn di tempat lain.
    if (!data || data.length !== grup.length) return 'penempatan ditolak database (cek izin SKPD untuk ruangan itu).'
  }
  return null
}

/** aset_id → ruangan_id untuk barang yang SUDAH ditempatkan. MELEMPAR kalau gagal. */
export async function ambilPenempatan(sb: SupabaseClient, asetIds: string[]): Promise<Map<string, string>> {
  const peta = new Map<string, string>()
  for (const grup of potong(asetIds)) {
    const rows = assertOk(
      await sb.from('kir_ruangan_aset').select('aset_id,ruangan_id').in('aset_id', grup),
      'penempatan KIR',
    ) as { aset_id: string; ruangan_id: string }[]
    for (const r of rows) peta.set(r.aset_id, r.ruangan_id)
  }
  return peta
}

/** Lepas barang dari ruangannya. Mengembalikan pesan galat atau `null`. */
export async function lepasDariRuangan(sb: SupabaseClient, asetIds: string[]): Promise<string | null> {
  for (const grup of potong(asetIds)) {
    const { error } = await sb.from('kir_ruangan_aset').delete().in('aset_id', grup)
    if (error) return error.message
  }
  return null
}
