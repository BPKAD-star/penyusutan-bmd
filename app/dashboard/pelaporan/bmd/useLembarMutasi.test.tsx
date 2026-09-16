// @vitest-environment jsdom
// ============================================================================
// Mengunci lembar IV.L.4.1/4.3 (./useLembarMutasi.ts) — LAPIS 1 (Laporan BMD).
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error, dan
// dua di antaranya berakhir di lembar BERTANDA TANGAN:
//   · `konfigAwal()` SATU sumber — pratinjau di layar & lembar yang tercetak
//     wajib menyebut sebutan pejabat yang SAMA
//   · aturan sebutan: level ≤ 1 → "Pengguna Barang", di bawahnya "Kuasa
//     Pengguna Barang"
//   · `kode_lokasi` KOSONG di seluruh 816 baris (CLAUDE.md 2026-08-03) → kop
//     jatuh ke `kode_skpd`; kalau tidak, kop bertitik-titik untuk SEMUA SKPD
//   · ganti SKPD MERESET konfig — kalau tidak, kop SKPD lama tercetak di atas
//     angka SKPD baru
//   · `document.title` dipulihkan sesudah cetak
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup, waitFor } from '@testing-library/react'

let skpdRow: Record<string, unknown> | null = null
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: skpdRow }) }) }) }),
  }),
}))
vi.mock('@/lib/namaBerkas', () => ({
  namaBerkasLaporan: (o: { laporan: string; periode: string; skpd?: string }) =>
    `${o.laporan}_${o.periode}_${o.skpd}`,
}))

import { useLembarMutasi } from './useLembarMutasi'

beforeEach(() => { skpdRow = null; document.title = 'Dashboard' })
afterEach(cleanup)

const pasang = (skpdId: number | null, siap = false, periode = '2026-S2') =>
  renderHook(({ id, s }) => useLembarMutasi(id, periode, s), { initialProps: { id: skpdId, s: siap } })

describe('identitas SKPD', () => {
  it('memuat nama & level dari admin_skpd', async () => {
    skpdRow = { nama: 'Dinas Pendidikan', level: 1, kode_skpd: '01.00.00', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo?.nama).toBe('Dinas Pendidikan'))
    expect(h.result.current.namaSkpd).toBe('Dinas Pendidikan')
  })

  it('`kode_lokasi` kosong → jatuh ke `kode_skpd`', async () => {
    // Kolom bernama-tepat itu KOSONG di seluruh 816 baris; tanpa cadangan ini
    // kop lembar bertitik-titik untuk SEMUA SKPD (CLAUDE.md 2026-08-03).
    skpdRow = { nama: 'X', level: 1, kode_skpd: '18.00.00.0000.0000', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo?.kodeLokasi).toBe('18.00.00.0000.0000'))
  })

  it('`kode_lokasi` yang TERISI tetap didahulukan', async () => {
    skpdRow = { nama: 'X', level: 1, kode_skpd: '18.00', kode_lokasi: 'LOK-1' }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo?.kodeLokasi).toBe('LOK-1'))
  })

  it('SKPD tak ketemu → kop memakai cadangan "SKPD #id", tak menjatuhkan apa pun', async () => {
    skpdRow = null
    const h = pasang(9)
    await waitFor(() => expect(h.result.current.namaSkpd).toBe('SKPD #9'))
  })

  it('se-kabupaten (skpdId null) tak menembak query & namanya kosong', () => {
    const h = pasang(null)
    expect(h.result.current.skpdInfo).toBeNull()
    expect(h.result.current.namaSkpd).toBe('')
  })
})

describe('konfigAwal — SATU sumber untuk pratinjau & cetak', () => {
  it('level 1 → "Pengguna Barang"', async () => {
    skpdRow = { nama: 'Dinas A', level: 1, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo).not.toBeNull())
    expect(h.result.current.konfigAwal().sebutan).toBe('Pengguna Barang')
  })

  it('level di bawah 1 → "Kuasa Pengguna Barang"', async () => {
    skpdRow = { nama: 'UPTD B', level: 2, kode_skpd: '01.01', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo?.level).toBe(2))
    expect(h.result.current.konfigAwal().sebutan).toBe('Kuasa Pengguna Barang')
  })

  it('level TAK TERBACA dianggap 1 — lembar tetap menyebut sebutan yang sah', async () => {
    skpdRow = { nama: 'X', level: null, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo).not.toBeNull())
    expect(h.result.current.konfigAwal().sebutan).toBe('Pengguna Barang')
  })

  it('lingkup "pemda" kalau SKPD tak dipilih, "skpd" kalau dipilih', async () => {
    expect(pasang(null).result.current.konfigAwal().lingkup).toBe('pemda')
    skpdRow = { nama: 'X', level: 1, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo).not.toBeNull())
    expect(h.result.current.konfigAwal().lingkup).toBe('skpd')
  })

  it('skpdInfo BELUM termuat → sebutan jatuh ke "Pengguna Barang", bukan kosong', () => {
    // `skpdInfo?.level ?? 1` baru berarti di sini: begitu skpdInfo terisi,
    // `level` sudah dinormalkan ke 1 oleh pemuatnya, jadi cabang `?? 1` yang
    // ini SATU-SATUNYA yang menjaga lembar se-kabupaten & lembar yang dirakit
    // sebelum nama SKPD datang tetap menyebut sebutan yang sah.
    expect(pasang(null).result.current.konfigAwal().sebutan).toBe('Pengguna Barang')
  })

  it('tanpa argumen → tanda tangan KOSONG (bertitik-titik di lembar)', () => {
    const k = pasang(null).result.current.konfigAwal()
    expect(k).toMatchObject({ tanggal: '', ttd: null, ttdKiri: null })
  })

  it('dengan argumen → membawa pilihan operator, identitasnya TETAP sama', async () => {
    // Inti "satu sumber": yang berbeda antara pratinjau & cetak HANYA blok
    // tanda tangan; sebutan/nama/kode wajib identik.
    skpdRow = { nama: 'Dinas A', level: 2, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7)
    await waitFor(() => expect(h.result.current.skpdInfo).not.toBeNull())
    const pratinjau = h.result.current.konfigAwal()
    const dicetak = h.result.current.konfigAwal({ tanggal: '2026-09-16', ttd: null, ttdKiri: null })
    expect(dicetak.sebutan).toBe(pratinjau.sebutan)
    expect(dicetak.namaSkpd).toBe(pratinjau.namaSkpd)
    expect(dicetak.kodeLokasi).toBe(pratinjau.kodeLokasi)
    expect(dicetak.tanggal).toBe('2026-09-16')
  })
})

