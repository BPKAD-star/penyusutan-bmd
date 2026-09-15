// ============================================================================
// SATU SUMBER kolom register barang — dipakai BERSAMA oleh dua menu yang
// menampilkan barang yang SAMA, bedanya cuma posisi waktu:
//
//   · Daftar Barang            app/dashboard/daftar-barang/page.tsx
//   · Daftar Barang Awal       app/dashboard/saldo-awal/daftar-barang/page.tsx
//     (snapshot beku posisi akhir 2025, `aset_awal_2026`)
//
// KENAPA DIANGKAT (REFACTOR-PLAN §5 butir 2.3): sampai 2026-09-15 daftar kolom
// per golongan ditulis DUA KALI — `COLS` di Daftar Barang & `BASE_COLS` di
// Daftar Barang Awal — dan satu-satunya yang menjaga keduanya tetap sama adalah
// komentar "ubah satu, samakan yang lain". Aturan yang cuma ditulis di komentar
// sudah berkali-kali terbukti dilanggar di repo ini (CLAUDE.md), dan
// pelanggarannya di sini **tidak menghasilkan satu pun error**: dua menu cuma
// menampilkan barang yang sama dengan isi yang berbeda, dan operator yang
// menyandingkan berkasnya mengira datanya yang hilang.
//
// ⚠️ SATU PENYIMPANGAN YANG DISENGAJA, dan sekarang ia PUNYA NAMA.
// Peralatan & Mesin (1.3.2) di Daftar Barang **Awal** membawa No. Polisi /
// Rangka / Mesin / BPKB, sementara Daftar Barang belum (permintaan user
// 2026-07-30: identitas kendaraan itu yang paling sering dicocokkan saat
// menelusuri baseline 2025). Dulu itu hidup sbg SELISIH DIAM-DIAM antara dua
// daftar yang sepintas kembar; sekarang ia satu bendera bernama
// (`kendaraanPM`), jadi bedanya disengaja & terbaca, bukan ditemukan.
// Kalau kelak Daftar Barang mau ikut: ubah `kendaraanPM` di halaman itu jadi
// true — bukan menyalin empat kunci ke daftar kedua.
//
// ⛔ Yang SENGAJA tidak diangkat ke sini:
//   · `EXPORT_ORDER` / `EXPORT_COLS` — cuma ada di Daftar Barang (Daftar Barang
//     Awal mengekspor lewat `colsFor`-nya sendiri), jadi ia sudah satu sumber &
//     memindahkannya tak menutup risiko apa pun.
//   · Kolom penyusutan baseline (`mm`/`beban`/`akum`/`buku`/`sisa`) & kolom
//     gabungan layar (`mmsisa`/`gunaket`) — HANYA milik Daftar Barang Awal.
//   · `uraian`/`nibar`/`kode_register` — hanya milik Daftar Barang.
//   Yang dibagi cuma yang memang DIPAKAI KEDUANYA; menaruh kolom milik satu
//   halaman di modul bersama membuat halaman lain terlihat "kehilangan" kolom
//   yang tak pernah ia punya.
// ============================================================================
import { ASET_LAIN_LAIN_EXTRA, type FieldKey } from '@/lib/asetFields'

export type MetaKolom = { header: string; align?: 'right' | 'center' }

/** Judul & perataan kolom yang dipakai KEDUA menu. */
export const KOLOM_META: Record<string, MetaKolom> = {
  skpd: { header: 'SKPD' },
  kode: { header: 'Kode Barang' },
  nama: { header: 'Nama Barang' },
  merek: { header: 'Merek / Tipe' },
  spesifikasi: { header: 'Spesifikasi Lainnya' },
  nopol: { header: 'No. Polisi' },
  rangka: { header: 'No. Rangka' },
  mesin: { header: 'No. Mesin' },
  bpkb: { header: 'No. BPKB' },
  lokasi: { header: 'Lokasi' },
  luas: { header: 'Luas (m²)', align: 'right' },
  hak: { header: 'Jenis Hak' },
  // Judul ketiganya WAJIB sama persis di dua menu — berkasnya sering
  // disandingkan berdampingan saat menelusuri barang.
  no_sertifikat: { header: 'Nomor Dokumen Kepemilikan' },
  tgl_sertifikat: { header: 'Tanggal Dokumen Kepemilikan' },
  atas_nama: { header: 'Nama Dokumen Kepemilikan' },
  tgl: { header: 'Tgl Perolehan' },
  komptabel: { header: 'Komptabel', align: 'center' },
  nilai: { header: 'Nilai Perolehan', align: 'right' },
  asal_usul: { header: 'Asal Usul' },
  penggunaan: { header: 'Penggunaan' },
  keterangan: { header: 'Keterangan' },
}

/**
 * Empat kolom identitas kendaraan — penyimpangan yang disengaja, lihat kepala
 * berkas. Disisipkan sesudah `spesifikasi` di golongan 1.3.2.
 */
export const KENDARAAN_PM = ['nopol', 'rangka', 'mesin', 'bpkb'] as const

