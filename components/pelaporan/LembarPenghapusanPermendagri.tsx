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
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { asalUsulTampil } from '@/lib/bmd'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode, susunRinci, susunRekap, type ItemLaporan } from '@/lib/formatPermendagri'
import {
  SEG_MIN_REKAP_PENGHAPUSAN, SEL_KODE_PENGHAPUSAN, TANGGA_REKAP_PENGHAPUSAN,
  kolomLembarPenghapusan, lebarKodePenghapusan, judulRekapPenghapusan,
  type FormatPenghapusan, type KolomLembarPenghapusan,
} from '@/lib/formatPenghapusan'
import type { BarisPenghapusan } from '@/lib/laporanPenghapusan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/**
 * Kelas sel KEPALA.
 *
 * ⚠️ `[overflow-wrap:anywhere]`, BUKAN `break-words` — keduanya beda tepat di
 * kasus yang menggigit: `break-word` tak memecah kata yang sudah berdiri
 * sendirian di barisnya, jadi "Pemindahtanganan" di sel sempit MELUBER menimpa
 * sel tetangga & `table-fixed` menyembunyikannya sampai kertasnya keluar.
 * `px-0.5` (2 px) bukan `px-1`: di lembar 21–24 sel, 4 px padding kiri-kanan
 * itu sepertiga lebar sel kode.
 */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'

/**
 * Kelas sel ISI lembar RINCI.
 *
 * ⚠️ `px-0.5` + `py-px` + `leading-[1.15]` — permintaan user 2026-09-07 ("rapi
 * & fit to window, jangan boros ke sampingnya"). Yang mahal di lembar sepadat
 * ini bukan lebar melainkan TINGGI: satu baris barang bisa membungkus 3–4 baris
 * teks, jadi tiap 1 px tinggi baris terkali empat. Pelajaran yang sama dgn
 * lembar IV.F.
 */
