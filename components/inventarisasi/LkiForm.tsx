'use client'
// Form Lembar Kerja Inventarisasi (LKI) — SATU komponen untuk semua golongan,
// dikendalikan `LKI_CONFIG` (lib/inventarisasi.ts). Format III.A.1–III.A.6
// isinya ±90% sama; yang berbeda cuma bagian opsional (Merek/Tipe, nomor
// kendaraan, pemakai rumah negara, "di atas tanah milik", titik koordinat).
//
// Baris "BMD Belum Tercatat" (Format III.A.7, aset_id NULL) memakai layout
// BERBEDA: barangnya belum ada di sistem, jadi tak ada pembanding "Sesuai/Tidak
// Sesuai" — semua data diketik manual di bagian `jawaban.baru`.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import { formatRupiah } from '@/lib/export'
import {
  normalKondisi, klasifikasiLhi, LHI_LABEL,
  type InvBaris, type InvJawaban, type LkiConfig, type SesuaiField,
  type KondisiFisik, type PihakPengguna,
} from '@/lib/inventarisasi'

const KONDISI: { v: KondisiFisik; l: string }[] = [
  { v: 'B', l: 'Baik' }, { v: 'RR', l: 'Rusak Ringan' }, { v: 'RB', l: 'Rusak Berat' },
]
const PIHAK: { v: PihakPengguna; l: string }[] = [
  { v: 'pemda', l: 'Pemerintah Daerah (pegawai/pengguna barang lainnya)' },
  { v: 'pempus', l: 'Pemerintah Pusat' },
  { v: 'pemda_lain', l: 'Pemerintah Daerah Lainnya' },
  { v: 'pihak_lain', l: 'Pihak Lain' },
]

function Seksi({ kode, judul, children }: { kode: string; judul: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">
        <span className="text-gray-400 mr-1">{kode}.</span>{judul}
      </p>
      {children}
    </div>
  )
}

/** Bagian A–D & J: radio Sesuai / Tidak Sesuai + isian "yang seharusnya". */
function SesuaiInput({ nilaiLama, value, onChange, disabled }: {
  nilaiLama?: string | null
  value: SesuaiField | undefined
  onChange: (v: SesuaiField) => void
  disabled?: boolean
}) {
  const sesuai = value?.sesuai !== false
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-400">Tercatat: <span className="text-gray-600">{nilaiLama || '—'}</span></p>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={sesuai} disabled={disabled}
            onChange={() => onChange({ sesuai: true })} />
          Sesuai
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!sesuai} disabled={disabled}
            onChange={() => onChange({ sesuai: false, seharusnya: value?.seharusnya || '' })} />
          Tidak Sesuai
        </label>
        {!sesuai && (
          <input className="select-filter flex-1 min-w-[200px]" disabled={disabled}
            placeholder="sebutkan yang seharusnya..."
            value={value?.seharusnya || ''}
            onChange={e => onChange({ sesuai: false, seharusnya: e.target.value })} />
        )}
      </div>
    </div>
  )
}

