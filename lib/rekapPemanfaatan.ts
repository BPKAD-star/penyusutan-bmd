// Rekap per SKPD untuk Laporan Pemanfaatan — matriks SKPD × jenis aset (golongan).
//
// Diturunkan dari baris yang SUDAH dimuat tab Daftar Transaksi (tak ada query
// kedua), jadi mustahil berbeda dari tab sebelahnya — pola Pengamanan.
//
// ⚠️ **HANYA perjanjian berstatus "Aktif".** Daftar Transaksi memuat juga yang
// Selesai/Berakhir sebagai riwayat; menjumlahkannya ke dalam rekap membuat
// "nilai barang yang sedang dimanfaatkan" menggelembung oleh perjanjian yang
// sudah tak berjalan. Dikatakan di layar.
//
// ⚠️ **Satu barang dihitung SEKALI per SKPD**: barang yang sama bisa muncul di
// dua perjanjian Aktif (mis. Lingkup Sebagian, atau dua kartu yang beririsan),
// dan nilai perolehan itu milik BARANG, bukan perjanjian.
//
// Dikelompokkan ke SKPD PENCATAT perjanjian (`jurnal_header.skpd_id`, terkunci) —
// sama dgn kolom SKPD di tab Daftar & dgn yang disaring pemilih SKPD.
import { kodeLevel3 } from '@/lib/bmd'
import type { LeafRekap } from '@/lib/rekapPohon'

export type BarisRekapPemanfaatan = {
  skpdId: number; skpd: string; asetId: string; kode: string
  nilaiPerolehan: number; status: string
}

export function leafRekapPemanfaatan(
  rows: BarisRekapPemanfaatan[], namaSkpd: (id: number, cadangan: string) => string,
): Map<number, LeafRekap> {
  const leaf = new Map<number, LeafRekap>()
  const sudah = new Set<string>()
  for (const r of rows) {
    if (r.status !== 'Aktif') continue
    const kunci = `${r.skpdId}|${r.asetId}`
    if (sudah.has(kunci)) continue
    sudah.add(kunci)
    const l = leaf.get(r.skpdId) ?? { nama: namaSkpd(r.skpdId, r.skpd), cells: {} }
    const c = (l.cells[kodeLevel3(r.kode)] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
    c.perolehan += r.nilaiPerolehan
    leaf.set(r.skpdId, l)
  }
  return leaf
}
