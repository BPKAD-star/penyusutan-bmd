// Tipe & konstanta untuk fitur Usulan Pengurus Barang (Fase 1).
export type UsulanStatus = 'draft' | 'diajukan' | 'disetujui' | 'dikembalikan'

export type UsulanRow = {
  id: string
  skpd_id: number
  nama: string
  nip: string
  pangkat: string | null
  golongan: string | null
  jabatan: string | null
  jenis_kelamin: string | null
  jenis: string
  role_bmd: string
  tahun: number
  status: UsulanStatus
  catatan_admin: string | null
  no_usulan: string | null
  tgl_usulan: string | null
  created_at: string
}

export const STATUS_LABEL: Record<UsulanStatus, string> = {
  draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', dikembalikan: 'Dikembalikan',
}
export const STATUS_BADGE: Record<UsulanStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  diajukan: 'bg-amber-100 text-amber-700',
  disetujui: 'bg-teal/10 text-teal',
  dikembalikan: 'bg-red-100 text-red-700',
}

// Peran (role_bmd) yang boleh diusulkan pengurus barang. Nilai = enum role_bmd
// admin_pegawai (atribut master, TIDAK memengaruhi hak akses/login).
export const PERAN_USULAN: { value: string; label: string }[] = [
  { value: 'pengurus_barang', label: 'Pengurus Barang' },
  { value: 'pengurus_barang_pembantu', label: 'Pengurus Barang Pembantu' },
  { value: 'pembantu_pengurus_barang', label: 'Pembantu Pengurus Barang' },
  { value: 'penatausahaan_barang_pengguna', label: 'Pejabat Penatausahaan Barang Pengguna' },
  { value: 'penanggung_jawab_ruangan', label: 'Penanggung Jawab Ruangan' },
]
export const peranLabel = (v: string | null) => PERAN_USULAN.find(p => p.value === v)?.label || v || '-'

// Pangkat mengikuti golongan/ruang PNS (PP 11/2017). PPPK: golongan angka
// Romawi tanpa pangkat gaya PNS (pangkat dikosongkan).
export const GOLONGAN_PANGKAT: { golongan: string; pangkat: string }[] = [
  { golongan: 'I/a', pangkat: 'Juru Muda' },
  { golongan: 'I/b', pangkat: 'Juru Muda Tingkat I' },
  { golongan: 'I/c', pangkat: 'Juru' },
  { golongan: 'I/d', pangkat: 'Juru Tingkat I' },
  { golongan: 'II/a', pangkat: 'Pengatur Muda' },
  { golongan: 'II/b', pangkat: 'Pengatur Muda Tingkat I' },
  { golongan: 'II/c', pangkat: 'Pengatur' },
  { golongan: 'II/d', pangkat: 'Pengatur Tingkat I' },
  { golongan: 'III/a', pangkat: 'Penata Muda' },
  { golongan: 'III/b', pangkat: 'Penata Muda Tingkat I' },
  { golongan: 'III/c', pangkat: 'Penata' },
  { golongan: 'III/d', pangkat: 'Penata Tingkat I' },
  { golongan: 'IV/a', pangkat: 'Pembina' },
  { golongan: 'IV/b', pangkat: 'Pembina Tingkat I' },
  { golongan: 'IV/c', pangkat: 'Pembina Utama Muda' },
  { golongan: 'IV/d', pangkat: 'Pembina Utama Madya' },
  { golongan: 'IV/e', pangkat: 'Pembina Utama' },
]
export const pangkatDariGolongan = (g: string) =>
  GOLONGAN_PANGKAT.find(x => x.golongan === g)?.pangkat || ''

export const jkLabel = (jk: string | null) => (jk === 'L' ? 'Laki-laki' : jk === 'P' ? 'Perempuan' : '-')

// NIP = 18 angka: lahir(8)+TMT ASN(6)+kelamin(1)+urut(3). Jenis kelamin ada di
// digit ke-15 (1=L, 2=P). Return '' kalau NIP belum 18 digit / digit tak dikenal.
export const jkDariNip = (nip: string) => {
  const s = (nip || '').replace(/\D/g, '')
  if (s.length !== 18) return ''
  return s[14] === '1' ? 'L' : s[14] === '2' ? 'P' : ''
}

