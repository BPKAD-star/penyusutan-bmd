// ============================================================================
// Format lembar PENGHAPUSAN Permendagri 47/2021 — keluarga IV.K
//
//   IV.K.1.2–1.6  Penghapusan akibat PEMINDAHTANGANAN
//                 ← ledger `penghapusan_pemindahtanganan`
//                   (hibah · penjualan · tukar-menukar · penyertaan modal —
//                    keempatnya SATU lembar, dibedakan kolom "Cara
//                    Pemindahtanganan" dari `jurnal_header.sub_jenis`)
//   IV.K.2.2–2.6  Penghapusan karena PENYERAHAN / PENGALIHAN STATUS PENGGUNAAN
//                 ← ledger `pengalihan_status`, dibaca dari sisi `skpd_asal`
//   IV.K.6.2–6.6  Penghapusan akibat SEBAB LAIN
//                 ← ledger `penghapusan_sebab_lain`
//
// Tiap cabang: 1 lembar RINCI + 4 lembar REKAP (sub rincian objek → rincian
// objek → objek → jenis).
//
// ⚠️ **IV.K.2 dibaca dari sisi SKPD PEMBERI**, dan itu keputusan yang gampang
// terbalik. `pengalihan_status` di aplikasi ini BUKAN penghapusan — barangnya
// tetap milik pemda, cuma pindah SKPD. Permendagri memandangnya dari sudut SKPD
// yang MELEPAS: bagi dia barang itu hilang dari daftarnya. Jadi lembar ini
// menyaring `skpd_asal`, cerminan persis lembar IV.B.1.2 (Penerimaan
// Penggunaan) yang menyaring `skpd_tujuan` atas baris ledger yang SAMA.
// Menyaring sisi yang salah menghasilkan lembar berkop "PENGHAPUSAN" yang
// berisi barang yang justru baru DITERIMA — terisi penuh & tanpa satu pun error.
//
// ── Ketiganya berbeda HANYA di satu blok tengah ─────────────────────────────
//   K.1 : Lokasi · Cara Pemindahtanganan
//   K.2 : Tgl Perolehan · Cara Perolehan · Lokasi · Penerima Penyerahan
//   K.6 : Lokasi
// Selebihnya — NIBAR, blok kode, Nama Barang, kedua Spesifikasi, Jumlah,
// Satuan, Harga Satuan, Jumlah Total, Akumulasi, Nilai Buku, blok "Surat
// Keputusan Penghapusan", Keterangan — IDENTIK, begitu pula KELIMA lembar
// rekapnya. Karena itu satu registry + satu penyaji; menyalinnya per cabang
// berarti tiga tempat yang harus disunting tiap satu kolom bergeser, dan yang
// terlewat TIDAK menghasilkan error (CODING-STANDARD §1.2).
//
// ⚠️ MESIN SUBTOTALNYA dari lib/formatPermendagri.ts, dipakai bersama seluruh
// cabang Permendagri di aplikasi ini. Yang ada di sini cuma susunan kolomnya.
//
// ── Beda dari keluarga IV.B/IV.C/IV.D (perpindahan), jangan disamakan ───────
// 1. **Lembar rekapnya LIMA kolom**, bukan enam: TANPA "Jumlah Barang".
//    Kolomnya Kode · Nama · Jumlah (Rp) · Akumulasi · Nilai Buku, dan lembar
//    aslinya menuliskan rumusnya terang-terangan: `(12) = (10) - (11)`.
// 2. **Rekap mulai di 2 SEGMEN** (kelompok neraca `1.3` ASET TETAP) — di
//    keluarga perpindahan 3. Lihat `SEG_MIN_REKAP_PENGHAPUSAN`.
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — alasannya sama persis dengan
// yang tertulis di kepala lib/formatPermendagri.ts. Nomornya TIDAK dicetak.
// ============================================================================

/**
 * Kedalaman TERDANGKAL lembar rekap keluarga ini.
 *
 * ⚠️ **2, bukan 3.** Lembar IV.K.<n>.3 membuka dengan baris `x x` (kelompok
 * neraca), sementara keluarga perpindahan membuka di `x x x`. Memakai 3 di sini
 * MENGHILANGKAN baris yang ada di format aslinya, dan karena angkanya tetap
 * menjumlah dengan benar tak satu pun uji aritmetika akan menangkapnya — yang
 * berubah cuma bentuk lembar yang ditandatangani.
 */
