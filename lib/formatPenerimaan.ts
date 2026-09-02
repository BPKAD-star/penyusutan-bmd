// ============================================================================
// Format lembar PENERIMAAN Permendagri 47/2021 — cabang IV.B.1 & IV.C
//
//   IV.B.1.2–1.6  Penerimaan PENGGUNAAN (pengalihan/penyerahan status)
//                 ← ledger `pengalihan_status`, antar SKPD
//   IV.C.2–C.6    Penerimaan BMD INTERNAL Pengguna Barang
//                 ← ledger `mutasi_internal`, antar sub-unit dalam satu SKPD
//
// Tiap cabang: 1 lembar RINCI + 4 lembar REKAP (sub rincian objek → rincian
// objek → objek → jenis).
//
// ⚠️ SATU BERKAS UNTUK DUA CABANG, dan itu keputusan sadar (2026-08-31).
// Keduanya identik di 18 dari 21 kolom, identik di SELURUH lembar rekapnya, dan
// identik di kop maupun kaki. Yang berbeda cuma: (a) IV.B punya kolom Lokasi &
// blok "Surat Keputusan Penghapusan" yang tak ada di IV.C; (b) penomoran
// kolomnya bergeser 1 karena kop IV.B menyatukan sebutan pejabat & nama SKPD
// jadi SATU isian sementara IV.C memisahkannya; (c) IV.B punya baris judul
// kedua. Menyalin registry & penyajinya berarti dua tempat yang harus disunting
// tiap satu kolom bergeser — dan yang terlewat TIDAK menghasilkan error, ia
// cuma mencetak lembar yang beda susunan (CODING-STANDARD §1.2: urutan kolom
// laporan itu aturan integritas, ekstrak sejak kemunculan KEDUA).
//
// ⚠️ MESIN SUBTOTALNYA dari lib/formatPermendagri.ts — dipakai bersama cabang
// IV.A juga. Yang ada di sini cuma susunan kolomnya. Menulis mesin subtotal
// kedua berarti lembar rinci & keempat rekapnya — yang terbit dalam SATU berkas
// bertanda tangan — bisa menjumlah ke angka berbeda tanpa satu pun yang
// berteriak.
//
// ── Beda dari cabang IV.A (Perolehan), jangan disamakan ─────────────────────
// 1. **NIBAR berdiri DI LUAR blok kode & jadi kolom paling kiri.** Di IV.A ia
//    kolom (12) di tengah. Karena itu keluarga ini punya penyajinya sendiri.
// 2. **Ada Akumulasi Penyusutan & Nilai Buku** — IV.A tak punya sama sekali.
//    Keduanya ikut dijumlah di baris subtotal; itu sebabnya `ItemLaporan` di
//    lib/formatPermendagri.ts membawa `akumulasi`/`nilaiBuku` opsional.
// 3. **Lembar REKAP-nya 6 kolom** (Kode · Nama · Jumlah Barang · Jumlah Rp ·
//    Akumulasi · Nilai Buku), bukan 4.
// 4. **Rekap mulai di 3 SEGMEN**, bukan 2 — tak ada baris kelompok neraca
//    (`1.3 ASET TETAP`) di paling atas. Lihat `SEG_MIN_REKAP_PENERIMAAN`.
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — alasan & aturannya sama persis
// dengan yang tertulis di kepala lib/formatPermendagri.ts. Nomornya TIDAK
// dicetak di lembar (keputusan user 2026-08-30); yang tersisa dua gunanya:
// tautan balik ke lembar asli, dan penjaga struktur kolom lewat test.
// ============================================================================

import { sisaLebar, type Kolom } from './formatPermendagri'

/**
 * Kedalaman TERDANGKAL lembar rekap keluarga ini.
 *
 * ⚠️ **3, bukan 2.** Lembar IV.B.1.3–1.6 & IV.C.3–C.6 membuka dengan baris
 * `x x x` — tak ada baris kelompok neraca (`x. x.` = `1.3` ASET TETAP) seperti
 * IV.A. Memakai 2 di sini menambahkan baris yang TIDAK ADA di format aslinya,
 * dan karena angkanya tetap menjumlah dengan benar, tak satu pun uji aritmetika
 * akan menangkapnya — yang keliru cuma bentuk lembar yang ditandatangani.
 */
export const SEG_MIN_REKAP_PENERIMAAN = 3

/** Banyaknya sel segmen kode di lembar rinci (kode penuh = 7 segmen). */
export const SEL_KODE_PENERIMAAN = 7

// ── Kolom ───────────────────────────────────────────────────────────────────

