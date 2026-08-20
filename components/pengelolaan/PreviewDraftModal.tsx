'use client'
// ============================================================================
// PreviewDraftModal — "lihat kelengkapan" isi satu kartu Cara Perolehan.
//
// Permintaan user 2026-08-20: tombol di sebelah Setujui yang membuka rincian
// SELURUH barang di kartu itu, dengan kolom menyesuaikan jenis asetnya.
//
// MAKSUDNYA MEMERIKSA KEKOSONGAN, bukan sekadar menampilkan ulang. Tabel di
// kartu cuma memuat 6–7 kolom ringkas, sementara satu barang Tanah punya 14
// field spesifikasi — sisanya cuma kelihatan kalau pop-up Edit Spesifikasi
// dibuka SATU PER SATU. Untuk kontrak berisi puluhan barang itu praktis
// mustahil, jadi barang dengan nomor rangka kosong (atau dokumen kepemilikan
// kosong) lolos ke register tanpa ada yang sadar. Karena itu yang KOSONG
// justru ditandai paling menonjol di sini.
//
// ⚠️ KOLOM DITURUNKAN DARI `fieldsForKode()`, JANGAN diketik ulang per jenis
// aset. Fungsi itu SUMBER YANG SAMA yang dipakai form isian
// (EditSpesifikasiModal) untuk memutuskan field mana yang ditawarkan. Menyalin
// daftarnya ke sini akan melahirkan penyimpangan yang paling berbahaya untuk
// fitur ini: preview yang bilang "lengkap" karena kolom yang belum terisi
// kebetulan tak ikut ditampilkan.
//
// Satu kartu BOLEH berisi beberapa golongan sekaligus (mis. kontrak berisi
// kendaraan + gedung), jadi barang DIKELOMPOKKAN per golongan dan tiap
// kelompok punya susunan kolomnya sendiri — menyatukannya jadi satu tabel
// berarti kolom milik golongan lain tampil kosong dan terbaca sbg "belum
// diisi".
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'
import { fieldsForKode, FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import { kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import { useFotoThumbs, FotoSel } from '@/shared/ui/FotoBarang'

/** Satu barang draft, dinormalkan oleh pemanggil (bentuk DraftItem-nya beda tipis). */
export type PreviewItem = {
  key: string
  kode: string
  uraianBarang: string
  satuan: string
  /**
   * Nilai yang BENAR-BENAR akan dicatat — pemanggil sudah mengubahnya jadi
   * angka dgn pembaca yang sama seperti saat approve. Sengaja bukan string
   * mentah: pratinjau yang menampilkan angka berbeda dari yang akan tersimpan
   * justru kebalikan dari gunanya.
   */
  harga: number
  fields: Record<string, string>
  foto: string[]
  /** Kolom khas menu: Pengadaan → kode rekening; Perolehan manual → tgl perolehan. */
  ekstra?: Record<string, string>
}

export type KolomEkstra = { key: string; label: string }

const KOSONG = Symbol('kosong')

/** Nilai siap tampil, atau KOSONG kalau memang belum diisi. */
function nilaiField(
  it: PreviewItem, k: FieldKey, wilayah: Record<string, string>,
): string | typeof KOSONG {
  const v = (it.fields[k] ?? '').toString().trim()
  if (v === '') return KOSONG
  // `wilayah_kode` disimpan sebagai kode ('35.06.13.2002') — tak terbaca manusia,
  // padahal justru inilah yang perlu diperiksa benar/tidaknya.
  if (k === 'wilayah_kode') return wilayah[v] || v
  return v
}

export default function PreviewDraftModal({
  judul, subjudul, items, golonganLabels, kolomEkstra = [], onClose,
}: {
  judul: string
  subjudul?: string
  items: PreviewItem[]
  golonganLabels: Record<string, string>
  kolomEkstra?: KolomEkstra[]
  onClose: () => void
}) {
  const supabase = createClient()

  // ── Nama wilayah utk kode yang benar-benar dipakai di kartu ini ───────────
  // Dirantai ke atas lewat `parent_kode` supaya terbaca "Desa, Kec., Kab." —
  // pola yang sama dengan kolom Lokasi di Daftar Barang Awal.
  const [wilayah, setWilayah] = useState<Record<string, string>>({})
  const kodeWilayah = useMemo(() => [...new Set(
    items.map(i => (i.fields.wilayah_kode ?? '').trim()).filter(Boolean),
  )].sort().join('|'), [items])

  useEffect(() => {
    const kode = kodeWilayah ? kodeWilayah.split('|') : []
    if (kode.length === 0) { setWilayah({}); return }
    let batal = false
    // `void` — promise ini sengaja tak ditunggu (efek React), dan menandainya
    // eksplisit supaya berkas baru ini bersih dari peringatan lint.
    void (async () => {
      // Seluruh pohon ditarik sekali (tabelnya kecil & sudah dipakai begitu oleh
      // WilayahPicker), lalu dirantai di memori — jauh lebih murah daripada
      // query berulang per tingkat.
      const rows: { kode: string; nama: string; level: number; parent_kode: string | null }[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('admin_wilayah')
          .select('kode,nama,level,parent_kode').range(from, from + 999)
        // Nama wilayah itu PELENGKAP: kalau gagal, kodenya tetap ditampilkan apa
        // adanya (lihat `nilaiField`). Jangan jatuhkan seluruh pop-up karenanya.
        if (error) break
        if (!data || data.length === 0) break
        rows.push(...(data as typeof rows))
        if (data.length < 1000) break
      }
      if (batal) return
      const byKode = new Map(rows.map(r => [r.kode, r]))
      const out: Record<string, string> = {}
      for (const k of kode) {
        const rantai: string[] = []
        let cur = byKode.get(k)
        while (cur) {
          // Provinsi (level terluar) dibuang — seluruh data aplikasi ini di
          // Jawa Timur, jadi ia cuma memanjangkan baris tanpa membedakan apa pun.
          if (cur.level > 1) rantai.push(cur.nama)
          cur = cur.parent_kode ? byKode.get(cur.parent_kode) : undefined
        }
        if (rantai.length) out[k] = rantai.join(', ')
      }
      setWilayah(out)
    })()
    return () => { batal = true }
  }, [kodeWilayah]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Kelompokkan per golongan; tiap kelompok punya susunan kolomnya sendiri ─
  const kelompok = useMemo(() => {
    const map = new Map<string, PreviewItem[]>()
    for (const it of items) {
      const g = kodeLevel3(it.kode)
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const thumbs = useFotoThumbs(items.map(i => i.foto?.[0]).filter(Boolean) as string[])

  /** Berapa field spesifikasi yang masih kosong di satu barang. */
  const jmlKosong = (it: PreviewItem) =>
    fieldsForKode(it.kode).filter(k => nilaiField(it, k, wilayah) === KOSONG).length

  const belumLengkap = items.filter(it => jmlKosong(it) > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-dark/40 backdrop-blur-[2px] p-4 animate-fade-in"
      {...backdropClose(onClose)} role="dialog" aria-modal="true" aria-label="Pratinjau isi kartu">
      <div className="w-full max-w-[95vw] max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-bubble-in">

        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 leading-snug">Pratinjau kelengkapan barang</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{judul}{subjudul ? ` · ${subjudul}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Tutup"
            className="flex-shrink-0 h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">×</button>
        </div>

        {/* Ringkasan kelengkapan — pertanyaan yang dibawa operator ke sini
            ("ada yang kurang nggak?") dijawab sebelum ia menggulir. */}
        <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-gray-600"><b className="text-gray-900">{items.length}</b> barang</span>
          {belumLengkap === 0 ? (
            <span className="text-teal font-medium">✓ Semua field spesifikasi terisi</span>
          ) : (
            <span className="text-amber-700 font-medium">
              ⚠ {belumLengkap} barang masih punya field kosong
            </span>
          )}
          <span className="text-gray-400">
            Kolom mengikuti jenis asetnya. Yang kosong ditandai <span className="text-amber-600 font-medium">—</span>.
          </span>
        </div>

        <div className="overflow-auto flex-1 px-5 py-4 space-y-6">
          {kelompok.map(([gol, list]) => {
            const kolom = fieldsForKode(list[0].kode)
            return (
              <div key={gol}>
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  {gol} — {golonganLabels[gol] || gol}
                  <span className="text-gray-400 font-normal"> · {list.length} barang</span>
                </p>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="table-th whitespace-nowrap">Kode / Uraian Barang</th>
                        {kolomEkstra.map(k => <th key={k.key} className="table-th whitespace-nowrap">{k.label}</th>)}
                        <th className="table-th whitespace-nowrap">Satuan</th>
                        <th className="table-th whitespace-nowrap text-right">Nilai / Item</th>
                        <th className="table-th whitespace-nowrap text-center">Foto</th>
                        {kolom.map(k => <th key={k} className="table-th whitespace-nowrap">{FIELD_LABEL[k]}</th>)}
                        <th className="table-th whitespace-nowrap text-center">Kelengkapan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {list.map(it => {
                        const kosong = jmlKosong(it)
                        return (
                          <tr key={it.key} className={kosong > 0 ? 'bg-amber-50/40' : undefined}>
                            <td className="table-td align-top">
                              <p className="text-gray-800">{it.uraianBarang || '-'}</p>
                              <p className="text-[11px] text-gray-400">{it.kode}</p>
                            </td>
                            {kolomEkstra.map(k => (
                              <td key={k.key} className="table-td align-top text-gray-600">
                                {it.ekstra?.[k.key] || <span className="text-amber-600">—</span>}
                              </td>
                            ))}
                            <td className="table-td align-top text-gray-600">{it.satuan || <span className="text-amber-600">—</span>}</td>
                            <td className="table-td align-top text-right text-gray-700 whitespace-nowrap">{formatRupiah(it.harga || 0)}</td>
                            <td className="table-td align-top text-center">
                              <FotoSel paths={it.foto || []} thumbUrl={it.foto?.[0] ? thumbs[it.foto[0]] : undefined}
                                judul={it.fields?.nama_barang || it.uraianBarang} />
                            </td>
                            {kolom.map(k => {
                              const v = nilaiField(it, k, wilayah)
                              return (
                                <td key={k} className="table-td align-top text-gray-600">
                                  {v === KOSONG
                                    ? <span className="text-amber-600" title="Belum diisi">—</span>
                                    // Teks panjang MEMBUNGKUS, tak dipangkas elipsis: yang
                                    // dipangkas cuma muncul di tooltip & hilang total saat
                                    // dicetak (aturan yang sama dgn menu Kendaraan).
                                    : <span className="whitespace-pre-wrap break-words">{v}</span>}
                                </td>
                              )
                            })}
                            <td className="table-td align-top text-center whitespace-nowrap">
                              {kosong === 0
                                ? <span className="text-teal">✓ Lengkap</span>
                                : <span className="text-amber-700">{kosong} kosong</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {items.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-8">Belum ada barang di kartu ini.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          {/* Kekosongan itu PERINGATAN, bukan larangan: sebagian field memang tak
              berlaku untuk barang tertentu (mis. nomor polisi pada alat berat).
              Yang memutuskan tetap operator — pop-up ini cuma memastikan ia
              memutuskannya sambil melihat, bukan sambil menebak. */}
          <p className="text-[11px] text-gray-400">
            Field kosong tidak selalu salah — sebagian memang tak berlaku untuk barang tertentu.
          </p>
          <button onClick={onClose} className="btn-secondary text-xs">Tutup</button>
        </div>
      </div>
    </div>
  )
}
