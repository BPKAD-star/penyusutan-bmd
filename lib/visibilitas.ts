// Visibilitas aset PERIOD-AWARE — satu barang tampil di periode V atau tidak.
//
// Dipakai bersama Daftar Barang, Penyusutan, & Rekonsiliasi BMD. Sebelumnya
// logika ini disalin di ketiga tempat itu dan SUDAH menyimpang (varian daftar
// SEMBUNYI beda `kdp_selesai_keluar`) — persis pola yang diperingatkan
// rules.md §25. Perbaikan "pecahan tampil sebelum dipecah" (2026-08-05) harus
// mendarat di ketiganya sekaligus, jadi daftarnya dikumpulkan di sini.
//
// ── TIGA pertanyaan yang menentukan sebuah barang tampil di periode V ───────
//   1. LAHIR   — apakah ia sudah ADA pada V? (`lahirSetelah`)
//   2. SEMBUNYI/MUNCUL — apakah ia sempat disembunyikan lalu dimunculkan lagi?
//      (`tersembunyiPada`, replay kronologis event <= V)
//   3. tanggal perolehan — cadangan untuk barang tanpa event kelahiran
//      (`belumAdaPada`)
import type { SupabaseClient } from '@supabase/supabase-js'
import { comparePeriode, periodeDariTanggal } from '@/lib/bmd'

// Event yang MENYEMBUNYIKAN barang sejak periodenya (serap kapitalisasi,
// penghapusan, pembatalan perolehan, induk yang sudah dipecah, dst).
// Varian Penyusutan/Rekonsiliasi — TANPA `kdp_selesai_keluar`.
export const SEMBUNYI_PENYUSUTAN = [
  'kapitalisasi_serap', 'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain',
  'batal_pengadaan', 'koreksi_pencatatan_ganda', 'batal_hibah_masuk', 'batal_tukar_menukar',
  'batal_hasil_inventarisasi', 'batal_perolehan_lainnya', 'pemecahan_keluar', 'batal_pemecahan_masuk',
] as const
// Varian Daftar Barang — PLUS `kdp_selesai_keluar` (aset KDP 1.3.6 yang sudah
// di-carve-out jadi aset tetap tak lagi didaftar). Perbedaan ini SENGAJA, sudah
// begitu sejak sebelum modul ini ada; jangan disamakan tanpa alasan.
export const SEMBUNYI_DAFTAR_BARANG = [...SEMBUNYI_PENYUSUTAN, 'kdp_selesai_keluar'] as const
// Event yang MEMUNCULKAN kembali barang yang tadinya disembunyikan.
export const MUNCUL = [
  'batal_kapitalisasi', 'batal_penghapusan', 'batal_pemecahan', 'batal_koreksi_pencatatan_ganda',
] as const

// Event KELAHIRAN — barang yang lahir dari sebuah PERISTIWA, bukan dari
// pembelian biasa. Ia TIDAK BOLEH tampil di periode sebelum peristiwanya.
//
// Kenapa perlu daftar sendiri, tak cukup `tgl_perolehan`: pecahan hasil
// Pemecahan Barang sengaja MEWARISI `tgl_perolehan` induknya (Koreksi.tsx) —
// itu benar untuk penyusutan, karena pecahan meneruskan sisa umur induk, bukan
// mulai umur baru. Tapi akibatnya pecahan seolah sudah ada sejak tanggal
// perolehan INDUK. Insiden 2026-08-05: pemecahan 27 Juli 2026 (2026-S2), tapi
// di 2026-S1 ketujuh pecahannya SUDAH tampil BERSAMA induknya yang masih utuh —
// di Daftar Barang & di Rekonsiliasi BMD, jadi nilainya kehitung dobel.
//
// ⚠️ Bikin pintu baru yang MEMBUAT aset dengan `tgl_perolehan` warisan/mundur
// (bukan tanggal peristiwanya) → WAJIB daftarkan jenis ledgernya di sini.
export const LAHIR = ['pemecahan_masuk', 'kdp_selesai_masuk'] as const

