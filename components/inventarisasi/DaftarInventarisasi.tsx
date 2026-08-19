'use client'
// Daftar & pembuatan Lembar Kerja Inventarisasi (LKI).
//
// Dipakai dua route:
//   /dashboard/inventarisasi                      → semua jenis aset
//   /dashboard/inventarisasi/jenis/<golongan>     → dikunci ke satu jenis aset
// Sidebar menautkan ke bentuk kedua (submenu 8 jenis aset). Sengaja pakai
// SEGMEN PATH, bukan query string: penanda menu aktif di Sidebar membandingkan
// `pathname`, jadi kalau pakai ?golongan= kedelapan menu akan ikut menyala
// bersamaan.
//
// NON-LEDGER: modul ini tak pernah menulis transaksi_bmd / mengubah aset.
// Saat header dibuat, baris LKI digenerate dari `aset` (status aktif,
// skpd_id PERSIS SKPD itu — bukan subtree, lihat catatan exact-scope di
// `buat()` — dan kode LIKE '<golongan>.%') lengkap dgn `snapshot` yang
// dibekukan sbg nilai "SEBELUM Inventarisasi".
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import {
  GOLONGAN_OPSI, STATUS_LABEL, STATUS_BADGE, konfigLki,
  type InvHeader, type InvStatus, type InvSnapshot,
} from '@/lib/inventarisasi'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

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

