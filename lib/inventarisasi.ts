// Modul Inventarisasi BMD (Permendagri 47/2021) — tipe, konfigurasi form, dan
// klasifikasi laporan. NON-LEDGER: tak ada satu pun fungsi di sini yang menulis
// `transaksi_bmd` atau mengubah `aset`.
//
// MODEL (migrasi 20260923_03, keputusan user 2026-09-23): SATU BARIS PER
// BARANG di `inventarisasi_barang`. Lembar Kerja = tampilan register HIDUP;
// isian tersimpan begitu disimpan (tanpa "Ajukan"); Pengelola Barang
// memvalidasi per barang. Model lama (satu lembar per SKPD × jenis aset yang
// menarik & membekukan seluruh barang) sudah dicabut — lembarnya basi sejak
// dibuat & validasinya semua-atau-tidak.
//
// KONSEP INTI — LKI SUMBER, LHI TURUNAN:
//   Lembar Kerja Inventarisasi (LKI, Format III.A.1–III.A.7) = form PER-BARANG
//   berisi checklist bagian A–R. Laporan Hasil Inventarisasi (LHI, Format
//   III.B.1–III.B.11) TIDAK diinput terpisah — semuanya diturunkan dari jawaban
//   LKI lewat `klasifikasiLhi()`. Satu baris boleh masuk BEBERAPA LHI sekaligus
//   (mis. kondisi berubah DAN tercatat ganda).
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { KIBAR_JENIS_LABEL } from '@/lib/kibarJenis'

// ── Status per barang ───────────────────────────────────────────────────────
/** Status yang TERSIMPAN. "Belum" bukan status — ia berarti belum ada barisnya. */
export type InvStatus = 'diisi' | 'divalidasi'
export type StatusTampil = 'belum' | InvStatus

export const STATUS_LABEL: Record<StatusTampil, string> = {
  belum: 'Belum diinventarisasi',
  diisi: 'Menunggu validasi',
  divalidasi: 'Divalidasi',
}
export const STATUS_BADGE: Record<StatusTampil, string> = {
  belum: 'bg-gray-100 text-gray-500',
  diisi: 'bg-amber-100 text-amber-700',
  divalidasi: 'bg-teal/10 text-teal',
}

/** Petugas/pelaksana inventarisasi — diambil dari admin_pegawai, bukan ketik bebas.
 *  Satu tim per SKPD per tahun (`inventarisasi_tim`). */
export type Petugas = { pegawai_id: string; nama: string; nip: string | null; jabatan: string | null }

// ── Posisi & kunci ──────────────────────────────────────────────────────────
/**
 * Posisi barang SEKARANG dibanding posisi saat diinventarisasi — dihitung
 * server (`fn_inventarisasi_posisi` & kembarannya di RPC baca). `null` = masih
 * di tempat. Selain itu hasil inventarisasinya TERKUNCI sampai barangnya
 * kembali ke posisi semula (self-healing, keputusan user 2026-09-23).
 */
export type PosisiBerubah = 'keluar' | 'pindah_skpd' | 'reklas'

export function labelPosisi(
  p: PosisiBerubah | null | undefined,
  skpdBaru?: string | null,
  golonganBaru?: string | null,
): string | null {
  if (!p) return null
  if (p === 'pindah_skpd') return `Pindah ke ${skpdBaru || 'SKPD lain'}`
  if (p === 'reklas') {
    const label = golonganBaru ? (LKI_CONFIG[golonganBaru]?.label || golonganBaru) : null
    return `Direklas ke ${label ? `${label} (${golonganBaru})` : 'jenis aset lain'}`
  }
  return 'Keluar dari Daftar Barang (dihapus / diserap induk / dipecah / digabung)'
}

/** Satu transaksi ledger yang MASIH BERLAKU sesudah barang terakhir diisi. */
export type TransaksiSesudah = { jenis: string; periode: string }

export function labelTransaksi(t: TransaksiSesudah): string {
  return `${KIBAR_JENIS_LABEL[t.jenis]?.label || t.jenis} (${t.periode})`
}

// ── Baris (satu lembar LKI) ─────────────────────────────────────────────────
/** Kondisi "SEBELUM" — dibangun SERVER dari `aset` tiap kali isian disimpan
 *  (`fn_inventarisasi_snapshot`). Kunci-kuncinya KEMBAR dgn fungsi itu. */
export type InvSnapshot = {
  nibar?: string | null
  kode_register?: string | null
  kode?: string
  uraian_barang?: string | null
  nama_barang?: string | null
  spesifikasi_lainnya?: string | null
  merek_tipe?: string | null
  jumlah?: number | null
  satuan?: string | null
  nilai_perolehan?: number
  alamat?: string | null
  kondisi?: string | null      // dari aset.kondisi_barang ('Baik'|'Rusak Ringan'|…)
  tgl_perolehan?: string | null
  no_polisi?: string | null
  no_rangka?: string | null
  no_mesin?: string | null
  no_bpkb?: string | null
  luas?: number | null
  wilayah_kode?: string | null
  /** Rantai nama wilayah (Desa, Kec., Kabupaten) — `fn_wilayah_label`. */
  wilayah?: string | null
  keterangan?: string | null
  /** Foto barang di register (`aset.foto_paths`, bucket `aset-foto`). */
  foto_paths?: string[] | null
  latitude?: number | null
  longitude?: number | null
  skpd_id?: number | null
}

