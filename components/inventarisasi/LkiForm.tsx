'use client'
// Form Lembar Kerja Inventarisasi (LKI) — SATU komponen untuk semua golongan,
// dikendalikan `LKI_CONFIG`/`LKI_MATRIX` (lib/inventarisasi.ts). Format
// III.A.1–III.A.6 isinya ±90% sama; yang berbeda cuma bagian opsional
// (Merek/Tipe, spesifikasi lainnya, nomor kendaraan, data teknis JIJ, pemakai
// rumah negara, "di atas tanah milik", atribusi/kapitalisasi).
//
// PRINSIP ISIAN (koreksi user 2026-07-27):
//   * Yang TIDAK boleh diubah lewat LKI: NIBAR — ditampilkan apa adanya.
//     Mengubahnya urusan menu Koreksi, bukan inventarisasi. Jumlah & Nilai
//     Perolehan juga begitu, tapi sejak 2026-09-28 TAK LAGI DITAMPILKAN sama
//     sekali (keputusan user) — dua-duanya cuma angka register yang tak bisa
//     dikoreksi di sini, jadi tak perlu memakan baris form.
//   * Yang dikoreksi TIDAK diketik bebas, tapi dipilih dari master:
//     kode barang → KodefikasiPicker (DIKUNCI ke golongan lembar ini),
//     satuan → admin_satuan_bmd, wilayah → admin_wilayah (berjenjang, form
//     TERPISAH dari Alamat Detail — keputusan user 2026-09-28),
//     induk & pasangan-ganda → AsetPicker (DIKUNCI ke SKPD lembar ini).
//   * Kode Barang & Nama Barang digabung: cukup pilih kodenya, uraian ikut.
//   * URUTAN bagian mengikuti berkas kerja user "Alur Inventarisasi.xlsx"
//     (2026-09-25/28) — TIDAK mengikuti urutan huruf Permendagri A–R. Kode
//     huruf di tiap `Seksi` cuma rujukan ke Format resmi (boleh terulang, spt
//     D/F/L/Q di sini) & TIDAK dipakai lembar CETAK, yang punya urutannya
//     sendiri.
//
// Baris "BMD Belum Tercatat" (Format III.A.7, aset_id NULL) memakai layout
// BERBEDA: barangnya belum ada di sistem, jadi semua data diketik manual.
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import WilayahPicker from '@/components/WilayahPicker'
import NominalInput from '@/shared/ui/NominalInput'
import { FotoSel, useFotoThumbs } from '@/shared/ui/FotoBarang'
import {
  normalKondisi, klasifikasiLhi, kekuranganLki, LHI_LABEL, PESAN_FOTO_LKI, BUCKET_FOTO_INVENTARISASI,
  SEBAB_TIDAK_ADA, SEBAB_BUTUH_RELASI, type SebabTidakAda,
  sesuaiTampil, atribusiTampil, digunakanSendiriTampil,
  type InvBaris, type InvJawaban, type LkiConfig,
  type KondisiFisik, type PihakPengguna,
} from '@/lib/inventarisasi'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

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

/** Kotak "Tercatat: ..." — nilai LIVE yang sedang berlaku, bukan isian. */
function KotakTercatat({ nilai }: { nilai?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5">
      <p className="text-[10px] font-medium text-blue-400 uppercase tracking-wide">Tercatat</p>
      <p className="text-xs text-blue-900 mt-0.5">{nilai || '—'}</p>
    </div>
  )
}

/**
 * Radio Sesuai / Tidak Sesuai. Isian koreksinya disuplai lewat `children`.
 * `sesuai` TRI-STATE (keputusan user 2026-09-24): `undefined` = belum dijawab
 * sama sekali → KEDUA radio polos, tak ada yang tercentang. Sebelumnya
 * `undefined` diam-diam dirender sbg "Sesuai" tercentang — form seolah sudah
 * menjawab sebelum user mengklik apa pun. Nilai tri-state-nya sendiri
 * dihitung pemanggil lewat `sesuaiTampil()` (lib/inventarisasi.ts).
 */
