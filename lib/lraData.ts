// Pemuat data LRA — SATU sumber untuk halaman Pelaporan → LRA
// (app/dashboard/pelaporan/lra/page.tsx) DAN alat baca Asisten AI
// (lib/chatbot/lraKir.ts). Dipindah dari halamannya 2026-09-30 begitu pemakai
// kedua muncul. Agregasinya (matriks, Check, persilangan) tetap di lib/lra.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { paginate } from '@/shared/db/paginate'
import type { LraRow, AppRow } from '@/lib/lra'

export const LRA_COLS = 'id,skpd_id,tanggal,bulan,no_bukti,kode_rekening,kode_grup3,kelompok,uraian,keterangan,debit,klasifikasi,jenis_tujuan'

/**
 * Baris LRA mana yang ditarik.
 *
 * `semua` — seluruh realisasi (belanja modal 5.2 + barang/jasa 5.1); dipakai
 *           halaman LRA, yang menampilkan & menandai baris 5.1 juga.
 * `rekap` — HANYA yang ikut hitungan rekap: belanja modal (5.2) + baris apa pun
 *           yang SUDAH ditandai (kapitalisasi / reklas keluar). Setara untuk
 *           `rekapModal`/`rekapKapitalisasi`/`rekapReklas`/`leafLra` — keempatnya
 *           memang cuma membaca baris-baris itu — tapi 2026 hanya ±330 baris,
 *           bukan 32 ribu (belanja barang/jasa yang tak ditandai tak pernah
 *           masuk rekap). Dipakai alat baca Asisten AI.
 */
export type CakupanLra = 'semua' | 'rekap'

/**
 * Tarik baris LRA + Entryan Aplikasi utk satu (tahun, scope SKPD).
 * `desc` null = seluruh SKPD yang boleh dibaca RLS. MELEMPAR saat gagal.
 */
export async function fetchLraData(
  supabase: SupabaseClient, tahunVal: string, desc: number[] | null, cakupan: CakupanLra = 'semua',
): Promise<{ lra: LraRow[]; appRows: AppRow[] }> {
  const lra = await paginate<number, LraRow>('realisasi LRA', kursor => {
    let q = supabase.from('lra_realisasi').select(LRA_COLS)
      .eq('tahun', Number(tahunVal))
    if (desc) q = q.in('skpd_id', desc)
    if (cakupan === 'rekap') q = q.or('kelompok.eq.modal,klasifikasi.not.is.null')
    if (kursor !== null) q = q.gt('id', kursor)
    return q.order('id').limit(1000) as unknown as PromiseLike<{ data: LraRow[] | null; error: { message: string } | null }>
  })

  // Belanja modal sisi aplikasi (ledger `pengadaan`) — DIAGREGASI DI SERVER.
  // Dulu ditarik mentah ke browser → RLS aset per-baris + ~227rb aset bikin
  // statement timeout 8s. Sekarang lewat RPC (SECURITY DEFINER, scope RLS
  // direplikasi): balikannya maks 5 jenis × 12 bulan × jumlah SKPD berdata.
  const { data: appData, error: appErr } = await supabase.rpc('fn_lra_belanja_modal', {
    p_tahun: Number(tahunVal), p_skpd_ids: desc,
  })
  if (appErr) throw new Error(appErr.message)
  // ⚠️ `golongan` baru ada sejak migrasi 20260909_01, `skpd_id` sejak
  // 20260910_05. Kalau migrasinya belum jalan keduanya `undefined` →
  // dinormalisasi jadi `null` ("tak bisa dinilai" / "tak diketahui SKPD-nya"),
  // dan halaman MENGATAKANNYA (strip amber) alih-alih diam-diam menampilkan
  // matriks/rekap kosong yang terbaca "memang tak ada apa-apa".
  const appRows: AppRow[] = ((appData || []) as { skpd_id?: number | null; grup: string | null; golongan?: string | null; bulan: number; nilai: number }[])
    .map(d => ({ skpd_id: d.skpd_id ?? null, grup: d.grup, golongan: d.golongan ?? null, bulan: Number(d.bulan), nilai: Number(d.nilai || 0) }))

  return { lra, appRows }
}
