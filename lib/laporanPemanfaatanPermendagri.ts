// ============================================================================
// Pemuat data lembar PEMANFAATAN (Laporan Pemanfaatan BMD, format tabel datar).
//
// Dipakai BERSAMA tab "Format Permendagri" di menu Pelaporan → Pengelolaan →
// Pemanfaatan DAN halaman cetak /cetak/pemanfaatan-permendagri. Dua jalur angka
// untuk lembar yang sama adalah cara paling gampang menghasilkan pratinjau yang
// berbeda dari berkas yang akhirnya ditandatangani.
//
// ⚠️ **YANG DIDAFTAR = PERJANJIAN YANG BERLAKU PADA PERIODE**, bukan "yang
// berstatus aktif hari ini" (itu tab Daftar, `muatPemanfaatan`) dan bukan juga
// posisi akhir periode seperti Pengamanan. Sebabnya Pengamanan = kustodi
// (siapa pemakainya SEKARANG), sedangkan laporan semesteran pemanfaatan harus
// menyebut perjanjian yang berjalan DI SEMESTER ITU: perjanjian yang berlangsung
// Januari–Maret & sudah diakhiri tetap wajib muncul di Semester I — kalau
// diambil posisi akhir periode, ia tak pernah muncul di laporan mana pun.
// Rumusnya (`berlakuPadaRentang`): masa efektif perjanjian beririsan dgn rentang
// periode, masa efektif = `mulai` s.d. yang lebih awal antara `berakhir` & hari
// ia di-Akhiri (`pemanfaatan_selesai`).
//
// ⚠️ **Peristiwa berlaku SEJAK periodenya, tidak surut** (aturan lintas-fitur
// 2026-08-05). Replay-nya karena itu dipotong `periode <= batas`: perjanjian
// yang baru DIBATALKAN di semester berikutnya tetap ada di laporan semester
// lama — dan sebaliknya, perjanjian yang baru dicatat di semester berikutnya
// tak ikut mundur. Pola & alasan persis `pengamananBerlaku` (laporanPengamanan).
//
// ⚠️ **Wewenang atas baris = `jurnal_header.skpd_id`** (SKPD yang MENCATAT
// perjanjian, terkunci permanen oleh `fn_jurnal_header_guard`), BUKAN
// `aset.skpd_id` posisi terkini — pelajaran Laporan Reklasifikasi 2026-09-17:
// barang bisa berpindah SKPD sesudah dicatat, dan replay posisi pun hanya
// presisi per semester.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { paginate } from '@/shared/db/paginate'
import { fetchSkpd } from '@/lib/skpdMaster'
import { sebutanPejabat, levelSkpd } from '@/lib/formatPermendagri'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

/** Ketiga jenis ledger pemanfaatan. ⚠️ KEMBAR dgn `muatPemanfaatan` & KIBAR. */
export const JENIS_PEMANFAATAN_LEDGER = ['pemanfaatan', 'pemanfaatan_selesai', 'batal_pemanfaatan'] as const

/** Batas jumlah header yang disapu. Disaring di memori, jadi MELEMPAR kalau terlampaui. */
const BATAS_HEADER = 5000
/** Jumlah header per permintaan ledger (uuid 36 karakter → URL tetap pendek). */
const UKURAN_CHUNK = 100

export type PayloadHeaderPemanfaatan = {
  jenis_pemanfaatan?: string; mitra?: string; alamat_mitra?: string
  mulai?: string; masa_tahun?: number; berakhir?: string; peruntukan?: string
  nilai_pemanfaatan?: number
}

export type BarisPemanfaatanLembar = {
  /** `${header_id}|${aset_id}` — satu baris per (perjanjian, barang). */
  key: string
  header: {
    id: string; no_sk: string | null; tanggal: string | null; keterangan: string | null
    skpd_id: number | null; payload: PayloadHeaderPemanfaatan | null
  }
  aset: {
    id: string; kode: string; nama_barang: string | null; uraian_barang: string | null
    nibar: string | null; merek_tipe: string | null; no_polisi: string | null
    alamat_detail: string | null; nilai_perolehan: number | null; keterangan: string | null
  }
  lingkup: 'seluruh' | 'sebagian'
  bagian: string | null
  /** Hari perjanjian ini di-Akhiri (`pemanfaatan_selesai`), kalau pernah. */
  selesaiTgl: string | null
}

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanPemanfaatan = {
  skpdId: number | null
  /** `'2026-S1'` / `'2026'`. Kosong = tanpa batas waktu (semua yang tercatat & tak dibatalkan). */
  periode: string
}

export type HasilPemanfaatanLembar = {
  rows: BarisPemanfaatanLembar[]
  skpd: { kode: string; nama: string } | null
  sebutan: string
  semuaSkpd: SkpdRow[]
}

// ── Bagian MURNI (diuji tanpa DB) ───────────────────────────────────────────

