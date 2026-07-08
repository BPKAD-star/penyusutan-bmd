// Konfigurasi 11 siklus BMD utk halaman Dokumen Sumber (app/dashboard/dokumen-sumber).
// Single source of truth: UI meng-iterate dari sini, bukan hardcode per-card,
// supaya nambah/ubah siklus nanti tinggal edit file ini.
//
// Tiga jenis "sumber" per siklus:
//   - pull_*   : dokumen SUDAH ada di modul lain (Pengadaan/Pengalihan Status/
//                Penghapusan) — dibaca read-only dari jurnal_header.payload.
//                dokumen_paths, TIDAK disalin ke tabel dokumen_siklus.
//   - generic  : belum ada modul/penyimpanan sendiri — upload baru ke tabel
//                dokumen_siklus (lihat migrasi 20260710_01_dokumen_siklus.sql).
//                scope 'global' = kabupaten-wide (skpd_id NULL, hanya Super
//                Admin/BKAD yang boleh upload); scope 'per_skpd' = terikat SKPD
//                (hanya siklus Pengamanan — admin SKPD induk boleh upload utk
//                subtree sendiri, ditegakkan RLS fn_skpd_admin_induk()).
//   - kosong   : belum ada dokumen/modul sama sekali, placeholder saja.

export type SumberDokumen =
  | { tipe: 'pull_pengadaan' | 'pull_pengalihan' | 'pull_penghapusan'; label: string }
  | {
      tipe: 'generic'
      label: string
      scope: 'global' | 'per_skpd'
      dbSiklus: string // harus cocok dgn CHECK constraint dokumen_siklus.siklus
      subJenisOptions?: { value: string; label: string }[]
    }
  | { tipe: 'kosong'; label: string }

export type SiklusConfig = { key: string; label: string; sumber: SumberDokumen[] }

export const PEMINDAHTANGANAN_SUBJENIS = [
  { value: 'hibah', label: 'Hibah' },
  { value: 'penjualan', label: 'Penjualan' },
  { value: 'tukar_menukar', label: 'Tukar-Menukar' },
  { value: 'penyertaan_modal', label: 'Penyertaan Modal Pemerintah' },
]

export const DAFTAR_SIKLUS: SiklusConfig[] = [
  {
    key: 'perencanaan_kebutuhan', label: 'Perencanaan Kebutuhan',
    sumber: [{ tipe: 'generic', label: 'SK RKBMD & SK Perubahan RKBMD', scope: 'global', dbSiklus: 'perencanaan_kebutuhan' }],
  },
  {
    key: 'pengadaan', label: 'Pengadaan',
    sumber: [{ tipe: 'pull_pengadaan', label: 'BAST Pengadaan (ditarik dari kontrak yang disetujui)' }],
  },
  {
    key: 'penggunaan', label: 'Penggunaan',
    sumber: [
      { tipe: 'generic', label: 'SK Penetapan Status Penggunaan', scope: 'global', dbSiklus: 'penggunaan_sk_penetapan' },
      { tipe: 'pull_pengalihan', label: 'Berita Acara Pengalihan Status Penggunaan (per SKPD)' },
    ],
  },
  {
    key: 'pemanfaatan', label: 'Pemanfaatan',
    sumber: [{ tipe: 'generic', label: 'Dokumen Perjanjian', scope: 'global', dbSiklus: 'pemanfaatan' }],
  },
  {
    key: 'penilaian', label: 'Penilaian',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
  {
    key: 'pengamanan', label: 'Pengamanan',
    sumber: [{ tipe: 'generic', label: 'BAST & Pakta Integritas per SKPD', scope: 'per_skpd', dbSiklus: 'pengamanan' }],
  },
  {
    key: 'penatausahaan', label: 'Penatausahaan',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
  {
    key: 'pemindahtanganan', label: 'Pemindahtanganan',
    sumber: [{
      tipe: 'generic', label: 'Hibah / Penjualan / Tukar Menukar / Penyertaan Modal',
      scope: 'global', dbSiklus: 'pemindahtanganan', subJenisOptions: PEMINDAHTANGANAN_SUBJENIS,
    }],
  },
  {
    key: 'pemusnahan', label: 'Pemusnahan',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
  {
    key: 'penghapusan', label: 'Penghapusan',
    sumber: [{ tipe: 'pull_penghapusan', label: 'SK Penghapusan (ditarik dari jurnal Penghapusan)' }],
  },
  {
    key: 'pengawasan_pengendalian', label: 'Pengawasan dan Pengendalian',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
]
