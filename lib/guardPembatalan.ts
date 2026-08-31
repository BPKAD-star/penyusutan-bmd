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
import { idTarget, type BatalPayload } from '@/lib/voidedAset'

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

// ---- Apa yang dihitung sebagai "transaksi LEBIH BARU" ----------------------
//
// Sampai 2026-08-31 jawabannya "baris apa pun ber-id lebih besar", dan itu
// membuat guard ini MENGUNCI SELAMANYA -- bukan sekadar galak. Ledger
// append-only, jadi baris yang mencatat sebuah pembatalan tak pernah hilang; ia
// duduk di atas event lama & memblokirnya untuk selama-lamanya, sementara pesan
// penolakannya menyuruh operator "batalkan yang lebih baru dulu" -- yang justru
// sudah ia lakukan, dan justru itu yang menambah baris pemblokirnya.
//
// Kejadian nyata (BKAD, 2026-08-31): KDP "Rehab Gedung Kantor BKAD" direklas ke
// Gedung (#421057), dikapitalisasi ke induk (`kapitalisasi_serap` #421059), lalu
// kapitalisasinya DIBATALKAN (`batal_kapitalisasi` #421061). Sesudah itu Batal
// Reklas mustahil dijalankan: dua baris di atasnya sudah saling menghapus, tapi
// guard tetap menghitung keduanya.
//
// Yang benar: baris yang SUDAH DIANULIR bukan peristiwa. Engine sendiri
// memperlakukannya begitu saat replay (`kapDibatalkan`/`reklasDibatalkan` di
// lib/engine/penyusutan.ts; `fetchBatalTargets`/`fetchNetSerap` di lib/rekon.ts),
// jadi guard yang menghitungnya justru TIDAK sepakat dengan engine yang hendak
// ia lindungi.
//
// WASPADA: yang diabaikan cuma PASANGAN UTUH DI ATAS AMBANG. Sebuah `batal_*`
// yang menganulir baris di BAWAH `trx_id` tetap dihitung -- ia perubahan
// keadaan yang nyata relatif terhadap event yang mau dibatalkan, bukan sepasang
// yang saling meniadakan. Kapitalisasi/reklas/koreksi yang masih HIDUP (belum
// dibatalkan) juga tetap memblokir persis seperti dulu; itu inti aturannya.

type BarisLedger = { id: number; jenis: string; periode: string; payload: BatalPayload }

// Pagu pengambilan. Satu aset praktis tak pernah punya sebanyak ini (yang
// terpanjang di produksi: belasan baris), tapi kalau sampai kena, pasangan mana
// yang utuh TIDAK bisa disimpulkan -- jadi jatuh ke perilaku lama (memblokir),
// bukan menebak. Fail-closed, sama dengan kegagalan query.
const PAGU_BARIS = 500

/**
 * Baris di atas `trx_id` yang MASIH BERLAKU -- pasangan (event + pembatalannya)
 * yang utuh di atas ambang dibuang.
 *
 * Diekspor supaya bisa diuji langsung tanpa klien tiruan: aturan inilah yang
 * menentukan sebuah pembatalan bisa dijalankan atau tidak, dan salah di sini tak
 * menghasilkan satu pun error -- cuma menu batal yang buntu (kalau terlalu
 * ketat) atau rantai replay yang rusak (kalau terlalu longgar).
 */
