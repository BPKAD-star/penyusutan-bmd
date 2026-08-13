# Runbook Migrasi — daftar periksa pra-terbang

> **Ini bukan daftar aturan, ini daftar centang.** Dibaca **sambil**
> mengerjakan, urut dari atas, satu per satu. Alasan di balik tiap langkah ada
> di [../rules.md](../rules.md) §4 & §5; yang di sini adalah urutan kerjanya.
>
> **Peta seluruh dokumen: [../README.md](../README.md).**

**Kenapa runbook ini ada.** Migrasi di repo ini dijalankan **manual**, di atas
data pemda **LIVE**, tanpa staging. Satu backfill pernah **mematikan seluruh
aplikasi**: WAL membengkak ±700 MB → disk Supabase 54% → 96% → project jadi
READ-ONLY → 504 di middleware, karena refresh sesi auth ternyata operasi
**tulis**. Bukan datanya yang rusak — semua orang cuma tidak bisa login.

---

## 0. Tentukan dulu kelasnya

Langkah yang wajib dijalani berbeda per kelas. Tentukan di awal, jangan di
tengah jalan.

| Kelas | Ciri | Bagian yang wajib |
|---|---|---|
| **Ringan** | DDL kecil: `ADD COLUMN`, `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`, seed beberapa baris | 1 · 2 · 4 · 6 · 7 |
| **Berat** | `CREATE INDEX` di tabel besar, `ALTER TYPE … ADD VALUE`, trigger baru di `aset`/`transaksi_bmd` | semua, kecuali jalur `psql` |
| **Masif** | UPDATE/INSERT **> 100.000 baris**: import, backfill, materialisasi staging | **semua**, wajib lewat `psql` |

Skala acuan hari ini: `aset` ± 418.144 baris, `transaksi_bmd` ± 418.452 baris
([../schema.md](../schema.md) §5). "Sebentar saja" di tabel sebesar itu tidak
ada.

---

## 1. Sebelum menulis SQL-nya

- [ ] **Namai berkasnya `YYYYMMDD_NN_deskripsi.sql`** di
      `supabase/migrations/`. Urutan nama berkas **adalah** urutan eksekusi —
      tidak ada mekanisme lain yang mengurutkannya.
- [ ] **Tulis alasannya di kepala berkas**, bukan cuma perintahnya: apa yang
      rusak, kenapa cara ini yang dipilih, apa yang akan terjadi kalau
      dilewati. Migrasi di repo ini dibaca ulang berbulan-bulan kemudian oleh
      orang yang tidak ikut kejadiannya.
- [ ] **`CREATE INDEX` selalu PLAIN — tidak pernah `CONCURRENTLY`.** SQL Editor
      membungkus skrip jadi **satu transaksi**, dan `CONCURRENTLY` di dalam
      transaksi **gagal senyap**: tidak ada error, indexnya cuma tidak pernah
      jadi ([../rules.md](../rules.md) §5.3).
- [ ] **`ALTER TYPE … ADD VALUE` harus statement lepas**, tidak boleh berada di
      dalam blok transaksi — dan tidak boleh digabung dengan DDL lain di berkas
      yang sama kalau berkas itu akan dijalankan sekali tekan.
- [ ] **`VACUUM` TIDAK BOLEH ada di berkas migrasi.** Sama sebabnya
      (SQL Editor = satu transaksi), tapi akibatnya berbeda dari
      `CONCURRENTLY`: `VACUUM` gagal **KERAS** dengan
      `ERROR 25001: VACUUM cannot run inside a transaction block`, dan karena
      satu transaksi, **seluruh migrasi ikut ter-rollback** — termasuk DDL yang
      sudah benar di atasnya. Kejadian 2026-08-10 di
      `20260810_01_idx_aset_rekap_covering.sql`.

      Yang sering dikira sama padahal beda:

      | Perintah | Di dalam transaksi? | Boleh di berkas migrasi? |
      |---|---|---|
      | `ANALYZE` | ✅ boleh | ✅ ya |
      | `VACUUM` / `VACUUM ANALYZE` | ❌ tidak | ❌ **tidak** — jalankan lepas |
      | `CREATE INDEX CONCURRENTLY` | ❌ tidak | ❌ tidak (gagal **senyap**) |
      | `ALTER TYPE … ADD VALUE` | ❌ tidak | ❌ tidak |

      Kalau butuh `VACUUM` (mis. supaya index-only scan benar-benar terpakai),
      tulis sebagai **langkah terpisah** di komentar berkasnya, jangan sebagai
      statement.
- [ ] **Predikat partial index disalin PERSIS dari qual di kode.** Beda sedikit
      → planner tak bisa membuktikan implikasinya dan indexnya **diabaikan
      diam-diam**: tak ada error, cuma lambat lagi ([../rules.md](../rules.md)
      §4.2). Tulis di komentar berkasnya konstanta TS mana yang jadi
      kembarannya (mis. `JENIS_DITARIK` di `lib/pengalihan.ts` ↔
      `idx_trx_pindah_id`).
