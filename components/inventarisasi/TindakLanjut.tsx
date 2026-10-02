'use client'
// Menu Inventarisasi → Tindak Lanjut (Fase 1, 2026-10-02).
// Daftar temuan dari LHI yang SUDAH DIVALIDASI + status yang dilacak OTOMATIS
// dari keadaan barang saat ini (lib/tindakLanjut.ts). Halaman ini MURNI BACA:
// tidak mengubah register maupun ledger. Pekerjaannya dikerjakan SKPD di menu
// terkait lewat tombol "Kerjakan →"; begitu disimpan di sana, statusnya di sini
// berubah sendiri saat dimuat ulang.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useSkpdTree } from '@/components/useSkpdTree'
import { createClient } from '@/lib/supabase/client'
import { LHI_LABEL, LHI_URUT, type LhiKode } from '@/lib/inventarisasi'
import { STATUS_TL_LABEL, type MenuTL, type StatusTL } from '@/lib/tindakLanjut'
import { muatTindakLanjut, type TemuanTLMuat } from '@/lib/tindakLanjutData'
import { useAsyncData } from '@/shared/ui/useAsyncData'

const TAHUN_INI = new Date().getFullYear()

// Kelas ditulis UTUH (Tailwind memindai teks literal).
const BADGE: Record<StatusTL, string> = {
  belum: 'bg-red-50 text-red-700 border-red-200',
  proses: 'bg-amber-50 text-amber-700 border-amber-200',
  selesai: 'bg-teal/10 text-teal border-teal/30',
  manual: 'bg-gray-50 text-gray-500 border-gray-200',
}

const MENU: Record<MenuTL, { label: string; href: (t: TemuanTLMuat) => string }> = {
  reklasifikasi: { label: 'Reklasifikasi', href: () => '/dashboard/pembukuan/pengelolaan/reklasifikasi' },
  koreksi: { label: 'Koreksi', href: () => '/dashboard/pembukuan/pengelolaan/koreksi' },
  kapitalisasi: { label: 'Kapitalisasi', href: () => '/dashboard/pembukuan/pengelolaan/kapitalisasi' },
  penghapusan: { label: 'Penghapusan', href: () => '/dashboard/pembukuan/pengelolaan/penghapusan' },
  rkbmd_penghapusan: { label: 'RKBMD Penghapusan', href: () => '/dashboard/rkbmd/usulan' },
  pengamanan: { label: 'Pengamanan', href: t => `/dashboard/pembukuan/pengelolaan/pengamanan?skpd=${t.skpdId}&nibar=${t.snapshot?.nibar || ''}` },
  pemanfaatan: { label: 'Pemanfaatan', href: t => `/dashboard/pembukuan/pengelolaan/pemanfaatan?skpd=${t.skpdId}&nibar=${t.snapshot?.nibar || ''}` },
  hasil_inventarisasi: { label: 'Hasil Inventarisasi', href: () => '/dashboard/pembukuan/perolehan/inventarisasi' },
}

