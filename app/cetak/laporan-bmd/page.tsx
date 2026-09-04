'use client'
import { ingatanCetak, kunciTtdLaporanBmd } from '@/lib/ingatanCetak'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
// ============================================================================
// Cetak LAPORAN BMD — Permendagri 47/2021 Format IV.L.4.2 (per SKPD).
// Standalone (tanpa sidebar), A4 PORTRAIT — lembarnya cuma 4 kolom, jadi tak
// ada alasan memakai landscape seperti lembar Perolehan/RKBMD yang belasan kolom.
//
//   ?periode=YYYY-Sx   (WAJIB)
//   &skpd=<id>         (WAJIB — kepala lembar memuat identitas SKPD)
//   &komptabel=intra|ekstra|   (kosong = gabungan; default 'intra' spt Laporan BMD)
//   [&ttd=<id pegawai>&plt=1&tgl=YYYY-MM-DD]
//
// SUSUNAN BARIS diambil dari lib/laporanBmdFormat.ts — dipakai bersama Format
// IV.L.4.1/4.3/4.4 nanti. JANGAN menyalin daftarnya ke sini.
//
// ⚠️ "Saldo akhir" baris aset = NILAI PEROLEHAN (bruto), bukan nilai buku.
// Yang membuatnya jadi nilai buku adalah baris akumulasi (1.3.7/1.5.5/1.5.6)
// yang dikurangkan di subtotal kelompok — itu bentuk baku neraca & itu yang
// diminta formatnya. Angka per golongan di lembar ini karena itu SENGAJA beda
// dari kolom "Nilai Buku" di layar Laporan BMD Model 1; yang harus sama adalah
// SUBTOTAL kelompoknya.
//
// ⚠️ FAIL-CLOSED: `assertOk` melempar kalau RPC-nya gagal → lembar tidak
// dirakit sama sekali. Lembar bertanda tangan yang angkanya kurang-sebagian
// jauh lebih mahal daripada halaman yang menolak tampil (CLAUDE.md).
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assertOk } from '@/shared/db/query'
import type { RekapRpcRow } from '@/lib/rekapBmd'
import TabelLaporanBmd from '@/components/pelaporan/TabelLaporanBmd'
import {
  ukuranPerGolongan, pecahPeriode, labelKomptabel, type UkuranGolongan,
} from '@/lib/laporanBmdFormat'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

type SkpdRow = SkpdNode & { level: number; kode_skpd: string | null; kode_lokasi: string | null }

function descendantsOf(all: { id: number; parent_id: number | null }[], root: number): number[] {
  const anak = new Map<number, number[]>()
  for (const s of all) {
    if (s.parent_id == null) continue
    const a = anak.get(s.parent_id) || []; a.push(s.id); anak.set(s.parent_id, a)
  }
  const out: number[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id); out.push(id)
    for (const c of anak.get(id) || []) stack.push(c)
  }
  return out
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** '2026-08-26' → '26 Agustus 2026'. Diurai manual — `new Date(iso)` dibaca
 *  sbg UTC & di zona negatif tanggalnya mundur sehari; lembar bertanda tangan
 *  tak boleh bergeser tanggalnya karena zona waktu peramban. */
function tglPanjang(s: string): string {
  const [y, m, d] = (s || '').slice(0, 10).split('-')
  const bln = BULAN[Number(m) - 1]
  return y && bln && d ? `${Number(d)} ${bln} ${y}` : ''
}
const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** Sebutan penanda tangan mengikuti LEVEL SKPD — format mencantumkan ketiganya
 *  ("Kuasa Pengguna Barang, Pengguna Barang atau Pengelola Barang") karena satu
 *  lampiran melayani semua tingkatan; yang dicetak harus yang berlaku saja. */
const sebutanPengguna = (level: number) => (level <= 1 ? 'Pengguna Barang' : 'Kuasa Pengguna Barang')

type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (skpdId: number) => ingatanCetak<TtdTersimpan>(kunciTtdLaporanBmd(skpdId))

