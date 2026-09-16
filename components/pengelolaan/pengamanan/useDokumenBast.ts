'use client'
// ============================================================================
// Dua dokumen BAST Pengamanan — BAST & Pakta Integritas: nomor, tanggal, dan
// berkas unggahannya.
//
// Diangkat dari `BarangForm` (components/pengelolaan/Pengamanan.tsx) 2026-09-16
// (REFACTOR-PLAN Fase 3). Delapan `useState` yang selalu bergerak bersama-sama
// & dipakai satu `simpan()` — mesin state yang memang berdiri sendiri, bukan
// sekadar kumpulan kotak isian.
//
// ⚠️ KEDUANYA WAJIB DIUNGGAH sebelum kartu bisa disimpan (keputusan user
// 2026-09-05, pola `DokumenBastField` di menu lain). `lengkap` di sini
// SENGAJA bukan penegak — ia cuma menjawab "sudah lengkap belum"; yang
// menolak tetap `simpan()` di komponennya, dengan pesan yang menyebut berkas
// MANA yang kurang. Penjaga yang cuma mematikan tombol tanpa keterangan itu
// kegagalan senyap (pola tombol Ajukan di Usulan Standar Harga).
//
// ⚠️ `uploading` DIPAKAI BERSAMA kedua dokumen — sengaja, bukan kelalaian:
// satu operator tak mengunggah ke dua kotak sekaligus, dan dua bendera
// terpisah cuma menambah keadaan yang tak pernah terjadi.
// ============================================================================
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type TargetDokumen = 'bast' | 'pakta'

export type DokumenBast = {
  noSk: string
  setNoSk: (v: string) => void
  tgl: string
  setTgl: (v: string) => void
  paktaNo: string
  setPaktaNo: (v: string) => void
  paktaTgl: string
  setPaktaTgl: (v: string) => void
  bastPaths: string[]
  paktaPaths: string[]
  uploading: boolean
  upload: (files: FileList | null, target: TargetDokumen) => Promise<void>
  hapusDok: (path: string, target: TargetDokumen) => Promise<void>
  /** Kedua berkas sudah ada — dipakai layar, BUKAN sebagai penegak. */
  lengkap: boolean
}

/**
 * @param tglAwal tanggal BAST bawaan (hari ini) — dioper supaya hook ini tak
 *   ikut memutuskan "hari ini" versinya sendiri.
 * @param onErr saluran error form; kegagalan unggah dilaporkan PER BERKAS &
 *   berkas berikutnya tetap dicoba, supaya satu berkas rusak tak membatalkan
 *   yang lain.
 */
export function useDokumenBast(tglAwal: string, onErr: (msg: string) => void): DokumenBast {
  const supabase = createClient()

  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(tglAwal)
  const [paktaNo, setPaktaNo] = useState('')
  const [paktaTgl, setPaktaTgl] = useState('')
  const [bastPaths, setBastPaths] = useState<string[]>([])
  const [paktaPaths, setPaktaPaths] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const setPaths = (target: TargetDokumen) => (target === 'bast' ? setBastPaths : setPaktaPaths)

  async function upload(files: FileList | null, target: TargetDokumen) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const path = `pengamanan-${target}/${crypto.randomUUID()}/${file.name}`
        const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
        // `continue`, bukan `return`: berkas berikutnya tetap dicoba.
        if (error) { onErr(`Gagal upload "${file.name}": ${error.message}`); continue }
        setPaths(target)(prev => [...prev, path])
      }
    } finally {
      setUploading(false)   // di `finally`, bukan jalur sukses (INS-10)
    }
  }

  async function hapusDok(path: string, target: TargetDokumen) {
    const { error } = await supabase.storage.from('dokumen-sumber').remove([path])
    // ⚠️ `setPaths(target)` di bawah TAK BISA dibedakan dari "cabut dari kedua
    // daftar" lewat test, dan itu bukan lubang uji: `upload()` selalu memberi
    // prefix `pengamanan-<target>/` + UUID, jadi satu path mustahil ada di
    // dua daftar sekaligus. Tetap ditulis per-target supaya benarnya tak
    // bergantung pada invarian di fungsi sebelah.
    // ⚠️ Kegagalan hapus di storage TIDAK menahan pencabutan dari daftar:
    // yang menentukan isi kartu adalah `payload.bast_paths`, jadi berkas
    // yang gagal terhapus cuma jadi yatim di bucket — sedangkan daftar yang
    // menolak dibersihkan mengunci operator. Tetap dilaporkan, tak ditelan.
    if (error) onErr(`Gagal menghapus berkas: ${error.message}`)
    setPaths(target)(prev => prev.filter(p => p !== path))
  }

  return {
    noSk, setNoSk, tgl, setTgl, paktaNo, setPaktaNo, paktaTgl, setPaktaTgl,
    bastPaths, paktaPaths, uploading, upload, hapusDok,
    lengkap: bastPaths.length > 0 && paktaPaths.length > 0,
  }
}
