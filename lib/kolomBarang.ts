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
// ✅ PENYIMPANGAN "kendaraanPM" DICABUT 2026-09-28 (permintaan user, atas
// spreadsheet kolom yang sama diminta utk KEDUA menu). Peralatan & Mesin
// (1.3.2) di Daftar Barang **Awal** dulu satu-satunya yang membawa No. Polisi/
// Rangka/Mesin/BPKB (+ kini Lokasi, juga baru); sekarang keduanya identik —
// tak ada lagi opsi/bendera yang membedakan kolom kedua menu ini. Kalau kelak
// ada golongan lain yang perlu beda kolom sungguhan antar menu, jangan pakai
// pola opt-in seperti dulu tanpa alasan kuat — bedanya gampang basi begitu
// salah satu menu diminta menyusul.
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
  // Disingkat di layar (permintaan user 2026-09-28) — lihat `KONDISI_SINGKAT`.
  kondisi: { header: 'Kondisi', align: 'center' },
  komptabel: { header: 'Komptabel', align: 'center' },
  nilai: { header: 'Nilai Perolehan', align: 'right' },
  asal_usul: { header: 'Asal Usul' },
  penggunaan: { header: 'Penggunaan' },
  keterangan: { header: 'Keterangan' },
}

/**
 * Kolom per jenis aset. Urutan di dalam array = urutan kiri→kanan di layar —
 * dan sejak 2026-09-28 urutannya DISAMAKAN persis dgn spreadsheet user:
 * identitas → deskriptif (merek/spesifikasi/kendaraan/lokasi/luas/hak/dokumen
 * kepemilikan) → tgl → asal usul → **komptabel+nilai** (satu blok, lihat
 * `kolomLayar`/`adaKomptabel` di bawah) → penggunaan → keterangan.
 * ⚠️ `komptabel` SENGAJA diletakkan tepat SEBELUM `nilai` (bukan sesudah) —
 * di layar keduanya DILEBUR jadi satu sel (Nilai Perolehan atas, Komptabel
 * bawah, permintaan user), tapi posisinya di array ini yang menentukan urutan
 * kolom EXPORT Daftar Barang Awal (yang mengekspor lewat array ini apa
 * adanya). Kalau `komptabel` ditaruh SESUDAH `nilai`, ia akan terdorong ke
 * belakang blok kolom penyusutan baseline (mm/beban/akum/buku/sisa) saat
 * diekspor — jauh dari Nilai Perolehan, padahal keduanya masih satu konsep.
 */
export const KOLOM_GOLONGAN: Record<string, string[]> = {
  // Tanah — TANPA komptabel. Dokumen kepemilikan sengaja tak di layar: satu
  // register bisa punya banyak bidang & dokumennya dikelola per-bidang di GIS.
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'hak', 'tgl', 'asal_usul', 'kondisi', 'nilai', 'penggunaan', 'keterangan'],
  // Peralatan & Mesin: + No. Polisi/Rangka/Mesin/BPKB + Lokasi (permintaan
  // user 2026-09-28, di KEDUA menu — lihat catatan kepala berkas). Datanya
  // sudah lama ada (`TEMPLATE_PERALATAN_MESIN`, lib/asetFields.ts), yang baru
  // cuma ditampilkan.
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb', 'lokasi', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  // Gedung & Bangunan: + Luas (permintaan user 2026-09-28). Spesifikasi
  // Lainnya yang sempat ditambahkan 2026-09-08 DICABUT LAGI hari yang sama
  // (keputusan user eksplisit, mengoreksi keputusan sebelumnya) — golongan ini
  // kini disamakan dgn JIJ/KDP: lokasi+luas, tanpa spesifikasi/merek.
  '1.3.3': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  // Jalan/Jaringan/Irigasi: + Luas (permintaan user 2026-09-28).
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  // KDP: + Luas (permintaan user 2026-09-28) — datanya sudah lama ada lewat
  // `KDP_KONSTRUKSI_FIELDS` (lib/asetFields.ts), yang baru cuma ditampilkan.
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  // ATB (1.5.3): + Merek/Tipe (permintaan user 2026-09-28) — software/lisensi
  // sering diidentifikasi lewat merek/vendornya, persis alasan yang sama dgn
  // 1.3.5. Datanya sudah lama ada (`merek_tipe`, TEMPLATE_ASET_LAINNYA di
  // lib/asetFields.ts); yang baru cuma ditampilkan di kolom ini.
  '1.5.3': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
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
    'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
}

