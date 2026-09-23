-- ============================================================================
-- INVENTARISASI PER BARANG (keputusan user 2026-09-23) — merombak modul
-- 20260725_08 + 20260727_04.
--
-- MASALAH MODEL LAMA: satu "lembar kerja" per SKPD × tahun × jenis aset, yang
-- saat dibuat MENARIK SELURUH barang lalu MEMBEKUKANNYA jadi baris. Barang itu
-- dinamis (penghapusan, pengadaan baru, reklas, pengalihan ke SKPD lain,
-- pemecahan, kapitalisasi), jadi lembarnya basi sejak detik dibuat. Validasinya
-- juga per LEMBAR — di Peralatan & Mesin (661.766 barang aktif, sampai 22.773 di
-- satu SKPD) satu barang keliru mengembalikan ribuan barang sekaligus.
--
-- MODEL BARU:
--   * Lembar Kerja = TAMPILAN register hidup (RPC `fn_inventarisasi_lembar`),
--     bukan salinan. Tiap barang punya tombol "Isi Inventarisasi".
--   * Isian tersimpan SATU BARIS PER BARANG di `inventarisasi_barang`, begitu
--     disimpan. Tidak ada "Ajukan".
--   * Validasi oleh PENGELOLA BARANG (admin) PER BARANG, bisa dicicil;
--     "Batal Validasi" mengembalikannya ke SKPD untuk diisi ulang.
--   * Tim pelaksana per SKPD per tahun (`inventarisasi_tim`).
--
-- POSISI & KUNCI (keputusan user 2026-09-23, butir 2):
--   Posisi barang = (SKPD, jenis aset, masih aktif). Barang yang sesudah
--   diinventarisasi PINDAH SKPD, DIREKLAS ke jenis aset lain, atau KELUAR dari
--   register (dihapus, diserap induk, dipecah, digabung) → hasil inventarisasi
--   di posisi lama TERKUNCI: tak bisa diubah, divalidasi, maupun dibatalkan
--   validasinya. Di posisi baru ia tampil "belum diinventarisasi" (SKPD baru
--   WAJIB menginventarisasi ulang). Kuncinya SELF-HEALING: begitu barangnya
--   kembali ke posisi semula (mis. pengalihannya dibatalkan), terbuka lagi —
--   pola sama dgn `fn_aset_awal_2026_terkunci` (20260916_01): yang diperiksa
--   KEADAAN, bukan riwayat.
--   ⚠️ Reklas JENIS aset ikut mengunci (bukan cuma pindah SKPD): lembar kerja
--   memang per jenis aset & format LKI-nya beda per jenis (III.A.1–III.A.6),
--   jadi isian format Peralatan & Mesin tak bisa dibaca sebagai isian Aset
--   Lain-Lain. Reklas KODE dalam jenis yang sama TIDAK mengunci — cukup notif.
--
-- NOTIFIKASI "ada transaksi sesudah diinventarisasi": `trx_id_terakhir` =
--   id baris ledger TERAKHIR aset saat isian terakhir disimpan. Baris sesudahnya
--   dibaca lewat `fn_baris_berlaku_sesudah` — algoritma `fn_baris_penghalang_batal`
--   (20260917_01/02) yang dipecah di sini supaya mengembalikan SEMUA baris, bukan
--   cuma yang pertama; ia SUDAH membuang pasangan yang saling meniadakan (reklas
--   lalu batal reklas, dst.).
--   Patokannya ID, bukan tanggal — transaksi yang dicatat mundur tetap
--   tertangkap. `saldo_awal`/`saldo_awal_checkpoint` dikecualikan: itu baris
--   sistem (Tutup Tahun menulis checkpoint ke SETIAP aset aktif).
--
-- SIFAT tetap NON-LEDGER: modul ini tak pernah menulis `transaksi_bmd` maupun
-- mengubah `aset`. Tindak lanjut temuan tetap lewat menu masing-masing.
--
-- SATU PINTU TULIS: `inventarisasi_barang` TANPA policy tulis & GRANT tulis
-- dicabut — seluruh perubahan lewat RPC SECURITY DEFINER di bawah, supaya
-- snapshot "sebelum" & baseline notifikasi diisi SERVER, tak bisa dikarang
-- klien, dan status tak bisa diloncati.
--
-- Jalankan di Supabase SQL Editor. Tak butuh deploy-ordering khusus dgn
-- migrasi lain; tapi WAJIB jalan SEBELUM deploy kode (halaman baru memanggil
-- RPC & tabel di sini).
-- ============================================================================

-- ── 1. Tabel tim pelaksana (per SKPD × tahun) ───────────────────────────────
CREATE TABLE IF NOT EXISTS inventarisasi_tim (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skpd_id    bigint NOT NULL REFERENCES admin_skpd(id),
  tahun      int    NOT NULL,
  -- [{pegawai_id, nama, nip, jabatan}] — di-SNAPSHOT dari admin_pegawai supaya
  -- lembar yang sudah dicetak tetap sesuai walau data pegawai berubah.
  petugas    jsonb  NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skpd_id, tahun)
);

DROP TRIGGER IF EXISTS trg_inventarisasi_tim_updated ON inventarisasi_tim;
CREATE TRIGGER trg_inventarisasi_tim_updated BEFORE UPDATE ON inventarisasi_tim
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE inventarisasi_tim ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventarisasi_tim_select ON inventarisasi_tim;
CREATE POLICY inventarisasi_tim_select ON inventarisasi_tim FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS inventarisasi_tim_insert ON inventarisasi_tim;
CREATE POLICY inventarisasi_tim_insert ON inventarisasi_tim FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));
DROP POLICY IF EXISTS inventarisasi_tim_update ON inventarisasi_tim;
CREATE POLICY inventarisasi_tim_update ON inventarisasi_tim FOR UPDATE TO authenticated
  USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))
  WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id));
