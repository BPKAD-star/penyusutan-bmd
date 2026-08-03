# Schema — Basis Data Penyusutan BMD

> Ringkasan skema PostgreSQL (Supabase) beserta mekanisme integritasnya.
> **Diagram ER lengkap per modul** ada di
> [docs/skema-database.md](docs/skema-database.md) — berkas ini adalah peta
> tingkat atas + aturan integritas yang wajib diketahui sebelum menyentuh DB.
>
> **Peta seluruh dokumen: [README.md](README.md).**

## Konvensi Penamaan

- `admin_*` — tabel referensi/master (`admin_skpd`, `admin_kodefikasi_bmd`, …).
- `stg_import_*` — staging import, transient.
- `fn_*` — fungsi database (RLS helper, trigger, RPC).
- `idx_*` — index.
- `auth.users` — bawaan Supabase Auth, di luar kendali aplikasi.

## Peta Modul

| # | Modul | Tabel inti |
|---|---|---|
| 1 | Inti / Ledger BMD | `aset`, `transaksi_bmd`, `penyusutan_semester`, `jurnal_header`, `aset_awal_2026` |
| 2 | Referensi & Master | `admin_skpd`, `admin_profiles`, `admin_kodefikasi_bmd`, `admin_jenis_aset`, `admin_overhaul_band`, `admin_pegawai`, `admin_satuan_bmd`, `admin_wilayah`, `admin_rekening`, `admin_program` |
| 3 | Tahun Buku | `tahun_buku`, `tahun_buku_log` |
| 4 | Spesifikasi & Detail Aset | kolom lebar di `aset`, `aset_bidang_tanah` |
| 5 | KIR | `kir_ruangan`, `kir_ruangan_aset` |
| 6 | IPA | `ipa_tahun_anggaran`, `ipa_record`, `ipa_parameter_nilai`, `ipa_dokumen_bukti`, `ipa_log` |
| 7 | RKBMD | `rkbmd_ssh`, `rkbmd_sbsk`, `rkbmd`, `rkbmd_item` |
| 8 | LRA | `lra_realisasi` |
| 9 | Usulan Pengurus Barang | `admin_usulan_pengurus` |
| 10 | Dokumen Siklus | `dokumen_siklus` |
| 11 | Chat / Kolaborasi | `chat_messages`, `chat_reads`, `chat_messages_ai` |
| 12 | Import / Staging | `stg_import_*` |

## 1. Tabel Jantung

### `aset` — register (keadaan terkini)
PK `id uuid`. Kolom kunci: `nibar` (UNIQUE), `kode_register` (UNIQUE),
`kode` (→ `admin_kodefikasi_bmd`), `nama_barang`, `uraian_barang`, `jumlah`,
`nilai_perolehan` (basis susut; naik saat kapitalisasi), `tgl_perolehan`,
`skpd_id`, `intra_ekstra` (`intra`|`ekstra`), `cara_perolehan`,
`status` (`aktif`|`dihapus`|`draft`), `foto_paths text[]`,
cache `pemanfaatan` & `pengamanan`.

**NIBAR vs KODE REGISTER** — dua-duanya 45 digit dengan susunan yang sama
(`[12][01|02][3506][kode SKPD 14][tahun 4][kode barang 12][urut 7]`), tapi
maknanya beda:
- **`nibar` = akta lahir.** Terbit sekali saat barang masuk, **tidak pernah
  berubah** (direklas pun tidak digenerate ulang). Ini kunci relasi di DB —
  dipakai mencocokkan `aset_awal_2026` dan jadi alamat halaman KIBAR.
- **`kode_register` = KTP.** Mengikuti **posisi terakhir** barang; terbit ulang
  saat pindah unit (`pengalihan_status`/`mutasi_internal`), reklas kode/golongan,
  atau reklas komptabel. Segmen tahunnya = **tahun masuk SKPD**, bukan tahun
  perolehan. **JANGAN dipakai sebagai kunci join** — nilainya berubah.

Barang berstatus `draft` belum punya `kode_register` (nomor urut tak dibakar
untuk barang yang mungkin tak jadi); barang `dihapus` memegang kode terakhirnya.

**Wide table**: kolom spesifikasi nullable untuk semua golongan dalam satu
tabel (bukan tabel per jenis aset). Template per golongan didefinisikan di
`lib/asetFields.ts` — `FieldKey` = nama kolom DB **persis 1:1**.

### `transaksi_bmd` — ledger (kejadian), append-only
PK `id bigint identity` (= urutan kronologis sesungguhnya). Kolom kunci:
`aset_id`, `jenis` (enum), `periode` (`YYYY-S1`/`YYYY-S2`, beku), `tanggal`,
`nilai`, `skpd_asal`, `skpd_tujuan`, `header_id` (→ `jurnal_header`),
`payload jsonb` (detail per jenis: `sub_jenis`, `target_trx_id`, `kode_lama`,
`kode_baru`, `reversal`, dst.).

