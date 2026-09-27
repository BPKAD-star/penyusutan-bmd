// ============================================================================
// Format lembar REKLASIFIKASI Permendagri 47/2021 — keluarga IV.F
//
//   IV.F.2       LAPORAN PENAMBAHAN akibat reklasifikasi BMD (rinci per barang)
//   IV.F.3–F.6   REKAPITULASI-nya, empat kedalaman kodefikasi
//   IV.F.12      LAPORAN PENGURANGAN akibat reklasifikasi BMD (rinci per barang)
//   IV.F.13–F.16 REKAPITULASI-nya
//
// Sumbernya ledger reklasifikasi (`reklas_kode` · `reklas_golongan` ·
// `reklas_komptabel`) — tabel yang SAMA yang dibaca lembar pengurangan.
//
// ── SATU BARIS LEDGER = DUA SISI, dan itu inti keluarga ini ─────────────────
// Sebuah reklas kode/golongan memindahkan satu barang dari `payload.kode_lama`
// ke `payload.kode_baru`. Bagi golongan TUJUAN ia PENAMBAHAN; bagi golongan
// ASAL ia PENGURANGAN. Jadi "penambahan vs pengurangan" **bukan dua kumpulan
// baris yang berbeda** — ia dua SUDUT PANDANG atas baris yang sama, persis
// hubungan IV.C (Penerimaan Internal) ↔ IV.D (Pengeluaran Internal) yang
// sama-sama membaca `mutasi_internal`.
//
// ⚠️ Konsekuensinya `arah` WAJIB ikut jadi identitas lembar. Tanpanya kedua
// lembar akan memuat baris yang persis sama & sama-sama mengaku benar — tanpa
// satu pun error. Yang membedakan keduanya SELURUHNYA di sini:
//   · kode yang jadi kunci pengelompokan (`kode_baru` vs `kode_lama`)
//   · isi kolom lawan ("...Awal" vs "...Tujuan")
//
// ── LEMBAR RINCI: SUSUNAN KOLOM KEPUTUSAN USER (2026-09-27/28) ──────────────
// Sama seperti keluarga perpindahan (lib/formatPerpindahan.ts), lembar rinci
// SENGAJA MENYIMPANG dari lembar asli Permendagri (yang punya DUA blok 7 sel
// segmen kode + blok "Nama Dokumen" yang selalu kosong). User menyerahkan
// susunan isiannya sendiri — SATU tabel datar 13 kolom, dikelompokkan per
// JENIS ASET (golongan `kodeUtama`) yang benar-benar ada di transaksinya,
// tiap kelompok ditutup "Total <jenis>", seluruhnya ditutup "TOTAL". Nominal
// 2 desimal.
//
// ⚠️ KEDUA CABANG BERKOLOM IDENTIK kecuali SATU: kolom lawan. Penambahan
// mencetak "Kode Barang - Uraian Barang Awal" (`kodeLawan` = kode ASAL),
// Pengurangan mencetak "...Tujuan" (`kodeLawan` = kode TUJUAN). Itu DATA di
// registry (`kolomLawan`), bukan cabang `if` di penyaji — pola PERSIS
// `kolomPihak` di keluarga perpindahan.
//
// ⚠️ LEMBAR REKAP (.3–.6 / .13–.16) TIDAK berubah — tetap bentuk Permendagri
// (kode bersegmen, lima kolom, kedalaman terdangkal beda per lembar). Mesin
// subtotalnya dari lib/formatPermendagri.ts, dipakai juga oleh baris "Total
// <jenis>" di lembar rinci, jadi keduanya mustahil menjumlah berbeda.
// ============================================================================

