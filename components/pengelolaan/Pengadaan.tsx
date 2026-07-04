'use client'
// Cara Perolehan: Pengadaan (ber-SK + APPROVAL) — lihat CLAUDE.md § "Pola
// APPROVAL untuk menu Cara Perolehan".
//
//   1. Pilih SKPD.
//   2. "+ Tambah Pengadaan" → isi Kartu Kontrak + Kartu BAST → "Simpan Kontrak"
//      → jurnal_header dibuat langsung dgn approval_status='pending', TANPA
//      barang & TANPA menyentuh ledger sama sekali.
//   3. Di kartu "Menunggu Persetujuan": pilih Jenis BMD → cari kode → isi
//      satuan/kuantitas/harga/spesifikasi → "Tambah ke Draft". Baris tersimpan
//      di jurnal_header.payload.draft_items (JSON biasa, BUKAN ledger) — bebas
//      diedit/dihapus selama masih pending (klik delete/qty-fix = LANGSUNG,
//      tanpa perlu ledger apa pun karena belum pernah ditulis ke sana).
//   4. Admin klik "Setujui" → BARU semua draft di-materialize: kuantitas>1
//      di-split jadi N aset (jumlah=1) + transaksi ledger 'pengadaan' ber-
//      header_id, pakai TANGGAL BAST sbg tgl perolehan efektif. "Tolak" →
//      status ditolak, tidak pernah menyentuh ledger.
//   5. Barang yang SUDAH disetujui bisa diedit datanya (NIBAR/nama/spesifikasi/
//      merek/satuan/komptabel) via ikon ✎. Koreksi SETELAH approve (mis.
//      kelebihan kuantitas) pakai 'batal_pengadaan' — dicatat mundur ke tgl
//      pengadaan aslinya supaya barang dianggap tidak pernah ada.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'

type SumberPengadaan = 'kwitansi' | 'bukti_pembelian' | 'surat_pesanan' | 'spk'
const SUMBER_OPT: { value: SumberPengadaan; label: string }[] = [
  { value: 'kwitansi', label: 'Kwitansi' },
  { value: 'bukti_pembelian', label: 'Bukti Pembelian' },
  { value: 'surat_pesanan', label: 'Surat Pesanan' },
  { value: 'spk', label: 'Surat Perintah Kerja (SPK)' },
]
const sumberLabel = (v: string) => SUMBER_OPT.find(o => o.value === v)?.label || v

// Satu DraftItem = satu unit barang (kuantitas SUDAH dipecah saat ditambahkan,
// bukan saat approve) — supaya tiap unit bisa beda spesifikasi/no. seri/foto
// (mis. pengadaan 5 kendaraan, tiap unit beda nomor rangka/mesin).
type DraftItem = {
  key: string; golongan: string; kode: string; nama: string; spesifikasi: string
  satuan: string; harga: string
}
type HeaderPayload = {
  program?: string; kegiatan?: string; sub_kegiatan?: string
  nama_penyedia?: string; nama_ppk?: string
  no_bast?: string; tgl_bast?: string; ket_bast?: string
  draft_items?: DraftItem[]
}
type ApprovalStatus = 'pending' | 'disetujui' | 'ditolak'
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; jenis: string
  keterangan: string | null; payload: HeaderPayload
  approval_status: ApprovalStatus; approved_at: string | null; rejected_reason: string | null
}
// Barang yang SUDAH disetujui (dibaca dari ledger, bukan draft).
type JurnalLine = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi: string | null; merek_tipe: string | null; satuan: string | null
  intra_ekstra: string | null; nilai: number; tanggal: string
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const toInt = (s: string) => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)
const draftTotal = (items: DraftItem[]) => items.reduce((s, i) => s + toNum(i.harga), 0)

