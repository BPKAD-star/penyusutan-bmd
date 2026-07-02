'use client'
// Pembukuan → Pengelolaan (PLAN §5B)
// Tiap entry = 1 transaksi immutable di ledger + update state aset (§1.1).
// DEFERRED (§12, jangan diterobos): reklas komptabel & alokasi akumulasi
// penyusutan saat koreksi kuantitas (split/merge) — struktur ada, logika belum.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'
import { cariBand, type BandOverhaul } from '@/lib/engine/penyusutan'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'

const TABS = [
  { key: 'penggunaan', label: 'Penggunaan' },
  { key: 'pengeluaran', label: 'Pengeluaran Internal' },
  { key: 'penerimaan', label: 'Penerimaan Internal' },
  { key: 'reklas', label: 'Reklasifikasi' },
  { key: 'koreksi', label: 'Koreksi' },
  { key: 'kapitalisasi', label: 'Kapitalisasi' },
  { key: 'penghapusan', label: 'Penghapusan' },
] as const

type Skpd = { id: number; nama: string; level: number; parent_id: number | null }

export default function PengelolaanPage() {
  const [tab, setTab] = useState<string>('penggunaan')
  const [msg, setMsg] = useState('')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pembukuan — Pengelolaan</h1>
        <p className="text-gray-500 text-sm mt-1">
          Setiap entry tercatat sebagai transaksi permanen di ledger (tidak bisa diedit/dihapus — koreksi = transaksi baru).
        </p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); setMsg('') }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      {tab === 'penggunaan' && <DaftarTransfer jenis="pengalihan_status" arah="masuk"
        judul="BMD yang dialihkan SKPD lain ke SKPD Anda" />}
      {tab === 'pengeluaran' && <FormMutasiInternal onMsg={setMsg} />}
      {tab === 'penerimaan' && <DaftarTransfer jenis="mutasi_internal" arah="masuk"
        judul="BMD yang diterima dari sub-SKPD lain (internal pengguna barang)" />}
      {tab === 'reklas' && <FormReklas onMsg={setMsg} />}
      {tab === 'koreksi' && <FormKoreksi onMsg={setMsg} />}
      {tab === 'kapitalisasi' && <FormKapitalisasi onMsg={setMsg} />}
      {tab === 'penghapusan' && <FormPenghapusan onMsg={setMsg} />}
    </div>
  )
}

