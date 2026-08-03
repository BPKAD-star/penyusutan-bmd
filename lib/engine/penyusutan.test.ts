// ============================================================================
// Test engine penyusutan — REFACTOR-PLAN.md Fase 0.2.
//
// Kenapa berkas ini duluan (TESTING.md §11): `hitungJadwalAset` sudah berupa
// fungsi murni sehingga bisa diuji tanpa refactor sama sekali; ia menghitung
// SETIAP angka yang dilaporkan ke inspektorat & BPK; dan kalau ia salah,
// salahnya TIDAK terlihat siapa pun sampai ada yang mencocokkan neraca.
//
// Test di sini bersifat KARAKTERISASI: ia mengunci perilaku yang berlaku
// sekarang, termasuk yang terasa mengejutkan (ditandai "karakterisasi:").
// Kalau salah satunya ternyata bug, perbaikannya PR tersendiri — test ini
// yang akan menunjukkan persis apa yang berubah.
// ============================================================================
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  hitungJadwalAset, cariBand, kodeDisusutkan,
  type TrxLedger, type AsetEngine, type BandOverhaul,
} from './penyusutan'

// ── Pembangun data uji ──────────────────────────────────────────────────────

const KODE_PM     = '1.3.2.02.01.02.003' // Peralatan & Mesin  → penyusutan
const KODE_GEDUNG = '1.3.3.01.01.01.001' // Gedung & Bangunan  → penyusutan
const KODE_TANAH  = '1.3.1.11.01.01.001' // Tanah              → tidak
const KODE_ATL    = '1.3.5.01.01.01.001' // Aset Tetap Lainnya → tidak
const KODE_KDP    = '1.3.6.01.01.01.001' // KDP                → tidak
const KODE_ATB    = '1.5.3.01.01.01.001' // Aset Tidak Berwujud→ amortisasi
const KODE_LAIN   = '1.5.4.01.01.01.001' // Aset Lain-Lain     → lain_lain (BEKU)

const aset = (over: Partial<AsetEngine> = {}): AsetEngine => ({
  id: 'aset-1',
  kode: KODE_PM,
  nilai_perolehan: 10_000_000,
  intra_ekstra: 'intra',
  tgl_perolehan: '2026-01-10',
  ...over,
})

const trx = (over: Partial<TrxLedger> & Pick<TrxLedger, 'jenis' | 'periode'>): TrxLedger => ({
  tanggal: `${over.periode.slice(0, 4)}-0${over.periode.endsWith('S1') ? '3' : '9'}-01`,
  nilai: 0,
  payload: {},
  created_at: `${over.periode.slice(0, 4)}-01-01T00:00:00Z`,
  ...over,
})

/** Baris `saldo_awal`/`saldo_awal_checkpoint` — dua-duanya berbentuk sama. */
const baseline = (o: {
  jenis?: 'saldo_awal' | 'saldo_awal_checkpoint'
  periode?: string
  nilaiPerolehan?: number
  nilaiBuku?: number
  akumulasi?: number
  sisaSmt?: number
  masaSmt?: number
  bebanSmt?: number
} = {}): TrxLedger => trx({
  jenis: o.jenis ?? 'saldo_awal',
  periode: o.periode ?? '2025-S2',
  nilai: o.nilaiPerolehan ?? 100_000_000,
  payload: {
    nilai_buku_awal: o.nilaiBuku ?? 60_000_000,
    akumulasi_2025: o.akumulasi ?? 40_000_000,
    sisa_masa_manfaat_smt: o.sisaSmt ?? 6,
    masa_manfaat_smt: o.masaSmt ?? 20,
    beban_per_smt: o.bebanSmt ?? 10_000_000,
  },
})

const pengadaan = (periode = '2026-S1', nilai = 10_000_000): TrxLedger =>
  trx({ jenis: 'pengadaan', periode, nilai })

const masa = (kode: string, tahun: number) => new Map([[kode, tahun]])

