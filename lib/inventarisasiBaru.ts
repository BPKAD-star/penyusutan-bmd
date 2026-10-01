// Isian "BMD Belum Tercatat" (Format III.A.7) — keputusan user 2026-10-02.
// Barang temuan ini kelak dicatat sebagai Cara Perolehan → Hasil Inventarisasi,
// jadi yang dikumpulkan di sini sama dgn yang diminta kartu itu: kode barang,
// satuan, kuantitas, nilai per item, TANGGAL PEROLEHAN (dasar penyusutan), lalu
// spesifikasi lengkap, catatan inventarisasi, dan foto. SEMUANYA WAJIB.
//
// ⚠️ "Spesifikasi lengkap" mengikuti golongan lembar (`entryFieldsForKode`, satu
// sumber dgn Edit Spesifikasi di Hasil Inventarisasi) + Asal Usul: nomor
// polisi/rangka/mesin tak ditanyakan untuk Tanah, jenis hak tak ditanyakan untuk
// Gedung/JIJ. Menuntut kolom yang tak berlaku pada barangnya membuat lembar tak
// mungkin disimpan.
//
// Murni (tanpa React/Supabase) supaya form & `kekuranganLki` memakai SATU aturan.
import { entryFieldsForKode, FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import type { InvJawaban } from '@/lib/inventarisasi'

export type BaruData = NonNullable<InvJawaban['baru']>

/** Urutan tampil = urutan permintaan user (bukan urutan template golongan). */
const URUTAN: FieldKey[] = [
  'nama_barang', 'merek_tipe', 'spesifikasi_lainnya', 'no_polisi', 'no_rangka', 'no_mesin', 'no_bpkb',
  'wilayah_kode', 'alamat_detail', 'latitude', 'kondisi_barang', 'penggunaan_pengamanan', 'keterangan',
  'jenis_hak', 'luas', 'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan',
  'asal_usul',
]

/** Kolom di `baru` untuk tiap field. Selebihnya namanya sama dgn FieldKey. */
export const KUNCI_BARU: Partial<Record<FieldKey, keyof BaruData>> = {
  nama_barang: 'spesifikasi',            // "Spesifikasi Nama Barang" (baru.nama_barang = uraian kodefikasi)
  penggunaan_pengamanan: 'penggunaan',
  kondisi_barang: 'kondisi',
}
export const kunciBaru = (k: FieldKey): keyof BaruData => KUNCI_BARU[k] ?? (k as keyof BaruData)

/** Field spesifikasi yang berlaku untuk golongan ini, berurutan. `longitude` ikut `latitude`. */
export function fieldBaru(golongan: string): FieldKey[] {
  const ada = new Set<FieldKey>([...entryFieldsForKode(golongan), 'asal_usul'])
  return URUTAN.filter(k => ada.has(k))
}

const kosong = (v: unknown) => v == null || String(v).trim() === ''

/** Tanggal lokal hari ini 'YYYY-MM-DD' (bukan toISOString — itu UTC dan bisa mundur sehari). */
function hariIni(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Kekurangan isian lembar BMD Belum Tercatat. Catatan Inventarisasi & foto
 * diperiksa pemanggilnya (`kekuranganLki`) karena dipakai bersama lembar biasa.
 */
export function kekuranganBaru(baru: BaruData, golongan: string, hari: string = hariIni()): string[] {
  const kurang: string[] = []
  if (!baru.kode_barang) kurang.push('Kode Barang')
  if (!baru.satuan) kurang.push('Satuan Barang')
  if (!(Number(baru.jumlah) > 0)) kurang.push('Kuantitas')
  if (!(Number(baru.harga_satuan) > 0)) kurang.push('Nilai per item')
  if (!baru.tgl_perolehan) kurang.push('Tanggal Perolehan')
  else if (baru.tgl_perolehan > hari) kurang.push('Tanggal Perolehan tidak boleh di masa depan')

  for (const k of fieldBaru(golongan)) {
    const v = baru[kunciBaru(k)]
    if (k === 'latitude') {
      if (baru.latitude == null || baru.longitude == null) kurang.push('Titik Koordinat')
    } else if (k === 'luas') {
      if (!(Number(v) > 0)) kurang.push(FIELD_LABEL.luas)
    } else if (kosong(v)) {
      kurang.push(FIELD_LABEL[k])
    }
  }
  return kurang
}
