// Snapshot BMD PERIOD-CORRECT untuk Rekonsiliasi BMD (Fase 1).
// State 4 ukuran (perolehan, beban, akumulasi, nilai buku) per aset pada AKHIR
// sebuah periode, diagregasi per (golongan, komptabel). Sumber =
// penyusutan_semester(periode) + replay visibilitas & kepemilikan period-aware —
// SAMA PERSIS dengan halaman Penyusutan (app/dashboard/penyusutan/page.tsx),
// jadi angkanya identik & bisa dipakai tie-out. BUKAN aset.status/skpd_id/
// nilai_perolehan terkini (fn_rekap_bmd TIDAK period-correct). Lihat
// docs/rekonsiliasi-bmd-plan.md §4.
import type { SupabaseClient } from '@supabase/supabase-js'
import { kodeLevel3, perlakuanKode } from '@/lib/bmd'
import { fetchPindahEvents, ownersAt, partitionByPeriodOwner, type PindahEvents } from '@/lib/pengalihan'
import { fetchVoidedAsetIds, fetchBatalTargets, fetchPemecahanBatal, kunciPemecahan } from '@/lib/voidedAset'
import { fetchHiddenIds, belumAdaPada, SEMBUNYI_PENYUSUTAN } from '@/lib/visibilitas'
import { fetchReklasEvents, kodeAt, type ReklasEvents } from '@/lib/reklasKode'

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

// ── Posisi BASELINE dari ledger (saldo_awal / saldo_awal_checkpoint) ────────
// Engine SENGAJA tidak menghasilkan baris `penyusutan_semester` untuk periode
// baseline (2025-S2): posisi akhir 2025 itu data impor e-BMD, bukan hasil
// hitung. Ia tersimpan di payload ledger `saldo_awal` (418.102 baris) —
// `akumulasi_2025` & `nilai_buku_awal`.
//
// ⚠️ Tanpa ini, snapshot 2025-S2 mengembalikan akumulasi 0 untuk SEMUA aset,
// sehingga baris SALDO AWAL Rekonsiliasi Semester I tampil berakumulasi nol dan
// seluruh akumulasi awal terlempar ke baris "Selisih (belum terpetakan)".
// Terbukti di produksi 2026-08-11: BKAD 1.3.2 intra, Selisih akumulasi
// 926.099.171 = persis (akumulasi akhir 965.096.688 − beban periode 38.997.517).
//
// `saldo_awal_checkpoint` (hasil fn_tutup_tahun) ikut dibaca dgn bentuk payload
// yang sama; yang dipakai adalah checkpoint TERBARU yang periodenya <= periode
// yang diminta — pola yang sama dgn hitungJadwalAset di engine.
type Baseline = { akumulasi: number; nilaiBuku: number }

