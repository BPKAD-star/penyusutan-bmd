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
  | 'wilayah_kode' | 'alamat_detail' | 'latitude' | 'longitude' | 'penggunaan_pengamanan' | 'keterangan'
  | 'satuan' | 'asal_usul' | 'tahun_pengadaan' | 'kondisi_barang'

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
  penggunaan_pengamanan: 'Penggunaan',
  keterangan: 'Keterangan',
  // Atribut tambahan — dipakai menu Koreksi Spesifikasi (ATRIBUT_KOREKSI).
  // KECUALI `kondisi_barang`, yang sejak 2026-08-04 juga masuk ketiga template
  // golongan → ikut muncul di form input awal (Pengadaan/Hibah dst).
  satuan: 'Satuan',
  asal_usul: 'Asal Usul',
  tahun_pengadaan: 'Tahun Pengadaan',
  kondisi_barang: 'Kondisi Barang',
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
  tahun_pengadaan: 'number',
  kondisi_barang: 'select',
}

export const FIELD_OPTIONS: Partial<Record<FieldKey, string[]>> = {
  // BMD milik pemda — tidak ada "Hak Milik" (itu utk perseorangan). "Sengketa"
  // = status lahan bermasalah/red zone, ditambahkan atas permintaan user.
  jenis_hak: ['Hak Pengelolaan', 'Hak Pakai', 'Hak Guna Usaha', 'Hak Guna Bangunan', 'Lainnya', 'Sengketa'],
  kondisi_barang: ['Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang', 'Tidak Ditemukan'],
}

