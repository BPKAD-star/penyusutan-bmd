import { describe, it, expect } from 'vitest'
import {
  ambilSemuaKeyset, halamanDuaCabang, pastikanAman, tandaKursorKode, adaTimeout,
  type CabangKeyset, type KursorKode,
} from './keyset'

// Yang diuji di sini BUKAN kecepatan — itu urusan pengukuran ke DB — melainkan
// KEUTUHAN: berkas Excel yang kekurangan satu baris tak punya satu pun tanda
// bahwa isinya kurang, dan berkas itulah yang dikirim ke inspektorat/BPK.
//
// Caranya: sebuah tabel tiruan di memori dilayani PERSIS seperti Postgres
// melayani kedua cabang kursor, lalu hasil penelusuran penuh dibandingkan
// dengan urutan yang seharusnya. Kalau logika sambung-halaman meleset satu
// baris pun, `toEqual` di bawah yang menangkapnya.

type Baris = { kode: string; nilai: string; seri: string }

const banding = (a: Baris, b: Baris) =>
  a.kode !== b.kode ? (a.kode < b.kode ? -1 : 1)
    : Number(b.nilai) !== Number(a.nilai) ? Number(b.nilai) - Number(a.nilai)
      : (a.seri < b.seri ? -1 : a.seri > b.seri ? 1 : 0)

// Tabel tiruan yang sengaja memuat tiga bentuk yang paling sering bikin
// paginasi meleset: satu kode dgn SANGAT banyak baris (di produksi ada kode
// berisi 112.421 baris), banyak baris ber-(kode, nilai) KEMBAR yang cuma bisa
// dipisah kolom seri, dan kode-kode kecil di sekitarnya.
function tabelUji(): Baris[] {
  const rs: Baris[] = []
  for (let i = 0; i < 7; i++) rs.push({ kode: '1.3.2.001', nilai: String(900 - i * 10), seri: `a${String(i).padStart(3, '0')}` })
  // 250 baris satu kode, dgn nilai yang banyak kembarnya (cuma 5 nilai berbeda)
  for (let i = 0; i < 250; i++) rs.push({ kode: '1.3.2.002', nilai: String(500 - (i % 5) * 10), seri: `b${String(i).padStart(3, '0')}` })
  // satu kode berisi satu baris — batas cabang yang paling gampang terlewat
  rs.push({ kode: '1.3.2.003', nilai: '77', seri: 'c000' })
  for (let i = 0; i < 40; i++) rs.push({ kode: '1.3.5.010', nilai: String(1000 + i), seri: `d${String(i).padStart(3, '0')}` })
  // nilai berdesimal panjang: yang di produksi bikin kursor float meleset
  rs.push({ kode: '1.3.5.010', nilai: '1427689804.3600001', seri: 'e000' })
  rs.push({ kode: '1.3.5.010', nilai: '1427689804.36', seri: 'e001' })
  return rs
}

const urutBenar = (rs: Baris[]) => [...rs].sort(banding)

// Melayani kedua cabang persis seperti SQL-nya: 'sisa' = baris pada kode kursor
// yang urutannya sesudah kursor; 'lanjut' = kode berikutnya. Keduanya ber-LIMIT.
function pelayan(rs: Baris[], catat?: { n: number }) {
  return async (c: CabangKeyset): Promise<Baris[]> => {
    if (catat) catat.n++
    const urut = urutBenar(rs)
    if (c.jenis === 'sisa') {
      const k = c.kursor
      return urut.filter(r => r.kode === k.kode
        && (Number(r.nilai) < Number(k.nilai)
          || (Number(r.nilai) === Number(k.nilai) && r.seri > k.seri))).slice(0, c.batas)
    }
    return urut.filter(r => c.setelahKode === null || r.kode > c.setelahKode).slice(0, c.batas)
  }
}

const opsi = (rs: Baris[], batas: number, extra = {}) => ({
  halaman: halamanDuaCabang<Baris>(pelayan(rs)),
  kursor: (r: Baris): KursorKode => r,
  tanda: tandaKursorKode,
  batas,
  batasMin: 1,
  ...extra,
})

describe('ambilSemuaKeyset — keutuhan hasil', () => {
  const rs = tabelUji()

  // Ukuran halaman disengaja beragam: yang lebih kecil dari satu kode, yang
  // persis membagi habis, yang ganjil, dan yang lebih besar dari seluruh tabel.
  for (const batas of [1, 2, 3, 7, 10, 64, 100, 257, 298, 1000]) {
    it(`menarik SEMUA baris, urut benar, tanpa dobel (halaman ${batas})`, async () => {
      const hasil = await ambilSemuaKeyset<Baris, KursorKode>(opsi(rs, batas))
      expect(hasil).toEqual(urutBenar(rs))
      expect(new Set(hasil.map(r => r.seri)).size).toBe(rs.length)
    })
  }

  it('tabel kosong → hasil kosong, bukan menggantung', async () => {
    expect(await ambilSemuaKeyset<Baris, KursorKode>(opsi([], 10))).toEqual([])
  })

  it('nilai berdesimal panjang tetap utuh — kursornya string, bukan float', async () => {
    const hasil = await ambilSemuaKeyset<Baris, KursorKode>(opsi(rs, 3))
    // Dua baris ini beda cuma di digit ke-17; kalau kursornya sempat lewat
    // float64 salah satunya hilang.
    expect(hasil.filter(r => r.nilai.startsWith('1427689804')).map(r => r.seri)).toEqual(['e000', 'e001'])
  })

  it('cabang "lanjut" hanya diminta kalau halaman belum penuh', async () => {
    // 250 baris di satu kode, halaman 50 → 5 halaman penuh dari cabang 'sisa'
    // saja. Kalau tiap halaman selalu menembak dua cabang, jumlah permintaannya
    // jauh lebih besar dan export golongan besar jadi dua kali lipat lamanya.
    const hanya = rs.filter(r => r.kode === '1.3.2.002')
    const catat = { n: 0 }
    const hasil = await ambilSemuaKeyset<Baris, KursorKode>({
      halaman: halamanDuaCabang<Baris>(pelayan(hanya, catat)),
      kursor: (r: Baris): KursorKode => r, tanda: tandaKursorKode, batas: 50, batasMin: 1,
    })
    expect(hasil).toEqual(urutBenar(hanya))
    // 5 halaman penuh (1 permintaan tiap halaman) + halaman ke-6 yang menutup
    // (2 permintaan: sisa kosong lalu lanjut kosong).
    expect(catat.n).toBe(7)
  })
})

