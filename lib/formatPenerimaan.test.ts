// Penjaga format lembar PENERIMAAN Permendagri 47/2021 —
// IV.B.1.2–1.6 (Penggunaan) & IV.C.2–C.6 (Internal Pengguna Barang).
//
// Yang dijaga di sini semuanya kelas kegagalan SENYAP — tak satu pun
// menghasilkan error saat aplikasi dijalankan, dan semuanya baru ketahuan
// SESUDAH lembarnya dicetak & ditandatangani:
//
//   · kolom ditambah/dibuang tanpa menggeser penomoran   → lembar tak cocok
//     saat pemeriksa mencocokkannya kolom per kolom
//   · total lebar ≠ 100                                  → kolom melar & keluar
//     halaman (pelajaran lembar RKBMD & /cetak/perolehan)
//   · rekap memancarkan baris 2 segmen                   → baris yang TIDAK ADA
//     di format aslinya, dan angkanya tetap benar jadi tak ada yang berteriak
//   · rekap ≠ subtotal lembar rinci                      → satu berkas
//     bertanda tangan memuat dua angka berbeda
//   · dua cabang saling menular kolom                    → IV.C mencetak kolom
//     Lokasi/SK Penghapusan yang tak ada di formatnya
//
// ⚠️ SEBAGIAN BESAR uji di sini `it.each` ATAS KEDUA CABANG. Itu disengaja:
// keduanya dilayani satu registry & satu penyaji, jadi uji yang cuma menyentuh
// salah satunya akan meloloskan perubahan yang merusak yang lain.
//
// SENGAJA TIDAK menguji JSX apa pun di berkas ini — TESTING.md §10 menolak
// snapshot JSX; struktur tabelnya diuji tersendiri di tests/lembarPenerimaan.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_PENERIMAAN, SEG_MIN_REKAP_PENERIMAAN, SEL_KODE_PENERIMAAN,
  kolomLembar, lebarKodePenerimaan, judulRekapPenerimaan,
  type IdPenerimaan, type FormatPenerimaan,
} from './formatPenerimaan'
import {
  SEG_SUBTOTAL, TANGGA_REKAP, susunRinci, susunRekap, sisaLebar,
  type ItemLaporan,
} from './formatPermendagri'
import { periodePosisi } from './laporanPenerimaan'

const CABANG = Object.keys(FORMAT_PENERIMAAN) as IdPenerimaan[]
const tiapCabang = CABANG.map(id => [id, FORMAT_PENERIMAAN[id]] as const)

describe('registry kedua cabang', () => {
  it('memuat TEPAT dua cabang yang dikenal', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa menjalankan
    // apa pun — lebih berbahaya daripada tak punya test.
    expect(CABANG.sort()).toEqual(['internal', 'penggunaan'])
  })

  it.each(tiapCabang)('%s — kode & awalan berbentuk nomor lampiran', (id, f) => {
    expect(f.kode, `${id}.kode`).toMatch(/^IV\.[A-Z](\.\d+)+$/)
    expect(f.kode.startsWith(f.awalan + '.'), `${id}: kode harus di bawah awalan`).toBe(true)
  })

  it('jenis ledger BEDA & keduanya jenis PERPINDAHAN', () => {
    // ⚠️ Keduanya wajib tercakup partial index `idx_trx_pindah_id`
    // (`WHERE jenis IN ('pengalihan_status','mutasi_internal')`) — kalau ada
    // cabang ketiga berjenis lain, indexnya harus diperlebar duluan atau
    // menunya timeout begitu dibuka tanpa filter. Dikunci juga di
    // lib/sinkronisasiRpc.test.ts.
    expect(FORMAT_PENERIMAAN.penggunaan.jenis).toBe('pengalihan_status')
    expect(FORMAT_PENERIMAAN.internal.jenis).toBe('mutasi_internal')
  })
})

