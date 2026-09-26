'use client'
// Isian TL Temuan BPK / Inspektorat. Tiap capaian = baris baru bertanggal;
// yang dihitung adalah capaian TERVERIFIKASI terakhir s.d. bulan yang dilihat.
// Dibuka sbg pop-up dari halaman Capaian SKPD. `readOnly` (SKPD di luar
// cakupan pengguna / akun pengawas) → form & tombol Hapus disembunyikan,
// riwayat tetap tampil. Bukan penjaga — RLS `ipa_isian` yang menolak tulis.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { DokumenBastField } from '@/components/pengelolaan/DokumenBastField'
import type { Indikator } from '@/lib/ipa'
import { hapusIsian, muatIsian, simpanIsian, unggahBukti, type Isian } from '@/lib/ipaData'
import { BuktiLinks, PesanError, StatusPill, fmtAngka } from '@/components/ipa/ipaUi'

const HARI_INI = new Date().toISOString().slice(0, 10)

export default function CapaianTl({ indikator, skpdId, tahun, readOnly = false }: { indikator: Indikator; skpdId: number; tahun: number; readOnly?: boolean }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { data, error, run } = useAsyncData<Isian[]>()
  const [muatKe, setMuatKe] = useState(0)
  const [tanggal, setTanggal] = useState('')
  const [tidakAda, setTidakAda] = useState(false)
  const [selesai, setSelesai] = useState('')
  const [total, setTotal] = useState('')
  const [catatan, setCatatan] = useState('')
  const [bukti, setBukti] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [salah, setSalah] = useState('')

  useEffect(() => {
    void run(async () => (await muatIsian(supabase, tahun, { skpdId })).filter(i => i.indikator === indikator.kode))
  }, [muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  async function unggah(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try { const p = await unggahBukti(supabase, `${indikator.kode.toLowerCase()}/${skpdId}`, files); setBukti(b => [...b, ...p]) }
    catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message, 'Gagal mengunggah') }
    finally { setUploading(false) }
  }

  async function simpan() {
    const s = Number(selesai), t = Number(total)
    const kurang: string[] = []
    if (!tanggal) kurang.push('tanggal capaian')
    else if (!tanggal.startsWith(String(tahun))) kurang.push(`tanggal capaian harus di tahun ${tahun}`)
    else if (tanggal > HARI_INI) kurang.push('tanggal capaian tidak boleh di masa depan')
    if (!tidakAda) {
      if (!total || !(t > 0)) kurang.push(`${indikator.label_penyebut.toLowerCase()} (> 0)`)
      if (selesai === '' || s < 0) kurang.push(indikator.label_pembilang.toLowerCase())
      if (t > 0 && s > t) kurang.push('yang selesai tidak boleh melebihi total')
    }
    if (bukti.length === 0) kurang.push('bukti dokumen')
    if (kurang.length) { setSalah(`Belum lengkap: ${kurang.join(', ')}.`); return }
    setSalah(''); setSaving(true)
    try {
      await simpanIsian(supabase, {
        tahun, skpd_id: skpdId, indikator: indikator.kode, tidak_ada: tidakAda,
        pembilang: tidakAda ? null : s, penyebut: tidakAda ? null : t,
        tanggal_capaian: tanggal, catatan: catatan.trim() || null, bukti_paths: bukti,
      })
      setTanggal(''); setSelesai(''); setTotal(''); setCatatan(''); setBukti([]); setTidakAda(false)
      setMuatKe(k => k + 1)
    } catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message) }
    finally { setSaving(false) }
  }

  async function hapus(i: Isian) {
    try {
      await konfirmasi({
        judul: 'Hapus isian ini?', nada: 'merah', labelYa: 'Hapus',
        rincian: [{ label: 'Tanggal capaian', nilai: i.tanggal_capaian }],
        kerjakan: async () => { await hapusIsian(supabase, 'ipa_isian', i.id) },
      })
      setMuatKe(k => k + 1)
    } catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message, 'Gagal menghapus') }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {!readOnly && <div className="card p-5 xl:col-span-2 space-y-3">
        <p className="font-semibold text-gray-900">Tambah capaian {indikator.nama}</p>
        <p className="text-xs text-gray-500">
          Isi posisi TERKINI setiap kali ada kemajuan tindak lanjut. Skor memakai capaian terverifikasi terakhir.
        </p>
        <label className="block text-xs text-gray-500">Tanggal capaian <span className="text-red-500">*</span>
          <input type="date" className="select-filter w-full mt-1" value={tanggal} min={`${tahun}-01-01`} max={`${tahun}-12-31` < HARI_INI ? `${tahun}-12-31` : HARI_INI} onChange={e => setTanggal(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={tidakAda} onChange={e => setTidakAda(e.target.checked)} />
          Tidak ada temuan / rekomendasi tahun ini
        </label>
        {tidakAda
          ? <p className="text-xs text-gray-500">Indikator ini akan dianggap <b>tidak berlaku (N/A)</b> — bobotnya dialihkan ke indikator lain. Tetap lampirkan dokumen pendukung (mis. LHP / surat keterangan).</p>
          : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-gray-500">{indikator.label_penyebut} <span className="text-red-500">*</span>
                <input type="number" min={0} className="select-filter w-full mt-1" value={total} onChange={e => setTotal(e.target.value)} />
              </label>
              <label className="block text-xs text-gray-500">{indikator.label_pembilang} <span className="text-red-500">*</span>
                <input type="number" min={0} className="select-filter w-full mt-1" value={selesai} onChange={e => setSelesai(e.target.value)} />
              </label>
            </div>
          )}
        <label className="block text-xs text-gray-500">Catatan
          <textarea className="select-filter w-full mt-1" rows={2} value={catatan} onChange={e => setCatatan(e.target.value)} />
        </label>
        <DokumenBastField paths={bukti} uploading={uploading} onUpload={unggah}
          onHapus={p => setBukti(b => b.filter(x => x !== p))}
          judul="Bukti tindak lanjut" hint="foto / PDF, bisa lebih dari satu" kosongText="Belum ada bukti — wajib diunggah." />
        {salah && <p className="text-sm text-red-600">{salah}</p>}
        <button className="btn-primary w-full disabled:opacity-60" onClick={simpan} disabled={saving || uploading}>
          {saving ? 'Menyimpan…' : 'Ajukan capaian'}
        </button>
      </div>}

      <div className={`card ${readOnly ? 'xl:col-span-5' : 'xl:col-span-3'}`}>
        <div className="p-4 border-b border-gray-100 font-semibold text-gray-900">Riwayat capaian {tahun}</div>
        <PesanError pesan={error} />
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="table-th">Tanggal</th><th className="table-th">Capaian</th>
            <th className="table-th">Bukti</th><th className="table-th">Status</th><th className="table-th" />
          </tr></thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan={5} className="table-td text-center text-gray-400 py-8">Belum ada capaian.</td></tr>}
            {data?.map(i => (
              <tr key={i.id} className="border-t border-gray-50 align-top">
                <td className="table-td whitespace-nowrap">{i.tanggal_capaian}</td>
                <td className="table-td">
                  {i.tidak_ada ? <span className="text-gray-500">Tidak ada temuan (N/A)</span>
                    : <span className="tabular-nums">{fmtAngka(i.pembilang!)} / {fmtAngka(i.penyebut!)} selesai</span>}
                  {i.catatan && <p className="text-xs text-gray-500">{i.catatan}</p>}
                </td>
                <td className="table-td"><BuktiLinks paths={i.bukti_paths} /></td>
                <td className="table-td">
                  <StatusPill s={i.status} />
                  {i.status === 'ditolak' && i.catatan_verifikator && <p className="text-xs text-red-600 mt-1">{i.catatan_verifikator}</p>}
                </td>
                <td className="table-td text-right">
                  {!readOnly && i.status !== 'diverifikasi' && <button className="text-xs text-red-600 hover:underline" onClick={() => hapus(i)}>Hapus</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
