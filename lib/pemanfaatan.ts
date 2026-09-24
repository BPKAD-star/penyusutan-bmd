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
// Gedung & Bangunan + Aset Lain-Lain. Tanah (1.3.1) & Jalan/Jaringan/Irigasi
// (1.3.4) DICABUT dari daftar ini (keputusan user 2026-09-24, membatalkan
// cakupan awal 2026-07-21 yang juga memuat keduanya). Barang bergerak
// (Peralatan & Mesin, ATL) & golongan lain WAJIB direklas ke Aset Lain-Lain
// (1.5.4) dulu.
export const PEMANFAATAN_ELIGIBLE_GOLONGAN = ['1.3.3', '1.5.4']

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

// ── Nilai Pemanfaatan (2026-09-23) ──────────────────────────────────────────
// Cuma jenis yang MENGHASILKAN PENDAPATAN yang butuh nominal — Pinjam Pakai
// itu non-profit (keputusan user), jadi field-nya tak boleh ditawarkan sama
// sekali utk jenis itu (bukan sekadar dikosongkan). Disimpan di
// `jurnal_header.payload.nilai_pemanfaatan`, BUKAN `transaksi_bmd.nilai` —
// baris ledger pemanfaatan SENGAJA selalu `nilai:0` (event netral, tak
// mengubah nilai/penyusutan; lihat `BarangForm.simpan()` di
// components/pengelolaan/Pemanfaatan.tsx). Satu perjanjian = satu nominal,
// pola yang sama dgn `estimasi_hasil` RKBMD (rencana pendapatan, kolom
// TERSENDIRI — bukan menumpang kolom lain).
export const JENIS_BERPENDAPATAN: JenisPemanfaatan[] = ['sewa', 'ksp', 'bgs_bsg', 'kspi']

export function perluNilaiPemanfaatan(jenis: string): boolean {
  return (JENIS_BERPENDAPATAN as string[]).includes(jenis)
}

// ── Visualisasi masa berlangsung (Laporan Pemanfaatan, 2026-09-23) ─────────
// Persentase = seberapa jauh HARI INI berada di antara `mulai` dan `berakhir`.
// `hariIni` WAJIB dioper (bukan `new Date()` di dalam fungsi) — pola yang sama
// dgn `hitungBerakhir` di atas: fungsi pekat tak boleh diam-diam bergantung
// jam sistem, supaya bisa diuji & tak bergeser sehari krn zona waktu.
export type BandPemanfaatan = 'hijau' | 'kuning' | 'oranye' | 'merah' | 'hitam'

function tglUtc(tgl: string): number | null {
  if (!tgl) return null
  const [y, m, d] = tgl.split('-').map(Number)
  if (!y || !m || !d) return null
  return Date.UTC(y, m - 1, d)
}

/** null = tak bisa dinilai (tanggal kosong/tak valid, atau berakhir <= mulai). */
export function persenMasaPemanfaatan(mulai: string, berakhir: string, hariIni: string): number | null {
  const t0 = tglUtc(mulai)
  const t1 = tglUtc(berakhir)
  const tNow = tglUtc(hariIni)
  if (t0 == null || t1 == null || tNow == null || t1 <= t0) return null
  return ((tNow - t0) / (t1 - t0)) * 100
}

// Batas SENGAJA "<" (bukan "<="), pas 25/50/75/100 masuk band di ATASNYA —
// konsisten dgn cara "under 25%/50%/75%/100%" dibaca user secara harfiah.
export function bandPemanfaatan(persen: number): BandPemanfaatan {
  if (persen < 25) return 'hijau'
  if (persen < 50) return 'kuning'
  if (persen < 75) return 'oranye'
  if (persen < 100) return 'merah'
  return 'hitam'
}

export const WARNA_BAND_PEMANFAATAN: Record<BandPemanfaatan, { bar: string; teks: string }> = {
  hijau: { bar: 'bg-green-500', teks: 'text-green-700' },
  kuning: { bar: 'bg-yellow-500', teks: 'text-yellow-700' },
  oranye: { bar: 'bg-orange-500', teks: 'text-orange-700' },
  merah: { bar: 'bg-red-500', teks: 'text-red-700' },
  hitam: { bar: 'bg-black', teks: 'text-gray-900' },
}

/** Notif "siap-siap" HANYA di band merah (75–99%) — permintaan user eksplisit
 *  ("Di range merah itu ada notif"), bukan di hitam (sudah lewat batas). */
export function perluPeringatanPenarikan(band: BandPemanfaatan): boolean {
  return band === 'merah'
}
