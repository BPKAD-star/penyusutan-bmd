// @vitest-environment jsdom
// ============================================================================
// Uji STRUKTUR tabel lembar REKLASIFIKASI — IV.F.2–F.6.
//
// TESTING.md §10 menolak snapshot JSX — "nyaris selalu jadi stempel karet" —
// dan yang di sini bukan snapshot: ia mengunci INVARIAN yang kalau patah tak
// menghasilkan satu pun error, dan baru ketahuan sesudah lembarnya DICETAK:
//
//   · jumlah sel tiap baris ≠ jumlah kolom kepala  → tabel bergeser sendiri,
//     angka jatuh di kolom yang salah, dan `table-fixed` menyembunyikannya
//     dengan rapi sampai kertasnya keluar
//   · `colSpan` blok "Reklasifikasi dari" salah    → SELURUH kolom di kanannya
//     bergeser. ⚠️ Ini risiko KHAS keluarga IV.F: blok itu SATU kolom di
//     registry tapi TUJUH sel di tabel, jadi `g.kolom.length` apa adanya
//     menjanjikan 2 kolom di atas 8 sel. Keluarga IV.B/IV.C/IV.D tak punya
//     jebakan ini karena blok "Asal Barang"-nya kolom teks biasa.
//   · baris subtotal hilang di salah satu tingkat  → lembar tanpa subtotal yang
//     diminta format, tanpa keterangan apa pun
//   · rekap memancarkan kedalaman yang salah       → baris kelompok yang tak ada
//     (atau hilang) di formatnya, dgn angka yang tetap menjumlah benar
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarReklasPermendagri from '@/components/pelaporan/LembarReklasPermendagri'
import {
  FORMAT_REKLAS, SEL_KODE_REKLAS, lembarRekapReklas, kolomLembarReklas, sisiReklas,
  type IdReklas, type FormatReklas,
} from '@/lib/formatReklas'
import type { ItemLaporan } from '@/lib/formatPermendagri'
import type { BarisReklas } from '@/lib/laporanReklas'

afterEach(cleanup)

/**
 * Jumlah SEL yang diharapkan, ditulis eksplisit.
 *
 * ⚠️ Bukan sekadar `kolom.length`: blok "Reklasifikasi dari" menyumbang TUJUH
 * sel dari satu entri registry. Angka pastinya ditulis di sini supaya kolom yang
 * hilang tak lolos berdua (registry & penyaji sama-sama bergeser).
 *   1 NIBAR + 7 sel kode tujuan + 1 Nama Barang + 13 kolom lain
 *   (yang salah satunya, `lawan_kode`, memekar dari 1 jadi 7 sel)
 *   = 1 + 7 + 1 + 12 + 7 = 28
 *
 * ⚠️ SAMA di kedua cabang — IV.F.2 & IV.F.12 memang berkolom identik; yang
 * berbeda cuma judul lembar & judul blok lawan. Angka yang berbeda di sini
 * berarti salah satunya sudah menyimpang.
 */
const HARAP: Record<IdReklas, number> = { penambahan: 28, pengurangan: 28 }

/** Sel tabel = kolom registry, tapi `lawan_kode` memekar jadi 7. */
const nSel = (f: FormatReklas) =>
  SEL_KODE_REKLAS + kolomLembarReklas(f).length + (SEL_KODE_REKLAS - 1)

/**
 * Satu baris ledger reklas + turunan sisinya.
 *
 * ⚠️ `kodeUtama`/`kodeLawan`/`namaSpek` DITURUNKAN lewat `sisiReklas()`, tak
 * ditulis tangan — kalau fixture-nya memaku sisi penambahan, uji atas cabang
 * PENGURANGAN akan merender data yang tak pernah dihasilkan pemuatnya & lolos
 * tanpa membuktikan apa pun.
 */
function baris(
  arah: 'penambahan' | 'pengurangan',
  id: number, kodeBaru: string, kodeLama: string, nama: string, nilai: number,
): BarisReklas {
  return {
    id, tanggal: '2026-07-05', periode: '2026-S2', nilai, keterangan: null,
    aset_id: `a${id}`, jenis: 'reklas_golongan',
    payload: { kode_lama: kodeLama, kode_baru: kodeBaru },
    header: { no_sk: 'SK-1', tanggal: '2026-06-30', jenis: 'golongan', keterangan: null, skpd_id: 1 },
    aset: {
      kode: kodeBaru, nama_barang: nama, uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      satuan: 'Unit', jumlah: 1, keterangan: null, intra_ekstra: 'intra', skpd_id: 1,
    },
    ...sisiReklas(arah, { kodeLama, kodeBaru, namaAset: nama }),
    kodeLama, kodeBaru,
    penyebab: 'Perubahan Fungsi BMD',
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
        ['1.3.2', 'PERALATAN DAN MESIN'],
        ['1.3.3', 'GEDUNG DAN BANGUNAN'],
        ['1.3.6', 'KONSTRUKSI DALAM PENGERJAAN'],
      ])}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-07" lembar={lembar} />,
  )
}

