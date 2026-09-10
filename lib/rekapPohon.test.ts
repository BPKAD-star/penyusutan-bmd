// Uji `bangunPohonRekap`/`ratakanPohon` — mesin drill-down Rekap per SKPD
// (keputusan user 2026-09-10: admin lihat semua induk, pengurus barang lihat
// SKPD-nya sendiri sbg akar, keduanya bisa expand anak-anaknya).
//
// Kenapa diuji: kegagalannya TAK BERSUARA. Kalau `cells` induk ikut dijumlah
// ULANG dari anak yang sudah kepakai di baris TOTAL, angkanya dobel tanpa
// satu pun error — persis kelas bug yang berkali-kali terjadi di repo ini
// (Kapitalisasi, LRA, dst).
import { describe, it, expect } from 'vitest'
import { bangunPohonRekap, ratakanPohon, type LeafRekap, type SkpdRingkas } from './rekapPohon'
import type { MatrixCell } from '@/components/RekapMatrixTable'

const sel = (perolehan: number): Record<string, MatrixCell> => ({
  '1.3.2': { perolehan, akumulasi: 0, beban: 0, nilaiBuku: perolehan },
})

// Pohon uji: 1 (Dinas Induk) → 2 (Bidang A) → 3 (Sub-Unit X), dan 1 → 4 (Bidang
// B, tanpa anak, tanpa data langsung — cabang kosong yg wajib dibuang).
const byId = new Map<number, SkpdRingkas>([
  [1, { id: 1, nama: 'Dinas Induk', parent_id: null }],
  [2, { id: 2, nama: 'Bidang A', parent_id: 1 }],
  [3, { id: 3, nama: 'Sub-Unit X', parent_id: 2 }],
  [4, { id: 4, nama: 'Bidang B', parent_id: 1 }],
])

describe('bangunPohonRekap', () => {
  it('menjumlah KUMULATIF: induk = dirinya sendiri + seluruh turunannya', () => {
    const leaf = new Map<number, LeafRekap>([
      [1, { nama: 'Dinas Induk', cells: sel(100) }],
      [3, { nama: 'Sub-Unit X', cells: sel(50) }],
    ])
    const pohon = bangunPohonRekap(leaf, byId, [1])
    expect(pohon).toHaveLength(1)
    const induk = pohon[0]
    expect(induk.skpdId).toBe(1)
    expect(induk.cells['1.3.2'].perolehan).toBe(150) // 100 (sendiri) + 50 (Sub-Unit X)
  })

  it('anak disusun BERJENJANG (Bidang A → Sub-Unit X), bukan diratakan', () => {
    const leaf = new Map<number, LeafRekap>([[3, { nama: 'Sub-Unit X', cells: sel(50) }]])
    const [induk] = bangunPohonRekap(leaf, byId, [1])
    expect(induk.anak).toHaveLength(1)
    const bidangA = induk.anak![0]
    expect(bidangA.skpdId).toBe(2)
    expect(bidangA.cells['1.3.2'].perolehan).toBe(50)
    expect(bidangA.anak).toHaveLength(1)
    expect(bidangA.anak![0].skpdId).toBe(3)
    expect(bidangA.anak![0].anak).toBeUndefined() // leaf sungguhan, tak punya anak
  })

  it('cabang TANPA data sama sekali (Bidang B) tidak disertakan', () => {
    const leaf = new Map<number, LeafRekap>([[3, { nama: 'Sub-Unit X', cells: sel(50) }]])
    const [induk] = bangunPohonRekap(leaf, byId, [1])
    const namaAnak = induk.anak!.map(a => a.skpdNama)
    expect(namaAnak).not.toContain('Bidang B')
  })

  it('akar BUKAN root level-1 — dipakai pengurus barang/pembantu lihat SKPD-nya sendiri', () => {
    const leaf = new Map<number, LeafRekap>([[3, { nama: 'Sub-Unit X', cells: sel(50) }]])
    // akarIds = [2] (Bidang A), BUKAN [1] — pengurus di level 2 tak boleh
    // melihat Dinas Induk sbg baris teratasnya sendiri.
    const pohon = bangunPohonRekap(leaf, byId, [2])
    expect(pohon).toHaveLength(1)
    expect(pohon[0].skpdId).toBe(2)
    expect(pohon[0].cells['1.3.2'].perolehan).toBe(50)
  })

  it('akar tanpa data & tanpa anak berdata → array kosong (bukan baris nol)', () => {
    const leaf = new Map<number, LeafRekap>([[3, { nama: 'Sub-Unit X', cells: sel(50) }]])
    const pohon = bangunPohonRekap(leaf, byId, [4]) // Bidang B: tak berdata
    expect(pohon).toHaveLength(0)
  })

  it('beberapa akar (admin, banyak Dinas) dijumlah independen & diurut nama', () => {
    const byId2 = new Map<number, SkpdRingkas>([
      ...byId,
      [5, { id: 5, nama: 'Aset Lain', parent_id: null }],
    ])
    const leaf = new Map<number, LeafRekap>([
      [3, { nama: 'Sub-Unit X', cells: sel(50) }],
      [5, { nama: 'Aset Lain', cells: sel(10) }],
    ])
    const pohon = bangunPohonRekap(leaf, byId2, [1, 5])
    expect(pohon.map(p => p.skpdNama)).toEqual(['Aset Lain', 'Dinas Induk']) // alfabetis
    expect(pohon.find(p => p.skpdId === 5)!.cells['1.3.2'].perolehan).toBe(10)
  })
})

describe('ratakanPohon', () => {
  it('urutan DFS pre-order: induk dulu baru anak, indentasi ikut kedalaman', () => {
    const leaf = new Map<number, LeafRekap>([[3, { nama: 'Sub-Unit X', cells: sel(50) }]])
    const pohon = bangunPohonRekap(leaf, byId, [1])
    const datar = ratakanPohon(pohon)
    expect(datar.map(d => d.namaBerindentasi)).toEqual([
      'Dinas Induk',
      '— Bidang A',
      '— — Sub-Unit X',
    ])
    expect(datar.map(d => d.depth)).toEqual([0, 1, 2])
  })
})
