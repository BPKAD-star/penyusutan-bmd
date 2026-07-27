'use client'
// Form Lembar Kerja Inventarisasi (LKI) — SATU komponen untuk semua golongan,
// dikendalikan `LKI_CONFIG` (lib/inventarisasi.ts). Format III.A.1–III.A.6
// isinya ±90% sama; yang berbeda cuma bagian opsional (Merek/Tipe, nomor
// kendaraan, pemakai rumah negara, "di atas tanah milik", titik koordinat).
//
// PRINSIP ISIAN (koreksi user 2026-07-27):
//   * Yang TIDAK boleh diubah lewat LKI: NIBAR, Jumlah, Nilai Perolehan —
//     ditampilkan apa adanya. Mengubahnya urusan menu Koreksi, bukan
//     inventarisasi.
//   * Yang dikoreksi TIDAK diketik bebas, tapi dipilih dari master:
//     kode barang → KodefikasiPicker (DIKUNCI ke golongan lembar ini),
//     satuan → admin_satuan_bmd, alamat → admin_wilayah (berjenjang),
//     induk & pasangan-ganda → AsetPicker (DIKUNCI ke SKPD lembar ini).
//   * Kode Barang & Nama Barang digabung: cukup pilih kodenya, uraian ikut.
//
// Baris "BMD Belum Tercatat" (Format III.A.7, aset_id NULL) memakai layout
// BERBEDA: barangnya belum ada di sistem, jadi semua data diketik manual.
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import WilayahPicker from '@/components/WilayahPicker'
import { formatRupiah } from '@/lib/export'
import {
  normalKondisi, klasifikasiLhi, LHI_LABEL,
  type InvBaris, type InvJawaban, type LkiConfig,
  type KondisiFisik, type PihakPengguna,
} from '@/lib/inventarisasi'

// MapPicker butuh `window` (Leaflet) → WAJIB dynamic tanpa SSR (aturan CLAUDE.md).
const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false })

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

/** Baris "tercatat: …" untuk field yang hanya ditampilkan, tak bisa diubah. */
function Tampilan({ nilai }: { nilai: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-800">
      {nilai}
      <span className="ml-2 text-[11px] text-gray-400">(tidak diubah lewat inventarisasi)</span>
    </p>
  )
}

/** Radio Sesuai / Tidak Sesuai. Isian koreksinya disuplai lewat `children`. */
function SesuaiRadio({ sesuai, onSesuai, disabled, nilaiLama, children }: {
  sesuai: boolean
  onSesuai: (v: boolean) => void
  disabled?: boolean
  nilaiLama?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-400">Tercatat: <span className="text-gray-600">{nilaiLama || '—'}</span></p>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={sesuai} disabled={disabled} onChange={() => onSesuai(true)} />
          Sesuai
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!sesuai} disabled={disabled} onChange={() => onSesuai(false)} />
          Tidak Sesuai
        </label>
      </div>
      {!sesuai && <div className="pt-1">{children}</div>}
    </div>
  )
}

