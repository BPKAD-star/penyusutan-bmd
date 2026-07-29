-- ============================================================================
-- KODE REGISTER — Fase 1b: BACKFILL 418rb aset + seed counter + pasang trigger.
--
-- JALANKAN SETELAH 20260729_03_kode_register_skema.sql, SEBELUM deploy kode.
--
-- ⚠️ JALANKAN LEWAT psql, BUKAN Supabase SQL Editor:
--     psql "<connection-string>" -f <berkas ini>
--   SQL Editor tidak sanggup: (1) satu UPDATE 418rb baris melampaui batas waktu
--   gateway API-nya → `Failed to fetch (api.supabase.com)`; (2) editor itu
--   menentukan mode baca/tulis dari KATA PERTAMA skrip, jadi skrip yang diawali
--   `WITH` dibuka sebagai transaksi READ-ONLY dan UPDATE di dalamnya ditolak
--   (`25006: cannot execute UPDATE in a read-only transaction`) — di mana pun
--   UPDATE-nya diletakkan. Dua-duanya batasan editor, bukan SQL di bawah ini.
--
-- AMAN DIULANG. Semua langkah dipagari `kode_register IS NULL` / `IF NOT EXISTS`
-- / `ON CONFLICT`, jadi kalau putus di tengah, jalankan ulang saja — tak ada
-- baris yang diproses dua kali dan tak ada nomor yang terbakar percuma.
--
-- URUTAN LANGKAH TAK BOLEH DITUKAR:
--   1. Pass 1        — barang yang boleh memakai NIBAR apa adanya
--   2. Pass 2        — sisanya, nomor terbitan baru (butuh Pass 1 sudah selesai)
--   3. Seed counter  — WAJIB sesudah 1 & 2
--   4. Index UNIQUE  — sesudah backfill, biar tak ada ongkos pemeliharaan index
--                      selama dua UPDATE besar
--   5. Trigger       — PALING AKHIR; kalau dipasang duluan, backfill memicunya
--                      ratusan ribu kali
-- ============================================================================

-- Backfill ini memang lama (418rb baris). Batas waktu bawaan role Supabase akan
-- memotongnya di tengah jalan kalau tidak dimatikan untuk sesi ini.
SET statement_timeout = 0;

\timing on
\echo '=== LANGKAH 1/5: Pass 1 — barang yang memakai NIBAR apa adanya ==='

-- ── LANGKAH 1 — Pass 1 ──────────────────────────────────────────────────────
-- Barang yang belum pernah pindah/reklas: posisi terakhirnya = posisi lahirnya,
-- jadi kode registernya SAMA PERSIS dgn NIBAR — termasuk nomor urutnya. Ini
-- bukan sekadar hemat: (a) tak ada nomor terbuang, (b) tampilan cocok dgn yang
-- sudah dilihat operator sejak Fase 0, (c) counter jadi ter-seed benar tanpa
-- perlu menebak.
--
-- NIBAR warisan e-BMD yang 43 digit TIDAK lolos syarat `length = 45` → jatuh ke
-- Pass 2 dan dapat nomor terbitan baru. Itu memang yang benar: segmen NIBAR lama
-- tak sejajar, memotongnya 38 digit menghasilkan prefiks yang salah.
WITH pindah AS (
  -- Aset yang PERNAH pindah unit + tahun perpindahan TERAKHIRnya. Dilayani
  -- idx_trx_pindah_id (migrasi 20260729_01) — biayanya ikut jumlah PERPINDAHAN,
  -- bukan besar ledger. Predikatnya KEMBAR dgn JENIS_PINDAH di lib/pengalihan.ts.
  --
  -- WAJIB ADA, bukan hiasan: tanpa ini, barang yang pindah LALU KEMBALI ke SKPD
  -- asal (mobil BKAD → kecamatan → BKAD) akan lolos Pass 1 dan memakai kode
  -- lamanya, padahal seharusnya dapat kode baru bertahun kepulangannya.
  SELECT DISTINCT ON (aset_id) aset_id, left(periode, 4) AS tahun
  FROM transaksi_bmd
  WHERE jenis IN ('pengalihan_status', 'mutasi_internal')
  ORDER BY aset_id, id DESC
),
kandidat AS (
  SELECT a.id, a.nibar,
    fn_prefix_kode_register(
      a.intra_ekstra::text, s.kode_skpd,
      -- "tahun berada di SKPD tersebut": tahun pindah terakhir kalau pernah
      -- pindah, kalau tidak ya tahun ia lahir di situ = tahun perolehan.
      COALESCE(p.tahun, to_char(a.tgl_perolehan, 'YYYY')), a.kode
    ) AS p38
  FROM aset a
  JOIN admin_skpd s ON s.id = a.skpd_id
  LEFT JOIN pindah p ON p.aset_id = a.id
  -- `draft` dilewati: nomor urut jangan terbakar barang yang mungkin tak jadi.
  -- `dihapus` IKUT dapat kode — dokumen fisik (BAST/SK penghapusan) menyebut
  -- barang itu, dan penelusuran baliknya harus tetap bisa.
  WHERE a.status IN ('aktif', 'dihapus') AND a.kode_register IS NULL
)
UPDATE aset a SET kode_register = k.nibar
FROM kandidat k
WHERE k.id = a.id
  AND k.p38 IS NOT NULL
  AND length(k.nibar) = 45
  AND left(k.nibar, 38) = k.p38
  AND substring(k.nibar FROM 39 FOR 7) ~ '^\d{7}$';

