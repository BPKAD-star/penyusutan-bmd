'use client'
// ============================================================================
// PENYAJI lembar IV.D.7 — Rekapitulasi GABUNGAN Pengeluaran & Penerimaan BMD
// Internal Pengguna Barang.
//
// Murni tampilan — nol query, nol state. Angkanya dirakit `muatLembarPerpindahan`
// (lib/laporanPerpindahan.ts) dengan `arah: 'semua'`; susunan kolomnya dari
// `FORMAT_GABUNGAN_INTERNAL` (lib/formatGabunganInternal.ts).
//
// ⚠️ DATAR & BERNOMOR, tanpa satu pun baris subtotal — beda mendasar dari
// keluarga IV.B/IV.C/IV.D.2 yang hierarkis. Karena itu ia TIDAK memakai
// `susunRinci`/`susunRekap`; barisnya dipakai apa adanya, urut seperti yang
// datang dari pemuat.
//
// ⚠️ Kedua blok angka (Pengeluaran & Penerimaan) SELALU kembar di aplikasi ini:
// satu baris `mutasi_internal` merekam kedua sisi sekaligus. Yang benar-benar
// berbeda cuma PIHAK-nya. Baris "Jumlah Total" karena itu menyatakan ulang,
// bukan mengecek silang — jangan disajikan sebagai bukti "keluar = masuk sudah
// dicocokkan". Alasan lengkapnya di kepala lib/formatGabunganInternal.ts.
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { segmenKode } from '@/lib/formatPermendagri'
import {
  FORMAT_GABUNGAN_INTERNAL, SEL_KODE_GABUNGAN, KOLOM_DIJUMLAH,
  kolomGabungan, lebarKodeGabungan,
  type KolomIvd7, type KolomGabungan,
} from '@/lib/formatGabunganInternal'
import type { BarisPerpindahan } from '@/lib/laporanPerpindahan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** Kelas sel KEPALA — sama alasannya dgn LembarPerpindahanPermendagri. */
const WRAP = 'border border-black px-0.5 py-1 [overflow-wrap:anywhere]'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

export type PropLembarGabungan = {
  rows: BarisPerpindahan[]
  /** Awalan kode → nama tingkat (lihat `petaNamaTingkat`). */
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  /** Sebutan pejabat penanda tangan, diturunkan dari LEVEL SKPD. */
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
}

