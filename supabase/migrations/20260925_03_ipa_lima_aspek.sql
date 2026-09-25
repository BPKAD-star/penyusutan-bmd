-- ============================================================================
-- IPA LIMA ASPEK (keputusan user 2026-09-25) — menggantikan IPA versi Kepmen
-- (ST1–ST4, migrasi 20260709_02) dengan kerangka "Simulasi_IPA_Kabupaten_Kediri
-- .xlsx": 5 aspek × 11 indikator, bobot aspek BERBEDA per klaster SKPD (A/B/C/D),
-- skor 0–100 per indikator → rata-rata terbobot → Indeks 1–4
-- (1 + skor/100 × 3), kategori Sangat Baik / Baik / Buruk / Sangat Buruk.
--
-- ASPEK & INDIKATOR (gambar dari user):
--   INT  Integritas          INT_KELENGKAPAN   Kelengkapan data administrasi   OTOMATIS
--   KEP  Kepatuhan           KEP_RKBMD         Ketepatan waktu usulan RKBMD     OTOMATIS
--                            KEP_REKON         Ketepatan waktu rekonsiliasi     periode admin + isian SKPD
--                            KEP_ENTRY         Ketepatan entry belanja modal    OTOMATIS
--   AKT  Akuntabilitas & TL  AKT_TLBPK         TL temuan BPK                    isian SKPD
--                            AKT_TLINSP        TL temuan Inspektorat            isian SKPD
--                            AKT_TLRB          TL aset rusak berat              OTOMATIS
--                            AKT_REALISASI     Realisasi RKBMD                  OTOMATIS
--   LEG  Legalitas           LEG_TANAH         Tanah bersertifikat              OTOMATIS
--                            LEG_PAJAK         Pajak kendaraan                  bukti per kendaraan
--   EKO  Ekonomi             EKO_IDLE          Pendapatan atas aset idle (≈10%) OTOMATIS
--
-- CAKUPAN DATA: SKPD INDUK SAJA (keputusan user) — anak-cucu tidak ikut,
-- KECUALI Sekretariat Daerah (26) & Kecamatan Pare (48) yang asetnya memang
-- tinggal di Bagian/Kelurahan. Diatur per SKPD lewat `ipa_skpd.sertakan_turunan`
-- (Admin bisa mengubahnya), bukan di-hardcode di fungsi.
--
-- MODUL NON-LEDGER: tak pernah menulis `transaksi_bmd` maupun mengubah `aset`.
-- Tabel IPA LAMA (ipa_record dkk.) SENGAJA TIDAK disentuh di sini supaya halaman
-- lama tetap hidup sampai kode baru di-deploy — pembersihannya di migrasi
-- terpisah 20260925_04 (jalankan SESUDAH deploy).
--
-- ⚠️ Deploy-ordering: jalankan SEBELUM deploy kode.
-- ============================================================================

-- ── 1. Referensi: klaster, aspek, indikator ────────────────────────────────
CREATE TABLE IF NOT EXISTS ipa_klaster (
  kode        text PRIMARY KEY CHECK (kode IN ('A','B','C','D')),
  nama        text NOT NULL
);
INSERT INTO ipa_klaster (kode, nama) VALUES
  ('A','Kewilayahan (Kecamatan)'),
  ('B','Pelayanan aset besar / multi-unit'),
  ('C','Konstruksi / Infrastruktur'),
  ('D','Administratif / Penunjang')
ON CONFLICT (kode) DO NOTHING;

CREATE TABLE IF NOT EXISTS ipa_aspek (
  kode        text PRIMARY KEY,
  nama        text NOT NULL,
  urut        int  NOT NULL
);
INSERT INTO ipa_aspek (kode, nama, urut) VALUES
  ('INT','Integritas',1), ('KEP','Kepatuhan',2), ('AKT','Akuntabilitas & Tindak Lanjut',3),
  ('LEG','Legalitas',4), ('EKO','Ekonomi',5)
ON CONFLICT (kode) DO NOTHING;

-- Bobot aspek per klaster (Excel sheet Bobot_Klaster). Tiap klaster = 100%.
CREATE TABLE IF NOT EXISTS ipa_bobot_aspek (
  klaster     text NOT NULL REFERENCES ipa_klaster(kode),
  aspek       text NOT NULL REFERENCES ipa_aspek(kode),
  bobot       numeric NOT NULL CHECK (bobot >= 0 AND bobot <= 1),
  PRIMARY KEY (klaster, aspek)
);
INSERT INTO ipa_bobot_aspek (klaster, aspek, bobot) VALUES
  ('A','INT',0.25),('A','KEP',0.25),('A','AKT',0.25),('A','LEG',0.20),('A','EKO',0.05),
  ('B','INT',0.20),('B','KEP',0.25),('B','AKT',0.25),('B','LEG',0.15),('B','EKO',0.15),
  ('C','INT',0.20),('C','KEP',0.35),('C','AKT',0.25),('C','LEG',0.15),('C','EKO',0.05),
  ('D','INT',0.30),('D','KEP',0.20),('D','AKT',0.30),('D','LEG',0.15),('D','EKO',0.05)
ON CONFLICT (klaster, aspek) DO NOTHING;

