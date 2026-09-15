// @vitest-environment jsdom
// ============================================================================
// Test KonfirmasiModal — lapisan TAMPILAN pengganti `confirm()`/`prompt()`/
// `alert()` (CODING-STANDARD §4.5). Perilaku alurnya diuji di
// shared/ui/konfirmasi.test.tsx; yang dijaga DI SINI empat hal yang kalau
// lepas tidak menghasilkan satu pun error:
//
//   (1) KELAS TAILWIND UTUH. `bg-${x}-600` yang dirakit runtime TIDAK PERNAH
//       ikut terpindai saat build, jadi tombolnya tampil TANPA WARNA sama
//       sekali — dan di pop-up yang membedakan "Setujui" (teal) dari "Tolak"
//       (merah) dan "Buka Kunci" (amber), warna itu bukan hiasan. Sudah pernah
//       terjadi (CLAUDE.md, 2026-08-19).
//   (2) Esc menutup, TAPI diabaikan selagi busy — menutup layar di tengah
//       operasi cuma menyembunyikan hasilnya; pekerjaannya tetap jalan di
//       server.
//   (3) Klik di luar tidak menutup kalau tetikus MULAI ditekan di dalam kartu
//       (components/backdropClose) — kalau lepas, catatan telaah yang sedang
//       diblok hilang begitu saja.
//   (4) Selagi busy kedua tombol terkunci & labelnya "Memproses…".
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import KonfirmasiModal, { type NadaKonfirmasi } from './KonfirmasiModal'

afterEach(cleanup)

const pasang = (p: Partial<React.ComponentProps<typeof KonfirmasiModal>> = {}) => {
  const onYa = vi.fn(), onBatal = vi.fn()
  render(<KonfirmasiModal judul="Setujui usulan ini?" labelYa="Ya, setujui"
    onYa={onYa} onBatal={onBatal} {...p} />)
  return { onYa, onBatal }
}
const tombolYa = (label = 'Ya, setujui') => screen.getByText(label)

describe('(1) kelas nada WAJIB string utuh di sumber, bukan dirakit runtime', () => {
  // Kelas yang dirakit runtime lolos typecheck, lolos test yang cuma memeriksa
  // "ada tombolnya", dan tampil tanpa warna di produksi.
  const diharap: Record<NadaKonfirmasi, string> = {
    teal: 'bg-teal',
    merah: 'bg-red-600',
    amber: 'bg-amber-600',
  }
  for (const [nada, kelas] of Object.entries(diharap) as [NadaKonfirmasi, string][]) {
    it(`nada "${nada}" memakai ${kelas}`, () => {
      pasang({ nada })
      expect(tombolYa().className).toContain(kelas)
    })
  }

  it('ketiga nada menghasilkan kelas tombol yang BERBEDA', () => {
    const kelas = (['teal', 'merah', 'amber'] as NadaKonfirmasi[]).map(nada => {
      cleanup()
      pasang({ nada })
      return tombolYa().className
    })
    expect(new Set(kelas).size).toBe(3)
  })

  it('tak ada sisa penanda template (`${`) di kelas yang dirender', () => {
    pasang({ nada: 'merah', peringatan: 'Tak bisa dibatalkan.' })
    for (const el of Array.from(document.querySelectorAll('[class]')))
      expect(el.className).not.toContain('${')
  })
})

describe('(2) Esc', () => {
  it('Esc menutup', () => {
    const { onBatal } = pasang()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBatal).toHaveBeenCalledTimes(1)
  })
  it('Esc DIABAIKAN selagi busy', () => {
    const { onBatal } = pasang({ busy: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBatal).not.toHaveBeenCalled()
  })
  it('tombol lain tidak menutup', () => {
    const { onBatal } = pasang()
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onBatal).not.toHaveBeenCalled()
  })
  it('pendengar dicabut saat pop-up dibongkar', () => {
    const { onBatal } = pasang()
    cleanup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBatal).not.toHaveBeenCalled()
  })
})

