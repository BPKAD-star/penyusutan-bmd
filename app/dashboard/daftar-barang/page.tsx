'use client'
// Daftar Barang — alur filter-lalu-tampilkan (mirip e-SIMBADA):
// SKPD → Jenis Aset (WAJIB pilih satu) → Komptabel → Cari → klik Tampilkan.
//
// Kolom menyesuaikan jenis aset (KIB) memakai field yang tersedia di DB. Layar
// DIRINGKAS (lihat `kolomGolongan`, lib/kolomBarang.ts): `uraian` ditumpuk di bawah `kode`, `nibar` di bawah
// `nama`. Tanah/Gedung/Jalan/KDP/Aset Lain-Lain + Spesifikasi Lainnya & Lokasi
// (alamat_detail) setelah nama. Tanah: dokumen kepemilikan TIDAK di layar (per
// bidang di GIS — badge "N bidang"), tetap ada di Export (EXPORT_COLS, utk BPK).
//   - Tanah (1.3.1): tanpa kolom Komptabel (semua intrakomptabel); + Luas & Jenis Hak
//   - Peralatan & Mesin (1.3.2): + Merek/Tipe + Spesifikasi
//   - Aset Lain-Lain (1.5.4): SEMUA kolom sekaligus (2026-09-08) — luas, jenis
//     hak, dokumen kepemilikan, DAN no. polisi/rangka/mesin/BPKB. Lihat
//     KOLOM_GOLONGAN['1.5.4']; tabelnya memang jadi lebar & digeser horizontal.
//
// Tampilan: kalau hasil filter ≤ SHOW_ALL_MAX baris → tampilkan SEMUA (tanpa
// halaman); kalau lebih → pakai halaman biar browser tetap enteng. Baris TOTAL
// selalu menjumlahkan nilai perolehan SELURUH hasil filter. Angka tanpa "Rp".
import { KOLOM_DEFAULT, KOLOM_META, NOWRAP_KEYS, kolomGolongan } from '@/lib/kolomBarang'
import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { luasEfektif } from '@/lib/luasBidang'

import SkpdCombobox from '@/components/SkpdCombobox'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { GOLONGAN_DAFTAR_BARANG, asalUsulTampil } from '@/lib/bmd'
import { penggunaanTampil } from '@/lib/penggunaanTampil'
import { fetchHiddenIds, belumAdaPada, SEMBUNYI_DAFTAR_BARANG } from '@/lib/visibilitas'
import { fetchPosisiOverrides, partitionByPeriodOwner, type PosisiPeriode } from '@/lib/pengalihan'
import { bergeserDariNibar } from '@/lib/kodeRegister'
import { fetchRiwayatKodeRegister, kodeRegisterPada } from '@/lib/kodeRegisterRiwayat'
import { ambilSemuaKeyset, halamanDuaCabang, tandaKursorKode, type CabangKeyset, type KursorKode } from '@/lib/keyset'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { useFilterDaftarBarang, type Applied } from './useFilterDaftarBarang'
import { useReferensiDaftarBarang } from './useReferensiDaftarBarang'
import { orCari } from '@/lib/cariBarang'
import { rpcUlangJikaTimeout } from '@/lib/rpcUlang'

// Baris per halaman. Sejak paginasi pindah ke server (migrasi 20260814_05..08)
// angka ini menentukan `p_limit` RPC, bukan besar potongan array di memori —
// jadi menaikkannya menambah kerja DB kira-kira LINEAR: index berhenti setelah
// N baris ketemu, bukan menyapu lebih banyak. 50 -> 100 ~ 126 ms -> ~200 ms.
// Naikkan lagi kalau perlu; yang TIDAK boleh dinaikkan sembarangan adalah
// SHOW_ALL_MAX di bawah, karena itu jumlah baris yang benar-benar dirender DOM.
const PAGE_SIZE = 100
const SHOW_ALL_MAX = 3000 // di bawah ini → render semua baris tanpa halaman

// Visibilitas period-aware (event sembunyi/muncul/lahir) dari lib/visibilitas.ts
// — dipakai bersama Penyusutan & Rekonsiliasi. Varian daftar SEMBUNYI di sini
// beda sendiri (plus `kdp_selesai_keluar`); itu disengaja, lihat modulnya.

// ⚠️ KEMBAR dgn RETURNS TABLE `fn_daftar_barang` (migrasi 20260908_01) — jalur
// ini cuma dipakai Export Audit yang memang men-`select` tabel langsung, tapi
// dua-duanya mengisi `Row` yang SAMA. Kolom yang cuma ditambahkan di salah satu
// bikin berkas Audit (untuk BPK) kekurangan kolom yang ada di layar, tanpa satu
// pun error.
const SELECT_COLS = 'id,nibar,kode_register,kode,nama_barang,spesifikasi_lainnya,alamat_detail,merek_tipe,nilai_perolehan,tgl_perolehan,intra_ekstra,asal_usul,cara_perolehan,penggunaan_pengamanan,keterangan,status,skpd_id,luas,nomor_dokumen_kepemilikan,tanggal_dokumen_kepemilikan,nama_dokumen_kepemilikan,jenis_hak,no_polisi,no_rangka,no_mesin,no_bpkb,pemanfaatan,pengamanan'

type Row = {
  id: string          // = aset.id → dipakai cocokkan event sembunyi di transaksi_bmd
  nibar: string | null
  // Kode register 45 digit — DIBACA, bukan dihitung di layar. Nomor urutnya
  // diterbitkan & dibekukan di DB (trigger trg_aset_kode_register); menghitungnya
  // di sini akan menggeser nomor tiap kali ada barang hilang.
  // ⚠️ PERIOD-AWARE sejak 2026-09-13: yang datang dari `fn_daftar_barang` adalah
  // kode PADA periode terpilih (`fn_dbar_kode_register_at`), bukan posisi
  // terakhir di `aset.kode_register`. Jalur MENTAH (Export Audit) menghitungnya
  // sendiri lewat `kodeRegisterPada` — aturan yang sama, dua tempat, dikunci
  // lib/sinkronisasiRpc.test.ts.
  kode_register: string | null
  kode: string
  nama_barang: string | null
  spesifikasi_lainnya: string | null
  alamat_detail: string | null
  merek_tipe: string | null
  nilai_perolehan: number
  tgl_perolehan: string | null
  intra_ekstra: string | null
  asal_usul: string | null
  // Diisi menu Cara Perolehan saat approve — dipakai HANYA sbg cadangan
  // tampilan kalau `asal_usul` kosong. Lihat `asalUsulTampil` di lib/bmd.ts.
  cara_perolehan: string | null
  penggunaan_pengamanan: string | null   // kolom label "Penggunaan" (lihat lib/asetFields.ts)
  keterangan: string | null
  status: string
  skpd_id: number | null
  luas: number | null
  nomor_dokumen_kepemilikan: string | null
  tanggal_dokumen_kepemilikan: string | null
  nama_dokumen_kepemilikan: string | null
  jenis_hak: string | null
  // Identitas kendaraan — dipakai kolom Aset Lain-Lain (1.5.4), yang isinya
  // campuran hasil reklasifikasi dari semua golongan (lihat KOLOM_GOLONGAN['1.5.4']).
  no_polisi: string | null
  no_rangka: string | null
  no_mesin: string | null
  no_bpkb: string | null
  // Cache aktif Pemanfaatan/Pengamanan (migrasi 20260923_02) — MENDUDUKI
  // `penggunaan_pengamanan` di kolom "Penggunaan" kalau ada. Lihat
  // lib/penggunaanTampil.ts.
  pemanfaatan: string | null
  pengamanan: string | null
}
// Jejak penghapusan (dari ledger + jurnal_header) — dipakai mode export Audit.
type HapusInfo = { tgl: string | null; no_sk: string | null; jenis: string | null; ket: string | null }


// Angka RUPIAH polos bergaya id-ID tanpa "Rp" — SELALU 2 desimal sejak
// 2026-09-09 (keputusan user): sebelumnya halaman ini membulatkan ke 0 desimal
// sementara Penyusutan & Laporan BMD menampilkan desimalnya, jadi nilai
// perolehan yang SAMA terbaca beda tergantung menu yang dibuka. Satu sumber:
// `formatRupiah2` di lib/export.
// ⚠️ Cuma dipakai `cellContent` (layar) & baris TOTAL. `cell()` untuk Export
// tetap mengembalikan angka MENTAH supaya selnya bertipe angka di Excel.
const angka = formatRupiah2

// LUAS (m²) BUKAN rupiah — tetap tanpa desimal paksa. Dipisah supaya perubahan
// format uang di atas tak diam-diam mengubah kolom luas jadi "1.234,00 m²".
const angkaLuas = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