-- Indikator + bobot DI DALAM aspeknya (Excel sheet Bobot_Subindikator).
-- `sumber`: otomatis = dihitung fn_ipa_hitung_otomatis; isian = diisi SKPD +
-- diverifikasi (TL BPK/Inspektorat). Rekon & pajak juga dihitung fungsi
-- otomatis, tapi bahannya isian SKPD yang terverifikasi.
-- `cara_skor`: rasio = pembilang/penyebut × 100 (maks 100);
-- target10 = 100 bila rasio ≥ target (param target_eko_persen), di bawahnya
-- berkurang 10 poin per 1% kekurangan (keputusan user: di atas target = 100).
CREATE TABLE IF NOT EXISTS ipa_indikator (
  kode            text PRIMARY KEY,
  aspek           text NOT NULL REFERENCES ipa_aspek(kode),
  nama            text NOT NULL,
  urut            int  NOT NULL,
  sumber          text NOT NULL CHECK (sumber IN ('otomatis','isian','rekon','pajak')),
  cara_skor       text NOT NULL DEFAULT 'rasio' CHECK (cara_skor IN ('rasio','target10')),
  bobot           numeric NOT NULL CHECK (bobot >= 0 AND bobot <= 1),
  label_pembilang text NOT NULL,
  label_penyebut  text NOT NULL,
  keterangan      text
);
INSERT INTO ipa_indikator (kode, aspek, nama, urut, sumber, cara_skor, bobot, label_pembilang, label_penyebut, keterangan) VALUES
  ('INT_KELENGKAPAN','INT','Kelengkapan Data Administrasi',1,'otomatis','rasio',1.00,
     'Kolom spesifikasi terisi','Kolom spesifikasi wajib',
     'Dihitung dari register hidup: spesifikasi nama barang, merk/tipe, spesifikasi lainnya, no polisi/rangka/mesin/BPKB (kendaraan bermotor), luas (tanah/gedung/jalan), wilayah, alamat, titik koordinat, kondisi, penggunaan, keterangan, foto.'),
  ('KEP_RKBMD','KEP','Ketepatan Waktu Usulan RKBMD',2,'otomatis','rasio',0.30,
     'Jenis RKBMD diajukan tepat waktu','Jenis RKBMD wajib',
     'RKBMD TA berikutnya (TA penilaian + 1) yang diajukan paling lambat batas waktu (bawaan 7 Juni).'),
  ('KEP_REKON','KEP','Ketepatan Waktu Rekonsiliasi BMD',3,'rekon','rasio',0.30,
     'Rekonsiliasi tepat waktu','Periode rekonsiliasi jatuh tempo',
     'Periode ditetapkan Admin; pelaksanaan diisi SKPD + bukti, dihitung setelah diverifikasi.'),
  ('KEP_ENTRY','KEP','Ketepatan Waktu Entry Belanja Modal',4,'otomatis','rasio',0.40,
     'BAST di-entry tepat waktu','Total BAST pengadaan',
     'Selisih tanggal entry kartu Pengadaan terhadap tanggal BAST ≤ batas hari (bawaan 30).'),
  ('AKT_TLBPK','AKT','TL Temuan BPK',5,'isian','rasio',0.25,
     'Rekomendasi BPK selesai TL','Total rekomendasi BPK', NULL),
  ('AKT_TLINSP','AKT','TL Temuan Inspektorat',6,'isian','rasio',0.25,
     'Rekomendasi Inspektorat selesai TL','Total rekomendasi Inspektorat', NULL),
  ('AKT_TLRB','AKT','TL Aset Rusak Berat',7,'otomatis','rasio',0.25,
     'Aset rusak berat sudah ditindaklanjuti','Total aset rusak berat',
     'Ditindaklanjuti = diusulkan di RKBMD Penghapusan (diajukan/disetujui) atau dihapus pada tahun penilaian. Reklas ke Aset Lain-Lain RB tidak dihitung.'),
  ('AKT_REALISASI','AKT','Hasil Realisasi RKBMD',8,'otomatis','rasio',0.25,
     'Realisasi pengadaan (Rp)','RKBMD Pengadaan disetujui (Rp)', NULL),
  ('LEG_TANAH','LEG','Jumlah Tanah Bersertifikat',9,'otomatis','rasio',0.50,
     'Bidang tanah bersertifikat','Total bidang tanah', NULL),
  ('LEG_PAJAK','LEG','Ketaatan Pembayaran Pajak Kendaraan',10,'pajak','rasio',0.50,
     'Kendaraan bukti pajak terverifikasi','Total kendaraan bermotor', NULL),
  ('EKO_IDLE','EKO','Realisasi Pendapatan atas Aset Idle',11,'otomatis','target10',1.00,
     'Pendapatan pemanfaatan aset idle per tahun (Rp)','Nilai perolehan aset idle (Rp)',
     'Aset idle = Aset Lain-Lain berkode "tidak digunakan dalam operasional pemerintah" (1.5.4.01.01.02.*). Pendapatan = nilai perjanjian pemanfaatan berpendapatan ÷ masa tahun.')
ON CONFLICT (kode) DO NOTHING;

