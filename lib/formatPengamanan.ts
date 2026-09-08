// ============================================================================
// Format lembar PENGAMANAN Permendagri 47/2021 — keluarga IV.J
//
//   IV.J.1.2  Laporan Penggunaan/Pemakaian BMD PERALATAN DAN MESIN   (1.3.2)
//   IV.J.2.2  Laporan Penggunaan/Pemakaian BMD GEDUNG DAN BANGUNAN
//             BERUPA RUMAH NEGARA                                    (1.3.3)
//
// Sumbernya kartu Pengamanan (`jurnal_header` kategori `pengamanan` + ledger
// jenis `pengamanan`) — penyerahan kustodi fisik barang ke seorang pegawai
// lewat BAST + Pakta Integritas.
//
// ── BENTUKNYA DATAR, bukan bersubtotal ─────────────────────────────────────
// ⚠️ Beda mendasar dari keluarga IV.A/B/C/D/F/G/K: kolom "Kode Barang" di sini
// SATU kolom teks biasa — TIDAK dipecah jadi sel segmen — dan barisnya BERNOMOR
// (1, 2, 3…) tanpa satu pun baris kelompok atau subtotal. Karena itu lembar ini
// tak memakai mesin subtotal sama sekali, dan tak punya lembar rekap `.3`–`.6`.
// Bentuknya paling dekat dengan IV.D.7 (rekap gabungan internal).
// Jangan "diseragamkan" jadi bersegmen — susunan kolomnya akan berbeda dari
// lembar resmi yang dicocokkan pemeriksa kolom per kolom.
//
// ── PENYEDERHANAAN YANG DIMINTA USER (2026-09-08) ──────────────────────────
// Lembar aslinya berbeda antara IV.J.1.2 & IV.J.2.2; user memutuskan
// **disamakan**, dengan dua kolom dibuang & satu blok diganti:
//
//   · **Surat Ijin Penghunian (SIP)** — hanya ada di IV.J.2.2 — DIBUANG.
//     Aplikasi ini tak menyimpannya di mana pun, jadi kolomnya akan selalu
//     kosong di lembar bertanda tangan.
//   · **Dokumen Pendukung Lainnya** (Nama · Nomor · Tanggal) — ada di
//     keduanya — DIBUANG, alasan yang sama.
//   · **Dokumen Sumber Penggunaan** diisi apa yang memang dimiliki aplikasi
//     ini: **BAST** (Nomor · Tanggal) + **Pakta Integritas** (Nomor · Tanggal).
//
// ⚠️ Ini SATU-SATUNYA keluarga lembar di aplikasi ini yang sengaja MENYIMPANG
// dari susunan kolom aslinya. Di keluarga lain, kolom yang datanya tak ada
// tetap dicetak KOSONG supaya lembarnya cocok kolom-per-kolom saat diperiksa
// (lihat `dok_nama` di IV.A/IV.F & blok SK Penghapusan di IV.B.1.2). Di sini
// user memutuskan sebaliknya — dan itu keputusannya, bukan kelalaian. Kalau
// kelak diminta kembali ke bentuk aslinya, yang perlu ditambah: `sip_nomor`,
// `sip_tanggal`, & blok `dukung_*`, plus tempat menyimpannya di kartu.
//
// ⚠️ URUTAN BLOK PENGHUNI DITENTUKAN USER & SENGAJA SAMA dengan form isian
// menu Pengamanan: Nama → Nomor Identitas → Status → Jabatan → Alamat.
// Lembar aslinya menaruh Nomor Identitas SESUDAH Jabatan; disamakan supaya
// operator tak mengisi form dalam urutan yang berbeda dari lembar yang ia
// salin. Dikunci lib/formatPengamanan.test.ts.
// ============================================================================

import type { Kolom } from './formatPermendagri'

export type KolomPengamanan =
  | 'no' | 'nibar' | 'kode' | 'nama' | 'spek_nama' | 'lokasi'
  | 'p_nama' | 'p_identitas' | 'p_status' | 'p_jabatan' | 'p_alamat'
  | 'bast_nomor' | 'bast_tanggal' | 'pakta_nomor' | 'pakta_tanggal'
  | 'keterangan'

export type KolomLembarPengamanan = Kolom<KolomPengamanan>

/** Identitas cabang. Dipakai URL halaman cetak & kunci ingatan penanda tangan. */
export type IdPengamanan = 'peralatan_mesin' | 'rumah_negara'

