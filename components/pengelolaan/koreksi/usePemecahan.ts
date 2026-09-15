'use client'
// ============================================================================
// Mesin state alasan **Pemecahan Barang** — 1 induk → N pecahan.
//
// Diangkat dari `KoreksiForm` (components/pengelolaan/Koreksi.tsx) 2026-09-15,
// langkah pertama REFACTOR-PLAN Fase 3. Plan itu menyebut batasnya sendiri:
// kelima alasan koreksi (Nilai · Spesifikasi · Pencatatan Ganda · Pemecahan ·
// Penggabungan) tinggal di satu komponen, dan "pecah per alasan" adalah batas
// yang sudah ada dengan sendirinya, bukan garis yang dikarang.
//
// Pemecahan didahulukan karena bagian PALING berbahayanya — aritmetika uang
// yang masuk ledger — sudah diangkat & dikunci lebih dulu di
// lib/pemecahanNilai.ts. Yang tersisa di sini state, satu efek, & empat
// penyunting; tak ada satu pun angka yang dihitung di berkas ini.
//
// ✅ Fase 1 (2026-09-15): kedua query di sini tak lagi menelan `error`.
// Basis yang gagal dibaca kini memakai `basisErr` yang SUDAH ada (jadi Simpan
// tetap terblokir), dan `pilihInduk` yang gagal mengambil spesifikasi induk
// melaporkannya alih-alih mewariskan field kosong ke seluruh pecahan.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parsePeriode, previousPeriode, formatPeriode, periodeDariTanggal, kodeLevel3, perlakuanKode } from '@/lib/bmd'
import { ASET_FIELD_COLS, type FieldKey } from '@/lib/asetFields'
import { alokasiPemecahan, balancePemecahan, keSen, semuaPecahanValid, type AlokasiPecahan } from '@/lib/pemecahanNilai'
import type { Barang, BasisPecah, PecahanItem } from './tipe'

export const newKey = () => Math.random().toString(36).slice(2)

// Tanah: dokumen kepemilikan/sertifikat & jenis hak per-BIDANG → diisi di GIS
// BMD (Kelola Bidang) SESUDAH pemecahan, bukan di form ini (satu sumber).
// Field ini disembunyikan dari modal spesifikasi pecahan tanah & TIDAK diwarisi
// dari induk — tiap pecahan punya sertifikatnya sendiri.
export const TANAH_DOK_FIELDS: FieldKey[] = ['jenis_hak', 'nomor_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan']

export type Pemecahan = {
  induk: Barang | null
  basis: BasisPecah | null
  basisErr: string
  basisLoading: boolean
  indukFields: Record<string, string>
  pecahan: PecahanItem[]
  editIdx: number | null
  setEditIdx: (i: number | null) => void
  setPecahan: React.Dispatch<React.SetStateAction<PecahanItem[]>>
  pilihInduk: (b: Barang) => Promise<void>
  setPecah: (key: string, patch: Partial<PecahanItem>) => void
  addPecah: () => void
  removePecah: (key: string) => void
  reset: () => void
  gantiInduk: () => void
  alokasi: AlokasiPecahan[]
  totalNPInduk: number
  sumNPPecah: number
  balance: boolean
  semuaValid: boolean
}

/**
 * @param tgl tanggal DOKUMEN koreksi. Ia yang menentukan semester basis
 *   (`periode − 1`), jadi mengubah tanggal WAJIB memuat ulang basisnya —
 *   karena itu ia dependency efek di bawah, bukan sekadar argumen simpan.
 */
