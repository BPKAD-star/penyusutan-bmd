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
  FORMAT_PENGHAPUSAN, URUT_PENGHAPUSAN, SEL_KODE_PENGHAPUSAN,
  TANGGA_REKAP_PENGHAPUSAN, SEG_MIN_REKAP_PENGHAPUSAN, kolomLembarPenghapusan,
  type IdPenghapusan, type FormatPenghapusan,
} from '@/lib/formatPenghapusan'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisPenghapusan } from '@/lib/laporanPenghapusan'

afterEach(cleanup)

/**
 * Jumlah SEL per baris yang diharapkan, ditulis eksplisit — tanpa ini kolom yang
 * hilang lolos berdua (registry & penyaji sama-sama bergeser).
 *   K.1 = 1 NIBAR + 7 sel kode + 1 Nama + 13 kolom = 22
 *   K.2 = idem + Tgl Perolehan · Cara Perolehan · Penerima            = 24
 *   K.6 = idem − Cara Pemindahtanganan                                = 21
 */
const HARAP: Record<IdPenghapusan, number> = { pemindahtanganan: 22, pengalihan: 24, sebab_lain: 21 }

const nSel = (f: FormatPenghapusan) => SEL_KODE_PENGHAPUSAN + kolomLembarPenghapusan(f).length

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
  const n = nSel(f)

  it(`kepala tabel menjanjikan tepat ${HARAP[id]} sel`, () => {
    const { container } = sajikan(f, [2])
    const t = tabelDari(container)
    expect(t).toBeTruthy()
    expect(kolomKepala(t)).toBe(n)
    expect(n, 'registry bergeser dari jumlah kolom format aslinya').toBe(HARAP[id])
  })

  it('BARIS KEDUA kepala menjanjikan sel yang sama banyaknya', () => {
    const t = tabelDari(sajikan(f, [2]).container)
    const rowspan = [...t.querySelectorAll('thead tr')[0].querySelectorAll('th')]
      .filter(th => th.getAttribute('rowspan')).length
    expect(kolomKepala(t, 1) + rowspan).toBe(n)
  })

  it('<colgroup> menyediakan sebanyak sel yang dijanjikan kepala', () => {
    // Kalau timpang, `table-fixed` membagi sisanya sendiri & seluruh lebar yang
    // sudah dianggarkan jadi tak berlaku — tanpa satu pun error.
    const { container } = sajikan(f, [2])
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(n)
  })

  it('SETIAP baris isi & baris subtotal punya sel sebanyak kolomnya', () => {
    const { container } = sajikan(f, [2])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBeGreaterThan(ITEMS.length)
    trs.forEach((tr, i) => expect(tr.querySelectorAll('td').length, `baris ke-${i}`).toBe(n))
  })

  it('memancarkan baris subtotal 3–6 segmen di atas barangnya', () => {
    const { container } = sajikan(f, [2])
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    const grup = trs.filter(tr => tr.className.includes('italic'))
    expect(grup.length).toBeGreaterThanOrEqual(4)
    expect(trs.indexOf(grup[0]), 'baris kelompok pertama harus mendahului barang').toBe(0)
  })

  it('blok SK Penghapusan TERISI — beda dari IV.B.1.2 yang selalu kosong', () => {
    // ⚠️ Di keluarga IV.K, SK Penghapusannya justru kartu jurnal ini sendiri.
    // Mengosongkannya "biar seragam dgn IV.B" menghilangkan nomor dokumen yang
    // memang dimiliki aplikasi ini.
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain('SK-188/2026')
  })

  it('mencetak nomor formatnya sendiri & sebab penghapusannya', () => {
    const { container } = sajikan(f, [2])
    expect(container.textContent).toContain(`Format ${f.kode}`)
    expect(container.textContent).toContain(f.judulLanjut)
  })

  it('daftar kosong → satu baris keterangan selebar tabel', () => {
    const { container } = sajikan(f, [2], [])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(n)
    expect(td.textContent).toContain('Tidak ada penghapusan')
  })
})

describe('kolom khas cabang tak bocor', () => {
  const geser = 1 + SEL_KODE_PENGHAPUSAN + 1 // NIBAR + sel kode + Nama Barang
  const selBarang = (f: FormatPenghapusan, key: string) => {
    const { container } = sajikan(f, [2])
    const i = f.kolom.findIndex(k => k.key === key)
    const tr = [...tabelDari(container).querySelectorAll('tbody tr')]
      .find(x => !x.className.includes('italic'))!
    return tr.querySelectorAll('td')[geser + i].textContent
  }

  it('"Cara Pemindahtanganan" TERISI di IV.K.1.2 & tak dirender di cabang lain', () => {
    expect(selBarang(FORMAT_PENGHAPUSAN.pemindahtanganan, 'cara_pemindahtanganan')).toBe('Hibah')
    for (const id of ['pengalihan', 'sebab_lain'] as IdPenghapusan[]) {
      cleanup()
      const { container } = sajikan(FORMAT_PENGHAPUSAN[id], [2])
      expect(container.textContent, `${id} tak boleh merender Cara Pemindahtanganan`)
        .not.toContain('Cara Pemindahtanganan')
    }
  })

  it('"Penerima Penyerahan" TERISI di IV.K.2.2 & tak ada di cabang lain', () => {
    expect(selBarang(FORMAT_PENGHAPUSAN.pengalihan, 'penerima')).toBe('Bagian Umum')
    for (const id of ['pemindahtanganan', 'sebab_lain'] as IdPenghapusan[]) {
      cleanup()
      const { container } = sajikan(FORMAT_PENGHAPUSAN[id], [2])
      expect(container.textContent, `${id} tak boleh merender Penerima Penyerahan`)
        .not.toContain('Penerima Penyerahan')
    }
  })

  it('Lokasi TERISI di KETIGA cabang', () => {
    for (const [id, f] of CABANG) {
      cleanup()
      expect(selBarang(f, 'lokasi'), id).toBe('Jl. Contoh')
    }
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
