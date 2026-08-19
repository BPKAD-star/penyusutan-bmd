'use client'
// Pop-up konfirmasi bertema — PENGGANTI `confirm()` & `prompt()` bawaan browser.
//
// Kenapa dibuatkan komponen sendiri, bukan sekadar dirapikan di tiap layar:
//   (1) Dialog bawaan itu HITAM-PUTIH milik peramban, tak bisa disentuh CSS sama
//       sekali — di layar yang seluruhnya bertema navy/teal ia terbaca seperti
//       peringatan sistem, bukan bagian aplikasi (keluhan user 2026-08-19).
//   (2) `confirm()` MEMBEKUKAN seluruh tab selama terbuka, jadi mustahil
//       menampilkan keadaan "sedang diproses". Menyetujui usulan standar harga
//       bisa memakan beberapa detik (RPC memasukkan ratusan baris ke bak
//       bersama); dengan dialog bawaan, layar hanya diam lalu tiba-tiba berubah.
//   (3) `prompt()` cuma menyediakan SATU BARIS teks. Catatan telaah yang
//       dikirim ke SKPD justru perlu beberapa kalimat.
//
// Sengaja BUKAN "sistem toast/dialog" umum: yang dibutuhkan cuma satu bentuk —
// pertanyaan ya/tidak yang mempertaruhkan sesuatu, dengan rincian yang ditelaah
// dan (opsional) catatan. Menambah bentuk lain di sini berarti komponennya mulai
// jadi kerangka kerja, dan yang begitu selalu berakhir dengan cabang `if` yang
// tak seorang pun berani cabut.
import { useEffect, useState, type ReactNode } from 'react'
import { backdropClose } from '@/components/backdropClose'

/** Warna nada keputusan. Sengaja bukan `warna: string` bebas: kelas Tailwind
 *  HARUS berupa string utuh di berkas sumber supaya ikut terpindai saat build —
 *  kelas yang dirakit runtime (`bg-${x}-600`) tidak pernah ikut ke CSS dan
 *  tombolnya akan tampil TANPA warna sama sekali, tanpa satu pun error. */
export type NadaKonfirmasi = 'teal' | 'merah' | 'amber'

const NADA: Record<NadaKonfirmasi, {
  /** Lingkaran ikon di kepala pop-up. */
  lencana: string
  /** Gradasi tipis di kepala — penanda nada yang tetap terbaca walau ikonnya kecil. */
  kepala: string
  /** Tombol keputusan. */
  tombol: string
  /** Kotak peringatan di badan. */
  peringatan: string
}> = {
  teal: {
    lencana: 'bg-teal/10 text-teal ring-1 ring-teal/20',
    kepala: 'bg-gradient-to-br from-teal/5 via-white to-white',
    tombol: 'bg-teal hover:bg-teal-light focus:ring-teal/40',
    peringatan: 'bg-teal/5 border-teal/20 text-teal',
  },
  merah: {
    lencana: 'bg-red-50 text-red-600 ring-1 ring-red-100',
    kepala: 'bg-gradient-to-br from-red-50 via-white to-white',
    tombol: 'bg-red-600 hover:bg-red-500 focus:ring-red-300',
    peringatan: 'bg-red-50 border-red-100 text-red-700',
  },
  amber: {
    lencana: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    kepala: 'bg-gradient-to-br from-amber-50 via-white to-white',
    tombol: 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-300',
    peringatan: 'bg-amber-50 border-amber-100 text-amber-800',
  },
}

export type IsianCatatan = {
  label: string
  placeholder?: string
  /** Keterangan kecil di bawah kotak — tempat menjelaskan akibat mengosongkannya. */
  petunjuk?: ReactNode
  /** Nilai awal (mis. catatan telaah sebelumnya). */
  awal?: string
}