describe.each(tiapCabang)('%s — susunan kolom', (id, f) => {
  const semua = kolomLembar(f)

  it('kunci kolom unik', () => {
    const k = semua.map(x => x.key)
    expect(new Set(k).size, `kunci kembar: ${k.join(', ')}`).toBe(k.length)
  })

  it('penomoran berurut & TEPAT melompati satu nomor untuk blok Kode Barang', () => {
    // Blok "Kode Barang" punya nomornya sendiri di lembar asli tapi tak punya
    // entri kolom (ia sel segmen), jadi urutan yang benar: <awal>, lalu
    // <awal+2> menaik satu-satu. Uji ini menangkap kolom yang ditambah/dibuang
    // tanpa menggeser sisanya — kesalahan yang tak menghasilkan error apa pun.
    const awal = f.kolomKiri.nomor
    const sisa = [f.kolomNama, ...f.kolom].map(x => x.nomor)
    expect(sisa).toEqual(sisa.map((_, i) => awal + 2 + i))
  })

  it('NIBAR berdiri DI LUAR blok kode & jadi kolom paling kiri', () => {
    // Perbedaan struktural terpenting dari cabang IV.A (di sana NIBAR kolom 12,
    // di tengah). Kalau ini bergeser, penyajinya ikut salah tanpa error.
    expect(f.kolomKiri.key).toBe('nibar')
  })

  it('Nama Barang duduk DI DALAM blok Penggolongan, sesudah sel kode', () => {
    expect(f.kolomNama.key).toBe('nama')
  })

  it('punya kolom Akumulasi Penyusutan & Nilai Buku — IV.A tak punya', () => {
    const kunci = f.kolom.map(k => k.key)
    expect(kunci).toContain('akumulasi')
    expect(kunci).toContain('nilai_buku')
  })

  it('penanda subtotal & kaki MENYAMBUNG tepat sesudah kolom terakhir', () => {
    const kolomTerakhir = Math.max(...semua.map(k => k.nomor))
    expect(f.subtotal[0]).toBe(kolomTerakhir + 1)
    expect(f.kaki.tanggal).toBe(f.subtotal[3] + 1)
    expect(f.kaki.jabatan).toBe(f.kaki.tanggal + 1)
    // ⚠️ Nama & NIP sama-sama satu nomor di lembar aslinya (salah ketik di
    // sumbernya, diikuti apa adanya). Yang diuji cuma `nama` menyambung.
    expect(f.kaki.nama).toBe(f.kaki.jabatan + 1)
  })

  it('subtotal SEJAJAR dengan SEG_SUBTOTAL [6,5,4,3]', () => {
    // Kalau menyimpang, penanda subtotal di lembar rinci jatuh di tingkat yang
    // salah — 6 segmen dapat penanda milik 3 segmen, dst.
    expect(f.subtotal).toHaveLength(SEG_SUBTOTAL.length)
    expect([...f.subtotal]).toEqual([0, 1, 2, 3].map(i => f.subtotal[0] + i))
  })

  it('kolom bergrup berdampingan — grup tak boleh terpotong kolom lain', () => {
    // `Thead` merakit grup dengan menyusuri kolom berurut; grup yang terpecah
    // menghasilkan dua kepala bertulisan sama, bukan satu yang melebar.
    const terlihat = new Set<string>()
    let sebelum: string | undefined
    for (const g of f.kolom.map(k => k.grup)) {
      if (g && g !== sebelum) {
        expect(terlihat.has(g), `grup "${g}" terpotong kolom lain`).toBe(false)
        terlihat.add(g)
      }
      sebelum = g
    }
  })

  it('total lebar kolom + blok kode = 100 PERSIS', () => {
    // Inilah yang membuat lembarnya "fit to window" di `table-fixed`: tanpa
    // total tepat 100, ada kolom yang melar mengikuti isinya lalu mendorong
    // yang lain keluar halaman.
    const total = semua.reduce((a, k) => a + k.lebar, 0) + lebarKodePenerimaan(f)
    expect(Math.round(total * 100) / 100).toBe(100)
    expect(lebarKodePenerimaan(f)).toBe(sisaLebar(semua))
  })

  it('blok kode cukup lebar untuk 7 sel segmen', () => {
    // 7 sel berisi angka 1–3 digit. Di bawah ini mereka membungkus & tabelnya
    // jadi dua kali lebih tinggi.
    expect(lebarKodePenerimaan(f)).toBeGreaterThanOrEqual(8)
  })

  it('NIBAR tak boleh dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    // Potongan PERTAMA `pecahNibar()` 26 digit dan wajib muat SEBARIS. Diukur
    // di peramban 2026-08-31: 8,5% dari lebar F4 lanskap = 98 px, potongannya
    // 76 px. Aturan yang sama sudah dikunci untuk cabang IV.A.
    expect(f.kolomKiri.lebar).toBeGreaterThanOrEqual(8)
  })

  it('tiap kolom punya lebar positif', () => {
    for (const k of semua) expect(k.lebar, `${id}.${k.key}`).toBeGreaterThan(0)
  })

  it('lembar rekap berjudul REKAPITULASI, lembar rinci LAPORAN', () => {
    // ⚠️ Keempatnya REKAPITULASI di keluarga ini — beda dari IV.A yang lembar
    // `.7`-nya justru tetap berjudul LAPORAN.
    expect(f.judul).toMatch(/^LAPORAN /)
    expect(judulRekapPenerimaan(f)).toMatch(/^REKAPITULASI /)
    expect(judulRekapPenerimaan(f)).not.toMatch(/^LAPORAN /)
  })
})

