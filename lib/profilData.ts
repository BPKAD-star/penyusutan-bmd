// Profil Pengguna — pembacaan & penulisan (migrasi 20261001_02, 20261002_03).
// Semua fungsi MELEMPAR kalau gagal; pemanggilnya yang menampilkan pesannya.
// Seluruh tulis lewat RPC SECURITY DEFINER — pengguna tak punya GRANT tulis ke
// admin_pegawai maupun admin_pegawai_pengajuan (lihat komentar migrasinya).
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertOk, assertOkOpsional } from '@/shared/db/query'
import type { DataPegawai } from '@/lib/profil'

export const BUCKET_FOTO_PROFIL = 'foto-profil'
/** Signed URL foto profil: layout dibuat ulang tiap navigasi, jadi 12 jam lebih dari cukup. */
const MASA_URL_FOTO_DETIK = 12 * 3600

export type Pegawai = DataPegawai & {
  id: string
  nip: string | null
  jenis_kelamin: string | null
  no_hp: string | null
  foto_path: string | null
}

export type Pengajuan = {
  id: string
  pegawai_id: string
  status: 'menunggu' | 'disetujui' | 'ditolak'
  nama: string
  golongan: string | null
  pangkat: string | null
  jabatan: string | null
  nama_lama: string | null
  golongan_lama: string | null
  pangkat_lama: string | null
  jabatan_lama: string | null
  catatan_admin: string | null
  created_at: string
}

export type Akun = {
  userId: string
  email: string
  role: string
  skpdNama: string | null
  pegawai: Pegawai | null
  /** Pengajuan TERAKHIR pegawai ini (menunggu / ditolak / disetujui), kalau ada. */
  pengajuan: Pengajuan | null
  fotoUrl: string | null
}

const COLS_PENGAJUAN =
  'id,pegawai_id,status,nama,golongan,pangkat,jabatan,nama_lama,golongan_lama,pangkat_lama,jabatan_lama,catatan_admin,created_at'

export async function urlFotoProfil(sb: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await sb.storage.from(BUCKET_FOTO_PROFIL).createSignedUrl(path, MASA_URL_FOTO_DETIK)
  // Foto itu hiasan: gagal menandatangani cukup jatuh ke avatar bawaan, tak menjatuhkan halaman.
  if (error || !data) return null
  return data.signedUrl
}

export async function muatAkun(sb: SupabaseClient): Promise<Akun> {
  const { data: { user }, error: eu } = await sb.auth.getUser()
  if (eu || !user) throw new Error(eu?.message || 'belum login')

  const prof = assertOkOpsional(
    await sb.from('admin_profiles').select('role, pegawai_id, skpd:admin_skpd(nama)').eq('id', user.id).maybeSingle(),
    'profil akun',
  ) as unknown as { role: string; pegawai_id: string | null; skpd: { nama: string } | null } | null

  let pegawai: Pegawai | null = null
  let pengajuan: Pengajuan | null = null
  if (prof?.pegawai_id) {
    pegawai = assertOk(
      await sb.from('admin_pegawai')
        .select('id,nama,nip,pangkat,golongan,jabatan,jenis_kelamin,no_hp,foto_path')
        .eq('id', prof.pegawai_id).maybeSingle(),
      'data pegawai',
    ) as unknown as Pegawai
    pengajuan = assertOkOpsional(
      await sb.from('admin_pegawai_pengajuan').select(COLS_PENGAJUAN)
        .eq('pegawai_id', prof.pegawai_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      'pengajuan perubahan data',
    ) as unknown as Pengajuan | null
  }
  return {
    userId: user.id, email: user.email || '', role: prof?.role || '',
    skpdNama: prof?.skpd?.nama || null, pegawai, pengajuan,
    fotoUrl: await urlFotoProfil(sb, pegawai?.foto_path ?? null),
  }
}

export async function simpanNoHp(sb: SupabaseClient, noHp: string | null): Promise<string | null> {
  const { data, error } = await sb.rpc('fn_profil_simpan_hp', { p_no_hp: noHp })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

/** Unggah foto yang SUDAH disusutkan, tautkan ke pegawai, lalu buang foto lama. */
export async function simpanFotoProfil(
  sb: SupabaseClient, userId: string, foto: Blob, fotoLama: string | null,
): Promise<string> {
  const path = `${userId}/${Date.now()}.jpg`
  const { error: eu } = await sb.storage.from(BUCKET_FOTO_PROFIL).upload(path, foto, { contentType: 'image/jpeg' })
  if (eu) throw new Error(`gagal mengunggah foto: ${eu.message}`)
  const { error } = await sb.rpc('fn_profil_simpan_foto', { p_path: path })
  if (error) {
    // Jangan meninggalkan berkas yatim kalau penautannya ditolak.
    await sb.storage.from(BUCKET_FOTO_PROFIL).remove([path]).catch(() => undefined)
    throw new Error(error.message)
  }
  // Pembersihan foto lama cuma merapikan — gagal tak membatalkan foto baru.
  if (fotoLama) await sb.storage.from(BUCKET_FOTO_PROFIL).remove([fotoLama]).catch(() => undefined)
  return path
}

export async function hapusFotoProfil(sb: SupabaseClient, fotoLama: string): Promise<void> {
  const { error } = await sb.rpc('fn_profil_simpan_foto', { p_path: null })
  if (error) throw new Error(error.message)
  await sb.storage.from(BUCKET_FOTO_PROFIL).remove([fotoLama]).catch(() => undefined)
}

export async function ajukanUbahProfil(sb: SupabaseClient, u: DataPegawai): Promise<void> {
  const { error } = await sb.rpc('fn_profil_ajukan_ubah', {
    p_nama: u.nama, p_golongan: u.golongan, p_pangkat: u.pangkat, p_jabatan: u.jabatan,
  })
  if (error) throw new Error(error.message)
}

export async function tarikAjuanProfil(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.rpc('fn_profil_tarik_ajuan')
  if (error) throw new Error(error.message)
}

// ── Sisi admin ──────────────────────────────────────────────────────────────
export type PengajuanAdmin = Pengajuan & {
  pegawai: { nama: string; nip: string | null; skpd: { nama: string } | null } | null
}

export async function muatPengajuanMenunggu(sb: SupabaseClient): Promise<PengajuanAdmin[]> {
  const rows = assertOk(
    await sb.from('admin_pegawai_pengajuan')
      .select(`${COLS_PENGAJUAN},pegawai:admin_pegawai(nama,nip,skpd:admin_skpd(nama))`)
      .eq('status', 'menunggu').order('created_at').limit(500),
    'pengajuan perubahan data pegawai',
  )
  return rows as unknown as PengajuanAdmin[]
}

export async function putuskanPengajuan(
  sb: SupabaseClient, id: string, setuju: boolean, catatan: string,
): Promise<void> {
  const { error } = await sb.rpc('fn_profil_putuskan_ubah', {
    p_id: id, p_setuju: setuju, p_catatan: catatan || null,
  })
  if (error) throw new Error(error.message)
}
