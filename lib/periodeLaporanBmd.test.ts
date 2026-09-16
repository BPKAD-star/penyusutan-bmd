// ============================================================================
// Mengunci aturan periode Laporan BMD (./periodeLaporanBmd.ts) — LAPIS 1.
//
// Keputusan user 2026-08-10, sampai 2026-09-16 hidup sebagai empat baris
// turunan di dalam komponen tanpa satu pun test. Yang dijaga hal-hal yang
// kalau bergeser TIDAK menghasilkan error — lembarnya tetap terisi & tetap
// foot, cuma melaporkan rentang yang bukan itu.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { periodeLaporanBmd } from './periodeLaporanBmd'

describe('Semester I', () => {
  const p = periodeLaporanBmd('2026', '1')
  it('posisi = 2026-S1', () => expect(p.periode).toBe('2026-S1'))
  it('saldo awal = akhir TAHUN LALU, bukan semester sebelumnya di tahun ini', () =>
    expect(p.periodeAwal).toBe('2025-S2'))
  it('mutasi hanya S1', () => expect(p.periodeMutasi).toEqual(['2026-S1']))
  it('label = periodenya sendiri', () => expect(p.labelPeriode).toBe('2026-S1'))
  it('smtEfektif tetap 1', () => expect(p.smtEfektif).toBe('1'))
})

describe('Semester II', () => {
  const p = periodeLaporanBmd('2026', '2')
  it('posisi = 2026-S2', () => expect(p.periode).toBe('2026-S2'))
  it('saldo awal = saldo AKHIR S1, bukan awal tahun', () =>
    expect(p.periodeAwal).toBe('2026-S1'))
  it('mutasi hanya S2', () => expect(p.periodeMutasi).toEqual(['2026-S2']))
})

describe('Akhir Tahun (TH)', () => {
  const p = periodeLaporanBmd('2026', 'TH')

  it('posisi memakai Semester II — `STH` bukan periode yang pernah ada', () => {
    // Tanpa pemetaan ini `fn_rekap_bmd` dipanggil dgn '2026-STH' dan
    // hasilnya KOSONG, bukan error.
    expect(p.smtEfektif).toBe('2')
    expect(p.periode).toBe('2026-S2')
  })

  it('saldo awal = awal TAHUN, bukan akhir S1', () => {
    // Inti bedanya dari Semester II: posisinya sama (S2) tapi saldo awalnya
    // beda. Cabangnya karena itu `smt === '2'`, bukan `smtEfektif === '2'`.
    // Kalau tertukar, Model 3 Akhir Tahun kehilangan SELURUH mutasi Semester
    // I dari sisi saldo awalnya — dan lembarnya tetap foot.
    expect(p.periodeAwal).toBe('2025-S2')
  })

  it('mutasi memuat DUA semester, berurutan', () =>
    expect(p.periodeMutasi).toEqual(['2026-S1', '2026-S2']))

  it('label menyebut setahun, bukan satu periode', () =>
    expect(p.labelPeriode).toBe('2026 (setahun)'))
})

describe('Akhir Tahun vs Semester II — posisi sama, saldo awal BEDA', () => {
  it('itu satu-satunya pembedanya di sisi periode', () => {
    const th = periodeLaporanBmd('2026', 'TH')
    const s2 = periodeLaporanBmd('2026', '2')
    expect(th.periode).toBe(s2.periode)
    expect(th.periodeAwal).not.toBe(s2.periodeAwal)
    expect(th.periodeMutasi).not.toEqual(s2.periodeMutasi)
  })
})

describe('pergantian tahun', () => {
  it('Semester I 2027 menengok ke 2026-S2', () =>
    expect(periodeLaporanBmd('2027', '1').periodeAwal).toBe('2026-S2'))
  it('tahun dihitung sebagai ANGKA, bukan dipotong teks', () =>
    // `'2026' - 1` lewat `Number()`; kalau kelak diganti manipulasi string,
    // pergantian dekade/abad yang patah tak akan bersuara.
    expect(periodeLaporanBmd('2100', 'TH').periodeAwal).toBe('2099-S2'))
})
