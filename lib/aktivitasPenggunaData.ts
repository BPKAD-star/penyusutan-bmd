// Lapisan data aktivitas pengguna (Admin → Daftar User). Aturan: lib/aktivitasPengguna.ts.
// Migrasi 20261011_02.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertOk } from '@/shared/db/query'
import {
  deretTanggal, susunAktivitas, tanggalWib, type AktivitasUser, type BarisLog, type BarisSesi, type BarisTerakhir,
} from '@/lib/aktivitasPengguna'

export type DataAktivitas = { tanggal: string[]; peta: Map<string, AktivitasUser> }

/** Seluruh aktivitas `n` hari terakhir (WIB). MELEMPAR kalau salah satu sumber gagal. */
export async function muatAktivitas(sb: SupabaseClient, n: number): Promise<DataAktivitas> {
  const tanggal = deretTanggal(tanggalWib(new Date()), n)
  const dari = tanggal[0]
  const sampai = tanggal[tanggal.length - 1]
  const [sesi, log, terakhir] = await Promise.all([
    sb.rpc('fn_admin_aktivitas_sesi', { p_dari: dari, p_sampai: sampai }),
    sb.from('log_aktivitas').select('user_id,tanggal,halaman,jumlah').gte('tanggal', dari).lte('tanggal', sampai).limit(20000),
    sb.rpc('fn_admin_terakhir_aktif'),
  ])
  return {
    tanggal,
    peta: susunAktivitas(
      tanggal,
      assertOk(sesi, 'sesi login') as BarisSesi[],
      assertOk(log, 'log halaman') as BarisLog[],
      assertOk(terakhir, 'aktivitas terakhir') as BarisTerakhir[],
    ),
  }
}

/** Dipanggil di latar tiap pindah halaman. Gagal = diam (pencatatan tak boleh mengganggu kerja). */
export function catatKunjungan(sb: SupabaseClient, halaman: string): void {
  void sb.rpc('fn_catat_aktivitas', { p_halaman: halaman }).then(() => undefined, () => undefined)
}
