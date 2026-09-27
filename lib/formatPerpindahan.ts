// ============================================================================
// Format lembar PERPINDAHAN BARANG Permendagri 47/2021 — IV.B.1, IV.C, IV.D
//
//   IV.B.1.2–1.6  PENERIMAAN Penggunaan (pengalihan/penyerahan status)
//                 ← ledger `pengalihan_status`, antar SKPD          · arah MASUK
//   IV.C.2–C.6    PENERIMAAN BMD Internal Pengguna Barang
//                 ← ledger `mutasi_internal`, antar sub-unit        · arah MASUK
//   IV.D.2–D.6    PENGELUARAN BMD Internal Pengguna Barang
//                 ← ledger `mutasi_internal`, sisi sebaliknya       · arah KELUAR
//
// Tiap cabang: 1 lembar RINCI + 4 lembar REKAP (sub rincian objek → rincian
// objek → objek → jenis).
//
// ⚠️ IV.D.7 (rekap GABUNGAN pengeluaran + penerimaan) BUKAN bagian keluarga ini
// — bentuknya datar & bernomor dengan dua blok cermin. Ia punya registry &
// penyajinya sendiri (lib/formatGabunganInternal.ts).
//
// ── LEMBAR RINCI: SUSUNAN KOLOM KEPUTUSAN USER (2026-09-27) ─────────────────
// Lembar rinci ketiga cabang SENGAJA MENYIMPANG dari lembar asli Permendagri
// (yang punya 7 sel segmen kode, blok "Asal Barang", "Surat Keputusan
// Penghapusan", dst.). User menyerahkan susunan isiannya sendiri — SATU tabel
// datar, dikelompokkan per JENIS ASET (kode 3 segmen, mis. `1.3.2 Peralatan dan
// Mesin`) yang BENAR-BENAR ADA di transaksinya, tiap kelompok ditutup baris
// "Total <jenis>", dan seluruhnya ditutup baris "TOTAL". Nominal 2 angka di
// belakang koma.
//
// ⚠️ KETIGA CABANG BERKOLOM IDENTIK kecuali SATU: kolom pihak lawan.
// Penerimaan (IV.B.1 & IV.C) mencetak "Pihak yang menyerahkan" (`skpd_asal`),
// Pengeluaran (IV.D) mencetak "Tujuan SKPD" (`skpd_tujuan`). Itu DATA di
// registry (`kolomPihak`), bukan cabang `if` di penyaji.
//
// ⚠️ LEMBAR REKAP (.3–.6) TIDAK berubah — tetap bentuk Permendagri (kode
// bersegmen, mulai 3 segmen, 6 kolom). Mesin subtotalnya dari
// lib/formatPermendagri.ts, dipakai juga oleh baris "Total <jenis>" di lembar
// rinci, jadi keduanya mustahil menjumlah berbeda.
// ============================================================================

/**
 * Kedalaman TERDANGKAL lembar rekap keluarga ini.
 *
 * ⚠️ **3, bukan 2.** Lembar IV.B.1.3–1.6 & IV.C.3–C.6 membuka dengan baris
 * `x x x` — tak ada baris kelompok neraca (`1.3` ASET TETAP) seperti IV.A.
 * Memakai 2 di sini menambahkan baris yang TIDAK ADA di format aslinya, dan
 * karena angkanya tetap menjumlah dengan benar, tak satu pun uji aritmetika
 * akan menangkapnya. Kedalaman yang SAMA dipakai kelompok "jenis aset" lembar
 * rinci.
 */
export const SEG_MIN_REKAP_PERPINDAHAN = 3

// ── Kolom lembar rinci ──────────────────────────────────────────────────────

export type KolomPerpindahan =
  | 'nibar' | 'kode' | 'nama' | 'merek'
  | 'jumlah' | 'harga_satuan' | 'jumlah_total' | 'akumulasi' | 'nilai_buku'
  | 'tgl_perolehan' | 'cara_perolehan' | 'alamat'
  | 'pihak' | 'dok_nomor' | 'tgl_bast' | 'keterangan'

export type KolomRinci = {
  key: KolomPerpindahan
  judul: string
  /** Persen lebar. Totalnya WAJIB 100 persis — dikunci test. */
  lebar: number
  rata: 'kiri' | 'kanan' | 'tengah'
}

