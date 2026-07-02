'use client'
// No.10: Kapitalisasi / penambahan masa manfaat (§6) — alur jurnal ala SIMBADA.
//   1. Pilih SKPD.
//   2. Tambah transaksi: No Dokumen, Tanggal Dokumen, Keterangan.
//   3. Popup pilih barang INDUK (filter jenis + pilih).
//   4. Popup pilih barang ANAK (penambahan; boleh > 1, centang).
//   5. Simpan → transaksi kapitalisasi tercatat di induk; barang anak diserap
//      (transaksi 'kapitalisasi_serap' → berhenti disusut & hilang dari laporan).
// Perhitungan final tetap di engine: persen = nilai anak / nilai perolehan induk
// → band overhaul → masa manfaat baru = min(sisa + tambahan, masa manfaat maks).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG } from '@/lib/bmd'
import { cariBand, type BandOverhaul } from '@/lib/engine/penyusutan'
import FormShell from './FormShell'

type Barang = { id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai_perolehan: number; skpd_id: number | null }
type AnakInfo = { id: string; nibar: string | null; nama: string | null; nilai: number }
type Jurnal = {
  id: number; no_dokumen: string; tanggal: string; keterangan: string | null; nilai: number
  induk: { nibar: string | null; nama_barang: string | null; kode: string } | null
  anak: AnakInfo[]
}

