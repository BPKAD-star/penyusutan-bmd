// @vitest-environment jsdom
// ============================================================================
// Uji STRUKTUR tabel lembar KOREKSI — IV.G.2–G.7.
//
// TESTING.md §10 menolak snapshot JSX; yang di sini bukan snapshot, melainkan
// invarian yang kalau patah tak menghasilkan satu pun error & baru ketahuan
// SESUDAH lembarnya DICETAK:
//
//   · Σ colSpan kepala ≠ jumlah sel isi   → tabel bergeser sendiri, angka jatuh
//     di kolom yang salah, & `table-fixed` menyembunyikannya sampai kertas keluar
//   · kepala TIGA tingkat salah rakit     → risiko KHAS keluarga ini: bentuk
//     `selisih` punya "Selisih Nilai Koreksi" → tiga sub-blok → Tambah/Kurang,
//     jadi ada satu baris kepala lebih banyak daripada lembar mana pun lain
//   · IV.G.3 kehilangan baris barang      → angka kelompoknya tetap benar
//   · rekap memancarkan kedalaman salah   → baris yang tak ada di formatnya
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LembarKoreksiPermendagri from '@/components/pelaporan/LembarKoreksiPermendagri'
import {
  TANGGA_KOREKSI, URUT_LEMBAR, SEL_KODE_KOREKSI, kolomLembarKoreksi,
  type IdLembarKoreksi,
} from '@/lib/formatKoreksi'
import { itemKoreksi, type BarisKoreksi } from '@/lib/laporanKoreksi'
import type { ItemLaporan } from '@/lib/formatPermendagri'

afterEach(cleanup)

/**
 * Jumlah SEL per baris yang diharapkan, ditulis eksplisit — tanpa ini kolom yang
 * hilang lolos berdua (registry & penyaji sama-sama bergeser).
 *   g2 = 7 sel kode + 19 kolom = 26   ← lembar terpadat di aplikasi ini
 *   g3 = 7 sel kode + 9 kolom  = 16
 *   g4 = 6 sel kode + 7 kolom  = 13   (rekap murni: sel kode sedalam `seg`)
 */
const HARAP: Record<IdLembarKoreksi, number> = { g2: 26, g3: 16, g4: 13, g5: 12, g6: 11, g7: 10 }

const nSel = (id: IdLembarKoreksi) => {
  const l = TANGGA_KOREKSI[id]
  return (l.punyaBarang ? SEL_KODE_KOREKSI : l.seg) + kolomLembarKoreksi(l).length
}

let seq = 0
function baris(kode: string, o: {
  npSebelum: number; akSebelum: number | null; npSetelah: number; akSetelah: number | null
}): BarisKoreksi {
  seq++
  return {
    id: seq, tanggal: '2026-07-05', periode: '2026-S2',
    nilai: o.npSetelah - o.npSebelum, keterangan: 'Koreksi nilai perolehan', aset_id: `a${seq}`,
    payload: { nilai_lama: o.npSebelum, nilai_perolehan_baru: o.npSetelah },
    header: { no_sk: 'SK-9/2026', tanggal: '2026-06-30', jenis: 'nilai_perolehan', keterangan: 'Salah input harga', skpd_id: 1 },
    aset: {
      kode, nama_barang: 'Laptop Dinas', uraian_barang: 'Uraian', nibar: '1'.repeat(45),
      satuan: 'Unit', jumlah: 1, keterangan: null, intra_ekstra: 'intra', skpd_id: 1,
    },
    npSebelum: o.npSebelum, akSebelum: o.akSebelum,
    npSetelah: o.npSetelah, akSetelah: o.akSetelah,
    tanpaSnapshot: o.akSebelum == null, tanpaPenyusutan: o.akSetelah == null,
  }
}

const ITEMS: ItemLaporan<BarisKoreksi>[] = [
  itemKoreksi(baris('1.3.2.05.02.06.121', { npSebelum: 1_000, akSebelum: 200, npSetelah: 1_500, akSetelah: 300 })),
  itemKoreksi(baris('1.3.2.05.02.07.001', { npSebelum: 2_000, akSebelum: 500, npSetelah: 1_800, akSetelah: 520 })),
  itemKoreksi(baris('1.3.3.01.01.01.001', { npSebelum: 9_000, akSebelum: 3_000, npSetelah: 9_400, akSetelah: 3_100 })),
]

