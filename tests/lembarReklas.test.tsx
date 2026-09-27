// @vitest-environment jsdom
// ============================================================================
// Uji STRUKTUR tabel lembar REKLASIFIKASI — IV.F.2/F.12 (rinci baru, keputusan
// user 2026-09-27/28) & IV.F.3–F.6/F.13–F.16 (rekap, tak berubah).
//
// TESTING.md §10 menolak snapshot JSX — yang di sini bukan snapshot: ia
// mengunci INVARIAN yang kalau patah tak menghasilkan satu pun error, dan baru
// ketahuan sesudah lembarnya DICETAK (jumlah sel ≠ kepala, colSpan salah
// hitung, subtotal hilang di satu tingkat, dst).
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarReklasPermendagri from '@/components/pelaporan/LembarReklasPermendagri'
import {
  FORMAT_REKLAS, KOLOM_RINCI_REKLAS, lembarRekapReklas, sisiReklas,
  type IdReklas, type FormatReklas,
} from '@/lib/formatReklas'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisReklas } from '@/lib/laporanReklas'

afterEach(cleanup)

/** Lembar rinci: 13 kolom datar, SAMA di kedua cabang (keputusan user 2026-09-27/28). */
const N_RINCI = 13

function baris(
  arah: 'penambahan' | 'pengurangan',
  id: number, kodeBaru: string, kodeLama: string, nama: string, nilai: number,
): BarisReklas {
  return {
    id, tanggal: '2026-07-05', periode: '2026-S2', nilai, keterangan: null,
    aset_id: `a${id}`, jenis: 'reklas_golongan',
    payload: { kode_lama: kodeLama, kode_baru: kodeBaru },
    header: { no_sk: 'SK-1', tanggal: '2026-06-30', jenis: 'golongan', keterangan: 'Catatan kartu', skpd_id: 1 },
    aset: {
      kode: kodeBaru, nama_barang: nama, uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      satuan: 'Unit', jumlah: 1, harga_satuan: nilai, keterangan: null, intra_ekstra: 'intra', skpd_id: 1,
      merek_tipe: null, spesifikasi_lainnya: null,
    },
    ...sisiReklas(arah, { kodeLama, kodeBaru, namaAset: nama }),
    kodeLama, kodeBaru,
    penyebab: 'Perubahan Fungsi BMD',
    skpdIdSaatItu: 1,
    skpdNama: 'Badan Keuangan dan Aset Daerah',
    akumulasi: Math.round(nilai / 4), nilaiBuku: nilai - Math.round(nilai / 4),
    tanpaPenyusutan: false,
  }
}

/**
 * ⚠️ Kode ASAL sengaja BERBEDA-BEDA antar baris. Kalau semuanya seragam, cabang
 * PENGURANGAN (yang mengelompokkan menurut kode asal) cuma punya satu rantai
 * kelompok & uji subtotalnya jadi jauh lebih lemah dari kembarannya.
 */
const MENTAH: [number, string, string, string, number][] = [
  [1, '1.3.2.05.02.06.121', '1.3.6.01.01.01.001', 'Laptop', 1_000],
  [2, '1.3.2.05.02.07.001', '1.3.6.01.01.02.001', 'Printer', 2_000],
  [3, '1.3.3.01.01.01.001', '1.3.6.02.01.01.001', 'Gedung', 9_000],
]

/** `ItemLaporan` seperti yang dirakit tab & halaman cetak: `kode` = kodeUtama. */
function itemsUntuk(f: FormatReklas): ItemLaporan<BarisReklas>[] {
  return MENTAH
    .map(([id, baru, lama, nama, nilai]) => baris(f.arah, id, baru, lama, nama, nilai))
    .sort((a, b) => a.kodeUtama.localeCompare(b.kodeUtama))
    .map(r => ({
      kode: r.kodeUtama, jumlah: 1, nilai: r.nilai,
      akumulasi: r.akumulasi ?? 0, nilaiBuku: r.nilaiBuku ?? 0, data: r,
    }))
}

