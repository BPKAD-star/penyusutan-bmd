// Akses data modul Inventarisasi per-barang (migrasi 20260923_03). Semua
// TULIS lewat RPC — tabel `inventarisasi_barang` sengaja tak punya policy tulis
// supaya snapshot "sebelum", baseline notifikasi, & status tak bisa dikarang
// klien. Semua fungsi di sini MELEMPAR saat gagal: daftar kosong tak boleh bisa
// berarti "query gagal".
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InvBaris, InvJawaban, InvSnapshot, InvStatus, Petugas, PosisiBerubah, TransaksiSesudah,
} from '@/lib/inventarisasi'

/** Satu baris Lembar Kerja = satu barang di register hidup + status inventarisasinya. */
export type BarisLembar = {
  aset_id: string
  nibar: string | null
  kode_register: string | null
  kode: string
  uraian: string | null
  nama_barang: string | null
  spesifikasi_lainnya: string | null
  merek_tipe: string | null
  jumlah: number | null
  satuan: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
  kondisi_barang: string | null
  alamat_detail: string | null
  latitude: number | null
  longitude: number | null
  no_polisi: string | null
  no_rangka: string | null
  no_mesin: string | null
  skpd_id: number
  skpd_nama: string | null
  inv_id: string | null
  inv_status: InvStatus | null
  inv_catatan: string | null
  inv_diisi_at: string | null
  transaksi_sesudah: TransaksiSesudah[]
}

export type FilterLembar = 'semua' | 'belum' | 'diisi' | 'divalidasi'

export async function muatLembar(
  supabase: SupabaseClient,
  f: { golongan: string; skpdIds: number[] | null; status: FilterLembar; cari: string; limit: number; offset: number },
): Promise<BarisLembar[]> {
  const { data, error } = await supabase.rpc('fn_inventarisasi_lembar', {
    p_golongan: f.golongan,
    p_skpd_ids: f.skpdIds && f.skpdIds.length > 0 ? f.skpdIds : null,
    p_status: f.status === 'semua' ? null : f.status,
    p_cari: f.cari.trim() || null,
    p_limit: f.limit,
    p_offset: f.offset,
  })
  if (error) throw new Error(`gagal memuat lembar kerja: ${error.message}`)
  return (data || []) as BarisLembar[]
}

/** Satu baris menu Validasi = satu isian tersimpan (bukan register hidup). */
export type BarisHasil = {
  id: string
  tahun: number
  skpd_id: number
  skpd_nama: string | null
  golongan: string
  aset_id: string | null
  snapshot: InvSnapshot
  jawaban: InvJawaban
  foto_paths: string[]
  status: InvStatus
  catatan_validator: string | null
  diisi_at: string
  divalidasi_at: string | null
  posisi: PosisiBerubah | null
  posisi_skpd_nama: string | null
  posisi_golongan: string | null
  transaksi_sesudah: TransaksiSesudah[]
}

export type FilterHasil = 'menunggu' | 'divalidasi' | 'berubah' | 'semua'

export async function muatHasil(
  supabase: SupabaseClient,
  f: { tahun: number; golongan: string; skpdIds: number[] | null; filter: FilterHasil; cari: string; limit: number; offset: number },
): Promise<BarisHasil[]> {
  const { data, error } = await supabase.rpc('fn_inventarisasi_hasil', {
    p_tahun: f.tahun,
    p_golongan: f.golongan,
    p_skpd_ids: f.skpdIds && f.skpdIds.length > 0 ? f.skpdIds : null,
    p_filter: f.filter,
    p_cari: f.cari.trim() || null,
    p_limit: f.limit,
    p_offset: f.offset,
  })
  if (error) throw new Error(`gagal memuat hasil inventarisasi: ${error.message}`)
  return (data || []) as BarisHasil[]
}

/** Isian tersimpan → bentuk yang dibaca LkiForm & klasifikasi LHI. */
export function barisDariHasil(h: BarisHasil): InvBaris {
  return {
    id: h.id, aset_id: h.aset_id, snapshot: h.snapshot || {}, jawaban: h.jawaban || {},
    foto_paths: h.foto_paths || [], status: h.status, catatan_validator: h.catatan_validator,
  }
}

/**
 * Pratinjau kondisi "SEBELUM" untuk barang yang BELUM pernah diisi — hanya
 * untuk ditampilkan di form. Yang tersimpan tetap dibangun SERVER saat simpan
 * (`fn_inventarisasi_snapshot`), jadi pratinjau ini tak bisa mengarang apa pun.
 */
export function snapshotDariLembar(r: BarisLembar): InvSnapshot {
  return {
    nibar: r.nibar, kode_register: r.kode_register, kode: r.kode, uraian_barang: r.uraian,
    nama_barang: r.nama_barang, spesifikasi_lainnya: r.spesifikasi_lainnya, merek_tipe: r.merek_tipe,
    jumlah: r.jumlah, satuan: r.satuan, nilai_perolehan: r.nilai_perolehan, alamat: r.alamat_detail,
    kondisi: r.kondisi_barang, tgl_perolehan: r.tgl_perolehan,
    no_polisi: r.no_polisi, no_rangka: r.no_rangka, no_mesin: r.no_mesin,
    latitude: r.latitude, longitude: r.longitude, skpd_id: r.skpd_id,
  }
}

const KOLOM_ISIAN = 'id,aset_id,snapshot,jawaban,foto_paths,status,catatan_validator'

