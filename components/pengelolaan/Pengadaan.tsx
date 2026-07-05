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
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { fieldsForKode, allSameGolongan, FIELD_LABEL, FIELD_TYPE, FIELD_OPTIONS, type FieldKey } from '@/lib/asetFields'
import dynamic from 'next/dynamic'
import WilayahPicker from '@/components/WilayahPicker'
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false, loading: () => <div className="h-[220px] bg-gray-50 rounded-lg animate-pulse" /> })
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'

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
// diambil sekali saat kode dipilih, TIDAK bisa diedit user (beda dari `nama` =
// nama spesifik/"Spesifikasi Nama Barang", kolom aset.nama_barang, editable).
type DraftItem = {
  key: string; golongan: string; kode: string; uraianBarang: string; nama: string
  rekening: string                 // kode rekening belanja (mis. 5.2.01.01.001) — teks bebas dulu
  satuan: string; harga: string
  fields: Record<string, string>   // field spesifikasi sesuai golongan (lib/asetFields.ts)
  foto: string[]                    // path di storage bucket aset-foto
}
type HeaderPayload = {
  program?: string; kegiatan?: string; sub_kegiatan?: string
  nama_penyedia?: string; nama_ppk?: string
  no_bast?: string; tgl_bast?: string; ket_bast?: string
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
  aset_id: string; nibar: string | null; kode: string; uraian_barang: string | null; nama_barang: string | null
  satuan: string | null; intra_ekstra: string | null; nilai: number; tanggal: string
  rekening: string
  foto_paths: string[]
  fields: Record<string, string>
}
// hasLedger = kontrak ini punya baris di transaksi_bmd (pernah disetujui, walau
// kini pending karena dibuka kunci) → tak boleh dihapus penuh (FK + append-only).
type Jurnal = Header & { lines: JurnalLine[]; total: number; hasLedger: boolean }

const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const toInt = (s: string) => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)
const draftTotal = (items: DraftItem[]) => items.reduce((s, i) => s + toNum(i.harga), 0)

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
      out.push({ rekening: '', uraianBarang: '', ...(r as unknown as DraftItem), fields: remapFieldKeys(r.fields as Record<string, string>) }) // rekening/uraianBarang default (data lama sblm field ini ada) + field key lama dipetakan ke baru
      continue
    }
    const qty = Math.max(1, toInt(String(r?.qty ?? '1')) || 1)
    for (let i = 0; i < qty; i++) {
      out.push({
        key: newKey(),
        golongan: String(r?.golongan ?? ''), kode: String(r?.kode ?? ''), uraianBarang: '', nama: String(r?.nama ?? ''),
        rekening: String(r?.rekening ?? ''),
        satuan: String(r?.satuan ?? ''), harga: String(r?.harga ?? '0'),
        fields: r?.spesifikasi ? { spesifikasi_lainnya: String(r.spesifikasi) } : {},
        foto: [],
      })
    }
  }
  return out
}
const ASET_FIELD_COLS = ['spesifikasi_lainnya', 'merek_tipe', 'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin',
  'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'jenis_hak',
  'wilayah_kode', 'alamat_detail', 'latitude', 'longitude', 'keterangan'] as const
// Kolom spesifikasi yang bertipe numeric di DB → di-cast toNum saat materialize.
const ASET_NUM_COLS = new Set(['luas', 'latitude', 'longitude'])

// ── Generator NIBAR ──────────────────────────────────────────────────────────
// Skema (dikonfirmasi user): [12=Prov/Kab][01/02=Intra-Ekstra][5306=Kode Kab
// Kediri][12 digit=kode lokasi SKPD, dari skpd.kode tanpa titik][4 digit=tahun
// perolehan][12 digit=kode barang tanpa titik][7 digit=nomor urut].
// "12" & "5306" konstan (app ini khusus Kab. Kediri). Nomor urut lanjut dari
// NIBAR lain yang 36 digit pertamanya sama persis (lokasi+kode+tahun sama).
const KODE_PROVINSI_KAB = '12'
const KODE_WILAYAH_KEDIRI = '3506' // Kab. Kediri (Jatim 35, Kediri Kab 06)
const INTRA_EKSTRA_KODE: Record<string, string> = { intra: '01', ekstra: '02' }

