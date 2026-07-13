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
import { formatRupiah } from '@/lib/export'
import { GOLONGAN_FIELDS, ASET_FIELD_COLS, ASET_NUM_COLS } from '@/lib/asetFields'
import {
  approveKontrakKonstruksi, unapproveKontrakKonstruksi, barangKdpList,
  type KontrakKonstruksiPayload, type PembayaranKdp, type BarangKdp,
} from '@/lib/kdp'

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

export default function KonstruksiPengadaan({ skpdProp, embedded, startCreate, openId, onExit, onDataChange }: {
  skpdProp?: string; embedded?: boolean
  startCreate?: boolean; openId?: string; onExit?: () => void
  onDataChange?: () => void // dipanggil tiap list berubah — utk refresh total induk (ref, stabil)
} = {}) {
  const supabase = createClient()
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange
  const [isAdmin, setIsAdmin] = useState(false)
  const [skpdInternal, setSkpdInternal] = useState('')
  const skpd = skpdProp !== undefined ? skpdProp : skpdInternal // SKPD boleh dikontrol induk (satu tampilan Pengadaan)
  const [list, setList] = useState<Kontrak[]>([])
  const [selected, setSelected] = useState<Kontrak | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setList([]); return }
    const { data } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,approval_status,payload')
      .eq('kategori', 'konstruksi').eq('skpd_id', Number(skpdId)).order('created_at', { ascending: false })
    setList((data || []) as Kontrak[])
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
          <KontrakDetail kontrak={selected} isAdmin={isAdmin} onBack={onExit}
            onMsg={setMsg} onChanged={async () => { await refreshSelected(); load(skpd) }} />
        ) : startCreate ? (
          <>
            <button onClick={onExit} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali ke daftar
            </button>
            <CreateKontrak skpdId={Number(skpd)} onSaved={k => { load(skpd); setSelected(k); setMsg('Kontrak dibuat (draft) — tambah barang KDP & rincian pembayaran di bawah lalu tunggu approval.') }} onErr={setMsg} />
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
            <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Batal' : '+ Buat Kontrak'}</button>
          </div>
          {showCreate && <CreateKontrak skpdId={Number(skpd)} onSaved={() => { setShowCreate(false); load(skpd); setMsg('Kontrak dibuat (draft) — tambah barang KDP & rincian pembayaran lalu tunggu approval.') }} onErr={setMsg} />}
          {list.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada kontrak konstruksi untuk SKPD ini.</div>
          ) : (
            <>
              {pendingK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-700">⏳ Menunggu Persetujuan ({pendingK.length})</h3>
                  {pendingK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={isAdmin} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
                </section>
              )}
              {disetujuiK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Disetujui ({disetujuiK.length})</h3>
                  {disetujuiK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={isAdmin} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
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
  const [kapYa, setKapYa] = useState(false)
  const [jenisTarget, setJenisTarget] = useState('') // golongan aset induk (1.3.3 / 1.3.4)
  const [target, setTarget] = useState<AsetRingkas | null>(null)
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
      kap_info: kapYa ? { menambah: true, target_aset_id: target?.id || null, target_nama: target?.nama_barang || null } : { menambah: false },
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
      <div>
        <label className="block text-xs text-gray-500 mb-1">Menambah masa manfaat aset yang sudah tercatat? <span className="text-gray-400">(info — reklas & kapitalisasi tetap manual nanti)</span></label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={!kapYa} onChange={() => { setKapYa(false); setTarget(null); setJenisTarget('') }} /> Tidak</label>
          <label className="flex items-center gap-1"><input type="radio" checked={kapYa} onChange={() => setKapYa(true)} /> Ya</label>
        </div>
        {kapYa && (
          <div className="mt-2 space-y-2">
            <select className="select-filter w-full" value={jenisTarget} onChange={e => { setJenisTarget(e.target.value); setTarget(null) }}>
              <option value="">— pilih jenis aset induk —</option>
              <option value="1.3.3">Gedung dan Bangunan</option>
              <option value="1.3.4">Jalan, Irigasi dan Jaringan</option>
            </select>
            {jenisTarget && <AsetPicker selected={target} onSelect={setTarget} skpdId={skpdId} kodePrefix={jenisTarget} />}
          </div>
        )}
      </div>
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
  async function tambahBarang(kode: string, nama: string) {
    await saveBarang([...barangs, { key: newKey(), kode, nama, pembayaran: [] }])
    setShowAddBarang(false)
  }
  async function hapusBarang(key: string) {
    if (!confirm('Hapus barang KDP ini beserta semua terminnya dari draft?')) return
    await saveBarang(barangs.filter(b => b.key !== key))
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

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{p.nama_pekerjaan}</h2>
            <div className="mt-1 text-xs text-gray-500 space-y-0.5">
              <p>SPK {kontrak.no_sk} · {kontrak.tanggal}</p>
              {(p.program || p.kegiatan) && <p>Program: {p.program || '—'} · Kegiatan: {p.kegiatan || '—'}{p.sub_kegiatan ? ` · Sub: ${p.sub_kegiatan}` : ''}</p>}
              {(p.penyedia || p.ppk) && <p>Penyedia: {p.penyedia || '—'} · PPK: {p.ppk || '—'}</p>}
              {p.kap_info?.menambah && <p className="text-amber-600">Catatan: menambah masa manfaat aset {p.kap_info.target_nama || '(dipilih)'} — reklas & kapitalisasi manual nanti.</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total ({barangs.length} barang KDP)</p>
            <p className="text-lg font-bold text-navy">{formatRupiah(total)}</p>
            {p.nilai_kontrak ? <p className="text-[11px] text-gray-400">Nilai kontrak {formatRupiah(p.nilai_kontrak)}</p> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {pending && isAdmin && barangs.length > 0 && <button className="btn-primary" onClick={approve} disabled={busy}>{busy ? 'Memproses...' : 'Setujui Kontrak'}</button>}
          {pending && <button className="text-sm text-red-500 hover:text-red-700 px-2" onClick={hapus}>Hapus Kontrak</button>}
          {!pending && isAdmin && <button className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200" onClick={unapprove} disabled={busy}>{busy ? 'Memproses...' : '🔓 Buka Kunci'}</button>}
          {!pending && !isAdmin && <span className="text-[11px] text-gray-400">🔒 Terkunci</span>}
        </div>
        {!pending && <p className="mt-2 text-sm text-teal">Disetujui — {barangs.length} barang KDP resmi tercatat di Daftar Barang.</p>}
      </div>

      {barangs.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">Belum ada barang KDP. Tambahkan minimal satu barang untuk bisa disetujui.</div>
      ) : (
        barangs.map(b => (
          <BarangCard key={b.key} barang={b} pending={pending} tglKontrak={kontrak.tanggal}
            onHapusBarang={() => hapusBarang(b.key)}
            onEditSpec={() => setSpecBarang(b)}
            onTambahTermin={item => tambahTermin(b.key, item)}
            onHapusTermin={idx => hapusTermin(b.key, idx)} />
        ))
      )}

      {pending && (
        showAddBarang
          ? <TambahBarangPanel onTambah={tambahBarang} onCancel={() => setShowAddBarang(false)} onErr={onMsg} />
          : <button className="btn-secondary text-sm" onClick={() => setShowAddBarang(true)}>+ Tambah Barang KDP</button>
      )}

      {specBarang && (
        <EditSpesifikasiModal title={`Spesifikasi — ${specBarang.nama}`} fieldKeys={FIELDS_KDP}
          storagePrefix={`draft/konstruksi/${kontrak.id}/${specBarang.key}`} initialFields={specBarang.spec || {}} initialFoto={specBarang.foto || []}
          single onSave={(fields, foto) => saveSpec(specBarang.key, fields, foto)} onClose={() => setSpecBarang(null)} />
      )}
    </div>
  )
}

// ── Panel tambah barang KDP (pilih kode 1.3.6 + nama) ───────────────────────
function TambahBarangPanel({ onTambah, onCancel, onErr }: {
  onTambah: (kode: string, nama: string) => void; onCancel: () => void; onErr: (m: string) => void
}) {
  const [kode, setKode] = useState<KodefikasiHasil | null>(null)
  const [nama, setNama] = useState('')
  return (
    <div className="card p-5 space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-800">Tambah Barang KDP</h3>
      <div><label className="block text-xs text-gray-500 mb-1">Kode Barang (jenis KDP — golongan 1.3.6)</label>
        <KodefikasiPicker picked={kode} onPick={k => { setKode(k); if (!nama) setNama(k?.uraian || '') }} golonganTetap="1.3.6" /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Nama Barang KDP</label>
        <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} placeholder="mis. Rehab ruas jalan A" /></div>
      <div className="flex gap-2">
        <button className="btn-primary text-sm" onClick={() => {
          if (!kode) { onErr('Error: pilih kode barang KDP dulu.'); return }
          if (!nama.trim()) { onErr('Error: nama barang KDP wajib.'); return }
          onTambah(kode.kode, nama.trim())
        }}>+ Tambah</button>
        <button className="btn-secondary text-sm" onClick={onCancel}>Batal</button>
      </div>
    </div>
  )
}

// ── Kartu satu barang KDP: header + termin + (draft) form tambah termin ─────
function BarangCard({ barang, pending, tglKontrak, onHapusBarang, onEditSpec, onTambahTermin, onHapusTermin }: {
  barang: BarangKdp; pending: boolean; tglKontrak: string
  onHapusBarang: () => void; onEditSpec: () => void
  onTambahTermin: (item: PembayaranKdp) => void; onHapusTermin: (idx: number) => void
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
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{barang.nama}</p>
          <p className="text-[11px] text-gray-400">{barang.kode}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Nilai (Σ termin)</p>
            <p className="font-semibold text-gray-800">{formatRupiah(total)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <button className="text-xs text-teal hover:underline" onClick={onEditSpec}>Edit Spesifikasi</button>
            {pending && <button className="text-xs text-red-500 hover:text-red-700" onClick={onHapusBarang}>Hapus Barang</button>}
          </div>
        </div>
      </div>

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
