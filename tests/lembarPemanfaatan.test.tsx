// @vitest-environment jsdom
// Uji STRUKTUR tabel lembar PEMANFAATAN (15 kolom, dikelompokkan per golongan).
//
// TESTING.md §10 menolak snapshot JSX — yang di sini bukan snapshot: ia
// mengunci INVARIAN yang kalau patah tak menghasilkan satu pun error, dan
// baru ketahuan sesudah lembarnya DICETAK (jumlah sel ≠ kepala, colSpan salah
// hitung, total berlipat).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarPemanfaatanPermendagri, {
  keteranganPemanfaatan, kelompokPemanfaatan,
} from '@/components/pelaporan/LembarPemanfaatanPermendagri'
import { FORMAT_PEMANFAATAN } from '@/lib/formatPemanfaatan'
import type { BarisPemanfaatanLembar } from '@/lib/laporanPemanfaatanPermendagri'

afterEach(cleanup)

const N = 15

let seq = 0
function baris(kode: string, nilai: number, o: {
  asetId?: string; lingkup?: 'seluruh' | 'sebagian'; bagian?: string | null
  keteranganKartu?: string | null; jenis?: string
} = {}): BarisPemanfaatanLembar {
  seq++
  return {
    key: `h${seq}|a${seq}`,
    header: {
      id: `h${seq}`, no_sk: '000.2.3.2/145/2026', tanggal: '2026-01-01',
      keterangan: o.keteranganKartu === undefined ? 'Catatan kartu' : o.keteranganKartu,
      skpd_id: 7,
      payload: {
        jenis_pemanfaatan: o.jenis || 'pinjam_pakai', mitra: 'Kejaksaan Negeri Kabupaten Kediri',
        mulai: '2026-01-01', masa_tahun: 5, berakhir: '2031-01-01',
      },
    },
    aset: {
      id: o.asetId || `a${seq}`, kode, nama_barang: 'Gedung Kantor', uraian_barang: 'Bangunan Gedung Kantor',
      nibar: '1'.repeat(45), merek_tipe: 'Beton', no_polisi: null,
      alamat_detail: 'Jalan Soekarno Hatta No 01', nilai_perolehan: nilai, keterangan: 'ket aset',
    },
    lingkup: o.lingkup || 'seluruh', bagian: o.bagian ?? null, selesaiTgl: null,
  }
}

function sajikan(rows: BarisPemanfaatanLembar[]) {
  return render(
    <LembarPemanfaatanPermendagri
      f={FORMAT_PEMANFAATAN} rows={rows}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      judulPeriode="SEMESTER I" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-10-01" />,
  )
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement
const lebar = (tr: Element) => [...tr.querySelectorAll('td, th')]
  .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)

const DUA_GOLONGAN = [
  baris('1.3.3.01.01.01.001', 1_000),
  baris('1.3.3.01.01.01.002', 2_000),
  baris('1.5.4.01.01.02.003', 4_000),
]

