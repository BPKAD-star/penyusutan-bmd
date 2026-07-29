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

// ⚠️ SEJAK FASE 1 FUNGSI INI TIDAK LAGI DIPAKAI DI JALUR TAMPILAN — kode
// register dibaca apa adanya dari kolom `aset.kode_register`, yang diisi trigger
// DB. Yang OTORITATIF sekarang `fn_prefix_kode_register` (migrasi 20260729_03);
// yang di bawah ini rujukan yang bisa dibaca manusia & alat uji.
// Konsekuensinya: kalau salah satu diubah dan yang lain tidak, TIDAK ADA yang
// gagal — tak ada pemanggil yang meledak. Jadi kalau menyentuh salah satunya,
// sandingkan langsung dengan yang satunya, jangan andalkan tes atau tipe.
//
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

// Kepala NIBAR yang MEMANG memakai skema aplikasi ini: [12][01|02][3506].
const KEPALA_SKEMA_KITA = new Set([
  KODE_PROVINSI_KAB + INTRA_EKSTRA_KODE.intra + KODE_WILAYAH_KEDIRI,  // 12013506
  KODE_PROVINSI_KAB + INTRA_EKSTRA_KODE.ekstra + KODE_WILAYAH_KEDIRI, // 12023506
])

// 38 digit pertama NIBAR, untuk dibandingkan dengan prefixKodeRegister().
//
// PANJANG 45 SAJA TIDAK CUKUP. Cek 2026-07-29 atas data live: 150.101 aset
// (praktis seluruh batch impor ATL Diknas) punya NIBAR 45 digit tapi SUSUNAN
// SEGMENNYA BEDA — warisan e-BMD:
//     [8 dgt urut internal][kode barang 12][kode SKPD 14][tahun 4][urut 7]
// versus skema kita:
//     [12][01|02][3506][kode SKPD 14][tahun 4][kode barang 12][urut 7]
// Kode barang & SKPD-nya TERTUKAR posisi, tahunnya di belakang, dan 8 digit
// depannya angka yang naik per baris — bukan [12][01|02][3506].
//
// Tanpa penyaring ini, memotongnya 38 digit membandingkan potongan yang isinya
// bukan segmen yang dimaksud → SELALU "beda", dan 150rb barang tampil bertanda
// "pernah bergeser" padahal tak ke mana-mana. Yang benar-benar pindah (4 baris
// di ledger) malah tenggelam di antaranya — penandanya jadi tak ada gunanya.
//
// null = "tak bisa dinilai", BUKAN "berbeda". Pembeda itu penting: yang tak
// bisa dinilai tidak boleh ditandai apa-apa di layar.
export function prefixNibar(nibar: string | null): string | null {
  const n = (nibar || '').trim()
  if (n.length !== PANJANG_NIBAR_PENUH) return null
  if (!KEPALA_SKEMA_KITA.has(n.slice(0, 8))) return null
  return n.slice(0, PANJANG_PREFIX_REGISTER)
}

// Sudah bergeser dari akta lahirnya? Menerima kode register UTUH (45 digit,
// apa adanya dari kolom `aset.kode_register`) — pemotongan 38 digitnya di sini
// saja, supaya tak ada pemanggil yang lupa memotong lalu diam-diam
// membandingkan 45 lawan 38 dan selalu dapat "berbeda".
//
// null = TAK BISA DINILAI (NIBAR kosong, atau warisan e-BMD yang layoutnya beda)
// — sengaja dibedakan dari `false`: yang tak bisa dinilai jangan ditandai apa pun
// di layar. Per data live 2026-07-29, penyaring ini menurunkan jumlah yang
// ditandai dari 150.108 (praktis semua barang, tak berguna) jadi 148.
export function bergeserDariNibar(nibar: string | null, kodeRegister: string | null): boolean | null {
  const pn = prefixNibar(nibar)
  const pr = (kodeRegister || '').trim().slice(0, PANJANG_PREFIX_REGISTER)
  if (!pn || pr.length !== PANJANG_PREFIX_REGISTER) return null
  return pn !== pr
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