export default function Pengadaan() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [mode, setMode] = useState<'list' | 'kontrak-baru'>('list')
  const [editing, setEditing] = useState<Header | null>(null)
  const [editBarang, setEditBarang] = useState<{ line: JurnalLine } | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdList(data || []))
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,jenis,keterangan,payload,approval_status,approved_at,rejected_reason')
      .eq('kategori', 'pengadaan').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, payload: h.payload || {}, lines: [], total: 0 })

    const disetujuiIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    if (disetujuiIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,tanggal,aset:aset_id(id,nibar,nama_barang,kode,spesifikasi,merek_tipe,satuan,intra_ekstra,status)')
        .eq('jenis', 'pengadaan')
        .in('header_id', disetujuiIds)
        .order('id', { ascending: false })

      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; tanggal: string
        aset: {
          id: string; nibar: string | null; nama_barang: string | null; kode: string
          spesifikasi: string | null; merek_tipe: string | null; satuan: string | null
          intra_ekstra: string | null; status: string
        } | null
      }[]
      // Dedup per aset: baris pengadaan TERBARU (id desc) menentukan keanggotaan.
      // Hanya aset yang masih 'aktif' (belum di-batal_pengadaan/dihapus) yang tampil.
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset || seen.has(r.aset.id)) continue
        seen.add(r.aset.id)
        if (r.aset.status !== 'aktif') continue
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          spesifikasi: r.aset.spesifikasi, merek_tipe: r.aset.merek_tipe, satuan: r.aset.satuan,
          intra_ekstra: r.aset.intra_ekstra, nilai: r.nilai, tanggal: r.tanggal,
        })
        j.total += r.nilai
      }
    }
    // Sembunyikan kontrak disetujui yang barangnya semua sudah dibatalkan (auto-ilang).
    setJurnals([...jmap.values()].filter(j => j.approval_status !== 'disetujui' || j.lines.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  // ── Persist perubahan draft_items ke jurnal_header.payload ────────────────
  async function savePayload(headerId: string, payload: HeaderPayload) {
    const { error } = await supabase.from('jurnal_header').update({ payload }).eq('id', headerId)
    if (error) { setMsg(`Error: gagal menyimpan draft: ${error.message}`); return false }
    return true
  }

  async function tambahDraftItems(h: Jurnal, newItems: DraftItem[]) {
    const items = [...(h.payload.draft_items || []), ...newItems]
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function hapusDraftItem(h: Jurnal, key: string) {
    if (!confirm('Hapus barang ini dari draft?')) return
    const items = (h.payload.draft_items || []).filter(i => i.key !== key)
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function updateDraftItem(h: Jurnal, key: string, patch: Partial<DraftItem>) {
    const items = (h.payload.draft_items || []).map(i => i.key === key ? { ...i, ...patch } : i)
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  // Terapkan satu teks spesifikasi ke banyak barang sekaligus (dicentang via checklist).
  async function bulkSetSpesifikasi(h: Jurnal, keys: string[], spesifikasi: string) {
    const items = (h.payload.draft_items || []).map(i => keys.includes(i.key) ? { ...i, spesifikasi } : i)
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }

  // ── Approve: materialize draft_items → aset + transaksi_bmd ────────────────
  // Draft sudah per-unit (dipecah saat ditambahkan) jadi tinggal 1:1 ke aset.
  async function approveHeader(h: Jurnal) {
    const items = h.payload.draft_items || []
    if (items.length === 0) { setMsg('Error: kontrak ini belum ada barangnya — tambahkan dulu sebelum disetujui.'); return }
    for (const it of items) {
      if (!it.kode) { setMsg('Error: ada barang draft tanpa kode.'); return }
      if (toNum(it.harga) <= 0) { setMsg(`Error: harga "${it.nama || it.kode}" harus > 0.`); return }
    }
    const perolehanDate = h.payload.tgl_bast || h.tanggal
    if (!confirm(`Setujui kontrak ${h.no_sk}?\n${items.length} barang akan dicatat resmi dgn tgl perolehan ${perolehanDate}.`)) return

    setBusyId(h.id); setMsg('')
    const periode = periodeDariTanggal(perolehanDate)
    const asetRows = items.map(it => ({
      nibar: null, kode: it.kode, nama_barang: it.nama.trim() || null,
      spesifikasi: it.spesifikasi.trim() || null, merek_tipe: null, jumlah: 1,
      satuan: it.satuan.trim() || null, harga_satuan: toNum(it.harga), nilai_perolehan: toNum(it.harga),
      tgl_perolehan: perolehanDate, skpd_id: Number(skpd), intra_ekstra: 'intra',
      cara_perolehan: 'pengadaan', status: 'aktif',
    }))
    const { data: inserted, error: asetErr } = await supabase.from('aset').insert(asetRows).select('id,nilai_perolehan')
    if (asetErr || !inserted) { setMsg(`Error: gagal membuat barang: ${asetErr?.message}`); setBusyId(null); return }

    const trxRows = (inserted as { id: string; nilai_perolehan: number }[]).map(a => ({
      aset_id: a.id, jenis: 'pengadaan', periode, tanggal: perolehanDate, nilai: a.nilai_perolehan,
      skpd_tujuan: Number(skpd), header_id: h.id,
      payload: { sumber: h.jenis, no_bast: h.payload.no_bast || null },
    }))
    const { error: trxErr } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (trxErr) {
      // Ledger gagal ditulis → barang yg terlanjur ke-insert JANGAN jadi aktif tanpa ledger.
      await supabase.from('aset').update({ status: 'dihapus' }).in('id', (inserted as { id: string }[]).map(a => a.id))
      setMsg(`Error: gagal mencatat transaksi: ${trxErr.message}`); setBusyId(null); return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: appErr } = await supabase.from('jurnal_header')
      .update({ approval_status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString() })
      .eq('id', h.id)
    if (appErr) { setMsg(`Barang sudah tercatat, tapi status approval gagal diupdate: ${appErr.message}`); setBusyId(null); loadJurnals(skpd); return }

    setMsg(`Kontrak ${h.no_sk} disetujui — ${asetRows.length} barang resmi tercatat (tgl perolehan ${perolehanDate}).`)
    setBusyId(null)
    loadJurnals(skpd)
  }

  async function rejectHeader(h: Jurnal) {
    if (!confirm(`Tolak kontrak ${h.no_sk}? Barang tidak akan dicatat sama sekali.`)) return
    const reason = window.prompt('Alasan penolakan (opsional):') || null
    setBusyId(h.id)
    const { error } = await supabase.from('jurnal_header')
      .update({ approval_status: 'ditolak', rejected_reason: reason }).eq('id', h.id)
    if (error) { setMsg(`Error: ${error.message}`); setBusyId(null); return }
    setMsg(`Kontrak ${h.no_sk} ditolak.`)
    setBusyId(null)
    loadJurnals(skpd)
  }

  // ── Koreksi pasca-approve: batal_pengadaan, dicatat mundur ke tgl asli ─────
  async function batalkanBarang(l: JurnalLine, h: Jurnal) {
    if (!confirm(`Batalkan pengadaan barang ini?\nDipakai untuk koreksi kesalahan input (mis. kelebihan kuantitas) — barang akan dianggap TIDAK PERNAH ADA sejak ${l.tanggal}.`)) return
    const { error } = await catatTransaksi(supabase, {
      asetId: l.aset_id, jenis: 'batal_pengadaan', tanggal: l.tanggal,
      keterangan: `Koreksi input pengadaan — kontrak ${h.no_sk}`,
    })
    if (error) { setMsg(`Error: ${error}`); return }
    setMsg('Barang dibatalkan (koreksi input) — dianggap tidak pernah ada di semua periode.')
    loadJurnals(skpd)
  }

  const pending = jurnals.filter(j => j.approval_status === 'pending')
  const disetujui = jurnals.filter(j => j.approval_status === 'disetujui')
  const ditolak = jurnals.filter(j => j.approval_status === 'ditolak')

  return (
    <FormShell judul="Pengadaan" msg={msg}
      deskripsi="Pilih SKPD, buat kontrak (draft), lengkapi barang, lalu tunggu persetujuan admin. Barang baru resmi tercatat setelah disetujui.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <select className="select-filter flex-1" value={skpd} onChange={e => { setSkpd(e.target.value); setMsg('') }}>
            <option value="">— pilih SKPD —</option>
            {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat kontrak pengadaan.
        </div>
      ) : mode === 'kontrak-baru' ? (
        <KontrakForm skpdNama={skpdNama || ''}
          onCancel={() => setMode('list')}
          onSaved={() => { setMode('list'); setMsg('Kontrak tersimpan sbg draft — lengkapi barang lalu tunggu persetujuan admin.'); loadJurnals(skpd) }}
          skpdId={Number(skpd)}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} kontrak pengadaan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('kontrak-baru') }}>+ Tambah Pengadaan</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengadaan untuk SKPD ini.</div>
          ) : (
            <>
              {pending.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-700">⏳ Menunggu Persetujuan ({pending.length})</h3>
                  {pending.map(h => (
                    <PendingCard key={h.id} h={h} isAdmin={isAdmin} busy={busyId === h.id}
                      golonganLabels={golonganLabels}
                      onEditHeader={() => setEditing(h)}
                      onTambah={items => tambahDraftItems(h, items)}
                      onHapusItem={key => hapusDraftItem(h, key)}
                      onUpdateItem={(key, patch) => updateDraftItem(h, key, patch)}
                      onBulkSpes={(keys, spesifikasi) => bulkSetSpesifikasi(h, keys, spesifikasi)}
                      onApprove={() => approveHeader(h)}
                      onReject={() => rejectHeader(h)}
                    />
                  ))}
                </section>
              )}
              {disetujui.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujui.length})</h3>
                  {disetujui.map(j => (
                    <ApprovedCard key={j.id} j={j}
                      onEditHeader={() => setEditing(j)}
                      onEditBarang={line => setEditBarang({ line })}
                      onBatalkan={line => batalkanBarang(line, j)}
                    />
                  ))}
                </section>
              )}
              {ditolak.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-400">✕ Ditolak ({ditolak.length})</h3>
                  {ditolak.map(h => (
                    <div key={h.id} className="card p-4 bg-gray-50/50 opacity-75">
                      <p className="text-sm font-medium text-gray-600">Kontrak: {h.no_sk} · {sumberLabel(h.jenis)}</p>
                      <p className="text-xs text-gray-400">Tgl kontrak {h.tanggal} · {h.periode}</p>
                      {h.rejected_reason && <p className="text-xs text-gray-500 mt-1">Alasan: {h.rejected_reason}</p>}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header kontrak diperbarui.'); loadJurnals(skpd) }}
        />
      )}
      {editBarang && (
        <EditBarangModal line={editBarang.line}
          onClose={() => setEditBarang(null)}
          onSaved={() => { setEditBarang(null); setMsg('Data barang diperbarui.'); loadJurnals(skpd) }}
        />
      )}
    </FormShell>
  )
}

