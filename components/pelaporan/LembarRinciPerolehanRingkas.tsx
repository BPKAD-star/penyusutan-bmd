'use client'
// ============================================================================
// Lembar RINCI Perolehan — versi RINGKAS (permintaan user 2026-09-09), dipakai
// GANTI `LembarRinci` (di LembarPerolehanPermendagri.tsx) untuk keempat cara
// perolehan manual (Hibah, Hasil Inventarisasi, Tukar Menukar, Perolehan
// Lainnya) — sepadan dgn tabel `LaporanPengadaanTabel.tsx` yang sudah dulu
// dirampingkan utk Pengadaan (2026-09-09, commit sebelumnya).
//
// Bedanya dari `LembarRinci` yang lama (masih dipakai lembar REKAP .3–.6,
// TIDAK disentuh berkas ini): kode barang TAK dipecah per segmen (7 sel kotak
// bernomor), tanpa super-header "Penggolongan dan Kodefikasi Barang", satu
// baris kepala tabel, satu tingkat pengelompokan (per golongan 3-segmen +
// subtotal + TOTAL — bukan tangga bertingkat `susunRinci`), border ABU-ABU
// (bukan hitam pekat), warna PLAIN (tanpa fill/font berwarna) — biar seragam
// dgn tabel Pengadaan. KopLembar & BlokTtd tetap DIPAKAI BERSAMA (diekspor
// dari LembarPerolehanPermendagri.tsx) supaya kop & blok tanda tangan
// KEDUANYA kelak tak bisa menyimpang sendiri-sendiri.
//
// ⚠️ HANYA LEMBAR RINCI (akhiran .2). Rekap tangga (.3–.6) TIDAK diminta &
// TIDAK disentuh — tetap lembar official (`LembarRinci`'s sibling `LembarRekap`
// di LembarPerolehanPermendagri.tsx).
// ============================================================================
import { Fragment } from 'react'
import { formatRupiah } from '@/lib/export'
import { kodeLevel3 } from '@/lib/bmd'
import { pecahNibar } from '@/lib/kodeRegister'
import { KopLembar, BlokTtd, type BarisLembar } from './LembarPerolehanPermendagri'
import type { FormatPerolehan, ItemLaporan } from '@/lib/formatPermendagri'

const brd = 'border border-gray-400'
const th = `${brd} px-1 py-1 text-center font-semibold bg-gray-50`

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/** Satu kolom lembar ringkas. `render` menerima baris ledger+aset. */
type KolomRingkas = {
  key: string
  judul: string
  lebar: number
  rata?: 'kanan' | 'tengah'
  render: (r: BarisLembar) => React.ReactNode
}

const nowrap = (v: string) => <span className="whitespace-nowrap">{v}</span>

/** Sel "Kode Barang / Uraian Barang" ditumpuk — pola sama dgn Pengadaan,
 *  Daftar Barang & Penyusutan. `uraian` = nama baku kodefikasi (via
 *  `namaTingkat`), cadangan `aset.uraian_barang` kalau kodefikasinya belum
 *  terdaftar. */
function kolKodeUraian(namaTingkat: Map<string, string>): KolomRingkas {
  return {
    key: 'kode', judul: 'Kode Barang / Uraian Barang', lebar: 0,
    render: r => {
      const a = r.aset!
      const uraian = namaTingkat.get(a.kode) || a.uraian_barang || ''
      return (
        <>
          <p className="font-medium whitespace-nowrap">{a.kode}</p>
          {uraian && <p className="text-gray-500">{uraian}</p>}
        </>
      )
    },
  }
}

/** Sel "Spesifikasi Nama Barang / NIBAR" ditumpuk. NIBAR dipenggal di batas
 *  segmen (`pecahNibar`) — warisan e-BMD yang susunannya beda (`null`) tetap
 *  ditampilkan utuh, jangan ditebak. */
const kolSpekNibar: KolomRingkas = {
  key: 'spek', judul: 'Spesifikasi Nama Barang / NIBAR', lebar: 0,
  render: r => {
    const a = r.aset!
    const p = pecahNibar(a.nibar)
    return (
      <>
        <p>{a.nama_barang || ''}</p>
        <p className="text-gray-500 break-all text-[6.5px] tracking-tighter">
          {p ? <>{p[0]}<br />{p[1]}</> : (a.nibar || '')}
        </p>
      </>
    )
  },
}

