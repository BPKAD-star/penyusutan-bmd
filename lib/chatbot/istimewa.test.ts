import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daftarIstimewa, penggunaIstimewa } from './istimewa'
import { TOOL_DEFS_ADMIN, NAMA_TOOL_ADMIN, jalankanToolAdmin } from './toolsAdmin'
import { TOOL_DEFS } from './tools'

const ID = 'fa915199-3df2-4c79-807f-54aad3c8381e'

describe('daftarIstimewa (fail-closed)', () => {
  it('membaca UUID dipisah koma, mengabaikan spasi & huruf besar', () => {
    const s = daftarIstimewa(` ${ID.toUpperCase()} , d6e5ea72-e34d-4be5-9bda-da4ffada3dfd `)
    expect(s.has(ID)).toBe(true)
    expect(s.size).toBe(2)
  })
  it('env kosong / tak terdefinisi = tak ada yang istimewa', () => {
    expect(daftarIstimewa(undefined).size).toBe(0)
    expect(daftarIstimewa('').size).toBe(0)
  })
  it('menolak yang bukan UUID (mis. nama, email, id pegawai salah ketik)', () => {
    expect(daftarIstimewa('adimas, kabkediribpkad@gmail.com, 123').size).toBe(0)
  })
})

describe('penggunaIstimewa', () => {
  const asal = process.env.CHATBOT_USER_ISTIMEWA
  afterEach(() => { process.env.CHATBOT_USER_ISTIMEWA = asal })
  it('hanya id yang terdaftar', () => {
    process.env.CHATBOT_USER_ISTIMEWA = ID
    expect(penggunaIstimewa(ID)).toBe(true)
    expect(penggunaIstimewa('d6e5ea72-e34d-4be5-9bda-da4ffada3dfd')).toBe(false)
    expect(penggunaIstimewa(null)).toBe(false)
    expect(penggunaIstimewa(undefined)).toBe(false)
  })
})

describe('alat admin', () => {
  it('nama tidak bertabrakan dengan alat biasa', () => {
    const biasa = new Set(TOOL_DEFS.map(t => t.name))
    for (const n of NAMA_TOOL_ADMIN) expect(biasa.has(n)).toBe(false)
  })
  it('HANYA-BACA: berkas tak memanggil insert/update/upsert/delete', () => {
    const src = readFileSync(join(__dirname, 'toolsAdmin.ts'), 'utf8')
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    // rpc hanya boleh fungsi baca yang dikenal
    const rpc = [...src.matchAll(/\.rpc\('([a-z_]+)'/g)].map(m => m[1])
    expect(rpc).toEqual(['fn_rekap_bmd', 'fn_chatbot_hitung_barang'])
  })
  it('alat tak dikenal ditolak dgn GAGAL:, bukan hasil kosong', async () => {
    const r = await jalankanToolAdmin({} as never, 'hapus_semua', {})
    expect(r).toMatch(/^GAGAL:/)
  })
  it('validasi masukan: periode & skpd_id ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'rekap_bmd_skpd', { periode: '2026' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'rekap_bmd_skpd', { periode: '2026-S1', skpd_id: 'abc' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'status_rkbmd', { tahun_anggaran: 1 })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'status_rkbmd', { tahun_anggaran: 2027, jenis: 'x' })).toMatch(/^GAGAL:/)
  })
  it('hitung_barang: masukan ngawur ditolak sebelum menyentuh DB', async () => {
    const boom = new Proxy({}, { get() { throw new Error('DB tersentuh') } }) as never
    expect(await jalankanToolAdmin(boom, 'hitung_barang', {})).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'hitung_barang', { kode: '1.3.2; drop table aset' })).toMatch(/^GAGAL:/)
    expect(await jalankanToolAdmin(boom, 'hitung_barang', { kata_kunci: 'laptop', skpd_id: 'abc' })).toMatch(/^GAGAL:/)
  })
  it('hitung_barang: tiap KODE dilaporkan terpisah, sub-unit BKAD ikut, ID dikirim ke fungsi', async () => {
    const skpd = [
      { id: 28, nama: 'Badan Keuangan dan Aset Daerah', parent_id: null, level: 1 },
      { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
      { id: 50, nama: 'Dinas Lain', parent_id: null, level: 1 },
    ]
    let dikirim: Record<string, unknown> | null = null
    const sb = {
      from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: skpd, error: null }) }) }) }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe('fn_chatbot_hitung_barang')
        dikirim = args
        return { data: [
          { kode: '1.3.2.10.01.02.002', uraian: 'Lap Top', skpd_id: null, jumlah: 21, nilai_perolehan: 266422581.15 },
          { kode: '1.3.2.05.01.05.094', uraian: 'Laptop', skpd_id: null, jumlah: 3, nilai_perolehan: 30000000 },
        ], error: null }
      },
    } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'laptop', skpd_id: 28 })
    expect(dikirim).toMatchObject({ p_kata: 'laptop', p_kode: null, p_skpd_ids: [28, 29], p_per_skpd: false })
    expect(r).toContain('beserta 1 unit di bawahnya')
    expect(r).toMatch(/1\.3\.2\.10\.01\.02\.002 · Lap Top: 21 unit/)
    expect(r).toMatch(/1\.3\.2\.05\.01\.05\.094 · Laptop: 3 unit/)
    expect(r).toContain('TOTAL: 24 unit')
  })
  it('hitung_barang: per SKPD se-kabupaten menggabungkan unit ke SKPD induk', async () => {
    const skpd = [
      { id: 28, nama: 'BKAD', parent_id: null, level: 1 },
      { id: 29, nama: 'Bidang Aset', parent_id: 28, level: 2 },
    ]
    const sb = {
      from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: skpd, error: null }) }) }) }),
      rpc: async () => ({ data: [
        { kode: 'K1', uraian: 'X', skpd_id: 28, jumlah: 2, nilai_perolehan: 10 },
        { kode: 'K1', uraian: 'X', skpd_id: 29, jumlah: 5, nilai_perolehan: 20 },
      ], error: null }),
    } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'x', per_skpd: true })
    expect(r).toMatch(/- BKAD: 7 unit/)
    expect(r).not.toContain('Bidang Aset')
  })
  it('hitung_barang: error database TIDAK berubah jadi "tidak ada barang"', async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'kata kunci terlalu umum: cocok dengan 90 kode barang' } }) } as never
    const r = await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'meja' })
    expect(r).toMatch(/^GAGAL/)
    expect(r).toContain('terlalu umum')
  })
  it('hitung_barang: hasil kosong dinyatakan kosong, bukan GAGAL', async () => {
    const sb = { rpc: async () => ({ data: [], error: null }) } as never
    expect(await jalankanToolAdmin(sb, 'hitung_barang', { kata_kunci: 'zzz' })).toMatch(/^Tidak ada barang aktif/)
  })
  it('setiap alat punya skema yang lengkap', () => {
    for (const t of TOOL_DEFS_ADMIN) {
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.input_schema.type).toBe('object')
    }
  })
})
