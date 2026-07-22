'use client'
// Cara Perolehan: Pengadaan (ber-SK + APPROVAL) — lihat CLAUDE.md § "Pola
// APPROVAL untuk menu Cara Perolehan".
//
//   1. Pilih SKPD.
//   2. "+ Tambah Pengadaan" → isi Kartu Kontrak + Kartu BAST → "Simpan Kontrak"
//      → jurnal_header dibuat langsung dgn approval_status='pending', TANPA
//      barang & TANPA menyentuh ledger sama sekali.
//   3. Di kartu "Menunggu Persetujuan": pilih Jenis BMD → cari kode → isi
//      satuan/kuantitas/harga → "Tambah ke Draft" (langsung di-split jadi N
//      unit terpisah). Spesifikasi & foto diisi belakangan lewat popup ✎ Edit
//      Spesifikasi (field-nya menyesuaikan golongan — lihat lib/asetFields.ts),
//      satu-satu atau massal via checklist.
//   4. Admin klik "Setujui" → BARU semua draft di-materialize ke aset+ledger,
//      pakai TANGGAL BAST sbg tgl perolehan efektif. TIDAK ADA "Tolak" — alurnya
//      cukup: user input → admin verifikasi → (kalau salah, edit draft) → setujui.
//   5. Kontrak DISETUJUI terkunci total (read-only). Untuk mengubah/menghapus,
//      admin "Buka Kunci" (unapprove) → kembali ke draft, edit, lalu setujui
//      ulang (acuan tgl tetap tgl BAST). Kontrak yang pernah disetujui punya
//      jejak ledger permanen (append-only) → tak bisa dihapus penuh; hanya
//      draft murni (belum pernah disetujui) yang bisa dihapus.
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'
import { fieldsForKode, allSameGolongan, ASET_FIELD_COLS, ASET_NUM_COLS } from '@/lib/asetFields'
import { generateNibars } from '@/lib/nibar'
import { formatRupiah } from '@/lib/export'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope, bolehSetujuiSkpd } from '@/lib/roles'
import FormShell from './FormShell'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import SkpdCombobox from '@/components/SkpdCombobox'
import RekeningPicker from '@/components/RekeningPicker'
import ProgramPicker from '@/components/ProgramPicker'
import ComboBox from '@/components/ComboBox'
import { useDateBounds } from '@/components/useTahunBuku'

type SumberPengadaan = 'kwitansi' | 'bukti_pembelian' | 'surat_pesanan' | 'spk'
const SUMBER_OPT: { value: SumberPengadaan; label: string }[] = [
  { value: 'kwitansi', label: 'Kwitansi' },
  { value: 'bukti_pembelian', label: 'Bukti Pembelian' },
  { value: 'surat_pesanan', label: 'Surat Pesanan' },
  { value: 'spk', label: 'Surat Perintah Kerja (SPK)' },
]
const sumberLabel = (v: string) => SUMBER_OPT.find(o => o.value === v)?.label || v

// Satu DraftItem = satu unit barang (kuantitas dipecah saat ditambahkan, bukan
// saat approve) — tiap unit bisa beda spesifikasi/no. rangka-mesin/foto.
// uraianBarang = uraian BAKU dari kodefikasi_bmd (kolom aset.uraian_barang),
// diambil sekali saat kode dipilih, TIDAK bisa diedit user — beda dari nama
// spesifik ("Spesifikasi Nama Barang", kolom aset.nama_barang) yang ikut
// sistem `fields` generik (editable lewat checklist+popup, spt field lain).
type DraftItem = {
  key: string; golongan: string; kode: string; uraianBarang: string
  rekening: string                 // kode rekening belanja (mis. 5.2.01.01.001) — teks bebas dulu
  satuan: string; harga: string
  fields: Record<string, string>   // field spesifikasi sesuai golongan (lib/asetFields.ts), termasuk nama_barang
  foto: string[]                    // path di storage bucket aset-foto
}
type KodefikasiHasil = {
  kode: string; uraian: string | null
  nama_objek: string | null; nama_rincian: string | null; nama_sub_rincian: string | null
  masa_manfaat_tahun: number | null; batas_kapitalisasi: number | null
}
type HeaderPayload = {
  program?: string; kegiatan?: string; sub_kegiatan?: string
  nama_penyedia?: string; nama_ppk?: string
  no_bast?: string; tgl_bast?: string; ket_bast?: string
  dokumen_paths?: string[]
  draft_items?: DraftItem[]
}
// 'ditolak' = LEGACY (fitur Tolak sudah dihapus) — baris lama tetap ditangani
// (disaring dari tampilan) supaya tak error, tapi tak pernah dibuat baru.
type ApprovalStatus = 'pending' | 'disetujui' | 'ditolak'
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; jenis: string
  keterangan: string | null; payload: HeaderPayload
  approval_status: ApprovalStatus; approved_at: string | null
}
// Barang yang SUDAH disetujui (dibaca dari aset+ledger, bukan draft).
type JurnalLine = {
  trx_id: number
  aset_id: string; nibar: string | null; kode: string; uraian_barang: string | null; nama_barang: string | null
  satuan: string | null; intra_ekstra: string | null; nilai: number; tanggal: string
  rekening: string
  foto_paths: string[]
  fields: Record<string, string>
}
// hasLedger = kontrak ini punya baris di transaksi_bmd (pernah disetujui, walau
// kini pending karena dibuka kunci) → tak boleh dihapus penuh (FK + append-only).
export type Jurnal = Header & { lines: JurnalLine[]; total: number; hasLedger: boolean }

const namaFile = (path: string) => path.split('/').pop() || path
const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const toInt = (s: string) => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)
export const draftTotal = (items: DraftItem[]) => items.reduce((s, i) => s + toNum(i.harga), 0)

// Baris label:value ringkas utk header kartu kontrak (Pengadaan & konstruksi).
function Baris({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex text-xs leading-relaxed">
      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-700">: {value || '-'}</span>
    </div>
  )
}

