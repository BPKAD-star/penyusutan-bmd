// Kunci susunan & aritmetika lembar LAPORAN BMD (Permendagri 47/2021,
// Format IV.L.4.1–4.4).
//
// Yang dijaga di sini BUKAN sekadar "fungsinya jalan", tapi tiga hal yang
// kalau menyimpang TIDAK ADA APA PUN YANG GAGAL — lembarnya tetap tercetak,
// cuma angkanya salah, dan baru ketahuan di tangan inspektorat/BPK:
//   1. akumulasi penyusutan masuk ke BARIS yang benar (1.3.7/1.5.5/1.5.6);
//   2. subtotal kelompok = bruto − akumulasi (itulah nilai bukunya);
//   3. golongan yang tak punya data tercetak "–", bukan 0.
import { describe, it, expect } from 'vitest'
import {
  BARIS_LAPORAN_BMD, ukuranPerGolongan, nilaiBaris, nilaiBarisMutasi,
  pecahPeriode, labelKomptabel,
} from './laporanBmdFormat'
import type { RekapRpcRow } from './rekapBmd'

const baris = (nama: string) => {
  const b = BARIS_LAPORAN_BMD.find(x => x.nama === nama)
  if (!b) throw new Error(`baris '${nama}' tak ada di BARIS_LAPORAN_BMD`)
  return b
}

/** Baris RPC ringkas — cuma kolom yang dipakai modul ini. */
const rpc = (
  golongan: string, kuantitas: number, perolehan: number, akumulasi = 0, skpd_id = 1,
): RekapRpcRow => ({
  skpd_id, golongan, kuantitas, perolehan, akumulasi,
  beban: 0, nilai_buku_akhir: perolehan - akumulasi, count_peny: akumulasi > 0 ? 1 : 0,
})

describe('§1 susunan baris — persis lampiran', () => {
  it('15 baris, urut seperti di lampiran', () => {
    expect(BARIS_LAPORAN_BMD.map(b => b.kode.join('').trim())).toEqual([
      '117',
      '13', '131', '132', '133', '134', '135', '136', '137',
      '15', '152', '153', '154', '155', '156',
    ])
  })

  it('nama baris bersih — tanpa tanda *) yang sudah dicabut', () => {
    // Tanda *) & catatan kakinya dicabut 2026-08-26 (Tanah tetap diisi penuh,
    // jadi tandanya tak menerangkan apa pun). Kalau ada yang menempelkannya
    // lagi ke `nama`, lembar resmi memuat catatan kaki yang tak ada penjelasnya.
    expect(BARIS_LAPORAN_BMD.filter(b => b.nama.includes('*'))).toEqual([])
  })

  it('tepat dua baris kelompok (subtotal tebal) & tiga baris akumulasi', () => {
    expect(BARIS_LAPORAN_BMD.filter(b => b.jenis === 'kelompok').map(b => b.nama))
      .toEqual(['Aset Tetap', 'Aset Lainnya'])
    expect(BARIS_LAPORAN_BMD.filter(b => b.jenis === 'akumulasi').map(b => b.nama)).toEqual([
      'Akumulasi Penyusutan',
      'Akumulasi Amortisasi Aset Tidak Berwujud',
      'Akumulasi Penyusutan Aset Lainnya',
    ])
  })
})

describe('§2 pemetaan akumulasi — diturunkan dari perlakuanKode()', () => {
  // Kalau pemetaan ini bergeser, akumulasi Peralatan & Mesin bisa mendarat di
  // baris "Akumulasi Amortisasi Aset Tidak Berwujud" tanpa satu pun error.
  it('1.3.7 memuat golongan yang DISUSUTKAN (1.3.2/1.3.3/1.3.4)', () => {
    expect(baris('Akumulasi Penyusutan').sumberAkumulasi).toEqual(['1.3.2', '1.3.3', '1.3.4'])
  })
  it('1.5.5 memuat Aset Tidak Berwujud saja (amortisasi)', () => {
    expect(baris('Akumulasi Amortisasi Aset Tidak Berwujud').sumberAkumulasi).toEqual(['1.5.3'])
  })
  it('1.5.6 memuat Aset Lain-lain saja', () => {
    expect(baris('Akumulasi Penyusutan Aset Lainnya').sumberAkumulasi).toEqual(['1.5.4'])
  })
  it('tak ada golongan yang dihitung di DUA baris akumulasi sekaligus', () => {
    const semua = BARIS_LAPORAN_BMD.flatMap(b => b.sumberAkumulasi ?? [])
    expect(semua.length).toBe(new Set(semua).size)
  })
})

