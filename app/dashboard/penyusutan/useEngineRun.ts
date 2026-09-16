'use client'
// ============================================================================
// Tombol "Jalankan Engine" — hak akses, kemajuan, & loop batch-nya.
//
// Diangkat dari `PenyusutanPage` 2026-09-16 (REFACTOR-PLAN Fase 3).
//
// ⚠️ LAPIS 1 (CLAUDE.md: Penyusutan + engine-nya). Yang dipindah ke sini CUMA
// pengemudi HTTP-nya — perhitungannya seluruhnya di `/api/engine/run`, dan
// satu-satunya aritmetika di sini penjumlahan statistik untuk DITAMPILKAN.
//
// ⚠️ Engine di-BATCH per-aset di server (keyset by id) & klien mengulang tiap
// batch sampai `done`. Itu yang mencegah timeout serverless yang dulu bikin
// respons kosong ("Unexpected end of JSON input") — JANGAN diubah jadi satu
// permintaan besar.
//
// ⚠️ `isAdmin` di sini MENYEMBUNYIKAN tombol, bukan menjaga apa pun:
// `/api/engine/run` sudah menolak non-admin dengan 403. Melonggarkannya di
// sini tidak membuka apa pun; yang dilanggar tetap ditolak server.
//
// ⚠️ Pop-up konfirmasinya SENGAJA ditinggal di halaman, bukan ikut ke sini:
// isinya JSX, dan kalimatnya ("aman diulang", "tahun terkunci tidak ditimpa")
// adalah keputusan tampilan yang berdampingan dengan tombolnya.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Jaga-jaga; 218rb aset ÷ 3.000 per batch ≈ 73, jadi 1.000 jauh lebih cukup. */
const BATAS_PUTARAN = 1000

export type HasilBatch = {
  processed?: number
  disusutkan?: number
  total_beban?: number
  rows_dilindungi_tahun_terkunci?: number
  done?: boolean
  last_id?: string
  error?: string
}

export type StatistikEngine = {
  proses: number
  disusutkan: number
  beban: number
  dilindungi: number
}

export type EngineRun = {
  /** Tombolnya ditampilkan atau tidak — BUKAN penjaga (server yang menjaga). */
  isAdmin: boolean
  running: boolean
  msg: string
  setMsg: (v: string) => void
  /** @returns statistik kalau tuntas, `null` kalau berhenti karena kesalahan. */
  jalankan: (periode: string) => Promise<StatistikEngine | null>
}

/**
 * @param angka pemformat rupiah milik halaman — dioper supaya hook ini tak
 *   memilih formatnya sendiri lalu menyimpang dari angka di tabel sebelahnya.
 */
export function useEngineRun(angka: (n: number) => string): EngineRun {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function jalankan(periode: string): Promise<StatistikEngine | null> {
    setRunning(true)
    setMsg('Memproses… 0 aset')
    try {
      let afterId = ''
      const t: StatistikEngine = { proses: 0, disusutkan: 0, beban: 0, dilindungi: 0 }
      for (let guard = 0; guard < BATAS_PUTARAN; guard++) {
        const res = await fetch('/api/engine/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periode, after_id: afterId }),
        })
        const j = (await res.json()) as HasilBatch
        // Berhenti KERAS di batch yang gagal — melanjutkan ke kursor
        // berikutnya akan melewati aset yang belum terhitung lalu melaporkan
        // "selesai" atas hasil yang bolong.
        if (!res.ok) { setMsg(`Error: ${j.error || `HTTP ${res.status}`}`); return null }
        t.proses += Number(j.processed || 0)
        t.disusutkan += Number(j.disusutkan || 0)
        t.beban += Number(j.total_beban || 0)
        t.dilindungi += Number(j.rows_dilindungi_tahun_terkunci || 0)
        setMsg(`Memproses… ${t.proses.toLocaleString('id-ID')} aset`)
        if (j.done) break
        afterId = j.last_id || ''
        if (!afterId) break   // jaga-jaga: tak ada kursor → hentikan
      }
      const proteksi = t.dilindungi > 0
        ? ` (${t.dilindungi.toLocaleString('id-ID')} baris di tahun terkunci dilindungi, tidak ditimpa.)`
        : ''
      setMsg(`✓ Engine selesai untuk ${periode} — ${t.proses.toLocaleString('id-ID')} aset diproses, ${t.disusutkan.toLocaleString('id-ID')} disusutkan, total beban ${angka(t.beban)}.${proteksi}`)
      return t
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
      return null
    } finally {
      // Di `finally`, bukan di tiap jalur keluar — versi lamanya memanggilnya
      // di dua tempat terpisah & setara, tapi jalur ketiga yang kelak
      // ditambahkan akan menyangkutkan tombolnya "Memproses…" selamanya.
      setRunning(false)
    }
  }

  return { isAdmin, running, msg, setMsg, jalankan }
}
