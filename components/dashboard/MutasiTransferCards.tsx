'use client'
// Kartu "Mutasi & Transfer" + donut disetujui/menunggu, sama pola dgn
// CaraPerolehanCards. "Transfer Keluar" & "Transfer Masuk" (begitu juga
// "Pengeluaran"/"Penerimaan" Internal) menampilkan angka yang SAMA — dashboard
// ini global (bukan per-SKPD), jadi keluar dari SKPD A = masuk ke SKPD B,
// satu set jurnal_header yang sama, cuma dilabeli dari dua sisi. Klik
// disetujui/menunggu → popup rincian (per-SKPD utk disetujui, per-jurnal utk
// menunggu), sama pola dgn popup di CaraPerolehanCards.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'

const nf = (n: number) => n.toLocaleString('id-ID')

type Kategori = 'pengalihan_status' | 'mutasi_internal'
type Arah = 'keluar' | 'masuk'
type CardDef = { key: string; label: string; note: string; kategori: Kategori; arah: Arah; disetujui: number; belum: number }

export default function MutasiTransferCards({ approved }: {
  approved: { transfer: number; mutasiInternal: number }
}) {
  const supabase = createClient()
  const [pending, setPending] = useState({ transfer: 0, mutasiInternal: 0 })
  const [detail, setDetail] = useState<{ kategori: Kategori; arah: Arah; mode: 'disetujui' | 'menunggu'; label: string } | null>(null)

  useEffect(() => {
    (async () => {
      async function pendingCount(kategori: Kategori): Promise<number> {
        let total = 0
        for (let from = 0; ; from += 500) {
          const { data } = await supabase.from('jurnal_header').select('payload')
            .eq('kategori', kategori).eq('approval_status', 'pending').range(from, from + 499)
          if (!data || data.length === 0) break
          for (const r of data as { payload: { draft_items?: unknown[] } }[]) total += r.payload?.draft_items?.length || 0
          if (data.length < 500) break
        }
        return total
      }
      const [transfer, mutasiInternal] = await Promise.all([
        pendingCount('pengalihan_status'),
        pendingCount('mutasi_internal'),
      ])
      setPending({ transfer, mutasiInternal })
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cards: CardDef[] = [
    { key: 'transfer-keluar', label: 'Transfer Keluar SKPD', note: 'Pengalihan status — sisi pengirim', kategori: 'pengalihan_status', arah: 'keluar', disetujui: approved.transfer, belum: pending.transfer },
    { key: 'transfer-masuk', label: 'Transfer Masuk SKPD', note: 'Pengalihan status — sisi penerima', kategori: 'pengalihan_status', arah: 'masuk', disetujui: approved.transfer, belum: pending.transfer },
    { key: 'keluar-internal', label: 'Pengeluaran Internal', note: 'Mutasi antar sub-SKPD — sisi pengirim', kategori: 'mutasi_internal', arah: 'keluar', disetujui: approved.mutasiInternal, belum: pending.mutasiInternal },
    { key: 'masuk-internal', label: 'Penerimaan Internal', note: 'Mutasi antar sub-SKPD — sisi penerima', kategori: 'mutasi_internal', arah: 'masuk', disetujui: approved.mutasiInternal, belum: pending.mutasiInternal },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <DonutCard key={c.key} label={c.label} note={c.note} disetujui={c.disetujui} belum={c.belum}
            onClickDisetujui={() => setDetail({ kategori: c.kategori, arah: c.arah, mode: 'disetujui', label: c.label })}
            onClickMenunggu={() => setDetail({ kategori: c.kategori, arah: c.arah, mode: 'menunggu', label: c.label })} />
        ))}
      </div>
      {detail?.mode === 'disetujui' && (
        <DisetujuiModal kategori={detail.kategori} arah={detail.arah} label={detail.label} onClose={() => setDetail(null)} />
      )}
      {detail?.mode === 'menunggu' && (
        <MenungguModal kategori={detail.kategori} label={detail.label} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function DonutCard({ label, note, disetujui, belum, onClickDisetujui, onClickMenunggu }: {
  label: string; note: string; disetujui: number; belum: number
  onClickDisetujui: () => void; onClickMenunggu: () => void
}) {
  const total = disetujui + belum
  const pct = total > 0 ? Math.round((disetujui / total) * 100) : 100
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-600 leading-tight h-8">{label}</p>
      <div className="flex items-center gap-3 mt-1">
        <div
          className="relative flex-shrink-0"
          style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(#0d9488 ${pct}%, #fbbf24 ${pct}% 100%)` }}
          title={`${pct}% disetujui`}
        >
          <div className="absolute inset-[5px] bg-white rounded-full flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-700">{pct}%</span>
          </div>
        </div>
        <div className="text-xs space-y-1">
          <button onClick={onClickDisetujui} className="flex items-center gap-1.5 hover:underline" disabled={disetujui === 0}>
            <span className="w-2 h-2 rounded-full bg-teal inline-block" />
            <span className="text-gray-700">{nf(disetujui)} disetujui</span>
          </button>
          <button onClick={onClickMenunggu} className="flex items-center gap-1.5 hover:underline" disabled={belum === 0}>
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span className="text-gray-700">{nf(belum)} menunggu</span>
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1 leading-tight">{note}</p>
    </div>
  )
}

async function fetchSkpdMap(supabase: ReturnType<typeof createClient>): Promise<Record<number, string>> {
  const map: Record<number, string> = {}
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
    if (!data || data.length === 0) break
    for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
    if (data.length < 1000) break
  }
  return map
}

// ── Popup "Disetujui": kelompok per SKPD (asal utk arah keluar, tujuan utk
// arah masuk) — hanya aset yang event TERAKHIR-nya masih transfer maju yg berlaku
// (bukan pembalik, & aset kini di skpd_tujuan). Sama persis logika count di server,
// lihat app/dashboard/page.tsx countTransferAktif.
function DisetujuiModal({ kategori, arah, label, onClose }: { kategori: Kategori; arah: Arah; label: string; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<{ skpdNama: string; total: number; lines: { lawanNama: string; nama_barang: string | null; nibar: string | null; nilai: number }[] }[]>([])

  useEffect(() => {
    (async () => {
      const skpdMap = await fetchSkpdMap(supabase)
      const rows: { id: number; skpd_asal: number; skpd_tujuan: number; nilai: number; payload: { reversal?: boolean } | null; aset: { id: string; nibar: string | null; nama_barang: string | null; skpd_id: number } | null }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('transaksi_bmd')
          .select('id,skpd_asal,skpd_tujuan,nilai,payload,aset:aset_id(id,nibar,nama_barang,skpd_id)')
          .eq('jenis', kategori).range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as unknown as typeof rows))
        if (data.length < 1000) break
      }
      // Ambil event TERAKHIR per aset (id terbesar) — sama logika dgn countTransferAktif
      // di app/dashboard/page.tsx: baris pembalik (payload.reversal) & aset yg sudah
      // balik ke asal TIDAK ditampilkan sbg transfer aktif.
      const latest = new Map<string, typeof rows[number]>()
      for (const r of rows) {
        if (!r.aset) continue
        const prev = latest.get(r.aset.id)
        if (!prev || r.id > prev.id) latest.set(r.aset.id, r)
      }
      const groupMap = new Map<number, { total: number; lines: { lawan: number; nama_barang: string | null; nibar: string | null; nilai: number }[] }>()
      for (const r of latest.values()) {
        if (r.payload?.reversal === true || !r.aset || r.aset.skpd_id !== r.skpd_tujuan) continue
        const ownerId = arah === 'keluar' ? r.skpd_asal : r.skpd_tujuan
        const lawanId = arah === 'keluar' ? r.skpd_tujuan : r.skpd_asal
        const g = groupMap.get(ownerId) || { total: 0, lines: [] }
        g.total += r.nilai || 0
        g.lines.push({ lawan: lawanId, nama_barang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai })
        groupMap.set(ownerId, g)
      }
      const out = [...groupMap.entries()]
        .map(([id, g]) => ({
          skpdNama: skpdMap[id] || `SKPD #${id}`,
          total: g.total,
          lines: g.lines.map(l => ({ lawanNama: skpdMap[l.lawan] || `SKPD #${l.lawan}`, nama_barang: l.nama_barang, nibar: l.nibar, nilai: l.nilai })),
        }))
        .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
      setGroups(out)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={`${label} — Sudah Disetujui`} onClose={onClose}>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Belum ada data.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.skpdNama}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">{g.skpdNama}</p>
                <p className="text-xs text-teal font-medium">{formatRupiah(g.total)}</p>
              </div>
              <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                {g.lines.map((l, i) => (
                  <li key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="text-gray-700">
                      {l.nama_barang || '-'} <span className="text-gray-400">({l.nibar || '-'})</span>
                      <span className="text-gray-400"> — {arah === 'keluar' ? 'ke' : 'dari'} {l.lawanNama}</span>
                    </span>
                    <span className="text-gray-600 flex-shrink-0 ml-3">{formatRupiah(l.nilai)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ── Popup "Menunggu": satu card per jurnal_header pending — kloning tiap
// entry-an user (No Dokumen, SKPD asal→tujuan, tanggal, daftar barang).
function MenungguModal({ kategori, label, onClose }: { kategori: Kategori; label: string; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [headers, setHeaders] = useState<{
    id: string; no_sk: string; tanggal: string; skpdAsalNama: string; skpdTujuanNama: string
    items: { nama_barang: string | null; nibar: string | null; nilai: number }[]
  }[]>([])

  useEffect(() => {
    (async () => {
      const skpdMap = await fetchSkpdMap(supabase)
      const { data: hs } = await supabase.from('jurnal_header')
        .select('id,no_sk,tanggal,skpd_id,skpd_tujuan,payload')
        .eq('kategori', kategori).eq('approval_status', 'pending')
        .order('tanggal', { ascending: false })
      const rows = (hs || []) as unknown as {
        id: string; no_sk: string; tanggal: string; skpd_id: number; skpd_tujuan: number | null
        payload: { draft_items?: { nama_barang: string | null; nibar: string | null; nilai: number }[] } | null
      }[]
      setHeaders(rows.map(h => ({
        id: h.id, no_sk: h.no_sk, tanggal: h.tanggal,
        skpdAsalNama: skpdMap[h.skpd_id] || `SKPD #${h.skpd_id}`,
        skpdTujuanNama: h.skpd_tujuan != null ? (skpdMap[h.skpd_tujuan] || `SKPD #${h.skpd_tujuan}`) : '-',
        items: h.payload?.draft_items || [],
      })))
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={`${label} — Menunggu Persetujuan`} onClose={onClose}>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : headers.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Tidak ada yang menunggu persetujuan.</p>
      ) : (
        <div className="space-y-3">
          {headers.map(h => (
            <div key={h.id} className="border border-gray-100 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700">
                {h.no_sk} · {h.tanggal} · {h.skpdAsalNama} → {h.skpdTujuanNama}
              </p>
              <ul className="text-xs text-gray-500 mt-1 list-disc list-inside">
                {h.items.slice(0, 8).map((it, i) => <li key={i}>{it.nama_barang || '-'} <span className="text-gray-400">({it.nibar || '-'})</span></li>)}
                {h.items.length > 8 && <li className="text-gray-400">...dan {h.items.length - 8} lainnya</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
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
