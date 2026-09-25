// Akses data modul IPA lima aspek (migrasi 20260925_03). Semua fungsi baca di
// sini MELEMPAR saat gagal: daftar kosong tak boleh bisa berarti "query gagal"
// — skor IPA yang dihitung dari data setengah dimuat terlihat sah padahal
// tidak.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  akhirBulan, beriPeringkat, hitungSkpd, nilaiDariAngka, nilaiIsianPada,
  type Aspek, type BarisIsian, type BobotAspek, type HasilSkpd, type Indikator,
  type KodeAspek, type KodeKlaster, type NilaiIndikator, type Parameter, type StatusIsian,
} from '@/lib/ipa'

export const BUCKET_BUKTI = 'dokumen-sumber'

function cek<T>(res: { data: T | null; error: { message: string } | null }, apa: string): T {
  if (res.error) throw new Error(`gagal memuat ${apa}: ${res.error.message}`)
  return (res.data ?? ([] as unknown as T))
}

// ── Referensi ───────────────────────────────────────────────────────────────
export type SkpdIpa = { skpd_id: number; nama: string; klaster: KodeKlaster; sertakan_turunan: boolean }
export type ParameterBaris = { kunci: string; nilai: number; keterangan: string }
export type Referensi = {
  aspek: Aspek[]
  indikator: Indikator[]
  bobotAspek: BobotAspek
  skpd: SkpdIpa[]
  parameterBaris: ParameterBaris[]
  parameter: Parameter
}

export async function muatReferensi(sb: SupabaseClient): Promise<Referensi> {
  const [asp, ind, bob, skp, par] = await Promise.all([
    sb.from('ipa_aspek').select('kode,nama,urut').order('urut'),
    sb.from('ipa_indikator').select('*').order('urut'),
    sb.from('ipa_bobot_aspek').select('klaster,aspek,bobot'),
    sb.from('ipa_skpd').select('skpd_id,klaster,sertakan_turunan,skpd:skpd_id(nama)').order('skpd_id'),
    sb.from('ipa_parameter').select('kunci,nilai,keterangan').order('kunci'),
  ])
  const bobotAspek = { A: {}, B: {}, C: {}, D: {} } as BobotAspek
  for (const b of cek(bob, 'bobot aspek') as { klaster: KodeKlaster; aspek: KodeAspek; bobot: number }[]) {
    bobotAspek[b.klaster][b.aspek] = Number(b.bobot)
  }
  const parameterBaris = (cek(par, 'parameter IPA') as ParameterBaris[]).map(p => ({ ...p, nilai: Number(p.nilai) }))
  const nilaiParam = (k: string, d: number) => parameterBaris.find(p => p.kunci === k)?.nilai ?? d
  type SkpdRaw = { skpd_id: number; klaster: KodeKlaster; sertakan_turunan: boolean; skpd: { nama: string } | { nama: string }[] | null }
  return {
    aspek: cek(asp, 'aspek IPA') as Aspek[],
    indikator: (cek(ind, 'indikator IPA') as Indikator[]).map(i => ({ ...i, bobot: Number(i.bobot) })),
    bobotAspek,
    skpd: (cek(skp, 'SKPD penilaian') as SkpdRaw[]).map(s => ({
      skpd_id: s.skpd_id, klaster: s.klaster, sertakan_turunan: s.sertakan_turunan,
      nama: (Array.isArray(s.skpd) ? s.skpd[0]?.nama : s.skpd?.nama) ?? `SKPD ${s.skpd_id}`,
    })),
    parameterBaris,
    parameter: {
      targetEkoPersen: nilaiParam('target_eko_persen', 10),
      ambangBobotBerlaku: nilaiParam('ambang_bobot_berlaku', 70),
    },
  }
}

// ── Hasil otomatis (snapshot bulanan) ───────────────────────────────────────
export type BarisOtomatis = {
  skpd_id: number
  indikator: string
  bulan: number
  pembilang: number
  penyebut: number
  rincian: Record<string, unknown>
  dihitung_at: string
}

