// Preferensi "Tahun Kerja" yang dipilih user di halaman login — dipakai sbg
// DEFAULT AWAL filter tahun di halaman ber-pemilih tahun/semester (Daftar
// Barang, Penyusutan, Rekapitulasi Saldo Akhir). BUKAN pembatas/gerbang
// keamanan — itu tetap ditegakkan tahun_buku + trigger di server (lihat
// CLAUDE.md). Ini murni kenyamanan UX: user tetap bebas ganti tahun di
// masing-masing halaman kapan saja, dan tetap bisa lihat tahun terkunci
// (laporan final teraudit justru sering dicari).
const KEY = 'bmd_tahun_kerja_pilihan'

export function getTahunKerjaTersimpan(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(KEY)
}

export function setTahunKerjaTersimpan(tahun: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, tahun)
}

/** Dipakai sbg initializer useState di halaman ber-pemilih tahun — fallback ke `fallback` kalau belum pernah dipilih. */
export function tahunAwal(fallback: string): string {
  return getTahunKerjaTersimpan() || fallback
}