/**
 * Bentuk tangga lembar REKAP — kedalaman & judulnya.
 *
 * ⚠️ **NOMOR LEMBARNYA TIDAK DI SINI.** Penambahan memakai IV.F.3–F.6 dan
 * pengurangan IV.F.13–F.16, tapi HIERARKINYA identik — jadi yang dibagi bentuk
 * tangganya, sedangkan nomornya ada di `akhiranRekap` tiap cabang. Menyalin
 * tangganya per cabang berarti dua daftar `segMin` yang harus dijaga sepakat,
 * dan yang menyimpang tak akan menghasilkan satu pun error (lihat di bawah).
 *
 * ⚠️ **`segMin` = 3 untuk tiga lembar terdalam, 2 untuk yang terdangkal**, dan
 * itu mengikuti gambar formatnya — bukan kelalaian. Alasannya terbaca sendiri
 * begitu ketiganya disandingkan: lembar "MENURUT JENIS" berhenti di kedalaman
 * yang justru jadi tingkat pengelompokan lembar-lembar di atasnya, jadi kalau
 * `segMin`-nya 3 juga ia berubah jadi daftar datar tanpa satu pun baris
 * kelompok. Yang 2 memberinya kelompok neraca (`1.3` ASET TETAP) di atasnya.
 *
 * ⚠️ Menyeragamkannya jadi 3 semua (seperti keluarga IV.B/IV.C/IV.D) atau 2
 * semua (seperti IV.A) **TIDAK mengubah satu pun angka** — ia cuma
 * menambah/menghilangkan baris kelompok teratas — sehingga tak ada uji
 * aritmetika yang akan menangkapnya. Uji khusus di lib/formatReklas.test.ts &
 * tests/lembarReklas.test.tsx satu-satunya penjaganya.
 *
 * ⚠️ **KOREKSI 2026-09-07:** `.5`/`.15` (MENURUT OBJEK) sempat disetel 2, dibaca
 * dari gambar IV.F.5 yang beresolusi rendah. Lembar cerminnya (IV.F.13–F.16,
 * diserahkan belakangan & jauh lebih terbaca) menunjukkan **IV.F.15 membuka di
 * `x x x`** dan hanya IV.F.16 yang membuka di `x x`. Karena keduanya dicetak
 * dari template yang sama, yang berlaku pembacaan yang lebih jelas.
 *
 * ⚠️ Urutannya BUKAN kebetulan: indeks 0 paling dalam, indeks 3 paling dangkal —
 * dan `akhiranRekap` tiap cabang WAJIB sejajar indeks dengannya.
 */
export const TANGGA_REKAP_REKLAS = [
  { seg: 6, segMin: 3, menurut: 'SUB RINCIAN OBJEK' },
  { seg: 5, segMin: 3, menurut: 'RINCIAN OBJEK' },
  { seg: 4, segMin: 3, menurut: 'OBJEK' },
  { seg: 3, segMin: 2, menurut: 'JENIS' },
] as const

// ── Kolom lembar rinci ──────────────────────────────────────────────────────

export type KolomReklas =
  | 'nibar' | 'kode' | 'nama'
  | 'jumlah' | 'harga_satuan' | 'nilai_perolehan' | 'akumulasi' | 'nilai_buku'
  | 'lawan' | 'penyebab' | 'dok_nomor' | 'dok_tanggal' | 'keterangan'

export type KolomRinciReklas = {
  key: KolomReklas
  judul: string
  /** Persen lebar. Totalnya WAJIB 100 persis — dikunci test. */
  lebar: number
  rata: 'kiri' | 'kanan' | 'tengah'
}

/**
 * Kolom lembar rinci, kiri→kanan, dipakai KEDUA cabang.
 *
 * ⚠️ Judul kolom `lawan` di sini cuma penampung — yang dicetak
 * `f.kolomLawan` milik cabangnya. Kalau judul ini yang tercetak, lembar
 * Pengurangan menyebut "...Awal" padahal isinya kode TUJUAN.
 *
 * ⚠️ LEBAR: totalnya 100 PERSIS (`table-fixed`, "fit to window"), pola & huruf
 * yang sama dgn `KOLOM_RINCI_PERPINDAHAN` (lib/formatPerpindahan.ts) — 10px,
 * NIBAR dapat jatah terbesar (12%) berhuruf 9px sendiri supaya potongan
 * pertama `pecahNibar()` (26 digit) muat sebaris (permintaan user 2026-09-27:
 * "nibar jangan lupa diperhatikan ukurannya, buat yang proporsional pas").
 * Kolom uang dianggarkan untuk rupiah 2 desimal SEBARIS — jangan dipersempit.
 */
export const KOLOM_RINCI_REKLAS: readonly KolomRinciReklas[] = [
  { key: 'nibar', judul: 'NIBAR', lebar: 12, rata: 'kiri' },
  { key: 'kode', judul: 'Kode Barang - Uraian Barang', lebar: 9.5, rata: 'kiri' },
  { key: 'nama', judul: 'Nama Barang', lebar: 8.5, rata: 'kiri' },
  { key: 'jumlah', judul: 'Jumlah - Satuan', lebar: 4, rata: 'kiri' },
  { key: 'harga_satuan', judul: 'Harga Satuan', lebar: 7.5, rata: 'kanan' },
  { key: 'nilai_perolehan', judul: 'Nilai Perolehan', lebar: 8.5, rata: 'kanan' },
  { key: 'akumulasi', judul: 'Akumulasi Penyusutan', lebar: 8, rata: 'kanan' },
  { key: 'nilai_buku', judul: 'Nilai Buku', lebar: 8.5, rata: 'kanan' },
  { key: 'lawan', judul: '(kode lawan — lihat kolomLawan)', lebar: 10, rata: 'kiri' },
  { key: 'penyebab', judul: 'Penyebab Reklasifikasi', lebar: 7.5, rata: 'kiri' },
  { key: 'dok_nomor', judul: 'Nomor Dokumen', lebar: 6, rata: 'kiri' },
  { key: 'dok_tanggal', judul: 'Tanggal Dokumen', lebar: 4.8, rata: 'tengah' },
  { key: 'keterangan', judul: 'Keterangan', lebar: 5.2, rata: 'kiri' },
]

