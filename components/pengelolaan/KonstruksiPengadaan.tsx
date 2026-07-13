'use client'
// Pekerjaan Fisik (Konstruksi) — sub-mode di Pengadaan Entry Manual.
// MODEL MULTI-KDP (2026-07-13): 1 kontrak = 1 kartu jurnal_header (kategori
// 'konstruksi') yang bisa berisi BEBERAPA barang KDP (mis. paket jalan →
// beberapa ruas). Tiap barang = 1 aset KDP (1.3.6) dgn rincian termin sendiri;
// nilai barang = total termin-nya. Approval PER KONTRAK (atomik): saat approve
// SEMUA barang di-materialize sekaligus; saat unapprove SEMUA barang hilang dari
// Daftar Barang sampai disetujui ulang. Semua data di payload JSON (no DDL).
import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import { useDateBounds } from '@/components/useTahunBuku'
import { periodeDariTanggal } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import { GOLONGAN_FIELDS, ASET_FIELD_COLS, ASET_NUM_COLS } from '@/lib/asetFields'
import {
  approveKontrakKonstruksi, unapproveKontrakKonstruksi, barangKdpList,
  type KontrakKonstruksiPayload, type PembayaranKdp, type BarangKdp, type KapInfo,
} from '@/lib/kdp'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope, bolehSetujuiSkpd } from '@/lib/roles'

type Kontrak = { id: string; skpd_id: number; no_sk: string; tanggal: string; approval_status: string; payload: KontrakKonstruksiPayload }
const KOMPONEN = [
  { value: 'perencanaan', label: 'Perencanaan' }, { value: 'fisik', label: 'Fisik' },
  { value: 'biaya_umum', label: 'Biaya Umum' }, { value: 'pengawasan', label: 'Pengawasan' },
]
const komponenLabel = (v: string) => KOMPONEN.find(k => k.value === v)?.label || v
const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const newKey = () => Math.random().toString(36).slice(2)
const FIELDS_KDP = GOLONGAN_FIELDS['1.3.1']
const barangTotal = (b: BarangKdp) => (b.pembayaran || []).reduce((s, x) => s + Number(x.nominal || 0), 0)
const kontrakTotal = (p: KontrakKonstruksiPayload) => barangKdpList(p).reduce((s, b) => s + barangTotal(b), 0)

// Baris label:value ringkas utk header kartu kontrak.
function Baris({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex text-xs leading-relaxed">
      <span className="text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-gray-700">: {value || '-'}</span>
    </div>
  )
}

