'use client'
// ============================================================================
// Tab "Format Permendagri" di menu Pelaporan → Pengelolaan → Pemanfaatan.
//
// Satu lembar (tak ada cabang jenis aset seperti Pengamanan): barisnya
// dikelompokkan per golongan di dalam lembarnya.
//
// ⚠️ Angkanya dimuat `muatLaporanPemanfaatanPermendagri` — SAMA dengan halaman
// cetak.
//
// ⚠️ Lembar ini = PERJANJIAN YANG BERLAKU PADA PERIODE, bukan "yang aktif
// hari ini". Itu wajib tertulis di layar — tab Daftar menampilkan keadaan
// terkini tanpa periode, jadi tanpa keterangannya operator mengira salah
// satunya kehilangan baris.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { labelPeriodeKop } from '@/lib/formatPermendagri'
import { FORMAT_PEMANFAATAN } from '@/lib/formatPemanfaatan'
import {
  muatLaporanPemanfaatanPermendagri, type BarisPemanfaatanLembar,
} from '@/lib/laporanPemanfaatanPermendagri'
import LembarPemanfaatanPermendagri from './LembarPemanfaatanPermendagri'

export default function PemanfaatanFormatPermendagri({ skpdId, periode }: {
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<BarisPemanfaatanLembar[]>([])
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const f = FORMAT_PEMANFAATAN
  const siap = skpdId != null && !!periode

  useEffect(() => {
    if (!siap) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLaporanPemanfaatanPermendagri(supabase, { skpdId: skpdId!, periode })
        if (batal) return
        setRows(h.rows); setSkpd(h.skpd); setSebutan(h.sebutan)
      } catch (e) {
        // Fail-closed: modul pelaporan lebih baik menolak tampil daripada
        // menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setErr((e as Error).message); setRows([]); setSkpd(null) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [skpdId, periode, siap]) // eslint-disable-line react-hooks/exhaustive-deps

  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const urlCetak = `/cetak/pemanfaatan-permendagri?skpd=${skpdId}&periode=${periode}`
  const kurang = !periode ? 'Pilih Periode dulu.'
    : skpdId == null ? 'Pilih SKPD dulu — lembar ini memuat identitas SKPD di kopnya.'
      : ''

  return (
    <div className="space-y-4">
      <div className="card p-4 border-l-4 border-teal text-sm text-gray-600">
        Lembar ini mendaftar <b>perjanjian pemanfaatan yang BERLAKU pada periode</b> — masa
        perjanjiannya beririsan dengan semester/tahun yang dipilih. Perjanjian yang sudah
        diakhiri <i>di tengah</i> periode tetap tampil; yang dibatalkan setelah periode itu
        berlalu juga tetap tampil di periodenya. Tab <i>Daftar</i> menampilkan keadaan
        terkini tanpa periode, jadi kalau jumlahnya berbeda, itu memang begitu.
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-4">
        <p className="text-xs text-gray-500">Kertas: <b>F4 lanskap</b></p>
        <div className="ml-auto">
          {/* ⚠️ Dimatikan berikut ALASANNYA — tombol mati tanpa keterangan itu
              kegagalan senyap. */}
          {!kurang && !err ? (
            <a href={urlCetak} target="_blank" rel="noreferrer" className="btn-primary whitespace-nowrap">
              🖨 Cetak / Simpan PDF
            </a>
          ) : (
            <span className="btn-primary opacity-50 cursor-not-allowed whitespace-nowrap"
              title={err ? 'Angkanya gagal dimuat — perbaiki dulu.' : kurang}>
              🖨 Cetak / Simpan PDF
            </span>
          )}
        </div>
      </div>

      {err && (
        <div className="card p-4 border-l-4 border-red-500 text-sm text-red-700">
          Gagal menyiapkan lembar: {err}
          <p className="text-xs text-red-600 mt-1">Angka TIDAK ditampilkan — muat ulang halaman dulu.</p>
        </div>
      )}

      {kurang ? (
        <div className="card p-6 text-sm text-gray-500">{kurang}</div>
      ) : loading ? (
        <div className="card p-6 text-sm text-gray-400">Memuat…</div>
      ) : err ? null : (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3">
            Pratinjau — <b>{rows.length.toLocaleString('id-ID')} baris</b> · {judulPeriode} {tahun}.
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px]">
              <LembarPemanfaatanPermendagri
                f={f} rows={rows} skpd={skpd}
                judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                ttd={null} tglTtd="" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
