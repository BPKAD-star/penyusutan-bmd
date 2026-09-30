// ============================================================================
// Status sertifikasi Tanah di GIS — diturunkan dari JENIS HAK bidang.
//
// Keputusan user 2026-09-30. Aturan lama ("bersertifikat kalau ada nomor
// dokumen") diganti: status kini murni dibaca dari kolom Jenis Hak, karena
// itulah satu-satunya isian yang menyatakan posisi hukum tanah itu, dan
// operator mengisinya lewat dropdown (bukan teks bebas yang bisa salah ketik).
//
//   Jenis Hak                                                  → Status
//   Hak Pakai                                                  → Bersertifikat
//   Proses                                                     → Proses
//   (kosong — bidang cuma berisi keterangan luas)              → Belum Sertifikat
//   Hak Pengelolaan · Hak Guna Bangunan · Hak Guna Usaha
//     · Hak Milik · Lainnya                                    → Tinjau
//   Sengketa                                                   → Sengketa
//
// "Tinjau" = BUKAN Hak Pakai atas nama pemda, jadi perlu dilihat manusia:
// hak lain yang sah tapi tak lazim untuk BMD, atau sertifikat yang belum
// dibalik nama (mis. Hak Milik atas nama penjual). Nilai di luar daftar
// (teks bebas warisan) juga jatuh ke Tinjau — menganggapnya "Bersertifikat"
// atau "Belum" berarti menebak.
//
// ⚠️ STATUS REGISTER = BIDANG YANG PALING BELUM TUNTAS. Satu tanah bisa punya
// banyak bidang; ia baru "Bersertifikat" kalau SEMUA bidangnya Hak Pakai.
// Kalau tidak, 1 sertifikat dari 5 bidang akan mencap seluruh tanah selesai
// dan kartu ringkasan "Bersertifikat 73%" jadi terlalu optimis (aturan lama
// memakai "salah satu bidang"). Urutan prioritas (terburuk menang):
//   Sengketa > Tinjau > Belum Sertifikat > Proses > Bersertifikat
// "Belum" di atas "Proses" karena Proses sudah berjalan menuju sertifikat.
//
// Register TANPA bidang jatuh ke `aset.jenis_hak` register — aturan cadangan
// yang sama dgn lib/jenisHakBidang.ts, supaya GIS & Daftar Barang tak pernah
// menyebut status berbeda untuk tanah yang sama.
//
// Dikunci lib/statusTanah.test.ts.
// ============================================================================

export type StatusTanah = 'bersertifikat' | 'proses' | 'belum' | 'tinjau' | 'sengketa'

/** Terburuk → terbaik. Indeks kecil menang saat menggabung banyak bidang. */
export const PRIORITAS_STATUS: readonly StatusTanah[] = ['sengketa', 'tinjau', 'belum', 'proses', 'bersertifikat']

const TINJAU = new Set(['Hak Pengelolaan', 'Hak Guna Bangunan', 'Hak Guna Usaha', 'Hak Milik', 'Lainnya'])

/** Status untuk SATU nilai jenis hak (satu bidang, atau register tanpa bidang). */
export function statusJenisHak(jenisHak: string | null | undefined): StatusTanah {
  const h = (jenisHak ?? '').trim()
  if (h === '') return 'belum'
  if (h === 'Hak Pakai') return 'bersertifikat'
  if (h === 'Proses') return 'proses'
  if (h === 'Sengketa') return 'sengketa'
  if (TINJAU.has(h)) return 'tinjau'
  return 'tinjau' // teks bebas di luar daftar: perlu dilihat, bukan ditebak
}

/**
 * Status untuk SATU register: bidang yang paling belum tuntas menang.
 * `hakBidang` = jenis hak tiap bidangnya; kosong (tak punya bidang) → jatuh ke
 * `hakRegister`.
 */
export function statusRegister(
  hakBidang: readonly (string | null | undefined)[],
  hakRegister: string | null | undefined,
): StatusTanah {
  const daftar = hakBidang.length > 0 ? hakBidang : [hakRegister]
  let terburuk = PRIORITAS_STATUS.length - 1
  for (const h of daftar) {
    const i = PRIORITAS_STATUS.indexOf(statusJenisHak(h))
    if (i < terburuk) terburuk = i
  }
  return PRIORITAS_STATUS[terburuk]
}
