'use client'
// ============================================================================
// Cetak Laporan PEMANFAATAN BMD (tabel datar 15 kolom).
//
//   ?skpd=<id>            WAJIB — kop lembar memuat identitas SKPD
//   &periode=2026-S1      atau &periode=2026
//   &ttd=<id pegawai>&tgl=YYYY-MM-DD      (opsional, memaksa pilihan)
//
// ⚠️ ANGKANYA DIMUAT `muatLaporanPemanfaatanPermendagri` — SAMA dengan tab
// "Format Permendagri" di menu Pelaporan.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import { labelPeriodeKop } from '@/lib/formatPermendagri'
import { FORMAT_PEMANFAATAN } from '@/lib/formatPemanfaatan'
import {
  muatLaporanPemanfaatanPermendagri, type BarisPemanfaatanLembar,
} from '@/lib/laporanPemanfaatanPermendagri'
import { cssCetakLembar } from '@/lib/cetakLembar'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ingatanCetak, kunciTtdPemanfaatan } from '@/lib/ingatanCetak'
import LembarPemanfaatanPermendagri from '@/components/pelaporan/LembarPemanfaatanPermendagri'

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** ⚠️ TANPA `plt`, sengaja — kaki lembar ini mencetak PERAN, bukan jabatan
 *  struktural; "Plt. Pengguna Barang" bukan sebutan yang ada. */
type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (skpdId: number) => ingatanCetak<TtdTersimpan>(kunciTtdPemanfaatan(skpdId))

export default function CetakPemanfaatanPermendagriPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisPemanfaatanLembar[]>([])
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [periode, setPeriode] = useState('')
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const per = q.get('periode') || ''
        if (!per) {
          throw new Error('Periode belum dipilih. Kop lembar ini menyebut satu semester '
            + 'atau satu tahun, jadi wajib berperiode.')
        }
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        if (!sk) {
          throw new Error('SKPD belum dipilih. Lembar ini memuat identitas SKPD di kopnya, '
            + 'jadi hanya sah per-SKPD.')
        }
        setPeriode(per); setSkpdId(sk)

        const h = await muatLaporanPemanfaatanPermendagri(supabase, { skpdId: sk, periode: per })
        setRows(h.rows); setSkpd(h.skpd); setSebutan(h.sebutan)

        // ⚠️ WAJIB `fetchCalonTtd`, bukan `admin_pegawai` ber-`.eq('skpd_id')`:
        // dari 816 SKPD hanya 57 yang punya pegawai berjabatan "Kepala" & 756
        // di antaranya sub-SKPD. Gagal memuatnya TIDAK menjatuhkan lembar.
        const byId = new Map<number, SkpdNode>(
          h.semuaSkpd.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)

        const simpan = ingatan(sk).baca()
        setTtdId(q.get('ttd') || simpan?.id || calonTtdAwal(daftar)?.id || '')
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const f = FORMAT_PEMANFAATAN
  const ttd = calon.find(c => c.id === ttdId) || null
  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    ingatan(skpdId).simpan({ id: ttdId, tgl: tglTtd, ...next })
  }

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasLaporan({ laporan: 'Laporan Pemanfaatan', periode: tahun, skpd: skpd.nama })
  }, [skpd, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* 15 kolom — muat di F4 lanskap. ⚠️ `@page` BERNAMA terbukti tak jalan di
          Chrome; jangan dicoba untuk dua orientasi dalam satu berkas. */}
      <style>{cssCetakLembar({
        id: 'cetak-pemanfaatan-permendagri',
        kertas: 'F4 lanskap',
        margin: '8mm',
      })}</style>

      <div className="max-w-[1600px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && !gagal && (
          <>
            <p className="mr-auto text-xs text-gray-500">
              💡 Di dialog Print, <b>hilangkan centang &quot;Headers and footers&quot;</b> — tanggal,
              URL, &amp; judul tab di tepi kertas itu bawaan peramban, tak bisa dihapus dari halaman.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Tanggal:
              <input type="date" className="select-filter text-sm" value={tglTtd}
                onChange={e => { setTglTtd(e.target.value); simpanTtd({ tgl: e.target.value }) }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Penanda tangan:
              <select className="select-filter text-sm max-w-sm" value={ttdId}
                onChange={e => { setTtdId(e.target.value); simpanTtd({ id: e.target.value }) }}>
                <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
                {calon.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nama}{c.jabatan ? ` — ${c.jabatan}` : ''}{labelAsalTtd(c)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <div id="cetak-pemanfaatan-permendagri"
        className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <LembarPemanfaatanPermendagri
            f={f} rows={rows} skpd={skpd}
            judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
            ttd={ttd ? { nama: ttd.nama, nip: ttd.nip } : null} tglTtd={tglTtd} />
        )}
      </div>
    </div>
  )
}
