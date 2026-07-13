'use client'
// Pengadaan Entry Manual — SATU tampilan gabungan (keputusan user 2026-07-12).
// Pilih SKPD → daftar campur (Non-fisik + Konstruksi, ada kolom Jenis) + satu
// Total Pengadaan (enak rekon keuangan). "+ Tambah Pengadaan" → baru pilih
// jenis (Non-fisik / Pekerjaan Fisik Konstruksi) → drill ke form-nya. Klik baris
// → buka kontrak itu di editor aslinya. Editor & alur approval TETAP di
// Pengadaan.tsx / KonstruksiPengadaan.tsx (dipakai ulang lewat mode "drill").
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { formatRupiah } from '@/lib/export'
import Pengadaan from './Pengadaan'
import KonstruksiPengadaan from './KonstruksiPengadaan'
import { barangKdpList, type KontrakKonstruksiPayload } from '@/lib/kdp'

type Jenis = 'nonfisik' | 'fisik'
type Row = { id: string; jenis: Jenis; nama: string; sub: string; status: string; nilai: number }
type Screen = { t: 'list' } | { t: 'create'; jenis: Jenis } | { t: 'open'; jenis: Jenis; id: string }

const SUMBER_LABEL: Record<string, string> = {
  kwitansi: 'Kwitansi', bukti_pembelian: 'Bukti Pembelian', surat_pesanan: 'Surat Pesanan', spk: 'Surat Perintah Kerja (SPK)',
}
const toNum = (s: unknown) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }

