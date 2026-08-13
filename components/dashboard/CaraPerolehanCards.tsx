'use client'
// Kartu "Total Barang per Cara Perolehan" + donut approve/belum-approve per jenis.
// Basis donut = JUMLAH BARANG (unit), bukan rupiah. Angka "disetujui" dipasok dari
// server (page.tsx, hitungan transaksi_bmd yg sudah ada — otomatis benar karena
// draft belum pernah masuk situ). Angka "pending" dihitung di client dari
// jurnal_header.payload.draft_items — SEMUA 5 kategori Cara Perolehan sudah
// pakai pola draft+approval yang sama (Hibah/Tukar Menukar/Hasil Inventarisasi/
// Perolehan Lainnya lewat PerolehanManual.tsx), jadi kategoriJurnal-nya diisi
// semua (dulu cuma Pengadaan sebelum menu2 itu dibangun ulang dgn pola sama).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { backdropClose } from '@/components/backdropClose'

type CaraConfig = { key: string; label: string; jenisTransaksi: string; kategoriJurnal: string | null }
const CARA_LIST: CaraConfig[] = [
  { key: 'pengadaan', label: 'Pengadaan', jenisTransaksi: 'pengadaan', kategoriJurnal: 'pengadaan' },
  { key: 'hibah', label: 'Hibah', jenisTransaksi: 'hibah_masuk', kategoriJurnal: 'hibah_masuk' },
  { key: 'tukarMenukar', label: 'Tukar Menukar', jenisTransaksi: 'tukar_menukar', kategoriJurnal: 'tukar_menukar' },
  { key: 'inventarisasi', label: 'Hasil Inventarisasi', jenisTransaksi: 'hasil_inventarisasi', kategoriJurnal: 'hasil_inventarisasi' },
  { key: 'lainnya', label: 'Perolehan Lainnya', jenisTransaksi: 'perolehan_lainnya', kategoriJurnal: 'perolehan_lainnya' },
]

const formatRp = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)
const nf = (n: number) => n.toLocaleString('id-ID')

type DraftItemLite = { kode?: string; nama?: string; harga?: string }
type PendingHeaderLite = { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: { draft_items?: DraftItemLite[] } }

