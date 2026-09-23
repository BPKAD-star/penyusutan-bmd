// @vitest-environment jsdom
// ============================================================================
// Mengunci mesin Edit Spesifikasi di Saldo Awal → Daftar Barang Awal.
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan error:
//   · barang TERKUNCI tak bisa dicentang — pintu ini cuma untuk barang yang
//     belum bergerak (keputusan user 2026-07-28)
//   · gagal memeriksa kunci → set KOSONG + dilaporkan, centang tetap hidup;
//     DB yang menolak. BUKAN mengunci semuanya diam-diam.
//   · prefill gagal → popup TIDAK dibuka (field kosong akan tertulis ke
//     snapshot DAN register sebagai "koreksi")
//   · UPDATE yang mengembalikan 0 baris = DITOLAK RLS, wajib dilaporkan gagal
//     — ia tidak melempar error sendiri
//   · hanya field yang BERUBAH yang dikirim
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

type Res = { data: unknown; error: { message: string } | null }
let rpcRes: Res = { data: [], error: null }
let singleRes: Res = { data: {}, error: null }
/** tabel → hasil UPDATE (`.select()` mengembalikan baris yang benar-benar tersentuh). */
let updRes: Record<string, Res> = {}
let updates: { tabel: string; patch: Record<string, unknown>; nibar: string }[] = []
let selectRes: Res = { data: [], error: null }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: async () => rpcRes,
    from: (tabel: string) => {
      const st: { patch?: Record<string, unknown>; nibar?: string; isUpdate?: boolean } = {}
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: (_c?: string) => st.isUpdate
          ? { then: (r: (v: Res) => void) => r(updRes[tabel] ?? { data: [{ nibar: st.nibar }], error: null }) }
          : q,
        update: (patch: Record<string, unknown>) => { st.isUpdate = true; st.patch = patch; return q },
        eq: (_k: string, v: string) => { st.nibar = v; if (st.isUpdate) updates.push({ tabel, patch: st.patch!, nibar: v }); return q },
        in: async () => selectRes,
        single: async () => singleRes,
      })
      return q
    },
  }),
}))

import { useEditSpekAwal } from './useEditSpekAwal'
import type { Row } from './tipe'

const r = (over: Partial<Row> = {}): Row => ({
  nibar: 'N1', kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop', skpd_id: 1,
  intra_ekstra: 'intra', tgl_perolehan: '2024-01-01', tahun_pengadaan: 2024,
  nilai_perolehan: 1000, akumulasi_2025: 0, nilai_buku_awal: 1000, sisa_masa_manfaat_smt: 10,
  masa_manfaat_smt: 10, beban_penyusutan_per_smt: 100, foto_paths: null,
  merek_tipe: null, spesifikasi_lainnya: null,
  ...over,   // ⚠️ jangan dihapus — tanpa ini SEMUA baris identik & test golongan-campur hijau palsu
} as Row)

const pasang = () => {
  const reload = vi.fn()
  const h = renderHook(() => useEditSpekAwal(reload))
  return { ...h, reload }
}

beforeEach(() => {
  rpcRes = { data: [], error: null }; singleRes = { data: {}, error: null }
  updRes = {}; updates = []; selectRes = { data: [], error: null }
})
afterEach(cleanup)

describe('centang & barang terkunci', () => {
  it('mencentang lalu melepas', () => {
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    expect(result.current.selList.map(x => x.nibar)).toEqual(['N1'])
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    expect(result.current.selList).toEqual([])
  })

  it('⚠️ barang TERKUNCI tak bisa dicentang sama sekali', () => {
    const { result } = pasang()
    act(() => result.current.setTerkunci(new Set(['N1'])))
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    expect(result.current.selList).toEqual([])
  })

  it('golongan campur → popup menolak dibuka', async () => {
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1', kode: '1.3.2.01.01.01.001' })))
    act(() => result.current.toggleSel(r({ nibar: 'N2', kode: '1.3.1.01.01.01.001' })))
    expect(result.current.selSameGol).toBe(false)
    await act(async () => { await result.current.openSpek() })
    expect(result.current.spekOpen).toBe(false)
  })
})

