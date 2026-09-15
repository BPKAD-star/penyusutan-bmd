// ============================================================================
// Mengunci REFACTOR-PLAN §5 butir 2.3 — kolom Daftar Barang ↔ Daftar Barang
// Awal. Sampai 2026-09-15 kedua daftar ditulis terpisah & cuma dijaga komentar
// "ubah satu, samakan yang lain"; pelanggarannya TIDAK menghasilkan satu pun
// error — dua menu sekadar menampilkan barang yang sama dgn isi berbeda.
//
// Yang dijaga di sini EMPAT hal, semuanya bentuk kegagalan senyap:
//   (1) daftar kolom kedua menu tetap SAMA, kecuali satu penyimpangan yang
//       memang disengaja & PUNYA NAMA (`kendaraanPM`);
//   (2) tiap kunci kolom punya judul di KOLOM_META — kunci tanpa judul
//       merender kepala kolom KOSONG, bukan error;
//   (3) kolom 1.5.4 tetap kembar dgn `ASET_LAIN_LAIN_EXTRA` (lib/asetFields.ts)
//       — operator yang bisa MENGISI field tapi tak pernah bisa MELIHATnya (atau
//       sebaliknya) adalah keadaan paling membingungkan dari dua-duanya;
//   (4) `kolomGolongan` mengembalikan array BARU tiap panggil — daftar bersama
//       yang tersunting di tempat oleh satu pemanggil merusak pemanggil lain.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  KOLOM_META, KOLOM_GOLONGAN, KOLOM_DEFAULT, KENDARAAN_PM, NOWRAP_KEYS,
  KOLOM_KE_FIELD, kolomGolongan, fieldTambahan154,
} from './kolomBarang'
import { ASET_LAIN_LAIN_EXTRA } from './asetFields'

const GOLONGAN = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']

// Potret keadaan SEBELUM diangkat ke modul bersama (2026-09-15), disalin apa
// adanya dari `COLS` di app/dashboard/daftar-barang/page.tsx. Ini yang membuat
// pengangkatannya terbukti MURNI-PINDAH: kalau satu kolom bergeser/hilang saat
// dua halaman diubah, test ini merah — bukan operator yang menemukannya.
const DAFTAR_BARANG_SEBELUM: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'luas', 'hak', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.3': ['skpd', 'kode', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.4': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb',
    'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
    'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}

// Disalin apa adanya dari `BASE_COLS` di
// app/dashboard/saldo-awal/daftar-barang/page.tsx.
const DAFTAR_BARANG_AWAL_SEBELUM: Record<string, string[]> = {
  ...DAFTAR_BARANG_SEBELUM,
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}

describe('murni-pindah: kolom persis seperti sebelum diangkat', () => {
  for (const g of GOLONGAN) {
    it(`Daftar Barang ${g} tak bergeser`, () => {
      expect(kolomGolongan(g)).toEqual(DAFTAR_BARANG_SEBELUM[g])
    })
    it(`Daftar Barang Awal ${g} tak bergeser`, () => {
      expect(kolomGolongan(g, { kendaraanPM: true })).toEqual(DAFTAR_BARANG_AWAL_SEBELUM[g])
    })
  }
  it('golongan tak dikenal → kolom bawaan', () => {
    expect(kolomGolongan('')).toEqual(KOLOM_DEFAULT)
    expect(kolomGolongan('9.9.9', { kendaraanPM: true })).toEqual(KOLOM_DEFAULT)
  })
})

describe('(1) beda antar-menu HANYA penyimpangan yang disengaja', () => {
  it('cuma 1.3.2 yang berbeda', () => {
    const beda = GOLONGAN.filter(g =>
      JSON.stringify(kolomGolongan(g)) !== JSON.stringify(kolomGolongan(g, { kendaraanPM: true })))
    expect(beda).toEqual(['1.3.2'])
  })

  it('bedanya PERSIS keempat kolom kendaraan, disisipkan sesudah Spesifikasi', () => {
    const tanpa = kolomGolongan('1.3.2')
    const dengan = kolomGolongan('1.3.2', { kendaraanPM: true })
    expect(dengan.filter(k => !tanpa.includes(k))).toEqual([...KENDARAAN_PM])
    // Urutan sisanya tak boleh ikut bergeser.
    expect(dengan.filter(k => !(KENDARAAN_PM as readonly string[]).includes(k))).toEqual(tanpa)
    expect(dengan.indexOf('nopol')).toBe(dengan.indexOf('spesifikasi') + 1)
  })

  it('1.5.4 memuat keempatnya di KEDUA menu — benderanya tak menyentuhnya', () => {
    // Golongan campuran: isinya bekas semua golongan, jadi kendaraan selalu ikut.
    for (const k of KENDARAAN_PM) {
      expect(kolomGolongan('1.5.4')).toContain(k)
      expect(kolomGolongan('1.5.4', { kendaraanPM: true })).toContain(k)
    }
  })
})

describe('(2) tiap kunci kolom punya judul', () => {
  it('semua kunci di KOLOM_GOLONGAN & KOLOM_DEFAULT ada di KOLOM_META', () => {
    const semua = new Set([...Object.values(KOLOM_GOLONGAN).flat(), ...KOLOM_DEFAULT])
    const yatim = [...semua].filter(k => !KOLOM_META[k])
    expect(yatim).toEqual([])
  })
  it('tak ada judul kosong', () => {
    for (const [k, m] of Object.entries(KOLOM_META)) expect(m.header.trim(), k).not.toBe('')
  })
  it('NOWRAP_KEYS menunjuk kolom yang benar-benar ada', () => {
    const semua = new Set(Object.values(KOLOM_GOLONGAN).flat())
    expect([...NOWRAP_KEYS].filter(k => !semua.has(k))).toEqual([])
  })
})

describe('(3) 1.5.4 kembar dgn ASET_LAIN_LAIN_EXTRA (lib/asetFields.ts)', () => {
  it('himpunannya SAMA PERSIS, dua arah', () => {
    const ditampilkan = fieldTambahan154()
    const ditawarkan = new Set(ASET_LAIN_LAIN_EXTRA)
    // Bisa diisi tapi tak bisa dilihat:
    expect([...ditawarkan].filter(f => !ditampilkan.has(f))).toEqual([])
    // Bisa dilihat tapi tak pernah bisa diisi:
    expect([...ditampilkan].filter(f => !ditawarkan.has(f))).toEqual([])
  })
  it('petanya tidak menyimpang — tiap kunci menunjuk FieldKey yang berbeda', () => {
    const nilai = Object.values(KOLOM_KE_FIELD)
    expect(new Set(nilai).size).toBe(nilai.length)
  })
})

describe('(4) daftar bersama tak bisa tersunting di tempat', () => {
  it('tiap panggilan mengembalikan array BARU', () => {
    const a = kolomGolongan('1.3.2')
    const b = kolomGolongan('1.3.2')
    expect(a).not.toBe(b)
    a.push('palsu')
    expect(kolomGolongan('1.3.2')).not.toContain('palsu')
    expect(KOLOM_GOLONGAN['1.3.2']).not.toContain('palsu')
  })
  it('kolom bawaan juga tak bisa tersunting lewat hasilnya', () => {
    const a = kolomGolongan('9.9.9')
    a.push('palsu')
    expect(KOLOM_DEFAULT).not.toContain('palsu')
  })
})
