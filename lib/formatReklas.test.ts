// Penjaga format lembar REKLASIFIKASI Permendagri 47/2021 — IV.F.2–F.6.
//
// Yang dijaga di sini semuanya kelas kegagalan SENYAP — tak satu pun
// menghasilkan error saat aplikasi dijalankan, dan semuanya baru ketahuan
// SESUDAH lembarnya dicetak & ditandatangani:
//
//   · kolom ditambah/dibuang tanpa menggeser penomoran   → lembar tak cocok
//     saat pemeriksa mencocokkannya kolom per kolom
//   · total lebar ≠ 100                                  → kolom melar & keluar
//     halaman (pelajaran lembar RKBMD & /cetak/perolehan)
//   · `segMin` rekap diseragamkan                        → baris kelompok yang
//     TIDAK ADA (atau hilang) di format aslinya, dan angkanya tetap menjumlah
//     dengan benar sehingga tak ada uji aritmetika yang berteriak
//   · rekap ≠ subtotal lembar rinci                      → satu berkas
//     bertanda tangan memuat dua angka berbeda
//   · blok "Reklasifikasi dari" berhenti bersegmen       → colSpan kepala tabel
//     tak lagi cocok dgn sel isinya & SELURUH kolom di kanannya bergeser
//
// SENGAJA TIDAK menguji JSX apa pun di berkas ini — TESTING.md §10 menolak
// snapshot JSX. Yang diuji: registry, aritmetika mesin subtotal, & sifat
// penyajinya yang bisa dinilai dari sumbernya.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_REKLAS, TANGGA_REKAP_REKLAS, SEL_KODE_REKLAS,
  lembarRekapReklas, akhiranLembarReklas, sisiReklas,
  kolomLembarReklas, lebarKodeReklas, judulRekapReklas,
  type IdReklas, type FormatReklas,
} from './formatReklas'
import {
  SEG_SUBTOTAL, susunRinci, susunRekap, sisaLebar, type ItemLaporan,
} from './formatPermendagri'
import { periodePosisiReklas } from './laporanReklas'
import { ALASAN_OPT, ALASAN_LABEL, LEDGER_JENIS, JENIS_REKLAS } from './reklas'

const AKAR = path.resolve(__dirname, '..')
const CABANG = Object.keys(FORMAT_REKLAS) as IdReklas[]
const tiapCabang = CABANG.map(id => [id, FORMAT_REKLAS[id]] as const)

