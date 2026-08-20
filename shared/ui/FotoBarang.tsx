'use client'
// ============================================================================
// FotoBarang — sel foto di tabel barang + pop-up penampil ukuran penuh.
//
// LATAR (permintaan user 2026-08-20): di menu Cara Perolehan, kolom FOTO cuma
// menampilkan gambar mini 32×32 px. Foto barang itu satu-satunya bukti visual
// yang dipakai memverifikasi kartu sebelum disetujui, dan pada ukuran segitu
// nomor rangka/merek di badan barang mustahil dibaca — jadi praktis ia cuma
// penanda "ada fotonya", bukan sesuatu yang bisa ditelaah.
//
// KENAPA DI shared/ui, BUKAN DISALIN DI TIAP MENU: sebelum ini `useFirstFotoUrls`
// beserta markup selnya sudah disalin di EMPAT tempat — kartu draft & kartu
// disetujui, masing-masing di Pengadaan.tsx dan PerolehanManual.tsx (yang
// sendirinya melayani Hibah, Tukar Menukar, Hasil Inventarisasi, & Perolehan
// Lainnya). Keempatnya identik sampai ke kelas Tailwind-nya. Menambah pop-up
// dengan cara menyalin lagi = persis utang "ubah satu, samakan yang lain" yang
// diperingatkan CLAUDE.md.
//
// ⚠️ BUCKET `aset-foto` PRIVAT — gambarnya WAJIB lewat signed URL
// (`createSignedUrls`), bukan public URL. Lihat CLAUDE.md bagian Foto barang.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'

/**
 * Signed URL untuk gambar mini di tabel — SATU foto per baris (yang pertama).
 *
 * Sengaja tetap "yang pertama saja": satu kartu bisa berisi ratusan barang, dan
 * menandatangani SELURUH foto tiap barang cuma untuk kolom selebar 32 px itu
 * pemborosan yang tumbuh mengikuti besar kartu. Foto ke-2 dst baru
 * ditandatangani saat pop-upnya dibuka — lihat `FotoLightbox`.
 *
 * Pemanggil mengirim daftar foto-pertama seluruh baris (`items.map(i =>
 * i.foto[0]).filter(Boolean)`) supaya semuanya ditandatangani dalam SATU
 * permintaan, bukan satu permintaan per baris.
 */