// ── Kartu "Menunggu Persetujuan": draft_items (editable, per-unit) + tambah ──
function PendingCard({ h, isAdmin, busy, golonganLabels, onEditHeader, onTambah, onHapusItem, onUpdateItem, onBulkSpes, onApprove, onReject }: {
  h: Jurnal; isAdmin: boolean; busy: boolean; golonganLabels: Record<string, string>
  onEditHeader: () => void
  onTambah: (items: DraftItem[]) => void
  onHapusItem: (key: string) => void
  onUpdateItem: (key: string, patch: Partial<DraftItem>) => void
  onBulkSpes: (keys: string[], spesifikasi: string) => void
  onApprove: () => void; onReject: () => void
}) {
  const items = h.payload.draft_items || []
  const [showTambah, setShowTambah] = useState(items.length === 0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkSpes, setBulkSpes] = useState('')

  const allChecked = items.length > 0 && items.every(i => checked.has(i.key))
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(items.map(i => i.key)))
  }
  function toggleOne(key: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function terapkanBulkSpes() {
    if (checked.size === 0 || !bulkSpes.trim()) return
    onBulkSpes([...checked], bulkSpes.trim())
    setBulkSpes(''); setChecked(new Set())
  }

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/40">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-gray-800">Kontrak: {h.no_sk} <span className="font-normal text-gray-400">· {sumberLabel(h.jenis)}</span></p>
            <p className="text-xs text-gray-500">Tgl kontrak {h.tanggal} · {h.periode}
              {h.payload?.no_bast && ` · BAST ${h.payload.no_bast}`}
              {h.payload?.tgl_bast && ` (${h.payload.tgl_bast})`}
            </p>
            {(h.payload?.program || h.payload?.kegiatan || h.payload?.sub_kegiatan) && (
              <p className="text-xs text-gray-500">{[h.payload.program, h.payload.kegiatan, h.payload.sub_kegiatan].filter(Boolean).join(' › ')}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimasi Total</p>
              <p className="font-semibold text-gray-800">{formatRupiah(draftTotal(items))}</p>
            </div>
            <button title="Edit kontrak / BAST" onClick={onEditHeader}
              className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
          </div>
        </div>
      </div>

      {/* Draft items — sudah per-unit; checklist utk isi spesifikasi massal */}
      {items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-10 text-center"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th className="table-th w-10 text-center">Aksi</th>
                  <th className="table-th">Barang & Spesifikasi</th>
                  <th className="table-th w-24 text-center">Satuan</th>
                  <th className="table-th w-32 text-right">Harga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(it => (
                  <DraftRow key={it.key} item={it} checked={checked.has(it.key)}
                    onToggle={() => toggleOne(it.key)}
                    onChange={patch => onUpdateItem(it.key, patch)}
                    onDelete={() => onHapusItem(it.key)} />
                ))}
              </tbody>
            </table>
          </div>
          {checked.size > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-teal/5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600 flex-shrink-0">{checked.size} barang dicentang — isi spesifikasi sekaligus:</span>
              <input className="select-filter flex-1 min-w-[200px] text-xs" value={bulkSpes} onChange={e => setBulkSpes(e.target.value)} placeholder="mis. Nomor rangka MH1... / Nomor mesin JB1..." />
              <button className="btn-primary text-xs" onClick={terapkanBulkSpes} disabled={!bulkSpes.trim()}>Terapkan</button>
            </div>
          )}
        </>
      )}

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
        {showTambah ? (
          <TambahBarangPanel golonganLabels={golonganLabels}
            onTambah={newItems => { onTambah(newItems); setShowTambah(false) }}
            onCancel={() => setShowTambah(false)} />
        ) : (
          <button className="btn-secondary text-xs" onClick={() => setShowTambah(true)}>+ Tambah Barang</button>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">{items.length} barang</span>
        {isAdmin ? (
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={busy} onClick={onReject}>Tolak</button>
            <button className="btn-primary text-xs" disabled={busy || items.length === 0} onClick={onApprove}>
              {busy ? 'Memproses...' : '✓ Setujui'}
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Menunggu tinjauan admin.</span>
        )}
      </div>
    </div>
  )
}

