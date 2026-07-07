// IPA ENGINE — Indeks Pengelolaan Aset
// Berdasarkan Kepmen Dalam Negeri No. 900.1.15-136 Tahun 2026
// Scope: Pengguna Barang (level SKPD)
// Formula: IPA = ST1 + ST2 + ST3 + ST4 (skala 0-4)
//
// Port verbatim dari src/lib/ipa-engine.ts di
// github.com/BPKAD-star/ipa-bmd-kediri — murni fungsi kalkulasi, tanpa
// ketergantungan DB, aman disalin apa adanya.

import type {
  Indeks,
  KelompokFPK,
  KategoriIPA,
  HasilParameter,
  HasilIPA,
  InputST1,
  InputST2,
  InputST3,
  InputST4,
  InputIPA,
} from './ipaTypes'

// ─────────────────────────────────────────────────────────────────────────
// Bobot parameter (Kepmen Lampiran I)
// ─────────────────────────────────────────────────────────────────────────

export const BOBOT: Record<string, number> = {
  'NP.1.1.1':   0.10,
  'NP.1.2.1':   0.10,
  'NP.2.3.1':   0.05,
  'NP.2.4.1':   0.20,
  'SP.2.4.1.1': 1 / 3,   // bobot dalam NP.2.4.1 (1/3 masing-masing)
  'SP.2.4.2.1': 1 / 3,
  'SP.2.4.3.1': 1 / 3,
  'NP.2.5.1':   0.05,
  'NP.3.6.1':   0.15,
  'NP.3.7.1':   0.20,
  'SP.3.7.1.1': 0.30,  // bobot dalam NP.3.7.1
  'SP.3.7.2.1': 0.40,
  'SP.3.7.3.1': 0.30,
  'NP.4.8.1':   0.15,
  'SP.4.8.1.1': 0.30,  // bobot dalam NP.4.8.1
  'SP.4.8.2.1': 0.30,
  'SP.4.8.3.1': 0.10,
  'SP.4.8.4.1': 0.10,
  'SP.4.8.5.1': 0.10,
  'SP.4.8.6.1': 0.10,
}

// Nilai maksimum tiap ST (untuk normalisasi display: 4 × bobot_total_ST)
export const ST_MAX = { ST1: 0.80, ST2: 1.20, ST3: 1.40, ST4: 0.60 }

// ─────────────────────────────────────────────────────────────────────────
// FPK — Faktor Penyesuai Kelompok
// ─────────────────────────────────────────────────────────────────────────

export function getFPK(kelompok: KelompokFPK, tipe: 'temuan' | 'laporan'): number {
  const tabel = {
    temuan:  { 1: 1.0, 2: 0.9, 3: 0.8, 4: 0.7 },
    laporan: { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1.0 },
  }
  return tabel[tipe][kelompok]
}

export function getKelompokFPK(totalUnit: number): KelompokFPK {
  if (totalUnit <= 25) return 1
  if (totalUnit <= 50) return 2
  if (totalUnit <= 75) return 3
  return 4
}

// ─────────────────────────────────────────────────────────────────────────
// Konversi persentase → indeks
// ─────────────────────────────────────────────────────────────────────────

export function konversiIndeks(persen: number, kode: string): Indeks {
  const sertifikasiParams = [
    'SP.4.8.1.1', 'SP.4.8.2.1', 'SP.4.8.3.1',
    'SP.4.8.4.1', 'SP.4.8.5.1', 'SP.4.8.6.1',
  ]

  if (sertifikasiParams.includes(kode)) {
    if (persen > 80)  return 4
    if (persen >= 60) return 3
    if (persen >= 40) return 2
    return 1
  }

  if (persen >= 100) return 4
  if (persen >= 70)  return 3
  if (persen >= 40)  return 2
  return 1
}

/**
 * Konversi tanggal penerimaan ke indeks berdasarkan batas waktu Kepmen.
 * Menggunakan batas waktu per periode kalender (minggu ke-N bulan M).
 */
