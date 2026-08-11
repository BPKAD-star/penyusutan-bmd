// Mengunci aturan baca riwayat reklas — lihat lib/reklasKode.ts.
//
// Kenapa perlu dikunci: aturan ini KEMBAR TIGA (modul ini, CTE `kode_at` di
// `fn_rekap_bmd`, dan predikat index parsial). Yang bisa diuji tanpa DB cuma
// yang pertama, jadi ia yang dijadikan definisi — dua lainnya dicocokkan ke
// sini oleh lib/sinkronisasi.test.ts.
import { describe, it, expect } from 'vitest'
import { kodePada, kodeAt, type ReklasEvents, type ReklasEv } from './reklasKode'

const PM = '1.3.2.01.01.01.001'
const ATL = '1.3.5.01.01.01.001'
const GB = '1.3.3.01.01.01.001'

const ev = (id: number, periode: string, kodeLama: string | null, kodeBaru: string): ReklasEv =>
  ({ id, periode, kodeLama, kodeBaru })

const evs = (...list: [string, ReklasEv[]][]): ReklasEvents => new Map(list)

describe('kodePada — kode satu barang pada titik waktu', () => {
  const riwayat = evs(['A', [ev(100, '2026-S2', PM, ATL)]])

  it('barang yang tak pernah direklas memakai kode terkini', () => {
    expect(kodePada(evs(), 'A', '2026-S1', null, PM)).toBe(PM)
    expect(kodePada(riwayat, 'B', '2026-S1', null, GB)).toBe(GB)
  })

  it('SEBELUM reklas → kode LAMA, bukan kode terkini', () => {
    // Inti seluruh perbaikan: `aset.kode` sudah ATL, tapi pada 2026-S1
    // barangnya masih PM.
    expect(kodePada(riwayat, 'A', '2026-S1', null, ATL)).toBe(PM)
  })

  it('PADA & SESUDAH periode reklas → kode BARU', () => {
    expect(kodePada(riwayat, 'A', '2026-S2', null, ATL)).toBe(ATL)
    expect(kodePada(riwayat, 'A', '2027-S1', null, ATL)).toBe(ATL)
  })

  it('perbandingan periode pakai comparePeriode, bukan leksikal mentah', () => {
    // '2026-S2' vs '2100-S1': leksikal kebetulan benar. Yang menangkap
    // kekeliruan tipe ini adalah tahun berbeda panjang / urutan semester.
    const r = evs(['A', [ev(100, '2025-S2', PM, ATL)]])
    expect(kodePada(r, 'A', '2026-S1', null, ATL)).toBe(ATL)
    expect(kodePada(r, 'A', '2025-S1', null, ATL)).toBe(PM)
  })

  it('reklas berantai: yang dipakai baris TERAKHIR yang sudah terjadi', () => {
    const r = evs(['A', [ev(100, '2026-S1', PM, GB), ev(200, '2026-S2', GB, ATL)]])
    expect(kodePada(r, 'A', '2025-S2', null, ATL)).toBe(PM)
    expect(kodePada(r, 'A', '2026-S1', null, ATL)).toBe(GB)
    expect(kodePada(r, 'A', '2026-S2', null, ATL)).toBe(ATL)
  })

  it('urutan masukan tidak menentukan — dipilih dari isi, bukan posisi array', () => {
    const naik = evs(['A', [ev(100, '2026-S1', PM, GB), ev(200, '2026-S2', GB, ATL)]])
    const turun = evs(['A', [ev(200, '2026-S2', GB, ATL), ev(100, '2026-S1', PM, GB)]])
    for (const p of ['2025-S2', '2026-S1', '2026-S2']) {
      expect(kodePada(turun, 'A', p, null, ATL)).toBe(kodePada(naik, 'A', p, null, ATL))
    }
  })

  it('DUA reklas dalam SATU periode diurutkan by id ledger', () => {
    const r = evs(['A', [ev(200, '2026-S2', GB, ATL), ev(100, '2026-S2', PM, GB)]])
    expect(kodePada(r, 'A', '2026-S2', null, ATL)).toBe(ATL)
  })

  it('trxId: baris mutasi SEBELUM reklas seperiode masih di kode LAMA', () => {
    // Barang diperoleh (trx 50) lalu direklas (trx 100) di periode yang sama.
    // Baris perolehannya harus dibukukan di golongan ASAL — kalau tidak,
    // golongan tujuan dapat +X dari perolehan DAN +X lagi dari reklas masuk.
    expect(kodePada(riwayat, 'A', '2026-S2', 50, ATL)).toBe(PM)
    expect(kodePada(riwayat, 'A', '2026-S2', 100, ATL)).toBe(ATL)  // baris reklas itu sendiri
    expect(kodePada(riwayat, 'A', '2026-S2', 150, ATL)).toBe(ATL)
  })

  it('trxId tidak berlaku lintas periode — reklas periode LALU tetap menang', () => {
    const r = evs(['A', [ev(999, '2026-S1', PM, ATL)]])
    expect(kodePada(r, 'A', '2026-S2', 1, ATL)).toBe(ATL)
  })

  it('payload warisan tanpa kode_lama → jatuh ke kode terkini, bukan string kosong', () => {
    // Tebakan yang buruk, tapi golongan '..' membuat barangnya HILANG dari
    // seluruh baris laporan tanpa jejak — itu jauh lebih berbahaya.
    const r = evs(['A', [ev(100, '2026-S2', null, ATL)]])
    expect(kodePada(r, 'A', '2026-S1', null, ATL)).toBe(ATL)
  })

  it('daftar event kosong diperlakukan seperti tak punya riwayat', () => {
    expect(kodePada(evs(['A', []]), 'A', '2026-S1', null, GB)).toBe(GB)
  })
})

describe('kodeAt — kode semua barang pada akhir periode', () => {
  const riwayat = evs(
    ['A', [ev(100, '2026-S2', PM, ATL)]],
    ['B', [ev(110, '2026-S1', PM, GB), ev(210, '2026-S2', GB, ATL)]],
  )

  it('hanya memuat barang yang PERNAH direklas', () => {
    // Pemanggil wajib COALESCE ke `aset.kode`; memasukkan seluruh aset ke map
    // ini akan menyalin 418rb entri tanpa guna.
    expect([...kodeAt(riwayat, '2026-S2').keys()].sort()).toEqual(['A', 'B'])
    expect(kodeAt(evs(), '2026-S2').size).toBe(0)
  })

  it('setiap barang dijawab menurut posisinya sendiri pada periode itu', () => {
    expect(kodeAt(riwayat, '2026-S1')).toEqual(new Map([['A', PM], ['B', GB]]))
    expect(kodeAt(riwayat, '2026-S2')).toEqual(new Map([['A', ATL], ['B', ATL]]))
  })

  it('sepakat dengan kodePada — dua jalan, satu aturan', () => {
    for (const p of ['2025-S2', '2026-S1', '2026-S2', '2027-S1']) {
      const map = kodeAt(riwayat, p)
      for (const id of ['A', 'B']) {
        expect(map.get(id)).toBe(kodePada(riwayat, id, p, null, 'JANGAN-DIPAKAI'))
      }
    }
  })
})