export function useFotoThumbs(paths: string[]) {
  const supabase = createClient()
  const [urls, setUrls] = useState<Record<string, string>>({})
  // Kunci efek = isi daftarnya, bukan identitas arraynya. `paths` dirakit ulang
  // tiap render oleh pemanggil (`.map().filter()`), jadi memakai `paths` sbg
  // dependensi akan menandatangani ulang di SETIAP render.
  const key = paths.join('|')
  useEffect(() => {
    if (paths.length === 0) { setUrls({}); return }
    (async () => {
      const { data, error } = await supabase.storage.from('aset-foto').createSignedUrls(paths, 3600)
      // ⚠️ SENGAJA TIDAK MELEMPAR, dan ini satu-satunya tempat di modul ini yang
      // begitu. Aturan fail-closed repo (rules.md §2.1) melindungi ANGKA yang
      // dilaporkan; yang ini gambar mini 32 px murni hiasan, dan menjatuhkan
      // seluruh tabel kartu gara-gara tanda tangan foto gagal justru merugikan.
      // Kegagalannya tetap tidak disembunyikan, cuma diturunkan derajatnya:
      // selnya jatuh ke penanda "{n}📷" yang TETAP BISA DIKLIK, dan
      // `FotoLightbox` — yang menandatangani sendiri — menampilkan pesan
      // aslinya. Jadi operator tetap sampai ke sebab yang sebenarnya, lewat
      // satu klik, bukan lewat tabel yang kosong tanpa keterangan.
      // Pola yang sama dgn kolom pelengkap Daftar Barang Awal (CLAUDE.md).
      if (error) { setUrls({}); return }
      const map: Record<string, string> = {}
      for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
      setUrls(map)
    })()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

const namaFile = (path: string) => path.split('/').pop() || path

/**
 * Pop-up penampil foto. Menandatangani SENDIRI seluruh `paths` saat dibuka —
 * jadi ia tak bergantung pada URL gambar mini (yang cuma memuat foto pertama)
 * dan URL-nya selalu segar, bukan sisa tanda tangan sejam lalu.
 */
function FotoLightbox({ paths, judul, onClose }: {
  paths: string[]; judul?: string | null; onClose: () => void
}) {
  const supabase = createClient()
  const [urls, setUrls] = useState<string[] | null>(null)   // null = masih memuat
  const [gagal, setGagal] = useState('')
  const [i, setI] = useState(0)

  const key = paths.join('|')
  useEffect(() => {
    let batal = false
    ;(async () => {
      const { data, error } = await supabase.storage.from('aset-foto').createSignedUrls(paths, 3600)
      if (batal) return
      // `error` dibaca, tidak ditelan: tanpa ini kegagalan tanda tangan tampil
      // sebagai pop-up kosong melompong & operator mengira fotonya yang hilang.
      if (error) { setGagal(error.message); setUrls([]); return }
      // Urutan hasil createSignedUrls mengikuti urutan `paths` yang dikirim,
      // tapi dipetakan ulang lewat `path` supaya nomor "1 / 3" di layar tetap
      // cocok dgn urutan unggahnya walau suatu saat urutannya tak dijamin.
      const map = new Map((data || []).map(d => [d.path, d.signedUrl]))
      setUrls(paths.map(p => map.get(p) || '').filter(Boolean))
    })()
    return () => { batal = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = urls?.length ?? 0
  // Esc menutup, panah kiri/kanan berpindah — kebiasaan baku penampil gambar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (n > 1 && e.key === 'ArrowRight') setI(v => (v + 1) % n)
      if (n > 1 && e.key === 'ArrowLeft') setI(v => (v - 1 + n) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, onClose])

  return (
    <div
      // z-[60] sederajat dgn KonfirmasiModal: pop-up ini bisa dibuka dari dalam
      // kartu yang sudah ber-modal (z-50), dan kalau tampil di bawahnya akan
      // terlihat seperti fotonya tidak bisa diklik.
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-navy-dark/80 backdrop-blur-[2px] p-4 animate-fade-in"
      {...backdropClose(onClose)}
      role="dialog"
      aria-modal="true"
      aria-label={judul || 'Foto barang'}
    >
      <div className="w-full max-w-4xl flex items-center justify-between gap-3 mb-3 text-white">
        <div className="min-w-0">
          {judul && <p className="text-sm font-semibold truncate">{judul}</p>}
          <p className="text-[11px] text-white/60 truncate">
            {n > 1 ? `Foto ${i + 1} dari ${n} · ` : ''}{paths[i] ? namaFile(paths[i]) : ''}
          </p>
        </div>
        <button onClick={onClose} aria-label="Tutup"
          className="flex-shrink-0 h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg leading-none">
          ×
        </button>
      </div>

      <div className="relative flex items-center justify-center w-full max-w-4xl"
        onClick={e => e.stopPropagation()}>
        {n > 1 && (
          <button onClick={() => setI(v => (v - 1 + n) % n)} aria-label="Foto sebelumnya"
            className="absolute left-2 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white text-xl leading-none">
            ‹
          </button>
        )}

        {urls === null ? (
          <p className="text-white/70 text-sm py-20">Memuat foto...</p>
        ) : gagal ? (
          <p className="text-red-200 text-sm py-20 text-center px-6">Gagal memuat foto: {gagal}</p>
        ) : n === 0 ? (
          <p className="text-white/70 text-sm py-20">Fotonya tidak ditemukan di penyimpanan.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls[i]} alt={judul || 'Foto barang'}
            className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl bg-white" />
        )}

        {n > 1 && (
          <button onClick={() => setI(v => (v + 1) % n)} aria-label="Foto berikutnya"
            className="absolute right-2 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white text-xl leading-none">
            ›
          </button>
        )}
      </div>

      {n > 0 && urls && (
        // Foto barang sering perlu diperbesar lagi (nomor rangka/mesin di badan
        // barang). Tab baru menyerahkannya ke penampil gambar peramban.
        <a href={urls[i]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="mt-3 text-xs text-white/70 hover:text-white underline">
          Buka ukuran penuh di tab baru ↗
        </a>
      )}
    </div>
  )
}

/**
 * Isi kolom FOTO satu baris tabel. Tiga keadaan, sama persis dengan sebelumnya
 * — yang berubah cuma: yang ADA fotonya kini bisa DIKLIK.
 *
 * @param paths seluruh foto barang itu (bukan cuma yang pertama) — pop-upnya
 *   yang menampilkan sisanya.
 * @param thumbUrl signed URL foto pertama dari `useFotoThumbs`, boleh kosong
 *   (masih dimuat) — selnya tetap bisa diklik, karena pop-up menandatangani
 *   sendiri.
 * @param judul nama barang, dipakai sbg judul pop-up & teks alt.
 */
export function FotoSel({ paths, thumbUrl, judul }: {
  paths: string[]; thumbUrl?: string; judul?: string | null
}) {
  const [buka, setBuka] = useState(false)
  if (!paths || paths.length === 0) return <span className="text-[10px] text-gray-300">-</span>

  return (
    <>
      <button type="button" onClick={() => setBuka(true)}
        title={`Lihat foto${paths.length > 1 ? ` (${paths.length})` : ''}`}
        aria-label={`Lihat foto ${judul || 'barang'}`}
        className="mx-auto block rounded focus:outline-none focus:ring-2 focus:ring-teal/40">
        {thumbUrl ? (
          <span className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl} alt=""
              className="w-8 h-8 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
            {paths.length > 1 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-navy text-white text-[9px] leading-none px-1 py-0.5">
                {paths.length}
              </span>
            )}
          </span>
        ) : (
          // Gambar mininya belum/ tak bisa ditandatangani — tetap dibuat tombol,
          // jangan teks mati: pop-upnya punya jalur tanda tangannya sendiri, jadi
          // fotonya masih bisa dibuka.
          <span className="text-[10px] text-gray-400 underline hover:text-teal">{paths.length}📷</span>
        )}
      </button>
      {buka && <FotoLightbox paths={paths} judul={judul} onClose={() => setBuka(false)} />}
    </>
  )
}
