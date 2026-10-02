'use client'
// Ganti password — lewat Supabase Auth, dgn memverifikasi password lama dulu.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import EyeToggleButton from '@/shared/ui/EyeToggleButton'
import { pesanAuthID, type GalatAuth } from '@/lib/pesanAuth'
import PesanProfil from './PesanProfil'

const PW_MIN = 8

function InputPassword({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: string
}) {
  const [tampil, setTampil] = useState(false)
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input type={tampil ? 'text' : 'password'} className="select-filter w-full pr-9" value={value}
          autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
        <EyeToggleButton shown={tampil} onClick={() => setTampil(v => !v)} />
      </div>
    </div>
  )
}

export default function BagianPassword({ email }: { email: string }) {
  const supabase = createClient()
  const [lama, setLama] = useState('')
  const [baru, setBaru] = useState('')
  const [ulang, setUlang] = useState('')
  const [busy, setBusy] = useState(false)
  const [pesan, setPesan] = useState('')

  async function ganti(e: React.FormEvent) {
    e.preventDefault()
    setPesan('')
    if (!lama) { setPesan('Error: isi password lama.'); return }
    if (baru.length < PW_MIN) { setPesan(`Error: password baru minimal ${PW_MIN} karakter.`); return }
    if (baru === lama) { setPesan('Error: password baru harus berbeda dari yang lama.'); return }
    if (baru !== ulang) { setPesan('Error: ulangi password baru — keduanya belum sama.'); return }
    if (!email) { setPesan('Error: akun tidak terbaca, muat ulang halaman.'); return }
    setBusy(true)
    try {
      // Verifikasi password lama dulu: sesi yang tertinggal terbuka di komputer
      // bersama tak boleh cukup untuk mengambil alih akun.
      const { error: el } = await supabase.auth.signInWithPassword({ email, password: lama })
      if (el) throw new Error(pesanAuthID(el as GalatAuth, 'Password lama tidak dapat diverifikasi.'))
      const { error: eu } = await supabase.auth.updateUser({ password: baru })
      if (eu) throw new Error(pesanAuthID(eu as GalatAuth, 'Gagal mengganti password.'))
      // Keluarkan sesi di perangkat lain — gunanya ganti password justru itu.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      setLama(''); setBaru(''); setUlang('')
      setPesan('Password berhasil diganti. Sesi di perangkat lain sudah dikeluarkan.')
    } catch (er) {
      setPesan(`Error: ${pesanAuthID(er as GalatAuth, 'Gagal mengganti password.')}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={ganti} className="space-y-3">
      <p className="text-sm font-semibold text-gray-800">Ganti Password</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputPassword label="Password lama" value={lama} onChange={setLama} autoComplete="current-password" />
        <InputPassword label="Password baru" value={baru} onChange={setBaru} autoComplete="new-password" />
        <InputPassword label="Ulangi password baru" value={ulang} onChange={setUlang} autoComplete="new-password" />
      </div>
      <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">Syarat password baru</p>
        <p className={baru.length >= PW_MIN ? 'text-green-700' : ''}>{baru.length >= PW_MIN ? '✓' : '○'} Minimal {PW_MIN} karakter</p>
        <p className={baru && baru !== lama ? 'text-green-700' : ''}>{baru && baru !== lama ? '✓' : '○'} Berbeda dari password lama</p>
        <p className={baru && baru === ulang ? 'text-green-700' : ''}>{baru && baru === ulang ? '✓' : '○'} Pengulangan sama dengan password baru</p>
        <p className="text-gray-500 pt-1">
          Sebaiknya memadukan huruf besar, huruf kecil, angka, dan simbol. Jangan memakai password umum,
          nama, NIP, atau tanggal lahir. Password yang pernah bocor di internet akan ditolak sistem
          walaupun panjangnya cukup.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-400">Lupa password? Hubungi admin untuk direset (Admin → Daftar User).</p>
        <button type="submit" className="btn-primary text-sm flex-shrink-0" disabled={busy}>
          {busy ? 'Memproses…' : 'Ganti Password'}
        </button>
      </div>
      <PesanProfil pesan={pesan} />
    </form>
  )
}
