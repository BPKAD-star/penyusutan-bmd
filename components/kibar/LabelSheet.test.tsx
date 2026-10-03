// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (u: string) => `data:image/png;base64,${u.length}`) } }))

import LabelSheet, { bagiHalaman, LABEL_PER_HALAMAN, type LabelItem } from './LabelSheet'

const it_ = (n: number): LabelItem => ({
  nibar: `NIBAR${n}`, namaBarang: `Barang ${n}`, merekTipe: null, skpdNama: 'BKAD', tglPerolehan: '2026-01-02',
})
const banyak = (n: number) => Array.from({ length: n }, (_, i) => it_(i))

afterEach(() => cleanup())

describe('bagiHalaman', () => {
  it('16 label per halaman A4, sisanya halaman berikutnya', () => {
    expect(LABEL_PER_HALAMAN).toBe(16)
    expect(bagiHalaman(banyak(16)).map(h => h.length)).toEqual([16])
    expect(bagiHalaman(banyak(17)).map(h => h.length)).toEqual([16, 1])
    expect(bagiHalaman(banyak(40)).map(h => h.length)).toEqual([16, 16, 8])
    expect(bagiHalaman([])).toEqual([])
  })
})

describe('LabelSheet — pop-up A4', () => {
  it('dirender lewat portal ke body (tak terjebak stacking context halaman) & memuat semua label', async () => {
    const { container } = render(<div id="halaman"><LabelSheet items={banyak(17)} onClose={() => {}} /></div>)
    await waitFor(() => expect(document.getElementById('kibar-label-root')).not.toBeNull())
    const root = document.getElementById('kibar-label-root')!
    expect(root.parentElement).toBe(document.body)
    expect(container.querySelector('#kibar-label-root')).toBeNull()
    expect(root.querySelectorAll('.kibar-label-page')).toHaveLength(2)
    expect(root.querySelectorAll('.kibar-label-card')).toHaveLength(17)
  })

  it('latar pop-up INLINE style (tak bergantung kelas Tailwind yang bisa tak ter-generate)', async () => {
    render(<LabelSheet items={banyak(1)} onClose={() => {}} />)
    await waitFor(() => expect(document.getElementById('kibar-label-root')).not.toBeNull())
    expect(document.getElementById('kibar-label-root')!.style.background).toContain('rgba')
  })

  it('CSS cetak menyembunyikan sisa halaman dgn display:none (bukan visibility) & mengunci A4', async () => {
    render(<LabelSheet items={banyak(1)} onClose={() => {}} />)
    await waitFor(() => expect(document.getElementById('kibar-label-root')).not.toBeNull())
    const css = document.getElementById('kibar-label-root')!.querySelector('style')!.textContent!
    expect(css).toMatch(/body > \*:not\(#kibar-label-root\)\s*\{\s*display:\s*none/)
    expect(css).toContain('size: A4 portrait')
    expect(css).toContain('margin: 0')
  })

  it('Cetak memanggil window.print & menyetel nama berkas PDF, lalu memulihkannya', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    document.title = 'Judul Asli'
    render(<LabelSheet items={banyak(3)} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Cetak / Simpan PDF')).toBeTruthy())
    fireEvent.click(screen.getByText('Cetak / Simpan PDF'))
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.title).toBe('KIBAR_Label_3 barang')
    window.dispatchEvent(new Event('afterprint'))
    expect(document.title).toBe('Judul Asli')
  })

  it('Tutup & Escape memanggil onClose', async () => {
    const onClose = vi.fn()
    render(<LabelSheet items={banyak(1)} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Tutup')).toBeTruthy())
    fireEvent.click(screen.getByText('Tutup'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('QR terisi untuk tiap label', async () => {
    render(<LabelSheet items={banyak(2)} onClose={() => {}} />)
    await waitFor(() => expect(document.querySelectorAll('#kibar-label-root img')).toHaveLength(2))
  })
})
