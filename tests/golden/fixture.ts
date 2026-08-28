// ============================================================================
// Dataset tetap untuk golden test Rekonsiliasi BMD (TESTING.md §6).
//
// Kecil dan SETIAP BARIS PUNYA MAKSUD — bukan 200 aset acak. Dataset besar
// bikin snapshot yang tak seorang pun sanggup memeriksa, dan snapshot yang tak
// diperiksa cuma memindahkan bug jadi "perilaku baru".
//
// Kasus yang wajib ada menurut TESTING.md §6, dan di mana letaknya:
//   ✔ batal_pengadaan                    → A02
//   ✔ hapus → batal → hapus lagi (1 periode) → A03
//   ✔ hapus lalu dibatalkan (batal menang)   → A04
//   ✔ pengalihan SKPD di tengah periode      → A05
//   ✔ pengalihan lalu DIBATALKAN             → A06
//   ✔ kapitalisasi, lalu kapitalisasi dibatalkan → A07 / A08
//   ✔ barang ekstrakomptabel                 → A09
//   ✔ golongan 1.5.4 (beku)                  → A10
//   ✔ golongan tak disusutkan (Tanah 1.3.1)  → A11
//   ✔ pemecahan induk → 2 pecahan beda kolom → A12/A13/A14
//   ✔ reklas kode (keluar+masuk)             → A15
//   ✔ koreksi nilai tambah & kurang          → A16 / A17
//   ✔ termin KDP lalu reklas ke Gedung, SEPERIODE → A19
//
// ⚠️ A19 ditambahkan 2026-08-27 sesudah bug lolos dari dataset ini. A15 memang
// direklas, tapi ia TIDAK punya baris mutasi lain — jadi tak ada satu pun aset
// yang menguji "transaksi biasa + reklas pada aset yang sama". Selama itu,
// `computeMutasiLines` boleh saja memakai `aset.kode` TERKINI dan tie-out tetap
// hijau. Di produksi akibatnya: kelima termin kontrak konstruksi BKAD dibukukan
// di 1.3.3 Gedung — termasuk yang dibayar semester SEBELUM reklasnya.
//
// TIDAK tercakup di sini, dan itu disengaja: "barang melewati checkpoint tutup
// tahun" (TESTING.md §6) menyentuh ENGINE, bukan Rekonsiliasi — Rekonsiliasi
// membaca hasil engine dari `penyusutan_semester`. Kasus itu sudah dikunci
// lib/engine/penyusutan.test.ts ("memulai replay dari checkpoint TERBARU").
// ============================================================================
import type { Tabel, Embed } from './fakeSupabase'

export const PERIODE_LALU = '2025-S2'
export const PERIODE = '2026-S1'

export const SKPD_A = 10   // dalam scope
export const SKPD_B = 11   // dalam scope (subtree yang sama)
export const SKPD_LUAR = 20

const PM = '1.3.2.02.01.02.003'   // Peralatan & Mesin — disusutkan
const TANAH = '1.3.1.11.01.01.001' // Tanah — TIDAK disusutkan
const ATL = '1.3.5.01.01.01.001'   // Aset Tetap Lainnya
const LAIN = '1.5.4.01.01.01.001'  // Aset Lain-Lain — BEKU
const KDP = '1.3.6.01.01.01.003'   // Konstruksi Dalam Pengerjaan
const GB = '1.3.3.01.01.01.001'    // Gedung dan Bangunan

type AsetRow = {
  id: string; kode: string; skpd_id: number; nilai_perolehan: number
  intra_ekstra: 'intra' | 'ekstra'; tgl_perolehan: string; status: string; nama_barang: string; nibar: string
}

const aset = (
  id: string, kode: string, skpd_id: number, nilai: number,
  intra_ekstra: 'intra' | 'ekstra' = 'intra', tgl = '2024-03-01', status = 'aktif',
): AsetRow => ({
  id, kode, skpd_id, nilai_perolehan: nilai, intra_ekstra, tgl_perolehan: tgl, status,
  nama_barang: `Barang ${id}`, nibar: `NB-${id}`,
})

