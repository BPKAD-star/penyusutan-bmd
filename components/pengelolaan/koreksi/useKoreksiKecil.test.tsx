// @vitest-environment jsdom
// ============================================================================
// Mengunci dua mesin state alasan yang ringkas: **Pencatatan Ganda** &
// **Spesifikasi Barang** (REFACTOR-PLAN Fase 3, langkah 3).
//
// Aturan "apa yang boleh berbeda antar duplikat" sudah dikunci
// lib/pencatatanGanda.test.ts. Yang dijaga DI SINI perilaku state yang kalau
// lepas TIDAK menghasilkan error:
//
//   · survivor DITETAPKAN kandidat pertama & tak bergeser saat menambah —
//     kalau bergeser, barang yang BERTAHAN berpindah diam-diam
//   · survivor jatuh ke null kalau barangnya sendiri dibuang
//   · centang spesifikasi berubah → edit tersusun DIBATALKAN
//   · popup menolak dibuka kalau golongannya campur
//   · prefix foto bercabang single/bulk — kalau tidak, foto massal menimpa
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

let asetRows: unknown[] = []
let qErr: { message: string } | null = null
let asetRow: Record<string, unknown> = {}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q, eq: () => q, or: () => q,
        limit: async () => ({ data: asetRows, error: qErr }),
        single: async () => ({ data: asetRow, error: qErr }),
      })
      return q
    },
  }),
}))

import { usePencatatanGanda } from './usePencatatanGanda'
import { useSpesifikasi } from './useSpesifikasi'
import type { Kandidat, Barang } from './tipe'

const kd = (over: Partial<Kandidat> = {}): Kandidat => ({
  id: 'a', nibar: null, kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop',
  spesifikasi_lainnya: null, nilai_perolehan: 10_000_000, tgl_perolehan: '2024-05-13', ...over,
})
const br = (over: Partial<Barang> = {}): Barang => ({
  id: 'b1', nibar: null, kode: '1.3.2.01.01.01.001', nama_barang: 'Laptop',
  merek_tipe: null, jumlah: 1, satuan: 'unit', nilai_perolehan: 10_000_000, skpd_id: 1,
  tgl_perolehan: '2024-05-13', cara_perolehan: null, foto_paths: null, intra_ekstra: 'intra', ...over,
})

let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => { asetRows = []; asetRow = {}; errs = []; qErr = null })
afterEach(cleanup)

describe('usePencatatanGanda — survivor', () => {
  it('kandidat PERTAMA jadi survivor', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    expect(result.current.survivorId).toBe('a')
  })

  it('kandidat berikutnya TIDAK menggeser survivor', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.tambah(kd({ id: 'b' })))
    expect(result.current.survivorId).toBe('a')
    expect(result.current.kandidat.map(k => k.id)).toEqual(['a', 'b'])
  })

  it('membuang SURVIVOR → survivorId null, tak menunjuk barang hantu', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.tambah(kd({ id: 'b' })))
    act(() => result.current.hapus('a'))
    expect(result.current.survivorId).toBeNull()
    expect(result.current.kandidat.map(k => k.id)).toEqual(['b'])
  })

  it('membuang BUKAN survivor → survivor tetap', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.tambah(kd({ id: 'b' })))
    act(() => result.current.hapus('b'))
    expect(result.current.survivorId).toBe('a')
  })

  it('barang yang sama tak masuk dua kali', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.tambah(kd({ id: 'a' })))
    expect(result.current.kandidat).toHaveLength(1)
  })

  it('menambah membersihkan hasil cari & kotak ketikan', async () => {
    asetRows = [kd({ id: 'a' }), kd({ id: 'b' })]
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.setQ('Laptop'))
    await act(async () => { await result.current.cari() })
    expect(result.current.hasil).toHaveLength(2)

    act(() => result.current.tambah(kd({ id: 'a' })))
    expect(result.current.hasil).toEqual([])
    expect(result.current.q).toBe('')
  })

  it('cari dgn ketikan kosong tak menembak DB sama sekali', async () => {
    asetRows = [kd({ id: 'z' })]
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    await act(async () => { await result.current.cari() })
    expect(result.current.hasil).toEqual([])
  })

  it('beda diteruskan dari lib — kode berbeda terdeteksi', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.tambah(kd({ id: 'b', kode: 'X' })))
    expect(result.current.beda.kode).toBe(true)
    expect(result.current.beda.nilai).toBe(false)
  })

  it('reset membuang kandidat & survivor', () => {
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.tambah(kd({ id: 'a' })))
    act(() => result.current.reset())
    expect(result.current.kandidat).toEqual([])
    expect(result.current.survivorId).toBeNull()
  })
})

