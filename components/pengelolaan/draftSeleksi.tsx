'use client'
// Pencarian + seleksi + aksi massal untuk TABEL DRAFT BARANG di kartu "Menunggu
// Persetujuan" (Pengadaan & PerolehanManual: Hibah/Tukar Menukar/Hasil
// Inventarisasi/Perolehan Lainnya).
//
// Ditaruh di modul BERSAMA, bukan disalin ke dua komponen: tabel draft di kedua
// menu itu memang kembar (checklist → Edit Spesifikasi massal), dan pola
// "ubah satu, samakan yang lain" sudah berkali-kali terbukti dilanggar di repo
// ini (lihat CLAUDE.md). KonstruksiPengadaan TIDAK ikut — di sana barang KDP
// disimpan di payload.barang[] dgn bentuk berbeda, bukan draft_items.
//
// Aturan seleksi (permintaan user 2026-08-04):
//   - Centang "semua" = semua barang yang LOLOS pencarian saat itu, bukan
//     seluruh isi kontrak. Tanpa pencarian, ya semua barang.
//   - Centang yang sudah dibuat TETAP tersimpan walau pencariannya diganti —
//     supaya operator bisa mengumpulkan barang dari beberapa kata kunci.
//     Konsekuensinya bisa ada barang tercentang di LUAR hasil pencarian, dan
//     itu WAJIB ditampilkan di bilah aksi (lihat `tersembunyi`) — kalau tidak,
//     tombol Hapus akan membuang barang yang tak terlihat di layar.
import { useMemo, useState } from 'react'

// Bentuk minimum satu baris draft yang dipakai pencarian. Sengaja serba
// opsional: Pengadaan punya `rekening`, PerolehanManual punya `tglPerolehan`.
export type DraftLike = {
  key: string
  kode: string
  uraianBarang?: string
  rekening?: string
  tglPerolehan?: string
  satuan?: string
  harga?: string
  fields?: Record<string, string>
}

const lower = (v: unknown) => String(v ?? '').toLowerCase()
const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '')

// Kolom yang ikut dicari = kolom yang TAMPIL di tabel draft + spesifikasi
// lainnya. Nilai/harga dicocokkan lewat angkanya saja, jadi "15.000.000" hasil
// salin dari layar tetap ketemu walau di draft tersimpan sbg "15000000".
export function cocokDraft(it: DraftLike, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const f = it.fields || {}
  const teks = [
    it.rekening, it.uraianBarang, it.kode, it.satuan, it.tglPerolehan,
    f.nama_barang, f.merek_tipe, f.spesifikasi_lainnya, f.keterangan,
    f.no_polisi, f.no_rangka, f.no_mesin, f.no_bpkb,
  ]
  if (teks.some(v => lower(v).includes(s))) return true
  const qd = digits(s)
  return qd.length > 0 && digits(it.harga).includes(qd)
}

export function useDraftSeleksi<T extends DraftLike>(items: T[]) {
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const terlihat = useMemo(() => items.filter(i => cocokDraft(i, q)), [items, q])

  // Sengaja diturunkan dari `items`, BUKAN dari isi `checked` langsung: kalau
  // barang dihapus, key-nya bisa tertinggal di set. Aksi massal harus jalan di
  // atas barang yang benar-benar masih ada.
  const dipilih = useMemo(() => items.filter(i => checked.has(i.key)), [items, checked])
  const dipilihTerlihat = terlihat.filter(i => checked.has(i.key)).length
  const tersembunyi = dipilih.length - dipilihTerlihat

  const allChecked = terlihat.length > 0 && terlihat.every(i => checked.has(i.key))
  function toggleAll() {
    setChecked(prev => {
      const next = new Set(prev)
      for (const i of terlihat) { if (allChecked) next.delete(i.key); else next.add(i.key) }
      return next
    })
  }
  function toggleOne(key: string) {
    setChecked(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  function bersihkan() { setChecked(new Set()) }

  return { q, setQ, terlihat, dipilih, tersembunyi, allChecked, toggleAll, toggleOne, bersihkan, checked }
}

export function DraftSearchBar({ q, setQ, jml, total }: {
  q: string; setQ: (v: string) => void; jml: number; total: number
}) {
  return (
    <div className="px-5 py-2.5 border-b border-gray-100 bg-white flex items-center gap-3">
      <div className="relative flex-1 max-w-md">
        <input value={q} onChange={e => setQ(e.target.value)} className="select-filter w-full pr-7"
          placeholder="Cari kode rekening, uraian, nama barang, merek/tipe, harga..." />
        {q && (
          <button onClick={() => setQ('')} title="Bersihkan pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
        )}
      </div>
      <span className="text-xs text-gray-500">
        {q ? `${jml} dari ${total} barang` : `${total} barang`}
      </span>
    </div>
  )
}

// Bilah aksi massal. `tersembunyi` = jumlah barang tercentang yang TIDAK lolos
// pencarian saat ini — ditampilkan supaya operator tak menghapus/mengedit
// barang yang tak kelihatan di layar.
export function DraftBulkBar({ jml, tersembunyi, sameGol, onEdit, onHapus }: {
  jml: number; tersembunyi: number; sameGol: boolean
  onEdit: () => void; onHapus: () => void
}) {
  return (
    <div className="px-5 py-3 border-t border-gray-100 bg-teal/5 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-xs text-gray-600">
        {jml} barang dicentang
        {tersembunyi > 0 && <span className="text-gray-500"> ({tersembunyi} di luar hasil pencarian)</span>}
        {!sameGol && <span className="text-amber-600"> — beda jenis BMD, tak bisa edit bersamaan (kolomnya beda)</span>}
      </span>
      <div className="flex items-center gap-2">
        <button className="btn-primary text-xs" disabled={!sameGol} onClick={onEdit}>✎ Edit Spesifikasi ({jml})</button>
        <button onClick={onHapus}
          className="inline-flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">🗑 Hapus ({jml})</button>
      </div>
    </div>
  )
}
