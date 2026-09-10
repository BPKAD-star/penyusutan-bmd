'use client'
// Tombol "Cetak KIBAR" — cetak SELURUH kartu (identitas+spesifikasi+riwayat),
// beda dari PrintLabelButton yg cuma nyetak 1 label kecil. User pilih "Save as
// PDF" di dialog print browser buat dapet file PDF — nggak perlu dependency
// PDF generator baru (jsPDF/Puppeteer dkk terlalu berat utk Vercel serverless).
import { namaBerkasKibar } from '@/lib/kibarJenis'

export default function PrintPageButton({ nibar, namaBarang }: { nibar: string; namaBarang: string | null }) {
  const handlePrint = () => {
    // `document.title` = nama bawaan berkas saat "Save as PDF" — satu-satunya
    // cara menyetelnya dari halaman. Dipulihkan sesudah cetak supaya judul tab
    // tidak ikut berubah permanen (pola app/dashboard/pelaporan/rekonsiliasi).
    const judulAsli = document.title
    document.title = namaBerkasKibar(nibar, namaBarang)
    window.addEventListener('afterprint', () => { document.title = judulAsli }, { once: true })
    window.print()
  }
  return (
    <button onClick={handlePrint} className="btn-primary text-sm kibar-no-print">
      Cetak KIBAR (PDF)
    </button>
  )
}
