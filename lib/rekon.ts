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

// ══════════════════════════════════════════════════════════════════════════
// FASE 2 — Dekomposisi mutasi (Penambahan/Pengurangan) untuk NILAI PEROLEHAN.
// Reuse pola Model 3 (app/dashboard/pelaporan/bmd/page.tsx): void/net-removed/
// reklas-dibatalkan sudah teruji reconcile utk perolehan. Diperluas: kategori
// halus (belanja jasa 5.1, kapitalisasi, koreksi ±, penghapusan sub_jenis,
// reklas golongan/kode), per golongan × komptabel. Baris 'residual' =
// penyeimbang: (SaldoAkhir − SaldoAwal) − Σ terpetakan → menjamin rantai
// reconcile & memunculkan yg belum terpetakan (mis. reklas_komptabel).
// Beban/Akumulasi baris mutasi = Fase 3 (belum). Lihat docs/rekonsiliasi-bmd-plan.md.
export type MutasiKey =
  | 'pengadaan' | 'hibah' | 'tukar' | 'inventarisasi' | 'lainnya'
  | 'belanja_jasa' | 'penggunaan_masuk' | 'kapitalisasi' | 'koreksi_tambah'
  | 'reklas_fungsi_masuk' | 'reklas_kode_masuk'
  | 'hapus_penjualan' | 'hapus_hibah' | 'hapus_tukar' | 'hapus_penyertaan' | 'hapus_sebab_lain'
  | 'pengalihan_keluar' | 'koreksi_kurang'
  | 'reklas_fungsi_keluar' | 'reklas_kode_keluar'
export type MutasiCell = Partial<Record<MutasiKey, number>> // perolehan per kategori
export type Mutasi = Record<string, { intra: MutasiCell; ekstra: MutasiCell }> // key = golongan

const JENIS_CARA = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']
const VOID_JENIS = ['batal_pengadaan', 'batal_hibah_masuk', 'batal_tukar_menukar', 'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'koreksi_pencatatan_ganda']
const JENIS_HAPUS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

type LedRow = {
  id: number; jenis: string; aset_id: string; nilai: number; skpd_asal: number | null; skpd_tujuan: number | null
  payload: Record<string, unknown> | null
  aset: { kode: string; skpd_id: number | null; intra_ekstra: string | null } | null
}

async function fetchLed(supabase: SupabaseClient, jenisList: string[], periode: string): Promise<LedRow[]> {
  const out: LedRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,jenis,aset_id,nilai,skpd_asal,skpd_tujuan,payload,aset:aset_id(kode,skpd_id,intra_ekstra)')
      .eq('periode', periode).in('jenis', jenisList as never).range(from, from + 999)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as LedRow[]))
    if (data.length < 1000) break
  }
  return out
}

// Kumpulan aset_id yg PERNAH kena void (semua periode — batal_* retroaktif).
async function fetchVoided(supabase: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd').select('aset_id').in('jenis', VOID_JENIS as never).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as { aset_id: string }[]) out.add(r.aset_id)
    if (data.length < 1000) break
  }
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd').select('aset_id').eq('jenis', 'batal_koreksi_pencatatan_ganda' as never).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as { aset_id: string }[]) out.delete(r.aset_id)
    if (data.length < 1000) break
  }
  return out
}

// target_trx_id yg dibatalkan utk sekumpulan jenis batal_* (kapitalisasi/koreksi/reklas).
async function fetchBatalTargets(supabase: SupabaseClient, jenisList: string[]): Promise<Set<number>> {
  const out = new Set<number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd').select('payload').in('jenis', jenisList as never).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as { payload: { target_trx_id?: number } | null }[]) {
      const t = Number(r.payload?.target_trx_id); if (Number.isFinite(t)) out.add(t)
    }
    if (data.length < 1000) break
  }
  return out
}

// aset_id yg NET-terhapus (penghapusan_* belum dibatalkan) — replay "event terakhir menang".
async function fetchNetRemoved(supabase: SupabaseClient): Promise<Set<string>> {
  const latest = new Map<string, { periode: string; id: number; removed: boolean }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,periode,jenis').in('jenis', [...JENIS_HAPUS, 'batal_penghapusan'] as never).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as { id: number; aset_id: string; periode: string; jenis: string }[]) {
      const cur = latest.get(r.aset_id)
      if (!cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id))
        latest.set(r.aset_id, { periode: r.periode, id: r.id, removed: r.jenis !== 'batal_penghapusan' })
    }
    if (data.length < 1000) break
  }
  const out = new Set<string>()
  for (const [id, s] of latest) if (s.removed) out.add(id)
  return out
}

