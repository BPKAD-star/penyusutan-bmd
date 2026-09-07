// ============================================================================
// Format lembar KOREKSI Permendagri 47/2021 — keluarga IV.G
//
//   IV.G.2      LAPORAN KOREKSI BMD (rinci per barang)
//               sebelum · setelah · selisih, tiap-tiapnya 3 ukuran
//   IV.G.3      REKAPITULASI PENJELASAN SELISIH NILAI KOREKSI TAMBAH DAN KURANG
//               menurut SUB-SUB RINCIAN OBJEK — masih memuat baris BARANG
//   IV.G.4–G.7  rekap yang sama, makin dangkal, TANPA baris barang
//
// ── CAKUPAN: HANYA `koreksi_nilai`, dan itu keputusan yang punya alasan ─────
// Menu Koreksi aplikasi ini punya LIMA alasan (Nilai Perolehan · Pencatatan
// Ganda · Spesifikasi Barang · Pemecahan · Penggabungan), tapi lembar IV.G
// hanya cocok untuk yang PERTAMA. Bukan karena yang lain belum dibangun —
// karena formatnya memang bukan tentang mereka:
//
//   · SELURUH kolom uangnya "Nilai Perolehan / Akumulasi / Nilai Buku, sebelum
//     & setelah". Ia format tentang PERUBAHAN NILAI.
//   · Koreksi SPESIFIKASI tak menyentuh satu pun dari ketiganya → tiap baris
//     akan bersisi sebelum = setelah & selisih nol. Lembar penuh angka nol yang
//     ditandatangani lebih buruk daripada tak ada lembar.
//   · PENCATATAN GANDA membuang barang dari daftar, bukan mengoreksi nilainya —
//     di aplikasi ini barisnya bahkan bernilai Rp0 (diverifikasi ke produksi
//     2026-09-07). Padanan resminya ada di keluarga Penghapusan, bukan di sini.
//   · PEMECAHAN & PENGGABUNGAN menata ulang barang dengan Σ nilai TETAP; di
//     Format V.2 (BA Rekon) keduanya sudah dipetakan ke baris "6 Koreksi", dan
//     keduanya lahir dari kebutuhan aplikasi ini sendiri, bukan dari Permendagri.
//
// ⚠️ Jadi kalau kelak ada yang hendak "melengkapi" lembar ini untuk keempat
// alasan lain: yang dibutuhkan BUKAN entri registry baru di sini, melainkan
// format lain sama sekali. Menambahkannya ke IV.G akan menerbitkan lembar resmi
// yang seluruh kolom uangnya nol atau berulang.
//
// ── DUA BENTUK TABEL, dan itu yang membuat registry ini tak sedatar IV.F ────
//   `rinci`  (IV.G.2)      — identitas barang + 9 kolom uang (3 blok × 3)
//   `selisih`(IV.G.3–G.7)  — 6 kolom uang (3 ukuran × Tambah/Kurang)
// IV.G.3 duduk di antara keduanya: bentuk `selisih`, TAPI masih memuat baris
// barang berikut NIBAR & Spesifikasi Nama Barang. Itu sebabnya `punyaBarang`
// dipisah dari `bentuk` — dua sifat yang kebetulan sejalan di empat lembar lain
// tapi TIDAK di lembar ini.
//
// ⚠️ MESIN SUBTOTALNYA dari lib/formatPermendagri.ts, dipakai bersama seluruh
// cabang. Dua belas angka per kelompok dititipkan lewat `ItemLaporan.ukuran`
// (Record bebas-nama) — bukan mesin kedua, dan bukan pula dua belas ruas
// bernama yang membebani lima cabang yang tak memakainya.
//
// ⚠️ PENOMORAN KOLOM DITULIS, BUKAN DIHITUNG — alasannya sama persis dengan
// yang tertulis di kepala lib/formatPermendagri.ts.
// ============================================================================

import { sisaLebar, type Kolom } from './formatPermendagri'

/** Banyaknya sel segmen kode (kode penuh = 7 segmen). */
export const SEL_KODE_KOREKSI = 7

/**
 * Kunci ukuran yang dititipkan ke `ItemLaporan.ukuran`.
 *
 * ⚠️ Nama-nama ini KEMBAR dengan yang dibaca penyaji lembar. Kunci yang salah
 * ketik tak menghasilkan error — `Record` menerima apa saja — kolomnya cuma
 * tercetak Rp0 di lembar yang ditandatangani. Karena itu ia konstanta, bukan
 * string yang diketik di dua tempat, dan dikunci lib/formatKoreksi.test.ts.
 */
