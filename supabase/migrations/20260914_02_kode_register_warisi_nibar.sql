-- ============================================================================
-- 20260914_02 — Kode register barang BARU mewarisi NIBAR-nya sendiri
--
-- INSIDEN 2026-09-14. Pemecahan Barang (PU, 8 pecahan jalan) menerbitkan NIBAR
-- …006–…013 dan kode register …006–…013, TAPI TERACAK: kode register "Desa
-- Tunglur" (…006) = NIBAR "Desa Blaru". Cari NIBAR Blaru di Daftar Barang →
-- DUA barang. Tak ada yang error: `aset_kode_register_key` UNIQUE hanya
-- menjaga sesama kode register, bukan kode register vs NIBAR barang lain.
--
-- SEBAB. Dua penomoran yang berjalan sendiri-sendiri untuk prefiks yang SAMA:
--   · NIBAR    → generateNibars (klien), urut sesuai urutan barang di form;
--   · register → trigger, lewat counter `kode_register_seq`, dipanggil saat
--                barang `draft` → `aktif` dalam SATU `UPDATE … IN (ids)` —
--                urutan baris di UPDATE itu sembarang.
-- Hasilnya himpunan nomornya sama, pasangannya tertukar. Padahal aturan yang
-- berlaku sejak backfill 20260729_04 (Pass 1) & cabang batal pengalihan:
-- barang yang BELUM PERNAH BERPINDAH memakai NIBAR-nya apa adanya. Cabang
-- penerbitan pertama di trigger saja yang tak pernah menerapkannya.
--
-- DIUKUR KE PRODUKSI (2026-09-14):
--   · 3.326 barang aktif ber-kode register = NIBAR barang LAIN;
--   · 4.038 barang belum pernah berpindah (0 baris aset_kode_register),
--     NIBAR standar, kode register seprefiks tapi ≠ NIBAR-nya — semuanya
--     `aktif`, lahir 2026-07-04 s.d. 2026-09-14 (import & approve massal);
--   · 227 dari 563 prefiksnya permutasi murni (himpunan nomor sama persis);
--   · menyamakan ke-4.038 ke NIBAR-nya: 0 bentrok dgn barang lain, dan sisa
--     tabrakan kode-register-vs-NIBAR se-DB = 0.
--
-- PERBAIKAN
-- (1) Trigger: penerbitan PERTAMA (INSERT / OLD.kode_register NULL) mewarisi
--     NIBAR bila NIBAR standar & prefiksnya cocok & belum dipakai sbg kode
--     register barang lain; counter dinaikkan setidaknya ke nomor itu.
-- (2) `fn_alokasi_nomor_register` MELEWATI nomor yang sudah dipakai sbg NIBAR
--     atau kode register barang mana pun — penjaga lintas-identitas yang tak
--     bisa diberikan UNIQUE.
-- (3) Data: ke-4.038 disamakan ke NIBAR-nya. TANPA baris aset_kode_register:
--     kode lama itu salah terbit, bukan posisi yang pernah sah — mencatatnya
--     sbg riwayat membuat periode lampau menampilkan kode yang keliru.
-- (4) Counter tiap prefiks dinaikkan ke ≥ nomor NIBAR & kode register terbesar.
--
-- ⚠️ Barang yang SUDAH berpindah (punya riwayat) TIDAK disentuh.
-- ⚠️ Non-ledger (kode register = identitas administratif), jadi UPDATE biasa.
--    Trigger tak terbangun: `kode_register` di luar `UPDATE OF`-nya.
-- ⚠️ Deploy-ordering: migrasi dulu. Kode klien (generateNibars ikut membaca
--    kode register) aman dua arah.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_alokasi_nomor_register(p_prefix38 text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nomor integer; v_kode text;
BEGIN
  IF p_prefix38 IS NULL OR length(p_prefix38) <> 38 THEN
    RAISE EXCEPTION 'prefiks kode register tidak sah: %', COALESCE(p_prefix38, '(null)');
  END IF;
  LOOP
    INSERT INTO kode_register_seq (prefix38, nomor_terakhir)
    VALUES (p_prefix38, 1)
    ON CONFLICT (prefix38) DO UPDATE
      SET nomor_terakhir = kode_register_seq.nomor_terakhir + 1,
          diperbarui_at  = now()
    RETURNING nomor_terakhir INTO v_nomor;

    IF v_nomor > 9999999 THEN
      RAISE EXCEPTION 'nomor urut kode register habis untuk prefiks % (maks 7 digit)', p_prefix38;
    END IF;
    v_kode := p_prefix38 || lpad(v_nomor::text, 7, '0');
    -- Nomor yang sudah jadi NIBAR/kode register barang lain dilewati. Dua index
    -- UNIQUE (nibar, kode_register) → BitmapOr, murah.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM aset WHERE nibar = v_kode OR kode_register = v_kode);
  END LOOP;
  RETURN v_nomor;
END $function$;