/**
 * Kolom yang dijumlah di baris "Total <jenis>" & "TOTAL".
 *
 * ⚠️ Harga Satuan SENGAJA TIDAK — menjumlahkan harga satuan barang yang
 * berbeda menghasilkan angka tak berarti, dan begitu tercetak ia dikutip orang.
 * Pola & alasan yang sama dgn `KOLOM_DIJUMLAH_PERPINDAHAN`.
 */
export const KOLOM_DIJUMLAH_REKLAS: readonly KolomReklas[] = ['nilai_perolehan', 'akumulasi', 'nilai_buku']

/** Identitas cabang. Dipakai URL halaman cetak & kunci ingatan penanda tangan. */
export type IdReklas = 'penambahan' | 'pengurangan'

/**
 * Sisi yang didaftar lembar ini.
 *
 * `penambahan` → dikelompokkan menurut `payload.kode_baru`; kolom lawan berisi
 *                kode ASAL ("...Awal").
 * `pengurangan` → dikelompokkan menurut `payload.kode_lama`; kolom lawan berisi
 *                kode TUJUAN ("...Tujuan").
 *
 * ⚠️ Sengaja identik dengan `IdReklas`, dan itu BUKAN keduanya-boleh-dipakai-
 * bergantian: `IdReklas` menjawab "lembar yang mana", `ArahReklas` menjawab
 * "sisi mana yang dibaca dari ledger". Pemuat (lib/laporanReklas.ts) cuma tahu
 * yang kedua & tak boleh ikut tahu soal lembar.
 */
export type ArahReklas = 'penambahan' | 'pengurangan'

export type FormatReklas = {
  /** Kode lembar RINCI. */
  kode: string
  /** Awalan tanpa akhiran, dipakai merakit nomor tiap lembar (`IV.F`). */
  awalan: string
  /** Akhiran lembar RINCI — 2 (penambahan) atau 12 (pengurangan). */
  akhiranRinci: number
  /**
   * Akhiran keempat lembar REKAP, SEJAJAR INDEKS dengan `TANGGA_REKAP_REKLAS`.
   *
   * ⚠️ Kedua cabang memakai hierarki yang PERSIS SAMA tapi nomor lembar yang
   * berbeda (3–6 vs 13–16), jadi yang dipisah cuma nomornya. Urutan wajib dari
   * yang PALING DALAM ke paling dangkal; tertukar = lembar berjudul "MENURUT
   * JENIS" berisi rincian sampai sub rincian objek, tanpa satu pun error.
   */
  akhiranRekap: readonly [number, number, number, number]
  /**
   * Sisi yang didaftar. ⚠️ Bersama jenis ledgernya ia membentuk identitas
   * lembar: penambahan & pengurangan membaca baris yang PERSIS SAMA.
   */
  arah: ArahReklas
  /** Baris 1 judul, tanpa isian "BERUPA…(1)" yang diisi jenis asetnya. */
  judul: string
  /**
   * Judul kolom lawan di lembar RINCI — satu-satunya kolom yang beda antar
   * cabang. ⚠️ Kalau tertukar, lembar Penambahan mencetak "...Tujuan" padahal
   * isinya kode ASAL — terisi penuh, tanpa satu pun error. Pola PERSIS
   * `kolomPihak` di lib/formatPerpindahan.ts.
   */
  kolomLawan: string
  /** Kalimat baris kosong ("Tidak ada penambahan/pengurangan pada periode ini."). */
  kosong: string
}

/**
 * ⚠️ Penanda subtotal SAMA PERSIS di kedua cabang — lembar aslinya memang
 * begitu. Dipakai `susunRinci` untuk baris kelompok versi LAMA (blok
 * bersegmen) — TIDAK dipakai lagi oleh lembar rinci baru, yang subtotalnya
 * lewat `susunRekap(items, 3, segMin)` (kelompok jenis aset). Dipertahankan
 * murni sebagai rujukan nomor kolom asli & tak dibaca penyaji baru.
 */
