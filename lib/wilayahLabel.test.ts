import { describe, it, expect } from 'vitest'
import { susunLabelWilayah, type WilayahRow } from './wilayahLabel'

const rows: WilayahRow[] = [
  { kode: '35', nama: 'Jawa Timur', level: 1, parent_kode: null },
  { kode: '35.06', nama: 'Kediri', level: 2, parent_kode: '35' },
  { kode: '35.06.01', nama: 'Mojo', level: 3, parent_kode: '35.06' },
  { kode: '35.06.01.2001', nama: 'Tamanan', level: 4, parent_kode: '35.06.01' },
]

describe('susunLabelWilayah', () => {
  it('urut dari Provinsi sampai Desa (BERLAWANAN dgn fn_wilayah_label)', () => {
    const l = susunLabelWilayah(rows)
    expect(l['35.06.01.2001']).toBe('Jawa Timur, Kediri, Kec. Mojo, Tamanan')
    expect(l['35.06']).toBe('Jawa Timur, Kediri')
  })
  it('induk hilang → berhenti di yang ada, tak melempar', () => {
    expect(susunLabelWilayah([rows[3]])['35.06.01.2001']).toBe('Tamanan')
  })
  it('lingkaran tak membekukan', () => {
    const loop: WilayahRow[] = [
      { kode: 'a', nama: 'A', level: 2, parent_kode: 'b' }, { kode: 'b', nama: 'B', level: 2, parent_kode: 'a' },
    ]
    expect(() => susunLabelWilayah(loop)).not.toThrow()
  })
})
