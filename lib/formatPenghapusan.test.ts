// Penjaga format lembar PENGHAPUSAN Permendagri 47/2021 — IV.K.1/2/6.
//
// Yang dijaga semuanya kelas kegagalan SENYAP — baru ketahuan SESUDAH lembarnya
// dicetak & ditandatangani:
//
//   · `scope` cabang pengalihan terbalik → lembar berkop "PENGHAPUSAN" berisi
//     barang yang justru baru DITERIMA SKPD itu, terisi penuh & footing benar
//   · kolom ditambah/dibuang tanpa menggeser penomoran → lembar tak cocok saat
//     pemeriksa mencocokkannya kolom per kolom
//   · total lebar ≠ 100                 → kolom melar & keluar halaman
//   · rekap memancarkan baris 3 segmen  → baris kelompok neraca yang ADA di
//     format ini HILANG, dan angkanya tetap benar jadi tak ada yang berteriak
//   · rekap ≠ subtotal lembar rinci     → satu berkas bertanda tangan memuat
//     dua angka berbeda
//   · cabang saling menular kolom       → IV.K.6 mencetak "Cara
//     Pemindahtanganan" yang tak ada di formatnya
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_PENGHAPUSAN, URUT_PENGHAPUSAN, TANGGA_REKAP_PENGHAPUSAN,
  SEG_MIN_REKAP_PENGHAPUSAN, KOLOM_DIJUMLAH_PENGHAPUSAN, judulRekapPenghapusan,
  type IdPenghapusan,
} from './formatPenghapusan'
import { susunRinci, susunRekap, type ItemLaporan } from './formatPermendagri'
import { SUBJENIS_OPT, SUBJENIS_LABEL, JENIS_PENGHAPUSAN } from './penghapusan'
import { periodePosisiPenghapusan, penghapusanEfektif } from './laporanPenghapusan'

const AKAR = path.resolve(__dirname, '..')
const tiapCabang = URUT_PENGHAPUSAN.map(id => [id, FORMAT_PENGHAPUSAN[id]] as const)

describe('registry IV.K', () => {
  it('memuat TEPAT tiga cabang yang dikenal', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa menjalankan
    // apa pun — lebih berbahaya daripada tak punya test.
    expect(URUT_PENGHAPUSAN).toEqual(['pemindahtanganan', 'pengalihan', 'sebab_lain'])
    expect(Object.keys(FORMAT_PENGHAPUSAN).sort())
      .toEqual([...URUT_PENGHAPUSAN].sort())
  })

  it.each(tiapCabang)('%s — kode & awalan berbentuk nomor lampiran', (id, f) => {
    expect(f.kode, `${id}.kode`).toMatch(/^IV\.K(\.\d+)+$/)
    expect(f.kode, `${id}: kode harus di bawah awalan`).toBe(`${f.awalan}.2`)
  })

  it('nomor cabang MELOMPAT 1 → 2 → 6 & tak bertabrakan', () => {
    // ⚠️ Memang begitu di lampiran (3–5 milik sebab penghapusan yang aplikasi
    // ini tak catat). Jangan "dirapikan" jadi berurutan — nomor lembar itu yang
    // dipakai orang mencari formatnya.
    expect(URUT_PENGHAPUSAN.map(id => FORMAT_PENGHAPUSAN[id].awalan))
      .toEqual(['IV.K.1', 'IV.K.2', 'IV.K.6'])
    const awalan = URUT_PENGHAPUSAN.map(id => FORMAT_PENGHAPUSAN[id].awalan)
    expect(new Set(awalan).size, `awalan kembar: ${awalan.join(', ')}`).toBe(awalan.length)
  })

  it('jenis ledger sesuai cabangnya & tak ada dua cabang berjenis sama', () => {
    expect(FORMAT_PENGHAPUSAN.pemindahtanganan.jenis).toBe('penghapusan_pemindahtanganan')
    expect(FORMAT_PENGHAPUSAN.pengalihan.jenis).toBe('pengalihan_status')
    expect(FORMAT_PENGHAPUSAN.sebab_lain.jenis).toBe('penghapusan_sebab_lain')
    const j = URUT_PENGHAPUSAN.map(id => FORMAT_PENGHAPUSAN[id].jenis)
    expect(new Set(j).size, `jenis kembar: ${j.join(', ')}`).toBe(j.length)
  })

  it('SCOPE cabang pengalihan = `asal` — sisi SKPD yang MELEPAS', () => {
    // ⚠️ Uji terpenting berkas ini. `pengalihan_status` punya `skpd_asal` DAN
    // `skpd_tujuan`; lembar IV.K.2 milik yang MELEPAS, cerminan persis lembar
    // IV.B.1.2 (Penerimaan Penggunaan) yang membaca sisi penerima atas baris
    // ledger yang SAMA. Kalau tertukar, lembar berkop "PENGHAPUSAN" akan berisi
    // barang yang justru baru DITERIMA — terisi penuh, footing benar, tanpa
    // satu pun error.
    expect(FORMAT_PENGHAPUSAN.pengalihan.scope).toBe('asal')
    // Kedua cabang `penghapusan_*` tak punya kolom SKPD sama sekali di
    // ledgernya, jadi hanya bisa lewat `aset.skpd_id`.
    expect(FORMAT_PENGHAPUSAN.pemindahtanganan.scope).toBe('aset')
    expect(FORMAT_PENGHAPUSAN.sebab_lain.scope).toBe('aset')
  })

  it('judul baris kedua menyatakan sebab penghapusannya', () => {
    // Kalau `judulLanjut` & `jenis` menyimpang, lembarnya berkop "SEBAB LAIN"
    // tapi berisi pemindahtanganan. Angkanya tetap sah-sah saja bentuknya.
    for (const [id, f] of tiapCabang) {
      expect(f.judul, `${id}: judul`).toBe('LAPORAN PENGHAPUSAN BMD BERUPA')
      expect(f.judulLanjut, `${id}: judulLanjut`).toContain('PENGHAPUSAN')
    }
    expect(FORMAT_PENGHAPUSAN.pemindahtanganan.judulLanjut).toContain('PEMINDAHTANGANAN')
    expect(FORMAT_PENGHAPUSAN.pengalihan.judulLanjut).toContain('PENGALIHAN STATUS PENGGUNAAN')
    expect(FORMAT_PENGHAPUSAN.sebab_lain.judulLanjut).toContain('SEBAB LAIN')
  })
})

