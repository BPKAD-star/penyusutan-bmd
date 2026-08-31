'use client'
// ============================================================================
// PENYAJI lembar PENGGUNAAN format Permendagri 47/2021 (cabang IV.B.1).
//
// Murni tampilan — nol query, nol state. Angkanya dirakit `muatLembarPenggunaan`
// (lib/laporanPenggunaan.ts), susunan & penomoran kolomnya datang dari
// `FORMAT_PENGGUNAAN` (lib/formatPenggunaan.ts). Pemisahan ini mengikuti pola BA
// Rekon & lembar Perolehan: presenter di components/pelaporan/, pengambil data
// di lib + halaman.
//
// Satu pemanggilan menghasilkan LIMA lembar berurutan dengan page-break:
// IV.B.1.2 rinci + IV.B.1.3–6 rekap.
//
// ⚠️ SENGAJA BUKAN `LembarPerolehanPermendagri` yang di-prop-kan. Empat hal
// berbeda secara struktural — NIBAR berdiri di luar blok kode, ada kolom
// Akumulasi & Nilai Buku, rekapnya 6 kolom, dan rekapnya mulai di 3 segmen —
// jadi menyatukannya berarti komponen ber-belasan prop boolean yang melanggar
// CODING-STANDARD §1.5. Yang DIPAKAI BERSAMA justru bagian yang berbahaya kalau
// menyimpang: mesin subtotal & peta nama tingkat (lib/formatPermendagri.ts).
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { asalUsulTampil } from '@/lib/bmd'
// Dipakai bersama lembar BA Rekon & Perolehan — sengaja diimpor, bukan disalin.
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import {
  TANGGA_REKAP, segmenKode, susunRinci, susunRekap,
  type ItemLaporan,
} from '@/lib/formatPermendagri'
import {
  FORMAT_PENGGUNAAN, SEG_MIN_REKAP_IVB, SEL_KODE_IVB, lebarKodeIvb, judulRekapIvb,
  type FormatPenggunaan, type KolomIvb,
} from '@/lib/formatPenggunaan'
import type { BarisPenggunaan } from '@/lib/laporanPenggunaan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

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
 * aplikasi ini. Nomornya tetap hidup di `FORMAT_PENGGUNAAN` sebagai tautan
 * balik ke format aslinya & penjaga struktur kolom lewat test.
 *
 * ⚠️ Isian (3) lembar aslinya SATU baris — "PENGGUNA BARANG ATAU PENGELOLA
 * BARANG………(3)" — sedangkan cabang IV.A memisahkannya jadi dua isian
 * (sebutan + SKPD). Di sini tetap dicetak DUA BARIS mengikuti bentuk yang sudah
 * disetujui untuk IV.A: sebutan yang benar dipilih otomatis dari level SKPD,
 * lalu nama SKPD-nya huruf besar. Mencetak keduanya berdempetan dalam satu
 * baris ("PENGGUNA BARANG BADAN KEUANGAN DAN ASET DAERAH") terbaca sebagai satu
 * nama jabatan yang tak pernah ada.
 */