// ── Display-only: Penggunaan (no.5) & Penerimaan Internal (no.7) ─────────────
function DaftarTransfer({ jenis, judul }: { jenis: string; arah: 'masuk'; judul: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<{
    id: number; tanggal: string; periode: string; keterangan: string | null
    aset: { nibar: string | null; nama_barang: string | null; kode: string; nilai_perolehan: number } | null
    asal: { nama: string } | null; tujuan: { nama: string } | null
  }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      // RLS membatasi ke transaksi yang menyangkut SKPD user (asal/tujuan/aset)
      const { data } = await supabase
        .from('transaksi_bmd')
        .select('id,tanggal,periode,keterangan,aset(nibar,nama_barang,kode,nilai_perolehan),asal:skpd_asal(nama),tujuan:skpd_tujuan(nama)')
        .eq('jenis', jenis)
        .order('id', { ascending: false })
        .limit(200)
      setRows((data as never) || [])
      setLoading(false)
    })()
  }, [jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm text-gray-600">{judul}</p>
        <p className="text-xs text-gray-400 mt-0.5">Display-only — sisi terima dicatat otomatis dari transaksi pengirim.</p>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="table-th">Tanggal</th>
            <th className="table-th">Barang</th>
            <th className="table-th">Dari</th>
            <th className="table-th">Ke</th>
            <th className="table-th text-right">Nilai</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loading ? (
            <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Belum ada transaksi</td></tr>
          ) : rows.map(r => (
            <tr key={r.id}>
              <td className="table-td text-xs">{r.tanggal} <span className="text-gray-400">({r.periode})</span></td>
              <td className="table-td text-xs">
                <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                <p className="text-gray-400">{r.aset?.nibar || '-'} · {r.aset?.kode}</p>
              </td>
              <td className="table-td text-xs">{r.asal?.nama || '-'}</td>
              <td className="table-td text-xs">{r.tujuan?.nama || '-'}</td>
              <td className="table-td text-xs text-right">{formatRupiah(r.aset?.nilai_perolehan ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── No.6: Pengeluaran internal — pindah antar sub-SKPD dalam induk sama ──────
function FormMutasiInternal({ onMsg }: { onMsg: (m: string) => void }) {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [tujuanList, setTujuanList] = useState<Skpd[]>([])
  const [tujuan, setTujuan] = useState<number | ''>('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)

  // Hierarki: naik ke induk level-1 dari SKPD aset, lalu ambil seluruh subtree-nya.
  useEffect(() => {
    setTujuan('')
    setTujuanList([])
    if (!aset?.skpd_id) return
    (async () => {
      let { data: node } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('id', aset.skpd_id!).single()
      while (node && node.level > 1 && node.parent_id) {
        const { data: parent } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('id', node.parent_id).single()
        if (!parent) break
        node = parent
      }
      if (!node) return
      // subtree 2 tingkat di bawah induk (kuasa pengguna + sub-kuasa)
      const { data: anak } = await supabase.from('skpd').select('id,nama,level,parent_id').eq('parent_id', node.id)
      const anakIds = (anak || []).map(a => a.id)
      const { data: cucu } = anakIds.length
        ? await supabase.from('skpd').select('id,nama,level,parent_id').in('parent_id', anakIds)
        : { data: [] }
      setTujuanList([node, ...(anak || []), ...(cucu || [])].filter(s => s.id !== aset.skpd_id))
    })()
  }, [aset]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || !tujuan) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id,
      jenis: 'mutasi_internal',
      skpdAsal: aset.skpd_id,
      skpdTujuan: Number(tujuan),
      keterangan: ket || undefined,
    })
    onMsg(error ? `Error: ${error}` : `Mutasi internal tercatat: ${aset.nama_barang} → ${tujuanList.find(s => s.id === tujuan)?.nama}.`)
    if (!error) { setAset(null); setTujuan(''); setKet('') }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
      <p className="text-sm text-gray-600">
        Pindahkan BMD ke sub-SKPD lain <span className="font-medium">dalam SKPD induk yang sama</span>.
        Sisi penerima otomatis muncul di tab Penerimaan Internal.
      </p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Aset</label>
        <AsetPicker selected={aset} onSelect={setAset} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Sub-SKPD Tujuan (satu induk)</label>
        <select className="select-filter w-full" value={tujuan} required disabled={!aset}
          onChange={e => setTujuan(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— pilih tujuan —</option>
          {tujuanList.map(s => <option key={s.id} value={s.id}>{' '.repeat((s.level - 1) * 3)}{s.nama}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Keterangan / No. Berita Acara</label>
        <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={saving || !aset || !tujuan}>
        {saving ? 'Menyimpan...' : 'Catat Mutasi Internal'}
      </button>
    </form>
  )
}

// ── No.8: Reklasifikasi ──────────────────────────────────────────────────────
function FormReklas({ onMsg }: { onMsg: (m: string) => void }) {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [q, setQ] = useState('')
  const [kandidat, setKandidat] = useState<{ kode: string; uraian: string; masa_manfaat_tahun: number }[]>([])
  const [kodeBaru, setKodeBaru] = useState<{ kode: string; uraian: string } | null>(null)
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)

  async function cariKode() {
    const { data } = await supabase.from('kodefikasi_bmd')
      .select('kode,uraian,masa_manfaat_tahun')
      .or(`kode.ilike.${q}%,uraian.ilike.%${q}%`)
      .limit(20)
    setKandidat(data || [])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || !kodeBaru) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id,
      jenis: 'reklas_kode',
      payload: { kode_lama: aset.kode, kode_baru: kodeBaru.kode, uraian_baru: kodeBaru.uraian },
      keterangan: ket || undefined,
    })
    onMsg(error ? `Error: ${error}` : `Reklas kode tercatat: ${aset.kode} → ${kodeBaru.kode}.`)
    if (!error) { setAset(null); setKodeBaru(null); setKet('') }
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <form onSubmit={submit} className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Reklas Kode Barang</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Aset</label>
          <AsetPicker selected={aset} onSelect={setAset} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kode Baru (dari kodefikasi BMD)</label>
          {kodeBaru ? (
            <div className="flex items-center justify-between p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
              <span className="font-mono text-xs">{kodeBaru.kode} — {kodeBaru.uraian}</span>
              <button type="button" className="btn-secondary text-xs" onClick={() => setKodeBaru(null)}>Ganti</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className="select-filter flex-1" placeholder="Cari kode / uraian..." value={q}
                  onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKode() } }} />
                <button type="button" className="btn-secondary" onClick={cariKode}>Cari</button>
              </div>
              {kandidat.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {kandidat.map(k => (
                    <button key={k.kode} type="button" onClick={() => { setKodeBaru(k); setKandidat([]) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                      <span className="font-mono">{k.kode}</span> — {k.uraian}
                      <span className="text-gray-400"> (MM {k.masa_manfaat_tahun} th)</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar reklas</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          Reklas ke golongan Aset Lain-Lain (1.5.4) otomatis menghentikan penyusutan sejak periode ini.
        </p>
        <button className="btn-primary" disabled={saving || !aset || !kodeBaru}>
          {saving ? 'Menyimpan...' : 'Catat Reklasifikasi'}
        </button>
      </form>
      <div className="card p-4 text-sm text-gray-400 border-dashed">
        <span className="font-medium text-gray-500">Reklas Komptabel</span> — ditunda (menunggu rules).
        Struktur data sudah disiapkan; form akan diaktifkan setelah aturan ditetapkan.
      </div>
    </div>
  )
}

// ── No.9: Koreksi ────────────────────────────────────────────────────────────
function FormKoreksi({ onMsg }: { onMsg: (m: string) => void }) {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [mode, setMode] = useState<'nilai' | 'spesifikasi'>('nilai')
  const [nilaiBaru, setNilaiBaru] = useState('')
  const [spek, setSpek] = useState({ nama_barang: '', spesifikasi: '', merek_tipe: '', satuan: '' })
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset) return
    setSaving(true)
    let error: string | undefined
    if (mode === 'nilai') {
      const baru = parseFloat(nilaiBaru)
      if (isNaN(baru) || baru < 0) { onMsg('Error: nilai baru tidak valid.'); setSaving(false); return }
      const delta = baru - aset.nilai_perolehan
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id,
        jenis: 'koreksi_nilai',
        nilai: delta,
        payload: { nilai_lama: aset.nilai_perolehan, nilai_perolehan_baru: baru, delta },
        keterangan: ket || undefined,
      }))
    } else {
      const isi = Object.fromEntries(Object.entries(spek).filter(([, v]) => v.trim() !== ''))
      if (Object.keys(isi).length === 0) { onMsg('Error: tidak ada field yang diubah.'); setSaving(false); return }
      ;({ error } = await catatTransaksi(supabase, {
        asetId: aset.id,
        jenis: 'koreksi_spesifikasi',
        payload: isi,
        keterangan: ket || undefined,
      }))
    }
    onMsg(error ? `Error: ${error}` : 'Koreksi tercatat di ledger.')
    if (!error) { setAset(null); setNilaiBaru(''); setSpek({ nama_barang: '', spesifikasi: '', merek_tipe: '', satuan: '' }); setKet('') }
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div className="flex gap-2">
          {(['nilai', 'spesifikasi'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${mode === m ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'}`}>
              Koreksi {m === 'nilai' ? 'Nilai' : 'Spesifikasi'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Aset</label>
          <AsetPicker selected={aset} onSelect={setAset} />
        </div>
        {mode === 'nilai' ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Nilai Perolehan Baru (Rp) {aset && <span className="text-gray-400">— sekarang {formatRupiah(aset.nilai_perolehan)}</span>}
            </label>
            <input type="number" min="0" step="1" className="select-filter w-full" value={nilaiBaru}
              onChange={e => setNilaiBaru(e.target.value)} required />
            <p className="text-xs text-gray-400 mt-1">Selisih (delta) dicatat di ledger; beban penyusutan disebar ulang ke sisa umur oleh engine.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(spek) as (keyof typeof spek)[]).map(k => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">{k.replace('_', ' ')}</label>
                <input className="select-filter w-full" value={spek[k]}
                  placeholder="(kosongkan jika tidak berubah)"
                  onChange={e => setSpek(s => ({ ...s, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar koreksi</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={saving || !aset}>{saving ? 'Menyimpan...' : 'Catat Koreksi'}</button>
      </form>
      <div className="card p-4 text-sm text-gray-400 border-dashed">
        <span className="font-medium text-gray-500">Koreksi Kuantitas (split/merge)</span> — ditunda:
        rumus alokasi akumulasi penyusutan belum ditetapkan. Struktur ledger sudah siap.
      </div>
    </div>
  )
}

// ── No.10: Kapitalisasi / penambahan masa manfaat (§6) ───────────────────────
function FormKapitalisasi({ onMsg }: { onMsg: (m: string) => void }) {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [nilaiRehab, setNilaiRehab] = useState('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [bands, setBands] = useState<BandOverhaul[]>([])
  const [masaMax, setMasaMax] = useState<number | null>(null)
  const [sisaSmt, setSisaSmt] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun')
      .then(({ data }) => setBands((data as BandOverhaul[]) || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMasaMax(null); setSisaSmt(null)
    if (!aset) return
    (async () => {
      const { data: k } = await supabase.from('kodefikasi_bmd').select('masa_manfaat_tahun').eq('kode', aset.kode).single()
      setMasaMax(k?.masa_manfaat_tahun ?? null)
      const { data: ps } = await supabase.from('penyusutan_semester')
        .select('sisa_semester,periode').eq('aset_id', aset.id)
        .order('periode', { ascending: false }).limit(1)
      if (ps && ps.length) setSisaSmt(ps[0].sisa_semester)
      else {
        const { data: sa } = await supabase.from('transaksi_bmd')
          .select('payload').eq('aset_id', aset.id).eq('jenis', 'saldo_awal').limit(1)
        const p = sa?.[0]?.payload as { sisa_masa_manfaat_smt?: number } | undefined
        if (p?.sisa_masa_manfaat_smt != null) setSisaSmt(p.sisa_masa_manfaat_smt)
      }
    })()
  }, [aset]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preview §6.2 — hitungan final tetap di engine dari ledger.
  const rehab = parseFloat(nilaiRehab) || 0
  const persen = aset && aset.nilai_perolehan > 0 ? (rehab / aset.nilai_perolehan) * 100 : 0
  const band = aset && rehab > 0 ? cariBand(bands, aset.kode, persen) : null
  const tambahan = band?.tambahan_tahun ?? 0
  const sisaTahun = sisaSmt != null ? sisaSmt / 2 : null
  const masaBaru = sisaTahun != null && masaMax != null ? Math.min(sisaTahun + tambahan, masaMax) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || rehab <= 0) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id,
      jenis: 'kapitalisasi',
      nilai: rehab,
      payload: {
        nilai_rehab: rehab,
        persen_rehab: Math.round(persen * 100) / 100,
        band_label: band ? `${band.kode_prefix}#${band.band_no}` : null,
        tambahan_tahun: tambahan,
        nilai_perolehan_baru: aset.nilai_perolehan + rehab,
      },
      keterangan: ket || undefined,
    })
    onMsg(error ? `Error: ${error}` : `Kapitalisasi ${formatRupiah(rehab)} tercatat. Jalankan engine untuk memperbarui penyusutan.`)
    if (!error) { setAset(null); setNilaiRehab(''); setKet('') }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
      <p className="text-sm text-gray-600">
        Rehab G&B / rehab JIJ / penambahan sparepart P&M / penambahan menu aplikasi ATB.
        Persentase dihitung terhadap <span className="font-medium">nilai perolehan</span> (bukan nilai buku).
      </p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Aset Induk</label>
        <AsetPicker selected={aset} onSelect={setAset} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Nilai Rehab / Kapitalisasi (Rp)</label>
        <input type="number" min="1" step="1" className="select-filter w-full" value={nilaiRehab}
          onChange={e => setNilaiRehab(e.target.value)} required />
      </div>
      {aset && rehab > 0 && (
        <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview Perhitungan</p>
          <p>% rehab: <span className="font-medium">{persen.toFixed(2)}%</span> dari {formatRupiah(aset.nilai_perolehan)}</p>
          <p>Band overhaul: <span className="font-medium">{band ? `+${tambahan} tahun` : 'tidak ada band untuk rumpun ini (+0 tahun)'}</span></p>
          {sisaTahun != null && masaMax != null ? (
            <p>Masa manfaat: sisa {sisaTahun} th + {tambahan} th = {sisaTahun + tambahan} th
              → <span className="font-medium">{masaBaru} th ({(masaBaru ?? 0) * 2} semester)</span>
              {sisaTahun + tambahan > (masaMax ?? 0) && <span className="text-amber-600"> (di-cap max {masaMax} th)</span>}
            </p>
          ) : (
            <p className="text-gray-400">Sisa masa manfaat belum tersedia — engine akan menghitung dari ledger.</p>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Keterangan / No. kontrak rehab</label>
        <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={saving || !aset || rehab <= 0}>
        {saving ? 'Menyimpan...' : 'Catat Kapitalisasi'}
      </button>
    </form>
  )
}

// ── No.11: Penghapusan ───────────────────────────────────────────────────────
function FormPenghapusan({ onMsg }: { onMsg: (m: string) => void }) {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [jenis, setJenis] = useState<'penghapusan_pemindahtanganan' | 'pengalihan_status' | 'penghapusan_sebab_lain'>('penghapusan_pemindahtanganan')
  const [subJenis, setSubJenis] = useState('hibah')
  const [skpdL1, setSkpdL1] = useState<{ id: number; nama: string }[]>([])
  const [tujuan, setTujuan] = useState<number | ''>('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('skpd').select('id,nama').eq('level', 1).order('nama')
      .then(({ data }) => setSkpdL1(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset) return
    if (jenis === 'pengalihan_status' && !tujuan) { onMsg('Error: pilih SKPD tujuan.'); return }
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id,
      jenis,
      nilai: aset.nilai_perolehan,
      skpdAsal: aset.skpd_id,
      skpdTujuan: jenis === 'pengalihan_status' ? Number(tujuan) : null,
      payload: jenis === 'penghapusan_pemindahtanganan' ? { sub_jenis: subJenis } : {},
      keterangan: ket || undefined,
    })
    onMsg(error ? `Error: ${error}` :
      jenis === 'pengalihan_status'
        ? `Pengalihan status tercatat — barang pindah ke ${skpdL1.find(s => s.id === tujuan)?.nama} dan muncul di menu Penggunaan mereka.`
        : 'Penghapusan tercatat — barang hilang dari laporan tapi tetap tersimpan di database. Penyusutan berhenti.')
    if (!error) { setAset(null); setTujuan(''); setKet('') }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Jenis Penghapusan</label>
        <select className="select-filter w-full" value={jenis} onChange={e => setJenis(e.target.value as typeof jenis)}>
          <option value="penghapusan_pemindahtanganan">Pemindahtanganan</option>
          <option value="pengalihan_status">Pengalihan Status (transfer ke SKPD lain)</option>
          <option value="penghapusan_sebab_lain">Sebab Lain (force majeure)</option>
        </select>
      </div>
      {jenis === 'penghapusan_pemindahtanganan' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bentuk Pemindahtanganan</label>
          <select className="select-filter w-full" value={subJenis} onChange={e => setSubJenis(e.target.value)}>
            <option value="hibah">Hibah</option>
            <option value="penjualan">Penjualan</option>
            <option value="tukar_menukar">Tukar-Menukar</option>
            <option value="penyertaan_modal">Penyertaan Modal Pemerintah</option>
          </select>
        </div>
      )}
      {jenis === 'pengalihan_status' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD Tujuan (pengguna barang)</label>
          <select className="select-filter w-full" value={tujuan} required
            onChange={e => setTujuan(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pilih SKPD —</option>
            {skpdL1.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Aset</label>
        <AsetPicker selected={aset} onSelect={setAset} />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Keterangan / dasar (SK, BA, dll)</label>
        <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
      </div>
      <p className="text-xs text-gray-400">
        {jenis === 'pengalihan_status'
          ? 'Aset pindah SKPD, penyusutan jalan terus di SKPD baru.'
          : `${JENIS_TRANSAKSI_LABEL[jenis]}: soft-delete — data & histori tetap di database, penyusutan berhenti.`}
      </p>
      <button className="btn-primary" disabled={saving || !aset}>{saving ? 'Menyimpan...' : 'Catat Penghapusan'}</button>
    </form>
  )
}
