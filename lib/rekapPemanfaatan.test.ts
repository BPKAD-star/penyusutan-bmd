// Penjaga Rekap per SKPD Laporan Pemanfaatan.
//
// Kelas kegagalan senyap yang dijaga:
//   · perjanjian Selesai/Berakhir ikut dijumlah → "barang yang sedang
//     dimanfaatkan" menggelembung
//   · barang yang sama di dua perjanjian dihitung dua kali
import { describe, it, expect } from 'vitest'
import { leafRekapPemanfaatan, type BarisRekapPemanfaatan } from './rekapPemanfaatan'

const r = (o: Partial<BarisRekapPemanfaatan> & { asetId: string }): BarisRekapPemanfaatan => ({
  skpdId: 1, skpd: 'Dinas A', kode: '1.3.3.01.01.01.001', nilaiPerolehan: 100, status: 'Aktif', ...o,
})
const nama = (_id: number, cadangan: string) => cadangan

describe('leafRekapPemanfaatan', () => {
  it('menjumlah nilai perolehan per SKPD × golongan (3 segmen kode)', () => {
    const m = leafRekapPemanfaatan([
      r({ asetId: 'a', nilaiPerolehan: 100 }),
      r({ asetId: 'b', nilaiPerolehan: 250 }),
      r({ asetId: 'c', kode: '1.5.4.01.01.02.003', nilaiPerolehan: 40 }),
    ], nama)
    expect(m.get(1)!.cells['1.3.3'].perolehan).toBe(350)
    expect(m.get(1)!.cells['1.5.4'].perolehan).toBe(40)
  })

  it('HANYA status Aktif — Selesai & Berakhir tak dihitung', () => {
    const m = leafRekapPemanfaatan([
      r({ asetId: 'a', status: 'Aktif', nilaiPerolehan: 100 }),
      r({ asetId: 'b', status: 'Selesai', nilaiPerolehan: 999 }),
      r({ asetId: 'c', status: 'Berakhir', nilaiPerolehan: 999 }),
    ], nama)
    expect(m.get(1)!.cells['1.3.3'].perolehan).toBe(100)
  })

  it('SKPD yang seluruh perjanjiannya tak Aktif tak punya baris sama sekali', () => {
    const m = leafRekapPemanfaatan([r({ asetId: 'a', status: 'Selesai' })], nama)
    expect(m.size).toBe(0)
  })

  it('barang yang sama di dua perjanjian Aktif dihitung SEKALI per SKPD', () => {
    const m = leafRekapPemanfaatan([
      r({ asetId: 'sama', nilaiPerolehan: 500 }),
      r({ asetId: 'sama', nilaiPerolehan: 500 }),
    ], nama)
    expect(m.get(1)!.cells['1.3.3'].perolehan).toBe(500)
  })

  it('dipisah per SKPD pencatat', () => {
    const m = leafRekapPemanfaatan([
      r({ asetId: 'a', skpdId: 1, nilaiPerolehan: 10 }),
      r({ asetId: 'b', skpdId: 2, skpd: 'Dinas B', nilaiPerolehan: 20 }),
    ], nama)
    expect(m.get(1)!.cells['1.3.3'].perolehan).toBe(10)
    expect(m.get(2)!.cells['1.3.3'].perolehan).toBe(20)
    expect(m.get(2)!.nama).toBe('Dinas B')
  })

  it('nama SKPD diambil dari pohon bila ada, cadangan dari baris', () => {
    const m = leafRekapPemanfaatan([r({ asetId: 'a' })], id => `pohon-${id}`)
    expect(m.get(1)!.nama).toBe('pohon-1')
  })
})