// ── Picker "Menambah masa manfaat aset yang sudah tercatat?" — PER BARANG KDP.
// Dipakai saat tambah barang (draft lokal) & saat ubah belakangan (langsung
// tersimpan). Search AsetPicker sudah bisa browse semua barang di SKPD (query
// kosong = tampilkan semua, dibatasi golongan GB/JIJ yg dipilih).
function KapInfoPicker({ skpdId, value, onChange }: {
  skpdId: number; value: KapInfo | null | undefined; onChange: (v: KapInfo | null) => void
}) {
  const menambah = !!value?.menambah
  const [golongan, setGolongan] = useState('')
  const [target, setTarget] = useState<AsetRingkas | null>(null)

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Menambah masa manfaat aset yang sudah tercatat? <span className="text-gray-400">(info — reklas & kapitalisasi tetap manual nanti)</span></label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={!menambah} onChange={() => { onChange(null); setGolongan(''); setTarget(null) }} /> Tidak</label>
        <label className="flex items-center gap-1"><input type="radio" checked={menambah} onChange={() => onChange({ menambah: true, target_aset_id: value?.target_aset_id ?? null, target_nama: value?.target_nama ?? null })} /> Ya</label>
      </div>
      {menambah && (
        <div className="mt-2 space-y-2">
          {value?.target_aset_id ? (
            <div className="flex items-center justify-between gap-3 p-2 bg-teal/5 border border-teal/30 rounded-lg text-sm">
              <span className="text-gray-800">{value.target_nama || '(aset terpilih)'}</span>
              <button type="button" className="text-xs text-teal hover:underline flex-shrink-0"
                onClick={() => { onChange({ menambah: true, target_aset_id: null, target_nama: null }); setTarget(null) }}>Ganti</button>
            </div>
          ) : (
            <>
              <select className="select-filter w-full" value={golongan} onChange={e => { setGolongan(e.target.value); setTarget(null) }}>
                <option value="">— pilih jenis aset induk —</option>
                <option value="1.3.3">Gedung dan Bangunan</option>
                <option value="1.3.4">Jalan, Irigasi dan Jaringan</option>
              </select>
              {golongan && (
                <AsetPicker selected={target} skpdId={skpdId} kodePrefix={golongan}
                  onSelect={a => { setTarget(a); onChange(a ? { menambah: true, target_aset_id: a.id, target_nama: a.nama_barang } : null) }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function KonstruksiPengadaan({ skpdProp, embedded, startCreate, openId, onExit, onDataChange, hideAdd }: {
  skpdProp?: string; embedded?: boolean
  startCreate?: boolean; openId?: string; onExit?: () => void
  onDataChange?: () => void // dipanggil tiap list berubah — utk refresh total induk (ref, stabil)
  hideAdd?: boolean         // sembunyikan "+ Buat Kontrak" internal (induk yg sediakan tombol tambah)
} = {}) {
  const supabase = createClient()
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange
  // Boleh approve utk SKPD terpilih? admin = semua; pengurus_barang = hanya
  // sub-OPD strict di bawah nodenya (penegak asli: trigger approval guard di DB).
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [skpdInternal, setSkpdInternal] = useState('')
  const skpd = skpdProp !== undefined ? skpdProp : skpdInternal // SKPD boleh dikontrol induk (satu tampilan Pengadaan)
  const bolehACC = bolehSetujuiSkpd(scope, skpd)
  const [list, setList] = useState<Kontrak[]>([])
  const [selected, setSelected] = useState<Kontrak | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      setScope(await fetchApprovalScope(supabase))
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setList([]); return }
    const { data } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,approval_status,payload')
      .eq('kategori', 'konstruksi').eq('skpd_id', Number(skpdId)).order('created_at', { ascending: false })
    // 'ditolak' = kontrak diarsipkan (pernah disetujui, tak bisa hard-delete) → disembunyikan.
    setList(((data || []) as Kontrak[]).filter(k => k.approval_status !== 'ditolak'))
    onDataChangeRef.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(skpd); setSelected(null); setShowCreate(false) }, [skpd, load])
  // Mode drill: buka kontrak yang diminta induk begitu daftar termuat.
  useEffect(() => { if (openId) { const found = list.find(k => k.id === openId); if (found) setSelected(found) } }, [openId, list])

  const refreshSelected = async () => {
    if (!selected) return
    const { data } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,approval_status,payload').eq('id', selected.id).single()
    if (data) setSelected(data as Kontrak)
  }

  // ── Mode drill (dipanggil dari daftar gabungan PengadaanEntry) ──────────────
  if (onExit) {
    return (
      <div className="space-y-4">
        {msg && (
          <div className={`p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
        )}
        {selected ? (
          <KontrakDetail kontrak={selected} isAdmin={bolehACC} onBack={onExit}
            onMsg={setMsg} onChanged={async () => { await refreshSelected(); load(skpd) }} />
        ) : startCreate ? (
          <>
            <button onClick={onExit} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali ke daftar
            </button>
            <CreateKontrak skpdId={Number(skpd)} onSaved={() => { load(skpd); onExit() }} onErr={setMsg} />
          </>
        ) : (
          <div className="card p-8 text-center text-gray-400 text-sm">Memuat kontrak…</div>
        )}
      </div>
    )
  }

  const pendingK = list.filter(k => k.approval_status !== 'disetujui')
  const disetujuiK = list.filter(k => k.approval_status === 'disetujui')

  const body = (
    <>
      {skpdProp === undefined && (
        <div className="card p-5 mb-4">
          <label className="block text-xs text-gray-500 mb-1">Lokasi / SKPD</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpdInternal(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
        </div>
      )}
      {embedded && msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai.</div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{list.length} kontrak konstruksi · {formatRupiah(list.reduce((s, k) => s + kontrakTotal(k.payload), 0))}</span>
            {!hideAdd && <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Batal' : '+ Buat Kontrak'}</button>}
          </div>
          {!hideAdd && showCreate && <CreateKontrak skpdId={Number(skpd)} onSaved={() => { setShowCreate(false); load(skpd); setMsg('Kontrak dibuat (draft) — tambah barang KDP & rincian pembayaran lalu tunggu approval.') }} onErr={setMsg} />}
          {list.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada kontrak konstruksi untuk SKPD ini.</div>
          ) : (
            <>
              {pendingK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-700">⏳ Menunggu Persetujuan ({pendingK.length})</h3>
                  {pendingK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={bolehACC} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
                </section>
              )}
              {disetujuiK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujuiK.length})</h3>
                  {disetujuiK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={bolehACC} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
  return embedded ? body : (
    <FormShell judul="Pekerjaan Fisik (Konstruksi)" deskripsi="Kontrak konstruksi bisa berisi beberapa barang KDP; tiap barang punya termin sendiri. Approval per kontrak." msg={msg}>{body}</FormShell>
  )
}

// ── Form buat kontrak (header saja — barang KDP ditambah di detail) ─────────
function CreateKontrak({ skpdId, onSaved, onErr }: { skpdId: number; onSaved: (k: Kontrak) => void; onErr: (m: string) => void }) {
  const supabase = createClient()
  const bounds = useDateBounds()
  const [f, setF] = useState({ nama: '', noKontrak: '', tglKontrak: '', program: '', kegiatan: '', subKeg: '', penyedia: '', nilaiKontrak: '', keterangan: '' })
  const [ppk, setPpk] = useState('')
  const [pegawai, setPegawai] = useState<{ nama: string; nip: string }[]>([])
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => { supabase.from('admin_pegawai').select('nama,nip').order('nama').then(({ data }) => setPegawai((data || []) as { nama: string; nip: string }[])) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nama.trim()) { onErr('Error: nama pekerjaan wajib.'); return }
    if (!f.noKontrak.trim() || !f.tglKontrak) { onErr('Error: No & Tgl Kontrak wajib.'); return }
    setSaving(true)
    const payload: KontrakKonstruksiPayload = {
      nama_pekerjaan: f.nama, sumber: 'spk',
      program: f.program || null, kegiatan: f.kegiatan || null, sub_kegiatan: f.subKeg || null,
      ppk: ppk || null, penyedia: f.penyedia || null, nilai_kontrak: f.nilaiKontrak ? Number(f.nilaiKontrak) : null,
      keterangan: f.keterangan || null,
      barang: [],
    }
    const { data, error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'konstruksi', no_sk: f.noKontrak.trim(), tanggal: f.tglKontrak,
      keterangan: f.keterangan || null, approval_status: 'pending', payload,
    }).select('id,skpd_id,no_sk,tanggal,approval_status,payload').single()
    setSaving(false)
    if (error || !data) onErr(`Error: ${error?.message}`); else onSaved(data as Kontrak)
  }

  const fld = (label: string, k: keyof typeof f, type = 'text') => (
    <div><label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} className="select-filter w-full" value={f[k]} onChange={e => set(k, e.target.value)} /></div>
  )
  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 max-w-2xl">
      {fld('Nama Pekerjaan', 'nama')}
      <div><label className="block text-xs text-gray-500 mb-1">Sumber Pekerjaan (Dokumen Sumber)</label>
        <input className="select-filter w-full bg-gray-100 text-gray-600" value="Surat Perintah Kerja (SPK)" readOnly /></div>
      {fld('No. Dokumen Kontrak', 'noKontrak')}
      <div><label className="block text-xs text-gray-500 mb-1">Tgl Dokumen Kontrak</label>
        <input type="date" min={bounds.min} max={bounds.max} className="select-filter w-full" value={f.tglKontrak} onChange={e => set('tglKontrak', e.target.value)} /></div>
      {fld('Program', 'program')}
      {fld('Kegiatan', 'kegiatan')}
      {fld('Sub Kegiatan', 'subKeg')}
      <div><label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label>
        <select className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)}>
          <option value="">— pilih pegawai —</option>
          {pegawai.map((p, i) => <option key={i} value={p.nama}>{p.nama} — {p.nip}</option>)}
        </select></div>
      {fld('Nama Penyedia', 'penyedia')}
      {fld('Nilai Kontrak Pekerjaan (Rp)', 'nilaiKontrak', 'number')}
      {fld('Keterangan Kontrak', 'keterangan')}
      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan Kontrak'}</button>
    </form>
  )
}

// ── Detail kontrak: daftar barang KDP (tiap barang punya termin) + approval ──
function KontrakDetail({ kontrak, isAdmin, onBack, onChanged, onMsg, inline }: {
  kontrak: Kontrak; isAdmin: boolean; onBack: () => void; onChanged: () => void; onMsg: (m: string) => void
  inline?: boolean // dipakai di halaman gabungan (banyak kartu sekaligus) — sembunyikan tombol "Kembali"
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [showAddBarang, setShowAddBarang] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [specBarang, setSpecBarang] = useState<BarangKdp | null>(null)
  const p = kontrak.payload || ({} as KontrakKonstruksiPayload)
  const barangs = barangKdpList(p)
  const total = barangs.reduce((s, b) => s + barangTotal(b), 0)
  const pending = kontrak.approval_status !== 'disetujui'

  // Tulis ulang payload versi baru (barang[]) — buang field legacy singleton.
  async function saveBarang(next: BarangKdp[]) {
    const rest = { ...p }
    delete (rest as Record<string, unknown>).kode_kdp; delete (rest as Record<string, unknown>).pembayaran
    delete (rest as Record<string, unknown>).spec; delete (rest as Record<string, unknown>).foto; delete (rest as Record<string, unknown>).aset_id
    const { error } = await supabase.from('jurnal_header').update({ payload: { ...rest, barang: next } }).eq('id', kontrak.id)
    if (error) onMsg(`Error: ${error.message}`); else onChanged()
  }
  async function tambahBarang(kode: string, nama: string, kapInfo: KapInfo | null) {
    await saveBarang([...barangs, { key: newKey(), kode, nama, pembayaran: [], kap_info: kapInfo }])
    setShowAddBarang(false)
  }
  async function hapusBarang(key: string) {
    if (!confirm('Hapus barang KDP ini beserta semua terminnya dari draft?')) return
    await saveBarang(barangs.filter(b => b.key !== key))
  }
  async function ubahKapInfo(key: string, kapInfo: KapInfo | null) {
    await saveBarang(barangs.map(b => b.key === key ? { ...b, kap_info: kapInfo } : b))
  }
  async function tambahTermin(key: string, item: PembayaranKdp) {
    await saveBarang(barangs.map(b => b.key === key ? { ...b, pembayaran: [...(b.pembayaran || []), item] } : b))
  }
  async function hapusTermin(key: string, idx: number) {
    await saveBarang(barangs.map(b => b.key === key ? { ...b, pembayaran: (b.pembayaran || []).filter((_, j) => j !== idx) } : b))
  }
  async function saveSpec(key: string, fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const spec: Record<string, string> = {}
    for (const k of ASET_FIELD_COLS) { const v = fields[k]; if (v) spec[k] = ASET_NUM_COLS.has(k) ? String(toNum(v)) : v }
    await saveBarang(barangs.map(b => b.key === key ? { ...b, spec, foto: foto.replace ?? b.foto ?? [] } : b))
    setSpecBarang(null); onMsg('Spesifikasi disimpan.')
  }

  async function approve() {
    if (!confirm(`Setujui kontrak ${kontrak.no_sk}? ${barangs.length} barang KDP (total ${formatRupiah(total)}) resmi tercatat di Daftar Barang.`)) return
    setBusy(true); onMsg('')
    const { error } = await approveKontrakKonstruksi(supabase, kontrak.id)
    setBusy(false)
    if (error) onMsg(`Error: ${error}`); else { onMsg('Kontrak disetujui — semua barang KDP resmi tercatat.'); onChanged() }
  }
  async function unapprove() {
    if (!confirm(`Buka kunci kontrak ${kontrak.no_sk}? SEMUA (${barangs.length}) barang KDP disembunyikan dari Daftar Barang & kontrak kembali draft sampai disetujui ulang.`)) return
    setBusy(true); onMsg('')
    const { error } = await unapproveKontrakKonstruksi(supabase, kontrak.id)
    setBusy(false)
    if (error) onMsg(`Error: ${error}`); else { onMsg('Kontrak dibuka kunci — semua barang KDP kembali draft.'); onChanged() }
  }
  async function hapus() {
    // Kontrak yg PERNAH disetujui punya jejak ledger (akumulasi_kdp/batal_ yg
    // ber-header_id) → hard-DELETE jurnal_header ditolak FK. Arsipkan saja
    // (approval_status='ditolak'): ledger tetap utuh (append-only), kontrak
    // hilang dari daftar, No. SPK bebas dipakai lagi. Draft murni (tanpa jejak
    // ledger) → hapus biasa aman.
    const { data: led } = await supabase.from('transaksi_bmd').select('id').eq('header_id', kontrak.id).limit(1)
    const hasLedger = !!(led && led.length > 0)
    if (hasLedger) {
      if (!confirm(`Arsipkan kontrak ${kontrak.no_sk}? Kontrak ini pernah disetujui — riwayat ledgernya TETAP tersimpan (append-only, tak bisa dihapus). Kontrak hilang dari daftar & No. SPK bisa dipakai lagi. Tidak bisa dibatalkan.`)) return
      const { error } = await supabase.from('jurnal_header').update({ approval_status: 'ditolak' }).eq('id', kontrak.id)
      if (error) { onMsg(`Error: gagal mengarsipkan kontrak: ${error.message}`); return }
      onMsg(`Kontrak ${kontrak.no_sk} diarsipkan — No. SPK bisa dipakai lagi.`)
      onBack()
      return
    }
    if (!confirm('Hapus kontrak draft ini?')) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', kontrak.id)
    if (error) onMsg(`Error: ${error.message}`); else onBack()
  }

  return (
    <div className="space-y-4">
      {!inline && (
        <button onClick={onBack} title="Kembali" className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali
        </button>
      )}

      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">{p.nama_pekerjaan}</h2>
              <div className="space-y-0.5">
                <Baris label="Jenis Kontrak" value="Surat Perintah Kerja (SPK)" />
                <Baris label="Nomor Kontrak" value={kontrak.no_sk} />
                <Baris label="Tanggal Kontrak" value={kontrak.tanggal} />
                <Baris label="Program" value={p.program} />
                <Baris label="Kegiatan" value={p.kegiatan} />
                <Baris label="Sub Kegiatan" value={p.sub_kegiatan} />
                <Baris label="Keterangan" value={p.keterangan} />
                <Baris label="Nama Penyedia" value={p.penyedia} />
                <Baris label="Nama PPKom" value={p.ppk} />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">Total ({barangs.length} barang KDP) · {periodeDariTanggal(kontrak.tanggal)}</p>
              <p className="text-lg font-bold text-navy">{formatRupiah(total)}</p>
              {p.nilai_kontrak ? <p className="text-[11px] text-gray-400">Nilai kontrak {formatRupiah(p.nilai_kontrak)}</p> : null}
              {pending && (
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button title="Edit Kontrak" onClick={() => setShowEdit(true)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                  <button title="Hapus / arsipkan kontrak" onClick={hapus}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                </div>
              )}
            </div>
          </div>
          {!pending && <p className="mt-2 text-sm text-teal">Disetujui — {barangs.length} barang KDP resmi tercatat di Daftar Barang.</p>}
        </div>

        {barangs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Belum ada barang KDP. Tambahkan minimal satu barang untuk bisa disetujui.</div>
        ) : (
          barangs.map(b => (
            <BarangCard key={b.key} barang={b} pending={pending} tglKontrak={kontrak.tanggal} skpdId={kontrak.skpd_id}
              onHapusBarang={() => hapusBarang(b.key)}
              onEditSpec={() => setSpecBarang(b)}
              onTambahTermin={item => tambahTermin(b.key, item)}
              onHapusTermin={idx => hapusTermin(b.key, idx)}
              onUbahKapInfo={kapInfo => ubahKapInfo(b.key, kapInfo)} />
          ))
        )}

        {pending && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/40">
            {showAddBarang
              ? <TambahBarangPanel skpdId={kontrak.skpd_id} onTambah={tambahBarang} onCancel={() => setShowAddBarang(false)} onErr={onMsg} />
              : <button className="btn-secondary text-sm" onClick={() => setShowAddBarang(true)}>+ Tambah Barang KDP</button>}
          </div>
        )}

        <div className="p-4 border-t border-gray-100 flex justify-end items-center gap-3">
          {pending && isAdmin && barangs.length > 0 && <button className="btn-primary" onClick={approve} disabled={busy}>{busy ? 'Memproses...' : '✓ Setujui Kontrak'}</button>}
          {pending && isAdmin && barangs.length === 0 && <span className="text-xs text-gray-400">Tambah minimal 1 barang KDP untuk bisa disetujui.</span>}
          {pending && !isAdmin && <span className="text-xs text-gray-400">Menunggu tinjauan admin.</span>}
          {!pending && isAdmin && <button className="btn-secondary text-sm" onClick={unapprove} disabled={busy}>{busy ? 'Memproses...' : '🔓 Buka Kunci'}</button>}
          {!pending && !isAdmin && <span className="text-[11px] text-gray-400">🔒 Terkunci</span>}
        </div>
      </div>

      {specBarang && (
        <EditSpesifikasiModal title={`Spesifikasi — ${specBarang.nama}`} fieldKeys={FIELDS_KDP}
          storagePrefix={`draft/konstruksi/${kontrak.id}/${specBarang.key}`} initialFields={specBarang.spec || {}} initialFoto={specBarang.foto || []}
          single onSave={(fields, foto) => saveSpec(specBarang.key, fields, foto)} onClose={() => setSpecBarang(null)} />
      )}
      {showEdit && (
        <EditKontrakModal kontrak={kontrak}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onMsg('Header kontrak diperbarui.'); onChanged() }}
          onErr={onMsg} />
      )}
    </div>
  )
}

// ── Modal edit header kontrak konstruksi (hanya saat draft) ─────────────────
// Pola sama non-fisik: No SPK/tgl/dll boleh diubah selama tetap di semester yang
// sama (fn_jurnal_header_guard); pindah semester → batalkan & buat baru. Tgl
// kontrak tak boleh lebih baru dari termin paling awal (jaga aturan BAST ≥ tgl).
function EditKontrakModal({ kontrak, onClose, onSaved, onErr }: {
  kontrak: Kontrak; onClose: () => void; onSaved: () => void; onErr: (m: string) => void
}) {
  const supabase = createClient()
  const bounds = useDateBounds()
  const p = kontrak.payload || ({} as KontrakKonstruksiPayload)
  const [nama, setNama] = useState(p.nama_pekerjaan || '')
  const [noKontrak, setNoKontrak] = useState(kontrak.no_sk)
  const [tgl, setTgl] = useState(kontrak.tanggal)
  const [program, setProgram] = useState(p.program || '')
  const [kegiatan, setKegiatan] = useState(p.kegiatan || '')
  const [subKeg, setSubKeg] = useState(p.sub_kegiatan || '')
  const [penyedia, setPenyedia] = useState(p.penyedia || '')
  const [ppk, setPpk] = useState(p.ppk || '')
  const [nilaiKontrak, setNilaiKontrak] = useState(p.nilai_kontrak != null ? String(p.nilai_kontrak) : '')
  const [keterangan, setKeterangan] = useState(p.keterangan || kontrak.keterangan || '')
  const [pegawai, setPegawai] = useState<{ nama: string; nip: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { supabase.from('admin_pegawai').select('nama,nip').order('nama').then(({ data }) => setPegawai((data || []) as { nama: string; nip: string }[])) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const periodeAsli = periodeDariTanggal(kontrak.tanggal)
  const pindahSemester = periodeDariTanggal(tgl) !== periodeAsli
  // Termin paling awal — tgl kontrak baru tak boleh lebih baru dari ini.
  const terminTerawal = barangKdpList(p).flatMap(b => (b.pembayaran || []).map(x => x.tgl_bast)).sort()[0]

  async function simpan() {
    if (!nama.trim()) { setErr('Nama pekerjaan wajib diisi.'); return }
    if (!noKontrak.trim() || !tgl) { setErr('No. & Tgl Kontrak wajib diisi.'); return }
    if (pindahSemester) { setErr(`Tanggal masuk ${periodeDariTanggal(tgl)}, sedangkan kontrak ini di ${periodeAsli}. Pindah semester tidak diizinkan — batalkan & buat kontrak baru.`); return }
    if (terminTerawal && tgl > terminTerawal) { setErr(`Tgl kontrak (${tgl}) tidak boleh lebih baru dari termin paling awal (${terminTerawal}) — sesuaikan termin dulu.`); return }
    setErr(''); setSaving(true)
    const payload: KontrakKonstruksiPayload = {
      ...p, nama_pekerjaan: nama.trim(),
      program: program.trim() || null, kegiatan: kegiatan.trim() || null, sub_kegiatan: subKeg.trim() || null,
      penyedia: penyedia.trim() || null, ppk: ppk || null,
      nilai_kontrak: nilaiKontrak ? Number(nilaiKontrak) : null, keterangan: keterangan.trim() || null,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noKontrak.trim(), tanggal: tgl, keterangan: keterangan.trim() || null, payload })
      .eq('id', kontrak.id)
    setSaving(false)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); onErr(`Error: ${error.message}`); return }
    onSaved()
  }

  const fld = (label: string, val: string, setVal: (v: string) => void, type = 'text') => (
    <div><label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} className="select-filter w-full" value={val} onChange={e => setVal(e.target.value)} /></div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Kontrak Konstruksi</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          {fld('Nama Pekerjaan', nama, setNama)}
          {fld('No. Kontrak (SPK)', noKontrak, setNoKontrak)}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak <span className="text-gray-400">(tetap di {periodeAsli})</span></label>
            <input type="date" className="select-filter w-full sm:w-64" max={bounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {periodeDariTanggal(tgl)} — di luar semester kontrak.</p>}
          </div>
          {fld('Program', program, setProgram)}
          {fld('Kegiatan', kegiatan, setKegiatan)}
          {fld('Sub Kegiatan', subKeg, setSubKeg)}
          <div><label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label>
            <select className="select-filter w-full" value={ppk} onChange={e => setPpk(e.target.value)}>
              <option value="">— pilih pegawai —</option>
              {ppk && !pegawai.some(pg => pg.nama === ppk) && <option value={ppk}>{ppk}</option>}
              {pegawai.map((pg, i) => <option key={i} value={pg.nama}>{pg.nama} — {pg.nip}</option>)}
            </select></div>
          {fld('Nama Penyedia', penyedia, setPenyedia)}
          {fld('Nilai Kontrak Pekerjaan (Rp)', nilaiKontrak, setNilaiKontrak, 'number')}
          {fld('Keterangan Kontrak', keterangan, setKeterangan)}
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

// ── Panel tambah barang KDP (pilih kode 1.3.6 + nama + opsional induk aset) ─
function TambahBarangPanel({ skpdId, onTambah, onCancel, onErr }: {
  skpdId: number
  onTambah: (kode: string, nama: string, kapInfo: KapInfo | null) => void; onCancel: () => void; onErr: (m: string) => void
}) {
  const [kode, setKode] = useState<KodefikasiHasil | null>(null)
  const [nama, setNama] = useState('')
  const [kapInfo, setKapInfo] = useState<KapInfo | null>(null)
  return (
    <div className="space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-800">Tambah Barang KDP</h3>
      <div><label className="block text-xs text-gray-500 mb-1">Kode Barang (jenis KDP — golongan 1.3.6)</label>
        <KodefikasiPicker picked={kode} onPick={k => { setKode(k); if (!nama) setNama(k?.uraian || '') }} golonganTetap="1.3.6" /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Nama Barang KDP</label>
        <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} placeholder="mis. Rehab ruas jalan A" /></div>
      <KapInfoPicker skpdId={skpdId} value={kapInfo} onChange={setKapInfo} />
      <div className="flex gap-2">
        <button className="btn-primary text-sm" onClick={() => {
          if (!kode) { onErr('Error: pilih kode barang KDP dulu.'); return }
          if (!nama.trim()) { onErr('Error: nama barang KDP wajib.'); return }
          onTambah(kode.kode, nama.trim(), kapInfo)
        }}>+ Tambah</button>
        <button className="btn-secondary text-sm" onClick={onCancel}>Batal</button>
      </div>
    </div>
  )
}

// ── Kartu satu barang KDP: header + termin + (draft) form tambah termin ─────
function BarangCard({ barang, pending, tglKontrak, skpdId, onHapusBarang, onEditSpec, onTambahTermin, onHapusTermin, onUbahKapInfo }: {
  barang: BarangKdp; pending: boolean; tglKontrak: string; skpdId: number
  onHapusBarang: () => void; onEditSpec: () => void
  onTambahTermin: (item: PembayaranKdp) => void; onHapusTermin: (idx: number) => void
  onUbahKapInfo: (kapInfo: KapInfo | null) => void
}) {
  const bounds = useDateBounds()
  const pembayaran = barang.pembayaran || []
  const total = barangTotal(barang)
  const [komponen, setKomponen] = useState('fisik')
  const [noBast, setNoBast] = useState('')
  const [tgl, setTgl] = useState('')
  const [rekening, setRekening] = useState('')
  const [nominal, setNominal] = useState('')
  const [ket, setKet] = useState('')
  const [err, setErr] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showKapInfo, setShowKapInfo] = useState(false)
  const [draftKapInfo, setDraftKapInfo] = useState<KapInfo | null>(barang.kap_info ?? null)
  // Tgl BAST tak boleh lebih tua dari tgl kontrak (juga hormati batas tahun buku).
  const minTgl = [bounds.min, tglKontrak].filter(Boolean).sort().slice(-1)[0]

  function submitTermin(e: React.FormEvent) {
    e.preventDefault()
    if (!tgl || !nominal) { setErr('Tgl BAST & nominal wajib diisi.'); return }
    if (tglKontrak && tgl < tglKontrak) { setErr(`Tgl BAST (${tgl}) tidak boleh lebih tua dari tgl kontrak (${tglKontrak}).`); return }
    setErr('')
    onTambahTermin({ komponen: komponen as PembayaranKdp['komponen'], no_bast: noBast || null, tgl_bast: tgl, kode_rekening: rekening || null, nominal: Number(nominal), keterangan: ket || null })
    setNoBast(''); setNominal(''); setKet(''); setShowForm(false)
  }

  return (
    <div className="border-t border-gray-100">
      <div className="px-5 py-3 bg-gray-50/60 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{barang.nama} <span className="text-[11px] text-gray-400 font-normal">· {barang.kode}</span></p>
          <div className="mt-1 space-y-0.5">
            <Baris label="Spesifikasi Nama Barang" value={barang.spec?.nama_barang} />
            <Baris label="Lokasi" value={barang.spec?.alamat_detail} />
            <Baris label="Keterangan" value={barang.spec?.keterangan} />
            {barang.kap_info?.menambah && <Baris label="Menambah Manfaat" value={barang.kap_info.target_nama || '(aset dipilih)'} />}
          </div>
        </div>
        <div className="flex items-start gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Nilai (Σ termin)</p>
            <p className="font-semibold text-gray-800">{formatRupiah(total)}</p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <button className="text-xs text-teal hover:underline" onClick={onEditSpec}>Edit Spesifikasi</button>
            {pending && <button className="text-xs text-teal hover:underline" onClick={() => { setDraftKapInfo(barang.kap_info ?? null); setShowKapInfo(v => !v) }}>Ubah Induk Aset</button>}
            {pending && <button className="text-xs text-red-500 hover:text-red-700" onClick={onHapusBarang}>Hapus Barang</button>}
          </div>
        </div>
      </div>

      {showKapInfo && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 space-y-3">
          <KapInfoPicker skpdId={skpdId} value={draftKapInfo} onChange={setDraftKapInfo} />
          <div className="flex gap-2">
            <button className="btn-primary text-sm py-1.5" onClick={() => { onUbahKapInfo(draftKapInfo); setShowKapInfo(false) }}>Simpan</button>
            <button className="btn-secondary text-sm py-1.5" onClick={() => setShowKapInfo(false)}>Batal</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100"><tr>
            <th className="table-th">Komponen</th><th className="table-th">No BAST</th><th className="table-th">Tgl</th><th className="table-th">Rekening</th><th className="table-th">Keterangan</th><th className="table-th text-right">Nominal</th>{pending && <th className="table-th"></th>}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {pembayaran.length === 0 ? <tr><td colSpan={pending ? 7 : 6} className="table-td text-center py-6 text-gray-400 text-xs">Belum ada pembayaran.</td></tr>
              : pembayaran.map((b, i) => (
                <tr key={i}>
                  <td className="table-td text-xs">{komponenLabel(b.komponen)}</td>
                  <td className="table-td text-xs text-gray-500">{b.no_bast || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{b.tgl_bast}</td>
                  <td className="table-td text-xs text-gray-500">{b.kode_rekening || '—'}</td>
                  <td className="table-td text-xs text-gray-600">{b.keterangan || '—'}</td>
                  <td className="table-td text-xs text-right">{formatRupiah(b.nominal)}</td>
                  {pending && <td className="table-td text-right"><button className="text-red-500 hover:text-red-700 text-xs" onClick={() => onHapusTermin(i)}>Hapus</button></td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
          {showForm ? (
            <form onSubmit={submitTermin} className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-700">Tambah Rincian / Pembayaran</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Komponen</label>
                  <select className="select-filter w-full text-sm" value={komponen} onChange={e => setKomponen(e.target.value)}>{KOMPONEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">Nomor BAST</label><input className="select-filter w-full text-sm" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Tanggal BAST <span className="text-gray-400">(≥ tgl kontrak {tglKontrak})</span></label><input type="date" min={minTgl} max={bounds.max} className="select-filter w-full text-sm" value={tgl} onChange={e => setTgl(e.target.value)} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Kode Rekening</label><input className="select-filter w-full text-sm" value={rekening} onChange={e => setRekening(e.target.value)} placeholder="free-form" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Nominal (Rp)</label><input type="number" className="select-filter w-full text-sm" value={nominal} onChange={e => setNominal(e.target.value)} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label><input className="select-filter w-full text-sm" value={ket} onChange={e => setKet(e.target.value)} /></div>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-sm py-1.5">+ Tambah Rincian</button>
                <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => { setShowForm(false); setErr('') }}>Batal</button>
              </div>
            </form>
          ) : (
            <button className="btn-secondary text-xs" onClick={() => setShowForm(true)}>+ Tambah Rincian / Pembayaran</button>
          )}
        </div>
      )}
    </div>
  )
}
