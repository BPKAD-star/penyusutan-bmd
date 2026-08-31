// ============================================================================
// Format laporan Permendagri 47/2021 — cabang PENGGUNAAN (IV.B.1)
//
//   IV.B.1.2  LAPORAN PENERIMAAN PENGGUNAAN … (lembar RINCI, 1 baris/barang)
//   IV.B.1.3  REKAPITULASI … MENURUT SUB RINCIAN OBJEK   (kode 6 segmen)
//   IV.B.1.4  REKAPITULASI … MENURUT RINCIAN OBJEK       (kode 5 segmen)
//   IV.B.1.5  REKAPITULASI … MENURUT OBJEK               (kode 4 segmen)
//   IV.B.1.6  REKAPITULASI … MENURUT JENIS               (kode 3 segmen)
//
// Sumbernya jenis ledger `pengalihan_status` (menu Pembukuan → Pengelolaan →
// Penggunaan + persetujuan SKPD tujuan di Penggunaan Masuk).
//
// ⚠️ MESIN SUBTOTALNYA DIPAKAI BERSAMA dengan cabang IV.A — `susunRinci`,
// `susunRekap`, `petaNamaTingkat`, `sisaLebar` semuanya dari
// lib/formatPermendagri.ts. Yang ada DI SINI cuma susunan kolomnya. Menulis
// mesin subtotal kedua berarti lembar rinci & keempat rekapnya — yang terbit
// dalam SATU berkas bertanda tangan — bisa menjumlah ke angka berbeda tanpa
// satu pun yang berteriak (CODING-STANDARD §1.2: aturan integritas diekstrak
// sejak kemunculan KEDUA).
//
// ── Empat hal yang BEDA dari cabang IV.A, dan jangan disamakan ───────────────
//
// 1. **NIBAR kolom (8), BERDIRI DI LUAR blok kode & paling kiri.** Di IV.A ia
//    kolom (12) di tengah. Karena itu lembar ini punya penyajinya sendiri.
// 2. **Ada kolom Akumulasi Penyusutan (17) & Nilai Buku (18)** — IV.A tak
//    punya sama sekali. Keduanya ikut dijumlah di baris subtotal, itu sebabnya
//    `ItemLaporan` di lib/formatPermendagri.ts membawa `akumulasi`/`nilaiBuku`
//    opsional.
// 3. **Lembar REKAP-nya 6 kolom** (Kode · Nama · Jumlah Barang · Jumlah Rp ·
//    Akumulasi · Nilai Buku), bukan 4 seperti IV.A.
// 4. **Rekap mulai di 3 SEGMEN**, bukan 2 — tak ada baris kelompok neraca
//    (`1.3` ASET TETAP) di paling atas seperti IV.A. Lihat `SEG_MIN_REKAP_IVB`.
//
// ⚠️ KOP-nya juga lebih pendek: 7 isian (IV.A: 8), sehingga kolom mulai (8)
// bukan (9). Sebabnya baris SKPD & sebutan pejabat DISATUKAN jadi satu isian
// "PENGGUNA BARANG ATAU PENGELOLA BARANG………(3)".
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — alasan & aturannya sama persis
// dengan yang tertulis di kepala lib/formatPermendagri.ts. Nomornya TIDAK
// dicetak di lembar (keputusan user 2026-08-30); yang tersisa dua gunanya:
// tautan balik ke lembar asli, dan penjaga struktur kolom lewat test.
// ============================================================================

import { sisaLebar, type Kolom } from './formatPermendagri'

/**
 * Kedalaman TERDANGKAL lembar rekap cabang IV.B.
 *
 * ⚠️ **3, bukan 2.** Lembar IV.B.1.3–1.6 membuka dengan baris `x x x` — tak ada
 * baris kelompok neraca (`x. x.` = `1.3` ASET TETAP) seperti IV.A. Memakai 2 di
 * sini menambahkan baris yang TIDAK ADA di format aslinya, dan karena angkanya
 * tetap menjumlah dengan benar, tak satu pun uji aritmetika akan menangkapnya —
 * yang keliru cuma bentuk lembar yang ditandatangani.
 */
export const SEG_MIN_REKAP_IVB = 3

/** Banyaknya sel segmen kode di lembar rinci IV.B.1.2 (kode penuh = 7 segmen). */
export const SEL_KODE_IVB = 7

/**
 * Sel segmen kode di lembar REKAP IV.B.1.3–1.6.
 *
 * ⚠️ Sengaja `seg` masing-masing tangga, bukan angka tetap: lembar aslinya
 * memang cuma menyediakan sebanyak kedalamannya (`.3` enam sel, `.6` tiga sel),
 * dan sel kosong di kanan bikin pembaca mengira ada segmen yang belum diisi.
 */
