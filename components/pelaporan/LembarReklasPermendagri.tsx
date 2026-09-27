'use client'
// ============================================================================
// PENYAJI lembar REKLASIFIKASI format Permendagri 47/2021 — keluarga IV.F.
//
//   IV.F.2      LAPORAN PENAMBAHAN akibat reklasifikasi BMD (rinci per barang)
//   IV.F.3–F.6  REKAPITULASI-nya, empat kedalaman kodefikasi
//   IV.F.12     LAPORAN PENGURANGAN akibat reklasifikasi BMD (rinci per barang)
//   IV.F.13–F.16 REKAPITULASI-nya
//
// Murni tampilan — nol query, nol state. Angkanya dirakit `muatLaporanReklas`
// (lib/laporanReklas.ts), susunan & penomoran kolomnya datang dari
// `FORMAT_REKLAS` (lib/formatReklas.ts). Pemisahan ini mengikuti pola lembar
// Perolehan & Perpindahan: presenter di components/pelaporan/, pengambil data
// di lib + halaman.
//
// Satu pemanggilan menghasilkan LIMA lembar berurutan dengan page-break:
// lembar rinci + empat rekap.
//
// ⚠️ TAK ADA SATU PUN CABANG `if` PER FORMAT di berkas ini — pembeda cabang
// (penambahan vs pengurangan) seluruhnya data di `FORMAT_REKLAS`: judulnya,
// judul kolom lawan (`kolomLawan`), dan `arah` yang sudah dipakai pemuat untuk
// memutuskan kode mana yang jadi `kodeUtama`. Itu memang syaratnya: begitu
// penyaji harus tahu sedang merender sisi yang mana, cabang kedua akan
// menambah cabang lagi.
//
// ⚠️ LEMBAR RINCI BERBENTUK KEPUTUSAN USER (2026-09-27/28), pola & huruf PERSIS
// `LembarPerpindahanPermendagri`: 13 kolom datar, dikelompokkan per jenis aset
// yang ada di transaksinya, ditutup "Total <jenis>" & "TOTAL", nominal 2
// desimal. Sengaja menyimpang dari lembar asli Permendagri (dua blok segmen
// kode + blok "Nama Dokumen" yang selalu kosong). Lembar REKAP (.3–.6/.13–.16)
// TIDAK berubah — tetap bentuk Permendagri, kode bersegmen. Susunan kolom
// rinci di `KOLOM_RINCI_REKLAS` (lib/formatReklas.ts).
//
// ⚠️ SENGAJA BUKAN `LembarPerpindahanPermendagri` yang di-prop-kan meski lembar
// rincinya mirip — lembar REKAP-nya berbeda (5 kolom vs 6, `segMin` per-tangga
// vs konstanta tunggal), jadi menyatukannya berarti komponen ber-belasan prop
// boolean yang melanggar CODING-STANDARD §1.5. Yang DIPAKAI BERSAMA justru
// bagian yang berbahaya kalau menyimpang: mesin subtotal & peta nama tingkat
// (lib/formatPermendagri.ts).
// ============================================================================
import { Fragment } from 'react'
import { formatRupiah2 } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
// Dipakai bersama lembar BA Rekon, Perolehan, & Perpindahan — sengaja diimpor.
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode, susunRekap, type ItemLaporan } from '@/lib/formatPermendagri'
import {
  KOLOM_RINCI_REKLAS, KOLOM_DIJUMLAH_REKLAS, lembarRekapReklas, judulRekapReklas,
  type FormatReklas, type KolomRinciReklas,
} from '@/lib/formatReklas'
import type { BarisReklas } from '@/lib/laporanReklas'

/** Pembungkus berkunci untuk sekelompok baris `<tr>` (satu jenis aset). */
const FragmenJenis = Fragment

