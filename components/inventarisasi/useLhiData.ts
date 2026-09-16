'use client'
// Pengambilan data LHI — dipakai bersama halaman laporan & halaman cetak.
// Ambil header inventarisasi sesuai filter (tahun/golongan/SKPD), lalu seluruh
// barisnya, lalu saring dgn klasifikasiLhi() — fungsi yang SAMA dgn yang dipakai
// form LKI, jadi pratinjau di form & isi laporan tak mungkin beda.
import { useCallback, useEffect, useState } from 'react'
import { paginate } from '@/shared/db/paginate'
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
  // ⚠️ Saluran error BARU (2026-09-16). Sebelumnya loader ini menelan `error`
  // kedua query-nya, jadi kegagalan terbaca operator sebagai "inventarisasinya
  // memang belum diisi". Sekarang keduanya melempar & pesannya ditampilkan.
  const [err, setErr] = useState('')
  const key = `${f.tahun}|${f.golongan}|${(f.skpdIds || []).join(',')}`

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    // ⚠️ SELURUH badan di dalam try & `setLoading(false)` di `finally`
    // (INS-10): `paginate` MELEMPAR, dan tanpa penangkap satu query yang gagal
    // membuat layar membeku di "Memuat…" selamanya tanpa sepatah pun
    // keterangan — persis yang pernah terjadi di Daftar Barang.
    try {
    let q = supabase.from('inventarisasi')
      .select(`${HDR_COLS},skpd:admin_skpd(nama)`)
      .eq('tahun', f.tahun)
    if (f.golongan) q = q.eq('golongan', f.golongan)
    if (f.skpdIds && f.skpdIds.length > 0) q = q.in('skpd_id', f.skpdIds)
    const { data: hs, error: eh } = await q
    if (eh) throw new Error(`gagal membaca daftar inventarisasi: ${eh.message}`)
    const hdrs = (hs as never as InvHeader[]) || []
    setHeaders(hdrs)

    if (hdrs.length === 0) { setBaris([]); return }
    const ids = hdrs.map(h => h.id)
    const rows: InvBaris[] = []
    // ⚠️ Dulu TANPA `.order()` sama sekali — dan itu cacat, bukan pilihan:
    // Postgres tak menjamin urutan antar-halaman, jadi begitu barisnya >1.000
    // ada yang TERLEWAT & ada yang DOBEL tanpa satu pun tanda. `paginate`
    // memaksa kursor `id`, jadi urutannya sekarang total & hasilnya utuh.
    rows.push(...(await paginate<number, { id: number }>('baris inventarisasi', kursor => {
      let q = supabase.from('inventarisasi_baris')
        .select('id,inventarisasi_id,aset_id,snapshot,jawaban,foto_paths')
        .in('inventarisasi_id', ids)
      if (kursor !== null) q = q.gt('id', kursor)
      return q.order('id').limit(1000)
    }) as never as InvBaris[]))
    setBaris(rows)
    } catch (e) {
      // Fail-closed: daftar yang kurang sebagian lebih berbahaya daripada
      // daftar yang menolak tampil — operator tak punya cara tahu isinya kurang.
      setErr(e instanceof Error ? e.message : String(e))
      setHeaders([]); setBaris([])
    } finally {
      setLoading(false)
    }
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

  return { headers, baris, loading, err, barisUntuk, hitungPerFormat, reload: load }
}
