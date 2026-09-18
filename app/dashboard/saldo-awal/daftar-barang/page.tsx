'use client'
// Saldo Awal → Daftar Barang Awal. Gabungan Daftar Barang + Penyusutan pada posisi
// saldo awal 2026 (= saldo akhir 2025), sumber aset_awal_2026 (angka penyusutan
// baseline: masa manfaat, beban/smt, akumulasi 2025, nilai buku awal, sisa).
//
// KOLOM MENGIKUTI DAFTAR BARANG per jenis aset — dan sejak 2026-09-15 keduanya
// benar-benar MEMBACA DAFTAR YANG SAMA (`kolomGolongan` di lib/kolomBarang.ts),
// bukan lagi dua salinan yang dijaga komentar. Lalu DISISIPI kolom penyusutan
// baseline di sekitar Nilai Perolehan: Masa Manfaat sebelum, Beban/Smt ·
// Akumulasi 2025 · Nilai Buku Awal · Sisa sesudah. Jenis aset yang MEMANG TIDAK
// DISUSUTKAN (Tanah 1.3.1, Aset Tetap Lainnya 1.3.5, KDP 1.3.6 — flag
// `disusutkan` di GOLONGAN_REKAP) TIDAK dapat kolom-kolom itu sama sekali:
// isinya cuma nol/duplikat nilai perolehan, cuma bikin tabel melar.
// "Lokasi" di sini = `alamat_detail` + rantai wilayah (`wilayah_kode` → Desa,
// Kec., Kabupaten), sementara Daftar Barang baru menampilkan alamat_detail saja.
//
// TANAH — luas & lokasi punya DUA kemungkinan sumber, dan bidang yang menang:
// kalau asetnya punya baris di `aset_bidang_tanah` (menu GIS Tanah), Luas = Σ
// bidang & Lokasi diringkas dari bidang-bidangnya; kalau belum punya bidang
// sama sekali, jatuh ke kolom snapshot yang BOLEH diisi manual lewat Edit
// Spesifikasi (TANAH_TANPA_BIDANG_FIELDS di lib/asetFields.ts). Σ-nya dihitung
// SAAT TAMPIL, sengaja TIDAK disimpan balik ke kolom mana pun: angka tersimpan
// bakal basi tiap bidang ditambah/diedit/dihapus (tak ada trigger/cron yang
// menjaganya), dan snapshot 2025 tak boleh ikut bergerak mengikuti data hidup.
// Aturan yang sama dipakai Daftar Barang, bedanya cadangannya `aset.luas`.
//
// TAMPILAN mengikuti pola Daftar Barang juga: hasil ≤ SHOW_ALL_MAX baris →
// tampilkan SEMUA sekaligus (tanpa halaman); lebih dari itu → paginasi SERVER
// (range PostgREST, 50/hal). Sengaja TIDAK menarik semua baris golongan ke
// browser seperti Daftar Barang: di sini tak ada visibilitas period-aware yang
// harus dihitung di client, jadi paginasi server tetap yang benar (CLAUDE.md
// "PERFORMA Daftar Barang & Penyusutan"). ⚠️ Halaman ini baca TABEL LANGSUNG
// (bukan RPC spt Rekapitulasi) — RLS-nya WAJIB InitPlan (migrasi 20260728_02),
// kalau tidak query tanpa filter SKPD tembus statement timeout.
//
// Koreksi SPESIFIKASI (bukan angka) bisa dilakukan langsung di sini — centang
// barang → "Edit Spesifikasi". Angkanya beku & dikunci di DB (migrasi
// 20260728_01: GRANT per-kolom + trigger). Simpan menulis ke DUA tabel
// sekaligus: snapshot `aset_awal_2026` + kolom yang sama di register `aset`
// (dicocokkan NIBAR), keduanya UPDATE biasa TANPA event ledger — spesifikasi
// itu data deskriptif, bukan peristiwa akuntansi (pola sama dgn KIR). Yang
// butuh jejak audit + tombol Batal tetap lewat Pembukuan → Koreksi.
//
// HANYA untuk barang yang BELUM BERGERAK: aset yang pernah kena koreksi
// spesifikasi, reklas kode/golongan, atau pindah SKPD ditandai 🔒 dan centangnya
// mati — koreksinya wajib lewat menu Koreksi. Penegaknya trigger DB (migrasi
// 20260728_01 bagian 3); 🔒 di sini cuma biar operator tak klik lalu kena error.
import { KOLOM_META, NOWRAP_KEYS, kolomGolongan } from '@/lib/kolomBarang'
import PeringatanNamaSkpd from '@/components/PeringatanNamaSkpd'
import { useNamaSkpdMap } from '@/components/useNamaSkpdMap'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEditSpekAwal } from './useEditSpekAwal'
import type { Row, BidangAgg } from './tipe'
import { luasBidangSah, luasEfektif } from '@/lib/luasBidang'

import { exportToExcel, formatRupiah2 } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { koreksiFieldKeys, allSameGolongan, ASET_NUM_COLS, type FieldKey } from '@/lib/asetFields'
import { ambilSemuaKeyset, halamanDuaCabang, tandaKursorKode, type CabangKeyset, type KursorKode } from '@/lib/keyset'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import EditSpesifikasiModal from '@/components/pengelolaan/EditSpesifikasiModal'
import { useIsViewer } from '@/components/useIsViewer'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

const PAGE_SIZE = 50
const SHOW_ALL_MAX = 3000 // di bawah ini → render semua baris tanpa halaman

type Applied = { org: OrgSelection; golongan: string; komptabel: string; search: string }
// Rekap bidang tanah per aset (dari aset_bidang_tanah, menu GIS Tanah).
// luas = Σ bidang; wilayah/alamat = daftar UNIK (satu register bisa banyak bidang).
// nLuas = berapa bidang yang luasnya terisi. Σ HANYA sah kalau nLuas === n —
// kalau cuma sebagian bidang yang berisi, jumlahnya lebih kecil dari luas
// sebenarnya & bakal terbaca sebagai penyusutan luas yang tak pernah terjadi.
// (Per 2026-07-28 ini bukan kasus langka: dari 529 bidang, baru 4 yang berluas.)

const COLS = [
  'nibar', 'kode', 'nama_barang', 'skpd_id', 'intra_ekstra', 'tgl_perolehan', 'tahun_pengadaan', 'nilai_perolehan',
  'akumulasi_2025', 'sisa_masa_manfaat_smt', 'nilai_buku_awal', 'masa_manfaat_smt',
  'beban_penyusutan_per_smt', 'foto_paths',
  'merek_tipe', 'spesifikasi_lainnya', 'no_polisi', 'no_rangka', 'no_mesin', 'no_bpkb',
  'alamat_detail', 'wilayah_kode', 'luas', 'jenis_hak',
  'nomor_dokumen_kepemilikan', 'tanggal_dokumen_kepemilikan', 'nama_dokumen_kepemilikan',
  'asal_usul', 'penggunaan_pengamanan',
].join(',')

// Angka RUPIAH polos bergaya id-ID tanpa "Rp" — SELALU 2 desimal sejak
// 2026-09-09 (keputusan user): halaman ini dulu membulatkan ke 0 desimal
// sementara Saldo Awal → Rekapitulasi & Laporan BMD menampilkan desimalnya,
// jadi angka baseline yang SAMA terbaca beda tergantung menu. Satu sumber:
// `formatRupiah2` di lib/export.
// ⚠️ Cuma dipakai `cellContent` (layar) & baris subtotal. `cellValue()` untuk
// Export tetap mengembalikan angka MENTAH supaya selnya bertipe angka di Excel.
const angka = formatRupiah2

// LUAS (m²) BUKAN rupiah — tetap tanpa desimal paksa, dipisah supaya perubahan
// format uang di atas tak ikut mengubah kolom luas.
const angkaLuas = (v: number | null | undefined) =>
  v == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v)

