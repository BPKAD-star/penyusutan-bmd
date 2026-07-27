// Konstanta & tipe KIR (Kartu Inventaris Ruangan, Format III.K.2) — dipakai menu
// Pembukuan > KIR, Pelaporan > KIR, dan halaman cetak /cetak/kir.
//
// NON-LEDGER: penempatan barang di ruangan murni data deskriptif (tabel
// `kir_ruangan` + `kir_ruangan_aset`, migrasi 20260727_02). Tidak menyentuh
// `transaksi_bmd`/`aset` sama sekali — lihat kepala migrasi untuk alasannya.
import { kodeLevel3 } from '@/lib/bmd'

// Golongan yang boleh ditempatkan di ruangan (keputusan user 2026-07-27):
// Peralatan & Mesin, Aset Tetap Lainnya, dan Aset Lain-Lain (barang rusak/idle
// yang sudah direklas ke 1.5.4 tapi fisiknya masih menempati ruangan).
// Tanah/Gedung/Jalan sengaja TIDAK masuk — KIR mendata isi ruangan, bukan
// bangunannya. Longgarkan dengan menambah kode golongan di sini.
export const KIR_ELIGIBLE_GOLONGAN = ['1.3.2', '1.3.5', '1.5.4']

export function isKirEligible(kode: string): boolean {
  return KIR_ELIGIBLE_GOLONGAN.includes(kodeLevel3(kode))
}

/** Penanggung Jawab Ruangan — dipilih dari admin_pegawai, di-snapshot ke ruangan. */
export type PegawaiRuangan = {
  id: string
  nama: string
  nip: string | null
  jabatan: string | null
  role_bmd: string
}

export type Ruangan = {
  id: string
  skpd_id: number
  nama: string
  kode_ruangan: string | null
  pegawai_id: string | null
  pj_nama: string | null
  pj_nip: string | null
  pj_jabatan: string | null
  keterangan: string | null
}

/** Satu baris isi ruangan = penempatan + data barang yang di-join dari `aset`. */
export type IsiRuangan = {
  id: string
  aset_id: string
  keterangan: string | null
  nibar: string | null
  kode: string
  uraian_barang: string | null   // kolom 5 KIR "Nama Barang" (baku dari kodefikasi)
  nama_barang: string | null     // kolom 6 KIR "Spesifikasi Nama Barang"
  merek_tipe: string | null
  tgl_perolehan: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
}

/** Data barang seperti tampil di KIR — dipakai baik saat memilih maupun saat join. */
export type AsetKir = Omit<IsiRuangan, 'id' | 'aset_id' | 'keterangan'> & { id: string }

export const RUANGAN_COLS = 'id,skpd_id,nama,kode_ruangan,pegawai_id,pj_nama,pj_nip,pj_jabatan,keterangan'
/** Kolom `aset` untuk picker barang (butuh `id` sbg kunci pilihan). */
export const ASET_PICKER_COLS = 'id,nibar,kode,uraian_barang,nama_barang,merek_tipe,tgl_perolehan,jumlah,satuan,nilai_perolehan'
/** Kolom `aset` saat di-join dari kir_ruangan_aset — TANPA `id` (sudah ada aset_id
 *  di baris penempatan; kalau ikut di-select, spread-nya menimpa id baris). */
export const ASET_JOIN_COLS = 'nibar,kode,uraian_barang,nama_barang,merek_tipe,tgl_perolehan,jumlah,satuan,nilai_perolehan'

/** Tahun Perolehan (kolom 8 KIR) dari tanggal perolehan. */
export const tahunPerolehan = (tgl: string | null): string =>
  tgl ? String(new Date(tgl).getFullYear()) : '-'

/** Bentuk baris isi ruangan dari hasil query join `kir_ruangan_aset` → `aset`. */
export function toIsiRuangan(r: {
  id: string; aset_id: string; keterangan: string | null
  aset: Omit<AsetKir, 'id'> | null
}): IsiRuangan | null {
  if (!r.aset) return null
  return { ...r.aset, id: r.id, aset_id: r.aset_id, keterangan: r.keterangan }
}
