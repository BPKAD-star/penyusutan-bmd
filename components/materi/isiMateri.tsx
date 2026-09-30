'use client'
// Isi tiap materi paparan: slug (lib/materi.ts) → daftar komponen slide, urut.
// Dipisah dari lib/materi.ts supaya halaman Dokumen Sumber bisa menggambar
// kotak materinya tanpa ikut memuat seluruh slide.
//
// ⚠️ Panjang tiap daftar WAJIB sama dgn `jumlahSlide` di lib/materi.ts, dan
// tiap slug di sana wajib punya isinya di sini — dikunci lib/materi.test.ts.
import type { ComponentType } from 'react'
import { Sampul, Tujuan, Siklus, PetaMenu } from './perkenalan/Pembuka'
import { BisaDikerjakan, Alur, Unggulan, Laporan } from './perkenalan/Fitur'
import { Pembatas, Koordinat, Spesifikasi, Profil, Ipa } from './perkenalan/Kelengkapan'
import { AturanMain, Tindak, Penutup } from './perkenalan/Penutup'

export const ISI_MATERI: Record<string, ComponentType[]> = {
  'perkenalan-smart-asset': [
    Sampul, Tujuan, Siklus, PetaMenu,
    BisaDikerjakan, Alur, Unggulan, Laporan,
    Pembatas, Koordinat, Spesifikasi, Profil, Ipa,
    AturanMain, Tindak, Penutup,
  ],
}