/** `'2026-S1'` → 2026-01-01..2026-06-30 · `'2026'` → 2026-01-01..2026-12-31 · kosong/tak dikenal → null. */
export function rentangPeriode(periode: string): { awal: string; akhir: string } | null {
  const per = periodeDiminta(periode)
  if (per.length === 0) return null
  const tgl = (p: string, akhir: boolean): string | null => {
    const m = /^(\d{4})-S([12])$/.exec(p)
    if (!m) return null
    if (m[2] === '1') return akhir ? `${m[1]}-06-30` : `${m[1]}-01-01`
    return akhir ? `${m[1]}-12-31` : `${m[1]}-07-01`
  }
  const awal = tgl(per[0], false)
  const akhir = tgl(per[per.length - 1], true)
  return awal && akhir ? { awal, akhir } : null
}

export type EvPemanfaatan = {
  id: number; header_id: string; aset_id: string
  periode: string; tanggal: string; jenis: string
}

/**
 * Replay keanggotaan per (header, aset), dipotong `periode <= batas`.
 *
 * `pemanfaatan` memasang (dan membuka lagi siklus manfaat → selesai → manfaat),
 * `pemanfaatan_selesai` menandai Diakhiri (barang TETAP dihitung — ia riwayat
 * yang sah), `batal_pemanfaatan` membuang. Mengembalikan id baris `pemanfaatan`
 * yang menang + hari Diakhiri-nya.
 *
 * ⚠️ Diurutkan `(periode, id)` — sama dgn seluruh replay lain di repo ini.
 * `batas` kosong = tanpa potongan.
 */
export function pemanfaatanBerlaku(
  ev: EvPemanfaatan[], batas: string,
): Map<string, { barisId: number; selesaiTgl: string | null }> {
  const urut = [...ev]
    .filter(e => !batas || e.periode <= batas)
    .sort((a, b) => (a.periode < b.periode ? -1 : a.periode > b.periode ? 1 : a.id - b.id))
  const acc = new Map<string, { barisId: number; selesaiTgl: string | null }>()
  for (const e of urut) {
    const key = `${e.header_id}|${e.aset_id}`
    if (e.jenis === 'pemanfaatan') acc.set(key, { barisId: e.id, selesaiTgl: null })
    else if (e.jenis === 'pemanfaatan_selesai') {
      const cur = acc.get(key); if (cur) cur.selesaiTgl = e.tanggal
    } else if (e.jenis === 'batal_pemanfaatan') acc.delete(key)
  }
  return acc
}

/**
 * Apakah perjanjian ini berlaku DI SUATU HARI dalam rentang periode?
 *
 * Masa efektif = `mulai` s.d. yang lebih awal antara `berakhir` & `selesaiTgl`
 * (hari di-Akhiri). Tanggal kosong dibaca "tak terbatas di sisi itu" — tak bisa
 * dinilai ≠ tak berlaku, dan menyaringnya keluar akan menghilangkan perjanjian
 * dari lembar bertanda tangan tanpa satu pun tanda. Perbandingan string ISO
 * `YYYY-MM-DD` (leksikografis = kronologis), bukan `new Date()` yang bergeser
 * zona waktu.
 */
export function berlakuPadaRentang(
  p: { mulai?: string | null; berakhir?: string | null; selesaiTgl?: string | null },
  rentang: { awal: string; akhir: string } | null,
): boolean {
  if (!rentang) return true
  const mulai = (p.mulai || '').slice(0, 10)
  const berakhir = (p.berakhir || '').slice(0, 10)
  const selesai = (p.selesaiTgl || '').slice(0, 10)
  const akhirEfektif = berakhir && selesai ? (berakhir < selesai ? berakhir : selesai) : (berakhir || selesai)
  if (mulai && mulai > rentang.akhir) return false
  if (akhirEfektif && akhirEfektif < rentang.awal) return false
  return true
}

/** Baris yang barangnya muncul lebih dari satu kali (dua perjanjian beririsan di periode yang sama). */
export function asetKembar(rows: { aset: { id: string } }[]): Set<string> {
  const lihat = new Set<string>(); const kembar = new Set<string>()
  for (const r of rows) {
    if (lihat.has(r.aset.id)) kembar.add(r.aset.id); else lihat.add(r.aset.id)
  }
  return kembar
}

/**
 * Jumlahkan Nilai Perolehan SEKALI per barang.
 *
 * ⚠️ Satu barang bisa tampil di dua baris kalau dua perjanjian beririsan di
 * periode yang sama (mis. perjanjian A diakhiri Februari, B dimulai April).
 * Nilai perolehan itu milik BARANG, bukan perjanjian — menjumlahkannya per baris
 * melipatgandakannya di total lembar bertanda tangan, dan angkanya tetap
 * kelihatan wajar.
 */
export function jumlahNilaiPerolehan(rows: { aset: { id: string; nilai_perolehan: number | null } }[]): number {
  const sudah = new Set<string>()
  let total = 0
  for (const r of rows) {
    if (sudah.has(r.aset.id)) continue
    sudah.add(r.aset.id)
    total += r.aset.nilai_perolehan ?? 0
  }
  return total
}

