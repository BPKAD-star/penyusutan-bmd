'use client'
// Tombol "Cetak KIBAR" — cetak SELURUH kartu (identitas+spesifikasi+riwayat),
// beda dari PrintLabelButton yg cuma nyetak 1 label kecil. User pilih "Save as
// PDF" di dialog print browser buat dapet file PDF — nggak perlu dependency
// PDF generator baru (jsPDF/Puppeteer dkk terlalu berat utk Vercel serverless).
export default function PrintPageButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary text-sm kibar-no-print">
      Cetak KIBAR (PDF)
    </button>
  )
}
