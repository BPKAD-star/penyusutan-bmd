// Indikator kecil "sudah/belum ada titik koordinat di GIS" (permintaan user
// 2026-09-25) — dipakai kolom Lokasi Daftar Barang & Daftar Barang Awal, DAN
// daftar register di GIS Tanah. Satu komponen dipakai di ketiga tempat supaya
// "icon map yang sama" (kata user) benar-benar sama, bukan tiga SVG yang
// gampang menyimpang kalau disalin.
//
// Pin teal = sudah dipetakan (aset.latitude/longitude terisi). Titik merah =
// belum — sengaja BUKAN "-" polos, biar operator bisa menyisir kolom ini
// sekilas tanpa membaca teks satu per satu.
export function IkonTitikAda({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
      className={`inline w-3 h-3 flex-shrink-0 text-teal-600 ${className}`}>
      <title>Sudah ada titik koordinat di GIS</title>
      <path fillRule="evenodd" clipRule="evenodd"
        d="M10 18s6-5.686 6-10a6 6 0 10-12 0c0 4.314 6 10 6 10zm0-7a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  )
}

export function IkonTitikTiada({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" title="Belum ada titik koordinat di GIS"
      className={`inline-block w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0 ${className}`} />
  )
}

/** `ada` = `latitude != null && longitude != null` pada baris asetnya. */
export function IkonTitikKoordinat({ ada, className = '' }: { ada: boolean; className?: string }) {
  return ada ? <IkonTitikAda className={className} /> : <IkonTitikTiada className={className} />
}
