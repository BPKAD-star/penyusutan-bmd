'use client'
// Rekap transaksi ledger per jenis / periode / SKPD + export Excel (PLAN §9).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'
import { fetchBatalTargets } from '@/lib/voidedAset'
import SkpdCombobox from '@/components/SkpdCombobox'
import { GayaCetakLaporan, KopCetak, TombolCetak, useKonfirmasiCetak } from '@/components/pelaporan/CetakLaporan'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type Trx = {
  id: number
  aset_id: string
  jenis: string
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  payload: Record<string, unknown>
  aset: { nibar: string | null; nama_barang: string | null; kode: string; status: string } | null
  asal: { nama: string } | null
  tujuan: { nama: string } | null
}

// Dari kumpulan baris (jenisList = suatu aksi + kebalikannya, mis. penghapusan/batal_penghapusan),
// sisakan baris TERBARU per aset (id desc — ledger append-only), dan hanya kalau status aset
// SEKARANG masih mencerminkan aksi itu. Ini mencegah rekap dobel-hitung ketika satu barang
// sempat dicoba berkali-kali (aksi → batal → aksi lagi) sebelum mencapai status akhirnya.
function efektifPerAset(rows: Trx[], statusEfektif: string): Trx[] {
  const seen = new Set<string>()
  return rows.filter(r => {
    if (!r.aset_id || seen.has(r.aset_id)) return false
    seen.add(r.aset_id)
    return r.aset?.status === statusEfektif
  })
}

