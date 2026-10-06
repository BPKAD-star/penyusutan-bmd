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
import { Kontrak, Bast, TambahBarang, Draft, Foto, Setujui } from './pengadaan/NonKonstruksi'
import { KodeMenentukan, KodeMasaManfaat, KodeRekening } from './pengadaan/Kodefikasi'
import { AlurKonstruksi, KartuKdp, AturanKonstruksi, KodeKdp } from './pengadaan/Konstruksi'
import { LraTujuan, LraDuaArah, LraCara } from './pengadaan/Lra'
import * as H from './hibah/Hibah'
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
    // Pembuka
    SampulPengadaan, PetaAlur, Penekanan,
    // Non Konstruksi: kontrak → BAST → barang (+ kodefikasi) → draft → foto → setujui
    Kontrak, Bast, TambahBarang, KodeMenentukan, KodeMasaManfaat, KodeRekening, Draft, Foto, Setujui,
    // Pekerjaan Konstruksi (KDP)
    AlurKonstruksi, KartuKdp, AturanKonstruksi, KodeKdp,
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
}