export default function TindakLanjut() {
  const supabase = createClient()
  const { byId } = useSkpdTree()
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [fStatus, setFStatus] = useState<StatusTL | 'semua'>('semua')
  const [fLhi, setFLhi] = useState<LhiKode | 'semua'>('semua')
  const { data, loading, error, run } = useAsyncData<TemuanTLMuat[]>()
  const kunci = `${tahun}|${(skpdIds || []).join(',')}`

  useEffect(() => { void run(() => muatTindakLanjut(supabase, { tahun, skpdIds })) }, [kunci, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const semua = data || []
  const hitung = useMemo(() => {
    const c: Record<StatusTL, number> = { belum: 0, proses: 0, selesai: 0, manual: 0 }
    for (const t of semua) c[t.status]++
    return c
  }, [semua])
  const baris = useMemo(() => semua
    .filter(t => (fStatus === 'semua' || t.status === fStatus) && (fLhi === 'semua' || t.lhi === fLhi))
    .sort((a, b) => (byId.get(a.skpdId)?.nama || '').localeCompare(byId.get(b.skpdId)?.nama || '')
      || LHI_URUT.indexOf(a.lhi) - LHI_URUT.indexOf(b.lhi) || a.id.localeCompare(b.id)),
  [semua, fStatus, fLhi, byId])

  return (
    <FormShell judul="Tindak Lanjut Inventarisasi"
      deskripsi="Temuan dari LHI yang sudah divalidasi. Status dilacak otomatis dari keadaan barang di register — kerjakan lewat menu terkait, statusnya menyesuaikan sendiri."
      msg=""
      headerRight={<button onClick={() => void run(() => muatTindakLanjut(supabase, { tahun, skpdIds }))} className="btn-secondary text-sm">↻ Muat ulang</button>}>
      <div className="card p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <SkpdCombobox lockToOperator allowClear onChangeSelection={sel => setSkpdIds(sel.descendantIds)}
            placeholder="Semua SKPD — atau ketik nama SKPD..." />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Inventarisasi</label>
            <select className="select-filter" value={tahun} onChange={e => setTahun(Number(e.target.value))}>
              {[TAHUN_INI, TAHUN_INI - 1, TAHUN_INI - 2].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">Format LHI</label>
            <select className="select-filter w-full" value={fLhi} onChange={e => setFLhi(e.target.value as LhiKode | 'semua')}>
              <option value="semua">Semua format</option>
              {LHI_URUT.map(k => <option key={k} value={k}>{k} — {LHI_LABEL[k]}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['semua', 'belum', 'proses', 'selesai', 'manual'] as const).map(s => (
            <button key={s} onClick={() => setFStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${fStatus === s ? 'bg-teal text-white border-teal' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {s === 'semua' ? `Semua (${semua.length})` : `${STATUS_TL_LABEL[s]} (${hitung[s]})`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} — status tidak ditampilkan supaya tak ada temuan yang terbaca &ldquo;belum dikerjakan&rdquo; padahal datanya gagal dimuat.
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Memuat temuan...</p>
        ) : error ? null : semua.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Belum ada temuan dari isian inventarisasi tahun {tahun} yang sudah divalidasi.</p>
        ) : baris.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Tidak ada temuan yang cocok dengan penyaring.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3 font-medium">SKPD</th>
                <th className="py-2 pr-3 font-medium">Barang</th>
                <th className="py-2 pr-3 font-medium">Temuan</th>
                <th className="py-2 pr-3 font-medium">Tindak Lanjut</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Kerjakan</th>
              </tr>
            </thead>
            <tbody>
              {baris.map(t => (
                <tr key={t.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-3 text-gray-700">{byId.get(t.skpdId)?.nama || t.skpdId}</td>
                  <td className="py-2 pr-3">
                    <p className="text-gray-800">{t.snapshot?.nama_barang || t.snapshot?.uraian_barang || '(belum tercatat)'}</p>
                    <p className="text-[10px] text-gray-400 break-all">{t.snapshot?.nibar || '-'}</p>
                    <p className="text-[10px] text-gray-400">{t.snapshot?.kode || t.golongan}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-700">{t.lhi}</p>
                    <p className="text-gray-500">{LHI_LABEL[t.lhi]}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <p className="text-gray-800">{t.tindakan}</p>
                    {t.tahap.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {t.tahap.map((h, i) => (
                          <li key={i} className={h.selesai ? 'text-teal' : h.selesai === null ? 'text-gray-400' : 'text-gray-600'}>
                            {h.selesai ? '✓' : h.selesai === null ? '–' : '○'} {h.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.catatan && <p className="mt-1 text-[10px] text-gray-400">{t.catatan}</p>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${BADGE[t.status]}`}>{STATUS_TL_LABEL[t.status]}</span>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      {t.status !== 'selesai' && t.menu.map(m => (
                        <Link key={m} href={MENU[m].href(t)} className="text-teal hover:underline whitespace-nowrap">{MENU[m].label} →</Link>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-gray-400">
          Kode tujuan reklas yang tertulis hanya <b>usulan</b> — kode barang di register baru berubah setelah SKPD menyimpan Reklasifikasi
          (dengan surat usulan sebagai dokumen sumber). Halaman ini tidak mengubah data apa pun.
        </p>
      </div>
    </FormShell>
  )
}
