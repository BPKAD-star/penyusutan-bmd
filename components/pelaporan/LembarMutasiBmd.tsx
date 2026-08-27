'use client'
// Lembar REKAPITULASI MUTASI TAMBAH DAN KURANG BMD — Permendagri 47/2021
// Format IV.L.4.1 (per SKPD) & IV.L.4.3 (se-pemda). Keduanya satu komponen:
// susunan barisnya sama, yang beda cuma kop & blok tanda tangan.
//
// ⚠️ DIRENDER DI HALAMAN Laporan BMD, BUKAN di rute /cetak terpisah — beda
// dari Format IV.L.4.2/4.4. Alasannya sama persis dgn Berita Acara
// Rekonsiliasi (CLAUDE.md): angka mutasinya lahir dari `prosesMutasi()` yang
// panjang & mahal (snapshot dua periode + enam kolektor ledger + pembuangan
// baris `batal_*`), dan menghitungnya ulang di halaman kedua membuka celah
// lembar bertanda tangan yang BERBEDA dari yang dilihat operator di layar.
// Lembar posisi (4.2/4.4) boleh berdiri sendiri karena angkanya cuma satu
// panggilan RPC.
//
// Di layar `hidden`; print CSS di halaman induk yang menyalakannya.
import {
  BARIS_LAPORAN_BMD, nilaiBarisMutasi, labelKomptabel, pecahPeriode,
  type SumberMutasi,
} from '@/lib/laporanBmdFormat'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

const angka = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v || 0)
const kurung = (v: number) => `(${angka(v)})`

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
/** Diurai manual — `new Date(iso)` dibaca sbg UTC & di zona negatif tanggalnya
 *  mundur sehari; lembar bertanda tangan tak boleh bergeser karena zona waktu. */
function tglPanjang(s: string): string {
  const [y, m, d] = (s || '').slice(0, 10).split('-')
  const bln = BULAN[Number(m) - 1]
  return y && bln && d ? `${Number(d)} ${bln} ${y}` : ''
}

export type PenandaTangan = { nama: string; nip: string | null } | null

export type KonfigMutasi = {
  /** 'skpd' → IV.L.4.1 (kop menyebut SKPD, satu tanda tangan);
   *  'pemda' → IV.L.4.3 (kop menyebut provinsi/kabupaten, dua tanda tangan). */
  lingkup: 'skpd' | 'pemda'
  namaSkpd: string
  kodeLokasi: string
  /** Sebutan penanda tangan tunggal (IV.L.4.1) — ikut level SKPD. */
  sebutan: string
  tanggal: string
  ttd: PenandaTangan
  /** Hanya IV.L.4.3 — blok kiri "Mengetahui, Pengelola Barang". */
  ttdKiri: PenandaTangan
}