- [ ] **Buat idempoten.** Pagari dengan `IF NOT EXISTS` / `ON CONFLICT` /
      `WHERE kolom IS NULL`, supaya migrasi yang putus di tengah bisa
      dijalankan ulang tanpa memproses baris yang sama dua kali dan tanpa
      membakar nomor urut percuma.
- [ ] **Migrasi destruktif harus defensif.** `DROP TABLE` wajib membatalkan
      diri kalau tabelnya ternyata ada isinya (preseden: `20260713_01`).
- [ ] ⚠️ **Migrasi yang INSERT ke `transaksi_bmd` praktis TIDAK BISA
      di-rollback.** Ledger append-only ditegakkan trigger **termasuk untuk
      `service_role`** ([../rules.md](../rules.md) §1.1), jadi tidak ada
      "hapus lagi kalau salah" — koreksinya harus berupa baris pembalik
      (`batal_*`) yang ikut terbaca semua laporan. Periksa dua kali sebelum
      menjalankan; kalau ragu, jalankan `SELECT`-nya dulu dan baca hasilnya.

---

## 2. Pra-terbang (menit-menit sebelum menekan Run)

- [ ] **Cek sisa disk — SEBELUM, bukan sesudah.** Ini langkah yang dulu tidak
      ada dan harganya seluruh aplikasi mati.

      ```sql
      SELECT pg_size_pretty(pg_database_size(current_database())) AS ukuran_db;
      SELECT pg_size_pretty(pg_total_relation_size('aset'))          AS aset,
             pg_size_pretty(pg_total_relation_size('transaksi_bmd')) AS trx;
      ```

      Bandingkan dengan kuota disk project di dashboard Supabase. **Backfill
      ratusan ribu baris menulis WAL beberapa ratus MB** di luar ukuran
      tabelnya sendiri — kalau sisa disk tidak lapang, hentikan dan bereskan
      dulu. Project yang kehabisan disk masuk mode READ-ONLY, dan di mode itu
      **login pun gagal**.
- [ ] **Migrasi sebelumnya sudah dijalankan semua?** Urutan nama berkas wajib
      utuh — migrasi ini kemungkinan besar mengandalkan objek yang dibuat
      migrasi sebelumnya.
- [ ] **Ada jenis enum baru?** Ingat ini menentukan urutan deploy (bagian 6).
- [ ] **Sedang jam kerja?** Migrasi masif mengunci dan membebani tabel yang
      sama dengan yang dipakai ±700 SKPD. Jalankan saat sepi.

---

## 3. Memilih jalur eksekusi

| Kalau… | Jalankan lewat |
|---|---|
| DDL kecil, seed, fungsi, policy, index di tabel kecil | **Supabase SQL Editor** |
| UPDATE/INSERT **> 100.000 baris**, atau skrip yang perlu `\echo`/`\timing` | **`psql`** |

**Kenapa SQL Editor tidak sanggup untuk yang masif — dua sebab terpisah, dan
dua-duanya batasan editornya, bukan SQL-nya:**

1. Satu UPDATE 418rb baris **melampaui batas waktu gateway API**-nya →
   `Failed to fetch (api.supabase.com)`.
2. Editor itu menentukan mode baca/tulis dari **KATA PERTAMA skrip**. Skrip
   yang diawali `WITH` dibuka sebagai transaksi **READ-ONLY**, dan semua UPDATE
   di dalamnya ditolak `25006: cannot execute UPDATE in a read-only
   transaction` — **di mana pun UPDATE-nya diletakkan**.

```bash
psql "<connection-string>" -f supabase/migrations/<berkas>.sql
```

Untuk skrip masif, buka berkasnya dengan:

```sql
SET statement_timeout = 0;   -- batas waktu bawaan role Supabase akan memotong
                             -- backfill besar di tengah jalan tanpa ini
\timing on
```

---

## 4. Saat menjalankan

- [ ] **Jalankan satu berkas sampai selesai**, jangan menyalin sepotong-sepotong
      ke SQL Editor — urutan langkah di dalam berkas biasanya tidak boleh
      ditukar (contoh `20260729_04`: backfill → seed counter → index UNIQUE →
      **trigger paling akhir**; trigger yang dipasang duluan akan terpicu
      ratusan ribu kali).
- [ ] **Baca keluarannya, jangan cuma melihat "Success".** `CREATE INDEX
      CONCURRENTLY` yang gagal dan `UPDATE 0` sama-sama tidak berteriak.
- [ ] **Kalau putus di tengah: jangan panik, jalankan ulang** — kalau langkah 1
      dikerjakan, migrasinya idempoten. Kalau ternyata tidak idempoten, itu
      temuan: perbaiki berkasnya dulu, baru ulangi.
- [ ] **Gagal dengan "could not create unique index" = ada nilai dobel.
      JANGAN dipaksa.** Constraint UNIQUE itu jaring pengaman terakhir — waktu
      generator NIBAR diam-diam mengulang nomor dari 1, hanya itu yang
      menyelamatkan. Cari dulu penyebabnya.

---

## 5. Verifikasi — sebelum menyatakan selesai

