// Susunan kolom tabel LHI yang DILIHAT (layar & cetak) untuk format yang sudah
// memakai bentuk tabel baru dari contoh user (2026-10-01): III.B.1, 3, 6, 8, 12, 13.
// Dipisah dari inventarisasiLaporan.ts supaya berkas itu tak membengkak. Excel TIDAK
// memakai susunan ini — ia tetap datar lewat `kolomLhi()` (satu kolom per data).
//
// Format yang tak terdaftar di `TAMPIL_TETAP` memakai bentuk lama (`kolomLhi`/`kolomLhiCetak`).
import type { KolomLhi } from '@/lib/inventarisasiLaporan'
import type { LhiKode } from '@/lib/inventarisasi'
import { KOLOM_UBAH } from '@/lib/inventarisasiLhiUbah'

const KET: KolomLhi = { key: 'keterangan', label: 'Keterangan' }

export const GRUP_INDUK = 'Data Awal Induk'

/**
 * Susunan III.B.3 yang DILIHAT (layar & cetak) — mengikuti contoh tabel user
 * (2026-10-01): Kode Barang/Uraian Barang & Nama Barang/NIBAR ditumpuk dalam
 * satu sel, lalu blok "Data Awal Induk" berisi empat kolom yang sama (tanpa
 * Kode Lokasi / Kode Register yang dulu ada). Excel tetap datar (`kolomLhi`).
 */
const TAMPIL_III_B_3: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'induk_kode', label: 'Kode Barang / Uraian Barang', grup: GRUP_INDUK, tumpuk: ['induk_uraian'] },
  { key: 'induk_nama', label: 'Nama Barang / NIBAR', grup: GRUP_INDUK, tumpuk: ['induk_nibar'] },
  { key: 'induk_tgl', label: 'Tanggal Perolehan', grup: GRUP_INDUK, angka: true },
  { key: 'induk_nilai', label: 'Nilai Perolehan', grup: GRUP_INDUK, angka: true },
  KET,
]

/**
 * III.B.12 — Terjadi Perubahan Kodefikasi Barang (2026-10-01, contoh tabel user):
 * Nama Barang/NIBAR & Jumlah/Satuan ditumpuk; kode LAMA (register) dan kode BARU
 * (hasil inventarisasi) berdampingan masing-masing dgn uraiannya.
 */
const TAMPIL_III_B_12: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'jumlah', label: 'Jumlah / Satuan', tumpuk: ['satuan'] },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'kode_lama', label: 'Kode Barang Lama / Uraian Barang Lama', tumpuk: ['uraian_lama'] },
  { key: 'kode_baru', label: 'Kode Barang Baru / Uraian Barang Baru', tumpuk: ['uraian_baru'] },
  KET,
]

/**
 * III.B.6 — Digunakan Pemerintah Pusat/Daerah Lainnya/Pihak Lain (2026-10-01,
 * contoh tabel user): Kode/Uraian, Nama/NIBAR & Jumlah/Satuan ditumpuk, Alamat
 * lengkap (wilayah Provinsi→Desa + alamat detail), blok "Penggunaan" berisi
 * Pihak · Nama Instansi/Pihak · Dokumen Penguasaan · Nama Dokumen, lalu Catatan.
 * Petak centang "Ada/Tidak ada dokumen penguasaan" yang lama DIGANTI satu kolom
 * "Dokumen Penguasaan". Layar & cetak satu susunan; Excel datar (`kolomLhi`).
 */
export const GRUP_GUNA = 'Penggunaan'
const TAMPIL_III_B_6: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'jumlah', label: 'Jumlah / Satuan', tumpuk: ['satuan'] },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'alamat', label: 'Alamat' },
  { key: 'guna_pihak', label: 'Pihak', grup: GRUP_GUNA },
  { key: 'guna_nama', label: 'Nama Instansi / Pihak', grup: GRUP_GUNA },
  { key: 'guna_dasar', label: 'Dokumen Penguasaan', grup: GRUP_GUNA },
  { key: 'guna_dokumen', label: 'Nama Dokumen', grup: GRUP_GUNA },
  { key: 'catatan', label: 'Catatan Inventarisasi' },
]

/**
 * III.B.1 — BMD Hilang Karena Kecurian (2026-10-01, contoh tabel user): bentuk
 * paling ringkas — identitas barang + Catatan Inventarisasi, tanpa alamat/penggunaan.
 * Layar & cetak satu susunan; Excel datar (`kolomLhi`).
 */
const TAMPIL_III_B_1: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'jumlah', label: 'Jumlah / Satuan', tumpuk: ['satuan'] },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'catatan', label: 'Catatan Inventarisasi' },
]

/**
 * III.B.13 — Terjadi Perubahan Kuantitas Barang (2026-10-01, contoh tabel user):
 * barang yang di register SATU tetapi seharusnya beberapa register (Gedung
 * dipecah). Kolom khasnya "Nama Barang Hasil Pemecahan" — daftar nama yang
 * diketik petugas di LKI (bagian G, "Seharusnya ada beberapa register"), satu
 * per baris. Tindak lanjutnya Koreksi → Pemecahan Barang. Excel datar.
 */
const TAMPIL_III_B_13: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'luas', label: 'Luas', angka: true },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'jumlah', label: 'Jumlah / Satuan', tumpuk: ['satuan'] },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'pecahan', label: 'Nama Barang Hasil Pemecahan', baris: true },
  { key: 'catatan', label: 'Catatan Inventarisasi' },
]

/**
 * III.B.8 — Terjadi Perubahan Data (2026-10-01, contoh tabel user): NIBAR lalu
 * tiap atribut sbg pasangan sebelum/sesudah (`dua`). Kode barang TIDAK ikut —
 * perubahan kodefikasi punya laporan sendiri (III.B.12). Excel tidak memakai
 * susunan ini: `barisExcelUbah` (dua baris per barang).
 */
const TAMPIL_III_B_8: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'nibar', label: 'NIBAR', pecah: true },
  ...KOLOM_UBAH.map(k => ({ key: k.key, label: k.label, dua: true })),
  { key: 'catatan', label: 'Catatan' },
]

/** Format → susunan tabel baru. Dibaca `kolomLhiTampil`. */
export const TAMPIL_TETAP: Partial<Record<LhiKode, KolomLhi[]>> = {
  'III.B.1': TAMPIL_III_B_1,
  'III.B.3': TAMPIL_III_B_3,
  'III.B.6': TAMPIL_III_B_6,
  'III.B.8': TAMPIL_III_B_8,
  'III.B.12': TAMPIL_III_B_12,
  'III.B.13': TAMPIL_III_B_13,
}