export default function LkiForm({ baris, config, readOnly, onSimpan, onTutup }: {
  baris: InvBaris
  config: LkiConfig
  readOnly?: boolean
  onSimpan: (jawaban: InvJawaban, fotoPaths: string[]) => Promise<void>
  onTutup: () => void
}) {
  const supabase = createClient()
  const belumTercatat = !baris.aset_id
  const s = baris.snapshot || {}
  const [j, setJ] = useState<InvJawaban>(() => ({ ...(baris.jawaban || {}) }))
  const [foto, setFoto] = useState<string[]>(baris.foto_paths || [])
  const [induk, setInduk] = useState<AsetRingkas | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof InvJawaban>(k: K, v: InvJawaban[K]) => setJ(p => ({ ...p, [k]: v }))
  const setBaru = (k: string, v: unknown) => setJ(p => ({ ...p, baru: { ...(p.baru || {}), [k]: v } }))

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true); setErr('')
    for (const file of Array.from(files)) {
      const path = `inventarisasi/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setFoto(prev => [...prev, path])
    }
    setUploading(false)
  }
  async function hapusFoto(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setFoto(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    setSaving(true); setErr('')
    try { await onSimpan(j, foto); onTutup() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setSaving(false)
  }

  // Pratinjau LHI: pakai fungsi klasifikasi yang SAMA dengan laporan, jadi
  // operator langsung tahu lembar ini akan muncul di laporan mana.
  const lhi = klasifikasiLhi({ ...baris, jawaban: j })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onTutup}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Lembar Kerja Inventarisasi — {belumTercatat ? 'III.A.7 (BMD Belum Tercatat)' : config.format}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {belumTercatat ? 'Barang belum tercatat — isi data manual.' : `${s.nibar || '(tanpa NIBAR)'} · ${s.uraian_barang || s.nama_barang || '-'}`}
            </p>
          </div>
          <button onClick={onTutup} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
          {readOnly && (
            <div className="p-3 rounded-lg bg-gray-50 text-gray-600 text-xs">
              Inventarisasi sudah divalidasi — lembar ini hanya bisa dilihat.
            </div>
          )}

          {belumTercatat ? (
            // ── Format III.A.7 — semua data diketik manual ────────────────────
            <div className="grid grid-cols-2 gap-3">
              {([
                ['kode_barang', 'Kode Barang'], ['nama_barang', 'Nama Barang'],
                ['spesifikasi', 'Nama Spesifikasi Barang'], ['kode_register', 'Kode Register'],
                ['merek_tipe', 'Merek/Tipe'], ['no_polisi', 'Nomor Polisi'],
                ['no_rangka', 'Nomor Rangka'], ['no_mesin', 'Nomor Mesin'],
                ['satuan', 'Satuan Barang'], ['alamat', 'Alamat'],
                ['dasar_pencatatan', 'Dasar Pencatatan'],
              ] as [string, string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input className="select-filter w-full" disabled={readOnly}
                    value={(j.baru?.[k as keyof typeof j.baru] as string) || ''}
                    onChange={e => setBaru(k, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jumlah</label>
                <input type="number" className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.jumlah ?? ''} onChange={e => setBaru('jumlah', Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Satuan (Rp)</label>
                <input type="number" className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.harga_satuan ?? ''} onChange={e => setBaru('harga_satuan', Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nilai Perolehan (Rp)</label>
                <input type="number" className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.nilai_perolehan ?? ''} onChange={e => setBaru('nilai_perolehan', Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal Perolehan</label>
                <input type="date" className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.tgl_perolehan || ''} onChange={e => setBaru('tgl_perolehan', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Kondisi Barang</label>
                <div className="flex gap-4 text-xs">
                  {KONDISI.map(k => (
                    <label key={k.v} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={j.baru?.kondisi === k.v} disabled={readOnly}
                        onChange={() => setBaru('kondisi', k.v)} />{k.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <Seksi kode="A" judul="Kode Register">
                <SesuaiInput nilaiLama={null} value={j.kode_register} disabled={readOnly}
                  onChange={v => set('kode_register', v)} />
                <p className="text-[11px] text-amber-600 mt-1">Kode Register belum tersedia di sistem — isi manual bila perlu.</p>
              </Seksi>

              <Seksi kode="B" judul="Kode Barang">
                <SesuaiInput nilaiLama={s.kode} value={j.kode_barang} disabled={readOnly}
                  onChange={v => set('kode_barang', v)} />
              </Seksi>

              <Seksi kode="C" judul="Nama Barang">
                <SesuaiInput nilaiLama={s.uraian_barang} value={j.nama_barang} disabled={readOnly}
                  onChange={v => set('nama_barang', v)} />
              </Seksi>

              <Seksi kode="D" judul="Nama Spesifikasi Barang">
                <SesuaiInput nilaiLama={s.nama_barang} value={j.spesifikasi} disabled={readOnly}
                  onChange={v => set('spesifikasi', v)} />
              </Seksi>

              <Seksi kode="E–F" judul="Jumlah & Satuan Barang">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Jumlah (tercatat: {s.jumlah ?? '—'})</label>
                    <input type="number" className="select-filter w-full" disabled={readOnly}
                      value={j.jumlah ?? ''} onChange={e => set('jumlah', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Satuan (tercatat: {s.satuan || '—'})</label>
                    <input className="select-filter w-full" disabled={readOnly}
                      value={j.satuan ?? ''} onChange={e => set('satuan', e.target.value)} />
                  </div>
                </div>
              </Seksi>

              <Seksi kode="G" judul="Keberadaan Barang">
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={j.keberadaan === 'ada'} disabled={readOnly}
                      onChange={() => set('keberadaan', 'ada')} />Ada
                  </label>
                  {config.hilangVsTidakDitemukan ? (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'hilang'} disabled={readOnly}
                          onChange={() => set('keberadaan', 'hilang')} />Tidak ada — Hilang (kecurian)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'tidak_ditemukan'} disabled={readOnly}
                          onChange={() => set('keberadaan', 'tidak_ditemukan')} />Tidak ada — Tidak ditemukan
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'tidak_ditemukan'} disabled={readOnly}
                          onChange={() => set('keberadaan', 'tidak_ditemukan')} />Tidak ada / tidak ditemukan
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'hilang'} disabled={readOnly}
                          onChange={() => set('keberadaan', 'hilang')} />Hilang karena kecurian
                      </label>
                    </>
                  )}
                </div>
              </Seksi>

              <Seksi kode="H" judul="Nilai Perolehan Barang">
                <p className="text-[11px] text-gray-400 mb-1">Tercatat: {formatRupiah(s.nilai_perolehan || 0)}</p>
                <input type="number" className="select-filter w-full max-w-xs" disabled={readOnly}
                  value={j.nilai_perolehan ?? ''} onChange={e => set('nilai_perolehan', Number(e.target.value))} />
              </Seksi>

              <Seksi kode="I" judul="Apakah nilai perolehan merupakan biaya atribusi / menambah kapasitas manfaat?">
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={j.atribusi === 'ya_induk_diketahui'} disabled={readOnly}
                      onChange={() => set('atribusi', 'ya_induk_diketahui')} />
                    Ya — data awal/induknya <b>diketahui</b>
                  </label>
                  {j.atribusi === 'ya_induk_diketahui' && (
                    <div className="ml-5 space-y-2">
                      <AsetPicker selected={induk} kodePrefix={s.kode?.split('.').slice(0, 3).join('.')}
                        onSelect={a => {
                          setInduk(a)
                          set('induk', a ? {
                            aset_id: a.id, nibar: a.nibar || '', kode_barang: a.kode,
                            nama_barang: a.nama_barang || '',
                          } : {})
                        }} />
                      {j.induk?.nibar && <p className="text-[11px] text-gray-500">Induk: {j.induk.nibar} — {j.induk.nama_barang}</p>}
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={j.atribusi === 'ya_induk_tidak_diketahui'} disabled={readOnly}
                      onChange={() => set('atribusi', 'ya_induk_tidak_diketahui')} />
                    Ya — data awal/induknya <b>tidak diketahui</b>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={j.atribusi === 'bukan' || !j.atribusi} disabled={readOnly}
                      onChange={() => set('atribusi', 'bukan')} />
                    Bukan biaya atribusi / tidak menambah kapasitas manfaat
                  </label>
                </div>
              </Seksi>

              <Seksi kode="J" judul="Alamat">
                <SesuaiInput nilaiLama={s.alamat} value={j.alamat} disabled={readOnly}
                  onChange={v => set('alamat', v)} />
              </Seksi>

              <Seksi kode="K" judul="Kondisi Barang">
                <p className="text-[11px] text-gray-400 mb-1">
                  Sebelum inventarisasi: <b>{normalKondisi(s.kondisi) || '—'}</b> {s.kondisi ? `(${s.kondisi})` : ''}
                </p>
                <div className="flex gap-4 text-xs">
                  {KONDISI.map(k => (
                    <label key={k.v} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={j.kondisi === k.v} disabled={readOnly}
                        onChange={() => set('kondisi', k.v)} />{k.l}
                    </label>
                  ))}
                </div>
              </Seksi>

              {config.merekTipe && (
                <Seksi kode="L" judul="Merek / Tipe">
                  <SesuaiInput nilaiLama={s.merek_tipe} value={j.merek_tipe} disabled={readOnly}
                    onChange={v => set('merek_tipe', v)} />
                </Seksi>
              )}

              {config.nomorKendaraan && (
                <Seksi kode="M–O" judul="Nomor Polisi / Rangka / Mesin (kendaraan dinas)">
                  <div className="space-y-3">
                    <SesuaiInput nilaiLama={s.no_polisi} value={j.no_polisi} disabled={readOnly} onChange={v => set('no_polisi', v)} />
                    <SesuaiInput nilaiLama={s.no_rangka} value={j.no_rangka} disabled={readOnly} onChange={v => set('no_rangka', v)} />
                    <SesuaiInput nilaiLama={s.no_mesin} value={j.no_mesin} disabled={readOnly} onChange={v => set('no_mesin', v)} />
                  </div>
                </Seksi>
              )}

              <Seksi kode="L" judul="Penggunaan Barang">
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={!j.penggunaan} disabled={readOnly}
                      onChange={() => set('penggunaan', undefined)} />
                    Digunakan sendiri (tidak ada pihak lain)
                  </label>
                  {PIHAK.map(p => (
                    <div key={p.v}>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.penggunaan?.pihak === p.v} disabled={readOnly}
                          onChange={() => set('penggunaan', { pihak: p.v })} />{p.l}
                      </label>
                      {j.penggunaan?.pihak === p.v && (
                        <div className="ml-5 mt-1.5 space-y-2">
                          <input className="select-filter w-full" disabled={readOnly}
                            placeholder={p.v === 'pemda' ? 'Nama Kuasa/Pengguna Barang Lainnya' : 'Nama instansi / pihak'}
                            value={j.penggunaan.nama || ''}
                            onChange={e => set('penggunaan', { ...j.penggunaan!, nama: e.target.value })} />
                          {p.v === 'pemda' && config.pemakaiRumahNegara && (
                            <div className="grid grid-cols-2 gap-2">
                              <input className="select-filter" disabled={readOnly} placeholder="Nama Pemakai"
                                value={j.penggunaan.nama_pemakai || ''}
                                onChange={e => set('penggunaan', { ...j.penggunaan!, nama_pemakai: e.target.value })} />
                              <input className="select-filter" disabled={readOnly} placeholder="Status Pemakai"
                                value={j.penggunaan.status_pemakai || ''}
                                onChange={e => set('penggunaan', { ...j.penggunaan!, status_pemakai: e.target.value })} />
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={!!j.penggunaan.bast_pemakaian} disabled={readOnly}
                                  onChange={e => set('penggunaan', { ...j.penggunaan!, bast_pemakaian: e.target.checked })} />
                                Ada BAST Pemakaian
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={!!j.penggunaan.sip} disabled={readOnly}
                                  onChange={e => set('penggunaan', { ...j.penggunaan!, sip: e.target.checked })} />
                                Ada Surat Ijin Penghunian (rumah negara)
                              </label>
                            </div>
                          )}
                          {p.v === 'pemda' && !config.pemakaiRumahNegara && (
                            <input className="select-filter w-full" disabled={readOnly} placeholder="Nama Pemakai"
                              value={j.penggunaan.nama_pemakai || ''}
                              onChange={e => set('penggunaan', { ...j.penggunaan!, nama_pemakai: e.target.value })} />
                          )}
                          {p.v !== 'pemda' && (
                            <div className="space-y-1.5">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={!!j.penggunaan.dasar_ada} disabled={readOnly}
                                  onChange={e => set('penggunaan', { ...j.penggunaan!, dasar_ada: e.target.checked })} />
                                Ada dokumen dasar penguasaan
                              </label>
                              {j.penggunaan.dasar_ada && (
                                <input className="select-filter w-full" disabled={readOnly} placeholder="Nama Dokumen"
                                  value={j.penggunaan.nama_dokumen || ''}
                                  onChange={e => set('penggunaan', { ...j.penggunaan!, nama_dokumen: e.target.value })} />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Seksi>

              <Seksi kode="M" judul="Data Barang Tercatat Ganda">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="checkbox" checked={!!j.ganda} disabled={readOnly}
                    onChange={e => set('ganda', e.target.checked)} />
                  Ya, barang ini tercatat ganda
                </label>
                {j.ganda && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {([
                      ['nibar', 'NIBAR pencatatan ganda'], ['kode_register', 'Kode Register'],
                      ['kode_barang', 'Kode Barang'], ['nama_barang', 'Nama Barang'],
                      ['spesifikasi', 'Nama Spesifikasi'], ['satuan', 'Satuan'],
                      ['tgl_perolehan', 'Tgl/Bln/Th Perolehan'],
                      ['pemegang', 'Pengelola / Pengguna Barang Lainnya'],
                    ] as [string, string][]).map(([k, ph]) => (
                      <input key={k} className="select-filter" disabled={readOnly} placeholder={ph}
                        value={(j.ganda_data?.[k as keyof typeof j.ganda_data] as string) || ''}
                        onChange={e => set('ganda_data', { ...(j.ganda_data || {}), [k]: e.target.value })} />
                    ))}
                    <input type="number" className="select-filter" disabled={readOnly} placeholder="Jumlah"
                      value={j.ganda_data?.jumlah ?? ''}
                      onChange={e => set('ganda_data', { ...(j.ganda_data || {}), jumlah: Number(e.target.value) })} />
                    <input type="number" className="select-filter" disabled={readOnly} placeholder="Nilai Perolehan (Rp)"
                      value={j.ganda_data?.nilai_perolehan ?? ''}
                      onChange={e => set('ganda_data', { ...(j.ganda_data || {}), nilai_perolehan: Number(e.target.value) })} />
                  </div>
                )}
              </Seksi>

              {config.tanahMilik && (
                <Seksi kode="N" judul="Gedung dan Bangunan berdiri di atas tanah milik">
                  <div className="space-y-1.5 text-xs">
                    {PIHAK.map(p => (
                      <label key={p.v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.tanah_milik === p.v} disabled={readOnly}
                          onChange={() => set('tanah_milik', p.v)} />
                        {p.v === 'pemda' ? 'Pemerintah Daerah (sendiri)' : p.l}
                      </label>
                    ))}
                    {j.tanah_milik && j.tanah_milik !== 'pemda' && (
                      <input className="select-filter w-full" disabled={readOnly} placeholder="Sebutkan pemilik tanah"
                        value={j.tanah_milik_nama || ''} onChange={e => set('tanah_milik_nama', e.target.value)} />
                    )}
                  </div>
                </Seksi>
              )}

              {config.titikKoordinat && (
                <Seksi kode="O" judul="Titik Koordinat">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="any" className="select-filter" disabled={readOnly} placeholder="Latitude"
                      value={j.latitude ?? ''} onChange={e => set('latitude', e.target.value === '' ? null : Number(e.target.value))} />
                    <input type="number" step="any" className="select-filter" disabled={readOnly} placeholder="Longitude"
                      value={j.longitude ?? ''} onChange={e => set('longitude', e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                </Seksi>
              )}
            </>
          )}

          <Seksi kode="P–Q" judul="Lainnya & Keterangan">
            <div className="space-y-2">
              <input className="select-filter w-full" disabled={readOnly} placeholder="Lainnya"
                value={j.lainnya || ''} onChange={e => set('lainnya', e.target.value)} />
              <textarea className="select-filter w-full" rows={2} disabled={readOnly} placeholder="Keterangan"
                value={j.keterangan || ''} onChange={e => set('keterangan', e.target.value)} />
            </div>
          </Seksi>

          <Seksi kode="R" judul="Foto / Denah">
            {!readOnly && (
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                className="text-xs" disabled={uploading} onChange={e => upload(e.target.files)} />
            )}
            {uploading && <p className="text-xs text-gray-400 mt-1">Mengunggah...</p>}
            {foto.length > 0 && (
              <ul className="mt-2 space-y-1">
                {foto.map(p => (
                  <li key={p} className="flex items-center justify-between text-xs text-gray-600 gap-2">
                    <span className="truncate">{p.split('/').pop()}</span>
                    {!readOnly && (
                      <button onClick={() => hapusFoto(p)} className="text-red-500 hover:text-red-700">hapus</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seksi>

          {lhi.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Akan muncul di laporan:</p>
              <div className="flex flex-wrap gap-1.5">
                {lhi.map(k => (
                  <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-teal/10 text-teal">
                    {k} — {LHI_LABEL[k]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onTutup} className="btn-secondary text-sm">Tutup</button>
          {!readOnly && (
            <button onClick={simpan} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Menyimpan...' : 'Simpan Lembar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
