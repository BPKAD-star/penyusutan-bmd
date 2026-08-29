// Registry lembar resmi Permendagri 47/2021 yang SUDAH dibangun di aplikasi ini.
//
// Satu-satunya daftar yang menjawab: "laporan ini punya lembar resmi atau
// belum, dan kodenya apa." Peta lengkapnya (termasuk yang BELUM punya padanan)
// ada di docs/pelaporan-permendagri.md — berkas ini sengaja cuma memuat yang
// sudah jadi, karena entri untuk sesuatu yang belum ada tak akan pernah dibaca
// siapa pun lalu basi diam-diam (pelajaran cache `aset.pemanfaatan`).
//
// ⚠️ ISINYA DIBACA, BUKAN CUMA DIDOKUMENTASIKAN. Dua pemakai hari ini:
//   1. `LaporanPerolehan` — ADA/TIDAKNYA tab "Format Permendagri" ditentukan
//      dari sini (dulu prop boolean `enableModel3` yang harus diingat manual).
//   2. `LaporanPengadaanTabel` — kode format di kanan atas lembar.
// Nambah lembar baru = nambah SATU entri; tabnya muncul sendiri.
//
// ⚠️ `kode` DICETAK DI LEMBAR, bukan di nama tab/menu (keputusan user
// 2026-08-29). Di lembar ia berguna — pemeriksa mencocokkan lampiran yang
// diterimanya dengan daftar format di Permendagri. Di tab ia jargon, dan di
// menu Perolehan angka "Model 3" malah menyesatkan karena "Model 1/2/3" di
// Laporan BMD artinya hal yang lain sama sekali.
//
// Dikunci lib/permendagriFormat.test.ts — termasuk uji bahwa `berkas` benar-
// benar ada di disk. Itu bukan formalitas: berkas lembar SUDAH pernah di-rename
// (LaporanPengadaanModel3 → LaporanPengadaanPermendagri, 2026-08-29), dan
// penunjuk yang basi tak akan menghasilkan satu pun error saat dijalankan.

export type LembarPermendagri = {
  /** Kode format resmi, spt tercetak di lampiran Permendagri 47/2021. */
  kode: string
  /** Judul yang tercetak di kepala lembar. */
  judul: string
  /** Ukuran & orientasi kertas — samakan dengan `@page` di lembarnya. */
  kertas: string
  /** Berkas yang merender lembarnya, relatif akar repo. Diverifikasi test. */
  berkas: string
  /**
   * Diisi kalau lembar ini milik SATU cara perolehan (jenis ledger di menu
   * Laporan Perolehan) — dipakai `lembarPerolehan()`.
   */
  caraPerolehan?: string
}

/**
 * Kunci = identitas lembar di aplikasi ini, BUKAN kode formatnya. Sengaja:
 * satu berkas melayani dua kode (IV.L.4.1 & IV.L.4.3 sama-sama LembarMutasiBmd,
 * bedanya cuma lingkup), jadi kode tak bisa jadi kunci utama.
 */
export type IdLembar =
  | 'inventarisasi-lki'
  | 'inventarisasi-lhi'
  | 'kir'
  | 'perolehan-pengadaan'
  | 'mutasi-bmd-skpd'
  | 'laporan-bmd-skpd'
  | 'mutasi-bmd-pemda'
  | 'laporan-bmd-pemda'
  | 'berita-acara-rekon'

export const LEMBAR_PERMENDAGRI: Record<IdLembar, LembarPermendagri> = {
  'inventarisasi-lki': {
    kode: 'III.A.1–III.A.7',
    judul: 'Lembar Kerja Inventarisasi (LKI)',
    kertas: 'A4 potret',
    berkas: 'app/cetak/inventarisasi-lki/page.tsx',
  },
  'inventarisasi-lhi': {
    kode: 'III.B.1–III.B.11',
    judul: 'Laporan Hasil Inventarisasi (LHI)',
    kertas: 'A4 lanskap',
    berkas: 'app/cetak/inventarisasi-lhi/page.tsx',
  },
  kir: {
    kode: 'III.K.2',
    judul: 'Kartu Inventaris Ruangan (KIR)',
    kertas: 'A4 lanskap',
    berkas: 'app/cetak/kir/page.tsx',
  },
  'perolehan-pengadaan': {
    kode: 'IV.A',
    judul: 'Laporan Pengadaan BMD Berupa Aset Tetap',
    kertas: 'A4 lanskap',
    // Lembarnya dipakai BERSAMA oleh tab "Format Permendagri" & rute
    // /cetak/laporan-pengadaan — jadi yang ditunjuk komponen tabelnya, bukan
    // salah satu pemakainya.
    berkas: 'components/pelaporan/LaporanPengadaanTabel.tsx',
    caraPerolehan: 'pengadaan',
  },
  'mutasi-bmd-skpd': {
    kode: 'IV.L.4.1',
    judul: 'Rekapitulasi Mutasi Tambah dan Mutasi Kurang Laporan BMD',
    kertas: 'A4 potret',
    berkas: 'components/pelaporan/LembarMutasiBmd.tsx',
  },
  'laporan-bmd-skpd': {
    kode: 'IV.L.4.2',
    judul: 'Laporan BMD (per SKPD)',
    kertas: 'A4 potret',
    berkas: 'app/cetak/laporan-bmd/page.tsx',
  },
  'mutasi-bmd-pemda': {
    kode: 'IV.L.4.3',
    judul: 'Rekapitulasi Mutasi Tambah dan Kurang BMD',
    kertas: 'A4 potret',
    berkas: 'components/pelaporan/LembarMutasiBmd.tsx',
  },
  'laporan-bmd-pemda': {
    kode: 'IV.L.4.4',
    judul: 'Laporan BMD (se-Pemda)',
    kertas: 'A4 potret',
    berkas: 'app/cetak/laporan-bmd-pemda/page.tsx',
  },
  'berita-acara-rekon': {
    kode: 'V.2',
    judul: 'Berita Acara Rekonsiliasi',
    kertas: 'A4 potret',
    berkas: 'components/pelaporan/BeritaAcaraRekon.tsx',
  },
}

/** "Format IV.A — Permendagri 47/2021". SATU sumber untuk semua lembar. */
export function labelFormat(l: LembarPermendagri): string {
  return `Format ${l.kode} — Permendagri 47/2021`
}

/**
 * Lembar resmi untuk sebuah cara perolehan, atau `null` kalau padanannya belum
 * dibangun.
 *
 * ⚠️ `null` = "belum ada lembarnya", dan pemakainya WAJIB memperlakukannya
 * sebagai tab yang TIDAK ADA — bukan tab kosong atau tab bertuliskan "belum
 * tersedia". Tab yang ada tapi hampa bikin operator mengira lembarnya gagal
 * dimuat, lalu melapor bug yang tak pernah ada.
 *
 * Per 2026-08-29 baru `pengadaan` (IV.A) yang punya. Empat cara perolehan lain
 * sudah punya lembar cetak ("Laporan Penerimaan BMD", app/cetak/perolehan) tapi
 * nomor formatnya BELUM dikonfirmasi Bidang Aset — dan menebaknya di lembar
 * yang akan ditandatangani jauh lebih berbahaya daripada membiarkannya kosong.
 * Lihat docs/pelaporan-permendagri.md §6.
 */
export function lembarPerolehan(jenis: string): LembarPermendagri | null {
  for (const l of Object.values(LEMBAR_PERMENDAGRI)) {
    if (l.caraPerolehan === jenis) return l
  }
  return null
}
