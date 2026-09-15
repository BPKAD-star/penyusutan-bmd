'use client'
// ============================================================================
// Pemuat daftar kartu jurnal menu Koreksi — REFACTOR-PLAN Fase 3 langkah 5.
//
// Diangkat dari `KoreksiTransaksi`, komponen paling padat state yang tersisa
// di repo ini sesudah `KoreksiForm` dituntaskan (582 baris / 18 `useState`).
// Yang dipindah di sini kelompok TERBESAR & paling berdiri sendiri: pemuat
// ketiga bentuk kartu, satu `useCallback` sepanjang ±105 baris.
//
// Tiga bentuk kartu, satu tabel `jurnal_header` (kategori `koreksi`),
// dipisah lewat kolom `jenis`:
//   · koreksi biasa  — nilai / spesifikasi / pencatatan ganda
//   · pemecahan      — 1 induk → N pecahan
//   · penggabungan   — N sumber → 1 induk
//
// ✅ Fase 1 (2026-09-15): kelima query di sini tak lagi menelan `error`.
// Sebelumnya kegagalan apa pun menghasilkan daftar kartu KOSONG, yang di layar
// tak bisa dibedakan dari "SKPD ini memang belum punya koreksi" — kelas INS-06,
// dan di menu ini konsekuensinya bukan cuma tampilan: operator yang melihat
// "0 koreksi" bisa menyimpulkan jurnalnya belum dibuat lalu membuatnya lagi.
//
// ⚠️ FAIL-CLOSED: begitu satu query gagal, KETIGA daftar dikosongkan & `err`
// diisi. Menampilkan sebagian kartu jauh lebih berbahaya daripada tak
// menampilkan apa pun — daftar yang kurang-sebagian terlihat sah.
//
// ⚠️ Baris yang DIBATALKAN diperlakukan BERBEDA per bentuk, dan itu disengaja:
//   · koreksi biasa → baris yang dianulir DISEMBUNYIKAN dari kartu
//     (`batal_koreksi_*` membawa `payload.target_trx_id`, jadi bisa dicocokkan
//     per baris)
//   · pemecahan & penggabungan → kartunya TETAP tampil, ber-badge
//     "dibatalkan". Peristiwanya memang pernah terjadi; yang berubah cuma
//     akibatnya, dan menghilangkan kartunya menghapus jejak itu.
// ============================================================================
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  HEADER_COLS,
  type Header, type Jurnal, type LinePayload,
  type PemecahanHeader, type PemecahanRow, type PemecahanJurnal,
  type PenggabunganHeader, type PenggabunganRow, type PenggabunganJurnal,
} from './tipe'

export type JurnalKoreksi = {
  /** Kosong = benar-benar tak ada. Kegagalan query → `err`, bukan daftar kosong. */
  err: string
  jurnals: Jurnal[]
  pemecahanJurnals: PemecahanJurnal[]
  penggabunganJurnals: PenggabunganJurnal[]
  loading: boolean
  load: (skpdId: string) => Promise<void>
}

