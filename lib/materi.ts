// Daftar MATERI PAPARAN Bidang Pengelolaan BMD (permintaan user 2026-09-30) —
// bagian ketiga halaman Dokumen Sumber, sesudah Peraturan & Siklus.
//
// Materinya BUKAN berkas unggahan: tiap paparan adalah halaman di aplikasi ini
// sendiri (`/materi/<slug>`), dibangun sbg komponen React ber-animasi, dan bisa
// dicetak jadi PDF 16:9 dari tombol "Export PDF" di layarnya. Jadi menambah
// materi baru = (1) satu entri di sini, (2) satu komponen slide di
// components/materi/, (3) didaftarkan di `ISI_MATERI`
// (components/materi/isiMateri.tsx) — dikunci lib/materi.test.ts supaya entri
// tanpa isinya (kotak yang diklik lalu 404) tak bisa lolos.
//
// Berkas ini SENGAJA murni data (tanpa JSX): dipakai halaman Dokumen Sumber
// untuk menggambar kotaknya tanpa ikut memuat seluruh isi slide.

export type MateriConfig = {
  slug: string
  judul: string
  ringkas: string
  /** Tanggal materi disusun (YYYY-MM-DD) — tampil di kotaknya. */
  tanggal: string
  jumlahSlide: number
}

export const DAFTAR_MATERI: MateriConfig[] = [
  {
    slug: 'perkenalan-smart-asset',
    judul: 'Perkenalan Aplikasi SMART Asset',
    ringkas: 'Fitur aplikasi, apa saja yang bisa dikerjakan, dan kelengkapan data yang perlu dicek pengurus barang.',
    tanggal: '2026-10-04',
    jumlahSlide: 29,
  },
  {
    slug: 'entry-belanja-modal-pengadaan',
    judul: 'Entry Belanja Modal: Cara Perolehan › Pengadaan',
    ringkas: 'Entry Pengadaan Non Konstruksi dan Pekerjaan Konstruksi — BAST dan foto wajib diunggah, ketelitian memilih kodefikasi BMD, dan pencocokan dengan LRA.',
    tanggal: '2026-10-06',
    jumlahSlide: 22,
  },
]

export const cariMateri = (slug: string): MateriConfig | undefined =>
  DAFTAR_MATERI.find(m => m.slug === slug)