// Satu unit draft — nama/spesifikasi/satuan/harga editable inline, checklist + delete langsung.
function DraftRow({ item, checked, onToggle, onChange, onDelete }: {
  item: DraftItem; checked: boolean; onToggle: () => void
  onChange: (patch: Partial<DraftItem>) => void; onDelete: () => void
}) {
  const [local, setLocal] = useState(item)
  const dirty = JSON.stringify(local) !== JSON.stringify(item)

  return (
    <tr>
      <td className="table-td text-center"><input type="checkbox" checked={checked} onChange={onToggle} /></td>
      <td className="table-td text-center">
        <button onClick={onDelete} title="Hapus barang ini" className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
      </td>
      <td className="table-td">
        <input className="select-filter w-full text-xs mb-1" value={local.nama} onChange={e => setLocal({ ...local, nama: e.target.value })} placeholder="nama barang" />
        <input className="select-filter w-full text-xs" value={local.spesifikasi} onChange={e => setLocal({ ...local, spesifikasi: e.target.value })} placeholder="spesifikasi / no. rangka / no. mesin" />
        <p className="text-gray-400 text-xs mt-0.5">{item.kode}</p>
        {!local.spesifikasi.trim() && <p className="text-amber-600 text-xs mt-0.5">⚠ Spesifikasi belum diisi.</p>}
        <p className="text-gray-300 text-xs">Foto belum diisi (menyusul).</p>
        {dirty && <button onClick={() => onChange(local)} className="text-xs text-teal font-medium mt-1">✓ Simpan perubahan</button>}
      </td>
      <td className="table-td"><input className="select-filter w-full text-xs text-center" value={local.satuan} onChange={e => setLocal({ ...local, satuan: e.target.value })} onBlur={() => dirty && onChange(local)} /></td>
      <td className="table-td"><input className="select-filter w-full text-xs text-right" inputMode="numeric" value={local.harga} onChange={e => setLocal({ ...local, harga: e.target.value })} onBlur={() => dirty && onChange(local)} /></td>
    </tr>
  )
}

