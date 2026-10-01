// @vitest-environment jsdom
// Uji STRUKTUR tabel LHI — III.B.3 (sel bertumpuk + blok "Data Awal Induk") & kop
// identitas. Mengunci invarian yang kalau patah tak menghasilkan error apa pun:
// kolom tak sejajar dgn kepala, colSpan salah hitung, kop lembar kosong.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LhiTabel from '@/components/inventarisasi/LhiTabel'
import { PENGELOLA_BARANG_LHI } from '@/lib/inventarisasiLaporan'

afterEach(cleanup)

const baris = (o: Record<string, string | number> = {}) => ({
  no: 1, kode: '1.3.3.01.01.01.001', uraian: 'Bangunan Gedung Kantor Permanen',
  nama: 'Rehab Kantor KPU', nibar: '1'.repeat(45), merek_tipe: '', spek_lain: '',
  tgl: '01/01/2026', nilai: 169_028_031,
  induk_kode: '1.3.3.01.01.01.001', induk_uraian: 'Bangunan Gedung Kantor Permanen',
  induk_nama: 'Kantor KPU. Kab Kediri', induk_nibar: '2'.repeat(45),
  induk_tgl: '01/01/2008', induk_nilai: 654_341_000, keterangan: 'Perlu digabung ke induk tahun 2008', ...o,
})

// Tabel DATA — bukan tabel kecil butir (3)–(5) di kop, yang juga ber-<tbody><tr>.
const tabelData = (c: HTMLElement) => c.querySelector('table.border-collapse') as HTMLTableElement

const lebar = (tr: Element) => [...tr.querySelectorAll('td, th')]
  .reduce((a, c) => a + (Number(c.getAttribute('colspan')) || 1), 0)

describe('LhiTabel III.B.3', () => {
  it('kepala dua tingkat: "Data Awal Induk" membentang 4 kolom, 12 kolom di dasar', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} />)
    const heads = [...container.querySelectorAll('thead tr')]
    expect(heads).toHaveLength(2)
    const grup = [...heads[0].querySelectorAll('th')].find(th => th.textContent === 'Data Awal Induk')!
    expect(grup.getAttribute('colspan')).toBe('4')
    // Baris 2 kepala hanya memuat ISI grup (4 kolom); kolom biasa menjulur dari baris 1.
    expect(heads[1].querySelectorAll('th')).toHaveLength(4)
    // Baris 1: 7 kolom biasa sebelum induk + 1 sel grup + Keterangan = 9.
    expect(heads[0].querySelectorAll('th')).toHaveLength(9)
    expect(tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(12)
  })

  it('sel Kode Barang & Nama Barang BERTUMPUK: kode/uraian & nama/NIBAR', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} />)
    const td = tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(td[1].querySelectorAll('div')).toHaveLength(2)
    expect(td[1].textContent).toContain('1.3.3.01.01.01.001')
    expect(td[1].textContent).toContain('Bangunan Gedung Kantor Permanen')
    expect(td[2].querySelectorAll('div')[1].textContent).toBe('1'.repeat(45))
    // blok induk
    expect(td[7].querySelectorAll('div')).toHaveLength(2)
    expect(td[8].querySelectorAll('div')[1].textContent).toBe('2'.repeat(45))
  })

  it('NIBAR boleh dipatahkan di mana pun (45 digit satu kata tak memaksa kolom melebar)', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} />)
    const nibar = tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')[2].querySelectorAll('div')[1]
    expect(nibar.className).toContain('overflow-wrap:anywhere')
  })

  it('nilai dalam Rupiah 2 desimal, di kedua blok', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} />)
    const td = tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(td[6].textContent).toBe('169.028.031,00')
    expect(td[10].textContent).toBe('654.341.000,00')
  })

  it('baris Jumlah selebar tabel & menjumlah NILAI PEROLEHAN (bukan nilai induk)', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris(), baris({ no: 2 })]} />)
    const trs = [...tabelData(container).querySelectorAll('tbody tr')]
    const jumlah = trs[trs.length - 1]
    expect(lebar(jumlah)).toBe(12)
    expect(jumlah.textContent).toContain('338.056.062,00')
    expect(jumlah.textContent).not.toContain('654.341.000')
  })

  it('nilai induk kosong (tak diketahui) → sel kosong, bukan "0,00"', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris({ induk_nilai: '' })]} />)
    expect(tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')[10].textContent).toBe('')
  })
})

