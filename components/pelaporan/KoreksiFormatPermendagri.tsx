'use client'
// ============================================================================
// Tab "Format Permendagri" di menu Pelaporan → Pengelolaan → Koreksi.
//
// Operator memilih lembar mana yang disusun (IV.G.2 rinci + IV.G.3–G.7 rekap),
// melihat pratinjaunya, lalu mencetak. Filter Periode & SKPD dari induknya
// (LaporanKoreksi) supaya sama dengan dua tab lainnya.
//
// ⚠️ Angkanya dimuat `muatLaporanKoreksi` + `itemKoreksi` — SAMA dengan halaman
// cetak. Dua jalur angka untuk lembar yang sama adalah cara paling gampang
// menghasilkan pratinjau yang berbeda dari berkas yang ditandatangani.
//
// ⚠️ CAKUPANNYA HANYA `koreksi_nilai`, dan itu WAJIB dikatakan di layar: tab
// sebelah menampilkan kelima alasan koreksi, jadi tanpa keterangan operator
// akan mengira lembar ini kehilangan baris. Alasannya di kepala
// lib/formatKoreksi.ts.
//
// ⚠️ TIDAK ADA kelompok "se-Kabupaten" — keenam lembar memuat isian "KUASA
// PENGGUNA BARANG, PENGGUNA BARANG ATAU PENGELOLA BARANG…(3)" di kopnya, jadi
// keenamnya per-SKPD.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  labelKomptabel, cocokKomptabel, berupaAset, labelPeriodeKop,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import {
  TANGGA_KOREKSI, URUT_LEMBAR, AWALAN_KOREKSI, kodeLembarKoreksi,
  type IdLembarKoreksi,
} from '@/lib/formatKoreksi'
import {
  muatLaporanKoreksi, itemKoreksi, periodePosisiKoreksi, type BarisKoreksi,
} from '@/lib/laporanKoreksi'
import LembarKoreksiPermendagri from './LembarKoreksiPermendagri'

const LABEL_LEMBAR: Record<IdLembarKoreksi, string> = {
  g2: 'Rinci (per barang) — sebelum · setelah · selisih',
  g3: 'Rekap selisih menurut sub-sub rincian objek (masih per barang)',
  g4: 'Rekap selisih menurut sub rincian objek',
  g5: 'Rekap selisih menurut rincian objek',
  g6: 'Rekap selisih menurut objek',
  g7: 'Rekap selisih menurut jenis',
}

