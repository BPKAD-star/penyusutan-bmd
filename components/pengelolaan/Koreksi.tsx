'use client'
// No.9: Koreksi — 2 mode terpisah:
//   - "Koreksi Transaksi" (alur ber-SK, sama pola dgn Reklasifikasi/
//     Penghapusan): pilih SKPD → tambah jurnal (No Dokumen Koreksi + tanggal
//     + keterangan) → pilih ALASAN (Nilai Perolehan / Kuantitas Bertambah —
//     DEFERRED / Pencatatan Ganda) → pilih barang.
//   - "Koreksi Spesifikasi" (alur lama, standalone single-item): DI LUAR
//     "3 sebab" yang diminta user, sengaja TIDAK ikut pola ber-SK.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, perlakuanKode, parsePeriode, previousPeriode, formatPeriode, fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'
import { ASET_FIELD_COLS, ASET_NUM_COLS, fieldsForKode, koreksiFieldKeys, allSameGolongan, FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import SkpdCombobox from '@/components/SkpdCombobox'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import { useDateBounds, useTahunBukuMap } from '@/components/useTahunBuku'
import FormShell from './FormShell'
import { backdropClose } from '@/components/backdropClose'

// Field alasan "Spesifikasi Barang" (golongan-aware, + atribut satuan/asal usul/
// tahun/kondisi) kini tinggal di lib/asetFields.ts sbg `koreksiFieldKeys` —
// dipakai bareng Saldo Awal → Daftar Barang Awal supaya kedua pintu koreksi
// spesifikasi menawarkan field yang persis sama.

// ── Koreksi — satu alur ber-SK, 4 alasan ─────────────────────────────────────
type Alasan = 'nilai_perolehan' | 'pencatatan_ganda' | 'spesifikasi' | 'pemecahan' | 'penggabungan'
const ALASAN_OPT: { value: Alasan; label: string; deskripsi: string; disabled?: boolean }[] = [
  { value: 'nilai_perolehan', label: 'Nilai Perolehan', deskripsi: 'Koreksi nilai perolehan barang — beban penyusutan disebar ulang ke sisa umur oleh engine.' },
  // ⚠️ Kalimat pembeda di dua deskripsi ini BUKAN hiasan. Memakai Pencatatan
  // Ganda untuk barang yang TERPECAH (mis. pagar 35 baris) akan MENGHAPUS
  // Rp24,5 juta dari neraca tanpa satu pun pesan error — duplikat dibuang,
  // sedangkan barang terpecah nilainya harus DIJUMLAHKAN.
  { value: 'pencatatan_ganda', label: 'Pencatatan Ganda (Gabung Duplikat)', deskripsi: 'Barang yang KECATAT DUA KALI — duplikatnya dibuang, total nilai TURUN. Kode barang harus identik. Untuk satu barang yang terlanjur tercatat jadi banyak baris, pakai Penggabungan Barang.' },
  { value: 'spesifikasi', label: 'Spesifikasi Barang', deskripsi: 'Koreksi field spesifikasi (nama, dokumen, kondisi, dll) satu barang — tanpa efek nilai/penyusutan.' },
  { value: 'pemecahan', label: 'Pemecahan Barang', deskripsi: '1 barang induk dipecah jadi beberapa barang baru — nilai perolehan & penyusutan dialokasi proporsional (total pecahan = nilai induk).' },
  { value: 'penggabungan', label: 'Penggabungan Barang', deskripsi: 'SATU barang yang terlanjur tercatat jadi beberapa baris (mis. pagar 125 m jadi 125 baris karena satuannya bukan "unit") dilebur jadi satu — nilai & akumulasi DIJUMLAHKAN ke barang induk, total nilai TIDAK berubah.' },
]
const ALASAN_LABEL = Object.fromEntries(ALASAN_OPT.map(a => [a.value, a.label])) as Record<Alasan, string>
const tahunDari = (tgl: string | null) => tgl ? tgl.slice(0, 4) : '-'

type Barang = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  merek_tipe: string | null; jumlah: number; satuan: string | null; nilai_perolehan: number; skpd_id: number | null
  tgl_perolehan: string | null; cara_perolehan: string | null; foto_paths: string[] | null
  intra_ekstra: string | null
}
// Edit spesifikasi yang disusun di popup, menunggu di-commit oleh Simpan.
type SpekEdit = { fields: Record<string, string>; foto: { replace?: string[]; append?: string[] } }
// ── Pemecahan: baris pecahan (jumlah + nilai + spesifikasi per barang) ───────
type BasisPecah = { nilai_buku: number; akumulasi: number; sisa_smt: number; masa_tahun: number | null; disusutkan: boolean }
type PecahanItem = { key: string; jumlah: string; nilai: string; fields: Record<string, string>; foto: string[] }
const newKey = () => Math.random().toString(36).slice(2)
// Tanah: dokumen kepemilikan/sertifikat & jenis hak per-BIDANG → diisi di GIS BMD
// (Kelola Bidang) setelah pemecahan, BUKAN di form ini (satu sumber). Field ini
// disembunyikan dari modal spesifikasi pecahan tanah & tidak diwarisi dari induk.
const TANAH_DOK_FIELDS: FieldKey[] = ['jenis_hak', 'nomor_dokumen_kepemilikan', 'nama_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan']
function pieceFieldKeys(kode: string): FieldKey[] {
  const base = fieldsForKode(kode)
  return kodeLevel3(kode) === '1.3.1' ? base.filter(k => !TANAH_DOK_FIELDS.includes(k)) : base
}
type Kandidat = {
  id: string; nibar: string | null; kode: string; nama_barang: string | null
  spesifikasi_lainnya: string | null; nilai_perolehan: number; tgl_perolehan: string | null
}
// ── Penggabungan: kandidat + basis akumulasi per barang ─────────────────────
// `satuan` ikut karena justru DI SITU jejak masalahnya kelihatan (satu pagar
// tersebar di satuan "Meter Persegi"/"Buah"/"Set"); operator perlu melihatnya
// waktu memilih. Ia TIDAK ikut jadi syarat gabung — keputusan user 2026-08-11:
// syaratnya cuma nilai perolehan + tanggal perolehan + KODE BARANG.
type KandidatGabung = Kandidat & { satuan: string | null; merek_tipe: string | null }
// Kunci kelayakan gabung. Dipakai sebagai perbandingan string tunggal supaya
// tak ada satu pun tempat yang membandingkan dua dari tiga syaratnya saja.
const kunciGabung = (k: { kode: string; nilai_perolehan: number; tgl_perolehan: string | null }) =>
  `${k.kode}|${Math.round(k.nilai_perolehan)}|${k.tgl_perolehan || '-'}`
