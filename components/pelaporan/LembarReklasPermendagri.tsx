'use client'
// ============================================================================
// PENYAJI lembar REKLASIFIKASI format Permendagri 47/2021 — keluarga IV.F.
//
//   IV.F.2      Laporan PENAMBAHAN akibat reklasifikasi BMD (rinci per barang)
//   IV.F.3–F.6  Rekapitulasinya, empat kedalaman kodefikasi
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
// judul blok lawan, dan `arah` yang sudah dipakai pemuat untuk memutuskan kode
// mana yang jadi `kodeUtama`. Itu memang syaratnya: begitu penyaji harus tahu
// sedang merender sisi yang mana, cabang kedua akan menambah cabang lagi.
//
// ⚠️ SENGAJA BUKAN `LembarPerpindahanPermendagri` yang di-prop-kan. Empat hal
// berbeda secara struktural (lihat kepala lib/formatReklas.ts) — terutama DUA
// blok kode bersegmen, yang di keluarga perpindahan cuma satu — jadi
// menyatukannya berarti komponen ber-belasan prop boolean yang melanggar
// CODING-STANDARD §1.5. Yang DIPAKAI BERSAMA justru bagian yang berbahaya kalau
// menyimpang: mesin subtotal & peta nama tingkat (lib/formatPermendagri.ts).
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
// Dipakai bersama lembar BA Rekon, Perolehan, & Perpindahan — sengaja diimpor.
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode, susunRinci, susunRekap, type ItemLaporan } from '@/lib/formatPermendagri'
import {
  SEL_KODE_REKLAS, lembarRekapReklas,
  kolomLembarReklas, lebarKodeReklas, judulRekapReklas,
  type FormatReklas, type KolomLembarReklas,
} from '@/lib/formatReklas'
import type { BarisReklas } from '@/lib/laporanReklas'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/**
 * Kelas sel KEPALA tabel.
 *
 * ⚠️ `[overflow-wrap:anywhere]`, BUKAN `break-words`. Keduanya beda tepat di
 * kasus yang menggigit di lembar sepadat ini: `break-word` tak memecah kata yang
 * sudah berdiri sendirian di barisnya, jadi "Keterangan" di sel sempit tetap
 * MELUBER menimpa sel tetangga — dan `table-fixed` menyembunyikannya dengan rapi
 * sampai kertasnya keluar. `px-0.5` (2 px) bukan `px-1`: di lembar 23 kolom + 14
 * sel segmen, 4 px padding itu sepertiga lebar sel kode.
 */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'

/**
 * Kelas sel ISI lembar RINCI.
 *
 * ⚠️ `px-0.5` (2 px), BUKAN `px-1` seperti keluarga perpindahan — dan itu bukan
 * penyeragaman, melainkan pilihan yang diukur. Lembar ini punya **28 sel** per
 * baris; padding kiri-kanan 4 px di 14 sel non-kode memakan ±56 px, sekitar
 * 4,7% lebar cetak F4 lanskap. Ruang itu jauh lebih berguna dipakai kolom teks
 * panjang ("Aset Tetap Tanah Yang Tidak Digunakan Dalam Operasional
 * Pemerintah", 65 karakter) yang tiap barisnya membungkus 3–4 baris.
 *
 * ⚠️ `py-px` + `leading-[1.15]` menekan TINGGI baris, yang di lembar ini justru
 * pengeluaran terbesar: satu barisnya bisa 4 baris teks, jadi tiap 1 px tinggi
 * baris terkali empat. Jangan dikembalikan ke `py-0.5`/`leading-tight` tanpa
 * mengukur ulang berapa baris yang muat sehalaman.
 */
