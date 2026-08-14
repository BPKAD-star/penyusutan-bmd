'use client'
// Import massal Standar Harga (SSH · HSPK · ASB · SBU) dari Excel. Alurnya:
// unduh format → isi di Excel → unggah → PERIKSA di layar → baru disimpan.
//
// ⚠️ MASUKNYA KE USULAN, BUKAN KE ACUAN BERSAMA (perubahan 2026-08-14, migrasi
// 20260814_01). Versi sebelumnya memanggil `fn_rkbmd_standar_simpan` langsung
// sehingga ratusan baris bisa mendarat di bak bersama tanpa pernah ditelaah
// siapa pun — persis "shortcut di tengah alur" yang ditutup migrasi itu.
// Sekarang ia cuma cara CEPAT mengisi usulan yang sedang disusun: tetap harus
// diajukan, tetap harus ditetapkan Pengelola di menu Validasi.
//
// Karena isinya belum jadi acuan, tak ada lagi laporan "berapa yang sudah ada /
// berapa rekening digabungkan" — dedup memang baru dikerjakan saat DISETUJUI,
// dan mengarang angkanya di sini akan menyesatkan.
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'
import { STANDAR_CONFIG, SLOT_REKENING, unduhTemplateStandar, type StandarJenis } from '@/lib/rkbmdStandar'
import { simpanItem } from '@/lib/rkbmdStandarUsulan'

/** Satu baris hasil baca berkas + hasil pemeriksaannya. */
type Baris = {
  no: number
  kode: string
  nama: string
  merk: string
  satuan: string
  harga: number
  tkdn: number | null
  rekening: string[]
  keterangan: string
  masalah: string[]
}

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Angka dari sel Excel yang bisa berupa number, "1.500.000", atau "1500000,5".
 *  Titik dibuang sbg pemisah ribuan & koma jadi titik desimal — itu yang
 *  diketik operator Indonesia, dan `Number("1.500.000")` = NaN. */
function angka(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).trim().replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.')
  if (s === '') return null
  const n = Number(s)
  return isNaN(n) ? null : n
}

/** Cari indeks kolom untuk tiap field. DUA TAHAP dan itu bukan kerumitan
 *  berlebih: kecocokan `includes` saja akan membuat alias "satuan" mencaplok
 *  kolom "Besaran / Pagu Satuan" milik ASB, lalu kolom harganya jadi kosong
 *  DIAM-DIAM. Tahap 1 cocok PERSIS (dan mengunci indeksnya), tahap 2 baru
 *  longgar atas kolom yang belum terpakai. */
function petakanKolom(header: string[], alias: Record<string, string[]>): Record<string, number> {
  const out: Record<string, number> = {}
  const dipakai = new Set<number>()
  for (const [field, names] of Object.entries(alias)) {
    const i = header.findIndex((h, idx) => !dipakai.has(idx) && names.includes(h))
    if (i >= 0) { out[field] = i; dipakai.add(i) }
  }
  for (const [field, names] of Object.entries(alias)) {
    if (out[field] != null) continue
    const i = header.findIndex((h, idx) => !dipakai.has(idx) && h !== '' && names.some(n => h.includes(n)))
    if (i >= 0) { out[field] = i; dipakai.add(i) }
  }
  return out
}

