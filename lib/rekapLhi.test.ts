import { describe, it, expect } from 'vitest'
import { bangunPohonLhi, hitungKosong, leafRekapLhi, ratakanPohonLhi, totalRekapLhi, type SkpdLhi } from './rekapLhi'
import type { InvBaris } from './inventarisasi'

const b = (jawaban: InvBaris['jawaban'], aset_id: string | null = 'a', kondisi?: string): InvBaris =>
  ({ id: Math.random().toString(), aset_id, jawaban, foto_paths: [], snapshot: { kondisi } as InvBaris['snapshot'] })

const skpd = new Map<number, SkpdLhi>([
  [1, { id: 1, nama: 'Dinas A', parent_id: null }],
  [2, { id: 2, nama: 'UPTD A1', parent_id: 1 }],
  [3, { id: 3, nama: 'Dinas B', parent_id: null }],
  [4, { id: 4, nama: 'Dinas Kosong', parent_id: null }],
])

describe('leafRekapLhi', () => {
  it('menghitung per format memakai klasifikasiLhi; barang tanpa temuan tak dihitung', () => {
    const leaf = leafRekapLhi([
      { skpdId: 1, baris: b({ keberadaan: 'hilang' }) },
      { skpdId: 1, baris: b({}) },                       // tanpa temuan
      { skpdId: 1, baris: b({ ganda: { id: 'x' } as never }) },
    ])
    const l = leaf.get(1)!
    expect(l.hitung['III.B.1']).toBe(1)
    expect(l.hitung['III.B.9']).toBe(1)
    expect(l.barang).toBe(2)
  })

  it('barang di beberapa format: kolom dijumlah per format, barang dihitung SEKALI', () => {
    const l = leafRekapLhi([
      { skpdId: 1, baris: b({ keberadaan: 'hilang', ganda: { id: 'x' } as never }) },
    ]).get(1)!
    expect(l.hitung['III.B.1']).toBe(1)
    expect(l.hitung['III.B.9']).toBe(1)
    expect(l.barang).toBe(1)
  })

  it('barang belum tercatat (tanpa aset_id) masuk III.B.11', () => {
    const l = leafRekapLhi([{ skpdId: 1, baris: b({}, null) }]).get(1)!
    expect(l.hitung['III.B.11']).toBe(1)
  })
})

describe('bangunPohonLhi', () => {
  const leaf = leafRekapLhi([
    { skpdId: 1, baris: b({ keberadaan: 'hilang' }) },
    { skpdId: 2, baris: b({ keberadaan: 'hilang' }) },
    { skpdId: 2, baris: b({ ganda: { id: 'x' } as never }) },
    { skpdId: 3, baris: b({ keberadaan: 'hilang' }) },
  ])
  const pohon = bangunPohonLhi(leaf, skpd, [1, 3, 4])

  it('induk kumulatif (dirinya + anak) dan punya anak', () => {
    const a = pohon.find(n => n.skpdId === 1)!
    expect(a.hitung['III.B.1']).toBe(2)
    expect(a.hitung['III.B.9']).toBe(1)
    expect(a.barang).toBe(3)
    expect(a.anak?.map(x => x.skpdNama)).toEqual(['UPTD A1'])
  })

  it('SKPD tanpa data sama sekali tidak disertakan', () => {
    expect(pohon.map(n => n.skpdNama)).toEqual(['Dinas A', 'Dinas B'])
  })

  it('induk tanpa data sendiri tetap muncul bila anaknya berdata', () => {
    const p = bangunPohonLhi(leafRekapLhi([{ skpdId: 2, baris: b({ keberadaan: 'hilang' }) }]), skpd, [1])
    expect(p[0].hitung['III.B.1']).toBe(1)
    expect(p[0].anak).toHaveLength(1)
  })

  it('TOTAL dari node teratas saja — anak tak dihitung dua kali', () => {
    const t = totalRekapLhi(pohon)
    expect(t.hitung['III.B.1']).toBe(3)
    expect(t.barang).toBe(4)
  })

  it('ratakan: induk dulu lalu anak berindentasi', () => {
    const rata = ratakanPohonLhi(pohon)
    expect(rata.map(r => r.namaBerindentasi)).toEqual(['Dinas A', '— UPTD A1', 'Dinas B'])
  })

  it('hitungKosong memuat 12 kode bernilai 0', () => {
    expect(Object.keys(hitungKosong())).toHaveLength(12)
  })
})
