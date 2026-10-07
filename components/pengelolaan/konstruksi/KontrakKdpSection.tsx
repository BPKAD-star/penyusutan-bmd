'use client'
// KONTRAK di dalam satu kartu paket Pekerjaan Konstruksi (2026-10-07).
// Tampilan utamanya kini di BAWAH tiap barang (Kartu → Barang → Kontrak → BAST,
// permintaan user 2026-10-08) lewat `KontrakModal`; tabel `KontrakKdpSection`
// cuma dipakai kalau kartu belum punya barang tapi sudah punya kontrak.
// Satu kartu bisa memuat beberapa kontrak — perencanaan, fisik, pengawasan,
// biaya umum, juga addendum / dua konsultan untuk komponen yang sama — dan tiap
// termin menunjuk SATU kontrak. Kontrak yang sudah dipakai termin disetujui BEKU
// (nomor & tanggalnya sudah dibekukan di ledger); penegaknya trigger
// fn_kdp_kartu_guard, tombol di sini cuma mencerminkannya.
import { useState } from 'react'
import { formatRupiah2 } from '@/lib/export'
import NominalInput from '@/shared/ui/NominalInput'
import SearchSelect from '@/components/SearchSelect'
import { usePegawaiSkpd, pegawaiOptions } from '@/components/usePegawaiSkpd'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { BENTUK_KONTRAK_KONSTRUKSI, bentukKontrakLabel } from '@/lib/bentukKontrak'
import {
  KOMPONEN_KDP, komponenLabelKdp, pemakaianKontrak, cekUbahTglKontrak, newIdKdp,
  type KontrakKdp, type KomponenKdp, type KontrakKonstruksiPayload,
} from '@/lib/kdp'