export const UK = {
  npSebelum: 'np_sebelum', akSebelum: 'ak_sebelum', nbSebelum: 'nb_sebelum',
  npSetelah: 'np_setelah', akSetelah: 'ak_setelah', nbSetelah: 'nb_setelah',
  // Selisih dipecah TAMBAH/KURANG & dijumlah TERPISAH — lembar IV.G.3–G.7
  // memberi keduanya kolom sendiri. ⚠️ Tak bisa diturunkan dari nettonya:
  // kelompok berisi +100 dan −40 punya netto +60, sementara lembarnya menuntut
  // Tambah 100 & Kurang 40. Menurunkannya dari netto akan mencetak Tambah 60 &
  // Kurang 0 — angka yang tetap kelihatan wajar.
  npTambah: 'np_tambah', npKurang: 'np_kurang',
  akTambah: 'ak_tambah', akKurang: 'ak_kurang',
  nbTambah: 'nb_tambah', nbKurang: 'nb_kurang',
} as const

/** Bentuk tabel sebuah lembar. */
export type BentukKoreksi = 'rinci' | 'selisih'

export type KolomKoreksi =
  | 'nama' | 'nibar' | 'spek_nama' | 'jumlah' | 'satuan'
  | 'sblm_np' | 'sblm_ak' | 'sblm_nb'
  | 'stlh_np' | 'stlh_ak' | 'stlh_nb'
  | 'slsh_np' | 'slsh_ak' | 'slsh_nb'
  | 'penyebab' | 'dok_nama' | 'dok_nomor' | 'dok_tanggal' | 'keterangan'
  // Bentuk `selisih` (IV.G.3–G.7)
  | 'np_tambah' | 'np_kurang' | 'ak_tambah' | 'ak_kurang' | 'nb_tambah' | 'nb_kurang'

export type KolomLembarKoreksi = Kolom<KolomKoreksi>

/** Identitas lembar. Dipakai URL halaman cetak & daftar centang. */
export type IdLembarKoreksi = 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7'

export type LembarKoreksi = {
  /** Akhiran nomor formatnya (`IV.G.<akhiran>`). */
  akhiran: number
  bentuk: BentukKoreksi
  /**
   * Lembar ini memuat baris BARANG (bukan cuma kelompok).
   *
   * ⚠️ Sengaja TERPISAH dari `bentuk`: IV.G.3 berbentuk `selisih` tapi TETAP
   * memuat baris barang berikut NIBAR & Spesifikasi Nama Barang. Menyimpulkan
   * yang satu dari yang lain akan membuat IV.G.3 kehilangan seluruh baris
   * barangnya — dan angka kelompoknya tetap benar, jadi tak ada yang berteriak.
   */
  punyaBarang: boolean
  /** Kedalaman kelompok TERDALAM yang dipancarkan. */
  seg: number
  /** Kedalaman kelompok TERDANGKAL. */
  segMin: number
  /** Baris judul di bawah judul utama ("MENURUT …"). Kosong = tak ada. */
  menurut?: string
  /** Penanda subtotal sejajar `SEG_SUBTOTAL` = [6seg, 5seg, 4seg, 3seg]. */
  subtotal?: readonly [number, number, number, number]
}

/**
 * Tangga lembar IV.G.
 *
 * ⚠️ **`segMin` 3 untuk dua lembar yang memuat barang, 2 untuk empat rekap
 * murni**, dan itu mengikuti gambar formatnya: IV.G.2 & IV.G.3 membuka dengan
 * `x x x`, sementara IV.G.4–G.7 membuka dengan `x x` (kelompok neraca, mis.
 * `1.3` ASET TETAP). Menyeragamkannya TIDAK mengubah satu pun angka — cuma
 * menambah/menghilangkan baris kelompok teratas — jadi tak ada uji aritmetika
 * yang akan menangkapnya; uji khusus di lib/formatKoreksi.test.ts satu-satunya
 * penjaganya.
 *
 * ⚠️ IV.G.3 turun sampai **7 segmen** (sub-sub rincian objek = barangnya
 * sendiri), sementara subtotalnya tetap 3–6. Itu sebabnya `seg` di sini 6
 * (kedalaman KELOMPOK terdalam) sedangkan barangnya dipancarkan terpisah lewat
 * `punyaBarang` — `seg: 7` akan melahirkan baris kelompok setingkat barang,
 * yaitu baris kembar tepat di atas tiap barang.
 */
