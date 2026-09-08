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

import { sisaLebar, type Kolom } from './formatPermendagri'

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

/** Banyaknya sel segmen kode di lembar rinci (kode penuh = 7 segmen). */
export const SEL_KODE_PENGHAPUSAN = 7

/**
 * Tangga lembar rekap `.3`–`.6`.
 *
 * ⚠️ Gambar yang diserahkan cuma `.3` ("MENURUT SUB RINCIAN OBJEK", 6 segmen);
 * sisanya kelanjutan tangga yang sama, sejalan dengan SELURUH keluarga lain di
 * aplikasi ini (IV.A, IV.B, IV.C, IV.D, IV.F semuanya [6,5,4,3] untuk `.3`–`.6`).
 * Kalau ternyata lampirannya berbeda, yang diubah cukup tabel ini.
 */
export const TANGGA_REKAP_PENGHAPUSAN = [
  { akhiran: 3, seg: 6, menurut: 'SUB RINCIAN OBJEK' },
  { akhiran: 4, seg: 5, menurut: 'RINCIAN OBJEK' },
  { akhiran: 5, seg: 4, menurut: 'OBJEK' },
  { akhiran: 6, seg: 3, menurut: 'JENIS' },
] as const

// ── Kolom ───────────────────────────────────────────────────────────────────

export type KolomPenghapusan =
  | 'nibar'
  | 'nama' | 'spek_nama' | 'spek_lain'
  | 'jumlah' | 'satuan' | 'harga_satuan' | 'jumlah_total'
  | 'akumulasi' | 'nilai_buku'
  | 'tgl_perolehan' | 'cara_perolehan' | 'lokasi'
  | 'cara_pemindahtanganan' | 'penerima'
  | 'sk_tanggal' | 'sk_nomor'
  | 'keterangan'

export type KolomLembarPenghapusan = Kolom<KolomPenghapusan>

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
  /** Kolom PALING KIRI, di luar blok "Penggolongan dan Kodefikasi Barang". */
  kolomKiri: KolomLembarPenghapusan
  /** Kolom yang duduk DI DALAM blok Penggolongan, sesudah sel-sel kode. */
  kolomNama: KolomLembarPenghapusan
  /** Sisa kolom, kiri→kanan sesudah blok Penggolongan. */
  kolom: KolomLembarPenghapusan[]
  /** Penanda subtotal sejajar `SEG_SUBTOTAL` = [6seg, 5seg, 4seg, 3seg]. */
  subtotal: readonly [number, number, number, number]
  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/**
 * Kolom yang IDENTIK di ketiga cabang, sebelum blok khasnya.
 *
 * ⚠️ Fungsi, bukan konstanta bersama, supaya ketiga entri registry tak berbagi
 * OBJEK yang sama — daftar yang dipakai bersama gampang tersunting di tempat
 * oleh pemakai yang mengira ia salinannya sendiri.
 *
 * ⚠️ LEBAR: totalnya + `sisaLebar` = 100 PERSIS, dan itu yang membuat lembarnya
 * "fit to window" di `table-fixed`. Permintaan user 2026-09-07 ("cukup rapi dan
 * fit to window pada setiap kolom, jangan boros ke sampingnya") — jadi kolom
 * ber-isi PENDEK & SERAGAM dipepet habis (jumlah, satuan, kedua tanggal) dan
 * kelegaannya dialihkan ke kolom teks panjang, yang merekalah penentu TINGGI
 * baris. Pelajaran yang sama dgn lembar IV.F.
 *
 * ⚠️ Lebarnya BEDA per cabang & memang harus begitu: K.6 punya 3 kolom lebih
 * sedikit dari K.1 dan 5 lebih sedikit dari K.2, jadi ruang yang terbebas
 * dibagikan ke kolom teks. Menyamakannya berarti cabang yang lebih ramping
 * mencetak jauh lebih sempit dari yang perlu.
 */
