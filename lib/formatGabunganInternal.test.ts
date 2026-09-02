// Penjaga format IV.D.7 — Rekapitulasi Gabungan Pengeluaran & Penerimaan BMD
// Internal Pengguna Barang.
//
// Bentuknya BEDA dari keluarga IV.B/IV.C/IV.D.2 (datar & bernomor, dua blok
// cermin, ditutup baris Jumlah Total), jadi penjaganya pun terpisah. Yang
// dijaga tetap kelas kegagalan SENYAP — tak satu pun menghasilkan error saat
// dijalankan, semuanya baru ketahuan sesudah lembarnya dicetak.
import { describe, it, expect } from 'vitest'
import {
  FORMAT_GABUNGAN_INTERNAL, SEL_KODE_GABUNGAN, KOLOM_DIJUMLAH,
  GRUP_KELUAR, GRUP_MASUK, GRUP_BAST,
  kolomGabungan, lebarKodeGabungan,
} from './formatGabunganInternal'
import { sisaLebar } from './formatPermendagri'
import { FORMAT_PERPINDAHAN, CABANG_GABUNGAN } from './formatPerpindahan'

const f = FORMAT_GABUNGAN_INTERNAL
const semua = kolomGabungan()

describe('IV.D.7 — susunan kolom', () => {
  it('kunci kolom unik', () => {
    const k = semua.map(x => x.key)
    expect(new Set(k).size, `kunci kembar: ${k.join(', ')}`).toBe(k.length)
  })

  it('penomoran mulai (9) & berurut, melompati satu nomor untuk blok Kode Barang', () => {
    // Blok "Kode Barang" (13) punya nomornya sendiri tapi tak punya entri kolom
    // — ia sel segmen. Jadi urutannya: 9,10,11,12 lalu 14..30.
    const kiri = f.kolomKiri.map(k => k.nomor)
    expect(kiri).toEqual([9, 10, 11, 12])
    const kanan = [f.kolomNama, ...f.kolom].map(k => k.nomor)
    expect(kanan).toEqual(kanan.map((_, i) => 14 + i))
    expect(kanan[kanan.length - 1]).toBe(30)
  })

  it('kaki MENYAMBUNG tepat sesudah kolom terakhir', () => {
    const terakhir = Math.max(...semua.map(k => k.nomor))
    expect(f.kaki.tanggal).toBe(terakhir + 1)
    expect(f.kaki.jabatan).toBe(f.kaki.tanggal + 1)
    expect(f.kaki.nama).toBe(f.kaki.jabatan + 1)
  })

  it('total lebar kolom + blok kode = 100 PERSIS', () => {
    // Inilah yang membuat lembarnya "fit to window" di `table-fixed`.
    const total = semua.reduce((a, k) => a + k.lebar, 0) + lebarKodeGabungan()
    expect(Math.round(total * 100) / 100).toBe(100)
    expect(lebarKodeGabungan()).toBe(sisaLebar(semua))
  })

  it('blok kode cukup lebar & NIBAR tak dipersempit', () => {
    expect(lebarKodeGabungan()).toBeGreaterThanOrEqual(8)
    // Potongan PERTAMA `pecahNibar()` 26 digit wajib muat SEBARIS.
    expect(f.kolomKiri.find(k => k.key === 'nibar')!.lebar).toBeGreaterThanOrEqual(7.5)
  })

  it('tiap kolom punya lebar positif', () => {
    for (const k of semua) expect(k.lebar, k.key).toBeGreaterThan(0)
  })
})

