import { describe, it, expect } from 'vitest'
import {
  hitungBerakhir, perluNilaiPemanfaatan, persenMasaPemanfaatan, bandPemanfaatan,
  perluPeringatanPenarikan, JENIS_BERPENDAPATAN,
} from './pemanfaatan'

describe('hitungBerakhir', () => {
  it('menambahkan tahun ke tanggal mulai', () => {
    expect(hitungBerakhir('2026-01-15', 2)).toBe('2028-01-15')
  })
  it('input kosong/tak valid → string kosong', () => {
    expect(hitungBerakhir('', 2)).toBe('')
    expect(hitungBerakhir('2026-01-15', 0)).toBe('')
    expect(hitungBerakhir('2026-01-15', -1)).toBe('')
  })
})

describe('perluNilaiPemanfaatan — hanya jenis berpendapatan', () => {
  it('sewa/ksp/bgs_bsg/kspi → true', () => {
    for (const j of JENIS_BERPENDAPATAN) expect(perluNilaiPemanfaatan(j)).toBe(true)
  })
  it('pinjam_pakai (non-profit) → false, field TAK ditawarkan', () => {
    expect(perluNilaiPemanfaatan('pinjam_pakai')).toBe(false)
  })
  it('jenis tak dikenal → false (fail-closed, bukan menebak)', () => {
    expect(perluNilaiPemanfaatan('')).toBe(false)
    expect(perluNilaiPemanfaatan('entah')).toBe(false)
  })
})

describe('persenMasaPemanfaatan — UTC-safe, hariIni WAJIB dioper', () => {
  it('tepat di tengah → 50%', () => {
    expect(persenMasaPemanfaatan('2026-01-01', '2027-01-01', '2026-07-02')).toBeCloseTo(50, 0)
  })
  it('hari pertama → 0%', () => {
    expect(persenMasaPemanfaatan('2026-01-01', '2027-01-01', '2026-01-01')).toBe(0)
  })
  it('sudah lewat tanggal berakhir → > 100%', () => {
    const p = persenMasaPemanfaatan('2026-01-01', '2026-02-01', '2026-03-03')
    expect(p).not.toBeNull()
    expect(p as number).toBeGreaterThan(100)
  })
  it('tanggal kosong → null (tak bisa dinilai)', () => {
    expect(persenMasaPemanfaatan('', '2027-01-01', '2026-07-02')).toBeNull()
    expect(persenMasaPemanfaatan('2026-01-01', '', '2026-07-02')).toBeNull()
  })
  it('berakhir <= mulai → null (rentang tak masuk akal)', () => {
    expect(persenMasaPemanfaatan('2026-01-01', '2026-01-01', '2026-01-01')).toBeNull()
    expect(persenMasaPemanfaatan('2026-06-01', '2026-01-01', '2026-03-01')).toBeNull()
  })
  it('⚠️ zona waktu: tengah malam UTC tak boleh menggeser sehari', () => {
    // Kalau fungsi salah pakai `new Date(str)` (dibaca tengah malam UTC lalu
    // dikonversi ke zona lokal negatif), batas awal bisa mundur/maju sehari.
    expect(persenMasaPemanfaatan('2026-01-01', '2026-01-11', '2026-01-01')).toBe(0)
    expect(persenMasaPemanfaatan('2026-01-01', '2026-01-11', '2026-01-11')).toBe(100)
  })
})

describe('bandPemanfaatan — lima pita, batas atas EKSKLUSIF', () => {
  it('di bawah 25% → hijau', () => { expect(bandPemanfaatan(0)).toBe('hijau'); expect(bandPemanfaatan(24.9)).toBe('hijau') })
  it('25–49% → kuning', () => { expect(bandPemanfaatan(25)).toBe('kuning'); expect(bandPemanfaatan(49.9)).toBe('kuning') })
  it('50–74% → oranye', () => { expect(bandPemanfaatan(50)).toBe('oranye'); expect(bandPemanfaatan(74.9)).toBe('oranye') })
  it('75–99% → merah', () => { expect(bandPemanfaatan(75)).toBe('merah'); expect(bandPemanfaatan(99.9)).toBe('merah') })
  it('100% ke atas → hitam', () => { expect(bandPemanfaatan(100)).toBe('hitam'); expect(bandPemanfaatan(250)).toBe('hitam') })
})

describe('perluPeringatanPenarikan — HANYA band merah, bukan hitam', () => {
  it('merah → true', () => expect(perluPeringatanPenarikan('merah')).toBe(true))
  it('band lain (termasuk hitam, sudah lewat) → false', () => {
    expect(perluPeringatanPenarikan('hijau')).toBe(false)
    expect(perluPeringatanPenarikan('kuning')).toBe(false)
    expect(perluPeringatanPenarikan('oranye')).toBe(false)
    expect(perluPeringatanPenarikan('hitam')).toBe(false)
  })
})