-- Parameter yang bisa diubah Admin.
CREATE TABLE IF NOT EXISTS ipa_parameter (
  kunci       text PRIMARY KEY,
  nilai       numeric NOT NULL,
  keterangan  text NOT NULL
);
INSERT INTO ipa_parameter (kunci, nilai, keterangan) VALUES
  ('batas_rkbmd_bulan', 6,  'Bulan batas usulan RKBMD TA berikutnya'),
  ('batas_rkbmd_tanggal', 7, 'Tanggal batas usulan RKBMD (minggu pertama → 7)'),
  ('batas_hari_entry', 30, 'Maksimal hari dari tanggal BAST sampai kartu Pengadaan di-entry'),
  ('target_eko_persen', 10, 'Target rasio pendapatan aset idle (%)'),
  ('ambang_bobot_berlaku', 70, 'Bobot berlaku minimal (%) supaya SKPD ikut ranking')
ON CONFLICT (kunci) DO NOTHING;

-- ── 2. SKPD yang dinilai (60 SKPD induk) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ipa_skpd (
  skpd_id           bigint PRIMARY KEY REFERENCES admin_skpd(id),
  klaster           text NOT NULL REFERENCES ipa_klaster(kode),
  sertakan_turunan  boolean NOT NULL DEFAULT false
);
-- Klaster dari sheet Master_SKPD (ID-nya = admin_skpd.id, diverifikasi).
INSERT INTO ipa_skpd (skpd_id, klaster, sertakan_turunan)
SELECT s.id,
  CASE
    WHEN s.id IN (2,3,4,5) THEN 'B'
    WHEN s.id IN (6,7) THEN 'C'
    WHEN s.id BETWEEN 33 AND 58 THEN 'A'
    ELSE 'D'
  END,
  s.id IN (26, 48)
FROM admin_skpd s
WHERE s.jabatan = 'pengguna barang'
ON CONFLICT (skpd_id) DO NOTHING;

-- Cakupan data satu SKPD penilaian.
CREATE OR REPLACE FUNCTION fn_ipa_scope(p_skpd_id bigint) RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN COALESCE((SELECT sertakan_turunan FROM ipa_skpd WHERE skpd_id = p_skpd_id), false)
    THEN (SELECT array_agg(c.id) FROM admin_skpd r JOIN admin_skpd c ON c.path <@ r.path WHERE r.id = p_skpd_id)
    ELSE ARRAY[p_skpd_id]
  END
$$;

-- ── 3. Isian SKPD: TL BPK / TL Inspektorat ─────────────────────────────────
-- APPEND: tiap capaian baru = baris baru (bertanggal). Skor memakai baris
-- TERVERIFIKASI TERAKHIR dgn tanggal_capaian ≤ akhir bulan yang dilihat —
-- itulah yang membuat penilaian bisa diikuti per bulan.
CREATE TABLE IF NOT EXISTS ipa_isian (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun               int NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  skpd_id             bigint NOT NULL REFERENCES ipa_skpd(skpd_id),
  indikator           text NOT NULL REFERENCES ipa_indikator(kode) CHECK (indikator IN ('AKT_TLBPK','AKT_TLINSP')),
  tidak_ada           boolean NOT NULL DEFAULT false,
  pembilang           numeric CHECK (pembilang IS NULL OR pembilang >= 0),
  penyebut            numeric CHECK (penyebut IS NULL OR penyebut >= 0),
  tanggal_capaian     date NOT NULL,
  catatan             text,
  bukti_paths         text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan','diverifikasi','ditolak')),
  catatan_verifikator text,
  created_by          uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  verified_by         uuid,
  verified_at         timestamptz,
  -- "Tidak ada temuan" = N/A sah; selain itu angka wajib & masuk akal.
  CONSTRAINT ipa_isian_angka CHECK (
    tidak_ada OR (pembilang IS NOT NULL AND penyebut IS NOT NULL AND penyebut > 0 AND pembilang <= penyebut))
);
CREATE INDEX IF NOT EXISTS idx_ipa_isian_skpd ON ipa_isian (tahun, skpd_id, indikator);

-- ── 4. Rekonsiliasi: periode (Admin) + pelaksanaan (SKPD) ──────────────────
-- Sementara sampai "snapshot rekonsiliasi" dibangun: begitu snapshot ada,
-- pelaksanaan cukup diturunkan dari snapshot periode itu.
CREATE TABLE IF NOT EXISTS ipa_rekon_periode (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun         int NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  nama          text NOT NULL,
  batas_tanggal date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tahun, nama)
);
CREATE TABLE IF NOT EXISTS ipa_rekon_pelaksanaan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_id          uuid NOT NULL REFERENCES ipa_rekon_periode(id) ON DELETE CASCADE,
  skpd_id             bigint NOT NULL REFERENCES ipa_skpd(skpd_id),
  tanggal_pelaksanaan date NOT NULL,
  catatan             text,
  bukti_paths         text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan','diverifikasi','ditolak')),
  catatan_verifikator text,
  created_by          uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  verified_by         uuid,
  verified_at         timestamptz,
  UNIQUE (periode_id, skpd_id)
);