export type EventVisibilitas = { id: number; periode: string; jenis: string }

// Barang lahir SESUDAH periode yang dilihat? (→ belum boleh tampil)
// Diambil event kelahiran PALING AWAL: normalnya cuma ada satu, tapi kalau
// suatu saat ada dua, yang menentukan adalah kemunculan pertamanya.
export function lahirSetelah(evs: EventVisibilitas[], periode: string): boolean {
  let paling: string | null = null
  for (const e of evs) {
    if (!(LAHIR as readonly string[]).includes(e.jenis)) continue
    if (paling === null || comparePeriode(e.periode, paling) < 0) paling = e.periode
  }
  return paling !== null && comparePeriode(paling, periode) > 0
}

// Replay kronologis SUNGGUHAN (periode lalu id ledger — append-only jadi id =
// urutan insert asli), BUKAN dikelompokkan SEMBUNYI-dulu-baru-MUNCUL.
// Pengelompokan salah kalau dalam satu periode ada siklus hapus→batal→hapus
// lagi (mis. dari testing di hari yang sama): hasil akhir harus ikut aksi
// TERAKHIR, bukan selalu "batal menang".
export function tersembunyiPada(evs: EventVisibilitas[], periode: string, sembunyi: readonly string[]): boolean {
  let h = false
  const urut = evs
    .filter(e => comparePeriode(e.periode, periode) <= 0)
    .sort((a, b) => comparePeriode(a.periode, b.periode) || a.id - b.id)
  for (const e of urut) {
    if (sembunyi.includes(e.jenis)) h = true
    else if ((MUNCUL as readonly string[]).includes(e.jenis)) h = false
  }
  return h
}

// Cadangan untuk barang TANPA event kelahiran (perolehan biasa & baseline):
// tanggal perolehannya sesudah periode → belum ada. Untuk barang ber-event
// kelahiran, `lahirSetelah` yang berlaku & lebih tepat.
export function belumAdaPada(tglPerolehan: string | null | undefined, periode: string): boolean {
  return !!tglPerolehan && comparePeriode(periodeDariTanggal(tglPerolehan), periode) > 0
}

// aset_id yang TIDAK BOLEH tampil pada `periode` — gabungan "belum lahir" +
// "sedang tersembunyi". Barang tanpa satu pun event tidak muncul di hasil
// (pemanggil tetap wajib memeriksa `belumAdaPada` untuk tgl perolehannya).
//
// ⚠️ MELEMPAR kalau query gagal, jangan diubah jadi menelan error: set kosong
// terbaca sebagai "tak ada yang disembunyikan", jadi barang yang sudah
// dihapus/diserap muncul lagi seolah masih ada — dan halamannya tetap kelihatan
// normal. Semua pemanggil sudah punya try/catch + tampilan error.
export async function fetchHiddenIds(
  supabase: SupabaseClient, ids: string[], periode: string, sembunyi: readonly string[],
): Promise<Set<string>> {
  const evByAset = new Map<string, EventVisibilitas[]>()
  const jenis = [...sembunyi, ...MUNCUL, ...LAHIR]
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,jenis,periode')
      .in('jenis', jenis as never).in('aset_id', ids.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca event visibilitas barang: ${error.message}`)
    for (const e of (data || []) as (EventVisibilitas & { aset_id: string })[]) {
      const arr = evByAset.get(e.aset_id) || []
      arr.push({ id: e.id, periode: e.periode, jenis: e.jenis })
      evByAset.set(e.aset_id, arr)
    }
  }
  const hidden = new Set<string>()
  for (const [id, evs] of evByAset) {
    if (lahirSetelah(evs, periode) || tersembunyiPada(evs, periode, sembunyi)) hidden.add(id)
  }
  return hidden
}
