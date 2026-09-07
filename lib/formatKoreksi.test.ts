// Penjaga format lembar KOREKSI Permendagri 47/2021 — IV.G.2–G.7.
//
// Yang dijaga semuanya kelas kegagalan SENYAP — baru ketahuan SESUDAH lembarnya
// dicetak & ditandatangani:
//
//   · kunci `ukuran` salah ketik            → kolomnya tercetak Rp0. `Record`
//     menerima string apa pun, jadi tak ada satu pun error.
//   · Tambah/Kurang diturunkan dari netto    → kelompok +100/−40 tercetak
//     "Tambah 60 · Kurang 0" alih-alih "100 · 40", dan nettonya tetap benar
//   · total lebar ≠ 100                      → kolom melar & keluar halaman
//   · `punyaBarang` disimpulkan dari `bentuk` → IV.G.3 kehilangan SELURUH baris
//     barangnya, sementara angka kelompoknya tetap benar
//   · penomoran kolom tak bergeser           → lembar tak cocok saat pemeriksa
//     mencocokkannya kolom per kolom
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  TANGGA_KOREKSI, URUT_LEMBAR, AWALAN_KOREKSI, SEL_KODE_KOREKSI, UK, JUDUL_KOREKSI,
  kolomLembarKoreksi, lebarKodeKoreksi, kodeLembarKoreksi,
  type IdLembarKoreksi,
} from './formatKoreksi'
import { SEG_SUBTOTAL, susunRinci, susunRekap, sisaLebar, type ItemLaporan } from './formatPermendagri'
import { itemKoreksi, periodePosisiKoreksi, type BarisKoreksi } from './laporanKoreksi'

const AKAR = path.resolve(__dirname, '..')
const tiapLembar = URUT_LEMBAR.map(id => [id, TANGGA_KOREKSI[id]] as const)

describe('tangga IV.G', () => {
  it('memuat TEPAT enam lembar, G.2 s.d. G.7', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa menjalankan
    // apa pun — lebih berbahaya daripada tak punya test.
    expect(URUT_LEMBAR).toEqual(['g2', 'g3', 'g4', 'g5', 'g6', 'g7'])
    expect(URUT_LEMBAR.map(id => TANGGA_KOREKSI[id].akhiran)).toEqual([2, 3, 4, 5, 6, 7])
    expect(kodeLembarKoreksi(TANGGA_KOREKSI.g2)).toBe('IV.G.2')
    expect(kodeLembarKoreksi(TANGGA_KOREKSI.g7)).toBe('IV.G.7')
    expect(AWALAN_KOREKSI).toBe('IV.G')
  })

  it('HANYA IV.G.2 berbentuk rinci; lima sisanya bentuk selisih', () => {
    expect(TANGGA_KOREKSI.g2.bentuk).toBe('rinci')
    for (const id of ['g3', 'g4', 'g5', 'g6', 'g7'] as IdLembarKoreksi[]) {
      expect(TANGGA_KOREKSI[id].bentuk, id).toBe('selisih')
    }
  })

  it('`punyaBarang` TIDAK sama dengan `bentuk` — IV.G.3 pengecualiannya', () => {
    // ⚠️ Uji terpenting berkas ini. IV.G.3 berbentuk `selisih` TAPI masih memuat
    // baris barang berikut NIBAR & Spesifikasi Nama Barang. Menyimpulkan yang
    // satu dari yang lain akan membuatnya kehilangan SELURUH baris barangnya —
    // dan angka kelompoknya tetap benar, jadi tak ada yang berteriak.
    expect(TANGGA_KOREKSI.g3.bentuk).toBe('selisih')
    expect(TANGGA_KOREKSI.g3.punyaBarang).toBe(true)
    expect(TANGGA_KOREKSI.g2.punyaBarang).toBe(true)
    for (const id of ['g4', 'g5', 'g6', 'g7'] as IdLembarKoreksi[]) {
      expect(TANGGA_KOREKSI[id].punyaBarang, id).toBe(false)
    }
  })

  it('kedalaman menurun G.4→G.7 & IV.G.7 berhenti di JENIS (3 segmen)', () => {
    // Bentuk IV.G.7 ditegaskan user 2026-09-07: "menurut jenis aja, jadi ada di
    // atas level objek" — satu tingkat lebih dangkal dari IV.G.6.
    expect(['g4', 'g5', 'g6', 'g7'].map(id => TANGGA_KOREKSI[id as IdLembarKoreksi].seg))
      .toEqual([6, 5, 4, 3])
    expect(TANGGA_KOREKSI.g7.menurut).toBe('JENIS')
    expect(TANGGA_KOREKSI.g6.menurut).toBe('OBJEK')
  })

  it('segMin: 3 untuk dua lembar berbaris barang, 2 untuk empat rekap murni', () => {
    // ⚠️ MENGIKUTI GAMBAR FORMATNYA: IV.G.2 & IV.G.3 membuka dgn `x x x`,
    // IV.G.4–G.7 dgn `x x` (kelompok neraca). Menyeragamkannya TIDAK mengubah
    // satu pun angka — cuma menambah/menghilangkan baris kelompok teratas —
    // jadi tak ada uji aritmetika yang menangkapnya. Uji ini penjaganya.
    for (const [id, l] of tiapLembar) {
      expect(l.segMin, `${id}: segMin`).toBe(l.punyaBarang ? 3 : 2)
      expect(l.segMin, `${id}: segMin melampaui kedalamannya`).toBeLessThanOrEqual(l.seg)
    }
  })

  it('lembar berbaris barang punya penanda subtotal; rekap murni tidak', () => {
    for (const [id, l] of tiapLembar) {
      if (l.punyaBarang) {
        expect(l.subtotal, `${id}`).toBeTruthy()
        expect(l.subtotal!.length, `${id}`).toBe(SEG_SUBTOTAL.length)
        for (let i = 1; i < l.subtotal!.length; i++) {
          expect(l.subtotal![i], `${id}: subtotal harus menaik`).toBe(l.subtotal![i - 1] + 1)
        }
      } else {
        expect(l.subtotal, `${id}: rekap murni tak punya penanda subtotal`).toBeUndefined()
      }
    }
  })

  it('judul menyatakan bentuknya — LAPORAN vs REKAPITULASI', () => {
    expect(JUDUL_KOREKSI.rinci.startsWith('LAPORAN KOREKSI BMD')).toBe(true)
    expect(JUDUL_KOREKSI.selisih.startsWith('REKAPITULASI PENJELASAN SELISIH')).toBe(true)
    // Isian "BERUPA…(1)" diisi pemanggil, jadi keduanya berhenti tepat di situ.
    for (const j of Object.values(JUDUL_KOREKSI)) expect(j.endsWith('BERUPA')).toBe(true)
  })
})