GRANT SELECT, INSERT, UPDATE ON inventarisasi_tim TO authenticated;

-- ── 2. Tabel hasil inventarisasi — SATU BARIS PER BARANG ────────────────────
CREATE TABLE IF NOT EXISTS inventarisasi_barang (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun             int    NOT NULL,
  -- POSISI saat diinventarisasi — dasar kunci (lihat kepala berkas).
  skpd_id           bigint NOT NULL REFERENCES admin_skpd(id),
  golongan          text   NOT NULL,
  -- NULL = "BMD Belum Tercatat" (Format III.A.7).
  aset_id           uuid REFERENCES aset(id),
  snapshot          jsonb  NOT NULL DEFAULT '{}'::jsonb,
  jawaban           jsonb  NOT NULL DEFAULT '{}'::jsonb,
  foto_paths        text[] NOT NULL DEFAULT '{}',
  trx_id_terakhir   bigint,
  status            text   NOT NULL DEFAULT 'diisi' CHECK (status IN ('diisi', 'divalidasi')),
  -- Diisi saat Batal Validasi — satu-satunya keterangan yang sampai ke SKPD.
  catatan_validator text,
  diisi_at          timestamptz NOT NULL DEFAULT now(),
  diisi_by          uuid DEFAULT auth.uid(),
  divalidasi_at     timestamptz,
  divalidasi_by     uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- SATU isian per barang per posisi per tahun. Posisi IKUT kunci: SKPD baru yang
-- menerima barang wajib menginventarisasinya lagi, sementara isian SKPD lama
-- tetap utuh sebagai riwayat (keputusan user butir 2).
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_barang_posisi
  ON inventarisasi_barang (aset_id, tahun, skpd_id, golongan) WHERE aset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_barang_lingkup
  ON inventarisasi_barang (tahun, golongan, skpd_id, status);

DROP TRIGGER IF EXISTS trg_inventarisasi_barang_updated ON inventarisasi_barang;
CREATE TRIGGER trg_inventarisasi_barang_updated BEFORE UPDATE ON inventarisasi_barang
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE inventarisasi_barang ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventarisasi_barang_select ON inventarisasi_barang;
CREATE POLICY inventarisasi_barang_select ON inventarisasi_barang FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id));
-- Tak ada policy INSERT/UPDATE/DELETE — satu pintu lewat RPC.
REVOKE INSERT, UPDATE, DELETE ON inventarisasi_barang FROM authenticated, anon;
GRANT SELECT ON inventarisasi_barang TO authenticated;

-- ── 3. Pindahkan isian model lama (kalau ada) lalu buang model lama ─────────
-- Per 2026-09-23 kedua tabel lama KOSONG (diperiksa ke produksi). Langkah ini
-- tetap ditulis supaya isian yang sempat masuk sebelum migrasi dijalankan tidak
-- ikut terbuang. Baris yang BELUM PERNAH diisi (jawaban kosong) sengaja tidak
-- dipindah: di model baru "belum diinventarisasi" = tak punya baris.
DO $$
BEGIN
  IF to_regclass('public.inventarisasi_baris') IS NOT NULL
     AND to_regclass('public.inventarisasi') IS NOT NULL THEN
    INSERT INTO inventarisasi_tim (skpd_id, tahun, petugas)
    SELECT DISTINCT ON (h.skpd_id, h.tahun) h.skpd_id, h.tahun, h.petugas
    FROM inventarisasi h
    WHERE jsonb_array_length(h.petugas) > 0
    ORDER BY h.skpd_id, h.tahun, h.updated_at DESC
    ON CONFLICT (skpd_id, tahun) DO NOTHING;

    INSERT INTO inventarisasi_barang
      (tahun, skpd_id, golongan, aset_id, snapshot, jawaban, foto_paths, trx_id_terakhir,
       status, catatan_validator, diisi_at, divalidasi_at, divalidasi_by, created_at)
    SELECT h.tahun, h.skpd_id, h.golongan, b.aset_id, b.snapshot, b.jawaban, b.foto_paths,
           (SELECT max(t.id) FROM transaksi_bmd t WHERE t.aset_id = b.aset_id),
           CASE WHEN h.status = 'divalidasi' THEN 'divalidasi' ELSE 'diisi' END,
           h.catatan_validator, b.updated_at, h.divalidasi_at, h.divalidasi_by, b.created_at
    FROM inventarisasi_baris b
    JOIN inventarisasi h ON h.id = b.inventarisasi_id
    WHERE b.jawaban <> '{}'::jsonb
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DROP FUNCTION IF EXISTS fn_validasi_inventarisasi(uuid, text);
DROP FUNCTION IF EXISTS fn_kembalikan_inventarisasi(uuid, text);
DROP FUNCTION IF EXISTS fn_is_pengurus_barang_skpd_induk(bigint);
DROP TABLE IF EXISTS inventarisasi_baris;
DROP TABLE IF EXISTS inventarisasi;

