// Termin KDP (Pekerjaan Konstruksi) untuk tab "Daftar Transaksi" & "Rekap per
// SKPD" Laporan Pengadaan (2026-10-04).
//
// Sampai hari itu kedua tab membaca ledger `pengadaan` saja, jadi barang KDP
// yang sudah DISETUJUI tak pernah tampil di sana — sementara tab Format
// Permendagri (lib/laporanPengadaan.ts) membaca `pengadaan` + `akumulasi_kdp`
// dan memuatnya. Tiga tab satu laporan, dua angka berbeda.
//
// ⚠️ SATU BARIS PER BARANG KDP (Σ termin), BUKAN satu per termin — sama dgn
// Format Permendagri (jumlah = 1, nilai = Σ termin). Satu baris per termin
// membuat satu bangunan terhitung 6 "transaksi" & mustahil dibandingkan dgn
// kuantitas yang dientry di menu Pengadaan.
//
// ⚠️ JANGAN menyaring `jenis = 'akumulasi_kdp'` langsung. `jenis` (ENUM) tak
// bisa jadi index-cond di bawah RLS, dan jenis ini cuma segelintir baris di
// ledger ratusan ribu → planner menyusuri PRIMARY KEY mundur: DIUKUR ke produksi
// dgn RLS aktif 47.810 ms (pagu 8 dtk). Jalan yang dipakai: header kontrak
// konstruksi yang disetujui (tabel kecil, `idx_jh_kategori`) → baris ledger
// lewat `idx_trx_header`. Diukur 35 ms. Tanpa migrasi.
//
// ⚠️ Header `disetujui` TIDAK cukup untuk membuang yang dianulir: sejak
// 2026-10-07 termin disetujui & dibatalkan SATU PER SATU, jadi kartu disetujui
// bisa memuat termin yang sudah batal. Dibuang PER BARIS lewat
// fetchTerminKdpBatal (warisan Buka Kunci `{}` ikut terbaca di sana).
//
// No/Tgl Kontrak & Penyedia diambil dari PAYLOAD BARIS (dibekukan saat termin
// disetujui — model kontrak per komponen); kartu lama jatuh ke header.
import type { createClient } from '@/lib/supabase/client'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { fetchTerminKdpBatal } from '@/lib/voidedAset'

type Supabase = ReturnType<typeof createClient>

/** Bentuk yang SAMA dgn `Trx` di components/LaporanPerolehan.tsx. */
export type BarisKdp = {
  id: number; periode: string; tanggal: string; nilai: number
  keterangan: string | null
  payload: { pihak?: string; kode_rekening?: string } | null
  header: { no_sk: string; tanggal: string; nama_penyedia: string | null; sub_kegiatan: string | null; no_bast: string | null } | null
  skpd_tujuan: number | null
  aset_id: string | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    merek_tipe: string | null; spesifikasi_lainnya: string | null; intra_ekstra: string | null; status: string
    luas: number | string | null; keterangan: string | null
  } | null
}

type Mentah = {
  id: number; periode: string; tanggal: string; nilai: number
  keterangan: string | null
  payload: {
    kode_rekening?: string; no_bast?: string | null
    no_kontrak?: string | null; tgl_kontrak?: string | null; penyedia?: string | null
  } | null
  skpd_tujuan: number | null
  aset_id: string | null
  header: BarisKdp['header']
  aset: (NonNullable<BarisKdp['aset']> & { skpd_id: number }) | null
}

// Barang KDP bisa dibayar atas beberapa kontrak (perencanaan, fisik, …) —
// semuanya disebut, urut kemunculan, tanpa kembar.
const unik = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map(x => (x || '').trim()).filter(Boolean))].join(', ')