// ── Kolom per jenis aset (pakai field yang tersedia) ────────────────────────
// Judul & perataan kolom. Yang DIPAKAI BERSAMA Daftar Barang Awal ada di
// lib/kolomBarang.ts (`KOLOM_META`) — di sini tinggal tiga kolom yang memang
// hanya milik halaman ini.
const COL_META: Record<string, { header: string; align?: 'right' | 'center' }> = {
  ...KOLOM_META,
  // `uraian` tak jadi kolom sendiri di layar (ditumpuk di bawah `kode`), tapi
  // TETAP kolom penuh di Export — lihat EXPORT_ORDER.
  uraian: { header: 'Uraian Barang' },
  // Dua kolom identitas — EXPORT-ONLY (tak pernah masuk kolom layar; di layar
  // NIBAR & kode register ditumpuk di sel Nama Barang). Ada di sini supaya ikut
  // satu sistem urutan yang sama dgn kolom lain (EXPORT_ORDER).
  nibar: { header: 'NIBAR' }, kode_register: { header: 'Kode Register' },
}
// ── Kolom TAMPILAN LAYAR (diringkas 2026-07-19) ─────────────────────────────
// - `uraian` TIDAK jadi kolom sendiri lagi → ditumpuk di bawah `kode` (spt nibar
//   di bawah nama). Lihat cellContent('kode').
// - `spesifikasi` (Spesifikasi Lainnya) di layar HANYA untuk Peralatan & Mesin
//   (1.3.2), Aset Lain-Lain (1.5.4, sejak 2026-09-08), & Gedung dan Bangunan
//   (1.3.3, sejak 2026-09-08 — golongan itu tak punya Merek/Tipe, jadi
//   Spesifikasi Lainnya-lah yang menerangkan barangnya). Sisanya
//   (Tanah/Jalan/KDP/ATB) tetap Export-only lewat EXPORT_COLS.
// - `lokasi` (alamat_detail) tetap setelah nama utk golongan berlokasi.
// - `asal_usul` (Asal Usul) & `penggunaan` (Penggunaan → kolom penggunaan_pengamanan)
//   ditampilkan sebelum Keterangan di SEMUA jenis aset (2026-07-20).
// - `penggunaan` sejak 2026-09-23 kini bisa berisi Pemanfaatan/Pengamanan AKTIF
//   (MENDUDUKI teks baseline, pola sama dgn Σ luas bidang) — lihat
//   lib/penggunaanTampil.ts & migrasi 20260923_02 (RPC-nya baru mengembalikan
//   `pemanfaatan`/`pengamanan` sejak migrasi itu).
// - Tanah: kolom Dokumen Kepemilikan (no/tgl/atas nama) SENGAJA tidak di layar —
//   satu register bisa banyak bidang & dokumennya dikelola per-bidang di GIS
//   (badge "🗺 N bidang" di sel Jenis Hak, permintaan user 2026-09-23, link ke
//   sana). TETAP ada di Export (BPK).
// Kolom per jenis aset → **lib/kolomBarang.ts**, dipakai BERSAMA dgn Daftar
// Barang Awal (REFACTOR-PLAN §5 butir 2.3). Sebelum 2026-09-15 daftarnya
// ditulis dua kali & cuma dijaga komentar "ubah satu, samakan yang lain" —
// kelupaan di salah satu sisi tak menghasilkan error apa pun, cuma dua menu
// yang menampilkan barang sama dgn isi berbeda.
//
// ⚠️ `kendaraanPM` SENGAJA tak disetel di sini: Peralatan & Mesin (1.3.2) di
// halaman ini belum membawa No. Polisi/Rangka/Mesin/BPKB, sementara Daftar
// Barang Awal membawa (permintaan user 2026-07-30). Kalau kelak halaman ini
// mau ikut, setel benderanya jadi `true` — JANGAN menyalin empat kuncinya ke
// daftar terpisah, itu mengembalikan kekembaran yang baru saja dicabut.
// Golongan 1.5.4 tak terpengaruh bendera itu: isinya campuran hasil
// reklasifikasi semua golongan, jadi kendaraan memang selalu ikut.
const colsFor = (golongan: string) => kolomGolongan(golongan)

// ── Kolom EKSPOR (Excel/BPK) — TETAP flat & lengkap: `uraian` jadi kolom
// sendiri, dan Tanah tetap membawa Dokumen Kepemilikan (no/tgl/atas nama).
// Sengaja beda dari tampilan layar yang diringkas.
// ✅ Kode Register yang diekspor sudah PERIOD-AWARE (2026-09-13) — sama seperti
// tampilan layar. Export Excel biasa mewarisinya dari `fn_daftar_barang`; Export
// AUDIT (jalur mentah) menghitungnya sendiri lewat `kodeRegisterPada`. Kalau
// kelak ada tombol export BARU di halaman ini, ia WAJIB ikut salah satu dari dua
// jalur itu: berkas periode lampau yang menyebut kode yang saat itu belum terbit
// tak menghasilkan satu pun error, dan ia dibaca BPK.
//
// URUTAN kolom kiri→kanan DITENTUKAN USER (2026-07-30) & dipegang SATU tempat:
// EXPORT_ORDER di bawah. `EXPORT_COLS` cuma menentukan kolom mana yang IKUT per
// golongan (himpunan, bukan urutan) — urutannya selalu dari EXPORT_ORDER. Ini
// disengaja: dulu urutannya tersebar di 9 daftar, jadi nambah satu kolom berarti
// menyisipkannya di 9 tempat dengan benar & satu kelupaan bikin berkas golongan
// itu beda susunan tanpa ada yang sadar.
// Susunannya: identitas (SKPD → kode & uraian → NIBAR → kode register → nama) →
// deskriptif per golongan (merek, spesifikasi, lokasi, luas, hak, dokumen
// kepemilikan) → atribut (tgl, komptabel) → angka → asal usul/penggunaan/ket.
// Blok deskriptif itu yang bikin tiap golongan beda panjang, sesuai kolom yang
// memang ditampilkan Daftar Barang untuk jenis aset itu.
const EXPORT_ORDER = [
  'skpd', 'kode', 'uraian', 'nibar', 'kode_register', 'nama',
  'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb',
  'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
  'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan',
]
// Dua kolom identitas ini SELALU ikut, apa pun golongannya — sengaja di luar
// daftar per-golongan supaya tak bisa kelupaan di salah satu entri.
const EXPORT_ALWAYS = ['nibar', 'kode_register']
const EXPORT_COLS: Record<string, string[]> = {
  '1.3.1': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama', 'tgl', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'], // Tanah — tanpa komptabel (spt layar)
  '1.3.2': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.4': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.5': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.3.6': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'lokasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  '1.5.3': ['skpd', 'kode', 'uraian', 'nama', 'spesifikasi', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
  // Aset Lain-Lain: berkasnya membawa kolom yang SAMA dgn layar (lihat
  // KOLOM_GOLONGAN['1.5.4']) — Excel yang lebih miskin dari layar bikin operator yang
  // sudah melihat nomor rangkanya di aplikasi menganggap datanya hilang.
  '1.5.4': ['skpd', 'kode', 'uraian', 'nama', 'merek', 'spesifikasi', 'nopol', 'rangka', 'mesin', 'bpkb',
    'lokasi', 'luas', 'hak', 'no_sertifikat', 'tgl_sertifikat', 'atas_nama',
    'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan'],
}
const EXPORT_DEFAULT = ['skpd', 'kode', 'uraian', 'nama', 'tgl', 'komptabel', 'nilai', 'asal_usul', 'penggunaan', 'keterangan']
// Himpunan kolom golongan + yang selalu ikut, DIURUTKAN oleh EXPORT_ORDER.
const exportColsFor = (golongan: string) => {
  const pilih = new Set([...(EXPORT_COLS[golongan] || EXPORT_DEFAULT), ...EXPORT_ALWAYS])
  return EXPORT_ORDER.filter(k => pilih.has(k))
}

