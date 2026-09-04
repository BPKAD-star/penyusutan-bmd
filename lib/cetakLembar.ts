// Kerangka lembar cetak — mekanik yang dipakai BERSAMA semua lembar resmi.
//
// Fungsi MURNI (tanpa React, tanpa DOM) supaya bisa diuji: yang dijaga di sini
// kelas kegagalan yang cuma kelihatan SESUDAH lembarnya tercetak, dan lembar
// resmi itu ditandatangani lalu dipindai — mahal untuk diulang.
//
// ── Kenapa satu sumber ──────────────────────────────────────────────────────
// Sampai 2026-08-29 blok `@media print` yang sama disalin di EMPAT tempat
// (CetakLaporan.tsx, rekonsiliasi ×2, bmd/page.tsx) dan penyaring nama berkas
// di ENAM tempat — salah satunya (`bmd/page.tsx`) sudah menyimpang: kehilangan
// `.trim()`, jadi nama SKPD berspasi ujung menghasilkan berkas bernama
// "…_Dinas X _2026-S1". Itu pola "ubah satu, samakan yang lain" yang di repo
// ini sudah berkali-kali terbukti dilanggar.
//
// ── Isolasi cetak: kenapa `visibility` DAN `display` dua-duanya ─────────────
// Isolasi memakai `visibility:hidden` atas `body *` lalu hanya lembarnya yang
// ditampilkan — sengaja begitu supaya tak perlu tahu susunan layout dashboard
// (sidebar, top bar); kalau layoutnya berubah, cetakannya tetap bersih.
//
// ⚠️ TAPI untuk lembar LAIN di halaman yang sama, `visibility` saja TIDAK
// CUKUP: elemen tak-terlihat tetap MENGISI tata letak. Lembar setinggi 8
// halaman yang cuma di-`visibility:hidden` menghasilkan 8 halaman KOSONG di
// belakang berkas — persis yang pernah terjadi di Rekonsiliasi (tabel A4
// lanskap vs Berita Acara A4 potret di satu halaman). Karena itu `sembunyikan`
// memakai `display:none`.

/**
 * Ukuran kertas yang dipakai lembar resmi di aplikasi ini.
 *
 * F4 (330×215mm) dipakai lembar se-Kabupaten RKBMD & Standar Harga — tabel
 * 13 kolom terbukti mustahil muat di lebar A4 215mm.
 *
 * `F4 potret` dipakai lembar REKAP Perolehan (IV.A.<n>.3–10): cuma 4–6 kolom,
 * jadi lanskap menyisakan ruang kosong yang justru membuat fontnya terlihat
 * kecil — sementara kertas fisiknya tetap F4 seperti lembar rincinya.
 */
export type Kertas = 'A4 potret' | 'A4 lanskap' | 'F4 lanskap' | 'F4 potret'

/** Nilai `@page { size: … }` per kertas. */
export const UKURAN_KERTAS: Record<Kertas, string> = {
  'A4 potret': 'A4 portrait',
  'A4 lanskap': 'A4 landscape',
  'F4 lanskap': '330mm 215mm',
  'F4 potret': '215mm 330mm',
}

export type OpsiCetakLembar = {
  /** id elemen lembar, TANPA '#'. Mis. 'cetak-ba'. */
  id: string
  kertas: Kertas
  /** Bawaan '1cm'. Lembar padat kadang perlu lebih sempit. */
  margin?: string
  /**
   * id lembar LAIN di halaman yang sama yang wajib `display:none`.
   * Wajib diisi kalau halaman itu punya lebih dari satu lembar — lihat
   * catatan "visibility DAN display" di atas.
   */
  sembunyikan?: string[]
  /** Aturan khas lembar itu (font, padding, page-break). Disisipkan apa adanya. */
  tambahan?: string
}

const ID_SAH = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * Blok `@media print` untuk satu lembar.
 *
 * MELEMPAR untuk dua kekeliruan yang kalau dibiarkan menghasilkan berkas
 * KOSONG tanpa satu pun error — dan operator baru sadar setelah dialog Print
 * terbuka:
 *
 *  1. `id` diawali '#' atau memuat karakter tak sah → selektornya jadi `##id`
 *     yang tak cocok dengan apa pun, jadi SELURUH halaman tetap
 *     `visibility:hidden` dan yang tercetak lembar kosong.
 *  2. `sembunyikan` memuat `id` lembarnya sendiri → lembar yang mau dicetak
 *     justru di-`display:none`.
 */
export function cssCetakLembar(o: OpsiCetakLembar): string {
  if (!ID_SAH.test(o.id)) {
    throw new Error(
      `cssCetakLembar: id '${o.id}' tidak sah — tulis tanpa '#' dan tanpa spasi ` +
      `(mis. 'cetak-ba'). Selektor yang salah membuat SELURUH halaman tetap ` +
      `tersembunyi dan yang tercetak lembar kosong.`)
  }
  const lain = o.sembunyikan ?? []
  for (const s of lain) {
    if (s === o.id) {
      throw new Error(
        `cssCetakLembar: '${o.id}' menyembunyikan dirinya sendiri — lembar yang ` +
        `hendak dicetak justru di-display:none, hasilnya berkas kosong.`)
    }
    if (!ID_SAH.test(s)) {
      throw new Error(`cssCetakLembar: id '${s}' di \`sembunyikan\` tidak sah — tulis tanpa '#'.`)
    }
  }
  const sel = `#${o.id}`
  return [
    '@media print {',
    `  @page { size: ${UKURAN_KERTAS[o.kertas]}; margin: ${o.margin ?? '1cm'}; }`,
    '  body { background: #fff; }',
    '  body * { visibility: hidden; }',
    // ⚠️ `display:none` untuk saudaranya WAJIB lebih dulu daripada aturan
    // lembar ini, supaya urutannya terbaca jelas saat di-inspect.
    ...lain.map(s => `  #${s} { display: none !important; }`),
    `  ${sel} { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }`,
    `  ${sel}, ${sel} * { visibility: visible; }`,
    `  ${sel} .no-print { display: none !important; }`,
    `  ${sel} tr { break-inside: avoid; }`,
    // Judul kolom diulang tiap halaman — lembar resmi sering berlembar-lembar,
    // dan tabel tanpa kepala di halaman 2+ tak terbaca.
    `  ${sel} thead { display: table-header-group; }`,
    // Tanpa ini banyak peramban membuang warna latar saat mencetak.
    '  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    ...(o.tambahan ? [o.tambahan] : []),
    '}',
  ].join('\n')
}

// ⚠️ Nama berkas PINDAH ke lib/namaBerkas.ts (2026-09-04) — dipakai bersama
// Export Excel, bukan cuma lembar cetak, dan aturan susunannya kini satu untuk
// seluruh aplikasi: <Nama Laporan>_<Tahun>_<Kode Jenis Aset>_<SKPD>.
