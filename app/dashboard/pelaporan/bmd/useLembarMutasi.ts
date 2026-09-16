'use client'
// ============================================================================
// Lembar resmi IV.L.4.1/4.3 (Rekapitulasi Mutasi) — identitas kop, konfigurasi
// tanda tangan, dan pemicu cetaknya.
//
// Diangkat dari `LaporanBmdPage` 2026-09-16 (REFACTOR-PLAN Fase 3). Ini mesin
// state tentang LEMBAR YANG DICETAK, terpisah dari `prosesMutasi()` yang
// menghitung angkanya — dan pemisahan itu memang ada di kenyataannya: angkanya
// datang dari satu tempat, sedangkan siapa yang meneken & bagaimana kop-nya
// berbunyi tak menyentuh satu angka pun.
//
// ⚠️ Lembarnya dirender DI HALAMAN, bukan rute `/cetak` — angkanya lahir dari
// `prosesMutasi()` yang mahal & panjang, jadi menghitungnya ulang di halaman
// kedua membuka celah lembar bertanda tangan yang BEDA dari layar (pola yang
// sama dgn Berita Acara Rekonsiliasi). Jangan dipindah ke rute cetak.
//
// ⚠️ Yang paling penting di sini: `konfigAwal()` SATU SUMBER. Sampai
// 2026-09-16 perakitan konfig ditulis DUA KALI — di efek auto-init dan di
// `onCetak` modal — dengan `namaSkpd`, `kodeLokasi`, & aturan `sebutan` yang
// disalin persis. Menyimpang satu saja berarti pratinjau di layar & lembar
// yang benar-benar tercetak menyebut sebutan pejabat yang BERBEDA, tanpa satu
// pun error.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import type { KonfigMutasi } from '@/components/pelaporan/LembarMutasiBmd'

export type SkpdInfo = { nama: string; kodeLokasi: string; level: number }

export type LembarMutasi = {
  skpdInfo: SkpdInfo | null
  konfig: KonfigMutasi | null
  setKonfig: (v: KonfigMutasi | null) => void
  modalTerbuka: boolean
  setModalTerbuka: (v: boolean) => void
  /** Nama SKPD siap-pakai untuk kop & nama berkas; null-safe. */
  namaSkpd: string
  /** Konfig bawaan (tanpa tanda tangan) — SATU sumber untuk efek & modal. */
  konfigAwal: (ttd?: Pick<KonfigMutasi, 'tanggal' | 'ttd' | 'ttdKiri'>) => KonfigMutasi
  /** Jalankan dialog Print peramban untuk lembar yang sedang dirender. */
  cetak: () => void
}

/**
 * @param skpdId SKPD terpilih; `null` = se-kabupaten (lingkup 'pemda').
 * @param periode label periode untuk nama berkas bawaan "Save as PDF".
 * @param siapSumber angkanya sudah ada — konfig baru diisi otomatis sesudah
 *   itu, supaya lembar tak pernah berdiri dengan kop tapi tanpa isi.
 */
