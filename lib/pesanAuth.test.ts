import { describe, it, expect } from 'vitest'
import { pesanAuthID } from './pesanAuth'

describe('pesanAuthID', () => {
  it('weak_password: alasan dibaca satu per satu & menyebut aturannya', () => {
    const p = pesanAuthID({ code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] })
    expect(p).toMatch(/pernah bocor di internet/)
    expect(p).toMatch(/Minimal 8 karakter/)
    expect(p).not.toMatch(/known to be weak/)
  })

  it('weak_password dengan beberapa alasan', () => {
    const p = pesanAuthID({ code: 'weak_password', reasons: ['length', 'characters'] })
    expect(p).toMatch(/terlalu pendek/)
    expect(p).toMatch(/huruf besar/)
  })

  it('weak_password dikenali juga dari teks saja (API kita meneruskan message tanpa code)', () => {
    expect(pesanAuthID({ message: 'Password is known to be weak and easy to guess, please choose a different one.' }))
      .toMatch(/^Password ditolak/)
  })

  it('kasus umum lain', () => {
    expect(pesanAuthID({ code: 'same_password' })).toBe('Password baru harus berbeda dari password lama.')
    expect(pesanAuthID({ code: 'invalid_credentials' })).toBe('Password lama salah.')
    expect(pesanAuthID({ code: 'over_request_rate_limit' })).toMatch(/Terlalu banyak percobaan/)
    expect(pesanAuthID({ status: 429 })).toMatch(/Terlalu banyak percobaan/)
    expect(pesanAuthID({ code: 'user_already_exists' })).toMatch(/sudah dipakai/)
    expect(pesanAuthID({ message: 'Failed to fetch' })).toMatch(/terhubung ke server/)
  })

  it('tak dikenal: pesan aslinya TIDAK dibuang', () => {
    expect(pesanAuthID({ message: 'something odd' }, 'Gagal mengganti password.')).toBe('Gagal mengganti password. (something odd)')
    expect(pesanAuthID(null, 'Gagal.')).toBe('Gagal.')
  })
})