-- Naikkan counter setidaknya ke p_nomor (tak pernah menurunkan).
CREATE OR REPLACE FUNCTION public.fn_counter_register_minimal(p_prefix38 text, p_nomor integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO kode_register_seq (prefix38, nomor_terakhir)
  VALUES (p_prefix38, p_nomor)
  ON CONFLICT (prefix38) DO UPDATE
    SET nomor_terakhir = greatest(kode_register_seq.nomor_terakhir, EXCLUDED.nomor_terakhir),
        diperbarui_at  = CASE WHEN EXCLUDED.nomor_terakhir > kode_register_seq.nomor_terakhir
                              THEN now() ELSE kode_register_seq.diperbarui_at END
$function$;
REVOKE ALL ON FUNCTION public.fn_counter_register_minimal(text, integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_aset_kode_register_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kode_skpd text; v_tahun text; v_p38 text; v_nomor integer; v_alasan text;
  v_batal text;
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.kode_register := NULL; END IF;

  IF NEW.status = 'draft' THEN
    NEW.kode_register := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'dihapus' THEN
    NEW.kode_register := OLD.kode_register;
    RETURN NEW;
  END IF;

  -- ══ CABANG PEMBATALAN ══════════════════════════════════════════════════
  -- Ditandai fn_batal_pengalihan_barang lewat set_config(..., true) sehingga
  -- hanya berlaku di dalam transaksi itu — tak bisa bocor ke UPDATE lain.
  v_batal := COALESCE(current_setting('app.batal_pengalihan', true), '');
  IF v_batal = '1' THEN
    SELECT kode_skpd INTO v_kode_skpd FROM admin_skpd WHERE id = NEW.skpd_id;
    -- Tahun = tahun PEROLEHAN, bukan tahun berjalan: perpindahannya dianggap
    -- tak pernah terjadi, jadi "tahun berada di SKPD ini" kembali ke tahun ia
    -- lahir di situ.
    v_p38 := fn_prefix_kode_register(
      NEW.intra_ekstra::text, v_kode_skpd, to_char(NEW.tgl_perolehan, 'YYYY'), NEW.kode);
    IF v_p38 IS NULL THEN RETURN NEW; END IF;

    IF length(COALESCE(NEW.nibar, '')) = 45
       AND left(NEW.nibar, 38) = v_p38
       AND substring(NEW.nibar FROM 39 FOR 7) ~ '^\d{7}$' THEN
      -- Aturan yang SAMA PERSIS dengan Pass 1 backfill (migrasi 20260729_04):
      -- barang yang tak pernah bergerak memakai NIBAR-nya apa adanya. Inilah
      -- yang memadamkan tanda ⚠ di Daftar Barang — tanpa ini barang tetap
      -- menyala walau pengalihannya sudah dibatalkan.
      NEW.kode_register := NEW.nibar;
    ELSIF NEW.kode_register IS NULL OR left(NEW.kode_register, 38) <> v_p38 THEN
      NEW.kode_register := v_p38 || lpad(fn_alokasi_nomor_register(v_p38)::text, 7, '0');
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.kode_register IS DISTINCT FROM NEW.kode_register THEN
      INSERT INTO aset_kode_register (aset_id, kode_lama, kode_register, periode, tanggal, alasan)
      VALUES (NEW.id, OLD.kode_register, NEW.kode_register,
              fn_periode_dari_tanggal(current_date), current_date, 'batal pengalihan');
    END IF;
    RETURN NEW;
  END IF;
  -- ══ akhir cabang pembatalan ════════════════════════════════════════════

  SELECT kode_skpd INTO v_kode_skpd FROM admin_skpd WHERE id = NEW.skpd_id;

  IF TG_OP = 'UPDATE' AND NEW.skpd_id IS DISTINCT FROM OLD.skpd_id THEN
    v_tahun := to_char(current_date, 'YYYY');
  ELSIF TG_OP = 'UPDATE' AND OLD.kode_register IS NOT NULL THEN
    v_tahun := substring(OLD.kode_register FROM 23 FOR 4);
  ELSE
    v_tahun := to_char(NEW.tgl_perolehan, 'YYYY');
  END IF;

  v_p38 := fn_prefix_kode_register(NEW.intra_ekstra::text, v_kode_skpd, v_tahun, NEW.kode);
  IF v_p38 IS NULL THEN RETURN NEW; END IF;

  IF NEW.kode_register IS NOT NULL AND left(NEW.kode_register, 38) = v_p38 THEN
    RETURN NEW;
  END IF;

  -- ══ PENERBITAN PERTAMA: WARISI NIBAR (20260914_02) ══════════════════════
  -- Barang yang baru lahir (INSERT, atau draft → aktif) belum pernah
  -- berpindah, jadi kode registernya = NIBAR-nya — aturan yang sama dgn Pass 1
  -- backfill & cabang pembatalan di atas. Tanpa ini, approve/pemecahan N barang
  -- dalam satu UPDATE membagikan nomor counter dgn urutan baris SEMBARANG, dan
  -- kode register barang A jadi = NIBAR barang B (insiden 2026-09-14).
  IF (TG_OP = 'INSERT' OR OLD.kode_register IS NULL)
     AND length(COALESCE(NEW.nibar, '')) = 45
     AND left(NEW.nibar, 38) = v_p38
     AND substring(NEW.nibar FROM 39 FOR 7) ~ '^\d{7}$'
     AND NOT EXISTS (SELECT 1 FROM aset WHERE kode_register = NEW.nibar AND id <> NEW.id) THEN
    NEW.kode_register := NEW.nibar;
    PERFORM fn_counter_register_minimal(v_p38, substring(NEW.nibar FROM 39 FOR 7)::integer);
    RETURN NEW;
  END IF;

  v_nomor := fn_alokasi_nomor_register(v_p38);

  IF TG_OP = 'UPDATE' AND OLD.kode_register IS NOT NULL THEN
    v_alasan := CASE
      WHEN NEW.skpd_id      IS DISTINCT FROM OLD.skpd_id      THEN 'pindah unit'
      WHEN NEW.kode         IS DISTINCT FROM OLD.kode         THEN 'reklasifikasi kode barang'
      WHEN NEW.intra_ekstra IS DISTINCT FROM OLD.intra_ekstra THEN 'reklas komptabel'
      ELSE 'perubahan posisi' END;
    INSERT INTO aset_kode_register (aset_id, kode_lama, kode_register, periode, tanggal, alasan)
    VALUES (NEW.id, OLD.kode_register, v_p38 || lpad(v_nomor::text, 7, '0'),
            fn_periode_dari_tanggal(current_date), current_date, v_alasan);
  END IF;

  NEW.kode_register := v_p38 || lpad(v_nomor::text, 7, '0');
  RETURN NEW;
END $function$;

-- ── Perbaikan data ──────────────────────────────────────────────────────────
CREATE TEMP TABLE _kr_fix ON COMMIT DROP AS
SELECT a.id, a.nibar, a.kode_register AS kode_lama
  FROM aset a
 WHERE length(a.nibar) = 45 AND a.nibar ~ '^120[12]3506\d{37}$'
   AND a.kode_register IS NOT NULL
   AND left(a.kode_register, 38) = left(a.nibar, 38)
   AND a.kode_register <> a.nibar
   AND NOT EXISTS (SELECT 1 FROM aset_kode_register h WHERE h.aset_id = a.id);

DO $$
DECLARE v_n int; v_blok int;
BEGIN
  SELECT count(*) INTO v_n FROM _kr_fix;
  -- NIBAR tujuan tak boleh sedang dipakai sbg kode register barang DI LUAR set.
  SELECT count(*) INTO v_blok
    FROM _kr_fix f JOIN aset o ON o.kode_register = f.nibar AND o.id <> f.id
   WHERE NOT EXISTS (SELECT 1 FROM _kr_fix f2 WHERE f2.id = o.id);
  IF v_blok > 0 THEN
    RAISE EXCEPTION '% NIBAR tujuan sudah dipakai kode register barang lain — batal, periksa manual', v_blok;
  END IF;
  -- Sanity: angka terukur 2026-09-14 ≈ 4.048. Jauh lebih besar = ada yang lain.
  -- 0 juga mencurigakan (pola salah) — tapi sah kalau migrasi dijalankan ulang.
  IF v_n > 5000 THEN
    RAISE EXCEPTION 'kandidat % baris, jauh di atas 4.038 yang terukur — batal, periksa manual', v_n;
  END IF;
  RAISE NOTICE 'menyamakan kode register % barang ke NIBAR-nya', v_n;
END $$;

-- Dua langkah: UNIQUE diperiksa per baris, dan pasangan yang tertukar saling
-- memegang nilai tujuan satu sama lain.
UPDATE aset a SET kode_register = NULL FROM _kr_fix f WHERE a.id = f.id;
UPDATE aset a SET kode_register = f.nibar FROM _kr_fix f WHERE a.id = f.id;

-- Counter ≥ nomor NIBAR & kode register terbesar per prefiks.
INSERT INTO kode_register_seq (prefix38, nomor_terakhir)
SELECT p, max(n) FROM (
  SELECT left(nibar, 38) p, substring(nibar FROM 39 FOR 7)::int n
    FROM aset WHERE nibar ~ '^120[12]3506\d{37}$'
  UNION ALL
  SELECT left(kode_register, 38), substring(kode_register FROM 39 FOR 7)::int
    FROM aset WHERE kode_register ~ '^120[12]3506\d{37}$'
) s GROUP BY p
ON CONFLICT (prefix38) DO UPDATE
  SET nomor_terakhir = greatest(kode_register_seq.nomor_terakhir, EXCLUDED.nomor_terakhir);

-- Penjaga akhir: tak boleh ada kode register = NIBAR barang lain.
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM aset a JOIN aset b ON a.kode_register = b.nibar AND a.id <> b.id;
  IF v > 0 THEN RAISE EXCEPTION 'masih % kode register = NIBAR barang lain — batal', v; END IF;
END $$;