// prev = nilai field SEBELUM koreksi_spesifikasi (utk restore saat batal).
type LinePayload = { nilai_lama?: number; nilai_perolehan_baru?: number; survivor_nibar?: string; prev?: Record<string, unknown> } & Record<string, unknown>
type Header = {
  id: string; no_sk: string; tanggal: string; periode: string; jenis: Alasan
  keterangan: string | null; kategori: 'koreksi'
}
type JurnalLine = {
  trx_id: number         // id baris ledger koreksi — dipakai target_trx_id saat batal
  aset_id: string; nibar: string | null; kode: string; nama_barang: string | null
  nilai: number; payload: LinePayload | null
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

// ── Pemecahan Barang (alasan ke-4 di Tambah Jurnal: 1 induk → N pecahan) ────
type PemecahanHeader = { id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null }
type PemecahanRow = { trx_id: number; aset_id: string; nibar: string | null; kode: string; nama_barang: string | null; jumlah: number; nilai: number }
type PemecahanJurnal = PemecahanHeader & { induk: PemecahanRow | null; pecahan: PemecahanRow[]; total: number; dibatalkan: boolean }

// ── Penggabungan Barang (alasan ke-5: N baris → 1 induk) ────────────────────
// Cermin dari Pemecahan, dengan satu beda mendasar: hasil gabungan ADALAH
// induknya sendiri (aset & NIBAR yang sudah ada), jadi tak ada aset baru dan
// `penggabungan_masuk` TIDAK didaftarkan di `LAHIR` (lib/visibilitas.ts).
type PenggabunganHeader = { id: string; no_sk: string; tanggal: string; periode: string; keterangan: string | null }
type PenggabunganRow = { trx_id: number; aset_id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai: number }
type PenggabunganJurnal = PenggabunganHeader & {
  induk: (PenggabunganRow & { nilaiLama: number; nilaiBaru: number }) | null
  sumber: PenggabunganRow[]; dibatalkan: boolean
}

const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,keterangan,kategori'

function ringkasanBaris(l: JurnalLine, jenis: Alasan): string {
  const p = l.payload || {}
  if (jenis === 'spesifikasi') {
    const labels = Object.keys(p).filter(k => k !== 'foto_paths' && k !== 'prev').map(k => FIELD_LABEL[k as FieldKey] || k)
    if ('foto_paths' in p) labels.push('Foto')
    return labels.length ? `Spesifikasi diubah: ${labels.join(', ')}` : '-'
  }
  if (p.nilai_perolehan_baru != null) return `${formatRupiah(p.nilai_lama || 0)} → ${formatRupiah(p.nilai_perolehan_baru)}`
  if (p.survivor_nibar) return `Digabung ke NIBAR ${p.survivor_nibar}`
  return '-'
}

export default function Koreksi() {
  return (
    <FormShell judul="Koreksi" msg=""
      deskripsi="Koreksi lewat jurnal ber-SK: nilai perolehan, spesifikasi barang, atau pencatatan ganda.">
      <KoreksiTransaksi />
    </FormShell>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Koreksi — alur ber-SK, satu-satunya alur (4 alasan)
// ════════════════════════════════════════════════════════════════════════
function KoreksiTransaksi() {
  const supabase = createClient()
  const tahunMap = useTahunBukuMap()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [pemecahanJurnals, setPemecahanJurnals] = useState<PemecahanJurnal[]>([])
  const [penggabunganJurnals, setPenggabunganJurnals] = useState<PenggabunganJurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<Header | null>(null)
  const [batalId, setBatalId] = useState<string | null>(null)
  // Batal koreksi — pilih baris (per trx_id), lalu batalkan.
  const [selBatal, setSelBatal] = useState<Record<number, boolean>>({})
  const [batalling, setBatalling] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
    ;(async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd')
          .select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadJurnals = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); setPemecahanJurnals([]); setPenggabunganJurnals([]); return }
    setLoadingJurnal(true)
    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS).eq('kategori', 'koreksi').eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
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
      const { data: batalRows } = await supabase.from('transaksi_bmd')
        .select('payload')
        .in('jenis', ['batal_koreksi_nilai', 'batal_koreksi_spesifikasi', 'batal_koreksi_pencatatan_ganda'] as never)
        .in('header_id', headerIds)
      const dibatalkan = new Set<number>()
      for (const b of (batalRows || []) as { payload: { target_trx_id?: number } | null }[]) {
        const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) dibatalkan.add(t)
      }

      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode)')
        .in('jenis', ['koreksi_nilai', 'koreksi_pencatatan_ganda', 'koreksi_spesifikasi'] as never)
        .in('header_id', headerIds)
        .order('id', { ascending: true })
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
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,aset:aset_id(id,nibar,nama_barang,kode,jumlah)')
        .in('jenis', ['pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan'] as never)
        .in('header_id', pemIds)
        .order('id', { ascending: true })
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
      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,jenis,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode)')
        .in('jenis', ['penggabungan_keluar', 'penggabungan_masuk', 'batal_penggabungan', 'batal_penggabungan_masuk'] as never)
        .in('header_id', gabIds)
        .order('id', { ascending: true })
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
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null); setSelBatal({}) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  // Batal Koreksi (Nilai / Spesifikasi / Pencatatan Ganda) — transaksi pembalik
  // append-only, dicatat HARI INI. Guard: barang tak boleh punya transaksi LEBIH
  // BARU setelah koreksi ini (delta nilai berantai → cuma yg terakhir yg sah
  // dibatalkan). Engine WAJIB di-run ulang setelah ini.
  async function batalKoreksi(j: Jurnal, lines: JurnalLine[]) {
    if (lines.length === 0) { setMsg('Centang minimal satu baris untuk dibatalkan.'); return }
    const label = ALASAN_LABEL[j.jenis]
    if (!confirm(`Batalkan koreksi (${label}) ${lines.length} barang? Barang kembali ke keadaan sebelum koreksi. Jalankan Engine lagi setelah ini.`)) return
    setBatalling(true); setMsg('')
    // Guard rantai: tolak kalau ada transaksi lebih baru pada aset itu.
    for (const l of lines) {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', l.aset_id).gt('id', l.trx_id)
      if ((count || 0) > 0) {
        setMsg(`Batal diblokir: "${l.nama_barang || l.nibar}" punya transaksi LEBIH BARU setelah koreksi ini — batalkan yang lebih baru dulu.`)
        setBatalling(false); return
      }
    }
    const today = new Date().toISOString().slice(0, 10)
    for (const l of lines) {
      let jenis: string
      const payload: Record<string, unknown> = { target_trx_id: l.trx_id }
      if (j.jenis === 'nilai_perolehan') {
        jenis = 'batal_koreksi_nilai'
        payload.nilai_perolehan_baru = l.payload?.nilai_lama ?? null // kembalikan nilai_perolehan ke nilai_lama
      } else if (j.jenis === 'spesifikasi') {
        jenis = 'batal_koreksi_spesifikasi'
        payload.prev = l.payload?.prev ?? {} // kembalikan field ke nilai sebelum koreksi
      } else {
        jenis = 'batal_koreksi_pencatatan_ganda' // barang duplikat aktif & muncul lagi
      }
      const { error } = await catatTransaksi(supabase, {
        asetId: l.aset_id, jenis, tanggal: today, headerId: j.id, payload,
        keterangan: `Batal koreksi (${label})`,
      })
      if (error) { setMsg(`Error: ${error} — sebagian mungkin sudah dibatalkan, muat ulang.`); setBatalling(false); loadJurnals(skpd); return }
    }
    setBatalling(false); setSelBatal({})
    setMsg(`${lines.length} koreksi (${label}) dibatalkan. Jalankan Engine lagi untuk memperbarui penyusutan.`)
    loadJurnals(skpd)
  }

  // Batal Pemecahan: induk aktif lagi (batal_pemecahan) + pecahan dibuang
  // (batal_pemecahan_masuk). Dicatat mundur ke tanggal pemecahan asli supaya
  // period-correct. Hanya boleh selama tahun pemecahan masih TERBUKA (guard DB
  // juga menolak kalau terkunci — ini fail-fast di UI).
  async function handleBatalPemecahan(j: PemecahanJurnal) {
    const tahun = parsePeriode(j.periode).tahun
    if (tahunMap[tahun] !== 'terbuka') {
      setMsg(`Error: Tahun ${tahun} sudah terkunci — pemecahan tidak bisa dibatalkan. Koreksi lewat pemecahan/gabung baru di periode berjalan.`)
      return
    }
    if (!confirm(`Batalkan pemecahan No. ${j.no_sk}? Induk akan aktif kembali dan ${j.pecahan.length} pecahan dibuang.`)) return
    // Guard rantai: induk & tiap pecahan tak boleh punya transaksi LEBIH BARU
    // setelah pemecahan ini (mis. koreksi/reklas di atas pecahan) — batalkan yang
    // lebih baru dulu, kalau tidak replay engine rusak.
    for (const r of [...(j.induk ? [j.induk] : []), ...j.pecahan]) {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', r.aset_id).gt('id', r.trx_id)
      if ((count || 0) > 0) {
        setMsg(`Error: "${r.nama_barang || r.nibar}" punya transaksi LEBIH BARU setelah pemecahan ini — batalkan yang lebih baru dulu.`)
        return
      }
    }
    setBatalId(j.id)
    setMsg('')
    if (j.induk) {
      const { error } = await catatTransaksi(supabase, {
        asetId: j.induk.aset_id, jenis: 'batal_pemecahan', tanggal: j.tanggal, nilai: j.induk.nilai, headerId: j.id,
        payload: { induk_nibar: j.induk.nibar }, keterangan: `Pembatalan pemecahan ${j.no_sk}`,
      })
      if (error) { setMsg(`Error: ${error}`); setBatalId(null); return }
    }
    for (const p of j.pecahan) {
      const { error } = await catatTransaksi(supabase, {
        asetId: p.aset_id, jenis: 'batal_pemecahan_masuk', tanggal: j.tanggal, nilai: p.nilai, headerId: j.id,
        payload: { induk_nibar: j.induk?.nibar || null }, keterangan: `Pembatalan pemecahan ${j.no_sk}`,
      })
      if (error) { setMsg(`Sebagian batal gagal: ${error} — ulangi untuk menuntaskan.`); setBatalId(null); loadJurnals(skpd); return }
    }
    setBatalId(null)
    setMsg(`Pemecahan ${j.no_sk} dibatalkan — induk kembali aktif. Jalankan engine untuk memperbarui penyusutan.`)
    loadJurnals(skpd)
  }

  // Batal Penggabungan: induk kembali ke nilai & akumulasi sebelum digabung
  // (batal_penggabungan_masuk, membawa target_trx_id supaya engine mengabaikan
  // re-basisnya) + tiap barang sumber muncul & disusutkan lagi
  // (batal_penggabungan). Dicatat MUNDUR ke tanggal dokumen aslinya supaya
  // period-correct — karena itu tahunnya wajib masih terbuka.
  //
  // ⚠️ URUTAN TULISNYA DISENGAJA: induk DULU, sumber belakangan. Kalau prosesnya
  // putus di tengah, yang tersisa adalah keadaan KURANG-catat (induk sudah
  // mengecil, sebagian sumber belum kembali) — bukan DOBEL-catat (sumber sudah
  // kembali sementara induk masih memegang nilai gabungan). Mengulangi tombol
  // yang sama menuntaskan sisanya.
  async function handleBatalPenggabungan(j: PenggabunganJurnal) {
    const tahun = parsePeriode(j.periode).tahun
    if (tahunMap[tahun] !== 'terbuka') {
      setMsg(`Error: Tahun ${tahun} sudah terkunci — penggabungan tidak bisa dibatalkan. Koreksi lewat jurnal baru di periode berjalan.`)
      return
    }
    if (!confirm(`Batalkan penggabungan No. ${j.no_sk}? ${j.sumber.length} barang akan muncul kembali dan induk balik ke nilai semula.`)) return
    // Guard rantai baku (rules.md §1.3): induk & tiap sumber tak boleh punya
    // transaksi LEBIH BARU setelah penggabungan ini.
    for (const r of [...(j.induk ? [j.induk] : []), ...j.sumber]) {
      const { count } = await supabase.from('transaksi_bmd')
        .select('id', { count: 'exact', head: true }).eq('aset_id', r.aset_id).gt('id', r.trx_id)
      if ((count || 0) > 0) {
        setMsg(`Error: "${r.nama_barang || r.nibar}" punya transaksi LEBIH BARU setelah penggabungan ini — batalkan yang lebih baru dulu.`)
        return
      }
    }
    setBatalId(j.id)
    setMsg('')
    if (j.induk) {
      const { error } = await catatTransaksi(supabase, {
        asetId: j.induk.aset_id, jenis: 'batal_penggabungan_masuk', tanggal: j.tanggal,
        nilai: j.induk.nilai, headerId: j.id,
        // `nilai_perolehan_baru` = nilai LAMA induk: itu yang dipulihkan ke
        // register (lib/transaksi.ts), pola batal_koreksi_nilai.
        payload: { target_trx_id: j.induk.trx_id, nilai_perolehan_baru: j.induk.nilaiLama },
        keterangan: `Pembatalan penggabungan ${j.no_sk}`,
      })
      if (error) { setMsg(`Error: ${error}`); setBatalId(null); return }
    }
    for (const s of j.sumber) {
      const { error } = await catatTransaksi(supabase, {
        asetId: s.aset_id, jenis: 'batal_penggabungan', tanggal: j.tanggal, nilai: s.nilai, headerId: j.id,
        payload: { target_trx_id: s.trx_id, induk_nibar: j.induk?.nibar || null },
        keterangan: `Pembatalan penggabungan ${j.no_sk}`,
      })
      if (error) { setMsg(`Sebagian batal gagal: ${error} — ulangi untuk menuntaskan.`); setBatalId(null); loadJurnals(skpd); return }
    }
    setBatalId(null)
    setMsg(`Penggabungan ${j.no_sk} dibatalkan — ${j.sumber.length} barang kembali. Jalankan engine untuk memperbarui penyusutan.`)
    loadJurnals(skpd)
  }

  return (
    <>
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat &amp; membuat jurnal koreksi.</div>
      ) : mode === 'tambah' ? (
        <KoreksiForm skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={n => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang dikoreksi.`); loadJurnals(skpd) }} />
      ) : addTo ? (
        <KoreksiForm skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={n => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} koreksi · {pemecahanJurnals.length} pemecahan · {penggabunganJurnals.length} penggabungan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>
          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : (jurnals.length === 0 && pemecahanJurnals.length === 0 && penggabunganJurnals.length === 0) ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada koreksi transaksi untuk SKPD ini.</div>
          ) : (<>
            {pemecahanJurnals.map(j => (
              <PemecahanCard key={j.id} j={j} busy={batalId === j.id}
                bisaBatal={tahunMap[parsePeriode(j.periode).tahun] === 'terbuka'}
                onBatal={() => handleBatalPemecahan(j)} />
            ))}
            {penggabunganJurnals.map(j => (
              <PenggabunganCard key={j.id} j={j} busy={batalId === j.id}
                bisaBatal={tahunMap[parsePeriode(j.periode).tahun] === 'terbuka'}
                onBatal={() => handleBatalPenggabungan(j)} />
            ))}
            {jurnals.map(j => {
            const selLines = j.lines.filter(l => selBatal[l.trx_id])
            const allSel = j.lines.length > 0 && j.lines.every(l => selBatal[l.trx_id])
            const toggleAllJ = () => setSelBatal(prev => {
              const next = { ...prev }
              if (allSel) { for (const l of j.lines) delete next[l.trx_id]; return next }
              for (const l of j.lines) next[l.trx_id] = true
              return next
            })
            return (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">No. Dokumen Koreksi: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">{ALASAN_LABEL[j.jenis]} · Tgl. {j.tanggal} · {j.periode}</p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Nilai</p>
                      <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
                    </div>
                    {selLines.length > 0 && (
                      <button title="Batalkan koreksi baris terpilih (kembali ke keadaan semula)"
                        onClick={() => batalKoreksi(j, selLines)} disabled={batalling}
                        className="inline-flex items-center justify-center px-3 h-8 rounded text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40">
                        {batalling ? '...' : `Batal (${selLines.length})`}
                      </button>
                    )}
                    <button title="Edit No dokumen / tanggal (dalam semester yang sama)"
                      onClick={() => { setMsg(''); setEditing(j) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    <button title="Tambah barang ke jurnal ini"
                      onClick={() => { setMsg(''); setAddTo(j) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal hover:opacity-90 text-white">+</button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th w-10 text-center">
                        <input type="checkbox" checked={allSel} onChange={toggleAllJ} title="Pilih semua utk dibatalkan" />
                      </th>
                      <th className="table-th">Kode Register / Nama Barang</th>
                      <th className="table-th">Perubahan</th>
                      <th className="table-th text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.map(l => (
                      <tr key={l.aset_id} className={selBatal[l.trx_id] ? 'bg-red-50/50' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!selBatal[l.trx_id]}
                            onChange={() => setSelBatal(prev => { const n = { ...prev }; if (n[l.trx_id]) delete n[l.trx_id]; else n[l.trx_id] = true; return n })} />
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{l.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'} · {l.kode}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{ringkasanBaris(l, j.jenis)}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(l.nilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )})}
          </>)}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header jurnal diperbarui.'); loadJurnals(skpd) }} />
      )}
    </>
  )
}

// ── Modal edit header: No dokumen + tanggal (kunci semester sama) + keterangan ──
function EditHeaderModal({ header, onClose, onSaved }: { header: Header; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function simpan() {
    if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & entry ulang.`)
      return
    }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('jurnal_header')
      .update({ no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null }).eq('id', header.id)
    if (error) { setErr(`Gagal menyimpan: ${error.message}`); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit Header Jurnal</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen Koreksi</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau batalkan &amp; entry ulang.</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving || pindahSemester}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: (opsional header baru) + alasan + pilih barang ────────────────
function KoreksiForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [alasan, setAlasan] = useState<Alasan>(header?.jenis || 'nilai_perolehan')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // ── Nilai Perolehan: barang + nilai baru per-baris ──
  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selNilai, setSelNilai] = useState<Record<string, { barang: Barang; nilaiBaru: string }>>({})
  // Uraian (nama baku per kode) — dipakai tabel pilih barang di tab Spesifikasi
  // (kolom Kode Barang, sama pola dgn Daftar Barang).
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})

  // ── Pencatatan Ganda: cari & tambah kandidat ──
  const [qGanda, setQGanda] = useState('')
  const [hasilGanda, setHasilGanda] = useState<Kandidat[]>([])
  const [kandidat, setKandidat] = useState<Kandidat[]>([])
  const [survivorId, setSurvivorId] = useState<string | null>(null)

  // ── Spesifikasi: pilih barang (golongan → list → centang) + edit lewat popup ──
  const [selSpek, setSelSpek] = useState<Record<string, Barang>>({})
  const [spekModalOpen, setSpekModalOpen] = useState(false)
  const [spekInitFields, setSpekInitFields] = useState<Record<string, string>>({})
  const [spekInitFoto, setSpekInitFoto] = useState<string[]>([])
  const [spekPrefix, setSpekPrefix] = useState('')
  const [spekEdit, setSpekEdit] = useState<SpekEdit | null>(null)

  // ── Penggabungan: N barang → 1 induk (kebalikan pemecahan) ──
  const [qGabung, setQGabung] = useState('')
  const [hasilGabung, setHasilGabung] = useState<KandidatGabung[]>([])
  const [gabungList, setGabungList] = useState<KandidatGabung[]>([])
  const [indukGabungId, setIndukGabungId] = useState<string | null>(null)
  // Daftar barang SEJENIS (kode + nilai + tgl perolehan sama persis) — dimuat
  // sekali begitu barang pertama dipilih. Tanpa ini fitur ini tak terpakai:
  // kasus yang melahirkannya punya 35 baris, dan mencarinya satu per satu lewat
  // kotak cari bukan pekerjaan yang masuk akal.
  const [sejenis, setSejenis] = useState<KandidatGabung[]>([])
  const [selSejenis, setSelSejenis] = useState<Record<string, boolean>>({})
  const [sejenisLoading, setSejenisLoading] = useState(false)
  // aset_id → akumulasi penyusutan pada semester SEBELUM cutover. Basis ini yang
  // dijumlah jadi `akumulasi_baru`; tanpanya akumulasi barang yang dilebur
  // lenyap & nilai bukunya melonjak.
  const [basisGabung, setBasisGabung] = useState<Record<string, number> | null>(null)
  const [basisGabungErr, setBasisGabungErr] = useState('')
  const [basisGabungLoading, setBasisGabungLoading] = useState(false)
  const [gabungSpek, setGabungSpek] = useState<SpekEdit | null>(null)
  const [gabungSpekInit, setGabungSpekInit] = useState<Record<string, string>>({})
  const [gabungSpekFoto, setGabungSpekFoto] = useState<string[]>([])
  const [gabungSpekOpen, setGabungSpekOpen] = useState(false)

  // ── Pemecahan: 1 induk → N pecahan (jumlah + nilai + spesifikasi per barang) ──
  const [indukPecah, setIndukPecah] = useState<Barang | null>(null)
  const [basisPecah, setBasisPecah] = useState<BasisPecah | null>(null)
  const [basisPecahErr, setBasisPecahErr] = useState('')
  const [basisPecahLoading, setBasisPecahLoading] = useState(false)
  const [indukFields, setIndukFields] = useState<Record<string, string>>({})
  const [pecahan, setPecahan] = useState<PecahanItem[]>([])
  const [editPecahIdx, setEditPecahIdx] = useState<number | null>(null)

  // Basis alokasi induk = state engine di semester SEBELUM cutover (dari tgl dok).
  useEffect(() => {
    if (!indukPecah) { setBasisPecah(null); setBasisPecahErr(''); return }
    ;(async () => {
      setBasisPecahLoading(true); setBasisPecahErr(''); setBasisPecah(null)
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
      const { data } = await supabase.from('penyusutan_semester')
        .select('nilai_buku_akhir,akumulasi,sisa_semester,masa_manfaat_tahun')
        .eq('aset_id', indukPecah.id).eq('periode', basisPeriode).maybeSingle()
      if (data) {
        const d = data as { nilai_buku_akhir: number; akumulasi: number; sisa_semester: number; masa_manfaat_tahun: number | null }
        setBasisPecah({ nilai_buku: d.nilai_buku_akhir, akumulasi: d.akumulasi, sisa_smt: d.sisa_semester, masa_tahun: d.masa_manfaat_tahun, disusutkan: true })
      } else if (perlakuanKode(indukPecah.kode) === 'tidak') {
        setBasisPecah({ nilai_buku: indukPecah.nilai_perolehan, akumulasi: 0, sisa_smt: 0, masa_tahun: null, disusutkan: false })
      } else {
        setBasisPecahErr(`Belum ada data penyusutan induk untuk periode ${basisPeriode}. Jalankan engine dulu untuk periode itu, atau pilih tanggal dokumen di semester berikutnya.`)
      }
      setBasisPecahLoading(false)
    })()
  }, [indukPecah, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Penggabungan: basis akumulasi seluruh anggota pada semester SEBELUM cutover ──
  // Sengaja MENOLAK kalau ada satu saja anggota yang belum punya baris engine di
  // periode itu. Jatuh ke 0 diam-diam akan menghapus akumulasi barang tsb dari
  // neraca — persis kerusakan yang fitur ini justru harus menghindari, dan tak
  // akan ada satu pun pesan yang memberi tahu.
  useEffect(() => {
    if (gabungList.length === 0) { setBasisGabung(null); setBasisGabungErr(''); return }
    ;(async () => {
      setBasisGabungLoading(true); setBasisGabungErr(''); setBasisGabung(null)
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
      const ids = gabungList.map(k => k.id)
      // Golongan yang memang tak disusutkan (Tanah/ATL/KDP) tak punya baris
      // engine sama sekali — akumulasinya nol, bukan "belum dihitung".
      if (perlakuanKode(gabungList[0].kode) === 'tidak') {
        setBasisGabung(Object.fromEntries(ids.map(id => [id, 0] as const)))
        setBasisGabungLoading(false); return
      }
      const map: Record<string, number> = {}
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('penyusutan_semester')
          .select('aset_id,akumulasi').eq('periode', basisPeriode).in('aset_id', ids.slice(i, i + 200))
        if (error) {
          setBasisGabungErr(`Gagal membaca akumulasi penyusutan ${basisPeriode}: ${error.message}`)
          setBasisGabungLoading(false); return
        }
        for (const r of (data || []) as { aset_id: string; akumulasi: number }[]) map[r.aset_id] = Number(r.akumulasi) || 0
      }
      const belum = ids.filter(id => map[id] === undefined)
      if (belum.length > 0) {
        setBasisGabungErr(`${belum.length} dari ${ids.length} barang belum punya hasil penyusutan periode ${basisPeriode}. Jalankan Engine untuk periode itu dulu, atau pilih tanggal dokumen di semester berikutnya — kalau diteruskan, akumulasi barang itu hilang dari neraca.`)
        setBasisGabungLoading(false); return
      }
      setBasisGabung(map)
      setBasisGabungLoading(false)
    })()
  }, [gabungList, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  const indukGabung = gabungList.find(k => k.id === indukGabungId) || null
  const totalNPGabung = gabungList.reduce((s, k) => s + Math.round(k.nilai_perolehan), 0)
  const totalAkumGabung = basisGabung ? gabungList.reduce((s, k) => s + (basisGabung[k.id] || 0), 0) : 0
  // Ketiga syarat sekaligus (keputusan user 2026-08-11). Nama, merek, satuan, &
  // spesifikasi BOLEH beda — justru itu yang selama ini menghalangi kasus pagar.
  const gabungSyaratOk = gabungList.length >= 2 && gabungList.every(k => kunciGabung(k) === kunciGabung(gabungList[0]))
  const sejenisTersisa = sejenis.filter(k => !gabungList.some(x => x.id === k.id))

  // Semua barang aktif se-SKPD yang kode + nilai + tanggal perolehannya SAMA
  // PERSIS dgn barang pertama. `.eq` bertumpuk, bukan pencarian teks: syarat
  // gabung itu kesamaan angka, dan mencocokkannya lewat nama justru yang bikin
  // kasus pagar (nama & satuannya berbeda-beda) tak pernah ketemu.
  async function muatSejenis(k0: KandidatGabung) {
    setSejenisLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan,satuan,merek_tipe')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .eq('kode', k0.kode).eq('nilai_perolehan', k0.nilai_perolehan)
    q = k0.tgl_perolehan ? q.eq('tgl_perolehan', k0.tgl_perolehan) : q.is('tgl_perolehan', null)
    const { data, error } = await q.order('nibar', { ascending: true }).limit(500)
    if (error) { setErr(`Gagal memuat barang sejenis: ${error.message}`); setSejenisLoading(false); return }
    setSejenis((data as unknown as KandidatGabung[]) || [])
    setSelSejenis({})
    setSejenisLoading(false)
  }

  async function cariGabung() {
    if (!qGabung.trim()) return
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan,satuan,merek_tipe')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .or(`nibar.ilike.%${qGabung}%,nama_barang.ilike.%${qGabung}%,kode.ilike.%${qGabung}%`)
    // Begitu anggota pertama ada, hasil carinya ikut disaring ke yang LAYAK
    // gabung — supaya operator tak menemukan barang yang lalu ditolak.
    const k0 = gabungList[0]
    if (k0) {
      q = q.eq('kode', k0.kode).eq('nilai_perolehan', k0.nilai_perolehan)
      q = k0.tgl_perolehan ? q.eq('tgl_perolehan', k0.tgl_perolehan) : q.is('tgl_perolehan', null)
    }
    const { data, error } = await q.limit(20)
    if (error) { setErr(`Gagal mencari barang: ${error.message}`); return }
    setHasilGabung((data as unknown as KandidatGabung[]) || [])
  }

  function tambahGabung(k: KandidatGabung) {
    if (gabungList.some(x => x.id === k.id)) return
    const k0 = gabungList[0]
    // Penjaga lapis kedua: query di atas sudah menyaring, tapi syarat ini yang
    // menentukan benar/salahnya neraca — jangan andalkan filter tampilan saja.
    if (k0 && kunciGabung(k) !== kunciGabung(k0)) {
      setErr('Barang itu beda kode / nilai perolehan / tanggal perolehan — tidak bisa digabung dengan yang sudah dipilih.')
      return
    }
    setErr('')
    setGabungList(prev => [...prev, k])
    setIndukGabungId(prev => prev ?? k.id)
    setHasilGabung([]); setQGabung('')
    if (!k0) muatSejenis(k)
  }

  function tambahSejenisTerpilih() {
    const pilih = sejenisTersisa.filter(k => selSejenis[k.id])
    if (pilih.length === 0) return
    setGabungList(prev => [...prev, ...pilih.filter(k => !prev.some(x => x.id === k.id))])
    setSelSejenis({})
  }

  function hapusGabung(id: string) {
    setGabungList(prev => {
      const next = prev.filter(k => k.id !== id)
      if (next.length === 0) { setSejenis([]); setSelSejenis({}) }
      return next
    })
    setIndukGabungId(prev => prev === id ? null : prev)
    setGabungSpek(null) // induk/anggota berubah → edit tersusun tak lagi tentu valid
  }

  // Spesifikasi HASIL gabungan = spesifikasi induk yang boleh dikoreksi
  // (mis. satuan "Meter Persegi" → "Unit", nama jadi "Pagar Besi 125 m").
  async function openGabungSpek() {
    const b = indukGabung
    if (!b) return
    const keys = koreksiFieldKeys(b.kode)
    const { data } = await supabase.from('aset').select([...keys, 'foto_paths'].join(',')).eq('id', b.id).single()
    const row = (data || {}) as Record<string, unknown>
    const f: Record<string, string> = {}
    for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
    setGabungSpekInit(f)
    setGabungSpekFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    setGabungSpekOpen(true)
  }

  // Pilih induk → warisi field spesifikasi induk sbg titik awal tiap pecahan.
  async function pilihInduk(b: Barang) {
    setIndukPecah(b)
    const { data } = await supabase.from('aset').select(ASET_FIELD_COLS.join(',')).eq('id', b.id).single()
    const f: Record<string, string> = {}
    // `as unknown as`: `.select()` diberi string rakitan runtime → supabase-js
    // tak bisa menurunkan bentuk barisnya (tipenya jadi `GenericStringError`).
    if (data) for (const k of ASET_FIELD_COLS) { const v = (data as unknown as Record<string, unknown>)[k]; if (v != null) f[k] = String(v) }
    // Tanah: sertifikat/jenis hak TIDAK diwarisi — tiap pecahan sertifikatnya sendiri, diisi di GIS.
    if (kodeLevel3(b.kode) === '1.3.1') for (const k of TANAH_DOK_FIELDS) delete f[k]
    setIndukFields(f)
    setPecahan([
      { key: newKey(), jumlah: '1', nilai: '', fields: { ...f }, foto: [] },
      { key: newKey(), jumlah: '1', nilai: '', fields: { ...f }, foto: [] },
    ])
  }
  function setPecah(key: string, patch: Partial<PecahanItem>) {
    setPecahan(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }
  function addPecah() { setPecahan(prev => [...prev, { key: newKey(), jumlah: '1', nilai: '', fields: { ...indukFields }, foto: [] }]) }
  function removePecah(key: string) { setPecahan(prev => prev.length <= 2 ? prev : prev.filter(p => p.key !== key)) }

  // Alokasi proporsional by nilai; sisa pembulatan (NB/akumulasi) diserap di pecahan TERAKHIR.
  const alokasiPecah = (() => {
    if (!indukPecah || !basisPecah) return [] as { np: number; nb: number; ak: number; beban: number; valid: boolean }[]
    const totalNP = Math.round(indukPecah.nilai_perolehan)
    let accNB = 0, accAk = 0
    return pecahan.map((p, i) => {
      const jumlah = parseInt(p.jumlah, 10)
      const np = Math.round(parseFloat(p.nilai))
      const valid = Number.isFinite(jumlah) && jumlah >= 1 && Number.isFinite(np) && np > 0
      const prop = totalNP > 0 && Number.isFinite(np) ? np / totalNP : 0
      const last = i === pecahan.length - 1
      const nb = last ? basisPecah.nilai_buku - accNB : Math.round(prop * basisPecah.nilai_buku)
      const ak = last ? basisPecah.akumulasi - accAk : Math.round(prop * basisPecah.akumulasi)
      accNB += nb; accAk += ak
      const beban = basisPecah.sisa_smt > 0 ? Math.round(nb / basisPecah.sisa_smt) : 0
      return { np: Number.isFinite(np) ? np : 0, nb, ak, beban, valid }
    })
  })()
  const totalNPInduk = indukPecah ? Math.round(indukPecah.nilai_perolehan) : 0
  const sumNPPecah = alokasiPecah.reduce((s, a) => s + a.np, 0)
  const balancePecah = indukPecah != null && sumNPPecah === totalNPInduk
  const semuaPecahValid = alokasiPecah.length >= 2 && alokasiPecah.every(a => a.valid)

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id,tgl_perolehan,cara_perolehan,foto_paths,intra_ekstra')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    const list = (data as unknown as Barang[]) || []
    setRows(list)
    if (alasan === 'spesifikasi') setUraianMap(await fetchUraian(list.map(b => b.kode)))
    setLoaded(true)
    setLoading(false)
  }

  // Uraian baku per kode (admin_kodefikasi_bmd) — utk kolom Kode Barang di tabel
  // pilih barang tab Spesifikasi.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }
  function toggleNilai(b: Barang) {
    setSelNilai(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]
      else next[b.id] = { barang: b, nilaiBaru: String(b.nilai_perolehan) }
      return next
    })
  }
  function ubahNilaiBaru(id: string, v: string) {
    setSelNilai(prev => prev[id] ? { ...prev, [id]: { ...prev[id], nilaiBaru: v } } : prev)
  }

  // ── Spesifikasi: centang barang (multi) → popup EditSpesifikasiModal ──
  function toggleSpek(b: Barang) {
    setSelSpek(prev => {
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
    setSpekEdit(null) // seleksi berubah → edit tersusun tak lagi valid
  }
  const selSpekList = Object.values(selSpek)
  const spekSameGol = allSameGolongan(selSpekList.map(b => b.kode))
  // Buka popup: single → prefill nilai field & foto barang; bulk → kosong.
  async function openSpekModal() {
    if (selSpekList.length === 0 || !spekSameGol) return
    const single = selSpekList.length === 1
    setSpekPrefix(`draft/koreksi-spek/${single ? selSpekList[0].id : newKey()}`)
    if (single) {
      const b = selSpekList[0]
      const keys = koreksiFieldKeys(b.kode)
      const { data } = await supabase.from('aset').select([...keys, 'foto_paths'].join(',')).eq('id', b.id).single()
      const row = (data || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = row[k]; if (v != null) f[k] = String(v) }
      setSpekInitFields(f)
      setSpekInitFoto(Array.isArray(row.foto_paths) ? (row.foto_paths as string[]) : [])
    } else {
      setSpekInitFields({}); setSpekInitFoto([])
    }
    setSpekModalOpen(true)
  }

  async function cariKandidat() {
    if (!qGanda.trim()) return
    const { data } = await supabase.from('aset')
      .select('id,nibar,kode,nama_barang,spesifikasi_lainnya,nilai_perolehan,tgl_perolehan')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
      .or(`nibar.ilike.%${qGanda}%,nama_barang.ilike.%${qGanda}%,kode.ilike.%${qGanda}%`)
      .limit(10)
    setHasilGanda((data as Kandidat[]) || [])
  }
  function tambahKandidat(k: Kandidat) {
    if (kandidat.some(x => x.id === k.id)) return
    setKandidat(prev => [...prev, k])
    setHasilGanda([]); setQGanda('')
    setSurvivorId(prev => prev ?? k.id)
  }
  function hapusKandidat(id: string) {
    setKandidat(prev => prev.filter(k => k.id !== id))
    setSurvivorId(prev => prev === id ? null : prev)
  }
  const kodeBeda = kandidat.length > 1 && kandidat.some(k => k.kode !== kandidat[0].kode)
  const nilaiBeda = kandidat.length > 1 && kandidat.some(k => k.nilai_perolehan !== kandidat[0].nilai_perolehan)
  const tahunBeda = kandidat.length > 1 && kandidat.some(k => tahunDari(k.tgl_perolehan) !== tahunDari(kandidat[0].tgl_perolehan))
  const namaBeda = kandidat.length > 1 && kandidat.some(k => (k.nama_barang || '') !== (kandidat[0].nama_barang || ''))

  async function simpan() {
    setErr('')

    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
      if (alasan === 'pencatatan_ganda' && !ket.trim()) { setErr('Keterangan/justifikasi wajib diisi utk Pencatatan Ganda.'); return }
      if (alasan === 'penggabungan' && !ket.trim()) { setErr('Keterangan/justifikasi wajib diisi utk Penggabungan Barang.'); return }
    }

    setSaving(true)

    if (!h) {
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'koreksi', jenis: alasan,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    if (alasan === 'nilai_perolehan') {
      const items = Object.values(selNilai)
      if (items.length === 0) { setErr('Centang minimal satu barang.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      for (const { barang, nilaiBaru } of items) {
        const baru = parseFloat(nilaiBaru)
        if (isNaN(baru) || baru < 0) { setErr(`Nilai baru "${barang.nama_barang || barang.nibar}" tidak valid.`); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
        const delta = baru - barang.nilai_perolehan
        const { error } = await catatTransaksi(supabase, {
          asetId: barang.id, jenis: 'koreksi_nilai', nilai: delta, tanggal: h.tanggal, headerId: h.id,
          payload: { nilai_lama: barang.nilai_perolehan, nilai_perolehan_baru: baru, delta },
          keterangan: h.keterangan || undefined,
        })
        if (error) { setErr(error); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      }
      setSaving(false); onSaved(items.length); return
    }

    if (alasan === 'spesifikasi') {
      const delHeader = async () => { if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h!.id) }
      const list = Object.values(selSpek)
      if (list.length === 0) { setErr('Centang minimal satu barang.'); await delHeader(); setSaving(false); return }
      if (!allSameGolongan(list.map(b => b.kode))) { setErr('Barang beda jenis aset — pisahkan per jenis (field spesifikasinya beda).'); await delHeader(); setSaving(false); return }
      if (!spekEdit) { setErr('Klik "Edit Spesifikasi" lalu isi field yang diubah dulu.'); await delHeader(); setSaving(false); return }
      const single = list.length === 1
      // Payload field non-kosong (cast numeric utk luas/lat/long/tahun). Single:
      // modal prefill nilai sekarang, jadi rekam HANYA yang BERUBAH dari nilai awal
      // (biar tak ada entri ledger "berubah" padahal nilainya sama). Bulk: initial
      // kosong → semua yang diisi = perubahan (diterapkan ke semua barang).
      const initial = single ? spekInitFields : {}
      const base: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(spekEdit.fields)) {
        const val = (v ?? '').toString().trim()
        if (val === '' || val === (initial[k] ?? '').toString().trim()) continue
        if (ASET_NUM_COLS.has(k) || k === 'tahun_pengadaan') { const n = Number(val); if (Number.isFinite(n)) base[k] = n }
        else base[k] = val
      }
      const fotoReplace = single ? (spekEdit.foto.replace || []) : null
      const fotoAppend = !single ? (spekEdit.foto.append || []) : null
      const fotoBerubah = single ? JSON.stringify(fotoReplace) !== JSON.stringify(spekInitFoto) : (fotoAppend?.length ?? 0) > 0
      if (Object.keys(base).length === 0 && !fotoBerubah) { setErr('Tidak ada field yang diubah.'); await delHeader(); setSaving(false); return }
      // Ambil nilai LAMA field yg diubah (per aset) SEBELUM update — disimpan di
      // payload.prev supaya koreksi ini bisa dibatalkan (restore ke nilai semula).
      const prevCols = [...new Set([...Object.keys(base), ...(fotoBerubah ? ['foto_paths'] : [])])]
      const prevByAset = new Map<string, Record<string, unknown>>()
      if (prevCols.length > 0) {
        const { data: prevRows } = await supabase.from('aset').select(['id', ...prevCols].join(',')).in('id', list.map(b => b.id))
        for (const r of (prevRows || []) as unknown as Record<string, unknown>[]) prevByAset.set(String(r.id), r)
      }
      for (const b of list) {
        const prevRow = prevByAset.get(b.id) || {}
        const prev: Record<string, unknown> = {}
        for (const k of prevCols) prev[k] = prevRow[k] ?? null
        const payload: Record<string, unknown> = { ...base, prev }
        if (single && fotoBerubah) payload.foto_paths = fotoReplace
        else if (!single && fotoAppend && fotoAppend.length) payload.foto_paths = [...(b.foto_paths || []), ...fotoAppend]
        // `tanggal` WAJIB disebut. Tanpa itu `catatTransaksi` men-default ke
        // HARI INI, sementara koreksi_nilai & pemecahan di berkas yang sama
        // memakai tanggal kartu — jadi satu jurnal bisa melahirkan baris ledger
        // bertanggal berbeda-beda. Selama ini tak ketahuan karena keempat baris
        // yang ada kebetulan diinput di hari yang sama dgn tanggal dokumennya;
        // begitu ada dokumen bertanggal mundur, ledgernya melenceng diam-diam.
        // Dikunci lib/sinkronisasi.test.ts (§6).
        const { error } = await catatTransaksi(supabase, {
          asetId: b.id, jenis: 'koreksi_spesifikasi', tanggal: h.tanggal, headerId: h.id,
          payload, keterangan: h.keterangan || undefined,
        })
        if (error) { setErr(error); setSaving(false); return }
      }
      setSaving(false); onSaved(list.length); return
    }

    if (alasan === 'penggabungan') {
      const delHeader = async () => { if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h!.id) }
      const induk = indukGabung, basis = basisGabung
      if (gabungList.length < 2) { setErr('Pilih minimal 2 barang untuk digabung.'); await delHeader(); setSaving(false); return }
      if (!induk) { setErr('Tunjuk salah satu barang sebagai INDUK (barang yang dipertahankan).'); await delHeader(); setSaving(false); return }
      if (!gabungSyaratOk) { setErr('Semua barang wajib sama KODE BARANG, NILAI PEROLEHAN, dan TANGGAL PEROLEHAN.'); await delHeader(); setSaving(false); return }
      if (basisGabungErr) { setErr(basisGabungErr); await delHeader(); setSaving(false); return }
      if (!basis) { setErr('Basis akumulasi belum termuat.'); await delHeader(); setSaving(false); return }

      const sumber = gabungList.filter(k => k.id !== induk.id)
      const nilaiLama = Math.round(induk.nilai_perolehan)
      const npBaru = totalNPGabung
      const akumLama = basis[induk.id] || 0
      const akBaru = totalAkumGabung

      // Spesifikasi hasil gabungan → dititipkan di payload event ini (bukan
      // baris `koreksi_spesifikasi` tersendiri). Dua alasannya: (1) satu
      // peristiwa = satu baris ledger per aset, jadi guard "tak boleh ada
      // transaksi lebih baru" tak memblokir pembatalannya sendiri; (2) batal
      // penggabungan otomatis mengembalikan namanya juga, lewat `spek_prev`.
      const spekBaru: Record<string, unknown> = {}
      if (gabungSpek) {
        for (const [k, v] of Object.entries(gabungSpek.fields)) {
          const val = (v ?? '').toString().trim()
          if (val === '' || val === (gabungSpekInit[k] ?? '').toString().trim()) continue
          if (ASET_NUM_COLS.has(k) || k === 'tahun_pengadaan') { const n = Number(val); if (Number.isFinite(n)) spekBaru[k] = n }
          else spekBaru[k] = val
        }
        const fotoBaru = gabungSpek.foto.replace
        if (fotoBaru && JSON.stringify(fotoBaru) !== JSON.stringify(gabungSpekFoto)) spekBaru.foto_paths = fotoBaru
      }
      const spekPrev: Record<string, unknown> = {}
      if (Object.keys(spekBaru).length > 0) {
        const { data: prevRow } = await supabase.from('aset').select(Object.keys(spekBaru).join(',')).eq('id', induk.id).single()
        const row = (prevRow || {}) as Record<string, unknown>
        for (const k of Object.keys(spekBaru)) spekPrev[k] = row[k] ?? null
      }

      // ⚠️ URUTAN: SUMBER dulu, INDUK belakangan. Kalau prosesnya putus di
      // tengah, sisanya adalah keadaan KURANG-catat (sebagian sumber sudah
      // hilang, induk belum membesar) — bukan DOBEL-catat, yang justru terjadi
      // kalau induk di-rebasis lebih dulu lalu penulisan sumber gagal.
      for (const s of sumber) {
        const { error } = await catatTransaksi(supabase, {
          asetId: s.id, jenis: 'penggabungan_keluar', tanggal: h.tanggal, nilai: Math.round(s.nilai_perolehan), headerId: h.id,
          payload: { induk_aset_id: induk.id, induk_nibar: induk.nibar, akumulasi_diserap: basis[s.id] || 0 },
          keterangan: `Digabung ke ${induk.nibar || induk.nama_barang || 'induk'} (${h.no_sk})`,
        })
        if (error) { setErr(`Gagal melebur "${s.nama_barang || s.nibar}": ${error}. Batalkan lewat kartu jurnal penggabungan lalu ulangi.`); setSaving(false); return }
      }

      const { error: masukErr } = await catatTransaksi(supabase, {
        asetId: induk.id, jenis: 'penggabungan_masuk', tanggal: h.tanggal,
        // `nilai` = DELTA (Σ barang sumber), BUKAN nilai penuh hasil gabungan —
        // induk sudah duduk di Saldo Awal, jadi nilai penuh akan menggelembungkan
        // baris Penambahan Rekonsiliasi tepat sebesar nilai induk sendiri.
        // Nilai penuhnya tetap terekam di payload (dipakai engine & register).
        nilai: npBaru - nilaiLama, headerId: h.id,
        payload: {
          nilai_lama: nilaiLama, akumulasi_lama: akumLama,
          nilai_perolehan_baru: npBaru, akumulasi_baru: akBaru,
          sumber_ids: sumber.map(s => s.id), sumber_nibars: sumber.map(s => s.nibar), jumlah_sumber: sumber.length,
          ...(Object.keys(spekBaru).length > 0 ? { spek: spekBaru, spek_prev: spekPrev } : {}),
        },
        keterangan: `Gabungan ${gabungList.length} barang (${h.no_sk})`,
      })
      if (masukErr) { setErr(`Gagal me-rebasis induk: ${masukErr}. Batalkan lewat kartu jurnal penggabungan lalu ulangi.`); setSaving(false); return }

      setSaving(false); onSaved(gabungList.length); return
    }

    if (alasan === 'pemecahan') {
      const delHeader = async () => { if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h!.id) }
      const induk = indukPecah, basis = basisPecah
      if (!induk) { setErr('Pilih barang induk yang dipecah.'); await delHeader(); setSaving(false); return }
      if (basisPecahErr) { setErr(basisPecahErr); await delHeader(); setSaving(false); return }
      if (!basis) { setErr('Basis alokasi belum termuat.'); await delHeader(); setSaving(false); return }
      if (pecahan.length < 2) { setErr('Minimal 2 pecahan.'); await delHeader(); setSaving(false); return }
      if (!semuaPecahValid) { setErr('Tiap pecahan wajib: jumlah ≥ 1 dan nilai perolehan > 0.'); await delHeader(); setSaving(false); return }
      if (!balancePecah) { setErr(`Total nilai pecahan (${formatRupiah(sumNPPecah)}) harus SAMA dengan nilai induk (${formatRupiah(totalNPInduk)}). Selisih ${formatRupiah(sumNPPecah - totalNPInduk)}.`); await delHeader(); setSaving(false); return }

      const { data: skpdRow, error: skpdErr } = await supabase.from('admin_skpd').select('kode_skpd').eq('id', skpdId).single()
      if (skpdErr || !(skpdRow as { kode_skpd?: string } | null)?.kode_skpd) { setErr(`Gagal ambil kode lokasi SKPD utk NIBAR: ${skpdErr?.message || 'kode_skpd kosong'}`); await delHeader(); setSaving(false); return }
      const kodeSkpd = (skpdRow as { kode_skpd: string }).kode_skpd

      const batas = (await fetchBatasKapitalisasi(supabase, [induk.kode])).get(induk.kode)
      // Uraian baku ikut kode induk (pecahan kodenya sama persis). WAJIB diisi:
      // KIBAR & KIR membaca kolom TERSIMPAN `aset.uraian_barang`, bukan lookup
      // kodefikasi spt Daftar Barang/Penyusutan — kalau dibiarkan null, kartu
      // yang dicetak keluar "-" padahal kodenya jelas punya uraian.
      const uraianInduk = (await fetchUraian([induk.kode]))[induk.kode] || null
      const tahun = (induk.tgl_perolehan || h.tanggal).slice(0, 4)
      const nibarItems = alokasiPecah.map((a, i) => ({ key: String(i), kode: induk.kode, intraEkstra: klasifikasiKomptabel(a.np, batas), tahun }))
      let nibarMap: Map<string, string>
      try {
        nibarMap = await generateNibars(supabase, nibarItems, kodeSkpd)
      } catch (e) {
        setErr((e as Error).message); await delHeader(); setSaving(false); return
      }

      // Aset pecahan — status 'draft' (tersembunyi) sampai commit di akhir.
      const asetRows: Record<string, unknown>[] = alokasiPecah.map((a, i) => {
        const jumlah = parseInt(pecahan[i].jumlah, 10)
        const row: Record<string, unknown> = {
          nibar: nibarMap.get(String(i)) || null, kode: induk.kode, uraian_barang: uraianInduk, jumlah,
          harga_satuan: a.np / Math.max(1, jumlah), nilai_perolehan: a.np,
          tgl_perolehan: induk.tgl_perolehan, skpd_id: skpdId,
          intra_ekstra: klasifikasiKomptabel(a.np, batas),
          cara_perolehan: induk.cara_perolehan || 'pemecahan',
          foto_paths: pecahan[i].foto || [], status: 'draft',
        }
        for (const k of ASET_FIELD_COLS) {
          const v = pecahan[i].fields[k]
          if (v != null && v !== '') row[k] = ASET_NUM_COLS.has(k) ? Number(v) : v
        }
        return row
      })
      const { data: inserted, error: insErr } = await supabase.from('aset').insert(asetRows).select('id')
      if (insErr || !inserted) { setErr(`Gagal membuat pecahan: ${insErr?.message}`); await delHeader(); setSaving(false); return }
      const pieceIds = (inserted as { id: string }[]).map(r => r.id)

      const masaSmt = basis.masa_tahun ? Math.round(basis.masa_tahun * 2) : 0
      for (let i = 0; i < alokasiPecah.length; i++) {
        const a = alokasiPecah[i]
        const { error } = await catatTransaksi(supabase, {
          asetId: pieceIds[i], jenis: 'pemecahan_masuk', tanggal: h.tanggal, nilai: a.np, headerId: h.id,
          payload: {
            nilai_buku_awal: a.nb, akumulasi: a.ak, sisa_masa_manfaat_smt: basis.sisa_smt,
            masa_manfaat_smt: masaSmt, beban_per_smt: a.beban, induk_aset_id: induk.id, induk_nibar: induk.nibar,
          },
          keterangan: `Pecahan dari ${induk.nibar || induk.nama_barang || 'induk'} (${h.no_sk})`,
        })
        if (error) { setErr(`Gagal mencatat pecahan ke-${i + 1}: ${error}. Induk tetap utuh; batalkan lewat kartu jurnal pemecahan.`); setSaving(false); return }
      }

      const { error: keluarErr } = await catatTransaksi(supabase, {
        asetId: induk.id, jenis: 'pemecahan_keluar', tanggal: h.tanggal, nilai: induk.nilai_perolehan, headerId: h.id,
        payload: { jumlah_pecahan: alokasiPecah.length, pecahan_ids: pieceIds, pecahan_nibars: alokasiPecah.map((_, i) => nibarMap.get(String(i)) || null) },
        keterangan: `Dipecah jadi ${alokasiPecah.length} pecahan (${h.no_sk})`,
      })
      if (keluarErr) { setErr(`Gagal me-retire induk: ${keluarErr}. Batalkan lewat kartu jurnal pemecahan.`); setSaving(false); return }

      const { error: flipErr } = await supabase.from('aset').update({ status: 'aktif' }).in('id', pieceIds)
      if (flipErr) { setErr(`Aktivasi pecahan gagal: ${flipErr.message}. Induk sudah di-retire — batalkan lewat kartu jurnal lalu ulangi.`); setSaving(false); return }

      setSaving(false); onSaved(alokasiPecah.length); return
    }

    // pencatatan_ganda
    if (kandidat.length < 2) { setErr('Pilih minimal 2 barang kandidat duplikat.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    if (!survivorId) { setErr('Pilih salah satu sebagai barang yang dipertahankan.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    if (kodeBeda) { setErr('Semua kandidat harus kode barang yang SAMA PERSIS.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    const survivor = kandidat.find(k => k.id === survivorId)!
    const lainnya = kandidat.filter(k => k.id !== survivorId)
    for (const k of lainnya) {
      // `tanggal` = tanggal DOKUMEN koreksi (h.tanggal), bukan tanggal
      // perolehan barangnya (keputusan user 2026-08-11). Dulu `k.tgl_perolehan
      // || h.tanggal`, dan itu keliru dua kali:
      //   (1) baris ledgernya jatuh di periode PEROLEHAN, jadi Laporan &
      //       Rekonsiliasi menaruh koreksi ini di periode yang salah — persis
      //       jebakan yang sudah dijelaskan panjang lebar di cabang
      //       `koreksi_spesifikasi` di atas (dikunci lib/sinkronisasi.test.ts §6);
      //   (2) `koreksi_pencatatan_ganda` TIDAK ada di whitelist retroaktif
      //       `fn_cek_tahun_buku`, jadi begitu barangnya diperoleh di tahun yang
      //       sudah dikunci, penyimpanannya DITOLAK trigger — duplikat warisan
      //       e-BMD 2025 tak bisa digabung sama sekali.
      // Konsekuensi yang diterima: duplikatnya kini hilang sejak periode
      // koreksi, bukan surut ke semua periode. Modul pelaporan yang memakai
      // `fetchVoidedAsetIds` tetap membuangnya dari periode mana pun — daftar
      // itu memang period-agnostic (lib/voidedAset.ts).
      const { error } = await catatTransaksi(supabase, {
        asetId: k.id, jenis: 'koreksi_pencatatan_ganda', tanggal: h.tanggal, headerId: h.id,
        payload: { survivor_aset_id: survivor.id, survivor_nibar: survivor.nibar },
        keterangan: h.keterangan || undefined,
      })
      if (error) { setErr(error); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
    }
    setSaving(false); onSaved(lainnya.length)
  }

  const alasanAktif = header?.jenis || alasan

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">{header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Baru — ${skpdNama}`}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">{ALASAN_LABEL[header.jenis]} · Tgl. {header.tanggal} · {header.periode}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alasan Koreksi</label>
              <div className="space-y-2">
                {ALASAN_OPT.map(o => (
                  <label key={o.value} className={`flex items-start gap-2 p-2.5 rounded-lg border text-sm ${o.disabled ? 'opacity-50 cursor-not-allowed border-gray-200' : alasan === o.value ? 'border-teal bg-teal/5 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}>
                    <input type="radio" className="mt-0.5" checked={alasan === o.value} disabled={o.disabled}
                      onChange={() => {
                        setAlasan(o.value); setSelNilai({}); setKandidat([]); setSurvivorId(null); setRows([]); setLoaded(false)
                        setSelSpek({}); setSpekEdit(null); setSpekModalOpen(false)
                        setIndukPecah(null); setBasisPecah(null); setBasisPecahErr(''); setPecahan([]); setIndukFields({}); setEditPecahIdx(null)
                        setGabungList([]); setIndukGabungId(null); setHasilGabung([]); setQGabung('')
                        setSejenis([]); setSelSejenis({}); setGabungSpek(null); setGabungSpekOpen(false)
                      }} />
                    <span>
                      <span className="font-medium text-gray-800">{o.label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{o.deskripsi}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. Dokumen Koreksi</label>
                <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal Koreksi</label>
                <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Keterangan {alasan === 'pencatatan_ganda' && <span className="text-red-500">*wajib (justifikasi duplikat)</span>}
                  {alasan === 'penggabungan' && <span className="text-red-500">*wajib (alasan barang tercatat terpecah)</span>}
                </label>
                <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {alasanAktif === 'nilai_perolehan' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang &amp; Nilai Baru</h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kode Jenis</label>
              <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
                <option value="">Semua Jenis Aset</option>
                {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
          {!loaded ? (
            <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th w-10 text-center"></th>
                      <th className="table-th">Barang</th>
                      <th className="table-th text-right">Nilai Sekarang</th>
                      <th className="table-th text-right w-48">Nilai Baru</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 ? (
                      <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                    ) : rows.map(b => (
                      <tr key={b.id} className={selNilai[b.id] ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!selNilai[b.id]} onChange={() => toggleNilai(b)} />
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golonganLabels[kodeLevel3(b.kode)] || kodeLevel3(b.kode)}</p>
                        </td>
                        <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                        <td className="table-td text-right">
                          {selNilai[b.id] && (
                            <input type="number" min="0" step="1" className="select-filter w-full text-right"
                              value={selNilai[b.id].nilaiBaru} onChange={e => ubahNilaiBaru(b.id, e.target.value)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{Object.keys(selNilai).length} barang dipilih</span>
            <button className="btn-primary" onClick={simpan} disabled={saving || Object.keys(selNilai).length === 0}>
              {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Koreksi'}
            </button>
          </div>
        </div>
      )}

      {alasanAktif === 'pencatatan_ganda' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Kandidat Duplikat</h2>
          <p className="text-sm text-gray-500 mb-3">
            Cari &amp; tambah minimal 2 barang, tandai yang DIPERTAHANKAN — sisanya dibatalkan retroaktif ke tanggal
            perolehan masing-masing (hilang dari Daftar Barang/Penyusutan/KIBAR, ledger tetap tersimpan utk audit).
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cari &amp; tambah kandidat (NIBAR / nama / kode)</label>
            <div className="flex gap-2">
              <input className="select-filter flex-1" value={qGanda} onChange={e => setQGanda(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariKandidat() } }} />
              <button type="button" className="btn-secondary" onClick={cariKandidat}>Cari</button>
            </div>
            {hasilGanda.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {hasilGanda.map(k => (
                  <button key={k.id} type="button" onClick={() => tambahKandidat(k)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs">
                    <span className="font-medium text-gray-800">{k.nama_barang || '-'}</span>
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah(k.nilai_perolehan)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {kandidat.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th w-16 text-center">Survivor</th>
                    <th className={`table-th ${kodeBeda ? 'bg-red-50 text-red-700' : ''}`}>Kode</th>
                    <th className={`table-th ${namaBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Nama Barang</th>
                    <th className={`table-th text-right ${nilaiBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Nilai Perolehan</th>
                    <th className={`table-th text-center ${tahunBeda ? 'bg-amber-50 text-amber-700' : ''}`}>Tahun</th>
                    <th className="table-th w-10 text-center">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {kandidat.map(k => (
                    <tr key={k.id} className={survivorId === k.id ? 'bg-teal/5' : ''}>
                      <td className="table-td text-center">
                        <input type="radio" name="survivor" checked={survivorId === k.id} onChange={() => setSurvivorId(k.id)} />
                      </td>
                      <td className="table-td text-xs">{k.kode}</td>
                      <td className="table-td text-xs">{k.nama_barang || '-'}<p className="text-gray-400 mt-0.5">{k.nibar || '-'}</p></td>
                      <td className="table-td text-right text-xs">{formatRupiah(k.nilai_perolehan)}</td>
                      <td className="table-td text-center text-xs">{tahunDari(k.tgl_perolehan)}</td>
                      <td className="table-td text-center">
                        <button type="button" onClick={() => hapusKandidat(k.id)} className="text-red-500 hover:text-red-700">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kodeBeda && <p className="text-xs text-red-600 px-3 py-2 bg-red-50">Kode barang beda — ini BUKAN duplikat, tidak bisa digabung. Pakai menu Reklasifikasi kalau memang perlu ganti kode.</p>}
              {!kodeBeda && (nilaiBeda || tahunBeda || namaBeda) && (
                <p className="text-xs text-amber-700 px-3 py-2 bg-amber-50">Ada kolom yang beda (kuning) — tetap bisa dilanjut, tapi jelaskan alasannya di keterangan.</p>
              )}
            </div>
          )}
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{kandidat.length} barang dipilih</span>
            <button className="btn-primary" onClick={simpan} disabled={saving || kandidat.length < 2 || !survivorId || kodeBeda}>
              {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : `Gabung ${kandidat.length} Barang`}
            </button>
          </div>
        </div>
      )}

      {alasanAktif === 'spesifikasi' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang &amp; Edit Spesifikasi</h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
                <option value="">Semua Jenis Aset</option>
                {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
          {!loaded ? (
            <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th w-10 text-center"></th>
                      <th className="table-th">Kode Barang</th>
                      <th className="table-th">Nama Barang</th>
                      <th className="table-th text-center">Komptabel</th>
                      <th className="table-th text-right">Nilai Perolehan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                    ) : rows.map(b => (
                      <tr key={b.id} className={selSpek[b.id] ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!selSpek[b.id]} onChange={() => toggleSpek(b)} />
                        </td>
                        <td className="table-td align-top">
                          <p className="font-medium text-gray-700 text-xs">{b.kode}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{uraianMap[b.kode] || '-'}</p>
                        </td>
                        <td className="table-td align-top">
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'}</p>
                        </td>
                        <td className="table-td text-center text-xs capitalize">{b.intra_ekstra || '-'}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {selSpekList.length > 0 && !spekSameGol && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Barang yang dicentang beda jenis aset — field spesifikasinya beda kolom, tidak bisa diedit sekaligus. Pilih satu jenis saja.
            </p>
          )}
          {spekEdit && spekSameGol && (
            <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              {selSpekList.length === 1
                ? 'Edit spesifikasi tersusun — klik Simpan untuk menerapkan perubahannya.'
                : <>Akan diterapkan ke {selSpekList.length} barang: <span className="font-medium">{Object.keys(spekEdit.fields).filter(k => spekEdit.fields[k]?.trim()).map(k => FIELD_LABEL[k as FieldKey] || k).join(', ') || '(hanya foto)'}</span></>}
            </p>
          )}
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{selSpekList.length} barang dipilih</span>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={openSpekModal} disabled={selSpekList.length === 0 || !spekSameGol}>
                {spekEdit ? '✎ Ubah Field...' : '✎ Edit Spesifikasi...'}
              </button>
              <button className="btn-primary" onClick={simpan} disabled={saving || selSpekList.length === 0 || !spekSameGol || !spekEdit}>
                {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Koreksi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alasanAktif === 'pemecahan' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Barang Induk (yang Dipecah)</h2>
          {!indukPecah ? (
            <>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Kode Jenis</label>
                  <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
                    <option value="">Semua Jenis Aset</option>
                    {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-gray-500 mb-1">Cari</label>
                  <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..." value={fSearch}
                    onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
                </div>
                <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
              </div>
              {!loaded ? (
                <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih induk.</div>
              ) : (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="table-th">Barang</th>
                          <th className="table-th text-center">Jumlah</th>
                          <th className="table-th text-right">Nilai Perolehan</th>
                          <th className="table-th w-24"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.length === 0 ? (
                          <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang untuk filter ini.</td></tr>
                        ) : rows.map(b => (
                          <tr key={b.id}>
                            <td className="table-td">
                              <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                              <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode}</p>
                            </td>
                            <td className="table-td text-center text-xs">{b.jumlah}</td>
                            <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                            <td className="table-td text-center">
                              <button className="btn-primary text-xs px-3 py-1" onClick={() => pilihInduk(b)}>Pilih</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start justify-between gap-4 border border-teal/30 bg-teal/5 rounded-lg p-3">
              <div className="text-sm">
                <p className="font-medium text-gray-800">{indukPecah.nama_barang || '-'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{indukPecah.nibar || '-'} · {indukPecah.kode} · Jumlah {indukPecah.jumlah}</p>
                <p className="text-xs text-gray-500 mt-0.5">Nilai perolehan: <span className="font-medium">{formatRupiah(indukPecah.nilai_perolehan)}</span></p>
                {basisPecahLoading ? <p className="text-xs text-gray-400 mt-1">Memuat basis alokasi…</p>
                  : basisPecahErr ? <p className="text-xs text-red-600 mt-1">{basisPecahErr}</p>
                  : basisPecah ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Basis (akhir {formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))}):
                      nilai buku {formatRupiah(basisPecah.nilai_buku)} · akumulasi {formatRupiah(basisPecah.akumulasi)} · sisa {basisPecah.sisa_smt} smt
                      {!basisPecah.disusutkan && ' (tidak disusutkan)'}
                    </p>
                  ) : null}
              </div>
              <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => { setIndukPecah(null); setBasisPecah(null); setBasisPecahErr(''); setPecahan([]) }}>Ganti</button>
            </div>
          )}

          {indukPecah && basisPecah && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Barang Pecahan &amp; Alokasi</h3>
                <button type="button" className="btn-secondary text-xs" onClick={addPecah}>+ Tambah Pecahan</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th w-12 text-center">#</th>
                      <th className="table-th w-20 text-center">Jumlah</th>
                      <th className="table-th text-right w-40">Nilai Perolehan</th>
                      <th className="table-th text-right">Nilai Buku</th>
                      <th className="table-th text-right">Akumulasi</th>
                      <th className="table-th text-right">Beban/Smt</th>
                      <th className="table-th">Spesifikasi</th>
                      <th className="table-th w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pecahan.map((p, i) => {
                      const a = alokasiPecah[i]
                      const nama = p.fields.nama_barang || indukPecah.nama_barang || '-'
                      return (
                        <tr key={p.key}>
                          <td className="table-td text-center text-xs text-gray-400">{i + 1}</td>
                          <td className="table-td text-center">
                            <input type="number" min="1" step="1" className="select-filter w-full text-center"
                              value={p.jumlah} onChange={e => setPecah(p.key, { jumlah: e.target.value })} />
                          </td>
                          <td className="table-td text-right">
                            <input type="number" min="0" step="1" className="select-filter w-full text-right"
                              value={p.nilai} placeholder="0" onChange={e => setPecah(p.key, { nilai: e.target.value })} />
                          </td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.nb) : '-'}</td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.ak) : '-'}</td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah(a.beban) : '-'}</td>
                          <td className="table-td">
                            <button type="button" onClick={() => setEditPecahIdx(i)} className="text-xs text-teal hover:underline">
                              {p.foto.length > 0 ? `✎ ${nama} · ${p.foto.length}📷` : `✎ ${nama}`}
                            </button>
                          </td>
                          <td className="table-td text-center">
                            <button type="button" disabled={pecahan.length <= 2} onClick={() => removePecah(p.key)}
                              className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed">×</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={`border-t border-gray-200 ${balancePecah ? '' : 'bg-red-50'}`}>
                      <td className="table-td text-xs font-medium text-center" colSpan={2}>Total</td>
                      <td className={`table-td text-right text-xs font-semibold ${balancePecah ? 'text-gray-800' : 'text-red-700'}`}>{formatRupiah(sumNPPecah)}</td>
                      <td className="table-td text-right text-xs text-gray-500" colSpan={4}>Induk: {formatRupiah(totalNPInduk)}</td>
                      <td className="table-td"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!balancePecah && <p className="mt-2 text-xs text-red-600">Total nilai pecahan harus sama dengan nilai perolehan induk. Selisih {formatRupiah(sumNPPecah - totalNPInduk)}.</p>}
              <p className="mt-2 text-xs text-gray-400">Klik nama di kolom Spesifikasi untuk isi/ubah spesifikasi tiap pecahan (format per golongan, sama seperti Cara Perolehan). Nilai awal diwarisi dari induk. NIBAR digenerate baru.</p>
              {kodeLevel3(indukPecah.kode) === '1.3.1' && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                  Tanah: sertifikat, jenis hak &amp; bidang TIDAK diisi di sini — tiap pecahan otomatis muncul di
                  <span className="font-medium"> GIS Tanah → Kelola Bidang</span>, isi dokumen kepemilikan &amp; bidang (1 atau banyak) di situ setelah pemecahan.
                </p>
              )}
            </div>
          )}

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">{indukPecah ? `${pecahan.length} pecahan` : 'Belum pilih induk'}</span>
            <button className="btn-primary" onClick={simpan}
              disabled={saving || !indukPecah || !basisPecah || !!basisPecahErr || !semuaPecahValid || !balancePecah}>
              {saving ? 'Menyimpan...' : indukPecah ? `Pecah jadi ${pecahan.length} Barang` : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {alasanAktif === 'penggabungan' && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Barang yang Digabung</h2>
          <p className="text-sm text-gray-500 mb-4">
            Syaratnya <span className="font-medium">kode barang, nilai perolehan, &amp; tanggal perolehan SAMA PERSIS</span>.
            Nama, merek, satuan, dan spesifikasi boleh beda — memang itu yang biasanya berantakan.
            Sisa masa manfaat &amp; tanggal perolehan hasil gabungan mengikuti barang yang ditunjuk sebagai <span className="font-medium">Induk</span>.
          </p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {gabungList.length === 0 ? 'Cari barang pertama (NIBAR / nama / kode)' : 'Cari barang lain yang layak digabung'}
            </label>
            <div className="flex gap-2">
              <input className="select-filter flex-1" value={qGabung} onChange={e => setQGabung(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cariGabung() } }} />
              <button type="button" className="btn-secondary" onClick={cariGabung}>Cari</button>
            </div>
            {hasilGabung.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {hasilGabung.map(k => (
                  <button key={k.id} type="button" onClick={() => tambahGabung(k)}
                    disabled={gabungList.some(x => x.id === k.id)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs disabled:opacity-40">
                    <span className="font-medium text-gray-800">{k.nama_barang || '-'}</span>
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah(k.nilai_perolehan)} · {tahunDari(k.tgl_perolehan)}{k.satuan ? ` · ${k.satuan}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Barang sejenis: inti kegunaan fitur ini. Kasus yang melahirkannya
              punya 35 baris — mencentangnya di sini, bukan mencarinya satu-satu. */}
          {gabungList.length > 0 && (
            <div className="mt-4">
              {sejenisLoading ? (
                <p className="text-xs text-gray-400">Mencari barang sejenis…</p>
              ) : sejenisTersisa.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-amber-50/60 border-b border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-800">
                      Ada <span className="font-semibold">{sejenisTersisa.length}</span> barang lain di SKPD ini dengan kode, nilai, &amp; tanggal perolehan yang sama persis.
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" className="text-xs text-teal hover:underline"
                        onClick={() => setSelSejenis(Object.fromEntries(sejenisTersisa.map(k => [k.id, true] as const)))}>Centang semua</button>
                      <button type="button" className="btn-primary text-xs px-3 py-1"
                        disabled={sejenisTersisa.every(k => !selSejenis[k.id])} onClick={tambahSejenisTerpilih}>
                        Tambahkan {sejenisTersisa.filter(k => selSejenis[k.id]).length || ''}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-50">
                        {sejenisTersisa.map(k => (
                          <tr key={k.id} className={selSejenis[k.id] ? 'bg-teal/5' : ''}>
                            <td className="table-td w-10 text-center">
                              <input type="checkbox" checked={!!selSejenis[k.id]}
                                onChange={() => setSelSejenis(prev => { const n = { ...prev }; if (n[k.id]) delete n[k.id]; else n[k.id] = true; return n })} />
                            </td>
                            <td className="table-td">
                              <p className="font-medium text-gray-800">{k.nama_barang || '-'}</p>
                              <p className="text-gray-400 mt-0.5">{k.nibar || '-'}{k.satuan ? ` · ${k.satuan}` : ''}{k.merek_tipe ? ` · ${k.merek_tipe}` : ''}</p>
                            </td>
                            <td className="table-td text-right">{formatRupiah(k.nilai_perolehan)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Tidak ada barang sejenis lain yang belum dipilih.</p>
              )}
            </div>
          )}

          {gabungList.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th w-16 text-center">Induk</th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Satuan</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                    <th className="table-th text-right">Akumulasi</th>
                    <th className="table-th w-10 text-center">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gabungList.map(k => (
                    <tr key={k.id} className={indukGabungId === k.id ? 'bg-teal/5' : ''}>
                      <td className="table-td text-center">
                        <input type="radio" name="induk-gabung" checked={indukGabungId === k.id}
                          onChange={() => { setIndukGabungId(k.id); setGabungSpek(null) }} />
                      </td>
                      <td className="table-td text-xs">
                        <p className="font-medium text-gray-800">{k.nama_barang || '-'}</p>
                        <p className="text-gray-400 mt-0.5">{k.nibar || '-'} · {k.kode} · {tahunDari(k.tgl_perolehan)}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{k.satuan || '-'}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(k.nilai_perolehan)}</td>
                      <td className="table-td text-right text-xs text-gray-600">
                        {basisGabung ? formatRupiah(basisGabung[k.id] || 0) : '—'}
                      </td>
                      <td className="table-td text-center">
                        <button type="button" onClick={() => hapusGabung(k.id)} className="text-red-500 hover:text-red-700">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50/60">
                    <td className="table-td text-xs font-medium text-center" colSpan={3}>Hasil gabungan ({gabungList.length} barang)</td>
                    <td className="table-td text-right text-xs font-semibold text-gray-800">{formatRupiah(totalNPGabung)}</td>
                    <td className="table-td text-right text-xs font-semibold text-gray-800">{basisGabung ? formatRupiah(totalAkumGabung) : '—'}</td>
                    <td className="table-td"></td>
                  </tr>
                </tfoot>
              </table>
              {!gabungSyaratOk && gabungList.length > 1 && (
                <p className="text-xs text-red-600 px-3 py-2 bg-red-50">
                  Ada barang yang beda kode / nilai perolehan / tanggal perolehan — keluarkan dulu, kalau tidak angkanya tak bisa dipertanggungjawabkan.
                </p>
              )}
              <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50/60 border-t border-gray-100">
                Total nilai perolehan &amp; akumulasi TIDAK berubah — keduanya cuma pindah ke induk.
                Nilai buku hasil gabungan: <span className="font-medium">{basisGabung ? formatRupiah(totalNPGabung - totalAkumGabung) : '—'}</span>.
              </p>
            </div>
          )}

          {basisGabungLoading && <p className="mt-3 text-xs text-gray-400">Memuat akumulasi penyusutan…</p>}
          {basisGabungErr && <p className="mt-3 text-sm text-red-600">{basisGabungErr}</p>}
          {gabungSpek && indukGabung && (
            <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              Spesifikasi hasil gabungan tersusun — akan diterapkan ke induk saat Simpan.
            </p>
          )}
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-600">
              {gabungList.length} barang dipilih{indukGabung ? ` · induk: ${indukGabung.nibar || indukGabung.nama_barang || '-'}` : ' · induk belum ditunjuk'}
            </span>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={openGabungSpek} disabled={!indukGabung}>
                {gabungSpek ? '✎ Ubah Spesifikasi Hasil...' : '✎ Spesifikasi Hasil Gabungan...'}
              </button>
              <button className="btn-primary" onClick={simpan}
                disabled={saving || gabungList.length < 2 || !indukGabungId || !gabungSyaratOk || !basisGabung || !!basisGabungErr}>
                {saving ? 'Menyimpan...' : `Gabung ${gabungList.length} Barang`}
              </button>
            </div>
          </div>
        </div>
      )}

      {gabungSpekOpen && indukGabung && (
        <EditSpesifikasiModal
          title={`Spesifikasi Hasil Gabungan — ${indukGabung.nama_barang || indukGabung.nibar || 'induk'}`}
          fieldKeys={koreksiFieldKeys(indukGabung.kode)}
          storagePrefix={`draft/koreksi-gabung/${indukGabung.id}`}
          initialFields={gabungSpekInit}
          initialFoto={gabungSpekFoto}
          single
          onSave={(fields, foto) => { setGabungSpek({ fields, foto }); setGabungSpekOpen(false) }}
          onClose={() => setGabungSpekOpen(false)}
        />
      )}

      {editPecahIdx != null && indukPecah && pecahan[editPecahIdx] && (
        <EditSpesifikasiModal
          title={`Spesifikasi Pecahan #${editPecahIdx + 1}`}
          fieldKeys={pieceFieldKeys(indukPecah.kode)}
          storagePrefix={`draft/pecah-${pecahan[editPecahIdx].key}`}
          initialFields={pecahan[editPecahIdx].fields}
          initialFoto={pecahan[editPecahIdx].foto}
          single
          onSave={(fields, foto) => {
            const key = pecahan[editPecahIdx!].key
            setPecah(key, { fields, foto: foto.replace ?? pecahan[editPecahIdx!].foto })
            setEditPecahIdx(null)
          }}
          onClose={() => setEditPecahIdx(null)}
        />
      )}

      {spekModalOpen && selSpekList.length > 0 && (
        <EditSpesifikasiModal
          title={selSpekList.length === 1
            ? (selSpekList[0].nama_barang || selSpekList[0].nibar || '1 barang')
            : `${selSpekList.length} barang — ${golonganLabels[kodeLevel3(selSpekList[0].kode)] || kodeLevel3(selSpekList[0].kode)}`}
          fieldKeys={koreksiFieldKeys(selSpekList[0].kode)}
          storagePrefix={spekPrefix}
          initialFields={spekInitFields}
          initialFoto={spekInitFoto}
          single={selSpekList.length === 1}
          onSave={(fields, foto) => { setSpekEdit({ fields, foto }); setSpekModalOpen(false) }}
          onClose={() => setSpekModalOpen(false)}
        />
      )}

    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Pemecahan Barang — kartu tampil (induk retire + N pecahan) + tombol Batal
// ════════════════════════════════════════════════════════════════════════
function PemecahanCard({ j, busy, bisaBatal, onBatal }: {
  j: PemecahanJurnal; busy: boolean; bisaBatal: boolean; onBatal: () => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-gray-800">
              Pemecahan Barang · No. {j.no_sk}
              {j.dibatalkan && <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">Dibatalkan</span>}
            </p>
            <p className="text-xs text-gray-500">Tgl. {j.tanggal} · {j.periode} · {j.pecahan.length} pecahan</p>
            {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Nilai Pecahan</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.total)}</p>
            </div>
            {!j.dibatalkan && (
              <button disabled={busy || !bisaBatal} onClick={onBatal}
                title={bisaBatal ? 'Batalkan pemecahan — induk kembali aktif' : 'Tahun sudah terkunci — tidak bisa dibatalkan'}
                className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 rounded px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Membatalkan...' : 'Batal Pemecahan'}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th w-24">Peran</th>
              <th className="table-th">Kode Register / Nama Barang</th>
              <th className="table-th text-center">Jumlah</th>
              <th className="table-th text-right">Nilai Perolehan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.induk && (
              <tr className="bg-amber-50/40">
                <td className="table-td text-xs font-medium text-amber-700">Induk</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{j.induk.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{j.induk.nibar || '-'} · {j.induk.kode}</p>
                </td>
                <td className="table-td text-center text-xs">{j.induk.jumlah}</td>
                <td className="table-td text-right text-xs">{formatRupiah(j.induk.nilai)}</td>
              </tr>
            )}
            {j.pecahan.map(p => (
              <tr key={p.aset_id}>
                <td className="table-td text-xs text-gray-500">Pecahan</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{p.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{p.nibar || '-'} · {p.kode}</p>
                </td>
                <td className="table-td text-center text-xs">{p.jumlah}</td>
                <td className="table-td text-right text-xs">{formatRupiah(p.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Penggabungan Barang — kartu tampil (induk + N sumber yang dilebur) + Batal
// ════════════════════════════════════════════════════════════════════════
function PenggabunganCard({ j, busy, bisaBatal, onBatal }: {
  j: PenggabunganJurnal; busy: boolean; bisaBatal: boolean; onBatal: () => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-gray-800">
              Penggabungan Barang · No. {j.no_sk}
              {j.dibatalkan && <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">Dibatalkan</span>}
            </p>
            <p className="text-xs text-gray-500">Tgl. {j.tanggal} · {j.periode} · {j.sumber.length} barang dilebur</p>
            {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Nilai Hasil Gabungan</p>
              <p className="font-semibold text-gray-800">{formatRupiah(j.induk?.nilaiBaru || 0)}</p>
            </div>
            {!j.dibatalkan && (
              <button disabled={busy || !bisaBatal} onClick={onBatal}
                title={bisaBatal ? 'Batalkan penggabungan — barang yang dilebur kembali & induk balik ke nilai semula' : 'Tahun sudah terkunci — tidak bisa dibatalkan'}
                className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 rounded px-2.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Membatalkan...' : 'Batal Penggabungan'}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th w-24">Peran</th>
              <th className="table-th">NIBAR / Nama Barang</th>
              <th className="table-th text-right">Nilai Perolehan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {j.induk && (
              <tr className="bg-teal/5">
                <td className="table-td text-xs font-medium text-teal">Induk</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{j.induk.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{j.induk.nibar || '-'} · {j.induk.kode}</p>
                </td>
                {/* Dua angka sekaligus: yang dibaca akuntansi adalah nilai
                    BARU, tapi tanpa nilai lamanya kartu ini tak menjelaskan
                    apa-apa waktu dibaca ulang setahun kemudian. */}
                <td className="table-td text-right text-xs">
                  <p className="font-medium text-gray-800">{formatRupiah(j.induk.nilaiBaru)}</p>
                  <p className="text-gray-400 mt-0.5">semula {formatRupiah(j.induk.nilaiLama)}</p>
                </td>
              </tr>
            )}
            {j.sumber.map(s => (
              <tr key={s.aset_id}>
                <td className="table-td text-xs text-gray-500">Dilebur</td>
                <td className="table-td">
                  <p className="font-medium text-gray-800 text-xs">{s.nama_barang || '-'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{s.nibar || '-'} · {s.kode}</p>
                </td>
                <td className="table-td text-right text-xs">{formatRupiah(s.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