type Props = {
  nada?: NadaKonfirmasi
  /** Emoji/karakter di lencana kepala. Satu karakter, bukan gambar. */
  ikon?: string
  judul: string
  /** Baris kecil di bawah judul — biasanya SKPD · jenis · tahun anggaran. */
  subjudul?: ReactNode
  /** Ringkasan yang ditelaah sebelum memutuskan: label di kiri, angka di kanan. */
  rincian?: { label: string; nilai: ReactNode }[]
  /** Penjelasan akibat keputusannya. */
  children?: ReactNode
  /** Kotak bernada — untuk akibat yang tak bisa dibatalkan / syarat yang bisa menggagalkan. */
  peringatan?: ReactNode
  /** Kalau diisi, pop-up menampilkan kotak catatan & mengirim isinya ke `onYa`. */
  catatan?: IsianCatatan
  labelYa: string
  labelBatal?: string
  /** Selama true: tombol terkunci & pop-up TETAP TERBUKA — inilah yang tak bisa
   *  dilakukan `confirm()`. Penutupnya pemanggil, sesudah pekerjaannya selesai. */
  busy?: boolean
  onYa: (catatan: string) => void
  onBatal: () => void
}

export default function KonfirmasiModal({
  nada = 'teal', ikon, judul, subjudul, rincian, children, peringatan,
  catatan, labelYa, labelBatal = 'Batal', busy = false, onYa, onBatal,
}: Props) {
  const [isi, setIsi] = useState(catatan?.awal || '')
  const n = NADA[nada]

  // Esc menutup — kebiasaan yang dibawa dari dialog bawaan; mencabutnya membuat
  // pop-up ini terasa lebih "menjebak" daripada yang digantikannya. Diabaikan
  // selama busy: menutup layar di tengah operasi cuma menyembunyikan hasilnya,
  // pekerjaannya sendiri tetap jalan di server.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onBatal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onBatal])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-dark/40 backdrop-blur-[2px] p-4 animate-fade-in"
      {...backdropClose(() => { if (!busy) onBatal() })}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-bubble-in"
        onClick={e => e.stopPropagation()}>

        <div className={`px-5 pt-5 pb-4 flex items-start gap-3.5 ${n.kepala}`}>
          <div className={`h-10 w-10 flex-shrink-0 rounded-xl flex items-center justify-center text-lg ${n.lencana}`}>
            {ikon || '?'}
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="font-semibold text-gray-900 leading-snug">{judul}</h3>
            {subjudul && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subjudul}</p>}
          </div>
        </div>

        <div className="px-5 pb-5 space-y-3.5">
          {rincian && rincian.length > 0 && (
            <dl className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100 text-xs">
              {rincian.map(r => (
                <div key={r.label} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-gray-500">{r.label}</dt>
                  <dd className="text-gray-900 font-medium text-right">{r.nilai}</dd>
                </div>
              ))}
            </dl>
          )}

          {children && <div className="text-sm text-gray-600 leading-relaxed">{children}</div>}

          {peringatan && (
            <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${n.peringatan}`}>
              {peringatan}
            </div>
          )}

          {catatan && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{catatan.label}</label>
              {/* Beberapa baris, bukan satu — inilah alasan `prompt()` ditinggalkan:
                  catatan telaah yang dibaca SKPD perlu menjelaskan apa yang harus
                  diperbaiki, dan itu jarang muat dalam satu kalimat. */}
              <textarea
                className="select-filter w-full h-24 resize-none leading-relaxed"
                autoFocus
                disabled={busy}
                placeholder={catatan.placeholder}
                value={isi}
                onChange={e => setIsi(e.target.value)}
              />
              {catatan.petunjuk && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{catatan.petunjuk}</p>}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-gray-50/70 border-t border-gray-100 flex justify-end gap-2">
          <button
            className="btn-secondary text-sm disabled:opacity-50"
            onClick={onBatal}
            disabled={busy}
          >
            {labelBatal}
          </button>
          <button
            className={`text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed ${n.tombol}`}
            onClick={() => onYa(isi.trim())}
            disabled={busy}
          >
            {busy ? 'Memproses…' : labelYa}
          </button>
        </div>
      </div>
    </div>
  )
}
