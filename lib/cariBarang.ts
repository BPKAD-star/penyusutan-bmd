// ============================================================================
// Kotak Cari Daftar Barang — kolom yang dicocokkan (permintaan user 2026-09-14).
//
// Layar & Export Excel mencari lewat RPC (`fn_daftar_barang`/`_rekap`) yang
// memakai `fn_aset_teks_cari(...)` + index trigram (migrasi 20260914_01). Jalur
// PostgREST MENTAH (Export Audit, barang yang sudah pindah SKPD) tak bisa
// memanggil fungsi di filter, jadi ia memakai `orCari` di bawah — daftar
// kolomnya WAJIB sama, kalau tidak Export Audit memuat baris yang berbeda dari
// layar tanpa satu pun error. Dikunci lib/cariBarang.test.ts, yang membaca
// langsung argumen index di berkas migrasinya.
// ============================================================================

export const KOLOM_CARI = [
  'nama_barang', 'kode', 'nibar', 'kode_register', 'merek_tipe',
  'no_polisi', 'no_rangka', 'no_mesin', 'alamat_detail', 'wilayah_kode', 'keterangan',
] as const

/** `%kata%` dgn `\`, `%`, `_` di-escape — "AG_1021" tak boleh jadi wildcard.
 *  Kembar dgn `replace(replace(replace(p_search,…)))` di RPC. */
export function polaCari(kata: string): string {
  return `%${kata.replace(/[\\%_]/g, m => `\\${m}`)}%`
}

/**
 * Isi `.or()` PostgREST untuk pencarian, atau `null` kalau kosong.
 * Nilainya DIKUTIP GANDA: koma/titik/kurung yang diketik operator (nama barang
 * e-BMD banyak yang berkoma) kalau tidak dikutip memecah sintaks `or=` dan
 * PostgREST menolak SELURUH filter ("failed to parse logic tree").
 */
export function orCari(kata: string): string | null {
  const t = kata.trim()
  if (!t) return null
  const nilai = polaCari(t).replace(/[\\"]/g, m => `\\${m}`)
  return KOLOM_CARI.map(k => `${k}.ilike."${nilai}"`).join(',')
}
