// Snapshot BMD PERIOD-CORRECT untuk Rekonsiliasi BMD (Fase 1).
// State 4 ukuran (perolehan, beban, akumulasi, nilai buku) per aset pada AKHIR
// sebuah periode, diagregasi per (golongan, komptabel). Sumber =
// penyusutan_semester(periode) + replay visibilitas & kepemilikan period-aware —
// SAMA PERSIS dengan halaman Penyusutan (app/dashboard/penyusutan/page.tsx),
// jadi angkanya identik & bisa dipakai tie-out. BUKAN aset.status/skpd_id/
// nilai_perolehan terkini (fn_rekap_bmd TIDAK period-correct). Lihat
// docs/rekonsiliasi-bmd-plan.md §4.
import type { SupabaseClient } from '@supabase/supabase-js'
import { comparePeriode, periodeDariTanggal, kodeLevel3, perlakuanKode } from '@/lib/bmd'
import { fetchOwnerOverrides, partitionByPeriodOwner } from '@/lib/pengalihan'

// Event yang menyembunyikan / memunculkan kembali aset — SAMA dgn halaman
// Penyusutan (jangan pakai varian Daftar Barang yg beda kdp_selesai_keluar).
const SEMBUNYI = ['kapitalisasi_serap', 'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_pengadaan', 'koreksi_pencatatan_ganda', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'pemecahan_keluar', 'batal_pemecahan_masuk']
const MUNCUL = ['batal_kapitalisasi', 'batal_penghapusan', 'batal_pemecahan', 'batal_koreksi_pencatatan_ganda']

export type Komptabel = 'intra' | 'ekstra'
export type Measures = { perolehan: number; beban: number; akumulasi: number; nilaiBuku: number; count: number }
export type GolSnapshot = { intra: Measures; ekstra: Measures }
export type Snapshot = Record<string, GolSnapshot> // key = golongan (kodeLevel3)

export const zeroMeasures = (): Measures => ({ perolehan: 0, beban: 0, akumulasi: 0, nilaiBuku: 0, count: 0 })
const zeroGol = (): GolSnapshot => ({ intra: zeroMeasures(), ekstra: zeroMeasures() })
const kompOf = (ie: string | null): Komptabel => (ie === 'ekstra' ? 'ekstra' : 'intra') // null/intra → intra

const BASE_COLS = 'id,kode,skpd_id,nilai_perolehan,intra_ekstra,tgl_perolehan'
type Base = { id: string; kode: string; skpd_id: number | null; nilai_perolehan: number; intra_ekstra: string | null; tgl_perolehan: string | null }
type Peny = { nilai_perolehan: number; beban: number; akumulasi: number; nilai_buku_akhir: number }

// Semua aset dalam scope SKPD (tanpa filter golongan/komptabel — Rekonsiliasi
// butuh semua golongan & kedua kolom komptabel sekaligus).
// PENTING: JANGAN filter status='aktif' — itu membuang aset yang KINI dihapus
// padahal masih sah di periode LAMPAU (persis kelemahan fn_rekap_bmd yg kita
// hindari). Visibilitas period-aware diserahkan ke fetchHiddenIds (pola halaman
// Penyusutan). Hanya 'draft' (belum resmi, mis. KDP/pemecahan blm disetujui)
// yang dibuang — tak pernah boleh masuk laporan.
async function fetchAllBase(supabase: SupabaseClient, descendantIds: number[] | null): Promise<Base[]> {
  const out: Base[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('aset').select(BASE_COLS).neq('status', 'draft')
    if (descendantIds) q = q.in('skpd_id', descendantIds)
    const { data } = await q.range(from, from + 999)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as Base[]))
    if (data.length < 1000) break
  }
  return out
}

// Aset per daftar id (utk barang yg PADA periode terpilih milik scope tapi kini
// sudah pindah keluar — period-aware). Tanpa filter skpd (justru di luar scope).
async function fetchBaseByIds(supabase: SupabaseClient, ids: string[]): Promise<Base[]> {
  const out: Base[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('aset').select(BASE_COLS).in('id', ids.slice(i, i + 200))
    out.push(...((data as unknown as Base[]) || []))
  }
  return out
}