### `penyusutan_semester` — hasil engine
Per (`aset_id`, `periode`): `nilai_perolehan`, `beban`, `akumulasi`,
`nilai_buku_akhir`, sisa masa manfaat. **Turunan** — boleh dihitung ulang.

### `jurnal_header` — sampul kartu ber-dokumen
`skpd_id`, `kategori`, `no_sk`, `tanggal`, `periode` (beku), `keterangan`,
`approval_status` (`pending`|`disetujui`|`ditolak`), `created_by`,
`payload jsonb` (termasuk `draft_items` untuk alur approval, dan field header
khusus Pemanfaatan/Pengamanan). Header **boleh diedit**; baris ledger di
bawahnya tetap beku.

### `aset_awal_2026` — baseline beku 2025
Snapshot saldo akhir 2025, dicocokkan ke `aset` lewat NIBAR. Display-only,
**tidak pernah dibaca engine** (engine replay dari ledger `saldo_awal`).

### `kode_register_seq` — alokator nomor urut
`prefix38` (PK) → `nomor_terakhir`. Satu baris per (SKPD + tahun + kode barang +
intra/ekstra). Alokasi lewat `INSERT … ON CONFLICT DO UPDATE … RETURNING`
(`fn_alokasi_nomor_register`, SECURITY DEFINER) — **O(1) & aman dari balapan**,
bukan `LIKE 'prefix%'` yang pernah membuat generator NIBAR timeout lalu diam-diam
mengulang nomor dari 1. **MONOTON**: nomor yang ditinggalkan barang yang pindah
keluar tidak pernah diterbitkan ulang, jadi nomor urut per SKPD boleh berlubang
(…122, …124) — itu harga dari kode yang stabil.

### `aset_kode_register` — riwayat kode register, append-only
`aset_id`, **`kode_lama`**, `kode_register`, `periode`, `tanggal`, `trx_id`,
`alasan`. **Satu baris = satu perpindahan**, memuat kode lama DAN kode baru
sekaligus. Karena itu 418rb barang yang tak pernah pindah tidak menitipkan satu
baris pun, tapi riwayatnya tetap bisa direkonstruksi: kode pada periode V =
`kode_register` baris terakhir dengan periode ≤ V; kalau belum ada, jatuh ke
`kode_lama` baris paling awal. Bentuk & cara bacanya **sengaja kembar** dengan
`ownersAt()` di `lib/pengalihan.ts`.

Arah penunjuknya **riwayat → ledger** (`trx_id`), bukan sebaliknya: menyalin
kode ke `transaksi_bmd` hanya menduplikasi data yang sudah bisa diturunkan.
Ditulis hanya oleh trigger SECURITY DEFINER; `authenticated` cuma punya SELECT.

## 2. Enum `jenis_transaksi_bmd`

Satu enum untuk seluruh peristiwa. Dikelompokkan menurut perlakuannya:

| Kelompok | Nilai |
|---|---|
| Baseline | `saldo_awal`, `saldo_awal_checkpoint` |
| Cara perolehan | `pengadaan`, `hibah_masuk`, `tukar_menukar`, `hasil_inventarisasi`, `perolehan_lainnya`, `akumulasi_kdp` |
| Perpindahan unit | `pengalihan_status`, `mutasi_internal` (pembatalannya: `batal_pengalihan`) |
| Reklasifikasi | `reklas_kode`, `reklas_golongan`, `reklas_komptabel` |
| Koreksi | `koreksi_nilai`, `koreksi_spesifikasi`, `koreksi_kuantitas`, `koreksi_pencatatan_ganda` |
| Kapitalisasi | `kapitalisasi`, `kapitalisasi_serap` |
| KDP & pemecahan | `kdp_selesai_keluar`, `kdp_selesai_masuk`, `pemecahan_keluar`, `pemecahan_masuk` |
| Penghapusan | `penghapusan_pemindahtanganan`, `penghapusan_sebab_lain` |
| Pemanfaatan | `pemanfaatan`, `pemanfaatan_selesai` |
| Pengamanan | `pengamanan`, `pengembalian_pengamanan` |
| Pembalik (`batal_*`) | `batal_pengadaan`, `batal_hibah_masuk`, `batal_tukar_menukar`, `batal_hasil_inventarisasi`, `batal_perolehan_lainnya`, `batal_akumulasi_kdp`, `batal_kapitalisasi`, `batal_penghapusan`, `batal_reklas`, `batal_koreksi_nilai`, `batal_koreksi_spesifikasi`, `batal_koreksi_pencatatan_ganda`, `batal_pemecahan`, `batal_pemecahan_masuk`, `batal_pemanfaatan`, `batal_pengamanan` |

