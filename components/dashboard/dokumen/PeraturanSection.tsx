'use client'
// Isi satu kotak PERATURAN (PP · Permendagri · Perda · Perbup) di halaman
// Dokumen Sumber. Bentuk & alasannya: lib/dokumenSiklus.ts `DAFTAR_PERATURAN`.
// Unggah & hapus hanya admin (ditegakkan RLS `ds_insert`/`ds_delete`; tombolnya
// di sini cuma cerminan), semua pengguna boleh membuka berkasnya.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type PeraturanConfig, judulPeraturan, tahunPeraturanSah } from '@/lib/dokumenSiklus'
import {
  muatPeraturan, simpanPeraturan, hapusPeraturan, MAKS_BERKAS_PERATURAN, type BarisPeraturan,
} from '@/lib/dokumenPeraturanData'
import { bukaDokumenSumber, namaFileDariPath } from '@/lib/dokumenStorage'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'

const pesan = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function PeraturanSection({ peraturan, isAdmin, onBerubah }: {
  peraturan: PeraturanConfig
  isAdmin: boolean
  /** Dipanggil sesudah tambah/hapus supaya jumlah di kotaknya ikut segar. */
  onBerubah: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { data, loading, error, run } = useAsyncData<BarisPeraturan[]>()
  const [formOpen, setFormOpen] = useState(false)
  const [nomor, setNomor] = useState('')
  const [tahun, setTahun] = useState('')
  const [tentang, setTentang] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const muat = useCallback(
    () => run(() => muatPeraturan(supabase, peraturan)),
    [peraturan, run], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => { void muat() }, [muat])

  const tahunIni = new Date().getFullYear()
  const tahunSah = tahunPeraturanSah(tahun, tahunIni)

  async function tambah() {
    if (!nomor.trim()) { setErr('Nomor peraturan wajib diisi.'); return }
    if (tahunSah == null) { setErr(`Tahun peraturan wajib 4 angka, 1945 s.d. ${tahunIni}.`); return }
    if (!tentang.trim()) { setErr('Isian "Tentang" wajib diisi.'); return }
    if (!file) { setErr('Berkas PDF wajib dipilih.'); return }
    if (file.size > MAKS_BERKAS_PERATURAN) {
      setErr(`Berkas ${(file.size / 1024 / 1024).toFixed(1)} MB — melebihi batas 10 MB. Kompres dulu, atau unggah batang tubuh & lampirannya terpisah.`)
      return
    }
    setErr(''); setSaving(true)
    try {
      await simpanPeraturan(supabase, peraturan, { nomor, tahun: tahunSah, tentang, file })
      setNomor(''); setTahun(''); setTentang(''); setFile(null); setFormOpen(false)
      await muat(); onBerubah()
    } catch (e) {
      await konfirmasiGagal(konfirmasi, pesan(e))
    } finally {
      setSaving(false)
    }
  }

  async function hapus(d: BarisPeraturan) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus peraturan ini?', subjudul: d.judul,
      isi: <>Berkasnya ikut <b>dibuang dari penyimpanan</b> dan tak bisa dikembalikan.</>,
      labelYa: 'Hapus peraturan',
    })).ya) return
    try {
      await hapusPeraturan(supabase, d)
      await muat(); onBerubah()
    } catch (e) {
      await konfirmasiGagal(konfirmasi, pesan(e), 'Gagal menghapus')
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{peraturan.panjang}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Berlaku lintas tahun — tidak ikut pemilih tahun. Diurut dari tahun peraturan terbaru.
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary text-xs flex-shrink-0" onClick={() => { setErr(''); setFormOpen(o => !o) }}>
            {formOpen ? 'Batal' : '+ Tambah'}
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-4 p-4 border border-gray-100 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nomor</label>
              <input className="select-filter w-full" value={nomor} onChange={e => setNomor(e.target.value)} placeholder="mis. 47" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tahun</label>
              <input className="select-filter w-full" inputMode="numeric" maxLength={4} value={tahun}
                onChange={e => setTahun(e.target.value)} placeholder="mis. 2021" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tentang</label>
            <input className="select-filter w-full" value={tentang} onChange={e => setTentang(e.target.value)}
              placeholder="mis. Tata Cara Pelaksanaan Pembukuan, Inventarisasi, dan Pelaporan BMD" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Berkas PDF (maks. 10 MB)</label>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          {nomor.trim() && tahunSah != null && (
            <p className="text-xs text-gray-500">
              Akan tersimpan sebagai: <b className="text-gray-700">{judulPeraturan(peraturan.label, nomor, tahunSah)}</b>
            </p>
          )}
          {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
          <div className="flex justify-end">
            <button className="btn-primary text-xs" onClick={tambah} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Memuat...</p>
      ) : error ? (
        <p className="text-xs text-red-600" role="alert">Gagal memuat: {error}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada {peraturan.label} yang diunggah.</p>
      ) : (
        <div className="space-y-2">
          {data.map(d => (
            <div key={d.id} className="border border-gray-100 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="text-xs text-gray-600 min-w-0">
                <p className="font-medium text-gray-800">{d.judul}</p>
                {d.keterangan && <p className="text-gray-500 mt-0.5">tentang {d.keterangan}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => bukaDokumenSumber(d.file_path)} className="underline text-teal text-xs hover:opacity-80">
                  {namaFileDariPath(d.file_path)}
                </button>
                {isAdmin && (
                  <button onClick={() => hapus(d)} title="Hapus peraturan"
                    className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-500 hover:bg-red-600 text-white text-xs">🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
