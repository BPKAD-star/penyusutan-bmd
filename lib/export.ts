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
