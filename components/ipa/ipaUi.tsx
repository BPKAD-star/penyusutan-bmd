'use client'
// Potongan tampilan yang dipakai bersama layar-layar IPA.
import { useEffect, type ReactNode } from 'react'
import { WARNA_KATEGORI, NAMA_BULAN, type KategoriIndeks, type NilaiIndikator } from '@/lib/ipa'
import type { StatusIsian } from '@/lib/ipa'
import { bukaDokumen, namaFile } from '@/components/pengelolaan/DokumenBastField'

export const TAHUN_INI = new Date().getFullYear()
export const BULAN_INI = new Date().getMonth() + 1

export const fmtSkor = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2)
export const fmtIndeks = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2)
export const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function KategoriPill({ k }: { k: KategoriIndeks | null }) {
  if (!k) return <span className="text-xs text-gray-400">—</span>
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WARNA_KATEGORI[k]}`}>{k}</span>
}

function warnaBatang(skor: number) {
  if (skor >= 85) return 'bg-emerald-500'
  if (skor >= 70) return 'bg-sky-500'
  if (skor >= 55) return 'bg-amber-500'
  return 'bg-red-500'
}

export function SkorBar({ skor }: { skor: number | null }) {
  const w = skor == null ? 0 : Math.min(100, Math.max(0, skor))
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      {skor != null && <div className={`h-full rounded-full ${warnaBatang(skor)}`} style={{ width: `${w}%` }} />}
    </div>
  )
}

/** Keadaan satu indikator dalam kata-kata — `belum` & `na` sengaja beda tampilan. */
export function KeadaanNilai({ n }: { n: NilaiIndikator }) {
  if (n.status === 'na') return <span className="text-xs text-gray-400" title="Tidak berlaku — bobotnya dialihkan ke indikator lain">N/A</span>
  if (n.status === 'belum') return <span className="text-xs text-amber-600 font-medium" title="Belum dihitung / belum ada isian terverifikasi">Belum</span>
  return <span className="text-xs text-gray-600 tabular-nums">{fmtAngka(n.pembilang)} / {fmtAngka(n.penyebut)}</span>
}

const WARNA_STATUS: Record<StatusIsian, string> = {
  diajukan: 'bg-blue-100 text-blue-700',
  diverifikasi: 'bg-emerald-100 text-emerald-700',
  ditolak: 'bg-red-100 text-red-700',
}
const LABEL_STATUS: Record<StatusIsian, string> = {
  diajukan: 'Menunggu verifikasi', diverifikasi: 'Terverifikasi', ditolak: 'Ditolak',
}
export function StatusPill({ s }: { s: StatusIsian | null }) {
  if (!s) return <span className="text-xs text-gray-400">Belum diisi</span>
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WARNA_STATUS[s]}`}>{LABEL_STATUS[s]}</span>
}

export function BuktiLinks({ paths }: { paths: string[] | null | undefined }) {
  if (!paths || paths.length === 0) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className="flex flex-col gap-0.5">
      {paths.map(p => (
        <button key={p} type="button" onClick={() => bukaDokumen(p)}
          className="text-xs text-teal underline text-left truncate max-w-[14rem]" title={namaFile(p)}>
          📄 {namaFile(p)}
        </button>
      ))}
    </span>
  )
}

export function PilihTahunBulan({ tahun, bulan, onTahun, onBulan }: {
  tahun: number; bulan?: number; onTahun: (t: number) => void; onBulan?: (b: number) => void
}) {
  const tahunOpsi = Array.from({ length: 4 }, (_, i) => TAHUN_INI - 2 + i).filter(t => t <= TAHUN_INI)
  const maksBulan = tahun === TAHUN_INI ? BULAN_INI : 12
  return (
    <div className="flex items-end gap-2">
      <label className="text-xs text-gray-500">
        Tahun penilaian
        <select className="select-filter block mt-1" value={tahun} onChange={e => onTahun(Number(e.target.value))}>
          {tahunOpsi.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {onBulan && bulan != null && (
        <label className="text-xs text-gray-500">
          Posisi s.d. bulan
          <select className="select-filter block mt-1" value={Math.min(bulan, maksBulan)} onChange={e => onBulan(Number(e.target.value))}>
            {NAMA_BULAN.slice(0, maksBulan).map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

/**
 * Pop-up lebar untuk isian & rincian indikator. z-50 — SENGAJA di bawah
 * `KonfirmasiModal` (z-[60]) supaya pop-up konfirmasi/gagal dari dalam form
 * tetap tampil di atasnya. Tutup lewat ×, Esc, atau klik latar.
 */
export function ModalIpa({ judul, sub, onTutup, children }: {
  judul: string; sub?: string; onTutup: () => void; children: ReactNode
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onTutup])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onTutup}>
      <div role="dialog" aria-modal="true" className="bg-gray-50 rounded-xl shadow-xl w-full max-w-6xl my-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-4 border-b border-gray-200 bg-white rounded-t-xl">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{judul}</p>
            {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
          </div>
          <button type="button" onClick={onTutup} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Tutup">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function PesanError({ pesan }: { pesan: string }) {
  if (!pesan) return null
  return <div role="alert" className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700">{pesan}</div>
}
