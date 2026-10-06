// KIBAR barang yang sudah "dibuka kuncinya" → tunjuk barang PENGGANTINYA.
//
// Latar (keputusan user 2026-10-06, "jalan tengah"): Buka Kunci kartu Cara
// Perolehan TIDAK menghidupkan barang lama lagi saat disetujui ulang — barang
// lama dibatalkan (`batal_<jenis>` → status dihapus/draft) dan Setujui ulang
// menerbitkan barang BARU dgn NIBAR baru. Itu dipertahankan (audit utuh, satu
// aturan). Kerugian nyatanya cuma satu: label QR / KIBAR yang sudah TERCETAK
// menunjuk barang yang sudah mati, tanpa petunjuk ke penggantinya. Modul ini
// menutup itu — murni TAMPILAN, tak menulis apa pun.
//
// Pencocokannya lewat KARTU (jurnal_header) yang sama: baris pembatalan barang
// lama & baris perolehan barang baru sama-sama ber-`header_id` kartu itu. Ledger
// satu kartu dibaca urut id lalu dipotong jadi BLOK: blok batal (satu kali Buka
// Kunci) diikuti blok perolehan (satu kali Setujui). Pengganti = barang di blok
// perolehan PERTAMA sesudah blok batal yang memuat barang ini. Kalau pengganti
// itu sendiri dibuka kuncinya lagi, KIBAR-nya menunjuk lebih jauh — rantainya
// tersambung lewat tautan, bukan dikejar di sini.

/** Jenis baris yang ditulis Setujui (perolehan) & Buka Kunci (pembatalannya). */
export const JENIS_TERBIT = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'akumulasi_kdp'] as const
export const JENIS_BUKA_KUNCI = [
  'batal_pengadaan', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi',
  'batal_perolehan_lainnya', 'batal_akumulasi_kdp',
] as const

const TERBIT = new Set<string>(JENIS_TERBIT)
const BUKA = new Set<string>(JENIS_BUKA_KUNCI)

export type BarisKartu = {
  id: number
  jenis: string
  aset_id: string | null
}
export type AsetRingkas = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  status: string
  nilai_perolehan: number | null
}

export type HasilPengganti =
  /** Belum disetujui ulang (kartu masih draft) atau sudah diarsipkan. */
  | { keadaan: 'belum_terbit' }
  /** Satu pengganti yang dipasangkan lewat kode barang & urutan NIBAR. */
  | { keadaan: 'pasti'; pengganti: AsetRingkas; semua: AsetRingkas[] }
  /** Tak bisa dipasangkan satu-satu (jumlah/kode berubah saat dibuka kunci). */
  | { keadaan: 'kandidat'; kandidat: AsetRingkas[]; semua: AsetRingkas[] }

const banding = (a: AsetRingkas, b: AsetRingkas) => (a.nibar || '').localeCompare(b.nibar || '') || a.id.localeCompare(b.id)

/**
 * Cari pengganti `asetId` dari ledger SATU kartu.
 * `baris` = seluruh baris ledger ber-header kartu itu (urutan input bebas);
 * `aset` = peta aset_id → ringkasan untuk semua aset yang muncul di `baris`.
 * `null` = barang ini tidak dibatalkan lewat Buka Kunci kartu ini.
 */
export function cariPengganti(asetId: string, baris: BarisKartu[], aset: Map<string, AsetRingkas>): HasilPengganti | null {
  const urut = [...baris].filter(b => b.aset_id && (TERBIT.has(b.jenis) || BUKA.has(b.jenis))).sort((a, b) => a.id - b.id)

  // Potong jadi blok berjenis sama (batal / terbit), berurutan.
  const blok: { batal: boolean; aset: string[] }[] = []
  for (const b of urut) {
    const batal = BUKA.has(b.jenis)
    const akhir = blok[blok.length - 1]
    if (!akhir || akhir.batal !== batal) blok.push({ batal, aset: [b.aset_id!] })
    else if (!akhir.aset.includes(b.aset_id!)) akhir.aset.push(b.aset_id!)
  }

  // Blok batal TERAKHIR yang memuat barang ini (satu barang hanya dibatalkan
  // sekali, tapi tetap ambil yang terakhir supaya tahan data aneh).
  let iBatal = -1
  for (let i = 0; i < blok.length; i++) if (blok[i].batal && blok[i].aset.includes(asetId)) iBatal = i
  if (iBatal < 0) return null

  const terbit = blok[iBatal + 1]
  if (!terbit) return { keadaan: 'belum_terbit' }

  const semua = terbit.aset.map(id => aset.get(id)).filter((a): a is AsetRingkas => !!a).sort(banding)
  const saya = aset.get(asetId)
  if (!saya || semua.length === 0) return { keadaan: 'belum_terbit' }

  // Pasangkan per kode barang menurut urutan NIBAR — sah HANYA bila jumlah
  // barang lama & baru berkode itu sama (isi kartu tak berubah jumlahnya).
  const lama = blok[iBatal].aset.map(id => aset.get(id)).filter((a): a is AsetRingkas => !!a && a.kode === saya.kode).sort(banding)
  const baru = semua.filter(a => a.kode === saya.kode)
  if (lama.length > 0 && lama.length === baru.length) {
    const i = lama.findIndex(a => a.id === saya.id)
    if (i >= 0) return { keadaan: 'pasti', pengganti: baru[i], semua }
  }
  return { keadaan: 'kandidat', kandidat: baru.length ? baru : semua, semua }
}
