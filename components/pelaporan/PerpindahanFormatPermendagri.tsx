'use client'
// ============================================================================
// Tab "Format Permendagri" di menu Pelaporan → Pengelolaan → Penggunaan
// (IV.B.1) & Penerimaan Internal (IV.C).
//
// Operator memilih lembar mana yang mau disusun (rinci + empat rekap), melihat
// pratinjaunya, lalu mencetak. Filter Periode & SKPD datang dari komponen induk
// (LaporanPerpindahan) supaya sama dengan dua tab lainnya.
//
// ⚠️ Angkanya dimuat `muatLembarPerpindahan` — SAMA dengan halaman cetak. Dua
// jalur angka untuk lembar yang sama adalah cara paling gampang menghasilkan
// pratinjau yang berbeda dari berkas yang akhirnya ditandatangani, dan bedanya
// tak akan bersuara.
//
// ⚠️ TIDAK ADA kelompok "se-Kabupaten" di kedua cabang ini — dan itu bukan
// pekerjaan yang tertinggal. Kelima lembarnya memuat isian sebutan pejabat &
// SKPD di kop, jadi kelimanya per-SKPD. Bandingkan cabang IV.A yang memang
// punya IV.A.<n>.7–10 berkop "PROVINSI, KABUPATEN/KOTA".
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TANGGA_REKAP, labelKomptabel, cocokKomptabel, berupaAset, labelPeriodeKop,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import { FORMAT_PERPINDAHAN, CABANG_GABUNGAN, type IdPerpindahan } from '@/lib/formatPerpindahan'
import { FORMAT_GABUNGAN_INTERNAL } from '@/lib/formatGabunganInternal'
import LembarGabunganInternal from './LembarGabunganInternal'
import {
  muatLembarPerpindahan, periodePosisi, type BarisPerpindahan,
} from '@/lib/laporanPerpindahan'
import LembarPerpindahanPermendagri from './LembarPerpindahanPermendagri'

/** Daftar lembar yang bisa dicentang: rinci + empat kedalaman rekap. */
const PILIHAN = [
  { akhiran: 2, label: 'Rinci (per barang)' },
  ...TANGGA_REKAP.map(t => ({ akhiran: t.akhiran, label: `Rekap menurut ${t.menurut.toLowerCase()}` })),
]

/**
 * Akhiran lembar rekap GABUNGAN IV.D.7 — cuma ditawarkan di cabang
 * `CABANG_GABUNGAN`. Angkanya sengaja 7 supaya sejajar nomor formatnya.
 */
const AKHIRAN_GABUNGAN = 7

