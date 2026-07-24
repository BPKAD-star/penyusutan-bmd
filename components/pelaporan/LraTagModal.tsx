'use client'
// Tandai baris LRA sebagai Kapitalisasi (dari 5.1 barjas → pilih jenis tujuan)
// atau Reklasifikasi keluar (dari 5.2 modal → jenis otomatis = kodenya sendiri).
// Nilai SELALU seluruh baris (keputusan #4) — tak ada isian angka manual.
// Tanda ini hanya untuk hitungan Check; TIDAK membuat transaksi BMD (keputusan #5).
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { JENIS_BM, type LraRow } from '@/lib/lra'

type Mode = 'kapitalisasi' | 'reklas_keluar'
const SELECT_COLS = 'id,skpd_id,tanggal,bulan,no_bukti,kode_rekening,kode_grup3,kelompok,uraian,keterangan,debit,klasifikasi,jenis_tujuan'

export default function LraTagModal({ mode, tahun, descendantIds, onClose, onDone }: {
  mode: Mode
  tahun: string
  descendantIds: number[] | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const supabase = createClient()
  const isKap = mode === 'kapitalisasi'
  const [tab, setTab] = useState<'kandidat' | 'ditandai'>('kandidat')
  const [rows, setRows] = useState<LraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Record<number, string>>({}) // id → jenis_tujuan ('' kalau belum dipilih)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const out: LraRow[] = []
    for (let from = 0; ; from += 1000) {
      let query = supabase.from('lra_realisasi').select(SELECT_COLS)
        .eq('tahun', Number(tahun))
        .eq('kelompok', isKap ? 'barjas' : 'modal')
        .order('tanggal').range(from, from + 999)
      if (descendantIds) query = query.in('skpd_id', descendantIds)
      const { data, error } = await query
      if (error) { setErr(error.message); setLoading(false); return }
      const batch = (data || []) as LraRow[]
      out.push(...batch)
      if (batch.length < 1000) break
    }
    setRows(out); setSel({}); setLoading(false)
  }, [supabase, tahun, isKap, descendantIds])

  useEffect(() => { load() }, [load])

  const kandidat = rows.filter(r => r.klasifikasi == null)
  const ditandai = rows.filter(r => r.klasifikasi === mode)
  const term = q.trim().toLowerCase()
  const cocok = (r: LraRow) => !term ||
    r.uraian?.toLowerCase().includes(term) || r.no_bukti?.toLowerCase().includes(term) ||
    r.kode_rekening.includes(term) || r.keterangan?.toLowerCase().includes(term)
  const tampil = (tab === 'kandidat' ? kandidat : ditandai).filter(cocok)

  const nSel = Object.keys(sel).length
  const belumPilihJenis = isKap && Object.values(sel).some(v => !v)

  function toggle(r: LraRow) {
    setSel(prev => {
      const n = { ...prev }
      if (n[r.id] !== undefined) delete n[r.id]
      else n[r.id] = isKap ? '' : r.kode_grup3   // reklas: jenis otomatis
      return n
    })
  }

  async function simpan() {
    if (nSel === 0) return
    if (belumPilihJenis) { setErr('Masih ada baris terpilih yang belum dipilih jenis tujuannya.'); return }
    setSaving(true); setErr('')
    try {
      // Kelompokkan per jenis tujuan → satu UPDATE per grup.
      const perJenis = new Map<string, number[]>()
      for (const [id, jenis] of Object.entries(sel)) {
        const arr = perJenis.get(jenis) || []; arr.push(Number(id)); perJenis.set(jenis, arr)
      }
      for (const [jenis, ids] of perJenis) {
        for (let i = 0; i < ids.length; i += 200) {
          const { error } = await supabase.from('lra_realisasi')
            .update({ klasifikasi: mode, jenis_tujuan: jenis })
            .in('id', ids.slice(i, i + 200))
          if (error) throw new Error(error.message)
        }
      }
      onDone(`${nSel} baris ditandai sebagai ${isKap ? 'Kapitalisasi' : 'Reklasifikasi keluar'}.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setSaving(false)
    }
  }

  async function hapusTanda(r: LraRow) {
    setSaving(true); setErr('')
    const { error } = await supabase.from('lra_realisasi')
      .update({ klasifikasi: null, jenis_tujuan: null }).eq('id', r.id)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false)
    await load()
  }

  const totalSel = Object.keys(sel).reduce((s, id) => s + (rows.find(r => r.id === Number(id))?.debit || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-5xl my-8 bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {isKap ? 'Tandai Kapitalisasi (belanja barjas 5.1 → belanja modal)' : 'Tandai Reklasifikasi (belanja modal 5.2 dikeluarkan)'}
          </h2>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">
            {isKap
              ? <>Pilih baris <b>5.1</b> yang dikapitalisasi jadi belanja modal, lalu tentukan <b>jenis aset tujuan</b>. Nilainya <b>seluruh baris</b> (tak bisa sebagian).</>
              : <>Pilih baris <b>5.2</b> yang <b>dikeluarkan</b> dari belanja modal. Jenisnya otomatis mengikuti kode rekening baris itu. Nilainya <b>seluruh baris</b>.</>}
            {' '}Tanda ini hanya untuk perhitungan Check — <b>tidak</b> membuat transaksi BMD.
          </p>

          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button className={`px-3 py-1.5 ${tab === 'kandidat' ? 'bg-teal/10 text-teal font-medium' : 'text-gray-500'}`}
                onClick={() => { setTab('kandidat'); setSel({}) }}>Kandidat ({kandidat.length})</button>
              <button className={`px-3 py-1.5 border-l border-gray-200 ${tab === 'ditandai' ? 'bg-teal/10 text-teal font-medium' : 'text-gray-500'}`}
                onClick={() => { setTab('ditandai'); setSel({}) }}>Sudah ditandai ({ditandai.length})</button>
            </div>
            <input className="select-filter flex-1 min-w-[200px]" placeholder="Cari uraian / no. bukti / kode..."
              value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Memuat...</div>
          ) : tampil.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {tab === 'kandidat'
                ? `Tidak ada baris ${isKap ? '5.1 (barjas)' : '5.2 (modal)'} yang belum ditandai untuk tahun ${tahun}.`
                : 'Belum ada baris yang ditandai.'}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th w-8"></th>
                      <th className="table-th">Tgl</th><th className="table-th">Kode</th><th className="table-th">Uraian</th>
                      <th className="table-th">No. Bukti</th><th className="table-th text-right">Debit</th>
                      <th className="table-th">{tab === 'kandidat' && isKap ? 'Jenis tujuan' : 'Jenis'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tampil.slice(0, 400).map(r => {
                      const checked = sel[r.id] !== undefined
                      return (
                        <tr key={r.id} className={checked ? 'bg-teal/5' : ''}>
                          <td className="table-td">
                            {tab === 'kandidat'
                              ? <input type="checkbox" checked={checked} onChange={() => toggle(r)} />
                              : <button className="text-red-500 hover:text-red-700" title="Hapus tanda" disabled={saving} onClick={() => hapusTanda(r)}>✕</button>}
                          </td>
                          <td className="table-td whitespace-nowrap">{r.tanggal}</td>
                          <td className="table-td whitespace-nowrap">{r.kode_rekening}</td>
                          <td className="table-td max-w-[260px] truncate" title={r.uraian || ''}>{r.uraian || '-'}</td>
                          <td className="table-td max-w-[160px] truncate" title={r.no_bukti}>{r.no_bukti}</td>
                          <td className="table-td text-right tabular-nums">{formatRupiah(r.debit)}</td>
                          <td className="table-td">
                            {tab === 'ditandai' ? (
                              <span className="text-gray-600">{r.jenis_tujuan || r.kode_grup3}</span>
                            ) : isKap ? (
                              <select className="select-filter text-xs py-1" disabled={!checked}
                                value={sel[r.id] ?? ''} onChange={e => setSel(p => ({ ...p, [r.id]: e.target.value }))}>
                                <option value="">— pilih —</option>
                                {JENIS_BM.map(j => <option key={j.grup} value={j.grup}>{j.grup} {j.uraian}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-500">{r.kode_grup3}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {tampil.length > 400 && <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">Menampilkan 400 dari {tampil.length} baris — pakai pencarian untuk menyaring.</div>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {tab === 'kandidat' && nSel > 0 && <>{nSel} baris dipilih · <b>{formatRupiah(totalSel)}</b></>}
          </span>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Tutup</button>
            {tab === 'kandidat' && (
              <button className="btn-primary" disabled={saving || nSel === 0} onClick={simpan}>
                {saving ? 'Menyimpan…' : `Tandai ${nSel} Baris`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
