// Test paginate() & perPotongan() — REFACTOR-PLAN Fase 1.
//
// Yang diuji BUKAN "apakah ia mengembalikan baris", tapi apakah ia GAGAL di
// tiga tempat yang selama ini gagal DIAM-DIAM: error ditelan, urutan tak
// dijamin, dan kursor yang tak maju. Kalau salah satu assertion di bawah
// dilonggarkan, primitif ini kehilangan seluruh alasan keberadaannya.
import { describe, it, expect, vi } from 'vitest'
import { paginate, perPotongan, type HasilQuery } from './paginate'

type Baris = { id: number; nama: string }

/** Sumber palsu yang berperilaku seperti PostgREST ber-keyset yang BENAR. */
function sumber(total: number, size = 1000) {
  const semua: Baris[] = Array.from({ length: total }, (_, i) => ({ id: i + 1, nama: `b${i + 1}` }))
  return {
    semua,
    build: (kursor: number | null): PromiseLike<HasilQuery<Baris>> => {
      const mulai = kursor === null ? 0 : semua.findIndex(r => r.id === kursor) + 1
      return Promise.resolve({ data: semua.slice(mulai, mulai + size), error: null })
    },
  }
}

describe('paginate — jalur normal', () => {
  it('mengambil seluruh baris melewati batas satu halaman', async () => {
    const s = sumber(2_500, 1_000)

    const hasil = await paginate<number, Baris>('aset', s.build, { size: 1_000 })

    expect(hasil).toHaveLength(2_500)
    expect(hasil.map(r => r.id)).toEqual(s.semua.map(r => r.id))
  })

  it('berhenti tepat waktu kalau halaman terakhir belum penuh', async () => {
    const s = sumber(1_500, 1_000)
    const build = vi.fn(s.build)

    await paginate<number, Baris>('aset', build, { size: 1_000 })

    // 2 panggilan, bukan 3: halaman kedua (500 baris) sudah menandakan habis.
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('hasil kosong = array kosong, bukan error', async () => {
    const hasil = await paginate<number, Baris>('aset', () => Promise.resolve({ data: [], error: null }))

    expect(hasil).toEqual([])
  })

  it('memanggil build dengan kursor null di halaman pertama, lalu id terakhir', async () => {
    const s = sumber(2_000, 1_000)
    const build = vi.fn(s.build)

    await paginate<number, Baris>('aset', build, { size: 1_000 })

    expect(build.mock.calls[0][0]).toBeNull()
    expect(build.mock.calls[1][0]).toBe(1_000)
  })

  it('id string (uuid) tetap didukung', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const hasil = await paginate<string, { id: string }>(
      'aset',
      (k) => Promise.resolve({ data: k === null ? rows : [], error: null }),
      { size: 2 },
    )

    expect(hasil).toEqual(rows)
  })
})

describe('paginate — WAJIB gagal keras (rules.md §2.1 & §3)', () => {
  it('MELEMPAR saat error, tidak mengembalikan array kosong', async () => {
    // Inilah INS-06: set kosong terbaca "tak ada yang dibatalkan", kebalikan
    // dari kenyataan, dan tak satu pun halaman menampilkan pesan.
    await expect(
      paginate<number, Baris>('transaksi pembatalan', () =>
        Promise.resolve({ data: null, error: { message: 'statement timeout' } })),
    ).rejects.toThrow(/gagal membaca transaksi pembatalan: statement timeout/)
  })

  it('MELEMPAR kalau baris satu halaman tidak urut naik menurut id (ORDER BY hilang)', async () => {
    const acak = [{ id: 5, nama: 'e' }, { id: 2, nama: 'b' }, { id: 9, nama: 'i' }]

    await expect(
      paginate<number, Baris>('aset', () => Promise.resolve({ data: acak, error: null }), { size: 3 }),
    ).rejects.toThrow(/tidak urut naik menurut id/)
  })

  it('MELEMPAR kalau id kembar di satu halaman (urutan tidak total)', async () => {
    const kembar = [{ id: 1, nama: 'a' }, { id: 1, nama: 'a-lagi' }]

    await expect(
      paginate<number, Baris>('aset', () => Promise.resolve({ data: kembar, error: null }), { size: 2 }),
    ).rejects.toThrow(/tidak urut naik menurut id/)
  })

  it('MELEMPAR kalau kursor tidak maju (builder lupa .gt) alih-alih berputar selamanya', async () => {
    const macet = [{ id: 1, nama: 'a' }, { id: 2, nama: 'b' }]

    await expect(
      paginate<number, Baris>('aset', () => Promise.resolve({ data: macet, error: null }), { size: 2 }),
    ).rejects.toThrow(/kursor tidak maju/)
  })

  it('MELEMPAR kalau satu halaman melebihi size (builder lupa .limit)', async () => {
    const kebanyakan = [{ id: 1, nama: 'a' }, { id: 2, nama: 'b' }, { id: 3, nama: 'c' }]

    await expect(
      paginate<number, Baris>('aset', () => Promise.resolve({ data: kebanyakan, error: null }), { size: 2 }),
    ).rejects.toThrow(/lebih dari size=2/)
  })

  it('batas halaman mencegah loop tak berujung', async () => {
    // Sumber yang selalu memberi halaman penuh & id-nya terus naik: tanpa batas
    // ini, satu bug di sisi server bisa menggantung tab pengguna selamanya.
    let n = 0
    await expect(
      paginate<number, Baris>('aset',
        () => Promise.resolve({ data: [{ id: ++n, nama: 'x' }], error: null }),
        { size: 1, maksHalaman: 5 }),
    ).rejects.toThrow(/melewati 5 halaman/)
  })
})

describe('perPotongan', () => {
  it('memecah daftar id jadi beberapa panggilan & menggabung hasilnya', async () => {
    const build = vi.fn((p: number[]) =>
      Promise.resolve({ data: p.map(id => ({ id })), error: null }))

    const hasil = await perPotongan('status void', [1, 2, 3, 4, 5], build, { size: 2 })

    expect(build).toHaveBeenCalledTimes(3)
    expect(hasil.map(r => r.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('membuang duplikat sebelum bertanya', async () => {
    const build = vi.fn((p: number[]) => Promise.resolve({ data: p.map(id => ({ id })), error: null }))

    await perPotongan('status void', [7, 7, 7, 8], build, { size: 10 })

    expect(build).toHaveBeenCalledWith([7, 8])
  })

  it('daftar kosong = nol panggilan', async () => {
    const build = vi.fn(() => Promise.resolve({ data: [], error: null }))

    const hasil = await perPotongan('status void', [], build)

    expect(build).not.toHaveBeenCalled()
    expect(hasil).toEqual([])
  })

  it('MELEMPAR saat error', async () => {
    await expect(
      perPotongan('status void', [1], () =>
        Promise.resolve({ data: null, error: { message: 'timeout' } })),
    ).rejects.toThrow(/gagal membaca status void: timeout/)
  })
})