export function konversiIndeksTanggal(
  tanggalTerima: Date | null,
  kode: 'NP.2.3.1' | 'NP.2.5.1' | 'SP.2.4.2.1' | 'SP.2.4.3.1',
  tahun: number,
): Indeks {
  if (!tanggalTerima) return 1

  // Hitung batas tanggal: hari ke (minggu × 7), diclamp ke hari terakhir bulan
  const batas = (bulan: number, minggu: number, thn = tahun): Date => {
    const hari = minggu * 7
    const lastDay = new Date(thn, bulan, 0).getDate()
    return new Date(thn, bulan - 1, Math.min(hari, lastDay))
  }

  const tgl = tanggalTerima

  if (kode === 'NP.2.3.1') {
    // < minggu ke-3 Juni → 4; s.d. ke-4 Juni → 3; s.d. minggu ke-1 Juli → 2; else → 1
    if (tgl < batas(6, 3))  return 4
    if (tgl <= batas(6, 4)) return 3
    if (tgl <= batas(7, 1)) return 2
    return 1
  }

  if (kode === 'SP.2.4.2.1') {
    // ≤ minggu ke-4 Juli → 4; ≤ minggu ke-2 Agt → 3; ≤ minggu ke-4 Agt → 2; else → 1
    if (tgl <= batas(7, 4)) return 4
    if (tgl <= batas(8, 2)) return 3
    if (tgl <= batas(8, 4)) return 2
    return 1
  }

  if (kode === 'SP.2.4.3.1') {
    const t1 = tahun + 1
    if (tgl <= batas(2, 2, t1)) return 4
    if (tgl <= batas(2, 4, t1)) return 3
    if (tgl <= batas(3, 2, t1)) return 2
    return 1
  }

  if (kode === 'NP.2.5.1') {
    const t1 = tahun + 1
    if (tgl <= batas(2, 4, t1)) return 4
    if (tgl <= batas(3, 2, t1)) return 3
    if (tgl <= batas(3, 4, t1)) return 2
    return 1
  }

  return 1
}

// ─────────────────────────────────────────────────────────────────────────
// ST1 — Akuntabilitas dan Produktivitas (bobot 20%)
// ─────────────────────────────────────────────────────────────────────────

export function hitungST1(input: InputST1): {
  np111: HasilParameter
  np121: HasilParameter
  st1_nilai: number
} {
  const fpk = getFPK(input.kelompok, 'temuan')

  const total111 = input.np111_total_tl - input.np111_tidak_dapat
  const persen111_raw = total111 > 0 ? (input.np111_sudah_tl / total111) * 100 : 100
  const persen111_fpk = persen111_raw * fpk
  const indeks111 = total111 === 0 ? 4 : konversiIndeks(persen111_fpk, 'NP.1.1.1')
  const bobot111 = BOBOT['NP.1.1.1']
  const np111: HasilParameter = {
    kode: 'NP.1.1.1',
    persen_raw: persen111_raw,
    persen_fpk: persen111_fpk,
    indeks: indeks111,
    bobot: bobot111,
    nilai_terbobot: indeks111 * bobot111,
  }

  const total121 = input.np121_total_tl - input.np121_tidak_dapat
  const persen121_raw = total121 > 0 ? (input.np121_sudah_tl / total121) * 100 : 100
  const persen121_fpk = persen121_raw * fpk
  const indeks121 = total121 === 0 ? 4 : konversiIndeks(persen121_fpk, 'NP.1.2.1')
  const bobot121 = BOBOT['NP.1.2.1']
  const np121: HasilParameter = {
    kode: 'NP.1.2.1',
    persen_raw: persen121_raw,
    persen_fpk: persen121_fpk,
    indeks: indeks121,
    bobot: bobot121,
    nilai_terbobot: indeks121 * bobot121,
  }

  return { np111, np121, st1_nilai: np111.nilai_terbobot + np121.nilai_terbobot }
}

