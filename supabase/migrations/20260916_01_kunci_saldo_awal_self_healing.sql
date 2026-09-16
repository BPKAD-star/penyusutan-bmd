-- ============================================================================
-- KUNCI "Daftar Barang Awal" JADI SELF-HEALING — pembatalan membuka kuncinya
-- lagi. Keputusan user 2026-09-16.
--
-- ── Gejalanya ──────────────────────────────────────────────────────────────
-- User menguji Koreksi Spesifikasi di 2 Tanah Dinas Perhubungan, lalu
-- MEMBATALKANNYA (`batal_koreksi_spesifikasi` id 600729 & 600730). Nilai
-- lamanya benar-benar pulih — `aset.nama_barang` balik ke "Intrakomptabel",
-- `penggunaan_pengamanan` balik NULL — jadi barangnya sudah persis seperti
-- sebelum dikoreksi. Tapi di Saldo Awal → Daftar Barang Awal keduanya TETAP
-- 🔒 terkunci, dan akan terkunci SELAMANYA.
--
-- ── Sebabnya: aturan lamanya "PERNAH KENA", bukan "SEDANG KENA" ────────────
-- `fn_aset_awal_2026_terkunci` cuma bertanya "adakah baris ledger ber-jenis
-- ini untuk aset tsb?" atas 22 jenis. Karena ledger APPEND-ONLY, baris aslinya
-- tak akan pernah hilang — jadi sekali tersentuh, terkunci selamanya. Lebih
-- jauh: `batal_*`-nya sendiri ikut didaftarkan sebagai jenis yang mengunci,
-- sehingga MEMBATALKAN justru menambah satu alasan kunci lagi. Pembatalan
-- bentuk apa pun (batal penghapusan, batal reklas, batal pengalihan, batal
-- mutasi internal, batal pencatatan ganda) bernasib sama.
--
-- Itu jauh lebih lebar dari bahaya yang sebenarnya hendak ditutup. Dua bahaya
-- yang tercatat di CLAUDE.md waktu pintu ini dibuat (2026-07-28):
--   (a) UPDATE senyap dari Saldo Awal menimpa nilai yang di-set
--       `koreksi_spesifikasi` → tombol Batal-nya nanti me-restore ke
--       `payload.prev` yang tak nyambung kenyataan;
--   (b) sesudah reklas, kode di snapshot (golongan lama) ≠ di register
--       (golongan baru), padahal template field dipilih dari kode SNAPSHOT →
--       bisa menulis kolom golongan yang salah ke `aset`.
-- Perhatikan: begitu peristiwanya DIBATALKAN, dua-duanya lenyap dengan
-- sendirinya — (a) tak ada lagi tombol Batal yang bisa me-restore prev basi,
-- (b) `batal_reklas` memulihkan `aset.kode` dari `payload.kode_lama` sehingga
-- snapshot & register cocok lagi.
--
-- ── Obatnya: periksa KEADAAN, bukan riwayat jenis ──────────────────────────
-- Tiga dari empat kelompok bahaya ternyata bisa dijawab dgn PERBANDINGAN
-- KEADAAN yang jauh lebih langsung — dan perbandingan keadaan otomatis pulih
-- sendiri begitu peristiwanya dibatalkan, tanpa perlu mendaftar satu pun
-- `batal_*`:
--
--   status  : `aset.status <> 'aktif'`               → barang keluar register
--             (penghapusan, pemecahan_keluar, penggabungan_keluar,
--              kapitalisasi_serap, koreksi_pencatatan_ganda, kdp_selesai_keluar)
--   kode    : `aset.kode    <> aset_awal_2026.kode`  → reklas kode/golongan
--   SKPD    : `aset.skpd_id <> aset_awal_2026.skpd_id` → pengalihan / mutasi internal
--
-- ⚠️ Kelompok KEEMPAT tetap WAJIB melihat ledger, dan ini yang gampang
-- terlewat kalau seseorang kelak "menyederhanakan" fungsi ini lagi:
-- `koreksi_spesifikasi` & `penggabungan_masuk` TIDAK meninggalkan jejak
-- keadaan apa pun — status, kode, & SKPD-nya tak bergeser sedikit pun.
-- Bahayanya bukan ketidakcocokan keadaan, melainkan ADANYA TOMBOL BATAL YANG
-- MASIH HIDUP: `payload.prev` (koreksi) & `payload.spek_prev` (penggabungan)
-- akan me-restore nilai yang sudah terlanjur ditimpa dari Saldo Awal. Jadi
-- yang diperiksa: "adakah baris jenis ini yang BELUM dibatalkan?".
--
-- ⚠️ `pemecahan_masuk`, `penggabungan_masuk` sbg aset BARU, & `kdp_selesai_masuk`
-- lahir dgn NIBAR baru → tak punya baris `aset_awal_2026` sama sekali, jadi
-- fungsi ini (yang di-key by NIBAR snapshot) memang tak pernah menjangkaunya.
-- Itu sebabnya mereka boleh hilang dari daftar tanpa kehilangan penjagaan.
--
-- ── DIUKUR ke produksi sebelum ditulis (bukan diperkirakan) ────────────────
--   snapshot                          : 514.158 baris, 0 yatim (semua punya
--                                       pasangan di `aset` lewat NIBAR)
--   terkunci aturan LAMA              : 138
--   terkunci aturan BARU              : 124
--   kunci BARU yang muncul            : 0   ← tak ada barang yang jadi terkunci
--   jadi TERBUKA                      : 14
-- Keempat-belas yang terbuka disisir satu per satu & SEMUANYA kasus
-- "dibatalkan lalu balik normal": 5 batal_penghapusan · 4 batal_koreksi_
-- spesifikasi (termasuk 2 Tanah Dishub di atas) · 2 batal_koreksi_pencatatan_
-- ganda · 1 batal_pengalihan · 1 batal_kapitalisasi+batal_pengalihan ·
-- 1 kapitalisasi_serap yang kapitalisasinya dibatalkan.
-- Rencana query pada UKURAN PANGGILAN SEBENARNYA — UI meng-slice per 500 NIBAR
-- (`useEditSpekAwal.ts`), bukan per 50: **110,7 ms** (±48 ms di antaranya cuma
-- CTE pembuat sampel yang tak ada di fungsinya). Pagu `authenticated` 8.000 ms.
-- Index: `saldo_awal_2026_pkey` + `aset_nibar_key` + `idx_trx_jenis_id`, dan
-- kedua EXISTS-nya jadi **hashed SubPlan yang dijalankan SEKALI per statement**,
-- bukan per baris — itu yang membuat biayanya ikut jumlah NIBAR yang ditanya,
-- bukan besar ledger.
--
-- ⚠️ FAIL-CLOSED: pencocokan pembatalan memakai perbandingan TEKS
-- (`payload->>'target_trx_id' = t.id::text`), sengaja BUKAN cast ke bigint.
-- Payload yang bentuknya aneh membuat cast MELEDAK (dan menjatuhkan halaman
-- Saldo Awal + trigger sekaligus); dgn perbandingan teks, payload aneh cuma
-- berarti "pembatalannya tak terbaca" → barangnya TETAP TERKUNCI. Arah gagal
-- yang benar untuk sebuah penjaga.
--
-- ⚠️ Kedua fungsi di bawah KEMBAR — ubah satu, ubah dua-duanya. Yang skalar
-- dipakai trigger DB (penegak sesungguhnya), yang `_batch` dipakai UI untuk
-- menampilkan 🔒 & mematikan centang per halaman (50 baris).
--
-- ⚠️ `SECURITY DEFINER` + `STABLE` + `SET search_path` WAJIB ditulis ulang:
-- `CREATE OR REPLACE` menghapus setelan `ALTER FUNCTION … SET`. Diperiksa ke
-- `pg_get_functiondef` sebelum diganti — ketiga fungsi ini tak punya setelan
-- lain selain `search_path` (tak ada `work_mem` dsb).
-- ⚠️ `fn_aset_awal_2026_spek_only` SENGAJA tetap INVOKER (tanpa SECURITY
-- DEFINER) — di dalam DEFINER `current_user` berubah jadi pemilik fungsi &
-- pengecualian `current_user <> 'authenticated'` jadi salah baca.
--
-- ⚠️ Deploy-ordering: BEBAS & tak ada perubahan kode sama sekali. Tanda tangan
-- kedua fungsi TIDAK berubah (`boolean` & `RETURNS TABLE(nibar text)`), jadi
-- klien yang sekarang ter-deploy langsung ikut benar begitu migrasi ini jalan.
-- ============================================================================