describe('§3 aritmetika — subtotal kelompok = nilai buku', () => {
  // Angka NYATA dari DB (BKAD 2026-S1 intra, diukur 2026-08-26) — bukan angka
  // karangan, supaya kalau rumusnya bergeser bedanya terlihat pada kasus yang
  // benar-benar pernah dicetak.
  const peta = ukuranPerGolongan([
    rpc('1.3.1', 7, 49_448_614_813),
    rpc('1.3.2', 1168, 8_337_400_015, 5_500_000_000),
    rpc('1.3.3', 1, 215_155_360, 200_000_000),
    rpc('1.3.4', 3, 72_910_000, 63_186_278),
    rpc('1.3.5', 80, 13_339_400),
    rpc('1.5.3', 1, 132_380_000, 132_380_000),
    rpc('1.5.4', 9, 3_216_625_357, 2_345_156_505),
  ])

  it('baris aset memakai nilai perolehan BRUTO, bukan nilai buku', () => {
    // Kalau ini diam-diam jadi nilai buku, akumulasinya terhitung DUA KALI
    // (sekali di sini, sekali di baris 1.3.7) dan subtotalnya terlalu kecil.
    expect(nilaiBaris(baris('Peralatan dan Mesin'), peta))
      .toEqual({ jumlahBmd: 1168, saldoAkhir: 8_337_400_015 })
  })

  it('baris akumulasi menjumlah akumulasi sumbernya & Jumlah BMD selalu null', () => {
    expect(nilaiBaris(baris('Akumulasi Penyusutan'), peta))
      .toEqual({ jumlahBmd: null, saldoAkhir: 5_763_186_278 })
  })

  it('akumulasi disimpan POSITIF (yang membuatnya pengurang = subtotal & cara cetak)', () => {
    expect(nilaiBaris(baris('Akumulasi Penyusutan Aset Lainnya'), peta).saldoAkhir).toBe(2_345_156_505)
  })

  it('subtotal Aset Tetap = Σbruto − akumulasi = nilai buku', () => {
    const bruto = 49_448_614_813 + 8_337_400_015 + 215_155_360 + 72_910_000 + 13_339_400
    expect(nilaiBaris(baris('Aset Tetap'), peta)).toEqual({
      jumlahBmd: 7 + 1168 + 1 + 3 + 80,
      saldoAkhir: bruto - 5_763_186_278,
    })
  })

  it('subtotal Aset Lainnya mengurangkan DUA baris akumulasi (1.5.5 + 1.5.6)', () => {
    expect(nilaiBaris(baris('Aset Lainnya'), peta)).toEqual({
      jumlahBmd: 1 + 9,
      saldoAkhir: (132_380_000 + 3_216_625_357) - (132_380_000 + 2_345_156_505),
    })
  })

  it('menjumlahkan beberapa SKPD ke golongan yang sama', () => {
    const p = ukuranPerGolongan([rpc('1.3.2', 2, 100, 10, 1), rpc('1.3.2', 3, 200, 20, 2)])
    expect(nilaiBaris(baris('Peralatan dan Mesin'), p)).toEqual({ jumlahBmd: 5, saldoAkhir: 300 })
    expect(nilaiBaris(baris('Akumulasi Penyusutan'), p).saldoAkhir).toBe(30)
  })
})

describe('§4 golongan tanpa data → "–", bukan 0', () => {
  // Persediaan (1.1.7) & Kemitraan (1.5.2) memang 0 baris di aplikasi ini
  // (diverifikasi ke DB). Barisnya TETAP dicetak (keputusan user) — dan harus
  // terbaca "belum/tak ada datanya", bukan "nilainya nol rupiah".
  const peta = ukuranPerGolongan([rpc('1.3.2', 1, 100)])

  it('Persediaan & Kemitraan mengembalikan null di kedua kolom', () => {
    expect(nilaiBaris(baris('Persediaan'), peta)).toEqual({ jumlahBmd: null, saldoAkhir: null })
    expect(nilaiBaris(baris('Kemitraan dengan Pihak Ketiga'), peta)).toEqual({ jumlahBmd: null, saldoAkhir: null })
  })

  it('baris akumulasi tanpa satu pun sumber ber-data → null (bukan 0)', () => {
    expect(nilaiBaris(baris('Akumulasi Amortisasi Aset Tidak Berwujud'), peta).saldoAkhir).toBeNull()
  })

  it('golongan yang ADA datanya tapi bernilai 0 tetap dicetak 0, bukan "–"', () => {
    const p = ukuranPerGolongan([rpc('1.3.6', 0, 0)])
    expect(nilaiBaris(baris('Konstruksi Dalam Pengerjaan'), p)).toEqual({ jumlahBmd: 0, saldoAkhir: 0 })
  })
})

