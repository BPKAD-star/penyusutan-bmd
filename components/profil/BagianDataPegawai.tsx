'use client'
// Data pegawai di halaman Profil. Nama, pangkat/golongan, dan jabatan TIDAK
// tersimpan langsung: pemilik akun mengajukan, admin menyetujui (keputusan user
// 2026-10-02, migrasi 20261002_03). Alasannya ada di lib/profil.ts. NIP & jenis
// kelamin tetap hanya-baca — itu pengenal, bukan keterangan yang lazim berubah.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_PANGKAT } from '@/lib/usulanPengurus'
import {
  formDariPegawai, kekuranganFormUbah, perubahanProfil, susunUsulan, type FormUbah,
} from '@/lib/profil'
import { ajukanUbahProfil, tarikAjuanProfil, type Akun } from '@/lib/profilData'
import PesanProfil, { galat } from './PesanProfil'

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{children || <span className="text-gray-300">—</span>}</p>
    </div>
  )
}

export default function BagianDataPegawai({ akun, onUbah }: { akun: Akun; onUbah: () => Promise<void> }) {
  const supabase = createClient()
  const pg = akun.pegawai
  const ajuan = akun.pengajuan
  const menunggu = ajuan?.status === 'menunggu' ? ajuan : null
  const ditolak = ajuan?.status === 'ditolak' ? ajuan : null

  const [mengubah, setMengubah] = useState(false)
  const [form, setForm] = useState<FormUbah>({ nama: '', golongan: '', jabatan: '' })
  const [busy, setBusy] = useState(false)
  const [pesan, setPesan] = useState('')

  if (!pg) {
    return (
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-2">Data Pegawai</p>
        <p className="text-xs text-amber-700">
          Akun ini belum ditautkan ke data pegawai. Minta admin menautkannya di Admin → Daftar User.
        </p>
      </div>
    )
  }

  function mulaiUbah() {
    setPesan('')
    // Kalau ada pengajuan menunggu, mulai dari isiannya — mengajukan lagi menggantikannya.
    setForm(formDariPegawai(menunggu ?? pg!))
    setMengubah(true)
  }

  const usulan = susunUsulan(form, pg)
  const kurang = kekuranganFormUbah(form, pg)

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    if (kurang.length) { setPesan(`Error: ${kurang[0]}`); return }
    setBusy(true); setPesan('')
    try {
      await ajukanUbahProfil(supabase, usulan)
      await onUbah()
      setMengubah(false)
      setPesan('Pengajuan terkirim. Data baru berlaku setelah disetujui admin.')
    } catch (er) {
      setPesan(galat(er))
    } finally {
      setBusy(false)
    }
  }

  async function tarik() {
    setBusy(true); setPesan('')
    try {
      await tarikAjuanProfil(supabase)
      await onUbah()
      setPesan('Pengajuan ditarik.')
    } catch (er) {
      setPesan(galat(er))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">Data Pegawai</p>
        {!mengubah && (
          <button type="button" className="text-xs text-teal-700 hover:underline" onClick={mulaiUbah}>
            ✎ {menunggu ? 'Ubah pengajuan' : 'Ajukan perubahan'}
          </button>
        )}
      </div>

      {!mengubah ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Baris label="Nama">{pg.nama}</Baris>
          <Baris label="NIP">{pg.nip || 'Non-ASN'}</Baris>
          <Baris label="Pangkat / Golongan">{[pg.pangkat, pg.golongan].filter(Boolean).join(' — ')}</Baris>
          <Baris label="Jenis Kelamin">
            {pg.jenis_kelamin === 'L' ? 'Laki-laki' : pg.jenis_kelamin === 'P' ? 'Perempuan' : ''}
          </Baris>
          <div className="sm:col-span-2"><Baris label="Jabatan">{pg.jabatan}</Baris></div>
        </div>
      ) : (
        <form onSubmit={kirim} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nama</label>
              <input className="select-filter w-full" value={form.nama} disabled={busy}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pangkat / Golongan</label>
              <select className="select-filter w-full" value={form.golongan} disabled={busy}
                onChange={e => setForm(f => ({ ...f, golongan: e.target.value }))}>
                <option value="">— (Non-ASN / tidak ada)</option>
                {GOLONGAN_PANGKAT.map(g => <option key={g.golongan} value={g.golongan}>{g.golongan} — {g.pangkat}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
              <input className="select-filter w-full" value={form.jabatan} disabled={busy}
                onChange={e => setForm(f => ({ ...f, jabatan: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={busy || kurang.length > 0}>
              {busy ? 'Mengirim…' : 'Kirim Pengajuan'}
            </button>
            <button type="button" className="text-sm text-gray-500 hover:underline" disabled={busy}
              onClick={() => { setMengubah(false); setPesan('') }}>Batal</button>
            {kurang.length > 0 && <span className="text-[11px] text-gray-400">{kurang[0]}</span>}
          </div>
        </form>
      )}

      {menunggu && !mengubah && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">⏳ Pengajuan menunggu persetujuan admin</p>
          <ul className="mt-1 space-y-0.5">
            {perubahanProfil(pg, menunggu).map(p => (
              <li key={p.kunci}>{p.label}: <span className="line-through opacity-60">{p.dari || '—'}</span> → <b>{p.ke || '—'}</b></li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-amber-900 underline disabled:opacity-50" disabled={busy} onClick={tarik}>
            Tarik pengajuan
          </button>
        </div>
      )}

      {ditolak && !menunggu && !mengubah && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p className="font-medium">Pengajuan terakhir ditolak admin</p>
          {ditolak.catatan_admin && <p className="mt-1">Catatan: {ditolak.catatan_admin}</p>}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-4">
        Perubahan nama, pangkat, dan jabatan perlu disetujui admin karena ikut tercetak di dokumen bertanda tangan.
      </p>
      <PesanProfil pesan={pesan} />
    </div>
  )
}