export default function Kapitalisasi() {
  const supabase = createClient()

  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [bands, setBands] = useState<BandOverhaul[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama').then(({ data }) => setSkpdList(data || []))
    supabase.from('overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun')
      .then(({ data }) => setBands((data as BandOverhaul[]) || []))
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

  const loadList = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingList(true)
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,tanggal,keterangan,nilai,payload,aset:aset_id(nibar,nama_barang,kode)')
      .eq('jenis', 'kapitalisasi').eq('skpd_asal', Number(skpdId))
      .order('id', { ascending: true })
    const rows = (data || []) as unknown as {
      id: number; tanggal: string; keterangan: string | null; nilai: number
      payload: { no_dokumen?: string; anak?: AnakInfo[] }
      aset: Jurnal['induk']
    }[]
    setJurnals(rows.map(r => ({
      id: r.id, no_dokumen: r.payload?.no_dokumen || '(tanpa no. dok)', tanggal: r.tanggal,
      keterangan: r.keterangan, nilai: r.nilai, induk: r.aset, anak: r.payload?.anak || [],
    })))
    setLoadingList(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList(skpd); setMode('list') }, [skpd, loadList])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Kapitalisasi" msg={msg}
      deskripsi="Pilih SKPD, buat transaksi kapitalisasi: pilih barang induk + barang anak (penambahan masa manfaat). Nilai anak diserap ke induk.">
      <div className="card p-5 mb-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <select className="select-filter flex-1" value={skpd} onChange={e => { setSkpd(e.target.value); setMsg('') }}>
            <option value="">— pilih SKPD —</option>
            {skpdList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk melihat & membuat transaksi kapitalisasi.</div>
      ) : mode === 'tambah' ? (
        <TambahKapitalisasi
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} bands={bands} golonganLabels={golonganLabels}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Kapitalisasi tersimpan — ${n} barang anak diserap ke induk. Jalankan engine untuk memperbarui penyusutan.`); loadList(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} transaksi kapitalisasi</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Transaksi</button>
          </div>

          {loadingList ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada kapitalisasi untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-4">
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-gray-800">No. Dok: {j.no_dokumen}</p>
                  <p className="text-xs text-gray-500">Tgl. {j.tanggal}{j.keterangan ? ` · ${j.keterangan}` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">Nilai Kapitalisasi</p>
                  <p className="font-semibold text-gray-800">{formatRupiah(j.nilai)}</p>
                </div>
              </div>
              <div className="px-5 py-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Barang Induk</p>
                <p className="font-medium text-gray-800 text-xs">{j.induk?.nama_barang || '-'}</p>
                <p className="text-gray-400 text-xs">{j.induk?.nibar || '-'} · {j.induk?.kode || '-'}</p>
                <p className="text-xs text-gray-400 mt-3 mb-1">Barang Anak (diserap) — {j.anak.length}</p>
                {j.anak.length === 0 ? (
                  <p className="text-gray-400 text-xs">-</p>
                ) : (
                  <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                    {j.anak.map(a => (
                      <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-gray-700">{a.nama || '-'} <span className="text-gray-400">· {a.nibar || '-'}</span></span>
                        <span className="text-gray-600">{formatRupiah(a.nilai)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </FormShell>
  )
}

// ── Form tambah: header + pilih induk & anak via popup + preview + simpan ───
function TambahKapitalisasi({ skpdId, skpdNama, bands, golonganLabels, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; bands: BandOverhaul[]; golonganLabels: Record<string, string>
  onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const [noDok, setNoDok] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [induk, setInduk] = useState<Barang | null>(null)
  const [anak, setAnak] = useState<Barang[]>([])
  const [modal, setModal] = useState<'induk' | 'anak' | null>(null)
  const [masaMax, setMasaMax] = useState<number | null>(null)
  const [sisaSmt, setSisaSmt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Ambil masa manfaat maks + sisa masa manfaat induk (buat preview).
  useEffect(() => {
    setMasaMax(null); setSisaSmt(null)
    if (!induk) return
    (async () => {
      const { data: k } = await supabase.from('kodefikasi_bmd').select('masa_manfaat_tahun').eq('kode', induk.kode).single()
      setMasaMax(k?.masa_manfaat_tahun ?? null)
      const { data: ps } = await supabase.from('penyusutan_semester')
        .select('sisa_semester,periode').eq('aset_id', induk.id).order('periode', { ascending: false }).limit(1)
      if (ps && ps.length) { setSisaSmt(ps[0].sisa_semester); return }
      const { data: sa } = await supabase.from('transaksi_bmd').select('payload').eq('aset_id', induk.id).eq('jenis', 'saldo_awal').limit(1)
      const p = sa?.[0]?.payload as { sisa_masa_manfaat_smt?: number } | undefined
      if (p?.sisa_masa_manfaat_smt != null) setSisaSmt(p.sisa_masa_manfaat_smt)
    })()
  }, [induk]) // eslint-disable-line react-hooks/exhaustive-deps

  const rehab = anak.reduce((s, a) => s + (a.nilai_perolehan || 0), 0)
  const persen = induk && induk.nilai_perolehan > 0 ? (rehab / induk.nilai_perolehan) * 100 : 0
  const band = induk && rehab > 0 ? cariBand(bands, induk.kode, persen) : null
  const tambahan = band?.tambahan_tahun ?? 0
  const sisaTahun = sisaSmt != null ? sisaSmt / 2 : null
  const masaBaru = sisaTahun != null && masaMax != null ? Math.min(sisaTahun + tambahan, masaMax) : null

  async function simpan() {
    if (!noDok.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (!induk) { setErr('Pilih barang induk dulu.'); return }
    if (anak.length === 0) { setErr('Pilih minimal satu barang anak.'); return }
    setErr(''); setSaving(true)

    const anakInfo: AnakInfo[] = anak.map(a => ({ id: a.id, nibar: a.nibar, nama: a.nama_barang, nilai: a.nilai_perolehan }))
    // 1. Transaksi kapitalisasi di induk (nilai = total nilai anak).
    const { error } = await catatTransaksi(supabase, {
      asetId: induk.id, jenis: 'kapitalisasi', tanggal: tgl, nilai: rehab, skpdAsal: induk.skpd_id,
      payload: {
        no_dokumen: noDok.trim(), nilai_rehab: rehab, persen_rehab: Math.round(persen * 100) / 100,
        band_label: band ? `${band.kode_prefix}#${band.band_no}` : null, tambahan_tahun: tambahan,
        nilai_perolehan_baru: induk.nilai_perolehan + rehab, anak: anakInfo,
      },
      keterangan: ket.trim() || undefined,
    })
    if (error) { setErr(`Error: ${error}`); setSaving(false); return }

    // 2. Serap tiap barang anak (berhenti disusut + hilang dari laporan).
    for (const a of anak) {
      const { error: e2 } = await catatTransaksi(supabase, {
        asetId: a.id, jenis: 'kapitalisasi_serap', tanggal: tgl, nilai: a.nilai_perolehan, skpdAsal: a.skpd_id,
        payload: { induk_id: induk.id, induk_nibar: induk.nibar, no_dokumen: noDok.trim() },
        keterangan: `Diserap ke induk ${induk.nibar || induk.kode} (kapitalisasi ${noDok.trim()})`,
      })
      if (e2) { setErr(`Kapitalisasi tercatat, tapi serap barang anak gagal: ${e2}`); setSaving(false); return }
    }
    setSaving(false)
    onSaved(anak.length)
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Kapitalisasi Baru — {skpdNama}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
            <input className="select-filter w-full" value={noDok} onChange={e => setNoDok(e.target.value)} placeholder="mis. 027/1234/418.xx/2026" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
            <input type="date" className="select-filter w-full" value={tgl} onChange={e => setTgl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan / No. kontrak rehab</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Induk */}
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Induk</label>
          <button className="btn-secondary text-xs" onClick={() => setModal('induk')}>{induk ? 'Ganti Induk' : 'Pilih Barang Induk'}</button>
        </div>
        {induk ? (
          <div className="p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
            <p className="font-medium text-gray-800">{induk.nama_barang || '-'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{induk.nibar || '-'} · {induk.kode} · Nilai perolehan {formatRupiah(induk.nilai_perolehan)}</p>
          </div>
        ) : <p className="text-xs text-gray-400">Belum dipilih.</p>}
      </div>

      {/* Anak */}
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Anak (penambahan) — {anak.length} dipilih</label>
          <button className="btn-secondary text-xs" disabled={!induk} onClick={() => setModal('anak')}>{anak.length ? 'Ubah Anak' : 'Pilih Anak Barang'}</button>
        </div>
        {anak.length === 0 ? (
          <p className="text-xs text-gray-400">{induk ? 'Belum dipilih.' : 'Pilih induk dulu.'}</p>
        ) : (
          <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
            {anak.map(a => (
              <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="text-gray-700">{a.nama_barang || '-'} <span className="text-gray-400">· {a.nibar || '-'} · {a.kode}</span></span>
                <span className="text-gray-600">{formatRupiah(a.nilai_perolehan)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview perhitungan */}
      {induk && rehab > 0 && (
        <div className="card p-5 max-w-3xl bg-gray-50/60 text-sm space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview Perhitungan</p>
          <p>Total nilai anak (rehab): <span className="font-medium">{formatRupiah(rehab)}</span></p>
          <p>% rehab: <span className="font-medium">{persen.toFixed(2)}%</span> dari nilai perolehan induk {formatRupiah(induk.nilai_perolehan)}</p>
          <p>Band overhaul: <span className="font-medium">{band ? `+${tambahan} tahun` : 'tidak ada band untuk rumpun ini (+0 tahun)'}</span></p>
          {sisaTahun != null && masaMax != null ? (
            <p>Masa manfaat: sisa {sisaTahun} th + {tambahan} th = {sisaTahun + tambahan} th
              → <span className="font-medium">{masaBaru} th ({(masaBaru ?? 0) * 2} semester)</span>
              {sisaTahun + tambahan > (masaMax ?? 0) && <span className="text-amber-600"> (di-cap maks {masaMax} th)</span>}
            </p>
          ) : <p className="text-gray-400">Sisa masa manfaat belum tersedia — engine akan menghitung dari ledger.</p>}
          <p className="text-gray-500">Acuan periode: <span className="font-medium">{periodeDariTanggal(tgl)}</span> (dari tanggal dokumen)</p>
        </div>
      )}

      {err && <p className="text-sm text-red-600 max-w-3xl">{err}</p>}
      <div className="max-w-3xl">
        <button className="btn-primary" onClick={simpan} disabled={saving || !induk || anak.length === 0}>
          {saving ? 'Menyimpan...' : 'Simpan Kapitalisasi'}
        </button>
      </div>

      {modal && (
        <BarangModal
          skpdId={skpdId} golonganLabels={golonganLabels}
          title={modal === 'induk' ? 'Pilih Barang Induk' : 'Pilih Barang Anak (penambahan)'}
          confirmLabel={modal === 'induk' ? 'Pilih Barang' : 'Pilih Anak Barang'}
          multi={modal === 'anak'}
          excludeIds={modal === 'anak' && induk ? [induk.id] : []}
          initialSelected={modal === 'induk' ? (induk ? [induk] : []) : anak}
          onClose={() => setModal(null)}
          onConfirm={(sel) => { if (modal === 'induk') { setInduk(sel[0] || null); setAnak([]) } else setAnak(sel); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Popup pemilih barang (filter jenis + cari + centang) ────────────────────
function BarangModal({ skpdId, golonganLabels, title, confirmLabel, multi, excludeIds = [], initialSelected = [], onClose, onConfirm }: {
  skpdId: number; golonganLabels: Record<string, string>; title: string; confirmLabel: string
  multi: boolean; excludeIds?: string[]; initialSelected?: Barang[]
  onClose: () => void; onConfirm: (sel: Barang[]) => void
}) {
  const supabase = createClient()
  const [fGol, setFGol] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>(Object.fromEntries(initialSelected.map(b => [b.id, b])))

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGol) q = q.like('kode', `${fGol}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows(((data as unknown as Barang[]) || []).filter(b => !excludeIds.includes(b.id)))
    setLoaded(true); setLoading(false)
  }

  function pick(b: Barang) {
    setSel(prev => {
      if (!multi) return { [b.id]: b }
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={fGol} onChange={e => setFGol(e.target.value)}>
                <option value="">Semua Jenis</option>
                {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {!loaded ? (
            <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-y border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th w-10" />
                  <th className="table-th">Barang</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={3} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                ) : rows.map(b => (
                  <tr key={b.id} className={sel[b.id] ? 'bg-teal/5 cursor-pointer' : 'cursor-pointer'} onClick={() => pick(b)}>
                    <td className="table-td text-center">
                      <input type={multi ? 'checkbox' : 'radio'} checked={!!sel[b.id]} readOnly />
                    </td>
                    <td className="table-td">
                      <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode}</p>
                    </td>
                    <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selList.length} dipilih{multi ? ` · ${formatRupiah(selTotal)}` : ''}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={selList.length === 0} onClick={() => onConfirm(selList)}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
