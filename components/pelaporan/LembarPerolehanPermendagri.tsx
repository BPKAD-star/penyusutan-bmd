'use client'
// ============================================================================
// PENYAJI lembar Perolehan format Permendagri 47/2021 (cabang IV.A).
//
// Murni tampilan — nol query, nol state. Angkanya dirakit
// app/cetak/perolehan-permendagri/page.tsx, susunan & penomoran kolomnya datang
// dari `FORMAT_PEROLEHAN` (lib/formatPermendagri.ts). Pemisahan ini mengikuti
// pola BA Rekon: presenter di components/pelaporan/, pengambil data di halaman.
//
// Satu pemanggilan menghasilkan LIMA lembar berurutan dengan page-break:
// IV.A.<n>.2 rinci + IV.A.<n>.3–6 rekap.
// ============================================================================
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
// Dipakai bersama lembar BA Rekon — sengaja diimpor, bukan disalin: ini
// kemunculan KETIGA pengurai tanggal panjang di repo ini.
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import {
  TANGGA_REKAP, SEL_KODE, lebarKodeBlok, segmenKode,
  susunRinci, susunRekap, totalSemua,
  type FormatPerolehan, type Kolom, type ItemLaporan,
} from '@/lib/formatPermendagri'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/** Baris ledger + asetnya, seperlunya untuk mengisi kolom lembar. */
export type BarisLembar = {
  id: number
  tanggal: string
  nilai: number
  keterangan: string | null
  header: {
    no_sk: string
    payload: { pihak?: string; sumber_dana?: string; dok_nama?: string; penyebab?: string } | null
  } | null
  aset: {
    kode: string; nama_barang: string | null; uraian_barang: string | null; nibar: string | null
    spesifikasi_lainnya: string | null; satuan: string | null; jumlah: number | null
    harga_satuan: number | null; kondisi_barang: string | null; tgl_perolehan: string | null
    keterangan: string | null; intra_ekstra: string | null
  } | null
}

// ── Potongan tampilan ───────────────────────────────────────────────────────

/** Sel-sel segmen kode. `sampai` = berapa segmen yang diisi (sisanya kosong). */
function SelKode({ kode, sampai, tebal }: { kode: string; sampai: number; tebal?: boolean }) {
  const seg = segmenKode(kode)
  return (
    <>
      {Array.from({ length: SEL_KODE }, (_, i) => (
        <td key={i} className={`border border-black px-0.5 py-0.5 text-center ${tebal ? 'font-bold' : ''}`}>
          {i < sampai ? (seg[i] ?? '') : ''}
        </td>
      ))}
    </>
  )
}

function KopLembar({ judul, berupa, komptabel, skpd, periode, tahun, tambahan }: {
  judul: string; berupa: string; komptabel: string
  skpd: { kode: string; nama: string } | null
  periode: string; tahun: string; tambahan?: string
}) {
  return (
    <>
      <div className="text-center leading-tight mb-2">
        <p className="font-bold text-[11px]">{judul} {berupa}……..(1)</p>
        {tambahan && <p className="font-bold text-[11px]">{tambahan}</p>}
        <p className="font-bold text-[11px]">{komptabel} (2)</p>
        <p className="font-bold text-[11px]">
          KUASA PENGGUNA BARANG, PENGGUNA BARANG ATAU PENGELOLA BARANG…………(3)
        </p>
        <p className="font-bold text-[11px]">SKPD {skpd?.nama || '……'}…….(4)</p>
        <p className="font-bold text-[11px]">{periode}…….(5)</p>
        <p className="font-bold text-[11px]">TAHUN {tahun}…….(6)</p>
      </div>
      <table className="text-[9px] mb-1">
        <tbody>
          <tr><td className="pr-6">Provinsi</td><td>: {PROVINSI}……(7)</td></tr>
          <tr><td className="pr-6">Kabupaten/Kota</td><td>: {KABUPATEN}……(8)</td></tr>
        </tbody>
      </table>
    </>
  )
}