describe('useSpesifikasi — centang & popup', () => {
  it('preset langsung tercentang (pintasan dari kartu Pemecahan)', () => {
    const { result } = renderHook(() => useSpesifikasi({ barang: br({ id: 'b1' }) }, onErr))
    expect(result.current.list.map(b => b.id)).toEqual(['b1'])
  })

  it('tanpa preset mulai kosong', () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    expect(result.current.list).toEqual([])
  })

  it('toggle mencentang lalu membatalkan centang', () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    expect(result.current.list).toHaveLength(1)
    act(() => result.current.toggle(br({ id: 'b1' })))
    expect(result.current.list).toHaveLength(0)
  })

  it('centang berubah → edit tersusun DIBATALKAN', () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    act(() => result.current.setEdit({ fields: { merek_tipe: 'Asus' }, foto: {} }))
    expect(result.current.edit).not.toBeNull()
    act(() => result.current.toggle(br({ id: 'b2' })))
    expect(result.current.edit).toBeNull()
  })

  it('golongan SAMA → boleh dibuka', () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1', kode: '1.3.2.01.01.01.001' })))
    act(() => result.current.toggle(br({ id: 'b2', kode: '1.3.2.99.99.99.999' })))
    expect(result.current.sameGol).toBe(true)
  })

  it('golongan CAMPUR → popup menolak dibuka', async () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1', kode: '1.3.2.01.01.01.001' })))
    act(() => result.current.toggle(br({ id: 'b2', kode: '1.3.1.01.01.01.001' })))
    expect(result.current.sameGol).toBe(false)

    await act(async () => { await result.current.openModal() })
    expect(result.current.modalOpen).toBe(false)
  })

  it('tanpa centang sama sekali → popup menolak dibuka', async () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    await act(async () => { await result.current.openModal() })
    expect(result.current.modalOpen).toBe(false)
  })

  it('SATU barang → field & foto di-prefill, prefix memakai id barangnya', async () => {
    asetRow = { merek_tipe: 'Asus', foto_paths: ['a.jpg', 'b.jpg'] }
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    await act(async () => { await result.current.openModal() })

    expect(result.current.modalOpen).toBe(true)
    expect(result.current.initFields.merek_tipe).toBe('Asus')
    expect(result.current.initFoto).toEqual(['a.jpg', 'b.jpg'])
    expect(result.current.prefix).toBe('draft/koreksi-spek/b1')
  })

  it('BANYAK barang → prefill KOSONG & prefix BUKAN id barang mana pun', async () => {
    asetRow = { merek_tipe: 'Asus', foto_paths: ['a.jpg'] }
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    act(() => result.current.toggle(br({ id: 'b2' })))
    await act(async () => { await result.current.openModal() })

    expect(result.current.initFields).toEqual({})
    expect(result.current.initFoto).toEqual([])
    // Kalau prefix-nya memakai id salah satu barang, unggahan massal akan
    // menimpa berkas milik barang itu.
    expect(result.current.prefix).not.toBe('draft/koreksi-spek/b1')
    expect(result.current.prefix).not.toBe('draft/koreksi-spek/b2')
    expect(result.current.prefix.startsWith('draft/koreksi-spek/')).toBe(true)
  })

  it('foto_paths null → initFoto array kosong, bukan null', async () => {
    asetRow = { foto_paths: null }
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    await act(async () => { await result.current.openModal() })
    expect(result.current.initFoto).toEqual([])
  })

  it('reset membuang centang, edit, & menutup popup', async () => {
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    await act(async () => { await result.current.openModal() })
    await waitFor(() => expect(result.current.modalOpen).toBe(true))
    act(() => result.current.reset())

    expect(result.current.list).toEqual([])
    expect(result.current.edit).toBeNull()
    expect(result.current.modalOpen).toBe(false)
  })
})

describe('Fase 1 — kegagalan query dilaporkan', () => {
  it('cari kandidat gagal → hasil DIKOSONGKAN & errornya dilaporkan', async () => {
    asetRows = [kd({ id: 'lama' })]
    const { result } = renderHook(() => usePencatatanGanda(1, onErr))
    act(() => result.current.setQ('Laptop'))
    await act(async () => { await result.current.cari() })
    expect(result.current.hasil).toHaveLength(1)

    qErr = { message: 'timeout' }
    act(() => result.current.setQ('Mobil'))
    await act(async () => { await result.current.cari() })
    // ⚠️ Hasil pencarian SEBELUMNYA tak boleh tertinggal — ia akan terbaca
    // sebagai jawaban atas kata kunci yang baru.
    expect(result.current.hasil).toEqual([])
    expect(errs[0]).toContain('gagal mencari barang')
  })

  it('prefill spesifikasi gagal → popup TIDAK dibuka', async () => {
    qErr = { message: 'timeout' }
    const { result } = renderHook(() => useSpesifikasi(null, onErr))
    act(() => result.current.toggle(br({ id: 'b1' })))
    await act(async () => { await result.current.openModal() })

    // Popup dgn field kosong terbaca "nilai lamanya memang kosong", dan Simpan
    // akan menuliskannya ke register.
    expect(result.current.modalOpen).toBe(false)
    expect(errs[0]).toContain('gagal memuat spesifikasi barang')
  })
})
