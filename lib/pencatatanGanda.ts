// ============================================================================
// Aturan **Koreksi Pencatatan Ganda** — barang yang tercatat DUA KALI, salah
// satunya dibuang (survivor tetap, duplikatnya dinonaktifkan).
//
// Diangkat dari `KoreksiForm` 2026-09-15 (REFACTOR-PLAN Fase 3).
//
// ⚠️ **BUKAN Penggabungan, dan menukarnya merusak neraca diam-diam.**
// Pencatatan Ganda = satu barang kecatat dua kali → duplikat dibuang, total
// nilai **TURUN**. Penggabungan = satu barang TERPECAH jadi banyak baris →
// nilai **DIJUMLAHKAN**, total TETAP. Memakai menu yang keliru untuk kasus
// "pagar 35 baris" menghapus Rp24.531.000 dari neraca tanpa satu pun error.
// Lihat lib/penggabunganNilai.ts.
//
// Dikunci lib/pencatatanGanda.test.ts.
// ============================================================================

/** Tahun perolehan untuk perbandingan & tampilan; `-` bila tanggalnya kosong. */
export const tahunDari = (tgl: string | null) => tgl ? tgl.slice(0, 4) : '-'

export type KandidatGanda = {
  id: string
  kode: string
  nama_barang: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
}

/**
 * Perbedaan antar kandidat duplikat.
 *
 * ⚠️ **`kode` BERBEDA KELASNYA dari tiga yang lain, dan itu inti fungsi ini.**
 * Kode barang yang berbeda berarti barangnya memang BUKAN duplikat — itu
 * pemblokir, dan yang benar menu Reklasifikasi. Nama/nilai/tahun yang berbeda
 * cuma PERINGATAN: duplikat hasil impor e-BMD memang sering beda ejaan nama
 * atau beda nilai karena salah satunya sudah dikoreksi.
 *
 * Menyamakan keempatnya (semua memblokir, atau semua sekadar memperingatkan)
 * TIDAK menghasilkan error: yang pertama membuat koreksi duplikat yang sah
 * jadi mustahil, yang kedua meloloskan penggabungan dua barang berbeda jadi
 * satu. Dua-duanya senyap.
 *
 * Satu kandidat (atau nol) → semuanya `false`: belum ada yang bisa dibandingkan.
 *
 * ℹ️ Penjaga `banyak` sebenarnya REDUNDAN, dan itu dibuktikan mutasi (bukan
 * dugaan): `[].some(cb)` tak pernah menjalankan `cb` sehingga `a` yang
 * `undefined` tak melempar, dan pada SATU elemen `some` membandingkan elemen
 * itu dengan dirinya sendiri — selalu `false`. Mengubahnya jadi `length > 0`
 * TIDAK mengubah satu pun hasil. Dipertahankan apa adanya dari bentuk aslinya
 * (pengangkatan ini murni pindah) & dicatat di sini supaya pembaca berikutnya
 * tak menghabiskan waktu menulis test yang mustahil membedakannya.
 */
export function bedaKandidat(list: readonly KandidatGanda[]): {
  kode: boolean; nilai: boolean; tahun: boolean; nama: boolean
} {
  const banyak = list.length > 1
  const a = list[0]
  return {
    kode: banyak && list.some(k => k.kode !== a.kode),
    nilai: banyak && list.some(k => k.nilai_perolehan !== a.nilai_perolehan),
    tahun: banyak && list.some(k => tahunDari(k.tgl_perolehan) !== tahunDari(a.tgl_perolehan)),
    nama: banyak && list.some(k => (k.nama_barang || '') !== (a.nama_barang || '')),
  }
}
