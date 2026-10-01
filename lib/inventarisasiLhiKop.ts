// Kop lampiran LHI & data induk (III.B.3) — dipisah dari inventarisasiLaporan.ts
// (batas 500 baris/berkas). Diekspor ULANG dari sana, jadi pemakai lama tak berubah.
import type { InvBaris } from '@/lib/inventarisasi'
import { levelSkpd } from '@/lib/formatPermendagri'

// ── Kop lampiran: butir (3) Kuasa PB · (4) PB · (5) Pengelola Barang ────────
/**
 * Pengelola Barang = Badan Keuangan dan Aset Daerah, TETAP untuk semua LHI
 * (keputusan user 2026-10-01). Beda dari `sebutanPejabat` (kaki lembar lain), yang
 * sengaja tak pernah menebak Pengelola Barang.
 */
export const PENGELOLA_BARANG_LHI = 'Badan Keuangan dan Aset Daerah'

/** Tiga baris identitas di kop lampiran. Yang tak diketahui dibiarkan bertitik-titik. */
export type IdentitasLhi = { kuasa?: string; pengguna?: string; pengelola?: string }

/**
 * Isi butir (3)–(5) dari SKPD yang dipilih (keputusan user 2026-10-01):
 *
 *   SKPD level 1 (Pengguna Barang) → Kuasa PB = SKPD itu sendiri, PB = SKPD itu
 *   SKPD level 2+ (sub unit)       → Kuasa PB = SKPD itu, PB = SKPD INDUK (akar)
 *   Pengelola Barang               → selalu Badan Keuangan dan Aset Daerah
 *
 * Tanpa SKPD (se-kabupaten) Kuasa & Pengguna dibiarkan bertitik-titik — tak ada
 * satu unit pun yang bisa disebut — tapi Pengelola tetap terisi.
 * ⚠️ Level 3 (sub kuasa) ikut aturan "sub unit" (sebutan lembar lain,
 * `sebutanPejabat`, juga tak membedakan level 2 dari 3).
 */
export function identitasLhi(
  skpdId: number | null | undefined,
  skpd: { id: number; parent_id: number | null; nama: string }[],
): IdentitasLhi {
  const pengelola = PENGELOLA_BARANG_LHI
  if (skpdId == null) return { pengelola }
  const byId = new Map(skpd.map(x => [x.id, x]))
  const ini = byId.get(skpdId)
  if (!ini) return { pengelola }
  if (levelSkpd(skpdId, new Map(skpd.map(x => [x.id, x.parent_id]))) <= 1) {
    return { kuasa: ini.nama, pengguna: ini.nama, pengelola }
  }
  // Naik ke akar. Dibatasi 20 langkah (pola `levelSkpd`): pohon yang memuat
  // lingkaran tak boleh membekukan lembar cetak.
  let akar = ini
  for (let i = 0; i < 20 && akar.parent_id != null; i++) {
    const atas = byId.get(akar.parent_id)
    if (!atas) break
    akar = atas
  }
  return { kuasa: ini.nama, pengguna: akar.id === ini.id ? undefined : akar.nama, pengelola }
}

// ── Data induk (LHI III.B.3) ────────────────────────────────────────────────
export type IndukLive = Record<string, {
  uraian_barang: string | null; tgl_perolehan: string | null; nilai_perolehan: number | null
}>

/** `YYYY-MM-DD` → `dd/mm/yyyy` (tanggal diurai manual, bukan `new Date` — geser zona waktu). */
export function tglLhi(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/**
 * id aset induk yang datanya (uraian/tanggal/nilai) TIDAK ikut dibekukan di isian
 * — yaitu isian yang dibuat sebelum 2026-10-01. Hanya untuk isian ini laporan
 * perlu membaca register.
 */
export function kebutuhanIndukLive(baris: Pick<InvBaris, 'jawaban'>[]): string[] {
  const ids = new Set<string>()
  for (const b of baris) {
    const j = b.jawaban || {}
    const calon = [j.induk, j.sebab_tidak_ada === 'digabung' ? j.sebab_relasi : undefined]
    for (const p of calon) {
      if (p?.aset_id && (p.nilai_perolehan == null || !p.tgl_perolehan || !p.uraian)) ids.add(p.aset_id)
    }
  }
  return [...ids]
}
