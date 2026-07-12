'use client'
// Sub-flow "Pekerjaan Konstruksi" (KDP) — model PER-BARANG.
// Paket (sampul) → Rincian/BAST → tiap barang = KDP (1.3.6) di Daftar Barang →
// admin Setujui termin → Gabung & Reklas jadi aset tetap. Materialisasi lib/kdp.ts.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import { useDateBounds } from '@/components/useTahunBuku'
import { formatRupiah } from '@/lib/export'
import { GOLONGAN_FIELDS, ASET_FIELD_COLS, ASET_NUM_COLS } from '@/lib/asetFields'
import {
  buatPaket, hapusPaket, tambahRincian, setujuiTermin, batalTermin, hapusBarang,
  reklasKdp, type ReklasOutput,
} from '@/lib/kdp'

type Proyek = {
  id: string; skpd_id: number; no_kontrak: string | null; tgl_kontrak: string | null
  nama_pekerjaan: string; nilai_kontrak: number | null; status: 'berjalan' | 'selesai'
  program: string | null; kegiatan: string | null; sub_kegiatan: string | null
  nama_penyedia: string | null; ppk: string | null
}
type AsetRingkas = { id: string; kode: string; nama_barang: string | null; nilai_perolehan: number; foto_paths: string[] } & Record<string, unknown>
type Barang = { id: string; komponen: string; status: 'kdp' | 'selesai'; aset: AsetRingkas | null }
type Termin = { id: string; barang_id: string | null; komponen: string; uraian: string | null; no_bast: string | null; kode_rekening: string | null; tanggal: string; nilai: number; status: string }

const KOMPONEN = [
  { value: 'perencanaan', label: 'Perencanaan' },
  { value: 'fisik', label: 'Fisik' },
  { value: 'biaya_umum', label: 'Biaya Umum' },
  { value: 'pengawasan', label: 'Pengawasan' },
]
const komponenLabel = (v: string) => KOMPONEN.find(k => k.value === v)?.label || v
const toNum = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n }
const FIELDS_KDP = GOLONGAN_FIELDS['1.3.1'] // spesifikasi Tanah-like