// Panel "+ Tambah Barang": pilih Jenis BMD dulu → cari kode → isi satuan/qty/harga.
// Spesifikasi TIDAK di sini — diisi belakangan per-unit (atau massal via checklist)
// setelah barang di-split, karena tiap unit bisa beda (no. rangka/mesin, dst).
function TambahBarangPanel({ golonganLabels, onTambah, onCancel }: {
  golonganLabels: Record<string, string>
  onTambah: (items: DraftItem[]) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [golongan, setGolongan] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ kode: string; uraian: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<{ kode: string; uraian: string } | null>(null)
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('')
  const [qty, setQty] = useState('1')
  const [harga, setHarga] = useState('')
  const [err, setErr] = useState('')

  async function cari() {
    if (!golongan) { setErr('Pilih Jenis BMD dulu.'); return }
    setErr(''); setSearching(true)
    let q = supabase.from('kodefikasi_bmd').select('kode,uraian').like('kode', `${golongan}.%`)
    if (search.trim()) q = q.or(`kode.ilike.${search.trim()}%,uraian.ilike.%${search.trim()}%`)
    const { data } = await q.limit(30)
    setResults((data || []) as { kode: string; uraian: string | null }[])
    setSearching(false)
  }

  function pilih(r: { kode: string; uraian: string | null }) {
    setPicked({ kode: r.kode, uraian: r.uraian || '' })
    setNama(r.uraian || '')
    setResults([])
  }

  function simpan() {
    if (!picked) { setErr('Pilih kode barang dulu.'); return }
    const n = toInt(qty)
    if (n < 1) { setErr('Kuantitas minimal 1.'); return }
    if (toNum(harga) <= 0) { setErr('Harga harus > 0.'); return }
    // Split langsung jadi N unit terpisah — tiap unit nanti bisa beda spesifikasi/foto.
    const items: DraftItem[] = Array.from({ length: n }, () => ({
      key: newKey(), golongan, kode: picked.kode, nama: nama.trim() || picked.uraian,
      spesifikasi: '', satuan: satuan.trim(), harga,
    }))
    onTambah(items)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis BMD</label>
          <select className="select-filter" value={golongan} onChange={e => { setGolongan(e.target.value); setPicked(null); setResults([]) }}>
            <option value="">— pilih jenis —</option>
            {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Cari kode / nama baku (opsional)</label>
          <input className="select-filter w-full" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cari() } }} placeholder="mis. 'komputer'..." />
        </div>
        <button className="btn-secondary text-xs" onClick={cari} disabled={searching || !golongan}>{searching ? 'Mencari...' : 'Cari'}</button>
        <button className="btn-secondary text-xs" onClick={onCancel}>Batal</button>
      </div>

      {results.length > 0 && (
        <div className="border border-gray-100 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-50 bg-white">
          {results.map(r => (
            <button key={r.kode} onClick={() => pilih(r)} className="w-full text-left px-3 py-2 hover:bg-teal/5 text-xs">
              <span className="font-medium text-gray-700">{r.kode}</span>
              <span className="text-gray-500"> — {r.uraian || '(tanpa uraian)'} · {golonganLabels[kodeLevel3(r.kode)] || ''}</span>
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-3">
          <p className="text-xs text-gray-500">Kode: <span className="font-medium text-gray-700">{picked.kode}</span></p>
          <div><label className="block text-xs text-gray-500 mb-1">Nama Barang</label><input className="select-filter w-full text-sm" value={nama} onChange={e => setNama(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Satuan</label><input className="select-filter w-full text-sm" value={satuan} onChange={e => setSatuan(e.target.value)} placeholder="unit" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Kuantitas</label><input className="select-filter w-full text-sm" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Harga / item</label><input className="select-filter w-full text-sm" inputMode="numeric" value={harga} onChange={e => setHarga(e.target.value)} /></div>
          </div>
          <p className="text-xs text-gray-400">Kuantitas &gt; 1 langsung dipecah jadi beberapa barang terpisah — spesifikasi & foto diisi per-unit setelah ini (atau massal via checklist kalau sama semua).</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button className="btn-primary text-xs" onClick={simpan}>Tambah ke Draft</button>
        </div>
      )}
      {!picked && err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Kartu "Disetujui": barang resmi dari ledger, bisa diedit / dibatalkan ───
function ApprovedCard({ j, onEditHeader, onEditBarang, onBatalkan }: {
  j: Jurnal
  onEditHeader: () => void
  onEditBarang: (line: JurnalLine) => void
  onBatalkan: (line: JurnalLine) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-gray-800">Kontrak: {j.no_sk} <span className="font-normal text-gray-400">· {sumberLabel(j.jenis)}</span></p>
            <p className="text-xs text-gray-500">Tgl kontrak {j.tanggal} · {j.periode}
              {j.payload?.no_bast && ` · BAST ${j.payload.no_bast}`}
              {j.approved_at && ` · disetujui ${j.approved_at.slice(0, 10)}`}
            </p>
            {(j.payload?.nama_penyedia || j.payload?.nama_ppk) && (
              <p className="text-xs text-gray-500">
                {j.payload.nama_penyedia && `Penyedia: ${j.payload.nama_penyedia}`}
                {j.payload.nama_penyedia && j.payload.nama_ppk && ' · '}
                {j.payload.nama_ppk && `PPK: ${j.payload.nama_ppk}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Pengadaan</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
            </div>
            <button title="Edit kontrak / BAST" onClick={onEditHeader}
              className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th w-20 text-center">Aksi</th>
              <th className="table-th">Kode Register / Nama Barang</th>
              <th className="table-th">Merek / Tipe</th>
              <th className="table-th text-center">Satuan</th>
              <th className="table-th text-center">Komptabel</th>
              <th className="table-th text-right">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.lines.map(l => (
              <tr key={l.aset_id}>
                <td className="table-td text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onEditBarang(l)} title="Edit data barang" className="inline-flex items-center justify-center w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    <button onClick={() => onBatalkan(l)} title="Batalkan (koreksi kesalahan input)" className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                  </div>
                </td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '(NIBAR belum diisi)'} · {l.kode}</p>
                  {!l.spesifikasi && <p className="text-amber-600 text-xs mt-0.5">⚠ Spesifikasi belum diisi.</p>}
                </td>
                <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                <td className="table-td text-center text-xs">{l.satuan || '-'}</td>
                <td className="table-td text-center text-xs capitalize">{l.intra_ekstra || '-'}</td>
                <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Form kontrak baru (Kartu 1 + Kartu 2) — HANYA header, tanpa barang ──────
function KontrakForm({ skpdId, skpdNama, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; onCancel: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [sumber, setSumber] = useState<SumberPengadaan>('spk')
  const [noKontrak, setNoKontrak] = useState('')
  const [tglKontrak, setTglKontrak] = useState(new Date().toISOString().slice(0, 10))
  const [program, setProgram] = useState('')
  const [kegiatan, setKegiatan] = useState('')
  const [subKeg, setSubKeg] = useState('')
  const [ketKontrak, setKetKontrak] = useState('')
  const [penyedia, setPenyedia] = useState('')
  const [ppk, setPpk] = useState('')
  const [noBast, setNoBast] = useState('')
  const [tglBast, setTglBast] = useState('')
  const [ketBast, setKetBast] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); return }
    setErr(''); setSaving(true)
    const payload: HeaderPayload = {
      program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
      nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
      no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
      draft_items: [],
    }
    const { error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'pengadaan', jenis: sumber, sub_jenis: null,
      no_sk: noKontrak.trim(), tanggal: tglKontrak, keterangan: ketKontrak.trim() || null,
      payload, approval_status: 'pending',
    })
    if (error) { setErr(`Gagal menyimpan kontrak: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-gray-800">Pengadaan Baru — {skpdNama}</h2>
        <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Kartu 1 — Kontrak</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sumber Pengadaan</label>
            <select className="select-filter w-full" value={sumber} onChange={e => setSumber(e.target.value as SumberPengadaan)}>
              {SUMBER_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Kontrak</label>
            <input className="select-filter w-full" value={noKontrak} onChange={e => setNoKontrak(e.target.value)} placeholder="mis. 027/123/418.xx/2026" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak</label>
            <input type="date" className="select-filter w-full sm:w-64" value={tglKontrak} onChange={e => setTglKontrak(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tglKontrak)}</p>
          </div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Program</label><input className="select-filter w-full" value={program} onChange={e => setProgram(e.target.value)} placeholder="teks bebas (dropdown menyusul)" /></div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Kegiatan</label><input className="select-filter w-full" value={kegiatan} onChange={e => setKegiatan(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label><input className="select-filter w-full" value={subKeg} onChange={e => setSubKeg(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label><input className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ketKontrak} onChange={e => setKetKontrak(e.target.value)} /></div>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-2">Kartu 2 — Berita Acara Serah Terima (BAST)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(= tgl perolehan efektif)</span></label>
            <input type="date" className="select-filter w-full" value={tglBast} onChange={e => setTglBast(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Kosong → pakai tgl kontrak saat disetujui.</p>
          </div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end pt-2">
        <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Kontrak'}</button>
      </div>
    </div>
  )
}

// ── Modal edit header: kontrak (no/tgl, kunci semester) + BAST + penyedia/PPK ─
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const p = header.payload || {}
  const [noKontrak, setNoKontrak] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [program, setProgram] = useState(p.program || '')
  const [kegiatan, setKegiatan] = useState(p.kegiatan || '')
  const [subKeg, setSubKeg] = useState(p.sub_kegiatan || '')
  const [penyedia, setPenyedia] = useState(p.nama_penyedia || '')
  const [ppk, setPpk] = useState(p.nama_ppk || '')
  const [noBast, setNoBast] = useState(p.no_bast || '')
  const [tglBast, setTglBast] = useState(p.tgl_bast || '')
  const [ketBast, setKetBast] = useState(p.ket_bast || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const pindahSemester = periodeDariTanggal(tgl) !== header.periode

  async function simpan() {
    if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal kontrak masuk ${periodeDariTanggal(tgl)}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat jurnal baru.`)
      return
    }
    setErr(''); setSaving(true)
    const payload: HeaderPayload = {
      ...header.payload,
      program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
      nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
      no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noKontrak.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload })
      .eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Kontrak & BAST</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Kontrak</label>
            <input className="select-filter w-full" value={noKontrak} onChange={e => setNoKontrak(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak <span className="text-gray-400">(tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full sm:w-64" value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {periodeDariTanggal(tgl)} — di luar semester jurnal.</p>}
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Program</label><input className="select-filter w-full" value={program} onChange={e => setProgram(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Kegiatan</label><input className="select-filter w-full" value={kegiatan} onChange={e => setKegiatan(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Sub Kegiatan</label><input className="select-filter w-full" value={subKeg} onChange={e => setSubKeg(e.target.value)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Nama PPK</label><input className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)} /></div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} /></div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Berita Acara Serah Terima (BAST)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(tgl perolehan)</span></label><input type="date" className="select-filter w-full" value={tglBast} onChange={e => setTglBast(e.target.value)} /></div>
            </div>
            <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
            {header.approval_status === 'disetujui' && (
              <p className="text-xs text-gray-400 mt-2">Kontrak sudah disetujui — ubah tgl BAST di sini TIDAK memindahkan tgl perolehan barang yang sudah tercatat (ledger beku).</p>
            )}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal edit data barang (barang yang SUDAH disetujui) ────────────────────
// Update aset langsung (field non-finansial & NIBAR). Nilai/kuantitas TIDAK
// diedit di sini — struktural, lewat menu Koreksi atau 'batal_pengadaan'.
function EditBarangModal({ line, onClose, onSaved }: {
  line: JurnalLine; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [nibar, setNibar] = useState(line.nibar || '')
  const [nama, setNama] = useState(line.nama_barang || '')
  const [spesifikasi, setSpesifikasi] = useState(line.spesifikasi || '')
  const [merek, setMerek] = useState(line.merek_tipe || '')
  const [satuan, setSatuan] = useState(line.satuan || '')
  const [komptabel, setKomptabel] = useState(line.intra_ekstra || 'intra')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    setErr(''); setSaving(true)
    const patch: Record<string, unknown> = {
      nibar: nibar.trim() || null, nama_barang: nama.trim() || null,
      spesifikasi: spesifikasi.trim() || null, merek_tipe: merek.trim() || null,
      satuan: satuan.trim() || null, intra_ekstra: komptabel,
    }
    const { error } = await supabase.from('aset').update(patch).eq('id', line.aset_id)
    if (error) {
      setErr(error.message.includes('duplicate') ? 'NIBAR sudah dipakai barang lain — pakai nomor lain.' : `Gagal menyimpan: ${error.message}`)
      setSaving(false); return
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Data Barang</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-400">Kode: {line.kode} · Nilai: {formatRupiah(line.nilai)}</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">NIBAR</label>
            <input className="select-filter w-full" value={nibar} onChange={e => setNibar(e.target.value)} placeholder="isi nomor barang (opsional)" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama Barang</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Spesifikasi</label>
            <input className="select-filter w-full" value={spesifikasi} onChange={e => setSpesifikasi(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">Merek / Tipe</label><input className="select-filter w-full" value={merek} onChange={e => setMerek(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Satuan</label><input className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)} /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter w-full" value={komptabel} onChange={e => setKomptabel(e.target.value)}>
              <option value="intra">Intrakomptabel (disusutkan)</option>
              <option value="ekstra">Ekstrakomptabel (tidak disusutkan)</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">Foto barang menyusul di fase berikutnya. Perubahan nilai/kuantitas: lewat menu Koreksi, atau batalkan barang (koreksi input) kalau memang salah entry.</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}
