// ============================================================================
// Kelengkapan isian satu barang Pengadaan sebelum masuk draft kontrak.
//
// Keputusan user 2026-09-09: **"Tambah ke Draft" hanya boleh menerima barang
// yang isiannya LENGKAP** — kode rekening belanja, kode barang, satuan,
// kuantitas, & harga per item. Sebelum ini yang diperiksa cuma tiga (kode
// barang, kuantitas ≥ 1, harga > 0), jadi barang tanpa **kode rekening** &
// tanpa **satuan** bisa masuk draft lalu ikut disetujui:
//
//   · `rekening` kosong → `draft_items[].rekening` kosong → anggaran kontrak
//     itu tak bisa dijumlahkan per kode rekening, dan `cekWarningRekening`
//     memang sengaja MELEWATI rekening kosong ("kewajibannya ditegakkan
//     validasi form masing-masing pintu") — jadi tak ada satu pun yang
//     berbunyi;
//   · `satuan` kosong → `aset.satuan` NULL saat approve → kolom Satuan hilang
//     di Daftar Barang, KIBAR, & lembar-lembar Permendagri yang mencetaknya.
//
// Keduanya baru ketahuan berbulan kemudian, waktu barangnya sudah terlanjur
// ada di register & memperbaikinya harus lewat Buka Kunci atau menu Koreksi.
//
// ⚠️ Mengembalikan SELURUH kekurangan sekaligus, bukan yang pertama saja.
// Penolakan satu-per-satu memaksa operator menekan tombol lima kali untuk tahu
// lima hal yang kurang — dan tiap penolakan terbaca sebagai kesalahan baru.
//
// ⚠️ Angka diterima SUDAH TERURAI (`toInt`/`toNum` milik formnya), sengaja
// bukan string mentah: yang divalidasi harus angka yang SAMA dengan yang
// nantinya disimpan, bukan hasil penguraian kedua yang bisa berbeda.
// ============================================================================

export type IsianBarangPengadaan = {
  /** Kode rekening belanja sampai Sub Rincian Objek. */
  rekening: string
  /** Kode barang kodefikasi — kosong berarti belum dipilih dari hasil Cari. */
  kode: string
  satuan: string
  /** Hasil `toInt(qty)` di formnya. */
  kuantitas: number
  /** Hasil `toNum(harga)` di formnya. */
  harga: number
}

/** Nama kolom persis seperti yang tertulis di layar — supaya pesannya bisa dituruti. */
export const LABEL_ISIAN_PENGADAAN = {
  rekening: 'Kode Rekening Belanja',
  kode: 'Kode Barang (pilih dari hasil Cari)',
  satuan: 'Satuan',
  kuantitas: 'Kuantitas (minimal 1)',
  harga: 'Harga / item (harus > 0)',
} as const

/** Daftar yang MASIH kurang; kosong = boleh masuk draft. */
export function kekuranganBarangPengadaan(v: IsianBarangPengadaan): string[] {
  const kurang: string[] = []
  if (!v.rekening.trim()) kurang.push(LABEL_ISIAN_PENGADAAN.rekening)
  if (!v.kode.trim()) kurang.push(LABEL_ISIAN_PENGADAAN.kode)
  if (!v.satuan.trim()) kurang.push(LABEL_ISIAN_PENGADAAN.satuan)
  if (!Number.isFinite(v.kuantitas) || v.kuantitas < 1) kurang.push(LABEL_ISIAN_PENGADAAN.kuantitas)
  if (!Number.isFinite(v.harga) || v.harga <= 0) kurang.push(LABEL_ISIAN_PENGADAAN.harga)
  return kurang
}
