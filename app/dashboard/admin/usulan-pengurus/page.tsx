'use client'
// Usulan Pengurus Barang (Fase 1). Satu route, dua tampilan by role:
//   - admin  → tinjau semua usulan per-SKPD → Setujui (RPC materialize ke
//              admin_pegawai) / Kembalikan (+catatan) → Cetak Lampiran SK.
//   - SKPD   → isi calon pengurus barang → Ajukan → Cetak Surat Usulan.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchApprovalScope, type ApprovalScope, SCOPE_KOSONG } from '@/lib/roles'
import {
  GOLONGAN_PANGKAT, pangkatDariGolongan, STATUS_LABEL, STATUS_BADGE, jkLabel, jkDariNip,
  PERAN_USULAN, peranLabel, type UsulanRow, type UsulanStatus,
} from '@/lib/usulanPengurus'
import type { SupabaseClient } from '@supabase/supabase-js'

type Skpd = { id: number; nama: string; parent_id: number | null; kode_skpd: string | null }
const COLS = 'id,skpd_id,nama,nip,pangkat,golongan,jabatan,jenis_kelamin,jenis,role_bmd,status,catatan_admin,no_usulan,tgl_usulan,created_at'
const byKode = (a: Skpd, b: Skpd) =>
  (a?.kode_skpd || '￿').localeCompare(b?.kode_skpd || '￿') || (a?.nama || '').localeCompare(b?.nama || '')

