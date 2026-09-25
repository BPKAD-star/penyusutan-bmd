'use client'
// Verifikasi capaian IPA oleh Pengelola Barang (Admin Pemda). Isian SKPD baru
// ikut dihitung sesudah diverifikasi di sini.
//
// Sesudah verifikasi rekon/pajak, snapshot otomatis SKPD yang bersangkutan
// dihitung ulang (dua indikator itu dihitung fungsi otomatis dari isian yang
// terverifikasi) — kalau tidak, dashboard baru berubah pada hitung ulang
// berikutnya dan verifikator mengira aksinya tak berpengaruh.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useProfilRole } from '@/components/useProfilRole'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import {
  hitungUlangOtomatis, muatAntrianPajak, muatIsian, muatPelaksanaanRekon, muatPeriodeRekon, muatReferensi,
  verifikasi, type AntrianPajak, type Isian, type PelaksanaanRekon, type PeriodeRekon, type Referensi, type TabelIsian,
} from '@/lib/ipaData'
import { BuktiLinks, PesanError, PilihTahunBulan, TAHUN_INI, fmtAngka } from '@/components/ipa/ipaUi'

type Muatan = {
  ref: Referensi; isian: Isian[]; periode: PeriodeRekon[]; rekon: PelaksanaanRekon[]; pajak: AntrianPajak[]
}
type Tab = 'isian' | 'rekon' | 'pajak'