describe('§5 mutasi (IV.L.4.1/4.3) — baris akumulasi & subtotal wajib FOOT', () => {
  const mut = (saldoAwal: number, penambahan: number, pengurangan: number) =>
    ({ saldoAwal, penambahan, pengurangan, saldoAkhir: saldoAwal + penambahan - pengurangan })

  const sumber = {
    mutasi: new Map([
      ['1.3.1', mut(40_000, 10_000, 0)],
      ['1.3.2', mut(8_000, 2_000, 1_000)],
      ['1.3.3', mut(200, 0, 0)],
      ['1.5.3', mut(500, 0, 0)],
      ['1.5.4', mut(3_000, 100, 50)],
    ]),
    akumAwal: new Map([['1.3.2', 5_000], ['1.3.3', 100], ['1.5.3', 400], ['1.5.4', 2_000]]),
    akumAkhir: new Map([['1.3.2', 5_600], ['1.3.3', 120], ['1.5.3', 450], ['1.5.4', 2_300]]),
    beban: new Map([['1.3.2', 900], ['1.3.3', 20], ['1.5.3', 50], ['1.5.4', 300]]),
  }

  it('baris aset memakai mutasi bruto apa adanya', () => {
    expect(nilaiBarisMutasi(baris('Peralatan dan Mesin'), sumber))
      .toEqual({ saldoAwal: 8_000, penambahan: 2_000, pengurangan: 1_000, saldoAkhir: 9_000 })
  })

  it('baris akumulasi: Bertambah = beban, Berkurang diturunkan agar FOOT', () => {
    // awal 5.100 + beban 920 − akhir 5.720 = 300 lepas krn pelepasan.
    expect(nilaiBarisMutasi(baris('Akumulasi Penyusutan'), sumber))
      .toEqual({ saldoAwal: 5_100, penambahan: 920, pengurangan: 300, saldoAkhir: 5_720 })
  })

  it('IDENTITAS: tiap baris akumulasi selalu foot (awal + tambah − kurang = akhir)', () => {
    // Ini yang membuat lembar resminya mustahil menampilkan penjumlahan yang
    // tak nyambung — dijaga untuk KETIGA baris akumulasi sekaligus.
    for (const b of BARIS_LAPORAN_BMD.filter(x => x.jenis === 'akumulasi')) {
      const n = nilaiBarisMutasi(b, sumber)
      expect(n.saldoAwal! + n.penambahan! - n.pengurangan!, `baris ${b.nama} tak foot`)
        .toBe(n.saldoAkhir!)
    }
  })

  it('IDENTITAS: baris kelompok juga foot', () => {
    for (const b of BARIS_LAPORAN_BMD.filter(x => x.jenis === 'kelompok')) {
      const n = nilaiBarisMutasi(b, sumber)
      expect(n.saldoAwal! + n.penambahan! - n.pengurangan!, `subtotal ${b.nama} tak foot`)
        .toBe(n.saldoAkhir!)
    }
  })

  it('Saldo akhir subtotal SAMA dgn lembar posisi (IV.L.4.2/4.4)', () => {
    // Dua lembar resmi untuk periode & lingkup yang sama tak boleh menyebut
    // angka berbeda — itu pertanyaan pertama yang akan diajukan penelaah.
    const petaPosisi = ukuranPerGolongan([
      rpc('1.3.1', 0, 50_000), rpc('1.3.2', 0, 9_000, 5_600), rpc('1.3.3', 0, 200, 120),
      rpc('1.5.3', 0, 500, 450), rpc('1.5.4', 0, 3_050, 2_300),
    ])
    expect(nilaiBarisMutasi(baris('Aset Tetap'), sumber).saldoAkhir)
      .toBe(nilaiBaris(baris('Aset Tetap'), petaPosisi).saldoAkhir)
    expect(nilaiBarisMutasi(baris('Aset Lainnya'), sumber).saldoAkhir)
      .toBe(nilaiBaris(baris('Aset Lainnya'), petaPosisi).saldoAkhir)
  })

  it('golongan tanpa data tetap "–" di keempat kolom', () => {
    expect(nilaiBarisMutasi(baris('Persediaan'), sumber))
      .toEqual({ saldoAwal: null, penambahan: null, pengurangan: null, saldoAkhir: null })
  })
})

describe('§6 kop lembar', () => {
  it('pecahPeriode', () => {
    expect(pecahPeriode('2026-S1')).toEqual({ semester: 'I', tahun: '2026' })
    expect(pecahPeriode('2026-S2')).toEqual({ semester: 'II', tahun: '2026' })
  })
  it('labelKomptabel — kosong berarti gabungan, bukan salah satu', () => {
    expect(labelKomptabel('intra')).toBe('INTRAKOMPTABEL')
    expect(labelKomptabel('ekstra')).toBe('EKSTRAKOMPTABEL')
    expect(labelKomptabel('')).toBe('INTRAKOMPTABEL DAN EKSTRAKOMPTABEL')
  })
})
