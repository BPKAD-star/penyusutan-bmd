// Kunci untuk `kodeRegisterPada` (lib/kodeRegisterRiwayat.ts).
//
// Fixture-nya BUKAN karangan: rantai empat baris di bawah disalin dari aset
// 808efb32-3e16-4e3e-b402-9018d8e0896e di produksi (dibaca 2026-09-13), termasuk
// baris `batal pengalihan` di tengahnya — justru kasus itu yang membuktikan
// kenapa modul ini TIDAK boleh menyaring pembatalan seperti `fetchReklasEvents`.
import { describe, it, expect } from 'vitest'
import { kodeRegisterPada, type RiwayatKodeReg, type KodeRegEv } from '@/lib/kodeRegisterRiwayat'

const ASET = 'a-1'
const buat = (evs: KodeRegEv[]): RiwayatKodeReg => new Map([[ASET, evs]])

// Ekor kode register dipendekkan biar terbaca; bentuk 45 digitnya tak relevan
// untuk aturan pemilihan baris.
const K0 = 'REG-semula'
const K1 = 'REG-pindah-1'
const K2 = 'REG-pindah-2'

describe('kodeRegisterPada — aturan dasar', () => {
  it('tak pernah pindah → kode terkini', () => {
    expect(kodeRegisterPada(new Map(), ASET, '2026-S1', K2)).toBe(K2)
  })

  it('riwayat kosong (array ada tapi hampa) → kode terkini', () => {
    expect(kodeRegisterPada(buat([]), ASET, '2026-S1', K2)).toBe(K2)
  })

  it('aset LAIN tak terpengaruh riwayat aset ini', () => {
    const r = buat([{ id: 1, periode: '2026-S1', kodeLama: K0, kodeBaru: K1 }])
    expect(kodeRegisterPada(r, 'aset-lain', '2026-S1', K2)).toBe(K2)
  })
})

describe('kodeRegisterPada — INTI: perpindahan tidak berlaku surut', () => {
  const r = buat([{ id: 10, periode: '2026-S2', kodeLama: K0, kodeBaru: K1 }])

  it('periode SEBELUM perpindahan → kode SEMULA, bukan kode terkini', () => {
    // Ini bug yang ditutup 2026-09-13: sebelumnya layar & Export 2026-S1
    // menampilkan K1 — kode yang pada periode itu BELUM TERBIT.
    expect(kodeRegisterPada(r, ASET, '2026-S1', K1)).toBe(K0)
  })

  it('periode PERPINDAHAN ITU SENDIRI → kode baru', () => {
    expect(kodeRegisterPada(r, ASET, '2026-S2', K1)).toBe(K1)
  })

  it('periode SESUDAHNYA → kode baru', () => {
    expect(kodeRegisterPada(r, ASET, '2027-S1', K1)).toBe(K1)
  })

  it('tahun jauh sebelumnya → kode semula', () => {
    expect(kodeRegisterPada(r, ASET, '2025-S1', K1)).toBe(K0)
  })
})

describe('kodeRegisterPada — beberapa perpindahan', () => {
  const r = buat([
    { id: 10, periode: '2026-S1', kodeLama: K0, kodeBaru: K1 },
    { id: 20, periode: '2026-S2', kodeLama: K1, kodeBaru: K2 },
  ])

  it('sebelum keduanya → kode semula', () => {
    expect(kodeRegisterPada(r, ASET, '2025-S2', K2)).toBe(K0)
  })

  it('di antara keduanya → hasil perpindahan PERTAMA', () => {
    expect(kodeRegisterPada(r, ASET, '2026-S1', K2)).toBe(K1)
  })

  it('sesudah keduanya → kode terkini', () => {
    expect(kodeRegisterPada(r, ASET, '2026-S2', K2)).toBe(K2)
  })

  it('urutan masukan TAK berpengaruh (yang menentukan periode & id)', () => {
    const terbalik = buat([
      { id: 20, periode: '2026-S2', kodeLama: K1, kodeBaru: K2 },
      { id: 10, periode: '2026-S1', kodeLama: K0, kodeBaru: K1 },
    ])
    expect(kodeRegisterPada(terbalik, ASET, '2026-S1', K2)).toBe(K1)
    expect(kodeRegisterPada(terbalik, ASET, '2025-S2', K2)).toBe(K0)
  })
})

