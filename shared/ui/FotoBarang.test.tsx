// @vitest-environment jsdom
// ============================================================================
// Test FotoBarang — sel foto tabel barang + pop-up penampilnya.
//
// Yang dijaga di sini tiga aturan yang kalau lepas TIDAK menghasilkan error:
//
//   (1) `useFotoThumbs` SENGAJA TIDAK MELEMPAR saat tanda tangan gagal — satu-
//       satunya pengecualian fail-closed di modul ini, karena gambar mini 32 px
//       itu hiasan dan menjatuhkan seluruh tabel kartu gara-gara foto justru
//       merugikan. Tapi kegagalannya WAJIB tidak disembunyikan: selnya jatuh ke
//       penanda "{n}📷" yang TETAP BISA DIKLIK, dan pop-upnya — yang
//       menandatangani sendiri — menampilkan pesan aslinya. Kalau suatu saat
//       ada yang "menyeragamkan" jalur ini jadi melempar, tabel kartu Pengadaan
//       & keempat menu Perolehan Manual ikut mati.
//   (2) Tanda tangan diulang HANYA kalau ISI daftarnya berubah. Pemanggil
//       merakit `paths` ulang tiap render (`.map().filter()`), jadi memakai
//       identitas array sbg dependensi akan menandatangani ulang di SETIAP
//       render — satu permintaan jaringan per render, per kartu.
//   (3) Pop-up menandatangani SELURUH foto sendiri, bukan menumpang URL gambar
//       mini (yang cuma memuat foto pertama).
//
// ⚠️ Bucket `aset-foto` PRIVAT → gambarnya WAJIB lewat signed URL, tak pernah
// public URL (CLAUDE.md). Test ini ikut menjaganya: yang di-mock
// `createSignedUrls`, dan kalau kode berpindah ke `getPublicUrl` mock-nya
// meledak.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

const createSignedUrls = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}))

import { FotoSel, useFotoThumbs } from './FotoBarang'

const sukses = (paths: string[]) => ({
  data: paths.map(p => ({ path: p, signedUrl: `https://sig/${p}?t=1` })),
  error: null,
})

beforeEach(() => { createSignedUrls.mockReset(); createSignedUrls.mockResolvedValue(sukses([])) })
afterEach(cleanup)

describe('useFotoThumbs', () => {
  it('daftar kosong → tak menandatangani apa pun', async () => {
    const { result } = renderHook(() => useFotoThumbs([]))
    await waitFor(() => expect(result.current).toEqual({}))
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('memetakan path → signed URL', async () => {
    const paths = ['a/1.jpg', 'b/2.jpg']
    createSignedUrls.mockResolvedValue(sukses(paths))
    const { result } = renderHook(() => useFotoThumbs(paths))
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2))
    expect(result.current['a/1.jpg']).toBe('https://sig/a/1.jpg?t=1')
    expect(createSignedUrls).toHaveBeenCalledWith(paths, 3600)
  })

  // ⚠️ "peta tetap {}" SAJA bukan uji apa-apa: efeknya berjalan di dalam async
  // IIFE, jadi `throw` di sana cuma jadi unhandled rejection & petanya TETAP {}
  // — test bentuk itu hijau di kedua keadaan (dibuktikan dgn mutasi). Yang
  // membedakan harus DIAMATI: (a) tak ada penolakan yang lolos, (b) URL lama
  // benar-benar DIBERSIHKAN, bukan ditinggal basi.
  it('(1) gagal → tak ada penolakan yang lolos (hook TIDAK melempar)', async () => {
    const lolos: unknown[] = []
    const tangkap = (e: unknown) => { lolos.push(e) }
    process.on('unhandledRejection', tangkap)
    try {
      createSignedUrls.mockResolvedValue({ data: null, error: { message: 'JWT expired' } })
      const { result } = renderHook(() => useFotoThumbs(['a/1.jpg']))
      await waitFor(() => expect(createSignedUrls).toHaveBeenCalled())
      // Beri kesempatan penolakan tak tertangani terdeteksi Node.
      await new Promise(r => setTimeout(r, 50))
      expect(lolos).toEqual([])
      expect(result.current).toEqual({})
    } finally {
      process.off('unhandledRejection', tangkap)
    }
  })

  it('(1) gagal SESUDAH berhasil → URL lama dibersihkan, tidak ditinggal basi', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    const { rerender, result } = renderHook(({ p }) => useFotoThumbs(p), {
      initialProps: { p: ['a/1.jpg'] },
    })
    await waitFor(() => expect(result.current['a/1.jpg']).toBeTruthy())

    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'JWT expired' } })
    rerender({ p: ['b/2.jpg'] })
    // Gambar mini yang basi lebih buruk daripada sel kosong: ia menampilkan
    // foto barang LAIN di baris ini tanpa satu pun tanda.
    await waitFor(() => expect(result.current).toEqual({}))
  })

  it('baris tanpa signedUrl dilewati, tidak jadi kunci bernilai kosong', async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'a/1.jpg', signedUrl: 'https://sig/ok' }, { path: 'b/2.jpg', signedUrl: '' }],
      error: null,
    })
    const { result } = renderHook(() => useFotoThumbs(['a/1.jpg', 'b/2.jpg']))
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(1))
    expect(result.current['b/2.jpg']).toBeUndefined()
  })

  // ⚠️ Mutasi `[key]` → `[paths]` tak menggagalkan test ini dgn rapi: ia membuat
  // RENDER LOOP TAK BERUJUNG (efek memanggil `setUrls` → render → array baru →
  // efek lagi), jadi prosesnya MENGGANTUNG. Tertangkap, tapi bentuknya hang —
  // kalau suatu saat vitest tiba-tiba tak selesai sesudah menyentuh berkas ini,
  // periksa dependensi efeknya lebih dulu.
  it('(2) render ulang dgn ISI daftar yang sama → TIDAK menandatangani lagi', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    // Array BARU tiap render — persis yang dilakukan pemanggil (`.map().filter()`).
    const { rerender, result } = renderHook(() => useFotoThumbs(['a/1.jpg']))
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(1))
    rerender(); rerender(); rerender()
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('(2) isi daftar BERUBAH → menandatangani ulang', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    const { rerender, result } = renderHook(({ p }) => useFotoThumbs(p), {
      initialProps: { p: ['a/1.jpg'] },
    })
    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(1))
    createSignedUrls.mockResolvedValue(sukses(['b/2.jpg']))
    rerender({ p: ['b/2.jpg'] })
    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(2))
    expect(result.current['b/2.jpg']).toBeTruthy()
  })
})

