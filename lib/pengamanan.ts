// Konstanta & helper Pengamanan BMD — dipakai komponen menu Pengamanan &
// laporan. Pengamanan = penyerahan kustodi fisik barang ke seorang pegawai
// (penanggung jawab) via BAST + Pakta Integritas. Overlay atribut, TIDAK
// mengubah nilai/penyusutan. Sumber kebenaran = ledger (jurnal_header kategori
// 'pengamanan' + transaksi_bmd jenis 'pengamanan'); kolom aset.pengamanan cuma
// cache kustodian saat ini.
import { kodeLevel3 } from '@/lib/bmd'

// Golongan yang boleh diamankan (keputusan user 2026-07-22: "lebih ke peralatan
// mesin & gedung bangunan aja"). Picker menampilkan hanya ini. Kalau perlu
// lebih luas, tinggal tambah kode golongan di sini.
export const PENGAMANAN_ELIGIBLE_GOLONGAN = ['1.3.2', '1.3.3']

export function isPengamananEligible(kode: string): boolean {
  return PENGAMANAN_ELIGIBLE_GOLONGAN.includes(kodeLevel3(kode))
}

/**
 * Isi `jurnal_header.payload` kartu pengamanan.
 *
 * ⚠️ **DUA GENERASI KUNCI, dan yang lama WAJIB tetap dibaca** (2026-09-08).
 * Sampai hari itu form menanyakan Nama · NIP · Pangkat/Golongan · Jabatan;
 * sejak lembar Permendagri IV.J dibangun, isiannya disamakan dengan lembarnya:
 * Nama · Nomor Identitas · Status · Jabatan · Alamat. `nip` &
 * `pangkat_golongan` TIDAK dihapus dari tipe ini — kartu yang terlanjur dibuat
 * memakainya, dan `jurnal_header` bukan tabel yang di-migrasi tiap kali form
 * berubah. Yang baru cuma menambah, tak menimpa.
 */
export type PayloadPengamanan = {
  nama_pegawai?: string
  /** Nomor identitas penghuni/pemakai — boleh NIK atau NIP (keputusan user). */
  nomor_identitas?: string
  status_penghuni?: string
  jabatan?: string
  alamat?: string
  pakta_no?: string
  pakta_tgl?: string
  bast_paths?: string[]
  pakta_paths?: string[]
  /** ⚠️ WARISAN — form sebelum 2026-09-08. Dibaca, tak lagi ditulis. */
  nip?: string
  /** ⚠️ WARISAN — idem. */
  pangkat_golongan?: string
}

/**
 * Nomor identitas kartu ini, dgn cadangan ke kunci warisannya.
 *
 * ⚠️ Kartu lama menyimpannya di `nip`. Tanpa cadangan ini, kolom "Nomor
 * Identitas" di lembar bertanda tangan tercetak KOSONG untuk seluruh kartu yang
 * dibuat sebelum 2026-09-08 — dan tak ada satu pun error yang memberitahu.
 */
export function identitasPengamanan(p: PayloadPengamanan | null | undefined): string {
  return (p?.nomor_identitas || p?.nip || '').trim()
}

// Pangkat / golongan ruang PNS (Permen). value = label (disimpan apa adanya).
// ⚠️ WARISAN: tak lagi ditanyakan form sejak 2026-09-08 (lihat
// `PayloadPengamanan`), tapi kartu lama masih menyimpannya & kartunya masih
// menampilkannya kalau ada.
export const PANGKAT_GOLONGAN: string[] = [
  'Juru Muda (I/a)', 'Juru Muda Tingkat I (I/b)', 'Juru (I/c)', 'Juru Tingkat I (I/d)',
  'Pengatur Muda (II/a)', 'Pengatur Muda Tingkat I (II/b)', 'Pengatur (II/c)', 'Pengatur Tingkat I (II/d)',
  'Penata Muda (III/a)', 'Penata Muda Tingkat I (III/b)', 'Penata (III/c)', 'Penata Tingkat I (III/d)',
  'Pembina (IV/a)', 'Pembina Tingkat I (IV/b)', 'Pembina Utama Muda (IV/c)',
  'Pembina Utama Madya (IV/d)', 'Pembina Utama (IV/e)',
]

// String cache utk kolom aset.pengamanan (badge/filter). Mis: "Budi Santoso
// (NIP 19800101…)". Bukan sumber kebenaran — detail otoritatif di ledger.
export function pengamananCache(nama: string, identitas: string): string {
  // ⚠️ Label "NIP" DIPERTAHANKAN apa adanya walau kolomnya kini boleh berisi
  // NIK: string ini sudah tersimpan di `aset.pengamanan` untuk kartu-kartu lama,
  // dan menggantinya membuat badge barang lama & baru terbaca berbeda padahal
  // isinya sejenis. Ia cache tampilan, bukan sumber kebenaran.
  const idTxt = identitas ? ` (NIP ${identitas})` : ''
  return `${nama}${idTxt}`
}