const kolMerekTipe: KolomRingkas = { key: 'merek', judul: 'Merk / Tipe', lebar: 0, render: r => r.aset!.merek_tipe || '' }
const kolSpekLain: KolomRingkas = { key: 'spek_lain', judul: 'Spesifikasi Lainnya', lebar: 0, render: r => r.aset!.spesifikasi_lainnya || '' }
const kolSatuan: KolomRingkas = { key: 'satuan', judul: 'Satuan Barang', lebar: 0, rata: 'tengah', render: r => r.aset!.satuan || '' }
const kolJumlah: KolomRingkas = { key: 'jumlah', judul: 'Jumlah Barang', lebar: 0, rata: 'kanan', render: r => String(r.aset!.jumlah ?? 1) }
const kolHarga: KolomRingkas = { key: 'harga', judul: 'Harga Satuan', lebar: 0, rata: 'kanan', render: r => formatRupiah(r.aset!.harga_satuan ?? r.nilai) }
const kolTotal: KolomRingkas = { key: 'total', judul: 'Total Nilai Barang', lebar: 0, rata: 'kanan', render: r => formatRupiah(r.nilai) }
const kolKondisi: KolomRingkas = { key: 'kondisi', judul: 'Kondisi', lebar: 0, rata: 'tengah', render: r => r.aset!.kondisi_barang || '' }
const kolPihakHibah: KolomRingkas = { key: 'pihak', judul: 'Pihak Pemberi Hibah', lebar: 0, render: r => r.header?.payload?.pihak || '' }
const kolPihakTukar: KolomRingkas = { key: 'pihak', judul: 'Pihak Tukar Menukar', lebar: 0, render: r => r.header?.payload?.pihak || '' }
const kolSumberDana: KolomRingkas = { key: 'sumber_dana', judul: 'Sumber Dana', lebar: 0, render: r => r.header?.payload?.sumber_dana || '' }
// ⚠️ "Tanggal Pengadaan" = `aset.tgl_perolehan`, kapan barang itu DIBUAT —
// bisa jauh sebelum BAST/dokumen serah terima untuk barang bekas. Jangan
// disamakan dgn kolom dokumen di bawahnya.
const kolTglPengadaan: KolomRingkas = { key: 'tgl_pengadaan', judul: 'Tanggal Pengadaan', lebar: 0, rata: 'tengah', render: r => nowrap(tglID(r.aset!.tgl_perolehan)) }
const kolNoBast: KolomRingkas = { key: 'no_bast', judul: 'Nomor BAST', lebar: 0, render: r => r.header?.no_sk || '' }
const kolTglBast: KolomRingkas = { key: 'tgl_bast', judul: 'Tanggal BAST', lebar: 0, rata: 'tengah', render: r => nowrap(tglID(r.tanggal)) }
const kolDokHasilInv: KolomRingkas = { key: 'dok', judul: 'Dokumen Hasil Inventarisasi', lebar: 0, render: r => r.header?.no_sk || '' }
const kolDokSumber: KolomRingkas = { key: 'dok', judul: 'Dokumen Sumber', lebar: 0, render: r => r.header?.no_sk || '' }
const kolDokTukar: KolomRingkas = { key: 'dok', judul: 'Dokumen Tukar Menukar', lebar: 0, render: r => r.header?.no_sk || '' }
const kolTglDokumen: KolomRingkas = { key: 'tgl_dok', judul: 'Tanggal Dokumen', lebar: 0, rata: 'tengah', render: r => nowrap(tglID(r.tanggal)) }
// ⚠️ `aset.keterangan` (diisi operator lewat field spesifikasi) DIDAHULUKAN —
// `transaksi_bmd.keterangan` (ledger perolehan) SELALU KOSONG, cadangan saja.
// Pola & alasan persis app/cetak/perolehan/page.tsx (2026-08-20).
const kolKeterangan: KolomRingkas = { key: 'ket', judul: 'Keterangan', lebar: 0, render: r => r.aset!.keterangan || r.keterangan || '' }

