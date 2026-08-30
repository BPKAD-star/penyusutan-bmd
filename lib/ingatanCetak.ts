// Ingatan pilihan cetak (penanda tangan, tanggal, jabatan) di `localStorage`.
//
// ── Kenapa disimpan sama sekali ─────────────────────────────────────────────
// Lembar resmi dicetak → DITANDATANGANI → dipindai jadi lampiran. Cetakan kedua
// yang menyebut nama berbeda dari yang sudah diteken bikin kacau penelaah, jadi
// cetak ulang WAJIB menghasilkan lembar yang SAMA. Ini preferensi tampilan,
// **BUKAN gerbang wewenang** — penegak wewenang tetap RLS di server.
//
// ── Kenapa satu sumber ──────────────────────────────────────────────────────
// Sampai 2026-08-29 pasangan baca/tulis ini disalin di TUJUH tempat, dan
// TIGA di antaranya menulis TANPA `try/catch` (`standar-harga`, `rkbmd` ×2).
// `localStorage.setItem` MELEMPAR di mode privat & saat kuota penuh — di tiga
// titik itu ia melempar dari dalam `onChange`/`onPilih`, jadi memilih penanda
// tangan bisa menjatuhkan halaman cetaknya. Pembacanya sudah dijaga sejak awal;
// penulisnya yang kelewat.
//
// ⚠️ NILAI KUNCINYA JANGAN DIGANTI. Kunci = tempat preferensi operator tersimpan
// di peramban MEREKA; menggantinya tidak error sama sekali, cuma membuat semua
// pilihan yang pernah disetel lenyap diam-diam dan lembar cetak ulang mendadak
// bertitik-titik lagi. Penamaannya memang tidak seragam (`bmd_laporanbmd_…`
// vs `bmd_rkbmd_…` vs `bmd_ba_rekon_…`) — itu warisan, dan menyeragamkannya
// lebih mahal daripada manfaatnya.
//
// ⚠️ BENTUK MUATANNYA SENGAJA TIDAK DISERAGAMKAN. Tiap lembar menyimpan hal
// berbeda — `{id,tgl}` · `{kiri,kanan,tgl}` · `{id,plt,tgl}` · `{id,jabatan}` ·
// `Partial<KonfigBA>` — karena format lembarnya memang menanyakan hal berbeda.
// Yang disatukan MEKANIKNYA (generik `<T>`), bukan bentuknya; memaksa satu tipe
// bersama menghasilkan objek serba-opsional yang tak menjelaskan apa pun.

/** Baca/tulis satu kunci. Keduanya fail-safe — lihat catatan di atas. */
export type IngatanCetak<T> = {
  /** `null` = belum pernah disetel, tak bisa diurai, atau storage tak tersedia. */
  baca(): T | null
  simpan(v: T): void
  hapus(): void
}

/**
 * `localStorage` bisa TIDAK ADA (render di server) atau MELEMPAR saat diakses
 * (peramban yang menolak site data). Dua-duanya bukan alasan menjatuhkan
 * halaman cetak.
 */