describe('lembar Pemanfaatan', () => {
  it(`kepala & <colgroup> tepat ${N} kolom`, () => {
    const { container } = sajikan(DUA_GOLONGAN)
    const t = tabelDari(container)
    expect(FORMAT_PEMANFAATAN.kolom.length).toBe(N)
    expect(lebar(t.querySelectorAll('thead tr')[0])).toBe(N)
    expect(t.querySelectorAll('colgroup col').length).toBe(N)
  })

  it('SETIAP baris (kelompok, barang, total jenis, TOTAL) selebar tabel — Σ colSpan', () => {
    const { container } = sajikan(DUA_GOLONGAN)
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBeGreaterThan(0)
    trs.forEach((tr, i) => expect(lebar(tr), `baris ke-${i}`).toBe(N))
  })

  it('dikelompokkan per golongan yang ADA, urut kode, tiap kelompok ditutup totalnya', () => {
    const { container } = sajikan(DUA_GOLONGAN)
    const teks = [...tabelDari(container).querySelectorAll('tbody tr')].map(tr => tr.textContent || '')
    const iGedung = teks.findIndex(t => t.startsWith('1.3.3 — Gedung dan Bangunan'))
    const iLain = teks.findIndex(t => t.startsWith('1.5.4 — Aset Lain-Lain'))
    expect(iGedung).toBeGreaterThanOrEqual(0)
    expect(iLain).toBeGreaterThan(iGedung)
    expect(teks.some(t => t.startsWith('Total 1.3.3') && t.includes('3.000,00'))).toBe(true)
    expect(teks.some(t => t.startsWith('Total 1.5.4') && t.includes('4.000,00'))).toBe(true)
    const akhir = teks[teks.length - 1]
    expect(akhir).toContain('TOTAL')
    expect(akhir).toContain('7.000,00')
  })

  it('golongan yang TIDAK ada di data tak dibuatkan kelompok kosong', () => {
    const { container } = sajikan([baris('1.3.3.01.01.01.001', 1)])
    expect(container.textContent).not.toContain('1.5.4')
    expect(container.textContent).not.toContain('1.3.1')
  })

  it('isi sel mengikuti contoh: jenis, mitra, jangka, mulai, berakhir, dokumen', () => {
    const { container } = sajikan([baris('1.3.3.01.01.01.001', 1)])
    const t = container.textContent || ''
    expect(t).toContain('Pinjam Pakai')
    expect(t).toContain('Kejaksaan Negeri Kabupaten Kediri')
    expect(t).toContain('5 tahun')
    expect(t).toContain('01/01/2026')
    expect(t).toContain('01/01/2031')
    expect(t).toContain('000.2.3.2/145/2026')
    expect(t).toContain('Jalan Soekarno Hatta No 01')
  })

  it('Nilai Perolehan = nilai BARANG (register), bukan nominal sewa', () => {
    const r = baris('1.3.3.01.01.01.001', 35_000_000, { jenis: 'sewa' })
    r.header.payload!.nilai_pemanfaatan = 999
    const { container } = sajikan([r])
    expect(container.textContent).toContain('35.000.000,00')
    expect(container.textContent).not.toContain('999,00')
  })

  it('barang yang muncul di DUA perjanjian: total dijumlah SEKALI + ada catatan', () => {
    const a = baris('1.3.3.01.01.01.001', 5_000, { asetId: 'sama' })
    const b = baris('1.3.3.01.01.01.001', 5_000, { asetId: 'sama' })
    const { container } = sajikan([a, b])
    const teks = [...tabelDari(container).querySelectorAll('tbody tr')].map(tr => tr.textContent || '')
    const akhir = teks[teks.length - 1]
    expect(akhir).toContain('TOTAL')
    expect(akhir).toContain('5.000,00')
    expect(akhir).not.toContain('10.000,00')
    expect(container.textContent).toContain('lebih dari satu')
  })

  it('TANPA catatan kembar kalau tak ada barang ganda', () => {
    const { container } = sajikan(DUA_GOLONGAN)
    expect(container.textContent).not.toContain('lebih dari satu')
  })

  it('nomor format tak dicetak sampai diketahui; judul tetap ada', () => {
    const { container } = sajikan(DUA_GOLONGAN)
    expect(container.textContent).not.toMatch(/Format\s+IV/)
    expect(container.textContent).toContain(FORMAT_PEMANFAATAN.judul)
  })

  it('daftar kosong → satu baris keterangan selebar tabel & TANPA TOTAL', () => {
    const { container } = sajikan([])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBe(1)
    const td = trs[0].querySelector('td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(N)
    expect(td.textContent).toBe(FORMAT_PEMANFAATAN.kosong)
  })
})

describe('keteranganPemanfaatan', () => {
  it('kartu menang atas keterangan aset', () => {
    expect(keteranganPemanfaatan(baris('1.3.3.01', 1, { keteranganKartu: 'dari kartu' }))).toBe('dari kartu')
  })
  it('kartu kosong → jatuh ke keterangan aset', () => {
    expect(keteranganPemanfaatan(baris('1.3.3.01', 1, { keteranganKartu: '' }))).toBe('ket aset')
  })
  it('pemanfaatan SEBAGIAN diberi penanda (bukan seluruh gedung)', () => {
    const r = baris('1.3.3.01', 1, { lingkup: 'sebagian', bagian: 'Ruang 2' })
    expect(keteranganPemanfaatan(r)).toBe('Sebagian: Ruang 2. Catatan kartu')
  })
  it('sebagian tanpa teks bagian & tanpa keterangan → cukup "Sebagian"', () => {
    const r = baris('1.3.3.01', 1, { lingkup: 'sebagian', keteranganKartu: '' })
    r.aset.keterangan = null
    expect(keteranganPemanfaatan(r)).toBe('Sebagian')
  })
})

describe('kelompokPemanfaatan', () => {
  it('urut kode & nama dari GOLONGAN_REKAP', () => {
    const k = kelompokPemanfaatan([baris('1.5.4.01', 1), baris('1.3.3.01', 1)])
    expect(k.map(x => x.kode)).toEqual(['1.3.3', '1.5.4'])
    expect(k.map(x => x.nama)).toEqual(['Gedung dan Bangunan', 'Aset Lain-Lain'])
  })
})
