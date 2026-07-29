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
import { fetchVoidedAsetIds, fetchBatalTargets } from '@/lib/voidedAset'

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
// ⚠️ Semua kolektor di berkas ini WAJIB: (1) urut `id`; (2) paginasi KEYSET
// (`.gt('id', terakhir)`), BUKAN `.range()`/OFFSET — OFFSET makin dalam makin
// lambat & satu halaman bisa tembus statement timeout; (3) cek `error` lalu
// MELEMPAR. Ketiganya sudah pernah menggigit di repo ini (2026-07-28: filter
// void bocor → Rekonsiliasi kelebihan 6.750.000 tanpa satu pun pesan error).
// Ini modul pelaporan: angka salah yang tak bersuara jauh lebih mahal daripada
// halaman yang error. Lihat CLAUDE.md bagian kolektor halaman-demi-halaman.
const UUID_NOL = '00000000-0000-0000-0000-000000000000'

async function fetchAllBase(supabase: SupabaseClient, descendantIds: number[] | null): Promise<Base[]> {
  const out: Base[] = []
  let terakhir = UUID_NOL
  for (;;) {
    let q = supabase.from('aset').select(BASE_COLS).neq('status', 'draft')
    if (descendantIds) q = q.in('skpd_id', descendantIds)
    const { data, error } = await q.gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`gagal membaca daftar aset: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as unknown as Base[]
    out.push(...rows)
    terakhir = rows[rows.length - 1].id
    if (rows.length < 1000) break
  }
  return out
}

// Aset per daftar id (utk barang yg PADA periode terpilih milik scope tapi kini
// sudah pindah keluar — period-aware). Tanpa filter skpd (justru di luar scope).
async function fetchBaseByIds(supabase: SupabaseClient, ids: string[]): Promise<Base[]> {
  const out: Base[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('aset').select(BASE_COLS).in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca aset lintas-SKPD: ${error.message}`)
    out.push(...((data as unknown as Base[]) || []))
  }
  return out
}

// Hasil engine per aset_id untuk periode terpilih.
async function fetchPeny(supabase: SupabaseClient, ids: string[], periode: string): Promise<Map<string, Peny>> {
  const map = new Map<string, Peny>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('penyusutan_semester')
      .select('aset_id,nilai_perolehan,beban,akumulasi,nilai_buku_akhir')
      .eq('periode', periode).in('aset_id', ids.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca hasil penyusutan periode ${periode}: ${error.message}`)
    for (const r of (data || []) as (Peny & { aset_id: string })[]) map.set(r.aset_id, r)
  }
  return map
}

// aset_id yang tersembunyi PADA periode (serap/hapus dgn periode <= viewed,
// dikurangi batal) — replay kronologis SUNGGUHAN (periode lalu id ledger).
async function fetchHiddenIds(supabase: SupabaseClient, ids: string[], periode: string): Promise<Set<string>> {
  const evByAset = new Map<string, { id: number; periode: string; jenis: string }[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,jenis,periode').in('jenis', [...SEMBUNYI, ...MUNCUL] as never).in('aset_id', ids.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca event visibilitas aset: ${error.message}`)
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
  | 'pengadaan' | 'hibah' | 'tukar' | 'inventarisasi' | 'lainnya' | 'kdp'
  | 'belanja_jasa' | 'penggunaan_masuk' | 'kapitalisasi' | 'koreksi_tambah'
  | 'reklas_fungsi_masuk' | 'reklas_kode_masuk'
  | 'hapus_penjualan' | 'hapus_hibah' | 'hapus_tukar' | 'hapus_penyertaan' | 'hapus_sebab_lain'
  | 'pengalihan_keluar' | 'koreksi_kurang'
  | 'reklas_fungsi_keluar' | 'reklas_kode_keluar'
export type MutasiCell = Partial<Record<MutasiKey, number>> // perolehan per kategori
export type Mutasi = Record<string, { intra: MutasiCell; ekstra: MutasiCell }> // key = golongan

// 'akumulasi_kdp' = termin kontrak konstruksi → penambahan nilai aset KDP (1.3.6).
// Sebelumnya tidak dipetakan sama sekali sehingga jatuh ke baris 'residual'
// (rantai tetap reconcile, tapi tak berlabel). Sekarang punya kategori sendiri.
const JENIS_CARA = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'akumulasi_kdp']
const JENIS_HAPUS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']

