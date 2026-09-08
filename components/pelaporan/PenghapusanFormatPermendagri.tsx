'use client'
// ============================================================================
// Tab "Format Permendagri" di menu Pelaporan → Pengelolaan → Penghapusan.
//
// Cabangnya (IV.K.1 / IV.K.2 / IV.K.6) ditentukan penyaring "Alasan
// penghapusan" di induknya — bukan dipilih lagi di sini. Filter Periode & SKPD
// juga dari induk supaya sama dengan dua tab lainnya.
//
// ⚠️ Angkanya dimuat `muatLaporanPenghapusan` — SAMA dengan halaman cetak. Dua
// jalur angka untuk lembar yang sama adalah cara paling gampang menghasilkan
// pratinjau yang berbeda dari berkas yang akhirnya ditandatangani.
//
// ⚠️ TIDAK ADA kelompok "se-Kabupaten": kelima lembar tiap cabang memuat isian
// sebutan pejabat & SKPD di kopnya, jadi semuanya per-SKPD.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  labelKomptabel, cocokKomptabel, berupaAset, labelPeriodeKop,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import {
  FORMAT_PENGHAPUSAN, TANGGA_REKAP_PENGHAPUSAN, type IdPenghapusan,
} from '@/lib/formatPenghapusan'
import {
  muatLaporanPenghapusan, periodePosisiPenghapusan, type BarisPenghapusan,
} from '@/lib/laporanPenghapusan'
import LembarPenghapusanPermendagri from './LembarPenghapusanPermendagri'

/** Daftar lembar yang bisa dicentang: rinci + empat kedalaman rekap. */
const PILIHAN = [
  { akhiran: 2, label: 'Rinci (per barang)' },
  ...TANGGA_REKAP_PENGHAPUSAN.map(t => ({
    akhiran: t.akhiran, label: `Rekap menurut ${t.menurut.toLowerCase()}`,
  })),
]

export default function PenghapusanFormatPermendagri({ id, skpdId, periode }: {
  /** Cabang formatnya — dari penyaring "Alasan penghapusan" di induk. */
  id: IdPenghapusan
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const f = FORMAT_PENGHAPUSAN[id]
  const [rows, setRows] = useState<BarisPenghapusan[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [tanpaPeny, setTanpaPeny] = useState(0)
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [pilih, setPilih] = useState<number[]>(PILIHAN.map(p => p.akhiran))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const siap = skpdId != null && !!periode

  useEffect(() => {
    if (!siap || pilih.length === 0) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLaporanPenghapusan(supabase, { f, skpdId: skpdId!, periode })
        if (batal) return
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd)
        setSebutan(h.sebutan); setTanpaPeny(h.tanpaPenyusutan)
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
  }, [id, skpdId, periode, siap, pilih.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lembar ini menyatakan SATU komptabel di kop, jadi isinya wajib benar-benar
  // satu komptabel. Barang tanpa nilai kolom itu dianggap intra, sejalan dgn
  // `klasifikasiKomptabel` (bawaannya intra).
  const items: ItemLaporan<BarisPenghapusan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r,
      akumulasi: r.akumulasi ?? 0, nilaiBuku: r.nilaiBuku ?? 0,
    }))

  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const urlCetak = `/cetak/penghapusan-permendagri?lap=${id}&skpd=${skpdId}`
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
      {/* ⚠️ Cabang IV.K.2 membaca ledger yang SAMA dengan menu Penggunaan, cuma
          dari sisi berlawanan — dan itu wajib dikatakan, kalau tidak operator
          mengira salah satu menu salah. */}
      {id === 'pengalihan' && (
        <div className="card p-4 border-l-4 border-teal text-sm text-gray-600">
          Lembar <b>{f.kode}</b> memandang pengalihan status dari sisi SKPD yang <b>MELEPAS</b> —
          bagi dia barangnya hilang dari daftar. Baris ledgernya SAMA dengan yang dilaporkan menu{' '}
          <i>Laporan Penggunaan</i> (Format IV.B.1.2), yang membacanya dari sisi <b>penerima</b>.
          Jadi kalau angkanya berbeda dari menu itu, memang begitu.
        </div>
      )}

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
          </div>
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
          <p className="text-xs text-gray-500 self-end">
            Kertas: <b>F4 {pilih.includes(2) ? 'lanskap' : 'potret'}</b>
            {pilih.includes(2) && pilih.length > 1 && (
              <span> — rekap ikut lanskap. Mau rekap potret? Cetak {f.kode} sendiri
                dulu, lalu centang rekapnya saja.</span>
            )}
          </p>
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
          <p className="text-xs text-red-600 mt-1">
            Angka TIDAK ditampilkan — muat ulang halaman dulu.
          </p>
        </div>
      )}

      {/* ⚠️ PERINGATAN, bukan error: lembarnya tetap terbit, tapi kolom
          Akumulasi & Nilai Buku barang-barang itu dicetak titik-titik. */}
      {!kurang && !err && !loading && tanpaPeny > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 text-sm text-amber-800">
          ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
          <b>{periodePosisiPenghapusan(periode)}</b>, jadi kolom Akumulasi &amp; Nilai Buku-nya
          dicetak titik-titik (bukan nol). Jalankan <b>Engine</b> di menu Penyusutan untuk
          periode itu lebih dulu kalau lembarnya akan ditandatangani.
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
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px] space-y-10">
              <LembarPenghapusanPermendagri
                f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
                berupa={berupaAset(items.map(i => i.kode))}
                labelKomptabel={labelKomptabel(komptabel)}
                judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                ttd={null} tglTtd="" lembar={pilih} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