describe('beda yang DISENGAJA antar cabang — jangan saling menular', () => {
  const kunci = (f: FormatPenerimaan) => f.kolom.map(k => k.key)

  it('Lokasi & SK Penghapusan HANYA di IV.B.1.2', () => {
    // ⚠️ Uji terpenting soal pemisahan kedua cabang. Menyalin ketiga kolom ini
    // ke IV.C "biar seragam" tak menghasilkan satu pun error — lembarnya cuma
    // tak lagi cocok waktu pemeriksa mencocokkannya kolom per kolom.
    for (const k of ['lokasi', 'sk_tanggal', 'sk_nomor']) {
      expect(kunci(FORMAT_PENERIMAAN.penggunaan), `IV.B wajib punya ${k}`).toContain(k)
      expect(kunci(FORMAT_PENERIMAAN.internal), `IV.C TIDAK boleh punya ${k}`).not.toContain(k)
    }
  })

  it('IV.C punya TEPAT tiga kolom lebih sedikit', () => {
    expect(kolomLembar(FORMAT_PENERIMAAN.internal).length)
      .toBe(kolomLembar(FORMAT_PENERIMAAN.penggunaan).length - 3)
  })

  it('penomoran IV.C bergeser +1 karena kop-nya punya isian SKPD sendiri', () => {
    // IV.B menyatukan sebutan pejabat & nama SKPD jadi SATU isian (3) → 7 isian
    // kop → kolom mulai (8). IV.C memisahkannya jadi (3) & SKPD (4) → 8 isian →
    // kolom mulai (9). Bukan kolom yang berbeda, cuma nomornya.
    expect(FORMAT_PENERIMAAN.penggunaan.kolomKiri.nomor).toBe(8)
    expect(FORMAT_PENERIMAAN.internal.kolomKiri.nomor).toBe(9)
  })

  it('hanya IV.B.1.x punya baris judul kedua', () => {
    expect(FORMAT_PENERIMAAN.penggunaan.judulLanjut).toBeTruthy()
    expect(FORMAT_PENERIMAAN.internal.judulLanjut).toBeUndefined()
  })

  it('label grup "Asal Barang" memang beda & diikuti apa adanya', () => {
    const grup = (f: FormatPenerimaan) => f.kolom.find(k => k.key === 'asal_pihak')!.grup
    expect(grup(FORMAT_PENERIMAAN.penggunaan)).toBe('Asal Barang/Penyerahan dari')
    expect(grup(FORMAT_PENERIMAAN.internal)).toBe('Asal Barang')
  })
})

// ── Mesin subtotal, dipakai bersama cabang IV.A ─────────────────────────────
const it2 = (kode: string, jumlah: number, nilai: number, akumulasi: number, nilaiBuku: number)
  : ItemLaporan<string> => ({ kode, jumlah, nilai, akumulasi, nilaiBuku, data: kode })

const CONTOH: ItemLaporan<string>[] = [
  it2('1.3.2.05.02.06.121', 1, 1_000, 200, 800),
  it2('1.3.2.05.02.06.122', 2, 2_000, 500, 1_500),
  it2('1.3.2.05.02.07.001', 1, 500, 100, 400),
  it2('1.3.2.06.01.01.001', 3, 4_000, 1_000, 3_000),
  it2('1.3.3.01.01.01.001', 1, 9_000, 3_000, 6_000),
]

