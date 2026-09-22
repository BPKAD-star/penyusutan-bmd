'use client'
// No.9: Koreksi — 2 mode terpisah:
//   - "Koreksi Transaksi" (alur ber-SK, sama pola dgn Reklasifikasi/
//     Penghapusan): pilih SKPD → tambah jurnal (No Dokumen Koreksi + tanggal
//     + keterangan) → pilih ALASAN (Nilai Perolehan / Kuantitas Bertambah —
//     DEFERRED / Pencatatan Ganda) → pilih barang.
//   - "Koreksi Spesifikasi" (alur lama, standalone single-item): DI LUAR
//     "3 sebab" yang diminta user, sengaja TIDAK ikut pola ber-SK.
import { keSen } from '@/lib/pemecahanNilai'
import PeringatanNamaSkpd from '@/components/PeringatanNamaSkpd'
import { useNamaSkpdMap } from '@/components/useNamaSkpdMap'
import { usePemecahan, newKey, TANAH_DOK_FIELDS } from './koreksi/usePemecahan'
import { usePenggabungan } from './koreksi/usePenggabungan'
import { usePencatatanGanda } from './koreksi/usePencatatanGanda'
import { useSpesifikasi } from './koreksi/useSpesifikasi'
import { usePemilihBarang } from './koreksi/usePemilihBarang'
import { useJurnalKoreksi } from './koreksi/useJurnalKoreksi'
import { useKoreksiNilai } from './koreksi/useKoreksiNilai'
import { tahunDari } from '@/lib/pencatatanGanda'
import {
  HEADER_COLS,
  type Barang, type PecahanItem, type SpekEdit, type Kandidat, type KandidatGabung,
  type Alasan, type LinePayload, type HeaderPayload, type Header, type HeaderEditable,
  type JurnalLine, type Jurnal, type PemecahanHeader, type PemecahanRow, type PemecahanJurnal,
  type PenggabunganHeader, type PenggabunganRow, type PenggabunganJurnal,
} from './koreksi/tipe'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah2 } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, perlakuanKode, parsePeriode, previousPeriode, formatPeriode, fetchBatasKapitalisasi, klasifikasiKomptabel } from '@/lib/bmd'
import { generateNibars } from '@/lib/nibar'
import { cekBolehBatal, cekBolehSisip } from '@/lib/guardPembatalan'
import { ASET_FIELD_COLS, ASET_NUM_COLS, angkaKolomAset, fieldsForKode, koreksiFieldKeys, allSameGolongan, FIELD_LABEL, type FieldKey } from '@/lib/asetFields'
import SkpdCombobox from '@/components/SkpdCombobox'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import { DokumenBastField, DokumenLinks } from './DokumenBastField'
import { useDateBounds, useTahunBukuMap } from '@/components/useTahunBuku'
import FormShell from './FormShell'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import NominalInput from '@/shared/ui/NominalInput'

// Field alasan "Spesifikasi Barang" (golongan-aware, + atribut satuan/asal usul/
// tahun/kondisi) kini tinggal di lib/asetFields.ts sbg `koreksiFieldKeys` —
// dipakai bareng Saldo Awal → Daftar Barang Awal supaya kedua pintu koreksi
// spesifikasi menawarkan field yang persis sama.

// ── Koreksi — satu alur ber-SK, 4 alasan ─────────────────────────────────────
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

// Edit spesifikasi yang disusun di popup, menunggu di-commit oleh Simpan.
// `keSen` & seluruh aritmetika pemecahan → lib/pemecahanNilai.ts (diangkat
// 2026-09-15); alasan "sen, bukan rupiah" ada di kepala berkas itu.

function pieceFieldKeys(kode: string): FieldKey[] {
  const base = fieldsForKode(kode)
  return kodeLevel3(kode) === '1.3.1' ? base.filter(k => !TANAH_DOK_FIELDS.includes(k)) : base
}
// prev = nilai field SEBELUM koreksi_spesifikasi (utk restore saat batal).
// Kolom `aset` yang dibutuhkan `Barang` — dipakai tabel pilih barang DAN saat
// menyeret satu pecahan ke tab Spesifikasi dari kartu Pemecahan.
const BARANG_COLS = 'id,nibar,kode,nama_barang,merek_tipe,jumlah,satuan,nilai_perolehan,skpd_id,tgl_perolehan,cara_perolehan,foto_paths,intra_ekstra'