const jalankan = (
  a: AsetEngine,
  trxs: TrxLedger[],
  masaMap: Map<string, number>,
  target: string,
  bands: BandOverhaul[] = [],
) => hitungJadwalAset(a, trxs, masaMap, bands, target)

// ════════════════════════════════════════════════════════════════════════════
describe('cariBand', () => {
  const bands: BandOverhaul[] = [
    { kode_prefix: '1.3.2',    band_no: 1, pct_min: 0,  pct_max: 30,   tambahan_tahun: 1 },
    { kode_prefix: '1.3.2',    band_no: 2, pct_min: 30, pct_max: null, tambahan_tahun: 2 },
    { kode_prefix: '1.3.2.02', band_no: 1, pct_min: 0,  pct_max: 100,  tambahan_tahun: 5 },
  ]

  it('memilih prefix TERPANJANG yang cocok, bukan yang pertama ketemu', () => {
    expect(cariBand(bands, '1.3.2.02.01', 10)?.tambahan_tahun).toBe(5)
  })

  it('memilih band pertama yang batas atasnya masih menampung persen rehab', () => {
    expect(cariBand(bands, '1.3.2.99', 20)?.tambahan_tahun).toBe(1)
  })

  it('jatuh ke band open-ended (pct_max null) kalau persen melewati semua batas', () => {
    expect(cariBand(bands, '1.3.2.99', 250)?.tambahan_tahun).toBe(2)
  })

  it('memakai batas ATAS secara inklusif — persen tepat di batas masuk band itu', () => {
    expect(cariBand(bands, '1.3.2.99', 30)?.tambahan_tahun).toBe(1)
  })

  it('mengembalikan null kalau tidak ada prefix yang cocok', () => {
    expect(cariBand(bands, '1.3.1.01', 10)).toBeNull()
  })

  it('jatuh ke band TERAKHIR kalau semua band berbatas atas dan persen melewati semuanya', () => {
    // Tanpa band open-ended (pct_max null) sama sekali — pengaman terakhir
    // supaya rehab sangat besar tetap dapat band, bukan null.
    const berbatas: BandOverhaul[] = [
      { kode_prefix: '1.3.2', band_no: 1, pct_min: 0,  pct_max: 30, tambahan_tahun: 1 },
      { kode_prefix: '1.3.2', band_no: 2, pct_min: 30, pct_max: 60, tambahan_tahun: 2 },
    ]

    expect(cariBand(berbatas, '1.3.2.01', 500)?.tambahan_tahun).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('kodeDisusutkan', () => {
  it('menandai golongan yang disusutkan / diamortisasi', () => {
    expect(kodeDisusutkan(KODE_PM)).toBe(true)
    expect(kodeDisusutkan(KODE_GEDUNG)).toBe(true)
    expect(kodeDisusutkan(KODE_ATB)).toBe(true)
    expect(kodeDisusutkan(KODE_LAIN)).toBe(true)
  })

  it('menandai Tanah, ATL, dan KDP sebagai tidak disusutkan', () => {
    expect(kodeDisusutkan(KODE_TANAH)).toBe(false)
    expect(kodeDisusutkan(KODE_ATL)).toBe(false)
    expect(kodeDisusutkan(KODE_KDP)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — baseline & bail-out', () => {
  it('mengembalikan jadwal KOSONG kalau aset belum punya jejak apa pun di ledger', () => {
    expect(jalankan(aset(), [], masa(KODE_PM, 5), '2030-S2')).toEqual([])
  })

  it.each([
    ['Tanah', KODE_TANAH],
    ['Aset Tetap Lainnya', KODE_ATL],
    ['KDP', KODE_KDP],
  ])('bail-out untuk %s walau baseline-nya ada', (_label, kode) => {
    const hasil = jalankan(aset({ kode }), [baseline()], masa(kode, 5), '2027-S2')

    expect(hasil).toEqual([])
  })

  it('memakai kode TERKINI aset untuk bail-out, bukan kode saat baseline', () => {
    // Aset yang sekarang Gedung tapi dulu KDP tidak boleh ikut bail-out —
    // periode sebelum reklas memang tak berakrual, tapi sesudahnya harus jalan.
    const hasil = jalankan(
      aset({ kode: KODE_GEDUNG }),
      [
        baseline({ nilaiPerolehan: 500_000_000, nilaiBuku: 500_000_000, akumulasi: 0, sisaSmt: 0, masaSmt: 0, bebanSmt: 0 }),
        trx({ jenis: 'reklas_golongan', periode: '2026-S2', id: 31,
              payload: { kode_lama: KODE_KDP, kode_baru: KODE_GEDUNG } }),
      ],
      masa(KODE_GEDUNG, 20),
      '2027-S2',
    )

    expect(hasil).not.toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — penyusutan garis lurus', () => {
  it('menyusutkan rata dan memaksa nilai buku 0 di semester terakhir', () => {
    const hasil = jalankan(aset(), [pengadaan()], masa(KODE_PM, 5), '2030-S2')

    expect(hasil).toHaveLength(10)                    // 5 tahun × 2 semester
    expect(hasil[0].periode).toBe('2026-S1')          // mulai di semester perolehan
    expect(hasil[0].beban).toBe(1_000_000)
    expect(hasil.at(-1)!.nilai_buku_akhir).toBe(0)
    expect(hasil.at(-1)!.sisa_semester).toBe(0)
    expect(hasil.at(-1)!.akumulasi).toBe(10_000_000)
  })

  it('menyerap selisih pembulatan di semester TERAKHIR, bukan menetes tiap semester', () => {
    // 10.000.000 / 3 semester = 3.333.333,33 → dua semester dibulatkan ke bawah,
    // sisanya diserap sekaligus di semester terakhir (§6.3).
    const hasil = jalankan(aset(), [pengadaan()], masa(KODE_PM, 1.5), '2027-S1')

    expect(hasil.map(r => r.beban)).toEqual([3_333_333, 3_333_333, 3_333_334])
    expect(hasil.reduce((s, r) => s + r.beban, 0)).toBe(10_000_000)
    expect(hasil.at(-1)!.nilai_buku_akhir).toBe(0)
  })

  it('menyambung nilai buku antar semester tanpa celah', () => {
    const hasil = jalankan(aset(), [pengadaan()], masa(KODE_PM, 5), '2030-S2')

    for (let i = 1; i < hasil.length; i++) {
      expect(hasil[i].nilai_buku_awal).toBe(hasil[i - 1].nilai_buku_akhir)
    }
  })

  it('melanjutkan baseline saldo awal e-BMD, bukan menghitung ulang dari perolehan', () => {
    const hasil = jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

    expect(hasil).toHaveLength(4)                     // 2026-S1 … 2027-S2
    expect(hasil[0].nilai_buku_awal).toBe(60_000_000) // dari payload, bukan nilai perolehan
    expect(hasil[0].beban).toBe(10_000_000)
    expect(hasil[0].akumulasi).toBe(50_000_000)       // 40jt bawaan + 10jt semester ini
    expect(hasil[0].sisa_semester).toBe(5)            // 6 − 1
  })

  it('mulai akrual di semester perolehan itu sendiri untuk pengadaan setelah 2026-S1', () => {
    const hasil = jalankan(aset(), [pengadaan('2027-S2')], masa(KODE_PM, 5), '2028-S2')

    expect(hasil[0].periode).toBe('2027-S2')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — perlakuan per golongan', () => {
  it('IKUT menyusutkan barang ekstrakomptabel, identik dengan intra (keputusan user 2026-07-13)', () => {
    // Dulu engine bail-out `if (ekstra) return []`. Pemisahan "neraca cuma
    // intra" sekarang terjadi di LAPORAN, bukan di sini — jadi hasilnya wajib
    // sama persis. Konsekuensinya reklas_komptabel nol efek perhitungan.
    const ekstra = jalankan(aset({ intra_ekstra: 'ekstra' }), [pengadaan()], masa(KODE_PM, 5), '2030-S2')
    const intra  = jalankan(aset({ intra_ekstra: 'intra'  }), [pengadaan()], masa(KODE_PM, 5), '2030-S2')

    expect(ekstra).toEqual(intra)
  })

  it('MEMBEKUKAN golongan 1.5.4 Aset Lain-Lain — akumulasi lama tetap, beban baru nol', () => {
    const hasil = jalankan(aset({ kode: KODE_LAIN }), [baseline()], masa(KODE_LAIN, 10), '2027-S2')

    expect(hasil).not.toEqual([])
    expect(hasil.every(r => r.beban === 0)).toBe(true)
    expect(hasil.every(r => r.akumulasi === 40_000_000)).toBe(true)   // beku di angka baseline
    expect(hasil.every(r => r.nilai_buku_akhir === 60_000_000)).toBe(true)
  })

  it('karakterisasi: 1.5.4 tetap berlabel metode "penyusutan" walau bebannya selalu nol', () => {
    // Pembaca laporan bisa salah paham; dipin di sini supaya kalau nanti
    // labelnya diperbaiki, perubahannya disengaja dan terlihat.
    const hasil = jalankan(aset({ kode: KODE_LAIN }), [baseline()], masa(KODE_LAIN, 10), '2026-S2')

    expect(hasil[0].metode).toBe('penyusutan')
  })

  it('menandai Aset Tidak Berwujud sebagai amortisasi', () => {
    const hasil = jalankan(aset({ kode: KODE_ATB }), [pengadaan()], masa(KODE_ATB, 5), '2027-S2')

    expect(hasil.every(r => r.metode === 'amortisasi')).toBe(true)
    expect(hasil[0].beban).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — checkpoint tutup tahun', () => {
  it('memulai replay dari saldo_awal_checkpoint TERBARU, bukan dari baseline 2025', () => {
    const hasil = jalankan(
      aset(),
      [
        baseline({ periode: '2025-S2' }),
        baseline({ jenis: 'saldo_awal_checkpoint', periode: '2026-S2',
                   nilaiBuku: 40_000_000, akumulasi: 60_000_000, sisaSmt: 4, bebanSmt: 10_000_000 }),
      ],
      masa(KODE_PM, 10),
      '2027-S2',
    )

    expect(hasil.map(r => r.periode)).toEqual(['2027-S1', '2027-S2'])
    expect(hasil[0].nilai_buku_awal).toBe(40_000_000)   // angka checkpoint, bukan 2025
    expect(hasil[0].akumulasi).toBe(70_000_000)
  })

  it('tetap identik dengan perilaku lama untuk aset yang belum pernah di-checkpoint', () => {
    const hasil = jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

    expect(hasil[0].periode).toBe('2026-S1')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — kapitalisasi', () => {
  const bands: BandOverhaul[] = [
    { kode_prefix: '1.3.3', band_no: 1, pct_min: 0,  pct_max: 30,   tambahan_tahun: 5  },
    { kode_prefix: '1.3.3', band_no: 2, pct_min: 30, pct_max: null, tambahan_tahun: 10 },
  ]
  const asetGedung = aset({ kode: KODE_GEDUNG })

  it('menambah nilai & memperpanjang masa manfaat sesuai band overhaul', () => {
    const hasil = jalankan(
      asetGedung,
      [baseline(), trx({ jenis: 'kapitalisasi', periode: '2026-S1', id: 7, nilai: 30_000_000 })],
      masa(KODE_GEDUNG, 10),
      '2026-S2',
      bands,
    )

    // rehab 30jt / perolehan 100jt = 30% → band 1 (+5 tahun).
    // sisa 3 tahun + 5 = 8 tahun, di-cap ke max 10 → 16 semester.
    expect(hasil[0].nilai_perolehan).toBe(130_000_000)
    expect(hasil[0].sisa_semester).toBe(15)                  // 16 − 1 (akrual semester ini)
    expect(hasil[0].beban).toBe(Math.round(90_000_000 / 16)) // nilai buku baru ÷ sisa baru
  })

  it('memakai NILAI PEROLEHAN sebagai penyebut persen rehab, bukan nilai buku', () => {
    // 45jt terhadap perolehan 100jt = 45% → band 2. Terhadap nilai buku 60jt
    // hasilnya 75% — tetap band 2, jadi dibedakan lewat kasus di bawah batas.
    const hasil = jalankan(
      asetGedung,
      [baseline(), trx({ jenis: 'kapitalisasi', periode: '2026-S1', id: 7, nilai: 25_000_000 })],
      masa(KODE_GEDUNG, 10),
      '2026-S1',
      bands,
    )

    // 25jt/100jt = 25% → band 1 (+5 th). Kalau penyebutnya nilai buku 60jt,
    // 25/60 = 41,7% → band 2 (+10 th) dan sisa semester akan berbeda.
    expect(hasil[0].sisa_semester).toBe(15)   // (3+5 th, cap 10) × 2 = 16, −1
  })

  it('mengabaikan kapitalisasi yang dianulir lewat payload.target_trx_id', () => {
    const dianulir = jalankan(
      aset(),
      [
        baseline(),
        trx({ jenis: 'kapitalisasi',       periode: '2026-S1', id: 7, nilai: 30_000_000 }),
        trx({ jenis: 'batal_kapitalisasi', periode: '2026-S1', id: 8, tanggal: '2026-03-05',
              payload: { target_trx_id: 7 } }),
      ],
      masa(KODE_PM, 10),
      '2027-S2',
    )
    const polos = jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

    expect(dianulir).toEqual(polos)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — koreksi nilai', () => {
  it('menyebar ulang beban ke sisa umur setelah koreksi nilai', () => {
    const hasil = jalankan(
      aset(),
      [baseline(), trx({ jenis: 'koreksi_nilai', periode: '2026-S1', id: 11, nilai: -12_000_000 })],
      masa(KODE_PM, 10),
      '2026-S1',
    )

    expect(hasil[0].nilai_perolehan).toBe(88_000_000)
    expect(hasil[0].beban).toBe(Math.round(48_000_000 / 6)) // nilai buku baru ÷ sisa 6 smt
  })

  it('mengabaikan koreksi nilai yang dianulir lewat payload.target_trx_id', () => {
    const dianulir = jalankan(
      aset(),
      [
        baseline(),
        trx({ jenis: 'koreksi_nilai',       periode: '2026-S1', id: 11, nilai: -12_000_000 }),
        trx({ jenis: 'batal_koreksi_nilai', periode: '2026-S1', id: 12, tanggal: '2026-03-05',
              payload: { target_trx_id: 11 } }),
      ],
      masa(KODE_PM, 10),
      '2027-S2',
    )
    const polos = jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

    expect(dianulir).toEqual(polos)
  })

  it('tidak pernah membuat nilai buku negatif walau koreksi melebihi nilai buku', () => {
    const hasil = jalankan(
      aset(),
      [baseline(), trx({ jenis: 'koreksi_nilai', periode: '2026-S1', id: 11, nilai: -999_000_000 })],
      masa(KODE_PM, 10),
      '2027-S2',
    )

    expect(hasil.every(r => r.nilai_buku_akhir >= 0)).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — event yang MENGHENTIKAN & yang MELANJUTKAN', () => {
  const sampai = '2027-S2'
  const jalankanDengan = (...events: TrxLedger[]) =>
    jalankan(aset(), [baseline(), ...events], masa(KODE_PM, 10), sampai)

  it.each([
    ['penghapusan_pemindahtanganan'],
    ['penghapusan_sebab_lain'],
    ['batal_pengadaan'],
    ['batal_hibah_masuk'],
    ['batal_tukar_menukar'],
    ['batal_hasil_inventarisasi'],
    ['batal_perolehan_lainnya'],
    ['koreksi_pencatatan_ganda'],
    ['kapitalisasi_serap'],
    ['pemecahan_keluar'],
    ['batal_pemecahan_masuk'],
  ])('%s menghentikan akrual sejak periode kejadiannya', (jenis) => {
    const hasil = jalankanDengan(trx({ jenis, periode: '2026-S2', id: 50 }))

    expect(hasil[0].beban).toBeGreaterThan(0)                          // 2026-S1 masih jalan
    expect(hasil.slice(1).every(r => r.beban === 0)).toBe(true)        // 2026-S2 dan seterusnya
  })

  it.each([
    ['batal_penghapusan',                'penghapusan_sebab_lain'],
    ['batal_kapitalisasi',               'kapitalisasi_serap'],
    ['batal_koreksi_pencatatan_ganda',   'koreksi_pencatatan_ganda'],
    ['batal_pemecahan',                  'pemecahan_keluar'],
  ])('%s melanjutkan akrual lagi setelah %s', (batal, henti) => {
    const hasil = jalankanDengan(
      trx({ jenis: henti, periode: '2026-S1', id: 50 }),
      trx({ jenis: batal, periode: '2026-S2', id: 51 }),
    )

    expect(hasil[0].beban).toBe(0)                 // 2026-S1 berhenti
    expect(hasil[1].beban).toBeGreaterThan(0)      // 2026-S2 hidup lagi
  })

  it.each([
    ['mutasi_internal'],
    ['pengalihan_status'],
    ['koreksi_spesifikasi'],
    ['reklas_komptabel'],
    ['pemanfaatan'],
    ['pemanfaatan_selesai'],
    ['batal_pemanfaatan'],
    ['pengamanan'],
    ['pengembalian_pengamanan'],
    ['batal_pengamanan'],
  ])('%s NETRAL — tidak mengubah satu angka pun', (jenis) => {
    const dengan = jalankanDengan(trx({ jenis, periode: '2026-S2', id: 60 }))
    const tanpa  = jalankan(aset(), [baseline()], masa(KODE_PM, 10), sampai)

    expect(dengan).toEqual(tanpa)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — reklasifikasi', () => {
  it('reklas_kode ke Aset Lain-Lain menghentikan penyusutan sejak periode itu', () => {
    const hasil = jalankan(
      aset(),
      [baseline(), trx({ jenis: 'reklas_kode', periode: '2026-S2', id: 21,
                        payload: { kode_baru: KODE_LAIN } })],
      masa(KODE_PM, 10),
      '2027-S2',
    )

    expect(hasil[0].beban).toBeGreaterThan(0)
    expect(hasil.slice(1).every(r => r.beban === 0)).toBe(true)
  })

  it('mengabaikan reklas yang dianulir lewat batal_reklas (fresh-start dibatalkan)', () => {
    const dianulir = jalankan(
      aset(),
      [
        baseline(),
        trx({ jenis: 'reklas_kode',  periode: '2026-S2', id: 21, payload: { kode_baru: KODE_LAIN } }),
        trx({ jenis: 'batal_reklas', periode: '2027-S1', id: 22, payload: { target_trx_id: 21 } }),
      ],
      masa(KODE_PM, 10),
      '2027-S2',
    )
    const polos = jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

    expect(dianulir).toEqual(polos)
  })

  it('reklas_golongan KDP→Gedung: beku sebelum reklas, fresh start sesudahnya', () => {
    const hasil = jalankan(
      aset({ kode: KODE_GEDUNG }),
      [
        baseline({ nilaiPerolehan: 500_000_000, nilaiBuku: 500_000_000,
                   akumulasi: 0, sisaSmt: 0, masaSmt: 0, bebanSmt: 0 }),
        trx({ jenis: 'reklas_golongan', periode: '2026-S2', id: 31,
              payload: { kode_lama: KODE_KDP, kode_baru: KODE_GEDUNG } }),
      ],
      masa(KODE_GEDUNG, 20),
      '2027-S2',
    )

    // Sebelum reklas masih KDP → tidak berakrual sama sekali.
    expect(hasil[0].periode).toBe('2026-S1')
    expect(hasil[0].beban).toBe(0)
    expect(hasil[0].metode).toBe('tidak')

    // Sejak reklas: masa manfaat direset PENUH dari kodefikasi tujuan (20 th =
    // 40 smt), nilai buku TIDAK direset.
    expect(hasil[1].metode).toBe('penyusutan')
    expect(hasil[1].masa_manfaat_tahun).toBe(20)
    expect(hasil[1].beban).toBe(Math.round(500_000_000 / 40))
    expect(hasil[1].sisa_semester).toBe(39)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — pemecahan barang', () => {
  it('pecahan mulai berakrual TEPAT di periode pemecahan (tanpa celah dengan induk)', () => {
    const hasil = jalankan(
      aset(),
      [trx({ jenis: 'pemecahan_masuk', periode: '2026-S1', nilai: 25_000_000,
             payload: { nilai_buku_awal: 15_000_000, akumulasi: 10_000_000,
                        sisa_masa_manfaat_smt: 4, masa_manfaat_smt: 10, beban_per_smt: 2_500_000 } })],
      masa(KODE_PM, 5),
      '2027-S1',
    )

    expect(hasil[0].periode).toBe('2026-S1')          // bukan 2026-S2
    expect(hasil[0].nilai_buku_awal).toBe(15_000_000) // baseline mid-life dari induk
    expect(hasil[0].beban).toBe(2_500_000)
    expect(hasil[0].akumulasi).toBe(12_500_000)
  })

  it('checkpoint tutup tahun MENANG atas baseline pemecahan yang lebih lama', () => {
    const hasil = jalankan(
      aset(),
      [
        trx({ jenis: 'pemecahan_masuk', periode: '2026-S1', nilai: 25_000_000,
              payload: { nilai_buku_awal: 15_000_000, akumulasi: 10_000_000,
                         sisa_masa_manfaat_smt: 4, masa_manfaat_smt: 10, beban_per_smt: 2_500_000 } }),
        baseline({ jenis: 'saldo_awal_checkpoint', periode: '2026-S2', nilaiPerolehan: 25_000_000,
                   nilaiBuku: 12_500_000, akumulasi: 12_500_000, sisaSmt: 3, masaSmt: 10, bebanSmt: 2_500_000 }),
      ],
      masa(KODE_PM, 5),
      '2027-S1',
    )

    expect(hasil[0].periode).toBe('2027-S1')
    expect(hasil[0].nilai_buku_awal).toBe(12_500_000)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — invarian (property-based)', () => {
  const cek = (nilai: number, tahun: number) =>
    jalankan(aset({ nilai_perolehan: nilai }), [pengadaan('2026-S1', nilai)], masa(KODE_PM, tahun), '2050-S2')

  it('nilai buku tidak pernah negatif dan beban tidak pernah negatif', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => cek(nilai, tahun).every(r => r.nilai_buku_akhir >= 0 && r.beban >= 0),
    ), { numRuns: 300 })
  })

  it('akumulasi tidak pernah melebihi nilai perolehan', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => cek(nilai, tahun).every(r => r.akumulasi <= r.nilai_perolehan),
    ), { numRuns: 300 })
  })

  it('akumulasi akhir SAMA PERSIS dengan jumlah seluruh beban (tak ada rupiah tercecer)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => {
        const h = cek(nilai, tahun)
        return h.at(-1)!.akumulasi === h.reduce((s, r) => s + r.beban, 0)
      },
    ), { numRuns: 300 })
  })

  it('nilai buku bersambung antar semester', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => {
        const h = cek(nilai, tahun)
        return h.every((r, i) => i === 0 || r.nilai_buku_awal === h[i - 1].nilai_buku_akhir)
      },
    ), { numRuns: 300 })
  })

  it('sisa semester turun tepat 1 tiap ada beban, dan tak pernah negatif', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => {
        const h = cek(nilai, tahun)
        return h.every((r, i) =>
          r.sisa_semester >= 0 &&
          (i === 0 || r.sisa_semester === h[i - 1].sisa_semester - (r.beban > 0 ? 1 : 0)))
      },
    ), { numRuns: 300 })
  })

  it('barang tersusut habis: nilai buku 0 tepat saat sisa semester 0', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 5_000_000_000 }),
      fc.integer({ min: 1, max: 20 }),
      (nilai, tahun) => cek(nilai, tahun).at(-1)!.nilai_buku_akhir === 0,
    ), { numRuns: 300 })
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — payload cacat & event tak lengkap', () => {
  const polos = () => jalankan(aset(), [baseline()], masa(KODE_PM, 10), '2027-S2')

  it('mengabaikan kapitalisasi bernilai nol atau negatif', () => {
    const nol = jalankan(
      aset(),
      [baseline(), trx({ jenis: 'kapitalisasi', periode: '2026-S1', id: 7, nilai: 0 })],
      masa(KODE_PM, 10), '2027-S2',
    )

    expect(nol).toEqual(polos())
  })

  it.each([
    ['reklas_kode'],
    ['reklas_golongan'],
  ])('mengabaikan %s yang payload-nya tanpa kode_baru', (jenis) => {
    const cacat = jalankan(
      aset(),
      [baseline(), trx({ jenis, periode: '2026-S1', id: 21, payload: {} })],
      masa(KODE_PM, 10), '2027-S2',
    )

    expect(cacat).toEqual(polos())
  })

  it('karakterisasi: batal_* dengan target_trx_id bukan angka TIDAK menganulir apa pun', () => {
    // Number.isFinite menyaringnya, jadi kapitalisasinya tetap berlaku. Ini
    // kegagalan SENYAP — payload salah bentuk tak menghasilkan error apa pun.
    // Bentuk payload yang keliru sudah pernah jadi bug mahal di repo ini
    // (rules.md §1.7), jadi perilakunya dipin di sini.
    const hasil = jalankan(
      aset(),
      [
        baseline(),
        trx({ jenis: 'kapitalisasi',       periode: '2026-S1', id: 7, nilai: 30_000_000 }),
        trx({ jenis: 'batal_kapitalisasi', periode: '2026-S1', id: 8, tanggal: '2026-03-05',
              payload: { target_trx_ids: [7] } }),   // JAMAK — bentuk yang tidak dibaca engine
      ],
      masa(KODE_PM, 10), '2027-S2',
    )

    expect(hasil[0].nilai_perolehan).toBe(130_000_000)  // kapitalisasi TETAP berlaku
    expect(hasil).not.toEqual(polos())
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('hitungJadwalAset — karakterisasi pembulatan ekstrem', () => {
  it('karakterisasi: barang yang nilainya < jumlah semester TIDAK PERNAH menyusut', () => {
    // beban = round(nilai / sisaSmt) membulat jadi 0, lalu guard `beban > 0`
    // memblokir akrual selamanya. Tidak realistis untuk data BMD nyata (butuh
    // barang < Rp 40 dengan masa 20 tahun), tapi dipin supaya kalau nanti ada
    // yang mengubah aturan pembulatan, konsekuensinya terlihat.
    const hasil = jalankan(aset({ nilai_perolehan: 10 }), [pengadaan('2026-S1', 10)], masa(KODE_PM, 20), '2050-S2')

    expect(hasil.every(r => r.beban === 0)).toBe(true)
    expect(hasil.at(-1)!.nilai_buku_akhir).toBe(10)
  })
})