describe('fetchTerkunci — gagal ≠ mengunci semuanya', () => {
  it('RPC sukses → NIBAR yang dikunci terkumpul', async () => {
    rpcRes = { data: [{ nibar: 'N1' }, { nibar: 'N2' }], error: null }
    const { result } = pasang()
    let out: Set<string> = new Set()
    await act(async () => { out = await result.current.fetchTerkunci(['N1', 'N2', 'N3'], []) })
    expect([...out].sort()).toEqual(['N1', 'N2'])
  })

  it('⚠️ RPC GAGAL → set KOSONG + pesan; centang tetap hidup, DB yang menolak', async () => {
    rpcRes = { data: null, error: { message: 'function does not exist' } }
    const { result } = pasang()
    const pesan: string[] = []
    let out: Set<string> = new Set(['x'])
    await act(async () => { out = await result.current.fetchTerkunci(['N1'], pesan) })

    expect(out.size).toBe(0)
    expect(pesan[0]).toContain('Tanda 🔒 tidak ditampilkan')
    expect(pesan[0]).toContain('database yang menolak saat Simpan')
  })
})

describe('openSpek', () => {
  it('SATU barang → field di-prefill & prefix pakai NIBAR-nya', async () => {
    singleRes = { data: { merek_tipe: 'Asus', foto_paths: ['a.jpg'] }, error: null }
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    await act(async () => { await result.current.openSpek() })

    expect(result.current.spekOpen).toBe(true)
    expect(result.current.spekInitFields.merek_tipe).toBe('Asus')
    expect(result.current.spekInitFoto).toEqual(['a.jpg'])
    expect(result.current.spekPrefix).toBe('draft/saldo-awal-spek/N1')
  })

  it('BANYAK barang → prefill kosong & prefix bukan NIBAR mana pun', async () => {
    singleRes = { data: { merek_tipe: 'Asus' }, error: null }
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    act(() => result.current.toggleSel(r({ nibar: 'N2' })))
    await act(async () => { await result.current.openSpek() })

    expect(result.current.spekInitFields).toEqual({})
    expect(result.current.spekPrefix).not.toContain('N1')
    expect(result.current.spekPrefix).not.toContain('N2')
  })

  it('⚠️ prefill GAGAL → popup TIDAK dibuka (Fase 1)', async () => {
    singleRes = { data: null, error: { message: 'timeout' } }
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1' })))
    await act(async () => { await result.current.openSpek() })

    expect(result.current.spekOpen).toBe(false)
    expect(result.current.spekErr).toContain('Gagal memuat spesifikasi barang')
  })

  // Sejak 2026-09-23: luas, lokasi & koordinat Tanah milik REGISTER — selalu
  // ditawarkan, ada bidang atau tidak. Dokumen kepemilikan & jenis hak tetap
  // milik bidang di GIS.
  it('Tanah → luas, lokasi & koordinat ditawarkan; dokumen kepemilikan tidak', async () => {
    const { result } = pasang()
    act(() => result.current.toggleSel(r({ nibar: 'N1', kode: '1.3.1.01.01.01.001' })))
    await act(async () => { await result.current.openSpek() })
    expect(result.current.spekKeys).toEqual([
      'nama_barang', 'spesifikasi_lainnya', 'luas', 'wilayah_kode', 'alamat_detail',
      'latitude', 'longitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan',
      'satuan', 'asal_usul', 'tahun_pengadaan',
    ])
  })
})

