import * as XLSX from 'xlsx'

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'Data') {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()

  // Auto column width
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
