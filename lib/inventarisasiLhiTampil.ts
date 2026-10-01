// Susunan kolom tabel LHI yang DILIHAT (layar & cetak) untuk format yang sudah
// memakai bentuk tabel baru dari contoh user (2026-10-01): III.B.1, 2, 3, 4, 6, 7, 8, 12, 13
// (+ III.B.11 sejak 2026-10-02, bergantung golongan — `kolomBelumTercatat`).
// Dipisah dari inventarisasiLaporan.ts supaya berkas itu tak membengkak. Excel TIDAK
// memakai susunan ini — ia tetap datar lewat `kolomLhi()` (satu kolom per data).
//
// Format yang tak terdaftar di `TAMPIL_TETAP` memakai bentuk lama (`kolomLhi`/`kolomLhiCetak`).
import type { KolomLhi } from '@/lib/inventarisasiLaporan'
import type { LhiKode } from '@/lib/inventarisasi'
import { KOLOM_UBAH } from '@/lib/inventarisasiLhiUbah'
import { fieldBaru } from '@/lib/inventarisasiBaru'

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
 * III.B.4 — BMD Belum Dikapitalisasi dan Tidak Diketahui Data Awal/Induknya
 * (2026-10-02). Saudara III.B.3 (yang induknya diketahui): susunannya SAMA tanpa blok
 * "Data Awal Induk" — justru itu yang tak diketahui — dan kolom penutupnya Catatan
 * Inventarisasi. Tanpa contoh tabel dari user; mengikuti III.B.3. Excel datar.
 */
const TAMPIL_III_B_4: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'catatan', label: 'Catatan Inventarisasi' },
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
 * III.B.2 — BMD Tidak Ada Karena Tidak Diketemukan (2026-10-01, contoh tabel user):
 * sama dgn III.B.1 + kolom "Alasan Tidak Ada" ("Force majeure : <cerita>", atau
 * bangunan pengganti / induk). Kosong utk golongan yang tak menanyakan sebab &
 * lembar lama. Excel datar (`kolomLhi`).
 */
const TAMPIL_III_B_2: KolomLhi[] = [
  ...TAMPIL_III_B_1.slice(0, -1),
  { key: 'alasan', label: 'Alasan Tidak Ada' },
  TAMPIL_III_B_1[TAMPIL_III_B_1.length - 1],
]

/**
 * III.B.7 — Terjadi Perubahan Kondisi Fisik Barang (2026-10-01, contoh tabel user):
 * identitas barang (sama dgn III.B.1) + Kondisi Fisik Sebelum / Setelah Inventarisasi
 * dgn KATA PENUH ("Baik", "Rusak Berat"), bukan B/RR/RB, dan petak centang lama
 * dicabut. Excel datar.
 */