/** Bagian A–D & J: "Sesuai" atau "Tidak Sesuai, sebutkan yang seharusnya". */
export type SesuaiField = { sesuai: boolean; seharusnya?: string }

/** Alasan barang "Tidak ada" (Gedung & Bangunan, JIJ) — keputusan user 2026-10-01. */
export type SebabTidakAda =
  | 'force_majeure' | 'dibongkar_baru' | 'rehab_bangunan_baru'
  | 'digabung' | 'beberapa_register'

/** `l(noun)` — label mengikuti jenis barangnya (Gedung: "bangunan"; JIJ:
 *  "jalan/jaringan/irigasi"), lihat `LkiConfig.sebabNoun`. */
export const SEBAB_TIDAK_ADA: { v: SebabTidakAda; l: (noun: string) => string; lhi: string }[] = [
  { v: 'force_majeure', l: () => 'Force majeure (bencana, kebakaran, dsb.)', lhi: 'III.B.2' },
  { v: 'dibongkar_baru', l: n => `Dibongkar total dan sudah ada ${n} baru`, lhi: 'III.B.2' },
  { v: 'rehab_bangunan_baru', l: n => `Direhab dan jadi ${n} baru`, lhi: 'III.B.3' },
  { v: 'digabung', l: n => `Digabung dengan ${n} lain`, lhi: 'III.B.3' },
  { v: 'beberapa_register', l: () => 'Seharusnya ada beberapa register', lhi: 'III.B.8' },
]

/** Label satu sebab; `noun` bawaan "bangunan" (Gedung & Bangunan). */
export const labelSebab = (v: SebabTidakAda | undefined, noun = 'bangunan') =>
  SEBAB_TIDAK_ADA.find(o => o.v === v)?.l(noun)

/** Sebab yang mewajibkan memilih barang lain (anak / induk). */
export const SEBAB_BUTUH_RELASI: SebabTidakAda[] = ['rehab_bangunan_baru', 'digabung']

export type PihakPengguna = 'pemda' | 'pempus' | 'pemda_lain' | 'pihak_lain'
export type KondisiFisik = 'B' | 'RR' | 'RB'

