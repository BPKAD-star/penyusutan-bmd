// Avatar pegawai — siluet laki-laki / perempuan sesuai `jenis_kelamin`
// (permintaan user 2026-08-19). Sebelumnya TopBar cuma menampilkan huruf awal nama.
//
// ⚠️ TIDAK MENEBAK. Kalau jenis kelaminnya tak diketahui, yang tampil tetap
// huruf awal nama — bukan avatar laki-laki sebagai "bawaan". Menebak jenis
// kelamin orang dari nama itu sering meleset, dan yang meleset di sini terpampang
// permanen di pojok layar orangnya sendiri setiap hari.
//
// Pembedanya BENTUK RAMBUT, bukan cuma warna: sebagian pengguna sulit
// membedakan warna, dan avatar 28px yang cuma beda rona akan terlihat sama saja.
// Warnanya tetap ikut tema (navy & teal), bukan biru/merah muda.
import { jkDariNip } from '@/lib/usulanPengurus'

export type JenisKelamin = 'L' | 'P' | ''

/**
 * Tentukan jenis kelamin dari kolom `jenis_kelamin`, dengan NIP sebagai cadangan.
 *
 * Cadangan NIP bukan tebakan: digit ke-15 NIP ASN memang menyatakan jenis
 * kelamin (1=L, 2=P) — sudah dipakai `jkDariNip` di menu Daftar Pegawai &
 * Usulan Pengurus. Berguna untuk baris lama yang kolomnya belum terisi.
 */
export function jkPegawai(jenisKelamin?: string | null, nip?: string | null): JenisKelamin {
  const v = (jenisKelamin || '').trim().toUpperCase()
  if (v === 'L' || v === 'P') return v
  const dariNip = jkDariNip(nip || '')
  return dariNip === 'L' || dariNip === 'P' ? dariNip : ''
}

export default function AvatarPegawai({ jk, nama, className = 'w-7 h-7' }: {
  jk: JenisKelamin
  /** Dipakai untuk huruf awal saat jenis kelamin tak diketahui. */
  nama: string
  className?: string
}) {
  if (jk !== 'L' && jk !== 'P') {
    return (
      <span className={`${className} rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
        {(nama || '?').charAt(0).toUpperCase()}
      </span>
    )
  }

  const perempuan = jk === 'P'
  return (
    <span
      className={`${className} rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ${perempuan ? 'bg-teal' : 'bg-navy'}`}
      title={perempuan ? 'Perempuan' : 'Laki-laki'}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full" aria-hidden="true">
        {/* Bahu — digambar lebih dulu supaya kepala & rambut menimpanya. */}
        <path d="M4.5 30c1.4-5.6 5.9-8.8 11.5-8.8S26.1 24.4 27.5 30z" fill="#fff" fillOpacity="0.92" />
        <circle cx="16" cy="13" r="5.6" fill="#fff" fillOpacity="0.92" />
        {perempuan ? (
          // Rambut membingkai wajah + dua juntai di sisi.
          <path
            d="M9.4 21.2c-.9 0-1.6-.8-1.5-1.7l.5-5.6a7.6 7.6 0 0115.2 0l.5 5.6c.1.9-.6 1.7-1.5 1.7h-1.3v-6.9a5.3 5.3 0 00-10.6 0v6.9H9.4z"
            fill="#fff"
            fillOpacity="0.55"
          />
        ) : (
          // Potongan pendek — hanya menutup bagian atas kepala.
          <path
            d="M10.2 12.8a5.8 5.8 0 0111.6 0c-.9-1.6-3-2.5-5.8-2.5s-4.9.9-5.8 2.5z"
            fill="#fff"
            fillOpacity="0.55"
          />
        )}
      </svg>
    </span>
  )
}
