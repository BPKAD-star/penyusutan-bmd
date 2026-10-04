import { describe, it, expect } from 'vitest'
import { gabungPerAset } from './laporanKdpTrx'

const aset = (skpd_id = 7) => ({
  skpd_id, kode: '1.3.6.01.01.01.003', uraian_barang: 'KDP Gedung', nama_barang: 'RKB', nibar: 'N1',
  merek_tipe: null, spesifikasi_lainnya: null, intra_ekstra: 'intra', status: 'aktif', luas: null, keterangan: null,
})
const termin = (id: number, tanggal: string, nilai: number, aset_id = 'A1') => ({
  id, periode: tanggal.slice(0, 4) + (Number(tanggal.slice(5, 7)) <= 6 ? '-S1' : '-S2'), tanggal, nilai,
  keterangan: null, payload: { kode_rekening: '5.2.03', no_bast: `B${id}` }, skpd_tujuan: 7, aset_id,
  header: { no_sk: 'K1', tanggal: '2026-01-01', nama_penyedia: 'CV X', sub_kegiatan: '1.02 — Y', no_bast: null },
  aset: aset(),
})

describe('gabungPerAset', () => {
  it('satu baris per barang KDP dgn nilai = Σ termin (bukan satu per termin)', () => {
    const r = gabungPerAset([termin(1, '2026-01-13', 100), termin(2, '2026-07-17', 250), termin(3, '2026-02-11', 50)])
    expect(r).toHaveLength(1)
    expect(r[0].nilai).toBe(400)
    expect(r[0].tanggal).toBe('2026-07-17')          // termin terakhir
    expect(r[0].header?.no_bast).toBe('B2')
    expect(r[0].keterangan).toContain('3 termin')
  })
  it('barang KDP berbeda tetap terpisah', () => {
    const r = gabungPerAset([termin(1, '2026-01-13', 100, 'A1'), termin(2, '2026-01-14', 70, 'A2')])
    expect(r.map(x => x.nilai).sort((a, b) => a - b)).toEqual([70, 100])
  })
})