const SEL_ISI = 'border border-black px-0.5 py-px'

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
  const nKolom = SEL_KODE_PENGHAPUSAN + kolomLembarPenghapusan(f).length

  const isiKolom = (k: KolomLembarPenghapusan, r: BarisPenghapusan): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // ⚠️ "Nama Barang" = NOMENKLATUR BAKU dari kodefikasi, bukan yang diketik
      // operator; "Spesifikasi Nama Barang" yang diketik. Jangan ditukar.
      case 'nama': return nama(a.kode) || a.uraian_barang || ''
      case 'spek_nama': return a.nama_barang || ''
      case 'spek_lain': return a.spesifikasi_lainnya || ''
      case 'jumlah': return a.jumlah ?? 1
      case 'satuan': return a.satuan || ''
      case 'harga_satuan': return formatRupiah(a.harga_satuan ?? r.nilai)
      case 'jumlah_total': return formatRupiah(r.nilai)
      // ⚠️ Posisi yang TAK KETEMU dicetak titik-titik, BUKAN 0 — nol berarti
      // "memang belum tersusut", tak-ketemu berarti "engine belum dijalankan".
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah(r.nilaiBuku ?? 0)
      // ⚠️ Tanggal Perolehan = kapan barang DIPEROLEH pemkab, BUKAN tanggal
      // penghapusannya. Yang terakhir itu blok SK Penghapusan.
      case 'tgl_perolehan': return tglID(a.tgl_perolehan)
      // Isian operator menang; kosong jatuh ke label cara perolehan. Satu
      // sumber dgn Daftar Barang & Export — `asalUsulTampil` (lib/bmd.ts).
      case 'cara_perolehan': return asalUsulTampil(a.asal_usul, a.cara_perolehan).teks
      case 'lokasi': return a.alamat_detail || ''
      // ⚠️ HANYA di IV.K.1.2 — satu-satunya kolom yang membedakan hibah,
      // penjualan, tukar-menukar, & penyertaan modal. Aman: kolom yang tak
      // terdaftar di registry cabangnya tak pernah dirender.
      case 'cara_pemindahtanganan': return r.caraPemindahtanganan
      // ⚠️ HANYA di IV.K.2.2 — SKPD seberang baris pengalihannya.
      case 'penerima': return r.penerima || ''
      // ⚠️ BEDA dari IV.B.1.2 yang kolom SK-nya SELALU kosong: di sini SK
      // Penghapusannya justru kartu jurnal ini sendiri, jadi ia memang berisi.
      case 'sk_tanggal': return tglID(r.header?.tanggal || r.payload?.tgl_dokumen_sumber || r.tanggal)
      case 'sk_nomor': return r.header?.no_sk || r.payload?.no_sk || ''
      case 'keterangan': return r.keterangan || a.keterangan || r.header?.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomLembarPenghapusan) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  /**
   * Kepala tabel.
   *
   * ⚠️ `WRAP` di tiap `<th>` bukan hiasan: judul kolom lembar ini memuat kata
   * tunggal yang lebih lebar dari selnya sendiri ("Pemindahtanganan",
   * "Spesifikasi", "Keterangan"). Tanpa `overflow-wrap: anywhere` kata itu
   * MELUBER menimpa sel tetangga (pelajaran ronde IV.B/IV.C, 2026-08-31).
   */
  function Thead() {
    const grup: { judul: string | undefined; kolom: KolomLembarPenghapusan[] }[] = []
    for (const k of f.kolom) {
      const t = grup[grup.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else grup.push({ judul: k.grup, kolom: [k] })
    }
    return (
      <thead>
        <tr className="text-center font-semibold">
          <th className={WRAP} rowSpan={2}>{f.kolomKiri.judul}</th>
          <th className={WRAP} colSpan={SEL_KODE_PENGHAPUSAN + 1}>
            Penggolongan dan Kodefikasi Barang
          </th>
          {grup.map((g, i) => g.judul
            ? <th key={i} className={WRAP} colSpan={g.kolom.length}>{g.judul}</th>
            : <th key={i} className={WRAP} rowSpan={2}>{g.kolom[0].judul}</th>)}
        </tr>
        <tr className="text-center font-semibold">
          <th className={WRAP} colSpan={SEL_KODE_PENGHAPUSAN}>Kode Barang</th>
          <th className={WRAP}>{f.kolomNama.judul}</th>
          {grup.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
        </tr>
      </thead>
    )
  }

  // ── Lembar RINCI IV.K.<n>.2 ───────────────────────────────────────────────
  function LembarRinci() {
    const baris = susunRinci(items, f.subtotal)
    return (
      <section className="lembar-rinci">
        <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
        <KopLembar judul={f.judul} judulLanjut={f.judulLanjut} berupa={berupa}
          komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[7.5px] leading-[1.15]">
          <colgroup>
            <col style={{ width: `${f.kolomKiri.lebar}%` }} />
            {Array.from({ length: SEL_KODE_PENGHAPUSAN }, (_, i) => (
              <col key={i} style={{ width: `${lebarKodePenghapusan(f) / SEL_KODE_PENGHAPUSAN}%` }} />
            ))}
            <col style={{ width: `${f.kolomNama.lebar}%` }} />
            {f.kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <Thead />
          <tbody>
            {baris.map((b, i) => b.tipe === 'grup' ? (
              // Baris kelompok: NIBAR kosong (kelompok tak ber-NIBAR), kode
              // sedalam tingkatnya, namanya, lalu HANYA kolom uang yang berisi —
              // begitu bentuk lembar aslinya.
              <tr key={`g${i}`} className="font-bold italic">
                <td className={SEL_ISI} />
                <SelKode kode={b.kode} sampai={b.seg} n={SEL_KODE_PENGHAPUSAN} tebal />
                <td className={`${SEL_ISI} break-words`}>{nama(b.kode) || b.kode}</td>
                {f.kolom.map(k => (
                  // ⚠️ `anywhere` di sini juga — baris SUBTOTAL justru memuat
                  // angka TERBESAR di lembar, jadi kalau yang dibungkus cuma
                  // baris barangnya, yang meluber ke sel sebelah malah angka
                  // yang paling diperhatikan pemeriksa.
                  <td key={k.key} className={`${SEL_ISI} ${rata(k)} [overflow-wrap:anywhere]`}>
                    {k.key === 'jumlah_total' ? formatRupiah(b.nilai)
                      : k.key === 'akumulasi' ? formatRupiah(b.akumulasi)
                        : k.key === 'nilai_buku' ? formatRupiah(b.nilaiBuku)
                          : ''}
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={`i${b.data.id}`} className="align-top">
                <td className={`${SEL_ISI} break-all tracking-tighter text-[6px]`}>
                  {isiKolom(f.kolomKiri, b.data)}
                </td>
                <SelKode kode={b.kode} sampai={SEL_KODE_PENGHAPUSAN} n={SEL_KODE_PENGHAPUSAN} />
                <td className={`${SEL_ISI} break-words`}>{isiKolom(f.kolomNama, b.data)}</td>
                {f.kolom.map(k => (
                  <td key={k.key}
                    // Kolom bertanggal dikecualikan dari pembungkusan: memecah
                    // "12/08/2026" di tengah justru bikin tak terbaca, dan
                    // lebarnya memang sudah dianggarkan muat.
                    className={`${SEL_ISI} ${rata(k)} ${
                      k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                    {isiKolom(k, b.data)}
                  </td>
                ))}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={nKolom} className="border border-black px-0.5 py-3 text-center">
                Tidak ada penghapusan pada periode ini.
              </td></tr>
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
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.akumulasi)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilaiBuku)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nSel + 4} className="border border-black px-1 py-3 text-center">
                Tidak ada penghapusan pada periode ini.
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
