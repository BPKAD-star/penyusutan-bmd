'use client'
// Reklasifikasi — 4 alasan, alur ber-SK sama seperti Penghapusan/Kapitalisasi:
//   1. Pilih SKPD.
//   2. Tambah jurnal: pilih alasan reklasifikasi, dokumen sumber, tanggal,
//      keterangan (→ jurnal_header, kategori 'reklasifikasi').
//   3. Alasan Perubahan Fungsi BMD / Kesalahan Kodefikasi: pilih SATU kode
//      tujuan dulu (berlaku utk semua barang di jurnal ini).
//   4. Centang barang → simpan sebagai baris ledger ber-header_id.
//
// 4 alasan (efek penyusutan BEDA, lihat lib/engine/penyusutan.ts):
//   - Intra→Ekstra / Ekstra→Intra komptabel: nilai penyusutan TETAP, cuma
//     aset.intra_ekstra yang di-flip. Ledger jenis: 'reklas_komptabel'.
//   - Perubahan Fungsi BMD (lintas golongan/rumpun, mis. KDP→Gedung): FRESH
//     START — penyusutan mulai dari tanggal reklas, BUKAN retroaktif. Ledger
//     jenis BARU: 'reklas_golongan'.
//   - Kesalahan Kodefikasi (tetap satu rumpun): penyusutan dihitung ULANG
//     retroaktif dari tgl_perolehan pakai masa manfaat kode tujuan. Ledger
//     jenis lama yang sudah ada: 'reklas_kode' (reuse apa adanya).
//
// Header (No dokumen/tanggal) boleh diedit selama semester sama; ledger tetap
// beku. Batal reklas SUDAH ADA (`batalReklas` di bawah: centang baris →
// `batal_reklas` append-only + kode/intra/nama dikembalikan), tunduk guard baku
// "tak boleh ada transaksi lebih baru" lewat `cekBolehBatal`. Komentar lama di
// sini masih berbunyi "belum ada mekanisme batal/reversal" sampai 2026-08-27 —
// basi, dan komentar yang bertentangan dgn kodenya lebih berbahaya daripada tak
// ada komentar sama sekali.
import { useEffect, useState, useCallback } from 'react'
import PeringatanNamaSkpd from '@/components/PeringatanNamaSkpd'
import { useNamaSkpdMap } from '@/components/useNamaSkpdMap'
import { createClient } from '@/lib/supabase/client'
import { useSeleksiBarang } from '@/shared/ui/useSeleksiBarang'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import FormShell from './FormShell'
import { DokumenBastField, DokumenLinks } from './DokumenBastField'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { cekBolehBatal, cekBolehSisip } from '@/lib/guardPembatalan'
import { koreksiFieldKeys, ASET_NUM_COLS, angkaKolomAset, type FieldKey } from '@/lib/asetFields'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import {
  ALASAN_OPT, ALASAN_LABEL, LEDGER_JENIS,
  perluKodeTujuan, targetKomptabel, filterKomptabelAwal,
  type AlasanReklas,
} from '@/lib/reklas'

// ⚠️ Daftar alasan, labelnya, & pemetaan ke jenis ledger PINDAH ke lib/reklas.ts
// (2026-09-07) begitu lembar Permendagri IV.F.2 ikut mencetak labelnya di kolom
// "Penyebab Reklasifikasi". Label yang tercetak di lembar bertanda tangan tak
// boleh punya salinan kedua yang bisa menyimpang diam-diam.
type Alasan = AlasanReklas

type Barang = {
  id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  uraian_barang?: string | null
  tgl_perolehan?: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai_perolehan: number
  intra_ekstra: string | null
  skpd_id: number | null
}
type LinePayload = {
  intra_ekstra_lama?: string; intra_ekstra?: string
  kode_lama?: string; kode_baru?: string; uraian_baru?: string
  nama_lama?: string | null; nama_baru?: string
}
// ⚠️ `dokumen_paths` menumpang payload yang SAMA dgn `kode_tujuan` — tiap
// penulis payload di berkas ini WAJIB men-spread yang lama, bukan menimpanya.
type HeaderPayload = { kode_tujuan?: string; uraian_tujuan?: string; dokumen_paths?: string[] }
type Header = {
  id: string
  no_sk: string
  tanggal: string
  periode: string
  jenis: Alasan
  keterangan: string | null
  kategori: 'reklasifikasi'
  payload: HeaderPayload | null
}
type JurnalLine = {
  trx_id: number         // id baris ledger reklas — dipakai target_trx_id saat batal
  aset_id: string
  nibar: string | null
  kode: string
  nama_barang: string | null
  merek_tipe: string | null
  jumlah: number
  satuan: string | null
  nilai: number
  tgl_perolehan: string | null
  payload: LinePayload | null
}
type Jurnal = Header & { lines: JurnalLine[]; total: number }

const HEADER_COLS = 'id,no_sk,tanggal,periode,jenis,keterangan,kategori,payload'