// ── Lembar RINCI: susunan kolom keputusan user (2026-09-28) ─────────────────
describe('kolom lembar rinci', () => {
  const kunci = (id: IdPenghapusan) => FORMAT_PENGHAPUSAN[id].kolom.map(k => k.key)

  it('urutan kolom PERSIS seperti yang ditetapkan user — tiap cabang', () => {
    // Urutan kolom lembar bertanda tangan itu aturan integritas: pemeriksa
    // mencocokkannya kolom per kolom dgn contoh yang disetujui.
    const awal = ['nibar', 'kode', 'nama', 'merek', 'no_polisi', 'jumlah',
      'harga_satuan', 'nilai_perolehan', 'akumulasi', 'nilai_buku']
    const akhir = ['dok_nomor', 'dok_tanggal', 'keterangan']
    expect(kunci('pemindahtanganan')).toEqual([...awal, 'lokasi', 'cara_pemindahtanganan', ...akhir])
    expect(kunci('pengalihan')).toEqual([...awal, 'tgl_perolehan', 'cara_perolehan', 'lokasi', 'penerima', ...akhir])
    expect(kunci('sebab_lain')).toEqual([...awal, 'lokasi', 'sebab', ...akhir])
  })

  it('Sebab Lain berjudul "Sebab Penghapusan" — kembar K.1 minus Cara Pemindahtanganan', () => {
    const k = FORMAT_PENGHAPUSAN.sebab_lain.kolom.find(x => x.key === 'sebab')!
    expect(k.judul).toBe('Sebab Penghapusan')
    expect(kunci('sebab_lain')).not.toContain('cara_pemindahtanganan')
  })

  it('kolom khas cabang tak menular ke cabang lain', () => {
    expect(kunci('pemindahtanganan')).not.toContain('penerima')
    expect(kunci('sebab_lain')).not.toContain('penerima')
    expect(kunci('pengalihan')).not.toContain('cara_pemindahtanganan')
    expect(kunci('pengalihan')).not.toContain('sebab')
  })

  it('ketiga cabang TIDAK berbagi objek kolom yang sama', () => {
    expect(FORMAT_PENGHAPUSAN.pemindahtanganan.kolom).not.toBe(FORMAT_PENGHAPUSAN.sebab_lain.kolom)
  })

  it.each(tiapCabang)('%s — total lebar 100 PERSIS & tiap kolom positif', (id, f) => {
    const total = f.kolom.reduce((a, x) => a + x.lebar, 0)
    expect(Math.round(total * 100) / 100, id).toBe(100)
    for (const x of f.kolom) expect(x.lebar, `${id}.${x.key}`).toBeGreaterThan(0)
  })

  it.each(tiapCabang)('%s — NIBAR dapat jatah terbesar (≥ 10%)', (_id, f) => {
    const nibar = f.kolom.find(x => x.key === 'nibar')!.lebar
    expect(nibar).toBeGreaterThanOrEqual(10)
    for (const x of f.kolom) expect(x.lebar).toBeLessThanOrEqual(nibar)
  })

  it.each(tiapCabang)('%s — kolom uang dijumlah BERURUTAN, Harga Satuan tidak', (_id, f) => {
    const idx = KOLOM_DIJUMLAH_PENGHAPUSAN.map(key => f.kolom.findIndex(x => x.key === key))
    expect(idx.every(i => i >= 0)).toBe(true)
    expect(idx).toEqual(idx.map((_, j) => idx[0] + j))
    expect(KOLOM_DIJUMLAH_PENGHAPUSAN).not.toContain('harga_satuan')
  })

  it.each(tiapCabang)('%s — lembar rekap REKAPITULASI, lembar rinci LAPORAN', (_id, f) => {
    expect(f.judul.startsWith('LAPORAN ')).toBe(true)
    expect(judulRekapPenghapusan(f).startsWith('REKAPITULASI ')).toBe(true)
  })
})

