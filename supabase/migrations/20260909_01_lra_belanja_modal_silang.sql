-- ============================================================================
-- LRA — "Persilangan" kode rekening × kode barang.
--
-- MASALAH YANG DITUTUP. Blok "Belanja Modal — Entryan Aplikasi" mengelompokkan
-- realisasi aplikasi memakai `payload.kode_rekening` (fallback: golongan aset).
-- Karena LRA hasil import JUGA dikelompokkan per rekening, blok Check
-- membandingkan rekening lawan rekening — jadi ia menjawab "apakah semua
-- realisasi belanja sudah dientry?" dan TIDAK PERNAH bisa memperlihatkan
-- pertanyaan kedua yang justru sering jadi temuan: **belanja dari rekening A,
-- barangnya golongan B**.
--
-- Kejadian nyata (Kecamatan Banyakan, 2026): "Backdrop" Rp19.955.000 dibeli
-- dgn rekening **5.2.03 Belanja Modal Gedung dan Bangunan**, sementara kode
-- barangnya `1.3.2.05.02.06.027` (Alat Hiasan) = **Peralatan dan Mesin**. Di
-- LRA ia menambah Gedung & Bangunan, di Daftar Barang/Neraca ia menambah
-- Peralatan & Mesin. Selisih klasifikasi itu **tak terlihat sama sekali** di
-- halaman LRA sebelum migrasi ini — Check-nya tetap ✓ karena kedua sisi sama-
-- sama dihitung dari rekening.
--
-- PERUBAHANNYA CUMA SATU: menambah kolom keluaran `golongan` (kode barang
-- 3 segmen) + ikut di GROUP BY. Filter, scope RLS, daftar jenis, & pembuangan
-- baris yang dibatalkan TIDAK disentuh sedikit pun — angka totalnya wajib
-- identik dgn sebelum migrasi, yang berubah hanya seberapa halus ia dipecah.
--
-- ⚠️ `RETURNS TABLE` tak bisa diubah lewat `CREATE OR REPLACE` → fungsinya
-- WAJIB di-DROP dulu. Karena itu `SET search_path` & GRANT ikut ditulis ulang
-- (CLAUDE.md: "CREATE OR REPLACE FUNCTION MENGHAPUS setelan ALTER FUNCTION …
-- SET" — di sini efeknya sama, definisi lama hilang seluruhnya).
--
-- ⚠️ `golongan` = kolom GENERATED ALWAYS … STORED di `aset`, ekspresinya
-- PERSIS `split_part(kode,'.',1)||'.'||split_part(kode,'.',2)||'.'||
-- split_part(kode,'.',3)` — jadi setara MENURUT DEFINISI dgn bentuk lama yang
-- ditulis tangan di cabang fallback (lihat 20260906_01, yang sudah memverifikasi
-- kesetaraannya ke data produksi). JANGAN samakan dgn `aset_awal_2026.golongan`,
-- yang rumusnya lain.
--
-- ⚠️ GOLONGAN = POSISI TERKINI (`aset.golongan`), BUKAN golongan saat belanja.
-- Barang yang direklas sesudah dibeli akan tampil di golongan barunya. Itu
-- DISENGAJA di sini: yang ditanyakan halaman ini "belanja rekening ini
-- akhirnya jadi aset golongan apa", dan untuk termin konstruksi jawabannya
-- memang berubah dari 1.3.6 (masih dikerjakan) ke golongan tujuannya begitu
-- selesai. Bandingkan dgn baris mutasi Rekonsiliasi, yang justru WAJIB
-- period-aware (`kodePada`, CLAUDE.md 2026-08-27) — di sana pertanyaannya
-- berbeda: "pada periode itu barang ini ada di golongan mana".
--
-- ⚠️ DEPLOY-ORDERING: AMAN dua arah, jadi tak ada urutan yang dipaksakan.
--   · migrasi dulu, kode belakangan → klien LAMA memanggil fungsi ini dan
--     mengabaikan kolom `golongan`; barisnya memang jadi lebih banyak (satu
--     (grup,bulan) bisa pecah jadi beberapa golongan) tapi `buildMatrix`
--     MENJUMLAHKAN ke sel yang sama, jadi angkanya identik.
--   · kode dulu, migrasi belakangan → klien BARU membaca `d.golongan` yang
--     belum ada → `undefined` → dianggap "tak bisa dinilai": tabel Persilangan
--     tampil kosong berikut keterangannya, blok & Check lain tetap benar.
-- Jalankan di Supabase SQL Editor SETELAH 20260908_01.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_lra_belanja_modal(int, bigint[]);

CREATE FUNCTION fn_lra_belanja_modal(
  p_tahun    int,
  p_skpd_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (grup text, golongan text, bulan int, nilai numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_is_admin boolean := fn_is_admin();
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      NULLIF(substring(t.payload->>'kode_rekening' from '^[0-9]+\.[0-9]+\.[0-9]+'), ''),
      CASE a.golongan
        WHEN '1.3.1' THEN '5.2.01'
        WHEN '1.3.2' THEN '5.2.02'
        WHEN '1.3.3' THEN '5.2.03'
        WHEN '1.3.4' THEN '5.2.04'
        WHEN '1.3.5' THEN '5.2.05'
        ELSE NULL   -- termasuk 1.3.6 (KDP): jenis belanja hanya sah dari rekening
      END
    )::text                              AS grup,
    a.golongan::text                     AS golongan,
    EXTRACT(MONTH FROM t.tanggal)::int   AS bulan,
    SUM(t.nilai)::numeric                AS nilai
  FROM transaksi_bmd t
  JOIN aset a ON a.id = t.aset_id
  WHERE t.jenis IN ('pengadaan', 'akumulasi_kdp')
    AND t.tanggal >= make_date(p_tahun, 1, 1)
    AND t.tanggal <= make_date(p_tahun, 12, 31)
    -- akumulasi_kdp tak mengisi skpd_tujuan → fallback ke SKPD asetnya.
    AND (p_skpd_ids IS NULL OR COALESCE(t.skpd_tujuan, a.skpd_id) = ANY (p_skpd_ids))
    -- scope RLS transaksi_bmd direplikasi (v_is_admin dievaluasi SEKALI)
    AND (
      v_is_admin
      OR fn_skpd_visible(t.skpd_asal)
      OR fn_skpd_visible(t.skpd_tujuan)
      OR fn_skpd_visible(a.skpd_id)
    )
    -- Dibuang: pengadaan yang dibatalkan & kontrak konstruksi yang dibuka kunci.
    AND NOT EXISTS (
      SELECT 1 FROM transaksi_bmd b
      WHERE b.aset_id = t.aset_id
        AND b.jenis IN ('batal_pengadaan', 'batal_akumulasi_kdp')
    )
  GROUP BY 1, 2, 3;
END $function$;

GRANT EXECUTE ON FUNCTION fn_lra_belanja_modal(int, bigint[]) TO authenticated;

-- ── SUDAH DIVERIFIKASI KE PRODUKSI 2026-09-09, sesudah migrasi dijalankan ──
-- Diukur dgn RLS AKTIF (`SET LOCAL role authenticated` + klaim uid admin);
-- ⚠️ sebagai service_role fungsi ini mengembalikan **0 baris** — bukan rusak,
-- melainkan cabang scope RLS yang direplikasi di WHERE (fn_is_admin() &
-- fn_skpd_visible() dua-duanya false tanpa klaim JWT). Jangan salah baca itu
-- sbg "datanya kosong"; ukur sbg user beneran.
--
--   fn_lra_belanja_modal(2026, NULL) → 7 baris, **11,8 ms**, shared hit 3.118
--   (pagu authenticated 8.000 ms). Sebaran:
--     5.2.02 × 1.3.2 = 1.677.914.837  (55 baris ledger, cocok)
--     5.2.03 × 1.3.2 =    19.955.000  (1 baris — SILANG, Backdrop Banyakan)
--   Σ = 1.697.869.837 — IDENTIK di dasar rekening maupun dasar kode barang,
--   yang bergeser cuma sebarannya (5.2.03 → 0, 5.2.02 → 1.697.869.837).
--   Dicocokkan baris-per-baris dgn query LANGSUNG ke ledger (tanpa RPC):
--   angka & jumlah barisnya sama persis.
--
-- Perintah verifikasinya:
--   SELECT grup, SUM(nilai) FROM fn_lra_belanja_modal(2026, NULL) GROUP BY 1 ORDER BY 1;
--   SELECT grup, golongan, SUM(nilai) FROM fn_lra_belanja_modal(2026, NULL)
--   GROUP BY 1,2 ORDER BY 1,2;   -- baris di luar diagonal = temuan