/**
 * Kondisi barang disingkat di layar (permintaan user 2026-09-28) — kolom itu
 * sempit & nilai penuhnya ("Tidak Ditemukan") tak muat. Nilai penuh tetap yang
 * disimpan (`aset.kondisi_barang` / `aset_awal_2026.kondisi_barang`, lihat
 * `FIELD_OPTIONS.kondisi_barang` di lib/asetFields.ts) — ini murni tampilan,
 * bukan kolom kedua. Export TETAP FULL TEXT (bukan singkatan) — dokumen resmi
 * tak boleh memaksa pembacanya menghafal singkatan.
 */
export const KONDISI_SINGKAT: Record<string, string> = {
  'Baik': 'B',
  'Rusak Ringan': 'RR',
  'Rusak Berat': 'RB',
  'Hilang': 'H',
  'Tidak Ditemukan': 'TD',
}

/** Golongan di luar daftar (mis. "Semua Jenis Aset") — kolom paling umum. */
export const KOLOM_DEFAULT = ['skpd', 'kode', 'nama', 'tgl', 'asal_usul', 'kondisi', 'komptabel', 'nilai', 'penggunaan', 'keterangan']

/**
 * Kolom yang isinya SATU nomor utuh — dipaksa satu baris. Tanpa ini
 * "AG 1021 EP" pecah jadi tiga baris di kolom sempit & tak lagi terbaca sbg
 * satu nomor polisi (permintaan user 2026-07-30).
 */
export const NOWRAP_KEYS = new Set(['nopol', 'rangka', 'mesin', 'bpkb', 'tgl', 'tgl_sertifikat'])

/** Kolom kiri→kanan untuk sebuah golongan, sama persis di KEDUA menu. */
export function kolomGolongan(golongan: string): string[] {
  const dasar = KOLOM_GOLONGAN[golongan]
  return dasar ? [...dasar] : [...KOLOM_DEFAULT]
}

/**
 * Golongan ini punya Komptabel? Tanah (1.3.1) TIDAK — semua tanah selalu
 * intrakomptabel, jadi kolomnya percuma (lihat komentar `KOLOM_GOLONGAN`
 * di atas). Dipakai memutuskan apakah sel Nilai Perolehan menumpuk Komptabel
 * di bawahnya di layar.
 */
export function adaKomptabel(golongan: string): boolean {
  return (KOLOM_GOLONGAN[golongan] ?? KOLOM_DEFAULT).includes('komptabel')
}

/**
 * Kolom LAYAR — sama seperti `kolomGolongan`, tapi DUA pasang DILEBUR jadi
 * satu sel (permintaan user 2026-09-28): Komptabel ditumpuk di bawah Nilai
 * Perolehan, Keterangan ditumpuk di bawah Penggunaan — pola yang sama dgn
 * Kode+Uraian & Nama+NIBAR yang sudah lebih dulu digabung di kedua menu.
 * ⚠️ Dipakai HANYA oleh Daftar Barang (live) — Daftar Barang Awal punya
 * mesin peleburan generiknya sendiri (`colsLayar` di halamannya, dua pasang
 * lain: Masa Manfaat+Sisa & Penggunaan+Keterangan) krn ia juga menyisipkan
 * kolom penyusutan baseline yang tak dipunyai Daftar Barang.
 * Export tetap FLAT (Daftar Barang lewat `EXPORT_COLS` sendiri, Daftar Barang
 * Awal lewat `kolomGolongan` polos) — Komptabel & Keterangan tetap kolom
 * Excel tersendiri, cuma di layar yang diringkas.
 */
export function kolomLayar(golongan: string): string[] {
  return kolomGolongan(golongan).filter(k => k !== 'komptabel' && k !== 'keterangan')
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
