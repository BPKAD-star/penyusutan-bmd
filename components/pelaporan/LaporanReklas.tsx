'use client'
// ============================================================================
// Menu Pelaporan → Pengelolaan → REKLASIFIKASI.
//
// Susunannya mengikuti keluarga Perpindahan (Penggunaan · Penerimaan Internal ·
// Pengeluaran Internal): tiga tab —
//
//   Daftar Transaksi   — baris ledger, "sebelum → sesudah" per barang
//   Rekap per SKPD     — matriks SKPD (root) × jenis aset
//   Format Permendagri — lembar rinci IV.F.2 + empat rekap IV.F.3–F.6
//
// ── Yang BEDA dari keluarga Perpindahan, dan kenapa berdiri sendiri ─────────
// 1. **Penyaring ARAH duduk di ATAS tab, bukan di dalam salah satunya** —
//    permintaan user 2026-09-07. Di keluarga perpindahan, arah cuma menyaring
//    tab Daftar Transaksi & lembar Permendagri-nya sudah dipaku per menu. Di
//    sini SATU menu melayani dua lembar (penambahan & pengurangan), jadi arah
//    itu pertanyaan pertama, bukan filter kesekian.
// 2. **Arah TIDAK menyaring baris.** Satu reklas adalah penambahan di kode
//    tujuan DAN pengurangan di kode asal — dua sudut pandang atas peristiwa yang
//    sama. Yang berubah: kode mana yang jadi kunci pengelompokan Rekap & lembar
//    Permendagri, dan blok "Reklasifikasi dari/ke" di lembarnya.
//    ⚠️ Itu WAJIB tertulis di layar. Operator yang melihat jumlah transaksi
//    yang sama di kedua arah akan mengira salah satunya bug.
// 3. **SATU pemuat untuk ketiga tab** (`muatLaporanReklas`) — bukan query
//    sendiri per tab seperti `LaporanPerpindahan`. Di sana bedanya nyata (tab 1
//    netral arah); di sini tidak, jadi dua jalur cuma bikin dua angka yang bisa
//    menyimpang.
// 4. **Tak ada `.limit(500)`** — ledger reklasifikasi kecil & disapu penuh
//    (keyset) oleh pemuatnya, jadi angka di tab 1 memang seluruhnya, bukan
//    "500 teratas".
//
// ⚠️ HALAMAN INI MENGGANTIKAN `LaporanTransaksi` di menu Reklasifikasi, dan itu
// ikut menutup CACAT LAMA: komponen generik itu menyaring SKPD lewat
// `skpd_asal`/`skpd_tujuan`, yang di ledger reklas SELALU NULL — jadi memilih
// SKPD di menu lama menghasilkan **0 transaksi** yang kelihatan sah. Di sini
// SKPD disaring lewat `aset.skpd_id` (lihat lib/laporanReklas.ts).
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import { LEMBAR_PERMENDAGRI } from '@/lib/permendagriFormat'
import { FORMAT_REKLAS, type ArahReklas, type IdReklas, type FormatReklas } from '@/lib/formatReklas'
import { muatLaporanReklas, type BarisReklas } from '@/lib/laporanReklas'
import ReklasFormatPermendagri from './ReklasFormatPermendagri'

const ARAH_LABEL: Record<ArahReklas, string> = {
  penambahan: 'Penambahan — barang yang MASUK ke kode/golongan tujuan',
  pengurangan: 'Pengurangan — barang yang KELUAR dari kode/golongan asal',
}

