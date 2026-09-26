'use client'
// Bukti pajak kendaraan bermotor — satu bukti per kendaraan per tahun.
// Penyebutnya SELURUH kendaraan bermotor aktif SKPD (register, kode
// 1.3.2.02.01.*), jadi kendaraan tanpa bukti otomatis menurunkan skor —
// bukan dianggap "belum diisi".
// `readOnly` → tanggal & bukti tampil apa adanya tanpa tombol unggah.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { muatKendaraan, simpanPajak, unggahBukti, type KendaraanPajak, type SkpdIpa } from '@/lib/ipaData'
import { BuktiLinks, PesanError, StatusPill } from '@/components/ipa/ipaUi'

const HARI_INI = new Date().toISOString().slice(0, 10)

export default function CapaianPajak({ skpd, tahun, readOnly = false }: { skpd: SkpdIpa; tahun: number; readOnly?: boolean }) {
  const supabase = createClient()
  const { data, error, loading, run } = useAsyncData<KendaraanPajak[]>()
  const [muatKe, setMuatKe] = useState(0)
  const [cari, setCari] = useState('')

  useEffect(() => { void run(() => muatKendaraan(supabase, tahun, skpd.skpd_id)) }, [muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (data ?? []).filter(k => !q || [k.no_polisi, k.nama_barang, k.merek_tipe, k.nibar].some(v => (v ?? '').toLowerCase().includes(q)))
  }, [data, cari])
  const n = (s: string | null) => (data ?? []).filter(k => k.status === s).length

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Pajak kendaraan bermotor {tahun}</p>
          <p className="text-xs text-gray-500">
            {data ? `${data.length} kendaraan · ${n('diverifikasi')} terverifikasi · ${n('diajukan')} menunggu · ${n('ditolak')} ditolak · ${n(null)} belum ada bukti` : 'Memuat…'}
          </p>
        </div>
        <input className="select-filter w-64" placeholder="Cari no. polisi / nama / merek…" value={cari} onChange={e => setCari(e.target.value)} />
      </div>
      <PesanError pesan={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="table-th">Kendaraan</th><th className="table-th">No. Polisi</th>
            <th className="table-th">Status</th><th className="table-th">Tanggal bayar & bukti</th>
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-8">Memuat…</td></tr>}
            {data && rows.length === 0 && <tr><td colSpan={4} className="table-td text-center text-gray-400 py-8">Tak ada kendaraan bermotor.</td></tr>}
            {rows.map(k => (
              <BarisKendaraan key={k.aset_id} k={k} tahun={tahun} skpdId={skpd.skpd_id} readOnly={readOnly} onBerubah={() => setMuatKe(x => x + 1)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BarisKendaraan({ k, tahun, skpdId, readOnly, onBerubah }: { k: KendaraanPajak; tahun: number; skpdId: number; readOnly: boolean; onBerubah: () => void }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [tanggal, setTanggal] = useState(k.tanggal_bayar ?? '')
  const [busy, setBusy] = useState(false)
  const beku = k.status === 'diverifikasi'

  async function unggahDanSimpan(files: FileList | null) {
    if (!files?.length) return
    if (!tanggal) { await konfirmasiGagal(konfirmasi, 'Isi tanggal pembayaran pajak dulu, baru unggah buktinya.', 'Tanggal belum diisi'); return }
    if (tanggal > HARI_INI) { await konfirmasiGagal(konfirmasi, 'Tanggal pembayaran tidak boleh di masa depan.', 'Tanggal tidak sah'); return }
    setBusy(true)
    try {
      const baru = await unggahBukti(supabase, `pajak/${skpdId}/${k.aset_id}`, files)
      await simpanPajak(supabase, {
        pajak_id: k.pajak_id, tahun, aset_id: k.aset_id, skpd_id: skpdId, tanggal_bayar: tanggal,
        // Bukti ditolak diganti (bukan ditumpuk) supaya verifikator melihat yang terbaru saja.
        bukti_paths: k.status === 'ditolak' ? baru : [...(k.bukti_paths ?? []), ...baru],
      })
      onBerubah()
    } catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <tr className="border-t border-gray-50 align-top">
      <td className="table-td">
        <p className="font-medium text-gray-800">{k.nama_barang || k.uraian_barang}</p>
        <p className="text-xs text-gray-500">{k.merek_tipe || '-'} · {k.nibar}</p>
      </td>
      <td className="table-td whitespace-nowrap">{k.no_polisi || <span className="text-amber-600 text-xs">belum ada</span>}</td>
      <td className="table-td">
        <StatusPill s={k.status} />
        {k.status === 'ditolak' && k.catatan_verifikator && <p className="text-xs text-red-600 mt-1">{k.catatan_verifikator}</p>}
      </td>
      <td className="table-td">
        {beku || readOnly ? (
          k.tanggal_bayar || (k.bukti_paths?.length ?? 0) > 0
            ? <div className="text-xs text-gray-600">Dibayar {k.tanggal_bayar ?? '-'} <BuktiLinks paths={k.bukti_paths} /></div>
            : <span className="text-xs text-gray-400">Belum ada bukti.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="select-filter py-1 text-xs" value={tanggal} max={HARI_INI} onChange={e => setTanggal(e.target.value)} />
            <label className={`inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
              📎 {busy ? 'Mengunggah…' : k.pajak_id ? 'Ganti / tambah bukti' : 'Unggah bukti'}
              <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
                onChange={e => { void unggahDanSimpan(e.target.files); e.target.value = '' }} />
            </label>
            {k.bukti_paths && k.bukti_paths.length > 0 && <BuktiLinks paths={k.bukti_paths} />}
          </div>
        )}
      </td>
    </tr>
  )
}
