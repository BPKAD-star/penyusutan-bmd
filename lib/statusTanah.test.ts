import { describe, it, expect } from 'vitest'
import { statusJenisHak, statusRegister, PRIORITAS_STATUS } from './statusTanah'

describe('statusJenisHak — pemetaan dari jenis hak', () => {
  it('Hak Pakai → bersertifikat', () => expect(statusJenisHak('Hak Pakai')).toBe('bersertifikat'))
  it('Proses → proses', () => expect(statusJenisHak('Proses')).toBe('proses'))
  it('Sengketa → sengketa', () => expect(statusJenisHak('Sengketa')).toBe('sengketa'))

  it('kosong / spasi / null → belum sertifikat', () => {
    for (const v of ['', '  ', null, undefined]) expect(statusJenisHak(v)).toBe('belum')
  })

  it('kelima hak lain → tinjau', () => {
    for (const v of ['Hak Pengelolaan', 'Hak Guna Bangunan', 'Hak Guna Usaha', 'Hak Milik', 'Lainnya']) {
      expect(statusJenisHak(v), v).toBe('tinjau')
    }
  })

  it('teks bebas di luar daftar → tinjau, TIDAK ditebak sbg bersertifikat/belum', () => {
    expect(statusJenisHak('SHM a.n. Jaswadi')).toBe('tinjau')
  })

  it('spasi di ujung diabaikan', () => expect(statusJenisHak(' Hak Pakai ')).toBe('bersertifikat'))
})

describe('statusRegister — bidang yang paling belum tuntas menang', () => {
  it('bersertifikat HANYA kalau SEMUA bidang Hak Pakai', () => {
    expect(statusRegister(['Hak Pakai', 'Hak Pakai'], null)).toBe('bersertifikat')
    // 1 dari 5 bidang bersertifikat TIDAK boleh mencap seluruh tanah selesai.
    expect(statusRegister(['Hak Pakai', null, null, null, null], null)).toBe('belum')
  })

  it('urutan prioritas: sengketa > tinjau > belum > proses > bersertifikat', () => {
    expect(PRIORITAS_STATUS).toEqual(['sengketa', 'tinjau', 'belum', 'proses', 'bersertifikat'])
    expect(statusRegister(['Hak Pakai', 'Proses'], null)).toBe('proses')
    expect(statusRegister(['Proses', null], null)).toBe('belum')
    expect(statusRegister(['Hak Pakai', null, 'Hak Milik'], null)).toBe('tinjau')
    expect(statusRegister(['Hak Milik', 'Sengketa', 'Hak Pakai'], null)).toBe('sengketa')
  })

  it('urutan bidang tak memengaruhi hasil', () => {
    const a = ['Hak Pakai', 'Proses', null, 'Hak Milik']
    expect(statusRegister(a, null)).toBe(statusRegister([...a].reverse(), null))
  })

  it('tanpa bidang → jatuh ke jenis hak register (sama dgn Daftar Barang)', () => {
    expect(statusRegister([], 'Hak Pakai')).toBe('bersertifikat')
    expect(statusRegister([], 'Sengketa')).toBe('sengketa')
    expect(statusRegister([], null)).toBe('belum')
  })

  it('bidang ADA → jenis hak register diabaikan (bidang menang)', () => {
    expect(statusRegister([null], 'Hak Pakai')).toBe('belum')
  })
})
