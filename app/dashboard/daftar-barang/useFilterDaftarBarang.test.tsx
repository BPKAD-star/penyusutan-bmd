// @vitest-environment jsdom
// ============================================================================
// Mengunci filter Daftar Barang (./useFilterDaftarBarang.ts) — LAPIS 1.
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//   · aturan DUA MODE (user 2026-08-14) — "semua jenis aset × semua SKPD"
//     ditolak SEBELUM query ditembak; kalau lolos, yang menolak DB dengan
//     pesan mentah, dan halaman ini pernah timeout total karenanya
//   · `descIds` KOSONG (`[]`) diperlakukan sama dengan belum memilih SKPD —
//     array kosong itu truthy, jadi penjaga yang cuma mengecek `descIds`
//     akan meloloskannya diam-diam
//   · periode dirakit `YYYY-S<n>`, bukan bentuk lain — ia dikirim apa adanya
//     ke `fn_daftar_barang`
//   · kata kunci di-`trim()` — spasi di ujung bikin `ilike '%kursi %'` tak
//     menemukan apa pun & terbaca operator sbg "barangnya tidak ada"
//   · `applied` TIDAK ikut bergerak saat filter diketik: itu yang mencegah
//     isi halaman bergeser tanpa menekan Tampilkan
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

vi.mock('@/lib/tahunKerja', () => ({ tahunAwal: (fallback: string) => fallback }))

import { cekFilterDaftarBarang, useFilterDaftarBarang } from './useFilterDaftarBarang'

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('cekFilterDaftarBarang — aturan dua mode', () => {
  it('menolak "semua jenis aset untuk semua SKPD"', () => {
    const p = cekFilterDaftarBarang('', null)
    expect(p).toBeTruthy()
    expect(p).toContain('Pilih SKPD dulu')
  })

  it('`descIds` KOSONG sama dengan belum memilih SKPD', () => {
    // `[]` itu truthy — penjaga yang lupa mengecek panjangnya akan
    // meloloskannya, dan DB menolaknya dengan pesan mentah.
    expect(cekFilterDaftarBarang('', [])).toBeTruthy()
  })

  it('SKPD dipilih, jenis aset kosong → BOLEH (mode per-SKPD)', () => {
    expect(cekFilterDaftarBarang('', [7])).toBeNull()
  })

  it('jenis aset dipilih, SKPD kosong → BOLEH (mode se-kabupaten)', () => {
    expect(cekFilterDaftarBarang('1.3.2', null)).toBeNull()
  })

  it('dua-duanya dipilih → BOLEH', () => {
    expect(cekFilterDaftarBarang('1.3.2', [7])).toBeNull()
  })
})

describe('useFilterDaftarBarang', () => {
  it('mulai tanpa filter terpilih & tanpa `applied`', () => {
    const { result } = renderHook(() => useFilterDaftarBarang())
    expect(result.current.applied).toBeNull()
    expect(result.current.fSel).toEqual({ skpdId: null, descIds: null })
    expect(result.current.fGolongan).toBe('')
    // Belum ada SKPD & belum ada jenis aset → aturan dua mode menolak.
    expect(result.current.pesanFilter).toBeTruthy()
  })

  it('`pesanFilter` hilang begitu salah satu mode terpenuhi', () => {
    const { result } = renderHook(() => useFilterDaftarBarang())
    act(() => result.current.setFGolongan('1.3.2'))
    expect(result.current.pesanFilter).toBeNull()
  })

  it('tahun & semester bawaan diambil dari periode HARI INI', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
    const { result } = renderHook(() => useFilterDaftarBarang())
    expect(result.current.fTahun).toBe('2026')
    expect(result.current.fSmt).toBe('2')   // September = Semester II
  })

  it('semester I terbaca untuk tanggal Januari–Juni', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const { result } = renderHook(() => useFilterDaftarBarang())
    expect(result.current.fSmt).toBe('1')
  })

  it('rakit() menyusun periode `YYYY-S<n>` & membawa seluruh filter', () => {
    const { result } = renderHook(() => useFilterDaftarBarang())
    act(() => {
      result.current.setFSel({ skpdId: 7, descIds: [7, 8] })
      result.current.setFGolongan('1.3.2')
      result.current.setFKomptabel('intra')
      result.current.setFTahun('2025')
      result.current.setFSmt('1')
    })
    expect(result.current.rakit()).toEqual({
      descIds: [7, 8], skpdId: 7, golongan: '1.3.2',
      komptabel: 'intra', search: '', periode: '2025-S1',
    })
  })

  it('rakit() men-`trim()` kata kunci', () => {
    const { result } = renderHook(() => useFilterDaftarBarang())
    act(() => result.current.setFSearch('  kursi lipat  '))
    expect(result.current.rakit().search).toBe('kursi lipat')
  })

  it('mengetik filter TIDAK menggeser `applied`', () => {
    // Inti mesin ini: paginasi, rekap, & kedua Export membaca `applied`.
    // Kalau ia ikut bergerak, isi halaman yang sedang dibaca operator
    // bergeser tanpa ia menekan Tampilkan — tanpa satu pun error.
    const { result } = renderHook(() => useFilterDaftarBarang())
    act(() => result.current.setFGolongan('1.3.2'))
    act(() => result.current.setApplied(result.current.rakit()))
    const sebelum = result.current.applied
    act(() => result.current.setFGolongan('1.3.3'))
    act(() => result.current.setFSearch('mobil'))
    expect(result.current.applied).toBe(sebelum)
    expect(result.current.applied?.golongan).toBe('1.3.2')
  })
})