export const TANGGA_KOREKSI: Record<IdLembarKoreksi, LembarKoreksi> = {
  g2: { akhiran: 2, bentuk: 'rinci', punyaBarang: true, seg: 6, segMin: 3, subtotal: [28, 29, 30, 31] },
  g3: { akhiran: 3, bentuk: 'selisih', punyaBarang: true, seg: 6, segMin: 3, menurut: 'SUB-SUB RINCIAN OBJEK', subtotal: [18, 19, 20, 21] },
  g4: { akhiran: 4, bentuk: 'selisih', punyaBarang: false, seg: 6, segMin: 2, menurut: 'SUB RINCIAN OBJEK' },
  g5: { akhiran: 5, bentuk: 'selisih', punyaBarang: false, seg: 5, segMin: 2, menurut: 'RINCIAN OBJEK' },
  g6: { akhiran: 6, bentuk: 'selisih', punyaBarang: false, seg: 4, segMin: 2, menurut: 'OBJEK' },
  // ⚠️ IV.G.7 tidak ikut diserahkan sbg gambar (batas lampiran), tapi
  // bentuknya ditegaskan user: "menurut jenis aja, jadi ada di atas level
  // objek" — jadi ia kelanjutan tangga yang sama, satu tingkat lebih dangkal
  // dari IV.G.6.
  g7: { akhiran: 7, bentuk: 'selisih', punyaBarang: false, seg: 3, segMin: 2, menurut: 'JENIS' },
}

export const URUT_LEMBAR: IdLembarKoreksi[] = ['g2', 'g3', 'g4', 'g5', 'g6', 'g7']

export const AWALAN_KOREKSI = 'IV.G'
export const kodeLembarKoreksi = (l: LembarKoreksi) => `${AWALAN_KOREKSI}.${l.akhiran}`

/** Judul utama tiap bentuk. Isian "BERUPA…(1)" diisi pemanggil. */
export const JUDUL_KOREKSI: Record<BentukKoreksi, string> = {
  rinci: 'LAPORAN KOREKSI BMD BERUPA',
  // ⚠️ Judulnya BERBARIS DUA di lembar aslinya ("…TAMBAH DAN KURANG" lalu "BMD
  // BERUPA…"). Disatukan di sini & dipecah penyaji; yang penting kalimatnya
  // sama persis waktu dibaca pemeriksa.
  selisih: 'REKAPITULASI PENJELASAN SELISIH NILAI KOREKSI TAMBAH DAN KURANG BMD BERUPA',
}

// ── Kolom ───────────────────────────────────────────────────────────────────

/**
 * Kolom lembar RINCI IV.G.2.
 *
 * ⚠️ **NIBAR kolom (10), DI TENGAH — bukan paling kiri.** Beda dari keluarga
 * IV.B/IV.C/IV.D/IV.F yang menaruhnya di luar blok kode & paling kiri. Di sini
 * blok "Kode Barang" yang paling kiri, dan ia BERDIRI SENDIRI: tak ada
 * super-header "Penggolongan dan Kodefikasi Barang" seperti keluarga
 * perpindahan/reklas. Jangan disamakan "biar seragam".
 *
 * ⚠️ LEBAR: total + `sisaLebar` = 100 PERSIS. **26 sel per baris** (7 sel kode
 * + 19 kolom), dan SEMBILAN di antaranya kolom uang yang berdempetan di tengah
 * — jadi ruangnya jauh lebih ketat daripada lembar mana pun di aplikasi ini.
 * Kesembilan kolom uang dipepet ke 4,8% (≈58 px pada lebar cetak F4 lanskap
 * ±1.200 px; "3.123.618.000" @7,5px ≈ 55 px, jadi muat sebaris) supaya blok
 * kode dapat 10,4% — 1,49%/sel ≈ 18 px, cukup untuk segmen 3 karakter.
 * Kolom teks panjang (Nama Barang, Spesifikasi, Penyebab, Keterangan) tetap
 * didahulukan karena merekalah yang menentukan TINGGI baris — pelajaran yang
 * sama dgn lembar IV.F (2026-09-07).
 */
