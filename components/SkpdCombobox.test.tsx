// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('@/lib/skpdMaster', () => ({
  fetchSkpd: vi.fn(async () => [
    { id: 1, nama: 'Badan Keuangan', level: 1, parent_id: null },
    { id: 2, nama: 'Dinas Pendidikan', level: 1, parent_id: null },
    { id: 3, nama: 'Dinas Kesehatan', level: 1, parent_id: null },
    { id: 4, nama: 'UPTD Puskesmas', level: 2, parent_id: 3 },
  ]),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import SkpdCombobox from './SkpdCombobox'

// jsdom tidak mengimplementasikan scrollIntoView (dipakai komponen utk menggulir sorotan).
HTMLElement.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

describe('SkpdCombobox — prop hanyaId (dipakai IPA → Capaian SKPD)', () => {
  it('hanya menawarkan SKPD dalam daftar, bukan seluruh pohon', async () => {
    render(<SkpdCombobox value="2" hanyaId={[1, 2]} onChange={() => {}} />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Dinas Pendidikan'))
    fireEvent.focus(screen.getByRole('textbox'))
    expect(screen.getByText('Badan Keuangan')).toBeTruthy()
    expect(screen.getByText('Dinas Pendidikan')).toBeTruthy()
    expect(screen.queryByText('Dinas Kesehatan')).toBeNull()
    expect(screen.queryByText(/Puskesmas/)).toBeNull()
  })

  it('mengetik menyaring di dalam daftar itu, dan memilih memanggil onChange dengan id', async () => {
    const onChange = vi.fn()
    render(<SkpdCombobox value="2" hanyaId={[1, 2, 3]} onChange={onChange} />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Dinas Pendidikan'))
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'kes' } })
    expect(screen.queryByText('Badan Keuangan')).toBeNull()
    fireEvent.click(screen.getByText('Dinas Kesehatan'))
    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('tanpa hanyaId perilaku lama: seluruh pohon ditawarkan', async () => {
    render(<SkpdCombobox value="" onChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy())
    fireEvent.focus(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/Puskesmas/)).toBeTruthy())
    expect(screen.getByText('Dinas Kesehatan')).toBeTruthy()
  })
})
