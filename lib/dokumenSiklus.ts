// Konfigurasi 12 siklus BMD utk halaman Dokumen Sumber (app/dashboard/dokumen-sumber) —
// 11 siklus resmi Permendagri 47 + "SK Pengelolaan BMD" (wadah SK di luar itu, mis. SK
// Pengurus Barang).
// Single source of truth: UI meng-iterate dari sini, bukan hardcode per-card,
// supaya nambah/ubah siklus nanti tinggal edit file ini.
//
// Tiga jenis "sumber" per siklus:
//   - pull     : dokumen SUDAH ada di modul lain — dibaca read-only dari
//                `jurnal_header.payload`, TIDAK disalin ke tabel admin_dokumen.
//                Isinya satu atau beberapa `kelompok`; kalau lebih dari satu,
//                halaman menampilkannya sbg TAB PENYARING di atas daftar
//                (permintaan user 2026-09-07). Di bawah penyaring itu barisnya
//                dikelompokkan PER SKPD.
//   - generic  : belum ada modul/penyimpanan sendiri — upload baru ke tabel
//                admin_dokumen (lihat migrasi 20260710_01_dokumen_siklus.sql,
//                di-rename dari dokumen_siklus oleh migrasi 20260710_02).
//                scope 'global' = kabupaten-wide (skpd_id NULL, hanya Super
//                Admin/BKAD yang boleh upload); scope 'per_skpd' = terikat SKPD
//                (admin SKPD induk boleh upload utk subtree sendiri, ditegakkan
//                RLS fn_skpd_admin_induk()).
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

/** Bentuk minimal baris `jurnal_header` yang dibutuhkan penyaring `cocok`. */
export type BarisHeader = {
  jenis: string | null
  sub_jenis: string | null
  payload: Record<string, unknown> | null
}

export type PullKelompok = {
  key: string
  /** Teks tab penyaring; jadi judul blok kalau kelompoknya cuma satu. */
  label: string
  /** `jurnal_header.kategori` PERSIS — beda ejaan = tab yang selamanya kosong
   *  tanpa satu pun error. */
  kategori: string
  /** true = hanya tarik baris `approval_status='disetujui'`. Dipakai kelima
   *  menu Cara Perolehan: draftnya belum tentu jadi & dokumennya masih bisa
   *  berubah sebelum disetujui. */
  perluApproval?: boolean
  /** Penyaring tambahan DI ATAS kategori — mis. sub_jenis Penghapusan atau
   *  `payload.jenis_pemanfaatan`. Tanpa ini seluruh baris kategori itu ikut. */
  cocok?: (h: BarisHeader) => boolean
  /** Kunci payload tempat berkasnya. Bawaan `['dokumen_paths']`; Pengamanan
   *  menyimpannya terpisah di `bast_paths` + `pakta_paths`. */
  payloadKeys?: string[]
  /** true = barisnya perpindahan; tampilkan "SKPD asal → SKPD tujuan". */
  tujuan?: boolean
}

export type SumberDokumen =
  | { tipe: 'pull'; label: string; catatan?: string; kelompok: PullKelompok[] }
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

// ── Penyaring siap pakai ────────────────────────────────────────────────────
// ⚠️ `jenis_pemanfaatan` tinggal di PAYLOAD, bukan kolom `jenis` — kolom itu
// isinya harfiah 'pemanfaatan' untuk SEMUA barisnya (diverifikasi ke DB
// 2026-09-07). Menyaringnya lewat `h.jenis` menghasilkan lima tab yang
// semuanya kosong, tanpa satu pun error.
const jenisPemanfaatan = (v: string) => (h: BarisHeader) =>
  (h.payload as { jenis_pemanfaatan?: string } | null)?.jenis_pemanfaatan === v

const subPemindahtanganan = (v: string) => (h: BarisHeader) =>
  h.jenis === 'penghapusan_pemindahtanganan' && h.sub_jenis === v

