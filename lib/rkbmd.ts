// Tipe & konstanta bersama modul RKBMD (Rencana Kebutuhan BMD).
// Dasar hukum: Permendagri 19/2016 jo. 7/2024. Tabel di migrasi
// 20260711_01_rkbmd_foundation.sql. Semua NON-LEDGER (perencanaan T+1).

export type RkbmdJenis =
  | 'pengadaan' | 'pemeliharaan' | 'pemanfaatan' | 'pemindahtanganan' | 'penghapusan'
export type RkbmdStatus = 'draft' | 'diajukan' | 'disetujui' | 'ditolak'
export type RkbmdVersi = 'murni' | 'perubahan'

export const RKBMD_JENIS: { key: RkbmdJenis; label: string; deskripsi: string }[] = [
  { key: 'pengadaan',        label: 'Pengadaan',        deskripsi: 'Kebutuhan barang baru = Standar Kebutuhan − barang eksisting.' },
  { key: 'pemeliharaan',     label: 'Pemeliharaan',     deskripsi: 'Rencana pemeliharaan aset eksisting (kecuali rusak berat / objek pemanfaatan).' },
  { key: 'pemanfaatan',      label: 'Pemanfaatan',      deskripsi: 'Rencana sewa / pinjam pakai / BGS / BSG / KSP / KSPI atas aset.' },
  { key: 'pemindahtanganan', label: 'Pemindahtanganan', deskripsi: 'Rencana penjualan / tukar menukar / hibah / penyertaan modal.' },
  { key: 'penghapusan',      label: 'Penghapusan',      deskripsi: 'Rencana penghapusan aset dari daftar barang.' },
]

export const STATUS_META: Record<RkbmdStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',            cls: 'bg-gray-100 text-gray-600' },
  diajukan:  { label: 'Diajukan',         cls: 'bg-amber-100 text-amber-700' },
  disetujui: { label: 'Disetujui',        cls: 'bg-teal/10 text-teal' },
  ditolak:   { label: 'Ditolak',          cls: 'bg-red-100 text-red-700' },
}

// Bentuk pemanfaatan & pemindahtanganan (lampiran format Permendagri 7/2024).
export const BENTUK_PEMANFAATAN = ['Sewa', 'Pinjam Pakai', 'BGS', 'BSG', 'KSP', 'KSPI']
export const BENTUK_PEMINDAHTANGANAN = ['Penjualan', 'Tukar Menukar', 'Hibah', 'Penyertaan Modal']

/** Kondisi barang yang diusulkan di RKBMD Pemeliharaan (keputusan user
 *  2026-08-10). ⚠️ KEMBAR dengan CHECK `rkbmd_item_kondisi_check` (migrasi
 *  20260810_03) — ubah satu, ubah dua-duanya. Sengaja BEDA dari 5 opsi
 *  `aset.kondisi_barang`: yang ini kondisi yang DIUSULKAN, bukan yang tercatat. */
export const KONDISI_RKBMD = ['Baik', 'Rusak Ringan', 'Rusak Berat']

// ── "Total Nilai" per jenis ────────────────────────────────────────────────
// Kelima jenis RKBMD menjumlahkan hal yang BERBEDA, dan itu bukan sekadar soal
// label: pengadaan & pemeliharaan menjumlahkan RENCANA BELANJA, pemanfaatan
// menjumlahkan RENCANA PENERIMAAN, sedangkan pemindahtanganan & penghapusan
// menjumlahkan NILAI PEROLEHAN barang yang dilepas. Sebelum ini semuanya
// dibaca dari `total_anggaran` saja, sehingga tiga jenis terakhir selalu
// tampil 0 di menu Pelaporan.
//
// ⚠️ SATU SUMBER: dipakai menu Pelaporan DAN halaman cetak. Jangan disalin.
export const LABEL_NILAI: Record<RkbmdJenis, string> = {
  pengadaan: 'Estimasi Total Penganggaran Pengadaan',
  pemeliharaan: 'Estimasi Total Biaya Pemeliharaan',
  pemanfaatan: 'Total Estimasi Pendapatan Pemanfaatan',
  pemindahtanganan: 'Total Nilai Perolehan Barang yang Dipindahtangankan',
  penghapusan: 'Total Nilai Perolehan Barang yang Dihapus',
}

/** Bentuk minimal yang dibutuhkan — bukan `RkbmdItem` utuh, supaya pemanggil
 *  boleh mengambil hanya tiga kolom ini dari DB. */