describe('kolom', () => {
  it('kunci kolom unik di tiap lembar', () => {
    for (const [id, l] of tiapLembar) {
      const k = kolomLembarKoreksi(l).map(x => x.key)
      expect(new Set(k).size, `${id}: kunci kembar`).toBe(k.length)
    }
  })

  it('penomoran berurut & mulai tepat sesudah blok Kode Barang (8)', () => {
    for (const [id, l] of tiapLembar) {
      const n = kolomLembarKoreksi(l).map(x => x.nomor)
      expect(n[0], `${id}: kolom pertama sesudah blok kode`).toBe(9)
      for (let i = 1; i < n.length; i++) {
        expect(n[i], `${id}: nomor kolom ke-${i} tidak berurut`).toBe(n[i - 1] + 1)
      }
    }
  })

  it('IV.G.2: NIBAR kolom (10) DI TENGAH, bukan paling kiri', () => {
    // ⚠️ Beda dari keluarga IV.B/IV.C/IV.D/IV.F yang menaruhnya di luar blok
    // kode & paling kiri. Di sini blok "Kode Barang" yang paling kiri dan
    // BERDIRI SENDIRI — tak ada super-header "Penggolongan dan Kodefikasi
    // Barang". Jangan disamakan "biar seragam".
    const k = kolomLembarKoreksi(TANGGA_KOREKSI.g2)
    expect(k[0].key).toBe('nama')
    expect(k[1].key).toBe('nibar')
    expect(k[1].nomor).toBe(10)
  })

  it('IV.G.2 punya SEMBILAN kolom uang: sebelum · setelah · selisih', () => {
    const k = kolomLembarKoreksi(TANGGA_KOREKSI.g2)
    for (const pre of ['sblm', 'stlh', 'slsh']) {
      for (const u of ['np', 'ak', 'nb']) {
        expect(k.map(x => x.key), `${pre}_${u}`).toContain(`${pre}_${u}`)
      }
    }
    expect(k.filter(x => x.grup === 'Sebelum Koreksi').length).toBe(3)
    expect(k.filter(x => x.grup === 'Setelah Koreksi').length).toBe(3)
    expect(k.filter(x => x.grup === 'Selisih').length).toBe(3)
  })

  it('bentuk selisih punya ENAM kolom uang: 3 ukuran × Tambah/Kurang', () => {
    for (const id of ['g3', 'g4', 'g5', 'g6', 'g7'] as IdLembarKoreksi[]) {
      const k = kolomLembarKoreksi(TANGGA_KOREKSI[id]).map(x => x.key)
      for (const key of ['np_tambah', 'np_kurang', 'ak_tambah', 'ak_kurang', 'nb_tambah', 'nb_kurang']) {
        expect(k, `${id}: kolom '${key}' hilang`).toContain(key)
      }
      // Bentuk selisih TIDAK memuat sebelum/setelah — lembarnya cuma tentang
      // selisihnya, dan menambahkannya akan mengubah susunan kolom resmi.
      expect(k.some(x => x.startsWith('sblm_') || x.startsWith('stlh_')), id).toBe(false)
    }
  })

  it('penomoran kolom uang BERGESER antara IV.G.3 & IV.G.4', () => {
    // IV.G.3 membawa dua kolom ekstra (NIBAR & Spesifikasi Nama Barang), jadi
    // kolom uang pertamanya (12); IV.G.4 tak punya keduanya → (10).
    const cari = (id: IdLembarKoreksi) =>
      kolomLembarKoreksi(TANGGA_KOREKSI[id]).find(k => k.key === 'np_tambah')!.nomor
    expect(cari('g3')).toBe(12)
    expect(cari('g4')).toBe(10)
  })

  it('hanya lembar berbaris barang yang punya kolom NIBAR & Spesifikasi', () => {
    for (const [id, l] of tiapLembar) {
      const k = kolomLembarKoreksi(l).map(x => x.key)
      expect(k.includes('nibar'), `${id}: NIBAR`).toBe(l.punyaBarang)
      expect(k.includes('spek_nama'), `${id}: Spesifikasi`).toBe(l.punyaBarang)
    }
  })
})