function sajikan(id: IdLembarKoreksi, items = ITEMS) {
  return render(
    <LembarKoreksiPermendagri
      items={items}
      namaTingkat={new Map([['1.3', 'ASET TETAP'], ['1.3.2', 'PERALATAN DAN MESIN'], ['1.3.3', 'GEDUNG DAN BANGUNAN']])}
      skpd={{ kode: '01', nama: 'Badan Keuangan dan Aset Daerah' }}
      berupa="ASET TETAP" labelKomptabel="INTRAKOMPTABEL"
      judulPeriode="SEMESTER II" tahun="2026" sebutan="Pengguna Barang"
      ttd={null} tglTtd="2026-09-07" lembar={[id]} />,
  )
}

const tabelDari = (c: HTMLElement) => c.querySelector('table.table-fixed') as HTMLTableElement
const kolomKepala = (t: HTMLTableElement, i: number) =>
  [...t.querySelectorAll('thead tr')[i].querySelectorAll('th')]
    .reduce((a, th) => a + (Number(th.getAttribute('colspan')) || 1), 0)

describe.each(URUT_LEMBAR.map(id => [id] as const))('%s', id => {
  const n = nSel(id)

  it(`kepala menjanjikan tepat ${HARAP[id]} sel & <colgroup> sebanyak itu`, () => {
    const { container } = sajikan(id)
    const t = tabelDari(container)
    expect(t).toBeTruthy()
    expect(kolomKepala(t, 0), 'baris kepala pertama').toBe(n)
    expect(n, 'registry bergeser dari jumlah kolom format aslinya').toBe(HARAP[id])
    expect(t.querySelectorAll('colgroup col').length, 'colgroup').toBe(n)
  })

  it('SETIAP baris isi & subtotal punya sel sebanyak kolomnya', () => {
    const { container } = sajikan(id)
    const trs = [...tabelDari(container).querySelectorAll('tbody tr')]
    expect(trs.length).toBeGreaterThan(0)
    trs.forEach((tr, i) => expect(tr.querySelectorAll('td').length, `baris ke-${i}`).toBe(n))
  })

  it('mencetak nomor formatnya sendiri', () => {
    const { container } = sajikan(id)
    expect(container.textContent).toContain(`Format IV.G.${TANGGA_KOREKSI[id].akhiran}`)
  })

  it('daftar kosong → satu baris keterangan selebar tabel', () => {
    const { container } = sajikan(id, [])
    const td = tabelDari(container).querySelector('tbody tr td') as HTMLTableCellElement
    expect(Number(td.getAttribute('colspan'))).toBe(n)
    expect(td.textContent).toContain('Tidak ada koreksi nilai')
  })
})

describe('bentuk RINCI — IV.G.2', () => {
  it('punya tiga blok kepala: Sebelum · Setelah · Selisih', () => {
    const { container } = sajikan('g2')
    for (const g of ['Sebelum Koreksi', 'Setelah Koreksi', 'Selisih']) {
      expect(container.textContent, g).toContain(g)
    }
  })

  it('kepala DUA tingkat & keduanya menjanjikan sel yang sama banyaknya', () => {
    const t = tabelDari(sajikan('g2').container)
    expect(t.querySelectorAll('thead tr').length).toBe(2)
    const rowspan = [...t.querySelectorAll('thead tr')[0].querySelectorAll('th')]
      .reduce((a, th) => a + (Number(th.getAttribute('rowspan')) ? (Number(th.getAttribute('colspan')) || 1) : 0), 0)
    expect(kolomKepala(t, 1) + rowspan).toBe(nSel('g2'))
  })

  it('sebelum + selisih = setelah di baris SUBTOTAL', () => {
    // ⚠️ Inilah yang akan dicek pemeriksa dengan kalkulator. Kalau selisih
    // dihitung dari Σtambah − Σkurang, angkanya kebetulan sama — tapi begitu
    // ada baris yang sisinya tak diketahui, ketiganya berhenti menutup.
    const { container } = sajikan('g2')
    const grup = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => tr.className.includes('italic'))
    expect(grup.length).toBeGreaterThanOrEqual(4)
    const kolom = kolomLembarKoreksi(TANGGA_KOREKSI.g2)
    const idx = (k: string) => SEL_KODE_KOREKSI + kolom.findIndex(x => x.key === k)
    const angka = (tr: Element, k: string) =>
      Number((tr.querySelectorAll('td')[idx(k)].textContent || '0').replace(/[^\d-]/g, ''))
    for (const tr of grup) {
      for (const u of ['np', 'ak', 'nb'] as const) {
        expect(angka(tr, `sblm_${u}`) + angka(tr, `slsh_${u}`), `${u} tak menutup`)
          .toBe(angka(tr, `stlh_${u}`))
      }
    }
  })
})