/**
 * Lebar tiap kolom, dalam persen — indeks 0..8 (Kode/Uraian .. Kondisi) SAMA
 * urutannya & SAMA lebarnya di keempat jenis, supaya `SubtotalRow`/`TotalRow`
 * generik di bawah bisa menghitung colSpan-nya sekali untuk semuanya.
 * Sisanya (9+) beda per jenis, dihitung agar total selalu tepat 100.
 */
const LEBAR_DASAR = [12, 12, 8, 8, 3.5, 3, 6.5, 6.5, 3.5] // Kode/Uraian..Kondisi, Σ=63

/** Bagi sisa (100 − Σ LEBAR_DASAR) rata ke N kolom sisa, pembulatan ke kolom
 *  TERAKHIR (Keterangan) supaya totalnya presisi 100. */
function beriLebar(kolom: KolomRingkas[], sisaLebar: number[]): KolomRingkas[] {
  return kolom.map((k, i) => ({ ...k, lebar: i < LEBAR_DASAR.length ? LEBAR_DASAR[i] : sisaLebar[i - LEBAR_DASAR.length] }))
}

/** Susunan kolom per jenis cara perolehan. `null` = jenis ini tak punya
 *  lembar ringkas (dipakai `LembarRinci` lama, kalau ada jenis baru kelak). */
export function kolomRingkas(jenis: string, namaTingkat: Map<string, string>): KolomRingkas[] | null {
  const kode = kolKodeUraian(namaTingkat)
  switch (jenis) {
    case 'hibah_masuk':
      return beriLebar(
        [kode, kolSpekNibar, kolMerekTipe, kolSpekLain, kolSatuan, kolJumlah, kolHarga, kolTotal, kolKondisi,
          kolPihakHibah, kolSumberDana, kolTglPengadaan, kolNoBast, kolTglBast, kolKeterangan],
        [7, 3, 4.5, 12, 4.5, 6]) // Pihak, Sumber Dana, Tgl Pengadaan, No BAST, Tgl BAST, Keterangan = 37
        // ⚠️ Nomor BAST diberi PALING LEBAR di kelompok ini (12) — isinya
        // nomor dokumen SKPD lengkap ("KN.01.06/B.VI/SOPHI/2556/2026 -
        // 400.7.3.2/12081/418.25/2026", 60+ karakter), yang di lebar sempit
        // membungkus 3 baris & memaksa SELURUH baris ikut setinggi itu.
    case 'hasil_inventarisasi':
      return beriLebar(
        [kode, kolSpekNibar, kolMerekTipe, kolSpekLain, kolSatuan, kolJumlah, kolHarga, kolTotal, kolKondisi,
          kolTglPengadaan, kolDokHasilInv, kolTglDokumen, kolKeterangan],
        [4.5, 13, 4.5, 15]) // Tgl Pengadaan, Dokumen, Tgl Dokumen, Keterangan = 37
    case 'perolehan_lainnya':
      return beriLebar(
        [kode, kolSpekNibar, kolMerekTipe, kolSpekLain, kolSatuan, kolJumlah, kolHarga, kolTotal, kolKondisi,
          kolTglPengadaan, kolDokSumber, kolTglDokumen, kolKeterangan],
        [4.5, 13, 4.5, 15])
    case 'tukar_menukar':
      return beriLebar(
        [kode, kolSpekNibar, kolMerekTipe, kolSpekLain, kolSatuan, kolJumlah, kolHarga, kolTotal, kolKondisi,
          kolPihakTukar, kolTglPengadaan, kolDokTukar, kolTglDokumen, kolKeterangan],
        [8, 4.5, 12, 4.5, 8]) // Pihak, Tgl Pengadaan, Dokumen, Tgl Dokumen, Keterangan = 37
    default:
      return null
  }
}

function kelompokkan(items: ItemLaporan<BarisLembar>[]) {
  const map = new Map<string, ItemLaporan<BarisLembar>[]>()
  for (const it of items) {
    const g = kodeLevel3(it.kode)
    const arr = map.get(g) || []; arr.push(it); map.set(g, arr)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kode, rows]) => ({
      kode, rows,
      jumlah: rows.reduce((s, r) => s + (r.data.aset?.jumlah ?? 1), 0),
      subtotal: rows.reduce((s, r) => s + r.nilai, 0),
    }))
}

