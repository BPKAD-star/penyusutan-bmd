// ============================================================================
// Mengunci aritmetika uang Pemecahan Barang (lib/pemecahanNilai.ts).
//
// Sampai 2026-09-15 logika ini hidup di dalam `KoreksiForm` — komponen React
// 1.431 baris / 46 `useState` — TANPA satu pun test, padahal angkanya masuk
// ledger & ikut ke neraca. Yang dijaga di sini dua invarian yang pelanggarannya
// TIDAK menghasilkan error apa pun:
//
//   (1) Σ pecahan == induk, EKSAK (nilai perolehan, nilai buku, akumulasi)
//   (2) sisa pembulatan diserap pecahan TERAKHIR
//
// ⚠️ Seluruh perbandingan dalam SEN. Membandingkan rupiah (float) adalah cacat
// yang dulu meloloskan Rp0,47 tercipta di ledger — lihat uji "insiden nyata".
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  keSen, alokasiPemecahan, balancePemecahan, semuaPecahanValid,
  type BasisPemecahan, type PecahanInput,
} from './pemecahanNilai'

const basis = (nb: number, ak: number, sisa = 10): BasisPemecahan =>
  ({ nilai_buku: nb, akumulasi: ak, sisa_smt: sisa })
const pecah = (...nilai: (string | number)[]): PecahanInput[] =>
  nilai.map(n => ({ jumlah: '1', nilai: String(n) }))

/** Σ dalam SEN — cara membandingkan yang benar. */
const sumSen = (xs: number[]) => xs.reduce((s, x) => s + keSen(x), 0)

describe('keSen', () => {
  it('rupiah berdesimal → sen bulat', () => {
    expect(keSen(104893870444.53)).toBe(10489387044453)
    expect(keSen(0.1 + 0.2)).toBe(30)       // float 0.30000000000000004
  })
  it('nilai tak terbaca → 0, bukan NaN', () => {
    expect(keSen(NaN)).toBe(0)
    expect(keSen(undefined as unknown as number)).toBe(0)
  })
})

describe('(1) Σ pecahan == induk, EKSAK', () => {
  it('pembagian yang tak habis dibagi tetap menutup rapat', () => {
    // 1.000.000 dibagi 3 → proporsi 1/3 yang mustahil bulat.
    const a = alokasiPemecahan(1_000_000, basis(700_000, 300_000), pecah(333_333.33, 333_333.33, 333_333.34))
    expect(sumSen(a.map(x => x.nb))).toBe(keSen(700_000))
    expect(sumSen(a.map(x => x.ak))).toBe(keSen(300_000))
    expect(balancePemecahan(1_000_000, a)).toBe(true)
  })

  it('proporsi sangat timpang (99,99% : 0,01%) tetap eksak', () => {
    const a = alokasiPemecahan(1_000_000, basis(333_333.33, 666_666.67), pecah(999_900, 100))
    expect(sumSen(a.map(x => x.nb))).toBe(keSen(333_333.33))
    expect(sumSen(a.map(x => x.ak))).toBe(keSen(666_666.67))
  })

  it('tujuh pecahan — sisa tetap tak menguap', () => {
    const a = alokasiPemecahan(700_000.07, basis(123_456.78, 87_654.32), pecah(100_000.01, 100_000.01, 100_000.01, 100_000.01, 100_000.01, 100_000.01, 100_000.01))
    expect(a).toHaveLength(7)
    expect(sumSen(a.map(x => x.nb))).toBe(keSen(123_456.78))
    expect(sumSen(a.map(x => x.ak))).toBe(keSen(87_654.32))
  })

  it('INSIDEN NYATA 2026-09-14: induk 104.893.870.444,53 — Rp0,47 tak boleh tercipta', () => {
    // Versi lama membulatkan ke RUPIAH, jadi induk dianggap …445 & Σ pecahan
    // meleset Rp0,47 dari baris `pemecahan_keluar`-nya sendiri.
    const induk = 104_893_870_444.53
    const a = alokasiPemecahan(induk, basis(50_000_000_000.11, 54_893_870_444.42), pecah(52_446_935_222.26, 52_446_935_222.27))
    expect(balancePemecahan(induk, a)).toBe(true)
    expect(sumSen(a.map(x => x.np))).toBe(10489387044453)
    expect(sumSen(a.map(x => x.nb))).toBe(keSen(50_000_000_000.11))
    expect(sumSen(a.map(x => x.ak))).toBe(keSen(54_893_870_444.42))
  })
})