export async function fetchMutasi(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<Mutasi> {
  const scope = descendantIds ? new Set(descendantIds) : null
  const inScope = (skpdId: number | null) => skpdId != null && (scope === null || scope.has(skpdId))
  const mut: Mutasi = {}
  const add = (gol: string, komp: Komptabel, key: MutasiKey, nilai: number) => {
    if (!nilai) return
    const cell = (mut[gol] ??= { intra: {}, ekstra: {} })[komp]
    cell[key] = (cell[key] || 0) + nilai
  }

  const [cara, alih, kap, kapBatal, kor, korBatal, reklasG, reklasK, reklasBatal, voided, netRemoved] = await Promise.all([
    fetchLed(supabase, JENIS_CARA, periode),
    fetchLed(supabase, ['pengalihan_status'], periode),
    fetchLed(supabase, ['kapitalisasi'], periode),
    fetchBatalTargets(supabase, ['batal_kapitalisasi']),
    fetchLed(supabase, ['koreksi_nilai'], periode),
    fetchBatalTargets(supabase, ['batal_koreksi_nilai']),
    fetchLed(supabase, ['reklas_golongan'], periode),
    fetchLed(supabase, ['reklas_kode'], periode),
    fetchBatalTargets(supabase, ['batal_reklas']),
    fetchVoided(supabase),
    fetchNetRemoved(supabase),
  ])

  // Cara Perolehan (+ split Belanja Jasa 5.1) — Penambahan. jenis dari ledger.
  const caraKey: Record<string, MutasiKey> = { hibah_masuk: 'hibah', tukar_menukar: 'tukar', hasil_inventarisasi: 'inventarisasi', perolehan_lainnya: 'lainnya' }
  for (const r of cara) {
    if (!r.aset || voided.has(r.aset_id) || !inScope(r.aset.skpd_id)) continue
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (r.jenis === 'pengadaan') {
      const rek = typeof r.payload?.kode_rekening === 'string' ? r.payload.kode_rekening : null
      add(gol, komp, rek?.trim().startsWith('5.1') ? 'belanja_jasa' : 'pengadaan', r.nilai)
    } else {
      add(gol, komp, caraKey[r.jenis] || 'lainnya', r.nilai)
    }
  }

  // Kapitalisasi — Penambahan (nilai = rehab), buang yg dibatalkan.
  for (const r of kap) {
    if (!r.aset || kapBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
    add(kodeLevel3(r.aset.kode), kompOf(r.aset.intra_ekstra), 'kapitalisasi', r.nilai)
  }

  // Koreksi Nilai (delta ±) — Penambahan (>0) / Pengurangan (<0), buang yg dibatalkan.
  for (const r of kor) {
    if (!r.aset || korBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (r.nilai >= 0) add(gol, komp, 'koreksi_tambah', r.nilai)
    else add(gol, komp, 'koreksi_kurang', -r.nilai)
  }

  // Pengalihan Status — masuk (Penggunaan) / keluar.
  for (const r of alih) {
    if (!r.aset) continue
    const asalIn = inScope(r.skpd_asal), tujuanIn = inScope(r.skpd_tujuan)
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (tujuanIn && !asalIn) add(gol, komp, 'penggunaan_masuk', r.nilai)
    else if (asalIn && !tujuanIn) add(gol, komp, 'pengalihan_keluar', r.nilai)
  }

  // Penghapusan — Pengurangan (hanya net-removed; dedup per aset).
  const seen = new Set<string>()
  for (const r of await fetchLed(supabase, JENIS_HAPUS, periode)) {
    if (!r.aset || !inScope(r.aset.skpd_id) || !netRemoved.has(r.aset_id) || seen.has(r.aset_id)) continue
    seen.add(r.aset_id)
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    const sub = typeof r.payload?.sub_jenis === 'string' ? r.payload.sub_jenis : null
    const key: MutasiKey = sub === 'penjualan' ? 'hapus_penjualan' : sub === 'hibah' ? 'hapus_hibah'
      : sub === 'tukar_menukar' ? 'hapus_tukar' : sub === 'penyertaan_modal' ? 'hapus_penyertaan' : 'hapus_sebab_lain'
    add(gol, komp, key, r.nilai)
  }

  // Reklas Perubahan Fungsi (golongan) & Kesalahan Kodefikasi (kode) — keluar gol asal, masuk gol tujuan.
  const doReklas = (rows: LedRow[], masuk: MutasiKey, keluar: MutasiKey) => {
    for (const r of rows) {
      if (!r.aset || reklasBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
      const komp = kompOf(r.aset.intra_ekstra)
      const kodeLama = typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : null
      const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : null
      if (!kodeLama || !kodeBaru) continue
      add(kodeLevel3(kodeLama), komp, keluar, r.nilai)
      add(kodeLevel3(kodeBaru), komp, masuk, r.nilai)
    }
  }
  doReklas(reklasG, 'reklas_fungsi_masuk', 'reklas_fungsi_keluar')
  doReklas(reklasK, 'reklas_kode_masuk', 'reklas_kode_keluar')

  return mut
}

export function mutasiCellOf(mut: Mutasi | undefined, golongan: string, komp: Komptabel): MutasiCell {
  return mut?.[golongan]?.[komp] ?? {}
}
