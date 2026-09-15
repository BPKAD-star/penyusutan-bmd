// @vitest-environment jsdom
// ============================================================================
// Mengunci mesin state alasan **Pemecahan Barang** (./usePemecahan.ts),
// diangkat dari `KoreksiForm` 2026-09-15 (REFACTOR-PLAN Fase 3).
//
// Aritmetika uangnya sudah dikunci lib/pemecahanNilai.test.ts. Yang dijaga DI
// SINI hal-hal yang kalau lepas TIDAK menghasilkan satu pun error:
//
//   · basis dibaca dari semester SEBELUM tanggal dokumen — bukan semesternya
//     sendiri. Salah semester = seluruh alokasi berangkat dari posisi yang
//     keliru, dan angkanya tetap "masuk akal".
//   · ganti tanggal WAJIB memuat ulang basis. Kalau tidak, operator yang
//     membetulkan tanggal dokumen tetap memakai basis tanggal lama.
//   · golongan tak-disusutkan → basis NOL yang sah, BUKAN pesan error;
//     sebaliknya basis yang tak ketemu → error, BUKAN nol diam-diam.
//   · pecahan tak boleh turun di bawah DUA.
//   · Tanah (1.3.1) tidak mewarisi dokumen kepemilikan induk.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

/** Baris `penyusutan_semester` yang akan dijawab, di-keyed per periode. */
let barisEngine: Record<string, unknown> = {}
let engineErr: { message: string } | null = null
let asetErr: { message: string } | null = null
/** Periode yang BENAR-BENAR ditanyakan ke DB — inti uji "semester sebelum". */
let periodeDiminta: string[] = []
/** Kolom `aset` yang dijawab saat induk dipilih. */
let kolomAset: Record<string, unknown> = {}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      if (tabel === 'penyusutan_semester') {
        let periode = ''
        const q = {
          select: () => q,
          eq: (kolom: string, nilai: string) => { if (kolom === 'periode') { periode = nilai; periodeDiminta.push(nilai) } return q },
          maybeSingle: async () => ({ data: barisEngine[periode] ?? null, error: engineErr }),
        }
        return q
      }
      const q2 = { select: () => q2, eq: () => q2, single: async () => ({ data: kolomAset, error: asetErr }) }
      return q2
    },
  }),
}))

// ⚠️ Helper di bawah sengaja TIDAK ditulis `const { result } = await siap()`:
// bentuk `const {…} = await …` kena aturan ESLint no-restricted-syntax yang
// memburu query Supabase yang menelan `error`. Di sini ia positif palsu (ini
// hasil `renderHook`), dan 7 peringatan palsu jauh lebih mahal daripada satu
// baris yang ditulis lain — angka warning repo ini dibaca tiap tinjauan.
import { usePemecahan, TANAH_DOK_FIELDS } from './usePemecahan'
import type { Barang } from './tipe'

const barang = (over: Partial<Barang> = {}): Barang => ({
  id: 'a1', nibar: null, kode: '1.3.2.05.02.06.121', nama_barang: 'Pagar Besi',
  merek_tipe: null, jumlah: 1, satuan: 'unit', nilai_perolehan: 1_000_000, skpd_id: 1,
  tgl_perolehan: '2025-02-05', cara_perolehan: null, foto_paths: null, intra_ekstra: 'intra', ...over,
})

const ENGINE = { nilai_buku_akhir: 600_000, akumulasi: 400_000, sisa_semester: 10, masa_manfaat_tahun: 5 }

let errs: string[] = []
const onErr = (m: string) => { errs.push(m) }

beforeEach(() => { barisEngine = {}; periodeDiminta = []; kolomAset = {}; errs = []; engineErr = null; asetErr = null })
afterEach(cleanup)

