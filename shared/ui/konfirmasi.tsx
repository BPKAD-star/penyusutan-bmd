'use client'
// ============================================================================
// useKonfirmasi() — SATU-SATUNYA cara meminta konfirmasi di aplikasi ini.
// `confirm()` / `prompt()` / `alert()` bawaan peramban DILARANG dipakai lagi
// (CODING-STANDARD.md §4.5); alasannya lengkap di shared/ui/KonfirmasiModal.tsx.
//
// KENAPA HOOK, BUKAN CUKUP KOMPONENNYA SAJA: bentuk pemanggilan lama itu
//
//     if (!confirm('Hapus barang ini?')) return
//     await hapus()
//
// — satu baris, di tengah fungsi, dan ALURNYA IKUT DI SITU. Mengganti tiap
// tempat dengan komponen terkendali berarti menambah state + cabang JSX +
// menaikkan fungsi kerjanya jadi callback, di puluhan berkas. Yang begitu tidak
// akan pernah selesai dikerjakan, dan yang belum sempat diubah tetap memakai
// dialog bawaan. Hook ini menjaga bentuknya tetap SATU BARIS:
//
//     const konfirmasi = useKonfirmasi()
//     ...
//     if (!(await konfirmasi({ judul: 'Hapus barang ini?', labelYa: 'Hapus' })).ya) return
//     await hapus()
//
// Dengan pekerjaan yang lama — pop-up TETAP TERBUKA & menampilkan "Memproses…"
// sampai `kerjakan` selesai (yang mustahil dilakukan `confirm()`, karena ia
// membekukan seluruh tab):
//
//     await konfirmasi({
//       judul: 'Setujui kontrak ini?', labelYa: 'Ya, setujui',
//       kerjakan: async () => { await approve() },
//     })
//
// Kalau `kerjakan` melempar, promise-nya ikut MELEMPAR — jadi `try/catch` yang
// sudah ada di pemanggil tetap bekerja apa adanya (fail-closed, rules.md §2.4).
//
// Pengganti `alert()`: `tanpaBatal: true` — satu tombol, tak ada yang ditanya.
// ============================================================================
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import KonfirmasiModal, {
  type IsianCatatan, type NadaKonfirmasi,
} from '@/shared/ui/KonfirmasiModal'

export type OpsiKonfirmasi = {
  nada?: NadaKonfirmasi
  ikon?: string
  judul: string
  subjudul?: ReactNode
  /** Ringkasan yang ditelaah sebelum memutuskan. */
  rincian?: { label: string; nilai: ReactNode }[]
  /** Penjelasan akibat keputusannya (boleh JSX — pakai <b> untuk yang menentukan). */
  isi?: ReactNode
  peringatan?: ReactNode
  /** Kotak catatan — pengganti `prompt()`. Isinya dikirim balik lewat `catatan`. */
  catatan?: IsianCatatan
  labelYa: string
  labelBatal?: string
  /** Pemberitahuan satu tombol — pengganti `alert()`. */
  tanpaBatal?: boolean
  /**
   * Pekerjaan yang dijalankan SELAGI pop-up masih terbuka. Pakai ini untuk
   * apa pun yang menyentuh jaringan; tanpa itu pop-up menutup lebih dulu dan
   * layar diam beberapa detik tanpa memberi tahu apa-apa.
   * Kalau melempar, `konfirmasi()` ikut melempar.
   */
  kerjakan?: (catatan: string) => Promise<void>
}

export type HasilKonfirmasi = {
  /** false = dibatalkan (tombol Batal, Esc, atau klik di luar). */
  ya: boolean
  /** Isi kotak catatan; string kosong kalau tak ada kotaknya. */
  catatan: string
}

type Tanya = (opsi: OpsiKonfirmasi) => Promise<HasilKonfirmasi>

const Ctx = createContext<Tanya | null>(null)