// Normalisasi draft_items lama (dari versi sebelum draft di-split per-unit sejak
// ditambahkan — masih pakai {qty, spesifikasi string}). Item lama diekspansi
// sesuai qty-nya jadi N unit terpisah (bukan cuma dihindari crash-nya), supaya
// data lama yg sempat dientry tidak hilang diam-diam.
// Rename kolom aset (migrasi 16) → key lama di draft_items JSON lama perlu
// dipetakan ke key baru supaya spesifikasi yg sudah dientry tidak "hilang".
const FIELD_KEY_RENAME: Record<string, string> = {
  spesifikasi: 'spesifikasi_lainnya', luas_tanah: 'luas', no_sertifikat: 'nomor_dokumen_kepemilikan',
  tgl_sertifikat: 'tanggal_dokumen_kepemilikan', atas_nama_sertifikat: 'nama_dokumen_kepemilikan', hak_kepemilikan: 'jenis_hak',
}
function remapFieldKeys(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields || {})) out[FIELD_KEY_RENAME[k] || k] = v
  return out
}
function normalizeDraftItems(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) return []
  const out: DraftItem[] = []
  for (const r of raw as Record<string, unknown>[]) {
    if (r && typeof r === 'object' && r.fields && typeof r.fields === 'object' && Array.isArray(r.foto)) {
      const fields = remapFieldKeys(r.fields as Record<string, string>)
      // Data sebelum nama_barang masuk sistem `fields` (top-level `r.nama`) →
      // pindahkan ke fields.nama_barang supaya tak hilang & bisa diedit via popup.
      if (!fields.nama_barang && typeof r.nama === 'string' && r.nama) fields.nama_barang = r.nama
      out.push({ rekening: '', uraianBarang: '', ...(r as unknown as DraftItem), fields })
      continue
    }
    const qty = Math.max(1, toInt(String(r?.qty ?? '1')) || 1)
    for (let i = 0; i < qty; i++) {
      out.push({
        key: newKey(),
        golongan: String(r?.golongan ?? ''), kode: String(r?.kode ?? ''), uraianBarang: '',
        rekening: String(r?.rekening ?? ''),
        satuan: String(r?.satuan ?? ''), harga: String(r?.harga ?? '0'),
        fields: {
          ...(r?.nama ? { nama_barang: String(r.nama) } : {}),
          ...(r?.spesifikasi ? { spesifikasi_lainnya: String(r.spesifikasi) } : {}),
        },
        foto: [],
      })
    }
  }
  return out
}
// Loader dipakai bersama: daftar internal komponen ini & daftar gabungan
// (PengadaanEntry). Kembalikan hanya kontrak pending & disetujui(berisi) —
// baris 'ditolak' legacy disaring. Barang disetujui dibaca dari aset+ledger
// (dedup aset aktif), draft dari payload.draft_items (dinormalisasi per-unit).
export async function fetchPengadaanJurnals(supabase: ReturnType<typeof createClient>, skpdId: string | number): Promise<Jurnal[]> {
  if (!skpdId) return []
  const { data: headers } = await supabase.from('jurnal_header')
    .select('id,no_sk,tanggal,periode,jenis,keterangan,payload,approval_status,approved_at')
    .eq('kategori', 'pengadaan').eq('skpd_id', Number(skpdId))
    .order('tanggal', { ascending: false })
  const hs = (headers || []) as Header[]

  const jmap = new Map<string, Jurnal>()
  for (const h of hs) {
    const payload = h.payload || {}
    jmap.set(h.id, { ...h, payload: { ...payload, draft_items: normalizeDraftItems(payload.draft_items) }, lines: [], total: 0, hasLedger: false })
  }

  // Deteksi kontrak yg punya jejak ledger (pernah disetujui) → tak bisa dihapus.
  const pendingIds = hs.filter(h => h.approval_status === 'pending').map(h => h.id)
  if (pendingIds.length > 0) {
    const { data: led } = await supabase.from('transaksi_bmd').select('header_id').in('header_id', pendingIds)
    for (const r of (led || []) as { header_id: string | null }[]) {
      const j = r.header_id && jmap.get(r.header_id); if (j) j.hasLedger = true
    }
  }

  const disetujuiIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
  if (disetujuiIds.length > 0) {
    const { data } = await supabase.from('transaksi_bmd')
      .select(`id,header_id,nilai,tanggal,payload,aset:aset_id(id,nibar,uraian_barang,kode,satuan,intra_ekstra,status,foto_paths,${ASET_FIELD_COLS.join(',')})`)
      .eq('jenis', 'pengadaan')
      .in('header_id', disetujuiIds)
      .order('id', { ascending: false })

    const rows = (data || []) as unknown as {
      id: number; header_id: string; nilai: number; tanggal: string; payload: { kode_rekening?: string } | null
      aset: ({
        id: string; nibar: string | null; nama_barang: string | null; uraian_barang: string | null; kode: string
        satuan: string | null; intra_ekstra: string | null; status: string; foto_paths: string[]
      } & Record<string, string | number | null>) | null
    }[]
    const seen = new Set<string>()
    for (const r of rows) {
      if (!r.aset || seen.has(r.aset.id)) continue
      seen.add(r.aset.id)
      if (r.aset.status !== 'aktif') continue
      const j = jmap.get(r.header_id)
      if (!j) continue
      const fields: Record<string, string> = {}
      for (const k of ASET_FIELD_COLS) { const v = r.aset[k]; if (v != null) fields[k] = String(v) }
      j.lines.push({
        trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, uraian_barang: r.aset.uraian_barang, nama_barang: r.aset.nama_barang,
        satuan: r.aset.satuan, intra_ekstra: r.aset.intra_ekstra, nilai: r.nilai, tanggal: r.tanggal,
        rekening: r.payload?.kode_rekening || '', foto_paths: r.aset.foto_paths || [], fields,
      })
      j.total += r.nilai
    }
  }
  // Tampilkan hanya pending & disetujui(berisi). Baris 'ditolak' legacy disaring.
  return [...jmap.values()].filter(j =>
    j.approval_status === 'pending' || (j.approval_status === 'disetujui' && j.lines.length > 0))
}

// Cek No. Kontrak / No. BAST belum dipakai (per SKPD, kategori pengadaan).
// 'ditolak' (legacy/arsip) dikecualikan — nomornya bebas dipakai ulang.
export async function cekNomorPengadaanDipakai(supabase: ReturnType<typeof createClient>, skpdId: number, noSk: string, noBast: string | undefined, excludeId?: string): Promise<string | null> {
  let qSk = supabase.from('jurnal_header').select('id').eq('kategori', 'pengadaan').eq('skpd_id', skpdId).eq('no_sk', noSk).neq('approval_status', 'ditolak')
  if (excludeId) qSk = qSk.neq('id', excludeId)
  const { data: dupSk } = await qSk.limit(1)
  if (dupSk && dupSk.length > 0) return `No. Kontrak "${noSk}" sudah dipakai kontrak lain di SKPD ini.`
  if (noBast) {
    let qBast = supabase.from('jurnal_header').select('id').eq('kategori', 'pengadaan').eq('skpd_id', skpdId).eq('payload->>no_bast', noBast).neq('approval_status', 'ditolak')
    if (excludeId) qBast = qBast.neq('id', excludeId)
    const { data: dupBast } = await qBast.limit(1)
    if (dupBast && dupBast.length > 0) return `No. BAST "${noBast}" sudah dipakai kontrak lain di SKPD ini.`
  }
  return null
}