// Urutan tampil & export: KODE BARANG A→Z (permintaan user 2026-07-30; dulu
// nilai perolehan terbesar dulu). Perbandingan string POLOS, bukan
// `localeCompare`: kode e-BMD itu angka ber-titik yang tiap segmennya sudah
// zero-padded ('1.3.2.02.01.02.003'), jadi urutan leksikografis = urutan
// nomornya, dan sorting 200rb baris jadi jauh lebih murah.
// Dua kunci sesudahnya WAJIB ada, bukan hiasan: satu kode dipakai ribuan barang,
// dan tanpa pemecah seri yang UNIK urutannya bisa berbeda tiap render (Array
// .sort() tak stabil utk semua mesin) — nomor halaman jadi berpindah-pindah
// isinya. Nilai perolehan turun dipertahankan sbg kunci kedua supaya kebiasaan
// lama (barang mahal di atas) masih terasa di dalam satu kode.
function bandingKode(a: Row, b: Row): number {
  if (a.kode !== b.kode) return a.kode < b.kode ? -1 : 1
  const d = (b.nilai_perolehan || 0) - (a.nilai_perolehan || 0)
  return d !== 0 ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// Label jenis penghapusan untuk export Audit.
const HAPUS_LABEL: Record<string, string> = {
  penghapusan_pemindahtanganan: 'Pemindahtanganan',
  penghapusan_sebab_lain: 'Sebab Lain',
}

// Kolom yang isinya SATU nomor utuh — dipaksa satu baris. Tanpa ini "AG 1021 EP"
// pecah jadi tiga baris di kolom sempit & tak lagi terbaca sebagai satu nomor
// polisi. Aturan & alasannya kembar dgn Saldo Awal → Daftar Barang Awal
// (NOWRAP_KEYS di sana); tabelnya memang sudah bisa digeser horizontal, jadi
// melebar sedikit lebih baik daripada nomor yang terbelah.
// NOWRAP_KEYS → lib/kolomBarang.ts (kembar dgn Daftar Barang Awal).
// Kolom `nama` (sel 3-baris: nama · NIBAR · kode register — satu-satunya yang
// menjawab "barang ini yang mana?") dibuat STICKY di sisi kiri (permintaan
// user 2026-09-12): tabel golongan lebar (mis. 1.5.4, 20 kolom) digeser jauh
// ke kanan bikin orang lupa lagi lihat baris siapa. `skpd`/`kode` di depannya
// TIDAK ikut sticky — begitu keduanya sudah tergulir lewat, `nama` otomatis
// menempel di tepi kiri (perilaku baku CSS sticky utk sel bukan-kolom-pertama:
// yang di depannya cukup sudah scroll keluar, tak perlu ikut sticky juga).
// Butuh background SOLID (bukan transparan) supaya kolom di belakangnya yang
// masih tergulir tak tembus pandang — dan itu HARUS ikut warna zebra baris
// (bg-white/bg-gray-50 berselang), bukan putih rata, kalau tidak baris genap
// akan salah warna cuma di kolom ini. Makanya `tdClass` menerima `striped`.
function thClass(key: string) {
  const a = COL_META[key]?.align
  return `table-th${a === 'right' ? ' text-right' : a === 'center' ? ' text-center' : ''}`
    + (NOWRAP_KEYS.has(key) ? ' whitespace-nowrap' : '')
    + (key === 'nama' ? ' sticky left-0 z-10 bg-gray-50 border-r border-gray-200' : '')
}
function tdClass(key: string, striped?: boolean) {
  if (key === 'nama') return `table-td align-top sticky left-0 z-10 border-r border-gray-200 ${striped ? 'bg-gray-50/50' : 'bg-white'}`
  if (key === 'kode') return 'table-td align-top'
  if (key === 'nilai' || key === 'luas') return 'table-td text-right text-xs align-top'
  if (key === 'komptabel') return 'table-td text-center text-xs capitalize align-top'
  return `table-td text-xs text-gray-600 align-top${NOWRAP_KEYS.has(key) ? ' whitespace-nowrap' : ''}`
}

// Label kepala kolom KODE & NAMA menyebut isi yang ditumpuk di bawahnya
// (permintaan user 2026-09-17 — operator bingung melihat Uraian Barang/NIBAR/
// Kode Register muncul di sel tanpa keterangan apa pun di headernya). Sengaja
// TERPISAH dari `COL_META[k].header`: field itu juga jadi judul kolom EXPORT
// (di sana Uraian/NIBAR/Kode Register sudah kolom Excel SENDIRI — lihat
// EXPORT_ORDER), jadi menumpuk labelnya di situ akan menulis ulang judul
// berkas Excel, bukan cuma kepala tabel layar.
function thContent(key: string): React.ReactNode {
  if (key === 'kode') return (
    <>
      Kode Barang
      <span className="block normal-case font-normal tracking-normal text-gray-400 mt-0.5">Uraian Barang</span>
    </>
  )
  if (key === 'nama') return (
    <>
      Nama Barang
      <span className="block normal-case font-normal tracking-normal text-gray-400 mt-0.5">NIBAR</span>
      <span className="block normal-case font-normal tracking-normal text-gray-400">Kode Register</span>
    </>
  )
  return COL_META[key].header
}

export default function DaftarBarangPage() {
  const supabase = createClient()

  // ── Peta rujukan (nama SKPD & nama jenis aset) ──
  // Kegagalannya PERINGATAN, bukan pembatal: keduanya label di atas data yang
  // sudah benar. Lihat alasannya di ./useReferensiDaftarBarang.ts.
  const { skpdMap, golonganLabels, err: errRef } = useReferensiDaftarBarang()

  // ── Filter: nilai yang sedang DIKETIK (f*) vs yang sudah DITERAPKAN ──
  // ⚠️ Query halaman ini — paginasi, rekap, kedua Export — WAJIB membaca
  // `applied`, bukan `f*`. Namanya dipertahankan lewat destructuring supaya
  // seluruh JSX di bawah tak berubah sebaris pun.
  const {
    fSel, setFSel, fKonsolidasi, setFKonsolidasi, fGolongan, setFGolongan, fKomptabel, setFKomptabel,
    fSearch, setFSearch, fTahun, setFTahun, fSmt, setFSmt,
    applied, setApplied, pesanFilter, rakit,
  } = useFilterDaftarBarang()

  const [data, setData] = useState<Row[]>([])          // baris yang tampil (halaman aktif / semua)
  const [allVisible, setAllVisible] = useState<Row[]>([]) // seluruh baris visible di periode (utk paginasi & export)
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  const [bidangCount, setBidangCount] = useState<Record<string, { n: number; nLuas: number; luas: number | null }>>({}) // aset_id → jumlah bidang & Σ luas (Tanah, dari aset_bidang_tanah)
  const [posisiOverride, setPosisiOverride] = useState<Map<string, PosisiPeriode>>(new Map()) // aset_id → SKPD pemilik + tahun masuk, period-aware
  // ⚠️ `null` = TAK TERHITUNG (rekap gagal/timeout), sengaja DIBEDAKAN dari 0.
  // "0 barang" itu pernyataan tentang data; "tak terhitung" pernyataan tentang
  // query — menyamakannya membuat kegagalan terbaca sbg "barangnya memang tak
  // ada", kegagalan senyap kelas paling mahal di modul ini.
  const [total, setTotal] = useState<number | null>(0)
  const [grandTotal, setGrandTotal] = useState<number | null>(0)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  // Pesan kegagalan query. WAJIB ada di halaman daftar (CLAUDE.md): tanpa ini,
  // query yang gagal cuma bikin tombol nyangkut "Memuat..." selamanya (kalau
  // melempar) atau terbaca operator sbg "0 barang / datanya memang kosong"
  // (kalau errornya ditelan) — dua-duanya bisa berbulan-bulan tak ketahuan.
  const [err, setErr] = useState('')
  // Kegagalan REKAP punya salurannya SENDIRI & tidak fatal — lihat alasannya di
  // `handleTampilkan`. Amber (peringatan) di atas tabel yang barisnya justru
  // berhasil dimuat, bukan merah yang menyuruh operator mengira semuanya gagal.
  const [errRekap, setErrRekap] = useState('')
  // Rekap dijalankan DI LATAR (2026-09-22) — lihat `handleTampilkan`. Dua
  // penanda yang dibutuhkan pola itu:
  //   `rekapJalan` → kaki tabel bisa berkata "menghitung..." alih-alih diam;
  //   `reqSeq`/`pageRef` → hasil rekap yang datang TERLAMBAT tak boleh menimpa
  //   layar yang sudah berganti filter atau sudah dipindah halamannya.
  const [rekapJalan, setRekapJalan] = useState(false)
  const reqSeq = useRef(0)
  const pageRef = useRef(0)
  // ⚠️ Penanda "baris halaman pertama sudah mendarat". Rekap bisa pulang LEBIH
  // DULU daripada barisnya (filter sempit → rekapnya ringan), dan tanpa
  // penanda ini mode "tampilkan semua" menaruh 500 baris ke tabel lalu jalur
  // utama menimpanya dgn 100 baris halaman pertama — sementara paginasi sudah
  // terlanjur disembunyikan, jadi 400 baris sisanya lenyap TANPA satu pun
  // tanda. Urutan mendaratnya tak bisa ditebak, jadi harus dipaksa.
  const barisSiap = useRef<Promise<void>>(Promise.resolve())
  const [exporting, setExporting] = useState(false)
  // Berapa baris sudah tertarik selama Export. Export golongan besar memang
  // menit-menitan (218rb baris = 220 permintaan); tanpa angka yang bergerak,
  // tombol "Mengekspor..." yang diam terbaca operator sbg macet, dan halaman
  // ini sudah pernah benar-benar macet di situ — jadi bedanya harus kelihatan.
  const [progres, setProgres] = useState(0)


  // Filter dipisah agar dipakai bareng query utama & export. Sumber = tabel utama
  // `aset` (bukan view) supaya `id` = aset.id, sehingga filter sembunyi period-aware
  // (transaksi_bmd.aset_id) cocok. golongan diturunkan dari `kode`, nama SKPD dari skpdMap.
  //   includeDeleted=false → hanya barang aktif (posisi terkini, default & untuk layar).
  //   includeDeleted=true  → termasuk yang dihapus (mode export Audit/Mutasi buat BPK).
  const applyFilters = useCallback(<T,>(q: T, f: Applied, includeDeleted = false): T => {
    // @ts-expect-error — chain PostgREST builder
    // 'draft' = barang belum resmi (mis. KDP sebelum termin disetujui) → JANGAN
    // pernah tampil, bahkan di mode Audit (includeDeleted). Hanya aktif/dihapus.
    let b = includeDeleted ? q.neq('status', 'draft') : q.eq('status', 'aktif')
    if (f.descIds && f.descIds.length > 0) b = b.in('skpd_id', f.descIds)
    // ⚠️ `.eq('golongan', ...)`, BUKAN `.like('kode', 'gol.%')` (diganti
    // 2026-09-03). Setara PERSIS — `aset.golongan` itu kolom GENERATED ALWAYS
    // dari tiga segmen pertama `kode` (diperiksa ke DB: 0 baris menyimpang dari
    // 420.463) — tapi `~~` (LIKE) tidak leakproof, jadi di bawah RLS ia tak
    // pernah bisa jadi index condition & memaksa planner meninggalkan
    // `idx_aset_gol_urut`. Ini ronde keempat dari cerita yang sama (GIS Tanah,
    // Kendaraan, fetchOwnerOverrides); `fn_daftar_barang` sendiri sudah lama
    // memakai `a.golongan = p_golongan`.
    if (f.golongan) b = b.eq('golongan', f.golongan)
    if (f.komptabel) b = b.eq('intra_ekstra', f.komptabel)
    // Kolom kembar dgn `fn_aset_teks_cari` di RPC — lib/cariBarang.ts.
    const cari = orCari(f.search)
    if (cari) b = b.or(cari)
    return b
  }, [])

  // Query MENTAH `aset` yang sudah tersaring tapi BELUM ber-`order` — urutannya
  // dipasang per cabang kursor oleh `fetchAllRowsRaw`. Satu-satunya pemakai.
  //
  // ⚠️ `nilai_teks` = `nilai_perolehan` yang di-cast ke TEKS di sisi PostgREST,
  // khusus untuk dipakai sebagai kursor. `nilai_perolehan` itu `numeric`
  // sedangkan angka JSON di peramban float64, dan di produksi ada 1 baris yang
  // tak selamat (1427689804.3600001 → 1427689804.36). Kursor yang sudah
  // dibulatkan akan melewatkan baris yang sah TANPA satu pun error — lihat
  // lib/keyset.ts.
  const buildQueryRaw = useCallback((f: Applied) =>
    applyFilters(
      supabase.from('aset').select(`${SELECT_COLS},nilai_teks:nilai_perolehan::text`),
      f, true,
    ), [applyFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ambil baris aset berdasar daftar id (utk barang yang PADA periode terpilih
  // milik SKPD terpilih tapi kini sudah pindah keluar — period-aware). Filter
  // golongan/komptabel/search tetap diterapkan; filter SKPD TIDAK (justru id-id
  // ini di luar scope skpd terkini). includeDeleted=true.
  const fetchRowsByIds = useCallback(async (ids: string[], f: Applied): Promise<Row[]> => {
    const out: Row[] = []
    for (let i = 0; i < ids.length; i += 200) {
      let q = supabase.from('aset').select(SELECT_COLS).in('id', ids.slice(i, i + 200))
      if (f.golongan) q = q.like('kode', `${f.golongan}.%`)
      if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
      const cari = orCari(f.search)
      if (cari) q = q.or(cari)
      const { data, error } = await q
      if (error) throw new Error(`gagal membaca barang yang sudah pindah SKPD: ${error.message}`)
      out.push(...((data as unknown as Row[]) || []))
    }
    return out
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Bidang tanah per aset (aset_bidang_tanah) — utk badge "N bidang" DAN kolom
  // Luas. Identitas + luas per bidang dikelola di menu GIS BMD; `aset.luas` cuma
  // dipakai kalau asetnya belum punya bidang sama sekali. Σ-nya dihitung SAAT
  // TAMPIL, sengaja tidak disimpan ke `aset.luas` — angka tersimpan bakal basi
  // tiap bidang ditambah/diedit/dihapus (aturan yang sama dipakai Saldo Awal →
  // Daftar Barang Awal, bedanya cadangannya kolom snapshot).
  // Σ HANYA sah kalau SEMUA bidang punya luas (nLuas === n) — kalau baru
  // sebagian yang diisi, jumlahnya lebih kecil dari luas sebenarnya. Per
  // 2026-07-28 itu justru keadaan normal: dari 529 bidang, baru 4 yang berluas.
  const fetchBidangCount = useCallback(async (ids: string[]) => {
    const cnt: Record<string, { n: number; nLuas: number; luas: number | null }> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('aset_bidang_tanah').select('aset_id,luas').in('aset_id', ids.slice(i, i + 200))
      if (error) throw new Error(`gagal membaca bidang tanah: ${error.message}`)
      for (const b of (data || []) as { aset_id: string; luas: number | null }[]) {
        const a = cnt[b.aset_id] || (cnt[b.aset_id] = { n: 0, nLuas: 0, luas: null })
        a.n++
        if (b.luas != null) { a.nLuas++; a.luas = (a.luas ?? 0) + Number(b.luas) }
      }
    }
    return cnt
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Uraian (nama baku) per kode dari kodefikasi_bmd.
  async function fetchUraian(kodes: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      if (error) throw new Error(`gagal membaca uraian kodefikasi: ${error.message}`)
      for (const r of data || []) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  // ── Jalur baru: paginasi & visibilitas dikerjakan DI SERVER ────────────────
  // `fn_daftar_barang` (migrasi 20260814_05..07) sudah melakukan SEMUA yang
  // dulu dirangkai di sini: visibilitas period-aware (SEMBUNYI/MUNCUL/LAHIR),
  // kepemilikan pada periode (pengalihan + mutasi internal, minus yang
  // dibatalkan), filter golongan/komptabel/cari, DAN urutannya — kembar dgn
  // `bandingKode`. Jadi halaman ini tak perlu lagi menarik seluruh baris.
  //
  // Ukurannya (RLS aktif, 1.3.2 se-kabupaten = 218.251 baris):
  //   dulu : 219 permintaan x ~2,3 dtk, seluruh baris masuk memori browser
  //   kini : 1 permintaan, 126 ms untuk 50 baris
  //
  // ⚠️ Aturan dua mode (user 2026-08-14) ditegakkan DI DB lewat `fn_dbar_guard`:
  // tak boleh semua jenis aset x semua SKPD sekaligus. Sah cuma (A) satu SKPD →
  // semua jenis, atau (B) se-kabupaten → wajib satu jenis. Pesan ramahnya juga
  // ditampilkan di layar sebelum tombol ditekan, tapi penegaknya tetap DB.
  const rpcArgs = useCallback((f: Applied) => ({
    p_periode: f.periode,
    p_skpd_ids: f.descIds && f.descIds.length > 0 ? f.descIds : null,
    p_golongan: f.golongan || null,
    p_komptabel: f.komptabel || null,
    p_search: f.search || null,
  }), [])

  // MELEMPAR kalau gagal — pemanggilnya (handleTampilkan/goPage/export) semuanya
  // punya try/catch + pesan yang DITAMPILKAN. Daftar yang kurang sebagian jauh
  // lebih berbahaya daripada daftar yang menolak tampil.
  //
  // `afterId` = KURSOR (id baris terakhir halaman sebelumnya, migrasi
  // 20260903_01). Layar tetap memakai `offset` — ia memang melompat ke halaman
  // ke-N sesuka operator — sedangkan Export memakai kursor, karena di sana
  // halamannya ditelusuri berurutan sampai habis dan offset yang makin dalam
  // pasti menembus statement timeout (offset 50.000 = 51 dtk, terukur).
  //
  // ⚠️ `p_after_id` sengaja HANYA disertakan kalau kursornya benar-benar
  // dipakai. PostgREST mencocokkan RPC lewat NAMA argumen, jadi mengirim
  // parameter yang belum ada di DB membuat panggilannya gagal total ("Could not
  // find the function … in the schema cache"). Dengan cara ini, kalau migrasi
  // 20260903_01 telat dijalankan, yang mati cuma Export — LAYAR Daftar Barang
  // (lapis 1) tetap hidup. Urutan yang benar tetap migrasi dulu, baru deploy;
  // ini jaring pengamannya, bukan penggantinya.
  const fetchPage = useCallback(async (f: Applied, limit: number, offset: number, afterId?: string | null): Promise<Row[]> => {
    const { data, error } = await supabase.rpc('fn_daftar_barang', {
      ...rpcArgs(f), p_limit: limit, p_offset: afterId ? 0 : offset,
      ...(afterId ? { p_after_id: afterId } : {}),
    })
    if (error) throw new Error(`gagal membaca daftar barang: ${error.message}`)
    return (data || []) as unknown as Row[]
  }, [rpcArgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Total & jumlah nilai SELURUH hasil filter (bukan cuma halaman ini).
  // Sengaja fungsi TERPISAH & dipanggil SEKALI per perubahan filter: menghitung
  // 218rb baris itu 1.229 ms, sedangkan mengambil 50 baris cuma 126 ms — kalau
  // digabung jadi satu query (window function), LIMIT tak bisa berhenti lebih
  // awal & halamannya balik jadi 9,8 dtk. Lihat migrasi 20260814_06.
  const fetchRekap = useCallback(async (f: Applied): Promise<{ total: number; grand: number }> => {
    // Coba-ulang sekali kalau timeout — lihat lib/rpcUlang.ts. Aman dipasang
    // di sini justru karena rekapnya kini jalan di LATAR: percobaan kedua tak
    // menahan satu baris pun.
    const { data, error } = await rpcUlangJikaTimeout(() => supabase.rpc('fn_daftar_barang_rekap', rpcArgs(f)))
    if (error) throw new Error(`gagal menghitung total daftar barang: ${error.message}`)
    const r = ((data || []) as unknown as { total_count: number; grand_total: number }[])[0]
    return { total: Number(r?.total_count ?? 0), grand: Number(r?.grand_total ?? 0) }
  }, [rpcArgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seluruh baris visible — HANYA untuk Export. Layar tidak pernah memakainya.
  //
  // ⚠️ KURSOR, bukan offset (2026-09-03). Versi lama memanggil RPC dgn offset
  // 0, 1000, 2000, … dan itu GAGAL TOTAL untuk golongan besar: offset 50.000
  // saja 51 detik, sementara pagunya 8 detik — jadi Export 1.3.2 selalu mati di
  // sekitar halaman ke-20. Dengan kursor, ongkos tiap halaman rata (terukur
  // 220 halaman, terburuk 428 ms, total 11,3 dtk untuk 218.257 baris).
  async function fetchAllRows(f: Applied, onKemajuan?: (n: number) => void) {
    return ambilSemuaKeyset<Row, string>({
      halaman: (kursor, batas) => fetchPage(f, batas, 0, kursor),
      kursor: r => r.id,
      tanda: id => id,
      onKemajuan,
    })
  }

  // Jalur MENTAH — tanpa penyaringan visibilitas period-aware. HANYA untuk
  // Export Audit/Mutasi (BPK), yang memang harus memuat barang yang di layar
  // sudah tersembunyi (dihapus/diserap/dibatalkan) BERIKUT jejak penghapusannya.
  //
  // ⚠️ JANGAN ganti dengan `fetchAllRows` di atas. RPC menyaring yang tersembunyi
  // — itu benar untuk layar & Export biasa, tapi untuk berkas audit justru
  // MENGHILANGKAN baris yang jadi alasan berkas itu dibuat, tanpa satu pun pesan.
  //
  // ⚠️ Urutan pengambilannya PINDAH dari `(nilai_perolehan DESC, id)` ke
  // `(kode, nilai_perolehan DESC, id)` (2026-09-03). Bukan soal selera: urutan
  // lama tak dilayani index mana pun, jadi tiap halaman menyeret sort penuh &
  // dgn offset yang makin dalam ongkosnya tumbuh terus. Urutan baru KEMBAR
  // dengan `idx_aset_gol_urut`, jadi kursornya benar-benar melompat. Susunan
  // berkasnya sendiri TIDAK berubah — pemanggilnya tetap mengurutkan ulang
  // dengan `bandingKode`, yang memang persis urutan ini.
  async function fetchAllRowsRaw(f: Applied, onKemajuan?: (n: number) => void) {
    type RowKursor = Row & { nilai_teks: string | null }
    const jalankan = async (c: CabangKeyset) => {
      let q = buildQueryRaw(f)
      if (c.jenis === 'sisa') {
        const { kode, nilai, seri } = c.kursor
        q = q.eq('kode', kode).lte('nilai_perolehan', nilai)
          .or(`nilai_perolehan.lt.${nilai},and(nilai_perolehan.eq.${nilai},id.gt.${seri})`)
      } else if (c.setelahKode !== null) {
        q = q.gt('kode', c.setelahKode)
      }
      // ⚠️ `.order('id')` itu PEMECAH SERI, jangan dicopot: `nilai_perolehan`
      // punya ribuan kembar, dan tanpa urutan TOTAL, Postgres tak menjamin baris
      // kembar jatuh di halaman yang sama tiap query — ada yang terlewat & ada
      // yang dobel TANPA SUARA.
      const { data, error } = await q
        .order('kode').order('nilai_perolehan', { ascending: false }).order('id')
        .limit(c.batas)
      if (error) throw new Error(`gagal membaca daftar barang (audit): ${error.message}`)
      return (data || []) as unknown as RowKursor[]
    }
    return ambilSemuaKeyset<RowKursor, KursorKode>({
      halaman: halamanDuaCabang<RowKursor>(jalankan),
      // `nilai_teks` (hasil cast di server) yang dipakai, BUKAN angkanya —
      // lihat catatan presisi di buildQueryRaw & lib/keyset.ts.
      kursor: r => ({ kode: r.kode, nilai: r.nilai_teks ?? String(r.nilai_perolehan), seri: r.id }),
      tanda: tandaKursorKode,
      onKemajuan,
    })
  }


  // Jejak penghapusan per aset (untuk export Audit): No SK, tanggal, jenis, alasan —
  // dari ledger + jurnal_header. Penghapusan TERBARU per aset (id desc) yang menang.
  const fetchHapusInfo = useCallback(async (ids: string[]) => {
    const info = new Map<string, HapusInfo>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('transaksi_bmd')
        .select('aset_id,tanggal,jenis,header:header_id(no_sk,keterangan)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'] as never)
        .in('aset_id', ids.slice(i, i + 200))
        .order('id', { ascending: false })
      if (error) throw new Error(`gagal membaca jejak penghapusan: ${error.message}`)
      for (const r of (data || []) as unknown as { aset_id: string; tanggal: string; jenis: string; header: { no_sk: string | null; keterangan: string | null } | null }[]) {
        if (info.has(r.aset_id)) continue
        info.set(r.aset_id, { tgl: r.tanggal, no_sk: r.header?.no_sk ?? null, jenis: r.jenis, ket: r.header?.keterangan ?? null })
      }
    }
    return info
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lengkapi tampilan untuk SATU halaman: uraian kodefikasi & jumlah bidang
  // tanah. Dulu dijalankan atas SELURUH baris visible (218rb); kini cuma atas
  // 50 baris yang benar-benar tampil, jadi praktis gratis.
  const lengkapiHalaman = useCallback(async (rows: Row[], golongan: string) => {
    setUraianMap(await fetchUraian(rows.map(r => r.kode)))
    setBidangCount(golongan === '1.3.1' ? await fetchBidangCount(rows.map(r => r.id)) : {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // REKAP DI LATAR (2026-09-22). Dulu `handleTampilkan` MENUNGGU rekap sebelum
  // meminta baris pertamanya, dan itu yang membuat halaman ini terasa mati:
  // diukur ke produksi, `fn_daftar_barang_rekap` se-kabupaten 1.3.2 + kata
  // kunci = 16.299 ms (pagu `authenticated` 8.000 ms) sementara SATU HALAMAN
  // `fn_daftar_barang` cuma ratusan milidetik. Jadi operator menunggu rekap
  // tumbang lebih dulu, baru barisnya muncul — padahal barisnya sudah siap
  // sejak detik pertama. Sekarang keduanya jalan berbarengan: baris dulu,
  // angka menyusul (atau gagal jadi strip amber, perbaikan f3cb247).
  //
  // ⚠️ Ini AKALAN sementara, bukan obatnya. Sebabnya mesin DB kekecilan —
  // shared_buffers 224 MB lawan ±3,2 GB data panas, jadi rekapnya terikat I/O
  // (rinciannya di CLAUDE.md "REKAP yang gagal TIDAK BOLEH membunuh
  // daftarnya"). Begitu servernya pindah, yang perlu ditinjau ulang cuma
  // ambang SHOW_ALL_MAX di bawah, bukan pola ini.
  //
  // ⚠️ `seq` WAJIB diperiksa di TIAP titik sesudah `await`: rekap yang baru
  // pulang 20 detik kemudian akan menimpa layar yang sudah berganti filter,
  // dan angka milik filter lain yang duduk di kaki tabel yang benar adalah
  // kebohongan yang tak akan pernah terlihat sbg error.
  async function mulaiRekap(f: Applied, seq: number) {
    // Ditangkap SEKARANG, bukan dibaca dari ref sesudah `await`: kalau operator
    // menekan Tampilkan lagi di tengah jalan, ref-nya sudah menunjuk permintaan
    // LAIN dan yang ditunggu jadi baris milik filter yang bukan ini.
    const tunggu = barisSiap.current
    setRekapJalan(true)
    try {
      const rk = await fetchRekap(f)
      if (seq !== reqSeq.current) return
      setTotal(rk.total); setGrandTotal(rk.grand)
      // Mode "tampilkan semua" (≤ SHOW_ALL_MAX) dipertahankan persis seperti
      // dulu — cuma keputusannya kini diambil SESUDAH halaman pertama tampil.
      // Tak diterapkan kalau operator sudah pindah halaman duluan: mengganti
      // isi tabel di bawah tangannya lebih membingungkan daripada berguna.
      if (rk.total > SHOW_ALL_MAX) return
      // Tunggu jalur utama selesai dulu — lihat `barisSiap`.
      await tunggu
      if (seq !== reqSeq.current || pageRef.current !== 0) return
      if (rk.total > PAGE_SIZE) {
        const semua = await fetchPage(f, Math.max(rk.total, 1), 0)
        if (seq !== reqSeq.current || pageRef.current !== 0) return
        setData(semua)
        await lengkapiHalaman(semua, f.golongan)
        if (seq !== reqSeq.current) return
      }
      setShowAll(true)
    } catch (e) {
      if (seq !== reqSeq.current) return
      setErrRekap(`Jumlah & total nilai tak bisa dihitung: ${(e as Error).message}. Daftarnya sendiri TETAP benar — yang absen cuma angka rekapitulasinya. Persempit filter (pilih SKPD / jenis aset) supaya totalnya ikut terhitung.`)
    } finally {
      if (seq === reqSeq.current) setRekapJalan(false)
    }
  }

  async function handleTampilkan() {
    // Aturan dua mode (user 2026-08-14) diperiksa `rakit()`. Penegak
    // sesungguhnya `fn_dbar_guard` di DB; ini cuma supaya pesannya ramah &
    // muncul sebelum query ditembak.
    if (pesanFilter) { setErr(pesanFilter); return }
    const f = rakit()
    const seq = ++reqSeq.current
    pageRef.current = 0
    setApplied(f); setPage(0)
    setLoading(true); setErr(''); setErrRekap('')
    // Angka rekap milik filter LAMA tak boleh nongkrong di kaki tabel selama
    // filter baru dimuat. `null` = BELUM/TAK terhitung, sengaja bukan 0.
    setTotal(null); setGrandTotal(null); setShowAll(false)
    let tandaiBarisSiap: () => void = () => {}
    barisSiap.current = new Promise<void>(res => { tandaiBarisSiap = res })
    // Sengaja TIDAK di-`await` — lihat catatan di `mulaiRekap`.
    void mulaiRekap(f, seq)

    // ⚠️ SELURUH isi fungsi ini WAJIB di dalam try/finally. Sebelumnya tidak:
    // begitu satu query melempar (fetchOwnerOverrides sudah melempar sejak
    // 2026-07-28), promise-nya ditolak tanpa penangkap, `setLoading(false)` di
    // baris terakhir TAK PERNAH tercapai → tombol nyangkut "Memuat..." dan
    // tabel "Memuat data..." SELAMANYA, tanpa sepatah pun keterangan. Itu yang
    // terlihat operator sbg "Daftar Barang ndak muncul-muncul" padahal
    // penyebabnya statement timeout yang sama dgn Rekonsiliasi — bedanya
    // Rekonsiliasi punya try/catch jadi pesannya kelihatan, halaman ini tidak.
    try {

    // Visibilitas period-aware, kepemilikan pada periode, filter, & urutan —
    // SEMUANYA sudah dikerjakan `fn_daftar_barang` di server. Yang dulu di sini
    // (fetchAllRows 219 permintaan → partitionByPeriodOwner → fetchHiddenIds →
    // belumAdaPada → sort) kini tinggal dua panggilan.
    //
    // `fetchPosisiOverrides` TETAP dipanggil, dan itu disengaja: RPC memang
    // mengembalikan `owner_skpd`, tapi tampilan juga butuh `tahunMasuk` (segmen
    // tahun kode register) yang tak ada di sana. Query-nya dilayani partial
    // index `idx_trx_pindah_id` & cuma 183 baris, jadi ongkosnya ~10 ms.
    const posisi = await fetchPosisiOverrides(supabase, f.periode)
    setPosisiOverride(posisi)

    // Halaman PERTAMA, seukuran halaman biasa. Kalau rekap nanti melaporkan
    // hasilnya kecil (≤ SHOW_ALL_MAX), `mulaiRekap` yang menggantinya dengan
    // seluruh baris — jadi mode "tampilkan semua" tak hilang, cuma tak lagi
    // menyandera baris pertama.
    const rows = await fetchPage(f, PAGE_SIZE, 0)
    setData(rows)
    // Tak ada lagi "seluruh baris" di memori — Export menariknya sendiri.
    setAllVisible([])
    await lengkapiHalaman(rows, f.golongan)

    } catch (e) {
      // Fail-closed spt modul pelaporan: daftar yang kurang sebagian JAUH lebih
      // berbahaya daripada daftar yang menolak tampil — operator tak punya cara
      // tahu barangnya kurang, dan angkanya ikut diekspor ke Excel.
      setErr(`${(e as Error).message} — daftar tidak ditampilkan supaya tidak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat. Coba klik Tampilkan lagi; kalau berulang, kabari admin.`)
      // `null`, BUKAN 0 — di sini barisnya memang gagal dimuat, jadi jumlahnya
      // tak diketahui. "0 barang" akan berbohong tentang datanya.
      setAllVisible([]); setData([]); setTotal(null); setGrandTotal(null)
      // Rekap yang masih berjalan DIBATALKAN: "1.937 barang" di kaki tabel yang
      // barisnya justru gagal dimuat terbaca sbg "datanya ada, cuma layarnya
      // ngadat" — padahal yang benar sebaliknya.
      reqSeq.current++; setRekapJalan(false)
    } finally {
      // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
      // gagal bikin tombolnya nyangkut "Memuat..." selamanya.
      setLoading(false)
      // Dilepas di `finally` juga: kalau tidak, satu baris yang gagal dimuat
      // membuat rekap yang sehat menunggu selamanya.
      tandaiBarisSiap()
    }
  }

  // Pindah halaman = SATU permintaan 50 baris (~126 ms), bukan memotong array
  // 218rb baris di memori. `applied` (bukan nilai filter yang sedang diketik)
  // yang dipakai — supaya mengganti filter tanpa menekan Tampilkan tak
  // diam-diam menggeser isi halaman.
  //
  // ⚠️ Seluruh badan fungsi di dalam try/finally, `setLoading(false)` di
  // `finally`, dan errornya DITAMPILKAN — aturan yang sama dgn handleTampilkan.
  // Tanpa itu satu query gagal bikin tombol halaman nyangkut "Memuat..."
  // selamanya tanpa sepatah pun keterangan.
  async function goPage(pg: number) {
    if (!applied) return
    // Dibaca `mulaiRekap` yang berjalan di latar: begitu operator pindah
    // halaman, mode "tampilkan semua" tak boleh lagi menimpa isi tabelnya.
    pageRef.current = pg
    setPage(pg)
    setLoading(true); setErr('')
    try {
      const rows = await fetchPage(applied, PAGE_SIZE, pg * PAGE_SIZE)
      setData(rows)
      await lengkapiHalaman(rows, applied.golongan)
    } catch (e) {
      setErr(`${(e as Error).message} — halaman ini tidak ditampilkan supaya tidak ada yang terbaca sebagai lengkap padahal gagal dimuat.`)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  // Luas Tanah: Σ bidang kalau asetnya punya bidang, kalau tidak `aset.luas`.
  // (Di Export Audit, barang yang sudah dihapus tak ikut di-fetch bidangnya —
  // otomatis jatuh ke aset.luas, dan memang itu nilai terakhir yang tercatat.)
  // ⚠️ `bc` WAJIB dilewatkan oleh Export. Sejak paginasi pindah ke server,
  // state `bidangCount` cuma memuat baris HALAMAN YANG SEDANG TAMPIL (50), jadi
  // memakainya untuk seluruh isi Export akan diam-diam menjatuhkan hampir semua
  // baris ke `aset.luas` — padahal Σ bidang yang otoritatif. Export menghitung
  // petanya sendiri atas baris yang benar-benar diekspor.
  // Aturannya (Σ hanya sah kalau SEMUA bidang berluas) → lib/luasBidang.ts.
  // Diangkat 2026-09-15 di kemunculan KETIGA; jangan ditulis ulang di sini.
  function luasOf(r: Row, bc: Record<string, { n: number; nLuas: number; luas: number | null }> = bidangCount): number | null {
    return luasEfektif(bc[r.id], r.luas)
  }

  async function handleExport() {
    if (!applied) return
    setExporting(true); setErr('')
    try {
    // Sejak paginasi pindah ke server, seluruh baris TIDAK lagi ada di memori —
    // Export menariknya sendiri lewat RPC yang sama (halaman demi halaman, tetap
    // period-aware). Untuk 1.3.2 se-kabupaten ini 219 permintaan & memang lama,
    // tapi kini cuma terjadi kalau operator SENGAJA menekan Export.
    // ⚠️ JANGAN kembalikan ke `allVisible`: state itu sekarang selalu kosong,
    // dan berkas Excel kosong yang terunduh tanpa pesan apa pun adalah persis
    // jenis kegagalan senyap yang paling mahal di modul ini.
    const all = await fetchAllRows(applied, setProgres)
    setProgres(0)
    const uraian = await fetchUraian(all.map(r => r.kode))
    // Peta bidang khusus baris yang diekspor — lihat catatan di `luasOf`.
    const bidangEx = applied.golongan === '1.3.1' ? await fetchBidangCount(all.map(r => r.id)) : {}
    const keys = exportColsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'nibar': return r.nibar || ''
          // String, BUKAN angka — 45 digit sbg numerik jadi notasi ilmiah di
          // Excel & digit belakangnya hilang tanpa suara.
          case 'kode_register': return r.kode_register || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'lokasi': return r.alamat_detail || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          // Kosong → jatuh ke label cara perolehan (menu yang mencatat barang
          // ini). Di Excel tak ditandai apa-apa: bagi pembaca berkas keduanya
          // sama-sama "asal usul barang", dan penandaan cuma bikin bingung.
          case 'asal_usul': return asalUsulTampil(r.asal_usul, r.cara_perolehan).teks
          case 'penggunaan': { const t = penggunaanTampil(r); return [t.pengamanan, t.pemanfaatan].filter(Boolean).join(' · ') || t.dasar || '' }
          case 'keterangan': return r.keterangan || ''
          case 'luas': return luasOf(r, bidangEx) ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          case 'nopol': return r.no_polisi || ''
          case 'rangka': return r.no_rangka || ''
          case 'mesin': return r.no_mesin || ''
          case 'bpkb': return r.no_bpkb || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = {}
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      return obj
    }), namaBerkasLaporan({
      laporan: 'Daftar Barang', periode: applied.periode, golongan: applied.golongan,
      skpd: applied.skpdId ? skpdMap[applied.skpdId] : null,
    }), 'Daftar Barang')
    } catch (e) {
      // Berkas Excel yang isinya kurang sebagian TIDAK BOLEH terlanjur terunduh —
      // sekali tersimpan, tak ada lagi tanda bahwa datanya tak lengkap.
      setErr(`gagal menyiapkan export: ${(e as Error).message} — berkas tidak dibuat supaya tidak ada Excel setengah jadi yang beredar.`)
    } finally {
      setExporting(false); setProgres(0)
    }
  }

  // Export Audit/Mutasi (BPK): SEMUA barang termasuk yang dihapus, + kolom jejak
  // penghapusan (status, no. SK, tanggal, alasan). Barang aktif → kolom hapus kosong.
  async function handleExportAudit() {
    if (!applied) return
    setExporting(true); setErr('')
    try {
    // Diurutkan sendiri: berkas ini TIDAK lewat `allVisible` (dia menarik ulang
    // termasuk barang yang sudah dihapus), jadi tanpa baris ini susunannya ikut
    // urutan ambil dari DB dan beda sendiri dari Export Excel & layar.
    const allMentah = (await fetchAllRowsRaw(applied, setProgres)).sort(bandingKode)
    // ⚠️ Kode register PADA periode itu, bukan posisi terakhir (2026-09-13).
    // Layar & Export Excel biasa sudah period-aware DI SERVER (`fn_daftar_barang`
    // memanggil `fn_dbar_kode_register_at`), tapi berkas AUDIT sengaja lewat
    // jalur MENTAH supaya barang yang di layar sudah tersembunyi tetap ikut —
    // jadi ia butuh aturan yang sama di sisi klien. Tanpa ini berkas audit
    // periode lampau untuk BPK menyebut kode yang saat itu belum terbit,
    // sementara Export Excel di menu yang SAMA menyebut kode yang benar.
    // Fail-closed: `fetchRiwayat…` MELEMPAR & handler ini sudah try/catch/finally.
    const riwayatKodeReg = await fetchRiwayatKodeRegister(supabase)
    const all = allMentah.map(r => ({
      ...r,
      kode_register: kodeRegisterPada(riwayatKodeReg, r.id, applied.periode, r.kode_register),
    }))
    setProgres(0)
    const uraian = await fetchUraian(all.map(r => r.kode))
    // Peta bidang khusus baris yang diekspor — `bidangCount` di state cuma
    // memuat halaman yang sedang tampil sejak paginasi pindah ke server.
    const bidangEx = applied.golongan === '1.3.1' ? await fetchBidangCount(all.map(r => r.id)) : {}
    const hapus = await fetchHapusInfo(all.filter(r => r.status !== 'aktif').map(r => r.id))
    const keys = exportColsFor(applied.golongan)
    exportToExcel(all.map(r => {
      const cell = (key: string): string | number => {
        switch (key) {
          case 'skpd': return skpdMap[r.skpd_id ?? -1] || ''
          case 'nama': return r.nama_barang || ''
          case 'kode': return r.kode
          case 'uraian': return uraian[r.kode] || ''
          case 'nibar': return r.nibar || ''
          // String, BUKAN angka — 45 digit sbg numerik jadi notasi ilmiah di
          // Excel & digit belakangnya hilang tanpa suara.
          case 'kode_register': return r.kode_register || ''
          case 'merek': return r.merek_tipe || ''
          case 'spesifikasi': return r.spesifikasi_lainnya || ''
          case 'lokasi': return r.alamat_detail || ''
          case 'komptabel': return r.intra_ekstra || ''
          case 'tgl': return r.tgl_perolehan || ''
          case 'nilai': return r.nilai_perolehan
          // Kosong → jatuh ke label cara perolehan (menu yang mencatat barang
          // ini). Di Excel tak ditandai apa-apa: bagi pembaca berkas keduanya
          // sama-sama "asal usul barang", dan penandaan cuma bikin bingung.
          case 'asal_usul': return asalUsulTampil(r.asal_usul, r.cara_perolehan).teks
          case 'penggunaan': { const t = penggunaanTampil(r); return [t.pengamanan, t.pemanfaatan].filter(Boolean).join(' · ') || t.dasar || '' }
          case 'keterangan': return r.keterangan || ''
          case 'luas': return luasOf(r, bidangEx) ?? ''
          case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
          case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
          case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
          case 'hak': return r.jenis_hak || ''
          case 'nopol': return r.no_polisi || ''
          case 'rangka': return r.no_rangka || ''
          case 'mesin': return r.no_mesin || ''
          case 'bpkb': return r.no_bpkb || ''
          default: return ''
        }
      }
      const obj: Record<string, string | number> = {}
      for (const k of keys) obj[COL_META[k].header] = cell(k)
      const hi = hapus.get(r.id)
      obj['Status'] = r.status === 'aktif' ? 'Aktif' : 'Dihapus'
      obj['Tgl Penghapusan'] = hi?.tgl || ''
      obj['No. SK Penghapusan'] = hi?.no_sk || ''
      obj['Jenis Penghapusan'] = HAPUS_LABEL[hi?.jenis || ''] || ''
      obj['Alasan Penghapusan'] = hi?.ket || ''
      return obj
    }), namaBerkasLaporan({
      laporan: 'Daftar Barang', periode: applied.periode, golongan: applied.golongan,
      skpd: applied.skpdId ? skpdMap[applied.skpdId] : null, akhiran: ['Audit'],
    }), 'Daftar Barang (Audit)')
    } catch (e) {
      // Ini berkas untuk BPK/inspektorat — justru yang PALING tak boleh
      // terunduh dalam keadaan kurang sebagian.
      setErr(`gagal menyiapkan Export Audit: ${(e as Error).message} — berkas tidak dibuat supaya tidak ada Excel setengah jadi yang beredar.`)
    } finally {
      setExporting(false); setProgres(0)
    }
  }

  // ⚠️ Tanpa total (rekap gagal), jumlah halaman TAK DIKETAHUI — dan `0` di
  // sini akan MEMATIKAN tombol "Berikutnya" lalu mengurung operator di halaman
  // 1 padahal barisnya ada. Pandunya "halaman ini penuh" (`adaLagi`), pola yang
  // sama dgn Saldo Awal → Daftar Barang Awal (CLAUDE.md).
  const adaLagi = data.length === PAGE_SIZE
  const totalPages = total == null ? (adaLagi ? page + 2 : page + 1) : Math.ceil(total / PAGE_SIZE)
  const skpdNama = applied?.skpdId ? skpdMap[applied.skpdId] : undefined
  const cols = applied ? colsFor(applied.golongan) : KOLOM_DEFAULT
  const nilaiIdx = cols.indexOf('nilai')

  // SKPD pemilik pada periode terpilih (period-aware): override kalau barang
  // pernah dialihkan; kalau tidak, pakai skpd_id terkini.
  const ownerSkpd = (r: Row): number | null => posisiOverride.get(r.id)?.skpd ?? r.skpd_id

  function cellContent(key: string, r: Row): React.ReactNode {
    switch (key) {
      case 'skpd': return skpdMap[ownerSkpd(r) ?? -1] || '-'
      case 'nama': {
        // Kode register DIBACA dari kolom, tidak dihitung di sini — nomor urutnya
        // diterbitkan sekali lalu dibekukan oleh trigger di DB. Menghitungnya di
        // layar akan menggeser nomor semua barang di bawahnya tiap kali ada satu
        // yang hilang, padahal kode ini tercetak di label barang, KIR, dan BAST.
        const bergeser = bergeserDariNibar(r.nibar, r.kode_register)
        return (
        <>
          <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
          <p className="text-gray-400 text-xs mt-0.5">{r.nibar || '-'}</p>
          {/* Baris ketiga = kode register. Ditandai HANYA kalau bergeser dari
              NIBAR. `bergeser === null` (NIBAR kosong / warisan e-BMD yang
              layoutnya beda) sengaja tidak ditandai apa-apa: menandai 150rb
              barang warisan bikin 148 yang benar-benar bergeser tenggelam. */}
          <p className={`text-[11px] mt-0.5 ${bergeser ? 'text-amber-600 font-medium' : 'text-gray-300'}`}
            title={bergeser
              ? 'Kode register: posisi barang ini sudah bergeser dari NIBAR-nya (pernah pindah unit / reklas)'
              : 'Kode register (posisi terakhir barang)'}>
            {r.kode_register ? `REG ${r.kode_register}${bergeser ? ' ⚠' : ''}` : 'REG —'}
          </p>
        </>
        )
      }
      case 'kode': return (
        <>
          <p className="font-medium text-gray-700 text-xs">{r.kode}</p>
          <p className="text-gray-400 text-xs mt-0.5">{uraianMap[r.kode] || '-'}</p>
        </>
      )
      case 'uraian': return uraianMap[r.kode] || '-'
      case 'merek': return r.merek_tipe || '-'
      case 'spesifikasi': return r.spesifikasi_lainnya || '-'
      case 'lokasi': return r.alamat_detail || '-'
      case 'komptabel': return r.intra_ekstra || '-'
      case 'tgl': return r.tgl_perolehan || '-'
      case 'nilai': return angka(r.nilai_perolehan)
      case 'asal_usul': {
        // Isian operator menang; kalau kosong pakai label cara perolehan.
        // Yang turunan dibuat lebih redup + ber-tooltip supaya operator tahu
        // itu bukan hasil ketikan siapa pun & masih bisa diperinci lewat
        // Koreksi → Spesifikasi (mis. jadi "Pengadaan APBD").
        const { teks, turunan } = asalUsulTampil(r.asal_usul, r.cara_perolehan)
        if (!teks) return '-'
        if (!turunan) return teks
        return (
          <span className="text-gray-400 italic" title="Belum diisi — ditampilkan dari cara perolehan barang ini. Isi lebih rinci lewat Pembukuan → Koreksi → Spesifikasi Barang.">
            {teks}
          </span>
        )
      }
      case 'penggunaan': {
        // Pemanfaatan/Pengamanan aktif MENDUDUKI teks baseline (permintaan
        // user 2026-09-23) — pola persis Σ luas bidang vs luas register.
        // ⚠️ Gedung & Bangunan bisa punya KEDUANYA sekaligus (satu ruang
        // dikustodi, ruang lain disewakan) → ditumpuk, bukan salah satu dibuang.
        const t = penggunaanTampil(r)
        if (!t.pengamanan && !t.pemanfaatan) return t.dasar || '-'
        return (
          <>
            {t.pengamanan && <p className="text-xs text-gray-600">{t.pengamanan}</p>}
            {t.pemanfaatan && (
              // Hijau + tautan (permintaan user 2026-09-23): satu-satunya
              // ruas yang punya "rumah" untuk dituju — kartu Pemanfaatan
              // barang ini, lewat deep-link `?skpd=&nibar=` (lihat komentar
              // kepala components/pengelolaan/Pemanfaatan.tsx). Pengamanan
              // TIDAK ditautkan: menunya tak punya deep-link per barang.
              <Link
                href={`/dashboard/pembukuan/pengelolaan/pemanfaatan?skpd=${r.skpd_id ?? ''}&nibar=${encodeURIComponent(r.nibar || '')}`}
                className="text-xs text-green-700 hover:underline hover:text-green-800"
                title="Lihat perjanjian pemanfaatan barang ini di menu Pemanfaatan">
                {t.pemanfaatan}
              </Link>
            )}
          </>
        )
      }
      case 'keterangan': return r.keterangan || '-'
      case 'luas': { const v = luasOf(r); return v != null ? angkaLuas(v) : '-' }
      case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || '-'
      case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || '-'
      case 'atas_nama': return r.nama_dokumen_kepemilikan || '-'
      case 'hak': {
        const b = bidangCount[r.id]
        return (
          <>
            <p className="text-xs text-gray-600">{r.jenis_hak || '-'}</p>
            {(b?.n || 0) > 0 && (
              <Link href={`/dashboard/gis?cari=${encodeURIComponent(r.nibar || '')}`}
                className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-teal hover:underline"
                title="Tanah ini terbagi beberapa bidang/sertifikat — kelola & lihat di GIS Tanah">
                🗺 {b.n} bidang
              </Link>
            )}
          </>
        )
      }
      case 'nopol': return r.no_polisi || '-'
      case 'rangka': return r.no_rangka || '-'
      case 'mesin': return r.no_mesin || '-'
      case 'bpkb': return r.no_bpkb || '-'
      default: return '-'
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang</h1>
        <p className="text-gray-500 text-sm mt-1">Register BMD per jenis aset — pilih jenis aset lalu klik Tampilkan.</p>
      </div>

      {/* Filter data */}
      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Lokasi / SKPD :</label>
            <SkpdCombobox lockToOperator onChangeSelection={sel => setFSel({ skpdId: sel.skpdId, descIds: sel.descendantIds })} allowClear
              placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          {fSel.skpdId != null && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <span className="hidden sm:block sm:w-40 flex-shrink-0" />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="db_konsol" checked={fKonsolidasi} onChange={() => setFKonsolidasi(true)} />
                  Konsolidasi (+ seluruh unit di bawahnya)
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="db_konsol" checked={!fKonsolidasi} onChange={() => setFKonsolidasi(false)} />
                  SKPD ini saja
                </label>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter w-full sm:flex-1 min-w-0" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
              <option value="">— pilih jenis aset (wajib) —</option>
              {GOLONGAN_DAFTAR_BARANG.map(g => (
                <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>
              ))}
            </select>
          </div>
          {fGolongan !== '1.3.1' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Komptabel :</label>
              <select className="select-filter w-full sm:flex-1 min-w-0" value={fKomptabel} onChange={e => setFKomptabel(e.target.value)}>
                <option value="">Semua</option>
                <option value="intra">Intrakomptabel</option>
                <option value="ekstra">Ekstrakomptabel</option>
              </select>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Posisi Semester :</label>
            <div className="flex flex-wrap items-center gap-3">
              <select className="select-filter w-28" value={fTahun} onChange={e => setFTahun(e.target.value)}>
                {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="flex flex-wrap gap-4">
                {[['1', 'Semester I'], ['2', 'Semester II']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="radio" name="db_smt" checked={fSmt === v} onChange={() => setFSmt(v)} />{l}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Cari :</label>
            <input className="select-filter w-full sm:flex-1 min-w-0"
              placeholder="Nama barang / kode barang / NIBAR / kode register / merek / no. polisi / no. rangka / no. mesin / alamat / kode wilayah / keterangan..."
              value={fSearch} onChange={e => setFSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTampilkan() }} />
          </div>
          {fSearch.trim().length > 0 && fSearch.trim().length < 3 && (
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3">
              <span className="hidden sm:block sm:w-40 flex-shrink-0" />
              {/* Index trigram (20260914_01) cuma menolong kata kunci ≥ 3 huruf. */}
              <span className="text-xs text-amber-700">Kata kunci kurang dari 3 karakter — pencarian tetap jalan, tapi jauh lebih lambat.</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="hidden sm:block sm:w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={handleTampilkan} disabled={loading || !fGolongan}>
              {loading ? 'Memuat...' : 'Tampilkan'}
            </button>
            {!fGolongan && <span className="text-xs text-gray-400">Pilih jenis aset dulu.</span>}
          </div>
        </div>
      </div>

      {err && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      )}

      {/* ⚠️ PERINGATAN (amber), bukan pembatal (merah): peta rujukan cuma
          LABEL — nama SKPD per baris & nama jenis aset di dropdown. Tak satu
          pun angka bergantung padanya, jadi menjatuhkan daftar gara-gara ini
          justru merugikan. Yang tak boleh cuma MENELANNYA: kolom SKPD yang
          tampil "-" terbaca operator sbg "barang ini memang tak bertuan". */}
      {errRef && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {errRef} — daftar & angkanya tetap benar, yang terdampak cuma nama yang ditampilkan.
        </div>
      )}

      {/* Rekap gagal ≠ data gagal — amber, bukan merah. Lihat `handleTampilkan`. */}
      {errRekap && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">⚠ {errRekap}</div>
      )}

      {/* Hasil */}
      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Pilih <span className="font-medium text-gray-600">jenis aset</span> di atas lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <>
        <TahunTerkunciNote tahun={Number(applied.periode.slice(0, 4))} />
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total == null ? (rekapJalan ? 'menghitung jumlah…' : 'jumlah tak terhitung') : `${total.toLocaleString('id-ID')} barang`}{skpdNama ? ` — ${skpdNama}` : ''}
              {applied.golongan ? ` · ${applied.golongan} ${golonganLabels[applied.golongan] || ''}` : ''}
              {` · posisi ${applied.periode}`}
            </span>
            <div className="flex items-center gap-3">
              {/* Penyebut disembunyikan kalau totalnya tak terhitung — "/ 2"
                  yang dikarang dari "halaman ini penuh" akan berbohong. */}
              {!showAll && <span className="text-sm text-gray-500">Hal. {page + 1}{total == null ? '' : ` / ${totalPages || 1}`}</span>}
              <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary text-xs"
                title={`Posisi barang pada ${applied.periode} (sesuai filter semester)`}>
                {exporting ? `Mengekspor${progres ? ` ${progres.toLocaleString('id-ID')} baris` : ''}...` : 'Export Excel'}
              </button>
              <button onClick={handleExportAudit} disabled={exporting} className="btn-secondary text-xs"
                title="Audit/Mutasi — SEMUA barang termasuk yang dihapus + jejak SK penghapusan (untuk BPK, lintas periode)">
                {exporting ? '...' : 'Export Audit'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{cols.map(k => <th key={k} className={thClass(k)}>{thContent(k)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={cols.length} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={cols.length} className="table-td text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                ) : data.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {cols.map(k => <td key={k} className={tdClass(k, i % 2 !== 0)}>{cellContent(k, row)}</td>)}
                  </tr>
                ))}
              </tbody>
              {!loading && data.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    {/* Tak terhitung → katakan TERUS TERANG. Angka nol atau
                        jumlah halaman berjalan di baris TOTAL akan dibaca sbg
                        total SELURUH hasil filter, dan itu berbohong. */}
                    <td className="table-td text-xs" colSpan={nilaiIdx}>
                      TOTAL ({total == null ? (rekapJalan ? 'menghitung jumlah…' : 'jumlah tak terhitung') : `${total.toLocaleString('id-ID')} barang`})
                    </td>
                    <td className="table-td text-right text-xs">{grandTotal == null ? (rekapJalan ? 'menghitung…' : 'tak terhitung') : grandTotal ? angka(grandTotal) : '…'}</td>
                    {cols.length - nilaiIdx - 1 > 0 && <td className="table-td" colSpan={cols.length - nilaiIdx - 1} />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!showAll && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button className="btn-secondary" disabled={page === 0 || loading} onClick={() => goPage(page - 1)}>← Sebelumnya</button>
              <button className="btn-secondary" disabled={page >= totalPages - 1 || loading} onClick={() => goPage(page + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