describe('registry IV.F', () => {
  it('memuat TEPAT dua cabang yang dikenal', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa menjalankan
    // apa pun — lebih berbahaya daripada tak punya test.
    expect([...CABANG].sort()).toEqual(['penambahan', 'pengurangan'])
  })

  it('kode lembar rinci = awalan + akhiranRinci', () => {
    // Dua tempat yang menyebut nomor lembar yang sama; kalau menyimpang, kepala
    // lembar mencetak "Format IV.F.2" di atas tabel yang di-URL-kan sbg 12.
    for (const [id, f] of tiapCabang) {
      expect(f.kode, id).toBe(`${f.awalan}.${f.akhiranRinci}`)
    }
  })

  it('nomor lembar TIDAK bertabrakan antar cabang', () => {
    // ⚠️ Keduanya ber-`awalan` IV.F. Kalau akhirannya beririsan, dua lembar yang
    // isinya BERLAWANAN akan sama-sama mengaku "Format IV.F.5" — dan karena
    // keduanya membaca ledger yang sama, isinya tetap kelihatan masuk akal.
    const semua = CABANG.flatMap(id => akhiranLembarReklas(FORMAT_REKLAS[id]))
    expect(new Set(semua).size, `nomor kembar: ${semua.join(', ')}`).toBe(semua.length)
    expect(akhiranLembarReklas(FORMAT_REKLAS.penambahan)).toEqual([2, 3, 4, 5, 6])
    expect(akhiranLembarReklas(FORMAT_REKLAS.pengurangan)).toEqual([12, 13, 14, 15, 16])
  })

  it('kedua cabang berkolom IDENTIK — pembedanya cuma judul & judul blok lawan', () => {
    // ⚠️ Inilah yang menjaga `kolomRinciReklas()` tetap satu pabrik. Kalau suatu
    // saat seseorang menyalin daftarnya per cabang lalu menyunting salah
    // satunya, uji ini yang berteriak — lembar yang beda susunan dari
    // kembarannya tak menghasilkan satu pun error.
    const a = FORMAT_REKLAS.penambahan
    const b = FORMAT_REKLAS.pengurangan
    expect(kolomLembarReklas(b)).toEqual(kolomLembarReklas(a))
    expect(b.subtotal).toEqual(a.subtotal)
    expect(b.kaki).toEqual(a.kaki)
    expect(b.judul).not.toBe(a.judul)
    expect(b.grupLawan).not.toBe(a.grupLawan)
  })

  it('kedua cabang TIDAK berbagi objek kolom yang sama', () => {
    // Daftar yang dipakai bersama gampang tersunting di tempat oleh pemakai yang
    // mengira ia salinannya sendiri — dan efeknya menular ke cabang seberang.
    expect(FORMAT_REKLAS.penambahan.kolom).not.toBe(FORMAT_REKLAS.pengurangan.kolom)
  })

  it.each(tiapCabang)('%s — kode & awalan berbentuk nomor lampiran', (id, f) => {
    expect(f.kode, `${id}.kode`).toMatch(/^IV\.[A-Z](\.\d+)+$/)
    expect(f.kode.startsWith(f.awalan + '.'), `${id}: kode harus di bawah awalan`).toBe(true)
  })

  it('ARAH membentuk identitas lembar — tak boleh ada dua cabang searah', () => {
    // ⚠️ Uji terpenting keluarga ini. Penambahan & pengurangan membaca baris
    // ledger yang PERSIS SAMA; yang membedakan cuma sisi mana yang dijadikan
    // kunci pengelompokan. Dua cabang ber-`arah` sama akan memuat baris identik
    // & sama-sama mengaku benar — tanpa satu pun error.
    const arah = CABANG.map(id => FORMAT_REKLAS[id].arah)
    expect(new Set(arah).size, `arah kembar: ${arah.join(', ')}`).toBe(arah.length)
    expect(FORMAT_REKLAS.penambahan.arah).toBe('penambahan')
    expect(FORMAT_REKLAS.pengurangan.arah).toBe('pengurangan')
  })

  it('judul lembar menyatakan arahnya', () => {
    // Kalau judul & `arah` menyimpang, lembarnya berkop "PENAMBAHAN" tapi
    // berisi sisi pengurangannya. Angkanya tetap sah-sah saja bentuknya.
    for (const id of CABANG) {
      const f = FORMAT_REKLAS[id]
      expect(f.judul, `${id}: judul`).toContain(f.arah === 'penambahan' ? 'PENAMBAHAN' : 'PENGURANGAN')
      expect(f.judul, `${id}: judul wajib menyebut REKLASIFIKASI`).toContain('REKLASIFIKASI')
      // Isian "BERUPA…(1)" diisi pemanggil dari kelompok neraca yang benar-benar
      // ada datanya — jadi judulnya berhenti tepat di situ.
      expect(f.judul.endsWith('BERUPA'), `${id}: judul harus berakhir di "BERUPA"`).toBe(true)
    }
  })

  it('judul blok lawan sejalan dgn arahnya — "dari" vs "ke"', () => {
    // Blok itu memuat identitas barang di sisi SEBERANG. Untuk lembar
    // penambahan, seberangnya adalah asalnya ("Reklasifikasi dari"); untuk
    // pengurangan, tujuannya ("Reklasifikasi ke"). Tertukar = lembar menunjuk
    // arah yang salah dan tetap terisi penuh — tanpa satu pun error.
    expect(FORMAT_REKLAS.penambahan.grupLawan).toBe('Reklasifikasi dari')
    expect(FORMAT_REKLAS.pengurangan.grupLawan).toBe('Reklasifikasi ke')
  })
})

