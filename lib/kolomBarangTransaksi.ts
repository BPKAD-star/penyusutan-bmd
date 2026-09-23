// ============================================================================
// STANDAR kolom "informasi barang" untuk kartu TRANSAKSI (keputusan user
// 2026-09-23) — SATU urutan, SATU set label, dipakai di SEMBILAN menu:
//
//   Cara Perolehan: Pengadaan · Hibah · Tukar Menukar · Hasil Inventarisasi ·
//                    Perolehan Lainnya      (2 komponen: Pengadaan.tsx,
//                    PerolehanManual.tsx — yang kedua melayani 4 kategori)
//   Pengelolaan:    Penggunaan · Penerimaan Internal · Pengeluaran Internal ·
//                    Penghapusan            (4 komponen)
//
// Sebelum ini keenam komponen itu masing-masing menulis daftar kolomnya
// sendiri — beda urutan, beda label ("Merk/Tipe" vs "Merek / Tipe"), beda
// kolom yang ikut (PenggunaanMasuk/PenerimaanInternal tak pernah menampilkan
// No. Polisi/Rangka/Mesin/Luas/Alamat sama sekali, padahal datanya ADA di
// `fields`). Operator yang membuka dua menu berurutan melihat susunan barang
// yang berbeda-beda tanpa pola.
//
// ⚠️ LIMA MENU SENGAJA TIDAK IKUT (permintaan user): Pemanfaatan,
// Reklasifikasi, Koreksi, Kapitalisasi, Pengamanan. Bentuknya beda — barang di
// situ tunggal per baris ledger (bukan daftar barang per dokumen/kontrak) atau
// sudah punya tata letak sendiri yang belum diminta diseragamkan.
//
// ⚠️ KEDUA BELAS KOLOM SELALU TAMPIL, urutan TETAP, isi '-' kalau field-nya
// tak berlaku utk golongan barang itu (mis. Luas kosong utk Peralatan &
// Mesin) — SENGAJA bukan disembunyikan per golongan. Kolom yang boleh
// hilang-tampil tergantung isi kartu akan membuat kartu-kartu yang isinya
// beda golongan kembali TAK SEJAJAR, yaitu justru masalah yang mau ditutup:
// "rata dari atas ke bawah" cuma bisa dijamin kalau SETIAP kartu, apa pun
// golongan barangnya, memakai colgroup yang identik.
//
// Dua CACAT tampilan lama yang ikut ditutup di sini, bukan cuma soal urutan:
//   (1) Tanpa `table-fixed`+`<colgroup>` tetap, lebar tiap kolom mengikuti
//       KONTEN kartu itu sendiri (`table-layout:auto` bawaan) — kartu A & B
//       di halaman yang sama bisa punya batas kolom berbeda persis karena
//       isinya beda panjang. Pola `table-fixed`+colgroup yang sudah lama
//       dipakai lembar cetak Permendagri (lib/formatPermendagri.ts) dipakai
//       lagi di sini, cuma dalam tabel LAYAR bukan cetak.
//   (2) Luas & Alamat Detail TAK PERNAH ditampilkan di menu Pengelolaan
//       walau datanya ada — bukan cuma perkara urutan, dua kolom itu benar²
//       kolom BARU di keempat menu Pengelolaan.
// ============================================================================

export type KolomBarangKey =
  | 'kode' | 'spek' | 'merek' | 'spesifikasi' | 'nopol' | 'rangka' | 'mesin'
  | 'luas' | 'alamat' | 'tgl' | 'jumlah' | 'nilai'

export type MetaKolomBarang = { header: string; berat: number; align?: 'right' | 'center' }

/**
 * Label & BOBOT relatif (bukan %) tiap kolom — dipakai `hitungLebarKolom()`
 * bersama kolom EKSTRA milik tiap pemanggil (checkbox/foto/komptabel/
 * keterangan/aksi/dst, yang jumlahnya beda-beda per menu) supaya colgroup-nya
 * selalu jumlah PERSIS 100% apa pun kolom ekstra yang ditambahkan.
 */
