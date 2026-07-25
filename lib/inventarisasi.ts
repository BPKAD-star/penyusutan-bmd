// Modul Inventarisasi BMD (Permendagri 47/2021) — tipe, konfigurasi form, dan
// klasifikasi laporan. NON-LEDGER: tak ada satu pun fungsi di sini yang menulis
// `transaksi_bmd` atau mengubah `aset` (lihat migrasi 20260725_08).
//
// KONSEP INTI — LKI SUMBER, LHI TURUNAN:
//   Lembar Kerja Inventarisasi (LKI, Format III.A.1–III.A.7) = form PER-BARANG
//   berisi checklist bagian A–R. Laporan Hasil Inventarisasi (LHI, Format
//   III.B.1–III.B.11) TIDAK diinput terpisah — semuanya diturunkan dari jawaban
//   LKI lewat `klasifikasiLhi()`. Satu baris boleh masuk BEBERAPA LHI sekaligus
//   (mis. kondisi berubah DAN tercatat ganda).
import { GOLONGAN_REKAP } from '@/lib/bmd'

// ── Header ──────────────────────────────────────────────────────────────────
export type InvStatus = 'draft' | 'diajukan' | 'divalidasi' | 'dikembalikan'

export const STATUS_LABEL: Record<InvStatus, string> = {
  draft: 'Draft', diajukan: 'Diajukan', divalidasi: 'Divalidasi', dikembalikan: 'Dikembalikan',
}
export const STATUS_BADGE: Record<InvStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  diajukan: 'bg-amber-100 text-amber-700',
  divalidasi: 'bg-teal/10 text-teal',
  dikembalikan: 'bg-red-100 text-red-700',
}

/** Petugas/pelaksana inventarisasi — diambil dari admin_pegawai, bukan ketik bebas. */
export type Petugas = { pegawai_id: string; nama: string; nip: string | null; jabatan: string | null }

export type InvHeader = {
  id: string
  skpd_id: number
  tahun: number
  golongan: string
  status: InvStatus
  catatan_validator: string | null
  petugas: Petugas[]
  keterangan: string | null
  diajukan_at: string | null
  divalidasi_at: string | null
  created_at: string
  skpd?: { nama: string } | null
}

// ── Baris (satu lembar LKI) ─────────────────────────────────────────────────
/** Kondisi "SEBELUM" — dibekukan saat baris digenerate dari `aset`. */
export type InvSnapshot = {
  nibar?: string | null
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
  skpd_id?: number | null
}

/** Bagian A–D & J: "Sesuai" atau "Tidak Sesuai, sebutkan yang seharusnya". */
export type SesuaiField = { sesuai: boolean; seharusnya?: string }

export type PihakPengguna = 'pemda' | 'pempus' | 'pemda_lain' | 'pihak_lain'
export type KondisiFisik = 'B' | 'RR' | 'RB'

export type InvJawaban = {
  // A–D
  kode_register?: SesuaiField
  kode_barang?: SesuaiField
  nama_barang?: SesuaiField
  spesifikasi?: SesuaiField
  // E–F
  jumlah?: number
  satuan?: string
  // G — Keberadaan Barang
  keberadaan?: 'ada' | 'hilang' | 'tidak_ditemukan'
  jumlah_tidak_ada?: number
  // H
  nilai_perolehan?: number
  // I — biaya atribusi / menambah kapasitas manfaat (kapitalisasi)
  atribusi?: 'ya_induk_diketahui' | 'ya_induk_tidak_diketahui' | 'bukan'
  induk?: {
    aset_id?: string | null
    nibar?: string; kode_barang?: string; kode_lokasi?: string
    kode_register?: string; nama_barang?: string; spesifikasi?: string
  }
  // J–K
  alamat?: SesuaiField
  kondisi?: KondisiFisik
  // L — Penggunaan Barang
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
  }
  // M — tercatat ganda
  ganda?: boolean
  ganda_data?: {
    nibar?: string; kode_register?: string; kode_barang?: string
    nama_barang?: string; spesifikasi?: string; jumlah?: number; satuan?: string
    nilai_perolehan?: number; tgl_perolehan?: string
    pemegang?: string          // Pengelola / Pengguna Barang Lainnya / Kuasa PB Lainnya
  }
  // N — KHUSUS Gedung & Bangunan: berdiri di atas tanah milik siapa
  tanah_milik?: PihakPengguna
  tanah_milik_nama?: string
  // O–Q
  latitude?: number | null
  longitude?: number | null
  lainnya?: string
  keterangan?: string
  // Khusus Peralatan & Mesin
  merek_tipe?: SesuaiField
  no_polisi?: SesuaiField
  no_rangka?: SesuaiField
  no_mesin?: SesuaiField
  /** Format III.A.7 — BMD Belum Tercatat (barang belum ada di `aset`, tanpa NIBAR). */
  baru?: {
    kode_barang?: string; nama_barang?: string; spesifikasi?: string
    kode_register?: string; merek_tipe?: string
    no_polisi?: string; no_rangka?: string; no_mesin?: string
    jumlah?: number; satuan?: string
    harga_satuan?: number; nilai_perolehan?: number
    tgl_perolehan?: string; alamat?: string
    dasar_pencatatan?: string
    kondisi?: KondisiFisik
  }
}

