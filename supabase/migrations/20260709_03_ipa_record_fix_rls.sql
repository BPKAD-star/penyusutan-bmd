-- ============================================================================
-- Fix bug laten di RLS "ir_update" (ipa_record) dari migrasi 20260709_02.
--
-- Policy lama cuma py USING tanpa WITH CHECK eksplisit:
--   USING ( ... OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(skpd_id)
--            AND status = 'draft') )
-- Postgres otomatis pakai USING yang sama sbg WITH CHECK kalau gak dikasih
-- eksplisit — itu dicek ke baris SETELAH update. Akibatnya cabang pb_admin
-- mensyaratkan status='draft' juga pada baris BARU, jadi pb_admin TIDAK
-- PERNAH BISA submit (draft -> diajukan): begitu status diubah ke apa pun
-- selain 'draft', WITH CHECK implisit itu gagal dan UPDATE ditolak RLS.
--
-- Fix: drop + recreate dengan WITH CHECK eksplisit yang mengizinkan pb_admin
-- pindah status ke 'draft' ATAU 'diajukan' (self-submit) tapi TIDAK ke
-- 'diverifikasi'/'ditolak' (itu cuma lewat cabang bkad_verifier/bkad_admin/
-- admin, yang tetap tanpa batasan status di kedua klausa).
-- ============================================================================

DROP POLICY IF EXISTS "ir_update" ON ipa_record;
CREATE POLICY "ir_update" ON ipa_record FOR UPDATE TO authenticated
  USING (
    fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin')
    OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(skpd_id) AND status = 'draft')
  )
  WITH CHECK (
    fn_is_admin() OR fn_ipa_role() IN ('bkad_verifier','bkad_admin')
    OR (fn_ipa_role() = 'pb_admin' AND fn_skpd_visible(skpd_id) AND status IN ('draft','diajukan'))
  );
