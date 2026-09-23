'use client'
// Pengambilan data LHI — dipakai bersama halaman laporan & halaman cetak.
// Isian ditarik langsung dari `inventarisasi_barang` lalu disaring dgn
// klasifikasiLhi() — fungsi yang SAMA dgn yang dipakai form LKI, jadi pratinjau
// di form & isi laporan tak mungkin beda.
//
// ⚠️ HANYA isian yang SUDAH DIVALIDASI Pengelola Barang (model per-barang,
// migrasi 20260923_03). LHI adalah keluaran resmi; isian yang masih menunggu
// validasi bisa berubah, dan angka yang masih bisa berubah tak boleh ikut
// tercetak di laporan yang ditandatangani. Yang divalidasi lalu barangnya
// pindah/keluar TETAP ikut: ia hasil inventarisasi yang sah pada tahun itu.
import { useCallback, useEffect, useState } from 'react'
import { paginate } from '@/shared/db/paginate'
import { createClient } from '@/lib/supabase/client'
import { klasifikasiLhi, type InvBaris, type LhiKode } from '@/lib/inventarisasi'

export type FilterLhi = {
  tahun: number
  golongan: string
  skpdIds: number[] | null   // null = semua SKPD (se-kabupaten, dibatasi RLS)
}

export function useLhiData(f: FilterLhi) {
  const supabase = createClient()
  const [baris, setBaris] = useState<InvBaris[]>([])
  const [loading, setLoading] = useState(true)
  // Fail-closed: kegagalan ditampilkan & laporannya ditolak, bukan terbaca
  // sebagai "inventarisasinya memang belum ada".
  const [err, setErr] = useState('')
  const key = `${f.tahun}|${f.golongan}|${(f.skpdIds || []).join(',')}`

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    // ⚠️ SELURUH badan di dalam try & `setLoading(false)` di `finally`
    // (INS-10): `paginate` MELEMPAR, dan tanpa penangkap satu query yang gagal
    // membuat layar membeku di "Memuat…" selamanya.
    try {
      const rows = await paginate<string, { id: string }>('isian inventarisasi', kursor => {
        let q = supabase.from('inventarisasi_barang')
          .select('id,aset_id,snapshot,jawaban,foto_paths,status,catatan_validator')
          .eq('tahun', f.tahun).eq('golongan', f.golongan).eq('status', 'divalidasi')
        if (f.skpdIds && f.skpdIds.length > 0) q = q.in('skpd_id', f.skpdIds)
        if (kursor !== null) q = q.gt('id', kursor)
        return q.order('id').limit(1000)
      })
      setBaris(rows as never as InvBaris[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBaris([])
    } finally {
      setLoading(false)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  /** Baris yang masuk satu format LHI tertentu. */
  const barisUntuk = useCallback(
    (kode: LhiKode) => baris.filter(b => klasifikasiLhi(b).includes(kode)),
    [baris],
  )

  /** Jumlah temuan per format (untuk badge di pemilih laporan). */
  const hitungPerFormat = useCallback(() => {
    const c: Partial<Record<LhiKode, number>> = {}
    for (const b of baris) for (const k of klasifikasiLhi(b)) c[k] = (c[k] || 0) + 1
    return c
  }, [baris])

  return { baris, loading, err, barisUntuk, hitungPerFormat, reload: load }
}
