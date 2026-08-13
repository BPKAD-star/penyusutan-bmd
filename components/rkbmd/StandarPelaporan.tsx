'use client'
// Standar Harga → Pelaporan. MURNI KELUARAN: isi acuan bersama yang sudah
// tervalidasi, plus Export Excel. Pola sama dengan RKBMD → Pelaporan.
//
// Isinya dibaca langsung dari BAK BERSAMA (`rkbmd_standar` / `rkbmd_sbsk`) —
// dan justru itu jaminannya: sejak migrasi 20260813_03, satu-satunya jalan
// masuk ke sana adalah lewat persetujuan usulan (`fn_standar_usulan_setujui`).
// Jadi tak ada filter status yang perlu disetel di sini, dan tak ada cara
// halaman ini menampilkan sesuatu yang belum ditetapkan.
//
// ⚠️ Halaman ini TIDAK menyediakan tombol Tambah. Menambah standar harga
// langsung ke acuan bersama akan memintas seluruh alur usulan→validasi yang
// baru dibangun — pintunya cuma satu: menu Usulan Standar Harga.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { fetchStandar, type StandarJenis, type StandarRow } from '@/lib/rkbmdStandar'
import { USULAN_JENIS, type UsulanJenis } from '@/lib/rkbmdStandarUsulan'

const TAHUN_DEFAULT = new Date().getFullYear() + 1

/** Baris SBSK — bentuknya beda (kuantitas standar, bukan harga) & tabelnya
 *  sendiri, jadi dirakit terpisah lalu ditampilkan di tabelnya sendiri. */
type SbskRow = {
  id: number; tahun: number; kode: string; spesifikasi: string | null
  satuan_pengukur: string; kuantitas_standar: number; satuan: string | null; keterangan: string | null
}

