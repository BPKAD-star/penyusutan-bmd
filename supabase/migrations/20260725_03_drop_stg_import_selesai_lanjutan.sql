-- ============================================================================
-- Drop tabel staging import yang tugasnya SUDAH SELESAI (lanjutan 20260713_03).
-- Reclaim ruang DB (~108 MB) + tutup celah RLS (tabel staging dibuat TANPA RLS →
-- kebaca REST API semua user login).
--
-- Target (ukuran per 2026-07-25):
--   stg_import_peralatan_mesin        56 MB   (materialisasi 20260716_03)
--   stg_import_atl_diknas             44 MB   (impor ad-hoc — TANPA jejak migrasi)
--   stg_import_atl                     5,5 MB (materialisasi 20260716_01)
--   stg_import_aset_lain_lain_diknas   2,4 MB (materialisasi 20260719_02)
--   stg_import_aset_lain_lain          0,7 MB (materialisasi 20260718_02)
--
-- GUARD (pola 20260713_03, all-or-nothing):
--   * Tabel yang sudah tidak ada → dilewati (idempotent / re-runnable).
--   * Tabel TANPA kolom `nibar` (mis. struktur staging tak lazim) → DILEWATI +
--     NOTICE, TIDAK di-drop otomatis (perlu tinjau manual — jangan hapus yang
--     tak bisa diverifikasi). stg_import_atl_diknas tak berjejak migrasi, jadi
--     penjagaan ini penting.
--   * Tabel dgn kolom `nibar`: hitung baris yg nibar-nya BELUM ada di `aset`.
--     Kalau > 0 (impor belum tuntas) → RAISE EXCEPTION → SELURUH migrasi batal,
--     tidak ada yang ke-drop. Kalau 0 → aman di-drop.
--
-- Sumber asli tetap tersimpan sbg CSV/XLSX di repo lokal — tak ada yang hilang.
-- Jalankan di Supabase SQL Editor project BMD utama.
-- ============================================================================

DO $$
DECLARE
  t          text;
  has_nibar  boolean;
  n          bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stg_import_peralatan_mesin',
    'stg_import_atl_diknas',
    'stg_import_atl',
    'stg_import_aset_lain_lain_diknas',
    'stg_import_aset_lain_lain'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% sudah tidak ada — dilewati.', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'nibar'
    ) INTO has_nibar;

    IF NOT has_nibar THEN
      RAISE NOTICE '% TIDAK punya kolom nibar — dilewati (tinjau & drop manual bila yakin selesai).', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I s WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)', t
    ) INTO n;

    IF n > 0 THEN
      RAISE EXCEPTION
        '% masih punya % baris yang nibar-nya BELUM ada di aset — impor belum tuntas, drop dibatalkan seluruhnya.',
        t, n;
    END IF;

    EXECUTE format('DROP TABLE %I', t);
    RAISE NOTICE '% di-drop (semua nibar terverifikasi sudah ada di aset).', t;
  END LOOP;
END $$;

-- Verifikasi (semua harus NULL kalau ke-drop):
--   SELECT to_regclass('public.stg_import_peralatan_mesin'),
--          to_regclass('public.stg_import_atl_diknas'),
--          to_regclass('public.stg_import_atl'),
--          to_regclass('public.stg_import_aset_lain_lain_diknas'),
--          to_regclass('public.stg_import_aset_lain_lain');
--
-- Catatan: DROP TABLE mengembalikan ruang, tapi angka "Database size" di
-- dashboard bisa telat turun. Kalau perlu paksa: VACUUM (FULL) — hati-hati,
-- mengunci tabel & butuh ruang sementara; untuk staging yg sudah didrop tak perlu.
