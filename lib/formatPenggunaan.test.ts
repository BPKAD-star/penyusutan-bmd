// Penjaga format lembar PENGGUNAAN Permendagri 47/2021 (IV.B.1.2–1.6).
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
//
// SENGAJA TIDAK menguji JSX apa pun — TESTING.md §10 menolak snapshot JSX.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT_PENGGUNAAN, SEG_MIN_REKAP_IVB, SEL_KODE_IVB, lebarKodeIvb, judulRekapIvb,
} from './formatPenggunaan'
import {
  SEG_SUBTOTAL, TANGGA_REKAP, susunRinci, susunRekap, sisaLebar,
  type ItemLaporan,
} from './formatPermendagri'
import { periodePosisi } from './laporanPenggunaan'

const f = FORMAT_PENGGUNAAN
const semuaKolom = [f.kolomKiri, f.kolomNama, ...f.kolom]

describe('IV.B.1.2 — susunan kolom', () => {
  it('kunci kolom unik', () => {
    const k = semuaKolom.map(x => x.key)
    expect(new Set(k).size, `kunci kembar: ${k.join(', ')}`).toBe(k.length)
  })

  it('kolom mulai (8) & berurut sampai (29) tanpa lompat maupun kembar', () => {
    // ⚠️ Mulai (8), BUKAN (9) seperti cabang IV.A: kop IV.B punya 7 isian
    // (baris SKPD & sebutan pejabat disatukan jadi satu), IV.A punya 8.
    const nomor = [f.kolomKiri.nomor, ...[f.kolomNama, ...f.kolom].map(x => x.nomor)]
    // (9) itu blok "Kode Barang" yang tak punya entri kolom sendiri — ia sel
    // segmen. Jadi urutan yang diharapkan: 8, lalu 10..29.
    expect(nomor).toEqual([8, ...Array.from({ length: 20 }, (_, i) => 10 + i)])
  })

  it('NIBAR berdiri DI LUAR blok kode & jadi kolom paling kiri', () => {
    // Perbedaan struktural terpenting dari cabang IV.A (di sana NIBAR kolom 12,
    // di tengah). Kalau ini bergeser, penyajinya ikut salah tanpa error.
    expect(f.kolomKiri.key).toBe('nibar')
    expect(f.kolomKiri.nomor).toBe(8)
  })

  it('Nama Barang duduk DI DALAM blok Penggolongan, sesudah sel kode', () => {
    expect(f.kolomNama.key).toBe('nama')
    expect(f.kolomNama.nomor).toBe(10)
  })

  it('punya kolom Akumulasi Penyusutan & Nilai Buku — IV.A tak punya', () => {
    const kunci = f.kolom.map(k => k.key)
    expect(kunci).toContain('akumulasi')
    expect(kunci).toContain('nilai_buku')
  })

  it('penanda subtotal & kaki MENYAMBUNG tepat sesudah kolom terakhir', () => {
    // Penjaga struktur: kolom yang ditambah/dibuang tanpa menggeser sisanya
    // membuat penomoran lembar tak lagi cocok dgn format aslinya — dan itu
    // tidak menghasilkan satu pun error.
    const kolomTerakhir = Math.max(...semuaKolom.map(k => k.nomor))
    expect([...f.subtotal]).toEqual([30, 31, 32, 33])
    expect(f.subtotal[0]).toBe(kolomTerakhir + 1)
    expect(f.kaki.tanggal).toBe(f.subtotal[3] + 1)
    expect(f.kaki.jabatan).toBe(f.kaki.tanggal + 1)
    // ⚠️ Nama & NIP sama-sama (36) di lembar aslinya — salah ketik di sumbernya,
    // diikuti apa adanya. Yang diuji di sini cuma bahwa `nama` menyambung.
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
    const grup = f.kolom.map(k => k.grup)
    const terlihat = new Set<string>()
    let sebelum: string | undefined
    for (const g of grup) {
      if (g && g !== sebelum) {
        expect(terlihat.has(g), `grup "${g}" terpotong kolom lain`).toBe(false)
        terlihat.add(g)
      }
      sebelum = g
    }
  })
})

