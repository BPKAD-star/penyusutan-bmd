import * as XLSX from 'xlsx'

/**
 * @param catatan Baris peringatan/keterangan yang ditulis DI ATAS tabel.
 *
 * Ada karena peringatan yang cuma tampil di layar tidak ikut ke mana-mana:
 * begitu berkasnya diunduh lalu dikirim ke inspektorat/BPK, pembacanya tak
 * punya cara tahu ada yang perlu diperhatikan. Berkas Excel-lah yang beredar,
 * bukan layarnya — jadi peringatan yang menyertai angka WAJIB ikut ke dalamnya.
 * Pola yang sama sudah pernah menggigit di modul lain (CLAUDE.md: "Excel
 * setengah jadi yang terlanjur terunduh tak punya tanda apa pun").
 */
export function exportToExcel(
  data: Record<string, unknown>[], filename: string, sheetName = 'Data', catatan?: string[],
) {
  // Tanpa catatan: perilaku lama persis (tabel mulai di A1).
  // `['']`, BUKAN `[]`: baris kosong tanpa sel sama sekali tidak memperluas
  // range, jadi `origin:-1` menempelkan tabelnya persis di bawah kalimat
  // peringatan tanpa pemisah. Satu sel kosong yang memaksa barisnya ada.
  const ws = catatan?.length
    ? XLSX.utils.aoa_to_sheet([...catatan.map(c => [c]), ['']])
    : XLSX.utils.json_to_sheet(data)
  if (catatan?.length) XLSX.utils.sheet_add_json(ws, data, { origin: -1 })
  const wb = XLSX.utils.book_new()

  // Auto column width — DIHITUNG DARI DATA SAJA, bukan dari `catatan`. Kalimat
  // peringatan panjangnya ratusan karakter; kalau ikut dihitung, kolom pertama
  // jadi selebar layar dan tabelnya tak terbaca. Teksnya cukup meluber ke
  // kolom sebelahnya seperti catatan pada umumnya.
  const cols = Object.keys(data[0] || {}).map(key => ({
    wch: Math.max(key.length, ...data.map(r => String(r[key] ?? '').length).slice(0, 100)) + 2
  }))
  ws['!cols'] = cols

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// Angka polos id-ID (titik ribuan, koma desimal kalau ada) — TANPA "Rp", biar
// gak berisik dibaca di tabel yang padat (keputusan user 2026-07-08).
export function formatRupiah(val: number | null | undefined): string {
  if (val == null) return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val)
}

/**
 * Sama dengan `formatRupiah` tapi **SELALU dua angka di belakang koma**
 * (`2.400.000,00`), termasuk untuk angka bulat.
 *
 * Latar (keputusan user 2026-09-09): lima menu yang menampilkan angka rupiah
 * yang SAMA — Saldo Awal → Rekapitulasi, Laporan BMD (Model 1/2/3), Saldo Awal
 * → Daftar Barang Awal, Daftar Barang, & Penyusutan — dulu formatnya
 * berbeda-beda: sebagian `maximumFractionDigits: 0` (desimalnya DIBULATKAN
 * hilang), sebagian `maximumFractionDigits: 2` tanpa minimum (jadi
 * `3.082.881,75` bersebelahan dengan `2.400.000`). Akibatnya satu angka yang
 * sama terbaca berbeda tergantung menunya, dan yang berdesimal terlihat seperti
 * anomali padahal justru yang bulat itu hasil pembulatan tampilan.
 *
 * ⚠️ MURNI TAMPILAN — yang dijumlah & yang masuk Excel selalu nilai penuhnya.
 * Di Daftar Barang / Daftar Barang Awal fungsi ini hanya dipakai `cellContent`
 * (layar); `cell()`/`cellValue()` untuk Export tetap mengembalikan angka mentah
 * supaya selnya bertipe angka di Excel, bukan teks.
 *
 * ⚠️ Sejak 2026-09-18, TAMPILAN LAYAR di seluruh aplikasi sudah disatukan ke
 * fungsi ini — bukan lagi 8 menu dari ~75 pemakai `formatRupiah`. `formatRupiah`
 * (0–2 desimal) SENGAJA TIDAK ikut & kini HANYA dipakai dua kelas berkas:
 * (1) lembar cetak Permendagri (`app/cetak/**`, `components/pelaporan/
 * Lembar*.tsx`) — lebar kolomnya sudah disetel ketat (IV.A/B/C/D/F/G/J/K);
 * menambah ",00" di sana berisiko menggeser kolom & baru ketahuan sesudah
 * kertasnya keluar; (2) `angkaBA` (lib/beritaAcaraRekon.ts) — konvensi Berita
 * Acara sendiri (0 desimal + tanda kurung akuntansi utk nilai negatif).
 * Menyatukan keduanya ke layar BUKAN pekerjaan putaran ini — risikonya beda
 * (kertas, bukan layar) & sengaja ditunda sbg keputusan terpisah.
 */
export function formatRupiah2(val: number | null | undefined): string {
  if (val == null) return '-'
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(val)
}
