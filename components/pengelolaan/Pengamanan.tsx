'use client'
// Pengamanan BMD — penyerahan kustodi fisik barang ke seorang pegawai
// (penanggung jawab) via BAST + Pakta Integritas. Pola jurnal ber-dokumen
// (jurnal_header + ledger), TANPA approval & TANPA lintas-SKPD:
//   1. Pilih SKPD (pengurus barang otomatis terkunci ke SKPD-nya).
//   2. Tambah Pengamanan: 1 penyerahan → jurnal_header kategori 'pengamanan'
//      (pegawai + BAST + Pakta Integritas di payload; PDF ke bucket
//      dokumen-sumber).
//   3. Pilih barang (centang) → baris ledger jenis 'pengamanan'.
// NETRAL: tidak mengubah nilai/penyusutan, barang tetap muncul & disusutkan.
//
// PENGEMBALIAN & SERAH KE ORANG BARU: barang cuma boleh berkustodi ke SATU
// pegawai (picker filter .is('pengamanan', null) → hanya barang belum
// berkustodi). Serah ke pegawai baru = kembalikan dulu (⤺ pengembalian_
// pengamanan) → barang bebas → buat kartu pengamanan baru utk pegawai lain.
// Batal (🗑 batal_pengamanan) = koreksi salah catat (barang hilang dari kartu).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { periodeDariTanggal, kodeLevel3, GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import { PANGKAT_GOLONGAN, PENGAMANAN_ELIGIBLE_GOLONGAN, isPengamananEligible, pengamananCache } from '@/lib/pengamanan'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { DokumenBastField, DokumenLinks, bukaDokumen } from './DokumenBastField'

const GOL_LABEL: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))
const golLabel = (kode: string) => GOL_LABEL[kodeLevel3(kode)] || kodeLevel3(kode)
const todayStr = () => new Date().toISOString().slice(0, 10)

type PengPayload = {
  nama_pegawai?: string; nip?: string; pangkat_golongan?: string; jabatan?: string
  pakta_no?: string; pakta_tgl?: string; bast_paths?: string[]; pakta_paths?: string[]
}
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string
  keterangan: string | null; payload: PengPayload | null
}
type Line = {
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai: number; dikembalikan: boolean
}
type Jurnal = Header & { lines: Line[] }

type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
}

const HEADER_COLS = 'id,no_sk,tanggal,periode,keterangan,payload'

