-- ============================================================================
-- Saldo Awal → Daftar Barang Awal: izinkan KOREKSI SPESIFIKASI langsung dari
-- halaman itu (nama barang, merek/tipe, no. rangka/mesin, dokumen kepemilikan,
-- lokasi, foto, dst). Permintaan user 2026-07-28: baseline hasil impor e-BMD
-- 2025 banyak yang nama/spesifikasinya kosong atau salah ketik, dan sekarang
-- satu-satunya cara membetulkan adalah lewat menu Koreksi (ber-No SK) yang
-- itupun cuma menyentuh register `aset`, bukan snapshot ini.
--
-- ANGKA TETAP BEKU — TIDAK BOLEH DIUBAH DARI APLIKASI.
-- `aset_awal_2026` = foto saldo akhir 2025 (lihat CLAUDE.md "Baseline beku").
-- Yang dibuka HANYA kolom deskriptif. Kolom identitas & angka penyusutan
-- (nilai_perolehan, akumulasi_2025, nilai_buku_awal, sisa/masa_manfaat_smt,
-- beban_penyusutan_per_smt, jumlah, harga_satuan, kode, skpd_id, intra_ekstra,
-- tgl_perolehan, nibar) dikunci DUA lapis: GRANT per-kolom + trigger.
--
-- Kenapa aman: `aset_awal_2026` TIDAK dibaca engine penyusutan sama sekali
-- (engine replay dari ledger `saldo_awal`/`saldo_awal_checkpoint` di
-- transaksi_bmd), dan cuma dipakai 2 halaman menu Saldo Awal. Jadi mengubah
-- kolom deskriptif di sini nol efek ke perhitungan & laporan BMD.
--
-- Sisi kode menulis ke DUA tabel sekaligus (keputusan user 2026-07-28):
-- snapshot ini + kolom yang sama di `aset` (dicocokkan NIBAR), keduanya UPDATE
-- biasa tanpa event ledger — alasannya sama dengan KIR: spesifikasi barang itu
-- data deskriptif/administratif, bukan peristiwa akuntansi (tak mengubah nilai,
-- penyusutan, kepemilikan SKPD, maupun visibilitas). Konsekuensi yang
-- DITERIMA: koreksi lewat pintu ini TIDAK punya jejak ledger dan TIDAK bisa
-- di-Batal seperti `koreksi_spesifikasi`. Kalau butuh jejak audit + tombol
-- batal, pakai menu Pembukuan → Koreksi → Spesifikasi Barang seperti biasa.
-- ============================================================================

-- ── 1. Policy UPDATE (tabel ini sebelumnya SELECT-only, lihat 20260711_02) ──
-- Pola sama persis dgn policy `aset_update`: admin pemda, atau pengurus barang
-- di subtree SKPD-nya. Pengawas (role viewer) otomatis tertolak karena
-- fn_skpd_visible() mengembalikan false untuknya (migrasi 20260714_04) — policy
-- `*_viewer_select` yang permisif itu SELECT saja, tidak menyentuh UPDATE.
-- fn_is_admin() dibungkus InitPlan (SELECT ...) sesuai aturan performa RLS.
DROP POLICY IF EXISTS "sa_update" ON aset_awal_2026;
CREATE POLICY "sa_update" ON aset_awal_2026 FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));