describe('kodeRegisterPada — beberapa perpindahan DALAM SATU periode', () => {
  // Rantai NYATA dari produksi: 4 baris, semuanya 2026-S2, dgn pembatalan di
  // tengah. Kode register baris ke-n === kode_lama baris ke-n+1 (rantainya utuh).
  const A = 'REG-...0018' // kode semula
  const B = 'REG-...0001'
  const C = 'REG-...0006'
  const D = 'REG-...0003' // hasil `batal pengalihan`
  const E = 'REG-...0012' // kode terkini
  const r = buat([
    { id: 101, periode: '2026-S2', kodeLama: A, kodeBaru: B }, // pindah unit
    { id: 102, periode: '2026-S2', kodeLama: B, kodeBaru: C }, // pindah unit
    { id: 103, periode: '2026-S2', kodeLama: C, kodeBaru: D }, // BATAL pengalihan
    { id: 104, periode: '2026-S2', kodeLama: D, kodeBaru: E }, // pindah unit
  ])

  it('`id` TERTINGGI yang menang di dalam periode yang sama', () => {
    expect(kodeRegisterPada(r, ASET, '2026-S2', E)).toBe(E)
  })

  it('periode sebelumnya → kode semula, bukan salah satu kode di tengah rantai', () => {
    expect(kodeRegisterPada(r, ASET, '2026-S1', E)).toBe(A)
  })

  it('baris `batal pengalihan` TIDAK disaring — ia pemulihan, bukan penganulir', () => {
    // Kalau pembatalan diperlakukan seperti `batal_reklas` (dibuang beserta baris
    // yang dibatalkannya, pola `fetchReklasEvents`), jawaban untuk 2026-S2 akan
    // jatuh ke C — kode yang justru sudah dibatalkan. Ini yang menjaga keduanya
    // tak tertukar.
    const tanpaBatal = buat(r.get(ASET)!.filter(e => e.id !== 103))
    expect(kodeRegisterPada(tanpaBatal, ASET, '2026-S2', E)).toBe(E)
    // dan dgn pembatalannya ikut dibaca, hasilnya TETAP E — bukan C.
    expect(kodeRegisterPada(r, ASET, '2026-S2', E)).not.toBe(C)
  })
})

describe('kodeRegisterPada — penjaga barang belum berkode', () => {
  const r = buat([
    { id: 183, periode: '2026-S2', kodeLama: K0, kodeBaru: K1 },
    { id: 184, periode: '2026-S2', kodeLama: K1, kodeBaru: K2 },
  ])

  it('kodeKini null → tetap null, TIDAK diterbitkan dari riwayat', () => {
    // Kasus nyata: kontrak KDP yang dibuka kunci ("Rehab Gedung Kantor BKAD")
    // kembali `status='draft'` & `kode_register` di-NULL-kan, tapi kedua baris
    // riwayatnya tetap ada. Kembar dgn `CASE WHEN … IS NULL` di kedua RPC.
    expect(kodeRegisterPada(r, ASET, '2026-S2', null)).toBeNull()
    expect(kodeRegisterPada(r, ASET, '2026-S1', null)).toBeNull()
  })

  it('null tetap null walau aset tak punya riwayat sama sekali', () => {
    expect(kodeRegisterPada(new Map(), ASET, '2026-S1', null)).toBeNull()
  })
})

describe('kodeRegisterPada — baris warisan tanpa kode_lama', () => {
  it('semua perpindahan sesudah periode & kode_lama null → jatuh ke kode terkini', () => {
    const r = buat([{ id: 10, periode: '2026-S2', kodeLama: null, kodeBaru: K1 }])
    // Bukan string kosong: kolom identitas yang hilang tanpa jejak lebih buruk
    // daripada kode yang diakui sbg posisi terkini.
    expect(kodeRegisterPada(r, ASET, '2026-S1', K1)).toBe(K1)
  })

  it('kode_lama null di baris paling awal, tapi ada baris lain yang berlaku', () => {
    const r = buat([
      { id: 10, periode: '2026-S1', kodeLama: null, kodeBaru: K1 },
      { id: 20, periode: '2026-S2', kodeLama: K1, kodeBaru: K2 },
    ])
    expect(kodeRegisterPada(r, ASET, '2026-S1', K2)).toBe(K1)
  })
})
