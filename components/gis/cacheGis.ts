// Cache data peta GIS Tanah DI BROWSER (permintaan user 2026-10-04) — pola &
// penjagaannya SAMA dgn Dashboard (components/dashboard/cacheDashboard.ts:
// sessionStorage, kunci per uid + versi, umur 10 menit, dihapus saat logout).
//
// ⚠️ Sama seperti Dashboard, ini BUKAN cache yang melewati query: peta tetap
// memuat ulang dari server SETIAP kali dibuka; data tersimpan hanya mengisi
// peta & daftar selama ±2 detik itu, ditandai "Data tersimpan pukul …", lalu
// ditimpa. Selama yang tampil masih data tersimpan, seluruh aksi TULIS (Set/
// Hapus Titik, Kelola Bidang) dimatikan — kalau tidak, tulisan optimistis di
// atas baris lama bisa tertimpa data segar yang tiba sesudahnya.
//
// Kenapa DIPADATKAN: admin se-kabupaten ±2.700 register + ±3.700 bidang =
// ±2,4 juta karakter JSON berkunci, ±4,8 MB di sessionStorage (UTF-16) — mepet
// kuota ±5 MB per origin, padahal Dashboard ikut menumpang di situ. Disimpan
// sbg tuple (array per baris, urutan kolom tetap) supaya nama kolom tak diulang
// ribuan kali; ukurannya turun ±setengahnya. Kalau tetap gagal disimpan,
// `tulisCache` menelannya & membuang salinan lama — peta jalan seperti biasa.

export type AsetGis = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null; uraian_barang: string | null
  spesifikasi_lainnya: string | null; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null
  nama_dokumen_kepemilikan: string | null; tanggal_dokumen_kepemilikan: string | null
  tgl_perolehan: string | null; nilai_perolehan: number
  luas: number | null
  alamat_detail: string | null
  latitude: number | null; longitude: number | null
  skpd_id: number | null; skpd: { nama: string } | null
}
export type BidangGis = {
  aset_id: string; jenis_hak: string | null; nomor_dokumen_kepemilikan: string | null
  luas: number | null; latitude: number | null; longitude: number | null
}

/** Naikkan kalau urutan/isi tuple berubah — salinan lama lalu dianggap tak ada. */
export const VERSI_PAK_GIS = 1

type TupleAset = [
  string, string | null, string, string | null, string | null, string | null, string | null, string | null,
  string | null, string | null, string | null, string | null, number, number | null, number | null,
  number | null, number | null, string | null,
]
type TupleBidang = [string, string | null, string | null, number | null, number | null, number | null]
export type PakGis = { v: number; a: TupleAset[]; b: TupleBidang[] }

export function pakGis(rows: AsetGis[], bidangByAset: Record<string, BidangGis[]>): PakGis {
  const a: TupleAset[] = rows.map(r => [
    r.id, r.nibar, r.kode, r.nama_barang, r.uraian_barang, r.spesifikasi_lainnya, r.alamat_detail, r.jenis_hak,
    r.nomor_dokumen_kepemilikan, r.nama_dokumen_kepemilikan, r.tanggal_dokumen_kepemilikan, r.tgl_perolehan,
    r.nilai_perolehan, r.luas, r.latitude, r.longitude, r.skpd_id, r.skpd?.nama ?? null,
  ])
  const b: TupleBidang[] = []
  for (const list of Object.values(bidangByAset)) {
    for (const x of list) b.push([x.aset_id, x.jenis_hak, x.nomor_dokumen_kepemilikan, x.luas, x.latitude, x.longitude])
  }
  return { v: VERSI_PAK_GIS, a, b }
}

export function bukaPakGis(p: PakGis): { rows: AsetGis[]; bidangByAset: Record<string, BidangGis[]> } {
  const rows: AsetGis[] = p.a.map(t => ({
    id: t[0], nibar: t[1], kode: t[2], nama_barang: t[3], uraian_barang: t[4], spesifikasi_lainnya: t[5],
    alamat_detail: t[6], jenis_hak: t[7], nomor_dokumen_kepemilikan: t[8], nama_dokumen_kepemilikan: t[9],
    tanggal_dokumen_kepemilikan: t[10], tgl_perolehan: t[11], nilai_perolehan: t[12], luas: t[13], latitude: t[14],
    longitude: t[15], skpd_id: t[16], skpd: t[17] == null ? null : { nama: t[17] },
  }))
  const bidangByAset: Record<string, BidangGis[]> = {}
  for (const t of p.b) {
    ;(bidangByAset[t[0]] ||= []).push({ aset_id: t[0], jenis_hak: t[1], nomor_dokumen_kepemilikan: t[2], luas: t[3], latitude: t[4], longitude: t[5] })
  }
  return { rows, bidangByAset }
}

// ── Pemeriksa bentuk — isi yang aneh dianggap tak ada (pola sahScan) ────────
const teks = (x: unknown): x is string => typeof x === 'string'
const teksAtauNull = (x: unknown) => x === null || typeof x === 'string'
const angka = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const angkaAtauNull = (x: unknown) => x === null || angka(x)

function sahTupleAset(t: unknown): boolean {
  if (!Array.isArray(t) || t.length !== 18) return false
  return teks(t[0]) && teksAtauNull(t[1]) && teks(t[2])
    && [3, 4, 5, 6, 7, 8, 9, 10, 11, 17].every(i => teksAtauNull(t[i]))
    && angka(t[12])
    && [13, 14, 15, 16].every(i => angkaAtauNull(t[i]))
}

function sahTupleBidang(t: unknown): boolean {
  if (!Array.isArray(t) || t.length !== 6) return false
  return teks(t[0]) && teksAtauNull(t[1]) && teksAtauNull(t[2]) && [3, 4, 5].every(i => angkaAtauNull(t[i]))
}

export function sahPakGis(d: unknown): d is PakGis {
  if (typeof d !== 'object' || d === null) return false
  const o = d as Record<string, unknown>
  return o.v === VERSI_PAK_GIS && Array.isArray(o.a) && Array.isArray(o.b)
    && o.a.every(sahTupleAset) && o.b.every(sahTupleBidang)
}
