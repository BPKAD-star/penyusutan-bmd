import { describe, it, expect } from 'vitest'
import { cariPengganti, type AsetRingkas, type BarisKartu } from './kibarPengganti'

const a = (id: string, nibar: string, kode = '1.3.2.10.01.02.002', status = 'aktif'): AsetRingkas =>
  ({ id, nibar, kode, nama_barang: `Barang ${id}`, status, nilai_perolehan: 1000 })
const peta = (...x: AsetRingkas[]) => new Map(x.map(v => [v.id, v]))

describe('cariPengganti', () => {
  it('barang yang tidak dibatalkan lewat Buka Kunci → null', () => {
    const baris: BarisKartu[] = [{ id: 1, jenis: 'pengadaan', aset_id: 'A' }]
    expect(cariPengganti('A', baris, peta(a('A', 'N1')))).toBeNull()
  })

  it('dibuka kunci tapi belum disetujui ulang → belum_terbit', () => {
    const baris: BarisKartu[] = [
      { id: 1, jenis: 'pengadaan', aset_id: 'A' },
      { id: 5, jenis: 'batal_pengadaan', aset_id: 'A' },
    ]
    expect(cariPengganti('A', baris, peta(a('A', 'N1', undefined, 'dihapus')))).toEqual({ keadaan: 'belum_terbit' })
  })

  it('isi kartu sama → dipasangkan satu-satu menurut urutan NIBAR', () => {
    const baris: BarisKartu[] = [
      { id: 1, jenis: 'pengadaan', aset_id: 'A' }, { id: 2, jenis: 'pengadaan', aset_id: 'B' },
      { id: 5, jenis: 'batal_pengadaan', aset_id: 'A' }, { id: 6, jenis: 'batal_pengadaan', aset_id: 'B' },
      { id: 9, jenis: 'pengadaan', aset_id: 'C' }, { id: 10, jenis: 'pengadaan', aset_id: 'D' },
    ]
    const p = peta(a('A', 'N01', undefined, 'dihapus'), a('B', 'N02', undefined, 'dihapus'), a('C', 'N03'), a('D', 'N04'))
    const hB = cariPengganti('B', baris, p)
    expect(hB?.keadaan).toBe('pasti')
    if (hB?.keadaan === 'pasti') expect(hB.pengganti.id).toBe('D')
    const hA = cariPengganti('A', baris, p)
    if (hA?.keadaan === 'pasti') expect(hA.pengganti.id).toBe('C')
  })

  it('urutan baris batal ditulis tak berurutan NIBAR — pasangan tetap menurut NIBAR', () => {
    const baris: BarisKartu[] = [
      { id: 5, jenis: 'batal_pengadaan', aset_id: 'B' }, { id: 6, jenis: 'batal_pengadaan', aset_id: 'A' },
      { id: 9, jenis: 'pengadaan', aset_id: 'C' }, { id: 10, jenis: 'pengadaan', aset_id: 'D' },
    ]
    const p = peta(a('A', 'N01', undefined, 'dihapus'), a('B', 'N02', undefined, 'dihapus'), a('C', 'N03'), a('D', 'N04'))
    const h = cariPengganti('A', baris, p)
    expect(h?.keadaan === 'pasti' && h.pengganti.id).toBe('C')
  })

  it('jumlah berubah saat dibuka kunci → kandidat (tidak menebak)', () => {
    const baris: BarisKartu[] = [
      { id: 5, jenis: 'batal_pengadaan', aset_id: 'A' }, { id: 6, jenis: 'batal_pengadaan', aset_id: 'B' },
      { id: 9, jenis: 'pengadaan', aset_id: 'C' },
    ]
    const p = peta(a('A', 'N01', undefined, 'dihapus'), a('B', 'N02', undefined, 'dihapus'), a('C', 'N03'))
    const h = cariPengganti('A', baris, p)
    expect(h?.keadaan).toBe('kandidat')
    if (h?.keadaan === 'kandidat') expect(h.kandidat.map(x => x.id)).toEqual(['C'])
  })

  it('kode barang diganti saat dibuka kunci → kandidat = seluruh barang terbit ulang', () => {
    const baris: BarisKartu[] = [
      { id: 5, jenis: 'batal_pengadaan', aset_id: 'A' },
      { id: 9, jenis: 'pengadaan', aset_id: 'C' },
    ]
    const p = peta(a('A', 'N01', '1.3.2.05.01.05.094', 'dihapus'), a('C', 'N03'))
    const h = cariPengganti('A', baris, p)
    expect(h?.keadaan === 'kandidat' && h.kandidat.map(x => x.id)).toEqual(['C'])
  })

  it('dua kali buka kunci → pengganti dari siklus BERIKUTNYA saja, bukan siklus sesudahnya', () => {
    const baris: BarisKartu[] = [
      { id: 1, jenis: 'hibah_masuk', aset_id: 'A' },
      { id: 2, jenis: 'batal_hibah_masuk', aset_id: 'A' },
      { id: 3, jenis: 'hibah_masuk', aset_id: 'B' },
      { id: 4, jenis: 'batal_hibah_masuk', aset_id: 'B' },
      { id: 5, jenis: 'hibah_masuk', aset_id: 'C' },
    ]
    const p = peta(a('A', 'N01', undefined, 'dihapus'), a('B', 'N02', undefined, 'dihapus'), a('C', 'N03'))
    const hA = cariPengganti('A', baris, p)
    expect(hA?.keadaan === 'pasti' && hA.pengganti.id).toBe('B')
    const hB = cariPengganti('B', baris, p)
    expect(hB?.keadaan === 'pasti' && hB.pengganti.id).toBe('C')
  })

  it('KDP: banyak baris termin per barang dihitung SATU barang', () => {
    const baris: BarisKartu[] = [
      { id: 1, jenis: 'akumulasi_kdp', aset_id: 'A' }, { id: 2, jenis: 'akumulasi_kdp', aset_id: 'A' },
      { id: 5, jenis: 'batal_akumulasi_kdp', aset_id: 'A' }, { id: 6, jenis: 'batal_akumulasi_kdp', aset_id: 'A' },
      { id: 9, jenis: 'akumulasi_kdp', aset_id: 'C' }, { id: 10, jenis: 'akumulasi_kdp', aset_id: 'C' },
    ]
    const p = peta(a('A', 'N01', '1.3.6.01.01.01.001', 'draft'), a('C', 'N02', '1.3.6.01.01.01.001'))
    const h = cariPengganti('A', baris, p)
    expect(h?.keadaan === 'pasti' && h.pengganti.id).toBe('C')
  })
})
