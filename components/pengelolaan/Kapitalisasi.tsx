'use client'
// No.10: Kapitalisasi / penambahan masa manfaat (§6). Perhitungan final di engine.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { cariBand, type BandOverhaul } from '@/lib/engine/penyusutan'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import FormShell from './FormShell'

export default function Kapitalisasi() {
  const supabase = createClient()
  const [aset, setAset] = useState<AsetRingkas | null>(null)
  const [nilaiRehab, setNilaiRehab] = useState('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [bands, setBands] = useState<BandOverhaul[]>([])
  const [masaMax, setMasaMax] = useState<number | null>(null)
  const [sisaSmt, setSisaSmt] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun')
      .then(({ data }) => setBands((data as BandOverhaul[]) || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMasaMax(null); setSisaSmt(null)
    if (!aset) return
    (async () => {
      const { data: k } = await supabase.from('kodefikasi_bmd').select('masa_manfaat_tahun').eq('kode', aset.kode).single()
      setMasaMax(k?.masa_manfaat_tahun ?? null)
      const { data: ps } = await supabase.from('penyusutan_semester')
        .select('sisa_semester,periode').eq('aset_id', aset.id)
        .order('periode', { ascending: false }).limit(1)
      if (ps && ps.length) setSisaSmt(ps[0].sisa_semester)
      else {
        const { data: sa } = await supabase.from('transaksi_bmd')
          .select('payload').eq('aset_id', aset.id).eq('jenis', 'saldo_awal').limit(1)
        const p = sa?.[0]?.payload as { sisa_masa_manfaat_smt?: number } | undefined
        if (p?.sisa_masa_manfaat_smt != null) setSisaSmt(p.sisa_masa_manfaat_smt)
      }
    })()
  }, [aset]) // eslint-disable-line react-hooks/exhaustive-deps

  const rehab = parseFloat(nilaiRehab) || 0
  const persen = aset && aset.nilai_perolehan > 0 ? (rehab / aset.nilai_perolehan) * 100 : 0
  const band = aset && rehab > 0 ? cariBand(bands, aset.kode, persen) : null
  const tambahan = band?.tambahan_tahun ?? 0
  const sisaTahun = sisaSmt != null ? sisaSmt / 2 : null
  const masaBaru = sisaTahun != null && masaMax != null ? Math.min(sisaTahun + tambahan, masaMax) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!aset || rehab <= 0) return
    setSaving(true)
    const { error } = await catatTransaksi(supabase, {
      asetId: aset.id, jenis: 'kapitalisasi', nilai: rehab,
      payload: {
        nilai_rehab: rehab, persen_rehab: Math.round(persen * 100) / 100,
        band_label: band ? `${band.kode_prefix}#${band.band_no}` : null,
        tambahan_tahun: tambahan, nilai_perolehan_baru: aset.nilai_perolehan + rehab,
      },
      keterangan: ket || undefined,
    })
    setMsg(error ? `Error: ${error}` : `Kapitalisasi ${formatRupiah(rehab)} tercatat. Jalankan engine untuk memperbarui penyusutan.`)
    if (!error) { setAset(null); setNilaiRehab(''); setKet('') }
    setSaving(false)
  }

  return (
    <FormShell judul="Kapitalisasi" msg={msg}
      deskripsi="Rehab G&B/JIJ, penambahan sparepart P&M, penambahan menu aplikasi ATB. Persentase dihitung terhadap nilai perolehan (bukan nilai buku).">
      <form onSubmit={submit} className="card p-6 max-w-2xl space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Aset Induk</label>
          <AsetPicker selected={aset} onSelect={setAset} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nilai Rehab / Kapitalisasi (Rp)</label>
          <input type="number" min="1" step="1" className="select-filter w-full" value={nilaiRehab}
            onChange={e => setNilaiRehab(e.target.value)} required />
        </div>
        {aset && rehab > 0 && (
          <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview Perhitungan</p>
            <p>% rehab: <span className="font-medium">{persen.toFixed(2)}%</span> dari {formatRupiah(aset.nilai_perolehan)}</p>
            <p>Band overhaul: <span className="font-medium">{band ? `+${tambahan} tahun` : 'tidak ada band untuk rumpun ini (+0 tahun)'}</span></p>
            {sisaTahun != null && masaMax != null ? (
              <p>Masa manfaat: sisa {sisaTahun} th + {tambahan} th = {sisaTahun + tambahan} th
                → <span className="font-medium">{masaBaru} th ({(masaBaru ?? 0) * 2} semester)</span>
                {sisaTahun + tambahan > (masaMax ?? 0) && <span className="text-amber-600"> (di-cap max {masaMax} th)</span>}
              </p>
            ) : (
              <p className="text-gray-400">Sisa masa manfaat belum tersedia — engine akan menghitung dari ledger.</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Keterangan / No. kontrak rehab</label>
          <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={saving || !aset || rehab <= 0}>{saving ? 'Menyimpan...' : 'Catat Kapitalisasi'}</button>
      </form>
    </FormShell>
  )
}