export const FORMAT_REKLAS: Record<IdReklas, FormatReklas> = {
  penambahan: {
    kode: 'IV.F.2',
    awalan: 'IV.F',
    akhiranRinci: 2,
    akhiranRekap: [3, 4, 5, 6],
    arah: 'penambahan',
    judul: 'LAPORAN PENAMBAHAN AKIBAT REKLASIFIKASI BMD BERUPA',
    kolomLawan: 'Kode Barang - Uraian Barang Awal',
    kosong: 'Tidak ada penambahan akibat reklasifikasi pada periode ini.',
  },

  // ── IV.F.12–F.16 — sisi PENGURANGAN ──────────────────────────────────────
  //
  // Ledger yang SAMA dengan penambahan, dibaca dari sisi sebaliknya: barangnya
  // dikelompokkan menurut kode ASAL, dan kolom lawannya berisi kode TUJUAN.
  //
  // ⚠️ Nomor lembarnya MELOMPAT ke 12–16, bukan menyambung 7–11. Itu memang
  // begitu di lampiran Permendagri (7–11 milik hal lain), jadi jangan
  // "dirapikan" jadi berurutan — nomor lembar itu yang dipakai orang mencari
  // formatnya.
  pengurangan: {
    kode: 'IV.F.12',
    awalan: 'IV.F',
    akhiranRinci: 12,
    akhiranRekap: [13, 14, 15, 16],
    arah: 'pengurangan',
    judul: 'LAPORAN PENGURANGAN AKIBAT REKLASIFIKASI BMD BERUPA',
    kolomLawan: 'Kode Barang - Uraian Barang Tujuan',
    kosong: 'Tidak ada pengurangan akibat reklasifikasi pada periode ini.',
  },
}

/**
 * Sisi mana yang jadi "utama" & mana yang jadi "lawan", untuk satu baris ledger.
 *
 * ⚠️ **INI ATURAN INTI SELURUH KELUARGA IV.F**, dan ia sengaja jadi fungsi
 * MURNI supaya bisa diuji tanpa DB. Satu reklas adalah penambahan di
 * `kode_baru` sekaligus pengurangan di `kode_lama`; kalau pemetaannya tertukar,
 * lembar penambahan akan mengelompokkan barang menurut golongan ASALNYA & blok
 * lawannya menunjuk balik ke golongan tujuan — dan karena kedua lembar membaca
 * baris yang sama, hasilnya tetap terisi penuh, footing-nya tetap benar, dan
 * TAK ADA satu pun yang berteriak.
 *
 * `nama*` ikut dibalik dengan alasan yang sama: reklas boleh sekalian mengganti
 * nama barang (`payload.nama_lama`/`nama_baru`), jadi lembar penambahan memuat
 * nama SESUDAH & pengurangan nama SEBELUM.
 */
export function sisiReklas(arah: ArahReklas, p: {
  kodeLama: string; kodeBaru: string
  namaLama?: string | null; namaBaru?: string | null
  /** Cadangan waktu reklasnya tak mengganti nama (kasus terbanyak). */
  namaAset?: string | null
}): { kodeUtama: string; kodeLawan: string; namaSpek: string } {
  const tambah = arah === 'penambahan'
  return {
    kodeUtama: tambah ? p.kodeBaru : p.kodeLama,
    kodeLawan: tambah ? p.kodeLama : p.kodeBaru,
    namaSpek: ((tambah ? p.namaBaru : p.namaLama) || p.namaAset) || '',
  }
}

/** Satu lembar rekap: bentuknya dari tangga, nomornya dari cabangnya. */
export type LembarRekapReklas = {
  akhiran: number
  seg: number
  segMin: number
  menurut: string
}

/**
 * Keempat lembar rekap cabang ini, lengkap dengan nomornya.
 *
 * ⚠️ SATU-SATUNYA tempat `TANGGA_REKAP_REKLAS` disandingkan dengan
 * `akhiranRekap`. Pemakai (penyaji, tab, halaman cetak, test) WAJIB lewat sini —
 * kalau ada yang menyandingkannya sendiri lewat indeks, cabang yang nomornya
 * bergeser akan mencetak "Format IV.F.6" di atas tabel milik IV.F.16 tanpa satu
 * pun error.
 */
export function lembarRekapReklas(f: FormatReklas): LembarRekapReklas[] {
  return TANGGA_REKAP_REKLAS.map((t, i) => ({ ...t, akhiran: f.akhiranRekap[i] }))
}

/**
 * Seluruh akhiran lembar cabang ini, rinci lebih dulu.
 *
 * Dipakai daftar centang & penyaring `?lembar=` di halaman cetak — dua tempat
 * yang kalau memakai rentang angka yang ditulis tangan (`n >= 2 && n <= 6`) akan
 * DIAM-DIAM menolak seluruh lembar cabang pengurangan.
 */
export function akhiranLembarReklas(f: FormatReklas): number[] {
  return [f.akhiranRinci, ...f.akhiranRekap]
}

/**
 * Judul lembar REKAP. `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya
 * (IV.F.3–F.6 semuanya REKAPITULASI).
 */
export function judulRekapReklas(f: FormatReklas): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
