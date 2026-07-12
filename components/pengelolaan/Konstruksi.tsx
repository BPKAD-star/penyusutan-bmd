'use client'
// Sub-flow "Pekerjaan Konstruksi" (KDP) di Pengadaan. Pilih SKPD → daftar/buat
// paket → detail (termin per komponen + saldo KDP + approve/batal admin) →
// Penyelesaian (BAPP) carve-out ke aset tetap. Materialisasi di lib/kdp.ts.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import { useDateBounds } from '@/components/useTahunBuku'
import { formatRupiah } from '@/lib/export'
import { setujuiTermin, batalTermin, selesaikanProyek, hitungAlokasi, type OutputKdp } from '@/lib/kdp'

type Proyek = {
  id: string; skpd_id: number; no_kontrak: string | null; tgl_kontrak: string | null
  nama_pekerjaan: string; nilai_kontrak: number | null; kode_kdp: string | null
  aset_kdp_id: string | null; status: 'berjalan' | 'selesai'
}
type Termin = { id: string; komponen: string; uraian: string | null; tanggal: string; nilai: number; status: string }

const KOMPONEN = [
  { value: 'perencanaan', label: 'Perencanaan' },
  { value: 'fisik', label: 'Fisik' },
  { value: 'biaya_umum', label: 'Biaya Umum' },
  { value: 'pengawasan', label: 'Pengawasan' },
]
const komponenLabel = (v: string) => KOMPONEN.find(k => k.value === v)?.label || v

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
    const { data } = await supabase.from('proyek_konstruksi').select('*')
      .eq('skpd_id', Number(skpdId)).order('created_at', { ascending: false })
    setProyekList((data || []) as Proyek[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProyek(skpd); setSelected(null); setShowCreate(false) }, [skpd, loadProyek])

  return (
    <FormShell judul="Pekerjaan Konstruksi (KDP)"
      deskripsi="Paket pekerjaan fisik: biaya menumpuk jadi KDP, saat BAPP direklas ke aset tetap (bisa sebagian)." msg={msg}>
      <div className="card p-5 mb-4">
        <label className="block text-xs text-gray-500 mb-1">Lokasi / SKPD</label>
        <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai.</div>
      ) : selected ? (
        <ProyekDetail proyek={selected} isAdmin={isAdmin} onBack={() => { setSelected(null); loadProyek(skpd) }}
          onMsg={setMsg} onChanged={async () => {
            await loadProyek(skpd)
            const { data } = await supabase.from('proyek_konstruksi').select('*').eq('id', selected.id).single()
            if (data) setSelected(data as Proyek)
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
                <tr>
                  <th className="table-th">Pekerjaan</th><th className="table-th">No Kontrak</th>
                  <th className="table-th">Status</th><th className="table-th"></th>
                </tr>
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
                    <td className="table-td text-right">
                      <button className="text-teal hover:underline text-xs font-medium" onClick={() => setSelected(p)}>Buka</button>
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

// ── Form buat paket ─────────────────────────────────────────────────────────
function CreateProyek({ skpdId, onSaved, onErr }: { skpdId: number; onSaved: () => void; onErr: (m: string) => void }) {
  const supabase = createClient()
  const [nama, setNama] = useState('')
  const [noKontrak, setNoKontrak] = useState('')
  const [tglKontrak, setTglKontrak] = useState('')
  const [nilaiKontrak, setNilaiKontrak] = useState('')
  const [kdp, setKdp] = useState<KodefikasiHasil | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim()) { onErr('Error: nama pekerjaan wajib.'); return }
    if (!kdp) { onErr('Error: pilih kode KDP (golongan 1.3.6) dulu.'); return }
    setSaving(true)
    const { error } = await supabase.from('proyek_konstruksi').insert({
      skpd_id: skpdId, nama_pekerjaan: nama, no_kontrak: noKontrak || null,
      tgl_kontrak: tglKontrak || null, nilai_kontrak: nilaiKontrak ? Number(nilaiKontrak) : null,
      kode_kdp: kdp.kode,
    })
    setSaving(false)
    if (error) onErr(`Error: ${error.message}`); else onSaved()
  }

  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nama Pekerjaan</label>
          <input required className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">No Kontrak</label>
          <input className="select-filter w-full" value={noKontrak} onChange={e => setNoKontrak(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tgl Kontrak</label>
          <input type="date" className="select-filter w-full" value={tglKontrak} onChange={e => setTglKontrak(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nilai Kontrak (Rp, opsional)</label>
          <input type="number" className="select-filter w-full" value={nilaiKontrak} onChange={e => setNilaiKontrak(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Kode KDP (pilih golongan 1.3.6 — Konstruksi Dalam Pengerjaan)</label>
        <KodefikasiPicker picked={kdp} onPick={setKdp} />
      </div>
      <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Buat Paket'}</button>
    </form>
  )
}

// ── Detail paket: termin + saldo + penyelesaian ─────────────────────────────
function ProyekDetail({ proyek, isAdmin, onBack, onChanged, onMsg }: {
  proyek: Proyek; isAdmin: boolean; onBack: () => void; onChanged: () => void; onMsg: (m: string) => void
}) {
  const supabase = createClient()
  const bounds = useDateBounds()
  const [termins, setTermins] = useState<Termin[]>([])
  const [saldo, setSaldo] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showBapp, setShowBapp] = useState(false)
  // form termin
  const [komponen, setKomponen] = useState('fisik')
  const [uraian, setUraian] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [nilai, setNilai] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('proyek_termin').select('*').eq('proyek_id', proyek.id).order('tanggal')
    setTermins((data || []) as Termin[])
    if (proyek.aset_kdp_id) {
      const { data: a } = await supabase.from('aset').select('nilai_perolehan').eq('id', proyek.aset_kdp_id).single()
      setSaldo(Number((a as { nilai_perolehan?: number } | null)?.nilai_perolehan || 0))
    } else setSaldo(0)
  }, [proyek.id, proyek.aset_kdp_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function tambahTermin(e: React.FormEvent) {
    e.preventDefault()
    if (!tanggal || !nilai) { onMsg('Error: tanggal & nilai termin wajib.'); return }
    setBusy(true)
    const { error } = await supabase.from('proyek_termin').insert({
      proyek_id: proyek.id, komponen, uraian: uraian || null, tanggal, nilai: Number(nilai),
    })
    setBusy(false)
    if (error) { onMsg(`Error: ${error.message}`); return }
    setUraian(''); setNilai(''); load()
  }

  async function approve(id: string) {
    setBusy(true); onMsg('')
    const { error } = await setujuiTermin(supabase, id)
    setBusy(false)
    if (error) onMsg(`Error: ${error}`); else { onMsg('Termin disetujui → masuk KDP.'); await load(); onChanged() }
  }
  async function batal(id: string) {
    if (!confirm('Batalkan termin yang sudah disetujui? Saldo KDP akan turun.')) return
    setBusy(true); onMsg('')
    const { error } = await batalTermin(supabase, id)
    setBusy(false)
    if (error) onMsg(`Error: ${error}`); else { onMsg('Termin dibatalkan.'); await load(); onChanged() }
  }
  async function hapusDraft(id: string) {
    if (!confirm('Hapus termin draft ini?')) return
    await supabase.from('proyek_termin').delete().eq('id', id)
    load()
  }

  const totalDisetujui = termins.filter(t => t.status === 'disetujui').reduce((s, t) => s + t.nilai, 0)

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Kembali ke daftar paket</button>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{proyek.nama_pekerjaan}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{proyek.no_kontrak || 'tanpa no kontrak'} · KDP {proyek.kode_kdp || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Saldo KDP</p>
            <p className="text-lg font-bold text-navy">{formatRupiah(saldo)}</p>
            <p className="text-[11px] text-gray-400">akumulasi disetujui {formatRupiah(totalDisetujui)}</p>
          </div>
        </div>
        {proyek.status === 'berjalan' && isAdmin && saldo > 0 && (
          <div className="mt-3">
            <button className="btn-primary" onClick={() => setShowBapp(true)}>Selesaikan (BAPP) →</button>
          </div>
        )}
        {proyek.status === 'selesai' && <p className="mt-3 text-sm text-teal">Paket selesai — saldo KDP habis direklas ke aset tetap.</p>}
      </div>

      {/* Tambah termin (selama berjalan) */}
      {proyek.status === 'berjalan' && (
        <form onSubmit={tambahTermin} className="card p-5 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komponen</label>
            <select className="select-filter w-full" value={komponen} onChange={e => setKomponen(e.target.value)}>
              {KOMPONEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Uraian</label>
            <input className="select-filter w-full" value={uraian} onChange={e => setUraian(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
            <input type="date" min={bounds.min} max={bounds.max} className="select-filter w-full" value={tanggal} onChange={e => setTanggal(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nilai (Rp)</label>
            <input type="number" className="select-filter w-full" value={nilai} onChange={e => setNilai(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-5">
            <button type="submit" disabled={busy} className="btn-primary text-sm py-1.5">+ Tambah Termin (draft)</button>
          </div>
        </form>
      )}

      {/* Daftar termin */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Komponen</th><th className="table-th">Uraian</th>
              <th className="table-th">Tanggal</th><th className="table-th text-right">Nilai</th>
              <th className="table-th">Status</th><th className="table-th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {termins.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Belum ada termin.</td></tr>
            ) : termins.map(t => (
              <tr key={t.id}>
                <td className="table-td text-xs">{komponenLabel(t.komponen)}</td>
                <td className="table-td text-xs text-gray-600">{t.uraian || '—'}</td>
                <td className="table-td text-xs text-gray-500">{t.tanggal}</td>
                <td className="table-td text-xs text-right">{formatRupiah(t.nilai)}</td>
                <td className="table-td">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'disetujui' ? 'bg-teal/10 text-teal' : 'bg-gray-100 text-gray-500'}`}>
                    {t.status === 'disetujui' ? 'Disetujui' : 'Draft'}
                  </span>
                </td>
                <td className="table-td whitespace-nowrap text-xs">
                  {t.status === 'draft' ? (
                    <>
                      {isAdmin && <button onClick={() => approve(t.id)} disabled={busy} className="text-teal hover:underline font-medium mr-3">Setujui</button>}
                      <button onClick={() => hapusDraft(t.id)} className="text-red-500 hover:text-red-700 font-medium">Hapus</button>
                    </>
                  ) : (
                    isAdmin && proyek.status === 'berjalan' && <button onClick={() => batal(t.id)} disabled={busy} className="text-red-500 hover:text-red-700 font-medium">Batalkan</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showBapp && (
        <PenyelesaianModal proyekId={proyek.id} saldo={saldo} bounds={bounds}
          onClose={() => setShowBapp(false)}
          onDone={async (m) => { setShowBapp(false); onMsg(m); await load(); onChanged() }} onErr={onMsg} />
      )}
    </div>
  )
}

// ── Modal Penyelesaian (BAPP): carve-out ────────────────────────────────────
type OutRow = { picked: KodefikasiHasil | null; nama: string; fisik: string; final: string }

function PenyelesaianModal({ proyekId, saldo, bounds, onClose, onDone, onErr }: {
  proyekId: string; saldo: number; bounds: { min: string; max: string }
  onClose: () => void; onDone: (m: string) => void; onErr: (m: string) => void
}) {
  const supabase = createClient()
  const [tglBapp, setTglBapp] = useState(bounds.max)
  const [final, setFinal] = useState(true)
  const [carve, setCarve] = useState(String(saldo))
  const [rows, setRows] = useState<OutRow[]>([{ picked: null, nama: '', fisik: '', final: '' }])
  const [saving, setSaving] = useState(false)

  const carveTotal = final ? saldo : (Number(carve) || 0)
  const sumFinal = rows.reduce((s, r) => s + (Number(r.final) || 0), 0)

  function setRow(i: number, patch: Partial<OutRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function alokasikan() {
    const fisik = rows.map(r => Number(r.fisik) || 0)
    const hasil = hitungAlokasi(carveTotal, fisik)
    setRows(rs => rs.map((r, i) => ({ ...r, final: String(hasil[i] ?? 0) })))
  }

  async function submit() {
    if (rows.some(r => !r.picked || !(Number(r.final) > 0))) { onErr('Error: tiap output butuh kode & nilai final > 0.'); return }
    if (Math.abs(sumFinal - carveTotal) > 0.5) { onErr(`Error: total output (${formatRupiah(sumFinal)}) harus = yang diselesaikan (${formatRupiah(carveTotal)}).`); return }
    if (carveTotal > saldo + 0.5) { onErr('Error: melebihi saldo KDP.'); return }
    setSaving(true)
    const outputs: OutputKdp[] = rows.map(r => ({ kode: r.picked!.kode, nama: r.nama || r.picked!.uraian || r.picked!.kode, nilai: Number(r.final) }))
    const { error } = await selesaikanProyek(supabase, { proyekId, tglBapp, outputs, final })
    setSaving(false)
    if (error) onErr(`Error: ${error}`); else onDone(final ? 'Paket selesai — aset tetap terbentuk.' : 'Penyelesaian sebagian tercatat.')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Penyelesaian (BAPP)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal BAPP</label>
            <input type="date" min={bounds.min} max={bounds.max} className="select-filter w-full" value={tglBapp} onChange={e => setTglBapp(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={final} onChange={e => setFinal(e.target.checked)} /> Penyelesaian final (habiskan saldo)
            </label>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Saldo KDP</label>
            <div className="select-filter w-full bg-gray-100">{formatRupiah(saldo)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Yang diselesaikan sekarang</label>
            <input type="number" disabled={final} className="select-filter w-full" value={final ? String(saldo) : carve} onChange={e => setCarve(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Output aset</p>
          <button type="button" onClick={alokasikan} className="text-xs text-teal hover:underline">Alokasikan biaya bersama otomatis</button>
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Output #{i + 1}</span>
                {rows.length > 1 && <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:text-red-700">Hapus</button>}
              </div>
              <KodefikasiPicker picked={r.picked} onPick={p => setRow(i, { picked: p, nama: r.nama || p?.uraian || '' })} />
              <div className="grid grid-cols-3 gap-2">
                <input className="select-filter" placeholder="Nama aset" value={r.nama} onChange={e => setRow(i, { nama: e.target.value })} />
                <input type="number" className="select-filter" placeholder="Nilai fisik langsung" value={r.fisik} onChange={e => setRow(i, { fisik: e.target.value })} />
                <input type="number" className="select-filter font-medium" placeholder="Nilai final" value={r.final} onChange={e => setRow(i, { final: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows(rs => [...rs, { picked: null, nama: '', fisik: '', final: '' }])}
          className="mt-2 text-sm text-teal hover:underline">+ Tambah output</button>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <span className={`text-sm ${Math.abs(sumFinal - carveTotal) > 0.5 ? 'text-red-600' : 'text-gray-600'}`}>
            Σ output {formatRupiah(sumFinal)} / {formatRupiah(carveTotal)}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3">Batal</button>
            <button onClick={submit} disabled={saving} className="btn-primary">{saving ? 'Memproses...' : 'Selesaikan'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
