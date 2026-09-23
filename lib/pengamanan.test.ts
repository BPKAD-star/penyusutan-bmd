import { describe, it, expect } from 'vitest'
import { namaPemakaiPengamanan, pengamananCache } from './pengamanan'

describe('namaPemakaiPengamanan — buang ekor identitas dari cache', () => {
  it('cache ber-NIP → nama saja', () => {
    expect(namaPemakaiPengamanan(pengamananCache('Budi Santoso', '198001012010011001'))).toBe('Budi Santoso')
  })

  it('cache tanpa identitas (tak ada tanda kurung) → apa adanya', () => {
    expect(namaPemakaiPengamanan(pengamananCache('Budi Santoso', ''))).toBe('Budi Santoso')
  })

  it('null/undefined/kosong → null, bukan string kosong', () => {
    expect(namaPemakaiPengamanan(null)).toBeNull()
    expect(namaPemakaiPengamanan(undefined)).toBeNull()
    expect(namaPemakaiPengamanan('')).toBeNull()
  })

  it('nama ber-gelar dalam kurung di TENGAH tetap utuh — cuma ekor yang dibuang', () => {
    expect(namaPemakaiPengamanan('Budi (Alm.) Santoso (NIP 123)')).toBe('Budi (Alm.) Santoso')
  })
})