describe('lebar kolom', () => {
  it('total lebar + blok kode = 100 PERSIS di tiap lembar', () => {
    for (const [id, l] of tiapLembar) {
      const jumlah = kolomLembarKoreksi(l).reduce((s, k) => s + k.lebar, 0)
      expect(Number((jumlah + lebarKodeKoreksi(l)).toFixed(6)), id).toBe(100)
      expect(lebarKodeKoreksi(l), `${id}: blok kode kehabisan ruang`).toBeGreaterThan(0)
      expect(sisaLebar(kolomLembarKoreksi(l)), id).toBe(lebarKodeKoreksi(l))
    }
  })

  it('blok kode lembar berbaris barang cukup untuk 7 sel segmen', () => {
    // ⚠️ Lembar IV.G.2 memuat 26 sel per baris — yang paling padat di aplikasi
    // ini. Sel yang lebih sempit dari ±1,4% membuat segmen 3 karakter ("001")
    // membungkus jadi beberapa baris.
    for (const [id, l] of tiapLembar) {
      if (!l.punyaBarang) continue
      expect(lebarKodeKoreksi(l) / SEL_KODE_KOREKSI, `${id}: sel kode terlalu sempit`)
        .toBeGreaterThan(1.4)
    }
  })

  it('kolom teks panjang tak lebih sempit dari kolom uang di IV.G.2', () => {
    // Penjaga arah: yang menentukan TINGGI baris adalah kolom teks yang
    // membungkus — pelajaran yang sama dgn lembar IV.F (2026-09-07).
    const k = kolomLembarKoreksi(TANGGA_KOREKSI.g2)
    const l = (key: string) => k.find(x => x.key === key)!.lebar
    expect(l('nama')).toBeGreaterThan(l('sblm_np'))
    expect(l('nibar')).toBeGreaterThan(l('sblm_np'))
    // "Nama Dokumen" SELALU kosong — ia tak berhak atas ruang sebanyak kolom
    // yang benar-benar berisi.
    expect(l('dok_nama')).toBeLessThan(l('keterangan'))
  })

  it('tiap kolom punya lebar positif', () => {
    for (const [id, l] of tiapLembar) {
      for (const k of kolomLembarKoreksi(l)) expect(k.lebar, `${id}.${k.key}`).toBeGreaterThan(0)
    }
  })
})

