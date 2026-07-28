// Helper PEMBATALAN — dua level, jangan tertukar:
//   * fetchVoidedAsetIds  → level ASET  : aset yang dianggap tak pernah ada.
//   * fetchBatalTargets   → level TRANSAKSI: id baris ledger yang dibatalkan
//     lewat `batal_*.payload.target_trx_id` (kapitalisasi/reklas/koreksi —
//     asetnya TETAP ada, cuma satu event-nya yang dianulir).
//
// Keduanya sebelumnya diduplikasi di beberapa tempat (lib/rekon.ts,
// app/dashboard/pelaporan/bmd/page.tsx, tiap komponen menu) — dikumpulkan di
// sini supaya tak drift.
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

// ⚠️ DUA HAL YANG WAJIB DIPERTAHANKAN DI SETIAP KOLEKTOR HALAMAN-DEMI-HALAMAN
// DI BERKAS INI (dua-duanya sumber angka salah yang SENYAP):
//
// 1. `.order('id')` — paginasi OFFSET tanpa ORDER BY tidak dijamin stabil
//    antar-halaman oleh Postgres. Begitu baris yang cocok lewat 1.000, halaman
//    kedua bisa mengulang baris yang sama dan MELEWATKAN yang lain; yang
//    terlewat = aset void yang lolos ke laporan seolah sah.
// 2. Cek `error`, jangan `const { data } = await ...`. Kalau query gagal
//    (timeout, enum tak dikenal, dll) `data` jadi null, loop berhenti, dan
//    fungsi ini mengembalikan set KOSONG — artinya "tidak ada yang dibatalkan",
//    kebalikan dari kenyataan. Tak ada satu pun laporan yang error; angkanya
//    saja yang diam-diam salah di beberapa menu sekaligus. Fail-closed:
//    lebih baik laporannya menolak tampil daripada menyajikan angka palsu.
async function collectAsetIds(supabase: Supabase, jenisList: string[]): Promise<string[]> {
  const out: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('aset_id').in('jenis', jenisList as never)
      .order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`gagal membaca transaksi pembatalan (${jenisList.join(', ')}): ${error.message}`)
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

// ── Level TRANSAKSI ─────────────────────────────────────────────────────────
// Jenis batal yang menganulir SATU baris ledger lewat payload.target_trx_id
// (asetnya tetap ada). Dipetakan per menu supaya laporan tinggal pakai.
export const BATAL_TARGET_JENIS = {
  kapitalisasi: ['batal_kapitalisasi'],
  reklasifikasi: ['batal_reklas'],
  koreksi: ['batal_koreksi_nilai', 'batal_koreksi_spesifikasi', 'batal_koreksi_pencatatan_ganda'],
} as const

/**
 * Set id baris ledger yang SUDAH DIBATALKAN (dibaca dari
 * `batal_*.payload.target_trx_id`). Laporan wajib membuang baris ber-id ini,
 * kalau tidak transaksi yang sudah dianulir tetap tampil seolah masih berlaku —
 * dan angkanya beda dgn engine & Rekonsiliasi yang sudah membuangnya.
 */
export async function fetchBatalTargets(
  supabase: Supabase, jenisList: readonly string[],
): Promise<Set<number>> {
  const out = new Set<number>()
  if (jenisList.length === 0) return out
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('payload').in('jenis', jenisList as never)
      .order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`gagal membaca transaksi pembatalan (${jenisList.join(', ')}): ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as { payload: { target_trx_id?: number } | null }[]) {
      const t = Number(r.payload?.target_trx_id)
      if (Number.isFinite(t)) out.add(t)
    }
    if (data.length < 1000) break
  }
  return out
}