describe('(3) klik di luar — tak boleh menutup saat teks sedang diblok', () => {
  const backdrop = () => screen.getByRole('dialog')

  it('tekan DAN lepas di backdrop → menutup', () => {
    const { onBatal } = pasang()
    fireEvent.mouseDown(backdrop())
    fireEvent.click(backdrop())
    expect(onBatal).toHaveBeenCalledTimes(1)
  })

  it('tekan di DALAM kartu lalu lepas di backdrop → TIDAK menutup', () => {
    // Persis yang terjadi saat operator memblok teks catatan lalu menyeret
    // kursornya keluar kotak: ketikan yang belum disimpan hilang begitu saja.
    const { onBatal } = pasang({ catatan: { label: 'Alasan' } })
    fireEvent.mouseDown(screen.getByRole('textbox'))
    fireEvent.click(backdrop())
    expect(onBatal).not.toHaveBeenCalled()
  })

  it('klik di luar DIABAIKAN selagi busy', () => {
    const { onBatal } = pasang({ busy: true })
    fireEvent.mouseDown(backdrop())
    fireEvent.click(backdrop())
    expect(onBatal).not.toHaveBeenCalled()
  })
})

describe('(4) busy', () => {
  it('label jadi "Memproses…" & kedua tombol terkunci', () => {
    pasang({ busy: true })
    const ya = screen.getByText('Memproses…') as HTMLButtonElement
    const batal = screen.getByText('Batal') as HTMLButtonElement
    expect(ya.disabled).toBe(true)
    expect(batal.disabled).toBe(true)
    expect(screen.queryByText('Ya, setujui')).toBeNull()
  })
  it('kotak catatan ikut terkunci', () => {
    pasang({ busy: true, catatan: { label: 'Alasan' } })
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  })
})

describe('isi pop-up', () => {
  it('rincian ditampilkan sbg pasangan label/nilai', () => {
    pasang({ rincian: [{ label: 'SKPD', nilai: 'Dinas Pendidikan' }, { label: 'Baris', nilai: 12 }] })
    expect(screen.getByText('SKPD')).toBeTruthy()
    expect(screen.getByText('Dinas Pendidikan')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })
  it('rincian KOSONG tidak menyisakan kotak hampa', () => {
    pasang({ rincian: [] })
    expect(document.querySelector('dl')).toBeNull()
  })
  it('judul, subjudul, isi, & peringatan dirender', () => {
    pasang({ subjudul: 'BKAD · SSH · TA 2027', peringatan: 'Menarik baris dari acuan bersama.',
      children: 'Barang yang sudah dipakai SKPD lain tetap berdiri.' })
    expect(screen.getByText('Setujui usulan ini?')).toBeTruthy()
    expect(screen.getByText('BKAD · SSH · TA 2027')).toBeTruthy()
    expect(screen.getByText('Menarik baris dari acuan bersama.')).toBeTruthy()
    expect(screen.getByText('Barang yang sudah dipakai SKPD lain tetap berdiri.')).toBeTruthy()
  })
  it('ikon bawaan "?" kalau tak diisi', () => {
    pasang()
    expect(screen.getByText('?')).toBeTruthy()
  })
  it('labelBatal bisa diganti', () => {
    pasang({ labelBatal: 'Kembali' })
    expect(screen.getByText('Kembali')).toBeTruthy()
    expect(screen.queryByText('Batal')).toBeNull()
  })
  it('tanpaBatal menyembunyikan tombol Batal (pengganti alert())', () => {
    pasang({ tanpaBatal: true })
    expect(screen.queryByText('Batal')).toBeNull()
    expect(tombolYa()).toBeTruthy()
  })
  it('petunjuk kotak catatan dirender', () => {
    pasang({ catatan: { label: 'Alasan', petunjuk: 'Boleh dikosongkan.' } })
    expect(screen.getByText('Boleh dikosongkan.')).toBeTruthy()
  })
})

describe('catatan dikirim ke onYa', () => {
  it('di-trim, dan string kosong kalau tak ada kotaknya', () => {
    const { onYa } = pasang()
    fireEvent.click(tombolYa())
    expect(onYa).toHaveBeenCalledWith('')
  })
  it('isi kotak dikirim apa adanya sesudah di-trim', () => {
    const { onYa } = pasang({ catatan: { label: 'Alasan', awal: 'draf' } })
    const kotak = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(kotak.value).toBe('draf')
    fireEvent.change(kotak, { target: { value: '  lampiran belum lengkap \n' } })
    fireEvent.click(tombolYa())
    expect(onYa).toHaveBeenCalledWith('lampiran belum lengkap')
  })
})

describe('aksesibilitas', () => {
  it('backdrop ber-role dialog & aria-modal', () => {
    pasang()
    const d = screen.getByRole('dialog')
    expect(d.getAttribute('aria-modal')).toBe('true')
  })
  it('berada di atas modal biasa (z-50) — konfirmasi sering dipicu DARI modal', () => {
    pasang()
    expect(screen.getByRole('dialog').className).toContain('z-[60]')
  })
})
