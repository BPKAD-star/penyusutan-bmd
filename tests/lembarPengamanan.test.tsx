// @vitest-environment jsdom
// Uji STRUKTUR tabel lembar PENGAMANAN — IV.J.1.2 & IV.J.2.2.
//
// Satu invarian yang kalau patah tak menghasilkan error & baru ketahuan sesudah
// DICETAK: Σ colSpan kepala ≠ jumlah sel isi → tabel bergeser sendiri, angka
// jatuh di kolom yang salah, & `table-fixed` menyembunyikannya sampai kertasnya
// keluar. Lembar ini punya kepala DUA tingkat dgn tiga blok bergrup, jadi
// risikonya nyata walau tabelnya datar.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarPengamananPermendagri from '@/components/pelaporan/LembarPengamananPermendagri'
import { FORMAT_PENGAMANAN, URUT_PENGAMANAN } from '@/lib/formatPengamanan'
import type { BarisPengamanan } from '@/lib/laporanPengamanan'

afterEach(cleanup)

let seq = 0
function baris(kode: string, opts: { lama?: boolean } = {}): BarisPengamanan {
  seq++
  return {
    id: seq, tanggal: '2026-07-05', periode: '2026-S2', aset_id: `a${seq}`,
    header: {
      no_sk: 'BAST-7/2026', tanggal: '2026-07-01', skpd_id: 7,
      payload: opts.lama
        // Kartu SEBELUM 2026-09-08: identitasnya di `nip`.
        ? { nama_pegawai: 'Budi', nip: '19800101', jabatan: 'Staf', pangkat_golongan: 'Penata (III/c)' }
        : {
          nama_pegawai: 'Budi', nomor_identitas: '3506010101', status_penghuni: 'PNS',
          jabatan: 'Staf', alamat: 'Jl. Melati 3', pakta_no: 'PI-9/2026', pakta_tgl: '2026-07-02',
        },
    },
    aset: {
      kode, nama_barang: 'Laptop Dinas', uraian_barang: 'Personal Computer',
      nibar: '1'.repeat(45), alamat_detail: 'Ruang Aset', keterangan: null, skpd_id: 7,
    },
  }
}

const ROWS = [baris('1.3.2.05.02.06.121'), baris('1.3.2.05.02.07.001')]

function sajikan(id: typeof URUT_PENGAMANAN[number], rows = ROWS) {
  return render(
    <LembarPengamananPermendagri
      f={FORMAT_PENGAMANAN[id]} rows={rows}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-08" />,
  )
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement
const kolomKepala = (t: HTMLTableElement, i = 0) =>
  [...t.querySelectorAll('thead tr')[i].querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)

describe.each(URUT_PENGAMANAN.map(id => [id] as const))('%s', id => {
  const f = FORMAT_PENGAMANAN[id]
  const n = f.kolom.length

  it(`kepala & <colgroup> menjanjikan tepat ${16} sel`, () => {
    const { container } = sajikan(id)
    const t = tabelDari(container)
    expect(kolomKepala(t)).toBe(n)
    expect(n, 'registry bergeser dari jumlah kolom formatnya').toBe(16)
    expect(t.querySelectorAll('colgroup col').length).toBe(n)
  })

  it('BARIS KEDUA kepala menjanjikan sel yang sama banyaknya', () => {
    const t = tabelDari(sajikan(id).container)
    const rowspan = [...t.querySelectorAll('thead tr')[0].querySelectorAll('th')]
      .filter(th => th.getAttribute('rowspan')).length
    expect(kolomKepala(t, 1) + rowspan).toBe(n)
  })

  it('SETIAP baris isi punya sel sebanyak kolomnya', () => {
    const trs = [...tabelDari(sajikan(id).container).querySelectorAll('tbody tr')]
    expect(trs.length).toBe(ROWS.length)
    trs.forEach((tr, i) => expect(tr.querySelectorAll('td').length, `baris ke-${i}`).toBe(n))
  })

  it('barisnya BERNOMOR 1,2,3… — lembar ini datar', () => {
    const trs = [...tabelDari(sajikan(id).container).querySelectorAll('tbody tr')]
    expect(trs.map(tr => tr.querySelectorAll('td')[0].textContent)).toEqual(['1', '2'])
  })

  it('mencetak nomor format & judul cabangnya', () => {
    const { container } = sajikan(id)
    expect(container.textContent).toContain(`Format ${f.kode}`)
    expect(container.textContent).toContain(f.judul)
    expect(container.textContent, 'judul blok identitas').toContain(`Nama ${f.grupOrang}`)
  })

  it('BAST & Pakta Integritas terisi; SIP / Dokumen Pendukung TIDAK dicetak', () => {
    const { container } = sajikan(id)
    expect(container.textContent).toContain('BAST-7/2026')
    expect(container.textContent).toContain('PI-9/2026')
    expect(container.textContent).not.toContain('Surat Ijin')
    expect(container.textContent).not.toContain('Dokumen Pendukung')
  })

  it('kartu LAMA tetap mencetak nomor identitasnya (dari `nip`)', () => {
    // ⚠️ Tanpa cadangan `identitasPengamanan`, kolom ini KOSONG untuk seluruh
    // kartu sebelum 2026-09-08 — tanpa satu pun error.
    cleanup()
    const { container } = sajikan(id, [baris('1.3.2.05.02.06.121', { lama: true })])
    expect(container.textContent).toContain('19800101')
  })

  it('daftar kosong → satu baris keterangan selebar tabel', () => {
    const { container } = sajikan(id, [])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(n)
    expect(td.textContent).toContain('Tidak ada pengamanan')
  })
})