describe('(2) sisa pembulatan diserap pecahan TERAKHIR', () => {
  it('yang menanggung selisih adalah baris terakhir, bukan yang pertama', () => {
    const a = alokasiPemecahan(1_000_000, basis(1_000_000, 0), pecah(333_333.33, 333_333.33, 333_333.34))
    // Dua pertama hasil pembulatan proporsional, terakhir = sisanya.
    const dibulatkan = keSen(a[0].nb) + keSen(a[1].nb)
    expect(keSen(a[2].nb)).toBe(keSen(1_000_000) - dibulatkan)
  })
  it('satu pecahan saja → menerima SELURUH basis', () => {
    const a = alokasiPemecahan(500_000, basis(400_000.55, 99_999.45), pecah(500_000))
    expect(keSen(a[0].nb)).toBe(keSen(400_000.55))
    expect(keSen(a[0].ak)).toBe(keSen(99_999.45))
  })
})

describe('beban per semester', () => {
  it('nilai buku ÷ sisa semester, dibulatkan ke rupiah', () => {
    const a = alokasiPemecahan(100, basis(1_000, 0, 4), pecah(100))
    expect(a[0].beban).toBe(250)
  })
  it('sisa semester 0 → beban 0, bukan Infinity', () => {
    const a = alokasiPemecahan(100, basis(1_000, 0, 0), pecah(100))
    expect(a[0].beban).toBe(0)
    expect(Number.isFinite(a[0].beban)).toBe(true)
  })
})

describe('kesahan isian', () => {
  it('nilai 0 / kosong / bukan angka → tidak valid', () => {
    const a = alokasiPemecahan(100, basis(100, 0), [
      { jumlah: '1', nilai: '0' }, { jumlah: '1', nilai: '' }, { jumlah: '1', nilai: 'abc' },
    ])
    expect(a.map(x => x.valid)).toEqual([false, false, false])
  })
  it('jumlah < 1 atau bukan angka → tidak valid', () => {
    const a = alokasiPemecahan(100, basis(100, 0), [
      { jumlah: '0', nilai: '50' }, { jumlah: 'x', nilai: '50' },
    ])
    expect(a.map(x => x.valid)).toEqual([false, false])
  })
  it('semuaPecahanValid: WAJIB minimal dua pecahan', () => {
    const satu = alokasiPemecahan(100, basis(100, 0), pecah(100))
    expect(satu[0].valid).toBe(true)
    expect(semuaPecahanValid(satu)).toBe(false)       // sah isiannya, tapi cuma satu
    expect(semuaPecahanValid(alokasiPemecahan(100, basis(100, 0), pecah(50, 50)))).toBe(true)
  })
})

describe('induk / basis belum termuat', () => {
  it('→ daftar KOSONG, sengaja dibedakan dari "hasilnya nol"', () => {
    expect(alokasiPemecahan(null, basis(1, 1), pecah(1, 1))).toEqual([])
    expect(alokasiPemecahan(100, null, pecah(1, 1))).toEqual([])
  })
  it('balance atas induk yang belum termuat → false, bukan true', () => {
    expect(balancePemecahan(null, [])).toBe(false)
  })
})

