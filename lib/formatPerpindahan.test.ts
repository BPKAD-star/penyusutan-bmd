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
  FORMAT_PERPINDAHAN, SEG_MIN_REKAP_PERPINDAHAN, KOLOM_RINCI_PERPINDAHAN,
  KOLOM_DIJUMLAH_PERPINDAHAN, judulRekapPerpindahan,
  type IdPerpindahan,
} from './formatPerpindahan'
import {
  TANGGA_REKAP, susunRekap,
  type ItemLaporan,
} from './formatPermendagri'
import { periodePosisi } from './laporanPerpindahan'

const CABANG = Object.keys(FORMAT_PERPINDAHAN) as IdPerpindahan[]
const tiapCabang = CABANG.map(id => [id, FORMAT_PERPINDAHAN[id]] as const)

describe('registry kedua cabang', () => {
  it('memuat TEPAT tiga cabang yang dikenal', () => {
    // Pengaman anti-hampa: `it.each` atas daftar kosong LULUS tanpa menjalankan
    // apa pun — lebih berbahaya daripada tak punya test.
    expect(CABANG.sort()).toEqual(['internal', 'pengeluaran', 'penggunaan'])
  })

  it.each(tiapCabang)('%s — kode & awalan berbentuk nomor lampiran', (id, f) => {
    expect(f.kode, `${id}.kode`).toMatch(/^IV\.[A-Z](\.\d+)+$/)
    expect(f.kode.startsWith(f.awalan + '.'), `${id}: kode harus di bawah awalan`).toBe(true)
  })

  it('jenis ledger sesuai cabangnya & semuanya jenis PERPINDAHAN', () => {
    // ⚠️ Ketiganya wajib tercakup partial index `idx_trx_pindah_id`
    // (`WHERE jenis IN ('pengalihan_status','mutasi_internal')`) — kalau ada
    // cabang berjenis lain, indexnya harus diperlebar duluan atau menunya
    // timeout begitu dibuka tanpa filter. Dikunci juga di
    // lib/sinkronisasiRpc.test.ts.
    expect(FORMAT_PERPINDAHAN.penggunaan.jenis).toBe('pengalihan_status')
    expect(FORMAT_PERPINDAHAN.internal.jenis).toBe('mutasi_internal')
    expect(FORMAT_PERPINDAHAN.pengeluaran.jenis).toBe('mutasi_internal')
  })

  it('IDENTITAS lembar = (jenis, arah), BUKAN jenis saja', () => {
    // ⚠️ Uji terpenting sejak IV.D masuk. IV.C & IV.D membaca ledger yang PERSIS
    // SAMA; yang membedakan cuma arahnya. Kalau dua cabang punya pasangan
    // (jenis, arah) yang sama, keduanya akan memuat baris identik & sama-sama
    // mengaku benar — tanpa satu pun error.
    const pasangan = CABANG.map(id => `${FORMAT_PERPINDAHAN[id].jenis}|${FORMAT_PERPINDAHAN[id].arah}`)
    expect(new Set(pasangan).size, `pasangan kembar: ${pasangan.join(', ')}`).toBe(pasangan.length)
    expect(FORMAT_PERPINDAHAN.internal.arah).toBe('masuk')
    expect(FORMAT_PERPINDAHAN.pengeluaran.arah).toBe('keluar')
  })

  it('judul lembar menyatakan arahnya — PENERIMAAN vs PENGELUARAN', () => {
    // Kalau judul & `arah` menyimpang, lembarnya berkop "PENERIMAAN" tapi
    // berisi barang yang keluar. Angkanya tetap sah-sah saja bentuknya.
    for (const id of CABANG) {
      const f = FORMAT_PERPINDAHAN[id]
      const kata = f.arah === 'masuk' ? 'PENERIMAAN' : 'PENGELUARAN'
      expect(f.judul, `${id}: judul tak sejalan dgn arah`).toContain(kata)
    }
  })
})

