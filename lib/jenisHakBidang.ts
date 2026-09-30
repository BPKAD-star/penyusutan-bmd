// ============================================================================
// Jenis Hak Tanah dari BIDANG (GIS) — kapan ia menggantikan `aset.jenis_hak`,
// dan bagaimana menampilkan register yang bidangnya berjenis hak BERBEDA.
//
// Kembaran `luasBidang.ts` (Σ luas): Daftar Barang menampilkan luas dari bidang
// kalau ada, dan Jenis Hak harus mengikuti prinsip yang sama — kolom register
// cuma muat SATU nilai, sementara satu register bisa terdiri dari beberapa
// sertifikat yang statusnya berbeda (keputusan user 2026-09-30).
//
// Kasus nyatanya: satu area dibeli pemda berupa beberapa sertifikat Hak Milik,
// tapi belum semuanya dibalik nama atas nama pemda — sebagian sudah Hak Pakai,
// sebagian masih Hak Milik. `aset.jenis_hak` (satu string) tak bisa
// menyatakannya; yang benar = daftar jenis hak di antara bidangnya.
//
// Aturan (DIHITUNG SAAT TAMPIL, tak pernah disimpan balik — alasan sama dgn Σ
// luas, lihat luasBidang.ts):
//   · register TANPA bidang            → `aset.jenis_hak` apa adanya
//   · bidang ada, TAK SATU pun berjenis hak → jatuh ke `aset.jenis_hak`
//     (bidangnya belum diisi; menampilkan "kosong" akan MENGHAPUS informasi
//     yang sebenarnya tercatat di register)
//   · bidang ada & sebagian berjenis hak → daftar jenis hak bidang (bidang
//     menang atas register), + jumlah bidang yang BELUM diisi jenis haknya
//
// ⚠️ Bidang yang belum diisi TIDAK diam-diam dianggap "sama dengan yang lain"
// dan TIDAK dibuang: jumlahnya dilaporkan (`belumDiisi`). Daftar yang hanya
// menyebut "Hak Pakai" padahal 2 dari 5 bidangnya tak diketahui terbaca sbg
// "seluruhnya Hak Pakai" — persis kelas kesalahan Σ luas parsial.
//
// Dikunci lib/jenisHakBidang.test.ts.
// ============================================================================

/** Ringkasan jenis hak bidang milik SATU register tanah. */
export type RingkasHak = {
  /** Banyaknya bidang. */
  n: number
  /** Jenis hak → berapa bidang yang memilikinya (hanya yang terisi). */
  hak: Record<string, number>
}

export type JenisHakTampil = {
  /** Jenis hak yang ditampilkan, terbanyak dulu (seri → abjad supaya urutannya total). */
  baris: { hak: string; n: number }[]
  /** Bidang yang jenis haknya belum diisi (0 kalau tak relevan). */
  belumDiisi: number
  /** Total bidang — dipakai memutuskan apakah jumlah per jenis perlu disebut. */
  nBidang: number
  /** true = nilainya dari `aset.jenis_hak` (register), bukan dari bidang. */
  dariRegister: boolean
}

const bersih = (s: string | null | undefined) => (s ?? '').trim()

/** Tambahkan satu bidang ke ringkasan (untuk pemuat yang menarik bidang mentah). */
export function tambahBidangHak(r: RingkasHak, jenisHak: string | null | undefined): void {
  r.n++
  const h = bersih(jenisHak)
  if (h) r.hak[h] = (r.hak[h] || 0) + 1
}

/**
 * Jenis hak yang DITAMPILKAN untuk satu register.
 *
 * `hakRegister` = `aset.jenis_hak`. Boleh kosong: hasilnya `baris: []` — layar
 * menampilkan "-", bukan menebak.
 */
export function jenisHakTampil(b: RingkasHak | undefined | null, hakRegister: string | null | undefined): JenisHakTampil {
  const jenis = Object.entries(b?.hak ?? {})
  const nBidang = b?.n ?? 0
  if (!b || nBidang === 0 || jenis.length === 0) {
    const h = bersih(hakRegister)
    return { baris: h ? [{ hak: h, n: 0 }] : [], belumDiisi: 0, nBidang, dariRegister: true }
  }
  const baris = jenis
    .map(([hak, n]) => ({ hak, n }))
    .sort((x, y) => y.n - x.n || x.hak.localeCompare(y.hak))
  const terisi = baris.reduce((s, x) => s + x.n, 0)
  return { baris, belumDiisi: Math.max(0, nBidang - terisi), nBidang, dariRegister: false }
}

/**
 * Teks polos untuk Excel. Satu jenis yang mencakup SEMUA bidang → namanya
 * saja (sama dgn tampilan lama); selain itu tiap jenis disertai jumlah bidang.
 * Bidang yang belum diisi disebut, tak dibuang.
 */
export function teksJenisHak(t: JenisHakTampil): string {
  if (t.baris.length === 0) return ''
  if (t.dariRegister) return t.baris[0].hak
  if (t.baris.length === 1 && t.belumDiisi === 0) return t.baris[0].hak
  const bagian = t.baris.map(x => `${x.hak} (${x.n} bidang)`)
  if (t.belumDiisi > 0) bagian.push(`belum diisi (${t.belumDiisi} bidang)`)
  return bagian.join('; ')
}
