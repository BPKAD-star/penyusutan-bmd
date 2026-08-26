'use client'
// ============================================================================
// Lembar cetak "Berita Acara Rekonsiliasi" — Format V.2 Permendagri 47/2021.
//
// PRESENTER MURNI: tak satu pun query di berkas ini. Angkanya diterima sebagai
// props dari halaman Rekonsiliasi (`snapAwal`, `snapAkhir`, `mutasi`) — hasil
// "Proses" yang sedang tampil di layar.
//
// ⚠️ SENGAJA BUKAN rute `/cetak/...` terpisah, dan bukan kemalasan. Seluruh
// angka di sini lahir dari `fetchRekonRekap` + `fetchMutasiLines` +
// `attribusiLines` yang mahal (30 dtk untuk Dinas Pendidikan) dan bergantung
// pada `descendantIds` hasil SkpdCombobox — subtree Diknas saja 694 id, tak
// mungkin dititipkan lewat URL. Menghitungnya ulang di halaman lain membuka
// celah lembar bertanda tangan yang berbeda dari layar. Alasan yang sama sudah
// dipakai "Export PDF / Cetak" tabel Rekonsiliasi (CLAUDE.md).
//
// Halamannya: lembar depan → Lampiran 1 Saldo Awal → Lampiran 2 Saldo Akhir →
// satu lembar per JENIS ASET YANG PUNYA TRANSAKSI. Blok tanda tangan lampiran
// menempel di akhir lembar TERAKHIR, persis seperti formatnya.
//
// Kolom "Sesuai / Tidak Sesuai" & "Disetujui / Perbaikan" DIBIARKAN KOSONG untuk
// dicentang tangan saat rekonsiliasi berlangsung. Aplikasi ini cuma memegang
// data SATU pihak (kolom nilai itu memang berjudul "Laporan BMD Pengguna
// Barang"); mencentangnya sendiri berarti menyatakan pihak seberang setuju
// padahal datanya tak pernah dilihat.
// ============================================================================
import { Fragment, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import type { Mutasi, Snapshot } from '@/lib/rekon'
import {
  KOMPS_DARI, LABEL_CAKUPAN, adaTransaksiBA, barisSaldoBA, barisTrxBA, butirCatatan,
  catatanSelisihBA, kalimatTanggal, labelSemester, selBA, tanggalCutoff, tglPanjang,
  totalTrxBA, varianInfo, type KonfigBA, type PihakBA,
} from '@/lib/beritaAcaraRekon'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const TITIK = '…………………………………'

const TH = ({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) =>
  <th {...rest} className={`border border-black px-1.5 py-1 font-semibold align-middle ${className}`}>{children}</th>
const TD = ({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) =>
  <td {...rest} className={`border border-black px-1.5 py-1 align-top ${className}`}>{children}</td>

/** Sel angka: `null` → dibiarkan KOSONG (pos yang aplikasi ini tak catat), bukan 0. */
const Rp = ({ v }: { v: number | null }) => (
  <span className="tabular-nums">{v == null ? '' : angka(v)}</span>
)

const BarisIsian = ({ label, isi }: { label: string; isi: string }) => (
  <tr>
    <td className="pr-3 align-top whitespace-nowrap">{label}</td>
    <td className="pr-1 align-top">:</td>
    <td className="align-top">{isi || TITIK}</td>
  </tr>
)

function BlokPihak({ romawi, pihak }: { romawi: 'I' | 'II'; pihak: PihakBA }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 flex-shrink-0 text-right">{romawi}.</div>
      <div className="flex-1">
        <table className="mb-2">
          <tbody>
            <BarisIsian label="Nama" isi={pihak.nama} />
            <BarisIsian label="NIP" isi={pihak.nip} />
            <BarisIsian label="Pangkat/Gol" isi={pihak.pangkat} />
            <BarisIsian label="Jabatan" isi={pihak.jabatan} />
          </tbody>
        </table>
        <p>
          Dalam hal ini bertindak sebagai <b>{pihak.sebagai}</b>, selanjutnya sebagai{' '}
          <b>{romawi === 'I' ? 'PIHAK PERTAMA' : 'PIHAK KEDUA'}</b>.
        </p>
      </div>
    </div>
  )
}

/** Blok tanda tangan — PIHAK KEDUA di KIRI, PIHAK PERTAMA di KANAN (Format V.2). */
function BlokTtd({ pertama, kedua }: { pertama: PihakBA; kedua: PihakBA }) {
  const kolom = (judul: string, p: PihakBA) => (
    <div className="text-center w-64">
      <p className="mb-16">{judul}</p>
      <p className="font-semibold underline">{p.nama || '(…………………………………)'}</p>
      <p>NIP. {p.nip || '…………………………'}</p>
    </div>
  )
  return (
    <div className="flex justify-around mt-8 break-inside-avoid">
      {kolom('PIHAK KEDUA', kedua)}
      {kolom('PIHAK PERTAMA', pertama)}
    </div>
  )
}

/** (15) Catatan Hasil Rekonsiliasi. Kosong → baris titik-titik untuk diisi
 *  tangan, persis seperti lembar formatnya. */
function Catatan({ butir }: { butir: string[] }) {
  return (
    <div className="mt-3 break-inside-avoid">
      <p className="mb-1">Catatan Hasil Rekonsiliasi :</p>
      {butir.length > 0
        ? butir.map((b, i) => (
          <p key={i} className="flex gap-2 leading-snug">
            <span className="w-5 flex-shrink-0 text-right">{i + 1}.</span>
            <span className="flex-1">{b}</span>
          </p>
        ))
        : ['1.', '2.', 'dst'].map(n => (
          <p key={n} className="flex gap-2 items-end">
            <span className="w-5 flex-shrink-0 text-right">{n}</span>
            <span className="flex-1 border-b border-dotted border-gray-600 h-4" />
          </p>
        ))}
    </div>
  )
}

export default function BeritaAcaraRekon({ konfig, periode, namaSkpd, snapAwal, snapAkhir, mutasi }: {
  konfig: KonfigBA
  periode: string
  namaSkpd: string
  snapAwal: Snapshot
  snapAkhir: Snapshot
  mutasi: Mutasi
}) {
  const v = varianInfo(konfig.varian)
  const komps = KOMPS_DARI[konfig.cakupan]
  const tgl = kalimatTanggal(konfig.tanggal)
  const cutoff = tanggalCutoff(periode)
  const ttd = <BlokTtd pertama={konfig.pertama} kedua={konfig.kedua} />

  const lembarTrx = GOLONGAN_REKAP
    .map(g => ({ g, sel: selBA(mutasi, g.kode, komps) }))
    .filter(x => adaTransaksiBA(x.sel))

  // ⚠️ Selisih yang tak punya baris di Format V.2 WAJIB ikut tercetak.
  // Daftar LENGKAPnya ditaruh di lampiran Saldo Akhir — bukan cuma di lembar
  // per jenis aset — karena golongan yang selisihnya lahir dari reklasifikasi
  // komptabel Intra↔Ekstra sering TIDAK punya satu pun baris mutasi, jadi ia
  // tak kebagian lembar sendiri dan catatannya akan hilang tanpa jejak.
  const catatanSelisih = catatanSelisihBA(snapAwal, snapAkhir, mutasi, komps)

  const kepalaLampiran = (
    <div className="flex justify-end mb-4">
      <table>
        <tbody>
          <tr><td colSpan={3} className="pb-0.5">Lampiran</td></tr>
          <BarisIsian label="Nomor" isi={konfig.nomor} />
          <BarisIsian label="Tanggal" isi={tglPanjang(konfig.tanggal)} />
        </tbody>
      </table>
    </div>
  )

  /** Tabel Saldo Awal / Saldo Akhir (Format V.2 kolom (9)–(14)). */
  const tabelSaldo = (snap: Snapshot) => (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[7%]" /><col className="w-[41%]" /><col className="w-[18%]" />
        <col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[16%]" />
      </colgroup>
      <thead>
        <tr className="text-center">
          <TH>No.</TH>
          <TH>Uraian</TH>
          <TH>{v.kolomNilai}</TH>
          <TH>Sesuai (√)</TH>
          <TH>Tidak Sesuai (√)</TH>
          <TH>Keterangan</TH>
        </tr>
      </thead>
      <tbody>
        {barisSaldoBA(snap, komps).map((b, i) => (
          <tr key={i} className={b.judul ? 'font-semibold' : ''}>
            <TD className="text-center">{b.no}</TD>
            <TD className={b.indent ? 'pl-6' : ''}>{b.uraian}</TD>
            <TD className="text-right"><Rp v={b.nilai} /></TD>
            <TD /><TD /><TD />
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    // `hidden` di layar: lembar ini cuma untuk kertas. Print CSS di halaman
    // Rekonsiliasi yang menyalakannya (`display:block !important`).
    <div id="cetak-ba" className="hidden text-[11px] leading-relaxed text-black">

      {/* ── Lembar depan ─────────────────────────────────────────────────── */}
      <section className="lembar">
        <div className="text-center border-b-2 border-black pb-2 mb-6">
          {/* `|| []` bukan basa-basi: konfigurasi ini bisa datang dari
              localStorage yang ditulis versi kode lain, dan kop yang hilang
              tak boleh menjatuhkan seluruh lembarnya. */}
          {(konfig.kop || []).filter(Boolean).map((baris, i) => (
            <p key={i} className={`font-bold uppercase ${i === 0 ? 'text-[13px]' : 'text-[12px]'}`}>{baris}</p>
          ))}
        </div>

        <div className="text-center mb-6">
          <p className="font-bold text-[13px] tracking-wide">BERITA ACARA REKONSILIASI</p>
          <p className="font-bold">Nomor : {konfig.nomor || TITIK}</p>
        </div>

        <p className="mb-4 text-justify">
          Pada hari ini <b>{tgl.hari || '…………'}</b> tanggal <b>{tgl.tanggal || '…………'}</b> bulan{' '}
          <b>{tgl.bulan || '…………'}</b> tahun <b>{tgl.tahun || '…………'}</b> bertempat di{' '}
          <b>{konfig.tempat || '…………'}</b>, yang bertanda tangan di bawah ini :
        </p>

        <BlokPihak romawi="I" pihak={konfig.pertama} />
        <BlokPihak romawi="II" pihak={konfig.kedua} />

        <p className="mb-4 text-justify">
          PIHAK PERTAMA dan PIHAK KEDUA telah melaksanakan rekonsiliasi data BMD dengan membandingkan
          data laporan BMD per <b>{cutoff || TITIK}</b> ({labelSemester(periode)}
          {namaSkpd ? ` — ${namaSkpd}` : ''}). Dengan hasil sebagaimana dalam Lampiran.
        </p>

        <p className="mb-2 text-justify indent-8">
          Demikian Berita Acara Rekonsiliasi dibuat dengan sebenar-benarnya, untuk dapat dipergunakan
          dalam rangka mendukung Laporan BMD.
        </p>

        {ttd}
      </section>

      {/* ── Lampiran 1 — Saldo Awal ──────────────────────────────────────── */}
      <section className="lembar">
        {kepalaLampiran}
        <p className="text-center font-bold mb-1">BERITA ACARA REKONSILIASI</p>
        <p className="text-center mb-4">
          {namaSkpd || 'Pemerintah Kabupaten Kediri'} · {labelSemester(periode)} · {LABEL_CAKUPAN[konfig.cakupan]}
        </p>
        <p className="font-semibold mb-2">1. Saldo Awal</p>
        {tabelSaldo(snapAwal)}
        <Catatan butir={butirCatatan(konfig.catatanAwal)} />
        <p className="mt-3 text-[9px] italic text-gray-700">
          Sel nilai yang dibiarkan kosong (Persediaan, Kemitraan dengan Pihak Ketiga) adalah pos yang tidak
          ditatausahakan pada aplikasi BMD ini — bukan bersaldo nol.
        </p>
      </section>

      {/* ── Lampiran 2 — Saldo Akhir ─────────────────────────────────────── */}
      <section className="lembar">
        <p className="font-semibold mb-2">2. Saldo Akhir</p>
        {tabelSaldo(snapAkhir)}
        <Catatan butir={[...butirCatatan(konfig.catatanAkhir), ...catatanSelisih]} />
        {lembarTrx.length === 0 && (
          <>
            <p className="mt-6 italic">
              Tidak terdapat transaksi BMD pada periode ini, sehingga lampiran rincian per jenis aset nihil.
            </p>
            {ttd}
          </>
        )}
      </section>

      {/* ── Lampiran 3.. — satu lembar per JENIS ASET yang punya transaksi ── */}
      {lembarTrx.map(({ g, sel }, idx) => {
        const total = totalTrxBA(sel)
        return (
          <section key={g.kode} className="lembar">
            <p className="font-semibold mb-2">{idx + 3}. {g.kode} — {g.uraian}</p>
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[5%]" /><col className="w-[34%]" />
                <col className="w-[14%]" /><col className="w-[14%]" />
                <col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="text-center">
                  <TH rowSpan={2}>No.</TH>
                  <TH rowSpan={2}>Uraian</TH>
                  <TH colSpan={2}>Nilai Perolehan (Rp)</TH>
                  <TH colSpan={2}>Hasil Rekonsiliasi</TH>
                  <TH rowSpan={2}>Keterangan</TH>
                </tr>
                <tr className="text-center">
                  <TH>Tambah</TH><TH>Kurang</TH>
                  <TH>Disetujui (√)</TH><TH>Perbaikan (√)</TH>
                </tr>
              </thead>
              <tbody>
                {barisTrxBA(sel).map((b, i) => (
                  <Fragment key={i}>
                    <tr className={b.judul ? 'font-semibold' : ''}>
                      <TD className="text-center">{b.no}</TD>
                      <TD className={b.huruf ? 'pl-5' : ''}>{b.huruf ? `${b.huruf} ` : ''}{b.uraian}</TD>
                      <TD className="text-right"><Rp v={b.tambah} /></TD>
                      <TD className="text-right"><Rp v={b.kurang} /></TD>
                      <TD /><TD /><TD />
                    </tr>
                    {/* (16)(24) — angka LRA DIKETIK operator; aplikasi ini tak
                        menautkan lembar ini ke menu LRA, dan mengarang angka
                        realisasi di dokumen yang akan diteken jauh lebih
                        berbahaya daripada titik-titik yang jelas belum diisi. */}
                    {b.lra && (
                      <tr>
                        <TD />
                        <TD className="pl-10 italic">
                          LRA {konfig.lraKode || '……………………'} &nbsp;&nbsp; Rp. {konfig.lraNilai || '……………………'}
                        </TD>
                        <TD /><TD /><TD /><TD /><TD />
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr className="font-semibold">
                  <TD />
                  <TD>JUMLAH</TD>
                  <TD className="text-right"><Rp v={total.tambah} /></TD>
                  <TD className="text-right"><Rp v={total.kurang} /></TD>
                  <TD /><TD /><TD />
                </tr>
              </tbody>
            </table>
            <Catatan butir={[
              ...butirCatatan(konfig.catatanTrx),
              // Selisih golongan INI saja — daftar lengkapnya sudah ada di
              // lampiran Saldo Akhir; mengulang golongan lain di lembar ini
              // justru menyesatkan pembacanya.
              ...catatanSelisih.filter(c => c.startsWith(`${g.kode} `)),
            ]} />
            {idx === lembarTrx.length - 1 && ttd}
          </section>
        )
      })}
    </div>
  )
}
