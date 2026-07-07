// Tipe IPA (Indeks Pengelolaan Aset) — subset dari src/types/ipa.ts di
// github.com/BPKAD-star/ipa-bmd-kediri, cuma yang dipakai lib/ipaEngine.ts +
// komponen form. Tipe row DB sengaja tidak diikutkan (skema tabel sumber beda
// dari kita) — tipe row lokal didefinisikan langsung di tiap page yang butuh.

export type Indeks = 1 | 2 | 3 | 4
export type KelompokFPK = 1 | 2 | 3 | 4
export type KategoriIPA = 'Sangat Baik' | 'Baik' | 'Cukup' | 'Buruk'
export type StatusRecord = 'draft' | 'diajukan' | 'diverifikasi' | 'ditolak'
export type RoleUser = 'pb_admin' | 'bkad_verifier' | 'bkad_admin'

export interface HasilParameter {
  kode: string
  persen_raw: number | null
  persen_fpk: number | null
  indeks: Indeks
  bobot: number
  nilai_terbobot: number
}

export interface HasilIPA {
  st1: number
  st2: number
  st3: number
  st4: number
  ipa_final: number
  kategori: KategoriIPA
  detail: Record<string, HasilParameter>
}

/** ST1 — Akuntabilitas dan Produktivitas (bobot 20%) */
export interface InputST1 {
  np111_sudah_tl: number
  np111_total_tl: number
  np111_tidak_dapat: number
  np121_sudah_tl: number
  np121_total_tl: number
  np121_tidak_dapat: number
  kelompok: KelompokFPK
}

/** ST2 — Kepatuhan Pengelolaan BMD (bobot 30%) */
export interface InputST2 {
  np231_tanggal_terima: Date | null
  sp2411_jumlah_tepat: number
  sp2421_tanggal_terima: Date | null
  sp2431_tanggal_terima: Date | null
  np251_tanggal_terima: Date | null
  tahun: number
  kelompok: KelompokFPK
}

/** ST3 — Efektivitas Pengawasan dan Pengendalian (bobot 35%) */
export interface InputST3 {
  np361_sudah_tl: number
  np361_total_tl: number
  np361_tidak_dapat: number
  sp3711_sudah_tl: number
  sp3711_total: number
  sp3711_tidak_terdefinisi: boolean
  sp3721_nilai_tl: number
  sp3721_saldo_awal: number
  sp3721_mutasi_tambah: number
  sp3721_saldo_akhir_nol: boolean
  sp3731_nilai_tl: number
  sp3731_saldo_awal: number
  sp3731_mutasi_tambah: number
  sp3731_nilai_multiyear: number
  sp3731_saldo_akhir_nol: boolean
  kelompok: KelompokFPK
}

/** ST4 — Administrasi BMD yang Andal (bobot 15%) */
export interface InputST4 {
  sp4811_sudah: number
  sp4811_total: number
  sp4821_nilai_sudah: number
  sp4821_nilai_total: number
  sp4831_sudah: number
  sp4831_total: number
  sp4841_nilai_sudah: number
  sp4841_nilai_total: number
  sp4851_sudah: number
  sp4851_total: number
  sp4861_nilai_sudah: number
  sp4861_nilai_total: number
}

export interface InputIPA {
  st1: InputST1
  st2: InputST2
  st3: InputST3
  st4: InputST4
}