// ─────────────────────────────────────────────────────────────────────────
// ST2 — Kepatuhan (bobot 30%)
// ─────────────────────────────────────────────────────────────────────────

export function hitungST2(input: InputST2): {
  np231: HasilParameter
  sp2411: HasilParameter
  sp2421: HasilParameter
  sp2431: HasilParameter
  np241: HasilParameter
  np251: HasilParameter
  st2_nilai: number
} {
  const fpk = getFPK(input.kelompok, 'laporan')

  // NP.2.3.1 — berbasis tanggal, tanpa FPK
  const indeks231 = konversiIndeksTanggal(input.np231_tanggal_terima, 'NP.2.3.1', input.tahun)
  const np231: HasilParameter = {
    kode: 'NP.2.3.1', persen_raw: null, persen_fpk: null,
    indeks: indeks231, bobot: BOBOT['NP.2.3.1'],
    nilai_terbobot: indeks231 * BOBOT['NP.2.3.1'],
  }

  // SP.2.4.1.1 — Laporan Bulanan: 12 bulan tepat → 4, 8-11 → 3, 4-7 → 2, 0-3 → 1
  const indeksBulanan = (n: number): Indeks => (n >= 12 ? 4 : n >= 8 ? 3 : n >= 4 ? 2 : 1)
  const indeks2411 = indeksBulanan(input.sp2411_jumlah_tepat)
  const indeks2411_fpk = indeks2411 * fpk
  const sp2411: HasilParameter = {
    kode: 'SP.2.4.1.1',
    persen_raw: (input.sp2411_jumlah_tepat / 12) * 100,
    persen_fpk: indeks2411_fpk,
    indeks: indeks2411,
    bobot: BOBOT['SP.2.4.1.1'],
    nilai_terbobot: indeks2411_fpk,
  }

  // SP.2.4.2.1 — Laporan Semester I
  const indeks2421 = konversiIndeksTanggal(input.sp2421_tanggal_terima, 'SP.2.4.2.1', input.tahun)
  const indeks2421_fpk = indeks2421 * fpk
  const sp2421: HasilParameter = {
    kode: 'SP.2.4.2.1', persen_raw: null, persen_fpk: indeks2421_fpk,
    indeks: indeks2421, bobot: BOBOT['SP.2.4.2.1'], nilai_terbobot: indeks2421_fpk,
  }

  // SP.2.4.3.1 — Laporan Akhir Tahun
  const indeks2431 = konversiIndeksTanggal(input.sp2431_tanggal_terima, 'SP.2.4.3.1', input.tahun)
  const indeks2431_fpk = indeks2431 * fpk
  const sp2431: HasilParameter = {
    kode: 'SP.2.4.3.1', persen_raw: null, persen_fpk: indeks2431_fpk,
    indeks: indeks2431, bobot: BOBOT['SP.2.4.3.1'], nilai_terbobot: indeks2431_fpk,
  }

  // NP.2.4.1 = rata-rata 3 subparameter setelah FPK
  const nilai241 = (indeks2411_fpk + indeks2421_fpk + indeks2431_fpk) / 3
  const np241: HasilParameter = {
    kode: 'NP.2.4.1', persen_raw: null, persen_fpk: null,
    indeks: Math.min(4, Math.max(1, Math.round(nilai241))) as Indeks,
    bobot: BOBOT['NP.2.4.1'],
    nilai_terbobot: nilai241 * BOBOT['NP.2.4.1'],
  }

  // NP.2.5.1 — berbasis tanggal, tanpa FPK
  const indeks251 = konversiIndeksTanggal(input.np251_tanggal_terima, 'NP.2.5.1', input.tahun)
  const np251: HasilParameter = {
    kode: 'NP.2.5.1', persen_raw: null, persen_fpk: null,
    indeks: indeks251, bobot: BOBOT['NP.2.5.1'],
    nilai_terbobot: indeks251 * BOBOT['NP.2.5.1'],
  }

  return {
    np231, sp2411, sp2421, sp2431, np241, np251,
    st2_nilai: np231.nilai_terbobot + np241.nilai_terbobot + np251.nilai_terbobot,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ST3 — Efektivitas Wasdalmen (bobot 35%)
// ─────────────────────────────────────────────────────────────────────────

export function hitungST3(input: InputST3): {
  np361: HasilParameter
  sp3711: HasilParameter
  sp3721: HasilParameter
  sp3731: HasilParameter
  np371: HasilParameter
  st3_nilai: number
} {
  const fpk_l = getFPK(input.kelompok, 'laporan')

  // NP.3.6.1 — akumulasi, tanpa FPK
  const total361 = input.np361_total_tl - input.np361_tidak_dapat
  const persen361 = total361 > 0 ? (input.np361_sudah_tl / total361) * 100 : 100
  const indeks361 = total361 === 0 ? 4 : konversiIndeks(persen361, 'NP.3.6.1')
  const np361: HasilParameter = {
    kode: 'NP.3.6.1', persen_raw: persen361, persen_fpk: persen361,
    indeks: indeks361, bobot: BOBOT['NP.3.6.1'],
    nilai_terbobot: indeks361 * BOBOT['NP.3.6.1'],
  }

  // SP.3.7.1.1 — Pemanfaatan/Penghapusan, FPK laporan
  let indeks3711: Indeks
  const persen3711_raw = input.sp3711_total > 0
    ? (input.sp3711_sudah_tl / input.sp3711_total) * 100 : 100
  if (input.sp3711_tidak_terdefinisi) {
    indeks3711 = 1
  } else {
    indeks3711 = konversiIndeks(persen3711_raw * fpk_l, 'SP.3.7.1.1')
  }
  const sp3711: HasilParameter = {
    kode: 'SP.3.7.1.1', persen_raw: persen3711_raw, persen_fpk: persen3711_raw * fpk_l,
    indeks: indeks3711, bobot: BOBOT['SP.3.7.1.1'],
    nilai_terbobot: indeks3711 * BOBOT['SP.3.7.1.1'],
  }

  // SP.3.7.2.1 — BMD Rusak Berat, FPK laporan
  const denom3721 = input.sp3721_saldo_awal + input.sp3721_mutasi_tambah
  let indeks3721: Indeks
  const persen3721_raw = denom3721 > 0 ? (input.sp3721_nilai_tl / denom3721) * 100 : 100
  if (input.sp3721_saldo_akhir_nol || denom3721 === 0) {
    indeks3721 = 4
  } else {
    indeks3721 = konversiIndeks(persen3721_raw * fpk_l, 'SP.3.7.2.1')
  }
  const sp3721: HasilParameter = {
    kode: 'SP.3.7.2.1', persen_raw: persen3721_raw, persen_fpk: persen3721_raw * fpk_l,
    indeks: indeks3721, bobot: BOBOT['SP.3.7.2.1'],
    nilai_terbobot: indeks3721 * BOBOT['SP.3.7.2.1'],
  }

  // SP.3.7.3.1 — KDP, FPK laporan
  const denom3731 = input.sp3731_saldo_awal + input.sp3731_mutasi_tambah - input.sp3731_nilai_multiyear
  let indeks3731: Indeks
  const persen3731_raw = denom3731 > 0 ? (input.sp3731_nilai_tl / denom3731) * 100 : 100
  if (input.sp3731_saldo_akhir_nol || denom3731 <= 0) {
    indeks3731 = 4
  } else {
    indeks3731 = konversiIndeks(persen3731_raw * fpk_l, 'SP.3.7.3.1')
  }
  const sp3731: HasilParameter = {
    kode: 'SP.3.7.3.1', persen_raw: persen3731_raw, persen_fpk: persen3731_raw * fpk_l,
    indeks: indeks3731, bobot: BOBOT['SP.3.7.3.1'],
    nilai_terbobot: indeks3731 * BOBOT['SP.3.7.3.1'],
  }

  // NP.3.7.1 = SP.3.7.1.1 × 30% + SP.3.7.2.1 × 40% + SP.3.7.3.1 × 30%
  const nilai371 = sp3711.nilai_terbobot + sp3721.nilai_terbobot + sp3731.nilai_terbobot
  const np371: HasilParameter = {
    kode: 'NP.3.7.1', persen_raw: null, persen_fpk: null,
    indeks: Math.min(4, Math.max(1, Math.round(nilai371))) as Indeks,
    bobot: BOBOT['NP.3.7.1'],
    nilai_terbobot: nilai371 * BOBOT['NP.3.7.1'],
  }

  return {
    np361, sp3711, sp3721, sp3731, np371,
    st3_nilai: np361.nilai_terbobot + np371.nilai_terbobot,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ST4 — Administrasi BMD yang Andal (bobot 15%)
// ─────────────────────────────────────────────────────────────────────────

export function hitungST4(input: InputST4): {
  sp4811: HasilParameter; sp4821: HasilParameter
  sp4831: HasilParameter; sp4841: HasilParameter
  sp4851: HasilParameter; sp4861: HasilParameter
  np481: HasilParameter
  st4_nilai: number
} {
  const hitungSP = (kode: string, sudah: number, total: number): HasilParameter => {
    const persen = total > 0 ? (sudah / total) * 100 : 0
    const indeks = konversiIndeks(persen, kode)
    const bobot = BOBOT[kode]
    return { kode, persen_raw: persen, persen_fpk: persen, indeks, bobot, nilai_terbobot: indeks * bobot }
  }

  const sp4811 = hitungSP('SP.4.8.1.1', input.sp4811_sudah, input.sp4811_total)
  const sp4821 = hitungSP('SP.4.8.2.1', input.sp4821_nilai_sudah, input.sp4821_nilai_total)
  const sp4831 = hitungSP('SP.4.8.3.1', input.sp4831_sudah, input.sp4831_total)
  const sp4841 = hitungSP('SP.4.8.4.1', input.sp4841_nilai_sudah, input.sp4841_nilai_total)
  const sp4851 = hitungSP('SP.4.8.5.1', input.sp4851_sudah, input.sp4851_total)
  const sp4861 = hitungSP('SP.4.8.6.1', input.sp4861_nilai_sudah, input.sp4861_nilai_total)

  const nilai481 =
    sp4811.nilai_terbobot + sp4821.nilai_terbobot +
    sp4831.nilai_terbobot + sp4841.nilai_terbobot +
    sp4851.nilai_terbobot + sp4861.nilai_terbobot
  const np481: HasilParameter = {
    kode: 'NP.4.8.1', persen_raw: null, persen_fpk: null,
    indeks: Math.min(4, Math.max(1, Math.round(nilai481))) as Indeks,
    bobot: BOBOT['NP.4.8.1'],
    nilai_terbobot: nilai481 * BOBOT['NP.4.8.1'],
  }

  return {
    sp4811, sp4821, sp4831, sp4841, sp4851, sp4861, np481,
    st4_nilai: np481.nilai_terbobot,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// hitungIPA — entry point utama
// ─────────────────────────────────────────────────────────────────────────

export function hitungIPA(input: InputIPA): HasilIPA {
  const h1 = hitungST1(input.st1)
  const h2 = hitungST2(input.st2)
  const h3 = hitungST3(input.st3)
  const h4 = hitungST4(input.st4)

  const ipa_final = h1.st1_nilai + h2.st2_nilai + h3.st3_nilai + h4.st4_nilai

  const kategori: KategoriIPA =
    ipa_final > 3 ? 'Sangat Baik' :
    ipa_final > 2 ? 'Baik' :
    ipa_final > 1 ? 'Cukup' :
    'Buruk'

  return {
    st1: h1.st1_nilai, st2: h2.st2_nilai, st3: h3.st3_nilai, st4: h4.st4_nilai,
    ipa_final, kategori,
    detail: {
      'NP.1.1.1': h1.np111, 'NP.1.2.1': h1.np121,
      'NP.2.3.1': h2.np231, 'SP.2.4.1.1': h2.sp2411,
      'SP.2.4.2.1': h2.sp2421, 'SP.2.4.3.1': h2.sp2431,
      'NP.2.4.1': h2.np241, 'NP.2.5.1': h2.np251,
      'NP.3.6.1': h3.np361, 'SP.3.7.1.1': h3.sp3711,
      'SP.3.7.2.1': h3.sp3721, 'SP.3.7.3.1': h3.sp3731,
      'NP.3.7.1': h3.np371,
      'SP.4.8.1.1': h4.sp4811, 'SP.4.8.2.1': h4.sp4821,
      'SP.4.8.3.1': h4.sp4831, 'SP.4.8.4.1': h4.sp4841,
      'SP.4.8.5.1': h4.sp4851, 'SP.4.8.6.1': h4.sp4861,
      'NP.4.8.1': h4.np481,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Utilitas display — dipakai di dashboard
// ─────────────────────────────────────────────────────────────────────────

export function indeksTertimbangKeKategori(v: number): KategoriIPA {
  if (v > 3) return 'Sangat Baik'
  if (v > 2) return 'Baik'
  if (v > 1) return 'Cukup'
  return 'Buruk'
}

/** Konversi IPA (0-4) ke persentase display (0-100) untuk progress bar. */
export function ipaKeDisplay(ipa: number): number {
  return Math.round(Math.min(100, Math.max(0, (ipa / 4) * 100)) * 100) / 100
}

/** Konversi sub-total ST ke persentase display berdasarkan nilai maksimum ST. */
export function stKeDisplay(nilai: number, stKey: 'ST1' | 'ST2' | 'ST3' | 'ST4'): number {
  const max = ST_MAX[stKey]
  return max > 0 ? Math.round(Math.min(100, (nilai / max) * 100) * 100) / 100 : 0
}

export const NAMA_PARAMETER: Record<string, string> = {
  'NP.1.1.1':   'Tindak Lanjut LHP BPK atas LKPD terkait BMD',
  'NP.1.2.1':   'Tindak Lanjut LHP Inspektorat terkait BMD',
  'NP.2.3.1':   'Ketepatan Waktu Penyampaian RKBMD',
  'SP.2.4.1.1': 'Laporan Bulanan Penatausahaan BMD',
  'SP.2.4.2.1': 'Laporan Semester I Penatausahaan BMD',
  'SP.2.4.3.1': 'Laporan Akhir Tahun (Semester II) Penatausahaan BMD',
  'NP.2.4.1':   'Ketepatan Waktu Penyampaian Laporan BMD',
  'NP.2.5.1':   'Ketepatan Waktu Laporan Pengawasan dan Pengendalian',
  'NP.3.6.1':   'Tindak Lanjut Rekomendasi Temuan Inspektorat',
  'SP.3.7.1.1': 'Tindak Lanjut Pemanfaatan/Pemindahtanganan/Penghapusan BMD',
  'SP.3.7.2.1': 'Tindak Lanjut BMD Rusak Berat/Usang',
  'SP.3.7.3.1': 'Tindak Lanjut BMD Konstruksi Dalam Pengerjaan (KDP)',
  'NP.3.7.1':   'Tindak Lanjut Pengelolaan BMD',
  'SP.4.8.1.1': 'Jumlah Bidang Tanah Bersertifikat',
  'SP.4.8.2.1': 'Nilai Perolehan Tanah Bersertifikat',
  'SP.4.8.3.1': 'Jumlah Unit Bangunan Punya Dokumen Kepemilikan',
  'SP.4.8.4.1': 'Nilai Perolehan Bangunan Punya Dokumen Kepemilikan',
  'SP.4.8.5.1': 'Jumlah Kendaraan Punya BPKB',
  'SP.4.8.6.1': 'Nilai Perolehan Kendaraan Punya BPKB',
  'NP.4.8.1':   'Sertifikasi Dokumen Kepemilikan BMD',
}
