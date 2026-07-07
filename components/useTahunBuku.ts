'use client'
// Batas tanggal utk <input type="date"> yang mengisi TANGGAL LEDGER (transaksi_bmd/
// jurnal_header.tanggal) — dibaca dari tahun_buku (migrasi 23). Ini murni bantuan UX
// (fail fast di form sebelum kena error DB); penegak sesungguhnya tetap trigger
// fn_cek_tahun_buku di server. JANGAN pakai utk field atribut/dokumen (mis. Tanggal
// Dokumen Kepemilikan sertifikat tanah) — itu bisa historis, bukan tanggal transaksi.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const todayStr = () => new Date().toISOString().slice(0, 10)

export function useDateBounds() {
  // Sebelum tahun_buku termuat: min = max = hari ini (paling ketat/aman —
  // tak sempat mengizinkan pilih tanggal di luar hari ini walau sekejap).
  const [bounds, setBounds] = useState({ min: todayStr(), max: todayStr() })

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data } = await supabase.from('tahun_buku').select('tahun,status')
      const open = ((data || []) as { tahun: number; status: string }[])
        .filter(r => r.status === 'terbuka').map(r => r.tahun)
      if (open.length === 0) return // tak ada tahun terbuka terdaftar — biarkan fallback hari ini
      const minYear = Math.min(...open), maxYear = Math.max(...open)
      const maxCap = `${maxYear}-12-31`
      const today = todayStr()
      setBounds({ min: `${minYear}-01-01`, max: today < maxCap ? today : maxCap })
    })()
  }, [])

  return bounds
}

// Map tahun → status ('terbuka'/'terkunci'), dipakai badge "Tahun Kerja" di
// TopBar dan banner info di halaman laporan (lihat TahunTerkunciNote).
export function useTahunBukuMap() {
  const [map, setMap] = useState<Record<number, 'terbuka' | 'terkunci'>>({})

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data } = await supabase.from('tahun_buku').select('tahun,status')
      const m: Record<number, 'terbuka' | 'terkunci'> = {}
      for (const r of (data || []) as { tahun: number; status: 'terbuka' | 'terkunci' }[]) m[r.tahun] = r.status
      setMap(m)
    })()
  }, [])

  return map
}
