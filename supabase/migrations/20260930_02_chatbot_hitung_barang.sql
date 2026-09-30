-- Asisten AI (pengguna istimewa) — alat `hitung_barang`: berapa barang aktif per
-- KODE BARANG, opsional dibatasi SKPD (berikut sub-unitnya) dan opsional dipecah
-- per SKPD. Contoh pertanyaan: "berapa Laptop di BKAD?", "SKPD mana saja yang
-- punya Lap Top?".
--
-- Kenapa fungsi SQL, bukan query PostgREST dari alatnya: menghitung butuh
-- GROUP BY, dan menarik barisnya ke server lalu menghitung di JavaScript berarti
-- puluhan ribu baris untuk barang umum (Peralatan & Mesin ±660 rb aset) — batas
-- 1.000 baris PostgREST akan memotong diam-diam dan jumlahnya tampak sah tapi
-- KURANG (kelas kegagalan yang sama dgn kolektor tanpa keyset, CLAUDE.md).
--
-- SECURITY INVOKER (bawaan), SENGAJA: RLS `aset_select` tetap berlaku atas
-- pemanggilnya. Alat ini hanya dibuka untuk admin di sisi aplikasi
-- (lib/chatbot/istimewa.ts), tapi kalau suatu saat dipanggil akun lain hasilnya
-- otomatis menyempit ke lingkupnya — bukan bocor. JANGAN diubah jadi DEFINER.
--
-- Pencarian lewat URAIAN KODEFIKASI (`admin_kodefikasi_bmd`), bukan nama_barang
-- bebas: "Lap Top" & "Laptop" adalah DUA kode berbeda di master, sementara
-- nama_barang diketik operator dan tak seragam. Kode hasil pencarian lalu
-- dicocokkan `aset.kode = ANY(...)` — dilayani idx_aset_kode, tak seq scan.
-- `kode LIKE` sengaja TIDAK dipakai untuk filter aset (tak pernah jadi index-cond
-- di bawah RLS); awalan kode dari pengguna dipakai hanya di master (kecil).
--
-- work_mem 64MB: pola sama dgn fn_rekap_bmd & kawan (CLAUDE.md, insiden
-- 2026-08-18). Tidak menaikkan statement_timeout.
--
-- Deploy-ordering: fungsi BARU (tak ada yang memanggilnya sebelum kode alat
-- ter-deploy), jadi urutannya bebas. Kode alat yang jalan tanpa migrasi ini
-- cuma mengembalikan "GAGAL: ..." ke model — tak ada yang rusak.

CREATE OR REPLACE FUNCTION fn_chatbot_hitung_barang(
  p_kata     text     DEFAULT NULL,   -- sebagian uraian kodefikasi, mis. 'lap top'
  p_kode     text     DEFAULT NULL,   -- awalan kode barang, mis. '1.3.2.10.01'
  p_skpd_ids bigint[] DEFAULT NULL,   -- NULL = seluruh scope pemanggil
  p_per_skpd boolean  DEFAULT false   -- true = pecah per skpd_id
)
RETURNS TABLE (kode text, uraian text, skpd_id bigint, jumlah bigint, nilai_perolehan numeric)
LANGUAGE plpgsql STABLE
SET search_path = public
SET work_mem = '64MB'
AS $$
DECLARE
  v_kata  text := nullif(btrim(p_kata), '');
  v_kode  text := nullif(btrim(p_kode), '');
  v_kodes text[];
BEGIN
  IF v_kata IS NULL AND v_kode IS NULL THEN
    RAISE EXCEPTION 'isi p_kata (uraian) atau p_kode (awalan kode barang)';
  END IF;

  -- Metakarakter LIKE dari pengguna dinetralkan: '%' / '_' polos akan mencocokkan
  -- seluruh master. Spasi dalam kata dibuat longgar ('lap top' ≈ 'lap%top').
  SELECT array_agg(k.kode) INTO v_kodes
  FROM admin_kodefikasi_bmd k
  WHERE (v_kata IS NULL
         OR k.uraian ILIKE '%' || replace(regexp_replace(replace(replace(replace(v_kata, '\', ''), '%', ''), '_', ''), '\s+', '%', 'g'), '*', '') || '%')
    AND (v_kode IS NULL OR k.kode LIKE replace(replace(replace(v_kode, '\', ''), '%', ''), '_', '') || '%');

  IF v_kodes IS NULL THEN RETURN; END IF;
  -- Terlalu banyak kode = kata kuncinya terlalu umum ("alat", "meja"): tolak
  -- ketimbang menjumlah ratusan jenis barang jadi satu angka yang tak berarti.
  IF cardinality(v_kodes) > 60 THEN
    RAISE EXCEPTION 'kata kunci terlalu umum: cocok dengan % kode barang (maks 60) — persempit atau pakai awalan kode', cardinality(v_kodes);
  END IF;

  -- ⚠️ Agregasi DULU, uraian ditempel SESUDAHNYA. Versi pertama menaruh
  -- subquery uraian di select list yang sama dgn GROUP BY: planner
  -- mengevaluasinya per baris aset (133 rb baris "kursi" × seq scan master 15 rb
  -- baris) — terukur 13,7 dtk lawan 0,45 dtk untuk agregasi yang sama tanpanya.
  RETURN QUERY
  WITH g AS (
    SELECT a.kode AS kd,
           CASE WHEN p_per_skpd THEN a.skpd_id ELSE NULL END AS sk,
           count(*)::bigint AS n,
           COALESCE(sum(a.nilai_perolehan), 0) AS rp
    FROM aset a
    WHERE a.status = 'aktif'
      AND a.kode = ANY (v_kodes)
      AND (p_skpd_ids IS NULL OR a.skpd_id = ANY (p_skpd_ids))
    GROUP BY 1, 2
  )
  SELECT g.kd::text, k.uraian::text, g.sk, g.n, g.rp
  FROM g
  LEFT JOIN admin_kodefikasi_bmd k ON k.kode = g.kd
  ORDER BY g.n DESC, g.kd;
END;
$$;

REVOKE ALL ON FUNCTION fn_chatbot_hitung_barang(text, text, bigint[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_chatbot_hitung_barang(text, text, bigint[], boolean) TO authenticated;
