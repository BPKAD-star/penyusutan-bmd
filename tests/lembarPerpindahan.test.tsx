// @vitest-environment jsdom
// ============================================================================
// Uji STRUKTUR tabel lembar PENERIMAAN — IV.B.1.2–1.6 & IV.C.2–C.6.
//
// TESTING.md §10 menolak snapshot JSX — "nyaris selalu jadi stempel karet" —
// dan yang di sini bukan snapshot: ia mengunci INVARIAN yang kalau patah tak
// menghasilkan satu pun error, dan baru ketahuan sesudah lembarnya DICETAK:
//
//   · jumlah sel tiap baris ≠ jumlah kolom kepala  → tabel bergeser sendiri,
//     angka jatuh di kolom yang salah, dan `table-fixed` menyembunyikannya
//     dengan rapi sampai kertasnya keluar
//   · `colSpan` blok bergrup salah hitung          → kepala tak sejajar isinya
//   · baris subtotal hilang di salah satu tingkat  → lembar tanpa subtotal yang
//     diminta format, tanpa keterangan apa pun
//
// ⚠️ SELURUH uji dijalankan ATAS KEDUA CABANG (`describe.each`). Keduanya
// dilayani SATU penyaji, jadi uji yang cuma menyentuh salah satunya akan
// meloloskan perubahan yang merusak yang lain. Jumlah kolomnya diturunkan dari
// registry, tapi angka pastinya ikut ditulis eksplisit di `HARAP` — tanpa itu
// kolom yang hilang lolos berdua (registry & penyaji sama-sama bergeser).
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarPerpindahanPermendagri from '@/components/pelaporan/LembarPerpindahanPermendagri'
import {
  FORMAT_PERPINDAHAN, KOLOM_RINCI_PERPINDAHAN,
  type IdPerpindahan, type FormatPerpindahan,
} from '@/lib/formatPerpindahan'
import LembarGabunganInternal from '@/components/pelaporan/LembarGabunganInternal'
import { SEL_KODE_GABUNGAN, kolomGabungan } from '@/lib/formatGabunganInternal'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisPerpindahan } from '@/lib/laporanPerpindahan'

afterEach(cleanup)

/** Lembar rinci: 16 kolom datar, SAMA di ketiga cabang (keputusan user 2026-09-27). */
const N_RINCI = 16

function baris(id: number, kode: string, nama: string, nilai: number): BarisPerpindahan {
  return {
    id, tanggal: '2026-07-05', periode: '2026-S2', nilai, keterangan: null,
    aset_id: `a${id}`, skpd_asal: 7, skpd_tujuan: 1,
    payload: { no_sk: 'SK-1' },
    header: { no_sk: 'SK-1', tanggal: '2026-06-30', keterangan: 'Catatan kartu' },
    aset: {
      kode, nama_barang: nama, uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      spesifikasi_lainnya: null, satuan: 'Unit', jumlah: 1,
      harga_satuan: nilai, tgl_perolehan: '2020-05-13', keterangan: null,
      intra_ekstra: 'intra', alamat_detail: 'Jl. Contoh',
      asal_usul: null, cara_perolehan: 'pengadaan', merek_tipe: 'Mitsubishi Xpander',
    },
    asal_nama: 'Sekretariat Daerah',
    tujuan_nama: 'Bagian Umum',
    akumulasi: Math.round(nilai / 4), nilaiBuku: nilai - Math.round(nilai / 4),
    tanpaPenyusutan: false,
  }
}

const ITEMS: ItemLaporan<BarisPerpindahan>[] = [
  { kode: '1.3.2.05.02.06.121', jumlah: 1, nilai: 1_000, akumulasi: 250, nilaiBuku: 750, data: baris(1, '1.3.2.05.02.06.121', 'Laptop', 1_000) },
  { kode: '1.3.2.05.02.07.001', jumlah: 2, nilai: 2_000, akumulasi: 500, nilaiBuku: 1_500, data: baris(2, '1.3.2.05.02.07.001', 'Printer', 2_000) },
  { kode: '1.3.3.01.01.01.001', jumlah: 1, nilai: 9_000, akumulasi: 3_000, nilaiBuku: 6_000, data: baris(3, '1.3.3.01.01.01.001', 'Gedung', 9_000) },
]

