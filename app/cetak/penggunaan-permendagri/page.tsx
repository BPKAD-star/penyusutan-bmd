'use client'
// ============================================================================
// Cetak lembar PENGGUNAAN sesuai Format baku Permendagri 47/2021 (cabang IV.B.1).
//
//   ?skpd=<id>                WAJIB — kelima lembar memuat identitas SKPD di kop
//   &periode=2026-S1          atau &periode=2026 (AKHIR TAHUN: S1+S2 digabung)
//   &komptabel=intra|ekstra|semua  (bawaan: intra)
//   &lembar=2,3,4,5,6         bawaan: semuanya
//   &ttd=<id pegawai>&tgl=YYYY-MM-DD         (opsional, memaksa pilihan)
//
// Lembar yang dicentang dirangkai jadi SATU berkas dengan page-break, pola yang
// sama dengan BA Rekon & lembar Perolehan: sekali cetak, sekali tanda tangan,
// dan tiap lembar tetap bisa diambil sendiri kalau diminta.
//
// ⚠️ ANGKANYA DIMUAT `muatLembarPenggunaan` — SAMA dengan tab "Format
// Permendagri" di menu Pelaporan. Dua jalur angka untuk lembar yang sama adalah
// cara paling gampang menghasilkan pratinjau yang berbeda dari berkas yang
// akhirnya ditandatangani, dan bedanya tak akan bersuara.
//
// ⚠️ SUSUNAN & PENOMORAN KOLOMNYA DATA, BUKAN JSX — lihat `FORMAT_PENGGUNAAN`
// di lib/formatPenggunaan.ts.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import {
  labelKomptabel, cocokKomptabel, berupaAset, labelPeriodeKop,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import { FORMAT_PENGGUNAAN } from '@/lib/formatPenggunaan'
import {
  muatLembarPenggunaan, periodePosisi, type BarisPenggunaan,
} from '@/lib/laporanPenggunaan'
// ⚠️ Mekanik cetak DIPAKAI BERSAMA, bukan disalin: `cssCetakLembar` menyatukan
// blok @media print & `ingatanCetak` menyatukan ingatan pilihan cetak.
import { cssCetakLembar, namaBerkasCetak } from '@/lib/cetakLembar'
import { ingatanCetak, kunciTtdPenggunaan } from '@/lib/ingatanCetak'
import LembarPenggunaanPermendagri from '@/components/pelaporan/LembarPenggunaanPermendagri'

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * ⚠️ TANPA `plt`, sengaja — beda dari lembar Perolehan & RKBMD yang menyimpannya.
 *
 * Kaki lembar IV.B.1.x mencetak **PERAN** ("Pengguna Barang" / "Kuasa Pengguna
 * Barang", diturunkan dari level SKPD), bukan jabatan struktural seperti
 * "Kepala Dinas". Peran itu melekat pada kantornya, jadi pemangkunya
 * menandatangani atas nama peran yang sama entah ia definitif atau pelaksana
 * tugas — "Plt. Pengguna Barang" bukan sebutan yang ada.
 *
 * Karena itu pemilih Definitif/Plt TIDAK disediakan di sini. Menyediakannya
 * berarti kendali yang tak mengubah apa pun di lembar yang tercetak — no-op
 * senyap, kelas kesalahan yang berkali-kali sudah memakan korban di repo ini.
 * Kalau kelak formatnya minta jabatan struktural, `sebutanKepala()`
 * (lib/penandaTangan.ts) sudah siap dipakai — hidupkan bersama kendalinya.
 */
type TtdTersimpan = { id?: string; tgl?: string }
const ingatan = (skpdId: number) => ingatanCetak<TtdTersimpan>(kunciTtdPenggunaan(skpdId))

export default function CetakPenggunaanPermendagriPage() {
  const supabase = createClient()
  const f = FORMAT_PENGGUNAAN
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisPenggunaan[]>([])
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
        const per = q.get('periode') || ''
        if (!per) {
          throw new Error('Periode belum dipilih. Kop lembar ini menyebut satu semester '
            + 'atau satu tahun, jadi wajib berperiode.')
        }
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        if (!sk) {
          throw new Error('SKPD belum dipilih. Kelima lembar IV.B.1.2–1.6 memuat identitas '
            + 'SKPD di kopnya, jadi hanya sah per-SKPD.')
        }
        setPeriode(per); setSkpdId(sk)
        const kmp = q.get('komptabel')
        setKomptabel(kmp === 'ekstra' || kmp === 'semua' ? kmp : 'intra')
        const pilih = (q.get('lembar') || '').split(',').map(Number).filter(n => n >= 2 && n <= 6)
        setLembar(pilih.length > 0 ? pilih : undefined)

        const h = await muatLembarPenggunaan(supabase, { skpdId: sk, periode: per })
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

  const ttd = calon.find(c => c.id === ttdId) || null
  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const adaRinci = !lembar || lembar.includes(2)

  const items: ItemLaporan<BarisPenggunaan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r,
      akumulasi: r.akumulasi ?? 0, nilaiBuku: r.nilaiBuku ?? 0,
    }))

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    ingatan(skpdId).simpan({ id: ttdId, tgl: tglTtd, ...next })
  }

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasCetak(f.kode, skpd.nama, tahun)
  }, [skpd, f.kode, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* ORIENTASI DITENTUKAN OLEH LEMBAR YANG DICENTANG:
          · ada lembar RINCI → F4 lanskap (28 kolom mustahil di lebar 215 mm)
          · hanya REKAP      → F4 potret (cuma 6–9 kolom)
          ⚠️ `@page` BERNAMA (supaya satu berkas memuat dua orientasi sekaligus)
          TERBUKTI TIDAK JALAN di Chrome — `size` pada @page bernama diabaikan.
          Jangan dicoba lagi; untuk mendapat keduanya, pisahkan centangnya &
          cetak dua kali. */}
      <style>{cssCetakLembar({
        id: 'cetak-penggunaan-permendagri',
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
            {/* ⚠️ Calonnya dari `fetchCalonTtd`, yang sudah memuat kepala SKPD
                INDUK & pemegang jabatan rangkap — `labelAsalTtd` menandainya.
                Tak ada pilihan Definitif/Plt di sini; lihat `TtdTersimpan`. */}
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

      {/* ⚠️ PERINGATAN, bukan error — lembarnya tetap terbit. Tapi kolom (17) &
          (18) untuk barang-barang itu dicetak titik-titik, dan tanpa keterangan
          ini operator akan mengira angkanya memang nol. */}
      {siap && !gagal && tanpaPeny > 0 && (
        <div className="max-w-[1600px] mx-auto mb-3 px-4 no-print">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
            <b>{periodePosisi(periode)}</b> — kolom Akumulasi &amp; Nilai Buku-nya dicetak
            titik-titik, bukan nol. Jalankan Engine di menu Penyusutan untuk periode itu dulu
            kalau lembar ini akan ditandatangani.
          </p>
        </div>
      )}

      <div id="cetak-penggunaan-permendagri"
        className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0 space-y-10 print:space-y-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <LembarPenggunaanPermendagri
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