export default function StandarImport({ jenis, tahun, usulanId, nomorBerikut, onClose, onSelesai }: {
  jenis: StandarJenis
  tahun: number
  /** Usulan yang sedang disusun — barisnya ditambahkan ke sini. */
  usulanId: string
  /** No urut pertama yang dipakai; baris berikutnya menyusul berurutan. */
  nomorBerikut: number
  onClose: () => void
  onSelesai: (msg: string) => void
}) {
  const cfg = STANDAR_CONFIG[jenis]
  const supabase = createClient()
  const [namaBerkas, setNamaBerkas] = useState('')
  const [rows, setRows] = useState<Baris[]>([])
  const [sibuk, setSibuk] = useState(false)
  const [maju, setMaju] = useState(0)
  const [err, setErr] = useState('')
  // Ringkasan hasil DITAMPILKAN DI DALAM pop-up, bukan cuma dikirim ke induk:
  // pesan induk tercetak di belakang lapisan gelap modal ini, jadi kalau cuma
  // di sana ia praktis tak pernah terbaca.
  const [ringkasan, setRingkasan] = useState('')

  const sah = rows.filter(r => r.masalah.length === 0)
  const cacat = rows.filter(r => r.masalah.length > 0)

  async function bacaBerkas(f: File) {
    setErr(''); setRows([]); setNamaBerkas(f.name); setSibuk(true)
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('Berkas tidak berisi lembar kerja apa pun.')
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

      const alias: Record<string, string[]> = {
        ...(cfg.pakaiKodeBarang ? { kode: ['kodebarang', 'kode'] } : {}),
        nama: [norm(cfg.labelNama), 'namabarang', 'uraian', 'nama'],
        ...(cfg.pakaiKodeBarang ? { merk: ['merktipe', 'merk', 'merek'] } : {}),
        satuan: ['satuan'],
        harga: [norm(cfg.labelHarga), 'hargasatuan', 'harga', 'besaran'],
        ...(cfg.pakaiTkdn ? { tkdn: ['tkdn'] } : {}),
        ...Object.fromEntries(
          Array.from({ length: SLOT_REKENING }, (_, i) => [`rek${i}`, [`koderekening${i + 1}`, ...(i === 0 ? ['koderekening'] : [])]]),
        ),
        keterangan: ['keterangan'],
      }

      // Baris header = baris pertama yang memuat kolom nama. Dicari, tidak
      // dipatok baris 1: berkas yang dibuka-tutup di Excel sering menyisakan
      // baris judul di atasnya.
      const idxHeader = grid.findIndex(r => r.some(c => alias.nama.includes(norm(c))))
      if (idxHeader < 0) {
        throw new Error(`Kolom "${cfg.labelNama}" tidak ditemukan. Pakai berkas hasil "Unduh format import", jangan diubah judul kolomnya.`)
      }
      const header = grid[idxHeader].map(norm)
      const kol = petakanKolom(header, alias)
      if (kol.harga == null) throw new Error(`Kolom "${cfg.labelHarga}" tidak ditemukan di berkas.`)

      const sel = (r: unknown[], f: string) => (kol[f] == null ? '' : String(r[kol[f]] ?? '').trim())

      const hasil: Baris[] = []
      for (let i = idxHeader + 1; i < grid.length; i++) {
        const r = grid[i]
        if (!r || r.every(c => String(c ?? '').trim() === '')) continue

        const masalah: string[] = []
        const kode = cfg.pakaiKodeBarang ? sel(r, 'kode') : ''
        const nama = sel(r, 'nama')
        const nHarga = angka(kol.harga == null ? null : r[kol.harga])
        const tTkdn = cfg.pakaiTkdn ? sel(r, 'tkdn') : ''
        const nTkdn = tTkdn === '' ? null : angka(tTkdn)

        if (cfg.pakaiKodeBarang && !kode) masalah.push('Kode Barang kosong')
        if (!nama) masalah.push(`${cfg.labelNama} kosong`)
        if (nHarga == null) masalah.push(`${cfg.labelHarga} bukan angka`)
        else if (nHarga < 0) masalah.push(`${cfg.labelHarga} negatif`)
        if (tTkdn !== '' && (nTkdn == null || nTkdn < 0 || nTkdn > 100)) masalah.push('TKDN harus 0–100')

        const rekening = [...new Set(
          Array.from({ length: SLOT_REKENING }, (_, k) => sel(r, `rek${k}`)).filter(Boolean),
        )]

        hasil.push({
          no: i + 1, kode, nama, merk: sel(r, 'merk'), satuan: sel(r, 'satuan'), harga: nHarga ?? 0,
          tkdn: nTkdn, rekening, keterangan: sel(r, 'keterangan'), masalah,
        })
      }
      if (hasil.length === 0) throw new Error('Tidak ada baris isi di bawah judul kolom.')

      await periksaReferensi(hasil)
      tandaiKembar(hasil)
      setRows(hasil)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  /** Kode barang & kode rekening punya FOREIGN KEY di DB. Tanpa pemeriksaan di
   *  sini, satu salah ketik cuma memunculkan pesan Postgres mentah di tengah
   *  import — sesudah sebagian baris terlanjur masuk. Lebih murah diperiksa
   *  seluruhnya lebih dulu. */
  async function periksaReferensi(hasil: Baris[]) {
    if (cfg.pakaiKodeBarang) {
      const kodes = [...new Set(hasil.map(r => r.kode).filter(Boolean))]
      const ada = new Set<string>()
      for (let i = 0; i < kodes.length; i += 300) {
        const { data, error } = await supabase.from('admin_kodefikasi_bmd')
          .select('kode').in('kode', kodes.slice(i, i + 300))
        if (error) throw new Error(`gagal memeriksa kode barang: ${error.message}`)
        for (const k of (data || []) as { kode: string }[]) ada.add(k.kode)
      }
      for (const r of hasil) if (r.kode && !ada.has(r.kode)) r.masalah.push('Kode Barang tidak terdaftar di kodefikasi BMD')
    }

    const reks = [...new Set(hasil.flatMap(r => r.rekening))]
    if (reks.length > 0) {
      const ada = new Set<string>()
      for (let i = 0; i < reks.length; i += 300) {
        const { data, error } = await supabase.from('admin_rekening')
          .select('kode_sub_rincian').in('kode_sub_rincian', reks.slice(i, i + 300))
        if (error) throw new Error(`gagal memeriksa kode rekening: ${error.message}`)
        for (const k of (data || []) as { kode_sub_rincian: string }[]) ada.add(k.kode_sub_rincian)
      }
      for (const r of hasil) {
        const salah = r.rekening.filter(k => !ada.has(k))
        if (salah.length > 0) r.masalah.push(`Kode rekening tidak terdaftar: ${salah.join(', ')}`)
      }
    }
  }

  /** Dua baris beridentitas sama di SATU berkas. Di usulan, keduanya BOLEH
   *  tersimpan (tak ada UNIQUE di staging) — tapi saat disetujui keduanya jatuh
   *  ke barang yang sama, jadi memasukkan dua-duanya cuma membuat penelaah
   *  membaca daftar yang lebih panjang dari kenyataannya. Dibuang & dilaporkan. */
  function tandaiKembar(hasil: Baris[]) {
    const lihat = new Set<string>()
    for (const r of hasil) {
      if (r.masalah.length > 0) continue
      const id = [r.kode, r.nama.trim().toLowerCase(), r.satuan.trim().toLowerCase(), r.harga].join('|')
      if (lihat.has(id)) r.masalah.push('Kembar dengan baris di atasnya (kode + nama + satuan + harga sama)')
      else lihat.add(id)
    }
  }

  async function impor() {
    if (sah.length === 0) return
    setSibuk(true); setErr(''); setMaju(0); setRingkasan('')
    let masuk = 0
    const gagal: string[] = []
    try {
      for (const [i, r] of sah.entries()) {
        try {
          await simpanItem(supabase, usulanId, {
            no_urut: nomorBerikut + i,
            kode: cfg.pakaiKodeBarang ? r.kode : null,
            nama: r.nama,
            merk_tipe: cfg.pakaiKodeBarang ? (r.merk || null) : null,
            satuan: r.satuan || null,
            harga: r.harga,
            tkdn: cfg.pakaiTkdn ? r.tkdn : null,
            kuantitas_standar: null,
            satuan_pengukur: null,
            keterangan: r.keterangan || null,
            rekening: r.rekening,
          })
          masuk++
        } catch (e) {
          gagal.push(`baris ${r.no}: ${(e as Error).message}`)
        }
        setMaju(m => m + 1)
      }
      // Laporan JUJUR: sebutkan yang gagal, jangan cuma yang berhasil. Import
      // yang "selesai" padahal separuhnya tak masuk adalah bentuk kegagalan
      // senyap yang paling mahal di modul ini.
      const bagian = [`${masuk} baris masuk ke usulan`]
      if (cacat.length > 0) bagian.push(`${cacat.length} dilewati karena bermasalah`)
      if (gagal.length > 0) bagian.push(`${gagal.length} GAGAL disimpan`)
      const pesan = `Import ${cfg.judul} TA ${tahun}: ${bagian.join(' · ')}. Belum jadi acuan bersama — ajukan dulu ke Pengelola.`
      setRingkasan(pesan)
      onSelesai(pesan)
      if (gagal.length > 0) setErr(`Gagal disimpan:\n${gagal.slice(0, 20).join('\n')}${gagal.length > 20 ? `\n…dan ${gagal.length - 20} lainnya` : ''}`)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-gray-800">Import {cfg.judul} — TA {tahun}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Barisnya masuk ke <span className="font-medium">usulan yang sedang disusun</span>, belum menjadi
              acuan bersama — tetap harus diajukan &amp; ditetapkan Pengelola Barang.
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-sm font-medium text-gray-700 mb-1">1. Unduh formatnya</p>
            <p className="text-xs text-gray-500 mb-3">
              Berisi judul kolom yang siap diisi + satu lembar Petunjuk. Jangan mengubah judul kolomnya.
            </p>
            <button className="btn-secondary text-sm" onClick={() => unduhTemplateStandar(jenis, tahun)}>
              ⬇ Unduh format import ({cfg.jenis.toUpperCase()})
            </button>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-medium text-gray-700 mb-1">2. Unggah berkas yang sudah diisi</p>
            <input type="file" accept=".xlsx,.xls" className="text-sm mt-2"
              onChange={e => { const f = e.target.files?.[0]; if (f) bacaBerkas(f) }} disabled={sibuk} />
            {namaBerkas && <p className="text-xs text-gray-400 mt-2">{namaBerkas}</p>}
          </div>

          {ringkasan && <div className="p-3 rounded-lg bg-teal/5 border border-teal/20 text-gray-700 text-sm">{ringkasan}</div>}
          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div>}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-gray-600">{rows.length} baris terbaca</span>
                <span className="text-teal">{sah.length} siap diimpor</span>
                {cacat.length > 0 && <span className="text-red-600">{cacat.length} bermasalah (dilewati)</span>}
              </div>

              <div className="border border-gray-100 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th w-12">Baris</th>
                      {cfg.pakaiKodeBarang && <th className="table-th">Kode Barang</th>}
                      <th className="table-th">{cfg.labelNama}</th>
                      {cfg.pakaiKodeBarang && <th className="table-th">Merk / Tipe</th>}
                      <th className="table-th">Satuan</th>
                      <th className="table-th text-right">{cfg.labelHarga}</th>
                      <th className="table-th">Kode Rekening</th>
                      {cfg.pakaiTkdn && <th className="table-th text-right">TKDN</th>}
                      <th className="table-th">Pemeriksaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => (
                      <tr key={r.no} className={r.masalah.length > 0 ? 'bg-red-50/50' : ''}>
                        <td className="table-td text-xs text-gray-400">{r.no}</td>
                        {cfg.pakaiKodeBarang && <td className="table-td text-xs whitespace-nowrap">{r.kode || '—'}</td>}
                        <td className="table-td text-xs text-gray-800">{r.nama || '—'}</td>
                        {cfg.pakaiKodeBarang && <td className="table-td text-xs text-gray-500">{r.merk || '—'}</td>}
                        <td className="table-td text-xs text-gray-500">{r.satuan || '—'}</td>
                        <td className="table-td text-xs text-right whitespace-nowrap">{r.harga.toLocaleString('id-ID')}</td>
                        <td className="table-td text-xs text-gray-500">{r.rekening.join(', ') || '—'}</td>
                        {cfg.pakaiTkdn && <td className="table-td text-xs text-right">{r.tkdn != null ? `${r.tkdn}%` : '—'}</td>}
                        <td className="table-td text-xs">
                          {r.masalah.length === 0
                            ? <span className="text-teal">✓</span>
                            : <span className="text-red-600">{r.masalah.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-2 sticky bottom-0 bg-white">
          <span className="text-xs text-gray-400">
            {sibuk && maju > 0 ? `Menyimpan ${maju} dari ${sah.length}...` : ''}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={sibuk}>Tutup</button>
            <button className="btn-primary" onClick={impor} disabled={sibuk || sah.length === 0}>
              {sibuk ? 'Menyimpan...' : `Impor ${sah.length} baris`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