function digitsPad(s: string, len: number): string {
  const clean = (s || '').replace(/\D/g, '')
  return clean.length >= len ? clean.slice(0, len) : clean.padEnd(len, '0')
}

// Segmen lokasi NIBAR (12 digit) dari skpd.kode_skpd. Format kode_skpd =
// s1.s2.s3.s4.s5 (2.2.2.4.4 = 14 digit). NIBAR pakai s1.s2.s4.s5 (BUANG segmen
// ke-3) = xx.xx.xxxx.xxxx = 12 digit — mempertahankan digit kuasa & lokasi
// sehingga bisa membedakan sampai level lokasi terdalam.
function kodeLokasiNibar(kodeSkpd: string): string {
  const segs = (kodeSkpd || '').split('.')
  const picked = segs.length >= 5 ? [segs[0], segs[1], segs[3], segs[4]] : segs
  return digitsPad(picked.join(''), 12)
}

async function generateNibars(
  supabase: ReturnType<typeof createClient>,
  items: { key: string; kode: string }[], kodeSkpdRaw: string, tahun: string, intraEkstra: string
): Promise<Map<string, string>> {
  const kodeLokasi = kodeLokasiNibar(kodeSkpdRaw)
  const intraKode = INTRA_EKSTRA_KODE[intraEkstra] || '01'
  const out = new Map<string, string>()
  const byKodeBarang = new Map<string, { key: string; kode: string }[]>()
  for (const it of items) {
    const kb = digitsPad(it.kode, 12)
    const arr = byKodeBarang.get(kb) || []
    arr.push(it)
    byKodeBarang.set(kb, arr)
  }
  for (const [kodeBarang, group] of byKodeBarang) {
    const prefix36 = KODE_PROVINSI_KAB + intraKode + KODE_WILAYAH_KEDIRI + kodeLokasi + tahun + kodeBarang
    const { data } = await supabase.from('aset').select('nibar')
      .like('nibar', `${prefix36}%`).order('nibar', { ascending: false }).limit(1)
    let seq = 0
    if (data && data[0]?.nibar) seq = parseInt(data[0].nibar.slice(-7), 10) || 0
    for (const it of group) {
      seq += 1
      out.set(it.key, prefix36 + String(seq).padStart(7, '0'))
    }
  }
  return out
}