/**
 * Kolom lembar rinci, kiri→kanan, dipakai KETIGA cabang.
 *
 * ⚠️ Judul kolom `pihak` di sini cuma penampung — yang dicetak
 * `f.kolomPihak.judul` milik cabangnya. Kalau judul ini yang tercetak, lembar
 * Pengeluaran menyebut "Pihak yang menyerahkan" padahal isinya SKPD tujuan.
 *
 * ⚠️ LEBAR: totalnya 100 PERSIS (`table-fixed`, "fit to window"). NIBAR tak
 * boleh dipersempit — 45 digit dipenggal DUA baris di batas segmen oleh
 * `pecahNibar()`, dan potongan pertama 26 digit wajib muat sebaris.
 */
export const KOLOM_RINCI_PERPINDAHAN: readonly KolomRinci[] = [
  { key: 'nibar', judul: 'NIBAR', lebar: 9.5, rata: 'kiri' },
  { key: 'kode', judul: 'Kode Barang - Uraian Barang', lebar: 8, rata: 'kiri' },
  { key: 'nama', judul: 'Nama Barang', lebar: 7, rata: 'kiri' },
  { key: 'merek', judul: 'Merk/Tipe', lebar: 6.5, rata: 'kiri' },
  { key: 'jumlah', judul: 'Jumlah - Satuan', lebar: 4, rata: 'kiri' },
  { key: 'harga_satuan', judul: 'Harga Satuan', lebar: 6.5, rata: 'kanan' },
  { key: 'jumlah_total', judul: 'Jumlah total', lebar: 6.5, rata: 'kanan' },
  { key: 'akumulasi', judul: 'Akumulasi Penyusutan', lebar: 6.5, rata: 'kanan' },
  { key: 'nilai_buku', judul: 'Nilai Buku', lebar: 6.5, rata: 'kanan' },
  { key: 'tgl_perolehan', judul: 'Tanggal Perolehan', lebar: 4.5, rata: 'tengah' },
  { key: 'cara_perolehan', judul: 'Cara Perolehan', lebar: 5.5, rata: 'kiri' },
  { key: 'alamat', judul: 'Alamat', lebar: 6.5, rata: 'kiri' },
  { key: 'pihak', judul: '(pihak lawan — lihat kolomPihak)', lebar: 6.5, rata: 'kiri' },
  { key: 'dok_nomor', judul: 'Nomor Dokumen', lebar: 6.5, rata: 'kiri' },
  { key: 'tgl_bast', judul: 'Tanggal BAST', lebar: 4.5, rata: 'tengah' },
  { key: 'keterangan', judul: 'Keterangan', lebar: 5, rata: 'kiri' },
]

/**
 * Kolom yang dijumlah di baris "Total <jenis>" & "TOTAL".
 *
 * ⚠️ Harga Satuan SENGAJA TIDAK — menjumlahkan harga satuan barang yang
 * berbeda menghasilkan angka tak berarti, dan begitu tercetak ia dikutip orang.
 */
export const KOLOM_DIJUMLAH_PERPINDAHAN: readonly KolomPerpindahan[] = ['jumlah_total', 'akumulasi', 'nilai_buku']

/** Identitas cabang. Dipakai URL halaman cetak & kunci ingatan penanda tangan. */
export type IdPerpindahan = 'penggunaan' | 'internal' | 'pengeluaran'

/**
 * Sisi mana yang didaftar lembar ini.
 *
 * ⚠️ INI YANG MEMBEDAKAN IV.C DARI IV.D, bukan jenis ledgernya — keduanya
 * membaca `mutasi_internal` yang PERSIS SAMA. Tanpa `arah`, dua lembar itu akan
 * memuat baris yang identik & sama-sama mengaku benar. `masuk` menyaring
 * `skpd_tujuan`, `keluar` menyaring `skpd_asal`.
 */
export type ArahLembar = 'masuk' | 'keluar'