export type InvJawaban = {
  // A — identitas barang (dulu "Kode Register" yang tak ada di sistem).
  // NIBAR dipakai apa adanya dari snapshot, jadi tak ada isian di sini.

  // B+C — Kode Barang & Nama Barang DIGABUNG: yang dikoreksi cukup kodenya,
  // nama/uraian otomatis mengikuti kodefikasi. Pilihan dibatasi kodefikasi
  // dalam GOLONGAN YANG SAMA (lintas golongan = urusan menu Reklasifikasi).
  kode_barang?: SesuaiField & { kode_baru?: string; uraian_baru?: string }
  // D
  spesifikasi?: SesuaiField
  // E — jumlah TIDAK bisa diubah lewat LKI (tampilan saja, dari snapshot).
  // F — satuan boleh dikoreksi, pilihannya dari master admin_satuan_bmd.
  satuan?: SesuaiField
  // G — Keberadaan Barang
  keberadaan?: 'ada' | 'hilang' | 'tidak_ditemukan'
  jumlah_tidak_ada?: number
  // G-lanjutan — "Tidak ada karena ..." (khusus golongan ber-`sebabTidakAda`,
  // kini Gedung & Bangunan). Menentukan LAPORAN mana yang memuat barangnya:
  // lihat `klasifikasiLhi`. `sebab_relasi` = barang anak (rehab) / barang induk
  // (digabung), dipilih dari SKPD & golongan lembar ini sendiri.
  sebab_tidak_ada?: SebabTidakAda
  sebab_relasi?: { aset_id?: string | null; nibar?: string; kode_barang?: string; nama_barang?: string }
  /** Sebab `beberapa_register`: nama tiap bangunan hasil pemecahan
   *  ("Gedung Bangunan 1", "2", ...) — bahan Pemecahan Barang di menu Koreksi. */
  sebab_pecahan?: string[]
  // H — nilai perolehan TIDAK bisa diubah lewat LKI (tampilan saja).
  // I — biaya atribusi / menambah kapasitas manfaat (kapitalisasi).
  // Induk WAJIB dipilih dari barang milik SKPD lembar ini sendiri.
  atribusi?: 'ya_induk_diketahui' | 'ya_induk_tidak_diketahui' | 'bukan'
  induk?: {
    aset_id?: string | null
    nibar?: string; kode_barang?: string; kode_lokasi?: string
    kode_register?: string; nama_barang?: string; spesifikasi?: string
  }
  // J — Wilayah (admin_wilayah, berjenjang) & Alamat Detail: DUA form
  // terpisah (keputusan user 2026-09-28) — satu barang bisa saja wilayahnya
  // sudah benar sementara cuma nomor jalannya yang perlu dikoreksi, atau
  // sebaliknya. Dulu satu field `alamat` gabungan.
  wilayah?: SesuaiField & { wilayah_kode?: string }
  alamat_detail?: SesuaiField
  // K
  kondisi?: KondisiFisik
  // L — Penggunaan Barang. `null` = eksplisit "Digunakan sendiri" (bedanya dgn
  // `undefined` — "belum dijawab" — lihat `digunakanSendiriTampil` di bawah).
  penggunaan?: {
    pihak: PihakPengguna
    nama?: string              // nama instansi / pihak lain / pengguna barang lainnya
    // khusus pihak = 'pemda' (dipakai pegawai; BAST & SIP hanya utk rumah negara)
    nama_pemakai?: string
    status_pemakai?: string
    bast_pemakaian?: boolean
    sip?: boolean
    // khusus pempus / pemda_lain / pihak_lain
    dasar_ada?: boolean        // ada dokumen penguasaan?
    nama_dokumen?: string
  } | null
  // M — tercatat ganda. Barang kembarannya dipilih dari daftar barang SKPD
  // lembar ini sendiri (sama seperti induk di bagian I), bukan diketik bebas.
  ganda?: boolean
  ganda_data?: {
    aset_id?: string | null
    nibar?: string; kode_register?: string; kode_barang?: string
    nama_barang?: string; spesifikasi?: string; jumlah?: number; satuan?: string
    nilai_perolehan?: number; tgl_perolehan?: string
    pemegang?: string          // Pengelola / Pengguna Barang Lainnya / Kuasa PB Lainnya
  }
  // N — Gedung & Bangunan / JIJ: berdiri di atas tanah milik siapa
  tanah_milik?: PihakPengguna
  tanah_milik_nama?: string
  // O — Titik koordinat. Sesuai/Tidak Sesuai terhadap titik register; kalau
  // Tidak Sesuai, titik yang seharusnya di `latitude`/`longitude`.
  koordinat?: { sesuai: boolean }
  latitude?: number | null
  longitude?: number | null
  // Spesifikasi Lainnya · Luas · No. BPKB (per golongan, lihat LKI_MATRIX).
  spesifikasi_lainnya?: SesuaiField
  luas?: SesuaiField
  no_bpkb?: SesuaiField
  // Q — Keterangan barang di register (`aset.keterangan`). Beda dgn
  // `keterangan` di bawah, yang catatan bebas petugas di lembar kerja.
  keterangan_barang?: SesuaiField
  // R — Foto barang. Tidak Sesuai → foto baru WAJIB diunggah ke lembar ini.
  foto_barang?: { sesuai: boolean }
  /** LEGACY (P. Lainnya) — digabung ke `keterangan` sbg "Catatan Inventarisasi"
   *  (keputusan user 2026-09-28). Dipertahankan di tipe utk kompat mundur baris
   *  lama, TAK LAGI DIRENDER — jangan hidupkan lagi, satu kolom catatan cukup. */
  lainnya?: string
  /** Catatan Inventarisasi — catatan bebas PETUGAS tentang PROSES inventarisasi
   *  ini, BUKAN perbandingan terhadap `aset.keterangan` (itu `keterangan_barang`
   *  di bawah). Judul Seksi di form: "Catatan Inventarisasi". */
  keterangan?: string
  // Merek/Tipe — P&M (III.A.2) dan juga ATL (III.A.5) & ATB (III.A.6),
  // di dua format terakhir judulnya "Merek/Tipe/spesifikasi lainnya".
  merek_tipe?: SesuaiField
  // Khusus Peralatan & Mesin (kendaraan dinas)
  no_polisi?: SesuaiField
  no_rangka?: SesuaiField
  no_mesin?: SesuaiField
  // Khusus Jalan, Jaringan dan Irigasi (Format III.A.4)
  jenis_perkerasan?: SesuaiField
  jenis_bahan_jembatan?: SesuaiField
  no_ruas_jalan?: SesuaiField
  no_jaringan_irigasi?: SesuaiField
  /** Format III.A.7 — BMD Belum Tercatat (barang belum ada di `aset`, tanpa NIBAR).
   *  Isian mengikuti master data yang sama dgn lembar biasa: kode/nama barang
   *  dari kodefikasi (dikunci golongan lembar), satuan dari admin_satuan_bmd,
   *  alamat berjenjang dari admin_wilayah. `alamat` (teks lepas) DIPERTAHANKAN
   *  utk baris lama yang terlanjur diketik bebas. */
  baru?: {
    kode_barang?: string; nama_barang?: string; spesifikasi?: string
    kode_register?: string; merek_tipe?: string
    no_polisi?: string; no_rangka?: string; no_mesin?: string
    jumlah?: number; satuan?: string
    harga_satuan?: number; nilai_perolehan?: number
    tgl_perolehan?: string
    alamat?: string
    wilayah_kode?: string; alamat_detail?: string
    dasar_pencatatan?: string
    kondisi?: KondisiFisik
  }
}

export type InvBaris = {
  /** '' = belum pernah disimpan (lembar dibuka dari register hidup). */
  id: string
  aset_id: string | null
  snapshot: InvSnapshot
  jawaban: InvJawaban
  foto_paths: string[]
  status?: InvStatus
  /** Catatan Pengelola saat membatalkan validasi — satu-satunya keterangan ke SKPD. */
  catatan_validator?: string | null
}