// Label jenis BMD per golongan (mis. "1.3.2 — Peralatan dan Mesin"). Hook supaya
// dipakai bersama komponen ini & daftar gabungan (PengadaanEntry).
export function useGolonganLabels(): Record<string, string> {
  const supabase = createClient()
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    (async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const out: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        out[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setLabels(out)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return labels
}

export default function Pengadaan({ skpdProp, embedded, startCreate, openId, onExit, onDataChange, hideAdd }: {
  skpdProp?: string; embedded?: boolean
  // Mode "drill" dari PengadaanEntry (daftar gabungan): mulai buat baru (startCreate)
  // atau buka 1 kontrak (openId) saja, tombol kembali balik ke daftar. onExit != null = drill.
  startCreate?: boolean; openId?: string; onExit?: () => void
  // Dipanggil tiap data jurnal berubah (mount/mutasi) — dipakai induk (PengadaanEntry)
  // utk menyegarkan total gabungan. Disimpan di ref supaya loadJurnals tetap stabil.
  onDataChange?: () => void
  // Sembunyikan tombol "+ Tambah Pengadaan" internal — dipakai saat induk
  // (PengadaanEntry) yang menyediakan satu tombol tambah gabungan.
  hideAdd?: boolean
} = {}) {
  const supabase = createClient()
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange

  const [skpdPathMap, setSkpdPathMap] = useState<Record<number, string>>({})
  const golonganLabels = useGolonganLabels()
  // SKPD boleh dikontrol induk (satu tampilan Pengadaan: SKPD dipilih sekali di atas).
  const [skpdInternal, setSkpdInternal] = useState('')
  const skpd = skpdProp !== undefined ? skpdProp : skpdInternal
  // Boleh approve utk SKPD terpilih? admin = semua; pengurus_barang = hanya
  // sub-OPD strict di bawah nodenya (penegak asli: trigger approval guard di DB).
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const bolehACC = bolehSetujuiSkpd(scope, skpd)

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [mode, setMode] = useState<'list' | 'kontrak-baru'>('list')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,level,parent_id').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      const byId = new Map(rows.map(s => [s.id, s]))
      const paths: Record<number, string> = {}
      for (const s of rows) {
        const parts: string[] = []
        let cur: SkpdRow | undefined = s
        const seen = new Set<number>()
        while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.nama); cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined }
        paths[s.id] = parts.join(' › ')
      }
      setSkpdPathMap(paths)
    })()
    ;(async () => {
      setScope(await fetchApprovalScope(supabase))
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)
    setJurnals(await fetchPengadaanJurnals(supabase, skpdId))
    setLoadingJurnal(false)
    onDataChangeRef.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list') }, [skpd, loadJurnals])

  const skpdNama = skpd ? skpdPathMap[Number(skpd)] : undefined

  // Total semua pengadaan utk SKPD ini (disetujui + estimasi draft pending).
  const totalSemua = jurnals.reduce((s, j) => {
    if (j.approval_status === 'disetujui') return s + j.total
    if (j.approval_status === 'pending') return s + draftTotal(j.payload.draft_items || [])
    return s
  }, 0)

  // Cek No. Kontrak/BAST belum dipakai — thin wrapper ke helper modul (dipakai
  // KontrakForm & EditHeaderModal). Handler per-kontrak (approve/unapprove/edit
  // draft) sekarang di komponen mandiri PengadaanCard (lihat bawah).
  const cekNomorDipakai = (noSk: string, noBast: string | undefined, excludeId?: string) =>
    cekNomorPengadaanDipakai(supabase, Number(skpd), noSk, noBast, excludeId)

  const pending = jurnals.filter(j => j.approval_status === 'pending')
  const disetujui = jurnals.filter(j => j.approval_status === 'disetujui')

  // ── Mode drill (dipanggil dari daftar gabungan PengadaanEntry) ──────────────
  if (onExit) {
    const fp = openId ? pending.filter(h => h.id === openId) : pending
    const fd = openId ? disetujui.filter(j => j.id === openId) : disetujui
    return (
      <div className="space-y-4">
        <button onClick={onExit} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali ke daftar
        </button>
        {msg && (
          <div className={`p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
        )}
        {startCreate ? (
          <KontrakForm skpdNama={skpdNama || ''} skpdId={Number(skpd)} cekNomorDipakai={cekNomorDipakai}
            onCancel={onExit}
            onSaved={() => { loadJurnals(skpd); onExit() }} />
        ) : loadingJurnal ? (
          <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
        ) : (fp.length + fd.length) === 0 ? (
          <div className="card p-12 text-center text-gray-400 text-sm">Kontrak tidak ditemukan (mungkin sudah dihapus).</div>
        ) : (
          <div className="space-y-6">
            {[...fp, ...fd].map(h => (
              <PengadaanCard key={h.id} j={h} skpdId={Number(skpd)} golonganLabels={golonganLabels}
                isAdmin={bolehACC} onChanged={() => loadJurnals(skpd)} onMsg={setMsg} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const body = (
    <>
      {skpdProp === undefined && (
        <div className="card p-5 mb-4">
          <div className="flex items-center gap-3">
            <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
            <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpdInternal(id); setMsg('') }}
              placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
          </div>
        </div>
      )}
      {embedded && msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat & membuat kontrak pengadaan.
        </div>
      ) : mode === 'kontrak-baru' ? (
        <KontrakForm skpdNama={skpdNama || ''} skpdId={Number(skpd)}
          cekNomorDipakai={cekNomorDipakai}
          onCancel={() => setMode('list')}
          onSaved={() => { setMode('list'); setMsg('Kontrak tersimpan sbg draft — lengkapi barang lalu tunggu persetujuan admin.'); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} kontrak pengadaan</span>
            {!hideAdd && <button className="btn-primary" onClick={() => { setMsg(''); setMode('kontrak-baru') }}>+ Tambah Pengadaan</button>}
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
                    <PengadaanCard key={h.id} j={h} skpdId={Number(skpd)} golonganLabels={golonganLabels}
                      isAdmin={bolehACC} onChanged={() => loadJurnals(skpd)} onMsg={setMsg} />
                  ))}
                </section>
              )}
              {disetujui.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujui.length})</h3>
                  {disetujui.map(j => (
                    <PengadaanCard key={j.id} j={j} skpdId={Number(skpd)} golonganLabels={golonganLabels}
                      isAdmin={bolehACC} onChanged={() => loadJurnals(skpd)} onMsg={setMsg} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
  return embedded ? body : (
    <FormShell judul="Pengadaan" msg={msg}
      deskripsi="Pilih SKPD, buat kontrak (draft), lengkapi barang, lalu tunggu persetujuan admin."
      headerRight={skpd ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total Pengadaan ({skpdNama})</p>
          <p className="text-lg font-bold text-gray-900">{formatRupiah(totalSemua)}</p>
        </div>
      ) : undefined}>{body}</FormShell>
  )
}

// ── Kartu satu kontrak pengadaan non-fisik (mandiri) ────────────────────────
// Merangkum PendingCard/ApprovedCard + seluruh handler per-kontrak (approve/
// unapprove/edit draft/edit header/spesifikasi) supaya bisa dipakai baik oleh
// daftar internal komponen Pengadaan maupun daftar gabungan (PengadaanEntry).
// Materialize approve TIDAK berubah dari sebelumnya — cuma dipindah ke sini.
export function PengadaanCard({ j, skpdId, golonganLabels, isAdmin, onChanged, onMsg }: {
  j: Jurnal; skpdId: number; golonganLabels: Record<string, string>
  isAdmin: boolean; onChanged: () => void; onMsg: (m: string) => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [specKeys, setSpecKeys] = useState<string[] | null>(null)

  const cekNomorDipakai = (noSk: string, noBast: string | undefined, excludeId?: string) =>
    cekNomorPengadaanDipakai(supabase, skpdId, noSk, noBast, excludeId)

  // ── Persist perubahan draft_items ke jurnal_header.payload ────────────────
  async function savePayload(payload: HeaderPayload) {
    const { error } = await supabase.from('jurnal_header').update({ payload }).eq('id', j.id)
    if (error) { onMsg(`Error: gagal menyimpan draft: ${error.message}`); return false }
    return true
  }
  async function tambahDraftItems(newItems: DraftItem[]) {
    const items = [...(j.payload.draft_items || []), ...newItems]
    if (await savePayload({ ...j.payload, draft_items: items })) onChanged()
  }
  async function hapusDraftItem(key: string) {
    if (!confirm('Hapus barang ini dari draft?')) return
    const items = (j.payload.draft_items || []).filter(i => i.key !== key)
    if (await savePayload({ ...j.payload, draft_items: items })) onChanged()
  }
  // Edit spesifikasi draft. foto.replace (mode 1 barang) = ganti penuh set foto.
  // foto.append (mode banyak barang) = TAMBAH foto baru ke tiap barang yg dicentang
  // (di-"split" ke semua yg dipilih, tanpa menghapus foto lama masing-masing).
  // Field: 1 barang → replace penuh; >1 → cuma terapkan field non-kosong.
  async function applyDraftFields(keys: string[], fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const items = (j.payload.draft_items || []).map(i => {
      if (!keys.includes(i.key)) return i
      if (keys.length === 1) return { ...i, fields: { ...fields }, foto: foto.replace ?? i.foto }
      const nonEmpty: Record<string, string> = {}
      for (const [k, v] of Object.entries(fields)) if (v && v.trim()) nonEmpty[k] = v
      const foBaru = foto.append && foto.append.length > 0 ? [...i.foto, ...foto.append] : i.foto
      return { ...i, fields: { ...i.fields, ...nonEmpty }, foto: foBaru }
    })
    if (await savePayload({ ...j.payload, draft_items: items })) onChanged()
  }
  async function hapusKontrak() {
    // Kontrak dgn jejak ledger (pernah disetujui lalu dibuka kunci): TIDAK
    // BOLEH hapus baris transaksi_bmd (pernah dicoba, ternyata merusak replay
    // SEMBUNYI di Daftar Barang/Penyusutan yg justru bergantung pd baris
    // batal_pengadaan itu utk tau barang mana yg harus disembunyikan — lihat
    // migrasi 19). Sebagai gantinya: ARSIPKAN (approval_status='ditolak') —
    // kontrak otomatis hilang dari tampilan Pengadaan + No SK/BAST bebas
    // dipakai ulang (uniqueness check sudah mengecualikan 'ditolak'), TANPA
    // menyentuh ledger sama sekali.
    if (j.hasLedger) {
      if (!confirm(`Arsipkan kontrak ${j.no_sk}? Kontrak ini pernah disetujui — riwayat ledgernya (barang yg sudah dibatalkan) TETAP tersimpan (append-only, tak bisa dihapus). Kontrak akan hilang dari daftar & No. Kontrak/BAST bisa dipakai lagi. Tidak bisa dibatalkan.`)) return
      const { error } = await supabase.from('jurnal_header').update({ approval_status: 'ditolak' }).eq('id', j.id)
      if (error) { onMsg(`Error: gagal mengarsipkan kontrak: ${error.message}`); return }
      onMsg(`Kontrak ${j.no_sk} diarsipkan — No. Kontrak/BAST bisa dipakai lagi.`)
      onChanged()
      return
    }
    if (!confirm(`Hapus kontrak ${j.no_sk} beserta semua draft barangnya? Tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', j.id)
    if (error) { onMsg(`Error: gagal menghapus kontrak: ${error.message}`); return }
    onMsg(`Kontrak ${j.no_sk} dihapus.`)
    onChanged()
  }

  // ── Approve: materialize draft_items → aset + transaksi_bmd ────────────────
  async function approveHeader() {
    const items = j.payload.draft_items || []
    if (items.length === 0) { onMsg('Error: kontrak ini belum ada barangnya — tambahkan dulu sebelum disetujui.'); return }
    for (const it of items) {
      if (!it.kode) { onMsg('Error: ada barang draft tanpa kode.'); return }
      if (toNum(it.harga) <= 0) { onMsg(`Error: harga "${it.fields.nama_barang || it.kode}" harus > 0.`); return }
    }
    const perolehanDate = j.payload.tgl_bast || j.tanggal
    if (!confirm(`Setujui kontrak ${j.no_sk}?\n${items.length} barang akan dicatat resmi dgn tgl perolehan ${perolehanDate}.`)) return

    setBusy(true); onMsg('')
    const periode = periodeDariTanggal(perolehanDate)

    // Generate NIBAR otomatis — perlu kode lokasi SKPD (skpd.kode_skpd, ber-titik).
    const { data: skpdRow, error: skpdErr } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
    if (skpdErr || !skpdRow?.kode_skpd) {
      onMsg(`Error: gagal ambil kode lokasi SKPD utk generate NIBAR: ${skpdErr?.message || 'kode_skpd kosong'}`)
      setBusy(false); return
    }
    const tahun = String(new Date(perolehanDate).getFullYear())

    // Klasifikasi intra/ekstrakomptabel per barang: nilai vs batas_kapitalisasi
    // (kodefikasi_bmd) — >= batas → intra, < batas → ekstra (lib/bmd.ts).
    const batasMap = await fetchBatasKapitalisasi(supabase, items.map(it => it.kode))
    const itemsWithKlas = items.map(it => ({ ...it, intraEkstra: klasifikasiKomptabel(toNum(it.harga), batasMap.get(it.kode)) }))

    const nibarMap = await generateNibars(supabase, itemsWithKlas.map(it => ({ ...it, tahun })), skpdRow.kode_skpd)

    const asetRows = itemsWithKlas.map(it => {
      const row: Record<string, unknown> = {
        nibar: nibarMap.get(it.key) || null, kode: it.kode, uraian_barang: it.uraianBarang || null, jumlah: 1,
        satuan: it.satuan.trim() || null, harga_satuan: toNum(it.harga), nilai_perolehan: toNum(it.harga),
        tgl_perolehan: perolehanDate, skpd_id: skpdId, intra_ekstra: it.intraEkstra,
        cara_perolehan: 'pengadaan', status: 'aktif', foto_paths: it.foto,
      }
      for (const k of ASET_FIELD_COLS) {
        const v = it.fields[k]
        if (!v) continue
        row[k] = ASET_NUM_COLS.has(k) ? toNum(v) : v
      }
      return row
    })
    const { data: inserted, error: asetErr } = await supabase.from('aset').insert(asetRows).select('id,nilai_perolehan')
    if (asetErr || !inserted) { onMsg(`Error: gagal membuat barang: ${asetErr?.message}`); setBusy(false); return }

    // inserted[i] sejajar dengan items[i] (PostgREST kembalikan dlm urutan insert).
    const trxRows = (inserted as { id: string; nilai_perolehan: number }[]).map((a, i) => ({
      aset_id: a.id, jenis: 'pengadaan', periode, tanggal: perolehanDate, nilai: a.nilai_perolehan,
      skpd_tujuan: skpdId, header_id: j.id,
      payload: { sumber: j.jenis, no_bast: j.payload.no_bast || null, kode_rekening: items[i]?.rekening || null },
    }))
    const { error: trxErr } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (trxErr) {
      await supabase.from('aset').update({ status: 'dihapus' }).in('id', (inserted as { id: string }[]).map(a => a.id))
      onMsg(`Error: gagal mencatat transaksi: ${trxErr.message}`); setBusy(false); return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: appErr } = await supabase.from('jurnal_header')
      .update({ approval_status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString() })
      .eq('id', j.id)
    if (appErr) { onMsg(`Barang sudah tercatat, tapi status approval gagal diupdate: ${appErr.message}`); setBusy(false); onChanged(); return }

    onMsg(`Kontrak ${j.no_sk} disetujui — ${asetRows.length} barang resmi tercatat (tgl perolehan ${perolehanDate}).`)
    setBusy(false)
    onChanged()
  }

  // Buka kunci (unapprove): kembalikan kontrak disetujui ke draft. Karena ledger
  // append-only, semua barang di-batal_pengadaan (soft-delete, retroaktif → hilang
  // dari Daftar Barang/Penyusutan), lalu draft_items direkonstruksi dari barang tsb
  // supaya bisa diedit. NIBAR digenerate ULANG saat disetujui lagi (yang lama tetap
  // tersimpan sbg 'dihapus' untuk audit). Admin only.
  async function unapproveHeader() {
    if (!confirm(`Buka kunci kontrak ${j.no_sk}?\n${j.lines.length} barang dikembalikan ke draft & DIHAPUS dari Daftar Barang/Penyusutan sampai disetujui lagi. NIBAR akan digenerate ulang saat approve berikutnya.`)) return
    setBusy(true); onMsg('')
    // Guard rantai: kalau ada barang yg sudah punya transaksi LEBIH BARU setelah
    // pengadaan (mis. dialihkan ke SKPD lain, dimanfaatkan, dikapitalisasi, direklas),
    // buka kunci DIBLOKIR — soft-delete pengadaan di tengah rantai merusak state &
    // meninggalkan transaksi yatim. Batalkan transaksi yg lebih baru itu dulu.
    for (const l of j.lines) {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', l.aset_id).gt('id', l.trx_id)
      if ((count || 0) > 0) {
        onMsg(`Error: "${l.nama_barang || l.uraian_barang || l.nibar}" punya transaksi LEBIH BARU (mis. pengalihan/pemanfaatan/kapitalisasi) setelah pengadaan ini — batalkan transaksi itu dulu, baru buka kunci.`)
        setBusy(false); return
      }
    }
    for (const l of j.lines) {
      const { error } = await catatTransaksi(supabase, {
        asetId: l.aset_id, jenis: 'batal_pengadaan', tanggal: l.tanggal, headerId: j.id,
        keterangan: `Unapprove kontrak ${j.no_sk} — dikembalikan ke draft`,
      })
      if (error) { onMsg(`Error: ${error}`); setBusy(false); return }
    }
    const draftItems: DraftItem[] = j.lines.map(l => ({
      key: newKey(), golongan: kodeLevel3(l.kode), kode: l.kode, uraianBarang: l.uraian_barang || '',
      rekening: l.rekening || '', satuan: l.satuan || '', harga: String(l.nilai), fields: l.fields || {}, foto: l.foto_paths || [],
    }))
    const { error } = await supabase.from('jurnal_header')
      .update({ approval_status: 'pending', approved_by: null, approved_at: null, payload: { ...j.payload, draft_items: draftItems } })
      .eq('id', j.id)
    if (error) { onMsg(`Error: gagal buka kunci: ${error.message}`); setBusy(false); return }
    onMsg(`Kontrak ${j.no_sk} dibuka kunci — kembali ke draft. Edit lalu setujui ulang.`)
    setBusy(false)
    onChanged()
  }

  const specItems = specKeys ? (j.payload.draft_items || []).filter(i => specKeys.includes(i.key)) : []
  const single = specItems.length === 1 ? specItems[0] : null

  return (
    <>
      {j.approval_status === 'pending' ? (
        <PendingCard h={j} isAdmin={isAdmin} busy={busy} golonganLabels={golonganLabels}
          onEditHeader={() => setEditing(true)}
          onHapusKontrak={hapusKontrak}
          onTambah={tambahDraftItems}
          onHapusItem={hapusDraftItem}
          onEditSpes={keys => setSpecKeys(keys)}
          onApprove={approveHeader}
        />
      ) : (
        <ApprovedCard j={j} isAdmin={isAdmin} busy={busy} onUnapprove={unapproveHeader} />
      )}
      {editing && (
        <EditHeaderModal header={j} cekNomorDipakai={cekNomorDipakai}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onMsg('Header kontrak diperbarui.'); onChanged() }}
        />
      )}
      {specKeys && (
        <EditSpesifikasiModal
          title={single ? (single.fields.nama_barang || single.kode) : `${specItems.length} barang dicentang`}
          fieldKeys={fieldsForKode(specItems[0]?.kode || '')}
          initialFields={single ? single.fields : {}}
          initialFoto={single ? single.foto : []}
          single={!!single}
          storagePrefix={single ? `draft/${single.key}` : `draft/${j.id}`}
          onClose={() => setSpecKeys(null)}
          onSave={async (fields, foto) => { await applyDraftFields(specKeys, fields, foto); setSpecKeys(null) }}
        />
      )}
    </>
  )
}

async function bukaDokumen(path: string) {
  const supabase = createClient()
  const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

function DokumenLinks({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <p className="text-xs text-gray-500 mt-1">
      Dokumen:{' '}
      {paths.map(p => (
        <button key={p} onClick={() => bukaDokumen(p)} className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
      ))}
    </p>
  )
}

// Ambil signed URL foto pertama tiap path (bucket privat) — dipakai preview kecil di baris.
function useFirstFotoUrls(paths: string[]) {
  const supabase = createClient()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.join('|')
  useEffect(() => {
    if (paths.length === 0) { setUrls({}); return }
    (async () => {
      const { data } = await supabase.storage.from('aset-foto').createSignedUrls(paths, 3600)
      const map: Record<string, string> = {}
      for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
      setUrls(map)
    })()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

// ── Kartu "Menunggu Persetujuan" ─────────────────────────────────────────────
function PendingCard({ h, isAdmin, busy, golonganLabels, onEditHeader, onHapusKontrak, onTambah, onHapusItem, onEditSpes, onApprove }: {
  h: Jurnal; isAdmin: boolean; busy: boolean; golonganLabels: Record<string, string>
  onEditHeader: () => void; onHapusKontrak: () => void
  onTambah: (items: DraftItem[]) => void
  onHapusItem: (key: string) => void
  onEditSpes: (keys: string[]) => void
  onApprove: () => void
}) {
  const items = h.payload.draft_items || []
  const [showTambah, setShowTambah] = useState(items.length === 0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const fotoUrls = useFirstFotoUrls(items.map(i => i.foto[0]).filter(Boolean))

  const allChecked = items.length > 0 && items.every(i => checked.has(i.key))
  function toggleAll() { setChecked(allChecked ? new Set() : new Set(items.map(i => i.key))) }
  function toggleOne(key: string) {
    setChecked(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="p-4 border-b border-gray-100 bg-amber-50/40">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">KONTRAK · <span className="text-gray-400">{h.periode}</span></p>
            <Baris label="Jenis Kontrak" value={sumberLabel(h.jenis)} />
            <Baris label="Nomor Kontrak" value={h.no_sk} />
            <Baris label="Tanggal Kontrak" value={h.tanggal} />
            <Baris label="Program" value={h.payload?.program} />
            <Baris label="Kegiatan" value={h.payload?.kegiatan} />
            <Baris label="Sub Kegiatan" value={h.payload?.sub_kegiatan} />
            <Baris label="Keterangan" value={h.keterangan} />
            <Baris label="Nama Penyedia" value={h.payload?.nama_penyedia} />
            <Baris label="Nama PPKom" value={h.payload?.nama_ppk} />
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">BAST</p>
            <Baris label="Nomor BAST" value={h.payload?.no_bast} />
            <Baris label="Tanggal BAST" value={h.payload?.tgl_bast} />
            <Baris label="Keterangan BAST" value={h.payload?.ket_bast} />
            <DokumenLinks paths={h.payload?.dokumen_paths || []} />
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimasi Total</p>
              <p className="font-semibold text-gray-800">{formatRupiah(draftTotal(items))}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button title="Edit kontrak / BAST" onClick={onEditHeader}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
              <button title={h.hasLedger ? 'Arsipkan kontrak ini (ledger tetap tersimpan, No SK/BAST bisa dipakai lagi)' : 'Hapus draft kontrak ini'}
                onClick={onHapusKontrak}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
            </div>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th w-8 text-center"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th className="table-th w-8 text-center"></th>
                  <th className="table-th">Uraian Barang</th>
                  <th className="table-th">Spesifikasi Nama Barang</th>
                  <th className="table-th">Merk/Tipe</th>
                  <th className="table-th w-12 text-center">Foto</th>
                  <th className="table-th w-16 text-center">Satuan</th>
                  <th className="table-th w-28 text-right">Harga/item</th>
                  <th className="table-th">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(it => (
                  <DraftRow key={it.key} item={it} checked={checked.has(it.key)}
                    onToggle={() => toggleOne(it.key)}
                    onDelete={() => onHapusItem(it.key)}
                    fotoUrl={it.foto[0] ? fotoUrls[it.foto[0]] : undefined} />
                ))}
              </tbody>
            </table>
          </div>
          {checked.size > 0 && (() => {
            const checkedKodes = items.filter(i => checked.has(i.key)).map(i => i.kode)
            const sameGol = allSameGolongan(checkedKodes)
            return (
              <div className="px-5 py-3 border-t border-gray-100 bg-teal/5 flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {checked.size} barang dicentang
                  {!sameGol && <span className="text-amber-600"> — beda jenis BMD, tak bisa edit bersamaan (kolomnya beda)</span>}
                </span>
                <button className="btn-primary text-xs" disabled={!sameGol} onClick={() => onEditSpes([...checked])}>✎ Edit Spesifikasi ({checked.size})</button>
              </div>
            )
          })()}
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
          <button className="btn-primary text-xs" disabled={busy || items.length === 0} onClick={onApprove}>
            {busy ? 'Memproses...' : '✓ Setujui'}
          </button>
        ) : (
          <span className="text-xs text-gray-400">Menunggu tinjauan admin.</span>
        )}
      </div>
    </div>
  )
}

// Satu unit draft — nama/satuan/harga READ-ONLY (salah → hapus & tambah baru,
// biar disiplin). Spesifikasi diedit lewat checklist+popup di kartu (bukan di
// sini) — baris ini cuma preview ringkas satu baris + thumbnail foto kecil.
function DraftRow({ item, checked, onToggle, onDelete, fotoUrl }: {
  item: DraftItem; checked: boolean; onToggle: () => void
  onDelete: () => void; fotoUrl?: string
}) {
  return (
    <tr>
      <td className="table-td text-center"><input type="checkbox" checked={checked} onChange={onToggle} /></td>
      <td className="table-td text-center">
        <button onClick={onDelete} title="Hapus barang ini" className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-800 font-medium truncate max-w-[220px]">{item.uraianBarang || '-'}</p>
        <p className="text-[11px] text-gray-400">{item.kode}{item.rekening ? ` · Rek ${item.rekening}` : ''}</p>
      </td>
      <td className="table-td">
        <p className="text-xs text-gray-600 truncate max-w-[200px]" title={item.fields?.nama_barang || ''}>
          {item.fields?.nama_barang || <span className="text-amber-600">⚠ Belum diisi</span>}
        </p>
      </td>
      <td className="table-td text-xs text-gray-600 truncate max-w-[120px]">{item.fields?.merek_tipe || '-'}</td>
      <td className="table-td text-center">
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt="" className="w-8 h-8 object-cover rounded border border-gray-200 mx-auto" />
        ) : item.foto.length > 0 ? (
          <span className="text-[10px] text-gray-400">{item.foto.length}📷</span>
        ) : (
          <span className="text-[10px] text-gray-300">-</span>
        )}
      </td>
      <td className="table-td text-center text-xs text-gray-600">{item.satuan || '-'}</td>
      <td className="table-td text-right text-xs text-gray-600">{formatRupiah(toNum(item.harga))}</td>
      <td className="table-td text-xs text-gray-500 truncate max-w-[160px]">{item.fields?.keterangan || '-'}</td>
    </tr>
  )
}

// Panel "+ Tambah Barang": pilih Jenis BMD → cari kode → satuan/qty/harga → split langsung.
function TambahBarangPanel({ golonganLabels, onTambah, onCancel }: {
  golonganLabels: Record<string, string>
  onTambah: (items: DraftItem[]) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [golongan, setGolongan] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<KodefikasiHasil[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<KodefikasiHasil | null>(null)
  const [rekening, setRekening] = useState('')
  const [satuanList, setSatuanList] = useState<{ id: number; nama: string }[]>([])
  const [satuan, setSatuan] = useState('')
  const [qty, setQty] = useState('1')
  const [harga, setHarga] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('id,nama').order('nama').then(({ data }) => setSatuanList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function cari() {
    if (!golongan) { setErr('Pilih Jenis BMD dulu.'); return }
    setErr(''); setSearching(true)
    let q = supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,nama_objek,nama_rincian,nama_sub_rincian,masa_manfaat_tahun,batas_kapitalisasi').eq('aktif', true).like('kode', `${golongan}.%`)
    if (search.trim()) q = q.or(`kode.ilike.${search.trim()}%,uraian.ilike.%${search.trim()}%`)
    const { data } = await q.limit(30)
    setResults((data || []) as KodefikasiHasil[])
    setSearching(false)
  }

  function pilih(r: KodefikasiHasil) {
    setPicked(r)
    setResults([])
  }

  function simpan() {
    if (!picked) { setErr('Pilih kode barang dulu.'); return }
    const n = toInt(qty)
    if (n < 1) { setErr('Kuantitas minimal 1.'); return }
    if (toNum(harga) <= 0) { setErr('Harga harus > 0.'); return }
    // nama_barang default = uraian baku, diedit belakangan lewat ✎ Edit Spesifikasi.
    const uraian = picked.uraian || ''
    const items: DraftItem[] = Array.from({ length: n }, () => ({
      key: newKey(), golongan, kode: picked.kode, uraianBarang: uraian,
      rekening: rekening.trim(), satuan: satuan.trim(), harga,
      fields: { nama_barang: uraian }, foto: [],
    }))
    onTambah(items)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kode Rekening Belanja <span className="text-gray-400">(cari & pilih sampai Sub Rincian Objek)</span></label>
        <RekeningPicker value={rekening} onChange={setRekening} className="w-full sm:max-w-2xl" />
      </div>
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
          <div className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
            <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">{picked.kode}</span>
            <span className="text-gray-500">Objek</span><span className="font-medium text-gray-700">{picked.nama_objek || '-'}</span>
            <span className="text-gray-500">Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_rincian || '-'}</span>
            <span className="text-gray-500">Sub Rincian Objek</span><span className="font-medium text-gray-700">{picked.nama_sub_rincian || '-'}</span>
            <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">{picked.uraian || '-'}</span>
            <span className="text-gray-500">Masa Manfaat</span><span className="font-medium text-gray-700">{picked.masa_manfaat_tahun != null ? `${picked.masa_manfaat_tahun} tahun` : '-'}</span>
            <span className="text-gray-500">Nilai Kapitalisasi</span><span className="font-medium text-gray-700">{formatRupiah(picked.batas_kapitalisasi)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan</label>
              <ComboBox value={satuan} options={satuanList.map(s => s.nama)} placeholder="ketik / pilih satuan..." className="text-sm" onChange={setSatuan} />
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">Kuantitas</label><input className="select-filter w-full text-sm" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Harga / item</label><input className="select-filter w-full text-sm" inputMode="numeric" value={harga} onChange={e => setHarga(e.target.value)} /></div>
          </div>
          <p className="text-xs text-gray-400">Kuantitas &gt; 1 langsung dipecah jadi beberapa barang terpisah — spesifikasi & foto diisi per-unit setelah ini (✎ Edit Spesifikasi).</p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button className="btn-primary text-xs" onClick={simpan}>Tambah ke Draft</button>
        </div>
      )}
      {!picked && err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

// ── Kartu "Disetujui" — READ-ONLY (terkunci). Utk mengubah, admin harus "Buka
// Kunci" (unapprove) dulu → kembali ke draft, edit, setujui ulang. ─────────────
function ApprovedCard({ j, isAdmin, busy, onUnapprove }: {
  j: Jurnal; isAdmin: boolean; busy: boolean
  onUnapprove: () => void
}) {
  const fotoUrls = useFirstFotoUrls(j.lines.map(l => l.foto_paths[0]).filter(Boolean))

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">KONTRAK · <span className="text-gray-400">{j.periode}</span></p>
            <Baris label="Jenis Kontrak" value={sumberLabel(j.jenis)} />
            <Baris label="Nomor Kontrak" value={j.no_sk} />
            <Baris label="Tanggal Kontrak" value={j.tanggal} />
            <Baris label="Program" value={j.payload?.program} />
            <Baris label="Kegiatan" value={j.payload?.kegiatan} />
            <Baris label="Sub Kegiatan" value={j.payload?.sub_kegiatan} />
            <Baris label="Keterangan" value={j.keterangan} />
            <Baris label="Nama Penyedia" value={j.payload?.nama_penyedia} />
            <Baris label="Nama PPKom" value={j.payload?.nama_ppk} />
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">BAST</p>
            <Baris label="Nomor BAST" value={j.payload?.no_bast} />
            <Baris label="Tanggal BAST" value={j.payload?.tgl_bast} />
            <Baris label="Keterangan BAST" value={j.payload?.ket_bast} />
            <DokumenLinks paths={j.payload?.dokumen_paths || []} />
            {j.approved_at && <p className="text-xs text-teal mt-1">Disetujui {j.approved_at.slice(0, 10)}</p>}
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Pengadaan</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
            </div>
            {isAdmin ? (
              <button title="Buka kunci (unapprove) — kembalikan ke draft utk diedit" onClick={onUnapprove} disabled={busy}
                className="btn-secondary text-xs mt-2">{busy ? 'Memproses...' : '🔓 Buka Kunci'}</button>
            ) : (
              <span className="text-[11px] text-gray-400 mt-2">🔒 Terkunci</span>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Uraian Barang / NIBAR</th>
              <th className="table-th">Spesifikasi Nama Barang</th>
              <th className="table-th">Merk/Tipe</th>
              <th className="table-th w-12 text-center">Foto</th>
              <th className="table-th w-16 text-center">Satuan</th>
              <th className="table-th w-20 text-center">Komptabel</th>
              <th className="table-th w-28 text-right">Nilai</th>
              <th className="table-th">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.lines.map(l => {
              const f = l.fields || {}
              const fotoUrl = l.foto_paths[0] ? fotoUrls[l.foto_paths[0]] : undefined
              return (
                <tr key={l.aset_id}>
                  <td className="table-td">
                    <p className="font-medium text-gray-800 text-xs truncate max-w-[220px]">{l.uraian_barang || '-'}</p>
                    <p className="text-[11px] text-gray-400">{l.kode} · {l.nibar || '(NIBAR belum diisi)'}{l.rekening ? ` · Rek ${l.rekening}` : ''}</p>
                  </td>
                  <td className="table-td">
                    <p className="text-xs text-gray-600 truncate max-w-[200px]" title={l.nama_barang || ''}>
                      {l.nama_barang || <span className="text-amber-600">⚠ Belum diisi</span>}
                    </p>
                  </td>
                  <td className="table-td text-xs text-gray-600 truncate max-w-[120px]">{f.merek_tipe || '-'}</td>
                  <td className="table-td text-center">
                    {fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fotoUrl} alt="" className="w-8 h-8 object-cover rounded border border-gray-200 mx-auto" />
                    ) : l.foto_paths.length > 0 ? (
                      <span className="text-[10px] text-gray-400">{l.foto_paths.length}📷</span>
                    ) : (
                      <span className="text-[10px] text-gray-300">-</span>
                    )}
                  </td>
                  <td className="table-td text-center text-xs">{l.satuan || '-'}</td>
                  <td className="table-td text-center text-xs capitalize">{l.intra_ekstra || '-'}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                  <td className="table-td text-xs text-gray-500 truncate max-w-[160px]">{f.keterangan || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Form kontrak baru (Kartu 1 + Kartu 2) — HANYA header, tanpa barang ──────
function KontrakForm({ skpdId, skpdNama, cekNomorDipakai, onCancel, onSaved }: {
  skpdId: number; skpdNama: string
  cekNomorDipakai: (noSk: string, noBast: string | undefined, excludeId?: string) => Promise<string | null>
  onCancel: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [sumber, setSumber] = useState<SumberPengadaan>('spk')
  const [noKontrak, setNoKontrak] = useState('')
  const [tglKontrak, setTglKontrak] = useState('')
  const [program, setProgram] = useState('')
  const [kegiatan, setKegiatan] = useState('')
  const [subKeg, setSubKeg] = useState('')
  const [ketKontrak, setKetKontrak] = useState('')
  const [penyedia, setPenyedia] = useState('')
  const [ppk, setPpk] = useState('')
  const [noBast, setNoBast] = useState('')
  const [tglBast, setTglBast] = useState('')
  const [ketBast, setKetBast] = useState('')
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)
  const [pegawaiList, setPegawaiList] = useState<{ id: string; nama: string; nip: string; jabatan: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_pegawai').select('id,nama,nip,jabatan').order('nama')
      .then(({ data }) => setPegawaiList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `pengadaan/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); return }
    if (tglBast && tglBast < tglKontrak) { setErr('Tgl BAST tidak boleh lebih tua dari tgl kontrak.'); return }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noKontrak.trim(), noBast.trim() || undefined)
    if (dup) { setErr(dup); setSaving(false); return }
    const payload: HeaderPayload = {
      program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
      nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
      no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
      dokumen_paths: dokPaths, draft_items: [],
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
        <div className="space-y-4">
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak</label>
            <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
              value={tglKontrak} onChange={e => setTglKontrak(e.target.value)} />
            {tglKontrak && <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tglKontrak)}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Program / Kegiatan / Sub Kegiatan</label>
            <ProgramPicker program={program} kegiatan={kegiatan} subKeg={subKeg}
              onChange={sel => { setProgram(sel.program); setKegiatan(sel.kegiatan); setSubKeg(sel.sub_kegiatan) }} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label>
            <ComboBox value={ppk} options={pegawaiList.map(p => p.nama)} placeholder="ketik / pilih pegawai..." onChange={setPpk} />
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ketKontrak} onChange={e => setKetKontrak(e.target.value)} /></div>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-600 mb-2">Kartu 2 — Berita Acara Serah Terima (BAST)</p>
        <div className="space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(= tgl perolehan efektif, tidak boleh &lt; tgl kontrak)</span></label>
            <input type="date" className="select-filter w-full" min={tglKontrak || dateBounds.min} max={dateBounds.max}
              value={tglBast} onChange={e => setTglBast(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Kosong → pakai tgl kontrak saat disetujui.</p>
          </div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Dokumen (foto / PDF, bisa lebih dari satu)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
              onChange={e => uploadDokumen(e.target.files)} disabled={dokUploading} className="text-xs" />
            {dokUploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
            {dokPaths.length > 0 && (
              <ul className="mt-2 space-y-1">
                {dokPaths.map(p => (
                  <li key={p} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="truncate">{namaFile(p)}</span>
                    <button onClick={() => hapusDokumen(p)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
function EditHeaderModal({ header, cekNomorDipakai, onClose, onSaved }: {
  header: Header
  cekNomorDipakai: (noSk: string, noBast: string | undefined, excludeId?: string) => Promise<string | null>
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
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
  const [dokPaths, setDokPaths] = useState<string[]>(p.dokumen_paths || [])
  const [dokUploading, setDokUploading] = useState(false)
  const [pegawaiList, setPegawaiList] = useState<{ id: string; nama: string; nip: string; jabatan: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_pegawai').select('id,nama,nip,jabatan').order('nama')
      .then(({ data }) => setPegawaiList(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pindahSemester = periodeDariTanggal(tgl) !== header.periode

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `pengadaan/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noKontrak.trim()) { setErr('No. Kontrak wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal kontrak masuk ${periodeDariTanggal(tgl)}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat jurnal baru.`)
      return
    }
    if (tglBast && tglBast < tgl) { setErr('Tgl BAST tidak boleh lebih tua dari tgl kontrak.'); return }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noKontrak.trim(), noBast.trim() || undefined, header.id)
    if (dup) { setErr(dup); setSaving(false); return }
    const payload: HeaderPayload = {
      ...header.payload,
      program: program.trim() || undefined, kegiatan: kegiatan.trim() || undefined, sub_kegiatan: subKeg.trim() || undefined,
      nama_penyedia: penyedia.trim() || undefined, nama_ppk: ppk.trim() || undefined,
      no_bast: noBast.trim() || undefined, tgl_bast: tglBast || undefined, ket_bast: ketBast.trim() || undefined,
      dokumen_paths: dokPaths,
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
            <input type="date" className="select-filter w-full sm:w-64" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {periodeDariTanggal(tgl)} — di luar semester jurnal.</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Program / Kegiatan / Sub Kegiatan</label>
            <ProgramPicker program={program} kegiatan={kegiatan} subKeg={subKeg}
              onChange={sel => { setProgram(sel.program); setKegiatan(sel.kegiatan); setSubKeg(sel.sub_kegiatan) }} />
          </div>
          <div className="space-y-4">
            <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label><input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama PPK</label>
              <ComboBox value={ppk} options={pegawaiList.map(pg => pg.nama)} placeholder="ketik / pilih pegawai..." onChange={setPpk} />
            </div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan Kontrak</label><input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} /></div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Berita Acara Serah Terima (BAST)</p>
            <div className="space-y-4">
              <div><label className="block text-xs text-gray-500 mb-1">No. BAST</label><input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(tidak boleh &lt; tgl kontrak)</span></label><input type="date" className="select-filter w-full" min={tgl} max={dateBounds.max} value={tglBast} onChange={e => setTglBast(e.target.value)} /></div>
            </div>
            <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Keterangan BAST</label><input className="select-filter w-full" value={ketBast} onChange={e => setKetBast(e.target.value)} /></div>
            <div className="mt-4">
              <label className="block text-xs text-gray-500 mb-1">Dokumen (foto / PDF, bisa lebih dari satu)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
                onChange={e => uploadDokumen(e.target.files)} disabled={dokUploading} className="text-xs" />
              {dokUploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
              {dokPaths.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {dokPaths.map(pth => (
                    <li key={pth} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="truncate">{namaFile(pth)}</span>
                      <button onClick={() => hapusDokumen(pth)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