// Kode SEBELUM/SESUDAH reklas per baris. Untuk `reklas_komptabel` (kode tak
// berubah, cuma keranjang intra/ekstra) dua-duanya jatuh ke `l.kode` — sengaja,
// itu memang faktanya: kodenya tak pernah berbeda.
const kodeAwal = (l: JurnalLine) => l.payload?.kode_lama || l.kode
const kodeAkhir = (l: JurnalLine) => l.payload?.kode_baru || l.kode
// Nama SEBELUM reklas — kalau tak pernah diganti (kunci `nama_lama` TAK ADA di
// payload), sama dgn nama sekarang (`l.nama_barang`, yg juga jadi nilai
// "sesudah"nya sendiri di kolom Spesifikasi Nama Barang Akhir).
// ⚠️ Dicek pakai `'nama_lama' in p`, BUKAN `??` — nama lama yang TERCATAT
// `null` (barang memang belum bernama sebelum diganti) beda dari kuncinya
// yang TAK ADA (tak pernah diganti sama sekali); `??` menyamakan keduanya dan
// diam-diam menampilkan nama SESUDAH sbg "sebelum" utk kasus pertama.
const namaAwal = (l: JurnalLine): string | null => {
  const p = l.payload || {}
  return 'nama_lama' in p ? (p.nama_lama ?? null) : l.nama_barang
}
// Perubahan komptabel (Intra↔Ekstra) — satu-satunya info yg HILANG kalau cuma
// mengandalkan kode awal/akhir, karena utk alasan ini kodenya memang sama.
// Ditampilkan sbg baris tambahan di sel Kode Akhir, bukan dibuang.
const perubahanKomptabel = (l: JurnalLine): string | null => {
  const p = l.payload || {}
  return p.intra_ekstra ? `${(p.intra_ekstra_lama || '-').toUpperCase()} → ${p.intra_ekstra.toUpperCase()}` : null
}