async function fetchBaselinePos(
  supabase: SupabaseClient, ids: string[], periode: string,
): Promise<Map<string, Baseline>> {
  const pilih = new Map<string, { periode: string; b: Baseline }>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('aset_id,periode,payload')
      .in('jenis', ['saldo_awal', 'saldo_awal_checkpoint'])
      .in('aset_id', ids.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca saldo awal baseline: ${error.message}`)
    for (const r of (data || []) as { aset_id: string; periode: string; payload: Record<string, unknown> | null }[]) {
      // Checkpoint yang lahir SESUDAH periode ini belum berlaku untuknya.
      // Perbandingan string aman: format periode selalu `YYYY-Sn`.
      if (r.periode > periode) continue
      const cur = pilih.get(r.aset_id)
      if (cur && cur.periode >= r.periode) continue
      const p = r.payload || {}
      const akumulasi = Number(p.akumulasi_2025 ?? 0) || 0
      const nb = Number(p.nilai_buku_awal ?? 0) || 0
      pilih.set(r.aset_id, { periode: r.periode, b: { akumulasi, nilaiBuku: nb } })
    }
  }
  const out = new Map<string, Baseline>()
  for (const [id, v] of pilih) out.set(id, v.b)
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

// Bahan yang SAMA untuk berapa pun periode yang di-snapshot: daftar aset dalam
// scope + riwayat pindah unit. Rekonsiliasi selalu minta DUA snapshot (saldo
// awal & saldo akhir) dgn descendantIds yang sama — tanpa konteks bersama ini,
// kedua panggilan menarik baris yang persis sama dua kali, termasuk sapuan
// riwayat pindah yang sempat timeout (lihat fetchPindahEvents).
export type SnapshotCtx = { base: Base[]; pindah: PindahEvents; reklas: ReklasEvents }

export async function prepareSnapshotCtx(
  supabase: SupabaseClient, descendantIds: number[] | null
): Promise<SnapshotCtx> {
  const [base, pindah, reklas] = await Promise.all([
    fetchAllBase(supabase, descendantIds),
    fetchPindahEvents(supabase),
    // Riwayat reklas ikut ke ctx dgn alasan yang sama dgn `pindah`: kedua
    // snapshot (saldo awal & akhir) membutuhkannya, dan tanpa konteks bersama
    // baris yang persis sama ditarik dua kali.
    fetchReklasEvents(supabase),
  ])
  return { base, pindah, reklas }
}

// Posisi SATU aset pada akhir sebuah periode + sel (golongan × komptabel) tempat
// ia berada saat itu. Ini bentuk ANTARA dari snapshot: agregat tinggal dijumlah
// darinya (aggregatePositions), sementara Fase 3 butuh yang per-aset — atribusi
// beban/akumulasi bergantung pada apakah SATU aset pindah/masuk/keluar sel
// antara periode P−1 dan P, dan itu tak bisa dijawab dari angka yang sudah
// terlanjur dijumlah.
export type PosAset = { gol: string; komp: Komptabel; perolehan: number; beban: number; akumulasi: number; nilaiBuku: number }

// Snapshot period-correct dalam bentuk per-aset: posisi tiap aset yang TERLIHAT
// pada akhir `periode`, untuk scope SKPD (descendantIds; null = semua/admin).
// Identik dgn assembleRows halaman Penyusutan.
// `ctx` opsional: isi kalau memanggil >1 periode dgn scope yang sama.
//
// ⚠️ Beratnya ikut jumlah aset dalam scope (se-pemda ≈ 227rb entri). Itu memang
// sudah jadi sifat halaman ini sejak Fase 1 (`combined` & `pmap` sama besarnya);
// pemindahan agregasi ke RPC ada di REFACTOR-PLAN §"Rekonsiliasi & Laporan BMD".
export async function fetchSnapshotPositions(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null, ctx?: SnapshotCtx
): Promise<Map<string, PosAset>> {
  const { base, pindah, reklas } = ctx ?? await prepareSnapshotCtx(supabase, descendantIds)
  const owners = ownersAt(pindah, periode)
  // Golongan PADA PERIODE INI, bukan `aset.kode` terkini. Tanpa ini, aset yang
  // direklas sudah duduk di golongan BARU di saldo awal MAUPUN akhir, lalu
  // masih ditambah lagi oleh baris mutasi "reklas masuk" — dobel di golongan
  // tujuan, kurang di golongan asal. Dulu terpin sbg DUGAAN BUG di
  // tests/golden/rekonsiliasi.test.ts.
  const kodeSaatItu = kodeAt(reklas, periode)

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
  const [pmap, hidden] = await Promise.all([
    fetchPeny(supabase, ids, periode),
    fetchHiddenIds(supabase, ids, periode, SEMBUNYI_PENYUSUTAN),
  ])

  // Aset yang TERLIHAT pada periode ini tapi tak punya baris engine — untuk
  // periode baseline (2025-S2) itu SEMUA aset, karena engine memang tak pernah
  // menghitung 2025. Posisinya diambil dari ledger saldo awal. Sengaja hanya
  // untuk yang missing: pada 2026-S1/S2 hampir semua aset punya baris engine,
  // jadi query tambahan ini praktis tak berbiaya di sana.
  const terlihat = combined.filter(b => !hidden.has(b.id) && !belumAdaPada(b.tgl_perolehan, periode))
  const tanpaEngine = terlihat.filter(b => !pmap.get(b.id)).map(b => b.id)
  const bmap = tanpaEngine.length > 0
    ? await fetchBaselinePos(supabase, tanpaEngine, periode)
    : new Map<string, Baseline>()

  const pos = new Map<string, PosAset>()
  for (const b of terlihat) {
    const p = pmap.get(b.id)
    // Golongan & perlakuan ikut kode SAAT ITU (reklas period-aware) — barang
    // yang direklas MASUK ke 1.5.4 Aset Lain-Lain berhenti disusutkan sejak
    // reklasnya, bukan surut ke periode sebelum reklas. Dipakai kedua cabang di
    // bawah supaya posisi dari engine & dari baseline mendarat di sel yang sama.
    const kode = kodeSaatItu.get(b.id) ?? b.kode
    const susut = perlakuanKode(kode) !== 'tidak'
    const gol = kodeLevel3(kode)
    const komp = kompOf(b.intra_ekstra)

    if (p) {
      const nilai = p.nilai_perolehan
      pos.set(b.id, {
        gol, komp,
        perolehan: nilai,
        beban: susut ? p.beban : 0,
        akumulasi: susut ? p.akumulasi : 0,
        nilaiBuku: susut ? p.nilai_buku_akhir : nilai,
      })
      continue
    }

    // Tanpa baris engine → pakai baseline ledger. `beban` tetap 0: beban itu
    // ARUS sebuah periode, dan periode baseline bukan periode yang dilaporkan
    // di sini (kolom Beban baris SALDO AWAL diisi `bebanSaldoAwal`, yakni beban
    // periode BERJALAN atas populasi awal — lihat attribusiPenyusutan).
    // ⚠️ `perolehan` tetap dari register (`aset.nilai_perolehan`), BUKAN nilai
    // beku akhir 2025. Untuk barang yang dikapitalisasi/dikoreksi di 2026 itu
    // sedikit terlalu besar; rantai perolehan selama ini sudah tie-out dengan
    // cara ini, jadi tidak diubah bersamaan dengan perbaikan akumulasi.
    const bl = susut ? bmap.get(b.id) : undefined
    const perolehan = b.nilai_perolehan || 0
    const akumulasi = bl?.akumulasi ?? 0
    pos.set(b.id, {
      gol, komp,
      perolehan, beban: 0, akumulasi,
      nilaiBuku: bl ? (bl.nilaiBuku || perolehan - akumulasi) : perolehan,
    })
  }
  return pos
}

export function aggregatePositions(pos: Map<string, PosAset>): Snapshot {
  const snap: Snapshot = {}
  for (const p of pos.values()) {
    const cell = (snap[p.gol] ??= zeroGol())[p.komp]
    cell.perolehan += p.perolehan
    cell.beban += p.beban
    cell.akumulasi += p.akumulasi
    cell.nilaiBuku += p.nilaiBuku
    cell.count += 1
  }
  return snap
}

// Agregat 4 ukuran per (golongan, komptabel). Pemakai yang butuh atribusi Fase 3
// harus lewat fetchSnapshotPositions + aggregatePositions supaya posisi
// per-asetnya tidak dihitung dua kali.
export async function fetchSnapshot(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null, ctx?: SnapshotCtx
): Promise<Snapshot> {
  return aggregatePositions(await fetchSnapshotPositions(supabase, periode, descendantIds, ctx))
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
// FASE 3 (attribusiPenyusutan, di bawah) mengisi Beban & Akumulasi baris mutasi.
// Lihat docs/rekonsiliasi-bmd-plan.md §5.3–5.4.
export type MutasiKey =
  | 'pengadaan' | 'hibah' | 'tukar' | 'inventarisasi' | 'lainnya' | 'kdp'
  | 'belanja_jasa' | 'penggunaan_masuk' | 'kapitalisasi' | 'koreksi_tambah'
  | 'pemecahan_masuk' | 'reklas_fungsi_masuk' | 'reklas_kode_masuk'
  | 'hapus_penjualan' | 'hapus_hibah' | 'hapus_tukar' | 'hapus_penyertaan' | 'hapus_sebab_lain'
  | 'pengalihan_keluar' | 'koreksi_kurang' | 'pemecahan_keluar'
  | 'reklas_fungsi_keluar' | 'reklas_kode_keluar'
// Tiga ukuran per kategori. Nilai Buku SENGAJA tidak ikut: ia SELALU diturunkan
// (`perolehan − akumulasi`) dan tak pernah dijumlah vertikal — kalau disimpan
// sbg angka sendiri, cepat atau lambat ada yang menjumlahkannya antar baris dan
// hasilnya salah (docs/rekonsiliasi-bmd-plan.md §6).
export type UkuranMutasi = { perolehan: number; beban: number; akumulasi: number }
export const zeroUkuran = (): UkuranMutasi => ({ perolehan: 0, beban: 0, akumulasi: 0 })
export type MutasiCell = Partial<Record<MutasiKey, UkuranMutasi>>
export type Mutasi = Record<string, { intra: MutasiCell; ekstra: MutasiCell }> // key = golongan

// 'akumulasi_kdp' = termin kontrak konstruksi → penambahan nilai aset KDP (1.3.6).
// Sebelumnya tidak dipetakan sama sekali sehingga jatuh ke baris 'residual'
// (rantai tetap reconcile, tapi tak berlabel). Sekarang punya kategori sendiri.
// Diekspor untuk `lib/sinkronisasi.test.ts` — daftar cara perolehan hidup di
// lima tempat (lihat JENIS_PEROLEHAN di lib/bmd.ts) dan `tukar_menukar` sempat
// hilang dari salah satunya selama berbulan-bulan tanpa satu pun error.
export const JENIS_CARA = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'akumulasi_kdp']
const JENIS_HAPUS = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']
// Pemecahan Barang. Rencana §1 keputusan #4 dulu menyebutnya "diabaikan
// (net-nol)" — itu KELIRU dan sudah terbukti 2026-08-05: induk & pecahan bisa
// jatuh di KOLOM KOMPTABEL yang berbeda (Rehab Garasi Grogol 167.324.933 intra
// → 7 lapak ekstra), persis seperti reklas komptabel. Net-nol cuma benar kalau
// dijumlah lintas-sel; per sel ia penambahan/pengurangan sungguhan, dan tanpa
// kategori sendiri angkanya nyangkut di baris Selisih tanpa penjelasan.
const JENIS_PECAH = ['pemecahan_keluar', 'pemecahan_masuk']

type LedRow = {
  id: number; jenis: string; aset_id: string; nilai: number; tanggal: string
  skpd_asal: number | null; skpd_tujuan: number | null
  header_id: string | null
  payload: Record<string, unknown> | null
  aset: { kode: string; skpd_id: number | null; intra_ekstra: string | null; nibar: string | null; nama_barang: string | null } | null
  header: { no_sk: string | null } | null
}

async function fetchLed(supabase: SupabaseClient, jenisList: string[], periode: string): Promise<LedRow[]> {
  const out: LedRow[] = []
  let terakhir = 0
  for (;;) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,jenis,aset_id,nilai,tanggal,skpd_asal,skpd_tujuan,header_id,payload,aset:aset_id(kode,skpd_id,intra_ekstra,nibar,nama_barang),header:header_id(no_sk)')
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
  // FASE 3 — kontribusi baris ini ke kolom Beban & Akumulasi. Diisi BELAKANGAN
  // oleh attribusiPenyusutan(); computeMutasiLines sengaja meninggalkannya 0
  // karena atribusi butuh posisi aset di DUA periode, bukan cuma ledger periode
  // ini. Besarannya MAGNITUDO (baris pengurangan tetap positif, sama spt
  // `nilai`) — tanda ditentukan oleh `arah`.
  beban: number; akumulasi: number
}

// Kategori yang MENGURANGI. Diekspor & dipakai halaman Rekonsiliasi juga —
// dulu daftar ini ditulis ulang di sana, jadi menambah satu kategori berarti
// mengubah dua tempat dan yang kelupaan tak menghasilkan error apa pun, cuma
// angka yang tak ikut dijumlah (rules.md §5.5).
export const KURANG_KEYS: MutasiKey[] = [
  'hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain',
  'pengalihan_keluar', 'koreksi_kurang', 'pemecahan_keluar', 'reklas_fungsi_keluar', 'reklas_kode_keluar',
]
const KURANG_SET = new Set<MutasiKey>(KURANG_KEYS)


export const KATEGORI_LABEL: Record<MutasiKey, string> = {
  pengadaan: 'Pengadaan', belanja_jasa: 'Perolehan dari rekening Belanja Jasa',
  hibah: 'Hibah', tukar: 'Tukar Menukar', inventarisasi: 'Hasil Inventarisasi', lainnya: 'Perolehan Lainnya',
  kdp: 'Konstruksi Dalam Pengerjaan (termin)',
  penggunaan_masuk: 'Penggunaan (transfer masuk)', kapitalisasi: 'Kapitalisasi', koreksi_tambah: 'Koreksi Nilai (Tambah)',
  pemecahan_masuk: 'Pemecahan Barang (pecahan baru)', pemecahan_keluar: 'Pemecahan Barang (induk dipecah)',
  reklas_fungsi_masuk: 'Reklas Perubahan Fungsi (Masuk)', reklas_kode_masuk: 'Reklas Kesalahan Kodefikasi (Masuk)',
  hapus_penjualan: 'Penghapusan Pemindahtanganan — Penjualan', hapus_hibah: 'Penghapusan Pemindahtanganan — Hibah',
  hapus_tukar: 'Penghapusan Pemindahtanganan — Tukar Menukar', hapus_penyertaan: 'Penghapusan Pemindahtanganan — Penyertaan Modal',
  hapus_sebab_lain: 'Penghapusan Sebab Lain', pengalihan_keluar: 'Penghapusan Pengalihan (transfer keluar)',
  koreksi_kurang: 'Koreksi Kurang', reklas_fungsi_keluar: 'Reklas Perubahan Fungsi (Keluar)', reklas_kode_keluar: 'Reklas Kesalahan Kodefikasi (Keluar)',
}

// DITURUNKAN, bukan diketik ulang: semua kategori yang bukan pengurangan.
// Kategori baru otomatis ikut dijumlah di baris JUMLAH PENAMBAHAN — tak ada
// lagi kemungkinan angka menghilang cuma karena satu daftar kelupaan disunting.
export const TAMBAH_KEYS: MutasiKey[] = (Object.keys(KATEGORI_LABEL) as MutasiKey[])
  .filter(k => !KURANG_SET.has(k))

// Inti: hitung SEMUA baris mutasi (rinci). Tabel Rekonsiliasi (lewat
// attribusiPenyusutan + aggregateMutasi) & halaman rincian berbagi fungsi ini —
// satu sumber kebenaran, angka pasti konsisten.
async function computeMutasiLines(
  supabase: SupabaseClient, periode: string, descendantIds: number[] | null
): Promise<MutasiLine[]> {
  const scope = descendantIds ? new Set(descendantIds) : null
  const inScope = (skpdId: number | null) => skpdId != null && (scope === null || scope.has(skpdId))
  const lines: MutasiLine[] = []
  const push = (gol: string, komp: Komptabel, kategori: MutasiKey, nilai: number, r: LedRow, skpd?: number | null) => {
    if (!nilai) return
    lines.push({
      golongan: gol, komp, kategori, arah: KURANG_SET.has(kategori) ? 'kurang' : 'tambah',
      aset_id: r.aset_id, nibar: r.aset?.nibar ?? null, kode: r.aset?.kode ?? '', nama: r.aset?.nama_barang ?? null,
      skpd_id: skpd ?? r.aset?.skpd_id ?? null, tanggal: r.tanggal, nilai, jenis: r.jenis, no_dokumen: r.header?.no_sk ?? null,
      beban: 0, akumulasi: 0,
    })
  }

  // DUA TAHAP, sengaja. Tahap 1 menarik baris ledger periode ini; tahap 2
  // menanyakan status void/net-removed HANYA untuk aset yang muncul di tahap 1.
  // Versi lama menanyakan keduanya atas SELURUH ledger (259rb baris) sekaligus
  // dgn baris periode ini — itu yang tembus statement timeout beruntun
  // 2026-07-28, dan biayanya bakal terus naik seiring ledger tumbuh.
  const [cara, alih, kap, kor, reklasG, reklasK, hapus, pecah] = await Promise.all([
    fetchLed(supabase, JENIS_CARA, periode),
    fetchLed(supabase, ['pengalihan_status'], periode),
    fetchLed(supabase, ['kapitalisasi'], periode),
    fetchLed(supabase, ['koreksi_nilai'], periode),
    fetchLed(supabase, ['reklas_golongan'], periode),
    fetchLed(supabase, ['reklas_kode'], periode),
    fetchLed(supabase, JENIS_HAPUS, periode),
    fetchLed(supabase, JENIS_PECAH, periode),
  ])
  // Tahap 2 — SEMUA terscope ke aset yang muncul di tahap 1. Tidak ada lagi
  // satu pun query di fungsi ini yang menyapu seluruh ledger.
  const [kapBatal, korBatal, reklasBatal, alihBatal, voided, netRemoved, pecahBatal] = await Promise.all([
    fetchBatalTargets(supabase, ['batal_kapitalisasi'], kap.map(r => r.aset_id)),
    fetchBatalTargets(supabase, ['batal_koreksi_nilai'], kor.map(r => r.aset_id)),
    fetchBatalTargets(supabase, ['batal_reklas'], [...reklasG, ...reklasK].map(r => r.aset_id)),
    // Pengalihan yang DIANULIR. Sempat kelewat (rules.md §1.7 titik 2 sudah
    // mewajibkannya & BATAL_TARGET_JENIS.pengalihan sudah ada — yang belum cuma
    // pemakaiannya di sini), ketahuan lewat invarian tie-out golden test
    // 2026-08-06. Payloadnya `target_trx_ids` JAMAK: sekali batal menganulir
    // baris perginya DAN baris pulangnya; fetchBatalTargets membaca dua bentuk.
    fetchBatalTargets(supabase, ['batal_pengalihan'], alih.map(r => r.aset_id)),
    fetchVoided(supabase, cara.map(r => r.aset_id)),
    fetchNetRemoved(supabase, hapus.map(r => r.aset_id)),
    fetchPemecahanBatal(supabase, pecah.map(r => r.aset_id)),
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
    if (!r.aset || alihBatal.has(r.id)) continue
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

  // Pemecahan Barang: induk KELUAR dari selnya, tiap pecahan MASUK ke selnya.
  // Sering beda kolom komptabel (induk intra → pecahan ekstra), jadi per sel ini
  // penambahan/pengurangan sungguhan — bukan net-nol. `intra_ekstra` & `kode`
  // dibaca dari aset masing-masing, jadi pecahan yang beda golongan pun mendarat
  // di tabel yang benar.
  for (const r of pecah) {
    if (!r.aset || !inScope(r.aset.skpd_id)) continue
    if (pecahBatal.has(kunciPemecahan(r.header_id, r.aset_id))) continue
    push(kodeLevel3(r.aset.kode), kompOf(r.aset.intra_ekstra),
      r.jenis === 'pemecahan_keluar' ? 'pemecahan_keluar' : 'pemecahan_masuk', r.nilai, r)
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

// ══════════════════════════════════════════════════════════════════════════
// FASE 3 — atribusi Beban & Akumulasi ke baris mutasi (rencana §5.3–5.4).
//
// Keputusan yang dipakai (DECISION-1, dijawab user 2026-08-04: **OPSI A**):
// beban aset yang dikapitalisasi/dikoreksi di periode yang sama tetap PENUH di
// baris SALDO AWAL — dia penghuni populasi awal. Baris Kapitalisasi/Koreksi cuma
// membawa Δ perolehan, bebannya nol. Alasannya: (1) tiap aset menyumbang persis
// SEKALI ke tiap ukuran, jadi rantainya pasti tie-out; (2) engine cuma
// menghasilkan SATU angka beban per aset per periode — efek kapitalisasi
// terhadap masa manfaat sudah melebur di dalamnya, jadi angka split-nya bukan
// dibaca melainkan dikarang.
//
// Aturannya per SEL (golongan × komptabel), bukan per aset global — itu penting
// untuk reklasifikasi, yang memindahkan satu aset dari satu sel ke sel lain:
//   · aset yang MASUK sel (ada di P, tidak di P−1) → baris masuknya dapat
//     beban_P dan akumulasi (`akum_P − beban_P`, yakni akumulasi BAWAAN saja;
//     bagian beban-nya sudah dihitung di kolom Beban → jangan dobel);
//   · aset yang KELUAR sel (ada di P−1, tidak di P) → baris keluarnya dapat
//     `−akum_{P−1}`, bebannya NOL (beban periode ini melekat di sel tujuannya,
//     kalau ada — kalau ikut dihitung di sel asal, rantai akumulasi sel itu
//     kelebihan sebesar beban tsb);
//   · aset yang TETAP di sel → semua ada di baris SALDO AWAL (`bebanSaldoAwal`),
//     baris mutasinya (kapitalisasi/koreksi) nol.
//
// ⚠️ Yang menegakkan kebenaran adalah UJI KEANGGOTAAN SEL di atas, bukan daftar
// kategori. MASUK_KEYS/KELUAR_KEYS cuma menentukan baris MANA yang kebagian
// label saat satu aset punya beberapa baris di sel yang sama (mis. reklas masuk
// + kapitalisasi) — tanpa itu urutan baris yang menentukan, dan itu kebetulan.
// Konsekuensinya kategori BARU yang ditambahkan nanti otomatis berperilaku benar
// walau lupa didaftarkan di sini; ia cuma kalah rebutan label.
const MASUK_KEYS = new Set<MutasiKey>([
  'pengadaan', 'belanja_jasa', 'hibah', 'tukar', 'inventarisasi', 'lainnya', 'kdp',
  'penggunaan_masuk', 'pemecahan_masuk', 'reklas_fungsi_masuk', 'reklas_kode_masuk',
])
const KELUAR_KEYS = new Set<MutasiKey>([
  'hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain',
  'pengalihan_keluar', 'pemecahan_keluar', 'reklas_fungsi_keluar', 'reklas_kode_keluar',
])

export type AtribusiPenyusutan = {
  lines: MutasiLine[]  // salinan baru; `lines` masukan tidak diubah
  // Beban baris SALDO AWAL per golongan × komptabel = Σ beban periode P atas
  // aset yang ada di sel yang SAMA pada P−1 dan P (populasi lanjut).
  bebanSaldoAwal: Record<string, { intra: number; ekstra: number }>
}

export function attribusiPenyusutan(
  lines: MutasiLine[], posAwal: Map<string, PosAset>, posAkhir: Map<string, PosAset>,
): AtribusiPenyusutan {
  const out = lines.map(l => ({ ...l, beban: 0, akumulasi: 0 }))
  const diSel = (p: PosAset | undefined, l: MutasiLine) => !!p && p.gol === l.golongan && p.komp === l.komp
  // Satu aset boleh punya beberapa baris di satu sel (termin KDP berkali-kali,
  // reklas masuk + kapitalisasi). Beban/akumulasi cuma boleh menempel SEKALI —
  // kalau tidak, satu barang terhitung dua kali dan rantainya patah.
  const sudah = new Set<string>()
  const kunci = (l: MutasiLine) => `${l.golongan}|${l.komp}|${l.arah}|${l.aset_id}`

  const attr = (l: MutasiLine) => {
    const k = kunci(l)
    if (sudah.has(k)) return
    const pw = posAwal.get(l.aset_id), pa = posAkhir.get(l.aset_id)
    const awal = diSel(pw, l), akhir = diSel(pa, l)
    if (l.arah === 'tambah') {
      if (!akhir || awal) return              // bukan aset yang BARU masuk sel ini
      sudah.add(k)
      l.beban = pa!.beban
      l.akumulasi = pa!.akumulasi - pa!.beban // akumulasi BAWAAN saja
    } else {
      if (!awal || akhir) return              // bukan aset yang KELUAR dari sel ini
      sudah.add(k)
      l.akumulasi = pw!.akumulasi             // beban tetap 0 — lihat catatan di atas
    }
  }
  // Dua lintasan: baris berkategori masuk/keluar duluan supaya angkanya mendarat
  // di baris yang memang menceritakan perpindahannya.
  for (const l of out) if (MASUK_KEYS.has(l.kategori) || KELUAR_KEYS.has(l.kategori)) attr(l)
  for (const l of out) if (!MASUK_KEYS.has(l.kategori) && !KELUAR_KEYS.has(l.kategori)) attr(l)

  const bebanSaldoAwal: Record<string, { intra: number; ekstra: number }> = {}
  for (const [id, pa] of posAkhir) {
    const pw = posAwal.get(id)
    if (!pw || pw.gol !== pa.gol || pw.komp !== pa.komp) continue
    const c = (bebanSaldoAwal[pa.gol] ??= { intra: 0, ekstra: 0 })
    c[pa.komp] += pa.beban
  }
  return { lines: out, bebanSaldoAwal }
}

// Agregasi baris rinci → sel (golongan, komptabel, kategori). DIEKSPOR supaya
// halaman Rekonsiliasi bisa menahan `lines`-nya sendiri untuk drill-down dan
// menjumlah SENDIRI dari baris yang sama persis — angka di popup dijamin sama
// dengan angka di tabel karena keduanya dari satu array, bukan dua query.
export function aggregateMutasi(lines: MutasiLine[]): Mutasi {
  const mut: Mutasi = {}
  for (const l of lines) {
    const cell = (mut[l.golongan] ??= { intra: {}, ekstra: {} })[l.komp]
    const u = (cell[l.kategori] ??= zeroUkuran())
    u.perolehan += l.nilai
    u.beban += l.beban
    u.akumulasi += l.akumulasi
  }
  return mut
}

// Daftar rinci utk halaman Bukti Dukung — semua transaksi AKTIF yg memengaruhi
// Rekonsiliasi pada periode. Se-pemda (desc=null) atau per SKPD. Sumbernya sama
// dgn tabel Rekonsiliasi → angka rincian pasti menjumlah ke agregatnya.
// ⚠️ `beban`/`akumulasi` baris hasilnya masih NOL — jalankan attribusiPenyusutan
// dulu kalau butuh kontribusi Fase 3-nya (halaman Bukti Dukung sengaja tidak:
// ia mendaftar transaksi, bukan merekonsiliasi saldo).
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
