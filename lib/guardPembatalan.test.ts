// Uji guard pembatalan (rules.md §1.3).
//
// Kenapa diuji: ini SATU-SATUNYA penjaga aturan "batal hanya sah untuk event
// TERBARU" — tak ada trigger DB yang menegakkannya. Kalau ia lolos padahal
// seharusnya memblokir, yang rusak adalah rantai replay engine, dan rusaknya
// tak bersuara: tak ada error, cuma angka penyusutan yang salah.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cekBolehBatal, cekBolehSisip, type ItemBatal } from '@/lib/guardPembatalan'

type Jawaban = { data: { id: number }[] } | { error: { message: string } }

/**
 * Klien tiruan sekadar cukup untuk rantai `.from().select().eq().gt().limit()`.
 * `jawab` menerima (aset_id, trx_id) dan mengembalikan baris ledger yang lebih
 * baru — atau bentuk error ala supabase-js.
 */
function fakeClient(jawab: (asetId: string, trxId: number) => Jawaban): { client: SupabaseClient } {
  const client = {
    from() {
      let asetId = ''
      let trxId = 0
      const q = {
        select: () => q,
        eq: (_k: string, v: string) => { asetId = v; return q },
        gt: (_k: string, v: number) => { trxId = v; return q },
        limit: () => {
          const r = jawab(asetId, trxId)
          return Promise.resolve('error' in r ? { data: null, error: r.error } : { data: r.data, error: null })
        },
      }
      return q
    },
  } as unknown as SupabaseClient
  return { client }
}

const item = (aset_id: string, trx_id: number, label?: string): ItemBatal => ({ aset_id, trx_id, label })

describe('cekBolehBatal — jalur normal', () => {
  it('tak ada transaksi lebih baru → boleh', async () => {
    const { client } = fakeClient(() => ({ data: [] }))
    expect(await cekBolehBatal(client, [item('A', 100)], 'reklas ini')).toEqual({ boleh: true })
  })

  it('ada transaksi lebih baru → diblokir, pesannya menyebut barangnya', async () => {
    const { client } = fakeClient(() => ({ data: [{ id: 101 }] }))
    const h = await cekBolehBatal(client, [item('A', 100, 'Mobil Dinas')], 'reklas ini')
    expect(h.boleh).toBe(false)
    if (h.boleh) return
    expect(h.pesan).toContain('Mobil Dinas')
    expect(h.pesan).toContain('reklas ini')
  })

  it('daftar kosong → boleh (pemanggil yang memutuskan artinya)', async () => {
    const { client } = fakeClient(() => ({ data: [] }))
    expect(await cekBolehBatal(client, [], 'kapitalisasi ini')).toEqual({ boleh: true })
  })

  it('SATU pelanggar di antara banyak sudah cukup memblokir semuanya', async () => {
    // Membatalkan separuh rantai justru keadaan yang mau dicegah.
    const { client } = fakeClient(a => (a === 'B' ? { data: [{ id: 9 }] } : { data: [] }))
    const h = await cekBolehBatal(client, [item('A', 1), item('B', 2, 'Laptop'), item('C', 3)], 'koreksi ini')
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.pesan).toContain('Laptop')
  })

  it('perbandingannya "id LEBIH BESAR", bukan lebih besar-sama-dengan', async () => {
    // Baris yang DIBATALKAN itu sendiri tak boleh terhitung sbg "lebih baru",
    // kalau tidak tak ada satu pun pembatalan yang pernah bisa dijalankan.
    const { client } = fakeClient((_a, trxId) => ({ data: [{ id: trxId }].filter(r => r.id > trxId) }))
    expect(await cekBolehBatal(client, [item('A', 100)], 'penghapusan ini')).toEqual({ boleh: true })
  })
})

