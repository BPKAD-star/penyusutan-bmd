// Kode barang PADA SEBUAH PERIODE — replay ledger reklasifikasi.
//
// Golongan sebuah barang bukan sifat tetap: `reklas_kode` & `reklas_golongan`
// menggesernya, dan `aset.kode` cuma menyimpan posisi TERAKHIR. Membaca kolom
// itu untuk periode LAMPAU melanggar aturan lintas-fitur "PERISTIWA BERLAKU
// SEJAK PERIODENYA, TIDAK SURUT" (CLAUDE.md) — persis cacat `skpd_id` terkini
// yang sudah ditutup untuk kepemilikan SKPD (lib/pengalihan.ts) dan untuk
// visibilitas (lib/visibilitas.ts).
//
// Modul ini sengaja dibuat SEBELUM pemakainya lebih dari satu: Laporan BMD
// (Model 1/2/3) dan Rekonsiliasi BMD sama-sama membutuhkannya, dan di repo ini
// dua salinan logika replay sudah berkali-kali terbukti menyimpang diam-diam
// (lihat SEMBUNYI yang sempat beda di tiga halaman, CLAUDE.md).
//
// ⚠️ KEMBAR TIGA. Aturan yang sama ditulis di tiga tempat dan ketiganya harus
// diubah bersamaan:
//   1. modul ini (Laporan BMD & Rekonsiliasi, sisi TypeScript)
//   2. CTE `kode_at` di `fn_rekap_bmd` (migrasi 20260811_01, sisi SQL)
//   3. predikat index parsial `idx_trx_reklas_id` (migrasi yang sama)
import type { SupabaseClient } from '@supabase/supabase-js'
import { comparePeriode } from '@/lib/bmd'

// Jenis ledger yang MENGGESER `aset.kode`. Dua-duanya menyalin
// `payload.kode_baru` ke kolom itu (lib/transaksi.ts `patchAsetDari`) —
// bedanya cuma di engine (fresh-start vs retroaktif), yang tak ada urusannya
// dengan pengelompokan laporan. Menu Reklasifikasi memang memisahkan "Perubahan
// Fungsi" (lintas golongan) dari "kode barang" (dalam golongan), tapi TAK ADA
// penjaga di DB yang memaksa `reklas_kode` tinggal di golongan yang sama — jadi
// yang menentukan bukan nama jenisnya, melainkan kodenya sendiri.
export const JENIS_REKLAS_KODE = ['reklas_kode', 'reklas_golongan'] as const

export type ReklasEv = { id: number; periode: string; kodeLama: string | null; kodeBaru: string }
export type ReklasEvents = Map<string, ReklasEv[]>

/**
 * Seluruh riwayat reklas kode, per aset, yang BELUM dibatalkan.
 *
 * ⚠️ Sengaja TANPA filter periode — sama alasannya dgn `fetchPindahEvents`:
 * reklas yang terjadi SESUDAH periode yang dilihat justru yang membuktikan
 * bahwa `aset.kode` sekarang BUKAN kode saat itu. Memotongnya membuat jawaban
 * salah secara diam-diam.
 *
 * ⚠️ MELEMPAR kalau query gagal. Map kosong terbaca sebagai "tak ada barang
 * yang pernah direklas" — laporan lalu memakai kode terkini untuk semua periode
 * dan tetap kelihatan normal. Pemanggil wajib punya try/catch + tampilan error
 * (aturan kolektor fail-closed, CLAUDE.md).
 *
 * Biayanya ikut jumlah REKLAS, bukan besar ledger, berkat index parsial
 * `idx_trx_reklas_id` — pola & alasan yang sama persis dgn `idx_trx_pindah_id`
 * (qual enum tak bisa jadi index-cond di bawah RLS; lihat CLAUDE.md).
 */