/**
 * Kolom per jenis aset, TANPA kolom kendaraan 1.3.2 (itu lewat `opts`).
 * Urutan di dalam array = urutan kiri→kanan di layar.
 */
export const KOLOM_GOLONGAN: Record<string, string[]> = {
  // Tanah — TANPA komptabel. Dokumen kepemilikan sengaja tak di layar: satu
  // register bisa punya banyak bidang & dokumennya dikelola per-bidang di GIS.
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'luas', 'hak', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  // Gedung & Bangunan: + Spesifikasi Lainnya (permintaan user 2026-09-08).
  // Golongan ini tak punya Merek/Tipe — yang menerangkan barangnya justru
  // Spesifikasi Lainnya.
  '1.3.3': ['skpd', 'kode', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  // Aset Lain-Lain — SATU-SATUNYA golongan yang kolomnya GABUNGAN semua
  // template (permintaan user 2026-09-08), dan itu bukan kelonggaran: 1.5.4
  // diisi barang hasil reklasifikasi dari SEMUA golongan lain, jadi satu tabel
  // memuat sekaligus bekas Tanah (luas, jenis hak, dokumen kepemilikan) DAN
  // bekas Peralatan & Mesin (no. polisi/rangka/mesin/BPKB). Sel yang tak
  // berlaku tampil "-" — itu justru yang dicari: selama kolomnya tak pernah
  // muncul, tak ada yang tahu mana yang masih kosong.
  // ⚠️ Himpunannya KEMBAR dgn `ASET_LAIN_LAIN_EXTRA` (lib/asetFields.ts), yang
  // menawarkan sembilan field yang sama di form Koreksi Spesifikasi. Dulu
  // kekembaran itu cuma dijaga komentar; kini DIKUNCI lib/kolomBarang.test.ts —
  // operator yang bisa MENGISI field tapi tak pernah bisa MELIHATnya (atau
  // sebaliknya) adalah keadaan paling membingungkan dari dua-duanya.
  '1.5.4': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb',
    'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
    'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}

/** Golongan di luar daftar (mis. "Semua Jenis Aset") — kolom paling umum. */
export const KOLOM_DEFAULT = ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan']

/**
 * Kolom yang isinya SATU nomor utuh — dipaksa satu baris. Tanpa ini
 * "AG 1021 EP" pecah jadi tiga baris di kolom sempit & tak lagi terbaca sbg
 * satu nomor polisi (permintaan user 2026-07-30).
 */
export const NOWRAP_KEYS = new Set(['nopol', 'rangka', 'mesin', 'bpkb', 'tgl', 'tgl_sertifikat'])

/**
 * @param kendaraanPM Peralatan & Mesin (1.3.2) ikut membawa No. Polisi /
 *   Rangka / Mesin / BPKB. `true` di Daftar Barang Awal, `false` di Daftar
 *   Barang — lihat kepala berkas. Golongan LAIN tak terpengaruh: 1.5.4 sudah
 *   memuat keempatnya secara tetap karena isinya campuran semua golongan.
 */
export function kolomGolongan(golongan: string, opts: { kendaraanPM?: boolean } = {}): string[] {
  const dasar = KOLOM_GOLONGAN[golongan]
  if (!dasar) return [...KOLOM_DEFAULT]
  if (golongan !== '1.3.2' || !opts.kendaraanPM) return [...dasar]
  // Disisipkan tepat sesudah `spesifikasi`, bukan ditempel di ujung — identitas
  // kendaraan dibaca bersama merek & spesifikasinya.
  const i = dasar.indexOf('spesifikasi')
  return [...dasar.slice(0, i + 1), ...KENDARAAN_PM, ...dasar.slice(i + 1)]
}

/**
 * Peta kunci kolom → nama kolom `aset` (FieldKey). Dipakai uji kekembaran
 * 1.5.4 ↔ `ASET_LAIN_LAIN_EXTRA`; keduanya menyebut hal yang sama dengan
 * penamaan yang berbeda (kolom tabel vs kolom DB).
 */
export const KOLOM_KE_FIELD: Record<string, FieldKey> = {
  nopol: 'no_polisi', rangka: 'no_rangka', mesin: 'no_mesin', bpkb: 'no_bpkb',
  luas: 'luas', hak: 'jenis_hak',
  no_sertifikat: 'nomor_dokumen_kepemilikan',
  tgl_sertifikat: 'tanggal_dokumen_kepemilikan',
  atas_nama: 'nama_dokumen_kepemilikan',
}

/** Himpunan FieldKey yang DITAMPILKAN kolom 1.5.4 — pasangan `ASET_LAIN_LAIN_EXTRA`. */
export function fieldTambahan154(): Set<FieldKey> {
  const out = new Set<FieldKey>()
  for (const k of KOLOM_GOLONGAN['1.5.4']) {
    const f = KOLOM_KE_FIELD[k]
    if (f && ASET_LAIN_LAIN_EXTRA.includes(f)) out.add(f)
  }
  return out
}
