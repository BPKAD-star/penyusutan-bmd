'use client'
// Inventarisasi BMD (Permendagri 47/2021) — daftar & pembuatan lembar kerja.
// Lingkup: 1 inventarisasi = SKPD × tahun × golongan (pemda menginventarisasi
// satu jenis aset per tahun). NON-LEDGER: modul ini tak pernah menulis
// transaksi_bmd / mengubah aset — lihat lib/inventarisasi.ts.
//
// Saat header dibuat, baris LKI langsung DIGENERATE dari `aset` (status aktif,
// subtree SKPD, kode LIKE '<golongan>.%'), lengkap dgn `snapshot` yang dibekukan
// sbg nilai "SEBELUM Inventarisasi". Lingkup 1 SKPD × 1 golongan → dataset kecil,
// tidak melanggar aturan performa CLAUDE.md.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import {
  GOLONGAN_OPSI, STATUS_LABEL, STATUS_BADGE, konfigLki,
  type InvHeader, type InvStatus, type InvSnapshot,
} from '@/lib/inventarisasi'

const TAHUN_INI = new Date().getFullYear()
const HDR_COLS = 'id,skpd_id,tahun,golongan,status,catatan_validator,petugas,keterangan,diajukan_at,divalidasi_at,created_at'

// Kolom `aset` yang dibekukan ke snapshot baris.
const ASET_COLS =
  'id,nibar,kode,uraian_barang,nama_barang,spesifikasi_lainnya,merek_tipe,jumlah,satuan,' +
  'nilai_perolehan,alamat_detail,kondisi_barang,tgl_perolehan,no_polisi,no_rangka,no_mesin,skpd_id'

type AsetRow = {
  id: string; nibar: string | null; kode: string; uraian_barang: string | null
  nama_barang: string | null; spesifikasi_lainnya: string | null; merek_tipe: string | null
  jumlah: number | null; satuan: string | null; nilai_perolehan: number
  alamat_detail: string | null; kondisi_barang: string | null; tgl_perolehan: string | null
  no_polisi: string | null; no_rangka: string | null; no_mesin: string | null; skpd_id: number | null
}

