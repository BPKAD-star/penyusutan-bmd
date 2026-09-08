'use client'
// Komptabel (intra/ekstra) SEBELUM barang disetujui — untuk kolom pratayang di
// tabel draft Pengadaan & PerolehanManual (Hibah/Tukar Menukar/Hasil
// Inventarisasi/Perolehan Lainnya).
//
// ⚠️ INI PRAKIRAAN YANG WAJIB SAMA PERSIS DGN YANG AKAN TERCATAT. Klasifikasi
// sesungguhnya baru dihitung saat approve (`klasifikasiKomptabel(nilai, batas)`
// di kedua komponen itu), lalu masuk `aset.intra_ekstra` — kolom yang menentukan
// barang ikut neraca (intra) atau tidak (ekstra). Kolom pratayang yang memakai
// rumus SENDIRI akan sesekali berbeda dari hasil approve, dan operator yang
// sudah memeriksanya di layar tak punya cara tahu. Karena itu hook ini memanggil
// `fetchBatasKapitalisasi` + `klasifikasiKomptabel` YANG SAMA, bukan salinannya.
//
// ⚠️ Selagi batas belum terbaca, hasilnya `null` — BUKAN 'intra'.
// `klasifikasiKomptabel` sendiri memang jatuh ke 'intra' kalau batasnya null
// (kode tanpa batas terdaftar), dan itu benar sbg aturan; tapi "belum dimuat"
// bukan "tak punya batas". Menampilkan 'Intra' selama memuat berarti layar
// menyatakan sesuatu yang belum ia ketahui — persis kelas kesalahan yang paling
// mahal di modul ini. Pemanggil merender '…' untuk `null`.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'

export type HasilKomptabel = {
  /** null = batas belum terbaca (masih memuat / query gagal) — jangan ditebak. */
  komptabel: (kode: string, nilai: number) => 'intra' | 'ekstra' | null
  /** Pesan kegagalan; kosong kalau sehat. Pemanggil WAJIB menampilkannya. */
  err: string
}

export function useKomptabelDraft(kodes: string[]): HasilKomptabel {
  const supabase = createClient()
  const [batas, setBatas] = useState<Map<string, number | null> | null>(null)
  const [err, setErr] = useState('')
  // Kunci berbasis ISI, bukan identitas array — `kodes` dirakit ulang tiap
  // render, jadi memakainya langsung sbg dependency berarti query berjalan
  // terus-menerus.
  const kunci = [...new Set(kodes)].sort().join('|')

  useEffect(() => {
    let batal = false
    if (kunci === '') { setBatas(new Map()); setErr(''); return }
    ;(async () => {
      try {
        const m = await fetchBatasKapitalisasi(supabase, kunci.split('|'))
        if (!batal) { setBatas(m); setErr('') }
      } catch (e) {
        // Fail-closed: peta DIBUANG, jadi kolomnya tampil '…' & operator tahu
        // angkanya belum bisa dipercaya — bukan diam-diam jatuh ke 'Intra'.
        if (!batal) { setBatas(null); setErr(`gagal membaca batas kapitalisasi: ${(e as Error).message}`) }
      }
    })()
    return () => { batal = true }
  }, [kunci]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    komptabel: (kode, nilai) => (batas ? klasifikasiKomptabel(nilai, batas.get(kode)) : null),
    err,
  }
}
