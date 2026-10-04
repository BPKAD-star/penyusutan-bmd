'use client'
// Blok "Total" di pojok kanan atas menu Cara Perolehan: nilai (Rp) + KUANTITAS
// barang yang sudah dientry, dipecah disetujui / draft (permintaan user
// 2026-10-04). Gunanya membandingkan "berapa yang dientry" dengan "berapa yang
// sudah disetujui dan masuk Laporan Perolehan" tanpa membuka kartu satu-satu.
//
// ⚠️ Yang sebanding dengan Laporan Perolehan ("N transaksi") HANYA angka
// DISETUJUI — satu barang disetujui = satu baris ledger. Draft belum ada di
// ledger. Termin KDP (Pekerjaan Konstruksi) sengaja dihitung TERPISAH: Laporan
// Pengadaan tidak memuatnya, jadi menjumlahkannya ke "disetujui" membuat angka
// ini tak pernah cocok dengan laporan.
import { formatRupiah2 } from '@/lib/export'

export function TotalPerolehan({ label, nilai, disetujui, draft, kdp = 0 }: {
  label: string
  nilai: number
  /** Barang berstatus disetujui (= baris ledger di Laporan Perolehan). */
  disetujui: number
  /** Barang di kartu draft/pending (belum masuk ledger). */
  draft: number
  /** Barang KDP kontrak konstruksi (semua status) — di luar Laporan Pengadaan. */
  kdp?: number
}) {
  const total = disetujui + draft + kdp
  return (
    <div className="text-right flex-shrink-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{formatRupiah2(nilai)}</p>
      <p className="text-xs text-gray-500 mt-0.5"
        title="Disetujui = sudah masuk Laporan Perolehan. Draft = masih menunggu persetujuan.">
        <span className="font-semibold text-gray-700">{total.toLocaleString('id-ID')} barang</span>
        {' · '}<span className="text-teal">{disetujui.toLocaleString('id-ID')} disetujui</span>
        {' · '}<span className="text-amber-600">{draft.toLocaleString('id-ID')} draft</span>
        {kdp > 0 && <>{' · '}<span className="text-indigo-600">{kdp.toLocaleString('id-ID')} KDP</span></>}
      </p>
    </div>
  )
}

/** Hitung barang dari daftar jurnal Cara Perolehan non-konstruksi. */
export function hitungBarangJurnal(
  jurnals: { approval_status: string; lines: unknown[]; payload: { draft_items?: unknown[] } }[],
): { disetujui: number; draft: number } {
  let disetujui = 0, draft = 0
  for (const j of jurnals) {
    if (j.approval_status === 'disetujui') disetujui += j.lines.length
    else if (j.approval_status === 'pending') draft += (j.payload.draft_items || []).length
  }
  return { disetujui, draft }
}