describe('cekBolehBatal — FAIL-CLOSED saat query gagal', () => {
  // Ini perbedaan yang disengaja dari kode lama: `const { count } = await …`
  // lalu `(count || 0) > 0` membuat query gagal LOLOS dari guard.
  it('query error → TIDAK boleh, bukan diam-diam lolos', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'canceling statement due to statement timeout' } }))
    const h = await cekBolehBatal(client, [item('A', 100, 'Gedung')], 'reklas ini')
    expect(h.boleh).toBe(false)
    if (h.boleh) return
    expect(h.pesan).toContain('gagal memeriksa')
    expect(h.pesan).toContain('statement timeout')  // sebabnya ikut, bukan ditelan
  })

  it('gagal di item KEDUA tetap membatalkan seluruh operasi', async () => {
    const { client } = fakeClient(a => (a === 'B' ? { error: { message: 'boom' } } : { data: [] }))
    const h = await cekBolehBatal(client, [item('A', 1), item('B', 2)], 'kapitalisasi ini')
    expect(h.boleh).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// cekBolehSisip — arah MAJU: jangan mencatat event bertanggal MUNDUR ke aset
// yang sudah punya peristiwa sesudah tanggal itu. Engine mengurutkan replay by
// periode → tanggal → created_at (BUKAN by id), jadi baris baru bertanggal tua
// diproses SEBELUM peristiwa yang sudah ada — rantainya berubah tanpa satu pun
// baris lama disentuh & tanpa satu pun error.
type JawabSisip = { data: { jenis: string; tanggal: string }[] } | { error: { message: string } }

/** Tiruan rantai `.from().select().eq().neq().gt().order().limit()`. */
function fakeSisip(jawab: (asetId: string, tanggal: string, kecuali: string) => JawabSisip): SupabaseClient {
  return {
    from() {
      let asetId = ''
      let tanggal = ''
      let kecuali = ''
      const q = {
        select: () => q,
        eq: (_k: string, v: string) => { asetId = v; return q },
        neq: (_k: string, v: string) => { kecuali = v; return q },
        gt: (_k: string, v: string) => { tanggal = v; return q },
        order: () => q,
        limit: () => {
          const r = jawab(asetId, tanggal, kecuali)
          return Promise.resolve('error' in r ? { data: null, error: r.error } : { data: r.data, error: null })
        },
      }
      return q
    },
  } as unknown as SupabaseClient
}

describe('cekBolehSisip', () => {
  it('tak ada transaksi bertanggal lebih baru → boleh', async () => {
    const c = fakeSisip(() => ({ data: [] }))
    expect(await cekBolehSisip(c, [{ aset_id: 'A' }], '2026-08-27', 'tanggal dokumen')).toEqual({ boleh: true })
  })

  it('ada yang lebih baru → diblokir, pesannya menyebut barang, jenis & tanggalnya', async () => {
    const c = fakeSisip(() => ({ data: [{ jenis: 'reklas_golongan', tanggal: '2026-09-10' }] }))
    const h = await cekBolehSisip(c, [{ aset_id: 'A', label: 'Gedung Kantor' }], '2026-08-27', 'tanggal dokumen')
    expect(h.boleh).toBe(false)
    if (h.boleh) return
    expect(h.pesan).toContain('Gedung Kantor')
    expect(h.pesan).toContain('reklas_golongan')
    expect(h.pesan).toContain('2026-09-10')
    expect(h.pesan).toContain('2026-08-27')
  })

  it('SATU pelanggar di antara banyak sudah cukup memblokir', async () => {
    const c = fakeSisip(a => (a === 'B' ? { data: [{ jenis: 'penghapusan_sebab_lain', tanggal: '2026-12-01' }] } : { data: [] }))
    const h = await cekBolehSisip(c, [{ aset_id: 'A' }, { aset_id: 'B', label: 'Laptop' }, { aset_id: 'C' }], '2026-08-27', 'tanggal dokumen')
    expect(h.boleh).toBe(false)
    if (!h.boleh) expect(h.pesan).toContain('Laptop')
  })

  it('`batal_kapitalisasi` DIKECUALIKAN — alur Ubah tak diblokir pembatalannya sendiri', async () => {
    // Kalau pengecualian ini dicabut, "✎ Ubah" mustahil menyimpan: reversal yang
    // baru saja ditulisnya sendiri akan terbaca sebagai "transaksi lebih baru".
    let terkecuali = ''
    const c = fakeSisip((_a, _t, kecuali) => { terkecuali = kecuali; return { data: [] } })
    await cekBolehSisip(c, [{ aset_id: 'A' }], '2026-08-27', 'tanggal dokumen')
    expect(terkecuali).toBe('batal_kapitalisasi')
  })

  it('FAIL-CLOSED: query gagal → TIDAK boleh, sebabnya ikut disebut', async () => {
    const c = fakeSisip(() => ({ error: { message: 'canceling statement due to statement timeout' } }))
    const h = await cekBolehSisip(c, [{ aset_id: 'A', label: 'Gedung' }], '2026-08-27', 'tanggal dokumen')
    expect(h.boleh).toBe(false)
    if (h.boleh) return
    expect(h.pesan).toContain('gagal memeriksa')
    expect(h.pesan).toContain('statement timeout')
  })

  it('daftar kosong → boleh', async () => {
    const c = fakeSisip(() => ({ data: [] }))
    expect(await cekBolehSisip(c, [], '2026-08-27', 'tanggal dokumen')).toEqual({ boleh: true })
  })

  it('label kosong jatuh ke aset_id, bukan "undefined"', async () => {
    const c = fakeSisip(() => ({ data: [{ jenis: 'kapitalisasi', tanggal: '2026-09-01' }] }))
    for (const label of [undefined, null, '   ']) {
      const h = await cekBolehSisip(c, [{ aset_id: 'aset-xyz', label }], '2026-08-27', 'ini')
      if (!h.boleh) {
        expect(h.pesan).toContain('aset-xyz')
        expect(h.pesan).not.toContain('undefined')
      }
    }
  })
})

describe('cekBolehBatal — label', () => {
  it('label kosong jatuh ke aset_id, bukan "undefined"', async () => {
    const { client } = fakeClient(() => ({ data: [{ id: 2 }] }))
    for (const label of [undefined, null, '   ']) {
      const h = await cekBolehBatal(client, [{ aset_id: 'aset-xyz', trx_id: 1, label }], 'ini')
      if (!h.boleh) {
        expect(h.pesan).toContain('aset-xyz')
        expect(h.pesan).not.toContain('undefined')
      }
    }
  })
})