// ── Kotak "Cari" (server-side, PostgREST `or=`) ─────────────────────────────
// Bidang yang dicocokkan: nama barang, NIBAR, kode, merek/tipe, nomor identitas
// kendaraan (polisi/rangka/mesin), alamat & kode wilayah, + nilai perolehan
// (permintaan user 2026-07-30, dilebarkan 2026-09-15 supaya SEJAJAR dgn Daftar
// Barang — lihat `KOLOM_CARI` di lib/cariBarang.ts).
//
// ⚠️ DUA KOLOM Daftar Barang TAK BISA ikut disamakan, dan itu BUKAN kelupaan:
//   - `kode_register` TAK ADA di `aset_awal_2026` sama sekali — tabel ini
//     snapshot BEKU posisi akhir 2025, sedangkan kode register itu konsep
//     "posisi TERAKHIR" yang cuma berlaku di register hidup (`aset`).
//   - `keterangan` juga tak tersimpan di tabel ini; kolom yang tampil di layar
//     (`ketMap`) hasil lookup TERPISAH ke `aset` per NIBAR SESUDAH baris
//     snapshot-nya ditarik (lihat `fetchAsetInfo`) — bukan filter yang bisa
//     dilipat ke `.or()` tanpa subquery/join tambahan.
// Sebaliknya `nilai_perolehan` di sini LEBIH LEBAR dari Daftar Barang (yang
// belum mendukungnya sama sekali) — dipertahankan, bukan dibuang, demi
// "samain" bukan berarti menyempitkan yang sudah ada.
//
// Nilai WAJIB dikutip ganda. Tanpa itu satu koma / tanda kurung yang diketik
// operator memecah sintaks `or=` di tengah jalan → PostgREST menolak dgn
// "failed to parse logic tree" dan halaman gagal muat, padahal yang salah cuma
// tanda baca di kotak pencarian. Nama barang e-BMD banyak yang berkoma
// ("Meja, Kursi Rapat"), jadi ini bukan kasus langka.
const kutip = (s: string) => `"${s.replace(/["\\]/g, m => `\\${m}`)}"`

// Nilai perolehan: dicocokkan PERSIS (`eq`), bukan mengandung — kolomnya numeric
// & yang dicari operator selalu satu angka utuh dari kolom Nilai Perolehan.
// Titik/koma/spasi pemisah ribuan dibuang dulu supaya "686.700.000" hasil salin
// dari layar tetap ketemu. Klausa ini cuma ikut kalau sisanya BENAR-BENAR angka;
// kalau tidak, PostgREST menolak seluruh filter (numeric vs teks), yang artinya
// pencarian teks biasa pun ikut mati.
function orCari(cari: string): string {
  const q = cari.trim()
  const suka = kutip(`%${q}%`)
  const klausa = [
    `nama_barang.ilike.${suka}`,
    `nibar.ilike.${suka}`,
    // Substring, bukan prefix — dulu `kode.ilike.'${q}%'`, disamakan dgn Daftar
    // Barang yang mencocokkan kode di posisi mana pun.
    `kode.ilike.${suka}`,
    `merek_tipe.ilike.${suka}`,
    `no_polisi.ilike.${suka}`,
    `no_rangka.ilike.${suka}`,
    `no_mesin.ilike.${suka}`,
    `alamat_detail.ilike.${suka}`,
    `wilayah_kode.ilike.${suka}`,
  ]
  const bersih = q.replace(/[.,\s]/g, '')
  if (bersih && /^\d+$/.test(bersih)) klausa.push(`nilai_perolehan.eq.${bersih}`)
  return klausa.join(',')
}

const golLabel = (kode: string) => GOLONGAN_REKAP.find(g => g.kode === kodeLevel3(kode))?.uraian || kodeLevel3(kode)
const newKey = () => Math.random().toString(36).slice(2)

// ── Kolom per jenis aset ────────────────────────────────────────────────────
// Judul & perataan kolom. Yang DIPAKAI BERSAMA Daftar Barang ada di
// lib/kolomBarang.ts (`KOLOM_META`) — termasuk ketiga judul Dokumen
// Kepemilikan, yang WAJIB sama persis di dua menu karena berkasnya sering
// disandingkan berdampingan. Di bawah ini tinggal kolom yang memang hanya
// milik halaman ini.
const COL_META: Record<string, { header: string; align?: 'right' | 'center' }> = {
  ...KOLOM_META,
  // ── Kolom penyusutan baseline — tak ada di Daftar Barang ────────────────
  mm: { header: 'Masa Manfaat (Smt)', align: 'center' },
  beban: { header: 'Beban / Smt', align: 'right' },
  akum: { header: 'Akumulasi 2025', align: 'right' },
  buku: { header: 'Nilai Buku Awal', align: 'right' },
  sisa: { header: 'Sisa (Smt)', align: 'center' },
  // ── Dua kolom GABUNGAN, HANYA untuk layar (lihat colsLayar) ─────────────
  // Excel tetap memakai kolom terpisah — di berkas kerja orang menyortir &
  // mem-pivot per kolom, jadi menggabungnya di sana justru merusak. Yang
  // digabung cuma tampilannya, dan itu yang membeli ruang untuk kolom
  // Spesifikasi Lainnya tanpa membuat tabelnya perlu digeser.
  mmsisa: { header: 'Masa / Sisa (Smt)', align: 'center' },
  // Penggunaan digabung dgn Keterangan (permintaan user 2026-09-11); Asal Usul
  // sekarang tampil sendiri — lihat rationale di colsLayar().
  gunaket: { header: 'Penggunaan / Keterangan' },
}

// SALINAN kolom layar Daftar Barang (app/dashboard/daftar-barang/page.tsx →
// COLS). Kalau di sana berubah, samakan di sini — dua menu ini memang sengaja
// menampilkan barang yang sama dgn kolom yang sama, bedanya cuma posisi waktu.
// ⚠️ SATU penyimpangan yang DISENGAJA (permintaan user 2026-07-30): Peralatan &
// Mesin di sini membawa No. Polisi/Rangka/Mesin/BPKB sesudah Spesifikasi
// Lainnya, sementara Daftar Barang belum. Identitas kendaraan itu yang paling
// sering dicocokkan saat menelusuri baseline 2025; kalau nanti Daftar Barang
// mau ikut, tinggal salin empat kunci ini ke sana.
// (Sejak 2026-09-08 Daftar Barang SUDAH membawa keempatnya — tapi khusus di
// golongan 1.5.4, yang di kedua menu ini kolomnya memang sengaja disamakan.)
// Kolom per jenis aset → **lib/kolomBarang.ts**, dipakai BERSAMA dgn Daftar
// Barang (REFACTOR-PLAN §5 butir 2.3). Sebelum 2026-09-15 daftarnya ditulis dua
// kali & cuma dijaga komentar "ubah satu, samakan yang lain".
//
// ⚠️ `kendaraanPM: true` = SATU-SATUNYA penyimpangan yang disengaja dari Daftar
// Barang: Peralatan & Mesin (1.3.2) di sini membawa No. Polisi/Rangka/Mesin/
// BPKB sesudah Spesifikasi Lainnya (permintaan user 2026-07-30 — identitas
// kendaraan itu yang paling sering dicocokkan saat menelusuri baseline 2025).
// Dulu bedanya hidup sbg selisih diam-diam antara dua daftar yang sepintas
// kembar; sekarang ia satu bendera bernama, dan `lib/kolomBarang.test.ts`
// menjaga bahwa TAK ADA beda lain yang menyelinap.
const BASE_KENDARAAN_PM = true

// Kolom penyusutan baseline — disisipkan mengapit Nilai Perolehan.
const SUSUT_SEBELUM = ['mm']
const SUSUT_SESUDAH = ['beban', 'akum', 'buku', 'sisa']
const SUSUT_KEYS = new Set([...SUSUT_SEBELUM, ...SUSUT_SESUDAH])
// Jenis aset yang tidak pernah disusutkan → tak usah dibuatkan kolomnya.
// "Semua Jenis Aset" (golongan kosong) = campuran → kolomnya tetap ditampilkan.
const disusutkan = (golongan: string) =>
  golongan === '' || (GOLONGAN_REKAP.find(g => g.kode === golongan)?.disusutkan ?? true)

