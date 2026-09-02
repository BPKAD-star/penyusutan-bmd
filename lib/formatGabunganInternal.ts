// ============================================================================
// Format IV.D.7 — REKAPITULASI GABUNGAN PENGELUARAN DAN PENERIMAAN BMD INTERNAL
//
// Satu lembar, satu baris per perpindahan, dengan DUA BLOK CERMIN:
// "Pengeluaran Barang" (pihak yang menyerahkan + 6 kolom angka) dan
// "Penerimaan Barang" (pihak yang menerima + 6 kolom angka yang sama bentuknya).
//
// ⚠️ SENGAJA TERPISAH dari `lib/formatPerpindahan.ts`, dan itu bukan kelalaian
// menggabungkan. Bentuknya berbeda secara mendasar:
//
//   IV.B/IV.C/IV.D.2   hierarkis  — baris kelompok 3–6 segmen + subtotal,
//                                   tanpa nomor urut, satu blok angka
//   IV.D.7 (ini)       DATAR      — bernomor 1,2,3…, TANPA subtotal sama
//                                   sekali, dua blok angka bercermin, dan
//                                   ditutup baris "Jumlah Total"
//
// Memaksanya masuk `FormatPerpindahan` berarti tipe itu harus menumbuhkan
// bendera "punya subtotal atau tidak", "satu blok atau dua", "bernomor atau
// tidak" — persis komponen ber-belasan prop boolean yang dilarang
// CODING-STANDARD §1.5. Yang TETAP dipakai bersama cuma hal yang berbahaya
// kalau menyimpang: `Kolom`/`sisaLebar` (lib/formatPermendagri.ts) & pemuat
// datanya (lib/laporanPerpindahan.ts).
//
// ── Kenapa kedua blok angkanya SELALU sama di aplikasi ini ──────────────────
// Formatnya dirancang untuk keadaan di mana sisi keluar & sisi masuk dicatat
// terpisah (mis. jumlah yang diserahkan ≠ jumlah yang diterima karena ada yang
// hilang di jalan). Di aplikasi ini SATU baris `mutasi_internal` merekam
// kedua sisi sekaligus — barangnya sama, jumlahnya sama, nilainya sama — jadi
// kedua blok pasti kembar dan kedua baris "Jumlah Total" pasti sama besar.
//
// ⚠️ Itu berarti baris totalnya **menyatakan ulang**, bukan mengecek silang.
// Jangan pernah menyajikannya ke pemeriksa sebagai bukti "keluar = masuk sudah
// dicocokkan" — yang dibuktikan cuma bahwa satu baris ledger dibaca dua kali.
// Yang benar-benar berbeda antara kedua blok hanyalah PIHAK-nya.
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — aturannya sama dgn seluruh
// lembar Permendagri di repo ini. Nomornya tak dicetak; ia tautan balik ke
// lembar asli + penjaga struktur kolom lewat test.
// ============================================================================

import { sisaLebar, type Kolom } from './formatPermendagri'

/** Banyaknya sel segmen kode (kode penuh = 7 segmen). */
export const SEL_KODE_GABUNGAN = 7

export type KolomGabungan =
  | 'no' | 'ba_tanggal' | 'ba_nomor' | 'nibar' | 'nama' | 'spek_nama'
  | 'keluar_pihak' | 'keluar_jumlah' | 'keluar_satuan' | 'keluar_harga'
  | 'keluar_total' | 'keluar_akumulasi' | 'keluar_nilai_buku'
  | 'masuk_pihak' | 'masuk_jumlah' | 'masuk_satuan' | 'masuk_harga'
  | 'masuk_total' | 'masuk_akumulasi' | 'masuk_nilai_buku'
  | 'keterangan'

export type KolomIvd7 = Kolom<KolomGabungan>

export const GRUP_KELUAR = 'Pengeluaran Barang'
export const GRUP_MASUK = 'Penerimaan Barang'
export const GRUP_BAST = 'Berita Acara Serah Terima'