export const SEG_MIN_REKAP_PENGHAPUSAN = 2

/**
 * Tangga lembar rekap `.3`–`.6`.
 *
 * ⚠️ Gambar yang diserahkan cuma `.3` ("MENURUT SUB RINCIAN OBJEK", 6 segmen);
 * sisanya kelanjutan tangga yang sama, sejalan dengan SELURUH keluarga lain di
 * aplikasi ini (IV.A, IV.B, IV.C, IV.D, IV.F semuanya [6,5,4,3] untuk `.3`–`.6`).
 */
export const TANGGA_REKAP_PENGHAPUSAN = [
  { akhiran: 3, seg: 6, menurut: 'SUB RINCIAN OBJEK' },
  { akhiran: 4, seg: 5, menurut: 'RINCIAN OBJEK' },
  { akhiran: 5, seg: 4, menurut: 'OBJEK' },
  { akhiran: 6, seg: 3, menurut: 'JENIS' },
] as const

// ── Kolom lembar rinci (keputusan user 2026-09-28) ──────────────────────────
//
// Sama seperti keluarga perpindahan & reklasifikasi, lembar RINCI ketiga cabang
// SENGAJA MENYIMPANG dari lembar asli Permendagri (7 sel segmen kode, blok
// "Surat Keputusan Penghapusan", dst.). User menyerahkan susunannya sendiri —
// SATU tabel datar, dikelompokkan per JENIS ASET yang ada di transaksinya,
// tiap kelompok ditutup "Total <jenis>", seluruhnya ditutup "TOTAL", nominal
// 2 desimal. Lembar REKAP (.3–.6) TIDAK berubah.
//
// ⚠️ Ketiga cabang berbeda HANYA di blok tengah (sesudah Nilai Buku):
//   K.1 Pemindahtanganan : Lokasi · Cara Pemindahtanganan
//   K.2 Pengalihan       : Tanggal Perolehan · Cara Perolehan · Lokasi · Pihak Penerima
//   K.6 Sebab Lain       : Lokasi · Sebab Penghapusan (isinya selalu "Sebab Lain")
// Itu DATA di registry, bukan cabang `if` di penyaji.

export type KolomPenghapusan =
  | 'nibar' | 'kode' | 'nama' | 'merek' | 'no_polisi'
  | 'jumlah' | 'harga_satuan' | 'nilai_perolehan' | 'akumulasi' | 'nilai_buku'
  | 'tgl_perolehan' | 'cara_perolehan' | 'lokasi'
  | 'cara_pemindahtanganan' | 'sebab' | 'penerima'
  | 'dok_nomor' | 'dok_tanggal' | 'keterangan'

export type KolomRinciPenghapusan = {
  key: KolomPenghapusan
  judul: string
  /** Persen lebar. Totalnya WAJIB 100 persis per cabang — dikunci test. */
  lebar: number
  rata: 'kiri' | 'kanan' | 'tengah'
}

/**
 * Kolom yang dijumlah di baris "Total <jenis>" & "TOTAL" — WAJIB berurutan.
 * ⚠️ Harga Satuan SENGAJA TIDAK (menjumlahkan harga satuan barang berbeda tak
 * berarti apa pun).
 */
export const KOLOM_DIJUMLAH_PENGHAPUSAN: readonly KolomPenghapusan[] = ['nilai_perolehan', 'akumulasi', 'nilai_buku']

/** Identitas cabang. Dipakai URL halaman cetak, kunci ingatan ttd, & filter menu. */
export type IdPenghapusan = 'pemindahtanganan' | 'pengalihan' | 'sebab_lain'