// ── Lembar RINCI: susunan kolom keputusan user (2026-09-27) ─────────────────
describe('lembar rinci — satu susunan kolom untuk ketiga cabang', () => {
  const k = KOLOM_RINCI_PERPINDAHAN

  it('urutan kolom PERSIS seperti yang ditetapkan user', () => {
    // Urutan kolom lembar bertanda tangan itu aturan integritas: pemeriksa
    // mencocokkannya kolom per kolom dgn contoh yang disetujui.
    expect(k.map(x => x.key)).toEqual([
      'nibar', 'kode', 'nama', 'merek', 'jumlah', 'harga_satuan', 'jumlah_total',
      'akumulasi', 'nilai_buku', 'tgl_perolehan', 'cara_perolehan', 'alamat',
      'pihak', 'dok_nomor', 'tgl_bast', 'keterangan',
    ])
  })

  it('total lebar 100 PERSIS — "fit to window" di table-fixed', () => {
    const total = k.reduce((a, x) => a + x.lebar, 0)
    expect(Math.round(total * 100) / 100).toBe(100)
    for (const x of k) expect(x.lebar, x.key).toBeGreaterThan(0)
  })

  it('NIBAR tak dipersempit — 45 digit dipenggal DUA baris, bukan tiga', () => {
    expect(k.find(x => x.key === 'nibar')!.lebar).toBeGreaterThanOrEqual(8)
  })

  it('kolom uang yang dijumlah BERURUTAN & Harga Satuan TIDAK ikut dijumlah', () => {
    // Baris total merender label ber-colSpan lalu tiga angka beruntun; kalau
    // kolomnya tak bersebelahan, angkanya jatuh di kolom yang salah.
    const idx = KOLOM_DIJUMLAH_PERPINDAHAN.map(key => k.findIndex(x => x.key === key))
    expect(idx.every(i => i >= 0)).toBe(true)
    expect(idx).toEqual(idx.map((_, j) => idx[0] + j))
    expect(KOLOM_DIJUMLAH_PERPINDAHAN).not.toContain('harga_satuan')
  })
})

