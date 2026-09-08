// ============================================================================
// Penghapusan BMD — konstanta bersama menu Pembukuan & modul Pelaporan.
//
// Diangkat dari konstanta privat components/pengelolaan/Penghapusan.tsx begitu
// lembar Permendagri IV.K butuh isian kolom **"Cara Pemindahtanganan"** — dan
// itulah kelas yang paling berbahaya kalau disalin: labelnya TERCETAK di lembar
// yang ditandatangani, jadi dua salinan yang menyimpang membuat dokumen resmi
// menyebut cara pemindahtanganan yang berbeda dari yang tercatat di menu
// pembukuannya, tanpa satu pun error.
//
// ⚠️ `value` = nilai yang tersimpan di DB. Menggantinya BUKAN sekadar rename:
// baris lama tetap memakai nilai lamanya & label-nya akan `undefined` — di
// layar terbaca kosong, di lembar cetak terbaca kolom yang lupa diisi.
// ============================================================================

/** Kolom `jurnal_header.jenis` untuk kartu penghapusan/pengalihan keluar. */
export type JenisHapus =
  | 'penghapusan_pemindahtanganan'
  | 'penghapusan_sebab_lain'
  | 'pengalihan_status'

/**
 * Cara pemindahtanganan — kolom `jurnal_header.sub_jenis`, hanya diisi untuk
 * `penghapusan_pemindahtanganan`.
 *
 * ⚠️ Ini yang mengisi kolom "Cara Pemindahtanganan" di lembar IV.K.1.2 —
 * satu-satunya kolom yang membedakan hibah, penjualan, tukar-menukar, &
 * penyertaan modal di lembar itu. Keempatnya memakai lembar yang SAMA.
 */
export const SUBJENIS_OPT: { value: string; label: string }[] = [
  { value: 'hibah', label: 'Hibah' },
  { value: 'penjualan', label: 'Penjualan' },
  { value: 'tukar_menukar', label: 'Tukar-Menukar' },
  { value: 'penyertaan_modal', label: 'Penyertaan Modal Pemerintah' },
]

export const SUBJENIS_LABEL =
  Object.fromEntries(SUBJENIS_OPT.map(o => [o.value, o.label])) as Record<string, string>

/**
 * Jenis ledger penghapusan yang MENGHAPUS barang dari daftar SKPD.
 *
 * ⚠️ `pengalihan_status` sengaja TIDAK di sini: di aplikasi ini ia bukan baris
 * penghapusan melainkan PERPINDAHAN antar SKPD (barang tetap milik pemda), dan
 * ledger-nya dilayani index yang berbeda (`idx_trx_pindah_id`). Permendagri
 * memperlakukannya sebagai salah satu sebab penghapusan dari daftar SKPD
 * pemberi — itu sebabnya ia tetap punya cabang lembar sendiri (IV.K.2), dibaca
 * dari sisi `skpd_asal`.
 *
 * ⚠️ KEMBAR dengan predikat partial index `idx_trx_penghapusan_id` (migrasi
 * 20260814_03). Menambah jenis di sini tanpa memperlebar indexnya membuat menu
 * Laporan Penghapusan TIMEOUT begitu dibuka tanpa filter — persis insiden
 * 2026-08-26. Dikunci lib/sinkronisasiRpc.test.ts.
 */
export const JENIS_PENGHAPUSAN = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'] as const
