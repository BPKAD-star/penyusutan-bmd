// ============================================================================
// Format lembar REKLASIFIKASI Permendagri 47/2021 — keluarga IV.F
//
//   IV.F.2      LAPORAN PENAMBAHAN AKIBAT REKLASIFIKASI BMD (rinci per barang)
//   IV.F.3–F.6  REKAPITULASI-nya, empat kedalaman kodefikasi
//
// Sumbernya ledger reklasifikasi (`reklas_kode` · `reklas_golongan` ·
// `reklas_komptabel`) — tabel yang SAMA yang dibaca lembar PENGURANGAN nanti.
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
//   · isi blok "Reklasifikasi dari" (vs "Reklasifikasi ke")
//
// ⚠️ **PENGURANGAN BELUM DIBANGUN** (2026-09-07) — formatnya belum diserahkan
// user. Registry ini sengaja sudah bertipe `Record<IdReklas, …>` dengan `arah`
// sebagai anggota tipe supaya cabang kedua cuma menambah SATU entri; JANGAN
// menghapus `arah` "karena cuma ada satu cabang", itu justru penjaga yang bikin
// cabang kedua tak bisa lahir sebagai kembaran senyap.
//
// ── Beda struktural dari keluarga IV.B/IV.C/IV.D, jangan disamakan ──────────
// 1. **DUA blok kode bersegmen** — kolom (9) Kode Barang tujuan DAN kolom (17)
//    "Reklasifikasi dari → Kode Barang". Keluarga perpindahan cuma punya satu
//    (blok "Asal Barang"-nya kolom teks biasa, karena perpindahan tak mengubah
//    kodefikasi). Ini yang membuat penyajinya berdiri sendiri.
// 2. **Tak ada Harga Satuan & Jumlah Total** — cuma satu kolom "Nilai
//    Perolehan (Rp)". Barangnya tidak sedang dibeli; nilainya dibawa apa adanya.
// 3. **Lembar rekapnya LIMA kolom** (Kode · Nama · Nilai Perolehan · Akumulasi
//    · Nilai Buku) — TANPA "Jumlah Barang" yang ada di rekap IV.B/IV.C/IV.D.
// 4. **Kedalaman terdangkal rekapnya BEDA PER LEMBAR** — lihat
//    `TANGGA_REKAP_REKLAS`.
//
// ⚠️ MESIN SUBTOTALNYA dari lib/formatPermendagri.ts — dipakai bersama seluruh
// cabang Permendagri di aplikasi ini. Yang ada di sini cuma susunan kolomnya.
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — alasannya sama persis dengan
// yang tertulis di kepala lib/formatPermendagri.ts. Nomornya TIDAK dicetak di
// lembar (keputusan user 2026-08-30); yang tersisa dua gunanya: tautan balik ke
// lembar asli, dan penjaga struktur kolom lewat test.
// ============================================================================

import { sisaLebar, type Kolom } from './formatPermendagri'

/** Banyaknya sel segmen kode — berlaku untuk KEDUA blok kode (kode penuh = 7). */
export const SEL_KODE_REKLAS = 7

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

// ── Kolom ───────────────────────────────────────────────────────────────────

export type KolomReklas =
  | 'nibar'
  | 'nama' | 'spek_nama'
  | 'jumlah' | 'satuan'
  | 'nilai_perolehan' | 'akumulasi' | 'nilai_buku'
  | 'lawan_kode' | 'lawan_nama'
  | 'penyebab'
  | 'dok_nama' | 'dok_nomor' | 'dok_tanggal'
  | 'keterangan'

export type KolomLembarReklas = Kolom<KolomReklas>

/** Identitas cabang. Dipakai URL halaman cetak & kunci ingatan penanda tangan. */
export type IdReklas = 'penambahan' | 'pengurangan'

