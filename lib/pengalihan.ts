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
// ⚠️ KEMBAR dgn predikat partial index `idx_trx_pindah_id` (migrasi 20260729_01).
// Nambah/ubah isi daftar ini WAJIB ikut mengubah predikat indexnya — kalau tidak,
// planner tak bisa membuktikan implikasinya, indexnya diabaikan DIAM-DIAM, dan
// query ini balik menyusuri seluruh ledger (418rb baris) demi segelintir baris.
const JENIS_PINDAH = ['pengalihan_status', 'mutasi_internal']

// Riwayat pindah unit MENTAH (semua periode), dikelompokkan per aset.
// DIPISAH dari fetchOwnerOverrides supaya pemanggil yang butuh BEBERAPA periode
// sekaligus (Rekonsiliasi: saldo awal + saldo akhir) menariknya SEKALI saja —
// `periode` cuma dipakai di reduce client-side, jadi dua panggilan lama itu
// menarik baris yang sama persis dua kali.
export type PindahEvents = Map<string, Ev[]>

export async function fetchPindahEvents(supabase: SupabaseClient): Promise<PindahEvents> {
  // ⚠️ Sengaja TIDAK diberi filter periode/SKPD: pemilik pada periode V hanya
  // bisa diturunkan dari SELURUH riwayat pindah aset itu (baris sesudah V harus
  // ikut terbaca supaya barang yang kini sudah keluar scope tetap ketahuan dulu
  // milik siapa — lihat partitionByPeriodOwner). JANGAN dipotong filternya —
  // hasilnya jadi salah diam-diam.
  //
  // Ini SATU-SATUNYA kolektor di repo yang memang tak bisa discope ke daftar
  // aset (obat yang dipakai kolektor void 2026-07-28). Dan memang pernah
  // timeout: sesudah import ATL Diknas, ledger jadi 418rb baris yang 99,9%-nya
  // `saldo_awal`, sementara baris pindah cuma 4 — planner menyusuri PK urut id
  // menyaring 418rb baris karena qual enum `jenis` tak boleh jadi index-cond di
  // bawah RLS. Obatnya PARTIAL INDEX `idx_trx_pindah_id` (migrasi 20260729_01),
  // yang biayanya ikut jumlah PERPINDAHAN, bukan besar ledger.
  //
  // Keyset (bukan OFFSET) + `error` DIPERIKSA: versi lama menelan errornya, dan
  // map kosong = "tak ada aset yang pernah pindah" — atribusi SKPD jadi salah
  // tanpa satu pun pesan. Pelajaran yang sama dgn filter void (CLAUDE.md).
  const evByAset = new Map<string, Ev[]>()
  let terakhir = 0
  for (;;) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('aset_id,id,periode,skpd_asal,skpd_tujuan')
      .in('jenis', JENIS_PINDAH as never)
      .gt('id', terakhir)
      .order('id', { ascending: true })
      .limit(1000)
    if (error) throw new Error(`gagal membaca riwayat pengalihan/mutasi aset: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as Ev[]
    for (const e of rows) {
      const arr = evByAset.get(e.aset_id) || []
      arr.push(e); evByAset.set(e.aset_id, arr)
      terakhir = e.id
    }
    if (rows.length < 1000) break
  }
  return evByAset
}

// Reduce MURNI (tanpa I/O): riwayat pindah → map aset_id → SKPD pemilik PADA
// `periode`, HANYA untuk aset yang pernah berpindah (punya baris ledger
// JENIS_PINDAH). Aset lain tidak masuk map → pemanggil pakai aset.skpd_id apa
// adanya.
//
// Cara baca: tiap baris memindahkan aset ke skpd_tujuan pada periode-nya (baris
// reversal/pengembalian = skpd_tujuan berisi SKPD asal). Pemilik pada V =
// skpd_tujuan baris TERAKHIR (urut periode lalu id ledger) yang periode <= V.
// Kalau belum ada baris <= V (V sebelum transfer pertama) → skpd_asal baris
// paling awal (pemilik semula).
// Versi LENGKAP: selain SKPD pemilik, sekalian TAHUN barang itu masuk ke SKPD
// tersebut — dibutuhkan kode register, yang segmen tahunnya bukan tahun
// perolehan melainkan "tahun berada di SKPD ini" (lihat lib/kodeRegister.ts).
// `tahunMasuk` null = pada periode itu barangnya belum pernah pindah sama
// sekali, jadi pemanggil jatuh ke tahun perolehannya.
export type PosisiPeriode = { skpd: number | null; tahunMasuk: string | null }

export function posisiAt(evByAset: PindahEvents, periode: string): Map<string, PosisiPeriode> {
  const out = new Map<string, PosisiPeriode>()
  for (const [asetId, evs] of evByAset) {
    const sorted = [...evs].sort((a, b) => comparePeriode(a.periode, b.periode) || a.id - b.id)
    const upto = sorted.filter(e => comparePeriode(e.periode, periode) <= 0)
    const terakhir = upto.length > 0 ? upto[upto.length - 1] : null
    out.set(asetId, terakhir
      // periode berbentuk 'YYYY-S1'/'YYYY-S2' → 4 digit pertama = tahunnya.
      ? { skpd: terakhir.skpd_tujuan, tahunMasuk: terakhir.periode.slice(0, 4) }
      : { skpd: sorted[0].skpd_asal, tahunMasuk: null })
  }
  return out
}

// Diturunkan dari posisiAt supaya aturan "pemilik pada periode V" cuma ditulis
// SEKALI. Perilakunya identik dengan versi sebelumnya — pemanggil lama
// (Daftar Barang, Penyusutan, Rekonsiliasi) tidak perlu berubah.
export function ownersAt(evByAset: PindahEvents, periode: string): Map<string, number | null> {
  const owner = new Map<string, number | null>()
  for (const [asetId, p] of posisiAt(evByAset, periode)) owner.set(asetId, p.skpd)
  return owner
}

// Jalur SATU PERIODE (Daftar Barang & Penyusutan) — tarik + reduce sekaligus.
export async function fetchOwnerOverrides(
  supabase: SupabaseClient, periode: string
): Promise<Map<string, number | null>> {
  return ownersAt(await fetchPindahEvents(supabase), periode)
}

// Sama seperti fetchOwnerOverrides tapi membawa tahun masuk juga — QUERY-nya
// PERSIS SAMA (satu panggilan fetchPindahEvents), jadi halaman yang butuh
// dua-duanya cukup memakai ini SAJA, jangan panggil berdua-duaan.
// MELEMPAR kalau query gagal (lihat fetchPindahEvents) — pemanggil WAJIB punya
// try/catch + setLoading(false) di finally, lihat aturan kolektor fail-closed
// di CLAUDE.md.
export async function fetchPosisiOverrides(
  supabase: SupabaseClient, periode: string
): Promise<Map<string, PosisiPeriode>> {
  return posisiAt(await fetchPindahEvents(supabase), periode)
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
