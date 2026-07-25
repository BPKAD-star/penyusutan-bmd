'use client'
// Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.11.
// LHI TIDAK diinput terpisah: seluruh isinya diturunkan dari jawaban Lembar
// Kerja (LKI) lewat klasifikasiLhi(). Satu barang bisa muncul di beberapa
// format sekaligus (mis. kondisi berubah DAN tercatat ganda).
//
// ⚠️ Jangan tertukar dgn menu Pelaporan → Laporan Perolehan → "Laporan Hasil
// Inventarisasi" — yang itu laporan CARA PEROLEHAN (jenis ledger
// `hasil_inventarisasi`), beda hal.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import LhiTabel from '@/components/inventarisasi/LhiTabel'
import { useLhiData } from '@/components/inventarisasi/useLhiData'
import { exportToExcel } from '@/lib/export'
import {
  GOLONGAN_OPSI, LHI_LABEL, LHI_URUT, REKOMENDASI, konfigLki, type LhiKode,
} from '@/lib/inventarisasi'
import { kolomLhi, nilaiBarisLhi } from '@/lib/inventarisasiLaporan'

const TAHUN_INI = new Date().getFullYear()

export default function LaporanInventarisasiPage() {
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [golongan, setGolongan] = useState('1.3.3')
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [skpdNama, setSkpdNama] = useState('')
  const [kode, setKode] = useState<LhiKode>('III.B.7')

  const { headers, loading, barisUntuk, hitungPerFormat } = useLhiData({ tahun, golongan, skpdIds })
  const hitung = useMemo(() => hitungPerFormat(), [hitungPerFormat])

  const rows = useMemo(
    () => barisUntuk(kode).map((b, i) => nilaiBarisLhi(kode, b, i + 1)),
    [barisUntuk, kode],
  )

  function handleExport() {
    const kolom = kolomLhi(kode)
    exportToExcel(
      rows.map(r => {
        const o: Record<string, unknown> = {}
        for (const k of kolom) o[k.grup ? `${k.grup} — ${k.label}` : k.label] = r[k.key] ?? ''
        return o
      }),
      `LHI_${kode.replace(/\./g, '')}_${tahun}`,
      kode,
    )
  }

  const cetakUrl = `/cetak/inventarisasi-lhi?tahun=${tahun}&golongan=${golongan}&kode=${encodeURIComponent(kode)}${skpdId ? `&skpd=${skpdId}` : ''}`
  const periodeLabel = `${konfigLki(golongan).label} — Tahun ${tahun}`

  return (
    <FormShell
      judul="Laporan Hasil Inventarisasi (LHI)"
      deskripsi="Format III.B.1–III.B.11 (Permendagri 47/2021). Isi laporan diturunkan otomatis dari Lembar Kerja Inventarisasi."
      msg=""
      headerRight={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/inventarisasi" className="btn-secondary text-sm">← Lembar Kerja</Link>
          <a href={cetakUrl} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
            🖨 Cetak / PDF
          </a>
          <button onClick={handleExport} disabled={rows.length === 0} className="btn-primary">Export Excel</button>
        </div>
      }
    >
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tahun</label>
          <select className="select-filter" value={tahun} onChange={e => setTahun(Number(e.target.value))}>
            {[TAHUN_INI, TAHUN_INI - 1, TAHUN_INI - 2].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
          <select className="select-filter" value={golongan} onChange={e => setGolongan(e.target.value)}>
            {GOLONGAN_OPSI.map(g => <option key={g.kode} value={g.kode}>{g.label}</option>)}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setSkpdIds(sel.descendantIds); setSkpdId(sel.skpdId) }}
            onChange={() => { /* nama diisi lewat header saat 1 SKPD */ }}
            placeholder="Semua SKPD — atau ketik nama SKPD..." />
        </div>
      </div>

      {/* Pemilih format + jumlah temuan */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">Pilih Format Laporan</p>
        <div className="flex flex-wrap gap-2">
          {LHI_URUT.map(k => {
            const n = hitung[k] || 0
            const aktif = k === kode
            return (
              <button key={k} onClick={() => setKode(k)}
                className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors max-w-[260px] ${
                  aktif ? 'border-teal bg-teal/5 text-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                <span className="font-semibold">{k}</span>
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${n > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                  {n}
                </span>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{LHI_LABEL[k]}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card p-4 mb-4 text-xs text-gray-600">
        <b>Rekomendasi tindak lanjut:</b> {REKOMENDASI[kode].saran}
        {REKOMENDASI[kode].menu !== '—' && <> <span className="text-gray-400">(menu: {REKOMENDASI[kode].menu})</span></>}
        <p className="text-[11px] text-gray-400 mt-1">
          Inventarisasi tidak mengeksekusi apa pun ke buku besar — tindak lanjut dikerjakan manual di menu terkait.
        </p>
      </div>

      <div className="card p-4 overflow-x-auto">
        {loading ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat data...</p>
        ) : headers.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">
            Belum ada inventarisasi {konfigLki(golongan).label} tahun {tahun}.
          </p>
        ) : (
          <LhiTabel kode={kode} rows={rows} periodeLabel={periodeLabel}
            judulSkpd={skpdId ? (headers.find(h => h.skpd_id === skpdId)?.skpd?.nama || undefined) : undefined} />
        )}
      </div>
    </FormShell>
  )
}
