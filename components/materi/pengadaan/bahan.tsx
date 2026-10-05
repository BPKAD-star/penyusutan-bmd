'use client'
// Bahan peniru LAYAR APLIKASI untuk materi "Entry Belanja Modal · Pengadaan".
// Bentuknya dibuat mirip layar aslinya (kartu putih, isian berbingkai, tombol
// teal/kuning) supaya peserta mengenali layar yang sama persis di aplikasi.
//
// ⚠️ Label isian, tombol, & pesan di sini DISALIN dari layarnya
// (components/pengelolaan/Pengadaan.tsx, KonstruksiPengadaan.tsx,
// DokumenBastField.tsx, EditSpesifikasiModal.tsx). Kalau labelnya diganti di
// aplikasi, materi ini ikut disesuaikan — peserta mencari tulisan yang sama
// dengan yang ditunjukkan di paparan.
import type { ReactNode } from 'react'
import { d } from '../bagian'

export const MATERI = 'Entry Belanja Modal · Pengadaan'

const ARAH = { kanan: 'mt-kanan', kiri: 'mt-kiri', atas: 'mt-up', pop: 'mt-pop' } as const

/** Kartu putih ala layar aplikasi. */
export function KartuApp({ judul, jeda = 300, arah = 'kanan', aksen, className = '', children }: {
  judul?: ReactNode; jeda?: number; arah?: keyof typeof ARAH; aksen?: 'amber' | 'teal'; className?: string; children: ReactNode
}) {
  const tepi = aksen === 'amber' ? 'border-amber-300' : aksen === 'teal' ? 'border-teal/40' : 'border-gray-200'
  return (
    <div className={`${ARAH[arah]} rounded-xl border ${tepi} bg-white shadow-xl overflow-hidden ${className}`} style={d(jeda)}>
      {judul && <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-[13px] font-semibold text-gray-700">{judul}</div>}
      <div className="p-4">{children}</div>
    </div>
  )
}

/** Satu isian: label kecil + kotak. `sorot` = diberi cincin amber (perhatian). */
export function Isian({ label, nilai, wajib, sorot, kosong, className = '' }: {
  label: ReactNode; nilai?: ReactNode; wajib?: boolean; sorot?: boolean; kosong?: boolean; className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[11.5px] text-gray-500 mb-1 leading-tight">{label}{wajib && <span className="text-red-500"> *</span>}</p>
      <div className={`h-8 rounded-md border px-2.5 flex items-center text-[12.5px] truncate ${sorot ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50' : 'border-gray-300 bg-white'} ${kosong ? 'text-gray-400' : 'text-gray-700'}`}>
        {nilai}
      </div>
    </div>
  )
}

const TOMBOL = {
  utama: 'bg-teal text-white',
  sekunder: 'bg-white border border-gray-300 text-gray-700',
  kuning: 'bg-amber-500 text-white',
  merah: 'bg-red-600 text-white',
} as const

export function Tombol({ gaya = 'utama', className = '', children }: { gaya?: keyof typeof TOMBOL; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 h-8 text-[12.5px] font-medium whitespace-nowrap ${TOMBOL[gaya]} ${className}`}>{children}</span>
  )
}

/** Lencana kecil: `wajib` merah, `ok` teal, `info` abu. */
export function Lencana({ nada = 'wajib', children }: { nada?: 'wajib' | 'ok' | 'info' | 'amber'; children: ReactNode }) {
  const gaya = nada === 'wajib' ? 'bg-red-100 text-red-700' : nada === 'ok' ? 'bg-teal/15 text-teal'
    : nada === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${gaya}`}>{children}</span>
}

/** Kepala kolom tabel ala layar aplikasi. */
export const Th = ({ children, tengah }: { children?: ReactNode; tengah?: boolean }) => (
  <th className={`px-2.5 py-2 text-[11px] font-semibold text-gray-500 ${tengah ? 'text-center' : 'text-left'}`}>{children}</th>
)

/** Gambar mini foto barang (placeholder bergaya) — `kosong` = belum ada foto. */
export function FotoMini({ kosong, ukuran = 34 }: { kosong?: boolean; ukuran?: number }) {
  if (kosong) {
    return (
      <span className="inline-flex items-center justify-center rounded border border-dashed border-amber-400 bg-amber-50 text-amber-600 text-[10px] font-bold" style={{ width: ukuran, height: ukuran }}>—</span>
    )
  }
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 34 34" className="rounded border border-gray-200 flex-shrink-0" aria-hidden>
      <rect width="34" height="34" fill="#dbeafe" />
      <circle cx="26" cy="9" r="3.5" fill="#fde68a" />
      <path d="M0 28 L10 15 L18 24 L24 18 L34 29 V34 H0z" fill="#0d9488" fillOpacity=".75" />
    </svg>
  )
}

/** Panah kecil penghubung antar langkah di dalam mock. */
export const Panah = () => <span className="text-teal font-bold">›</span>

/** Penanda "klik di sini" yang berdenyut — hanya hiasan layar, tak ikut tercetak. */
export function Tunjuk({ className = '', jeda = 1200 }: { className?: string; jeda?: number }) {
  return (
    <span className={`absolute pointer-events-none ${className}`}>
      <span className="mt-riak mt-tak-cetak absolute -inset-2 rounded-full border-2 border-amber-400" style={d(jeda)} />
      <span className="relative block w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow" />
    </span>
  )
}

/** Keterangan kecil di dasar slide bergambar layar: datanya contoh, bukan data produksi. */
export const Contoh = () => (
  <p className="absolute right-0 -bottom-5 text-[11px] text-gray-400">Ilustrasi tampilan — data contoh</p>
)