export default function Reklasifikasi() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()

  // Peta nama SKPD — SATU sumber, lewat `paginate` (lib/namaSkpd.ts).
  // ⚠️ `errSkpd` WAJIB ditampilkan: sebelum 2026-09-16 loop di sini
  // menelan `error`, jadi query gagal = peta kosong = kolom SKPD tampil
  // "-" di tiap baris, terbaca operator sbg "barang ini tak bertuan".
  const { daftar: skpdList, err: errSkpd } = useNamaSkpdMap()
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingJurnal, setLoadingJurnal] = useState(false)
  // Uraian baku (kodefikasi TERKINI) per kode — dipakai utk kode AWAL & AKHIR
  // sekaligus, dgn satu lookup. Pola sama dgn Daftar Barang/Penyusutan: ikut
  // kodefikasi terkini, BUKAN `aset.uraian_barang` yg basi sesudah reklas
  // (`insertLines` di bawah cuma menulis ulang `kode`, bukan `uraian_barang`).
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<Header | null>(null)
  const [msg, setMsg] = useState('')

  // Batal reklas — pilih baris (per trx_id), lalu batalkan.
  const [selBatal, setSelBatal] = useState<Record<number, boolean>>({})
  const [batalling, setBatalling] = useState(false)

  // ✎ Spesifikasi per baris reklas — pop-up LANGSUNG, tanpa jurnal baru.
  const [spekBusy, setSpekBusy] = useState<string | null>(null)
  const [spekEdit, setSpekEdit] = useState<{
    asetId: string; nama: string; keys: FieldKey[]
    initFields: Record<string, string>; initFoto: string[]
  } | null>(null)
  const [spekSaving, setSpekSaving] = useState(false)

  // Melengkapi/memperbaiki spesifikasi barang yang BARU DIREKLAS — pop-up
  // LANGSUNG, TANPA jurnal baru. Pola & alasan PERSIS "✎ Spesifikasi" pecahan
  // di menu Koreksi (2026-09-10, lihat komentarnya di sana): reklas tak
  // mengubah nilai/penyusutan/pemilik, cuma kode & (opsional) nama — jadi
  // melengkapi spesifikasi barangnya UPDATE biasa ke `aset`, bukan peristiwa
  // akuntansi baru. Dua keuntungan yang sama: (1) tak melahirkan kartu Koreksi
  // kedua yang harus ditelusuri terpisah; (2) **Batal Reklas tetap hidup** —
  // `cekBolehBatal` memblokir kalau aset itu punya transaksi LEBIH BARU, dan
  // menulis `koreksi_spesifikasi` akan mengunci tombol Batal Reklas SELAMANYA
  // begitu satu barang dilengkapi lewat jalur ber-ledger.
  //
  // ⚠️ PENGECUALIAN — barang yang SUDAH pernah kena `koreksi_spesifikasi`/
  // `batal_koreksi_spesifikasi` tetap diarahkan ke menu Koreksi, bukan
  // dipopup di sini: UPDATE senyap di situ berbahaya — tombol Batal koreksi
  // lamanya me-restore ke `payload.prev` yang direkam SEBELUM update ini,
  // jadi perubahan ini hilang tanpa satu pun jejak. Bahaya yang PERSIS SAMA
  // yang mengunci pintu Saldo Awal (CLAUDE.md).
  //
  // Field-nya dipilih dari `l.kode` — kode SEKARANG (sudah = kode_baru untuk
  // baris reklas kode/golongan), karena spesifikasi yang relevan memang milik
  // golongan HASIL reklas, bukan golongan asalnya.
  async function bukaSpekReklas(l: JurnalLine) {
    setMsg(''); setSpekBusy(l.aset_id)
    try {
      // `error` DIPERIKSA — kalau query ini gagal dan kita anggap "belum
      // pernah dikoreksi", kita justru mengambil jalur yang berbahaya itu
      // diam-diam.
      const { data: kor, error: korErr } = await supabase.from('transaksi_bmd')
        .select('id').eq('aset_id', l.aset_id)
        .in('jenis', ['koreksi_spesifikasi', 'batal_koreksi_spesifikasi']).limit(1)
      if (korErr) { await konfirmasiGagal(konfirmasi, `Gagal memeriksa riwayat koreksi barang ini — ${korErr.message}`); return }
      if (kor && kor.length > 0) {
        setMsg('Barang ini sudah pernah dikoreksi spesifikasi lewat jurnal — lengkapi lewat Pembukuan > Koreksi > Spesifikasi Barang (bukan dari sini), supaya tombol Batal koreksi lamanya tetap nyambung.')
        return
      }
      const keys = koreksiFieldKeys(l.kode)
      const { data: row, error: rowErr } = await supabase.from('aset')
        .select([...keys, 'foto_paths'].join(',')).eq('id', l.aset_id).single()
      if (rowErr) { await konfirmasiGagal(konfirmasi, `Gagal memuat spesifikasi — ${rowErr.message}`); return }
      const r = (row || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = r[k]; if (v != null) f[k] = String(v) }
      setSpekEdit({
        asetId: l.aset_id, nama: l.nama_barang || l.nibar || 'Barang',
        keys, initFields: f,
        initFoto: Array.isArray(r.foto_paths) ? (r.foto_paths as string[]) : [],
      })
    } finally {
      setSpekBusy(null)
    }
  }

  // Simpan spesifikasi hasil reklas — UPDATE `aset` saja, NOL baris ledger.
  // `single: true` di modalnya berarti REPLACE penuh: field yang dikosongkan
  // operator memang dimaksudkan jadi kosong, jadi ditulis `null`.
  async function simpanSpekReklas(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    if (!spekEdit) return
    setSpekSaving(true)
    const patch: Record<string, unknown> = {}
    for (const k of spekEdit.keys) {
      const v = fields[k]
      // ⚠️ `angkaKolomAset`, BUKAN parser rupiah: kolom numeriknya memuat
      // latitude/longitude yang boleh NEGATIF & luas yang berdesimal
      // (insiden 20260820_04). Yang tak terbaca sbg angka → null, bukan 0.
      patch[k] = v == null || v === '' ? null : (ASET_NUM_COLS.has(k) ? angkaKolomAset(v) : v)
    }
    if (foto.replace) patch.foto_paths = foto.replace
    const { error } = await supabase.from('aset').update(patch).eq('id', spekEdit.asetId)
    setSpekSaving(false)
    if (error) { await konfirmasiGagal(konfirmasi, `Gagal menyimpan spesifikasi — ${error.message}`); return }
    setSpekEdit(null)
    setMsg('Spesifikasi barang diperbarui — tanpa jurnal baru, Batal Reklas tetap bisa dipakai.')
    loadJurnals(skpd)
  }

  // Balikkan reklas terpilih ke posisi semula: guard (tak boleh ada transaksi
  // lebih baru) → insert batal_reklas (append-only) + kembalikan kode/intra/nama
  // aset ke nilai lama. Engine mengabaikan reklas via target_trx_id saat replay.
  async function batalReklas(j: Jurnal, lines: JurnalLine[]) {
    if (lines.length === 0) { setMsg('Centang minimal satu baris untuk dibatalkan.'); return }
    if (!(await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan reklasifikasi barang terpilih?',
      subjudul: `No. ${j.no_sk}`,
      rincian: [{ label: 'Baris dicentang', nilai: `${lines.length} barang` }],
      isi: <>Barang kembali ke <b>kode &amp; posisi semula</b>. Reklasnya tidak dihapus dari ledger —
        engine yang mengabaikannya saat menghitung ulang.</>,
      peringatan: <>Angka penyusutan belum ikut berubah sampai <b>Engine dijalankan lagi</b> untuk
        periode itu. Ditolak kalau ada barang yang sudah punya transaksi lebih baru.</>,
      labelYa: `Ya, batalkan ${lines.length} barang`,
    })).ya) return
    setBatalling(true); setMsg('')
    // Guard rantai (rules.md §1.3) — SATU sumber di lib/guardPembatalan.ts,
    // dipakai bersama seluruh menu batal. Versi lama di sini menulis
    // `const { count } = await …` lalu `(count || 0) > 0`: query yang gagal
    // membuat `count` undefined sehingga guard-nya LOLOS diam-diam. Sekarang
    // gagal-memeriksa berarti tidak-boleh.
    const guard = await cekBolehBatal(
      supabase,
      lines.map(l => ({ aset_id: l.aset_id, trx_id: l.trx_id, label: l.nama_barang || l.nibar })),
      'reklas ini',
    )
    if (!guard.boleh) { setBatalling(false); await konfirmasiGagal(konfirmasi, guard.pesan, 'Belum bisa dibatalkan'); return }
    const today = new Date().toISOString().slice(0, 10)
    const periode = periodeDariTanggal(today)
    const trxRows = lines.map(l => ({
      aset_id: l.aset_id, jenis: 'batal_reklas', periode, tanggal: today, nilai: 0, header_id: j.id,
      payload: { target_trx_id: l.trx_id, kode_dikembalikan: l.payload?.kode_lama || null,
        intra_dikembalikan: l.payload?.intra_ekstra_lama || null },
      keterangan: `Batal reklas (${ALASAN_LABEL[j.jenis]})`,
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows as never)
    if (error) { setBatalling(false); await konfirmasiGagal(konfirmasi, `Gagal mencatat pembatalan: ${error.message}`); return }
    // Kembalikan aset ke nilai lama, per baris.
    for (const l of lines) {
      const p = l.payload || {}
      const patch: Record<string, unknown> = {}
      if (p.kode_lama) patch.kode = p.kode_lama                      // reklas kode/golongan
      if (p.intra_ekstra_lama) patch.intra_ekstra = p.intra_ekstra_lama // reklas komptabel
      if (p.nama_baru && p.nama_lama) patch.nama_barang = p.nama_lama // nama juga dikembalikan (kalau tadi diedit)
      if (Object.keys(patch).length === 0) continue
      const { error: e2 } = await supabase.from('aset').update(patch).eq('id', l.aset_id)
      if (e2) {
        setBatalling(false); loadJurnals(skpd)
        await konfirmasiGagal(konfirmasi, `Pembatalan tercatat, tapi kembalikan aset "${l.nama_barang || l.nibar}" gagal: ${e2.message}`)
        return
      }
    }
    setBatalling(false)
    setSelBatal({})
    setMsg(`${lines.length} reklasifikasi dibatalkan — barang kembali ke posisi semula. Jalankan Engine (Penyusutan) untuk menghitung ulang.`)
    loadJurnals(skpd)
  }

  useEffect(() => {
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
    if (!skpdId) { setJurnals([]); return }
    setLoadingJurnal(true)

    const { data: headers } = await supabase.from('jurnal_header')
      .select(HEADER_COLS)
      .eq('kategori', 'reklasifikasi')
      .eq('skpd_id', Number(skpdId))
      .order('tanggal', { ascending: false })
    const hs = (headers || []) as unknown as Header[]

    const jmap = new Map<string, Jurnal>()
    for (const h of hs) jmap.set(h.id, { ...h, lines: [], total: 0 })

    const headerIds = hs.map(h => h.id)
    if (headerIds.length > 0) {
      // Baris batal_reklas → kumpulkan target_trx_id yg sudah dibatalkan.
      const { data: batalRows } = await supabase.from('transaksi_bmd')
        .select('payload').eq('jenis', 'batal_reklas' as never).in('header_id', headerIds)
      const dibatalkan = new Set<number>()
      for (const b of (batalRows || []) as { payload: { target_trx_id?: number } | null }[]) {
        const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) dibatalkan.add(t)
      }

      const { data } = await supabase.from('transaksi_bmd')
        .select('id,header_id,nilai,payload,aset:aset_id(id,nibar,nama_barang,kode,merek_tipe,jumlah,satuan,tgl_perolehan)')
        .in('jenis', ['reklas_kode', 'reklas_komptabel', 'reklas_golongan'] as never)
        .in('header_id', headerIds)
        .order('id', { ascending: true })
      const rows = (data || []) as unknown as {
        id: number; header_id: string; nilai: number; payload: LinePayload | null
        aset: Barang | null
      }[]
      for (const r of rows) {
        if (!r.aset || dibatalkan.has(r.id)) continue // baris yg dibatalkan → sembunyikan
        const j = jmap.get(r.header_id)
        if (!j) continue
        j.lines.push({
          trx_id: r.id, aset_id: r.aset.id, nibar: r.aset.nibar, kode: r.aset.kode, nama_barang: r.aset.nama_barang,
          merek_tipe: r.aset.merek_tipe, jumlah: r.aset.jumlah, satuan: r.aset.satuan, nilai: r.nilai,
          tgl_perolehan: r.aset.tgl_perolehan ?? null,
          payload: r.payload,
        })
        j.total += r.nilai
      }
    }
    // Jurnal yg SEMUA barisnya dibatalkan → lines kosong → otomatis tersembunyi.
    const hasil = [...jmap.values()].filter(j => j.lines.length > 0)
    setJurnals(hasil)

    // Uraian baku (kodefikasi TERKINI) utk kode AWAL & AKHIR sekaligus — satu
    // lookup, dedup. Gagalnya cuma menurunkan kolom Uraian ke "-" (dilaporkan
    // lewat `msg`), TIDAK menjatuhkan tabelnya — uraian di sini hiasan
    // identitas, bukan angka yang dihitung.
    const kodeSet = new Set<string>()
    for (const j of hasil) for (const l of j.lines) { kodeSet.add(kodeAwal(l)); kodeSet.add(kodeAkhir(l)) }
    if (kodeSet.size > 0) {
      try {
        const uniq = [...kodeSet]
        const map: Record<string, string> = {}
        for (let i = 0; i < uniq.length; i += 200) {
          const { data: kf, error: kfErr } = await supabase.from('admin_kodefikasi_bmd')
            .select('kode,uraian').in('kode', uniq.slice(i, i + 200))
          if (kfErr) throw new Error(kfErr.message)
          for (const r of kf || []) if (r.uraian) map[r.kode] = r.uraian
        }
        setUraianMap(map)
      } catch (e) {
        setUraianMap({})
        setMsg(`Uraian barang gagal dimuat: ${e instanceof Error ? e.message : String(e)} — kolom Uraian tampil "-".`)
      }
    } else {
      setUraianMap({})
    }
    setLoadingJurnal(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Reklasifikasi" msg={msg}
      deskripsi="Pilih SKPD, buat jurnal (pilih alasan reklasifikasi + dokumen sumber), lalu centang barang.">
      <PeringatanNamaSkpd err={errSkpd} />
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih SKPD di atas untuk melihat &amp; membuat jurnal reklasifikasi.
        </div>
      ) : mode === 'tambah' ? (
        <ReklasForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={null}
          onCancel={() => setMode('list')}
          onSaved={n => { setMode('list'); setMsg(`Jurnal tersimpan — ${n} barang direklasifikasi.`); loadJurnals(skpd) }}
        />
      ) : addTo ? (
        <ReklasForm
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={n => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} jurnal</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>

          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada reklasifikasi untuk SKPD ini.</div>
          ) : jurnals.map(j => {
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
                    <p className="font-semibold text-gray-800">No. Dokumen: {j.no_sk}</p>
                    <p className="text-xs text-gray-500">
                      {ALASAN_LABEL[j.jenis]}
                      {j.payload?.kode_tujuan && ` → ${j.payload.kode_tujuan}${j.payload.uraian_tujuan ? ' — ' + j.payload.uraian_tujuan : ''}`}
                      {' · '}Tgl. {j.tanggal} · {j.periode}
                    </p>
                    {j.keterangan && <p className="text-xs text-gray-500">Keterangan: {j.keterangan}</p>}
                    <DokumenLinks paths={j.payload?.dokumen_paths || []} label="Dokumen Sumber" />
                    {(j.payload?.dokumen_paths?.length || 0) === 0 && (
                      <p className="text-xs text-amber-600">⚠ Belum ada dokumen sumber — lengkapi lewat ✎.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total Nilai</p>
                      <p className="font-semibold text-gray-800">{formatRupiah2(j.total)}</p>
                    </div>
                    {selLines.length > 0 && (
                      <button title="Batalkan reklas baris terpilih (kembali ke posisi semula)"
                        onClick={() => batalReklas(j, selLines)} disabled={batalling}
                        className="btn-secondary text-xs text-red-600 border-red-200 hover:bg-red-50">
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
                      <th className="table-th w-10 text-center"><input type="checkbox" checked={allSel} onChange={toggleAllJ} title="Pilih semua (untuk batal)" /></th>
                      <th className="table-th">Kode Barang Awal / Uraian Barang Awal</th>
                      <th className="table-th">Nama Barang / NIBAR</th>
                      <th className="table-th">Kode Barang Akhir / Uraian Barang Akhir</th>
                      <th className="table-th">Spesifikasi Nama Barang Akhir</th>
                      <th className="table-th">Tgl Perolehan</th>
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th">Satuan</th>
                      <th className="table-th text-right">Nilai</th>
                      <th className="table-th text-center w-28">Spesifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {j.lines.map(l => {
                      const kAwal = kodeAwal(l)
                      const kAkhir = kodeAkhir(l)
                      const komptabel = perubahanKomptabel(l)
                      return (
                      <tr key={l.aset_id} className={selBatal[l.trx_id] ? 'bg-red-50/50' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!selBatal[l.trx_id]}
                            onChange={() => setSelBatal(prev => { const n = { ...prev }; if (n[l.trx_id]) delete n[l.trx_id]; else n[l.trx_id] = true; return n })} />
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{kAwal}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{uraianMap[kAwal] || '-'}</p>
                        </td>
                        <td className="table-td">
                          <p className="text-gray-700 text-xs">{namaAwal(l) || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{l.nibar || '-'}</p>
                        </td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{kAkhir}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{uraianMap[kAkhir] || '-'}</p>
                          {komptabel && <p className="text-[11px] text-amber-600 mt-0.5">{komptabel}</p>}
                        </td>
                        <td className="table-td text-xs text-gray-600">{l.nama_barang || '-'}</td>
                        <td className="table-td text-xs text-gray-600 whitespace-nowrap">{l.tgl_perolehan || '-'}</td>
                        <td className="table-td text-center text-xs">{l.jumlah}</td>
                        <td className="table-td text-xs text-gray-600">{l.satuan || '-'}</td>
                        <td className="table-td text-right text-xs">{formatRupiah2(l.nilai)}</td>
                        <td className="table-td text-center">
                          <button type="button" disabled={spekBusy != null} onClick={() => bukaSpekReklas(l)}
                            title="Lengkapi/perbaiki spesifikasi barang ini — pop-up langsung, tanpa jurnal baru"
                            className="text-xs text-teal hover:underline disabled:opacity-40 disabled:no-underline">
                            {spekBusy === l.aset_id ? 'Membuka...' : '✎ Spesifikasi'}
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-2.5 text-xs text-gray-500 bg-gray-50/60 border-t border-gray-100">
                Ada spesifikasi yang kurang/keliru sesudah reklas? Klik <span className="font-medium">✎ Spesifikasi</span> di
                barisnya — langsung pop-up, <span className="font-medium">tanpa jurnal baru</span>. Ini melengkapi entri
                reklas yang sama (nilai &amp; penyusutan tak bergerak), jadi <span className="font-medium">Batal Reklas tetap
                bisa dipakai</span>.
              </p>
            </div>
            )
          })}
        </div>
      )}

      {editing && (
        <EditHeaderModal header={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Header jurnal diperbarui.'); loadJurnals(skpd) }}
        />
      )}

      {/* Pop-up ✎ Spesifikasi — POPUP YANG SAMA dgn pengisian spesifikasi
          barang di menu lain (Pengadaan, Koreksi pecahan), jadi operator tak
          berpindah alur. `single` supaya field & foto REPLACE penuh. */}
      {spekEdit && (
        <EditSpesifikasiModal
          title={`Spesifikasi — ${spekEdit.nama}`}
          fieldKeys={spekEdit.keys}
          storagePrefix={`draft/reklas-spek/${spekEdit.asetId}`}
          initialFields={spekEdit.initFields}
          initialFoto={spekEdit.initFoto}
          single
          onSave={simpanSpekReklas}
          onClose={() => { if (!spekSaving) setSpekEdit(null) }}
        />
      )}
    </FormShell>
  )
}

// ── Modal edit header: No dokumen + tanggal (kunci semester sama) + keterangan ──
function EditHeaderModal({ header, onClose, onSaved }: {
  header: Header; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const dateBounds = useDateBounds()
  const [noSk, setNoSk] = useState(header.no_sk)
  const [tgl, setTgl] = useState(header.tanggal)
  const [ket, setKet] = useState(header.keterangan || '')
  const [dokPaths, setDokPaths] = useState<string[]>(header.payload?.dokumen_paths || [])
  const [dokUploading, setDokUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const tglPeriode = periodeDariTanggal(tgl)
  const pindahSemester = tglPeriode !== header.periode

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `reklasifikasi/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { await konfirmasiGagal(konfirmasi, `Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noSk.trim()) { setErr('No. dokumen wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & entry ulang.`)
      return
    }
    setErr(''); setSaving(true)
    // ⚠️ payload di-SPREAD: `kode_tujuan`/`uraian_tujuan` tinggal di objek yang
    // sama, dan menimpanya bikin reklas golongan/kode kehilangan kode tujuannya.
    const { error } = await supabase.from('jurnal_header')
      .update({
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        payload: { ...(header.payload || {}), dokumen_paths: dokPaths },
      })
      .eq('id', header.id)
    setSaving(false)
    if (error) { await konfirmasiGagal(konfirmasi, `Gagal menyimpan: ${error.message}`); return }
    onSaved()
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
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen Sumber</label>
            <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal <span className="text-gray-400">(harus tetap di {header.periode})</span></label>
            <input type="date" className="select-filter w-full" max={dateBounds.max} value={tgl} onChange={e => setTgl(e.target.value)} />
            {pindahSemester && (
              <p className="text-xs text-red-600 mt-1">
                Tanggal ini masuk {tglPeriode} — di luar semester jurnal. Ganti tanggal, atau batalkan &amp; entry ulang.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {/* Di sini dokumen TIDAK memblokir Simpan — kartu reklas sudah punya
              baris ledger sejak detik ia dibuat, jadi menahan perbaikan salah
              ketik No. Dokumen sampai berkasnya dipindai tak membatalkan apa
              pun. Jendela ini justru melayani kartu lama yang lahir sebelum
              aturan ini ada. Sama sikapnya dgn menu Koreksi. */}
          <DokumenBastField paths={dokPaths} uploading={dokUploading} onUpload={uploadDokumen} onHapus={hapusDokumen}
            judul="Dokumen Sumber Reklasifikasi" labelTombol="Upload Dokumen Sumber"
            hint="foto / PDF, bisa lebih dari satu"
            kosongText="Belum ada dokumen — kartu ini dibuat sebelum berkas diwajibkan; lengkapi di sini." />
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

// ── Sub-view: dokumen → pilih barang → reklas jadi apa → nama barang ────────
// Urutan SENGAJA: barang dulu BARU target ("barang INI jadi INI"), lalu nama.
function ReklasForm({ skpdId, skpdNama, golonganLabels, header, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null; onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const dateBounds = useDateBounds()

  const [alasan, setAlasan] = useState<Alasan>(header?.jenis || 'komptabel_ke_ekstra')
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  // Dokumen sumber — WAJIB sejak 2026-09-07. Komentar kepala berkas ini sudah
  // menyebut "dokumen sumber" sejak awal, tapi yang ada cuma NOMOR-nya; berkasnya
  // sendiri tak pernah bisa diunggah.
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)

  // Kode tujuan (kasus golongan/kode) — dari header kalau tambah barang.
  const [kodeTujuan, setKodeTujuan] = useState<KodefikasiHasil | null>(
    header?.payload?.kode_tujuan
      ? { kode: header.payload.kode_tujuan, uraian: header.payload.uraian_tujuan || '',
          nama_objek: null, nama_rincian: null, nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null }
      : null
  )

  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  // Edit nama barang — per-barang, opt-in (centang dulu baru muncul field).
  const [editNama, setEditNama] = useState<Record<string, boolean>>({})
  const [namaBaru, setNamaBaru] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const butuhKodeTujuan = perluKodeTujuan(alasan)
  const filterAwal = filterKomptabelAwal(alasan)
  const targetKode = header?.payload?.kode_tujuan || kodeTujuan?.kode || null

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,uraian_barang,tgl_perolehan,merek_tipe,jumlah,satuan,nilai_perolehan,intra_ekstra,skpd_id')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    if (filterAwal) q = q.eq('intra_ekstra', filterAwal)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows((data as unknown as Barang[]) || [])
    setLoaded(true)
    setLoading(false)
  }

  // Validasi barang vs target — 'golongan' butuh rumpun BEDA, 'kode' butuh rumpun SAMA.
  // Dipanggil SETELAH target dipilih (sebelum itu return null → semua boleh dicentang).
  function invalidReason(b: Barang): string | null {
    if (!butuhKodeTujuan || !targetKode) return null
    const samaRumpun = kodeLevel3(b.kode) === kodeLevel3(targetKode)
    if (b.kode === targetKode) return 'Sudah kode ini'
    if (alasan === 'golongan' && samaRumpun) return 'Masih satu rumpun — pakai alasan Kesalahan Kodefikasi'
    if (alasan === 'kode' && !samaRumpun) return 'Beda rumpun — pakai alasan Perubahan Fungsi BMD'
    return null
  }

  // Mesin centang bersama (shared/ui/useSeleksiBarang.ts) — kemunculan kelima
  // bentuk yang sama; diangkat 2026-09-16. Menu ini satu-satunya yang memakai
  // predikat `bolehPilih`: barang yang tak cocok dengan golongan/kode tujuan
  // tak boleh ikut tercentang. MEMBUANG centang tetap selalu boleh — target
  // bisa diganti SESUDAH barang tercentang, dan centang yang tak bisa dilepas
  // akan mengunci operator.
  const { sel, setSel, selList, allSelected, toggle, toggleAll } =
    useSeleksiBarang<Barang>(rows, b => !invalidReason(b))

  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)
  const invalidSel = selList.filter(b => invalidReason(b))
  // Kesalahan Kodefikasi = tetap satu jenis BMD → kunci Jenis BMD picker ke
  // golongan barang terpilih (tak bisa keluar jenis). Perubahan Fungsi = bebas.
  const lockGolongan = alasan === 'kode' && selList.length > 0 ? kodeLevel3(selList[0].kode) : undefined

  async function insertLines(h: Header): Promise<string | null> {
    const jenisLedger = LEDGER_JENIS[h.jenis]
    const namaEdited = (b: Barang) =>
      editNama[b.id] && namaBaru[b.id]?.trim() && namaBaru[b.id].trim() !== (b.nama_barang || '')
    const trxRows = selList.map(b => ({
      aset_id: b.id, jenis: jenisLedger, periode: h.periode, tanggal: h.tanggal, nilai: b.nilai_perolehan,
      header_id: h.id,
      payload: butuhKodeTujuan
        ? { kode_lama: b.kode, kode_baru: h.payload?.kode_tujuan, uraian_baru: h.payload?.uraian_tujuan,
            ...(namaEdited(b) ? { nama_lama: b.nama_barang, nama_baru: namaBaru[b.id].trim() } : {}) }
        : { intra_ekstra_lama: b.intra_ekstra, intra_ekstra: targetKomptabel(h.jenis),
            ...(namaEdited(b) ? { nama_lama: b.nama_barang, nama_baru: namaBaru[b.id].trim() } : {}) },
    }))
    const { error } = await supabase.from('transaksi_bmd').insert(trxRows)
    if (error) return `Gagal mencatat transaksi: ${error.message}`
    // Update kode / intra sekaligus utk semua barang terpilih.
    const patch = butuhKodeTujuan
      ? { kode: h.payload?.kode_tujuan }
      : { intra_ekstra: targetKomptabel(h.jenis) }
    const { error: e2 } = await supabase.from('aset').update(patch).in('id', selList.map(b => b.id))
    if (e2) return `Transaksi tercatat, tapi update aset gagal: ${e2.message}`
    // Update nama_barang per-barang (hanya yang di-edit) — bukan ledger, kolom biasa.
    for (const b of selList) {
      if (!namaEdited(b)) continue
      const { error: e3 } = await supabase.from('aset').update({ nama_barang: namaBaru[b.id].trim() }).eq('id', b.id)
      if (e3) return `Kode ter-update, tapi ganti nama "${b.nama_barang || b.nibar}" gagal: ${e3.message}`
    }
    return null
  }

  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `reklasifikasi/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { await konfirmasiGagal(konfirmasi, `Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    if (butuhKodeTujuan && !header && !kodeTujuan) { setErr('Pilih kode tujuan (reklas jadi apa) dulu.'); return }
    if (invalidSel.length > 0) { setErr(`${invalidSel.length} barang terpilih tidak cocok dengan kode tujuan — buang centangnya dulu.`); return }
    setErr(''); setSaving(true)

    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noSk.trim()) { setErr('No. dokumen sumber wajib diisi.'); setSaving(false); return }
      // Penjaga SESUNGGUHNYA, bukan cuma gate tampilan `perluDokumenDulu`.
      if (dokPaths.length === 0) { setErr('Dokumen sumber reklasifikasi wajib diunggah.'); setSaving(false); return }
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'reklasifikasi', jenis: alasan,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        payload: {
          dokumen_paths: dokPaths,
          ...(butuhKodeTujuan ? { kode_tujuan: kodeTujuan!.kode, uraian_tujuan: kodeTujuan!.uraian } : {}),
        },
      }).select(HEADER_COLS).single()
      if (error || !data) { setSaving(false); await konfirmasiGagal(konfirmasi, `Gagal membuat header jurnal: ${error?.message}`); return }
      h = data as unknown as Header
    }

    // Guard arah MAJU (2026-09-18, pola cekBolehSisip Kapitalisasi/Pengalihan):
    // tanggal dokumen ini bebas dipilih dalam tahun buku terbuka, jadi bisa
    // mundur ke periode yang aset-nya SUDAH punya transaksi lain (mis. sudah
    // dipindah SKPD atau dikapitalisasi sesudahnya) — menyisipkannya di tengah
    // rantai merusak replay penyusutan tanpa satu pun error. Berlaku baik untuk
    // jurnal baru maupun "Tambah Barang" ke jurnal yang sudah ada, karena
    // keduanya sama-sama menulis baris ledger baru bertanggal `h.tanggal`.
    const guardSisip = await cekBolehSisip(supabase,
      selList.map(b => ({ aset_id: b.id, label: b.nama_barang || b.nibar })),
      h.tanggal, 'reklasifikasi ini')
    if (!guardSisip.boleh) {
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setSaving(false)
      await konfirmasiGagal(konfirmasi, guardSisip.pesan, 'Belum bisa disimpan')
      return
    }

    const e = await insertLines(h)
    if (e) {
      if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
      setSaving(false)
      await konfirmasiGagal(konfirmasi, e)
      return
    }
    setSaving(false)
    onSaved(selList.length)
  }

  const perluDokumenDulu = !header && dokPaths.length === 0

  return (
    <div className="space-y-4">
      {/* 1. Dokumen sumber (alasan + no/tgl/ket). Kalau tambah ke jurnal ada → ringkasan. */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {header ? `Tambah Barang — ${header.no_sk}` : `Jurnal Baru — ${skpdNama}`}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>

        {header ? (
          <p className="text-sm text-gray-500">
            {ALASAN_LABEL[header.jenis]}
            {header.payload?.kode_tujuan && ` → ${header.payload.kode_tujuan}${header.payload.uraian_tujuan ? ' — ' + header.payload.uraian_tujuan : ''}`}
            {' · '}Tgl. {header.tanggal} · {header.periode}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alasan Reklasifikasi</label>
              <div className="space-y-2">
                {ALASAN_OPT.map(o => (
                  <label key={o.value} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                    alasan === o.value ? 'border-teal bg-teal/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="radio" className="mt-0.5" checked={alasan === o.value}
                      onChange={() => { setAlasan(o.value); setKodeTujuan(null); setSel({}); setEditNama({}); setNamaBaru({}) }} />
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
                <label className="block text-xs text-gray-500 mb-1">No. Dokumen Sumber</label>
                <input className="select-filter w-full" value={noSk} onChange={e => setNoSk(e.target.value)} placeholder="mis. 100.3.3.2/74/418.08/2024" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
                <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
                  value={tgl} onChange={e => setTgl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Periode: {periodeDariTanggal(tgl)}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
                <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)}
                  placeholder="mis. KDP selesai dibangun, serah terima gedung" />
              </div>
              {/* Wajib & DIGATE — pola yang sama dgn Penghapusan, Koreksi, &
                  Pengeluaran Internal. Reklasifikasi memindahkan barang antar
                  golongan neraca (mis. KDP → Gedung) & bisa me-reset jadwal
                  penyusutannya; itu peristiwa yang paling sering ditanya
                  pemeriksa "dasarnya apa?". */}
              <div className="sm:col-span-2">
                <DokumenBastField paths={dokPaths} uploading={dokUploading} onUpload={uploadDokumen} onHapus={hapusDokumen}
                  judul="Dokumen Sumber Reklasifikasi" labelTombol="Upload Dokumen Sumber"
                  hint="wajib sebelum barang bisa dipilih di bawah (foto / PDF, bisa lebih dari satu)"
                  kosongText="Belum ada dokumen — upload dulu sebelum bisa memilih barang di bawah." />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Pilih barang yang mau direklas — DIGATE sampai dokumennya ada.
             Nambah barang ke jurnal yang sudah ada tak digate: dokumennya sudah
             diperiksa waktu kartunya dibuat. */}
      {perluDokumenDulu ? (
        <div className="card p-10 text-center text-amber-600 text-sm">
          ⚠ Upload Dokumen Sumber Reklasifikasi dulu di atas — barang baru bisa dipilih sesudah dokumennya ada.
        </div>
      ) : (
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Pilih Barang yang Mau Direklas</h2>
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
            <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
        </div>

        {!loaded ? (
          <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan (kosongkan filter = semua barang di SKPD ini).</div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="table-th w-10 text-center">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    </th>
                    <th className="table-th">Barang</th>
                    <th className="table-th">Komptabel</th>
                    <th className="table-th">Tgl Perolehan</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                  ) : rows.map(b => {
                    const invalid = invalidReason(b)
                    return (
                      <tr key={b.id} className={invalid ? 'opacity-40' : sel[b.id] ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center">
                          <input type="checkbox" checked={!!sel[b.id]} disabled={!!invalid && !sel[b.id]} onChange={() => toggle(b)} />
                        </td>
                        <td className="table-td">
                          <p className="text-xs text-gray-500">{b.kode}</p>
                          <p className="text-xs text-gray-600">{b.uraian_barang || '-'}</p>
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5">{b.nibar || '-'}</p>
                          {invalid && <p className="text-red-500 text-[11px] mt-0.5">{invalid}</p>}
                        </td>
                        <td className="table-td text-xs text-gray-600">{(b.intra_ekstra || '-').toUpperCase()}</td>
                        <td className="table-td text-xs text-gray-600">{b.tgl_perolehan || '-'}</td>
                        <td className="table-td text-right text-xs">{formatRupiah2(b.nilai_perolehan)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-3 text-sm text-gray-600">
          {selList.length} barang dipilih · <span className="font-medium">{formatRupiah2(selTotal)}</span>
        </p>
      </div>
      )}

      {/* 3. Reklas jadi apa (kode tujuan berjenjang) — muncul setelah ada barang
             dicentang (barang DULU baru target), hanya golongan/kode & jurnal baru */}
      {butuhKodeTujuan && !header && selList.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Reklas Jadi (Kode Tujuan)</h2>
          <p className="text-xs text-gray-500 mb-3">
            {alasan === 'golongan'
              ? 'Pilih kode tujuan — harus BEDA jenis BMD dari barang terpilih (lintas jenis).'
              : `Pilih kode tujuan — tetap DALAM jenis BMD yang sama${lockGolongan ? ` (${lockGolongan} — ${golonganLabels[lockGolongan] || ''})` : ''}.`}
          </p>
          <KodefikasiPicker key={lockGolongan || 'free'} picked={kodeTujuan} onPick={setKodeTujuan}
            golonganTetap={lockGolongan} detail />
          {kodeTujuan && invalidSel.length > 0 && (
            <p className="mt-2 text-sm text-red-600">
              {invalidSel.length} barang terpilih tidak cocok dengan kode tujuan ini (tanda merah di daftar barang di atas) — buang centangnya sebelum simpan.
            </p>
          )}
        </div>
      )}

      {/* 4. Nama barang — per-barang, opt-in */}
      {selList.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Nama Barang <span className="text-xs font-normal text-gray-400">(opsional)</span></h2>
          <p className="text-xs text-gray-500 mb-3">Centang barang yang namanya mau diganti sekalian. Yang tidak dicentang, namanya tetap.</p>
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-[360px] overflow-y-auto">
            {selList.map(b => (
              <div key={b.id} className="px-3 py-2.5 flex items-start gap-3">
                <input type="checkbox" className="mt-1 flex-shrink-0" checked={!!editNama[b.id]}
                  onChange={() => setEditNama(p => ({ ...p, [b.id]: !p[b.id] }))} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">{b.nibar || '-'} · {b.kode}</p>
                  {editNama[b.id] ? (
                    <input className="select-filter w-full mt-1 text-sm"
                      value={namaBaru[b.id] ?? (b.nama_barang || '')}
                      onChange={e => setNamaBaru(p => ({ ...p, [b.id]: e.target.value }))}
                      placeholder="Nama barang baru" />
                  ) : (
                    <p className="text-sm text-gray-800 truncate">{b.nama_barang || '-'}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: simpan */}
      <div className="card p-4">
        {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selList.length} barang dipilih · <span className="font-medium">{formatRupiah2(selTotal)}</span>
          </span>
          <button className="btn-primary" onClick={simpan}
            disabled={saving || selList.length === 0 || (butuhKodeTujuan && !header && !kodeTujuan) || invalidSel.length > 0}>
            {saving ? 'Menyimpan...' : header ? 'Tambah ke Jurnal' : 'Simpan Reklasifikasi'}
          </button>
        </div>
      </div>
    </div>
  )
}
