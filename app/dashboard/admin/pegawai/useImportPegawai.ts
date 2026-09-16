'use client'
// ============================================================================
// Import Excel Daftar Pegawai — pop-up, pembacaan berkas, & commit-nya.
//
// Diangkat dari `AdminPegawaiPage` 2026-09-16 (REFACTOR-PLAN Fase 3). Bagian
// MURNInya (deteksi header, pencocokan kolom, validasi baris) ada di
// `lib/importPegawai.ts` — bertest & ber-mutasi; yang di sini cuma I/O &
// state-nya.
//
// ⚠️ Master data murni, BUKAN ledger: commit-nya LANGSUNG `upsert` ke
// `admin_pegawai`, tanpa draft/approval seperti `PerolehanImport` (itu perlu
// karena menyentuh ledger; ini tidak). NIP yang sudah ada DI-UPDATE
// (keputusan user 2026-07-14) — pas untuk berkas "data terbaru dari BKD".
// ============================================================================
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import {
  bacaGridPegawai, skpdDirujuk, validasiImportPegawai,
  type BarisImportPegawai, type PeranBmd,
} from '@/lib/importPegawai'

/** Per 200: `.in()` yang terlalu panjang ditolak PostgREST. */
const PER_BATCH = 200

export type ImportPegawai = {
  terbuka: boolean
  // ⚠️ `Dispatch<SetStateAction<…>>` penuh, bukan `(v: boolean) => void`:
  // tombolnya memakai bentuk pembaru (`setShowImport(v => !v)`), dan tipe
  // yang dipersempit membuatnya gagal kompilasi.
  setTerbuka: React.Dispatch<React.SetStateAction<boolean>>
  rows: BarisImportPegawai[]
  namaBerkas: string
  parsing: boolean
  committing: boolean
  msg: string
  bacaBerkas: (f: File) => Promise<void>
  commit: () => Promise<void>
  /** Kosongkan pilihan berkas tanpa menutup pop-up. */
  reset: () => void
}

/**
 * @param peran daftar Role BMD (value + label) — dioper supaya aturan
 *   pemetaannya tetap murni & bisa diuji tanpa menyeret konstanta halaman.
 * @param onSukses dipanggil sesudah commit berhasil, supaya daftar di layar
 *   ikut disegarkan.
 * @param alat pembantu golongan milik halaman; dioper, bukan disalin, supaya
 *   normalisasi di form & di import tak bisa menyimpang.
 */
export function useImportPegawai(
  peran: readonly PeranBmd[],
  onSukses: () => void,
  alat: { normalisasiGolongan: (g: string) => string; pangkatDariGolongan: (g: string) => string },
): ImportPegawai {
  const supabase = createClient()
  const [terbuka, setTerbuka] = useState(false)
  const [rows, setRows] = useState<BarisImportPegawai[]>([])
  const [namaBerkas, setNamaBerkas] = useState('')
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [msg, setMsg] = useState('')

  async function bacaBerkas(f: File) {
    setParsing(true); setMsg(''); setNamaBerkas(f.name); setRows([])
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const parsed = bacaGridPegawai(grid, alat)

      // Validasi `skpd_id` ke `admin_skpd` (kolomnya ID numerik, bukan nama).
      const ids = skpdDirujuk(parsed)
      const valid = new Set<number>()
      for (let i = 0; i < ids.length; i += PER_BATCH) {
        const { data, error } = await supabase.from('admin_skpd').select('id').in('id', ids.slice(i, i + PER_BATCH))
        // MELEMPAR, tak ditelan: query yang gagal membuat SELURUH baris
        // ditandai "SKPD tidak ditemukan", dan operator lalu memperbaiki
        // berkas yang sebenarnya sudah benar.
        if (error) throw new Error(`gagal memeriksa SKPD: ${error.message}`)
        for (const s of (data || []) as { id: number }[]) valid.add(s.id)
      }

      setRows(validasiImportPegawai(parsed, valid, peran))
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setParsing(false)   // di `finally`, bukan jalur sukses (INS-10)
    }
  }

  async function commit() {
    const sah = rows.filter(r => r.valid)
    if (sah.length === 0) return
    setCommitting(true); setMsg('')
    try {
      const payload = sah.map(r => ({
        nip: r.nip, nama: r.nama, pangkat: r.pangkat || null, golongan: r.golongan || null,
        jabatan: r.jabatan || null, jenis_kelamin: r.jenis_kelamin || null,
        role_bmd: r.role_bmd, skpd_id: r.skpd_id,
      }))
      let sukses = 0
      const gagal: string[] = []
      // ⚠️ Batch yang gagal DICATAT lalu dilanjutkan, bukan menghentikan
      // seluruhnya — `upsert` by NIP idempoten, jadi mengulang berkas yang
      // sama aman & operator tak perlu menebak batch mana yang sudah masuk.
      // Yang WAJIB: jumlah sukses & pesan gagalnya dilaporkan apa adanya.
      for (let i = 0; i < payload.length; i += PER_BATCH) {
        const chunk = payload.slice(i, i + PER_BATCH)
        const { error } = await supabase.from('admin_pegawai').upsert(chunk, { onConflict: 'nip' })
        if (error) gagal.push(error.message)
        else sukses += chunk.length
      }
      setMsg(gagal.length
        ? `Error: ${sukses} baris berhasil, gagal: ${gagal.join(' | ')}`
        : `${sukses} pegawai berhasil diimpor (dibuat baru atau diperbarui berdasarkan NIP).`)
      // ⚠️ Pop-up ditutup HANYA kalau ada yang masuk — kalau seluruhnya gagal,
      // menutupnya membuang pesan kegagalan sebelum sempat dibaca.
      if (sukses > 0) { setRows([]); setNamaBerkas(''); setTerbuka(false); onSukses() }
    } catch (e) {
      // ⚠️ `upsert` melaporkan galat DB lewat `error`, tapi kegagalan JARINGAN
      // ia LEMPAR. Versi lama di `AdminPegawaiPage` tak punya penangkap sama
      // sekali: lemparan itu jadi unhandled rejection, tombolnya nyangkut
      // "Mengimpor…" selamanya, dan operator tak dapat sepatah pun keterangan.
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      // ⚠️ `finally` di sini TAK BISA dibedakan dari pernyataan biasa sesudah
      // `try` — `catch` di atas menangkap segalanya, jadi tak ada yang lolos
      // (mutan ekuivalen, diperiksa 2026-09-16). Dipertahankan karena ia
      // menyatakan MAKSUDNYA: tombolnya wajib lepas apa pun yang terjadi,
      // termasuk lewat jalur keluar yang kelak ditambahkan orang lain.
      setCommitting(false)
    }
  }

  return {
    terbuka, setTerbuka, rows, namaBerkas, parsing, committing, msg,
    bacaBerkas, commit,
    reset: () => { setRows([]); setNamaBerkas(''); setMsg('') },
  }
}