export default function LembarGabunganInternal(p: PropLembarGabungan) {
  const f = FORMAT_GABUNGAN_INTERNAL
  const { rows, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''
  const semua = kolomGabungan()
  const nKolom = SEL_KODE_GABUNGAN + semua.length

  const isi = (k: KolomIvd7, r: BarisPerpindahan, i: number): React.ReactNode => {
    const a = r.aset!
    const jml = a.jumlah ?? 1
    const harga = a.harga_satuan ?? r.nilai
    switch (k.key) {
      case 'no': return `${i + 1}.`
      // BAST = dokumen perpindahannya; `header.tanggal` tanggal dokumen sumber.
      case 'ba_tanggal': return tglID(r.header?.tanggal || r.payload?.tgl_dokumen_sumber || r.tanggal)
      case 'ba_nomor': return r.header?.no_sk || r.payload?.no_sk || ''
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan impor e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const pc = pecahNibar(a.nibar)
        return pc ? <>{pc[0]}<br />{pc[1]}</> : (a.nibar || '')
      }
      // ⚠️ "Nama Barang" = nomenklatur BAKU dari kodefikasi; "Spesifikasi Nama
      // Barang" yang diketik operator. Dua hal berbeda, jangan ditukar.
      case 'nama': return nama(a.kode) || a.uraian_barang || ''
      case 'spek_nama': return a.nama_barang || ''
      // ── Dua blok cermin. Angkanya SENGAJA sama — lihat kepala berkas. ─────
      case 'keluar_pihak': return r.asal_nama || ''
      case 'masuk_pihak': return r.tujuan_nama || ''
      case 'keluar_jumlah': case 'masuk_jumlah': return jml
      case 'keluar_satuan': case 'masuk_satuan': return a.satuan || ''
      case 'keluar_harga': case 'masuk_harga': return formatRupiah(harga)
      case 'keluar_total': case 'masuk_total': return formatRupiah(r.nilai)
      // ⚠️ Titik-titik, BUKAN 0, kalau posisinya tak ketemu di
      // `penyusutan_semester`. Nol berarti "memang belum tersusut",
      // tak-ketemu berarti "engine belum dijalankan" — di lembar bertanda
      // tangan keduanya tak boleh terlihat sama.
      case 'keluar_akumulasi': case 'masuk_akumulasi':
        return r.tanpaPenyusutan ? '…' : formatRupiah(r.akumulasi ?? 0)
      case 'keluar_nilai_buku': case 'masuk_nilai_buku':
        return r.tanpaPenyusutan ? '…' : formatRupiah(r.nilaiBuku ?? 0)
      case 'keterangan': return a.keterangan || r.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: KolomIvd7) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  /** Σ kolom yang ditandai `KOLOM_DIJUMLAH`. */
  const total = (key: KolomGabungan): number => rows.reduce((a, r) => {
    if (key.endsWith('_total')) return a + (r.nilai || 0)
    if (key.endsWith('_akumulasi')) return a + (r.akumulasi ?? 0)
    return a + (r.nilaiBuku ?? 0)
  }, 0)

  /** Kepala tabel: baris grup → baris kolom. */
  function Thead() {
    // Kolom kiri: sebagian bergrup (BAST), sebagian berdiri sendiri.
    const kiri: { judul: string | undefined; kolom: KolomIvd7[] }[] = []
    for (const k of f.kolomKiri) {
      const t = kiri[kiri.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else kiri.push({ judul: k.grup, kolom: [k] })
    }
    const kanan: { judul: string | undefined; kolom: KolomIvd7[] }[] = []
    for (const k of f.kolom) {
      const t = kanan[kanan.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else kanan.push({ judul: k.grup, kolom: [k] })
    }
    const sel = (g: { judul: string | undefined; kolom: KolomIvd7[] }, i: number) => g.judul
      ? <th key={i} className={WRAP} colSpan={g.kolom.length}>{g.judul}</th>
      : <th key={i} className={WRAP} rowSpan={2}>{g.kolom[0].judul}</th>
    return (
      <thead>
        <tr className="text-center font-semibold">
          {kiri.map(sel)}
          <th className={WRAP} colSpan={SEL_KODE_GABUNGAN + 1}>
            Penggolongan dan Kodefikasi Barang
          </th>
          {kanan.map((g, i) => sel(g, i + kiri.length))}
        </tr>
        <tr className="text-center font-semibold">
          {kiri.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
          <th className={WRAP} colSpan={SEL_KODE_GABUNGAN}>Kode Barang</th>
          <th className={WRAP}>{f.kolomNama.judul}</th>
          {kanan.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => <th key={k.key} className={WRAP}>{k.judul}</th>))}
        </tr>
      </thead>
    )
  }

  /**
   * Baris JUMLAH TOTAL — satu baris, dua label.
   *
   * ⚠️ Lebar labelnya DIHITUNG dari posisi kolom yang dijumlah, bukan ditulis
   * tangan: menyisipkan satu kolom saja akan menggeser angka totalnya ke kolom
   * yang salah, dan itu cuma ketahuan sesudah lembarnya dicetak (pelajaran
   * `KOLOM_JUMLAH_PENGADAAN` di lembar RKBMD).
   */
  function BarisJumlah() {
    const iKeluar = semua.findIndex(k => k.key === 'keluar_total')
    const iMasuk = semua.findIndex(k => k.key === 'masuk_total')
    // Sel kode ikut dihitung: ia duduk sesudah `kolomKiri`.
    const geser = (i: number) => (i >= f.kolomKiri.length ? i + SEL_KODE_GABUNGAN : i)
    const kolKeluar = geser(iKeluar)
    const kolMasuk = geser(iMasuk)
    // ⚠️ `anywhere` WAJIB di sini juga — baris total memuat angka TERBESAR di
    // lembar, jadi kalau yang dibungkus cuma baris barangnya, yang meluber ke
    // sel sebelah malah angka yang paling diperhatikan pemeriksa. Terukur
    // 2026-09-02: tanpa ini keenam selnya meluber 3 px.
    const angka = (key: KolomGabungan) => (
      <td key={key}
        className="border border-black px-1 py-0.5 text-right font-bold [overflow-wrap:anywhere]">
        {formatRupiah(total(key))}
      </td>
    )
    return (
      <tr className="font-bold">
        <td className="border border-black px-1 py-0.5 text-center" colSpan={kolKeluar}>
          Jumlah Total Pengeluaran
        </td>
        {(['keluar_total', 'keluar_akumulasi', 'keluar_nilai_buku'] as KolomGabungan[]).map(angka)}
        <td className="border border-black px-1 py-0.5 text-center" colSpan={kolMasuk - kolKeluar - 3}>
          Jumlah Total Penerimaan
        </td>
        {(['masuk_total', 'masuk_akumulasi', 'masuk_nilai_buku'] as KolomGabungan[]).map(angka)}
        <td className="border border-black px-1 py-0.5" colSpan={nKolom - kolMasuk - 3} />
      </tr>
    )
  }

  return (
    <section className="lembar-gabungan">
      <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
      <div className="text-center leading-tight mb-2">
        <p className="font-bold text-[11px]">{f.judul} {berupa}</p>
        <p className="font-bold text-[11px]">{labelKomptabel}</p>
        <p className="font-bold text-[11px]">{sebutan.toUpperCase()}</p>
        <p className="font-bold text-[11px]">{(skpd?.nama || '').toUpperCase()}</p>
        <p className="font-bold text-[11px]">{judulPeriode}</p>
        <p className="font-bold text-[11px]">TAHUN {tahun}</p>
      </div>
      <table className="text-[9px] mb-1">
        <tbody>
          <tr><td className="pr-6">Provinsi</td><td>: {PROVINSI}</td></tr>
          <tr><td className="pr-6">Kabupaten/Kota</td><td>: {KABUPATEN}</td></tr>
        </tbody>
      </table>

      <table className="w-full table-fixed border-collapse text-[7.5px] leading-tight">
        <colgroup>
          {f.kolomKiri.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          {Array.from({ length: SEL_KODE_GABUNGAN }, (_, i) => (
            <col key={i} style={{ width: `${lebarKodeGabungan() / SEL_KODE_GABUNGAN}%` }} />
          ))}
          <col style={{ width: `${f.kolomNama.lebar}%` }} />
          {f.kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
        </colgroup>
        <Thead />
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="align-top">
              {f.kolomKiri.map(k => (
                <td key={k.key}
                  className={`border border-black px-1 py-0.5 ${rata(k)} ${
                    k.key === 'nibar' ? 'break-all tracking-tighter text-[6px]'
                      : k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                  {isi(k, r, i)}
                </td>
              ))}
              {Array.from({ length: SEL_KODE_GABUNGAN }, (_, j) => (
                <td key={j} className="border border-black px-0.5 py-0.5 text-center">
                  {segmenKode(r.aset!.kode)[j] ?? ''}
                </td>
              ))}
              <td className="border border-black px-1 py-0.5 [overflow-wrap:anywhere]">
                {isi(f.kolomNama, r, i)}
              </td>
              {f.kolom.map(k => (
                <td key={k.key}
                  className={`border border-black px-1 py-0.5 ${rata(k)} ${
                    k.rata === 'tengah' ? 'whitespace-nowrap' : '[overflow-wrap:anywhere]'}`}>
                  {isi(k, r, i)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={nKolom} className="border border-black px-1 py-3 text-center">
              Tidak ada perpindahan internal pada periode ini.
            </td></tr>
          ) : <BarisJumlah />}
        </tbody>
      </table>

      <div className="flex justify-end mt-8 text-[10px]">
        <div className="text-center w-80">
          <p>{KABUPATEN}, {tglPanjang(tglTtd)}</p>
          <p>{sebutan}</p>
          <div className="h-14" />
          {/* Yang belum dipilih DIBIARKAN bertitik-titik — mengarang nama di
              dokumen yang akan ditandatangani jauh lebih berbahaya. */}
          <p className="font-semibold">{ttd?.nama || '…………………………………'}</p>
          <p>NIP. {ttd?.nip || '……………………'}</p>
        </div>
      </div>
    </section>
  )
}
