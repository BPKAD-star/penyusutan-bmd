# Skema Database Penyusutan BMD — per Modul

Dokumen ini memetakan skema database (Supabase/PostgreSQL) aplikasi Penyusutan
Barang Milik Daerah (BMD) Kabupaten/Kota Kediri, dikelompokkan **per modul**.
Setiap modul disertai diagram ER (Mermaid) dan dokumentasi ringkas: tujuan tabel,
kunci relasi, dan aturan integritas penting.

> **Konvensi penamaan**
> - Tabel referensi/master di-prefix `admin_` (mis. `admin_skpd`, `admin_kodefikasi_bmd`).
> - Tabel staging import di-prefix `stg_import_*` (transient, tidak digambar detail).
> - `auth.users` = tabel bawaan Supabase Auth (di luar kendali aplikasi).
> - Diagram hanya menampilkan **kolom kunci** (PK/FK/atribut penting) agar terbaca;
>   bukan seluruh kolom.

> **Prinsip lintas-modul yang tercermin di skema**
> - `transaksi_bmd` = **ledger append-only** (UPDATE/DELETE diblokir trigger
>   `fn_transaksi_bmd_immutable`). Koreksi = transaksi baru yang membalik.
> - Penghapusan aset = **soft-delete** (`aset.status='dihapus'`), tak ada policy DELETE.
> - `penyusutan_semester` = **hasil engine** (turunan replay ledger), bukan mirror `aset`.
> - Masa manfaat disimpan dalam **TAHUN** di DB; konversi ×2 ke semester hanya di engine.
> - RLS per-SKPD berbasis `ltree` (`admin_skpd.path`) + fungsi `fn_skpd_visible()`,
>   `fn_is_admin()`, `fn_is_viewer()` (dibungkus InitPlan `(SELECT ...)` di path panas).

---

## Peta Modul

| # | Modul | Tabel Inti |
|---|-------|-----------|
| 1 | Inti / Ledger BMD | `aset`, `transaksi_bmd`, `penyusutan_semester`, `jurnal_header`, `aset_awal_2026` |
| 2 | Referensi & Master (`admin_`) | `admin_skpd`, `admin_profiles`, `admin_kodefikasi_bmd`, `admin_jenis_aset`, `admin_overhaul_band`, `admin_pegawai`, `admin_satuan_bmd`, `admin_wilayah`, `admin_rekening`, `admin_program` |
| 3 | Tahun Buku (kunci akuntansi) | `tahun_buku`, `tahun_buku_log` |
| 4 | Spesifikasi & Detail Aset | kolom lebar `aset`, `aset_bidang_tanah` |
| 5 | IPA (Indeks Pengelolaan Aset) | `ipa_tahun_anggaran`, `ipa_record`, `ipa_parameter_nilai`, `ipa_dokumen_bukti`, `ipa_log` |
| 6 | RKBMD (Perencanaan Kebutuhan) | `rkbmd_ssh`, `rkbmd_sbsk`, `rkbmd`, `rkbmd_item` |
| 7 | LRA / Rekonsiliasi Belanja | `lra_realisasi` |
| 8 | Usulan Pengurus Barang | `admin_usulan_pengurus` |
| 9 | Dokumen Siklus | `dokumen_siklus` |
| 10 | Chat / Kolaborasi | `chat_messages`, `chat_reads`, `chat_messages_ai` |
| 11 | Import / Staging | `stg_import_*` |

---

## 1. Modul Inti / Ledger BMD

Jantung aplikasi: register aset + ledger transaksi append-only + hasil penyusutan.
Menu ber-No SK (Penghapusan, Kapitalisasi, Reklasifikasi, Pengalihan, Pemanfaatan,
Pengamanan, Pengadaan, dll.) memakai `jurnal_header` sebagai "sampul" yang boleh
diedit, sedangkan baris ledger tetap beku.