-- ── 4. Helper internal ──────────────────────────────────────────────────────
-- Posisi barang sekarang dibanding posisi saat diinventarisasi.
-- NULL = masih di posisi yang sama (atau BMD Belum Tercatat).
-- 'keluar' | 'pindah_skpd' | 'reklas' = terkunci.
CREATE OR REPLACE FUNCTION fn_inventarisasi_posisi(p_aset_id uuid, p_skpd_id bigint, p_golongan text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_aset_id IS NULL THEN NULL
    WHEN a.id IS NULL OR a.status <> 'aktif' THEN 'keluar'
    WHEN a.skpd_id IS DISTINCT FROM p_skpd_id THEN 'pindah_skpd'
    WHEN a.golongan IS DISTINCT FROM p_golongan THEN 'reklas'
  END
  FROM (SELECT 1) d LEFT JOIN aset a ON a.id = p_aset_id
$$;

-- Kondisi "SEBELUM inventarisasi" — dibangun SERVER dari `aset`, bukan dikirim
-- klien. Kunci-kuncinya KEMBAR dgn tipe `InvSnapshot` (lib/inventarisasi.ts).
CREATE OR REPLACE FUNCTION fn_inventarisasi_snapshot(p_aset_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nibar', a.nibar, 'kode_register', a.kode_register, 'kode', a.kode,
    'uraian_barang', COALESCE(k.uraian, a.uraian_barang),
    'nama_barang', a.nama_barang, 'spesifikasi_lainnya', a.spesifikasi_lainnya,
    'merek_tipe', a.merek_tipe, 'jumlah', a.jumlah, 'satuan', a.satuan,
    'nilai_perolehan', a.nilai_perolehan, 'alamat', a.alamat_detail,
    'kondisi', a.kondisi_barang, 'tgl_perolehan', a.tgl_perolehan,
    'no_polisi', a.no_polisi, 'no_rangka', a.no_rangka, 'no_mesin', a.no_mesin,
    'skpd_id', a.skpd_id)
  FROM aset a LEFT JOIN admin_kodefikasi_bmd k ON k.kode = a.kode
  WHERE a.id = p_aset_id
$$;

-- ── Transaksi yang MASIH BERLAKU sesudah sebuah baseline ─────────────────────
-- ⚠️ `fn_baris_penghalang_batal` (20260917_01/02) mengembalikan HANYA BARIS
-- PERTAMA (`LIMIT 1`) — cukup untuk guard ("adakah penghalang?"), tapi
-- notifikasi inventarisasi butuh SELURUH daftarnya. Ketahuan saat diuji ke
-- produksi: baseline 0 → baris pertamanya `saldo_awal`, yang lalu disaring,
-- jadi notifikasinya KOSONG untuk barang yang jelas-jelas sudah direklas &
-- dipindah SKPD — tanpa satu pun error.
-- Obatnya BUKAN menyalin algoritmanya (salinan ketiga yang bisa menyimpang —
-- versi TS `barisMasihBerlaku` & versi SQL ini sudah dua), melainkan MEMECAH:
-- badan fungsi lama pindah UTUH ke `fn_baris_berlaku_sesudah` (tanpa LIMIT),
-- dan `fn_baris_penghalang_batal` tinggal mengambil baris pertamanya. Hasil
-- fungsi lama identik — dibuktikan ke produksi sebelum ditulis (lihat
-- verifikasi di kaki berkas).
CREATE OR REPLACE FUNCTION fn_baris_berlaku_sesudah(p_aset_id uuid, p_trx_id_batas bigint)
RETURNS TABLE(id bigint, jenis text, periode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH baris AS (
    SELECT t.id, t.jenis::text AS jenis, t.periode::text AS periode, t.payload
    FROM transaksi_bmd t
    WHERE t.aset_id = p_aset_id AND t.id > p_trx_id_batas
  ),
  -- (a) pasangan ber-target_trx_id/target_trx_ids
  target_batal_tunggal AS (
    SELECT b.id AS batal_id, (b.payload->>'target_trx_id')::bigint AS target_id
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload->>'target_trx_id' ~ '^[0-9]+$'
  ),
  target_batal_jamak_src AS (
    SELECT b.id AS batal_id, b.payload
    FROM baris b
    WHERE b.jenis LIKE 'batal_%' AND b.payload ? 'target_trx_ids'
  ),
  target_batal_jamak AS (
    SELECT s.batal_id, (te.val)::bigint AS target_id
    FROM target_batal_jamak_src s, jsonb_array_elements_text(s.payload->'target_trx_ids') AS te(val)
    WHERE te.val ~ '^[0-9]+$'
  ),
  target_semua AS (
    SELECT batal_id, target_id FROM target_batal_tunggal
    UNION ALL
    SELECT batal_id, target_id FROM target_batal_jamak
  ),
  pasangan_utuh AS (
    SELECT ts.batal_id
    FROM target_semua ts
    GROUP BY ts.batal_id
    HAVING bool_and(EXISTS (SELECT 1 FROM baris bb WHERE bb.id = ts.target_id))
  ),
  netral_a AS (
    SELECT batal_id AS id FROM pasangan_utuh
    UNION
    SELECT ts.target_id FROM target_semua ts JOIN pasangan_utuh pu ON pu.batal_id = ts.batal_id
  ),
  -- (b) sisi ANAK kapitalisasi: kapitalisasi_serap <-> batal_kapitalisasi TANPA target
  serap AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis = 'kapitalisasi_serap'
       OR (b.jenis = 'batal_kapitalisasi'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_b AS (
    SELECT s.id FROM serap s
    WHERE s.total >= 2
      AND EXISTS (SELECT 1 FROM serap x WHERE x.urut = 1 AND x.jenis = 'kapitalisasi_serap')
      AND EXISTS (SELECT 1 FROM serap y WHERE y.urut = s.total AND y.jenis = 'batal_kapitalisasi')
  ),
  -- (c) penghapusan <-> batal_penghapusan TANPA target
  hapus AS (
    SELECT b.id, b.jenis, b.periode,
           row_number() OVER (ORDER BY b.periode, b.id) AS urut,
           count(*) OVER () AS total
    FROM baris b
    WHERE b.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain')
       OR (b.jenis = 'batal_penghapusan'
           AND NOT (b.payload ? 'target_trx_id') AND NOT (b.payload ? 'target_trx_ids'))
  ),
  netral_c AS (
    SELECT h.id FROM hapus h
    WHERE h.total >= 2
      AND EXISTS (SELECT 1 FROM hapus x WHERE x.urut = 1 AND x.jenis IN ('penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'))
      AND EXISTS (SELECT 1 FROM hapus y WHERE y.urut = h.total AND y.jenis = 'batal_penghapusan')
  )
  SELECT b.id, b.jenis, b.periode
  FROM baris b
  WHERE b.id NOT IN (SELECT id FROM netral_a UNION SELECT id FROM netral_b UNION SELECT id FROM netral_c)
  ORDER BY b.id ASC
$$;
REVOKE ALL ON FUNCTION fn_baris_berlaku_sesudah(uuid, bigint) FROM public, anon, authenticated;

-- Tanda tangan & RETURNS TABLE tak berubah → CREATE OR REPLACE aman, ACL-nya
-- dipertahankan Postgres. `SET search_path` WAJIB ditulis ulang (CREATE OR
-- REPLACE menghapus setelan yang tak disebut — aturan CLAUDE.md).
CREATE OR REPLACE FUNCTION fn_baris_penghalang_batal(p_aset_id uuid, p_trx_id_batas bigint)
RETURNS TABLE(id bigint, jenis text, periode text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.jenis, b.periode
  FROM fn_baris_berlaku_sesudah(p_aset_id, p_trx_id_batas) b
  ORDER BY b.id ASC
  LIMIT 1
$$;

-- Transaksi yang MASIH BERLAKU sesudah baseline — dasar notifikasi.
CREATE OR REPLACE FUNCTION fn_inventarisasi_transaksi_sesudah(p_aset_id uuid, p_trx_id_batas bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('jenis', pb.jenis, 'periode', pb.periode) ORDER BY pb.id), '[]'::jsonb)
  FROM fn_baris_berlaku_sesudah(p_aset_id, COALESCE(p_trx_id_batas, 0)) pb
  WHERE p_aset_id IS NOT NULL
    AND pb.jenis NOT IN ('saldo_awal', 'saldo_awal_checkpoint')
$$;

REVOKE ALL ON FUNCTION fn_inventarisasi_posisi(uuid, bigint, text) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_snapshot(uuid) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_transaksi_sesudah(uuid, bigint) FROM public;

-- ── 5. RPC: simpan isian (SKPD) ─────────────────────────────────────────────
-- Satu fungsi untuk dua bentuk:
--   p_aset_id berisi  → barang tercatat. Posisi DIAMBIL DARI `aset`, bukan dari
--                       parameter; p_golongan cuma pengecek bahwa isian datang
--                       dari lembar kerja jenis aset yang benar.
--   p_aset_id NULL    → BMD Belum Tercatat (III.A.7) milik p_skpd_id/p_golongan;
--                       p_id berisi = menyunting baris yang sudah ada.
-- Tiap simpan MENYEGARKAN snapshot & baseline notifikasi: isian terbaru adalah
-- pernyataan SKPD atas keadaan barang PADA SAAT ITU.
CREATE OR REPLACE FUNCTION fn_inventarisasi_simpan(
  p_id uuid, p_aset_id uuid, p_skpd_id bigint, p_golongan text,
  p_jawaban jsonb, p_foto text[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tahun int := extract(year FROM current_date)::int;
  v_a     aset%ROWTYPE;
  v_r     inventarisasi_barang%ROWTYPE;
  v_id    uuid;
BEGIN
  IF p_jawaban IS NULL OR jsonb_typeof(p_jawaban) <> 'object' THEN
    RAISE EXCEPTION 'Isian lembar kerja tidak sah.';
  END IF;

  IF p_aset_id IS NOT NULL THEN
    SELECT * INTO v_a FROM aset WHERE id = p_aset_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Barang tidak ditemukan.'; END IF;
    IF NOT (fn_is_admin() OR fn_skpd_visible(v_a.skpd_id)) THEN
      RAISE EXCEPTION 'Anda tidak berwenang menginventarisasi barang SKPD ini.';
    END IF;
    IF v_a.status <> 'aktif' THEN
      RAISE EXCEPTION 'Barang ini sudah tidak aktif di Daftar Barang — tidak bisa diinventarisasi.';
    END IF;
    IF v_a.golongan IS DISTINCT FROM p_golongan THEN
      RAISE EXCEPTION 'Barang ini berjenis aset % — isi lewat lembar kerja jenis aset itu.', v_a.golongan;
    END IF;

    SELECT * INTO v_r FROM inventarisasi_barang
    WHERE aset_id = p_aset_id AND tahun = v_tahun
      AND skpd_id = v_a.skpd_id AND golongan = v_a.golongan
    FOR UPDATE;

    IF FOUND THEN
      IF v_r.status = 'divalidasi' THEN
        RAISE EXCEPTION 'Isian barang ini sudah divalidasi Pengelola Barang — minta Pengelola membatalkan validasinya dulu.';
      END IF;
      UPDATE inventarisasi_barang
      SET jawaban = p_jawaban, foto_paths = COALESCE(p_foto, '{}'),
          snapshot = fn_inventarisasi_snapshot(p_aset_id),
          trx_id_terakhir = (SELECT max(t.id) FROM transaksi_bmd t WHERE t.aset_id = p_aset_id),
          diisi_at = now(), diisi_by = auth.uid()
      WHERE id = v_r.id;
      RETURN v_r.id;
    END IF;

    INSERT INTO inventarisasi_barang
      (tahun, skpd_id, golongan, aset_id, snapshot, jawaban, foto_paths, trx_id_terakhir)
    VALUES
      (v_tahun, v_a.skpd_id, v_a.golongan, p_aset_id, fn_inventarisasi_snapshot(p_aset_id),
       p_jawaban, COALESCE(p_foto, '{}'),
       (SELECT max(t.id) FROM transaksi_bmd t WHERE t.aset_id = p_aset_id))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- ── BMD Belum Tercatat ──
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_r FROM inventarisasi_barang WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_r.aset_id IS NOT NULL THEN
      RAISE EXCEPTION 'Lembar "BMD Belum Tercatat" tidak ditemukan.';
    END IF;
    IF NOT (fn_is_admin() OR fn_skpd_visible(v_r.skpd_id)) THEN
      RAISE EXCEPTION 'Anda tidak berwenang mengubah lembar ini.';
    END IF;
    IF v_r.status = 'divalidasi' THEN
      RAISE EXCEPTION 'Lembar ini sudah divalidasi Pengelola Barang — minta Pengelola membatalkan validasinya dulu.';
    END IF;
    UPDATE inventarisasi_barang
    SET jawaban = p_jawaban, foto_paths = COALESCE(p_foto, '{}'),
        diisi_at = now(), diisi_by = auth.uid()
    WHERE id = p_id;
    RETURN p_id;
  END IF;

  IF p_skpd_id IS NULL OR p_golongan IS NULL OR p_golongan = '' THEN
    RAISE EXCEPTION 'SKPD dan jenis aset wajib untuk BMD Belum Tercatat.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_skpd WHERE id = p_skpd_id) THEN
    RAISE EXCEPTION 'SKPD tidak dikenal.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(p_skpd_id)) THEN
    RAISE EXCEPTION 'Anda tidak berwenang menginventarisasi untuk SKPD ini.';
  END IF;
  INSERT INTO inventarisasi_barang (tahun, skpd_id, golongan, aset_id, jawaban, foto_paths)
  VALUES (v_tahun, p_skpd_id, p_golongan, NULL, p_jawaban, COALESCE(p_foto, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Hapus lembar BMD Belum Tercatat (selama belum divalidasi). Isian barang
-- tercatat tidak dihapus — cukup disunting.
CREATE OR REPLACE FUNCTION fn_inventarisasi_hapus_belum_tercatat(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r inventarisasi_barang%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM inventarisasi_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_r.aset_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hanya lembar "BMD Belum Tercatat" yang bisa dihapus.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_r.skpd_id)) THEN
    RAISE EXCEPTION 'Anda tidak berwenang menghapus lembar ini.';
  END IF;
  IF v_r.status = 'divalidasi' THEN
    RAISE EXCEPTION 'Lembar ini sudah divalidasi — minta Pengelola membatalkan validasinya dulu.';
  END IF;
  DELETE FROM inventarisasi_barang WHERE id = p_id;
END $$;

-- ── 6. RPC: validasi & batal validasi (PENGELOLA BARANG = admin) ────────────
-- Batch: barang yang tak memenuhi syarat (sudah divalidasi / posisinya berubah
-- / tak ketemu) DILEWATI & dihitung, bukan menggagalkan seluruh panggilan.
CREATE OR REPLACE FUNCTION fn_inventarisasi_validasi(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok int := 0;
  r    inventarisasi_barang%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya Pengelola Barang yang boleh memvalidasi inventarisasi.';
  END IF;
  FOR r IN SELECT * FROM inventarisasi_barang WHERE id = ANY(p_ids) FOR UPDATE LOOP
    IF r.status <> 'diisi' OR fn_inventarisasi_posisi(r.aset_id, r.skpd_id, r.golongan) IS NOT NULL THEN
      CONTINUE;
    END IF;
    UPDATE inventarisasi_barang
    SET status = 'divalidasi', divalidasi_at = now(), divalidasi_by = auth.uid(),
        catatan_validator = NULL
    WHERE id = r.id;
    v_ok := v_ok + 1;
  END LOOP;
  RETURN jsonb_build_object('divalidasi', v_ok, 'dilewati', COALESCE(cardinality(p_ids), 0) - v_ok);
END $$;

CREATE OR REPLACE FUNCTION fn_inventarisasi_batal_validasi(p_id uuid, p_catatan text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r inventarisasi_barang%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya Pengelola Barang yang boleh membatalkan validasi.';
  END IF;
  SELECT * INTO v_r FROM inventarisasi_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hasil inventarisasi tidak ditemukan.'; END IF;
  IF v_r.status <> 'divalidasi' THEN
    RAISE EXCEPTION 'Barang ini belum divalidasi.';
  END IF;
  IF fn_inventarisasi_posisi(v_r.aset_id, v_r.skpd_id, v_r.golongan) IS NOT NULL THEN
    RAISE EXCEPTION 'Barang ini sudah berpindah/keluar sejak diinventarisasi — hasilnya terkunci. Validasinya baru bisa dibatalkan kalau barangnya kembali ke posisi semula.';
  END IF;
  UPDATE inventarisasi_barang
  SET status = 'diisi', divalidasi_at = NULL, divalidasi_by = NULL,
      catatan_validator = NULLIF(btrim(p_catatan), '')
  WHERE id = p_id;
END $$;

-- ── 7. RPC baca: Lembar Kerja (register HIDUP + status inventarisasinya) ────
-- p_status: NULL/'semua' | 'belum' | 'diisi' | 'divalidasi' | 'sudah'.
-- Dua cabang, SENGAJA: 'belum'/'semua' digerakkan dari `aset` (urutan register,
-- dilayani idx_aset_gol_urut / idx_aset_skpd_urut), 'diisi'/'divalidasi'/'sudah'
-- digerakkan dari `inventarisasi_barang` — kalau dua-duanya dari `aset`, filter
-- "sudah diisi" pada 661rb baris P&M dengan sedikit isian akan menyapu seluruh
-- register untuk mengisi satu halaman.
CREATE OR REPLACE FUNCTION fn_inventarisasi_lembar(
  p_golongan text, p_skpd_ids bigint[] DEFAULT NULL, p_status text DEFAULT NULL,
  p_cari text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(
  aset_id uuid, nibar text, kode_register text, kode text, uraian text, nama_barang text,
  spesifikasi_lainnya text, merek_tipe text, jumlah numeric, satuan text,
  nilai_perolehan numeric, tgl_perolehan date, kondisi_barang text, alamat_detail text,
  no_polisi text, no_rangka text, no_mesin text, skpd_id bigint, skpd_nama text,
  inv_id uuid, inv_status text, inv_catatan text, inv_diisi_at timestamptz,
  transaksi_sesudah jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_tahun int := extract(year FROM current_date)::int;
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[];
  v_pola text;
BEGIN
  IF p_golongan IS NULL OR p_golongan = '' THEN
    RAISE EXCEPTION 'Jenis aset wajib dipilih.';
  END IF;
  IF NOT v_lihat_semua THEN
    v_scope := COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]);
  END IF;
  IF p_skpd_ids IS NOT NULL AND cardinality(p_skpd_ids) = 0 THEN p_skpd_ids := NULL; END IF;
  IF p_cari IS NOT NULL AND btrim(p_cari) <> '' THEN
    v_pola := '%' || replace(replace(replace(btrim(p_cari), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  IF p_status IN ('diisi', 'divalidasi', 'sudah') THEN
    RETURN QUERY
    WITH hal AS (
      SELECT a.id, a.nibar, a.kode_register, a.kode, a.uraian_barang, a.nama_barang,
             a.spesifikasi_lainnya, a.merek_tipe, a.jumlah, a.satuan, a.nilai_perolehan,
             a.tgl_perolehan, a.kondisi_barang, a.alamat_detail, a.no_polisi, a.no_rangka,
             a.no_mesin, a.skpd_id,
             ib.id AS ib_id, ib.status AS ib_status, ib.catatan_validator AS ib_catatan,
             ib.diisi_at AS ib_diisi_at, ib.trx_id_terakhir AS ib_trx
      FROM inventarisasi_barang ib
      JOIN aset a ON a.id = ib.aset_id
      WHERE ib.tahun = v_tahun AND ib.golongan = p_golongan AND ib.aset_id IS NOT NULL
        AND (p_status = 'sudah' OR ib.status = p_status)
        AND a.status = 'aktif' AND a.skpd_id = ib.skpd_id AND a.golongan = ib.golongan
        AND (p_skpd_ids IS NULL OR ib.skpd_id = ANY(p_skpd_ids))
        AND (v_lihat_semua OR ib.skpd_id = ANY(v_scope))
        AND (v_pola IS NULL OR fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register,
               a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail,
               a.wilayah_kode, a.keterangan) ILIKE v_pola)
      ORDER BY a.kode, a.nilai_perolehan DESC, a.id
      LIMIT p_limit OFFSET p_offset
    )
    SELECT h.id, h.nibar, h.kode_register, h.kode, COALESCE(k.uraian, h.uraian_barang),
           h.nama_barang, h.spesifikasi_lainnya, h.merek_tipe, h.jumlah, h.satuan,
           h.nilai_perolehan, h.tgl_perolehan, h.kondisi_barang, h.alamat_detail,
           h.no_polisi, h.no_rangka, h.no_mesin, h.skpd_id, s.nama,
           h.ib_id, h.ib_status, h.ib_catatan, h.ib_diisi_at,
           fn_inventarisasi_transaksi_sesudah(h.id, h.ib_trx)
    FROM hal h
    LEFT JOIN admin_kodefikasi_bmd k ON k.kode = h.kode
    LEFT JOIN admin_skpd s ON s.id = h.skpd_id
    ORDER BY h.kode, h.nilai_perolehan DESC, h.id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH hal AS (
    SELECT a.id, a.nibar, a.kode_register, a.kode, a.uraian_barang, a.nama_barang,
           a.spesifikasi_lainnya, a.merek_tipe, a.jumlah, a.satuan, a.nilai_perolehan,
           a.tgl_perolehan, a.kondisi_barang, a.alamat_detail, a.no_polisi, a.no_rangka,
           a.no_mesin, a.skpd_id,
           ib.id AS ib_id, ib.status AS ib_status, ib.catatan_validator AS ib_catatan,
           ib.diisi_at AS ib_diisi_at, ib.trx_id_terakhir AS ib_trx
    FROM aset a
    LEFT JOIN inventarisasi_barang ib
      ON ib.aset_id = a.id AND ib.tahun = v_tahun
     AND ib.skpd_id = a.skpd_id AND ib.golongan = a.golongan
    WHERE a.status <> 'draft' AND a.status = 'aktif' AND a.golongan = p_golongan
      AND (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
      AND (v_lihat_semua OR a.skpd_id = ANY(v_scope))
      AND (p_status IS DISTINCT FROM 'belum' OR ib.id IS NULL)
      AND (v_pola IS NULL OR fn_aset_teks_cari(a.nama_barang, a.kode, a.nibar, a.kode_register,
             a.merek_tipe, a.no_polisi, a.no_rangka, a.no_mesin, a.alamat_detail,
             a.wilayah_kode, a.keterangan) ILIKE v_pola)
    ORDER BY a.kode, a.nilai_perolehan DESC, a.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT h.id, h.nibar, h.kode_register, h.kode, COALESCE(k.uraian, h.uraian_barang),
         h.nama_barang, h.spesifikasi_lainnya, h.merek_tipe, h.jumlah, h.satuan,
         h.nilai_perolehan, h.tgl_perolehan, h.kondisi_barang, h.alamat_detail,
         h.no_polisi, h.no_rangka, h.no_mesin, h.skpd_id, s.nama,
         h.ib_id, h.ib_status, h.ib_catatan, h.ib_diisi_at,
         CASE WHEN h.ib_id IS NULL THEN '[]'::jsonb
              ELSE fn_inventarisasi_transaksi_sesudah(h.id, h.ib_trx) END
  FROM hal h
  LEFT JOIN admin_kodefikasi_bmd k ON k.kode = h.kode
  LEFT JOIN admin_skpd s ON s.id = h.skpd_id
  ORDER BY h.kode, h.nilai_perolehan DESC, h.id;
END $$;

-- ── 8. RPC baca: Hasil inventarisasi (menu Validasi) ────────────────────────
-- Digerakkan dari `inventarisasi_barang`, BUKAN dari register hidup — barang
-- yang sudah pindah/keluar hilang dari register aktif, padahal justru itulah
-- yang paling butuh keterangan "ada transaksi apa sesudahnya".
-- p_filter: 'menunggu' | 'divalidasi' | 'berubah' | 'semua'. Tiga yang pertama
-- SALING LEPAS: yang posisinya berubah hanya masuk 'berubah' apa pun statusnya,
-- supaya jumlah ketiganya menjumlah pas ke seluruh isian (dipakai ringkasan).
CREATE OR REPLACE FUNCTION fn_inventarisasi_hasil(
  p_tahun int, p_golongan text, p_skpd_ids bigint[] DEFAULT NULL,
  p_filter text DEFAULT 'menunggu', p_cari text DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(
  id uuid, tahun int, skpd_id bigint, skpd_nama text, golongan text, aset_id uuid,
  snapshot jsonb, jawaban jsonb, foto_paths text[], status text, catatan_validator text,
  diisi_at timestamptz, divalidasi_at timestamptz,
  posisi text, posisi_skpd_nama text, posisi_golongan text,
  transaksi_sesudah jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[];
  v_pola text;
BEGIN
  IF p_golongan IS NULL OR p_golongan = '' THEN
    RAISE EXCEPTION 'Jenis aset wajib dipilih.';
  END IF;
  IF NOT v_lihat_semua THEN
    v_scope := COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]);
  END IF;
  IF p_skpd_ids IS NOT NULL AND cardinality(p_skpd_ids) = 0 THEN p_skpd_ids := NULL; END IF;
  IF p_cari IS NOT NULL AND btrim(p_cari) <> '' THEN
    v_pola := '%' || replace(replace(replace(btrim(p_cari), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH dasar AS (
    SELECT ib.*, a.skpd_id AS a_skpd, a.golongan AS a_gol,
           CASE
             WHEN ib.aset_id IS NULL THEN NULL
             WHEN a.id IS NULL OR a.status <> 'aktif' THEN 'keluar'
             WHEN a.skpd_id IS DISTINCT FROM ib.skpd_id THEN 'pindah_skpd'
             WHEN a.golongan IS DISTINCT FROM ib.golongan THEN 'reklas'
           END AS pos
    FROM inventarisasi_barang ib
    LEFT JOIN aset a ON a.id = ib.aset_id
    WHERE ib.tahun = p_tahun AND ib.golongan = p_golongan
      AND (p_skpd_ids IS NULL OR ib.skpd_id = ANY(p_skpd_ids))
      AND (v_lihat_semua OR ib.skpd_id = ANY(v_scope))
      AND (v_pola IS NULL
           OR concat_ws(E'\x1f', ib.snapshot->>'nibar', ib.snapshot->>'kode', ib.snapshot->>'uraian_barang',
                        ib.snapshot->>'nama_barang', ib.snapshot->>'kode_register',
                        ib.jawaban->'baru'->>'nama_barang', ib.jawaban->'baru'->>'spesifikasi',
                        ib.jawaban->'baru'->>'kode_barang') ILIKE v_pola)
  ),
  hal AS (
    SELECT d.* FROM dasar d
    WHERE CASE COALESCE(p_filter, 'semua')
            WHEN 'menunggu'   THEN d.status = 'diisi' AND d.pos IS NULL
            WHEN 'divalidasi' THEN d.status = 'divalidasi' AND d.pos IS NULL
            WHEN 'berubah'    THEN d.pos IS NOT NULL
            ELSE true
          END
    ORDER BY d.skpd_id, COALESCE(d.snapshot->>'kode', d.jawaban->'baru'->>'kode_barang', ''), d.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT h.id, h.tahun, h.skpd_id, s.nama, h.golongan, h.aset_id,
         h.snapshot, h.jawaban, h.foto_paths, h.status, h.catatan_validator,
         h.diisi_at, h.divalidasi_at,
         h.pos,
         CASE WHEN h.pos = 'pindah_skpd' THEN s2.nama END,
         CASE WHEN h.pos = 'reklas' THEN h.a_gol END,
         CASE WHEN h.aset_id IS NULL THEN '[]'::jsonb
              ELSE fn_inventarisasi_transaksi_sesudah(h.aset_id, h.trx_id_terakhir) END
  FROM hal h
  LEFT JOIN admin_skpd s  ON s.id = h.skpd_id
  LEFT JOIN admin_skpd s2 ON s2.id = h.a_skpd
  ORDER BY h.skpd_id, COALESCE(h.snapshot->>'kode', h.jawaban->'baru'->>'kode_barang', ''), h.id;
END $$;

-- ── 9. RPC baca: ringkasan hitungan (dipanggil di LATAR — boleh gagal) ──────
-- Jumlah barang aktif di register dibaca POSISI TERKINI; hitungan isian dibaca
-- untuk p_tahun. Gagal/timeout di sini cuma membuat angka ringkasan "tak
-- terhitung" di layar — daftarnya tetap tampil (pola 2026-09-22).
CREATE OR REPLACE FUNCTION fn_inventarisasi_ringkas(
  p_tahun int, p_golongan text, p_skpd_ids bigint[] DEFAULT NULL)
RETURNS TABLE(total_aset bigint, menunggu bigint, divalidasi bigint, berubah bigint, belum_tercatat bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_lihat_semua boolean := fn_is_admin() OR fn_is_viewer();
  v_scope bigint[];
BEGIN
  IF NOT v_lihat_semua THEN
    v_scope := COALESCE(fn_my_skpd_scope(), ARRAY[]::bigint[]);
  END IF;
  IF p_skpd_ids IS NOT NULL AND cardinality(p_skpd_ids) = 0 THEN p_skpd_ids := NULL; END IF;

  RETURN QUERY
  WITH ib AS (
    SELECT i.status, i.aset_id,
           CASE
             WHEN i.aset_id IS NULL THEN NULL
             WHEN a.id IS NULL OR a.status <> 'aktif' THEN 'keluar'
             WHEN a.skpd_id IS DISTINCT FROM i.skpd_id THEN 'pindah_skpd'
             WHEN a.golongan IS DISTINCT FROM i.golongan THEN 'reklas'
           END AS pos
    FROM inventarisasi_barang i
    LEFT JOIN aset a ON a.id = i.aset_id
    WHERE i.tahun = p_tahun AND i.golongan = p_golongan
      AND (p_skpd_ids IS NULL OR i.skpd_id = ANY(p_skpd_ids))
      AND (v_lihat_semua OR i.skpd_id = ANY(v_scope))
  )
  SELECT
    (SELECT count(*) FROM aset a
      WHERE a.status = 'aktif' AND a.golongan = p_golongan
        AND (p_skpd_ids IS NULL OR a.skpd_id = ANY(p_skpd_ids))
        AND (v_lihat_semua OR a.skpd_id = ANY(v_scope))),
    (SELECT count(*) FROM ib WHERE ib.status = 'diisi' AND ib.pos IS NULL),
    (SELECT count(*) FROM ib WHERE ib.status = 'divalidasi' AND ib.pos IS NULL),
    (SELECT count(*) FROM ib WHERE ib.pos IS NOT NULL),
    (SELECT count(*) FROM ib WHERE ib.aset_id IS NULL);
END $$;

-- ── 10. Hak eksekusi ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION fn_inventarisasi_simpan(uuid, uuid, bigint, text, jsonb, text[]) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_hapus_belum_tercatat(uuid) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_validasi(uuid[]) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_batal_validasi(uuid, text) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_lembar(text, bigint[], text, text, int, int) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_hasil(int, text, bigint[], text, text, int, int) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_ringkas(int, text, bigint[]) FROM public;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_simpan(uuid, uuid, bigint, text, jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_hapus_belum_tercatat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_validasi(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_batal_validasi(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_lembar(text, bigint[], text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_hasil(int, text, bigint[], text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_ringkas(int, text, bigint[]) TO authenticated;

-- ── Sudah diuji ke PRODUKSI sebelum ditulis (transaksi yang sengaja digagalkan,
--    nol baris tersisa), 2026-09-23 ─────────────────────────────────────────
--   * Kesetaraan pemecahan fungsi: `fn_baris_penghalang_batal` lama vs
--     `fn_baris_berlaku_sesudah … LIMIT 1` atas 2.595 pasangan (aset × baseline),
--     230 aset berantai batal_* → 0 berbeda.
--   * Sebagai pengurus Dinas Pendidikan (707 unit, 522.975 barang P&M aktif):
--     lembar hal. 1 241 ms · cari "laptop" 555 ms · filter "belum" 8 ms ·
--     ringkasan 3.599 ms (dipanggil di latar) · hal. 101 (offset 5.000)
--     3.926 ms — halaman dalam memang mahal; jalan cepatnya Cari / filter /
--     pilih unit. Tak satu pun baris di luar scope-nya bocor.
--   * Sebagai admin se-kabupaten (661.766 barang P&M): hal. 1 7 ms · cari 42 ms
--     · ringkasan 730 ms.
--   * Alur: simpan → simpan ulang (id sama) → salah jenis aset DITOLAK →
--     validasi oleh SKPD DITOLAK → INSERT langsung DITOLAK (permission denied)
--     → validasi admin (2 sah + 1 id asing = 2 divalidasi, 1 dilewati) → ubah
--     sesudah validasi DITOLAK → batal validasi + catatan → barang dipindah ke
--     BKAD: posisi 'pindah_skpd', batal validasi DITOLAK, di SKPD baru tampil
--     "belum" → barang dikembalikan: batal validasi BOLEH lagi.
--
-- Verifikasi sesudah dijalankan:
--   SELECT to_regclass('public.inventarisasi_barang'), to_regclass('public.inventarisasi_tim'),
--          to_regclass('public.inventarisasi'), to_regclass('public.inventarisasi_baris');
--   -- dua pertama TIDAK NULL, dua terakhir NULL
--   SELECT proname, proconfig FROM pg_proc WHERE proname = 'fn_baris_penghalang_batal';
--   -- proconfig WAJIB memuat search_path=public
