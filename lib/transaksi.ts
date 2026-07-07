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
  headerId?: string | null  // jurnal_header terkait (mis. batal_pengadaan → header kontrak aslinya, utk lacak balik saat "hapus kontrak sepenuhnya")
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
    header_id: t.headerId ?? null,
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
    case 'reklas_golongan':
      // Perubahan Fungsi BMD (lintas golongan) — patch kode SAMA seperti
      // reklas_kode; bedanya cuma di engine (fresh-start vs retroaktif,
      // lihat lib/engine/penyusutan.ts).
      return p.kode_baru ? { kode: p.kode_baru } : null
    case 'reklas_komptabel':
      return typeof p.intra_ekstra === 'string' ? { intra_ekstra: p.intra_ekstra } : null
    case 'koreksi_nilai':
      // nilai = delta ±; nilai_perolehan baru dikirim caller (menghindari race)
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'koreksi_spesifikasi': {
      const patch: Record<string, unknown> = {}
      for (const k of [
        'nama_barang', 'spesifikasi_lainnya', 'merek_tipe', 'satuan',
        'nomor_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'jenis_hak', 'tanggal_dokumen_kepemilikan',
        'titik_koordinat', 'lokasi', 'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin',
      ] as const) {
        if (typeof p[k] === 'string' && p[k]) patch[k] = p[k]
      }
      if (typeof p.luas === 'number' && p.luas > 0) patch.luas = p.luas
      if (Array.isArray(p.foto_paths)) patch.foto_paths = p.foto_paths
      return Object.keys(patch).length ? patch : null
    }
    case 'kapitalisasi':
      return typeof p.nilai_perolehan_baru === 'number' ? { nilai_perolehan: p.nilai_perolehan_baru } : null
    case 'penghapusan_pemindahtanganan':
    case 'penghapusan_sebab_lain':
      // Soft-delete: hilang dari laporan, tetap tersimpan di DB (§5 no.11)
      return { status: 'dihapus' }
    case 'batal_pengadaan':
      // Koreksi input pasca-approve (mis. kelebihan kuantitas dari Pengadaan):
      // barang dianggap tidak pernah ada — soft-delete, dicatat mundur ke tgl
      // pengadaan aslinya (bukan hari ini) supaya hilang dari SEMUA periode.
      return { status: 'dihapus' }
    case 'batal_penghapusan':
      // Kebalikan penghapusan: barang kembali aktif, penyusutan lanjut lagi.
      return { status: 'aktif' }
    case 'kapitalisasi_serap':
      // Barang anak diserap ke induk: hilang dari laporan, penyusutan berhenti.
      return { status: 'dihapus' }
    case 'batal_kapitalisasi': {
      // Batal kapitalisasi: induk → nilai perolehan kembali (payload.nilai_perolehan_baru),
      // barang anak → status aktif lagi. Keduanya di-set aktif (induk memang sudah aktif).
      const patch: Record<string, unknown> = { status: 'aktif' }
      if (typeof p.nilai_perolehan_baru === 'number') patch.nilai_perolehan = p.nilai_perolehan_baru
      return patch
    }
    default:
      return null
  }
}