```mermaid
erDiagram
    admin_skpd        ||--o{ aset                : "memiliki (skpd_id)"
    aset              ||--o{ transaksi_bmd       : "aset_id (append-only)"
    aset              ||--o{ penyusutan_semester : "aset_id (hasil engine)"
    jurnal_header     ||--o{ transaksi_bmd       : "header_id (kartu jurnal)"
    admin_skpd        ||--o{ jurnal_header       : "skpd_id"
    admin_skpd        ||--o{ transaksi_bmd       : "skpd_asal / skpd_tujuan"
    aset              ||--o| aset_awal_2026      : "baseline beku (nibar)"

    aset {
        uuid    id PK
        text    nibar UK
        text    kode "FK ke admin_kodefikasi_bmd"
        text    nama_barang
        numeric jumlah
        numeric nilai_perolehan "basis susut; naik saat kapitalisasi"
        date    tgl_perolehan
        bigint  skpd_id FK
        text    intra_ekstra "intra | ekstra"
        text    cara_perolehan "saldo_awal|pengadaan|hibah_masuk|..."
        text    status "aktif | dihapus (soft-delete)"
        text    pemanfaatan "cache badge"
        text    pengamanan "cache kustodian"
    }
    transaksi_bmd {
        bigint  id PK
        uuid    aset_id FK
        text    jenis "enum jenis_transaksi_bmd"
        text    periode "YYYY-S1 | YYYY-S2 (beku)"
        date    tanggal
        numeric nilai
        bigint  skpd_asal FK
        bigint  skpd_tujuan FK
        uuid    header_id FK
        jsonb   payload "detail per jenis"
    }
    penyusutan_semester {
        bigint  id PK
        uuid    aset_id FK
        text    periode "UK(aset_id,periode)"
        numeric nilai_buku_awal
        numeric beban
        numeric akumulasi
        numeric nilai_buku_akhir
        integer sisa_semester
        numeric masa_manfaat_tahun
    }
    jurnal_header {
        uuid    id PK
        bigint  skpd_id FK
        text    kategori "penghapusan|kapitalisasi|pengalihan_status|pemanfaatan|pengamanan|pengadaan|..."
        text    no_sk
        date    tanggal
        text    periode "beku per semester"
        text    approval_status "pending|disetujui|ditolak"
        bigint  skpd_tujuan FK
        jsonb   payload "draft_items, dokumen_paths, dll"
    }
    aset_awal_2026 {
        text    nibar "foto saldo akhir 2025 (display-only)"
        numeric nilai_buku_awal
        numeric akumulasi_2025
    }
```

**Catatan integritas**
- `transaksi_bmd.jenis` adalah enum `jenis_transaksi_bmd` yang tumbuh lewat migrasi
  (`saldo_awal`, `pengadaan`, `kapitalisasi`, `reklas_kode`, `pengalihan_status`,
  `penghapusan_*`, `batal_*`, `pemanfaatan`, `pemanfaatan_selesai`, `pengamanan`,
  `pengembalian_pengamanan`, `akumulasi_kdp`, dll.). **Deploy-ordering**: migrasi
  `ADD VALUE` enum wajib jalan **sebelum** deploy kode pembaca.
- Visibilitas period-aware Daftar Barang & Penyusutan dihitung dengan **replay
  event ledger** (`SEMBUNYI` vs `MUNCUL`), bukan cek `aset.status` langsung.
- `jurnal_header` boleh diedit (No SK/tanggal) tetapi dijaga trigger
  `fn_jurnal_header_guard`: tak boleh ganti `skpd_id`/`kategori`, dan tanggal baru
  wajib tetap di **semester** yang sama (periode beku).
- `aset_awal_2026` (rename dari `saldo_awal_2026`) = baseline beku, tak pernah
  disentuh transaksi.

---

## 2. Modul Referensi & Master (`admin_`)

Data referensi satu-kopi dibagi lintas tahun. Ditulis hanya oleh admin
(`fn_is_admin()`), dibaca semua user login. `admin_skpd` memakai `ltree` untuk
hierarki organisasi (induk → sub-OPD → lokasi) yang menjadi dasar seluruh RLS.

