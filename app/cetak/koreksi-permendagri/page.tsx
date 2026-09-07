'use client'
// ============================================================================
// Cetak lembar KOREKSI sesuai Format baku Permendagri 47/2021 — IV.G.2–G.7.
//
//   &skpd=<id>                WAJIB — semua lembar memuat identitas SKPD di kop
//   &periode=2026-S1          atau &periode=2026 (AKHIR TAHUN: S1+S2 digabung)
//   &komptabel=intra|ekstra|semua  (bawaan: intra)
//   &lembar=g2,g3,g4,g5,g6,g7 bawaan: semuanya
//   &ttd=<id pegawai>&tgl=YYYY-MM-DD         (opsional, memaksa pilihan)
//
// ⚠️ ANGKANYA DIMUAT `muatLaporanKoreksi` + `itemKoreksi` — SAMA dengan tab
// "Format Permendagri" di menu Pelaporan. Dua jalur angka untuk lembar yang
// sama adalah cara paling gampang menghasilkan pratinjau yang berbeda dari
// berkas yang akhirnya ditandatangani.
//
// ⚠️ CAKUPANNYA `koreksi_nilai` saja — lihat kepala lib/formatKoreksi.ts.
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
import { URUT_LEMBAR, AWALAN_KOREKSI, type IdLembarKoreksi } from '@/lib/formatKoreksi'
import {
  muatLaporanKoreksi, itemKoreksi, periodePosisiKoreksi, type BarisKoreksi,
} from '@/lib/laporanKoreksi'
import { cssCetakLembar } from '@/lib/cetakLembar'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { ingatanCetak, kunciTtdKoreksi } from '@/lib/ingatanCetak'
import LembarKoreksiPermendagri from '@/components/pelaporan/LembarKoreksiPermendagri'

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * ⚠️ TANPA `plt`, sengaja — sama alasannya dgn lembar Perpindahan & Reklas:
 * kaki lembar ini mencetak PERAN ("Pengguna Barang" / "Kuasa Pengguna Barang",
 * dari level SKPD), bukan jabatan struktural. "Plt. Pengguna Barang" bukan
 * sebutan yang ada, jadi kendalinya akan jadi no-op senyap.
 */
type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (skpdId: number) => ingatanCetak<TtdTersimpan>(kunciTtdKoreksi(skpdId))

export default function CetakKoreksiPermendagriPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisKoreksi[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [lembar, setLembar] = useState<IdLembarKoreksi[] | undefined>(undefined)
  const [tanpaSnapshot, setTanpaSnapshot] = useState(0)
  const [tanpaPeny, setTanpaPeny] = useState(0)
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
          throw new Error(`SKPD belum dipilih. Keenam lembar ${AWALAN_KOREKSI}.x memuat `
            + 'identitas SKPD di kopnya, jadi hanya sah per-SKPD.')
        }
        setPeriode(per); setSkpdId(sk)
        const kmp = q.get('komptabel')
        setKomptabel(kmp === 'ekstra' || kmp === 'semua' ? kmp : 'intra')
        // ⚠️ Disaring lewat daftar lembar yang SAH, bukan rentang angka —
        // nilai tak dikenal diabaikan, bukan diam-diam menerbitkan lembar lain.
        const minta = (q.get('lembar') || '').split(',').map(x => x.trim())
          .filter((x): x is IdLembarKoreksi => (URUT_LEMBAR as string[]).includes(x))
        setLembar(minta.length > 0 ? minta : undefined)

        const h = await muatLaporanKoreksi(supabase, { skpdId: sk, periode: per })
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd)
        setSebutan(h.sebutan); setTanpaSnapshot(h.tanpaSnapshot); setTanpaPeny(h.tanpaPenyusutan)

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

  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const ttd = calon.find(c => c.id === ttdId) || null
  const adaRinci = !lembar || lembar.includes('g2')

  const items: ItemLaporan<BarisKoreksi>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(itemKoreksi)

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    ingatan(skpdId).simpan({ id: ttdId, tgl: tglTtd, ...next })
  }

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasLaporan({ laporan: 'IV.G.2', periode: tahun, skpd: skpd.nama })
  }, [skpd, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* ORIENTASI DITENTUKAN LEMBAR YANG DICENTANG: IV.G.2 memuat 26 sel per
          baris (7 sel kode + 19 kolom) — mustahil di lebar 215 mm. Rekapnya
          cuma 9–13 sel, jadi muat potret.
          ⚠️ `@page` BERNAMA terbukti TIDAK jalan di Chrome; untuk dua orientasi
          dalam satu berkas, pisahkan centangnya & cetak dua kali. */}
      <style>{cssCetakLembar({
        id: 'cetak-koreksi-permendagri',
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
          di sisi yang tak diketahui. Tanpa keterangan ini operator mengira
          angkanya nol. */}
      {siap && !gagal && (tanpaSnapshot > 0 || tanpaPeny > 0) && (
        <div className="max-w-[1600px] mx-auto mb-3 px-4 no-print space-y-2">
          {tanpaSnapshot > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ <b>{tanpaSnapshot}</b> baris koreksi dicatat sebelum 7 September 2026, waktu
              aplikasi belum membekukan akumulasi penyusutan sebelum koreksi — kolom
              <b> Sebelum Koreksi</b> &amp; <b>Selisih</b>-nya dicetak titik-titik, bukan nol.
            </p>
          )}
          {tanpaPeny > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
              <b>{periodePosisiKoreksi(periode)}</b> — kolom <b>Setelah Koreksi</b>-nya dicetak
              titik-titik. Jalankan Engine di menu Penyusutan untuk periode itu dulu.
            </p>
          )}
        </div>
      )}

      <div id="cetak-koreksi-permendagri"
        className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0 space-y-10 print:space-y-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <LembarKoreksiPermendagri
            items={items} namaTingkat={namaTingkat} skpd={skpd}
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