const TAMPIL_III_B_7: KolomLhi[] = [
  ...TAMPIL_III_B_1.slice(0, -1),
  { key: 'kondisi_sebelum', label: 'Kondisi Fisik Sebelum Inventarisasi' },
  { key: 'kondisi_setelah', label: 'Kondisi Fisik Setelah Inventarisasi' },
  TAMPIL_III_B_1[TAMPIL_III_B_1.length - 1],
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

/**
 * III.B.11 — BMD Belum Tercatat (2026-10-02). Isinya = isian form LKI III.A.7
 * (components/inventarisasi/BelumTercatatForm), jadi kolom spesifikasinya IKUT
 * GOLONGAN lewat `fieldBaru` yang sama dgn form: laporan Peralatan & Mesin memuat
 * No Polisi/Rangka/Mesin/BPKB, laporan Tanah memuat Luas & dokumen kepemilikan,
 * dst. Tanpa NIBAR (barangnya belum ada di register). `tumpuk` true = layar &
 * cetak (kode/uraian & jumlah/satuan ditumpuk); false = Excel datar.
 * Pola sama dgn III.B.1/3/6/8: nama & spesifikasi lengkap, alamat Provinsi→Desa
 * + detail, "Catatan Inventarisasi" di ujung, petak centang kondisi DICABUT
 * (kata penuh "Baik"/"Rusak Berat").
 */
export const GRUP_DOK_KEPEMILIKAN = 'Dokumen Kepemilikan'
export function kolomBelumTercatat(golongan: string, tumpuk: boolean): KolomLhi[] {
  const ada = new Set(fieldBaru(golongan))
  const kolom: KolomLhi[] = [
    { key: 'no', label: 'No' },
    ...(tumpuk
      ? [{ key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] }]
      : [{ key: 'kode', label: 'Kode Barang' }, { key: 'uraian', label: 'Uraian Barang' }]),
    { key: 'nama', label: 'Spesifikasi Nama Barang' },
  ]
  const opsi = (k: Parameters<typeof ada.has>[0], c: KolomLhi) => { if (ada.has(k)) kolom.push(c) }
  opsi('merek_tipe', { key: 'merek_tipe', label: 'Merk/Tipe' })
  opsi('spesifikasi_lainnya', { key: 'spek_lain', label: 'Spesifikasi Lainnya' })
  opsi('no_polisi', { key: 'no_polisi', label: 'No Polisi' })
  opsi('no_rangka', { key: 'no_rangka', label: 'No Rangka' })
  opsi('no_mesin', { key: 'no_mesin', label: 'No Mesin' })
  opsi('no_bpkb', { key: 'no_bpkb', label: 'No BPKB' })
  kolom.push({ key: 'tgl', label: 'Tanggal Perolehan', angka: true })
  kolom.push(tumpuk
    ? { key: 'jumlah', label: 'Jumlah / Satuan', tumpuk: ['satuan'] }
    : { key: 'jumlah', label: 'Jumlah', angka: true })
  if (!tumpuk) kolom.push({ key: 'satuan', label: 'Satuan' })
  kolom.push({ key: 'harga_satuan', label: 'Nilai per Item', angka: true })
  kolom.push({ key: 'nilai', label: 'Nilai Perolehan', angka: true })
  opsi('wilayah_kode', { key: 'alamat', label: 'Alamat' })
  opsi('latitude', { key: 'titik', label: 'Titik Koordinat' })
  opsi('kondisi_barang', { key: 'kondisi', label: 'Kondisi' })
  opsi('penggunaan_pengamanan', { key: 'penggunaan', label: 'Penggunaan' })
  opsi('keterangan', { key: 'keterangan', label: 'Keterangan' })
  opsi('luas', { key: 'luas', label: 'Luas', angka: true })
  opsi('jenis_hak', { key: 'jenis_hak', label: 'Jenis Hak' })
  if (ada.has('nomor_dokumen_kepemilikan')) {
    kolom.push(
      { key: 'dok_nomor', label: 'Nomor', grup: GRUP_DOK_KEPEMILIKAN },
      { key: 'dok_tgl', label: 'Tanggal', grup: GRUP_DOK_KEPEMILIKAN },
      { key: 'dok_nama', label: 'Nama Dokumen', grup: GRUP_DOK_KEPEMILIKAN },
    )
  }
  opsi('asal_usul', { key: 'asal_usul', label: 'Asal Usul' })
  kolom.push({ key: 'catatan', label: 'Catatan Inventarisasi' })
  return kolom
}

/** Format → susunan tabel baru. Dibaca `kolomLhiTampil`. */
export const TAMPIL_TETAP: Partial<Record<LhiKode, KolomLhi[]>> = {
  'III.B.1': TAMPIL_III_B_1,
  'III.B.2': TAMPIL_III_B_2,
  'III.B.3': TAMPIL_III_B_3,
  'III.B.4': TAMPIL_III_B_4,
  'III.B.6': TAMPIL_III_B_6,
  'III.B.7': TAMPIL_III_B_7,
  'III.B.8': TAMPIL_III_B_8,
  'III.B.12': TAMPIL_III_B_12,
  'III.B.13': TAMPIL_III_B_13,
}
