'use client'
// Profil Pengguna (permintaan user 2026-10-01; satu kotak sejak 2026-10-02) —
// dibuka dari menu akun di TopBar. Bagian-bagiannya punya wewenang BERBEDA:
//
// 1. Foto profil & Nomor HP — diubah pemilik akun SENDIRI, langsung tersimpan.
// 2. Nama, pangkat/golongan, jabatan — DIAJUKAN, admin yang menyetujui
//    (dicetak di lembar bertanda tangan; lihat lib/profil.ts).
// 3. Ganti password — lewat Supabase Auth, dgn memverifikasi password lama dulu.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import KepalaProfil from '@/components/profil/KepalaProfil'
import BagianDataPegawai from '@/components/profil/BagianDataPegawai'
import BagianNoHp from '@/components/profil/BagianNoHp'
import BagianPassword from '@/components/profil/BagianPassword'
import { muatAkun, type Akun } from '@/lib/profilData'

const DOMAIN_SINTETIS = '@pengguna.bmd.internal'

export default function ProfilPage() {
  const [akun, setAkun] = useState<Akun | null>(null)
  const [errMuat, setErrMuat] = useState('')

  // Dipakai juga sebagai "muat ulang" sesudah tiap aksi: TIDAK menyalakan gerbang
  // "Memuat..." — gerbang di atas komponen anak ber-state akan membongkar form
  // yang sedang diisi (CLAUDE.md 2026-08-14).
  const muat = useCallback(async () => {
    try {
      setAkun(await muatAkun(createClient()))
      setErrMuat('')
    } catch (e) {
      setErrMuat(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void muat() }, [muat])

  const username = akun?.email.endsWith(DOMAIN_SINTETIS) ? akun.email.slice(0, -DOMAIN_SINTETIS.length) : akun?.email || ''

  return (
    <FormShell judul="Profil Saya" deskripsi="Foto, data diri, nomor HP, dan password akun Anda." msg="">
      {errMuat && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Gagal memuat profil: {errMuat}</div>}
      {!akun && !errMuat && <p className="text-sm text-gray-400">Memuat...</p>}

      {akun && (
        <div className="card p-6 max-w-3xl divide-y divide-gray-100 [&>*]:py-6 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
          <KepalaProfil akun={akun} username={username} onUbah={muat} />
          <BagianDataPegawai akun={akun} onUbah={muat} />
          <BagianNoHp pegawai={akun.pegawai} onUbah={muat} />
          <BagianPassword email={akun.email} />
        </div>
      )}
    </FormShell>
  )
}
