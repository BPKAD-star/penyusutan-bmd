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

// Baris pengadaan sisi aplikasi, hasil `fn_lra_belanja_modal`.
//   grup     = jenis belanja (5.2.0x) dari `payload.kode_rekening`;
//   golongan = jenis BARANG (3 segmen kode BMD, mis. '1.3.2') dari `aset.golongan`.
// Dua sumbu itulah yang bikin tabel Persilangan mungkin — lihat `silangRekBarang`.
// grup null / di luar 5.2.01–05 → masuk `luarJenis`, tidak hilang diam-diam.
// ⚠️ `golongan` bisa `undefined` kalau kode dideploy sebelum migrasi
// 20260909_01 jalan. Itu SENGAJA dibedakan dari null/'' — "tak bisa dinilai",
// bukan "tak punya golongan"; lihat `statusSilang`.
// ⚠️ `skpd_id` baru ada sejak migrasi 20260910_05 (Rekap per SKPD berjenjang) —
// `COALESCE(t.skpd_tujuan, a.skpd_id)`, sama persis dgn ekspresi yg dipakai
// WHERE-clause RPC-nya sendiri. `null` kalau migrasinya belum jalan.
export type AppRow = { skpd_id: number | null; grup: string | null; golongan: string | null; bulan: number; nilai: number }

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

// Entryan aplikasi, DASAR KODE REKENING — sebanding langsung dgn box LRA
// (keduanya dikelompokkan per jenis belanja).
export const rekapApp = (rows: AppRow[]): RekapMatrix =>
  buildMatrix(rows.map(r => ({ grup: r.grup, bulan: r.bulan, nilai: r.nilai })))

// Entryan aplikasi, DASAR KODE BARANG — golongan BMD dipetakan ke jenis belanja
// padanannya supaya tabelnya tetap 5 baris & Check tetap sebanding dgn LRA.
// ⚠️ Golongan TANPA padanan (1.3.6 KDP, 1.5.3 ATB, 1.5.4 Aset Lain-Lain) jatuh
// ke `luarJenis`, jadi TOTAL kedua dasar BISA BERBEDA — dan itu memang jawaban
// yang benar: termin konstruksi adalah realisasi belanja modal yang BELUM jadi
// aset tetap. Halaman WAJIB melaporkan angka itu (jangan dibuang diam-diam).
export const rekapAppBarang = (rows: AppRow[]): RekapMatrix =>
  buildMatrix(rows.map(r => ({
    grup: r.golongan ? GOLONGAN_KE_GRUP[r.golongan] ?? null : null,
    bulan: r.bulan, nilai: r.nilai,
  })))

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

// ── Persilangan rekening × kode barang ──────────────────────────────────────
// "Belanja dari rekening A, barangnya golongan B." Sampai 2026-09-09 hal ini
// MUSTAHIL terlihat di halaman LRA: kedua sisi Check sama-sama dihitung dari
// rekening, jadi persilangan apa pun tetap ✓. Kejadian nyata yang melahirkan
// tabel ini: "Backdrop" Kecamatan Banyakan Rp19.955.000 — rekening 5.2.03
// (Gedung dan Bangunan), kode barang 1.3.2.05.02.06.027 (Alat Hiasan =
// Peralatan dan Mesin).

/** Label kolom Persilangan. Kelima jenis aset tetap + KDP SELALU tampil (kolom
 *  nol pun berarti: "tak ada belanja yang mendarat di sini"); golongan lain
 *  yang muncul di data ditambahkan sbg kolom ekstra oleh `silangRekBarang`. */
export const GOL_TETAP = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6']
export const GOL_URAIAN: Record<string, string> = {
  '1.3.1': 'Tanah',
  '1.3.2': 'Peralatan dan Mesin',
  '1.3.3': 'Gedung dan Bangunan',
  '1.3.4': 'Jalan, Jaringan dan Irigasi',
  '1.3.5': 'Aset Tetap Lainnya',
  '1.3.6': 'Konstruksi Dalam Pengerjaan',
  '1.5.3': 'Aset Tidak Berwujud',
  '1.5.4': 'Aset Lain-Lain',
}

/** Kunci baris/kolom untuk nilai yang tak punya rekening / tak punya golongan.
 *  Sengaja BUKAN dibuang: yang tak bisa dinilai tetap harus kelihatan. */
export const TANPA_REK = '(tanpa kode rekening)'
export const TANPA_GOL = '(tanpa kode barang)'

/**
 * Apakah rekening & golongan sepadan?
 *   true  = cocok (mis. 5.2.02 ↔ 1.3.2)
 *   false = SILANG — inilah yang dicari
 *   null  = TAK BISA DINILAI (salah satu sisi tak diketahui, atau golongannya
 *           tak punya padanan jenis belanja spt 1.3.6 KDP)
 * ⚠️ `null` sengaja dibedakan dari `false`, pola yang sama dgn
 * `bergeserDariNibar` (lib/kodeRegister.ts): yang tak bisa dinilai JANGAN
 * ditandai temuan — menuduh persilangan yang tak terbukti sama buruknya dgn
 * melewatkan yang terbukti.
 */
export function statusSilang(grup: string | null, golongan: string | null): boolean | null {
  if (!grup || !golongan) return null
  const padanan = GOLONGAN_KE_GRUP[golongan]
  if (!padanan) return null
  return padanan === grup
}

