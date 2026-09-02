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
import LembarPenerimaanPermendagri from '@/components/pelaporan/LembarPenerimaanPermendagri'
import {
  FORMAT_PENERIMAAN, SEL_KODE_PENERIMAAN, kolomLembar,
  type IdPenerimaan, type FormatPenerimaan,
} from '@/lib/formatPenerimaan'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisPenerimaan } from '@/lib/laporanPenerimaan'

afterEach(cleanup)

/** Jumlah kolom yang DIHARAPKAN, ditulis eksplisit — lihat catatan di atas. */
const HARAP: Record<IdPenerimaan, number> = {
  penggunaan: 28, // 1 NIBAR + 7 sel kode + 20 kolom
  internal: 25, // 1 NIBAR + 7 sel kode + 17 kolom (tanpa Lokasi & SK Penghapusan)
}

const nKolom = (f: FormatPenerimaan) => SEL_KODE_PENERIMAAN + kolomLembar(f).length

function baris(id: number, kode: string, nama: string, nilai: number): BarisPenerimaan {
  return {
    id, tanggal: '2026-07-05', periode: '2026-S2', nilai, keterangan: null,
    aset_id: `a${id}`, skpd_asal: 7, skpd_tujuan: 1,
    payload: { no_sk: 'SK-1' },
    header: { no_sk: 'SK-1', tanggal: '2026-06-30' },
    aset: {
      kode, nama_barang: nama, uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      spesifikasi_lainnya: null, satuan: 'Unit', jumlah: 1,
      harga_satuan: nilai, tgl_perolehan: '2020-05-13', keterangan: null,
      intra_ekstra: 'intra', alamat_detail: 'Jl. Contoh',
      asal_usul: null, cara_perolehan: 'pengadaan',
    },
    asal_nama: 'Sekretariat Daerah',
    akumulasi: Math.round(nilai / 4), nilaiBuku: nilai - Math.round(nilai / 4),
    tanpaPenyusutan: false,
  }
}

const ITEMS: ItemLaporan<BarisPenerimaan>[] = [
  { kode: '1.3.2.05.02.06.121', jumlah: 1, nilai: 1_000, akumulasi: 250, nilaiBuku: 750, data: baris(1, '1.3.2.05.02.06.121', 'Laptop', 1_000) },
  { kode: '1.3.2.05.02.07.001', jumlah: 2, nilai: 2_000, akumulasi: 500, nilaiBuku: 1_500, data: baris(2, '1.3.2.05.02.07.001', 'Printer', 2_000) },
  { kode: '1.3.3.01.01.01.001', jumlah: 1, nilai: 9_000, akumulasi: 3_000, nilaiBuku: 6_000, data: baris(3, '1.3.3.01.01.01.001', 'Gedung', 9_000) },
]

function sajikan(f: FormatPenerimaan, lembar: number[], items = ITEMS) {
  return render(
    <LembarPenerimaanPermendagri
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

const CABANG = (Object.keys(FORMAT_PENERIMAAN) as IdPenerimaan[])
  .map(id => [id, FORMAT_PENERIMAAN[id]] as const)

describe.each(CABANG)('%s — lembar rinci', (id, f) => {
  const n = nKolom(f)

  it(`kepala tabel menjanjikan tepat ${HARAP[id]} kolom`, () => {
    const { container } = sajikan(f, [2])
    const tabel = tabelDari(container)
    expect(tabel).toBeTruthy()
    expect(kolomKepala(tabel)).toBe(n)
    expect(n, 'registry bergeser dari jumlah kolom format aslinya').toBe(HARAP[id])
  })

  it('<colgroup> menyediakan sebanyak kolom yang dijanjikan kepala', () => {
    // Kalau timpang, `table-fixed` membagi sisanya sendiri & seluruh lebar yang
    // sudah dianggarkan jadi tak berlaku — tanpa satu pun error.
    const { container } = sajikan(f, [2])
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(n)
  })

  it('SETIAP baris isi & baris subtotal punya sel sebanyak kolomnya', () => {
    const { container } = sajikan(f, [2])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBeGreaterThan(ITEMS.length)
    trs.forEach((tr, i) => {
      expect(tr.querySelectorAll('td').length, `baris ke-${i}`).toBe(n)
    })
  })

  it('memancarkan baris subtotal 3–6 segmen di atas barangnya', () => {
    const { container } = sajikan(f, [2])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    // Baris kelompok ditandai italic+bold oleh penyajinya.
    const grup = trs.filter(tr => tr.className.includes('italic'))
    expect(grup.length).toBeGreaterThanOrEqual(4)
    // Baris kelompok PERTAMA wajib mendahului baris barang pertama.
    expect(trs.indexOf(grup[0])).toBe(0)
  })

  it('daftar kosong → satu baris keterangan selebar tabel, bukan tabel hampa', () => {
    const { container } = sajikan(f, [2], [])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(n)
    expect(td.textContent).toContain('Tidak ada penerimaan')
  })
})

describe('IV.B.1.2 — kolom yang hanya ada di sana', () => {
  const f = FORMAT_PENERIMAAN.penggunaan
  const geser = SEL_KODE_PENERIMAAN + 2 // NIBAR + sel kode + Nama Barang

  it('kolom SK Penghapusan dicetak KOSONG, tak diisi no. dokumen pengalihan', () => {
    // ⚠️ Aplikasi ini tak menyimpan SK Penghapusan sisi SKPD yang menyerahkan.
    // Mengisinya dengan `no_sk` kartu pengalihan (yang artinya lain) berarti
    // menaruh nomor dokumen yang salah di lembar bertanda tangan.
    const { container } = sajikan(f, [2])
    const iSk = f.kolom.findIndex(k => k.key === 'sk_nomor')
    const barisBarang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))
    expect(barisBarang.length).toBe(ITEMS.length)
    for (const tr of barisBarang) {
      expect(tr.querySelectorAll('td')[geser + iSk].textContent).toBe('')
    }
  })

  it('kolom Lokasi TERISI di IV.B & tak dirender sama sekali di IV.C', () => {
    const { container } = sajikan(f, [2])
    const iLok = f.kolom.findIndex(k => k.key === 'lokasi')
    const tr = [...tabelDari(container).querySelectorAll('tbody tr')]
      .find(x => !x.className.includes('italic'))!
    expect(tr.querySelectorAll('td')[geser + iLok].textContent).toBe('Jl. Contoh')

    cleanup()
    const { container: c2 } = sajikan(FORMAT_PENERIMAAN.internal, [2])
    expect(c2.textContent).not.toContain('Jl. Contoh')
  })
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
    // Kalau `SEG_MIN_REKAP_PENERIMAAN` tak dioper, baris pertama jadi `1 . 3`
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
