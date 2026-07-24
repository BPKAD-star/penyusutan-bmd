// Bentuk / Jenis Kontrak (dokumen sumber pengadaan) — dipakai lintas menu:
// Pengadaan (disimpan di `jurnal_header.jenis`), Konstruksi/KDP (disimpan di
// `payload.sumber`), dan Laporan Pengadaan (kolom "Bentuk Kontrak" format
// Permendagri 47/2021). Semua disimpan sbg TEXT — tak ada enum DB, jadi nilai
// baru aman ditambah tanpa migrasi.
//
// Urutan opsi mengikuti eskalasi nilai (Perpres 12/2021): Bukti Pembelian →
// Kwitansi → SPK / Surat Pesanan → Surat Perjanjian. Konstruksi biasanya di
// atas Rp50 jt → hanya SPK / Surat Perjanjian.
export type BentukKontrak =
  | 'bukti_pembelian' | 'kwitansi' | 'surat_pesanan' | 'spk' | 'surat_perjanjian'

export const BENTUK_KONTRAK_OPT: { value: BentukKontrak; label: string }[] = [
  { value: 'bukti_pembelian', label: 'Bukti Pembelian' },
  { value: 'kwitansi', label: 'Kwitansi' },
  { value: 'surat_pesanan', label: 'Surat Pesanan' },
  { value: 'spk', label: 'Surat Perintah Kerja (SPK)' },
  { value: 'surat_perjanjian', label: 'Surat Perjanjian' },
]

// Subset untuk pekerjaan konstruksi (nilai umumnya > Rp50 jt).
export const BENTUK_KONTRAK_KONSTRUKSI: BentukKontrak[] = ['spk', 'surat_perjanjian']

// Fallback ke nilai mentah supaya data lama (nilai di luar daftar) tetap tampil.
export const bentukKontrakLabel = (v: string | null | undefined): string =>
  BENTUK_KONTRAK_OPT.find(o => o.value === v)?.label || v || '-'
