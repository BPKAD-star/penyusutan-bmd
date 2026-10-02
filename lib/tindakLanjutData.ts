// Pemuat menu Tindak Lanjut Inventarisasi. Semua fungsi MELEMPAR saat gagal —
// status "Belum" yang lahir dari query gagal akan terbaca operator sebagai
// "memang belum dikerjakan", padahal datanya tak terbaca.
//
// Bentuknya DUA TAHAP (rules.md §3.4): tarik isian tervalidasi dulu, BARU
// tanyakan keadaan aset-aset itu saja — bukan menyapu register/ledger.
import type { SupabaseClient } from '@supabase/supabase-js'
import { paginate, perPotongan } from '@/shared/db/paginate'
import {
  JENIS_PENENTU_STATUS, asetDibutuhkan, temuanDariIsian,
  type AsetKini, type IsianTL, type KonteksTL, type TemuanTL,
} from '@/lib/tindakLanjut'

const ASET_COLS = 'id,kode,status,nama_barang,kondisi_barang,satuan,wilayah_kode,alamat_detail,merek_tipe,' +
  'no_polisi,no_rangka,no_mesin,no_bpkb,spesifikasi_lainnya,luas,keterangan,latitude,longitude,foto_paths,pengamanan,pemanfaatan'

export type IsianTLMuat = IsianTL & { skpd_id: number }
export type TemuanTLMuat = TemuanTL & { skpdId: number; golongan: string; snapshot: IsianTL['snapshot'] }

export async function muatTindakLanjut(
  sb: SupabaseClient,
  f: { tahun: number; skpdIds: number[] | null },
): Promise<TemuanTLMuat[]> {
  // Hanya isian yang SUDAH DIVALIDASI — sumber yang sama dgn LHI (useLhiData).
  const isian = await paginate<string, IsianTLMuat>('isian inventarisasi tervalidasi', kursor => {
    let q = sb.from('inventarisasi_barang')
      .select('id,aset_id,skpd_id,golongan,snapshot,jawaban')
      .eq('tahun', f.tahun).eq('status', 'divalidasi')
    if (f.skpdIds && f.skpdIds.length > 0) q = q.in('skpd_id', f.skpdIds)
    if (kursor !== null) q = q.gt('id', kursor)
    return q.order('id').limit(1000) as unknown as PromiseLike<{ data: IsianTLMuat[] | null; error: { message: string } | null }>
  })

  const ids = asetDibutuhkan(isian)
  const [aset, ledger, usul] = await Promise.all([
    perPotongan<AsetKini, string>('keadaan barang', ids, pot =>
      sb.from('aset').select(ASET_COLS).in('id', pot) as unknown as PromiseLike<{ data: AsetKini[] | null; error: { message: string } | null }>),
    // Baris penentu status per aset itu cuma segelintir (hapus/pecah/serap +
    // pembatalannya), jadi satu halaman per potongan 100 aset jauh dari 1.000.
    perPotongan<{ id: number; aset_id: string; jenis: string }, string>('riwayat status barang', ids, pot =>
      sb.from('transaksi_bmd').select('id,aset_id,jenis')
        .in('aset_id', pot).in('jenis', [...JENIS_PENENTU_STATUS]).order('id').limit(1000) as unknown as
        PromiseLike<{ data: { id: number; aset_id: string; jenis: string }[] | null; error: { message: string } | null }>,
      { size: 100 }),
    perPotongan<{ aset_id: string }, string>('usulan RKBMD Penghapusan', ids, pot =>
      sb.from('rkbmd_item').select('aset_id,rkbmd:rkbmd_id!inner(jenis,status)')
        .in('aset_id', pot).eq('rkbmd.jenis', 'penghapusan').in('rkbmd.status', ['diajukan', 'disetujui']) as unknown as
        PromiseLike<{ data: { aset_id: string }[] | null; error: { message: string } | null }>),
  ])

  const jenisTerakhir = new Map<string, string>()
  for (const r of [...ledger].sort((x, y) => x.id - y.id)) jenisTerakhir.set(r.aset_id, r.jenis)
  const ctx: KonteksTL = {
    aset: new Map(aset.map(a => [a.id, a])),
    jenisTerakhir,
    usulHapus: new Set(usul.map(u => u.aset_id)),
  }

  return isian.flatMap(s => temuanDariIsian(s, ctx).map(t => ({
    ...t, skpdId: s.skpd_id, golongan: s.golongan, snapshot: s.snapshot,
  })))
}
