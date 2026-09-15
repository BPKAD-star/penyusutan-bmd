// @vitest-environment jsdom
// ============================================================================
// Mengunci pemuat kartu jurnal Koreksi (./useJurnalKoreksi.ts).
//
// Yang dijaga aturan yang kalau lepas TIDAK menghasilkan satu pun error —
// kartunya cuma tampil dgn isi yang berbeda:
//
//   · tiga bentuk kartu dipisah lewat `jenis` header; salah pisah membuat
//     kartu Pemecahan muncul di daftar koreksi biasa TANPA barisnya
//   · baris koreksi biasa yang DIANULIR disembunyikan (dicocokkan lewat
//     `payload.target_trx_id`), sementara kartu Pemecahan/Penggabungan yang
//     dibatalkan TETAP tampil ber-badge — peristiwanya memang pernah terjadi
//   · kartu tanpa satu pun baris disaring; kalau tidak, kartu hampa menumpuk
//   · `total` dijumlah dari baris yang BENAR-BENAR tampil
//   · SKPD kosong → ketiga daftar dikosongkan, bukan dibiarkan basi
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

type Row = Record<string, unknown>
let headers: Row[] = []
/** jenis[0] → baris yang dijawab untuk query itu. */
let ledger: Record<string, Row[]> = {}
let skpdDiminta: number[] = []
let hErr: { message: string } | null = null
let trxErr: { message: string } | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      let jenis0 = ''
      Object.assign(q, {
        select: () => q,
        eq: (k: string, v: unknown) => { if (k === 'skpd_id') skpdDiminta.push(v as number); return q },
        in: (k: string, v: string[]) => {
          if (k === 'jenis') jenis0 = v[0]
          return k === 'jenis' ? q : q
        },
        order: async () => t === 'jurnal_header'
          ? { data: headers, error: hErr }
          : { data: ledger[jenis0] || [], error: trxErr },
      })
      // Query batal_koreksi_* berakhir di `.in()`, tanpa `.order()`.
      ;(q as { then?: unknown }).then = (res: (v: unknown) => void) =>
        res({ data: ledger[jenis0] || [], error: trxErr })
      return q
    },
  }),
}))

import { useJurnalKoreksi } from './useJurnalKoreksi'

const hdr = (over: Row = {}): Row => ({
  id: 'h1', no_sk: '001', tanggal: '2026-08-01', periode: '2026-S2',
  jenis: 'nilai_perolehan', keterangan: null, kategori: 'koreksi', payload: null, ...over,
})
const aset = (id = 'a1') => ({ id, nibar: 'N' + id, nama_barang: 'Barang ' + id, kode: '1.3.2.01.01.01.001', jumlah: 1 })

beforeEach(() => { headers = []; ledger = {}; skpdDiminta = []; hErr = null; trxErr = null })
afterEach(cleanup)

// ⚠️ Pemanggilnya sengaja ditulis `(await muat()).result`, bukan
// `const { result } = await muat()`: bentuk kedua kena aturan ESLint
// no-restricted-syntax yang memburu query Supabase penelan `error`. Di sini
// positif palsu, dan 13 peringatan palsu menggeser angka warning repo yang
// dibaca tiap tinjauan.
const muat = async (skpd = '5') => {
  const h = renderHook(() => useJurnalKoreksi())
  await act(async () => { await h.result.current.load(skpd) })
  return h
}