export const ASET: AsetRow[] = [
  aset('A01', PM, SKPD_A, 100_000_000, 'intra', '2026-02-10'),   // pengadaan sah periode ini
  aset('A02', PM, SKPD_A, 50_000_000, 'intra', '2026-02-11'),    // pengadaan → DIBATALKAN
  aset('A03', PM, SKPD_A, 30_000_000),                            // hapus→batal→hapus (net HAPUS)
  aset('A04', PM, SKPD_A, 40_000_000),                            // hapus→batal (net TIDAK hapus)
  aset('A05', PM, SKPD_A, 60_000_000),                            // dialihkan A→B
  aset('A06', PM, SKPD_A, 70_000_000),                            // dialihkan lalu DIBATALKAN
  aset('A07', PM, SKPD_A, 80_000_000),                            // kapitalisasi sah
  aset('A08', PM, SKPD_A, 90_000_000),                            // kapitalisasi DIBATALKAN
  aset('A09', PM, SKPD_A, 1_000_000, 'ekstra', '2026-01-20'),     // ekstrakomptabel
  aset('A10', LAIN, SKPD_A, 25_000_000),                          // 1.5.4 beku
  aset('A11', TANAH, SKPD_A, 500_000_000),                        // tanah, tak disusutkan
  aset('A12', PM, SKPD_A, 21_000_000),                            // induk pemecahan
  aset('A13', PM, SKPD_A, 12_000_000, 'ekstra', '2024-03-01'),    // pecahan 1 (beda kolom)
  aset('A14', PM, SKPD_A, 9_000_000, 'ekstra', '2024-03-01'),     // pecahan 2
  aset('A15', ATL, SKPD_A, 15_000_000),                           // direklas dari PM ke ATL
  aset('A16', PM, SKPD_A, 8_000_000),                             // koreksi nilai TAMBAH
  aset('A17', PM, SKPD_A, 7_000_000),                             // koreksi nilai KURANG
  aset('A18', PM, SKPD_LUAR, 999_000_000),                        // DI LUAR scope — tak boleh ikut
  // A19 — barang KDP yang menerima termin lalu direklas ke Gedung DI PERIODE
  // YANG SAMA. `kode` di sini sengaja sudah GB: itulah posisi TERAKHIRnya, dan
  // justru kolom itu yang dulu keliru dipakai untuk membukukan terminnya.
  aset('A19', GB, SKPD_A, 30_000_000, 'intra', '2026-03-01'),
  // A20 / A21 — kapitalisasi DUA SISI: induk menyerap nilai anak.
  // ⚠️ Ditambahkan 2026-08-27 sesudah bug lolos dari dataset ini. A07 sudah
  // menguji sisi INDUK (baris `kapitalisasi`), tapi tak ada satu pun aset yang
  // BENAR-BENAR DISERAP — jadi `kapitalisasi_serap` tak pernah muncul di
  // fixture & tie-out tetap hijau walau kategorinya tak dipetakan sama sekali.
  // Di produksi akibatnya: nilai rehab tercatat sbg Penambahan pada induk,
  // barang yang diserap lenyap dari Saldo Akhir tanpa baris Pengurangan, dan
  // selisihnya jatuh ke "Selisih (belum terpetakan)" sebesar DUA KALI rehab.
  aset('A20', PM, SKPD_A, 68_000_000),                            // induk sesudah menyerap (50jt + 18jt)
  aset('A21', PM, SKPD_A, 18_000_000, 'intra', '2024-01-01', 'dihapus'), // anak yang DISERAP
]

export const JURNAL: { id: string; no_sk: string }[] = [
  { id: 'H1', no_sk: 'SK-001/2026' },
  { id: 'H2', no_sk: 'SK-002/2026' },
  { id: 'HP', no_sk: 'SK-PECAH/2026' },
]

type Trx = {
  id: number; jenis: string; aset_id: string; periode: string; tanggal: string; nilai: number
  skpd_asal: number | null; skpd_tujuan: number | null; header_id: string | null
  payload: Record<string, unknown> | null
}

