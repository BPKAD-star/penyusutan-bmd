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
    expect(rpc).toEqual(['fn_rekap_bmd'])
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
  it('setiap alat punya skema yang lengkap', () => {
    for (const t of TOOL_DEFS_ADMIN) {
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.input_schema.type).toBe('object')
    }
  })
})