/** Total kolom yang dijanjikan kepala tabel = Σ colSpan baris pertamanya. */
function kolomKepala(tabel: HTMLTableElement, barisKe = 0): number {
  const tr = tabel.querySelectorAll('thead tr')[barisKe]
  return [...tr.querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement

const CABANG = (Object.keys(FORMAT_REKLAS) as IdReklas[])
  .map(id => [id, FORMAT_REKLAS[id]] as const)

describe.each(CABANG)('%s — lembar rinci', (id, f) => {
  const n = nSel(f)

  const RINCI = [f.akhiranRinci]

  it(`kepala tabel menjanjikan tepat ${HARAP[id]} sel`, () => {
    const { container } = sajikan(f, RINCI)
    const tabel = tabelDari(container)
    expect(tabel).toBeTruthy()
    expect(kolomKepala(tabel)).toBe(n)
    expect(n, 'registry bergeser dari jumlah kolom format aslinya').toBe(HARAP[id])
  })

  it('BARIS KEDUA kepala menjanjikan sel yang sama banyaknya', () => {
    // ⚠️ Inilah yang menangkap `colSpan` blok "Reklasifikasi dari" yang salah
    // hitung: baris pertama memuat judul grupnya (7+1 sel), baris kedua memuat
    // sub-judulnya. Kalau salah satunya memakai `g.kolom.length` apa adanya,
    // keduanya tak lagi sama & seluruh kolom di kanannya bergeser.
    const { container } = sajikan(f, RINCI)
    const tabel = tabelDari(container)
    // Baris ke-2 tak memuat kolom ber-`rowSpan` dari baris ke-1, jadi
    // selisihnya = banyaknya kolom ber-rowSpan.
    const rowspan = [...tabel.querySelectorAll('thead tr')[0].querySelectorAll('th')]
      .filter(th => th.getAttribute('rowspan')).length
    expect(kolomKepala(tabel, 1) + rowspan).toBe(n)
  })

  it('<colgroup> menyediakan sebanyak sel yang dijanjikan kepala', () => {
    // Kalau timpang, `table-fixed` membagi sisanya sendiri & seluruh lebar yang
    // sudah dianggarkan jadi tak berlaku — tanpa satu pun error.
    const { container } = sajikan(f, RINCI)
    expect(tabelDari(container).querySelectorAll('colgroup col').length).toBe(n)
  })

  it('SETIAP baris isi & baris subtotal punya sel sebanyak kolomnya', () => {
    const { container } = sajikan(f, RINCI)
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBeGreaterThan(MENTAH.length)
    trs.forEach((tr, i) => {
      expect(tr.querySelectorAll('td').length, `baris ke-${i}`).toBe(n)
    })
  })

  it(`blok "${f.grupLawan}" TERISI kode seberangnya & bersegmen`, () => {
    // Inti lembar ini. Kalau kosong/tak bersegmen, pembaca tak bisa tahu barang
    // itu datang dari / pergi ke mana — dan justru itu satu-satunya alasan
    // lembarnya ada.
    // ⚠️ Harapannya DITURUNKAN dari data, bukan dipaku: cabang penambahan
    // menampilkan kode asal & pengurangan kode tujuan, jadi angka yang ditulis
    // tangan akan benar untuk salah satunya saja.
    const items = itemsUntuk(f)
    const { container } = sajikan(f, RINCI, items)
    const geser = 1 + SEL_KODE_REKLAS + 1 // NIBAR + sel kode utama + Nama Barang
    const iLawan = f.kolom.findIndex(k => k.key === 'lawan_kode')
    const barang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))
    expect(barang.length).toBe(MENTAH.length)
    barang.forEach((tr, i) => {
      const td = [...tr.querySelectorAll('td')]
      expect(td.slice(geser + iLawan, geser + iLawan + SEL_KODE_REKLAS).map(x => x.textContent))
        .toEqual(items[i].data.kodeLawan.split('.'))
    })
    expect(container.textContent).toContain(f.grupLawan)
  })

  it('blok utama & blok lawan menampilkan kode yang BERBEDA', () => {
    // ⚠️ Penjaga paling murah untuk sisi yang tertukar: kalau `kodeUtama` &
    // `kodeLawan` sama-sama diisi kode yang sama, lembarnya tetap terisi penuh
    // & foot dengan benar (lihat `sisiReklas`). Fixture-nya memang reklas
    // lintas golongan, jadi keduanya WAJIB beda.
    const items = itemsUntuk(f)
    for (const it of items) {
      expect(it.data.kodeUtama, 'sisi tertukar / tak dibedakan').not.toBe(it.data.kodeLawan)
    }
  })

  it('baris SUBTOTAL mengosongkan blok lawan — satu kelompok bisa banyak asal', () => {
    const { container } = sajikan(f, RINCI)
    const geser = 1 + SEL_KODE_REKLAS + 1
    const iLawan = f.kolom.findIndex(k => k.key === 'lawan_kode')
    const grup = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => tr.className.includes('italic'))
    expect(grup.length).toBeGreaterThanOrEqual(4)
    for (const tr of grup) {
      const td = [...tr.querySelectorAll('td')]
      for (let i = 0; i < SEL_KODE_REKLAS; i++) {
        expect(td[geser + iLawan + i].textContent, 'blok lawan di baris kelompok').toBe('')
      }
    }
  })

  it('kolom "Nama Dokumen" dicetak KOSONG, tak diisi tebakan', () => {
    // ⚠️ Aplikasi ini tak menyimpan jenis/nama dokumen sumber reklasifikasi di
    // mana pun. Mengisinya dgn nama berkas unggahan atau label alasan (yang
    // sudah tercetak di kolom Penyebab) berarti menaruh keterangan yang bukan
    // itu di lembar bertanda tangan.
    const { container } = sajikan(f, RINCI)
    const geser = 1 + SEL_KODE_REKLAS + 1
    const iLawan = f.kolom.findIndex(k => k.key === 'lawan_kode')
    const iDok = f.kolom.findIndex(k => k.key === 'dok_nama')
    // Kolom sesudah `lawan_kode` bergeser +6 karena ia memekar jadi 7 sel.
    const pos = geser + iDok + (iDok > iLawan ? SEL_KODE_REKLAS - 1 : 0)
    const barang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))
    for (const tr of barang) {
      expect(tr.querySelectorAll('td')[pos].textContent).toBe('')
    }
  })

  it('kolom Penyebab Reklasifikasi TERISI label alasannya', () => {
    const { container } = sajikan(f, RINCI)
    expect(container.textContent).toContain('Perubahan Fungsi BMD')
  })

  it('TIDAK memuat kolom Harga Satuan / Jumlah Total milik IV.B/IV.C/IV.D', () => {
    const { container } = sajikan(f, RINCI)
    expect(container.textContent).not.toContain('Harga Satuan')
    expect(container.textContent).not.toContain('Total Nilai Barang')
  })

  it('mencetak catatan kaki *) — ia yang menjelaskan kolom penyusutan kosong', () => {
    const { container } = sajikan(f, RINCI)
    expect(container.textContent).toContain('hanya diisi untuk BMD yang dilakukan Penyusutan')
  })

  it('daftar kosong → satu baris keterangan selebar tabel, bukan tabel hampa', () => {
    const { container } = sajikan(f, RINCI, [])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(n)
    expect(td.textContent).toContain('Tidak ada penambahan')
  })
})

