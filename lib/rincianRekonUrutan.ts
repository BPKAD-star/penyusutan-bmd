// Urutan "silsilah" kategori mutasi untuk Rincian Transaksi Rekonsiliasi
// (app/dashboard/pelaporan/rekonsiliasi/rincian/page.tsx, permintaan user
// 2026-09-18) — MENGGANTI urutan lama (golongan → arah → kategori).
//
// Prinsipnya: satu KELUARGA peristiwa (mis. induk barang yang dipecah + hasil
// pecahannya) tetap SATU kelompok berurutan, TIDAK dipisah ke bagian "Tambah"
// dulu baru "Kurang" seperti `BARIS_TRX` (lib/beritaAcaraRekon.ts). Itu beda
// tujuan yang disengaja: BARIS_TRX mengikuti nomor baku lembar Berita Acara
// Permendagri (yang memang memisah kolom Tambah/Kurang), sedangkan lembar
// Rincian ini murni bukti dukung internal — pembacanya ingin melihat "apa
// yang terjadi pada barang ini" secara runtun, bukan "berapa yang bertambah
// vs berkurang". Jadi pihak yang KEKAL/asal (induk) didahulukan dari pihak
// yang baru muncul atau lenyap (anak) — sengaja terbalik dari arah Tambah/
// Kurang untuk Pemecahan (induk-nya justru baris "Kurang").
//
// ⚠️ `pengalihan_keluar` SENGAJA masuk kelompok "Transfer Keluar", BUKAN
// "Penghapusan" — walau `KATEGORI_LABEL`-nya berbunyi "Penghapusan Pengalihan
// (transfer keluar)" (itu istilah baku Permendagri/BA Rekon; makna
// sesungguhnya barangnya TIDAK hilang dari pemda, cuma pindah SKPD). Simetris
// dengan `penggunaan_masuk` di "Transfer Masuk" — pasangan masuk/keluarnya
// jenis ledger `pengalihan_status`.
//
// ⚠️ Reklasifikasi diletakkan DI DALAM kelompok "Koreksi" (bukan jadi grup
// tersendiri spt di BARIS_TRX) — keputusan tampilan utk lembar ini: reklas
// juga sekadar "pembetulan pencatatan" (kodefikasi/fungsi), bukan perubahan
// kepemilikan atau keberadaan fisik barang, jadi sekeluarga dgn Koreksi Nilai/
// Kapitalisasi/Pemecahan/Penggabungan.
import type { MutasiKey } from './rekon'

export const URUTAN_KATEGORI_RINCIAN: MutasiKey[] = [
  // 1. Cara Perolehan
  'pengadaan', 'belanja_jasa', 'hibah', 'tukar', 'inventarisasi', 'lainnya',
  // 2. Transfer Masuk
  'penggunaan_masuk', 'internal_masuk',
  // 3. Transfer Keluar
  'pengalihan_keluar', 'internal_keluar',
  // 4. Koreksi — Koreksi Nilai
  'koreksi_tambah', 'koreksi_kurang',
  // 4. Koreksi — Kapitalisasi (induk yang menyerap, lalu anak yang diserap)
  'kapitalisasi', 'kapitalisasi_keluar',
  // 4. Koreksi — Pemecahan (induk yang dipecah, lalu anak/pecahannya)
  'pemecahan_keluar', 'pemecahan_masuk',
  // 4. Koreksi — Penggabungan (induk/penerima, lalu sumber yang dilebur)
  'penggabungan_masuk', 'penggabungan_keluar',
  // 4. Koreksi — Reklasifikasi (per jenis: masuk lalu keluar)
  'reklas_fungsi_masuk', 'reklas_fungsi_keluar',
  'reklas_kode_masuk', 'reklas_kode_keluar',
  // 5. Penghapusan — Pemindahtanganan
  'hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan',
  // 5. Penghapusan — Sebab Lain
  'hapus_sebab_lain',
]

const RANK = new Map<MutasiKey, number>(URUTAN_KATEGORI_RINCIAN.map((k, i) => [k, i]))

/**
 * Peringkat silsilah kategori — dipakai sbg kunci sort utama Rincian
 * Rekonsiliasi. Kategori yang (seharusnya tak pernah terjadi) belum
 * terdaftar di `URUTAN_KATEGORI_RINCIAN` jatuh ke AKHIR, bukan melempar —
 * kalau kelak ada MutasiKey baru yang lupa didaftarkan di sini, halamannya
 * tetap tampil (barisnya cuma nyasar ke bawah), bukan error total.
 */
export function urutanKategoriRincian(k: MutasiKey): number {
  return RANK.get(k) ?? 999
}