type LedRow = {
  id: number; jenis: string; aset_id: string; nilai: number; tanggal: string
  skpd_asal: number | null; skpd_tujuan: number | null
  payload: Record<string, unknown> | null
  aset: { kode: string; skpd_id: number | null; intra_ekstra: string | null; nibar: string | null; nama_barang: string | null } | null
  header: { no_sk: string | null } | null
}

async function fetchLed(supabase: SupabaseClient, jenisList: string[], periode: string): Promise<LedRow[]> {
  const out: LedRow[] = []
  let terakhir = 0
  for (;;) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,jenis,aset_id,nilai,tanggal,skpd_asal,skpd_tujuan,payload,aset:aset_id(kode,skpd_id,intra_ekstra,nibar,nama_barang),header:header_id(no_sk)')
      .eq('periode', periode).in('jenis', jenisList as never)
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`gagal membaca ledger (${jenisList.join(', ')}) periode ${periode}: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as unknown as LedRow[]
    out.push(...rows)
    terakhir = rows[rows.length - 1].id
    if (rows.length < 1000) break
  }
  return out
}

// Kumpulan aset_id yg PERNAH kena void (semua periode — batal_* retroaktif).
// Implementasinya dipindah ke lib/voidedAset.ts (dipakai bersama laporan
// perolehan) — VOID_JENIS-nya identik, dulu diduplikasi di sini & di
// app/dashboard/pelaporan/bmd/page.tsx. 'batal_akumulasi_kdp' ditambahkan:
// kontrak konstruksi yang dibuka kunci membalik SEMUA terminnya, jadi aset KDP
// itu tak boleh dihitung sbg penambahan.
const fetchVoided = (supabase: SupabaseClient, asetIds: string[]) =>
  fetchVoidedAsetIds(supabase, ['batal_akumulasi_kdp'], asetIds)

// target_trx_id yg dibatalkan (kapitalisasi/koreksi/reklas) — implementasi
// dipindah ke lib/voidedAset.ts, dipakai bersama Laporan Pengelolaan.

// aset_id yg NET-terhapus (penghapusan_* belum dibatalkan) — replay "event
// terakhir menang". DIBATASI ke aset yang memang ditanyakan: fungsi ini cuma
// dipakai untuk menilai baris `hapus` di periode ini, jadi tak ada gunanya
// menyapu seluruh riwayat penghapusan sepanjang masa. Versi lama melakukan itu
// dan tembus statement timeout (2026-07-28) — biayanya tumbuh terus mengikuti
// ledger, jadi index pun tak akan menyelamatkan selamanya.
async function fetchNetRemoved(supabase: SupabaseClient, asetIds: string[]): Promise<Set<string>> {
  const latest = new Map<string, { periode: string; id: number; removed: boolean }>()
  const uniq = [...new Set(asetIds)]
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,periode,jenis')
      .in('jenis', [...JENIS_HAPUS, 'batal_penghapusan'] as never)
      .in('aset_id', uniq.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca riwayat penghapusan: ${error.message}`)
    for (const r of (data || []) as { id: number; aset_id: string; periode: string; jenis: string }[]) {
      const cur = latest.get(r.aset_id)
      if (!cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id))
        latest.set(r.aset_id, { periode: r.periode, id: r.id, removed: r.jenis !== 'batal_penghapusan' })
    }
  }
  const out = new Set<string>()
  for (const [id, s] of latest) if (s.removed) out.add(id)
  return out
}

// ── Baris rinci (bukti dukung): 1 transaksi = 1 baris (reklas = 2: keluar+masuk). ──
export type MutasiArah = 'tambah' | 'kurang'
export type MutasiLine = {
  golongan: string; komp: Komptabel; kategori: MutasiKey; arah: MutasiArah
  aset_id: string; nibar: string | null; kode: string; nama: string | null
  skpd_id: number | null; tanggal: string; nilai: number; jenis: string; no_dokumen: string | null
}