describe('FotoSel — tiga keadaan sel', () => {
  it('tanpa foto → "-" dan TIDAK bisa diklik', () => {
    render(<FotoSel paths={[]} judul="Laptop" />)
    expect(screen.getByText('-')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ada thumbUrl → gambar mini, tanpa lencana kalau cuma satu foto', () => {
    render(<FotoSel paths={['a/1.jpg']} thumbUrl="https://sig/a" judul="Laptop" />)
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.src).toBe('https://sig/a')
    expect(screen.queryByText('1')).toBeNull()
  })

  it('lebih dari satu foto → lencana berisi jumlahnya', () => {
    render(<FotoSel paths={['a/1.jpg', 'a/2.jpg', 'a/3.jpg']} thumbUrl="https://sig/a" judul="Laptop" />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('(1) thumbUrl gagal/belum ada → penanda "{n}📷" yang TETAP BISA DIKLIK', () => {
    // Inilah yang membuat kegagalan tanda tangan tak jadi jalan buntu: pop-upnya
    // punya jalur tanda tangannya sendiri, jadi fotonya masih bisa dibuka.
    render(<FotoSel paths={['a/1.jpg', 'a/2.jpg']} judul="Laptop" />)
    expect(screen.getByText('2📷')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })
})

describe('pop-up penampil foto', () => {
  const buka = async (paths: string[], judul = 'Laptop Asus') => {
    render(<FotoSel paths={paths} judul={judul} />)
    await act(async () => { fireEvent.click(screen.getByRole('button')) })
  }

  it('(3) menandatangani SELURUH foto sendiri saat dibuka', async () => {
    const paths = ['a/1.jpg', 'a/2.jpg', 'a/3.jpg']
    createSignedUrls.mockResolvedValue(sukses(paths))
    await buka(paths)
    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledWith(paths, 3600))
    expect(await screen.findByText(/Foto 1 dari 3/)).toBeTruthy()
  })

  it('satu foto → tak menampilkan nomor urut maupun tombol panah', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    await buka(['a/1.jpg'])
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(1))
    expect(screen.queryByText(/dari/)).toBeNull()
    expect(screen.queryByLabelText('Foto berikutnya')).toBeNull()
  })

  it('panah berpindah & MEMUTAR di ujung', async () => {
    const paths = ['a/1.jpg', 'a/2.jpg', 'a/3.jpg']
    createSignedUrls.mockResolvedValue(sukses(paths))
    await buka(paths)
    await screen.findByText(/Foto 1 dari 3/)

    fireEvent.click(screen.getByLabelText('Foto berikutnya'))
    expect(await screen.findByText(/Foto 2 dari 3/)).toBeTruthy()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText(/Foto 3 dari 3/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowRight' })          // memutar ke awal
    expect(await screen.findByText(/Foto 1 dari 3/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })           // memutar ke akhir
    expect(await screen.findByText(/Foto 3 dari 3/)).toBeTruthy()
  })

  it('Esc & tombol × menutup', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    await buka(['a/1.jpg'])
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await act(async () => { fireEvent.click(screen.getByRole('button')) })
    fireEvent.click(await screen.findByLabelText('Tutup'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('(1) tanda tangan gagal → pesan ASLINYA, bukan pop-up kosong melompong', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await buka(['a/1.jpg'])
    expect(await screen.findByText(/Gagal memuat foto: Object not found/)).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('tak satu pun path terpetakan → dibedakan dari "gagal"', async () => {
    createSignedUrls.mockResolvedValue({ data: [], error: null })
    await buka(['a/1.jpg'])
    expect(await screen.findByText('Fotonya tidak ditemukan di penyimpanan.')).toBeTruthy()
  })

  it('judul & nama berkas ditampilkan', async () => {
    createSignedUrls.mockResolvedValue(sukses(['draft/abc/foto-rangka.jpg']))
    await buka(['draft/abc/foto-rangka.jpg'], 'Toyota Innova')
    expect(await screen.findByText('Toyota Innova')).toBeTruthy()
    expect(screen.getByText('foto-rangka.jpg')).toBeTruthy()
  })

  it('berada di atas modal biasa (z-50) — sel ini sering di dalam kartu ber-modal', async () => {
    createSignedUrls.mockResolvedValue(sukses(['a/1.jpg']))
    await buka(['a/1.jpg'])
    expect(screen.getByRole('dialog').className).toContain('z-[60]')
  })
})
