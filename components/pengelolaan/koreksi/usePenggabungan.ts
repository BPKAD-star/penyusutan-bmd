'use client'
// ============================================================================
// Mesin state alasan **Penggabungan Barang** — N barang sumber → 1 induk.
//
// Diangkat dari `KoreksiForm` 2026-09-15, langkah kedua REFACTOR-PLAN Fase 3
// sesudah `usePemecahan`. Ini mesin state TERBESAR di antara kelima alasan
// (14 `useState`), dan bentuknya memang tiga kelompok yang berbeda:
//
//   · pencarian & daftar anggota   (qGabung · hasil · list · indukId)
//   · barang SEJENIS se-SKPD       (sejenis · selSejenis · loading)
//   · basis akumulasi + spek hasil (basis* · gabungSpek*)
//
// Seluruh ATURAN & aritmetikanya → lib/penggabunganNilai.ts (dikunci test +
// 6 mutasi). Di sini tak ada satu pun angka yang dihitung sendiri.
//
// ⚠️ MURNI PINDAH. Perilaku yang JANGGAL pun dipertahankan — lihat
// `openGabungSpek` yang tak memeriksa `error`. Membetulkannya bareng
// pemindahan membuat pemindahannya tak bisa dibuktikan setara.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parsePeriode, previousPeriode, formatPeriode, periodeDariTanggal, perlakuanKode } from '@/lib/bmd'
import { koreksiFieldKeys } from '@/lib/asetFields'
import {
  kunciGabung, syaratGabungOk, totalNilaiGabung, totalAkumulasiGabung, anggotaTanpaBasis,
} from '@/lib/penggabunganNilai'
import type { KandidatGabung, SpekEdit } from './tipe'

const KANDIDAT_COLS = 'id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan,satuan,merek_tipe'

export type Penggabungan = {
  q: string
  setQ: (v: string) => void
  hasil: KandidatGabung[]
  list: KandidatGabung[]
  indukId: string | null
  setIndukId: (id: string | null) => void
  induk: KandidatGabung | null
  sejenis: KandidatGabung[]
  sejenisTersisa: KandidatGabung[]
  selSejenis: Record<string, boolean>
  setSelSejenis: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  sejenisLoading: boolean
  basis: Record<string, number> | null
  basisErr: string
  basisLoading: boolean
  spek: SpekEdit | null
  setSpek: (s: SpekEdit | null) => void
  spekInit: Record<string, string>
  spekFoto: string[]
  spekOpen: boolean
  setSpekOpen: (v: boolean) => void
  cari: () => Promise<void>
  tambah: (k: KandidatGabung) => void
  tambahSejenisTerpilih: () => void
  hapus: (id: string) => void
  openSpek: () => Promise<void>
  reset: () => void
  totalNP: number
  totalAkum: number
  syaratOk: boolean
}

/**
 * @param tgl     tanggal DOKUMEN — menentukan semester basis (`periode − 1`),
 *                jadi mengubahnya WAJIB memuat ulang basis akumulasinya.
 * @param skpdId  penggabungan selalu DI DALAM satu SKPD.
 * @param onErr   saluran error milik form induk. Dioper masuk (bukan state
 *                sendiri) supaya pesan dari sini muncul di tempat yang sama
 *                dengan pesan alasan lain — satu kotak error per form.
 */
