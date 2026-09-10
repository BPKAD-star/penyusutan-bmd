// @vitest-environment jsdom
// Uji interaksi expand/collapse LraRekapTable (drill-down berjenjang LRA,
// keputusan user 2026-09-10) — pola sama dgn tests/rekapMatrixTable.test.tsx.
// Yang paling gampang senyap kalau salah: baris TOTAL tidak boleh berubah
// waktu anak dibuka (kalau berubah berarti anak yang cell-nya sudah kumulatif
// ikut terhitung ULANG di footer).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import LraRekapTable from '@/components/pelaporan/LraRekapTable'
import type { LraNode } from '@/lib/lraPohon'

afterEach(cleanup)

const cell = (totalLra: number, belanjaModal: number) =>
  ({ totalLra, kapitalisasi: 0, reklas: 0, belanjaModal })

// Dinas Induk (100/90, kumulatif) → Bidang A (50/45) — leaf sungguhan, tanpa anak.
const pohon: LraNode[] = [{
  skpdId: 1, skpdNama: 'Dinas Induk',
  cell: cell(100, 90),
  anak: [{ skpdId: 2, skpdNama: 'Bidang A', cell: cell(50, 45) }],
}]

describe('LraRekapTable — drill-down', () => {
  it('collapsed by default: anak tak terlihat, ikon panah tampil di baris berAnak', () => {
    render(<LraRekapTable rows={pohon} loading={false} />)
    expect(screen.getByText('Dinas Induk')).toBeTruthy()
    expect(screen.queryByText('Bidang A')).toBeNull()
    expect(screen.getByLabelText('Buka Dinas Induk')).toBeTruthy()
  })

  it('klik ikon panah membuka anak; klik lagi menutupnya', () => {
    render(<LraRekapTable rows={pohon} loading={false} />)
    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    expect(screen.getByText('Bidang A')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Tutup Dinas Induk'))
    expect(screen.queryByText('Bidang A')).toBeNull()
  })

  it('baris tanpa anak TAK PUNYA ikon panah (leaf sungguhan)', () => {
    render(<LraRekapTable rows={pohon} loading={false} />)
    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    expect(screen.queryByLabelText('Buka Bidang A')).toBeNull()
    expect(screen.queryByLabelText('Tutup Bidang A')).toBeNull()
  })

  it('⚠️ TOTAL footer TIDAK berubah waktu anak dibuka — cell anak sudah kumulatif di induknya', () => {
    render(<LraRekapTable rows={pohon} loading={false} />)
    // 100 (Dinas Induk, sudah kumulatif) — BUKAN 150 (100+50, dobel hitung).
    expect(screen.getAllByText('100,00').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    // Sesudah dibuka: baris Bidang A (50,00) MUNCUL, tapi footer TOTAL tetap
    // 100,00 utk Total LRA (bukan 150,00) — begitu pula 90,00 utk Belanja Modal.
    expect(screen.getAllByText('50,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('100,00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('90,00').length).toBeGreaterThan(0)
  })
})
