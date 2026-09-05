'use client'
// ============================================================================
// DokumenBastField — tombol unggah dokumen BAST bergaya kuning + peringatan
// wajib, dipakai di kartu jurnal ber-SK yang mensyaratkan bukti serah terima.
//
// LATAR: Pengadaan (non konstruksi) sudah mewajibkan dokumen BAST sejak
// 2026-09-04 ("dokumen BAST wajib diunggah + tombol upload kuning") — sebelum
// itu kolomnya cuma `<input type="file">` bawaan browser, opsional & gampang
// terlewat. Permintaan user 2026-09-05: Pengadaan Konstruksi (KDP) ikut
// diwajibkan JUGA, tapi levelnya beda — Pengadaan satu BAST untuk SELURUH
// kontrak, KDP satu BAST PER TERMIN (Perencanaan, Fisik Termin 1, Fisik
// Termin 2, Pengawasan, Biaya Umum, dst — tiap komponen py dokumen sumbernya
// sendiri-sendiri). Inilah kemunculan KETIGA pola "tombol amber wajib upload
// sebelum baris bisa disimpan" (dua pertama sama-sama di Pengadaan.tsx:
// KontrakForm & EditHeaderModal) — CODING-STANDARD §1.2 "rule of three":
// diangkat ke sini supaya perbaikan berikutnya tak perlu disalin tiga kali.
//
// 2026-09-05: dipakai JUGA di Pengamanan (Berkas BAST + Berkas Pakta
// Integritas — dua field terpisah, dua instance komponen ini), Pemanfaatan
// (Dokumen Pemanfaatan — field baru, sebelumnya tak ada upload sama sekali),
// & Penghapusan (Dokumen SK Penghapusan, DIGATE: "Pilih Barang" baru tampil
// sesudah dokumennya ada — beda dari menu lain yang cuma menolak saat submit).
// Karena itu label & teks tombolnya kini bisa dikustom (`judul`,
// `labelTombol`) — dokumennya tak selalu "BAST".
//
// ⚠️ Input file mentah DISEMBUNYIKAN (`hidden`), dipicu lewat tombol bergaya.
// Tampilan bawaan browser ("Choose Files · No file chosen") gampang terlewat
// operator & tak menunjukkan bahwa ini WAJIB — beda dari kolom teks biasa yang
// keharusannya kelihatan begitu dikosongkan lalu disimpan.
//
// Bucket `dokumen-sumber` PRIVAT — dibuka lewat signed URL (`bukaDokumen`),
// BUKAN public URL. Pemanggil bertanggung jawab atas upload/hapus fisiknya
// sendiri (path prefix beda per menu); komponen ini murni UI + validasi tampil.
// ============================================================================
import { useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export const namaFile = (path: string) => path.split('/').pop() || path

export async function bukaDokumen(path: string) {
  const supabase = createClient()
  const { data } = await supabase.storage.from('dokumen-sumber').createSignedUrl(path, 3600)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

export function DokumenLinks({ paths, label = 'Dokumen' }: { paths: string[]; label?: string }) {
  if (paths.length === 0) return null
  return (
    <p className="text-xs text-gray-500 mt-1">
      {label}:{' '}
      {paths.map(p => (
        <button key={p} onClick={() => bukaDokumen(p)} className="underline text-teal hover:opacity-80 mr-2">{namaFile(p)}</button>
      ))}
    </p>
  )
}

export function DokumenBastField({
  paths, uploading, onUpload, onHapus,
  judul = 'Dokumen BAST',
  labelTombol,
  hint = 'wajib sebelum kontrak bisa disetujui (foto / PDF, bisa lebih dari satu)',
  kosongText = 'Belum ada dokumen — wajib diunggah sebelum kontrak bisa disimpan.',
}: {
  paths: string[]; uploading: boolean
  onUpload: (files: FileList | null) => void; onHapus: (path: string) => void
  /** Judul field, mis. "Dokumen SK Penghapusan" — dokumennya tak selalu BAST. */
  judul?: string
  /** Teks tombol saat tidak sedang mengunggah. Baku: "Upload {judul}". */
  labelTombol?: string
  /** Kalimat sesudah "{judul} *" — sesuaikan dgn syarat menu pemanggil. */
  hint?: string
  /** Peringatan amber selama `paths` masih kosong. */
  kosongText?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {judul} <span className="text-red-500">*</span>
        <span className="text-gray-400"> — {hint}</span>
      </label>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
        onChange={e => { onUpload(e.target.files); e.target.value = '' }} disabled={uploading} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
        📎 {uploading ? 'Mengunggah...' : (labelTombol || `Upload ${judul}`)}
      </button>
      {paths.length === 0
        ? <p className="text-xs text-amber-600 mt-1">{kosongText}</p>
        : (
          <ul className="mt-2 space-y-1">
            {paths.map(p => (
              <li key={p} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="truncate">{namaFile(p)}</span>
                <button onClick={() => onHapus(p)} className="text-red-500 hover:text-red-700" title="Hapus dokumen">×</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