function kolomAwal(lebar: {
  nama: number; spekNama: number; spekLain: number; uang: number
}): { kiri: KolomLembarPenghapusan; nama: KolomLembarPenghapusan; awal: KolomLembarPenghapusan[] } {
  return {
    // ⚠️ NIBAR tak bisa dipepet: 45 digit, dipenggal dua baris di batas segmen
    // oleh `pecahNibar()`, dan potongan pertama 26 digit wajib muat SEBARIS.
    kiri: { key: 'nibar', judul: 'NIBAR', nomor: 8, lebar: 7.6, rata: 'kiri' },
    nama: { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: lebar.nama, rata: 'kiri' },
    awal: [
      { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: lebar.spekNama, rata: 'kiri' },
      { key: 'spek_lain', judul: 'Spesifikasi Lainnya', nomor: 12, lebar: lebar.spekLain, rata: 'kiri' },
      { key: 'jumlah', judul: 'Jumlah Barang', nomor: 13, lebar: 2.4, rata: 'kanan' },
      { key: 'satuan', judul: 'Satuan Barang', nomor: 14, lebar: 2.8, rata: 'tengah' },
      { key: 'harga_satuan', judul: 'Harga Satuan (Rp)', nomor: 15, lebar: lebar.uang, rata: 'kanan' },
      { key: 'jumlah_total', judul: 'Jumlah Total', nomor: 16, lebar: lebar.uang, rata: 'kanan', rumus: '(16) = (13)x(15)' },
      { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)*', nomor: 17, lebar: lebar.uang, rata: 'kanan' },
      { key: 'nilai_buku', judul: 'Nilai Buku (Rp)*', nomor: 18, lebar: lebar.uang, rata: 'kanan', rumus: '(18) = (16)-(17)' },
    ],
  }
}

/**
 * Blok penutup yang IDENTIK di ketiga cabang: SK Penghapusan + Keterangan.
 *
 * ⚠️ Berbeda dari `sk_tanggal`/`sk_nomor` di lembar IV.B.1.2 yang SELALU
 * KOSONG — di keluarga IV.K kolom ini justru punya isinya: `jurnal_header`
 * kartu penghapusannya sendiri (`no_sk` & `tanggal`). Jangan ikut dikosongkan
 * "biar seragam dgn IV.B".
 */
function kolomAkhir(n: number, lebar: { tanggal: number; nomor: number; ket: number }): KolomLembarPenghapusan[] {
  return [
    { key: 'sk_tanggal', judul: 'Tanggal', nomor: n, grup: 'Surat Keputusan Penghapusan', lebar: lebar.tanggal, rata: 'tengah' },
    { key: 'sk_nomor', judul: 'Nomor', nomor: n + 1, grup: 'Surat Keputusan Penghapusan', lebar: lebar.nomor, rata: 'kiri' },
    { key: 'keterangan', judul: 'Keterangan', nomor: n + 2, lebar: lebar.ket, rata: 'kiri' },
  ]
}

