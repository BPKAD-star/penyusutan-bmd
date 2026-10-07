// Aturan murni kartu Pekerjaan Konstruksi model paket (2026-10-07).
// ⚠️ cekTanggalTermin/kekuranganTermin KEMBAR dgn pemeriksaan di
// fn_kdp_setujui_termin (migrasi 20261007_03) — RPC itu penegak terakhirnya.
import { describe, it, expect } from 'vitest'
import {
  cekTanggalTermin, kekuranganTermin, ringkasBarangKdp, statusKartuKdp, adaTerminMenunggu,
  pemakaianKontrak, cekUbahTglKontrak, normalisasiKartuKdp, kekuranganNamaKdp,
  type KontrakKdp, type KontrakKonstruksiPayload, type PembayaranKdp,
} from './kdp'

const kP: KontrakKdp = { id: 'kP', komponen: 'perencanaan', no_kontrak: 'P-01', tgl_kontrak: '2026-03-01' }
const kF: KontrakKdp = { id: 'kF', komponen: 'fisik', no_kontrak: 'F-01', tgl_kontrak: '2026-06-01' }
const KONTRAK = [kP, kF]
const termin = (o: Partial<PembayaranKdp>): PembayaranKdp =>
  ({ id: 'x', komponen: 'fisik', kontrak_id: 'kF', tgl_bast: '2026-07-20', nominal: 1, dokumen_paths: ['d'], ...o })

describe('cekTanggalTermin', () => {
  it('BAST tak boleh lebih tua dari tgl kontraknya SENDIRI', () => {
    expect(cekTanggalTermin(termin({ tgl_bast: '2026-05-20' }), KONTRAK, '2026')).toMatch(/lebih tua/)
    expect(cekTanggalTermin(termin({ tgl_bast: '2026-06-01' }), KONTRAK, '2026')).toBeNull()
  })

  it('perencanaan kini dinilai terhadap kontrak perencanaannya (pelonggaran lama dicabut)', () => {
    expect(cekTanggalTermin(termin({ komponen: 'perencanaan', kontrak_id: 'kP', tgl_bast: '2026-03-15' }), KONTRAK, '2026')).toBeNull()
    expect(cekTanggalTermin(termin({ komponen: 'perencanaan', kontrak_id: 'kP', tgl_bast: '2026-02-01' }), KONTRAK, '2026')).toMatch(/lebih tua/)
  })

  it('satu kartu = satu tahun: BAST di luar tahun kartu ditolak & menunjuk Kapitalisasi', () => {
    expect(cekTanggalTermin(termin({ tgl_bast: '2027-01-10' }), KONTRAK, '2026')).toMatch(/Kapitalisasi/)
  })

  it('kontrak wajib kecuali biaya umum', () => {
    expect(cekTanggalTermin(termin({ kontrak_id: null }), KONTRAK, '2026')).toMatch(/wajib menunjuk kontrak/)
    expect(cekTanggalTermin(termin({ komponen: 'biaya_umum', kontrak_id: null, tgl_bast: '2026-01-05' }), KONTRAK, '2026')).toBeNull()
  })

  it('kontrak harus berkomponen sama & masih ada di kartu', () => {
    expect(cekTanggalTermin(termin({ komponen: 'pengawasan', kontrak_id: 'kF' }), KONTRAK, '2026')).toMatch(/bukan Pengawasan/)
    expect(cekTanggalTermin(termin({ kontrak_id: 'hilang' }), KONTRAK, '2026')).toMatch(/sudah tidak ada/)
  })
})

describe('kekuranganTermin', () => {
  it('menyebut SEMUA kekurangan sekaligus', () => {
    const k = kekuranganTermin(termin({ nominal: 0, dokumen_paths: [], kontrak_id: null }), KONTRAK, '2026')
    expect(k).toHaveLength(3)
  })
})

const kartu = (pembayaran: PembayaranKdp[]): KontrakKonstruksiPayload => ({
  nama_pekerjaan: 'Gedung', kontrak: KONTRAK,
  barang: [{ key: 'b1', kode: '1.3.6.01.01.01.001', nama: 'KDP', pembayaran }],
})

