'use client'
// ============================================================================
// Cetak lembar PENGHAPUSAN sesuai Format baku Permendagri 47/2021 — IV.K.
//
//   ?lap=pemindahtanganan     IV.K.1.2–1.6
//   ?lap=pengalihan           IV.K.2.2–2.6  (sisi SKPD yang MELEPAS)
//   ?lap=sebab_lain           IV.K.6.2–6.6
//   &skpd=<id>                WAJIB — semua lembar memuat identitas SKPD di kop
//   &periode=2026-S1          atau &periode=2026 (AKHIR TAHUN: S1+S2 digabung)
//   &komptabel=intra|ekstra|semua  (bawaan: intra)
//   &lembar=2,3,4,5,6         bawaan: 2–6
//   &ttd=<id pegawai>&tgl=YYYY-MM-DD         (opsional, memaksa pilihan)
//
// ⚠️ ANGKANYA DIMUAT `muatLaporanPenghapusan` — SAMA dengan tab "Format
// Permendagri" di menu Pelaporan. Dua jalur angka untuk lembar yang sama adalah
// cara paling gampang menghasilkan pratinjau yang berbeda dari berkas yang
// akhirnya ditandatangani.
//
// ⚠️ `?lap=` yang tak dikenal DITOLAK — bukan diam-diam jatuh ke salah satu
// cabang. Ketiga lembar berkop & berkolom berbeda, jadi berkas yang salah
// cabang tetap terisi penuh & tak ada yang menandainya.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import {
  labelKomptabel, cocokKomptabel, berupaAset, labelPeriodeKop,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import {
  FORMAT_PENGHAPUSAN, type IdPenghapusan, type FormatPenghapusan,
} from '@/lib/formatPenghapusan'
import {
  muatLaporanPenghapusan, periodePosisiPenghapusan, type BarisPenghapusan,
} from '@/lib/laporanPenghapusan'
import { cssCetakLembar } from '@/lib/cetakLembar'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ingatanCetak, kunciTtdPenghapusan } from '@/lib/ingatanCetak'
import LembarPenghapusanPermendagri from '@/components/pelaporan/LembarPenghapusanPermendagri'

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * ⚠️ TANPA `plt`, sengaja — sama alasannya dgn keluarga perpindahan, reklas, &
 * koreksi: kaki lembar ini mencetak PERAN ("Pengguna Barang" / "Kuasa Pengguna
 * Barang", dari level SKPD), bukan jabatan struktural. "Plt. Pengguna Barang"
 * bukan sebutan yang ada, jadi kendalinya akan jadi no-op senyap.
 */
type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (lap: IdPenghapusan, skpdId: number) =>
  ingatanCetak<TtdTersimpan>(kunciTtdPenghapusan(lap, skpdId))

export default function CetakPenghapusanPermendagriPage() {
  const supabase = createClient()
  const [lap, setLap] = useState<IdPenghapusan>('pemindahtanganan')
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisPenghapusan[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [lembar, setLembar] = useState<number[] | undefined>(undefined)
  const [tanpaPeny, setTanpaPeny] = useState(0)
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const lapQ = (q.get('lap') || 'pemindahtanganan') as IdPenghapusan
        const fq = FORMAT_PENGHAPUSAN[lapQ] as FormatPenghapusan | undefined
        if (!fq) {
          throw new Error(`Lembar "${q.get('lap')}" tidak dikenal. Yang tersedia: `
            + Object.keys(FORMAT_PENGHAPUSAN).join(', ') + '.')
        }
        setLap(lapQ)
        const per = q.get('periode') || ''
        if (!per) {
          throw new Error('Periode belum dipilih. Kop lembar ini menyebut satu semester '
            + 'atau satu tahun, jadi wajib berperiode.')
        }
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        if (!sk) {
          throw new Error(`SKPD belum dipilih. Kelima lembar ${fq.awalan}.x memuat identitas `
            + 'SKPD di kopnya, jadi hanya sah per-SKPD.')
        }
        setPeriode(per); setSkpdId(sk)
        const kmp = q.get('komptabel')
        setKomptabel(kmp === 'ekstra' || kmp === 'semua' ? kmp : 'intra')
        const pilih = (q.get('lembar') || '').split(',').map(Number).filter(n => n >= 2 && n <= 6)
        setLembar(pilih.length > 0 ? pilih : undefined)

        const h = await muatLaporanPenghapusan(supabase, { f: fq, skpdId: sk, periode: per })
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd)
        setSebutan(h.sebutan); setTanpaPeny(h.tanpaPenyusutan)

        // ⚠️ WAJIB `fetchCalonTtd`, bukan `admin_pegawai` ber-`.eq('skpd_id')`:
        // dari 816 SKPD hanya 57 yang punya pegawai berjabatan "Kepala" & 756
        // di antaranya sub-SKPD. Gagal memuatnya TIDAK menjatuhkan lembar —
        // blok tanda tangan tinggal bertitik-titik, keadaan yang memang sah.
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

  const f = FORMAT_PENGHAPUSAN[lap]
  const ttd = calon.find(c => c.id === ttdId) || null
  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const adaRinci = !lembar || lembar.includes(2)

  const items: ItemLaporan<BarisPenghapusan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r,
      akumulasi: r.akumulasi ?? 0, nilaiBuku: r.nilaiBuku ?? 0,
    }))

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
      {/* ORIENTASI DITENTUKAN LEMBAR YANG DICENTANG: lembar rinci 21–24 sel per
          baris — mustahil di lebar 215 mm. Rekapnya cuma 7–10 sel, jadi muat
          potret.
          ⚠️ `@page` BERNAMA terbukti TIDAK jalan di Chrome; untuk dua orientasi
          dalam satu berkas, pisahkan centangnya & cetak dua kali. */}
      <style>{cssCetakLembar({
        id: 'cetak-penghapusan-permendagri',
        kertas: adaRinci ? 'F4 lanskap' : 'F4 potret',
        margin: adaRinci ? '6mm' : '12mm',
        tambahan: '  .break-before-page { break-before: page; }',
      })}</style>

      <div className="max-w-[1600px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && !gagal && (
          <>
            <p className="mr-auto text-xs text-gray-500">
              💡 Di dialog Print, <b>hilangkan centang &quot;Headers and footers&quot;</b> — tanggal,
              URL, &amp; judul tab di tepi kertas itu bawaan peramban, tak bisa dihapus dari halaman.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Komptabel:
              <select className="select-filter text-sm" value={komptabel}
                onChange={e => setKomptabel(e.target.value as Komptabel)}>
                <option value="intra">Intrakomptabel</option>
                <option value="ekstra">Ekstrakomptabel</option>
                <option value="semua">Intra + Ekstra</option>
              </select>
            </label>
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

      {/* ⚠️ PERINGATAN, bukan error — lembarnya tetap terbit dengan titik-titik
          di kolom Akumulasi & Nilai Buku. */}
      {siap && !gagal && tanpaPeny > 0 && (
        <div className="max-w-[1600px] mx-auto mb-3 px-4 no-print">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
            <b>{periodePosisiPenghapusan(periode)}</b> — kolom Akumulasi &amp; Nilai Buku-nya
            dicetak titik-titik, bukan nol. Jalankan Engine di menu Penyusutan untuk periode itu
            dulu kalau lembar ini akan ditandatangani.
          </p>
        </div>
      )}

      <div id="cetak-penghapusan-permendagri"
        className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0 space-y-10 print:space-y-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <LembarPenghapusanPermendagri
            f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
            berupa={berupaAset(items.map(i => i.kode))}
            labelKomptabel={labelKomptabel(komptabel)}
            judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
            ttd={ttd ? { nama: ttd.nama, nip: ttd.nip } : null}
            tglTtd={tglTtd} lembar={lembar} />
        )}
      </div>
    </div>
  )
}