export function useLembarMutasi(skpdId: number | null, periode: string, siapSumber: boolean): LembarMutasi {
  const supabase = createClient()
  const [skpdInfo, setSkpdInfo] = useState<SkpdInfo | null>(null)
  const [konfig, setKonfig] = useState<KonfigMutasi | null>(null)
  const [modalTerbuka, setModalTerbuka] = useState(false)
  // ⚠️ COUNTER, bukan boolean yang di-reset: `window.print()` harus jalan
  // SESUDAH React merender lembarnya, dan boolean gampang jadi "klik kedua tak
  // melakukan apa-apa" kalau `afterprint` tak menyala (beda antar peramban).
  const [pemicuCetak, setPemicuCetak] = useState(0)

  const namaSkpd = skpdId ? (skpdInfo?.nama || `SKPD #${skpdId}`) : ''

  function konfigAwal(ttd?: Pick<KonfigMutasi, 'tanggal' | 'ttd' | 'ttdKiri'>): KonfigMutasi {
    return {
      lingkup: skpdId ? 'skpd' : 'pemda',
      namaSkpd,
      kodeLokasi: skpdInfo?.kodeLokasi || '',
      // Sebutan ikut level: 1 = Pengguna Barang, di bawahnya Kuasa Pengguna
      // Barang (lampiran menyebut ketiganya karena satu format melayani
      // semua tingkatan).
      sebutan: (skpdInfo?.level ?? 1) <= 1 ? 'Pengguna Barang' : 'Kuasa Pengguna Barang',
      tanggal: ttd?.tanggal ?? '',
      ttd: ttd?.ttd ?? null,
      ttdKiri: ttd?.ttdKiri ?? null,
    }
  }

  // Identitas SKPD untuk kop lembar (`SkpdSelection` cuma membawa id).
  useEffect(() => {
    // Lingkup lembar (skpd/pemda) & identitas kop-nya berubah begitu SKPD
    // berganti — reset supaya efek auto-init di bawah menyusunnya ulang dari
    // `skpdInfo` yang BARU, bukan menyisakan konfig SKPD lama.
    setKonfig(null)
    if (skpdId == null) { setSkpdInfo(null); return }
    let batal = false
    void (async () => {
      // Gagal memuatnya tak menjatuhkan apa pun — kop lembar tinggal memakai
      // cadangan ("SKPD #id") & kode lokasinya bertitik-titik. Itu sikap yang
      // benar di sini: identitas kop hiasan di atas angka yang sudah benar.
      const { data } = await supabase.from('admin_skpd')
        .select('nama,level,kode_skpd,kode_lokasi').eq('id', skpdId).maybeSingle()
      if (batal) return
      const r = data as { nama: string; level: number | null; kode_skpd: string | null; kode_lokasi: string | null } | null
      setSkpdInfo(r ? {
        nama: r.nama,
        // `kode_lokasi` KOSONG di seluruh 816 baris (CLAUDE.md 2026-08-03);
        // yang terisi & jadi identitas resmi SKPD adalah `kode_skpd`. Kolom
        // bernama-tepat tetap didahulukan kalau suatu saat diisi.
        kodeLokasi: r.kode_lokasi || r.kode_skpd || '',
        level: r.level ?? 1,
      } : null)
    })()
    return () => { batal = true }
  }, [skpdId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Konfig diisi KOSONG (ttd null, tanggal '') begitu datanya siap — penanda
  // tangan tetap "belum dipilih" sampai operator membuka pop-up & memilihnya;
  // itu memang tampilan yang benar (bertitik-titik), sama seperti pratinjau
  // Koreksi/Reklasifikasi yang juga TANPA ttd.
  useEffect(() => {
    if (!siapSumber || konfig) return
    setKonfig(konfigAwal())
  }, [siapSumber, konfig, skpdId, skpdInfo]) // eslint-disable-line react-hooks/exhaustive-deps

  // `document.title` = nama bawaan berkas saat "Save as PDF" (satu-satunya
  // cara menyetelnya dari halaman), DIPULIHKAN sesudahnya supaya judul tab
  // dashboard tak berubah permanen.
  useEffect(() => {
    if (pemicuCetak === 0) return
    const judulAsli = document.title
    document.title = namaBerkasLaporan({
      laporan: 'Rekapitulasi Mutasi BMD', periode,
      skpd: skpdId ? (skpdInfo?.nama || 'SKPD') : 'Kab Kediri',
    })
    const pulih = () => { document.title = judulAsli }
    window.addEventListener('afterprint', pulih)
    const t = window.setTimeout(() => window.print(), 80)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', pulih)
      pulih()
    }
  }, [pemicuCetak]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    skpdInfo, konfig, setKonfig, modalTerbuka, setModalTerbuka,
    namaSkpd, konfigAwal,
    cetak: () => setPemicuCetak(n => n + 1),
  }
}