-- ── 5. Pajak kendaraan: bukti per kendaraan per tahun ──────────────────────
CREATE TABLE IF NOT EXISTS ipa_pajak_kendaraan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun               int NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  aset_id             uuid NOT NULL REFERENCES aset(id),
  skpd_id             bigint NOT NULL REFERENCES ipa_skpd(skpd_id),
  tanggal_bayar       date NOT NULL,
  catatan             text,
  bukti_paths         text[] NOT NULL DEFAULT '{}' CHECK (cardinality(bukti_paths) > 0),
  status              text NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan','diverifikasi','ditolak')),
  catatan_verifikator text,
  created_by          uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  verified_by         uuid,
  verified_at         timestamptz,
  UNIQUE (tahun, aset_id)
);
CREATE INDEX IF NOT EXISTS idx_ipa_pajak_skpd ON ipa_pajak_kendaraan (tahun, skpd_id);

-- ── 6. Guard status: SKPD selalu "diajukan", verifikasi hanya Admin ────────
-- Satu fungsi untuk ketiga tabel isian. SKPD yang menyunting baris (mis.
-- memperbaiki yang ditolak) otomatis mengembalikannya ke antrean verifikasi;
-- baris yang SUDAH diverifikasi beku bagi SKPD.
-- ⚠️ SENGAJA SECURITY INVOKER: di dalam DEFINER `current_user` berubah jadi
-- pemilik fungsi & pengecualian SQL Editor salah baca (pelajaran 20260728_01).
CREATE OR REPLACE FUNCTION fn_ipa_isian_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;  -- SQL Editor / service_role
  IF fn_is_admin() THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'diajukan' THEN
        NEW.verified_by := NULL; NEW.verified_at := NULL;
      ELSE
        NEW.verified_by := auth.uid(); NEW.verified_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'diverifikasi' THEN
    RAISE EXCEPTION 'Isian ini sudah diverifikasi Pengelola Barang dan tidak bisa diubah.';
  END IF;
  NEW.status := 'diajukan';
  NEW.verified_by := NULL; NEW.verified_at := NULL;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ipa_isian_guard ON ipa_isian;
CREATE TRIGGER trg_ipa_isian_guard BEFORE INSERT OR UPDATE ON ipa_isian
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_guard();
DROP TRIGGER IF EXISTS trg_ipa_rekon_guard ON ipa_rekon_pelaksanaan;
CREATE TRIGGER trg_ipa_rekon_guard BEFORE INSERT OR UPDATE ON ipa_rekon_pelaksanaan
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_guard();
DROP TRIGGER IF EXISTS trg_ipa_pajak_guard ON ipa_pajak_kendaraan;
CREATE TRIGGER trg_ipa_pajak_guard BEFORE INSERT OR UPDATE ON ipa_pajak_kendaraan
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_guard();

-- Baris yang sudah diverifikasi tak boleh dihapus SKPD.
CREATE OR REPLACE FUNCTION fn_ipa_isian_hapus_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT fn_is_admin() AND OLD.status = 'diverifikasi' THEN
    RAISE EXCEPTION 'Isian yang sudah diverifikasi tidak bisa dihapus.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_ipa_isian_hapus ON ipa_isian;
CREATE TRIGGER trg_ipa_isian_hapus BEFORE DELETE ON ipa_isian
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_hapus_guard();
DROP TRIGGER IF EXISTS trg_ipa_rekon_hapus ON ipa_rekon_pelaksanaan;
CREATE TRIGGER trg_ipa_rekon_hapus BEFORE DELETE ON ipa_rekon_pelaksanaan
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_hapus_guard();
DROP TRIGGER IF EXISTS trg_ipa_pajak_hapus ON ipa_pajak_kendaraan;
CREATE TRIGGER trg_ipa_pajak_hapus BEFORE DELETE ON ipa_pajak_kendaraan
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_isian_hapus_guard();

-- Kendaraan yang diberi bukti pajak wajib kendaraan bermotor di cakupan SKPD itu.
CREATE OR REPLACE FUNCTION fn_ipa_pajak_cek_aset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM aset a WHERE a.id = NEW.aset_id
                  AND a.kode LIKE '1.3.2.02.01.%'
                  AND a.skpd_id = ANY (fn_ipa_scope(NEW.skpd_id))) THEN
    RAISE EXCEPTION 'Barang ini bukan kendaraan bermotor milik SKPD tersebut.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ipa_pajak_cek_aset ON ipa_pajak_kendaraan;
CREATE TRIGGER trg_ipa_pajak_cek_aset BEFORE INSERT OR UPDATE OF aset_id, skpd_id ON ipa_pajak_kendaraan
  FOR EACH ROW EXECUTE FUNCTION fn_ipa_pajak_cek_aset();

-- ── 7. Hasil otomatis (snapshot per bulan) ─────────────────────────────────
-- Ditulis HANYA lewat fn_ipa_simpan_otomatis. Satu baris per
-- (tahun, bulan, skpd, indikator) → riwayat bulanan tersimpan.
CREATE TABLE IF NOT EXISTS ipa_otomatis (
  tahun        int NOT NULL,
  bulan        int NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  skpd_id      bigint NOT NULL REFERENCES ipa_skpd(skpd_id),
  indikator    text NOT NULL REFERENCES ipa_indikator(kode),
  pembilang    numeric NOT NULL,
  penyebut     numeric NOT NULL,
  rincian      jsonb NOT NULL DEFAULT '{}',
  dihitung_at  timestamptz NOT NULL DEFAULT now(),
  dihitung_by  uuid,
  PRIMARY KEY (tahun, bulan, skpd_id, indikator)
);