export type InvBaris = {
  id: string
  inventarisasi_id: string
  aset_id: string | null
  snapshot: InvSnapshot
  jawaban: InvJawaban
  foto_paths: string[]
}

// ── Konfigurasi form LKI per golongan ───────────────────────────────────────
// SATU komponen form yang dikonfigurasi — bukan 7 komponen terpisah, karena
// isian ke-7 format itu ±90% sama; yang beda cuma bagian di bawah ini.
export type LkiConfig = {
  format: string
  label: string
  /** Bagian Merek/Tipe (Peralatan & Mesin). Tanah & GB tidak punya. */
  merekTipe: boolean
  /** No. Polisi / Rangka / Mesin (kendaraan dinas — Peralatan & Mesin). */
  nomorKendaraan: boolean
  /** G pecah jadi Hilang vs Tidak ditemukan (P&M); selain itu digabung. */
  hilangVsTidakDitemukan: boolean
  /** Nama pemakai + BAST pemakaian + SIP (rumah negara — Gedung & Bangunan). */
  pemakaiRumahNegara: boolean
  /** Bagian N "berdiri di atas tanah milik" — HANYA Gedung & Bangunan. */
  tanahMilik: boolean
  /** Titik koordinat (Tanah, GB, JIJ). */
  titikKoordinat: boolean
}

const DEFAULT_CONFIG: Omit<LkiConfig, 'format' | 'label'> = {
  merekTipe: false, nomorKendaraan: false, hilangVsTidakDitemukan: false,
  pemakaiRumahNegara: false, tanahMilik: false, titikKoordinat: true,
}

// ⚠️ Isi persis Format III.A.4–III.A.6 (JIJ / ATL / lainnya) BELUM diverifikasi
// dari PDF — konfigurasi di bawah memakai default konservatif. Sebelum
// mengaktifkan golongan tsb, baca dulu halaman 7–12 PDF Lembar Kerja.
export const LKI_CONFIG: Record<string, LkiConfig> = {
  '1.3.1': { format: 'III.A.1', label: 'Tanah', ...DEFAULT_CONFIG },
  '1.3.2': {
    format: 'III.A.2', label: 'Peralatan dan Mesin', ...DEFAULT_CONFIG,
    merekTipe: true, nomorKendaraan: true, hilangVsTidakDitemukan: true, titikKoordinat: false,
  },
  '1.3.3': {
    format: 'III.A.3', label: 'Gedung dan Bangunan', ...DEFAULT_CONFIG,
    pemakaiRumahNegara: true, tanahMilik: true,
  },
  '1.3.4': { format: 'III.A.4', label: 'Jalan, Jaringan dan Irigasi', ...DEFAULT_CONFIG },
  '1.3.5': { format: 'III.A.5', label: 'Aset Tetap Lainnya', ...DEFAULT_CONFIG, titikKoordinat: false },
  '1.3.6': { format: 'III.A.6', label: 'Konstruksi Dalam Pengerjaan', ...DEFAULT_CONFIG },
  '1.5.3': { format: 'III.A.6', label: 'Aset Tidak Berwujud', ...DEFAULT_CONFIG, titikKoordinat: false },
  '1.5.4': { format: 'III.A.6', label: 'Aset Lain-Lain', ...DEFAULT_CONFIG, titikKoordinat: false },
}

