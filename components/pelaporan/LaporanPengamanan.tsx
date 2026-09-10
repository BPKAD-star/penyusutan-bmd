'use client'
// ============================================================================
// Menu Pelaporan → Pengelolaan → PENGAMANAN.
//
// Tiga tab, susunan yang sama dgn Reklasifikasi / Koreksi / Penghapusan:
//
//   Daftar             — barang dalam kustodi pegawai penanggung jawab
//   Rekap per SKPD     — matriks SKPD (root) × jenis aset
//   Format Permendagri — IV.J.1.2 (Peralatan & Mesin) & IV.J.2.2 (Rumah Negara)
//
// Sumbernya `jurnal_header` kategori 'pengamanan' + ledger; keanggotaan
// ditentukan per (header, aset) dgn baris TERAKHIR menang — `pengamanan` set,
// `pengembalian_pengamanan` menandai dikembalikan (tetap tampil sbg riwayat),
// `batal_pengamanan` membuang dari kartu.
//
// ⚠️ **NILAI DIBACA DARI `aset.nilai_perolehan`, BUKAN `transaksi_bmd.nilai`.**
// Pengamanan itu peristiwa NETRAL (kustodi fisik, tak menggeser nilai maupun
// penyusutan), jadi baris ledgernya sengaja ditulis `nilai: 0` — lihat
// `Pengamanan.tsx`. Sampai 2026-09-09 laporan ini membaca kolom itu apa adanya,
// jadi kolom "Nilai" menampilkan **Rp0 untuk SETIAP barang** tanpa satu pun
// error, dan angka nol itu terbaca operator sebagai "barangnya memang tak
// bernilai". Rekap per SKPD mustahil berarti apa-apa di atasnya.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useProfilRole } from '@/components/useProfilRole'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { bangunPohonRekap, ratakanPohon, type LeafRekap } from '@/lib/rekapPohon'
import { useSkpdTree } from '@/components/useSkpdTree'
import { identitasPengamanan, type PayloadPengamanan } from '@/lib/pengamanan'
import PengamananFormatPermendagri from './PengamananFormatPermendagri'
import { GayaCetakLaporan, KopCetak, TombolCetak, useKonfirmasiCetak } from '@/components/pelaporan/CetakLaporan'

type Row = {
  key: string; skpdId: number; skpd: string
  pegawai: string; identitas: string; statusPenghuni: string; jabatan: string
  bastNo: string; bastTgl: string; paktaNo: string; paktaTgl: string
  nibar: string; kode: string; nama: string; status: string; nilai: number
}

