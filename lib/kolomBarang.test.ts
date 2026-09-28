// ============================================================================
// Mengunci REFACTOR-PLAN §5 butir 2.3 — kolom Daftar Barang ↔ Daftar Barang
// Awal. Sampai 2026-09-15 kedua daftar ditulis terpisah & cuma dijaga komentar
// "ubah satu, samakan yang lain"; pelanggarannya TIDAK menghasilkan satu pun
// error — dua menu sekadar menampilkan barang yang sama dgn isi berbeda.
//
// ✅ Sejak 2026-09-28 kolom golongan KEDUA menu identik penuh — penyimpangan
// `kendaraanPM` (satu-satunya beda yang pernah ada, khusus 1.3.2) DICABUT, dan
// urutan kolom + peleburan Komptabel ke sel Nilai Perolehan (`kolomLayar`/
// `adaKomptabel`) berlaku SATU sumber untuk kedua menu. Yang dijaga di sini
// EMPAT hal, semuanya bentuk kegagalan senyap:
//   (1) tiap kunci kolom punya judul di KOLOM_META — kunci tanpa judul
//       merender kepala kolom KOSONG, bukan error;
//   (2) kolom 1.5.4 tetap kembar dgn `ASET_LAIN_LAIN_EXTRA` (lib/asetFields.ts)
//       — operator yang bisa MENGISI field tapi tak pernah bisa MELIHATnya (atau
//       sebaliknya) adalah keadaan paling membingungkan dari dua-duanya;
//   (3) `kolomLayar` benar-benar melebur Komptabel (bukan cuma di golongan yg
//       kebetulan dicoba) & `adaKomptabel` cuma false utk Tanah;
//   (4) `kolomGolongan` mengembalikan array BARU tiap panggil — daftar bersama
//       yang tersunting di tempat oleh satu pemanggil merusak pemanggil lain.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  KOLOM_META, KOLOM_GOLONGAN, KOLOM_DEFAULT, NOWRAP_KEYS,
  KOLOM_KE_FIELD, kolomGolongan, kolomLayar, adaKomptabel, fieldTambahan154,
} from './kolomBarang'
import { ASET_LAIN_LAIN_EXTRA } from './asetFields'

const GOLONGAN = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.5.3', '1.5.4']

// Kolom HARAPAN per golongan, sama persis di KEDUA menu — potret keadaan
// sesudah putaran 2026-09-28: Merek/Tipe ATB, No. Polisi/Rangka/Mesin/BPKB +
// Lokasi utk Peralatan & Mesin, Luas utk Gedung & Bangunan/JIJ/KDP,
// Spesifikasi Lainnya dicabut dari Gedung & Bangunan, urutan disamakan dgn
// spreadsheet user (identitas → deskriptif → tgl → asal usul → komptabel →
// nilai → penggunaan → keterangan). Kalau satu kolom bergeser/hilang saat
// halaman diubah, test ini merah — bukan operator yang menemukannya.
const KOLOM_HARAPAN: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'hak', 'tgl', 'asal_usul', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.2': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb', 'lokasi', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.3': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'nama', 'lokasi', 'luas', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'nama', 'merek', 'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
  '1.5.4': ['skpd', 'kode', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb',
    'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
    'tgl', 'asal_usul', 'komptabel', 'nilai', 'penggunaan', 'keterangan'],
}

// Golongan yang komptabel-nya seharusnya TIDAK ada sama sekali — cuma Tanah.
const TANPA_KOMPTABEL = new Set(['1.3.1'])

describe('kolom sama persis dgn harapan, di SATU sumber untuk KEDUA menu', () => {
  for (const g of GOLONGAN) {
    it(`${g} sesuai harapan`, () => {
      expect(kolomGolongan(g)).toEqual(KOLOM_HARAPAN[g])
    })
  }
  it('golongan tak dikenal → kolom bawaan', () => {
    expect(kolomGolongan('')).toEqual(KOLOM_DEFAULT)
    expect(kolomGolongan('9.9.9')).toEqual(KOLOM_DEFAULT)
  })
  it('1.5.4 tetap memuat keempat kolom kendaraan (golongan campuran)', () => {
    for (const k of ['nopol', 'rangka', 'mesin', 'bpkb']) expect(kolomGolongan('1.5.4')).toContain(k)
  })
})

describe('(1) tiap kunci kolom punya judul', () => {
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

describe('(2) 1.5.4 kembar dgn ASET_LAIN_LAIN_EXTRA (lib/asetFields.ts)', () => {
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

describe('(3) Komptabel dilebur ke Nilai Perolehan di layar (permintaan user 2026-09-28)', () => {
  it('adaKomptabel FALSE hanya utk Tanah, TRUE utk sisanya (termasuk default)', () => {
    for (const g of GOLONGAN) expect(adaKomptabel(g), g).toBe(!TANPA_KOMPTABEL.has(g))
    expect(adaKomptabel('')).toBe(true) // KOLOM_DEFAULT punya komptabel
    expect(adaKomptabel('9.9.9')).toBe(true)
  })
  it('kolomLayar = kolomGolongan MINUS komptabel, urutan sisanya tak bergeser', () => {
    for (const g of GOLONGAN) {
      const layar = kolomLayar(g)
      const penuh = kolomGolongan(g)
      expect(layar).toEqual(penuh.filter(k => k !== 'komptabel'))
      expect(layar).not.toContain('komptabel')
    }
  })
  it('golongan tanpa Komptabel (Tanah) tak berubah sama sekali oleh kolomLayar', () => {
    expect(kolomLayar('1.3.1')).toEqual(kolomGolongan('1.3.1'))
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