```mermaid
erDiagram
    admin_skpd            ||--o{ admin_skpd        : "parent_id (hierarki ltree)"
    admin_skpd            ||--o{ admin_profiles     : "skpd_id"
    admin_skpd            ||--o{ admin_pegawai      : "skpd_id"
    auth_users            ||--o| admin_profiles     : "id (1:1)"
    admin_pegawai         ||--o| admin_profiles     : "pegawai_id"
    admin_jenis_aset      ||--o{ admin_kodefikasi_bmd : "jenis_aset_id"
    admin_kodefikasi_bmd  ||--o{ admin_overhaul_band  : "kode_prefix (band overhaul)"

    admin_skpd {
        bigint id PK
        text   nama
        bigint parent_id FK
        ltree  path "hierarki"
        int    level
        text   kode_lokasi
        smallint kelompok_fpk "1..4 (IPA)"
    }
    admin_profiles {
        uuid   id PK "FK auth.users"
        text   email
        text   role "admin | user"
        bigint skpd_id FK
        uuid   pegawai_id FK
        text   ipa_role "pb_admin|bkad_verifier|bkad_admin|NULL"
    }
    admin_pegawai {
        uuid   id PK
        text   nip UK
        text   nama
        text   golongan
        text   role_bmd "pengurus_barang|pengguna_barang|..."
        bigint skpd_id FK
    }
    admin_kodefikasi_bmd {
        text    kode PK
        text    kode_jenis "mis. 1.3.2"
        text    uraian
        numeric masa_manfaat_tahun
        numeric batas_kapitalisasi "ambang intra/ekstra"
        int     jenis_aset_id FK
        boolean aktif
    }
    admin_jenis_aset {
        int  id PK
        text nama
    }
    admin_overhaul_band {
        bigint   id PK
        text     kode_prefix "UK(kode_prefix,band_no)"
        smallint band_no
        numeric  pct_min
        numeric  pct_max
        smallint tambahan_tahun
    }
    admin_satuan_bmd {
        bigint id PK
        text   nama UK
    }
    admin_wilayah {
        text kode PK "berjenjang Prov→Kab→Kec→Desa"
        text nama
    }
    admin_rekening {
        text kode_sub_rincian PK "bagan akun belanja (5.x)"
        text uraian_sub_rincian
        text kelompok "modal|operasi|... (generated)"
    }
    admin_program {
        text kode PK
        text uraian "master program/kegiatan"
    }
```

**Catatan integritas**
- `admin_skpd.path`/`level` di-set otomatis oleh trigger `fn_skpd_set_path` dari
  `parent_id`; memindah induk akan meng-cascade reparent seluruh descendant.
- `fn_my_skpd_path()`, `fn_skpd_visible()`, `fn_is_admin()` semua membaca
  `admin_profiles`/`admin_skpd` — inti mesin RLS.
- `admin_kodefikasi_bmd.batas_kapitalisasi` dipakai `klasifikasiKomptabel()` untuk
  menentukan intra vs ekstra saat approve perolehan.
- `admin_overhaul_band` menentukan tambahan masa manfaat saat kapitalisasi/overhaul
  (band per persentase rehab).

---

## 3. Modul Tahun Buku (kunci tahun akuntansi)

Tabel kontrol murni — **tidak** mempartisi data. Dibaca oleh trigger
`fn_cek_tahun_buku` (dipasang di `transaksi_bmd` dan `jurnal_header`) untuk menolak
entry di tahun terkunci / bertanggal masa depan.

```mermaid
erDiagram
    tahun_buku     ||--o{ tahun_buku_log : "tahun (jejak audit)"
    auth_users     ||--o{ tahun_buku_log : "oleh"

    tahun_buku {
        int         tahun PK
        text        status "terbuka | terkunci"
        timestamptz ditutup_pada
        uuid        ditutup_oleh FK
        text        catatan
    }
    tahun_buku_log {
        bigint      id PK
        int         tahun
        text        aksi "tutup | buka"
        uuid        oleh FK
        timestamptz pada
        text        catatan
    }
```

**Catatan integritas**
- Tahun yang **belum terdaftar = default TERKUNCI** (fail-closed). Tahun baru wajib
  di-seed (status `terbuka`) sebelum tanggal masuk ke tahun itu.
- `tahun_buku_log` append-only (trigger `fn_tahun_buku_log_immutable`).
- Whitelist retroaktif (`batal_pengadaan`, `batal_penghapusan`, `batal_kapitalisasi`)
  boleh menembus tahun terkunci; forward-date **tidak pernah** boleh.
- RPC terkait: `fn_tutup_tahun(p_tahun, p_catatan)` (checkpoint massal ke
  `penyusutan_semester` + kunci tahun + buka tahun berikutnya) dan
  `fn_preview_tutup_tahun(p_tahun)` (list jurnal pending penghambat tutup).

---

## 4. Modul Spesifikasi & Detail Aset

Field spesifikasi disimpan sebagai **kolom nullable lebar** di `aset` (satu tabel
untuk semua golongan, template per golongan diatur di `lib/asetFields.ts`). Kekecualian:
Tanah dapat punya **banyak bidang** → tabel anak `aset_bidang_tanah` (1:N).