export const FORMAT_PENGHAPUSAN: Record<IdPenghapusan, FormatPenghapusan> = {
  // ── IV.K.1 — Pemindahtanganan (22 sel: 1 + 7 kode + 1 + 13) ───────────────
  pemindahtanganan: (() => {
    const a = kolomAwal({ nama: 9.6, spekNama: 8.4, spekLain: 5.6, uang: 5.4 })
    return {
      kode: 'IV.K.1.2',
      awalan: 'IV.K.1',
      jenis: 'penghapusan_pemindahtanganan',
      scope: 'aset' as const,
      label: 'Pemindahtanganan',
      judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
      judulLanjut: 'PENGHAPUSAN AKIBAT PEMINDAHTANGANAN BMD',
      kolomKiri: a.kiri,
      kolomNama: a.nama,
      kolom: [
        ...a.awal,
        { key: 'lokasi', judul: 'Lokasi', nomor: 19, lebar: 7.6, rata: 'kiri' },
        // ⚠️ Satu-satunya kolom yang membedakan hibah, penjualan,
        // tukar-menukar, & penyertaan modal di lembar ini — keempatnya memakai
        // lembar yang SAMA. Diisi `jurnal_header.sub_jenis` lewat
        // `SUBJENIS_LABEL` (lib/penghapusan.ts).
        { key: 'cara_pemindahtanganan', judul: 'Cara Pemindahtanganan', nomor: 20, lebar: 7.4, rata: 'kiri' },
        ...kolomAkhir(21, { tanggal: 4.2, nomor: 5.4, ket: 6.8 }),
      ],
      subtotal: [24, 25, 26, 27] as const,
      // ⚠️ Lembar aslinya menomori nama penanda tangan DAN NIP-nya sama-sama
      // (30). Salah ketik di sumbernya, diikuti apa adanya — sama seperti
      // "(14) dua kali" di IV.A.2.2 & "(36) dua kali" di IV.B.1.2.
      kaki: { tanggal: 28, jabatan: 29, nama: 30 },
    }
  })(),

  // ── IV.K.2 — Penyerahan / Pengalihan Status Penggunaan (25 sel) ───────────
  //
  // ⚠️ Cabang TERLEBAR: empat kolom lebih banyak dari K.1. Karena itu lebar
  // kolom teksnya paling ketat — bukan kelalaian, memang tak ada ruangnya.
  pengalihan: (() => {
    const a = kolomAwal({ nama: 8.0, spekNama: 7.0, spekLain: 4.8, uang: 5.2 })
    return {
      kode: 'IV.K.2.2',
      awalan: 'IV.K.2',
      jenis: 'pengalihan_status',
      // ⚠️ `asal`, BUKAN `aset`: lihat kepala berkas. Baris `pengalihan_status`
      // punya `skpd_asal`/`skpd_tujuan`, dan lembar ini milik yang MELEPAS.
      scope: 'asal' as const,
      label: 'Pengalihan Status',
      judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
      judulLanjut: 'PENGHAPUSAN KARENA PENYERAHAN ATAU PENGALIHAN STATUS PENGGUNAAN BMD',
      kolomKiri: a.kiri,
      kolomNama: a.nama,
      kolom: [
        ...a.awal,
        { key: 'tgl_perolehan', judul: 'Tanggal/Bulan/Tahun Perolehan', nomor: 19, lebar: 4.1, rata: 'tengah' },
        { key: 'cara_perolehan', judul: 'Cara Perolehan', nomor: 20, lebar: 5.0, rata: 'kiri' },
        { key: 'lokasi', judul: 'Lokasi', nomor: 21, lebar: 6.5, rata: 'kiri' },
        // SKPD yang MENERIMA penyerahan — sisi seberang baris ledgernya.
        { key: 'penerima', judul: 'Penerima Penyerahan', nomor: 22, lebar: 6.4, rata: 'kiri' },
        ...kolomAkhir(23, { tanggal: 4.2, nomor: 4.6, ket: 5.6 }),
      ],
      subtotal: [26, 27, 28, 29] as const,
      kaki: { tanggal: 30, jabatan: 31, nama: 32 },
    }
  })(),

  // ── IV.K.6 — Sebab Lain (20 sel: paling ramping) ──────────────────────────
  sebab_lain: (() => {
    const a = kolomAwal({ nama: 10.6, spekNama: 9.4, spekLain: 6.6, uang: 5.8 })
    return {
      kode: 'IV.K.6.2',
      awalan: 'IV.K.6',
      jenis: 'penghapusan_sebab_lain',
      scope: 'aset' as const,
      label: 'Sebab Lain',
      judul: 'LAPORAN PENGHAPUSAN BMD BERUPA',
      judulLanjut: 'PENGHAPUSAN AKIBAT SEBAB LAIN BMD',
      kolomKiri: a.kiri,
      kolomNama: a.nama,
      kolom: [
        ...a.awal,
        { key: 'lokasi', judul: 'Lokasi', nomor: 19, lebar: 8.8, rata: 'kiri' },
        ...kolomAkhir(20, { tanggal: 4.4, nomor: 6.0, ket: 7.6 }),
      ],
      subtotal: [23, 24, 25, 26] as const,
      kaki: { tanggal: 27, jabatan: 28, nama: 29 },
    }
  })(),
}

export const URUT_PENGHAPUSAN: IdPenghapusan[] = ['pemindahtanganan', 'pengalihan', 'sebab_lain']

/** Seluruh kolom lembar rinci, kiri→kanan (tanpa sel segmen kode). */
export function kolomLembarPenghapusan(f: FormatPenghapusan): KolomLembarPenghapusan[] {
  return [f.kolomKiri, f.kolomNama, ...f.kolom]
}

/** Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodePenghapusan(f: FormatPenghapusan): number {
  return sisaLebar(kolomLembarPenghapusan(f))
}

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
