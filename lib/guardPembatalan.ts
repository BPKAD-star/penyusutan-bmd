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

// Sengaja bertipe struktural, bukan `ItemBatal` — ia dipakai kedua guard, dan
// `ItemSisip` tak punya `trx_id`. Yang dibutuhkan cuma label & aset_id-nya.
const sebut = (it: { aset_id: string; label?: string | null }) => it.label?.trim() || it.aset_id

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

// ── Sisi sebaliknya: jangan MENYISIPKAN event di tengah rantai ───────────────
//
// `cekBolehBatal` menjaga arah MUNDUR (membuang event yang bukan terakhir).
// Yang selama ini tak dijaga adalah arah MAJU: mencatat event BARU dengan
// tanggal MUNDUR, ke aset yang sudah punya peristiwa sesudah tanggal itu.
//
// Kenapa berbahaya: engine mengurutkan replay by periode → tanggal → created_at
// (BUKAN by id), jadi baris yang baru ditulis tapi bertanggal lebih tua akan
// diproses SEBELUM peristiwa yang sudah ada. Rantai state-nya berubah tanpa satu
// pun baris lama disentuh — dan seperti biasa di modul ini, tanpa satu pun
// error. Dipakai saat MEMBUAT kapitalisasi (2026-08-27); menu lain yang mencatat
// event bertanggal bebas sebaiknya ikut memakainya.
export type ItemSisip = { aset_id: string; label?: string | null }

/**
 * Boleh mencatat event bertanggal `tanggal` pada aset-aset ini?
 *
 * ⚠️ `batal_kapitalisasi` DIKECUALIKAN dari pemeriksaan, dan itu bukan
 * kelonggaran asal: (a) ia baris REVERSAL yang dinetralkan engine lewat
 * `target_trx_id`, bukan lewat urutan; (b) alur "✎ Ubah" menulis reversal itu
 * lebih dulu, jadi tanpa pengecualian ini transaksi penggantinya akan diblokir
 * oleh pembatalannya sendiri. Pasangannya — baris `kapitalisasi` yang dibatalkan
 * — tetap ikut diperiksa karena tanggalnya sama, jadi kapitalisasi lain yang
 * sungguh-sungguh lebih baru tetap tertangkap.
 *
 * Fail-closed sama seperti `cekBolehBatal`: query gagal → tidak boleh.
 */
export async function cekBolehSisip(
  supabase: SupabaseClient, items: ItemSisip[], tanggal: string, konteks: string,
): Promise<HasilGuard> {
  for (const it of items) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('jenis,tanggal')
      .eq('aset_id', it.aset_id)
      .neq('jenis', 'batal_kapitalisasi')
      .gt('tanggal', tanggal)
      .order('tanggal', { ascending: true })
      .limit(1)
    if (error) {
      return {
        boleh: false,
        pesan: `Dibatalkan: gagal memeriksa riwayat transaksi "${sebut(it)}" (${error.message}). `
          + 'Tidak ada yang dicatat — mencoba lagi lebih aman daripada menyisipkan '
          + 'peristiwa di tengah rantai.',
      }
    }
    const baris = (data ?? [])[0] as { jenis: string; tanggal: string } | undefined
    if (baris) {
      return {
        boleh: false,
        pesan: `Diblokir: "${sebut(it)}" sudah punya transaksi "${baris.jenis}" bertanggal `
          + `${baris.tanggal}, LEBIH BARU dari ${konteks} (${tanggal}). Mencatat peristiwa `
          + 'bertanggal mundur akan menyisipkannya di tengah rantai & merusak replay '
          + 'penyusutan. Majukan tanggalnya, atau batalkan transaksi yang lebih baru dulu.',
      }
    }
  }
  return { boleh: true }
}
