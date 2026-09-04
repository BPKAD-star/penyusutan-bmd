// Penjaga kerangka lembar cetak (lib/cetakLembar.ts).
//
// Semua yang diuji di sini kelas kegagalan yang BARU KELIHATAN SESUDAH
// lembarnya tercetak — dan lembar resmi itu ditandatangani lalu dipindai.
// Tak satu pun menghasilkan error saat aplikasi dijalankan.
import { describe, it, expect } from 'vitest'
import { cssCetakLembar, UKURAN_KERTAS, type Kertas } from './cetakLembar'
import { LEMBAR_PERMENDAGRI } from './permendagriFormat'

describe('cssCetakLembar — isolasi cetak', () => {
  it('mengisolasi lembar: body disembunyikan, lembarnya ditampilkan', () => {
    const css = cssCetakLembar({ id: 'cetak-ba', kertas: 'A4 potret' })
    expect(css).toContain('body * { visibility: hidden; }')
    expect(css).toContain('#cetak-ba, #cetak-ba * { visibility: visible; }')
    // `display:block` WAJIB ikut — lembar biasanya `hidden` di layar.
    expect(css).toContain('#cetak-ba { display: block !important;')
  })

  it('menerjemahkan kertas ke nilai @page yang benar', () => {
    expect(cssCetakLembar({ id: 'x', kertas: 'A4 potret' })).toContain('size: A4 portrait;')
    expect(cssCetakLembar({ id: 'x', kertas: 'A4 lanskap' })).toContain('size: A4 landscape;')
    expect(cssCetakLembar({ id: 'x', kertas: 'F4 lanskap' })).toContain('size: 330mm 215mm;')
  })

  it('margin bawaan 1cm, bisa ditimpa', () => {
    expect(cssCetakLembar({ id: 'x', kertas: 'A4 potret' })).toContain('margin: 1cm;')
    expect(cssCetakLembar({ id: 'x', kertas: 'A4 potret', margin: '1.4cm 1.5cm' }))
      .toContain('margin: 1.4cm 1.5cm;')
  })

  it('mengulang thead tiap halaman & tak memotong baris', () => {
    const css = cssCetakLembar({ id: 'x', kertas: 'A4 potret' })
    expect(css).toContain('#x thead { display: table-header-group; }')
    expect(css).toContain('#x tr { break-inside: avoid; }')
  })

  it('menyisipkan aturan tambahan apa adanya, di dalam @media print', () => {
    const css = cssCetakLembar({
      id: 'x', kertas: 'A4 potret', tambahan: '  #x .tabel-ba { font-size: 8.5px; }',
    })
    expect(css).toContain('#x .tabel-ba { font-size: 8.5px; }')
    // Harus di DALAM blok — kalau bocor keluar, aturannya berlaku di LAYAR juga.
    expect(css.trimEnd().endsWith('}')).toBe(true)
    expect(css.indexOf('.tabel-ba')).toBeLessThan(css.lastIndexOf('}'))
  })
})

describe('cssCetakLembar — lembar bertetangga', () => {
  // ⚠️ Insiden nyata (Rekonsiliasi): tabel A4 lanskap & Berita Acara A4 potret
  // hidup di halaman yang sama. `visibility:hidden` saja tak cukup — elemen
  // tak-terlihat TETAP MENGISI tata letak, jadi berkas BA membawa ~8 halaman
  // kosong di belakangnya.
  it('regresi: saudara di-display:none, BUKAN cuma visibility', () => {
    const css = cssCetakLembar({ id: 'cetak-ba', kertas: 'A4 potret', sembunyikan: ['cetak-rekon'] })
    expect(css).toContain('#cetak-rekon { display: none !important; }')
  })

  it('menyembunyikan beberapa saudara sekaligus', () => {
    const css = cssCetakLembar({ id: 'a', kertas: 'A4 potret', sembunyikan: ['b', 'c'] })
    expect(css).toContain('#b { display: none !important; }')
    expect(css).toContain('#c { display: none !important; }')
  })

  it('MELEMPAR kalau lembar menyembunyikan dirinya sendiri (hasilnya berkas kosong)', () => {
    expect(() => cssCetakLembar({ id: 'a', kertas: 'A4 potret', sembunyikan: ['b', 'a'] }))
      .toThrow(/menyembunyikan dirinya sendiri/)
  })
})

describe('cssCetakLembar — id yang salah bikin lembar KOSONG tanpa error', () => {
  it("MELEMPAR kalau id diawali '#'", () => {
    // '#cetak-ba' → selektor '##cetak-ba' yang tak cocok apa pun → seluruh
    // halaman tetap tersembunyi & yang tercetak lembar kosong.
    expect(() => cssCetakLembar({ id: '#cetak-ba', kertas: 'A4 potret' })).toThrow(/tidak sah/)
  })

  it('MELEMPAR kalau id memuat spasi / karakter tak sah / kosong', () => {
    for (const id of ['cetak ba', 'cetak.ba', '', '1cetak', 'cetak#ba']) {
      expect(() => cssCetakLembar({ id, kertas: 'A4 potret' }), id).toThrow(/tidak sah/)
    }
  })

  it("MELEMPAR kalau `sembunyikan` memuat '#'", () => {
    expect(() => cssCetakLembar({ id: 'a', kertas: 'A4 potret', sembunyikan: ['#b'] }))
      .toThrow(/tidak sah/)
  })
})
