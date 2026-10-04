'use client'
// Isi pop-up 👁 untuk indikator OTOMATIS: daftar barang/dokumen di balik
// angkanya, dipisah "perlu ditindaklanjuti" vs "sudah terpenuhi" (permintaan
// user 2026-09-26). Sumbernya `fn_ipa_rincian` (migrasi 20260926_01), yang
// predikatnya KEMBAR dgn `fn_ipa_hitung_otomatis`.
//
// ⚠️ Daftarnya dihitung HIDUP, sedangkan skor dari SNAPSHOT — kalau register
// berubah sesudah snapshot terakhir, jumlahnya bisa berbeda sedikit. Itu
// dikatakan di layar; jangan disembunyikan.
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { muatRincianHalaman, persenTerisi, RINCIAN_PER_HALAMAN, type HalamanRincian, type KeadaanRincian } from '@/lib/ipaData'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { PesanError } from '@/components/ipa/ipaUi'

// Indikator yang angka per barisnya RUPIAH (lainnya cukup dijelaskan kolom keterangan).
const NILAI_RUPIAH = new Set(['AKT_REALISASI', 'EKO_IDLE'])
const LABEL_NILAI: Record<string, string> = { AKT_REALISASI: 'Nilai (Rp)', EKO_IDLE: 'Pendapatan / tahun (Rp)' }

type Tab = 'kurang' | 'ok' | 'semua'
const PILL: Record<KeadaanRincian, { label: string; kelas: string }> = {
  kurang: { label: 'Perlu ditindaklanjuti', kelas: 'bg-red-100 text-red-700' },
  ok: { label: 'Terpenuhi', kelas: 'bg-emerald-100 text-emerald-700' },
  info: { label: 'Keterangan', kelas: 'bg-gray-100 text-gray-600' },
}
const rupiah = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 })
const angka = (n: number) => n.toLocaleString('id-ID')
const persenLabel = (p: number | null) => (p == null ? '' : `${p.toFixed(1).replace('.', ',')}%`)
const namaGolongan = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kode)?.uraian ?? kode

// Penyaringan, penghitungan & pemotongan halaman dikerjakan SERVER
// (`fn_ipa_rincian_halaman`, migrasi 20261004_01) — layar ini hanya memegang
// SATU halaman. Versi lama menarik semuanya dan terpotong diam-diam di 1.000
// baris (BKAD: "Semua (1.000)" padahal 1.296). Lihat catatan di lib/ipaData.ts.
function Pager({ halaman, total, onGanti }: { halaman: number; total: number; onGanti: (h: number) => void }) {
  const hal = Math.max(1, Math.ceil(total / RINCIAN_PER_HALAMAN))
  if (total === 0) return null
  const dari = halaman * RINCIAN_PER_HALAMAN + 1
  const sampai = Math.min(total, (halaman + 1) * RINCIAN_PER_HALAMAN)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-gray-600">
      <span>Menampilkan {angka(dari)}–{angka(sampai)} dari {angka(total)}</span>
      {hal > 1 && (
        <span className="flex items-center gap-2">
          <button type="button" className="btn-secondary" disabled={halaman === 0} onClick={() => onGanti(halaman - 1)}>← Sebelumnya</button>
          <span>Hal. {angka(halaman + 1)} / {angka(hal)}</span>
          <button type="button" className="btn-secondary" disabled={halaman + 1 >= hal} onClick={() => onGanti(halaman + 1)}>Berikutnya →</button>
        </span>
      )}
    </div>
  )
}

