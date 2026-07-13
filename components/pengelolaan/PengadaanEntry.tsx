'use client'
// Pengadaan Entry Manual — SATU halaman, semua kartu ter-expand inline
// (Non-fisik + Konstruksi jadi satu daftar, tanpa dibedakan). Menambah lewat
// SATU tombol "+ Tambah Pengadaan" → pilih Non-fisik / Pekerjaan Konstruksi →
// form-nya muncul & daftar disembunyikan (pola page non-fisik). Total atas =
// gabungan keduanya, auto-refresh via onDataChange.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { formatRupiah } from '@/lib/export'
import Pengadaan from './Pengadaan'
import KonstruksiPengadaan from './KonstruksiPengadaan'
import { barangKdpList, type KontrakKonstruksiPayload } from '@/lib/kdp'

const toNum = (s: unknown) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
type Creating = null | 'nonfisik' | 'konstruksi'

export default function PengadaanEntry() {
  const supabase = createClient()
  const [skpd, setSkpd] = useState('')
  const [total, setTotal] = useState(0)
  const [creating, setCreating] = useState<Creating>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const skpdRef = useRef(skpd); skpdRef.current = skpd

  // Total gabungan (Non-fisik + Konstruksi) utk header. Non-fisik disetujui dari
  // ledger (dedup aset aktif); draft dari estimasi draft_items; konstruksi = Σ
  // termin semua barang (kompat payload lama via barangKdpList).
  const loadTotal = useCallback(async (skpdId: string) => {
    if (!skpdId) { setTotal(0); return }
    const sid = Number(skpdId)
    const [{ data: nf }, { data: k }] = await Promise.all([
      supabase.from('jurnal_header').select('id,jenis,payload,approval_status').eq('kategori', 'pengadaan').eq('skpd_id', sid),
      supabase.from('jurnal_header').select('id,payload,approval_status').eq('kategori', 'konstruksi').eq('skpd_id', sid),
    ])
    type NfH = { id: string; jenis: string; payload: { draft_items?: { harga?: string; qty?: string | number }[] } | null; approval_status: string }
    type KH = { id: string; payload: KontrakKonstruksiPayload | null; approval_status: string }
    const nfHs = (nf || []) as NfH[]
    const kHs = (k || []) as KH[]

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

    let t = 0
    for (const h of nfHs) {
      if (h.approval_status === 'ditolak') continue
      if (h.approval_status === 'disetujui') t += ledger.get(h.id) || 0
      else t += (h.payload?.draft_items || []).reduce((s, i) => s + toNum(i.harga) * Math.max(1, Math.floor(toNum(i.qty)) || 1), 0)
    }
    for (const h of kHs) {
      if (h.approval_status === 'ditolak') continue
      const barangs = h.payload ? barangKdpList(h.payload) : []
      t += barangs.reduce((s, b) => s + (b.pembayaran || []).reduce((u, x) => u + Number(x.nominal || 0), 0), 0)
    }
    setTotal(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTotal(skpd); setCreating(null); setPickOpen(false) }, [skpd, loadTotal])
  const refresh = useCallback(() => loadTotal(skpdRef.current), [loadTotal])

  return (
    <FormShell judul="Pengadaan" msg=""
      deskripsi="Pilih SKPD — semua pengadaan (Non-fisik & Pekerjaan Fisik Konstruksi) tampil dalam satu daftar."
      headerRight={skpd ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total Pengadaan</p>
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
      ) : creating === 'nonfisik' ? (
        <Pengadaan skpdProp={skpd} embedded startCreate onExit={() => setCreating(null)} onDataChange={refresh} />
      ) : creating === 'konstruksi' ? (
        <KonstruksiPengadaan skpdProp={skpd} embedded startCreate onExit={() => setCreating(null)} onDataChange={refresh} />
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <div className="relative">
              <button className="btn-primary" onClick={() => setPickOpen(v => !v)}>+ Tambah Pengadaan</button>
              {pickOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-sm">
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap" onClick={() => { setPickOpen(false); setCreating('nonfisik') }}>Non-fisik (barang biasa)</button>
                  <button className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 whitespace-nowrap border-t border-gray-100" onClick={() => { setPickOpen(false); setCreating('konstruksi') }}>Pekerjaan Fisik Konstruksi</button>
                </div>
              )}
            </div>
          </div>
          <Pengadaan skpdProp={skpd} embedded hideAdd onDataChange={refresh} />
          <KonstruksiPengadaan skpdProp={skpd} embedded hideAdd onDataChange={refresh} />
        </div>
      )}
    </FormShell>
  )
}
