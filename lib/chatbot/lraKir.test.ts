// Penjaga alat baca LRA & KIR Asisten AI. Rumusnya milik lib/lra.ts (sudah
// dikunci lib/lra.test.ts); yang dijaga di sini PENYUSUNAN jawabannya: nilai
// yang jatuh di luar tabel tetap disebut, persilangan terdeteksi, kegagalan
// tak berubah jadi "tidak ada", dan masukan ngawur ditolak sebelum menyentuh DB.
import { describe, it, expect } from 'vitest'
import { jalankanToolAdmin, NAMA_TOOL_ADMIN } from './toolsAdmin'
import { TOOL_DEFS } from './tools'
import { NAMA_TOOL_LRA_KIR } from './lraKir'

type Baris = Record<string, unknown>
/** Klien palsu: menghormati eq/in/gt per tabel; `rpc` dijawab dari `rpc`. */
function klien(tabel: Record<string, Baris[]>, opsi: { gagal?: string[]; rpc?: Baris[]; rpcGagal?: boolean } = {}) {
  return {
    from(nama: string) {
      const k: { eq: [string, unknown][]; in: [string, unknown[]][]; gt: [string, number][] } = { eq: [], in: [], gt: [] }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'limit', 'or', 'not', 'like']) b[m] = () => b
      b.eq = (c: string, v: unknown) => { k.eq.push([c, v]); return b }
      b.in = (c: string, v: unknown[]) => { k.in.push([c, v]); return b }
      b.gt = (c: string, v: number) => { k.gt.push([c, v]); return b }
      b.then = (ok: (v: unknown) => unknown) => {
        if (opsi.gagal?.includes(nama)) return Promise.resolve({ data: null, error: { message: `${nama} timeout` }, count: null }).then(ok)
        const rows = (tabel[nama] || [])
          .filter(r => k.eq.every(([c, v]) => r[c] === v) && k.in.every(([c, v]) => v.includes(r[c]))
            && k.gt.every(([c, v]) => (r[c] as number) > v))
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok)
      }
      return b
    },
    rpc: async () => opsi.rpcGagal
      ? { data: null, error: { message: 'rpc timeout' } }
      : { data: opsi.rpc || [], error: null },
  } as never
}