export async function fetchReklasEvents(supabase: SupabaseClient): Promise<ReklasEvents> {
  type Row = { id: number; aset_id: string; periode: string; jenis: string; payload: Record<string, unknown> | null }
  const mentah: Row[] = []
  const dibatalkan = new Set<number>()

  let terakhir = 0
  for (;;) {
    // Keyset (bukan OFFSET) + urut `id` + `error` diperiksa — tiga cacat yang
    // di repo ini selalu berpasangan dan ketiganya bikin angka salah TANPA
    // SUARA (CLAUDE.md). `batal_reklas` ditarik BARENGAN supaya urutan &
    // paginasinya tak bisa berselisih dengan baris yang dibatalkannya.
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,periode,jenis,payload')
      .in('jenis', [...JENIS_REKLAS_KODE, 'batal_reklas'] as never)
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`gagal membaca riwayat reklasifikasi: ${error.message}`)
    if (!data || data.length === 0) break
    mentah.push(...(data as unknown as Row[]))
    terakhir = (data as unknown as Row[])[data.length - 1].id
    if (data.length < 1000) break
  }

  for (const r of mentah) {
    if (r.jenis !== 'batal_reklas') continue
    // TUNGGAL di sini (`target_trx_id`); `batal_pengalihan` yang jamak
    // (`target_trx_ids`) — jangan tertukar.
    const t = Number(r.payload?.target_trx_id)
    if (Number.isFinite(t)) dibatalkan.add(t)
  }

  const out: ReklasEvents = new Map()
  for (const r of mentah) {
    if (r.jenis === 'batal_reklas' || dibatalkan.has(r.id)) continue
    const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : null
    if (!kodeBaru) continue
    const arr = out.get(r.aset_id) || []
    arr.push({
      id: r.id, periode: r.periode, kodeBaru,
      kodeLama: typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : null,
    })
    out.set(r.aset_id, arr)
  }
  return out
}

// Baris reklas TERAKHIR yang sudah terjadi pada titik (periode, trxId).
// `trxId` null = "akhir periode" (dipakai snapshot); berisi = "tepat saat
// transaksi itu", supaya baris mutasi jatuh di golongan yang benar.
function terakhirSebelum(evs: ReklasEv[], periode: string, trxId: number | null): ReklasEv | null {
  let pilih: ReklasEv | null = null
  for (const e of evs) {
    const c = comparePeriode(e.periode, periode)
    if (c > 0) continue
    if (c === 0 && trxId !== null && e.id > trxId) continue
    if (!pilih || comparePeriode(e.periode, pilih.periode) > 0
        || (comparePeriode(e.periode, pilih.periode) === 0 && e.id > pilih.id)) pilih = e
  }
  return pilih
}

function paling(evs: ReklasEv[]): ReklasEv {
  return evs.reduce((a, b) =>
    (comparePeriode(b.periode, a.periode) < 0
      || (comparePeriode(b.periode, a.periode) === 0 && b.id < a.id)) ? b : a)
}

/**
 * Kode satu barang pada titik waktu tertentu.
 *
 * Cara bacanya KEMBAR dengan `ownersAt` (lib/pengalihan.ts) dan dengan riwayat
 * `aset_kode_register`: ambil baris terakhir yang sudah terjadi; kalau semua
 * reklasnya justru terjadi SESUDAH titik itu, pakai `kode_lama` baris paling
 * awal — kode semula. Tak pernah direklas → `kodeKini`.
 */
export function kodePada(
  evs: ReklasEvents, asetId: string, periode: string, trxId: number | null, kodeKini: string,
): string {
  const arr = evs.get(asetId)
  if (!arr || arr.length === 0) return kodeKini
  const t = terakhirSebelum(arr, periode, trxId)
  if (t) return t.kodeBaru
  // Payload warisan tanpa `kode_lama` → jatuh ke kode terkini. Tebakan yang
  // buruk, tapi jauh lebih baik daripada string kosong yang bikin barangnya
  // hilang dari SELURUH baris laporan tanpa jejak.
  return paling(arr).kodeLama || kodeKini
}

/** Kode tiap barang pada AKHIR sebuah periode — hanya yang pernah direklas. */
export function kodeAt(evs: ReklasEvents, periode: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [asetId, arr] of evs) {
    if (arr.length === 0) continue
    const t = terakhirSebelum(arr, periode, null)
    const kode = t ? t.kodeBaru : paling(arr).kodeLama
    if (kode) out.set(asetId, kode)
  }
  return out
}
