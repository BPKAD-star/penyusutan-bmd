'use client'
// Isi tiap materi paparan: slug (lib/materi.ts) → daftar komponen slide, urut.
// Dipisah dari lib/materi.ts supaya halaman Dokumen Sumber bisa menggambar
// kotak materinya tanpa ikut memuat seluruh slide.
//
// ⚠️ Panjang tiap daftar WAJIB sama dgn `jumlahSlide` di lib/materi.ts, dan
// tiap slug di sana wajib punya isinya di sini — dikunci lib/materi.test.ts.
import type { ComponentType } from 'react'
import { Sampul, Konteks, Siklus, PetaMenu } from './perkenalan/Pembuka'
import { Ai } from './perkenalan/Ai'
import { Dashboard, SaldoAwal, RekapSaldoAwal, Rkbmd, Pembukuan, CaraPerolehan, Pengelolaan } from './perkenalan/Menu1'
import { Lra, Kir, Inventarisasi, AlurLki, GisTanah, Kendaraan } from './perkenalan/Menu2'
import { DaftarBarang, Penyusutan, IpaAspek, Pelaporan, Admin } from './perkenalan/Menu3'
import { Pembatas, Koordinat, Spesifikasi, Profil, Ipa } from './perkenalan/Kelengkapan'
import { Tindak, Penutup } from './perkenalan/Penutup'
import { Sampul as SampulPengadaan, PetaAlur, Penekanan } from './pengadaan/Pembuka'
import { AlurBelanjaModal } from './pengadaan/AlurBelanja'
import { Kontrak, Bast, TambahBarang, Draft, Foto, Setujui } from './pengadaan/NonKonstruksi'
import { KodeMenentukan, KodeMasaManfaat, KodeRekening } from './pengadaan/Kodefikasi'
import { AlurKonstruksi, KartuKdp, AturanKonstruksi, KodeKdp } from './pengadaan/Konstruksi'
import { PerencanaanDulu, PerencanaanGelondongan } from './pengadaan/KdpKhusus'
import { LraTujuan, LraDuaArah, LraCara } from './pengadaan/Lra'
import * as H from './hibah/Hibah'
import * as IT from './inventarisasi/Tanah'
import * as IG from './inventarisasi/Gedung'
import { TerlanjurSalah, DaftarPeriksa, TutupPengadaan } from './pengadaan/Penutup'

export const ISI_MATERI: Record<string, ComponentType[]> = {
  'perkenalan-smart-asset': [
    // Pembuka
    Sampul, Konteks, Siklus, PetaMenu, Ai,
    // Penjelasan per menu sidebar
    Dashboard, SaldoAwal, RekapSaldoAwal, Rkbmd, Pembukuan, CaraPerolehan, Pengelolaan, Lra, Kir,
    Inventarisasi, AlurLki, GisTanah, Kendaraan, DaftarBarang, Penyusutan, IpaAspek, Pelaporan, Admin,
    // Yang perlu dicek pengurus barang
    Pembatas, Profil, Spesifikasi, Koordinat, Ipa,
    // Penutup
    Tindak, Penutup,
  ],
  'entry-belanja-modal-pengadaan': [
    // Pembuka: sampul → gambaran besar (kontrak sampai neraca) → menu → penekanan
    SampulPengadaan, AlurBelanjaModal, PetaAlur, Penekanan,
    // Non Konstruksi: kontrak → BAST → barang (+ kodefikasi) → draft → foto → setujui
    Kontrak, Bast, TambahBarang, KodeMenentukan, KodeMasaManfaat, KodeRekening, Draft, Foto, Setujui,
    // Pekerjaan Konstruksi (KDP)
    AlurKonstruksi, KartuKdp, AturanKonstruksi, KodeKdp,
    // Kasus khusus konstruksi: perencanaan dulu / gelondongan
    PerencanaanDulu, PerencanaanGelondongan,
    // Rekonsiliasi dengan LRA
    LraTujuan, LraDuaArah, LraCara,
    // Penutup
    TerlanjurSalah, DaftarPeriksa, TutupPengadaan,
  ],
  'entry-hibah': [
    H.Sampul, H.PetaAlur, H.Penekanan,
    // Dokumen → barang → tanggal → spesifikasi & foto → setujui
    H.Dokumen, H.Barang, H.DuaTanggal, H.SpekFoto, H.Setujui,
    // Penutup
    H.Perbaikan, H.DaftarPeriksa, H.Tutup,
  ],
  'inventarisasi-tanah': [
    IT.Sampul, IT.PetaAlur, IT.Penekanan,
    // Lembar Kerja → isi form → lokasi → keadaan tanah → simpan
    IT.LembarKerja, IT.FormTanah, IT.LuasTanah, IT.TemuanLapangan, IT.SimpanFoto,
    // Sesudah disimpan, tanah yang belum tercatat, tindak lanjut
    IT.SesudahSimpan, IT.BelumTercatat, IT.Temuan,
    IT.DaftarPeriksa, IT.Tutup,
  ],
  'inventarisasi-gedung-bangunan': [
    IG.Sampul, IG.PetaAlur, IG.Penekanan,
    // Lembar Kerja → isi form → lokasi → keberadaan & sebab → atribusi → pemakai & tanah → simpan
    IG.LembarKerja, IG.FormGedung, IG.LuasGedung, IG.SebabTidakAda, IG.Atribusi, IG.PenggunaanTanahMilik, IG.SimpanFoto,
    // Sesudah disimpan, bangunan yang belum tercatat, tindak lanjut
    IG.SesudahSimpan, IG.BelumTercatat, IG.Temuan,
    IG.DaftarPeriksa, IG.Tutup,
  ],
}