```mermaid
erDiagram
    aset          ||--o{ aset_bidang_tanah : "aset_id (1 aset tanah → N bidang)"
    admin_wilayah ||--o{ aset              : "wilayah_kode"
    admin_wilayah ||--o{ aset_bidang_tanah : "wilayah_kode"

    aset {
        uuid    id PK
        text    uraian_barang "baku dari kodefikasi (read-only)"
        text    no_polisi "Peralatan & Mesin"
        text    no_rangka
        text    no_mesin
        text    no_bpkb
        text    no_sertifikat "Tanah/Gedung"
        text    hak_kepemilikan
        text    asal_usul
        text    kondisi_barang
        text    penggunaan
        text    wilayah_kode FK
        text    alamat_detail
        numeric latitude
        numeric longitude
        text[]  foto_paths "bucket aset-foto (signed URL)"
    }
    aset_bidang_tanah {
        uuid    id PK
        uuid    aset_id FK
        text    nama_bidang
        numeric luas
        text    jenis_hak
        text    nomor_dokumen_kepemilikan
        date    tanggal_berakhir_hak
        text    wilayah_kode FK
        numeric latitude
        numeric longitude
        text    sertifikat_path "bucket dokumen-sumber"
    }
```

**Catatan integritas**
- `FieldKey` di `lib/asetFields.ts` = nama kolom DB **persis 1:1** — jaga sinkron
  saat rename kolom.
- `aset_bidang_tanah` **bukan ledger** — boleh UPDATE/DELETE langsung (data deskriptif).
- Kolom lama `titik_koordinat`/`lokasi` sudah di-drop; lokasi kini via
  `wilayah_kode` + `alamat_detail` + `latitude`/`longitude`.
- Foto di bucket privat `aset-foto`; dokumen di `dokumen-sumber` (image + PDF).

---

## 5. Modul IPA (Indeks Pengelolaan Aset)

Penilaian skor pengelolaan aset per SKPD per tahun dengan alur
submit → verifikasi. Meng-`extend` `admin_skpd`/`admin_profiles` (kolom tambahan),
tabel skor genuinely baru di-prefix `ipa_`.

```mermaid
erDiagram
    ipa_tahun_anggaran ||--o{ ipa_record          : "tahun_id"
    admin_skpd         ||--o{ ipa_record          : "skpd_id"
    ipa_record         ||--o{ ipa_parameter_nilai : "ipa_id (CASCADE)"
    ipa_record         ||--o{ ipa_dokumen_bukti   : "ipa_record_id (CASCADE)"
    ipa_parameter_nilai||--o{ ipa_dokumen_bukti   : "parameter_nilai_id"
    ipa_record         ||--o{ ipa_log             : "ipa_record_id (CASCADE)"

    ipa_tahun_anggaran {
        uuid    id PK
        int     tahun UK
        date    batas_submit_pb
        date    batas_submit_bkad
        boolean is_active
    }
    ipa_record {
        uuid    id PK
        bigint  skpd_id FK
        uuid    tahun_id FK
        text    status "draft|diajukan|diverifikasi|ditolak"
        numeric st1_nilai
        numeric st4_nilai
        numeric ipa_final
        text    ipa_kategori "Sangat Baik|Baik|Cukup|Buruk"
        text    _uk "UK(skpd_id,tahun_id)"
    }
    ipa_parameter_nilai {
        uuid     id PK
        uuid     ipa_id FK
        text     kode_parameter
        numeric  realisasi
        numeric  target
        smallint indeks "1..4"
        numeric  nilai_terbobot
        jsonb    metadata
    }
    ipa_dokumen_bukti {
        uuid   id PK
        uuid   ipa_record_id FK
        uuid   parameter_nilai_id FK
        text   url "bucket ipa-bukti"
        bigint ukuran_bytes
    }
    ipa_log {
        uuid  id PK
        uuid  ipa_record_id FK
        text  aksi
        jsonb payload
    }
```

**Catatan integritas**
- Satu SKPD hanya punya satu `ipa_record` per tahun (`UNIQUE(skpd_id,tahun_id)`).
- Role IPA terpisah dari role BMD: `admin_profiles.ipa_role` (nullable).
- Bukti di bucket privat `ipa-bukti` (image + PDF, 10 MB).

---

## 6. Modul RKBMD (Rencana Kebutuhan BMD)

Dokumen **perencanaan** tahun anggaran T+1. Sengaja **di luar** ledger — future
year normal, tidak menyentuh `aset`/`transaksi_bmd`. Baris bebas diedit selama
belum disetujui.

