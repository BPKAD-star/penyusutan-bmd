// Uji bagian MURNI Berita Acara Rekonsiliasi (Format V.2 Permendagri 47/2021).
//
// Kenapa diuji: yang salah di sini TERCETAK LALU DITANDATANGANI. Tak ada satu
// pun proses lain di aplikasi yang akan menangkapnya — kategori mutasi yang
// lupa dipetakan ke baris format tidak menghasilkan error, ia cuma hilang dari
// lembar dan membuat jumlahnya diam-diam kurang.
import { describe, it, expect } from 'vitest'
import { KATEGORI_LABEL, KURANG_KEYS, type Komptabel, type Measures, type Mutasi, type MutasiKey, type Snapshot } from '@/lib/rekon'
import {
  BARIS_TRX, VARIAN_BA, barisSaldoBA, barisTrxBA, totalTrxBA, selBA, selisihBA,
  adaTransaksiBA, catatanSelisihBA, terbilang, hariDari, tglPanjang, tanggalCutoff,
  kalimatTanggal, pangkatGol, saranPihak, butirCatatan, KOMPS_DARI, varianInfo,
  namaBerkasBA, type PegawaiBA, type SelBA,
} from '@/lib/beritaAcaraRekon'

const SEMUA_KEY = Object.keys(KATEGORI_LABEL) as MutasiKey[]
const INTRA: Komptabel[] = ['intra']
const KEDUANYA: Komptabel[] = ['intra', 'ekstra']

const measures = (perolehan: number, akumulasi = 0): Measures =>
  ({ perolehan, beban: 0, akumulasi, nilaiBuku: perolehan - akumulasi, count: 1 })

const snap = (isi: Record<string, [number, number]>): Snapshot => {
  const out: Snapshot = {}
  for (const [gol, [p, a]] of Object.entries(isi)) {
    out[gol] = { intra: measures(p, a), ekstra: measures(0, 0) }
  }
  return out
}

const mutasi = (gol: string, isi: Partial<Record<MutasiKey, number>>, komp: Komptabel = 'intra'): Mutasi => {
  const cell: Record<string, { perolehan: number; beban: number; akumulasi: number }> = {}
  for (const [k, v] of Object.entries(isi)) cell[k] = { perolehan: v as number, beban: 0, akumulasi: 0 }
  return { [gol]: { intra: komp === 'intra' ? cell : {}, ekstra: komp === 'ekstra' ? cell : {} } }
}

// ══════════════════════════════════════════════════════════════════════════
describe('BARIS_TRX — pemetaan kategori ke baris Format V.2', () => {
  it('setiap MutasiKey punya TEPAT SATU rumah', () => {
    const hitung = new Map<MutasiKey, number>()
    for (const b of BARIS_TRX) for (const k of b.keys) hitung.set(k, (hitung.get(k) ?? 0) + 1)

    // Yang belum dipetakan → hilang dari lembar. Yang dipetakan dua kali →
    // angkanya dobel. Dua-duanya senyap, makanya diuji dua arah sekaligus.
    const belum = SEMUA_KEY.filter(k => !hitung.has(k))
    const dobel = [...hitung.entries()].filter(([, n]) => n > 1).map(([k]) => k)
    expect({ belum, dobel }).toEqual({ belum: [], dobel: [] })
    expect([...hitung.keys()].length).toBe(SEMUA_KEY.length)
  })

  it('tidak memuat kategori yang sudah tidak ada di lib/rekon', () => {
    const dikenal = new Set<string>(SEMUA_KEY)
    for (const b of BARIS_TRX) for (const k of b.keys) expect(dikenal.has(k)).toBe(true)
  })

  it('baris judul tak pernah membawa angka sendiri', () => {
    for (const b of BARIS_TRX) if (b.judul) expect(b.keys).toEqual([])
  })
})