// ── 3 template field, dipetakan ke 8 golongan (lib/bmd GOLONGAN_REKAP) ──────
// TANAH-like: Tanah, Gedung&Bangunan, Jalan/Jaringan/Irigasi (semua bisa py
// dokumen kepemilikan lahan + titik lokasi).
// ⚠️ `kondisi_barang` ada di KETIGA template, tepat sebelum Penggunaan &
// Keterangan (permintaan user 2026-08-04) — kondisi fisik itu atribut universal,
// bukan milik satu golongan. Ia juga masih terdaftar di ATRIBUT_KOREKSI; tak
// dobel karena koreksiFieldKeys() menyaring yang sudah ada.
const TEMPLATE_TANAH: FieldKey[] = [
  'nama_barang', 'spesifikasi_lainnya', 'jenis_hak', 'luas',
  'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan',
]
// PERALATAN & MESIN: kendaraan dkk (nomor rangka/mesin/polisi/BPKB) + lokasi.
const TEMPLATE_PERALATAN_MESIN: FieldKey[] = [
  'nama_barang', 'merek_tipe', 'no_bpkb', 'no_rangka', 'no_mesin', 'no_polisi', 'spesifikasi_lainnya',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan',
]
// ASET LAINNYA-like: Aset Tetap Lainnya, KDP, ATB, Aset Lain-Lain — sama seperti
// Peralatan&Mesin tanpa nomor kendaraan.
const TEMPLATE_ASET_LAINNYA: FieldKey[] = [
  'nama_barang', 'merek_tipe', 'spesifikasi_lainnya', 'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan',
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

// ── Field set untuk KOREKSI spesifikasi (bukan form input awal) ─────────────
// Dipakai bareng oleh menu Koreksi → Spesifikasi Barang (register `aset`) dan
// Saldo Awal → Daftar Barang Awal (snapshot `aset_awal_2026`), supaya kedua
// pintu koreksi menawarkan field yang PERSIS SAMA — termasuk pengecualian
// Tanah di bawah. Kalau ditaruh lokal di salah satu komponen, yang satunya
// bakal pelan-pelan menyimpang.
//
// Tanah (1.3.1): dokumen kepemilikan, jenis hak, luas & lokasi/koordinat TIDAK
// diedit di sini — dikelola khusus di menu GIS BMD (aset_bidang_tanah), biar
// gak ada 2 sumber. Golongan lain (termasuk Gedung/Jalan) boleh koreksi
// dokumen & lokasi.
export const TANAH_GIS_FIELDS: FieldKey[] = ['jenis_hak', 'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'wilayah_kode', 'alamat_detail', 'latitude', 'longitude']
// PENGECUALIAN dari pengecualian (2026-07-28): Tanah yang BELUM punya satu pun
// baris di `aset_bidang_tanah` boleh diisi luas & lokasinya dari pintu koreksi.
// Alasannya praktis: kalau tidak, luas/lokasi tanah warisan baseline e-BMD tak
// bisa diisi dari mana pun kecuali operator membuat bidang di GIS — padahal
// banyak tanah yang memang cuma satu hamparan tanpa rincian per sertifikat.
// Aturan "gak ada 2 sumber" tetap utuh karena syaratnya BELUM ADA BIDANG: begitu
// bidang pertama dibuat, GIS yang menang & field ini hilang lagi dari popup
// (tampilan luas ikut jadi Σ bidang). Dokumen kepemilikan, jenis hak & koordinat
// TETAP di GIS apa pun keadaannya — itu melekat per sertifikat/bidang, bukan per
// register; koordinat juga tak masuk akal dipukul rata satu titik.
export const TANAH_TANPA_BIDANG_FIELDS: FieldKey[] = ['luas', 'wilayah_kode', 'alamat_detail']
export const ATRIBUT_KOREKSI: FieldKey[] = ['satuan', 'asal_usul', 'tahun_pengadaan', 'kondisi_barang']
// Aset Lain-Lain (1.5.4) isinya campuran — ada yg mirip Tanah (butuh dokumen
// kepemilikan/jenis hak/luas), ada yg mirip kendaraan Peralatan & Mesin (butuh
// no rangka/mesin/polisi/BPKB). Field templatenya sendiri (TEMPLATE_ASET_LAINNYA
// di atas, dipakai bareng Pengadaan) SENGAJA tetap ringkas — field tambahan ini
// HANYA muncul di form koreksi, bukan di form input awal Pengadaan.
export const ASET_LAIN_LAIN_EXTRA: FieldKey[] = ['jenis_hak', 'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'no_bpkb', 'no_rangka', 'no_mesin', 'no_polisi']

// opts.tanahTanpaBidang — SEMUA aset yang dicentang bergolongan Tanah & belum
// punya bidang di aset_bidang_tanah. Pemanggil yang tak tahu (mis. menu Koreksi
// yang tak menghitung bidang) cukup tidak mengisinya → perilaku lama, luas &
// lokasi Tanah tetap tertutup. Fail-closed, bukan fail-open.
export function koreksiFieldKeys(kode: string, opts: { tanahTanpaBidang?: boolean } = {}): FieldKey[] {
  let keys = fieldsForKode(kode)
  if (kodeLevel3(kode) === '1.3.1') {
    const buang = opts.tanahTanpaBidang
      ? TANAH_GIS_FIELDS.filter(k => !TANAH_TANPA_BIDANG_FIELDS.includes(k))
      : TANAH_GIS_FIELDS
    keys = keys.filter(k => !buang.includes(k))
  }
  else if (kodeLevel3(kode) === '1.5.4') keys = [...keys, ...ASET_LAIN_LAIN_EXTRA.filter(k => !keys.includes(k))]
  return [...keys, ...ATRIBUT_KOREKSI.filter(k => !keys.includes(k))]
}

// Semua kode golongan sama? Dipakai utk MELARANG edit spesifikasi massal lintas
// golongan (field-nya beda kolom → tak boleh digabung/union spt sebelumnya).
export function allSameGolongan(kodes: string[]): boolean {
  if (kodes.length === 0) return true
  const g0 = kodeLevel3(kodes[0])
  return kodes.every(k => kodeLevel3(k) === g0)
}

// Kolom `aset` yang diisi lewat popup Edit Spesifikasi (union semua template) —
// dipakai saat materialize draft → aset (Pengadaan & PerolehanManual).
// ⚠️ WAJIB memuat SEMUA key yang ada di template golongan — kolom yang lupa
// didaftarkan di sini akan tetap muncul di popup & tersimpan di draft, tapi
// DIAM-DIAM hilang saat draft di-materialize ke `aset` (approve). Itu yang
// membuat `kondisi_barang` ikut ditambahkan bersamaan dgn masuknya ia ke ketiga
// template. Nilainya tunduk CHECK `aset_kondisi_barang_check` (5 opsi, migrasi
// 20260709_04) — sama persis dgn FIELD_OPTIONS.kondisi_barang di atas.
export const ASET_FIELD_COLS = ['nama_barang', 'spesifikasi_lainnya', 'merek_tipe', 'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin',
  'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'jenis_hak',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan'] as const
// Kolom spesifikasi yang bertipe numeric di DB → di-cast toNum saat materialize.
export const ASET_NUM_COLS = new Set(['luas', 'latitude', 'longitude'])