export type FormatPenghapusan = {
  /** Kode lembar RINCI. */
  kode: string
  /** Awalan tanpa akhiran — dipakai tangga rekap (`IV.K.1.3`…). */
  awalan: string
  /** Jenis ledger yang disaring. */
  jenis: string
  /**
   * Sisi SKPD yang disaring.
   *
   * `aset`  → lewat `aset.skpd_id` (baris penghapusan tak punya kolom SKPD)
   * `asal`  → lewat `skpd_asal` (khusus `pengalihan_status`; lihat kepala berkas)
   */
  scope: 'aset' | 'asal'
  /** Label pendek untuk tombol filter di menu. */
  label: string
  /** Baris 1 judul, tanpa isian "BERUPA…(1)" yang diisi jenis asetnya. */
  judul: string
  /** Baris 2 judul — sebab penghapusannya. */
  judulLanjut: string
  /** Kolom lembar RINCI, kiri→kanan. */
  kolom: KolomRinciPenghapusan[]
  /** Kalimat baris kosong. */
  kosong: string
}

/**
 * Sepuluh kolom pertama — IDENTIK di ketiga cabang. Fungsi (bukan konstanta
 * bersama) supaya ketiga entri registry tak berbagi OBJEK yang sama.
 *
 * ⚠️ NIBAR dapat jatah terbesar & huruf 9px sendiri di penyaji (permintaan user
 * 2026-09-27: "nibar jangan lupa diperhatikan ukurannya, proporsional pas"),
 * pola yang sama dgn keluarga perpindahan & reklasifikasi.
 */
function kolomAwal(l: {
  nibar: number; kode: number; nama: number; merek: number; nopol: number
  jumlah: number; harga: number; nilai: number; akum: number; nb: number
}): KolomRinciPenghapusan[] {
  return [
    { key: 'nibar', judul: 'NIBAR', lebar: l.nibar, rata: 'kiri' },
    { key: 'kode', judul: 'Kode Barang - Uraian Barang', lebar: l.kode, rata: 'kiri' },
    { key: 'nama', judul: 'Nama Barang', lebar: l.nama, rata: 'kiri' },
    { key: 'merek', judul: 'Merk/Tipe', lebar: l.merek, rata: 'kiri' },
    { key: 'no_polisi', judul: 'No Polisi', lebar: l.nopol, rata: 'kiri' },
    { key: 'jumlah', judul: 'Jumlah - Satuan', lebar: l.jumlah, rata: 'kiri' },
    { key: 'harga_satuan', judul: 'Harga Satuan', lebar: l.harga, rata: 'kanan' },
    { key: 'nilai_perolehan', judul: 'Nilai Perolehan', lebar: l.nilai, rata: 'kanan' },
    { key: 'akumulasi', judul: 'Akumulasi Penyusutan', lebar: l.akum, rata: 'kanan' },
    { key: 'nilai_buku', judul: 'Nilai Buku', lebar: l.nb, rata: 'kanan' },
  ]
}

/** Tiga kolom penutup — IDENTIK di ketiga cabang. SK-nya = kartu jurnal penghapusan. */
function kolomAkhir(l: { nomor: number; tanggal: number; ket: number }): KolomRinciPenghapusan[] {
  return [
    { key: 'dok_nomor', judul: 'Nomor Dokumen', lebar: l.nomor, rata: 'kiri' },
    { key: 'dok_tanggal', judul: 'Tanggal Dokumen', lebar: l.tanggal, rata: 'tengah' },
    { key: 'keterangan', judul: 'Keterangan', lebar: l.ket, rata: 'kiri' },
  ]
}

/** Lebar sepuluh kolom awal untuk cabang 15-kolom (K.1 & K.6). */
const AWAL_15 = { nibar: 11.5, kode: 8.5, nama: 8, merek: 5.5, nopol: 5, jumlah: 3.8, harga: 7, nilai: 7.5, akum: 7.2, nb: 7.5 }
const AKHIR_15 = { nomor: 5.5, tanggal: 4.8, ket: 5.7 }