describe('itemKoreksi — dua belas ukuran', () => {
  it('sebelum & setelah dipetakan apa adanya; nilai buku DITURUNKAN', () => {
    // ⚠️ Nilai buku diturunkan (`perolehan − akumulasi`) di KEDUA sisi, bukan
    // dibaca dari `nilai_buku_akhir` — itu yang menjamin identitas
    // `NP − Akumulasi = NB` berlaku di lembar yang ditandatangani.
    const it = itemKoreksi(baris({ npSebelum: 1000, akSebelum: 200, npSetelah: 1500, akSetelah: 300 }))
    expect(it.ukuran![UK.npSebelum]).toBe(1000)
    expect(it.ukuran![UK.akSebelum]).toBe(200)
    expect(it.ukuran![UK.nbSebelum]).toBe(800)
    expect(it.ukuran![UK.npSetelah]).toBe(1500)
    expect(it.ukuran![UK.akSetelah]).toBe(300)
    expect(it.ukuran![UK.nbSetelah]).toBe(1200)
  })

  it('selisih NAIK masuk kolom Tambah; Kurang nol', () => {
    const u = itemKoreksi(baris({ npSebelum: 1000, akSebelum: 200, npSetelah: 1500, akSetelah: 300 })).ukuran!
    expect(u[UK.npTambah]).toBe(500)
    expect(u[UK.npKurang]).toBe(0)
    expect(u[UK.akTambah]).toBe(100)
    expect(u[UK.nbTambah]).toBe(400)
  })

  it('selisih TURUN masuk kolom Kurang sebagai bilangan POSITIF', () => {
    // ⚠️ Lembarnya punya kolom sendiri berjudul "Kurang", jadi tandanya sudah
    // dinyatakan judul kolom. Menyimpannya negatif membuat kolom itu tercetak
    // berisi minus semua & Σ-nya terbaca berlawanan arah.
    const u = itemKoreksi(baris({ npSebelum: 1500, akSebelum: 300, npSetelah: 1000, akSetelah: 200 })).ukuran!
    expect(u[UK.npKurang]).toBe(500)
    expect(u[UK.npTambah]).toBe(0)
    expect(u[UK.akKurang]).toBe(100)
    expect(u[UK.nbKurang]).toBe(400)
  })

  it('TAMBAH & KURANG dijumlah TERPISAH — bukan diturunkan dari nettonya', () => {
    // ⚠️ Inti lembar IV.G.3–G.7. Kelompok berisi +100 & −40 bernetto +60,
    // sementara lembarnya menuntut Tambah 100 & Kurang 40 di dua kolom berbeda.
    // Menurunkan dari netto mencetak "60 · 0" — angka yang tetap kelihatan wajar
    // dan tetap menjumlah benar ke nettonya.
    const items = [
      itemKoreksi(baris({ npSebelum: 0, akSebelum: 0, npSetelah: 100, akSetelah: 0 })),
      itemKoreksi(baris({ npSebelum: 40, akSebelum: 0, npSetelah: 0, akSetelah: 0, kode: '1.3.2.05.02.06.122' })),
    ]
    const g = susunRekap(items, 3, 2).find(b => b.seg === 3)!
    expect(g.ukuran[UK.npTambah]).toBe(100)
    expect(g.ukuran[UK.npKurang]).toBe(40)
    // Nettonya tetap benar & TIDAK bisa membedakan kedua keadaan itu.
    expect(g.ukuran[UK.npSetelah] - g.ukuran[UK.npSebelum]).toBe(60)
  })

  it('sisi yang TAK DIKETAHUI tak mengisi Tambah maupun Kurang', () => {
    // Baris koreksi sebelum 2026-09-07 tak membekukan akumulasi sebelum
    // koreksi. Selisihnya TAK DIKETAHUI, bukan nol — mengisinya 0 akan membuat
    // lembar menyatakan "akumulasi tidak berubah", yang belum tentu benar.
    const u = itemKoreksi(baris({ npSebelum: 1000, akSebelum: null, npSetelah: 1500, akSetelah: 300 })).ukuran!
    expect(u[UK.akTambah]).toBe(0)
    expect(u[UK.akKurang]).toBe(0)
    expect(u[UK.nbTambah]).toBe(0)
    expect(u[UK.nbKurang]).toBe(0)
    // Sisi yang DIKETAHUI tetap terisi.
    expect(u[UK.npTambah]).toBe(500)
  })

  it('`nilai` item = delta perolehan, sejalan dgn transaksi_bmd.nilai', () => {
    // Itu angka yang sama yang dipakai Rekonsiliasi & Laporan BMD untuk baris
    // koreksi; kalau menyimpang, dua laporan berhenti sepakat.
    expect(itemKoreksi(baris({ npSebelum: 1000, npSetelah: 1500, nilai: 500 })).nilai).toBe(500)
  })

  it('kunci ukuran BERBEDA semua — satu salah ketik menimpa ukuran lain', () => {
    // ⚠️ `Record<string, number>` menerima string apa pun: kunci kembar tak
    // menghasilkan error, salah satunya cuma tertimpa & kolomnya tercetak
    // angka milik kolom lain.
    const nilai = Object.values(UK)
    expect(new Set(nilai).size, `kunci kembar: ${nilai.join(', ')}`).toBe(nilai.length)
  })

  it('subtotal kelompok = Σ anggotanya di tiap kedalaman', () => {
    const items = [
      itemKoreksi(baris({ npSebelum: 1000, akSebelum: 200, npSetelah: 1500, akSetelah: 300 })),
      itemKoreksi(baris({ npSebelum: 500, akSebelum: 100, npSetelah: 400, akSetelah: 120, kode: '1.3.2.05.02.06.122' })),
      itemKoreksi(baris({ npSebelum: 900, akSebelum: 0, npSetelah: 900, akSetelah: 0, kode: '1.3.3.01.01.01.001' })),
    ]
    const total = (k: string) => items.reduce((s, i) => s + (i.ukuran![k] ?? 0), 0)
    for (const seg of [2, 3, 4, 5, 6]) {
      const teratas = susunRekap(items, seg, 2).filter(b => b.seg === 2)
      for (const k of Object.values(UK)) {
        expect(teratas.reduce((s, b) => s + b.ukuran[k], 0), `seg ${seg} · ${k}`).toBe(total(k))
      }
    }
  })

  it('lembar rinci & rekap terdalam menjumlah ke angka yang SAMA', () => {
    // Keenam lembar terbit dalam SATU berkas bertanda tangan; dua jalan menuju
    // angka yang sama yang menyimpang = satu berkas memuat dua kebenaran.
    const items = [
      itemKoreksi(baris({ npSebelum: 1000, akSebelum: 200, npSetelah: 1500, akSetelah: 300 })),
      itemKoreksi(baris({ npSebelum: 500, akSebelum: 100, npSetelah: 400, akSetelah: 120, kode: '1.3.2.05.02.06.122' })),
    ]
    const rinci = susunRinci(items, [28, 29, 30, 31]).filter(b => b.tipe === 'grup' && b.seg === 6)
    const rekap = susunRekap(items, 6, 3).filter(b => b.seg === 6)
    expect(rekap.length).toBe(rinci.length)
    for (let i = 0; i < rekap.length; i++) {
      expect(rekap[i].ukuran[UK.npSetelah]).toBe((rinci[i] as { ukuran: Record<string, number> }).ukuran[UK.npSetelah])
    }
  })
})

