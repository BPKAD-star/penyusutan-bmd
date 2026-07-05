// Field spesifikasi per golongan aset — dipakai form edit barang (Pengadaan dkk)
// supaya field yang muncul relevan dgn jenis barangnya (Tanah butuh dokumen
// kepemilikan, Peralatan&Mesin butuh nomor rangka/mesin, dst). Kolom di `aset`
// sengaja dibuat nullable lebar (satu tabel utk semua golongan) — laporan
// tinggal SELECT kolom yang relevan per golongan, bukan tabel terpisah per
// jenis aset. FieldKey = nama kolom DB persis (1:1) — jaga tetap sinkron kalau
// ada rename kolom lagi di migrasi.
import { kodeLevel3 } from '@/lib/bmd'

export type FieldKey =
  | 'nama_barang' | 'spesifikasi_lainnya' | 'merek_tipe' | 'no_polisi' | 'no_bpkb' | 'no_rangka' | 'no_mesin'
  | 'luas' | 'nomor_dokumen_kepemilikan' | 'tanggal_dokumen_kepemilikan' | 'nama_dokumen_kepemilikan' | 'jenis_hak'
  | 'wilayah_kode' | 'alamat_detail' | 'latitude' | 'longitude' | 'keterangan'

export const FIELD_LABEL: Record<FieldKey, string> = {
  nama_barang: 'Spesifikasi Nama Barang',
  spesifikasi_lainnya: 'Spesifikasi Lainnya',
  merek_tipe: 'Merek / Tipe',
  no_polisi: 'Nomor Polisi',
  no_bpkb: 'Nomor BPKB',
  no_rangka: 'Nomor Rangka',
  no_mesin: 'Nomor Mesin',
  luas: 'Luas',
  nomor_dokumen_kepemilikan: 'Nomor Dokumen Kepemilikan',
  tanggal_dokumen_kepemilikan: 'Tanggal Dokumen Kepemilikan',
  nama_dokumen_kepemilikan: 'Nama Dokumen Kepemilikan',
  jenis_hak: 'Jenis Hak',
  wilayah_kode: 'Provinsi / Kab. / Kec. / Desa',
  alamat_detail: 'Detail Alamat (Jalan)',
  latitude: 'Latitude',
  longitude: 'Longitude',
  keterangan: 'Keterangan',
}

// Tipe field khusus — 'select' butuh FIELD_OPTIONS; 'wilayah' & 'latlong' dirender
// widget khusus (WilayahPicker / MapPicker) oleh EditSpesifikasiModal, bukan
// <input> generik. 'longitude' TIDAK dirender sendiri — selalu digabung dgn
// 'latitude' jadi satu widget MapPicker (taruh 'latitude' & 'longitude' berurutan
// di GOLONGAN_FIELDS).
export const FIELD_TYPE: Partial<Record<FieldKey, 'date' | 'number' | 'textarea' | 'select' | 'wilayah' | 'latlong'>> = {
  tanggal_dokumen_kepemilikan: 'date',
  luas: 'number',
  jenis_hak: 'select',
  wilayah_kode: 'wilayah',
  latitude: 'latlong',
  keterangan: 'textarea',
}

export const FIELD_OPTIONS: Partial<Record<FieldKey, string[]>> = {
  // BMD milik pemda — tidak ada "Hak Milik" (itu utk perseorangan). "Sengketa"
  // = status lahan bermasalah/red zone, ditambahkan atas permintaan user.
  jenis_hak: ['Hak Pengelolaan', 'Hak Pakai', 'Hak Guna Usaha', 'Hak Guna Bangunan', 'Lainnya', 'Sengketa'],
}

// ── 3 template field, dipetakan ke 8 golongan (lib/bmd GOLONGAN_REKAP) ──────
// TANAH-like: Tanah, Gedung&Bangunan, Jalan/Jaringan/Irigasi (semua bisa py
// dokumen kepemilikan lahan + titik lokasi).
const TEMPLATE_TANAH: FieldKey[] = [
  'nama_barang', 'spesifikasi_lainnya', 'jenis_hak', 'luas',
  'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'keterangan',
]
// PERALATAN & MESIN: kendaraan dkk (nomor rangka/mesin/polisi/BPKB) + lokasi.
const TEMPLATE_PERALATAN_MESIN: FieldKey[] = [
  'nama_barang', 'merek_tipe', 'no_bpkb', 'no_rangka', 'no_mesin', 'no_polisi', 'spesifikasi_lainnya',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'keterangan',
]
// ASET LAINNYA-like: Aset Tetap Lainnya, KDP, ATB, Aset Lain-Lain — sama seperti
// Peralatan&Mesin tanpa nomor kendaraan.
const TEMPLATE_ASET_LAINNYA: FieldKey[] = [
  'nama_barang', 'merek_tipe', 'spesifikasi_lainnya', 'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'keterangan',
]

// Golongan level-3 (dari kodeLevel3) → field yang relevan, urut tampil.
export const GOLONGAN_FIELDS: Record<string, FieldKey[]> = {
  '1.3.1': TEMPLATE_TANAH,             // Tanah
  '1.3.2': TEMPLATE_PERALATAN_MESIN,   // Peralatan dan Mesin
  '1.3.3': TEMPLATE_TANAH,             // Gedung dan Bangunan
  '1.3.4': TEMPLATE_TANAH,             // Jalan, Jaringan dan Irigasi
  '1.3.5': TEMPLATE_ASET_LAINNYA,      // Aset Tetap Lainnya
  '1.3.6': TEMPLATE_ASET_LAINNYA,      // Konstruksi Dalam Pengerjaan
  '1.5.3': TEMPLATE_ASET_LAINNYA,      // Aset Tidak Berwujud
  '1.5.4': TEMPLATE_ASET_LAINNYA,      // Aset Lain-Lain
}
export const DEFAULT_FIELDS: FieldKey[] = TEMPLATE_ASET_LAINNYA

export function fieldsForKode(kode: string): FieldKey[] {
  return GOLONGAN_FIELDS[kodeLevel3(kode)] || DEFAULT_FIELDS
}

// Semua kode golongan sama? Dipakai utk MELARANG edit spesifikasi massal lintas
// golongan (field-nya beda kolom → tak boleh digabung/union spt sebelumnya).
export function allSameGolongan(kodes: string[]): boolean {
  if (kodes.length === 0) return true
  const g0 = kodeLevel3(kodes[0])
  return kodes.every(k => kodeLevel3(k) === g0)
}
