// ============================================================================
// Alokasi nilai Pemecahan Barang — SATU induk dibagi jadi N pecahan.
//
// Diangkat dari `KoreksiForm` (components/pengelolaan/Koreksi.tsx) 2026-09-15.
// Sampai hari itu ia hidup sebagai IIFE di dalam komponen React ber-1.431 baris
// & 46 `useState`, tanpa satu pun test — padahal ini **aritmetika uang Lapis 1**:
// angkanya masuk ledger `pemecahan_masuk`/`pemecahan_keluar` dan ikut ke neraca.
//
// ⚠️ DUA INVARIAN, dan pelanggaran keduanya SENYAP — tak ada error, cuma
// selisih yang muncul berbulan kemudian di Rekonsiliasi:
//
//   (1) **Σ pecahan == induk, EKSAK.** Berlaku untuk nilai perolehan, nilai
//       buku, DAN akumulasi. Pemecahan itu peristiwa yang secara nilai total
//       DIAM — barangnya ditata ulang, kekayaan pemda tak bergerak sesen pun.
//   (2) **Sisa pembulatan diserap pecahan TERAKHIR**, bukan dibagi rata atau
//       dibiarkan menguap. Alokasi proporsional hampir selalu menyisakan sen;
//       kalau tiap pecahan dibulatkan sendiri-sendiri, Σ-nya meleset dari induk.
//
// ⚠️ **SEMUA HITUNGAN DALAM SEN (bilangan bulat), bukan rupiah** — ini bukan
// kerapian, ini perbaikan atas cacat NYATA (2026-09-14). Versi lama membulatkan
// ke rupiah: induk 104.893.870.444,53 dianggap …445, jadi Σ pecahan (…445) ≠
// baris `pemecahan_keluar` induk (…444,53) — **Rp0,47 "tercipta" di ledger**
// dan jatuh ke Selisih Rekonsiliasi selamanya. Float rupiah juga tak boleh
// dipakai membandingkan balance; yang dibandingkan wajib bilangan bulat sen.
//
// Dikunci lib/pemecahanNilai.test.ts.
// ============================================================================

/** Rupiah → sen (bilangan bulat). Nilai tak terbaca → 0. */
export const keSen = (n: number) => Math.round((Number(n) || 0) * 100)

/**
 * Posisi penyusutan induk pada semester SEBELUM tanggal dokumen — dibaca dari
 * `penyusutan_semester`, lalu dibagi ke pecahan supaya tiap pecahan meneruskan
 * sisa umur induknya (bukan mulai dari nol).
 */
export type BasisPemecahan = {
  nilai_buku: number
  akumulasi: number
  sisa_smt: number
  /**
   * Masa manfaat TOTAL barang, dalam TAHUN (`penyusutan_semester.
   * masa_manfaat_tahun` induk) — dipakai sbg PEMBAGI TETAP saat menghitung
   * `beban` tiap pecahan. `null` utk golongan yang tak disusutkan (Tanah/ATL/
   * KDP), sama seperti `disusutkan:false` di `BasisPecah`.
   */
  masa_tahun: number | null
}

/** Isian mentah satu baris pecahan di form — sengaja `string`, apa adanya dari input. */
export type PecahanInput = { jumlah: string; nilai: string }

export type AlokasiPecahan = {
  /** Nilai perolehan pecahan (rupiah). */
  np: number
  /** Nilai buku hasil alokasi proporsional (rupiah). */
  nb: number
  /** Akumulasi penyusutan hasil alokasi proporsional (rupiah). */
  ak: number
  /**
   * Beban per semester = nilai perolehan PECAHAN ÷ masa manfaat TOTAL (dlm
   * semester), dibulatkan ke rupiah — tarif garis-lurus yang KONSTAN
   * sepanjang umur aset, sama seperti cara induknya sendiri disusutkan.
   */
  beban: number
  /** Isian barisnya sudah sah (jumlah ≥ 1 & nilai > 0). */
  valid: boolean
}