-- ── 1. Penjaga per-barang (dipakai trigger) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_terkunci(p_nibar text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Membaca `aset_awal_2026` lagi walau dipanggil dari trigger-nya sendiri:
  -- aman, karena `kode` & `skpd_id` di snapshot TAK BISA diubah dari aplikasi
  -- (dijegal daftar kolom di fn_aset_awal_2026_spek_only + GRANT per-kolom),
  -- jadi OLD == NEW untuk dua kolom yang dibandingkan di sini.
  SELECT EXISTS (
    SELECT 1
    FROM aset_awal_2026 s
    JOIN aset a ON a.nibar = s.nibar
    WHERE s.nibar = p_nibar
      AND (
           a.status  <> 'aktif'
        OR a.kode    IS DISTINCT FROM s.kode
        OR a.skpd_id IS DISTINCT FROM s.skpd_id
        OR EXISTS (
             SELECT 1 FROM transaksi_bmd t
             WHERE t.aset_id = a.id
               AND t.jenis = 'koreksi_spesifikasi'
               AND NOT EXISTS (
                 SELECT 1 FROM transaksi_bmd b
                 WHERE b.jenis = 'batal_koreksi_spesifikasi'
                   AND b.payload->>'target_trx_id' = t.id::text))
        OR EXISTS (
             SELECT 1 FROM transaksi_bmd t
             WHERE t.aset_id = a.id
               AND t.jenis = 'penggabungan_masuk'
               AND NOT EXISTS (
                 SELECT 1 FROM transaksi_bmd b
                 WHERE b.jenis = 'batal_penggabungan_masuk'
                   AND b.payload->>'target_trx_id' = t.id::text))
      )
  )
$function$;

-- ── 2. Versi batch (dipakai UI per halaman) ────────────────────────────────
-- Tanpa DISTINCT: `s.nibar` PK snapshot & `a.nibar` UNIQUE di register, jadi
-- join-nya 1:1. Versi lama butuh DISTINCT karena ikut men-join transaksi_bmd
-- yang melipatgandakan baris.
CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_terkunci_batch(p_nibars text[])
 RETURNS TABLE(nibar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.nibar
  FROM aset_awal_2026 s
  JOIN aset a ON a.nibar = s.nibar
  WHERE s.nibar = ANY(p_nibars)
    AND (
         a.status  <> 'aktif'
      OR a.kode    IS DISTINCT FROM s.kode
      OR a.skpd_id IS DISTINCT FROM s.skpd_id
      OR EXISTS (
           SELECT 1 FROM transaksi_bmd t
           WHERE t.aset_id = a.id
             AND t.jenis = 'koreksi_spesifikasi'
             AND NOT EXISTS (
               SELECT 1 FROM transaksi_bmd b
               WHERE b.jenis = 'batal_koreksi_spesifikasi'
                 AND b.payload->>'target_trx_id' = t.id::text))
      OR EXISTS (
           SELECT 1 FROM transaksi_bmd t
           WHERE t.aset_id = a.id
             AND t.jenis = 'penggabungan_masuk'
             AND NOT EXISTS (
               SELECT 1 FROM transaksi_bmd b
               WHERE b.jenis = 'batal_penggabungan_masuk'
                 AND b.payload->>'target_trx_id' = t.id::text))
    )
$function$;

-- ── 3. Pesan trigger: sebut bahwa kuncinya bisa terbuka lagi ───────────────
-- Pesan lama berbunyi "sudah bergerak di periode berjalan … Koreksi lewat
-- Pembukuan > Koreksi" — benar, tapi terbaca PERMANEN, dan itulah yang bikin
-- operator mengira barangnya terkunci selamanya. Badan fungsinya SAMA PERSIS
-- selain kalimat itu (daftar kolom beku tidak disentuh sama sekali).
CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_spek_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.nibar                    IS DISTINCT FROM OLD.nibar
  OR NEW.kode                     IS DISTINCT FROM OLD.kode
  OR NEW.skpd_id                  IS DISTINCT FROM OLD.skpd_id
  OR NEW.intra_ekstra             IS DISTINCT FROM OLD.intra_ekstra
  OR NEW.tgl_perolehan            IS DISTINCT FROM OLD.tgl_perolehan
  OR NEW.jumlah                   IS DISTINCT FROM OLD.jumlah
  OR NEW.harga_satuan             IS DISTINCT FROM OLD.harga_satuan
  OR NEW.nilai_perolehan          IS DISTINCT FROM OLD.nilai_perolehan
  OR NEW.akumulasi_2025           IS DISTINCT FROM OLD.akumulasi_2025
  OR NEW.nilai_buku_awal          IS DISTINCT FROM OLD.nilai_buku_awal
  OR NEW.sisa_masa_manfaat_smt    IS DISTINCT FROM OLD.sisa_masa_manfaat_smt
  OR NEW.masa_manfaat_smt         IS DISTINCT FROM OLD.masa_manfaat_smt
  OR NEW.beban_penyusutan_per_smt IS DISTINCT FROM OLD.beban_penyusutan_per_smt
  THEN
    RAISE EXCEPTION 'Saldo Awal 2026 beku: dari aplikasi hanya field SPESIFIKASI yang boleh dikoreksi. Angka penyusutan, kode barang, SKPD & tanggal perolehan tidak bisa diubah di sini.';
  END IF;
  -- Barang yang SEDANG bergerak: keluar dari register (dihapus/dipecah/
  -- digabung/diserap induk/duplikat), pindah golongan, pindah SKPD, atau masih
  -- punya koreksi spesifikasi yang belum dibatalkan. Kuncinya TERBUKA SENDIRI
  -- begitu peristiwanya dibatalkan — tak ada yang perlu dijalankan manual.
  IF fn_aset_awal_2026_terkunci(NEW.nibar) THEN
    RAISE EXCEPTION 'Barang % sedang bergerak (pindah SKPD/golongan, dihapus, dipecah, digabung, atau punya koreksi spesifikasi yang masih berlaku). Koreksi lewat Pembukuan > Koreksi. Kalau transaksinya dibatalkan, barang ini otomatis bisa diedit lagi dari Saldo Awal.', NEW.nibar;
  END IF;
  RETURN NEW;
END $function$;
