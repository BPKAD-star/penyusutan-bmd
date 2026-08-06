'use client'
// Dokumen Sumber — arsip dokumen legal (SK, BAST, perjanjian) per Tahun x
// Siklus BMD (lihat lib/dokumenSiklus.ts utk daftar 11 siklus). Drill-down:
// kartu Tahun -> kartu Siklus -> isi (pull read-only dari modul lain, upload
// generik, atau placeholder kosong). Role 3 tingkat diturunkan dari struktur
// SKPD (lihat migrasi 20260710_01_dokumen_siklus.sql, di-rename ke
// admin_dokumen oleh migrasi 20260710_02):
//   - Super Admin (BKAD)            -> upload semua siklus generik.
//   - Admin SKPD induk (py sub-OPD) -> upload HANYA siklus Pengamanan, subtree sendiri.
//   - Non-admin                     -> lihat & download saja.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import { tahunAwal } from '@/lib/tahunKerja'
import SkpdCombobox from '@/components/SkpdCombobox'
import { fetchApprovalScope } from '@/lib/roles'
import { DAFTAR_SIKLUS, SiklusConfig, SumberDokumen } from '@/lib/dokumenSiklus'
import { uploadDokumenSiklus, hapusFileDokumen, bukaDokumenSumber, namaFileDariPath } from '@/lib/dokumenStorage'

type GenericDoc = {
  id: string; sub_jenis: string | null; skpd_id: number | null
  judul: string; keterangan: string | null; file_path: string; created_at: string
}
type PulledRow = {
  id: string; no_sk: string; tanggal: string; skpd_id: number; skpd_tujuan: number | null; dokumen: string[]
}

