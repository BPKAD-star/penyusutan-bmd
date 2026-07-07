// ============================================================================
// Generator NIBAR — dipakai Pengadaan & PerolehanManual (Hibah/Tukar Menukar/
// Hasil Inventarisasi/Perolehan Lainnya) saat materialize draft → aset.
// Skema (dikonfirmasi user): [12=Prov/Kab][01/02=Intra-Ekstra][3506=Kode Kab
// Kediri][14 digit=kode lokasi, FULL skpd.kode_skpd tanpa titik (5 segmen,
// tak ada yg dibuang)][4 digit=tahun perolehan][12 digit=kode barang tanpa
// titik][7 digit=nomor urut]. "12" & "3506" konstan (app ini khusus Kab.
// Kediri). Nomor urut lanjut dari NIBAR lain yang 38 digit pertamanya sama
// persis (lokasi+kode+tahun sama).
//
// tahun PER-ITEM (bukan satu tahun global) — dibutuhkan krn PerolehanManual
// punya tanggal perolehan per barang (bisa backdate ke tahun lama), beda dari
// Pengadaan yang satu tanggal (BAST) berlaku utk semua barang dlm 1 kontrak.
// ============================================================================
import type { createClient } from '@/lib/supabase/client'

const KODE_PROVINSI_KAB = '12'
const KODE_WILAYAH_KEDIRI = '3506' // Kab. Kediri (Jatim 35, Kediri Kab 06)
const INTRA_EKSTRA_KODE: Record<string, string> = { intra: '01', ekstra: '02' }

export function digitsPad(s: string, len: number): string {
  const clean = (s || '').replace(/\D/g, '')
  return clean.length >= len ? clean.slice(0, len) : clean.padEnd(len, '0')
}

// Segmen lokasi NIBAR (14 digit) dari skpd.kode_skpd. Format kode_skpd =
// s1.s2.s3.s4.s5 (2.2.2.4.4 = 14 digit) — dipakai FULL apa adanya (tanpa buang
// segmen mana pun), sesuai konfirmasi. digitsPad sudah menangani strip titik +
// pad/potong ke 14 digit.
export function kodeLokasiNibar(kodeSkpd: string): string {
  return digitsPad(kodeSkpd, 14)
}

export async function generateNibars(
  supabase: ReturnType<typeof createClient>,
  items: { key: string; kode: string; intraEkstra: 'intra' | 'ekstra'; tahun: string }[],
  kodeSkpdRaw: string,
): Promise<Map<string, string>> {
  const kodeLokasi = kodeLokasiNibar(kodeSkpdRaw)
  const out = new Map<string, string>()
  // Grup by (kode barang + intra/ekstra + tahun) — tahun bisa beda per item
  // (backdate), jadi ikut jadi kunci grup nomor urut.
  const byGroup = new Map<string, typeof items>()
  for (const it of items) {
    const kb = digitsPad(it.kode, 12)
    const gk = `${kb}|${it.intraEkstra}|${it.tahun}`
    const arr = byGroup.get(gk) || []
    arr.push(it)
    byGroup.set(gk, arr)
  }
  for (const [, group] of byGroup) {
    const kodeBarang = digitsPad(group[0].kode, 12)
    const intraKode = INTRA_EKSTRA_KODE[group[0].intraEkstra] || '01'
    const prefix38 = KODE_PROVINSI_KAB + intraKode + KODE_WILAYAH_KEDIRI + kodeLokasi + group[0].tahun + kodeBarang
    const { data } = await supabase.from('aset').select('nibar')
      .like('nibar', `${prefix38}%`).order('nibar', { ascending: false }).limit(1)
    let seq = 0
    if (data && data[0]?.nibar) seq = parseInt(data[0].nibar.slice(-7), 10) || 0
    for (const it of group) {
      seq += 1
      out.set(it.key, prefix38 + String(seq).padStart(7, '0'))
    }
  }
  return out
}
