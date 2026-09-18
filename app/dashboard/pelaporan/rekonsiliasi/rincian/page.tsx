'use client'
// Rincian Transaksi Rekonsiliasi (Bukti Dukung) — daftar SEMUA transaksi AKTIF
// yang memengaruhi Rekonsiliasi BMD pada satu periode. Sumber = fetchMutasiLines
// (SAMA dgn agregat Rekonsiliasi), jadi rincian ini pasti menjumlah ke angka
// mutasi. Se-pemda (SKPD kosong) atau per SKPD. Deliverable utama = Export Excel.
import { useState } from 'react'
import PeringatanNamaSkpd from '@/components/PeringatanNamaSkpd'
import { useNamaSkpdMap } from '@/components/useNamaSkpdMap'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { GOLONGAN_REKAP, periodeDariTanggal } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchMutasiLines, KATEGORI_LABEL, type MutasiLine } from '@/lib/rekon'
import { urutanKategoriRincian } from '@/lib/rincianRekonUrutan'
// Konsep "Akhir Tahun" REUSE dari Laporan BMD (satu-satunya menu lain yang
// sudah punya ini) — bukan pengertian baru. Di sana 'TH' cuma berarti sesuatu
// utk laporan ARUS (Model 3); halaman ini juga arus (daftar transaksi, bukan
// saldo), jadi cocok dgn arti yg SAMA: `periodeMutasi` jadi DUA periode
// (`YYYY-S1` & `YYYY-S2`) yg ditarik & digabung, bukan satu string "YYYY" yg
// tak pernah ada di ledger (`parsePeriode`, lib/bmd.ts, selalu YYYY-S1/S2).
import { periodeLaporanBmd, type SemesterBmd } from '@/lib/periodeLaporanBmd'

const angka = (v: number) => formatRupiah2(v || 0)
const PREVIEW_MAX = 1000
const golUraian = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kode)?.uraian || kode
const golIdx = (kode: string) => { const i = GOLONGAN_REKAP.findIndex(g => g.kode === kode); return i < 0 ? 99 : i }