export const FORMAT_GABUNGAN_INTERNAL = {
  kode: 'IV.D.7',
  jenis: 'mutasi_internal',
  judul: 'REKAPITULASI GABUNGAN PENGELUARAN DAN PENERIMAAN BMD INTERNAL PENGGUNA BARANG BERUPA',

  /** Kolom SEBELUM blok "Penggolongan dan Kodefikasi Barang". */
  kolomKiri: [
    { key: 'no', judul: 'No.', nomor: 9, lebar: 2.2, rata: 'tengah' },
    { key: 'ba_tanggal', judul: 'Tanggal', nomor: 10, grup: GRUP_BAST, lebar: 3.8, rata: 'tengah' },
    { key: 'ba_nomor', judul: 'Nomor', nomor: 11, grup: GRUP_BAST, lebar: 5.0, rata: 'kiri' },
    { key: 'nibar', judul: 'NIBAR', nomor: 12, lebar: 8.0, rata: 'kiri' },
  ] as KolomIvd7[],

  /** Kolom di DALAM blok Penggolongan, sesudah sel-sel kode (13). */
  kolomNama: { key: 'nama', judul: 'Nama Barang', nomor: 14, lebar: 5.0, rata: 'kiri' } as KolomIvd7,

  /** Sisa kolom, kiri→kanan sesudah blok Penggolongan. */
  kolom: [
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 15, lebar: 5.0, rata: 'kiri' },
    // ── Pengeluaran Barang ────────────────────────────────────────────────
    { key: 'keluar_pihak', judul: 'Pihak yang menyerahkan', nomor: 16, grup: GRUP_KELUAR, lebar: 5.0, rata: 'kiri' },
    { key: 'keluar_jumlah', judul: 'Jumlah Barang', nomor: 17, grup: GRUP_KELUAR, lebar: 3.0, rata: 'kanan' },
    { key: 'keluar_satuan', judul: 'Satuan Barang', nomor: 18, grup: GRUP_KELUAR, lebar: 3.0, rata: 'tengah' },
    { key: 'keluar_harga', judul: 'Harga Satuan (Rp)', nomor: 19, grup: GRUP_KELUAR, lebar: 4.0, rata: 'kanan' },
    { key: 'keluar_total', judul: 'Total Nilai Barang (Rp)', nomor: 20, grup: GRUP_KELUAR, lebar: 4.4, rata: 'kanan', rumus: '(20) = (17)x(19)' },
    { key: 'keluar_akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 21, grup: GRUP_KELUAR, lebar: 4.4, rata: 'kanan' },
    { key: 'keluar_nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 22, grup: GRUP_KELUAR, lebar: 4.4, rata: 'kanan' },
    // ── Penerimaan Barang ─────────────────────────────────────────────────
    { key: 'masuk_pihak', judul: 'Pihak yang menerima', nomor: 23, grup: GRUP_MASUK, lebar: 5.0, rata: 'kiri' },
    { key: 'masuk_jumlah', judul: 'Jumlah Barang', nomor: 24, grup: GRUP_MASUK, lebar: 3.0, rata: 'kanan' },
    { key: 'masuk_satuan', judul: 'Satuan Barang', nomor: 25, grup: GRUP_MASUK, lebar: 3.0, rata: 'tengah' },
    { key: 'masuk_harga', judul: 'Harga Satuan (Rp)', nomor: 26, grup: GRUP_MASUK, lebar: 4.0, rata: 'kanan' },
    { key: 'masuk_total', judul: 'Total Nilai Barang (Rp)', nomor: 27, grup: GRUP_MASUK, lebar: 4.4, rata: 'kanan', rumus: '(27) = (24)x(26)' },
    { key: 'masuk_akumulasi', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 28, grup: GRUP_MASUK, lebar: 4.4, rata: 'kanan' },
    { key: 'masuk_nilai_buku', judul: 'Nilai Buku (Rp)', nomor: 29, grup: GRUP_MASUK, lebar: 4.4, rata: 'kanan' },
    { key: 'keterangan', judul: 'Keterangan', nomor: 30, lebar: 4.0, rata: 'kiri' },
  ] as KolomIvd7[],

  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: 31, jabatan: 32, nama: 33 },
} as const

export type FormatGabungan = typeof FORMAT_GABUNGAN_INTERNAL

/** Seluruh kolom lembar, kiri→kanan (tanpa sel segmen kode). */
export function kolomGabungan(): KolomIvd7[] {
  const f = FORMAT_GABUNGAN_INTERNAL
  return [...f.kolomKiri, f.kolomNama, ...f.kolom]
}

/** Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodeGabungan(): number {
  return sisaLebar(kolomGabungan())
}

/**
 * Kolom mana yang DIJUMLAHKAN di baris "Jumlah Total".
 *
 * ⚠️ Ditandai di sini, BUKAN dihitung dari posisi. Lembar aslinya cuma
 * menjumlahkan tiga kolom uang tiap blok — Harga Satuan sengaja TIDAK ikut
 * (menjumlahkan harga satuan barang yang berbeda menghasilkan angka yang tak
 * berarti apa pun, pelajaran yang sama dgn lembar Standar Harga). Menurunkan
 * daftar ini dari posisi kolom membuat angka total gampang jatuh di kolom yang
 * salah, dan itu baru ketahuan sesudah lembarnya dicetak.
 */
export const KOLOM_DIJUMLAH: readonly KolomGabungan[] = [
  'keluar_total', 'keluar_akumulasi', 'keluar_nilai_buku',
  'masuk_total', 'masuk_akumulasi', 'masuk_nilai_buku',
]