export type PropRinciRingkas = {
  f: FormatPerolehan
  items: ItemLaporan<BarisLembar>[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  berupa: string
  labelKomptabel: string
  judulPeriode: string
  tahun: string
  sebutan: string
  ttd: { nama: string; nip: string | null } | null
  tglTtd: string
}

export default function LembarRinciPerolehanRingkas(p: PropRinciRingkas) {
  const { f, items, namaTingkat, skpd, berupa, labelKomptabel, judulPeriode, tahun, sebutan, ttd, tglTtd } = p
  const kolom = kolomRingkas(f.jenis, namaTingkat)
  if (!kolom) return null
  const nama = (kode: string) => namaTingkat.get(kode) || kode
  const grup = kelompokkan(items)
  const total = items.reduce((s, r) => s + r.nilai, 0)
  const totalJml = items.reduce((s, r) => s + (r.data.aset?.jumlah ?? 1), 0)
  const nKolom = kolom.length
  // Kolom Satuan (indeks 4) itu batas kolom "dasar": label subtotal/total
  // menutup Kode/Uraian..Satuan (5 kolom), lalu Jumlah, Harga (kosong), Total,
  // lalu Kondisi + sisa kolom (beda per jenis) kosong.
  const IDX_JUMLAH = 5, IDX_HARGA = 6, IDX_TOTAL = 7
  const sisaSetelahTotal = nKolom - IDX_TOTAL - 1

  return (
    <section className="lembar-rinci">
      <p className="text-right text-[12px] mb-1">Format {f.kode}</p>
      <KopLembar judul={f.judul} berupa={berupa} komptabel={labelKomptabel}
        sebutan={sebutan} skpd={skpd} periode={judulPeriode} tahun={tahun} />
      <table className="w-full table-fixed border-collapse text-[8px] leading-tight">
        <colgroup>
          {kolom.map(k => <col key={k.key} style={{ width: `${k.lebar}%` }} />)}
        </colgroup>
        <thead>
          <tr>{kolom.map(k => <th key={k.key} className={th}>{k.judul}</th>)}</tr>
        </thead>
        <tbody>
          {grup.map(g => (
            <Fragment key={g.kode}>
              <tr className="bg-teal/5">
                <td className={`${brd} px-1 py-1 font-semibold`} colSpan={nKolom}>{g.kode} — {nama(g.kode)}</td>
              </tr>
              {g.rows.map(it => (
                <tr key={`i-${it.data.id}`} className="align-top">
                  {kolom.map(k => (
                    <td key={k.key}
                      className={`${brd} px-1 py-0.5 break-words ${k.rata === 'kanan' ? 'text-right' : k.rata === 'tengah' ? 'text-center' : ''}`}>
                      {k.render(it.data)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className={`${brd} px-1 py-0.5 text-right`} colSpan={IDX_JUMLAH}>Jumlah {nama(g.kode)}</td>
                <td className={`${brd} px-1 py-0.5 text-right`}>{g.jumlah}</td>
                <td className={`${brd} px-1 py-0.5`} />
                <td className={`${brd} px-1 py-0.5 text-right`}>{formatRupiah(g.subtotal)}</td>
                {sisaSetelahTotal > 0 && <td className={brd} colSpan={sisaSetelahTotal} />}
              </tr>
            </Fragment>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={nKolom} className={`${brd} px-1 py-3 text-center`}>Tidak ada perolehan pada periode ini.</td></tr>
          )}
          <tr className="bg-gray-200 font-bold">
            <td className={`${brd} px-1 py-0.5 text-right`} colSpan={IDX_JUMLAH}>TOTAL</td>
            <td className={`${brd} px-1 py-0.5 text-right`}>{totalJml}</td>
            <td className={`${brd} px-1 py-0.5`} />
            <td className={`${brd} px-1 py-0.5 text-right`}>{formatRupiah(total)}</td>
            {sisaSetelahTotal > 0 && <td className={brd} colSpan={sisaSetelahTotal} />}
          </tr>
        </tbody>
      </table>
      <BlokTtd sebutan={sebutan} nama={ttd?.nama || null} nip={ttd?.nip || null} tgl={tglTtd} />
    </section>
  )
}
