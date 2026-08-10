// Standar Harga RKBMD — SSH · HSPK · ASB · SBU.
// Tabel `rkbmd_standar` + `rkbmd_standar_rekening` (migrasi 20260810_01).
//
// BAK BERSAMA lintas SKPD (keputusan user 2026-08-10): satu barang cukup
// diinput SEKALI se-kabupaten. Kalau SKPD lain memasukkan barang yang identitas­
// nya sama (kode + nama + satuan + harga), sistem tidak membuat baris kedua;
// kalau yang berbeda cuma kode rekeningnya, rekening itu DIGABUNG ke barang
// yang sama. Penegaknya UNIQUE index `uq_rkbmd_standar_identitas` + RPC
// `fn_rkbmd_standar_simpan` — bukan pengecekan di UI, supaya dua operator yang
// menyimpan bersamaan tetap tak bisa melahirkan baris kembar.
//
// SBSK TIDAK di sini: bentuknya beda (kuantitas standar per satuan pengukur,
// bukan harga) dan tabelnya sendiri (`rkbmd_sbsk`). Yang disatukan cuma menunya.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandarJenis = 'ssh' | 'hspk' | 'asb' | 'sbu'

export type StandarConfig = {
  jenis: StandarJenis
  judul: string
  deskripsi: string
  /** ssh/hspk bersandar ke kode barang BMD; asb/sbu tidak (bukan barang). */
  pakaiKodeBarang: boolean
  /** TKDN hanya bermakna untuk barang — honorarium & perjalanan dinas tidak punya. */
  pakaiTkdn: boolean
  /** Label kolom nama — beda kata untuk barang vs komponen belanja. */
  labelNama: string
  labelHarga: string
}

export const STANDAR_CONFIG: Record<StandarJenis, StandarConfig> = {
  ssh: {
    jenis: 'ssh',
    judul: 'Standar Satuan Harga (SSH)',
    deskripsi:
      'Acuan harga satuan barang per tahun anggaran (Permendagri 19/2016 Pasal 20). ' +
      'Satu bak bersama untuk seluruh SKPD — barang yang sudah diinput SKPD lain tidak perlu diinput ulang. ' +
      'Dipakai sebagai dasar penyusunan RKBMD Pengadaan.',
    pakaiKodeBarang: true,
    pakaiTkdn: true,
    labelNama: 'Spesifikasi Nama Barang',
    labelHarga: 'Harga Satuan',
  },
  hspk: {
    jenis: 'hspk',
    judul: 'Harga Satuan Pokok Kegiatan (HSPK)',
    deskripsi:
      'Harga satuan pekerjaan/bahan hasil analisis, dipakai menyusun rencana biaya kegiatan fisik. ' +
      'Bersandar ke kode barang BMD seperti SSH, dan sama-sama satu bak bersama lintas SKPD.',
    pakaiKodeBarang: true,
    pakaiTkdn: true,
    labelNama: 'Spesifikasi Nama Barang / Pekerjaan',
    labelHarga: 'Harga Satuan',
  },
  asb: {
    jenis: 'asb',
    judul: 'Analisis Standar Belanja (ASB)',
    deskripsi:
      'Penilaian kewajaran beban kerja & biaya suatu kegiatan. Komponennya BUKAN barang, ' +
      'jadi tidak memakai kode barang BMD — cukup uraian komponen belanja, satuan, dan besarannya.',
    pakaiKodeBarang: false,
    pakaiTkdn: false,
    labelNama: 'Uraian Komponen Belanja',
    labelHarga: 'Besaran / Pagu Satuan',
  },
  sbu: {
    jenis: 'sbu',
    judul: 'Standar Biaya Umum (SBU)',
    deskripsi:
      'Batas tertinggi biaya umum: honorarium, perjalanan dinas, rapat, dan sejenisnya. ' +
      'Bukan barang, jadi tanpa kode barang BMD dan tanpa TKDN.',
    pakaiKodeBarang: false,
    pakaiTkdn: false,
    labelNama: 'Uraian Komponen Biaya',
    labelHarga: 'Besaran Tertinggi',
  },
}

export type StandarRow = {
  id: number
  jenis: StandarJenis
  tahun: number
  kode: string | null
  nama: string
  satuan: string | null
  harga: number
  tkdn: number | null
  keterangan: string | null
  skpd_id: number | null
  /** Dirakit dari `rkbmd_standar_rekening` — bisa lebih dari satu (hasil gabungan antar-SKPD). */
  rekening: string[]
  /** Nama SKPD pembuat, untuk kolom "Diinput oleh". */
  skpd_nama: string | null
}

const COLS = 'id,jenis,tahun,kode,nama,satuan,harga,tkdn,keterangan,skpd_id,admin_skpd(nama)'

/** Jumlah slot rekening di FORM (permintaan user). Tabelnya sendiri tak dibatasi
 *  — batas keras akan mematahkan penggabungan begitu SKPD ke-6 datang. */