describe('auto-init konfig', () => {
  it('belum siap → konfig tetap null (lembar tak berdiri tanpa isi)', () => {
    expect(pasang(null, false).result.current.konfig).toBeNull()
  })

  it('siap → konfig terisi otomatis TANPA tanda tangan', async () => {
    const h = pasang(null, true)
    await waitFor(() => expect(h.result.current.konfig).not.toBeNull())
    expect(h.result.current.konfig).toMatchObject({ ttd: null, tanggal: '' })
  })

  it('pilihan operator TIDAK ditimpa auto-init', async () => {
    const h = pasang(null, true)
    await waitFor(() => expect(h.result.current.konfig).not.toBeNull())
    act(() => h.result.current.setKonfig(h.result.current.konfigAwal({ tanggal: '2026-09-16', ttd: null, ttdKiri: null })))
    await waitFor(() => expect(h.result.current.konfig?.tanggal).toBe('2026-09-16'))
  })

  it('ganti SKPD → kop ikut SKPD BARU, bukan yang sebelumnya', () => {
    // Regresi yang diperbaiki 2026-09-16. Guard lamanya merakit konfig dari
    // `skpdInfo` yang masih milik SKPD lama, lalu tak pernah menyegarkannya —
    // jadi lembar bertanda tangan untuk Dinas B berkop Dinas A.
    return (async () => {
      skpdRow = { nama: 'Dinas A', level: 1, kode_skpd: '01', kode_lokasi: null }
      const h = pasang(7, true)
      await waitFor(() => expect(h.result.current.konfig?.namaSkpd).toBe('Dinas A'))
      skpdRow = { nama: 'Dinas B', level: 2, kode_skpd: '02', kode_lokasi: null }
      h.rerender({ id: 8, s: true })
      await waitFor(() => expect(h.result.current.konfig?.namaSkpd).toBe('Dinas B'))
      expect(h.result.current.konfig?.sebutan).toBe('Kuasa Pengguna Barang')
    })()
  })

  it('konfig MENUNGGU nama SKPD termuat — kop tak pernah "SKPD #7"', async () => {
    // Pasangan dari uji di atas: bahkan pada pemuatan PERTAMA, konfig tak
    // dirakit sampai identitasnya ada.
    skpdRow = { nama: 'Dinas Pendidikan', level: 1, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7, true)
    await waitFor(() => expect(h.result.current.konfig).not.toBeNull())
    expect(h.result.current.konfig?.namaSkpd).toBe('Dinas Pendidikan')
  })

  it('se-kabupaten TIDAK menunggu identitas — lembarnya tetap terbit', async () => {
    // `skpdId == null` tak punya identitas SKPD untuk dimuat; menunggunya
    // berarti lembar se-kabupaten tak pernah terbit sama sekali.
    const h = pasang(null, true)
    await waitFor(() => expect(h.result.current.konfig).not.toBeNull())
    expect(h.result.current.konfig?.lingkup).toBe('pemda')
  })
})

describe('cetak', () => {
  it('menyetel judul tab jadi nama berkas lalu MEMULIHKANNYA', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    vi.useFakeTimers()
    skpdRow = { nama: 'Dinas A', level: 1, kode_skpd: '01', kode_lokasi: null }
    const h = pasang(7)
    await act(async () => { await Promise.resolve() })
    act(() => h.result.current.cetak())
    expect(document.title).toContain('Rekapitulasi Mutasi BMD')
    act(() => { vi.advanceTimersByTime(100) })
    expect(print).toHaveBeenCalled()
    cleanup()   // membongkar efeknya = jalur pemulihan
    expect(document.title).toBe('Dashboard')
    vi.useRealTimers()
  })

  it('se-kabupaten memakai "Kab Kediri" di nama berkas', async () => {
    vi.stubGlobal('print', vi.fn())
    const h = pasang(null)
    act(() => h.result.current.cetak())
    expect(document.title).toContain('Kab Kediri')
  })

  it('tak mencetak apa pun sebelum tombolnya ditekan', () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    vi.useFakeTimers()
    pasang(null)
    act(() => { vi.advanceTimersByTime(500) })
    expect(print).not.toHaveBeenCalled()
    expect(document.title).toBe('Dashboard')
    vi.useRealTimers()
  })

  it('cetak KEDUA tetap memicu — pemicunya counter, bukan boolean', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    vi.useFakeTimers()
    const h = pasang(null)
    act(() => h.result.current.cetak())
    act(() => { vi.advanceTimersByTime(100) })
    act(() => h.result.current.cetak())
    act(() => { vi.advanceTimersByTime(100) })
    expect(print).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