export function usePenggabungan(tgl: string, skpdId: number | null, onErr: (msg: string) => void): Penggabungan {
  const supabase = createClient()

  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<KandidatGabung[]>([])
  const [list, setList] = useState<KandidatGabung[]>([])
  const [indukId, setIndukId] = useState<string | null>(null)

  const [sejenis, setSejenis] = useState<KandidatGabung[]>([])
  const [selSejenis, setSelSejenis] = useState<Record<string, boolean>>({})
  const [sejenisLoading, setSejenisLoading] = useState(false)

  const [basis, setBasis] = useState<Record<string, number> | null>(null)
  const [basisErr, setBasisErr] = useState('')
  const [basisLoading, setBasisLoading] = useState(false)
  const [spek, setSpek] = useState<SpekEdit | null>(null)
  const [spekInit, setSpekInit] = useState<Record<string, string>>({})
  const [spekFoto, setSpekFoto] = useState<string[]>([])
  const [spekOpen, setSpekOpen] = useState(false)

  // ── Basis akumulasi SELURUH anggota pada semester SEBELUM cutover ──────────
  useEffect(() => {
    if (list.length === 0) { setBasis(null); setBasisErr(''); return }
    ;(async () => {
      setBasisLoading(true); setBasisErr(''); setBasis(null)
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
      const ids = list.map(k => k.id)
      // Golongan yang memang tak disusutkan (Tanah/ATL/KDP) tak punya baris
      // engine sama sekali — akumulasinya nol, bukan "belum dihitung".
      if (perlakuanKode(list[0].kode) === 'tidak') {
        setBasis(Object.fromEntries(ids.map(id => [id, 0] as const)))
        setBasisLoading(false); return
      }
      const map: Record<string, number> = {}
      // Per 200 id: `.in()` yang terlalu panjang ditolak PostgREST, dan satu
      // penggabungan bisa memuat puluhan barang (kasus Pagar Besi: 35).
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('penyusutan_semester')
          .select('aset_id,akumulasi').eq('periode', basisPeriode).in('aset_id', ids.slice(i, i + 200))
        if (error) {
          setBasisErr(`Gagal membaca akumulasi penyusutan ${basisPeriode}: ${error.message}`)
          setBasisLoading(false); return
        }
        for (const r of (data || []) as { aset_id: string; akumulasi: number }[]) map[r.aset_id] = Number(r.akumulasi) || 0
      }
      // ⚠️ MEMBLOKIR, bukan jatuh ke 0. Akumulasi yang diam-diam nol menghapus
      // angka itu dari neraca, padahal penggabungan justru peristiwa yang
      // totalnya HARUS tetap.
      const belum = anggotaTanpaBasis(ids, map)
      if (belum.length > 0) {
        setBasisErr(`${belum.length} dari ${ids.length} barang belum punya hasil penyusutan periode ${basisPeriode}. Jalankan Engine untuk periode itu dulu, atau pilih tanggal dokumen di semester berikutnya — kalau diteruskan, akumulasi barang itu hilang dari neraca.`)
        setBasisLoading(false); return
      }
      setBasis(map)
      setBasisLoading(false)
    })()
  }, [list, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  const induk = list.find(k => k.id === indukId) || null
  const totalNP = totalNilaiGabung(list)
  const totalAkum = totalAkumulasiGabung(list, basis)
  const syaratOk = syaratGabungOk(list)
  const sejenisTersisa = sejenis.filter(k => !list.some(x => x.id === k.id))

  // Semua barang aktif se-SKPD yang kode + nilai + tanggal perolehannya SAMA
  // PERSIS dgn barang pertama. `.eq` bertumpuk, bukan pencarian teks: syarat
  // gabung itu kesamaan angka, dan mencocokkannya lewat nama justru yang bikin
  // kasus pagar (nama & satuannya berbeda-beda) tak pernah ketemu.
  async function muatSejenis(k0: KandidatGabung) {
    setSejenisLoading(true)
    let qy = supabase.from('aset').select(KANDIDAT_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .eq('kode', k0.kode).eq('nilai_perolehan', k0.nilai_perolehan)
    qy = k0.tgl_perolehan ? qy.eq('tgl_perolehan', k0.tgl_perolehan) : qy.is('tgl_perolehan', null)
    const { data, error } = await qy.order('nibar', { ascending: true }).limit(500)
    if (error) { onErr(`Gagal memuat barang sejenis: ${error.message}`); setSejenisLoading(false); return }
    setSejenis((data as unknown as KandidatGabung[]) || [])
    setSelSejenis({})
    setSejenisLoading(false)
  }

  async function cari() {
    if (!q.trim()) return
    let qy = supabase.from('aset').select(KANDIDAT_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .or(`nibar.ilike.%${q}%,nama_barang.ilike.%${q}%,kode.ilike.%${q}%`)
    // Begitu anggota pertama ada, hasil carinya ikut disaring ke yang LAYAK
    // gabung — supaya operator tak menemukan barang yang lalu ditolak.
    const k0 = list[0]
    if (k0) {
      qy = qy.eq('kode', k0.kode).eq('nilai_perolehan', k0.nilai_perolehan)
      qy = k0.tgl_perolehan ? qy.eq('tgl_perolehan', k0.tgl_perolehan) : qy.is('tgl_perolehan', null)
    }
    const { data, error } = await qy.limit(20)
    if (error) { onErr(`Gagal mencari barang: ${error.message}`); return }
    setHasil((data as unknown as KandidatGabung[]) || [])
  }

  function tambah(k: KandidatGabung) {
    if (list.some(x => x.id === k.id)) return
    const k0 = list[0]
    // Penjaga lapis kedua: query di atas sudah menyaring, tapi syarat ini yang
    // menentukan benar/salahnya neraca — jangan andalkan filter tampilan saja.
    if (k0 && kunciGabung(k) !== kunciGabung(k0)) {
      onErr('Barang itu beda kode / nilai perolehan / tanggal perolehan — tidak bisa digabung dengan yang sudah dipilih.')
      return
    }
    onErr('')
    setList(prev => [...prev, k])
    setIndukId(prev => prev ?? k.id)
    setHasil([]); setQ('')
    if (!k0) muatSejenis(k)
  }

  function tambahSejenisTerpilih() {
    const pilih = sejenisTersisa.filter(k => selSejenis[k.id])
    if (pilih.length === 0) return
    setList(prev => [...prev, ...pilih.filter(k => !prev.some(x => x.id === k.id))])
    setSelSejenis({})
  }

  function hapus(id: string) {
    setList(prev => {
      const next = prev.filter(k => k.id !== id)
      if (next.length === 0) { setSejenis([]); setSelSejenis({}) }
      return next
    })
    setIndukId(prev => prev === id ? null : prev)
    setSpek(null) // induk/anggota berubah → edit tersusun tak lagi tentu valid
  }

  // Spesifikasi HASIL gabungan = spesifikasi induk yang boleh dikoreksi
  // (mis. satuan "Meter Persegi" → "Unit", nama jadi "Pagar Besi 125 m").
  async function openSpek() {
    const b = induk
    if (!b) return
    const keys = koreksiFieldKeys(b.kode)
    const { data } = await supabase.from('aset').select([...keys, 'foto_paths'].join(',')).eq('id', b.id).single()
    const row = (data || {}) as Record<string, unknown>
    const f: Record<string, string> = {}
    for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
    setSpekInit(f)
    setSpekFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    setSpekOpen(true)
  }

  /** Pindah ke alasan LAIN — buang seluruh jejak penggabungan yang disusun. */
  function reset() {
    setList([]); setIndukId(null); setHasil([]); setQ('')
    setSejenis([]); setSelSejenis({}); setSpek(null); setSpekOpen(false)
  }

  return {
    q, setQ, hasil, list, indukId, setIndukId, induk,
    sejenis, sejenisTersisa, selSejenis, setSelSejenis, sejenisLoading,
    basis, basisErr, basisLoading,
    spek, setSpek, spekInit, spekFoto, spekOpen, setSpekOpen,
    cari, tambah, tambahSejenisTerpilih, hapus, openSpek, reset,
    totalNP, totalAkum, syaratOk,
  }
}