export default function PengadaanEntry() {
  const supabase = createClient()
  const [skpd, setSkpd] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState<Screen>({ t: 'list' })
  const [pickType, setPickType] = useState(false)

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setRows([]); return }
    setLoading(true)
    const sid = Number(skpdId)
    const [{ data: nf }, { data: k }] = await Promise.all([
      supabase.from('jurnal_header').select('id,no_sk,jenis,payload,approval_status,tanggal')
        .eq('kategori', 'pengadaan').eq('skpd_id', sid).order('tanggal', { ascending: false }),
      supabase.from('jurnal_header').select('id,no_sk,payload,approval_status,tanggal')
        .eq('kategori', 'konstruksi').eq('skpd_id', sid).order('tanggal', { ascending: false }),
    ])
    type NfH = { id: string; no_sk: string; jenis: string; payload: { draft_items?: { harga?: string; qty?: string | number }[] } | null; approval_status: string }
    type KH = { id: string; no_sk: string; payload: KontrakKonstruksiPayload | null; approval_status: string }
    const nfHs = (nf || []) as NfH[]
    const kHs = (k || []) as KH[]

    // Nilai non-fisik disetujui dibaca dari ledger (dedup per aset aktif) — sama pola Pengadaan.
    const disIds = nfHs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    const ledger = new Map<string, number>()
    if (disIds.length) {
      const { data: led } = await supabase.from('transaksi_bmd')
        .select('header_id,nilai,aset:aset_id(id,status)').eq('jenis', 'pengadaan').in('header_id', disIds).order('id', { ascending: false })
      const seen = new Set<string>()
      for (const r of (led || []) as unknown as { header_id: string; nilai: number; aset: { id: string; status: string } | null }[]) {
        if (!r.aset || seen.has(r.aset.id) || r.aset.status !== 'aktif') continue
        seen.add(r.aset.id); ledger.set(r.header_id, (ledger.get(r.header_id) || 0) + Number(r.nilai || 0))
      }
    }

    const out: Row[] = []
    for (const h of nfHs) {
      if (h.approval_status === 'ditolak') continue
      const items = h.payload?.draft_items || []
      const nilai = h.approval_status === 'disetujui' ? (ledger.get(h.id) || 0)
        : items.reduce((s, i) => s + toNum(i.harga) * Math.max(1, Math.floor(toNum(i.qty)) || 1), 0) // qty utk draft lama (per-unit baru qty=1)
      if (h.approval_status === 'disetujui' && nilai === 0) continue // disetujui kosong (semua item dibatalkan) — disembunyikan spt Pengadaan
      out.push({ id: h.id, jenis: 'nonfisik', nama: SUMBER_LABEL[h.jenis] || 'Pengadaan', sub: `${h.no_sk} · ${items.length} barang`, status: h.approval_status, nilai })
    }
    for (const h of kHs) {
      // Konstruksi multi-KDP: nilai = Σ termin semua barang (kompat payload lama via barangKdpList).
      const barangs = h.payload ? barangKdpList(h.payload) : []
      const nilai = barangs.reduce((s, b) => s + (b.pembayaran || []).reduce((t, x) => t + Number(x.nominal || 0), 0), 0)
      out.push({ id: h.id, jenis: 'fisik', nama: h.payload?.nama_pekerjaan || '(tanpa nama)', sub: `${h.no_sk} · ${barangs.length} barang KDP`, status: h.approval_status, nilai })
    }
    setRows(out)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(skpd); setScreen({ t: 'list' }); setPickType(false) }, [skpd, load])

  const backReload = () => { setScreen({ t: 'list' }); setPickType(false); load(skpd) }
  const total = rows.reduce((s, r) => s + r.nilai, 0)
  const pending = rows.filter(r => r.status !== 'disetujui')
  const disetujui = rows.filter(r => r.status === 'disetujui')

  const badge = (j: Jenis) => (
    <span className={`text-[11px] px-1.5 py-0.5 rounded ${j === 'fisik' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'}`}>
      {j === 'fisik' ? 'Konstruksi' : 'Non-fisik'}
    </span>
  )
  const rowLine = (r: Row) => (
    <tr key={`${r.jenis}-${r.id}`} className="hover:bg-gray-50 cursor-pointer" onClick={() => setScreen({ t: 'open', jenis: r.jenis, id: r.id })}>
      <td className="table-td">{badge(r.jenis)}</td>
      <td className="table-td text-sm font-medium">{r.nama}<div className="text-xs text-gray-400 font-normal">{r.sub}</div></td>
      <td className="table-td text-right text-sm">{formatRupiah(r.nilai)}</td>
      <td className="table-td text-right"><span className="text-teal hover:underline text-xs font-medium">Buka →</span></td>
    </tr>
  )

  const drill = screen.t !== 'list'
  const jenis = screen.t !== 'list' ? screen.jenis : null
  const startCreate = screen.t === 'create'
  const openId = screen.t === 'open' ? screen.id : undefined

  return (
    <FormShell judul="Pengadaan" msg=""
      deskripsi="Pilih SKPD, lalu tambah pengadaan (Non-fisik atau Pekerjaan Fisik Konstruksi) — semua terkumpul dalam satu daftar & total."
      headerRight={skpd && !drill ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total Pengadaan ({rows.length} kontrak)</p>
          <p className="text-lg font-bold text-gray-900">{formatRupiah(total)}</p>
        </div>
      ) : undefined}>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={setSkpd} placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat & membuat pengadaan.</div>
      ) : drill ? (
        jenis === 'fisik'
          ? <KonstruksiPengadaan skpdProp={skpd} embedded startCreate={startCreate} openId={openId} onExit={backReload} />
          : <Pengadaan skpdProp={skpd} embedded startCreate={startCreate} openId={openId} onExit={backReload} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{rows.length} kontrak pengadaan</span>
            <div className="relative">
              <button className="btn-primary" onClick={() => setPickType(v => !v)}>+ Tambah Pengadaan</button>
              {pickType && (
                <div className="absolute right-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap" onClick={() => setScreen({ t: 'create', jenis: 'nonfisik' })}>Non-fisik (barang biasa)</button>
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap border-t border-gray-100" onClick={() => setScreen({ t: 'create', jenis: 'fisik' })}>Pekerjaan Fisik Konstruksi</button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : rows.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengadaan untuk SKPD ini.</div>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100"><h3 className="text-sm font-semibold text-amber-700">⏳ Menunggu Persetujuan ({pending.length})</h3></div>
                  <table className="w-full"><tbody className="divide-y divide-gray-50">{pending.map(rowLine)}</tbody></table>
                </div>
              )}
              {disetujui.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujui.length})</h3></div>
                  <table className="w-full"><tbody className="divide-y divide-gray-50">{disetujui.map(rowLine)}</tbody></table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </FormShell>
  )
}
