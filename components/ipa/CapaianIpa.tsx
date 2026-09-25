'use client'
// Capaian SKPD — tempat SKPD INDUK mengisi indikator yang tak bisa ditarik dari
// data aplikasi: TL BPK, TL Inspektorat, pelaksanaan rekonsiliasi, & bukti
// pajak kendaraan. Semua isian masuk antrean VERIFIKASI Pengelola Barang dan
// baru ikut dihitung sesudah diverifikasi.
//
// Capaian dicatat BERTANGGAL & bisa ditambah kapan saja sepanjang tahun
// (keputusan user: "per tahun, tapi bisa berkala setiap bulan") — tiap isian
// baru adalah baris baru, bukan menimpa yang lama.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfilRole } from '@/components/useProfilRole'
import { muatReferensi, skpdBolehIsi, type Referensi, type SkpdIpa } from '@/lib/ipaData'
import { PesanError, PilihTahunBulan, TAHUN_INI } from '@/components/ipa/ipaUi'
import CapaianTl from '@/components/ipa/CapaianTl'
import CapaianRekon from '@/components/ipa/CapaianRekon'
import CapaianPajak from '@/components/ipa/CapaianPajak'

type Tab = 'AKT_TLBPK' | 'AKT_TLINSP' | 'rekon' | 'pajak'
const TAB: { k: Tab; label: string }[] = [
  { k: 'AKT_TLBPK', label: 'TL Temuan BPK' },
  { k: 'AKT_TLINSP', label: 'TL Temuan Inspektorat' },
  { k: 'rekon', label: 'Rekonsiliasi BMD' },
  { k: 'pajak', label: 'Pajak Kendaraan' },
]

export default function CapaianIpa() {
  const supabase = createClient()
  const params = useSearchParams()
  const { role } = useProfilRole()
  const [ref, setRef] = useState<Referensi | null>(null)
  const [boleh, setBoleh] = useState<SkpdIpa[] | null>(null)
  const [err, setErr] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [tab, setTab] = useState<Tab>('AKT_TLBPK')

  useEffect(() => {
    if (role == null) return
    let alive = true
    void (async () => {
      try {
        const r = await muatReferensi(supabase)
        const b = await skpdBolehIsi(supabase, r.skpd, role)
        if (!alive) return
        setRef(r); setBoleh(b)
        const diminta = Number(params.get('skpd'))
        setSkpdId(b.some(s => s.skpd_id === diminta) ? diminta : (b[0]?.skpd_id ?? null))
      } catch (e) { if (alive) setErr((e as Error).message) }
    })()
    return () => { alive = false }
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  const skpd = useMemo(() => boleh?.find(s => s.skpd_id === skpdId) ?? null, [boleh, skpdId])
  const indikator = ref?.indikator.find(i => i.kode === tab)

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capaian IPA SKPD</h1>
          <p className="text-gray-500 text-sm mt-1">
            Isian yang tak bisa ditarik otomatis. Diisi pengurus barang SKPD induk, dihitung setelah diverifikasi Pengelola Barang.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {boleh && boleh.length > 1 && (
            <label className="text-xs text-gray-500">
              SKPD
              <select className="select-filter block mt-1 w-80" value={skpdId ?? ''} onChange={e => setSkpdId(Number(e.target.value))}>
                {boleh.map(s => <option key={s.skpd_id} value={s.skpd_id}>{s.nama}</option>)}
              </select>
            </label>
          )}
          <PilihTahunBulan tahun={tahun} onTahun={setTahun} />
        </div>
      </div>

      <PesanError pesan={err} />
      {boleh && boleh.length === 0 && (
        <div className="card p-6 text-sm text-gray-600">
          {role === 'pengawas'
            ? 'Akun pengawas hanya bisa melihat penilaian, tidak mengisi capaian.'
            : 'Capaian IPA diisi oleh pengurus barang SKPD INDUK. Akun Anda tidak terdaftar pada SKPD induk mana pun.'}
        </div>
      )}

      {skpd && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {boleh!.length === 1 && <span className="text-sm font-semibold text-gray-800 mr-2">{skpd.nama}</span>}
            {TAB.map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.k ? 'bg-teal text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {(tab === 'AKT_TLBPK' || tab === 'AKT_TLINSP') && indikator && (
            <CapaianTl key={`${tab}-${skpd.skpd_id}-${tahun}`} indikator={indikator} skpdId={skpd.skpd_id} tahun={tahun} />
          )}
          {tab === 'rekon' && <CapaianRekon key={`r-${skpd.skpd_id}-${tahun}`} skpdId={skpd.skpd_id} tahun={tahun} />}
          {tab === 'pajak' && <CapaianPajak key={`p-${skpd.skpd_id}-${tahun}`} skpd={skpd} tahun={tahun} />}
        </>
      )}
    </div>
  )
}