describe('sisiReklas — pemetaan sisi (aturan inti keluarga IV.F)', () => {
  const P = {
    kodeLama: '1.3.6.01.01.01.001', kodeBaru: '1.3.3.01.01.01.001',
    namaLama: 'KDP Rehab Gedung', namaBaru: 'Gedung Kantor', namaAset: 'Nama Register',
  }

  it('penambahan: dikelompokkan menurut kode TUJUAN, lawan = kode ASAL', () => {
    // ⚠️ Kalau tertukar, lembar PENAMBAHAN mengelompokkan barang menurut
    // golongan ASALNYA & blok "Reklasifikasi dari"-nya menunjuk balik ke
    // tujuan. Karena kedua lembar membaca baris yang SAMA, hasilnya tetap
    // terisi penuh & footing-nya tetap benar — tak ada yang berteriak.
    expect(sisiReklas('penambahan', P)).toEqual({
      kodeUtama: P.kodeBaru, kodeLawan: P.kodeLama, namaSpek: P.namaBaru,
    })
  })

  it('pengurangan: KEBALIKANNYA — kode ASAL yang mengelompokkan', () => {
    expect(sisiReklas('pengurangan', P)).toEqual({
      kodeUtama: P.kodeLama, kodeLawan: P.kodeBaru, namaSpek: P.namaLama,
    })
  })

  it('kedua sisi saling BERCERMIN — kodeUtama satu = kodeLawan yang lain', () => {
    const a = sisiReklas('penambahan', P)
    const b = sisiReklas('pengurangan', P)
    expect(a.kodeUtama).toBe(b.kodeLawan)
    expect(a.kodeLawan).toBe(b.kodeUtama)
  })

  it('reklas komptabel (kode tak bergeser) → utama = lawan, bukan kosong', () => {
    // `reklas_komptabel` tak punya kode_lama/kode_baru di payload; pemuat
    // mengisinya dgn kode SAAT ITU untuk keduanya. Yang menjelaskan
    // peristiwanya kolom "Penyebab Reklasifikasi".
    const sama = { kodeLama: '1.3.2.05.02.06.121', kodeBaru: '1.3.2.05.02.06.121' }
    for (const arah of ['penambahan', 'pengurangan'] as const) {
      const r = sisiReklas(arah, sama)
      expect(r.kodeUtama, arah).toBe(sama.kodeLama)
      expect(r.kodeLawan, arah).toBe(sama.kodeLama)
    }
  })

  it('nama barang jatuh ke nama register kalau reklasnya tak menggantinya', () => {
    // Kasus TERBANYAK: reklas cuma memindah kodefikasi, namanya tak disentuh.
    const r = sisiReklas('penambahan', {
      kodeLama: P.kodeLama, kodeBaru: P.kodeBaru, namaAset: 'Nama Register',
    })
    expect(r.namaSpek).toBe('Nama Register')
  })

  it('semua kosong → string kosong, BUKAN undefined/null', () => {
    // Sel lembar yang berisi "undefined" jauh lebih buruk daripada sel kosong.
    expect(sisiReklas('penambahan', { kodeLama: '', kodeBaru: '' }).namaSpek).toBe('')
  })
})