/** Format III.A.7 — BMD Belum Tercatat (berdiri sendiri, tak terikat golongan). */
export const FORMAT_BELUM_TERCATAT = 'III.A.7'

export const konfigLki = (golongan: string): LkiConfig =>
  LKI_CONFIG[golongan] || { format: 'III.A.6', label: golongan, ...DEFAULT_CONFIG }

/** Golongan yang boleh diinventarisasi — ikut daftar rekap BMD yang sudah ada. */
export const GOLONGAN_OPSI = GOLONGAN_REKAP.map(g => ({
  kode: g.kode,
  label: `${g.kode} — ${LKI_CONFIG[g.kode]?.label || g.uraian}`,
}))

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

const tidakSesuai = (f: SesuaiField | undefined) => f != null && f.sesuai === false

/**
 * Turunkan satu baris LKI menjadi daftar LHI yang memuatnya. Satu baris BOLEH
 * mengembalikan beberapa kode (keputusan user 2026-07-25) — mis. barang yang
 * kondisinya berubah sekaligus tercatat ganda masuk III.B.7 DAN III.B.9.
 * Fungsi MURNI: dihitung saat render, tidak disimpan, jadi tak bisa drift.
 */
export function klasifikasiLhi(b: InvBaris): LhiKode[] {
  const out: LhiKode[] = []
  const j = b.jawaban || {}

  // III.B.11 — barang belum tercatat (Format III.A.7, tanpa aset_id/NIBAR).
  // Berdiri sendiri: bagian A–R tak berlaku untuk baris ini.
  if (!b.aset_id) return ['III.B.11']

  // G — keberadaan
  if (j.keberadaan === 'hilang') out.push('III.B.1')
  if (j.keberadaan === 'tidak_ditemukan') out.push('III.B.2')

  // I — biaya atribusi belum dikapitalisasi
  if (j.atribusi === 'ya_induk_diketahui') out.push('III.B.3')
  if (j.atribusi === 'ya_induk_tidak_diketahui') out.push('III.B.4')

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

  // A–D / E / J — perubahan data. CATATAN: format III.B.8 lebih luas dari sekadar
  // spesifikasi — mencakup Kode Barang, Nama Barang, Kode Register, Jumlah, Alamat.
  const jumlahBerubah = j.jumlah != null && b.snapshot?.jumlah != null && Number(j.jumlah) !== Number(b.snapshot.jumlah)
  if (
    tidakSesuai(j.kode_register) || tidakSesuai(j.kode_barang) || tidakSesuai(j.nama_barang) ||
    tidakSesuai(j.spesifikasi) || tidakSesuai(j.alamat) || tidakSesuai(j.merek_tipe) ||
    tidakSesuai(j.no_polisi) || tidakSesuai(j.no_rangka) || tidakSesuai(j.no_mesin) ||
    jumlahBerubah
  ) out.push('III.B.8')

  // M — tercatat ganda
  if (j.ganda) out.push('III.B.9')

  // N — berdiri di atas tanah bukan milik Pemda (khusus Gedung & Bangunan)
  if (j.tanah_milik && j.tanah_milik !== 'pemda') out.push('III.B.10')

  return out
}

/** Baris dianggap "sudah diisi" kalau minimal keberadaan & kondisi terjawab. */
export function sudahDiisi(b: InvBaris): boolean {
  if (!b.aset_id) return !!b.jawaban?.baru?.nama_barang
  const j = b.jawaban || {}
  return !!j.keberadaan && (j.keberadaan !== 'ada' || !!j.kondisi)
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
  'III.B.8': { menu: 'Koreksi / Reklasifikasi', saran: 'Perubahan spesifikasi → Koreksi Spesifikasi. Perubahan Kode Barang → Reklasifikasi Kesalahan Kodefikasi.' },
  'III.B.9': { menu: 'Koreksi', saran: 'Gabungkan lewat Koreksi Pencatatan Ganda.' },
  'III.B.10': { menu: '—', saran: 'Perlu penyelesaian status tanah dengan pemilik lahan.' },
  'III.B.11': { menu: 'Hasil Inventarisasi', saran: 'Catat sebagai perolehan lewat menu Cara Perolehan → Hasil Inventarisasi.' },
}
