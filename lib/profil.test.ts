import { describe, expect, it } from 'vitest'
import { formDariPegawai, kekuranganFormUbah, perubahanProfil, susunUsulan, type DataPegawai } from './profil'

const LAMA: DataPegawai = { nama: 'Budi Santoso', golongan: 'II/c', pangkat: 'Pengatur', jabatan: 'Pengurus Barang' }

describe('susunUsulan', () => {
  it('menurunkan pangkat dari golongan yang baru', () => {
    const u = susunUsulan({ nama: 'Budi Santoso', golongan: 'III/a', jabatan: 'Pengurus Barang' }, LAMA)
    expect(u.golongan).toBe('III/a')
    expect(u.pangkat).toBe('Penata Muda')
  })

  it('golongan tak berubah → pangkat lama dipertahankan apa adanya', () => {
    // Tulisan pangkat di data lama boleh sedikit beda dari daftar baku.
    const lama = { ...LAMA, pangkat: 'Pengatur (Ruang c)' }
    const u = susunUsulan(formDariPegawai(lama), lama)
    expect(u.pangkat).toBe('Pengatur (Ruang c)')
    expect(perubahanProfil(lama, u)).toEqual([])
  })

  it('golongan dikosongkan (Non-ASN) → pangkat ikut kosong', () => {
    const u = susunUsulan({ nama: 'Budi', golongan: '', jabatan: 'X' }, LAMA)
    expect(u.golongan).toBeNull()
    expect(u.pangkat).toBeNull()
  })

  it('spasi di tepi dibuang; jabatan kosong jadi null', () => {
    const u = susunUsulan({ nama: '  Budi S.  ', golongan: 'II/c', jabatan: '   ' }, LAMA)
    expect(u.nama).toBe('Budi S.')
    expect(u.jabatan).toBeNull()
  })
})

describe('perubahanProfil', () => {
  it('hanya melaporkan bidang yang benar-benar berbeda', () => {
    const u = susunUsulan({ nama: 'Budi Santoso', golongan: 'II/c', jabatan: 'Kepala Seksi' }, LAMA)
    const p = perubahanProfil(LAMA, u)
    expect(p.map(x => x.kunci)).toEqual(['jabatan'])
    expect(p[0]).toMatchObject({ dari: 'Pengurus Barang', ke: 'Kepala Seksi' })
  })

  it('naik golongan melaporkan golongan DAN pangkat', () => {
    const u = susunUsulan({ nama: 'Budi Santoso', golongan: 'II/d', jabatan: 'Pengurus Barang' }, LAMA)
    expect(perubahanProfil(LAMA, u).map(x => x.kunci)).toEqual(['golongan', 'pangkat'])
  })
})

describe('kekuranganFormUbah', () => {
  it('menolak nama kosong', () => {
    expect(kekuranganFormUbah({ nama: ' ', golongan: 'II/c', jabatan: 'Pengurus Barang' }, LAMA))
      .toEqual(['Nama tidak boleh kosong.'])
  })

  it('menolak form yang sama persis dengan data sekarang', () => {
    expect(kekuranganFormUbah(formDariPegawai(LAMA), LAMA)).toHaveLength(1)
  })

  it('lolos kalau ada yang berubah', () => {
    expect(kekuranganFormUbah({ ...formDariPegawai(LAMA), jabatan: 'Kepala Seksi' }, LAMA)).toEqual([])
  })
})