```mermaid
erDiagram
    admin_skpd           ||--o{ rkbmd       : "skpd_id"
    rkbmd                ||--o{ rkbmd_item  : "rkbmd_id (CASCADE)"
    rkbmd                ||--o| rkbmd        : "parent_id (murni→perubahan)"
    admin_kodefikasi_bmd ||--o{ rkbmd_ssh   : "kode"
    admin_kodefikasi_bmd ||--o{ rkbmd_sbsk  : "kode"
    admin_kodefikasi_bmd ||--o{ rkbmd_item  : "kode"
    aset                 ||--o{ rkbmd_item  : "aset_id (jenis berbasis aset)"

    rkbmd {
        uuid   id PK
        bigint skpd_id FK
        int    tahun_anggaran "T+1"
        text   jenis "pengadaan|pemeliharaan|pemanfaatan|pemindahtanganan|penghapusan"
        text   versi "murni | perubahan"
        uuid   parent_id FK
        text   status "draft|diajukan|disetujui|ditolak"
        text   _uk "UK(skpd_id,tahun_anggaran,jenis,versi)"
    }
    rkbmd_item {
        uuid    id PK
        uuid    rkbmd_id FK
        text    kode FK
        uuid    aset_id FK
        text    nibar "snapshot audit"
        numeric jumlah_standar
        numeric jumlah_eksisting "beku saat disusun"
        numeric jumlah_kebutuhan
        numeric harga_satuan
        numeric total_anggaran
    }
    rkbmd_ssh {
        bigint  id PK
        int     tahun
        text    kode FK
        numeric harga
        text    _uk "UK(tahun,kode)"
    }
    rkbmd_sbsk {
        bigint  id PK
        int     tahun
        text    kode FK
        numeric kuantitas_standar
        text    satuan_pengukur
        text    _uk "UK(tahun,kode)"
    }
```

**Catatan integritas**
- `rkbmd_ssh` (Standar Satuan Harga) & `rkbmd_sbsk` (Standar Barang & Kebutuhan) =
  referensi per-tahun sekabupaten (bukan per-SKPD).
- Approve hanya membekukan `status`; **tidak** ada materialisasi ke ledger.
- `rkbmd_item` satu tabel lebar untuk 5 jenis (kolom nullable per jenis).

---

## 7. Modul LRA / Rekonsiliasi Belanja

Data referensi hasil import dari akuntansi (Laporan Realisasi Anggaran), bahan
Rekonsiliasi Belanja Modal. **Bukan ledger** — bebas upsert/delete, bukan subjek
Tahun Buku.

```mermaid
erDiagram
    admin_skpd ||--o{ lra_realisasi : "skpd_id"

    lra_realisasi {
        bigint  id PK
        bigint  skpd_id FK
        date    tanggal
        int     tahun "generated"
        int     bulan "generated"
        text    no_bukti
        text    kode_rekening "5.2.02.05.001.00005"
        text    kode_grup3 "generated (5.2.02)"
        text    kelompok "modal|barjas|lain (generated)"
        numeric debit
        text    klasifikasi "kapitalisasi|reklas_keluar (tanda Fase B)"
        text    jenis_tujuan
        text    _uk "UK(skpd_id,no_bukti,kode_rekening)"
    }
```

**Catatan integritas**
- Natural key `(skpd_id, no_bukti, kode_rekening)` untuk upsert anti-dobel.
- Kolom TANDA (`klasifikasi`/`jenis_tujuan`) diisi di Fase B (Kapitalisasi/Reklas);
  re-import tidak menimpanya (payload upsert tak menyertakan kolom tanda).
- `kode_rekening` merujuk konsep bagan akun di `admin_rekening`.

---

## 8. Modul Usulan Pengurus Barang

Alur usul → ajukan → admin setujui/kembalikan → (disetujui) auto-materialize ke
`admin_pegawai`. Data administratif, bukan ledger.

```mermaid
erDiagram
    admin_skpd    ||--o{ admin_usulan_pengurus : "skpd_id"
    admin_pegawai ||--o| admin_usulan_pengurus : "pegawai_id (diisi saat disetujui)"

    admin_usulan_pengurus {
        uuid   id PK
        bigint skpd_id FK
        text   nama
        text   nip
        text   golongan
        text   jenis "pengurus_barang | pegawai_lain"
        text   status "draft|diajukan|disetujui|dikembalikan"
        text   catatan_admin
        uuid   pegawai_id FK
    }
```

**Catatan integritas**
- Pola mirip draft-approve Cara Perolehan, tapi tabel sendiri (bukan `jurnal_header`)
  karena bukan barang.