/** Seluruh snapshot bulan ≤ `bulan` (tiap bulan satu baris per SKPD × indikator). */
export async function muatOtomatisMentah(sb: SupabaseClient, tahun: number, bulan: number, skpdId?: number): Promise<BarisOtomatis[]> {
  // Paling banyak 60 SKPD × 9 indikator × 12 bulan = 6.480 baris → dipotong
  // per 1.000, diurut menurut PRIMARY KEY supaya antar-halaman tak ada yang
  // terlewat/dobel. Builder dirakit ULANG tiap halaman (builder supabase-js
  // menumpuk `.order()` kalau dipakai ulang).
  const semua: BarisOtomatis[] = []
  for (let dari = 0; ; dari += 1000) {
    let q = sb.from('ipa_otomatis')
      .select('skpd_id,indikator,bulan,pembilang,penyebut,rincian,dihitung_at')
      .eq('tahun', tahun).lte('bulan', bulan)
    if (skpdId != null) q = q.eq('skpd_id', skpdId)
    const { data, error } = await q.order('bulan').order('skpd_id').order('indikator').range(dari, dari + 999)
    if (error) throw new Error(`gagal memuat hasil otomatis IPA: ${error.message}`)
    semua.push(...((data || []) as BarisOtomatis[]).map(b => ({ ...b, pembilang: Number(b.pembilang), penyebut: Number(b.penyebut) })))
    if (!data || data.length < 1000) break
  }
  return semua
}

/**
 * Snapshot TERAKHIR per (SKPD, indikator) dgn bulan ≤ `bulan`. Bulan tanpa
 * hitung ulang memakai snapshot bulan sebelumnya — kalau tidak, membuka bulan
 * yang belum pernah dihitung menampilkan seluruh SKPD "belum".
 */
export function snapshotTerakhir(rows: BarisOtomatis[], bulan: number): BarisOtomatis[] {
  const terakhir = new Map<string, BarisOtomatis>()
  for (const b of rows) {
    if (b.bulan > bulan) continue
    const k = `${b.skpd_id}|${b.indikator}`
    const ada = terakhir.get(k)
    if (!ada || b.bulan > ada.bulan) terakhir.set(k, b)
  }
  return [...terakhir.values()]
}

export async function muatOtomatis(sb: SupabaseClient, tahun: number, bulan: number, skpdId?: number): Promise<BarisOtomatis[]> {
  return snapshotTerakhir(await muatOtomatisMentah(sb, tahun, bulan, skpdId), bulan)
}

/** Hitung ulang & simpan snapshot bulan berjalan untuk satu SKPD. */
export async function hitungUlangOtomatis(sb: SupabaseClient, tahun: number, skpdId: number): Promise<void> {
  const { error } = await sb.rpc('fn_ipa_simpan_otomatis', { p_tahun: tahun, p_skpd_id: skpdId })
  if (error) throw new Error(`gagal menghitung IPA SKPD ${skpdId}: ${error.message}`)
}

// ── Isian SKPD (TL BPK / TL Inspektorat) ────────────────────────────────────
export type Isian = BarisIsian & {
  id: string
  tahun: number
  skpd_id: number
  catatan: string | null
  bukti_paths: string[]
  catatan_verifikator: string | null
  verified_at: string | null
}
const KOLOM_ISIAN = 'id,tahun,skpd_id,indikator,tidak_ada,pembilang,penyebut,tanggal_capaian,catatan,bukti_paths,status,catatan_verifikator,created_at,verified_at'

export async function muatIsian(sb: SupabaseClient, tahun: number, opsi: { skpdId?: number; status?: StatusIsian } = {}): Promise<Isian[]> {
  let q = sb.from('ipa_isian').select(KOLOM_ISIAN).eq('tahun', tahun)
  if (opsi.skpdId != null) q = q.eq('skpd_id', opsi.skpdId)
  if (opsi.status) q = q.eq('status', opsi.status)
  const rows = cek(await q.order('tanggal_capaian', { ascending: false }).order('created_at', { ascending: false }).limit(5000), 'isian IPA') as Isian[]
  return rows.map(r => ({
    ...r,
    pembilang: r.pembilang == null ? null : Number(r.pembilang),
    penyebut: r.penyebut == null ? null : Number(r.penyebut),
  }))
}

export async function simpanIsian(sb: SupabaseClient, row: {
  tahun: number; skpd_id: number; indikator: string; tidak_ada: boolean
  pembilang: number | null; penyebut: number | null; tanggal_capaian: string
  catatan: string | null; bukti_paths: string[]
}): Promise<void> {
  const { error } = await sb.from('ipa_isian').insert(row)
  if (error) throw new Error(error.message)
}

