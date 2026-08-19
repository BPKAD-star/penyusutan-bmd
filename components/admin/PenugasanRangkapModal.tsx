'use client'
// Modal kelola "Penugasan Rangkap" utk seorang Pengguna Barang — mencatat bahwa
// orang yg sama merangkap sbg Pengguna Barang di SKPD LAIN (selain SKPD pokoknya
// di admin_pegawai). MURNI PENCATATAN: tabel admin_pegawai_penugasan, tanpa
// approval & tanpa efek ke akun/akses (lihat migrasi 20260724_01). Hanya admin
// yang bisa menulis (ditegakkan RLS); komponen ini dipakai dari Daftar Pegawai.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

export type PegawaiRingkas = {
  id: string
  nama: string
  nip: string | null
  skpd_id: number | null
  skpd_nama: string | null
}

export type PenugasanRangkap = {
  id: string
  pegawai_id: string
  skpd_id: number
  no_sk: string | null
  tmt: string | null
  aktif: boolean
  skpd: { nama: string } | null
}

export default function PenugasanRangkapModal({ pegawai, onClose, onChanged }: {
  pegawai: PegawaiRingkas
  onClose: () => void
  onChanged: () => void // dipanggil setelah ada perubahan, supaya list induk reload
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [rows, setRows] = useState<PenugasanRangkap[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Form tambah
  const [skpdId, setSkpdId] = useState('')
  const [noSk, setNoSk] = useState('')
  const [tmt, setTmt] = useState('')

  async function load() {
    const { data } = await supabase
      .from('admin_pegawai_penugasan')
      .select('id,pegawai_id,skpd_id,no_sk,tmt,aktif,skpd:admin_skpd(nama)')
      .eq('pegawai_id', pegawai.id)
      .order('created_at')
    setRows((data as never as PenugasanRangkap[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setClosing(true)
    setTimeout(onClose, 160)
  }

  async function tambah(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    if (!skpdId) { setMsg('Pilih SKPD dulu.'); return }
    const idNum = Number(skpdId)
    if (idNum === pegawai.skpd_id) { setMsg('SKPD rangkap tidak boleh sama dengan SKPD pokok pegawai.'); return }
    if (rows.some(r => r.skpd_id === idNum)) { setMsg('SKPD ini sudah dirangkap.'); return }

    setSaving(true)
    const { error } = await supabase.from('admin_pegawai_penugasan').insert({
      pegawai_id: pegawai.id,
      skpd_id: idNum,
      role_bmd: 'pengguna_barang',
      no_sk: noSk.trim() || null,
      tmt: tmt || null,
    })
    if (error) {
      // 23505 = unique_violation (rangkap ganda di SKPD sama, kalau lolos cek client)
      setMsg(error.code === '23505'
        ? 'SKPD ini sudah dirangkap oleh pegawai tersebut.'
        : `Error: ${error.message}`)
    } else {
      setSkpdId(''); setNoSk(''); setTmt('')
      await load()
      onChanged()
    }
    setSaving(false)
  }

  async function toggleAktif(r: PenugasanRangkap) {
    setMsg('')
    const { error } = await supabase.from('admin_pegawai_penugasan')
      .update({ aktif: !r.aktif }).eq('id', r.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    await load(); onChanged()
  }

  async function hapus(r: PenugasanRangkap) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus penugasan rangkap ini?',
      subjudul: r.skpd?.nama || `SKPD #${r.skpd_id}`,
      // Penugasan rangkap dibaca `fetchCalonTtd` (lib/penandaTangan.ts) untuk
      // menyusun calon penanda tangan lembar per-SKPD — akibat yang tak terlihat
      // dari layar ini.
      isi: <>Pejabat ini tak lagi muncul sebagai calon <b>penanda tangan Plt.</b> untuk SKPD tersebut
        maupun unit-unit di bawahnya.</>,
      labelYa: 'Hapus penugasan',
    })).ya) return
    setMsg('')
    const { error } = await supabase.from('admin_pegawai_penugasan').delete().eq('id', r.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    await load(); onChanged()
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
      onClick={close}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto ${closing ? 'animate-bubble-out' : 'animate-bubble-in'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Penugasan Rangkap — Pengguna Barang</h2>
            <p className="text-xs text-gray-500 mt-0.5">{pegawai.nama} · {pegawai.nip || 'Non-ASN'}</p>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs text-gray-500">
            SKPD pokok: <b>{pegawai.skpd_nama || '—'}</b>. Tambahkan SKPD LAIN tempat orang ini
            juga menjabat Pengguna Barang. Bersifat pencatatan — tidak mengubah akun/akses.
          </p>

          {msg && (
            <div className={`p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{msg}</div>
          )}

          {/* Daftar rangkap saat ini */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th whitespace-nowrap">SKPD Rangkap</th>
                  <th className="table-th whitespace-nowrap">No. SK</th>
                  <th className="table-th whitespace-nowrap">TMT</th>
                  <th className="table-th whitespace-nowrap">Status</th>
                  <th className="table-th whitespace-nowrap">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={5} className="table-td text-center py-6 text-gray-400">Memuat...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="table-td text-center py-6 text-gray-400">Belum ada penugasan rangkap.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id}>
                    <td className="table-td whitespace-nowrap text-sm">{r.skpd?.nama || `SKPD #${r.skpd_id}`}</td>
                    <td className="table-td whitespace-nowrap text-xs text-gray-500">{r.no_sk || '—'}</td>
                    <td className="table-td whitespace-nowrap text-xs text-gray-500">{r.tmt || '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      <button onClick={() => toggleAktif(r)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.aktif ? 'bg-teal/10 text-teal' : 'bg-gray-100 text-gray-500'}`}
                        title="Klik utk ubah status">
                        {r.aktif ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <button onClick={() => hapus(r)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Form tambah */}
          <form onSubmit={tambah} className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700">Tambah Penugasan Rangkap</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKPD (selain SKPD pokok)</label>
              <SkpdCombobox value={skpdId} onChange={setSkpdId}
                placeholder="Ketik nama SKPD tempat merangkap..." allowClear />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. SK <span className="text-gray-400">(opsional)</span></label>
                <input className="select-filter w-full" value={noSk}
                  onChange={e => setNoSk(e.target.value)} placeholder="No. SK penunjukan" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TMT <span className="text-gray-400">(opsional)</span></label>
                <input type="date" className="select-filter w-full" value={tmt}
                  onChange={e => setTmt(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan...' : '+ Tambah Rangkap'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