export type KolomPenerimaan =
  | 'nibar'
  | 'nama' | 'spek_nama' | 'spek_lain'
  | 'jumlah' | 'satuan' | 'harga_satuan' | 'jumlah_total'
  | 'akumulasi' | 'nilai_buku'
  | 'tgl_perolehan' | 'cara_perolehan' | 'lokasi'
  | 'asal_pihak' | 'asal_kode' | 'asal_nama'
  | 'ba_tanggal' | 'ba_nomor'
  | 'sk_tanggal' | 'sk_nomor'
  | 'keterangan'

export type KolomLembar = Kolom<KolomPenerimaan>

/** Identitas cabang. Dipakai URL halaman cetak & kunci ingatan penanda tangan. */
export type IdPenerimaan = 'penggunaan' | 'internal'

export type FormatPenerimaan = {
  /** Kode lembar RINCI. */
  kode: string
  /** Awalan tanpa akhiran — dipakai tangga rekap (`IV.B.1.3`…). */
  awalan: string
  /** Jenis ledger yang disaring. */
  jenis: string
  /** Baris 1 judul, tanpa isian "BERUPA…(1)" yang diisi jenis asetnya. */
  judul: string
  /**
   * Baris 2 judul, kalau formatnya punya. IV.B.1.x punya ("DALAM BENTUK
   * PENGGUNAAN PENGALIHAN…"), IV.C tidak — judulnya cuma satu baris.
   */
  judulLanjut?: string
  /**
   * Kolom PALING KIRI, di luar blok "Penggolongan dan Kodefikasi Barang".
   * Di keluarga ini selalu NIBAR.
   */
  kolomKiri: KolomLembar
  /**
   * Kolom yang duduk DI DALAM blok Penggolongan, tepat sesudah sel-sel kode.
   * Di keluarga ini selalu "Nama Barang".
   */
  kolomNama: KolomLembar
  /** Sisa kolom, kiri→kanan sesudah blok Penggolongan. */
  kolom: KolomLembar[]
  /** Penanda subtotal sejajar `SEG_SUBTOTAL` = [6seg, 5seg, 4seg, 3seg]. */
  subtotal: readonly [number, number, number, number]
  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/**
 * ⚠️ Kolom NIBAR diisi **NIBAR saja**. Lembar aslinya berjudul "NIBAR/NUSP";
 * NUSP tidak dipakai aplikasi ini, jadi judulnya pun ditulis "NIBAR" supaya tak
 * ada kolom yang menjanjikan isi yang tak pernah ada — keputusan yang sama
 * dengan kolom (12) di cabang IV.A.
 *
 * ⚠️ LEBAR: totalnya + `sisaLebar` = 100 PERSIS, dan itu yang membuat lembarnya
 * "fit to window" di `table-fixed`. Kolom ber-isi pendek & seragam dipepet
 * (jumlah, satuan, kedua tanggal) supaya kelegaannya bisa dialihkan ke kolom
 * ber-isi panjang. **NIBAR tak bisa ikut dipepet**: 45 digit, dipenggal dua
 * baris di batas segmen oleh `pecahNibar()`, dan potongan pertama 26 digit
 * wajib muat SEBARIS — kalau tidak ia membungkus sendiri lebih dulu & hasilnya
 * tiga baris. Selnya karena itu memakai font sendiri yang lebih kecil.
 *
 * ⚠️ Lebarnya BEDA antar cabang & memang harus begitu: IV.C punya 3 kolom lebih
 * sedikit, jadi kelegaan yang terbebas dibagikan ke kolom teks & blok kode.
 * Menyamakannya berarti IV.C mencetak jauh lebih sempit dari yang perlu.
 */
export const FORMAT_PENERIMAAN: Record<IdPenerimaan, FormatPenerimaan> = {
  // ── IV.B.1 — Penerimaan Penggunaan (pengalihan status antar SKPD) ─────────
  //
  // ⚠️ Kolom mulai (8), bukan (9): kop-nya 7 isian karena baris sebutan pejabat
  // & nama SKPD DISATUKAN jadi satu isian ("PENGGUNA BARANG ATAU PENGELOLA
  // BARANG………(3)"). Bandingkan IV.C di bawah yang memisahkannya.
  penggunaan: {
    kode: 'IV.B.1.2',
    awalan: 'IV.B.1',
    jenis: 'pengalihan_status',
    judul: 'LAPORAN PENERIMAAN PENGGUNAAN BERUPA',
    judulLanjut: 'DALAM BENTUK PENGGUNAAN PENGALIHAN ATAU PENYERAHAN STATUS PENGGUNAAN BMD',

    kolomKiri: { key: 'nibar', judul: 'NIBAR', nomor: 8, lebar: 8.5, rata: 'kiri' },
    kolomNama: { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: 5.4, rata: 'kiri' },

    kolom: [
      { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 5.2, rata: 'kiri' },
      { key: 'spek_lain', judul: 'Spesifikasi Lainnya', nomor: 12, lebar: 3.4, rata: 'kiri' },
      { key: 'jumlah', judul: 'Jumlah Barang', nomor: 13, lebar: 3.4, rata: 'kanan' },
      { key: 'satuan', judul: 'Satuan Barang', nomor: 14, lebar: 3.3, rata: 'tengah' },
      { key: 'harga_satuan', judul: 'Harga Satuan (Rp)', nomor: 15, lebar: 4.6, rata: 'kanan' },
      { key: 'jumlah_total', judul: 'Jumlah Total', nomor: 16, lebar: 4.8, rata: 'kanan', rumus: '(16) = (13)x(15)' },
      { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 17, lebar: 4.8, rata: 'kanan' },
      { key: 'nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 18, lebar: 4.8, rata: 'kanan', rumus: '(18) = (16)-(17)' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 19, lebar: 4.2, rata: 'tengah' },
      { key: 'cara_perolehan', judul: 'Cara Perolehan', nomor: 20, lebar: 3.5, rata: 'kiri' },
      // ⚠️ Kolom Lokasi HANYA ADA DI IV.B — IV.C tidak punya. Jangan disalin
      // ke sana "biar seragam"; lembar resmi dicocokkan pemeriksa kolom per
      // kolom, jadi kolom tambahan justru membuatnya tak cocok.
      { key: 'lokasi', judul: 'Lokasi', nomor: 21, lebar: 4.2, rata: 'kiri' },
      // ── Asal Barang / Penyerahan dari ──────────────────────────────────────
      // ⚠️ Kode & nama barang diisi APA ADANYA, dan itu BUKAN salinan
      // asal-asalan dari kolom Penggolongan: `pengalihan_status` tidak mengubah
      // kodefikasi maupun nama barang, jadi identitas di SKPD yang menyerahkan
      // memang sama persis. Yang berubah cuma kode REGISTER (KTP barang), dan
      // itu bukan yang diminta kolom ini.
      { key: 'asal_pihak', judul: 'Pihak yang menyerahkan', nomor: 22, grup: 'Asal Barang/Penyerahan dari', lebar: 4.6, rata: 'kiri' },
      { key: 'asal_kode', judul: 'Kode Barang', nomor: 23, grup: 'Asal Barang/Penyerahan dari', lebar: 3.8, rata: 'kiri' },
      { key: 'asal_nama', judul: 'Nama Barang', nomor: 24, grup: 'Asal Barang/Penyerahan dari', lebar: 3.7, rata: 'kiri' },
      { key: 'ba_tanggal', judul: 'Tanggal', nomor: 25, grup: 'Berita Acara Serah Terima', lebar: 4.2, rata: 'tengah' },
      { key: 'ba_nomor', judul: 'Nomor', nomor: 26, grup: 'Berita Acara Serah Terima', lebar: 4.2, rata: 'kiri' },
      // ⚠️ SK Penghapusan SENGAJA SELALU KOSONG & HANYA ADA DI IV.B — aplikasi
      // ini tidak menyimpan SK Penghapusan sisi SKPD yang menyerahkan di mana
      // pun. Kolomnya tetap dicetak supaya lembarnya cocok kolom-per-kolom saat
      // diperiksa, tapi diisi tebakan (mis. `no_sk` kartu pengalihan, yang
      // artinya lain) akan menaruh nomor dokumen yang salah di lembar bertanda
      // tangan. Pola yang sama dengan `dok_nama`/`penyebab` di cabang IV.A.
      { key: 'sk_tanggal', judul: 'Tanggal', nomor: 27, grup: 'Surat Keputusan Penghapusan', lebar: 2.8, rata: 'tengah' },
      { key: 'sk_nomor', judul: 'Nomor', nomor: 28, grup: 'Surat Keputusan Penghapusan', lebar: 2.4, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 29, lebar: 4.0, rata: 'kiri' },
    ],

    subtotal: [30, 31, 32, 33],
    // ⚠️ Lembar aslinya menomori nama penanda tangan DAN NIP-nya sama-sama (36).
    // Salah ketik di sumbernya, diikuti apa adanya — sama seperti "(14) dua
    // kali" di IV.A.2.2. Jangan "dirapikan": lembar resmi dicocokkan pemeriksa
    // kolom per kolom, jadi merapikannya justru membuatnya tak cocok.
    kaki: { tanggal: 34, jabatan: 35, nama: 36 },
  },

  // ── IV.C — Penerimaan BMD Internal Pengguna Barang (mutasi internal) ───────
  //
  // ⚠️ Kolom mulai (9), bukan (8): kop-nya 8 isian karena sebutan pejabat (3) &
  // `SKPD…………(4)` jadi DUA isian terpisah. Ini yang menggeser SELURUH penomoran
  // satu angka dibanding IV.B — bukan kolom yang berbeda.
  //
  // ⚠️ TIGA KOLOM LEBIH SEDIKIT dari IV.B: tak ada Lokasi, tak ada blok Surat
  // Keputusan Penghapusan. Masuk akal — mutasi internal itu perpindahan DI
  // DALAM satu Pengguna Barang, jadi tak ada penghapusan dari daftar siapa pun.
  internal: {
    kode: 'IV.C.2',
    awalan: 'IV.C',
    jenis: 'mutasi_internal',
    judul: 'LAPORAN PENERIMAAN BMD INTERNAL PENGGUNA BARANG BERUPA',

    kolomKiri: { key: 'nibar', judul: 'NIBAR', nomor: 9, lebar: 9.0, rata: 'kiri' },
    kolomNama: { key: 'nama', judul: 'Nama Barang', nomor: 11, lebar: 6.2, rata: 'kiri' },

    kolom: [
      { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 12, lebar: 5.4, rata: 'kiri' },
      { key: 'spek_lain', judul: 'Spesifikasi Lainnya', nomor: 13, lebar: 4.3, rata: 'kiri' },
      { key: 'jumlah', judul: 'Jumlah Barang', nomor: 14, lebar: 3.4, rata: 'kanan' },
      { key: 'satuan', judul: 'Satuan Barang', nomor: 15, lebar: 3.3, rata: 'tengah' },
      { key: 'harga_satuan', judul: 'Harga Satuan (Rp)', nomor: 16, lebar: 5.2, rata: 'kanan' },
      { key: 'jumlah_total', judul: 'Total Nilai Barang (Rp)', nomor: 17, lebar: 5.4, rata: 'kanan', rumus: '(17) = (14)x(16)' },
      { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 18, lebar: 5.4, rata: 'kanan' },
      { key: 'nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 19, lebar: 5.4, rata: 'kanan', rumus: '(19) = (17)-(18)' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 20, lebar: 4.2, rata: 'tengah' },
      { key: 'cara_perolehan', judul: 'Cara Perolehan', nomor: 21, lebar: 3.8, rata: 'kiri' },
      // ⚠️ Grupnya berjudul "Asal Barang" SAJA di IV.C (IV.B: "Asal
      // Barang/Penyerahan dari"). Diikuti apa adanya.
      { key: 'asal_pihak', judul: 'Pihak yang menyerahkan', nomor: 22, grup: 'Asal Barang', lebar: 4.8, rata: 'kiri' },
      { key: 'asal_kode', judul: 'Kode Barang', nomor: 23, grup: 'Asal Barang', lebar: 5.0, rata: 'kiri' },
      { key: 'asal_nama', judul: 'Nama Barang', nomor: 24, grup: 'Asal Barang', lebar: 4.8, rata: 'kiri' },
      { key: 'ba_tanggal', judul: 'Tanggal', nomor: 25, grup: 'Berita Acara Serah Terima', lebar: 4.2, rata: 'tengah' },
      { key: 'ba_nomor', judul: 'Nomor', nomor: 26, grup: 'Berita Acara Serah Terima', lebar: 5.0, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 27, lebar: 4.6, rata: 'kiri' },
    ],

    subtotal: [28, 29, 30, 31],
    // ⚠️ Sama seperti IV.B: nama & NIP sama-sama (34) di lembar aslinya.
    kaki: { tanggal: 32, jabatan: 33, nama: 34 },
  },
}

/** Seluruh kolom lembar rinci, kiri→kanan (tanpa sel segmen kode). */
export function kolomLembar(f: FormatPenerimaan): KolomLembar[] {
  return [f.kolomKiri, f.kolomNama, ...f.kolom]
}

/** Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodePenerimaan(f: FormatPenerimaan): number {
  return sisaLebar(kolomLembar(f))
}

/**
 * Judul lembar REKAP.
 *
 * `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya. ⚠️ Beda dari cabang
 * IV.A yang lembar `.7`-nya justru tetap berjudul LAPORAN; di keluarga ini
 * keempatnya REKAPITULASI, jadi tak ada pengecualian yang perlu diingat.
 */
export function judulRekapPenerimaan(f: FormatPenerimaan): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
