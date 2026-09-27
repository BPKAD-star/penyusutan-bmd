// Penjaga format lembar REKLASIFIKASI Permendagri 47/2021 — keluarga IV.F.
//
// Yang dijaga di sini semuanya kelas kegagalan SENYAP — tak satu pun
// menghasilkan error saat aplikasi dijalankan, dan semuanya baru ketahuan
// SESUDAH lembarnya dicetak & ditandatangani:
//
//   · kolom ditambah/dibuang tanpa menggeser urutan       → lembar tak cocok
//     dgn contoh yang disetujui user, kolom per kolom
//   · total lebar ≠ 100                                   → kolom melar &
//     keluar halaman (pelajaran lembar RKBMD & /cetak/perolehan)
//   · `segMin` rekap diseragamkan                         → baris kelompok yang
//     TIDAK ADA (atau hilang) di format aslinya, dan angkanya tetap menjumlah
//     dengan benar sehingga tak ada uji aritmetika yang berteriak
//   · "Total <jenis>" ≠ subtotal lembar rekap              → satu berkas
//     bertanda tangan memuat dua angka berbeda
//   · sisiReklas() tertukar                                → lembar penambahan
//     mengelompokkan barang menurut golongan ASALNYA, tanpa satu pun error
//
// SENGAJA TIDAK menguji JSX apa pun di berkas ini — TESTING.md §10 menolak
// snapshot JSX; struktur tabelnya diuji tersendiri di tests/lembarReklas.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_REKLAS, TANGGA_REKAP_REKLAS, KOLOM_RINCI_REKLAS, KOLOM_DIJUMLAH_REKLAS,
  lembarRekapReklas, akhiranLembarReklas, sisiReklas, judulRekapReklas,
  type IdReklas,
} from './formatReklas'
import { susunRinci, susunRekap, type ItemLaporan } from './formatPermendagri'
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

  it('kolom lawan sejalan dgn arahnya — "Awal" vs "Tujuan"', () => {
    // Kolom itu memuat identitas barang di sisi SEBERANG. Untuk lembar
    // penambahan, seberangnya adalah asalnya ("...Awal"); untuk pengurangan,
    // tujuannya ("...Tujuan"). Tertukar = lembar menunjuk arah yang salah dan
    // tetap terisi penuh — tanpa satu pun error.
    expect(FORMAT_REKLAS.penambahan.kolomLawan).toBe('Kode Barang - Uraian Barang Awal')
    expect(FORMAT_REKLAS.pengurangan.kolomLawan).toBe('Kode Barang - Uraian Barang Tujuan')
  })

  it('kalimat baris kosong menyatakan arahnya', () => {
    expect(FORMAT_REKLAS.penambahan.kosong).toContain('penambahan')
    expect(FORMAT_REKLAS.pengurangan.kosong).toContain('pengurangan')
  })
})

