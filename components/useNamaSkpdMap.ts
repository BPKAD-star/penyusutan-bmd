'use client'
// ============================================================================
// Peta nama SKPD untuk komponen — dimuat sekali, kegagalannya DIKATAKAN.
//
// Diangkat 2026-09-16 (REFACTOR-PLAN Fase 1). Pasangan React dari
// `lib/namaSkpd.ts`; ia yang menurunkan lemparan jadi PERINGATAN.
//
// ⚠️ SENGAJA tidak fail-closed, dan bedanya perlu dijaga: nama SKPD adalah
// LABEL di atas angka yang sudah benar — tak satu pun perhitungan bergantung
// padanya. Menjatuhkan seluruh halaman gara-gara nama gagal dimuat justru
// merugikan (pola `useFotoThumbs`). Yang WAJIB: kegagalannya tidak DITELAN.
// Sebelum ini, ke-22 salinannya memakai `const { data } = await` telanjang,
// jadi query yang gagal menghasilkan peta kosong & kolom SKPD tiap baris
// tampil "-" — terbaca operator sebagai "barang ini memang tak bertuan".
//
// ⚠️ Pemanggil WAJIB menampilkan `err`. Hook yang menyediakan saluran error
// lalu diabaikan pemanggilnya sama saja dengan menelannya, cuma lebih panjang.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchDaftarSkpd, petaNamaSkpd, mapNamaSkpd, type SkpdRingkas } from '@/lib/skpdMaster'

export type NamaSkpdMap = {
  /** Daftar mentah, urut `id` — untuk pemanggil yang butuh dropdown. */
  daftar: SkpdRingkas[]
  /** `id → nama`. */
  peta: Record<number, string>
  /** `id → nama` sebagai `Map`. */
  map: Map<number, string>
  /** Kosong = semuanya termuat. Ditampilkan sbg PERINGATAN, bukan pembatal. */
  err: string
}

export function useNamaSkpdMap(): NamaSkpdMap {
  const supabase = createClient()
  const [daftar, setDaftar] = useState<SkpdRingkas[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const rows = await fetchDaftarSkpd(supabase)
        if (!batal) setDaftar(rows)
      } catch (e) {
        if (!batal) setErr(`Nama SKPD gagal dimuat (${e instanceof Error ? e.message : String(e)})`)
      }
    })()
    return () => { batal = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { daftar, peta: petaNamaSkpd(daftar), map: mapNamaSkpd(daftar), err }
}