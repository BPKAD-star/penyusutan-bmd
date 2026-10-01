// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react'
import RekapLhiTable from '@/components/inventarisasi/RekapLhiTable'
import { hitungKosong, type NodeLhi } from '@/lib/rekapLhi'

afterEach(cleanup)

const h = (o: Record<string, number>) => ({ ...hitungKosong(), ...o })
const pohon: NodeLhi[] = [{
  skpdId: 1, skpdNama: 'Dinas A', hitung: h({ 'III.B.1': 3 }), barang: 3,
  anak: [{ skpdId: 2, skpdNama: 'UPTD A1', hitung: h({ 'III.B.1': 2 }), barang: 2 }],
}, { skpdId: 3, skpdNama: 'Dinas B', hitung: h({ 'III.B.1': 1 }), barang: 1 }]

describe('RekapLhiTable', () => {
  it('anak tersembunyi sampai panah diklik; SKPD tanpa anak tak berpanah', () => {
    render(<RekapLhiTable rows={pohon} loading={false} />)
    expect(screen.queryByText('UPTD A1')).toBeNull()
    expect(screen.getByLabelText('Buka Dinas A')).toBeTruthy()
    expect(screen.queryByLabelText('Buka Dinas B')).toBeNull()
    fireEvent.click(screen.getByLabelText('Buka Dinas A'))
    expect(screen.getByText('UPTD A1')).toBeTruthy()
  })

  it('TOTAL tidak berubah saat anak dibuka (tak dobel)', () => {
    render(<RekapLhiTable rows={pohon} loading={false} />)
    const total = () => within(screen.getByText('TOTAL').closest('tr') as HTMLElement).getAllByRole('cell').map(c => c.textContent)
    const sebelum = total()
    fireEvent.click(screen.getByLabelText('Buka Dinas A'))
    expect(total()).toEqual(sebelum)
    expect(sebelum[1]).toBe('4') // 3 + 1, bukan 3 + 2 + 1
  })

  it('kosong → pesan, bukan tabel kosong tanpa keterangan', () => {
    render(<RekapLhiTable rows={[]} loading={false} />)
    expect(screen.getByText(/Belum ada isian/)).toBeTruthy()
  })
})