describe('basis dibaca dari semester SEBELUM tanggal dokumen', () => {
  it('dokumen 2026-S2 → yang ditanyakan 2026-S1', async () => {
    barisEngine['2026-S1'] = ENGINE
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(periodeDiminta).toEqual(['2026-S1'])
    expect(result.current.basis).toEqual({ nilai_buku: 600_000, akumulasi: 400_000, sisa_smt: 10, masa_tahun: 5, disusutkan: true })
  })

  it('dokumen 2026-S1 → MENYEBERANG tahun, yang ditanyakan 2025-S2', async () => {
    barisEngine['2025-S2'] = ENGINE
    const { result } = renderHook(() => usePemecahan('2026-03-01', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(periodeDiminta).toEqual(['2025-S2'])
  })

  it('ganti tanggal ke semester lain → basis DIMUAT ULANG', async () => {
    barisEngine['2026-S1'] = ENGINE
    barisEngine['2025-S2'] = { ...ENGINE, akumulasi: 111_111 }
    const { result, rerender } = renderHook(({ t }) => usePemecahan(t, onErr), { initialProps: { t: '2026-08-27' } })
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basis?.akumulasi).toBe(400_000))

    rerender({ t: '2026-03-01' })
    await waitFor(() => expect(result.current.basis?.akumulasi).toBe(111_111))
    expect(periodeDiminta).toEqual(['2026-S1', '2025-S2'])
  })
})

describe('basis tak ketemu: nol yang SAH vs error', () => {
  it('golongan tak disusutkan (Tanah) → basis NOL, tanpa error', async () => {
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang({ kode: '1.3.1.01.01.01.001', nilai_perolehan: 900_000 })) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    expect(result.current.basis).toEqual({ nilai_buku: 900_000, akumulasi: 0, sisa_smt: 0, masa_tahun: null, disusutkan: false })
    expect(result.current.basisErr).toBe('')
  })

  it('golongan DISUSUTKAN tapi baris engine tak ada → ERROR, bukan nol diam-diam', async () => {
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basisErr).not.toBe(''))

    expect(result.current.basis).toBeNull()
    expect(result.current.basisErr).toContain('2026-S1')
  })

  it('basisLoading kembali false di KEDUA jalur', async () => {
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basisErr).not.toBe(''))
    expect(result.current.basisLoading).toBe(false)
  })
})

describe('pilih induk → dua pecahan kosong yang mewarisi spesifikasi', () => {
  it('mewarisi field induk & langsung berbentuk SAH (2 baris)', async () => {
    kolomAset = { merek_tipe: 'Besi Hollow', kondisi_barang: 'Baik' }
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })

    expect(result.current.pecahan).toHaveLength(2)
    expect(result.current.pecahan[0].fields.merek_tipe).toBe('Besi Hollow')
    expect(result.current.pecahan[1].fields.kondisi_barang).toBe('Baik')
    expect(result.current.pecahan[0].key).not.toBe(result.current.pecahan[1].key)
  })

  it('TANAH tidak mewarisi dokumen kepemilikan induk — tiap pecahan sertifikatnya sendiri', async () => {
    kolomAset = { merek_tipe: null, jenis_hak: 'Hak Pakai', nomor_dokumen_kepemilikan: '123/HP', luas: '500' }
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang({ kode: '1.3.1.01.01.01.001' })) })

    for (const k of TANAH_DOK_FIELDS) expect(result.current.indukFields[k]).toBeUndefined()
    // Yang BUKAN dokumen kepemilikan tetap diwarisi — kalau semuanya dibuang,
    // pecahan tanah kehilangan luas & lokasinya tanpa ada yang menyadarinya.
    expect(result.current.indukFields.luas).toBe('500')
  })

  it('golongan lain TETAP mewarisi jenis hak (pengecualiannya khusus 1.3.1)', async () => {
    kolomAset = { jenis_hak: 'Hak Pakai' }
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang({ kode: '1.3.3.01.01.01.001' })) })
    expect(result.current.indukFields.jenis_hak).toBe('Hak Pakai')
  })
})

describe('menyunting daftar pecahan', () => {
  const siap = async () => {
    const h = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await h.result.current.pilihInduk(barang()) })
    return h
  }

  it('addPecah menambah baris yang mewarisi field induk', async () => {
    kolomAset = { merek_tipe: 'Besi Hollow' }
    const result = (await siap()).result
    act(() => result.current.addPecah())
    expect(result.current.pecahan).toHaveLength(3)
    expect(result.current.pecahan[2].fields.merek_tipe).toBe('Besi Hollow')
  })

  it('setPecah menambal HANYA baris berkunci itu', async () => {
    const result = (await siap()).result
    const k0 = result.current.pecahan[0].key
    act(() => result.current.setPecah(k0, { nilai: '400000' }))
    expect(result.current.pecahan[0].nilai).toBe('400000')
    expect(result.current.pecahan[1].nilai).toBe('')
  })

  it('removePecah MENOLAK turun di bawah dua', async () => {
    const result = (await siap()).result
    act(() => result.current.removePecah(result.current.pecahan[0].key))
    expect(result.current.pecahan).toHaveLength(2)
  })

  it('removePecah jalan begitu barisnya tiga', async () => {
    const result = (await siap()).result
    act(() => result.current.addPecah())
    const buang = result.current.pecahan[1].key
    act(() => result.current.removePecah(buang))
    expect(result.current.pecahan).toHaveLength(2)
    expect(result.current.pecahan.some(p => p.key === buang)).toBe(false)
  })
})