const t = (
  id: number, jenis: string, aset_id: string, nilai: number,
  extra: Partial<Trx> = {},
): Trx => ({
  id, jenis, aset_id, periode: PERIODE, tanggal: '2026-03-01', nilai,
  skpd_asal: null, skpd_tujuan: null, header_id: 'H1', payload: null, ...extra,
})

// ⚠️ `id` = urutan kronologis sesungguhnya (rules.md: replay diurutkan by id
// ledger). Siklus hapus→batal→hapus di A03 SENGAJA memakai id menaik supaya
// "aksi TERAKHIR menang" benar-benar teruji, bukan kebetulan urutan array.
export const TRANSAKSI: Trx[] = [
  // A01 — pengadaan sah. payload.kode_rekening 5.2 → kategori `pengadaan`.
  t(101, 'pengadaan', 'A01', 100_000_000, { payload: { kode_rekening: '5.2.02.01' } }),
  // A02 — pengadaan lalu DIBATALKAN (retroaktif). Tak boleh muncul sbg perolehan.
  t(102, 'pengadaan', 'A02', 50_000_000, { payload: { kode_rekening: '5.2.02.01' } }),
  t(103, 'batal_pengadaan', 'A02', 0),

  // A03 — hapus → batal → hapus LAGI, semuanya di periode yang sama.
  t(110, 'penghapusan_sebab_lain', 'A03', 30_000_000, { payload: { sub_jenis: 'rusak_berat' } }),
  t(111, 'batal_penghapusan', 'A03', 0),
  t(112, 'penghapusan_sebab_lain', 'A03', 30_000_000, { payload: { sub_jenis: 'rusak_berat' } }),

  // A04 — hapus → batal. Aksi terakhir = batal, jadi TIDAK jadi pengurangan.
  t(120, 'penghapusan_pemindahtanganan', 'A04', 40_000_000, { payload: { sub_jenis: 'penjualan' } }),
  t(121, 'batal_penghapusan', 'A04', 0),

  // A05 — pengalihan A → B di periode ini.
  t(130, 'pengalihan_status', 'A05', 60_000_000, { skpd_asal: SKPD_A, skpd_tujuan: SKPD_B }),
  // A06 — pengalihan A → LUAR, lalu DIBATALKAN (payload jamak, migrasi 20260729_07).
  t(131, 'pengalihan_status', 'A06', 70_000_000, { skpd_asal: SKPD_A, skpd_tujuan: SKPD_LUAR }),
  t(132, 'batal_pengalihan', 'A06', 0, { payload: { target_trx_ids: [131] } }),

  // A07 / A08 — kapitalisasi sah & kapitalisasi yang dianulir.
  t(140, 'kapitalisasi', 'A07', 20_000_000),
  t(141, 'kapitalisasi', 'A08', 15_000_000),
  t(142, 'batal_kapitalisasi', 'A08', 0, { payload: { target_trx_id: 141 } }),

  // A09 — perolehan ekstrakomptabel.
  t(150, 'pengadaan', 'A09', 1_000_000, { payload: { kode_rekening: '5.2.02.01' } }),

  // A12 → A13 + A14 — pemecahan: induk KELUAR (intra), pecahan MASUK (ekstra).
  t(160, 'pemecahan_keluar', 'A12', 21_000_000, { header_id: 'HP' }),
  t(161, 'pemecahan_masuk', 'A13', 12_000_000, { header_id: 'HP' }),
  t(162, 'pemecahan_masuk', 'A14', 9_000_000, { header_id: 'HP' }),

  // A15 — reklas kode: keluar dari PM, masuk ke ATL.
  t(170, 'reklas_kode', 'A15', 15_000_000, { payload: { kode_lama: PM, kode_baru: ATL } }),

  // A16 / A17 — koreksi nilai tambah & kurang.
  t(180, 'koreksi_nilai', 'A16', 2_000_000, { header_id: 'H2' }),
  t(181, 'koreksi_nilai', 'A17', -1_500_000, { header_id: 'H2' }),

  // A18 — di LUAR scope: pengadaan besar yang tak boleh ikut terhitung.
  t(190, 'pengadaan', 'A18', 999_000_000, { payload: { kode_rekening: '5.2.02.01' } }),

  // A19 — termin kontrak konstruksi lalu reklas KDP → Gedung, SEPERIODE.
  // ⚠️ Urutan id-nya yang jadi pokok perkara: termin (200) terjadi SEBELUM
  // reklas (201), jadi ia wajib dibukukan di 1.3.6 — bukan di 1.3.3, golongan
  // barang itu SEKARANG. Kalau memakai "kode pada AKHIR periode" pun masih
  // salah: terminnya ikut pindah ke golongan tujuan, lalu 1.3.6 menerima
  // pengurangan reklas tanpa pernah menerima penambahannya & tak akan tie-out.
  t(200, 'akumulasi_kdp', 'A19', 30_000_000, { payload: { kode_rekening: '5.2.03.01' } }),
  t(201, 'reklas_golongan', 'A19', 30_000_000, { payload: { kode_lama: KDP, kode_baru: GB } }),

  // A20 ← A21 — kapitalisasi dua sisi. Nilai yang SAMA muncul dua kali &
  // saling meniadakan: induk naik 18jt (Penambahan), anak lenyap 18jt
  // (Pengurangan). Kekayaan pemda tak bergerak — memang begitu wujudnya.
  // ⚠️ Baris ANAK sengaja TANPA `target_trx_id`: begitulah bentuk aslinya di
  // produksi (Kapitalisasi.tsx cuma menulis {induk_id, no_dokumen} di sisi
  // anak), dan justru itu sebabnya pembatalannya tak bisa dinilai lewat
  // `fetchBatalTargets` melainkan lewat replay "baris terakhir menang"
  // (`fetchNetSerap`).
  t(210, 'kapitalisasi', 'A20', 18_000_000, { header_id: 'H2' }),
  t(211, 'kapitalisasi_serap', 'A21', 18_000_000, { header_id: 'H2', payload: { induk_id: 'A20' } }),
]

