// Panduan LANGKAH-DEMI-LANGKAH untuk Asisten AI (app/api/ai-chat).
//
// Basis pengetahuan di prompt.ts menjelaskan KONSEP ("Cara Perolehan pakai
// persetujuan"). Itu tidak cukup untuk pertanyaan "gimana cara entry-nya?" —
// tanpa urutan klik yang nyata, model mengisi kekosongan dengan tebakan
// yang terdengar masuk akal ("isi Tahun Produksi", "Tipe/Model") padahal
// kolom itu tidak ada di layar (kejadian 2026-09-29).
//
// Panduan di sini disuntikkan HANYA kalau relevan (halaman yang dibuka, atau
// kata kunci di pertanyaan) — supaya system prompt statis tetap bisa di-cache
// dan tidak membengkak untuk setiap percakapan.
//
// ⚠️ NAMA TOMBOL & KOLOM DI SINI WAJIB SAMA PERSIS DENGAN LAYAR. Sumbernya:
// components/pengelolaan/Pengadaan.tsx (KontrakForm, TambahBarangPanel) &
// components/pengelolaan/KonstruksiPengadaan.tsx. Begitu labelnya berubah di
// sana, ubah di sini juga — panduan yang salah akan disampaikan bot dengan
// yakin, dan itu lebih buruk daripada bot yang bilang tidak tahu.

type Panduan = {
  /** Awalan pathname yang memicu panduan ini. */
  path: string[]
  /** Kata kunci di pertanyaan yang juga memicunya (dari halaman mana pun). */
  kunci: RegExp
  teks: string
}

