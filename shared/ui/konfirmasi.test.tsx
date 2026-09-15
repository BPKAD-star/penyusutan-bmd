// @vitest-environment jsdom
// ============================================================================
// Test `useKonfirmasi` / `KonfirmasiProvider` — SATU-SATUNYA pintu konfirmasi
// di aplikasi ini sejak `confirm()`/`prompt()`/`alert()` dilarang se-repo
// (CODING-STANDARD §4.5, keputusan user 2026-08-19).
//
// KENAPA BERKAS INI ADA: sampai 2026-09-15 ketiga berkas `shared/ui` yang
// mewujudkan larangan itu berada di coverage **0%** — jadi primitif yang
// dipakai MENYETUJUI & MEMBUKA KUNCI dokumen (RKBMD, Standar Harga) tak punya
// satu pun penjaga. Yang diuji di sini bukan tampilannya, melainkan empat
// aturan yang kalau lepas TIDAK menghasilkan error apa pun:
//
//   (1) promise yang tertimpa WAJIB diselesaikan sbg "batal" — kalau
//       menggantung, fungsi pemanggil berhenti di tengah tanpa jejak (bentuk
//       kegagalan senyap yang sama dgn loader nyangkut "Memuat…", INS-10);
//   (2) `kerjakan` yang melempar WAJIB ikut menolak promise-nya, supaya
//       `try/catch` yang sudah ada di pemanggil tetap bekerja (fail-closed);
//   (3) pop-up WAJIB tetap terbuka selama `kerjakan` berjalan — justru itu
//       yang mustahil dilakukan `confirm()`, dan kalau "dirapikan" jadi
//       menutup lebih awal, keadaan "Memproses…" hilang lagi tanpa suara;
//   (4) isi kotak catatan TIDAK boleh terbawa ke konfirmasi berikutnya —
//       alasan penolakan dokumen A muncul lagi saat menolak dokumen B.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { KonfirmasiProvider, useKonfirmasi, type OpsiKonfirmasi, type HasilKonfirmasi } from './konfirmasi'

/** Harness: satu tombol per opsi, hasil promise-nya dicatat apa adanya. */
function Harness({ opsi, onHasil, onGagal }: {
  opsi: OpsiKonfirmasi[]
  onHasil?: (h: HasilKonfirmasi, i: number) => void
  onGagal?: (e: unknown, i: number) => void
}) {
  const konfirmasi = useKonfirmasi()
  return (
    <div>
      {opsi.map((o, i) => (
        <button key={i} data-testid={`picu-${i}`} onClick={async () => {
          // ⚠️ `konfirmasi(o)` dipanggil LEBIH DULU, bukan ditaruh sbg argumen
          // `onHasil?.(...)`: optional chaining MEMUTUS evaluasi argumennya,
          // jadi kalau `onHasil` tak dioper, pop-upnya tak pernah dibuka sama
          // sekali — dan testnya gagal seolah komponennya yang rusak.
          try {
            const h = await konfirmasi(o)
            onHasil?.(h, i)
          } catch (e) { onGagal?.(e, i) }
        }}>picu {i}</button>
      ))}
    </div>
  )
}

const pasang = (p: Parameters<typeof Harness>[0]) =>
  render(<KonfirmasiProvider><Harness {...p} /></KonfirmasiProvider>)

// `globals` tidak dinyalakan di vitest.config.ts, jadi auto-cleanup Testing
// Library TIDAK jalan — tanpa ini pop-up test sebelumnya masih menempel di
// document & `getByTestId` gagal "multiple elements".
afterEach(cleanup)

describe('gagal berisik di luar provider', () => {
  it('useKonfirmasi MELEMPAR, tidak diam-diam mengembalikan ya/tidak', () => {
    // Sengaja: `{ya:false}` membuat tombolnya terlihat rusak (ditekan, tak
    // terjadi apa-apa); `{ya:true}` menjalankan aksi TANPA ditanyakan — dan
    // sebagian aksi itu menghapus barang.
    const diam = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Harness opsi={[{ judul: 'x', labelYa: 'Ya' }]} />))
      .toThrow(/di luar <KonfirmasiProvider>/)
    diam.mockRestore()
  })
})

