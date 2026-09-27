'use client'
// ============================================================================
// PENYAJI lembar PENGHAPUSAN format Permendagri 47/2021 — keluarga IV.K.
//
//   IV.K.1.2–1.6  Penghapusan akibat PEMINDAHTANGANAN
//   IV.K.2.2–2.6  Penghapusan karena PENYERAHAN / PENGALIHAN STATUS PENGGUNAAN
//   IV.K.6.2–6.6  Penghapusan akibat SEBAB LAIN
//
// Murni tampilan — nol query, nol state. Angkanya dirakit
// `muatLaporanPenghapusan` (lib/laporanPenghapusan.ts), susunan & penomoran
// kolomnya dari `FORMAT_PENGHAPUSAN` (lib/formatPenghapusan.ts).
//
// Satu pemanggilan menghasilkan LIMA lembar berurutan dengan page-break:
// lembar rinci + empat rekap.
//
// ⚠️ SATU PENYAJI UNTUK TIGA CABANG — yang membedakan ketiganya SELURUHNYA data
// di registry (kolom mana yang ada, judulnya, penomorannya). Tak ada satu pun
// cabang `if` per format di berkas ini, dan itu memang syaratnya: begitu penyaji
// harus tahu sedang merender cabang yang mana, cabang keempat akan menambah
// cabang lagi sampai berkas ini tak terbaca.
//
// ⚠️ SENGAJA BUKAN `LembarPerpindahanPermendagri` yang di-prop-kan. Lembar
// rincinya memang sangat mirip, tapi REKAP-nya berbeda dua hal sekaligus —
// LIMA kolom (tanpa "Jumlah Barang") & mulai di 2 segmen, bukan 3 — jadi
// menyatukannya berarti menumbuhkan prop boolean di komponen yang sudah
// melayani tiga lembar lain (CODING-STANDARD §1.5). Yang DIPAKAI BERSAMA justru
// bagian yang berbahaya kalau menyimpang: mesin subtotal & peta nama tingkat.
// ============================================================================
import { Fragment } from 'react'
import { formatRupiah2 } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { asalUsulTampil, GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode, susunRekap, type ItemLaporan } from '@/lib/formatPermendagri'
import {
  SEG_MIN_REKAP_PENGHAPUSAN, TANGGA_REKAP_PENGHAPUSAN, KOLOM_DIJUMLAH_PENGHAPUSAN,
  judulRekapPenghapusan,
  type FormatPenghapusan, type KolomRinciPenghapusan,
} from '@/lib/formatPenghapusan'
import type { BarisPenghapusan } from '@/lib/laporanPenghapusan'

/** Pembungkus berkunci untuk sekelompok baris `<tr>` (satu jenis aset). */
const FragmenJenis = Fragment

/** Kedalaman grup jenis aset di lembar RINCI baru — pola keluarga perpindahan. */
const SEG_JENIS_RINCI = 3

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'


const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/** Sel-sel segmen kode. `sampai` = berapa segmen yang diisi (sisanya kosong). */
function SelKode({ kode, sampai, n, tebal }: {
  kode: string; sampai: number; n: number; tebal?: boolean
}) {
  const seg = segmenKode(kode)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <td key={i} className={`border border-black px-0.5 py-px text-center ${tebal ? 'font-bold' : ''}`}>
          {i < sampai ? (seg[i] ?? '') : ''}
        </td>
      ))}
    </>
  )
}

/**
 * Kop lembar.
 *
 * ⚠️ Penanda `(1)`…`(7)` TIDAK dicetak — angka dalam kurung di lembar
 * Permendagri itu rujukan ke "petunjuk pengisian", penanda TEMPLATE KOSONG
 * (keputusan user 2026-08-30, berlaku untuk seluruh lembar di aplikasi ini).
 *
 * ⚠️ Sebutan pejabat & nama SKPD dicetak DUA BARIS walaupun lembar aslinya
 * menyatukannya jadi satu isian — berdempetan dalam satu baris terbaca sebagai
 * satu nama jabatan yang tak pernah ada.
 */
