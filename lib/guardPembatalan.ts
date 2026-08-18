// Guard pembatalan — "tak boleh dibatalkan kalau aset punya transaksi LEBIH BARU"
// (rules.md §1.3, CLAUDE.md bagian BATAL/reversal). Fase 2.1b REFACTOR-PLAN.
//
// KENAPA ADA: rantai event per-aset direplay kronologis oleh engine. Membatalkan
// event di TENGAH rantai (mis. reklas yang di atasnya sudah ada kapitalisasi)
// merusak state — dan rusaknya tak bersuara, ia cuma muncul sebagai angka
// penyusutan yang salah. Batal hanya sah untuk event TERBARU aset itu.
//
// Sebelum ini aturannya disalin di lima berkas komponen (Reklasifikasi, Koreksi,
// Penghapusan, Pengadaan, Kapitalisasi) — lima kesempatan salah, dan menu batal
// BARU yang lupa memasangnya tak menghasilkan error apa pun.
//
// ⚠️ TIDAK ADA TRIGGER DB yang menegakkan ini (keputusan lama, tercatat di
// CLAUDE.md). Jadi fungsi inilah satu-satunya penjaga. Perlakukan begitu.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Satu baris yang hendak dibatalkan. */
export type ItemBatal = {
  /** Aset yang rantai transaksinya diperiksa. */
  aset_id: string
  /** id baris ledger event yang mau dibatalkan — pembanding "lebih baru". */
  trx_id: number
  /** Nama/NIBAR untuk pesan ke operator. Boleh kosong. */
  label?: string | null
}

/**
 * Hasil pemeriksaan. Sengaja HANYA DUA keadaan: boleh, atau tidak boleh berikut
 * alasannya.
 *
 * ⚠️ Kegagalan query ikut jatuh ke `boleh: false`, BUKAN keadaan ketiga yang
 * bisa diabaikan pemanggil. Versi lama menulis `const { count } = await …` lalu
 * `(count || 0) > 0` — query gagal membuat `count` undefined, jadi guard-nya
 * LOLOS. Untuk guard integritas ledger, gagal-memeriksa harus berarti
 * tidak-boleh; kalau tidak, gangguan jaringan sesaat cukup untuk merusak rantai
 * replay engine tanpa satu pun pesan.
 */
// ⚠️ `pesan?: undefined` di cabang sukses BUKAN hiasan — jangan dibuang.
// tsconfig repo ini `"strict": false`, jadi `strictNullChecks` mati, dan dalam
// mode itu TypeScript TIDAK menyempitkan discriminated union lewat boolean
// literal: `if (!guard.boleh) guard.pesan` gagal kompilasi dengan "Property
// 'pesan' does not exist on type '{ boleh: true }'". Dengan properti opsional
// ini, `pesan` bisa dibaca dari union-nya (bertipe `string | undefined`) tanpa
// bergantung pada penyempitan. Tetap benar kalau suatu saat `strict` dinyalakan.
export type HasilGuard =
  | { boleh: true; pesan?: undefined }
  | { boleh: false; pesan: string }

const sebut = (it: ItemBatal) => it.label?.trim() || it.aset_id

/**
 * `true` kalau aset ini punya baris ledger ber-`id` lebih besar dari `trx_id`.
 *
 * ⚠️ Sengaja TIDAK memakai `{ count: 'exact', head: true }`. Respons HEAD tak
 * berbadan, sehingga supabase-js mengembalikan `error.message` KOSONG — pesan
 * yang justru paling dibutuhkan saat guard ini menolak karena gangguan, bukan
 * karena data. `.limit(1)` sudah cukup: yang ditanya "ada atau tidak", bukan
 * "berapa banyak".
 */
async function adaLebihBaru(
  supabase: SupabaseClient, it: ItemBatal,
): Promise<{ ada: boolean } | { gagal: string }> {
  const { data, error } = await supabase.from('transaksi_bmd')
    .select('id').eq('aset_id', it.aset_id).gt('id', it.trx_id).limit(1)
  if (error) return { gagal: error.message }
  return { ada: (data?.length ?? 0) > 0 }
}

/**
 * Periksa SELURUH baris yang hendak dibatalkan. Berhenti di pelanggar PERTAMA —
 * operator cuma bisa menindak satu per satu, dan daftar panjang tak membuatnya
 * lebih cepat selesai.
 *
 * `konteks` masuk ke kalimat penolakan, mis. `'reklas ini'` → "punya transaksi
 * LEBIH BARU setelah reklas ini".
 */
export async function cekBolehBatal(
  supabase: SupabaseClient, items: ItemBatal[], konteks: string,
): Promise<HasilGuard> {
  for (const it of items) {
    const r = await adaLebihBaru(supabase, it)
    if ('gagal' in r) {
      return {
        boleh: false,
        pesan: `Batal dibatalkan: gagal memeriksa riwayat transaksi "${sebut(it)}" (${r.gagal}). `
          + 'Pembatalan TIDAK dijalankan — mencoba lagi lebih aman daripada membatalkan '
          + 'event di tengah rantai.',
      }
    }
    if (r.ada) {
      return {
        boleh: false,
        pesan: `Batal diblokir: "${sebut(it)}" punya transaksi LEBIH BARU setelah ${konteks} — `
          + 'batalkan yang lebih baru dulu.',
      }
    }
  }
  return { boleh: true }
}
