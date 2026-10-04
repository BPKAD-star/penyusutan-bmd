'use client'
// Slide penjelasan menu (6–22) dibingkai sbg SIDEBAR aplikasi: menu utama +
// sub-menunya di kiri, menu yang sedang dibahas menyala (permintaan user
// 2026-10-04). Pohon menunya DISALIN dari components/Sidebar.tsx (tampilan
// pengurus barang) — kalau menu di aplikasi berganti nama/urutan, ubah di sini
// juga (tak ada kode yang menjaganya selain pembacaan manual).
import type { ReactNode } from 'react'
import { Ikon, Kaki, d, type NamaIkon } from './bagian'

type Nav = { l: string; ikon?: NamaIkon; k?: Nav[] }

const daftar = (...l: string[]): Nav[] => l.map(x => ({ l: x }))

export const NAV: Nav[] = [
  { l: 'Dashboard', ikon: 'rumah' },
  { l: 'Saldo Awal', ikon: 'buku', k: daftar('Rekapitulasi', 'Daftar Barang Awal') },
  {
    l: 'RKBMD', ikon: 'kalender', k: [
      { l: 'Standar Harga', k: daftar('Usulan Standar Harga', 'Validasi', 'Pelaporan') },
      { l: 'Perencanaan', k: daftar('Usulan RKBMD', 'Validasi', 'Pelaporan') },
    ],
  },
  {
    l: 'Pembukuan', ikon: 'pensil', k: [
      { l: 'Cara Perolehan', k: daftar('Pengadaan', 'Hibah', 'Tukar Menukar', 'Hasil Inventarisasi', 'Perolehan Lainnya') },
      {
        l: 'Pengelolaan', k: daftar('Penggunaan', 'Penerimaan Internal', 'Pengeluaran Internal', 'Pemanfaatan',
          'Reklasifikasi', 'Koreksi', 'Kapitalisasi', 'Pengamanan', 'Penghapusan', 'WasDal'),
      },
      { l: 'LRA' }, { l: 'KIR' },
    ],
  },
  { l: 'Inventarisasi', ikon: 'periksa', k: daftar('Lembar Kerja (LKI)', 'Validasi', 'Laporan Hasil (LHI)', 'Tindak Lanjut') },
  { l: 'GIS Tanah', ikon: 'peta' },
  { l: 'Kendaraan', ikon: 'truk' },
  { l: 'Daftar Barang', ikon: 'daftar' },
  { l: 'Penyusutan', ikon: 'turun' },
  { l: 'IPA', ikon: 'bola', k: daftar('Dashboard IPA', 'Capaian SKPD', 'Verifikasi', 'Pengaturan') },
  {
    l: 'Pelaporan', ikon: 'grafik', k: [
      { l: 'Laporan Perolehan', k: daftar('Laporan Pengadaan', 'Laporan Hibah', 'Laporan Tukar Menukar', 'Laporan Hasil Inventarisasi', 'Laporan Perolehan Lainnya') },
      { l: 'Laporan Pengelolaan', k: daftar('Laporan Penggunaan', 'Laporan Penerimaan Internal', 'Laporan Pengeluaran Internal', 'Laporan Pemanfaatan', 'Laporan Reklasifikasi', 'Laporan Koreksi', 'Laporan Kapitalisasi', 'Laporan Pengamanan', 'Laporan Penghapusan') },
      { l: 'Laporan BMD' }, { l: 'Rekonsiliasi BMD' }, { l: 'Rincian Transaksi (Bukti Dukung)' }, { l: 'Uji Konsistensi' }, { l: 'KIR' },
    ],
  },
  { l: 'Admin', ikon: 'orang', k: daftar('Usulan Pengurus Barang', 'Kodefikasi BMD', 'Dokumen Sumber', 'Notes') },
]

export const LEBAR_SIDEBAR = 236

/** Baris menu; `aktif` = jalur menu yang menyala, mis. "Pembukuan/Pengelolaan". */
function Baris({ n, jalur, aktif, depth, urut }: { n: Nav; jalur: string; aktif: string; depth: number; urut: { i: number } }) {
  const sama = jalur === aktif
  const leluhur = aktif.startsWith(jalur + '/')
  const terbuka = !!n.k && (sama || leluhur)
  const cls = sama ? 'bg-teal text-white font-medium' : leluhur ? 'bg-white/10 text-white font-medium' : 'text-white/60'
  const jeda = 150 + urut.i++ * 25
  return (
    <>
      <div className={`mt-kiri flex items-center gap-2.5 pr-2.5 h-[25px] rounded-md text-[13px] leading-none ${cls}`}
        style={{ paddingLeft: `${0.55 + depth * 0.8}rem`, ...d(jeda) }}>
        {n.ikon
          ? <Ikon nama={n.ikon} ukuran={15} className="flex-shrink-0" />
          : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sama ? 'bg-white' : 'bg-white/30'}`} />}
        <span className="truncate">{n.l}</span>
        {n.k && <span className={`ml-auto inline-block text-[11px] opacity-70 ${terbuka ? 'rotate-90' : ''}`}>›</span>}
      </div>
      {terbuka && n.k!.map(c => <Baris key={c.l} n={c} jalur={`${jalur}/${c.l}`} aktif={aktif} depth={depth + 1} urut={urut} />)}
    </>
  )
}

export function SidebarMock({ aktif }: { aktif: string }) {
  const urut = { i: 0 }
  return (
    <div className="absolute left-2 top-0 bottom-0 bg-gradient-to-b from-navy-dark via-navy to-navy-light px-2.5 pt-4 space-y-px" style={{ width: LEBAR_SIDEBAR - 8 }}>
      <p className="text-white/30 text-[10.5px] font-semibold uppercase tracking-wider px-2 mb-1.5">Menu</p>
      {NAV.map(n => <Baris key={n.l} n={n} jalur={n.l} aktif={aktif} depth={0} urut={urut} />)}
    </div>
  )
}

/**
 * Kerangka slide penjelasan menu: sidebar di kiri (menu yang dibahas menyala),
 * judul & isi di kanannya. Area isi = ±952×474 px.
 */
export function SlideSidebar({ aktif, label, judul, materi, children }: {
  aktif: string; label: string; judul: ReactNode; materi: string; children: ReactNode
}) {
  return (
    <div className="absolute inset-0 bg-white text-gray-800">
      <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-teal/[0.07]" />
      <div className="absolute left-0 top-0 h-full w-2 bg-gradient-to-b from-teal to-navy" />
      <SidebarMock aktif={aktif} />
      <div className="absolute right-14 top-12" style={{ left: LEBAR_SIDEBAR + 40 }}>
        <p className="mt-in flex items-center gap-3 text-[13px] font-semibold tracking-[0.18em] uppercase text-teal">
          <span className="mt-lebar inline-block w-10 h-[3px] bg-teal rounded-full" />{label}
        </p>
        <h2 className="mt-up mt-3 text-[34px] leading-[1.15] font-bold text-navy" style={d(80)}>{judul}</h2>
      </div>
      <div className="absolute right-14 top-[160px] bottom-[76px]" style={{ left: LEBAR_SIDEBAR + 40 }}>{children}</div>
      <Kaki materi={materi} kiri={LEBAR_SIDEBAR + 40} />
    </div>
  )
}