describe('kolom lembar rinci', () => {
  it('kunci kolom unik', () => {
    for (const [id, f] of tiapCabang) {
      const k = kolomLembarReklas(f).map(x => x.key)
      expect(new Set(k).size, `${id}: kunci kembar`).toBe(k.length)
    }
  })

  it('penomoran berurut & TEPAT melompati satu nomor untuk blok Kode Barang', () => {
    // Blok "Kode Barang" (7 sel) punya nomornya sendiri di lembar asli, jadi
    // ada tepat SATU lompatan antara kolom paling kiri & Nama Barang.
    for (const [id, f] of tiapCabang) {
      const n = kolomLembarReklas(f).map(x => x.nomor)
      expect(n[0] + 2, `${id}: Nama Barang harus melompat satu nomor (blok kode)`).toBe(n[1])
      // Mulai dari indeks 2: lompatan satu-satunya sudah diperiksa di atas.
      for (let i = 2; i < n.length; i++) {
        expect(n[i], `${id}: nomor kolom ke-${i} tidak berurut`).toBe(n[i - 1] + 1)
      }
    }
  })

  it('NIBAR berdiri DI LUAR blok kode & jadi kolom paling kiri', () => {
    for (const [id, f] of tiapCabang) expect(f.kolomKiri.key, id).toBe('nibar')
  })

  it('Nama Barang duduk DI DALAM blok Penggolongan, sesudah sel kode', () => {
    for (const [id, f] of tiapCabang) expect(f.kolomNama.key, id).toBe('nama')
  })

  it('SATU kolom nilai — TAK ADA "Harga Satuan"/"Jumlah Total" milik IV.B/IV.C', () => {
    // ⚠️ Keluarga IV.F cuma punya "Nilai Perolehan (Rp)". Menambah dua kolom itu
    // "biar seragam dgn lembar perpindahan" membuat lembarnya tak cocok waktu
    // pemeriksa mencocokkan kolom per kolom.
    for (const [id, f] of tiapCabang) {
      const k = kolomLembarReklas(f).map(x => x.key)
      expect(k, `${id}`).toContain('nilai_perolehan')
      expect(k, `${id}: harga_satuan bukan kolom IV.F`).not.toContain('harga_satuan')
      expect(k, `${id}: jumlah_total bukan kolom IV.F`).not.toContain('jumlah_total')
    }
  })

  it('punya Akumulasi Penyusutan, Nilai Buku, Penyebab, & blok Dokumen Sumber', () => {
    for (const [id, f] of tiapCabang) {
      const k = kolomLembarReklas(f).map(x => x.key)
      for (const wajib of ['akumulasi', 'nilai_buku', 'penyebab',
        'lawan_kode', 'lawan_nama', 'dok_nama', 'dok_nomor', 'dok_tanggal', 'keterangan']) {
        expect(k, `${id}: kolom '${wajib}' hilang`).toContain(wajib)
      }
    }
  })

  it('penanda subtotal & kaki MENYAMBUNG tepat sesudah kolom terakhir', () => {
    // Kolom yang ditambah/dibuang tanpa menggeser penomoran adalah kesalahan
    // yang TIDAK bersuara — ini yang menangkapnya.
    for (const [id, f] of tiapCabang) {
      const n = kolomLembarReklas(f).map(x => x.nomor)
      const akhir = n[n.length - 1]
      expect(f.subtotal[0], `${id}: subtotal pertama`).toBe(akhir + 1)
      expect(f.kaki.tanggal, `${id}: kaki.tanggal`).toBe(f.subtotal[3] + 1)
      expect(f.kaki.jabatan, `${id}`).toBe(f.kaki.tanggal + 1)
      expect(f.kaki.nama, `${id}`).toBe(f.kaki.jabatan + 1)
    }
  })

  it('subtotal SEJAJAR dengan SEG_SUBTOTAL [6,5,4,3]', () => {
    expect(SEG_SUBTOTAL.length).toBe(4)
    for (const [id, f] of tiapCabang) {
      expect(f.subtotal.length, id).toBe(SEG_SUBTOTAL.length)
      for (let i = 1; i < f.subtotal.length; i++) {
        expect(f.subtotal[i], `${id}: subtotal harus menaik`).toBe(f.subtotal[i - 1] + 1)
      }
    }
  })

  it('kolom bergrup berdampingan — grup tak boleh terpotong kolom lain', () => {
    // Kepala tabel merakit grup dgn menyusuri kolom berurutan; grup yang
    // terpotong menghasilkan DUA kepala bernama sama & colSpan yang salah.
    for (const [id, f] of tiapCabang) {
      const urut = f.kolom.map(k => k.grup ?? '')
      const terlihat = new Set<string>()
      let lalu = ''
      for (const g of urut) {
        if (g && g !== lalu) {
          expect(terlihat.has(g), `${id}: grup '${g}' terpotong`).toBe(false)
          terlihat.add(g)
        }
        lalu = g
      }
    }
  })
})

