'use client'
// Pelaksanaan rekonsiliasi per periode yang ditetapkan Admin. Satu baris per
// periode × SKPD; tepat waktu bila tanggal pelaksanaan ≤ batas periode.
// Sementara sampai "snapshot rekonsiliasi" dibangun — begitu ada, pelaksanaan
// cukup diturunkan dari snapshot periode itu & isian ini bisa dipensiunkan.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { DokumenBastField } from '@/components/pengelolaan/DokumenBastField'
import {
  muatPelaksanaanRekon, muatPeriodeRekon, simpanPelaksanaanRekon, unggahBukti,
  type PelaksanaanRekon, type PeriodeRekon,
} from '@/lib/ipaData'
import { BuktiLinks, PesanError, StatusPill } from '@/components/ipa/ipaUi'

const HARI_INI = new Date().toISOString().slice(0, 10)
type Muatan = { periode: PeriodeRekon[]; pelaksanaan: PelaksanaanRekon[] }

export default function CapaianRekon({ skpdId, tahun }: { skpdId: number; tahun: number }) {
  const supabase = createClient()
  const { data, error, run } = useAsyncData<Muatan>()
  const [muatKe, setMuatKe] = useState(0)

  useEffect(() => {
    void run(async () => {
      const periode = await muatPeriodeRekon(supabase, tahun)
      const pelaksanaan = await muatPelaksanaanRekon(supabase, periode.map(p => p.id), { skpdId })
      return { periode, pelaksanaan }
    })
  }, [muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100">
        <p className="font-semibold text-gray-900">Pelaksanaan rekonsiliasi {tahun}</p>
        <p className="text-xs text-gray-500">Periode & batas waktunya ditetapkan Pengelola Barang (menu Pengaturan IPA). Lampirkan Berita Acara Rekonsiliasi yang sudah ditandatangani.</p>
      </div>
      <PesanError pesan={error} />
      {data?.periode.length === 0 && <p className="p-6 text-sm text-gray-400">Belum ada periode rekonsiliasi untuk tahun {tahun}.</p>}
      <div className="divide-y divide-gray-50">
        {data?.periode.map(p => (
          <BarisPeriode key={p.id} periode={p} skpdId={skpdId}
            pelaksanaan={data.pelaksanaan.find(x => x.periode_id === p.id) ?? null}
            onBerubah={() => setMuatKe(k => k + 1)} />
        ))}
      </div>
    </div>
  )
}

function BarisPeriode({ periode, pelaksanaan, skpdId, onBerubah }: {
  periode: PeriodeRekon; pelaksanaan: PelaksanaanRekon | null; skpdId: number; onBerubah: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [tanggal, setTanggal] = useState(pelaksanaan?.tanggal_pelaksanaan ?? '')
  const [bukti, setBukti] = useState<string[]>(pelaksanaan?.bukti_paths ?? [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [salah, setSalah] = useState('')
  const beku = pelaksanaan?.status === 'diverifikasi'

  async function unggah(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try { const p = await unggahBukti(supabase, `rekon/${skpdId}`, files); setBukti(b => [...b, ...p]) }
    catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message, 'Gagal mengunggah') }
    finally { setUploading(false) }
  }

  async function simpan() {
    if (!tanggal) return setSalah('Tanggal pelaksanaan wajib diisi.')
    if (tanggal > HARI_INI) return setSalah('Tanggal pelaksanaan tidak boleh di masa depan.')
    if (bukti.length === 0) return setSalah('Berita Acara Rekonsiliasi wajib diunggah.')
    setSalah(''); setSaving(true)
    try {
      await simpanPelaksanaanRekon(supabase, {
        id: pelaksanaan?.id, periode_id: periode.id, skpd_id: skpdId,
        tanggal_pelaksanaan: tanggal, catatan: null, bukti_paths: bukti,
      })
      onBerubah()
    } catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message) }
    finally { setSaving(false) }
  }

  const telat = tanggal && tanggal > periode.batas_tanggal
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
      <div>
        <p className="font-medium text-gray-900">{periode.nama}</p>
        <p className="text-xs text-gray-500">Batas: {periode.batas_tanggal}</p>
        <div className="mt-2"><StatusPill s={pelaksanaan?.status ?? null} /></div>
        {pelaksanaan?.status === 'ditolak' && pelaksanaan.catatan_verifikator && <p className="text-xs text-red-600 mt-1">{pelaksanaan.catatan_verifikator}</p>}
      </div>
      {beku ? (
        <div className="lg:col-span-3 text-sm text-gray-600">
          Dilaksanakan {pelaksanaan!.tanggal_pelaksanaan} <BuktiLinks paths={pelaksanaan!.bukti_paths} />
        </div>
      ) : (
        <>
          <label className="block text-xs text-gray-500">Tanggal pelaksanaan <span className="text-red-500">*</span>
            <input type="date" className="select-filter w-full mt-1" value={tanggal} max={HARI_INI} onChange={e => setTanggal(e.target.value)} />
            {telat && <span className="text-amber-600">Melewati batas — akan dihitung tidak tepat waktu.</span>}
          </label>
          <DokumenBastField paths={bukti} uploading={uploading} onUpload={unggah}
            onHapus={p => setBukti(b => b.filter(x => x !== p))}
            judul="BA Rekonsiliasi" hint="PDF / foto" kosongText="Belum diunggah." />
          <div>
            <button className="btn-primary w-full disabled:opacity-60" onClick={simpan} disabled={saving || uploading}>
              {saving ? 'Menyimpan…' : pelaksanaan ? 'Perbarui & ajukan ulang' : 'Ajukan'}
            </button>
            {salah && <p className="text-xs text-red-600 mt-1">{salah}</p>}
          </div>
        </>
      )}
    </div>
  )
}