export default function LaporanReklas() {
  const supabase = createClient()
  const { rootOf, loaded: skpdLoaded } = useSkpdTree()
  const tahunBuku = useTahunBukuMap()
  const namaSkpd = useNamaSkpd()

  const [arah, setArah] = useState<ArahReklas>('penambahan')
  const [periode, setPeriode] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'matrix' | 'permendagri'>('list')

  const [rows, setRows] = useState<BarisReklas[]>([])
  // Nomenklatur baku tiap kode (`admin_kodefikasi_bmd`) — dipakai kolom
  // "Sebelum/Sesudah Reklas" & Export. ⚠️ Sengaja dari pemuat yang sama dengan
  // lembar Permendagri: uraian yang beda antara layar & lembar bertanda tangan
  // untuk kode yang sama adalah kelas kesalahan yang tak akan bersuara.
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // ⚠️ Dibaca dari REGISTRY, bukan dari `FORMAT_REKLAS`. Registry-lah satu-
  // satunya daftar yang menjawab "lembar ini sudah ada atau belum" (lihat kepala
  // lib/permendagriFormat.ts); `FORMAT_REKLAS` menjawab pertanyaan lain — bentuk
  // tabelnya. Dua daftar yang sama-sama boleh bilang "ada" pasti menyimpang, dan
  // gejalanya cuma tab yang muncul tanpa isi.
  const adaLembar = !!LEMBAR_PERMENDAGRI['reklas-penambahan'] && arah === 'penambahan'
  const f = FORMAT_REKLAS[arah as IdReklas] as FormatReklas | undefined

  // ⚠️ HANYA TAHUN KERJA BERJALAN, sejalan dgn Laporan Perolehan & Perpindahan.
  // Tiap tahun SELALU menawarkan ketiganya — semester yang belum ada
  // transaksinya tetap bisa dipilih & dicetak (hasilnya lembar "tidak ada
  // penambahan pada periode ini", yang memang jawaban yang sah).
  const tahunTerbuka = Object.entries(tahunBuku)
    .filter(([, st]) => st === 'terbuka').map(([t]) => Number(t))
  const tahunKerja = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : new Date().getFullYear()
  const tahunList = [String(tahunKerja)]

  useEffect(() => {
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLaporanReklas(supabase, { arah, skpdId, periode })
        if (!batal) { setRows(h.rows); setNamaTingkat(h.namaTingkat) }
      } catch (e) {
        // Fail-closed (CLAUDE.md, modul pelaporan): lebih baik menolak tampil
        // daripada menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) {
          setErr(`Gagal memuat laporan: ${(e as Error).message}. Angka di halaman ini TIDAK `
            + 'ditampilkan — muat ulang halaman dulu.')
          setRows([])
        }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan tabel "Memuat data..." SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [arah, skpdId, periode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rekap per SKPD: matriks SKPD (root) × jenis aset, diturunkan dari baris yang
  // SUDAH dimuat — tak ada query kedua, jadi mustahil beda dari tab sebelah.
  //
  // ⚠️ Golongannya dari `kodeUtama` (kode SESUDAH reklas untuk penambahan),
  // bukan `aset.kode`. Memakai kode terkini akan menaruh barang yang direklas
  // dua kali di golongan reklas TERAKHIRNYA — persis cacat baris mutasi
  // Rekonsiliasi yang ditutup 2026-08-27.
  const matrix: MatrixRow[] = (() => {
    if (!skpdLoaded) return []
    const mtx: Record<number, MatrixRow> = {}
    for (const r of rows) {
      const sid = r.aset?.skpd_id
      if (!sid) continue
      const root = rootOf(sid)
      const rid = root?.id ?? sid
      const rnama = root?.nama ?? `SKPD #${sid}`
      const g = kodeLevel3(r.kodeUtama)
      mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
      const c = (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
      c.perolehan += r.nilai || 0
      c.akumulasi += r.akumulasi || 0
      c.nilaiBuku += r.nilaiBuku || 0
    }
    return Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
  })()

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
    }), namaBerkasLaporan({
      laporan: `Laporan Reklasifikasi ${arah === 'penambahan' ? 'Penambahan' : 'Pengurangan'}`,
      periode, skpd: namaSkpd.nama, akhiran: ['per SKPD'],
    }), 'Rekap per SKPD')
  }

  function handleExport() {
    // Tak ada paginasi & tak ada `await` di sini: barisnya sudah lengkap di
    // memori (pemuatnya menyapu penuh dgn keyset), jadi export tak bisa berbeda
    // dari yang di layar.
    exportToExcel(rows.map(r => ({
      'SKPD': r.skpdNama || '',
      'NIBAR': r.aset?.nibar || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'Kode Barang Sebelum': r.kodeLama,
      'Uraian Sebelum': namaTingkat.get(r.kodeLama) || '',
      'Kode Barang Sesudah': r.kodeBaru,
      'Uraian Sesudah': namaTingkat.get(r.kodeBaru) || '',
      'Komptabel Sebelum': (r.payload?.intra_ekstra_lama || '').toUpperCase(),
      'Komptabel Sesudah': (r.payload?.intra_ekstra || r.aset?.intra_ekstra || '').toUpperCase(),
      'Penyebab Reklasifikasi': r.penyebab,
      'No. Dokumen': r.header?.no_sk || '',
      'Tgl Dokumen': r.header?.tanggal || r.tanggal,
      'Periode': r.periode,
      'Nilai Perolehan (Rp)': r.nilai,
      'Akumulasi (Rp)': r.akumulasi ?? 0,
      'Nilai Buku (Rp)': r.nilaiBuku ?? 0,
      'Keterangan': r.keterangan || r.aset?.keterangan || '',
    })), namaBerkasLaporan({
      laporan: `Laporan Reklasifikasi ${arah === 'penambahan' ? 'Penambahan' : 'Pengurangan'}`,
      periode, skpd: namaSkpd.nama,
    }), 'Laporan')
  }

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  return (
    <div className="p-6">
      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{err}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Reklasifikasi</h1>
          <p className="text-gray-500 text-sm mt-1">
            Perubahan fungsi BMD, kesalahan kodefikasi, &amp; perpindahan keranjang komptabel.
            Reklas yang sudah dibatalkan tidak ditampilkan.
          </p>
        </div>
        {view !== 'permendagri' && (
          <button onClick={view === 'list' ? handleExport : handleExportMatrix}
            disabled={view === 'list' ? rows.length === 0 : matrix.length === 0}
            className="btn-primary">Export Excel</button>
        )}
      </div>

      {/* ── Penyaring ARAH — pertanyaan PERTAMA, di atas tab ────────────────
          Permintaan user 2026-09-07. Sengaja bukan dropdown kecil di baris
          filter: ia yang menentukan makna seluruh halaman, termasuk lembar
          Permendagri mana yang terbit. */}
      <div className="card p-4 mb-4">
        <p className="text-xs text-gray-500 mb-2">Sisi yang dilaporkan</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ARAH_LABEL) as ArahReklas[]).map(a => (
            <button key={a} onClick={() => { setArah(a); if (a !== 'penambahan') setView(v => v === 'permendagri' ? 'list' : v) }}
              className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                arah === a ? 'bg-teal text-white border-teal font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {ARAH_LABEL[a]}
            </button>
          ))}
        </div>
        {/* ⚠️ DIKATAKAN, bukan didiamkan — lihat catatan (2) di kepala berkas.
            Jumlah transaksi kedua arah memang sama persis. */}
        <p className="text-xs text-gray-500 mt-3 border-l-2 border-teal pl-2">
          Satu baris reklasifikasi adalah <b>penambahan di kode tujuan</b> sekaligus{' '}
          <b>pengurangan di kode asal</b> — jadi <b>jumlah transaksinya sama di kedua sisi</b>,
          itu memang begitu. Yang berubah: kode mana yang dipakai mengelompokkan Rekap &amp;
          lembar Permendagri, dan isi blok &ldquo;Reklasifikasi dari/ke&rdquo;.
        </p>
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
        {adaLembar && (
          <button onClick={() => setView('permendagri')}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === 'permendagri' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            Format Permendagri
          </button>
        )}
      </div>
      {/* ⛔ Dikatakan, bukan disembunyikan diam-diam: operator yang tahu menu
          Penggunaan punya tab ketiga akan mencarinya di sini juga. */}
      {!adaLembar && (
        <p className="text-xs text-gray-500 mb-4">
          Lembar Permendagri untuk sisi <b>pengurangan</b> belum dibangun — formatnya belum
          diserahkan. Pilih <b>Penambahan</b> untuk menyusun Format IV.F.2–F.6.
        </p>
      )}

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
            onChangeSelection={sel => { setSkpdId(sel.skpdId); void namaSkpd.pilih(sel.skpdId) }} />
        </div>
      </div>

      {view === 'permendagri' ? (
        <ReklasFormatPermendagri arah={arah} skpdId={skpdId} periode={periode} />
      ) : view === 'matrix' ? (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Diatribusikan ke <b>jenis aset {arah === 'penambahan' ? 'TUJUAN' : 'ASAL'}</b> reklasifikasi
            {f ? <> — sejalan dgn lembar {f.kode}.</> : '.'}
          </p>
          <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={loading} />
        </>
      ) : (
        <>
          <div className="card p-4 mb-4 max-w-xs">
            <p className="text-xs text-gray-500">
              Reklasifikasi — {arah === 'penambahan' ? 'penambahan' : 'pengurangan'}
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {rows.length.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-normal text-gray-400">transaksi</span>
            </p>
            <p className="text-xs text-teal font-medium">{formatRupiah(totalNilai)}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">{rows.length} transaksi</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">SKPD</th>
                    <th className="table-th">Spesifikasi Nama Barang / NIBAR</th>
                    {/* Inti permintaan user: "sebelumnya apa lalu jadi apa". */}
                    <th className="table-th">Sebelum Reklas</th>
                    <th className="table-th">Sesudah Reklas</th>
                    <th className="table-th">Penyebab</th>
                    <th className="table-th">No. Dokumen</th>
                    <th className="table-th">Tgl Dokumen</th>
                    <th className="table-th text-right">Nilai</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rows.map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">{r.skpdNama || '-'}</td>
                      <td className="table-td text-xs">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs">
                        <SisiReklas kode={r.kodeLama} nama={namaTingkat.get(r.kodeLama) || ''}
                          komptabel={r.payload?.intra_ekstra_lama}
                          namaBarang={r.payload?.nama_lama} />
                      </td>
                      <td className="table-td text-xs">
                        <SisiReklas kode={r.kodeBaru} nama={namaTingkat.get(r.kodeBaru) || ''}
                          komptabel={r.payload?.intra_ekstra}
                          namaBarang={r.payload?.nama_baru} penekanan />
                      </td>
                      <td className="table-td text-xs">{r.penyebab || '-'}</td>
                      <td className="table-td text-xs">{r.header?.no_sk || '-'}</td>
                      <td className="table-td text-xs">
                        {r.header?.tanggal || r.tanggal}
                        <br /><span className="text-gray-400">{r.periode}</span>
                      </td>
                      <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px]">
                        {r.keterangan || r.aset?.keterangan || r.header?.keterangan || '-'}
                      </td>
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

/**
 * Satu sisi kolom "Sebelum/Sesudah Reklas".
 *
 * ⚠️ Kode & komptabel DUA-DUANYA ditampilkan, dan itu bukan hiasan: reklas
 * komptabel (`reklas_komptabel`) TIDAK menggeser kode sama sekali — kedua
 * kolomnya berisi kode yang sama persis, dan yang berubah cuma barisan
 * komptabelnya. Tanpa baris komptabel, baris semacam itu terbaca seolah tak
 * terjadi apa-apa.
 */
function SisiReklas({ kode, nama, komptabel, namaBarang, penekanan }: {
  kode: string; nama: string; komptabel?: string | null
  namaBarang?: string | null; penekanan?: boolean
}) {
  return (
    <div className={penekanan ? 'text-gray-900' : 'text-gray-500'}>
      <p className={penekanan ? 'font-medium' : ''}>{kode || '-'}</p>
      {nama && <p className="text-gray-400">{nama}</p>}
      {namaBarang && <p className="text-gray-400 italic">&ldquo;{namaBarang}&rdquo;</p>}
      {komptabel && <p className="text-[10px] text-gray-400">{komptabel.toUpperCase()}</p>}
    </div>
  )
}