export default function StandarPelaporan() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [jenis, setJenis] = useState<UsulanJenis>('ssh')
  const [rows, setRows] = useState<StandarRow[]>([])
  const [sbsk, setSbsk] = useState<SbskRow[]>([])
  // kode barang → uraian BAKU dari kodefikasi. Sengaja di-lookup, BUKAN memakai
  // `nama` yang tersimpan: `nama` itu spesifikasi yang diketik pengusul,
  // sedangkan "Uraian Barang" harus ikut nomenklatur terkini — pola yang sama
  // dengan Daftar Barang, Penyusutan, & lembar cetak RKBMD.
  const [uraian, setUraian] = useState<Map<string, string>>(new Map())
  const [cari, setCari] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Fail-closed (rules.md): kegagalan query dikosongkan + ditampilkan, TIDAK
  // dibiarkan terbaca sebagai "acuannya memang belum diisi" — operator bisa
  // menyimpulkan SKPD-nya harus mengusulkan ulang padahal querynya yang gagal.
  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      if (jenis === 'sbsk') {
        const { data, error } = await supabase.from('rkbmd_sbsk')
          .select('id,tahun,kode,spesifikasi,satuan_pengukur,kuantitas_standar,satuan,keterangan')
          .eq('tahun', tahun).order('kode')
        if (error) throw new Error(`gagal membaca standar kebutuhan: ${error.message}`)
        setSbsk((data || []) as SbskRow[]); setRows([]); setUraian(new Map())
      } else {
        const data = await fetchStandar(supabase, jenis as StandarJenis, tahun)
        setRows(data); setSbsk([])

        // Uraian baku per kode. ASB/SBU tak berkode barang → tak ada yang dicari.
        const kodes = [...new Set(data.map(r => r.kode).filter((k): k is string => !!k))]
        const peta = new Map<string, string>()
        for (let i = 0; i < kodes.length; i += 500) {
          const { data: kd, error: e2 } = await supabase.from('admin_kodefikasi_bmd')
            .select('kode,uraian').in('kode', kodes.slice(i, i + 500))
          if (e2) throw new Error(`gagal membaca uraian kodefikasi: ${e2.message}`)
          for (const k of (kd || []) as { kode: string; uraian: string | null }[]) {
            peta.set(k.kode, k.uraian || '')
          }
        }
        setUraian(peta)
      }
    } catch (e) {
      setRows([]); setSbsk([]); setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [jenis, tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const q = cari.trim().toLowerCase()
  const tampilStandar = useMemo(() => !q ? rows : rows.filter(r =>
    r.nama.toLowerCase().includes(q) ||
    (r.kode || '').toLowerCase().includes(q) ||
    (r.satuan || '').toLowerCase().includes(q) ||
    r.rekening.some(k => k.toLowerCase().includes(q))), [rows, q])
  const tampilSbsk = useMemo(() => !q ? sbsk : sbsk.filter(r =>
    (r.spesifikasi || '').toLowerCase().includes(q) ||
    r.kode.toLowerCase().includes(q) ||
    r.satuan_pengukur.toLowerCase().includes(q)), [sbsk, q])

  const label = USULAN_JENIS.find(j => j.key === jenis)!.label
  const jumlah = jenis === 'sbsk' ? tampilSbsk.length : tampilStandar.length

  function handleExport() {
    if (err || jumlah === 0) return
    if (jenis === 'sbsk') {
      exportToExcel(tampilSbsk.map(r => ({
        'Kode Barang': r.kode,
        'Spesifikasi': r.spesifikasi || '',
        'Satuan': r.satuan || '',
        'Satuan Pengukur': r.satuan_pengukur,
        'Kuantitas Standar': r.kuantitas_standar,
        'Keterangan': r.keterangan || '',
      })), `Standar-Kebutuhan-${tahun}`, `SBSK ${tahun}`)
      return
    }
    // Urutan kolom DITENTUKAN USER (2026-08-13) & sama persis dengan layar —
    // urutan properti objek pertama = urutan kolom Excel (`json_to_sheet` ikut
    // key objeknya), jadi jangan diacak saat menambah kolom baru.
    exportToExcel(tampilStandar.map(r => ({
      'Diinput oleh': r.skpd_nama || '',
      'Kode Barang': r.kode || '',
      'Uraian Barang': (r.kode && uraian.get(r.kode)) || '',
      'Spesifikasi Nama Barang': r.nama,
      'Merk / Tipe': r.merk_tipe || '',
      'Satuan': r.satuan || '',
      'Harga Satuan': r.harga,
      'TKDN (%)': r.tkdn ?? '',
      // Rekening bisa lebih dari satu (hasil penggabungan antar-SKPD) — di satu
      // sel dipisah "; " supaya tetap terbaca sebagai daftar, bukan hilang.
      'Kode Rekening': r.rekening.join('; '),
      'Keterangan': r.keterangan || '',
    })), `${label}-${tahun}`, `${label} ${tahun}`)
  }

  return (
    <FormShell
      judul="Pelaporan Standar Harga"
      deskripsi="Acuan bersama yang sudah ditetapkan Pengelola Barang — inilah yang dipakai seluruh SKPD menyusun RKBMD Pengadaan. Penambahan hanya lewat menu Usulan Standar Harga."
      msg=""
      headerRight={
        <div className="text-right">
          <p className="text-xs text-gray-400">{label} TA {tahun}</p>
          <p className="text-lg font-bold text-gray-900">{err ? '—' : `${jumlah} baris`}</p>
        </div>
      }
    >
      {err && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
            <input type="number" className="select-filter w-28" value={tahun}
              onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis</label>
            <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value as UsulanJenis)}>
              {USULAN_JENIS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
            </select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs text-gray-500 mb-1">Cari</label>
            <input className="select-filter w-full" value={cari} onChange={e => setCari(e.target.value)}
              placeholder="Nama / kode barang / satuan / kode rekening..." />
          </div>
          <button className="btn-primary" onClick={handleExport} disabled={loading || !!err || jumlah === 0}>
            Export Excel
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Memuat...</p>
        ) : err ? (
          <p className="text-sm text-red-500 py-10 text-center">Data tidak ditampilkan karena terjadi kesalahan di atas.</p>
        ) : jenis === 'sbsk' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Kode Barang</th>
                <th className="table-th">Spesifikasi</th>
                <th className="table-th">Satuan</th>
                <th className="table-th">Satuan Pengukur</th>
                <th className="table-th text-right">Kuantitas Standar</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tampilSbsk.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">
                  Belum ada Standar Kebutuhan yang ditetapkan untuk TA {tahun}.
                </td></tr>
              ) : tampilSbsk.map(r => (
                <tr key={r.id}>
                  <td className="table-td text-xs whitespace-nowrap">{r.kode}</td>
                  <td className="table-td text-xs text-gray-800">{r.spesifikasi || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{r.satuan || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{r.satuan_pengukur}</td>
                  <td className="table-td text-xs text-right">{r.kuantitas_standar}</td>
                  <td className="table-td text-xs text-gray-500">{r.keterangan || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              {/* Urutan kolom ditentukan user 2026-08-13. "Uraian Barang" =
                  nomenklatur baku dari kodefikasi; "Spesifikasi Nama Barang" =
                  yang diketik pengusul. Dua hal berbeda, jangan digabung. */}
              <tr>
                <th className="table-th">Diinput oleh</th>
                <th className="table-th">Kode Barang</th>
                <th className="table-th">Uraian Barang</th>
                <th className="table-th">Spesifikasi Nama Barang</th>
                <th className="table-th">Merk / Tipe</th>
                <th className="table-th">Satuan</th>
                <th className="table-th text-right">Harga Satuan</th>
                <th className="table-th text-center">TKDN</th>
                <th className="table-th">Kode Rekening</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tampilStandar.length === 0 ? (
                <tr><td colSpan={10} className="table-td text-center py-8 text-gray-400">
                  Belum ada {label} yang ditetapkan untuk TA {tahun}.
                  <span className="block text-[11px] mt-1">
                    Isinya datang dari usulan SKPD yang sudah disetujui di menu Validasi.
                  </span>
                </td></tr>
              ) : tampilStandar.map(r => (
                <tr key={r.id}>
                  <td className="table-td text-xs text-gray-500">{r.skpd_nama || '—'}</td>
                  <td className="table-td text-xs whitespace-nowrap">{r.kode || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{(r.kode && uraian.get(r.kode)) || '—'}</td>
                  <td className="table-td text-xs text-gray-800">{r.nama}</td>
                  <td className="table-td text-xs text-gray-600">{r.merk_tipe || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{r.satuan || '—'}</td>
                  <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(r.harga)}</td>
                  <td className="table-td text-xs text-center whitespace-nowrap">
                    {r.tkdn != null ? `${r.tkdn}%` : '—'}
                  </td>
                  <td className="table-td text-[11px] text-gray-500">
                    {r.rekening.length === 0 ? '—' : r.rekening.map(k => <div key={k}>{k}</div>)}
                  </td>
                  <td className="table-td text-xs text-gray-500">{r.keterangan || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FormShell>
  )
}
