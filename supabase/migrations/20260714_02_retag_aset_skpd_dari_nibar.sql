-- ============================================================================
-- Re-tag skpd_id ke SUB-UNIT/LOKASI yang benar, acuan = segmen lokasi (14 digit)
-- pada NIBAR. Latar: import baseline (etl_saldo_awal.py) memetakan skpd_id dari
-- NAMA OPD ke SKPD level-1 SAJA (`.eq("level",1)`), jadi ~97% aset menempel di
-- OPD INDUK — padahal NIBAR-nya sudah menyandikan sub-unit/lokasi tepat (14 digit
-- = skpd.kode_skpd tanpa titik). Akibatnya filter sub-unit di Daftar Barang/
-- Penyusutan/Saldo Awal/transaksi tampil 0. Bukan bug filter (subtree rollup sudah
-- benar) — datanya yang belum dipecah ke lokasi. NIBAR = sumber lokasi yang benar.
--
-- Menyentuh DUA tabel: `aset` (live) & `aset_awal_2026` (snapshot baseline beku,
-- display-only). Keduanya punya skpd_id kasar dari import yang sama.
--
-- AMAN — hanya memindahkan aset TURUN dalam pohon OPD yang SAMA:
--   * skpd_id sekarang WAJIB leluhur dari node lokasi NIBAR (cur = ancestor(tgt)).
--     → lintas-OPD TIDAK disentuh (mis. gedung yg NIBAR-nya = OPD pelaksana, tapi
--       dimiliki OPD lain; atau barang pindah antar-OPD & NIBAR belum berubah).
--       Sudah diverifikasi: 12 baris seperti ini di `aset` otomatis dilewati.
--   * Untuk `aset`: aset yg pernah 'pengalihan_status'/'mutasi_internal' (event 2026)
--     DIKECUALIKAN — skpd_id-nya sudah sah berubah lewat ledger.
--   * NIBAR, nilai penyusutan, ledger — TIDAK diubah. Cuma kolom skpd_id.
--
-- Dampak (data live 2026-07-14): `aset` 5.981 pindah (1.898 L2, 4.083 L3);
-- `aset_awal_2026` 5.982 pindah (1.899 L2, 4.083 L3). Angka penyusutan tak
-- terpengaruh (key by aset_id/nibar, bukan skpd_id).
--
-- ROLLBACK:
--   UPDATE aset a SET skpd_id=b.skpd_lama FROM retag_skpd_backup_20260714 b WHERE b.aset_id=a.id;
--   UPDATE aset_awal_2026 a SET skpd_id=b.skpd_lama FROM retag_skpd_backup_awal_20260714 b WHERE b.nibar=a.nibar;
-- ============================================================================

BEGIN;

-- ── A. Tabel `aset` (live) ──────────────────────────────────────────────────
CREATE TEMP TABLE _retag ON COMMIT DROP AS
WITH RECURSIVE anc AS (
  SELECT id AS node, id AS anc FROM admin_skpd
  UNION ALL
  SELECT a.node, s.parent_id FROM anc a JOIN admin_skpd s ON s.id = a.anc WHERE s.parent_id IS NOT NULL
)
SELECT DISTINCT ON (a.id) a.id AS aset_id, a.skpd_id AS skpd_lama, s.id AS skpd_baru
FROM aset a
JOIN admin_skpd s
  ON left(rpad(regexp_replace(s.kode_skpd,'\D','','g'),14,'0'),14) = substring(a.nibar FROM 9 FOR 14)
JOIN anc ON anc.node = s.id AND anc.anc = a.skpd_id
WHERE a.nibar IS NOT NULL AND length(a.nibar) >= 22 AND s.id <> a.skpd_id
  AND NOT EXISTS (
    SELECT 1 FROM transaksi_bmd t
    WHERE t.aset_id = a.id AND t.jenis IN ('pengalihan_status','mutasi_internal')
  )
ORDER BY a.id, s.level DESC;

CREATE TABLE IF NOT EXISTS retag_skpd_backup_20260714 (
  aset_id uuid PRIMARY KEY, skpd_lama bigint, skpd_baru bigint, ts timestamptz NOT NULL DEFAULT now());
INSERT INTO retag_skpd_backup_20260714 (aset_id, skpd_lama, skpd_baru)
SELECT aset_id, skpd_lama, skpd_baru FROM _retag ON CONFLICT (aset_id) DO NOTHING;

UPDATE aset a SET skpd_id = r.skpd_baru, updated_at = now()
FROM _retag r WHERE r.aset_id = a.id;

-- ── B. Tabel `aset_awal_2026` (snapshot baseline, keyed by nibar) ───────────
-- Tanpa cek pengalihan/mutasi: baseline = posisi akhir 2025, event pindah 2026
-- (di `aset`) tidak berlaku untuk snapshot ini. NIBAR = sub-unit asli 2025.
CREATE TEMP TABLE _retag_awal ON COMMIT DROP AS
WITH RECURSIVE anc AS (
  SELECT id AS node, id AS anc FROM admin_skpd
  UNION ALL
  SELECT a.node, s.parent_id FROM anc a JOIN admin_skpd s ON s.id = a.anc WHERE s.parent_id IS NOT NULL
)
SELECT DISTINCT ON (a.nibar) a.nibar, a.skpd_id AS skpd_lama, s.id AS skpd_baru
FROM aset_awal_2026 a
JOIN admin_skpd s
  ON left(rpad(regexp_replace(s.kode_skpd,'\D','','g'),14,'0'),14) = substring(a.nibar FROM 9 FOR 14)
JOIN anc ON anc.node = s.id AND anc.anc = a.skpd_id
WHERE a.nibar IS NOT NULL AND length(a.nibar) >= 22 AND s.id <> a.skpd_id
ORDER BY a.nibar, s.level DESC;

CREATE TABLE IF NOT EXISTS retag_skpd_backup_awal_20260714 (
  nibar text PRIMARY KEY, skpd_lama bigint, skpd_baru bigint, ts timestamptz NOT NULL DEFAULT now());
INSERT INTO retag_skpd_backup_awal_20260714 (nibar, skpd_lama, skpd_baru)
SELECT nibar, skpd_lama, skpd_baru FROM _retag_awal ON CONFLICT (nibar) DO NOTHING;

UPDATE aset_awal_2026 a SET skpd_id = r.skpd_baru
FROM _retag_awal r WHERE r.nibar = a.nibar;

-- ── Info ────────────────────────────────────────────────────────────────────
DO $$ DECLARE n1 int; n2 int; BEGIN
  SELECT count(*) INTO n1 FROM _retag;
  SELECT count(*) INTO n2 FROM _retag_awal;
  RAISE NOTICE 'Re-tag: aset % baris, aset_awal_2026 % baris.', n1, n2;
END $$;

COMMIT;
