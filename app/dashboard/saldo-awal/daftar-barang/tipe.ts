// ============================================================================
// Bentuk data halaman Saldo Awal → Daftar Barang Awal, dipakai bersama
// komponen halamannya & ./useEditSpekAwal.ts (REFACTOR-PLAN Fase 3).
// ============================================================================

/** Satu baris snapshot `aset_awal_2026` sebagaimana ditampilkan halaman ini. */
export type Row = {
  nibar: string; kode: string; nama_barang: string; skpd_id: number
  intra_ekstra: string | null; tgl_perolehan: string | null; tahun_pengadaan: number | null
  nilai_perolehan: number
  akumulasi_2025: number; nilai_buku_awal: number; sisa_masa_manfaat_smt: number
  masa_manfaat_smt: number | null; beban_penyusutan_per_smt: number | null
  foto_paths: string[] | null
  // Kolom spesifikasi — dipakai kolom per jenis aset (sama spt Daftar Barang)
  merek_tipe: string | null; spesifikasi_lainnya: string | null
  // Identitas kendaraan — cuma dipakai kolom Peralatan & Mesin (1.3.2).
  no_polisi: string | null; no_rangka: string | null; no_mesin: string | null; no_bpkb: string | null
  alamat_detail: string | null; wilayah_kode: string | null
  luas: number | null; jenis_hak: string | null
  // Dokumen kepemilikan — dipakai kolom Tanah-like DAN Aset Lain-Lain (1.5.4).
  nomor_dokumen_kepemilikan: string | null
  tanggal_dokumen_kepemilikan: string | null
  nama_dokumen_kepemilikan: string | null
  asal_usul: string | null; penggunaan_pengamanan: string | null
}

/** Ringkasan bidang tanah per NIBAR — `n` bidang, `nLuas` yang berluas. */
export type BidangAgg = { n: number; nLuas: number; luas: number | null }