const KURANG_KEYS = new Set<MutasiKey>([
  'hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain',
  'pengalihan_keluar', 'koreksi_kurang', 'reklas_fungsi_keluar', 'reklas_kode_keluar',
])

export const KATEGORI_LABEL: Record<MutasiKey, string> = {
  pengadaan: 'Pengadaan', belanja_jasa: 'Perolehan dari rekening Belanja Jasa',
  hibah: 'Hibah', tukar: 'Tukar Menukar', inventarisasi: 'Hasil Inventarisasi', lainnya: 'Perolehan Lainnya',
  kdp: 'Konstruksi Dalam Pengerjaan (termin)',
  penggunaan_masuk: 'Penggunaan (transfer masuk)', kapitalisasi: 'Kapitalisasi', koreksi_tambah: 'Koreksi Nilai (Tambah)',
  reklas_fungsi_masuk: 'Reklas Perubahan Fungsi (Masuk)', reklas_kode_masuk: 'Reklas Kesalahan Kodefikasi (Masuk)',
  hapus_penjualan: 'Penghapusan Pemindahtanganan — Penjualan', hapus_hibah: 'Penghapusan Pemindahtanganan — Hibah',
  hapus_tukar: 'Penghapusan Pemindahtanganan — Tukar Menukar', hapus_penyertaan: 'Penghapusan Pemindahtanganan — Penyertaan Modal',
  hapus_sebab_lain: 'Penghapusan Sebab Lain', pengalihan_keluar: 'Penghapusan Pengalihan (transfer keluar)',
  koreksi_kurang: 'Koreksi Kurang', reklas_fungsi_keluar: 'Reklas Perubahan Fungsi (Keluar)', reklas_kode_keluar: 'Reklas Kesalahan Kodefikasi (Keluar)',
}

