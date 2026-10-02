// ============================================================================
// Tindak Lanjut Inventarisasi — Fase 2: ISIAN OTOMATIS dari jawaban LKI ke
// menu tujuan (2026-10-02). Fungsi MURNI; dikunci lib/tindakLanjutIsi.test.ts.
//
// ⚠️ Semua yang di sini cuma MENGISI FORM. Tak ada yang tersimpan sampai
// operator menekan Simpan di menu tujuan — lengkap dgn dokumen sumbernya &
// seluruh penjaga menu itu (guard rantai, tahun buku, kunci semester). Begitu
// tersimpan, status di menu Tindak Lanjut berubah sendiri (lib/tindakLanjut.ts).
// ============================================================================
import type { InvJawaban, KondisiFisik } from '@/lib/inventarisasi'
import { ASET_FIELD_COLS } from '@/lib/asetFields'

const LABEL_KONDISI: Record<KondisiFisik, string> = { B: 'Baik', RR: 'Rusak Ringan', RB: 'Rusak Berat' }

const isi = (v: unknown) => v != null && String(v).trim() !== ''

/**
 * Field `aset` yang dikoreksi (Koreksi → Spesifikasi Barang) menurut jawaban
 * "Tidak Sesuai, seharusnya …" di LKI. Hanya field yang benar-benar dijawab
 * Tidak Sesuai DAN punya nilai pengganti. Foto TIDAK ikut — foto LKI ada di
 * bucket lain & foto register diunggah lewat popup itu sendiri.
 *
 * Kondisi (B.7 non-Rusak Berat) ikut: kondisi register diperbarui lewat
 * koreksi yang sama. Rusak Berat TIDAK — tindak lanjutnya reklas ke Aset
 * Lain-Lain, bukan sekadar mengganti kondisi.
 */
export function spekDariLki(j: InvJawaban): Record<string, string> {
  const out: Record<string, string> = {}
  const ambil = (key: keyof InvJawaban, kolom: string) => {
    const f = j[key] as { sesuai?: boolean; seharusnya?: string } | undefined
    if (f?.sesuai === false && isi(f.seharusnya)) out[kolom] = String(f.seharusnya).trim()
  }
  ambil('spesifikasi', 'nama_barang')
  ambil('merek_tipe', 'merek_tipe')
  ambil('spesifikasi_lainnya', 'spesifikasi_lainnya')
  ambil('no_polisi', 'no_polisi')
  ambil('no_rangka', 'no_rangka')
  ambil('no_mesin', 'no_mesin')
  ambil('no_bpkb', 'no_bpkb')
  ambil('luas', 'luas')
  ambil('alamat_detail', 'alamat_detail')
  ambil('satuan', 'satuan')
  ambil('keterangan_barang', 'keterangan')
  ambil('jenis_perkerasan', 'jenis_perkerasan')
  ambil('jenis_bahan_jembatan', 'jenis_bahan_jembatan')
  ambil('no_ruas_jalan', 'no_ruas_jalan')
  ambil('no_jaringan_irigasi', 'no_jaringan_irigasi')
  if (j.wilayah?.sesuai === false && isi(j.wilayah.wilayah_kode)) out.wilayah_kode = j.wilayah.wilayah_kode!
  if (j.koordinat?.sesuai === false && j.latitude != null && j.longitude != null) {
    out.latitude = String(j.latitude)
    out.longitude = String(j.longitude)
  }
  if (j.kondisi && j.kondisi !== 'RB') out.kondisi_barang = LABEL_KONDISI[j.kondisi]
  return out
}

/** Satu barang draft Cara Perolehan (bentuk `DraftItem` PerolehanManual). */
export type DraftDariLki = {
  golongan: string; kode: string; uraianBarang: string; tglPerolehan: string
  satuan: string; harga: string; fields: Record<string, string>; foto: string[]
}

/**
 * BMD Belum Tercatat (III.B.11) → barang draft "Cara Perolehan → Hasil
 * Inventarisasi". Kuantitas N dipecah jadi N barang per unit — pola draft
 * Pengadaan/Perolehan Manual (tiap unit bisa beda spesifikasinya sebelum
 * disetujui). Nilai per item = `harga_satuan` LKI.
 *
 * Foto TIDAK ikut: foto LKI tersimpan di bucket `dokumen-sumber`, sedangkan
 * foto register di `aset-foto`, dan Setujui mewajibkan foto per barang — jadi
 * operator melengkapinya lewat ✎ Edit Spesifikasi di kartu draft.
 */
export function draftDariBaru(j: InvJawaban, golongan: string): DraftDariLki[] {
  const b = j.baru
  if (!b?.kode_barang) return []
  const fields: Record<string, string> = {}
  const set = (k: string, v: unknown) => { if (isi(v)) fields[k] = String(v).trim() }
  set('nama_barang', b.spesifikasi)
  set('merek_tipe', b.merek_tipe)
  set('spesifikasi_lainnya', b.spesifikasi_lainnya)
  set('no_polisi', b.no_polisi); set('no_rangka', b.no_rangka); set('no_mesin', b.no_mesin); set('no_bpkb', b.no_bpkb)
  set('wilayah_kode', b.wilayah_kode); set('alamat_detail', b.alamat_detail)
  set('latitude', b.latitude); set('longitude', b.longitude)
  if (b.kondisi) fields.kondisi_barang = LABEL_KONDISI[b.kondisi]
  set('penggunaan_pengamanan', b.penggunaan)
  set('keterangan', b.keterangan)
  set('jenis_hak', b.jenis_hak); set('luas', b.luas)
  set('nomor_dokumen_kepemilikan', b.nomor_dokumen_kepemilikan)
  set('tanggal_dokumen_kepemilikan', b.tanggal_dokumen_kepemilikan)
  set('nama_dokumen_kepemilikan', b.nama_dokumen_kepemilikan)
  // Hanya kolom yang benar-benar ditulis saat Setujui — sisanya akan hilang
  // diam-diam di materialisasi, jadi jangan sampai terlihat seolah tersimpan.
  const izin = new Set<string>(ASET_FIELD_COLS)
  for (const k of Object.keys(fields)) if (!izin.has(k)) delete fields[k]

  const n = Math.max(1, Math.floor(Number(b.jumlah) || 1))
  const satu: DraftDariLki = {
    golongan, kode: b.kode_barang, uraianBarang: b.nama_barang || '',
    tglPerolehan: b.tgl_perolehan || '', satuan: b.satuan || '',
    harga: b.harga_satuan != null ? String(b.harga_satuan) : '',
    fields, foto: [],
  }
  return Array.from({ length: n }, () => ({ ...satu, fields: { ...fields } }))
}

/** Nama pecahan untuk Koreksi → Pemecahan (sebab "seharusnya beberapa register"). */
export const namaPecahanDariLki = (j: InvJawaban) =>
  (j.sebab_pecahan || []).map(s => s.trim()).filter(Boolean)