export default function DokumenSumber() {
  const supabase = createClient()
  const tahunMap = useTahunBukuMap()
  const tahunList = Object.keys(tahunMap).map(Number).sort((a, b) => b - a)

  const [tahun, setTahun] = useState<number | null>(null)
  const [siklus, setSiklus] = useState<SiklusConfig | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)
  const [adminInduk, setAdminInduk] = useState(false)
  const [mySkpdId, setMySkpdId] = useState<number | null>(null)
  const [skpdMap, setSkpdMap] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    if (tahun === null && tahunList.length > 0) {
      const stored = Number(tahunAwal(String(tahunList[0])))
      setTahun(tahunList.includes(stored) ? stored : tahunList[0])
    }
  }, [tahunMap]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      // ⚠️ Dulu berkas ini query `profiles` & `skpd` — dua tabel yang TIDAK ADA
      // (namanya `admin_profiles` & `admin_skpd`; lihat docs/insiden.md INS-19).
      // Karena `error`-nya ditelan, gagalnya senyap: isAdmin selalu false &
      // nama SKPD selalu jatuh ke "SKPD #12". Peran dibaca lewat helper bersama
      // supaya definisi "admin" tak lagi punya salinan kedua di sini.
      const scope = await fetchApprovalScope(supabase)
      setIsAdmin(scope.isAdmin)
      setMySkpdId(scope.skpdId)
      const { data: induk } = await supabase.rpc('fn_skpd_admin_induk')
      setAdminInduk(!!induk)
    })()
    ;(async () => {
      const map = new Map<number, string>()
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) map.set(s.id, s.nama)
        if (data.length < 1000) break
      }
      setSkpdMap(map)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dokumen Sumber</h1>
        <p className="text-gray-500 text-sm mt-1">
          Arsip dokumen legal (SK, BAST, perjanjian) per tahun & siklus pengelolaan BMD.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm mb-4">
        <button onClick={() => setSiklus(null)}
          className={!siklus ? 'font-semibold text-gray-800' : 'text-gray-400 hover:underline'}>
          Tahun {tahun ?? '...'}
        </button>
        {siklus && <><span className="text-gray-300">/</span><span className="font-semibold text-gray-800">{siklus.label}</span></>}
      </div>

      {tahunList.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada tahun buku terdaftar.</div>
      ) : tahun === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
      ) : !siklus ? (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {tahunList.map(t => (
              <button key={t} onClick={() => setTahun(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  t === tahun ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:border-teal'
                }`}>
                {t} {tahunMap[t] === 'terkunci' && <span className="ml-1 opacity-70" title="Tahun terkunci">🔒</span>}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {DAFTAR_SIKLUS.map(s => (
              <button key={s.key} onClick={() => setSiklus(s)}
                className="card p-4 text-left hover:border-teal border border-transparent transition-colors">
                <p className="font-semibold text-gray-800 text-sm">{s.label}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{s.sumber.map(x => x.label).join(' · ')}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <button className="btn-secondary text-xs" onClick={() => setSiklus(null)}>← Kembali ke Siklus</button>
          {siklus.sumber.map((sm, i) => (
            <SumberSection key={i} tahun={tahun} sumber={sm}
              isAdmin={isAdmin} adminInduk={adminInduk} mySkpdId={mySkpdId} skpdMap={skpdMap} />
          ))}
        </div>
      )}
    </div>
  )
}

function SumberSection({ tahun, sumber, isAdmin, adminInduk, mySkpdId, skpdMap }: {
  tahun: number; sumber: SumberDokumen
  isAdmin: boolean; adminInduk: boolean; mySkpdId: number | null; skpdMap: Map<number, string>
}) {
  if (sumber.tipe === 'kosong') {
    return (
      <div className="card p-8 text-center text-gray-400 text-sm">{sumber.label}</div>
    )
  }
  if (sumber.tipe === 'generic') {
    return (
      <GenericSection tahun={tahun} sumber={sumber} isAdmin={isAdmin} adminInduk={adminInduk}
        mySkpdId={mySkpdId} skpdMap={skpdMap} />
    )
  }
  const kategori = sumber.tipe === 'pull_pengadaan' ? 'pengadaan'
    : sumber.tipe === 'pull_pengalihan' ? 'pengalihan_status' : 'penghapusan'
  return <PullSection tahun={tahun} label={sumber.label} kategori={kategori} skpdMap={skpdMap} />
}

// ── Sumber yang TARIK read-only dari jurnal_header modul lain ───────────────
function PullSection({ tahun, label, kategori, skpdMap }: {
  tahun: number; label: string; kategori: 'pengadaan' | 'pengalihan_status' | 'penghapusan'
  skpdMap: Map<number, string>
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<PulledRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,skpd_id,skpd_tujuan,payload,approval_status')
      .eq('kategori', kategori)
      .like('periode', `${tahun}-%`)
      .order('tanggal', { ascending: false })
    if (kategori === 'pengadaan') q = q.eq('approval_status', 'disetujui')
    const { data } = await q
    const list = ((data || []) as unknown as {
      id: string; no_sk: string; tanggal: string; skpd_id: number; skpd_tujuan: number | null
      payload: { dokumen_paths?: string[] } | null
    }[])
      .map(h => ({ id: h.id, no_sk: h.no_sk, tanggal: h.tanggal, skpd_id: h.skpd_id, skpd_tujuan: h.skpd_tujuan, dokumen: h.payload?.dokumen_paths || [] }))
      .filter(h => h.dokumen.length > 0)
    setRows(list)
    setLoading(false)
  }, [tahun, kategori]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-800 text-sm mb-3">{label}</h3>
      {loading ? (
        <p className="text-xs text-gray-400">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada dokumen untuk tahun {tahun}.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="border border-gray-100 rounded-lg p-3 flex flex-wrap items-start justify-between gap-3">
              <div className="text-xs text-gray-600">
                <p className="font-medium text-gray-800">{r.no_sk} <span className="text-gray-400 font-normal">· {r.tanggal}</span></p>
                <p className="text-gray-400">
                  {skpdMap.get(r.skpd_id) || `SKPD #${r.skpd_id}`}
                  {kategori === 'pengalihan_status' && r.skpd_tujuan ? ` → ${skpdMap.get(r.skpd_tujuan) || `SKPD #${r.skpd_tujuan}`}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {r.dokumen.map(p => (
                  <button key={p} onClick={() => bukaDokumenSumber(p)} className="underline text-teal text-xs hover:opacity-80">
                    {namaFileDariPath(p)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sumber generik: upload baru ke tabel admin_dokumen ──────────────────────
function GenericSection({ tahun, sumber, isAdmin, adminInduk, mySkpdId, skpdMap }: {
  tahun: number
  sumber: Extract<SumberDokumen, { tipe: 'generic' }>
  isAdmin: boolean; adminInduk: boolean; mySkpdId: number | null; skpdMap: Map<number, string>
}) {
  const supabase = createClient()
  const [docs, setDocs] = useState<GenericDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [judul, setJudul] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [subJenis, setSubJenis] = useState(sumber.subJenisOptions?.[0]?.value || '')
  const [docSkpd, setDocSkpd] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const canUpload = isAdmin || (sumber.scope === 'per_skpd' && adminInduk)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('admin_dokumen')
      .select('id,sub_jenis,skpd_id,judul,keterangan,file_path,created_at')
      .eq('tahun', tahun).eq('siklus', sumber.dbSiklus)
      .order('created_at', { ascending: false })
    setDocs((data as unknown as GenericDoc[]) || [])
    setLoading(false)
  }, [tahun, sumber.dbSiklus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (sumber.scope === 'per_skpd' && adminInduk && mySkpdId) setDocSkpd(String(mySkpdId))
  }, [sumber.scope, adminInduk, mySkpdId])

  async function tambah() {
    if (!judul.trim()) { setErr('Judul dokumen wajib diisi.'); return }
    if (!file) { setErr('File PDF wajib dipilih.'); return }
    if (sumber.scope === 'per_skpd' && !docSkpd) { setErr('SKPD wajib dipilih.'); return }
    setErr(''); setSaving(true)
    const { path, error: upErr } = await uploadDokumenSiklus(file, tahun, sumber.dbSiklus)
    if (upErr) { setErr(`Gagal upload: ${upErr.message}`); setSaving(false); return }
    const { error } = await supabase.from('admin_dokumen').insert({
      tahun, siklus: sumber.dbSiklus,
      sub_jenis: sumber.subJenisOptions ? subJenis : null,
      skpd_id: sumber.scope === 'per_skpd' ? Number(docSkpd) : null,
      judul: judul.trim(), keterangan: keterangan.trim() || null, file_path: path,
    })
    if (error) { await hapusFileDokumen(path); setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setJudul(''); setKeterangan(''); setFile(null); setSaving(false); setFormOpen(false)
    load()
  }

  async function hapus(d: GenericDoc) {
    if (!confirm(`Hapus dokumen "${d.judul}"?`)) return
    await hapusFileDokumen(d.file_path)
    const { error } = await supabase.from('admin_dokumen').delete().eq('id', d.id)
    if (error) { setErr(error.message); return }
    load()
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm">{sumber.label}</h3>
        {canUpload && (
          <button className="btn-primary text-xs" onClick={() => { setErr(''); setFormOpen(o => !o) }}>
            {formOpen ? 'Batal' : '+ Tambah'}
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-4 p-4 border border-gray-100 rounded-lg space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Judul Dokumen</label>
            <input className="select-filter w-full" value={judul} onChange={e => setJudul(e.target.value)}
              placeholder="mis. SK Bupati No. 100.3.3.2/74/418.08/2026" />
          </div>
          {sumber.subJenisOptions && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis</label>
              <select className="select-filter w-full" value={subJenis} onChange={e => setSubJenis(e.target.value)}>
                {sumber.subJenisOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {sumber.scope === 'per_skpd' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKPD</label>
              <SkpdCombobox lockToOperator value={docSkpd} onChange={setDocSkpd} placeholder="Ketik nama SKPD..." />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">File PDF</label>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end">
            <button className="btn-primary text-xs" onClick={tambah} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Memuat...</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada dokumen untuk tahun {tahun}.</p>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d.id} className="border border-gray-100 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="text-xs text-gray-600">
                <p className="font-medium text-gray-800">
                  {d.judul}
                  {d.sub_jenis && <span className="text-gray-400 font-normal"> · {sumber.subJenisOptions?.find(o => o.value === d.sub_jenis)?.label || d.sub_jenis}</span>}
                </p>
                <p className="text-gray-400">
                  {d.skpd_id ? (skpdMap.get(d.skpd_id) || `SKPD #${d.skpd_id}`) : 'Kabupaten'} · {d.created_at.slice(0, 10)}
                </p>
                {d.keterangan && <p className="text-gray-400">{d.keterangan}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => bukaDokumenSumber(d.file_path)} className="underline text-teal text-xs hover:opacity-80">
                  {namaFileDariPath(d.file_path)}
                </button>
                {canUpload && (
                  <button onClick={() => hapus(d)} title="Hapus dokumen"
                    className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-500 hover:bg-red-600 text-white text-xs">🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