describe('penyaji', () => {
  const berkas = path.join(AKAR, 'components/pelaporan/LembarKoreksiPermendagri.tsx')

  it('berkasnya ada & tak hampa', () => {
    expect(fs.existsSync(berkas)).toBe(true)
    expect(fs.readFileSync(berkas, 'utf8').length).toBeGreaterThan(2000)
  })

  it('TIDAK bercabang per nomor lembar — pembedanya sifatnya', () => {
    // Begitu penyaji harus tahu sedang merender "IV.G.4", lembar ketujuh akan
    // menambah cabang lagi sampai berkas ini tak terbaca.
    const isi = fs.readFileSync(berkas, 'utf8')
    const kode = isi.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
    for (const id of URUT_LEMBAR) {
      expect(kode, `penyaji bercabang pada '${id}'`).not.toMatch(new RegExp(`===\\s*'${id}'`))
    }
    // Yang boleh dibaca cuma SIFATNYA.
    expect(kode).toContain('l.punyaBarang')
    expect(kode).toContain("l.bentuk === 'selisih'")
  })

  it('membaca ukuran lewat konstanta UK, bukan string yang diketik ulang', () => {
    // ⚠️ Kunci salah ketik tak menghasilkan error — `Record<string, number>`
    // menerima apa saja, kolomnya cuma tercetak Rp0 di lembar bertanda tangan.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain('UK.npSebelum')
    expect(isi).toContain('UK.nbKurang')
    // ⚠️ Yang diperiksa HANYA nama ukuran yang tak bertabrakan dengan kunci
    // KOLOM. Keenam kolom selisih (`np_tambah` … `nb_kurang`) kebetulan bernama
    // sama persis dengan ukurannya — dua ruang nama berbeda yang nilainya
    // berimpitan — jadi melarang string mentahnya di sini akan menuduh
    // `case 'nb_kurang':` yang justru kunci kolom yang sah.
    for (const mentah of ['np_sebelum', 'ak_sebelum', 'nb_sebelum', 'np_setelah', 'ak_setelah', 'nb_setelah']) {
      expect(isi, `nama ukuran '${mentah}' diketik mentah, bukan lewat UK`).not.toContain(`'${mentah}'`)
    }
  })

  it('kunci KOLOM selisih memang berimpitan dgn nama UKURAN-nya', () => {
    // ⚠️ Dicatat sbg uji, bukan dibiarkan jadi kebetulan yang tak terdokumentasi:
    // `KolomKoreksi` & `UK` adalah dua ruang nama berbeda, dan enam nilainya
    // sengaja dibuat sama supaya penyaji tak perlu peta ketiga. Kalau salah satu
    // sisi di-rename, uji ini yang menjelaskan kenapa yang lain ikut berubah.
    const kolomSelisih = kolomLembarKoreksi(TANGGA_KOREKSI.g4).filter(k => k.grup).map(k => k.key)
    expect(kolomSelisih.sort()).toEqual(
      [UK.npTambah, UK.npKurang, UK.akTambah, UK.akKurang, UK.nbTambah, UK.nbKurang].sort())
  })

  it('sel kode lembar tanpa baris barang sedalam kelompoknya, bukan 7', () => {
    // Memakai 7 di semuanya menyisakan sel kosong yang terbaca sbg segmen yang
    // belum diisi.
    expect(fs.readFileSync(berkas, 'utf8')).toContain('l.punyaBarang ? SEL_KODE_KOREKSI : l.seg')
  })
})