// Hasil engine per aset_id untuk periode terpilih.
async function fetchPeny(supabase: SupabaseClient, ids: string[], periode: string): Promise<Map<string, Peny>> {
  const map = new Map<string, Peny>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('penyusutan_semester')
      .select('aset_id,nilai_perolehan,beban,akumulasi,nilai_buku_akhir')
      .eq('periode', periode).in('aset_id', ids.slice(i, i + 200))
    for (const r of (data || []) as (Peny & { aset_id: string })[]) map.set(r.aset_id, r)
  }
  return map
}

// aset_id yang tersembunyi PADA periode (serap/hapus dgn periode <= viewed,
// dikurangi batal) — replay kronologis SUNGGUHAN (periode lalu id ledger).
async function fetchHiddenIds(supabase: SupabaseClient, ids: string[], periode: string): Promise<Set<string>> {
  const evByAset = new Map<string, { id: number; periode: string; jenis: string }[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,jenis,periode').in('jenis', [...SEMBUNYI, ...MUNCUL] as never).in('aset_id', ids.slice(i, i + 200))
    for (const e of (data || []) as { id: number; aset_id: string; jenis: string; periode: string }[]) {
      const arr = evByAset.get(e.aset_id) || []; arr.push({ id: e.id, periode: e.periode, jenis: e.jenis }); evByAset.set(e.aset_id, arr)
    }
  }
  const hidden = new Set<string>()
  for (const [id, evs] of evByAset) {
    let h = false
    for (const e of evs.filter(e => comparePeriode(e.periode, periode) <= 0).sort((a, b) => comparePeriode(a.periode, b.periode) || a.id - b.id)) {
      if (SEMBUNYI.includes(e.jenis)) h = true
      else if (MUNCUL.includes(e.jenis)) h = false
    }
    if (h) hidden.add(id)
  }
  return hidden
}

// Snapshot period-correct: agregat 4 ukuran per (golongan, komptabel) pada AKHIR
// `periode`, untuk scope SKPD (descendantIds; null = semua/ admin). Identik dgn
// assembleRows halaman Penyusutan, tapi dijumlah bukan di-list.
export async function fetchSnapshot(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<Snapshot> {
  const base = await fetchAllBase(supabase, descendantIds)
  const owners = await fetchOwnerOverrides(supabase, periode)

  let combined = base
  if (descendantIds && descendantIds.length > 0) {
    const scope = new Set(descendantIds)
    const curSkpd = new Map<string, number | null>(base.map(b => [b.id, b.skpd_id]))
    const { keepIds, addIds } = partitionByPeriodOwner(base.map(b => b.id), owners, curSkpd, scope)
    const kept = base.filter(b => keepIds.has(b.id))
    const added = addIds.length > 0 ? await fetchBaseByIds(supabase, addIds) : []
    combined = [...kept, ...added]
  }

  const ids = combined.map(b => b.id)
  const [pmap, hidden] = await Promise.all([fetchPeny(supabase, ids, periode), fetchHiddenIds(supabase, ids, periode)])
  const belumAda = (b: Base) => !!b.tgl_perolehan && comparePeriode(periodeDariTanggal(b.tgl_perolehan), periode) > 0

  const snap: Snapshot = {}
  for (const b of combined) {
    if (hidden.has(b.id) || belumAda(b)) continue
    const p = pmap.get(b.id)
    const susut = perlakuanKode(b.kode) !== 'tidak'
    const perolehan = p ? p.nilai_perolehan : (b.nilai_perolehan || 0)
    const beban = susut && p ? p.beban : 0
    const akumulasi = susut && p ? p.akumulasi : 0
    const nilaiBuku = susut && p ? p.nilai_buku_akhir : perolehan
    const gol = kodeLevel3(b.kode)
    const cell = (snap[gol] ??= zeroGol())[kompOf(b.intra_ekstra)]
    cell.perolehan += perolehan
    cell.beban += beban
    cell.akumulasi += akumulasi
    cell.nilaiBuku += nilaiBuku
    cell.count += 1
  }
  return snap
}

// Ambil sel (golongan, komptabel) dari snapshot dgn fallback nol.
export function measuresOf(snap: Snapshot | undefined, golongan: string, komp: Komptabel): Measures {
  return snap?.[golongan]?.[komp] ?? zeroMeasures()
}
