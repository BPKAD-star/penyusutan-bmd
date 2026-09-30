// Pemuat Laporan Kapitalisasi — SATU sumber untuk halaman Pelaporan →
// Kapitalisasi (components/pelaporan/LaporanKapitalisasi.tsx) DAN alat baca
// Asisten AI (lib/chatbot/pengelolaan.ts). Dipindah dari komponennya
// 2026-09-30 begitu pemakai KEDUA muncul: aturan "kapitalisasi mana yang sudah
// dibatalkan" adalah aturan integritas, dan dua salinannya akan membuat chatbot
// & laporan menyebut angka berbeda tanpa satu pun error.
//
// ⚠️ Kedua jenis (`kapitalisasi` + `batal_kapitalisasi`) ditarik dalam SATU
// query lalu disaring di JS, dan diurut `id` — bentuk ini yang dilayani
// `idx_trx_kapitalisasi_id` (migrasi 20260905_02). Dikunci
// lib/sinkronisasiRpc.test.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { paginate } from '@/shared/db/paginate'
import { idTarget, type BatalPayload } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

export type SnapshotKap = {
  np_lama?: number; beban_lama?: number; akum_lama?: number; nb_lama?: number
  np_baru?: number; beban_baru?: number; akum_baru?: number; nb_baru?: number
}
export type AnakKap = { id: string; nibar: string | null; nama: string | null; nilai: number; akum?: number }
export type PayloadKap = BatalPayload & { no_dokumen?: string; snapshot?: SnapshotKap | null; anak?: AnakKap[] }
export type RowKap = {
  id: number; jenis: string; tanggal: string; periode: string; skpd_asal: number | null
  payload: PayloadKap
  aset: { nibar: string | null; nama_barang: string | null; kode: string } | null
  skpd: { nama: string } | null
}

// Satu baris tabel/Excel PER ANAK — supaya tiap barang yang diserap tetap bisa
// ditelusuri sendiri-sendiri, bukan ditumpuk jadi satu sel "3 barang".
export type BarisKap = {
  tanggal: string; periode: string; noDok: string; skpdNama: string
  indukNibar: string; indukNama: string; indukKode: string
  anakNibar: string; anakNama: string; anakNilai: number; anakAkum: number
  npAwal: number; bebanAwal: number; akumAwal: number; nbAwal: number
  npAkhir: number; bebanAkhir: number; akumAkhir: number; nbAkhir: number
}
export type RekapSkpdKap = { skpd: string; dokumen: number; anak: number; rehab: number }

export function bangunBaris(valid: RowKap[]): BarisKap[] {
  const out: BarisKap[] = []
  for (const r of valid) {
    const s = r.payload.snapshot
    const base = {
      tanggal: r.tanggal, periode: r.periode, noDok: r.payload.no_dokumen || '-',
      skpdNama: r.skpd?.nama || '(SKPD tidak diketahui)',
      indukNibar: r.aset?.nibar || '-', indukNama: r.aset?.nama_barang || '-', indukKode: r.aset?.kode || '-',
      npAwal: s?.np_lama ?? 0, bebanAwal: s?.beban_lama ?? 0, akumAwal: s?.akum_lama ?? 0, nbAwal: s?.nb_lama ?? 0,
      npAkhir: s?.np_baru ?? 0, bebanAkhir: s?.beban_baru ?? 0, akumAkhir: s?.akum_baru ?? 0, nbAkhir: s?.nb_baru ?? 0,
    }
    const anakList = r.payload.anak || []
    if (anakList.length === 0) {
      out.push({ ...base, anakNibar: '-', anakNama: '-', anakNilai: 0, anakAkum: 0 })
    } else {
      for (const a of anakList) {
        out.push({ ...base, anakNibar: a.nibar || '-', anakNama: a.nama || '-', anakNilai: a.nilai || 0, anakAkum: a.akum || 0 })
      }
    }
  }
  return out
}

export function bangunRekap(valid: RowKap[]): RekapSkpdKap[] {
  const map = new Map<string, RekapSkpdKap>()
  for (const r of valid) {
    const nama = r.skpd?.nama || '(SKPD tidak diketahui)'
    const cur = map.get(nama) || { skpd: nama, dokumen: 0, anak: 0, rehab: 0 }
    cur.dokumen += 1
    const anakList = r.payload.anak || []
    cur.anak += anakList.length
    cur.rehab += r.payload.snapshot?.np_baru != null && r.payload.snapshot?.np_lama != null
      ? r.payload.snapshot.np_baru - r.payload.snapshot.np_lama
      : anakList.reduce((s, a) => s + (a.nilai || 0), 0)
    map.set(nama, cur)
  }
  return [...map.values()].sort((a, b) => b.rehab - a.rehab)
}

const JENIS = ['kapitalisasi', 'batal_kapitalisasi']
const SELECT_COLS = 'id,jenis,tanggal,periode,skpd_asal,payload,aset:aset_id(nibar,nama_barang,kode),skpd:skpd_asal(nama)'

/**
 * Kapitalisasi yang MASIH BERLAKU (yang sudah dibatalkan dibuang).
 *
 * `periode`: '' = seluruh periode · '2026-S1' = satu semester · '2026' = S1+S2.
 * `descIds`: batasi ke SKPD ini (kolom `skpd_asal` baris kapitalisasi).
 *
 * MELEMPAR saat query gagal — daftar kosong tak boleh bisa berarti "gagal".
 */
export async function muatKapitalisasi(
  supabase: SupabaseClient, p: { periode: string; descIds: number[] | null },
): Promise<RowKap[]> {
  const per = periodeDiminta(p.periode)
  const all = await paginate<number, RowKap>('transaksi kapitalisasi', kursor => {
    let q = supabase.from('transaksi_bmd').select(SELECT_COLS).in('jenis', JENIS as never)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    if (p.descIds && p.descIds.length > 0) q = q.in('skpd_asal', p.descIds)
    if (kursor !== null) q = q.gt('id', kursor)
    return q.order('id', { ascending: true }).limit(1000) as unknown as PromiseLike<{ data: RowKap[] | null; error: { message: string } | null }>
  })
  // ⚠️ Dibatalkan lewat `payload.target_trx_id` pada baris `batal_kapitalisasi`
  // DI INDUK — baris `batal_kapitalisasi` di tiap ANAK tak ber-target_trx_id
  // (lihat batalkanKapitalisasi di Kapitalisasi.tsx), jadi `idTarget` sudah
  // otomatis mengabaikannya & tak perlu dibedakan di sini.
  const dibatalkan = new Set<number>()
  for (const r of all) if (r.jenis === 'batal_kapitalisasi') for (const t of idTarget(r.payload)) dibatalkan.add(t)
  return all.filter(r => r.jenis === 'kapitalisasi' && !dibatalkan.has(r.id))
}