export default function Pengamanan() {
  const supabase = createClient()

  const konfirmasi = useKonfirmasi()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [editing, setEditing] = useState<Header | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama || ''

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS).eq('kategori', 'pengamanan').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]
    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [] })

    if (hs.length > 0) {
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan)')
        .in('jenis', ['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'] as never)
        .in('header_id', hs.map(h => h.id))
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        id: number; header_id: string; jenis: string; nilai: number
        aset: Omit<Barang, 'nilai_perolehan' | 'skpd_id'> | null
      }[]
      // Akumulasi kronologis per (header, aset), baris terakhir menentukan:
      //   'pengamanan'              → set baris, dikembalikan=false
      //   'pengembalian_pengamanan' → dikembalikan=true (tetap tampil, riwayat)
      //   'batal_pengamanan'        → hapus dari kartu (salah catat)
      const acc = new Map<string, Line>()
      for (const r of rows) {
        if (!r.aset) continue
        const key = `${r.header_id}|${r.aset.id}`
        if (r.jenis === 'pengamanan') {
          acc.set(key, {
            aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
            merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai, dikembalikan: false,
          })
        } else if (r.jenis === 'pengembalian_pengamanan') {
          const cur = acc.get(key); if (cur) cur.dikembalikan = true
        } else { // batal_pengamanan
          acc.delete(key)
        }
      }
      for (const [key, line] of acc) jmap.get(key.split('|')[0])?.lines.push(line)
    }
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setEditing(null) }, [skpd, loadJurnals])

  async function tulisEvent(l: Line, j: Jurnal, jenis: 'pengembalian_pengamanan' | 'batal_pengamanan') {
    const tgl = todayStr()
    const { error } = await supabase.from('transaksi_bmd').insert({
      aset_id: l.aset_id, jenis, periode: periodeDariTanggal(tgl), tanggal: tgl, nilai: 0, header_id: j.id, payload: {},
    })
    if (error) { setMsg(`Error: ${error.message}`); return false }
    await supabase.from('aset').update({ pengamanan: null }).eq('id', l.aset_id)
    return true
  }

  // ⤺ Kembalikan vs 🗑 Batal: pasangan yang sama gampang tertukarnya dengan
  // Akhiri/Batal di Pemanfaatan, jadi nadanya dibedakan dengan aturan yang sama
  // — teal untuk peristiwa yang SAH, merah untuk koreksi salah catat.
  async function kembalikanBarang(l: Line, j: Jurnal) {
    if (l.dikembalikan) return
    if (!(await konfirmasi({
      nada: 'teal', ikon: '⤺', judul: 'Kembalikan barang dari kustodi?',
      subjudul: l.nama_barang || l.nibar,
      rincian: [{ label: 'Kustodian saat ini', nilai: j.payload?.nama_pegawai || 'pegawai' }],
      isi: <>Barang <b>lepas dari kustodi</b> dan bebas diserahkan ke pegawai lain lewat BAST baru.
        Riwayatnya tetap tampil di kartu ini dengan status &ldquo;Dikembalikan&rdquo;.</>,
      peringatan: <>Kalau sebenarnya <b>salah catat</b> (barangnya tak pernah diserahkan), pakai
        🗑 Batal supaya tak tertinggal riwayat penyerahan yang tak pernah terjadi.</>,
      labelYa: 'Ya, kembalikan',
    })).ya) return
    if (await tulisEvent(l, j, 'pengembalian_pengamanan')) { setMsg('Barang dikembalikan dari pengamanan.'); loadJurnals(skpd) }
  }

  async function batalBarang(l: Line, j: Jurnal) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Batalkan pengamanan ini — salah catat?',
      subjudul: l.nama_barang || l.nibar,
      isi: <>Barang dianggap <b>TAK PERNAH diserahkan</b>: hilang dari kartu ini tanpa meninggalkan
        riwayat.</>,
      peringatan: <>Ini <b>koreksi salah catat</b>, bukan pengembalian. Kalau barangnya memang pernah
        dipegang lalu dikembalikan, pakai ⤺ Kembalikan.</>,
      labelYa: 'Ya, batalkan',
    })).ya) return
    if (await tulisEvent(l, j, 'batal_pengamanan')) { setMsg('Pengamanan barang dibatalkan (salah catat).'); loadJurnals(skpd) }
  }

  async function batalSeluruh(j: Jurnal) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Batalkan SELURUH BAST pengamanan ini?',
      subjudul: `No. BAST ${j.no_sk}`,
      rincian: [
        { label: 'Barang terdampak', nilai: `${j.lines.length} barang` },
        { label: 'Pegawai penanggung jawab', nilai: j.payload?.nama_pegawai || '—' },
      ],
      isi: <>Semua barangnya dianggap <b>tak pernah diserahkan</b> dan kartunya hilang dari daftar.</>,
      peringatan: <><b>HANYA untuk salah catat.</b> Penyerahan yang memang terjadi lalu selesai
        dikembalikan per barang lewat ⤺ Kembalikan, bukan dibatalkan dari sini.</>,
      labelYa: 'Ya, batalkan seluruhnya',
    })).ya) return
    const tgl = todayStr()
    const rows = j.lines.map(l => ({
      aset_id: l.aset_id, jenis: 'batal_pengamanan', periode: periodeDariTanggal(tgl), tanggal: tgl, nilai: 0, header_id: j.id, payload: {},
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(rows)
    if (error) { setMsg(`Error: ${error.message}`); return }
    await supabase.from('aset').update({ pengamanan: null }).in('id', j.lines.map(l => l.aset_id))
    setMsg('Seluruh BAST pengamanan dibatalkan (salah catat).')
    loadJurnals(skpd)
  }

  return (
    <FormShell judul="Pengamanan" msg={msg}
      deskripsi="Pilih SKPD, serahkan barang ke pegawai penanggung jawab (BAST + Pakta Integritas), lalu centang barang. Barang bisa dikembalikan lalu diserahkan ke pegawai lain. Umumnya Peralatan & Mesin dan Gedung & Bangunan.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd}
            onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat & membuat pengamanan.</div>
      ) : mode === 'tambah' ? (
        <BarangForm skpdId={Number(skpd)} skpdNama={skpdNama}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Pengamanan tersimpan — ${n} barang diserahkan.`); loadJurnals(skpd) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} BAST pengamanan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Pengamanan</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada pengamanan untuk SKPD ini.</div>
          ) : jurnals.map(j => {
            const p = j.payload || {}
            return (
              <div key={j.id} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-gray-800">{p.nama_pegawai || '-'}
                        {p.nip && <span className="ml-2 text-xs font-normal text-gray-500">NIP {p.nip}</span>}
                      </p>
                      <p className="text-xs text-gray-500">{p.pangkat_golongan || '-'}{p.jabatan ? ` · ${p.jabatan}` : ''}</p>
                      <p className="text-xs text-gray-500">BAST: {j.no_sk} · Tgl. {j.tanggal} · {j.periode}</p>
                      {(p.pakta_no || p.pakta_tgl) && <p className="text-xs text-gray-500">Pakta Integritas: {p.pakta_no || '-'}{p.pakta_tgl ? ` · ${p.pakta_tgl}` : ''}</p>}
                      <DokumenLinks paths={p.bast_paths || []} label="BAST" />
                      <DokumenLinks paths={p.pakta_paths || []} label="Pakta Integritas" />
                      {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button title="Edit header (pegawai/BAST/Pakta — semester sama)" onClick={() => { setMsg(''); setEditing(j) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                      <button title="Batalkan SELURUH BAST (salah catat) — kartu hilang" onClick={() => batalSeluruh(j)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-th w-20 text-center">Aksi</th>
                        <th className="table-th">Kode Register / Nama Barang</th>
                        <th className="table-th">Merek / Tipe</th>
                        <th className="table-th text-center">Status</th>
                        <th className="table-th text-right">Nilai Perolehan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {j.lines.map(l => (
                        <tr key={l.aset_id} className={l.dikembalikan ? 'opacity-50' : ''}>
                          <td className="table-td text-center">
                            <div className="flex items-center justify-center gap-1">
                              {!l.dikembalikan && (
                                <button onClick={() => kembalikanBarang(l, j)} title="Kembalikan barang (lepas kustodi)"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded bg-amber-500 hover:bg-amber-600 text-white">⤺</button>
                              )}
                              <button onClick={() => batalBarang(l, j)} title="Batalkan (salah catat) — hilang dari kartu"
                                className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                            </div>
                          </td>
                          <td className="table-td">
                            <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode} · {golLabel(l.kode)}</p>
                          </td>
                          <td className="table-td text-xs text-gray-600">{l.merek_tipe || '-'}</td>
                          <td className="table-td text-center text-xs">
                            {l.dikembalikan
                              ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">Dikembalikan</span>
                              : <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-green-100 text-green-700">Diamankan</span>}
                          </td>
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

      {editing && (
        <EditHeaderModal header={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header pengamanan diperbarui.'); loadJurnals(skpd) }} />
      )}
    </FormShell>
  )
}

// ── Edit header: pegawai + BAST No/Tgl (kunci semester) + Pakta ──────────────
function EditHeaderModal({ header, onClose, onSaved }: { header: Header; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const p = header.payload || {}
  const [nama, setNama] = useState(p.nama_pegawai || '')
  const [nip, setNip] = useState(p.nip || '')
  const [pangkat, setPangkat] = useState(p.pangkat_golongan || '')
  const [jabatan, setJabatan] = useState(p.jabatan || '')
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [paktaNo, setPaktaNo] = useState(p.pakta_no || '')
  const [paktaTgl, setPaktaTgl] = useState(p.pakta_tgl || '')
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!nama.trim()) { setErr('Nama pegawai wajib diisi.'); return }
    if (!noSk.trim()) { setErr('No. BAST wajib diisi.'); return }
    if (pindahSemester) { setErr(`Tanggal masuk ${tglPeriode}, sedangkan BAST ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & buat BAST baru.`); return }
    setErr(''); setSaving(true)
    const payload: PengPayload = {
      ...p, nama_pegawai: nama.trim(), nip: nip.trim() || undefined, pangkat_golongan: pangkat || undefined,
      jabatan: jabatan.trim() || undefined, pakta_no: paktaNo.trim() || undefined, pakta_tgl: paktaTgl || undefined,
    }
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload }).eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    // Segarkan cache utk barang yang MASIH diamankan (belum dikembalikan/batal) di header ini.
    const { data: ev } = await supabase.from('transaksi_bmd')
      .select('aset_id,jenis,id').eq('header_id', header.id)
      .in('jenis', ['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'] as never).order('id', { ascending: true })
    const state = new Map<string, boolean>()
    for (const r of (ev || []) as { aset_id: string; jenis: string }[]) state.set(r.aset_id, r.jenis === 'pengamanan')
    const aktifIds = [...state.entries()].filter(([, on]) => on).map(([id]) => id)
    if (aktifIds.length) await supabase.from('aset').update({ pengamanan: pengamananCache(nama.trim(), nip.trim()) }).in('id', aktifIds)
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">Edit Header Pengamanan</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama Pegawai</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">NIP</label>
            <input className="select-filter w-full" value={nip} onChange={e => setNip(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pangkat / Golongan</label>
            <select className="select-filter w-full" value={pangkat} onChange={e => setPangkat(e.target.value)}>
              <option value="">— pilih —</option>
              {PANGKAT_GOLONGAN.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
            <input className="select-filter w-full" value={jabatan} onChange={e => setJabatan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. BAST <span className="text-gray-400">(tetap di {header.periode})</span></label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal BAST</label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester BAST.</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Pakta Integritas</label>
            <input className="select-filter w-full" value={paktaNo} onChange={e => setPaktaNo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Pakta Integritas</label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={paktaTgl} onChange={e => setPaktaTgl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
          <p className="sm:col-span-2 text-xs text-gray-400">Catatan: berkas PDF BAST/Pakta diatur saat pembuatan BAST. Untuk mengganti berkas, batalkan & buat BAST baru.</p>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Form BAST baru + pemilihan barang ───────────────────────────────────────
function BarangForm({ skpdId, skpdNama, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [nama, setNama] = useState('')
  const [nip, setNip] = useState('')
  const [pangkat, setPangkat] = useState('')
  const [jabatan, setJabatan] = useState('')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(todayStr())
  const [paktaNo, setPaktaNo] = useState('')
  const [paktaTgl, setPaktaTgl] = useState('')
  const [ket, setKet] = useState('')
  const [bastPaths, setBastPaths] = useState<string[]>([])
  const [paktaPaths, setPaktaPaths] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId).is('pengamanan', null)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    else q = q.or(PENGAMANAN_ELIGIBLE_GOLONGAN.map(g => `kode.like.${g}.%`).join(','))
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows(((data as unknown as Barang[]) || []).filter(b => isPengamananEligible(b.kode)))
    setLoaded(true); setLoading(false)
  }

  async function upload(files: FileList | null, target: 'bast' | 'pakta') {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const path = `pengamanan-${target}/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      if (target === 'bast') setBastPaths(prev => [...prev, path]); else setPaktaPaths(prev => [...prev, path])
    }
    setUploading(false)
  }
  async function hapusDok(path: string, target: 'bast' | 'pakta') {
    await supabase.storage.from('dokumen-sumber').remove([path])
    if (target === 'bast') setBastPaths(prev => prev.filter(p => p !== path)); else setPaktaPaths(prev => prev.filter(p => p !== path))
  }

  function toggle(b: Barang) {
    setSel(prev => { const next = { ...prev }; if (next[b.id]) delete next[b.id]; else next[b.id] = b; return next })
  }
  function toggleAll() {
    setSel(prev => {
      const all = rows.length > 0 && rows.every(r => prev[r.id])
      if (all) return {}
      const next = { ...prev }; for (const r of rows) next[r.id] = r; return next
    })
  }
  const selList = Object.values(sel)
  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

  async function simpan() {
    if (!nama.trim()) { setErr('Nama pegawai wajib diisi.'); return }
    if (!noSk.trim()) { setErr('No. BAST wajib diisi.'); return }
    if (bastPaths.length === 0) { setErr('Berkas BAST (Berita Acara Penyerahan) wajib diunggah.'); return }
    if (paktaPaths.length === 0) { setErr('Berkas Pakta Integritas wajib diunggah.'); return }
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)

    const payload: PengPayload = {
      nama_pegawai: nama.trim(), nip: nip.trim() || undefined, pangkat_golongan: pangkat || undefined,
      jabatan: jabatan.trim() || undefined, pakta_no: paktaNo.trim() || undefined, pakta_tgl: paktaTgl || undefined,
      bast_paths: bastPaths, pakta_paths: paktaPaths,
    }
    const { data, error } = await supabase.from('jurnal_header').insert({
      skpd_id: skpdId, kategori: 'pengamanan', jenis: 'pengamanan',
      no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null, payload,
    }).select(HEADER_COLS).single()
    if (error || !data) { setErr(`Gagal membuat BAST pengamanan: ${error?.message}`); setSaving(false); return }
    const h = data as unknown as Header

    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis: 'pengamanan', periode: h.periode, tanggal: h.tanggal, nilai: 0,
      skpd_asal: b.skpd_id, header_id: h.id, payload: {},
    }))
    const { error: e1 } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (e1) { await supabase.from('jurnal_header').delete().eq('id', h.id); setErr(`Gagal mencatat transaksi: ${e1.message}`); setSaving(false); return }
    await supabase.from('aset').update({ pengamanan: pengamananCache(nama.trim(), nip.trim()) }).in('id', selList.map(b => b.id))

    setSaving(false); onSaved(selList.length)
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">BAST Pengamanan Baru — {skpdNama}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama Pegawai</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">NIP</label>
            <input className="select-filter w-full" value={nip} onChange={e => setNip(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pangkat / Golongan</label>
            <select className="select-filter w-full" value={pangkat} onChange={e => setPangkat(e.target.value)}>
              <option value="">— pilih —</option>
              {PANGKAT_GOLONGAN.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
            <input className="select-filter w-full" value={jabatan} onChange={e => setJabatan(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen BAST</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal BAST</label>
            <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Pakta Integritas</label>
            <input className="select-filter w-full" value={paktaNo} onChange={e => setPaktaNo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Pakta Integritas</label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={paktaTgl} onChange={e => setPaktaTgl(e.target.value)} />
          </div>
          <div>
            <DokumenBastField paths={bastPaths} uploading={uploading} onUpload={f => upload(f, 'bast')} onHapus={p => hapusDok(p, 'bast')}
              judul="Berkas BAST" labelTombol="Upload BAST"
              hint="Berita Acara Penyerahan — wajib sebelum BAST pengamanan bisa disimpan (foto / PDF, bisa lebih dari satu)"
              kosongText="Belum ada berkas BAST — wajib diunggah sebelum BAST pengamanan bisa disimpan." />
          </div>
          <div>
            <DokumenBastField paths={paktaPaths} uploading={uploading} onUpload={f => upload(f, 'pakta')} onHapus={p => hapusDok(p, 'pakta')}
              judul="Berkas Pakta Integritas" labelTombol="Upload Pakta Integritas"
              hint="wajib sebelum BAST pengamanan bisa disimpan (foto / PDF, bisa lebih dari satu)"
              kosongText="Belum ada berkas Pakta Integritas — wajib diunggah sebelum BAST pengamanan bisa disimpan." />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {uploading && <p className="sm:col-span-2 text-xs text-gray-400">Mengunggah...</p>}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Pilih Barang</h2>
        <p className="text-xs text-gray-400 mb-4">Umumnya Peralatan & Mesin dan Gedung & Bangunan. Barang yang sedang dalam kustodi pegawai lain tidak muncul (kembalikan dulu).</p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
            <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">Semua (yang boleh)</option>
              {PENGAMANAN_ELIGIBLE_GOLONGAN.map(g => <option key={g} value={g}>{g} — {GOL_LABEL[g] || g}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">Cari</label>
            <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="table-th w-10 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Merek / Tipe</th>
                    <th className="table-th text-center">Jumlah</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang eligible untuk filter ini.</td></tr>
                  ) : rows.map(b => (
                    <tr key={b.id} className={sel[b.id] ? 'bg-teal/5' : ''}>
                      <td className="table-td text-center"><input type="checkbox" checked={!!sel[b.id]} onChange={() => toggle(b)} /></td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golLabel(b.kode)}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                      <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-600">{selList.length} barang dipilih</span>
          <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>{saving ? 'Menyimpan...' : 'Simpan Pengamanan'}</button>
        </div>
      </div>
    </div>
  )
}