// ── Konfigurasi form LKI per golongan ───────────────────────────────────────
// SATU komponen form yang dikonfigurasi — bukan 7 komponen terpisah, karena
// isian ke-7 format itu ±90% sama; yang beda cuma bagian di bawah ini.
export type LkiConfig = {
  format: string
  label: string
  /** Bagian Merek/Tipe. P&M (III.A.2), ATL (III.A.5), ATB (III.A.6). */
  merekTipe: boolean
  /** No. Polisi / Rangka / Mesin (kendaraan dinas — Peralatan & Mesin). */
  nomorKendaraan: boolean
  /** Jenis perkerasan/bahan jembatan + No. ruas jalan & jaringan irigasi (III.A.4). */
  jijTeknis: boolean
  /** G pecah jadi Hilang vs Tidak ditemukan (P&M, ATL, ATB); selain itu digabung. */
  hilangVsTidakDitemukan: boolean
  /** G: "Tidak ada" ditanyai sebabnya (force majeure, dibongkar, direhab, dst.)
   *  — Gedung & Bangunan dan JIJ. Lihat `SEBAB_TIDAK_ADA`. */
  sebabTidakAda: boolean
  /** Kata benda utk label sebab & pesan ("bangunan" / "jalan/jaringan/irigasi"). */
  sebabNoun: string
  /** Awalan kotak nama pecahan ("Gedung Bangunan" → "Nama Gedung Bangunan 1"). */
  sebabNama: string
  /** Nama pemakai + BAST pemakaian + SIP (rumah negara — Gedung & Bangunan). */
  pemakaiRumahNegara: boolean
  /** Bagian N "berdiri di atas tanah milik" — Gedung & Bangunan dan JIJ. */
  tanahMilik: boolean
  /** Judul bagian N, beda per format ("Gedung dan Bangunan"/"Jalan" di atas…). */
  tanahMilikLabel?: string
  /** Titik koordinat (bagian O) — seluruh golongan. */
  titikKoordinat: boolean
  /** Spesifikasi Lainnya (register `aset.spesifikasi_lainnya`). */
  spesifikasiLainnya: boolean
  /** Luas (m²) (register `aset.luas`). */
  luas: boolean
  /** Bagian I — biaya atribusi/menambah kapasitas manfaat (digabung ke induk
   *  lewat menu Kapitalisasi). Lihat `LKI_MATRIX.atribusi`. */
  atribusi: boolean
}

/**
 * MATRIKS ISIAN LKI per golongan — disalin dari berkas kerja user
 * "Alur Inventarisasi.xlsx" (2026-09-25). KHUSUS LKI: sengaja TIDAK diturunkan
 * dari `GOLONGAN_FIELDS` (lib/asetFields.ts). Template itu dipakai bersama Edit
 * Spesifikasi, Koreksi, & Daftar Barang; menyempitkannya demi LKI akan
 * MENYEMBUNYIKAN data yang sudah tersimpan di menu-menu itu (mis. Spesifikasi
 * Lainnya Gedung). Yang ditanyakan saat inventarisasi fisik memang lebih sempit
 * dari yang bisa disimpan register.
 *
 * Isian yang ditanyakan di SEMUA golongan (tak perlu tercantum di sini): NIBAR,
 * Kode Barang, Spesifikasi Nama Barang, Jumlah, Satuan, Keberadaan, Nilai,
 * Alamat (wilayah + detail), Titik Koordinat, Kondisi, Penggunaan, Tercatat
 * Ganda, Keterangan, Foto/Denah.
 */
export const LKI_MATRIX = {
  merek_tipe: ['1.3.2', '1.3.5', '1.5.4'],
  spesifikasi_lainnya: ['1.3.1', '1.3.2', '1.3.5', '1.5.4'],
  /** No. Polisi · No. Rangka · No. Mesin · No. BPKB. */
  nomor_kendaraan: ['1.3.2', '1.5.4'],
  luas: ['1.3.1', '1.3.3', '1.3.4', '1.3.6', '1.5.4'],
  /** Peralatan & Mesin SENGAJA tidak (keputusan user 2026-09-25): rehab/upgrade
   *  P&M dicatat sbg barang tersendiri, tak digabung ke induk. ATB ikut —
   *  belanja modul baru pada aplikasi induk memang menambah nilai induknya. */
  atribusi: ['1.3.3', '1.3.4', '1.5.3'],
  /** Bagian N "berdiri di atas tanah milik". */
  tanah_milik: ['1.3.3', '1.3.4', '1.5.4'],
} as const

const ada = (daftar: readonly string[], golongan: string) => daftar.includes(golongan)

type OverrideConfig = Partial<
  Pick<LkiConfig, 'jijTeknis' | 'hilangVsTidakDitemukan' | 'pemakaiRumahNegara' | 'tanahMilikLabel' | 'sebabTidakAda' | 'sebabNoun' | 'sebabNama'>
>

function konfig(golongan: string, format: string, label: string, override: OverrideConfig = {}): LkiConfig {
  return {
    format, label,
    merekTipe: ada(LKI_MATRIX.merek_tipe, golongan),
    spesifikasiLainnya: ada(LKI_MATRIX.spesifikasi_lainnya, golongan),
    nomorKendaraan: ada(LKI_MATRIX.nomor_kendaraan, golongan),
    luas: ada(LKI_MATRIX.luas, golongan),
    atribusi: ada(LKI_MATRIX.atribusi, golongan),
    tanahMilik: ada(LKI_MATRIX.tanah_milik, golongan),
    tanahMilikLabel: 'Barang di atas tanah milik',
    titikKoordinat: true,
    jijTeknis: false, hilangVsTidakDitemukan: false, pemakaiRumahNegara: false, sebabTidakAda: false,
    sebabNoun: 'bangunan', sebabNama: 'Gedung Bangunan',
    ...override,
  }
}