function KopLembar({ judul, judulLanjut, berupa, komptabel, sebutan, skpd, periode, tahun, tambahan }: {
  judul: string; judulLanjut: string; berupa: string; komptabel: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string; tambahan?: string
}) {
  return (
    <>
      <div className="text-center leading-tight mb-2">
        <p className="font-bold text-[11px]">{judul} {berupa}</p>
        <p className="font-bold text-[11px]">{judulLanjut}</p>
        {tambahan && <p className="font-bold text-[11px]">{tambahan}</p>}
        <p className="font-bold text-[11px]">{komptabel}</p>
        <p className="font-bold text-[11px]">{sebutan.toUpperCase()}</p>
        <p className="font-bold text-[11px]">{(skpd?.nama || '').toUpperCase()}</p>
        <p className="font-bold text-[11px]">{periode}</p>
        <p className="font-bold text-[11px]">TAHUN {tahun}</p>
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

export type PropLembarPenggunaan = {
  f?: FormatPenggunaan
  items: ItemLaporan<BarisPenggunaan>[]
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

export default function LembarPenggunaanPermendagri(p: PropLembarPenggunaan) {
  const f = p.f || FORMAT_PENGGUNAAN
  const { items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (akhiran: number) => !p.lembar || p.lembar.includes(akhiran)

  const semuaKolom = [f.kolomKiri, f.kolomNama, ...f.kolom]
  const nKolom = SEL_KODE_IVB + semuaKolom.length

  const isiKolom = (k: KolomIvb, r: BarisPenggunaan): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // ⚠️ Kolom (10) "Nama Barang" = NOMENKLATUR BAKU dari kodefikasi, bukan
      // yang diketik operator; (11) "Spesifikasi Nama Barang" yang diketik.
      // Dua hal berbeda — pola yang sama dipakai Daftar Barang, Penyusutan, &
      // lembar RKBMD. Jangan ditukar.
      case 'nama': return nama(a.kode) || a.uraian_barang || ''
      case 'spek_nama': return a.nama_barang || ''
      case 'spek_lain': return a.spesifikasi_lainnya || ''
      case 'jumlah': return a.jumlah ?? 1
      case 'satuan': return a.satuan || ''
      case 'harga_satuan': return formatRupiah(a.harga_satuan ?? r.nilai)
      case 'jumlah_total': return formatRupiah(r.nilai)
      // ⚠️ Sel yang posisinya TAK KETEMU di `penyusutan_semester` dicetak
      // titik-titik, BUKAN 0 — nol berarti "memang belum tersusut", tak-ketemu
      // berarti "engine belum dijalankan". Di lembar bertanda tangan kedua
      // keadaan itu tak boleh terlihat sama.
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah(r.nilaiBuku ?? 0)
      // ⚠️ Tanggal Perolehan = kapan barang DIBUAT/diperoleh pemkab pertama
      // kali, BUKAN tanggal pengalihannya. Yang terakhir itu kolom (25).
      case 'tgl_perolehan': return tglID(a.tgl_perolehan)
      // Isian operator menang; kosong jatuh ke label cara perolehan. Satu
      // sumber dgn Daftar Barang & Export — lihat `asalUsulTampil` (lib/bmd.ts).
      case 'cara_perolehan': return asalUsulTampil(a.asal_usul, a.cara_perolehan).teks
      case 'lokasi': return a.alamat_detail || ''
      case 'asal_pihak': return r.asal_nama || ''
      // (23)(24): identitas barang di SKPD yang menyerahkan. `pengalihan_status`
      // tak mengubah kodefikasi maupun nama barang, jadi sama persis dengan
      // (9)(10) — itu fakta, bukan salinan asal-asalan. Lihat catatannya di
      // lib/formatPenggunaan.ts.
      case 'asal_kode': return a.kode || ''
      case 'asal_nama': return nama(a.kode) || a.uraian_barang || ''
      // BAST = dokumen pengalihannya. `header.tanggal` tanggal dokumen sumber
      // (bisa lebih tua dari tanggal Terima); `no_sk` nomornya.
      case 'ba_tanggal': return tglID(r.header?.tanggal || r.payload?.tgl_dokumen_sumber || r.tanggal)
      case 'ba_nomor': return r.header?.no_sk || r.payload?.no_sk || ''
      // ⚠️ (27)(28) SELALU KOSONG — aplikasi ini tak menyimpan SK Penghapusan
      // sisi SKPD yang menyerahkan di mana pun. Diisi `no_sk` kartu pengalihan
      // (yang artinya lain) berarti menaruh nomor dokumen yang salah di lembar
      // bertanda tangan. Pola yang sama dgn `dok_nama`/`penyebab` di IV.A.
      case 'sk_tanggal': return ''
      case 'sk_nomor': return ''
      case 'keterangan': return a.keterangan || r.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomIvb) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  /**
   * Kepala tabel. Tiga hal yang membedakannya dari cabang IV.A:
   * NIBAR berdiri sendiri di paling kiri (`rowSpan` 2), blok "Penggolongan dan
   * Kodefikasi Barang" membungkus sel kode + Nama Barang, dan kolom bergrup
   * (Asal Barang / BAST / SK Penghapusan) turun ke baris kedua.
   */
  function Thead() {
    const grup: { judul: string | undefined; kolom: KolomIvb[] }[] = []
    for (const k of f.kolom) {
      const t = grup[grup.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else grup.push({ judul: k.grup, kolom: [k] })
    }
    return (
      <thead>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" rowSpan={2}>{f.kolomKiri.judul}</th>
          <th className="border border-black px-1 py-1" colSpan={SEL_KODE_IVB + 1}>
            Penggolongan dan Kodefikasi Barang
          </th>
          {grup.map((g, i) => g.judul
            ? <th key={i} className="border border-black px-1 py-1" colSpan={g.kolom.length}>{g.judul}</th>
            : <th key={i} className="border border-black px-1 py-1" rowSpan={2}>{g.kolom[0].judul}</th>)}
        </tr>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" colSpan={SEL_KODE_IVB}>Kode Barang</th>
          <th className="border border-black px-1 py-1">{f.kolomNama.judul}</th>
          {grup.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => <th key={k.key} className="border border-black px-1 py-1">{k.judul}</th>))}
        </tr>
      </thead>
    )
  }

  // ── Lembar RINCI IV.B.1.2 ─────────────────────────────────────────────────
  function LembarRinci() {
    const baris = susunRinci(items, f.subtotal)
    return (
      <section className="lembar-rinci">
        <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
        <KopLembar judul={f.judul} judulLanjut={f.judulLanjut} berupa={berupa}
          komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[7.5px] leading-tight">
          <colgroup>
            <col style={{ width: `${f.kolomKiri.lebar}%` }} />
            {Array.from({ length: SEL_KODE_IVB }, (_, i) => (
              <col key={i} style={{ width: `${lebarKodeIvb(f) / SEL_KODE_IVB}%` }} />
            ))}
            <col style={{ width: `${f.kolomNama.lebar}%` }} />
            {f.kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <Thead />
          <tbody>
            {baris.map((b, i) => b.tipe === 'grup' ? (
              // Baris kelompok: kolom NIBAR kosong (kelompok tak ber-NIBAR),
              // kode sedalam tingkatnya, namanya, lalu HANYA ketiga kolom uang
              // yang berisi — begitu bentuk lembar aslinya.
              <tr key={`g${i}`} className="font-bold italic">
                <td className="border border-black px-1 py-0.5" />
                <SelKode kode={b.kode} sampai={b.seg} n={SEL_KODE_IVB} tebal />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                {f.kolom.map(k => (
                  <td key={k.key} className={`border border-black px-1 py-0.5 ${rata(k)}`}>
                    {k.key === 'jumlah_total' ? formatRupiah(b.nilai)
                      : k.key === 'akumulasi' ? formatRupiah(b.akumulasi)
                        : k.key === 'nilai_buku' ? formatRupiah(b.nilaiBuku)
                          : ''}
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={`i${b.data.id}`} className="align-top">
                <td className="border border-black px-1 py-0.5 break-all tracking-tighter text-[6px]">
                  {isiKolom(f.kolomKiri, b.data)}
                </td>
                <SelKode kode={b.kode} sampai={SEL_KODE_IVB} n={SEL_KODE_IVB} />
                <td className="border border-black px-1 py-0.5 break-words">
                  {isiKolom(f.kolomNama, b.data)}
                </td>
                {f.kolom.map(k => (
                  <td key={k.key}
                    className={`border border-black px-1 py-0.5 ${rata(k)} ${
                      k.rata === 'tengah' ? 'whitespace-nowrap' : 'break-words'}`}>
                    {isiKolom(k, b.data)}
                  </td>
                ))}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={nKolom} className="border border-black px-1 py-3 text-center">
                Tidak ada penerimaan penggunaan pada periode ini.
              </td></tr>
            )}
          </tbody>
        </table>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  // ── Lembar REKAP IV.B.1.3–1.6 ─────────────────────────────────────────────
  //
  // ⚠️ ENAM kolom (IV.A cuma empat): Akumulasi Penyusutan & Nilai Buku ikut.
  // ⚠️ Mulai di 3 SEGMEN, bukan 2 — lihat `SEG_MIN_REKAP_IVB`.
  // ⚠️ TANPA kolom "No" & TANPA baris JUMLAH — beda dari IV.A.<n>.6 yang punya
  //    keduanya. Diikuti apa adanya dari lembar aslinya.
  function LembarRekap({ akhiran, seg, menurut, pecahHalaman }: {
    akhiran: number; seg: number; menurut: string; pecahHalaman: boolean
  }) {
    const baris = susunRekap(items, seg, SEG_MIN_REKAP_IVB)
    const nSel = seg
    return (
      // ⚠️ Page-break hanya kalau ADA lembar sebelumnya. Kalau lembar rinci tak
      // dicentang, break di lembar pertama menghasilkan satu halaman KOSONG di
      // depan berkas — dan itu baru ketahuan sesudah dicetak.
      <section className={`lembar-rekap ${pecahHalaman ? 'break-before-page' : ''}`}>
        <p className="text-right text-[12px] mb-1">Format {f.awalan}.{akhiran}</p>
        <KopLembar judul={judulRekapIvb(f)} judulLanjut={f.judulLanjut} berupa={berupa}
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
              <tr key={i} className={b.seg <= SEG_MIN_REKAP_IVB ? 'font-bold' : ''}>
                <SelKode kode={b.kode} sampai={b.seg} n={nSel} />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{b.jumlah}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.akumulasi)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilaiBuku)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nSel + 5} className="border border-black px-1 py-3 text-center">
                Tidak ada penerimaan penggunaan pada periode ini.
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