describe('barisTrxBA', () => {
  it('memisahkan tambah & kurang menurut arah kategorinya', () => {
    const sel = selBA(mutasi('1.3.2', { pengadaan: 1000, hapus_penjualan: 250 }), '1.3.2', INTRA)
    const baris = barisTrxBA(sel)
    const pengadaan = baris.find(b => b.uraian === 'Pengadaan dari APBD')!
    const hapus = baris.find(b => b.uraian === 'Pemindahtanganan BMD')!
    expect(pengadaan.tambah).toBe(1000)
    expect(pengadaan.kurang).toBeNull()   // baris ini tak punya kategori pengurang
    expect(hapus.kurang).toBe(250)
    expect(hapus.tambah).toBeNull()
  })

  it('baris Koreksi membawa dua arah sekaligus', () => {
    const sel = selBA(mutasi('1.3.3', { kapitalisasi: 700, koreksi_kurang: 200 }), '1.3.3', INTRA)
    const koreksi = barisTrxBA(sel).find(b => b.uraian === 'Koreksi')!
    expect(koreksi.tambah).toBe(700)
    expect(koreksi.kurang).toBe(200)
  })

  it('pos Permendagri yang belum ada menunya tampil 0, BUKAN kosong', () => {
    // Beda dari Persediaan/Kemitraan di lampiran Saldo (barisSaldoBA) — baris
    // ini bukan pos yang mustahil dicatat aplikasi, cuma belum ada menunya di
    // Pembukuan. Kosong di sini akan terbaca sbg "di luar aplikasi", padahal
    // suatu saat bisa dibangun; 0 lebih jujur & sejajar dgn baris tak bermutasi.
    const divestasi = barisTrxBA({}).find(b => b.uraian === 'divestasi')!
    expect(divestasi.tambah).toBe(0)
    expect(divestasi.kurang).toBe(0)
    const putusan = barisTrxBA({}).find(b => b.uraian === 'Putusan Pengadilan berkekuatan hukum tetap')!
    expect(putusan.tambah).toBe(0)
    expect(putusan.kurang).toBe(0)
  })

  it('baris JUDUL (header seksi) tetap kosong — ia tak pernah punya angka', () => {
    const judul = barisTrxBA({}).filter(b => b.judul)
    expect(judul.length).toBeGreaterThan(0)
    for (const b of judul) {
      expect(b.tambah).toBeNull()
      expect(b.kurang).toBeNull()
    }
  })

  it('jumlah seluruh baris = jumlah seluruh kategori (tak ada yang bocor)', () => {
    // Tiap kategori diberi nilai unik supaya kebocoran satu kategori pun
    // mengubah totalnya — kalau semuanya 1, dua kesalahan bisa saling menutup.
    const isi: Partial<Record<MutasiKey, number>> = {}
    SEMUA_KEY.forEach((k, i) => { isi[k] = (i + 1) * 1_000 })
    const sel = selBA(mutasi('1.3.2', isi), '1.3.2', INTRA)

    const baris = barisTrxBA(sel)
    const tambahBaris = baris.reduce((s, b) => s + (b.tambah ?? 0), 0)
    const kurangBaris = baris.reduce((s, b) => s + (b.kurang ?? 0), 0)
    const total = totalTrxBA(sel)

    expect(tambahBaris).toBe(total.tambah)
    expect(kurangBaris).toBe(total.kurang)
    expect(tambahBaris + kurangBaris).toBe(SEMUA_KEY.reduce((s, k) => s + (isi[k] ?? 0), 0))
  })
})

describe('selBA — penggabungan kolom komptabel', () => {
  it('cakupan intra hanya membaca kolom intra', () => {
    const mut: Mutasi = {
      '1.3.2': {
        intra: { pengadaan: { perolehan: 100, beban: 0, akumulasi: 0 } },
        ekstra: { pengadaan: { perolehan: 7, beban: 0, akumulasi: 0 } },
      },
    }
    expect(selBA(mut, '1.3.2', INTRA).pengadaan).toBe(100)
    expect(selBA(mut, '1.3.2', KEDUANYA).pengadaan).toBe(107)
  })

  it('golongan tanpa mutasi menghasilkan sel kosong', () => {
    expect(adaTransaksiBA(selBA(undefined, '1.3.1', KEDUANYA))).toBe(false)
    expect(adaTransaksiBA(selBA(mutasi('1.3.1', { hibah: 5 }), '1.3.1', INTRA))).toBe(true)
  })
})