describe('tangga rekap .3–.6', () => {
  it('empat lembar, akhiran 3–6, makin dangkal', () => {
    expect(TANGGA_REKAP_PENGHAPUSAN.map(t => t.akhiran)).toEqual([3, 4, 5, 6])
    expect(TANGGA_REKAP_PENGHAPUSAN.map(t => t.seg)).toEqual([6, 5, 4, 3])
    expect(TANGGA_REKAP_PENGHAPUSAN[0].menurut).toBe('SUB RINCIAN OBJEK')
  })

  it('MULAI DI 2 SEGMEN — beda dari keluarga perpindahan yang mulai di 3', () => {
    // ⚠️ Lembar IV.K.<n>.3 membuka dengan baris `x x` (kelompok neraca). Memakai
    // 3 MENGHILANGKAN baris yang ada di format aslinya, dan karena angkanya
    // tetap menjumlah benar tak satu pun uji aritmetika akan menangkapnya.
    expect(SEG_MIN_REKAP_PENGHAPUSAN).toBe(2)
    const items = contoh()
    expect(susunRekap(items, 6, SEG_MIN_REKAP_PENGHAPUSAN).some(b => b.seg === 2),
      'baris kelompok neraca `1.3` hilang').toBe(true)
  })

  it('rekap TERDALAM = subtotal lembar rinci, angka per angka', () => {
    // Lembar rinci & keempat rekapnya terbit dalam SATU berkas bertanda tangan.
    const items = contoh()
    const rinci = susunRinci(items, [24, 25, 26, 27] as const)
      .filter(b => b.tipe === 'grup' && b.seg === 6)
    const rekap = susunRekap(items, 6, SEG_MIN_REKAP_PENGHAPUSAN).filter(b => b.seg === 6)
    expect(rekap.length).toBe(rinci.length)
    for (let i = 0; i < rekap.length; i++) {
      expect(rekap[i].kode).toBe((rinci[i] as { kode: string }).kode)
      expect(rekap[i].nilai).toBe((rinci[i] as { nilai: number }).nilai)
    }
  })

  it('akumulasi & nilai buku IKUT dijumlah di tiap kedalaman', () => {
    const items = contoh()
    for (const t of TANGGA_REKAP_PENGHAPUSAN) {
      const teratas = susunRekap(items, t.seg, SEG_MIN_REKAP_PENGHAPUSAN)
        .filter(b => b.seg === SEG_MIN_REKAP_PENGHAPUSAN)
      expect(teratas.reduce((s, b) => s + b.akumulasi, 0), `IV.K.x.${t.akhiran}: akumulasi`)
        .toBe(items.reduce((s, i) => s + (i.akumulasi ?? 0), 0))
      expect(teratas.reduce((s, b) => s + b.nilaiBuku, 0), `IV.K.x.${t.akhiran}: nilai buku`)
        .toBe(items.reduce((s, i) => s + (i.nilaiBuku ?? 0), 0))
    }
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    for (const t of TANGGA_REKAP_PENGHAPUSAN) {
      expect(susunRekap([], t.seg, SEG_MIN_REKAP_PENGHAPUSAN), `IV.K.x.${t.akhiran}`).toEqual([])
    }
  })
})