/**
 * Sisi yang didaftar lembar ini.
 *
 * `penambahan` → dikelompokkan menurut `payload.kode_baru`; blok lawan berisi
 *                kode ASAL ("Reklasifikasi dari").
 * `pengurangan` → dikelompokkan menurut `payload.kode_lama`; blok lawan berisi
 *                kode TUJUAN ("Reklasifikasi ke").
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
  /** Judul blok kode lawan — "Reklasifikasi dari" / "Reklasifikasi ke". */
  grupLawan: string
  /**
   * Kolom PALING KIRI, di luar blok "Penggolongan dan Kodefikasi Barang".
   * Di keluarga ini selalu NIBAR.
   */
  kolomKiri: KolomLembarReklas
  /** Kolom yang duduk DI DALAM blok Penggolongan, tepat sesudah sel-sel kode. */
  kolomNama: KolomLembarReklas
  /** Sisa kolom, kiri→kanan sesudah blok Penggolongan. */
  kolom: KolomLembarReklas[]
  /** Penanda subtotal sejajar `SEG_SUBTOTAL` = [6seg, 5seg, 4seg, 3seg]. */
  subtotal: readonly [number, number, number, number]
  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/**
 * ⚠️ LEBAR: totalnya + `sisaLebar` = 100 PERSIS, dan itu yang membuat lembarnya
 * "fit to window" di `table-fixed`. Di sini ada DUA blok bersegmen (7 sel
 * masing-masing, 14 sel total) — jadi keduanya dianggarkan bersamaan:
 * `lawan_kode` ~13% dan sisanya (blok kode tujuan) juga ~13%, ≈1,86% per sel.
 * Itu sudah lebih lega daripada IV.B (1,46%/sel) yang terbukti terbaca.
 *
 * ⚠️ NIBAR tak bisa ikut dipepet: 45 digit, dipenggal dua baris di batas segmen
 * oleh `pecahNibar()`, dan potongan pertama 26 digit wajib muat SEBARIS — kalau
 * tidak ia membungkus sendiri lebih dulu & hasilnya tiga baris. Selnya karena
 * itu memakai font sendiri yang lebih kecil.
 */
/**
 * Susunan kolom lembar rinci — IDENTIK di kedua cabang.
 *
 * ⚠️ SATU pabrik, bukan dua daftar yang disalin. IV.F.2 (penambahan) & IV.F.12
 * (pengurangan) sama persis sampai ke penomorannya (8)–(23), penanda subtotal
 * (24)–(27), & kaki (28)(29)(30); yang berbeda **hanya judul lembar dan judul
 * blok lawan** ("Reklasifikasi dari" vs "…ke"). Dua salinan berarti dua tempat
 * yang harus disunting tiap satu kolom bergeser — dan yang terlewat TIDAK
 * menghasilkan error, ia cuma mencetak satu lembar yang beda susunan dari
 * kembarannya (CODING-STANDARD §1.2).
 *
 * Fungsi, bukan konstanta bersama, supaya kedua entri registry tak berbagi
 * OBJEK yang sama — daftar yang dipakai bersama gampang tersunting di tempat
 * oleh pemakai yang mengira ia salinannya sendiri.
 */
function kolomRinciReklas(): KolomLembarReklas[] {
  return [
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 6.0, rata: 'kiri' },
    { key: 'jumlah', judul: 'Jumlah', nomor: 12, lebar: 2.6, rata: 'kanan' },
    { key: 'satuan', judul: 'Satuan', nomor: 13, lebar: 2.8, rata: 'tengah' },
    // ⚠️ SATU kolom nilai saja — keluarga IV.F tak punya "Harga Satuan" &
    // "Jumlah Total" seperti IV.B/IV.C/IV.D. Menambahkannya "biar seragam"
    // membuat lembarnya tak cocok waktu pemeriksa mencocokkan kolom per kolom.
    { key: 'nilai_perolehan', judul: 'Nilai Perolehan (Rp)', nomor: 14, lebar: 5.8, rata: 'kanan' },
    { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 15, lebar: 5.8, rata: 'kanan' },
    { key: 'nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 16, lebar: 5.8, rata: 'kanan' },
    // ── Blok lawan: identitas barang di sisi SEBERANG reklasifikasi ─────────
    // ⚠️ `lawan_kode` itu BLOK BERSEGMEN (7 sel), bukan kolom teks — lebarnya
    // dibagi rata di penyaji. Jangan diperlakukan seperti `asal_kode` di
    // keluarga perpindahan, yang memang satu sel teks.
    // ⚠️ `grup: 'lawan'` itu PENANDA, bukan judul: judul sebenarnya ikut cabang
    // (`grupLawan`) & dirakit penyaji. Menuliskan judulnya di sini berarti
    // pabrik ini harus tahu sedang membuat cabang yang mana.
    { key: 'lawan_kode', judul: 'Kode Barang', nomor: 17, grup: 'lawan', lebar: 13.0, rata: 'tengah' },
    { key: 'lawan_nama', judul: 'Nama Barang', nomor: 18, grup: 'lawan', lebar: 5.5, rata: 'kiri' },
    { key: 'penyebab', judul: 'Penyebab Reklasifikasi', nomor: 19, lebar: 6.0, rata: 'kiri' },
    // ⚠️ "Nama Dokumen" SENGAJA SELALU KOSONG — aplikasi ini tak menyimpan
    // JENIS/nama dokumen sumber reklasifikasi di mana pun (`jurnal_header`
    // cuma punya `no_sk`, `tanggal`, `keterangan`, & `payload.dokumen_paths`
    // yang isinya path berkas, bukan nama dokumen). Diisi tebakan — nama
    // berkas unggahan ("scan001.pdf") atau label alasan yang sudah tercetak
    // di kolom (19) — berarti menaruh keterangan yang bukan itu di lembar
    // bertanda tangan. Kolomnya tetap dicetak supaya lembarnya cocok
    // kolom-per-kolom saat diperiksa. Pola & alasan yang sama dgn
    // `sk_tanggal`/`sk_nomor` di IV.B.1.2 dan `dok_nama` di IV.A.
    { key: 'dok_nama', judul: 'Nama Dokumen', nomor: 20, grup: 'Dokumen Sumber', lebar: 5.0, rata: 'kiri' },
    { key: 'dok_nomor', judul: 'Nomor', nomor: 21, grup: 'Dokumen Sumber', lebar: 5.5, rata: 'kiri' },
    { key: 'dok_tanggal', judul: 'Tanggal', nomor: 22, grup: 'Dokumen Sumber', lebar: 4.2, rata: 'tengah' },
    { key: 'keterangan', judul: 'Keterangan', nomor: 23, lebar: 5.0, rata: 'kiri' },
  ]
}

