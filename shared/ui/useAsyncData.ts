'use client'
// ============================================================================
// useAsyncData() — loader tidak bisa nyangkut (rules.md §2.2).
//
// Kolektor di repo ini sudah fail-closed (MELEMPAR), tapi pemanggilnya tidak
// selalu punya penangkap. Daftar Barang pernah membeku di "Memuat…" SELAMANYA
// tanpa sepatah pun keterangan, karena `setLoading(false)` ditulis di baris
// terakhir jalur SUKSES — begitu query-nya timeout, baris itu tak pernah
// tercapai (docs/insiden.md INS-10).
//
// Hook ini memindahkan tiga kewajiban itu dari "harus diingat" jadi "sudah
// terjadi": `setLoading(false)` di `finally`, pesan error ditangkap, dan data
// basi DIBUANG saat gagal (kalau tidak, layar menampilkan angka lama seolah
// masih berlaku — itu justru mode kegagalan nomor satu di TESTING.md §1).
// ============================================================================
import { useCallback, useRef, useState } from 'react'

export type AsyncData<T> = {
  data: T | null
  loading: boolean
  /** String kosong = tak ada error. WAJIB ditampilkan pemanggil (rules.md §2.4). */
  error: string
  /** Jalankan loader. Aman dipanggil berkali-kali; hasil yang kedaluwarsa dibuang. */
  run: (fn: () => Promise<T>) => Promise<void>
  reset: () => void
}

export function useAsyncData<T>(): AsyncData<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Penjaga balapan: kalau pengguna menekan "Tampilkan" dua kali dan panggilan
  // PERTAMA selesai belakangan, tanpa ini hasil lama menimpa hasil baru — dan
  // layarnya menampilkan angka periode yang bukan yang sedang dipilih.
  const jalanKe = useRef(0)

  const run = useCallback(async (fn: () => Promise<T>) => {
    const punyaKu = ++jalanKe.current
    setLoading(true)
    setError('')
    try {
      const hasil = await fn()
      if (punyaKu !== jalanKe.current) return
      setData(hasil)
    } catch (e) {
      if (punyaKu !== jalanKe.current) return
      setError(e instanceof Error ? e.message : String(e))
      // Data lama DIBUANG, bukan dipertahankan: angka setengah-lama yang
      // terlihat sah jauh lebih mahal daripada layar kosong ber-pesan error.
      setData(null)
    } finally {
      if (punyaKu === jalanKe.current) setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    jalanKe.current++
    setData(null)
    setError('')
    setLoading(false)
  }, [])

  return { data, loading, error, run, reset }
}