describe('cara pemindahtanganan (kolom 20 IV.K.1.2)', () => {
  it('keempat cara punya label & labelnya tak kosong', () => {
    // ⚠️ Labelnya TERCETAK di lembar bertanda tangan — label kosong berarti
    // kolom yang lupa diisi di dokumen resmi.
    expect(SUBJENIS_OPT.length).toBe(4)
    for (const o of SUBJENIS_OPT) {
      expect(SUBJENIS_LABEL[o.value], o.value).toBe(o.label)
      expect(o.label.trim(), o.value).not.toBe('')
    }
    expect(SUBJENIS_OPT.map(o => o.value))
      .toEqual(['hibah', 'penjualan', 'tukar_menukar', 'penyertaan_modal'])
  })

  it('keempatnya memakai lembar YANG SAMA — IV.K.1.2', () => {
    // Permendagri tak memberi lembar terpisah per cara pemindahtanganan; yang
    // membedakan cuma kolom (20). Kalau kelak seseorang membuatkan cabang per
    // cara, uji ini yang menjelaskan kenapa itu keliru.
    expect(FORMAT_PENGHAPUSAN.pemindahtanganan.kode).toBe('IV.K.1.2')
    expect(URUT_PENGHAPUSAN.filter(id => FORMAT_PENGHAPUSAN[id].awalan === 'IV.K.1').length).toBe(1)
  })

  it('JENIS_PENGHAPUSAN tak memuat `pengalihan_status`', () => {
    // ⚠️ Ia dilayani index yang BERBEDA (`idx_trx_pindah_id`), dan di aplikasi
    // ini bukan baris penghapusan melainkan perpindahan antar SKPD.
    expect([...JENIS_PENGHAPUSAN]).toEqual(['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])
    expect([...JENIS_PENGHAPUSAN]).not.toContain('pengalihan_status')
  })
})

describe('penghapusanEfektif — replay "peristiwa terakhir menang"', () => {
  // ⚠️ BUG NYATA 2026-09-08: menu ini menampilkan 14 barang (Rp252 M) sementara
  // Dashboard & Pembukuan sama-sama 0. Sebabnya `batal_penghapusan` TIDAK
  // membawa `payload.target_trx_id` (payloadnya `{}` — diverifikasi ke
  // produksi), jadi `fetchBatalTargets` mengembalikan set kosong & tak
  // menyaring apa pun. Keenam asetnya sudah dibatalkan penghapusannya waktu uji
  // coba, tapi baris ledgernya tetap terhitung.
  const ev = (id: number, aset: string, jenis: string, periode = '2026-S2') =>
    ({ id, aset_id: aset, periode, jenis })

  it('dibatalkan → TIDAK berlaku (kasus produksi yang jadi sebab bug)', () => {
    expect([...penghapusanEfektif([
      ev(1, 'a', 'penghapusan_pemindahtanganan'),
      ev(2, 'a', 'batal_penghapusan'),
    ])]).toEqual([])
  })

  it('dihapus lalu dibiarkan → berlaku', () => {
    expect([...penghapusanEfektif([ev(1, 'a', 'penghapusan_pemindahtanganan')])]).toEqual([1])
  })

  it('hapus → batal → hapus lagi: HANYA yang terakhir berlaku', () => {
    // ⚠️ Ini yang mencegah satu barang terhitung BERKALI-KALI. Itulah yang dulu
    // dikerjakan `efektifPerAsetStatus="dihapus"` lewat `aset.status`.
    expect([...penghapusanEfektif([
      ev(1, 'a', 'penghapusan_pemindahtanganan'),
      ev(2, 'a', 'batal_penghapusan'),
      ev(3, 'a', 'penghapusan_sebab_lain'),
    ])]).toEqual([3])
  })

  it('urutan masukan tak berpengaruh — yang menentukan (periode, id)', () => {
    const acak = [
      ev(3, 'a', 'penghapusan_sebab_lain'),
      ev(1, 'a', 'penghapusan_pemindahtanganan'),
      ev(2, 'a', 'batal_penghapusan'),
    ]
    expect([...penghapusanEfektif(acak)]).toEqual([3])
  })

  it('PERIODE menang atas id — baris ber-id besar di periode lampau tak menang', () => {
    // Baris pembatalan bisa saja ber-id lebih besar tapi bertanggal mundur ke
    // periode sebelumnya; yang menentukan kapan peristiwanya terjadi.
    expect([...penghapusanEfektif([
      ev(1, 'a', 'penghapusan_pemindahtanganan', '2026-S2'),
      ev(99, 'a', 'batal_penghapusan', '2026-S1'),
    ])]).toEqual([1])
  })

  it('tiap aset dinilai SENDIRI-SENDIRI', () => {
    const hasil = penghapusanEfektif([
      ev(1, 'a', 'penghapusan_pemindahtanganan'),
      ev(2, 'a', 'batal_penghapusan'),
      ev(3, 'b', 'penghapusan_pemindahtanganan'),
    ])
    expect([...hasil]).toEqual([3])
  })

  it('riwayat kosong → tak ada yang berlaku', () => {
    expect([...penghapusanEfektif([])]).toEqual([])
  })
})

describe('penyaji', () => {
  const berkas = path.join(AKAR, 'components/pelaporan/LembarPenghapusanPermendagri.tsx')

  it('berkasnya ada & tak hampa', () => {
    expect(fs.existsSync(berkas)).toBe(true)
    expect(fs.readFileSync(berkas, 'utf8').length).toBeGreaterThan(2000)
  })

  it('memanggil susunRekap DENGAN SEG_MIN_REKAP_PENGHAPUSAN, bukan bawaan 2', () => {
    // Bawaan `SEG_MIN_REKAP` kebetulan juga 2, jadi ini TAK akan merah kalau
    // salah — yang dijaga: nilainya datang dari konstanta keluarga ini, supaya
    // mengubahnya di satu tempat benar-benar mengubah lembarnya.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain('susunRekap(items, seg, SEG_MIN_REKAP_PENGHAPUSAN)')
  })

  it('TIDAK bercabang per format — pembedanya seluruhnya data', () => {
    const isi = fs.readFileSync(berkas, 'utf8')
    const kode = isi.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
    for (const id of URUT_PENGHAPUSAN) {
      expect(kode, `penyaji bercabang pada '${id}'`).not.toMatch(new RegExp(`===\\s*'${id}'`))
    }
    expect(kode).not.toMatch(/f\.(kode|awalan|jenis)\s*===/)
  })

  it('lembar rekap TIDAK memakai kolom "Jumlah Barang" milik IV.B/IV.C/IV.D', () => {
    // Rekap keluarga IV.K cuma LIMA kolom; lembar aslinya bahkan menuliskan
    // rumusnya: `(12) = (10) - (11)`.
    const isi = fs.readFileSync(berkas, 'utf8')
    const rekap = isi.slice(isi.indexOf('function LembarRekap'))
    expect(rekap).not.toContain('Jumlah Barang')
    expect(rekap).toContain('Jumlah (Rp)')
  })
})

describe('periode posisi', () => {
  it('AKHIR TAHUN memakai S2, bukan S1', () => {
    expect(periodePosisiPenghapusan('2026')).toBe('2026-S2')
  })
  it('satu semester dipakai apa adanya', () => {
    expect(periodePosisiPenghapusan('2026-S1')).toBe('2026-S1')
  })
  it('periode kosong → kosong, bukan menebak tahun berjalan', () => {
    expect(periodePosisiPenghapusan('')).toBe('')
  })
})

function contoh(): ItemLaporan<{ n: number }>[] {
  const buat = (kode: string, nilai: number, akum: number, n: number) => ({
    kode, jumlah: 1, nilai, akumulasi: akum, nilaiBuku: nilai - akum, data: { n },
  })
  return [
    buat('1.3.2.05.02.06.121', 1000, 200, 1),
    buat('1.3.2.05.02.06.122', 500, 100, 2),
    buat('1.3.2.05.03.01.001', 300, 50, 3),
    buat('1.3.3.01.01.01.001', 900, 400, 4),
    buat('1.5.4.01.01.01.001', 700, 0, 5),
  ]
}