export async function hapusIsian(sb: SupabaseClient, tabel: TabelIsian, id: string): Promise<void> {
  const { error } = await sb.from(tabel).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Rekonsiliasi ────────────────────────────────────────────────────────────
export type PeriodeRekon = { id: string; tahun: number; nama: string; batas_tanggal: string }
export type PelaksanaanRekon = {
  id: string; periode_id: string; skpd_id: number; tanggal_pelaksanaan: string
  catatan: string | null; bukti_paths: string[]; status: StatusIsian
  catatan_verifikator: string | null; created_at: string
}

export async function muatPeriodeRekon(sb: SupabaseClient, tahun: number): Promise<PeriodeRekon[]> {
  return cek(await sb.from('ipa_rekon_periode').select('id,tahun,nama,batas_tanggal').eq('tahun', tahun).order('batas_tanggal'), 'periode rekonsiliasi') as PeriodeRekon[]
}

export async function muatPelaksanaanRekon(sb: SupabaseClient, periodeIds: string[], opsi: { skpdId?: number; status?: StatusIsian } = {}): Promise<PelaksanaanRekon[]> {
  if (periodeIds.length === 0) return []
  let q = sb.from('ipa_rekon_pelaksanaan')
    .select('id,periode_id,skpd_id,tanggal_pelaksanaan,catatan,bukti_paths,status,catatan_verifikator,created_at')
    .in('periode_id', periodeIds)
  if (opsi.skpdId != null) q = q.eq('skpd_id', opsi.skpdId)
  if (opsi.status) q = q.eq('status', opsi.status)
  return cek(await q.order('created_at').limit(5000), 'pelaksanaan rekonsiliasi') as PelaksanaanRekon[]
}

/** Simpan / perbarui pelaksanaan satu periode (satu baris per periode × SKPD). */
export async function simpanPelaksanaanRekon(sb: SupabaseClient, row: {
  id?: string; periode_id: string; skpd_id: number; tanggal_pelaksanaan: string; catatan: string | null; bukti_paths: string[]
}): Promise<void> {
  const { id, ...isi } = row
  const { error } = id
    ? await sb.from('ipa_rekon_pelaksanaan').update(isi).eq('id', id)
    : await sb.from('ipa_rekon_pelaksanaan').insert(isi)
  if (error) throw new Error(error.message)
}

// ── Pajak kendaraan ─────────────────────────────────────────────────────────
export type KendaraanPajak = {
  aset_id: string; nibar: string | null; kode: string; uraian_barang: string | null
  nama_barang: string | null; merek_tipe: string | null; no_polisi: string | null; skpd_id: number
  pajak_id: string | null; tanggal_bayar: string | null; status: StatusIsian | null
  catatan_verifikator: string | null; bukti_paths: string[] | null
}

export async function muatKendaraan(sb: SupabaseClient, tahun: number, skpdId: number): Promise<KendaraanPajak[]> {
  const { data, error } = await sb.rpc('fn_ipa_kendaraan', { p_tahun: tahun, p_skpd_id: skpdId })
  if (error) throw new Error(`gagal memuat kendaraan: ${error.message}`)
  return (data || []) as KendaraanPajak[]
}

export async function simpanPajak(sb: SupabaseClient, row: {
  pajak_id: string | null; tahun: number; aset_id: string; skpd_id: number; tanggal_bayar: string; bukti_paths: string[]
}): Promise<void> {
  const { pajak_id, ...isi } = row
  const { error } = pajak_id
    ? await sb.from('ipa_pajak_kendaraan').update({ tanggal_bayar: isi.tanggal_bayar, bukti_paths: isi.bukti_paths }).eq('id', pajak_id)
    : await sb.from('ipa_pajak_kendaraan').insert(isi)
  if (error) throw new Error(error.message)
}

export type AntrianPajak = {
  id: string; tahun: number; aset_id: string; skpd_id: number; tanggal_bayar: string
  bukti_paths: string[]; status: StatusIsian; created_at: string
  aset: { nibar: string | null; nama_barang: string | null; no_polisi: string | null; merek_tipe: string | null } | null
}
export async function muatAntrianPajak(sb: SupabaseClient, tahun: number, status: StatusIsian): Promise<AntrianPajak[]> {
  const rows = cek(await sb.from('ipa_pajak_kendaraan')
    .select('id,tahun,aset_id,skpd_id,tanggal_bayar,bukti_paths,status,created_at,aset:aset_id(nibar,nama_barang,no_polisi,merek_tipe)')
    .eq('tahun', tahun).eq('status', status).order('created_at').limit(3000), 'antrean pajak kendaraan') as unknown as (Omit<AntrianPajak, 'aset'> & { aset: AntrianPajak['aset'] | AntrianPajak['aset'][] })[]
  return rows.map(r => ({ ...r, aset: Array.isArray(r.aset) ? r.aset[0] ?? null : r.aset }))
}

// ── Verifikasi (Admin) ──────────────────────────────────────────────────────
export type TabelIsian = 'ipa_isian' | 'ipa_rekon_pelaksanaan' | 'ipa_pajak_kendaraan'

export async function verifikasi(sb: SupabaseClient, tabel: TabelIsian, ids: string[], status: 'diverifikasi' | 'ditolak', catatan: string | null): Promise<void> {
  if (ids.length === 0) return
  const { error } = await sb.from(tabel)
    .update({ status, catatan_verifikator: status === 'ditolak' ? catatan : null })
    .in('id', ids)
  if (error) throw new Error(error.message)
}

// ── Unggah bukti ────────────────────────────────────────────────────────────
export async function unggahBukti(sb: SupabaseClient, prefix: string, files: FileList): Promise<string[]> {
  const paths: string[] = []
  for (const f of Array.from(files)) {
    if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} lebih dari 10 MB`)
    const aman = f.name.replace(/[^\w.\- ]+/g, '_')
    const path = `ipa/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${aman}`
    const { error } = await sb.storage.from(BUCKET_BUKTI).upload(path, f, { upsert: false })
    if (error) throw new Error(`gagal mengunggah ${f.name}: ${error.message}`)
    paths.push(path)
  }
  return paths
}

// ── Rakit hasil seluruh SKPD ────────────────────────────────────────────────
export type NilaiSkpd = Record<string, NilaiIndikator>

/**
 * Susun NilaiIndikator per SKPD dari snapshot otomatis + isian terverifikasi.
 * Indikator `otomatis`/`rekon`/`pajak` dari snapshot; `isian` dari baris
 * terverifikasi terakhir s.d. akhir bulan.
 */
export function susunNilai(args: {
  indikator: Indikator[]
  otomatis: BarisOtomatis[]
  isian: Isian[]
  skpdId: number
  tahun: number
  bulan: number
}): NilaiSkpd {
  const batas = akhirBulan(args.tahun, args.bulan)
  const out: NilaiSkpd = {}
  const isianSkpd = args.isian.filter(i => i.skpd_id === args.skpdId)
  for (const ind of args.indikator) {
    if (ind.sumber === 'isian') {
      out[ind.kode] = nilaiIsianPada(isianSkpd, ind.kode, batas)
    } else {
      const o = args.otomatis.find(x => x.skpd_id === args.skpdId && x.indikator === ind.kode)
      out[ind.kode] = o ? nilaiDariAngka(o.pembilang, o.penyebut) : { status: 'belum' }
    }
  }
  return out
}

export type DataPenilaian = {
  ref: Referensi
  otomatis: BarisOtomatis[]
  isian: Isian[]
  hasil: HasilSkpd[]
}

export async function muatPenilaian(sb: SupabaseClient, tahun: number, bulan: number): Promise<DataPenilaian> {
  const [ref, otomatis, isian] = await Promise.all([
    muatReferensi(sb), muatOtomatis(sb, tahun, bulan), muatIsian(sb, tahun),
  ])
  const hasil = beriPeringkat(ref.skpd.map(s => hitungSkpd({
    skpdId: s.skpd_id,
    klaster: s.klaster,
    indikator: ref.indikator,
    bobotAspek: ref.bobotAspek,
    parameter: ref.parameter,
    nilai: susunNilai({ indikator: ref.indikator, otomatis, isian, skpdId: s.skpd_id, tahun, bulan }),
  })))
  return { ref, otomatis, isian, hasil }
}

/** SKPD penilaian yang boleh diisi pengguna ini (admin: semua). */
export async function skpdBolehIsi(sb: SupabaseClient, semua: SkpdIpa[], role: string | null): Promise<SkpdIpa[]> {
  if (role === 'admin') return semua
  if (role === 'pengawas' || role == null) return []
  const { data, error } = await sb.rpc('fn_my_skpd_scope')
  if (error) throw new Error(`gagal membaca cakupan SKPD: ${error.message}`)
  const scope = new Set(((data as number[] | null) ?? []).map(Number))
  return semua.filter(s => scope.has(s.skpd_id))
}
