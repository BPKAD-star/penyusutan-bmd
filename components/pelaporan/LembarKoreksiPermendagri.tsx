'use client'
// ============================================================================
// PENYAJI lembar KOREKSI format Permendagri 47/2021 — keluarga IV.G.
//
//   IV.G.2      Laporan Koreksi BMD (rinci: sebelum · setelah · selisih)
//   IV.G.3      Rekap selisih menurut sub-sub rincian objek — MASIH berbaris barang
//   IV.G.4–G.7  Rekap selisih, makin dangkal, tanpa baris barang
//
// Murni tampilan — nol query, nol state. Angkanya dirakit `muatLaporanKoreksi`
// + `itemKoreksi` (lib/laporanKoreksi.ts), susunan kolomnya dari
// `TANGGA_KOREKSI` (lib/formatKoreksi.ts).
//
// ⚠️ DUA BENTUK TABEL DALAM SATU PENYAJI, dan pembedanya DATA (`bentuk` &
// `punyaBarang`), bukan cabang per nomor lembar. Begitu penyaji harus tahu
// sedang merender "IV.G.4", lembar ketujuh akan menambah cabang lagi sampai
// berkas ini tak terbaca. Yang boleh dibaca cuma sifatnya.
//
// ⚠️ Sengaja BUKAN `LembarReklasPermendagri` yang di-prop-kan: di sana NIBAR
// kolom paling kiri di luar blok kode & ada super-header "Penggolongan dan
// Kodefikasi Barang"; di sini blok kode berdiri sendiri paling kiri dan NIBAR
// kolom (10) di tengah. Menyatukannya = komponen ber-belasan prop boolean
// (CODING-STANDARD §1.5). Yang DIPAKAI BERSAMA justru bagian yang berbahaya
// kalau menyimpang: mesin subtotal & peta nama tingkat.
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode, susunRinci, susunRekap, type ItemLaporan, type BarisGrup } from '@/lib/formatPermendagri'
import {
  SEL_KODE_KOREKSI, TANGGA_KOREKSI, URUT_LEMBAR, JUDUL_KOREKSI, UK,
  kolomLembarKoreksi, lebarKodeKoreksi, kodeLembarKoreksi,
  type IdLembarKoreksi, type LembarKoreksi, type KolomLembarKoreksi,
} from '@/lib/formatKoreksi'
import type { BarisKoreksi } from '@/lib/laporanKoreksi'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** Kelas sel KEPALA — `anywhere` (bukan `break-words`): lihat lembar IV.F. */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'
/** Kelas sel ISI — dipepet karena lembar IV.G.2 memuat 26 sel per baris. */
const SEL_ISI = 'border border-black px-0.5 py-px'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/**
 * Angka rupiah, atau titik-titik kalau TAK DIKETAHUI.
 *
 * ⚠️ `null` ≠ 0, dan di lembar bertanda tangan keduanya tak boleh terlihat
 * sama: nol berarti "memang tak ada nilainya", titik-titik berarti "aplikasi
 * ini tak menyimpannya" (baris koreksi sebelum 2026-09-07 tak membekukan
 * akumulasi sebelum koreksi — lihat kepala lib/laporanKoreksi.ts).
 */
const rp = (v: number | null | undefined) => (v == null ? '…' : formatRupiah(v))

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
 */
