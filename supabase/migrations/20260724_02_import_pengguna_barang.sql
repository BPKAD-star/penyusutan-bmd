-- ============================================================================
-- Import Pengguna Barang (66 orang, 10 rangkap) dari 'Pengguna Barang.xlsx'.
-- Sumber data: sheet 'Sheet1' (66 baris) divalidasi silang thd sheet
-- 'admin_skpd_rows' (dump admin_skpd) -- semua SKPD ID & nama COCOK, semua NIP
-- 18 digit valid, tidak ada baris kosong.
--
-- KENAPA SQL, BUKAN IMPORT EXCEL: 10 orang merangkap 2 SKPD (NIP sama, baris
-- beda) -- upsert onConflict('nip') Import Excel akan ERROR (Postgres menolak
-- 'ON CONFLICT DO UPDATE command cannot affect row a second time' saat NIP sama
-- muncul 2x dlm 1 statement), dan Import Excel tidak tahu apa-apa soal tabel
-- admin_pegawai_penugasan (rangkap) -- salah satu SKPD akan hilang diam-diam.
--
-- ATURAN pokok/rangkap (dikonfirmasi user 2026-07-24): jabatan DEFINITIF jadi
-- SKPD pokok (admin_pegawai), jabatan Plt. jadi rangkap (admin_pegawai_penugasan).
-- Pengecualian: drh. Tutik Purwaningsih (kedua jabatan definitif, tanpa Plt)
-- -- pokok dipilih manual = Dinas Perdagangan dan Perindustrian (id=25).
--
-- IDEMPOTEN: aman dijalankan ulang (upsert by NIP utk pokok, ON CONFLICT DO
-- UPDATE utk rangkap by (pegawai_id, skpd_id)). Jalankan SETELAH migrasi
-- 20260724_01_pegawai_penugasan_rangkap.sql.
-- ============================================================================

BEGIN;