function KopLembar({ judul, judulLanjut, berupa, menurut, komptabel, sebutan, skpd, periode, tahun }: {
  judul: string; judulLanjut: string; berupa: string; menurut?: string
  komptabel: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string
}) {
  return (
    <>
      {/* Logo kiri + spacer kanan selebar sama (permintaan user 2026-09-10) —
          pola sama dgn KOP KIBAR & keluarga IV.A (Perolehan). */}
      <div className="flex items-start gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-11 h-auto flex-shrink-0" />
        <div className="flex-1 text-center leading-tight">
          <p className="font-bold text-[11px]">{judul} {berupa}</p>
          <p className="font-bold text-[11px]">{judulLanjut}{menurut ? ` MENURUT ${menurut}` : ''}</p>
          <p className="font-bold text-[11px]">{komptabel}</p>
          <p className="font-bold text-[11px]">{sebutan.toUpperCase()}</p>
          <p className="font-bold text-[11px]">{(skpd?.nama || '').toUpperCase()}</p>
          <p className="font-bold text-[11px]">{periode}</p>
          <p className="font-bold text-[11px]">TAHUN {tahun}</p>
        </div>
        <div className="w-11 flex-shrink-0" aria-hidden="true" />
      </div>
      <table className="text-[9px] mb-1">
        <tbody>
          <tr><td className="pr-6">Provinsi</td><td>: {PROVINSI}</td></tr>
          <tr><td className="pr-6">Kabupaten/Kota</td><td>: {KABUPATEN}</td></tr>
        </tbody>
      </table>
    </>
  )
}

function BlokTtd({ sebutan, nama, nip, tgl }: {
  sebutan: string; nama: string | null; nip: string | null; tgl: string
}) {
  return (
    <div className="flex justify-end mt-8 text-[10px]">
      <div className="text-center w-80">
        <p>{KABUPATEN}, {tglPanjang(tgl)}</p>
        <p>{sebutan}</p>
        <div className="h-14" />
        {/* Yang belum dipilih DIBIARKAN bertitik-titik — mengarang nama di
            dokumen yang akan ditandatangani jauh lebih berbahaya. */}
        <p className="font-semibold">{nama || '…………………………………'}</p>
        <p>NIP. {nip || '……………………'}</p>
      </div>
    </div>
  )
}

const CATATAN_KAKI = '*) hanya diisi untuk BMD yang dilakukan Penyusutan atau Amortisasi.'

