'use client'
// Penggunaan — sisi TERIMA Pengalihan Status Penggunaan (transfer masuk antar
// SKPD). Pasangan dari jenis "Pengalihan Status" di menu Penghapusan (sisi
// keluar). Lihat migrasi 20260704_21_pengalihan_status.sql.
//
//   - Jurnal masuk berstatus 'pending' → SKPD tujuan me-review barang + dokumen
//     sumber, lalu TERIMA (RPC fn_terima_pengalihan: insert ledger
//     'pengalihan_status' + pindahkan aset.skpd_id, atomik) atau TOLAK
//     (fn_tolak_pengalihan: status 'ditolak' + alasan; draft utuh di SKPD asal).
//   - Riwayat disetujui ditampilkan dari ledger (baris reversal = barang yang
//     pengalihannya sudah dibatalkan, tidak ditampilkan sbg anggota).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import SkpdCombobox from '@/components/SkpdCombobox'

type DraftItem = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai: number
}
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  keterangan: string | null
  skpd_id: number
  skpd_tujuan: number
  approval_status: string
  rejected_reason: string | null
  payload: { dokumen_paths?: string[]; draft_items?: DraftItem[] } | null
}
type Line = DraftItem
type Jurnal = Header & { lines: Line[]; total: number }

const namaFile = (path: string) => path.split('/').pop() || path

export default function PenggunaanMasuk() {
  const supabase = createClient()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoading(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,periode,keterangan,skpd_id,skpd_tujuan,approval_status,rejected_reason,payload')
      .eq('kategori', 'pengalihan_status')
      .eq('skpd_tujuan', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    // Pending/ditolak: barang dari draft. Disetujui: dari ledger (skip reversal).
    for (const j of jmap.values()) {
      if (j.approval_status !== 'disetujui') {
        for (const d of j.payload?.draft_items || []) { j.lines.push(d); j.total += d.nilai }
      }
    }
    const approvedIds = hs.filter(h => h.approval_status === 'disetujui').map(h => h.id)
    if (approvedIds.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .eq('jenis', 'pengalihan_status')
        .in('header_id', approvedIds)
        .order('id', { ascending: false })
      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; payload: { reversal?: boolean } | null
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; merek_tipe: string | null; jumlah: number; satuan: string | null } | null
      }[]
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.aset) continue
        const key = `${r.header_id}|${r.aset.id}`
        if (seen.has(key)) continue
        seen.add(key)
        if (r.payload?.reversal) continue // baris terbaru = pembatalan → bukan anggota lagi
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
        })
        j.total += r.nilai
      }
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(skpd) }, [skpd, load])

  async function terima(j: Jurnal) {
    if (!confirm(`Terima ${j.lines.length} barang dari ${namaSkpd(j.skpd_id)}? Barang akan resmi berpindah ke SKPD ini.`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_terima_pengalihan', { p_header_id: j.id })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg(`${data} barang diterima — resmi tercatat di SKPD ini.`)
    load(skpd)
  }

  async function tolak(j: Jurnal) {
    const alasan = prompt(`Tolak pengalihan "${j.no_sk}" dari ${namaSkpd(j.skpd_id)}? Tulis alasan penolakan (dikirim balik ke SKPD asal):`)
    if (alasan === null) return
    setBusy(true)
    const { error } = await supabase.rpc('fn_tolak_pengalihan', { p_header_id: j.id, p_alasan: alasan })
    setBusy(false)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Pengalihan ditolak — SKPD asal bisa merevisi atau menghapus jurnalnya.')
    load(skpd)
  }

  async function bukaDokumen(path: string) {
    const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const namaSkpd = (id: number | null) => skpdList.find(s => s.id === id)?.nama || '-'

  const pendings = jurnals.filter(j => j.approval_status === 'pending')
  const riwayat = jurnals.filter(j => j.approval_status !== 'pending')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Penggunaan</h1>
        <p className="text-gray-500 text-sm mt-1">
          BMD masuk dari SKPD lain (Pengalihan Status Penggunaan). Jurnal pending menunggu persetujuan SKPD ini — periksa barang & dokumen sumber, lalu Terima atau Tolak.
        </p>
      </div>

      {msg && <div className="mb-4 px-4 py-3 rounded-lg bg-teal/10 text-teal text-sm">{msg}</div>}

      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">SKPD Penerima :</label>
          <SkpdCombobox value={skpd} onChange={id => { setSkpd(id); setMsg('') }} rootOnly
            placeholder="Ketik nama SKPD..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk melihat pengalihan masuk.</div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
      ) : jurnals.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengalihan masuk untuk SKPD ini.</div>
      ) : (
        <div className="space-y-4">
          {[...pendings, ...riwayat].map(j => {
            const pending = j.approval_status === 'pending'
            const ditolak = j.approval_status === 'ditolak'
            return (
              <div key={j.id} className={`card overflow-hidden ${pending ? 'border-amber-300' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-gray-800">
                        No. Dokumen: {j.no_sk}
                        <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          pending ? 'bg-amber-100 text-amber-700'
                          : ditolak ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {pending ? 'Menunggu Persetujuan' : ditolak ? 'Ditolak' : 'Diterima'}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Dari: <span className="font-medium">{namaSkpd(j.skpd_id)}</span>
                        {' · '}Tgl. {j.tanggal} · {j.periode}
                      </p>
                      {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                      {ditolak && j.rejected_reason && (
                        <p className="text-xs text-red-600">Alasan penolakan: {j.rejected_reason}</p>
                      )}
                      {(j.payload?.dokumen_paths?.length || 0) > 0 && (
                        <p className="text-xs text-gray-500">
                          Dokumen:{' '}
                          {j.payload!.dokumen_paths!.map(p => (
                            <button key={p} onClick={() => bukaDokumen(p)}
                              className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total Nilai</p>
                        <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                      </div>
                      {pending && (
                        <>
                          <button className="btn-primary" disabled={busy} onClick={() => terima(j)}>
                            {busy ? '...' : 'Terima'}
                          </button>
                          <button disabled={busy} onClick={() => tolak(j)}
                            className="px-4 py-2 rounded-lg text-sm bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
                            Tolak
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-th">Kode Register / Nama Barang</th>
                        <th className="table-th">Merek / Tipe</th>
                        <th className="table-th text-center">Jumlah</th>
                        <th className="table-th text-right">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {j.lines.map(l => (
                        <tr key={l.aset_id}>
                          <td className="table-td">
                            <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                          </td>
                          <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                          <td className="table-td text-center text-xs">{l.jumlah} {l.satuan || ''}</td>
                          <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
