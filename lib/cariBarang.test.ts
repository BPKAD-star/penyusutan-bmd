import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KOLOM_CARI, orCari, polaCari } from './cariBarang'

const MIGRASI = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20260914_01_daftar_barang_cari_luas.sql'), 'utf8')

describe('KOLOM_CARI kembar dgn index & predikat RPC (20260914_01)', () => {
  it('argumen index trigram = KOLOM_CARI, urutan sama', () => {
    const m = MIGRASI.match(/public\.fn_aset_teks_cari\(([^)]*)\)\s*extensions\.gin_trgm_ops/)
    expect(m).not.toBeNull()
    const args = m![1].split(',').map(s => s.trim())
    expect(args).toEqual([...KOLOM_CARI])
  })
  it('predikat RPC memanggil kolom yang SAMA dgn index (kalau beda, index diabaikan diam-diam)', () => {
    const m = MIGRASI.match(/OR public\.fn_aset_teks_cari\(([^)]*)\) ILIKE/)
    expect(m).not.toBeNull()
    const args = m![1].split(',').map(s => s.trim().replace(/^a\./, ''))
    expect(args).toEqual([...KOLOM_CARI])
  })
  it('kolom permintaan user tercakup semua', () => {
    for (const k of ['nama_barang', 'kode', 'nibar', 'no_polisi', 'no_rangka', 'no_mesin', 'alamat_detail', 'wilayah_kode', 'keterangan']) {
      expect(KOLOM_CARI).toContain(k)
    }
  })
})

describe('orCari / polaCari', () => {
  it('kosong → null', () => {
    expect(orCari('   ')).toBeNull()
  })
  it('wildcard LIKE di-escape', () => {
    expect(polaCari('AG_10%')).toBe('%AG\\_10\\%%')
  })
  it('nilai dikutip ganda supaya koma tak memecah or=', () => {
    const s = orCari('Meja, Kursi')!
    expect(s.split('.ilike.').length - 1).toBe(KOLOM_CARI.length)
    expect(s).toContain('nama_barang.ilike."%Meja, Kursi%"')
  })
  it('kutip & backslash di dalam nilai di-escape', () => {
    expect(orCari('a"b')).toContain('"%a\\"b%"')
  })
})
