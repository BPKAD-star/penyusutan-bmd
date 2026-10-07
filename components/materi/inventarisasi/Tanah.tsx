'use client'
// Materi "Inventarisasi Tanah" — LKI Format III.A.1 (jenis aset 1.3.1).
// Slide yang sama dgn materi Gedung & Bangunan ada di ./Bersama; di sini hanya
// data Tanah + tiga slide yang memang khas Tanah.
//
// ⚠️ Yang ditanyakan LKI untuk Tanah mengikuti `LKI_MATRIX` & `LKI_CONFIG['1.3.1']`
// (lib/inventarisasi.ts): Spesifikasi Lainnya & Luas YA; Merek/Tipe, nomor
// kendaraan, biaya atribusi, "di atas tanah milik", sebab tidak ada TIDAK. Kode
// tujuan reklas dari lib/tindakLanjut.ts. Kalau aturannya berubah, sesuaikan di sini.
import type { ReactNode } from 'react'
import { SlideTerang, Tbl, Poin, Catatan, d } from '../bagian'
import { KartuApp, Contoh } from '../pengadaan/bahan'
import { SeksiMock, SesuaiMock, Radio, Tercatat } from './bahan'
import {
  SampulInv, PetaAlurInv, PenekananInv, LembarKerjaInv, Luas, SimpanFotoInv, SesudahSimpanInv,
  BelumTercatatInv, TemuanInv, DaftarPeriksaInv, TutupInv, type JenisInv, type KartuTiga,
} from './Bersama'

export const MATERI_TANAH = 'Inventarisasi Tanah'

const TANAH: JenisInv = {
  materi: MATERI_TANAH, nama: 'Tanah', kode: '1.3.1', format: 'III.A.1', judul: 'Inventarisasi Tanah',
  tagline: <>Periksa tanah di lapangan —<br />cocokkan <b className="text-navy">luas</b>, <b className="text-navy">titik koordinat</b>, dan <b className="text-navy">foto</b> dengan register.</>,
  lencana: [{ t: '📷 FOTO WAJIB', nada: 'wajib' }, { t: '📍 TITIK KOORDINAT', nada: 'amber' }, { t: '✔ SESUAI / TIDAK SESUAI', nada: 'ok' }],
  contoh: { kode: '1.3.1.01.01.04.001', uraian: 'Tanah Bangunan Kantor Pemerintah', nama: 'Tanah Kantor Kecamatan' },
  kurang: ['Luas — pilih Sesuai atau Tidak Sesuai', 'Titik Koordinat (O) — pilih Sesuai atau Tidak Sesuai', 'Kondisi Barang (K)'],
  isianBaru: [
    'Spesifikasi Nama Barang', 'Spesifikasi Lainnya', 'Provinsi / Kab. / Kec. / Desa', 'Detail Alamat (Jalan)', 'Titik Koordinat',
    'Kondisi Barang', 'Penggunaan', 'Keterangan', 'Jenis Hak', 'Luas',
    'Nomor Dokumen Kepemilikan', 'Tanggal Dokumen Kepemilikan', 'Nama Dokumen Kepemilikan', 'Asal Usul',
  ],
}

// ── 1–4. Pembuka & Lembar Kerja ─────────────────────────────────────────────
export const Sampul = () => <SampulInv j={TANAH} />
export const PetaAlur = () => <PetaAlurInv j={TANAH} />
export const LembarKerja = () => <LembarKerjaInv j={TANAH} />

const TIGA: KartuTiga[] = [
  { ikon: 'kamera', judul: 'Foto tiap tanah wajib', nada: 'Satu lembar tak bisa disimpan tanpa foto.',
    poin: ['Data Sesuai → foto di register boleh dipakai', 'Ada yang Tidak Sesuai → unggah foto terbaru', 'Tanah hilang / tak ditemukan tak perlu foto'] },
  { ikon: 'pin', judul: 'Titik koordinat dicek', nada: 'Titik di register dibandingkan dengan keadaan lapangan.',
    poin: ['Ditampilkan di peta, bukan sekadar angka', 'Tidak Sesuai → klik titik yang benar', 'Titik yang sama tampil di GIS Tanah'] },
  { ikon: 'peta', judul: 'Luas dan wilayah', nada: 'Dua isian yang paling sering berbeda dari register.',
    poin: ['Luas yang seharusnya berupa angka lebih dari 0', 'Wilayah (desa) dan alamat jalan dijawab terpisah', 'Sertipikat bukan bagian LKI — itu di GIS Tanah'] },
]
export const Penekanan = () => <PenekananInv j={TANAH} kartu={TIGA} />