export type FormatPengamanan = {
  kode: string
  /** Golongan yang disaring — sekaligus yang membedakan kedua cabang. */
  golongan: string
  /** Label pendek untuk tombol filter di menu. */
  label: string
  /** Judul lembar, LENGKAP (tak ada isian "BERUPA…" yang diisi pemanggil). */
  judul: string
  /** Judul blok identitas — "Pemakai" (IV.J.1) vs "Penghuni" (IV.J.2). */
  grupOrang: string
  kolom: KolomLembarPengamanan[]
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/**
 * Kolom kedua cabang — IDENTIK, sesuai keputusan user "disamakan aja".
 *
 * ⚠️ Fungsi, bukan konstanta bersama, supaya kedua entri registry tak berbagi
 * OBJEK yang sama — daftar yang dipakai bersama gampang tersunting di tempat
 * oleh pemakai yang mengira ia salinannya sendiri.
 *
 * ⚠️ LEBAR: totalnya 100 PERSIS ("fit to window" di `table-fixed`). 16 kolom,
 * jadi jauh lebih lega daripada keluarga bersegmen — kolom teks panjang
 * (Nama Barang, Spesifikasi, Lokasi, Alamat) karena itu dapat porsi besar:
 * merekalah yang menentukan TINGGI baris.
 */
function kolomPengamanan(grup: string): KolomLembarPengamanan[] {
  return [
    { key: 'no', judul: 'No.', nomor: 6, lebar: 2.4, rata: 'tengah' },
    // ⚠️ NIBAR 45 digit, dipenggal dua baris di batas segmen oleh `pecahNibar()`;
    // potongan pertama 26 digit wajib muat SEBARIS.
    { key: 'nibar', judul: 'NIBAR', nomor: 7, lebar: 9.0, rata: 'kiri' },
    // ⚠️ SATU kolom teks, BUKAN sel segmen — lihat kepala berkas.
    { key: 'kode', judul: 'Kode Barang', nomor: 8, lebar: 8.0, rata: 'kiri' },
    { key: 'nama', judul: 'Nama Barang', nomor: 9, lebar: 8.6, rata: 'kiri' },
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 10, lebar: 8.0, rata: 'kiri' },
    { key: 'lokasi', judul: 'Lokasi/Alamat', nomor: 11, lebar: 8.0, rata: 'kiri' },
    { key: 'p_nama', judul: `Nama ${grup}`, nomor: 12, grup, lebar: 8.0, rata: 'kiri' },
    { key: 'p_identitas', judul: `Nomor Identitas ${grup}`, nomor: 13, grup, lebar: 7.0, rata: 'kiri' },
    { key: 'p_status', judul: `Status ${grup}`, nomor: 14, grup, lebar: 5.6, rata: 'kiri' },
    { key: 'p_jabatan', judul: 'Jabatan', nomor: 15, grup, lebar: 6.4, rata: 'kiri' },
    { key: 'p_alamat', judul: 'Alamat', nomor: 16, grup, lebar: 7.0, rata: 'kiri' },
    { key: 'bast_nomor', judul: 'Nomor', nomor: 17, grup: 'BAST Pemakaian', lebar: 5.6, rata: 'kiri' },
    { key: 'bast_tanggal', judul: 'Tanggal', nomor: 18, grup: 'BAST Pemakaian', lebar: 4.4, rata: 'tengah' },
    { key: 'pakta_nomor', judul: 'Nomor', nomor: 19, grup: 'Pakta Integritas', lebar: 5.6, rata: 'kiri' },
    { key: 'pakta_tanggal', judul: 'Tanggal', nomor: 20, grup: 'Pakta Integritas', lebar: 4.4, rata: 'tengah' },
    { key: 'keterangan', judul: 'Keterangan', nomor: 21, lebar: 2.0, rata: 'kiri' },
  ]
}

export const FORMAT_PENGAMANAN: Record<IdPengamanan, FormatPengamanan> = {
  peralatan_mesin: {
    kode: 'IV.J.1.2',
    golongan: '1.3.2',
    label: 'Peralatan & Mesin',
    judul: 'LAPORAN PENGGUNAAN/PEMAKAIAN BMD PERALATAN DAN MESIN',
    grupOrang: 'Pemakai',
    kolom: kolomPengamanan('Pemakai'),
    kaki: { tanggal: 23, jabatan: 24, nama: 25 },
  },
  rumah_negara: {
    kode: 'IV.J.2.2',
    golongan: '1.3.3',
    label: 'Gedung & Bangunan (Rumah Negara)',
    judul: 'LAPORAN PENGGUNAAN/PEMAKAIAN BMD GEDUNG DAN BANGUNAN BERUPA RUMAH NEGARA',
    grupOrang: 'Penghuni',
    kolom: kolomPengamanan('Penghuni'),
    // ⚠️ Penomoran kakinya BERGESER dari IV.J.1.2 di lembar aslinya karena di
    // sana ada blok SIP; di sini SIP dibuang, tapi nomornya DIPERTAHANKAN apa
    // adanya supaya rujukan ke lembar resmi tetap terbaca.
    kaki: { tanggal: 25, jabatan: 26, nama: 27 },
  },
}

export const URUT_PENGAMANAN: IdPengamanan[] = ['peralatan_mesin', 'rumah_negara']

/** Kolom yang dipakai kepala BERGRUP, kiri→kanan. */
export const grupKolomPengamanan = (f: FormatPengamanan) => {
  const out: { judul: string | undefined; kolom: KolomLembarPengamanan[] }[] = []
  for (const k of f.kolom) {
    const t = out[out.length - 1]
    if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
    else out.push({ judul: k.grup, kolom: [k] })
  }
  return out
}
