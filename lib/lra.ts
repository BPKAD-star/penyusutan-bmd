// LRA — Realisasi Belanja Modal (bahan Rekonsiliasi). Helper murni (parse Excel
// + agregasi), dipakai LraImport, LraTagModal & halaman LRA.
// Lihat docs/lra-plan.md.

// Belanja Modal 5.2.0x → jenis aset tetap (BAS nasional, stabil — keputusan #9).
// kode_bmd = golongan BMD padanannya (dipakai fallback sisi aplikasi).
export const JENIS_BM: { grup: string; kode_bmd: string; uraian: string }[] = [
  { grup: '5.2.01', kode_bmd: '1.3.1', uraian: 'Tanah' },
  { grup: '5.2.02', kode_bmd: '1.3.2', uraian: 'Peralatan dan Mesin' },
  { grup: '5.2.03', kode_bmd: '1.3.3', uraian: 'Gedung dan Bangunan' },
  { grup: '5.2.04', kode_bmd: '1.3.4', uraian: 'Jalan, Jaringan dan Irigasi' },
  { grup: '5.2.05', kode_bmd: '1.3.5', uraian: 'Aset Tetap Lainnya' },
]
export const GRUP_LIST = JENIS_BM.map(j => j.grup)

// Fallback sisi aplikasi: pengadaan lama tanpa payload.kode_rekening → tebak
// dari golongan aset. Sejalan REK_MODAL_PER_GOLONGAN di Pengadaan.tsx.
export const GOLONGAN_KE_GRUP: Record<string, string> = {
  '1.3.1': '5.2.01', '1.3.2': '5.2.02', '1.3.3': '5.2.03', '1.3.4': '5.2.04', '1.3.5': '5.2.05',
}

export const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Satu baris realisasi (subset kolom DB + turunan generated).
export type LraRow = {
  id: number
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

// Baris pengadaan sisi aplikasi (sudah dinormalisasi ke grup 5.2.0x).
// grup null / di luar 5.2.01–05 → masuk `luarJenis`, tidak hilang diam-diam.
export type AppRow = { grup: string | null; bulan: number; nilai: number }

// ── Parse sel Excel ─────────────────────────────────────────────────────────

// Sel "Uraian" gabungan: "5.2.02.05.001.00005 - Belanja Modal Alat Kantor Lainnya".
export function parseKodeUraian(cell: unknown): { kode: string; uraian: string } {
  const s = String(cell ?? '').trim()
  const m = s.match(/^([0-9][0-9.]*[0-9])\s*[-–]\s*(.*)$/)
  if (m) return { kode: m[1], uraian: m[2].trim() }
  const m2 = s.match(/^([0-9][0-9.]*[0-9]|[0-9])/)
  const kode = m2 ? m2[1].replace(/\.+$/, '') : ''
  const uraian = s.slice(kode.length).replace(/^\s*[-–]\s*/, '').trim()
  return { kode, uraian }
}

// Debit format Indonesia: "28.140.002,00" → 28140002.
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
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : toISO(d)
}
function toISO(d: Date): string {
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

// ── Matriks rekap (jenis 5.2.0x × 12 bulan) ─────────────────────────────────
export type RekapMatrix = {
  perJenis: Record<string, number[]>   // grup → 12 bulan (index 0..11)
  totalBulan: number[]
  totalJenis: Record<string, number>
  totalKeseluruhan: number
  luarJenis: number                    // nilai yg grup-nya di luar 5.2.01–05 (tak masuk matriks)
}

export function buildMatrix(entries: { grup: string | null; bulan: number; nilai: number }[]): RekapMatrix {
  const perJenis: Record<string, number[]> = {}
  for (const g of GRUP_LIST) perJenis[g] = new Array(12).fill(0)
  const totalBulan = new Array(12).fill(0)
  let luarJenis = 0
  for (const e of entries) {
    const b = (e.bulan || 0) - 1
    if (b < 0 || b > 11) continue
    const arr = e.grup ? perJenis[e.grup] : undefined
    if (!arr) { luarJenis += e.nilai; continue }
    arr[b] += e.nilai
    totalBulan[b] += e.nilai
  }
  const totalJenis: Record<string, number> = {}
  let totalKeseluruhan = 0
  for (const g of GRUP_LIST) {
    const t = perJenis[g].reduce((s, v) => s + v, 0)
    totalJenis[g] = t
    totalKeseluruhan += t
  }
  return { perJenis, totalBulan, totalJenis, totalKeseluruhan, luarJenis }
}

// Box LRA — seluruh belanja modal (5.2) hasil import, termasuk yg ditandai reklas
// (reklas dikurangkan di baris tersendiri, bukan disaring di sini).
export const rekapModal = (rows: LraRow[]): RekapMatrix =>
  buildMatrix(rows.filter(r => r.kelompok === 'modal').map(r => ({ grup: r.kode_grup3, bulan: r.bulan, nilai: r.debit })))

// Kapitalisasi — baris 5.1 yg ditandai, masuk ke jenis TUJUAN pilihan user.
export const rekapKapitalisasi = (rows: LraRow[]): RekapMatrix =>
  buildMatrix(rows.filter(r => r.klasifikasi === 'kapitalisasi').map(r => ({ grup: r.jenis_tujuan, bulan: r.bulan, nilai: r.debit })))

// Reklasifikasi keluar — baris 5.2 yg ditandai, dikurangkan dari jenisnya sendiri.
export const rekapReklas = (rows: LraRow[]): RekapMatrix =>
  buildMatrix(rows.filter(r => r.klasifikasi === 'reklas_keluar').map(r => ({ grup: r.kode_grup3, bulan: r.bulan, nilai: r.debit })))

export const rekapApp = (rows: AppRow[]): RekapMatrix =>
  buildMatrix(rows.map(r => ({ grup: r.grup, bulan: r.bulan, nilai: r.nilai })))

// Check per (jenis, bulan): LRA + Kapitalisasi − Reklas − BelanjaModalApp.
// 0 = cocok. Dipakai badge ✓/selisih.
export function selisihMatrix(lra: RekapMatrix, kap: RekapMatrix, rek: RekapMatrix, app: RekapMatrix) {
  const perJenis: Record<string, number> = {}
  let total = 0
  for (const g of GRUP_LIST) {
    const d = (lra.totalJenis[g] + kap.totalJenis[g] - rek.totalJenis[g]) - app.totalJenis[g]
    perJenis[g] = d
    total += d
  }
  return { perJenis, total }
}