export type FormatPerpindahan = {
  /** Kode lembar RINCI. */
  kode: string
  /** Awalan tanpa akhiran — dipakai tangga rekap (`IV.B.1.3`…). */
  awalan: string
  /** Jenis ledger yang disaring. */
  jenis: string
  /**
   * Sisi yang didaftar. ⚠️ Bersama `jenis` ia membentuk identitas lembar:
   * `mutasi_internal` dipakai DUA cabang yang cuma beda arah.
   */
  arah: ArahLembar
  /** Baris 1 judul, tanpa isian "BERUPA…" yang diisi jenis asetnya. */
  judul: string
  /** Baris 2 judul, kalau formatnya punya (IV.B.1.x saja). */
  judulLanjut?: string
  /**
   * Kolom pihak lawan di lembar rinci — satu-satunya kolom yang beda antar
   * cabang. `sisi` = SKPD mana yang dicetak: `asal` (yang menyerahkan) untuk
   * lembar PENERIMAAN, `tujuan` untuk lembar PENGELUARAN.
   * ⚠️ Kalau `sisi` tertukar, lembar Penerimaan mencetak SKPD itu SENDIRI
   * sbg "pihak yang menyerahkan" — terisi penuh, tanpa satu pun error.
   */
  kolomPihak: { judul: string; sisi: 'asal' | 'tujuan' }
  /** Kalimat baris kosong ("Tidak ada penerimaan pada periode ini."). */
  kosong: string
}

export const FORMAT_PERPINDAHAN: Record<IdPerpindahan, FormatPerpindahan> = {
  // ── IV.B.1 — Penerimaan Penggunaan (pengalihan status antar SKPD) ─────────
  penggunaan: {
    kode: 'IV.B.1.2',
    awalan: 'IV.B.1',
    jenis: 'pengalihan_status',
    arah: 'masuk',
    judul: 'LAPORAN PENERIMAAN PENGGUNAAN BERUPA',
    judulLanjut: 'DALAM BENTUK PENGGUNAAN PENGALIHAN ATAU PENYERAHAN STATUS PENGGUNAAN BMD',
    kolomPihak: { judul: 'Pihak yang menyerahkan', sisi: 'asal' },
    kosong: 'Tidak ada penerimaan pada periode ini.',
  },

  // ── IV.C — Penerimaan BMD Internal Pengguna Barang (mutasi internal) ───────
  internal: {
    kode: 'IV.C.2',
    awalan: 'IV.C',
    jenis: 'mutasi_internal',
    arah: 'masuk',
    judul: 'LAPORAN PENERIMAAN BMD INTERNAL PENGGUNA BARANG BERUPA',
    kolomPihak: { judul: 'Pihak yang menyerahkan', sisi: 'asal' },
    kosong: 'Tidak ada penerimaan pada periode ini.',
  },

  // ── IV.D — Pengeluaran BMD Internal Pengguna Barang ───────────────────────
  // Ledger yang SAMA dengan IV.C (`mutasi_internal`), dibaca dari sisi
  // sebaliknya — jadi pihak lawannya SKPD TUJUAN.
  pengeluaran: {
    kode: 'IV.D.2',
    awalan: 'IV.D',
    jenis: 'mutasi_internal',
    arah: 'keluar',
    judul: 'LAPORAN PENGELUARAN BMD INTERNAL PENGGUNA BARANG BERUPA',
    kolomPihak: { judul: 'Tujuan SKPD', sisi: 'tujuan' },
    kosong: 'Tidak ada pengeluaran pada periode ini.',
  },
}

/**
 * Cabang yang JUGA menerbitkan rekap GABUNGAN IV.D.7.
 *
 * ⚠️ SATU RUMAH, bukan dua (keputusan 2026-08-31). IV.D.7 melayani kedua arah
 * mutasi internal, jadi godaannya menaruhnya di menu Penerimaan DAN Pengeluaran.
 * Yang dipilih menu **Pengeluaran**, dua alasannya:
 *
 *   1. **Nomornya milik keluarga IV.D.** Lembar resmi dicari orang lewat
 *      nomornya, dan IV.D.7 duduk tepat sesudah IV.D.2–D.6.
 *   2. Dua pintu untuk satu lembar berarti satu di antaranya cepat atau lambat
 *      menyimpang — pola yang sudah memakan korban di modul RKBMD ("dua pintu
 *      untuk satu keputusan"). Menu Penerimaan Internal cukup diberi PENUNJUK
 *      ke sini, bukan salinan tombolnya.
 */
export const CABANG_GABUNGAN: IdPerpindahan = 'pengeluaran'

/**
 * Judul lembar REKAP.
 *
 * `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya. ⚠️ Beda dari cabang
 * IV.A yang lembar `.7`-nya justru tetap berjudul LAPORAN; di keluarga ini
 * keempatnya REKAPITULASI, jadi tak ada pengecualian yang perlu diingat.
 */
export function judulRekapPerpindahan(f: FormatPerpindahan): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