describe('simpanSpek — menulis ke DUA tabel', () => {
  // ⚠️ Dipanggil `(await siapkan()).result`, bukan `const { result } = await …`:
  // bentuk kedua kena no-restricted-syntax (pemburu query Supabase penelan
  // `error`). Positif palsu di sini, tapi angka warning repo dibaca tiap
  // tinjauan §10 — 7 peringatan palsu menggesernya.
  const siapkan = async () => {
    singleRes = { data: { merek_tipe: 'Lama' }, error: null }
    const h = pasang()
    act(() => h.result.current.toggleSel(r({ nibar: 'N1' })))
    await act(async () => { await h.result.current.openSpek() })
    return h
  }

  it('menolak kalau tak ada satu pun field berubah', async () => {
    const result = (await siapkan()).result
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Lama' }, {}) })
    expect(result.current.spekErr).toContain('Tidak ada field yang diubah')
    expect(updates).toEqual([])
  })

  it('hanya field yang BERUBAH yang dikirim', async () => {
    selectRes = { data: [{ nibar: 'N1', foto_paths: [] }], error: null }
    const result = (await siapkan()).result
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Baru', spesifikasi_lainnya: '' }, {}) })

    const snap = updates.find(u => u.tabel === 'aset_awal_2026')
    expect(snap!.patch).toEqual({ merek_tipe: 'Baru' })
  })

  it('menulis ke snapshot DAN register aset', async () => {
    selectRes = { data: [{ nibar: 'N1', foto_paths: [] }], error: null }
    const result = (await siapkan()).result
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Baru' }, {}) })

    expect(updates.map(u => u.tabel)).toContain('aset_awal_2026')
    expect(updates.map(u => u.tabel)).toContain('aset')
    expect(result.current.spekMsg).toContain('1 barang diperbarui')
  })

  it('⚠️ UPDATE mengembalikan 0 baris = DITOLAK RLS → dilaporkan GAGAL', async () => {
    // Ia tak melempar error sendiri; tanpa `.select()` kegagalan ini
    // dilaporkan sebagai "berhasil".
    updRes['aset_awal_2026'] = { data: [], error: null }
    const result = (await siapkan()).result
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Baru' }, {}) })

    expect(result.current.spekErr).toContain('ditolak database')
    expect(result.current.spekMsg).toBe('')
    expect(result.current.spekSaving).toBe(false)
  })

  it('error snapshot dilaporkan & register TIDAK ikut ditulis', async () => {
    updRes['aset_awal_2026'] = { data: null, error: { message: 'boom' } }
    const result = (await siapkan()).result
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Baru' }, {}) })

    expect(result.current.spekErr).toContain('boom')
    expect(updates.filter(u => u.tabel === 'aset').length).toBe(0)
  })

  it('sukses → centang dibersihkan & halaman dimuat ulang', async () => {
    selectRes = { data: [{ nibar: 'N1', foto_paths: [] }], error: null }
    const h = await siapkan()
    await act(async () => { await h.result.current.simpanSpek({ merek_tipe: 'Baru' }, {}) })

    expect(h.result.current.selList).toEqual([])
    expect(h.reload).toHaveBeenCalled()
  })

  it('⚠️ centang bertambah SESUDAH popup dibuka → prefill lama TIDAK dipakai sbg pembanding', async () => {
    // Jalur nyata: popup dibuka untuk SATU barang (prefill terisi "Lama"), lalu
    // barang kedua ikut dicentang — `toggleSel` sengaja TIDAK membersihkan
    // prefill. Tanpa penjaga `single ? … : {}`, field yang nilainya kebetulan
    // SAMA dgn nilai lama barang pertama akan dilewati diam-diam, jadi barang
    // kedua tak pernah menerima perubahannya.
    selectRes = { data: [{ nibar: 'N1', foto_paths: [] }, { nibar: 'N2', foto_paths: [] }], error: null }
    const result = (await siapkan()).result
    expect(result.current.spekInitFields.merek_tipe).toBe('Lama')

    act(() => result.current.toggleSel(r({ nibar: 'N2' })))
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Lama' }, {}) })

    // "Lama" itu perubahan yang SAH untuk barang kedua → wajib terkirim.
    expect(updates.filter(u => u.tabel === 'aset_awal_2026')).toHaveLength(2)
    expect(result.current.spekErr).not.toContain('Tidak ada field yang diubah')
  })

  it('popup DITUTUP sebelum menyimpan — strip pesan tertutup overlay kalau tidak', async () => {
    selectRes = { data: [{ nibar: 'N1', foto_paths: [] }], error: null }
    const result = (await siapkan()).result
    expect(result.current.spekOpen).toBe(true)
    await act(async () => { await result.current.simpanSpek({ merek_tipe: 'Baru' }, {}) })
    expect(result.current.spekOpen).toBe(false)
  })
})
