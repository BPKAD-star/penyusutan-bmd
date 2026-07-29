-- ============================================================================
-- KODE REGISTER — Fase 1a: SKEMA (kolom, tabel counter, tabel riwayat, fungsi).
--
-- Kode register = identitas barang menurut POSISI TERAKHIRnya. NIBAR itu akta
-- lahir (beku sejak barang masuk); kode register itu KTP — ikut pindah.
-- Susunan digitnya sama persis dgn NIBAR:
--   [12][01/02][3506][14 dgt lokasi][4 dgt tahun][12 dgt kode barang][7 dgt urut]
--
-- KENAPA NOMOR URUTNYA DISIMPAN, BUKAN DIHITUNG SAAT TAMPIL:
--   Kalau dihitung dari urutan baris, satu barang hilang di tengah menggeser
--   nomor SEMUA barang di bawahnya — padahal kode register tercetak di label
--   barang, KIR, dan BAST. Angka di kertas jadi tak cocok dgn layar, diam-diam.
--   Jadi nomor urut DITERBITKAN sekali lalu dibekukan, persis pola NIBAR.
--   Ini SENGAJA beda dari aturan "Σ luas bidang jangan disimpan balik ke kolom"
--   (CLAUDE.md): Σ luas wajib ikut data hidup, kode register justru wajib
--   BERHENTI ikut.
--
-- KENAPA ALOKASINYA PAKAI TABEL COUNTER, BUKAN `LIKE 'prefix%'`:
--   Generator NIBAR mencari nomor terakhir dgn `nibar LIKE '<38 digit>%'` dan itu
--   sudah pernah TIMEOUT (butuh idx_aset_nibar_pattern, migrasi 20260728_04) —
--   sempat bikin nomor urut diam-diam mengulang dari 1. Counter O(1) tidak punya
--   penyakit itu sama sekali, dan biayanya tidak tumbuh mengikuti jumlah aset.
--
-- URUTAN DEPLOY: migrasi ini + 20260729_04 (backfill) WAJIB jalan SEBELUM deploy
--   kode — halaman pembaca sudah menyebut kolom/tabel yang dibuat di sini.
--   Jalankan 20260729_03 dulu, baru 20260729_04.
-- ============================================================================