\echo '=== LANGKAH 2/5: Pass 2 — sisanya dapat nomor terbitan baru ==='

-- ── LANGKAH 2 — Pass 2 ──────────────────────────────────────────────────────
-- Isinya: barang yang posisinya sudah bergeser dari NIBAR (pernah pindah/reklas)
-- + NIBAR warisan 43 digit + NIBAR kosong. Nomornya melanjutkan dari yang sudah
-- terpakai di prefiks yang sama (hasil Pass 1), jadi tak mungkin bertabrakan.
--
-- Urutan alokasi DETERMINISTIK (tgl_perolehan, nibar, id) — dijalankan dua kali
-- hasilnya sama.
WITH pindah AS (
  SELECT DISTINCT ON (aset_id) aset_id, left(periode, 4) AS tahun
  FROM transaksi_bmd
  WHERE jenis IN ('pengalihan_status', 'mutasi_internal')
  ORDER BY aset_id, id DESC
),
kandidat AS (
  SELECT a.id, a.nibar, a.tgl_perolehan,
    fn_prefix_kode_register(
      a.intra_ekstra::text, s.kode_skpd,
      COALESCE(p.tahun, to_char(a.tgl_perolehan, 'YYYY')), a.kode
    ) AS p38
  FROM aset a
  JOIN admin_skpd s ON s.id = a.skpd_id
  LEFT JOIN pindah p ON p.aset_id = a.id
  WHERE a.status IN ('aktif', 'dihapus') AND a.kode_register IS NULL
),
basis AS (
  -- Nomor tertinggi yang SUDAH terpakai per prefiks (hasil Pass 1).
  SELECT left(kode_register, 38) AS p38,
         max(substring(kode_register FROM 39 FOR 7)::integer) AS maks
  FROM aset
  WHERE kode_register IS NOT NULL AND length(kode_register) = 45
    AND substring(kode_register FROM 39 FOR 7) ~ '^\d{7}$'
  GROUP BY 1
),
nomor AS (
  SELECT k.id, k.p38,
    COALESCE(b.maks, 0) + row_number() OVER (
      PARTITION BY k.p38 ORDER BY k.tgl_perolehan NULLS LAST, k.nibar NULLS LAST, k.id
    ) AS seq
  FROM kandidat k
  LEFT JOIN basis b ON b.p38 = k.p38
  WHERE k.p38 IS NOT NULL
)
UPDATE aset a SET kode_register = n.p38 || lpad(n.seq::text, 7, '0')
FROM nomor n WHERE n.id = a.id;

\echo '=== LANGKAH 3/5: seed counter ==='

-- ── LANGKAH 3 — Seed counter ────────────────────────────────────────────────
-- WAJIB: kalau counter mulai dari 0, penerbitan pertama sesudah deploy akan
-- menabrak nomor yang sudah terpakai.
INSERT INTO kode_register_seq (prefix38, nomor_terakhir)
SELECT left(kode_register, 38),
       max(substring(kode_register FROM 39 FOR 7)::integer)
FROM aset
WHERE kode_register IS NOT NULL AND length(kode_register) = 45
  AND substring(kode_register FROM 39 FOR 7) ~ '^\d{7}$'
GROUP BY 1
ON CONFLICT (prefix38) DO UPDATE
  SET nomor_terakhir = GREATEST(kode_register_seq.nomor_terakhir, EXCLUDED.nomor_terakhir);

\echo '=== LANGKAH 4/5: index UNIQUE ==='

-- ── LANGKAH 4 — Jaring pengaman ─────────────────────────────────────────────
-- Penjaga terakhir, sama seperti aset_nibar_key: waktu generator NIBAR diam-diam
-- mengulang nomor dari 1, yang menyelamatkan cuma constraint UNIQUE-nya — gagal
-- simpan itu GEJALA, dan jauh lebih murah daripada nomor dobel yang masuk tanpa
-- suara. Kalau langkah ini gagal dgn "could not create unique index", berarti ada
-- kode dobel: JANGAN dipaksa, cari dulu penyebabnya lewat query verifikasi.
CREATE UNIQUE INDEX IF NOT EXISTS aset_kode_register_key ON aset (kode_register);

\echo '=== LANGKAH 5/5: trigger sinkronisasi ==='

