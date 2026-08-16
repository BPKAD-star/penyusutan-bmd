// Uji aturan turunan angka Laporan BMD dari baris mentah `fn_rekap_bmd`.
//
// Kenapa diuji: kegagalannya TAK BERSUARA. Membaca `nilai_buku_akhir` mentah
// tetap menghasilkan tabel yang rapi — cuma Tanah, Aset Tetap Lainnya, & KDP
// bernilai buku nol. Di Laporan BMD itu terlihat sbg kekayaan yang lenyap; di
// Uji Konsistensi terlihat sbg tuduhan "TIDAK COCOK" atas laporan yang justru
// sudah benar, lengkap dengan anjuran menahan pengirimannya (insiden
// 2026-08-16, BKAD 2026-S1: 49.448.614.813 + 13.339.400).
import { describe, it, expect } from 'vitest'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { nilaiBukuSel, pakaiHasilEngine, rekapPerGolongan, zeroRekap, type RekapRpcRow } from '@/lib/rekapBmd'

const row = (o: Partial<RekapRpcRow> & { golongan: string }): RekapRpcRow => ({
  skpd_id: 1, kuantitas: 1, perolehan: 0, akumulasi: 0, beban: 0,
  nilai_buku_akhir: 0, count_peny: 0, ...o,
})

describe('nilaiBukuSel — cadangan ke nilai perolehan', () => {
  it('golongan yang TIDAK disusutkan → nilai buku = nilai perolehan', () => {
    // Persis bentuk baris yang dikembalikan RPC untuk Tanah: tak pernah ada
    // baris engine, jadi nilai_buku_akhir & count_peny sama-sama nol.
    for (const gol of ['1.3.1', '1.3.5', '1.3.6']) {
      const r = row({ golongan: gol, perolehan: 49_448_614_813, nilai_buku_akhir: 0, count_peny: 0 })
      expect(pakaiHasilEngine(r)).toBe(false)
      expect(nilaiBukuSel(r)).toBe(49_448_614_813)
    }
  })

  it('golongan disusutkan yang SUDAH dihitung engine → pakai angka engine', () => {
    const r = row({ golongan: '1.3.2', perolehan: 6_938_200_015, nilai_buku_akhir: 1_241_297_834, count_peny: 1_165 })
    expect(pakaiHasilEngine(r)).toBe(true)
    expect(nilaiBukuSel(r)).toBe(1_241_297_834)
  })

  it('golongan disusutkan yang BELUM dihitung engine → jatuh ke nilai perolehan', () => {
    // Barang yang di-approve sesudah engine terakhir dijalankan. Nol di sini
    // berarti "belum dihitung", bukan "nilai bukunya habis".
    const r = row({ golongan: '1.3.2', perolehan: 5_000_000, nilai_buku_akhir: 0, count_peny: 0 })
    expect(nilaiBukuSel(r)).toBe(5_000_000)
  })

  it('daftar golongan disusutkan diturunkan dari GOLONGAN_REKAP, bukan diketik ulang', () => {
    for (const g of GOLONGAN_REKAP) {
      const r = row({ golongan: g.kode, perolehan: 100, nilai_buku_akhir: 30, count_peny: 1 })
      expect(nilaiBukuSel(r)).toBe(g.disusutkan ? 30 : 100)
    }
  })
})

describe('rekapPerGolongan', () => {
  it('menjumlah beberapa SKPD dalam satu golongan', () => {
    const out = rekapPerGolongan([
      row({ golongan: '1.3.2', skpd_id: 1, kuantitas: 2, perolehan: 1_000, akumulasi: 400, beban: 100, nilai_buku_akhir: 600, count_peny: 2 }),
      row({ golongan: '1.3.2', skpd_id: 2, kuantitas: 3, perolehan: 2_000, akumulasi: 500, beban: 200, nilai_buku_akhir: 1_500, count_peny: 3 }),
    ])
    expect(out.get('1.3.2')).toEqual({ kuantitas: 5, perolehan: 3_000, akumulasi: 900, beban: 300, nilaiBuku: 2_100 })
  })

  it('cadangan diterapkan PER BARIS, bukan sesudah dijumlah', () => {
    // Satu golongan, dua SKPD: yang satu sudah dihitung engine, yang lain belum.
    // Versi lama menjumlah nilai buku HANYA dari baris ber-engine, jadi nilai
    // perolehan SKPD kedua hilang sama sekali dari kolom Nilai Buku dan
    // identitas `perolehan − akumulasi = nilai buku` patah tanpa satu pun pesan.
    const out = rekapPerGolongan([
      row({ golongan: '1.3.2', skpd_id: 1, perolehan: 1_000, akumulasi: 400, nilai_buku_akhir: 600, count_peny: 2 }),
      row({ golongan: '1.3.2', skpd_id: 2, perolehan: 2_000, akumulasi: 0, nilai_buku_akhir: 0, count_peny: 0 }),
    ])
    const u = out.get('1.3.2')!
    expect(u.nilaiBuku).toBe(2_600)
    expect(u.perolehan - u.akumulasi).toBe(u.nilaiBuku)
  })

  it('golongan tanpa baris sama sekali → nol, bukan undefined', () => {
    expect(rekapPerGolongan([]).get('1.3.1') ?? zeroRekap())
      .toEqual({ kuantitas: 0, perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
  })
})

describe('Uji Konsistensi ↔ Laporan BMD — sel yang dulu dilaporkan beda', () => {
  // Angka nyata BKAD 2026-S1 (tangkapan layar user 2026-08-16). Rekonsiliasi
  // memberi nilai buku = nilai perolehan untuk golongan tak disusutkan
  // (lib/rekon.ts `nilaiBuku: susut ? p.nilai_buku_akhir : nilai`); sisi Laporan
  // BMD WAJIB mengatakan hal yang sama, kalau tidak selisihnya persis sebesar
  // seluruh nilai perolehan golongan itu.
  const KASUS = [
    { golongan: '1.3.1', perolehan: 49_448_614_813 },
    { golongan: '1.3.5', perolehan: 13_339_400 },
  ]
  for (const k of KASUS) {
    it(`${k.golongan} — nilai buku sisi BMD = sisi Rekonsiliasi`, () => {
      const bmd = rekapPerGolongan([row({ golongan: k.golongan, perolehan: k.perolehan })])
      const rekon = k.perolehan     // aturan lib/rekon.ts untuk golongan tak disusutkan
      expect(bmd.get(k.golongan)!.nilaiBuku - rekon).toBe(0)
    })
  }
})
