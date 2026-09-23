'use client'
// Tim pelaksana inventarisasi — SATU tim per SKPD per tahun (keputusan user
// 2026-09-23), bukan per jenis aset & bukan per barang. Dipilih dari
// admin_pegawai SKPD itu lalu di-snapshot ke `inventarisasi_tim.petugas`
// supaya lembar yang sudah dicetak tetap sesuai walau data pegawainya berubah.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { muatTimSendiri, simpanTim } from '@/lib/inventarisasiData'
import type { Petugas } from '@/lib/inventarisasi'

type PegawaiRow = { id: string; nama: string; nip: string | null; jabatan: string | null }

export default function TimPanel({ skpdId, tahun, bolehUbah }: {
  skpdId: number
  tahun: number
  bolehUbah: boolean
}) {
  const supabase = createClient()
  const [tim, setTim] = useState<Petugas[]>([])
  const [pegawai, setPegawai] = useState<PegawaiRow[]>([])
  const [pilih, setPilih] = useState('')
  const [err, setErr] = useState('')
  const [muat, setMuat] = useState(true)

  useEffect(() => {
    let batal = false
    void (async () => {
      setMuat(true); setErr('')
      try {
        const [t, pg] = await Promise.all([
          muatTimSendiri(supabase, skpdId, tahun),
          supabase.from('admin_pegawai').select('id,nama,nip,jabatan').eq('skpd_id', skpdId).order('nama'),
        ])
        if (pg.error) throw new Error(`gagal membaca daftar pegawai: ${pg.error.message}`)
        if (batal) return
        setTim(t)
        setPegawai((pg.data as PegawaiRow[]) || [])
      } catch (e) {
        if (!batal) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!batal) setMuat(false)
      }
    })()
    return () => { batal = true }
  }, [skpdId, tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  async function simpan(next: Petugas[]) {
    setErr('')
    try {
      await simpanTim(supabase, skpdId, tahun, next)
      setTim(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-1.5">
        Tim Pelaksana Inventarisasi {tahun}
        <span className="ml-1 font-normal text-gray-400">
          — dicetak di tiap lembar kerja unit ini. Kalau kosong, lembar memakai tim SKPD induknya.
        </span>
      </p>
      {err && <p className="text-xs text-red-600 mb-1.5">{err}</p>}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {muat ? <span className="text-xs text-gray-400">Memuat…</span>
          : tim.length === 0 ? <span className="text-xs text-gray-400">Belum ada petugas.</span>
          : tim.map(p => (
            <span key={p.pegawai_id} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1.5">
              {p.nama}{p.nip ? ` · ${p.nip}` : ''}
              {bolehUbah && (
                <button className="text-gray-400 hover:text-red-600" title="Keluarkan dari tim"
                  onClick={() => void simpan(tim.filter(x => x.pegawai_id !== p.pegawai_id))}>×</button>
              )}
            </span>
          ))}
      </div>
      {bolehUbah && !muat && (
        <div className="flex items-center gap-2">
          <select className="select-filter text-xs max-w-md" value={pilih} onChange={e => setPilih(e.target.value)}>
            <option value="">— pilih pegawai —</option>
            {pegawai.filter(p => !tim.some(x => x.pegawai_id === p.id)).map(p => (
              <option key={p.id} value={p.id}>{p.nama}{p.nip ? ` — ${p.nip}` : ''}</option>
            ))}
          </select>
          <button className="btn-secondary text-xs" disabled={!pilih}
            onClick={() => {
              const p = pegawai.find(x => x.id === pilih)
              if (!p) return
              void simpan([...tim, { pegawai_id: p.id, nama: p.nama, nip: p.nip, jabatan: p.jabatan }])
              setPilih('')
            }}>+ Tambah</button>
        </div>
      )}
    </div>
  )
}