// ── Pemuat ──────────────────────────────────────────────────────────────────

const SEL_LEDGER =
  'id,header_id,aset_id,jenis,periode,tanggal,payload,'
  + 'aset:aset_id(id,kode,nama_barang,uraian_barang,nibar,merek_tipe,no_polisi,'
  + 'alamat_detail,nilai_perolehan,keterangan)'

type LedgerRow = EvPemanfaatan & {
  payload: { lingkup?: string; bagian?: string | null } | null
  aset: BarisPemanfaatanLembar['aset'] | null
}

export async function muatLaporanPemanfaatanPermendagri(
  supabase: SupabaseClient, p: PermintaanPemanfaatan,
): Promise<HasilPemanfaatanLembar> {
  const semua = await fetchSkpd<SkpdRow>(supabase, 'id,parent_id,nama,kode_skpd')
  let ini: SkpdRow | undefined
  let desc: Set<number> | null = null
  if (p.skpdId != null) {
    ini = semua.find(x => x.id === p.skpdId)
    if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
    desc = new Set(descendantsOf(semua, p.skpdId))
  }

  // Header perjanjian (bentuknya ratusan baris paling banyak) — disaring ke SKPD
  // pencatat di MEMORI, supaya tak ada daftar 694 id di URL.
  const headersSemua = await paginate<string, BarisPemanfaatanLembar['header']>(
    'perjanjian pemanfaatan',
    kursor => {
      let q = supabase.from('jurnal_header')
        .select('id,no_sk,tanggal,keterangan,skpd_id,payload').eq('kategori', 'pemanfaatan')
      if (kursor != null) q = q.gt('id', kursor)
      return q.order('id', { ascending: true }).limit(1000) as never
    })
  if (headersSemua.length > BATAS_HEADER) {
    throw new Error(
      `perjanjian pemanfaatan melebihi ${BATAS_HEADER.toLocaleString('id-ID')} header. Penyaringan SKPD `
      + 'di sini dilakukan di memori, jadi angkanya TIDAK ditampilkan daripada dipotong diam-diam.')
  }
  const headers = headersSemua.filter(h => !desc || (h.skpd_id != null && desc.has(h.skpd_id)))
  const hById = new Map(headers.map(h => [h.id, h]))

  const ev: LedgerRow[] = []
  for (let i = 0; i < headers.length; i += UKURAN_CHUNK) {
    const idChunk = headers.slice(i, i + UKURAN_CHUNK).map(h => h.id)
    const baris = await paginate<number, LedgerRow>(
      'transaksi pemanfaatan',
      kursor => supabase.from('transaksi_bmd').select(SEL_LEDGER)
        .in('jenis', JENIS_PEMANFAATAN_LEDGER as never)
        .in('header_id', idChunk)
        .gt('id', kursor ?? 0).order('id', { ascending: true }).limit(1000) as never)
    ev.push(...baris)
  }

  // Posisi pada periode yang diminta: peristiwa sesudahnya tak dihitung.
  const per = periodeDiminta(p.periode)
  const batas = per.length > 0 ? per[per.length - 1] : ''
  const berlaku = pemanfaatanBerlaku(ev, batas)
  const rentang = rentangPeriode(p.periode)
  const ledById = new Map(ev.map(e => [e.id, e]))

  const rows: BarisPemanfaatanLembar[] = []
  for (const [key, v] of berlaku) {
    const e = ledById.get(v.barisId)
    const h = e ? hById.get(e.header_id) : undefined
    if (!e || !h || !e.aset) continue
    if (!berlakuPadaRentang(
      { mulai: h.payload?.mulai, berakhir: h.payload?.berakhir, selesaiTgl: v.selesaiTgl }, rentang)) continue
    rows.push({
      key, header: h, aset: e.aset,
      lingkup: e.payload?.lingkup === 'sebagian' ? 'sebagian' : 'seluruh',
      bagian: e.payload?.bagian || null,
      selesaiTgl: v.selesaiTgl,
    })
  }

  // ⚠️ URUTAN TOTAL: kode → nama → NIBAR → no. dokumen. Tanpa pemecah seri,
  // barang bernama kembar bertukar tempat tiap lembarnya dicetak ulang.
  rows.sort((a, b) =>
    (a.aset.kode || '').localeCompare(b.aset.kode || '')
    || (a.aset.nama_barang || '').localeCompare(b.aset.nama_barang || '', 'id', { numeric: true })
    || (a.aset.nibar || '').localeCompare(b.aset.nibar || '')
    || (a.header.no_sk || '').localeCompare(b.header.no_sk || ''))

  return {
    rows,
    skpd: ini ? { kode: ini.kode_skpd || '', nama: ini.nama } : null,
    sebutan: p.skpdId != null
      ? sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id]))))
      : 'Pengguna Barang',
    semuaSkpd: semua,
  }
}
