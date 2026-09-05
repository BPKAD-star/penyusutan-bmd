// Konfigurasi 11 siklus BMD utk halaman Dokumen Sumber (app/dashboard/dokumen-sumber).
// Single source of truth: UI meng-iterate dari sini, bukan hardcode per-card,
// supaya nambah/ubah siklus nanti tinggal edit file ini.
//
// Tiga jenis "sumber" per siklus:
//   - pull     : dokumen SUDAH ada di modul lain (kelima menu Cara Perolehan/
//                Pengalihan Status/Penghapusan) — dibaca read-only dari
//                jurnal_header.payload.dokumen_paths, TIDAK disalin ke tabel
//                admin_dokumen. `kategori` = jurnal_header.kategori persis.
//                `perluApproval` (bawaan false): kalau true, hanya baris
//                `approval_status='disetujui'` yang ditarik — dipakai kelima
//                menu Cara Perolehan (draft-nya belum tentu jadi, dan
//                dokumen_paths-nya bisa masih berubah sebelum disetujui).
//                Kategori yang tak punya alur approval (mis. Penghapusan)
//                default 'disetujui' di DB sendiri, jadi filternya aman
//                dihilangkan tapi tak wajib.
//   - generic  : belum ada modul/penyimpanan sendiri — upload baru ke tabel
//                admin_dokumen (lihat migrasi 20260710_01_dokumen_siklus.sql,
//                di-rename dari dokumen_siklus oleh migrasi 20260710_02).
//                scope 'global' = kabupaten-wide (skpd_id NULL, hanya Super
//                Admin/BKAD yang boleh upload); scope 'per_skpd' = terikat SKPD
//                (hanya siklus Pengamanan — admin SKPD induk boleh upload utk
//                subtree sendiri, ditegakkan RLS fn_skpd_admin_induk()).
//   - kosong   : belum ada dokumen/modul sama sekali, placeholder saja.
//
// ⚠️ SIAPA LIHAT APA di setiap `pull`/`generic` scope 'per_skpd': DITENTUKAN
// RLS `jurnal_header`/`admin_dokumen`, BUKAN kode di sini — `jh_select`
// (migrasi 20260704_07) `USING (fn_is_admin() OR fn_skpd_visible(skpd_id))`.
// `fn_skpd_visible` = `s.path <@ fn_my_skpd_path()` (subtree, migrasi
// 20260702_01/20260714_04): Pengurus Barang cuma lihat SKPD sendiri + sub-unit
// di bawahnya; admin (`fn_is_admin()`) lihat SEMUA SKPD, di SEMUA siklus di
// halaman ini sekaligus — policy-nya satu, berlaku ke tiap kategori tanpa
// perlu diulang per menu.
export type SumberDokumen =
  | { tipe: 'pull'; kategori: string; label: string; perluApproval?: boolean }
  | {
      tipe: 'generic'
      label: string
      scope: 'global' | 'per_skpd'
      dbSiklus: string // harus cocok dgn CHECK constraint admin_dokumen.siklus
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
    // ⚠️ Sebelum ini cuma "Pengadaan" — Hibah/Tukar Menukar/Hasil
    // Inventarisasi/Perolehan Lainnya tak punya muara di sini sama sekali
    // (permintaan user 2026-09-05), padahal kelimanya sekarang SAMA-SAMA
    // mewajibkan dokumen BAST diunggah sebelum disetujui (lihat CLAUDE.md
    // "dokumen BAST wajib PER TERMIN..." dst.). `kategori` di baris-baris di
    // bawah harus kembar dgn `KategoriPerolehan` (PerolehanManual.tsx) & jenis
    // literal Pengadaan.tsx — beda ejaan berarti kartunya selalu kosong tanpa
    // satu pun error.
    key: 'cara_perolehan', label: 'Cara Perolehan',
    sumber: [
      { tipe: 'pull', kategori: 'pengadaan', label: 'BAST Pengadaan (ditarik dari kontrak yang disetujui)', perluApproval: true },
      { tipe: 'pull', kategori: 'hibah_masuk', label: 'BAST Hibah (ditarik dari dokumen yang disetujui)', perluApproval: true },
      { tipe: 'pull', kategori: 'tukar_menukar', label: 'BAST Tukar Menukar (ditarik dari dokumen yang disetujui)', perluApproval: true },
      { tipe: 'pull', kategori: 'hasil_inventarisasi', label: 'BAST Hasil Inventarisasi (ditarik dari dokumen yang disetujui)', perluApproval: true },
      { tipe: 'pull', kategori: 'perolehan_lainnya', label: 'BAST Perolehan Lainnya (ditarik dari dokumen yang disetujui)', perluApproval: true },
    ],
  },
  {
    key: 'penggunaan', label: 'Penggunaan',
    sumber: [
      { tipe: 'generic', label: 'SK Penetapan Status Penggunaan', scope: 'global', dbSiklus: 'penggunaan_sk_penetapan' },
      { tipe: 'pull', kategori: 'pengalihan_status', label: 'Berita Acara Pengalihan Status Penggunaan (per SKPD)' },
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
    // Satu kategori ledger (`penghapusan`) memuat DUA jenis sekaligus —
    // `penghapusan_pemindahtanganan` (sub_jenis hibah/penjualan/tukar_menukar/
    // penyertaan_modal) & `penghapusan_sebab_lain`. PullSection menampilkan
    // badge jenis/sub_jenis per baris (dibaca dari jurnal_header, BUKAN
    // payload — lihat CLAUDE.md "sub_jenis dibaca dari payload KOSONG")
    // supaya SK mana karena apa tetap terlihat tanpa membuka berkasnya.
    sumber: [{ tipe: 'pull', kategori: 'penghapusan', label: 'SK Penghapusan (ditarik dari jurnal Penghapusan)' }],
  },
  {
    key: 'pengawasan_pengendalian', label: 'Pengawasan dan Pengendalian',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
]