function BlokTtd({ sebutan, nama, nip, tgl, nomor }: {
  sebutan: string; nama: string | null; nip: string | null; tgl: string
  nomor: { tanggal: number; jabatan: number; nama: number }
}) {
  return (
    <div className="flex justify-end mt-8 text-[10px]">
      <div className="text-center w-80">
        <p>…………………, {tglPanjang(tgl)} ({nomor.tanggal})</p>
        {/* Lembar aslinya menuliskan ketiga kemungkinan untuk dicoret salah
            satunya; di sini yang benar langsung dipilih dari LEVEL SKPD
            (keputusan user 2026-08-30) — level 1 Pengguna Barang, sub unit
            Kuasa Pengguna Barang. */}
        <p>{sebutan} ({nomor.jabatan})</p>
        <div className="h-14" />
        {/* Yang belum dipilih DIBIARKAN bertitik-titik — mengarang nama di
            dokumen yang akan ditandatangani jauh lebih berbahaya. */}
        <p className="font-semibold">{nama || '…………………………………'} ({nomor.nama})</p>
        <p>NIP. {nip || '……………………'} ({nomor.nama})</p>
      </div>
    </div>
  )
}


export type PropLembar = {
  f: FormatPerolehan
  items: ItemLaporan<BarisLembar>[]
  /** Awalan kode → nama tingkat (lihat `petaNamaTingkat`). */
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  /** Isian (1) "BERUPA…", diturunkan dari kelompok neraca yang ada datanya. */
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  /** Sebutan pejabat penanda tangan, diturunkan dari LEVEL SKPD. */
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
}