/** Isian tersimpan satu barang (dibaca ulang saat lembarnya dibuka). */
export async function muatIsian(supabase: SupabaseClient, id: string): Promise<InvBaris> {
  const { data, error } = await supabase.from('inventarisasi_barang').select(KOLOM_ISIAN).eq('id', id).maybeSingle()
  if (error) throw new Error(`gagal membaca isian inventarisasi: ${error.message}`)
  if (!data) throw new Error('isian inventarisasi tidak ditemukan (mungkin tak terlihat dari SKPD Anda)')
  return data as InvBaris
}

/** Lembar "BMD Belum Tercatat" milik SATU unit untuk tahun & jenis aset ini. */
export async function muatBelumTercatat(
  supabase: SupabaseClient, f: { tahun: number; golongan: string; skpdId: number },
): Promise<InvBaris[]> {
  const { data, error } = await supabase.from('inventarisasi_barang').select(KOLOM_ISIAN)
    .eq('tahun', f.tahun).eq('golongan', f.golongan).eq('skpd_id', f.skpdId)
    .is('aset_id', null).order('created_at')
  if (error) throw new Error(`gagal membaca BMD Belum Tercatat: ${error.message}`)
  return (data || []) as InvBaris[]
}

export async function simpanIsian(
  supabase: SupabaseClient,
  a: { id: string | null; asetId: string | null; skpdId: number | null; golongan: string; jawaban: InvJawaban; foto: string[] },
): Promise<string> {
  const { data, error } = await supabase.rpc('fn_inventarisasi_simpan', {
    p_id: a.id || null, p_aset_id: a.asetId, p_skpd_id: a.skpdId, p_golongan: a.golongan,
    p_jawaban: a.jawaban, p_foto: a.foto,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export type Ringkas = {
  total_aset: number
  menunggu: number
  divalidasi: number
  berubah: number
  belum_tercatat: number
}

export async function muatRingkas(
  supabase: SupabaseClient, f: { tahun: number; golongan: string; skpdIds: number[] | null },
): Promise<Ringkas> {
  const { data, error } = await supabase.rpc('fn_inventarisasi_ringkas', {
    p_tahun: f.tahun, p_golongan: f.golongan,
    p_skpd_ids: f.skpdIds && f.skpdIds.length > 0 ? f.skpdIds : null,
  })
  if (error) throw new Error(error.message)
  const r = ((data || []) as Ringkas[])[0]
  if (!r) throw new Error('ringkasan kosong')
  return {
    total_aset: Number(r.total_aset), menunggu: Number(r.menunggu), divalidasi: Number(r.divalidasi),
    berubah: Number(r.berubah), belum_tercatat: Number(r.belum_tercatat),
  }
}

/**
 * Barang di register yang BELUM punya isian di posisinya sekarang. Barang
 * BMD Belum Tercatat tak ikut dihitung — ia tak ada di register.
 */
export function belumDiinventarisasi(r: Ringkas): number {
  const sudah = r.menunggu + r.divalidasi - r.belum_tercatat
  return Math.max(0, r.total_aset - sudah)
}

// ── Tim pelaksana (per SKPD × tahun) ────────────────────────────────────────
export async function muatTimSendiri(
  supabase: SupabaseClient, skpdId: number, tahun: number,
): Promise<Petugas[]> {
  const { data, error } = await supabase.from('inventarisasi_tim')
    .select('petugas').eq('skpd_id', skpdId).eq('tahun', tahun).maybeSingle()
  if (error) throw new Error(`gagal membaca tim inventarisasi: ${error.message}`)
  return ((data as { petugas: Petugas[] } | null)?.petugas) || []
}

export async function simpanTim(
  supabase: SupabaseClient, skpdId: number, tahun: number, petugas: Petugas[],
): Promise<void> {
  const { error } = await supabase.from('inventarisasi_tim')
    .upsert({ skpd_id: skpdId, tahun, petugas }, { onConflict: 'skpd_id,tahun' })
  if (error) throw new Error(`gagal menyimpan tim inventarisasi: ${error.message}`)
}

/**
 * Tim yang dicetak di lembar sebuah unit: timnya sendiri, atau — kalau unit
 * itu tak menyusun tim — tim SKPD induk terdekat. Sub-unit (UPTD, sekolah)
 * sering diinventarisasi oleh tim dinas induknya, jadi tanpa cadangan ini
 * blok petugasnya kosong di hampir semua lembar sub-unit.
 */
export async function muatTimUntukCetak(
  supabase: SupabaseClient, skpdId: number, tahun: number,
): Promise<{ petugas: Petugas[]; dariSkpdId: number | null }> {
  const rantai: number[] = [skpdId]
  let cur: number | null = skpdId
  for (let i = 0; i < 6 && cur != null; i++) {
    const { data, error } = await supabase.from('admin_skpd').select('parent_id').eq('id', cur).maybeSingle()
    if (error) throw new Error(`gagal membaca SKPD induk: ${error.message}`)
    cur = (data as { parent_id: number | null } | null)?.parent_id ?? null
    if (cur != null) rantai.push(cur)
  }
  const { data, error } = await supabase.from('inventarisasi_tim')
    .select('skpd_id,petugas').eq('tahun', tahun).in('skpd_id', rantai)
  if (error) throw new Error(`gagal membaca tim inventarisasi: ${error.message}`)
  const peta = new Map(((data || []) as { skpd_id: number; petugas: Petugas[] }[]).map(r => [r.skpd_id, r.petugas]))
  for (const id of rantai) {
    const p = peta.get(id)
    if (p && p.length > 0) return { petugas: p, dariSkpdId: id }
  }
  return { petugas: [], dariSkpdId: null }
}
