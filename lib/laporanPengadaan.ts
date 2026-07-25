// Data & transform untuk Laporan Pengadaan "Model 3" (format Permendagri 47/2021,
// Format IV.A — aset tetap). Dipakai bersama oleh komponen tab Model 3, halaman
// cetak, dan export Excel — supaya fetch + grouping cuma ditulis sekali.
//
// Sumber: transaksi_bmd jenis IN ('pengadaan','akumulasi_kdp') — pengadaan reguler
// + termin KDP/konstruksi. Difilter periode (semester) + subtree SKPD lewat
// aset.skpd_id (akumulasi_kdp TIDAK mengisi skpd_tujuan, jadi filter via aset yang
// seragam untuk keduanya). Biaya atribusi selalu 0 → Nilai Perolehan = Total Nilai.
import type { createClient } from '@/lib/supabase/client'
import { kodeLevel3, GOLONGAN_REKAP } from '@/lib/bmd'
import { bentukKontrakLabel } from '@/lib/bentukKontrak'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'

type Supabase = ReturnType<typeof createClient>

// Baris hasil (sudah dikelompokkan per barang identik / per aset KDP).
export type PengadaanRow = {
  skpdId: number
  golongan: string            // kodeLevel3(kode), mis. '1.3.2'
  kode: string                // aset.kode
  namaBarang: string          // uraian_barang (baku dari kodefikasi)
  spesifikasi: string         // aset.nama_barang
  merekTipe: string
  jumlah: number
  satuan: string
  hargaSatuan: number         // total / jumlah
  totalNilai: number          // Σ nilai (= nilai perolehan; atribusi 0)
  kodeSubKegiatan: string
  namaSubKegiatan: string
  kodeRekening: string
  uraianBelanja: string
  tanggal: string
  bentukKontrak: string
  namaPenyedia: string
  nomor: string               // no_sk / no kontrak
  keterangan: string
}

type Raw = {
  id: number; periode: string; tanggal: string; nilai: number
  keterangan: string | null; jenis: string
  payload: { kode_rekening?: string } | null
  aset_id: string | null
  header: {
    id: string; no_sk: string | null; jenis: string | null
    payload: { sub_kegiatan?: string; nama_penyedia?: string; penyedia?: string; sumber?: string } | null
  } | null
  aset: {
    skpd_id: number; kode: string; uraian_barang: string | null; nama_barang: string | null
    merek_tipe: string | null; satuan: string | null; status: string
  } | null
}

const splitKodeUraian = (s: string | undefined | null): [string, string] => {
  const parts = (s || '').split(' — ')
  return [(parts[0] || '').trim(), (parts.slice(1).join(' — ') || '').trim()]
}