export default function RincianRekonsiliasiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState<SemesterBmd>('1')
  // Dibekukan saat Proses ditekan (pola `applied` yg sudah dipakai halaman
  // lain di modul ini) — `periode` utk nama berkas Export (tahun polos saat
  // Akhir Tahun, spt Laporan BMD Model 3), `label` utk teks di layar & kolom
  // header Excel.
  const [applied, setApplied] = useState<{ periode: string; label: string } | null>(null)
  const [lines, setLines] = useState<MutasiLine[]>([])
  // Peta nama SKPD — SATU sumber, lewat `paginate` (lib/namaSkpd.ts).
  // ⚠️ `errSkpd` WAJIB ditampilkan: sebelum 2026-09-16 loop di sini
  // menelan `error`, jadi query gagal = peta kosong = kolom SKPD tampil
  // "-" di tiap baris, terbaca operator sbg "barang ini tak bertuan".
  const { peta: skpdMap, err: errSkpd } = useNamaSkpdMap()
  const [loading, setLoading] = useState(false)

  async function proses() {
    setLoading(true)
    const { periodeMutasi, labelPeriode } = periodeLaporanBmd(tahun, smt)
    // Akhir Tahun = DUA panggilan (S1 + S2) digabung, bukan satu query dgn
    // periode "YYYY" yg tak pernah ada. Aman disatukan tanpa dobel-hitung:
    // `transaksi_bmd.periode` itu kolom TETAP per baris (bukan dihitung saat
    // tampil), jadi hasil S1 & S2 dijamin TAK TUMPANG TINDIH — baris yg sama
    // mustahil lolos filter `periode` DUA kali. Pola & alasan sama dgn
    // `fetchLedgerM3` di Laporan BMD (lib/periodeLaporanBmd.ts).
    const hasil = await Promise.all(
      periodeMutasi.map(p => fetchMutasiLines(supabase, p, org.descendantIds ?? null)),
    )
    const rows = hasil.flat()
    // Urut: silsilah kategori (permintaan user 2026-09-18 — lihat
    // lib/rincianRekonUrutan.ts utk penjelasan lengkap "Cara Perolehan →
    // Transfer Masuk → Transfer Keluar → Koreksi [Nilai/Kapitalisasi/
    // Pemecahan/Penggabungan/Reklasifikasi] → Penghapusan") → golongan (urutan
    // KIB) → tanggal → NIBAR sbg pemecah seri TOTAL, supaya urutannya stabil
    // & tak bergeser sendiri tiap render (Array.prototype.sort tak dijamin
    // stabil di semua mesin). Tanggal sbg kunci ketiga ini SEKALIGUS yg
    // merapikan Akhir Tahun: baris S1 & S2 dalam kategori/golongan yg sama
    // otomatis terurut kronologis, bukan "semua S1 dulu baru semua S2".
    rows.sort((a, b) => urutanKategoriRincian(a.kategori) - urutanKategoriRincian(b.kategori)
      || golIdx(a.golongan) - golIdx(b.golongan)
      || a.tanggal.localeCompare(b.tanggal)
      || (a.nibar || '').localeCompare(b.nibar || ''))
    setLines(rows)
    // Nama berkas Export: tahun POLOS saat Akhir Tahun (pola persis Laporan
    // BMD Model 3 — "2026", bukan "2026-S1" yg cuma separuh benar), selain itu
    // periode tunggal spt biasa.
    setApplied({ periode: smt === 'TH' ? tahun : periodeMutasi[0], label: labelPeriode })
    setLoading(false)
  }

  const tot = lines.reduce((a, l) => { if (l.arah === 'tambah') a.tambah += l.nilai; else a.kurang += l.nilai; return a }, { tambah: 0, kurang: 0 })

  function baris(l: MutasiLine): Record<string, string | number> {
    return {
      // ⚠️ Periode per BARIS (dari tanggalnya sendiri), BUKAN `applied.label`
      // yg konstan — begitu Akhir Tahun menggabung S1+S2 dalam satu tabel,
      // label filter ("2026 (setahun)") tak lagi menjawab "baris ini semester
      // berapa". `periodeDariTanggal` sama dgn yg dipakai seluruh aplikasi.
      'Periode': periodeDariTanggal(l.tanggal), 'Arah': l.arah === 'tambah' ? 'Penambahan' : 'Pengurangan',
      'Kategori': KATEGORI_LABEL[l.kategori], 'Jenis Ledger': l.jenis, 'Tanggal': l.tanggal,
      'No Dokumen/SK': l.no_dokumen || '', 'SKPD': (l.skpd_id != null && skpdMap[l.skpd_id]) || '',
      'Golongan': `${l.golongan} — ${golUraian(l.golongan)}`, 'Kode Barang': l.kode, 'NIBAR': l.nibar || '',
      'Nama Barang': l.nama || '', 'Komptabel': l.komp === 'intra' ? 'Intra' : 'Ekstra', 'Nilai': l.nilai,
    }
  }

  function handleExport() {
    if (!applied) return
    exportToExcel(lines.map(baris), namaBerkasLaporan({
      laporan: 'Rincian Rekonsiliasi', periode: applied.periode,
      skpd: org.skpdId ? skpdMap[org.skpdId] : null,
    }), 'Rincian Rekonsiliasi')
  }

  return (
    <div className="p-6">
      <PeringatanNamaSkpd err={errSkpd} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rincian Transaksi Rekonsiliasi</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bukti dukung — semua transaksi aktif yang memengaruhi Rekonsiliasi BMD pada periode terpilih. Se-pemda (SKPD kosong) atau per SKPD.
        </p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Kosongkan = se-pemda; atau ketik SKPD / Sub OPD..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Periode :</label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {/* Akhir Tahun = seluruh transaksi setahun (S1+S2 digabung) —
                  pola & label yg SAMA dgn Laporan BMD (lib/periodeLaporanBmd.ts),
                  bukan konsep baru. */}
              {([['1', 'Semester I'], ['2', 'Semester II'], ['TH', 'Akhir Tahun']] as [SemesterBmd, string][]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {applied && lines.length > 0 && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Memproses...</div>
      ) : lines.length === 0 ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Tidak ada transaksi yang memengaruhi Rekonsiliasi pada periode ini.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-900">{lines.length.toLocaleString('id-ID')}</span> transaksi · periode {applied?.label}
              <span className="text-gray-300 mx-2">·</span>
              Penambahan <span className="font-semibold text-teal">{angka(tot.tambah)}</span>
              <span className="text-gray-300 mx-2">·</span>
              Pengurangan <span className="font-semibold text-rose-600">{angka(tot.kurang)}</span>
            </span>
            {lines.length > PREVIEW_MAX && <span className="text-xs text-amber-700">Tampil {PREVIEW_MAX.toLocaleString('id-ID')} pertama — Export utk semua.</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Arah', 'Kategori', 'Jenis', 'Tanggal', 'No Dok/SK', 'SKPD', 'Golongan', 'Kode', 'NIBAR', 'Nama Barang', 'Komptabel', 'Nilai'].map(h => (
                    <th key={h} className={`table-th whitespace-nowrap ${h === 'Nilai' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.slice(0, PREVIEW_MAX).map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50/60 align-top">
                    <td className={`table-td text-xs whitespace-nowrap ${l.arah === 'tambah' ? 'text-teal' : 'text-rose-600'}`}>{l.arah === 'tambah' ? 'Tambah' : 'Kurang'}</td>
                    <td className="table-td text-xs text-gray-700 max-w-[220px]">{KATEGORI_LABEL[l.kategori]}</td>
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">{l.jenis}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.tanggal}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.no_dokumen || '-'}</td>
                    <td className="table-td text-xs text-gray-600 min-w-[140px] max-w-[220px]">{(l.skpd_id != null && skpdMap[l.skpd_id]) || '-'}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.golongan}</td>
                    <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.kode}</td>
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap max-w-[150px] truncate" title={l.nibar || ''}>{l.nibar || '-'}</td>
                    <td className="table-td text-xs text-gray-800 min-w-[160px] max-w-[260px]">{l.nama || '-'}</td>
                    <td className="table-td text-xs text-gray-600 text-center whitespace-nowrap capitalize">{l.komp}</td>
                    <td className="table-td text-right text-xs tabular-nums whitespace-nowrap">{angka(l.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
