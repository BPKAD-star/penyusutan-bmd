'use client'
// ============================================================================
// Kerangka menu laporan PERPINDAHAN barang — dipakai BERSAMA oleh:
//
//   Pelaporan → Pengelolaan → Penggunaan          (`pengalihan_status`, IV.B.1)
//   Pelaporan → Pengelolaan → Penerimaan Internal (`mutasi_internal`,  IV.C)
//
// Tiga tab, pola yang SAMA dengan Laporan Perolehan (Hibah dkk.):
//
//   Daftar Transaksi   — baris ledger apa adanya, netral arah
//   Rekap per SKPD     — matriks SKPD (root) × golongan
//   Format Permendagri — lembar rinci + empat rekap
//
// ⚠️ DIEKSTRAK 2026-08-31, di kemunculan KETIGA (CODING-STANDARD §1.2 "rule of
// three": pertama biarkan, kedua catat, ketiga WAJIB diekstrak). Catatan
// "kedua"-nya memang sudah ditulis waktu menu Penggunaan dibuat, berikut
// janjinya: "begitu menu Pengelolaan KETIGA butuh susunan tab yang sama, angkat
// kerangkanya". Ini penunaiannya.
//
// ⚠️ SENGAJA BUKAN `LaporanTransaksi` (yang masih dipakai lima menu Pengelolaan
// lain). Komponen itu tak punya tab sama sekali, pemilih periodenya daftar
// mentah periode yang kebetulan berisi, dan menambahkan tiga tab ke sana berarti
// mengubah perilaku lima menu yang belum diminta berubah. Yang TIDAK boleh
// menunggu adalah aturan integritasnya (mesin subtotal, susunan kolom lembar,
// saringan pembatalan) — semua itu sudah di lib.
//
// ⚠️ TAB 1 & TAB 3 SENGAJA BEDA CAKUPAN, dan itu wajib tertulis di layar:
// "Daftar Transaksi" netral arah (masuk & keluar), sedangkan lembar Permendagri
// judulnya "LAPORAN PENERIMAAN…" jadi hanya barang yang MASUK. Tanpa keterangan
// itu, operator melihat dua angka berbeda untuk periode yang sama & mengira
// salah satunya bug.
//
// ⚠️ Yang BEDA antar kedua menu cuma lima nilai (jenis ledger, judul, deskripsi,
// awalan nama berkas, arah bawaan) — semuanya prop. Kalau suatu saat perlu prop
// keenam yang MENGUBAH ALUR (bukan cuma teks), berhenti dulu: itu tanda kedua
// menu sudah berbeda cukup jauh untuk dipisah lagi (CODING-STANDARD §1.5).
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { LEMBAR_PERMENDAGRI, type IdLembar } from '@/lib/permendagriFormat'
import { type IdPerpindahan } from '@/lib/formatPerpindahan'
import PerpindahanFormatPermendagri from './PerpindahanFormatPermendagri'

type Trx = {
  id: number
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  payload: { no_sk?: string; reversal?: boolean; tgl_dokumen_sumber?: string } | null
  header: { no_sk: string; tanggal: string } | null
  skpd_asal: number | null
  skpd_tujuan: number | null
  aset_id: string | null
  asal: { nama: string } | null
  tujuan: { nama: string } | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    intra_ekstra: string | null
  } | null
}

const SEL = 'id,periode,tanggal,nilai,keterangan,payload,skpd_asal,skpd_tujuan,aset_id,'
  + 'header:header_id(no_sk,tanggal),asal:skpd_asal(nama),tujuan:skpd_tujuan(nama),'
  + 'aset:aset_id(kode,uraian_barang,nama_barang,nibar,intra_ekstra)'

/** Arah perpindahan relatif SKPD yang dipilih. */
type Arah = 'semua' | 'masuk' | 'keluar'
const ARAH_LABEL: Record<Arah, string> = {
  semua: 'Semua (masuk & keluar)',
  masuk: 'Masuk — diterima SKPD ini',
  keluar: 'Keluar — diserahkan SKPD ini',
}

