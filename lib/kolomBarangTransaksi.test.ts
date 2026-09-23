import { describe, it, expect } from 'vitest'
import { hitungLebarKolom, KOLOM_BARANG_TRANSAKSI, KOLOM_BARANG_URUTAN } from './kolomBarangTransaksi'

describe('KOLOM_BARANG_URUTAN', () => {
  it('memuat KEDUABELAS kunci, masing-masing tepat sekali & punya meta', () => {
    expect(KOLOM_BARANG_URUTAN.length).toBe(12)
    expect(new Set(KOLOM_BARANG_URUTAN).size).toBe(12)
    for (const k of KOLOM_BARANG_URUTAN) expect(KOLOM_BARANG_TRANSAKSI[k]).toBeTruthy()
  })

  // Urutan ini yang dibaca operator sbg "standar" — kalau bergeser tanpa
  // sengaja, kesembilan menu ikut bergeser tanpa satu pun yang sadar.
  it('urutannya PERSIS seperti disepakati (2026-09-23)', () => {
    expect(KOLOM_BARANG_URUTAN).toEqual([
      'kode', 'spek', 'merek', 'spesifikasi', 'nopol', 'mesin', 'rangka',
      'luas', 'alamat', 'tgl', 'jumlah', 'nilai',
    ])
  })
})

describe('hitungLebarKolom', () => {
  it('jumlahnya PERSIS 100, bukan mendekati — table-fixed butuh itu', () => {
    const hasil = hitungLebarKolom([{ key: 'a', berat: 1 }, { key: 'b', berat: 1 }, { key: 'c', berat: 1 }])
    const total = hasil.reduce((s, h) => s + h.pct, 0)
    // Dibulatkan 6 desimal sebelum dibandingkan — pola yang sama dgn
    // lib/formatPermendagri.test.ts (`sisaLebar`): sisa pembulatan biner
    // float (mis. 99,99999999999999) itu derau representasi IEEE754 atas
    // pecahan desimal, bukan bug penjumlahannya; yang harus PERSIS 100 nilai
    // yang sungguh dipakai CSS (`%`), bukan representasi biner mentahnya.
    expect(Number(total.toFixed(6))).toBe(100)
  })

  it('sisa pembulatan ditaruh di kolom TERAKHIR, bukan hilang', () => {
    // 1/3 * 100 = 33.33... — dua kolom pertama dibulatkan, kolom terakhir
    // menampung sisanya supaya totalnya tetap 100 persis.
    const hasil = hitungLebarKolom([{ key: 'a', berat: 1 }, { key: 'b', berat: 1 }, { key: 'c', berat: 1 }])
    expect(hasil[0].pct).toBeCloseTo(33.33, 2)
    expect(hasil[1].pct).toBeCloseTo(33.33, 2)
    expect(hasil[2].pct).toBeCloseTo(33.34, 2)
  })

  it('kolom ekstra dgn bobot lebih besar mendapat lebar lebih besar', () => {
    const hasil = hitungLebarKolom([{ key: 'kecil', berat: 1 }, { key: 'besar', berat: 3 }])
    const kecil = hasil.find(h => h.key === 'kecil')!
    const besar = hasil.find(h => h.key === 'besar')!
    expect(besar.pct).toBeGreaterThan(kecil.pct)
  })

  it('daftar kosong tak melempar & mengembalikan array kosong', () => {
    expect(hitungLebarKolom([])).toEqual([])
  })

  it('seluruh bobot 0 → seluruh kolom 0%, bukan pembagian NaN', () => {
    const hasil = hitungLebarKolom([{ key: 'a', berat: 0 }, { key: 'b', berat: 0 }])
    expect(hasil.every(h => h.pct === 0)).toBe(true)
  })

  // Kanonik 12 kolom (dari KOLOM_BARANG_TRANSAKSI) + kolom ekstra realistis
  // (checkbox, foto, komptabel, keterangan) — memastikan gabungan keduanya,
  // bentuk yang sungguh dipakai `ColgroupBarang`, tetap jumlah 100 persis.
  it('kanonik + kolom ekstra realistis tetap jumlah 100 persis', () => {
    const kanonik = KOLOM_BARANG_URUTAN.map(k => ({ key: k, berat: KOLOM_BARANG_TRANSAKSI[k].berat }))
    const hasil = hitungLebarKolom([
      { key: 'checkbox', berat: 3 }, ...kanonik,
      { key: 'foto', berat: 5 }, { key: 'komptabel', berat: 6 }, { key: 'keterangan', berat: 10 },
    ])
    expect(Number(hasil.reduce((s, h) => s + h.pct, 0).toFixed(6))).toBe(100)
    expect(hasil.length).toBe(12 + 4)
  })
})
