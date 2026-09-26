'use client'
// Isi pop-up 👁 untuk indikator OTOMATIS: daftar barang/dokumen di balik
// angkanya, dipisah "perlu ditindaklanjuti" vs "sudah terpenuhi" (permintaan
// user 2026-09-26). Sumbernya `fn_ipa_rincian` (migrasi 20260926_01), yang
// predikatnya KEMBAR dgn `fn_ipa_hitung_otomatis`.
//
// ⚠️ Daftarnya dihitung HIDUP, sedangkan skor dari SNAPSHOT — kalau register
// berubah sesudah snapshot terakhir, jumlahnya bisa berbeda sedikit. Itu
// dikatakan di layar; jangan disembunyikan.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { BATAS_RINCIAN, muatRincian, type BarisRincian, type KeadaanRincian } from '@/lib/ipaData'
import { PesanError } from '@/components/ipa/ipaUi'

// Indikator yang angka per barisnya RUPIAH (lainnya cukup dijelaskan kolom keterangan).
const NILAI_RUPIAH = new Set(['AKT_REALISASI', 'EKO_IDLE'])
const LABEL_NILAI: Record<string, string> = { AKT_REALISASI: 'Nilai (Rp)', EKO_IDLE: 'Pendapatan / tahun (Rp)' }
const PER_HALAMAN = 300

type Tab = 'kurang' | 'ok' | 'semua'
const PILL: Record<KeadaanRincian, { label: string; kelas: string }> = {
  kurang: { label: 'Perlu ditindaklanjuti', kelas: 'bg-red-100 text-red-700' },
  ok: { label: 'Terpenuhi', kelas: 'bg-emerald-100 text-emerald-700' },
  info: { label: 'Keterangan', kelas: 'bg-gray-100 text-gray-600' },
}
const rupiah = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 })

export default function RincianIndikator({ tahun, skpdId, indikator }: { tahun: number; skpdId: number; indikator: string }) {
  const supabase = createClient()
  const { data, loading, error, run } = useAsyncData<BarisRincian[]>()
  const [tab, setTab] = useState<Tab | null>(null)
  const [cari, setCari] = useState('')
  const [tampil, setTampil] = useState(PER_HALAMAN)

  useEffect(() => { void run(() => muatRincian(supabase, tahun, skpdId, indikator)) }, [run, tahun, skpdId, indikator]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = useMemo(() => ({
    kurang: (data ?? []).filter(r => r.keadaan === 'kurang').length,
    ok: (data ?? []).filter(r => r.keadaan === 'ok').length,
    semua: (data ?? []).length,
  }), [data])
  // Tab awal: yang perlu ditindaklanjuti kalau ada — itu gunanya pop-up ini.
  const tabAktif: Tab = tab ?? (n.kurang > 0 ? 'kurang' : n.ok > 0 ? 'ok' : 'semua')

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (data ?? []).filter(r =>
      (tabAktif === 'semua' || r.keadaan === tabAktif)
      && (!q || [r.judul, r.sub, r.ket].some(v => (v ?? '').toLowerCase().includes(q))))
  }, [data, tabAktif, cari])

  const rupiahKolom = NILAI_RUPIAH.has(indikator)
  const totalInfo = indikator === 'AKT_REALISASI' && data
    ? {
        rencana: data.filter(r => r.judul.startsWith('Rencana')).reduce((a, r) => a + (r.nilai ?? 0), 0),
        realisasi: data.filter(r => r.judul.startsWith('Realisasi')).reduce((a, r) => a + (r.nilai ?? 0), 0),
      }
    : null

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        {(['kurang', 'ok', 'semua'] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => { setTab(t); setTampil(PER_HALAMAN) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tabAktif === t ? 'bg-teal text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {t === 'kurang' ? 'Perlu ditindaklanjuti' : t === 'ok' ? 'Sudah terpenuhi' : 'Semua'} ({n[t].toLocaleString('id-ID')})
          </button>
        ))}
        <input className="select-filter ml-auto w-64" placeholder="Cari nama / NIBAR / keterangan…" value={cari}
          onChange={e => { setCari(e.target.value); setTampil(PER_HALAMAN) }} />
      </div>
      <PesanError pesan={error} />
      <p className="px-4 pt-3 text-xs text-gray-500">
        Daftar ini dibaca langsung dari data terkini; skor di halaman memakai angka yang terakhir dihitung, jadi
        jumlahnya bisa berbeda sedikit kalau data berubah sesudahnya.
      </p>
      {data && data.length >= BATAS_RINCIAN && (
        <p className="mx-4 mt-2 p-2 rounded bg-amber-50 text-xs text-amber-700">
          Ditampilkan {BATAS_RINCIAN.toLocaleString('id-ID')} baris pertama (yang paling perlu ditindaklanjuti lebih dulu) —
          sisanya tidak dimuat. Pakai kotak Cari, atau telusuri lewat menu Daftar Barang.
        </p>
      )}
      {totalInfo && (
        <p className="px-4 pt-2 text-sm text-gray-700">
          Rencana Rp{rupiah(totalInfo.rencana)} · Realisasi Rp{rupiah(totalInfo.realisasi)}
          {totalInfo.rencana > 0 && <> · <b>{((totalInfo.realisasi / totalInfo.rencana) * 100).toFixed(2)}%</b></>}
        </p>
      )}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="table-th w-40">Keadaan</th>
            <th className="table-th">Barang / Dokumen</th>
            <th className="table-th">Keterangan</th>
            {rupiahKolom && <th className="table-th text-right">{LABEL_NILAI[indikator]}</th>}
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-8">Memuat…</td></tr>}
            {data && rows.length === 0 && (
              <tr><td colSpan={4} className="table-td text-center text-gray-400 py-8">
                {data.length === 0 ? 'Tidak ada barang/dokumen yang dinilai untuk indikator ini.' : 'Tidak ada yang cocok.'}
              </td></tr>
            )}
            {rows.slice(0, tampil).map((r, i) => (
              <tr key={`${r.nibar ?? r.judul}-${i}`} className="border-t border-gray-50 align-top">
                <td className="table-td"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PILL[r.keadaan].kelas}`}>{PILL[r.keadaan].label}</span></td>
                <td className="table-td">
                  {r.nibar
                    ? <a href={`/kibar/${r.nibar}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal hover:underline">{r.judul}</a>
                    : <p className="font-medium text-gray-800">{r.judul}</p>}
                  {r.sub && <p className="text-xs text-gray-500 break-all">{r.sub}</p>}
                </td>
                <td className={`table-td text-xs ${r.keadaan === 'kurang' ? 'text-red-700' : 'text-gray-600'}`}>{r.ket}</td>
                {rupiahKolom && <td className="table-td text-right tabular-nums">{r.nilai == null ? '-' : rupiah(r.nilai)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > tampil && (
        <div className="p-3 text-center">
          <button type="button" className="btn-secondary" onClick={() => setTampil(t => t + PER_HALAMAN)}>
            Tampilkan {Math.min(PER_HALAMAN, rows.length - tampil)} lagi ({(rows.length - tampil).toLocaleString('id-ID')} tersisa)
          </button>
        </div>
      )}
    </div>
  )
}
