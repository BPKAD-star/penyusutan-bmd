// ============================================================================
// Periode-periode Laporan BMD — diturunkan dari (tahun, semester) yang dipilih.
//
// Diangkat dari `LaporanBmdPage` 2026-09-16 (REFACTOR-PLAN Fase 3). LAPIS 1:
// keempat nilai di sini menentukan RENTANG yang dibaca `fn_rekap_bmd` &
// `computeMutasiLines`, jadi satu saja yang bergeser membuat Laporan BMD
// melaporkan periode yang bukan itu — dengan angka yang tetap terlihat wajar.
// Sampai hari ini aturannya hidup sebagai empat baris turunan di dalam
// komponen & tak punya satu pun test.
//
// ── Aturan (keputusan user 2026-08-10) ────────────────────────────────────
// Saldo Awal mengikuti JENIS laporannya, BUKAN selalu semester sebelumnya:
//
//   Semester I   → saldo awal TAHUN ({tahun-1}-S2), mutasi = S1
//   Semester II  → saldo akhir S1   ({tahun}-S1),   mutasi = S2
//   Akhir Tahun  → saldo awal TAHUN ({tahun-1}-S2), mutasi = S1 + S2
//
// ⚠️ Saldo awal tahun sengaja diambil lewat `fn_rekap_bmd({tahun-1}-S2)`,
// BUKAN dari tabel `aset_awal_2026`: dua ujung laporan harus dilihat dengan
// LENSA YANG SAMA, kalau tidak selisihnya tak akan pernah bisa
// direkonsiliasi. Diverifikasi 2026-08-10 — keduanya cuma beda 14.000.000 /
// 3 barang, ketiganya sudah teridentifikasi (INS-20).
//
// ⚠️ `'TH'` (Akhir Tahun) HANYA berarti sesuatu di Model 3. Model 1 & 2
// laporan POSISI "s.d. periode", jadi di sana akhir tahun = Semester II —
// itulah `smtEfektif`. Menghapus pemetaan itu membuat `fn_rekap_bmd` dipanggil
// dengan periode `2026-STH` yang tak pernah ada, dan hasilnya kosong, bukan
// error.
// ============================================================================

/** '1' | '2' = semester; 'TH' = Akhir Tahun (hanya Model 3). */
export type SemesterBmd = '1' | '2' | 'TH'

export type PeriodeLaporanBmd = {
  /** Semester untuk Model 1 & 2 — 'TH' dipetakan ke '2'. */
  smtEfektif: '1' | '2'
  /** Periode posisi (Model 1 & 2, dan ujung AKHIR Model 3). */
  periode: string
  /** Ujung AWAL Model 3. */
  periodeAwal: string
  /** Periode ledger yang ditarik sebagai mutasi (Akhir Tahun = dua). */
  periodeMutasi: string[]
  /** Label di kop lembar & judul tabel. */
  labelPeriode: string
}

export function periodeLaporanBmd(tahun: string, smt: SemesterBmd): PeriodeLaporanBmd {
  const smtEfektif: '1' | '2' = smt === 'TH' ? '2' : smt
  const periode = `${tahun}-S${smtEfektif}`
  // ⚠️ Cabangnya `smt === '2'`, BUKAN `smtEfektif === '2'` — dan itu justru
  // intinya: Akhir Tahun memakai periode POSISI Semester II tapi saldo
  // AWAL-nya tetap awal tahun, karena mutasinya sepanjang tahun. Memakai
  // `smtEfektif` di sini membuat Model 3 Akhir Tahun kehilangan seluruh
  // mutasi Semester I dari sisi saldo awalnya, dan lembarnya tetap foot.
  const periodeAwal = smt === '2' ? `${tahun}-S1` : `${Number(tahun) - 1}-S2`
  const periodeMutasi = smt === 'TH' ? [`${tahun}-S1`, `${tahun}-S2`] : [periode]
  const labelPeriode = smt === 'TH' ? `${tahun} (setahun)` : periode
  return { smtEfektif, periode, periodeAwal, periodeMutasi, labelPeriode }
}