export const DAFTAR_SIKLUS: SiklusConfig[] = [
  {
    key: 'perencanaan_kebutuhan', label: 'Perencanaan Kebutuhan',
    sumber: [{ tipe: 'generic', label: 'SK RKBMD & SK Perubahan RKBMD', scope: 'global', dbSiklus: 'perencanaan_kebutuhan' }],
  },
  {
    // Kelima mekanisme perolehan jadi TAB terpisah (permintaan user
    // 2026-09-07). Penyaringnya `kategori`, BUKAN `jenis`: di kategori
    // 'pengadaan', kolom `jenis` isinya bentuk kontrak (spk / surat_pesanan /
    // kwitansi / bukti_pembelian / surat_perjanjian), bukan cara perolehan.
    key: 'cara_perolehan', label: 'Cara Perolehan',
    sumber: [{
      tipe: 'pull', label: 'BAST Perolehan BMD',
      catatan: 'Ditarik dari dokumen yang SUDAH disetujui di menu Cara Perolehan.',
      kelompok: [
        { key: 'pengadaan', label: 'Pengadaan', kategori: 'pengadaan', perluApproval: true },
        { key: 'hibah_masuk', label: 'Hibah', kategori: 'hibah_masuk', perluApproval: true },
        { key: 'tukar_menukar', label: 'Tukar Menukar', kategori: 'tukar_menukar', perluApproval: true },
        { key: 'hasil_inventarisasi', label: 'Hasil Inventarisasi', kategori: 'hasil_inventarisasi', perluApproval: true },
        { key: 'perolehan_lainnya', label: 'Perolehan Lainnya', kategori: 'perolehan_lainnya', perluApproval: true },
      ],
    }],
  },
  {
    // ⚠️ Generik "SK Penetapan Status Penggunaan" DICABUT (keputusan user
    // 2026-09-07): dokumennya sudah WAJIB diunggah di menu Penghapusan →
    // Pengalihan Status, jadi pintu upload kedua di sini cuma melahirkan
    // salinan yang tak terikat kartu mana pun. Tak ada data yang hilang —
    // `admin_dokumen` siklus itu 0 baris (dicek ke produksi 2026-09-07).
    //
    // Dua-duanya PERPINDAHAN, jadi `skpd_id` header-nya = SKPD yang
    // MENGELUARKAN; itu yang jadi kepala kelompok per-SKPD, sesuai permintaan
    // user ("dari yang mengeluarkan saja"). Sisi PENERIMAAN Internal membaca
    // baris `mutasi_internal` yang SAMA — satu dokumen, dua menu; tak perlu
    // (& tak boleh) dibuatkan tab sendiri, nanti berkasnya terhitung dua kali.
    key: 'penggunaan', label: 'Penggunaan',
    sumber: [{
      tipe: 'pull', label: 'Berita Acara Perpindahan BMD',
      catatan: 'Dikelompokkan per SKPD yang MENGELUARKAN barang. Penerimaan Internal membaca dokumen yang sama dari sisi sebaliknya.',
      kelompok: [
        { key: 'pengalihan', label: 'Pengalihan Status Penggunaan', kategori: 'pengalihan_status', tujuan: true },
        { key: 'internal', label: 'Pengeluaran Internal', kategori: 'mutasi_internal', tujuan: true },
      ],
    }],
  },
  {
    // Generik "Dokumen Perjanjian" DICABUT — sejak 2026-09-05 menu Pemanfaatan
    // sendiri sudah mewajibkan berkasnya (`payload.dokumen_paths`).
    key: 'pemanfaatan', label: 'Pemanfaatan',
    sumber: [{
      tipe: 'pull', label: 'Dokumen Perjanjian Pemanfaatan',
      catatan: 'Ditarik dari menu Pembukuan → Pengelolaan → Pemanfaatan.',
      kelompok: [
        { key: 'sewa', label: 'Sewa', kategori: 'pemanfaatan', cocok: jenisPemanfaatan('sewa') },
        { key: 'pinjam_pakai', label: 'Pinjam Pakai', kategori: 'pemanfaatan', cocok: jenisPemanfaatan('pinjam_pakai') },
        { key: 'bgs_bsg', label: 'BGS / BSG', kategori: 'pemanfaatan', cocok: jenisPemanfaatan('bgs_bsg') },
        { key: 'ksp', label: 'KSP', kategori: 'pemanfaatan', cocok: jenisPemanfaatan('ksp') },
        { key: 'kspi', label: 'KSPI', kategori: 'pemanfaatan', cocok: jenisPemanfaatan('kspi') },
      ],
    }],
  },
  {
    key: 'penilaian', label: 'Penilaian',
    sumber: [{ tipe: 'generic', label: 'Berita Acara / Dokumen Penilaian BMD', scope: 'global', dbSiklus: 'penilaian' }],
  },
  {
    // Generik per-SKPD DICABUT — menu Pengamanan sendiri sudah mewajibkan BAST
    // & Pakta Integritas. TANPA tab penyaring (permintaan user): pengamanan
    // cuma punya satu bentuk. ⚠️ Berkasnya di DUA kunci payload, bukan
    // `dokumen_paths` — lihat `payloadKeys`.
    key: 'pengamanan', label: 'Pengamanan',
    sumber: [{
      tipe: 'pull', label: 'BAST & Pakta Integritas Pengamanan',
      catatan: 'Ditarik dari menu Pembukuan → Pengelolaan → Pengamanan.',
      kelompok: [{
        key: 'pengamanan', label: 'Pengamanan', kategori: 'pengamanan',
        payloadKeys: ['bast_paths', 'pakta_paths'],
      }],
    }],
  },
  {
    // Dulu `kosong`. Diisi Koreksi & Reklasifikasi (permintaan user
    // 2026-09-07) — dua-duanya pembetulan pencatatan, yang memang inti
    // penatausahaan. Keduanya baru mewajibkan berkas sejak 2026-09-07, jadi
    // kartu yang lebih tua tak akan muncul di sini sampai dilengkapi lewat ✎
    // Edit di menunya masing-masing.
    key: 'penatausahaan', label: 'Penatausahaan',
    sumber: [{
      tipe: 'pull', label: 'Dokumen Pembetulan Pencatatan',
      catatan: 'Ditarik dari menu Pembukuan → Pengelolaan → Koreksi & Reklasifikasi.',
      kelompok: [
        { key: 'koreksi', label: 'Koreksi', kategori: 'koreksi' },
        { key: 'reklasifikasi', label: 'Reklasifikasi', kategori: 'reklasifikasi' },
      ],
    }],
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
    // Satu kategori ledger (`penghapusan`) memuat DUA jenis sekaligus —
    // `penghapusan_pemindahtanganan` (sub_jenis hibah/penjualan/tukar_menukar/
    // penyertaan_modal) & `penghapusan_sebab_lain` — jadi lima tab.
    // ⚠️ `jenis`/`sub_jenis` dibaca dari jurnal_header, BUKAN payload:
    // `insertLines()` di Penghapusan.tsx menulis `payload: {}` KOSONG utk baris
    // ledgernya (CLAUDE.md "sub_jenis dibaca dari payload KOSONG").
    key: 'penghapusan', label: 'Penghapusan',
    sumber: [{
      tipe: 'pull', label: 'SK Penghapusan',
      catatan: 'Ditarik dari menu Pembukuan → Pengelolaan → Penghapusan.',
      kelompok: [
        ...PEMINDAHTANGANAN_SUBJENIS.map(o => ({
          key: o.value, label: o.label, kategori: 'penghapusan', cocok: subPemindahtanganan(o.value),
        })),
        {
          key: 'sebab_lain', label: 'Sebab Lain', kategori: 'penghapusan',
          cocok: (h: BarisHeader) => h.jenis === 'penghapusan_sebab_lain',
        },
      ],
    }],
  },
  {
    key: 'pengawasan_pengendalian', label: 'Pengawasan dan Pengendalian',
    sumber: [{ tipe: 'kosong', label: 'Belum ada dokumen — modul ini menyusul' }],
  },
  // Wadah generik utk SK yang tak masuk siklus spesifik mana pun (mis. SK
  // Pengurus Barang) — permintaan user 2026-09-05. Migrasi 20260905_03
  // menambahkan 'sk_pengelolaan_bmd' ke CHECK constraint admin_dokumen.siklus.
  {
    key: 'sk_pengelolaan_bmd', label: 'SK Pengelolaan BMD',
    sumber: [{
      tipe: 'generic', label: 'SK Pengurus Barang & SK lain di luar siklus di atas',
      scope: 'global', dbSiklus: 'sk_pengelolaan_bmd',
    }],
  },
]