function sajikan(f: FormatPerpindahan, lembar: number[], items = ITEMS) {
  return render(
    <LembarPerpindahanPermendagri
      f={f} items={items} namaTingkat={new Map([['1.3.2', 'PERALATAN DAN MESIN']])}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-08-31" lembar={lembar} />,
  )
}

/** Total kolom yang dijanjikan kepala tabel = Σ colSpan baris pertamanya. */
function kolomKepala(tabel: HTMLTableElement): number {
  const baris1 = tabel.querySelectorAll('thead tr')[0]
  return [...baris1.querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement

const CABANG = (Object.keys(FORMAT_PERPINDAHAN) as IdPerpindahan[])
  .map(id => [id, FORMAT_PERPINDAHAN[id]] as const)

describe.each(CABANG)('%s — lembar rinci', (id, f) => {
  const tbody = (c: HTMLElement) => [...tabelDari(c).querySelectorAll('tbody tr')]
  const lebar = (tr: Element) => [...tr.querySelectorAll('td')]
    .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)

  it(`kepala & <colgroup> tepat ${N_RINCI} kolom`, () => {
    const { container } = sajikan(f, [2])
    expect(KOLOM_RINCI_PERPINDAHAN.length).toBe(N_RINCI)
    expect(kolomKepala(tabelDari(container))).toBe(N_RINCI)
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(N_RINCI)
  })

  it('SETIAP baris (jenis, barang, total) selebar tabel — Σ colSpan', () => {
    // Baris total memuat label ber-colSpan + 3 angka + sisa ber-colSpan; kalau
    // meleset, angka totalnya jatuh di kolom yang salah & table-fixed
    // menyembunyikannya sampai kertasnya keluar.
    const { container } = sajikan(f, [2])
    tbody(container).forEach((tr, i) => expect(lebar(tr), `baris ke-${i}`).toBe(N_RINCI))
  })

  it('kelompok = JENIS ASET yang ada di transaksi saja, masing-masing ditutup Total', () => {
    const { container } = sajikan(f, [2])
    const teks = tbody(container).map(tr => tr.textContent || '')
    expect(teks).toContain('1.3.2 Peralatan dan Mesin')
    expect(teks).toContain('1.3.3 Gedung dan Bangunan')
    // Tak ada transaksi Tanah → kelompoknya tak boleh muncul.
    expect(teks.some(t => t.startsWith('1.3.1'))).toBe(false)
    expect(teks.some(t => t.startsWith('Total Peralatan dan Mesin'))).toBe(true)
    expect(teks.some(t => t.startsWith('Total Gedung dan Bangunan'))).toBe(true)
  })

  it('nominal 2 angka di belakang koma & TOTAL menjumlah seluruh jenis', () => {
    const { container } = sajikan(f, [2])
    const trs = tbody(container)
    const akhir = trs[trs.length - 1]
    expect(akhir.textContent).toContain('TOTAL')
    // 1.000 + 2.000 + 9.000 = 12.000; akumulasi 3.750; nilai buku 8.250.
    expect(akhir.textContent).toContain('12.000,00')
    expect(akhir.textContent).toContain('3.750,00')
    expect(akhir.textContent).toContain('8.250,00')
    const pm = trs.find(tr => tr.textContent?.startsWith('Total Peralatan dan Mesin'))!
    expect(pm.textContent).toContain('3.000,00')
  })

  it('Keterangan diambil dari KARTU, Merk/Tipe dari barang', () => {
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain('Catatan kartu')
    expect(container.textContent).toContain('Mitsubishi Xpander')
  })

  it('kolom pihak berjudul & berisi sesuai cabangnya', () => {
    const { container } = sajikan(f, [2])
    const kepala = [...tabelDari(container).querySelectorAll('thead th')].map(th => th.textContent)
    expect(kepala).toContain(f.kolomPihak.judul)
    // Fixture: asal "Sekretariat Daerah", tujuan "Bagian Umum".
    const harus = f.kolomPihak.sisi === 'asal' ? 'Sekretariat Daerah' : 'Bagian Umum'
    const bukan = f.kolomPihak.sisi === 'asal' ? 'Bagian Umum' : 'Sekretariat Daerah'
    expect(container.textContent, id).toContain(harus)
    expect(container.textContent, id).not.toContain(bukan)
  })

  it('daftar kosong → satu baris keterangan selebar tabel & TANPA baris TOTAL', () => {
    const { container } = sajikan(f, [2], [])
    const trs = tbody(container)
    expect(trs.length).toBe(1)
    const td = trs[0].querySelector('td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(N_RINCI)
    expect(td.textContent).toBe(f.kosong)
  })
})

it('Pengeluaran berjudul "Tujuan SKPD", Penerimaan "Pihak yang menyerahkan"', () => {
  expect(FORMAT_PERPINDAHAN.pengeluaran.kolomPihak.judul).toBe('Tujuan SKPD')
  expect(FORMAT_PERPINDAHAN.penggunaan.kolomPihak.judul).toBe('Pihak yang menyerahkan')
  expect(FORMAT_PERPINDAHAN.internal.kolomPihak.judul).toBe('Pihak yang menyerahkan')
})

describe.each(CABANG)('%s — lembar rekap', (_id, f) => {
  it.each([[3, 6], [4, 5], [5, 4], [6, 3]])(
    'rekap .%i menyediakan %i sel kode + 5 kolom, konsisten kepala & isi',
    (akhiran, seg) => {
      const { container } = sajikan(f, [akhiran])
      const tabel = tabelDari(container)
      const n = seg + 5 // sel kode + Nama · Jumlah · Rp · Akumulasi · Nilai Buku
      expect(kolomKepala(tabel), 'kepala').toBe(n)
      expect(tabel.querySelectorAll('colgroup col').length, 'colgroup').toBe(n)
      for (const tr of tabel.querySelectorAll('tbody tr')) {
        expect(tr.querySelectorAll('td').length).toBe(n)
      }
    })

  it('TANPA kolom "No" & TANPA baris JUMLAH — beda dari IV.A.<n>.6', () => {
    const { container } = sajikan(f, [6])
    expect(container.textContent).not.toContain('JUMLAH')
    const kepala = [...tabelDari(container).querySelectorAll('thead th')].map(th => th.textContent)
    expect(kepala).not.toContain('No')
  })

  it('baris terdangkalnya 3 segmen — bukan kelompok neraca 2 segmen', () => {
    // Kalau `SEG_MIN_REKAP_PERPINDAHAN` tak dioper, baris pertama jadi `1 . 3`
    // (2 sel terisi) — baris yang TIDAK ADA di format ini.
    const { container } = sajikan(f, [6])
    const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
    const selKode = [...tr1.querySelectorAll('td')].slice(0, 3).map(td => td.textContent)
    expect(selKode).toEqual(['1', '3', '2'])
  })

  it('kolom Akumulasi & Nilai Buku benar-benar berisi angka, bukan kosong', () => {
    // Kolom inilah yang membedakan rekap keluarga ini dari IV.A. Kalau mesin
    // subtotal tak menjumlahnya, keduanya tampil "0" di semua baris — nol yang
    // kelihatan sah.
    const { container } = sajikan(f, [6])
    const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
    const td = [...tr1.querySelectorAll('td')]
    // 1.3.2 = Laptop + Printer → akumulasi 750, nilai buku 2.250.
    expect(td[td.length - 2].textContent).toContain('750')
    expect(td[td.length - 1].textContent).toContain('2.250')
  })
})

describe.each(CABANG)('%s — berkas gabungan', (_id, f) => {
  it('kelima lembar terangkai dengan page-break antar lembar', () => {
    const { container } = sajikan(f, [2, 3, 4, 5, 6])
    expect(container.querySelectorAll('section').length).toBe(5)
    // Page-break di keempat lembar rekap, TIDAK di lembar pertama — break di
    // lembar pertama menghasilkan satu halaman KOSONG di depan berkas.
    expect(container.querySelectorAll('.break-before-page').length).toBe(4)
    expect(container.querySelector('section')!.className).not.toContain('break-before-page')
  })

  it('rekap saja (tanpa rinci) tak menyisakan halaman kosong di depan', () => {
    const { container } = sajikan(f, [3, 4, 5, 6])
    expect(container.querySelectorAll('section').length).toBe(4)
    expect(container.querySelectorAll('.break-before-page').length).toBe(3)
  })

  it('kop mencetak kode format cabangnya sendiri', () => {
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain(`Format ${f.kode}`)
  })

  it('baris judul kedua dicetak HANYA kalau formatnya punya', () => {
    const { container } = sajikan(f, [2])
    if (f.judulLanjut) expect(container.textContent).toContain(f.judulLanjut)
    // Yang tak punya tak boleh mencetak baris kosong yang menggeser kop.
    else expect(container.textContent).not.toContain('DALAM BENTUK')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// IV.D.7 — rekap GABUNGAN. Bentuknya datar & bernomor dgn dua blok cermin,
// ditutup satu baris "Jumlah Total" yang ber-colSpan. Justru colSpan itu yang
// paling gampang salah hitung: kalau jumlahnya tak persis selebar tabel, angka
// totalnya jatuh di kolom yang SALAH — dan `table-fixed` menyembunyikannya
// dengan rapi sampai kertasnya keluar.
// ════════════════════════════════════════════════════════════════════════════
describe('IV.D.7 — lembar gabungan', () => {
  const nGab = SEL_KODE_GABUNGAN + kolomGabungan().length

  function sajikanGab(rows = ITEMS.map(i => i.data)) {
    return render(
      <LembarGabunganInternal
        rows={rows} namaTingkat={new Map([['1.3.2', 'PERALATAN DAN MESIN']])}
        skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
        berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
        judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
        ttd={null} tglTtd="2026-08-31" />,
    )
  }

  it('kepala tabel menjanjikan tepat 28 kolom', () => {
    const { container } = sajikanGab()
    expect(kolomKepala(tabelDari(container))).toBe(nGab)
    expect(nGab).toBe(28)
  })

  it('<colgroup> & tiap baris barang sebanyak kolom yang dijanjikan', () => {
    const { container } = sajikanGab()
    const t = tabelDari(container)
    expect(t.querySelectorAll('colgroup col').length).toBe(nGab)
    const barang = [...t.querySelectorAll('tbody tr')].slice(0, ITEMS.length)
    for (const tr of barang) expect(tr.querySelectorAll('td').length).toBe(nGab)
  })

  it('baris JUMLAH TOTAL: Σ colSpan PERSIS selebar tabel', () => {
    // ⚠️ Uji terpenting di blok ini — lihat catatan di atas.
    const { container } = sajikanGab()
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    const jml = trs[trs.length - 1]
    expect(jml.textContent).toContain('Jumlah Total Pengeluaran')
    expect(jml.textContent).toContain('Jumlah Total Penerimaan')
    const lebar = [...jml.querySelectorAll('td')]
      .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)
    expect(lebar).toBe(nGab)
  })

  it('bernomor 1,2,3 & TANPA baris subtotal sama sekali', () => {
    const { container } = sajikanGab()
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    // Tak ada baris kelompok (penanda italic dipakai keluarga hierarkis).
    expect(trs.filter(tr => tr.className.includes('italic')).length).toBe(0)
    const no = trs.slice(0, ITEMS.length).map(tr => tr.querySelector('td')!.textContent)
    expect(no).toEqual(['1.', '2.', '3.'])
  })

  it('kedua blok mencetak pihak yang BERBEDA', () => {
    const { container } = sajikanGab()
    // Fixture: asal "Sekretariat Daerah", tujuan "Bagian Umum".
    expect(container.textContent).toContain('Sekretariat Daerah')
    expect(container.textContent).toContain('Bagian Umum')
  })

  it('daftar kosong → keterangan selebar tabel & TANPA baris Jumlah Total', () => {
    // Baris total di lembar hampa cuma mencetak deretan "0" yang menyesatkan.
    const { container } = sajikanGab([])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(nGab)
    expect(container.textContent).not.toContain('Jumlah Total')
  })
})