// ── 5. Isi form ─────────────────────────────────────────────────────────────
const BAGIAN: [string, string][] = [
  ['A', 'NIBAR'], ['B–C', 'Kode Barang & Nama Barang'], ['D', 'Nama Spesifikasi Barang'], ['D', 'Spesifikasi Lainnya'],
  ['F', 'Luas (m²)'], ['J', 'Wilayah'], ['J', 'Alamat Detail'], ['O', 'Titik Koordinat'],
  ['F', 'Satuan Barang'], ['G', 'Keberadaan Barang'], ['K', 'Kondisi Barang'], ['L', 'Penggunaan Barang'],
  ['M', 'Data Barang Tercatat Ganda'], ['Q', 'Keterangan Barang'], ['Q', 'Catatan Inventarisasi'], ['R', 'Foto / Denah'],
]

export function FormTanah() {
  return (
    <SlideTerang materi={MATERI_TANAH} label="Langkah 2 · Isi LKI" judul="Isi form — satu tanah, satu lembar">
      <div className="absolute left-0 top-0 w-[460px] space-y-4">
        <Poin jeda={250}>Form terbuka dari <Tbl>Isi Inventarisasi</Tbl>. Bagiannya <b>berkode huruf</b>, urutannya persis seperti di kartu kanan.</Poin>
        <Poin jeda={450}>Hampir tiap bagian = kotak biru <b>Tercatat</b> + pilihan <b>Sesuai / Tidak Sesuai</b>; bila tidak sesuai, <b>sebutkan yang seharusnya</b>.</Poin>
        <Poin jeda={650}><b>Nama Barang otomatis</b> mengikuti kode: yang dikoreksi cukup kodenya, dan hanya di jenis aset yang sama (pindah jenis = menu Reklasifikasi).</Poin>
        <Catatan jeda={1000} nada="amber" ikon="dokumen">
          <b>Sertipikat / dokumen kepemilikan tidak ditanyakan</b> di LKI — datanya dikelola di <b>GIS Tanah</b> (per bidang).
        </Catatan>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[640px]" judul="Form LKI — Format III.A.1 · Tanah" jeda={300}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-2.5">
            <SeksiMock kode="B–C" judul="Kode Barang & Nama Barang"><SesuaiMock lama="1.3.1.01.01.04.001 · Tanah Bangunan Kantor Pemerintah" pilih="sesuai" /></SeksiMock>
            <SeksiMock kode="D" judul="Nama Spesifikasi Barang"><SesuaiMock lama="Tanah Kantor Kecamatan" pilih="sesuai" /></SeksiMock>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Bagian yang ditanyakan untuk Tanah</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {BAGIAN.map(([k, t], i) => (
                <p key={t + i} className="mt-in text-[11px] text-gray-700 leading-tight" style={d(600 + i * 45)}><span className="text-gray-400 mr-1">{k}.</span>{t}</p>
              ))}
            </div>
            <p className="mt-3 text-[10.5px] text-gray-400 leading-snug"><b>Tidak ditanyakan:</b> Merek / Tipe · nomor kendaraan · biaya atribusi · &ldquo;di atas tanah milik&rdquo; · sebab tidak ada.</p>
          </div>
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 6. Luas, alamat, titik ──────────────────────────────────────────────────
export const LuasTanah = () => (
  <Luas j={TANAH} luas={{ lama: '12.450 m²', baru: '12.380' }} wilayah="Desa Contoh, Kec. Contoh, Kabupaten Kediri"
    catatan={<>Luas yang dibandingkan adalah <b>luas di register</b>. Pembagian ke <b>bidang &amp; sertipikat</b> dikerjakan di <b>GIS Tanah</b>.</>} />
)

// ── 7. Keberadaan, kondisi, penggunaan ──────────────────────────────────────
function KartuTemuan({ jeda, kode, judul, children, ke }: { jeda: number; kode: string; judul: string; children: ReactNode; ke: ReactNode }) {
  return (
    <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5 flex flex-col" style={d(jeda)}>
      <SeksiMock kode={kode} judul={judul} besar>{children}</SeksiMock>
      <p className="mt-auto pt-3 text-[15.5px] leading-snug text-gray-600 border-t border-gray-100">{ke}</p>
    </div>
  )
}

const Pilihan = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-2.5">{children}</div>

export function TemuanLapangan() {
  return (
    <SlideTerang materi={MATERI_TANAH} label="Langkah 3 · Keadaan tanah" judul="Ada, kondisinya, dan dipakai siapa">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-5 items-stretch h-[440px]">
        <KartuTemuan jeda={250} kode="G" judul="Keberadaan Barang" ke={<>Tidak ditemukan → <Tbl>III.B.2</Tbl> · Hilang karena kecurian → <Tbl>III.B.1</Tbl></>}>
          <Pilihan><Radio besar label="Ada" aktif /><Radio besar label="Tidak ada / tidak ditemukan" /><Radio besar label="Hilang karena kecurian" /></Pilihan>
          <p className="mt-4 text-[14px] text-gray-500 leading-snug">Jenis aset ini <b>tidak</b> menanyakan sebab &ldquo;tidak ada&rdquo;.</p>
        </KartuTemuan>
        <KartuTemuan jeda={470} kode="K" judul="Kondisi Barang" ke={<>Berbeda dari yang tercatat → <Tbl>III.B.7</Tbl></>}>
          <Tercatat besar nilai="Sebelum inventarisasi: Baik" />
          <div className="mt-3"><Pilihan><Radio besar label="Baik" aktif /><Radio besar label="Rusak Ringan" /><Radio besar label="Rusak Berat" /></Pilihan></div>
          <p className="mt-4 text-[14px] text-gray-500 leading-snug">Kondisi tanah di register umumnya tercatat <b>Baik</b> — ubah bila kenyataannya berbeda.</p>
        </KartuTemuan>
        <KartuTemuan jeda={690} kode="L" judul="Penggunaan Barang" ke={<>Pegawai → <Tbl>III.B.5</Tbl> · Pusat / Pemda lain / Pihak lain → <Tbl>III.B.6</Tbl>. Operasional: aman, tak masuk LHI.</>}>
          <Pilihan>
            <Radio besar label="Operasional / Tidak ada pihak lain" aktif />
            <Radio besar label="Pegawai / Pengguna Barang lainnya" />
            <Radio besar label="Pemerintah Pusat" />
            <Radio besar label="Pemerintah Daerah Lainnya" />
            <Radio besar label="Pihak Lain" />
          </Pilihan>
          <p className="mt-3 text-[13.5px] text-gray-500 leading-snug">Dipakai pegawai → <b>Nama &amp; Status Pemakai</b> wajib. Pihak lain → centang bila ada dokumen penguasaan.</p>
        </KartuTemuan>
      </div>
    </SlideTerang>
  )
}

// ── 8–10. Simpan, sesudah simpan, belum tercatat ────────────────────────────
export const SimpanFoto = () => <SimpanFotoInv j={TANAH} />
export const SesudahSimpan = () => <SesudahSimpanInv j={TANAH} />
export const BelumTercatat = () => <BelumTercatatInv j={TANAH} />

// ── 11. Temuan → laporan → tindak lanjut ────────────────────────────────────
const TEMUAN: [string, string, string][] = [
  ['Hilang karena kecurian', 'III.B.1', 'Reklas ke Aset Hilang, lalu usulan penghapusan'],
  ['Tidak ada / tidak ditemukan', 'III.B.2', 'Reklas ke Aset Dalam Penelusuran, lalu usulan penghapusan'],
  ['Dipakai pegawai', 'III.B.5', 'Tanah belum bisa dicatat di menu Pengamanan — ditandai selesai manual'],
  ['Dipakai pihak lain', 'III.B.6', 'Reklas (Tidak Digunakan Operasional / Pinjam Pakai), lalu catat Pemanfaatan'],
  ['Kondisi berubah', 'III.B.7', 'Rusak Berat → reklas, usulan penghapusan · lainnya → Koreksi'],
  ['Data berubah (luas, alamat, titik, foto…)', 'III.B.8', 'Koreksi → Spesifikasi Barang'],
  ['Tercatat ganda', 'III.B.9', 'Koreksi → Pencatatan Ganda'],
  ['Kode barang salah', 'III.B.12', 'Reklasifikasi → Kesalahan Kodefikasi'],
  ['Tanah belum tercatat', 'III.B.11', 'Cara Perolehan → Hasil Inventarisasi'],
]
export const Temuan = () => (
  <TemuanInv j={TANAH} baris={TEMUAN}
    ket={<>Reklas ke <b>Aset Lain-Lain (1.5.4)</b> hanya <b>usulan</b> — kode baru berlaku saat SKPD menyimpan Reklasifikasi. Status Tindak Lanjut dibaca otomatis dari keadaan register.</>} />
)

// ── 12–13. Daftar periksa & penutup ─────────────────────────────────────────
export const DaftarPeriksa = () => (
  <DaftarPeriksaInv j={TANAH} kelompok={[
    { judul: 'Identitas & lokasi', butir: ['Kode & nama sesuai tanahnya', 'Luas cocok dengan kenyataan', 'Wilayah (desa) & alamat jalan dicek terpisah', 'Titik koordinat dicek di peta'] },
    { judul: 'Keadaan', butir: ['Keberadaan dipilih', 'Kondisi & penggunaan dijawab', 'Tercatat ganda diisi bila ada kembarannya', 'Tidak Sesuai → sebut yang seharusnya'] },
    { judul: 'Foto & simpan', butir: ['Foto tiap tanah disertakan', 'Foto terbaru bila ada yang Tidak Sesuai', 'Tanah yang belum tercatat → + Tambah temuan', 'Simpan Isian, lalu pantau Validasi'] },
  ]} />
)
export const Tutup = () => (
  <TutupInv j={TANAH} baris={[['Foto', 'tiap tanah'], ['Titik', 'yang benar'], ['Luas', 'sesuai kenyataan']]}
    penutup="Tanah yang diperiksa langsung di lapangan membuat register dan peta GIS-nya dapat dipercaya." />
)