export default function LkiForm({ baris, config, golongan, skpdId, readOnly, onSimpan, onTutup }: {
  baris: InvBaris
  config: LkiConfig
  /** Golongan lembar ini — mengunci pilihan kodefikasi & pencarian induk. */
  golongan: string
  /** SKPD lembar ini — mengunci pencarian induk & pasangan tercatat-ganda. */
  skpdId: number
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
  const [gandaAset, setGandaAset] = useState<AsetRingkas | null>(null)
  const [kodefikasi, setKodefikasi] = useState<KodefikasiHasil | null>(null)
  const [satuanOpsi, setSatuanOpsi] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof InvJawaban>(k: K, v: InvJawaban[K]) => setJ(p => ({ ...p, [k]: v }))
  const setBaru = (k: string, v: unknown) => setJ(p => ({ ...p, baru: { ...(p.baru || {}), [k]: v } }))

  // Master satuan (menu Admin > Daftar Satuan) — dipakai saat satuan dikoreksi.
  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('nama').order('nama')
      .then(({ data }) => setSatuanOpsi(((data || []) as { nama: string }[]).map(r => r.nama)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Pratinjau LHI: fungsi klasifikasi yang SAMA dgn laporan, jadi isi laporan
  // tak mungkin berbeda dari yang terlihat di sini.
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
              <Seksi kode="A" judul="NIBAR">
                <Tampilan nilai={<span className="font-medium">{s.nibar || '—'}</span>} />
              </Seksi>

              <Seksi kode="B–C" judul="Kode Barang & Nama Barang">
                <SesuaiRadio
                  nilaiLama={`${s.kode || '—'} · ${s.uraian_barang || '—'}`}
                  sesuai={j.kode_barang?.sesuai !== false}
                  disabled={readOnly}
                  onSesuai={v => set('kode_barang', v ? { sesuai: true } : { sesuai: false })}
                >
                  <p className="text-[11px] text-gray-500 mb-1.5">
                    Pilih kode yang benar — <b>Nama Barang otomatis mengikuti</b> uraian kodefikasi.
                    Pilihan dibatasi golongan <b>{golongan}</b>; pindah golongan lewat menu Reklasifikasi.
                  </p>
                  <KodefikasiPicker
                    picked={kodefikasi}
                    golonganTetap={golongan}
                    onPick={r => {
                      setKodefikasi(r)
                      set('kode_barang', r
                        ? { sesuai: false, kode_baru: r.kode, uraian_baru: r.uraian || '', seharusnya: `${r.kode} · ${r.uraian || ''}` }
                        : { sesuai: false })
                    }}
                  />
                  {j.kode_barang?.kode_baru && (
                    <p className="text-[11px] text-teal mt-1.5">
                      Seharusnya: <b>{j.kode_barang.kode_baru}</b> · {j.kode_barang.uraian_baru || '—'}
                    </p>
                  )}
                </SesuaiRadio>
              </Seksi>

              <Seksi kode="D" judul="Nama Spesifikasi Barang">
                <SesuaiRadio
                  nilaiLama={s.nama_barang}
                  sesuai={j.spesifikasi?.sesuai !== false}
                  disabled={readOnly}
                  onSesuai={v => set('spesifikasi', v ? { sesuai: true } : { sesuai: false, seharusnya: j.spesifikasi?.seharusnya || '' })}
                >
                  <input className="select-filter w-full" disabled={readOnly}
                    placeholder="sebutkan spesifikasi yang seharusnya..."
                    value={j.spesifikasi?.seharusnya || ''}
                    onChange={e => set('spesifikasi', { sesuai: false, seharusnya: e.target.value })} />
                </SesuaiRadio>
              </Seksi>

              {/* Format III.A.4 menyisipkan 4 isian teknis di sini, SEBELUM
                  Jumlah Barang. Di dokumen aslinya huruf E–H terpakai dua kali;
                  di layar dipendekkan jadi satu blok supaya tak membingungkan.
                  Keempatnya belum punya kolom di `aset`, jadi "Tercatat" kosong
                  — petugas mengisi keadaan sebenarnya di lapangan. */}
              {config.jijTeknis && (
                <Seksi kode="E–H" judul="Data Teknis Jalan / Jaringan / Irigasi">
                  <div className="space-y-3">
                    {([
                      ['jenis_perkerasan', 'Jenis Perkerasan Jalan'],
                      ['jenis_bahan_jembatan', 'Jenis Bahan Struktur Jembatan'],
                      ['no_ruas_jalan', 'Nomor Ruas Jalan'],
                      ['no_jaringan_irigasi', 'Nomor Jaringan Irigasi'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <p className="text-[11px] font-medium text-gray-600 mb-1">{label}</p>
                        <SesuaiRadio
                          sesuai={j[key]?.sesuai !== false}
                          disabled={readOnly}
                          onSesuai={v => set(key, v ? { sesuai: true } : { sesuai: false, seharusnya: j[key]?.seharusnya || '' })}
                        >
                          <input className="select-filter w-full" disabled={readOnly} placeholder="sebutkan yang seharusnya..."
                            value={j[key]?.seharusnya || ''}
                            onChange={e => set(key, { sesuai: false, seharusnya: e.target.value })} />
                        </SesuaiRadio>
                      </div>
                    ))}
                  </div>
                </Seksi>
              )}

              <Seksi kode="E" judul="Jumlah Barang">
                <Tampilan nilai={s.jumlah ?? '—'} />
              </Seksi>

              <Seksi kode="F" judul="Satuan Barang">
                <SesuaiRadio
                  nilaiLama={s.satuan}
                  sesuai={j.satuan?.sesuai !== false}
                  disabled={readOnly}
                  onSesuai={v => set('satuan', v ? { sesuai: true } : { sesuai: false, seharusnya: j.satuan?.seharusnya || '' })}
                >
                  <select className="select-filter w-full max-w-xs" disabled={readOnly}
                    value={j.satuan?.seharusnya || ''}
                    onChange={e => set('satuan', { sesuai: false, seharusnya: e.target.value })}>
                    <option value="">— pilih satuan —</option>
                    {satuanOpsi.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">Daftar dari menu Admin → Daftar Satuan.</p>
                </SesuaiRadio>
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
                <Tampilan nilai={formatRupiah(s.nilai_perolehan || 0)} />
              </Seksi>

              <Seksi kode="I" judul="Apakah nilai perolehan merupakan biaya atribusi / menambah kapasitas manfaat?">
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={j.atribusi === 'ya_induk_diketahui'} disabled={readOnly}
                      onChange={() => set('atribusi', 'ya_induk_diketahui')} />
                    Ya — data awal/induknya <b>diketahui</b>
                  </label>
                  {j.atribusi === 'ya_induk_diketahui' && (
                    <div className="ml-5 space-y-1.5">
                      <p className="text-[11px] text-gray-500">
                        Induk dicari <b>hanya di SKPD lembar ini</b> dan golongan <b>{golongan}</b>.
                      </p>
                      <AsetPicker selected={induk} skpdId={skpdId} kodePrefix={golongan}
                        onSelect={a => {
                          if (a && a.id === baris.aset_id) { setErr('Induk tidak boleh barang ini sendiri.'); return }
                          setErr('')
                          setInduk(a)
                          set('induk', a ? {
                            aset_id: a.id, nibar: a.nibar || '', kode_barang: a.kode,
                            nama_barang: a.nama_barang || '',
                          } : {})
                        }} />
                      {j.induk?.nibar && (
                        <p className="text-[11px] text-teal">Induk: {j.induk.nibar} — {j.induk.nama_barang}</p>
                      )}
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
                <SesuaiRadio
                  nilaiLama={s.alamat}
                  sesuai={j.alamat?.sesuai !== false}
                  disabled={readOnly}
                  onSesuai={v => set('alamat', v ? { sesuai: true } : { sesuai: false })}
                >
                  <div className="space-y-2">
                    <WilayahPicker
                      value={j.alamat?.wilayah_kode || ''}
                      onChange={kode => set('alamat', { ...(j.alamat || { sesuai: false }), sesuai: false, wilayah_kode: kode })}
                    />
                    <input className="select-filter w-full" disabled={readOnly}
                      placeholder="Detail alamat (jalan, nomor, RT/RW)..."
                      value={j.alamat?.alamat_detail || ''}
                      onChange={e => set('alamat', { ...(j.alamat || { sesuai: false }), sesuai: false, alamat_detail: e.target.value })} />
                  </div>
                </SesuaiRadio>
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
                <Seksi kode="L" judul={config.nomorKendaraan ? 'Merek / Tipe' : 'Merek / Tipe / Spesifikasi Lainnya'}>
                  <SesuaiRadio
                    nilaiLama={s.merek_tipe}
                    sesuai={j.merek_tipe?.sesuai !== false}
                    disabled={readOnly}
                    onSesuai={v => set('merek_tipe', v ? { sesuai: true } : { sesuai: false, seharusnya: j.merek_tipe?.seharusnya || '' })}
                  >
                    <input className="select-filter w-full" disabled={readOnly} placeholder="sebutkan yang seharusnya..."
                      value={j.merek_tipe?.seharusnya || ''}
                      onChange={e => set('merek_tipe', { sesuai: false, seharusnya: e.target.value })} />
                  </SesuaiRadio>
                </Seksi>
              )}

              {config.nomorKendaraan && (
                <Seksi kode="M–O" judul="Nomor Polisi / Rangka / Mesin (kendaraan dinas)">
                  <div className="space-y-3">
                    {([
                      ['no_polisi', 'Nomor Polisi', s.no_polisi],
                      ['no_rangka', 'Nomor Rangka', s.no_rangka],
                      ['no_mesin', 'Nomor Mesin', s.no_mesin],
                    ] as const).map(([key, label, lama]) => (
                      <div key={key}>
                        <p className="text-[11px] font-medium text-gray-600 mb-1">{label}</p>
                        <SesuaiRadio
                          nilaiLama={lama}
                          sesuai={j[key]?.sesuai !== false}
                          disabled={readOnly}
                          onSesuai={v => set(key, v ? { sesuai: true } : { sesuai: false, seharusnya: j[key]?.seharusnya || '' })}
                        >
                          <input className="select-filter w-full" disabled={readOnly} placeholder="sebutkan yang seharusnya..."
                            value={j[key]?.seharusnya || ''}
                            onChange={e => set(key, { sesuai: false, seharusnya: e.target.value })} />
                        </SesuaiRadio>
                      </div>
                    ))}
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
                          {p.v === 'pemda' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input className="select-filter" disabled={readOnly} placeholder="Nama Pemakai"
                                value={j.penggunaan.nama_pemakai || ''}
                                onChange={e => set('penggunaan', { ...j.penggunaan!, nama_pemakai: e.target.value })} />
                              <input className="select-filter" disabled={readOnly} placeholder="Status Pemakai"
                                value={j.penggunaan.status_pemakai || ''}
                                onChange={e => set('penggunaan', { ...j.penggunaan!, status_pemakai: e.target.value })} />
                              {config.pemakaiRumahNegara && (
                                <>
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
                                </>
                              )}
                            </div>
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
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-gray-500">
                      Pilih barang kembarannya — dicari <b>hanya di SKPD lembar ini</b>, golongan <b>{golongan}</b>.
                    </p>
                    <AsetPicker selected={gandaAset} skpdId={skpdId} kodePrefix={golongan}
                      onSelect={a => {
                        if (a && a.id === baris.aset_id) { setErr('Pasangan ganda tidak boleh barang ini sendiri.'); return }
                        setErr('')
                        setGandaAset(a)
                        set('ganda_data', a ? {
                          ...(j.ganda_data || {}),
                          aset_id: a.id, nibar: a.nibar || '', kode_barang: a.kode,
                          nama_barang: a.nama_barang || '', nilai_perolehan: a.nilai_perolehan,
                        } : {})
                      }} />
                    {j.ganda_data?.nibar && (
                      <p className="text-[11px] text-teal">
                        Ganda dengan: {j.ganda_data.nibar} — {j.ganda_data.nama_barang}
                      </p>
                    )}
                    <input className="select-filter w-full" disabled={readOnly}
                      placeholder="Pengelola / Pengguna Barang Lainnya (bila dipegang unit lain)"
                      value={j.ganda_data?.pemegang || ''}
                      onChange={e => set('ganda_data', { ...(j.ganda_data || {}), pemegang: e.target.value })} />
                  </div>
                )}
              </Seksi>

              {config.tanahMilik && (
                <Seksi kode="N" judul={config.tanahMilikLabel || 'Barang berdiri di atas tanah milik'}>
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
                  <div className="space-y-2">
                    <MapPicker
                      latitude={j.latitude != null ? String(j.latitude) : ''}
                      longitude={j.longitude != null ? String(j.longitude) : ''}
                      onChange={(lat, lng) => setJ(p => ({
                        ...p,
                        latitude: lat === '' ? null : Number(lat),
                        longitude: lng === '' ? null : Number(lng),
                      }))}
                    />
                    <p className="text-[11px] text-gray-400">
                      Klik peta untuk menandai titik, atau ketik koordinatnya langsung.
                    </p>
                  </div>
                </Seksi>
              )}
            </>
          )}

          <Seksi kode="P" judul="Lainnya">
            <input className="select-filter w-full" disabled={readOnly} placeholder="Catatan lain..."
              value={j.lainnya || ''} onChange={e => set('lainnya', e.target.value)} />
          </Seksi>

          <Seksi kode="Q" judul="Keterangan">
            <textarea className="select-filter w-full" rows={2} disabled={readOnly} placeholder="Keterangan..."
              value={j.keterangan || ''} onChange={e => set('keterangan', e.target.value)} />
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