-- ── 8. Mesin hitung otomatis ───────────────────────────────────────────────
-- Satu SKPD penilaian per panggilan (cakupan = fn_ipa_scope). SECURITY
-- DEFINER: harus membaca register lintas RLS & cepat; wewenang diperiksa di
-- awal. Semua rumus di sini dicerminkan dokumentasinya di lib/ipa.ts.
CREATE OR REPLACE FUNCTION fn_ipa_hitung_otomatis(p_tahun int, p_skpd_id bigint)
RETURNS TABLE (indikator text, pembilang numeric, penyebut numeric, rincian jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET work_mem TO '64MB'
AS $$
DECLARE
  v_scope     bigint[];
  v_awal      date := make_date(p_tahun, 1, 1);
  v_akhir     date := make_date(p_tahun, 12, 31);
  v_hari_ini  date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_batas_rk  date;
  v_hari_ent  int;
  a numeric; b numeric; r jsonb; n bigint; m numeric;
BEGIN
  IF NOT (fn_is_admin() OR fn_is_viewer() OR fn_skpd_visible(p_skpd_id)) THEN
    RAISE EXCEPTION 'Tidak berwenang melihat IPA SKPD ini.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ipa_skpd WHERE skpd_id = p_skpd_id) THEN
    RAISE EXCEPTION 'SKPD % bukan SKPD penilaian IPA.', p_skpd_id;
  END IF;
  v_scope := fn_ipa_scope(p_skpd_id);
  v_batas_rk := make_date(p_tahun,
    (SELECT nilai::int FROM ipa_parameter WHERE kunci = 'batas_rkbmd_bulan'),
    (SELECT nilai::int FROM ipa_parameter WHERE kunci = 'batas_rkbmd_tanggal'));
  v_hari_ent := (SELECT nilai::int FROM ipa_parameter WHERE kunci = 'batas_hari_entry');

  -- INT_KELENGKAPAN: tiap barang aktif menyumbang kolom yang BERLAKU untuk
  -- golongannya (KEMBAR dgn KOLOM_KELENGKAPAN di lib/ipa.ts).
  SELECT COALESCE(sum(isi), 0), COALESCE(sum(wajib), 0), count(*)
    INTO a, b, n
  FROM (
    SELECT
      9 + (CASE WHEN g.merek THEN 1 ELSE 0 END) + (CASE WHEN g.luas THEN 1 ELSE 0 END)
        + (CASE WHEN g.kend THEN 4 ELSE 0 END) AS wajib,
      (CASE WHEN nullif(btrim(x.nama_barang),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.spesifikasi_lainnya),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.wilayah_kode),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.alamat_detail),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN x.latitude IS NOT NULL AND x.longitude IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.kondisi_barang),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.penggunaan_pengamanan),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN nullif(btrim(x.keterangan),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN COALESCE(cardinality(x.foto_paths), 0) > 0 THEN 1 ELSE 0 END)
      + (CASE WHEN g.merek AND nullif(btrim(x.merek_tipe),'') IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN g.luas AND (COALESCE(x.luas,0) > 0 OR EXISTS (
            SELECT 1 FROM aset_bidang_tanah bt WHERE bt.aset_id = x.id AND COALESCE(bt.luas,0) > 0)) THEN 1 ELSE 0 END)
      + (CASE WHEN g.kend THEN
            (CASE WHEN nullif(btrim(x.no_polisi),'') IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN nullif(btrim(x.no_rangka),'') IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN nullif(btrim(x.no_mesin),'') IS NOT NULL THEN 1 ELSE 0 END)
          + (CASE WHEN nullif(btrim(x.no_bpkb),'') IS NOT NULL THEN 1 ELSE 0 END)
         ELSE 0 END) AS isi
    FROM aset x
    CROSS JOIN LATERAL (SELECT
      x.golongan IN ('1.3.2','1.3.5','1.3.6','1.5.3','1.5.4') AS merek,
      x.golongan IN ('1.3.1','1.3.3','1.3.4') AS luas,
      x.kode LIKE '1.3.2.02.01.%' AS kend) g
    WHERE x.status = 'aktif' AND x.skpd_id = ANY (v_scope)
  ) k;
  indikator := 'INT_KELENGKAPAN'; pembilang := a; penyebut := b;
  rincian := jsonb_build_object('jumlah_barang', n); RETURN NEXT;

  -- KEP_RKBMD: RKBMD TA (tahun+1) versi murni, per jenis, diajukan ≤ batas.
  -- Sebelum batas lewat, penyebutnya cuma jenis yang sudah diajukan (belum
  -- jatuh tempo tidak boleh dihitung terlambat).
  SELECT count(DISTINCT rk.jenis) FILTER (
           WHERE rk.status IN ('diajukan','disetujui')
             AND (COALESCE(rk.diajukan_at, rk.approved_at) AT TIME ZONE 'Asia/Jakarta')::date <= v_batas_rk),
         jsonb_agg(DISTINCT jsonb_build_object('jenis', rk.jenis, 'status', rk.status,
           'diajukan', (COALESCE(rk.diajukan_at, rk.approved_at) AT TIME ZONE 'Asia/Jakarta')::date))
    INTO a, r
  FROM rkbmd rk
  WHERE rk.skpd_id = ANY (v_scope) AND rk.tahun_anggaran = p_tahun + 1 AND rk.versi = 'murni';
  indikator := 'KEP_RKBMD'; pembilang := a;
  penyebut := CASE WHEN v_hari_ini > v_batas_rk THEN 5 ELSE a END;
  rincian := jsonb_build_object('ta_rkbmd', p_tahun + 1, 'batas', v_batas_rk,
                                'dokumen', COALESCE(r, '[]'::jsonb)); RETURN NEXT;

  -- KEP_REKON: periode yang batasnya sudah lewat; tepat waktu bila
  -- pelaksanaan terverifikasi & tanggalnya ≤ batas.
  SELECT count(*) FILTER (WHERE pl.status = 'diverifikasi' AND pl.tanggal_pelaksanaan <= p.batas_tanggal),
         count(*)
    INTO a, b
  FROM ipa_rekon_periode p
  LEFT JOIN ipa_rekon_pelaksanaan pl ON pl.periode_id = p.id AND pl.skpd_id = p_skpd_id
  WHERE p.tahun = p_tahun AND p.batas_tanggal <= v_hari_ini;
  indikator := 'KEP_REKON'; pembilang := a; penyebut := b; rincian := '{}'; RETURN NEXT;

  -- KEP_ENTRY: kartu Pengadaan (bukan yg diarsipkan) ber-BAST di tahun itu.
  SELECT count(*) FILTER (WHERE (h.created_at AT TIME ZONE 'Asia/Jakarta')::date - t.tgl <= v_hari_ent),
         count(*),
         COALESCE(round(avg((h.created_at AT TIME ZONE 'Asia/Jakarta')::date - t.tgl)), 0)
    INTO a, b, m
  FROM jurnal_header h
  CROSS JOIN LATERAL (SELECT COALESCE(CASE WHEN h.payload->>'tgl_bast' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'tgl_bast')::date END, h.tanggal) AS tgl) t
  WHERE h.kategori = 'pengadaan' AND h.approval_status <> 'ditolak'
    AND h.skpd_id = ANY (v_scope) AND t.tgl BETWEEN v_awal AND v_akhir;
  indikator := 'KEP_ENTRY'; pembilang := a; penyebut := b;
  rincian := jsonb_build_object('batas_hari', v_hari_ent, 'rata_hari', m); RETURN NEXT;

  -- AKT_TLRB: aset rusak berat (kondisi RB atau kode Aset Lain-Lain RB) yang
  -- masih aktif + yang dihapus pada tahun ini.
  WITH rb AS (
    SELECT x.id,
      x.kode LIKE '1.5.4.01.01.01.%' AS direklas,
      EXISTS (SELECT 1 FROM rkbmd_item i JOIN rkbmd rk ON rk.id = i.rkbmd_id
               WHERE i.aset_id = x.id AND rk.jenis = 'penghapusan'
                 AND rk.status IN ('diajukan','disetujui')) AS diusulkan,
      false AS dihapus
    FROM aset x
    WHERE x.status = 'aktif' AND x.skpd_id = ANY (v_scope)
      AND (x.kondisi_barang = 'Rusak Berat' OR x.kode LIKE '1.5.4.01.01.01.%')
    UNION ALL
    SELECT x.id, false, false, true
    FROM aset x
    WHERE x.status = 'dihapus' AND x.skpd_id = ANY (v_scope)
      AND (x.kondisi_barang = 'Rusak Berat' OR x.kode LIKE '1.5.4.01.01.01.%')
      AND EXISTS (SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = x.id
                   AND t.jenis IN ('penghapusan_pemindahtanganan','penghapusan_sebab_lain')
                   AND t.tanggal BETWEEN v_awal AND v_akhir)
  )
  -- ⚠️ Reklas ke Aset Lain-Lain RB SENGAJA TIDAK dihitung tindak lanjut:
  -- diukur 2026-09-25, SELURUH 6.710 aset berkondisi RB sudah berkode
  -- 1.5.4.01.01.01.* — kalau reklas dihitung, indikator ini 100% di semua SKPD
  -- & tak membedakan apa pun. Reklas itu perlakuan akuntansi; tindak lanjutnya
  -- adalah usulan penghapusan / penghapusan.
  SELECT count(*) FILTER (WHERE diusulkan OR dihapus), count(*),
         jsonb_build_object('direklas', count(*) FILTER (WHERE direklas),
                            'diusulkan_hapus', count(*) FILTER (WHERE diusulkan),
                            'dihapus', count(*) FILTER (WHERE dihapus))
    INTO a, b, r FROM rb;
  indikator := 'AKT_TLRB'; pembilang := a; penyebut := b; rincian := r; RETURN NEXT;

  -- AKT_REALISASI: Σ pengadaan + termin KDP tahun ini (tanpa yang dibatalkan)
  -- ÷ Σ RKBMD Pengadaan TA ini yang disetujui (versi perubahan menggantikan
  -- murni bila ada).
  SELECT COALESCE(sum(t.nilai), 0) INTO a
  FROM transaksi_bmd t
  WHERE t.jenis IN ('pengadaan','akumulasi_kdp') AND t.tanggal BETWEEN v_awal AND v_akhir
    AND t.skpd_tujuan = ANY (v_scope)
    AND NOT EXISTS (SELECT 1 FROM transaksi_bmd v WHERE v.aset_id = t.aset_id
                     AND v.jenis IN ('batal_pengadaan','batal_akumulasi_kdp'));
  WITH dok AS (
    SELECT DISTINCT ON (rk.skpd_id) rk.id
    FROM rkbmd rk
    WHERE rk.jenis = 'pengadaan' AND rk.tahun_anggaran = p_tahun AND rk.status = 'disetujui'
      AND rk.skpd_id = ANY (v_scope)
    ORDER BY rk.skpd_id, (rk.versi = 'perubahan') DESC, rk.approved_at DESC NULLS LAST
  )
  SELECT COALESCE(sum(i.total_anggaran), 0) INTO b
  FROM rkbmd_item i WHERE i.rkbmd_id IN (SELECT id FROM dok);
  indikator := 'AKT_REALISASI'; pembilang := a; penyebut := b; rincian := '{}'; RETURN NEXT;

  -- LEG_TANAH: per bidang; tanah tanpa bidang = 1 bidang (dokumen register).
  SELECT COALESCE(sum(CASE WHEN nb > 0 THEN nb_ser
                           WHEN nullif(btrim(x.nomor_dokumen_kepemilikan),'') IS NOT NULL THEN 1 ELSE 0 END), 0),
         COALESCE(sum(GREATEST(nb, 1)), 0),
         count(*)
    INTO a, b, n
  FROM aset x
  CROSS JOIN LATERAL (
    SELECT count(*) AS nb,
           count(*) FILTER (WHERE nullif(btrim(bt.nomor_dokumen_kepemilikan),'') IS NOT NULL) AS nb_ser
    FROM aset_bidang_tanah bt WHERE bt.aset_id = x.id) bd
  WHERE x.status = 'aktif' AND x.golongan = '1.3.1' AND x.skpd_id = ANY (v_scope);
  indikator := 'LEG_TANAH'; pembilang := a; penyebut := b;
  rincian := jsonb_build_object('jumlah_register', n); RETURN NEXT;

  -- LEG_PAJAK: kendaraan bermotor aktif; lunas = bukti tahun ini terverifikasi.
  SELECT count(*) FILTER (WHERE pk.status = 'diverifikasi'), count(*),
         jsonb_build_object('menunggu', count(*) FILTER (WHERE pk.status = 'diajukan'),
                            'ditolak', count(*) FILTER (WHERE pk.status = 'ditolak'))
    INTO a, b, r
  FROM aset x
  LEFT JOIN ipa_pajak_kendaraan pk ON pk.aset_id = x.id AND pk.tahun = p_tahun
  WHERE x.status = 'aktif' AND x.kode LIKE '1.3.2.02.01.%' AND x.skpd_id = ANY (v_scope);
  indikator := 'LEG_PAJAK'; pembilang := a; penyebut := b; rincian := r; RETURN NEXT;

  -- EKO_IDLE — payload diperiksa pola dulu sebelum di-cast: satu isian aneh
  -- tak boleh menjatuhkan penilaian seluruh SKPD.
  SELECT COALESCE(sum(x.nilai_perolehan), 0), count(*) INTO b, n
  FROM aset x
  WHERE x.status = 'aktif' AND x.kode LIKE '1.5.4.01.01.02.%' AND x.skpd_id = ANY (v_scope);
  WITH anggota AS (
    SELECT DISTINCT ON (t.header_id, t.aset_id) t.header_id, t.aset_id, t.jenis
    FROM transaksi_bmd t
    WHERE t.jenis IN ('pemanfaatan','pemanfaatan_selesai','batal_pemanfaatan') AND t.header_id IS NOT NULL
    ORDER BY t.header_id, t.aset_id, t.id DESC
  )
  SELECT COALESCE(sum(COALESCE(CASE WHEN h.payload->>'nilai_pemanfaatan' ~ '^[0-9]+(\.[0-9]+)?$' THEN (h.payload->>'nilai_pemanfaatan')::numeric END, 0)
                      / GREATEST(COALESCE(CASE WHEN h.payload->>'masa_tahun' ~ '^[0-9]+(\.[0-9]+)?$' THEN (h.payload->>'masa_tahun')::numeric END, 1), 1)), 0)
    INTO a
  FROM jurnal_header h
  WHERE h.kategori = 'pemanfaatan'
    AND h.payload->>'jenis_pemanfaatan' IN ('sewa','ksp','bgs_bsg','kspi')
    AND COALESCE(CASE WHEN h.payload->>'mulai' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'mulai')::date END, h.tanggal) <= v_akhir
    AND COALESCE(CASE WHEN h.payload->>'berakhir' ~ '^\d{4}-\d{2}-\d{2}$' THEN (h.payload->>'berakhir')::date END, v_akhir) >= v_awal
    AND EXISTS (SELECT 1 FROM anggota m JOIN aset x ON x.id = m.aset_id
                WHERE m.header_id = h.id AND m.jenis <> 'batal_pemanfaatan'
                  AND x.kode LIKE '1.5.4.01.01.02.%' AND x.skpd_id = ANY (v_scope));
  indikator := 'EKO_IDLE'; pembilang := a; penyebut := b;
  rincian := jsonb_build_object('jumlah_aset_idle', n); RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION fn_ipa_simpan_otomatis(p_tahun int, p_skpd_id bigint)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET work_mem TO '64MB'