export const FORMAT_PENGHAPUSAN: Record<IdPenghapusan, FormatPenghapusan> = {
  // ── IV.K.1 — Pemindahtanganan (15 kolom) ──────────────────────────────────
  pemindahtanganan: {
    kode: 'IV.K.1.2',
    awalan: 'IV.K.1',
    jenis: 'penghapusan_pemindahtanganan',
    scope: 'aset',
    label: 'Pemindahtanganan',
    judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
    judulLanjut: 'PENGHAPUSAN AKIBAT PEMINDAHTANGANAN BMD',
    kolom: [
      ...kolomAwal(AWAL_15),
      { key: 'lokasi', judul: 'Lokasi', lebar: 6.5, rata: 'kiri' },
      // ⚠️ Satu-satunya kolom yang membedakan hibah, penjualan, tukar-menukar,
      // & penyertaan modal — keempatnya lembar yang SAMA. Diisi
      // `jurnal_header.sub_jenis` lewat `SUBJENIS_LABEL` (lib/penghapusan.ts).
      { key: 'cara_pemindahtanganan', judul: 'Cara Pemindahtanganan', lebar: 6, rata: 'kiri' },
      ...kolomAkhir(AKHIR_15),
    ],
    kosong: 'Tidak ada penghapusan akibat pemindahtanganan pada periode ini.',
  },

  // ── IV.K.2 — Penyerahan / Pengalihan Status Penggunaan (17 kolom) ─────────
  pengalihan: {
    kode: 'IV.K.2.2',
    awalan: 'IV.K.2',
    jenis: 'pengalihan_status',
    // ⚠️ `asal`, BUKAN `aset`: lihat kepala berkas. Baris `pengalihan_status`
    // punya `skpd_asal`/`skpd_tujuan`, dan lembar ini milik yang MELEPAS.
    scope: 'asal',
    label: 'Pengalihan Status',
    judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
    judulLanjut: 'PENGHAPUSAN KARENA PENYERAHAN ATAU PENGALIHAN STATUS PENGGUNAAN BMD',
    kolom: [
      ...kolomAwal({ nibar: 11, kode: 7.5, nama: 7, merek: 4.5, nopol: 4.5, jumlah: 3.5, harga: 6.5, nilai: 7, akum: 6.8, nb: 7 }),
      // ⚠️ Tanggal Perolehan = kapan barang DIPEROLEH pemkab, BUKAN tanggal
      // pengalihannya (itu kolom Tanggal Dokumen).
      { key: 'tgl_perolehan', judul: 'Tanggal Perolehan', lebar: 4.6, rata: 'tengah' },
      { key: 'cara_perolehan', judul: 'Cara Perolehan', lebar: 4.8, rata: 'kiri' },
      { key: 'lokasi', judul: 'Lokasi', lebar: 5.2, rata: 'kiri' },
      // SKPD yang MENERIMA penyerahan — sisi seberang baris ledgernya.
      { key: 'penerima', judul: 'Pihak Penerima', lebar: 5.5, rata: 'kiri' },
      ...kolomAkhir({ nomor: 5, tanggal: 4.6, ket: 5 }),
    ],
    kosong: 'Tidak ada penghapusan karena pengalihan status penggunaan pada periode ini.',
  },

  // ── IV.K.6 — Sebab Lain (15 kolom) ────────────────────────────────────────
  //
  // ⚠️ Susunannya kembar K.1 (keputusan user 2026-09-28): kolom "Cara
  // Pemindahtanganan" diganti "Sebab Penghapusan" yang isinya SELALU "Sebab
  // Lain" — ledgernya memang tak punya sub-jenis untuk dibedakan.
  sebab_lain: {
    kode: 'IV.K.6.2',
    awalan: 'IV.K.6',
    jenis: 'penghapusan_sebab_lain',
    scope: 'aset',
    label: 'Sebab Lain',
    judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
    judulLanjut: 'PENGHAPUSAN AKIBAT SEBAB LAIN BMD',
    kolom: [
      ...kolomAwal(AWAL_15),
      { key: 'lokasi', judul: 'Lokasi', lebar: 6.5, rata: 'kiri' },
      { key: 'sebab', judul: 'Sebab Penghapusan', lebar: 6, rata: 'kiri' },
      ...kolomAkhir(AKHIR_15),
    ],
    kosong: 'Tidak ada penghapusan akibat sebab lain pada periode ini.',
  },
}

export const URUT_PENGHAPUSAN: IdPenghapusan[] = ['pemindahtanganan', 'pengalihan', 'sebab_lain']

/**
 * Judul lembar REKAP. `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya.
 *
 * ⚠️ Baris keduanya IKUT berubah: "PENGHAPUSAN AKIBAT PEMINDAHTANGANAN BMD" →
 * "…MENURUT SUB RINCIAN OBJEK" ditambahkan penyaji. Yang di sini cuma baris
 * pertamanya.
 */
export function judulRekapPenghapusan(f: FormatPenghapusan): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
