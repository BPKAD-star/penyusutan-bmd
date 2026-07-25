'use client'
// Pengambilan data LHI — dipakai bersama halaman laporan & halaman cetak.
// Ambil header inventarisasi sesuai filter (tahun/golongan/SKPD), lalu seluruh
// barisnya, lalu saring dgn klasifikasiLhi() — fungsi yang SAMA dgn yang dipakai
// form LKI, jadi pratinjau di form & isi laporan tak mungkin beda.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { klasifikasiLhi, type InvBaris, type InvHeader, type LhiKode } from '@/lib/inventarisasi'

const HDR_COLS = 'id,skpd_id,tahun,golongan,status,catatan_validator,petugas,keterangan,diajukan_at,divalidasi_at,created_at'

export type FilterLhi = {
  tahun: number
  golongan: string
  skpdIds: number[] | null   // null = semua SKPD (se-kabupaten)
}

export function useLhiData(f: FilterLhi) {
  const supabase = createClient()
  const [headers, setHeaders] = useState<InvHeader[]>([])
  const [baris, setBaris] = useState<InvBaris[]>([])
  const [loading, setLoading] = useState(true)
  const key = `${f.tahun}|${f.golongan}|${(f.skpdIds || []).join(',')}`

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('inventarisasi')
      .select(`${HDR_COLS},skpd:admin_skpd(nama)`)
      .eq('tahun', f.tahun)
    if (f.golongan) q = q.eq('golongan', f.golongan)
    if (f.skpdIds && f.skpdIds.length > 0) q = q.in('skpd_id', f.skpdIds)
    const { data: hs } = await q
    const hdrs = (hs as never as InvHeader[]) || []
    setHeaders(hdrs)

    if (hdrs.length === 0) { setBaris([]); setLoading(false); return }
    const ids = hdrs.map(h => h.id)
    const rows: InvBaris[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('inventarisasi_baris')
        .select('id,inventarisasi_id,aset_id,snapshot,jawaban,foto_paths')
        .in('inventarisasi_id', ids).range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as never as InvBaris[]))
      if (data.length < 1000) break
    }
    setBaris(rows)
    setLoading(false)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

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

  return { headers, baris, loading, barisUntuk, hitungPerFormat, reload: load }
}