export default function CetakLaporanBmdPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [peta, setPeta] = useState<Map<string, UkuranGolongan>>(new Map())
  const [skpd, setSkpd] = useState<SkpdRow | null>(null)
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState('intra')
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const per = q.get('periode') || ''
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        // `komptabel` boleh kosong (gabungan) — bedakan "parameter tak ada"
        // (pakai default 'intra', sama dgn layar Laporan BMD) dari "sengaja
        // dikosongkan" (gabungan intra+ekstra).
        const kom = q.has('komptabel') ? (q.get('komptabel') || '') : 'intra'
        setPeriode(per); setKomptabel(kom)
        if (!per) throw new Error('Periode belum dipilih.')
        if (!sk) throw new Error('SKPD belum dipilih. Lembar ini memuat identitas SKPD di kepalanya, jadi wajib per-SKPD.')

        const semua: SkpdRow[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('admin_skpd')
            .select('id,nama,parent_id,level,kode_skpd,kode_lokasi').range(from, from + 999)
          if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
          if (!data || data.length === 0) break
          semua.push(...(data as SkpdRow[]))
          if (data.length < 1000) break
        }
        const ini = semua.find(s => s.id === sk)
        if (!ini) throw new Error(`SKPD #${sk} tidak ditemukan.`)
        setSkpd(ini)

        // Calon penanda tangan — WAJIB fetchCalonTtd (CLAUDE.md): dari 816 SKPD
        // hanya 57 punya pegawai berjabatan "Kepala" & 756 di antaranya
        // sub-SKPD, jadi query `.eq('skpd_id')` polos membuat lembar UPTD/Bidang
        // nyaris selalu kosong. Gagal memuatnya TIDAK menjatuhkan lembar —
        // blok tanda tangan tinggal bertitik-titik.
        const byId = new Map<number, SkpdNode>(
          semua.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)
        const simpan = ingatan(sk).baca()
        setTtdId(q.get('ttd') || simpan?.id || calonTtdAwal(daftar)?.id || '')
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())

        // Angka — SATU panggilan RPC, sama dgn yang dipakai layar Laporan BMD.
        const rows = assertOk(await supabase.rpc('fn_rekap_bmd', {
          p_periode: per,
          p_skpd_ids: descendantsOf(semua, sk),
          p_komptabel: kom || null,
        }), `rekap BMD periode ${per}`) as RekapRpcRow[]
        setPeta(ukuranPerGolongan(rows || []))
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ttd = calon.find(c => c.id === ttdId) || null
  const { semester, tahun } = pecahPeriode(periode)

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (!skpd) return
    const v: TtdTersimpan = { id: ttdId, tgl: tglTtd, ...next }
    ingatan(skpd.id).simpan(v)
  }

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasLaporan({ laporan: 'Laporan BMD', periode, skpd: skpd.nama })
  }, [skpd, periode])

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
              Penanda tangan:
              <select className="select-filter text-sm max-w-xs" value={ttdId}
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
              {/* Nama instansi SAJA — sebutan "Pengguna Barang" dicabut dari
                  kop (keputusan user 2026-08-26); ia sudah muncul di blok tanda
                  tangan, dan di kop justru membuat baris identitasnya panjang
                  tanpa menambah keterangan apa pun. */}
              <p className="font-bold text-[12px] uppercase">{skpd?.nama}</p>
              <p className="font-bold text-[12px]">SEMESTER {semester || '……'}</p>
              <p className="font-bold text-[12px]">TAHUN {tahun || '……'}</p>
            </div>

            <table className="mb-3 text-[11px]">
              <tbody>
                <tr><td className="pr-8 py-0.5">Kode Lokasi</td><td>: {skpd?.kode_lokasi || skpd?.kode_skpd || '…………………'}</td></tr>
                <tr><td className="pr-8 py-0.5">Provinsi</td><td>: {PROVINSI}</td></tr>
                <tr><td className="pr-8 py-0.5">Kabupaten/Kota</td><td>: {KABUPATEN}</td></tr>
              </tbody>
            </table>

            <TabelLaporanBmd peta={peta} />

            {/* Penanda tangan DIPILIH operator; yang belum dipilih DIBIARKAN
                bertitik-titik — mengarang nama di dokumen yang akan diteken jauh
                lebih berbahaya daripada titik-titik yang jelas belum diisi.
                Baris di bawah nama = NIP, bukan jabatan (kalau jabatan, sebutan
                yang sama tercetak dua kali beruntun). */}
            <div className="flex justify-end mt-10 text-[11px]">
              <div className="text-center w-72">
                <p>{KABUPATEN}, {tglPanjang(tglTtd)}</p>
                <p>{sebutanPengguna(skpd?.level ?? 1)}</p>
                <div className="h-16" />
                <p className="font-semibold underline">{ttd?.nama || '…………………………………………'}</p>
                <p>Nip. {ttd?.nip || '…………………………………'}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