-- ── Pembentuk 38 digit prefiks ──────────────────────────────────────────────
-- ⚠️ KEMBAR dgn `prefixKodeRegister` di lib/kodeRegister.ts — ubah satu, ubah
-- dua-duanya. Repo ini sudah dua kali kena konstanta/predikat kembar yang geser
-- diam-diam (JENIS_PINDAH vs idx_trx_pindah_id). Kalau dua sisi ini beda, kode
-- register yang DITAMPILKAN tak sama dgn yang DISIMPAN, dan tak ada satu pun
-- error yang muncul.
--
-- FAIL-CLOSED: kembalikan NULL kalau ada segmen yang datanya tidak ada. Jangan
-- meniru digitsPad NIBAR yang mengisi '0' diam-diam — nomor yang dikarang dari
-- data kosong kelihatan sah dan bisa ikut tersalin ke dokumen resmi.
CREATE OR REPLACE FUNCTION fn_prefix_kode_register(
  p_intra_ekstra text, p_kode_skpd text, p_tahun text, p_kode text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- COALESCE-nya WAJIB: `NULL NOT IN (...)` bernilai NULL, bukan TRUE, jadi
    -- cabang ini terlewat dan `CASE … ELSE '02'` di bawah diam-diam menjadikan
    -- barang ber-intra_ekstra NULL sebagai EKSTRA. Fail-closed-nya bocor persis
    -- di tempat yang paling tak kelihatan.
    WHEN COALESCE(p_intra_ekstra, '') NOT IN ('intra', 'ekstra') THEN NULL
    WHEN COALESCE(regexp_replace(p_kode_skpd, '\D', '', 'g'), '') = '' THEN NULL
    WHEN COALESCE(p_tahun, '') !~ '^\d{4}$' THEN NULL
    WHEN COALESCE(regexp_replace(p_kode, '\D', '', 'g'), '') = '' THEN NULL
    ELSE '12'
      || CASE p_intra_ekstra WHEN 'intra' THEN '01' ELSE '02' END
      || '3506'
      || left(rpad(regexp_replace(p_kode_skpd, '\D', '', 'g'), 14, '0'), 14)
      || p_tahun
      || left(rpad(regexp_replace(p_kode, '\D', '', 'g'), 12, '0'), 12)
  END
$$;

-- ── Kolom "berlaku sekarang" di register ────────────────────────────────────
-- Nullable: barang `draft` (kontrak konstruksi yang belum disetujui) SENGAJA
-- belum dapat nomor — supaya nomor urut tidak terbakar barang yang mungkin tak
-- jadi. Persis perlakuan NIBAR yang baru digenerate saat approve.
ALTER TABLE aset ADD COLUMN IF NOT EXISTS kode_register text;

COMMENT ON COLUMN aset.kode_register IS
  'Kode register 45 digit (posisi terakhir). CACHE dari baris terbaru di aset_kode_register — sumber kebenaran ada di tabel riwayat itu. Diisi trigger, JANGAN di-UPDATE dari client.';

-- ── Counter nomor urut per prefiks ──────────────────────────────────────────
-- Satu baris per (SKPD + tahun + kode barang + intra/ekstra). MONOTON: nomor
-- yang ditinggalkan barang yang pindah keluar TIDAK pernah diterbitkan ulang.
-- Konsekuensi yang DITERIMA: nomor urut di sebuah SKPD akan berlubang
-- (…122, …124) — itu harga dari kode yang stabil, dan tak bisa ditawar bersamaan.
CREATE TABLE IF NOT EXISTS kode_register_seq (
  prefix38       text PRIMARY KEY,
  nomor_terakhir integer NOT NULL DEFAULT 0 CHECK (nomor_terakhir >= 0),
  diperbarui_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Riwayat kode register ───────────────────────────────────────────────────
-- APPEND-ONLY. Hanya diisi kalau kodenya BENAR-BENAR berubah; barang yang tak
-- pernah pindah/reklas tidak punya baris sama sekali (pola yang sama dgn
-- fetchPindahEvents: aset yang tak pernah pindah tidak masuk map).
--
-- Arah penunjuk SENGAJA begini: riwayat → ledger (`trx_id`), BUKAN ledger →
-- kode register. Menyalin kode ke transaksi_bmd cuma menduplikasi data yang
-- sudah bisa diturunkan, dan memaksa backfill 418rb baris ledger tanpa manfaat.
--
-- SATU BARIS = SATU PERPINDAHAN, memuat kode LAMA sekaligus kode BARU. Ini yang
-- bikin tabelnya tetap ramping (tak perlu baris "perdana" untuk 418rb barang
-- yang tak pernah pindah) TAPI riwayatnya tetap utuh: kode pada periode V =
-- kode_register baris terakhir dgn periode <= V; kalau belum ada baris <= V,
-- jatuh ke `kode_lama` baris PALING AWAL. Bentuk & cara bacanya sengaja kembar
-- dgn ownersAt() di lib/pengalihan.ts ("kalau belum ada baris <= V → skpd_asal
-- baris paling awal") supaya cuma ada satu model mental di kepala pembaca.
CREATE TABLE IF NOT EXISTS aset_kode_register (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aset_id       uuid NOT NULL REFERENCES aset(id) ON DELETE CASCADE,
  kode_lama     text,
  kode_register text NOT NULL,
  periode       text NOT NULL,
  tanggal       date NOT NULL,
  -- Baris ledger pemicunya kalau ada. NULL utk penerbitan perdana (backfill /
  -- barang baru disetujui) — di situ memang tak ada peristiwa perpindahan.
  trx_id        bigint,
  alasan        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akr_aset_id ON aset_kode_register (aset_id, id);
-- Melayani penelusuran balik dari dokumen fisik: "kode register X ini barang apa?"
CREATE INDEX IF NOT EXISTS idx_akr_kode ON aset_kode_register (kode_register);

-- Append-only, pola fn_transaksi_bmd_immutable. Riwayat yang bisa disunting
-- tidak ada gunanya sebagai jejak audit.
CREATE OR REPLACE FUNCTION fn_aset_kode_register_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'aset_kode_register bersifat append-only — % ditolak', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_akr_immutable ON aset_kode_register;
CREATE TRIGGER trg_akr_immutable BEFORE UPDATE OR DELETE ON aset_kode_register
  FOR EACH ROW EXECUTE FUNCTION fn_aset_kode_register_immutable();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- SELECT saja. TIDAK ADA policy INSERT/UPDATE/DELETE untuk `authenticated`:
-- kedua tabel ini plumbing sistem, cuma boleh ditulis trigger SECURITY DEFINER
-- di bawah. Client yang mencoba menulis langsung akan ditolak RLS.
--
-- ⚠️ Semua fn dibungkus InitPlan (SELECT fn_…) sejak baris pertama — bukan
-- ditambal belakangan. Tiga ronde timeout di repo ini (20260717_02, 20260718_05/06,
-- 20260728_02) semuanya berakar dari fn telanjang yang dievaluasi per-baris.
ALTER TABLE aset_kode_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE kode_register_seq  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "akr_select" ON aset_kode_register;
CREATE POLICY "akr_select" ON aset_kode_register FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_admin()) OR (SELECT fn_is_viewer())
    OR EXISTS (SELECT 1 FROM aset a WHERE a.id = aset_kode_register.aset_id
               AND fn_skpd_visible(a.skpd_id))
    -- Pengirim tetap boleh membaca riwayat barang yang sudah pindah keluar —
    -- pola yang sama dgn perluasan aset_select di migrasi 22.
    -- SENGAJA TIDAK dibungkus (SELECT …): InitPlan cuma menolong ekspresi yang
    -- TIDAK bergantung baris. Fungsi ini menerima aset_id per baris, jadi
    -- membungkusnya justru bikin SubPlan berkorelasi — tetap per-baris, plus
    -- ongkos tambahan. Bungkus InitPlan hanya untuk fn_is_admin/fn_is_viewer.
    OR fn_aset_pernah_dikelola(aset_kode_register.aset_id)
  );

-- Counter tidak memuat data barang, cuma pasangan prefiks→nomor. Dibuka baca
-- supaya admin bisa memeriksa alokasi tanpa service-role.
DROP POLICY IF EXISTS "krs_select" ON kode_register_seq;
CREATE POLICY "krs_select" ON kode_register_seq FOR SELECT TO authenticated
  USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()));