/** Kedalaman grup jenis aset di lembar RINCI baru — lihat `LembarPerpindahanPermendagri`. */
const SEG_JENIS_RINCI = 3

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/**
 * Kelas sel KEPALA tabel.
 *
 * ⚠️ `[overflow-wrap:anywhere]`, BUKAN `break-words` — sama alasan dgn label
 * lembar BA Rekon/Perolehan/Perpindahan: `break-word` tak memecah kata yang
 * sudah berdiri sendirian di barisnya.
 */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

// ── Potongan tampilan (lembar REKAP lama, tetap bentuk Permendagri) ─────────

/** Sel-sel segmen kode. `sampai` = berapa segmen yang diisi (sisanya kosong). */
function SelKode({ kode, sampai, n }: { kode: string; sampai: number; n: number }) {
  const seg = segmenKode(kode)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <td key={i} className="border border-black px-0.5 py-0.5 text-center">
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
 * aplikasi ini.
 *
 * ⚠️ Sebutan pejabat & nama SKPD dicetak DUA BARIS walaupun lembar aslinya
 * menyatukannya jadi satu isian. Sama dgn keluarga IV.B/IV.C/IV.D/Perpindahan.
 */
function KopLembar({ judul, berupa, komptabel, sebutan, skpd, periode, tahun, tambahan }: {
  judul: string; berupa: string; komptabel: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string; tambahan?: string
}) {
  return (
    <>
      <div className="flex items-start gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-11 h-auto flex-shrink-0" />
        <div className="flex-1 text-center leading-tight">
          <p className="font-bold text-[11px]">{judul} {berupa}</p>
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
        <p>{KABUPATEN}, {tglPanjang(tgl)}</p>
        <p>{sebutan}</p>
        <div className="h-14" />
        <p className="font-semibold">{nama || '…………………………………'}</p>
        <p>NIP. {nip || '……………………'}</p>
      </div>
    </div>
  )
}

/** Catatan kaki lembar aslinya — menjelaskan kenapa Akumulasi & Nilai Buku
 *  kosong untuk Tanah/KDP/ATL. Dicetak apa adanya di kedua bentuk lembar. */
const CATATAN_KAKI = '*) hanya diisi untuk BMD yang dilakukan Penyusutan atau Amortisasi.'

export type PropLembarReklas = {
  /** Registry cabangnya — `FORMAT_REKLAS.penambahan`/`.pengurangan`. */
  f: FormatReklas
  items: ItemLaporan<BarisReklas>[]
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
   * Akhiran lembar yang ditampilkan — `f.akhiranRinci` untuk rinci,
   * `f.akhiranRekap` untuk rekapnya. Kosong = semuanya.
   *
   * ⚠️ Angkanya BEDA per cabang (2–6 vs 12–16), jadi jangan menuliskan rentang
   * di sini maupun di pemanggil; pakai `akhiranLembarReklas(f)`.
   */
  lembar?: number[]
}

export default function LembarReklasPermendagri(p: PropLembarReklas) {
  const { f, items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (akhiran: number) => !p.lembar || p.lembar.includes(akhiran)

  const kolom = KOLOM_RINCI_REKLAS
  const nKolom = kolom.length
  /** Letak kolom uang pertama — label baris total menempati semua kolom di kirinya. */
  const iUang = kolom.findIndex(k => k.key === KOLOM_DIJUMLAH_REKLAS[0])
  const nUang = KOLOM_DIJUMLAH_REKLAS.length
  const nSisa = nKolom - iUang - nUang

  const isiKolom = (k: KolomRinciReklas, r: BarisReklas): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // Uraian = NOMENKLATUR BAKU kode SESUDAH sisi ini (`kodeUtama`), ikut
      // kodefikasi terkini — bukan yang diketik operator. `uraian_barang` di
      // `aset` cuma cadangan (salinan lama, masih kode SEBELUM reklas).
      case 'kode': return <>{r.kodeUtama}<br />{nama(r.kodeUtama) || a.uraian_barang || ''}</>
      // "Nama Barang" = spesifikasi yang diketik operator, DI SISI yang
      // dilaporkan (`namaSpek`, sudah diputuskan pemuatnya) — reklas boleh
      // sekalian mengganti nama, jadi lembar penambahan memuat nama SESUDAH &
      // pengurangan nama SEBELUM.
      case 'nama': return r.namaSpek || a.nama_barang || ''
      case 'jumlah': return <>{a.jumlah ?? 1}<br />{a.satuan || ''}</>
      case 'harga_satuan': return formatRupiah2(a.harga_satuan ?? r.nilai)
      case 'nilai_perolehan': return formatRupiah2(r.nilai)
      // ⚠️ Sel yang posisinya TAK KETEMU di `penyusutan_semester` dicetak
      // titik-titik, BUKAN 0 — nol berarti "memang belum tersusut", tak-ketemu
      // berarti "engine belum dijalankan".
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah2(r.nilaiBuku ?? 0)
      // Kode & uraian di sisi LAWAN — judul kolomnya sendiri ikut cabang
      // (`f.kolomLawan`: "...Awal" utk penambahan, "...Tujuan" utk pengurangan).
      case 'lawan': return <>{r.kodeLawan}<br />{nama(r.kodeLawan) || ''}</>
      case 'penyebab': return r.penyebab
      case 'dok_nomor': return r.header?.no_sk || ''
      case 'dok_tanggal': return tglID(r.header?.tanggal || r.tanggal)
      // Keterangan = isian kotak Keterangan di KARTU reklasifikasi (kartu
      // menang, pola yang sama dgn keluarga perpindahan 2026-09-27), lalu
      // cadangan baris ledger & spesifikasi barang.
      case 'keterangan': return r.header?.keterangan || r.keterangan || a.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomRinciReklas) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  // ── Lembar RINCI (IV.F.2 / IV.F.12) ───────────────────────────────────────
  //
  // ⚠️ BENTUK DITENTUKAN USER (2026-09-27/28), sengaja menyimpang dari lembar
  // asli Permendagri — lihat kepala lib/formatReklas.ts. Datar, dikelompokkan
  // per JENIS ASET (golongan `kodeUtama`) yang benar-benar ada di transaksinya,
  // tiap kelompok ditutup "Total <jenis>", seluruhnya ditutup "TOTAL".
  //
  // ⚠️ Angka baris "Total <jenis>" diambil dari MESIN SUBTOTAL BERSAMA
  // (`susunRekap` pada 3 segmen) — yang SAMA yang mengisi lembar rekap .6/.16
  // (menurut jenis) di berkas yang sama. Menjumlah sendiri di sini membuka
  // celah dua angka berbeda untuk jenis yang sama dalam satu berkas bertanda
  // tangan.
  function LembarRinci() {
    const totalJenis = susunRekap(items, SEG_JENIS_RINCI, SEG_JENIS_RINCI)
      .filter(g => g.seg === SEG_JENIS_RINCI)
    const perJenis = new Map<string, ItemLaporan<BarisReklas>[]>()
    for (const it of items) {
      const g = kodeLevel3(it.kode)
      perJenis.set(g, [...(perJenis.get(g) ?? []), it])
    }
    const namaJenis = (g: string) =>
      GOLONGAN_REKAP.find(x => x.kode === g)?.uraian || nama(g) || g
    const total = totalJenis.reduce(
      (t, g) => ({ nilai: t.nilai + g.nilai, akumulasi: t.akumulasi + g.akumulasi, nilaiBuku: t.nilaiBuku + g.nilaiBuku }),
      { nilai: 0, akumulasi: 0, nilaiBuku: 0 })
    // Kerapatan & warna disamakan dgn tabel Laporan Pengadaan & Perpindahan
    // (permintaan user 2026-09-27): padding lega, kelompok teal pucat, subtotal
    // abu muda.
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
        <KopLembar judul={f.judul} berupa={berupa} komptabel={labelKomptabel}
          sebutan={sebutan} skpd={skpd} periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[10px] leading-snug">
          <colgroup>
            {kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <thead>
            <tr className={`text-center font-semibold bg-gray-50 ${CETAK_WARNA}`}>
              {kolom.map(k => (
                <th key={k.key} className={`${SEL} [overflow-wrap:anywhere]`}>
                  {k.key === 'lawan' ? f.kolomLawan : k.judul}
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
                        // tanpa spasi bisa melebihi selnya. NIBAR 9px (kolom
                        // 12%, pola PERSIS keluarga perpindahan) supaya potongan
                        // 26 digitnya muat sebaris; kolom bertanggal tak
                        // dipecah (tak terbaca kalau dipecah).
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

  // ── Lembar REKAP (IV.F.3–F.6 / IV.F.13–F.16) — TIDAK berubah ──────────────
  //
  // ⚠️ LIMA kolom — TANPA "Jumlah Barang" yang ada di rekap IV.B/IV.C/IV.D.
  //    Diikuti apa adanya dari lembar aslinya; menambahkannya "biar seragam"
  //    membuat lembarnya tak cocok waktu pemeriksa mencocokkan kolom per kolom.
  // ⚠️ `segMin` DATANG DARI TANGGA, bukan konstanta bersama — IV.F.3/F.4 mulai
  //    tiga lembar terdalam 3 segmen, yang terdangkal 2. Lihat
  //    `TANGGA_REKAP_REKLAS`.
  // ⚠️ TANPA kolom "No" & TANPA baris JUMLAH — sama dgn keluarga perpindahan.
  function LembarRekap({ akhiran, seg, segMin, menurut, pecahHalaman }: {
    akhiran: number; seg: number; segMin: number; menurut: string; pecahHalaman: boolean
  }) {
    const baris = susunRekap(items, seg, segMin)
    const nSel = seg
    return (
      // ⚠️ Page-break hanya kalau ADA lembar sebelumnya. Kalau lembar rinci tak
      // dicentang, break di lembar pertama menghasilkan satu halaman KOSONG di
      // depan berkas — dan itu baru ketahuan sesudah dicetak.
      <section className={`lembar-rekap ${pecahHalaman ? 'break-before-page' : ''}`}>
        <p className="text-right text-[12px] mb-1">Format {f.awalan}.{akhiran}</p>
        <KopLembar judul={judulRekapReklas(f)} berupa={berupa} komptabel={labelKomptabel}
          sebutan={sebutan} skpd={skpd} periode={judulPeriode} tahun={tahun}
          tambahan={`MENURUT ${menurut}`} />
        <table className="w-full table-fixed border-collapse text-[9px] leading-tight">
          <colgroup>
            {Array.from({ length: nSel }, (_, i) => (
              <col key={i} style={{ width: `${22 / nSel}%` }} />
            ))}
            <col style={{ width: '30%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              <th className={WRAP} colSpan={nSel + 1}>
                Penggolongan dan Kodefikasi Barang
              </th>
              <th className={WRAP} rowSpan={2}>Nilai Perolehan (Rp)</th>
              <th className={WRAP} rowSpan={2}>
                Nilai Akumulasi Penyusutan atau Amortisasi (Rp)*
              </th>
              <th className={WRAP} rowSpan={2}>Nilai Buku (Rp)*</th>
            </tr>
            <tr className="text-center font-semibold">
              <th className={WRAP} colSpan={nSel}>Kode Barang</th>
              <th className={WRAP}>Nama Barang</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className={b.seg <= segMin ? 'font-bold' : ''}>
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
      {tampil(f.akhiranRinci) && <LembarRinci />}
      {/* ⚠️ Nomor lembar rekap datang dari `lembarRekapReklas(f)`, BUKAN dari
          tangga langsung: penambahan memakai IV.F.3–F.6 & pengurangan
          IV.F.13–F.16 di atas hierarki yang sama. */}
      {lembarRekapReklas(f).filter(t => tampil(t.akhiran)).map((t, i) => (
        <LembarRekap key={t.akhiran} akhiran={t.akhiran} seg={t.seg} segMin={t.segMin}
          menurut={t.menurut} pecahHalaman={tampil(f.akhiranRinci) || i > 0} />
      ))}
    </>
  )
}