export const KOLOM_BARANG_TRANSAKSI: Record<KolomBarangKey, MetaKolomBarang> = {
  // Kode Barang + Uraian Barang (baku dari kodefikasi) ditumpuk 1 sel.
  kode: { header: 'Kode Barang', berat: 14 },
  // Spesifikasi Nama Barang (aset.nama_barang, diketik pengusul) + NIBAR
  // ditumpuk 1 sel — NIBAR 45 digit, kolom terlebar kedua.
  spek: { header: 'Spesifikasi Nama Barang', berat: 14 },
  merek: { header: 'Merk/Tipe', berat: 8 },
  spesifikasi: { header: 'Spesifikasi Lainnya', berat: 10 },
  nopol: { header: 'No. Polisi', berat: 6 },
  // Rangka (VIN, ±17 digit) selalu lebih panjang dari nomor mesin — koreksi
  // 2026-09-23 (bobot sempat sama-rata & keduanya bertabrakan di layar).
  rangka: { header: 'No. Rangka', berat: 9 },
  mesin: { header: 'No. Mesin', berat: 6 },
  // Suffix "(m²)" kembar dgn lib/kolomBarang.ts (Daftar Barang / Daftar
  // Barang Awal) — satuan yang sama, jangan sebut beda di menu berbeda.
  luas: { header: 'Luas (m²)', berat: 5, align: 'right' },
  alamat: { header: 'Alamat Detail', berat: 10 },
  tgl: { header: 'Tgl Perolehan', berat: 6, align: 'center' },
  // Jumlah + Satuan ditumpuk 1 sel.
  jumlah: { header: 'Jumlah', berat: 5, align: 'center' },
  nilai: { header: 'Nilai', berat: 9, align: 'right' },
}

/**
 * Urutan TETAP kiri→kanan — jangan diacak per pemanggil.
 * ⚠️ Rangka SEBELUM Mesin (dikoreksi 2026-09-23; urutan pertama sempat
 * kebalik jadi Mesin-lalu-Rangka).
 */
export const KOLOM_BARANG_URUTAN: readonly KolomBarangKey[] = [
  'kode', 'spek', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin',
  'luas', 'alamat', 'tgl', 'jumlah', 'nilai',
]

/**
 * Bentuk data GENERIK yang dibutuhkan mengisi kedua belas kolom di atas.
 * Tiap menu memetakan bentuk barisnya sendiri (DraftItem/JurnalLine/dll) ke
 * bentuk ini — pemetaannya boleh beda per menu, tapi HASILNYA selalu bentuk
 * yang sama, itu yang menjamin susunan kolomnya sama.
 */
export type BarangTransaksi = {
  kode: string
  uraianBarang: string | null
  nibar: string | null
  /** Spesifikasi Nama Barang = aset.nama_barang, BUKAN uraian baku. */
  namaBarang: string | null
  merekTipe: string | null
  spesifikasiLainnya: string | null
  noPolisi: string | null
  noMesin: string | null
  noRangka: string | null
  luas: number | string | null
  alamatDetail: string | null
  tglPerolehan: string | null
  jumlah: number | null
  satuan: string | null
  nilai: number | null
}

/**
 * Ubah daftar {key, berat} — kolom kanonik + kolom ekstra milik pemanggil —
 * jadi lebar % yang jumlahnya PERSIS 100 (bukan mendekati). Sisa pembulatan
 * ditaruh di kolom TERAKHIR, bukan dibiarkan menumpuk sbg selisih —
 * `table-fixed` butuh totalnya pas supaya kolom tak melar/menyusut sendiri.
 */
export function hitungLebarKolom(entries: { key: string; berat: number }[]): { key: string; pct: number }[] {
  const total = entries.reduce((s, e) => s + e.berat, 0)
  if (total <= 0 || entries.length === 0) return entries.map(e => ({ key: e.key, pct: 0 }))
  let terpakai = 0
  return entries.map((e, i) => {
    if (i === entries.length - 1) return { key: e.key, pct: Math.round((100 - terpakai) * 100) / 100 }
    const pct = Math.round((e.berat / total) * 10000) / 100
    terpakai += pct
    return { key: e.key, pct }
  })
}