/** Kolom LOGIS — satu kolom = satu kolom di Excel. Dipakai Export. */
function colsFor(golongan: string): string[] {
  const base = kolomGolongan(golongan, { kendaraanPM: BASE_KENDARAAN_PM })
  if (!disusutkan(golongan)) return base
  const out: string[] = []
  for (const k of base) {
    if (k === 'nilai') out.push(...SUSUT_SEBELUM, 'nilai', ...SUSUT_SESUDAH)
    else out.push(k)
  }
  return out
}

/**
 * Kolom LAYAR — `colsFor` dengan dua pasang digabung jadi satu sel.
 *
 * ⚠️ ADA KARENA LEBAR, dan pilihannya disengaja (keputusan user 2026-09-08:
 * "harus fit to window, gaboleh ada geser kanan kiri"). Halaman ini membawa 5
 * kolom penyusutan baseline yang tak dimiliki Daftar Barang, jadi Gedung &
 * Bangunan sudah 16 kolom SEBELUM Spesifikasi Lainnya ditambahkan — dan sudah
 * meleber keluar layar. Yang digabung dipilih yang pasangannya memang dibaca
 * bersamaan & isinya pendek:
 *   mm + sisa               -> "100 / 88"  (dua-duanya semester, selalu dibaca
 *                              berpasangan: berapa umurnya, tinggal berapa)
 *   penggunaan + keterangan -> ditumpuk  (dua keterangan pendek, bukan angka)
 *
 * ⚠️ Pasangan kedua BERUBAH 2026-09-11 (permintaan user): semula
 * asal_usul+penggunaan, sekarang Asal Usul tampil SENDIRI & yang digabung
 * penggunaan+keterangan. Alasannya bukan lebar — kolomnya sama banyak — murni
 * supaya Asal Usul terbaca sendiri tanpa harus membedah sel gabungan.
 *
 * ⚠️ EXPORT TIDAK IKUT DIGABUNG — `handleExport` tetap memakai `colsFor`.
 * Di berkas kerja orang menyortir & mem-pivot per kolom; "100 / 88" dalam satu
 * sel mematikan itu, dan Excel tak punya batas lebar yang perlu dihormati.
 * Pola yang sama sudah dipakai kode+uraian & nama+NIBAR (ditumpuk di layar,
 * rata di Excel).
 */
function colsLayar(golongan: string): string[] {
  const out: string[] = []
  for (const k of colsFor(golongan)) {
    if (k === 'mm') out.push('mmsisa')
    else if (k === 'penggunaan') out.push('gunaket')
    else if (k === 'sisa' || k === 'keterangan') continue // sudah ikut pasangannya
    else out.push(k)
  }
  return out
}

// Kolom yang dijumlahkan di baris TOTAL (rupiah saja — masa manfaat & sisa tidak).
const TOTAL_KEYS = new Set(['nilai', 'beban', 'akum', 'buku'])

// Kolom yang isinya SATU nomor utuh — dipaksa satu baris. Tanpa ini "AG 1021 EP"
// pecah jadi tiga baris di kolom sempit & tak lagi terbaca sebagai satu nomor
// polisi (permintaan user 2026-07-30). Tabelnya memang sudah bisa digeser
// horizontal, jadi melebar sedikit lebih baik daripada nomor yang terbelah.
// NOWRAP_KEYS → lib/kolomBarang.ts (kembar dgn Daftar Barang).
function thClass(key: string) {
  const a = COL_META[key]?.align
  return `table-th${a === 'right' ? ' text-right' : a === 'center' ? ' text-center' : ''}`
    + (NOWRAP_KEYS.has(key) ? ' whitespace-nowrap' : '')
}
function tdClass(key: string) {
  if (key === 'nama' || key === 'kode') return 'table-td align-top'
  const a = COL_META[key]?.align
  if (a === 'right') return 'table-td text-right text-xs'
  if (a === 'center') return 'table-td text-center text-xs' + (key === 'komptabel' ? ' capitalize' : '')
  return `table-td text-xs text-gray-600 align-top${NOWRAP_KEYS.has(key) ? ' whitespace-nowrap' : ''}`
}

// Label kepala kolom KODE & NAMA menyebut isi yang ditumpuk di bawahnya —
// pola sama dgn Daftar Barang (2026-09-17). Beda dari sana: sel Nama di sini
// cuma dua baris (nama + NIBAR), TANPA Kode Register — tabel ini snapshot
// `aset_awal_2026`, yang tak punya kolom itu sama sekali.
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
    </>
  )
  return COL_META[key].header
}