export type PropLaporanPerpindahan = {
  /** Cabang format Permendagri-nya; juga menentukan jenis ledger yang ditarik. */
  id: IdPerpindahan
  /** Entri registry lembar — penentu ADA/TIDAKNYA tab Format Permendagri. */
  idLembar: IdLembar
  /** Jenis ledger yang disaring. */
  jenis: string
  judul: string
  deskripsi: string
  /** Awalan nama berkas Excel. */
  filePrefix: string
  /**
   * Arah bawaan tab Daftar Transaksi.
   *
   * ⚠️ BEDA per menu & wajib dipertahankan: menu "Penerimaan Internal" punya
   * saudara "Pengeluaran Internal" yang membaca ledger yang SAMA, jadi tanpa
   * bawaan `masuk` keduanya menampilkan baris yang persis sama. Menu Penggunaan
   * tak punya pasangan semacam itu, jadi bawaannya `semua`.
   */
  arahAwal: Arah
}

export default function LaporanPerpindahan(p: PropLaporanPerpindahan) {
  const supabase = createClient()
  const { rootOf, loaded: skpdLoaded } = useSkpdTree()
  const tahunBuku = useTahunBukuMap()
  // ⚠️ Dibaca dari REGISTRY, bukan dari `FORMAT_PERPINDAHAN`. Registry-lah satu-
  // satunya daftar yang menjawab "lembar ini sudah ada atau belum" (lihat
  // kepala lib/permendagriFormat.ts); `FORMAT_PERPINDAHAN` menjawab pertanyaan
  // lain — bentuk tabelnya. Dua daftar yang sama-sama boleh bilang "ada" pasti
  // menyimpang, dan gejalanya cuma tab yang muncul tanpa isi.
  // ⚠️ Sengaja BUKAN `lembarPerolehan()`: fungsi itu mencari lewat
  // `caraPerolehan`, dan perpindahan bukan cara perolehan.
  const lembar = LEMBAR_PERMENDAGRI[p.idLembar]

  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState('')
  const [periode, setPeriode] = useState('')
  const [arah, setArah] = useState<Arah>(p.arahAwal)
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [selSkpdId, setSelSkpdId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'matrix' | 'permendagri'>('list')
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [matrixLoading, setMatrixLoading] = useState(false)

  // ⚠️ HANYA TAHUN KERJA BERJALAN, sejalan dgn Laporan Perolehan & badge di
  // TopBar. Tiap tahun SELALU menawarkan ketiganya — semester yang belum ada
  // transaksinya tetap bisa dipilih & dicetak (hasilnya lembar "tidak ada
  // penerimaan penggunaan pada periode ini", yang memang jawaban yang sah).
  const tahunTerbuka = Object.entries(tahunBuku)
    .filter(([, st]) => st === 'terbuka').map(([t]) => Number(t))
  const tahunKerja = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : new Date().getFullYear()
  const tahunList = [String(tahunKerja)]

  const buildQuery = useCallback(() => {
    // ⚠️ `.order('id')`, BUKAN `.order('periode')`/`('tanggal')`: `jenis` bertipe
    // ENUM tak bisa jadi index-cond di bawah RLS (CLAUDE.md "ronde 3"), jadi
    // urutan yang dipakai menentukan index mana yang sanggup melayani. Bentuk
    // ini dilayani partial index `idx_trx_pindah_id` (migrasi 20260729_01).
    let q = supabase.from('transaksi_bmd').select(SEL)
      .eq('jenis', p.jenis)
      .order('id', { ascending: false })
    // ⚠️ `periode` bisa bernilai TAHUN saja (`2026` = Akhir Tahun) —
    // `.eq('periode','2026')` tak cocok dengan apa pun & menghasilkan "0
    // transaksi" yang kelihatan sah. `periodeDiminta` yang menerjemahkannya.
    const per = periodeDiminta(periode)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    if (descIds && descIds.length > 0) {
      if (arah === 'masuk') q = q.in('skpd_tujuan', descIds)
      else if (arah === 'keluar') q = q.in('skpd_asal', descIds)
      else {
        const list = descIds.join(',')
        q = q.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
      }
    }
    return q
  }, [periode, descIds, arah, p.jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Buang pengalihan yang sudah DIBATALKAN (`batal_pengalihan`).
   *
   * ⚠️ Ditanyakan PER BARIS YANG SUDAH DITARIK, bukan disapu di muka: menyapu
   * seluruh ledger cuma untuk menanyakan status beberapa ratus baris itu persis
   * pola yang sudah bikin timeout beruntun (CLAUDE.md, `fetchVoidedAsetIds`).
   * `jenis IN (…) AND aset_id IN (…)` dilayani `idx_trx_jenis_aset`.
   *
   * ⚠️ MELEMPAR kalau query-nya gagal — fail-closed. Set kosong yang berarti
   * "tak ada yang dibatalkan" akan menampilkan perpindahan yang sudah dianulir
   * sebagai masih berlaku, dan angkanya beda dgn Daftar Barang & Rekonsiliasi.
   *
   * ⚠️ Enum `batal_pengalihan` DIPAKAI BERSAMA `pengalihan_status` DAN
   * `mutasi_internal` (CLAUDE.md "BATAL PERPINDAHAN") — sengaja, bukan
   * kelalaian penamaan. Jadi satu daftar jenis ini benar untuk kedua menu.
   *
   * ⚠️ Menu Penerimaan/Pengeluaran Internal versi LAMA (`LaporanTransaksi`)
   * TIDAK mengirim `batalJenis` sama sekali, jadi mutasi yang sudah dibatalkan
   * tetap tampil di sana. Itu cacat lama yang ikut tertutup di menu Penerimaan
   * begitu ia pindah ke sini; **Pengeluaran Internal masih memakai jalur lama
   * dan masih menanggungnya.**
   */
  const saringBatal = useCallback(async (baris: Trx[]): Promise<Trx[]> => {
    const target = await fetchBatalTargets(
      supabase, BATAL_TARGET_JENIS.pengalihan,
      baris.map(r => r.aset_id).filter((id): id is string => !!id))
    return baris.filter(r => !target.has(r.id))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pesanGagal = (e: Error) =>
    `Gagal memuat laporan: ${e.message}. Angka di halaman ini TIDAK ditampilkan — `
    + 'muat ulang halaman dulu.'

  useEffect(() => {
    ;(async () => {
      setLoading(true); setErr('')
      try {
        // `error` WAJIB dibaca: `const { data } = await` bikin query yang gagal
        // terbaca sebagai "datanya memang kosong" — 0 transaksi yang kelihatan
        // sah padahal query-nya tumbang.
        const { data, error } = await buildQuery().limit(500)
        if (error) throw new Error(error.message)
        setRows(await saringBatal((data as never as Trx[]) || []))
      } catch (e) {
        setErr(pesanGagal(e as Error)); setRows([])
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan tabel "Memuat data..." SELAMANYA.
        setLoading(false)
      }
    })()
  }, [buildQuery, saringBatal])

  // Rekap per SKPD: matriks SKPD (root) × golongan, dibangun lazy saat tab
  // dipindah & TANPA batas 500 seperti daftar transaksi.
  //
  // ⚠️ Diatribusikan ke SKPD **TUJUAN** (penerima) — sejalan dengan lembar
  // Permendagri yang juga sisi penerima. Memakai `skpd_asal` akan membuat dua
  // tab di halaman yang sama menjumlah barang yang sama ke SKPD yang berbeda.
  useEffect(() => {
    if (view !== 'matrix' || !skpdLoaded) return
    ;(async () => {
      setMatrixLoading(true); setErr('')
      try {
        const mtx: Record<number, MatrixRow> = {}
        for (let from = 0; ; from += 1000) {
          const { data, error } = await buildQuery().range(from, from + 999)
          if (error) throw new Error(error.message)
          if (!data || data.length === 0) break
          for (const r of await saringBatal(data as never as Trx[])) {
            if (!r.skpd_tujuan) continue
            const root = rootOf(r.skpd_tujuan)
            const rid = root?.id ?? r.skpd_tujuan
            const rnama = root?.nama ?? `SKPD #${r.skpd_tujuan}`
            const g = kodeLevel3(r.aset?.kode || '')
            mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
            const c = (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
            c.perolehan += r.nilai || 0
          }
          if (data.length < 1000) break
        }
        setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
      } catch (e) {
        setErr(pesanGagal(e as Error)); setMatrix([])
      } finally { setMatrixLoading(false) }
    })()
  }, [view, buildQuery, skpdLoaded, saringBatal]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExportMatrix() {
    exportToExcel(matrix.map(r => {
      const row: Record<string, unknown> = { SKPD: r.skpdNama }
      let total = 0
      for (const g of GOLONGAN_REKAP) {
        const v = r.cells[g.kode]?.perolehan || 0
        row[g.uraian] = v
        total += v
      }
      row['Total'] = total
      return row
    }), `${p.filePrefix}_per_SKPD${periode ? '_' + periode : ''}`, 'Rekap per SKPD')
  }

  async function handleExport() {
    setExporting(true); setErr('')
    const hasil: Trx[] = []
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await buildQuery().range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        hasil.push(...await saringBatal(data as never as Trx[]))
        if (data.length < 1000) break
      }
    } catch (e) {
      // ⚠️ Kegagalan MEMBATALKAN exportnya. Berkas Excel yang terlanjur terunduh
      // tanpa saringan pembatalan tak punya satu pun tanda bahwa isinya salah.
      setErr(pesanGagal(e as Error)); setExporting(false); return
    }
    exportToExcel(hasil.map(r => ({
      'SKPD Asal (menyerahkan)': r.asal?.nama || '',
      'SKPD Tujuan (menerima)': r.tujuan?.nama || '',
      'Kode Barang': r.aset?.kode || '',
      'Uraian Barang': r.aset?.uraian_barang || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'NIBAR': r.aset?.nibar || '',
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
      'No. Dokumen': r.header?.no_sk || r.payload?.no_sk || '',
      'Tgl Dokumen': r.header?.tanggal || r.payload?.tgl_dokumen_sumber || '',
      'Tgl Tercatat': r.tanggal,
      'Periode': r.periode,
      'Nilai (Rp)': r.nilai,
      'Pengembalian': r.payload?.reversal ? 'Ya' : '',
      'Keterangan': r.keterangan || '',
    })), `${p.filePrefix}${periode ? '_' + periode : ''}`, 'Laporan')
    setExporting(false)
  }

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  return (
    <div className="p-6">
      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{err}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{p.judul}</h1>
          <p className="text-gray-500 text-sm mt-1">{p.deskripsi}</p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'permendagri' ? null : (
            <button onClick={view === 'list' ? handleExport : handleExportMatrix}
              disabled={view === 'list' ? exporting : matrix.length === 0} className="btn-primary">
              {view === 'list' && exporting ? 'Mengekspor...' : 'Export Excel'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        <button onClick={() => setView('list')}
          className={`px-4 py-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          Daftar Transaksi
        </button>
        <button onClick={() => setView('matrix')}
          className={`px-4 py-1.5 rounded-md transition-colors ${view === 'matrix' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          Rekap per SKPD
        </button>
        {/* ⚠️ SATU sumber untuk "tab ini ada atau tidak": registry lembar
            (lib/permendagriFormat.ts). `FORMAT_PENGGUNAAN` menjawab pertanyaan
            LAIN — susunan kolomnya — dan tak boleh ikut menentukan keberadaan
            tab, kalau tidak dua daftar bisa menyimpang lalu tabnya muncul tanpa
            isi (atau sebaliknya). */}
        {lembar && (
          <button onClick={() => setView('permendagri')}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === 'permendagri' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            Format Permendagri
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {/* ⚠️ "Akhir Tahun" bernilai TAHUN saja (mis. `2026`), bukan string
                kosong — kosong berarti SELURUH periode yang pernah ada, yang
                melintasi tahun lain & membuat kop lembar Permendagri berbohong
                tentang isinya. `periodeDiminta()` yang menerjemahkannya.
                ⚠️ Semester II = Jul–Des SAJA, tidak kumulatif: ini laporan ARUS,
                dan S2 kumulatif membuat barang Februari tercetak dua kali kalau
                orang mencetak S1 lalu S2. */}
            {tahunList.flatMap(t => [
              <option key={`${t}-S1`} value={`${t}-S1`}>{t} — Semester I</option>,
              <option key={`${t}-S2`} value={`${t}-S2`}>{t} — Semester II</option>,
              <option key={t} value={t}>{t} — Akhir Tahun</option>,
            ])}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..."
            onChangeSelection={sel => { setDescIds(sel.descendantIds); setSelSkpdId(sel.skpdId) }} />
        </div>
        {/* Arah hanya bermakna kalau ada SKPD yang jadi sudut pandangnya —
            se-kabupaten tiap barang selalu keluar dari satu SKPD & masuk ke
            SKPD lain, jadi "masuk/keluar" tak menyaring apa pun. */}
        {view === 'list' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Arah</label>
            <select className="select-filter" value={arah} disabled={selSkpdId == null}
              title={selSkpdId == null ? 'Pilih SKPD dulu — arah dinilai relatif terhadap SKPD itu.' : ''}
              onChange={e => setArah(e.target.value as Arah)}>
              {(Object.keys(ARAH_LABEL) as Arah[]).map(a => (
                <option key={a} value={a}>{ARAH_LABEL[a]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {view === 'permendagri' ? (
        <>
          {/* ⚠️ Perbedaan cakupan DIKATAKAN, bukan didiamkan — lihat catatan di
              kepala berkas. */}
          <div className="card p-4 mb-4 border-l-4 border-teal text-sm text-gray-600">
            Lembar <b>{lembar.kode}</b> berjudul <i>&ldquo;Laporan PENERIMAAN…&rdquo;</i>, jadi
            isinya <b>hanya barang yang MASUK</b> ke SKPD terpilih — filter Arah di tab Daftar
            Transaksi tidak berlaku di sini. Kalau angkanya berbeda dari tab sebelah, itu memang
            begitu: yang diserahkan keluar dilaporkan oleh pihak penerimanya.
          </div>
          <PerpindahanFormatPermendagri id={p.id} skpdId={selSkpdId} periode={periode} />
        </>
      ) : view === 'matrix' ? (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Diatribusikan ke <b>SKPD penerima</b> (tujuan pengalihan).
          </p>
          <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={matrixLoading} />
        </>
      ) : (
        <>
          <div className="card p-4 mb-4 max-w-xs">
            <p className="text-xs text-gray-500">{p.judul}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {rows.length.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-normal text-gray-400">transaksi</span>
            </p>
            <p className="text-xs text-teal font-medium">{formatRupiah(totalNilai)}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">
                {rows.length} transaksi (maks. 500 ditampilkan — export untuk semua)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">Dari SKPD</th>
                    <th className="table-th">Ke SKPD</th>
                    <th className="table-th">Kode Barang</th>
                    <th className="table-th">Uraian Barang</th>
                    <th className="table-th">Spesifikasi Nama Barang / NIBAR</th>
                    <th className="table-th">Komptabel</th>
                    <th className="table-th">No. Dokumen</th>
                    <th className="table-th">Tgl Dokumen</th>
                    <th className="table-th text-right">Nilai</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rows.map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">{r.asal?.nama || '-'}</td>
                      <td className="table-td text-xs">
                        {r.tujuan?.nama || '-'}
                        {/* Baris pengembalian (mekanik "Kembalikan" yang sudah
                            DICABUT 2026-08-12) menukar asal↔tujuan. Ditandai
                            supaya tak terbaca sebagai perpindahan baru. Cuma
                            ada di `pengalihan_status` (2 baris di seluruh
                            ledger); `mutasi_internal` tak punya satu pun. */}
                        {r.payload?.reversal && (
                          <span className="ml-1 text-[10px] text-amber-600">(pengembalian)</span>
                        )}
                      </td>
                      <td className="table-td text-xs">{r.aset?.kode || '-'}</td>
                      <td className="table-td text-xs">{r.aset?.uraian_barang || '-'}</td>
                      <td className="table-td text-xs">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs">{(r.aset?.intra_ekstra || '-').toUpperCase()}</td>
                      <td className="table-td text-xs">{r.header?.no_sk || r.payload?.no_sk || '-'}</td>
                      <td className="table-td text-xs">
                        {r.header?.tanggal || r.payload?.tgl_dokumen_sumber || '-'}
                        <br /><span className="text-gray-400">{r.periode}</span>
                      </td>
                      <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">{r.keterangan || '-'}</td>
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
