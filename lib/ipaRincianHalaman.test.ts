import { describe, it, expect, vi } from 'vitest'
import { muatRincianHalaman, RINCIAN_PER_HALAMAN } from './ipaData'

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