export type PropLembarPenghapusan = {
  /** Registry cabangnya. */
  f: FormatPenghapusan
  items: ItemLaporan<BarisPenghapusan>[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
  /**
   * Akhiran lembar yang ditampilkan: 2 = rinci, 3–6 = rekap. Kosong = semuanya.
   *
   * ⚠️ Yang dicentang operator menentukan APA YANG DICETAK, jadi ia menyaring
   * di SINI — bukan disembunyikan lewat CSS. Lembar tersembunyi tetap ikut ke
   * berkas PDF dan operator tak punya cara tahu.
   */
  lembar?: number[]
}

export default function LembarPenghapusanPermendagri(p: PropLembarPenghapusan) {
  const { f, items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (akhiran: number) => !p.lembar || p.lembar.includes(akhiran)
  const kolom = f.kolom
  const nKolom = kolom.length
  /** Letak kolom uang pertama — label baris total menempati semua kolom di kirinya. */
  const iUang = kolom.findIndex(k => k.key === KOLOM_DIJUMLAH_PENGHAPUSAN[0])
  const nUang = KOLOM_DIJUMLAH_PENGHAPUSAN.length
  const nSisa = nKolom - iUang - nUang

  const isiKolom = (k: KolomRinciPenghapusan, r: BarisPenghapusan): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // Uraian = NOMENKLATUR BAKU kodefikasi (ikut kodefikasi terkini).
      case 'kode': return <>{a.kode || ''}<br />{nama(a.kode) || a.uraian_barang || ''}</>
      // "Nama Barang" = spesifikasi nama yang diketik operator.
      case 'nama': return a.nama_barang || ''
      case 'merek': return a.merek_tipe || ''
      case 'no_polisi': return a.no_polisi || ''
      case 'jumlah': return <>{a.jumlah ?? 1}<br />{a.satuan || ''}</>
      case 'harga_satuan': return formatRupiah2(a.harga_satuan ?? r.nilai)
      case 'nilai_perolehan': return formatRupiah2(r.nilai)
      // ⚠️ Posisi yang TAK KETEMU dicetak titik-titik, BUKAN 0 — nol berarti
      // "memang belum tersusut", tak-ketemu berarti "engine belum dijalankan".
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.nilaiBuku ?? 0)
      // ⚠️ Tanggal Perolehan = kapan barang DIPEROLEH pemkab, BUKAN tanggal
      // penghapusannya (itu kolom Tanggal Dokumen).
      case 'tgl_perolehan': return tglID(a.tgl_perolehan)
      case 'cara_perolehan': return asalUsulTampil(a.asal_usul, a.cara_perolehan).teks
      case 'lokasi': return a.alamat_detail || ''
      // HANYA di IV.K.1.2 — hibah / penjualan / tukar-menukar / penyertaan modal.
      case 'cara_pemindahtanganan': return r.caraPemindahtanganan
      // HANYA di IV.K.6.2 — ledgernya tak punya sub-jenis, isinya memang tetap
      // (keputusan user 2026-09-28).
      case 'sebab': return 'Sebab Lain'
      // HANYA di IV.K.2.2 — SKPD seberang baris pengalihannya.
      case 'penerima': return r.penerima || ''
      // SK Penghapusan = kartu jurnal penghapusan itu sendiri.
      case 'dok_nomor': return r.header?.no_sk || r.payload?.no_sk || ''
      case 'dok_tanggal': return tglID(r.header?.tanggal || r.payload?.tgl_dokumen_sumber || r.tanggal)
      // Keterangan = isian kotak Keterangan di KARTU (kartu menang, pola yang
      // sama dgn keluarga perpindahan & reklasifikasi 2026-09-27).
      case 'keterangan': return r.header?.keterangan || r.keterangan || a.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomRinciPenghapusan) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  // ── Lembar RINCI IV.K.<n>.2 ───────────────────────────────────────────────
  //
  // ⚠️ BENTUK DITENTUKAN USER (2026-09-28), sengaja menyimpang dari lembar asli
  // Permendagri — pola, huruf, & warna PERSIS keluarga perpindahan &
  // reklasifikasi. Angka "Total <jenis>" dari MESIN SUBTOTAL BERSAMA
  // (`susunRekap` 3 segmen) — yang sama yang mengisi rekap .6.
  function LembarRinci() {
    const totalJenis = susunRekap(items, SEG_JENIS_RINCI, SEG_JENIS_RINCI)
      .filter(g => g.seg === SEG_JENIS_RINCI)
    const perJenis = new Map<string, ItemLaporan<BarisPenghapusan>[]>()
    for (const it of items) {
      const g = kodeLevel3(it.kode)
      perJenis.set(g, [...(perJenis.get(g) ?? []), it])
    }
    const namaJenis = (g: string) =>
      GOLONGAN_REKAP.find(x => x.kode === g)?.uraian || nama(g) || g
    const total = totalJenis.reduce(
      (t, g) => ({ nilai: t.nilai + g.nilai, akumulasi: t.akumulasi + g.akumulasi, nilaiBuku: t.nilaiBuku + g.nilaiBuku }),
      { nilai: 0, akumulasi: 0, nilaiBuku: 0 })
    const SEL = 'border border-black px-1.5 py-1'
    const CETAK_WARNA = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]'

    const BarisTotal = ({ label, v, kelas }: {
      label: string; v: { nilai: number; akumulasi: number; nilaiBuku: number }; kelas: string
    }) => (
      <tr className={kelas}>
        <td className={`${SEL} text-right`} colSpan={iUang}>{label}</td>
        <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(v.nilai)}</td>
        <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(v.akumulasi)}</td>
        <td className={`${SEL} text-right [overflow-wrap:anywhere]`}>{formatRupiah2(v.nilaiBuku)}</td>
        <td className={SEL} colSpan={nSisa} />
      </tr>
    )

    return (
      <section className="lembar-rinci">
        <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
        <KopLembar judul={f.judul} judulLanjut={f.judulLanjut} berupa={berupa}
          komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
          <colgroup>
            {kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <thead>
            <tr className={`text-center font-semibold bg-gray-50 ${CETAK_WARNA}`}>
              {kolom.map(k => (
                <th key={k.key} className={`${SEL} [overflow-wrap:anywhere]`}>{k.judul}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalJenis.map(g => (
              <FragmenJenis key={g.kode}>
                <tr className={`font-semibold bg-teal/5 ${CETAK_WARNA}`}>
                  <td className={SEL} colSpan={nKolom}>{g.kode} — {namaJenis(g.kode)}</td>
                </tr>
                {(perJenis.get(g.kode) ?? []).map(it => (
                  <tr key={`i${it.data.id}`} className="align-top">
                    {kolom.map(k => (
                      <td key={k.key}
                        // NIBAR 9px (pola keluarga perpindahan) supaya potongan 26
                        // digitnya muat sebaris; kolom bertanggal & uang tak dipecah.
                        className={`${SEL} ${rata(k)} ${
                          k.key === 'nibar' ? 'break-all tracking-tighter text-[9px]'
                            : k.rata === 'tengah' || k.rata === 'kanan' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                        {isiKolom(k, it.data)}
                      </td>
                    ))}
                  </tr>
                ))}
                <BarisTotal label={`Total ${namaJenis(g.kode)}`} v={g} kelas={`font-semibold bg-gray-100 ${CETAK_WARNA}`} />
              </FragmenJenis>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={nKolom} className={`${SEL} py-3 text-center`}>{f.kosong}</td></tr>
            ) : (
              <BarisTotal label="TOTAL" v={total} kelas={`font-bold bg-gray-200 ${CETAK_WARNA}`} />
            )}
          </tbody>
        </table>
        <p className="text-[8px] mt-1">{CATATAN_KAKI}</p>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  // ── Lembar REKAP IV.K.<n>.3–.6 ────────────────────────────────────────────
  //
  // ⚠️ LIMA kolom — TANPA "Jumlah Barang" yang ada di rekap IV.B/IV.C/IV.D.
  //    Lembar aslinya bahkan menuliskan rumusnya: `(12) = (10) - (11)`.
  // ⚠️ Mulai di 2 SEGMEN (kelompok neraca), bukan 3 — lihat
  //    `SEG_MIN_REKAP_PENGHAPUSAN`.
  // ⚠️ TANPA kolom "No" & TANPA baris JUMLAH, sama dgn keluarga perpindahan.
  function LembarRekap({ akhiran, seg, menurut, pecahHalaman }: {
    akhiran: number; seg: number; menurut: string; pecahHalaman: boolean
  }) {
    const baris = susunRekap(items, seg, SEG_MIN_REKAP_PENGHAPUSAN)
    const nSel = seg
    return (
      // ⚠️ Page-break hanya kalau ADA lembar sebelumnya — break di lembar
      // pertama menghasilkan satu halaman KOSONG di depan berkas, dan itu baru
      // ketahuan sesudah dicetak.
      <section className={`lembar-rekap ${pecahHalaman ? 'break-before-page' : ''}`}>
        <p className="text-right text-[12px] mb-1">Format {f.awalan}.{akhiran}</p>
        <KopLembar judul={judulRekapPenghapusan(f)} judulLanjut={f.judulLanjut} berupa={berupa}
          menurut={menurut} komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
          <colgroup>
            {Array.from({ length: nSel }, (_, i) => (
              <col key={i} style={{ width: `${22 / nSel}%` }} />
            ))}
            <col style={{ width: '34%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              <th className="border border-black px-1 py-1" colSpan={nSel + 1}>
                Penggolongan dan Kodefikasi Barang
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah (Rp)</th>
              <th className="border border-black px-1 py-1" rowSpan={2}>
                Nilai Akumulasi Penyusutan atau Amortisasi (Rp)
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Nilai Buku (Rp)</th>
            </tr>
            <tr className="text-center font-semibold">
              <th className="border border-black px-1 py-1" colSpan={nSel}>Kode Barang</th>
              <th className="border border-black px-1 py-1">Nama Barang</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className={b.seg <= SEG_MIN_REKAP_PENGHAPUSAN ? 'font-bold' : ''}>
                <SelKode kode={b.kode} sampai={b.seg} n={nSel} />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.nilai)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.akumulasi)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.nilaiBuku)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nSel + 4} className="border border-black px-1 py-3 text-center">
                {f.kosong}
              </td></tr>
            )}
          </tbody>
        </table>
        <p className="text-[8px] mt-1">{CATATAN_KAKI}</p>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  return (
    <>
      {tampil(2) && <LembarRinci />}
      {TANGGA_REKAP_PENGHAPUSAN.filter(t => tampil(t.akhiran)).map((t, i) => (
        <LembarRekap key={t.akhiran} akhiran={t.akhiran} seg={t.seg} menurut={t.menurut}
          pecahHalaman={tampil(2) || i > 0} />
      ))}
    </>
  )
}
