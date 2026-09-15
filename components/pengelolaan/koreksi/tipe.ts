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

/** Edit spesifikasi yang disusun di popup, menunggu di-commit oleh Simpan. */
export type SpekEdit = { fields: Record<string, string>; foto: { replace?: string[]; append?: string[] } }

/** Baris hasil pencarian barang untuk Pencatatan Ganda & Penggabungan. */
export type Kandidat = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi_lainnya: string | null; nilai_perolehan: number; tgl_perolehan: string | null
}

/**
 * Kandidat Penggabungan. `satuan` ikut karena justru DI SITU jejak masalahnya
 * kelihatan — satu pagar yang terpecah tersebar di satuan "Meter Persegi" /
 * "unit" / "Buah" / "Set", dan satuan yang berbeda-beda itulah yang selama ini
 * membuat barangnya tak pernah ketemu kalau dicari lewat nama.
 */
export type KandidatGabung = Kandidat & { satuan: string | null; merek_tipe: string | null }

// ── Bentuk kartu jurnal koreksi ─────────────────────────────────────────────
// Dipakai bersama `Koreksi.tsx` & ./useJurnalKoreksi.ts (Fase 3 langkah 5).
/** Kelima alasan koreksi. Tiap alasan punya mesin statenya sendiri di folder ini. */
export type Alasan = 'nilai_perolehan' | 'pencatatan_ganda' | 'spesifikasi' | 'pemecahan' | 'penggabungan'

export type LinePayload = {
  nilai_lama?: number; nilai_perolehan_baru?: number
  /** Akumulasi penyusutan pada periode SEBELUM tanggal dokumen, dibekukan saat
   *  koreksi nilai disimpan. Dipakai lembar Permendagri IV.G.2 (kolom "Sebelum
   *  Koreksi"); TIDAK dibaca engine. Absen pada baris sebelum 2026-09-07. */
  akumulasi_lama?: number
  basis_periode?: string
  survivor_nibar?: string; prev?: Record<string, unknown>
} & Record<string, unknown>
// Dokumen sumber kartu koreksi. Sampai 2026-09-07 menu ini satu-satunya menu
// ber-SK yang tak punya berkas sama sekali; sekarang WAJIB untuk Pemecahan
// Barang (permintaan user) — alasan lain sengaja belum disentuh.
export type HeaderPayload = { dokumen_paths?: string[] } | null
export type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; jenis: Alasan
  keterangan: string | null; kategori: 'koreksi'; payload: HeaderPayload
}
/** Yang benar-benar dibutuhkan `EditHeaderModal` — sengaja LEBIH SEMPIT dari
 *  `Header`, supaya kartu Pemecahan & Penggabungan (yang tak punya `jenis`
 *  bertipe `Alasan` maupun `kategori`) ikut bisa memakainya tanpa dipaksa
 *  di-cast. Ketiga bentuk header di berkas ini memuat kelima ruas ini. */
export type HeaderEditable = {
  id: string; no_sk: string; tanggal: string; periode: string
  keterangan: string | null; payload: HeaderPayload
}
export type JurnalLine = {
  trx_id: number         // id baris ledger koreksi — dipakai target_trx_id saat batal
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  nilai: number; payload: LinePayload | null
}
export type Jurnal = Header & { lines: JurnalLine[]; total: number }

// ── Pemecahan Barang (alasan ke-4 di Tambah Jurnal: 1 induk → N pecahan) ────
export type PemecahanHeader = { id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null; payload: HeaderPayload }
export type PemecahanRow = { trx_id: number; aset_id: string; nibar: string | null; kode: string; nama_barang: string | null; jumlah: number; nilai: number }
export type PemecahanJurnal = PemecahanHeader & { induk: PemecahanRow | null; pecahan: PemecahanRow[]; total: number; dibatalkan: boolean }

// ── Penggabungan Barang (alasan ke-5: N baris → 1 induk) ────────────────────
// Cermin dari Pemecahan, dengan satu beda mendasar: hasil gabungan ADALAH
// induknya sendiri (aset & NIBAR yang sudah ada), jadi tak ada aset baru dan
// `penggabungan_masuk` TIDAK didaftarkan di `LAHIR` (lib/visibilitas.ts).
export type PenggabunganHeader = { id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null; payload: HeaderPayload }
export type PenggabunganRow = { trx_id: number; aset_id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai: number }
export type PenggabunganJurnal = PenggabunganHeader & {
  induk: (PenggabunganRow & { nilaiLama: number; nilaiBaru: number }) | null
  sumber: PenggabunganRow[]; dibatalkan: boolean
}

export const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,keterangan,kategori,payload'
