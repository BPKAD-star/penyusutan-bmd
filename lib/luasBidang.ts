// ============================================================================
// Σ luas bidang tanah — KAPAN ia sah dipakai, dan kapan harus jatuh ke kolom
// luas milik registernya sendiri.
//
// Diangkat 2026-09-15 pada KEMUNCULAN KETIGA (CODING-STANDARD §1.2 "rule of
// three"): Daftar Barang, Saldo Awal → Daftar Barang Awal, dan panel Kelola
// Bidang di GIS sama-sama menuliskan aturan ini sendiri-sendiri — dan
// komentarnya sendiri sudah menyatakan niatnya ("aturannya sama persis dipakai
// Daftar Barang… supaya angka di dua menu tak pernah beda tanpa sebab"). Yang
// menjaganya selama ini cuma kalimat itu.
//
// ⚠️ Sejak 2026-09-23, Daftar Barang Awal TIDAK LAGI dipakaikan aturan ini —
// baseline itu foto BEKU 2025, sementara bidang menempel ke register HIDUP,
// jadi Σ-nya di sana justru membuat halaman "beku" ikut bergerak mengikuti
// data hari ini. Pemakainya sekarang tinggal Daftar Barang & panel GIS.
//
// ⚠️ INI LAPIS 1. Aturannya bukan kerapian tampilan:
//
//   **Σ hanya sah kalau SEMUA bidang punya luas.** Kalau baru sebagian diisi,
//   jumlahnya LEBIH KECIL dari luas sebenarnya — dan di layar itu terbaca
//   sebagai penyusutan luas yang tak pernah terjadi. Yang belum lengkap wajib
//   jatuh ke kolom luas register + ditandai, bukan diam-diam dijumlah.
//
// Bukan kasus langka: per 2026-07-28 dari 529 bidang baru 4 yang berluas.
//
// ⚠️ Σ-nya DIHITUNG SAAT TAMPIL, JANGAN pernah disimpan balik ke kolom —
// angka tersimpan langsung basi begitu bidang ditambah/diedit/dihapus (tak ada
// trigger/cron yang menjaganya), dan snapshot 2025 tak boleh ikut bergerak
// mengikuti data hidup. Lihat CLAUDE.md "TANAH: `aset_bidang_tanah` MENANG".
//
// Dikunci lib/luasBidang.test.ts.
// ============================================================================

/** Ringkasan bidang milik SATU register tanah. */
export type RingkasBidang = {
  /** Banyaknya bidang. */
  n: number
  /** Berapa di antaranya yang kolom `luas`-nya terisi. */
  nLuas: number
  /** Σ luas bidang yang terisi. */
  luas: number | null
}

/**
 * Boleh dipakaikah Σ bidang sebagai luas register?
 *
 * Ketiga syarat wajib, dan tak satu pun boleh dilonggarkan:
 *   · `n > 0`        — belum dipetakan sama sekali → tak ada Σ untuk dipakai
 *   · `nLuas === n`  — **inti aturannya**; sebagian terisi = Σ yang terlalu kecil
 *   · `luas != null` — penjaga terakhir kalau agregatnya sendiri kosong
 */
// ⚠️ Mengembalikan `boolean` BIASA, sengaja BUKAN type-predicate
// (`b is RingkasBidang & { luas: number }`). Bentuk predikat terlihat lebih
// rapi tapi menyempitkan cabang `else` di pemanggil jadi `never` — dan
// pemakainya memang membaca `b.n` justru DI cabang itu ("N bidang · luas
// belum lengkap"). Kerapian tipe yang mematahkan pemakainya bukan kerapian.
export function luasBidangSah(b: RingkasBidang | undefined | null): boolean {
  return !!b && b.n > 0 && b.nLuas === b.n && b.luas != null
}

/**
 * Luas yang DITAMPILKAN untuk satu register: Σ bidang bila sah, kalau tidak
 * jatuh ke kolom luas register itu sendiri.
 *
 * ⚠️ `luasRegister` boleh `null` — "tak diketahui" sengaja dibedakan dari 0.
 * Menjadikannya 0 membuat tanah tanpa data terbaca seluas nol meter.
 */
export function luasEfektif(
  b: RingkasBidang | undefined | null,
  luasRegister: number | null,
): number | null {
  return luasBidangSah(b) ? b!.luas : luasRegister
}

/**
 * Bentuk yang dipakai panel Kelola Bidang (GIS): daftar bidang MENTAH, belum
 * diagregasi. Jawabannya wajib sama dengan `luasBidangSah` di atas — itu
 * seluruh alasan berkas ini ada.
 */
export function ringkasDaftarBidang(rows: readonly { luas: number | null }[]): RingkasBidang {
  const nLuas = rows.filter(b => b.luas != null).length
  return {
    n: rows.length,
    nLuas,
    luas: rows.length === 0 ? null : rows.reduce((s, b) => s + (b.luas || 0), 0),
  }
}