export default function InventarisasiPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<InvHeader[]>([])
  const [jumlahBaris, setJumlahBaris] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [filterStatus, setFilterStatus] = useState<'' | InvStatus>('')

  // Form buat
  const [showForm, setShowForm] = useState(false)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [golongan, setGolongan] = useState('1.3.3') // default Gedung & Bangunan (fokus 2026)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventarisasi')
      .select(`${HDR_COLS},skpd:admin_skpd(nama)`)
      .order('created_at', { ascending: false })
    const hs = (data as never as InvHeader[]) || []
    setRows(hs)

    // Jumlah baris per inventarisasi (kolom "Barang").
    const counts: Record<string, number> = {}
    for (const h of hs) {
      const { count } = await supabase.from('inventarisasi_baris')
        .select('id', { count: 'exact', head: true }).eq('inventarisasi_id', h.id)
      counts[h.id] = count || 0
    }
    setJumlahBaris(counts)
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const terlihat = useMemo(
    () => rows.filter(r => !filterStatus || r.status === filterStatus),
    [rows, filterStatus],
  )

  async function buat() {
    if (!skpdId) { setMsg('Error: pilih SKPD dulu.'); return }
    setSaving(true); setMsg('')

    // 1) Header. UNIQUE(skpd_id,tahun,golongan) mencegah duplikat.
    const { data: hdr, error: hErr } = await supabase.from('inventarisasi')
      .insert({ skpd_id: skpdId, tahun: TAHUN_INI, golongan })
      .select('id').single()
    if (hErr || !hdr) {
      setMsg(hErr?.code === '23505'
        ? `Error: inventarisasi ${golongan} tahun ${TAHUN_INI} untuk SKPD ini sudah ada.`
        : `Error: gagal membuat inventarisasi: ${hErr?.message}`)
      setSaving(false); return
    }

    // 2) Generate baris dari aset (subtree SKPD + golongan).
    const scope = descIds && descIds.length > 0 ? descIds : [skpdId]
    const aset: AsetRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('aset').select(ASET_COLS)
        .eq('status', 'aktif').in('skpd_id', scope)
        .like('kode', `${golongan}.%`)          // memanfaatkan idx_aset_kode_pattern
        .range(from, from + 999)
      if (!data || data.length === 0) break
      aset.push(...(data as never as AsetRow[]))
      if (data.length < 1000) break
    }

    if (aset.length > 0) {
      const baris = aset.map(a => {
        const snapshot: InvSnapshot = {
          nibar: a.nibar, kode: a.kode, uraian_barang: a.uraian_barang,
          nama_barang: a.nama_barang, spesifikasi_lainnya: a.spesifikasi_lainnya,
          merek_tipe: a.merek_tipe, jumlah: a.jumlah, satuan: a.satuan,
          nilai_perolehan: a.nilai_perolehan, alamat: a.alamat_detail,
          kondisi: a.kondisi_barang, tgl_perolehan: a.tgl_perolehan,
          no_polisi: a.no_polisi, no_rangka: a.no_rangka, no_mesin: a.no_mesin,
          skpd_id: a.skpd_id,
        }
        return { inventarisasi_id: hdr.id, aset_id: a.id, snapshot, jawaban: {} }
      })
      for (let i = 0; i < baris.length; i += 200) {
        const { error } = await supabase.from('inventarisasi_baris').insert(baris.slice(i, i + 200))
        if (error) {
          setMsg(`Error: header dibuat, tapi sebagian baris gagal digenerate: ${error.message}`)
          setSaving(false); await load(); return
        }
      }
    }

    setMsg(`Inventarisasi ${konfigLki(golongan).label} ${TAHUN_INI} dibuat — ${aset.length} barang siap diperiksa.`)
    setShowForm(false); setSaving(false)
    await load()
  }

  return (
    <FormShell
      judul="Inventarisasi"
      deskripsi="Lembar Kerja Inventarisasi (LKI) BMD — Permendagri 47/2021. Satu lembar kerja per SKPD, per tahun, per jenis aset."
      msg={msg}
      headerRight={
        <button onClick={() => { setShowForm(v => !v); setMsg('') }} className="btn-primary">
          {showForm ? 'Batal' : '+ Buat Inventarisasi'}
        </button>
      }
    >
      {showForm && (
        <div className="card p-5 mb-4 space-y-4 max-w-3xl">
          <h2 className="text-base font-semibold text-gray-800">Buat Inventarisasi {TAHUN_INI}</h2>
          <p className="text-xs text-gray-500">
            Barang diambil otomatis dari Daftar Barang: status aktif, SKPD terpilih beserta
            sub-unitnya, dan golongan yang dipilih. Inventarisasi hanya untuk <b>tahun berjalan</b>.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox lockToOperator allowClear
              onChangeSelection={sel => { setSkpdId(sel.skpdId); setDescIds(sel.descendantIds) }}
              placeholder="Ketik nama SKPD / Sub OPD..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Aset (Golongan)</label>
            <select className="select-filter w-full max-w-md" value={golongan} onChange={e => setGolongan(e.target.value)}>
              {GOLONGAN_OPSI.map(g => <option key={g.kode} value={g.kode}>{g.label}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Format lembar kerja: <b>{konfigLki(golongan).format}</b></p>
          </div>
          <button onClick={buat} disabled={saving} className="btn-primary">
            {saving ? 'Membuat & mengambil barang...' : 'Buat & Ambil Barang'}
          </button>
        </div>
      )}

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className="select-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value as '' | InvStatus)}>
            <option value="">Semua Status</option>
            {(['draft', 'diajukan', 'divalidasi', 'dikembalikan'] as InvStatus[]).map(s =>
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <Link href="/dashboard/inventarisasi/laporan"
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
          Laporan Hasil Inventarisasi (LHI)
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">SKPD</th>
                <th className="table-th whitespace-nowrap">Tahun</th>
                <th className="table-th whitespace-nowrap">Jenis Aset</th>
                <th className="table-th whitespace-nowrap">Format</th>
                <th className="table-th whitespace-nowrap text-right">Barang</th>
                <th className="table-th whitespace-nowrap">Status</th>
                <th className="table-th whitespace-nowrap">Buka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : terlihat.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">Belum ada inventarisasi.</td></tr>
              ) : terlihat.map(h => (
                <tr key={h.id}>
                  <td className="table-td text-sm">{h.skpd?.nama || `SKPD #${h.skpd_id}`}</td>
                  <td className="table-td text-xs text-gray-500">{h.tahun}</td>
                  <td className="table-td text-xs">{konfigLki(h.golongan).label}</td>
                  <td className="table-td text-xs text-gray-400">{konfigLki(h.golongan).format}</td>
                  <td className="table-td text-xs text-right">{(jumlahBaris[h.id] ?? 0).toLocaleString('id-ID')}</td>
                  <td className="table-td whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[h.status]}`}>
                      {STATUS_LABEL[h.status]}
                    </span>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <Link href={`/dashboard/inventarisasi/${h.id}`} className="text-teal hover:underline text-xs font-medium">
                      Buka
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormShell>
  )
}