describe('periode posisi', () => {
  it('AKHIR TAHUN memakai S2, bukan S1', () => {
    expect(periodePosisiKoreksi('2026')).toBe('2026-S2')
  })
  it('satu semester dipakai apa adanya', () => {
    expect(periodePosisiKoreksi('2026-S1')).toBe('2026-S1')
  })
  it('periode kosong → kosong, bukan menebak tahun berjalan', () => {
    expect(periodePosisiKoreksi('')).toBe('')
  })
})

// ── Fixture ─────────────────────────────────────────────────────────────────
let seq = 0
function baris(o: {
  npSebelum?: number | null; akSebelum?: number | null
  npSetelah?: number | null; akSetelah?: number | null
  nilai?: number; kode?: string
}): BarisKoreksi {
  seq++
  return {
    id: seq, tanggal: '2026-07-05', periode: '2026-S2',
    nilai: o.nilai ?? 0, keterangan: null, aset_id: `a${seq}`,
    payload: null,
    header: { no_sk: 'SK-1', tanggal: '2026-06-30', jenis: 'nilai_perolehan', keterangan: null, skpd_id: 1 },
    aset: {
      kode: o.kode ?? '1.3.2.05.02.06.121', nama_barang: 'Laptop', uraian_barang: 'Uraian',
      nibar: '1'.repeat(45), satuan: 'Unit', jumlah: 1,
      keterangan: null, intra_ekstra: 'intra', skpd_id: 1,
    },
    npSebelum: o.npSebelum ?? null, akSebelum: o.akSebelum ?? null,
    npSetelah: o.npSetelah ?? null, akSetelah: o.akSetelah ?? null,
    tanpaSnapshot: o.akSebelum == null, tanpaPenyusutan: o.akSetelah == null,
  }
}
