// Kepemilikan aset PERIOD-AWARE untuk perpindahan antar unit. Mencakup DUA
// jenis yang sama-sama meng-UPDATE aset.skpd_id:
//   * 'pengalihan_status' — transfer antar SKPD (menu Penggunaan/Penghapusan)
//   * 'mutasi_internal'   — perpindahan antar sub-unit dalam satu OPD induk
//                           (menu Pengeluaran/Penerimaan Internal)
// Dulu HANYA pengalihan_status yang diproses, padahal fn_terima_mutasi_internal
// juga `UPDATE aset SET skpd_id = skpd_tujuan` → barang yang pindah sub-unit di
// semester DEPAN ikut ter-atribusi ke sub-unit BARU saat melihat semester
// LAMPAU (riwayat ter-restate). Keduanya berbentuk baris ledger identik
// (skpd_asal/skpd_tujuan terisi) & pengembaliannya sama-sama baris BARU dgn
// asal/tujuan bertukar, jadi replay kronologis di bawah menangani dua-duanya
// tanpa cabang khusus — malah lebih benar untuk aset yang mengalami keduanya.
//
// Dipakai Daftar Barang & Penyusutan supaya barang yang pindah di semester DEPAN
// tetap terhitung di unit ASAL saat melihat semester LAMPAU (integritas akuntansi
// per periode) — dan sebaliknya barang yang MASUK belum muncul sebelum periode
// transfernya. Penyusutan (angka engine) TIDAK terpengaruh: perpindahan tanpa
// efek finansial, hanya atribusi pemilik yang bergeser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { comparePeriode } from '@/lib/bmd'

type Ev = { aset_id: string; id: number; periode: string; skpd_asal: number | null; skpd_tujuan: number | null }

// Jenis ledger yang MEMINDAHKAN aset antar unit (dua-duanya update aset.skpd_id).
const JENIS_PINDAH = ['pengalihan_status', 'mutasi_internal']

// Map aset_id → SKPD pemilik PADA `periode`, HANYA untuk aset yang pernah
// berpindah (punya baris ledger JENIS_PINDAH). Aset lain tidak masuk map
// → pemanggil pakai aset.skpd_id apa adanya.
//
// Cara baca: tiap baris memindahkan aset ke skpd_tujuan pada periode-nya (baris
// reversal/pengembalian = skpd_tujuan berisi SKPD asal). Pemilik pada V =
// skpd_tujuan baris TERAKHIR (urut periode lalu id ledger) yang periode <= V.
// Kalau belum ada baris <= V (V sebelum transfer pertama) → skpd_asal baris
// paling awal (pemilik semula).
export async function fetchOwnerOverrides(
  supabase: SupabaseClient, periode: string
): Promise<Map<string, number | null>> {
  const evByAset = new Map<string, Ev[]>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd')
      .select('aset_id,id,periode,skpd_asal,skpd_tujuan')
      .in('jenis', JENIS_PINDAH as never)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const e of data as Ev[]) {
      const arr = evByAset.get(e.aset_id) || []
      arr.push(e); evByAset.set(e.aset_id, arr)
    }
    if (data.length < 1000) break
  }
  const owner = new Map<string, number | null>()
  for (const [asetId, evs] of evByAset) {
    const sorted = [...evs].sort((a, b) => comparePeriode(a.periode, b.periode) || a.id - b.id)
    const upto = sorted.filter(e => comparePeriode(e.periode, periode) <= 0)
    owner.set(asetId, upto.length > 0 ? upto[upto.length - 1].skpd_tujuan : sorted[0].skpd_asal)
  }
  return owner
}

// Terapkan override kepemilikan ke sekumpulan baris yang difilter per-SKPD.
// Mengembalikan { keepIds, addIds } relatif ke `scope` (descendantIds SKPD yang
// dipilih) pada periode terpilih:
//   - keepIds : id baris `base` (pemilik terkini di scope) yang PADA periode ini
//               MEMANG masih milik scope (buang yang saat itu milik SKPD lain).
//   - addIds  : id aset yang PADA periode ini milik scope tapi kini sudah pindah
//               keluar (tidak ada di `base`) → perlu di-fetch & ditambahkan.
// scope=null (tanpa filter SKPD) → keepIds = semua base, addIds = []. Override
// tampilan (nama SKPD) tetap dipakai lewat `owners` di pemanggil.
export function partitionByPeriodOwner(
  baseIds: string[], owners: Map<string, number | null>, currentSkpdOf: Map<string, number | null>, scope: Set<number> | null
): { keepIds: Set<string>; addIds: string[] } {
  const keepIds = new Set<string>()
  if (!scope) { for (const id of baseIds) keepIds.add(id); return { keepIds, addIds: [] } }
  for (const id of baseIds) {
    const o = owners.has(id) ? (owners.get(id) ?? currentSkpdOf.get(id) ?? null) : (currentSkpdOf.get(id) ?? null)
    if (o != null && scope.has(o)) keepIds.add(id)
  }
  const have = new Set(baseIds)
  const addIds: string[] = []
  for (const [id, o] of owners) {
    if (o != null && scope.has(o) && !have.has(id)) addIds.push(id)
  }
  return { keepIds, addIds }
}