/**
 * Membagi nilai buku & akumulasi induk ke tiap pecahan, PROPORSIONAL terhadap
 * nilai perolehan yang diketik operator.
 *
 * Induk/basis yang belum termuat → `[]` (bukan nol), supaya pemanggil bisa
 * membedakan "belum siap" dari "hasilnya nol".
 */
export function alokasiPemecahan(
  nilaiInduk: number | null | undefined,
  basis: BasisPemecahan | null | undefined,
  pecahan: readonly PecahanInput[],
): AlokasiPecahan[] {
  if (nilaiInduk == null || !basis) return []
  const totalSen = keSen(nilaiInduk)
  const nbSen = keSen(basis.nilai_buku)
  const akSen = keSen(basis.akumulasi)
  // ⚠️ INSIDEN 2026-09-16: `beban` di sini dulu `nb / sisa_smt` — menghitung
  // ULANG tarif dari nilai buku & sisa umur SAAT INI, padahal garis-lurus
  // (straight-line) tarifnya KONSTAN sepanjang umur aset, persis cara induknya
  // sendiri dihitung engine (`nilai_perolehan / masa_manfaat_smt`, TETAP dari
  // semester pertama sampai terakhir). Rumus lama itu diam-diam MEMPERCEPAT
  // penyusutan pecahan begitu induknya sudah lewat separuh umur (sisa_smt <
  // separuh masa_manfaat_smt) — Σ NP/NB/AK tetap eksak sama dgn induk, jadi
  // tak satu pun uji balance di atas menangkapnya; yang salah cuma TARIFNYA.
  // Terbukti di produksi: pecahan Jalan Kab. Kolektor (Dinas PU, 2026-09-14) —
  // rumus lama 14.104.958/smt, seharusnya 12.694.462/smt (Σ 8 pecahan × Σ smt
  // tersisa = kelebihan beban yang bertumpuk tiap semester tanpa pernah
  // dikoreksi sendiri, karena tak ada satu pun error yang menandainya).
  const masaSmt = basis.masa_tahun != null ? Math.round(basis.masa_tahun * 2) : 0
  let accNB = 0, accAk = 0
  return pecahan.map((p, i) => {
    const jumlah = parseInt(p.jumlah, 10)
    const npSen = keSen(parseFloat(p.nilai))
    const valid = Number.isFinite(jumlah) && jumlah >= 1 && Number.isFinite(npSen) && npSen > 0
    const prop = totalSen > 0 && Number.isFinite(npSen) ? npSen / totalSen : 0
    // ⚠️ Pecahan TERAKHIR menerima SISANYA, bukan hasil pembulatannya sendiri —
    // itu yang membuat Σ-nya eksak sama dengan induk.
    const last = i === pecahan.length - 1
    const nb = last ? nbSen - accNB : Math.round(prop * nbSen)
    const ak = last ? akSen - accAk : Math.round(prop * akSen)
    accNB += nb; accAk += ak
    // `Number.isFinite(npSen)` dijaga sama seperti `prop` di atas — nilai yg
    // tak terbaca (mis. deretan angka >309 digit → Infinity) tak boleh
    // menular ke `beban`; barisnya toh sudah `valid:false`.
    const beban = masaSmt > 0 && Number.isFinite(npSen) ? Math.round(npSen / 100 / masaSmt) : 0
    return { np: Number.isFinite(npSen) ? npSen / 100 : 0, nb: nb / 100, ak: ak / 100, beban, valid }
  })
}

/**
 * Σ nilai perolehan pecahan == nilai induk, DIBANDINGKAN DALAM SEN.
 * ⚠️ Jangan bandingkan rupiah-nya (float) — itu yang dulu meloloskan Rp0,47.
 */
export function balancePemecahan(
  nilaiInduk: number | null | undefined,
  alokasi: readonly AlokasiPecahan[],
): boolean {
  if (nilaiInduk == null) return false
  const sumSen = alokasi.reduce((s, a) => s + keSen(a.np), 0)
  return sumSen === keSen(nilaiInduk)
}

/** Pemecahan wajib menghasilkan MINIMAL dua pecahan, semuanya berisian sah. */
export const semuaPecahanValid = (alokasi: readonly AlokasiPecahan[]) =>
  alokasi.length >= 2 && alokasi.every(a => a.valid)
