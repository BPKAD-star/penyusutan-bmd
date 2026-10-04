// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TotalPerolehan, hitungBarangJurnal } from './TotalPerolehan'

describe('hitungBarangJurnal', () => {
  it('disetujui dihitung dari baris ledger, draft dari draft_items; ditolak diabaikan', () => {
    const r = hitungBarangJurnal([
      { approval_status: 'disetujui', lines: [1, 2, 3], payload: { draft_items: [9] } },
      { approval_status: 'pending', lines: [], payload: { draft_items: [1, 2] } },
      { approval_status: 'ditolak', lines: [1], payload: { draft_items: [1, 2, 3] } },
    ])
    expect(r).toEqual({ disetujui: 3, draft: 2 })
  })
})

describe('TotalPerolehan', () => {
  it('menampilkan total barang beserta rinciannya; KDP hanya bila ada', () => {
    const { rerender } = render(<TotalPerolehan label="Total" nilai={1000} disetujui={150} draft={10} />)
    expect(screen.getByText('160 barang')).toBeTruthy()
    expect(screen.getByText('150 disetujui')).toBeTruthy()
    expect(screen.queryByText(/KDP/)).toBeNull()
    rerender(<TotalPerolehan label="Total" nilai={1000} disetujui={150} draft={10} kdp={2} />)
    expect(screen.getByText('162 barang')).toBeTruthy()
    expect(screen.getByText('2 KDP')).toBeTruthy()
  })
})