// Inti: hitung SEMUA baris mutasi (rinci). fetchMutasi (agregat) & halaman rincian
// berbagi fungsi ini — satu sumber kebenaran, angka pasti konsisten.
async function computeMutasiLines(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<MutasiLine[]> {
  const scope = descendantIds ? new Set(descendantIds) : null
  const inScope = (skpdId: number | null) => skpdId != null && (scope === null || scope.has(skpdId))
  const lines: MutasiLine[] = []
  const push = (gol: string, komp: Komptabel, kategori: MutasiKey, nilai: number, r: LedRow, skpd?: number | null) => {
    if (!nilai) return
    lines.push({
      golongan: gol, komp, kategori, arah: KURANG_KEYS.has(kategori) ? 'kurang' : 'tambah',
      aset_id: r.aset_id, nibar: r.aset?.nibar ?? null, kode: r.aset?.kode ?? '', nama: r.aset?.nama_barang ?? null,
      skpd_id: skpd ?? r.aset?.skpd_id ?? null, tanggal: r.tanggal, nilai, jenis: r.jenis, no_dokumen: r.header?.no_sk ?? null,
    })
  }

  // DUA TAHAP, sengaja. Tahap 1 menarik baris ledger periode ini; tahap 2
  // menanyakan status void/net-removed HANYA untuk aset yang muncul di tahap 1.
  // Versi lama menanyakan keduanya atas SELURUH ledger (259rb baris) sekaligus
  // dgn baris periode ini — itu yang tembus statement timeout beruntun
  // 2026-07-28, dan biayanya bakal terus naik seiring ledger tumbuh.
  const [cara, alih, kap, kapBatal, kor, korBatal, reklasG, reklasK, reklasBatal, hapus] = await Promise.all([
    fetchLed(supabase, JENIS_CARA, periode),
    fetchLed(supabase, ['pengalihan_status'], periode),
    fetchLed(supabase, ['kapitalisasi'], periode),
    fetchBatalTargets(supabase, ['batal_kapitalisasi']),
    fetchLed(supabase, ['koreksi_nilai'], periode),
    fetchBatalTargets(supabase, ['batal_koreksi_nilai']),
    fetchLed(supabase, ['reklas_golongan'], periode),
    fetchLed(supabase, ['reklas_kode'], periode),
    fetchBatalTargets(supabase, ['batal_reklas']),
    fetchLed(supabase, JENIS_HAPUS, periode),
  ])
  const [voided, netRemoved] = await Promise.all([
    fetchVoided(supabase, cara.map(r => r.aset_id)),
    fetchNetRemoved(supabase, hapus.map(r => r.aset_id)),
  ])

  // Cara Perolehan (+ split Belanja Jasa 5.1). jenis dari ledger.
  const caraKey: Record<string, MutasiKey> = { hibah_masuk: 'hibah', tukar_menukar: 'tukar', hasil_inventarisasi: 'inventarisasi', perolehan_lainnya: 'lainnya' }
  for (const r of cara) {
    if (!r.aset || voided.has(r.aset_id) || !inScope(r.aset.skpd_id)) continue
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (r.jenis === 'pengadaan') {
      const rek = typeof r.payload?.kode_rekening === 'string' ? r.payload.kode_rekening : null
      push(gol, komp, rek?.trim().startsWith('5.1') ? 'belanja_jasa' : 'pengadaan', r.nilai, r)
    } else if (r.jenis === 'akumulasi_kdp') {
      push(gol, komp, 'kdp', r.nilai, r)
    } else push(gol, komp, caraKey[r.jenis] || 'lainnya', r.nilai, r)
  }

  // Kapitalisasi (nilai = rehab), buang yg dibatalkan.
  for (const r of kap) {
    if (!r.aset || kapBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
    push(kodeLevel3(r.aset.kode), kompOf(r.aset.intra_ekstra), 'kapitalisasi', r.nilai, r)
  }

  // Koreksi Nilai (delta ±) — tambah (>0) / kurang (<0), buang yg dibatalkan.
  for (const r of kor) {
    if (!r.aset || korBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (r.nilai >= 0) push(gol, komp, 'koreksi_tambah', r.nilai, r)
    else push(gol, komp, 'koreksi_kurang', -r.nilai, r)
  }

  // Pengalihan Status — masuk (Penggunaan) / keluar. skpd_id = sisi in-scope.
  for (const r of alih) {
    if (!r.aset) continue
    const asalIn = inScope(r.skpd_asal), tujuanIn = inScope(r.skpd_tujuan)
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    if (tujuanIn && !asalIn) push(gol, komp, 'penggunaan_masuk', r.nilai, r, r.skpd_tujuan)
    else if (asalIn && !tujuanIn) push(gol, komp, 'pengalihan_keluar', r.nilai, r, r.skpd_asal)
  }

  // Penghapusan — hanya net-removed; dedup per aset.
  const seen = new Set<string>()
  for (const r of hapus) {
    if (!r.aset || !inScope(r.aset.skpd_id) || !netRemoved.has(r.aset_id) || seen.has(r.aset_id)) continue
    seen.add(r.aset_id)
    const gol = kodeLevel3(r.aset.kode), komp = kompOf(r.aset.intra_ekstra)
    const sub = typeof r.payload?.sub_jenis === 'string' ? r.payload.sub_jenis : null
    const key: MutasiKey = sub === 'penjualan' ? 'hapus_penjualan' : sub === 'hibah' ? 'hapus_hibah'
      : sub === 'tukar_menukar' ? 'hapus_tukar' : sub === 'penyertaan_modal' ? 'hapus_penyertaan' : 'hapus_sebab_lain'
    push(gol, komp, key, r.nilai, r)
  }

  // Reklas Perubahan Fungsi (golongan) & Kesalahan Kodefikasi (kode).
  const doReklas = (rows: LedRow[], masuk: MutasiKey, keluar: MutasiKey) => {
    for (const r of rows) {
      if (!r.aset || reklasBatal.has(r.id) || !inScope(r.aset.skpd_id)) continue
      const komp = kompOf(r.aset.intra_ekstra)
      const kodeLama = typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : null
      const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : null
      if (!kodeLama || !kodeBaru) continue
      push(kodeLevel3(kodeLama), komp, keluar, r.nilai, r)
      push(kodeLevel3(kodeBaru), komp, masuk, r.nilai, r)
    }
  }
  doReklas(reklasG, 'reklas_fungsi_masuk', 'reklas_fungsi_keluar')
  doReklas(reklasK, 'reklas_kode_masuk', 'reklas_kode_keluar')

  return lines
}

// Agregasi baris rinci → sel (golongan, komptabel, kategori). DIEKSPOR supaya
// halaman Rekonsiliasi bisa menahan `lines`-nya sendiri untuk drill-down dan
// menjumlah SENDIRI dari baris yang sama persis — angka di popup dijamin sama
// dengan angka di tabel karena keduanya dari satu array, bukan dua query.
export function aggregateMutasi(lines: MutasiLine[]): Mutasi {
  const mut: Mutasi = {}
  for (const l of lines) {
    const cell = (mut[l.golongan] ??= { intra: {}, ekstra: {} })[l.komp]
    cell[l.kategori] = (cell[l.kategori] || 0) + l.nilai
  }
  return mut
}

export async function fetchMutasi(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<Mutasi> {
  return aggregateMutasi(await computeMutasiLines(supabase, periode, descendantIds))
}

// Daftar rinci utk halaman Bukti Dukung — semua transaksi AKTIF yg memengaruhi
// Rekonsiliasi pada periode. Se-pemda (desc=null) atau per SKPD. Sumber sama
// dgn fetchMutasi → angka rincian pasti menjumlah ke agregat Rekonsiliasi.
export async function fetchMutasiLines(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<MutasiLine[]> {
  return computeMutasiLines(supabase, periode, descendantIds)
}

export function mutasiCellOf(mut: Mutasi | undefined, golongan: string, komp: Komptabel): MutasiCell {
  return mut?.[golongan]?.[komp] ?? {}
}

// ── Posisi penyusutan per aset (utk drill-down Rekonsiliasi) ────────────────
// Akuntansi butuh beban/akumulasi/nilai buku barang pembentuk sebuah angka
// mutasi, bukan cuma nilai transaksinya. Aturan perlakuannya SAMA PERSIS dgn
// fetchSnapshot (golongan tak disusutkan → beban & akumulasi 0, nilai buku =
// nilai perolehan) supaya angkanya konsisten dgn baris Saldo Awal/Akhir di
// tabel yang sama.
//
// ⚠️ Ini posisi AKHIR PERIODE per ASET, bukan angka per transaksi. Satu aset
// bisa punya beberapa baris mutasi (reklas keluar+masuk, kapitalisasi berkali-
// kali) — makanya map-nya berkunci aset_id & pemakainya WAJIB menjumlah per
// aset UNIK, jangan per baris (nanti dobel). Aset yang belum punya baris
// penyusutan_semester utk periode itu sengaja TIDAK diisi (bukan nol): biar
// tampil "—" dan ketahuan engine-nya belum dijalankan, bukan terbaca sbg nol.
export type PenyusutanAset = { beban: number; akumulasi: number; nilaiBuku: number }

export async function fetchPenyusutanAset(
  supabase: SupabaseClient, items: { aset_id: string; kode: string }[], periode: string,
): Promise<Map<string, PenyusutanAset>> {
  const uniq = [...new Map(items.map(i => [i.aset_id, i])).values()]
  const pmap = await fetchPeny(supabase, uniq.map(i => i.aset_id), periode)
  const out = new Map<string, PenyusutanAset>()
  for (const it of uniq) {
    const p = pmap.get(it.aset_id)
    if (!p) continue
    const susut = perlakuanKode(it.kode) !== 'tidak'
    out.set(it.aset_id, {
      beban: susut ? p.beban : 0,
      akumulasi: susut ? p.akumulasi : 0,
      nilaiBuku: susut ? p.nilai_buku_akhir : p.nilai_perolehan,
    })
  }
  return out
}
