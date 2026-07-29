// ============================================================================
// KODE REGISTER — identitas barang menurut POSISI TERAKHIRnya.
//
// Bedanya dengan NIBAR: NIBAR itu AKTA LAHIR — terbit sekali saat barang masuk
// dan tidak pernah berubah (direklas pun tidak digenerate ulang, lihat
// Reklasifikasi.tsx). Kode register itu KTP — ikut pindah mengikuti barangnya.
//
// Susunan digitnya SAMA PERSIS dengan NIBAR (45 digit), sengaja, supaya operator
// tidak perlu menghafal dua format:
//   [12][01/02][3506][14 dgt lokasi][4 dgt tahun][12 dgt kode barang][7 dgt urut]
// Yang beda cuma ISInya. Empat segmen tengah ikut bergerak:
//   * intra/ekstra  → `reklas_komptabel`
//   * kode lokasi   → `pengalihan_status`, `mutasi_internal`
//   * tahun         → BUKAN tahun perolehan, tapi tahun barang MASUK ke SKPD itu
//   * kode barang   → `reklas_kode`, `reklas_golongan`
//
// ⚠️ FASE 0 — berkas ini SENGAJA hanya membentuk 38 DIGIT PERTAMA, tanpa nomor
// urut, dan tidak menyimpan apa pun. Nomor urut WAJIB diterbitkan lalu dibekukan
// (Fase 1: tabel counter + kolom `aset.kode_register` + tabel riwayat), BUKAN
// dihitung saat tampil: kalau dihitung, satu barang hilang di tengah bikin nomor
// semua barang di bawahnya bergeser — padahal kode register tercetak di label
// barang, KIR, dan BAST. Jadi keluaran berkas ini BELUM identitas unik; dua
// barang di SKPD/tahun/kode/komptabel yang sama pasti punya prefiks kembar.
// Gunanya sekarang: memastikan formatnya benar & melihat barang mana yang
// posisinya sudah bergeser dari akta lahirnya.
// ============================================================================
import {
  digitsPad, kodeLokasiNibar,
  KODE_PROVINSI_KAB, KODE_WILAYAH_KEDIRI, INTRA_EKSTRA_KODE,
} from '@/lib/nibar'

/** Panjang prefiks tanpa nomor urut: 2+2+4+14+4+12. */
export const PANJANG_PREFIX_REGISTER = 38
/** NIBAR utuh skema baru. Warisan e-BMD ada yang 43 digit — segmennya TIDAK sejajar. */
export const PANJANG_NIBAR_PENUH = 45

export type PosisiBarang = {
  /** `aset.intra_ekstra` — 'intra' | 'ekstra'. */
  intraEkstra: string | null
  /** `admin_skpd.kode_skpd` milik SKPD pemilik PADA periode yang dilihat (boleh ber-titik). */
  kodeSkpd: string | null
  /** 'YYYY' — tahun barang masuk ke SKPD itu; jatuh ke tahun perolehan kalau belum pernah pindah. */
  tahun: string | null
  /** `aset.kode` — kode barang Permendagri 108 (7 segmen → 12 digit). */
  kode: string | null
}

// FAIL-CLOSED: kembalikan null kalau ada segmen yang datanya memang TIDAK ADA.
// Sengaja tidak meniru `digitsPad` yang mengisi '0' diam-diam — untuk NIBAR itu
// sudah terlanjur jadi perilaku bawaan, tapi kode register ini DITAMPILKAN ke
// operator: kode yang dikarang dari data kosong kelihatan sah dan bisa ikut
// tersalin ke dokumen. Lebih baik kosong dan ketahuan.
//
// Normalisasi segmen yang datanya ADA tetap memakai `digitsPad` yang sama persis
// dengan generator NIBAR — kalau beda, perbandingan register vs NIBAR jadi tidak
// sahih padahal itu justru gunanya Fase 0.
export function prefixKodeRegister(p: PosisiBarang): string | null {
  const ie = INTRA_EKSTRA_KODE[p.intraEkstra || '']
  if (!ie) return null
  if (!(p.kodeSkpd || '').replace(/\D/g, '')) return null
  if (!/^\d{4}$/.test((p.tahun || '').trim())) return null
  if (!(p.kode || '').replace(/\D/g, '')) return null
  return (
    KODE_PROVINSI_KAB + ie + KODE_WILAYAH_KEDIRI +
    kodeLokasiNibar(p.kodeSkpd || '') + (p.tahun || '').trim() + digitsPad(p.kode || '', 12)
  )
}

// 38 digit pertama NIBAR, untuk dibandingkan dengan prefixKodeRegister().
// HANYA sahih untuk NIBAR 45 digit: NIBAR warisan e-BMD yang 43 digit posisi
// segmennya bergeser, jadi memotongnya 38 digit menghasilkan perbandingan yang
// SELALU "beda" padahal barangnya tidak ke mana-mana.
export function prefixNibar(nibar: string | null): string | null {
  const n = (nibar || '').trim()
  return n.length === PANJANG_NIBAR_PENUH ? n.slice(0, PANJANG_PREFIX_REGISTER) : null
}

/** Sudah bergeser dari akta lahirnya? null = tak bisa dinilai (NIBAR kosong/warisan). */
export function bergeserDariNibar(nibar: string | null, prefixRegister: string | null): boolean | null {
  const pn = prefixNibar(nibar)
  if (!pn || !prefixRegister) return null
  return pn !== prefixRegister
}

// Tahun untuk segmen ke-5. `tahunMasuk` datang dari posisiAt() (lib/pengalihan.ts)
// dan hanya terisi kalau barangnya PERNAH pindah pada/sebelum periode yang
// dilihat; kalau belum pernah, "tahun berada di SKPD tersebut" ya tahun ia lahir
// di situ = tahun perolehan.
export function tahunPosisi(tahunMasuk: string | null, tglPerolehan: string | null): string | null {
  if (tahunMasuk && /^\d{4}$/.test(tahunMasuk)) return tahunMasuk
  const t = (tglPerolehan || '').slice(0, 4)
  return /^\d{4}$/.test(t) ? t : null
}
