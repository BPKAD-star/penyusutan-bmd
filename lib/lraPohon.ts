// Susun rekap LRA "per SKPD" jadi POHON berjenjang — sama pola dgn
// lib/rekapPohon.ts (drill-down, keputusan user 2026-09-10), TAPI dgn cell
// bentuk `LraCell` (Total LRA · Kapitalisasi · Reklasifikasi · Belanja Modal),
// bukan `MatrixCell` (perolehan/akumulasi/beban/nilaiBuku per golongan).
//
// ⚠️ SENGAJA DUPLIKAT, bukan menggenericize lib/rekapPohon.ts — bentuk cell-nya
// beda total & lib/rekapPohon.ts sudah dipakai 6 komponen lain; menggenericize-
// nya sekarang berarti mengubah kontrak yang sudah stabil demi SATU pemakai
// baru. "Rule of three" (CODING-STANDARD §1.2): ini kemunculan KEDUA pola
// drill-down (yang pertama sudah diekstrak ke rekapPohon.ts sendiri) tapi
// bentuk datanya baru — kalau nanti ada pemakai KETIGA dgn cell yang lagi-lagi
// beda, baru waktunya menggenericize sungguhan.
//
// ⚠️ `cell` tiap node KUMULATIF (dirinya + seluruh turunannya) — TOTAL footer
// pemanggil WAJIB dihitung dari `rows` (baris akar) saja, sama seperti
// RekapMatrixTable. Lihat kepala lib/rekapPohon.ts utk penjelasan lengkap.
import type { LraCell } from '@/lib/lra'

export type LraNode = {
  skpdId: number
  skpdNama: string
  cell: LraCell
  /** Sub-OPD/sub-sub-OPD di bawahnya. `cell` di atas SUDAH memuat jumlah
   *  seluruh anak ini. */
  anak?: LraNode[]
}
export type SkpdRingkas = { id: number; nama: string; parent_id: number | null }

function selKosong(): LraCell {
  return { totalLra: 0, kapitalisasi: 0, reklas: 0, belanjaModal: 0 }
}
function tambahCell(a: LraCell, b: LraCell) {
  a.totalLra += b.totalLra
  a.kapitalisasi += b.kapitalisasi
  a.reklas += b.reklas
  a.belanjaModal += b.belanjaModal
}

/**
 * `leaf` = cell PERSIS pada SKPD yang tercatat di baris (leaf id apa adanya,
 * dari `leafLra()`). `byId` = node SKPD yang relevan (leluhur id-id di
 * `leaf` sudah cukup). `akarIds` = baris TERATAS (admin: root tiap cabang yg
 * berdata; pengurus barang/pembantu: SKPD-nya sendiri).
 *
 * Cabang tanpa data sama sekali (bukan leaf & tak satu pun anaknya berdata)
 * TIDAK disertakan.
 */
export function bangunPohonLra(
  leaf: Map<number, LraCell>,
  byId: Map<number, SkpdRingkas>,
  akarIds: number[],
): LraNode[] {
  const childrenOf = new Map<number, Set<number>>()
  for (const id of leaf.keys()) {
    let cur = byId.get(id)
    while (cur && cur.parent_id != null) {
      const pid = cur.parent_id
      const set = childrenOf.get(pid) ?? new Set<number>()
      set.add(cur.id)
      childrenOf.set(pid, set)
      cur = byId.get(pid)
    }
  }

  function bangun(id: number): LraNode | null {
    const anak = [...(childrenOf.get(id) ?? [])]
      .map(bangun).filter((n): n is LraNode => n !== null)
      .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
    const sendiri = leaf.get(id)
    if (!sendiri && anak.length === 0) return null

    const cell = selKosong()
    if (sendiri) tambahCell(cell, sendiri)
    for (const a of anak) tambahCell(cell, a.cell)

    const nama = byId.get(id)?.nama ?? `SKPD #${id}`
    return { skpdId: id, skpdNama: nama, cell, anak: anak.length > 0 ? anak : undefined }
  }

  return akarIds.map(bangun).filter((n): n is LraNode => n !== null)
    .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
}

/**
 * Ratakan pohon jadi daftar DATAR ber-nama berindentasi — dipakai Export
 * Excel, DFS pre-order (induk dulu, baru anak-anaknya).
 */
export function ratakanPohonLra(
  rows: LraNode[], depth = 0,
): { row: LraNode; depth: number; namaBerindentasi: string }[] {
  const out: { row: LraNode; depth: number; namaBerindentasi: string }[] = []
  for (const r of rows) {
    out.push({ row: r, depth, namaBerindentasi: `${'— '.repeat(depth)}${r.skpdNama}` })
    if (r.anak && r.anak.length > 0) out.push(...ratakanPohonLra(r.anak, depth + 1))
  }
  return out
}