export default function Pengadaan() {
  const supabase = createClient()

  const [skpdPathMap, setSkpdPathMap] = useState<Record<number, string>>({})
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [mode, setMode] = useState<'list' | 'kontrak-baru'>('list')
  const [editing, setEditing] = useState<Header | null>(null)
  // Edit spesifikasi selalu lewat checklist (1 atau banyak barang dicentang) →
  // popup. keys.length===1 → replace penuh (bisa mengosongkan field). >1 →
  // cuma menerapkan field yang diisi (non-kosong), field lain per barang tak disentuh.
  // Edit spesifikasi HANYA untuk draft (kontrak disetujui dikunci — harus unapprove
  // dulu). keys.length===1 → replace penuh; >1 → cuma terapkan field non-kosong.
  const [specEdit, setSpecEdit] = useState<{ header: Jurnal; keys: string[] } | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      type SkpdRow = { id: number; nama: string; level: number; parent_id: number | null }
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama,level,parent_id').range(from, from + 999)
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
        .select(`id,header_id,nilai,tanggal,payload,aset:aset_id(id,nibar,nama_barang,uraian_barang,kode,satuan,intra_ekstra,status,foto_paths,${ASET_FIELD_COLS.join(',')})`)
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
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, uraian_barang: r.aset.uraian_barang, nama_barang: r.aset.nama_barang,
          satuan: r.aset.satuan, intra_ekstra: r.aset.intra_ekstra, nilai: r.nilai, tanggal: r.tanggal,
          rekening: r.payload?.kode_rekening || '', foto_paths: r.aset.foto_paths || [], fields,
        })
        j.total += r.nilai
      }
    }
    // Tampilkan hanya pending & disetujui(berisi). Baris 'ditolak' legacy disaring
    // (fitur Tolak sudah dihapus) — tetap ada di DB tapi tak ditampilkan.
    setJurnals([...jmap.values()].filter(j =>
      j.approval_status === 'pending' || (j.approval_status === 'disetujui' && j.lines.length > 0)))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpd ? skpdPathMap[Number(skpd)] : undefined

  // Total semua pengadaan utk SKPD ini (disetujui + estimasi draft pending).
  const totalSemua = jurnals.reduce((s, j) => {
    if (j.approval_status === 'disetujui') return s + j.total
    if (j.approval_status === 'pending') return s + draftTotal(j.payload.draft_items || [])
    return s
  }, 0)

  // ── Cek No. Kontrak / No. BAST belum dipakai (per SKPD, kategori pengadaan) ─
  // 'ditolak' (legacy, fitur Tolak sudah dihapus & disembunyikan dari tampilan)
  // dikecualikan dari cek keunikan — kontrak itu sudah mati/tak bisa diapa-apakan
  // lagi, nomornya bebas dipakai ulang. Kontrak yang beneran dihapus (hapusKontrak)
  // otomatis tak ketemu lagi krn barisnya sudah tak ada di tabel.
  async function cekNomorDipakai(noSk: string, noBast: string | undefined, excludeId?: string) {
    let qSk = supabase.from('jurnal_header').select('id').eq('kategori', 'pengadaan').eq('skpd_id', Number(skpd)).eq('no_sk', noSk).neq('approval_status', 'ditolak')
    if (excludeId) qSk = qSk.neq('id', excludeId)
    const { data: dupSk } = await qSk.limit(1)
    if (dupSk && dupSk.length > 0) return `No. Kontrak "${noSk}" sudah dipakai kontrak lain di SKPD ini.`
    if (noBast) {
      let qBast = supabase.from('jurnal_header').select('id').eq('kategori', 'pengadaan').eq('skpd_id', Number(skpd)).eq('payload->>no_bast', noBast).neq('approval_status', 'ditolak')
      if (excludeId) qBast = qBast.neq('id', excludeId)
      const { data: dupBast } = await qBast.limit(1)
      if (dupBast && dupBast.length > 0) return `No. BAST "${noBast}" sudah dipakai kontrak lain di SKPD ini.`
    }
    return null
  }

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
  // Edit spesifikasi draft. foto.replace (mode 1 barang) = ganti penuh set foto.
  // foto.append (mode banyak barang) = TAMBAH foto baru ke tiap barang yg dicentang
  // (di-"split" ke semua yg dipilih, tanpa menghapus foto lama masing-masing).
  // Field: 1 barang → replace penuh; >1 → cuma terapkan field non-kosong.
  async function applyDraftFields(h: Jurnal, keys: string[], fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const items = (h.payload.draft_items || []).map(i => {
      if (!keys.includes(i.key)) return i
      if (keys.length === 1) return { ...i, fields: { ...fields }, foto: foto.replace ?? i.foto }
      const nonEmpty: Record<string, string> = {}
      for (const [k, v] of Object.entries(fields)) if (v && v.trim()) nonEmpty[k] = v
      const foBaru = foto.append && foto.append.length > 0 ? [...i.foto, ...foto.append] : i.foto
      return { ...i, fields: { ...i.fields, ...nonEmpty }, foto: foBaru }
    })
    const ok = await savePayload(h.id, { ...h.payload, draft_items: items })
    if (ok) loadJurnals(skpd)
  }
  async function hapusKontrak(h: Jurnal) {
    if (!confirm(`Hapus kontrak ${h.no_sk} beserta semua draft barangnya? Tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', h.id)
    if (error) {
      // FK ke transaksi_bmd.header_id: kontrak ini pernah disetujui lalu dibuka
      // kunci (unapprove) — ledger append-only tetap menyimpan baris transaksi
      // asli yg nempel ke header ini, jadi header tak boleh dihapus permanen
      // (akan membuat baris ledger itu kehilangan konteks No SK/tanggal).
      if (error.message.includes('transaksi_bmd_header_id_fkey')) {
        setMsg(`Kontrak ${h.no_sk} tidak bisa dihapus — kontrak ini pernah disetujui (punya jejak ledger permanen), lalu dibuka kunci. Ledger append-only tak boleh kehilangan konteks header-nya. Kalau memang tidak diperlukan lagi, gunakan "Tolak" (aman, tak menyentuh ledger) daripada hapus.`)
      } else {
        setMsg(`Error: gagal menghapus kontrak: ${error.message}`)
      }
      return
    }
    setMsg(`Kontrak ${h.no_sk} dihapus.`)
    loadJurnals(skpd)
  }

  // ── Approve: materialize draft_items → aset + transaksi_bmd ────────────────
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

    // Generate NIBAR otomatis — perlu kode lokasi SKPD (skpd.kode_skpd, ber-titik).
    const { data: skpdRow, error: skpdErr } = await supabase.from('skpd').select('kode_skpd').eq('id', Number(skpd)).single()
    if (skpdErr || !skpdRow?.kode_skpd) {
      setMsg(`Error: gagal ambil kode lokasi SKPD utk generate NIBAR: ${skpdErr?.message || 'kode_skpd kosong'}`)
      setBusyId(null); return
    }
    const tahun = String(new Date(perolehanDate).getFullYear())
    const nibarMap = await generateNibars(supabase, items, skpdRow.kode_skpd, tahun, 'intra')

    const asetRows = items.map(it => {
      const row: Record<string, unknown> = {
        nibar: nibarMap.get(it.key) || null, kode: it.kode, uraian_barang: it.uraianBarang || null, nama_barang: it.nama.trim() || null, jumlah: 1,
        satuan: it.satuan.trim() || null, harga_satuan: toNum(it.harga), nilai_perolehan: toNum(it.harga),
        tgl_perolehan: perolehanDate, skpd_id: Number(skpd), intra_ekstra: 'intra',
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
    if (asetErr || !inserted) { setMsg(`Error: gagal membuat barang: ${asetErr?.message}`); setBusyId(null); return }

    // inserted[i] sejajar dengan items[i] (PostgREST kembalikan dlm urutan insert).
    const trxRows = (inserted as { id: string; nilai_perolehan: number }[]).map((a, i) => ({
      aset_id: a.id, jenis: 'pengadaan', periode, tanggal: perolehanDate, nilai: a.nilai_perolehan,
      skpd_tujuan: Number(skpd), header_id: h.id,
      payload: { sumber: h.jenis, no_bast: h.payload.no_bast || null, kode_rekening: items[i]?.rekening || null },
    }))
    const { error: trxErr } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (trxErr) {
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

  // Buka kunci (unapprove): kembalikan kontrak disetujui ke draft. Karena ledger
  // append-only, semua barang di-batal_pengadaan (soft-delete, retroaktif → hilang
  // dari Daftar Barang/Penyusutan), lalu draft_items direkonstruksi dari barang tsb
  // supaya bisa diedit. NIBAR digenerate ULANG saat disetujui lagi (yang lama tetap
  // tersimpan sbg 'dihapus' untuk audit). Admin only.
  async function unapproveHeader(j: Jurnal) {
    if (!confirm(`Buka kunci kontrak ${j.no_sk}?\n${j.lines.length} barang dikembalikan ke draft & DIHAPUS dari Daftar Barang/Penyusutan sampai disetujui lagi. NIBAR akan digenerate ulang saat approve berikutnya.`)) return
    setBusyId(j.id); setMsg('')
    for (const l of j.lines) {
      const { error } = await catatTransaksi(supabase, {
        asetId: l.aset_id, jenis: 'batal_pengadaan', tanggal: l.tanggal,
        keterangan: `Unapprove kontrak ${j.no_sk} — dikembalikan ke draft`,
      })
      if (error) { setMsg(`Error: ${error}`); setBusyId(null); return }
    }
    const draftItems: DraftItem[] = j.lines.map(l => ({
      key: newKey(), golongan: kodeLevel3(l.kode), kode: l.kode, uraianBarang: l.uraian_barang || '', nama: l.nama_barang || '',
      rekening: l.rekening || '', satuan: l.satuan || '', harga: String(l.nilai), fields: l.fields || {}, foto: l.foto_paths || [],
    }))
    const { error } = await supabase.from('jurnal_header')
      .update({ approval_status: 'pending', approved_by: null, approved_at: null, payload: { ...j.payload, draft_items: draftItems } })
      .eq('id', j.id)
    if (error) { setMsg(`Error: gagal buka kunci: ${error.message}`); setBusyId(null); return }
    setMsg(`Kontrak ${j.no_sk} dibuka kunci — kembali ke draft. Edit lalu setujui ulang.`)
    setBusyId(null)
    loadJurnals(skpd)
  }

  const pending = jurnals.filter(j => j.approval_status === 'pending')
  const disetujui = jurnals.filter(j => j.approval_status === 'disetujui')

  return (
    <FormShell judul="Pengadaan" msg={msg}
      deskripsi="Pilih SKPD, buat kontrak (draft), lengkapi barang, lalu tunggu persetujuan admin."
      headerRight={skpd ? (
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Total Pengadaan ({skpdNama})</p>
          <p className="text-lg font-bold text-gray-900">{formatRupiah(totalSemua)}</p>
        </div>
      ) : undefined}>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

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
                      onHapusKontrak={() => hapusKontrak(h)}
                      onTambah={items => tambahDraftItems(h, items)}
                      onHapusItem={key => hapusDraftItem(h, key)}
                      onEditSpes={keys => setSpecEdit({ header: h, keys })}
                      onApprove={() => approveHeader(h)}
                    />
                  ))}
                </section>
              )}
              {disetujui.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujui.length})</h3>
                  {disetujui.map(j => (
                    <ApprovedCard key={j.id} j={j} isAdmin={isAdmin} busy={busyId === j.id}
                      onUnapprove={() => unapproveHeader(j)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing} cekNomorDipakai={cekNomorDipakai}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header kontrak diperbarui.'); loadJurnals(skpd) }}
        />
      )}
      {specEdit && (() => {
        const items = (specEdit.header.payload.draft_items || []).filter(i => specEdit.keys.includes(i.key))
        const single = items.length === 1 ? items[0] : null
        return (
          <EditSpesifikasiModal
            title={single ? (single.nama || single.kode) : `${items.length} barang dicentang`}
            fieldKeys={fieldsForKode(items[0]?.kode || '')}
            initialFields={single ? single.fields : {}}
            initialFoto={single ? single.foto : []}
            single={!!single}
            storagePrefix={single ? `draft/${single.key}` : `draft/${specEdit.header.id}`}
            onClose={() => setSpecEdit(null)}
            onSave={async (fields, foto) => {
              await applyDraftFields(specEdit.header, specEdit.keys, fields, foto)
              setSpecEdit(null)
            }}
          />
        )
      })()}
    </FormShell>
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
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">KONTRAK</p>
            <p className="text-sm font-semibold text-gray-800">{h.no_sk} <span className="font-normal text-gray-400 text-xs">· {sumberLabel(h.jenis)}</span></p>
            <p className="text-xs text-gray-500">Tgl {h.tanggal} · {h.periode}</p>
            {(h.payload?.program || h.payload?.kegiatan || h.payload?.sub_kegiatan) && (
              <p className="text-xs text-gray-500 mt-1">{[h.payload.program, h.payload.kegiatan, h.payload.sub_kegiatan].filter(Boolean).join(' › ')}</p>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">BAST</p>
            {h.payload?.no_bast ? (
              <>
                <p className="text-sm font-medium text-gray-800">{h.payload.no_bast}</p>
                <p className="text-xs text-gray-500">Tgl {h.payload.tgl_bast || '-'}</p>
              </>
            ) : <p className="text-xs text-gray-400">Belum diisi</p>}
          </div>
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <p className="text-xs text-gray-400">Estimasi Total</p>
              <p className="font-semibold text-gray-800">{formatRupiah(draftTotal(items))}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button title="Edit kontrak / BAST" onClick={onEditHeader}
                className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
              {h.hasLedger ? (
                <span title="Kontrak ini pernah disetujui lalu dibuka kunci — punya jejak ledger permanen, tak bisa dihapus. Edit lalu setujui ulang."
                  className="text-[11px] text-amber-600 whitespace-nowrap">🔓 dibuka kunci</span>
              ) : (
                <button title="Hapus draft kontrak ini" onClick={onHapusKontrak}
                  className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
              )}
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
        <p className="text-xs text-gray-600 truncate max-w-[200px]" title={item.nama}>
          {item.nama || <span className="text-amber-600">⚠ Belum diisi</span>}
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
      <td className="table-td text-xs text-gray-500 truncate max-w-[160px]">{f.keterangan || '-'}</td>
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
  const [results, setResults] = useState<{ kode: string; uraian: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<{ kode: string; uraian: string } | null>(null)
  const [rekening, setRekening] = useState('')
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
    const items: DraftItem[] = Array.from({ length: n }, () => ({
      key: newKey(), golongan, kode: picked.kode, uraianBarang: picked.uraian, nama: nama.trim() || picked.uraian,
      rekening: rekening.trim(), satuan: satuan.trim(), harga, fields: {}, foto: [],
    }))
    onTambah(items)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kode Rekening Belanja <span className="text-gray-400">(mis. 5.2.01.01.001 — teks bebas)</span></label>
        <input className="select-filter w-full sm:w-80" value={rekening} onChange={e => setRekening(e.target.value)} placeholder="kode rekening belanja..." />
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
          <p className="text-xs text-gray-500">Kode: <span className="font-medium text-gray-700">{picked.kode}</span></p>
          <div><label className="block text-xs text-gray-500 mb-1">Nama Barang</label><input className="select-filter w-full text-sm" value={nama} onChange={e => setNama(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Satuan</label><input className="select-filter w-full text-sm" value={satuan} onChange={e => setSatuan(e.target.value)} placeholder="unit" /></div>
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
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">KONTRAK</p>
            <p className="text-sm font-semibold text-gray-800">{j.no_sk} <span className="font-normal text-gray-400 text-xs">· {sumberLabel(j.jenis)}</span></p>
            <p className="text-xs text-gray-500">Tgl {j.tanggal} · {j.periode}</p>
            {(j.payload?.nama_penyedia || j.payload?.nama_ppk) && (
              <p className="text-xs text-gray-500 mt-1">
                {j.payload.nama_penyedia && `Penyedia: ${j.payload.nama_penyedia}`}
                {j.payload.nama_penyedia && j.payload.nama_ppk && ' · '}
                {j.payload.nama_ppk && `PPK: ${j.payload.nama_ppk}`}
              </p>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">BAST</p>
            {j.payload?.no_bast ? (
              <>
                <p className="text-sm font-medium text-gray-800">{j.payload.no_bast}</p>
                <p className="text-xs text-gray-500">Tgl {j.payload.tgl_bast || '-'}</p>
              </>
            ) : <p className="text-xs text-gray-400">-</p>}
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
    if (tglBast && tglBast < tglKontrak) { setErr('Tgl BAST tidak boleh lebih tua dari tgl kontrak.'); return }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noKontrak.trim(), noBast.trim() || undefined)
    if (dup) { setErr(dup); setSaving(false); return }
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
            <label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(= tgl perolehan efektif, tidak boleh &lt; tgl kontrak)</span></label>
            <input type="date" className="select-filter w-full" min={tglKontrak} value={tglBast} onChange={e => setTglBast(e.target.value)} />
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
function EditHeaderModal({ header, cekNomorDipakai, onClose, onSaved }: {
  header: Header
  cekNomorDipakai: (noSk: string, noBast: string | undefined, excludeId?: string) => Promise<string | null>
  onClose: () => void; onSaved: () => void
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
    if (tglBast && tglBast < tgl) { setErr('Tgl BAST tidak boleh lebih tua dari tgl kontrak.'); return }
    setErr(''); setSaving(true)
    const dup = await cekNomorDipakai(noKontrak.trim(), noBast.trim() || undefined, header.id)
    if (dup) { setErr(dup); setSaving(false); return }
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
              <div><label className="block text-xs text-gray-500 mb-1">Tgl BAST <span className="text-gray-400">(tidak boleh &lt; tgl kontrak)</span></label><input type="date" className="select-filter w-full" min={tgl} value={tglBast} onChange={e => setTglBast(e.target.value)} /></div>
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

// ── Popup Edit Spesifikasi (golongan-aware) + Foto ──────────────────────────
// Dipakai lewat checklist (1 atau banyak barang dicentang) di kartu draft/
// disetujui. fieldKeys = union field yang relevan (kalau beda golongan, semua
// field relevan tetap muncul).
//   single=true  → 1 barang: field & foto REPLACE penuh (bisa hapus/kosongkan).
//   single=false → banyak barang: field yang diisi diterapkan ke semua (yg kosong
//                  tak menimpa); foto yang diupload di-APPEND ("split") ke semua
//                  barang yang dicentang, tanpa menghapus foto lama masing-masing.
function EditSpesifikasiModal({ title, fieldKeys, storagePrefix, initialFields, initialFoto, single, onSave, onClose }: {
  title: string; fieldKeys: FieldKey[]; storagePrefix: string
  initialFields: Record<string, string>; initialFoto: string[]; single: boolean
  onSave: (fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) => Promise<void> | void
  onClose: () => void
}) {
  const supabase = createClient()
  const keys = fieldKeys
  const [values, setValues] = useState<Record<string, string>>(initialFields)
  // single: fotoPaths = daftar penuh (di-replace). bulk: fotoPaths = foto BARU
  // yang bakal di-append ke semua barang dicentang (mulai kosong).
  const [fotoPaths, setFotoPaths] = useState<string[]>(single ? initialFoto : [])
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      if (!single || initialFoto.length === 0) return
      const { data } = await supabase.storage.from('aset-foto').createSignedUrls(initialFoto, 3600)
      const map: Record<string, string> = {}
      for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
      setFotoUrls(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFoto(files: FileList | null) {
    if (!files || files.length === 0) return
    setErr(''); setUploading(true)
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { setErr(`"${file.name}" lebih dari 10MB, dilewati.`); continue }
      if (!file.type.startsWith('image/')) { setErr(`"${file.name}" bukan file gambar, dilewati.`); continue }
      const path = `${storagePrefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('aset-foto').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      const { data: signed } = await supabase.storage.from('aset-foto').createSignedUrl(path, 3600)
      setFotoPaths(prev => [...prev, path])
      if (signed?.signedUrl) setFotoUrls(prev => ({ ...prev, [path]: signed.signedUrl }))
    }
    setUploading(false)
  }

  async function hapusFoto(path: string) {
    if (!confirm('Hapus foto ini?')) return
    if (single) await supabase.storage.from('aset-foto').remove([path]) // bulk: file dipakai bersama, jangan hapus fisiknya
    setFotoPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    setSaving(true)
    await onSave(values, single ? { replace: fotoPaths } : { append: fotoPaths })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Spesifikasi — {title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {!single && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Diterapkan ke SEMUA barang yang dicentang. Field yang dikosongkan tidak menimpa nilai per barang; foto yang diupload ditambahkan ke tiap barang.
            </p>
          )}
          {keys.map(k => {
            const type = FIELD_TYPE[k as FieldKey]
            if (k === 'longitude') return null // digabung ke widget 'latitude' (MapPicker), jangan dirender sendiri
            if (type === 'latlong') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <MapPicker latitude={values.latitude || ''} longitude={values.longitude || ''}
                    onChange={(lat, lng) => setValues({ ...values, latitude: lat, longitude: lng })} />
                </div>
              )
            }
            if (type === 'wilayah') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <WilayahPicker value={values[k] || ''} onChange={v => setValues({ ...values, [k]: v })} />
                </div>
              )
            }
            if (type === 'select') {
              return (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                  <select className="select-filter w-full" value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })}>
                    <option value="">-</option>
                    {(FIELD_OPTIONS[k as FieldKey] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              )
            }
            return (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{FIELD_LABEL[k as FieldKey]}</label>
                {type === 'textarea' ? (
                  <textarea className="select-filter w-full" rows={2} value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })} />
                ) : (
                  <input type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                    className="select-filter w-full" value={values[k] || ''} onChange={e => setValues({ ...values, [k]: e.target.value })} />
                )}
              </div>
            )
          })}
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs text-gray-500 mb-2">
              Foto Barang (maks 10MB/foto){!single && <span className="text-gray-400"> — foto baru ditambahkan ke semua barang dicentang</span>}
            </label>
            {fotoPaths.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {fotoPaths.map(p => (
                  <div key={p} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {fotoUrls[p] ? <img src={fotoUrls[p]} alt="Foto barang" className="w-full h-20 object-cover rounded border border-gray-200" /> : <div className="w-full h-20 bg-gray-100 rounded animate-pulse" />}
                    <button onClick={() => hapusFoto(p)} title="Hapus foto" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
            <input type="file" accept="image/*" multiple onChange={e => uploadFoto(e.target.files)} disabled={uploading} className="text-xs" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}
