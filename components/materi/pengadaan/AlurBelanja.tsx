'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide 2: gambaran besar proses
// belanja modal dari kontrak sampai neraca (permintaan user 2026-10-07, mengikuti
// bagan buatannya). Diagram, bukan tiruan layar: simpul + panah digambar di
// kanvas 1152×474 px (area isi SlideTerang) dengan posisi px TETAP.
//
// ⚠️ Urutan & pelaku di bagan ini PROSES DI LUAR APLIKASI (kontrak, BAST,
// pencairan oleh bendahara) yang disampaikan user — bukan sesuatu yang dihitung
// atau ditegakkan kode. Yang terkait aplikasi: entry Pengadaan (Pengadaan.tsx),
// tombol "📜 Surat Pernyataan" di kartu kontrak yang sudah disetujui
// (app/cetak/surat-pernyataan-pengadaan), menu LRA, dan Rekonsiliasi BMD. Kalau
// proses di lapangan berubah, bagan ini disesuaikan manual.
import { useId, type ReactNode } from 'react'
import { SlideTerang, Ikon, d } from '../bagian'
import { MATERI } from './bahan'

const LEBAR = 156
const X = [0, 199, 398, 597, 796, 995]   // kolom simpul utama (6 tahap) — selisih 199 = lebar + jarak panah
const Y_UTAMA = 105, T_UTAMA = 62        // baris utama: tengahnya y=136
const GARIS = '#334155'

function Tahap({ no, x, y, h = T_UTAMA, nada, jeda, children }: {
  no: number; x: number; y: number; h?: number; nada?: 'app' | 'akhir'; jeda: number; children: ReactNode
}) {
  const gaya = nada === 'app' ? 'border-teal bg-teal/10 text-teal font-bold ring-4 ring-teal/15'
    : nada === 'akhir' ? 'border-navy bg-navy text-white font-bold'
    : 'border-gray-300 bg-white text-gray-800 font-semibold'
  return (
    <div className="mt-pop absolute" style={{ left: x, top: y, width: LEBAR, height: h, ...d(jeda) }}>
      <div className={`relative w-full h-full rounded-xl border-2 shadow-sm flex items-center justify-center text-center px-2 text-[16px] leading-tight ${gaya}`}>
        {children}
        <span className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-navy text-white text-[12px] font-bold flex items-center justify-center ring-2 ring-white">{no}</span>
      </div>
    </div>
  )
}

function Pelaku({ x, y, jeda, children }: { x: number; y: number; jeda: number; children: ReactNode }) {
  return (
    <div className="mt-pop absolute" style={{ left: x, top: y, width: LEBAR, height: 50, ...d(jeda) }}>
      <div className="w-full h-full rounded-full border border-navy/25 bg-navy/[0.07] flex items-center justify-center gap-2 text-[16px] font-semibold text-navy">
        <Ikon nama="orang" ukuran={18} className="flex-shrink-0" />{children}
      </div>
    </div>
  )
}

const Nomor = ({ n }: { n: string }) => (
  <span className="inline-flex w-6 h-6 rounded-full bg-navy text-white text-[12px] font-bold items-center justify-center flex-shrink-0">{n}</span>
)

const PENJELASAN: { nomor: string[]; judul: string; isi: ReactNode }[] = [
  { nomor: ['3'], judul: 'Entry di aplikasi',
    isi: <>Pengurus Barang mengentry <b>kontrak, BAST, barang, dan foto</b>. Setelah disetujui, kartu kontrak menampilkan tombol <b>📜 Surat Pernyataan</b>.</> },
  { nomor: ['4', '5'], judul: 'Surat dulu, baru dicairkan',
    isi: <>Surat menyatakan barang <b>sudah tercatat sebagai BMD</b>. Bendahara memakainya sebagai bukti sebelum <b>mencairkan belanja</b>.</> },
  { nomor: ['6', '7', '8'], judul: 'Dicocokkan, direkon, masuk neraca',
    isi: <>Realisasi di <b>LRA</b> dicocokkan dengan entry; selisihnya dijelaskan. Lalu <b>rekonsiliasi</b> BMD dengan keuangan, dan saldo <b>intrakomptabel</b> masuk neraca.</> },
]

