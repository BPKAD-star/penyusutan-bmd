// Usulan Standar Harga — staging sebelum masuk BAK BERSAMA.
// Tabel `rkbmd_standar_usulan` (+ `_item`, `_rekening`), migrasi 20260813_03.
//
// ⚠️ KENAPA STAGING, BUKAN KOLOM `status` DI `rkbmd_standar` (keputusan user
// 2026-08-13): `rkbmd_standar` itu bak bersama ber-UNIQUE identitas. Kalau
// status ditempel di barisnya, usulan SKPD A yang masih *pending* akan
// MEMBLOKIR SKPD B mengusulkan barang yang sama — terblokir oleh baris yang B
// tak berhak melihatnya, dan tetap terblokir walau usulan A akhirnya ditolak.
// Dengan staging, dedup & penggabungan rekening baru jalan SAAT DISETUJUI.
//
// Untung besarnya: **picker RKBMD tak perlu diubah sama sekali** — isi
// `rkbmd_standar` dengan sendirinya berarti "sudah tervalidasi". Jangan
// menambahkan filter status di `fetchStandar`; kalau suatu saat terasa perlu,
// berarti ada yang menulis ke bak bersama tanpa lewat persetujuan.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StandarJenis } from '@/lib/rkbmdStandar'

/** Kelima jenis yang bisa diusulkan. SBSK (Standar Kebutuhan) IKUT satu pintu
 *  (keputusan user 2026-08-13) walau bentuknya beda — ia memakai kuantitas
 *  standar per satuan pengukur, bukan harga. */
export type UsulanJenis = StandarJenis | 'sbsk'
export type UsulanStatus = 'draft' | 'diajukan' | 'disetujui' | 'ditolak'

export const USULAN_JENIS: { key: UsulanJenis; label: string; deskripsi: string }[] = [
  { key: 'ssh',  label: 'SSH',  deskripsi: 'Standar Satuan Harga — harga satuan barang. Dasar RKBMD Pengadaan.' },
  { key: 'hspk', label: 'HSPK', deskripsi: 'Harga Satuan Pokok Kegiatan — harga pekerjaan/bahan hasil analisis.' },
  { key: 'asb',  label: 'ASB',  deskripsi: 'Analisis Standar Belanja — komponen belanja kegiatan, bukan barang.' },
  { key: 'sbu',  label: 'SBU',  deskripsi: 'Standar Biaya Umum — honorarium, perjalanan dinas, rapat.' },
  { key: 'sbsk', label: 'Standar Kebutuhan', deskripsi: 'SBSK — kuantitas standar per satuan pengukur (mis. per pegawai).' },
]

export const USULAN_STATUS_META: Record<UsulanStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
  diajukan:  { label: 'Diajukan',  cls: 'bg-amber-100 text-amber-700' },
  disetujui: { label: 'Disetujui', cls: 'bg-teal/10 text-teal' },
  ditolak:   { label: 'Ditolak',   cls: 'bg-red-100 text-red-700' },
}

/** Bentuk yang sah per jenis. KEMBAR dengan `fn_standar_usulan_item_guard`
 *  (migrasi 20260813_03) — penegak sesungguhnya trigger itu; yang di sini cuma
 *  supaya operator dapat pesan sebelum menekan Simpan. Ubah satu, ubah dua-duanya. */
export const pakaiKodeBarang = (j: UsulanJenis) => j === 'ssh' || j === 'hspk' || j === 'sbsk'
export const pakaiHarga      = (j: UsulanJenis) => j !== 'sbsk'
export const pakaiTkdn       = (j: UsulanJenis) => j === 'ssh' || j === 'hspk'
export const pakaiRekening   = (j: UsulanJenis) => j !== 'sbsk'

export type UsulanHeader = {
  id: string
  skpd_id: number
  tahun: number
  jenis: UsulanJenis
  status: UsulanStatus
  keterangan: string | null
  catatan_telaah: string | null
  diajukan_at: string | null
  approved_at: string | null
  created_at: string
}

export type UsulanItem = {
  id: number
  usulan_id: string
  no_urut: number | null
  kode: string | null
  nama: string
  /** Merk/Tipe (permintaan user 2026-08-13) — tepat di bawah Spesifikasi Nama
   *  Barang, karena itulah urutan orang membacanya: barang apa, lalu merk apa. */
  merk_tipe: string | null
  satuan: string | null
  harga: number | null
  tkdn: number | null
  kuantitas_standar: number | null
  satuan_pengukur: string | null
  keterangan: string | null
  /** Dirakit dari `rkbmd_standar_usulan_rekening`; kosong utk SBSK. */
  rekening: string[]
}