export default function DaftarInventarisasi({ golonganLock }: { golonganLock?: string }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [rows, setRows] = useState<InvHeader[]>([])
  const [jumlahBaris, setJumlahBaris] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Filter daftar (client-side — jumlah inventarisasi kecil: per SKPD × golongan).
  const [filterStatus, setFilterStatus] = useState<'' | InvStatus>('')
  const [filterTahun, setFilterTahun] = useState<number | ''>('')
  const [filterGolongan, setFilterGolongan] = useState('')
  const [filterSkpdIds, setFilterSkpdIds] = useState<number[] | null>(null)

  // Form buat
  const [showForm, setShowForm] = useState(false)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Golongan SELALU dari route (menu jenis aset di sidebar) — form buat hanya
  // tampil di halaman per-jenis, jadi tak ada lagi pemilih golongan di form.
  const golongan = golonganLock || ''
  const config = konfigLki(golongan)

  async function load() {
    setLoading(true)
    let q = supabase.from('inventarisasi')
      .select(`${HDR_COLS},skpd:admin_skpd(nama,kode_skpd)`)
    if (golonganLock) q = q.eq('golongan', golonganLock)
    const { data } = await q
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
  useEffect(() => { load() }, [golonganLock]) // eslint-disable-line react-hooks/exhaustive-deps

  const terlihat = useMemo(() => {
    const scope = filterSkpdIds && filterSkpdIds.length > 0 ? new Set(filterSkpdIds) : null
    // Urutan mengikuti KODE SKPD (sama dgn menu Admin > SKPD), bukan waktu
    // dibuat — supaya induk selalu di atas sub-unitnya dan susunannya cocok
    // dengan struktur organisasi. Kode kosong ditaruh paling belakang.
    return rows
      .filter(r =>
        (!filterStatus || r.status === filterStatus) &&
        (!filterTahun || r.tahun === filterTahun) &&
        (!filterGolongan || r.golongan === filterGolongan) &&
        (!scope || scope.has(r.skpd_id)))
      .sort((a, b) =>
        (a.skpd?.kode_skpd || '￿').localeCompare(b.skpd?.kode_skpd || '￿') ||
        (a.skpd?.nama || '').localeCompare(b.skpd?.nama || '') ||
        b.tahun - a.tahun ||
        a.golongan.localeCompare(b.golongan))
  }, [rows, filterStatus, filterTahun, filterGolongan, filterSkpdIds])

  const tahunOpsi = useMemo(
    () => [...new Set(rows.map(r => r.tahun))].sort((a, b) => b - a),
    [rows],
  )

  /** Hapus lembar kerja — hanya draft/dikembalikan (ditegakkan juga oleh RLS).
   *  Barisnya ikut terhapus lewat ON DELETE CASCADE. */
  async function hapus(h: InvHeader) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus inventarisasi ini?',
      subjudul: `${konfigLki(h.golongan).label} ${h.tahun} · ${h.skpd?.nama || h.skpd_id}`,
      isi: <>Seluruh <b>lembar kerja beserta isiannya</b> ikut terhapus — temuan yang sudah diketik
        petugas tidak bisa dipulihkan.</>,
      peringatan: <>Tidak bisa dibatalkan. Register barangnya sendiri tidak tersentuh —
        inventarisasi memang tidak pernah mengubah data aset.</>,
      labelYa: 'Hapus inventarisasi',
    })).ya) return
    const { error } = await supabase.from('inventarisasi').delete().eq('id', h.id)
    if (error) { setMsg(`Error: gagal menghapus — ${error.message}`); return }
    setMsg('Inventarisasi dihapus.')
    await load()
  }

  async function buat() {
    if (!skpdId) { setMsg('Error: pilih SKPD dulu.'); return }
    // Golongan hanya ada di halaman per-jenis; jaga-jaga bila dipanggil dari
    // route ringkasan (tombolnya memang disembunyikan di sana).
    if (!golongan) { setMsg('Error: buka menu jenis aset dulu untuk membuat lembar kerja.'); return }
    setSaving(true); setMsg('')

    // 1) Header. UNIQUE(skpd_id,tahun,golongan) mencegah duplikat.
    const { data: hdr, error: hErr } = await supabase.from('inventarisasi')
      .insert({ skpd_id: skpdId, tahun: TAHUN_INI, golongan })
      .select('id').single()
    if (hErr || !hdr) {
      setMsg(hErr?.code === '23505'
        ? `Error: inventarisasi ${config.label} tahun ${TAHUN_INI} untuk SKPD ini sudah ada.`
        : `Error: gagal membuat inventarisasi: ${hErr?.message}`)
      setSaving(false); return
    }

    // 2) Generate baris dari aset milik SKPD INI PERSIS — BUKAN subtree.
    // Dulu memakai descendantIds, akibatnya barang sub-unit ikut masuk lembar
    // induk SEKALIGUS lembar sub-unitnya sendiri: satu aset punya dua lembar
    // LKI yang bisa saling bertentangan & dobel di LHI. Dgn exact-scope,
    // tiap aset (yang skpd_id-nya tunggal) mustahil muncul di dua lembar.
    const aset: AsetRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('aset').select(ASET_COLS)
        .eq('status', 'aktif').eq('skpd_id', skpdId)
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

    setMsg(`Inventarisasi ${config.label} ${TAHUN_INI} dibuat — ${aset.length} barang siap diperiksa.`)
    setShowForm(false); setSaving(false)
    await load()
  }

  return (
    <FormShell
      judul={golonganLock ? `Inventarisasi — ${config.label}` : 'Inventarisasi'}
      deskripsi={
        golonganLock
          ? `Lembar Kerja Inventarisasi (LKI) ${config.label} — format ${config.format}. Satu lembar kerja per SKPD, per tahun.`
          : 'Ringkasan seluruh jenis aset. Untuk membuat lembar kerja, pilih jenis asetnya di menu Lembar Kerja (LKI).'
      }
      msg={msg}
      headerRight={
        // Tombol Buat HANYA di halaman per-jenis: di sana golongannya sudah
        // ditentukan menu, jadi tak perlu dipilih ulang. Di route ringkasan
        // (semua jenis) tombolnya disembunyikan supaya tak ada dua cara memilih
        // jenis aset — sidebar & dropdown — yang saling menduplikasi.
        golonganLock ? (
          <button onClick={() => { setShowForm(v => !v); setMsg('') }} className="btn-primary">
            {showForm ? 'Batal' : '+ Buat Inventarisasi'}
          </button>
        ) : null
      }
    >
      {showForm && golonganLock && (
        <div className="card p-5 mb-4 space-y-4 max-w-3xl">
          <h2 className="text-base font-semibold text-gray-800">Buat Inventarisasi {TAHUN_INI}</h2>
          <p className="text-xs text-gray-500">
            Jenis aset sudah ditentukan oleh menu yang dibuka:{' '}
            <b>{config.label}</b> <span className="text-gray-400">({golonganLock} · format {config.format})</span>.
            Barang diambil otomatis dari Daftar Barang (status aktif), dan tiap lembar hanya
            memuat barang yang melekat pada <b>unit itu sendiri</b>. Inventarisasi hanya untuk{' '}
            <b>tahun berjalan</b>.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox lockToOperator allowClear
              onChangeSelection={sel => setSkpdId(sel.skpdId)}
              placeholder="Ketik nama SKPD / Sub OPD..." />
          </div>
          <button onClick={buat} disabled={saving} className="btn-primary">
            {saving ? 'Membuat & mengambil barang...' : 'Buat & Ambil Barang'}
          </button>
          <p className="text-[11px] text-gray-400">
            Lembar dibuat untuk <b>satu unit saja</b> — barang sub-unit TIDAK ikut, jadi satu
            barang tak pernah punya dua lembar. Tiap sub-unit membuat lembarnya sendiri, supaya
            jelas siapa pemiliknya dan tak ada lembar yang muncul tanpa sepengetahuan unitnya.
          </p>
        </div>
      )}

      {/* Filter: SKPD satu baris penuh, lalu Tahun / Status (+ Jenis Aset bila
          tidak dikunci route) / tautan LHI. */}
      <div className="card p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => setFilterSkpdIds(sel.descendantIds)}
            placeholder="Semua SKPD — atau ketik nama SKPD..." />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun</label>
            <select className="select-filter" value={filterTahun}
              onChange={e => setFilterTahun(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Semua Tahun</option>
              {tahunOpsi.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {!golonganLock && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={filterGolongan} onChange={e => setFilterGolongan(e.target.value)}>
                <option value="">Semua Jenis Aset</option>
                {GOLONGAN_OPSI.map(g => <option key={g.kode} value={g.kode}>{g.label}</option>)}
              </select>
            </div>
          )}
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
            Laporan Hasil (LHI)
          </Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">SKPD</th>
                <th className="table-th whitespace-nowrap">Tahun</th>
                {!golonganLock && <th className="table-th whitespace-nowrap">Jenis Aset</th>}
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
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">
                  {golonganLock ? `Belum ada inventarisasi ${config.label}.` : 'Belum ada inventarisasi.'}
                </td></tr>
              ) : terlihat.map(h => (
                <tr key={h.id}>
                  <td className="table-td text-sm">{h.skpd?.nama || `SKPD #${h.skpd_id}`}</td>
                  <td className="table-td text-xs text-gray-500">{h.tahun}</td>
                  {!golonganLock && <td className="table-td text-xs">{konfigLki(h.golongan).label}</td>}
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
                    {/* Hapus hanya saat draft/dikembalikan — sesuai policy RLS. */}
                    {(h.status === 'draft' || h.status === 'dikembalikan') && (
                      <button onClick={() => hapus(h)} className="ml-3 text-red-500 hover:text-red-700 text-xs font-medium">
                        Hapus
                      </button>
                    )}
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
