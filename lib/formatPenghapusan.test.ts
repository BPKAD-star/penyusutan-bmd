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
  SEG_MIN_REKAP_PENGHAPUSAN, SEL_KODE_PENGHAPUSAN,
  kolomLembarPenghapusan, lebarKodePenghapusan, judulRekapPenghapusan,
  type IdPenghapusan,
} from './formatPenghapusan'
import { SEG_SUBTOTAL, susunRinci, susunRekap, sisaLebar, type ItemLaporan } from './formatPermendagri'
import { SUBJENIS_OPT, SUBJENIS_LABEL, JENIS_PENGHAPUSAN } from './penghapusan'
import { periodePosisiPenghapusan } from './laporanPenghapusan'

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

describe('kolom lembar rinci', () => {
  it('kunci kolom unik di tiap cabang', () => {
    for (const [id, f] of tiapCabang) {
      const k = kolomLembarPenghapusan(f).map(x => x.key)
      expect(new Set(k).size, `${id}: kunci kembar`).toBe(k.length)
    }
  })

  it('penomoran berurut & TEPAT melompati satu nomor untuk blok Kode Barang', () => {
    for (const [id, f] of tiapCabang) {
      const n = kolomLembarPenghapusan(f).map(x => x.nomor)
      expect(n[0], `${id}: NIBAR kolom (8)`).toBe(8)
      expect(n[0] + 2, `${id}: Nama Barang harus melompat satu nomor (blok kode)`).toBe(n[1])
      for (let i = 2; i < n.length; i++) {
        expect(n[i], `${id}: nomor kolom ke-${i} tidak berurut`).toBe(n[i - 1] + 1)
      }
    }
  })

  it('NIBAR berdiri DI LUAR blok kode & jadi kolom paling kiri', () => {
    for (const [id, f] of tiapCabang) expect(f.kolomKiri.key, id).toBe('nibar')
  })

  it('penanda subtotal & kaki MENYAMBUNG tepat sesudah kolom terakhir', () => {
    // Kolom yang ditambah/dibuang tanpa menggeser penomoran adalah kesalahan
    // yang TIDAK bersuara — ini yang menangkapnya.
    for (const [id, f] of tiapCabang) {
      const n = kolomLembarPenghapusan(f).map(x => x.nomor)
      expect(f.subtotal[0], `${id}: subtotal pertama`).toBe(n[n.length - 1] + 1)
      expect(f.kaki.tanggal, `${id}: kaki.tanggal`).toBe(f.subtotal[3] + 1)
      expect(f.kaki.jabatan, id).toBe(f.kaki.tanggal + 1)
      expect(f.kaki.nama, id).toBe(f.kaki.jabatan + 1)
    }
  })

  it('subtotal SEJAJAR dengan SEG_SUBTOTAL [6,5,4,3]', () => {
    for (const [id, f] of tiapCabang) {
      expect(f.subtotal.length, id).toBe(SEG_SUBTOTAL.length)
      for (let i = 1; i < f.subtotal.length; i++) {
        expect(f.subtotal[i], `${id}: subtotal harus menaik`).toBe(f.subtotal[i - 1] + 1)
      }
    }
  })

  it('sepuluh kolom pertama IDENTIK di ketiga cabang', () => {
    // ⚠️ Itu yang membuat satu registry & satu penyaji sah. Kalau salah satu
    // cabang menyimpang di blok ini, penyajinya diam-diam mencetak susunan yang
    // berbeda dari kembarannya.
    const kunci = (id: IdPenghapusan) =>
      kolomLembarPenghapusan(FORMAT_PENGHAPUSAN[id]).slice(0, 10).map(k => k.key)
    expect(kunci('pengalihan')).toEqual(kunci('pemindahtanganan'))
    expect(kunci('sebab_lain')).toEqual(kunci('pemindahtanganan'))
    expect(kunci('pemindahtanganan')).toEqual([
      'nibar', 'nama', 'spek_nama', 'spek_lain', 'jumlah', 'satuan',
      'harga_satuan', 'jumlah_total', 'akumulasi', 'nilai_buku',
    ])
  })

  it('blok SK Penghapusan + Keterangan menutup KETIGA cabang', () => {
    for (const [id, f] of tiapCabang) {
      const k = kolomLembarPenghapusan(f).map(x => x.key)
      expect(k.slice(-3), `${id}: tiga kolom terakhir`).toEqual(['sk_tanggal', 'sk_nomor', 'keterangan'])
    }
  })

  it('kolom khas cabang tak menular ke cabang lain', () => {
    const k = (id: IdPenghapusan) => kolomLembarPenghapusan(FORMAT_PENGHAPUSAN[id]).map(x => x.key)
    // "Cara Pemindahtanganan" HANYA di IV.K.1 — satu-satunya kolom yang
    // membedakan hibah, penjualan, tukar-menukar, & penyertaan modal.
    expect(k('pemindahtanganan')).toContain('cara_pemindahtanganan')
    expect(k('pengalihan')).not.toContain('cara_pemindahtanganan')
    expect(k('sebab_lain')).not.toContain('cara_pemindahtanganan')
    // "Penerima Penyerahan", "Tgl Perolehan", & "Cara Perolehan" HANYA di IV.K.2.
    for (const key of ['penerima', 'tgl_perolehan', 'cara_perolehan']) {
      expect(k('pengalihan'), key).toContain(key)
      expect(k('pemindahtanganan'), key).not.toContain(key)
      expect(k('sebab_lain'), key).not.toContain(key)
    }
    // Lokasi ada di KETIGANYA.
    for (const id of URUT_PENGHAPUSAN) expect(k(id), id).toContain('lokasi')
  })

  it('jumlah kolom menyusut sesuai yang dibuang tiap cabang', () => {
    const n = (id: IdPenghapusan) => kolomLembarPenghapusan(FORMAT_PENGHAPUSAN[id]).length
    // K.2 paling lebar (4 kolom lebih dari K.1); K.6 paling ramping.
    expect(n('pengalihan')).toBe(n('pemindahtanganan') + 2)
    expect(n('sebab_lain')).toBe(n('pemindahtanganan') - 1)
  })

  it('kolom bergrup berdampingan — grup tak boleh terpotong kolom lain', () => {
    // Kepala tabel merakit grup dgn menyusuri kolom berurutan; grup yang
    // terpotong menghasilkan DUA kepala bernama sama & colSpan yang salah.
    for (const [id, f] of tiapCabang) {
      const terlihat = new Set<string>()
      let lalu = ''
      for (const g of f.kolom.map(k => k.grup ?? '')) {
        if (g && g !== lalu) {
          expect(terlihat.has(g), `${id}: grup '${g}' terpotong`).toBe(false)
          terlihat.add(g)
        }
        lalu = g
      }
    }
  })
})