export const SLOT_REKENING = 5

/** Hasil RPC simpan — dipakai UI untuk berkata jujur apa yang sebenarnya terjadi. */
export type HasilSimpan = {
  id: number
  status: 'baru' | 'sudah_ada'
  rekening_baru: number
  pemilik_skpd_id: number | null
  pemilik_skpd: string
}

/** Baris standar + rekeningnya untuk satu jenis & tahun.
 *  MELEMPAR kalau query gagal — halaman ini jadi dasar angka anggaran, jadi
 *  "kosong" tak boleh diam-diam berarti "query error" (rules.md fail-closed). */
export async function fetchStandar(
  supabase: SupabaseClient,
  jenis: StandarJenis,
  tahun: number,
): Promise<StandarRow[]> {
  const { data, error } = await supabase
    .from('rkbmd_standar')
    .select(COLS)
    .eq('jenis', jenis)
    .eq('tahun', tahun)
    .order('kode', { nullsFirst: false })
    .order('nama')
  if (error) throw new Error(`gagal membaca standar harga: ${error.message}`)

  const rows = ((data || []) as unknown as (Omit<StandarRow, 'rekening' | 'skpd_nama'> & {
    admin_skpd: { nama: string } | null
  })[]).map(r => ({ ...r, rekening: [] as string[], skpd_nama: r.admin_skpd?.nama ?? null }))

  if (rows.length === 0) return rows
  const byId = new Map(rows.map(r => [r.id, r]))
  const { data: rek, error: rekErr } = await supabase
    .from('rkbmd_standar_rekening')
    .select('standar_id,kode_rekening')
    .in('standar_id', rows.map(r => r.id))
    .order('kode_rekening')
  if (rekErr) throw new Error(`gagal membaca kode rekening standar: ${rekErr.message}`)
  for (const r of (rek || []) as { standar_id: number; kode_rekening: string }[]) {
    byId.get(r.standar_id)?.rekening.push(r.kode_rekening)
  }
  return rows
}

/** Simpan baris BARU lewat RPC (dedup + gabung rekening dikerjakan di DB). */
export async function simpanStandar(
  supabase: SupabaseClient,
  v: {
    jenis: StandarJenis; tahun: number; kode: string | null; nama: string
    satuan: string | null; harga: number; tkdn: number | null; keterangan: string | null
    rekening: string[]
  },
): Promise<HasilSimpan> {
  const { data, error } = await supabase.rpc('fn_rkbmd_standar_simpan', {
    p_jenis: v.jenis, p_tahun: v.tahun, p_kode: v.kode, p_nama: v.nama,
    p_satuan: v.satuan, p_harga: v.harga, p_tkdn: v.tkdn, p_keterangan: v.keterangan,
    p_rekening: v.rekening,
  })
  if (error) throw new Error(error.message)
  return data as HasilSimpan
}

/** Ubah baris yang sudah ada + samakan daftar rekeningnya.
 *  Bukan lewat RPC: RPC itu untuk MENAMBAH (dedup), sedangkan di sini barisnya
 *  sudah pasti mana. Tabrakan identitas (mis. harga diubah jadi sama persis
 *  dengan baris lain) ditangkap UNIQUE index & diterjemahkan jadi pesan ramah. */
export async function ubahStandar(
  supabase: SupabaseClient,
  id: number,
  v: {
    nama: string; satuan: string | null; harga: number; tkdn: number | null
    keterangan: string | null; kode: string | null; rekening: string[]
  },
  rekeningLama: string[],
): Promise<void> {
  const { error } = await supabase.from('rkbmd_standar').update({
    kode: v.kode, nama: v.nama.trim(), satuan: v.satuan, harga: v.harga,
    tkdn: v.tkdn, keterangan: v.keterangan,
  }).eq('id', id)
  if (error) {
    if (error.code === '23505') {
      throw new Error('Sudah ada baris lain dengan kode, nama, satuan, dan harga yang sama persis di tahun ini.')
    }
    throw new Error(error.message)
  }

  const baru = new Set(v.rekening.filter(Boolean))
  const lama = new Set(rekeningLama)
  const tambah = [...baru].filter(k => !lama.has(k))
  const buang = [...lama].filter(k => !baru.has(k))

  if (tambah.length > 0) {
    const { error: e } = await supabase.from('rkbmd_standar_rekening')
      .insert(tambah.map(k => ({ standar_id: id, kode_rekening: k })))
    if (e) throw new Error(`gagal menambah kode rekening: ${e.message}`)
  }
  if (buang.length > 0) {
    const { error: e } = await supabase.from('rkbmd_standar_rekening')
      .delete().eq('standar_id', id).in('kode_rekening', buang)
    if (e) throw new Error(`gagal mencabut kode rekening: ${e.message}`)
  }
}

export async function hapusStandar(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase.from('rkbmd_standar').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
