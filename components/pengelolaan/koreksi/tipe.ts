// ============================================================================
// Tipe yang DIPAKAI BERSAMA oleh Koreksi.tsx & mesin state per-alasan di
// folder ini (REFACTOR-PLAN Fase 3 — "pecah per alasan").
//
// Ditaruh di berkas sendiri, BUKAN di-export dari Koreksi.tsx, supaya hook
// tidak meng-import balik dari komponen yang meng-import-nya. Lingkaran impor
// tipe memang tidak meledak saat runtime (TypeScript membuangnya), tapi ia
// membuat urutan berkas tak bisa dibaca & gampang berubah jadi lingkaran
// SUNGGUHAN begitu satu nilai ikut ter-export dari situ.
// ============================================================================

/** Satu baris register `aset` sebagaimana dibaca form Koreksi (`BARANG_COLS`). */
export type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
  tgl_perolehan: string | null; cara_perolehan: string | null; foto_paths: string[] | null
  intra_ekstra: string | null
}

/**
 * Posisi penyusutan INDUK pada semester SEBELUM tanggal dokumen — titik tolak
 * alokasi ke tiap pecahan, supaya pecahannya meneruskan sisa umur induk.
 *
 * `disusutkan: false` bukan "belum dihitung": golongan Tanah/ATL/KDP memang tak
 * pernah punya baris engine, jadi akumulasinya nol MENURUT DEFINISI. Bedakan
 * dari basis yang gagal ditemukan — yang itu error, bukan nol.
 */
export type BasisPecah = {
  nilai_buku: number
  akumulasi: number
  sisa_smt: number
  masa_tahun: number | null
  disusutkan: boolean
}

/** Satu baris pecahan yang sedang disusun operator (jumlah + nilai + spek). */
export type PecahanItem = {
  key: string
  jumlah: string
  nilai: string
  fields: Record<string, string>
  foto: string[]
}
