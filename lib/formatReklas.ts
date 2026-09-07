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
 * Tangga lembar rekap IV.F.3–F.6.
 *
 * ⚠️ **`segMin` BEDA PER LEMBAR, dan itu mengikuti gambar formatnya — bukan
 * kelalaian.** Di lampiran Permendagri, IV.F.3 & IV.F.4 membuka dengan baris
 * `x x x` (3 segmen = JENIS), sementara IV.F.5 & IV.F.6 membuka dengan `x x`
 * (2 segmen = kelompok neraca, mis. `1.3` ASET TETAP). Keluarga lain memang
 * seragam — IV.A semuanya 2, IV.B/IV.C/IV.D semuanya 3 — jadi godaan
 * "menyeragamkan" di sini besar sekali. Jangan: angkanya tetap menjumlah
 * dengan benar entah baris teratasnya ada atau tidak, sehingga tak satu pun uji
 * aritmetika akan menangkap perubahannya; yang berubah cuma BENTUK lembar yang
 * ditandatangani, dan itu baru ketahuan sesudah dicetak.
 *
 * ⚠️ Urutannya BUKAN kebetulan: `.3` paling dalam, `.6` paling dangkal.
 */
export const TANGGA_REKAP_REKLAS = [
  { akhiran: 3, seg: 6, segMin: 3, menurut: 'SUB RINCIAN OBJEK' },
  { akhiran: 4, seg: 5, segMin: 3, menurut: 'RINCIAN OBJEK' },
  { akhiran: 5, seg: 4, segMin: 2, menurut: 'OBJEK' },
  { akhiran: 6, seg: 3, segMin: 2, menurut: 'JENIS' },
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
export type IdReklas = 'penambahan'

/**
 * Sisi yang didaftar lembar ini.
 *
 * `penambahan` → dikelompokkan menurut `payload.kode_baru`; blok lawan berisi
 *                kode ASAL ("Reklasifikasi dari").
 * `pengurangan` → kebalikannya (belum dibangun — lihat kepala berkas).
 */
export type ArahReklas = 'penambahan' | 'pengurangan'

export type FormatReklas = {
  /** Kode lembar RINCI. */
  kode: string
  /** Awalan tanpa akhiran — dipakai tangga rekap (`IV.F.3`…). */
  awalan: string
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
export const FORMAT_REKLAS: Record<IdReklas, FormatReklas> = {
  penambahan: {
    kode: 'IV.F.2',
    awalan: 'IV.F',
    arah: 'penambahan',
    judul: 'LAPORAN PENAMBAHAN AKIBAT REKLASIFIKASI BMD BERUPA',
    grupLawan: 'Reklasifikasi dari',

    kolomKiri: { key: 'nibar', judul: 'NIBAR', nomor: 8, lebar: 8.0, rata: 'kiri' },
    kolomNama: { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: 6.0, rata: 'kiri' },

    kolom: [
      { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 6.0, rata: 'kiri' },
      { key: 'jumlah', judul: 'Jumlah', nomor: 12, lebar: 2.6, rata: 'kanan' },
      { key: 'satuan', judul: 'Satuan', nomor: 13, lebar: 2.8, rata: 'tengah' },
      // ⚠️ SATU kolom nilai saja — keluarga IV.F tak punya "Harga Satuan" &
      // "Jumlah Total" seperti IV.B/IV.C/IV.D. Menambahkannya "biar seragam"
      // membuat lembarnya tak cocok waktu pemeriksa mencocokkan kolom per kolom.
      { key: 'nilai_perolehan', judul: 'Nilai Perolehan (Rp)', nomor: 14, lebar: 5.8, rata: 'kanan' },
      { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 15, lebar: 5.8, rata: 'kanan' },
      { key: 'nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 16, lebar: 5.8, rata: 'kanan' },
      // ── Blok lawan: identitas barang SEBELUM reklas ────────────────────────
      // ⚠️ `lawan_kode` itu BLOK BERSEGMEN (7 sel), bukan kolom teks — lebarnya
      // dibagi rata di penyaji. Jangan diperlakukan seperti `asal_kode` di
      // keluarga perpindahan, yang memang satu sel teks.
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
    ],

    subtotal: [24, 25, 26, 27],
    // ⚠️ Lembar aslinya menomori nama penanda tangan DAN NIP-nya sama-sama (30).
    // Salah ketik di sumbernya, diikuti apa adanya — sama seperti "(14) dua
    // kali" di IV.A.2.2 & "(36) dua kali" di IV.B.1.2.
    kaki: { tanggal: 28, jabatan: 29, nama: 30 },
  },
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