const HEADER_COLS =
  'id,skpd_id,tahun,jenis,status,keterangan,catatan_telaah,diajukan_at,approved_at,created_at'
const ITEM_COLS =
  'id,usulan_id,no_urut,kode,nama,merk_tipe,satuan,harga,tkdn,kuantitas_standar,satuan_pengukur,keterangan'

/** Semua kolektor di berkas ini MELEMPAR saat query gagal (rules.md fail-closed):
 *  daftar kosong yang sebenarnya "query error" akan terbaca operator sebagai
 *  "belum ada usulan", lalu ia menyusun ulang dari nol. */
function lempar(pesan: string, e: { message: string }): never {
  throw new Error(`${pesan}: ${e.message}`)
}

/** Usulan satu SKPD untuk satu tahun (semua jenis) — dipakai layar Usulan. */
export async function fetchUsulanSkpd(
  supabase: SupabaseClient, skpdId: number, tahun: number,
): Promise<UsulanHeader[]> {
  const { data, error } = await supabase.from('rkbmd_standar_usulan')
    .select(HEADER_COLS).eq('skpd_id', skpdId).eq('tahun', tahun)
    .order('created_at', { ascending: false })
  if (error) lempar('gagal membaca usulan standar harga', error)
  return (data || []) as unknown as UsulanHeader[]
}

/** Antrean telaah / daftar yang sudah ditetapkan — dipakai layar Validasi. */
export async function fetchUsulanAntrean(
  supabase: SupabaseClient, tahun: number, status: UsulanStatus[],
): Promise<(UsulanHeader & { skpd_nama: string | null; jumlah_item: number })[]> {
  const { data, error } = await supabase.from('rkbmd_standar_usulan')
    .select(`${HEADER_COLS},admin_skpd(nama)`).eq('tahun', tahun).in('status', status)
    .order('diajukan_at', { ascending: true })
  if (error) lempar('gagal membaca antrean usulan standar harga', error)

  const rows = ((data || []) as unknown as (UsulanHeader & { admin_skpd: { nama: string } | null })[])
    .map(h => ({ ...h, skpd_nama: h.admin_skpd?.nama ?? null, jumlah_item: 0 }))
  if (rows.length === 0) return rows

  // Jumlah baris per usulan — satu query untuk semuanya, bukan N query.
  const { data: its, error: e2 } = await supabase.from('rkbmd_standar_usulan_item')
    .select('usulan_id').in('usulan_id', rows.map(r => r.id))
  if (e2) lempar('gagal menghitung baris usulan', e2)
  const byId = new Map(rows.map(r => [r.id, r]))
  for (const it of (its || []) as { usulan_id: string }[]) {
    const h = byId.get(it.usulan_id)
    if (h) h.jumlah_item += 1
  }
  return rows
}

export async function fetchUsulanItems(
  supabase: SupabaseClient, usulanId: string,
): Promise<UsulanItem[]> {
  const { data, error } = await supabase.from('rkbmd_standar_usulan_item')
    .select(ITEM_COLS).eq('usulan_id', usulanId).order('no_urut').order('id')
  if (error) lempar('gagal membaca baris usulan', error)

  const items = ((data || []) as unknown as Omit<UsulanItem, 'rekening'>[])
    .map(r => ({ ...r, rekening: [] as string[] }))
  if (items.length === 0) return items

  const { data: rek, error: e2 } = await supabase.from('rkbmd_standar_usulan_rekening')
    .select('item_id,kode_rekening').in('item_id', items.map(r => r.id)).order('kode_rekening')
  if (e2) lempar('gagal membaca kode rekening usulan', e2)
  const byId = new Map(items.map(r => [r.id, r]))
  for (const r of (rek || []) as { item_id: number; kode_rekening: string }[]) {
    byId.get(r.item_id)?.rekening.push(r.kode_rekening)
  }
  return items
}

/** Buat dokumen usulan baru. Partial unique `uq_standar_usulan_berjalan`
 *  membatasi SATU usulan berjalan per SKPD/tahun/jenis — pesan 23505
 *  diterjemahkan supaya operator tahu harus meneruskan yang sudah ada. */
