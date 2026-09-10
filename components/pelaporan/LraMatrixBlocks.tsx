'use client'
// Blok tabel tab "Ringkasan" halaman LRA (app/dashboard/pelaporan/lra/page.tsx)
// — diekstrak dari berkas itu 2026-09-10 semata utk menjaganya di bawah 500
// baris (max-lines ESLint) begitu tab "Rekap per SKPD" ditambahkan; TIDAK ada
// perubahan perilaku. Lihat docs/lra-plan.md utk konteks penuh modul LRA.
import type { ReactNode } from 'react'
import {
  JENIS_BM, BULAN_SINGKAT, GOL_URAIAN, TANPA_REK, TANPA_GOL, statusSilang,
  type RekapMatrix, type Silang,
} from '@/lib/lra'

export const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)

// Tombol kecil di kanan judul matriks Kapitalisasi/Reklasifikasi → buka modal
// tanda langsung di tab "Sudah ditandai" untuk MEMBATALKAN tanda (satu / massal).
// Ditaruh di sini karena inilah tempat operator melihat hasil penandaan; dulu
// batal-tandai cuma ada terkubur di dalam tombol "+ Tandai".
export function KelolaTandaBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs text-gray-500 hover:text-teal underline decoration-dotted flex-shrink-0">
      Kelola / batal tanda
    </button>
  )
}