⚠️ `ALTER TYPE … ADD VALUE` **tidak boleh di dalam blok transaksi** dan wajib
dijalankan **sebelum** deploy kode yang memfilter nilai baru itu.

### Klasifikasi perilaku (dipakai halaman pembaca)
- **SEMBUNYI**: `kapitalisasi_serap`, `penghapusan_*`, `batal_pengadaan`,
  `koreksi_pencatatan_ganda`, `batal_hibah_masuk`, `batal_tukar_menukar`,
  `batal_hasil_inventarisasi`, `batal_perolehan_lainnya`, `pemecahan_keluar`,
  `batal_pemecahan_masuk` (+ `kdp_selesai_keluar` di Daftar Barang).
- **MUNCUL**: `batal_kapitalisasi`, `batal_penghapusan`, `batal_pemecahan`,
  `batal_koreksi_pencatatan_ganda`.
- **NETRAL** (engine `default: break`): `pengalihan_status`,
  `mutasi_internal`, `batal_pengalihan`, `pemanfaatan*`, `pengamanan*`.

⚠️ `batal_pengalihan` menganulir lewat **`payload.target_trx_ids` (JAMAK)** —
sekali batal membatalkan baris perginya DAN baris pulangnya, sebab membatalkan
separuh menyisakan rantai yang tak nyambung. `batal_*` lain memakai
`target_trx_id` (tunggal); `fetchBatalTargets` membaca dua-duanya. Beda dari
baris pengembalian ber-`payload.reversal`, yang justru peristiwa NYATA dan tetap
dibaca laporan — lihat [rules.md](rules.md) §1.6.

## 3. Mekanisme Integritas (trigger & guard)

| Fungsi | Menjaga |
|---|---|
| `fn_transaksi_bmd_immutable` | Ledger append-only — tolak UPDATE/DELETE, termasuk service_role |
| `fn_aset_kode_register_immutable` | Riwayat kode register append-only |
| `fn_aset_kode_register_sync` | Menerbitkan/membekukan `aset.kode_register`. Trigger `BEFORE INSERT OR UPDATE OF skpd_id, kode, intra_ekstra, status, tgl_perolehan` — **`kode_register` sengaja di luar daftar itu** supaya backfill massal tak membangunkannya. Kode dari client selalu diabaikan (nomor wajib lewat counter). Cabang **pembatalan** dipicu GUC `app.batal_pengalihan` (di-set `fn_batal_pengalihan_barang`): menghitung ulang seolah tak pernah pindah & memulihkan `kode_register = nibar` bila cocok |
| `fn_cek_tahun_buku` | Tolak tanggal masa depan (tanpa kecuali) & tanggal di tahun terkunci (kecuali whitelist retroaktif). Tahun tak terdaftar = terkunci |
| `fn_jurnal_header_guard` | Edit header tidak boleh pindah semester; `skpd_id`/`kategori` tidak boleh berubah |
| `fn_jurnal_header_approval_guard` | Hanya admin / Pengurus Barang atasan yang boleh approve; **pembuat ≠ penyetuju** |
| `fn_aset_awal_2026_spek_only` | Baseline: hanya kolom spesifikasi yang boleh di-UPDATE (+ GRANT per-kolom sebagai lapis kedua) |
| `fn_aset_awal_2026_terkunci` / `_batch` | Barang yang pernah bergerak (koreksi spek, reklas, pindah unit) terkunci dari edit baseline |
| `fn_tahun_buku_log_immutable` | Log tutup tahun append-only |
| `fn_skpd_set_path` | Menjaga `ltree` path hierarki SKPD |
| `fn_pegawai_nip_guard`, `fn_rkbmd_status_guard`, `fn_rkbmd_item_lock`, `fn_validasi_inventarisasi` | Guard per modul |

## 4. RLS & Wewenang

Helper: `fn_is_admin()`, `fn_is_viewer()`, `fn_skpd_visible(skpd_id)`,
`fn_my_skpd_scope()`, `fn_my_skpd_ids()`, `fn_my_skpd_path()`,
`fn_aset_pernah_dikelola(aset_id)`, `fn_is_pengurus_barang_atas()`.

Hierarki SKPD memakai **ltree** (`admin_skpd.path`) sehingga "subtree SKPD"
bisa dicek dengan satu operator.

Policy inti (semua fungsi **dibungkus InitPlan**):

```sql
CREATE POLICY "trx_select" ON transaksi_bmd FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin())
    OR fn_skpd_visible(skpd_asal)
    OR fn_skpd_visible(skpd_tujuan)
    OR EXISTS (SELECT 1 FROM aset a WHERE a.id = transaksi_bmd.aset_id
               AND fn_skpd_visible(a.skpd_id))
  );
```

Pola yang sama untuk `aset_select`, `sa_select`, dan policy `*_viewer_select`.