export async function buatUsulan(
  supabase: SupabaseClient, skpdId: number, tahun: number, jenis: UsulanJenis,
): Promise<UsulanHeader> {
  const { data, error } = await supabase.from('rkbmd_standar_usulan')
    .insert({ skpd_id: skpdId, tahun, jenis, status: 'draft' }).select(HEADER_COLS).single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('SKPD ini sudah punya usulan berjalan untuk jenis & tahun tersebut — '
        + 'teruskan usulan itu, atau tunggu sampai ditelaah Pengelola.')
    }
    lempar('gagal membuat usulan', error)
  }
  return data as unknown as UsulanHeader
}

/** Simpan satu baris usulan + daftar rekeningnya. `id` kosong = baris baru.
 *  Rekening disamakan (tambah yang baru, cabut yang hilang) — bukan
 *  hapus-lalu-tulis-ulang, supaya kegagalan di tengah tak mengosongkan semua. */
export async function simpanItem(
  supabase: SupabaseClient,
  usulanId: string,
  v: Omit<UsulanItem, 'id' | 'usulan_id'> & { id?: number },
): Promise<void> {
  const isi = {
    usulan_id: usulanId,
    no_urut: v.no_urut, kode: v.kode || null, nama: v.nama.trim(),
    merk_tipe: v.merk_tipe || null,
    satuan: v.satuan || null, harga: v.harga, tkdn: v.tkdn,
    kuantitas_standar: v.kuantitas_standar, satuan_pengukur: v.satuan_pengukur || null,
    keterangan: v.keterangan || null,
  }

  let itemId = v.id
  if (itemId) {
    const { error } = await supabase.from('rkbmd_standar_usulan_item').update(isi).eq('id', itemId)
    if (error) lempar('gagal menyimpan baris', error)
  } else {
    // `.select()` WAJIB: butuh id-nya untuk rekening, DAN insert yang ditolak
    // RLS tidak melempar — cuma mengembalikan 0 baris.
    const { data, error } = await supabase.from('rkbmd_standar_usulan_item')
      .insert(isi).select('id')
    if (error) lempar('gagal menyimpan baris', error)
    if (!data || data.length === 0) throw new Error('Baris ditolak database — usulan ini di luar wewenang SKPD-mu.')
    itemId = (data[0] as { id: number }).id
  }

  const baru = new Set((v.rekening || []).filter(Boolean))
  const { data: lamaRows, error: e1 } = await supabase.from('rkbmd_standar_usulan_rekening')
    .select('kode_rekening').eq('item_id', itemId)
  if (e1) lempar('gagal membaca kode rekening baris', e1)
  const lama = new Set(((lamaRows || []) as { kode_rekening: string }[]).map(r => r.kode_rekening))

  const tambah = [...baru].filter(k => !lama.has(k))
  const buang = [...lama].filter(k => !baru.has(k))
  if (tambah.length > 0) {
    const { error } = await supabase.from('rkbmd_standar_usulan_rekening')
      .insert(tambah.map(k => ({ item_id: itemId!, kode_rekening: k })))
    if (error) lempar('gagal menambah kode rekening', error)
  }
  if (buang.length > 0) {
    const { error } = await supabase.from('rkbmd_standar_usulan_rekening')
      .delete().eq('item_id', itemId).in('kode_rekening', buang)
    if (error) lempar('gagal mencabut kode rekening', error)
  }
}

export async function hapusItem(supabase: SupabaseClient, itemId: number): Promise<void> {
  const { error } = await supabase.from('rkbmd_standar_usulan_item').delete().eq('id', itemId)
  if (error) lempar('gagal menghapus baris', error)
}

export async function hapusUsulan(supabase: SupabaseClient, usulanId: string): Promise<void> {
  const { error } = await supabase.from('rkbmd_standar_usulan').delete().eq('id', usulanId)
  if (error) lempar('gagal menghapus usulan', error)
}

/** Ubah status. Penegak sesungguhnya `fn_standar_usulan_status_guard` —
 *  admin-only untuk disetujui/ditolak, dan menolak pengajuan usulan kosong. */
