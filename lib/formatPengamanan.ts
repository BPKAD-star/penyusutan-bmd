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
// ── BENTUK BARU (2026-09-28), MENGGANTIKAN "datar & bernomor" ──────────────
// ⚠️ Sampai hari ini catatan di sini bilang lembar ini "SATU-SATUNYA keluarga
// yang sengaja tak memakai mesin subtotal" — keputusan itu DIBALIK user:
// sekarang polanya SAMA PERSIS dgn keluarga Perpindahan/Reklas/Penghapusan
// (2026-09-27/28) — tabel datar dikelompokkan per GOLONGAN yang disaring
// pemuatnya, NIBAR dapat kolom terbesar & huruf 9px, nominal 2 desimal.
// ⚠️ Bedanya dgn ketiga keluarga itu: `muatLaporanPengamanan` SUDAH menyaring
// satu golongan tunggal per cabang (1.3.2 di IV.J.1.2, 1.3.3 di IV.J.2.2), jadi
// baris kelompok cuma SATU — sebuah label, bukan mesin subtotal `susunRekap`.
// Menambahkannya di sini berarti membebani lembar yang tak pernah punya lebih
// dari satu kelompok dgn mesin yang dirancang untuk banyak kelompok.
//
// ── PENYEDERHANAAN YANG DIMINTA USER (2026-09-08, TETAP BERLAKU) ───────────
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
//   · **Lokasi/Alamat & Alamat Penghuni DIBUANG** (2026-09-28, mengikuti
//     contoh susunan kolom baru yang diserahkan user) — bentuk baru ini tak
//     memuatnya sama sekali.
//
// ⚠️ Ini masih SATU-SATUNYA keluarga lembar di aplikasi ini yang sengaja
// MENYIMPANG dari susunan kolom aslinya (SIP/Dokumen Pendukung/Alamat
// dibuang). Kalau kelak diminta kembali ke bentuk aslinya, yang perlu
// ditambah: `sip_nomor`, `sip_tanggal`, `dukung_*`, & `p_alamat`, plus tempat
// menyimpannya di kartu.
// ============================================================================

export type KolomPengamanan =
  | 'nibar' | 'kode' | 'nama' | 'merek' | 'no_polisi' | 'nilai_perolehan'
  | 'p_nama' | 'p_identitas' | 'p_status' | 'p_jabatan'
  | 'bast_nomor' | 'bast_tanggal' | 'pakta_nomor' | 'pakta_tanggal'
  | 'keterangan'

export type KolomRinciPengamanan = {
  key: KolomPengamanan
  judul: string
  /** Persen lebar. Totalnya WAJIB 100 persis. */
  lebar: number
  rata: 'kiri' | 'kanan' | 'tengah'
}

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
  kolom: KolomRinciPengamanan[]
  kosong: string
}

/**
 * Kolom kedua cabang — IDENTIK, sesuai keputusan user "disamakan aja".
 *
 * ⚠️ Fungsi, bukan konstanta bersama, supaya kedua entri registry tak berbagi
 * OBJEK yang sama — daftar yang dipakai bersama gampang tersunting di tempat
 * oleh pemakai yang mengira ia salinannya sendiri.
 *
 * ⚠️ NIBAR sengaja dapat jatah TERBESAR (11,5%) & huruf 9px di penyaji —
 * permintaan user 2026-09-27/28, pola yang sama dgn Perpindahan/Reklas/
 * Penghapusan. Sisanya dibagi mengikuti urutan blok yang diminta user:
 * identitas barang → Nilai Perolehan → identitas orang → dua dokumen sumber
 * → Keterangan.
 */
function kolomPengamanan(grup: string): KolomRinciPengamanan[] {
  return [
    { key: 'nibar', judul: 'NIBAR', lebar: 11.5, rata: 'kiri' },
    { key: 'kode', judul: 'Kode Barang - Uraian Barang', lebar: 8.5, rata: 'kiri' },
    { key: 'nama', judul: 'Nama Barang', lebar: 7.5, rata: 'kiri' },
    { key: 'merek', judul: 'Merk/Tipe', lebar: 5.5, rata: 'kiri' },
    { key: 'no_polisi', judul: 'No Polisi', lebar: 4.5, rata: 'kiri' },
    { key: 'nilai_perolehan', judul: 'Nilai Perolehan', lebar: 7.0, rata: 'kanan' },
    { key: 'p_nama', judul: `Nama ${grup}`, lebar: 7.5, rata: 'kiri' },
    { key: 'p_status', judul: `Status ${grup}`, lebar: 5.5, rata: 'kiri' },
    { key: 'p_identitas', judul: 'Nomor Identitas', lebar: 6.5, rata: 'kiri' },
    { key: 'p_jabatan', judul: 'Jabatan', lebar: 7.0, rata: 'kiri' },
    { key: 'bast_nomor', judul: 'Nomor BAST', lebar: 5.8, rata: 'kiri' },
    { key: 'bast_tanggal', judul: 'Tanggal BAST', lebar: 4.4, rata: 'tengah' },
    { key: 'pakta_nomor', judul: 'Nomor Pakta Integritas', lebar: 5.8, rata: 'kiri' },
    { key: 'pakta_tanggal', judul: 'Tanggal Pakta Integritas', lebar: 4.4, rata: 'tengah' },
    { key: 'keterangan', judul: 'Keterangan', lebar: 8.6, rata: 'kiri' },
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
    kosong: 'Tidak ada kustodi Peralatan dan Mesin yang berlaku pada periode ini.',
  },
  rumah_negara: {
    kode: 'IV.J.2.2',
    golongan: '1.3.3',
    label: 'Gedung & Bangunan (Rumah Negara)',
    judul: 'LAPORAN PENGGUNAAN/PEMAKAIAN BMD GEDUNG DAN BANGUNAN BERUPA RUMAH NEGARA',
    grupOrang: 'Penghuni',
    kolom: kolomPengamanan('Penghuni'),
    kosong: 'Tidak ada kustodi Gedung dan Bangunan (Rumah Negara) yang berlaku pada periode ini.',
  },
}

export const URUT_PENGAMANAN: IdPengamanan[] = ['peralatan_mesin', 'rumah_negara']