describe('IV.D.7 — dua blok cermin', () => {
  const blok = (grup: string) => f.kolom.filter(k => k.grup === grup).map(k => k.key)

  it('Pengeluaran & Penerimaan punya kolom yang SAMA PERSIS bentuknya', () => {
    // ⚠️ Kalau salah satu blok kehilangan kolom, lembarnya tak lagi bercermin &
    // pembacanya tak bisa menyandingkan kedua sisi — tanpa satu pun error.
    const keluar = blok(GRUP_KELUAR).map(k => k.replace(/^keluar_/, ''))
    const masuk = blok(GRUP_MASUK).map(k => k.replace(/^masuk_/, ''))
    expect(keluar).toEqual(masuk)
    expect(keluar).toEqual(['pihak', 'jumlah', 'satuan', 'harga', 'total', 'akumulasi', 'nilai_buku'])
  })

  it('judul kedua blok BEDA tepat di pihaknya — menyerahkan vs menerima', () => {
    const jud = (key: string) => f.kolom.find(k => k.key === key)!.judul
    expect(jud('keluar_pihak')).toBe('Pihak yang menyerahkan')
    expect(jud('masuk_pihak')).toBe('Pihak yang menerima')
    // Sisanya wajib kembar — kalau tidak, dua blok yang bercermin terbaca
    // sebagai dua hal berbeda.
    for (const k of ['jumlah', 'satuan', 'harga', 'total', 'akumulasi', 'nilai_buku']) {
      expect(jud(`keluar_${k}`), k).toBe(jud(`masuk_${k}`))
    }
  })

  it('kolom bergrup berdampingan — grup tak boleh terpotong kolom lain', () => {
    const terlihat = new Set<string>()
    let sebelum: string | undefined
    for (const g of semua.map(k => k.grup)) {
      if (g && g !== sebelum) {
        expect(terlihat.has(g), `grup "${g}" terpotong kolom lain`).toBe(false)
        terlihat.add(g)
      }
      sebelum = g
    }
    expect([...terlihat].sort()).toEqual([GRUP_BAST, GRUP_MASUK, GRUP_KELUAR].sort())
  })
})

describe('IV.D.7 — baris Jumlah Total', () => {
  it('menjumlah TEPAT enam kolom uang, tiga per blok', () => {
    expect([...KOLOM_DIJUMLAH]).toEqual([
      'keluar_total', 'keluar_akumulasi', 'keluar_nilai_buku',
      'masuk_total', 'masuk_akumulasi', 'masuk_nilai_buku',
    ])
  })

  it('Harga Satuan SENGAJA tak ikut dijumlah', () => {
    // ⚠️ Menjumlahkan harga satuan barang yang BERBEDA menghasilkan angka yang
    // tak berarti apa pun — dan begitu tercetak, ia akan dikutip orang.
    // Pelajaran yang sama dgn lembar Standar Harga.
    expect(KOLOM_DIJUMLAH).not.toContain('keluar_harga')
    expect(KOLOM_DIJUMLAH).not.toContain('masuk_harga')
  })

  it('tiap kolom yang dijumlah benar-benar ada di registry', () => {
    // Menandai kolom yang sudah dihapus/diganti nama tak menghasilkan error —
    // angkanya cuma tak pernah tercetak.
    const kunci = new Set(semua.map(k => k.key))
    for (const k of KOLOM_DIJUMLAH) expect(kunci.has(k), `kolom ${k} tak ada`).toBe(true)
  })
})

describe('IV.D.7 — tempatnya di aplikasi', () => {
  it('rumahnya cabang PENGELUARAN, satu pintu saja', () => {
    // ⚠️ Nomornya milik keluarga IV.D, dan dua pintu untuk satu lembar cepat
    // atau lambat menyimpang. Menu Penerimaan cukup diberi penunjuk.
    expect(CABANG_GABUNGAN).toBe('pengeluaran')
    expect(FORMAT_PERPINDAHAN[CABANG_GABUNGAN].awalan).toBe('IV.D')
    expect(f.kode.startsWith(FORMAT_PERPINDAHAN[CABANG_GABUNGAN].awalan + '.')).toBe(true)
  })

  it('membaca ledger yang SAMA dengan cabang pemiliknya', () => {
    expect(f.jenis).toBe(FORMAT_PERPINDAHAN[CABANG_GABUNGAN].jenis)
    expect(f.jenis).toBe('mutasi_internal')
  })

  it('menyediakan 7 sel segmen kode (kode penuh)', () => {
    expect(SEL_KODE_GABUNGAN).toBe(7)
  })
})
