'use client'
// Admin → Pengajuan Profil (2026-10-02, migrasi 20261002_03). Antrean pengajuan
// perubahan nama / pangkat-golongan / jabatan dari halaman Profil pengguna.
// Disetujui → data pegawai langsung berubah (RPC fn_profil_putuskan_ubah);
// ditolak → catatan dikembalikan ke pengaju. Hanya admin yang berwenang —
// ditegakkan RPC & RLS, bukan oleh layar ini.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { perubahanProfil } from '@/lib/profil'
import { muatPengajuanMenunggu, putuskanPengajuan, type PengajuanAdmin } from '@/lib/profilData'

const waktu = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  + ', ' + new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export default function PengajuanProfilPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [daftar, setDaftar] = useState<PengajuanAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const muat = useCallback(async () => {
    try {
      setDaftar(await muatPengajuanMenunggu(createClient()))
      setErr('')
    } catch (e) {
      // Daftar lama dibuang: pengajuan yang sudah diputuskan tak boleh tampak masih menunggu.
      setDaftar([])
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void muat() }, [muat])

  async function putuskan(a: PengajuanAdmin, setuju: boolean) {
    const nama = a.pegawai?.nama || a.nama_lama || 'pegawai ini'
    try {
      const hasil = await konfirmasi({
        nada: setuju ? 'teal' : 'merah',
        judul: setuju ? `Setujui perubahan data ${nama}?` : `Tolak pengajuan ${nama}?`,
        labelYa: setuju ? 'Ya, setujui' : 'Tolak',
        isi: setuju
          ? <>Data pegawai <b>langsung berubah</b> dan ikut tercetak di dokumen bertanda tangan berikutnya (termasuk pemilihan penanda tangan, karena jabatan dipakai menebak Kepala SKPD).</>
          : <>Data pegawai tidak berubah. Catatan Anda dibaca pengaju di halaman Profil-nya.</>,
        catatan: setuju ? undefined : { label: 'Alasan penolakan', petunjuk: 'Boleh dikosongkan, tapi pengaju tak akan tahu apa yang harus diperbaiki.' },
        kerjakan: async catatan => { await putuskanPengajuan(supabase, a.id, setuju, catatan) },
      })
      if (hasil.ya) await muat()
    } catch (e) {
      setErr(`Gagal memutuskan pengajuan: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <FormShell judul="Pengajuan Profil" deskripsi="Perubahan nama, pangkat/golongan, dan jabatan yang diajukan pegawai dari halaman Profil." msg="">
      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && <p className="text-sm text-gray-400">Memuat...</p>}
      {!loading && !err && daftar.length === 0 && (
        <p className="text-sm text-gray-500">Tidak ada pengajuan yang menunggu.</p>
      )}

      <div className="space-y-3 max-w-3xl">
        {daftar.map(a => {
          const lama = { nama: a.nama_lama || '', golongan: a.golongan_lama, pangkat: a.pangkat_lama, jabatan: a.jabatan_lama }
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.pegawai?.nama || a.nama_lama}</p>
                  <p className="text-xs text-gray-500">
                    {a.pegawai?.nip || 'Non-ASN'}{a.pegawai?.skpd?.nama ? ` · ${a.pegawai.skpd.nama}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-400">Diajukan {waktu(a.created_at)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="btn-primary text-sm" onClick={() => void putuskan(a, true)}>Setujui</button>
                  <button className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => void putuskan(a, false)}>Tolak</button>
                </div>
              </div>
              <ul className="mt-3 text-sm space-y-1">
                {perubahanProfil(lama, a).map(p => (
                  <li key={p.kunci}>
                    <span className="text-gray-400 text-xs mr-1">{p.label}</span>
                    <span className="line-through text-gray-400">{p.dari || '—'}</span>
                    {' → '}
                    <b className="text-green-700">{p.ke || '—'}</b>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </FormShell>
  )
}