export function usePemecahan(tgl: string, onErr: (msg: string) => void): Pemecahan {
  const supabase = createClient()

  const [induk, setInduk] = useState<Barang | null>(null)
  const [basis, setBasis] = useState<BasisPecah | null>(null)
  const [basisErr, setBasisErr] = useState('')
  const [basisLoading, setBasisLoading] = useState(false)
  const [indukFields, setIndukFields] = useState<Record<string, string>>({})
  const [pecahan, setPecahan] = useState<PecahanItem[]>([])
  const [editIdx, setEditIdx] = useState<number | null>(null)

  // Basis alokasi induk = state engine di semester SEBELUM cutover (dari tgl dok).
  useEffect(() => {
    if (!induk) { setBasis(null); setBasisErr(''); return }
    ;(async () => {
      setBasisLoading(true); setBasisErr(''); setBasis(null)
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
      const { data, error } = await supabase.from('penyusutan_semester')
        .select('nilai_buku_akhir,akumulasi,sisa_semester,masa_manfaat_tahun')
        .eq('aset_id', induk.id).eq('periode', basisPeriode).maybeSingle()
      // ⚠️ Lewat `basisErr`, BUKAN `onErr`: pesan itu yang memblokir tombol
      // Simpan. Query gagal yang jatuh ke cabang "belum ada data penyusutan"
      // akan menuduh engine belum dijalankan padahal sebabnya lain.
      if (error) {
        setBasisErr(`Gagal membaca akumulasi penyusutan ${basisPeriode}: ${error.message}`)
        setBasisLoading(false); return
      }
      if (data) {
        const d = data as { nilai_buku_akhir: number; akumulasi: number; sisa_semester: number; masa_manfaat_tahun: number | null }
        setBasis({ nilai_buku: d.nilai_buku_akhir, akumulasi: d.akumulasi, sisa_smt: d.sisa_semester, masa_tahun: d.masa_manfaat_tahun, disusutkan: true })
      } else if (perlakuanKode(induk.kode) === 'tidak') {
        // Tanah/ATL/KDP memang TAK PERNAH punya baris engine — akumulasinya nol
        // menurut definisi, bukan "belum dihitung". Membedakan keduanya yang
        // mencegah barang tak-disusutkan tertahan sbg error selamanya.
        setBasis({ nilai_buku: induk.nilai_perolehan, akumulasi: 0, sisa_smt: 0, masa_tahun: null, disusutkan: false })
      } else {
        setBasisErr(`Belum ada data penyusutan induk untuk periode ${basisPeriode}. Jalankan engine dulu untuk periode itu, atau pilih tanggal dokumen di semester berikutnya.`)
      }
      setBasisLoading(false)
    })()
  }, [induk, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pilih induk → warisi field spesifikasi induk sbg titik awal tiap pecahan.
  async function pilihInduk(b: Barang) {
    setInduk(b)
    const { data, error } = await supabase.from('aset').select(ASET_FIELD_COLS.join(',')).eq('id', b.id).single()
    // ⚠️ Berhenti sebelum `setPecahan`: kalau diteruskan, KEDUA pecahan lahir
    // dgn spesifikasi KOSONG yang tak bisa dibedakan dari "induknya memang
    // kosong" — dan itu yang tersimpan ke register saat Simpan.
    if (error) { onErr(`gagal memuat spesifikasi induk: ${error.message}`); return }
    const f: Record<string, string> = {}
    // `as unknown as`: `.select()` diberi string rakitan runtime → supabase-js
    // tak bisa menurunkan bentuk barisnya (tipenya jadi `GenericStringError`).
    if (data) for (const k of ASET_FIELD_COLS) { const v = (data as unknown as Record<string, unknown>)[k]; if (v != null) f[k] = String(v) }
    if (kodeLevel3(b.kode) === '1.3.1') for (const k of TANAH_DOK_FIELDS) delete f[k]
    setIndukFields(f)
    // Dua baris kosong: pemecahan yang sah minimal 2 pecahan, jadi bentuk awalnya
    // sudah bentuk yang sah — operator mengisi, bukan menambah dulu baru mengisi.
    setPecahan([
      { key: newKey(), jumlah: '1', nilai: '', fields: { ...f }, foto: [] },
      { key: newKey(), jumlah: '1', nilai: '', fields: { ...f }, foto: [] },
    ])
  }

  function setPecah(key: string, patch: Partial<PecahanItem>) {
    setPecahan(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }
  function addPecah() { setPecahan(prev => [...prev, { key: newKey(), jumlah: '1', nilai: '', fields: { ...indukFields }, foto: [] }]) }
  // ⚠️ Menolak turun di bawah DUA — bukan sekadar menjaga tampilan: satu pecahan
  // saja bukan pemecahan, dan Σ-nya akan selalu sama dgn induk sehingga
  // pemeriksaan balance meloloskannya.
  function removePecah(key: string) { setPecahan(prev => prev.length <= 2 ? prev : prev.filter(p => p.key !== key)) }

  /** Pindah ke alasan LAIN — buang seluruh jejak pemecahan yang sedang disusun. */
  function reset() {
    setInduk(null); setBasis(null); setBasisErr(''); setPecahan([]); setIndukFields({}); setEditIdx(null)
  }

  /**
   * Tombol "Ganti" induk. SENGAJA lebih sempit dari `reset()`: `indukFields` &
   * `editIdx` dibiarkan, karena `pilihInduk` menimpa dua-duanya begitu induk
   * berikutnya dipilih, dan sisa `editIdx` tak bisa membuka modal apa pun
   * selama `pecahan` kosong (JSX-nya menjaga lewat `pecahan[editIdx] &&`).
   * Dibedakan supaya perbedaan ini terbaca disengaja, bukan kelupaan.
   */
  function gantiInduk() {
    setInduk(null); setBasis(null); setBasisErr(''); setPecahan([])
  }

  // Seluruh aritmetika uangnya → lib/pemecahanNilai.ts (dikunci test + mutasi).
  // JANGAN ditulis ulang di sini.
  const alokasi = alokasiPemecahan(induk?.nilai_perolehan, basis, pecahan)
  const totalNPInduk = induk ? keSen(induk.nilai_perolehan) / 100 : 0
  const sumNPPecah = alokasi.reduce((s, a) => s + keSen(a.np), 0) / 100
  const balance = balancePemecahan(induk?.nilai_perolehan, alokasi)
  const semuaValid = semuaPecahanValid(alokasi)

  return {
    induk, basis, basisErr, basisLoading, indukFields, pecahan,
    editIdx, setEditIdx, setPecahan,
    pilihInduk, setPecah, addPecah, removePecah, reset, gantiInduk,
    alokasi, totalNPInduk, sumNPPecah, balance, semuaValid,
  }
}
