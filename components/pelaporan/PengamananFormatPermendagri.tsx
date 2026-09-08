'use client'
// ============================================================================
// Tab "Format Permendagri" di menu Pelaporan → Pengelolaan → Pengamanan.
//
// Dua cabang, dipilih di sini (bukan di induk): IV.J.1.2 Peralatan & Mesin dan
// IV.J.2.2 Gedung & Bangunan berupa Rumah Negara. Keduanya cuma berbeda
// GOLONGAN yang disaring & judulnya.
//
// ⚠️ Angkanya dimuat `muatLaporanPengamanan` — SAMA dengan halaman cetak.
//
// ⚠️ Lembar ini POSISI, bukan arus: yang didaftar kustodi yang MASIH BERLAKU
// pada akhir periode. Itu wajib tertulis di layar — tab sebelah menampilkan
// kartu BAST-nya (arus), jadi tanpa keterangan operator mengira salah satunya
// kehilangan baris.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { labelPeriodeKop } from '@/lib/formatPermendagri'
import {
  FORMAT_PENGAMANAN, URUT_PENGAMANAN, type IdPengamanan,
} from '@/lib/formatPengamanan'
import { muatLaporanPengamanan, type BarisPengamanan } from '@/lib/laporanPengamanan'
import LembarPengamananPermendagri from './LembarPengamananPermendagri'

export default function PengamananFormatPermendagri({ skpdId, periode }: {
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const [id, setId] = useState<IdPengamanan>('peralatan_mesin')
  const [rows, setRows] = useState<BarisPengamanan[]>([])
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const f = FORMAT_PENGAMANAN[id]
  const siap = skpdId != null && !!periode

  useEffect(() => {
    if (!siap) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLaporanPengamanan(supabase, { golongan: f.golongan, skpdId: skpdId!, periode })
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
  }, [id, skpdId, periode, siap]) // eslint-disable-line react-hooks/exhaustive-deps

  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const urlCetak = `/cetak/pengamanan-permendagri?lap=${id}&skpd=${skpdId}&periode=${periode}`
  const kurang = !periode ? 'Pilih Periode dulu.'
    : skpdId == null ? `Pilih SKPD dulu — lembar ${f.kode} memuat identitas SKPD di kopnya.`
      : ''

  return (
    <div className="space-y-4">
      <div className="card p-4 border-l-4 border-teal text-sm text-gray-600">
        Lembar <b>IV.J</b> mendaftar <b>kustodi yang MASIH BERLAKU</b> pada akhir periode — ia
        POSISI, bukan arus. Barang yang sudah <i>Dikembalikan</i> atau BAST-nya dibatalkan tidak
        ikut, walaupun kartunya masih terlihat di tab <i>Daftar</i>. Jadi kalau jumlahnya berbeda,
        itu memang begitu.
      </div>

      <div className="card p-4 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Jenis aset</p>
          <div className="flex flex-wrap gap-2">
            {URUT_PENGAMANAN.map(x => (
              <button key={x} onClick={() => setId(x)}
                className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                  id === x ? 'bg-teal text-white border-teal font-medium'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {FORMAT_PENGAMANAN[x].label}
                <span className={`ml-2 text-[11px] ${id === x ? 'text-white/70' : 'text-gray-400'}`}>
                  {FORMAT_PENGAMANAN[x].kode}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
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
            Pratinjau — <b>{rows.length.toLocaleString('id-ID')} barang</b> · {judulPeriode} {tahun}.
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px]">
              <LembarPengamananPermendagri
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
