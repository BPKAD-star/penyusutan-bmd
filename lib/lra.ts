// LRA — Realisasi Belanja (bahan Rekonsiliasi Belanja Modal). Fase A.
// Helper murni (parse Excel + agregasi), dipakai LraImport & halaman LRA.
// Lihat docs/lra-plan.md.

// Belanja Modal 5.2.0x → jenis aset tetap (BAS nasional, stabil — keputusan #9).
// kode_bmd = golongan BMD padanannya (dipakai Fase B utk banding entry app).
export const JENIS_BM: { grup: string; kode_bmd: string; uraian: string }[] = [
  { grup: '5.2.01', kode_bmd: '1.3.1', uraian: 'Tanah' },
  { grup: '5.2.02', kode_bmd: '1.3.2', uraian: 'Peralatan dan Mesin' },
  { grup: '5.2.03', kode_bmd: '1.3.3', uraian: 'Gedung dan Bangunan' },
  { grup: '5.2.04', kode_bmd: '1.3.4', uraian: 'Jalan, Jaringan dan Irigasi' },
  { grup: '5.2.05', kode_bmd: '1.3.5', uraian: 'Aset Tetap Lainnya' },
]

export const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Satu baris realisasi (bentuk yg dipakai UI, subset kolom DB + turunan).
export type LraRow = {
  skpd_id: number
  tanggal: string        // yyyy-mm-dd
  bulan: number          // 1..12
  no_bukti: string
  kode_rekening: string
  kode_grup3: string     // 5.2.02
  kelompok: 'modal' | 'barjas' | 'lain'
  uraian: string
  keterangan: string
  debit: number
  klasifikasi: 'kapitalisasi' | 'reklas_keluar' | null
  jenis_tujuan: string | null
}

// ── Parse sel Excel ─────────────────────────────────────────────────────────

// Sel "Uraian" gabungan: "5.2.02.05.001.00005 - Belanja Modal Alat Kantor Lainnya".
// kode = token angka-titik di depan; uraian = sisanya setelah pemisah " - ".
export function parseKodeUraian(cell: unknown): { kode: string; uraian: string } {
  const s = String(cell ?? '').trim()
  const m = s.match(/^([0-9][0-9.]*[0-9])\s*[-–]\s*(.*)$/)
  if (m) return { kode: m[1], uraian: m[2].trim() }
  const m2 = s.match(/^([0-9][0-9.]*[0-9]|[0-9])/)
  const kode = m2 ? m2[1].replace(/\.+$/, '') : ''
  const uraian = s.slice(kode.length).replace(/^\s*[-–]\s*/, '').trim()
  return { kode, uraian }
}

// Debit format Indonesia: "28.140.002,00" → 28140002. Angka mentah dipakai apa
// adanya. String: buang non-[digit , . -], titik = ribuan (dibuang), koma = desimal.
export function parseDebit(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  let s = String(v ?? '').trim().replace(/[^0-9,.-]/g, '')
  if (!s) return 0
  s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// Tanggal Excel → yyyy-mm-dd. Dukung Date, serial number, "dd/mm/yyyy".
export function parseTanggal(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toISO(v)
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : toISO(d)
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)   // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : toISO(d)
}
function toISO(d: Date): string {
  // pakai komponen lokal supaya tanggal tak geser gara-gara timezone.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function grup3(kode: string): string {
  const m = kode.match(/^[0-9]+\.[0-9]+\.[0-9]+/)
  return m ? m[0] : ''
}
export function kelompokDari(kode: string): 'modal' | 'barjas' | 'lain' {
  if (kode.startsWith('5.2.')) return 'modal'
  if (kode.startsWith('5.1.')) return 'barjas'
  return 'lain'
}

// ── Agregasi rekap Box LRA (belanja modal 5.2, per jenis × bulan) ────────────
export type RekapModal = {
  // per grup 5.2.0x → 12 bulan; index 0..11
  perJenis: Record<string, number[]>
  totalBulan: number[]          // total semua jenis per bulan
  totalJenis: Record<string, number>
  totalKeseluruhan: number
}

export function rekapModal(rows: LraRow[]): RekapModal {
  const perJenis: Record<string, number[]> = {}
  for (const j of JENIS_BM) perJenis[j.grup] = new Array(12).fill(0)
  const totalBulan = new Array(12).fill(0)
  for (const r of rows) {
    if (r.kelompok !== 'modal') continue
    const arr = perJenis[r.kode_grup3]
    if (!arr) continue                       // 5.2.0x di luar 01–05 → dilewati
    const b = (r.bulan || 1) - 1
    if (b < 0 || b > 11) continue
    arr[b] += r.debit
    totalBulan[b] += r.debit
  }
  const totalJenis: Record<string, number> = {}
  let totalKeseluruhan = 0
  for (const j of JENIS_BM) {
    const t = perJenis[j.grup].reduce((s, v) => s + v, 0)
    totalJenis[j.grup] = t
    totalKeseluruhan += t
  }
  return { perJenis, totalBulan, totalJenis, totalKeseluruhan }
}