function KopLembar({ judul, berupa, menurut, komptabel, sebutan, skpd, periode, tahun }: {
  judul: string; berupa: string; menurut?: string; komptabel: string; sebutan: string
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
          {menurut && <p className="font-bold text-[11px]">MENURUT {menurut}</p>}
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

export type PropLembarKoreksi = {
  items: ItemLaporan<BarisKoreksi>[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
  /** Lembar yang ditampilkan. Kosong = semuanya. */
  lembar?: IdLembarKoreksi[]
}

export default function LembarKoreksiPermendagri(p: PropLembarKoreksi) {
  const { items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const dipilih = URUT_LEMBAR.filter(id => !p.lembar || p.lembar.includes(id))

  /** Isi satu sel untuk satu BARANG. */
  const isiBarang = (k: KolomLembarKoreksi, r: BarisKoreksi): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      // ⚠️ "Nama Barang" = NOMENKLATUR BAKU dari kodefikasi, bukan yang diketik
      // operator; "Spesifikasi Nama Barang" yang diketik. Jangan ditukar.
      case 'nama': return nama(a.kode) || a.uraian_barang || ''
      case 'nibar': {
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      case 'spek_nama': return a.nama_barang || ''
      case 'jumlah': return a.jumlah ?? 1
      case 'satuan': return a.satuan || ''
      case 'sblm_np': return rp(r.npSebelum)
      case 'sblm_ak': return rp(r.akSebelum)
      case 'sblm_nb': return rp(r.npSebelum == null || r.akSebelum == null ? null : r.npSebelum - r.akSebelum)
      case 'stlh_np': return rp(r.npSetelah)
      case 'stlh_ak': return rp(r.akSetelah)
      case 'stlh_nb': return rp(r.npSetelah == null || r.akSetelah == null ? null : r.npSetelah - r.akSetelah)
      case 'slsh_np': return rp(selisih(r, 'np'))
      case 'slsh_ak': return rp(selisih(r, 'ak'))
      case 'slsh_nb': return rp(selisih(r, 'nb'))
      // Tambah/Kurang di baris BARANG: yang berlawanan arah dibiarkan KOSONG,
      // bukan diisi 0 — itu bentuk lembar aslinya & jauh lebih terbaca.
      case 'np_tambah': return sisi(selisih(r, 'np'), true)
      case 'np_kurang': return sisi(selisih(r, 'np'), false)
      case 'ak_tambah': return sisi(selisih(r, 'ak'), true)
      case 'ak_kurang': return sisi(selisih(r, 'ak'), false)
      case 'nb_tambah': return sisi(selisih(r, 'nb'), true)
      case 'nb_kurang': return sisi(selisih(r, 'nb'), false)
      case 'penyebab': return r.header?.keterangan || r.keterangan || ''
      // ⚠️ SELALU KOSONG — aplikasi ini tak menyimpan nama/jenis dokumen sumber
      // koreksi di mana pun. Lihat lib/formatKoreksi.ts.
      case 'dok_nama': return ''
      case 'dok_nomor': return r.header?.no_sk || ''
      case 'dok_tanggal': return tglID(r.header?.tanggal || r.tanggal)
      case 'keterangan': return r.keterangan || a.keterangan || ''
      default: return ''
    }
  }

  /** Isi satu sel untuk baris KELOMPOK (subtotal). */
  const isiGrup = (k: KolomLembarKoreksi, b: BarisGrup): React.ReactNode => {
    const u = (nama: string) => b.ukuran[nama] ?? 0
    switch (k.key) {
      case 'nama': return nama(b.kode) || b.kode
      case 'sblm_np': return formatRupiah(u(UK.npSebelum))
      case 'sblm_ak': return formatRupiah(u(UK.akSebelum))
      case 'sblm_nb': return formatRupiah(u(UK.nbSebelum))
      case 'stlh_np': return formatRupiah(u(UK.npSetelah))
      case 'stlh_ak': return formatRupiah(u(UK.akSetelah))
      case 'stlh_nb': return formatRupiah(u(UK.nbSetelah))
      // ⚠️ Selisih di baris kelompok = Σsetelah − Σsebelum, BUKAN
      // Σtambah − Σkurang. Keduanya memang sama secara aritmetika, tapi yang
      // pertama menjaga ketiga kolom lembar IV.G.2 saling menutup persis
      // (sebelum + selisih = setelah) — itu yang akan dicek pemeriksa.
      case 'slsh_np': return formatRupiah(u(UK.npSetelah) - u(UK.npSebelum))
      case 'slsh_ak': return formatRupiah(u(UK.akSetelah) - u(UK.akSebelum))
      case 'slsh_nb': return formatRupiah(u(UK.nbSetelah) - u(UK.nbSebelum))
      case 'np_tambah': return formatRupiah(u(UK.npTambah))
      case 'np_kurang': return formatRupiah(u(UK.npKurang))
      case 'ak_tambah': return formatRupiah(u(UK.akTambah))
      case 'ak_kurang': return formatRupiah(u(UK.akKurang))
      case 'nb_tambah': return formatRupiah(u(UK.nbTambah))
      case 'nb_kurang': return formatRupiah(u(UK.nbKurang))
      // Kolom identitas & dokumen dikosongkan di baris kelompok — satu kelompok
      // memuat banyak barang & banyak dokumen, jadi mengisinya berarti menunjuk
      // salah satunya seolah mewakili semuanya.
      default: return ''
    }
  }

  const rata = (k: KolomLembarKoreksi) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  function Lembar({ id, pecahHalaman }: { id: IdLembarKoreksi; pecahHalaman: boolean }) {
    const l = TANGGA_KOREKSI[id]
    const kolom = kolomLembarKoreksi(l)
    // ⚠️ Lembar TANPA baris barang cuma butuh sel kode sedalam kelompoknya;
    // yang berbaris barang butuh 7 (kode penuh). Memakai 7 di semuanya
    // menyisakan sel kosong yang terbaca sbg segmen yang belum diisi.
    const nSel = l.punyaBarang ? SEL_KODE_KOREKSI : l.seg
    const nKolom = nSel + kolom.length
    const baris = l.punyaBarang
      ? susunRinci(items, l.subtotal ?? [0, 0, 0, 0])
      : susunRekap(items, l.seg, l.segMin).map(g => ({ ...g } as const))

    // Grup kepala: `grup` berdampingan digabung jadi satu `th` ber-colSpan.
    const grup: { judul: string | undefined; kolom: KolomLembarKoreksi[] }[] = []
    for (const k of kolom) {
      const t = grup[grup.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else grup.push({ judul: k.grup, kolom: [k] })
    }
    const adaGrup = grup.some(g => g.judul)
    // Bentuk `selisih` punya kepala TIGA tingkat: "Selisih Nilai Koreksi" →
    // tiga sub-blok ukuran → Tambah/Kurang.
    const tigaTingkat = l.bentuk === 'selisih'
    const nUang = kolom.filter(k => k.grup).length

    return (
      <section className={pecahHalaman ? 'break-before-page' : ''}>
        <p className="text-right text-[12px] mb-1">Format {kodeLembarKoreksi(l)}</p>
        <KopLembar judul={JUDUL_KOREKSI[l.bentuk]} berupa={berupa} menurut={l.menurut}
          komptabel={labelKomptabel} sebutan={sebutan} skpd={skpd}
          periode={judulPeriode} tahun={tahun} />
        <table className={`w-full table-fixed border-collapse leading-[1.15] ${
          l.bentuk === 'rinci' ? 'text-[7px]' : 'text-[8.5px]'}`}>
          <colgroup>
            {Array.from({ length: nSel }, (_, i) => (
              <col key={i} style={{ width: `${lebarKodeKoreksi(l) / nSel}%` }} />
            ))}
            {kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              <th className={WRAP} colSpan={nSel} rowSpan={tigaTingkat ? 3 : 2}>Kode Barang</th>
              {tigaTingkat ? (
                <>
                  {kolom.filter(k => !k.grup).map(k => (
                    <th key={k.key} className={WRAP} rowSpan={3}>{k.judul}</th>
                  ))}
                  <th className={WRAP} colSpan={nUang}>Selisih Nilai Koreksi</th>
                </>
              ) : grup.map((g, i) => g.judul
                ? <th key={i} className={WRAP} colSpan={g.kolom.length}>{g.judul}</th>
                : <th key={i} className={WRAP} rowSpan={2}>{g.kolom[0].judul}</th>)}
            </tr>
            {tigaTingkat ? (
              <>
                <tr className="text-center font-semibold">
                  {grup.filter(g => g.judul).map((g, i) => (
                    <th key={i} className={WRAP} colSpan={g.kolom.length}>{g.judul}</th>
                  ))}
                </tr>
                <tr className="text-center font-semibold">
                  {grup.filter(g => g.judul).flatMap(g =>
                    g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
                </tr>
              </>
            ) : (
              <tr className="text-center font-semibold">
                {grup.filter(g => g.judul).flatMap(g =>
                  g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
              </tr>
            )}
          </thead>
          <tbody>
            {baris.map((b, i) => b.tipe === 'grup' ? (
              <tr key={`g${i}`} className="font-bold italic">
                <SelKode kode={b.kode} sampai={Math.min(b.seg, nSel)} n={nSel} tebal />
                {kolom.map(k => (
                  <td key={k.key} className={`${SEL_ISI} ${rata(k)} [overflow-wrap:anywhere]`}>
                    {isiGrup(k, b)}
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={`i${b.data.id}`} className="align-top">
                <SelKode kode={b.kode} sampai={nSel} n={nSel} />
                {kolom.map(k => (
                  <td key={k.key}
                    className={`${SEL_ISI} ${rata(k)} ${
                      k.key === 'nibar' ? 'break-all tracking-tighter text-[6px]'
                        : k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                    {isiBarang(k, b.data)}
                  </td>
                ))}
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={nKolom} className="border border-black px-0.5 py-3 text-center">
                Tidak ada koreksi nilai pada periode ini.
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
      {/* ⚠️ Page-break hanya kalau ADA lembar sebelumnya — break di lembar
          pertama menghasilkan satu halaman KOSONG di depan berkas, dan itu baru
          ketahuan sesudah dicetak. */}
      {dipilih.map((id, i) => <Lembar key={id} id={id} pecahHalaman={i > 0} />)}
    </>
  )
}

/** Selisih satu ukuran untuk SATU barang. `null` = salah satu sisinya tak diketahui. */
function selisih(r: BarisKoreksi, u: 'np' | 'ak' | 'nb'): number | null {
  if (u === 'np') return r.npSebelum == null || r.npSetelah == null ? null : r.npSetelah - r.npSebelum
  if (u === 'ak') return r.akSebelum == null || r.akSetelah == null ? null : r.akSetelah - r.akSebelum
  const np = selisih(r, 'np')
  const ak = selisih(r, 'ak')
  return np == null || ak == null ? null : np - ak
}

/**
 * Sisi TAMBAH / KURANG satu selisih di baris BARANG.
 *
 * ⚠️ Yang berlawanan arah dibiarkan KOSONG (bukan "0" & bukan titik-titik) —
 * itu bentuk lembar aslinya. Yang TAK DIKETAHUI tetap titik-titik di KEDUA
 * kolom: kosong berarti "tak bergerak ke arah ini", titik-titik berarti "tak
 * diketahui", dan di lembar bertanda tangan keduanya tak boleh terlihat sama.
 */
function sisi(v: number | null, tambah: boolean): string {
  if (v == null) return '…'
  if (v === 0) return ''
  return (v > 0) === tambah ? formatRupiah(Math.abs(v)) : ''
}