export default function UsulanPengurusPage() {
  const supabase = createClient()
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [ready, setReady] = useState(false)
  const [skpds, setSkpds] = useState<Skpd[]>([])
  const [rows, setRows] = useState<UsulanRow[]>([])
  const [loading, setLoading] = useState(true)

  const skpdMap = useMemo(() => {
    const m: Record<number, Skpd> = {}; for (const s of skpds) m[s.id] = s; return m
  }, [skpds])

  async function loadRows() {
    setLoading(true)
    const { data } = await supabase.from('admin_usulan_pengurus').select(COLS).order('created_at', { ascending: false })
    setRows((data || []) as UsulanRow[])
    setLoading(false)
  }
  useEffect(() => {
    (async () => {
      const sc = await fetchApprovalScope(supabase); setScope(sc); setReady(true)
      const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id,kode_skpd').limit(5000)
      setSkpds((data || []) as Skpd[])
      await loadRows()
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="p-6 text-sm text-gray-400">Memuat…</div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Usulan Pengurus Barang</h1>
      {scope.isAdmin
        ? <AdminView rows={rows} skpdMap={skpdMap} loading={loading} reload={loadRows} supabase={supabase} />
        : <SkpdView rows={rows} scope={scope} skpds={skpds} skpdMap={skpdMap} loading={loading} reload={loadRows} supabase={supabase} />}
    </div>
  )
}

const StatusBadge = ({ s }: { s: UsulanStatus }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>
)

// ══════════════════════════════ SISI SKPD ══════════════════════════════════
function SkpdView({ rows, scope, skpds, skpdMap, loading, reload, supabase }: {
  rows: UsulanRow[]; scope: ApprovalScope; skpds: Skpd[]; skpdMap: Record<number, Skpd>
  loading: boolean; reload: () => Promise<void>; supabase: SupabaseClient
}) {
  const allowedIds = useMemo(() => {
    const s = new Set<number>(); if (scope.skpdId != null) s.add(scope.skpdId); scope.bawahan.forEach(id => s.add(id)); return s
  }, [scope])
  const opsiSkpd = useMemo(() => skpds.filter(s => allowedIds.has(s.id)).sort(byKode), [skpds, allowedIds])

  const KOSONG = { skpd_id: scope.skpdId ? String(scope.skpdId) : '', role_bmd: 'pengurus_barang', nama: '', nip: '', golongan: '', jabatan: '', jenis_kelamin: '', no_usulan: '', tgl_usulan: '' }
  const [f, setF] = useState<Record<string, string>>(KOSONG)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }))
  const readonly = scope.isViewer

  async function simpan() {
    if (!f.skpd_id) { setMsg('Pilih SKPD.'); return }
    if (!f.nama.trim() || !f.nip.trim()) { setMsg('Nama & NIP wajib.'); return }
    if (!/^\d{18}$/.test(f.nip)) { setMsg('NIP harus tepat 18 angka, tanpa spasi.'); return }
    setBusy(true); setMsg('')
    const payload = {
      skpd_id: Number(f.skpd_id), nama: f.nama.trim(), nip: f.nip.trim(),
      golongan: f.golongan || null, pangkat: f.golongan ? pangkatDariGolongan(f.golongan) : null,
      jabatan: f.jabatan.trim() || null, jenis_kelamin: f.jenis_kelamin || null,
      role_bmd: f.role_bmd || 'pengurus_barang',
      no_usulan: f.no_usulan.trim() || null, tgl_usulan: f.tgl_usulan || null,
    }
    const { error } = editId
      ? await supabase.from('admin_usulan_pengurus').update(payload).eq('id', editId)
      : await supabase.from('admin_usulan_pengurus').insert({ ...payload, jenis: 'pengurus_barang', status: 'draft' })
    setBusy(false)
    if (error) { setMsg(`Gagal: ${error.message}`); return }
    setF({ ...KOSONG, skpd_id: f.skpd_id }); setEditId(null); await reload()
  }

  function edit(r: UsulanRow) {
    setEditId(r.id)
    setF({
      skpd_id: String(r.skpd_id), role_bmd: r.role_bmd || 'pengurus_barang', nama: r.nama, nip: r.nip, golongan: r.golongan || '',
      jabatan: r.jabatan || '', jenis_kelamin: r.jenis_kelamin || '',
      no_usulan: r.no_usulan || '', tgl_usulan: r.tgl_usulan || '',
    })
    setMsg('')
  }
  async function ajukan(id: string) {
    setBusy(true)
    const { error } = await supabase.from('admin_usulan_pengurus')
      .update({ status: 'diajukan', diajukan_at: new Date().toISOString() }).eq('id', id)
    setBusy(false); if (error) setMsg(`Gagal: ${error.message}`); else reload()
  }
  async function hapus(id: string) {
    setBusy(true)
    const { error } = await supabase.from('admin_usulan_pengurus').delete().eq('id', id)
    setBusy(false); if (error) setMsg(`Gagal: ${error.message}`); else reload()
  }

  // Kelompokkan baris milik user per SKPD.
  const perSkpd = useMemo(() => {
    const g = new Map<number, UsulanRow[]>()
    for (const r of rows) { const a = g.get(r.skpd_id) || []; a.push(r); g.set(r.skpd_id, a) }
    return [...g.entries()].sort((a, b) => byKode(skpdMap[a[0]] || ({} as Skpd), skpdMap[b[0]] || ({} as Skpd)))
  }, [rows, skpdMap])

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">Isi calon Pengurus Barang, lalu <b>Ajukan</b>. Setelah diajukan bisa cetak Surat Usulan; admin akan menyetujui atau mengembalikan.</p>

      {!readonly && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">{editId ? 'Ubah Usulan' : 'Tambah Calon Pengurus Barang'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">SKPD</label>
              <select className="select-filter w-full" value={f.skpd_id} onChange={e => set('skpd_id', e.target.value)}>
                <option value="">— pilih SKPD —</option>
                {opsiSkpd.map(s => <option key={s.id} value={s.id}>{s.kode_skpd ? `${s.kode_skpd} · ` : ''}{s.nama}</option>)}
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Peran yang Diusulkan</label>
              <select className="select-filter w-full" value={f.role_bmd} onChange={e => set('role_bmd', e.target.value)}>
                {PERAN_USULAN.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Nama <span className="text-gray-400">(sertakan gelar sesuai EYD)</span></label>
              <input className="select-filter w-full" value={f.nama} onChange={e => set('nama', e.target.value)} placeholder="mis. Budi Santoso, S.E., M.M." />
              <p className="text-[11px] text-gray-400 mt-1">Tulis gelar lengkap & ejaan yang benar, mis. <b>Dr. Siti Aminah, S.H., M.H.</b></p></div>
            <div><label className="block text-xs text-gray-500 mb-1">NIP <span className="text-gray-400">(18 angka, tanpa spasi)</span></label>
              <input className="select-filter w-full" inputMode="numeric" maxLength={18} value={f.nip}
                onChange={e => set('nip', e.target.value.replace(/\D/g, ''))} placeholder="200110042023021001" />
              <p className="text-[11px] text-gray-400 mt-1">Format: tgl lahir (8) + TMT ASN (6) + kelamin (1&nbsp;=&nbsp;L, 2&nbsp;=&nbsp;P) + nomor urut (3). Contoh <b>2001&nbsp;10&nbsp;04&nbsp;·&nbsp;2023&nbsp;02&nbsp;·&nbsp;1&nbsp;·&nbsp;001</b> = lahir 4&nbsp;Okt&nbsp;2001, ASN Feb&nbsp;2023, laki-laki. PPPK juga 18 angka. <b>3 digit terakhir</b> = nomor urut dari masing-masing kantor.</p></div>
            <div><label className="block text-xs text-gray-500 mb-1">Golongan / Pangkat</label>
              <select className="select-filter w-full" value={f.golongan} onChange={e => set('golongan', e.target.value)}>
                <option value="">— pilih golongan —</option>
                {GOLONGAN_PANGKAT.map(g => <option key={g.golongan} value={g.golongan}>{g.golongan} — {g.pangkat}</option>)}
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Jabatan</label>
              <input className="select-filter w-full" value={f.jabatan} onChange={e => set('jabatan', e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Jenis Kelamin</label>
              <select className="select-filter w-full" value={f.jenis_kelamin} onChange={e => set('jenis_kelamin', e.target.value)}>
                <option value="">—</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
              </select>
              {jkDariNip(f.nip) && f.jenis_kelamin && jkDariNip(f.nip) !== f.jenis_kelamin && (
                <p className="text-[11px] text-amber-600 mt-1">⚠ Menurut NIP (digit ke-15 = {f.nip[14]}), harusnya <b>{jkDariNip(f.nip) === 'L' ? 'Laki-laki' : 'Perempuan'}</b>. Cek lagi NIP / pilihan kelamin.</p>
              )}</div>
            <div><label className="block text-xs text-gray-500 mb-1">No. Surat Usulan <span className="text-gray-400">(opsional)</span></label>
              <input className="select-filter w-full" value={f.no_usulan} onChange={e => set('no_usulan', e.target.value)} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Tgl Usulan <span className="text-gray-400">(opsional)</span></label>
              <input type="date" className="select-filter w-full" value={f.tgl_usulan} onChange={e => set('tgl_usulan', e.target.value)} /></div>
          </div>
          {msg && <p className="text-xs text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-sm" disabled={busy} onClick={simpan}>{editId ? 'Simpan Perubahan' : '+ Tambah ke Daftar'}</button>
            {editId && <button className="btn-secondary text-sm" onClick={() => { setEditId(null); setF({ ...KOSONG, skpd_id: f.skpd_id }) }}>Batal</button>}
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-400">Memuat…</p>
        : perSkpd.length === 0 ? <p className="text-sm text-gray-400">Belum ada usulan.</p>
        : perSkpd.map(([sid, list]) => (
          <div key={sid} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
              <p className="text-sm font-semibold text-gray-700">{skpdMap[sid]?.kode_skpd ? `${skpdMap[sid]?.kode_skpd} · ` : ''}{skpdMap[sid]?.nama || `SKPD #${sid}`}</p>
              {list.some(r => r.status === 'diajukan' || r.status === 'disetujui') && (
                <Link href={`/cetak/usulan-pengurus?skpd=${sid}`} target="_blank" className="btn-secondary text-xs">🖨 Cetak Surat Usulan</Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100"><tr>
                  <th className="table-th">Nama / NIP</th><th className="table-th">Gol / Pangkat</th>
                  <th className="table-th">Jabatan</th><th className="table-th">Peran</th><th className="table-th">JK</th>
                  <th className="table-th">Status</th><th className="table-th"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {list.map(r => (
                    <tr key={r.id}>
                      <td className="table-td"><p className="text-xs font-medium text-gray-800">{r.nama}</p><p className="text-[11px] text-gray-400">{r.nip}</p></td>
                      <td className="table-td text-xs text-gray-600">{r.golongan || '-'}{r.pangkat ? ` · ${r.pangkat}` : ''}</td>
                      <td className="table-td text-xs text-gray-600">{r.jabatan || '-'}</td>
                      <td className="table-td text-xs text-gray-600">{peranLabel(r.role_bmd)}</td>
                      <td className="table-td text-xs text-gray-600">{r.jenis_kelamin || '-'}</td>
                      <td className="table-td"><StatusBadge s={r.status} />{r.status === 'dikembalikan' && r.catatan_admin && <p className="text-[11px] text-red-500 mt-1 max-w-[220px]">↩ {r.catatan_admin}</p>}</td>
                      <td className="table-td text-right whitespace-nowrap">
                        {!readonly && (r.status === 'draft' || r.status === 'dikembalikan') && (
                          <>
                            <button className="text-xs text-teal hover:underline mr-3" disabled={busy} onClick={() => ajukan(r.id)}>Ajukan</button>
                            <button className="text-xs text-gray-500 hover:underline mr-3" onClick={() => edit(r)}>Ubah</button>
                            <button className="text-xs text-red-500 hover:underline" disabled={busy} onClick={() => hapus(r.id)}>Hapus</button>
                          </>
                        )}
                        {r.status === 'diajukan' && <span className="text-[11px] text-gray-400">menunggu admin</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  )
}

// ══════════════════════════════ SISI ADMIN ═════════════════════════════════
function AdminView({ rows, skpdMap, loading, reload, supabase }: {
  rows: UsulanRow[]; skpdMap: Record<number, Skpd>
  loading: boolean; reload: () => Promise<void>; supabase: SupabaseClient
}) {
  const [filter, setFilter] = useState<UsulanStatus | 'semua'>('diajukan')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tolakId, setTolakId] = useState<string | null>(null)
  const [catatan, setCatatan] = useState('')

  const shown = useMemo(() => filter === 'semua' ? rows : rows.filter(r => r.status === filter), [rows, filter])
  const perSkpd = useMemo(() => {
    const g = new Map<number, UsulanRow[]>()
    for (const r of shown) { const a = g.get(r.skpd_id) || []; a.push(r); g.set(r.skpd_id, a) }
    return [...g.entries()].sort((a, b) => byKode(skpdMap[a[0]] || ({} as Skpd), skpdMap[b[0]] || ({} as Skpd)))
  }, [shown, skpdMap])

  async function setuju(id: string) {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('fn_setujui_usulan_pengurus', { p_id: id })
    setBusy(false); if (error) setMsg(`Gagal setujui: ${error.message}`); else reload()
  }
  async function batalSetuju(id: string) {
    if (!window.confirm('Batalkan persetujuan? Usulan kembali ke status "Diajukan" (bisa disetujui ulang atau dikembalikan ke SKPD). Jika pegawai ini BARU dibuat dari persetujuan ini (dan belum punya akun), datanya di Daftar Pegawai ikut dihapus.')) return
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('fn_batal_setujui_usulan_pengurus', { p_id: id })
    setBusy(false); if (error) setMsg(`Gagal batal setujui: ${error.message}`); else reload()
  }
  async function kembalikan() {
    if (!tolakId) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('admin_usulan_pengurus')
      .update({ status: 'dikembalikan', catatan_admin: catatan.trim() || 'Dikembalikan untuk diperbaiki.' }).eq('id', tolakId)
    setBusy(false); setTolakId(null); setCatatan('')
    if (error) setMsg(`Gagal: ${error.message}`); else reload()
  }

  const FILTERS: (UsulanStatus | 'semua')[] = ['diajukan', 'disetujui', 'dikembalikan', 'semua']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg ${filter === s ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'semua' ? 'Semua' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Link href="/cetak/lampiran-sk-pengurus" target="_blank" className="btn-primary text-xs">🖨 Cetak Lampiran SK</Link>
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}

      {loading ? <p className="text-sm text-gray-400">Memuat…</p>
        : perSkpd.length === 0 ? <p className="text-sm text-gray-400">Tidak ada usulan pada filter ini.</p>
        : perSkpd.map(([sid, list]) => (
          <div key={sid} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <p className="text-sm font-semibold text-gray-700">{skpdMap[sid]?.kode_skpd ? `${skpdMap[sid]?.kode_skpd} · ` : ''}{skpdMap[sid]?.nama || `SKPD #${sid}`}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100"><tr>
                  <th className="table-th">Nama / NIP</th><th className="table-th">Gol / Pangkat</th>
                  <th className="table-th">Jabatan</th><th className="table-th">Peran</th><th className="table-th">JK</th>
                  <th className="table-th">Status</th><th className="table-th"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {list.map(r => (
                    <tr key={r.id}>
                      <td className="table-td"><p className="text-xs font-medium text-gray-800">{r.nama}</p><p className="text-[11px] text-gray-400">{r.nip}</p></td>
                      <td className="table-td text-xs text-gray-600">{r.golongan || '-'}{r.pangkat ? ` · ${r.pangkat}` : ''}</td>
                      <td className="table-td text-xs text-gray-600">{r.jabatan || '-'}</td>
                      <td className="table-td text-xs text-gray-600">{peranLabel(r.role_bmd)}</td>
                      <td className="table-td text-xs text-gray-600">{jkLabel(r.jenis_kelamin)}</td>
                      <td className="table-td"><StatusBadge s={r.status} /></td>
                      <td className="table-td text-right whitespace-nowrap">
                        {r.status === 'diajukan' && (
                          <>
                            <button className="text-xs text-teal hover:underline mr-3" disabled={busy} onClick={() => setuju(r.id)}>✓ Setujui</button>
                            <button className="text-xs text-red-500 hover:underline" disabled={busy} onClick={() => { setTolakId(r.id); setCatatan('') }}>↩ Kembalikan</button>
                          </>
                        )}
                        {r.status === 'disetujui' && (
                          <button className="text-xs text-amber-600 hover:underline" disabled={busy} onClick={() => batalSetuju(r.id)}>↶ Batal Setujui</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {tolakId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTolakId(null)}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-800">Kembalikan Usulan</h3></div>
            <div className="p-5 space-y-2">
              <label className="block text-xs text-gray-500">Catatan / alasan (dikirim ke SKPD)</label>
              <textarea className="select-filter w-full h-24" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="mis. NIP tidak sesuai, mohon diperbaiki." />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setTolakId(null)}>Batal</button>
              <button className="btn-primary text-sm" disabled={busy} onClick={kembalikan}>Kembalikan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