describe('status diturunkan dari termin', () => {
  const p = kartu([
    termin({ id: 'P1', komponen: 'perencanaan', kontrak_id: 'kP', tgl_bast: '2026-03-15', nominal: 90, status: 'disetujui', trx_id: 1 }),
    termin({ id: 'F1', tgl_bast: '2026-07-20', nominal: 450, status: 'disetujui', trx_id: 4 }),
    termin({ id: 'W1', komponen: 'biaya_umum', kontrak_id: null, tgl_bast: '2026-02-01', nominal: 30 }),
  ])

  it('ringkasan barang: nilai disetujui/menunggu & tgl perolehan = BAST disetujui PALING AWAL', () => {
    expect(ringkasBarangKdp(p.barang![0])).toEqual({
      nilaiDisetujui: 540, nilaiMenunggu: 30, nDisetujui: 2, nMenunggu: 1, tglPerolehan: '2026-03-15',
    })
  })

  it('kartu disetujui begitu satu termin disetujui; pending kalau belum ada', () => {
    expect(statusKartuKdp(p)).toBe('disetujui')
    expect(statusKartuKdp(kartu([termin({})]))).toBe('pending')
    expect(adaTerminMenunggu(p)).toBe(true)
  })

  it('pemakaian kontrak & batas ubah tgl kontrak', () => {
    expect(pemakaianKontrak(p, 'kF')).toEqual({ menunggu: 0, disetujui: 1, bastTerawal: '2026-07-20' })
    expect(cekUbahTglKontrak(p, 'kF', '2026-08-01', '2026')).toMatch(/lebih baru dari BAST/)
    expect(cekUbahTglKontrak(p, 'kF', '2026-05-01', '2026')).toBeNull()
  })
})

describe('normalisasiKartuKdp — kartu sebelum model paket', () => {
  it('kontrak tingkat kartu jadi satu kontrak FISIK; termin fisik menunjuknya; tiap termin dapat id', () => {
    const lama: KontrakKonstruksiPayload = {
      nama_pekerjaan: 'RKB', sumber: 'spk', penyedia: 'CV Lama', ppk: 'Budi',
      barang: [{ key: 'b1', kode: '1.3.6.01.01.01.001', nama: 'KDP', pembayaran: [
        { komponen: 'fisik', tgl_bast: '2026-07-01', nominal: 10 },
        { komponen: 'perencanaan', tgl_bast: '2026-03-01', nominal: 5 },
      ] }],
    }
    const { payload, berubah } = normalisasiKartuKdp(lama, { no_sk: 'SPK-9', tanggal: '2026-06-01' })
    expect(berubah).toBe(true)
    expect(payload.kontrak).toHaveLength(1)
    expect(payload.kontrak![0]).toMatchObject({ komponen: 'fisik', no_kontrak: 'SPK-9', tgl_kontrak: '2026-06-01', penyedia: 'CV Lama' })
    const [f, pr] = payload.barang![0].pembayaran
    expect(f.kontrak_id).toBe(payload.kontrak![0].id)
    expect(pr.kontrak_id).toBeNull()
    expect(f.id && pr.id).toBeTruthy()
  })

  it('kartu model baru tidak diubah', () => {
    const p = kartu([termin({ id: 'a' })])
    expect(normalisasiKartuKdp(p, { no_sk: 'x', tanggal: '2026-01-01' }).berubah).toBe(false)
  })
})

describe('kekuranganNamaKdp', () => {
  it('nama wajib & tak boleh kembar (abaikan huruf besar & spasi)', () => {
    expect(kekuranganNamaKdp([{ nama: 'a', kode: 'k' }])).toMatch(/belum punya/)
    expect(kekuranganNamaKdp([
      { nama: 'a', kode: 'k', spec: { nama_barang: 'Gedung  A' } },
      { nama: 'b', kode: 'k', spec: { nama_barang: 'gedung a' } },
    ])).toMatch(/kembar/)
  })
})
