'use client'
// Data Rekap per SKPD LHI (admin pemda & auditor). Terpisah dari useLhiData:
// rekap menghitung SEMUA SKPD sekaligus (tak bisa difilter satu SKPD) dan hanya
// butuh SEBAGIAN kolom, jadi tak ikut menarik `snapshot` utuh & foto.
//
// ⚠️ Hanya isian yang SUDAH DIVALIDASI (status 'divalidasi') — sama dgn lembar
// LHI. Pengklasifikasinya `klasifikasiLhi`, yang dari `snapshot` cuma membaca
// `kondisi`; karena itu `snapshot->>kondisi` saja yang ditarik lalu dibungkus
// kembali jadi InvSnapshot minimal.
//
// ⚠️ Pagu `BATAS_BARIS`: tembus → MELEMPAR dgn anjuran mempersempit jenis aset,
// BUKAN memotong diam-diam (rekap yang kurang sebagian terbaca lengkap).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { paginate } from '@/shared/db/paginate'
import { createClient } from '@/lib/supabase/client'
import type { InvBaris, InvJawaban } from '@/lib/inventarisasi'
import { leafRekapLhi, type BarisRekapLhi } from '@/lib/rekapLhi'

export const BATAS_BARIS_REKAP = 50_000

type Mentah = {
  id: string
  skpd_id: number
  aset_id: string | null
  jawaban: InvJawaban
  kondisi_sebelum: string | null
}

export function useRekapLhi(f: { tahun: number; golongan: string | null; aktif: boolean }) {
  const [rows, setRows] = useState<BarisRekapLhi[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const key = `${f.aktif}|${f.tahun}|${f.golongan ?? ''}`

  const load = useCallback(async () => {
    if (!f.aktif) return
    const supabase = createClient()
    setLoading(true); setErr('')
    try {
      const mentah = await paginate<string, Mentah>('rekap isian inventarisasi', kursor => {
        let q = supabase.from('inventarisasi_barang')
          .select('id,skpd_id,aset_id,jawaban,kondisi_sebelum:snapshot->>kondisi')
          .eq('tahun', f.tahun).eq('status', 'divalidasi')
        if (f.golongan) q = q.eq('golongan', f.golongan)
        if (kursor !== null) q = q.gt('id', kursor)
        return q.order('id').limit(1000)
      }, { maksHalaman: BATAS_BARIS_REKAP / 1000 })
      setRows(mentah.map(m => ({
        skpdId: m.skpd_id,
        baris: {
          id: m.id, aset_id: m.aset_id, jawaban: m.jawaban || {}, foto_paths: [],
          snapshot: { kondisi: m.kondisi_sebelum ?? undefined },
        } as InvBaris,
      })))
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e)
      setErr(/melewati \d+ halaman/.test(pesan)
        ? `Isian divalidasi melebihi ${BATAS_BARIS_REKAP.toLocaleString('id-ID')} baris — pilih satu jenis aset untuk mempersempit.`
        : pesan)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const leaf = useMemo(() => leafRekapLhi(rows), [rows])
  return { leaf, nIsian: rows.length, loading, err }
}
