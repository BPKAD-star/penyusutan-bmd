'use client'
// Tab "Rekap per SKPD" di halaman LHI — khusus admin pemda & auditor
// (keputusan user 2026-10-01). Pengurus Barang langsung ke Format Permendagri.
// Filternya hanya Tahun & Jenis Aset: rekap ini memang lintas SKPD, jadi tak
// ada pemilih SKPD (baris SKPD-lah isinya).
import { useMemo, useState } from 'react'
import RekapLhiTable, { JUDUL_KOLOM_LHI } from '@/components/inventarisasi/RekapLhiTable'
import { useRekapLhi } from '@/components/inventarisasi/useRekapLhi'
import { useSkpdTree } from '@/components/useSkpdTree'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { GOLONGAN_OPSI, LHI_URUT } from '@/lib/inventarisasi'
import { bangunPohonLhi, ratakanPohonLhi } from '@/lib/rekapLhi'

const TAHUN_INI = new Date().getFullYear()

export default function RekapLhiPanel() {
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [golongan, setGolongan] = useState('') // '' = semua jenis aset
  const { leaf, loading, err } = useRekapLhi({ tahun, golongan: golongan || null, aktif: true })
  const { byId, rootOf, loaded } = useSkpdTree()

  const pohon = useMemo(() => {
    if (!loaded) return []
    const akar = [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
    return bangunPohonLhi(leaf, byId, akar)
  }, [leaf, byId, rootOf, loaded])

  function handleExport() {
    exportToExcel(ratakanPohonLhi(pohon).map(({ row, namaBerindentasi }) => {
      const o: Record<string, unknown> = { SKPD: namaBerindentasi }
      for (const k of LHI_URUT) o[`${k} ${JUDUL_KOLOM_LHI[k]}`] = row.hitung[k]
      o['Barang Ada Temuan'] = row.barang
      return o
    }), namaBerkasLaporan({ laporan: 'LHI', periode: tahun, golongan: golongan || null, akhiran: ['Rekap per SKPD'] }), 'Rekap per SKPD')
  }

  return (
    <>
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err} — rekap TIDAK ditampilkan supaya tak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat.
        </div>
      )}
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
            <option value="">Semua jenis aset</option>
            {GOLONGAN_OPSI.map(g => <option key={g.kode} value={g.kode}>{g.label}</option>)}
          </select>
        </div>
        <button onClick={handleExport} disabled={pohon.length === 0} className="btn-primary ml-auto">Export Excel</button>
      </div>

      {err ? null : <RekapLhiTable rows={pohon} loading={loading || !loaded} />}

      <p className="text-[11px] text-gray-400 mt-3">
        Hanya isian yang <b>sudah divalidasi</b> Pengelola Barang. Sel = jumlah barang pada format itu; satu barang bisa
        masuk beberapa format sekaligus (mis. kondisi berubah <i>dan</i> tercatat ganda), jadi menjumlah ke samping
        bukan jumlah barang — itu sebabnya ada kolom <b>Barang Ada Temuan</b> (barang berbeda yang punya minimal satu temuan).
        SKPD ber-panah (▸) punya unit di bawahnya; angka induk sudah memuat seluruh unitnya.
      </p>
    </>
  )
}
