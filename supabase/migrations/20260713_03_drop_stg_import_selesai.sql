-- ============================================================================
-- Drop 3 tabel staging import yang tugasnya SUDAH SELESAI (2026-07-13):
--   stg_import_tanah         (migrasi 20260710_11 — Tanah, 2.732 baris)
--   stg_import_gedung        (migrasi 20260710_18 — Gedung/Bangunan, 6.518 baris)
--   stg_import_jalan_irigasi (migrasi 20260713_02 — Jalan/Irigasi/Jaringan, 8.127 baris)
--
-- ALASAN (temuan audit 2026-07-13): ketiganya dibuat TANPA RLS — di Supabase,
-- tabel schema public tanpa RLS bisa dibaca/ditulis SEMUA user login lewat
-- REST API (grant default anon/authenticated), padahal isinya data aset
-- lengkap se-pemda. Datanya sendiri sudah selesai dimaterialisasi ke
-- aset + transaksi_bmd (+ aset_awal_2026), diverifikasi 0-orphan saat
-- masing-masing import dijalankan. Sumber asli tetap tersimpan sbg file
-- CSV/XLSX di repo lokal — tidak ada informasi yang hilang.
--
-- DEFENSIF (pola sama dgn 20260713_01_drop_proyek_konstruksi_retired.sql):
-- tiap tabel dicek dulu — SEMUA nibar staging harus sudah ada di `aset`.
-- Kalau ada satu saja yang belum (import belum tuntas), RAISE EXCEPTION →
-- seluruh migrasi batal, tidak ada yang ke-drop. Tabel yang sudah tidak ada
-- dilewati (idempotent / re-runnable).
-- ============================================================================

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['stg_import_tanah', 'stg_import_gedung', 'stg_import_jalan_irigasi'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% sudah tidak ada — dilewati.', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I s WHERE NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar)', t
    ) INTO n;

    IF n > 0 THEN
      RAISE EXCEPTION
        '% masih punya % baris yang nibar-nya BELUM ada di aset — import belum tuntas, drop dibatalkan seluruhnya.',
        t, n;
    END IF;

    EXECUTE format('DROP TABLE %I', t);
    RAISE NOTICE '% di-drop (semua nibar terverifikasi sudah ada di aset).', t;
  END LOOP;
END $$;

-- Verifikasi:
--   SELECT to_regclass('public.stg_import_tanah'),
--          to_regclass('public.stg_import_gedung'),
--          to_regclass('public.stg_import_jalan_irigasi');
--   -- ketiganya harus NULL