export function AlurBelanjaModal() {
  const m = `mt-panah-${useId().replace(/:/g, '')}`   // id marker WAJIB unik per slide (semua slide ada di DOM)
  // Fungsi biasa (bukan komponen bersarang) — dipanggil langsung di dalam <svg>.
  const panah = (garis: string, jeda: number, titik = false) => (
    <path key={garis} d={garis} fill="none" stroke={GARIS} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={titik ? '2 7' : undefined}
      markerEnd={`url(#${m})`} className="mt-in" style={d(jeda)} />
  )
  return (
    <SlideTerang materi={MATERI} label="Gambaran besar" judul="Dari kontrak sampai neraca">
      <div className="absolute inset-0">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1152 474" aria-hidden>
          <defs>
            <marker id={m} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill={GARIS} />
            </marker>
          </defs>
          {panah('M78,54 L78,100', 300)}
          {[450, 650, 850, 1000, 1250].map((jeda, i) => panah(`M${X[i] + LEBAR + 4},136 L${X[i + 1] - 6},136`, jeda))}
          {panah('M277,171 C277,238 330,240 392,240', 750, true)}
          {panah('M476,211 L476,171', 900)}
          {panah('M675,101 C675,30 735,25 790,25', 1000, true)}
          {panah('M874,54 L874,100', 1200)}
          {panah('M1073,171 L1073,211', 1400)}
          {panah('M1073,281 L1073,316', 1550)}
        </svg>

        <Pelaku x={X[0]} y={0} jeda={200}>PPK / Keuangan</Pelaku>
        <Pelaku x={X[4]} y={0} jeda={1100}>Bendahara</Pelaku>
        <Pelaku x={X[2]} y={215} jeda={800}>Pengurus Barang</Pelaku>

        <Tahap no={1} x={X[0]} y={Y_UTAMA} jeda={300}>Kontrak</Tahap>
        <Tahap no={2} x={X[1]} y={Y_UTAMA} jeda={500}>BAST</Tahap>
        <Tahap no={3} x={X[2]} y={Y_UTAMA} nada="app" jeda={700}>Entry Belanja Modal</Tahap>
        <Tahap no={4} x={X[3]} y={Y_UTAMA} jeda={900}>Surat Pernyataan Verifikasi</Tahap>
        <Tahap no={5} x={X[4]} y={Y_UTAMA} jeda={1050}>Pencairan Belanja</Tahap>
        <Tahap no={6} x={X[5]} y={Y_UTAMA} nada="app" jeda={1300}>LRA vs Belanja Modal</Tahap>
        <Tahap no={7} x={X[5]} y={215} jeda={1450}>Rekonsiliasi BMD vs Keuangan</Tahap>
        <Tahap no={8} x={X[5]} y={320} h={50} nada="akhir" jeda={1600}>Neraca</Tahap>

        <div className="mt-in absolute flex items-center gap-5 text-[13px] text-gray-500" style={{ left: 200, top: 8, ...d(1800) }}>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 border-teal bg-teal/10" />dikerjakan di aplikasi</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-full border border-navy/25 bg-navy/[0.07]" />pelaku</span>
          <span className="inline-flex items-center gap-1.5"><svg width="26" height="6" aria-hidden><line x1="1" y1="3" x2="25" y2="3" stroke={GARIS} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 6" /></svg>dokumen diserahkan</span>
        </div>

        <div className="absolute grid grid-cols-3 gap-4" style={{ left: 0, top: 305, width: 945 }}>
          {PENJELASAN.map((p, i) => (
            <div key={p.judul} className="mt-up rounded-xl border border-gray-200 bg-white shadow-md px-4 py-3.5" style={d(1700 + i * 170)}>
              <div className="flex items-center gap-1.5 mb-2">{p.nomor.map(n => <Nomor key={n} n={n} />)}<p className="ml-1 text-[16.5px] font-bold text-navy leading-tight">{p.judul}</p></div>
              <p className="text-[14.5px] leading-snug text-gray-600">{p.isi}</p>
            </div>
          ))}
        </div>
      </div>
    </SlideTerang>
  )
}