-- ── Alokator nomor urut ─────────────────────────────────────────────────────
-- SECURITY DEFINER: menulis kode_register_seq yang sengaja tak punya policy
-- INSERT/UPDATE untuk authenticated. ON CONFLICT DO UPDATE bikin ini atomik &
-- aman dari balapan tanpa perlu advisory lock — dua transaksi yang meminta
-- prefiks sama akan diserialisasi oleh row lock baris counter itu sendiri.
CREATE OR REPLACE FUNCTION fn_alokasi_nomor_register(p_prefix38 text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nomor integer;
BEGIN
  IF p_prefix38 IS NULL OR length(p_prefix38) <> 38 THEN
    RAISE EXCEPTION 'prefiks kode register tidak sah: %', COALESCE(p_prefix38, '(null)');
  END IF;
  INSERT INTO kode_register_seq (prefix38, nomor_terakhir)
  VALUES (p_prefix38, 1)
  ON CONFLICT (prefix38) DO UPDATE
    SET nomor_terakhir = kode_register_seq.nomor_terakhir + 1,
        diperbarui_at  = now()
  RETURNING nomor_terakhir INTO v_nomor;

  IF v_nomor > 9999999 THEN
    RAISE EXCEPTION 'nomor urut kode register habis untuk prefiks % (maks 7 digit)', p_prefix38;
  END IF;
  RETURN v_nomor;
END $$;

REVOKE ALL ON FUNCTION fn_alokasi_nomor_register(text) FROM public;
GRANT EXECUTE ON FUNCTION fn_alokasi_nomor_register(text) TO authenticated;