export default function Page() {
  const supabase = createClient()
  const isViewer = useIsViewer()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  // true = SKPD + seluruh turunannya (bawaan, `org.descendantIds` apa adanya);
  // false = SKPD yang dipilih SAJA. Combobox sendiri tak punya mode "node ini
  // saja" (`descendants()` selalu jalan penuh) — filter ini mempersempit
  // balik ke satu id saat operator memintanya; `org.descendantIds` tak
  // disentuh, jadi kembali ke Konsolidasi memberi hasil yang sama seperti
  // semula. `org.skpdId == null` (se-kabupaten/belum pilih) → tak berlaku.
  const [konsolidasi, setKonsolidasi] = useState(true)
  const [golongan, setGolongan] = useState('')
  const [komptabel, setKomptabel] = useState('')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [ketMap, setKetMap] = useState<Record<string, string>>({})
  const [uraianMap, setUraianMap] = useState<Record<string, string>>({})
  // null = jumlahnya TAK DIKETAHUI (query hitung gagal, barisnya tetap tampil).
  // Sengaja dibedakan dari 0 — "0 barang" itu pernyataan tentang data, "tak bisa
  // dihitung" itu pernyataan tentang query; menyamakannya persis kesalahan yang
  // dulu bikin timeout terbaca operator sebagai "datanya memang kosong".
  const [total, setTotal] = useState<number | null>(0)
  const [showAll, setShowAll] = useState(false) // hasil ≤ SHOW_ALL_MAX → semua baris tampil
  const [adaLagi, setAdaLagi] = useState(false)  // dipakai saat total tak diketahui: halaman ini penuh → mungkin masih ada
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  // Kegagalan yang TIDAK membatalkan tabel (kolom pelengkap: keterangan, uraian,
  // bidang tanah, tanda 🔒). Barangnya sudah benar, cuma hiasannya kurang —
  // tapi tetap harus kelihatan, jangan ditelan.
  const [warn, setWarn] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  // Berapa baris sudah tertarik selama Export. Export golongan besar memang
  // lama (132.694 baris = ratusan permintaan); tanpa angka yang bergerak,
  // tombol "Mengekspor..." yang diam terbaca operator sbg macet.
  const [progres, setProgres] = useState(0)
  // Peta nama SKPD — SATU sumber, lewat `paginate` (lib/namaSkpd.ts).
  // ⚠️ `errSkpd` WAJIB ditampilkan: sebelum 2026-09-16 loop di sini
  // menelan `error`, jadi query gagal = peta kosong = kolom SKPD tampil
  // "-" di tiap baris, terbaca operator sbg "barang ini tak bertuan".
  const { peta: skpdNama, err: errSkpd } = useNamaSkpdMap()
  // wilayah_kode → "Desa, Kec. X, Kabupaten Y" (rantai induk sudah dirangkai)
  const [wilayahNama, setWilayahNama] = useState<Record<string, string>>({})
  // NIBAR → rekap bidang tanah (hanya golongan 1.3.1 yang punya isi)
  const [bidang, setBidang] = useState<Record<string, BidangAgg>>({})
  // ── Koreksi spesifikasi: centang barang (multi) → popup EditSpesifikasiModal ──


  useEffect(() => {
    // Wilayah: dataset kecil (Jatim + Kab./Kota Kediri, ~400 baris) → tarik
    // sekali, rangkai rantai induknya di sini. Provinsi sengaja dibuang (semua
    // aset di Jatim, cuma bikin panjang); level 3 diberi awalan "Kec." karena
    // seed-nya nama polos, sedangkan level 2 sudah "Kabupaten/Kota ...".
    ;(async () => {
      type W = { kode: string; nama: string; level: number; parent_kode: string | null }
      const all: W[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_wilayah').select('kode,nama,level,parent_kode').range(from, from + 999)
        if (!data || data.length === 0) break
        all.push(...(data as W[]))
        if (data.length < 1000) break
      }
      const byKode = new Map(all.map(w => [w.kode, w]))
      const label: Record<string, string> = {}
      for (const w of all) {
        const parts: string[] = []
        let cur: W | undefined = w
        while (cur) {
          if (cur.level >= 2) parts.push(cur.level === 3 ? `Kec. ${cur.nama}` : cur.nama)
          cur = cur.parent_kode ? byKode.get(cur.parent_kode) : undefined
        }
        label[w.kode] = parts.join(', ')
      }
      setWilayahNama(label)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tanah semuanya intrakomptabel — filternya disembunyikan (pola Daftar Barang)
  // DAN nilainya dikosongkan, biar sisa pilihan lama tak diam-diam ikut menyaring.
  useEffect(() => { if (golongan === '1.3.1' && komptabel) setKomptabel('') }, [golongan]) // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠️ `head: true` SENGAJA TIDAK DIPAKAI LAGI (2026-08-12). Respons HEAD tidak
  // berbadan, jadi supabase-js tak punya apa pun untuk di-parse dan mengembalikan
  // `error.message` KOSONG — persis yang bikin halaman ini cuma menulis "Gagal
  // memuat data:" tanpa sebab, dan bikin cabang khusus timeout di `gagalMuat`
  // tak pernah bisa menyala (regex-nya diuji atas string kosong). Menghitung
  // sambil membawa barisnya sekaligus jauh lebih murah daripada kehilangan
  // keterangan errornya: satu perjalanan, badan respons utuh.
  // Saringan saja — TANPA `order`. Urutannya dipasang pemanggil: layar memakai
  // urutan baku di `buildQuery`, Export memasangnya per cabang kursor.
  //
  // ⚠️ `nilai_teks` = `nilai_perolehan` yang di-cast ke TEKS di sisi PostgREST,
  // khusus dipakai sebagai kursor Export. `nilai_perolehan` itu `numeric`
  // sedangkan angka JSON di peramban float64; kursor yang sudah dibulatkan bisa
  // MELEWATKAN baris yang sah tanpa satu pun error (lihat lib/keyset.ts).
  function buildFilter(f: Applied, opts: { count?: boolean; kursor?: boolean } = {}) {
    let q = supabase.from('aset_awal_2026')
      .select(opts.kursor ? `${COLS},nilai_teks:nilai_perolehan::text` : COLS,
        opts.count ? { count: 'exact' } : undefined)
    if (f.org.descendantIds) q = q.in('skpd_id', f.org.descendantIds)
    // ⚠️ `.eq('golongan', ...)` — JANGAN dikembalikan jadi `.like('kode', 'gol.%')`.
    // `~~` (LIKE) tidak leakproof, jadi Postgres selalu mengevaluasinya SESUDAH
    // qual RLS & ia tak pernah bisa jadi index-cond; karena ORDER BY diawali
    // `kode`, planner lalu menyusuri idx_saldo_kode DARI KODE PALING AWAL sambil
    // membuang 235.828 baris satu per satu → 9,5 dtk, lewat statement_timeout
    // 8 dtk, HALAMAN PERTAMA pun gagal (diukur 2026-08-12). `=` pada text itu
    // leakproof → boleh turun jadi index-cond. Kolom `golongan` terisi penuh &
    // dijamin cocok dgn `kode` oleh CHECK aset_awal_2026_golongan_cocok_kode
    // (migrasi 20260812_08). Predikat ini KEMBAR dgn index idx_sa2026_gol_urut —
    // ubah satu, ubah dua-duanya, atau indexnya diabaikan DIAM-DIAM.
    if (f.golongan) q = q.eq('golongan', f.golongan)
    if (f.komptabel) q = q.eq('intra_ekstra', f.komptabel)
    if (f.search) q = q.or(orCari(f.search))
    return q
  }

  function buildQuery(f: Applied, opts: { count?: boolean } = {}) {
    const q = buildFilter(f, opts)
    // Urutan: KODE BARANG A→Z (permintaan user 2026-07-30; dulu nilai perolehan
    // terbesar dulu), samakan dgn Daftar Barang & Penyusutan — nilai turun jadi
    // kunci kedua supaya di dalam satu kode barang mahal tetap di atas.
    // Di sini urutannya WAJIB di query, bukan di client spt dua halaman itu:
    // paginasinya di SERVER (`.range()` per halaman, tak pernah menarik semua
    // baris ke browser), jadi mengurutkan array yang tampil cuma akan
    // mengurutkan 50 baris halaman itu sendiri.
    // NIBAR sbg pemecah seri: tanpa itu urutan baris berkunci sama tak stabil
    // antar-request → baris bisa dobel/hilang saat pindah halaman.
    return q.order('kode', { ascending: true })
      .order('nilai_perolehan', { ascending: false })
      .order('nibar', { ascending: true })
  }

  // Register `aset` per NIBAR: keterangan (sengaja versi TERKINI, bukan kolom
  // keterangan di snapshot — sama dgn yang tampil di Daftar Barang) + `id`, yang
  // dibutuhkan untuk menengok bidang tanah (aset_bidang_tanah pakai aset_id,
  // sementara halaman ini berkunci NIBAR).
  // ⚠️ `pesan` = penampung keluhan. Keempat pelengkap di bawah ini dulu memakai
  // `const { data } = await ...` telanjang: query gagal → `data` null → kolomnya
  // diam-diam kosong dan terbaca operator sebagai "barang ini memang tak punya
  // keterangan/uraian/bidang". Sekarang kegagalannya DILAPORKAN (strip kuning di
  // atas tabel) tapi TIDAK membatalkan tabel — barisnya sendiri sudah benar,
  // dan mengosongkan halaman gara-gara kolom hiasan justru merugikan.
  async function fetchAsetInfo(nibars: string[], pesan: string[]) {
    const map: Record<string, { id: string; keterangan: string | null }> = {}
    for (let i = 0; i < nibars.length; i += 500) {
      const { data, error } = await supabase.from('aset').select('id,nibar,keterangan').in('nibar', nibars.slice(i, i + 500))
      if (error) { pesan.push(`Kolom Keterangan (dan Luas/Lokasi tanah) tidak lengkap — gagal membaca register aset: ${error.message}`); break }
      for (const a of (data || []) as { id: string; nibar: string | null; keterangan: string | null }[]) {
        if (a.nibar) map[a.nibar] = { id: a.id, keterangan: a.keterangan }
      }
    }
    return map
  }

  // Bidang tanah per aset (kalau ada) — luas & lokasi Tanah yang sebenarnya
  // dikelola PER BIDANG di menu GIS Tanah, bukan di kolom `luas`/`alamat_detail`
  // level register. Yang punya bidang: luas = Σ bidang (dihitung SAAT TAMPIL,
  // sengaja TIDAK disimpan ke kolom mana pun — angka tersimpan bakal basi tiap
  // bidang ditambah/diedit/dihapus, dan snapshot 2025 tak boleh ikut bergerak
  // mengikuti data hidup). Yang belum punya bidang: jatuh ke kolom snapshot,
  // yang boleh diisi manual lewat Edit Spesifikasi (lihat TANAH_TANPA_BIDANG_FIELDS).
  async function fetchBidang(info: Record<string, { id: string }>, rs: Row[], pesan: string[]) {
    const tanah = rs.filter(r => kodeLevel3(r.kode) === '1.3.1' && info[r.nibar])
    if (tanah.length === 0) return {}
    const nibarByAset = new Map(tanah.map(r => [info[r.nibar].id, r.nibar]))
    const ids = [...nibarByAset.keys()]
    const agg: Record<string, BidangAgg> = {}
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase.from('aset_bidang_tanah')
        .select('aset_id,luas,wilayah_kode,alamat_detail').in('aset_id', ids.slice(i, i + 500))
      if (error) { pesan.push(`Luas & Lokasi tanah masih dari kolom saldo awal, bukan Σ bidang — gagal membaca bidang tanah: ${error.message}`); break }
      for (const b of (data || []) as { aset_id: string; luas: number | null; wilayah_kode: string | null; alamat_detail: string | null }[]) {
        const nibar = nibarByAset.get(b.aset_id)
        if (!nibar) continue
        const a = agg[nibar] || (agg[nibar] = { n: 0, nLuas: 0, luas: null, wilayah: [], alamat: [] })
        a.n++
        if (b.luas != null) { a.nLuas++; a.luas = (a.luas ?? 0) + Number(b.luas) }
        if (b.wilayah_kode && !a.wilayah.includes(b.wilayah_kode)) a.wilayah.push(b.wilayah_kode)
        if (b.alamat_detail && !a.alamat.includes(b.alamat_detail)) a.alamat.push(b.alamat_detail)
      }
    }
    return agg
  }

  // Uraian (nama baku kodefikasi) per kode — ditumpuk di bawah Kode Barang,
  // sama persis dgn Daftar Barang.
  async function fetchUraian(kodes: string[], pesan: string[]) {
    const uniq = [...new Set(kodes)]
    const map: Record<string, string> = {}
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', uniq.slice(i, i + 200))
      if (error) { pesan.push(`Kolom Uraian Barang kosong — gagal membaca kodefikasi: ${error.message}`); break }
      for (const r of (data || []) as { kode: string; uraian: string | null }[]) if (r.uraian) map[r.kode] = r.uraian
    }
    return map
  }

  // MENGHITUNG dan MENAMPILKAN dipisah tegas, dan itu inti kekuatan halaman ini.
  // `count: 'exact'` menyapu SELURUH baris golongan itu (1.3.5 = 173.262 dari
  // 418.102 baris) — sesudah migrasi 20260812_08 jadi 2,8 dtk, sedangkan
  // mengambil 50 baris halamannya cuma 18 ms. Ongkosnya beda dua orde, jadi
  // nasibnya tak boleh disatukan: hitungan itu yang paling dulu tumbang kalau
  // tabel tumbuh lagi. Dulu kegagalannya `return` → tabel kosong TOTAL, padahal
  // barisnya sendiri bisa diambil. Kini diturunkan jadi peringatan & daftarnya
  // tetap tampil.
  async function load(f: Applied, pg: number) {
    setLoading(true)
    setLoadErr('')
    setWarn([])
    const pesan: string[] = []
    // ⚠️ SELURUH badan fungsi ini WAJIB di dalam try/finally, `setLoading(false)`
    // di `finally` — BUKAN di akhir jalur sukses (CLAUDE.md, insiden Daftar
    // Barang 2026-07-29: satu promise ditolak → tombol nyangkut "Memuat..."
    // selamanya tanpa sepatah pun keterangan).
    try {
      const dari = pg * PAGE_SIZE

      // Satu perjalanan: baris halaman ini + jumlah total sekaligus.
      const a = await buildQuery(f, { count: true }).range(dari, dari + PAGE_SIZE - 1)
      let rs: Row[]
      let tot: number | null
      if (a.error) {
        // Coba lagi TANPA count. Kalau yang ini pun gagal, memang barisnya yang
        // tak terbaca → baru halaman dikosongkan.
        const b = await buildQuery(f).range(dari, dari + PAGE_SIZE - 1)
        if (b.error) { gagalMuat(b.error.message || a.error.message); return }
        rs = (b.data as unknown as Row[]) || []
        tot = null
        pesan.push(pesanHitungGagal(a.error.message))
      } else {
        rs = (a.data as unknown as Row[]) || []
        tot = a.count ?? 0
      }

      // Hasil kecil → tampilkan semua sekaligus (tanpa halaman), pola Daftar Barang.
      const semua = tot != null && tot > 0 && tot <= SHOW_ALL_MAX
      if (semua) {
        const all: Row[] = []
        for (let from = 0; from < (tot as number); from += 1000) {
          const { data, error } = await buildQuery(f).range(from, from + 999)
          if (error) { gagalMuat(error.message); return }
          if (!data || data.length === 0) break
          all.push(...(data as unknown as Row[]))
          if (data.length < 1000) break
        }
        rs = all
      }

      setRows(rs)
      setTotal(tot)
      setShowAll(semua)
      // Tanpa jumlah total, satu-satunya petunjuk "masih ada lagi" adalah halaman
      // ini penuh. Konsekuensi yang diterima: kalau sisanya pas kelipatan 50,
      // tombol Berikutnya sekali membuka halaman kosong — jauh lebih murah
      // daripada mengunci operator di halaman 1.
      setAdaLagi(tot == null && rs.length === PAGE_SIZE)
      setSel({}) // seleksi lama tak lagi nyambung dgn baris yang tampil

      const info = await fetchAsetInfo(rs.map(r => r.nibar), pesan)
      const ket: Record<string, string> = {}
      for (const [nibar, x] of Object.entries(info)) if (x.keterangan) ket[nibar] = x.keterangan
      setKetMap(ket)
      setBidang(await fetchBidang(info, rs, pesan))
      setUraianMap(await fetchUraian(rs.map(r => r.kode), pesan))
      setTerkunci(await fetchTerkunci(rs.map(r => r.nibar), pesan))
      setWarn(pesan)
    } catch (e) {
      gagalMuat(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Gagal MENGHITUNG saja — barangnya tetap tampil, jadi ini peringatan, bukan
  // kegagalan. Pesan aslinya ikut dibawa: sejak `head: true` dicabut, PostgREST
  // benar-benar mengirim sebabnya (mis. "canceling statement due to statement
  // timeout", kode 57014).
  const pesanHitungGagal = (pesan: string) =>
    `Jumlah total barang tidak bisa dihitung${pesan ? ` (${pesan})` : ''} — daftarnya tetap ditampilkan per halaman. `
    + 'Kalau ini muncul terus tanpa filter SKPD, cek index idx_sa2026_gol_urut (migrasi 20260812_08) masih ada '
    + 'atau tidak — sementara itu pilih SKPD dulu supaya cakupannya sempit.'

  // Kegagalan query TIDAK BOLEH tampil sebagai "0 barang" — dulu `error`
  // diabaikan, jadi statement timeout (RLS aset_awal_2026 belum InitPlan,
  // lihat migrasi 20260728_02) terbaca operator sebagai "datanya memang kosong".
  // ⚠️ `setLoading(false)` sengaja TIDAK di sini — itu urusan `finally` di
  // `load`, supaya tak ada jalur keluar yang bisa melewatkannya.
  function gagalMuat(pesan: string) {
    setRows([]); setTotal(0); setShowAll(false); setAdaLagi(false)
    setKetMap({}); setUraianMap({}); setBidang({}); setTerkunci(new Set())
    // Respons tanpa keterangan apa pun sudah pernah terjadi & bikin operator
    // buntu ("Gagal memuat data:" lalu kosong). Kalau terulang, katakan begitu.
    const p = pesan || 'database tidak mengirim keterangan apa pun'
    setLoadErr(/timeout|57014/i.test(p)
      ? `Database kehabisan waktu memuat data ini (${p}). Kalau ini muncul terus, migrasi 20260812_08 kemungkinan belum dijalankan (index idx_sa2026_gol_urut) — sementara persempit dulu filternya (pilih SKPD).`
      : `Gagal memuat data: ${p}`)
  }



  // ── Edit Spesifikasi (centang → popup → tulis snapshot + register) ────────
  // → ./useEditSpekAwal.ts (REFACTOR-PLAN Fase 3). Nama lokal dipertahankan
  // supaya JSX halaman ini tak ikut berubah.
  const {
    sel, setSel, selList, selSameGol, toggleSel, terkunci, setTerkunci, fetchTerkunci, terkunciInfo,
    spekOpen, setSpekOpen, spekPrefix, spekKeys, spekInitFields, spekInitFoto,
    spekMsg, spekErr, spekSaving, spekTanpaBidang, openSpek, simpanSpek,
  } = useEditSpekAwal(bidang, () => { if (applied) load(applied, page) })
  const konfirmasi = useKonfirmasi()

  // Pengganti `alert()` (CODING-STANDARD §4.5) untuk 🔒 — MURNI INFORMASI.
  // Menyebut transaksi TERAKHIR pada barang itu; lihat catatan `terkunciInfo`
  // di useEditSpekAwal.ts soal kenapa ini proxy, bukan jawaban pasti.
  async function infoTerkunci(r: Row) {
    const info = terkunciInfo[r.nibar]
    await konfirmasi({
      nada: 'amber', ikon: '🔒', judul: 'Kenapa barang ini terkunci?',
      subjudul: r.nama_barang || r.nibar,
      isi: info
        ? <>Transaksi TERAKHIR pada barang ini: <b>&ldquo;{info.jenis}&rdquo;</b> ({info.periode}). Kalau ada
          yang perlu dikoreksi, lewat <b>Pembukuan → Koreksi → Spesifikasi Barang</b> — di sana ada jejak
          ledger & bisa dibatalkan.</>
        : <>Barang ini sudah punya transaksi yang mengubah spesifikasi, golongan, atau SKPD-nya, tapi jenis
          transaksinya tak terbaca dari sini. Koreksinya tetap lewat <b>Pembukuan → Koreksi → Spesifikasi
          Barang</b>.</>,
      labelYa: 'Mengerti', tanpaBatal: true,
    })
  }

  function tampilkan() {
    const orgEfektif: OrgSelection = (!konsolidasi && org.skpdId != null)
      ? { skpdId: org.skpdId, descendantIds: [org.skpdId] } : org
    const f: Applied = { org: orgEfektif, golongan, komptabel, search }
    setApplied(f); setPage(0); load(f, 0)
  }
  function goPage(pg: number) { if (applied) { setPage(pg); load(applied, pg) } }



  // ── Luas & Lokasi: bidang tanah menang, kolom snapshot jadi cadangan ───────
  // Aturannya sama persis dipakai Daftar Barang (bedanya cadangannya `aset.luas`),
  // supaya angka di dua menu tak pernah beda tanpa sebab.
  // Parameter `bd` bisa diisi peta bidang lain (dipakai Export, yang cakupan
  // barisnya lebih luas dari layar); default = milik halaman.
  // Aturannya → lib/luasBidang.ts (diangkat 2026-09-15, kemunculan ketiga).
  const luasOf = (r: Row, bd: Record<string, BidangAgg> = bidang): number | null =>
    luasEfektif(bd[r.nibar], r.luas)
  // Satu register bisa punya banyak bidang di lokasi berbeda — kalau tak bisa
  // diringkas jadi satu baris, jangan dipaksakan: tunjuk saja ke GIS Tanah.
  function lokasiOf(r: Row, bd: Record<string, BidangAgg> = bidang): { alamat: string; wilayah: string } {
    const b = bd[r.nibar]
    if (b && b.n > 0) {
      const wil = [...new Set(b.wilayah.map(k => wilayahNama[k]).filter(Boolean))]
      const wilayah = wil.length === 0 ? '' : wil.length <= 2 ? wil.join(' · ') : `${wil.length} wilayah — lihat GIS Tanah`
      const alamat = b.alamat.length === 0 ? '' : b.alamat.length === 1 ? b.alamat[0] : `${b.n} bidang`
      if (wilayah || alamat) return { alamat, wilayah }
      // Bidangnya ada tapi lokasinya belum diisi → jangan tampilkan kosong,
      // pakai apa yang ada di snapshot.
    }
    return { alamat: r.alamat_detail || '', wilayah: r.wilayah_kode ? (wilayahNama[r.wilayah_kode] || '') : '' }
  }

  // Nilai polos per kolom — dipakai Export (layar pakai cellContent yang boleh JSX).
  function cellValue(key: string, r: Row, bd: Record<string, BidangAgg> = bidang): string | number {
    switch (key) {
      case 'skpd': return skpdNama[r.skpd_id] || ''
      case 'kode': return r.kode
      case 'uraian': return uraianMap[r.kode] || ''
      case 'nama': return r.nama_barang || ''
      case 'merek': return r.merek_tipe || ''
      case 'spesifikasi': return r.spesifikasi_lainnya || ''
      case 'nopol': return r.no_polisi || ''
      case 'rangka': return r.no_rangka || ''
      case 'mesin': return r.no_mesin || ''
      case 'bpkb': return r.no_bpkb || ''
      // Lokasi = alamat jalan + wilayah administratif (dua kolom DB yang beda,
      // digabung; di layar ditumpuk, di Excel jadi satu sel).
      case 'lokasi': { const l = lokasiOf(r, bd); return [l.alamat, l.wilayah].filter(Boolean).join(' — ') }
      case 'luas': return luasOf(r, bd) ?? ''
      case 'hak': return r.jenis_hak || ''
      case 'no_sertifikat': return r.nomor_dokumen_kepemilikan || ''
      case 'tgl_sertifikat': return r.tanggal_dokumen_kepemilikan || ''
      case 'atas_nama': return r.nama_dokumen_kepemilikan || ''
      case 'komptabel': return r.intra_ekstra || ''
      case 'tgl': return r.tgl_perolehan || ''
      case 'mm': return r.masa_manfaat_smt ?? ''
      case 'nilai': return r.nilai_perolehan
      case 'beban': return r.beban_penyusutan_per_smt ?? ''
      case 'akum': return r.akumulasi_2025
      case 'buku': return r.nilai_buku_awal
      case 'sisa': return r.sisa_masa_manfaat_smt
      case 'asal_usul': return r.asal_usul || ''
      case 'penggunaan': return r.penggunaan_pengamanan || ''
      case 'keterangan': return ketMap[r.nibar] || ''
      default: return ''
    }
  }

  function cellContent(key: string, r: Row): React.ReactNode {
    // Kode & Nama bertumpuk (uraian baku di bawah kode, NIBAR di bawah nama) —
    // pola yang sama dgn Daftar Barang.
    if (key === 'kode') return (
      <>
        <p className="font-medium text-gray-700 text-xs">{r.kode}</p>
        <p className="text-gray-400 text-xs mt-0.5">{uraianMap[r.kode] || '-'}</p>
      </>
    )
    if (key === 'nama') return (
      <>
        <p className="font-medium text-gray-800 text-xs">{r.nama_barang || '-'}</p>
        {/* ⚠️ `break-all` WAJIB: NIBAR 45 digit itu SATU kata tanpa spasi, jadi
            lebar min-content selnya ±270px dan ia yang memaksa tabel melebar
            berapa pun paddingnya dirampingkan. Membiarkannya dipenggal adalah
            syarat "fit to window" (pola yang sama dipakai lembar Permendagri). */}
        <p className="text-gray-400 text-xs mt-0.5 break-all">{r.nibar}</p>
      </>
    )
    if (key === 'lokasi') {
      const { alamat, wilayah } = lokasiOf(r)
      if (!alamat && !wilayah) return <span className="text-gray-300">-</span>
      return (
        <>
          <p className="text-xs text-gray-600">{alamat || '-'}</p>
          {wilayah && <p className="text-gray-400 text-xs mt-0.5">{wilayah}</p>}
        </>
      )
    }
    // Dua sel GABUNGAN — cuma ada di layar (lihat colsLayar). Nilainya tetap
    // diambil lewat `cellValue` kolom aslinya, jadi tak ada rumus kedua yang
    // bisa menyimpang dari yang diekspor.
    if (key === 'mmsisa') {
      const mm = r.masa_manfaat_smt
      const sisa = r.sisa_masa_manfaat_smt
      return <span className="whitespace-nowrap">{mm ?? '-'} / {sisa ?? '-'}</span>
    }
    if (key === 'gunaket') {
      const guna = r.penggunaan_pengamanan || ''
      const ket = ketMap[r.nibar] || ''
      if (!guna && !ket) return <span className="text-gray-300">-</span>
      return (
        <>
          <p className="text-xs text-gray-600">{guna || '-'}</p>
          {ket && <p className="text-gray-400 text-xs mt-0.5">{ket}</p>}
        </>
      )
    }
    // Tgl Perolehan / Tahun Pengadaan ditumpuk (permintaan user) — dua tanggal
    // yang bisa berbeda jauh (barang bekas: `tgl_perolehan` = tahun barang
    // dibuat, `tahun_pengadaan` = tahun masuk ke pemda ini). Nilai tetap dari
    // `cellValue`/`tahun_pengadaan` langsung, bukan rumus kedua yang bisa
    // menyimpang. Export tetap kolom `tgl` polos (tak diminta ikut).
    if (key === 'tgl') {
      if (!r.tgl_perolehan) return <span className="text-gray-300">-</span>
      return (
        <>
          <p className="text-xs text-gray-600 whitespace-nowrap">{r.tgl_perolehan}</p>
          {r.tahun_pengadaan != null && <p className="text-gray-400 text-xs mt-0.5">{r.tahun_pengadaan}</p>}
        </>
      )
    }
    if (key === 'luas') {
      const b = bidang[r.nibar]
      const v = luasOf(r)
      return (
        <>
          <p className="text-xs text-gray-600">{v != null ? angkaLuas(v) : <span className="text-gray-300">-</span>}</p>
          {b && b.n > 0 && (
            <Link href={`/dashboard/gis?cari=${encodeURIComponent(r.nibar)}`}
              className="text-[11px] text-teal hover:underline"
              title={luasBidangSah(b)
                ? 'Luas ini penjumlahan seluruh bidang di GIS Tanah — koreksinya di sana, per bidang'
                : `Ada ${b.n} bidang di GIS Tanah tapi baru ${b.nLuas} yang berisi luas — angka di atas masih dari saldo awal, bukan Σ bidang`}>
              {luasBidangSah(b) ? `Σ ${b.n} bidang` : `${b.n} bidang · luas belum lengkap`}
            </Link>
          )}
        </>
      )
    }
    const v = cellValue(key, r)
    if (v === '' || v == null) return <span className="text-gray-300">-</span>
    if (typeof v === 'number' && TOTAL_KEYS.has(key)) return angka(v)
    if (typeof v === 'number' && key === 'luas') return angkaLuas(v)
    return v
  }

  // ⚠️ Dibungkus try/catch/finally seperti loader: tanpa itu satu query yang
  // melempar meninggalkan tombol "Mengekspor..." nyangkut selamanya, DAN berkas
  // Excel setengah jadi yang terlanjur terunduh tak punya tanda apa pun bahwa
  // isinya kurang (CLAUDE.md — aturan kolektor fail-closed).
  async function handleExport() {
    if (!applied) return
    setExporting(true)
    const pesan: string[] = []
    try {
    // Layar boleh terpaginasi, ekspornya TIDAK — selalu seluruh hasil filter.
    //
    // ⚠️ KURSOR, bukan `.range()` (2026-09-03). Versi lama menarik offset 0,
    // 1000, 2000, … dan itulah yang bikin strip merah "canceling statement due
    // to statement timeout" begitu hasilnya 132.694 baris: OFFSET tidak
    // melompat, Postgres tetap merakit tiap baris yang dilewati lalu
    // membuangnya (terukur 0,13 dtk di offset 0 vs 1,8 dtk di offset 60.000,
    // dan itu belum termasuk waktu PostgREST merangkai JSON-nya).
    // Susunan berkasnya TIDAK berubah — kursornya mengikuti urutan yang sama
    // persis dgn layar (kode ASC, nilai perolehan DESC, NIBAR ASC).
    type RowKursor = Row & { nilai_teks: string | null }
    const jalankan = async (c: CabangKeyset) => {
      let q = buildFilter(applied, { kursor: true })
      if (c.jenis === 'sisa') {
        const { kode, nilai, seri } = c.kursor
        q = q.eq('kode', kode).lte('nilai_perolehan', nilai)
          .or(`nilai_perolehan.lt.${nilai},and(nilai_perolehan.eq.${nilai},nibar.gt.${seri})`)
      } else if (c.setelahKode !== null) {
        q = q.gt('kode', c.setelahKode)
      }
      const { data, error } = await q
        .order('kode').order('nilai_perolehan', { ascending: false }).order('nibar')
        .limit(c.batas)
      if (error) throw new Error(error.message)
      return (data || []) as unknown as RowKursor[]
    }
    const all = await ambilSemuaKeyset<RowKursor, KursorKode>({
      halaman: halamanDuaCabang<RowKursor>(jalankan),
      kursor: r => ({ kode: r.kode, nilai: r.nilai_teks ?? String(r.nilai_perolehan), seri: r.nibar }),
      tanda: tandaKursorKode,
      onKemajuan: setProgres,
    })
    setProgres(0)
    // Ekspor bisa memuat baris di luar halaman yang tampil → keterangan & bidang
    // tanahnya diambil ulang untuk SELURUH hasil, jangan pakai state halaman
    // (kalau tidak, kolom Luas/Lokasi di Excel beda dari yang di layar).
    const info = await fetchAsetInfo(all.map(r => r.nibar), pesan)
    const ket: Record<string, string> = {}
    for (const [nibar, a] of Object.entries(info)) if (a.keterangan) ket[nibar] = a.keterangan
    const bd = await fetchBidang(info, all, pesan)
    const uraian = await fetchUraian(all.map(r => r.kode), pesan)
    // Ekspor pakai kolom yang sama dgn layar, + Uraian & NIBAR jadi kolom sendiri
    // (di layar keduanya ditumpuk; di Excel harus rata biar bisa disortir/pivot).
    const keys = colsFor(applied.golongan).flatMap(k => (k === 'kode' ? ['kode', 'uraian'] : k === 'nama' ? ['nama', 'nibar'] : [k]))
    exportToExcel(all.map(r => {
      const obj: Record<string, string | number> = {}
      for (const k of keys) {
        if (k === 'nibar') { obj['NIBAR'] = r.nibar; continue }
        // "Uraian Barang", bukan "Uraian" — samakan dgn Export Daftar Barang,
        // Penyusutan, & Kendaraan (2026-07-30).
        if (k === 'uraian') { obj['Uraian Barang'] = uraian[r.kode] || ''; continue }
        obj[COL_META[k].header] = k === 'keterangan' ? (ket[r.nibar] || '') : cellValue(k, r, bd)
      }
      return obj
    }), namaBerkasLaporan({
      // Snapshot ini MEMANG cuma ada satu posisi (saldo awal 2026 = saldo akhir
      // 2025), jadi tahunnya konstanta, bukan filter yang bisa digeser operator.
      laporan: 'Daftar Barang Awal', periode: 2026, golongan: applied.golongan,
      skpd: applied.org.skpdId ? skpdNama[applied.org.skpdId] : null,
    }), 'Daftar Barang Awal')
    // Kolom pelengkap yang gagal dibaca WAJIB diberitahukan — berkas untuk BPK
    // tak boleh diam-diam berisi kolom kosong yang terbaca sbg "memang tak ada".
    if (pesan.length > 0) setWarn(p => [...p, ...pesan.map(m => `Berkas Excel: ${m}`)])
    } catch (e) {
      setLoadErr(`Gagal mengekspor: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExporting(false); setProgres(0)
    }
  }

  const totalPages = total == null ? 0 : Math.ceil(total / PAGE_SIZE)
  // ⚠️ LAYAR pakai `colsLayar` (dua pasang digabung), EXPORT pakai `colsFor`
  // (rata, satu kolom per data). Jangan disatukan — lihat catatan di colsLayar.
  const cols = colsLayar(applied?.golongan ?? '')
  const kolom = cols.length + (isViewer ? 0 : 1)
  const nilaiIdx = cols.indexOf('nilai')
  const subtotal = (key: string) => rows.reduce((s, r) => s + (Number(cellValue(key, r)) || 0), 0)

  return (
    <div className="p-6">
      <PeringatanNamaSkpd err={errSkpd} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daftar Barang Awal</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar aset + penyusutan pada posisi saldo awal 2026 (= saldo akhir 2025).</p>
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          {org.skpdId != null && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
              <span className="hidden sm:block sm:w-40 flex-shrink-0" />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="dba_konsol" checked={konsolidasi} onChange={() => setKonsolidasi(true)} />
                  Konsolidasi (+ seluruh unit di bawahnya)
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="dba_konsol" checked={!konsolidasi} onChange={() => setKonsolidasi(false)} />
                  SKPD ini saja
                </label>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Jenis Aset :</label>
            <select className="select-filter w-full sm:flex-1 min-w-0" value={golongan} onChange={e => setGolongan(e.target.value)}>
              <option value="">Semua Jenis Aset</option>
              {GOLONGAN_REKAP.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
            </select>
          </div>
          {/* Tanah: semua intrakomptabel — filternya tak relevan (pola Daftar Barang) */}
          {golongan !== '1.3.1' && <KomptabelRadio value={komptabel} onChange={setKomptabel} />}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Cari :</label>
            <input className="select-filter w-full sm:flex-1 min-w-0"
              placeholder="Nama barang / NIBAR / kode / merek / no. polisi / rangka / mesin / alamat / kode wilayah / nilai perolehan..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="hidden sm:block sm:w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
        </div>
      </div>

      {applied === null ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Tampilkan</span>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">
              {total == null ? `${rows.length} barang di halaman ini (total tak terhitung)` : `${total.toLocaleString('id-ID')} barang`}
              {applied.golongan ? ` · ${applied.golongan} ${GOLONGAN_REKAP.find(g => g.kode === applied.golongan)?.uraian || ''}` : ''}
              {selList.length > 0 && <span className="text-teal font-medium"> · {selList.length} dicentang</span>}
            </span>
            <div className="flex items-center gap-3">
              {/* Muncul HANYA setelah ada baris dicentang (permintaan user
                  2026-09-10) — dulu selalu tampil dalam keadaan disabled. Kasus
                  centang beda jenis aset tetap disabled + dijelaskan strip amber
                  di bawah toolbar. */}
              {!isViewer && selList.length > 0 && (
                <button onClick={openSpek} disabled={!selSameGol || spekSaving}
                  className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                  {spekSaving ? 'Menyimpan...' : `✎ Edit Spesifikasi (${selList.length})...`}
                </button>
              )}
              {!showAll && <span className="text-sm text-gray-500">Hal. {page + 1}{total == null ? '' : ` / ${totalPages || 1}`}</span>}
              <button onClick={handleExport} disabled={exporting || rows.length === 0} className="btn-secondary text-xs">
                {exporting ? `Mengekspor${progres ? ` ${progres.toLocaleString('id-ID')} baris` : ''}...` : 'Export Excel'}
              </button>
            </div>
          </div>
          {loadErr && <div className="px-4 py-2 border-b border-gray-100"><p className="text-xs text-red-600">{loadErr}</p></div>}
          {/* Kegagalan yang TIDAK membatalkan daftar (jumlah total, kolom
              pelengkap). Amber, bukan merah — barangnya di bawah tetap sah. */}
          {warn.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 space-y-1">
              {warn.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
            </div>
          )}
          {!isViewer && (selList.length > 0 || spekMsg || spekErr || spekSaving || terkunci.size > 0) && (
            <div className="px-4 py-2 border-b border-gray-100 space-y-1">
              {spekSaving && <p className="text-xs text-gray-500">Menyimpan koreksi spesifikasi...</p>}
              {terkunci.size > 0 && (
                <p className="text-xs text-gray-500">
                  🔒 {terkunci.size} barang di tampilan ini terkunci — sudah punya transaksi yang mengubah spesifikasi,
                  golongan, atau SKPD-nya. Koreksinya lewat Pembukuan → Koreksi → Spesifikasi Barang, biar ada jejak
                  ledger & bisa dibatalkan.
                </p>
              )}
              {selList.length > 0 && !selSameGol && (
                <p className="text-xs text-amber-600">Barang beda jenis aset — pisahkan per jenis, field spesifikasinya beda.</p>
              )}
              {selList.length > 0 && selSameGol && !spekTanpaBidang && kodeLevel3(selList[0].kode) === '1.3.1' && (
                <p className="text-xs text-amber-600">
                  Ada tanah yang sudah punya bidang di GIS Tanah — luas & lokasinya tidak ditawarkan di popup ini.
                  Yang punya bidang, koreksinya per bidang di menu GIS Tanah (luas di tabel = Σ bidang).
                </p>
              )}
              {selList.length > 0 && selSameGol && (
                <p className="text-xs text-gray-500">
                  Koreksi spesifikasi ditulis ke saldo awal <span className="font-medium">dan</span> register aset (dicocokkan NIBAR).
                  Angka penyusutan tidak ikut berubah. Tanpa jejak ledger — kalau butuh bisa dibatalkan, pakai Pembukuan → Koreksi.
                </p>
              )}
              {spekMsg && <p className="text-xs text-emerald-600">{spekMsg}</p>}
              {spekErr && <p className="text-xs text-red-600">{spekErr}</p>}
            </div>
          )}
          {/* ⚠️ Tabel DIPADATKAN (user 2026-09-08: "fit to window, gaboleh geser
              kanan kiri"). Kelasnya KEMBAR dgn tabel Rekonsiliasi — bukan gaya
              baru. Yang dibeli: padding sel 32px→16px (×15 kolom = 240px) dan
              kepala kolom berhenti HURUF BESAR ber-`tracking-wider`, yang
              selama ini memaksa lebar minimum jauh di atas isinya
              ("NILAI PEROLEHAN" vs "Nilai Perolehan"). `overflow-x-auto`
              SENGAJA dipertahankan sbg jaring pengaman untuk layar sempit —
              mencabutnya tak membuat tabel muat, cuma memotong isinya diam-diam. */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] [&_.table-td]:px-2 [&_.table-td]:py-1.5 [&_.table-th]:px-2 [&_.table-th]:py-2 [&_.table-th]:normal-case [&_.table-th]:tracking-normal">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {!isViewer && <th className="table-th w-8" />}
                  {cols.map(k => <th key={k} className={thClass(k)}>{thContent(k)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={kolom} className="table-td text-center py-12 text-gray-400">
                    {loadErr ? 'Data gagal dimuat — lihat pesan di atas.' : 'Tidak ada data untuk filter ini'}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={r.nibar} className={sel[r.nibar] ? 'bg-teal/5' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {!isViewer && (
                      <td className="table-td">
                        {terkunci.has(r.nibar) ? (
                          <button onClick={() => infoTerkunci(r)}
                            title="Klik untuk lihat transaksi yang menguncinya"
                            className="text-gray-400 hover:text-gray-600">🔒</button>
                        ) : (
                          <input type="checkbox" checked={!!sel[r.nibar]} onChange={() => toggleSel(r)} />
                        )}
                      </td>
                    )}
                    {cols.map(k => <td key={k} className={tdClass(k)}>{cellContent(k, r)}</td>)}
                  </tr>
                ))}
              </tbody>
              {!loading && rows.length > 0 && nilaiIdx >= 0 && (
                <tfoot>
                  {/* showAll → total seluruh hasil filter; kalau terpaginasi, yang
                      dijumlahkan cuma baris di layar — labelnya bilang begitu. */}
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="table-td text-xs" colSpan={Math.max(1, nilaiIdx + (isViewer ? 0 : 1))}>
                      {showAll && total != null
                        ? `TOTAL (${total.toLocaleString('id-ID')} barang)`
                        : `TOTAL halaman ini (${rows.length}${total == null ? '' : ` dari ${total.toLocaleString('id-ID')}`} barang)`}
                    </td>
                    {cols.slice(nilaiIdx).map(k => (
                      <td key={k} className={tdClass(k)}>{TOTAL_KEYS.has(k) ? angka(subtotal(k)) : ''}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Tanpa jumlah total tak ada `totalPages`, tapi maju-mundur tetap
              harus bisa — kalau tidak, gagal menghitung = terkurung di halaman 1. */}
          {!showAll && (total == null ? (page > 0 || adaLagi) : totalPages > 1) && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button className="btn-secondary" disabled={page === 0 || loading} onClick={() => goPage(page - 1)}>← Sebelumnya</button>
              <button className="btn-secondary" disabled={loading || (total == null ? !adaLagi : page >= totalPages - 1)} onClick={() => goPage(page + 1)}>Berikutnya →</button>
            </div>
          )}
        </div>
      )}

      {spekOpen && selList.length > 0 && (
        <EditSpesifikasiModal
          title={selList.length === 1
            ? (selList[0].nama_barang || selList[0].nibar)
            : `${selList.length} barang — ${golLabel(selList[0].kode)}`}
          fieldKeys={spekKeys}
          storagePrefix={spekPrefix}
          initialFields={spekInitFields}
          initialFoto={spekInitFoto}
          single={selList.length === 1}
          onSave={simpanSpek}
          onClose={() => setSpekOpen(false)}
        />
      )}
    </div>
  )
}