// Tabel matriks jenis × 12 bulan + Total. Kalau `onDrill` diisi, angka non-nol
// jadi tombol → buka rincian (grup/bulan null = "semua", untuk sel Total).
export function MatrixTable({ judul, m, note, kosongNote, onDrill, aksi }: {
  judul: string; m: RekapMatrix; note?: string; kosongNote?: string
  onDrill?: (grup: string | null, bulan: number | null) => void
  /** Kendali kecil di kanan judul (mis. tuas Dasar pengelompokan). */
  aksi?: ReactNode
}) {
  const kosong = m.totalKeseluruhan === 0
  const Sel = ({ v, grup, bulan, cls }: { v: number; grup: string | null; bulan: number | null; cls?: string }) => (
    <td className={`table-td text-right tabular-nums ${cls || ''}`}>
      {v === 0 ? <span className="text-gray-300">–</span>
        : onDrill
          ? <button type="button" className="text-teal hover:underline" title="Lihat rincian"
              onClick={() => onDrill(grup, bulan)}>{angka(v)}</button>
          : angka(v)}
    </td>
  )
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800">{judul}</p>
        {aksi}
      </div>
      {kosong && kosongNote ? (
        <div className="p-6 text-center text-gray-400 text-sm">{kosongNote}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th text-left sticky left-0 bg-gray-50">Jenis</th>
                {BULAN_SINGKAT.map(b => <th key={b} className="table-th text-right">{b}</th>)}
                <th className="table-th text-right border-l border-gray-100">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {JENIS_BM.map(j => (
                <tr key={j.grup}>
                  <td className="table-td sticky left-0 bg-white whitespace-nowrap"><span className="text-gray-400">{j.grup}</span> {j.uraian}</td>
                  {m.perJenis[j.grup].map((v, i) => <Sel key={i} v={v} grup={j.grup} bulan={i + 1} />)}
                  <Sel v={m.totalJenis[j.grup]} grup={j.grup} bulan={null} cls="font-medium border-l border-gray-100" />
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="table-td sticky left-0 bg-gray-50">TOTAL</td>
                {m.totalBulan.map((v, i) => <Sel key={i} v={v} grup={null} bulan={i + 1} />)}
                <Sel v={m.totalKeseluruhan} grup={null} bulan={null} cls="border-l border-gray-100" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {note && <div className="px-4 py-2 border-t border-gray-100 text-xs text-amber-700 bg-amber-50/50">{note}</div>}
    </div>
  )
}

/**
 * Tuas dasar pengelompokan blok Entryan Aplikasi.
 * ⚠️ Judulnya menyebut PERTANYAAN yang dijawab, bukan cuma nama kolomnya —
 * "Kode Rekening" vs "Kode Barang" saja tak memberi tahu operator kenapa ia
 * perlu memindahkannya, dan tuas yang tak dimengerti tak akan pernah dipakai.
 */
export function DasarSwitch({ nilai, onGanti }: {
  nilai: 'rekening' | 'barang'
  onGanti: (v: 'rekening' | 'barang') => void
}) {
  const Btn = ({ v, label, title }: { v: 'rekening' | 'barang'; label: string; title: string }) => (
    <button type="button" title={title} onClick={() => onGanti(v)}
      className={`px-3 py-1 rounded-md transition-colors ${nilai === v
        ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-xs text-gray-500">Dasar:</span>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
        <Btn v="rekening" label="Kode Rekening"
          title="Jenis BELANJA-nya (payload.kode_rekening). Sebanding langsung dgn box LRA — Check menjawab kelengkapan entry." />
        <Btn v="barang" label="Kode Barang"
          title="Jenis ASET-nya (golongan BMD, yang masuk Neraca & Daftar Barang) — Check menjawab ketepatan klasifikasi." />
      </div>
    </div>
  )
}

/**
 * Persilangan **kode rekening (belanja) × kode barang (aset)**.
 *
 * Kenapa tabel ini ada: box LRA dan blok Entryan Aplikasi sama-sama
 * dikelompokkan per rekening, jadi kasus "belanja rekening Gedung & Bangunan
 * tapi barangnya Peralatan & Mesin" TIDAK PERNAH muncul sbg selisih — Check
 * tetap ✓. Kejadian nyata yang melahirkannya: Backdrop (Alat Hiasan,
 * 1.3.2.05.02.06.027) Rp19.955.000 di Kecamatan Banyakan, dibeli dgn rekening
 * 5.2.03.
 *
 * Cara bacanya: **diagonal = cocok**, di luar diagonal = persilangan. Baris
 * total = angka dasar KODE REKENING, kolom total = angka dasar KODE BARANG —
 * jadi tabel ini sekaligus jembatan antara kedua tuas di atas.
 *
 * ⚠️ Sel yang TAK BISA DINILAI (rekening/golongan tak diketahui, atau golongan
 * yang memang tak punya padanan jenis belanja spt 1.3.6 KDP) sengaja TIDAK
 * ditandai temuan — pola yang sama dgn `bergeserDariNibar`: menuduh
 * persilangan yang tak terbukti sama merugikannya dgn melewatkan yang terbukti.
 */
export function SilangTable({ s, belumMigrasi }: { s: Silang; belumMigrasi: boolean }) {
  const judulKolom = (k: string) => k === TANPA_GOL ? k : `${k} ${GOL_URAIAN[k] ?? ''}`.trim()
  const judulBaris = (b: string) => b === TANPA_REK ? b : `${b} ${JENIS_BM.find(j => j.grup === b)?.uraian ?? ''}`.trim()

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800">
          Persilangan — Kode Rekening (belanja) × Kode Barang (aset)
        </p>
        {!belumMigrasi && (s.nSelSilang === 0
          ? <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded flex-shrink-0">Tidak ada persilangan ✓</span>
          : <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded flex-shrink-0">
              {s.nSelSilang} sel silang · {angka(s.nilaiSilang)}
            </span>)}
      </div>

      {belumMigrasi ? (
        <div className="p-6 text-center text-sm text-amber-700 bg-amber-50/50">
          Kode barang belum ikut terbaca dari server — migrasi
          <span className="font-medium"> 20260909_01_lra_belanja_modal_silang.sql </span>
          belum dijalankan. Angka di blok lain TIDAK terpengaruh.
        </div>
      ) : s.total === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">Belum ada belanja modal hasil entry aplikasi pada lingkup ini.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th text-left sticky left-0 bg-gray-50">Rekening \ Barang</th>
                  {s.kolom.map(k => <th key={k} className="table-th text-right whitespace-nowrap">{judulKolom(k)}</th>)}
                  <th className="table-th text-right border-l border-gray-100">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {s.baris.map(b => (
                  <tr key={b}>
                    <td className="table-td sticky left-0 bg-white whitespace-nowrap">{judulBaris(b)}</td>
                    {s.kolom.map(k => {
                      const v = s.sel[b]?.[k] ?? 0
                      const st = statusSilang(b === TANPA_REK ? null : b, k === TANPA_GOL ? null : k)
                      const silang = v !== 0 && st === false
                      return (
                        <td key={k}
                          title={v === 0 ? undefined : silang
                            ? `SILANG — dibelanjakan dari ${judulBaris(b)}, barangnya ${judulKolom(k)}`
                            : st === true ? 'Cocok — rekening & jenis barangnya sepadan'
                            : 'Tak bisa dinilai — tak ada padanan jenis belanja untuk golongan ini'}
                          className={`table-td text-right tabular-nums ${silang ? 'bg-amber-50 text-amber-800 font-semibold' : ''}`}>
                          {v === 0 ? <span className="text-gray-300">–</span> : angka(v)}
                        </td>
                      )
                    })}
                    <td className="table-td text-right tabular-nums font-medium border-l border-gray-100">
                      {s.totalBaris[b] === 0 ? <span className="text-gray-300">–</span> : angka(s.totalBaris[b])}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold text-gray-900">
                  <td className="table-td sticky left-0 bg-gray-50">TOTAL (dasar kode barang)</td>
                  {s.kolom.map(k => (
                    <td key={k} className="table-td text-right tabular-nums">
                      {(s.totalKolom[k] ?? 0) === 0 ? <span className="text-gray-300">–</span> : angka(s.totalKolom[k])}
                    </td>
                  ))}
                  <td className="table-td text-right tabular-nums border-l border-gray-100">{angka(s.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={`px-4 py-2 border-t border-gray-100 text-xs ${s.nSelSilang > 0 ? 'text-amber-800 bg-amber-50/50' : 'text-gray-400'}`}>
            {s.nSelSilang > 0
              ? <>Sel berlatar kuning = <span className="font-medium">persilangan</span>: belanja dari rekening di baris itu, tapi barangnya masuk golongan di kolom itu.
                  Totalnya {angka(s.nilaiSilang)}. Di LRA nilai itu menambah jenis belanjanya, di Neraca/Daftar Barang ia menambah golongan barangnya —
                  perlu penjelasan di CaLK atau koreksi (reklasifikasi belanja / perbaikan kode barang).</>
              : <>Semua belanja mendarat di jenis aset yang sepadan dgn rekeningnya. Baris TOTAL = angka dasar kode rekening; kolom TOTAL = angka dasar kode barang.</>}
          </div>
        </>
      )}
    </div>
  )
}