export async function setStatusUsulan(
  supabase: SupabaseClient, usulanId: string, status: UsulanStatus, catatan?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (catatan !== undefined) patch.catatan_telaah = catatan
  const { data, error } = await supabase.from('rkbmd_standar_usulan')
    .update(patch).eq('id', usulanId).select('id')
  if (error) lempar('gagal mengubah status usulan', error)
  if (!data || data.length === 0) {
    throw new Error('Perubahan ditolak database — usulan ini di luar wewenangmu.')
  }
}

export type HasilSetujui = {
  jenis: UsulanJenis
  /** Barang yang benar-benar baru di bak bersama. */
  baru: number
  /** Sudah ada — rekeningnya digabung, barangnya tidak diduplikasi. */
  sudah_ada: number
  rekening_baru: number
  /** Baris SBSK yang di-upsert (khusus jenis 'sbsk'). */
  sbsk: number
}

/** Setujui: seluruh baris usulan MASUK bak bersama, atomik.
 *  Lewat RPC SECURITY DEFINER karena ia menulis atas nama SKPD PENGUSUL —
 *  RLS `rkbmd_standar` tak mengizinkan admin melakukannya lewat jalur biasa. */
export async function setujuiUsulan(
  supabase: SupabaseClient, usulanId: string,
): Promise<HasilSetujui> {
  const { data, error } = await supabase.rpc('fn_standar_usulan_setujui', { p_id: usulanId })
  if (error) lempar('gagal menetapkan usulan', error)
  return data as HasilSetujui
}

export type HasilBukaKunci = {
  jenis: UsulanJenis
  /** Baris yang benar-benar dicabut dari acuan bersama (belum dipakai siapa pun). */
  ditarik: number
  /** Dibiarkan karena sudah dipakai RKBMD atau juga lahir dari usulan SKPD lain. */
  tetap: number
  sbsk: number
}

/** Buka kunci: usulan kembali ke draft, DAN barisnya ditarik dari acuan bersama
 *  — tapi hanya yang belum dipakai siapa pun. Lewat RPC karena penarikannya
 *  menyentuh baris milik SKPD pengusul, di luar wewenang admin lewat jalur RLS
 *  biasa, dan karena keputusannya butuh memeriksa `rkbmd_item` + usulan lain. */
export async function bukaKunciUsulan(
  supabase: SupabaseClient, usulanId: string,
): Promise<HasilBukaKunci> {
  const { data, error } = await supabase.rpc('fn_standar_usulan_buka_kunci', { p_id: usulanId })
  if (error) lempar('gagal membuka kunci usulan', error)
  return data as HasilBukaKunci
}

/** Apa yang SEBENARNYA terjadi saat buka kunci — angka "tetap" itu yang paling
 *  perlu dibaca penelaah: itulah baris yang sengaja tidak dicabut karena sudah
 *  dipakai orang lain, dan ia takkan hilang hanya karena usulannya dibuka. */
export function ringkasBukaKunci(h: HasilBukaKunci): string {
  if (h.jenis === 'sbsk') {
    return `Usulan kembali ke draft. ${h.sbsk} baris Standar Kebutuhan TIDAK ditarik — `
      + 'persetujuan menimpa angka standar yang mungkin sudah ada sebelumnya, dan nilai lamanya '
      + 'tidak tersimpan di mana pun. Periksa & betulkan sendiri bila perlu.'
  }
  const bagian = [`Usulan kembali ke draft. ${h.ditarik} baris ditarik dari acuan bersama`]
  if (h.tetap > 0) {
    bagian.push(`${h.tetap} dibiarkan karena sudah dipakai RKBMD atau juga diusulkan SKPD lain`)
  }
  return `${bagian.join(' · ')}.`
}

/** Kalimat hasil persetujuan yang jujur — "3 baru, 2 sudah ada (1 rekening
 *  digabung)" jauh lebih berguna daripada "berhasil", karena penggabungan itu
 *  justru inti bak bersama & operator perlu tahu barangnya tidak dobel. */
export function ringkasHasil(h: HasilSetujui): string {
  if (h.jenis === 'sbsk') return `${h.sbsk} baris Standar Kebutuhan ditetapkan.`
  const bagian = [`${h.baru} barang baru masuk standar harga`]
  if (h.sudah_ada > 0) bagian.push(`${h.sudah_ada} sudah ada sebelumnya (tidak diduplikasi)`)
  if (h.rekening_baru > 0) bagian.push(`${h.rekening_baru} kode rekening digabungkan`)
  return `${bagian.join(' · ')}.`
}
