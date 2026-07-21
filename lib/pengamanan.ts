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

// Pangkat / golongan ruang PNS (Permen). value = label (disimpan apa adanya).
export const PANGKAT_GOLONGAN: string[] = [
  'Juru Muda (I/a)', 'Juru Muda Tingkat I (I/b)', 'Juru (I/c)', 'Juru Tingkat I (I/d)',
  'Pengatur Muda (II/a)', 'Pengatur Muda Tingkat I (II/b)', 'Pengatur (II/c)', 'Pengatur Tingkat I (II/d)',
  'Penata Muda (III/a)', 'Penata Muda Tingkat I (III/b)', 'Penata (III/c)', 'Penata Tingkat I (III/d)',
  'Pembina (IV/a)', 'Pembina Tingkat I (IV/b)', 'Pembina Utama Muda (IV/c)',
  'Pembina Utama Madya (IV/d)', 'Pembina Utama (IV/e)',
]

// String cache utk kolom aset.pengamanan (badge/filter). Mis: "Budi Santoso
// (NIP 19800101…)". Bukan sumber kebenaran — detail otoritatif di ledger.
export function pengamananCache(nama: string, nip: string): string {
  const nipTxt = nip ? ` (NIP ${nip})` : ''
  return `${nama}${nipTxt}`
}