export default function KoreksiFormatPermendagri({ skpdId, periode }: {
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<BarisKoreksi[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [tanpaSnapshot, setTanpaSnapshot] = useState(0)
  const [tanpaPeny, setTanpaPeny] = useState(0)
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [pilih, setPilih] = useState<IdLembarKoreksi[]>([...URUT_LEMBAR])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const siap = skpdId != null && !!periode

  useEffect(() => {
    if (!siap || pilih.length === 0) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLaporanKoreksi(supabase, { skpdId: skpdId!, periode })
        if (batal) return
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd)
        setSebutan(h.sebutan); setTanpaSnapshot(h.tanpaSnapshot); setTanpaPeny(h.tanpaPenyusutan)
      } catch (e) {
        // Fail-closed: modul pelaporan lebih baik menolak tampil daripada
        // menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setErr((e as Error).message); setRows([]); setSkpd(null) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan "Memuat…" SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [skpdId, periode, siap, pilih.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lembar ini menyatakan SATU komptabel di kop, jadi isinya wajib benar-benar
  // satu komptabel. Barang tanpa nilai kolom itu dianggap intra, sejalan dgn
  // `klasifikasiKomptabel` (bawaannya intra).
  const items: ItemLaporan<BarisKoreksi>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(itemKoreksi)

  const { judul: judulPeriode, tahun } = labelPeriodeKop(periode)
  const urlCetak = `/cetak/koreksi-permendagri?skpd=${skpdId}&periode=${periode}`
    + `&komptabel=${komptabel}&lembar=${URUT_LEMBAR.filter(id => pilih.includes(id)).join(',')}`

  /** Kenapa tombol Cetak mati / pratinjau kosong — dikatakan, bukan didiamkan. */
  const kurang = !periode ? 'Pilih Periode dulu.'
    : skpdId == null ? `Pilih SKPD dulu — keenam lembar ${AWALAN_KOREKSI}.x memuat identitas SKPD di kopnya.`
      : pilih.length === 0 ? 'Centang minimal satu lembar.'
        : ''

  const toggle = (id: IdLembarKoreksi) =>
    setPilih(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const adaRinci = pilih.includes('g2')

  return (
    <div className="space-y-4">
      {/* ⚠️ Cakupan DIKATAKAN, bukan didiamkan — tab sebelah memuat kelima
          alasan koreksi, jadi tanpa ini operator mengira lembarnya kehilangan
          baris. */}
      <div className="card p-4 border-l-4 border-teal text-sm text-gray-600">
        Lembar <b>{AWALAN_KOREKSI}</b> hanya memuat <b>Koreksi Nilai Perolehan</b>. Seluruh kolom
        uangnya &ldquo;Nilai Perolehan / Akumulasi / Nilai Buku, sebelum &amp; setelah&rdquo; —
        ia format tentang <b>perubahan nilai</b>. Koreksi Spesifikasi, Pencatatan Ganda,
        Pemecahan, &amp; Penggabungan tak mengubah satu pun dari ketiganya, jadi Permendagri
        47/2021 memang tak menyediakan lembar untuk keempatnya. Angkanya karena itu berbeda dari
        tab <i>Daftar Transaksi</i>, dan itu memang begitu.
      </div>

      <div className="card p-4 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Lembar yang disusun</p>
          <div className="grid gap-y-2 md:grid-cols-2">
            {URUT_LEMBAR.map(id => (
              <label key={id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={pilih.includes(id)} onChange={() => toggle(id)} />
                <span className="font-medium">{kodeLembarKoreksi(TANGGA_KOREKSI[id])}</span>
                <span className="text-gray-500">{LABEL_LEMBAR[id]}</span>
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
            Kertas: <b>F4 {adaRinci ? 'lanskap' : 'potret'}</b>
            {adaRinci && pilih.length > 1 && (
              <span> — rekap ikut lanskap. Mau rekap potret? Cetak IV.G.2 sendiri
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

      {/* ⚠️ PERINGATAN, bukan error — lembarnya tetap terbit, tapi kolom
          "Sebelum Koreksi" & seluruh Selisih untuk barang-barang itu dicetak
          titik-titik. Tanpa keterangan ini operator mengira angkanya nol. */}
      {!kurang && !err && !loading && tanpaSnapshot > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 text-sm text-amber-800">
          ⚠ <b>{tanpaSnapshot}</b> baris koreksi dicatat <b>sebelum 7 September 2026</b>, waktu
          aplikasi belum membekukan akumulasi penyusutan sebelum koreksi. Kolom{' '}
          <b>Sebelum Koreksi</b> &amp; <b>Selisih</b> untuk baris-baris itu dicetak titik-titik
          (bukan nol) — angkanya memang tak tersimpan di mana pun. Koreksi baru sudah membawanya.
        </div>
      )}
      {!kurang && !err && !loading && tanpaPeny > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 text-sm text-amber-800">
          ⚠ <b>{tanpaPeny}</b> barang belum punya hasil penyusutan untuk periode{' '}
          <b>{periodePosisiKoreksi(periode)}</b>, jadi kolom <b>Setelah Koreksi</b>-nya dicetak
          titik-titik. Jalankan <b>Engine</b> di menu Penyusutan untuk periode itu lebih dulu
          kalau lembarnya akan ditandatangani.
        </div>
      )}

      {kurang ? (
        <div className="card p-6 text-sm text-gray-500">{kurang}</div>
      ) : loading ? (
        <div className="card p-6 text-sm text-gray-400">Memuat…</div>
      ) : err ? null : (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3">
            Pratinjau — <b>{items.length.toLocaleString('id-ID')} koreksi nilai</b> ·{' '}
            {judulPeriode} {tahun} · {labelKomptabel(komptabel).toLowerCase()}.
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px] space-y-10">
              <LembarKoreksiPermendagri
                items={items} namaTingkat={namaTingkat} skpd={skpd}
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