export default function LembarMutasiBmd({ periode, komptabel, sumber, konfig }: {
  periode: string
  komptabel: string
  sumber: SumberMutasi
  konfig: KonfigMutasi
}) {
  const { semester, tahun } = pecahPeriode(periode)
  const perSkpd = konfig.lingkup === 'skpd'
  const titik = '…………………………………………'

  return (
    <div id="cetak-mutasi-bmd" className="hidden text-[11px] text-black">
      <div className="text-center leading-tight mb-4">
        <p className="font-bold text-[13px]">
          {perSkpd
            ? 'REKAPITULASI MUTASI TAMBAH DAN MUTASI KURANG LAPORAN BMD'
            : 'REKAPITULASI MUTASI TAMBAH DAN KURANG BMD'}
        </p>
        <p className="font-bold text-[12px]">{labelKomptabel(komptabel)}</p>
        <p className="font-bold text-[12px] uppercase">
          {perSkpd ? konfig.namaSkpd : `Provinsi ${PROVINSI}, Kabupaten ${KABUPATEN}`}
        </p>
        <p className="font-bold text-[12px]">SEMESTER {semester || '……'}</p>
        <p className="font-bold text-[12px]">TAHUN {tahun || '……'}</p>
      </div>

      {/* Blok identitas HANYA di lembar per-SKPD — di lembar se-pemda
          provinsi/kabupatennya sudah disebut di kop (sesuai lampiran). */}
      {perSkpd && (
        <table className="mb-3 text-[11px]">
          <tbody>
            <tr><td className="pr-8 py-0.5">Kode Lokasi</td><td>: {konfig.kodeLokasi || '…………………'}</td></tr>
            <tr><td className="pr-8 py-0.5">Provinsi</td><td>: {PROVINSI}</td></tr>
            <tr><td className="pr-8 py-0.5">Kabupaten/Kota</td><td>: {KABUPATEN}</td></tr>
          </tbody>
        </table>
      )}

      {/* A4 POTRET (permintaan user 2026-08-27) — kolom angka dibuat lebih
          lega & font 8px supaya nilai terpanjang (17 digit, mis.
          4.976.717.582.306) muat SEBARIS. Lebar cetak potret ±703px pada
          margin 1,2cm; 17% ≈ 119px, sedangkan 17 digit @8px ≈ 75px. */}
      <table className="tabel-mutasi w-full table-fixed border-collapse text-[8px]">
        <colgroup>
          <col className="w-[3%]" /><col className="w-[3%]" /><col className="w-[3%]" />
          <col className="w-[23%]" />
          <col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" />
        </colgroup>
        <thead>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" colSpan={4}>Penggolongan dan Kodefikasi Barang</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Saldo awal (Rp)</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Bertambah (Rp)</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Berkurang (Rp)</th>
            <th className="border border-black px-1 py-1" rowSpan={2}>Saldo akhir (Rp)</th>
          </tr>
          <tr className="text-center font-semibold">
            <th className="border border-black px-1 py-1" colSpan={3}>Kode Barang</th>
            <th className="border border-black px-1 py-1">Nama Barang</th>
          </tr>
        </thead>
        <tbody>
          {BARIS_LAPORAN_BMD.map(b => {
            const n = nilaiBarisMutasi(b, sumber)
            const akum = b.jenis === 'akumulasi'
            // Akun lawan dicetak dalam kurung di keempat kolom — supaya
            // pembaca melihat langsung bahwa perannya PENGURANG, termasuk
            // pada kolom mutasi (yang di lampiran contoh dibiarkan "–";
            // lihat catatan `nilaiBarisMutasi`).
            const sel = (v: number | null) =>
              v == null ? '–' : akum ? kurung(v) : angka(v)
            return (
              <tr key={b.kode.join('.') + b.nama} className={b.jenis === 'kelompok' ? 'font-bold' : ''}>
                {b.kode.map((k, i) => (
                  <td key={i} className="border border-black px-1 py-0.5 text-center">{k}</td>
                ))}
                <td className="border border-black px-1 py-0.5">{b.nama}</td>
                <td className="border border-black px-1 py-0.5 text-right">{sel(n.saldoAwal)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{sel(n.penambahan)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{sel(n.pengurangan)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{sel(n.saldoAkhir)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Yang belum dipilih DIBIARKAN bertitik-titik — mengarang nama di
          dokumen yang akan diteken jauh lebih berbahaya daripada titik-titik
          yang jelas belum diisi. */}
      {perSkpd ? (
        <div className="flex justify-end mt-10">
          <div className="text-center w-72">
            <p>{KABUPATEN}, {tglPanjang(konfig.tanggal)}</p>
            <p>{konfig.sebutan}</p>
            <div className="h-16" />
            <p className="font-semibold underline">{konfig.ttd?.nama || titik}</p>
            <p>Nip. {konfig.ttd?.nip || '…………………………………'}</p>
          </div>
        </div>
      ) : (
        <div className="flex justify-between mt-10">
          <div className="text-center w-72">
            <p>Mengetahui</p>
            <p>Pengelola Barang</p>
            <div className="h-16" />
            <p className="font-semibold underline">{konfig.ttdKiri?.nama || titik}</p>
            <p>Nip. {konfig.ttdKiri?.nip || '…………………………………'}</p>
          </div>
          <div className="text-center w-72">
            <p>{KABUPATEN}, {tglPanjang(konfig.tanggal)}</p>
            <p>Pejabat Penatausahaan Barang</p>
            <div className="h-16" />
            <p className="font-semibold underline">{konfig.ttd?.nama || titik}</p>
            <p>Nip. {konfig.ttd?.nip || '…………………………………'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
