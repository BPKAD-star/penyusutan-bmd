// Konstanta & helper Pemanfaatan BMD — dipakai komponen menu Pemanfaatan &
// halaman KIBAR (bagian VII). Pemanfaatan = overlay atribut, TIDAK mengubah
// nilai/penyusutan (lihat migrasi 20260721_01). Sumber kebenaran = ledger
// (jurnal_header kategori 'pemanfaatan' + transaksi_bmd jenis 'pemanfaatan');
// kolom aset.pemanfaatan cuma cache ringkas utk badge/filter cepat.
import { kodeLevel3 } from '@/lib/bmd'

export type JenisPemanfaatan = 'sewa' | 'pinjam_pakai' | 'ksp' | 'bgs_bsg' | 'kspi'

export const JENIS_PEMANFAATAN: { value: JenisPemanfaatan; label: string }[] = [
  { value: 'sewa', label: 'Sewa' },
  { value: 'pinjam_pakai', label: 'Pinjam Pakai' },
  { value: 'ksp', label: 'Kerja Sama Pemanfaatan (KSP)' },
  { value: 'bgs_bsg', label: 'Bangun Guna Serah / Bangun Serah Guna (BGS/BSG)' },
  { value: 'kspi', label: 'Kerja Sama Penyediaan Infrastruktur (KSPI)' },
]
export const JENIS_PEMANFAATAN_LABEL: Record<string, string> =
  Object.fromEntries(JENIS_PEMANFAATAN.map(j => [j.value, j.label]))

export type Lingkup = 'seluruh' | 'sebagian'
export const LINGKUP_OPT: { value: Lingkup; label: string }[] = [
  { value: 'seluruh', label: 'Seluruhnya' },
  { value: 'sebagian', label: 'Sebagian' },
]

// Golongan yang BOLEH langsung dimanfaatkan (BLOKIR KERAS utk sisanya):
// real estate (Tanah, Gedung & Bangunan, Jalan/Jaringan/Irigasi) + Aset
// Lain-Lain. Barang bergerak (Peralatan & Mesin, ATL) & lainnya WAJIB direklas
// ke Aset Lain-Lain (1.5.4) dulu — keputusan user 2026-07-21.
export const PEMANFAATAN_ELIGIBLE_GOLONGAN = ['1.3.1', '1.3.3', '1.3.4', '1.5.4']

export function isPemanfaatanEligible(kode: string): boolean {
  return PEMANFAATAN_ELIGIBLE_GOLONGAN.includes(kodeLevel3(kode))
}

// Masa berakhir = mulai + masa(tahun). Dihitung eksplisit di UTC dari komponen
// tanggal (hindari geser zona waktu) — kembalikan 'YYYY-MM-DD'. Hari "berakhir"
// = tanggal yang sama N tahun kemudian (mis. mulai 2026-08-12, masa 1 th →
// berakhir 2027-08-12).
export function hitungBerakhir(mulai: string, masaTahun: number): string {
  if (!mulai || !Number.isFinite(masaTahun) || masaTahun <= 0) return ''
  const [y, m, d] = mulai.split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y + Math.trunc(masaTahun), m - 1, d))
  return dt.toISOString().slice(0, 10)
}

const fmtTglPendek = (s: string) => {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  const bulan = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${Number(d)} ${bulan[Number(m)] || m} ${y}`
}

// String cache utk kolom aset.pemanfaatan (badge/filter). Mis:
// "Sewa — Bank Jatim (s.d. 12 Agu 2027)". Bukan sumber kebenaran — detail
// otoritatif tetap di ledger.
export function pemanfaatanCache(jenis: string, mitra: string, berakhir: string): string {
  const label = JENIS_PEMANFAATAN_LABEL[jenis] || jenis
  const mitraTxt = mitra ? ` — ${mitra}` : ''
  const berakhirTxt = berakhir ? ` (s.d. ${fmtTglPendek(berakhir)})` : ''
  return `${label}${mitraTxt}${berakhirTxt}`
}
