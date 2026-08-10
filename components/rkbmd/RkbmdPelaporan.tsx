'use client'
// RKBMD > Pelaporan — rekap dokumen RKBMD satu tahun anggaran + export Excel.
// Baca-saja; tidak ada tombol yang mengubah status (itu di menu Validasi).
//
// Fail-closed (rules.md): kalau salah satu query gagal, tabel DIKOSONGKAN dan
// pesannya ditampilkan — angka setengah jadi yang terlihat sah lalu ikut
// dilaporkan jauh lebih mahal daripada halaman yang error. Tombol Export ikut
// dimatikan saat itu supaya tak ada berkas separuh isi yang terlanjur beredar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { RKBMD_JENIS, STATUS_META, LABEL_NILAI, nilaiItemRkbmd, type RkbmdStatus, type RkbmdJenis } from '@/lib/rkbmd'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const JENIS_LABEL: Record<string, string> = Object.fromEntries(RKBMD_JENIS.map(j => [j.key, j.label]))

type Baris = {
  id: string
  skpd: string
  jenis: string
  versi: string
  status: RkbmdStatus
  /** Daftar sub kegiatan kartu-kartunya. Sudah TIDAK ditampilkan di tabel
   *  (permintaan user 2026-08-10) tapi tetap ikut ke Excel — di berkas kerja
   *  informasi itu masih berguna, sedangkan di layar ia bikin baris melebar. */
  sub_kegiatan: string
  jumlah_item: number
  /** "Total Nilai" — artinya BEDA per jenis, lihat nilaiItemRkbmd/LABEL_NILAI. */
  total: number
}

