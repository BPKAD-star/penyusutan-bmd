'use client'
// Nomor HP — disunting pemilik akun SENDIRI lewat RPC fn_profil_simpan_hp
// (migrasi 20261001_02), yang hanya menyentuh kolom `no_hp` pegawainya.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalNoHp, tampilNoHp } from '@/lib/noHp'
import { simpanNoHp, type Pegawai } from '@/lib/profilData'
import PesanProfil, { galat } from './PesanProfil'

export default function BagianNoHp({ pegawai, onUbah }: { pegawai: Pegawai | null; onUbah: () => Promise<void> }) {
  const supabase = createClient()
  const [hp, setHp] = useState(tampilNoHp(pegawai?.no_hp))
  const [busy, setBusy] = useState(false)
  const [pesan, setPesan] = useState('')

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setPesan('')
    let nilai: string | null
    try { nilai = normalNoHp(hp) } catch (er) { setPesan(galat(er)); return }
    setBusy(true)
    try {
      const tersimpan = await simpanNoHp(supabase, nilai)
      setHp(tampilNoHp(tersimpan))
      await onUbah()
      setPesan(tersimpan ? 'Nomor HP tersimpan.' : 'Nomor HP dihapus.')
    } catch (er) {
      setPesan(galat(er))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={simpan}>
      <p className="text-sm font-semibold text-gray-800">Nomor HP (WhatsApp)</p>
      <p className="text-[11px] text-gray-400 mb-3">
        Dipakai untuk menghubungi Anda terkait BMD. Satu nomor hanya untuk satu pegawai.
      </p>
      <div className="flex gap-2 max-w-md">
        <input className="select-filter flex-1" value={hp} inputMode="tel" placeholder="0812-3456-7890"
          disabled={!pegawai || busy} onChange={e => setHp(e.target.value)} />
        <button type="submit" className="btn-primary text-sm" disabled={!pegawai || busy}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
      <PesanProfil pesan={pesan} />
    </form>
  )
}
