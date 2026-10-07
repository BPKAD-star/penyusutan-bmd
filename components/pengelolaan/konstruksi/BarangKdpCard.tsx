'use client'
// Kartu satu barang KDP di dalam kartu paket Pekerjaan Konstruksi (2026-10-07):
// identitas barang, lalu KONTRAK → BAST-nya bertingkat (Kartu → Barang → Kontrak
// → BAST, permintaan user 2026-10-08). Kontrak tetap disimpan di tingkat KARTU
// (satu kontrak fisik boleh membayar beberapa barang), jadi kontrak yang sama
// tampil di bawah tiap barang & menyuntingnya berlaku untuk semuanya. Setujui & Batal dikerjakan PER TERMIN oleh admin pemda
// (lib/kdpAksi.ts → RPC). Termin menunggu bebas dihapus; termin disetujui beku.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RekeningPicker from '@/components/RekeningPicker'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { formatRupiah2 } from '@/lib/export'
import NominalInput from '@/shared/ui/NominalInput'
import { DokumenBastField, bukaDokumen, namaFile } from '../DokumenBastField'
import { cekWarningRekening } from '@/lib/rekeningBelanja'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { FotoSel, useFotoThumbs } from '@/shared/ui/FotoBarang'
import { fetchUraianRekening } from '@/lib/rkbmdStandar'
import {
  KOMPONEN_KDP, komponenLabelKdp, kekuranganTermin, ringkasBarangKdp, statusTermin, namaBarangKdp, newIdKdp, pemakaianKontrak,
  type BarangKdp, type KontrakKdp, type KomponenKdp, type PembayaranKdp, type KontrakKonstruksiPayload,
} from '@/lib/kdp'
import { bentukKontrakLabel } from '@/lib/bentukKontrak'
import { KontrakModal } from './KontrakKdpSection'

