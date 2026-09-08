'use client'
// ============================================================================
// Cetak lembar PENGAMANAN sesuai Format Permendagri 47/2021 — IV.J.1.2 & IV.J.2.2.
//
//   ?lap=peralatan_mesin | rumah_negara   (bawaan: peralatan_mesin)
//   &skpd=<id>            WAJIB — kop lembar memuat identitas SKPD
//   &periode=2026-S1      atau &periode=2026
//   &ttd=<id pegawai>&tgl=YYYY-MM-DD      (opsional, memaksa pilihan)
//
// ⚠️ ANGKANYA DIMUAT `muatLaporanPengamanan` — SAMA dengan tab "Format
// Permendagri" di menu Pelaporan.
//
// ⚠️ `?lap=` yang tak dikenal DITOLAK, bukan diam-diam jatuh ke salah satu
// cabang: keduanya berkop & bergolongan berbeda, jadi berkas yang salah cabang
// tetap terisi penuh & tak ada yang menandainya.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import { labelPeriodeKop } from '@/lib/formatPermendagri'
import {
  FORMAT_PENGAMANAN, type IdPengamanan, type FormatPengamanan,
} from '@/lib/formatPengamanan'
import { muatLaporanPengamanan, type BarisPengamanan } from '@/lib/laporanPengamanan'
import { cssCetakLembar } from '@/lib/cetakLembar'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ingatanCetak, kunciTtdPengamanan } from '@/lib/ingatanCetak'
import LembarPengamananPermendagri from '@/components/pelaporan/LembarPengamananPermendagri'

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** ⚠️ TANPA `plt`, sengaja — kaki lembar ini mencetak PERAN, bukan jabatan
 *  struktural; "Plt. Pengguna Barang" bukan sebutan yang ada. */
type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (lap: IdPengamanan, skpdId: number) =>
  ingatanCetak<TtdTersimpan>(kunciTtdPengamanan(lap, skpdId))

export default function CetakPengamananPermendagriPage() {
  const supabase = createClient()
  const [lap, setLap] = useState<IdPengamanan>('peralatan_mesin')
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisPengamanan[]>([])
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
        const lapQ = (q.get('lap') || 'peralatan_mesin') as IdPengamanan
        const fq = FORMAT_PENGAMANAN[lapQ] as FormatPengamanan | undefined
        if (!fq) {
          throw new Error(`Lembar "${q.get('lap')}" tidak dikenal. Yang tersedia: `
            + Object.keys(FORMAT_PENGAMANAN).join(', ') + '.')
        }
        setLap(lapQ)
        const per = q.get('periode') || ''
        if (!per) {
          throw new Error('Periode belum dipilih. Kop lembar ini menyebut satu semester '
            + 'atau satu tahun, jadi wajib berperiode.')
        }
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        if (!sk) {
          throw new Error(`SKPD belum dipilih. Lembar ${fq.kode} memuat identitas SKPD di kopnya, `
            + 'jadi hanya sah per-SKPD.')
        }
        setPeriode(per); setSkpdId(sk)

        const h = await muatLaporanPengamanan(supabase, { golongan: fq.golongan, skpdId: sk, periode: per })
        setRows(h.rows); setSkpd(h.skpd); setSebutan(h.sebutan)

        // ⚠️ WAJIB `fetchCalonTtd`, bukan `admin_pegawai` ber-`.eq('skpd_id')`:
        // dari 816 SKPD hanya 57 yang punya pegawai berjabatan "Kepala" & 756
        // di antaranya sub-SKPD. Gagal memuatnya TIDAK menjatuhkan lembar.
        const byId = new Map<number, SkpdNode>(
          h.semuaSkpd.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)

        const simpan = ingatan(lapQ, sk).baca()
        setTtdId(q.get('ttd') || simpan?.id || calonTtdAwal(daftar)?.id || '')
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const f = FORMAT_PENGAMANAN[lap]
  const ttd = calon.find(c => c.id === ttdId) || null
  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    ingatan(lap, skpdId).simpan({ id: ttdId, tgl: tglTtd, ...next })
  }

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasLaporan({ laporan: f.kode, periode: tahun, skpd: skpd.nama })
  }, [skpd, f.kode, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* 16 kolom — muat di F4 lanskap. ⚠️ `@page` BERNAMA terbukti tak jalan di
          Chrome; jangan dicoba untuk dua orientasi dalam satu berkas. */}
      <style>{cssCetakLembar({
        id: 'cetak-pengamanan-permendagri',
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

      <div id="cetak-pengamanan-permendagri"
        className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <LembarPengamananPermendagri
            f={f} rows={rows} skpd={skpd}
            judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
            ttd={ttd ? { nama: ttd.nama, nip: ttd.nip } : null} tglTtd={tglTtd} />
        )}
      </div>
    </div>
  )
}