-- ── LANGKAH 5 — Trigger sinkronisasi ────────────────────────────────────────
-- DI DB, BUKAN DI KODE. Ada 6+ pintu yang menggeser posisi barang
-- (fn_terima_pengalihan, fn_kembalikan_pengalihan_barang, fn_terima_mutasi_internal
-- + pengembaliannya, patchAsetDari untuk reklas, batal_reklas, approve Cara
-- Perolehan). Kalau penegakannya di sisi kode, satu pintu kelupaan = kode
-- register basi diam-diam — persis nasib cache `aset.pemanfaatan` yang sampai
-- sekarang tak pernah auto-null saat masa berakhir lewat.
CREATE OR REPLACE FUNCTION fn_aset_kode_register_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kode_skpd text; v_tahun text; v_p38 text; v_nomor integer; v_alasan text;
BEGIN
  -- Kode register TIDAK boleh datang dari client. Tanpa baris ini, siapa pun
  -- yang bisa INSERT `aset` tinggal menitipkan kode_register buatan sendiri —
  -- lolos begitu saja karena pemeriksaan "prefiksnya sudah cocok" di bawah
  -- menganggapnya sah, dan nomor itu tak pernah lewat counter.
  IF TG_OP = 'INSERT' THEN NEW.kode_register := NULL; END IF;

  -- Belum disetujui → belum terbit. Pola NIBAR (digenerate saat approve).
  IF NEW.status = 'draft' THEN
    NEW.kode_register := NULL;
    RETURN NEW;
  END IF;

  -- Sudah dihapus → BEKUKAN kode terakhirnya. Barang yang di-soft-delete tak
  -- boleh dapat nomor baru (tak ada peristiwa perpindahan), dan kodenya tak
  -- boleh dicabut karena masih disebut dokumen penghapusannya.
  IF TG_OP = 'UPDATE' AND NEW.status = 'dihapus' THEN
    NEW.kode_register := OLD.kode_register;
    RETURN NEW;
  END IF;

  SELECT kode_skpd INTO v_kode_skpd FROM admin_skpd WHERE id = NEW.skpd_id;

  -- Tahun = "tahun berada di SKPD ini".
  --   * Pindah unit  → tahun BERJALAN. current_date dipilih supaya kembar persis
  --     dgn fn_terima_pengalihan & fn_terima_mutasi_internal yang dua-duanya
  --     mencatat ledgernya pakai current_date — tak mungkin geser dari ledger.
  --   * Reklas kode/komptabel → tahun TIDAK bergeser: barangnya tidak pindah
  --     ke mana-mana, cuma ganti klasifikasi.
  IF TG_OP = 'UPDATE' AND NEW.skpd_id IS DISTINCT FROM OLD.skpd_id THEN
    v_tahun := to_char(current_date, 'YYYY');
  ELSIF TG_OP = 'UPDATE' AND OLD.kode_register IS NOT NULL THEN
    v_tahun := substring(OLD.kode_register FROM 23 FOR 4);
  ELSE
    v_tahun := to_char(NEW.tgl_perolehan, 'YYYY');
  END IF;

  v_p38 := fn_prefix_kode_register(NEW.intra_ekstra::text, v_kode_skpd, v_tahun, NEW.kode);

  -- Data belum lengkap → BIARKAN kosong, jangan mengarang kode. Lebih baik
  -- operator melihat sel kosong daripada deret digit yang kelihatan sah lalu
  -- tersalin ke KIR/BAST.
  IF v_p38 IS NULL THEN RETURN NEW; END IF;

  -- Prefiksnya tak berubah → tak ada yang perlu diterbitkan.
  IF NEW.kode_register IS NOT NULL AND left(NEW.kode_register, 38) = v_p38 THEN
    RETURN NEW;
  END IF;

  v_nomor := fn_alokasi_nomor_register(v_p38);

  -- Riwayat HANYA untuk PERPINDAHAN (UPDATE), bukan penerbitan perdana:
  -- satu baris memuat kode lama + kode baru sekaligus, jadi 418rb barang yang
  -- tak pernah pindah tak menitipkan satu baris pun. Sekalian menghindari
  -- pelanggaran FK — pada BEFORE INSERT, baris `aset`-nya memang belum ada.
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
END $$;

-- `UPDATE OF …`: cuma jalan kalau ada kolom yang benar-benar relevan disentuh.
-- Tanpa ini, setiap UPDATE `aset` apa pun (koreksi spesifikasi, cache
-- pemanfaatan, foto_paths) ikut membangunkan fungsi di atas percuma.
DROP TRIGGER IF EXISTS trg_aset_kode_register ON aset;
CREATE TRIGGER trg_aset_kode_register
  BEFORE INSERT OR UPDATE OF skpd_id, kode, intra_ekstra, status, tgl_perolehan ON aset
  FOR EACH ROW EXECUTE FUNCTION fn_aset_kode_register_sync();

\echo '=== VERIFIKASI ==='

-- `dobel` HARUS 0. `tanpa_kode` boleh > 0 hanya untuk barang yang segmennya
-- memang bolong (kode/tgl_perolehan/intra_ekstra kosong).
SELECT count(*) FILTER (WHERE kode_register IS NULL AND status <> 'draft') AS tanpa_kode,
       count(*) FILTER (WHERE kode_register IS NOT NULL) AS berkode,
       count(*) FILTER (WHERE kode_register IS NOT NULL)
         - count(DISTINCT kode_register) AS dobel,
       count(*) FILTER (WHERE kode_register IS NOT NULL AND kode_register <> nibar) AS beda_dari_nibar
FROM aset;