-- ── 2. Lapis pertama: GRANT per-kolom ───────────────────────────────────────
-- RLS tidak bisa membatasi KOLOM, cuma baris. Jadi hak UPDATE dicabut dulu
-- (aman: sampai hari ini tidak ada satu pun kode aplikasi yang meng-UPDATE
-- tabel ini), lalu diberikan ulang HANYA untuk kolom spesifikasi. Kolom di luar
-- daftar ini ditolak Postgres di level privilege, sebelum RLS & trigger jalan.
-- `service_role` & `postgres` punya grant sendiri — tidak terpengaruh REVOKE
-- ini, jadi impor/perbaikan baseline lewat service-role atau SQL Editor tetap
-- bisa menyentuh kolom angka seperti sebelumnya.
REVOKE UPDATE ON aset_awal_2026 FROM authenticated;
REVOKE UPDATE ON aset_awal_2026 FROM anon;
GRANT UPDATE (
  nama_barang, spesifikasi_lainnya, merek_tipe,
  satuan, asal_usul, tahun_pengadaan, kondisi_barang,
  penggunaan_pengamanan, keterangan,
  no_polisi, no_bpkb, no_rangka, no_mesin,
  jenis_hak, luas,
  nomor_dokumen_kepemilikan, nama_dokumen_kepemilikan, tanggal_dokumen_kepemilikan,
  wilayah_kode, alamat_detail, latitude, longitude,
  foto_paths
) ON aset_awal_2026 TO authenticated;

-- ── 3. Barang yang SUDAH BERGERAK dikunci dari pintu ini ────────────────────
-- Keputusan user 2026-07-28. Begitu sebuah aset pernah kena transaksi yang
-- menyentuh SPESIFIKASI, GOLONGAN, atau KEPEMILIKAN SKPD, koreksinya WAJIB
-- lewat Pembukuan → Koreksi → Spesifikasi Barang, bukan dari Saldo Awal. Ini
-- menutup dua kerusakan nyata, bukan sekadar kehati-hatian:
--
--   (1) `koreksi_spesifikasi` menyimpan nilai LAMA di `payload.prev` supaya
--       koreksinya bisa dibatalkan. UPDATE senyap dari Saldo Awal bikin tombol
--       Batal itu me-restore ke `prev` yang sudah tidak nyambung kenyataan.
--   (2) `reklas_kode`/`reklas_golongan` bikin kode di snapshot (golongan lama)
--       beda dgn di register (golongan baru). Sisi kode memilih field template
--       dari kode SNAPSHOT → bisa menulis kolom golongan yang salah ke `aset`
--       (mis. no_rangka ke baris yang sekarang Aset Tetap Lainnya).
--   (3) `pengalihan_status`/`mutasi_internal`: wewenang barang sudah pindah
--       SKPD. Snapshot masih memegang skpd_id 2025 → SKPD lama bisa melihat
--       barisnya, tapi UPDATE ke `aset` ditolak RLS SKPD baru.
--
-- SENGAJA TIDAK mengunci: `saldo_awal`/`saldo_awal_checkpoint` (baris baseline
-- sintetis dari migrasi 20260702_03 — ADA DI SETIAP aset, kalau ikut dihitung
-- fiturnya mati total di hari pertama), serta event yang tidak menyentuh kolom
-- spesifikasi sama sekali: pemanfaatan/pengamanan (kustodi), koreksi_nilai/
-- kapitalisasi/akumulasi_kdp (murni angka), reklas_komptabel (keranjang
-- laporan). Kalau nanti ada jenis baru yang mengubah kolom spesifikasi,
-- golongan, atau skpd_id aset — TAMBAHKAN ke daftar di bawah.
--
-- SECURITY DEFINER: kalau dievaluasi sbg pemanggil, RLS bisa menyembunyikan
-- justru baris ledger yang jadi alasan penguncian (aset yang sudah pindah SKPD)
-- → guard-nya bocor. Dipisah dari fungsi trigger, BUKAN dijadikan satu, karena
-- di dalam SECURITY DEFINER `current_user` berubah jadi pemilik fungsi dan
-- pengecualian `current_user <> 'authenticated'` di trigger jadi salah baca.
CREATE OR REPLACE FUNCTION fn_aset_awal_2026_terkunci(p_nibar text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM transaksi_bmd t
    JOIN aset a ON a.id = t.aset_id
    WHERE a.nibar = p_nibar
      AND t.jenis IN ('koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
                      'reklas_kode', 'reklas_golongan',
                      'pengalihan_status', 'mutasi_internal')
  )
