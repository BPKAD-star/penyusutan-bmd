// @vitest-environment jsdom
// ============================================================================
// Mengunci mesin dokumen BAST + Pakta Integritas (./useDokumenBast.ts).
//
// Yang dijaga hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//   · berkas mendarat di PREFIX yang benar (`pengamanan-bast/` vs
//     `pengamanan-pakta/`) — tertukar berarti kartu memamerkan dokumen yang
//     salah tanpa ada yang janggal di layar
//   · satu berkas gagal TIDAK membatalkan berkas berikutnya
//   · `uploading` dilepas walau unggahan melempar (INS-10) — kalau nyangkut
//     true, tombolnya mati selamanya tanpa keterangan
//   · kegagalan hapus di storage dilaporkan TAPI daftarnya tetap dibersihkan
//   · `lengkap` menuntut KEDUA berkas, bukan salah satu
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'

let upPaths: string[] = []
let upErrFor: (path: string) => { message: string } | null = () => null
let upThrow = false
let rmPaths: string[][] = []
let rmErr: { message: string } | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (upThrow) throw new Error('jaringan putus')
          upPaths.push(path)
          return { error: upErrFor(path) }
        },
        remove: async (paths: string[]) => { rmPaths.push(paths); return { error: rmErr } },
      }),
    },
  }),
}))

import { useDokumenBast } from './useDokumenBast'

let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => {
  upPaths = []; rmPaths = []; errs = []; rmErr = null; upThrow = false
  upErrFor = () => null
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid' })
})
afterEach(cleanup)

const files = (...names: string[]) =>
  ({ length: names.length, ...names.map(n => ({ name: n })) }) as unknown as FileList

const pasang = () => renderHook(() => useDokumenBast('2026-09-16', onErr))

describe('nilai awal', () => {
  it('tanggal BAST memakai yang dioper pemanggil, bukan "hari ini" versinya sendiri', () => {
    expect(pasang().result.current.tgl).toBe('2026-09-16')
  })
  it('belum ada berkas → belum lengkap', () => {
    expect(pasang().result.current.lengkap).toBe(false)
  })
})

describe('upload', () => {
  it('BAST & Pakta mendarat di PREFIX yang berbeda', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    await act(async () => { await h.result.current.upload(files('b.pdf'), 'pakta') })
    expect(upPaths).toEqual(['pengamanan-bast/uuid/a.pdf', 'pengamanan-pakta/uuid/b.pdf'])
    expect(h.result.current.bastPaths).toEqual(['pengamanan-bast/uuid/a.pdf'])
    expect(h.result.current.paktaPaths).toEqual(['pengamanan-pakta/uuid/b.pdf'])
  })

  it('beberapa berkas sekaligus → menumpuk, tak saling menimpa', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf', 'b.pdf'), 'bast') })
    expect(h.result.current.bastPaths).toHaveLength(2)
  })

  it('daftar KOSONG tidak menyalakan `uploading` maupun menembak storage', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(null, 'bast') })
    await act(async () => { await h.result.current.upload(files(), 'bast') })
    expect(upPaths).toEqual([])
    expect(h.result.current.uploading).toBe(false)
  })

  it('satu berkas gagal TIDAK membatalkan berkas berikutnya', async () => {
    upErrFor = p => (p.endsWith('rusak.pdf') ? { message: 'payload too large' } : null)
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('rusak.pdf', 'baik.pdf'), 'bast') })
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('rusak.pdf')
    expect(h.result.current.bastPaths).toEqual(['pengamanan-bast/uuid/baik.pdf'])
  })

  it('berkas yang GAGAL tidak ikut tercatat di daftar', async () => {
    upErrFor = () => ({ message: 'ditolak' })
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    expect(h.result.current.bastPaths).toEqual([])
  })

  it('`uploading` dilepas walau unggahan MELEMPAR (INS-10)', async () => {
    upThrow = true
    const h = pasang()
    await act(async () => {
      await h.result.current.upload(files('a.pdf'), 'bast').catch(() => {})
    })
    // Kalau `setUploading(false)` ada di jalur sukses, ia nyangkut true dan
    // tombol unggah mati selamanya tanpa satu pun keterangan.
    expect(h.result.current.uploading).toBe(false)
  })
})

describe('hapusDok', () => {
  it('mencabut dari daftar dokumen yang benar saja', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    await act(async () => { await h.result.current.upload(files('b.pdf'), 'pakta') })
    await act(async () => { await h.result.current.hapusDok('pengamanan-bast/uuid/a.pdf', 'bast') })
    expect(rmPaths).toEqual([['pengamanan-bast/uuid/a.pdf']])
    expect(h.result.current.bastPaths).toEqual([])
    expect(h.result.current.paktaPaths).toHaveLength(1)
  })

  it('gagal hapus di storage DILAPORKAN, tapi daftarnya tetap dibersihkan', async () => {
    rmErr = { message: 'object not found' }
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    await act(async () => { await h.result.current.hapusDok('pengamanan-bast/uuid/a.pdf', 'bast') })
    expect(errs[0]).toContain('object not found')
    // Daftar yang menolak dibersihkan mengunci operator; yang menentukan isi
    // kartu adalah payload, bukan isi bucket.
    expect(h.result.current.bastPaths).toEqual([])
  })
})

describe('lengkap', () => {
  it('salah satu saja → BELUM lengkap', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    expect(h.result.current.lengkap).toBe(false)
  })
  it('keduanya ada → lengkap', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    await act(async () => { await h.result.current.upload(files('b.pdf'), 'pakta') })
    expect(h.result.current.lengkap).toBe(true)
  })
  it('berkas terakhir dicabut → kembali BELUM lengkap', async () => {
    const h = pasang()
    await act(async () => { await h.result.current.upload(files('a.pdf'), 'bast') })
    await act(async () => { await h.result.current.upload(files('b.pdf'), 'pakta') })
    await act(async () => { await h.result.current.hapusDok('pengamanan-pakta/uuid/b.pdf', 'pakta') })
    expect(h.result.current.lengkap).toBe(false)
  })
})
