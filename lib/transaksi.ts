// Helper pencatatan transaksi BMD: 1 record ledger immutable + update state aset
// dari record itu (PLAN §1.1). Ledger ditulis DULUAN (sumber kebenaran), baru
// state aset disesuaikan. Koreksi kesalahan = transaksi baru, bukan edit.
import type { SupabaseClient } from '@supabase/supabase-js'
import { periodeDariTanggal } from '@/lib/bmd'

export type TransaksiInput = {
  asetId: string
  jenis: string
  tanggal?: string          // default hari ini
  nilai?: number
  skpdAsal?: number | null
  skpdTujuan?: number | null
  payload?: Record<string, unknown>
  keterangan?: string
}

export async function catatTransaksi(supabase: SupabaseClient, t: TransaksiInput): Promise<{ error?: string }> {
  const tanggal = t.tanggal || new Date().toISOString().slice(0, 10)
  const periode = periodeDariTanggal(tanggal)

  const { error: trxError } = await supabase.from('transaksi_bmd').insert({
    aset_id: t.asetId,
    jenis: t.jenis,
    periode,
    tanggal,
    nilai: t.nilai ?? 0,
    skpd_asal: t.skpdAsal ?? null,
    skpd_tujuan: t.skpdTujuan ?? null,
    payload: t.payload ?? {},
    keterangan: t.keterangan ?? null,
  })
  if (trxError) return { error: `Gagal mencatat transaksi: ${trxError.message}` }

  // State aset "sekarang" menyusul dari transaksi (§1.1)
  const patch = patchAsetDari(t)
  if (patch) {
    const { error: asetError } = await supabase.from('aset').update(patch).eq('id', t.asetId)
    if (asetError) return { error: `Transaksi tercatat, tapi update aset gagal: ${asetError.message}` }
  }
  return {}
}

function patchAsetDari(t: TransaksiInput): Record<string, unknown> | null {
  const p = t.payload ?? {}
  switch (t.jenis) {
    case 'mutasi_internal':
    case 'pengalihan_status':
      return t.skpdTujuan ? { skpd_id: t.skpdTujuan } : null
    case 'reklas_kode':
      return p.kode_baru ? { kode: p.kode_baru } : null
    case 'koreksi_nilai':
      // nilai = delta ±; nilai_perolehan baru dikirim caller (menghindari race)
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'koreksi_spesifikasi': {
      const patch: Record<string, unknown> = {}
      for (const k of ['nama_barang', 'spesifikasi', 'merek_tipe', 'satuan'] as const) {
        if (typeof p[k] === 'string' && p[k]) patch[k] = p[k]
      }
      return Object.keys(patch).length ? patch : null
    }
    case 'kapitalisasi':
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'penghapusan_pemindahtanganan':
    case 'penghapusan_sebab_lain':
      // Soft-delete: hilang dari laporan, tetap tersimpan di DB (§5 no.11)
      return { status: 'dihapus' }
    default:
      return null
  }
}
