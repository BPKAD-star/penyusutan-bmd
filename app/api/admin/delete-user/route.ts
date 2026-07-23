import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { id } = await req.json()

  // Hanya admin yang boleh menghapus user (guard sama dgn create-user —
  // sebelumnya route ini TIDAK dicek sama sekali, ditemukan audit 2026-07-13).
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await session.from('admin_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Hanya admin' }, { status: 403 })
  if (user.id === id) return NextResponse.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 })

  const supabase = createAdminClient()

  // Guard jejak: akun yg pernah membuat transaksi/jurnal TIDAK boleh dihapus —
  // ledger append-only & FK created_by (NO ACTION) ke auth.users memblok, lagipula
  // jejak wajib dijaga. Cek dua tabel inti; kalau ada → tolak dgn pesan jelas.
  const [{ count: cTrx }, { count: cJur }] = await Promise.all([
    supabase.from('transaksi_bmd').select('id', { count: 'exact', head: true }).eq('created_by', id),
    supabase.from('jurnal_header').select('id', { count: 'exact', head: true }).eq('created_by', id),
  ])
  if ((cTrx || 0) > 0 || (cJur || 0) > 0) {
    return NextResponse.json({ error: 'User ini pernah membuat transaksi/jurnal, jadi akunnya tidak bisa dihapus demi menjaga jejak ledger. Turunkan aksesnya (mis. jadikan Pengawas) bila memang perlu.' }, { status: 400 })
  }

  // Hapus akun auth DULU. Profil & chat ikut terhapus via ON DELETE CASCADE.
  // Kalau gagal (mis. FK dari data lain), profil TIDAK disentuh → tak nyangkut setengah.
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: `Akun tidak bisa dihapus: ${error.message}. Kemungkinan user ini pernah membuat data lain yang harus dijaga.` }, { status: 400 })
  }
  // Bersih-bersih profil bila cascade tak jalan (idempoten, aman).
  await supabase.from('admin_profiles').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