describe('balance dibandingkan dalam SEN, bukan rupiah', () => {
  it('Σ meleset satu sen → DITOLAK', () => {
    const a = alokasiPemecahan(1_000, basis(1_000, 0), pecah(500, 499.99))
    expect(balancePemecahan(1_000, a)).toBe(false)
  })
  it('Σ pas → diterima', () => {
    const a = alokasiPemecahan(1_000, basis(1_000, 0), pecah(500, 500))
    expect(balancePemecahan(1_000, a)).toBe(true)
  })

  // ⚠️ INI yang membedakan perbandingan SEN dari perbandingan rupiah, dan
  // nilainya NYATA: `1427689804.3600001` benar-benar ada di produksi (Jalan
  // JAMBEAN - PURWODADI, tercatat di CLAUDE.md sbg satu-satunya baris yang tak
  // selamat saat kursor Export membawa angka lewat JavaScript).
  //
  // Induknya ber-noise float; pecahannya dijumlah sbg bilangan bulat sen.
  //   · dalam SEN   : 142768980436 === 142768980436              → SEIMBANG ✓
  //   · dalam rupiah: 1427689804.36 !== 1427689804.3600001       → DITOLAK ✗
  // Versi rupiah menolak pemecahan yang SAH & operator tak punya cara tahu
  // kenapa — tombol Simpan mati dengan pesan "selisih Rp0,00".
  it('induk ber-noise float tetap SEIMBANG — bukti perbandingannya dalam sen', () => {
    const induk = 1427689804.3600001
    const a = alokasiPemecahan(induk, basis(1_000_000_000, 427_689_804.36), pecah(713_844_902.18, 713_844_902.18))
    expect(keSen(induk)).toBe(142768980436)
    expect(sumSen(a.map(x => x.np))).toBe(keSen(induk))
    expect(balancePemecahan(induk, a)).toBe(true)
    // Bukti bahwa jalur rupiah MEMANG berbeda di sini (kalau tidak, uji ini tak
    // membedakan apa pun dan mutasinya akan lolos):
    expect(sumSen(a.map(x => x.np)) / 100).not.toBe(induk)
  })
})

describe('nilai tak terhingga: guard `Number.isFinite` MENAHAN Infinity', () => {
  // ⚠️ `keSen` TIDAK selalu mengembalikan bilangan terhingga, dan itu gampang
  // disalah-sangka: `Number(n) || 0` memang menjinakkan NaN (`parseFloat('')`,
  // `parseFloat('abc')` → 0), tapi Infinity LOLOS — `Number(Infinity) || 0`
  // tetap Infinity. Jadi guard `Number.isFinite(npSen)` BUKAN kode mati.
  //
  // Jalannya lewat UI: `NominalInput` menyaring ke [0-9] saja, jadi 'Infinity'
  // & '1e999' mustahil masuk state — TAPI deretan angka yang cukup panjang
  // (±309 digit, mis. hasil tempel) melampaui Number.MAX_VALUE dan `parseFloat`
  // mengembalikan Infinity. Tanpa guard, `prop` jadi Infinity lalu nilai buku &
  // akumulasi pecahan jadi Infinity/NaN — angka yang MASUK KE LEDGER.
  const taktuhingga = '9'.repeat(400)

  it('parseFloat atas deretan 400 angka MEMANG Infinity (premis uji ini)', () => {
    expect(Number.isFinite(parseFloat(taktuhingga))).toBe(false)
    expect(Number.isFinite(keSen(parseFloat(taktuhingga)))).toBe(false)
  })

  it('pecahan ber-nilai tak terhingga → TIDAK sah, dan np-nya 0 bukan Infinity', () => {
    const a = alokasiPemecahan(1_000_000, basis(600_000, 400_000), pecah(taktuhingga, 500_000))
    expect(a[0].valid).toBe(false)
    expect(a[0].np).toBe(0)
    expect(Number.isFinite(a[0].np)).toBe(true)
    expect(semuaPecahanValid(a)).toBe(false)
  })

  it('nilai buku & akumulasi TETAP terhingga — Infinity tak menular ke ledger', () => {
    const a = alokasiPemecahan(1_000_000, basis(600_000, 400_000), pecah(taktuhingga, 500_000))
    for (const p of a) {
      expect(Number.isFinite(p.nb)).toBe(true)
      expect(Number.isFinite(p.ak)).toBe(true)
      expect(Number.isFinite(p.beban)).toBe(true)
    }
    // Invarian (1) tetap berlaku: pecahan TERAKHIR menyerap sisanya, jadi Σ nilai
    // buku & akumulasi tetap sama dengan basis induk walau satu barisnya cacat.
    expect(sumSen(a.map(p => p.nb))).toBe(keSen(600_000))
    expect(sumSen(a.map(p => p.ak))).toBe(keSen(400_000))
  })
})