const SKPD = [
  { id: 28, nama: 'BKAD', parent_id: null, level: 1 },
  { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
  { id: 50, nama: 'Kecamatan X', parent_id: null, level: 1 },
]
const lra = (id: number, skpd: number, rek: string, debit: number, bulan = 3, ex: Baris = {}): Baris => ({
  id, skpd_id: skpd, tahun: 2026, tanggal: `2026-0${bulan}-10`, bulan, no_bukti: `SP2D-${id}`, kode_rekening: rek,
  kode_grup3: rek.split('.').slice(0, 3).join('.'), kelompok: rek.startsWith('5.2.') ? 'modal' : 'barjas',
  uraian: 'Belanja', keterangan: '', debit, klasifikasi: null, jenis_tujuan: null, ...ex,
})
const LRA = [
  lra(1, 28, '5.2.02.05.001', 1000),
  lra(2, 29, '5.2.02.05.001', 500),
  lra(3, 50, '5.2.03.01.001', 300),
  lra(4, 28, '5.1.02.01.001', 40, 3, { klasifikasi: 'kapitalisasi', jenis_tujuan: '5.2.02' }),
]
const APP = [
  { skpd_id: 28, grup: '5.2.02', golongan: '1.3.2', bulan: 3, nilai: 1540 },   // BKAD+Bidang Aset: 1000+500+40 → cocok
  { skpd_id: 50, grup: '5.2.03', golongan: '1.3.2', bulan: 3, nilai: 100 },    // SILANG: rekening gedung, barang P&M
  { skpd_id: 50, grup: '5.1.02', golongan: '1.3.2', bulan: 4, nilai: 7 },      // di luar 5.2.01–05
]
const sb = () => klien({ lra_realisasi: LRA, admin_skpd: SKPD }, { rpc: APP })

describe('pendaftaran alat', () => {
  it('ketiga alat terdaftar sbg alat ADMIN & tak bertabrakan dgn alat biasa', () => {
    for (const n of ['rekap_lra', 'daftar_lra', 'rekap_kir']) {
      expect(NAMA_TOOL_LRA_KIR.has(n)).toBe(true)
      expect(NAMA_TOOL_ADMIN.has(n)).toBe(true)
      expect(TOOL_DEFS.some(t => t.name === n)).toBe(false)
    }
  })
})

describe('rekap_lra', () => {
  it('per jenis: LRA + kapitalisasi − reklas vs entry aplikasi, selisih & keterangannya', async () => {
    const r = await jalankanToolAdmin(sb(), 'rekap_lra', { tahun: 2026 })
    expect(r).toMatch(/5\.2\.02 Peralatan dan Mesin: LRA Rp1\.500,00 · \+kapitalisasi Rp40,00 · −reklas Rp0,00 · entry aplikasi Rp1\.540,00 · selisih Rp0,00 \(cocok\)/)
    expect(r).toMatch(/5\.2\.03 Gedung dan Bangunan: LRA Rp300,00 .* entry aplikasi Rp100,00 · selisih Rp200,00 \(LRA lebih besar/)
    expect(r).toContain('3 transaksi belanja modal · 1 ditandai kapitalisasi · 0 ditandai reklas keluar')
  })
  it('entry ber-rekening di luar 5.2.01–05 TIDAK hilang diam-diam', async () => {
    expect(await jalankanToolAdmin(sb(), 'rekap_lra', { tahun: 2026 })).toMatch(/di luar 5\.2\.01–05 .*Rp7,00/)
  })
  it('persilangan rekening × kode barang terdeteksi & disebut kombinasinya', async () => {
    const r = await jalankanToolAdmin(sb(), 'rekap_lra', { tahun: 2026 })
    // Dua-duanya silang menurut `statusSilang` (lib/lra.ts) — sama dgn tabel
    // Persilangan di halaman LRA: rekening gedung → barang P&M, DAN rekening
    // barang/jasa 5.1 → barang P&M (calon kapitalisasi).
    expect(r).toMatch(/Persilangan rekening × kode barang: Rp107,00 di 2 kombinasi/)
    expect(r).toMatch(/rekening 5\.2\.03 → barang 1\.3\.2 Peralatan dan Mesin: Rp100,00/)
    expect(r).toMatch(/rekening 5\.1\.02 → barang 1\.3\.2 Peralatan dan Mesin: Rp7,00/)
  })
  it('golongan tak tersedia → "tidak bisa dinilai", BUKAN "tidak ada persilangan"', async () => {
    const tanpa = APP.map(a => ({ ...a, golongan: undefined }))
    const r = await jalankanToolAdmin(klien({ lra_realisasi: LRA, admin_skpd: SKPD }, { rpc: tanpa }), 'rekap_lra', { tahun: 2026 })
    expect(r).toContain('tidak bisa dinilai')
    expect(r).not.toContain('tidak ada (semua entry')
  })
  it('per_skpd se-kabupaten: unit digabung ke induk, urut selisih terbesar', async () => {
    const r = await jalankanToolAdmin(sb(), 'rekap_lra', { tahun: 2026, per_skpd: true })
    expect(r).toMatch(/- Kecamatan X: LRA Rp300,00 .* entry Rp107,00 · selisih Rp193,00[\s\S]*- BKAD: LRA Rp1\.500,00 · \+kap Rp40,00 .* selisih Rp0,00/)
    expect(r).not.toContain('- Bidang Aset')
    expect(r).toContain('1 sudah cocok')
  })
  it('skpd_id menyempitkan ke SKPD itu beserta unitnya', async () => {
    const r = await jalankanToolAdmin(sb(), 'rekap_lra', { tahun: 2026, skpd_id: 28 })
    expect(r).toContain('BKAD beserta 1 unit di bawahnya')
    expect(r).toMatch(/5\.2\.03 Gedung dan Bangunan: LRA Rp0,00/)
  })
  it('kegagalan (tabel LRA maupun RPC entry) → GAGAL, bukan "tidak ada data"', async () => {
    const a = await jalankanToolAdmin(klien({ admin_skpd: SKPD }, { gagal: ['lra_realisasi'] }), 'rekap_lra', { tahun: 2026 })
    expect(a).toMatch(/^GAGAL/); expect(a).toContain('lra_realisasi timeout')
    const b = await jalankanToolAdmin(klien({ lra_realisasi: LRA, admin_skpd: SKPD }, { rpcGagal: true }), 'rekap_lra', { tahun: 2026 })
    expect(b).toMatch(/^GAGAL/); expect(b).toContain('rpc timeout')
  })
  it('benar-benar kosong dinyatakan kosong', async () => {
    expect(await jalankanToolAdmin(klien({ admin_skpd: SKPD }), 'rekap_lra', { tahun: 2030 })).toMatch(/^Tidak ada data LRA/)
  })
})

describe('daftar_lra', () => {
  it('masukan ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'daftar_lra', { tahun: 'dua ribu' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'daftar_lra', { kelompok: 'pendapatan' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'daftar_lra', { jenis: '5.2' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'daftar_lra', { bulan: 13 })).toMatch(/^GAGAL:/)
  })
  it('bawaan hanya belanja modal; tanda kapitalisasi ikut tampil saat kelompok barjas', async () => {
    const modal = await jalankanToolAdmin(sb(), 'daftar_lra', { tahun: 2026 })
    expect(modal).toContain('3 transaksi')
    expect(modal).toContain('bukti SP2D-1')
    const barjas = await jalankanToolAdmin(sb(), 'daftar_lra', { tahun: 2026, kelompok: 'barjas' })
    expect(barjas).toContain('DITANDAI kapitalisasi → 5.2.02')
  })
  it('galat database → GAGAL', async () => {
    const r = await jalankanToolAdmin(klien({ admin_skpd: SKPD }, { gagal: ['lra_realisasi'] }), 'daftar_lra', { tahun: 2026 })
    expect(r).toMatch(/^GAGAL/)
  })
})

describe('rekap_kir', () => {
  const aset = (n: string, nama: string, nilai: number) => ({ nibar: n, kode: '1.3.2.05.01.01.001', uraian_barang: 'Meja', nama_barang: nama,
    merek_tipe: 'Olympic', tgl_perolehan: '2020-05-01', jumlah: 1, satuan: 'unit', nilai_perolehan: nilai })
  const KIR = {
    admin_skpd: SKPD,
    kir_ruangan: [
      { id: 'r1', skpd_id: 28, nama: 'Ruang Rapat', kode_ruangan: 'R-01', pegawai_id: null, pj_nama: 'Budi', pj_nip: '1987', pj_jabatan: null, keterangan: null },
      { id: 'r2', skpd_id: 50, nama: 'Ruang Arsip', kode_ruangan: null, pegawai_id: null, pj_nama: null, pj_nip: null, pj_jabatan: null, keterangan: null },
    ],
    kir_ruangan_aset: [
      { id: 'x1', ruangan_id: 'r1', aset_id: 'a1', keterangan: null, aset: aset('N1', 'Meja Rapat', 100) },
      { id: 'x2', ruangan_id: 'r1', aset_id: 'a2', keterangan: null, aset: aset('N2', 'Kursi Lipat', 50) },
      { id: 'x3', ruangan_id: 'r2', aset_id: 'a3', keterangan: null, aset: aset('N3', 'Lemari Arsip', 70) },
    ],
  }
  it('ringkasan: jumlah ruangan, barang, nilai; PJ yang belum ditetapkan disebut', async () => {
    const r = await jalankanToolAdmin(klien(KIR), 'rekap_kir', {})
    expect(r).toContain('2 ruangan · 3 barang ditempatkan · Rp220,00')
    expect(r).toMatch(/Ruang Rapat \(R-01\) · BKAD · PJ: Budi \(NIP 1987\) · 2 barang · Rp150,00/)
    expect(r).toContain('PJ: belum ditetapkan')
  })
  it('"barang X ada di ruangan mana": hanya barang yang cocok, di bawah ruangannya', async () => {
    const r = await jalankanToolAdmin(klien(KIR), 'rekap_kir', { kata_kunci: 'lemari' })
    expect(r).toContain('Cocok dengan "lemari": 1 ruangan')
    expect(r).toContain('Ruang Arsip')
    expect(r).toContain('Lemari Arsip')
    expect(r).not.toContain('Meja Rapat')
  })
  it('"ruangan Y isinya apa": nama ruangan cocok → seluruh isinya tampil', async () => {
    const r = await jalankanToolAdmin(klien(KIR), 'rekap_kir', { kata_kunci: 'rapat' })
    expect(r).toContain('Meja Rapat'); expect(r).toContain('Kursi Lipat')
  })
  it('gagal membaca → GAGAL, bukan "belum ada ruangan"', async () => {
    const r = await jalankanToolAdmin(klien(KIR, { gagal: ['kir_ruangan_aset'] }), 'rekap_kir', {})
    expect(r).toMatch(/^GAGAL/); expect(r).toContain('isi ruangan')
  })
  it('benar-benar kosong dinyatakan kosong', async () => {
    expect(await jalankanToolAdmin(klien({ admin_skpd: SKPD }), 'rekap_kir', {})).toMatch(/^Belum ada ruangan KIR/)
  })
})
