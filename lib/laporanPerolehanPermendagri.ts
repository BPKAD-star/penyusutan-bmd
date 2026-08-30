// ============================================================================
// Pemuat data lembar Perolehan format Permendagri (cabang IV.A).
//
// Dipakai BERSAMA oleh tab "Format Permendagri" di menu Pelaporan dan halaman
// cetak /cetak/perolehan-permendagri. Dua jalur angka untuk lembar yang sama
// adalah cara paling gampang menghasilkan pratinjau yang berbeda dari berkas
// yang akhirnya ditandatangani — dan bedanya tak akan bersuara.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR, tak ada
// yang ditelan jadi "datanya memang kosong". Pemanggil menampilkan pesannya dan
// MENOLAK menyusun lembar.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'
import { petaNamaTingkat, sebutanPejabat, levelSkpd, type BarisKodefikasi } from '@/lib/formatPermendagri'
import type { BarisLembar } from '@/components/pelaporan/LembarPerolehanPermendagri'

export type BarisPerolehan = BarisLembar & { aset_id: string | null }

const SEL = 'id,tanggal,nilai,keterangan,aset_id,header:header_id(no_sk,payload),' +
  'aset:aset_id(kode,nama_barang,uraian_barang,nibar,spesifikasi_lainnya,satuan,jumlah,' +
  'harga_satuan,kondisi_barang,tgl_perolehan,keterangan,intra_ekstra)'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

/** Node + SELURUH turunannya — samakan dgn `SkpdCombobox.descendants`. */
export function descendantsOf(all: { id: number; parent_id: number | null }[], root: number): number[] {
  const anak = new Map<number, number[]>()
  for (const s of all) {
    if (s.parent_id == null) continue
    const a = anak.get(s.parent_id) || []; a.push(s.id); anak.set(s.parent_id, a)
  }
  const out: number[] = []; const stack = [root]; const seen = new Set<number>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id); out.push(id)
    for (const c of anak.get(id) || []) stack.push(c)
  }
  return out
}

export type PermintaanLembar = {
  jenis: string
  skpdId: number
  /**
   * `'2026-S1'` → satu semester. `'2026'` (empat digit) → **AKHIR TAHUN**: kedua
   * semester tahun itu digabung.
   *
   * ⚠️ Kosong berarti SELURUH periode yang pernah ada — itu bukan "akhir tahun"
   * dan tak boleh dipakai untuk lembar bertanda tangan, karena kop (5)/(6)-nya
   * akan menyebut satu tahun sementara isinya melintasi tahun lain.
   */
  periode: string
}

export type HasilLembar = {
  rows: BarisPerolehan[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string }
  /** Sebutan pejabat penanda tangan, diturunkan dari LEVEL node SKPD. */
  sebutan: string
  /** Seluruh SKPD (dipakai pemanggil untuk mencari calon penanda tangan). */
  semuaSkpd: SkpdRow[]
}

/** `'2026'` → `['2026-S1','2026-S2']`; `'2026-S1'` → `['2026-S1']`; '' → []. */
export function periodeDiminta(periode: string): string[] {
  if (!periode) return []
  if (/^\d{4}$/.test(periode)) return [`${periode}-S1`, `${periode}-S2`]
  return [periode]
}

export async function muatLembarPerolehan(
  supabase: SupabaseClient, p: PermintaanLembar,
): Promise<HasilLembar> {
  const semua: SkpdRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('admin_skpd')
      .select('id,parent_id,nama,kode_skpd').range(from, from + 999)
    if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
    if (!data || data.length === 0) break
    semua.push(...(data as SkpdRow[]))
    if (data.length < 1000) break
  }
  const ini = semua.find(x => x.id === p.skpdId)
  if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
  const desc = descendantsOf(semua, p.skpdId)

  // Bentuk query SAMA dgn LaporanPerolehan & /cetak/perolehan supaya ikut
  // dilayani partial index `idx_trx_perolehan_id` (migrasi 20260820_03). Tanpa
  // index itu `ORDER BY id DESC LIMIT n` di atas filter `jenis` — yang tak bisa
  // jadi index-cond di bawah RLS — menyusuri seluruh ledger.
  let qq = supabase.from('transaksi_bmd').select(SEL)
    .eq('jenis', p.jenis).order('id', { ascending: false })
  const per = periodeDiminta(p.periode)
  if (per.length === 1) qq = qq.eq('periode', per[0])
  else if (per.length > 1) qq = qq.in('periode', per)
  if (desc.length > 0) {
    const list = desc.join(',')
    qq = qq.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
  }
  const { data: trx, error: trxErr } = await qq.limit(2000)
  if (trxErr) throw new Error(trxErr.message)

  // ⚠️ Komptabel TIDAK disaring di sini — saringannya saat render, supaya
  // pemilihnya bisa berganti tanpa menembak query kedua.
  const semuaBaris = ((trx as never as BarisPerolehan[]) || []).filter(r => r.aset)

  const voided = await fetchVoidedAsetIds(
    supabase, [], semuaBaris.map(r => r.aset_id).filter((x): x is string => !!x))

  // ⚠️ URUTAN TOTAL & WAJIB — mesin subtotal memancarkan baris kelompok saat
  // awalan kode BERUBAH, jadi barisnya harus sudah urut menaik menurut kode.
  // Kunci kedua & ketiga pemecah seri: tanpanya barang bernama kembar bertukar
  // tempat tiap kali lembarnya dicetak ulang.
  const rows = semuaBaris
    .filter(r => !(r.aset_id && voided.has(r.aset_id)))
    .sort((a, b) =>
      (a.aset!.kode || '').localeCompare(b.aset!.kode || '')
      || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
      || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))

  // ⚠️ Nama tiap tingkat diambil dari KOLOM hierarki baris 7-segmen, BUKAN
  // dari baris ber-kode pendek: `admin_kodefikasi_bmd` hanya berisi baris 7
  // segmen, jadi mencari '1.3.2' di kolom `kode` mengembalikan NOL baris tanpa
  // satu pun error & kolom Nama Barang di semua baris subtotal tinggal kosong.
  let namaTingkat = petaNamaTingkat([])
  const kodes = [...new Set(rows.map(r => r.aset!.kode))]
  if (kodes.length > 0) {
    const { data: kd, error: kdErr } = await supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,nama_jenis,nama_objek,nama_rincian,nama_sub_rincian')
      .in('kode', kodes)
    if (kdErr) throw new Error(`gagal membaca kodefikasi barang: ${kdErr.message}`)
    namaTingkat = petaNamaTingkat((kd || []) as BarisKodefikasi[])
  }

  return {
    rows,
    namaTingkat,
    skpd: { kode: ini.kode_skpd || '', nama: ini.nama },
    sebutan: sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id])))),
    semuaSkpd: semua,
  }
}
