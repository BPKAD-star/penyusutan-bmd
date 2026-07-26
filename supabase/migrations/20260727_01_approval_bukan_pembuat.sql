-- ============================================================================
-- PEMISAHAN TUGAS: Pengurus Barang TIDAK boleh menyetujui kartu Cara Perolehan
-- yang DIA SENDIRI buat (2026-07-27, keputusan user).
--
-- LATAR: picker SKPD di menu entry (components/SkpdCombobox.tsx, prop
-- lockToOperator) dulu TERKUNCI MATI ke node SKPD user. Sejak hari ini picker
-- itu dibuka ke seluruh subtree — operator boleh mencatat barang atas nama
-- sub-OPD, bukan selalu SKPD induk (permintaan user: pengurus barang yang
-- membawahi banyak sub-OPD perlu memilih sub-OPD mana).
--
-- CELAH YANG DITUTUP MIGRASI INI: fn_is_pengurus_barang_atas (20260713_04)
-- sengaja STRICT (`s.id <> my.id`) — Pengurus Barang boleh approve jurnal Cara
-- Perolehan sub-OPD DI BAWAHNYA, tapi jurnal node SENDIRI tetap wewenang admin
-- pemda. Itu kontrol dua-orang. Begitu picker dibuka, kontrol itu bocor: bikin
-- kartu Pengadaan atas nama "SDN 1 Ngasem" → fn_is_pengurus_barang_atas TRUE →
-- setujui sendiri → aset + ledger termaterialisasi tanpa admin sama sekali.
-- Sebelum picker dibuka, celah ini tidak terjangkau lewat UI.
--
-- ATURAN BARU: kelonggaran "Pengurus Barang atasan" TIDAK berlaku kalau kartunya
-- dia sendiri yang membuat (`created_by = auth.uid()`). Kolom `created_by` sudah
-- ada sejak 20260704_07 (DEFAULT auth.uid()), tidak perlu kolom baru.
--
-- YANG TIDAK BERUBAH:
--   - Admin pemda (fn_is_admin) tetap bebas, termasuk atas kartu buatannya
--     sendiri — itu peran super-admin, di luar cakupan pemisahan tugas ini.
--   - Alur sah yang sudah jalan TIDAK terganggu: pengurus pembantu sub-OPD
--     bikin kartu → pengurus barang atasannya menyetujui (pembuat ≠ penyetuju).
--   - Klausa mutasi_internal / pengalihan_status (persetujuan oleh SKPD tujuan)
--     TIDAK disentuh. Di jalur itu self-approve memang sudah mungkin sejak dulu
--     (daftar tujuan mutasi internal se-subtree, lihat PengeluaranInternal.tsx
--     ~baris 413) — pre-existing, bukan akibat pembukaan picker, dan perlu
--     keputusan tersendiri kalau mau diperketat.
--   - `created_by IS NULL` (baris warisan / dibuat service role) tetap boleh
--     disetujui: IS DISTINCT FROM memperlakukan NULL sbg "bukan saya".
--     Sengaja permisif supaya data lama tidak mendadak terkunci.
--
-- Reversible: body sebelumnya persis ada di 20260713_04_role_tiga_tingkat.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_jurnal_header_approval_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- (1) BARU: pemisahan tugas. Dicek DULUAN supaya pesannya spesifik — kalau
  -- digabung jadi satu klausa raksasa di bawah, user cuma dapat pesan generik
  -- "hanya admin/atasan/tujuan" dan bingung kenapa ditolak padahal dia atasan.
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT fn_is_admin()
     AND OLD.kategori IN ('pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'konstruksi')
     AND fn_is_pengurus_barang_atas(OLD.skpd_id)
     AND OLD.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Kartu ini Anda sendiri yang membuat. Persetujuan Cara Perolehan harus oleh orang lain (admin pemda) — pemisahan tugas.';
  END IF;

  -- (2) Cek lama, TIDAK BERUBAH (body dari 20260713_04). Kalau sampai sini,
  -- pemohon bukan pembuat kartu — kelonggaran atasan berlaku spt semula.
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND NOT fn_is_admin()
     AND NOT (OLD.kategori IN ('pengalihan_status', 'mutasi_internal') AND fn_skpd_visible(OLD.skpd_tujuan))
     AND NOT (OLD.kategori IN ('pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya', 'konstruksi')
              AND fn_is_pengurus_barang_atas(OLD.skpd_id)) THEN
    RAISE EXCEPTION 'Hanya admin, Pengurus Barang atasan sub-OPD ini (Cara Perolehan), atau SKPD tujuan (mutasi/pengalihan) yang boleh mengubah status persetujuan.';
  END IF;

  RETURN NEW;
END $$;

-- Verifikasi (aman, ROLLBACK) — sbg pengurus_barang yg punya sub-OPD:
--   BEGIN;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', '<uuid-pengurus-barang>', 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   -- kartu sub-OPD buatan ORANG LAIN → harus LOLOS:
--   UPDATE jurnal_header SET approval_status = 'disetujui'
--    WHERE kategori = 'pengadaan' AND approval_status = 'pending'
--      AND created_by <> auth.uid() AND fn_is_pengurus_barang_atas(skpd_id);
--   -- kartu sub-OPD buatan SENDIRI → harus DITOLAK dgn pesan pemisahan tugas:
--   UPDATE jurnal_header SET approval_status = 'disetujui'
--    WHERE kategori = 'pengadaan' AND approval_status = 'pending'
--      AND created_by = auth.uid() AND fn_is_pengurus_barang_atas(skpd_id);
--   ROLLBACK;
