// Nama berkas laporan — SATU aturan untuk seluruh aplikasi.
//
// Susunannya ditetapkan user 2026-09-04:
//
//     <Nama Laporan>_<Tahun>_<Kode Jenis Aset>_<SKPD>[_<akhiran>]
//     Daftar Barang_2026-S1_1.3.2_Dinas Pendidikan.xlsx
//
// Sebelum ini tiap menu menamai berkasnya sendiri-sendiri dan hasilnya tak
// terbaca sebagai satu keluarga: `Daftar_Barang_1.3.2`, `kendaraan-dinas`,
// `RKBMD-Ditetapkan-2027`, `uji-konsistensi-2026-S1`, `rekap saldo awal`,
// `Laporan_Pengamanan`. Sebagian bahkan tak menyebut SKPD sama sekali, jadi
// begitu operator mengekspor SKPD kedua, berkas pertamanya TERTIMPA di folder
// Unduhan tanpa satu pun peringatan.
//
// ⚠️ DUA KEPUTUSAN USER yang menentukan bentuk tiap nama — jangan dibalik
// tanpa memintanya lagi:
//
// 1. **Semester IKUT dibawa** (`2026-S1`), bukan tahunnya saja. Laporan
//    semesteran itu mayoritas di aplikasi ini (Daftar Barang, Penyusutan,
//    Laporan BMD, Rekonsiliasi); tanpa penanda semester, berkas Semester I dan
//    Semester II bernama SAMA PERSIS dan yang kedua menimpa yang pertama.
//    Tetap diawali tahun, jadi urutannya benar kalau folder disortir by nama.
//
// 2. **Filter kosong DITULIS APA ADANYA**, bukan dihilangkan: jenis aset kosong
//    → "Semua Jenis", SKPD kosong → "Kab Kediri". Susunan empat bagiannya jadi
//    selalu utuh, sehingga posisi tiap bagian bisa dipercaya. Kalau yang kosong
//    dibuang, `Daftar Barang_2026-S1_Dinas Pendidikan` tak bisa dibedakan dari
//    nama yang justru bagian SKPD-nya yang hilang.
//
// ⚠️ Satu-satunya bagian yang BOLEH absen adalah Tahun, dan hanya untuk laporan
// yang memang tak punya dimensi waktu sama sekali — KIR & Pengamanan menampilkan
// POSISI TERKINI, bukan rentang periode. Mengarang tahun di situ (mis. tahun
// berjalan) akan membuat berkas seolah menyatakan cakupan yang tak pernah
// difilter. Jenis aset & SKPD tak pernah absen: keduanya selalu punya jawaban,
// walau jawabannya "semua".

/**
 * Karakter yang DITOLAK dialog "Save as" Windows. Nama SKPD di data ini boleh
 * memuat garis miring ("Dinas A / B"), jadi tanpa penyaringan ini dialognya
 * menolak menyimpan — dan untuk unduhan Excel, peramban diam-diam memotong
 * namanya di karakter itu.
 */
const TERLARANG = /[\\/:*?"<>|]/g

/** Batas panjang per bagian. Nama SKPD terpanjang di data ini 58 karakter. */
const MAKS_BAGIAN = 70

/**
 * Rapikan satu bagian nama berkas.
 *
 * ⚠️ Garis bawah di DALAM bagian diubah jadi spasi. `_` adalah pemisah antar
 * bagian, jadi membiarkannya di dalam bagian membuat susunan empat bagiannya
 * tak bisa dibaca balik (`Laporan_Pemanfaatan_2026_…` terlihat seperti lima
 * bagian). Ini juga yang merapikan nama-nama lama seperti `Daftar_Barang`.
 */
export function bagianNamaBerkas(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replace(TERLARANG, '-')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAKS_BAGIAN)
    .trim()
}

/** Jenis aset tak difilter. */
export const SEMUA_JENIS = 'Semua Jenis'
/** SKPD tak difilter — laporannya mencakup seluruh kabupaten. */
export const SE_KABUPATEN = 'Kab Kediri'

export type BagianLaporan = {
  /** Nama laporan sebagaimana dikenal operator, mis. "Daftar Barang". WAJIB. */
  laporan: string
  /**
   * `'2026-S1'` (semesteran) atau `2026` / `'2026'` (tahunan).
   * Kosongkan HANYA kalau laporannya tak punya dimensi waktu sama sekali —
   * lihat catatan di kepala berkas ini.
   */
  periode?: string | number | null
  /** Kode golongan, mis. `'1.3.2'`. Kosong/null → "Semua Jenis". */
  golongan?: string | null
  /** Nama SKPD terpilih. Kosong/null → "Kab Kediri". */
  skpd?: string | null
  /**
   * Ditempel SESUDAH keempat bagian baku: 'Audit', 'per SKPD', 'Model 3', dst.
   * Ada supaya varian sebuah laporan tak perlu menyelundup ke bagian `laporan`
   * dan menggeser posisi bagian yang lain.
   */
  akhiran?: (string | number | null | undefined)[]
}

/**
 * Nama berkas laporan tanpa ekstensi — dipakai Export Excel MAUPUN nama bawaan
 * "Save as PDF" (lewat `document.title`).
 *
 * ⚠️ Pemanggil TIDAK perlu (dan tak boleh) menyiapkan sendiri "Semua Jenis" /
 * "Kab Kediri": cukup oper nilai filternya apa adanya, termasuk `null`. Kalau
 * tiap menu mengisi penggantinya sendiri, cepat atau lambat ada yang menulisnya
 * beda ("Semua", "semua jenis", "Se-Kabupaten") dan keluarga namanya pecah lagi.
 */
export function namaBerkasLaporan(b: BagianLaporan): string {
  const bagian = [
    bagianNamaBerkas(b.laporan),
    // Tahun boleh absen — dan HANYA tahun. Lihat catatan di kepala berkas.
    bagianNamaBerkas(b.periode),
    bagianNamaBerkas(b.golongan) || SEMUA_JENIS,
    bagianNamaBerkas(b.skpd) || SE_KABUPATEN,
    ...(b.akhiran ?? []).map(bagianNamaBerkas),
  ]
  return bagian.filter(x => x !== '').join('_')
}

// ⚠️ Perakit nama berkas BEBAS (`namaBerkasCetak`) sudah DICABUT 2026-09-04.
// Ia tinggal melayani dua lembar — Surat Pernyataan Pengadaan & Berita Acara
// Rekonsiliasi — yang sempat dikecualikan karena "bukan laporan periodik", lalu
// user memutuskan keduanya ikut seragam. Selama ia masih ada, ia jadi pintu
// kedua yang meloloskan nama berkas di luar susunan baku TANPA ada yang
// menggagalkannya. Kalau kelak ada lembar yang benar-benar tak bisa memakai
// `namaBerkasLaporan`, tambahkan bagiannya di sana — jangan hidupkan lagi
// perakit bebasnya.
