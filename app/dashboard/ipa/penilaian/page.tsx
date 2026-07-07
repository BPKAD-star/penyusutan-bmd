'use client'
// Halaman Input Penilaian IPA — client page (beda dari source yang server
// component + service-role client), ikut pola app ini: browser client + RLS.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormPenilaian from '@/components/ipa/FormPenilaian'

type SKPDItem = { id: number; kode_lokasi: string | null; nama: string; kelompok_fpk: number | null }
type TahunAktif = { id: string; tahun: number; batas_submit_pb: string | null; batas_submit_bkad: string | null }

export default function PenilaianIPAPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [boleh, setBoleh] = useState(false)
  const [tahunAktif, setTahunAktif] = useState<TahunAktif | null>(null)
  const [skpdList, setSkpdList] = useState<SKPDItem[]>([])
  const [lockedSkpdId, setLockedSkpdId] = useState<string | undefined>(undefined)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase.from('profiles')
        .select('role,skpd_id,ipa_role').eq('id', user.id).single()

      const isAdminBmd = profile?.role === 'admin'
      const ipaRole = profile?.ipa_role as string | null

      if (!isAdminBmd && !ipaRole) { setLoading(false); return }
      setBoleh(true)

      const { data: tahun } = await supabase.from('ipa_tahun_anggaran')
        .select('id,tahun,batas_submit_pb,batas_submit_bkad').eq('is_active', true).maybeSingle()
      setTahunAktif(tahun as TahunAktif | null)

      if (tahun) {
        if (ipaRole === 'pb_admin' && profile?.skpd_id) {
          const { data } = await supabase.from('skpd')
            .select('id,kode_lokasi,nama,kelompok_fpk').eq('id', profile.skpd_id).single()
          if (data) { setSkpdList([data as SKPDItem]); setLockedSkpdId(String(profile.skpd_id)) }
        } else {
          const { data } = await supabase.from('skpd')
            .select('id,kode_lokasi,nama,kelompok_fpk').eq('jabatan', 'pengguna barang').order('kode_lokasi').limit(1000)
          setSkpdList((data as SKPDItem[]) || [])
        }
      }

      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Memuat...</div>
  }

  if (!boleh) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <h2 className="text-lg font-semibold text-slate-800">Belum terdaftar di IPA</h2>
        <p className="text-sm text-slate-500 mt-1">
          Akun Anda belum punya Role IPA. Hubungi admin untuk didaftarkan lewat menu Admin → Daftar User.
        </p>
      </div>
    )
  }

  if (!tahunAktif) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <h2 className="text-lg font-semibold text-slate-800">Tidak ada tahun anggaran aktif</h2>
        <p className="text-sm text-slate-500 mt-1">
          Aktifkan salah satu Tahun Anggaran IPA dulu lewat panel di Dashboard IPA.
        </p>
      </div>
    )
  }

  return <FormPenilaian skpdList={skpdList} tahunAktif={tahunAktif} lockedSkpdId={lockedSkpdId} />
}