export default function LembarPerolehanPermendagri(p: PropLembar) {
  const { f, items, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const nama = (kode: string) => p.namaTingkat.get(kode) || ''

  const nKolom = SEL_KODE + f.kolom.length
  const isiKolom = (k: Kolom, r: BarisLembar): React.ReactNode => {
    const a = r.aset!
    switch (k.key) {
      case 'nama': return nama(a.kode) || a.uraian_barang || ''
      case 'spek_nama': return a.nama_barang || ''
      case 'nibar': {
        // Dipenggal di BATAS SEGMEN (26+19). NIBAR warisan e-BMD yang
        // susunannya beda tak bisa dinilai → tampilkan utuh, jangan ditebak.
        const p = pecahNibar(a.nibar)
        return p ? <>{p[0]}<br />{p[1]}</> : (a.nibar || '')
      }
      case 'spek_lain': return a.spesifikasi_lainnya || ''
      case 'jumlah': return a.jumlah ?? 1
      case 'satuan': return a.satuan || ''
      case 'harga_satuan': return formatRupiah(a.harga_satuan ?? r.nilai)
      case 'total_nilai': return formatRupiah(r.nilai)
      case 'kondisi': return a.kondisi_barang || ''
      case 'sumber_dana': return r.header?.payload?.sumber_dana || ''
      case 'pihak': return r.header?.payload?.pihak || ''
      // Dokumen sumber: nomor & tanggalnya dilayani `no_sk`/`tanggal` header.
      // ⚠️ `dok_nama` & `penyebab` BELUM tersimpan di mana pun — kolomnya
      // sengaja dibiarkan kosong, bukan diisi tebakan. Tambahkan kuncinya di
      // `jurnal_header.payload` (jsonb, tanpa migrasi) begitu form headernya
      // menyediakan isian; sampai itu terjadi kolomnya memang belum berisi.
      case 'dok_nama': return r.header?.payload?.dok_nama || ''
      case 'dok_nomor': return r.header?.no_sk || ''
      case 'dok_tanggal': return tglID(r.tanggal)
      case 'ba_tanggal': return tglID(r.tanggal)
      case 'ba_nomor': return r.header?.no_sk || ''
      // ⚠️ Tanggal Perolehan = kapan barang DIBUAT (bisa jauh sebelum BAST
      // untuk barang bekas); tanggal dokumen = kapan ia jadi milik pemkab.
      case 'tgl_perolehan': return tglID(a.tgl_perolehan)
      case 'penyebab': return r.header?.payload?.penyebab || ''
      case 'keterangan': return a.keterangan || r.keterangan || ''
      default: return ''
    }
  }

  const rata = (k: Kolom) =>
    k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''

  /** Kepala tabel: baris grup → baris kolom → baris nomor. */
  function Thead({ kolomList }: { kolomList: Kolom[] }) {
    const sisa = kolomList.slice(1) // kolom[0] = 'nama', ikut blok Penggolongan
    const grup: { judul: string | undefined; kolom: Kolom[] }[] = []
    for (const k of sisa) {
      const t = grup[grup.length - 1]
      if (t && t.judul && t.judul === k.grup) t.kolom.push(k)
      else grup.push({ judul: k.grup, kolom: [k] })
    }
    return (
      <thead>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" colSpan={SEL_KODE + 1}>
            Penggolongan dan Kodefikasi Barang
          </th>
          {grup.map((g, i) => g.judul
            ? <th key={i} className="border border-black px-1 py-1" colSpan={g.kolom.length}>{g.judul}</th>
            : <th key={i} className="border border-black px-1 py-1" rowSpan={2}>{g.kolom[0].judul}</th>)}
        </tr>
        <tr className="text-center font-semibold">
          <th className="border border-black px-1 py-1" colSpan={SEL_KODE}>Kode Barang</th>
          <th className="border border-black px-1 py-1">{kolomList[0].judul}</th>
          {grup.filter(g => g.judul).flatMap(g =>
            g.kolom.map(k => <th key={k.key} className="border border-black px-1 py-1">{k.judul}</th>))}
        </tr>
        <tr className="text-center italic">
          <td className="border border-black px-1" colSpan={SEL_KODE}>(9)</td>
          {kolomList.map(k => (
            <td key={k.key} className="border border-black px-1">{k.rumus || `(${k.nomor})`}</td>
          ))}
        </tr>
      </thead>
    )
  }

  // ── Lembar RINCI ──────────────────────────────────────────────────────────
  function LembarRinci() {
    const baris = susunRinci(items, f.subtotal)
    const iTotal = f.kolom.findIndex(k => k.key === 'total_nilai')
    return (
      <section>
        <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
        <KopLembar judul={f.judul} berupa={berupa} komptabel={labelKomptabel}
          skpd={skpd} periode={judulPeriode} tahun={tahun} />
        <table className="w-full table-fixed border-collapse text-[6.5px] leading-tight">
          <colgroup>
            {Array.from({ length: SEL_KODE }, (_, i) => (
              <col key={i} style={{ width: `${lebarKodeBlok(f) / SEL_KODE}%` }} />
            ))}
            {f.kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
          </colgroup>
          <Thead kolomList={f.kolom} />
          <tbody>
            {baris.map((b, i) => b.tipe === 'grup' ? (
              // Baris kelompok: kode sedalam tingkatnya, namanya, lalu HANYA
              // kolom Total Nilai yang berisi — begitu bentuk lembar aslinya.
              <tr key={`g${i}`} className="font-bold italic">
                <SelKode kode={b.kode} sampai={b.seg} tebal />
                {f.kolom.map((k, j) => (
                  <td key={k.key} className={`border border-black px-1 py-0.5 ${rata(k)}`}>
                    {j === 0 ? nama(b.kode) || b.kode
                      : j === iTotal ? <>{formatRupiah(b.nilai)} ({b.penanda})</>
                        : ''}
                  </td>
                ))}
              </tr>
            ) : (
              <tr key={`i${b.data.id}`} className="align-top">
                <SelKode kode={b.kode} sampai={SEL_KODE} />
                {f.kolom.map(k => (
                  <td key={k.key}
                    className={`border border-black px-1 py-0.5 ${rata(k)} ${k.key === 'nibar' ? 'break-all tracking-tight' : 'break-words'}`}>
                    {isiKolom(k, b.data)}
                  </td>
                ))}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={nKolom} className="border border-black px-1 py-3 text-center">
                Tidak ada perolehan pada periode ini.
              </td></tr>
            )}
          </tbody>
        </table>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null}
          tgl={tglTtd} nomor={f.kaki} />
      </section>
    )
  }

  // ── Lembar REKAP (IV.A.<n>.3–6) ───────────────────────────────────────────
  function LembarRekap({ akhiran, seg, menurut }: { akhiran: number; seg: number; menurut: string }) {
    const baris = susunRekap(items, seg)
    const total = totalSemua(items)
    // Hanya IV.A.<n>.6 yang punya kolom No & baris JUMLAH (14).
    const pakaiNo = akhiran === 6
    const kolomKode = SEL_KODE - 1 // rekap paling dalam 6 segmen
    return (
      <section className="break-before-page">
        <p className="text-right text-[12px] mb-1">Format {f.awalan}.{akhiran}</p>
        <KopLembar judul={f.judul.replace('LAPORAN ', 'REKAPITULASI ')} berupa={berupa}
          komptabel={labelKomptabel} skpd={skpd} periode={judulPeriode} tahun={tahun}
          tambahan={`MENURUT ${menurut}`} />
        <table className="w-full table-fixed border-collapse text-[8px] leading-tight">
          <colgroup>
            {pakaiNo && <col style={{ width: '4%' }} />}
            {Array.from({ length: kolomKode }, (_, i) => (
              <col key={i} style={{ width: `${26 / kolomKode}%` }} />
            ))}
            <col style={{ width: pakaiNo ? '42%' : '46%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              {pakaiNo && <th className="border border-black px-1 py-1" rowSpan={2}>No</th>}
              <th className="border border-black px-1 py-1" colSpan={kolomKode + 1}>
                Penggolongan dan Kodefikasi Barang
              </th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah Barang</th>
              <th className="border border-black px-1 py-1" rowSpan={2}>Jumlah (Rp)</th>
            </tr>
            <tr className="text-center font-semibold">
              <th className="border border-black px-1 py-1" colSpan={kolomKode}>Kode Barang</th>
              <th className="border border-black px-1 py-1">Nama Barang</th>
            </tr>
            <tr className="text-center italic">
              {pakaiNo && <td className="border border-black px-1">(9)</td>}
              <td className="border border-black px-1" colSpan={kolomKode}>({pakaiNo ? 10 : 9})</td>
              <td className="border border-black px-1">({pakaiNo ? 11 : 10})</td>
              <td className="border border-black px-1">({pakaiNo ? 12 : 11})</td>
              <td className="border border-black px-1">({pakaiNo ? 13 : 12})</td>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className={b.seg <= 3 ? 'font-bold' : ''}>
                {pakaiNo && (
                  <td className="border border-black px-1 py-0.5 text-center">
                    {b.seg === seg ? `${baris.filter(x => x.seg === seg).indexOf(b) + 1}.` : ''}
                  </td>
                )}
                {Array.from({ length: kolomKode }, (_, j) => (
                  <td key={j} className="border border-black px-0.5 py-0.5 text-center">
                    {j < b.seg ? (segmenKode(b.kode)[j] ?? '') : ''}
                  </td>
                ))}
                <td className="border border-black px-1 py-0.5 break-words">{nama(b.kode) || b.kode}</td>
                <td className="border border-black px-1 py-0.5 text-right">{b.jumlah}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(b.nilai)}</td>
              </tr>
            ))}
            {baris.length === 0 && (
              <tr><td colSpan={kolomKode + 3 + (pakaiNo ? 1 : 0)}
                className="border border-black px-1 py-3 text-center">
                Tidak ada perolehan pada periode ini.
              </td></tr>
            )}
            {pakaiNo && (
              <tr className="font-bold">
                <td className="border border-black px-1 py-0.5 text-center" colSpan={kolomKode + 2}>
                  JUMLAH (14)
                </td>
                <td className="border border-black px-1 py-0.5 text-right">{total.jumlah}</td>
                <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(total.nilai)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null}
          tgl={tglTtd} nomor={f.kaki} />
      </section>
    )
  }


  return (
    <>
      <LembarRinci />
      {TANGGA_REKAP.map(t => (
        <LembarRekap key={t.akhiran} akhiran={t.akhiran} seg={t.seg} menurut={t.menurut} />
      ))}
    </>
  )
}