// Uraian Kode Rekening — sengaja TIDAK fail-closed: uraian itu hiasan di atas
// kode yang sudah benar (pola `useRekeningUraian` di Pengadaan.tsx).
function useRekeningUraian(kodes: (string | null | undefined)[]): Record<string, string> {
  const supabase = createClient()
  const [map, setMap] = useState<Record<string, string>>({})
  const key = [...new Set(kodes.filter((k): k is string => !!k))].sort().join('|')
  useEffect(() => {
    if (!key) { setMap({}); return }
    void (async () => { setMap(Object.fromEntries(await fetchUraianRekening(supabase, key.split('|')))) })()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return map
}

export function Baris({ label, value, lebar = 'w-28' }: { label: string; value?: string | null; lebar?: string }) {
  return (
    <div className="flex text-xs leading-relaxed">
      <span className={`text-gray-400 flex-shrink-0 whitespace-nowrap ${lebar}`}>{label}</span>
      <span className="text-gray-700 min-w-0">: {value || '-'}</span>
    </div>
  )
}

const UMUM = '__umum'
// Tombol tambah berwarna hijau tipis (permintaan user 2026-10-08).
const TOMBOL_HIJAU = 'inline-flex items-center rounded-lg border border-teal/30 bg-teal/10 hover:bg-teal/20 text-teal text-xs font-medium px-3 py-1'
const urutKomponen = (k: string) => KOMPONEN_KDP.findIndex(x => x.value === k)

export function BarangKdpCard({ barang, payload, kontraks, tahunKartu, skpdId, bolehUbah, isAdmin, busy,
  onHapusBarang, onEditSpec, onUbahKapInfo, onTambahTermin, onHapusTermin, onSetujui, onBatal, onSimpanKontrak, onHapusKontrak }: {
  barang: BarangKdp; payload: KontrakKonstruksiPayload; kontraks: KontrakKdp[]; tahunKartu: string; skpdId: number
  bolehUbah: boolean; isAdmin: boolean; busy: boolean
  onHapusBarang: () => void; onEditSpec: () => void; onUbahKapInfo: () => void
  onTambahTermin: (item: PembayaranKdp) => Promise<void>; onHapusTermin: (id: string) => void
  onSetujui: (t: PembayaranKdp) => void; onBatal: (t: PembayaranKdp) => void
  onSimpanKontrak: (k: KontrakKdp) => Promise<void>; onHapusKontrak: (k: KontrakKdp) => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const bounds = useDateBounds()
  const pembayaran = barang.pembayaran || []
  const r = ringkasBarangKdp(barang)
  // Spesifikasi & susunan barang bebas disunting selama BELUM ada termin
  // disetujui; sesudahnya barang sudah di register — perbaikan lewat Koreksi.
  const bebas = bolehUbah && r.nDisetujui === 0
  const fotoPaths = barang.foto || []
  const fotoThumbs = useFotoThumbs(fotoPaths.slice(0, 1))
  const rekeningUraian = useRekeningUraian(pembayaran.map(x => x.kode_rekening))
  const kontrakById = new Map(kontraks.map(k => [k.id, k]))
  // Urut TANGGAL BAST (tampilan saja — payload tak diurutkan ulang).
  const urut = [...pembayaran].sort((a, c) => (a.tgl_bast || '').localeCompare(c.tgl_bast || ''))
  // Kontrak diurut komponen (perencanaan → fisik → pengawasan → biaya umum), lalu tanggal.
  const kontrakUrut = [...kontraks].sort((a, c) => urutKomponen(a.komponen) - urutKomponen(c.komponen)
    || (a.tgl_kontrak || '').localeCompare(c.tgl_kontrak || '') || a.no_kontrak.localeCompare(c.no_kontrak))
  // Termin tanpa kontrak (biaya umum) atau kontraknya sudah tak ada di kartu.
  const tanpaKontrak = urut.filter(t => !t.kontrak_id || !kontrakById.has(t.kontrak_id))

  // Form BAST dibuka DI BAWAH kontraknya — kontrak & komponennya sudah pasti.
  const [formUntuk, setFormUntuk] = useState<string | null>(null)
  const [editKontrak, setEditKontrak] = useState<KontrakKdp | 'baru' | null>(null)
  const kontrakDipilih = formUntuk && formUntuk !== UMUM ? kontrakById.get(formUntuk) : undefined
  const komponen: KomponenKdp = kontrakDipilih?.komponen || 'biaya_umum'
  const [noBast, setNoBast] = useState('')
  const [tgl, setTgl] = useState('')
  const [rekening, setRekening] = useState('')
  const [nominal, setNominal] = useState('')
  const [ket, setKet] = useState('')
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)
  const [err, setErr] = useState('')
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const minTgl = [bounds.min, kontrakDipilih?.tgl_kontrak, `${tahunKartu}-01-01`].filter(Boolean).sort().slice(-1)[0]
  const maxTgl = [bounds.max, `${tahunKartu}-12-31`].filter(Boolean).sort()[0]

  function bukaForm(untuk: string) {
    setFormUntuk(untuk); setErr('')
    setNoBast(''); setNominal(''); setKet(''); setRekening(''); setTgl(''); setDokPaths([])
  }

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `konstruksi-bast/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { await konfirmasiGagal(konfirmasi, `Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  function calon(): PembayaranKdp {
    return {
      id: newIdKdp(), kontrak_id: kontrakDipilih?.id || null, komponen, no_bast: noBast || null, tgl_bast: tgl,
      kode_rekening: rekening || null, nominal: Number(nominal || 0), keterangan: ket || null,
      dokumen_paths: dokPaths, status: 'menunggu',
    }
  }

  async function submitTermin(e: React.FormEvent) {
    e.preventDefault()
    const c = calon()
    if (dokPaths.length === 0) {
      await konfirmasi({ nada: 'amber', ikon: '⚠', judul: 'Belum bisa ditambahkan', labelYa: 'Mengerti', tanpaBatal: true,
        isi: `Dokumen BAST "${komponenLabelKdp(komponen)}" ini wajib diunggah sebelum BAST bisa ditambahkan.` })
      return
    }
    const kurang = kekuranganTermin(c, kontraks, tahunKartu)
    if (kurang.length) { setErr(kurang.join(' ')); return }
    setErr('')
    const w = cekWarningRekening(rekening, '1.3.6', 'Konstruksi Dalam Pengerjaan')
    if (w.length > 0) { setWarnings(w); return }
    await doTambah()
  }
  async function doTambah() {
    setWarnings(null)
    await onTambahTermin(calon())
    // Rekening, tanggal & dokumen IKUT dikosongkan — BAST berikutnya tak boleh
    // diam-diam mewarisi isian sebelumnya (keputusan user 2026-08-27).
    setNoBast(''); setNominal(''); setKet(''); setRekening(''); setTgl(''); setDokPaths([])
    setFormUntuk(null)
  }

  function TabelBast({ termin }: { termin: PembayaranKdp[] }) {
    if (termin.length === 0) return <p className="px-3 py-2.5 text-xs text-gray-400">Belum ada BAST untuk barang ini.</p>
    return (
      <div className="overflow-x-auto">
        {/* table-fixed + lebar tetap: tabel tiap kontrak SEJAJAR kolomnya
            (tanpa ini lebar kolom ikut isi tiap tabel & bergeser antar kontrak).
            Urutan kolom ditetapkan user 2026-10-08. */}
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '18%' }} /><col style={{ width: '24%' }} /><col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10%' }} />
          </colgroup>
          <thead className="border-b border-gray-100"><tr>
            <th className="table-th">Keterangan</th><th className="table-th">Kode Rekening</th><th className="table-th">Nomor BAST</th>
            <th className="table-th">Tanggal BAST</th><th className="table-th text-right">Nominal &amp; Lampiran</th><th className="table-th">Status</th><th className="table-th"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {termin.map((t, i) => {
              const setuju = statusTermin(t) === 'disetujui'
              return (
                <tr key={t.id || i}>
                  <td className="table-td text-xs text-gray-700 align-top break-words">{t.keterangan || '—'}
                    {!t.kontrak_id && t.komponen !== 'biaya_umum' && <span className="block text-amber-600">⚠ {komponenLabelKdp(t.komponen)} belum menunjuk kontrak</span>}
                    {t.kontrak_id && !kontrakById.has(t.kontrak_id) && <span className="block text-amber-600">⚠ kontraknya sudah tidak ada</span>}
                  </td>
                  <td className="table-td text-xs align-top break-words">
                    {t.kode_rekening ? <><span className="block text-gray-700">{t.kode_rekening}</span><span className="block text-gray-400">{rekeningUraian[t.kode_rekening] || ''}</span></> : '—'}
                  </td>
                  <td className="table-td text-xs text-gray-700 align-top break-words">{t.no_bast || '—'}</td>
                  <td className="table-td text-xs text-gray-700 align-top whitespace-nowrap">{t.tgl_bast || '—'}</td>
                  <td className="table-td text-xs text-right align-top break-words">
                    <span className="block text-gray-800">{formatRupiah2(t.nominal)}</span>
                    {(t.dokumen_paths || []).length === 0 ? <span className="block text-amber-600">⚠ tanpa lampiran</span>
                      : (t.dokumen_paths || []).map(p => (
                        <button key={p} onClick={() => bukaDokumen(p)} className="underline text-teal hover:opacity-80 block ml-auto text-right">{namaFile(p)}</button>
                      ))}
                  </td>
                  <td className="table-td text-xs align-top">
                    {setuju ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal/10 text-teal">Disetujui</span>
                      : <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">Menunggu</span>}
                  </td>
                  <td className="table-td text-right whitespace-nowrap align-top">
                    {!setuju && isAdmin && t.id && (
                      <button disabled={busy} className="text-xs text-teal font-medium hover:underline mr-3" onClick={() => onSetujui(t)}>✓ Setujui</button>
                    )}
                    {!setuju && bolehUbah && t.id && (
                      <button className="text-xs text-red-600 hover:text-red-700" onClick={() => onHapusTermin(t.id!)}>Hapus</button>
                    )}
                    {setuju && isAdmin && (
                      <button disabled={busy} className="text-xs text-red-600 font-medium hover:underline" onClick={() => onBatal(t)}>↩ Batal</button>
                    )}
                    {setuju && !isAdmin && <span className="text-[11px] text-gray-400">🔒</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function FormBast() {
    return (
      <form onSubmit={submitTermin} className="m-3 p-3 rounded-lg border border-teal/30 bg-teal/5 space-y-3">
        <h4 className="text-xs font-semibold text-gray-700">
          Tambah BAST {komponenLabelKdp(komponen)}{kontrakDipilih ? ` — kontrak ${kontrakDipilih.no_kontrak}` : ' (tanpa kontrak)'}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Nomor BAST</label><input className="select-filter w-full text-sm" value={noBast} onChange={e => setNoBast(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Tanggal BAST <span className="text-gray-400">({kontrakDipilih ? `≥ ${kontrakDipilih.tgl_kontrak}, ` : ''}tahun {tahunKartu})</span></label>
            <input type="date" min={minTgl} max={maxTgl} className="select-filter w-full text-sm" value={tgl} onChange={e => setTgl(e.target.value)} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Nominal (Rp)</label><NominalInput className="select-filter w-full text-sm" value={nominal} onChange={setNominal} /></div>
          <div className="col-span-2 sm:col-span-3">
            <DokumenBastField paths={dokPaths} uploading={dokUploading} onUpload={uploadDokumen} onHapus={hapusDokumen}
              hint={`wajib sebelum BAST "${komponenLabelKdp(komponen)}" ini bisa ditambahkan (foto / PDF, bisa lebih dari satu)`}
              kosongText="Belum ada dokumen — wajib diunggah sebelum BAST bisa ditambahkan." />
          </div>
          <div className="col-span-2 sm:col-span-3"><label className="block text-xs text-gray-500 mb-1">Kode Rekening Belanja <span className="text-gray-400">(cari & pilih sampai Sub Rincian Objek)</span></label><RekeningPicker value={rekening} onChange={setRekening} /></div>
          <div className="col-span-2 sm:col-span-3"><label className="block text-xs text-gray-500 mb-1">Keterangan</label><input className="select-filter w-full text-sm" value={ket} onChange={e => setKet(e.target.value)} /></div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary text-sm py-1.5">+ Tambah BAST</button>
          <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => { setFormUntuk(null); setErr('') }}>Batal</button>
        </div>
        <p className="text-[11px] text-gray-400">BAST masuk berstatus <b>Menunggu</b> — baru tercatat di Daftar Barang & laporan sesudah disetujui admin pemda.</p>
      </form>
    )
  }

  return (
    <div className="px-5 py-4 border-t border-gray-100">
     {/* Kotak bersarang (user 2026-10-08): Kartu ⊃ Barang ⊃ Kontrak ⊃ BAST. */}
     <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50/60 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">{barang.kode} - {namaBarangKdp(barang)}</p>
          <div className="mt-1 space-y-0.5">
            <Baris lebar="w-44" label="Spesifikasi Nama Barang" value={barang.spec?.nama_barang} />
            <Baris lebar="w-44" label="Lokasi" value={barang.spec?.alamat_detail} />
            <Baris lebar="w-44" label="Keterangan" value={barang.spec?.keterangan} />
            {/* Dipaku "Intra": barang KDP selalu dicatat intrakomptabel
                (lib/kdpAksi.ts); klasifikasinya baru relevan saat direklas. */}
            <Baris lebar="w-44" label="Komptabel" value="Intra" />
            <Baris lebar="w-44" label="Tgl Perolehan" value={r.tglPerolehan ? `${r.tglPerolehan} (BAST disetujui pertama)` : null} />
            {barang.kap_info?.menambah && <Baris lebar="w-44" label="Menambah Manfaat" value={barang.kap_info.target_nama || '(aset dipilih)'} />}
          </div>
        </div>
        <div className="flex items-start gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Disetujui</p>
            <p className="font-semibold text-gray-800">{formatRupiah2(r.nilaiDisetujui)}</p>
            {r.nMenunggu > 0 && <p className="text-[11px] text-amber-600">+ {formatRupiah2(r.nilaiMenunggu)} menunggu</p>}
            <div className="mt-1.5 flex justify-end">
              <FotoSel paths={fotoPaths} thumbUrl={fotoThumbs[fotoPaths[0] || '']} judul={namaBarangKdp(barang)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-end w-36">
            {bebas ? (
              <>
                <button onClick={onEditSpec} className="w-full inline-flex items-center justify-center bg-teal hover:bg-teal-light text-white text-xs font-medium px-3 py-1.5 rounded-lg">Edit Spesifikasi</button>
                <button onClick={onUbahKapInfo} className="w-full inline-flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Ubah Induk Aset</button>
                <button onClick={onHapusBarang} className="w-full inline-flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Hapus Barang</button>
              </>
            ) : (
              <span title="Barang sudah tercatat (ada termin disetujui) — perbaikan spesifikasi lewat menu Koreksi, atau batalkan seluruh terminnya dulu."
                className="w-full inline-flex items-center justify-center bg-gray-100 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-lg">🔒 Tercatat</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3 border-t border-gray-100">
        {kontrakUrut.length === 0 && tanpaKontrak.length === 0 && formUntuk !== UMUM && (
          <p className="px-1 text-xs text-gray-400">
            Belum ada kontrak. Tambahkan kontrak tiap komponen (perencanaan, fisik, pengawasan), lalu BAST-nya di dalam kontrak itu.
            Biaya umum boleh tanpa kontrak.
          </p>
        )}

        {kontrakUrut.map(k => {
          const pakai = pemakaianKontrak(payload, k.id)
          return (
            <div key={k.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3">
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-gray-800">Kontrak {komponenLabelKdp(k.komponen)}
                    <span className="font-normal text-gray-600"> · {k.no_kontrak} · {k.tgl_kontrak}</span></p>
                  <p className="text-gray-400">
                    {[k.bentuk ? bentukKontrakLabel(k.bentuk) : null, k.penyedia, k.ppk ? `PPK ${k.ppk}` : null,
                      k.nilai_kontrak ? `Nilai ${formatRupiah2(k.nilai_kontrak)}` : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 whitespace-nowrap">
                  {bolehUbah && pakai.disetujui === 0 && <button className="text-xs text-teal hover:underline" onClick={() => setEditKontrak(k)}>Ubah</button>}
                  {bolehUbah && pakai.disetujui + pakai.menunggu === 0 && <button className="text-xs text-red-600 hover:text-red-700" onClick={() => onHapusKontrak(k)}>Hapus</button>}
                  {pakai.disetujui > 0 && <span className="text-[11px] text-gray-400" title="Dipakai BAST yang sudah disetujui — batalkan BAST itu dulu untuk mengubah">🔒</span>}
                  {bolehUbah && formUntuk !== k.id && <button className={TOMBOL_HIJAU} onClick={() => bukaForm(k.id)}>+ Tambah BAST</button>}
                </div>
              </div>
              <TabelBast termin={urut.filter(t => t.kontrak_id === k.id)} />
              {formUntuk === k.id && FormBast()}
            </div>
          )
        })}

        {(tanpaKontrak.length > 0 || formUntuk === UMUM) && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-800">Tanpa Kontrak <span className="font-normal text-gray-400">(biaya umum)</span></div>
            {tanpaKontrak.length > 0 && <TabelBast termin={tanpaKontrak} />}
            {formUntuk === UMUM && FormBast()}
          </div>
        )}

        {bolehUbah && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button className={TOMBOL_HIJAU} onClick={() => setEditKontrak('baru')}>+ Tambah Kontrak</button>
            {formUntuk !== UMUM && <button className={TOMBOL_HIJAU} onClick={() => bukaForm(UMUM)}>+ BAST Biaya Umum (tanpa kontrak)</button>}
            {kontraks.length > 0 && <span className="text-[11px] text-gray-400">Kontrak berlaku untuk seluruh barang di kartu ini.</span>}
          </div>
        )}
      </div>
     </div>

      {editKontrak && (
        <KontrakModal awal={editKontrak === 'baru' ? null : editKontrak} payload={payload} tahunKartu={tahunKartu} skpdId={skpdId}
          onClose={() => setEditKontrak(null)}
          onSimpan={async k => { await onSimpanKontrak(k); setEditKontrak(null) }} />
      )}

      {warnings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(() => setWarnings(null))}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-amber-700">⚠ Konfirmasi Kode Rekening</h3></div>
            <div className="p-5 space-y-2">
              {warnings.map((w, i) => <p key={i} className="text-sm text-gray-700">{w}</p>)}
              <p className="text-xs text-gray-400">Kalau ini keliru, batalkan lalu perbaiki kode rekeningnya dulu. Kalau memang disengaja, silakan lanjutkan.</p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setWarnings(null)}>Batal, perbaiki dulu</button>
              <button className="btn-primary text-sm" onClick={() => void doTambah()}>Ya, tetap tambahkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
