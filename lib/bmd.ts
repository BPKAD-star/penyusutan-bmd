// Helper domain BMD — kategori, periode, konstanta bersama.
// Kategori TIDAK di-hardcode label-nya: label diambil dari kodefikasi_bmd;
// di sini cuma aturan perlakuan per prefix kode level-3 (PLAN §8).

export type Perlakuan = 'penyusutan' | 'amortisasi' | 'tidak' | 'lain_lain'

/** Prefix level-3 dari kode lengkap, mis. '1.3.2.05.01.05.068' → '1.3.2' */
export function kodeLevel3(kode: string): string {
  return kode.split('.').slice(0, 3).join('.')
}

/** Perlakuan penyusutan per golongan (PLAN §3, §8). Exclusion di engine, bukan Daftar Barang. */
export function perlakuanKode(kode: string): Perlakuan {
  const p = kodeLevel3(kode)
  switch (p) {
    case '1.3.2': // Peralatan dan Mesin
    case '1.3.3': // Gedung dan Bangunan
    case '1.3.4': // Jalan, Jaringan dan Irigasi
      return 'penyusutan'
    case '1.5.3': // Aset Tidak Berwujud
      return 'amortisasi'
    case '1.5.4': // Aset Lain-Lain — disusutkan, stop saat reklas masuk (PLAN §7)
      return 'lain_lain'
    default:      // 1.3.1 Tanah, 1.3.5 ATL, 1.3.6 KDP, dan lainnya
      return 'tidak'
  }
}

/** Golongan yang tampil di Daftar Barang (PLAN §8) — label diambil dari data. */
export const GOLONGAN_DAFTAR_BARANG = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']

/**
 * Golongan untuk rekapitulasi penyusutan (KIB Tanah s.d. Aset Lain-Lain).
 * Uraian = penamaan kanonik Permendagri 108/2016 (dipakai sebagai header laporan).
 * `disusutkan=false` → kolom beban & akumulasi ditampilkan "-".
 */
export const GOLONGAN_REKAP: { kode: string; uraian: string; disusutkan: boolean }[] = [
  { kode: '1.3.1', uraian: 'Tanah', disusutkan: false },
  { kode: '1.3.2', uraian: 'Peralatan dan Mesin', disusutkan: true },
  { kode: '1.3.3', uraian: 'Gedung dan Bangunan', disusutkan: true },
  { kode: '1.3.4', uraian: 'Jalan, Jaringan dan Irigasi', disusutkan: true },
  { kode: '1.3.5', uraian: 'Aset Tetap Lainnya', disusutkan: false },
  { kode: '1.3.6', uraian: 'Konstruksi Dalam Pengerjaan', disusutkan: false },
  { kode: '1.5.3', uraian: 'Aset Tidak Berwujud', disusutkan: true },
  { kode: '1.5.4', uraian: 'Aset Lain-Lain', disusutkan: true },
]

// ── Periode semesteran ──────────────────────────────────────────────────────
export type Periode = { tahun: number; smt: 1 | 2 }

export function parsePeriode(p: string): Periode {
  const m = p.match(/^(\d{4})-S([12])$/)
  if (!m) throw new Error(`Format periode tidak valid: ${p} (harus YYYY-S1/YYYY-S2)`)
  return { tahun: parseInt(m[1], 10), smt: parseInt(m[2], 10) as 1 | 2 }
}

export function formatPeriode(p: Periode): string {
  return `${p.tahun}-S${p.smt}`
}

export function nextPeriode(p: Periode): Periode {
  return p.smt === 1 ? { tahun: p.tahun, smt: 2 } : { tahun: p.tahun + 1, smt: 1 }
}

/** -1 kalau a<b, 0 sama, 1 a>b */
export function comparePeriode(a: string, b: string): number {
  const pa = parsePeriode(a), pb = parsePeriode(b)
  const ka = pa.tahun * 2 + pa.smt, kb = pb.tahun * 2 + pb.smt
  return ka === kb ? 0 : ka < kb ? -1 : 1
}

/** Semua periode dari `after` (eksklusif) sampai `until` (inklusif). */
export function periodeRange(after: string, until: string): string[] {
  const out: string[] = []
  let cur = nextPeriode(parsePeriode(after))
  const end = parsePeriode(until)
  while (cur.tahun * 2 + cur.smt <= end.tahun * 2 + end.smt) {
    out.push(formatPeriode(cur))
    cur = nextPeriode(cur)
  }
  return out
}

/** Periode berjalan dari tanggal (untuk transaksi baru). */
export function periodeDariTanggal(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-S${dt.getMonth() < 6 ? 1 : 2}`
}

// ── Label jenis transaksi (UI) ──────────────────────────────────────────────
export const JENIS_TRANSAKSI_LABEL: Record<string, string> = {
  saldo_awal: 'Saldo Awal',
  pengadaan: 'Pengadaan',
  hibah_masuk: 'Hibah Masuk',
  hasil_inventarisasi: 'Hasil Inventarisasi',
  perolehan_lainnya: 'Perolehan Lainnya',
  mutasi_internal: 'Pengeluaran/Penerimaan Internal',
  pengalihan_status: 'Pengalihan Status (Antar SKPD)',
  reklas_kode: 'Reklasifikasi Kode Barang',
  reklas_komptabel: 'Reklasifikasi Komptabel',
  koreksi_nilai: 'Koreksi Nilai',
  koreksi_spesifikasi: 'Koreksi Spesifikasi',
  koreksi_kuantitas: 'Koreksi Kuantitas',
  kapitalisasi: 'Kapitalisasi / Penambahan Masa Manfaat',
  penghapusan_pemindahtanganan: 'Penghapusan — Pemindahtanganan',
  penghapusan_sebab_lain: 'Penghapusan — Sebab Lain',
  batal_penghapusan: 'Pembatalan Penghapusan',
}

export const JENIS_PEROLEHAN = ['pengadaan', 'hibah_masuk', 'hasil_inventarisasi', 'perolehan_lainnya'] as const
export const JENIS_PENGHAPUSAN = ['penghapusan_pemindahtanganan', 'pengalihan_status', 'penghapusan_sebab_lain'] as const

/** Gabung 7 segmen kode template e-bmd → '1.3.2.05.01.05.068' (PLAN §5A). */
export function gabungKode(segments: (string | number | null | undefined)[]): string {
  return segments
    .filter(s => s !== null && s !== undefined && String(s).trim() !== '')
    .map(s => String(s).trim())
    .join('.')
}
