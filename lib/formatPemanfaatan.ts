// ============================================================================
// Format lembar PEMANFAATAN — Laporan Pemanfaatan BMD (Pelaporan → Pengelolaan)
//
// Sumbernya kartu Pemanfaatan (`jurnal_header` kategori `pemanfaatan` + ledger
// `pemanfaatan` / `pemanfaatan_selesai` / `batal_pemanfaatan`) — perjanjian
// sewa / pinjam pakai / KSP / BGS-BSG / KSPI atas barang milik daerah.
//
// ── BENTUK: datar, dikelompokkan per JENIS ASET (2026-10-01) ────────────────
// Susunan kolomnya diserahkan user lewat contoh tabel (15 kolom) dan polanya
// SAMA dgn keluarga Perpindahan/Reklas/Penghapusan/Pengamanan: tabel datar,
// baris kelompok per golongan yang ADA di data ("1.3.3 — Gedung dan Bangunan"),
// "Total <jenis>" per kelompok, ditutup "TOTAL"; NIBAR dapat kolom terbesar &
// huruf 9px; nominal 2 desimal.
//
// ⚠️ **NOMOR FORMAT PERMENDAGRI-NYA BELUM DIKETAHUI** — contoh tabel dari user
// tak memuat kop maupun nomor lembar, dan aplikasi ini tak punya salinan
// gambar resminya. `kode` karena itu DIKOSONGKAN, bukan dikarang: lembar yang
// bertuliskan "Format IV.x" yang keliru lebih berbahaya daripada yang belum
// bernomor, sebab ia ditandatangani lalu dicocokkan pemeriksa. Begitu gambar
// resminya ada, isi `kode` di sini (judul lembar & nama berkas ikut) — tak ada
// tempat lain yang perlu disunting.
//
// ⚠️ Beda dgn Pengamanan: golongannya TIDAK disaring per cabang. Pemanfaatan
// boleh atas Gedung & Bangunan (1.3.3) dan Aset Lain-Lain (1.5.4), plus
// kartu lama atas golongan yang sudah dicabut dari cakupan (Tanah, JIJ —
// keputusan 2026-09-24 tak menyentuh kartu yang sudah ada), jadi satu lembar
// bisa memuat beberapa kelompok.
// ============================================================================

export type KolomPemanfaatan =
  | 'nibar' | 'kode' | 'nama' | 'merek' | 'no_polisi' | 'lokasi' | 'nilai_perolehan'
  | 'jenis' | 'mitra' | 'jangka' | 'mulai' | 'berakhir'
  | 'dok_nomor' | 'dok_tanggal' | 'keterangan'

export type KolomRinciPemanfaatan = {
  key: KolomPemanfaatan
  judul: string
  /** Persen lebar. Totalnya WAJIB 100 persis. */
  lebar: number
  rata: 'kiri' | 'kanan' | 'tengah'
}

export type FormatPemanfaatan = {
  /** Nomor format Permendagri. KOSONG sampai gambar resminya ada — lihat kepala berkas. */
  kode: string
  judul: string
  kolom: KolomRinciPemanfaatan[]
  kosong: string
}

/**
 * Urutan & judul kolom = contoh tabel user (2026-10-01), apa adanya.
 *
 * NIBAR dapat jatah terbesar (11,5%) — potongan 26 digit pertamanya wajib muat
 * sebaris (pola keluarga Perpindahan/Reklas/Penghapusan/Pengamanan). Kolom
 * tanggal `whitespace-nowrap` punya batas bawah keras 4,0%: "13/05/2020"
 * memecah di tengah kalau lebih sempit. Sisanya diberikan ke kolom teks
 * panjang yang menentukan TINGGI baris (nama, lokasi, mitra, keterangan).
 */
export const KOLOM_PEMANFAATAN: KolomRinciPemanfaatan[] = [
  { key: 'nibar', judul: 'NIBAR', lebar: 11.5, rata: 'kiri' },
  { key: 'kode', judul: 'Kode Barang - Uraian Barang', lebar: 8.0, rata: 'kiri' },
  { key: 'nama', judul: 'Nama Barang', lebar: 7.5, rata: 'kiri' },
  { key: 'merek', judul: 'Merk/Tipe', lebar: 5.5, rata: 'kiri' },
  { key: 'no_polisi', judul: 'No Polisi', lebar: 4.5, rata: 'kiri' },
  { key: 'lokasi', judul: 'Lokasi', lebar: 8.0, rata: 'kiri' },
  { key: 'nilai_perolehan', judul: 'Nilai Perolehan', lebar: 7.5, rata: 'kanan' },
  { key: 'jenis', judul: 'Jenis Pemanfaatan', lebar: 7.0, rata: 'kiri' },
  { key: 'mitra', judul: 'Mitra Pemanfaatan', lebar: 7.5, rata: 'kiri' },
  { key: 'jangka', judul: 'Jangka Waktu', lebar: 4.5, rata: 'tengah' },
  { key: 'mulai', judul: 'Mulai', lebar: 4.4, rata: 'tengah' },
  { key: 'berakhir', judul: 'Berakhir', lebar: 4.4, rata: 'tengah' },
  { key: 'dok_nomor', judul: 'No Dokumen Sumber', lebar: 7.0, rata: 'kiri' },
  { key: 'dok_tanggal', judul: 'Tanggal Dokumen Sumber', lebar: 4.7, rata: 'tengah' },
  { key: 'keterangan', judul: 'Keterangan', lebar: 8.0, rata: 'kiri' },
]

export const FORMAT_PEMANFAATAN: FormatPemanfaatan = {
  kode: '',
  judul: 'LAPORAN PEMANFAATAN BARANG MILIK DAERAH',
  kolom: KOLOM_PEMANFAATAN,
  kosong: 'Tidak ada pemanfaatan yang berlaku pada periode ini.',
}