$$;

-- Versi borongan utk UI: dari sekumpulan NIBAR, kembalikan yang TERKUNCI saja.
-- Halaman Daftar Barang Awal memanggilnya sekali per halaman (50 baris) untuk
-- mematikan centang + menampilkan 🔒, biar operator tak klik lalu kena error.
CREATE OR REPLACE FUNCTION fn_aset_awal_2026_terkunci_batch(p_nibars text[])
RETURNS TABLE (nibar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT a.nibar
  FROM aset a
  JOIN transaksi_bmd t ON t.aset_id = a.id
  WHERE a.nibar = ANY(p_nibars)
    AND t.jenis IN ('koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
                    'reklas_kode', 'reklas_golongan',
                    'pengalihan_status', 'mutasi_internal')
$$;

REVOKE ALL ON FUNCTION fn_aset_awal_2026_terkunci(text) FROM public;
REVOKE ALL ON FUNCTION fn_aset_awal_2026_terkunci_batch(text[]) FROM public;
GRANT EXECUTE ON FUNCTION fn_aset_awal_2026_terkunci(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_aset_awal_2026_terkunci_batch(text[]) TO authenticated;

-- ── 4. Lapis kedua: trigger penjaga ─────────────────────────────────────────
-- Redundan terhadap GRANT di atas, TAPI sengaja: kalau suatu saat ada yang
-- menjalankan `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`
-- (Supabase kadang begitu saat setup ulang), lapis pertama hilang diam-diam.
-- Trigger ini tidak bisa hilang tanpa DROP eksplisit.
--
-- HANYA berlaku untuk jalur aplikasi (PostgREST SET ROLE authenticated).
-- Dilewati untuk `postgres` (SQL Editor / migrasi) & `service_role` (skrip
-- impor baseline) — pemilik data tetap boleh membetulkan angka baseline lewat
-- jalur administratif, persis seperti sebelum migrasi ini.
CREATE OR REPLACE FUNCTION fn_aset_awal_2026_spek_only() RETURNS trigger
LANGUAGE plpgsql AS $$
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
  -- Barang yang sudah bergerak (lihat bagian 3) → koreksi wajib lewat menu
  -- Koreksi supaya ada jejak ledger & rantai payload.prev-nya tidak rusak.
  IF fn_aset_awal_2026_terkunci(NEW.nibar) THEN
    RAISE EXCEPTION 'Barang % sudah punya transaksi yang mengubah spesifikasi, golongan, atau SKPD-nya. Koreksi spesifikasinya lewat Pembukuan > Koreksi > Spesifikasi Barang, bukan dari Saldo Awal.', NEW.nibar;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aset_awal_2026_spek_only ON aset_awal_2026;
CREATE TRIGGER trg_aset_awal_2026_spek_only
  BEFORE UPDATE ON aset_awal_2026
  FOR EACH ROW EXECUTE FUNCTION fn_aset_awal_2026_spek_only();

-- Verifikasi (jalankan sbg role authenticated lewat aplikasi, bukan SQL Editor —
-- di SQL Editor kamu jadi `postgres`, trigger sengaja dilewati):
--   UPDATE aset_awal_2026 SET merek_tipe = 'X' WHERE nibar = '<nibar bersih milik SKPD sendiri>';  -- HARUS berhasil
--   UPDATE aset_awal_2026 SET nilai_perolehan = 1 WHERE nibar = '<nibar yg sama>';                 -- HARUS ditolak (beku)
--   UPDATE aset_awal_2026 SET merek_tipe = 'X' WHERE nibar = '<nibar yg pernah direklas/dipindah>';-- HARUS ditolak (terkunci)
--
-- Berapa banyak barang yang terkunci (boleh dijalankan di SQL Editor):
--   SELECT count(*) FROM aset_awal_2026 s WHERE fn_aset_awal_2026_terkunci(s.nibar);
