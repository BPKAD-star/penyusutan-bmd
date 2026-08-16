// Uji aturan kelengkapan isian baris Usulan Standar Harga.
//
// Kenapa diuji: pemeriksa ini dipakai DUA pintu masuk (pop-up "Tambah baris" &
// Import Excel) plus penjaga tombol Ajukan. Kalau salah satu cabang jenis
// melonggar tanpa sengaja, yang lolos adalah baris setengah isi yang nanti jadi
// ACUAN BERSAMA SE-KABUPATEN — dipakai SKPD lain menyusun anggaran.
import { describe, it, expect } from 'vitest'
import {
  validasiItemUsulan, pakaiMerk, pakaiKodeBarang, pakaiRekening, pakaiTkdn,
  type IsianItemUsulan, type UsulanJenis,
} from '@/lib/rkbmdStandarUsulan'

/** Baris SSH yang lengkap — titik tolak semua uji "kurang satu". */
const SSH_LENGKAP: IsianItemUsulan = {
  kode: '1.3.2.02.01.01.003',
  nama: 'Station Wagon',
  merk_tipe: 'Avanza GT 1500CC',
  satuan: 'Unit',
  harga: 325_000_000,
  tkdn: 74,
  kuantitas_standar: null,
  satuan_pengukur: null,
  keterangan: 'Belanja Modal Kendaraan Roda Empat',
  rekening: ['5.2.02.02.001.00004'],
}

const tanpa = (p: Partial<IsianItemUsulan>): IsianItemUsulan => ({ ...SSH_LENGKAP, ...p })

describe('validasiItemUsulan — SSH lengkap', () => {
  it('tak ada masalah', () => {
    expect(validasiItemUsulan('ssh', SSH_LENGKAP)).toEqual([])
  })
})

describe('validasiItemUsulan — setiap kolom wajib', () => {
  const KURANG: [string, Partial<IsianItemUsulan>][] = [
    ['kode barang', { kode: null }],
    ['nama', { nama: '   ' }],
    ['merk', { merk_tipe: null }],
    ['satuan', { satuan: '' }],
    ['harga', { harga: null }],
    ['tkdn', { tkdn: null }],
    ['keterangan', { keterangan: null }],
    ['rekening', { rekening: [] }],
  ]
  for (const [nama, patch] of KURANG) {
    it(`menolak baris tanpa ${nama}`, () => {
      expect(validasiItemUsulan('ssh', tanpa(patch)).length).toBe(1)
    })
  }

  it('rekening berisi string kosong sama dengan tak ada', () => {
    expect(validasiItemUsulan('ssh', tanpa({ rekening: ['', '  '] })).length).toBe(1)
  })

  it('harga 0 ditolak — standar harga bernilai nol sama saja belum diisi', () => {
    expect(validasiItemUsulan('ssh', tanpa({ harga: 0 })).length).toBe(1)
  })

  it('TKDN di luar 0–100 ditolak', () => {
    expect(validasiItemUsulan('ssh', tanpa({ tkdn: 101 })).length).toBe(1)
    expect(validasiItemUsulan('ssh', tanpa({ tkdn: -1 })).length).toBe(1)
    expect(validasiItemUsulan('ssh', tanpa({ tkdn: 0 }))).toEqual([])   // 0% itu sah
  })

  it('mengumpulkan SEMUA kekurangan sekaligus, bukan satu per satu', () => {
    // Layar Import menampilkannya per baris; operator yang harus mengunggah
    // ulang lima kali karena diberi tahu satu-satu akan menyerah.
    const m = validasiItemUsulan('ssh', tanpa({ nama: '', satuan: '', keterangan: null, rekening: [] }))
    expect(m.length).toBe(4)
  })
})

describe('validasiItemUsulan — kelonggaran kode rekening', () => {
  it('cukup SATU rekening, tak perlu kelima slotnya', () => {
    expect(validasiItemUsulan('ssh', tanpa({ rekening: ['5.2.02.02.001.00004'] }))).toEqual([])
  })

  it('lebih dari satu tetap sah', () => {
    expect(validasiItemUsulan('ssh', tanpa({ rekening: ['5.2.02.02.001.00004', '5.1.02.01.001.00001'] })))
      .toEqual([])
  })
})

describe('validasiItemUsulan — bentuk per jenis', () => {
  it('ASB & SBU: tanpa kode barang, tanpa merk, tanpa TKDN — tetap sah', () => {
    // ASB itu komponen belanja kegiatan & SBU honorarium/perjalanan dinas:
    // keduanya bukan barang, jadi mewajibkan kode/merk/TKDN di sana cuma
    // memaksa operator mengarang isian.
    for (const j of ['asb', 'sbu'] as UsulanJenis[]) {
      expect(pakaiKodeBarang(j)).toBe(false)
      expect(pakaiMerk(j)).toBe(false)
      expect(pakaiTkdn(j)).toBe(false)
      expect(validasiItemUsulan(j, tanpa({ kode: null, merk_tipe: null, tkdn: null }))).toEqual([])
    }
  })

  it('SBSK: butuh kuantitas + satuan pengukur, TIDAK butuh harga/rekening', () => {
    expect(pakaiRekening('sbsk')).toBe(false)
    const sbsk: IsianItemUsulan = {
      kode: '1.3.2.02.01.01.003', nama: 'Laptop', merk_tipe: null, satuan: 'Unit',
      harga: null, tkdn: null, kuantitas_standar: 1, satuan_pengukur: 'per pegawai',
      keterangan: 'Standar kebutuhan pegawai', rekening: [],
    }
    expect(validasiItemUsulan('sbsk', sbsk)).toEqual([])
    expect(validasiItemUsulan('sbsk', { ...sbsk, kuantitas_standar: null }).length).toBe(1)
    expect(validasiItemUsulan('sbsk', { ...sbsk, satuan_pengukur: '' }).length).toBe(1)
  })

  it('HSPK diperlakukan sama dengan SSH', () => {
    expect(pakaiMerk('hspk')).toBe(true)
    expect(validasiItemUsulan('hspk', SSH_LENGKAP)).toEqual([])
  })
})