- Saat disetujui, materialize ke `admin_pegawai` (`role_bmd='pengurus_barang'`) dan
  isi `pegawai_id`.

---

## 9. Modul Dokumen Siklus

Penyimpanan generik dokumen siklus BMD yang belum punya modul sendiri (SK RKBMD,
SK Penetapan Status Penggunaan, Perjanjian Pemanfaatan, dll). Siklus yang sudah
punya penyimpanan (Pengadaan, Pengalihan, Penghapusan) dibaca langsung dari
`jurnal_header.payload.dokumen_paths`, tidak diduplikasi ke sini.

```mermaid
erDiagram
    admin_skpd ||--o{ dokumen_siklus : "skpd_id (NULL = global/kabupaten)"
    auth_users ||--o{ dokumen_siklus : "uploaded_by"

    dokumen_siklus {
        uuid   id PK
        int    tahun
        text   siklus "perencanaan_kebutuhan|penggunaan_sk_penetapan|pemanfaatan|penilaian|pengamanan|..."
        text   sub_jenis "khusus pemindahtanganan"
        bigint skpd_id FK
        text   judul
        text   file_path "bucket dokumen-sumber"
    }
```

**Catatan integritas**
- Role 3 tingkat diturunkan dari struktur SKPD (tanpa kolom role baru):
  super admin BKAD (`fn_is_admin`), admin SKPD induk (`fn_skpd_admin_induk`, hanya
  siklus `pengamanan`), dan non-admin (lihat/unduh saja).
- Pemanfaatan & Pemindahtanganan sengaja global (`skpd_id NULL`).

---

## 10. Modul Chat / Kolaborasi

Fitur komunikasi antar user platform: chat grup publik + DM 1-on-1 + asisten AI.
Bukan ledger — boleh diedit/dihapus pemiliknya.

```mermaid
erDiagram
    admin_profiles ||--o{ chat_messages    : "sender_id"
    admin_profiles ||--o{ chat_messages    : "recipient_id (NULL = publik)"
    admin_profiles ||--o{ chat_reads       : "user_id"
    admin_profiles ||--o{ chat_messages_ai : "user_id"

    chat_messages {
        bigint      id PK
        uuid        sender_id FK
        uuid        recipient_id FK "NULL = room publik"
        text        content
        timestamptz created_at
    }
    chat_reads {
        uuid   user_id PK
        text   room_key PK "'public' | uuid lawan bicara"
        bigint last_read_id
    }
    chat_messages_ai {
        bigint      id PK
        uuid        user_id FK
        text        role "user | assistant"
        text        content
    }
```

**Catatan integritas**
- `chat_messages.recipient_id IS NULL` = pesan room publik; diisi = DM privat
  (RLS: hanya pengirim & penerima yang bisa baca).
- `chat_reads` (PK gabungan `user_id`+`room_key`) melacak badge unread lintas sesi.
- `chat_messages_ai` terpisah — percakapan pribadi user dengan AI (via OpenRouter),
  RLS hanya pemilik.

---

## 11. Modul Import / Staging

Tabel `stg_import_*` menampung data mentah Excel sebelum dimaterialisasi ke `aset`
+ `transaksi_bmd` (`saldo_awal`). Bersifat **transient** (beberapa sudah di-drop
setelah selesai). Tidak digambar detail karena bukan bagian model runtime.

Contoh: `stg_import_peralatan_mesin`, `stg_import_gedung`, `stg_import_jalan_irigasi`,
`stg_import_atl`, `stg_import_aset_lain_lain`, `stg_import_aset_lain_lain_diknas`,
`stg_import_atl_diknas`.

**Pola materialisasi**: staging → validasi/mapping golongan → insert `aset`
(intra/ekstra dihitung) + `transaksi_bmd` jenis `saldo_awal` → engine dijalankan
untuk mengisi `penyusutan_semester`.

---

## Lampiran: Storage Buckets

| Bucket | Privat | MIME | Dipakai |
|--------|--------|------|---------|
| `aset-foto` | ya | image/jpeg,png,webp | Foto barang (`aset.foto_paths`) |
| `dokumen-sumber` | ya | image + application/pdf | Dokumen jurnal (BAST, SK, sertifikat, pemanfaatan, pengamanan) |
| `ipa-bukti` | ya | image + application/pdf | Bukti penilaian IPA (`ipa_dokumen_bukti.url`) |

Semua bucket privat ditampilkan lewat **signed URL** (bukan public URL).
