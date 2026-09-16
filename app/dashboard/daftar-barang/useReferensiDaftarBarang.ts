'use client'
// ============================================================================
// Dua peta rujukan Daftar Barang, dimuat sekali saat halaman dibuka:
//   · `skpdMap`        id → nama SKPD (SEMUA level, untuk kolom SKPD tiap baris)
//   · `golonganLabels` prefix golongan → nama jenis aset (untuk dropdown)
//
// Diangkat dari `DaftarBarangPage` 2026-09-16 (REFACTOR-PLAN Fase 3).
//
// ✅ Fase 1 (INS-06): keempat query di sini dulu `const { data } = await …`
// telanjang — `error` ditelan seluruhnya. Akibatnya beda per peta, dan
// dua-duanya senyap:
//   · `skpdMap` gagal → kolom SKPD tiap baris tampil "-", yang terbaca
//     operator sebagai "barang ini memang tak bertuan"
//   · `golonganLabels` gagal → dropdown jenis aset menampilkan KODE mentah
//     ("1.3.2") alih-alih namanya
//
// ⚠️ SENGAJA TIDAK fail-closed, dan itu perbedaan yang perlu dijaga: keduanya
// HIASAN di atas data yang sudah benar — tak satu pun angka bergantung padanya,
// dan `fn_daftar_barang` tak pernah membacanya. Menjatuhkan seluruh daftar
// gara-gara nama SKPD gagal dimuat justru merugikan (pola `useFotoThumbs`).
// Yang WAJIB: kegagalannya DIKATAKAN (`err`), bukan ditelan — pemanggil
// menampilkannya sebagai peringatan, terpisah dari strip merah yang memang
// membatalkan daftar.
//
// ⚠️ Halaman ini LAPIS 1. Kalau kelak ada peta rujukan baru yang ikut
// MENENTUKAN ANGKA (bukan cuma label), ia TIDAK boleh menumpang di sini —
// yang begitu wajib fail-closed lewat saluran `err` merah halaman.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_DAFTAR_BARANG } from '@/lib/bmd'

export type ReferensiDaftarBarang = {
  skpdMap: Record<number, string>
  golonganLabels: Record<string, string>
  /** Kosong = semuanya termuat. Ditampilkan sebagai PERINGATAN, bukan pembatal. */
  err: string
}

export function useReferensiDaftarBarang(): ReferensiDaftarBarang {
  const supabase = createClient()
  const [skpdMap, setSkpdMap] = useState<Record<number, string>>({})
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    const lapor = (apa: string, e: unknown) =>
      setErr(prev => {
        const p = `${apa} gagal dimuat (${e instanceof Error ? e.message : String(e)})`
        return prev ? `${prev} · ${p}` : p
      })

    ;(async () => {
      try {
        const map: Record<number, string> = {}
        // Keyset per 1.000: `admin_skpd` 816 baris hari ini, tapi batas bawaan
        // PostgREST membuat halaman tunggal tak bisa dipercaya kalau bertambah.
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
          if (error) throw new Error(error.message)
          if (!data || data.length === 0) break
          for (const s of data) map[s.id] = s.nama
          if (data.length < 1000) break
        }
        setSkpdMap(map)
      } catch (e) { lapor('Nama SKPD', e) }
    })()

    ;(async () => {
      try {
        const { data: jenis, error: eJenis } = await supabase.from('admin_jenis_aset').select('id,nama')
        if (eJenis) throw new Error(eJenis.message)
        const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
        const labels: Record<string, string> = {}
        await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
          const { data, error } = await supabase.from('admin_kodefikasi_bmd')
            .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
          if (error) throw new Error(error.message)
          const id = data?.[0]?.jenis_aset_id
          // Tak ketemu → KODE-nya sendiri, bukan kosong: dropdown yang
          // beroption kosong tak bisa dipilih operator sama sekali.
          labels[prefix] = (id != null && namaById.get(id)) || prefix
        }))
        setGolonganLabels(labels)
      } catch (e) { lapor('Nama jenis aset', e) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { skpdMap, golonganLabels, err }
}