/** Satu baris per aset: Σ nilai termin, identitas dari termin TERAKHIR. */
export function gabungPerAset(termin: Mentah[]): BarisKdp[] {
  const per = new Map<string, Mentah[]>()
  for (const t of termin) {
    if (!t.aset_id) continue
    const a = per.get(t.aset_id) ?? []
    a.push(t); per.set(t.aset_id, a)
  }
  const out: BarisKdp[] = []
  for (const list of per.values()) {
    list.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id - b.id)
    const akhir = list[list.length - 1]
    const ket = akhir.aset?.keterangan || akhir.keterangan || ''
    out.push({
      id: akhir.id,
      periode: akhir.periode,
      tanggal: akhir.tanggal,
      nilai: list.reduce((s, t) => s + (t.nilai || 0), 0),
      keterangan: `[KDP · Σ ${list.length} termin]${ket ? ' ' + ket : ''}`,
      payload: { kode_rekening: akhir.payload?.kode_rekening },
      header: akhir.header ? {
        ...akhir.header,
        no_sk: unik(list.map(t => t.payload?.no_kontrak)) || akhir.header.no_sk,
        tanggal: akhir.payload?.tgl_kontrak || akhir.header.tanggal,
        nama_penyedia: unik(list.map(t => t.payload?.penyedia)) || akhir.header.nama_penyedia,
        no_bast: akhir.payload?.no_bast ?? null,
      } : null,
      skpd_tujuan: akhir.skpd_tujuan ?? akhir.aset?.skpd_id ?? null,
      aset_id: akhir.aset_id,
      aset: akhir.aset,
    })
  }
  return out
}

export async function muatTerminKdp(
  supabase: Supabase, opts: { periode: string; descIds: number[] | null },
): Promise<BarisKdp[]> {
  // 1) Kontrak konstruksi yang disetujui (RLS membatasi ke yang boleh dilihat).
  const idHeader: string[] = []
  for (let kursor: string | null = null; ;) {
    let q = supabase.from('jurnal_header').select('id')
      .eq('kategori', 'konstruksi').eq('approval_status', 'disetujui')
      .order('id', { ascending: true }).limit(1000)
    if (kursor) q = q.gt('id', kursor)
    const { data, error } = await q
    if (error) throw new Error(`gagal membaca kontrak konstruksi: ${error.message}`)
    const baris = (data || []) as { id: string }[]
    idHeader.push(...baris.map(b => b.id))
    if (baris.length < 1000) break
    kursor = baris[baris.length - 1].id
  }
  if (idHeader.length === 0) return []

  // 2) Termin per kontrak. `nama_penyedia` KDP tinggal di payload.penyedia &
  //    cuma ruas yang dibutuhkan yang ditarik (payload utuh memuat barang[]).
  const per = periodeDiminta(opts.periode)
  const termin: Mentah[] = []
  for (let i = 0; i < idHeader.length; i += 100) {
    let q = supabase.from('transaksi_bmd')
      .select('id,periode,tanggal,nilai,keterangan,payload,skpd_tujuan,aset_id,' +
        'header:header_id(no_sk,tanggal,nama_penyedia:payload->>penyedia,sub_kegiatan:payload->>sub_kegiatan),' +
        'aset:aset_id(skpd_id,kode,uraian_barang,nama_barang,nibar,merek_tipe,spesifikasi_lainnya,intra_ekstra,status,luas,keterangan)')
      .in('header_id', idHeader.slice(i, i + 100)).eq('jenis', 'akumulasi_kdp')
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    const { data, error } = await q.limit(1000)
    if (error) throw new Error(`gagal membaca termin KDP: ${error.message}`)
    termin.push(...((data as never as Mentah[]) || []))
  }

  // 3) Buang termin yang dibatalkan — PER BARIS.
  const asetIds = [...new Set(termin.map(t => t.aset_id).filter((x): x is string => !!x))]
  const batal = asetIds.length > 0 ? await fetchTerminKdpBatal(supabase, asetIds) : new Set<number>()
  const desc = opts.descIds && opts.descIds.length > 0 ? new Set(opts.descIds) : null
  const hidup = termin.filter(t => t.aset && !batal.has(t.id) &&
    (!desc || desc.has(t.skpd_tujuan ?? t.aset.skpd_id)))
  return gabungPerAset(hidup)
}
