'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Nama SKPD yang sedang dipilih di `SkpdCombobox` — yang cuma memberi `skpdId`,
 * bukan namanya.
 *
 * Dibutuhkan kop lembar cetak DAN nama berkas laporan (lib/namaBerkas.ts).
 * Sengaja ditanyakan SAAT DIPILIH, bukan dengan menarik seluruh daftar SKPD
 * (816 baris) ke tiap halaman laporan: yang dibutuhkan satu baris.
 *
 * ⚠️ Diangkat jadi hook di kemunculan KETIGA (LaporanTransaksi, LaporanPerolehan,
 * LaporanPerpindahan) — CODING-STANDARD §1.2. Kegagalan query sengaja jatuh ke
 * string kosong, bukan melempar: namanya cuma hiasan di kop & nama berkas, dan
 * menjatuhkan seluruh halaman laporan gara-gara itu justru merugikan. Nama
 * kosong sudah punya arti yang benar di `namaBerkasLaporan` ("Kab Kediri").
 */
export function useNamaSkpd() {
  const supabase = createClient()
  const [nama, setNama] = useState('')

  const pilih = useCallback(async (skpdId: number | null) => {
    if (skpdId == null) { setNama(''); return }
    const { data } = await supabase.from('admin_skpd').select('nama').eq('id', skpdId).maybeSingle()
    setNama((data as { nama: string } | null)?.nama || '')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { nama, pilih }
}
