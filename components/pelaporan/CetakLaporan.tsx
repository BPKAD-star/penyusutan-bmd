'use client'
// Perkakas cetak/PDF bersama untuk modul Pelaporan.
//
// Pola yang sama dengan Rekonsiliasi BMD: PDF dihasilkan dengan MENCETAK halaman
// itu sendiri (`window.print()` → "Save as PDF"), BUKAN rute /cetak terpisah yang
// menghitung ulang. Alasannya sama: angka di layar sudah melewati filter,
// pembuangan baris `batal_*`, dan scope SKPD; menghitungnya lagi di halaman kedua
// membuka celah berkas PDF berbeda dari yang dilihat operator.
//
// Isolasi cetak memakai `visibility:hidden` atas `body *` lalu hanya
// `#cetak-laporan` yang ditampilkan — sengaja begitu supaya tidak perlu tahu
// susunan layout dashboard (sidebar, top bar). Kalau layoutnya berubah,
// cetakannya tetap bersih.
//
// Cara pakai di sebuah halaman laporan:
//   <GayaCetakLaporan />
//   <div id="cetak-laporan"> … <KopCetak … /> …tabel… </div>
//   — beri kelas `no-print` pada filter, tombol, dan catatan layar.

const KABUPATEN = 'Kediri'

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/** Aturan cetak. Dipasang sekali per halaman laporan. */
export function GayaCetakLaporan() {
  return (
    <style>{`
      @media print {
        @page { size: A4 landscape; margin: 0.8cm; }
        body { background: #fff; }
        body * { visibility: hidden; }
        #cetak-laporan, #cetak-laporan * { visibility: visible; }
        #cetak-laporan { position: absolute; left: 0; top: 0; width: 100%; }
        #cetak-laporan .no-print { display: none !important; }
        #cetak-laporan .kop-cetak { display: block !important; }
        #cetak-laporan .card { box-shadow: none; border: 0; border-radius: 0; margin: 0; }
        #cetak-laporan table { font-size: 8px; width: 100%; }
        #cetak-laporan th, #cetak-laporan td { padding: 1px 3px !important; line-height: 1.25; }
        /* Judul kolom diulang di tiap halaman — laporan pengelolaan sering
           berlembar-lembar, dan tabel tanpa kepala di halaman 2+ tak terbaca. */
        #cetak-laporan thead { display: table-header-group; }
        #cetak-laporan tr { break-inside: avoid; }
        #cetak-laporan .overflow-x-auto, #cetak-laporan .overflow-auto,
        #cetak-laporan .overflow-hidden { overflow: visible !important; }
        #cetak-laporan .max-h-\\[65vh\\] { max-height: none !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
  )
}

/** Kop Berita Acara — HANYA muncul di kertas (di layar filternya sudah bicara). */
export function KopCetak({ judul, baris }: { judul: string; baris: (string | null | undefined)[] }) {
  const isi = baris.filter(Boolean) as string[]
  return (
    <div className="kop-cetak hidden text-center mb-3">
      <p className="font-bold uppercase text-[12px]">Pemerintah Kabupaten {KABUPATEN}</p>
      <p className="font-bold uppercase text-[12px]">{judul}</p>
      {isi.map((b, i) => <p key={i} className="text-[11px]">{b}</p>)}
      <p className="text-[10px] mt-1">Dicetak {KABUPATEN}, {tglID()}</p>
    </div>
  )
}

/** Tombol "Export PDF". Dipisah supaya ketiga laporan memakai label & posisi sama. */
export function TombolCetak({ onClick, disabled, label = 'Export PDF' }: {
  onClick: () => void; disabled?: boolean; label?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary no-print">
      🖨 {label}
    </button>
  )
}

/** Ambang jumlah baris sebelum mencetak dianggap berat & operator dikonfirmasi.
 *  Bukan batas keras — sekadar mencegah browser membeku tanpa peringatan. */
export const AMBANG_CETAK = 3000

export function konfirmasiCetakBanyak(n: number): boolean {
  if (n <= AMBANG_CETAK) return true
  return confirm(
    `Laporan ini berisi ${n.toLocaleString('id-ID')} baris. Menyiapkan PDF sebanyak itu bisa membuat ` +
    `peramban lambat atau berhenti merespons beberapa saat, dan hasilnya puluhan halaman.\n\n` +
    `Untuk arsip, Export Excel jauh lebih ringan. Tetap lanjutkan mencetak?`,
  )
}