// Konfigurasi di bawah SUDAH diverifikasi baris-per-baris terhadap Lampiran
// Permendagri 47/2021 (Format III.A.1–III.A.6), termasuk hal. 7–12 (2026-07-28).
// Isian yang ditanyakan per golongan dipegang `LKI_MATRIX`; yang tertulis di
// sini HANYA struktur survei Permendagri (jijTeknis/pemakaiRumahNegara/
// hilangVsTidakDitemukan) & judul bagian N.
//
// Catatan penting hasil verifikasi:
// - III.A.4 (JIJ) punya bagian N "Jalan di atas tanah milik" — sama seperti GB,
//   cuma beda judul. Ditambah 4 isian teknis khas JIJ (jenis perkerasan jalan,
//   jenis bahan struktur jembatan, no. ruas jalan, no. jaringan irigasi).
// - III.A.5 (ATL) & III.A.6 (ATB) BERBENTUK SAMA PERSIS satu sama lain: keduanya
//   punya "Merek/Tipe/spesifikasi lainnya" dan Keberadaan yang pecah jadi
//   Hilang vs Tidak ditemukan; keduanya tanpa bagian N.
// - KDP (1.3.6) & Aset Lain-Lain (1.5.4) TIDAK punya format sendiri di
//   Permendagri. Dipetakan ke bentuk III.A.6 PERSIS.
export const LKI_CONFIG: Record<string, LkiConfig> = {
  '1.3.1': konfig('1.3.1', 'III.A.1', 'Tanah'),
  '1.3.2': konfig('1.3.2', 'III.A.2', 'Peralatan dan Mesin', { hilangVsTidakDitemukan: true }),
  '1.3.3': konfig('1.3.3', 'III.A.3', 'Gedung dan Bangunan', {
    pemakaiRumahNegara: true, sebabTidakAda: true,
    tanahMilikLabel: 'Gedung dan Bangunan di atas tanah milik',
  }),
  '1.3.4': konfig('1.3.4', 'III.A.4', 'Jalan, Jaringan dan Irigasi', {
    jijTeknis: true, sebabTidakAda: true,
    sebabNoun: 'jalan/jaringan/irigasi', sebabNama: 'Jalan/Jaringan/Irigasi',
    tanahMilikLabel: 'Jalan di atas tanah milik',
  }),
  '1.3.5': konfig('1.3.5', 'III.A.5', 'Aset Tetap Lainnya', { hilangVsTidakDitemukan: true }),
  '1.3.6': konfig('1.3.6', 'III.A.6', 'Konstruksi Dalam Pengerjaan', { hilangVsTidakDitemukan: true }),
  '1.5.3': konfig('1.5.3', 'III.A.6', 'Aset Tidak Berwujud', { hilangVsTidakDitemukan: true }),
  '1.5.4': konfig('1.5.4', 'III.A.6', 'Aset Lain-Lain', { hilangVsTidakDitemukan: true }),
}

/** Format III.A.7 — BMD Belum Tercatat (berdiri sendiri, tak terikat golongan). */
export const FORMAT_BELUM_TERCATAT = 'III.A.7'

export const konfigLki = (golongan: string): LkiConfig =>
  LKI_CONFIG[golongan] || konfig(golongan, 'III.A.6', golongan)

/** Golongan yang boleh diinventarisasi — ikut daftar rekap BMD yang sudah ada. */
export const GOLONGAN_OPSI = GOLONGAN_REKAP.map(g => ({
  kode: g.kode,
  label: `${g.kode} — ${LKI_CONFIG[g.kode]?.label || g.uraian}`,
}))

/**
 * Delapan jenis aset yang diinventarisasi — SATU daftar untuk pemilih jenis di
 * Lembar Kerja & Validasi (dulu 16 sub-menu Sidebar; dilebur keputusan user
 * 2026-10-01). `JENIS_SEMUA` = pilihan "Semua jenis".
 */
export const JENIS_INVENTARISASI = GOLONGAN_REKAP.map(g => ({
  kode: g.kode,
  label: LKI_CONFIG[g.kode]?.label || g.uraian,
}))
export const JENIS_SEMUA = 'semua'

/** Jenis aset (3 segmen kode) sebuah barang — kembar dgn kolom `aset.golongan`. */
export const golonganDariKode = (kode: string | null | undefined) =>
  (kode || '').split('.').slice(0, 3).join('.')

// ── Klasifikasi LHI (Format III.B.1–III.B.11) ───────────────────────────────
export type LhiKode =
  | 'III.B.1' | 'III.B.2' | 'III.B.3' | 'III.B.4' | 'III.B.5' | 'III.B.6'
  | 'III.B.7' | 'III.B.8' | 'III.B.9' | 'III.B.10' | 'III.B.11'

export const LHI_LABEL: Record<LhiKode, string> = {
  'III.B.1': 'BMD Hilang Karena Kecurian',
  'III.B.2': 'BMD Tidak Ada Karena Tidak Diketemukan',
  'III.B.3': 'BMD Belum Dikapitalisasi dan Diketahui Data Awal/Induknya',
  'III.B.4': 'BMD Belum Dikapitalisasi dan Tidak Diketahui Data Awal/Induknya',
  'III.B.5': 'BMD Digunakan oleh Pegawai Pemerintah Daerah yang Bersangkutan',
  'III.B.6': 'BMD Digunakan oleh Pemerintah Pusat/Pemerintah Daerah Lainnya/Pihak Lain',
  'III.B.7': 'BMD Terjadi Perubahan Kondisi Fisik Barang',
  'III.B.8': 'BMD Terjadi Perubahan Data',
  'III.B.9': 'BMD Tercatat Ganda',
  'III.B.10': 'BMD Berdiri di Atas Tanah Bukan Milik Pemerintah Daerah',
  'III.B.11': 'BMD Belum Tercatat',
}