describe('lebar kolom — "fit to window", tak boros ke samping', () => {
  it('total lebar kolom + blok kode = 100 PERSIS di tiap cabang', () => {
    for (const [id, f] of tiapCabang) {
      const jumlah = kolomLembarPenghapusan(f).reduce((s, k) => s + k.lebar, 0)
      expect(Number((jumlah + lebarKodePenghapusan(f)).toFixed(6)), id).toBe(100)
      expect(sisaLebar(kolomLembarPenghapusan(f)), id).toBe(lebarKodePenghapusan(f))
    }
  })

  it('blok kode cukup lebar untuk 7 sel segmen — tapi tak boros', () => {
    // ⚠️ DUA arah sekaligus (permintaan user 2026-09-07: "rapi & fit to window,
    // jangan boros ke sampingnya"). Terlalu sempit → segmen 3 karakter ("001")
    // membungkus; terlalu lebar → ruang yang mestinya jadi jatah kolom teks
    // panjang, yang justru penentu TINGGI baris.
    for (const [id, f] of tiapCabang) {
      const perSel = lebarKodePenghapusan(f) / SEL_KODE_PENGHAPUSAN
      expect(perSel, `${id}: sel kode terlalu sempit`).toBeGreaterThan(1.4)
      expect(perSel, `${id}: sel kode boros — beri ke kolom teks`).toBeLessThan(2.0)
    }
  })

  it('kolom teks panjang dapat porsi lebih besar dari kolom angka pendek', () => {
    // Penjaga ARAH, bukan angka pasti: yang menentukan tinggi baris adalah
    // kolom teks yang membungkus (pelajaran lembar IV.F, 2026-09-07).
    for (const [id, f] of tiapCabang) {
      const l = (k: string) => kolomLembarPenghapusan(f).find(x => x.key === k)!.lebar
      expect(l('nama'), `${id}: Nama Barang (nomenklatur, terpanjang)`).toBeGreaterThan(l('jumlah_total'))
      expect(l('spek_nama'), `${id}: Spesifikasi Nama Barang`).toBeGreaterThan(l('satuan'))
      expect(l('jumlah'), `${id}: kolom Jumlah tak perlu lebar`).toBeLessThan(3)
    }
  })

  it('NIBAR tak boleh dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    for (const [id, f] of tiapCabang) {
      expect(f.kolomKiri.lebar, `${id}: kolom NIBAR`).toBeGreaterThanOrEqual(7.5)
    }
  })

  it('kolom bertanggal punya batas bawah keras — ia dirender nowrap', () => {
    // "13/05/2020" @7,5px ≈ 42 px + padding ≈ 46 px; 4,0% dari lebar cetak F4
    // lanskap (±1.200 px) = 48 px. Di bawah itu tanggalnya meluber ke sel
    // sebelah DI SETIAP BARIS, dan `table-fixed` menyembunyikannya sampai
    // kertasnya keluar.
    for (const [id, f] of tiapCabang) {
      for (const k of kolomLembarPenghapusan(f).filter(x => x.rata === 'tengah' && x.key.includes('tgl') === false && x.key.includes('tanggal'))) {
        expect(k.lebar, `${id}.${k.key}`).toBeGreaterThanOrEqual(4.0)
      }
      const tglPerolehan = kolomLembarPenghapusan(f).find(x => x.key === 'tgl_perolehan')
      if (tglPerolehan) expect(tglPerolehan.lebar, `${id}.tgl_perolehan`).toBeGreaterThanOrEqual(4.0)
    }
  })

  it('tiap kolom punya lebar positif', () => {
    for (const [id, f] of tiapCabang) {
      for (const k of kolomLembarPenghapusan(f)) expect(k.lebar, `${id}.${k.key}`).toBeGreaterThan(0)
    }
  })

  it('lembar rekap berjudul REKAPITULASI, lembar rinci LAPORAN', () => {
    for (const [id, f] of tiapCabang) {
      expect(f.judul.startsWith('LAPORAN '), id).toBe(true)
      expect(judulRekapPenghapusan(f).startsWith('REKAPITULASI '), id).toBe(true)
      // Sisanya WAJIB sama persis — kalau tidak, dua lembar dalam satu berkas
      // mengaku memuat hal yang berbeda.
      expect(judulRekapPenghapusan(f).replace(/^REKAPITULASI /, ''))
        .toBe(f.judul.replace(/^LAPORAN /, ''))
    }
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
    const rinci = susunRinci(items, FORMAT_PENGHAPUSAN.pemindahtanganan.subtotal)
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