export default function CaraPerolehanCards({ approved, approvedNilai }: {
  approved: Record<string, number>
  approvedNilai?: Record<string, number>
}) {
  const supabase = createClient()
  const [pending, setPending] = useState<Record<string, number>>({})
  const [detail, setDetail] = useState<{ mode: 'approved' | 'pending'; cara: CaraConfig } | null>(null)

  useEffect(() => {
    (async () => {
      const result: Record<string, number> = {}
      for (const c of CARA_LIST) {
        if (!c.kategoriJurnal) { result[c.key] = 0; continue }
        let total = 0
        for (let from = 0; ; from += 500) {
          const { data } = await supabase.from('jurnal_header').select('payload')
            .eq('kategori', c.kategoriJurnal).eq('approval_status', 'pending').range(from, from + 499)
          if (!data || data.length === 0) break
          for (const r of data as { payload: { draft_items?: unknown[] } }[]) total += r.payload?.draft_items?.length || 0
          if (data.length < 500) break
        }
        result[c.key] = total
      }
      setPending(result)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARA_LIST.map(c => {
          const disetujui = approved[c.key] || 0
          const belum = pending[c.key] || 0
          return (
            <CaraCard key={c.key} cara={c} disetujui={disetujui} belum={belum} nilai={approvedNilai?.[c.key] || 0}
              onClickApproved={() => setDetail({ mode: 'approved', cara: c })}
              onClickPending={() => setDetail({ mode: 'pending', cara: c })} />
          )
        })}
      </div>
      {detail?.mode === 'approved' && (
        <ApprovedDetailModal cara={detail.cara} onClose={() => setDetail(null)} />
      )}
      {detail?.mode === 'pending' && (
        <PendingDetailModal cara={detail.cara} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function CaraCard({ cara, disetujui, belum, nilai, onClickApproved, onClickPending }: {
  cara: CaraConfig; disetujui: number; belum: number; nilai: number
  onClickApproved: () => void; onClickPending: () => void
}) {
  const total = disetujui + belum
  const pct = total > 0 ? Math.round((disetujui / total) * 100) : 100
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-600 leading-tight">{cara.label}</p>
      <p className="text-sm font-bold text-teal mb-1 truncate" title={formatRp(nilai)}>{formatRp(nilai)}</p>
      {/* ⚠️ `min-w-0` di baris ini & di kolom keterangan BUKAN hiasan: tanpa itu
          min-width flex item = min-content, jadi kolom keterangan menolak
          menyempit dan teksnya MELUBER keluar kartu — di layar sempit (mis.
          DevTools terbuka) tulisannya menimpa kartu sebelahnya. Dengan min-w-0
          ia membungkus ke bawah, tetap di dalam kartunya.
          KEMBAR dengan DonutCard di MutasiTransferCards.tsx — ubah satu,
          samakan yang lain. */}
      <div className="flex items-center gap-3 mt-1 min-w-0">
        <div
          className="relative flex-shrink-0"
          style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(#0d9488 ${pct}%, #fbbf24 ${pct}% 100%)` }}
          title={`${pct}% disetujui`}
        >
          <div className="absolute inset-[5px] bg-white rounded-full flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-700">{pct}%</span>
          </div>
        </div>
        <div className="text-xs space-y-1 min-w-0">
          <button onClick={onClickApproved} className="flex items-start gap-1.5 hover:underline text-left min-w-0" disabled={disetujui === 0}>
            <span className="w-2 h-2 rounded-full bg-teal inline-block flex-shrink-0 mt-1" />
            <span className="text-gray-700">{nf(disetujui)} disetujui</span>
          </button>
          <button onClick={onClickPending} className="flex items-start gap-1.5 hover:underline text-left min-w-0" disabled={belum === 0}>
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block flex-shrink-0 mt-1" />
            <span className="text-gray-700">{nf(belum)} menunggu</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Popup "Disetujui": breakdown SKPD × Jenis Aset — kuantitas & nilai ──────
function ApprovedDetailModal({ cara, onClose }: { cara: CaraConfig; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<{ skpd: string; golongan: string; count: number; nilai: number }[]>([])

  useEffect(() => {
    (async () => {
      const [skpdRes, golLabelsRaw] = await Promise.all([
        (async () => {
          const map: Record<number, string> = {}
          for (let from = 0; ; from += 1000) {
            const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
            if (!data || data.length === 0) break
            for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
            if (data.length < 1000) break
          }
          return map
        })(),
        (async () => {
          const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
          const namaById = new Map((jenis || []).map((j: { id: number; nama: string }) => [j.id, j.nama]))
          const labels: Record<string, string> = {}
          await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
            const { data } = await supabase.from('admin_kodefikasi_bmd')
              .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
            const id = data?.[0]?.jenis_aset_id
            labels[prefix] = (id != null && namaById.get(id)) || prefix
          }))
          return labels
        })(),
      ])

      const agg = new Map<string, { skpdId: number; golongan: string; count: number; nilai: number }>()
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('aset')
          .select('kode,nilai_perolehan,skpd_id').eq('cara_perolehan', cara.jenisTransaksi).eq('status', 'aktif')
          .range(from, from + 999)
        if (!data || data.length === 0) break
        for (const r of data as { kode: string; nilai_perolehan: number; skpd_id: number }[]) {
          const g = kodeLevel3(r.kode)
          const k = `${r.skpd_id}|${g}`
          const cur = agg.get(k) || { skpdId: r.skpd_id, golongan: g, count: 0, nilai: 0 }
          cur.count += 1; cur.nilai += r.nilai_perolehan || 0
          agg.set(k, cur)
        }
        if (data.length < 1000) break
      }
      const out = [...agg.values()]
        .map(v => ({ skpd: skpdRes[v.skpdId] || `SKPD #${v.skpdId}`, golongan: `${v.golongan} — ${golLabelsRaw[v.golongan] || ''}`, count: v.count, nilai: v.nilai }))
        .sort((a, b) => a.skpd.localeCompare(b.skpd) || a.golongan.localeCompare(b.golongan))
      setRows(out)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const totalNilai = rows.reduce((s, r) => s + r.nilai, 0)

  return (
    <Modal title={`${cara.label} — Sudah Disetujui`} onClose={onClose}>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Belum ada data.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">SKPD</th>
              <th className="table-th">Jenis Aset</th>
              <th className="table-th text-center">Kuantitas</th>
              <th className="table-th text-right">Nilai Perolehan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="table-td text-xs">{r.skpd}</td>
                <td className="table-td text-xs">{r.golongan}</td>
                <td className="table-td text-center text-xs">{nf(r.count)}</td>
                <td className="table-td text-right text-xs">{formatRp(r.nilai)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
              <td className="table-td text-xs" colSpan={2}>TOTAL</td>
              <td className="table-td text-center text-xs">{nf(totalCount)}</td>
              <td className="table-td text-right text-xs">{formatRp(totalNilai)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Modal>
  )
}

// ── Popup "Menunggu": per SKPD → daftar kontrak → daftar barang ─────────────
function PendingDetailModal({ cara, onClose }: { cara: CaraConfig; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [bySkpd, setBySkpd] = useState<Record<string, PendingHeaderLite[]>>({})

  useEffect(() => {
    if (!cara.kategoriJurnal) { setLoading(false); return }
    (async () => {
      const skpdMap: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) skpdMap[s.id] = s.nama
        if (data.length < 1000) break
      }
      const { data: headers } = await supabase.from('jurnal_header')
        .select('id,no_sk,tanggal,skpd_id,payload')
        .eq('kategori', cara.kategoriJurnal).eq('approval_status', 'pending')
        .order('tanggal', { ascending: false })
      const grouped: Record<string, PendingHeaderLite[]> = {}
      for (const h of (headers || []) as { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: { draft_items?: DraftItemLite[] } }[]) {
        const nama = skpdMap[h.skpd_id] || `SKPD #${h.skpd_id}`
        ;(grouped[nama] ||= []).push({ id: h.id, no_sk: h.no_sk, tanggal: h.tanggal, skpd_id: h.skpd_id, payload: h.payload || {} })
      }
      setBySkpd(grouped)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdNames = Object.keys(bySkpd).sort()

  return (
    <Modal title={`${cara.label} — Menunggu Persetujuan`} onClose={onClose}>
      {!cara.kategoriJurnal ? (
        <p className="text-sm text-gray-400 text-center py-8">Cara perolehan ini belum pakai alur draft/approval — data langsung masuk saat diinput.</p>
      ) : loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : skpdNames.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Tidak ada kontrak yang menunggu persetujuan.</p>
      ) : (
        <div className="space-y-4">
          {skpdNames.map(nama => (
            <div key={nama}>
              <p className="text-sm font-semibold text-gray-800 mb-2">{nama}</p>
              <div className="space-y-2">
                {bySkpd[nama].map(h => {
                  const items = h.payload.draft_items || []
                  const total = items.reduce((s, i) => s + (parseFloat(i.harga || '0') || 0), 0)
                  return (
                    <div key={h.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-700">Kontrak: {h.no_sk} · {h.tanggal} · {items.length} barang · {formatRp(total)}</p>
                      <ul className="text-xs text-gray-500 mt-1 list-disc list-inside">
                        {items.slice(0, 8).map((it, i) => <li key={i}>{it.nama || it.kode} <span className="text-gray-400">({it.kode})</span></li>)}
                        {items.length > 8 && <li className="text-gray-400">...dan {items.length - 8} lainnya</li>}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
