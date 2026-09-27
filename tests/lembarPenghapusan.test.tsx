// @vitest-environment jsdom
// ============================================================================
// Uji STRUKTUR tabel lembar PENGHAPUSAN — IV.K.1/2/6, rinci `.2` & rekap `.3`–`.6`.
//
// TESTING.md §10 menolak snapshot JSX; yang di sini bukan snapshot melainkan
// invarian yang kalau patah tak menghasilkan satu pun error & baru ketahuan
// SESUDAH lembarnya DICETAK:
//
//   · Σ colSpan kepala ≠ jumlah sel isi → tabel bergeser sendiri, angka jatuh
//     di kolom yang salah, & `table-fixed` menyembunyikannya sampai kertas keluar
//   · kolom khas cabang bocor ke cabang lain
//   · baris subtotal hilang di salah satu tingkat
//   · rekap memancarkan kedalaman yang salah
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarPenghapusanPermendagri from '@/components/pelaporan/LembarPenghapusanPermendagri'
import {
  FORMAT_PENGHAPUSAN, URUT_PENGHAPUSAN,
  TANGGA_REKAP_PENGHAPUSAN, SEG_MIN_REKAP_PENGHAPUSAN,
  type IdPenghapusan, type FormatPenghapusan,
} from '@/lib/formatPenghapusan'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisPenghapusan } from '@/lib/laporanPenghapusan'

afterEach(cleanup)

/** Jumlah kolom lembar rinci datar (keputusan user 2026-09-28), ditulis eksplisit. */
const HARAP: Record<IdPenghapusan, number> = { pemindahtanganan: 15, pengalihan: 17, sebab_lain: 15 }

let seq = 0
function baris(kode: string, nilai: number): BarisPenghapusan {
  seq++
  return {
    id: seq, tanggal: '2026-07-05', periode: '2026-S2', nilai, keterangan: 'Rusak berat',
    aset_id: `a${seq}`, skpd_asal: 7, skpd_tujuan: 1,
    payload: { no_sk: 'SK-1' },
    header: {
      no_sk: 'SK-188/2026', tanggal: '2026-06-30',
      jenis: 'penghapusan_pemindahtanganan', sub_jenis: 'hibah', keterangan: null,
    },
    aset: {
      kode, nama_barang: 'Laptop Dinas', uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      spesifikasi_lainnya: 'Core i5', satuan: 'Unit', jumlah: 1,
      harga_satuan: nilai, tgl_perolehan: '2020-05-13', keterangan: null,
      intra_ekstra: 'intra', alamat_detail: 'Jl. Contoh', skpd_id: 7,
      asal_usul: null, cara_perolehan: 'pengadaan',
      merek_tipe: 'Asus Vivobook', no_polisi: 'AG 1021 EP', no_rangka: null, no_mesin: null, luas: null,
    },
    skpdNama: 'Sekretariat Daerah',
    penerima: 'Bagian Umum',
    caraPemindahtanganan: 'Hibah',
    akumulasi: Math.round(nilai / 4), nilaiBuku: nilai - Math.round(nilai / 4),
    tanpaPenyusutan: false,
  }
}

const ITEMS: ItemLaporan<BarisPenghapusan>[] = [
  ['1.3.2.05.02.06.121', 1_000], ['1.3.2.05.02.07.001', 2_000], ['1.3.3.01.01.01.001', 9_000],
].map(([kode, nilai]) => {
  const r = baris(kode as string, nilai as number)
  return {
    kode: r.aset!.kode, jumlah: 1, nilai: r.nilai, data: r,
    akumulasi: r.akumulasi!, nilaiBuku: r.nilaiBuku!,
  }
})

