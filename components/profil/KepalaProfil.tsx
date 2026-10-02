'use client'
// Kepala halaman Profil: foto (diganti pemilik akun SENDIRI — tak perlu persetujuan,
// beda dari nama/pangkat/jabatan), nama, peran & SKPD, username.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AvatarPegawai, { jkPegawai } from '@/components/AvatarPegawai'
import { ROLE_LABEL } from '@/lib/roles'
import { hapusFotoProfil, simpanFotoProfil, type Akun } from '@/lib/profilData'
import { susutkanFotoProfil } from '@/lib/profilFoto'
import PesanProfil, { galat } from './PesanProfil'

export default function KepalaProfil({ akun, username, onUbah }: {
  akun: Akun
  username: string
  /** Dipanggil sesudah foto berubah — halaman memuat ulang akun. */
  onUbah: () => Promise<void>
}) {
  const supabase = createClient()
  const router = useRouter()
  const berkas = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pesan, setPesan] = useState('')
  const pg = akun.pegawai

  async function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // supaya memilih berkas yang SAMA lagi tetap memicu onChange
    if (!f || !pg) return
    setPesan(''); setBusy(true)
    try {
      const blob = await susutkanFotoProfil(f)
      await simpanFotoProfil(supabase, akun.userId, blob, pg.foto_path)
      await onUbah()
      router.refresh() // TopBar dirender server — ambil URL foto yang baru
      setPesan('Foto profil tersimpan.')
    } catch (er) {
      setPesan(galat(er))
    } finally {
      setBusy(false)
    }
  }

  async function hapusFoto() {
    if (!pg?.foto_path) return
    setPesan(''); setBusy(true)
    try {
      await hapusFotoProfil(supabase, pg.foto_path)
      await onUbah()
      router.refresh()
      setPesan('Foto profil dihapus.')
    } catch (er) {
      setPesan(galat(er))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarPegawai
        jk={jkPegawai(pg?.jenis_kelamin, pg?.nip)} nama={pg?.nama || username}
        fotoUrl={akun.fotoUrl} className="w-16 h-16 text-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-gray-900 truncate">{pg?.nama || username}</p>
        <p className="text-xs text-gray-500">
          {ROLE_LABEL[akun.role] || akun.role || '—'}{akun.skpdNama ? ` · ${akun.skpdNama}` : ''}
        </p>
        <p className="text-xs text-gray-400">Username: {username}</p>
        {pg && (
          <div className="flex items-center gap-3 mt-2">
            <input ref={berkas} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pilihFoto} />
            <button type="button" className="text-xs text-teal-700 hover:underline disabled:opacity-50"
              disabled={busy} onClick={() => berkas.current?.click()}>
              {busy ? 'Memproses…' : pg.foto_path ? '📷 Ganti foto' : '📷 Unggah foto'}
            </button>
            {pg.foto_path && !busy && (
              <button type="button" className="text-xs text-gray-400 hover:text-red-600 hover:underline" onClick={hapusFoto}>
                Hapus foto
              </button>
            )}
          </div>
        )}
        <PesanProfil pesan={pesan} />
      </div>
    </div>
  )
}