function SesuaiRadio({ sesuai, onSesuai, disabled, nilaiLama, children }: {
  sesuai: boolean | undefined
  onSesuai: (v: boolean) => void
  disabled?: boolean
  nilaiLama?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <KotakTercatat nilai={nilaiLama} />
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={sesuai === true} disabled={disabled} onChange={() => onSesuai(true)} />
          Sesuai
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={sesuai === false} disabled={disabled} onChange={() => onSesuai(false)} />
          Tidak Sesuai
        </label>
      </div>
      {sesuai === false && <div className="pt-1">{children}</div>}
    </div>
  )
}

export default function LkiForm({ baris, config, golongan, skpdId, readOnly, pesanReadOnly, onSimpan, onTutup }: {
  baris: InvBaris
  config: LkiConfig
  /** Golongan lembar ini — mengunci pilihan kodefikasi & pencarian induk. */
  golongan: string
  /** SKPD barang ini — mengunci pencarian induk & pasangan tercatat-ganda. */
  skpdId: number
  readOnly?: boolean
  /** Alasan lembar hanya bisa dilihat — beda per keadaan (sudah divalidasi,
   *  barang sudah pindah, pengawas). Tanpa alasan, lembar yang tak bisa
   *  disimpan terbaca sebagai form yang rusak. */
  pesanReadOnly?: string
  onSimpan: (jawaban: InvJawaban, fotoPaths: string[]) => Promise<void>
  onTutup: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const belumTercatat = !baris.aset_id
  // Lembar yang BELUM PERNAH disimpan — dipakai tri-state radio (Sesuai/
  // Tidak Sesuai, atribusi, Penggunaan Barang) supaya defaultnya polos, tak
  // ada yang tercentang sebelum user mengklik (keputusan user 2026-09-24).
  const isBaru = !baris.id
  const s = baris.snapshot || {}
  const [j, setJ] = useState<InvJawaban>(() => ({ ...(baris.jawaban || {}) }))
  const [foto, setFoto] = useState<string[]>(baris.foto_paths || [])
  const [induk, setInduk] = useState<AsetRingkas | null>(null)
  const [relasiAset, setRelasiAset] = useState<AsetRingkas | null>(null)
  const [gandaAset, setGandaAset] = useState<AsetRingkas | null>(null)
  // Seed dari jawaban tersimpan supaya lembar yang dibuka ulang tetap
  // menampilkan kode yang sudah dipilih, bukan picker kosong.
  const [kodefikasi, setKodefikasi] = useState<KodefikasiHasil | null>(() => {
    const jw = baris.jawaban || {}
    const kode = baris.aset_id ? jw.kode_barang?.kode_baru : jw.baru?.kode_barang
    const uraian = baris.aset_id ? jw.kode_barang?.uraian_baru : jw.baru?.nama_barang
    if (!kode) return null
    return {
      kode, uraian: uraian || null, nama_objek: null, nama_rincian: null,
      nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null,
    }
  })
  const [satuanOpsi, setSatuanOpsi] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof InvJawaban>(k: K, v: InvJawaban[K]) => setJ(p => ({ ...p, [k]: v }))
  /** Ganti keberadaan; sebab "tidak ada" hanya hidup selama "tidak ditemukan". */
  const setKeberadaan = (v: NonNullable<InvJawaban['keberadaan']>) =>
    setJ(p => v === 'tidak_ditemukan'
      ? { ...p, keberadaan: v }
      : { ...p, keberadaan: v, sebab_tidak_ada: undefined, sebab_relasi: undefined, sebab_pecahan: undefined })
  const setSebab = (v: SebabTidakAda) =>
    setJ(p => ({
      ...p, sebab_tidak_ada: v, sebab_relasi: undefined,
      sebab_pecahan: v === 'beberapa_register' ? ['', ''] : undefined,
    }))
  const setPecahan = (fn: (a: string[]) => string[]) =>
    setJ(p => ({ ...p, sebab_pecahan: fn(p.sebab_pecahan || []) }))
  const setBaru = (k: string, v: unknown) => setJ(p => ({ ...p, baru: { ...(p.baru || {}), [k]: v } }))

  /** Jumlah & Harga Satuan sekaligus menghitung ulang Nilai Perolehan
   *  (Format III.A.7 butir 9, 11, 12). Hasilnya tetap boleh ditimpa manual —
   *  ada barang temuan yang nilainya lump-sum, bukan hasil perkalian. */
  const setJumlahHarga = (k: 'jumlah' | 'harga_satuan', raw: string) => {
    const v = raw === '' ? undefined : Number(raw)
    setJ(p => {
      const baru = { ...(p.baru || {}), [k]: v }
      const jml = k === 'jumlah' ? v : baru.jumlah
      const hrg = k === 'harga_satuan' ? v : baru.harga_satuan
      if (jml != null && hrg != null) baru.nilai_perolehan = jml * hrg
      return { ...p, baru }
    })
  }

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
      const { error } = await supabase.storage.from(BUCKET_FOTO_INVENTARISASI).upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setFoto(prev => [...prev, path])
    }
    setUploading(false)
  }
  async function hapusFoto(path: string) {
    await supabase.storage.from(BUCKET_FOTO_INVENTARISASI).remove([path])
    setFoto(prev => prev.filter(p => p !== path))
  }

  /** Satu aturan (`kekuranganLki`) untuk dua pintu: daftar di kaki form & penjaga Simpan. */
  const hitungKurang = () => kekuranganLki({
    aset_id: baris.aset_id, jawaban: j, foto_paths: foto,
    foto_register: (s.foto_paths || []).length,
    sebabTidakAda: config.sebabTidakAda, sebabNoun: config.sebabNoun,
  })

  async function simpan() {
    // Tombolnya sengaja TIDAK dimatikan: tombol mati tanpa keterangan adalah
    // kegagalan senyap. Penolakannya berupa POP-UP, bukan banner di puncak modal —
    // modal ini panjang & petugas biasanya sedang di bagian bawah, jadi banner di
    // atas tak pernah terlihat (keluhan user 2026-10-01).
    const k = hitungKurang()
    if (k.length > 0) {
      const fotoKurang = k.includes(PESAN_FOTO_LKI)
      await konfirmasi({
        nada: 'amber', ikon: fotoKurang ? '📷' : '⚠',
        judul: fotoKurang ? 'Foto barang belum disertakan' : 'Isian belum lengkap',
        subjudul: 'Lembar belum bisa disimpan.',
        isi: (
          <div className="text-sm text-gray-700 space-y-2">
            {fotoKurang && (
              <p>Sertakan <b>minimal satu foto</b> barang di bagian <b>R. Foto / Denah</b> sebelum menyimpan.</p>
            )}
            <p>{fotoKurang && k.length > 1 ? 'Isian lain yang juga masih kurang:' : 'Lengkapi isian berikut:'}</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {k.filter(x => x !== PESAN_FOTO_LKI).map(x => <li key={x}>{x}</li>)}
              {fotoKurang && <li>{PESAN_FOTO_LKI}</li>}
            </ul>
          </div>
        ),
        labelYa: 'Mengerti', tanpaBatal: true,
      })
      return
    }
    setSaving(true); setErr('')
    try { await onSimpan(j, foto); onTutup() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setSaving(false)
  }

  // Pratinjau LHI: fungsi klasifikasi yang SAMA dgn laporan, jadi isi laporan
  // tak mungkin berbeda dari yang terlihat di sini.
  const lhi = klasifikasiLhi({ ...baris, jawaban: j })
  const kurang = readOnly ? [] : hitungKurang()
  const atribusiVal = atribusiTampil(j.atribusi, isBaru)
  const digunakanSendiri = digunakanSendiriTampil(j.penggunaan, isBaru)
  // Titik Koordinat (O): peta di dalam "Tidak Sesuai" berangkat dari titik
  // register, lalu yang diklik/diketik menang (termasuk `null` kalau dihapus).
  const latTampil = j.latitude !== undefined ? j.latitude : (s.latitude ?? null)
  const lngTampil = j.longitude !== undefined ? j.longitude : (s.longitude ?? null)
  const titikTercatat = s.latitude != null && s.longitude != null ? `${s.latitude}, ${s.longitude}` : null
  const fotoReg = s.foto_paths || []
  const fotoThumbs = useFotoThumbs(fotoReg.slice(0, 1))

  /** Satu isian teks Sesuai/Tidak Sesuai — bentuk yang sama dipakai banyak bagian. */
  const isianTeks = (
    key: 'spesifikasi_lainnya' | 'luas' | 'merek_tipe' | 'no_polisi' | 'no_rangka' | 'no_mesin' | 'no_bpkb' | 'keterangan_barang' | 'alamat_detail',
    lama: string | number | null | undefined,
    opsi: { angka?: boolean } = {},
  ) => (
    <SesuaiRadio
      nilaiLama={lama == null || lama === '' ? null : String(lama)}
      sesuai={sesuaiTampil(j[key], isBaru)}
      disabled={readOnly}
      onSesuai={v => set(key, v ? { sesuai: true } : { sesuai: false, seharusnya: j[key]?.seharusnya || '' })}
    >
      <input className="select-filter w-full" disabled={readOnly}
        type={opsi.angka ? 'number' : 'text'}
        placeholder="sebutkan yang seharusnya..."
        value={j[key]?.seharusnya || ''}
        onChange={e => set(key, { sesuai: false, seharusnya: e.target.value })} />
    </SesuaiRadio>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onTutup)}>
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
              {pesanReadOnly || 'Lembar ini hanya bisa dilihat.'}
            </div>
          )}
          {!readOnly && baris.catatan_validator && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
              <b>Catatan Pengelola Barang:</b> {baris.catatan_validator}
            </div>
          )}

          {belumTercatat ? (
            // ── Format III.A.7 — BMD Belum Tercatat ───────────────────────────
            // 19 isian sesuai lampiran (butir 17–18 Catatan Inventarisasi/Foto
            // dipakai bersama lembar biasa, ada di bawah). Meski Permendagri
            // memberi SATU format utk semua golongan, isiannya di sini tetap
            // memakai master data yang sama dgn lembar biasa — kalau di sini
            // boleh ketik bebas, barang temuan bakal masuk dgn kode/satuan/
            // alamat yang tak cocok dgn barang yang sudah tercatat.
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Kode Barang &amp; Nama Barang</label>
                <KodefikasiPicker
                  picked={kodefikasi}
                  golonganTetap={golongan}
                  onPick={r => {
                    setKodefikasi(r)
                    setJ(p => ({
                      ...p,
                      baru: { ...(p.baru || {}), kode_barang: r?.kode || '', nama_barang: r?.uraian || '' },
                    }))
                  }}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Nama Barang otomatis dari uraian kodefikasi. Pilihan dibatasi golongan <b>{golongan}</b>.
                </p>
              </div>
              {([
                ['spesifikasi', 'Nama Spesifikasi Barang'], ['kode_register', 'Kode Register'],
              ] as [string, string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input className="select-filter w-full" disabled={readOnly}
                    value={(j.baru?.[k as keyof typeof j.baru] as string) || ''}
                    onChange={e => setBaru(k, e.target.value)} />
                </div>
              ))}
              {config.merekTipe && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {config.nomorKendaraan ? 'Merek / Tipe' : 'Merek / Tipe / Spesifikasi Lainnya'}
                  </label>
                  <input className="select-filter w-full" disabled={readOnly}
                    value={j.baru?.merek_tipe || ''} onChange={e => setBaru('merek_tipe', e.target.value)} />
                </div>
              )}
              {/* Butir 6–8 bertanda **) di lampiran: "hanya diisi untuk
                  kendaraan dinas" — jadi ikut config, bukan selalu tampil. */}
              {config.nomorKendaraan && ([
                ['no_polisi', 'Nomor Polisi'], ['no_rangka', 'Nomor Rangka'], ['no_mesin', 'Nomor Mesin'],
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
                  value={j.baru?.jumlah ?? ''} onChange={e => setJumlahHarga('jumlah', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Satuan Barang</label>
                <select className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.satuan || ''} onChange={e => setBaru('satuan', e.target.value)}>
                  <option value="">— pilih satuan —</option>
                  {satuanOpsi.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Daftar dari menu Admin → Daftar Satuan.</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Satuan (Rp)</label>
                <NominalInput className="select-filter w-full" disabled={readOnly}
                  value={String(j.baru?.harga_satuan ?? '')} onChange={v => setJumlahHarga('harga_satuan', v)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nilai Perolehan (Rp)</label>
                <NominalInput className="select-filter w-full" disabled={readOnly}
                  value={String(j.baru?.nilai_perolehan ?? '')} onChange={v => setBaru('nilai_perolehan', Number(v))} />
                <p className="text-[11px] text-gray-400 mt-1">
                  Terisi otomatis dari Jumlah × Harga Satuan; boleh ditimpa manual.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal Perolehan</label>
                <input type="date" className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.tgl_perolehan || ''} onChange={e => setBaru('tgl_perolehan', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Alamat</label>
                <div className="space-y-2">
                  <WilayahPicker
                    value={j.baru?.wilayah_kode || ''}
                    onChange={kode => setBaru('wilayah_kode', kode)}
                  />
                  <input className="select-filter w-full" disabled={readOnly}
                    placeholder="Detail alamat (jalan, nomor, RT/RW)..."
                    value={j.baru?.alamat_detail || ''}
                    onChange={e => setBaru('alamat_detail', e.target.value)} />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Dasar Pencatatan</label>
                <input className="select-filter w-full" disabled={readOnly}
                  value={j.baru?.dasar_pencatatan || ''} onChange={e => setBaru('dasar_pencatatan', e.target.value)} />
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
                  sesuai={sesuaiTampil(j.kode_barang, isBaru)}
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
                  sesuai={sesuaiTampil(j.spesifikasi, isBaru)}
                  disabled={readOnly}
                  onSesuai={v => set('spesifikasi', v ? { sesuai: true } : { sesuai: false, seharusnya: j.spesifikasi?.seharusnya || '' })}
                >
                  <input className="select-filter w-full" disabled={readOnly}
                    placeholder="sebutkan spesifikasi yang seharusnya..."
                    value={j.spesifikasi?.seharusnya || ''}
                    onChange={e => set('spesifikasi', { sesuai: false, seharusnya: e.target.value })} />
                </SesuaiRadio>
              </Seksi>

              {config.merekTipe && (
                <Seksi kode="L" judul="Merek / Tipe">
                  {isianTeks('merek_tipe', s.merek_tipe)}
                </Seksi>
              )}

              {config.spesifikasiLainnya && (
                <Seksi kode="D" judul="Spesifikasi Lainnya">
                  {isianTeks('spesifikasi_lainnya', s.spesifikasi_lainnya)}
                </Seksi>
              )}

              {config.nomorKendaraan && (
                <Seksi kode="M–O" judul="Nomor Polisi / Rangka / Mesin / BPKB (kendaraan)">
                  <p className="text-[11px] text-gray-400 mb-2">Bukan kendaraan? Cukup pilih Sesuai.</p>
                  <div className="space-y-3">
                    {([
                      ['no_polisi', 'Nomor Polisi', s.no_polisi],
                      ['no_rangka', 'Nomor Rangka', s.no_rangka],
                      ['no_mesin', 'Nomor Mesin', s.no_mesin],
                      ['no_bpkb', 'Nomor BPKB', s.no_bpkb],
                    ] as const).map(([key, label, lama]) => (
                      <div key={key}>
                        <p className="text-[11px] font-medium text-gray-600 mb-1">{label}</p>
                        {isianTeks(key, lama)}
                      </div>
                    ))}
                  </div>
                </Seksi>
              )}

              {/* Format III.A.4 — empat isian teknis khas JIJ. Di luar matriks
                  golongan (tak ada kolomnya di spreadsheet), ditempatkan di
                  sini krn JIJ tak punya merekTipe/spesifikasiLainnya/
                  nomorKendaraan — posisi alaminya sebelum Luas. Keempatnya
                  belum punya kolom di `aset`, jadi "Tercatat" kosong —
                  petugas mengisi keadaan sebenarnya di lapangan. */}
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
                          sesuai={sesuaiTampil(j[key], isBaru)}
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

              {config.luas && (
                <Seksi kode="F" judul="Luas (m²)">
                  {isianTeks('luas', s.luas, { angka: true })}
                </Seksi>
              )}

              {/* J — Wilayah & Alamat Detail: DUA form terpisah (keputusan
                  user 2026-09-28), bukan satu blok seperti sebelumnya — satu
                  barang bisa saja wilayahnya sudah benar sementara cuma nomor
                  jalannya yang perlu dikoreksi, atau sebaliknya. */}
              <Seksi kode="J" judul="Wilayah (Provinsi / Kabupaten / Kecamatan / Desa)">
                <SesuaiRadio
                  nilaiLama={s.wilayah}
                  sesuai={sesuaiTampil(j.wilayah, isBaru)}
                  disabled={readOnly}
                  onSesuai={v => set('wilayah', v ? { sesuai: true } : { sesuai: false, wilayah_kode: j.wilayah?.wilayah_kode || '' })}
                >
                  <WilayahPicker
                    value={j.wilayah?.wilayah_kode || ''}
                    onChange={kode => set('wilayah', { sesuai: false, wilayah_kode: kode })}
                  />
                </SesuaiRadio>
              </Seksi>

              <Seksi kode="J" judul="Alamat Detail">
                {isianTeks('alamat_detail', s.alamat)}
              </Seksi>

              {config.titikKoordinat && (
                <Seksi kode="O" judul="Titik Koordinat">
                  <SesuaiRadio
                    nilaiLama={titikTercatat}
                    sesuai={j.koordinat?.sesuai ?? (isBaru ? undefined : true)}
                    disabled={readOnly}
                    onSesuai={v => setJ(p => v
                      // Sesuai → buang titik koreksi supaya tak ada titik "seharusnya" yatim.
                      ? { ...p, koordinat: { sesuai: true }, latitude: undefined, longitude: undefined }
                      : { ...p, koordinat: { sesuai: false } })}
                  >
                  <div className="space-y-2">
                    <MapPicker
                      latitude={latTampil != null ? String(latTampil) : ''}
                      longitude={lngTampil != null ? String(lngTampil) : ''}
                      onChange={(lat, lng) => setJ(p => ({
                        ...p,
                        latitude: lat === '' ? null : Number(lat),
                        longitude: lng === '' ? null : Number(lng),
                      }))}
                    />
                    <p className="text-[11px] text-gray-400">
                      Peta berangkat dari titik yang tercatat — klik untuk menandai titik yang
                      seharusnya, atau ketik koordinatnya langsung.
                    </p>
                  </div>
                  </SesuaiRadio>
                </Seksi>
              )}

              <Seksi kode="F" judul="Satuan Barang">
                <SesuaiRadio
                  nilaiLama={s.satuan}
                  sesuai={sesuaiTampil(j.satuan, isBaru)}
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
                      onChange={() => setKeberadaan('ada')} />Ada
                  </label>
                  {config.hilangVsTidakDitemukan ? (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'hilang'} disabled={readOnly}
                          onChange={() => setKeberadaan('hilang')} />Tidak ada — Hilang (kecurian)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'tidak_ditemukan'} disabled={readOnly}
                          onChange={() => setKeberadaan('tidak_ditemukan')} />Tidak ada — Tidak ditemukan
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'tidak_ditemukan'} disabled={readOnly}
                          onChange={() => setKeberadaan('tidak_ditemukan')} />Tidak ada / tidak ditemukan
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={j.keberadaan === 'hilang'} disabled={readOnly}
                          onChange={() => setKeberadaan('hilang')} />Hilang karena kecurian
                      </label>
                    </>
                  )}
                </div>
                {config.sebabTidakAda && j.keberadaan === 'tidak_ditemukan' && (
                  <div className="mt-3 ml-1 pl-3 border-l-2 border-amber-300 space-y-2 text-xs">
                    <p className="font-medium text-gray-700">Tidak ada karena...</p>
                    {SEBAB_TIDAK_ADA.map(o => (
                      <div key={o.v}>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={j.sebab_tidak_ada === o.v} disabled={readOnly}
                            onChange={() => setSebab(o.v)} />
                          {o.l(config.sebabNoun)}
                          <span className="text-[10px] text-gray-400">→ {o.lhi}</span>
                        </label>
                        {j.sebab_tidak_ada === o.v && SEBAB_BUTUH_RELASI.includes(o.v) && (
                          <div className="ml-5 mt-1.5 space-y-1.5">
                            <p className="text-[11px] text-gray-500">
                              {o.v === 'digabung'
                                ? <>Pilih <b>{config.sebabNoun} induk</b> tempat barang ini digabung.</>
                                : <>Pilih <b>{config.sebabNoun} baru (anak)</b> hasil rehab barang ini.</>}
                              {' '}Dicari <b>hanya di SKPD lembar ini</b>, golongan <b>{golongan}</b>.
                            </p>
                            <AsetPicker selected={relasiAset} skpdId={skpdId} kodePrefix={golongan}
                              onSelect={a => {
                                if (a && a.id === baris.aset_id) { setErr('Barang yang dipilih tidak boleh barang ini sendiri.'); return }
                                setErr('')
                                setRelasiAset(a)
                                set('sebab_relasi', a ? {
                                  aset_id: a.id, nibar: a.nibar || '', kode_barang: a.kode,
                                  nama_barang: a.nama_barang || '',
                                } : undefined)
                              }} />
                            {j.sebab_relasi?.nibar && (
                              <p className="text-[11px] text-teal">
                                {o.v === 'digabung' ? 'Induk' : 'Anak'}: {j.sebab_relasi.nibar} — {j.sebab_relasi.nama_barang}
                              </p>
                            )}
                          </div>
                        )}
                        {j.sebab_tidak_ada === o.v && o.v === 'beberapa_register' && (
                          <div className="ml-5 mt-1.5 space-y-1.5">
                            <p className="text-[11px] text-gray-500">
                              Isi nama tiap {config.sebabNoun} yang seharusnya tercatat sendiri. Tindak lanjut:
                              Pembukuan → Koreksi → Pemecahan Barang.
                            </p>
                            {(j.sebab_pecahan || []).map((n, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input className="select-filter w-full max-w-md" disabled={readOnly}
                                  placeholder={`Nama ${config.sebabNama} ${i + 1}`}
                                  value={n}
                                  onChange={e => setPecahan(a => a.map((x, ix) => ix === i ? e.target.value : x))} />
                                {!readOnly && (j.sebab_pecahan || []).length > 2 && (
                                  <button type="button" className="text-red-500 text-[11px] hover:underline"
                                    onClick={() => setPecahan(a => a.filter((_, ix) => ix !== i))}>Hapus</button>
                                )}
                              </div>
                            ))}
                            {!readOnly && (
                              <button type="button" className="text-teal text-[11px] font-medium hover:underline"
                                onClick={() => setPecahan(a => [...a, ''])}>
                                + Tambah {config.sebabNama}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Seksi>

              {config.atribusi && (
                <Seksi kode="I" judul="Apakah nilai perolehan merupakan biaya atribusi / menambah kapasitas manfaat?">
                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={atribusiVal === 'ya_induk_diketahui'} disabled={readOnly}
                        onChange={() => set('atribusi', 'ya_induk_diketahui')} />
                      Ya — data awal/induknya <b>diketahui</b>
                    </label>
                    {atribusiVal === 'ya_induk_diketahui' && (
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
                      <input type="radio" checked={atribusiVal === 'ya_induk_tidak_diketahui'} disabled={readOnly}
                        onChange={() => set('atribusi', 'ya_induk_tidak_diketahui')} />
                      Ya — data awal/induknya <b>tidak diketahui</b>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={atribusiVal === 'bukan'} disabled={readOnly}
                        onChange={() => set('atribusi', 'bukan')} />
                      Bukan biaya atribusi / tidak menambah kapasitas manfaat
                    </label>
                  </div>
                </Seksi>
              )}

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

              <Seksi kode="L" judul="Penggunaan Barang">
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={digunakanSendiri} disabled={readOnly}
                      onChange={() => set('penggunaan', null)} />
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

              <Seksi kode="Q" judul="Keterangan Barang">
                {isianTeks('keterangan_barang', s.keterangan)}
              </Seksi>
            </>
          )}

          {/* Q — Catatan Inventarisasi: SATU catatan bebas petugas tentang
              PROSES inventarisasi ini (keputusan user 2026-09-28), BUKAN
              perbandingan terhadap `aset.keterangan` (itu Seksi "Keterangan
              Barang" di atas) — jadi tak ada Sesuai/Tidak Sesuai di sini,
              hanya ketikan bebas. Menggantikan "P. Lainnya" + "Q. Keterangan"
              yang dulu dua kolom terpisah tapi maksudnya sama-sama catatan
              petugas. */}
          <Seksi kode="Q" judul="Catatan Inventarisasi">
            <textarea className="select-filter w-full" rows={2} disabled={readOnly}
              placeholder="Catatan petugas tentang inventarisasi ini..."
              value={j.keterangan || ''} onChange={e => set('keterangan', e.target.value)} />
          </Seksi>

          <Seksi kode="R" judul="Foto / Denah">
            {!belumTercatat && (
              <div className="mb-2 space-y-1.5">
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5 flex items-center gap-2">
                  <p className="text-[10px] font-medium text-blue-400 uppercase tracking-wide">Tercatat</p>
                  {fotoReg.length > 0
                    ? <FotoSel paths={fotoReg} thumbUrl={fotoThumbs[fotoReg[0]]} judul={s.nama_barang} />
                    : <span className="text-xs text-blue-900">— belum ada foto di register</span>}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" disabled={readOnly}
                      checked={(j.foto_barang?.sesuai ?? (isBaru ? undefined : true)) === true}
                      onChange={() => set('foto_barang', { sesuai: true })} />
                    Sesuai
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" disabled={readOnly} checked={j.foto_barang?.sesuai === false}
                      onChange={() => set('foto_barang', { sesuai: false })} />
                    Tidak Sesuai — unggah foto terbaru di bawah
                  </label>
                </div>
              </div>
            )}
            {!readOnly && kurang.includes(PESAN_FOTO_LKI) && (
              <p className="mb-1.5 text-xs text-amber-700">
                ⚠ Wajib — sertakan minimal satu foto barang sebelum lembar ini bisa disimpan.
              </p>
            )}
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

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
          {kurang.length > 0 && (
            <p className="mr-auto text-[11px] text-amber-700">Belum lengkap: {kurang.join(', ')}</p>
          )}
          <button onClick={onTutup} className="btn-secondary text-sm">Tutup</button>
          {!readOnly && (
            <button onClick={simpan} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Menyimpan...' : 'Simpan Isian'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