describe('ambilSemuaKeyset — gagal keras, bukan diam-diam kurang', () => {
  it('kursor yang tidak maju dihentikan, bukan berputar selamanya', async () => {
    // Pelayan rusak: selalu mengembalikan baris yang sama.
    const macet = async (): Promise<Baris[]> => [{ kode: 'x', nilai: '1', seri: 's' }]
    await expect(ambilSemuaKeyset<Baris, KursorKode>({
      halaman: macet, kursor: r => r, tanda: tandaKursorKode, batas: 10,
    })).rejects.toThrow(/kursor tidak maju/)
  })

  it('melewati batas wajar dihentikan, bukan menghabiskan memori peramban', async () => {
    let i = 0
    const tanpaHenti = async (): Promise<Baris[]> =>
      [{ kode: 'x', nilai: '1', seri: `s${i++}` }]
    await expect(ambilSemuaKeyset<Baris, KursorKode>({
      halaman: tanpaHenti, kursor: r => r, tanda: tandaKursorKode, batas: 1, maksBaris: 20,
    })).rejects.toThrow(/melebihi batas wajar/)
  })

  it('timeout → halaman DIPERKECIL lalu diulang, dan hasilnya tetap utuh', async () => {
    const rs = tabelUji()
    const dasar = pelayan(rs)
    const dipakai: number[] = []
    const halaman = halamanDuaCabang<Baris>(async c => {
      dipakai.push(c.batas)
      // Tolak apa pun yang mintanya besar — meniru cache dingin.
      if (c.batas > 40) throw new Error('canceling statement due to statement timeout')
      return dasar(c)
    })
    const hasil = await ambilSemuaKeyset<Baris, KursorKode>({
      halaman, kursor: r => r, tanda: tandaKursorKode, batas: 320, batasMin: 20,
    })
    expect(hasil).toEqual(urutBenar(rs))
    expect(Math.min(...dipakai)).toBeLessThanOrEqual(40)
  })

  it('kegagalan yang BUKAN timeout dilempar apa adanya', async () => {
    const halaman = async (): Promise<Baris[]> => { throw new Error('permission denied for table aset') }
    await expect(ambilSemuaKeyset<Baris, KursorKode>({
      halaman, kursor: (r: Baris) => r, tanda: tandaKursorKode, batas: 100,
    })).rejects.toThrow(/permission denied/)
  })

  it('timeout yang tak bisa diperkecil lagi tetap dilempar', async () => {
    const halaman = async (): Promise<Baris[]> => { throw new Error('canceling statement due to statement timeout') }
    await expect(ambilSemuaKeyset<Baris, KursorKode>({
      halaman, kursor: (r: Baris) => r, tanda: tandaKursorKode, batas: 100, batasMin: 100,
    })).rejects.toThrow(/statement timeout/)
  })
})

describe('pastikanAman', () => {
  // Nilai kursor ikut dirakit jadi string `or=(...)` PostgREST. Satu koma yang
  // lolos ke situ memecah pohon logikanya di tengah jalan & PostgREST menolak
  // SELURUH filter — pelajaran yang sama dgn kotak Cari di halaman ini.
  it('menerima angka, desimal, NIBAR, dan UUID', () => {
    expect(() => pastikanAman('1427689804.3600001', '120135060100000019001020181320502010340000027')).not.toThrow()
    expect(() => pastikanAman('-5', 'b1da660a-d6e4-447a-9148-ec0bfc696f6f')).not.toThrow()
  })
  it('menolak koma, kurung, dan spasi', () => {
    expect(() => pastikanAman('1,000', 'a')).toThrow(/tidak layak/)
    expect(() => pastikanAman('1', 'a)b')).toThrow(/tidak layak/)
    expect(() => pastikanAman('1', 'a b')).toThrow(/tidak layak/)
  })
  it('dipanggil dari halamanDuaCabang, jadi tak bisa kelupaan di pemanggil', async () => {
    const halaman = halamanDuaCabang<Baris>(async () => [])
    await expect(halaman({ kode: 'k', nilai: '1,5', seri: 'a' }, 10)).rejects.toThrow(/tidak layak/)
  })
})

describe('adaTimeout', () => {
  it('mengenali pesan statement timeout & kode 57014', () => {
    expect(adaTimeout(new Error('canceling statement due to statement timeout'))).toBe(true)
    expect(adaTimeout(new Error('57014'))).toBe(true)
    expect(adaTimeout(new Error('permission denied'))).toBe(false)
  })
})
