// Persilangan rekening × kode barang (lib/lra.ts) + penjaga kembar TS ↔ SQL.
//
// Kelas kesalahan yang dijaga di sini SENYAP semua: sel silang yang tak
// tertandai, total yang tak tie-out ke kedua dasar, dan peta golongan→jenis
// belanja yang menyimpang antara TS & badan `fn_lra_belanja_modal`. Tak satu
// pun dari ketiganya menghasilkan error — yang muncul cuma angka yang beda.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  GOLONGAN_KE_GRUP, GRUP_LIST, GOL_TETAP, TANPA_REK, TANPA_GOL,
  rekapApp, rekapAppBarang, silangRekBarang, statusSilang, leafLra,
  type AppRow, type LraRow,
} from './lra'

const baris = (grup: string | null, golongan: string | null, bulan: number, nilai: number): AppRow =>
  ({ skpd_id: null, grup, golongan, bulan, nilai })

// Kasus NYATA yang melahirkan fitur ini (Kecamatan Banyakan, 2026):
//  · Backdrop  Rp19.955.000 — rekening 5.2.03 (Gedung), barang 1.3.2 (P&M) → SILANG
//  · P.C Unit  Rp 7.664.800 — rekening 5.2.02, barang 1.3.2               → cocok
const BANYAKAN: AppRow[] = [
  baris('5.2.03', '1.3.2', 1, 19_955_000),
  baris('5.2.02', '1.3.2', 4, 7_664_800),
]

describe('statusSilang', () => {
  it('cocok / silang / tak-bisa-dinilai dibedakan bertiga', () => {
    expect(statusSilang('5.2.02', '1.3.2')).toBe(true)
    expect(statusSilang('5.2.03', '1.3.2')).toBe(false)
    // ⚠️ null ≠ false. KDP tak punya padanan jenis belanja, jadi belanja
    // 5.2.03 yang masih berupa 1.3.6 BUKAN temuan — itu kontrak yang belum
    // selesai. Menandainya silang = menuduh yang tak terbukti.
    expect(statusSilang('5.2.03', '1.3.6')).toBeNull()
    expect(statusSilang(null, '1.3.2')).toBeNull()
    expect(statusSilang('5.2.02', null)).toBeNull()
  })
})

describe('silangRekBarang', () => {
  it('menandai sel di luar diagonal, dan HANYA itu', () => {
    const s = silangRekBarang(BANYAKAN)
    expect(s.sel['5.2.03']['1.3.2']).toBe(19_955_000)
    expect(s.sel['5.2.02']['1.3.2']).toBe(7_664_800)
    expect(s.nSelSilang).toBe(1)
    expect(s.nilaiSilang).toBe(19_955_000)
  })

  it('KDP tidak dihitung sbg silang walau rekeningnya beda golongan', () => {
    const s = silangRekBarang([baris('5.2.03', '1.3.6', 8, 500_000_000)])
    expect(s.nSelSilang).toBe(0)
    expect(s.nilaiSilang).toBe(0)
    expect(s.total).toBe(500_000_000)   // tetap masuk hitungan, cuma tak dituduh
  })

  it('kolom & baris tetap ada walau kosong; yang di luar daftar ditambahkan', () => {
    const s = silangRekBarang([baris('5.2.06', '1.5.3', 3, 1_000), baris(null, null, 3, 7)])
    for (const g of GRUP_LIST) expect(s.baris).toContain(g)
    for (const g of GOL_TETAP) expect(s.kolom).toContain(g)
    expect(s.baris).toContain('5.2.06')          // rekening di luar 5.2.01–05
    expect(s.kolom).toContain('1.5.3')           // golongan di luar daftar tetap
    expect(s.baris).toContain(TANPA_REK)         // ⚠️ tak dibuang diam-diam
    expect(s.kolom).toContain(TANPA_GOL)
    expect(s.total).toBe(1_007)
  })

  it('total baris = dasar rekening, total kolom = dasar barang (jembatan dua tuas)', () => {
    const s = silangRekBarang(BANYAKAN)
    expect(s.totalBaris['5.2.03']).toBe(19_955_000)
    expect(s.totalBaris['5.2.02']).toBe(7_664_800)
    expect(s.totalKolom['1.3.2']).toBe(27_619_800)
    expect(s.total).toBe(27_619_800)
  })
})

describe('dua dasar pengelompokan', () => {
  it('menggeser sebaran antar jenis, TIDAK menggeser totalnya', () => {
    const rek = rekapApp(BANYAKAN), bar = rekapAppBarang(BANYAKAN)
    expect(rek.totalJenis['5.2.03']).toBe(19_955_000)
    expect(rek.totalJenis['5.2.02']).toBe(7_664_800)
    // Dasar kode barang: dua-duanya Peralatan & Mesin.
    expect(bar.totalJenis['5.2.03']).toBe(0)
    expect(bar.totalJenis['5.2.02']).toBe(27_619_800)
    expect(bar.totalKeseluruhan).toBe(rek.totalKeseluruhan)
  })

  it('golongan tanpa padanan jatuh ke luarJenis — dilaporkan, bukan hilang', () => {
    const bar = rekapAppBarang([baris('5.2.03', '1.3.6', 8, 500_000_000)])
    expect(bar.totalKeseluruhan).toBe(0)
    expect(bar.luarJenis).toBe(500_000_000)
  })
})

