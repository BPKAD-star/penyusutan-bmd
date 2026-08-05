// ============================================================================
// Test helper domain BMD — REFACTOR-PLAN.md Fase 0.3.
//
// `lib/bmd.ts` dipakai hampir semua modul: periode semesteran, perlakuan per
// golongan, klasifikasi intra/ekstra, label & konstanta bersama. Salah di sini
// menyebar diam-diam ke seluruh laporan.
//
// Selain fungsinya, berkas ini menguji **konsistensi antar konstanta kembar**.
// rules.md §5.5 mewajibkan pasangan konstanta diubah berpasangan, tapi selama
// aturan itu cuma tertulis di komentar, tak ada yang menegakkannya. Test di
// bawah menegakkannya.
//
// Test bertanda "DUGAAN BUG" mengunci keadaan yang tampaknya SALAH, supaya
// gapnya terlihat & keputusannya disengaja. Kalau nanti diperbaiki, test itu
// akan merah dan harus diubah — memang itu maksudnya.
// ============================================================================
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  kodeLevel3, perlakuanKode, klasifikasiKomptabel,
  parsePeriode, formatPeriode, nextPeriode, previousPeriode,
  comparePeriode, periodeRange, periodeDariTanggal,
  asalUsulTampil, gabungKode,
  GOLONGAN_DAFTAR_BARANG, GOLONGAN_REKAP, CARA_PEROLEHAN_LABEL,
  JENIS_TRANSAKSI_LABEL, JENIS_PEROLEHAN, JENIS_PENGHAPUSAN,
} from './bmd'