-- ── 1. Penugasan POKOK (56 orang) — upsert ke admin_pegawai by NIP ──────────
INSERT INTO admin_pegawai (nip, nama, pangkat, golongan, jabatan, jenis_kelamin, role_bmd, skpd_id)
VALUES
  ('196912081996021001', 'Dr. Mohamad Solikin, M.A.P.', 'Pembina Utama Muda', 'IV/c', 'Kepala Sekretariat Daerah', 'L', 'pengguna_barang', 26),
  ('197704141998031005', 'Ilario Mendes, S.S.T.P., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Sekretariat DPRD', 'L', 'pengguna_barang', 60),
  ('197105301997031005', 'Wirawan, S.E., M.M.Ak.', 'Pembina Utama Muda', 'IV/c', 'Kepala Inspektorat', 'L', 'pengguna_barang', 32),
  ('196705201994121004', 'Dr. Mokhamat Muhsin, M.Pd.', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Pendidikan', 'L', 'pengguna_barang', 2),
  ('197602271996021001', 'Mustika Prayitno Adi, S.Sos., M.M.', 'Pembina', 'IV/a', 'Kepala Dinas Pariwisata dan Kebudayaan', 'L', 'pengguna_barang', 23),
  ('196810292003122002', 'dr. Nurwulan Andadari', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Pengendalian Penduduk, Keluarga Berencana, Pemberdayaan Perempuan dan Perlindungan Anak', 'P', 'pengguna_barang', 16),
  ('197009131992011001', 'Agus Cahyono, S.Sos.', 'Pembina Utama Muda', 'IV/c', 'Kepala Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa', 'L', 'pengguna_barang', 15),
  ('197003242002121003', 'dr. Ahmad Khotib', 'Pembina Utama Muda', 'IV/c', 'Kepala Dinas Kesehatan', 'L', 'pengguna_barang', 3),
  ('197509271995111002', 'Subur Widono, S.S.T.P., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Sosial', 'L', 'pengguna_barang', 10),
  ('197501031993111001', 'Joko Suwono, S.Sos., M.A.P.', 'Pembina Utama Muda', 'IV/c', 'Kepala Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu', 'L', 'pengguna_barang', 20),
  ('197004151993011001', 'Santoso, S.Sos, MM', 'Pembina Tingkat I', 'IV/b', 'Kepala Bagian Perekonomian dan Sumber Daya Alam', 'L', 'pengguna_barang', 185),
  ('197408072003122004', 'drh. Tutik Purwaningsih', 'Pembina Utama Muda', 'IV/c', 'Kepala Dinas Perdagangan dan Perindustrian', 'P', 'pengguna_barang', 25),
  ('197210102005011014', 'Ibnu Imad, S.Sos.', 'Pembina', 'IV/a', 'Kepala Dinas Tenaga Kerja', 'L', 'pengguna_barang', 11),
  ('197310051993012003', 'Diana Herawati, S.SiT, M.PH', 'Pembina', 'IV/a', 'Kepala Bagian Protokol dan Komunikasi Pimpinan', 'P', 'pengguna_barang', 189),
  ('197305022003121006', 'Irwan Chandra Wahyu Purnama, S.T., M.M.T.', 'Pembina', 'IV/a', 'Kepala Dinas Pekerjaan Umum dan Penataan Ruang', 'L', 'pengguna_barang', 6),
  ('197507011994121001', 'Mohamad Nizam Subekhi, S.Sos., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Perhubungan', 'L', 'pengguna_barang', 17),
  ('197106141992031004', 'Putut Agung Subekti, S.E., M.M.', 'Pembina', 'IV/a', 'Kepala Dinas Lingkungan Hidup', 'L', 'pengguna_barang', 13),
  ('197305051998031012', 'Nur Hafid, S.Pt., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Perikanan', 'L', 'pengguna_barang', 22),
  ('196703071990031006', 'H. Sukadi, S.E., M.M.', 'Pembina Tingkat I', 'IV/b', 'Plt. Kepala Dinas Pertanian dan Perkebunan', 'L', 'pengguna_barang', 24),
  ('196902231989031002', 'Drs. Sri Ilham Wahyu Subekti, M.Si.', 'Pembina Tingkat I', 'IV/b', 'Kepala Dinas Kearsipan dan Perpustakaan', 'L', 'pengguna_barang', 21),
  ('196807211988101001', 'Drs. Kaleb Untung Satrio Witjaksono, M.M.', 'Pembina Tingkat I', 'IV/b', 'Plt. Kepala Satuan Polisi Pamong Praja', 'L', 'pengguna_barang', 8),
  ('198612182007011004', 'R. Randy Agatha Sakaira, S.I.P., M.Si.', 'Pembina', 'IV/a', 'Kepala Badan Kepegawaian Dan Pengembangan Sumber Daya Manusia', 'L', 'pengguna_barang', 30),
  ('197405251993111001', 'Dede Sujana, S.Sos., M.Si.', 'Pembina Utama Muda', 'IV/c', 'Plt. Kepala Badan Keuangan dan Aset Daerah', 'L', 'pengguna_barang', 28),
  ('196702011986021003', 'Drs. Eko Setiyono, M.Si.', 'Pembina Utama Muda', 'IV/c', 'Kepala Badan Pendapatan Daerah', 'L', 'pengguna_barang', 29),
  ('196802141999011001', 'Ir. Agus Sugiarto, M.A.P.', 'Pembina Tingkat I', 'IV/b', 'Plt. Kepala Badan Riset dan Inovasi Daerah', 'L', 'pengguna_barang', 31),
  ('197007171996021002', 'Yuli Marwantoko, S.E., M.M.', 'Pembina', 'IV/a', 'Kepala Badan Kesatuan Bangsa dan Politik', 'L', 'pengguna_barang', 59),
  ('196912261989031001', 'Stefanus Djoko Sukrisno, S.Sos, MM', 'Pembina', 'IV/a', 'Kepala Badan Penanggulangan Bencana Daerah', 'L', 'pengguna_barang', 9),
  ('198107252009011006', 'Toni Cahyono, SE, MMA', 'Penata Tingkat I', 'III/d', 'Kepala Bagian Perencanaan dan Keuangan', 'L', 'pengguna_barang', 190),
  ('197401201998032006', 'Dwi Sudiartanti, SH, MH', 'Pembina', 'IV/a', 'Kepala Bagian Hukum', 'P', 'pengguna_barang', 183),
  ('198403272010011018', 'Anang Siswahyudi S.AP., M.Si.', 'Penata Tingkat I', 'III/d', 'Plt. Kepala Bagian Organisasi', 'L', 'pengguna_barang', 188),
  ('196808191990121001', 'Sumarlan, S.H., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Bagian Kesejahteraan Rakyat', 'L', 'pengguna_barang', 184),
  ('197809092010011015', 'Hari Santosa, S.T.', 'Penata Tingkat I', 'III/d', 'Kepala Bagian Pembangunan dan Pengadaan Barang/Jasa', 'L', 'pengguna_barang', 186),
  ('197108081991011001', 'Iwan Agus Wijaya, S.Sos.', 'Pembina', 'IV/a', 'Kepala Bagian Tata Pemerintahan', 'L', 'pengguna_barang', 182),
  ('198010032006041017', 'Prasetyo Iswahyudi, S.A.P., M.Si.', 'Pembina', 'IV/a', 'Kepala Kecamatan Badas', 'L', 'pengguna_barang', 57),
  ('197310011993011001', 'Hari Utomo, S.Sos.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Banyakan', 'L', 'pengguna_barang', 53),
  ('197603012006041015', 'Hario Kuncoro Yekti, S.E.', 'Pembina', 'IV/a', 'Plt. Kepala Kecamatan Gampengrejo', 'L', 'pengguna_barang', 43),
  ('198610032006021002', 'Galuh Triad Madi, S.STP', 'Penata Tingkat I', 'III/d', 'Plt. Kepala Kecamatan Grogol', 'L', 'pengguna_barang', 44),
  ('197108181991011001', 'Moch. Imron, S.Sos., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Gurah', 'L', 'pengguna_barang', 41),
  ('196801251992031005', 'Eko Wahyudi, SE, MM', 'Pembina', 'IV/a', 'Plt. Kepala Kecamatan Kandangan', 'L', 'pengguna_barang', 50),
  ('196905021992021004', 'Edhi Purwanto, S.H.', 'Pembina', 'IV/a', 'Kepala Kecamatan Kandat', 'L', 'pengguna_barang', 36),
  ('196901101990031010', 'Mashudi, SE, MM', 'Pembina', 'IV/a', 'Plt. Kepala Kecamatan Kayen Kidul', 'L', 'pengguna_barang', 55),
  ('196903111995061001', 'Mokhamad Saroni, S.Pd.SD.', 'Pembina', 'IV/a', 'Kepala Kecamatan Kepung', 'L', 'pengguna_barang', 49),
  ('197206091994031005', 'Jiwo, SE', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Ngadiluwih', 'L', 'pengguna_barang', 35),
  ('197212251998031013', 'Hadi Subagia, S.H., M.H.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Kunjang', 'L', 'pengguna_barang', 52),
  ('197306062003121010', 'Moh. Nurul Hasan, ST', 'Pembina', 'IV/a', 'Plt. Kepala Kecamatan Mojo', 'L', 'pengguna_barang', 33),
  ('197310281992011001', 'Drs. Moh. Muthoin', 'Pembina', 'IV/a', 'Plt. Kepala Kecamatan Ngancar', 'L', 'pengguna_barang', 38),
  ('196903161993031006', 'Edy Subiyakto, S.E.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Ngasem', 'L', 'pengguna_barang', 56),
  ('198007261999122001', 'Nuning Zahro, S.STP', 'Pembina', 'IV/a', 'Kepala Kecamatan Pagu', 'P', 'pengguna_barang', 42),
  ('198510032003121004', 'Andrea Rangga Primansya, S.S.T.P., M.M.', 'Pembina', 'IV/a', 'Kepala Kecamatan Papar', 'L', 'pengguna_barang', 45),
  ('197406202005011008', 'Habib Adnan, S.Sos', 'Penata Tingkat I', 'III/d', 'Plt. Kepala Kecamatan Pare', 'L', 'pengguna_barang', 48),
  ('197410091993031001', 'Anto Riandoko, S.Sos., M.M.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Plemahan', 'L', 'pengguna_barang', 47),
  ('197905162006041029', 'Dwi Putra Kokok Dirgantara, S.Psi', 'Penata Tingkat I', 'III/d', 'Plt. Kepala Kecamatan Plosoklaten', 'L', 'pengguna_barang', 40),
  ('197807111998101002', 'Firman Tappa, S.S.T.P., M.H.', 'Pembina', 'IV/a', 'Kepala Kecamatan Puncu', 'L', 'pengguna_barang', 39),
  ('196909291996021001', 'Drs. Buyung Imanu', 'Pembina', 'IV/a', 'Kepala Kecamatan Purwoasri', 'L', 'pengguna_barang', 46),
  ('196907191998031005', 'Drs. Suharsono, M.Pd.', 'Pembina Tingkat I', 'IV/b', 'Kepala Kecamatan Tarokan', 'L', 'pengguna_barang', 51),
  ('196904081998031014', 'Sugeng Margono, SE', 'Penata Tingkat I', 'III/d', 'Plt. Kepala Kecamatan Wates', 'L', 'pengguna_barang', 37)
ON CONFLICT (nip) DO UPDATE SET
  nama = EXCLUDED.nama, pangkat = EXCLUDED.pangkat, golongan = EXCLUDED.golongan,
  jabatan = EXCLUDED.jabatan, jenis_kelamin = EXCLUDED.jenis_kelamin,
  role_bmd = EXCLUDED.role_bmd, skpd_id = EXCLUDED.skpd_id, updated_at = now();

-- ── 2. Penugasan RANGKAP (10 orang) — insert ke admin_pegawai_penugasan ─────
-- pegawai_id dicari via subquery by NIP (baris pokoknya baru saja di-upsert di atas).
-- keterangan menyimpan teks jabatan Plt (admin_pegawai_penugasan belum py kolom
-- jabatan sendiri -- lihat catatan di respons chat).
INSERT INTO admin_pegawai_penugasan (pegawai_id, skpd_id, role_bmd, keterangan)
SELECT ap.id, v.skpd_id, 'pengguna_barang', v.keterangan
FROM (VALUES
  ('197105301997031005', 14, 'Plt. Kepala Dinas Kependudukan dan Pencatatan Sipil'),
  ('197501031993111001', 27, 'Plt. Kepala Badan Perencanaan Pembangunan Daerah'),
  ('197004151993011001', 19, 'Plt. Kepala Dinas Koperasi dan Usaha Mikro'),
  ('197408072003122004', 12, 'Kepala Dinas Ketahanan Pangan dan Peternakan'),
  ('197310051993012003', 18, 'Plt. Kepala Dinas Komunikasi dan Informatika'),
  ('197305022003121006', 7, 'Plt. Kepala Dinas Perumahan dan Kawasan Permukiman'),
  ('198107252009011006', 187, 'Plt. Kepala Bagian Umum'),
  ('196905021992021004', 54, 'Plt. Kepala Kecamatan Ringinrejo'),
  ('197206091994031005', 34, 'Plt. Kepala Kecamatan Kras'),
  ('197410091993031001', 58, 'Plt. Kepala Kecamatan Semen')
) AS v(nip, skpd_id, keterangan)
JOIN admin_pegawai ap ON ap.nip = v.nip
ON CONFLICT (pegawai_id, skpd_id) DO UPDATE SET keterangan = EXCLUDED.keterangan, updated_at = now();

-- ── 3. Sanity check — gagalkan transaksi kalau jumlah baris tak sesuai ──────
DO $$
DECLARE v_pokok int; v_rangkap int;
BEGIN
  SELECT count(*) INTO v_pokok FROM admin_pegawai WHERE nip IN ('196912081996021001', '197704141998031005', '197105301997031005', '196705201994121004', '197602271996021001', '196810292003122002', '197009131992011001', '197003242002121003', '197509271995111002', '197501031993111001', '197004151993011001', '197408072003122004', '197210102005011014', '197310051993012003', '197305022003121006', '197507011994121001', '197106141992031004', '197305051998031012', '196703071990031006', '196902231989031002', '196807211988101001', '198612182007011004', '197405251993111001', '196702011986021003', '196802141999011001', '197007171996021002', '196912261989031001', '198107252009011006', '197401201998032006', '198403272010011018', '196808191990121001', '197809092010011015', '197108081991011001', '198010032006041017', '197310011993011001', '197603012006041015', '198610032006021002', '197108181991011001', '196801251992031005', '196905021992021004', '196901101990031010', '196903111995061001', '197206091994031005', '197212251998031013', '197306062003121010', '197310281992011001', '196903161993031006', '198007261999122001', '198510032003121004', '197406202005011008', '197410091993031001', '197905162006041029', '197807111998101002', '196909291996021001', '196907191998031005', '196904081998031014');
  IF v_pokok <> 56 THEN RAISE EXCEPTION 'Pokok tercatat % dari 56 yang diharapkan', v_pokok; END IF;
  SELECT count(*) INTO v_rangkap FROM admin_pegawai_penugasan ap2
    JOIN admin_pegawai p ON p.id = ap2.pegawai_id
    WHERE p.nip IN ('197105301997031005', '197501031993111001', '197004151993011001', '197408072003122004', '197310051993012003', '197305022003121006', '198107252009011006', '196905021992021004', '197206091994031005', '197410091993031001');
  IF v_rangkap <> 10 THEN RAISE EXCEPTION 'Rangkap tercatat % dari 10 yang diharapkan', v_rangkap; END IF;
  RAISE NOTICE 'OK: % pokok, % rangkap tercatat.', v_pokok, v_rangkap;
END $$;

COMMIT;
