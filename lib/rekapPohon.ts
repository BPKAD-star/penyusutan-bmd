// Susun rekap "per SKPD" jadi POHON berjenjang (bisa expand/collapse), bukan
// daftar datar — keputusan user 2026-09-10. Baris PALING ATAS yang tampil
// beda per peran: admin lihat SEMUA SKPD induk (level-1) yang punya data;
// pengurus barang/pembantu HANYA lihat SATU akar — SKPD miliknya sendiri —
// lalu bisa membuka anak-anaknya (sub-OPD/sub-sub-OPD) kalau ada. Pemanggil
// (komponen laporan) yang menentukan `akarIds` sesuai perannya; fungsi di
// sini murni menyusun & menjumlah, tak tahu apa-apa soal role.
//
// ⚠️ `cells` tiap node KUMULATIF: sudah menjumlahkan dirinya sendiri +
// SELURUH turunannya. Angka di baris induk karena itu TIDAK BERUBAH waktu
// di-expand — expand cuma memecah angka yang SAMA jadi rincian per anak
// (pola drill-down standar, mis. "ukuran folder" di file explorer). Ini
// wajib diingat pemanggil saat menjumlah baris TOTAL: totalnya dihitung dari
// node PALING ATAS saja (`rows` yang dioper ke RekapMatrixTable), BUKAN dari
// seluruh baris yang sedang kelihatan termasuk yang di-expand — kalau tidak,
// turunan yang sudah ikut hitungan induknya kehitung dua kali.
import type { MatrixCell, MatrixRow } from '@/components/RekapMatrixTable'

export type LeafRekap = { nama: string; cells: Record<string, MatrixCell> }
export type SkpdRingkas = { id: number; nama: string; parent_id: number | null }

function selKosong(): MatrixCell {
  return { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 }
}

function tambahCells(a: Record<string, MatrixCell>, b: Record<string, MatrixCell>) {
  for (const [g, c] of Object.entries(b)) {
    const t = (a[g] ??= selKosong())
    t.perolehan += c.perolehan
    t.akumulasi += c.akumulasi
    t.beban += c.beban
    t.nilaiBuku += c.nilaiBuku
  }
}

/**
 * `leaf` = data PERSIS pada SKPD yang tercatat di baris transaksi (BUKAN
 * root-nya lagi seperti rekap datar lama) — kunci Map = id SKPD apa adanya.
 * `byId` = node SKPD yang relevan (cukup leluhur dari id-id di `leaf`, tak
 * perlu memuat seluruh tabel admin_skpd). `akarIds` = id yang jadi baris
 * TERATAS (lihat catatan peran di kepala berkas).
 *
 * Cabang yang SAMA SEKALI tak berdata (bukan leaf & tak satu pun anaknya
 * berdata) TIDAK disertakan — sejalan dgn rekap datar lama yang cuma
 * menampilkan SKPD yang benar-benar punya transaksi.
 */
export function bangunPohonRekap(
  leaf: Map<number, LeafRekap>,
  byId: Map<number, SkpdRingkas>,
  akarIds: number[],
): MatrixRow[] {
  // childrenOf DIBANGUN HANYA dari leluhur leaf yang ada — bukan seluruh
  // admin_skpd — biar fungsi murni ini tak bergantung pada ukuran tabelnya.
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

  function bangun(id: number): MatrixRow | null {
    const anak = [...(childrenOf.get(id) ?? [])]
      .map(bangun).filter((n): n is MatrixRow => n !== null)
      .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
    const sendiri = leaf.get(id)
    if (!sendiri && anak.length === 0) return null

    const cells: Record<string, MatrixCell> = {}
    if (sendiri) tambahCells(cells, sendiri.cells)
    for (const a of anak) tambahCells(cells, a.cells)

    const nama = sendiri?.nama || byId.get(id)?.nama || `SKPD #${id}`
    return { skpdId: id, skpdNama: nama, cells, anak: anak.length > 0 ? anak : undefined }
  }

  return akarIds.map(bangun).filter((n): n is MatrixRow => n !== null)
    .sort((a, b) => a.skpdNama.localeCompare(b.skpdNama))
}

/**
 * Ratakan pohon jadi daftar baris DATAR ber-nama berindentasi ("— " × depth)
 * — dipakai Export Excel, supaya berkasnya membawa SELURUH rincian (bukan
 * cuma baris teratas yang kelihatan di layar sebelum di-expand). Urutan DFS
 * pre-order: induk dulu, baru anak-anaknya — jadi berkasnya tetap terbaca
 * sebagai pohon walau Excel tak punya baris kelompok bisa-dilipat.
 */
export function ratakanPohon(
  rows: MatrixRow[], depth = 0,
): { row: MatrixRow; depth: number; namaBerindentasi: string }[] {
  const out: { row: MatrixRow; depth: number; namaBerindentasi: string }[] = []
  for (const r of rows) {
    out.push({ row: r, depth, namaBerindentasi: `${'— '.repeat(depth)}${r.skpdNama}` })
    if (r.anak && r.anak.length > 0) out.push(...ratakanPohon(r.anak, depth + 1))
  }
  return out
}