describe('sisiReklas — pemetaan sisi (aturan inti keluarga IV.F)', () => {
  const P = {
    kodeLama: '1.3.6.01.01.01.001', kodeBaru: '1.3.3.01.01.01.001',
    namaLama: 'KDP Rehab Gedung', namaBaru: 'Gedung Kantor', namaAset: 'Nama Register',
  }

  it('penambahan: dikelompokkan menurut kode TUJUAN, lawan = kode ASAL', () => {
    // ⚠️ Kalau tertukar, lembar PENAMBAHAN mengelompokkan barang menurut
    // golongan ASALNYA & kolom lawannya menunjuk balik ke tujuan. Karena kedua
    // lembar membaca baris yang SAMA, hasilnya tetap terisi penuh & footing-nya
    // tetap benar — tak ada yang berteriak.
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

// ── Lembar RINCI: susunan kolom keputusan user (2026-09-27/28) ──────────────
describe('lembar rinci — satu susunan kolom untuk kedua cabang', () => {
  const k = KOLOM_RINCI_REKLAS

  it('urutan kolom PERSIS seperti yang ditetapkan user', () => {
    // Urutan kolom lembar bertanda tangan itu aturan integritas: pemeriksa
    // mencocokkannya kolom per kolom dgn contoh yang disetujui.
    expect(k.map(x => x.key)).toEqual([
      'nibar', 'kode', 'nama', 'jumlah', 'harga_satuan', 'nilai_perolehan',
      'akumulasi', 'nilai_buku', 'lawan', 'penyebab', 'dok_nomor', 'dok_tanggal',
      'keterangan',
    ])
  })

  it('total lebar 100 PERSIS — "fit to window" di table-fixed', () => {
    const total = k.reduce((a, x) => a + x.lebar, 0)
    expect(Math.round(total * 100) / 100).toBe(100)
    for (const x of k) expect(x.lebar, x.key).toBeGreaterThan(0)
  })

  it('NIBAR dapat jatah TERBESAR — 45 digit dipenggal dua baris, muat lega', () => {
    // ⚠️ Permintaan user 2026-09-27 sesudah ronde sebelumnya (huruf tabel
    // 7,5px→10px) lupa menaikkan sel NIBAR-nya sendiri. Ambangnya dinaikkan
    // dari 8 (Perpindahan) ke 10, sejalan dgn kolom yang memang dianggarkan
    // 12% di sini.
    expect(k.find(x => x.key === 'nibar')!.lebar).toBeGreaterThanOrEqual(10)
  })

  it('kolom uang yang dijumlah BERURUTAN & Harga Satuan TIDAK ikut dijumlah', () => {
    // Baris total merender label ber-colSpan lalu tiga angka beruntun; kalau
    // kolomnya tak bersebelahan, angkanya jatuh di kolom yang salah.
    const idx = KOLOM_DIJUMLAH_REKLAS.map(key => k.findIndex(x => x.key === key))
    expect(idx.every(i => i >= 0)).toBe(true)
    expect(idx).toEqual(idx.map((_, j) => idx[0] + j))
    expect(KOLOM_DIJUMLAH_REKLAS).not.toContain('harga_satuan')
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

  it('rekap TERDALAM sama persis dgn susunRinci yang lama, angka per angka', () => {
    // Mesin subtotal (`susunRekap`) dipakai bersama SELURUH cabang Permendagri —
    // dua jalan menuju angka yang sama yang menyimpang berarti satu berkas
    // memuat dua kebenaran, tanpa satu pun yang berteriak.
    const items = contoh()
    const rinci = susunRinci(items, [24, 25, 26, 27] as const)
      .filter(b => b.tipe === 'grup' && b.seg === 6)
    const rekap = susunRekap(items, 6, 3).filter(b => b.seg === 6)
    expect(rekap.length).toBe(rinci.length)
    for (let i = 0; i < rekap.length; i++) {
      expect(rekap[i].kode).toBe((rinci[i] as { kode: string }).kode)
      expect(rekap[i].nilai).toBe((rinci[i] as { nilai: number }).nilai)
    }
  })

  it('"Total <jenis>" lembar rinci = rekap 3 segmen — satu mesin, satu angka', () => {
    // Lembar rinci baru mengambil totalnya dari `susunRekap(items, 3, 3)` yang
    // SAMA dgn rekap .6/.16 (menurut jenis).
    const items = contoh()
    const jenis = susunRekap(items, 3, 3).filter(g => g.seg === 3)
    expect(jenis.reduce((a, g) => a + g.nilai, 0)).toBe(items.reduce((a, x) => a + x.nilai, 0))
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

  it('memakai segMin dari TANGGA_REKAP_REKLAS (via lembarRekapReklas), bukan bawaan susunRekap', () => {
    // ⚠️ `susunRekap(items, seg)` tanpa argumen ketiga memakai `SEG_MIN_REKAP`
    // (2) milik cabang IV.A. Untuk IV.F.3/F.4 itu MENAMBAHKAN baris yang tak ada
    // di formatnya — dan angkanya tetap menjumlah dengan benar, jadi tak satu
    // pun uji aritmetika menangkapnya.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain('susunRekap(items, seg, segMin)')
    expect(isi, 'segMin & nomor lembar wajib datang dari `lembarRekapReklas(f)`')
      .toContain('lembarRekapReklas(f)')
  })

  it('grup jenis aset lembar rinci mengambil angka dari susunRekap, bukan menjumlah sendiri', () => {
    // Baris "Total <jenis>" & "TOTAL" WAJIB dari mesin subtotal bersama — kalau
    // penyaji menjumlah manual, ia bisa menyimpang dari rekap .6/.16 tanpa error.
    const isi = fs.readFileSync(berkas, 'utf8')
    expect(isi).toContain('susunRekap(items, SEG_JENIS_RINCI, SEG_JENIS_RINCI)')
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