describe('reset vs gantiInduk — sengaja BERBEDA', () => {
  const siap = async () => {
    kolomAset = { merek_tipe: 'Besi Hollow' }
    const h = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await h.result.current.pilihInduk(barang()) })
    act(() => h.result.current.setEditIdx(1))
    return h
  }

  it('reset() membuang SELURUH jejak — dipakai saat pindah alasan', async () => {
    const result = (await siap()).result
    act(() => result.current.reset())
    expect(result.current.induk).toBeNull()
    expect(result.current.pecahan).toEqual([])
    expect(result.current.indukFields).toEqual({})
    expect(result.current.editIdx).toBeNull()
  })

  it('gantiInduk() MENYISAKAN indukFields & editIdx — dan itu disengaja', async () => {
    const result = (await siap()).result
    act(() => result.current.gantiInduk())
    expect(result.current.induk).toBeNull()
    expect(result.current.pecahan).toEqual([])
    expect(result.current.indukFields.merek_tipe).toBe('Besi Hollow')
    expect(result.current.editIdx).toBe(1)
  })

  it('sisa dari gantiInduk() ditimpa habis oleh induk berikutnya', async () => {
    const result = (await siap()).result
    act(() => result.current.gantiInduk())
    kolomAset = { merek_tipe: 'Beton' }
    await act(async () => { await result.current.pilihInduk(barang({ id: 'a2' })) })
    expect(result.current.indukFields.merek_tipe).toBe('Beton')
    expect(result.current.pecahan).toHaveLength(2)
  })
})

describe('turunan angka diteruskan dari lib/pemecahanNilai', () => {
  it('Σ pecahan == induk → balance true & semuaValid true', async () => {
    barisEngine['2026-S1'] = ENGINE
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    const [a, b] = result.current.pecahan.map(p => p.key)
    act(() => { result.current.setPecah(a, { nilai: '600000' }); })
    act(() => { result.current.setPecah(b, { nilai: '400000' }) })

    expect(result.current.totalNPInduk).toBe(1_000_000)
    expect(result.current.sumNPPecah).toBe(1_000_000)
    expect(result.current.balance).toBe(true)
    expect(result.current.semuaValid).toBe(true)
  })

  it('Σ meleset seratus rupiah → balance false', async () => {
    barisEngine['2026-S1'] = ENGINE
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basis).not.toBeNull())

    const [a, b] = result.current.pecahan.map(p => p.key)
    act(() => { result.current.setPecah(a, { nilai: '600000' }) })
    act(() => { result.current.setPecah(b, { nilai: '399900' }) })
    expect(result.current.balance).toBe(false)
  })

  it('basis belum termuat → alokasi KOSONG, bukan angka nol yang kelihatan sah', async () => {
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basisErr).not.toBe(''))
    expect(result.current.alokasi).toEqual([])
  })
})

describe('Fase 1 — kegagalan query tak menyamar jadi "engine belum dijalankan"', () => {
  it('basis GAGAL dibaca → pesannya menyebut kegagalan, bukan menuduh engine', async () => {
    engineErr = { message: 'canceling statement due to statement timeout' }
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })
    await waitFor(() => expect(result.current.basisErr).not.toBe(''))

    expect(result.current.basisErr).toContain('Gagal membaca akumulasi')
    expect(result.current.basisErr).not.toContain('Jalankan engine')
    expect(result.current.basis).toBeNull()
    expect(result.current.basisLoading).toBe(false)
  })

  it('spesifikasi induk gagal → pecahan TIDAK dilahirkan dgn field kosong', async () => {
    asetErr = { message: 'timeout' }
    const { result } = renderHook(() => usePemecahan('2026-08-27', onErr))
    await act(async () => { await result.current.pilihInduk(barang()) })

    expect(errs[0]).toContain('gagal memuat spesifikasi induk')
    expect(result.current.pecahan).toEqual([])
    expect(result.current.indukFields).toEqual({})
  })
})
