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

export type RkbmdHeader = {
  id: string
  skpd_id: number
  tahun_anggaran: number
  jenis: RkbmdJenis
  versi: RkbmdVersi
  parent_id: string | null
  program: string | null
  kegiatan: string | null
  keterangan: string | null
  status: RkbmdStatus
  catatan_telaah: string | null
  diajukan_at: string | null
  approved_at: string | null
  created_at: string
}

export type RkbmdItem = {
  id: string
  rkbmd_id: string
  no_urut: number | null
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