function storage(): Storage | null {
  try {
    // ⚠️ `typeof` di sini SENGAJA ditahan meski secara perilaku REDUNDAN: tanpa
    // ia, `localStorage` yang tak terdeklarasi melempar ReferenceError yang
    // ditangkap `catch` di bawah, hasilnya `null` juga. Jadi mencabutnya TIDAK
    // memerahkan satu pun test — sudah dibuktikan dengan sabotase 2026-08-29,
    // dan itu dicatat di sini supaya tak ada yang mengira test-nya bolong.
    // Ditahan karena menyatakan MAKSUD (render di server) alih-alih
    // mengandalkan pengecualian sebagai alur kendali.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Ingatan bermuatan JSON — bentuk yang dipakai enam dari tujuh lembar.
 *
 * ⚠️ Isi `localStorage` itu DATA DARI LUAR PROGRAM: bisa cacat karena versi
 * lama, suntingan manual, atau berbagi kunci dengan tab lain. Gagal mengurainya
 * cukup berarti "belum pernah memilih".
 */
export function ingatanCetak<T>(kunci: string): IngatanCetak<T> {
  return {
    baca() {
      const s = storage()
      if (!s) return null
      try {
        const v = s.getItem(kunci)
        return v ? (JSON.parse(v) as T) : null
      } catch {
        return null
      }
    },
    simpan(v) {
      const s = storage()
      if (!s) return
      try {
        s.setItem(kunci, JSON.stringify(v))
      } catch { /* mode privat / kuota penuh — preferensi tampilan, abaikan */ }
    },
    hapus() {
      const s = storage()
      if (!s) return
      try { s.removeItem(kunci) } catch { /* abaikan */ }
    },
  }
}

/**
 * Ingatan bermuatan TEKS POLOS (bukan JSON).
 *
 * ⚠️ Dipakai SATU lembar saja — penanda tangan RKBMD se-Kabupaten
 * (`bmd_rkbmd_ttd_sekab`) menyimpan id pegawai apa adanya sejak awal.
 * Membacanya lewat `ingatanCetak` akan `JSON.parse('<uuid>')` → melempar →
 * `null`, jadi pilihan yang sudah tersimpan di peramban operator LENYAP tanpa
 * satu pun error. Karena itu bentuknya dipertahankan, bukan "dirapikan".
 */
export function ingatanTeksCetak(kunci: string): IngatanCetak<string> {
  return {
    baca() {
      const s = storage()
      if (!s) return null
      try { return s.getItem(kunci) } catch { return null }
    },
    simpan(v) {
      const s = storage()
      if (!s) return
      try { s.setItem(kunci, v) } catch { /* abaikan */ }
    },
    hapus() {
      const s = storage()
      if (!s) return
      try { s.removeItem(kunci) } catch { /* abaikan */ }
    },
  }
}

// ── Kunci ───────────────────────────────────────────────────────────────────
// Dikumpulkan di sini supaya terlihat sekaligus & tak bisa salah ketik.
// ⚠️ NILAINYA WARISAN — lihat peringatan di kepala berkas. Jangan diseragamkan.

/** IV.L.4.2 — Laporan BMD per SKPD. */
export const kunciTtdLaporanBmd = (skpdId: number) => `bmd_laporanbmd_ttd_skpd_${skpdId}`
/** IV.L.4.4 — Laporan BMD se-pemda. */
export const KUNCI_TTD_LAPORAN_BMD_PEMDA = 'bmd_laporanbmd_ttd_pemda'
/** IV.L.4.1 / IV.L.4.3 — Rekapitulasi Mutasi. `null` = lembar se-pemda. */
export const kunciTtdMutasiBmd = (skpdId: number | null) =>
  skpdId == null ? 'bmd_mutasi_ttd_pemda' : `bmd_mutasi_ttd_skpd_${skpdId}`
/** Laporan Penerimaan BMD (menu Laporan Perolehan). */
export const kunciTtdPerolehan = (skpdId: number) => `bmd_perolehan_ttd_skpd_${skpdId}`
/** RKBMD — lembar per-SKPD & lembar se-Kabupaten (yang se-kab bermuatan TEKS). */
/** Lembar se-Kabupaten Perolehan (IV.A.<n>.7–10) — penanda tangannya "Pejabat
 *  Penatausahaan Barang", dipilih bebas & TIDAK terikat SKPD mana pun. */
export const KUNCI_TTD_PEROLEHAN_SEKAB = 'bmd_perolehan_ttd_sekab'

export const kunciTtdRkbmdSkpd = (skpdId: number) => `bmd_rkbmd_ttd_skpd_${skpdId}`
export const KUNCI_TTD_RKBMD_SEKAB = 'bmd_rkbmd_ttd_sekab'
/** Standar Harga se-Kabupaten. */
export const KUNCI_TTD_STANDAR_SEKAB = 'bmd_standar_ttd_sekab'