export type NilaiItem = {
  total_anggaran?: number | null
  estimasi_hasil?: number | null
  nilai_perolehan?: number | null
}

export function nilaiItemRkbmd(jenis: RkbmdJenis | string, it: NilaiItem): number {
  switch (jenis) {
    case 'pengadaan':
    case 'pemeliharaan':
      return it.total_anggaran || 0
    case 'pemanfaatan':
      return it.estimasi_hasil || 0
    case 'pemindahtanganan':
    case 'penghapusan':
      return it.nilai_perolehan || 0
    default:
      return 0
  }
}

export type RkbmdHeader = {
  id: string
  skpd_id: number
  tahun_anggaran: number
  jenis: RkbmdJenis
  versi: RkbmdVersi
  parent_id: string | null
  // ⚠️ program/kegiatan/sub_kegiatan SUDAH TIDAK DI SINI (migrasi 20260810_02).
  // Satu SKPD punya BEBERAPA kartu, satu kartu = satu Sub Kegiatan → tempatnya
  // di `rkbmd_paket`. Jangan dikembalikan ke header: dua rumah untuk satu fakta.
  keterangan: string | null
  status: RkbmdStatus
  catatan_telaah: string | null
  diajukan_at: string | null
  approved_at: string | null
  created_at: string
  /** Lembar usulan bertanda tangan + surat pengantar (satu PDF) di bucket
   *  `dokumen-sumber`. WAJIB terisi sebelum status jadi `diajukan` — penegaknya
   *  trigger `fn_rkbmd_status_guard` (migrasi 20260813_01), bukan UI.
   *  ⚠️ DICABUT OTOMATIS begitu item/kartu dokumen ini berubah (trigger
   *  `fn_rkbmd_lampiran_batal`): berkas bertanda tangan harus selalu cocok
   *  dengan isinya. Kalau saat itu statusnya `diajukan`, ia ikut ditarik
   *  kembali ke `draft`. */
  dokumen_paths: string[]
  /** Diisi/dikosongkan OTOMATIS oleh trigger mengikuti `dokumen_paths` —
   *  jangan diset dari kode. */
  dokumen_diunggah_at: string | null
}

/** Satu kartu = satu Program/Kegiatan/Sub Kegiatan berisi beberapa item barang
 *  (migrasi 20260810_02). Hanya dipakai jenis 'pengadaan'; empat jenis lain
 *  itemnya menempel langsung ke dokumen (`paket_id` NULL). */
export type RkbmdPaket = {
  id: string
  rkbmd_id: string
  no_urut: number | null
  program: string | null
  kegiatan: string | null
  sub_kegiatan: string | null
  keterangan: string | null
}

export type RkbmdItem = {
  id: string
  rkbmd_id: string
  /** Kartu induk. NULL untuk empat jenis RKBMD non-pengadaan. */
  paket_id: string | null
  no_urut: number | null
  // Barang SSH yang jadi dasar item ini (migrasi 20260810_01). RKBMD Pengadaan
  // hanya boleh memakai barang yang terdaftar di SSH; ON DELETE SET NULL supaya
  // baris SSH boleh dihapus tanpa merusak dokumen yang sudah disusun.
  standar_id: number | null
  /** SATU kode rekening yang dipilih dari daftar rekening barang SSH itu. */
  kode_rekening: string | null
  kode: string | null
  nama_barang: string | null
  spesifikasi: string | null
  satuan: string | null
  aset_id: string | null
  nibar: string | null
  jumlah_standar: number | null
  jumlah_eksisting: number | null
  jumlah_kebutuhan: number | null
  harga_satuan: number | null
  total_anggaran: number | null
  nilai_perolehan: number | null
  /** Di-snapshot dari `aset` saat item disusun (migrasi 20260810_03) — jangan
   *  di-join ulang saat cetak, dokumen yang sudah ditandatangani tak boleh
   *  angkanya bergerak mengikuti data hidup. */
  tgl_perolehan: string | null
  /** Rencana PENERIMAAN pemanfaatan (sewa/KSP) — kolom sendiri, sengaja bukan
   *  menumpang `total_anggaran` yang dijumlahkan sbg kebutuhan dana. */
  estimasi_hasil: number | null
  jumlah: number | null
  lokasi: string | null
  kondisi: string | null
  peruntukan: string | null
  bentuk: string | null
  jangka_waktu: string | null
  uraian_pemeliharaan: string | null
  alasan: string | null
  keterangan: string | null
}
