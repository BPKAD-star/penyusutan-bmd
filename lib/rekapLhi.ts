// Rekap per SKPD untuk LHI — matriks SKPD (baris) × format III.B.1–III.B.12
// (kolom), isi sel = JUMLAH BARANG (permintaan user 2026-10-01, untuk admin
// pemda & auditor). Fungsi MURNI: menghitung & menyusun pohon, tak tahu soal
// Supabase/peran.
//
// ⚠️ Pengklasifikasinya `klasifikasiLhi` — fungsi yang SAMA dgn lembar LHI &
// form LKI, bukan rumus kedua. Satu barang bisa masuk BEBERAPA format (kondisi
// berubah DAN tercatat ganda), jadi menjumlah kolom ke samping BUKAN jumlah
// barang. Itu sebabnya tak ada kolom "Total" per baris; yang tersedia
// `barang` = jumlah barang BERBEDA yang punya minimal satu temuan.
//
// ⚠️ Pohon KUMULATIF seperti lib/rekapPohon.ts: angka induk = dirinya + seluruh
// turunannya, jadi TIDAK berubah waktu dibuka. Baris TOTAL dihitung dari node
// teratas saja — menjumlah baris yang ikut terbuka menghitung turunan DUA KALI.
import { klasifikasiLhi, LHI_URUT, type InvBaris, type LhiKode } from '@/lib/inventarisasi'

export type HitungLhi = Record<LhiKode, number>

export type BarisRekapLhi = { skpdId: number; baris: InvBaris }

export type LeafLhi = { hitung: HitungLhi; barang: number }

export type NodeLhi = {
  skpdId: number
  skpdNama: string
  hitung: HitungLhi
  /** Barang berbeda yang punya ≥ 1 temuan (bukan Σ kolom — lihat kepala berkas). */
  barang: number
  anak?: NodeLhi[]
}

export type SkpdLhi = { id: number; nama: string; parent_id: number | null }

export function hitungKosong(): HitungLhi {
  const h = {} as HitungLhi
  for (const k of LHI_URUT) h[k] = 0
  return h
}

/** Hitung temuan per SKPD pencatat isian (`inventarisasi_barang.skpd_id`). */
export function leafRekapLhi(rows: BarisRekapLhi[]): Map<number, LeafLhi> {
  const leaf = new Map<number, LeafLhi>()
  for (const r of rows) {
    const kode = klasifikasiLhi(r.baris)
    if (kode.length === 0) continue
    const l = leaf.get(r.skpdId) ?? { hitung: hitungKosong(), barang: 0 }
    for (const k of kode) l.hitung[k] += 1
    l.barang += 1
    leaf.set(r.skpdId, l)
  }
  return leaf
}

function tambah(a: HitungLhi, b: HitungLhi) {
  for (const k of LHI_URUT) a[k] += b[k]
}

/**
 * Susun pohon. SKPD yang tak punya temuan sendiri maupun di turunannya tidak
 * disertakan. `akarIds` = id yang jadi baris teratas (admin/auditor: seluruh
 * SKPD induk yang berdata).
 */
export function bangunPohonLhi(
  leaf: Map<number, LeafLhi>, byId: Map<number, SkpdLhi>, akarIds: number[],
): NodeLhi[] {
  // childrenOf hanya dari leluhur leaf — tak bergantung ukuran seluruh admin_skpd.
  const childrenOf = new Map<number, Set<number>>()
  for (const id of leaf.keys()) {
    let cur = byId.get(id)
    const seen = new Set<number>()
    while (cur && cur.parent_id != null && !seen.has(cur.id)) {
      seen.add(cur.id)
      const set = childrenOf.get(cur.parent_id) ?? new Set<number>()
      set.add(cur.id)
      childrenOf.set(cur.parent_id, set)
      cur = byId.get(cur.parent_id)
    }
  }

  function bangun(id: number): NodeLhi | null {
    const anak = [...(childrenOf.get(id) ?? [])]
      .map(bangun).filter((n): n is NodeLhi => n !== null)
      .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
    const sendiri = leaf.get(id)
    if (!sendiri && anak.length === 0) return null

    const hitung = hitungKosong()
    let barang = 0
    if (sendiri) { tambah(hitung, sendiri.hitung); barang += sendiri.barang }
    for (const a of anak) { tambah(hitung, a.hitung); barang += a.barang }
    return {
      skpdId: id, skpdNama: byId.get(id)?.nama || `SKPD #${id}`,
      hitung, barang, anak: anak.length > 0 ? anak : undefined,
    }
  }

  return akarIds.map(bangun).filter((n): n is NodeLhi => n !== null)
    .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
}

/** Total kolom dari node TERATAS saja (lihat catatan kumulatif di kepala berkas). */
export function totalRekapLhi(rows: NodeLhi[]): { hitung: HitungLhi; barang: number } {
  const hitung = hitungKosong()
  let barang = 0
  for (const r of rows) { tambah(hitung, r.hitung); barang += r.barang }
  return { hitung, barang }
}

/** DFS pre-order untuk Export Excel — berkas membawa SELURUH rincian anak. */
export function ratakanPohonLhi(
  rows: NodeLhi[], depth = 0,
): { row: NodeLhi; depth: number; namaBerindentasi: string }[] {
  const out: { row: NodeLhi; depth: number; namaBerindentasi: string }[] = []
  for (const r of rows) {
    out.push({ row: r, depth, namaBerindentasi: `${'— '.repeat(depth)}${r.skpdNama}` })
    if (r.anak) out.push(...ratakanPohonLhi(r.anak, depth + 1))
  }
  return out
}