export default function Konstruksi() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [skpd, setSkpd] = useState('')
  const [proyekList, setProyekList] = useState<Proyek[]>([])
  const [selected, setSelected] = useState<Proyek | null>(null)
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

  const loadProyek = useCallback(async (skpdId: string) => {
    if (!skpdId) { setProyekList([]); return }
    const { data } = await supabase.from('proyek_konstruksi').select('*').eq('skpd_id', Number(skpdId)).order('created_at', { ascending: false })
    setProyekList((data || []) as Proyek[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProyek(skpd); setSelected(null); setShowCreate(false) }, [skpd, loadProyek])

  async function hapus(p: Proyek) {
    if (!confirm(`Hapus paket "${p.nama_pekerjaan}"? (hanya jika belum ada termin disetujui)`)) return
    const { error } = await hapusPaket(supabase, p.id)
    if (error) setMsg(`Error: ${error}`); else { setMsg('Paket dihapus.'); loadProyek(skpd) }
  }

  return (
    <FormShell judul="Pekerjaan Konstruksi (KDP)"
      deskripsi="Tiap rincian belanja jadi barang KDP; saat siap, digabung & direklas jadi aset tetap." msg={msg}>
      <div className="card p-5 mb-4">
        <label className="block text-xs text-gray-500 mb-1">Lokasi / SKPD</label>
        <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai.</div>
      ) : selected ? (
        <ProyekDetail proyek={selected} isAdmin={isAdmin} onBack={() => { setSelected(null); loadProyek(skpd) }}
          onMsg={setMsg} onChanged={async () => {
            const { data } = await supabase.from('proyek_konstruksi').select('*').eq('id', selected.id).single()
            if (data) setSelected(data as Proyek); loadProyek(skpd)
          }} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{proyekList.length} paket</span>
            <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Batal' : '+ Buat Paket'}</button>
          </div>
          {showCreate && <CreateProyek skpdId={Number(skpd)} onSaved={() => { setShowCreate(false); loadProyek(skpd); setMsg('Paket dibuat.') }} onErr={setMsg} />}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr><th className="table-th">Pekerjaan</th><th className="table-th">No Kontrak</th><th className="table-th">Status</th><th className="table-th"></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {proyekList.length === 0 ? (
                  <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Belum ada paket.</td></tr>
                ) : proyekList.map(p => (
                  <tr key={p.id}>
                    <td className="table-td text-sm font-medium">{p.nama_pekerjaan}</td>
                    <td className="table-td text-xs text-gray-500">{p.no_kontrak || '—'}</td>
                    <td className="table-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'selesai' ? 'bg-teal/10 text-teal' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status === 'selesai' ? 'Selesai' : 'Berjalan'}
                      </span>
                    </td>
                    <td className="table-td text-right whitespace-nowrap">
                      <button className="text-teal hover:underline text-xs font-medium mr-3" onClick={() => setSelected(p)}>Buka</button>
                      {p.status === 'berjalan' && <button className="text-red-500 hover:text-red-700 text-xs font-medium" onClick={() => hapus(p)}>Hapus</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </FormShell>
  )
}

// ── Form buat paket (1 kolom, PPK dari daftar pegawai) ──────────────────────
function CreateProyek({ skpdId, onSaved, onErr }: { skpdId: number; onSaved: () => void; onErr: (m: string) => void }) {
  const supabase = createClient()
  const [f, setF] = useState({ nama: '', program: '', kegiatan: '', subKegiatan: '', noKontrak: '', tglKontrak: '', penyedia: '', ppk: '', nilaiKontrak: '' })
  const [pegawai, setPegawai] = useState<{ nama: string }[]>([])
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => {
    supabase.from('admin_pegawai').select('nama').order('nama').then(({ data }) => setPegawai((data || []) as { nama: string }[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nama.trim()) { onErr('Error: nama pekerjaan wajib.'); return }
    setSaving(true)
    const { error } = await buatPaket(supabase, {
      skpdId, namaPekerjaan: f.nama, noKontrak: f.noKontrak || null, tglKontrak: f.tglKontrak || null,
      nilaiKontrak: f.nilaiKontrak ? Number(f.nilaiKontrak) : null,
      program: f.program || null, kegiatan: f.kegiatan || null, subKegiatan: f.subKegiatan || null,
      namaPenyedia: f.penyedia || null, ppk: f.ppk || null,
    })
    setSaving(false)
    if (error) onErr(`Error: ${error}`); else onSaved()
  }

  const fld = (label: string, k: keyof typeof f, type = 'text') => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} required={k === 'nama'} className="select-filter w-full" value={f[k]} onChange={e => set(k, e.target.value)} />
    </div>
  )
  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 max-w-2xl">
      {fld('Nama Pekerjaan', 'nama')}
      {fld('Program', 'program')}
      {fld('Kegiatan', 'kegiatan')}
      {fld('Sub Kegiatan', 'subKegiatan')}
      {fld('No Kontrak', 'noKontrak')}
      {fld('Tgl Kontrak', 'tglKontrak', 'date')}
      {fld('Nama Penyedia', 'penyedia')}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Pejabat Pembuat Komitmen (PPK)</label>
        <input list="ppk-pegawai" className="select-filter w-full" value={f.ppk} onChange={e => set('ppk', e.target.value)} placeholder="Pilih / ketik nama pegawai" />
        <datalist id="ppk-pegawai">{pegawai.map((p, i) => <option key={i} value={p.nama} />)}</datalist>
      </div>
      {fld('Nilai Kontrak (Rp, opsional)', 'nilaiKontrak', 'number')}
      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Buat Paket'}</button>
    </form>
  )
}

// ── Detail paket: rincian/BAST + daftar barang + reklas ─────────────────────
function ProyekDetail({ proyek, isAdmin, onBack, onChanged, onMsg }: {
  proyek: Proyek; isAdmin: boolean; onBack: () => void; onChanged: () => void; onMsg: (m: string) => void
}) {
  const supabase = createClient()
  const bounds = useDateBounds()
  const [barangs, setBarangs] = useState<Barang[]>([])
  const [termins, setTermins] = useState<Termin[]>([])
  const [busy, setBusy] = useState(false)
  const [showReklas, setShowReklas] = useState(false)
  const [specBarang, setSpecBarang] = useState<Barang | null>(null)

  const load = useCallback(async () => {
    const [{ data: b }, { data: t }] = await Promise.all([
      supabase.from('proyek_barang').select(`id,komponen,status,aset:aset_id(id,kode,nilai_perolehan,foto_paths,${ASET_FIELD_COLS.join(',')})`).eq('proyek_id', proyek.id),
      supabase.from('proyek_termin').select('*').eq('proyek_id', proyek.id).order('tanggal'),
    ])
    setBarangs((b || []) as unknown as Barang[])
    setTermins((t || []) as Termin[])
  }, [proyek.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const total = barangs.reduce((s, b) => s + (b.aset?.nilai_perolehan || 0), 0)
  const barangKdp = barangs.filter(b => b.status === 'kdp' && (b.aset?.nilai_perolehan || 0) > 0)
  const earliestOf = (bid: string) => termins.filter(t => t.barang_id === bid).reduce((min, t) => (t.tanggal < min ? t.tanggal : min), '9999-99-99')
  const barangsSorted = [...barangs].sort((a, b) => earliestOf(a.id).localeCompare(earliestOf(b.id)))

  async function saveSpec(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    if (!specBarang?.aset) return
    const patch: Record<string, unknown> = {}
    for (const k of ASET_FIELD_COLS) { const v = fields[k]; patch[k] = v ? (ASET_NUM_COLS.has(k) ? toNum(v) : v) : null }
    if (foto.replace) patch.foto_paths = foto.replace
    await supabase.from('aset').update(patch).eq('id', specBarang.aset.id)
    setSpecBarang(null); onMsg('Spesifikasi disimpan.'); load()
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} title="Kembali ke daftar paket"
        className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Kembali
      </button>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{proyek.nama_pekerjaan}</h2>
            <div className="mt-1 text-xs text-gray-500 space-y-0.5">
              <p>{proyek.no_kontrak || 'tanpa no kontrak'}{proyek.tgl_kontrak ? ` · ${proyek.tgl_kontrak}` : ''}</p>
              {(proyek.program || proyek.kegiatan) && <p>Program: {proyek.program || '—'} · Kegiatan: {proyek.kegiatan || '—'}</p>}
              {proyek.sub_kegiatan && <p>Sub Kegiatan: {proyek.sub_kegiatan}</p>}
              {(proyek.nama_penyedia || proyek.ppk) && <p>Penyedia: {proyek.nama_penyedia || '—'} · PPK: {proyek.ppk || '—'}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total KDP</p>
            <p className="text-lg font-bold text-navy">{formatRupiah(total)}</p>
          </div>
        </div>
        {proyek.status === 'berjalan' && isAdmin && barangKdp.length > 0 && (
          <div className="mt-3"><button className="btn-primary" onClick={() => setShowReklas(true)}>Gabung &amp; Reklas → Aset Tetap</button></div>
        )}
        {proyek.status === 'selesai' && <p className="mt-3 text-sm text-teal">Paket selesai — semua KDP sudah direklas.</p>}
      </div>

      {proyek.status === 'berjalan' && (
        <RincianForm proyek={proyek} bounds={bounds} onMsg={onMsg} onSaved={() => load()} />
      )}

      {/* Daftar barang KDP + termin-nya (urut tgl BAST paling muda) */}
      <div className="space-y-3">
        {barangs.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">Belum ada barang. Tambah rincian/BAST di atas.</div>
        ) : barangsSorted.map(b => {
          const bt = termins.filter(t => t.barang_id === b.id)
          const hasApproved = bt.some(t => t.status === 'disetujui')
          return (
            <div key={b.id} className="card overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{String(b.aset?.nama_barang || '—')} <span className="text-xs text-gray-400">· {komponenLabel(b.komponen)}</span></p>
                  <p className="text-xs text-gray-400">{b.aset?.kode} · Nilai {formatRupiah(b.aset?.nilai_perolehan || 0)}{b.status === 'selesai' ? ' · sudah direklas' : ''}</p>
                  {(b.aset?.spesifikasi_lainnya || b.aset?.alamat_detail) && (
                    <p className="text-xs text-gray-400">
                      {b.aset?.spesifikasi_lainnya ? `Spesifikasi: ${String(b.aset.spesifikasi_lainnya)}` : ''}
                      {b.aset?.spesifikasi_lainnya && b.aset?.alamat_detail ? ' · ' : ''}
                      {b.aset?.alamat_detail ? `Lokasi: ${String(b.aset.alamat_detail)}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {b.status === 'kdp' && <button className="text-teal hover:underline font-medium" onClick={() => setSpecBarang(b)}>Spesifikasi</button>}
                  {b.status === 'kdp' && !hasApproved && <button className="text-red-500 hover:text-red-700 font-medium" onClick={async () => { if (!confirm('Hapus barang ini?')) return; const { error } = await hapusBarang(supabase, b.id); if (error) onMsg(`Error: ${error}`); else load() }}>Hapus</button>}
                </div>
              </div>
              <table className="w-full">
                <thead className="bg-white border-b border-gray-50">
                  <tr><th className="table-th">No BAST</th><th className="table-th">Tgl</th><th className="table-th">Rekening</th><th className="table-th">Keterangan</th><th className="table-th text-right">Bayar</th><th className="table-th">Status</th><th className="table-th">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bt.length === 0 ? (
                    <tr><td colSpan={7} className="table-td text-center py-4 text-gray-400 text-xs">Belum ada BAST.</td></tr>
                  ) : bt.map(t => (
                    <tr key={t.id}>
                      <td className="table-td text-xs">{t.no_bast || '—'}</td>
                      <td className="table-td text-xs text-gray-500">{t.tanggal}</td>
                      <td className="table-td text-xs text-gray-500">{t.kode_rekening || '—'}</td>
                      <td className="table-td text-xs text-gray-600">{t.uraian || '—'}</td>
                      <td className="table-td text-xs text-right">{formatRupiah(t.nilai)}</td>
                      <td className="table-td"><span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'disetujui' ? 'bg-teal/10 text-teal' : 'bg-gray-100 text-gray-500'}`}>{t.status === 'disetujui' ? 'Disetujui' : 'Draft'}</span></td>
                      <td className="table-td whitespace-nowrap text-xs">
                        {t.status === 'draft' ? (
                          <>
                            {isAdmin && <button disabled={busy} className="text-teal hover:underline font-medium mr-3" onClick={async () => { setBusy(true); const { error } = await setujuiTermin(supabase, t.id); setBusy(false); if (error) onMsg(`Error: ${error}`); else { onMsg('Termin disetujui.'); await load(); onChanged() } }}>Setujui</button>}
                            <button className="text-red-500 hover:text-red-700 font-medium" onClick={async () => { if (!confirm('Hapus termin draft?')) return; await supabase.from('proyek_termin').delete().eq('id', t.id); load() }}>Hapus</button>
                          </>
                        ) : (
                          isAdmin && b.status === 'kdp' && <button disabled={busy} className="text-red-500 hover:text-red-700 font-medium" onClick={async () => { if (!confirm('Batalkan termin disetujui? Nilai KDP turun.')) return; setBusy(true); const { error } = await batalTermin(supabase, t.id); setBusy(false); if (error) onMsg(`Error: ${error}`); else { await load(); onChanged() } }}>Batalkan</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      {showReklas && (
        <ReklasModal proyekId={proyek.id} skpdId={proyek.skpd_id} barangs={barangKdp} bounds={bounds}
          onClose={() => setShowReklas(false)}
          onDone={async (m) => { setShowReklas(false); onMsg(m); await load(); onChanged() }} onErr={onMsg} />
      )}
      {specBarang?.aset && (
        <EditSpesifikasiModal
          title={`Spesifikasi — ${specBarang.aset.nama_barang as string || specBarang.aset.kode}`}
          fieldKeys={FIELDS_KDP} storagePrefix={`kdp/${specBarang.aset.id}`}
          initialFields={Object.fromEntries(ASET_FIELD_COLS.map(k => [k, specBarang.aset![k] != null ? String(specBarang.aset![k]) : '']).filter(([, v]) => v))}
          initialFoto={specBarang.aset.foto_paths || []} single onSave={saveSpec} onClose={() => setSpecBarang(null)} />
      )}
    </div>
  )
}

// ── Form Tambah Rincian / BAST (langsung pilih kode KDP; barang auto by kode+komponen) ──
function RincianForm({ proyek, bounds, onSaved, onMsg }: {
  proyek: Proyek; bounds: { min: string; max: string }; onSaved: () => void; onMsg: (m: string) => void
}) {
  const supabase = createClient()
  const [komponen, setKomponen] = useState('fisik')
  const [noBast, setNoBast] = useState('')
  const [tgl, setTgl] = useState('')
  const [rekening, setRekening] = useState('')
  const [kode, setKode] = useState<KodefikasiHasil | null>(null)
  const [nominal, setNominal] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tgl || !nominal) { onMsg('Error: tgl BAST & nominal wajib.'); return }
    if (!kode) { onMsg('Error: pilih Kode Barang (jenis KDP 1.3.6).'); return }
    setSaving(true)
    const { error } = await tambahRincian(supabase, {
      proyekId: proyek.id, skpdId: proyek.skpd_id, komponen, kode: kode.kode, namaDefault: kode.uraian || kode.kode,
      noBast, tglBast: tgl, kodeRekening: rekening, nominal: Number(nominal), keterangan,
    })
    setSaving(false)
    if (error) { onMsg(`Error: ${error}`); return }
    setNoBast(''); setNominal(''); setKeterangan(''); setKode(null)
    onSaved()
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-800">Tambah Rincian / BAST</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Komponen</label>
        <select className="select-filter w-full" value={komponen} onChange={e => setKomponen(e.target.value)}>
          {KOMPONEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div><label className="block text-xs text-gray-500 mb-1">Nomor BAST</label>
        <input className="select-filter w-full" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Tanggal BAST</label>
        <input type="date" min={bounds.min} max={bounds.max} className="select-filter w-full" value={tgl} onChange={e => setTgl(e.target.value)} /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Kode Rekening</label>
        <input className="select-filter w-full" value={rekening} onChange={e => setRekening(e.target.value)} placeholder="free-form (tabel belum ada)" /></div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kode Barang (jenis KDP — golongan 1.3.6)</label>
        <KodefikasiPicker picked={kode} onPick={setKode} golonganTetap="1.3.6" />
      </div>
      <div><label className="block text-xs text-gray-500 mb-1">Nominal (Rp)</label>
        <input type="number" className="select-filter w-full" value={nominal} onChange={e => setNominal(e.target.value)} /></div>
      <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label>
        <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} /></div>
      <p className="text-[11px] text-gray-400">Nama & spesifikasi barang diisi lewat tombol Spesifikasi di kartu barang setelah ditambahkan.</p>
      <button type="submit" disabled={saving} className="btn-primary text-sm py-1.5">{saving ? 'Menyimpan...' : '+ Tambah Rincian'}</button>
    </form>
  )
}

// ── Modal Gabung & Reklas ───────────────────────────────────────────────────
function ReklasModal({ proyekId, skpdId, barangs, bounds, onClose, onDone, onErr }: {
  proyekId: string; skpdId: number; barangs: Barang[]; bounds: { min: string; max: string }
  onClose: () => void; onDone: (m: string) => void; onErr: (m: string) => void
}) {
  const supabase = createClient()
  const [tglBapp, setTglBapp] = useState(bounds.max)
  const [final, setFinal] = useState(true)
  const fisikList = barangs.filter(b => b.komponen === 'fisik')
  const bersamaList = barangs.filter(b => b.komponen !== 'fisik')
  // per barang fisik: pilih (checkbox) + kode output + nama
  const [out, setOut] = useState<Record<string, { on: boolean; kode: KodefikasiHasil | null; nama: string }>>(
    Object.fromEntries(fisikList.map(b => [b.id, { on: true, kode: null, nama: (b.aset?.nama_barang as string) || '' }])))
  const [bersamaOn, setBersamaOn] = useState<Record<string, boolean>>(Object.fromEntries(bersamaList.map(b => [b.id, true])))
  const [saving, setSaving] = useState(false)

  const setO = (id: string, patch: Partial<{ on: boolean; kode: KodefikasiHasil | null; nama: string }>) => setOut(o => ({ ...o, [id]: { ...o[id], ...patch } }))
  const chosenFisik = fisikList.filter(b => out[b.id]?.on)
  const fisikTotal = chosenFisik.reduce((s, b) => s + (b.aset?.nilai_perolehan || 0), 0)
  const bersamaTotal = bersamaList.filter(b => bersamaOn[b.id]).reduce((s, b) => s + (b.aset?.nilai_perolehan || 0), 0)

  async function submit() {
    const outputs: ReklasOutput[] = []
    for (const b of chosenFisik) {
      const o = out[b.id]
      if (!o.kode) { onErr(`Error: output "${b.aset?.nama_barang || b.aset?.kode}" belum pilih kode golongan aset tetap.`); return }
      outputs.push({ kode: o.kode.kode, nama: o.nama || (b.aset?.nama_barang as string) || o.kode.kode, fisikBarangId: b.id })
    }
    if (outputs.length === 0) { onErr('Error: pilih minimal satu barang fisik.'); return }
    setSaving(true)
    const { error } = await reklasKdp(supabase, { proyekId, skpdId, tglBapp, outputs, bersamaBarangIds: bersamaList.filter(b => bersamaOn[b.id]).map(b => b.id), final })
    setSaving(false)
    if (error) onErr(`Error: ${error}`); else onDone(final ? 'Reklas selesai — aset tetap terbentuk.' : 'Reklas sebagian tercatat.')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Gabung &amp; Reklas → Aset Tetap</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="block text-xs text-gray-500 mb-1">Tanggal BAPP</label>
            <input type="date" min={bounds.min} max={bounds.max} className="select-filter w-full" value={tglBapp} onChange={e => setTglBapp(e.target.value)} /></div>
          <label className="flex items-end gap-2 text-sm text-gray-700 pb-2"><input type="checkbox" checked={final} onChange={e => setFinal(e.target.checked)} /> Final (semua KDP habis)</label>
        </div>

        <p className="text-sm font-medium text-gray-700 mb-2">Barang FISIK → tiap-tiap jadi aset tetap</p>
        <div className="space-y-2 mb-4">
          {fisikList.length === 0 ? <p className="text-xs text-gray-400">Belum ada barang fisik.</p> : fisikList.map(b => (
            <div key={b.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={out[b.id]?.on} onChange={e => setO(b.id, { on: e.target.checked })} />
                <span className="font-medium">{b.aset?.nama_barang as string || b.aset?.kode}</span>
                <span className="text-xs text-gray-400">· {formatRupiah(b.aset?.nilai_perolehan || 0)}</span>
              </label>
              {out[b.id]?.on && (
                <div className="pl-6 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Kode golongan aset tetap tujuan (1.3.2/1.3.3/1.3.4/…)</label>
                    <KodefikasiPicker picked={out[b.id]?.kode || null} onPick={p => setO(b.id, { kode: p })} />
                  </div>
                  <input className="select-filter w-full" placeholder="Nama aset tetap baru" value={out[b.id]?.nama || ''} onChange={e => setO(b.id, { nama: e.target.value })} />
                </div>
              )}
            </div>
          ))}
        </div>

        {bersamaList.length > 0 && (
          <>
            <p className="text-sm font-medium text-gray-700 mb-2">Biaya bersama (dibagi proporsional ke output fisik)</p>
            <div className="space-y-1 mb-4">
              {bersamaList.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={bersamaOn[b.id]} onChange={e => setBersamaOn(s => ({ ...s, [b.id]: e.target.checked }))} />
                  <span>{komponenLabel(b.komponen)} — {b.aset?.nama_barang as string || b.aset?.kode}</span>
                  <span className="text-xs text-gray-400">· {formatRupiah(b.aset?.nilai_perolehan || 0)}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="text-sm text-gray-600">Fisik {formatRupiah(fisikTotal)} + Bersama {formatRupiah(bersamaTotal)} = <span className="font-semibold">{formatRupiah(fisikTotal + bersamaTotal)}</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3">Batal</button>
            <button onClick={submit} disabled={saving} className="btn-primary">{saving ? 'Memproses...' : 'Reklas'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