describe('lebar kolom', () => {
  it('total lebar kolom + blok kode = 100 PERSIS', () => {
    // Inilah yang membuat lembarnya "fit to window" di `table-fixed`. Lebih
    // dari 100 → kolom kanan keluar halaman; kurang → sisa ruang menganggur.
    for (const [id, f] of tiapCabang) {
      const jumlah = kolomLembarReklas(f).reduce((s, k) => s + k.lebar, 0)
      expect(Number((jumlah + lebarKodeReklas(f)).toFixed(6)), `${id}`).toBe(100)
      expect(lebarKodeReklas(f), `${id}: blok kode kehabisan ruang`).toBeGreaterThan(0)
      expect(sisaLebar(kolomLembarReklas(f)), `${id}`).toBe(lebarKodeReklas(f))
    }
  })

  it('KEDUA blok kode cukup lebar untuk 7 sel segmen', () => {
    // ⚠️ Keluarga ini punya DUA blok bersegmen (kolom tujuan & "Reklasifikasi
    // dari"), dan keduanya sama-sama dibagi 7. Blok yang terlalu sempit membuat
    // segmen 3 karakter ("121") membungkus jadi tiga baris.
    for (const [id, f] of tiapCabang) {
      const lawan = f.kolom.find(k => k.key === 'lawan_kode')!
      for (const [nama, lebar] of [['kode tujuan', lebarKodeReklas(f)], ['lawan_kode', lawan.lebar]] as const) {
        expect(lebar / SEL_KODE_REKLAS, `${id}: sel ${nama} terlalu sempit`).toBeGreaterThan(1.4)
      }
    }
  })

  it('NIBAR tak boleh dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    // Potongan PERTAMA 26 digit wajib muat SEBARIS; kalau tidak, ia membungkus
    // sendiri lebih dulu & `pecahNibar()` menghasilkan tiga baris.
    for (const [id, f] of tiapCabang) {
      expect(f.kolomKiri.lebar, `${id}: kolom NIBAR`).toBeGreaterThanOrEqual(7.5)
    }
  })

  it('tiap kolom punya lebar positif', () => {
    for (const [id, f] of tiapCabang) {
      for (const k of kolomLembarReklas(f)) {
        expect(k.lebar, `${id}.${k.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('lembar rekap berjudul REKAPITULASI, lembar rinci LAPORAN', () => {
    for (const [id, f] of tiapCabang) {
      expect(f.judul.startsWith('LAPORAN '), `${id}`).toBe(true)
      expect(judulRekapReklas(f).startsWith('REKAPITULASI '), `${id}`).toBe(true)
      // Sisanya WAJIB sama persis — kalau tidak, dua lembar dalam satu berkas
      // mengaku memuat hal yang berbeda.
      expect(judulRekapReklas(f).replace(/^REKAPITULASI /, ''))
        .toBe(f.judul.replace(/^LAPORAN /, ''))
    }
  })
})

describe('tangga rekap IV.F.3–F.6 & IV.F.13–F.16', () => {
  it('empat lembar, makin dangkal, dan nomornya dari cabangnya', () => {
    expect(TANGGA_REKAP_REKLAS.map(t => t.seg)).toEqual([6, 5, 4, 3])
    expect(lembarRekapReklas(FORMAT_REKLAS.penambahan).map(t => t.akhiran)).toEqual([3, 4, 5, 6])
    expect(lembarRekapReklas(FORMAT_REKLAS.pengurangan).map(t => t.akhiran)).toEqual([13, 14, 15, 16])
  })

  it('bentuk tangganya SATU, cuma nomornya yang beda antar cabang', () => {
    // ⚠️ Dua daftar `segMin` yang harus dijaga sepakat pasti menyimpang, dan
    // yang menyimpang tak menghasilkan satu pun error — cuma dua lembar cermin
    // yang bentuk hierarkinya berbeda.
    const buang = (t: { akhiran: number }) => { const { akhiran, ...sisa } = t; void akhiran; return sisa }
    expect(lembarRekapReklas(FORMAT_REKLAS.pengurangan).map(buang))
      .toEqual(lembarRekapReklas(FORMAT_REKLAS.penambahan).map(buang))
  })

  it('segMin: 3 untuk tiga lembar terdalam, 2 untuk yang terdangkal', () => {
    // ⚠️ Ini MENGIKUTI GAMBAR FORMATNYA, bukan kelalaian — lihat catatan di
    // `TANGGA_REKAP_REKLAS`. Menyeragamkannya (mis. jadi 3 semua seperti
    // keluarga perpindahan, atau 2 semua seperti IV.A) TIDAK mengubah satu pun
    // angka, cuma menambah/menghilangkan baris kelompok teratas — jadi tak ada
    // uji aritmetika yang akan menangkapnya. Uji inilah satu-satunya penjaganya.
    expect(TANGGA_REKAP_REKLAS.map(t => t.segMin)).toEqual([3, 3, 3, 2])
    // Lembar terdangkal WAJIB ber-segMin < seg-nya: kalau sama, ia jadi daftar
    // datar tanpa satu pun baris kelompok — dan itu justru alasan `2`-nya ada.
    const dangkal = TANGGA_REKAP_REKLAS[TANGGA_REKAP_REKLAS.length - 1]
    expect(dangkal.segMin).toBeLessThan(dangkal.seg)
    for (const t of TANGGA_REKAP_REKLAS) {
      expect(t.segMin, `seg ${t.seg}: segMin melampaui kedalamannya`).toBeLessThanOrEqual(t.seg)
    }
  })

  it('rekap TERDALAM = subtotal lembar rinci, angka per angka', () => {
    // Lembar rinci & keempat rekapnya terbit dalam SATU berkas bertanda tangan.
    // Dua jalan menuju angka yang sama yang menyimpang = satu berkas memuat dua
    // kebenaran, tanpa satu pun yang berteriak.
    const items = contoh()
    const rinci = susunRinci(items, FORMAT_REKLAS.penambahan.subtotal)
      .filter(b => b.tipe === 'grup' && b.seg === 6)
    const rekap = susunRekap(items, 6, 3).filter(b => b.seg === 6)
    expect(rekap.length).toBe(rinci.length)
    for (let i = 0; i < rekap.length; i++) {
      expect(rekap[i].kode).toBe((rinci[i] as { kode: string }).kode)
      expect(rekap[i].nilai).toBe((rinci[i] as { nilai: number }).nilai)
    }
  })

  it('akumulasi & nilai buku IKUT dijumlah di tiap kedalaman', () => {
    const items = contoh()
    for (const t of TANGGA_REKAP_REKLAS) {
      const baris = susunRekap(items, t.seg, t.segMin)
      const teratas = baris.filter(b => b.seg === t.segMin)
      const totalAkum = teratas.reduce((s, b) => s + b.akumulasi, 0)
      const totalBuku = teratas.reduce((s, b) => s + b.nilaiBuku, 0)
      expect(totalAkum, `seg ${t.seg}: akumulasi`).toBe(
        items.reduce((s, i) => s + (i.akumulasi ?? 0), 0))
      expect(totalBuku, `seg ${t.seg}: nilai buku`).toBe(
        items.reduce((s, i) => s + (i.nilaiBuku ?? 0), 0))
    }
  })

  it('segMin 2 memancarkan baris kelompok neraca, segMin 3 tidak', () => {
    const items = contoh()
    expect(susunRekap(items, 3, 2).some(b => b.seg === 2),
      'segMin 2 harus punya baris `1.3`').toBe(true)
    expect(susunRekap(items, 6, 3).some(b => b.seg === 2),
      'segMin 3 TIDAK boleh punya baris `1.3`').toBe(false)
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    for (const t of TANGGA_REKAP_REKLAS) {
      expect(susunRekap([], t.seg, t.segMin), `seg ${t.seg}`).toEqual([])
    }
  })
})

describe('penyaji', () => {
  const berkas = path.join(AKAR, 'components/pelaporan/LembarReklasPermendagri.tsx')

  it('berkas penyajinya ada & tak hampa', () => {
    expect(fs.existsSync(berkas)).toBe(true)
    expect(fs.readFileSync(berkas, 'utf8').length).toBeGreaterThan(2000)
  })

  it('memakai segMin dari TANGGA_REKAP_REKLAS, bukan bawaan susunRekap', () => {
    // ⚠️ `susunRekap(items, seg)` tanpa argumen ketiga memakai `SEG_MIN_REKAP`
    // (2) milik cabang IV.A. Untuk IV.F.3/F.4 itu MENAMBAHKAN baris yang tak ada
    // di formatnya — dan angkanya tetap menjumlah dengan benar, jadi tak satu
    // pun uji aritmetika menangkapnya.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain('susunRekap(items, seg, segMin)')
    expect(isi, 'segMin & nomor lembar wajib datang dari `lembarRekapReklas(f)`')
      .toContain('lembarRekapReklas(f)')
  })

  it('blok "Reklasifikasi dari" dirender BERSEGMEN, colSpan-nya dihitung', () => {
    // ⚠️ `lawan_kode` = SATU kolom di registry tapi TUJUH sel di tabel. Kepala
    // tabel yang memakai `g.kolom.length` apa adanya akan ber-colSpan 2 di atas
    // 8 sel → SELURUH kolom di kanannya bergeser, tanpa satu pun error.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain("k.key === 'lawan_kode' ? SEL_KODE_REKLAS : 1")
  })

  it('lembar rekap TIDAK memakai kolom "Jumlah Barang" milik IV.B/IV.C/IV.D', () => {
    // Rekap keluarga IV.F cuma LIMA kolom. Menambahkan "Jumlah Barang" tak
    // menghasilkan error apa pun — cuma lembar yang tak cocok saat diperiksa.
    const isi = fs.readFileSync(berkas, 'utf8')
    const rekap = isi.slice(isi.indexOf('function LembarRekap'))
    expect(rekap).not.toContain('Jumlah Barang')
  })

  it('TIDAK bercabang per format — pembedanya seluruhnya data', () => {
    // Begitu penyaji harus tahu sedang merender sisi yang mana, cabang kedua
    // akan menambah cabang lagi sampai berkas ini tak terbaca.
    const isi = fs.readFileSync(berkas, 'utf8')
    const kode = isi.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
    expect(kode).not.toMatch(/===\s*'penambahan'/)
    expect(kode).not.toMatch(/===\s*'pengurangan'/)
    expect(kode).not.toMatch(/f\.(kode|arah)\s*===/)
  })
})

describe('alasan reklasifikasi (kolom "Penyebab Reklasifikasi")', () => {
  it('tiap alasan punya label & jenis ledger', () => {
    expect(ALASAN_OPT.length).toBeGreaterThan(0)
    for (const a of ALASAN_OPT) {
      expect(ALASAN_LABEL[a.value], `label ${a.value}`).toBe(a.label)
      expect(LEDGER_JENIS[a.value], `ledger ${a.value}`).toBeTruthy()
    }
  })

  it('setiap jenis ledger yang dihasilkan alasan ADA di JENIS_REKLAS', () => {
    // ⚠️ Alasan baru yang menulis jenis ledger di luar `JENIS_REKLAS` akan
    // TIDAK PERNAH muncul di menu Laporan Reklasifikasi maupun lembar IV.F —
    // tanpa satu pun error, cuma barang yang hilang dari laporan.
    for (const a of ALASAN_OPT) {
      expect(JENIS_REKLAS as readonly string[], `alasan '${a.value}'`).toContain(LEDGER_JENIS[a.value])
    }
  })

  it('label alasan tak boleh kosong — ia TERCETAK di lembar bertanda tangan', () => {
    for (const a of ALASAN_OPT) expect(a.label.trim(), a.value).not.toBe('')
  })
})

describe('periode posisi penyusutan', () => {
  it('AKHIR TAHUN memakai S2, bukan S1', () => {
    // Kolom Akumulasi & Nilai Buku itu POSISI (saldo akhir periode), sedangkan
    // daftar barangnya ARUS. Memakai S1 mencetak posisi pertengahan tahun di
    // lembar berjudul AKHIR TAHUN — angka yang tampak sah & tak akan ditolak.
    expect(periodePosisiReklas('2026')).toBe('2026-S2')
  })

  it('satu semester dipakai apa adanya', () => {
    expect(periodePosisiReklas('2026-S1')).toBe('2026-S1')
    expect(periodePosisiReklas('2026-S2')).toBe('2026-S2')
  })

  it('periode kosong → kosong, bukan menebak tahun berjalan', () => {
    expect(periodePosisiReklas('')).toBe('')
  })
})

// ── Contoh yang cukup untuk menguji hierarki 2–6 segmen ─────────────────────
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