export function barisMasihBerlaku(rows: BarisLedger[]): BarisLedger[] {
  const diAtas = new Set(rows.map(r => r.id))
  const netral = new Set<number>()

  // (a) Pasangan ber-`payload.target_trx_id(s)` -- kapitalisasi (sisi INDUK),
  //     reklas, koreksi nilai/spesifikasi/pencatatan ganda, pengalihan,
  //     penggabungan. Pembacanya dipakai bersama lib/voidedAset.ts supaya tak
  //     ada dua penafsiran payload yang bisa menyimpang.
  for (const r of rows) {
    if (!r.jenis.startsWith('batal_')) continue
    const target = idTarget(r.payload)
    // Tak ber-target -> bukan pasangan yang bisa dinilai di sini; lihat (b).
    // Target di BAWAH ambang -> reversal-nya perubahan nyata, biarkan memblokir.
    if (target.length === 0 || !target.every(id => diAtas.has(id))) continue
    netral.add(r.id)
    for (const id of target) netral.add(id)
  }

  // (b) Sisi ANAK kapitalisasi. Baris `batal_kapitalisasi` di anak cuma membawa
  //     `{induk_id, no_dokumen}` -- tak ada target yang bisa dicocokkan, persis
  //     keterbatasan yang sudah tercatat di `fetchNetSerap` (lib/rekon.ts). Yang
  //     tersedia hanya URUTAN, dan itu memang cukup: siklus serap -> batal ->
  //     serap lagi selesai dengan "baris terakhir menang". Diurutkan
  //     (periode, id) supaya sepakat dengan `fetchNetSerap`.
  const serap = rows
    .filter(r => r.jenis === 'kapitalisasi_serap'
      || (r.jenis === 'batal_kapitalisasi' && idTarget(r.payload).length === 0))
    .sort((a, b) => a.periode.localeCompare(b.periode) || a.id - b.id)
  // Syaratnya DUA, bukan cuma "yang terakhir batal": urutan di atas ambang harus
  // BERANGKAT dari keadaan belum-terserap (baris pertamanya `kapitalisasi_serap`)
  // dan PULANG ke sana. Kalau serapnya terjadi di bawah ambang & batalnya di
  // atas, batal itu perubahan nyata -- biarkan memblokir.
  if (serap.length >= 2
    && serap[0].jenis === 'kapitalisasi_serap'
    && serap[serap.length - 1].jenis === 'batal_kapitalisasi') {
    for (const r of serap) netral.add(r.id)
  }

  return rows.filter(r => !netral.has(r.id))
}

/**
 * Baris ledger aset ini ber-`id` lebih besar dari `trx_id`, sesudah pasangan
 * yang saling meniadakan dibuang. `null` = tak ada penghalang.
 *
 * WASPADA: sengaja TIDAK memakai `{ count: 'exact', head: true }`. Respons HEAD
 * tak berbadan, sehingga supabase-js mengembalikan `error.message` KOSONG --
 * pesan yang justru paling dibutuhkan saat guard ini menolak karena gangguan,
 * bukan karena data.
 */
async function lebihBaruEfektif(
  supabase: SupabaseClient, it: ItemBatal,
): Promise<{ penghalang: BarisLedger | null } | { gagal: string }> {
  const { data, error } = await supabase.from('transaksi_bmd')
    .select('id,jenis,periode,payload')
    .eq('aset_id', it.aset_id).gt('id', it.trx_id)
    .order('id', { ascending: true }).limit(PAGU_BARIS)
  if (error) return { gagal: error.message }
  const rows = (data ?? []) as BarisLedger[]
  if (rows.length >= PAGU_BARIS) {
    return { gagal: `riwayatnya melebihi ${PAGU_BARIS} baris, pasangan pembatalan tak bisa dinilai` }
  }
  return { penghalang: barisMasihBerlaku(rows)[0] ?? null }
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
    const r = await lebihBaruEfektif(supabase, it)
    if ('gagal' in r) {
      return {
        boleh: false,
        pesan: `Batal dibatalkan: gagal memeriksa riwayat transaksi "${sebut(it)}" (${r.gagal}). `
          + 'Pembatalan TIDAK dijalankan — mencoba lagi lebih aman daripada membatalkan '
          + 'event di tengah rantai.',
      }
    }
    if (r.penghalang) {
      // Jenis & periodenya IKUT DISEBUT. Pesan lama cuma bilang "ada yang lebih
      // baru", jadi operator tak punya cara tahu menu mana yang harus dibuka —
      // dan kalau tebakannya keliru ia justru menambah baris pemblokir baru.
      return {
        boleh: false,
        pesan: `Batal diblokir: "${sebut(it)}" punya transaksi LEBIH BARU setelah ${konteks} — `
          + `"${r.penghalang.jenis}" (${r.penghalang.periode}). Batalkan yang itu dulu. `
          + 'Transaksi yang sudah dibatalkan tidak lagi menghalangi.',
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
