// ============================================================================
// Alasan reklasifikasi — SATU sumber untuk menu Pembukuan & modul Pelaporan.
//
// Sampai 2026-09-07 daftar ini hidup sebagai konstanta privat di
// components/pengelolaan/Reklasifikasi.tsx. Ia diangkat ke sini begitu lembar
// Permendagri IV.F.2 butuh isian kolom **"Penyebab Reklasifikasi"** — dan
// itulah kelas yang paling berbahaya kalau disalin: labelnya TERCETAK di lembar
// yang ditandatangani, jadi dua salinan yang menyimpang membuat dokumen resmi
// menyebut penyebab yang berbeda dari yang tercatat di menu pembukuannya,
// tanpa satu pun error.
//
// ⚠️ `value` = nilai yang tersimpan di `jurnal_header.jenis` untuk kategori
// `reklasifikasi`. Menggantinya BUKAN sekadar rename: baris lama di DB tetap
// memakai nilai lamanya, dan `ALASAN_LABEL[j.jenis]` akan `undefined` — di
// layar terbaca kosong, di lembar cetak terbaca kolom yang lupa diisi.
// ============================================================================

/** Nilai kolom `jurnal_header.jenis` untuk kartu berkategori `reklasifikasi`. */
export type AlasanReklas = 'komptabel_ke_ekstra' | 'komptabel_ke_intra' | 'golongan' | 'kode'

export const ALASAN_OPT: { value: AlasanReklas; label: string; deskripsi: string }[] = [
  { value: 'komptabel_ke_ekstra', label: 'Intra → Ekstra Komptabel', deskripsi: 'Nilai penyusutan tetap sama, cuma status komptabel yang berubah.' },
  { value: 'komptabel_ke_intra', label: 'Ekstra → Intra Komptabel', deskripsi: 'Nilai penyusutan tetap sama. Dibutuhkan sebelum kapitalisasi (mensyaratkan komptabel sama).' },
  { value: 'golongan', label: 'Perubahan Fungsi BMD', deskripsi: 'Barang pindah golongan/jenis BMD sepenuhnya (mis. KDP selesai dibangun jadi Gedung, atau barang rusak berat direklas ke Aset Lain-Lain). Penyusutan mulai dihitung ULANG sejak tanggal reklas ini (bukan retroaktif).' },
  { value: 'kode', label: 'Kesalahan Kodefikasi', deskripsi: 'Tetap dalam jenis BMD yang sama, cuma kodefikasi detailnya salah pilih. Penyusutan dihitung ulang RETROAKTIF dari tanggal perolehan asli, pakai masa manfaat kodefikasi tujuan.' },
]

export const ALASAN_LABEL =
  Object.fromEntries(ALASAN_OPT.map(a => [a.value, a.label])) as Record<AlasanReklas, string>

/**
 * Jenis ledger yang ditulis tiap alasan.
 *
 * ⚠️ `komptabel_ke_ekstra` & `komptabel_ke_intra` sama-sama menulis
 * `reklas_komptabel` — arahnya dibedakan `payload.intra_ekstra`, bukan jenisnya.
 */
export const LEDGER_JENIS: Record<AlasanReklas, string> = {
  komptabel_ke_ekstra: 'reklas_komptabel',
  komptabel_ke_intra: 'reklas_komptabel',
  golongan: 'reklas_golongan',
  kode: 'reklas_kode',
}

/** Alasan yang MENGGESER kode barang → payload-nya membawa `kode_lama`/`kode_baru`. */
export const perluKodeTujuan = (a: AlasanReklas) => a === 'golongan' || a === 'kode'

export const targetKomptabel = (a: AlasanReklas): 'intra' | 'ekstra' =>
  a === 'komptabel_ke_ekstra' ? 'ekstra' : 'intra'

export const filterKomptabelAwal = (a: AlasanReklas): 'intra' | 'ekstra' | null =>
  a === 'komptabel_ke_ekstra' ? 'intra' : a === 'komptabel_ke_intra' ? 'ekstra' : null

/**
 * Ketiga jenis ledger reklasifikasi.
 *
 * ⚠️ KEMBAR dengan predikat partial index `idx_trx_reklas_id` (migrasi
 * 20260826_01, `WHERE jenis IN ('reklas_kode','reklas_golongan',
 * 'reklas_komptabel','batal_reklas')`). Menambah jenis di sini tanpa
 * memperlebar indexnya membuat menu Laporan Reklasifikasi TIMEOUT begitu
 * dibuka tanpa filter — persis insiden 2026-08-26. Dikunci
 * lib/sinkronisasiRpc.test.ts §7.
 */
export const JENIS_REKLAS = ['reklas_kode', 'reklas_golongan', 'reklas_komptabel'] as const