// ════════════════════════════════════════════════════════════════════════════
describe('kodeLevel3', () => {
  it('mengambil tiga segmen pertama dari kode lengkap 7 segmen', () => {
    expect(kodeLevel3('1.3.2.05.01.05.068')).toBe('1.3.2')
  })

  it('mengembalikan apa adanya kalau segmennya kurang dari tiga', () => {
    expect(kodeLevel3('1.3')).toBe('1.3')
    expect(kodeLevel3('1')).toBe('1')
    expect(kodeLevel3('')).toBe('')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('perlakuanKode', () => {
  it.each([
    ['1.3.2 Peralatan & Mesin',        '1.3.2.02.01.02.003', 'penyusutan'],
    ['1.3.3 Gedung & Bangunan',        '1.3.3.01.01.01.001', 'penyusutan'],
    ['1.3.4 Jalan, Jaringan, Irigasi', '1.3.4.01.01.01.001', 'penyusutan'],
    ['1.5.3 Aset Tidak Berwujud',      '1.5.3.01.01.01.001', 'amortisasi'],
    ['1.5.4 Aset Lain-Lain',           '1.5.4.01.01.01.001', 'lain_lain'],
    ['1.3.1 Tanah',                    '1.3.1.11.01.01.001', 'tidak'],
    ['1.3.5 Aset Tetap Lainnya',       '1.3.5.01.01.01.001', 'tidak'],
    ['1.3.6 KDP',                      '1.3.6.01.01.01.001', 'tidak'],
  ])('%s → %s', (_label, kode, harapan) => {
    expect(perlakuanKode(kode)).toBe(harapan)
  })

  it('golongan yang tak dikenal jatuh ke "tidak" (fail-closed)', () => {
    expect(perlakuanKode('9.9.9.01.01.01.001')).toBe('tidak')
    expect(perlakuanKode('')).toBe('tidak')
  })

  it('hanya melihat level-3, sisa segmen tidak berpengaruh', () => {
    expect(perlakuanKode('1.3.2')).toBe('penyusutan')
    expect(perlakuanKode('1.3.2.99.99.99.999')).toBe('penyusutan')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('klasifikasiKomptabel', () => {
  it('nilai di ATAS batas → intrakomptabel', () => {
    expect(klasifikasiKomptabel(2_000_000, 1_000_000)).toBe('intra')
  })

  it('nilai di BAWAH batas → ekstrakomptabel', () => {
    expect(klasifikasiKomptabel(500_000, 1_000_000)).toBe('ekstra')
  })

  it('nilai TEPAT di batas → intrakomptabel (batasnya inklusif)', () => {
    expect(klasifikasiKomptabel(1_000_000, 1_000_000)).toBe('intra')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('kode tanpa batas terdaftar (%s) → default intra', (_l, batas) => {
    expect(klasifikasiKomptabel(1, batas)).toBe('intra')
  })

  it('batas nol membuat semua nilai jadi intra', () => {
    expect(klasifikasiKomptabel(0, 0)).toBe('intra')
  })

  it('invarian: hasilnya selalu salah satu dari dua nilai yang sah', () => {
    fc.assert(fc.property(
      fc.integer(), fc.option(fc.integer(), { nil: null }),
      (nilai, batas) => ['intra', 'ekstra'].includes(klasifikasiKomptabel(nilai, batas)),
    ))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('parsePeriode & formatPeriode', () => {
  it('membaca periode yang sah', () => {
    expect(parsePeriode('2026-S1')).toEqual({ tahun: 2026, smt: 1 })
    expect(parsePeriode('2026-S2')).toEqual({ tahun: 2026, smt: 2 })
  })

  it.each([
    ['semester di luar 1/2', '2026-S3'],
    ['tahun kurang dari 4 digit', '26-S1'],
    ['huruf kecil', '2026-s1'],
    ['tanpa pemisah', '2026S1'],
    ['string kosong', ''],
    ['ada spasi di belakang', '2026-S1 '],
  ])('MELEMPAR untuk %s', (_label, buruk) => {
    expect(() => parsePeriode(buruk)).toThrow(/Format periode tidak valid/)
  })

  it('bolak-balik parse↔format tidak mengubah apa pun', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1000, max: 9999 }), fc.constantFrom(1, 2),
      (tahun, smt) => {
        const s = `${tahun}-S${smt}`
        return formatPeriode(parsePeriode(s)) === s
      },
    ))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('nextPeriode & previousPeriode', () => {
  it('S1 → S2 di tahun yang sama', () => {
    expect(nextPeriode({ tahun: 2026, smt: 1 })).toEqual({ tahun: 2026, smt: 2 })
  })

  it('S2 → S1 tahun berikutnya (ganti tahun)', () => {
    expect(nextPeriode({ tahun: 2026, smt: 2 })).toEqual({ tahun: 2027, smt: 1 })
  })

  it('mundur dari S1 menyeberang ke S2 tahun sebelumnya', () => {
    expect(previousPeriode({ tahun: 2026, smt: 1 })).toEqual({ tahun: 2025, smt: 2 })
  })

  it('maju lalu mundur selalu kembali ke titik semula', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1000, max: 9998 }), fc.constantFrom(1 as const, 2 as const),
      (tahun, smt) => {
        const p = { tahun, smt }
        return JSON.stringify(previousPeriode(nextPeriode(p))) === JSON.stringify(p)
      },
    ))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('comparePeriode', () => {
  it('membandingkan dalam tahun yang sama', () => {
    expect(comparePeriode('2026-S1', '2026-S2')).toBe(-1)
    expect(comparePeriode('2026-S2', '2026-S1')).toBe(1)
  })

  it('periode identik → 0', () => {
    expect(comparePeriode('2026-S1', '2026-S1')).toBe(0)
  })

  it('S2 tahun lalu lebih kecil dari S1 tahun ini', () => {
    expect(comparePeriode('2025-S2', '2026-S1')).toBe(-1)
  })

  it('invarian: antisimetris & konsisten dengan urutan kronologis', () => {
    const periode = fc.tuple(fc.integer({ min: 2000, max: 2100 }), fc.constantFrom(1, 2))
      .map(([t, s]) => `${t}-S${s}`)

    fc.assert(fc.property(periode, periode, (a, b) => {
      // Ditulis sbg penjumlahan, bukan `toBe(-compare(b,a))`: negasi dari 0
      // menghasilkan -0, dan Object.is(-0, 0) itu false — perbandingannya
      // gagal untuk periode yang sama padahal jawabannya benar.
      expect(comparePeriode(a, b) + comparePeriode(b, a)).toBe(0)
      if (a === b) expect(comparePeriode(a, b)).toBe(0)
    }))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('periodeRange', () => {
  it('batas awal EKSKLUSIF, batas akhir INKLUSIF', () => {
    expect(periodeRange('2025-S2', '2026-S2')).toEqual(['2026-S1', '2026-S2'])
  })

  it('menyeberangi pergantian tahun dengan benar', () => {
    expect(periodeRange('2025-S1', '2027-S1'))
      .toEqual(['2025-S2', '2026-S1', '2026-S2', '2027-S1'])
  })

  it('rentang kosong kalau awal dan akhir sama', () => {
    expect(periodeRange('2026-S1', '2026-S1')).toEqual([])
  })

  it('rentang kosong kalau awal SESUDAH akhir (bukan melempar, bukan terbalik)', () => {
    expect(periodeRange('2027-S1', '2026-S1')).toEqual([])
  })

  it('invarian: hasilnya selalu urut menaik & tak ada yang kembar', () => {
    fc.assert(fc.property(
      fc.integer({ min: 2000, max: 2050 }), fc.constantFrom(1, 2), fc.integer({ min: 0, max: 40 }),
      (tahun, smt, maju) => {
        const awal = `${tahun}-S${smt}`
        const akhir = formatPeriode(
          Array.from({ length: maju }).reduce<{ tahun: number; smt: 1 | 2 }>(
            (p) => nextPeriode(p), { tahun, smt: smt as 1 | 2 }))
        const r = periodeRange(awal, akhir)

        expect(r).toHaveLength(maju)
        expect(new Set(r).size).toBe(r.length)
        expect(r.every((p, i) => i === 0 || comparePeriode(r[i - 1], p) < 0)).toBe(true)
      },
    ))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('periodeDariTanggal', () => {
  it.each([
    ['1 Januari  → S1', '2026-01-01', '2026-S1'],
    ['30 Juni    → S1 (batas akhir semester 1)', '2026-06-30', '2026-S1'],
    ['1 Juli     → S2 (batas awal semester 2)', '2026-07-01', '2026-S2'],
    ['31 Desember→ S2', '2026-12-31', '2026-S2'],
  ])('%s', (_label, tanggal, harapan) => {
    expect(periodeDariTanggal(tanggal)).toBe(harapan)
  })

  it('menerima objek Date, bukan cuma string', () => {
    expect(periodeDariTanggal(new Date(2026, 5, 30))).toBe('2026-S1') // 30 Jun
    expect(periodeDariTanggal(new Date(2026, 6, 1))).toBe('2026-S2')  // 1 Jul
  })

  it('DUGAAN BUG: hasilnya ikut ZONA WAKTU mesin, bukan tanggal yang diberikan', () => {
    // `new Date('2026-01-01')` di-parse sebagai UTC tengah malam, tapi
    // getFullYear()/getMonth() membaca waktu LOKAL. Di zona yang di BELAKANG
    // UTC hasilnya meleset satu periode — bahkan satu TAHUN:
    //     TZ=America/New_York → periodeDariTanggal('2026-01-01') = '2025-S2'
    //     TZ=America/New_York → periodeDariTanggal('2026-07-01') = '2026-S1'
    // Diverifikasi langsung dengan node, bukan dugaan teoretis.
    //
    // TIDAK menggigit sekarang: pengguna di WIB (UTC+7) dan Vercel/CI di UTC —
    // dua-duanya benar, dan vitest.config.ts memaku TZ ke Asia/Jakarta supaya
    // test tidak ikut berubah-ubah. Tapi periode menentukan SEMESTER PEMBUKUAN;
    // kalau nanti ada proses yang jalan di zona lain, transaksi bisa masuk ke
    // semester — bahkan tahun buku — yang salah tanpa satu pun error.
    // Obatnya: baca segmen string-nya langsung, jangan lewat objek Date.
    const utc = new Date('2026-01-01T00:00:00Z')

    expect(periodeDariTanggal(utc)).toBe('2026-S1')       // benar di WIB & UTC
    expect(process.env.TZ).toBe('Asia/Jakarta')           // dipaku, bukan kebetulan
  })

  it('invarian: bulan Jan–Jun selalu S1, Jul–Des selalu S2', () => {
    fc.assert(fc.property(
      fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 0, max: 11 }), fc.integer({ min: 1, max: 28 }),
      (tahun, bulan, hari) => {
        const hasil = periodeDariTanggal(new Date(tahun, bulan, hari))
        return hasil === `${tahun}-S${bulan < 6 ? 1 : 2}`
      },
    ))
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('asalUsulTampil', () => {
  it('isian operator MENANG atas label turunan', () => {
    expect(asalUsulTampil('Pengadaan APBD 2024', 'pengadaan'))
      .toEqual({ teks: 'Pengadaan APBD 2024', turunan: false })
  })

  it('jatuh ke label cara perolehan kalau isian kosong', () => {
    expect(asalUsulTampil(null, 'hibah_masuk')).toEqual({ teks: 'Hibah', turunan: true })
  })

  it('isian berisi spasi saja dianggap kosong', () => {
    expect(asalUsulTampil('   ', 'pengadaan')).toEqual({ teks: 'Pengadaan', turunan: true })
  })

  it('memangkas spasi di tepi isian operator', () => {
    expect(asalUsulTampil('  Hibah Provinsi  ', null))
      .toEqual({ teks: 'Hibah Provinsi', turunan: false })
  })

  it('dua-duanya kosong → teks kosong, tetap ditandai turunan', () => {
    expect(asalUsulTampil(null, null)).toEqual({ teks: '', turunan: true })
  })

  it('cara perolehan yang tak dikenal tidak memunculkan "undefined" di layar', () => {
    expect(asalUsulTampil(null, 'entah_apa')).toEqual({ teks: '', turunan: true })
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('gabungKode', () => {
  it('menggabung tujuh segmen jadi kode e-BMD', () => {
    expect(gabungKode(['1', '3', '2', '05', '01', '05', '068'])).toBe('1.3.2.05.01.05.068')
  })

  it('membuang segmen null/undefined/kosong, bukan menyisakan titik ganda', () => {
    expect(gabungKode(['1', '3', null, '2', undefined, '', '  '])).toBe('1.3.2')
  })

  it('memangkas spasi tiap segmen', () => {
    expect(gabungKode([' 1 ', ' 3 ', ' 2 '])).toBe('1.3.2')
  })

  it('menerima angka, bukan cuma string', () => {
    expect(gabungKode([1, 3, 2, 5])).toBe('1.3.2.5')
  })

  it('angka NOL tetap ikut — bukan dianggap kosong', () => {
    expect(gabungKode([1, 0, 2])).toBe('1.0.2')
  })

  it('daftar kosong → string kosong', () => {
    expect(gabungKode([])).toBe('')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Konsistensi antar konstanta kembar (rules.md §5.5).
// ════════════════════════════════════════════════════════════════════════════
describe('konsistensi konstanta', () => {
  it('GOLONGAN_REKAP memuat golongan yang sama persis dengan GOLONGAN_DAFTAR_BARANG', () => {
    expect(GOLONGAN_REKAP.map(g => g.kode)).toEqual(GOLONGAN_DAFTAR_BARANG)
  })

  it.each(
    GOLONGAN_REKAP.filter(g => g.kode !== '1.5.4').map(g => [g.kode, g.uraian, g.disusutkan] as const),
  )('%s %s: flag disusutkan cocok dengan perlakuanKode', (kode, _uraian, disusutkan) => {
    expect(perlakuanKode(kode) !== 'tidak').toBe(disusutkan)
  })

  it('DUGAAN BUG: 1.5.4 ditandai disusutkan=true padahal engine tak pernah mengakrualkannya', () => {
    // `perlakuanKode('1.5.4') === 'lain_lain'`, dan engine memblokir akrual utk
    // 'lain_lain' (guard `perlakuan !== 'lain_lain'`, keputusan user 2026-07-13
    // — 1.5.4 BEKU). Jadi bebannya selalu nol, tapi flag ini bilang sebaliknya.
    // Dampaknya nyata: CLAUDE.md menyebut flag `disusutkan` dipakai Daftar
    // Barang Awal utk memutuskan apakah kolom penyusutan dibuat — utk 1.5.4
    // kolomnya dibuat lalu selalu berisi nol. Sekerabat dgn temuan Fase 0.2
    // (1.5.4 tetap berlabel metode 'penyusutan'). Komentar di lib/bmd.ts
    // ("disusutkan, stop saat reklas masuk") mencerminkan aturan LAMA sebelum
    // keputusan 2026-07-13.
    const lain = GOLONGAN_REKAP.find(g => g.kode === '1.5.4')!

    expect(lain.disusutkan).toBe(true)
    expect(perlakuanKode('1.5.4')).toBe('lain_lain')
  })

  it('CARA_PEROLEHAN_LABEL memuat PERSIS nilai CHECK aset.cara_perolehan di DB', () => {
    // Kembar dengan CHECK di migrasi 20260707_02. Nambah cara perolehan baru =
    // ubah CHECK + konstanta ini + menunya (CLAUDE.md).
    expect(Object.keys(CARA_PEROLEHAN_LABEL).sort()).toEqual([
      'hasil_inventarisasi', 'hibah_masuk', 'pengadaan',
      'perolehan_lainnya', 'saldo_awal', 'tukar_menukar',
    ])
  })

  it('tiap label cara perolehan terisi, tak ada string kosong', () => {
    expect(Object.values(CARA_PEROLEHAN_LABEL).every(v => v.trim().length > 0)).toBe(true)
  })

  it('regresi 2026-08-05: JENIS_PEROLEHAN memuat KELIMA cara perolehan, termasuk tukar_menukar', () => {
    // `tukar_menukar` jenis ledger yang SAH (enum migrasi 20260707_02), punya
    // menu input & menu laporannya sendiri, tapi sempat absen dari daftar ini
    // DAN dari daftar baseline perolehan di engine — akibatnya barang hasil
    // tukar menukar tak pernah disusutkan. Ditambal 2026-08-05 saat produksi
    // masih 0 baris, jadi nol angka yang sudah dilaporkan berubah.
    expect([...JENIS_PEROLEHAN].sort()).toEqual([
      'hasil_inventarisasi', 'hibah_masuk', 'pengadaan',
      'perolehan_lainnya', 'tukar_menukar',
    ])
  })

  it('JENIS_PEROLEHAN sepasang dengan CARA_PEROLEHAN_LABEL (selisihnya cuma saldo_awal)', () => {
    // Pengunci yang sesungguhnya, bukan cuma daftar yang dieja ulang: begitu
    // ada cara perolehan KEENAM ditambahkan ke salah satu sisi dan lupa di
    // sisi lain, test ini merah. `saldo_awal` sengaja hanya ada di LABEL —
    // ia asal-usul baseline e-BMD, bukan jenis ledger perolehan.
    //
    // ⚠️ Yang MASIH belum terjaga siapa pun: `JENIS_CARA` (lib/rekon.ts),
    // `JENIS_CARA_PEROLEHAN` (pelaporan/bmd/page.tsx), dan `CARA_LIST`
    // (dashboard/CaraPerolehanCards.tsx) mengulang daftar yang sama. Per
    // 2026-08-05 ketiganya SUDAH benar (diverifikasi manual), tapi tak ada
    // mekanisme yang menahannya kalau nanti bergeser — lihat REFACTOR-PLAN 0.4b.
    const dariLabel = Object.keys(CARA_PEROLEHAN_LABEL).filter(k => k !== 'saldo_awal')

    expect(dariLabel.sort()).toEqual([...JENIS_PEROLEHAN].sort())
  })

  it('DUGAAN BUG: 14 jenis ledger tidak punya label tampilan', () => {
    // JENIS_TRANSAKSI_LABEL ketinggalan dari enum: tiap `ALTER TYPE … ADD
    // VALUE` sejak migrasi 20260707_02 menambah jenis baru tanpa menambah
    // labelnya. Akibatnya baris ledger itu tampil tanpa nama di KIBAR & layar
    // riwayat transaksi.
    //
    // Ini cacat TAMPILAN, bukan angka — jauh lebih ringan dari dua DUGAAN BUG
    // di atas. Tapi ia contoh persis pola yang diperingatkan rules.md §5.5:
    // konstanta kembar (enum DB ↔ peta label) yang cuma dijaga ingatan.
    //
    // Daftar ini SENGAJA dieja satu per satu, bukan dihitung otomatis: begitu
    // ada yang menambah label, test ini merah dan pemiliknya wajib mencoret
    // barisnya — itu satu-satunya cara daftar ini ikut menyusut.
    const tanpaLabel = [
      'akumulasi_kdp', 'batal_akumulasi_kdp',
      'batal_hasil_inventarisasi', 'batal_hibah_masuk', 'batal_perolehan_lainnya',
      'batal_koreksi_nilai', 'batal_koreksi_pencatatan_ganda', 'batal_koreksi_spesifikasi',
      'batal_pengalihan', 'batal_reklas',
      'batal_tukar_menukar',
      'kdp_selesai_keluar', 'kdp_selesai_masuk',
      'saldo_awal_checkpoint',
    ]

    expect(tanpaLabel.filter(j => j in JENIS_TRANSAKSI_LABEL)).toEqual([])
  })

  it('semua jenis di JENIS_PEROLEHAN & JENIS_PENGHAPUSAN punya label', () => {
    for (const j of [...JENIS_PEROLEHAN, ...JENIS_PENGHAPUSAN])
      expect(JENIS_TRANSAKSI_LABEL[j], `label hilang untuk "${j}"`).toBeTruthy()
  })
})
