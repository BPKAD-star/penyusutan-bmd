'use client'
// Sisi BROWSER cache Dashboard — aturan & alasannya di ./cacheDashboard.ts.
//
// `Cadangan*` = pengganti kartu skeleton di <Suspense fallback>: kalau ada angka
// tersimpan milik pengguna ini yang umurnya ≤ UMUR_CACHE_MS, tampilkan (redup +
// "Angka tersimpan pukul …"); kalau tidak, skeleton seperti biasa. Begitu server
// selesai menghitung, React mengganti komponen ini dgn versi asli.
// `SimpanCacheDashboard` = dirender versi asli (hanya kalau sukses) untuk
// menyimpan angka barunya.
//
// `uid` dibaca dari sesi di browser (`getSession`, tanpa permintaan jaringan),
// bukan dioper server: mengoper dari server berarti menunggu `getUser()` sebelum
// kerangka halaman terkirim, justru memperlambat yang hendak dipercepat.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  bacaCache, tulisCache, sahScan, sahHapus,
  type KunciCache, type ScanDashboard, type HapusDashboard,
} from './cacheDashboard'
import { ViewTotalNilai, ViewJenis, ViewHapus, SectionSkeleton } from './DashboardView'

async function uidSesi(): Promise<string | null> {
  try {
    // Gagal membaca sesi = cache tak dipakai (skeleton biasa), bukan error yang
    // perlu ditampilkan — cache ini cuma kenyamanan.
    const { data, error } = await createClient().auth.getSession()
    if (error) return null
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

function useCacheDashboard<T>(kunci: KunciCache, sah: (d: unknown) => d is T): { data: T; t: number } | null {
  const [isi, setIsi] = useState<{ data: T; t: number } | null>(null)
  useEffect(() => {
    let batal = false
    void (async () => {
      const uid = await uidSesi()
      if (!uid || batal) return
      setIsi(bacaCache(window.sessionStorage, uid, kunci, sah))
    })()
    return () => { batal = true }
  }, [kunci, sah])
  return isi
}

export function SimpanCacheDashboard({ kunci, data }: { kunci: KunciCache; data: ScanDashboard | HapusDashboard }) {
  useEffect(() => {
    void (async () => {
      const uid = await uidSesi()
      if (uid) tulisCache(window.sessionStorage, uid, kunci, data)
    })()
  }, [kunci, data])
  return null
}

export function CadanganTotalNilai() {
  const c = useCacheDashboard<ScanDashboard>('scan', sahScan)
  if (!c) return <p className="text-2xl font-bold text-gray-200 animate-pulse">••••</p>
  return <ViewTotalNilai scan={c.data} tersimpanPada={c.t} />
}

export function CadanganJenis() {
  const c = useCacheDashboard<ScanDashboard>('scan', sahScan)
  if (!c) return <SectionSkeleton title="Total Aset per Jenis" sub="Memuat rekap register…" n={8} kolom={4} />
  return <ViewJenis scan={c.data} tersimpanPada={c.t} />
}

export function CadanganHapus() {
  const c = useCacheDashboard<HapusDashboard>('hapus', sahHapus)
  if (!c) return <SectionSkeleton title="Penghapusan Barang" sub="Memuat riwayat penghapusan…" n={5} kolom={5} />
  return <ViewHapus hapus={c.data} tersimpanPada={c.t} />
}
