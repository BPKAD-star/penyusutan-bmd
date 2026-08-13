'use client'
// Lampiran RKBMD — lembar usulan bertanda tangan kepala kantor + surat
// pengantar, digabung jadi SATU berkas PDF (keputusan user 2026-08-13).
//
// Ini SYARAT menekan Ajukan, dan penegaknya trigger DB (`fn_rkbmd_status_guard`,
// migrasi 20260813_01) — yang di sini cuma supaya operator tak menekan tombol
// lalu kena pesan mentah dari Postgres. Jangan pernah menganggap kebalikannya:
// mematikan tombol saja tidak mengamankan apa pun.
//
// SATU berkas, bukan daftar (permintaan user: "pdf satu file"). Kolomnya tetap
// `text[]` supaya kalau nanti perlu lebih dari satu tak usah migrasi lagi;
// yang membatasi jadi satu adalah layar ini. Mengunggah = MENGGANTI.
//
// Berkas lama dibuang dari storage setelah penggantinya benar-benar tercatat di
// DB — urutannya disengaja: berkas yatim itu sampah yang bisa dibersihkan,
// sedangkan baris DB yang menunjuk berkas terhapus itu lampiran yang hilang.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'dokumen-sumber'
const PREFIX = 'rkbmd-usulan'
/** Sama dengan batas bucket-nya (10MB). Diperiksa di sini juga supaya pesannya
 *  ramah — kalau tidak, yang muncul pesan mentah dari storage. */
const MAKS_BYTE = 10 * 1024 * 1024

export default function RkbmdLampiran({ rkbmdId, paths, diunggahAt, canEdit, onChanged }: {
  rkbmdId: string
  paths: string[]
  diunggahAt: string | null
  /** Dokumen masih bisa disunting (draft / ditolak). */
  canEdit: boolean
  onChanged: () => void
}) {
  const supabase = createClient()
  const path = paths[0] || ''
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Bucket privat → tautannya wajib signed URL (~1 jam), bukan public URL.
  useEffect(() => {
    let alive = true
    if (!path) { setUrl(''); return }
    ;(async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
      if (!alive) return
      if (error) { setErr(`gagal membuat tautan berkas: ${error.message}`); setUrl('') }
      else { setErr(''); setUrl(data?.signedUrl || '') }
    })()
    return () => { alive = false }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  async function unggah(file: File) {
    setErr('')
    if (file.type !== 'application/pdf') {
      setErr('Berkasnya harus PDF — gabungkan lembar usulan bertanda tangan dan surat pengantar jadi satu berkas.')
      return
    }
    if (file.size > MAKS_BYTE) {
      setErr(`Berkas ${(file.size / 1024 / 1024).toFixed(1)} MB — batasnya 10 MB. Perkecil hasil pindaiannya dulu.`)
      return
    }
    setBusy(true)
    try {
      const aman = file.name.replace(/[^\w.-]+/g, '_')
      const baru = `${PREFIX}/${rkbmdId}/${Date.now()}-${aman}`
      const { error: eUp } = await supabase.storage.from(BUCKET).upload(baru, file, { upsert: false })
      if (eUp) { setErr(`gagal mengunggah berkas: ${eUp.message}`); return }

      // `.select()` WAJIB: UPDATE yang ditolak RLS tidak melempar error, cuma
      // mengembalikan 0 baris — tanpa ini kegagalan dilaporkan sbg "berhasil"
      // dan operator mengira sudah melampirkan padahal belum.
      const { data, error: eDb } = await supabase.from('rkbmd')
        .update({ dokumen_paths: [baru] }).eq('id', rkbmdId).select('id')
      if (eDb || !data || data.length === 0) {
        // DB menolak → berkas yang terlanjur naik dibuang, jangan tinggalkan yatim.
        await supabase.storage.from(BUCKET).remove([baru])
        setErr(eDb ? `gagal menyimpan lampiran: ${eDb.message}`
                   : 'Perubahan ditolak database — dokumen ini di luar wewenang SKPD-mu.')
        return
      }
      if (path) await supabase.storage.from(BUCKET).remove([path])
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function hapus() {
    if (!confirm('Hapus lampiran? Tombol Ajukan akan mati sampai lampiran baru diunggah.')) return
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.from('rkbmd')
        .update({ dokumen_paths: [] }).eq('id', rkbmdId).select('id')
      if (error || !data || data.length === 0) {
        setErr(error ? `gagal menghapus lampiran: ${error.message}`
                     : 'Perubahan ditolak database — dokumen ini di luar wewenang SKPD-mu.')
        return
      }
      await supabase.storage.from(BUCKET).remove([path])
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">Dokumen usulan bertanda tangan</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Cetak lembar usulan di atas, mintakan tanda tangan kepala kantor, lalu unggah hasil pindaiannya
            <span className="font-medium"> bersama surat pengantar dalam satu berkas PDF</span>. Wajib —
            selama belum dilampirkan, dokumen ini tidak bisa diajukan.
          </p>
        </div>
        {path && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-teal/10 text-teal whitespace-nowrap">✓ Terlampir</span>
        )}
      </div>

      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {path ? (
          <>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-teal hover:underline font-medium">
                📄 Lihat berkas terlampir
              </a>
            ) : (
              <span className="text-sm text-gray-400">Menyiapkan tautan…</span>
            )}
            {diunggahAt && (
              <span className="text-[11px] text-gray-400">
                diunggah {new Date(diunggahAt).toLocaleString('id-ID')}
              </span>
            )}
            {canEdit && (
              <>
                <label className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">
                  {busy ? 'Mengunggah…' : 'Ganti berkas'}
                  <input type="file" accept="application/pdf" className="hidden" disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) unggah(f) }} />
                </label>
                <button onClick={hapus} disabled={busy}
                  className="text-sm text-red-500 hover:text-red-700 px-2">Hapus lampiran</button>
              </>
            )}
          </>
        ) : canEdit ? (
          <label className="btn-primary cursor-pointer">
            {busy ? 'Mengunggah…' : '📎 Unggah PDF bertanda tangan'}
            <input type="file" accept="application/pdf" className="hidden" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) unggah(f) }} />
          </label>
        ) : (
          <span className="text-sm text-gray-400">Belum ada lampiran.</span>
        )}
      </div>

      {canEdit && path && (
        <p className="text-[11px] text-amber-600 mt-3">
          ⚠️ Kalau isi RKBMD di bawah diubah (menambah/menyunting/menghapus item atau kartu), lampiran ini
          <span className="font-medium"> otomatis dicabut</span> dan dokumen kembali ke draft — lembarnya harus
          dicetak & ditandatangani ulang. Ini disengaja: berkas bertanda tangan harus selalu cocok dengan isinya.
        </p>
      )}
    </div>
  )
}