export async function fetchLaporanPengadaan(
  supabase: Supabase,
  opts: { periode: string; descIds: number[] | null },
): Promise<PengadaanRow[]> {
  // WAJIB pilih periode: tanpa filter periode, query ini menarik SELURUH baris
  // pengadaan + termin KDP se-pemda ke browser (aturan performa CLAUDE.md —
  // paginasi/agregasi, jangan tarik semua). UI sudah memaksa pilih semester.
  if (!opts.periode) return []

  const raws: Raw[] = []
  for (let from = 0; ; from += 1000) {
    // Filter periode di server (kolom top-level); filter SKPD di JS via aset.skpd_id
    // — akumulasi_kdp TIDAK mengisi skpd_tujuan, jadi filter lewat aset lebih seragam
    // & andal daripada filter kolom embedded.
    const { data } = await supabase.from('transaksi_bmd')
      .select('id,periode,tanggal,nilai,keterangan,jenis,payload,aset_id,' +
        'header:header_id(id,no_sk,jenis,payload),' +
        'aset:aset_id(skpd_id,kode,uraian_barang,nama_barang,merek_tipe,satuan,status)')
      .in('jenis', ['pengadaan', 'akumulasi_kdp'])
      .eq('periode', opts.periode)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    raws.push(...(data as never as Raw[]))
    if (data.length < 1000) break
  }

  // PERIOD-CORRECT: buang HANYA aset yang dianggap tak pernah diperoleh (void:
  // batal_pengadaan / koreksi ganda / unapprove KDP). JANGAN pakai
  // aset.status='dihapus' — itu juga kena `penghapusan_*` (peristiwa periode
  // LAIN), yang bikin barang sah hilang dari laporan periode perolehannya.
  // Lihat lib/voidedAset.ts.
  const voided = await fetchVoidedAsetIds(supabase, ['batal_akumulasi_kdp'])
  const descSet = opts.descIds && opts.descIds.length > 0 ? new Set(opts.descIds) : null
  const rows = raws.filter(r =>
    r.aset && !(r.aset_id && voided.has(r.aset_id)) &&
    (!descSet || descSet.has(r.aset.skpd_id)))

  // Uraian rekening: payload.kode_rekening = kode_sub_rincian → lookup admin_rekening.
  const kodeRek = [...new Set(rows.map(r => r.payload?.kode_rekening).filter((x): x is string => !!x))]
  const rekMap = new Map<string, string>()
  for (let i = 0; i < kodeRek.length; i += 200) {
    const { data } = await supabase.from('admin_rekening')
      .select('kode_sub_rincian,uraian_sub_rincian').in('kode_sub_rincian', kodeRek.slice(i, i + 200))
    for (const r of (data || []) as { kode_sub_rincian: string; uraian_sub_rincian: string }[])
      rekMap.set(r.kode_sub_rincian, r.uraian_sub_rincian)
  }

  const mkBase = (r: Raw) => {
    const isKdp = r.jenis === 'akumulasi_kdp'
    const [kodeSK, namaSK] = splitKodeUraian(r.header?.payload?.sub_kegiatan)
    const kodeRekening = r.payload?.kode_rekening || ''
    return {
      skpdId: r.aset!.skpd_id,
      golongan: kodeLevel3(r.aset!.kode || ''),
      kode: r.aset!.kode || '',
      namaBarang: r.aset!.uraian_barang || '',
      spesifikasi: r.aset!.nama_barang || '',
      merekTipe: r.aset!.merek_tipe || '',
      satuan: r.aset!.satuan || '',
      kodeSubKegiatan: kodeSK,
      namaSubKegiatan: namaSK,
      kodeRekening,
      uraianBelanja: rekMap.get(kodeRekening) || '',
      tanggal: r.tanggal,
      bentukKontrak: isKdp ? bentukKontrakLabel(r.header?.payload?.sumber) : bentukKontrakLabel(r.header?.jenis),
      namaPenyedia: (isKdp ? r.header?.payload?.penyedia : r.header?.payload?.nama_penyedia) || '',
      nomor: r.header?.no_sk || '',
      keterangan: r.keterangan || '',
    }
  }

  // Grouping BEDA per jenis:
  //  - Pengadaan reguler: unit identik digabung (jumlah = banyak unit).
  //  - KDP: semua termin 1 aset → 1 baris, jumlah = 1, nilai = Σ termin.
  const grouped = new Map<string, { base: ReturnType<typeof mkBase>; jumlah: number; total: number }>()
  for (const r of rows) {
    const base = mkBase(r)
    const isKdp = r.jenis === 'akumulasi_kdp'
    const key = isKdp
      ? `kdp|${r.aset_id}`
      : [r.header?.id, base.kode, base.spesifikasi, base.merekTipe, base.kodeRekening, r.nilai].join('|')
    const g = grouped.get(key)
    if (g) { g.total += r.nilai || 0; if (!isKdp) g.jumlah += 1 }
    else grouped.set(key, { base, jumlah: 1, total: r.nilai || 0 })
  }

  const out: PengadaanRow[] = [...grouped.values()].map(({ base, jumlah, total }) => ({
    ...base, jumlah, totalNilai: total, hargaSatuan: jumlah > 0 ? total / jumlah : total,
  }))
  // Urut by kode supaya subtotal golongan berjenjang rapi.
  out.sort((a, b) => a.kode.localeCompare(b.kode) || a.spesifikasi.localeCompare(b.spesifikasi))
  return out
}

// Kelompokkan per golongan (3 segmen kode) + subtotal — untuk baris (27..30).
export type GolonganGroup = { kode: string; uraian: string; rows: PengadaanRow[]; subtotal: number }
export function groupByGolongan(rows: PengadaanRow[]): GolonganGroup[] {
  const map = new Map<string, PengadaanRow[]>()
  for (const r of rows) { const a = map.get(r.golongan) || []; a.push(r); map.set(r.golongan, a) }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kode, rs]) => ({
      kode,
      uraian: GOLONGAN_REKAP.find(g => g.kode === kode)?.uraian || kode,
      rows: rs,
      subtotal: rs.reduce((s, r) => s + r.totalNilai, 0),
    }))
}

export const grandTotal = (rows: PengadaanRow[]) => rows.reduce((s, r) => s + r.totalNilai, 0)

export type PenggunaBarang = { nama: string; nip: string | null; jabatan: string | null }

// Pengguna Barang penanda tangan laporan (footer) — NIP bisa null (non-ASN RSUD).
export async function fetchPenggunaBarang(supabase: Supabase, skpdId: number): Promise<PenggunaBarang | null> {
  return (await fetchPenggunaBarangMap(supabase, [skpdId])).get(skpdId) || null
}

// Versi batch (mode se-kabupaten: footer per SKPD). Ambil 1 Pengguna Barang per SKPD.
export async function fetchPenggunaBarangMap(
  supabase: Supabase, skpdIds: number[],
): Promise<Map<number, PenggunaBarang>> {
  const map = new Map<number, PenggunaBarang>()
  const uniq = [...new Set(skpdIds)]
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await supabase.from('admin_pegawai')
      .select('skpd_id,nama,nip,jabatan').in('skpd_id', uniq.slice(i, i + 200))
      .eq('role_bmd', 'pengguna_barang').order('nama')
    for (const r of (data || []) as (PenggunaBarang & { skpd_id: number })[]) {
      if (!map.has(r.skpd_id)) map.set(r.skpd_id, { nama: r.nama, nip: r.nip, jabatan: r.jabatan })
    }
  }
  return map
}