export default function VerifikasiIpa() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { role } = useProfilRole()
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [tab, setTab] = useState<Tab>('isian')
  const [muatKe, setMuatKe] = useState(0)
  const [pilih, setPilih] = useState<Set<string>>(new Set())
  const { data, error, loading, run } = useAsyncData<Muatan>()

  useEffect(() => {
    void run(async () => {
      const [ref, isian, periode, pajak] = await Promise.all([
        muatReferensi(supabase), muatIsian(supabase, tahun, { status: 'diajukan' }),
        muatPeriodeRekon(supabase, tahun), muatAntrianPajak(supabase, tahun, 'diajukan'),
      ])
      const rekon = await muatPelaksanaanRekon(supabase, periode.map(p => p.id), { status: 'diajukan' })
      return { ref, isian, periode, rekon, pajak }
    })
    setPilih(new Set())
  }, [tahun, muatKe, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const nama = useMemo(() => new Map((data?.ref.skpd ?? []).map(s => [s.skpd_id, s.nama])), [data])
  const namaInd = useMemo(() => new Map((data?.ref.indikator ?? []).map(i => [i.kode, i.nama])), [data])

  if (role && role !== 'admin') {
    return <div className="p-6"><div className="card p-6 text-sm text-gray-600">Verifikasi capaian IPA hanya untuk Pengelola Barang (Admin Pemda).</div></div>
  }

  async function putuskan(tabel: TabelIsian, ids: string[], skpdIds: number[], status: 'diverifikasi' | 'ditolak') {
    if (ids.length === 0) return
    try {
      const hasil = await konfirmasi({
        judul: status === 'diverifikasi' ? `Verifikasi ${ids.length} isian?` : `Tolak ${ids.length} isian?`,
        nada: status === 'diverifikasi' ? 'teal' : 'merah',
        labelYa: status === 'diverifikasi' ? 'Verifikasi' : 'Tolak',
        isi: status === 'diverifikasi'
          ? 'Isian yang diverifikasi langsung ikut dihitung dalam IPA dan tidak bisa diubah SKPD lagi.'
          : 'SKPD akan melihat catatan ini dan bisa memperbaiki isiannya.',
        catatan: status === 'ditolak'
          ? { label: 'Alasan penolakan (wajib)', petunjuk: 'Dibaca SKPD — jelaskan apa yang harus diperbaiki.' }
          : undefined,
        kerjakan: async (c: string) => {
          if (status === 'ditolak' && !c.trim()) throw new Error('Alasan penolakan wajib diisi.')
          await verifikasi(supabase, tabel, ids, status, c.trim() || null)
          if (tabel !== 'ipa_isian') {
            for (const s of [...new Set(skpdIds)]) await hitungUlangOtomatis(supabase, tahun, s)
          }
        },
      })
      if (hasil.ya) setMuatKe(k => k + 1)
    } catch (e) { await konfirmasiGagal(konfirmasi, (e as Error).message, 'Gagal memproses') }
  }

  const toggle = (id: string) => setPilih(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const jumlah = { isian: data?.isian.length ?? 0, rekon: data?.rekon.length ?? 0, pajak: data?.pajak.length ?? 0 }
  const periodeNama = (id: string) => data?.periode.find(p => p.id === id)

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verifikasi Capaian IPA</h1>
          <p className="text-gray-500 text-sm mt-1">Antrean isian SKPD yang menunggu verifikasi Pengelola Barang.</p>
        </div>
        <PilihTahunBulan tahun={tahun} onTahun={setTahun} />
      </div>
      <PesanError pesan={error} />
      <div className="mb-4 flex gap-2">
        {([['isian', 'TL BPK / Inspektorat'], ['rekon', 'Rekonsiliasi'], ['pajak', 'Pajak Kendaraan']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setPilih(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-teal text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {l} <span className="ml-1 text-xs opacity-80">({jumlah[k]})</span>
          </button>
        ))}
      </div>
      {loading && !data && <p className="text-sm text-gray-400">Memuat…</p>}

      {data && tab === 'isian' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="table-th">SKPD</th><th className="table-th">Indikator</th><th className="table-th">Tanggal</th>
              <th className="table-th">Capaian</th><th className="table-th">Bukti</th><th className="table-th" />
            </tr></thead>
            <tbody>
              {data.isian.length === 0 && <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">Tak ada antrean.</td></tr>}
              {data.isian.map(i => (
                <tr key={i.id} className="border-t border-gray-50 align-top">
                  <td className="table-td">{nama.get(i.skpd_id)}</td>
                  <td className="table-td">{namaInd.get(i.indikator)}</td>
                  <td className="table-td whitespace-nowrap">{i.tanggal_capaian}</td>
                  <td className="table-td">
                    {i.tidak_ada ? 'Tidak ada temuan (N/A)' : `${fmtAngka(i.pembilang!)} / ${fmtAngka(i.penyebut!)} selesai`}
                    {i.catatan && <p className="text-xs text-gray-500">{i.catatan}</p>}
                  </td>
                  <td className="table-td"><BuktiLinks paths={i.bukti_paths} /></td>
                  <td className="table-td whitespace-nowrap text-right space-x-2">
                    <button className="text-xs text-emerald-700 font-medium hover:underline" onClick={() => putuskan('ipa_isian', [i.id], [i.skpd_id], 'diverifikasi')}>Verifikasi</button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => putuskan('ipa_isian', [i.id], [i.skpd_id], 'ditolak')}>Tolak</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'rekon' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="table-th">SKPD</th><th className="table-th">Periode</th><th className="table-th">Batas</th>
              <th className="table-th">Dilaksanakan</th><th className="table-th">BA Rekon</th><th className="table-th" />
            </tr></thead>
            <tbody>
              {data.rekon.length === 0 && <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">Tak ada antrean.</td></tr>}
              {data.rekon.map(r => {
                const p = periodeNama(r.periode_id)
                const telat = p && r.tanggal_pelaksanaan > p.batas_tanggal
                return (
                  <tr key={r.id} className="border-t border-gray-50 align-top">
                    <td className="table-td">{nama.get(r.skpd_id)}</td>
                    <td className="table-td">{p?.nama}</td>
                    <td className="table-td whitespace-nowrap">{p?.batas_tanggal}</td>
                    <td className={`table-td whitespace-nowrap ${telat ? 'text-amber-700' : ''}`}>{r.tanggal_pelaksanaan}{telat && ' (terlambat)'}</td>
                    <td className="table-td"><BuktiLinks paths={r.bukti_paths} /></td>
                    <td className="table-td whitespace-nowrap text-right space-x-2">
                      <button className="text-xs text-emerald-700 font-medium hover:underline" onClick={() => putuskan('ipa_rekon_pelaksanaan', [r.id], [r.skpd_id], 'diverifikasi')}>Verifikasi</button>
                      <button className="text-xs text-red-600 hover:underline" onClick={() => putuskan('ipa_rekon_pelaksanaan', [r.id], [r.skpd_id], 'ditolak')}>Tolak</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'pajak' && (
        <div className="card overflow-x-auto">
          <div className="p-3 flex items-center gap-2 border-b border-gray-100">
            <span className="text-xs text-gray-500">{pilih.size} dicentang</span>
            <button className="btn-primary py-1.5 text-xs disabled:opacity-50" disabled={pilih.size === 0}
              onClick={() => putuskan('ipa_pajak_kendaraan', [...pilih], data.pajak.filter(p => pilih.has(p.id)).map(p => p.skpd_id), 'diverifikasi')}>
              Verifikasi yang dicentang
            </button>
            <button className="btn-secondary py-1.5 text-xs text-red-600 disabled:opacity-50" disabled={pilih.size === 0}
              onClick={() => putuskan('ipa_pajak_kendaraan', [...pilih], data.pajak.filter(p => pilih.has(p.id)).map(p => p.skpd_id), 'ditolak')}>
              Tolak yang dicentang
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="table-th w-8">
                <input type="checkbox" checked={data.pajak.length > 0 && pilih.size === data.pajak.length}
                  onChange={e => setPilih(e.target.checked ? new Set(data.pajak.map(p => p.id)) : new Set())} />
              </th>
              <th className="table-th">SKPD</th><th className="table-th">Kendaraan</th><th className="table-th">No. Polisi</th>
              <th className="table-th">Tgl bayar</th><th className="table-th">Bukti</th>
            </tr></thead>
            <tbody>
              {data.pajak.length === 0 && <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">Tak ada antrean.</td></tr>}
              {data.pajak.map(p => (
                <tr key={p.id} className="border-t border-gray-50 align-top">
                  <td className="table-td"><input type="checkbox" checked={pilih.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="table-td">{nama.get(p.skpd_id)}</td>
                  <td className="table-td">{p.aset?.nama_barang}<p className="text-xs text-gray-500">{p.aset?.merek_tipe} · {p.aset?.nibar}</p></td>
                  <td className="table-td whitespace-nowrap">{p.aset?.no_polisi || '-'}</td>
                  <td className="table-td whitespace-nowrap">{p.tanggal_bayar}</td>
                  <td className="table-td"><BuktiLinks paths={p.bukti_paths} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