function ringkasanBaris(l: JurnalLine, jenis: Alasan): string {
  const p = l.payload || {}
  if (jenis === 'spesifikasi') {
    const labels = Object.keys(p).filter(k => k !== 'foto_paths' && k !== 'prev').map(k => FIELD_LABEL[k as FieldKey] || k)
    if ('foto_paths' in p) labels.push('Foto')
    return labels.length ? `Spesifikasi diubah: ${labels.join(', ')}` : '-'
  }
  if (p.nilai_perolehan_baru != null) return `${formatRupiah2(p.nilai_lama || 0)} → ${formatRupiah2(p.nilai_perolehan_baru)}`
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
  const konfirmasi = useKonfirmasi()
  const tahunMap = useTahunBukuMap()
  // Peta nama SKPD — SATU sumber, lewat `paginate` (lib/namaSkpd.ts).
  // ⚠️ `errSkpd` WAJIB ditampilkan: sebelum 2026-09-16 loop di sini
  // menelan `error`, jadi query gagal = peta kosong = kolom SKPD tampil
  // "-" di tiap baris, terbaca operator sbg "barang ini tak bertuan".
  const { daftar: skpdList, err: errSkpd } = useNamaSkpdMap()
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [skpd, setSkpd] = useState('')

  // Pemuat ketiga bentuk kartu → ./koreksi/useJurnalKoreksi.ts (Fase 3).
  const { err: jurnalErr, jurnals, pemecahanJurnals, penggabunganJurnals, loading: loadingJurnal, load: loadJurnals } = useJurnalKoreksi()

  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [addTo, setAddTo] = useState<Header | null>(null)
  const [editing, setEditing] = useState<HeaderEditable | null>(null)
  const [batalId, setBatalId] = useState<string | null>(null)
  // "✎ Spesifikasi" di baris pecahan — CADANGAN saja: dipakai HANYA kalau
  // pecahannya sudah pernah kena koreksi_spesifikasi (lihat bukaSpekPecahan).
  const [presetSpek, setPresetSpek] = useState<{ barang: Barang; asal: string } | null>(null)
  const [presetBusy, setPresetBusy] = useState<string | null>(null)
  // Jalur UTAMA "✎ Spesifikasi" pecahan: pop-up langsung, tanpa jurnal baru.
  const [spekPecah, setSpekPecah] = useState<{
    asetId: string; nama: string; kode: string; keys: FieldKey[]
    initFields: Record<string, string>; initFoto: string[]
  } | null>(null)
  const [spekPecahSaving, setSpekPecahSaving] = useState(false)
  // Batal koreksi — pilih baris (per trx_id), lalu batalkan.
  const [selBatal, setSelBatal] = useState<Record<number, boolean>>({})
  const [batalling, setBatalling] = useState(false)
  const [msg, setMsg] = useState('')

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


  useEffect(() => { loadJurnals(skpd); setMode('list'); setAddTo(null); setEditing(null); setSelBatal({}); setPresetSpek(null) }, [skpd, loadJurnals])

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  // Koreksi spesifikasi satu pecahan yang TERLANJUR tersimpan kurang lengkap.
  // Barangnya ditarik utuh dulu (bukan dioper dari baris kartu) — `Barang` butuh
  // kolom yang tak ada di baris ledger, dan `foto_paths` yang salah bikin popup
  // spesifikasi menimpa foto barang dgn daftar kosong.
  // ✎ Spesifikasi di baris pecahan — POP-UP LANGSUNG (keputusan user 2026-09-10,
  // MENGGANTI jalur "seret ke jurnal Koreksi" 2026-09-07).
  //
  // Alasannya: melengkapi spesifikasi pecahan itu MENERUSKAN entri pemecahan yang
  // sama, bukan peristiwa akuntansi baru — nilai, penyusutan, golongan, & pemilik
  // tak bergerak sedikit pun. Jadi ia UPDATE biasa ke `aset`, pola & alasan yang
  // sama dgn Saldo Awal → Edit Spesifikasi dan KIR ("spesifikasi = data
  // deskriptif, bukan peristiwa akuntansi" — CLAUDE.md).
  //
  // Dua hal IKUT BENAR justru karena tak ada baris ledger baru:
  //   (1) tak lahir kartu Koreksi kedua yang harus ditelusuri terpisah — satu
  //       peristiwa tetap terbaca di satu kartu;
  //   (2) **Batal Pemecahan tetap hidup.** `cekBolehBatal` memblokir kalau ada
  //       transaksi LEBIH BARU di induk/pecahan, jadi jalur lama (yang menulis
  //       `koreksi_spesifikasi`) mengunci tombol Batal Pemecahan SELAMANYA
  //       begitu satu pecahan dilengkapi.
  //
  // ⚠️ PENGECUALIAN — pecahan yang SUDAH pernah kena `koreksi_spesifikasi` /
  // `batal_koreksi_spesifikasi` tetap dilempar ke menu Koreksi. Di situ UPDATE
  // senyap berbahaya: tombol Batal koreksi itu me-restore ke `payload.prev` yang
  // direkam SEBELUM update kita, jadi perubahan ini hilang tanpa satu pun jejak.
  // Bahaya yang PERSIS SAMA yang mengunci pintu Saldo Awal (CLAUDE.md).
  async function bukaSpekPecahan(p: PemecahanRow, j: PemecahanJurnal) {
    setMsg(''); setPresetBusy(p.aset_id)
    try {
      // `error` DIPERIKSA — kalau query ini gagal dan kita anggap "belum pernah
      // dikoreksi", kita justru mengambil jalur yang berbahaya itu diam-diam.
      const { data: kor, error: korErr } = await supabase.from('transaksi_bmd')
        .select('id').eq('aset_id', p.aset_id)
        .in('jenis', ['koreksi_spesifikasi', 'batal_koreksi_spesifikasi']).limit(1)
      if (korErr) { setMsg(`Error: gagal memeriksa riwayat koreksi pecahan — ${korErr.message}`); return }

      const { data, error } = await supabase.from('aset').select(BARANG_COLS).eq('id', p.aset_id).single()
      if (error || !data) { setMsg(`Error: gagal memuat barang pecahan — ${error?.message || 'tidak ditemukan'}`); return }
      const barang = data as unknown as Barang

      if (kor && kor.length > 0) {
        setPresetSpek({ barang, asal: j.no_sk })
        setAddTo(null); setMode('tambah')
        setMsg('Pecahan ini sudah pernah dikoreksi lewat jurnal — perbaikannya diteruskan ke menu Koreksi supaya tombol Batal koreksi lamanya tetap nyambung.')
        return
      }

      const keys = koreksiFieldKeys(barang.kode)
      const { data: row, error: rowErr } = await supabase.from('aset')
        .select([...keys, 'foto_paths'].join(',')).eq('id', p.aset_id).single()
      if (rowErr) { setMsg(`Error: gagal memuat spesifikasi — ${rowErr.message}`); return }
      const r = (row || {}) as Record<string, unknown>
      const f: Record<string, string> = {}
      for (const k of keys) { const v = r[k]; if (v != null) f[k] = String(v) }
      setSpekPecah({
        asetId: p.aset_id, kode: barang.kode,
        nama: barang.nama_barang || barang.nibar || 'Pecahan',
        keys, initFields: f,
        initFoto: Array.isArray(r.foto_paths) ? (r.foto_paths as string[]) : [],
      })
    } finally {
      setPresetBusy(null)
    }
  }

  // Simpan spesifikasi pecahan — UPDATE `aset` saja, NOL baris ledger.
  // `single: true` di modalnya berarti REPLACE penuh: field yang dikosongkan
  // operator memang dimaksudkan jadi kosong, jadi ditulis `null` (bukan
  // dilewati seperti mode massal).
  async function simpanSpekPecah(fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    if (!spekPecah) return
    setSpekPecahSaving(true)
    const patch: Record<string, unknown> = {}
    for (const k of spekPecah.keys) {
      const v = fields[k]
      // ⚠️ `angkaKolomAset`, BUKAN parser rupiah: kolom numeriknya memuat
      // latitude/longitude yang boleh NEGATIF & luas yang berdesimal
      // (insiden 20260820_04). Yang tak terbaca sbg angka → null, bukan 0.
      patch[k] = v == null || v === '' ? null : (ASET_NUM_COLS.has(k) ? angkaKolomAset(v) : v)
    }
    if (foto.replace) patch.foto_paths = foto.replace
    const { error } = await supabase.from('aset').update(patch).eq('id', spekPecah.asetId)
    setSpekPecahSaving(false)
    if (error) { setMsg(`Error: gagal menyimpan spesifikasi — ${error.message}`); return }
    setSpekPecah(null)
    setMsg(`Spesifikasi pecahan diperbarui — tanpa jurnal baru, Batal Pemecahan tetap bisa dipakai.`)
    loadJurnals(skpd)
  }

  // Batal Koreksi (Nilai / Spesifikasi / Pencatatan Ganda) — transaksi pembalik
  // append-only, dicatat HARI INI. Guard: barang tak boleh punya transaksi LEBIH
  // BARU setelah koreksi ini (delta nilai berantai → cuma yg terakhir yg sah
  // dibatalkan). Engine WAJIB di-run ulang setelah ini.
  async function batalKoreksi(j: Jurnal, lines: JurnalLine[]) {
    if (lines.length === 0) { setMsg('Centang minimal satu baris untuk dibatalkan.'); return }
    const label = ALASAN_LABEL[j.jenis]
    if (!(await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan koreksi barang terpilih?',
      subjudul: `${label} · No. ${j.no_sk}`,
      rincian: [{ label: 'Baris dicentang', nilai: `${lines.length} barang` }],
      isi: <>Barang kembali ke <b>keadaan sebelum koreksi</b>. Koreksinya tidak dihapus dari ledger —
        pembatalannya dicatat sebagai peristiwa baru, dan engine yang mengabaikan yang dibatalkan.</>,
      peringatan: <>Angka penyusutan belum ikut berubah sampai <b>Engine dijalankan lagi</b>. Ditolak
        kalau ada barang yang sudah punya transaksi lebih baru.</>,
      labelYa: `Ya, batalkan ${lines.length} barang`,
    })).ya) return
    setBatalling(true); setMsg('')
    // Guard rantai (rules.md §1.3) — satu sumber di lib/guardPembatalan.ts.
    const guard = await cekBolehBatal(
      supabase,
      lines.map(l => ({ aset_id: l.aset_id, trx_id: l.trx_id, label: l.nama_barang || l.nibar })),
      'koreksi ini',
    )
    if (!guard.boleh) { setMsg(guard.pesan); setBatalling(false); return }
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
    if (!(await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan pemecahan barang ini?',
      subjudul: `No. ${j.no_sk}`,
      rincian: [
        { label: 'Induk', nilai: j.induk?.nama_barang || j.induk?.nibar || '—' },
        { label: 'Pecahan dibuang', nilai: `${j.pecahan.length} barang` },
      ],
      isi: <>Barang induk <b>aktif kembali</b> dengan nilai utuhnya, dan seluruh pecahannya dibuang.</>,
      peringatan: <>Diperiksa untuk induk <b>dan tiap pecahan</b> — satu koreksi atau reklas yang
        terlanjur mendarat di salah satu pecahan sudah cukup memblokir. Jalankan <b>Engine</b> lagi
        setelah ini.</>,
      labelYa: 'Ya, batalkan pemecahan',
    })).ya) return
    // Guard rantai (rules.md §1.3): induk & TIAP pecahan diperiksa — koreksi/
    // reklas yang mendarat di salah satu pecahan pun sudah cukup memblokir.
    {
      const guard = await cekBolehBatal(
        supabase,
        [...(j.induk ? [j.induk] : []), ...j.pecahan]
          .map(r => ({ aset_id: r.aset_id, trx_id: r.trx_id, label: r.nama_barang || r.nibar })),
        'pemecahan ini',
      )
      if (!guard.boleh) { setMsg(`Error: ${guard.pesan}`); return }
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
    if (!(await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan penggabungan barang ini?',
      subjudul: `No. ${j.no_sk}`,
      rincian: [
        { label: 'Induk', nilai: j.induk?.nama_barang || j.induk?.nibar || '—' },
        { label: 'Barang sumber kembali', nilai: `${j.sumber.length} barang` },
      ],
      isi: <>Induk balik ke <b>nilai &amp; akumulasi sebelum digabung</b>, dan tiap barang sumber muncul
        serta disusutkan lagi seperti semula.</>,
      peringatan: <>Kalau prosesnya putus di tengah, yang tersisa keadaan <b>kurang-catat</b>, bukan
        dobel — tekan tombol yang sama lagi untuk menuntaskan sisanya. Jalankan <b>Engine</b> lagi
        setelah ini.</>,
      labelYa: 'Ya, batalkan penggabungan',
    })).ya) return
    // Guard rantai baku (rules.md §1.3): induk & tiap sumber diperiksa.
    {
      const guard = await cekBolehBatal(
        supabase,
        [...(j.induk ? [j.induk] : []), ...j.sumber]
          .map(r => ({ aset_id: r.aset_id, trx_id: r.trx_id, label: r.nama_barang || r.nibar })),
        'penggabungan ini',
      )
      if (!guard.boleh) { setMsg(`Error: ${guard.pesan}`); return }
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
      <PeringatanNamaSkpd err={errSkpd} />
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
          preset={presetSpek}
          onCancel={() => { setMode('list'); setPresetSpek(null) }}
          onSaved={n => { setMode('list'); setPresetSpek(null); setMsg(`Jurnal tersimpan — ${n} barang dikoreksi.`); loadJurnals(skpd) }} />
      ) : addTo ? (
        <KoreksiForm skpdId={Number(skpd)} skpdNama={skpdNama || ''} golonganLabels={golonganLabels} header={addTo}
          onCancel={() => setAddTo(null)}
          onSaved={n => { setAddTo(null); setMsg(`${n} barang ditambahkan ke jurnal ${addTo.no_sk}.`); loadJurnals(skpd) }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} koreksi · {pemecahanJurnals.length} pemecahan · {penggabunganJurnals.length} penggabungan</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setPresetSpek(null); setMode('tambah') }}>+ Tambah Jurnal</button>
          </div>
          {loadingJurnal ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat jurnal...</div>
          ) : jurnalErr ? (
            /* ⚠️ Cabang ini WAJIB di ATAS cabang "belum ada koreksi" (Fase 1).
               Tanpanya, query yang GAGAL tampil sebagai "SKPD ini memang belum
               punya koreksi" — dan operator bisa menyimpulkan jurnalnya belum
               dibuat lalu membuatnya lagi. */
            <div className="card p-6 text-sm">
              <p className="text-red-600 font-medium">Gagal memuat kartu koreksi.</p>
              <p className="text-gray-500 mt-1">{jurnalErr}</p>
              <p className="text-gray-400 mt-2 text-xs">Daftar sengaja TIDAK ditampilkan sebagian — kartu yang kurang terlihat sah. Muat ulang halaman, atau pilih SKPD lain.</p>
            </div>
          ) : (jurnals.length === 0 && pemecahanJurnals.length === 0 && penggabunganJurnals.length === 0) ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada koreksi transaksi untuk SKPD ini.</div>
          ) : (<>
            {pemecahanJurnals.map(j => (
              <PemecahanCard key={j.id} j={j} busy={batalId === j.id}
                bisaBatal={tahunMap[parsePeriode(j.periode).tahun] === 'terbuka'}
                spekBusy={presetBusy}
                onKoreksiSpek={p => bukaSpekPecahan(p, j)}
                onEdit={() => { setMsg(''); setEditing(j) }}
                onBatal={() => handleBatalPemecahan(j)} />
            ))}
            {penggabunganJurnals.map(j => (
              <PenggabunganCard key={j.id} j={j} busy={batalId === j.id}
                bisaBatal={tahunMap[parsePeriode(j.periode).tahun] === 'terbuka'}
                onEdit={() => { setMsg(''); setEditing(j) }}
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
                        <td className="table-td text-right text-xs">{formatRupiah2(l.nilai)}</td>
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

      {/* Pop-up spesifikasi pecahan — POPUP YANG SAMA dgn yang dipakai saat
          mengisi pemecahan, jadi operator tak berpindah alur. `single` supaya
          field & foto REPLACE penuh (bisa dikosongkan). */}
      {spekPecah && (
        <EditSpesifikasiModal
          title={`Spesifikasi pecahan — ${spekPecah.nama}`}
          fieldKeys={spekPecah.keys}
          storagePrefix={`draft/pecah-spek/${spekPecah.asetId}`}
          initialFields={spekPecah.initFields}
          initialFoto={spekPecah.initFoto}
          single
          onSave={simpanSpekPecah}
          onClose={() => { if (!spekPecahSaving) setSpekPecah(null) }}
        />
      )}
    </>
  )
}

// ── Modal edit header: No dokumen + tanggal (kunci semester sama) + keterangan ──
function EditHeaderModal({ header, onClose, onSaved }: { header: HeaderEditable; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
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
      const path = `koreksi/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }

  async function simpan() {
    if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
    if (pindahSemester) {
      setErr(`Tanggal masuk ${tglPeriode}, sedangkan jurnal ini di ${header.periode}. Pindah semester tidak diizinkan — batalkan & entry ulang.`)
      return
    }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('jurnal_header')
      .update({
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        payload: { ...(header.payload || {}), dokumen_paths: dokPaths },
      }).eq('id', header.id)
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
          {/* Di sini dokumen TIDAK memblokir Simpan — sengaja beda dari form
              jurnal baru & dari Pengeluaran Internal. Kartu koreksi SUDAH punya
              baris ledger sejak detik ia dibuat, jadi menahan perbaikan salah
              ketik No. Dokumen sampai berkasnya dipindai tak membatalkan apa pun
              — cuma mengurung operator. Yang dilayani jendela ini justru kartu
              lama yang lahir sebelum aturan ini ada. */}
          <DokumenBastField paths={dokPaths} uploading={dokUploading} onUpload={uploadDokumen} onHapus={hapusDokumen}
            judul="Dokumen Sumber Koreksi" labelTombol="Upload Dokumen Sumber"
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

// ── Sub-view: (opsional header baru) + alasan + pilih barang ────────────────
function KoreksiForm({ skpdId, skpdNama, golonganLabels, header, preset, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; golonganLabels: Record<string, string>
  header: Header | null
  /** Datang dari "✎ Spesifikasi" di kartu Pemecahan: alasan dipaku ke
   *  Spesifikasi Barang & pecahannya sudah tercentang. */
  preset?: { barang: Barang; asal: string } | null
  onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()

  const [alasan, setAlasan] = useState<Alasan>(header?.jenis || (preset ? 'spesifikasi' : 'nilai_perolehan'))
  const [noSk, setNoSk] = useState('')
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10))
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // Dokumen sumber kartu — sementara ini cuma dipakai (& diwajibkan) alasan
  // Pemecahan Barang.
  const [dokPaths, setDokPaths] = useState<string[]>([])
  const [dokUploading, setDokUploading] = useState(false)

  // ── Nilai Perolehan: barang + nilai baru per-baris ──
  // ── Koreksi Nilai: centang barang + nilai barunya → ./koreksi/useKoreksiNilai.ts
  const { sel: selNilai, list: nilaiList, toggle: toggleNilai, ubahNilaiBaru, reset: resetNilai } = useKoreksiNilai()
  // ── Pemilih barang (dipakai Koreksi Nilai · Spesifikasi · Pemecahan) ────────
  // → ./koreksi/usePemilihBarang.ts (REFACTOR-PLAN Fase 3).
  const {
    fGolongan, setFGolongan, fSearch, setFSearch, rows, setRows, loaded, setLoaded,
    loading, uraianMap, tampilkan, fetchUraian, reset: resetPilih,
  } = usePemilihBarang(skpdId, alasan, preset, setErr)

  // ── Pencatatan Ganda & Spesifikasi ──────────────────────────────────────────
  // State & penyuntingnya → ./koreksi/usePencatatanGanda.ts & ./useSpesifikasi.ts
  // (REFACTOR-PLAN Fase 3). Aturan "apa yang boleh berbeda antar duplikat" →
  // lib/pencatatanGanda.ts. Nama lokal SENGAJA dipertahankan supaya JSX tetap.
  const {
    q: qGanda, setQ: setQGanda, hasil: hasilGanda, kandidat, survivorId, setSurvivorId,
    cari: cariKandidat, tambah: tambahKandidat, hapus: hapusKandidat, reset: resetGanda,
    beda: bedaGanda,
  } = usePencatatanGanda(skpdId, setErr)
  const { kode: kodeBeda, nilai: nilaiBeda, tahun: tahunBeda, nama: namaBeda } = bedaGanda
  const {
    sel: selSpek, setSel: setSelSpek, list: selSpekList, sameGol: spekSameGol, toggle: toggleSpek,
    modalOpen: spekModalOpen, setModalOpen: setSpekModalOpen, openModal: openSpekModal,
    initFields: spekInitFields, initFoto: spekInitFoto, prefix: spekPrefix,
    edit: spekEdit, setEdit: setSpekEdit, reset: resetSpek,
  } = useSpesifikasi(preset, setErr)

  // ── Penggabungan: N barang → 1 induk (kebalikan pemecahan) ──────────────────
  // State, efek basis, pencarian, & daftar sejenisnya → ./koreksi/usePenggabungan.ts
  // (REFACTOR-PLAN Fase 3). Aturan & aritmetikanya → lib/penggabunganNilai.ts.
  // Nama lokalnya SENGAJA dipertahankan supaya JSX & `simpan()` tak ikut berubah.
  const {
    q: qGabung, setQ: setQGabung, hasil: hasilGabung, list: gabungList,
    indukId: indukGabungId, setIndukId: setIndukGabungId, induk: indukGabung,
    sejenis, sejenisTersisa, selSejenis, setSelSejenis, sejenisLoading,
    basis: basisGabung, basisErr: basisGabungErr, basisLoading: basisGabungLoading,
    spek: gabungSpek, setSpek: setGabungSpek, spekInit: gabungSpekInit,
    spekFoto: gabungSpekFoto, spekOpen: gabungSpekOpen, setSpekOpen: setGabungSpekOpen,
    cari: cariGabung, tambah: tambahGabung, tambahSejenisTerpilih,
    hapus: hapusGabung, openSpek: openGabungSpek, reset: resetGabung,
    totalNP: totalNPGabung, totalAkum: totalAkumGabung, syaratOk: gabungSyaratOk,
  } = usePenggabungan(tgl, skpdId, setErr)

  // ── Pemecahan: 1 induk → N pecahan ──────────────────────────────────────────
  // State, efek basis, & penyunting pecahannya → ./koreksi/usePemecahan.ts
  // (REFACTOR-PLAN Fase 3, "pecah per alasan"). Nama lokalnya SENGAJA
  // dipertahankan apa adanya supaya JSX & `simpan()` tak ikut berubah —
  // pemindahan yang menyeret ratusan baris JSX tak bisa dibuktikan setara.
  const {
    induk: indukPecah, basis: basisPecah, basisErr: basisPecahErr, basisLoading: basisPecahLoading,
    indukFields, pecahan, editIdx: editPecahIdx, setEditIdx: setEditPecahIdx, setPecahan,
    pilihInduk, setPecah, addPecah, removePecah, reset: resetPecah, gantiInduk: gantiIndukPecah,
    alokasi: alokasiPecah, totalNPInduk, sumNPPecah, balance: balancePecah, semuaValid: semuaPecahValid,
  } = usePemecahan(tgl, setErr)




  async function uploadDokumen(files: FileList | null) {
    if (!files || files.length === 0) return
    setDokUploading(true)
    for (const file of Array.from(files)) {
      const path = `koreksi/${crypto.randomUUID()}/${file.name}`
      const { error } = await supabase.storage.from('dokumen-sumber').upload(path, file)
      if (error) { setErr(`Gagal upload "${file.name}": ${error.message}`); continue }
      setDokPaths(prev => [...prev, path])
    }
    setDokUploading(false)
  }
  async function hapusDokumen(path: string) {
    await supabase.storage.from('dokumen-sumber').remove([path])
    setDokPaths(prev => prev.filter(p => p !== path))
  }





  async function simpan() {
    setErr('')

    let h = header
    const headerBaru = !header
    if (!h) {
      if (!noSk.trim()) { setErr('No. dokumen koreksi wajib diisi.'); return }
      if (alasan === 'pencatatan_ganda' && !ket.trim()) { setErr('Keterangan/justifikasi wajib diisi utk Pencatatan Ganda.'); return }
      if (alasan === 'penggabungan' && !ket.trim()) { setErr('Keterangan/justifikasi wajib diisi utk Penggabungan Barang.'); return }
      // Penjaga SESUNGGUHNYA, bukan cuma gate tampilan `perluDokumenDulu` —
      // pola & alasan sama dgn Dokumen SK Penghapusan.
      if (dokPaths.length === 0) { setErr('Dokumen sumber koreksi wajib diunggah.'); return }
    }

    setSaving(true)

    if (!h) {
      const { data, error } = await supabase.from('jurnal_header').insert({
        skpd_id: skpdId, kategori: 'koreksi', jenis: alasan,
        no_sk: noSk.trim(), tanggal: tgl, keterangan: ket.trim() || null,
        payload: { dokumen_paths: dokPaths },
      }).select(HEADER_COLS).single()
      if (error || !data) { setErr(`Gagal membuat header jurnal: ${error?.message}`); setSaving(false); return }
      h = data as unknown as Header
    }

    if (alasan === 'nilai_perolehan') {
      const items = nilaiList
      if (items.length === 0) { setErr('Centang minimal satu barang.'); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      // Guard arah MAJU (2026-09-18, pola cekBolehSisip Kapitalisasi): tanggal
      // dokumen ini bebas dipilih dalam tahun buku terbuka, jadi bisa mundur ke
      // periode yang aset-nya SUDAH punya transaksi lain — menyisipkannya di
      // tengah rantai merusak replay penyusutan tanpa satu pun error.
      const guardSisip = await cekBolehSisip(supabase,
        items.map(i => ({ aset_id: i.barang.id, label: i.barang.nama_barang || i.barang.nibar })),
        h.tanggal, 'koreksi nilai perolehan ini')
      if (!guardSisip.boleh) { setErr(guardSisip.pesan); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
      // ── Posisi penyusutan SEBELUM koreksi, dibekukan ke payload ────────────
      //
      // ⚠️ Lembar Permendagri IV.G.2 ("Laporan Koreksi BMD") menuntut Nilai
      // Perolehan, Akumulasi, & Nilai Buku **sebelum DAN setelah** koreksi.
      // Yang "setelah" bisa dibaca dari `penyusutan_semester` kapan saja; yang
      // "SEBELUM" **tak tersimpan di mana pun** begitu engine di-run ulang —
      // koreksi nilai mengubah basis penyusutan, jadi baris engine periode itu
      // langsung memuat angka yang BARU. Tanpa dibekukan di sini, kolom
      // (15)(16) & seluruh blok Selisih lembar itu mustahil diisi.
      //
      // Polanya SAMA PERSIS dengan `penggabungan_masuk` di berkas ini
      // (`akumulasi_lama`/`akumulasi_baru`) dan dengan `akumulasi_diserap` di
      // Kapitalisasi: dibaca pada periode SEBELUM tanggal dokumen — itulah
      // posisi pembuka periode koreksi, persis state engine saat memproses
      // event ini.
      //
      // ⚠️ TIDAK MEMBLOKIR kalau barisnya tak ketemu, sengaja BEDA dari
      // Penggabungan yang menolak menyimpan. Di sana akumulasi yang jatuh ke 0
      // benar-benar MENGHAPUS angka dari neraca; di sini ia cuma dipakai
      // MELAPORKAN, jadi menahan koreksi nilai gara-gara engine belum
      // dijalankan akan mengurung operator demi sebuah kolom laporan. Yang
      // tak ketemu tak dibekukan sama sekali (bukan dibekukan sbg 0), dan
      // lembar IV.G.2 mencetaknya titik-titik + menghitungnya di strip amber —
      // nol berarti "memang belum tersusut", tak-ada berarti "tak diketahui".
      const basisPeriode = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(h.tanggal))))
      const akumSebelum: Record<string, number> = {}
      const idsNilai = items.map(i => i.barang.id)
      for (let i = 0; i < idsNilai.length; i += 200) {
        const { data, error } = await supabase.from('penyusutan_semester')
          .select('aset_id,akumulasi').eq('periode', basisPeriode).in('aset_id', idsNilai.slice(i, i + 200))
        // Kegagalannya DILAPORKAN & menghentikan penyimpanan: diam-diam
        // melanjutkan tanpa snapshot membuat lembar IV.G.2 bertitik-titik
        // selamanya untuk kartu ini, tanpa satu pun jejak kenapa.
        if (error) {
          setErr(`Gagal membaca akumulasi penyusutan ${basisPeriode}: ${error.message}`)
          if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id)
          setSaving(false); return
        }
        for (const r of (data || []) as { aset_id: string; akumulasi: number }[]) {
          akumSebelum[r.aset_id] = Number(r.akumulasi) || 0
        }
      }
      for (const { barang, nilaiBaru } of items) {
        const baru = parseFloat(nilaiBaru)
        if (isNaN(baru) || baru < 0) { setErr(`Nilai baru "${barang.nama_barang || barang.nibar}" tidak valid.`); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
        const delta = baru - barang.nilai_perolehan
        // Golongan yang memang tak disusutkan (Tanah/ATL/KDP) tak punya baris
        // engine sama sekali — akumulasinya NOL, bukan "tak diketahui".
        const akLama = perlakuanKode(barang.kode) === 'tidak' ? 0 : akumSebelum[barang.id]
        const { error } = await catatTransaksi(supabase, {
          asetId: barang.id, jenis: 'koreksi_nilai', nilai: delta, tanggal: h.tanggal, headerId: h.id,
          payload: {
            nilai_lama: barang.nilai_perolehan, nilai_perolehan_baru: baru, delta,
            // Kunci baru (2026-09-07). Baris LAMA tak punya ini & itu tak
            // merusak apa pun — engine tak membacanya sama sekali, cuma lembar
            // IV.G yang memakainya.
            ...(akLama != null ? { akumulasi_lama: akLama, basis_periode: basisPeriode } : {}),
          },
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
      // Guard arah MAJU — lihat catatan di cabang 'nilai_perolehan' di atas.
      const guardSisipSpek = await cekBolehSisip(supabase,
        list.map(b => ({ aset_id: b.id, label: b.nama_barang || b.nibar })),
        h.tanggal, 'koreksi spesifikasi ini')
      if (!guardSisipSpek.boleh) { setErr(guardSisipSpek.pesan); await delHeader(); setSaving(false); return }
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
      // Guard arah MAJU — lihat catatan di cabang 'nilai_perolehan' di atas.
      // Diperiksa atas SELURUH barang di gabungan (induk + sumber): keduanya
      // sama-sama menerima baris ledger baru bertanggal dokumen ini.
      const guardSisipGabung = await cekBolehSisip(supabase,
        gabungList.map(k => ({ aset_id: k.id, label: k.nama_barang || k.nibar })),
        h.tanggal, 'penggabungan ini')
      if (!guardSisipGabung.boleh) { setErr(guardSisipGabung.pesan); await delHeader(); setSaving(false); return }

      const sumber = gabungList.filter(k => k.id !== induk.id)
      const nilaiLama = keSen(induk.nilai_perolehan) / 100
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
          asetId: s.id, jenis: 'penggabungan_keluar', tanggal: h.tanggal, nilai: keSen(s.nilai_perolehan) / 100, headerId: h.id,
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
        nilai: (keSen(npBaru) - keSen(nilaiLama)) / 100, headerId: h.id,
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
      if (!balancePecah) { setErr(`Total nilai pecahan (${formatRupiah2(sumNPPecah)}) harus SAMA dengan nilai induk (${formatRupiah2(totalNPInduk)}). Selisih ${formatRupiah2(sumNPPecah - totalNPInduk)}.`); await delHeader(); setSaving(false); return }
      // Guard arah MAJU — lihat catatan di cabang 'nilai_perolehan' di atas.
      // Hanya INDUK yang diperiksa: pecahannya aset BARU, jadi tak mungkin
      // punya rantai transaksi lama yang bisa disisipi mundur.
      const guardSisipPecah = await cekBolehSisip(supabase,
        [{ aset_id: induk.id, label: induk.nama_barang || induk.nibar }],
        h.tanggal, 'pemecahan ini')
      if (!guardSisipPecah.boleh) { setErr(guardSisipPecah.pesan); await delHeader(); setSaving(false); return }

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
    // Guard arah MAJU — lihat catatan di cabang 'nilai_perolehan' di atas.
    // Hanya `lainnya` yang diperiksa: survivor sendiri tak menerima baris
    // ledger baru, cuma dirujuk dari payload duplikatnya.
    const guardSisipGanda = await cekBolehSisip(supabase,
      lainnya.map(k => ({ aset_id: k.id, label: k.nama_barang || k.nibar })),
      h.tanggal, 'pencatatan ganda ini')
    if (!guardSisipGanda.boleh) { setErr(guardSisipGanda.pesan); if (headerBaru) await supabase.from('jurnal_header').delete().eq('id', h.id); setSaving(false); return }
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
  // Nambah barang ke jurnal yang SUDAH ada (header != null) tak digate —
  // dokumennya sudah diperiksa waktu kartunya dibuat.
  const perluDokumenDulu = !header && dokPaths.length === 0

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
                        // Pindah alasan → buang jejak SEMUA alasan, bukan cuma yang
                        // ditinggalkan: operator bisa bolak-balik, dan sisa dari alasan
                        // lain akan ikut tersimpan tanpa pernah terlihat di layar.
                        setAlasan(o.value)
                        resetNilai(); resetPilih(); resetGanda(); resetSpek(); resetPecah(); resetGabung()
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
              {/* Wajib & DIGATE untuk KELIMA alasan (permintaan user 2026-09-07,
                  memperluas keputusan pagi harinya yang cuma Pemecahan). Koreksi
                  itu menyatakan catatan yang sudah masuk neraca ternyata keliru —
                  tak satu pun dari kelimanya pantas berdiri tanpa dokumen dasar.
                  Pemilihan barang di bawah baru muncul sesudah berkasnya ada,
                  lihat `perluDokumenDulu`. */}
              <div className="sm:col-span-2">
                <DokumenBastField paths={dokPaths} uploading={dokUploading} onUpload={uploadDokumen} onHapus={hapusDokumen}
                  judul="Dokumen Sumber Koreksi" labelTombol="Upload Dokumen Sumber"
                  hint="wajib sebelum barang bisa dipilih di bawah (foto / PDF, bisa lebih dari satu)"
                  kosongText="Belum ada dokumen — upload dulu sebelum bisa memilih barang di bawah." />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preset dari kartu Pemecahan — DI LUAR kartu alasan & DI ATAS gate
          dokumen. Kalau ia ikut di dalam kartu Spesifikasi, ia tersembunyi
          persis di saat paling dibutuhkan: operator menekan ✎ Spesifikasi lalu
          mendarat di layar "upload dokumen dulu" tanpa satu pun keterangan
          kenapa ia ada di situ. */}
      {preset && (
        <div className="text-xs text-teal-800 bg-teal/5 border border-teal/30 rounded-lg px-3 py-2.5 space-y-1">
          <p>
            Barang pecahan <span className="font-medium">{preset.barang.nama_barang || preset.barang.nibar || '-'}</span> dari
            {' '}<span className="font-medium">Pemecahan No. {preset.asal}</span> sudah dicentang — isi No. Dokumen Koreksi,
            tanggal, &amp; unggah dokumen sumbernya di atas, lalu klik <span className="font-medium">✎ Edit Spesifikasi</span>.
          </p>
          {/* Bukan basa-basi: sesudah baris `koreksi_spesifikasi` ini ada,
              guard rantai (rules.md §1.3) menolak Batal Pemecahan-nya — dan
              operator baru tahu waktu tombolnya gagal. */}
          <p className="text-amber-700">
            ⚠ Sesudah koreksi ini tersimpan, <span className="font-medium">Batal Pemecahan</span> pada kartu itu akan
            terblokir (pecahannya sudah punya transaksi lebih baru). Batalkan koreksi ini dulu kalau pemecahannya
            memang mau dibatalkan.
          </p>
        </div>
      )}

      {/* Satu gate untuk KELIMA alasan — sengaja di sini, bukan disalin ke tiap
          kartu: alasan boleh diganti kapan saja, dan gate yang cuma menempel di
          sebagian kartu akan membuat sebagian alasan bisa dipakai tanpa berkas. */}
      {perluDokumenDulu && (
        <div className="card p-10 text-center text-amber-600 text-sm">
          ⚠ Upload Dokumen Sumber Koreksi dulu di atas — barang baru bisa dipilih sesudah dokumennya ada.
        </div>
      )}

      {alasanAktif === 'nilai_perolehan' && !perluDokumenDulu && (
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
                        <td className="table-td text-right text-xs">{formatRupiah2(b.nilai_perolehan)}</td>
                        <td className="table-td text-right">
                          {selNilai[b.id] && (
                            <NominalInput className="select-filter w-full text-right"
                              value={selNilai[b.id].nilaiBaru} onChange={v => ubahNilaiBaru(b.id, v)} />
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

      {alasanAktif === 'pencatatan_ganda' && !perluDokumenDulu && (
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
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah2(k.nilai_perolehan)}</span>
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
                      <td className="table-td text-right text-xs">{formatRupiah2(k.nilai_perolehan)}</td>
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

      {alasanAktif === 'spesifikasi' && !perluDokumenDulu && (
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
                        <td className="table-td text-right text-xs">{formatRupiah2(b.nilai_perolehan)}</td>
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

      {alasanAktif === 'pemecahan' && !perluDokumenDulu && (
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
                            <td className="table-td text-right text-xs">{formatRupiah2(b.nilai_perolehan)}</td>
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
                <p className="text-xs text-gray-500 mt-0.5">Nilai perolehan: <span className="font-medium">{formatRupiah2(indukPecah.nilai_perolehan)}</span></p>
                {basisPecahLoading ? <p className="text-xs text-gray-400 mt-1">Memuat basis alokasi…</p>
                  : basisPecahErr ? <p className="text-xs text-red-600 mt-1">{basisPecahErr}</p>
                  : basisPecah ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Basis (akhir {formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))}):
                      nilai buku {formatRupiah2(basisPecah.nilai_buku)} · akumulasi {formatRupiah2(basisPecah.akumulasi)} · sisa {basisPecah.sisa_smt} smt
                      {!basisPecah.disusutkan && ' (tidak disusutkan)'}
                    </p>
                  ) : null}
              </div>
              <button className="text-xs text-gray-500 hover:text-red-600" onClick={() => gantiIndukPecah()}>Ganti</button>
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
                      <th className="table-th text-right w-52">Nilai Perolehan</th>
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
                            <NominalInput className="select-filter w-full text-right"
                              value={p.nilai} placeholder="0,00" onChange={v => setPecah(p.key, { nilai: v })} />
                          </td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah2(a.nb) : '-'}</td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah2(a.ak) : '-'}</td>
                          <td className="table-td text-right text-xs text-gray-600">{a ? formatRupiah2(a.beban) : '-'}</td>
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
                      <td className={`table-td text-right text-xs font-semibold ${balancePecah ? 'text-gray-800' : 'text-red-700'}`}>{formatRupiah2(sumNPPecah)}</td>
                      <td className="table-td text-right text-xs text-gray-500" colSpan={4}>Induk: {formatRupiah2(totalNPInduk)}</td>
                      <td className="table-td"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!balancePecah && <p className="mt-2 text-xs text-red-600">Total nilai pecahan harus sama dengan nilai perolehan induk. Selisih {formatRupiah2(sumNPPecah - totalNPInduk)}.</p>}
              <p className="mt-2 text-xs text-gray-400">Klik nama di kolom Spesifikasi untuk isi/ubah spesifikasi tiap pecahan (format per golongan, sama seperti Cara Perolehan). Nilai awal diwarisi dari induk. NIBAR digenerate baru. Sen ketik pakai <span className="font-medium">koma</span> (mis. 104.893.870.444,53) — total pecahan wajib sama PERSIS sampai sen.</p>
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

      {alasanAktif === 'penggabungan' && !perluDokumenDulu && (
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
                    <span className="text-gray-400"> — {k.nibar || '-'} · {k.kode} · {formatRupiah2(k.nilai_perolehan)} · {tahunDari(k.tgl_perolehan)}{k.satuan ? ` · ${k.satuan}` : ''}</span>
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
                            <td className="table-td text-right">{formatRupiah2(k.nilai_perolehan)}</td>
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
                      <td className="table-td text-right text-xs">{formatRupiah2(k.nilai_perolehan)}</td>
                      <td className="table-td text-right text-xs text-gray-600">
                        {basisGabung ? formatRupiah2(basisGabung[k.id] || 0) : '—'}
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
                    <td className="table-td text-right text-xs font-semibold text-gray-800">{formatRupiah2(totalNPGabung)}</td>
                    <td className="table-td text-right text-xs font-semibold text-gray-800">{basisGabung ? formatRupiah2(totalAkumGabung) : '—'}</td>
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
                Nilai buku hasil gabungan: <span className="font-medium">{basisGabung ? formatRupiah2(totalNPGabung - totalAkumGabung) : '—'}</span>.
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
function PemecahanCard({ j, busy, bisaBatal, spekBusy, onKoreksiSpek, onEdit, onBatal }: {
  j: PemecahanJurnal; busy: boolean; bisaBatal: boolean
  /** aset_id pecahan yang sedang ditarik untuk dikoreksi, atau null. */
  spekBusy: string | null
  onKoreksiSpek: (p: PemecahanRow) => void
  onEdit: () => void
  onBatal: () => void
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
            <DokumenLinks paths={j.payload?.dokumen_paths || []} label="Dokumen Sumber" />
            {/* ⚠️ Kartu ini SEKARANG bisa dilengkapi lewat ✎ (2026-09-08).
                Sebelumnya di sini tertulis "ledgernya append-only jadi kartunya
                tak bisa diperbaiki" — dan itu KELIRU: yang append-only cuma
                `transaksi_bmd`, sedangkan dokumen sumber tinggal di
                `jurnal_header.payload` yang memang boleh di-UPDATE. Kartu
                koreksi biasa (nilai/spesifikasi/ganda) juga sudah punya baris
                ledger sejak detik ia dibuat & tetap punya ✎ sejak dulu. */}
            {(j.payload?.dokumen_paths?.length || 0) === 0 && (
              <p className="text-xs text-amber-600">⚠ Belum ada dokumen sumber — lengkapi lewat ✎.</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Nilai Pecahan</p>
              <p className="font-semibold text-gray-800">{formatRupiah2(j.total)}</p>
            </div>
            {/* ✎ tetap ada walau kartunya sudah DIBATALKAN: dokumen sumber
                peristiwa yang pernah terjadi tetap perlu bisa dilampirkan, dan
                DB tak melarangnya. Yang dikunci cuma pindah semester. */}
            <button title="Edit No dokumen / tanggal (dalam semester yang sama) & unggah dokumen sumber"
              onClick={onEdit}
              className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
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
              <th className="table-th w-32 text-center">Spesifikasi</th>
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
                <td className="table-td text-right text-xs">{formatRupiah2(j.induk.nilai)}</td>
                {/* Induk sudah di-retire (status 'dihapus') — mengoreksi
                    spesifikasinya tak mengubah apa pun yang masih dibaca laporan. */}
                <td className="table-td text-center text-xs text-gray-300">—</td>
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
                <td className="table-td text-right text-xs">{formatRupiah2(p.nilai)}</td>
                <td className="table-td text-center">
                  {j.dibatalkan ? (
                    <span className="text-xs text-gray-300">—</span>
                  ) : (
                    <button type="button" disabled={spekBusy != null} onClick={() => onKoreksiSpek(p)}
                      title="Lengkapi/perbaiki spesifikasi pecahan ini lewat jurnal Koreksi → Spesifikasi Barang"
                      className="text-xs text-teal hover:underline disabled:opacity-40 disabled:no-underline">
                      {spekBusy === p.aset_id ? 'Membuka...' : '✎ Spesifikasi'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!j.dibatalkan && (
        <p className="px-5 py-2.5 text-xs text-gray-500 bg-gray-50/60 border-t border-gray-100">
          Ada spesifikasi pecahan yang kurang? Klik <span className="font-medium">✎ Spesifikasi</span> di barisnya —
          langsung pop-up, <span className="font-medium">tanpa jurnal baru</span>. Ini melengkapi entri pemecahan
          yang sama (nilai &amp; penyusutan tak bergerak), jadi <span className="font-medium">Batal Pemecahan tetap
          bisa dipakai</span>. Pecahan yang sudah pernah dikoreksi lewat jurnal akan diarahkan ke menu Koreksi.
        </p>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Penggabungan Barang — kartu tampil (induk + N sumber yang dilebur) + Batal
// ════════════════════════════════════════════════════════════════════════
function PenggabunganCard({ j, busy, bisaBatal, onEdit, onBatal }: {
  j: PenggabunganJurnal; busy: boolean; bisaBatal: boolean; onEdit: () => void; onBatal: () => void
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
            <DokumenLinks paths={j.payload?.dokumen_paths || []} label="Dokumen Sumber" />
            {/* Bisa dilengkapi lewat ✎ — lihat catatan kembar di PemecahanCard. */}
            {(j.payload?.dokumen_paths?.length || 0) === 0 && (
              <p className="text-xs text-amber-600">⚠ Belum ada dokumen sumber — lengkapi lewat ✎.</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-400">Nilai Hasil Gabungan</p>
              <p className="font-semibold text-gray-800">{formatRupiah2(j.induk?.nilaiBaru || 0)}</p>
            </div>
            <button title="Edit No dokumen / tanggal (dalam semester yang sama) & unggah dokumen sumber"
              onClick={onEdit}
              className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
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
                  <p className="font-medium text-gray-800">{formatRupiah2(j.induk.nilaiBaru)}</p>
                  <p className="text-gray-400 mt-0.5">semula {formatRupiah2(j.induk.nilaiLama)}</p>
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
                <td className="table-td text-right text-xs">{formatRupiah2(s.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