const PENGADAAN = `===== PANDUAN LANGKAH: PENGADAAN (Pembukuan → Cara Perolehan → Pengadaan) =====

PRINSIP YANG SERING DITANYAKAN
- Satu kartu kontrak = satu dokumen kontrak + satu BAST. No. Kontrak & No. BAST tidak boleh dipakai dua kali di SKPD yang sama. Beda BAST = buat kartu kontrak baru.
- Kolom "Harga / item" = HARGA SATUAN per barang, BUKAN total. Contoh: 2 laptop total Rp20.000.000 → Kuantitas 2, Harga / item 10.000.000.
- Kuantitas lebih dari 1 langsung DIPECAH jadi beberapa baris barang terpisah (1 baris = 1 unit), supaya spesifikasi & foto bisa diisi per unit.
- Barang baru resmi tercatat (muncul di Daftar Barang & Penyusutan) SETELAH kontraknya disetujui. Pembuat kartu tidak boleh menyetujui kartunya sendiri.

A. ENTRY BELANJA MODAL NON KONSTRUKSI (mis. laptop, kendaraan, meubelair)
1. Pilih Lokasi / SKPD di atas.
2. Klik **+ Tambah Pengadaan** → pilih **Non Konstruksi**.
3. Kartu 1 — Kontrak: pilih Sumber Pengadaan (bentuk kontrak, mis. SPK/Surat Pesanan), isi No. Kontrak (wajib), Tgl Kontrak, pilih Program / Kegiatan / Sub Kegiatan, Nama PPK, Nama Penyedia, Keterangan Kontrak.
4. Kartu 2 — BAST: isi No. BAST, Tgl BAST (= tanggal perolehan barang; tidak boleh lebih awal dari tgl kontrak), Keterangan BAST, lalu UNGGAH dokumen BAST (wajib, tanpa ini kontrak tidak bisa disimpan).
5. Klik **Simpan Kontrak**. Kartu muncul berstatus menunggu persetujuan, masih kosong barangnya.
6. Di kartu itu klik **+ Tambah Barang**, lalu isi berurutan:
   - Kode Rekening Belanja (cari & pilih sampai Sub Rincian Objek) — wajib.
   - Jenis BMD (mis. 1.3.2 Peralatan dan Mesin) — wajib.
   - Ketik kode/nama baku di kotak Cari (mis. "laptop") → klik **Cari** → klik kode barang yang sesuai di daftar hasil.
   - Satuan, Kuantitas, Harga / item — ketiganya wajib.
7. Klik **Tambah ke Draft**. Barang masuk ke tabel kartu (dipecah per unit kalau kuantitas > 1).
8. Centang barangnya → klik **✎ Edit Spesifikasi** → isi spesifikasi (nama/merek/nomor seri, dst. — kolomnya menyesuaikan jenis aset) & UNGGAH FOTO. Boleh centang banyak sekaligus kalau jenis asetnya sama. Foto wajib: kartu tidak bisa disetujui kalau ada barang tanpa foto.
9. Pakai **🔍 Pratinjau** untuk mengecek kolom yang masih kosong.
10. Pengurus Barang / admin (bukan pembuat kartu) klik **Setujui**.

B. SATU KODE REKENING, BEBERAPA JENIS BARANG (mis. 5.2.02.05 Alat Kantor untuk laptop + printer)
- Tetap SATU kartu kontrak (langkah 1–5 di atas, sekali saja).
- Ulangi **+ Tambah Barang** untuk TIAP jenis barang: pilih kode rekening yang SAMA, lalu kode barang, satuan, kuantitas & harga satuan masing-masing → **Tambah ke Draft**.
- Setelah semua masuk, isi spesifikasi & foto, lalu disetujui.

C. BEBERAPA KODE REKENING, BEBERAPA JENIS BARANG
- Kalau semuanya dalam SATU kontrak & SATU BAST: tetap satu kartu. Ulangi **+ Tambah Barang** per jenis barang, dan di tiap kali tambah pilih kode rekening yang sesuai untuk barang itu (kode rekening dipilih per baris barang, bukan per kontrak).
- Kalau BAST-nya berbeda: buat kartu kontrak terpisah untuk tiap BAST.
- Kalau muncul peringatan "kode rekening tidak cocok dengan jenis BMD", periksa lagi: belanja modal tiap jenis aset punya rekening sendiri (mis. Peralatan & Mesin vs Gedung). Boleh tetap dilanjutkan kalau memang disengaja.

D. ASET TETAP LAINNYA DENGAN KUANTITAS BANYAK (buku, hewan, tanaman, dst.)
- JANGAN diisi per eksemplar — 700 buku dengan Kuantitas 700 akan menjadi 700 baris barang.
- Aturannya: SATU judul buku / SATU jenis hewan = SATU baris barang.
  - Jenis BMD: 1.3.5 Aset Tetap Lainnya, pilih kode barangnya.
  - Kuantitas: 1.
  - Harga / item: TOTAL harga seluruh eksemplar judul/jenis itu (mis. 300 eksemplar × Rp50.000 → isi 15.000.000).
  - Satuan: pilih satuan paket/set dari daftar satuan.
  - Jumlah eksemplar & judulnya ditulis di spesifikasi lewat ✎ Edit Spesifikasi (mis. "Buku Matematika Kelas 7, 300 eksemplar").
- Judul atau jenis yang BERBEDA = baris berbeda (ulangi + Tambah Barang), masing-masing dengan total harganya sendiri.

E. BELANJA KONSTRUKSI — SATU GEDUNG/BANGUNAN ATAU SATU JALAN
Pekerjaan konstruksi dicatat dulu sebagai KDP (1.3.6 Konstruksi Dalam Pengerjaan), bukan langsung Gedung/Jalan.
1. Pilih Lokasi / SKPD → klik **+ Tambah Pengadaan** → pilih **Konstruksi**.
2. Isi form kontrak: Nama Pekerjaan (wajib), Bentuk Kontrak (Dokumen Sumber), No. Dokumen Kontrak & Tgl Dokumen Kontrak (wajib), Program / Kegiatan / Sub Kegiatan, Nama PPK, Nama Penyedia, Nilai Kontrak Pekerjaan (Rp), Keterangan Kontrak → **Simpan Kontrak**.
3. Di kartu kontrak klik **+ Tambah Barang KDP**: pilih Kode Barang (golongan 1.3.6), isi Nama Barang KDP (mis. "Pembangunan Gedung Kantor"), jawab "Menambah masa manfaat aset yang sudah tercatat?" (Ya kalau ini rehab gedung/jalan yang sudah ada — pilih asetnya; Tidak kalau bangunan baru) → **+ Tambah**.
4. Di kartu barang KDP klik **+ Tambah Rincian / Pembayaran** untuk tiap pembayaran/termin: pilih Komponen (Perencanaan / Fisik / Biaya Umum / Pengawasan), Nomor BAST, Tanggal BAST (tidak boleh sebelum tgl kontrak), UNGGAH dokumen BAST (wajib), Kode Rekening Belanja, Nominal (Rp), Keterangan → **+ Tambah Rincian**. Ulangi untuk termin berikutnya.
5. Nilai barang KDP = jumlah semua rincian/pembayarannya (dihitung otomatis).
6. Isi spesifikasi & foto barang KDP lewat ✎ Edit Spesifikasi (foto wajib sebelum disetujui).
7. Pengurus Barang / admin (bukan pembuat) klik **✓ Setujui Kontrak**.
8. Setelah pekerjaan SELESAI, barang KDP direklasifikasi ke golongan tujuan (Gedung & Bangunan / Jalan, Jaringan, Irigasi) lewat menu Pembukuan → Pengelolaan → **Reklasifikasi**. Untuk rehab aset lama, sesudah direklas digabungkan ke induknya lewat menu **Kapitalisasi**.

F. BELANJA KONSTRUKSI — BEBERAPA GEDUNG / BEBERAPA RUAS JALAN
- Kalau dalam SATU kontrak: tetap satu kartu kontrak (langkah E.1–E.2 sekali). Lalu klik **+ Tambah Barang KDP** berulang, SATU barang per gedung / per ruas jalan (mis. "Rehab Ruas Jalan A", "Rehab Ruas Jalan B").
- Tiap barang KDP punya rincian pembayarannya SENDIRI — tambahkan lewat **+ Tambah Rincian / Pembayaran** di kartu barang masing-masing.
- Persetujuan berlaku untuk seluruh kontrak sekaligus (semua barang KDP disetujui bersamaan).
- Kalau kontraknya berbeda: buat kartu kontrak terpisah.`

const DAFTAR: Panduan[] = [
  {
    path: ['/dashboard/pembukuan/perolehan/pengadaan'],
    kunci: /pengadaan|belanja modal|konstruksi|\bkdp\b|entry|input barang|tambah barang|kode rekening|aset tetap lainnya|\batl\b|eksemplar/i,
    teks: PENGADAAN,
  },
]

/** Hanya pathname polos yang dipercaya dari klien — konteks ini masuk ke
 *  system prompt, jadi teks bebas dari klien tak boleh ikut masuk. */
export function bersihkanPath(raw: string): string {
  const p = raw.split(/[?#,\s]/)[0] || ''
  return /^\/[a-zA-Z0-9/_\-[\]]{0,200}$/.test(p) ? p : ''
}

/** Panduan yang relevan untuk halaman & pertanyaan ini ('' kalau tak ada). */
export function panduanUntuk(pathname: string, pertanyaan: string): string {
  return DAFTAR
    .filter(d => d.path.some(p => pathname.startsWith(p)) || d.kunci.test(pertanyaan))
    .map(d => d.teks)
    .join('\n\n')
}