describe('lembar rekap (identik di kedua cabang)', () => {
  it('MULAI DI 3 SEGMEN — tak ada baris kelompok neraca seperti IV.A', () => {
    // ⚠️ Uji terpenting di blok ini. Memakai bawaan `SEG_MIN_REKAP` (2)
    // menambahkan baris `1.3 ASET TETAP` yang TIDAK ADA di format ini — dan
    // karena angkanya tetap menjumlah dengan benar, tak satu pun uji aritmetika
    // akan menangkapnya.
    expect(SEG_MIN_REKAP_PENERIMAAN).toBe(3)
    for (const t of TANGGA_REKAP) {
      const rekap = susunRekap(CONTOH, t.seg, SEG_MIN_REKAP_PENERIMAAN)
      expect(Math.min(...rekap.map(r => r.seg)), `rekap .${t.akhiran}`).toBe(3)
    }
  })

  it.each(TANGGA_REKAP.map(t => [t.akhiran, t.menurut] as const))(
    'rekap .%i (menurut %s) sama persis dgn subtotal lembar rinci',
    (akhiran) => {
      // Lembar rinci & keempat rekapnya terbit dalam SATU berkas yang
      // ditandatangani. Kalau angkanya bisa berbeda, tak ada yang akan berteriak.
      const t = TANGGA_REKAP.find(x => x.akhiran === akhiran)!
      const rinci = susunRinci(CONTOH, FORMAT_PENERIMAAN.penggunaan.subtotal)
      for (const r of susunRekap(CONTOH, t.seg, SEG_MIN_REKAP_PENERIMAAN)) {
        const g = rinci.find(b => b.tipe === 'grup' && b.seg === r.seg && b.kode === r.kode)
        expect(g, `kelompok ${r.kode} (${r.seg} seg) hilang dari lembar rinci`).toBeDefined()
        expect(g).toMatchObject({
          jumlah: r.jumlah, nilai: r.nilai,
          akumulasi: r.akumulasi, nilaiBuku: r.nilaiBuku,
        })
      }
    })

  it('akumulasi & nilai buku IKUT dijumlah di tiap kedalaman', () => {
    // Kolom itu yang membedakan lembar ini dari IV.A. Kalau mesin subtotal cuma
    // menjumlah `nilai`, keduanya tampil 0 di semua baris subtotal — nol yang
    // kelihatan sah.
    const totalAkum = CONTOH.reduce((a, x) => a + (x.akumulasi ?? 0), 0)
    const totalNb = CONTOH.reduce((a, x) => a + (x.nilaiBuku ?? 0), 0)
    for (let seg = SEG_MIN_REKAP_PENERIMAAN; seg <= 6; seg++) {
      const baris = susunRekap(CONTOH, 6, SEG_MIN_REKAP_PENERIMAAN).filter(r => r.seg === seg)
      expect(baris.reduce((a, x) => a + x.akumulasi, 0), `akumulasi @${seg} seg`).toBe(totalAkum)
      expect(baris.reduce((a, x) => a + x.nilaiBuku, 0), `nilai buku @${seg} seg`).toBe(totalNb)
    }
  })

  it('item TANPA akumulasi/nilaiBuku dihitung 0, bukan NaN', () => {
    // Cabang IV.A tak pernah mengisi keduanya. Kalau `undefined` bocor ke
    // penjumlahan, seluruh kolom uang lembar IV.A jadi NaN.
    const polos: ItemLaporan<string>[] = [{ kode: '1.3.2.05.02.06.121', jumlah: 1, nilai: 100, data: 'x' }]
    const g = susunRekap(polos, 6, SEG_MIN_REKAP_PENERIMAAN)
    expect(g.every(b => b.akumulasi === 0 && b.nilaiBuku === 0)).toBe(true)
    expect(g.every(b => Number.isFinite(b.nilai))).toBe(true)
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    expect(susunRekap([], 6, SEG_MIN_REKAP_PENERIMAAN)).toEqual([])
  })

  it('lembar rinci menyediakan 7 sel segmen (kode penuh)', () => {
    expect(SEL_KODE_PENERIMAAN).toBe(7)
  })
})