const SEL_ISI = 'border border-black px-0.5 py-px'

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
 * Permendagri itu rujukan ke "petunjuk pengisian", penanda TEMPLATE KOSONG.
 * Keputusan user 2026-08-30, berlaku untuk seluruh lembar Permendagri di
 * aplikasi ini. Nomornya tetap hidup di `FORMAT_REKLAS` sebagai tautan balik ke
 * format aslinya & penjaga struktur kolom lewat test.
 *
 * ⚠️ Sebutan pejabat & nama SKPD dicetak DUA BARIS walaupun lembar aslinya
 * menyatukannya jadi satu isian ("KUASA PENGGUNA BARANG, PENGGUNA BARANG ATAU
 * PENGELOLA BARANG…..(3)"). Berdempetan dalam satu baris terbaca sebagai satu
 * nama jabatan yang tak pernah ada. Sama dgn keluarga IV.B/IV.C/IV.D.
 */
function KopLembar({ judul, berupa, komptabel, sebutan, skpd, periode, tahun, tambahan }: {
  judul: string; berupa: string; komptabel: string; sebutan: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string; tambahan?: string
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

/**
 * Catatan kaki lembar aslinya. ⚠️ Dicetak apa adanya — ia yang menjelaskan
 * kenapa kolom Akumulasi & Nilai Buku kosong untuk Tanah/KDP/ATL.
 */
const CATATAN_KAKI = '*) hanya diisi untuk BMD yang dilakukan Penyusutan atau Amortisasi.'

export type PropLembarReklas = {
  /** Registry cabangnya — `FORMAT_REKLAS.penambahan`. */
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
   *
   * ⚠️ Yang dicentang operator menentukan APA YANG DICETAK, jadi ia menyaring
   * di SINI — bukan disembunyikan lewat CSS. Lembar tersembunyi tetap ikut ke
   * berkas PDF dan operator tak punya cara tahu.
   */
  lembar?: number[]
}

export default function LembarReklasPermendagri(p: PropLembarReklas) {
  const { f, items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const tampil = (akhiran: number) => !p.lembar || p.lembar.includes(akhiran)

  // Blok lawan ("Reklasifikasi dari") juga bersegmen → satu kolom di registry,
  // TUJUH sel di tabel. Ini yang membedakan jumlah sel dari jumlah kolom.
  const lebarSelLawan = f.kolom.find(k => k.key === 'lawan_kode')!.lebar / SEL_KODE_REKLAS
  // ⚠️ `- 1`: `lawan_kode` sudah TERHITUNG sebagai satu kolom di
  // `kolomLembarReklas`, lalu memekar jadi `SEL_KODE_REKLAS` sel — jadi yang
  // ditambahkan cuma SELISIHNYA. Tanpa `- 1`, baris "tidak ada data" ber-colSpan
  // satu sel lebih lebar dari tabelnya & barisnya melar sendiri.
  // Dikunci tests/lembarReklas.test.tsx (uji ini menangkapnya di percobaan
  // pertama, sebelum lembarnya pernah dicetak).
  const nKolom = SEL_KODE_REKLAS * 2 + kolomLembarReklas(f).length - 1

  const isiKolom = (k: KolomLembarReklas, r: BarisReklas): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // ⚠️ "Nama Barang" = NOMENKLATUR BAKU dari kodefikasi kode TUJUAN, bukan
      // yang diketik operator; "Spesifikasi Nama Barang" yang diketik. Dua hal
      // berbeda — pola yang sama dipakai Daftar Barang, Penyusutan, & lembar
      // RKBMD. Jangan ditukar.
      // ⚠️ `uraian_barang` di `aset` cuma CADANGAN: ia salinan yang dibuat saat
      // barang lahir, jadi untuk barang yang baru direklas ia masih memuat
      // uraian kode LAMA.
      case 'nama': return nama(r.kodeUtama) || a.uraian_barang || ''
      // ⚠️ Reklas boleh sekalian mengganti nama barang, jadi yang dicetak nama
      // di SISI yang dilaporkan — sudah diputuskan pemuatnya (`namaSpek`),
      // BUKAN di sini. Lihat catatannya di lib/laporanReklas.ts.
      case 'spek_nama': return r.namaSpek || a.nama_barang || ''
      case 'jumlah': return a.jumlah ?? 1
      case 'satuan': return a.satuan || ''
      case 'nilai_perolehan': return formatRupiah(r.nilai)
      // ⚠️ Sel yang posisinya TAK KETEMU di `penyusutan_semester` dicetak
      // titik-titik, BUKAN 0 — nol berarti "memang belum tersusut", tak-ketemu
      // berarti "engine belum dijalankan". Di lembar bertanda tangan kedua
      // keadaan itu tak boleh terlihat sama.
      case 'akumulasi': return r.tanpaPenyusutan ? '…' : formatRupiah(r.akumulasi ?? 0)
      case 'nilai_buku': return r.tanpaPenyusutan ? '…' : formatRupiah(r.nilaiBuku ?? 0)
      // `lawan_kode` dirender sebagai SEL SEGMEN, bukan lewat fungsi ini.
      case 'lawan_kode': return ''
      case 'lawan_nama': return nama(r.kodeLawan) || ''
      case 'penyebab': return r.penyebab
      // ⚠️ SELALU KOSONG — lihat alasannya di lib/formatReklas.ts. Jangan diisi
      // nama berkas unggahan atau label alasan yang sudah tercetak di kolom (19).
      case 'dok_nama': return ''
      case 'dok_nomor': return r.header?.no_sk || ''
      case 'dok_tanggal': return tglID(r.header?.tanggal || r.tanggal)
      case 'keterangan': return r.keterangan || a.keterangan || r.header?.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomLembarReklas) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  /**
   * Kepala tabel.
   *
   * ⚠️ `WRAP` di tiap `<th>` bukan hiasan — judul kolom di lembar ini memuat
   * kata tunggal yang lebih lebar dari selnya sendiri ("Spesifikasi",
   * "Keterangan", "Reklasifikasi"). Tanpa `overflow-wrap: anywhere` kata itu
   * MELUBER menimpa sel tetangga dan `table-fixed` menyembunyikannya sampai
   * kertasnya keluar (pelajaran ronde IV.B/IV.C, 2026-08-31).
   *
   * ⚠️ `lawan_kode` menempati TUJUH sel, jadi `colSpan` grupnya dihitung, bukan
   * `g.kolom.length`. Salah hitung di sini menggeser SELURUH kolom di kanannya
   * tanpa satu pun error.
   */
  function Thead() {
    const grup: { judul: string | undefined; kolom: KolomLembarReklas[] }[] = []
    for (const k of f.kolom) {
      const t = grup[grup.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else grup.push({ judul: k.grup, kolom: [k] })
    }
    const selGrup = (g: { kolom: KolomLembarReklas[] }) =>
      g.kolom.reduce((n, k) => n + (k.key === 'lawan_kode' ? SEL_KODE_REKLAS : 1), 0)
    // `grup: 'lawan'` itu PENANDA, bukan judul — judul sebenarnya ikut cabang
    // (`Reklasifikasi dari` / `…ke`) & disimpan di registry.
    const judulGrup = (j: string) => j === 'lawan' ? f.grupLawan : j
    return (
      <thead>
        <tr className="text-center font-semibold">
          <th className={WRAP} rowSpan={2}>{f.kolomKiri.judul}</th>
          <th className={WRAP} colSpan={SEL_KODE_REKLAS + 1}>
            Penggolongan dan Kodefikasi Barang
          </th>
          {grup.map((g, i) => g.judul
            ? <th key={i} className={WRAP} colSpan={selGrup(g)}>{judulGrup(g.judul)}</th>
            : <th key={i} className={WRAP} rowSpan={2}>{g.kolom[0].judul}</th>)}
        </tr>
        <tr className="text-center font-semibold">
          <th className={WRAP} colSpan={SEL_KODE_REKLAS}>Kode Barang</th>
          <th className={WRAP}>{f.kolomNama.judul}</th>
          {grup.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => (
              <th key={k.key} className={WRAP}
                colSpan={k.key === 'lawan_kode' ? SEL_KODE_REKLAS : 1}>{k.judul}</th>
            )))}
        </tr>
      </thead>
    )
  }

  /** `<col>` untuk semua kolom sesudah blok Penggolongan (lawan_kode → 7 sel). */
  function ColsKanan() {
    return (
      <>
        {f.kolom.flatMap(k => k.key === 'lawan_kode'
          ? Array.from({ length: SEL_KODE_REKLAS }, (_, i) => (
            <col key={`${k.key}${i}`} style={{ width: `${lebarSelLawan}%` }} />
          ))
          : [<col key={k.key} style={{ width: `${k.lebar}%` }} />])}
      </>
    )
  }

  // ── Lembar RINCI IV.F.2 ───────────────────────────────────────────────────
  function LembarRinci() {
    const baris = susunRinci(items, f.subtotal)
    return (
      <section className="lembar-rinci">
        <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
        <KopLembar judul={f.judul} berupa={berupa} komptabel={labelKomptabel}
          sebutan={sebutan} skpd={skpd} periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[7.5px] leading-[1.15]">
          <colgroup>
            <col style={{ width: `${f.kolomKiri.lebar}%` }} />
            {Array.from({ length: SEL_KODE_REKLAS }, (_, i) => (
              <col key={i} style={{ width: `${lebarKodeReklas(f) / SEL_KODE_REKLAS}%` }} />
            ))}
            <col style={{ width: `${f.kolomNama.lebar}%` }} />
            <ColsKanan />
          </colgroup>
          <Thead />
          <tbody>
            {baris.map((b, i) => b.tipe === 'grup' ? (
              // Baris kelompok: kolom NIBAR kosong (kelompok tak ber-NIBAR),
              // kode sedalam tingkatnya, namanya, lalu HANYA ketiga kolom uang
              // yang berisi — begitu bentuk lembar aslinya.
              <tr key={`g${i}`} className="font-bold italic">
                <td className={SEL_ISI} />
                <SelKode kode={b.kode} sampai={b.seg} n={SEL_KODE_REKLAS} tebal />
                <td className={`${SEL_ISI} break-words`}>{nama(b.kode) || b.kode}</td>
                {f.kolom.flatMap(k => k.key === 'lawan_kode'
                  // Blok lawan dikosongkan di baris kelompok: satu kelompok kode
                  // tujuan bisa berasal dari BANYAK kode asal yang berbeda, jadi
                  // mengisinya berarti menunjuk salah satunya seolah mewakili
                  // semuanya.
                  ? Array.from({ length: SEL_KODE_REKLAS }, (_, j) => (
                    <td key={`${k.key}${j}`} className={SEL_ISI} />
                  ))
                  : [(
                    // ⚠️ `anywhere` di sini juga — baris SUBTOTAL justru memuat
                    // angka TERBESAR di lembar (jumlah se-golongan), jadi kalau
                    // yang dibungkus cuma baris barangnya, yang meluber ke sel
                    // sebelah malah angka yang paling diperhatikan pemeriksa.
                    <td key={k.key}
                      className={`${SEL_ISI} ${rata(k)} [overflow-wrap:anywhere]`}>
                      {k.key === 'nilai_perolehan' ? formatRupiah(b.nilai)
                        : k.key === 'akumulasi' ? formatRupiah(b.akumulasi)
                          : k.key === 'nilai_buku' ? formatRupiah(b.nilaiBuku)
                            : ''}
                    </td>
                  )])}
              </tr>
            ) : (
              <tr key={`i${b.data.id}`} className="align-top">
                <td className={`${SEL_ISI} break-all tracking-tighter text-[6px]`}>
                  {isiKolom(f.kolomKiri, b.data)}
                </td>
                <SelKode kode={b.kode} sampai={SEL_KODE_REKLAS} n={SEL_KODE_REKLAS} />
                <td className={`${SEL_ISI} break-words`}>
                  {isiKolom(f.kolomNama, b.data)}
                </td>
                {f.kolom.flatMap(k => k.key === 'lawan_kode'
                  ? [<SelKode key={k.key} kode={b.data.kodeLawan} sampai={SEL_KODE_REKLAS} n={SEL_KODE_REKLAS} />]
                  : [(
                    <td key={k.key}
                      // ⚠️ `anywhere` di sel isi juga — nilai rupiah panjang
                      // ("3.794.734.725") & nama barang tanpa spasi sama-sama
                      // bisa melebihi selnya. Kolom bertanggal dikecualikan:
                      // memecah "12/08/2026" di tengah bikin tak terbaca, dan
                      // lebarnya memang sudah dianggarkan muat.
                      className={`${SEL_ISI} ${rata(k)} ${
                        k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                      {isiKolom(k, b.data)}
                    </td>
                  )])}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={nKolom} className="border border-black px-0.5 py-3 text-center">
                Tidak ada penambahan akibat reklasifikasi pada periode ini.
              </td></tr>
            )}
          </tbody>
        </table>
        <p className="text-[8px] mt-1">{CATATAN_KAKI}</p>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
      </section>
    )
  }

  // ── Lembar REKAP (IV.F.3–F.6) ─────────────────────────────────────────────
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
              <th className="border border-black px-1 py-1" colSpan={nSel + 1}>
                Penggolongan dan Kodefikasi Barang
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Nilai Perolehan (Rp)</th>
              <th className="border border-black px-1 py-1" rowSpan={2}>
                Nilai Akumulasi Penyusutan atau Amortisasi (Rp)*
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Nilai Buku (Rp)*</th>
            </tr>
            <tr className="text-center font-semibold">
              <th className="border border-black px-1 py-1" colSpan={nSel}>Kode Barang</th>
              <th className="border border-black px-1 py-1">Nama Barang</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className={b.seg <= segMin ? 'font-bold' : ''}>
                <SelKode kode={b.kode} sampai={b.seg} n={nSel} />
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.akumulasi)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilaiBuku)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nSel + 4} className="border border-black px-1 py-3 text-center">
                Tidak ada penambahan akibat reklasifikasi pada periode ini.
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
