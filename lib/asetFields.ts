// Field spesifikasi per golongan aset — dipakai form edit barang (Pengadaan dkk)
// supaya field yang muncul relevan dgn jenis barangnya (Tanah butuh sertifikat,
// Peralatan&Mesin butuh nomor rangka/mesin, dst). Kolom di `aset` sengaja dibuat
// nullable lebar (satu tabel utk semua golongan) — laporan tinggal SELECT kolom
// yang relevan per golongan, bukan tabel terpisah per jenis aset.
import { kodeLevel3 } from '@/lib/bmd'

export type FieldKey =
  | 'spesifikasi' | 'merek_tipe' | 'no_polisi' | 'no_bpkb' | 'no_rangka' | 'no_mesin'
  | 'luas_tanah' | 'no_sertifikat' | 'tgl_sertifikat' | 'atas_nama_sertifikat' | 'hak_kepemilikan'
  | 'titik_koordinat' | 'lokasi' | 'keterangan'

export const FIELD_LABEL: Record<FieldKey, string> = {
  spesifikasi: 'Spesifikasi',
  merek_tipe: 'Merek / Tipe',
  no_polisi: 'Nomor Polisi',
  no_bpkb: 'Nomor BPKB',
  no_rangka: 'Nomor Rangka',
  no_mesin: 'Nomor Mesin',
  luas_tanah: 'Luas Tanah (m²)',
  no_sertifikat: 'Nomor Sertifikat',
  tgl_sertifikat: 'Tanggal Sertifikat',
  atas_nama_sertifikat: 'Nama Pemegang Hak',
  hak_kepemilikan: 'Jenis Hak (mis. Hak Milik / Hak Pakai)',
  titik_koordinat: 'Titik Koordinat',
  lokasi: 'Lokasi / Alamat',
  keterangan: 'Keterangan',
}

export const FIELD_TYPE: Partial<Record<FieldKey, 'date' | 'number' | 'textarea'>> = {
  tgl_sertifikat: 'date',
  luas_tanah: 'number',
  keterangan: 'textarea',
}

// Golongan level-3 (dari kodeLevel3) → field yang relevan, urut tampil.
export const GOLONGAN_FIELDS: Record<string, FieldKey[]> = {
  '1.3.1': ['titik_koordinat', 'luas_tanah', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama_sertifikat', 'hak_kepemilikan', 'lokasi', 'keterangan'],
  '1.3.2': ['spesifikasi', 'merek_tipe', 'no_polisi', 'no_bpkb', 'no_rangka', 'no_mesin', 'keterangan'],
}
// Golongan lain (Gedung, Jalan/Jaringan, ATL, KDP, ATB, Aset Lain-Lain) — belum
// ada kebutuhan spesifik yang disebutkan, pakai set generik dulu.
export const DEFAULT_FIELDS: FieldKey[] = ['spesifikasi', 'merek_tipe', 'keterangan']

export function fieldsForKode(kode: string): FieldKey[] {
  return GOLONGAN_FIELDS[kodeLevel3(kode)] || DEFAULT_FIELDS
}

// Union field-key dari beberapa kode sekaligus (dipakai popup bulk-edit ketika
// barang yang dicentang beda golongan) — urut sesuai kemunculan pertama.
export function unionFieldsForKodes(kodes: string[]): FieldKey[] {
  const out: FieldKey[] = []
  const seen = new Set<FieldKey>()
  for (const kode of kodes) {
    for (const k of fieldsForKode(kode)) {
      if (!seen.has(k)) { seen.add(k); out.push(k) }
    }
  }
  return out
}

// Ringkasan satu-baris (kompak, biar list tidak panjang) — ambil field "utama"
// pertama yang terisi, prioritas spesifikasi > field lain.
export function ringkasanFields(kode: string, values: Record<string, string> | undefined | null): string {
  if (!values) return ''
  const keys = fieldsForKode(kode)
  const prioritas: FieldKey[] = ['spesifikasi', 'no_sertifikat', 'merek_tipe', 'lokasi', 'keterangan']
  for (const k of prioritas) {
    if (keys.includes(k) && values[k]?.trim()) return values[k].trim()
  }
  for (const k of keys) if (values[k]?.trim()) return values[k].trim()
  return ''
}