// ---------------------------------------------------------------------------
// `leafLra` — bahan Rekap per SKPD berjenjang (2026-09-10). Bukan uji drill-
// down (itu lib/lraPohon.test.ts); ini uji AGREGASI PER SKPD LEAF-nya sendiri,
// sebelum disusun jadi pohon.
describe('leafLra', () => {
  const lraRow = (over: Partial<LraRow>): LraRow => ({
    id: 1, skpd_id: 1, tanggal: '2026-01-05', bulan: 1, no_bukti: 'X',
    kode_rekening: '5.2.02', kode_grup3: '5.2.02', kelompok: 'modal',
    uraian: '', keterangan: '', debit: 0, klasifikasi: null, jenis_tujuan: null,
    ...over,
  })

  it('totalLra = SELURUH baris kelompok modal, termasuk yg ditandai reklas', () => {
    const rows = [
      lraRow({ skpd_id: 1, debit: 100 }),
      lraRow({ skpd_id: 1, debit: 40, klasifikasi: 'reklas_keluar' }),
    ]
    const leaf = leafLra(rows, [])
    expect(leaf.get(1)!.totalLra).toBe(140)
    expect(leaf.get(1)!.reklas).toBe(40)
  })

  it('kapitalisasi & reklas dari baris ber-klasifikasi, terpisah per SKPD', () => {
    const rows = [
      lraRow({ skpd_id: 1, debit: 100, kelompok: 'barjas', klasifikasi: 'kapitalisasi', jenis_tujuan: '5.2.03' }),
      lraRow({ skpd_id: 2, debit: 30, klasifikasi: 'reklas_keluar' }),
    ]
    const leaf = leafLra(rows, [])
    expect(leaf.get(1)!.kapitalisasi).toBe(100)
    expect(leaf.get(1)!.totalLra).toBe(0) // barjas, bukan kelompok modal
    expect(leaf.get(2)!.reklas).toBe(30)
  })

  it('belanjaModal dijumlah dari app per skpd_id, TOTAL tanpa peduli golongannya valid', () => {
    const app: AppRow[] = [
      { skpd_id: 1, grup: '5.2.02', golongan: '1.3.2', bulan: 1, nilai: 50 },
      { skpd_id: 1, grup: null, golongan: '1.3.6', bulan: 2, nilai: 25 }, // termin KDP, tanpa grup
    ]
    const leaf = leafLra([], app)
    expect(leaf.get(1)!.belanjaModal).toBe(75)
  })

  it('baris app TANPA skpd_id (migrasi belum jalan) dibuang, bukan masuk SKPD #0', () => {
    const app: AppRow[] = [{ skpd_id: null, grup: '5.2.02', golongan: '1.3.2', bulan: 1, nilai: 99 }]
    const leaf = leafLra([], app)
    expect(leaf.size).toBe(0)
  })

  it('SKPD yang cuma ada di app (tak punya baris LRA) tetap muncul sbg leaf', () => {
    const leaf = leafLra([], [{ skpd_id: 7, grup: '5.2.02', golongan: '1.3.2', bulan: 1, nilai: 10 }])
    expect(leaf.get(7)).toEqual({ totalLra: 0, kapitalisasi: 0, reklas: 0, belanjaModal: 10 })
  })
})

// ---------------------------------------------------------------------------
describe('kembar TS ↔ SQL — peta golongan → jenis belanja', () => {
  // `GOLONGAN_KE_GRUP` (TS, dipakai `rekapAppBarang` & `statusSilang`) kembar
  // dgn CASE fallback di badan `fn_lra_belanja_modal`. Satu sisi disunting,
  // sisi lain lupa → dasar "kode barang" & fallback server tak sepakat, dan
  // TIDAK ADA APA PUN YANG GAGAL.
  const DIR = path.join(process.cwd(), 'supabase', 'migrations')

  function badanTerakhir(): string {
    const berkas = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
    // Anti-hampa: pemindai yang tak menemukan apa pun akan "lulus".
    if (berkas.length < 50) throw new Error(`hanya ${berkas.length} migrasi terbaca — pemindaian rusak`)
    const re = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+fn_lra_belanja_modal\s*\(/i
    const cocok = berkas
      .map(n => fs.readFileSync(path.join(DIR, n), 'utf8'))
      .filter(isi => re.test(isi))
    if (cocok.length === 0) {
      throw new Error('tak ada migrasi yang mendefinisikan fn_lra_belanja_modal — PERBARUI test ini, jangan hapus pengeceknya')
    }
    // Yang berlaku di DB = definisi TERAKHIR yang dijalankan.
    return cocok[cocok.length - 1]
  }

  it('CASE di SQL memuat pasangan yang SAMA PERSIS dgn GOLONGAN_KE_GRUP', () => {
    const pasangan = [...badanTerakhir().matchAll(/WHEN\s+'([0-9.]+)'\s+THEN\s+'([0-9.]+)'/gi)]
      .map(m => `${m[1]}→${m[2]}`).sort()
    expect(pasangan.length).toBeGreaterThan(0)
    expect(pasangan).toEqual(
      Object.entries(GOLONGAN_KE_GRUP).map(([g, r]) => `${g}→${r}`).sort(),
    )
  })

  it('kolom `golongan` benar-benar dikembalikan & ikut GROUP BY', () => {
    const isi = badanTerakhir()
    // Tanpa kolomnya, tabel Persilangan diam-diam kosong selamanya.
    expect(isi).toMatch(/RETURNS TABLE \([^)]*golongan text/i)
    expect(isi).toMatch(/GROUP BY 1, 2, 3/)
  })
})