**RPC SECURITY DEFINER** untuk operasi lintas-wewenang:
`fn_terima_pengalihan`, `fn_tolak_pengalihan`,
`fn_kembalikan_pengalihan_barang`, `fn_terima_mutasi_internal`,
`fn_kembalikan_mutasi_internal`, `fn_tutup_tahun`, `fn_preview_tutup_tahun`,
`fn_setujui_usulan_pengurus`.

**RPC agregasi** (supaya browser tidak menarik ratusan ribu baris):
`fn_daftar_barang`, `fn_rekap_bmd`, `fn_rekap_saldo_awal`, `fn_dashboard_rekap`,
`fn_lra_belanja_modal`.

## 5. Index — dan alasannya

Skala saat ini: `aset` ± 418.144 baris, `transaksi_bmd` ± 418.452 baris (99,9%
di antaranya `saldo_awal` hasil import baseline + ATL).

| Index | Melayani |
|---|---|
| `idx_aset_skpd (skpd_id)` | Filter scope SKPD (leakproof → index-cond di bawah RLS) |
| `idx_aset_kode (kode)`, `idx_aset_kode_pattern (kode text_pattern_ops)` | Pencarian & `LIKE 'gol.%'` (hanya efektif **tanpa** RLS) |
| `idx_aset_nibar_pattern (nibar text_pattern_ops)` | `generateNibars` — `nibar LIKE '<prefix>%'`; UNIQUE bawaan tidak cukup |
| `idx_aset_status`, `idx_aset_wilayah` | Filter status & wilayah |
| `idx_aset_tanah_skpd`, `idx_aset_angkutan_skpd` | **Partial** `(skpd_id) WHERE kode LIKE '<prefix>' AND status='aktif'` — halaman golongan tunggal (GIS Tanah, Kendaraan) |
| `idx_trx_aset (aset_id)` | Kolektor terscope per aset |
| `idx_trx_jenis_aset (jenis, aset_id)` | Status void/batal per aset |
| `idx_trx_jenis_tanggal (jenis, tanggal)` | LRA belanja modal |
| `idx_trx_jenis_id (jenis, id)`, `idx_trx_periode_jenis_id (periode, jenis, id)` | Kolektor laporan ber-`ORDER BY id` |
| `idx_trx_pindah_id` | **Partial** `(id) WHERE jenis IN ('pengalihan_status','mutasi_internal','batal_pengalihan')` — riwayat pindah unit (segelintir baris dari 418rb). ⚠️ Predikatnya **kembar** dengan `JENIS_DITARIK` di `lib/pengalihan.ts` — ubah satu, ubah dua-duanya, atau index diabaikan **diam-diam** |
| `idx_trx_header (header_id)` | Grouping kartu jurnal |
| `aset_kode_register_key (kode_register)` | UNIQUE — jaring pengaman terakhir kalau alokator nomor bocor. Waktu generator NIBAR diam-diam mengulang dari 1, cuma constraint UNIQUE yang menyelamatkan |
| `idx_akr_aset_id (aset_id, id)`, `idx_akr_kode (kode_register)` | Riwayat kode register per aset & penelusuran balik dari dokumen fisik |

⚠️ **Aturan index di repo ini** (rincian: [rules.md](rules.md) §4):
`LIKE` dan `=` pada kolom **enum** tidak pernah bisa jadi index-cond di bawah
RLS → gunakan **partial index** dengan predikat yang **sama persis** dengan
qual di kode. Verifikasi EXPLAIN **wajib dengan RLS aktif**:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<UUID-user>","role":"authenticated"}';
EXPLAIN ANALYZE <query>;
ROLLBACK;
```

## 6. Storage

| Bucket | Isi | Batas |
|---|---|---|
| `aset-foto` | Foto barang (`aset.foto_paths[]`); draft pakai prefix `draft/<key>/` | 10MB, image/jpeg\|png\|webp |
| `dokumen-sumber` | Dokumen jurnal: pengalihan, BAST/SK, sertifikat, `pengamanan-bast/`, `pengamanan-pakta/` | 10MB, image + PDF |
| `ipa-bukti` | Bukti penilaian IPA (`ipa_dokumen_bukti.url`) | image + PDF |

Ketiganya **privat** — tampilkan lewat signed URL (~1 jam), bukan public URL.

## 7. Migrasi

Berkas di `supabase/migrations/`, penamaan `YYYYMMDD_NN_deskripsi.sql`,
dijalankan **manual berurutan** di Supabase SQL Editor. SQL Editor membungkus
skrip dalam satu transaksi → selalu `CREATE INDEX` PLAIN (bukan
`CONCURRENTLY`), dan `ALTER TYPE … ADD VALUE` harus statement lepas.
Setiap migrasi import massal ditutup dengan `ANALYZE` tabel yang diisi.