export function useJurnalKoreksi(): JurnalKoreksi {
  const supabase = createClient()
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [pemecahanJurnals, setPemecahanJurnals] = useState<PemecahanJurnal[]>([])
  const [penggabunganJurnals, setPenggabunganJurnals] = useState<PenggabunganJurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); setPemecahanJurnals([]); setPenggabunganJurnals([]); setErr(''); return }
    setLoadingJurnal(true); setErr('')
    try {
    const { data: headers, error: hErr } = await supabase.from('jurnal_header')
      .select(HEADER_COLS).eq('kategori', 'koreksi').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    if (hErr) throw new Error(`gagal memuat kartu koreksi: ${hErr.message}`)
    const allHeaders = (headers || []) as unknown as (Header & { jenis: string })[]
    const hs = allHeaders.filter(h => h.jenis !== 'pemecahan' && h.jenis !== 'penggabungan') as unknown as Header[]
    const pemHeaders = allHeaders.filter(h => h.jenis === 'pemecahan') as unknown as PemecahanHeader[]
    const gabHeaders = allHeaders.filter(h => h.jenis === 'penggabungan') as unknown as PenggabunganHeader[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    const headerIds = hs.map(h => h.id)
    if (headerIds.length > 0) {
      // Baris batal_koreksi_* → kumpulkan target_trx_id yg sudah dibatalkan (utk
      // disembunyikan dari kartu, pola sama dgn Reklasifikasi).
      const { data: batalRows, error: bErr } = await supabase.from('transaksi_bmd')
        .select('payload')
        .in('jenis', ['batal_koreksi_nilai', 'batal_koreksi_spesifikasi', 'batal_koreksi_pencatatan_ganda'] as never)
        .in('header_id', headerIds)
      // ⚠️ MELEMPAR, bukan dilewati: set pembatalan yang gagal dimuat berarti
      // baris yang SUDAH dianulir tampil lagi sebagai koreksi yang berlaku —
      // kebalikan dari kenyataan, dan itu persis INS-06 di lib/voidedAset.ts.
      if (bErr) throw new Error(`gagal membaca transaksi pembatalan: ${bErr.message}`)
      const dibatalkan = new Set<number>()
      for (const b of (batalRows || []) as { payload: { target_trx_id?: number } | null }[]) {
        const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) dibatalkan.add(t)
      }

      const { data, error } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode)')
        .in('jenis', ['koreksi_nilai', 'koreksi_pencatatan_ganda', 'koreksi_spesifikasi'] as never)
        .in('header_id', headerIds)
        .order('id', { ascending: true })
      if (error) throw new Error(`gagal memuat baris koreksi: ${error.message}`)
      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; payload: LinePayload | null
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string } | null
      }[]
      for (const r of rows) {
        if (!r.aset || dibatalkan.has(r.id)) continue // baris yg dibatalkan → sembunyikan
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({ trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang, nilai: r.nilai, payload: r.payload })
        j.total += r.nilai
      }
    }
    // Jurnal yg SEMUA barisnya dibatalkan → lines kosong → otomatis tersembunyi.
    setJurnals([...jmap.values()].filter(j => j.lines.length > 0))

    // ── Jurnal Pemecahan: induk (pemecahan_keluar) + pecahan (pemecahan_masuk) ──
    const pmap = new Map<string, PemecahanJurnal>()
    for (const h of pemHeaders) pmap.set(h.id, { ...h, induk: null, pecahan: [], total: 0, dibatalkan: false })
    const pemIds = pemHeaders.map(h => h.id)
    if (pemIds.length > 0) {
      const { data, error } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,aset:aset_id(id,nibar,nama_barang,kode,jumlah)')
        .in('jenis', ['pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan'] as never)
        .in('header_id', pemIds)
        .order('id', { ascending: true })
      if (error) throw new Error(`gagal memuat baris pemecahan: ${error.message}`)
      const rows = (data || []) as unknown as {
        id: number; header_id: string; jenis: string; nilai: number
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string; jumlah: number } | null
      }[]
      for (const r of rows) {
        const j = pmap.get(r.header_id)
        if (!j) continue
        if (r.jenis === 'batal_pemecahan') { j.dibatalkan = true; continue }
        if (!r.aset) continue
        const row: PemecahanRow = { trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang, jumlah: r.aset.jumlah, nilai: r.nilai }
        if (r.jenis === 'pemecahan_keluar') j.induk = row
        else { j.pecahan.push(row); j.total += r.nilai }
      }
    }
    setPemecahanJurnals([...pmap.values()].filter(j => j.induk || j.pecahan.length > 0))

    // ── Jurnal Penggabungan: induk (penggabungan_masuk) + sumber (penggabungan_keluar) ──
    // Baris batal ikut ditarik supaya kartu yang sudah dibatalkan tampil
    // ber-badge, BUKAN hilang — sama pola dgn kartu Pemecahan. Peristiwanya
    // memang pernah terjadi; yang berubah cuma akibatnya.
    const gmap = new Map<string, PenggabunganJurnal>()
    for (const h of gabHeaders) gmap.set(h.id, { ...h, induk: null, sumber: [], dibatalkan: false })
    const gabIds = gabHeaders.map(h => h.id)
    if (gabIds.length > 0) {
      const { data, error } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode)')
        .in('jenis', ['penggabungan_keluar', 'penggabungan_masuk', 'batal_penggabungan', 'batal_penggabungan_masuk'] as never)
        .in('header_id', gabIds)
        .order('id', { ascending: true })
      if (error) throw new Error(`gagal memuat baris penggabungan: ${error.message}`)
      const rows = (data || []) as unknown as {
        id: number; header_id: string; jenis: string; nilai: number
        payload: { nilai_lama?: number; nilai_perolehan_baru?: number } | null
        aset: { id: string; nibar: string | null; nama_barang: string | null; kode: string } | null
      }[]
      for (const r of rows) {
        const j = gmap.get(r.header_id)
        if (!j) continue
        if (r.jenis === 'batal_penggabungan' || r.jenis === 'batal_penggabungan_masuk') { j.dibatalkan = true; continue }
        if (!r.aset) continue
        const row: PenggabunganRow = { trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang, nilai: r.nilai }
        if (r.jenis === 'penggabungan_masuk') {
          j.induk = { ...row, nilaiLama: Number(r.payload?.nilai_lama ?? 0), nilaiBaru: Number(r.payload?.nilai_perolehan_baru ?? 0) }
        } else j.sumber.push(row)
      }
    }
    setPenggabunganJurnals([...gmap.values()].filter(j => j.induk || j.sumber.length > 0))
    } catch (e) {
      // FAIL-CLOSED: kosongkan KETIGANYA. Daftar yang terisi sebagian
      // terlihat sah, dan itu yang paling mahal di menu ini.
      setJurnals([]); setPemecahanJurnals([]); setPenggabunganJurnals([])
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingJurnal(false)   // di `finally`, bukan jalur sukses (INS-10)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { err, jurnals, pemecahanJurnals, penggabunganJurnals, loading: loadingJurnal, load }
}