export default function LaporanTransaksi({ judul, deskripsi, jenisList, filePrefix, sembunyikanAsetDihapus, efektifPerAsetStatus, batalJenis, arah }: {
  judul: string
  deskripsi: string
  jenisList: string[]
  filePrefix: string
  sembunyikanAsetDihapus?: boolean
  /** Kalau diisi (mis. 'dihapus'): sisakan hanya baris terbaru per aset yang status-nya SEKARANG
   *  masih itu — supaya percobaan yang sudah dibatalkan/ditumpuk tidak dobel-hitung di rekap. */
  efektifPerAsetStatus?: string
  /** Jenis `batal_*` yang menganulir baris lewat payload.target_trx_id (mis.
   *  ['batal_kapitalisasi']). Baris yang jadi target DIBUANG dari laporan —
   *  tanpa ini transaksi yang sudah dibatalkan tetap tampil seolah berlaku,
   *  dan angkanya beda dgn engine & Rekonsiliasi. Lihat lib/voidedAset.ts. */
  batalJenis?: readonly string[]
  /** Arah perpindahan relatif SKPD yang dipilih — untuk jenis transfer yang
   *  memakai skpd_asal/skpd_tujuan (mis. mutasi_internal). 'masuk' = SKPD
   *  terpilih sbg TUJUAN (penerimaan), 'keluar' = sbg ASAL (pengeluaran).
   *  Tanpa ini, Laporan Penerimaan & Pengeluaran Internal menghasilkan baris
   *  yang PERSIS SAMA (filter default mencocokkan asal ATAU tujuan).
   *  Hanya berlaku saat SKPD dipilih — se-kabupaten tak punya sudut pandang. */
  arah?: 'masuk' | 'keluar'
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const konfirmasiCetak = useKonfirmasiCetak()
  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('')
  const [jenis, setJenis] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [skpdNama, setSkpdNama] = useState('')
  // Baris LENGKAP khusus untuk cetak. Tabel di layar sengaja dibatasi 500 baris,
  // tapi PDF yang cuma memuat 500 dari (misalnya) 4.000 transaksi adalah dokumen
  // yang MENYESATKAN — ia tidak terlihat terpotong. Jadi saat mencetak, seluruh
  // baris ditarik dulu (sama persis dengan Export Excel), dirender, baru dicetak.
  const [barisCetak, setBarisCetak] = useState<Trx[] | null>(null)
  const [menyiapkan, setMenyiapkan] = useState(false)
  // null = belum dimuat (atau memang tak perlu difilter → Set kosong).
  const [batalTargets, setBatalTargets] = useState<Set<number> | null>(null)

  useEffect(() => {
    if (!batalJenis || batalJenis.length === 0) { setBatalTargets(new Set()); return }
    fetchBatalTargets(supabase, batalJenis).then(setBatalTargets)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // daftar periode yang ada transaksi (dropdown dinamis)
    // ⚠️ `order('id')`, BUKAN `order('periode')` — sama bug & obat dgn
    // LaporanPerolehan.tsx: `jenis` (ENUM) tak bisa jadi index-cond di bawah
    // RLS, jadi order('periode') menyusuri index periode MUNDUR sambil
    // membuang ratusan ribu baris jenis lain → TIMEOUT (diukur nyata 14 dtk
    // utk kasus serupa). order('id') cocok dgn index parsial per-jenis yang
    // sudah dipakai buildQuery di bawah (idx_trx_reklas_id/_penghapusan_id/
    // _pindah_id/dst) → jauh lebih murah.
    supabase.from('transaksi_bmd').select('periode').in('jenis', jenisList as never)
      .order('id', { ascending: false }).limit(1000)
      .then(({ data }) => setPeriodeList([...new Set((data || []).map(r => r.periode))].sort().reverse()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildQuery = useCallback(() => {
    let q = supabase.from('transaksi_bmd')
      .select('id,aset_id,jenis,periode,tanggal,nilai,keterangan,payload,aset(nibar,nama_barang,kode,status),asal:skpd_asal(nama),tujuan:skpd_tujuan(nama)')
      .in('jenis', (jenis ? [jenis] : jenisList) as never)
      .order('id', { ascending: false })
    if (periode) q = q.eq('periode', periode)
    if (descIds && descIds.length > 0) {
      // arah 'masuk'/'keluar' → cocokkan SATU sisi saja, supaya Penerimaan &
      // Pengeluaran Internal tidak menampilkan baris yang sama persis.
      if (arah === 'masuk') q = q.in('skpd_tujuan', descIds)
      else if (arah === 'keluar') q = q.in('skpd_asal', descIds)
      else {
        const list = descIds.join(',')
        q = q.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
      }
    }
    return q
  }, [jenis, periode, descIds, jenisList, arah]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!batalTargets) return // tunggu set pembatalan termuat
    ;(async () => {
      setLoading(true)
      const { data } = await buildQuery().limit(500)
      let hasil = (data as never as Trx[]) || []
      if (batalTargets.size > 0) hasil = hasil.filter(r => !batalTargets.has(r.id))
      if (sembunyikanAsetDihapus) hasil = hasil.filter(r => r.aset?.status !== 'dihapus')
      if (efektifPerAsetStatus) hasil = efektifPerAset(hasil, efektifPerAsetStatus)
      setRows(hasil)
      setLoading(false)
    })()
  }, [buildQuery, sembunyikanAsetDihapus, efektifPerAsetStatus, batalTargets])

  // Rekap per jenis
  const rekap = new Map<string, { n: number; nilai: number }>()
  for (const r of rows) {
    const cur = rekap.get(r.jenis) || { n: 0, nilai: 0 }
    cur.n += 1
    cur.nilai += r.nilai || 0
    rekap.set(r.jenis, cur)
  }

  // Tarikan LENGKAP (tanpa batas 500 seperti tabel layar) + penyaringan yang
  // sama persis. Dipakai bersama Export Excel & Export PDF supaya kedua berkas
  // tak mungkin berisi baris yang berbeda.
  async function ambilSemua(): Promise<Trx[]> {
    const all: Trx[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await buildQuery().range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...(data as never as Trx[]))
      if (data.length < 1000) break
    }
    let hasil = batalTargets && batalTargets.size > 0 ? all.filter(r => !batalTargets.has(r.id)) : all
    if (sembunyikanAsetDihapus) hasil = hasil.filter(r => r.aset?.status !== 'dihapus')
    if (efektifPerAsetStatus) hasil = efektifPerAset(hasil, efektifPerAsetStatus)
    return hasil
  }

  async function handleCetak() {
    setMenyiapkan(true)
    const hasil = await ambilSemua()
    setMenyiapkan(false)
    if (hasil.length === 0) {
      await konfirmasi({
        nada: 'amber', ikon: '⚠', judul: 'Tidak ada transaksi untuk dicetak',
        isi: <>Filter yang sedang aktif tidak menghasilkan satu baris pun. Longgarkan periode, SKPD,
          atau jenis transaksinya lalu coba lagi.</>,
        labelYa: 'Mengerti', tanpaBatal: true,
      })
      return
    }
    if (!(await konfirmasiCetak(hasil.length))) return
    setBarisCetak(hasil)
  }

  // Cetak SESUDAH baris lengkapnya benar-benar ter-render — kalau window.print()
  // dipanggil di handler yang sama, yang tercetak masih tabel 500 baris.
  useEffect(() => {
    if (!barisCetak) return
    const t = setTimeout(() => { window.print(); setBarisCetak(null) }, 100)
    return () => clearTimeout(t)
  }, [barisCetak])

  async function handleExport() {
    setExporting(true)
    const hasil = await ambilSemua()
    exportToExcel(hasil.map(r => ({
      'Tanggal': r.tanggal,
      'Periode': r.periode,
      'Jenis': JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis,
      'NIBAR': r.aset?.nibar || '',
      'Nama Barang': r.aset?.nama_barang || '',
      'Kode': r.aset?.kode || '',
      'SKPD Asal': r.asal?.nama || '',
      'SKPD Tujuan': r.tujuan?.nama || '',
      'Nilai (Rp)': r.nilai,
      'Keterangan': r.keterangan || '',
    })), `${filePrefix}${periode ? '_' + periode : ''}`, 'Laporan')
    setExporting(false)
  }

  // Yang dicetak = barisCetak (lengkap) kalau sedang menyiapkan PDF; selain itu
  // tabel layar apa adanya.
  const barisTampil = barisCetak ?? rows

  return (
    <div className="p-6" id="cetak-laporan">
      <GayaCetakLaporan />
      <KopCetak judul={judul} baris={[
        `Periode: ${periode || 'Semua Periode'}`,
        `SKPD: ${skpdNama || 'Seluruh SKPD'}`,
        jenis ? `Jenis: ${JENIS_TRANSAKSI_LABEL[jenis] || jenis}` : null,
        `${barisTampil.length.toLocaleString('id-ID')} transaksi`,
      ]} />

      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
          <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="btn-primary">
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
          <TombolCetak onClick={handleCetak} disabled={menyiapkan || exporting}
            label={menyiapkan ? 'Menyiapkan...' : 'Export PDF'} />
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {periodeList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {jenisList.length > 1 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis</label>
            <select className="select-filter" value={jenis} onChange={e => setJenis(e.target.value)}>
              <option value="">Semua Jenis</option>
              {jenisList.map(j => <option key={j} value={j}>{JENIS_TRANSAKSI_LABEL[j] || j}</option>)}
            </select>
          </div>
        )}
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..."
            onChangeSelection={async sel => {
              setDescIds(sel.descendantIds)
              // Namanya cuma dibutuhkan kop PDF; satu baris, jadi diambil saat
              // dipilih ketimbang menarik seluruh daftar SKPD ke halaman ini.
              if (sel.skpdId == null) { setSkpdNama(''); return }
              const { data } = await supabase.from('admin_skpd').select('nama').eq('id', sel.skpdId).maybeSingle()
              setSkpdNama((data as { nama: string } | null)?.nama || '')
            }} />
        </div>
      </div>

      {/* Rekap */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 no-print">
        {[...rekap.entries()].map(([j, v]) => (
          <div key={j} className="card p-4">
            <p className="text-xs text-gray-500">{JENIS_TRANSAKSI_LABEL[j] || j}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{v.n.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span></p>
            <p className="text-xs text-teal font-medium">{formatRupiah(v.nilai)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 no-print">
          <span className="text-sm text-gray-500">{rows.length} transaksi (maks. 500 ditampilkan — export untuk semua)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">Tanggal</th>
                <th className="table-th">Jenis</th>
                <th className="table-th">Barang</th>
                <th className="table-th">SKPD</th>
                <th className="table-th text-right">Nilai</th>
                <th className="table-th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : barisTampil.length === 0 ? (
                <tr><td colSpan={6} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
              ) : barisTampil.map(r => (
                <tr key={r.id}>
                  <td className="table-td text-xs">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
                  <td className="table-td text-xs">{JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis}</td>
                  <td className="table-td text-xs">
                    <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                    <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                  </td>
                  <td className="table-td text-xs">
                    {r.asal?.nama && <p>Dari: {r.asal.nama}</p>}
                    {r.tujuan?.nama && <p>Ke: {r.tujuan.nama}</p>}
                  </td>
                  <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                  <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">{r.keterangan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