export type Silang = {
  /** Kunci baris, urut: GRUP_LIST → grup lain yang muncul → TANPA_REK. */
  baris: string[]
  /** Kunci kolom, urut: GOL_TETAP → golongan lain yang muncul → TANPA_GOL. */
  kolom: string[]
  sel: Record<string, Record<string, number>>
  totalBaris: Record<string, number>
  totalKolom: Record<string, number>
  total: number
  /** Σ sel yang statusnya TERBUKTI silang (false). Yang `null` tidak ikut. */
  nilaiSilang: number
  /** Banyaknya sel silang — dipakai kalimat ringkasan di layar. */
  nSelSilang: number
}

// ── Rekap per SKPD berjenjang (2026-09-10) ──────────────────────────────────
// Kolom yang diminta user: Total LRA · Kapitalisasi · Reklasifikasi · Belanja
// Modal (App). SENGAJA tidak dipecah per jenis/bulan spt RekapMatrix di atas —
// pohon SKPD sudah cukup dalam (bisa 3-4 level), menambah kolom jenis×bulan di
// atasnya bikin tabelnya mustahil dibaca. Rincian per jenis/bulan tetap ada di
// tab "Ringkasan" (matriks datar yang sudah ada), yang sudah bisa difilter ke
// satu SKPD lewat SkpdCombobox.
export type LraCell = { totalLra: number; kapitalisasi: number; reklas: number; belanjaModal: number }

/**
 * Kumpulkan `rows` (LRA) + `app` (Entryan Aplikasi, dasar KODE REKENING —
 * sebanding langsung dgn box LRA, sama seperti Check bawaan) per SKPD LEAF
 * (`r.skpd_id`/`a.skpd_id` apa adanya, BUKAN root-nya — root diselesaikan
 * `bangunPohonLra` seperti `bangunPohonRekap`).
 *
 * ⚠️ `totalLra` = SELURUH belanja modal (5.2), termasuk yg ditandai reklas —
 * definisi yg SAMA dgn `rekapModal`. `kapitalisasi`/`reklas` dari baris yg
 * SUDAH ditandai (`klasifikasi`). `belanjaModal` dari `app` tanpa peduli
 * golongan/grup-nya valid atau tidak — ini TOTAL, bukan per-jenis, jadi baris
 * yg jatuh ke `luarJenis` di RekapMatrix (mis. termin KDP) tetap ikut di sini.
 *
 * ⚠️ Baris `app` tanpa `skpd_id` (migrasi 20260910_05 belum jalan di
 * lingkungan itu) DIBUANG dari peta — bukan dijumlahkan ke SKPD #0 mana pun.
 * Pemanggil (halaman) yg mendeteksi ini & menampilkan strip amber, sama pola
 * dgn `golonganKosong` utk migrasi 20260909_01.
 */
export function leafLra(rows: LraRow[], app: AppRow[]): Map<number, LraCell> {
  const m = new Map<number, LraCell>()
  const get = (id: number): LraCell => {
    let c = m.get(id)
    if (!c) { c = { totalLra: 0, kapitalisasi: 0, reklas: 0, belanjaModal: 0 }; m.set(id, c) }
    return c
  }
  for (const r of rows) {
    if (r.kelompok === 'modal') get(r.skpd_id).totalLra += r.debit
    if (r.klasifikasi === 'kapitalisasi') get(r.skpd_id).kapitalisasi += r.debit
    if (r.klasifikasi === 'reklas_keluar') get(r.skpd_id).reklas += r.debit
  }
  for (const a of app) {
    if (a.skpd_id != null) get(a.skpd_id).belanjaModal += a.nilai
  }
  return m
}

export function silangRekBarang(rows: AppRow[]): Silang {
  const sel: Record<string, Record<string, number>> = {}
  const barisExtra = new Set<string>()
  const kolomExtra = new Set<string>()
  let adaTanpaRek = false, adaTanpaGol = false

  for (const r of rows) {
    const b = r.grup || TANPA_REK
    const k = r.golongan || TANPA_GOL
    if (b === TANPA_REK) adaTanpaRek = true
    else if (!GRUP_LIST.includes(b)) barisExtra.add(b)
    if (k === TANPA_GOL) adaTanpaGol = true
    else if (!GOL_TETAP.includes(k)) kolomExtra.add(k)
    ;(sel[b] ??= {})[k] = (sel[b]?.[k] ?? 0) + r.nilai
  }

  const baris = [...GRUP_LIST, ...[...barisExtra].sort(), ...(adaTanpaRek ? [TANPA_REK] : [])]
  const kolom = [...GOL_TETAP, ...[...kolomExtra].sort(), ...(adaTanpaGol ? [TANPA_GOL] : [])]

  const totalBaris: Record<string, number> = {}
  const totalKolom: Record<string, number> = {}
  let total = 0, nilaiSilang = 0, nSelSilang = 0
  for (const b of baris) {
    totalBaris[b] = 0
    for (const k of kolom) {
      const v = sel[b]?.[k] ?? 0
      totalBaris[b] += v
      totalKolom[k] = (totalKolom[k] ?? 0) + v
      total += v
      if (v !== 0 && statusSilang(b === TANPA_REK ? null : b, k === TANPA_GOL ? null : k) === false) {
        nilaiSilang += v
        nSelSilang += 1
      }
    }
  }
  return { baris, kolom, sel, totalBaris, totalKolom, total, nilaiSilang, nSelSilang }
}
