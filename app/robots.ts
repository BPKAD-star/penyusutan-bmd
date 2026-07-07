import type { MetadataRoute } from 'next'

// /kibar/* dibaca tanpa login (lihat app/kibar/[nibar]/page.tsx) — ini BUKAN
// kontrol keamanan (URL tetap langsung diakses siapa pun yang tau link/scan
// QR), cuma nyegah data barang pemda ke-index mesin pencari.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/kibar' },
  }
}