AS $$
DECLARE
  v_bulan int;
  v_n int;
BEGIN
  IF NOT (fn_is_admin() OR fn_skpd_visible(p_skpd_id)) THEN
    RAISE EXCEPTION 'Tidak berwenang menghitung IPA SKPD ini.';
  END IF;
  IF p_tahun > extract(year FROM now() AT TIME ZONE 'Asia/Jakarta') THEN
    RAISE EXCEPTION 'Tahun % belum berjalan.', p_tahun;
  END IF;
  -- Tahun lampau → snapshot Desember; tahun berjalan → bulan ini.
  v_bulan := CASE WHEN p_tahun < extract(year FROM now() AT TIME ZONE 'Asia/Jakarta') THEN 12
                  ELSE extract(month FROM now() AT TIME ZONE 'Asia/Jakarta')::int END;

  INSERT INTO ipa_otomatis (tahun, bulan, skpd_id, indikator, pembilang, penyebut, rincian, dihitung_at, dihitung_by)
  SELECT p_tahun, v_bulan, p_skpd_id, h.indikator, h.pembilang, h.penyebut, h.rincian, now(), auth.uid()
  FROM fn_ipa_hitung_otomatis(p_tahun, p_skpd_id) h
  ON CONFLICT (tahun, bulan, skpd_id, indikator) DO UPDATE
    SET pembilang = EXCLUDED.pembilang, penyebut = EXCLUDED.penyebut, rincian = EXCLUDED.rincian,
        dihitung_at = EXCLUDED.dihitung_at, dihitung_by = EXCLUDED.dihitung_by;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Daftar kendaraan bermotor untuk menu Pajak (cakupan sama dgn penilaian).