describe('LhiTabel — kop identitas', () => {
  const kop = (c: HTMLElement) => Object.fromEntries(
    [...c.querySelectorAll('table')[0].querySelectorAll('tr')].map(tr => {
      const td = tr.querySelectorAll('td'); return [td[0].textContent, td[2].textContent]
    }))

  it('Pengelola Barang SELALU Badan Keuangan dan Aset Daerah, walau identitas tak dikirim', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} />)
    expect(kop(container)['Pengelola Barang']).toBe(PENGELOLA_BARANG_LHI)
  })

  it('Kuasa PB & PB diisi dari identitas; yang tak diketahui bertitik-titik', () => {
    const { container } = render(
      <LhiTabel kode="III.B.3" rows={[baris()]} identitas={{ kuasa: 'UPTD A1', pengguna: 'Dinas A' }} />)
    expect(kop(container)).toMatchObject({
      'Kuasa Pengguna Barang': 'UPTD A1', 'Pengguna Barang': 'Dinas A',
      'Pengelola Barang': PENGELOLA_BARANG_LHI,
    })
    cleanup()
    const { container: c2 } = render(<LhiTabel kode="III.B.3" rows={[baris()]} identitas={{}} />)
    expect(kop(c2)['Kuasa Pengguna Barang']).toContain('……')
    expect(kop(c2)['Pengelola Barang']).toBe(PENGELOLA_BARANG_LHI)
  })

  it('berlaku untuk format LHI lain juga (bukan cuma III.B.3)', () => {
    const { container } = render(<LhiTabel kode="III.B.1" rows={[]} />)
    expect(kop(container)['Pengelola Barang']).toBe(PENGELOLA_BARANG_LHI)
  })
})

describe('LhiTabel III.B.12', () => {
  const b12 = (o: Record<string, string | number> = {}) => ({
    no: 1, nama: 'Rehab Kantor KPU', nibar: '1'.repeat(45), merek_tipe: '', spek_lain: '',
    tgl: '01/01/2026', jumlah: 1, satuan: 'Unit', nilai: 169_028_031,
    kode_lama: '1.3.3.01.01.01.001', uraian_lama: 'Bangunan Gedung Kantor Permanen',
    kode_baru: '1.3.3.02.01.01.001', uraian_baru: 'Bangunan Gedung Kantor Semi Permanen',
    keterangan: 'Perlu di Reklas', ...o,
  })

  it('10 kolom, kepala SATU tingkat (tak ada blok grup)', () => {
    const { container } = render(<LhiTabel kode="III.B.12" rows={[b12()]} />)
    expect(tabelData(container).querySelectorAll('thead tr')).toHaveLength(1)
    expect(tabelData(container).querySelectorAll('thead th')).toHaveLength(10)
    expect(tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(10)
  })

  it('sel bertumpuk: nama/NIBAR, jumlah/satuan, kode lama/uraian, kode baru/uraian', () => {
    const { container } = render(<LhiTabel kode="III.B.12" rows={[b12()]} />)
    const td = tabelData(container).querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(td[1].querySelectorAll('div')[1].textContent).toBe('1'.repeat(45))
    expect([...td[5].querySelectorAll('div')].map(d => d.textContent)).toEqual(['1', 'Unit'])
    expect([...td[7].querySelectorAll('div')].map(d => d.textContent))
      .toEqual(['1.3.3.01.01.01.001', 'Bangunan Gedung Kantor Permanen'])
    expect([...td[8].querySelectorAll('div')].map(d => d.textContent))
      .toEqual(['1.3.3.02.01.01.001', 'Bangunan Gedung Kantor Semi Permanen'])
  })

  it('Nilai Perolehan 2 desimal; baris Jumlah selebar tabel & menjumlah nilai', () => {
    const { container } = render(<LhiTabel kode="III.B.12" rows={[b12(), b12({ no: 2 })]} />)
    const trs = [...tabelData(container).querySelectorAll('tbody tr')]
    expect(trs[0].querySelectorAll('td')[6].textContent).toBe('169.028.031,00')
    const jumlah = trs[trs.length - 1]
    expect(lebar(jumlah)).toBe(10)
    expect(jumlah.textContent).toContain('338.056.062,00')
  })

  it('judul memuat nama format & nomornya', () => {
    const { container } = render(<LhiTabel kode="III.B.12" rows={[b12()]} />)
    expect(container.textContent).toContain('BMD Terjadi Perubahan Kodefikasi Barang')
    expect(container.textContent).toContain('Format III.B.12')
  })
})

describe('LhiTabel — kop judul (2026-10-01)', () => {
  it('judul · rekapitulasi · jenis aset langsung · tahun anggaran; tanpa baris Provinsi/Kabupaten & "BMD berupa"', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} jenisAset="Gedung dan Bangunan" tahun={2026} />)
    const t = container.textContent || ''
    expect(t).toContain('Laporan Hasil Inventarisasi')
    expect(t).not.toContain('(LHI)')
    expect(t).toContain('Gedung dan Bangunan')
    expect(t).toContain('Tahun Anggaran 2026')
    expect(t).not.toMatch(/Provinsi Jawa Timur/i)
    expect(t).not.toMatch(/BMD berupa/i)
  })

  it('"Format III.B.x" di KANAN ATAS kop', () => {
    const { container } = render(<LhiTabel kode="III.B.3" rows={[baris()]} tahun={2026} />)
    const f = Array.from(container.querySelectorAll('p')).find(p => /^Format III\.B\.3$/.test(p.textContent || ''))
    expect(f).toBeTruthy()
    expect(f!.className).toMatch(/absolute/)
    expect(f!.className).toMatch(/right-0/)
    expect(f!.className).toMatch(/top-0/)
  })
})