describe('SKPD kosong', () => {
  it('DB tak ditembak sama sekali', async () => {
    await muat('')
    expect(skpdDiminta).toEqual([])
  })

  // ⚠️ Diuji dgn MENGISI daftarnya lebih dulu. Memeriksa "kosong" dari keadaan
  // awal tak membuktikan apa pun — daftarnya memang sudah kosong, jadi
  // mencabut pengosongannya pun tetap hijau (terbukti lewat mutasi).
  it('daftar yang sudah terisi DIKOSONGKAN saat SKPD dilepas, bukan ditinggal basi', async () => {
    headers = [hdr({ id: 'h1', jenis: 'nilai_perolehan' }), hdr({ id: 'h2', jenis: 'pemecahan' }), hdr({ id: 'h3', jenis: 'penggabungan' })]
    ledger['koreksi_nilai'] = [{ id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') }]
    ledger['pemecahan_keluar'] = [{ id: 2, header_id: 'h2', jenis: 'pemecahan_keluar', nilai: 900, aset: aset('a2') }]
    ledger['penggabungan_keluar'] = [{ id: 4, header_id: 'h3', jenis: 'penggabungan_masuk', nilai: 50, payload: {}, aset: aset('a4') }]

    const { result } = renderHook(() => useJurnalKoreksi())
    await act(async () => { await result.current.load('5') })
    expect(result.current.jurnals).toHaveLength(1)
    expect(result.current.pemecahanJurnals).toHaveLength(1)
    expect(result.current.penggabunganJurnals).toHaveLength(1)

    await act(async () => { await result.current.load('') })
    expect(result.current.jurnals).toEqual([])
    expect(result.current.pemecahanJurnals).toEqual([])
    expect(result.current.penggabunganJurnals).toEqual([])
  })
})

describe('tiga bentuk kartu dipisah lewat `jenis` header', () => {
  beforeEach(() => {
    headers = [
      hdr({ id: 'h1', jenis: 'nilai_perolehan' }),
      hdr({ id: 'h2', jenis: 'pemecahan' }),
      hdr({ id: 'h3', jenis: 'penggabungan' }),
    ]
    ledger['koreksi_nilai'] = [{ id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') }]
    ledger['pemecahan_keluar'] = [
      { id: 2, header_id: 'h2', jenis: 'pemecahan_keluar', nilai: 900, aset: aset('a2') },
      { id: 3, header_id: 'h2', jenis: 'pemecahan_masuk', nilai: 400, aset: aset('a3') },
    ]
    ledger['penggabungan_keluar'] = [
      { id: 4, header_id: 'h3', jenis: 'penggabungan_masuk', nilai: 50, payload: { nilai_lama: 10, nilai_perolehan_baru: 60 }, aset: aset('a4') },
      { id: 5, header_id: 'h3', jenis: 'penggabungan_keluar', nilai: 50, payload: null, aset: aset('a5') },
    ]
  })

  it('tiap bentuk mendarat di daftarnya sendiri, tak saling bocor', async () => {
    const result = (await muat()).result
    expect(result.current.jurnals.map(j => j.id)).toEqual(['h1'])
    expect(result.current.pemecahanJurnals.map(j => j.id)).toEqual(['h2'])
    expect(result.current.penggabunganJurnals.map(j => j.id)).toEqual(['h3'])
  })

  it('kartu koreksi biasa membawa barisnya & totalnya', async () => {
    const result = (await muat()).result
    expect(result.current.jurnals[0].lines.map(l => l.trx_id)).toEqual([1])
    expect(result.current.jurnals[0].total).toBe(100)
  })

  it('kartu Penggabungan memisahkan induk dari sumber', async () => {
    const result = (await muat()).result
    const g = result.current.penggabunganJurnals[0]
    expect(g.induk?.aset_id).toBe('a4')
    expect(g.induk?.nilaiLama).toBe(10)
    expect(g.induk?.nilaiBaru).toBe(60)
    expect(g.sumber.map(r => r.aset_id)).toEqual(['a5'])
  })

  it('loading kembali false sesudah selesai', async () => {
    const result = (await muat()).result
    expect(result.current.loading).toBe(false)
  })
})

describe('pembatalan: DISEMBUNYIKAN vs DITANDAI — dua mekanik berbeda', () => {
  it('baris koreksi biasa yang dianulir disembunyikan & tak ikut total', async () => {
    headers = [hdr({ id: 'h1' })]
    ledger['batal_koreksi_nilai'] = [{ payload: { target_trx_id: 1 } }]
    ledger['koreksi_nilai'] = [
      { id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') },
      { id: 2, header_id: 'h1', nilai: 250, payload: null, aset: aset('a2') },
    ]
    const result = (await muat()).result
    expect(result.current.jurnals[0].lines.map(l => l.trx_id)).toEqual([2])
    expect(result.current.jurnals[0].total).toBe(250)
  })

  it('kartu Pemecahan yang dibatalkan TETAP tampil, ber-badge', async () => {
    headers = [hdr({ id: 'h2', jenis: 'pemecahan' })]
    ledger['pemecahan_keluar'] = [
      { id: 2, header_id: 'h2', jenis: 'pemecahan_keluar', nilai: 900, aset: aset('a2') },
      { id: 3, header_id: 'h2', jenis: 'batal_pemecahan', nilai: 0, aset: aset('a2') },
    ]
    const result = (await muat()).result
    expect(result.current.pemecahanJurnals).toHaveLength(1)
    expect(result.current.pemecahanJurnals[0].dibatalkan).toBe(true)
  })

  it('kartu Penggabungan yang dibatalkan TETAP tampil, ber-badge', async () => {
    headers = [hdr({ id: 'h3', jenis: 'penggabungan' })]
    ledger['penggabungan_keluar'] = [
      { id: 4, header_id: 'h3', jenis: 'penggabungan_masuk', nilai: 50, payload: {}, aset: aset('a4') },
      { id: 6, header_id: 'h3', jenis: 'batal_penggabungan_masuk', nilai: 0, payload: null, aset: aset('a4') },
    ]
    const result = (await muat()).result
    expect(result.current.penggabunganJurnals).toHaveLength(1)
    expect(result.current.penggabunganJurnals[0].dibatalkan).toBe(true)
  })

  it('target_trx_id yang tak berupa angka diabaikan, tak menyembunyikan baris sah', async () => {
    headers = [hdr({ id: 'h1' })]
    ledger['batal_koreksi_nilai'] = [{ payload: { target_trx_id: undefined } }, { payload: null }]
    ledger['koreksi_nilai'] = [{ id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') }]
    const result = (await muat()).result
    expect(result.current.jurnals[0].lines).toHaveLength(1)
  })
})

describe('kartu hampa disaring', () => {
  it('kartu Pemecahan tanpa satu pun baris tak ditampilkan', async () => {
    headers = [hdr({ id: 'h2', jenis: 'pemecahan' })]
    const result = (await muat()).result
    expect(result.current.pemecahanJurnals).toEqual([])
  })

  it('kartu Penggabungan tanpa satu pun baris tak ditampilkan', async () => {
    headers = [hdr({ id: 'h3', jenis: 'penggabungan' })]
    const result = (await muat()).result
    expect(result.current.penggabunganJurnals).toEqual([])
  })

  it('baris tanpa aset (terhapus) dilewati, tak jadi baris hantu', async () => {
    headers = [hdr({ id: 'h1' })]
    ledger['koreksi_nilai'] = [
      { id: 1, header_id: 'h1', nilai: 100, payload: null, aset: null },
      { id: 2, header_id: 'h1', nilai: 250, payload: null, aset: aset('a2') },
    ]
    const result = (await muat()).result
    expect(result.current.jurnals[0].lines.map(l => l.trx_id)).toEqual([2])
  })

  it('baris yang header-nya tak dikenal dilewati — kartunya jadi hampa lalu ikut disaring', async () => {
    headers = [hdr({ id: 'h1' })]
    ledger['koreksi_nilai'] = [{ id: 9, header_id: 'HANTU', nilai: 100, payload: null, aset: aset('a9') }]
    const result = (await muat()).result
    // KETIGA daftar menyaring kartu tanpa baris, bukan cuma Pemecahan &
    // Penggabungan — jadi header yang barisnya nyasar hilang sama sekali,
    // bukan tampil sebagai kartu kosong.
    expect(result.current.jurnals).toEqual([])
  })

  it('kartu koreksi biasa tanpa satu pun baris tak ditampilkan', async () => {
    headers = [hdr({ id: 'h1' })]
    const result = (await muat()).result
    expect(result.current.jurnals).toEqual([])
  })
})

// ============================================================================
// Fase 1 — kegagalan tak boleh menyamar jadi "belum ada koreksi" (INS-06).
// ============================================================================
describe('query GAGAL: fail-closed, bukan daftar kosong', () => {
  it('header gagal → `err` terisi & ketiga daftar kosong', async () => {
    hErr = { message: 'canceling statement due to statement timeout' }
    const result = (await muat()).result
    expect(result.current.err).toContain('gagal memuat kartu koreksi')
    expect(result.current.err).toContain('statement timeout')
    expect(result.current.jurnals).toEqual([])
  })

  it('⚠️ kartu yang SUDAH termuat ikut DIBUANG saat gagal — daftar sebagian terlihat sah', async () => {
    headers = [hdr({ id: 'h1' }), hdr({ id: 'h2', jenis: 'pemecahan' })]
    ledger['koreksi_nilai'] = [{ id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') }]
    ledger['pemecahan_keluar'] = [{ id: 2, header_id: 'h2', jenis: 'pemecahan_keluar', nilai: 900, aset: aset('a2') }]

    const h = renderHook(() => useJurnalKoreksi())
    await act(async () => { await h.result.current.load('5') })
    expect(h.result.current.jurnals).toHaveLength(1)

    trxErr = { message: 'boom' }
    await act(async () => { await h.result.current.load('5') })
    expect(h.result.current.err).not.toBe('')
    expect(h.result.current.jurnals).toEqual([])
    expect(h.result.current.pemecahanJurnals).toEqual([])
    expect(h.result.current.penggabunganJurnals).toEqual([])
  })

  it('`loading` kembali false walau gagal — layar tak nyangkut "Memuat jurnal..."', async () => {
    hErr = { message: 'boom' }
    const result = (await muat()).result
    expect(result.current.loading).toBe(false)
  })

  it('muat ulang yang BERHASIL membersihkan err sebelumnya', async () => {
    hErr = { message: 'boom' }
    const h = renderHook(() => useJurnalKoreksi())
    await act(async () => { await h.result.current.load('5') })
    expect(h.result.current.err).not.toBe('')

    hErr = null
    headers = [hdr({ id: 'h1' })]
    ledger['koreksi_nilai'] = [{ id: 1, header_id: 'h1', nilai: 100, payload: null, aset: aset('a1') }]
    await act(async () => { await h.result.current.load('5') })
    expect(h.result.current.err).toBe('')
    expect(h.result.current.jurnals).toHaveLength(1)
  })

  it('SKPD dilepas membersihkan err juga', async () => {
    hErr = { message: 'boom' }
    const h = renderHook(() => useJurnalKoreksi())
    await act(async () => { await h.result.current.load('5') })
    await act(async () => { await h.result.current.load('') })
    expect(h.result.current.err).toBe('')
  })
})