/**
 * Dipasang SEKALI di `DashboardChrome`. Sengaja satu host untuk seluruh
 * dashboard, bukan satu per halaman: konfirmasi sering dipicu dari dalam modal
 * lain, dan host yang ikut dibongkar bersama pemanggilnya akan menutup
 * pop-upnya sendiri di tengah jalan.
 */
export function KonfirmasiProvider({ children }: { children: ReactNode }) {
  const [opsi, setOpsi] = useState<OpsiKonfirmasi | null>(null)
  const [busy, setBusy] = useState(false)
  // Nomor urut → dipakai sbg `key` modal, supaya isi kotak catatan tak terbawa
  // dari konfirmasi sebelumnya. Tanpa ini, alasan penolakan dokumen A muncul
  // lagi saat menolak dokumen B.
  const [seri, setSeri] = useState(0)
  // Penyelesai promise disimpan di ref, bukan state: ia tak ikut menentukan
  // tampilan, dan menaruhnya di state membuat tiap render menjadwalkan render
  // berikutnya.
  const tunggu = useRef<{
    selesai: (h: HasilKonfirmasi) => void
    gagal: (e: unknown) => void
  } | null>(null)

  const konfirmasi = useCallback<Tanya>((o) => new Promise<HasilKonfirmasi>((selesai, gagal) => {
    // Konfirmasi yang belum dijawab tapi keburu tertimpa diselesaikan sbg
    // "batal" — kalau dibiarkan, promise-nya menggantung SELAMANYA dan fungsi
    // pemanggilnya berhenti di tengah tanpa satu pun jejak (bentuk kegagalan
    // senyap yang sama dgn loader nyangkut di "Memuat…", docs/insiden.md INS-10).
    tunggu.current?.selesai({ ya: false, catatan: '' })
    tunggu.current = { selesai, gagal }
    setSeri(s => s + 1)
    setOpsi(o)
  }), [])

  function tutup() {
    setOpsi(null); setBusy(false); tunggu.current = null
  }

  async function onYa(catatan: string) {
    const t = tunggu.current
    if (!opsi || !t) return
    if (opsi.kerjakan) {
      setBusy(true)
      try {
        await opsi.kerjakan(catatan)
      } catch (e) {
        tutup(); t.gagal(e); return
      }
    }
    tutup(); t.selesai({ ya: true, catatan })
  }

  function onBatal() {
    if (busy) return
    const t = tunggu.current
    tutup(); t?.selesai({ ya: false, catatan: '' })
  }

  return (
    <Ctx.Provider value={konfirmasi}>
      {children}
      {opsi && (
        <KonfirmasiModal
          key={seri}
          nada={opsi.nada}
          ikon={opsi.ikon}
          judul={opsi.judul}
          subjudul={opsi.subjudul}
          rincian={opsi.rincian}
          peringatan={opsi.peringatan}
          catatan={opsi.catatan}
          labelYa={opsi.labelYa}
          labelBatal={opsi.labelBatal}
          tanpaBatal={opsi.tanpaBatal}
          busy={busy}
          onYa={onYa}
          onBatal={onBatal}
        >
          {opsi.isi}
        </KonfirmasiModal>
      )}
    </Ctx.Provider>
  )
}

/**
 * MELEMPAR kalau dipakai di luar `KonfirmasiProvider` — sengaja, dan ini bukan
 * kerewelan: kalau ia diam-diam mengembalikan `{ya:false}`, tombolnya akan
 * terlihat rusak (ditekan, tak terjadi apa-apa) dan tak seorang pun tahu
 * kenapa; kalau `{ya:true}`, aksi berjalan TANPA ditanyakan — dan sebagian
 * aksi itu menghapus barang. Gagal berisik, sesuai CODING-STANDARD §1.3.
 */
export function useKonfirmasi(): Tanya {
  const t = useContext(Ctx)
  if (!t) throw new Error('useKonfirmasi dipakai di luar <KonfirmasiProvider> (dipasang di DashboardChrome).')
  return t
}
