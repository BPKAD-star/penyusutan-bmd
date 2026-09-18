'use client'
// ============================================================================
// Mesin state **Edit Spesifikasi** di Saldo Awal → Daftar Barang Awal.
//
// Diangkat dari komponen halamannya 2026-09-15 (REFACTOR-PLAN Fase 3). Halaman
// itu komponen TERPADAT se-repo (867 baris / 30 `useState`) dan sepuluh di
// antaranya milik satu mesin: centang barang → popup → tulis ke DUA tabel.
//
// ⚠️ PINTU INI CUMA UNTUK BARANG YANG BELUM BERGERAK (keputusan user
// 2026-07-28). Aset yang pernah kena koreksi spesifikasi, reklas, atau pindah
// SKPD TERKUNCI — penegaknya trigger DB; `terkunci` di sini cuma supaya
// operator tak mencentang lalu kena tolak. Gagal memuatnya → set KOSONG &
// dilaporkan: centang tetap hidup, DB yang menolak saat Simpan.
//
// ⚠️ Menulis ke DUA tabel: snapshot `aset_awal_2026` DAN register `aset`
// (dicocokkan NIBAR), keduanya UPDATE biasa TANPA event ledger — spesifikasi
// itu data deskriptif, bukan peristiwa akuntansi (pola yang sama dgn KIR).
// Konsekuensi yang DITERIMA: koreksi lewat pintu ini tak punya jejak ledger &
// tak bisa di-Batal; yang butuh audit trail lewat Pembukuan → Koreksi.
//
// ⚠️ `.select()` pada kedua UPDATE WAJIB dipertahankan: UPDATE yang ditolak
// RLS TIDAK melempar error, ia cuma mengembalikan 0 baris. Tanpa `.select()`
// kegagalan (mis. migrasi 20260728_01 belum jalan) dilaporkan sbg "berhasil".
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ASET_NUM_COLS, allSameGolongan, koreksiFieldKeys, type FieldKey } from '@/lib/asetFields'
import type { Row, BidangAgg } from './tipe'

const newKey = () => Math.random().toString(36).slice(2)

export type EditSpekAwal = ReturnType<typeof useEditSpekAwal>

/**
 * @param bidang ringkasan bidang per NIBAR — menentukan apakah Tanah boleh
 *   mengoreksi luas/lokasi dari sini (kalau sudah punya bidang, GIS yang
 *   berwenang).
 * @param reload muat ulang daftar halaman sesudah menyimpan. Disuntik, bukan
 *   dipanggil langsung, supaya hook ini tak perlu tahu filter & halaman aktif.
 */