const KOLOM_KIRI: KolomLembarReklas =
  { key: 'nibar', judul: 'NIBAR', nomor: 8, lebar: 8.0, rata: 'kiri' }
const KOLOM_NAMA: KolomLembarReklas =
  { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: 6.0, rata: 'kiri' }

/**
 * ⚠️ LEBAR: totalnya + `sisaLebar` = 100 PERSIS, dan itu yang membuat lembarnya
 * "fit to window" di `table-fixed`. Di sini ada DUA blok bersegmen (7 sel
 * masing-masing, 14 sel total) — jadi keduanya dianggarkan bersamaan:
 * `lawan_kode` ~13% dan sisanya (blok kode utama) juga ~13%, ≈1,86% per sel.
 * Itu sudah lebih lega daripada IV.B (1,46%/sel) yang terbukti terbaca.
 *
 * ⚠️ NIBAR tak bisa ikut dipepet: 45 digit, dipenggal dua baris di batas segmen
 * oleh `pecahNibar()`, dan potongan pertama 26 digit wajib muat SEBARIS — kalau
 * tidak ia membungkus sendiri lebih dulu & hasilnya tiga baris. Selnya karena
 * itu memakai font sendiri yang lebih kecil.
 *
 * ⚠️ **Penanda subtotal & kaki SAMA PERSIS di kedua cabang** — lembar aslinya
 * memang begitu, termasuk salah ketiknya: nama penanda tangan DAN NIP-nya
 * sama-sama (30). Diikuti apa adanya, seperti "(14) dua kali" di IV.A.2.2 &
 * "(36) dua kali" di IV.B.1.2. Jangan "dirapikan": lembar resmi dicocokkan
 * pemeriksa kolom per kolom, jadi merapikannya justru membuatnya tak cocok.
 */
export const FORMAT_REKLAS: Record<IdReklas, FormatReklas> = {
  penambahan: {
    kode: 'IV.F.2',
    awalan: 'IV.F',
    akhiranRinci: 2,
    akhiranRekap: [3, 4, 5, 6],
    arah: 'penambahan',
    judul: 'LAPORAN PENAMBAHAN AKIBAT REKLASIFIKASI BMD BERUPA',
    grupLawan: 'Reklasifikasi dari',
    kolomKiri: KOLOM_KIRI,
    kolomNama: KOLOM_NAMA,
    kolom: kolomRinciReklas(),
    subtotal: [24, 25, 26, 27],
    kaki: { tanggal: 28, jabatan: 29, nama: 30 },
  },

  // ── IV.F.12–F.16 — sisi PENGURANGAN ──────────────────────────────────────
  //
  // Ledger yang SAMA dengan penambahan, dibaca dari sisi sebaliknya: barangnya
  // dikelompokkan menurut kode ASAL, dan blok lawannya berisi kode TUJUAN.
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
    grupLawan: 'Reklasifikasi ke',
    kolomKiri: KOLOM_KIRI,
    kolomNama: KOLOM_NAMA,
    kolom: kolomRinciReklas(),
    subtotal: [24, 25, 26, 27],
    kaki: { tanggal: 28, jabatan: 29, nama: 30 },
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

/** Seluruh kolom lembar rinci, kiri→kanan (tanpa sel segmen blok kode tujuan). */
export function kolomLembarReklas(f: FormatReklas): KolomLembarReklas[] {
  return [f.kolomKiri, f.kolomNama, ...f.kolom]
}

/** Lebar blok "Kode Barang" tujuan (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodeReklas(f: FormatReklas): number {
  return sisaLebar(kolomLembarReklas(f))
}

/**
 * Judul lembar REKAP. `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya
 * (IV.F.3–F.6 semuanya REKAPITULASI).
 */
export function judulRekapReklas(f: FormatReklas): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
