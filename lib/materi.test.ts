// Penjaga daftar materi paparan. Kelas kesalahan yang dikunci: kotak materi di
// Dokumen Sumber yang diklik lalu KOSONG/404 (entri ada, isinya tidak), dan
// angka "N slide" di kotaknya yang tak cocok dgn isi sebenarnya.
import { describe, it, expect } from 'vitest'
import { DAFTAR_MATERI, cariMateri } from './materi'
import { ISI_MATERI } from '@/components/materi/isiMateri'

describe('DAFTAR_MATERI ↔ ISI_MATERI', () => {
  it('slug unik & aman dipakai di URL', () => {
    const slugs = DAFTAR_MATERI.map(m => m.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s, s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('tiap materi punya isinya, dan jumlah slide-nya sama persis', () => {
    for (const m of DAFTAR_MATERI) {
      expect(ISI_MATERI[m.slug], m.slug).toBeDefined()
      expect(ISI_MATERI[m.slug].length, m.slug).toBe(m.jumlahSlide)
    }
  })

  it('tak ada isi yatim — slide tanpa entri di daftar takkan pernah bisa dibuka', () => {
    for (const slug of Object.keys(ISI_MATERI)) expect(cariMateri(slug), slug).toBeDefined()
  })

  it('tanggal materi berbentuk YYYY-MM-DD', () => {
    for (const m of DAFTAR_MATERI) expect(m.tanggal, m.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