describe.each(CABANG)('%s — lembar rekap IV.F.3–F.6', (_id, f) => {
  it.each(lembarRekapReklas(f).map(t => [t.akhiran, t.seg] as const))(
    'rekap .%i menyediakan %i sel kode + 4 kolom, konsisten kepala & isi',
    (akhiran, seg) => {
      const { container } = sajikan(f, [akhiran])
      const tabel = tabelDari(container)
      // ⚠️ EMPAT, bukan lima: rekap IV.F tak punya "Jumlah Barang".
      const n = seg + 4 // sel kode + Nama · Nilai Perolehan · Akumulasi · Nilai Buku
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
      // ⚠️ Tiga lembar terdalam membuka di 3 segmen, yang terdangkal
      // ("MENURUT JENIS") di 2 — kelompok neraca `1 . 3`. Menyeragamkannya
      // TIDAK mengubah satu pun angka, jadi uji inilah satu-satunya yang akan
      // berteriak.
      cleanup()
      const { container } = sajikan(f, [akhiran])
      const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
      const terisi = [...tr1.querySelectorAll('td')]
        .filter(td => (td.textContent || '').trim() !== '' && td.className.includes('text-center'))
      expect(terisi.length, `${f.awalan}.${akhiran}: kedalaman baris pertama`).toBe(segMin)
    })
})
