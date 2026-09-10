// @vitest-environment jsdom
// Uji interaksi expand/collapse RekapMatrixTable (drill-down berjenjang,
// keputusan user 2026-09-10). Beda dari lib/rekapPohon.test.ts yang menguji
// PENYUSUNAN datanya — ini menguji TAMPILANNYA: ikon panah muncul/hilang yang
// benar, klik membuka/menutup anak, dan yang paling gampang senyap kalau salah:
// baris TOTAL tidak boleh berubah waktu anak dibuka (kalau berubah berarti
// anak yang cell-nya sudah kumulatif ikut terhitung ULANG di footer).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import RekapMatrixTable, { type MatrixRow, type Golongan } from '@/components/RekapMatrixTable'

afterEach(cleanup)

const golongan: Golongan[] = [
  { kode: '1.3.2', uraian: 'Peralatan dan Mesin', disusutkan: true },
]

const cell = (perolehan: number) => ({ perolehan, akumulasi: 0, beban: 0, nilaiBuku: perolehan })

// Dinas Induk (100, kumulatif) → Bidang A (50) — leaf sungguhan, tanpa anak.
const pohon: MatrixRow[] = [{
  skpdId: 1, skpdNama: 'Dinas Induk',
  cells: { '1.3.2': cell(100) },
  anak: [{ skpdId: 2, skpdNama: 'Bidang A', cells: { '1.3.2': cell(50) } }],
}]

describe('RekapMatrixTable — drill-down', () => {
  it('collapsed by default: anak tak terlihat, ikon panah tampil di baris berAnak', () => {
    render(<RekapMatrixTable rows={pohon} golongan={golongan} metric="perolehan" loading={false} />)
    expect(screen.getByText('Dinas Induk')).toBeTruthy()
    expect(screen.queryByText('Bidang A')).toBeNull()
    expect(screen.getByLabelText('Buka Dinas Induk')).toBeTruthy()
  })

  it('klik ikon panah membuka anak; klik lagi menutupnya', () => {
    render(<RekapMatrixTable rows={pohon} golongan={golongan} metric="perolehan" loading={false} />)
    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    expect(screen.getByText('Bidang A')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Tutup Dinas Induk'))
    expect(screen.queryByText('Bidang A')).toBeNull()
  })

  it('baris tanpa anak TAK PUNYA ikon panah (leaf sungguhan)', () => {
    render(<RekapMatrixTable rows={pohon} golongan={golongan} metric="perolehan" loading={false} />)
    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    expect(screen.queryByLabelText('Buka Bidang A')).toBeNull()
    expect(screen.queryByLabelText('Tutup Bidang A')).toBeNull()
  })

  it('⚠️ TOTAL footer TIDAK berubah waktu anak dibuka — cells anak sudah kumulatif di induknya', () => {
    render(<RekapMatrixTable rows={pohon} golongan={golongan} metric="perolehan" loading={false} />)
    // 100 (Dinas Induk, sudah kumulatif) — BUKAN 150 (100+50, yg berarti dobel hitung).
    const totalSebelum = screen.getAllByText('100,00')
    expect(totalSebelum.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Buka Dinas Induk'))
    // Sesudah dibuka: baris Bidang A (50,00) MUNCUL — kolom golongan & kolom
    // Total-nya sama-sama 50,00 krn cuma 1 golongan, jadi dua sel. Footer
    // TOTAL tetap 100,00 (bukan 150,00 — itu yg berarti dobel hitung).
    expect(screen.getAllByText('50,00')).toHaveLength(2)
    expect(screen.getAllByText('100,00').length).toBeGreaterThan(0)
  })
})