describe('bentuk SELISIH', () => {
  it('kepala TIGA tingkat — "Selisih Nilai Koreksi" di atas Tambah/Kurang', () => {
    // ⚠️ Risiko khas keluarga ini: satu baris kepala lebih banyak daripada
    // lembar mana pun lain di aplikasi ini.
    for (const id of ['g3', 'g4', 'g7'] as IdLembarKoreksi[]) {
      cleanup()
      const t = tabelDari(sajikan(id).container)
      expect(t.querySelectorAll('thead tr').length, `${id}: jumlah baris kepala`).toBe(3)
      expect(t.textContent, id).toContain('Selisih Nilai Koreksi')
      expect(t.textContent, `${id}: kolom Tambah`).toContain('Tambah')
      expect(t.textContent, `${id}: kolom Kurang`).toContain('Kurang')
    }
  })

  it('TIDAK memuat kolom Sebelum/Setelah milik IV.G.2', () => {
    const { container } = sajikan('g4')
    expect(container.textContent).not.toContain('Sebelum Koreksi')
    expect(container.textContent).not.toContain('Setelah Koreksi')
  })
})

describe('IV.G.3 — bentuk selisih TAPI masih berbaris barang', () => {
  it('memuat baris BARANG berikut NIBAR-nya', () => {
    // ⚠️ Kalau `punyaBarang` disimpulkan dari `bentuk`, lembar ini kehilangan
    // SELURUH baris barangnya & angka kelompoknya tetap benar — tak ada yang
    // berteriak.
    const { container } = sajikan('g3')
    const barang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))
    expect(barang.length).toBe(ITEMS.length)
    expect(container.textContent).toContain('Laptop Dinas')
  })

  it('IV.G.4 justru TIDAK memuat baris barang', () => {
    const { container } = sajikan('g4')
    const barang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))
    expect(barang.length).toBe(0)
    expect(container.textContent).not.toContain('Laptop Dinas')
  })
})

describe('kedalaman kelompok', () => {
  it.each(URUT_LEMBAR.map(id => [id, TANGGA_KOREKSI[id].segMin] as const))(
    '%s membuka di %i segmen — persis gambar formatnya',
    (id, segMin) => {
      cleanup()
      const { container } = sajikan(id)
      const tr1 = tabelDari(container).querySelector('tbody tr') as HTMLTableRowElement
      const terisi = [...tr1.querySelectorAll('td')]
        .filter(td => (td.textContent || '').trim() !== '' && td.className.includes('text-center'))
      expect(terisi.length, `${id}: kedalaman baris pertama`).toBe(segMin)
    })
})

describe('sisi yang TAK DIKETAHUI', () => {
  it('dicetak titik-titik, BUKAN nol', () => {
    // Baris koreksi sebelum 2026-09-07 tak membekukan akumulasi sebelum
    // koreksi. Nol berarti "memang tak berubah", titik-titik berarti "tak
    // tersimpan" — di lembar bertanda tangan keduanya tak boleh terlihat sama.
    const { container } = sajikan('g2', [
      itemKoreksi(baris('1.3.2.05.02.06.121', { npSebelum: 1_000, akSebelum: null, npSetelah: 1_500, akSetelah: 300 })),
    ])
    const barang = [...tabelDari(container).querySelectorAll('tbody tr')]
      .filter(tr => !tr.className.includes('italic'))[0]
    const kolom = kolomLembarKoreksi(TANGGA_KOREKSI.g2)
    const sel = (k: string) =>
      barang.querySelectorAll('td')[SEL_KODE_KOREKSI + kolom.findIndex(x => x.key === k)].textContent
    expect(sel('sblm_ak'), 'akumulasi sebelum tak diketahui').toBe('…')
    expect(sel('sblm_nb'), 'nilai buku sebelum ikut tak diketahui').toBe('…')
    expect(sel('slsh_ak'), 'selisih akumulasi ikut tak diketahui').toBe('…')
    // Yang DIKETAHUI tetap tercetak angka.
    expect(sel('sblm_np')).not.toBe('…')
  })
})