function sajikan(f: FormatReklas, lembar: number[], items = itemsUntuk(f)) {
  return render(
    <LembarReklasPermendagri
      f={f} items={items}
      namaTingkat={new Map([
        ['1.3.2', 'Peralatan dan Mesin'],
        ['1.3.3', 'Gedung dan Bangunan'],
        ['1.3.6', 'Konstruksi Dalam Pengerjaan'],
      ])}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-07" lembar={lembar} />,
  )
}

/** Total kolom yang dijanjikan kepala tabel = Σ colSpan baris pertamanya. */
function kolomKepala(tabel: HTMLTableElement): number {
  const tr = tabel.querySelectorAll('thead tr')[0]
  return [...tr.querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement

const CABANG = (Object.keys(FORMAT_REKLAS) as IdReklas[])
  .map(id => [id, FORMAT_REKLAS[id]] as const)

describe.each(CABANG)('%s — lembar rinci', (id, f) => {
  const tbody = (c: HTMLElement) => [...tabelDari(c).querySelectorAll('tbody tr')]
  const lebar = (tr: Element) => [...tr.querySelectorAll('td')]
    .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)

  it(`kepala & <colgroup> tepat ${N_RINCI} kolom`, () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    expect(KOLOM_RINCI_REKLAS.length).toBe(N_RINCI)
    expect(kolomKepala(tabelDari(container))).toBe(N_RINCI)
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(N_RINCI)
  })

  it('SETIAP baris (jenis, barang, total) selebar tabel — Σ colSpan', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    tbody(container).forEach((tr, i) => expect(lebar(tr), `baris ke-${i}`).toBe(N_RINCI))
  })

  it('kelompok = JENIS ASET yang ada di transaksi saja, masing-masing ditutup Total', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    const teks = tbody(container).map(tr => tr.textContent || '')
    // ⚠️ Cabang berbeda: penambahan mengelompokkan kode BARU (tujuan reklas),
    // pengurangan kode LAMA (asal reklas). Fixture-nya sengaja lintas golongan
    // (semua asal 1.3.6, tujuan beda-beda), jadi kelompok yang muncul BEDA.
    if (f.arah === 'penambahan') {
      expect(teks.some(t => t.startsWith('1.3.2'))).toBe(true)
      expect(teks.some(t => t.startsWith('1.3.3'))).toBe(true)
      expect(teks.some(t => t.startsWith('Total Peralatan dan Mesin'))).toBe(true)
    } else {
      expect(teks.some(t => t.startsWith('1.3.6'))).toBe(true)
      expect(teks.some(t => t.startsWith('1.3.2'))).toBe(false)
    }
  })

  it('nominal 2 angka di belakang koma & TOTAL menjumlah seluruh jenis', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    const trs = tbody(container)
    const akhir = trs[trs.length - 1]
    expect(akhir.textContent).toContain('TOTAL')
    // 1.000 + 2.000 + 9.000 = 12.000; akumulasi 250+500+2.250 = 3.000; nilai
    // buku 9.000 — sama di kedua cabang, karena keduanya membaca baris yang sama.
    expect(akhir.textContent).toContain('12.000,00')
    expect(akhir.textContent).toContain('3.000,00')
    expect(akhir.textContent).toContain('9.000,00')
  })

  it('Keterangan diambil dari KARTU (header), Penyebab dari alasannya', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    expect(container.textContent).toContain('Catatan kartu')
    expect(container.textContent).toContain('Perubahan Fungsi BMD')
  })

  it('kolom lawan berjudul & berisi sesuai cabangnya', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    const kepala = [...tabelDari(container).querySelectorAll('thead th')].map(th => th.textContent)
    expect(kepala).toContain(f.kolomLawan)
    const items = itemsUntuk(f)
    for (const it of items) {
      expect(it.data.kodeUtama, 'sisi tertukar / tak dibedakan').not.toBe(it.data.kodeLawan)
    }
  })

  it('daftar kosong → satu baris keterangan selebar tabel & TANPA baris TOTAL', () => {
    const { container } = sajikan(f, [f.akhiranRinci], [])
    const trs = tbody(container)
    expect(trs.length).toBe(1)
    const td = trs[0].querySelector('td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(N_RINCI)
    expect(td.textContent).toBe(f.kosong)
  })
})

