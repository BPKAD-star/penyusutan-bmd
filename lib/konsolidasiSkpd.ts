// ============================================================================
// Persempit pilihan SKPD (node + seluruh turunannya, dari SkpdCombobox) balik
// ke SATU node saja saat operator memilih "SKPD ini saja".
//
// `SkpdCombobox.onChangeSelection` SELALU mengembalikan node + SELURUH
// turunannya (`descendantIds`) — combobox itu sendiri tak punya cara meminta
// "node ini saja" (lihat komentar di kepala SkpdCombobox.tsx). Filter
// "Konsolidasi / SKPD ini saja" (mula-mula Daftar Barang, permintaan user
// 2026-09-18) mempersempit balik ke SATU id saat operator memintanya, tanpa
// menyentuh `descendantIds` yang sudah dihitung combobox — kembali ke
// Konsolidasi memberi hasil yang sama seperti semula.
//
// `app/dashboard/daftar-barang/useFilterDaftarBarang.ts` sudah punya versi
// PERTAMA (`idsKonsolidasi`, atas bentuk lokalnya sendiri
// `SelSkpd = {skpdId, descIds}`, sudah dites) — SENGAJA TIDAK diganti supaya
// test yang ada tetap utuh & namanya tak bentrok. Ini versi BERSAMA untuk
// halaman yang menyimpan `skpdId`/`descendantIds` sbg dua nilai terpisah
// (bentuk `SkpdSelection` bawaan SkpdCombobox apa adanya): Penyusutan & GIS
// Tanah (Peta + Daftar Bidang), diangkat 2026-09-22 — permintaan user
// menerapkan filter yang sama di ketiga halaman sekaligus membuat penulisan
// ulang rumus ini jadi rule-of-three seketika (CODING-STANDARD §1.2).
//
// ⚠️ Default AWAL beda per halaman, dan itu keputusan tiap pemanggil, bukan
// bagian dari fungsi ini: Daftar Barang/Penyusutan default Konsolidasi=true
// (kebiasaan lama sebelum filter ini ada), sedangkan GIS Tanah default false
// (permintaan user 2026-09-22 — memilih "Dinas Pendidikan" di GIS mestinya
// cuma menampilkan tanah level induknya, bukan otomatis menyeret ratusan
// sekolah di bawahnya ke peta).
// ============================================================================

/**
 * @param skpdId SKPD yang sedang dipilih (null = se-kabupaten/belum pilih —
 *   tak ada yang bisa dipersempit, filter ini tak berlaku).
 * @param descendantIds node + seluruh turunannya, dari SkpdCombobox.
 * @param konsolidasi true = pakai `descendantIds` apa adanya (bawaan
 *   combobox); false = persempit ke `[skpdId]` saja.
 */
export function idsKonsolidasi(
  skpdId: number | null,
  descendantIds: number[] | null,
  konsolidasi: boolean,
): number[] | null {
  if (!konsolidasi && skpdId != null) return [skpdId]
  return descendantIds
}