export default function LaporanPengamanan() {
  const { role, skpdId: myScopeId } = useProfilRole()
  const isAdmin = role === 'admin'
  const supabase = createClient()
  const konfirmasiCetak = useKonfirmasiCetak()
  const { byId: skpdById, childrenOf, rootOf, loaded: skpdLoaded } = useSkpdTree()
  // Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di bawahnya
  // (keputusan user 2026-09-10) — lihat catatan sama di LaporanPerolehan.tsx.
  const bolehRekap = isAdmin || (myScopeId != null && (childrenOf.get(myScopeId)?.length ?? 0) > 0)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  // ── Tab "Format Permendagri" (IV.J.1.2 & IV.J.2.2) ──────────────────────
  // ⚠️ `skpdId` DIPISAH dari `descIds`: tab Daftar & Rekap menyaring se-subtree
  // (`descendantIds`), sementara lembar Permendagri per-SKPD & memuat identitas
  // SKPD itu di kopnya. Memakai satu nilai untuk dua maksud membuat lembar
  // berkop satu SKPD berisi barang seluruh subtree-nya.
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [periode, setPeriode] = useState('')
  const [tab, setTab] = useState<'daftar' | 'matrix' | 'permendagri'>('daftar')
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [skpdNama, setSkpdNama] = useState('')

  const build = useCallback(async (): Promise<Row[]> => {
    let hq = supabase.from('jurnal_header')
      .select('id,no_sk,tanggal,skpd_id,payload').eq('kategori', 'pengamanan')
    if (descIds && descIds.length > 0) hq = hq.in('skpd_id', descIds)
    const { data: headers } = await hq.order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as { id: string; no_sk: string; tanggal: string; skpd_id: number; payload: PayloadPengamanan | null }[]
    if (hs.length === 0) return []

    const skpdIds = [...new Set(hs.map(h => h.skpd_id))]
    const { data: skpdRows } = await supabase.from('admin_skpd').select('id,nama').in('id', skpdIds)
    const namaPerSkpd: Record<number, string> = Object.fromEntries((skpdRows || []).map(s => [s.id, s.nama]))
    const hById = new Map(hs.map(h => [h.id, h]))

    // ⚠️ `kode` & `nilai_perolehan` ikut ditarik — keduanya milik REGISTER, tak
    // ada di baris ledger: kode menentukan kolom jenis aset di Rekap per SKPD,
    // nilai perolehan menggantikan `transaksi_bmd.nilai` yang selalu 0.
    const { data: led } = await supabase.from('transaksi_bmd')
      .select('id,header_id,jenis,aset:aset_id(id,nibar,nama_barang,kode,nilai_perolehan,skpd_id)')
      .in('jenis', ['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'] as never)
      .in('header_id', hs.map(h => h.id)).order('id', { ascending: true })
    const ledRows = (led || []) as unknown as {
      id: number; header_id: string; jenis: string
      aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; nilai_perolehan: number | null; skpd_id: number | null } | null
    }[]

    type Acc = { nibar: string; kode: string; nama: string; nilai: number; dikembalikan: boolean; headerId: string }
    const acc = new Map<string, Acc>()
    for (const r of ledRows) {
      if (!r.aset || !hById.has(r.header_id)) continue
      const key = `${r.header_id}|${r.aset.id}`
      if (r.jenis === 'pengamanan') {
        acc.set(key, {
          nibar: r.aset.nibar || '-', kode: r.aset.kode || '', nama: r.aset.nama_barang || '-',
          nilai: r.aset.nilai_perolehan || 0, dikembalikan: false, headerId: r.header_id,
        })
      } else if (r.jenis === 'pengembalian_pengamanan') {
        const cur = acc.get(key); if (cur) cur.dikembalikan = true
      } else { acc.delete(key) }
    }
    const out: Row[] = []
    for (const [key, v] of acc) {
      const h = hById.get(v.headerId)!
      const p = h.payload || {}
      out.push({
        key, skpdId: h.skpd_id, skpd: namaPerSkpd[h.skpd_id] || '-',
        pegawai: p.nama_pegawai || '-',
        // ⚠️ Kartu sebelum 2026-09-08 menyimpan nomor identitasnya di `nip`;
        // `identitasPengamanan` yang menjembatani dua generasi payload itu.
        identitas: identitasPengamanan(p) || '-',
        statusPenghuni: p.status_penghuni || '-', jabatan: p.jabatan || '-',
        bastNo: h.no_sk, bastTgl: h.tanggal,
        paktaNo: p.pakta_no || '-', paktaTgl: p.pakta_tgl || '-',
        nibar: v.nibar, kode: v.kode, nama: v.nama,
        status: v.dikembalikan ? 'Dikembalikan' : 'Diamankan', nilai: v.nilai,
      })
    }
    return status ? out.filter(r => r.status === status) : out
  }, [descIds, status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { (async () => { setLoading(true); setRows(await build()); setLoading(false) })() }, [build])

  const nDiamankan = rows.filter(r => r.status === 'Diamankan').length
  const nKembali = rows.filter(r => r.status === 'Dikembalikan').length
  const totalNilai = rows.reduce((s, r) => s + r.nilai, 0)

  // Rekap per SKPD diturunkan dari baris yang SUDAH dimuat — tak ada query
  // kedua, jadi mustahil beda dari tab sebelah (termasuk saat Status disaring).
  const matrix: MatrixRow[] = (() => {
    if (!skpdLoaded) return []
    const leaf = new Map<number, LeafRekap>()
    for (const r of rows) {
      // Diatribusikan ke SKPD PEMEGANG KARTU (`jurnal_header.skpd_id`) — sama
      // dgn kolom SKPD di tab Daftar & sama dgn yang disaring picker di atas.
      // Pengamanan tak pernah lintas-SKPD, jadi ia juga pemilik barangnya.
      const nama = skpdById.get(r.skpdId)?.nama ?? r.skpd
      const l = leaf.get(r.skpdId) ?? { nama, cells: {} }
      const c = (l.cells[kodeLevel3(r.kode)] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
      c.perolehan += r.nilai
      leaf.set(r.skpdId, l)
    }
    const akarIds = isAdmin
      ? [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
      : (myScopeId != null ? [myScopeId] : [])
    return bangunPohonRekap(leaf, skpdById, akarIds)
  })()

  const namaBerkas = (akhiran?: string[]) =>
    namaBerkasLaporan({ laporan: 'Laporan Pengamanan', skpd: skpdNama, akhiran })

  async function handleExport() {
    setExporting(true)
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpd, 'Nama Pegawai': r.pegawai, 'Nomor Identitas': r.identitas,
      'Status Penghuni/Pemakai': r.statusPenghuni, 'Jabatan': r.jabatan,
      'No. BAST': r.bastNo, 'Tgl BAST': r.bastTgl, 'No. Pakta': r.paktaNo, 'Tgl Pakta': r.paktaTgl,
      'NIBAR': r.nibar, 'Kode Barang': r.kode, 'Nama Barang': r.nama,
      'Status': r.status, 'Nilai Perolehan (Rp)': r.nilai,
    })), namaBerkas(), 'Pengamanan')
    setExporting(false)
  }

  function handleExportMatrix() {
    exportToExcel(ratakanPohon(matrix).map(({ row: r, namaBerindentasi }) => {
      const row: Record<string, unknown> = { SKPD: namaBerindentasi }
      let total = 0
      for (const g of GOLONGAN_REKAP) { const v = r.cells[g.kode]?.perolehan || 0; row[g.uraian] = v; total += v }
      row['Total'] = total
      return row
    }), namaBerkas(['per SKPD']), 'Rekap per SKPD')
  }

  // Tabel di sini sudah memuat SELURUH baris, jadi cetak = langsung print.
  async function handleCetak() {
    if (rows.length === 0) return
    if (!(await konfirmasiCetak(rows.length))) return
    window.print()
  }

  return (
    <div className="p-6" id="cetak-laporan">
      <GayaCetakLaporan />
      <KopCetak judul="Laporan Pengamanan BMD" baris={[
        `SKPD: ${skpdNama || 'Seluruh SKPD'}`,
        `Status: ${status || 'Semua'}`,
        `${rows.length.toLocaleString('id-ID')} barang`,
      ]} />

      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Pengamanan</h1>
          <p className="text-gray-500 text-sm mt-1">Rekap barang dalam kustodi pegawai penanggung jawab. Kosongkan SKPD untuk se-kabupaten.</p>
        </div>
        {tab === 'daftar' && (
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-primary">{exporting ? 'Mengekspor...' : 'Export Excel'}</button>
            <TombolCetak onClick={handleCetak} disabled={loading || rows.length === 0} />
          </div>
        )}
        {tab === 'matrix' && (
          <button onClick={handleExportMatrix} disabled={matrix.length === 0} className="btn-primary">Export Excel</button>
        )}
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm no-print">
        {/* Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di
            bawahnya (keputusan user 2026-09-10) — lihat `bolehRekap`. */}
        {([['daftar', 'Daftar'] as const,
          ...(bolehRekap ? [['matrix', 'Rekap per SKPD'] as const] : []),
          ['permendagri', 'Format Permendagri'] as const] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-md transition-colors ${tab === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end no-print">
        {/* Periode cuma dipakai lembar Permendagri — tab Daftar & Rekap
            menampilkan posisi TERKINI & memang tak punya dimensi waktu (lihat
            aturan nama berkas di CLAUDE.md: KIR/Pengamanan/Pemanfaatan/Kendaraan). */}
        {tab === 'permendagri' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Periode</label>
            <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
              <option value="">— pilih —</option>
              {[String(new Date().getFullYear()), String(new Date().getFullYear() - 1)].flatMap(t => [
                <option key={`${t}-S1`} value={`${t}-S1`}>{t} — Semester I</option>,
                <option key={`${t}-S2`} value={`${t}-S2`}>{t} — Semester II</option>,
                <option key={t} value={t}>{t} — Akhir Tahun</option>,
              ])}
            </select>
          </div>
        )}
        {tab !== 'permendagri' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select className="select-filter" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Semua</option>
              <option value="Diamankan">Diamankan</option>
              <option value="Dikembalikan">Dikembalikan</option>
            </select>
          </div>
        )}
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..."
            onChangeSelection={async sel => {
              setDescIds(sel.descendantIds)
              setSkpdId(sel.skpdId)
              if (sel.skpdId == null) { setSkpdNama(''); return }
              const { data } = await supabase.from('admin_skpd').select('nama').eq('id', sel.skpdId).maybeSingle()
              setSkpdNama((data as { nama: string } | null)?.nama || '')
            }} />
        </div>
      </div>

      {tab === 'permendagri' ? (
        <PengamananFormatPermendagri skpdId={skpdId} periode={periode} />
      ) : tab === 'matrix' ? (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Nilai perolehan barang yang berada dalam kustodi, dikelompokkan per{' '}
            <b>SKPD induk</b> × jenis aset. Mengikuti penyaring <b>Status</b> di atas
            {status ? <> — sekarang hanya <b>{status}</b></> : <> — sekarang <b>semua status</b></>}.
          </p>
          <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={loading} />
        </>
      ) : (
        <>
      <div className="grid grid-cols-4 gap-3 mb-4 no-print">
        <div className="card p-4"><p className="text-xs text-gray-500">Total Barang</p><p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Diamankan</p><p className="text-lg font-bold text-green-700 mt-1">{nDiamankan.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Dikembalikan</p><p className="text-lg font-bold text-gray-500 mt-1">{nKembali.toLocaleString('id-ID')}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Nilai Perolehan</p><p className="text-lg font-bold text-teal mt-1">{formatRupiah(totalNilai)}</p></div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 no-print"><span className="text-sm text-gray-500">{rows.length} barang</span></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th">SKPD</th><th className="table-th">Penghuni / Pemakai</th><th className="table-th">BAST</th>
                <th className="table-th">Pakta Integritas</th><th className="table-th">Barang</th>
                <th className="table-th text-center">Status</th><th className="table-th text-right">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-12 text-gray-400">Tidak ada data pengamanan</td></tr>
              ) : rows.map(r => (
                <tr key={r.key}>
                  <td className="table-td text-xs">{r.skpd}</td>
                  <td className="table-td text-xs"><p className="font-medium">{r.pegawai}</p><p className="text-gray-400">{r.identitas} · {r.statusPenghuni}{r.jabatan !== '-' ? ` · ${r.jabatan}` : ''}</p></td>
                  <td className="table-td text-xs">{r.bastNo}<br /><span className="text-gray-400">{r.bastTgl}</span></td>
                  <td className="table-td text-xs">{r.paktaNo}<br /><span className="text-gray-400">{r.paktaTgl}</span></td>
                  <td className="table-td text-xs"><p className="font-medium">{r.nama}</p><p className="text-gray-400">{r.nibar}</p></td>
                  <td className="table-td text-center text-xs">{r.status}</td>
                  <td className="table-td text-right text-xs">{formatRupiah(r.nilai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
