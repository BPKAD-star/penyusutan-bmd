'use client'
import { ingatanCetak, KUNCI_TTD_LAPORAN_BMD_PEMDA } from '@/lib/ingatanCetak'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
// ============================================================================
// Cetak LAPORAN BMD — Permendagri 47/2021 Format IV.L.4.4 (SE-PEMDA).
// Kembaran IV.L.4.2 (app/cetak/laporan-bmd) untuk lingkup seluruh kabupaten.
// A4 portrait.
//
//   ?periode=YYYY-Sx                 (WAJIB)
//   &komptabel=intra|ekstra|         (kosong = gabungan; default 'intra')
//   [&ttdKiri=<id>&ttdKanan=<id>&tgl=YYYY-MM-DD]
//
// BEDANYA DARI 4.2 CUMA TIGA, dan tabelnya sengaja dipakai bersama lewat
// <TabelLaporanBmd> supaya isinya mustahil menyimpang:
//   1. Lingkup: `p_skpd_ids = null` (seluruh SKPD yang boleh dilihat pengguna).
//   2. Kop menyebut PROVINSI & KABUPATEN, bukan nama SKPD — jadi TIDAK ada blok
//      "Kode Lokasi/Provinsi/Kabupaten" terpisah (identitasnya sudah di kop).
//   3. DUA tanda tangan: "Mengetahui, Pengelola Barang" (kiri) & "Pejabat
//      Penatausahaan Barang" (kanan).
//
// ⚠️ PENANDA TANGAN DIPILIH BEBAS dari seluruh `admin_pegawai`, sengaja BUKAN
// ditebak dari `role_bmd`: per 2026-08-26 peran `penatausahaan_barang_pengelola`
// (yang paling cocok untuk TTD kanan) NOL BARIS di basis data, jadi tebakan apa
// pun pasti meleset & blok kanannya selalu titik-titik. Pola yang sama dipakai
// lembar se-Kabupaten RKBMD. Yang ber-`role_bmd` cocok ditandai ✓ dan dipilih
// lebih dulu, tapi operator tetap boleh menimpanya.
//
// ⚠️ FAIL-CLOSED: RPC gagal → lembar tak dirakit sama sekali (assertOk).
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assertOk } from '@/shared/db/query'
import type { RekapRpcRow } from '@/lib/rekapBmd'
import TabelLaporanBmd from '@/components/pelaporan/TabelLaporanBmd'
import {
  ukuranPerGolongan, pecahPeriode, labelKomptabel, type UkuranGolongan,
} from '@/lib/laporanBmdFormat'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** Peran yang paling cocok untuk tiap blok tanda tangan — dipakai HANYA sebagai
 *  saran awal & penanda ✓, bukan penyaring (lihat catatan kepala berkas). */
const ROLE_KIRI = 'pengelola_barang'
const ROLE_KANAN = 'penatausahaan_barang_pengelola'

type Pegawai = { id: string; nama: string; nip: string | null; jabatan: string | null; role_bmd: string | null }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** '2026-08-26' → '26 Agustus 2026'. Diurai manual — `new Date(iso)` dibaca
 *  sbg UTC & di zona negatif tanggalnya mundur sehari. */
function tglPanjang(s: string): string {
  const [y, m, d] = (s || '').slice(0, 10).split('-')
  const bln = BULAN[Number(m) - 1]
  return y && bln && d ? `${Number(d)} ${bln} ${y}` : ''
}
const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** Satu kunci se-pemda (tak ada SKPD yang membedakan), pola `bmd_rkbmd_ttd_sekab`. */
type TtdTersimpan = { kiri?: string; kanan?: string; tgl?: string }
const ingatan = ingatanCetak<TtdTersimpan>(KUNCI_TTD_LAPORAN_BMD_PEMDA)

export default function CetakLaporanBmdPemdaPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [peta, setPeta] = useState<Map<string, UkuranGolongan>>(new Map())
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState('intra')
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [kiriId, setKiriId] = useState('')
  const [kananId, setKananId] = useState('')
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const per = q.get('periode') || ''
        const kom = q.has('komptabel') ? (q.get('komptabel') || '') : 'intra'
        setPeriode(per); setKomptabel(kom)
        if (!per) throw new Error('Periode belum dipilih.')

        // Calon penanda tangan — gagal memuatnya TIDAK menjatuhkan lembar;
        // blok tanda tangan tinggal bertitik-titik, keadaan yang memang sah.
        let daftar: Pegawai[] = []
        try {
          const { data } = await supabase.from('admin_pegawai')
            .select('id,nama,nip,jabatan,role_bmd').order('nama').limit(2000)
          daftar = (data || []) as Pegawai[]
        } catch { daftar = [] }
        setPegawai(daftar)

        const simpan = ingatan.baca()
        setKiriId(q.get('ttdKiri') || simpan?.kiri || daftar.find(p => p.role_bmd === ROLE_KIRI)?.id || '')
        setKananId(q.get('ttdKanan') || simpan?.kanan || daftar.find(p => p.role_bmd === ROLE_KANAN)?.id || '')
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())

        // `p_skpd_ids: null` = seluruh lingkup yang boleh dilihat pengguna.
        // Untuk admin pemda itu berarti se-kabupaten; untuk operator SKPD,
        // RLS di dalam RPC-nya tetap mempersempit — lembar ini memang
        // diperuntukkan admin/Pengelola Barang.
        const rows = assertOk(await supabase.rpc('fn_rekap_bmd', {
          p_periode: per,
          p_skpd_ids: null,
          p_komptabel: kom || null,
        }), `rekap BMD se-pemda periode ${per}`) as RekapRpcRow[]
        setPeta(ukuranPerGolongan(rows || []))
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const kiri = pegawai.find(p => p.id === kiriId) || null
  const kanan = pegawai.find(p => p.id === kananId) || null
  const { semester, tahun } = pecahPeriode(periode)

  function simpanTtd(next: Partial<TtdTersimpan>) {
    const v: TtdTersimpan = { kiri: kiriId, kanan: kananId, tgl: tglTtd, ...next }
    ingatan.simpan(v)
  }

  useEffect(() => {
    document.title = namaBerkasLaporan({ laporan: 'Laporan BMD', periode })
  }, [periode])

  const opsi = (role: string) => (
    <>
      <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
      {pegawai.map(p => (
        <option key={p.id} value={p.id}>
          {p.nama}{p.jabatan ? ` — ${p.jabatan}` : ''}{p.role_bmd === role ? ' ✓' : ''}
        </option>
      ))}
    </>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 1.5cm; } body { background: white; } }`}</style>

      <div className="max-w-[820px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && !gagal && (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Tanggal:
              <input type="date" className="select-filter text-sm" value={tglTtd}
                onChange={e => { setTglTtd(e.target.value); simpanTtd({ tgl: e.target.value }) }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Pengelola Barang:
              <select className="select-filter text-sm max-w-[16rem]" value={kiriId}
                onChange={e => { setKiriId(e.target.value); simpanTtd({ kiri: e.target.value }) }}>
                {opsi(ROLE_KIRI)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Pejabat Penatausahaan:
              <select className="select-filter text-sm max-w-[16rem]" value={kananId}
                onChange={e => { setKananId(e.target.value); simpanTtd({ kanan: e.target.value }) }}>
                {opsi(ROLE_KANAN)}
              </select>
            </label>
          </>
        )}
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <div className="max-w-[820px] mx-auto bg-white p-8 shadow print:shadow-none print:p-0 text-[11px]">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <>
            <div className="text-center leading-tight mb-4">
              <p className="font-bold text-[13px]">LAPORAN BMD</p>
              <p className="font-bold text-[12px]">{labelKomptabel(komptabel)}</p>
              <p className="font-bold text-[12px] uppercase">
                Provinsi {PROVINSI}, Kabupaten {KABUPATEN}
              </p>
              <p className="font-bold text-[12px]">SEMESTER {semester || '……'}</p>
              <p className="font-bold text-[12px]">TAHUN {tahun || '……'}</p>
            </div>

            <TabelLaporanBmd peta={peta} />

            {/* DUA blok tanda tangan — kiri "Mengetahui", kanan yang bertanggal.
                Yang belum dipilih DIBIARKAN bertitik-titik; mengarang nama di
                dokumen yang akan diteken jauh lebih berbahaya daripada
                titik-titik yang jelas belum diisi. */}
            <div className="flex justify-between mt-10 text-[11px]">
              <div className="text-center w-72">
                <p>Mengetahui</p>
                <p>Pengelola Barang</p>
                <div className="h-16" />
                <p className="font-semibold underline">{kiri?.nama || '…………………………………………'}</p>
                <p>Nip. {kiri?.nip || '…………………………………'}</p>
              </div>
              <div className="text-center w-72">
                <p>{KABUPATEN}, {tglPanjang(tglTtd)}</p>
                <p>Pejabat Penatausahaan Barang</p>
                <div className="h-16" />
                <p className="font-semibold underline">{kanan?.nama || '…………………………………………'}</p>
                <p>Nip. {kanan?.nip || '…………………………………'}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