CREATE OR REPLACE FUNCTION fn_ipa_kendaraan(p_tahun int, p_skpd_id bigint)
RETURNS TABLE (aset_id uuid, nibar text, kode text, uraian_barang text, nama_barang text, merek_tipe text,
               no_polisi text, skpd_id bigint, pajak_id uuid, tanggal_bayar date, status text,
               catatan_verifikator text, bukti_paths text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (fn_is_admin() OR fn_is_viewer() OR fn_skpd_visible(p_skpd_id)) THEN
    RAISE EXCEPTION 'Tidak berwenang melihat kendaraan SKPD ini.';
  END IF;
  RETURN QUERY
  SELECT x.id, x.nibar, x.kode, x.uraian_barang, x.nama_barang, x.merek_tipe, x.no_polisi, x.skpd_id,
         pk.id, pk.tanggal_bayar, pk.status, pk.catatan_verifikator, pk.bukti_paths
  FROM aset x
  LEFT JOIN ipa_pajak_kendaraan pk ON pk.aset_id = x.id AND pk.tahun = p_tahun
  WHERE x.status = 'aktif' AND x.kode LIKE '1.3.2.02.01.%' AND x.skpd_id = ANY (fn_ipa_scope(p_skpd_id))
  ORDER BY x.kode, x.no_polisi NULLS LAST, x.id;
END $$;

-- ── 9. RLS & GRANT ─────────────────────────────────────────────────────────
ALTER TABLE ipa_klaster ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_aspek ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_bobot_aspek ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_indikator ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_parameter ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_skpd ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_isian ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_rekon_periode ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_rekon_pelaksanaan ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_pajak_kendaraan ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipa_otomatis ENABLE ROW LEVEL SECURITY;

-- Referensi: dibaca semua pengguna login, ditulis Admin Pemda saja.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ipa_klaster','ipa_aspek','ipa_bobot_aspek','ipa_indikator','ipa_parameter','ipa_skpd','ipa_rekon_periode']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING ((SELECT fn_is_admin())) WITH CHECK ((SELECT fn_is_admin()))', t || '_write', t);
  END LOOP;