describe('kolom pihak lawan — satu-satunya beda antar cabang', () => {
  it('PENERIMAAN mencetak pihak yang MENYERAHKAN (skpd_asal)', () => {
    // ⚠️ Kalau `sisi` tertukar, lembar Penerimaan mencetak SKPD itu SENDIRI
    // sbg pihak yang menyerahkan — terisi penuh, tanpa satu pun error.
    for (const id of ['penggunaan', 'internal'] as IdPerpindahan[]) {
      expect(FORMAT_PERPINDAHAN[id].kolomPihak).toEqual({ judul: 'Pihak yang menyerahkan', sisi: 'asal' })
    }
  })

  it('PENGELUARAN mencetak "Tujuan SKPD" (skpd_tujuan)', () => {
    expect(FORMAT_PERPINDAHAN.pengeluaran.kolomPihak).toEqual({ judul: 'Tujuan SKPD', sisi: 'tujuan' })
  })

  it('sisi pihak SEJALAN dgn arah lembar', () => {
    for (const [id, f] of tiapCabang) {
      expect(f.kolomPihak.sisi, id).toBe(f.arah === 'masuk' ? 'asal' : 'tujuan')
    }
  })

  it('hanya IV.B.1.x punya baris judul kedua', () => {
    expect(FORMAT_PERPINDAHAN.penggunaan.judulLanjut).toBeTruthy()
    expect(FORMAT_PERPINDAHAN.internal.judulLanjut).toBeUndefined()
    expect(FORMAT_PERPINDAHAN.pengeluaran.judulLanjut).toBeUndefined()
  })

  it.each(tiapCabang)('%s — lembar rekap REKAPITULASI, lembar rinci LAPORAN', (_id, f) => {
    expect(f.judul).toMatch(/^LAPORAN /)
    expect(judulRekapPerpindahan(f)).toMatch(/^REKAPITULASI /)
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
    expect(SEG_MIN_REKAP_PERPINDAHAN).toBe(3)
    for (const t of TANGGA_REKAP) {
      const rekap = susunRekap(CONTOH, t.seg, SEG_MIN_REKAP_PERPINDAHAN)
      expect(Math.min(...rekap.map(r => r.seg)), `rekap .${t.akhiran}`).toBe(3)
    }
  })

  it('"Total <jenis>" lembar rinci = rekap menurut jenis — satu mesin, satu angka', () => {
    // Lembar rinci mengambil totalnya dari susunRekap 3 segmen yang SAMA dgn
    // rekap .6; Σ semua jenis wajib = Σ seluruh barang.
    const jenis = susunRekap(CONTOH, 3, SEG_MIN_REKAP_PERPINDAHAN).filter(g => g.seg === 3)
    expect(jenis.map(g => g.kode)).toEqual(['1.3.2', '1.3.3'])
    expect(jenis.reduce((a, g) => a + g.nilai, 0)).toBe(CONTOH.reduce((a, x) => a + x.nilai, 0))
  })

  it('akumulasi & nilai buku IKUT dijumlah di tiap kedalaman', () => {
    // Kolom itu yang membedakan lembar ini dari IV.A. Kalau mesin subtotal cuma
    // menjumlah `nilai`, keduanya tampil 0 di semua baris subtotal — nol yang
    // kelihatan sah.
    const totalAkum = CONTOH.reduce((a, x) => a + (x.akumulasi ?? 0), 0)
    const totalNb = CONTOH.reduce((a, x) => a + (x.nilaiBuku ?? 0), 0)
    for (let seg = SEG_MIN_REKAP_PERPINDAHAN; seg <= 6; seg++) {
      const baris = susunRekap(CONTOH, 6, SEG_MIN_REKAP_PERPINDAHAN).filter(r => r.seg === seg)
      expect(baris.reduce((a, x) => a + x.akumulasi, 0), `akumulasi @${seg} seg`).toBe(totalAkum)
      expect(baris.reduce((a, x) => a + x.nilaiBuku, 0), `nilai buku @${seg} seg`).toBe(totalNb)
    }
  })

  it('item TANPA akumulasi/nilaiBuku dihitung 0, bukan NaN', () => {
    // Cabang IV.A tak pernah mengisi keduanya. Kalau `undefined` bocor ke
    // penjumlahan, seluruh kolom uang lembar IV.A jadi NaN.
    const polos: ItemLaporan<string>[] = [{ kode: '1.3.2.05.02.06.121', jumlah: 1, nilai: 100, data: 'x' }]
    const g = susunRekap(polos, 6, SEG_MIN_REKAP_PERPINDAHAN)
    expect(g.every(b => b.akumulasi === 0 && b.nilaiBuku === 0)).toBe(true)
    expect(g.every(b => Number.isFinite(b.nilai))).toBe(true)
  })

  it('daftar kosong → rekap kosong, bukan baris nol', () => {
    expect(susunRekap([], 6, SEG_MIN_REKAP_PERPINDAHAN)).toEqual([])
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
const PENYAJI = path.join(process.cwd(), 'components/pelaporan/LembarPerpindahanPermendagri.tsx')

describe('penyaji lembar', () => {
  it('berkas penyajinya ada & tak hampa', () => {
    expect(fs.existsSync(PENYAJI), `penyaji tak ditemukan: ${PENYAJI}`).toBe(true)
    expect(fs.readFileSync(PENYAJI, 'utf8').length).toBeGreaterThan(2000)
  })

  it('memanggil susunRekap DENGAN SEG_MIN_REKAP_PERPINDAHAN, bukan bawaan 2', () => {
    const isi = fs.readFileSync(PENYAJI, 'utf8')
    const panggilan = [...isi.matchAll(/susunRekap\(([^)]*)\)/g)].map(m => m[1])
    expect(panggilan.length, 'penyaji tak memanggil susunRekap sama sekali').toBeGreaterThan(0)
    for (const arg of panggilan) {
      expect(arg, `susunRekap(${arg}) tanpa kedalaman keluarga ini`)
        .toContain('SEG_MIN_REKAP_PERPINDAHAN')
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