describe('IV.B.1.2 — lebar kolom', () => {
  it('total lebar kolom + blok kode = 100 PERSIS', () => {
    // Inilah yang membuat lembarnya "fit to window" di `table-fixed`: tanpa
    // total tepat 100, ada kolom yang melar mengikuti isinya lalu mendorong
    // yang lain keluar halaman.
    const total = semuaKolom.reduce((a, k) => a + k.lebar, 0) + lebarKodeIvb()
    expect(Math.round(total * 100) / 100).toBe(100)
  })

  it('lebarKodeIvb konsisten dengan sisaLebar', () => {
    expect(lebarKodeIvb()).toBe(sisaLebar(semuaKolom))
  })

  it('blok kode cukup lebar untuk 7 sel segmen', () => {
    // 7 sel berisi angka 1–3 digit. Di bawah ini mereka membungkus & tabelnya
    // jadi dua kali lebih tinggi.
    expect(lebarKodeIvb()).toBeGreaterThanOrEqual(8)
  })

  it('NIBAR tak boleh dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    // Potongan PERTAMA `pecahNibar()` 26 digit dan wajib muat SEBARIS. Aturan
    // yang sama sudah dikunci untuk cabang IV.A.
    expect(f.kolomKiri.lebar).toBeGreaterThanOrEqual(8)
  })

  it('tiap kolom punya lebar positif', () => {
    for (const k of semuaKolom) expect(k.lebar, k.key).toBeGreaterThan(0)
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

describe('rekap IV.B.1.3–1.6', () => {
  it('MULAI DI 3 SEGMEN — tak ada baris kelompok neraca seperti IV.A', () => {
    // ⚠️ Uji terpenting di blok ini. Memakai bawaan `SEG_MIN_REKAP` (2)
    // menambahkan baris `1.3 ASET TETAP` yang TIDAK ADA di format IV.B — dan
    // karena angkanya tetap menjumlah dengan benar, tak satu pun uji aritmetika
    // akan menangkapnya.
    expect(SEG_MIN_REKAP_IVB).toBe(3)
    for (const t of TANGGA_REKAP) {
      const rekap = susunRekap(CONTOH, t.seg, SEG_MIN_REKAP_IVB)
      expect(Math.min(...rekap.map(r => r.seg)), `IV.B.1.${t.akhiran}`).toBe(3)
    }
  })

  it.each(TANGGA_REKAP.map(t => [t.akhiran, t.menurut] as const))(
    'IV.B.1.%i (menurut %s) sama persis dgn subtotal lembar rinci',
    (akhiran) => {
      // Lembar rinci & keempat rekapnya terbit dalam SATU berkas yang
      // ditandatangani. Kalau angkanya bisa berbeda, tak ada yang akan berteriak.
      const t = TANGGA_REKAP.find(x => x.akhiran === akhiran)!
      const rinci = susunRinci(CONTOH, f.subtotal)
      for (const r of susunRekap(CONTOH, t.seg, SEG_MIN_REKAP_IVB)) {
        const g = rinci.find(b => b.tipe === 'grup' && b.seg === r.seg && b.kode === r.kode)
        expect(g, `kelompok ${r.kode} (${r.seg} seg) hilang dari lembar rinci`).toBeDefined()
        expect(g).toMatchObject({
          jumlah: r.jumlah, nilai: r.nilai,
          akumulasi: r.akumulasi, nilaiBuku: r.nilaiBuku,
        })
      }
    })

  it('akumulasi & nilai buku IKUT dijumlah di tiap kedalaman', () => {
    // Kolom (17) & (18) itu yang membedakan lembar ini dari IV.A. Kalau mesin
    // subtotal cuma menjumlah `nilai`, kolomnya tampil 0 di semua baris
    // subtotal — nol yang kelihatan sah.
    const totalAkum = CONTOH.reduce((a, x) => a + (x.akumulasi ?? 0), 0)
    const totalNb = CONTOH.reduce((a, x) => a + (x.nilaiBuku ?? 0), 0)
    for (let seg = SEG_MIN_REKAP_IVB; seg <= 6; seg++) {
      const baris = susunRekap(CONTOH, 6, SEG_MIN_REKAP_IVB).filter(r => r.seg === seg)
      expect(baris.reduce((a, x) => a + x.akumulasi, 0), `akumulasi @${seg} seg`).toBe(totalAkum)
      expect(baris.reduce((a, x) => a + x.nilaiBuku, 0), `nilai buku @${seg} seg`).toBe(totalNb)
    }
  })

  it('item TANPA akumulasi/nilaiBuku dihitung 0, bukan NaN', () => {
    // Cabang IV.A tak pernah mengisi keduanya. Kalau `undefined` bocor ke
    // penjumlahan, seluruh kolom uang lembar IV.A jadi NaN.
    const polos: ItemLaporan<string>[] = [{ kode: '1.3.2.05.02.06.121', jumlah: 1, nilai: 100, data: 'x' }]
    const g = susunRekap(polos, 6, SEG_MIN_REKAP_IVB)
    expect(g.every(b => b.akumulasi === 0 && b.nilaiBuku === 0)).toBe(true)
    expect(g.every(b => Number.isFinite(b.nilai))).toBe(true)
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    expect(susunRekap([], 6, SEG_MIN_REKAP_IVB)).toEqual([])
  })
})

// ── Penjaga SUMBER: penyaji benar-benar memakai kedalaman IV.B ─────────────
//
// ⚠️ Uji di atas membuktikan MESIN-nya menghormati `SEG_MIN_REKAP_IVB`; ia tak
// membuktikan PENYAJI-nya mengirimkannya. Kalau penyaji memanggil
// `susunRekap(items, seg)` tanpa argumen ketiga, bawaannya jatuh ke 2 dan
// lembar IV.B mendapat baris `1.3 ASET TETAP` yang tak ada di format aslinya —
// angkanya tetap menjumlah benar, jadi TAK SATU PUN uji aritmetika akan
// menangkapnya, dan yang keliru cuma bentuk lembar yang ditandatangani.
//
// Pola pemindaian sumber ini mengikuti lib/sinkronisasiRpc.test.ts, termasuk
// pengaman anti-hampa: pemindai yang tak menemukan berkasnya akan "lulus" —
// lebih berbahaya daripada tak punya test sama sekali.
const PENYAJI = path.join(process.cwd(), 'components/pelaporan/LembarPenggunaanPermendagri.tsx')

describe('penyaji lembar IV.B', () => {
  it('berkas penyajinya ada & tak hampa', () => {
    expect(fs.existsSync(PENYAJI), `penyaji tak ditemukan: ${PENYAJI}`).toBe(true)
    expect(fs.readFileSync(PENYAJI, 'utf8').length).toBeGreaterThan(2000)
  })

  it('memanggil susunRekap DENGAN SEG_MIN_REKAP_IVB, bukan bawaan 2', () => {
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    const panggilan = [...isi.matchAll(/susunRekap\(([^)]*)\)/g)].map(m => m[1])
    expect(panggilan.length, 'penyaji tak memanggil susunRekap sama sekali').toBeGreaterThan(0)
    for (const arg of panggilan) {
      expect(arg, `susunRekap(${arg}) tanpa kedalaman IV.B`).toContain('SEG_MIN_REKAP_IVB')
    }
  })

  it('lembar rekap TIDAK memakai kolom "No" & baris JUMLAH milik IV.A.<n>.6', () => {
    // Bedanya nyata: IV.A.<n>.6 punya keduanya, IV.B.1.6 tidak. Menyalinnya dari
    // penyaji IV.A akan menambah kolom yang tak ada di format ini.
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    expect(isi).not.toContain('pakaiNo')
    expect(isi).not.toMatch(/>\s*JUMLAH\s*</)
  })
})

describe('judul & sel kode', () => {
  it('lembar rekap berjudul REKAPITULASI', () => {
    // ⚠️ Keempatnya REKAPITULASI di cabang ini — beda dari IV.A yang lembar
    // `.7`-nya justru tetap berjudul LAPORAN.
    expect(judulRekapIvb()).toMatch(/^REKAPITULASI /)
    expect(judulRekapIvb()).not.toMatch(/^LAPORAN /)
    expect(f.judul).toMatch(/^LAPORAN /)
  })

  it('lembar rinci menyediakan 7 sel segmen (kode penuh)', () => {
    expect(SEL_KODE_IVB).toBe(7)
  })

  it('judul baris kedua tetap & menyebut bentuk penggunaannya', () => {
    expect(f.judulLanjut).toContain('PENGALIHAN')
    expect(f.judulLanjut).toContain('STATUS PENGGUNAAN BMD')
  })

  it('jenis ledger sumbernya pengalihan_status', () => {
    expect(f.jenis).toBe('pengalihan_status')
  })
})

describe('periodePosisi — periode kolom Akumulasi & Nilai Buku', () => {
  it('AKHIR TAHUN memakai S2, bukan S1', () => {
    // ⚠️ Kolom (17)(18) itu POSISI (saldo akhir periode), sedangkan daftar
    // barangnya ARUS. Memakai S1 mencetak posisi pertengahan tahun di lembar
    // berjudul AKHIR TAHUN — angka yang tampak sah & tak akan ditolak siapa pun.
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
