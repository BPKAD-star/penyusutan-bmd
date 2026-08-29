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
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { cssCetakLembar } from '@/lib/cetakLembar'

const KABUPATEN = 'Kediri'

/** id elemen lembar — dipakai penyusun CSS & markup halaman pemakainya. */
export const ID_CETAK_LAPORAN = 'cetak-laporan'

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/** Aturan cetak. Dipasang sekali per halaman laporan. */
export function GayaCetakLaporan() {
  // Mekanik isolasinya (visibility, @page, thead berulang, print-color-adjust)
  // dipegang `cssCetakLembar` — SATU sumber untuk semua lembar cetak sejak
  // 2026-08-29. Yang tinggal di sini cuma aturan khas laporan pengelolaan:
  // memadatkan tabel & membuka pemotongan/scroll milik tampilan layar.
  return (
    <style>{cssCetakLembar({
      id: ID_CETAK_LAPORAN,
      kertas: 'A4 lanskap',
      margin: '0.8cm',
      tambahan: `
        #${ID_CETAK_LAPORAN} .kop-cetak { display: block !important; }
        #${ID_CETAK_LAPORAN} .card { box-shadow: none; border: 0; border-radius: 0; margin: 0; }
        #${ID_CETAK_LAPORAN} table { font-size: 8px; width: 100%; }
        #${ID_CETAK_LAPORAN} th, #${ID_CETAK_LAPORAN} td { padding: 1px 3px !important; line-height: 1.25; }
        #${ID_CETAK_LAPORAN} .overflow-x-auto, #${ID_CETAK_LAPORAN} .overflow-auto,
        #${ID_CETAK_LAPORAN} .overflow-hidden { overflow: visible !important; }
        #${ID_CETAK_LAPORAN} .max-h-\\[65vh\\] { max-height: none !important; }`,
    })}</style>
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

/**
 * Konfirmasi "laporannya besar, yakin dicetak?" — mengembalikan `true` kalau
 * boleh lanjut. Di bawah ambang, ia langsung `true` tanpa bertanya apa pun.
 *
 * ⚠️ HOOK, bukan fungsi biasa, dan itu memaksa pemakaian yang benar. Versi
 * lamanya `konfirmasiCetakBanyak(n): boolean` yang memanggil `confirm()`
 * bawaan; mengubahnya jadi async DENGAN NAMA YANG SAMA akan lolos typecheck di
 * pemanggil lama (`if (!promise)` selalu false) dan diam-diam mencetak tanpa
 * pernah bertanya. Nama baru membuat pemanggil yang belum disesuaikan GAGAL
 * dikompilasi — satu-satunya cara memastikan tak ada yang terlewat.
 */
export function useKonfirmasiCetak(): (n: number) => Promise<boolean> {
  const konfirmasi = useKonfirmasi()
  return async (n: number) => {
    if (n <= AMBANG_CETAK) return true
    return (await konfirmasi({
      nada: 'amber', ikon: '🖨', judul: 'Laporan ini besar — tetap cetak?',
      rincian: [{ label: 'Jumlah baris', nilai: `${n.toLocaleString('id-ID')} baris` }],
      isi: <>Menyiapkan PDF sebanyak itu bisa membuat peramban <b>lambat atau berhenti merespons</b> beberapa
        saat, dan hasilnya puluhan halaman.</>,
      peringatan: <>Untuk keperluan arsip, <b>Export Excel</b> jauh lebih ringan &amp; lebih mudah
        ditelusuri.</>,
      labelYa: 'Tetap cetak',
      labelBatal: 'Batal',
    })).ya
  }
}
