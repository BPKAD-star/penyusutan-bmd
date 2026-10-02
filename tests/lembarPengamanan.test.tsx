// @vitest-environment jsdom
// Uji STRUKTUR tabel lembar PENGAMANAN — IV.J.1.2 & IV.J.2.2 (rinci baru,
// keputusan user 2026-09-28).
//
// TESTING.md §10 menolak snapshot JSX — yang di sini bukan snapshot: ia
// mengunci INVARIAN yang kalau patah tak menghasilkan satu pun error, dan
// baru ketahuan sesudah lembarnya DICETAK (jumlah sel ≠ kepala, colSpan salah
// hitung, dst).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarPengamananPermendagri from '@/components/pelaporan/LembarPengamananPermendagri'
import { FORMAT_PENGAMANAN, URUT_PENGAMANAN } from '@/lib/formatPengamanan'
import type { BarisPengamanan } from '@/lib/laporanPengamanan'

afterEach(cleanup)

const N_RINCI = 15

let seq = 0
function baris(kode: string, nilai: number, opts: { lama?: boolean } = {}): BarisPengamanan {
  seq++
  return {
    id: seq, tanggal: '2026-07-05', periode: '2026-S2', aset_id: `a${seq}`,
    header: {
      no_sk: 'BAST-7/2026', tanggal: '2026-07-01', keterangan: 'Catatan kartu', skpd_id: 7,
      payload: opts.lama
        // Kartu SEBELUM 2026-09-08: identitasnya di `nip`.
        ? { nama_pegawai: 'Budi', nip: '19800101', jabatan: 'Staf', pangkat_golongan: 'Penata (III/c)' }
        : {
          nama_pegawai: 'Budi', nomor_identitas: '3506010101', status_penghuni: 'PNS',
          jabatan: 'Staf', alamat: 'Jl. Melati 3', pakta_no: 'PI-9/2026', pakta_tgl: '2026-07-02',
          sip_no: 'SIP-4/2026', sip_tgl: '2026-07-03',
        },
    },
    aset: {
      kode, nama_barang: 'Laptop Dinas', uraian_barang: 'Personal Computer',
      nibar: '1'.repeat(45), merek_tipe: 'Lenovo Thinkpad', no_polisi: null,
      nilai_perolehan: nilai, keterangan: null, skpd_id: 7,
    },
  }
}

const ROWS = [baris('1.3.2.05.02.06.121', 1_000), baris('1.3.2.05.02.07.001', 2_000)]

function sajikan(id: typeof URUT_PENGAMANAN[number], rows = ROWS) {
  return render(
    <LembarPengamananPermendagri
      f={FORMAT_PENGAMANAN[id]} rows={rows}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-28" />,
  )
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement
const kolomKepala = (t: HTMLTableElement) =>
  [...t.querySelectorAll('thead tr')[0].querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)

describe.each(URUT_PENGAMANAN.map(id => [id] as const))('%s — lembar rinci', id => {
  const f = FORMAT_PENGAMANAN[id]

  it(`kepala & <colgroup> tepat ${N_RINCI} kolom`, () => {
    const { container } = sajikan(id)
    expect(f.kolom.length).toBe(N_RINCI)
    expect(kolomKepala(tabelDari(container))).toBe(N_RINCI)
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(N_RINCI)
  })

  it('SETIAP baris (kelompok, barang, TOTAL) selebar tabel — Σ colSpan', () => {
    const { container } = sajikan(id)
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    const lebar = (tr: Element) => [...tr.querySelectorAll('td')]
      .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)
    trs.forEach((tr, i) => expect(lebar(tr), `baris ke-${i}`).toBe(N_RINCI))
  })

  it('kelompok = golongan cabangnya, ditutup TOTAL 2 desimal', () => {
    const { container } = sajikan(id)
    const teks = [...tabelDari(container).querySelectorAll('tbody tr')].map(tr => tr.textContent || '')
    expect(teks.some(t => t.startsWith(f.golongan))).toBe(true)
    const akhir = teks[teks.length - 1]
    expect(akhir).toContain('TOTAL')
    expect(akhir).toContain('3.000,00') // 1.000 + 2.000
  })

  it('mencetak nomor format & judul cabangnya', () => {
    const { container } = sajikan(id)
    expect(container.textContent).toContain(`Format ${f.kode}`)
    expect(container.textContent).toContain(f.judul)
    expect(container.textContent, 'judul kolom identitas orang').toContain(`Nama ${f.grupOrang}`)
  })

  it('Keterangan diambil dari KARTU, Merk/Tipe dari barang', () => {
    const { container } = sajikan(id)
    expect(container.textContent).toContain('Catatan kartu')
    expect(container.textContent).toContain('Lenovo Thinkpad')
  })

  it('BAST terisi; dokumen kedua ikut cabang (PM: Pakta, Rumah Negara: SIP); Dokumen Pendukung TIDAK dicetak', () => {
    const { container } = sajikan(id)
    const t = container.textContent || ''
    expect(t).toContain('BAST-7/2026')
    if (id === 'rumah_negara') {
      expect(t).toContain('SIP-4/2026')
      expect(t).toContain('Surat Izin Penghunian')
      expect(t).not.toContain('PI-9/2026')
    } else {
      expect(t).toContain('PI-9/2026')
      expect(t).not.toContain('SIP-4/2026')
    }
    expect(t).not.toContain('Dokumen Pendukung')
  })

  it('kartu LAMA tetap mencetak nomor identitasnya (dari `nip`)', () => {
    // ⚠️ Tanpa cadangan `identitasPengamanan`, kolom ini KOSONG untuk seluruh
    // kartu sebelum 2026-09-08 — tanpa satu pun error.
    cleanup()
    const { container } = sajikan(id, [baris('1.3.2.05.02.06.121', 1_000, { lama: true })])
    expect(container.textContent).toContain('19800101')
  })

  it('daftar kosong → satu baris keterangan selebar tabel & TANPA TOTAL', () => {
    const { container } = sajikan(id, [])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBe(1)
    const td = trs[0].querySelector('td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(N_RINCI)
    expect(td.textContent).toBe(f.kosong)
  })
})