export default function RkbmdPelaporan() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [status, setStatus] = useState<'semua' | RkbmdStatus>('disetujui')
  const [jenis, setJenis] = useState<'semua' | string>('semua')
  const [rows, setRows] = useState<Baris[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    let q = supabase.from('rkbmd')
      .select('id,skpd_id,jenis,versi,status,admin_skpd(nama)')
      .eq('tahun_anggaran', tahun)
    if (status !== 'semua') q = q.eq('status', status)
    if (jenis !== 'semua') q = q.eq('jenis', jenis)
    const { data, error } = await q
    if (error) { setErr(`gagal membaca dokumen RKBMD: ${error.message}`); setRows([]); setLoading(false); return }

    const base: Baris[] = ((data || []) as unknown as {
      id: string; skpd_id: number; jenis: string; versi: string; status: RkbmdStatus
      admin_skpd: { nama: string } | null
    }[]).map(h => ({
      id: h.id, skpd: h.admin_skpd?.nama || `SKPD #${h.skpd_id}`, jenis: h.jenis, versi: h.versi,
      status: h.status, sub_kegiatan: '', jumlah_item: 0, total: 0,
    }))

    if (base.length > 0) {
      const byId = new Map(base.map(h => [h.id, h]))
      const ids = base.map(h => h.id)
      const subs = new Map<string, string[]>()
      const [pk, it] = await Promise.all([
        supabase.from('rkbmd_paket').select('rkbmd_id,sub_kegiatan').in('rkbmd_id', ids).order('no_urut'),
        // Ketiga kolom nilai ditarik sekaligus: mana yang dipakai ditentukan
        // `nilaiItemRkbmd` sesuai jenis dokumennya. Sebelum ini cuma
        // `total_anggaran` yang dibaca, jadi Pemanfaatan/Pemindahtanganan/
        // Penghapusan SELALU tampil 0.
        supabase.from('rkbmd_item').select('rkbmd_id,total_anggaran,estimasi_hasil,nilai_perolehan').in('rkbmd_id', ids),
      ])
      if (pk.error || it.error) {
        setErr(`gagal membaca isi RKBMD: ${(pk.error || it.error)!.message}`)
        setRows([]); setLoading(false); return
      }
      for (const p of (pk.data || []) as { rkbmd_id: string; sub_kegiatan: string | null }[]) {
        const h = byId.get(p.rkbmd_id)
        if (!h) continue
        const arr = subs.get(p.rkbmd_id) || []
        arr.push(p.sub_kegiatan || '(belum dipilih)')
        subs.set(p.rkbmd_id, arr)
      }
      for (const [id, arr] of subs) { const h = byId.get(id); if (h) h.sub_kegiatan = arr.join('; ') }
      for (const r of (it.data || []) as {
        rkbmd_id: string; total_anggaran: number | null; estimasi_hasil: number | null; nilai_perolehan: number | null
      }[]) {
        const h = byId.get(r.rkbmd_id)
        if (h) { h.jumlah_item += 1; h.total += nilaiItemRkbmd(h.jenis, r) }
      }
    }

    base.sort((a, b) => a.skpd.localeCompare(b.skpd) || a.jenis.localeCompare(b.jenis))
    setRows(base)
    setLoading(false)
  }, [tahun, status, jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const total = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows])
  const perJenis = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>()
    for (const r of rows) {
      const cur = m.get(r.jenis) || { n: 0, total: 0 }
      m.set(r.jenis, { n: cur.n + 1, total: cur.total + r.total })
    }
    return [...m.entries()]
  }, [rows])

  function handleExport() {
    if (err || rows.length === 0) return
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpd,
      'Jenis RKBMD': JENIS_LABEL[r.jenis] || r.jenis,
      'Versi': r.versi === 'perubahan' ? 'Perubahan' : 'Murni',
      'Status': STATUS_META[r.status].label,
      'Sub Kegiatan': r.sub_kegiatan,
      'Jumlah Item': r.jumlah_item,
      'Total Nilai': r.total,
      'Arti Total Nilai': LABEL_NILAI[r.jenis as RkbmdJenis] || '',
    })), `RKBMD-${tahun}`, `RKBMD ${tahun}`)
  }

  // `msg=""` disengaja: halaman ini baca-saja, tak ada aksi yang menghasilkan
  // pesan sukses. Kegagalan query ditampilkan sendiri lewat `err` di badan
  // halaman supaya tabelnya sekalian dikosongkan (fail-closed). FormShell
  // tetap mewajibkan prop `msg`.
  return (
    <FormShell
      judul="Pelaporan RKBMD"
      deskripsi="Rekap dokumen RKBMD seluruh SKPD per tahun anggaran, beserta total rencana anggarannya."
      msg=""
      headerRight={
        <div className="text-right">
          <p className="text-xs text-gray-400">
            {jenis === 'semua' ? 'Total Nilai (gabungan semua jenis)' : LABEL_NILAI[jenis as RkbmdJenis] || 'Total Nilai'}
          </p>
          <p className="text-lg font-bold text-gray-900">{err ? '—' : formatRupiah(total)}</p>
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
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select className="select-filter" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="disetujui">Disetujui (ditetapkan)</option>
              <option value="diajukan">Diajukan</option>
              <option value="draft">Draft</option>
              <option value="ditolak">Ditolak</option>
              <option value="semua">Semua status</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis</label>
            <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value)}>
              <option value="semua">Semua jenis</option>
              {RKBMD_JENIS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={handleExport} disabled={loading || !!err || rows.length === 0}>
            Export Excel
          </button>
          {/* Cetak SE-KABUPATEN: satu lembar per SKPD, page-break antar SKPD.
              Hanya masuk akal kalau jenisnya tunggal — lembar Pengadaan &
              Penghapusan punya susunan kolom yang berbeda, jadi mencampurnya
              dalam satu berkas justru menyulitkan pembacanya. */}
          {jenis === 'semua' ? (
            <span className="text-xs text-gray-400 pb-2 max-w-[16rem]">
              Pilih satu jenis untuk mengaktifkan cetak se-kabupaten (kolom tiap jenis berbeda).
            </span>
          ) : (
            <a
              href={`/cetak/rkbmd?tahun=${tahun}&jenis=${jenis}`}
              target="_blank" rel="noopener noreferrer"
              className={`text-sm px-3 py-2 rounded-lg border ${
                loading || err || rows.length === 0
                  ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                  : 'border-gray-200 text-gray-600 hover:text-gray-800'
              }`}
            >
              🖨 Cetak se-Kabupaten
            </a>
          )}
        </div>
      </div>

      {!err && perJenis.length > 0 && (
        <>
          {jenis === 'semua' && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              &ldquo;Total Nilai&rdquo; berbeda artinya per jenis — Pengadaan &amp; Pemeliharaan itu rencana
              <em> belanja</em>, Pemanfaatan rencana <em>pendapatan</em>, sedangkan Pemindahtanganan &amp;
              Penghapusan adalah <em>nilai perolehan</em> barang yang dilepas. Angka gabungan di kanan atas
              karena itu bukan jumlah yang bisa dibaca sebagai satu makna; pakai rincian per jenis di bawah.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {perJenis.map(([k, v]) => (
              <div key={k} className="card p-3">
                <p className="text-[11px] text-gray-400">{JENIS_LABEL[k] || k}</p>
                <p className="text-sm font-semibold text-gray-900">{formatRupiah(v.total)}</p>
                <p className="text-[11px] text-gray-400">{v.n} dokumen</p>
                <p className="text-[10px] text-gray-400 mt-1 leading-tight">{LABEL_NILAI[k as RkbmdJenis] || ''}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">SKPD</th>
              <th className="table-th">Jenis</th>
              <th className="table-th">Versi</th>
              <th className="table-th">Status</th>
              <th className="table-th text-right">Item</th>
              <th className="table-th text-right">Total Nilai</th>
              <th className="table-th w-20">Cetak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : err ? (
              <tr><td colSpan={7} className="table-td text-center py-8 text-red-500">Data tidak ditampilkan karena terjadi kesalahan di atas.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="table-td text-center py-8 text-gray-400">Tidak ada dokumen RKBMD yang cocok dengan filter.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="table-td text-xs text-gray-800">{r.skpd}</td>
                <td className="table-td text-xs">{JENIS_LABEL[r.jenis] || r.jenis}</td>
                <td className="table-td text-xs text-gray-500">{r.versi === 'perubahan' ? 'Perubahan' : 'Murni'}</td>
                <td className="table-td text-xs">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_META[r.status].cls}`}>
                    {STATUS_META[r.status].label}
                  </span>
                </td>
                <td className="table-td text-xs text-right">{r.jumlah_item}</td>
                <td className="table-td text-xs text-right whitespace-nowrap"
                  title={LABEL_NILAI[r.jenis as RkbmdJenis]}>{formatRupiah(r.total)}</td>
                <td className="table-td whitespace-nowrap">
                  <a href={`/cetak/rkbmd?id=${r.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-teal hover:underline text-xs font-medium" title="Cetak lembar usulan SKPD ini">
                    🖨 Cetak
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormShell>
  )
}
