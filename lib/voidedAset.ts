// Aset yang dianggap TIDAK PERNAH ADA (void) — dipakai laporan perolehan supaya
// PERIOD-CORRECT. Logika ini sebelumnya diduplikasi di beberapa tempat
// (app/dashboard/pelaporan/bmd/page.tsx `fetchVoidedAsetIds`, lib/rekon.ts
// `fetchVoided`) dengan VOID_JENIS yang identik — dikumpulkan di sini supaya
// tak drift.
//
// ⚠️ BEDAKAN DUA HAL INI (sumber bug period-correctness):
//   * VOID (di sini) = koreksi input: `batal_*` cara perolehan &
//     `koreksi_pencatatan_ganda`. Barang dianggap TAK PERNAH DIPEROLEH →
//     WAJIB dibuang dari laporan perolehan periode MANA PUN (event-nya
//     retroaktif ke tanggal perolehan asli).
//   * PENGHAPUSAN (`penghapusan_*`) = peristiwa BARU di periode lain. Barangnya
//     DULU memang sah diperoleh → JANGAN dibuang dari laporan periode perolehan.
//     Menyaring pakai `aset.status='dihapus'` MENCAMPUR keduanya (status terkini
//     tak bisa bedakan void vs dihapus) → laporan periode lampau berubah tiap
//     ada penghapusan baru. Pakai fungsi ini, bukan filter status.
import type { SupabaseClient } from '@supabase/supabase-js'

type Supabase = SupabaseClient

// Cara perolehan yang dibatalkan (unapprove/koreksi) + gabung pencatatan ganda.
export const VOID_JENIS = [
  'batal_pengadaan', 'batal_hibah_masuk', 'batal_tukar_menukar',
  'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'koreksi_pencatatan_ganda',
]

// Un-void: koreksi_pencatatan_ganda yang DIBATALKAN → barang duplikat aktif lagi
// & harus muncul kembali sbg perolehan. Guard batal (tak boleh ada trx lebih
// baru) menjamin batal = keadaan TERAKHIR, jadi cukup buang dari set.
const UNVOID_JENIS = ['batal_koreksi_pencatatan_ganda']

async function collectAsetIds(supabase: Supabase, jenisList: string[]): Promise<string[]> {
  const out: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd')
      .select('aset_id').in('jenis', jenisList as never).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as { aset_id: string | null }[]) if (r.aset_id) out.push(r.aset_id)
    if (data.length < 1000) break
  }
  return out
}

/**
 * Set aset_id yang PERNAH kena void (semua periode — event-nya retroaktif).
 * @param extraVoidJenis jenis void tambahan, mis. ['batal_akumulasi_kdp'] utk
 *   laporan yang ikut menarik KDP (unapprove kontrak konstruksi membalik semua
 *   termin & menyembunyikan asetnya).
 */
export async function fetchVoidedAsetIds(
  supabase: Supabase, extraVoidJenis: string[] = [],
): Promise<Set<string>> {
  const [voided, unvoided] = await Promise.all([
    collectAsetIds(supabase, [...VOID_JENIS, ...extraVoidJenis]),
    collectAsetIds(supabase, UNVOID_JENIS),
  ])
  const out = new Set(voided)
  for (const id of unvoided) out.delete(id)
  return out
}