export function KontrakKdpSection({ payload, tahunKartu, skpdId, bolehUbah, onSimpan, onHapus }: {
  payload: KontrakKonstruksiPayload; tahunKartu: string; skpdId: number; bolehUbah: boolean
  onSimpan: (k: KontrakKdp) => Promise<void>; onHapus: (k: KontrakKdp) => Promise<void>
}) {
  const kontrak = payload.kontrak || []
  const [edit, setEdit] = useState<KontrakKdp | 'baru' | null>(null)
  return (
    <div className="border-t border-gray-100">
      <div className="px-5 py-2.5 bg-gray-50/60 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Kontrak ({kontrak.length})</p>
        {bolehUbah && <button className="inline-flex items-center rounded-lg border border-teal/30 bg-teal/10 hover:bg-teal/20 text-teal text-xs font-medium px-3 py-1" onClick={() => setEdit('baru')}>+ Tambah Kontrak</button>}
      </div>
      {kontrak.length === 0 ? (
        <p className="px-5 py-3 text-xs text-gray-400">
          Belum ada kontrak. Tambahkan kontrak tiap komponen (perencanaan, fisik, pengawasan) — termin dibayar atas kontraknya.
          Biaya umum boleh tanpa kontrak.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <th className="table-th">Komponen</th><th className="table-th">Nomor &amp; Tgl Kontrak</th><th className="table-th">Penyedia</th>
              <th className="table-th">PPK</th><th className="table-th text-right">Nilai Kontrak</th><th className="table-th">Dipakai</th><th className="table-th"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {kontrak.map(k => {
                const pakai = pemakaianKontrak(payload, k.id)
                return (
                  <tr key={k.id}>
                    <td className="table-td text-xs align-top">{komponenLabelKdp(k.komponen)}
                      {k.bentuk && <span className="block text-gray-400">{bentukKontrakLabel(k.bentuk)}</span>}</td>
                    <td className="table-td text-xs align-top">{k.no_kontrak}<span className="block text-gray-400">{k.tgl_kontrak}</span></td>
                    <td className="table-td text-xs align-top">{k.penyedia || '—'}</td>
                    <td className="table-td text-xs align-top">{k.ppk || '—'}</td>
                    <td className="table-td text-xs text-right align-top">{k.nilai_kontrak ? formatRupiah2(k.nilai_kontrak) : '—'}</td>
                    <td className="table-td text-xs align-top text-gray-500">
                      {pakai.disetujui + pakai.menunggu === 0 ? '—' : `${pakai.disetujui} disetujui · ${pakai.menunggu} menunggu`}
                    </td>
                    <td className="table-td text-right whitespace-nowrap align-top">
                      {bolehUbah && pakai.disetujui === 0 && (
                        <button className="text-xs text-teal hover:underline mr-3" onClick={() => setEdit(k)}>Ubah</button>
                      )}
                      {bolehUbah && pakai.disetujui + pakai.menunggu === 0 && (
                        <button className="text-xs text-red-500 hover:text-red-700" onClick={() => onHapus(k)}>Hapus</button>
                      )}
                      {pakai.disetujui > 0 && <span className="text-[11px] text-gray-400" title="Dipakai termin yang sudah disetujui — batalkan termin itu dulu untuk mengubah">🔒</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <KontrakModal awal={edit === 'baru' ? null : edit} payload={payload} tahunKartu={tahunKartu} skpdId={skpdId}
          onClose={() => setEdit(null)}
          onSimpan={async k => { await onSimpan(k); setEdit(null) }} />
      )}
    </div>
  )
}

export function KontrakModal({ awal, komponenAwal, payload, tahunKartu, skpdId, onClose, onSimpan }: {
  awal: KontrakKdp | null; komponenAwal?: KomponenKdp; payload: KontrakKonstruksiPayload; tahunKartu: string; skpdId: number
  onClose: () => void; onSimpan: (k: KontrakKdp) => Promise<void>
}) {
  const bounds = useDateBounds()
  const pegawai = usePegawaiSkpd(skpdId)
  const [komponen, setKomponen] = useState<KomponenKdp>(awal?.komponen || komponenAwal || 'fisik')
  const [bentuk, setBentuk] = useState(awal?.bentuk || 'spk')
  const [no, setNo] = useState(awal?.no_kontrak || '')
  const [tgl, setTgl] = useState(awal?.tgl_kontrak || '')
  const [penyedia, setPenyedia] = useState(awal?.penyedia || '')
  const [ppk, setPpk] = useState(awal?.ppk || '')
  const [nilai, setNilai] = useState(awal?.nilai_kontrak != null ? String(awal.nilai_kontrak) : '')
  const [ket, setKet] = useState(awal?.keterangan || '')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  // Komponen terkunci kalau kontrak sudah dipakai termin (termin menunjuk
  // komponennya sendiri; mengganti komponen kontrak akan memutus pasangannya).
  const dipakai = awal ? pemakaianKontrak(payload, awal.id).menunggu > 0 : false

  async function simpan() {
    if (!no.trim()) { setErr('Nomor kontrak wajib diisi.'); return }
    const salah = awal ? cekUbahTglKontrak(payload, awal.id, tgl, tahunKartu)
      : (!tgl ? 'Tanggal kontrak wajib diisi.' : tgl.slice(0, 4) > tahunKartu ? `Tgl kontrak melewati tahun kartu (${tahunKartu}).` : null)
    if (salah) { setErr(salah); return }
    setErr(''); setSaving(true)
    try {
      await onSimpan({
        id: awal?.id || newIdKdp(), komponen, bentuk, no_kontrak: no.trim(), tgl_kontrak: tgl,
        penyedia: penyedia.trim() || null, ppk: ppk || null, nilai_kontrak: nilai ? Number(nilai) : null,
        keterangan: ket.trim() || null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{awal ? 'Ubah Kontrak' : 'Tambah Kontrak'}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">Komponen</label>
            <select className="select-filter w-full" value={komponen} disabled={dipakai} onChange={e => setKomponen(e.target.value as KomponenKdp)}>
              {KOMPONEN_KDP.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {dipakai && <p className="text-[11px] text-gray-400 mt-1">Komponen terkunci — kontrak ini sudah dipakai termin.</p>}</div>
          <div><label className="block text-xs text-gray-500 mb-1">Bentuk Kontrak (Dokumen Sumber)</label>
            <select className="select-filter w-full" value={bentuk} onChange={e => setBentuk(e.target.value)}>
              {BENTUK_KONTRAK_KONSTRUKSI.map(v => <option key={v} value={v}>{bentukKontrakLabel(v)}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">No. Kontrak</label>
            <input className="select-filter w-full" value={no} onChange={e => setNo(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Tgl Kontrak <span className="text-gray-400">(BAST termin tak boleh lebih tua dari ini)</span></label>
            <input type="date" className="select-filter w-full sm:w-64" max={bounds.max} value={tgl} onChange={e => setTgl(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nama Penyedia</label>
            <input className="select-filter w-full" value={penyedia} onChange={e => setPenyedia(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nama PPK (Pejabat Pembuat Komitmen)</label>
            <SearchSelect value={ppk} options={pegawaiOptions(pegawai)} placeholder="ketik untuk mencari pegawai..." onChange={setPpk} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nilai Kontrak (Rp)</label>
            <NominalInput className="select-filter w-full" value={nilai} onChange={setNilai} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}
