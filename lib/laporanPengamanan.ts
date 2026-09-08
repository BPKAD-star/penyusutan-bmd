// ============================================================================
// Pemuat data lembar PENGAMANAN Permendagri — keluarga IV.J.
//
// Dipakai BERSAMA tab "Format Permendagri" di menu Pelaporan → Pengelolaan →
// Pengamanan DAN halaman cetak /cetak/pengamanan-permendagri. Dua jalur angka
// untuk lembar yang sama adalah cara paling gampang menghasilkan pratinjau yang
// berbeda dari berkas yang akhirnya ditandatangani.
//
// ⚠️ **YANG DIDAFTAR = KUSTODI YANG MASIH BERLAKU pada akhir periode**, bukan
// arus peristiwa. Lembar IV.J berjudul "Laporan Penggunaan/PEMAKAIAN" & tiap
// barisnya menyebut siapa pemakainya sekarang — jadi ia POSISI, bukan ARUS.
// Karena itu keanggotaannya ditentukan replay per (aset): baris `pengamanan`
// terakhir menang, kecuali sesudahnya ada `pengembalian_pengamanan` (barang
// sudah dikembalikan) atau `batal_pengamanan` (salah catat). Pola & alasan
// persis `fetchNetRemoved`/`fetchNetSerap` di lib/rekon.ts.
//
// ⚠️ Menyaring dengan `fetchBatalTargets` seperti keluarga lain TIDAK BISA:
// `batal_pengamanan` & `pengembalian_pengamanan` tak membawa
// `payload.target_trx_id` — yang tersedia cuma URUTAN kejadian pada aset itu.
// Itu persis kelas bug yang menggigit Laporan Penghapusan 2026-09-08 (baris
// pembatalan tanpa target → set kosong → tak menyaring apa pun).
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { kodeLevel3 } from '@/lib/bmd'
import { identitasPengamanan, type PayloadPengamanan } from '@/lib/pengamanan'
import { sebutanPejabat, levelSkpd } from '@/lib/formatPermendagri'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

/** Ketiga jenis ledger pengamanan. ⚠️ KEMBAR dgn filter `.in('jenis', …)` di menunya. */
export const JENIS_PENGAMANAN = ['pengamanan', 'pengembalian_pengamanan', 'batal_pengamanan'] as const

export type BarisPengamanan = {
  id: number
  tanggal: string
  periode: string
  aset_id: string
  /** Nomor & tanggal BAST + identitas penghuni — dari `jurnal_header`. */
  header: {
    no_sk: string | null; tanggal: string | null
    skpd_id: number | null; payload: PayloadPengamanan | null
  } | null
  aset: {
    kode: string; nama_barang: string | null; uraian_barang: string | null
    nibar: string | null; alamat_detail: string | null
    keterangan: string | null; skpd_id: number | null
  } | null
}

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanPengamanan = {
  /** Golongan cabangnya — `'1.3.2'` (IV.J.1) atau `'1.3.3'` (IV.J.2). */
  golongan: string
  skpdId: number | null
  /** `'2026-S1'` / `'2026'`. Kosong = tanpa batas waktu (posisi TERKINI). */
  periode: string
}

export type HasilPengamanan = {
  rows: BarisPengamanan[]
  skpd: { kode: string; nama: string } | null
  sebutan: string
  semuaSkpd: SkpdRow[]
}

type Ev = { id: number; aset_id: string; periode: string; tanggal: string; jenis: string }

/**
 * Bagian MURNI dari replay — dipisah supaya bisa diuji tanpa DB.
 *
 * Mengembalikan id baris `pengamanan` yang MASIH BERLAKU: satu per aset,
 * peristiwa terakhirnya, dan hanya kalau peristiwa itu benar-benar `pengamanan`
 * (bukan pengembalian & bukan pembatalan).
 *
 * ⚠️ Diurutkan `(periode, id)` — sama dgn seluruh replay lain di repo ini.
 * Siklus amankan → kembalikan → amankan lagi selesai dgn "baris terakhir
 * menang", persis cara replay visibilitas memutuskan barang tampil atau tidak.
 */
export function pengamananBerlaku(rows: Ev[]): Set<number> {
  const terakhir = new Map<string, { periode: string; id: number; aman: boolean }>()
  for (const r of rows) {
    const cur = terakhir.get(r.aset_id)
    if (!cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id)) {
      terakhir.set(r.aset_id, { periode: r.periode, id: r.id, aman: r.jenis === 'pengamanan' })
    }
  }
  const out = new Set<number>()
  for (const s of terakhir.values()) if (s.aman) out.add(s.id)
  return out
}

async function semuaSkpdRows(supabase: SupabaseClient): Promise<SkpdRow[]> {
  const out: SkpdRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('admin_skpd')
      .select('id,parent_id,nama,kode_skpd').range(from, from + 999)
    if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as SkpdRow[]))
    if (data.length < 1000) break
  }
  return out
}