export function useEditSpekAwal(bidang: Record<string, BidangAgg>, reload: () => void) {
  const supabase = createClient()

  const [sel, setSel] = useState<Record<string, Row>>({}) // key = NIBAR
  const [spekOpen, setSpekOpen] = useState(false)
  const [spekPrefix, setSpekPrefix] = useState('')
  // Field yang ditawarkan popup — dihitung saat dibuka (bukan saat render),
  // karena untuk Tanah isinya bergantung ada/tidaknya bidang.
  const [spekKeys, setSpekKeys] = useState<FieldKey[]>([])
  const [spekInitFields, setSpekInitFields] = useState<Record<string, string>>({})
  const [spekInitFoto, setSpekInitFoto] = useState<string[]>([])
  const [spekMsg, setSpekMsg] = useState('')
  const [spekErr, setSpekErr] = useState('')
  const [spekSaving, setSpekSaving] = useState(false)
  // NIBAR yang TERKUNCI dari pintu ini: asetnya pernah kena transaksi yang
  // menyentuh spesifikasi/golongan/SKPD → koreksinya wajib lewat menu Koreksi
  // (lihat migrasi 20260728_01 bagian 3). Dihitung server-side per halaman.
  const [terkunci, setTerkunci] = useState<Set<string>>(new Set())
  // Sebab kunci per NIBAR (permintaan user 2026-09-18, migrasi 20260918_01) —
  // jenis & periode transaksi TERAKHIR pada aset itu (di luar `saldo_awal`/
  // `saldo_awal_checkpoint`), MURNI HIASAN informasional saat 🔒 diklik.
  // ⚠️ Ini PROXY, bukan jawaban pasti: `fn_aset_awal_2026_terkunci_batch`
  // mengunci lewat EMPAT kondisi berbeda (status/kode/skpd_id berubah, atau
  // ada koreksi_spesifikasi/penggabungan_masuk belum dibatalkan) — kalau
  // sebuah aset kebetulan kena DUA kondisi sekaligus, yang tampil cuma yang
  // PALING AKHIR. Beda dari 🔒 di Pengalihan (migrasi 20260917_02), yang di
  // situ "terkunci" definisinya PERSIS "ada transaksi sesudah ini".
  const [terkunciInfo, setTerkunciInfo] = useState<Record<string, { jenis: string; periode: string } | null>>({})

  // Penegak sesungguhnya tetap trigger DB — ini cuma supaya operator tak klik
  // lalu kena error. Gagal RPC (mis. migrasi belum dijalankan) → set kosong,
  // tombolnya tetap hidup dan DB yang menolak.
  async function fetchTerkunci(nibars: string[], pesan: string[]) {
    const out = new Set<string>()
    const info: Record<string, { jenis: string; periode: string } | null> = {}
    for (let i = 0; i < nibars.length; i += 500) {
      const { data, error } = await supabase.rpc('fn_aset_awal_2026_terkunci_batch', { p_nibars: nibars.slice(i, i + 500) })
      if (error) { pesan.push(`Tanda 🔒 tidak ditampilkan — gagal memeriksa barang yang terkunci: ${error.message}. Centang tetap bisa diklik; kalau barangnya memang terkunci, database yang menolak saat Simpan.`); break }
      for (const d of (data || []) as { nibar: string; jenis_terakhir: string | null; periode_terakhir: string | null }[]) {
        out.add(d.nibar)
        info[d.nibar] = d.jenis_terakhir ? { jenis: d.jenis_terakhir, periode: d.periode_terakhir || '-' } : null
      }
    }
    setTerkunciInfo(info)
    return out
  }
  // ── Koreksi spesifikasi ───────────────────────────────────────────────────
  const selList = Object.values(sel)
  const selSameGol = allSameGolongan(selList.map(r => r.kode))

  function toggleSel(r: Row) {
    if (terkunci.has(r.nibar)) return
    setSel(prev => {
      const next = { ...prev }
      if (next[r.nibar]) delete next[r.nibar]; else next[r.nibar] = r
      return next
    })
    setSpekMsg(''); setSpekErr('')
  }

  // Tanah: luas & lokasi cuma boleh dikoreksi dari sini kalau SEMUA yang
  // dicentang belum punya bidang. Yang sudah punya → GIS Tanah yang berwenang
  // (kalau tidak, angka manual di sini bakal ketutup Σ bidang & bikin bingung).
  const spekTanpaBidang = selList.every(r => !(bidang[r.nibar]?.n))

  // Buka popup: 1 barang → prefill nilai sekarang (dari snapshot, itu yang
  // ditampilkan halaman ini); banyak barang → kosong (isi = diterapkan ke semua).
  async function openSpek() {
    if (selList.length === 0 || !selSameGol) return
    setSpekMsg(''); setSpekErr('')
    const single = selList.length === 1
    setSpekPrefix(`draft/saldo-awal-spek/${single ? selList[0].nibar : newKey()}`)
    const keys = koreksiFieldKeys(selList[0].kode, { tanahTanpaBidang: spekTanpaBidang })
    setSpekKeys(keys)
    if (single) {
      const { data, error } = await supabase.from('aset_awal_2026')
        .select([...keys, 'foto_paths'].join(',')).eq('nibar', selList[0].nibar).single()
      // ✅ Fase 1: popup TIDAK dibuka kalau prefill-nya gagal. Field kosong di
      // popup terbaca sbg "nilai sekarang memang kosong", dan Simpan akan
      // menuliskannya ke snapshot BERIKUT register aset.
      if (error) { setSpekErr(`Gagal memuat spesifikasi barang: ${error.message}`); return }
      const row = (data || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
      setSpekInitFields(f)
      setSpekInitFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    } else {
      setSpekInitFields({}); setSpekInitFoto([])
    }
    setSpekOpen(true)
  }

  // Commit langsung (halaman ini tak punya kartu jurnal — tak ada tombol Simpan
  // terpisah spt menu Koreksi). Menulis ke snapshot + register `aset` by NIBAR.
  async function simpanSpek(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const list = selList
    const single = list.length === 1
    // Modal ditutup DULU: pesan hasil/error tampil di strip halaman, yang bakal
    // ketutup overlay modal (z-50) kalau modalnya dibiarkan terbuka.
    setSpekOpen(false); setSpekMsg(''); setSpekErr('')
    // Single: modal prefill nilai sekarang → simpan HANYA yang berubah.
    // Bulk: initial kosong → semua yang diisi = perubahan, diterapkan ke semua.
    const initial = single ? spekInitFields : {}
    const base: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      const val = (v ?? '').toString().trim()
      if (val === '' || val === (initial[k] ?? '').toString().trim()) continue
      if (ASET_NUM_COLS.has(k) || k === 'tahun_pengadaan') { const n = Number(val); if (Number.isFinite(n)) base[k] = n }
      else base[k] = val
    }
    const fotoReplace = single ? (foto.replace || []) : null
    const fotoAppend = !single ? (foto.append || []) : null
    const fotoBerubah = single ? JSON.stringify(fotoReplace) !== JSON.stringify(spekInitFoto) : (fotoAppend?.length ?? 0) > 0
    if (Object.keys(base).length === 0 && !fotoBerubah) { setSpekErr('Tidak ada field yang diubah — centangannya masih utuh, klik "Edit Spesifikasi" lagi.'); return }
    setSpekSaving(true)

    // Foto di `aset` bisa beda dari snapshot (mis. ditambah lewat menu Koreksi
    // setelah baseline dibekukan) → append relatif ke daftar masing-masing tabel.
    const nibars = list.map(r => r.nibar)
    const fotoAset = new Map<string, string[]>()
    for (let i = 0; i < nibars.length; i += 300) {
      const { data } = await supabase.from('aset').select('nibar,foto_paths').in('nibar', nibars.slice(i, i + 300))
      for (const a of (data || []) as { nibar: string | null; foto_paths: string[] | null }[]) {
        if (a.nibar) fotoAset.set(a.nibar, a.foto_paths || [])
      }
    }

    let okSnapshot = 0, okAset = 0
    for (const r of list) {
      const patchSnapshot: Record<string, unknown> = { ...base }
      const patchAset: Record<string, unknown> = { ...base }
      if (fotoBerubah) {
        if (single) { patchSnapshot.foto_paths = fotoReplace; patchAset.foto_paths = fotoReplace }
        else {
          patchSnapshot.foto_paths = [...(r.foto_paths || []), ...(fotoAppend || [])]
          patchAset.foto_paths = [...(fotoAset.get(r.nibar) || []), ...(fotoAppend || [])]
        }
      }
      const nama = r.nama_barang || r.nibar
      const sudah = okSnapshot ? ` (${okSnapshot} barang sebelumnya sudah tersimpan)` : ''
      const gagal = (pesan: string) => { setSpekSaving(false); setSpekErr(pesan); reload() }
      // `.select()` WAJIB: UPDATE yang ditolak RLS tidak melempar error, cuma
      // mengembalikan 0 baris — tanpa ini kegagalan (mis. migrasi 20260728_01
      // belum dijalankan, policy sa_update belum ada) dilaporkan sbg "berhasil".
      const { data: d1, error: e1 } = await supabase.from('aset_awal_2026').update(patchSnapshot).eq('nibar', r.nibar).select('nibar')
      if (e1) { gagal(`Gagal menyimpan "${nama}": ${e1.message}${sudah}`); return }
      if (!d1 || d1.length === 0) { gagal(`Perubahan "${nama}" ditolak database — barang di luar wewenang SKPD-mu, atau migrasi 20260728_01 belum dijalankan.${sudah}`); return }
      okSnapshot++
      // Register `aset`: barang baseline yang sudah dihapus/tak pernah termigrasi
      // bisa saja tak punya baris pasangan — bukan error, cuma dilaporkan.
      if (fotoAset.has(r.nibar)) {
        const { data: d2, error: e2 } = await supabase.from('aset').update(patchAset).eq('nibar', r.nibar).select('nibar')
        if (e2) { gagal(`Saldo awal "${nama}" tersimpan, tapi register aset gagal: ${e2.message}`); return }
        if (d2 && d2.length > 0) okAset++
      }
    }

    setSpekSaving(false); setSel({})
    setSpekMsg(okAset === okSnapshot
      ? `${okSnapshot} barang diperbarui (saldo awal + register aset).`
      : `${okSnapshot} barang diperbarui di saldo awal; ${okAset} di antaranya punya pasangan di register aset (sisanya tidak ada / di luar wewenangmu).`)
    reload()
  }

  return {
    sel, setSel, selList, selSameGol, toggleSel, terkunci, setTerkunci, fetchTerkunci, terkunciInfo,
    spekOpen, setSpekOpen, spekPrefix, spekKeys, spekInitFields, spekInitFoto,
    spekMsg, spekErr, spekSaving, spekTanpaBidang, openSpek, simpanSpek,
  }
}
