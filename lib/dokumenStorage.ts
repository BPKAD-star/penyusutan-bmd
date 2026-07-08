// Helper reusable utk bucket storage 'dokumen-sumber', dipakai halaman Dokumen
// Sumber (app/dashboard/dokumen-sumber). Pola upload/signed-url identik dengan
// yang sudah berulang di Pengadaan.tsx/Penghapusan.tsx/PenggunaanMasuk.tsx —
// generalisasi baru dibuat di sini, komponen lama tidak direfactor (di luar scope).
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'dokumen-sumber'

export const namaFileDariPath = (path: string) => path.split('/').pop() || path

export async function uploadDokumenSiklus(file: File, tahun: number, siklus: string) {
  const supabase = createClient()
  const path = `siklus/${tahun}/${siklus}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  return { path, error }
}

export async function hapusFileDokumen(path: string) {
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([path])
}

export async function bukaDokumenSumber(path: string) {
  const supabase = createClient()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}