it('kolom lawan Penambahan "...Awal", Pengurangan "...Tujuan"', () => {
  expect(FORMAT_REKLAS.penambahan.kolomLawan).toBe('Kode Barang - Uraian Barang Awal')
  expect(FORMAT_REKLAS.pengurangan.kolomLawan).toBe('Kode Barang - Uraian Barang Tujuan')
})

describe.each(CABANG)('%s — lembar rekap', (_id, f) => {
  it.each(lembarRekapReklas(f).map(t => [t.akhiran, t.seg] as const))(
    'rekap .%i menyediakan %i sel kode + 4 kolom, konsisten kepala & isi',
    (akhiran, seg) => {
      const { container } = sajikan(f, [akhiran])
      const tabel = tabelDari(container)
      // ⚠️ EMPAT, bukan lima: rekap IV.F tak punya "Jumlah Barang".
      const n = seg + 4
      expect(kolomKepala(tabel), 'kepala').toBe(n)
      expect(tabel.querySelectorAll('colgroup col').length, 'colgroup').toBe(n)
      for (const tr of tabel.querySelectorAll('tbody tr')) {
        expect(tr.querySelectorAll('td').length).toBe(n)
      }
    })

  it('TANPA kolom "Jumlah Barang", "No", maupun baris JUMLAH', () => {
    const { container } = sajikan(f, [f.akhiranRekap[3]])
    expect(container.textContent).not.toContain('Jumlah Barang')
    expect(container.textContent).not.toContain('JUMLAH')
    const kepala = [...tabelDari(container).querySelectorAll('thead th')].map(th => th.textContent)
    expect(kepala).not.toContain('No')
  })

  it.each(lembarRekapReklas(f).map(t => [t.akhiran, t.segMin] as const))(
    'rekap .%i membuka di %i segmen — persis gambar formatnya',
    (akhiran, segMin) => {
      cleanup()
      const { container } = sajikan(f, [akhiran])
      const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
      const terisi = [...tr1.querySelectorAll('td')]
        .filter(td => (td.textContent || '').trim() !== '' && td.className.includes('text-center'))
      expect(terisi.length, `${f.awalan}.${akhiran}: kedalaman baris pertama`).toBe(segMin)
    })

  it('nominal rekap 2 angka di belakang koma', () => {
    const { container } = sajikan(f, [f.akhiranRekap[3]])
    // Kolom "Total <jenis>" 3.750,00/8.250,00 sudah diuji di lembar rinci;
    // rekap terdangkal (3 segmen) menjumlah SELURUH baris jadi satu, jadi
    // yang diperiksa cukup formatnya (koma + 2 desimal), bukan angka pastinya.
    expect(container.textContent).toMatch(/\d\.\d{3},\d{2}/)
  })
})

describe.each(CABANG)('%s — berkas gabungan', (_id, f) => {
  it('lima lembar (rinci + 4 rekap) terangkai dengan page-break antar lembar', () => {
    const { container } = sajikan(f, [f.akhiranRinci, ...f.akhiranRekap])
    expect(container.querySelectorAll('section').length).toBe(5)
    expect(container.querySelectorAll('.break-before-page').length).toBe(4)
    expect(container.querySelector('section')!.className).not.toContain('break-before-page')
  })

  it('kop mencetak kode format cabangnya sendiri', () => {
    const { container } = sajikan(f, [f.akhiranRinci])
    expect(container.textContent).toContain(`Format ${f.kode}`)
  })
})