export const selKodeRekapIvb = (seg: number): number => seg

// ── Kolom lembar rinci IV.B.1.2 ─────────────────────────────────────────────

export type KolomPenggunaan =
  | 'nibar'
  | 'nama' | 'spek_nama' | 'spek_lain'
  | 'jumlah' | 'satuan' | 'harga_satuan' | 'jumlah_total'
  | 'akumulasi' | 'nilai_buku'
  | 'tgl_perolehan' | 'cara_perolehan' | 'lokasi'
  | 'asal_pihak' | 'asal_kode' | 'asal_nama'
  | 'ba_tanggal' | 'ba_nomor'
  | 'sk_tanggal' | 'sk_nomor'
  | 'keterangan'

export type KolomIvb = Kolom<KolomPenggunaan>

export type FormatPenggunaan = {
  /** Kode lembar rinci. */
  kode: string
  /** Awalan tanpa akhiran — dipakai tangga rekap (`IV.B.1.3`…). */
  awalan: string
  /** Jenis ledger yang disaring. */
  jenis: string
  /** Baris 1 judul, tanpa isian "BERUPA…(1)" yang diisi jenis asetnya. */
  judul: string
  /** Baris 2 judul — tetap, dicetak di bawah baris 1. */
  judulLanjut: string
  /**
   * Kolom PALING KIRI, di luar blok "Penggolongan dan Kodefikasi Barang".
   * Di lembar ini isinya NIBAR (8).
   */
  kolomKiri: KolomIvb
  /**
   * Kolom yang duduk DI DALAM blok Penggolongan, tepat sesudah sel-sel kode.
   * Di lembar ini "Nama Barang" (10).
   */
  kolomNama: KolomIvb
  /** Sisa kolom, kiri→kanan sesudah blok Penggolongan. */
  kolom: KolomIvb[]
  /** Penanda subtotal sejajar `SEG_SUBTOTAL` = [6seg, 5seg, 4seg, 3seg]. */
  subtotal: readonly [number, number, number, number]
  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/**
 * ⚠️ Kolom (8) diisi **NIBAR saja**. Lembar aslinya berjudul "NIBAR/NUSP";
 * NUSP tidak dipakai aplikasi ini, jadi judulnya pun ditulis "NIBAR" supaya tak
 * ada kolom yang menjanjikan isi yang tak pernah ada — keputusan yang sama
 * dengan kolom (12) di cabang IV.A.
 *
 * ⚠️ LEBAR: totalnya + `sisaLebar` = 100 PERSIS, dan itu yang membuat lembarnya
 * "fit to window" di `table-fixed`. Kolom ber-isi pendek & seragam dipepet
 * (jumlah, satuan, keempat tanggal) supaya kelegaannya bisa dialihkan ke kolom
 * ber-isi panjang. **NIBAR tak bisa ikut dipepet**: 45 digit, dipenggal dua
 * baris di batas segmen oleh `pecahNibar()`, dan potongan pertama 26 digit
 * wajib muat SEBARIS — kalau tidak ia membungkus sendiri lebih dulu & hasilnya
 * tiga baris. Selnya karena itu memakai font sendiri yang lebih kecil.
 */
export const FORMAT_PENGGUNAAN: FormatPenggunaan = {
  kode: 'IV.B.1.2',
  awalan: 'IV.B.1',
  jenis: 'pengalihan_status',
  judul: 'LAPORAN PENERIMAAN PENGGUNAAN BERUPA',
  judulLanjut: 'DALAM BENTUK PENGGUNAAN PENGALIHAN ATAU PENYERAHAN STATUS PENGGUNAAN BMD',

  kolomKiri: { key: 'nibar', judul: 'NIBAR', nomor: 8, lebar: 8.5, rata: 'kiri' },
  kolomNama: { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: 6.0, rata: 'kiri' },

  kolom: [
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 6.0, rata: 'kiri' },
    { key: 'spek_lain', judul: 'Spesifikasi Lainnya', nomor: 12, lebar: 4.0, rata: 'kiri' },
    { key: 'jumlah', judul: 'Jumlah Barang', nomor: 13, lebar: 2.0, rata: 'kanan' },
    { key: 'satuan', judul: 'Satuan Barang', nomor: 14, lebar: 2.3, rata: 'tengah' },
    { key: 'harga_satuan', judul: 'Harga Satuan (Rp)', nomor: 15, lebar: 4.6, rata: 'kanan' },
    { key: 'jumlah_total', judul: 'Jumlah Total', nomor: 16, lebar: 4.8, rata: 'kanan', rumus: '(16) = (13)x(15)' },
    { key: 'akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 17, lebar: 4.8, rata: 'kanan' },
    { key: 'nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 18, lebar: 4.8, rata: 'kanan', rumus: '(18) = (16)-(17)' },
    { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 19, lebar: 3.4, rata: 'tengah' },
    { key: 'cara_perolehan', judul: 'Cara Perolehan', nomor: 20, lebar: 3.5, rata: 'kiri' },
    { key: 'lokasi', judul: 'Lokasi', nomor: 21, lebar: 4.2, rata: 'kiri' },
    // ── Asal Barang / Penyerahan dari ────────────────────────────────────────
    // ⚠️ (23)(24) diisi kode & nama barang APA ADANYA, dan itu BUKAN salinan
    // asal-asalan dari kolom (9)(10): `pengalihan_status` tidak mengubah
    // kodefikasi maupun nama barang, jadi identitas di SKPD yang menyerahkan
    // memang sama persis. Yang berubah cuma kode REGISTER (KTP barang), dan itu
    // bukan yang diminta kolom ini.
    { key: 'asal_pihak', judul: 'Pihak yang menyerahkan', nomor: 22, grup: 'Asal Barang/Penyerahan dari', lebar: 5.2, rata: 'kiri' },
    { key: 'asal_kode', judul: 'Kode Barang', nomor: 23, grup: 'Asal Barang/Penyerahan dari', lebar: 4.2, rata: 'kiri' },
    { key: 'asal_nama', judul: 'Nama Barang', nomor: 24, grup: 'Asal Barang/Penyerahan dari', lebar: 4.2, rata: 'kiri' },
    { key: 'ba_tanggal', judul: 'Tanggal', nomor: 25, grup: 'Berita Acara Serah Terima', lebar: 3.4, rata: 'tengah' },
    { key: 'ba_nomor', judul: 'Nomor', nomor: 26, grup: 'Berita Acara Serah Terima', lebar: 4.2, rata: 'kiri' },
    // ⚠️ (27)(28) SENGAJA SELALU KOSONG — aplikasi ini tidak menyimpan SK
    // Penghapusan sisi SKPD yang menyerahkan di mana pun. Kolomnya tetap
    // dicetak supaya lembarnya cocok kolom-per-kolom saat diperiksa, tapi
    // diisi tebakan (mis. `no_sk` kartu pengalihan, yang artinya lain) akan
    // menaruh nomor dokumen yang salah di lembar bertanda tangan. Pola yang
    // sama dengan `dok_nama`/`penyebab` di cabang IV.A.
    { key: 'sk_tanggal', judul: 'Tanggal', nomor: 27, grup: 'Surat Keputusan Penghapusan', lebar: 3.4, rata: 'tengah' },
    { key: 'sk_nomor', judul: 'Nomor', nomor: 28, grup: 'Surat Keputusan Penghapusan', lebar: 3.7, rata: 'kiri' },
    { key: 'keterangan', judul: 'Keterangan', nomor: 29, lebar: 3.5, rata: 'kiri' },
  ],

  // Sejajar SEG_SUBTOTAL = [6,5,4,3] → 6 seg dapat (30), 3 seg dapat (33).
  subtotal: [30, 31, 32, 33],
  // ⚠️ Lembar aslinya menomori nama penanda tangan DAN NIP-nya sama-sama (36).
  // Salah ketik di sumbernya, diikuti apa adanya — sama seperti "(14) dua kali"
  // di IV.A.2.2. Jangan "dirapikan": lembar resmi dicocokkan pemeriksa kolom
  // per kolom, jadi merapikannya justru membuatnya tak cocok.
  kaki: { tanggal: 34, jabatan: 35, nama: 36 },
}

/** Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodeIvb(f: FormatPenggunaan = FORMAT_PENGGUNAAN): number {
  return sisaLebar([f.kolomKiri, f.kolomNama, ...f.kolom])
}

/**
 * Judul lembar REKAP IV.B.1.3–1.6.
 *
 * `LAPORAN` → `REKAPITULASI`, mengikuti lembar aslinya. ⚠️ Beda dari cabang
 * IV.A yang lembar `.7`-nya justru tetap berjudul LAPORAN; di sini keempatnya
 * REKAPITULASI, jadi tak ada pengecualian yang perlu diingat.
 */
export function judulRekapIvb(f: FormatPenggunaan = FORMAT_PENGGUNAAN): string {
  return f.judul.replace(/^LAPORAN /, 'REKAPITULASI ')
}
