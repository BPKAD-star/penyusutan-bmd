// Status kunci batal untuk kartu Pengalihan Status/Mutasi Internal — dipakai
// Penggunaan (PenggunaanMasuk.tsx) & Penerimaan Internal (PenerimaanInternal.tsx)
// supaya operator tak perlu MENEBAK dengan menekan 🗑 Batal dulu untuk tahu
// barang itu akan ditolak atau tidak (permintaan user 2026-09-17).
//
// ⚠️ INI HIASAN, BUKAN PENJAGA. Penjaga sesungguhnya tetap
// `fn_batal_pengalihan_barang` (SQL, dipanggil saat tombol Batal SUNGGUHAN
// ditekan) — RPC ini murni mengintip lebih dulu supaya UI bisa menunjukkan
// hasilnya sebelum diklik. Kalau panggilan ini gagal, JANGAN jatuhkan
// halaman — cukup jangan tampilkan kunci apa pun, tombol Batal tetap seperti
// biasa (fail-OPEN utk fitur informasional, beda dari guard sungguhan yang
// wajib fail-closed).
import type { SupabaseClient } from '@supabase/supabase-js'

export type Penghalang = { jenis: string; periode: string }

/**
 * Batch PER-KARTU (bukan per-halaman/per-baris): satu panggilan RPC menjawab
 * status kunci SELURUH barang di satu header sekaligus. Sengaja dibatasi
 * begitu — isi satu kartu terbatas (puluhan barang), sementara satu halaman
 * bisa memuat banyak kartu; menanyakannya per baris akan mengembalikan pola
 * N-query yang sudah berkali-kali bikin timeout di repo ini (lihat CLAUDE.md).
 *
 * MELEMPAR kalau RPC-nya gagal — pemanggil WAJIB fail-open (lihat komentar di
 * atas), bukan fail-closed spt guard pembatalan sungguhan.
 */
export async function fetchBarisTerkunci(
  supabase: SupabaseClient, headerId: string,
): Promise<Map<string, Penghalang | null>> {
  const out = new Map<string, Penghalang | null>()
  const { data, error } = await supabase.rpc('fn_pengalihan_baris_terkunci', { p_header_id: headerId })
  if (error) throw new Error(`gagal memeriksa status kunci kartu: ${error.message}`)
  for (const r of (data || []) as {
    aset_id: string; terkunci: boolean
    jenis_penghalang: string | null; periode_penghalang: string | null
  }[]) {
    out.set(r.aset_id, (r.terkunci && r.jenis_penghalang)
      ? { jenis: r.jenis_penghalang, periode: r.periode_penghalang || '-' }
      : null)
  }
  return out
}
