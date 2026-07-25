'use client'
// Detail Inventarisasi — daftar lembar kerja (LKI) per barang + alur
// draft → diajukan → divalidasi / dikembalikan.
//
// NON-LEDGER: menyimpan lembar TIDAK mengubah `aset` sama sekali (termasuk
// kondisi_barang). Temuan disimpan di inventarisasi_baris.jawaban; kolom
// "sebelum" diambil dari snapshot yang dibekukan saat generate.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import LkiForm from '@/components/inventarisasi/LkiForm'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import { formatRupiah } from '@/lib/export'
import {
  STATUS_LABEL, STATUS_BADGE, konfigLki, klasifikasiLhi, sudahDiisi, normalKondisi,
  type InvHeader, type InvBaris, type InvJawaban, type Petugas,
} from '@/lib/inventarisasi'

const HDR_COLS = 'id,skpd_id,tahun,golongan,status,catatan_validator,petugas,keterangan,diajukan_at,divalidasi_at,created_at'
type PegawaiRow = { id: string; nama: string; nip: string | null; jabatan: string | null }

export default function DetailInventarisasiPage() {
  const supabase = createClient()
  const params = useParams<{ id: string }>()
  const id = params?.id as string

  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [hdr, setHdr] = useState<InvHeader | null>(null)
  const [baris, setBaris] = useState<InvBaris[]>([])
  const [pegawai, setPegawai] = useState<PegawaiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<InvBaris | null>(null)
  const [pilihPegawai, setPilihPegawai] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: h }, sc] = await Promise.all([
      supabase.from('inventarisasi').select(`${HDR_COLS},skpd:admin_skpd(nama)`).eq('id', id).maybeSingle(),
      fetchApprovalScope(supabase),
    ])
    setScope(sc)
    const header = (h as never as InvHeader) || null
    setHdr(header)

    const rows: InvBaris[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('inventarisasi_baris')
        .select('id,inventarisasi_id,aset_id,snapshot,jawaban,foto_paths')
        .eq('inventarisasi_id', id).order('created_at').range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as never as InvBaris[]))
      if (data.length < 1000) break
    }
    setBaris(rows)

    if (header?.skpd_id) {
      const { data: pg } = await supabase.from('admin_pegawai')
        .select('id,nama,nip,jabatan').eq('skpd_id', header.skpd_id).order('nama')
      setPegawai((pg as PegawaiRow[]) || [])
    }
    setLoading(false)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (id) load() }, [id, load])

  const config = useMemo(() => konfigLki(hdr?.golongan || ''), [hdr?.golongan])
  const terisi = useMemo(() => baris.filter(sudahDiisi).length, [baris])
  const isAdmin = scope.isAdmin
  // SKPD hanya boleh mengubah selama belum divalidasi (ditegakkan juga oleh RLS).
  const bolehEdit = !!hdr && hdr.status !== 'divalidasi'
  const readOnly = !bolehEdit

  async function simpanPetugas(next: Petugas[]) {
    const { error } = await supabase.from('inventarisasi').update({ petugas: next }).eq('id', id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setHdr(h => (h ? { ...h, petugas: next } : h))
  }

  async function simpanLembar(b: InvBaris, jawaban: InvJawaban, fotoPaths: string[]) {
    const { error } = await supabase.from('inventarisasi_baris')
      .update({ jawaban, foto_paths: fotoPaths }).eq('id', b.id)
    if (error) throw new Error(error.message)
    setBaris(prev => prev.map(x => (x.id === b.id ? { ...x, jawaban, foto_paths: fotoPaths } : x)))
    setMsg('Lembar kerja tersimpan.')
  }

  async function tambahBelumTercatat() {
    const { data, error } = await supabase.from('inventarisasi_baris')
      .insert({ inventarisasi_id: id, aset_id: null, snapshot: {}, jawaban: {} })
      .select('id,inventarisasi_id,aset_id,snapshot,jawaban,foto_paths').single()
    if (error) { setMsg(`Error: ${error.message}`); return }
    const b = data as never as InvBaris
    setBaris(prev => [...prev, b])
    setEdit(b)
  }

  async function hapusBaris(b: InvBaris) {
    if (!confirm('Hapus lembar "BMD Belum Tercatat" ini?')) return
    const { error } = await supabase.from('inventarisasi_baris').delete().eq('id', b.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setBaris(prev => prev.filter(x => x.id !== b.id))
  }

  async function ajukan() {
    const belum = baris.length - terisi
    if (belum > 0 && !confirm(`Masih ada ${belum} barang yang belum diisi. Tetap ajukan?`)) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('inventarisasi')
      .update({ status: 'diajukan', diajukan_at: new Date().toISOString() }).eq('id', id)
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Inventarisasi diajukan — menunggu validasi pengelola.')
    load()
  }

  async function validasi() {
    if (!confirm('Validasi inventarisasi ini? Setelah divalidasi, SKPD tidak bisa mengubahnya lagi.')) return
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('fn_validasi_inventarisasi', { p_id: id, p_catatan: null })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Inventarisasi divalidasi.')
    load()
  }

  async function kembalikan() {
    const alasan = prompt('Alasan dikembalikan ke pengurus barang:')
    if (!alasan || !alasan.trim()) return
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('fn_kembalikan_inventarisasi', { p_id: id, p_catatan: alasan.trim() })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Inventarisasi dikembalikan untuk dibenahi.')
    load()
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Memuat...</div>
  if (!hdr) return <div className="p-6 text-sm text-gray-500">Inventarisasi tidak ditemukan.</div>

  return (
    <FormShell
      judul={`Inventarisasi ${config.label} ${hdr.tahun}`}
      deskripsi={`${hdr.skpd?.nama || `SKPD #${hdr.skpd_id}`} · Format lembar kerja ${config.format}`}
      msg={msg}
      headerRight={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventarisasi" className="btn-secondary text-sm">← Daftar</Link>
          <a href={`/cetak/inventarisasi-lki?inv=${id}`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
            🖨 Cetak LKI
          </a>
        </div>
      }
    >
      {/* Ringkasan + aksi status */}
      <div className="card p-5 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[hdr.status]}`}>
            {STATUS_LABEL[hdr.status]}
          </span>
          <span className="text-sm text-gray-600">
            {terisi.toLocaleString('id-ID')} dari {baris.length.toLocaleString('id-ID')} barang sudah diperiksa
          </span>
          <div className="ml-auto flex items-center gap-2">
            {bolehEdit && (hdr.status === 'draft' || hdr.status === 'dikembalikan') && (
              <button onClick={ajukan} disabled={busy} className="btn-primary text-sm">
                {busy ? 'Memproses...' : 'Ajukan ke Pengelola'}
              </button>
            )}
            {isAdmin && hdr.status === 'diajukan' && (
              <button onClick={validasi} disabled={busy} className="btn-primary text-sm">✓ Validasi</button>
            )}
            {isAdmin && (hdr.status === 'diajukan' || hdr.status === 'divalidasi') && (
              <button onClick={kembalikan} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">
                Kembalikan
              </button>
            )}
          </div>
        </div>
        {hdr.catatan_validator && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
            <b>Catatan pengelola:</b> {hdr.catatan_validator}
          </div>
        )}

        {/* Petugas — satu tim per inventarisasi, diambil dari admin_pegawai */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Pelaksana / Petugas Inventarisasi</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(hdr.petugas || []).length === 0 && <span className="text-xs text-gray-400">Belum ada petugas.</span>}
            {(hdr.petugas || []).map(p => (
              <span key={p.pegawai_id} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1.5">
                {p.nama}{p.nip ? ` · ${p.nip}` : ''}
                {bolehEdit && (
                  <button className="text-gray-400 hover:text-red-600"
                    onClick={() => simpanPetugas((hdr.petugas || []).filter(x => x.pegawai_id !== p.pegawai_id))}>×</button>
                )}
              </span>
            ))}
          </div>
          {bolehEdit && (
            <div className="flex items-center gap-2">
              <select className="select-filter text-xs max-w-md" value={pilihPegawai}
                onChange={e => setPilihPegawai(e.target.value)}>
                <option value="">— pilih pegawai —</option>
                {pegawai.filter(p => !(hdr.petugas || []).some(x => x.pegawai_id === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.nama}{p.nip ? ` — ${p.nip}` : ''}</option>
                ))}
              </select>
              <button className="btn-secondary text-xs" disabled={!pilihPegawai}
                onClick={() => {
                  const p = pegawai.find(x => x.id === pilihPegawai)
                  if (!p) return
                  simpanPetugas([...(hdr.petugas || []), { pegawai_id: p.id, nama: p.nama, nip: p.nip, jabatan: p.jabatan }])
                  setPilihPegawai('')
                }}>+ Tambah</button>
            </div>
          )}
        </div>
      </div>

      {bolehEdit && (
        <div className="mb-3">
          <button onClick={tambahBelumTercatat} className="btn-secondary text-xs">
            + Tambah BMD Belum Tercatat (Format III.A.7)
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">NIBAR</th>
                <th className="table-th">Nama / Spesifikasi</th>
                <th className="table-th whitespace-nowrap text-right">Nilai Perolehan</th>
                <th className="table-th whitespace-nowrap">Kondisi Awal</th>
                <th className="table-th whitespace-nowrap">Status</th>
                <th className="table-th">Masuk Laporan</th>
                <th className="table-th whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {baris.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">
                  Tidak ada barang pada golongan ini untuk SKPD tersebut.
                </td></tr>
              ) : baris.map(b => {
                const lhi = klasifikasiLhi(b)
                const isi = sudahDiisi(b)
                return (
                  <tr key={b.id}>
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">
                      {b.aset_id ? (b.snapshot?.nibar || '—') : <span className="italic text-amber-600">Belum tercatat</span>}
                    </td>
                    <td className="table-td text-xs">
                      <p className="font-medium">{b.aset_id ? (b.snapshot?.uraian_barang || '-') : (b.jawaban?.baru?.nama_barang || '(belum diisi)')}</p>
                      <p className="text-gray-400">{b.aset_id ? (b.snapshot?.nama_barang || '') : (b.jawaban?.baru?.spesifikasi || '')}</p>
                    </td>
                    <td className="table-td text-xs text-right whitespace-nowrap">
                      {formatRupiah(b.aset_id ? (b.snapshot?.nilai_perolehan || 0) : (b.jawaban?.baru?.nilai_perolehan || 0))}
                    </td>
                    <td className="table-td text-xs text-gray-500">{normalKondisi(b.snapshot?.kondisi) || '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${isi ? 'bg-teal/10 text-teal' : 'bg-gray-100 text-gray-500'}`}>
                        {isi ? 'Terisi' : 'Belum'}
                      </span>
                    </td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        {lhi.length === 0 ? <span className="text-[11px] text-gray-300">—</span>
                          : lhi.map(k => (
                            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{k}</span>
                          ))}
                      </div>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <button onClick={() => setEdit(b)} className="text-teal hover:underline text-xs font-medium">
                        {readOnly ? 'Lihat' : 'Isi LKI'}
                      </button>
                      {!b.aset_id && bolehEdit && (
                        <button onClick={() => hapusBaris(b)} className="ml-3 text-red-500 hover:text-red-700 text-xs">Hapus</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <LkiForm
          baris={edit}
          config={config}
          readOnly={readOnly}
          onSimpan={(jawaban, fotoPaths) => simpanLembar(edit, jawaban, fotoPaths)}
          onTutup={() => setEdit(null)}
        />
      )}
    </FormShell>
  )
}
