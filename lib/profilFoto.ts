// Foto profil — disusutkan di BROWSER sebelum diunggah (2026-10-02).
// Hasil akhirnya persegi 400×400 JPEG (±40–120 KB), jadi bucket `foto-profil`
// cukup ber-limit 2 MB & TopBar tak menarik foto ponsel 8 MB tiap halaman.
// Dipotong dari TENGAH (cover) — avatar bulat, jadi sisi panjangnya yang dibuang.

export const UKURAN_FOTO_PROFIL = 400
/** Batas berkas ASLI yang boleh dipilih; yang diunggah tetap hasil susutannya. */
export const MAKS_BERKAS_ASLI = 15 * 1024 * 1024
const TIPE_BOLEH = ['image/jpeg', 'image/png', 'image/webp']

/** Alasan berkas tak boleh dipakai; null = boleh. Murni, bisa diuji. */
export function alasanFotoDitolak(f: { type: string; size: number }): string | null {
  if (!TIPE_BOLEH.includes(f.type)) return 'Format foto harus JPG, PNG, atau WebP.'
  if (f.size > MAKS_BERKAS_ASLI) return 'Ukuran foto terlalu besar (maksimal 15 MB).'
  return null
}

/** Kotak potong persegi dari tengah gambar. Murni, bisa diuji. */
export function kotakPotongTengah(lebar: number, tinggi: number): { sx: number; sy: number; sisi: number } {
  const sisi = Math.min(lebar, tinggi)
  return { sx: Math.floor((lebar - sisi) / 2), sy: Math.floor((tinggi - sisi) / 2), sisi }
}

export async function susutkanFotoProfil(file: File): Promise<Blob> {
  const alasan = alasanFotoDitolak(file)
  if (alasan) throw new Error(alasan)

  const bmp = await createImageBitmap(file)
  try {
    const { sx, sy, sisi } = kotakPotongTengah(bmp.width, bmp.height)
    const kanvas = document.createElement('canvas')
    kanvas.width = UKURAN_FOTO_PROFIL
    kanvas.height = UKURAN_FOTO_PROFIL
    const ctx = kanvas.getContext('2d')
    if (!ctx) throw new Error('Peramban tidak mendukung pengolahan gambar.')
    // Latar putih: PNG transparan jadi JPEG akan hitam tanpa ini.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, UKURAN_FOTO_PROFIL, UKURAN_FOTO_PROFIL)
    ctx.drawImage(bmp, sx, sy, sisi, sisi, 0, 0, UKURAN_FOTO_PROFIL, UKURAN_FOTO_PROFIL)
    const blob = await new Promise<Blob | null>(res => kanvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Gagal memproses foto.')
    return blob
  } finally {
    bmp.close()
  }
}