const SEL =
  'id,tanggal,periode,jenis,aset_id,'
  + 'header:header_id(no_sk,tanggal,skpd_id,payload),'
  + 'aset:aset_id(kode,nama_barang,uraian_barang,nibar,alamat_detail,keterangan,skpd_id)'

/**
 * Muat baris lembar IV.J untuk satu golongan.
 *
 * ⚠️ Golongan disaring DI MEMORI lewat `kodeLevel3(aset.kode)`, bukan
 * `.like('aset.kode', '1.3.2.%')`: operator `~~` tak leakproof, jadi di bawah
 * RLS ia tak pernah bisa jadi index-cond (CLAUDE.md, "ronde 1–4"). Aman di sini
 * karena kartu pengamanan sedikit — dan supaya asumsi itu tak berubah diam-diam,
 * sapuannya keyset & MELEMPAR kalau menembus pagunya.
 */
const BATAS_SAPU = 20000

export async function muatLaporanPengamanan(
  supabase: SupabaseClient, p: PermintaanPengamanan,
): Promise<HasilPengamanan> {
  const semua = await semuaSkpdRows(supabase)
  let ini: SkpdRow | undefined
  let desc: number[] | null = null
  if (p.skpdId != null) {
    ini = semua.find(x => x.id === p.skpdId)
    if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
    desc = descendantsOf(semua, p.skpdId)
  }

  // ⚠️ SELURUH riwayat ditarik (tak disaring periode), lalu dipotong sesudahnya.
  // Sebabnya lembar ini POSISI, bukan arus: untuk tahu siapa pemakai sebuah
  // barang pada akhir 2026-S1, baris `pengembalian_pengamanan` yang terjadi di
  // 2026-S1 WAJIB ikut terbaca — kalau riwayatnya dipotong per periode, barang
  // yang sudah dikembalikan tetap tercetak sbg masih dipakai.
  const mentah: BarisPengamanan[] = []
  const ev: Ev[] = []
  let terakhirId = 0
  for (;;) {
    const { data, error } = await supabase.from('transaksi_bmd').select(SEL)
      .in('jenis', JENIS_PENGAMANAN as never)
      .gt('id', terakhirId).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`gagal membaca transaksi pengamanan: ${error.message}`)
    const baris = (data as never as (BarisPengamanan & { jenis: string })[]) || []
    if (baris.length === 0) break
    for (const r of baris) {
      ev.push({ id: r.id, aset_id: r.aset_id, periode: r.periode, tanggal: r.tanggal, jenis: r.jenis })
      if (r.jenis === 'pengamanan') mentah.push(r)
    }
    terakhirId = baris[baris.length - 1].id
    if (ev.length > BATAS_SAPU) {
      throw new Error(
        `ledger pengamanan melebihi ${BATAS_SAPU.toLocaleString('id-ID')} baris. Golongan & SKPD `
        + 'menu ini disaring di memori, jadi angkanya TIDAK ditampilkan daripada dipotong '
        + 'diam-diam — pindahkan penyaringannya ke server dulu.')
    }
    if (baris.length < 1000) break
  }

  // Posisi pada AKHIR periode yang diminta: peristiwa sesudahnya tak dihitung.
  const per = periodeDiminta(p.periode)
  const batas = per.length > 0 ? per[per.length - 1] : ''
  const sampai = batas ? ev.filter(e => e.periode <= batas) : ev
  const berlaku = pengamananBerlaku(sampai)

  const rows = mentah
    .filter(r => berlaku.has(r.id))
    .filter(r => r.aset && kodeLevel3(r.aset.kode) === p.golongan)
    .filter(r => !desc || (r.aset!.skpd_id != null && desc.includes(r.aset!.skpd_id)))
    // ⚠️ URUTAN TOTAL: kode → nama → NIBAR. Tanpa pemecah seri, barang bernama
    // kembar bertukar tempat tiap kali lembarnya dicetak ulang — dan lembar ini
    // BERNOMOR, jadi nomor barisnya ikut bergeser.
    .sort((a, b) =>
      (a.aset!.kode || '').localeCompare(b.aset!.kode || '')
      || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
      || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))

  return {
    rows,
    skpd: ini ? { kode: ini.kode_skpd || '', nama: ini.nama } : null,
    sebutan: p.skpdId != null
      ? sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id]))))
      : 'Pengguna Barang',
    semuaSkpd: semua,
  }
}

/** Isi satu kolom identitas penghuni/pemakai, dgn cadangan kunci warisannya. */
export function orangPengamanan(r: BarisPengamanan) {
  const p = r.header?.payload || null
  return {
    nama: p?.nama_pegawai || '',
    identitas: identitasPengamanan(p),
    status: p?.status_penghuni || '',
    jabatan: p?.jabatan || '',
    alamat: p?.alamat || '',
    paktaNo: p?.pakta_no || '',
    paktaTgl: p?.pakta_tgl || '',
  }
}