function kolomRinciKoreksi(): KolomLembarKoreksi[] {
  return [
    { key: 'nama', judul: 'Nama Barang', nomor: 9, lebar: 7.0, rata: 'kiri' },
    { key: 'nibar', judul: 'NIBAR/NUPS', nomor: 10, lebar: 7.0, rata: 'kiri' },
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 6.0, rata: 'kiri' },
    { key: 'jumlah', judul: 'Jumlah Barang', nomor: 12, lebar: 2.4, rata: 'kanan' },
    { key: 'satuan', judul: 'Satuan Barang', nomor: 13, lebar: 2.8, rata: 'tengah' },
    { key: 'sblm_np', judul: 'Nilai Perolehan (Rp)', nomor: 14, grup: 'Sebelum Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'sblm_ak', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 15, grup: 'Sebelum Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'sblm_nb', judul: 'Nilai Buku (Rp)*', nomor: 16, grup: 'Sebelum Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'stlh_np', judul: 'Nilai Perolehan (Rp)', nomor: 17, grup: 'Setelah Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'stlh_ak', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 18, grup: 'Setelah Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'stlh_nb', judul: 'Nilai Buku (Rp)*', nomor: 19, grup: 'Setelah Koreksi', lebar: 4.8, rata: 'kanan' },
    { key: 'slsh_np', judul: 'Nilai Perolehan (Rp)', nomor: 20, grup: 'Selisih', lebar: 4.8, rata: 'kanan' },
    { key: 'slsh_ak', judul: 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)', nomor: 21, grup: 'Selisih', lebar: 4.8, rata: 'kanan' },
    { key: 'slsh_nb', judul: 'Nilai Buku (Rp)', nomor: 22, grup: 'Selisih', lebar: 4.8, rata: 'kanan' },
    { key: 'penyebab', judul: 'Penyebab koreksi', nomor: 23, lebar: 5.0, rata: 'kiri' },
    // ⚠️ "Nama Dokumen" SELALU KOSONG — alasan & pola sama persis dgn IV.F:
    // aplikasi ini tak menyimpan JENIS/nama dokumen sumber koreksi di mana pun
    // (`jurnal_header` cuma punya `no_sk`, `tanggal`, `keterangan`, &
    // `payload.dokumen_paths` yang isinya PATH berkas). Kolomnya tetap dicetak
    // supaya lembarnya cocok kolom-per-kolom saat diperiksa.
    { key: 'dok_nama', judul: 'Nama Dokumen', nomor: 24, grup: 'Dokumen Sumber', lebar: 3.0, rata: 'kiri' },
    { key: 'dok_nomor', judul: 'Nomor', nomor: 25, grup: 'Dokumen Sumber', lebar: 4.0, rata: 'kiri' },
    { key: 'dok_tanggal', judul: 'Tanggal', nomor: 26, grup: 'Dokumen Sumber', lebar: 4.2, rata: 'tengah' },
    { key: 'keterangan', judul: 'Keterangan', nomor: 27, lebar: 5.0, rata: 'kiri' },
  ]
}

/**
 * Kolom lembar SELISIH.
 *
 * ⚠️ Penomorannya BERGESER antara IV.G.3 & IV.G.4–G.7: yang punya baris barang
 * membawa dua kolom ekstra (NIBAR & Spesifikasi Nama Barang), jadi kolom uang
 * pertamanya (12) di IV.G.3 tapi (10) di IV.G.4. Diturunkan dari `punyaBarang`,
 * bukan ditulis dua kali.
 */
function kolomSelisihKoreksi(punyaBarang: boolean): KolomLembarKoreksi[] {
  const identitas: KolomLembarKoreksi[] = punyaBarang
    ? [
      { key: 'nama', judul: 'Nama Barang', nomor: 9, lebar: 14.0, rata: 'kiri' },
      { key: 'nibar', judul: 'NIBAR', nomor: 10, lebar: 11.0, rata: 'kiri' },
      { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 11.0, rata: 'kiri' },
    ]
    : [{ key: 'nama', judul: 'Nama Barang', nomor: 9, lebar: 28.0, rata: 'kiri' }]
  const n = punyaBarang ? 12 : 10
  const lebar = punyaBarang ? 6.5 : 8.0
  // ⚠️ Grup DUA TINGKAT: "Selisih Nilai Koreksi" membungkus tiga sub-blok, dan
  // tiap sub-blok membungkus Tambah/Kurang. `grup` di sini SUB-BLOKNYA; tingkat
  // teratasnya dirakit penyaji karena ia sama untuk keenam kolom.
  const uang: [KolomKoreksi, string][] = [
    ['np_tambah', 'Nilai Perolehan (Rp)'], ['np_kurang', 'Nilai Perolehan (Rp)'],
    ['ak_tambah', 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)'],
    ['ak_kurang', 'Nilai Akumulasi Penyusutan atau Amortisasi (Rp)'],
    ['nb_tambah', 'Nilai Buku (Rp)'], ['nb_kurang', 'Nilai Buku (Rp)'],
  ]
  return [
    ...identitas,
    ...uang.map(([key, grup], i) => ({
      key, grup, nomor: n + i, lebar,
      judul: key.endsWith('tambah') ? 'Tambah' : 'Kurang',
      rata: 'kanan' as const,
    })),
  ]
}

/** Kolom lembar ini, kiri→kanan (tanpa sel segmen blok kode). */
export function kolomLembarKoreksi(l: LembarKoreksi): KolomLembarKoreksi[] {
  return l.bentuk === 'rinci' ? kolomRinciKoreksi() : kolomSelisihKoreksi(l.punyaBarang)
}

/** Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain. */
export function lebarKodeKoreksi(l: LembarKoreksi): number {
  return sisaLebar(kolomLembarKoreksi(l))
}