describe('selisihBA', () => {
  it('nol saat Saldo Awal + Tambah − Kurang = Saldo Akhir', () => {
    const sel = selBA(mutasi('1.3.2', { pengadaan: 300, hapus_sebab_lain: 100 }), '1.3.2', INTRA)
    expect(selisihBA(sel, 1_000, 1_200)).toBe(0)
  })

  it('memunculkan yang belum terpetakan (mis. reklas komptabel keluar)', () => {
    // Barang direklas Intra→Ekstra: saldo intra turun 50 tanpa satu pun baris
    // Format V.2 yang menampungnya.
    expect(selisihBA({}, 1_000, 950)).toBe(-50)
  })

  it('catatan (15) menyebut golongan & angkanya, dan diam saat semuanya cocok', () => {
    const awal = snap({ '1.3.2': [1_000, 0] })
    const akhirCocok = snap({ '1.3.2': [1_300, 0] })
    const mut = mutasi('1.3.2', { pengadaan: 300 })
    expect(catatanSelisihBA(awal, akhirCocok, mut, INTRA)).toEqual([])

    const akhirMeleset = snap({ '1.3.2': [1_250, 0] })
    const catatan = catatanSelisihBA(awal, akhirMeleset, mut, INTRA)
    expect(catatan).toHaveLength(1)
    expect(catatan[0]).toContain('1.3.2 Peralatan dan Mesin')
    expect(catatan[0]).toContain('-50')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('barisSaldoBA', () => {
  const s = snap({
    '1.3.1': [500, 0],
    '1.3.2': [1_000, 400],
    '1.3.3': [2_000, 600],
    '1.5.3': [300, 100],
    '1.5.4': [80, 30],
  })
  const baris = barisSaldoBA(s, INTRA)
  const cari = (uraian: string) => baris.find(b => b.uraian === uraian)!

  it('mengikuti susunan Format V.2 (A / B 1-7 / C 1-5)', () => {
    expect(baris.filter(b => b.judul).map(b => b.uraian))
      .toEqual(['ASET LANCAR', 'ASET TETAP', 'ASET LAINNYA'])
    expect(baris).toHaveLength(16)
  })

  it('nilai perolehan per golongan masuk ke barisnya', () => {
    expect(cari('Tanah').nilai).toBe(500)
    expect(cari('Peralatan dan Mesin').nilai).toBe(1_000)
    expect(cari('Aset Tidak Berwujud').nilai).toBe(300)
    expect(cari('Aset Lain-lain').nilai).toBe(80)
  })

  it('Akumulasi Penyusutan = TOTAL akumulasi Aset Tetap, bertanda negatif', () => {
    // Negatif bukan selera: kolom (11) satu kolom bertanda, dan akumulasi yang
    // tampil positif di sebelah nilai perolehan mustahil dibaca sbg pengurang.
    expect(cari('Akumulasi Penyusutan').nilai).toBe(-1_000)
    expect(cari('Akumulasi Amortisasi Aset Tidak Berwujud').nilai).toBe(-100)
    expect(cari('Akumulasi Penyusutan Aset Lainnya').nilai).toBe(-30)
  })

  it('pos yang tidak dicatat aplikasi ini bernilai null, BUKAN nol', () => {
    expect(cari('Persediaan').nilai).toBeNull()
    expect(cari('Kemitraan dengan Pihak Ketiga').nilai).toBeNull()
  })

  it('nol tetap nol (tak berubah jadi -0)', () => {
    const kosong = barisSaldoBA(snap({}), INTRA)
    expect(Object.is(kosong.find(b => b.uraian === 'Akumulasi Penyusutan')!.nilai, 0)).toBe(true)
  })

  it('cakupan "semua" menjumlah intra + ekstra', () => {
    const dua: Snapshot = { '1.3.2': { intra: measures(100, 10), ekstra: measures(5, 1) } }
    expect(barisSaldoBA(dua, KOMPS_DARI.semua).find(b => b.uraian === 'Peralatan dan Mesin')!.nilai).toBe(105)
    expect(barisSaldoBA(dua, KOMPS_DARI.semua).find(b => b.uraian === 'Akumulasi Penyusutan')!.nilai).toBe(-11)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('tanggal & terbilang', () => {
  it('terbilang gaya Berita Acara', () => {
    expect(terbilang(1)).toBe('Satu')
    expect(terbilang(11)).toBe('Sebelas')
    expect(terbilang(12)).toBe('Dua Belas')
    expect(terbilang(20)).toBe('Dua Puluh')
    expect(terbilang(26)).toBe('Dua Puluh Enam')
    expect(terbilang(31)).toBe('Tiga Puluh Satu')
    expect(terbilang(2026)).toBe('Dua Ribu Dua Puluh Enam')
    expect(terbilang(2000)).toBe('Dua Ribu')
    expect(terbilang(0)).toBe('Nol')
  })

  it('hariDari tidak bergeser karena zona waktu', () => {
    // `new Date('2026-08-26')` = tengah malam UTC → di zona negatif jadi 25 Ags
    // (Selasa). Lembar bertanda tangan tak boleh bergeser harinya begitu.
    expect(hariDari('2026-08-26')).toBe('Rabu')
    expect(hariDari('2026-01-01')).toBe('Kamis')
    expect(hariDari('')).toBe('')
  })

  it('tglPanjang & kalimatTanggal', () => {
    expect(tglPanjang('2026-08-26')).toBe('26 Agustus 2026')
    expect(tglPanjang('')).toBe('')
    expect(kalimatTanggal('2026-08-26')).toEqual({
      hari: 'Rabu', tanggal: 'Dua Puluh Enam', bulan: 'Agustus', tahun: 'Dua Ribu Dua Puluh Enam',
    })
  })

  it('tanggalCutoff = akhir periode, bukan tanggal BA', () => {
    expect(tanggalCutoff('2026-S1')).toBe('30 Juni 2026')
    expect(tanggalCutoff('2026-S2')).toBe('31 Desember 2026')
  })

  it('namaBerkasBA membuang karakter yang ditolak dialog simpan Windows', () => {
    // Nama SKPD boleh memuat garis miring; kalau ikut, dialog "Save as PDF"
    // menolak nama berkasnya tanpa menjelaskan kenapa.
    expect(namaBerkasBA('Dinas A/B', '2026-S1')).toBe('Berita Acara Rekonsiliasi_Dinas A-B_2026-S1')
    expect(namaBerkasBA('', '2026-S2')).toBe('Berita Acara Rekonsiliasi_Kab Kediri_2026-S2')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('varian & pihak', () => {
  it('keempat varian punya peran, judul kolom, dan lingkup yang jelas', () => {
    expect(VARIAN_BA).toHaveLength(4)
    for (const v of VARIAN_BA) {
      expect(v.pertama.sebagai).not.toBe('')
      expect(v.kedua.sebagai).not.toBe('')
      expect(v.kolomNilai).toContain('(Rp)')
    }
    // Hanya rekonsiliasi Pengelola ↔ Akuntansi Pemda yang se-kabupaten.
    expect(VARIAN_BA.filter(v => !v.perSkpd).map(v => v.value)).toEqual(['pengelola_akuntansi_pemda'])
    expect(varianInfo('pembantu_pengguna').kolomNilai).toContain('Pengurus Barang Pembantu')
  })

  const pgw = (o: Partial<PegawaiBA> & { id: string }): PegawaiBA => ({
    nama: o.id, nip: null, pangkat: null, golongan: null, jabatan: null,
    role_bmd: null, skpd_id: null, ...o,
  })

  it('saranPihak mendahulukan pegawai di dalam lingkup SKPD', () => {
    const daftar = [
      pgw({ id: 'luar', role_bmd: 'pengurus_barang', skpd_id: 99 }),
      pgw({ id: 'dalam', role_bmd: 'pengurus_barang', skpd_id: 7 }),
    ]
    const peran = varianInfo('pengguna_pengelola').pertama
    expect(saranPihak(daftar, peran, new Set([7]))?.id).toBe('dalam')
    expect(saranPihak(daftar, peran, new Set([123]))?.id).toBe('luar') // tetap disarankan, tinggal diganti
  })

  it('peran tanpa padanan role_bmd TIDAK PERNAH disarankan', () => {
    // Pelaksana Fungsi Akuntansi tak ada di master pegawai — tebakan apa pun
    // di situ berarti mengarang nama di dokumen yang akan ditandatangani.
    const daftar = [pgw({ id: 'siapa saja', role_bmd: 'pengurus_barang' })]
    expect(saranPihak(daftar, varianInfo('pengguna_akuntansi_skpd').kedua, null)).toBeNull()
  })

  it('pangkatGol menggabung pangkat & golongan, aman saat salah satunya kosong', () => {
    expect(pangkatGol({ pangkat: 'Penata Tingkat I', golongan: 'III/d' })).toBe('Penata Tingkat I / III/d')
    expect(pangkatGol({ pangkat: null, golongan: 'III/d' })).toBe('III/d')
    expect(pangkatGol({ pangkat: null, golongan: null })).toBe('')
  })

  it('butirCatatan membuang baris kosong', () => {
    expect(butirCatatan(' satu \n\n dua \n')).toEqual(['satu', 'dua'])
    expect(butirCatatan('')).toEqual([])
  })
})

describe('KURANG_KEYS masih dipakai sebagai satu-satunya penentu arah', () => {
  it('semua kategori pengurang mendarat di kolom Kurang', () => {
    for (const k of KURANG_KEYS) {
      const sel = { [k]: 5 } as SelBA
      expect(totalTrxBA(sel)).toEqual({ tambah: 0, kurang: 5 })
    }
  })
})
