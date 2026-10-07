'use client'
// Materi "Entry Belanja Modal · Pengadaan" — dua slide alur entry berbentuk
// EMPAT kartu (permintaan user 2026-10-07): Non Konstruksi dan Konstruksi.
// Keduanya sengaja satu bentuk & satu komponen, karena isinya empat langkah
// yang SAMA dengan urutan sedikit dibolak-balik:
//   Non Konstruksi : Kontrak → BAST → Barang → Spesifikasi
//   Konstruksi     : Kontrak → Barang KDP → BAST per termin → Spesifikasi
// Pembatasnya: yang ditampilkan HANYA pekerjaan pengurus barang — Pratinjau &
// Setujui (dikerjakan sesudahnya) tidak ikut.
import type { ReactNode } from 'react'
import { SlideTerang, Catatan, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI, Lencana } from './bahan'

type Langkah = { ikon: NamaIkon; judul: string; isi: string; tanda?: string }

function EmpatKartu({ langkah }: { langkah: Langkah[] }) {
  return (
    <div className="absolute inset-x-0 top-0 grid grid-cols-4 gap-5">
      {langkah.map((l, i) => (
        <div key={l.judul} className="mt-up relative rounded-2xl border border-gray-200 bg-white shadow-lg p-6 h-[268px]" style={d(250 + i * 200)}>
          <div className="flex items-center justify-between">
            <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={l.ikon} ukuran={26} /></span>
            <span className="text-[38px] font-bold text-navy/15 leading-none">{i + 1}</span>
          </div>
          <p className="mt-4 text-[22px] font-bold text-navy leading-tight">{l.judul}</p>
          <p className="mt-2 text-[15.5px] text-gray-500 leading-snug">{l.isi}</p>
          {l.tanda && <span className="absolute left-6 bottom-5"><Lencana nada="wajib">{l.tanda}</Lencana></span>}
        </div>
      ))}
    </div>
  )
}

function DuaCatatan({ kiri, kanan }: { kiri: ReactNode; kanan: ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 grid grid-cols-2 gap-5">
      <Catatan jeda={1500} nada="teal" ikon="lampu">{kiri}</Catatan>
      <Catatan jeda={1700} nada="amber" ikon="dokumen">{kanan}</Catatan>
    </div>
  )
}

const NON_KONSTRUKSI: Langkah[] = [
  { ikon: 'dokumen', judul: 'Buat Kontrak', isi: 'Tekan + Tambah Pengadaan: sumber pengadaan, No. & Tgl Kontrak, penyedia, Program / Kegiatan / Sub Kegiatan, PPK.' },
  { ikon: 'dokumen', judul: 'Isi dan Upload BAST', isi: 'No. dan Tgl BAST (= tanggal perolehan), lalu unggah dokumen BAST — foto atau PDF.', tanda: 'BAST wajib' },
  { ikon: 'keranjang', judul: 'Tambah Barang', isi: 'Pilih kode rekening → Jenis BMD → kode barang, lalu isi satuan, kuantitas, harga. Kuantitas > 1 dipecah per unit.' },
  { ikon: 'kamera', judul: 'Edit Spesifikasi Barang', isi: 'Spesifikasi Nama Barang, merek, nomor seri, kondisi — dan foto tiap unit.', tanda: 'Foto wajib' },
]

export function AlurNonKonstruksi() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi" judul="Alur entry non konstruksi">
      <EmpatKartu langkah={NON_KONSTRUKSI} />
      <DuaCatatan
        kiri={<>Empat langkah ini <b>pekerjaan pengurus barang</b>. <b>Pratinjau &amp; Setujui</b> dikerjakan sesudahnya.</>}
        kanan={<>BAST <b>satu untuk seluruh kontrak</b>, diunggah di awal — sebelum barang ditambahkan.</>}
      />
    </SlideTerang>
  )
}

const KONSTRUKSI: Langkah[] = [
  { ikon: 'dokumen', judul: 'Buat Kartu Paket', isi: 'Tekan + Buat Kartu Paket: nama paket pekerjaan, tahun anggaran, program / kegiatan / sub kegiatan. Satu kartu = satu tahun.' },
  { ikon: 'gedung', judul: 'Kontrak & Barang KDP', isi: 'Tambah kontrak tiap komponen (perencanaan, fisik, pengawasan; biaya umum boleh tanpa kontrak), lalu barang KDP golongan 1.3.6.' },
  { ikon: 'hitung', judul: 'Isi Termin + Upload BAST', isi: 'Tiap termin menunjuk kontraknya, bertanggal BAST, bernilai & berdokumen. Masuk berstatus Menunggu.', tanda: 'BAST per termin' },
  { ikon: 'kamera', judul: 'Spesifikasi & Persetujuan', isi: 'Nama barang (tak boleh kembar), lokasi, foto. Admin pemda menyetujui per termin.', tanda: 'Foto wajib' },
]

export function AlurKonstruksi() {
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi" judul="Alur entry konstruksi (KDP)">
      <EmpatKartu langkah={KONSTRUKSI} />
      <DuaCatatan
        kiri={<>Termin <b>pertama</b> yang disetujui menerbitkan barangnya; termin berikutnya <b>menambah nilai</b> — NIBAR tetap. Nilai barang = jumlah termin <b>disetujui</b>.</>}
        kanan={<>Salah catat? Admin <b>membatalkan termin itu saja</b> — kartu tak pernah dibuka kunci seluruhnya. Termin yang masih <b>Menunggu</b> bebas diubah / dihapus.</>}
      />
    </SlideTerang>
  )
}
