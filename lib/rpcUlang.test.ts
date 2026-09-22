import { describe, it, expect, vi } from 'vitest'
import { pesanTimeout, rpcUlangJikaTimeout } from './rpcUlang'

// Bentuk hasil RPC yang ditiru. Ditulis eksplisit supaya `data` tetap terbaca
// tipenya di rantai `mockResolvedValueOnce` (tanpa ini `R` jatuh ke batasan
// generiknya & `r.data` hilang).
type Hasil = { data: number[] | null; error: { message: string } | null }

describe('pesanTimeout', () => {
  it('mengenali pesan statement timeout Postgres & kode SQLSTATE-nya', () => {
    expect(pesanTimeout('canceling statement due to statement timeout')).toBe(true)
    expect(pesanTimeout('57014')).toBe(true)
    expect(pesanTimeout('Statement Timeout')).toBe(true)
  })

  // ⚠️ Yang BUKAN timeout tak boleh diulang — mengulangnya cuma menggandakan
  // beban mesin yang sedang kewalahan, dan hasilnya pasti sama.
  it('TIDAK mengenali kegagalan jenis lain', () => {
    expect(pesanTimeout('permission denied for table aset')).toBe(false)
    expect(pesanTimeout('function fn_anu does not exist')).toBe(false)
    expect(pesanTimeout('')).toBe(false)
  })
})

describe('rpcUlangJikaTimeout', () => {
  it('sukses di percobaan pertama → TIDAK diulang', async () => {
    const jalankan = vi.fn<() => Promise<Hasil>>().mockResolvedValue({ data: [1], error: null })
    const r = await rpcUlangJikaTimeout(jalankan)
    expect(jalankan).toHaveBeenCalledTimes(1)
    expect(r.error).toBeNull()
  })

  it('timeout → diulang SEKALI, dan hasil percobaan kedua yang dipakai', async () => {
    const jalankan = vi.fn<() => Promise<Hasil>>()
      .mockResolvedValueOnce({ data: null, error: { message: 'canceling statement due to statement timeout' } })
      .mockResolvedValueOnce({ data: [2], error: null })
    const r = await rpcUlangJikaTimeout(jalankan)
    expect(jalankan).toHaveBeenCalledTimes(2)
    expect(r.data).toEqual([2])
  })

  // TEPAT sekali — bukan berulang sampai berhasil. Kalau mesinnya memang tak
  // sanggup, mengulang terus cuma membuatnya makin tak sanggup.
  it('timeout DUA KALI → berhenti & kegagalannya dikembalikan apa adanya', async () => {
    const jalankan = vi.fn<() => Promise<Hasil>>().mockResolvedValue({ data: null, error: { message: '57014' } })
    const r = await rpcUlangJikaTimeout(jalankan)
    expect(jalankan).toHaveBeenCalledTimes(2)
    expect(r.error?.message).toBe('57014')
  })

  it('error BUKAN timeout → TIDAK diulang', async () => {
    const jalankan = vi.fn<() => Promise<Hasil>>().mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const r = await rpcUlangJikaTimeout(jalankan)
    expect(jalankan).toHaveBeenCalledTimes(1)
    expect(r.error?.message).toBe('permission denied')
  })
})