export const LHI_URUT: LhiKode[] = [
  'III.B.1', 'III.B.2', 'III.B.3', 'III.B.4', 'III.B.5', 'III.B.6',
  'III.B.7', 'III.B.8', 'III.B.9', 'III.B.10', 'III.B.11',
]

/** Samakan 'Baik' / 'Rusak Ringan' / 'Rusak Berat' (aset.kondisi_barang) ke B/RR/RB. */
export function normalKondisi(v: string | null | undefined): KondisiFisik | null {
  const s = (v || '').trim().toLowerCase()
  if (!s) return null
  if (s === 'b' || s.startsWith('baik')) return 'B'
  if (s === 'rr' || s.includes('ringan')) return 'RR'
  if (s === 'rb' || s.includes('berat')) return 'RB'
  return null
}

// ── Nilai TAMPILAN radio (keputusan user 2026-09-24) ────────────────────────
// Lembar yang BELUM PERNAH disimpan (`isBaru`) sengaja polos — tak satu pun
// radio tercentang sampai user benar-benar mengklik, supaya form tidak diam-
// diam "menjawab sendiri" sebelum disentuh. Lembar yang SUDAH pernah disimpan
// tetap memakai bacaan LAMA (kosong = tersirat jawaban default) supaya isian
// lama tak berubah tampilannya begitu dibuka ulang. Nilai yang TERSIMPAN sama
// sekali tak berubah oleh ketiga fungsi ini — murni bagaimana ia dirender.

/** Sesuai/Tidak Sesuai (bagian B–D, F, J, L, M–O jij/kendaraan). */
export function sesuaiTampil(f: SesuaiField | undefined, isBaru: boolean): boolean | undefined {
  if (f?.sesuai != null) return f.sesuai
  return isBaru ? undefined : true
}

/** Bagian I — biaya atribusi / kapitalisasi. */
export function atribusiTampil(
  v: InvJawaban['atribusi'], isBaru: boolean,
): InvJawaban['atribusi'] {
  if (v) return v
  return isBaru ? undefined : 'bukan'
}

/**
 * Bagian L — "Digunakan sendiri" dikodekan sbg `penggunaan` KOSONG, yang sama
 * persis dgn "belum dijawab". `null` (baru) = eksplisit dipilih; `undefined`
 * pada lembar LAMA = tersirat "sendiri" (perilaku sebelum 2026-09-24);
 * `undefined` pada lembar BARU = belum dijawab sama sekali.
 */
export function digunakanSendiriTampil(p: InvJawaban['penggunaan'], isBaru: boolean): boolean {
  if (p) return false
  if (p === null) return true
  return !isBaru
}

/**
 * Laporan LHI untuk barang "Tidak ada" (bukan hilang kecurian). Tanpa sebab
 * (lembar lama / golongan tanpa pertanyaan sebab) = III.B.2 persis seperti dulu.
 */
