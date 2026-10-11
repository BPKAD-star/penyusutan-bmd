import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  deretTanggal, normalisasiHalaman, labelHalaman, susunAktivitas, userAktifPerHari, waktuRelatif, tanggalWib,
} from './aktivitasPengguna'

describe('deretTanggal & tanggalWib', () => {
  it('7 hari berakhir di tanggal yang diberikan, melintasi bulan', () => {
    expect(deretTanggal('2026-10-03', 4)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'])
  })
  it('tanggal WIB, bukan UTC (pukul 20:00 UTC = besoknya di Kediri)', () => {
    expect(tanggalWib(new Date('2026-10-10T20:00:00Z'))).toBe('2026-10-11')
  })
})

describe('normalisasiHalaman', () => {
  it('hanya dashboard, query & garis miring akhir dibuang', () => {
    expect(normalisasiHalaman('/dashboard/daftar-barang/?gol=1.3.2')).toBe('/dashboard/daftar-barang')
    expect(normalisasiHalaman('/dashboard')).toBe('/dashboard')
    expect(normalisasiHalaman('/login')).toBeNull()
    expect(normalisasiHalaman('/kibar/1201')).toBeNull()
    expect(normalisasiHalaman('/dashboardx')).toBeNull()
  })
  it('segmen ID jadi :id', () => {
    expect(normalisasiHalaman('/dashboard/ipa/skpd/123')).toBe('/dashboard/ipa/skpd/:id')
    expect(normalisasiHalaman('/dashboard/x/3f2b1c4d-1a2b-4c3d-9e8f-0a1b2c3d4e5f')).toBe('/dashboard/x/:id')
  })
  it('hasil yang lolos memenuhi CHECK DB', () => {
    for (const p of ['/dashboard/a_b/c-d', '/dashboard/ipa/skpd/9']) {
      expect(normalisasiHalaman(p)).toMatch(/^\/dashboard(\/[A-Za-z0-9:_-]+)*$/)
    }
    expect(normalisasiHalaman('/dashboard/ada spasi')).toBeNull()
  })
  it('pola KEMBAR dengan migrasi', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261011_02_aktivitas_pengguna.sql'), 'utf8')
    expect(sql.split("'^/dashboard(/[A-Za-z0-9:_-]+)*$'").length - 1).toBe(2)
  })
})

describe('labelHalaman', () => {
  const peta = { '/dashboard': 'Dashboard', '/dashboard/ipa': 'IPA › Dashboard IPA', '/dashboard/daftar-barang': 'Daftar Barang' }
  it('persis, awalan, lalu slug', () => {
    expect(labelHalaman('/dashboard/daftar-barang', peta)).toBe('Daftar Barang')
    expect(labelHalaman('/dashboard/ipa/skpd/:id', peta)).toBe('IPA › Dashboard IPA › skpd :id')
    expect(labelHalaman('/dashboard/profil', peta)).toBe('Profil')
  })
})

describe('susunAktivitas', () => {
  const tgl = ['2026-10-09', '2026-10-10', '2026-10-11']
  it('hari aktif = salah satu sumber; di luar rentang diabaikan', () => {
    const p = susunAktivitas(tgl,
      [{ user_id: 'a', tanggal: '2026-10-09', jumlah: 3 }, { user_id: 'a', tanggal: '2026-10-01', jumlah: 9 }],
      [
        { user_id: 'a', tanggal: '2026-10-11', halaman: '/dashboard', jumlah: 2 },
        { user_id: 'a', tanggal: '2026-10-11', halaman: '/dashboard/daftar-barang', jumlah: 5 },
        { user_id: 'a', tanggal: '2026-10-10', halaman: '/dashboard/daftar-barang', jumlah: 1 },
      ],
      [{ user_id: 'b', login_terakhir: '2026-09-01T00:00:00Z', sesi_terakhir: null, halaman_terakhir: null }],
    )
    const a = p.get('a')!
    expect(a.hariAktif).toBe(3)
    expect(a.hari.map(h => [h.sesi, h.kunjungan])).toEqual([[3, 0], [0, 1], [0, 7]])
    expect(a.totalKunjungan).toBe(8)
    expect(a.halaman).toEqual([{ halaman: '/dashboard/daftar-barang', jumlah: 6 }, { halaman: '/dashboard', jumlah: 2 }])
    expect(p.get('b')!.hariAktif).toBe(0)
    expect(p.get('b')!.terakhir).toBe('2026-09-01T00:00:00Z')
    expect(userAktifPerHari(tgl, p)).toEqual([1, 1, 1])
  })
  it('terakhir = paling akhir dari tiga sumber', () => {
    const p = susunAktivitas(tgl, [], [], [{
      user_id: 'a', login_terakhir: '2026-10-01T00:00:00Z', sesi_terakhir: '2026-10-11T03:00:00Z', halaman_terakhir: '2026-10-10T00:00:00Z',
    }])
    expect(p.get('a')!.terakhir).toBe('2026-10-11T03:00:00Z')
  })
})

describe('waktuRelatif', () => {
  const kini = new Date('2026-10-11T05:00:00Z') // 12:00 WIB
  it('bertingkat', () => {
    expect(waktuRelatif(null, kini)).toBe('Belum pernah')
    expect(waktuRelatif('2026-10-11T04:59:30Z', kini)).toBe('baru saja')
    expect(waktuRelatif('2026-10-11T04:30:00Z', kini)).toBe('30 menit lalu')
    expect(waktuRelatif('2026-10-11T01:00:00Z', kini)).toBe('4 jam lalu')
    expect(waktuRelatif('2026-10-10T05:00:00Z', kini)).toBe('kemarin')
    expect(waktuRelatif('2026-10-06T05:00:00Z', kini)).toBe('5 hari lalu')
  })
})
