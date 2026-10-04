import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { muatRincianHalaman, persenTerisi, RINCIAN_PER_HALAMAN } from './ipaData'

const klien = (balasan: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn(async () => balasan)
  return { sb: { rpc } as never, rpc }
}

describe('muatRincianHalaman', () => {
  it('menerjemahkan filter & halaman jadi parameter RPC (offset = halaman × 250)', async () => {
    const { sb, rpc } = klien({ data: { rows: [], total: 0, n: { kurang: 0, ok: 0, semua: 0 }, golongan: [] }, error: null })
    await muatRincianHalaman(sb, 2026, 28, 'INT_KELENGKAPAN', { keadaan: 'ok', golongan: '1.3.2', cari: '  laptop ', halaman: 3 })
    expect(rpc).toHaveBeenCalledWith('fn_ipa_rincian_halaman', {
      p_tahun: 2026, p_skpd_id: 28, p_indikator: 'INT_KELENGKAPAN',
      p_keadaan: 'ok', p_golongan: '1.3.2', p_cari: 'laptop',
      p_offset: 3 * RINCIAN_PER_HALAMAN, p_limit: RINCIAN_PER_HALAMAN,
    })
  })
  it('filter kosong → NULL (semua), bukan string kosong', async () => {
    const { sb, rpc } = klien({ data: { rows: [], total: 0, n: { kurang: 0, ok: 0, semua: 0 }, golongan: [] }, error: null })
    await muatRincianHalaman(sb, 2026, 28, 'X', { golongan: '', cari: '   ' })
    const arg = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
    expect(arg).toMatchObject({ p_keadaan: null, p_golongan: null, p_cari: null, p_offset: 0 })
  })
  it('nilai numerik dari jsonb diubah jadi angka; hitungan dibawa apa adanya', async () => {
    const { sb } = klien({ data: {
      rows: [{ keadaan: 'kurang', judul: 'A', sub: null, ket: null, nilai: '8', nibar: null, uraian: 'U' }],
      total: 1296, n: { kurang: 1289, ok: 7, semua: 1296 }, golongan: [{ kode: '1.3.2', n: 1195 }],
    }, error: null })
    const h = await muatRincianHalaman(sb, 2026, 28, 'X')
    expect(h.rows[0].nilai).toBe(8)
    expect(h.total).toBe(1296)
    expect(h.n.semua).toBe(1296)
  })
  it('MELEMPAR saat RPC gagal (tidak pernah jadi daftar kosong)', async () => {
    const { sb } = klien({ data: null, error: { message: 'statement timeout' } })
    await expect(muatRincianHalaman(sb, 2026, 28, 'X')).rejects.toThrow(/statement timeout/)
  })
})

describe('persen terisi per jenis aset', () => {
  it('menghitung persen dan null-safe (klien lama / indikator lain)', () => {
    expect(persenTerisi({ isi: 59, req: 70 })).toBeCloseTo(84.29, 1)
    expect(persenTerisi({ isi: 0, req: 0 })).toBeNull()
    expect(persenTerisi(null)).toBeNull()
    expect(persenTerisi({})).toBeNull()
  })
  it('membawa isi/req per jenis dan total terisi sebagai angka; absen → null', async () => {
    const { sb } = klien({ data: {
      rows: [], total: 0, n: { kurang: 0, ok: 0, semua: 0 },
      golongan: [{ kode: '1.3.1', n: 7, isi: '59', req: '70' }, { kode: '1.3.2', n: 1195 }],
      terisi: { isi: '4661', req: '13068' },
    }, error: null })
    const h = await muatRincianHalaman(sb, 2026, 28, 'INT_KELENGKAPAN')
    expect(h.golongan[0]).toMatchObject({ isi: 59, req: 70 })
    expect(h.golongan[1].isi).toBeNull()
    expect(h.terisi).toEqual({ isi: 4661, req: 13068 })
    const { sb: sb2 } = klien({ data: { rows: [], total: 0, n: { kurang: 0, ok: 0, semua: 0 }, golongan: [] }, error: null })
    expect((await muatRincianHalaman(sb2, 2026, 28, 'X')).terisi).toBeNull()
  })
})

describe('aturan kolom wajib: migrasi pembantu KEMBAR dgn migrasi skor', () => {
  const dir = path.join(process.cwd(), 'supabase/migrations')
  const baca = (re: RegExp) => {
    const f = fs.readdirSync(dir).filter(x => re.test(x)).sort()[0]
    return fs.readFileSync(path.join(dir, f), 'utf8')
  }
  // Himpunan yang berlaku di produksi (fn_ipa_hitung_otomatis, diperiksa 2026-10-04).
  const MEREK = ['1.3.2', '1.3.5', '1.5.3', '1.5.4']
  const LUAS = ['1.3.1', '1.3.3', '1.3.4', '1.3.6']
  const daftarSql = (g: string[], dua: boolean) => g.map(x => (dua ? `''${x}''` : `'${x}'`)).join(',')
  it('fn_ipa_kolom_wajib memakai himpunan golongan yang sama dgn blok skor (20260926_02)', () => {
    const bantu = baca(/^20261004_02_/)
    expect(bantu).toContain(`q.g IN (${daftarSql(MEREK, false)}) THEN 1`)
    expect(bantu).toContain(`q.g IN (${daftarSql(LUAS, false)}) THEN 1`)
    expect(bantu).toMatch(/LIKE '1\.3\.2\.02\.01\.%' THEN 4/)
    const skor = baca(/^20260926_02_/)
    expect(skor).toContain(`IN (${daftarSql(LUAS, true)}) AS luas`)
    expect(skor).toContain(`IN (${daftarSql(MEREK, true)}) AS merek`)
  })
})
