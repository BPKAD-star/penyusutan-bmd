'use client'
// ============================================================================
// PENYAJI lembar PENERIMAAN format Permendagri 47/2021 — cabang IV.B.1 & IV.C.
//
//   IV.B.1.2–1.6  Penerimaan PENGGUNAAN (pengalihan status antar SKPD)
//   IV.C.2–C.6    Penerimaan BMD INTERNAL (mutasi internal antar sub-unit)
//
// Murni tampilan — nol query, nol state. Angkanya dirakit `muatLembarPerpindahan`
// (lib/laporanPerpindahan.ts), susunan & penomoran kolomnya datang dari
// `FORMAT_PERPINDAHAN` (lib/formatPerpindahan.ts). Pemisahan ini mengikuti pola BA
// Rekon & lembar Perolehan: presenter di components/pelaporan/, pengambil data
// di lib + halaman.
//
// Satu pemanggilan menghasilkan LIMA lembar berurutan dengan page-break:
// lembar rinci + empat rekap.
//
// ⚠️ SATU PENYAJI UNTUK DUA CABANG — yang membedakan keduanya SELURUHNYA data
// di `FORMAT_PERPINDAHAN` (kolom mana yang ada, judulnya, penomorannya). Tak ada
// satu pun cabang `if` per format di berkas ini, dan itu memang syaratnya:
// begitu penyaji harus tahu sedang merender format yang mana, format ketiga
// akan menambah cabang lagi sampai berkas ini jadi tak terbaca.
//
// ⚠️ LEMBAR RINCI BERBENTUK KEPUTUSAN USER (2026-09-27): 16 kolom datar,
// dikelompokkan per jenis aset yang ada di transaksinya, ditutup "Total
// <jenis>" & "TOTAL", nominal 2 desimal — sengaja menyimpang dari lembar asli
// Permendagri. Lembar REKAP tetap bentuk Permendagri. Susunan kolomnya di
// `KOLOM_RINCI_PERPINDAHAN` (lib/formatPerpindahan.ts).
// ============================================================================
import { Fragment } from 'react'
import { formatRupiah2 } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { asalUsulTampil, GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
// Dipakai bersama lembar BA Rekon & Perolehan — sengaja diimpor, bukan disalin.
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import {
  TANGGA_REKAP, segmenKode, susunRekap,
  type ItemLaporan,
} from '@/lib/formatPermendagri'
import {
  SEG_MIN_REKAP_PERPINDAHAN, KOLOM_RINCI_PERPINDAHAN, KOLOM_DIJUMLAH_PERPINDAHAN,
  judulRekapPerpindahan,
  type FormatPerpindahan, type KolomRinci,
} from '@/lib/formatPerpindahan'
import type { BarisPerpindahan } from '@/lib/laporanPerpindahan'

/** Pembungkus berkunci untuk sekelompok baris `<tr>` (satu jenis aset). */
const FragmenJenis = Fragment

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/**
 * Kelas sel KEPALA tabel.
 *
 * ⚠️ `[overflow-wrap:anywhere]`, BUKAN `break-words`. Keduanya beda tepat di
 * kasus yang menggigit di sini: `break-word` tak memecah kata yang sudah
 * berdiri sendirian di barisnya, jadi "Keterangan" (46 px) di sel 40 px tetap
 * meluber. `anywhere` memecahnya. Sama alasannya dgn label lembar BA Rekon.
 */
/**
 * ⚠️ `px-0.5` (2 px), bukan `px-1`. Di lembar 25–28 kolom, 4 px padding kiri-
 * kanan itu ~13% dari lebar kolom tersempit — cukup untuk memaksa "Perolehan",
 * "Tanggal", & "menyerahkan" terpecah di tengah kata. Diukur di peramban
 * 2026-08-31: menyempitkannya membuat ketiganya muat utuh. Sel ISI tetap
 * `px-1`; di sana padding yang lega justru menolong keterbacaan angka.
 */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

// ── Potongan tampilan ───────────────────────────────────────────────────────

/** Sel-sel segmen kode. `sampai` = berapa segmen yang diisi (sisanya kosong). */
function SelKode({ kode, sampai, n, tebal }: {
  kode: string; sampai: number; n: number; tebal?: boolean
}) {
  const seg = segmenKode(kode)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <td key={i} className={`border border-black px-0.5 py-0.5 text-center ${tebal ? 'font-bold' : ''}`}>
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
 * Permendagri itu rujukan ke "petunjuk pengisian", penanda TEMPLATE KOSONG.
 * Keputusan user 2026-08-30, berlaku untuk seluruh lembar Permendagri di
 * aplikasi ini. Nomornya tetap hidup di `FORMAT_PERPINDAHAN` sebagai tautan
 * balik ke format aslinya & penjaga struktur kolom lewat test.
 *
 * ⚠️ Sebutan pejabat & nama SKPD SELALU dicetak DUA BARIS, walaupun IV.B.1.x
 * menyatukannya jadi satu isian di lembar aslinya ("PENGGUNA BARANG ATAU
 * PENGELOLA BARANG………(3)") sementara IV.C memisahkannya jadi (3) dan
 * `SKPD…………(4)`. Berdempetan dalam satu baris ("PENGGUNA BARANG BADAN KEUANGAN
 * DAN ASET DAERAH") terbaca sebagai satu nama jabatan yang tak pernah ada.
 * Karena keduanya dicetak sama, perbedaan penomoran kop itu tak berakibat apa
 * pun di kertas — ia cuma menggeser nomor kolom, yang memang tak dicetak.
 *
 * ⚠️ `judulLanjut` OPSIONAL: IV.B.1.x punya baris judul kedua ("DALAM BENTUK
 * PENGGUNAAN PENGALIHAN…"), IV.C tidak.
 */
function KopLembar({ judul, judulLanjut, berupa, komptabel, sebutan, skpd, periode, tahun, tambahan }: {
  judul: string; judulLanjut?: string; berupa: string; komptabel: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string; tambahan?: string
}) {
  return (
    <>
      {/* Logo kiri + spacer kanan selebar sama (permintaan user 2026-09-10) —
          spacer WAJIB ada supaya blok judul tengah tetap benar-benar di
          tengah kertas, bukan cuma di tengah sisa ruang sebelah logo. Pola
          sama dgn KOP KIBAR & keluarga IV.A (Perolehan). */}
      <div className="flex items-start gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-11 h-auto flex-shrink-0" />
        <div className="flex-1 text-center leading-tight">
          <p className="font-bold text-[11px]">{judul} {berupa}</p>
          {judulLanjut && <p className="font-bold text-[11px]">{judulLanjut}</p>}
          {tambahan && <p className="font-bold text-[11px]">{tambahan}</p>}
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
        {/* Tempat DITULIS, bukan titik-titik — lembarnya memang selalu terbit
            di Kediri (keputusan yang sama dengan lembar Perolehan). */}
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

export type PropLembarPerpindahan = {
  /** Registry cabangnya — `FORMAT_PERPINDAHAN.penggunaan` atau `.internal`. */
  f: FormatPerpindahan
  items: ItemLaporan<BarisPerpindahan>[]
  /** Awalan kode → nama tingkat (lihat `petaNamaTingkat`). */
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  /** Isian "BERUPA…", diturunkan dari kelompok neraca yang benar-benar ada datanya. */
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  /** Sebutan pejabat penanda tangan, diturunkan dari LEVEL SKPD. */
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

export default function LembarPerpindahanPermendagri(p: PropLembarPerpindahan) {
  const { f, items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (akhiran: number) => !p.lembar || p.lembar.includes(akhiran)

  const kolom = KOLOM_RINCI_PERPINDAHAN
  const nKolom = kolom.length
  /** Letak kolom uang pertama — label baris total menempati semua kolom di kirinya. */
  const iUang = kolom.findIndex(k => k.key === KOLOM_DIJUMLAH_PERPINDAHAN[0])
  const nUang = KOLOM_DIJUMLAH_PERPINDAHAN.length
  const nSisa = nKolom - iUang - nUang

  const isiKolom = (k: KolomRinci, r: BarisPerpindahan): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // Uraian = NOMENKLATUR BAKU dari kodefikasi (ikut kodefikasi terkini),
      // bukan yang diketik operator.
      case 'kode': return <>{a.kode || ''}<br />{nama(a.kode) || a.uraian_barang || ''}</>
      // "Nama Barang" = spesifikasi nama yang diketik operator.
      case 'nama': return a.nama_barang || ''
      case 'merek': return a.merek_tipe || ''
      case 'jumlah': return <>{a.jumlah ?? 1}<br />{a.satuan || ''}</>
      case 'harga_satuan': return formatRupiah2(a.harga_satuan ?? r.nilai)
      case 'jumlah_total': return formatRupiah2(r.nilai)
      // ⚠️ Posisi yang TAK KETEMU di `penyusutan_semester` dicetak titik-titik,
      // BUKAN 0 — nol berarti "memang belum tersusut", tak-ketemu berarti
      // "engine belum dijalankan".
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.nilaiBuku ?? 0)
      // ⚠️ Tanggal Perolehan = kapan barang diperoleh pemkab, BUKAN tanggal
      // perpindahannya. Yang terakhir itu kolom Tanggal BAST.
      case 'tgl_perolehan': return tglID(a.tgl_perolehan)
      // Isian operator menang; kosong jatuh ke label cara perolehan. Satu
      // sumber dgn Daftar Barang & Export — `asalUsulTampil` (lib/bmd.ts).
      case 'cara_perolehan': return asalUsulTampil(a.asal_usul, a.cara_perolehan).teks
      case 'alamat': return a.alamat_detail || ''
      case 'pihak': return (f.kolomPihak.sisi === 'asal' ? r.asal_nama : r.tujuan_nama) || ''
      // Nomor & tanggal dokumen perpindahannya (kartu). `header.tanggal` =
      // tanggal dokumen sumber (bisa lebih tua dari tanggal Terima).
      case 'dok_nomor': return r.header?.no_sk || r.payload?.no_sk || ''
      case 'tgl_bast': return tglID(r.header?.tanggal || r.payload?.tgl_dokumen_sumber || r.tanggal)
      // Keterangan = isian kotak Keterangan di KARTU perpindahannya (keputusan
      // user 2026-09-27), BUKAN keterangan spesifikasi barang.
      case 'keterangan': return r.header?.keterangan || r.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomRinci) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  // ── Lembar RINCI (IV.B.1.2 / IV.C.2 / IV.D.2) ─────────────────────────────
  //
  // ⚠️ BENTUK DITENTUKAN USER (2026-09-27), sengaja menyimpang dari lembar asli
  // Permendagri — lihat kepala lib/formatPerpindahan.ts. Datar, dikelompokkan
  // per JENIS ASET yang benar-benar ada di transaksinya, tiap kelompok ditutup
  // "Total <jenis>", seluruhnya ditutup "TOTAL".
  //
  // ⚠️ Angka baris "Total <jenis>" diambil dari MESIN SUBTOTAL BERSAMA
  // (`susunRekap` pada 3 segmen) — yang SAMA yang mengisi lembar rekap .6
  // (menurut jenis) di berkas yang sama. Menjumlah sendiri di sini membuka
  // celah dua angka berbeda untuk jenis yang sama dalam satu berkas bertanda
  // tangan.
  function LembarRinci() {
    const totalJenis = susunRekap(items, 3, SEG_MIN_REKAP_PERPINDAHAN)
      .filter(g => g.seg === 3)
    const perJenis = new Map<string, ItemLaporan<BarisPerpindahan>[]>()
    for (const it of items) {
      const g = kodeLevel3(it.kode)
      perJenis.set(g, [...(perJenis.get(g) ?? []), it])
    }
    const namaJenis = (g: string) =>
      GOLONGAN_REKAP.find(x => x.kode === g)?.uraian || nama(g) || g
    const total = totalJenis.reduce(
      (t, g) => ({ nilai: t.nilai + g.nilai, akumulasi: t.akumulasi + g.akumulasi, nilaiBuku: t.nilaiBuku + g.nilaiBuku }),
      { nilai: 0, akumulasi: 0, nilaiBuku: 0 })
    // Kerapatan & warna disamakan dgn tabel Laporan Pengadaan (permintaan user
    // 2026-09-27): padding lega, kelompok teal pucat, subtotal abu muda.
    const SEL = 'border border-black px-1.5 py-1'
    // Warna latar ikut tercetak — tanpa `print-color-adjust` peramban
    // membuangnya di PDF & baris kelompok tak lagi terbedakan dari baris barang.
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
                <th key={k.key} className={`${SEL} [overflow-wrap:anywhere]`}>
                  {k.key === 'pihak' ? f.kolomPihak.judul : k.judul}
                </th>
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
                        // ⚠️ `anywhere` di sel isi — nilai rupiah panjang & nama
                        // tanpa spasi bisa melebihi selnya. NIBAR 9px (kolom 12%,
                        // dinaikkan dari 7,5px/10% — permintaan user 2026-09-27,
                        // lihat komentar `KOLOM_RINCI_PERPINDAHAN`) supaya potongan
                        // 26 digitnya tetap muat sebaris tapi lebih terbaca; kolom
                        // bertanggal tak dipecah (tak terbaca kalau dipecah).
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
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  // ── Lembar REKAP (IV.B.1.3–1.6 / IV.C.3–C.6) ──────────────────────────────
  //
  // ⚠️ IDENTIK di kedua cabang — kolomnya sama, kedalamannya sama, judulnya cuma
  //    beda di bagian yang sudah jadi data. Karena itu tak ada percabangan.
  // ⚠️ ENAM kolom (IV.A cuma empat): Akumulasi Penyusutan & Nilai Buku ikut.
  // ⚠️ Mulai di 3 SEGMEN, bukan 2 — lihat `SEG_MIN_REKAP_PERPINDAHAN`.
  // ⚠️ TANPA kolom "No" & TANPA baris JUMLAH — beda dari IV.A.<n>.6 yang punya
  //    keduanya. Diikuti apa adanya dari lembar aslinya.
  function LembarRekap({ akhiran, seg, menurut, pecahHalaman }: {
    akhiran: number; seg: number; menurut: string; pecahHalaman: boolean
  }) {
    const baris = susunRekap(items, seg, SEG_MIN_REKAP_PERPINDAHAN)
    const nSel = seg
    return (
      // ⚠️ Page-break hanya kalau ADA lembar sebelumnya. Kalau lembar rinci tak
      // dicentang, break di lembar pertama menghasilkan satu halaman KOSONG di
      // depan berkas — dan itu baru ketahuan sesudah dicetak.
      <section className={`lembar-rekap ${pecahHalaman ? 'break-before-page' : ''}`}>
        <p className="text-right text-[12px] mb-1">Format {f.awalan}.{akhiran}</p>
        <KopLembar judul={judulRekapPerpindahan(f)} judulLanjut={f.judulLanjut} berupa={berupa}
          komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} tambahan={`MENURUT ${menurut}`} />
        <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
          <colgroup>
            {Array.from({ length: nSel }, (_, i) => (
              <col key={i} style={{ width: `${22 / nSel}%` }} />
            ))}
            <col style={{ width: '30%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              <th className="border border-black px-1 py-1" colSpan={nSel + 1}>
                Penggolongan dan Kodefikasi Barang
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah Barang</th>
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
              <tr key={i} className={b.seg <= SEG_MIN_REKAP_PERPINDAHAN ? 'font-bold' : ''}>
                <SelKode kode={b.kode} sampai={b.seg} n={nSel} />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{b.jumlah}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.nilai)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.akumulasi)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah2(b.nilaiBuku)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nSel + 5} className="border border-black px-1 py-3 text-center">
                {f.kosong}
              </td></tr>
            )}
          </tbody>
        </table>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  return (
    <>
      {tampil(2) && <LembarRinci />}
      {TANGGA_REKAP.filter(t => tampil(t.akhiran)).map((t, i) => (
        <LembarRekap key={t.akhiran} akhiran={t.akhiran} seg={t.seg} menurut={t.menurut}
          pecahHalaman={tampil(2) || i > 0} />
      ))}
    </>
  )
}
