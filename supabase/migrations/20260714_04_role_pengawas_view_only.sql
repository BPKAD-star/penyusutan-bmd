-- ============================================================================
-- Role "pengawas" — VIEW-ONLY lintas SKPD (akuntansi/auditor/inspektorat).
-- Bisa BACA semua data di semua SKPD, TIDAK bisa menulis apa pun.
--
-- Ditegakkan di DB (bukan cuma UI) dengan 2 mekanisme:
--   1. fn_skpd_visible() dikunci `false` untuk pengawas → semua policy TULIS
--      (insert/update: `fn_is_admin() OR fn_skpd_visible(...)`) otomatis menolak
--      pengawas, TANPA perlu menyentuh satu pun policy tulis. Bulletproof:
--      berlaku walau pengawas kebetulan punya skpd_id.
--   2. Policy SELECT permissive baru `USING (fn_is_viewer())` di tiap tabel yang
--      SELECT-nya ter-scope SKPD → pengawas BACA semua (Postgres meng-OR-kan
--      policy permissive, jadi policy lama TIDAK diubah — nol risiko regresi).
-- Tabel ber-`USING(true)` (kodefikasi, skpd, satuan, saldo_awal, dll) sudah
-- kebaca semua authenticated — tak perlu apa-apa.
--
-- Role guard route (create-user/delete-user/engine) sudah cek role='admin',
-- jadi pengawas otomatis tertolak di situ juga.
-- ============================================================================

-- fn_is_viewer: mirror fn_is_admin (admin_profiles.role = 'pengawas').
CREATE OR REPLACE FUNCTION fn_is_viewer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid() AND role = 'pengawas')
$$;

-- Kunci scope TULIS pengawas ke false. Body lain IDENTIK versi 20260710_04 —
-- non-pengawas tak berubah perilakunya sama sekali.
CREATE OR REPLACE FUNCTION fn_skpd_visible(p_skpd_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN fn_is_viewer() THEN false
    WHEN p_skpd_id IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM admin_skpd s WHERE s.id = p_skpd_id AND s.path <@ fn_my_skpd_path())
  END
$$;

-- Policy SELECT permissive utk pengawas di tiap tabel ter-scope SKPD.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aset', 'transaksi_bmd', 'penyusutan_semester', 'aset_awal_2026',
    'jurnal_header', 'aset_bidang_tanah', 'rkbmd', 'rkbmd_item',
    'ipa_record', 'ipa_parameter_nilai', 'ipa_dokumen_bukti', 'ipa_log'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_viewer_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (fn_is_viewer())',
      t || '_viewer_select', t);
  END LOOP;
END $$;