describe('jawaban dasar', () => {
  it('Ya → {ya:true}, Batal → {ya:false}', async () => {
    const hasil: HasilKonfirmasi[] = []
    pasang({ opsi: [{ judul: 'Hapus barang ini?', labelYa: 'Hapus' }], onHasil: h => { hasil.push(h) } })

    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.click(await screen.findByText('Hapus'))
    await waitFor(() => expect(hasil).toHaveLength(1))
    expect(hasil[0]).toEqual({ ya: true, catatan: '' })

    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.click(await screen.findByText('Batal'))
    await waitFor(() => expect(hasil).toHaveLength(2))
    expect(hasil[1]).toEqual({ ya: false, catatan: '' })
  })

  it('pop-up MENUTUP sesudah dijawab', async () => {
    pasang({ opsi: [{ judul: 'Setujui?', labelYa: 'Ya' }] })
    fireEvent.click(screen.getByTestId('picu-0'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('Ya'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('catatan DI-TRIM sebelum dikirim balik', async () => {
    const hasil: HasilKonfirmasi[] = []
    pasang({
      opsi: [{ judul: 'Tolak dokumen?', labelYa: 'Tolak', catatan: { label: 'Alasan' } }],
      onHasil: h => { hasil.push(h) },
    })
    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '  kurang lampiran  ' } })
    fireEvent.click(screen.getByText('Tolak'))
    await waitFor(() => expect(hasil).toHaveLength(1))
    expect(hasil[0].catatan).toBe('kurang lampiran')
  })
})

describe('(1) konfirmasi yang TERTIMPA tak boleh menggantung', () => {
  it('yang lama diselesaikan sbg batal, yang baru tetap bisa dijawab', async () => {
    const hasil: [number, HasilKonfirmasi][] = []
    pasang({
      opsi: [
        { judul: 'Pertama', labelYa: 'Ya-1' },
        { judul: 'Kedua', labelYa: 'Ya-2' },
      ],
      onHasil: (h, i) => { hasil.push([i, h]) },
    })

    fireEvent.click(screen.getByTestId('picu-0'))
    await screen.findByText('Pertama')
    fireEvent.click(screen.getByTestId('picu-1'))       // menimpa yang belum dijawab

    // Yang pertama WAJIB sudah selesai — tanpa ini promise-nya menggantung
    // selamanya & fungsi pemanggilnya berhenti di tengah tanpa satu pun jejak.
    await waitFor(() => expect(hasil).toHaveLength(1))
    expect(hasil[0]).toEqual([0, { ya: false, catatan: '' }])

    fireEvent.click(await screen.findByText('Ya-2'))
    await waitFor(() => expect(hasil).toHaveLength(2))
    expect(hasil[1]).toEqual([1, { ya: true, catatan: '' }])
  })
})

describe('(2)(3) pekerjaan yang berjalan selagi pop-up terbuka', () => {
  it('pop-up TETAP TERBUKA & menampilkan "Memproses…" sampai kerjakan selesai', async () => {
    let lepas!: () => void
    const tertahan = new Promise<void>(r => { lepas = r })
    const hasil: HasilKonfirmasi[] = []
    pasang({
      opsi: [{ judul: 'Setujui usulan?', labelYa: 'Ya, setujui', kerjakan: () => tertahan }],
      onHasil: h => { hasil.push(h) },
    })

    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.click(await screen.findByText('Ya, setujui'))

    // Inilah yang mustahil dilakukan `confirm()` — ia membekukan seluruh tab.
    expect(await screen.findByText('Memproses…')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasil).toHaveLength(0)

    await act(async () => { lepas(); await tertahan })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(hasil[0]).toEqual({ ya: true, catatan: '' })
  })

  it('Batal DIABAIKAN selagi busy', async () => {
    let lepas!: () => void
    const tertahan = new Promise<void>(r => { lepas = r })
    const hasil: HasilKonfirmasi[] = []
    pasang({
      opsi: [{ judul: 'Setujui?', labelYa: 'Ya', kerjakan: () => tertahan }],
      onHasil: h => { hasil.push(h) },
    })
    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.click(await screen.findByText('Ya'))
    await screen.findByText('Memproses…')

    fireEvent.click(screen.getByText('Batal'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(hasil).toHaveLength(0)

    await act(async () => { lepas(); await tertahan })
    await waitFor(() => expect(hasil).toHaveLength(1))
    expect(hasil[0].ya).toBe(true)
  })

  it('kerjakan MELEMPAR → promise ikut menolak & pop-up ditutup', async () => {
    // Supaya `try/catch` yang sudah ada di pemanggil tetap bekerja apa adanya.
    const gagal: unknown[] = []
    const hasil: HasilKonfirmasi[] = []
    pasang({
      opsi: [{
        judul: 'Setujui?', labelYa: 'Ya',
        kerjakan: async () => { throw new Error('RPC ditolak guard') },
      }],
      onHasil: h => { hasil.push(h) },
      onGagal: e => { gagal.push(e) },
    })
    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.click(await screen.findByText('Ya'))

    await waitFor(() => expect(gagal).toHaveLength(1))
    expect((gagal[0] as Error).message).toBe('RPC ditolak guard')
    expect(hasil).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('kerjakan menerima catatan yang sudah di-trim', async () => {
    const diterima: string[] = []
    pasang({
      opsi: [{
        judul: 'Tolak?', labelYa: 'Tolak', catatan: { label: 'Alasan' },
        kerjakan: async c => { diterima.push(c) },
      }],
    })
    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: ' belum lengkap ' } })
    fireEvent.click(screen.getByText('Tolak'))
    await waitFor(() => expect(diterima).toEqual(['belum lengkap']))
  })
})

describe('(4) isi kotak catatan tak terbawa ke konfirmasi berikutnya', () => {
  // ⚠️ Skenarionya WAJIB "A ditimpa selagi MASIH TERBUKA", bukan "A dijawab
  // lalu B dibuka". Kalau A dijawab lebih dulu, pop-upnya dibongkar & state-nya
  // reset sendiri — jadi test bentuk itu tetap HIJAU walau `key={seri}` dicabut
  // (dibuktikan dgn mutasi: mencabut `key` tak menggagalkan satu test pun).
  // Yang benar-benar dijaga `key` adalah pergantian opsi TANPA pembongkaran.
  it('alasan dokumen A tak terbawa saat pop-up langsung diganti ke dokumen B', async () => {
    const hasil: HasilKonfirmasi[] = []
    pasang({
      opsi: [
        { judul: 'Tolak dokumen A?', labelYa: 'Tolak A', catatan: { label: 'Alasan' } },
        { judul: 'Tolak dokumen B?', labelYa: 'Tolak B', catatan: { label: 'Alasan' } },
      ],
      onHasil: h => { hasil.push(h) },
    })

    fireEvent.click(screen.getByTestId('picu-0'))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'alasan dokumen A' } })

    fireEvent.click(screen.getByTestId('picu-1'))       // MENIMPA, A belum dijawab
    await screen.findByText('Tolak dokumen B?')
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')

    // ...dan alasan A tak ikut terkirim saat B dijawab.
    fireEvent.click(screen.getByText('Tolak B'))
    await waitFor(() => expect(hasil).toHaveLength(2))
    expect(hasil[1]).toEqual({ ya: true, catatan: '' })
  })

  it('`awal` tetap dihormati sbg isian bawaan', async () => {
    pasang({ opsi: [{ judul: 'Ubah?', labelYa: 'Ya', catatan: { label: 'Catatan', awal: 'draf awal' } }] })
    fireEvent.click(screen.getByTestId('picu-0'))
    expect((await screen.findByRole('textbox') as HTMLTextAreaElement).value).toBe('draf awal')
  })
})

describe('pengganti alert()', () => {
  it('tanpaBatal → hanya SATU tombol', async () => {
    pasang({ opsi: [{ judul: 'Berhasil disimpan', labelYa: 'Tutup', tanpaBatal: true }] })
    fireEvent.click(screen.getByTestId('picu-0'))
    await screen.findByText('Tutup')
    expect(screen.queryByText('Batal')).toBeNull()
  })
})
