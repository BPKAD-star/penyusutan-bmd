// Profil Pengguna — logika MURNI pengajuan perubahan data pegawai (2026-10-02,
// migrasi 20261002_03). Nama, pangkat/golongan, dan jabatan tidak disimpan
// langsung oleh pemilik akun: dicetak di lembar bertanda tangan, dan `jabatan`
// dipakai menebak Kepala SKPD (lib/penandaTangan.ts) — jadi lewat persetujuan admin.
import { pangkatDariGolongan } from '@/lib/usulanPengurus'

export type DataPegawai = {
  nama: string
  golongan: string | null
  pangkat: string | null
  jabatan: string | null
}

/** Isian form — semuanya string, supaya `<input>` terkendali tak pernah `null`. */
export type FormUbah = { nama: string; golongan: string; jabatan: string }

export type KunciUbah = keyof DataPegawai

export const LABEL_UBAH: Record<KunciUbah, string> = {
  nama: 'Nama',
  golongan: 'Golongan',
  pangkat: 'Pangkat',
  jabatan: 'Jabatan',
}

const kosongJadiNull = (s: string | null | undefined) => {
  const t = (s || '').trim()
  return t ? t : null
}

export function formDariPegawai(p: DataPegawai): FormUbah {
  return { nama: p.nama || '', golongan: p.golongan || '', jabatan: p.jabatan || '' }
}

/**
 * Susun nilai USULAN dari isian form. Pangkat TIDAK diketik — ia diturunkan dari
 * golongan (satu sumber: GOLONGAN_PANGKAT), supaya keduanya mustahil berselisih.
 * Golongan yang tak berubah mempertahankan pangkat yang sudah tersimpan: tulisan
 * pangkat di data lama kadang sedikit beda dari daftar baku, dan tanpa ini tiap
 * pengajuan memunculkan "perubahan pangkat" yang tak pernah diminta siapa pun.
 */
export function susunUsulan(form: FormUbah, lama: DataPegawai): DataPegawai {
  const golongan = kosongJadiNull(form.golongan)
  const pangkat = golongan === (lama.golongan || null)
    ? (lama.pangkat || null)
    : (golongan ? (pangkatDariGolongan(golongan) || null) : null)
  return {
    nama: form.nama.trim(),
    golongan,
    pangkat,
    jabatan: kosongJadiNull(form.jabatan),
  }
}

export type Perubahan = { kunci: KunciUbah; label: string; dari: string; ke: string }

/** Bidang yang BERBEDA antara data sekarang & usulan; kosong = tak ada yang berubah. */
export function perubahanProfil(lama: DataPegawai, usulan: DataPegawai): Perubahan[] {
  const kunci: KunciUbah[] = ['nama', 'golongan', 'pangkat', 'jabatan']
  const hasil: Perubahan[] = []
  for (const k of kunci) {
    const dari = (lama[k] || '').trim()
    const ke = (usulan[k] || '').trim()
    if (dari !== ke) hasil.push({ kunci: k, label: LABEL_UBAH[k], dari, ke })
  }
  return hasil
}

/** Alasan form belum boleh dikirim; kosong = boleh. */
export function kekuranganFormUbah(form: FormUbah, lama: DataPegawai): string[] {
  const alasan: string[] = []
  if (!form.nama.trim()) alasan.push('Nama tidak boleh kosong.')
  else if (perubahanProfil(lama, susunUsulan(form, lama)).length === 0) {
    alasan.push('Belum ada yang diubah dari data pegawai saat ini.')
  }
  return alasan
}