- [ ] **Tutup migrasi import/backfill dengan `ANALYZE` tabel yang diisi.**
      Wajib, bukan pemanis ([../rules.md](../rules.md) §4.4): import besar
      mengubah distribusi data, dan rencana query yang tadinya sehat bisa
      berbalik jadi full scan **tanpa satu baris kode pun berubah**. Gejalanya
      "halaman yang kemarin cepat, hari ini timeout".

      ```sql
      ANALYZE aset;
      -- cek kapan terakhir dianalisis
      SELECT relname, n_live_tup, last_analyze, last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname IN ('aset','transaksi_bmd','aset_awal_2026','penyusutan_semester');
      ```

- [ ] **Jalankan query verifikasi yang menghitung, bukan yang menyenangkan.**
      Pola yang dipakai `20260729_04`: satu `SELECT` yang mengembalikan jumlah
      baris yang **seharusnya nol** (dobel, yatim, tanpa kode) berdampingan
      dengan jumlah yang seharusnya banyak.
- [ ] **`EXPLAIN` WAJIB dengan RLS aktif.** Sebagai `service_role`/superuser,
      query yang rusak **tetap terlihat 0,2 detik** — verifikasi tanpa RLS
      pernah meloloskan perbaikan (`20260728_05`) yang sebenarnya belum
      menyelesaikan apa pun ([../rules.md](../rules.md) §4.3).

      ```sql
      BEGIN;
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims = '{"sub":"<UUID-user>","role":"authenticated"}';
      EXPLAIN ANALYZE <query yang diperbaiki>;
      ROLLBACK;
      ```

      Yang dicari: nama partial index-nya **muncul**, dan `Seq Scan` **tidak**.
- [ ] **Sesudah import besar: uji ulang halaman berat sebagai pengurus barang
      SKPD TERBESAR, bukan sebagai admin** ([../rules.md](../rules.md) §4.5).
      Import massal **membangunkan lagi timeout yang sudah "beres"** — persis
      itu yang terjadi tiga kali berturut-turut. Halaman yang wajib dibuka
      ulang: Daftar Barang, Penyusutan, Rekonsiliasi BMD, dan halaman
      bergolongan tunggal (GIS Tanah, Kendaraan).

---

## 6. Deploy kode — SESUDAH migrasi, tidak pernah sebaliknya

- [ ] **Migrasi dijalankan lebih dulu, baru kode di-deploy**
      ([../rules.md](../rules.md) §5.4). Dua alasan yang berbeda, dan
      dua-duanya nyata:
      - **Enum**: kode yang sudah memfilter `.in('jenis', [...])` dengan nilai
        enum baru akan **error** kalau nilainya belum ada — halamannya rusak,
        bukan cuma fiturnya belum jalan.
      - **Guard/policy**: kalau kode duluan, ada **jendela waktu** di mana
        wewenangnya sudah longgar tapi penjaganya belum terpasang
        (preseden `20260727_01`: picker SKPD dibuka sebelum guard self-approve
        ada → menyetujui kartu sendiri benar-benar mungkin).
      - **Kolom baru yang ikut di daftar `.select()`**: PostgREST menolak
        **SELURUH query**, bukan cuma kolom yang hilang — jadi satu kolom yang
        belum ada di query paling hulu mematikan seluruh modul, bukan cuma
        fiturnya (preseden `20260813_02`/INS-25: `nihil` ikut di query header
        RKBMD → Usulan, Validasi, Pelaporan, & cetak mati serentak dengan
        `column rkbmd.nihil does not exist`). **Ini kelas yang paling gampang
        diremehkan**, karena "cuma nambah kolom" terdengar seperti perubahan
        yang tak bisa merusak apa-apa.
- [ ] **Migrasi yang menambah policy `UPDATE`/`INSERT` juga masuk kategori
      ini** — tanpa policy-nya, tombol Simpan gagal **senyap** (RLS menolak, 0
      baris ter-update, tak ada pesan).
- [ ] Urutan per fitur ada di [../CLAUDE.md](../CLAUDE.md) — cari kata
      **"Deploy-ordering"**.

---

## 7. Sesudahnya

- [ ] **Commit berkas migrasinya** — `git add` sebut berkas satu per satu
      ([../rules.md](../rules.md) §7.2). `supabase/migrations/` selalu punya
      untracked milik orang lain.
- [ ] **Kalau ada kembaran di kode** (predikat index ↔ konstanta TS), sebutkan
      keduanya di pesan commit, dan pastikan `lib/sinkronisasi.test.ts` masih
      hijau — test itu ada khusus supaya kembaran yang menyimpang jadi test
      merah, bukan timeout di produksi.
- [ ] **Kalau migrasinya ternyata salah:** koreksinya adalah **migrasi
      berikutnya**, bukan menyunting berkas yang sudah dijalankan. Preseden:
      `20260704_19_revert_hapus_ledger.sql`. Berkas yang sudah dieksekusi di
      produksi tidak pernah diubah — kalau diubah, riwayat berkas berhenti
      menggambarkan keadaan database.