// Hasil engine. Disederhanakan tapi KONSISTEN: nilai_buku = perolehan −
// akumulasi. Golongan tak disusutkan & 1.5.4 sengaja diberi beban 0 supaya
// perlakuannya di Rekonsiliasi benar-benar teruji, bukan kebetulan nol.
type Peny = {
  id: number; aset_id: string; periode: string
  nilai_perolehan: number; beban: number; akumulasi: number; nilai_buku_akhir: number
}

let seqPeny = 0
const peny = (aset_id: string, periode: string, perolehan: number, beban: number, akumulasi: number): Peny => ({
  id: ++seqPeny, aset_id, periode,
  nilai_perolehan: perolehan, beban, akumulasi, nilai_buku_akhir: perolehan - akumulasi,
})

const susutBiasa = (id: string, perolehan: number, akumLalu: number, beban: number) => [
  peny(id, PERIODE_LALU, perolehan, beban, akumLalu),
  peny(id, PERIODE, perolehan, beban, akumLalu + beban),
]

export const PENYUSUTAN: Peny[] = [
  // A01 & A09 & A02 baru lahir periode ini → tak ada baris periode LALU.
  peny('A01', PERIODE, 100_000_000, 10_000_000, 10_000_000),
  peny('A09', PERIODE, 1_000_000, 100_000, 100_000),
  ...susutBiasa('A03', 30_000_000, 6_000_000, 3_000_000),
  ...susutBiasa('A04', 40_000_000, 8_000_000, 4_000_000),
  ...susutBiasa('A05', 60_000_000, 12_000_000, 6_000_000),
  ...susutBiasa('A06', 70_000_000, 14_000_000, 7_000_000),
  // A07 dikapitalisasi: perolehan periode ini naik 20jt.
  peny('A07', PERIODE_LALU, 80_000_000, 8_000_000, 16_000_000),
  peny('A07', PERIODE, 100_000_000, 10_000_000, 26_000_000),
  ...susutBiasa('A08', 90_000_000, 18_000_000, 9_000_000),
  // A10 golongan 1.5.4 — BEKU: akumulasi lama tetap, beban baru NOL.
  peny('A10', PERIODE_LALU, 25_000_000, 0, 5_000_000),
  peny('A10', PERIODE, 25_000_000, 0, 5_000_000),
  // A11 Tanah — tak disusutkan; barisnya sengaja ADA supaya terbukti diabaikan.
  peny('A11', PERIODE_LALU, 500_000_000, 0, 0),
  peny('A11', PERIODE, 500_000_000, 0, 0),
  // A12 induk pemecahan: masih utuh di periode LALU, hilang di periode ini.
  peny('A12', PERIODE_LALU, 21_000_000, 2_000_000, 4_000_000),
  // A13 & A14 pecahan: baru ada di periode ini (warisan akumulasi induk).
  peny('A13', PERIODE, 12_000_000, 1_200_000, 3_400_000),
  peny('A14', PERIODE, 9_000_000, 900_000, 2_600_000),
  ...susutBiasa('A15', 15_000_000, 3_000_000, 1_500_000),
  // A16 & A17 kena koreksi nilai di periode ini, jadi `nilai_perolehan` hasil
  // engine IKUT berubah — kalau fixture-nya tidak begitu, tie-out meleset
  // karena datanya sendiri yang tidak konsisten, bukan karena kodenya salah.
  peny('A16', PERIODE_LALU, 8_000_000, 800_000, 1_600_000),
  peny('A16', PERIODE, 10_000_000, 800_000, 2_400_000),   // +2.000.000
  peny('A17', PERIODE_LALU, 7_000_000, 700_000, 1_400_000),
  peny('A17', PERIODE, 5_500_000, 700_000, 2_100_000),    // −1.500.000
  ...susutBiasa('A18', 999_000_000, 100_000_000, 50_000_000),
  // A19 lahir & direklas di periode ini → cuma punya baris periode INI, dan
  // snapshot menempatkannya di golongan TUJUAN (kode pada AKHIR periode).
  // `akumulasi` sengaja = `beban`: seluruh akumulasinya memang dari beban
  // periode ini, jadi "akumulasi bawaan" (akum − beban) = 0 dan invarian
  // "atribusi tak pernah negatif" benar-benar diuji di batasnya.
  peny('A19', PERIODE, 30_000_000, 1_000_000, 1_000_000),
  // A20 induk kapitalisasi: perolehan periode ini naik 18jt (50jt → 68jt),
  // pola yang sama dgn A07 & dgn koreksi nilai di atas — hasil engine WAJIB
  // ikut berubah, kalau tidak tie-out meleset karena fixture-nya sendiri yang
  // tak konsisten.
  peny('A20', PERIODE_LALU, 50_000_000, 5_000_000, 10_000_000),
  peny('A20', PERIODE, 68_000_000, 6_800_000, 16_800_000),
  // A21 anak yang DISERAP: utuh di periode LALU (jadi ia ada di Saldo Awal),
  // TAK punya baris periode ini — `kapitalisasi_serap` event SEMBUNYI, jadi ia
  // memang lenyap dari Saldo Akhir. Persis pola A12 (induk pemecahan).
  peny('A21', PERIODE_LALU, 18_000_000, 1_800_000, 3_600_000),
]

export const EMBED: Embed = {
  transaksi_bmd: {
    aset: { fk: 'aset_id', tabel: 'aset' },
    header: { fk: 'header_id', tabel: 'jurnal_header' },
  },
}

export function tabelFixture(): Tabel {
  return {
    aset: ASET as unknown as Tabel[string],
    transaksi_bmd: TRANSAKSI as unknown as Tabel[string],
    penyusutan_semester: PENYUSUTAN as unknown as Tabel[string],
    jurnal_header: JURNAL as unknown as Tabel[string],
  }
}
