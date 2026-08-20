// ============================================================================
// pecahNibar — pemenggalan NIBAR 2 baris untuk lembar cetak yang kolomnya sempit.
//
// Taruhannya bukan kerapian: penjaganya SAMA dengan `prefixNibar`, dan kalau
// dilonggarkan, 150.101 NIBAR warisan impor ATL Diknas — yang juga 45 digit
// tapi SUSUNANNYA BEDA — ikut dipenggal di posisi yang bukan batas segmennya.
// Hasilnya lembar resmi yang menampilkan NIBAR terbelah di tengah angka, tanpa
// satu pun error.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { pecahNibar, prefixNibar, POTONG_NIBAR_CETAK, PANJANG_NIBAR_PENUH } from './kodeRegister'

// Data hidup 2026-08-20 — Tanah Jalan Road Diversion 1, hibah SDHI ke Dinas PU.
//   [12][01][3506] [05000000000000] [2024] | [131010307003] [0000042]
const NIBAR_KITA = '120135060500000000000020241310103070030000042'
// Susunan warisan e-BMD (kode barang & SKPD tertukar, tahun di belakang).
// Panjangnya SAMA 45 digit — itulah sebabnya panjang saja tak cukup jadi penjaga.
const NIBAR_EBMD = '000000011310103070030500000000000020240000042'

describe('pecahNibar — memenggal di BATAS SEGMEN', () => {
  it('baris kedua dimulai dari KODE BARANG', () => {
    const p = pecahNibar(NIBAR_KITA)
    expect(p).not.toBeNull()
    expect(p![0]).toBe('12013506050000000000002024')
    expect(p![1]).toBe('1310103070030000042')
    // Inilah yang diminta user: potongan kedua terbaca sbg kode barangnya.
    expect(p![1].startsWith('1310103')).toBe(true)
  })

  it('kedua potongan menyambung utuh — tak ada digit hilang/dobel', () => {
    const p = pecahNibar(NIBAR_KITA)!
    expect(p[0] + p[1]).toBe(NIBAR_KITA)
    expect(p[0].length).toBe(POTONG_NIBAR_CETAK)
    expect(p[0].length + p[1].length).toBe(PANJANG_NIBAR_PENUH)
  })
})

describe('pecahNibar — menolak yang tak bisa dinilai', () => {
  it('NIBAR warisan e-BMD (45 digit, susunan BEDA) → null', () => {
    // Kalau ini dipenggal di 26, potongannya jatuh di tengah segmen yang bukan
    // itu. `null` = "tampilkan utuh", bukan "tebak".
    expect(NIBAR_EBMD.length).toBe(PANJANG_NIBAR_PENUH)   // panjang saja tak membedakan
    expect(prefixNibar(NIBAR_EBMD)).toBeNull()            // penjaganya yang membedakan
    expect(pecahNibar(NIBAR_EBMD)).toBeNull()
  })

  it('kosong / panjang salah → null', () => {
    for (const v of [null, '', '   ', '12013506', NIBAR_KITA + '9', NIBAR_KITA.slice(0, 44)]) {
      expect(pecahNibar(v), `nilai ${JSON.stringify(v)}`).toBeNull()
    }
  })

  it('penjaganya KEMBAR dgn prefixNibar — jangan sampai menyimpang', () => {
    // Kalau salah satu dilonggarkan tanpa yang lain, lembar cetak & penanda
    // "bergeser dari NIBAR" berhenti sepakat soal NIBAR mana yang bisa dinilai.
    for (const v of [NIBAR_KITA, NIBAR_EBMD, '', 'abc']) {
      expect(pecahNibar(v) !== null, `nilai ${JSON.stringify(v)}`).toBe(prefixNibar(v) !== null)
    }
  })
})