export default function RincianIndikator({ tahun, skpdId, indikator }: { tahun: number; skpdId: number; indikator: string }) {
  const supabase = createClient()
  const { data, loading, error, run } = useAsyncData<HalamanRincian>()
  const [tab, setTab] = useState<Tab>('kurang')
  const [tabDipilih, setTabDipilih] = useState(false)   // false = tab awal masih boleh dialihkan otomatis
  const [golongan, setGolongan] = useState('')
  const [cariInput, setCariInput] = useState('')
  const [cari, setCari] = useState('')                  // yang sudah dikirim ke server (di-debounce)
  const [halaman, setHalaman] = useState(0)
  const atas = useRef<HTMLDivElement>(null)

  // Ketikan baru dikirim sesudah jeda — tiap permintaan menghitung ulang rincian
  // (±2 dtk untuk SKPD terbesar), jadi tak boleh satu permintaan per huruf.
  useEffect(() => {
    const t = setTimeout(() => { setCari(cariInput); setHalaman(0) }, 400)
    return () => clearTimeout(t)
  }, [cariInput])

  useEffect(() => {
    void run(() => muatRincianHalaman(supabase, tahun, skpdId, indikator, {
      keadaan: tab === 'semua' ? null : tab, golongan, cari, halaman,
    }))
  }, [run, tahun, skpdId, indikator, tab, golongan, cari, halaman]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab awal = "perlu ditindaklanjuti" (itu gunanya pop-up ini). Kalau ternyata
  // kosong dan operator belum memilih tab, pindah ke yang ada isinya.
  useEffect(() => {
    if (!data || tabDipilih || tab !== 'kurang' || data.n.kurang > 0) return
    setTab(data.n.ok > 0 ? 'ok' : 'semua')
  }, [data, tab, tabDipilih])

  const n = data?.n ?? { kurang: 0, ok: 0, semua: 0 }
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const golonganAda = data?.golongan ?? []
  const pilihTab = (t: Tab) => { setTab(t); setTabDipilih(true); setHalaman(0) }
  const gantiHalaman = (h: number) => { setHalaman(h); atas.current?.scrollIntoView({ block: 'nearest' }) }

  const rupiahKolom = NILAI_RUPIAH.has(indikator)
  // Rencana/Realisasi dijumlah dari baris yang dimuat — sah HANYA kalau seluruh
  // barisnya termuat; selebihnya disembunyikan, bukan dijumlah separuh.
  const totalInfo = indikator === 'AKT_REALISASI' && data && rows.length === total
    ? {
        rencana: rows.filter(r => r.judul.startsWith('Rencana')).reduce((a, r) => a + (r.nilai ?? 0), 0),
        realisasi: rows.filter(r => r.judul.startsWith('Realisasi')).reduce((a, r) => a + (r.nilai ?? 0), 0),
      }
    : null

  return (
    <div className="card" ref={atas}>
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        {golonganAda.length > 0 && (
          <select className="select-filter" value={golongan} aria-label="Jenis aset"
            onChange={e => { setGolongan(e.target.value); setHalaman(0) }}>
            <option value="">Semua jenis aset ({angka(golonganAda.reduce((s, g) => s + g.n, 0))})</option>
            {golonganAda.map(g => <option key={g.kode} value={g.kode}>{g.kode} {namaGolongan(g.kode)} ({angka(g.n)}){persenLabel(persenTerisi(g)) && ` · ${persenLabel(persenTerisi(g))} terisi`}</option>)}
          </select>
        )}
        {(['kurang', 'ok', 'semua'] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => pilihTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t ? 'bg-teal text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {t === 'kurang' ? 'Perlu ditindaklanjuti' : t === 'ok' ? 'Sudah terpenuhi' : 'Semua'} ({data ? angka(n[t]) : '…'})
          </button>
        ))}
        <input className="select-filter ml-auto w-80" placeholder="Cari kode / uraian / nama / NIBAR / ket…" value={cariInput}
          onChange={e => setCariInput(e.target.value)} />
      </div>
      <PesanError pesan={error} />
      <p className="px-4 pt-3 text-xs text-gray-500">
        Daftar ini dibaca langsung dari data terkini; skor di halaman memakai angka yang terakhir dihitung, jadi
        jumlahnya bisa berbeda sedikit kalau data berubah sesudahnya.
      </p>
      {data?.terisi && persenTerisi(data.terisi) != null && (
        <p className="px-4 pt-2 text-sm text-gray-700">
          Kolom terisi{golongan ? ` (${namaGolongan(golongan)})` : ''}: {angka(data.terisi.isi)} dari {angka(data.terisi.req)}
          {' · '}<b>{persenLabel(persenTerisi(data.terisi))}</b>
          <span className="text-xs text-gray-500"> — angka yang sama dengan pembilang/penyebut skor; tiap kolom bernilai sama, jadi jenis aset yang barangnya banyak otomatis lebih berbobot.</span>
        </p>
      )}
      {totalInfo && (
        <p className="px-4 pt-2 text-sm text-gray-700">
          Rencana Rp{rupiah(totalInfo.rencana)} · Realisasi Rp{rupiah(totalInfo.realisasi)}
          {totalInfo.rencana > 0 && <> · <b>{((totalInfo.realisasi / totalInfo.rencana) * 100).toFixed(2)}%</b></>}
        </p>
      )}
      <Pager halaman={halaman} total={total} onGanti={gantiHalaman} />
      <div className={`overflow-x-auto ${loading && data ? 'opacity-50' : ''}`}>
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
                {!cari && !golongan && n.semua === 0 ? 'Tidak ada barang/dokumen yang dinilai untuk indikator ini.' : 'Tidak ada yang cocok.'}
              </td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.nibar ?? r.judul}-${i}`} className="border-t border-gray-50 align-top">
                <td className="table-td"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PILL[r.keadaan].kelas}`}>{PILL[r.keadaan].label}</span></td>
                <td className="table-td">
                  {r.nibar
                    ? <a href={`/kibar/${r.nibar}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal hover:underline">{r.judul}</a>
                    : <p className="font-medium text-gray-800">{r.judul}</p>}
                  {r.sub && <p className="text-xs text-gray-500 break-all">{r.sub}</p>}
                  {r.uraian && <p className="text-xs text-gray-400">{r.uraian}</p>}
                </td>
                <td className={`table-td text-xs ${r.keadaan === 'kurang' ? 'text-red-700' : 'text-gray-600'}`}>{r.ket}</td>
                {rupiahKolom && <td className="table-td text-right tabular-nums">{r.nilai == null ? '-' : rupiah(r.nilai)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={halaman} total={total} onGanti={gantiHalaman} />
    </div>
  )
}
