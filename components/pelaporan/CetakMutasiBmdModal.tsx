'use client'
import { ingatanCetak, kunciTtdMutasiBmd } from '@/lib/ingatanCetak'
// Pop-up "Cetak Format IV.L.4.1 / IV.L.4.3" — menanyakan penanda tangan &
// tanggal, lalu menyerahkan konfignya ke halaman induk yang memicu cetak.
//
// Dipisah dari lembarnya supaya lembar (LembarMutasiBmd) tetap murni tampilan
// & bisa diuji/dilihat tanpa state pop-up.
//
// ⚠️ Calon penanda tangan diambil BEDA per lingkup, dan itu disengaja:
//   · per-SKPD  → `fetchCalonTtd` (menangani sub-unit & kepala rangkap; query
//     `.eq('skpd_id')` polos membuat lembar UPTD/Bidang nyaris selalu kosong —
//     dari 816 SKPD hanya 57 punya pegawai berjabatan "Kepala").
//   · se-pemda  → SELURUH `admin_pegawai`, sebab peran
//     `penatausahaan_barang_pengelola` NOL BARIS di basis data (diverifikasi
//     2026-08-26) sehingga tebakan apa pun pasti meleset.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import type { PenandaTangan } from './LembarMutasiBmd'

const ROLE_KIRI = 'pengelola_barang'
const ROLE_KANAN = 'penatausahaan_barang_pengelola'

type Pegawai = { id: string; nama: string; nip: string | null; jabatan: string | null; role_bmd: string | null }

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** Preferensi tampilan, bukan gerbang wewenang — disimpan supaya cetak ulang
 *  menghasilkan lembar yang SAMA (lembar ini diteken lalu dipindai). */
const ingatan = (skpdId: number | null) => ingatanCetak<Tersimpan>(kunciTtdMutasiBmd(skpdId))
type Tersimpan = { ttd?: string; kiri?: string; tgl?: string }
const baca = (skpdId: number | null): Tersimpan | null => ingatan(skpdId).baca()

export default function CetakMutasiBmdModal({ skpdId, onClose, onCetak }: {
  /** null = lembar se-pemda (IV.L.4.3). */
  skpdId: number | null
  onClose: () => void
  onCetak: (v: { ttd: PenandaTangan; ttdKiri: PenandaTangan; tanggal: string }) => void
}) {
  const supabase = createClient()
  const perSkpd = skpdId != null

  const [siap, setSiap] = useState(false)
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [ttdId, setTtdId] = useState('')
  const [kiriId, setKiriId] = useState('')
  const [tgl, setTgl] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      const simpan = baca(skpdId)
      try {
        if (perSkpd) {
          const semua: (SkpdNode & Record<string, unknown>)[] = []
          for (let from = 0; ; from += 1000) {
            const { data } = await supabase.from('admin_skpd')
              .select('id,nama,parent_id').range(from, from + 999)
            if (!data || data.length === 0) break
            semua.push(...(data as typeof semua))
            if (data.length < 1000) break
          }
          const byId = new Map<number, SkpdNode>(
            semua.map(x => [x.id as number, { id: x.id as number, nama: x.nama as string, parent_id: (x.parent_id ?? null) as number | null }]))
          const daftar = await fetchCalonTtd(supabase, skpdId, byId)
          setCalon(daftar)
          setTtdId(simpan?.ttd || calonTtdAwal(daftar)?.id || '')
        } else {
          const { data } = await supabase.from('admin_pegawai')
            .select('id,nama,nip,jabatan,role_bmd').order('nama').limit(2000)
          const daftar = (data || []) as Pegawai[]
          setPegawai(daftar)
          setTtdId(simpan?.ttd || daftar.find(p => p.role_bmd === ROLE_KANAN)?.id || '')
          setKiriId(simpan?.kiri || daftar.find(p => p.role_bmd === ROLE_KIRI)?.id || '')
        }
      } catch {
        // Gagal memuat calon TIDAK menjatuhkan pop-up — operator tetap bisa
        // mencetak, blok tanda tangannya saja yang bertitik-titik.
        setCalon([]); setPegawai([])
      }
      setTgl(simpan?.tgl || todayStr())
      setSiap(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function cetak() {
    const cariCalon = (id: string): PenandaTangan => {
      const c = calon.find(x => x.id === id)
      return c ? { nama: c.nama, nip: c.nip } : null
    }
    const cariPegawai = (id: string): PenandaTangan => {
      const p = pegawai.find(x => x.id === id)
      return p ? { nama: p.nama, nip: p.nip } : null
    }
    try {
      ingatan(skpdId).simpan({ ttd: ttdId, kiri: kiriId, tgl })
    } catch { /* mode privat — abaikan */ }
    onCetak({
      ttd: perSkpd ? cariCalon(ttdId) : cariPegawai(ttdId),
      ttdKiri: perSkpd ? null : cariPegawai(kiriId),
      tanggal: tgl,
    })
  }

  const opsiPegawai = (role: string) => (
    <>
      <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
      {pegawai.map(p => (
        <option key={p.id} value={p.id}>
          {p.nama}{p.jabatan ? ` — ${p.jabatan}` : ''}{p.role_bmd === role ? ' ✓' : ''}
        </option>
      ))}
    </>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            Cetak Format {perSkpd ? 'IV.L.4.1' : 'IV.L.4.3'} — Rekapitulasi Mutasi
          </h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {!siap ? (
            <p className="text-sm text-gray-400">Memuat calon penanda tangan…</p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
                <input type="date" className="select-filter w-full sm:w-56" value={tgl}
                  onChange={e => setTgl(e.target.value)} />
              </div>

              {!perSkpd && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pengelola Barang <span className="text-gray-400">(blok kiri &quot;Mengetahui&quot;)</span></label>
                  <select className="select-filter w-full" value={kiriId} onChange={e => setKiriId(e.target.value)}>
                    {opsiPegawai(ROLE_KIRI)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {perSkpd ? 'Penanda tangan' : 'Pejabat Penatausahaan Barang'}
                </label>
                {perSkpd ? (
                  <select className="select-filter w-full" value={ttdId} onChange={e => setTtdId(e.target.value)}>
                    <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
                    {calon.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nama}{c.jabatan ? ` — ${c.jabatan}` : ''}{labelAsalTtd(c)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select className="select-filter w-full" value={ttdId} onChange={e => setTtdId(e.target.value)}>
                    {opsiPegawai(ROLE_KANAN)}
                  </select>
                )}
              </div>

              {/* Header/footer bawaan peramban tak bisa dihapus lewat CSS —
                  petunjuknya ditaruh persis di sebelah tombol Cetak. */}
              <p className="text-xs text-gray-400">
                Di dialog Print, hilangkan centang <b>&quot;Headers and footers&quot;</b> supaya tanggal &amp;
                alamat halaman tidak ikut tercetak di tepi lembar.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose}>Batal</button>
          <button className="btn-primary text-sm" onClick={cetak} disabled={!siap}>🖨 Cetak</button>
        </div>
      </div>
    </div>
  )
}