export function lhiTidakAda(sebab: SebabTidakAda | undefined): LhiKode {
  return (SEBAB_TIDAK_ADA.find(x => x.v === sebab)?.lhi as LhiKode | undefined) ?? 'III.B.2'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tidakSesuai = (f: SesuaiField | undefined) => f != null && f.sesuai === false

/**
 * Turunkan satu baris LKI menjadi daftar LHI yang memuatnya. Satu baris BOLEH
 * mengembalikan beberapa kode (keputusan user 2026-07-25) — mis. barang yang
 * kondisinya berubah sekaligus tercatat ganda masuk III.B.7 DAN III.B.9.
 * Fungsi MURNI: dihitung saat render, tidak disimpan, jadi tak bisa drift.
 */
export function klasifikasiLhi(b: InvBaris): LhiKode[] {
  const out: LhiKode[] = []
  const tambah = (k: LhiKode) => { if (!out.includes(k)) out.push(k) }
  const j = b.jawaban || {}

  // III.B.11 — barang belum tercatat (Format III.A.7, tanpa aset_id/NIBAR).
  // Berdiri sendiri: bagian A–R tak berlaku untuk baris ini.
  if (!b.aset_id) return ['III.B.11']

  // G — keberadaan
  if (j.keberadaan === 'hilang') tambah('III.B.1')
  if (j.keberadaan === 'tidak_ditemukan') tambah(lhiTidakAda(j.sebab_tidak_ada))

  // I — biaya atribusi belum dikapitalisasi
  if (j.atribusi === 'ya_induk_diketahui') tambah('III.B.3')
  if (j.atribusi === 'ya_induk_tidak_diketahui') tambah('III.B.4')

  // L — penggunaan oleh pihak lain
  if (j.penggunaan) {
    if (j.penggunaan.pihak === 'pemda') {
      // Hanya jadi temuan kalau memang ada pemakainya (pegawai/pengguna lain).
      if ((j.penggunaan.nama_pemakai || '').trim() || (j.penggunaan.nama || '').trim()) out.push('III.B.5')
    } else {
      out.push('III.B.6')
    }
  }

  // K — perubahan kondisi fisik (bandingkan dgn snapshot "sebelum")
  const sebelum = normalKondisi(b.snapshot?.kondisi)
  if (j.kondisi && sebelum && j.kondisi !== sebelum) out.push('III.B.7')

  // B–D / F / J — perubahan data. Format III.B.8 lebih luas dari sekadar
  // spesifikasi: Kode Barang (sekaligus Nama Barang, karena digabung), Satuan,
  // Alamat, atribut kendaraan (III.A.2), dan atribut teknis JIJ (III.A.4).
  // Jumlah & nilai perolehan TIDAK bisa diubah lewat LKI, jadi tak dibandingkan.
  if (
    tidakSesuai(j.kode_barang) || tidakSesuai(j.spesifikasi) || tidakSesuai(j.satuan) ||
    tidakSesuai(j.wilayah) || tidakSesuai(j.alamat_detail) || tidakSesuai(j.merek_tipe) ||
    tidakSesuai(j.no_polisi) || tidakSesuai(j.no_rangka) || tidakSesuai(j.no_mesin) ||
    tidakSesuai(j.no_bpkb) || tidakSesuai(j.spesifikasi_lainnya) || tidakSesuai(j.luas) ||
    tidakSesuai(j.keterangan_barang) || j.koordinat?.sesuai === false || j.foto_barang?.sesuai === false ||
    tidakSesuai(j.jenis_perkerasan) || tidakSesuai(j.jenis_bahan_jembatan) ||
    tidakSesuai(j.no_ruas_jalan) || tidakSesuai(j.no_jaringan_irigasi)
  ) tambah('III.B.8')

  // M — tercatat ganda
  if (j.ganda) out.push('III.B.9')

  // N — berdiri di atas tanah bukan milik Pemda (Gedung & Bangunan dan JIJ)
  if (j.tanah_milik && j.tanah_milik !== 'pemda') out.push('III.B.10')

  return out
}

/**
 * Isian yang masih kurang sebelum lembar boleh disimpan. Mengembalikan SELURUH
 * kekurangan sekaligus (pola `kekuranganBarangPengadaan`) — penolakan satu per
 * satu memaksa operator menekan Simpan berulang kali.
 *
 * Kenapa sekarang wajib (dulu tidak): di model per-barang, begitu ada barisnya
 * barang itu DIHITUNG "sudah diinventarisasi" & masuk antrean validasi. Lembar
 * yang disimpan tanpa keberadaan/kondisi dulu cuma tampil "Belum" di lembarnya
 * sendiri; sekarang ia akan terbaca selesai padahal kosong.
 *
 * Dipakai form (pesan hidup) DAN penjaga tombol Simpan — satu aturan, dua pintu.
 */
/**
 * Pesan kekurangan foto (R). Diekspor supaya form bisa MENGENALI kekurangan ini
 * (menandai bagian Foto) tanpa mencocokkan teks yang diketik ulang.
 */
export const PESAN_FOTO_LKI = 'Foto barang (R) — sertakan minimal satu foto'

export function kekuranganLki(
  b: Pick<InvBaris, 'aset_id' | 'jawaban'> & {
    /** Foto yang DIUNGGAH petugas di lembar ini. */
    foto_paths?: string[]
    /** Jumlah foto barang yang SUDAH ada di register (`aset.foto_paths`). */
    foto_register?: number
    sebabTidakAda?: boolean; sebabNoun?: string
  },
): string[] {
  const j = b.jawaban || {}
  const kurang: string[] = []

  if (!b.aset_id) {
    const baru = j.baru || {}
    if (!baru.kode_barang) kurang.push('Kode Barang')
    if (!(Number(baru.jumlah) > 0)) kurang.push('Jumlah')
    if (!baru.satuan) kurang.push('Satuan Barang')
    if (!baru.kondisi) kurang.push('Kondisi Barang')
    // Barang temuan tak punya foto di register — satu-satunya sumbernya unggahan.
    if (!(b.foto_paths || []).length) kurang.push(PESAN_FOTO_LKI)
    return kurang
  }

  if (!j.keberadaan) kurang.push('Keberadaan Barang (G)')
  if (j.keberadaan === 'ada' && !j.kondisi) kurang.push('Kondisi Barang (K)')
  if (j.keberadaan === 'tidak_ditemukan' && b.sebabTidakAda) {
    if (!j.sebab_tidak_ada) kurang.push('Sebab barang tidak ada (G)')
    else if (SEBAB_BUTUH_RELASI.includes(j.sebab_tidak_ada) && !j.sebab_relasi?.aset_id) {
      const n = cap(b.sebabNoun || 'bangunan')
      kurang.push(j.sebab_tidak_ada === 'digabung' ? `${n} induk tempat digabung (G)` : `${n} baru hasil rehab (G)`)
    } else if (j.sebab_tidak_ada === 'beberapa_register') {
      const nama = (j.sebab_pecahan || []).map(n => n.trim())
      if (nama.length < 2) kurang.push(`Minimal 2 ${b.sebabNoun || 'bangunan'} hasil pemecahan (G)`)
      else if (nama.some(n => !n)) kurang.push(`Nama ${b.sebabNoun || 'bangunan'} hasil pemecahan (G) ada yang kosong`)
    }
  }

  // "Tidak Sesuai" tanpa menyebut yang seharusnya → LHI III.B.8 mencetak
  // "(kosong)" di kolom Setelah Inventarisasi. Itu bukan temuan, itu isian
  // yang tertinggal.
  if (j.kode_barang?.sesuai === false && !j.kode_barang.kode_baru) kurang.push('Kode Barang yang seharusnya (B–C)')
  if (j.wilayah?.sesuai === false && !j.wilayah.wilayah_kode) kurang.push('Wilayah yang seharusnya (J)')
  const teks: [keyof InvJawaban, string][] = [
    ['spesifikasi', 'Nama Spesifikasi Barang (D)'], ['satuan', 'Satuan Barang (F)'],
    ['merek_tipe', 'Merek / Tipe'], ['no_polisi', 'Nomor Polisi'],
    ['no_rangka', 'Nomor Rangka'], ['no_mesin', 'Nomor Mesin'], ['no_bpkb', 'Nomor BPKB'],
    ['spesifikasi_lainnya', 'Spesifikasi Lainnya'], ['luas', 'Luas'],
    ['alamat_detail', 'Alamat Detail (J)'], ['keterangan_barang', 'Keterangan Barang (Q)'],
    ['jenis_perkerasan', 'Jenis Perkerasan Jalan'], ['jenis_bahan_jembatan', 'Jenis Bahan Struktur Jembatan'],
    ['no_ruas_jalan', 'Nomor Ruas Jalan'], ['no_jaringan_irigasi', 'Nomor Jaringan Irigasi'],
  ]
  for (const [k, label] of teks) {
    const f = j[k] as SesuaiField | undefined
    if (f?.sesuai === false && !(f.seharusnya || '').trim()) kurang.push(`${label} yang seharusnya`)
  }

  if (j.luas?.sesuai === false && (j.luas.seharusnya || '').trim() && !(Number(j.luas.seharusnya) > 0)) {
    kurang.push('Luas yang seharusnya harus berupa angka > 0')
  }
  if (j.koordinat?.sesuai === false && (j.latitude == null || j.longitude == null)) {
    kurang.push('Titik Koordinat yang seharusnya (O)')
  }
  // FOTO WAJIB (keputusan user 2026-10-01): lembar tak boleh disimpan tanpa foto.
  // Cukup SATU dari dua sumber — unggahan petugas, atau foto yang sudah ada di
  // register (kalau petugas menyatakan "Sesuai"). "Tidak Sesuai" tetap menuntut
  // foto TERBARU hasil unggahan, jadi foto lama di register tak menolong di situ.
  // ⚠️ Barang yang HILANG / tak ditemukan dikecualikan — tak ada yang bisa difoto;
  // menuntutnya mengurung petugas di lembar yang tak mungkin dilengkapi. Keberadaan
  // yang belum dipilih TETAP dituntut fotonya, supaya semua kekurangan muncul
  // sekaligus (bukan berantai satu per penolakan).
  const fotoBaru = (b.foto_paths || []).length
  if (j.foto_barang?.sesuai === false && !fotoBaru) kurang.push('Foto barang terbaru (R)')
  else if (
    j.keberadaan !== 'hilang' && j.keberadaan !== 'tidak_ditemukan'
    && !fotoBaru && !((b.foto_register ?? 0) > 0)
  ) kurang.push(PESAN_FOTO_LKI)

  if (j.atribusi === 'ya_induk_diketahui' && !j.induk?.aset_id) kurang.push('Barang induk (I)')
  if (j.ganda && !j.ganda_data?.aset_id) kurang.push('Barang kembaran yang tercatat ganda (M)')
  return kurang
}

// ── Rekomendasi tindak lanjut (TAMPILAN SAJA) ───────────────────────────────
// Modul ini TIDAK mengeksekusi apa pun ke ledger. Teks di bawah hanya memandu
// operator ke menu yang tepat; eksekusinya manual di menu tsb supaya guard
// rantai pembatalan & pola ber-SK yang sudah ada tetap berlaku.
export const REKOMENDASI: Record<LhiKode, { menu: string; saran: string }> = {
  'III.B.1': { menu: 'Penghapusan', saran: 'Usul penghapusan sebab lain setelah proses TGR/laporan kepolisian.' },
  'III.B.2': { menu: 'Penghapusan', saran: 'Telusuri ulang; bila tetap tak ditemukan, usul penghapusan sebab lain.' },
  'III.B.3': { menu: 'Kapitalisasi', saran: 'Serap nilai ke barang induk lewat menu Kapitalisasi.' },
  'III.B.4': { menu: '—', saran: 'Telusuri data induk dulu. Bila tetap tak ditemukan, perlu keputusan pengelola.' },
  'III.B.5': { menu: 'Pengamanan', saran: 'Terbitkan BAST Pengamanan agar kustodi pegawai tercatat resmi.' },
  'III.B.6': { menu: 'Pemanfaatan', saran: 'Bila ada dokumen penguasaan, catat sebagai Pemanfaatan. Bila tidak, tempuh penertiban.' },
  'III.B.7': { menu: 'Koreksi', saran: 'Perbarui kondisi barang lewat Koreksi Spesifikasi.' },
  'III.B.8': { menu: 'Koreksi / Reklasifikasi', saran: 'Perubahan spesifikasi → Koreksi Spesifikasi. Perubahan Kode Barang → Reklasifikasi Kesalahan Kodefikasi. Seharusnya beberapa register → Koreksi lalu tindak lanjuti lewat Pemecahan Barang.' },
  'III.B.9': { menu: 'Koreksi', saran: 'Gabungkan lewat Koreksi Pencatatan Ganda.' },
  'III.B.10': { menu: '—', saran: 'Perlu penyelesaian status tanah dengan pemilik lahan.' },
  'III.B.11': { menu: 'Hasil Inventarisasi', saran: 'Catat sebagai perolehan lewat menu Cara Perolehan → Hasil Inventarisasi.' },
}
