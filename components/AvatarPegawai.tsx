// Avatar pegawai — ilustrasi kartun laki-laki / perempuan sesuai
// `jenis_kelamin` (permintaan user 2026-08-19, gambarnya diganti 2026-09-10).
// Sebelumnya TopBar cuma menampilkan huruf awal nama, lalu sempat berupa
// siluet SVG gambar tangan; sekarang dua ilustrasi PNG tetap (public/
// avatar-perempuan.png · avatar-laki-laki.png).
//
// ⚠️ TIDAK MENEBAK. Kalau jenis kelaminnya tak diketahui, yang tampil tetap
// huruf awal nama — bukan avatar laki-laki sebagai "bawaan". Menebak jenis
// kelamin orang dari nama itu sering meleset, dan yang meleset di sini terpampang
// permanen di pojok layar orangnya sendiri setiap hari.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={perempuan ? '/avatar-perempuan.png' : '/avatar-laki-laki.png'}
      alt={perempuan ? 'Avatar perempuan' : 'Avatar laki-laki'}
      title={perempuan ? 'Perempuan' : 'Laki-laki'}
      className={`${className} rounded-full object-cover flex-shrink-0`}
    />
  )
}