function sajikan(f: FormatPenghapusan, lembar: number[], items = ITEMS) {
  return render(
    <LembarPenghapusanPermendagri
      f={f} items={items}
      namaTingkat={new Map([['1.3', 'ASET TETAP'], ['1.3.2', 'PERALATAN DAN MESIN']])}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-07" lembar={lembar} />,
  )
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement
const kolomKepala = (t: HTMLTableElement, i = 0) =>
  [...t.querySelectorAll('thead tr')[i].querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)

const CABANG = URUT_PENGHAPUSAN.map(id => [id, FORMAT_PENGHAPUSAN[id]] as const)

describe.each(CABANG)('%s — lembar rinci', (id, f) => {
  const tbody = (c: HTMLElement) => [...tabelDari(c).querySelectorAll('tbody tr')]
  const lebar = (tr: Element) => [...tr.querySelectorAll('td')]
    .reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0)

  it(`kepala & <colgroup> tepat ${HARAP[id]} kolom`, () => {
    const { container } = sajikan(f, [2])
    expect(f.kolom.length).toBe(HARAP[id])
    expect(kolomKepala(tabelDari(container))).toBe(HARAP[id])
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(HARAP[id])
  })

  it('SETIAP baris (jenis, barang, total) selebar tabel — Σ colSpan', () => {
    const { container } = sajikan(f, [2])
    tbody(container).forEach((tr, i) => expect(lebar(tr), `baris ke-${i}`).toBe(HARAP[id]))
  })

  it('kelompok = JENIS ASET yang ada di transaksi, ditutup Total & TOTAL 2 desimal', () => {
    const { container } = sajikan(f, [2])
    const teks = tbody(container).map(tr => tr.textContent || '')
    expect(teks).toContain('1.3.2 — Peralatan dan Mesin')
    expect(teks).toContain('1.3.3 — Gedung dan Bangunan')
    expect(teks.some(t => t.startsWith('1.3.1'))).toBe(false)
    expect(teks.some(t => t.startsWith('Total Peralatan dan Mesin'))).toBe(true)
    const akhir = teks[teks.length - 1]
    // 1.000 + 2.000 + 9.000 = 12.000; akumulasi 250+500+2.250 = 3.000.
    expect(akhir).toContain('TOTAL')
    expect(akhir).toContain('12.000,00')
    expect(akhir).toContain('3.000,00')
    expect(akhir).toContain('9.000,00')
  })

  it('SK Penghapusan, Merk/Tipe & No Polisi TERISI', () => {
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain('SK-188/2026')
    expect(container.textContent).toContain('Asus Vivobook')
    expect(container.textContent).toContain('AG 1021 EP')
  })

  it('mencetak nomor formatnya sendiri & sebab penghapusannya', () => {
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain(`Format ${f.kode}`)
    expect(container.textContent).toContain(f.judulLanjut)
  })

  it('daftar kosong → satu baris keterangan selebar tabel & TANPA TOTAL', () => {
    const { container } = sajikan(f, [2], [])
    const trs = tbody(container)
    expect(trs.length).toBe(1)
    const td = trs[0].querySelector('td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(HARAP[id])
    expect(td.textContent).toBe(f.kosong)
  })
})

describe('kolom khas cabang', () => {
  const teks = (id: IdPenghapusan) => sajikan(FORMAT_PENGHAPUSAN[id], [2]).container.textContent || ''

  it('"Cara Pemindahtanganan" TERISI di IV.K.1.2 saja', () => {
    expect(teks('pemindahtanganan')).toContain('Cara Pemindahtanganan')
    cleanup()
    expect(teks('pengalihan')).not.toContain('Cara Pemindahtanganan')
    cleanup()
    expect(teks('sebab_lain')).not.toContain('Cara Pemindahtanganan')
  })

  it('Sebab Lain: kolom "Sebab Penghapusan" berisi "Sebab Lain"', () => {
    const t = teks('sebab_lain')
    expect(t).toContain('Sebab Penghapusan')
    expect(t).toContain('Sebab Lain')
  })

  it('"Pihak Penerima" TERISI di IV.K.2.2 saja', () => {
    expect(teks('pengalihan')).toContain('Bagian Umum')
    cleanup()
    expect(teks('pemindahtanganan')).not.toContain('Bagian Umum')
  })
})

describe.each(CABANG)('%s — lembar rekap', (_id, f) => {
  it.each(TANGGA_REKAP_PENGHAPUSAN.map(t => [t.akhiran, t.seg] as const))(
    'rekap .%i menyediakan %i sel kode + 4 kolom, konsisten kepala & isi',
    (akhiran, seg) => {
      cleanup()
      const { container } = sajikan(f, [akhiran])
      const t = tabelDari(container)
      // ⚠️ EMPAT, bukan lima: rekap IV.K tak punya "Jumlah Barang".
      const n = seg + 4 // sel kode + Nama · Jumlah (Rp) · Akumulasi · Nilai Buku
      expect(kolomKepala(t), 'kepala').toBe(n)
      expect(t.querySelectorAll('colgroup col').length, 'colgroup').toBe(n)
      for (const tr of t.querySelectorAll('tbody tr')) {
        expect(tr.querySelectorAll('td').length).toBe(n)
      }
    })

  it('TANPA kolom "Jumlah Barang", "No", maupun baris JUMLAH', () => {
    const { container } = sajikan(f, [6])
    expect(container.textContent).not.toContain('Jumlah Barang')
    expect(container.textContent).not.toContain('JUMLAH TOTAL')
    const kepala = [...tabelDari(container).querySelectorAll('thead th')].map(th => th.textContent)
    expect(kepala).not.toContain('No')
  })

  it(`membuka di ${SEG_MIN_REKAP_PENGHAPUSAN} segmen — baris kelompok neraca IKUT`, () => {
    // ⚠️ Kalau `SEG_MIN_REKAP_PENGHAPUSAN` tak dioper (bawaan `susunRekap` juga
    // 2, jadi ini tak akan merah) — yang dijaga di sini bentuk lembarnya:
    // baris pertama WAJIB `1 . 3`, bukan `1 . 3 . 2`.
    const { container } = sajikan(f, [6])
    const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
    const terisi = [...tr1.querySelectorAll('td')]
      .filter(td => (td.textContent || '').trim() !== '' && td.className.includes('text-center'))
    expect(terisi.length).toBe(SEG_MIN_REKAP_PENGHAPUSAN)
  })

  it('mencetak "MENURUT …" di kop rekapnya', () => {
    const { container } = sajikan(f, [3])
    expect(container.textContent).toContain('MENURUT SUB RINCIAN OBJEK')
    expect(container.textContent).toContain('REKAPITULASI')
  })
})
