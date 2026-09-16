// ============================================================================
// Mengunci pemuat daftar SKPD (./namaSkpd.ts).
//
// Ia menggantikan 22 loop `range(from, from + 999)` tulis-tangan. Yang dijaga
// di sini bukan pemetaan id→nama-nya (sepele), melainkan bahwa ia benar-benar
// LEWAT `paginate()` — karena di situlah ketiga penjaga yang tak dimiliki loop
// lama berada: urutan, kursor yang maju, dan `error` yang tak bisa ditelan.
// ============================================================================
import { describe, it, expect, vi } from 'vitest'
import { fetchDaftarSkpd, petaNamaSkpd, mapNamaSkpd, fetchPetaNamaSkpd, type SkpdRingkas } from './namaSkpd'

type Hal = { data: SkpdRingkas[] | null; error: { message: string } | null }

/** Klien palsu: mencatat kursor tiap halaman & membalas dari antrean. */
function klien(halaman: Hal[]) {
  const kursor: number[] = []
  const limit: number[] = []
  const urut: { kolom: string; naik: boolean }[] = []
  const tabel: string[] = []
  const kolom: string[] = []
  const db = {
    from: (t: string) => { tabel.push(t); return {
      select: (k: string) => { kolom.push(k); return {
        gt: (_k: string, v: number) => { kursor.push(v); return {
          order: (c: string, o: { ascending: boolean }) => { urut.push({ kolom: c, naik: o.ascending }); return {
            limit: async (n: number) => { limit.push(n); return halaman.shift() ?? { data: [], error: null } },
          } },
        } },
      } },
    } },
  }
  return { db, kursor, limit, urut, tabel, kolom }
}

const sk = (n: number, dari = 0): SkpdRingkas[] =>
  Array.from({ length: n }, (_, i) => ({ id: dari + i + 1, nama: `SKPD ${dari + i + 1}` }))

describe('fetchDaftarSkpd', () => {
  it('menarik satu halaman pendek lalu berhenti', async () => {
    const { db, kursor } = klien([{ data: sk(3), error: null }])
    expect(await fetchDaftarSkpd(db)).toHaveLength(3)
    expect(kursor).toEqual([0])   // halaman pertama mulai dari id 0
  })

  it('MENYUSUL halaman berikutnya lewat KURSOR, bukan offset', async () => {
    // Inti perbedaannya dari loop lama: halaman kedua diminta dgn
    // `.gt('id', idTerakhir)`, jadi biayanya rata di halaman ke berapa pun.
    const { db, kursor } = klien([
      { data: sk(1000), error: null },
      { data: sk(16, 1000), error: null },
    ])
    const hasil = await fetchDaftarSkpd(db)
    expect(hasil).toHaveLength(1016)
    expect(kursor).toEqual([0, 1000])
    expect(hasil[1015]).toEqual({ id: 1016, nama: 'SKPD 1016' })
  })

  it('halaman PENUH diikuti halaman kosong → berhenti tanpa mengarang baris', async () => {
    const { db } = klien([{ data: sk(1000), error: null }, { data: [], error: null }])
    expect(await fetchDaftarSkpd(db)).toHaveLength(1000)
  })

  it('mengurutkan menurut `id` NAIK — kolom yang sama dgn kursornya', async () => {
    // Kursornya `.gt('id', …)`, jadi urutan menurut kolom LAIN membuat
    // halaman berikutnya melewatkan baris yang belum terbaca — dan hasilnya
    // tetap "masuk akal", cuma kurang. `paginate` tak bisa menangkapnya
    // (ia cuma melihat id yang dikembalikan), jadi di sinilah tempatnya.
    const { db, urut } = klien([{ data: sk(2), error: null }])
    await fetchDaftarSkpd(db)
    expect(urut).toEqual([{ kolom: 'id', naik: true }])
  })

  it('membaca tabel & kolom yang benar', async () => {
    const { db, tabel, kolom } = klien([{ data: sk(1), error: null }])
    await fetchDaftarSkpd(db)
    expect(tabel).toEqual(['admin_skpd'])
    expect(kolom).toEqual(['id,nama'])
  })

  it('meminta 1.000 per halaman', async () => {
    const { db, limit } = klien([{ data: sk(2), error: null }])
    await fetchDaftarSkpd(db)
    expect(limit).toEqual([1000])
  })

  it('query GAGAL → MELEMPAR, bukan mengembalikan daftar kosong', async () => {
    // Inilah cacat yang dibawa ke-22 salinan lamanya: `data` null → loop
    // berhenti → peta kosong → kolom SKPD tampil "-" di tiap baris.
    const { db } = klien([{ data: null, error: { message: 'statement timeout' } }])
    await expect(fetchDaftarSkpd(db)).rejects.toThrow(/daftar SKPD.*statement timeout/)
  })

  it('gagal di halaman KEDUA tetap melempar — hasil separuh tak dikembalikan', async () => {
    const { db } = klien([
      { data: sk(1000), error: null },
      { data: null, error: { message: 'putus' } },
    ])
    await expect(fetchDaftarSkpd(db)).rejects.toThrow(/putus/)
  })

  it('hasil yang TIDAK URUT ditolak — penjaga `paginate`', async () => {
    // Loop `range()` lama tak bisa menangkap ini sama sekali: tanpa ORDER BY
    // hasilnya tetap "masuk akal", cuma ada baris yang hilang diam-diam.
    const { db } = klien([{ data: [{ id: 5, nama: 'B' }, { id: 2, nama: 'A' }], error: null }])
    await expect(fetchDaftarSkpd(db)).rejects.toThrow(/tidak urut naik/)
  })

  it('kursor yang TIDAK MAJU ditolak, bukan berputar selamanya', async () => {
    const { db } = klien([
      { data: sk(1000), error: null },
      { data: sk(1000), error: null },   // id-nya mengulang dari 1
    ])
    await expect(fetchDaftarSkpd(db)).rejects.toThrow(/tidak urut naik|kursor tidak maju/)
  })
})

describe('bentuk peta', () => {
  const rows = [{ id: 7, nama: 'Dinas A' }, { id: 8, nama: 'Dinas B' }]
  it('petaNamaSkpd → Record', () =>
    expect(petaNamaSkpd(rows)).toEqual({ 7: 'Dinas A', 8: 'Dinas B' }))
  it('mapNamaSkpd → Map', () => {
    const m = mapNamaSkpd(rows)
    expect(m.get(7)).toBe('Dinas A')
    expect(m.size).toBe(2)
  })
  it('daftar kosong → peta kosong, bukan meledak', () => {
    expect(petaNamaSkpd([])).toEqual({})
    expect(mapNamaSkpd([]).size).toBe(0)
  })
  it('fetchPetaNamaSkpd menggabung keduanya', async () => {
    const { db } = klien([{ data: rows, error: null }])
    expect(await fetchPetaNamaSkpd(db)).toEqual({ 7: 'Dinas A', 8: 'Dinas B' })
  })
})