export default function PerpindahanFormatPermendagri({ id, skpdId, periode }: {
  /** Cabang formatnya — `'penggunaan'` (IV.B.1) atau `'internal'` (IV.C). */
  id: IdPerpindahan
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const f = FORMAT_PERPINDAHAN[id]
  const [rows, setRows] = useState<BarisPerpindahan[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [tanpaPeny, setTanpaPeny] = useState(0)
  // ⚠️ Baris untuk IV.D.7 DITARIK TERSENDIRI dgn `arah: 'semua'` — lembar itu
  // mendaftar KEDUA arah, sementara lembar IV.D.2–D.6 di atasnya cuma yang
  // keluar. Menyaringnya di klien dari satu tarikan mustahil: halaman ini tak
  // tahu daftar sub-SKPD dalam scope, dan itu justru yang menentukan sisi mana
  // yang "di dalam".
  const [rowsGab, setRowsGab] = useState<BarisPerpindahan[]>([])
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [pilih, setPilih] = useState<number[]>(PILIHAN.map(p => p.akhiran))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const adaGabungan = id === CABANG_GABUNGAN
  const siap = skpdId != null && !!periode

  useEffect(() => {
    if (!siap || pilih.length === 0) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLembarPerpindahan(supabase, {
          jenis: f.jenis, arah: f.arah, skpdId: skpdId!, periode,
        })
        if (batal) return
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd)
        setSebutan(h.sebutan); setTanpaPeny(h.tanpaPenyusutan)
        if (adaGabungan && pilih.includes(AKHIRAN_GABUNGAN)) {
          const g = await muatLembarPerpindahan(supabase, {
            jenis: f.jenis, arah: 'semua', skpdId: skpdId!, periode,
          })
          if (batal) return
          setRowsGab(g.rows)
        } else setRowsGab([])
      } catch (e) {
        // Fail-closed: modul pelaporan lebih baik menolak tampil daripada
        // menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setErr((e as Error).message); setRows([]); setRowsGab([]); setSkpd(null) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan "Memuat…" SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
    // `pilih.length` ikut: kalau tak ada lembar dicentang, datanya tak perlu
    // ditarik sama sekali.
  }, [id, skpdId, periode, siap, pilih.length, pilih.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lembar ini menyatakan SATU komptabel di kop, jadi isinya wajib benar-benar
  // satu komptabel. Barang tanpa nilai kolom itu dianggap intra, sejalan dengan
  // `klasifikasiKomptabel` (bawaannya intra).
  const items: ItemLaporan<BarisPerpindahan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r,
      akumulasi: r.akumulasi ?? 0, nilaiBuku: r.nilaiBuku ?? 0,
    }))

  const itemsGab = rowsGab.filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const urlCetak = `/cetak/perpindahan-permendagri?lap=${id}&skpd=${skpdId}`
    + `&periode=${periode}&komptabel=${komptabel}&lembar=${[...pilih].sort((a, b) => a - b).join(',')}`

  /** Kenapa tombol Cetak mati / pratinjau kosong — dikatakan, bukan didiamkan. */
  const kurang = !periode ? 'Pilih Periode dulu.'
    : skpdId == null ? `Pilih SKPD dulu — kelima lembar ${f.awalan}.x memuat identitas SKPD di kopnya.`
      : pilih.length === 0 ? 'Centang minimal satu lembar.'
        : ''

  const toggle = (n: number) =>
    setPilih(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].sort((a, b) => a - b))

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Lembar yang disusun</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PILIHAN.map(p => (
              <label key={p.akhiran} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={pilih.includes(p.akhiran)}
                  onChange={() => toggle(p.akhiran)} />
                <span className="font-medium">{f.awalan}.{p.akhiran}</span>
                <span className="text-gray-500">{p.label}</span>
              </label>
            ))}
            {adaGabungan && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={pilih.includes(AKHIRAN_GABUNGAN)}
                  onChange={() => toggle(AKHIRAN_GABUNGAN)} />
                <span className="font-medium">{FORMAT_GABUNGAN_INTERNAL.kode}</span>
                <span className="text-gray-500">Rekap gabungan (pengeluaran + penerimaan)</span>
              </label>
            )}
          </div>
          {adaGabungan && pilih.includes(AKHIRAN_GABUNGAN) && (
            // ⚠️ Dikatakan di layar, bukan didiamkan: lembar ini mendaftar KEDUA
            // arah, jadi barisnya lebih banyak daripada lembar IV.D.2 di
            // atasnya — dan tanpa keterangan itu operator mengira salah satunya
            // bug. Sekalian diluruskan bahwa baris totalnya bukan cek silang.
            <p className="text-xs text-gray-500 mt-2 border-l-2 border-teal pl-2">
              <b>{FORMAT_GABUNGAN_INTERNAL.kode}</b> mendaftar <b>kedua arah</b> mutasi internal
              (keluar &amp; masuk), jadi barisnya lebih banyak daripada lembar {f.awalan}.2 di atas —
              itu memang begitu. Kedua blok angkanya kembar karena satu baris ledger merekam kedua
              sisi sekaligus; yang berbeda cuma pihaknya, dan baris Jumlah Total-nya menyatakan
              ulang, bukan mengecek silang.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter" value={komptabel}
              onChange={e => setKomptabel(e.target.value as Komptabel)}>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
              <option value="semua">Intra + Ekstra</option>
            </select>
          </div>
          {/* Orientasi kertas ikut centangnya — dikatakan di layar supaya
              operator tak perlu mencetak dulu untuk tahu. Satu berkas hanya bisa
              satu orientasi (`@page` BERNAMA terbukti tak dijalankan Chrome). */}
          <p className="text-xs text-gray-500 self-end">
            Kertas: <b>F4 {pilih.includes(2) ? 'lanskap' : 'potret'}</b>
            {pilih.includes(2) && pilih.length > 1 && (
              <span> — rekap ikut lanskap. Mau rekap potret? Cetak {f.kode} sendiri
                dulu, lalu centang rekapnya saja.</span>
            )}
          </p>
          <div className="ml-auto">
            {/* ⚠️ Dimatikan berikut ALASANNYA — tombol mati tanpa keterangan itu
                kegagalan senyap: operator menekan, tak terjadi apa-apa, dan tak
                punya cara tahu kenapa. */}
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
          <p className="text-xs text-red-600 mt-1">
            Angka TIDAK ditampilkan — muat ulang halaman dulu.
          </p>
        </div>
      )}

      {/* ⚠️ Ini PERINGATAN, bukan error: lembarnya tetap terbit. Tapi kolom (17)
          & (18) untuk barang-barang itu dicetak titik-titik, dan tanpa
          keterangan ini operator akan mengira angkanya memang nol. */}
      {!kurang && !err && !loading && tanpaPeny > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 text-sm text-amber-800">
          ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
          <b>{periodePosisi(periode)}</b>, jadi kolom Akumulasi &amp; Nilai Buku-nya dicetak
          titik-titik (bukan nol). Jalankan <b>Engine</b> di menu Penyusutan untuk periode itu
          lebih dulu kalau lembarnya akan ditandatangani.
        </div>
      )}

      {kurang ? (
        <div className="card p-6 text-sm text-gray-500">{kurang}</div>
      ) : loading ? (
        <div className="card p-6 text-sm text-gray-400">Memuat…</div>
      ) : err ? null : (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3">
            Pratinjau — <b>{items.length.toLocaleString('id-ID')} barang</b> ·{' '}
            {judulPeriode} {tahun} · {labelKomptabel(komptabel).toLowerCase()}.
            {/* Pratinjau sengaja tak memilih penanda tangan: pilihannya disimpan
                per SKPD di layar cetak supaya cetak ulang menghasilkan lembar
                yang SAMA — berkas ini diteken lalu dipindai. */}
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px] space-y-10">
              <LembarPerpindahanPermendagri
                f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
                berupa={berupaAset(items.map(i => i.kode))}
                labelKomptabel={labelKomptabel(komptabel)}
                judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                ttd={null} tglTtd="" lembar={pilih} />
              {adaGabungan && pilih.includes(AKHIRAN_GABUNGAN) && (
                <LembarGabunganInternal
                  rows={itemsGab} namaTingkat={namaTingkat} skpd={skpd}
                  berupa={berupaAset(itemsGab.map(r => r.aset!.kode))}
                  labelKomptabel={labelKomptabel(komptabel)}
                  judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                  ttd={null} tglTtd="" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