// ── Penjaga SUMBER: penyaji & pemuat benar-benar generik ────────────────────
//
// ⚠️ Uji di atas membuktikan REGISTRY-nya benar; ia tak membuktikan PENYAJI-nya
// memakainya. Dua kelas kegagalan yang cuma bisa ditangkap dari sumbernya:
//
//   (a) `susunRekap(items, seg)` tanpa argumen ketiga → bawaannya jatuh ke 2 &
//       lembar ini mendapat baris `1.3 ASET TETAP` yang tak ada di formatnya.
//       Angkanya tetap benar, jadi TAK SATU PUN uji aritmetika menangkapnya.
//   (b) percabangan `if (id === 'penggunaan')` di penyaji → begitu ada cabang
//       ketiga, ia akan menambah cabang lagi sampai berkasnya tak terbaca.
//       Yang membedakan kedua format WAJIB seluruhnya data.
//
// Pola pemindaian sumber ini mengikuti lib/sinkronisasiRpc.test.ts, termasuk
// pengaman anti-hampa: pemindai yang tak menemukan berkasnya akan "lulus" —
// lebih berbahaya daripada tak punya test sama sekali.
const PENYAJI = path.join(process.cwd(), 'components/pelaporan/LembarPenerimaanPermendagri.tsx')

describe('penyaji lembar', () => {
  it('berkas penyajinya ada & tak hampa', () => {
    expect(fs.existsSync(PENYAJI), `penyaji tak ditemukan: ${PENYAJI}`).toBe(true)
    expect(fs.readFileSync(PENYAJI, 'utf8').length).toBeGreaterThan(2000)
  })

  it('memanggil susunRekap DENGAN SEG_MIN_REKAP_PENERIMAAN, bukan bawaan 2', () => {
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    const panggilan = [...isi.matchAll(/susunRekap\(([^)]*)\)/g)].map(m => m[1])
    expect(panggilan.length, 'penyaji tak memanggil susunRekap sama sekali').toBeGreaterThan(0)
    for (const arg of panggilan) {
      expect(arg, `susunRekap(${arg}) tanpa kedalaman keluarga ini`)
        .toContain('SEG_MIN_REKAP_PENERIMAAN')
    }
  })

  it('TIDAK bercabang per format — pembedanya seluruhnya data', () => {
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    // Menangkap `id === 'internal'`, `f.kode === 'IV.C.2'`, `f.jenis ===` dst.
    // Komentar boleh menyebut nama cabangnya; yang dilarang PERBANDINGANNYA.
    const kode = isi.split('\n').filter(b => !b.trim().startsWith('//')).join('\n')
    expect(kode).not.toMatch(/===\s*'(penggunaan|internal)'/)
    expect(kode).not.toMatch(/f\.(kode|jenis|awalan)\s*===/)
  })

  it('lembar rekap TIDAK memakai kolom "No" & baris JUMLAH milik IV.A.<n>.6', () => {
    // Bedanya nyata: IV.A.<n>.6 punya keduanya, keluarga ini tidak. Menyalinnya
    // dari penyaji IV.A akan menambah kolom yang tak ada di format ini.
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    expect(isi).not.toContain('pakaiNo')
    expect(isi).not.toMatch(/>\s*JUMLAH\s*</)
  })
})

describe('periodePosisi — periode kolom Akumulasi & Nilai Buku', () => {
  it('AKHIR TAHUN memakai S2, bukan S1', () => {
    // ⚠️ Kolom Akumulasi & Nilai Buku itu POSISI (saldo akhir periode),
    // sedangkan daftar barangnya ARUS. Memakai S1 mencetak posisi pertengahan
    // tahun di lembar berjudul AKHIR TAHUN — angka yang tampak sah & tak akan
    // ditolak siapa pun.
    expect(periodePosisi('2026')).toBe('2026-S2')
  })

  it('satu semester dipakai apa adanya', () => {
    expect(periodePosisi('2026-S1')).toBe('2026-S1')
    expect(periodePosisi('2026-S2')).toBe('2026-S2')
  })

  it('periode kosong → kosong, bukan menebak tahun berjalan', () => {
    expect(periodePosisi('')).toBe('')
  })
})