END $$;

-- Isian SKPD: baca = admin/pengawas/SKPD ybs; tulis = SKPD ybs (induk) atau admin.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ipa_isian','ipa_rekon_pelaksanaan','ipa_pajak_kendaraan']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING ((SELECT fn_is_admin()) OR (SELECT fn_is_viewer()) OR fn_skpd_visible(skpd_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id)) WITH CHECK ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING ((SELECT fn_is_admin()) OR fn_skpd_visible(skpd_id))', t || '_delete', t);
  END LOOP;
END $$;

-- Hasil otomatis: dibaca semua pengguna login (angka penilaian terbuka lintas
-- SKPD, sama seperti dashboard lama); DITULIS HANYA lewat RPC.
DROP POLICY IF EXISTS ipa_otomatis_select ON ipa_otomatis;
CREATE POLICY ipa_otomatis_select ON ipa_otomatis FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON ipa_otomatis FROM authenticated, anon;

REVOKE ALL ON FUNCTION fn_ipa_scope(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_ipa_hitung_otomatis(int, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_ipa_simpan_otomatis(int, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_ipa_kendaraan(int, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION fn_ipa_pajak_cek_aset() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_ipa_scope(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_ipa_hitung_otomatis(int, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_ipa_simpan_otomatis(int, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_ipa_kendaraan(int, bigint) TO authenticated;
