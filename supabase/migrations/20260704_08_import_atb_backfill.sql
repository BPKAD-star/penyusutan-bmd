-- ============================================================================
-- Backfill 120 Aset Tak Berwujud (ATB, kode 1.5.3) yang belum masuk saldo_awal_2026.
-- Sumber: "Import ATB.xlsx" (export e-bmd, posisi akhir 2025) — barang lama
-- yang SUDAH py riwayat penyusutan (sebagian malah sudah habis masa manfaatnya),
-- BUKAN barang baru. Jadi jalurnya = saldo_awal (bukan pengadaan/hibah biasa),
-- persis pola migrasi baseline 6.518 aset awal (lihat 20260702_03).
--
-- Jalankan BERTAHAP di Supabase SQL Editor:
--   STEP 0 → cek dulu semua Nama SKPD di file sumber cocok ke tabel skpd.
--            Kalau ada baris "id IS NULL", JANGAN lanjut — kasih tahu saya nama
--            SKPD yang tidak cocok (biasanya beda ejaan/singkatan).
--   STEP 1 → insert 120 baris ke saldo_awal_2026 (re-runnable, skip yg nibar-nya
--            sudah ada di saldo_awal_2026).
--   STEP 2 → register ke aset + catat transaksi ledger 'saldo_awal' — INI PERSIS
--            re-run dua blok dari 20260702_03_saldo_awal_ke_ledger.sql, aman
--            dijalankan ulang karena sudah guard NOT EXISTS (hanya akan
--            memproses baris yang barusan masuk di STEP 1, 6.518 aset lama
--            tidak tersentuh lagi).
--   STEP 3 → verifikasi jumlah.
-- Setelah ini selesai, jalankan "Jalankan Engine" di menu Penyusutan untuk
-- periode 2025-S2 s.d. periode berjalan supaya penyusutan_semester ke-generate.
-- ============================================================================

-- ── STEP 0: Verifikasi Nama SKPD cocok ke tabel skpd (jalankan & cek dulu) ──
-- Harus 0 baris dengan id IS NULL. Kalau ada, JANGAN lanjut ke STEP 1.
SELECT v.nama_skpd, s.id
FROM (VALUES
  ('Badan Riset dan Inovasi Daerah'),
  ('Badan Kepegawaian dan Pengembangan Sumber Daya Manusia'),
  ('Badan Pendapatan Daerah'),
  ('Badan Keuangan dan Aset Daerah'),
  ('Badan Perencanaan Pembangunan Daerah'),
  ('Sekretariat DPRD'),
  ('Sekretariat Daerah'),
  ('Dinas Perdagangan dan Perindustrian'),
  ('Dinas Pertanian dan Perkebunan'),
  ('Dinas Pariwisata dan Kebudayaan'),
  ('Dinas Perikanan'),
  ('Dinas Kearsipan dan Perpustakaan'),
  ('Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu'),
  ('Dinas Koperasi dan Usaha Mikro'),
  ('Dinas Komunikasi dan Informatika'),
  ('Dinas Perhubungan'),
  ('Dinas Pengendalian Penduduk, Keluarga Berencana, Pemberdayaan Perempuan dan Perlindungan Anak'),
  ('Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa'),
  ('Dinas Kependudukan dan Pencatatan Sipil'),
  ('Dinas Lingkungan Hidup'),
  ('Dinas Ketahanan Pangan dan Peternakan'),
  ('Dinas Sosial'),
  ('Badan Penanggulangan Bencana Daerah'),
  ('Satuan Polisi Pamong Praja'),
  ('RSUD SLG'),
  ('RSUD Kabupaten Kediri'),
  ('Dinas Kesehatan'),
  ('Dinas Pendidikan'),
  ('Dinas Pekerjaan Umum dan Penataan Ruang')
) AS v(nama_skpd)
LEFT JOIN skpd s ON regexp_replace(trim(s.nama), '\s+', ' ', 'g') = v.nama_skpd;

-- ── STEP 1: Insert 120 baris ke saldo_awal_2026 (re-runnable) ───────────────
INSERT INTO saldo_awal_2026 (
  nibar, kode_barang, nama_barang, skpd_id, nilai_perolehan, intra_ekstra,
  tgl_perolehan, masa_manfaat_smt, akumulasi_2025, nilai_buku_awal,
  sisa_masa_manfaat_smt, beban_penyusutan_per_smt
)
SELECT v.nibar, v.kode_barang, v.nama_barang, v.skpd_id, v.nilai_perolehan,
       v.intra_ekstra, v.tgl_perolehan::date, v.masa_manfaat_smt,
       v.akumulasi_2025, v.nilai_buku_awal, v.sisa_masa_manfaat_smt,
       v.beban_penyusutan_per_smt
FROM (VALUES
  ('120153063000000000000020151530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Riset dan Inovasi Daerah' LIMIT 1),12900000,'intra','2015-06-30',10,12900000,0,0,0),
  ('120153062900000000000020221530101050010000002','1.5.3.01.01.05.001','SIBANGKOMAR',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),47000000,'intra','2022-03-02',10,28200000,18800000,4,4700000),
  ('120153062900000000000020221530101050010000001','1.5.3.01.01.05.001','SIPRES SISTEM PRESENSI KEPEGAWAIAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),48990738,'intra','2022-09-30',10,29394442.800000001,19596295.199999999,4,4899073.8),
  ('120153062900000000000020221530101050010000003','1.5.3.01.01.05.001','E-BESTIE Aplikasi',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),74519684,'intra','2022-12-16',10,44711810.399999999,29807873.600000001,4,7451968.4000000004),
  ('120153062900000000000020231530101050010000001','1.5.3.01.01.05.001','System.Xml.XmlElement',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),49839000,'intra','2023-06-12',10,24919500,24919500,5,4983900),
  ('120153062900000000000020231530101050010000002','1.5.3.01.01.05.001','Aplikasi Sistem Informasi Penatausahaan Keuangan (SIPK) Software',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),29900000,'intra','2023-11-24',10,11960000,17940000,6,2990000),
  ('120135062900000000000020241530101050010000001','1.5.3.01.01.05.001','Software (SIMETRI)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Kepegawaian dan Pengembangan Sumber Daya Manusia' LIMIT 1),90798000,'intra','2024-11-01',10,27239400,63558600,7,9079800),
  ('120153062800000000000020121530101050010000001','1.5.3.01.01.05.001','DATABASE ORACLE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),307647300,'intra','2012-10-26',10,307647300,0,0,0),
  ('120153062800000000000020121530101050010000002','1.5.3.01.01.05.001','SOFTWARE GIS DELTA 9',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),80000000,'intra','2012-12-31',10,80000000,0,0,0),
  ('120153062800000000000020131530101050010000001','1.5.3.01.01.05.001','APLIKASI SISTEM INFORMASI ADMINITRASI PENDAPATAN DAERAH (SIAPDA)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),77888500,'intra','2013-10-04',10,77888500,0,0,0),
  ('120153062800000000000020141530101050010000001','1.5.3.01.01.05.001','INTALASI PC CLIENT SMARMAP',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),9950000,'intra','2014-10-24',10,9950000,0,0,0),
  ('120153062800000000000020151530101050010000001','1.5.3.01.01.05.001','WEBSITE DISPENDA',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),23900000,'intra','2015-11-23',10,23900000,0,0,0),
  ('120153062800000000000020181530101050010000001','1.5.3.01.01.05.001','OS WINDOWS SERVER',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),14800000,'intra','2018-11-12',10,14800000,0,0,0),
  ('120153062800000000000020181530101050010000002','1.5.3.01.01.05.001','OS WINDOWS SERVER',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),14800000,'intra','2018-11-12',10,14800000,0,0,0),
  ('120153062800000000000020181530101050010000004','1.5.3.01.01.05.001','APLIKASI E-SPTPD',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),55000000,'intra','2018-12-14',10,55000000,0,0,0),
  ('120153062800000000000020181530101050010000003','1.5.3.01.01.05.001','Tidak ditemukan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),180350000,'intra','2018-12-20',10,97433333.333333328,82916666.666666672,5,16583333.333333334),
  ('120153062800000000000020201530101050010000001','1.5.3.01.01.05.001','Tidak ditemukan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),129739000,'intra','2020-12-10',10,89739000,40000000,4,10000000),
  ('120153062800000000000020221530101050010000002','1.5.3.01.01.05.001','Tidak ditemukan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),234500000,'intra','2022-01-01',10,80465000,154035000,9,17115000),
  ('120153062800000000000020221530101050010000001','1.5.3.01.01.05.001','SiPAKU Berbasis Web Application',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),27000000,'intra','2022-01-01',10,18900000,8100000,6,1350000),
  ('120135062800000000000020251530101050010000004','1.5.3.01.01.05.001','sofwere aplikasi Mypendapatan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Pendapatan Daerah' LIMIT 1),88500000,'intra','2025-10-20',10,8850000,79650000,9,8850000),
  ('120153062700000000000020191530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Keuangan dan Aset Daerah' LIMIT 1),132380000,'intra','2019-11-12',10,132380000,0,0,0),
  ('120153062600000000000020191530101050010000002','1.5.3.01.01.05.001','APLIKASI PERJALANAN DINAS',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Perencanaan Pembangunan Daerah' LIMIT 1),44979000,'intra','2019-10-30',10,44979000,0,0,0),
  ('120153062600000000000020191530101050010000001','1.5.3.01.01.05.001','APLIKASI PERSEDIAAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Perencanaan Pembangunan Daerah' LIMIT 1),44979000,'intra','2019-11-29',10,44979000,0,0,0),
  ('120153069900000000000020191530101050010000001','1.5.3.01.01.05.001','SOFTWARE CUSTOM PROGRAM WEB BASED',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat DPRD' LIMIT 1),9700000,'intra','2019-12-31',10,9700000,0,0,0),
  ('120153069900000000000020191530101050010000002','1.5.3.01.01.05.001','SOFTWARE MULTI REPORT SYSTEM',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat DPRD' LIMIT 1),37510000,'intra','2019-12-31',10,37510000,0,0,0),
  ('120153069900000000000020211530101050010000001','1.5.3.01.01.05.001','Aplikasi E - Surat',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat DPRD' LIMIT 1),37500000,'intra','2021-12-14',10,33750000,3750000,1,3750000),
  ('120153062500000005000020131530101050010000001','1.5.3.01.01.05.001','SOFTWARE SIMEP',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),51367500,'intra','2013-11-25',10,51367500,0,0,0),
  ('120153062500000006000020191530101050010000001','1.5.3.01.01.05.001','APLIKASI PROGRAM SMART BUILDING INFORMATION (Si Ruang)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),119630000,'intra','2019-12-08',10,99674400,19955600,4,4988900),
  ('120153062500000007000020221530101050010000001','1.5.3.01.01.05.001','Aplikasi E-SAKIP',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),29970000,'intra','2022-10-31',10,20979000,8991000,3,2997000),
  ('120153062500000007000020231530101050010000001','1.5.3.01.01.05.001','Aplikasi Kian Prima',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),29999000,'intra','2023-03-30',10,14999500,14999500,5,2999900),
  ('120153062500000009000020231530101050010000001','1.5.3.01.01.05.001','Aplikasi e-SAKU',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),34500000,'intra','2023-11-06',10,13800000,20700000,6,3450000),
  ('120153062500000001000020231530101050010000001','1.5.3.01.01.05.001','Aplikasi E-LKPJ',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Sekretariat Daerah' LIMIT 1),49000000,'intra','2023-12-01',10,19600000,29400000,6,4900000),
  ('120153062400000000000020141530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK SYSTEM PARKIR PASAR INDUK',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),129460915,'intra','2014-06-30',10,116762515,12698400,4,3174600),
  ('120153062400000000000020151530101050010000001','1.5.3.01.01.05.001','WEBSITE PASAR INDUK',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),24650000,'intra','2015-06-30',10,24650000,0,0,0),
  ('120153062400000000000020171530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),49850000,'intra','2017-10-18',10,49850000,0,0,0),
  ('120153062400000000000020181530101050010000001','1.5.3.01.01.05.001','SOFTWARE BDKT METROLOGI',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),44870000,'intra','2018-12-31',10,44870000,0,0,0),
  ('120153062400000000000020211530101050010000001','1.5.3.01.01.05.001','Website SIMARKO',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),105140000,'intra','2021-09-21',10,74502000,30638000,4,7659500),
  ('120153062400000000000020221530101050010000002','1.5.3.01.01.05.001','Website LARISI',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),98165000,'intra','2022-09-27',10,58899000,39266000,4,9816500),
  ('120153062400000000000020221530101050010000001','1.5.3.01.01.05.001','Website Dinas Perdagangan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),12900000,'intra','2022-11-30',10,7740000,5160000,4,1290000),
  ('120153062400000000000020221530101050010000003','1.5.3.01.01.05.001','Website SIMPEL TERUKUR',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perdagangan dan Perindustrian' LIMIT 1),39212000,'intra','2022-12-09',10,23527200,15684800,4,3921200),
  ('120153062300000000000020141530101050010000001','1.5.3.01.01.05.001','SISTEM INFORMASI PERTANIAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pertanian dan Perkebunan' LIMIT 1),49179500,'intra','2014-06-30',10,49179500,0,0,0),
  ('120153062300000000000020221530101090010000001','1.5.3.01.01.09.001','Digital Farming',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pertanian dan Perkebunan' LIMIT 1),427796220,'intra','2022-12-07',10,256677732,171118488,4,42779622),
  ('120153062200000000000020181530101050010000001','1.5.3.01.01.05.001','SOFTWARE PENGELOLAAN RETRIBUSI TEMPAT REKREASI DAN OLAHRAGA',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pariwisata dan Kebudayaan' LIMIT 1),10000000,'intra','2018-12-27',10,10000000,0,0,0),
  ('120153062200000000000020191530101050010000001','1.5.3.01.01.05.001','APLIKASI E-KEDIRI TOURISM INFORMATION',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pariwisata dan Kebudayaan' LIMIT 1),9950000,'intra','2019-11-25',10,9950000,0,0,0),
  ('120153062100000000000020151530101090010000001','1.5.3.01.01.09.001','SUB DOMAIN DISNAKKAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perikanan' LIMIT 1),9999000,'intra','2015-06-30',10,9999000,0,0,0),
  ('120153062000000000000020221530101050010000001','1.5.3.01.01.05.001','Software',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kearsipan dan Perpustakaan' LIMIT 1),359063903,'intra','2022-11-07',10,125645750.3,233418152.69999999,9,25935350.300000001),
  ('120135062000000000000020241530101050010000002','1.5.3.01.01.05.001','Aplikasi POCADI (Pojok Baca Digital)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kearsipan dan Perpustakaan' LIMIT 1),25000000,'intra','2024-01-01',10,10000000,15000000,6,2500000),
  ('120153061900000000000020161530101050010000002','1.5.3.01.01.05.001','APLIKASI SIMPATIK',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu' LIMIT 1),47800000,'intra','2016-11-24',10,47800000,0,0,0),
  ('120153061900000000000020161530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu' LIMIT 1),69850000,'intra','2016-11-29',10,69850000,0,0,0),
  ('120153061800000000000020211530101050010000001','1.5.3.01.01.05.001','Aplikasi Pelaporan dan Pengawasan Koperasi',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Koperasi dan Usaha Mikro' LIMIT 1),109195000,'intra','2021-10-08',10,72107500,37087500,6,6181250),
  ('120153061800000000000020221530101050010000001','1.5.3.01.01.05.001','Website Katalog UMKM Kab. Kediri',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Koperasi dan Usaha Mikro' LIMIT 1),49800000,'intra','2022-08-26',10,34860000,14940000,3,4980000),
  ('120153061800000000000020231530101050010000001','1.5.3.01.01.05.001','Aplikasi Data UMKM SISDATUM',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Koperasi dan Usaha Mikro' LIMIT 1),39904500,'intra','2023-12-14',10,15961800,23942700,6,3990450),
  ('120153061700000000000020181530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Komunikasi dan Informatika' LIMIT 1),189000000,'intra','2018-12-31',10,189000000,0,0,0),
  ('120153061700000000000020181530101050010000002','1.5.3.01.01.05.001','SOFTWARE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Komunikasi dan Informatika' LIMIT 1),106766000,'intra','2018-12-31',10,106766000,0,0,0),
  ('120153061700000000000020221530101050010000002','1.5.3.01.01.05.001','Sophos Sophos Accessoris 4 Port 10GbE SFP+ Flexi Port Module (For XG 550)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Komunikasi dan Informatika' LIMIT 1),58000000,'intra','2022-12-15',10,34800000,23200000,4,5800000),
  ('120153061700000000000020221530101050010000001','1.5.3.01.01.05.001','Software Software Aplikasi Halo Masbup',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Komunikasi dan Informatika' LIMIT 1),173715000,'intra','2022-12-19',10,104229000,69486000,4,17371500),
  ('120153061700000000000020231530101050010000001','1.5.3.01.01.05.001','Software (Command Center)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Komunikasi dan Informatika' LIMIT 1),2375000000,'intra','2023-12-15',10,950000000,1425000000,6,237500000),
  ('120153061600000000000020171530101050010000003','1.5.3.01.01.05.001','SISTEM INFORMASI MANGEMEN PENGUJIAN KENDARAAN BERMOTOR',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),188400000,'intra','2017-05-15',10,188400000,0,0,0),
  ('120153061600000000000020171530101050010000002','1.5.3.01.01.05.001','INSTALASI/SETTING MONITOR VIDEO WALL',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),3500000,'intra','2017-05-20',10,3500000,0,0,0),
  ('120153061600000000000020171530101050010000001','1.5.3.01.01.05.001','APS - PENGADUAN LALU LINTAS',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),31650000,'intra','2017-08-18',10,31650000,0,0,0),
  ('120153061600000000000020171530101050010000005','1.5.3.01.01.05.001','SOFT - CCTV LIVE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),76873200,'intra','2017-08-18',10,44159280,32713920,6,5452320),
  ('120153061600000000000020171530101050010000006','1.5.3.01.01.05.001','SETTING DAN INSTALASI',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),2000000,'intra','2017-10-11',10,2000000,0,0,0),
  ('120153061600000000000020171530101050010000004','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),136539000,'intra','2017-11-13',10,136539000,0,0,0),
  ('120153061600000000000020221530101050010000001','1.5.3.01.01.05.001','Aplikasi Terintegrasi SIM PKB',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),91020000,'intra','2022-12-09',10,54612000,36408000,4,9102000),
  ('120135061600000000000020241530101050010000001','1.5.3.01.01.05.001','Aplikasi SINKRON',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),26850000,'intra','2024-08-09',10,8055000,18795000,7,2685000),
  ('120135061600000000000020251530101050010000001','1.5.3.01.01.05.001','(SIMPKB Bleu Full Cycle) Sub Keg Penyed SarPras Pengujian Berkala Kendaraan Bermotor',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Perhubungan' LIMIT 1),49395000,'intra','2025-10-27',10,4939500,44455500,9,4939500),
  ('120153061500000000000020151530101050010000001','1.5.3.01.01.05.001','WEBSITE PPID',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pengendalian Penduduk, Keluarga Berencana, Pemberdayaan Perempuan dan Perlindungan Anak' LIMIT 1),6000000,'intra','2015-11-09',10,6000000,0,0,0),
  ('120153061400000000000020151530101050010000001','1.5.3.01.01.05.001','WEBSITE BPMPD',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa' LIMIT 1),45679000,'intra','2015-03-20',10,45679000,0,0,0),
  ('120153061400000000000020151530101050010000002','1.5.3.01.01.05.001','OS WINDOWS SERVER 2012 STANDART',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa' LIMIT 1),14305000,'intra','2015-03-20',10,14305000,0,0,0),
  ('120153061400000000000020151530101050010000003','1.5.3.01.01.05.001','APLIKASI PROGRAM PEMUSATAN DATABASE SIMPADE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa' LIMIT 1),48930000,'intra','2015-08-20',10,48930000,0,0,0),
  ('120153061400000000000020151530101050010000004','1.5.3.01.01.05.001','APLIKASI PROGRAM PEMUSATAN DATABASE SIMPADE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pemberdayaan Masyarakat dan Pemerintahan Desa' LIMIT 1),48930000,'intra','2015-08-20',10,48930000,0,0,0),
  ('120153061300000000000020131530101050010000001','1.5.3.01.01.05.001','SISTEM INFORMASI PELAYANAN AKTA KELAHIRAN TERLAMBAT',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),5000000,'intra','2013-12-28',10,5000000,0,0,0),
  ('120153061300000000000020131530101050010000002','1.5.3.01.01.05.001','SISTEM INFORMASI PELAYANAN AKTA KELAHIRAN TERLAMBAT',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),5000000,'intra','2013-12-28',10,5000000,0,0,0),
  ('120153061300000000000020141530101050010000001','1.5.3.01.01.05.001','SOFTWARE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),37000000,'intra','2014-11-21',10,37000000,0,0,0),
  ('120153061300000000000020151530101050010000001','1.5.3.01.01.05.001','APLIKASI PENDAMPING SIAK',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),31172500,'intra','2015-12-08',10,31172500,0,0,0),
  ('120153061300000000000020191530101050010000002','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),14575000,'intra','2019-10-17',10,14575000,0,0,0),
  ('120153061300000000000020191530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),27995000,'intra','2019-10-18',10,27995000,0,0,0),
  ('120153061300000000000020221530101050010000001','1.5.3.01.01.05.001','Aplikasi SAHARA PRIMA',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),69930000,'intra','2022-07-18',10,41958000,27972000,4,6993000),
  ('120153061300000000000020221530101050010000002','1.5.3.01.01.05.001','Aplikasi Pengarsipan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),44844000,'intra','2022-11-29',10,26906400,17937600,4,4484400),
  ('120135061300000000000020251530101050010000001','1.5.3.01.01.05.001','Aplikasi Website Portal Pemerintahan (Dukcapil Kab. Kediri',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),29947800,'intra','2025-10-24',10,2994780,26953020,9,2994780),
  ('120153061300000000000020211530101090010000001','1.5.3.01.01.09.001','APLIKASI ANDROID DISDUKCAPIL ONLINE',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kependudukan dan Pencatatan Sipil' LIMIT 1),130480000,'intra','2021-06-14',10,117432000,13048000,1,13048000),
  ('120153061200000000000020151530101050010000001','1.5.3.01.01.05.001','APLIKASI PENAATAN LINGKUNGAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Lingkungan Hidup' LIMIT 1),45950000,'intra','2015-06-30',10,45950000,0,0,0),
  ('120153061200000000000020161530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Lingkungan Hidup' LIMIT 1),39980000,'intra','2016-06-30',10,39980000,0,0,0),
  ('120153061100000000000020181530101050010000001','1.5.3.01.01.05.001','SOFTWARE / APLIKASI DATA PANGAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Ketahanan Pangan dan Peternakan' LIMIT 1),40000000,'intra','2018-04-19',10,40000000,0,0,0),
  ('120153061100000000000020211530101050010000001','1.5.3.01.01.05.001','Software Si Pak Ndut',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Ketahanan Pangan dan Peternakan' LIMIT 1),99750000,'intra','2021-12-23',10,89775000,9975000,1,9975000),
  ('120153061100000000000020221530101050010000001','1.5.3.01.01.05.001','Aplikasi Primadona',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Ketahanan Pangan dan Peternakan' LIMIT 1),99800000,'intra','2022-09-14',10,59880000,39920000,4,9980000),
  ('120153060900000000000020171530101050010000001','1.5.3.01.01.05.001','APPS E-POOR DAN PENDUDUK MISKIN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Sosial' LIMIT 1),15000000,'intra','2017-12-31',10,15000000,0,0,0),
  ('120153060900000000000020201530101050010000001','1.5.3.01.01.05.001','Aplikasi Sistem Informasi Data Kemiskinan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Sosial' LIMIT 1),30000000,'intra','2020-12-11',10,27000000,3000000,1,3000000),
  ('120153060900000000000020211530101050010000001','1.5.3.01.01.05.001','Aplikasi Sistem Managemen Informasi Penanggulangan Kemiskinan',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Sosial' LIMIT 1),198110000,'intra','2021-08-23',10,126812400,71297600,4,17824400),
  ('120153060900000000000020231530101050010000001','1.5.3.01.01.05.001','AKUSUSI (Aplikasi Buku Saku Dinas Sosial) Software PC',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Sosial' LIMIT 1),50000000,'intra','2023-09-20',10,25000000,25000000,5,5000000),
  ('120135060900000000000020241530101050010000001','1.5.3.01.01.05.001','Pengembangan (Upgrade) Akusussi V.20 dan Mobile Android',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Sosial' LIMIT 1),48000000,'intra','2024-11-04',10,14400000,33600000,7,4800000),
  ('120153060800000000000020211530101050010000001','1.5.3.01.01.05.001','Aplikasi Smart City SIKK',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Badan Penanggulangan Bencana Daerah' LIMIT 1),59645455,'intra','2021-11-19',10,53680909.5,5964545.5,1,5964545.5),
  ('120153060700000000000020151530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Satuan Polisi Pamong Praja' LIMIT 1),45000000,'intra','2015-12-15',10,45000000,0,0,0),
  ('120153060400000000000020231530101050010000001','1.5.3.01.01.05.001','Picture Archiving and Communication System (PACS) - DBHCHT',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD SLG' LIMIT 1),2622000000,'intra','2023-11-02',10,1048800000,1573200000,6,262200000),
  ('120153060400000000000020231530101050010000003','1.5.3.01.01.05.001','Aplikasi Konsultasi dan Pemberian Obat (SIPIO) (APBD)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD SLG' LIMIT 1),29800000,'intra','2023-12-04',10,11920000,17880000,6,2980000),
  ('120153060400000000000020231530101050010000002','1.5.3.01.01.05.001','Aplikasi SIMPEG (APBD)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD SLG' LIMIT 1),59500000,'intra','2023-12-18',10,23800000,35700000,6,5950000),
  ('120153060400000000000020201530101090010000001','1.5.3.01.01.09.001','Aplikasi SIM RS',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD SLG' LIMIT 1),100525000,'intra','2020-11-25',10,90472500,10052500,1,10052500),
  ('120153060300000000000020231530101020010000001','1.5.3.01.01.02.001','Lisensi Windows Server 2022',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),17500000,'intra','2023-03-29',10,8750000,8750000,5,1750000),
  ('120153060300000000000020101530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE ) BILLING SYSTEM',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),42438000,'intra','2010-12-20',10,42438000,0,0,0),
  ('120153060300000000000020131530101050010000001','1.5.3.01.01.05.001','PROGRAM BILLING SYSTEM',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),53255400,'intra','2013-11-28',10,53255400,0,0,0),
  ('120153060300000000000020171530101050010000001','1.5.3.01.01.05.001','SIM-RS KEUANGAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),168446050,'intra','2017-04-21',10,168446050,0,0,0),
  ('120153060300000000000020181530101050010000001','1.5.3.01.01.05.001','APLIKASI SIM KEUANGAN TERPADU',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),37730000,'intra','2018-10-04',10,37730000,0,0,0),
  ('120153060300000000000020201530101050010000001','1.5.3.01.01.05.001','Modul pendaftaran online untuk IT',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),37345000,'intra','2020-01-30',10,33610500,3734500,1,3734500),
  ('120153060300000000000020231530101050010000001','1.5.3.01.01.05.001','SIMRS (Baru 2023)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),475000000,'intra','2023-01-13',10,237500000,237500000,5,47500000),
  ('120135060300000000000020241530101050010000001','1.5.3.01.01.05.001','SIM RS ( Pengembangan e-Rekam Medis )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),2495000000,'intra','2024-05-06',10,998000000,1497000000,6,249500000),
  ('120135060300000000000020251530101050010000001','1.5.3.01.01.05.001','Pengembangan SIMRS',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),63176760,'intra','2025-01-15',10,12635352,50541408,8,6317676),
  ('120135060300000000000020251530101050010000002','1.5.3.01.01.05.001','Pengembangan SIMRS',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),125922063,'intra','2025-03-21',10,25184412.600000001,100737650.40000001,8,12592206.300000001),
  ('120135060300000000000020251530101050010000003','1.5.3.01.01.05.001','Pengembangan SIMRS (e-Rekam Medis)',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='RSUD Kabupaten Kediri' LIMIT 1),225000000,'intra','2025-11-28',10,22500000,202500000,9,22500000),
  ('120153060200000000000020081530101050010000001','1.5.3.01.01.05.001','SISTEM INFORMASI KESEHATAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kesehatan' LIMIT 1),43000000,'intra','2008-02-23',10,43000000,0,0,0),
  ('120153060200000034000020181530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE )',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kesehatan' LIMIT 1),35855000,'intra','2018-04-15',10,35855000,0,0,0),
  ('120153060200000013000020181530101050010000001','1.5.3.01.01.05.001','PIRANTI LUNAK ( SOFTWARE ) PANGILAN PASIEN PENDAFTARAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kesehatan' LIMIT 1),1700000,'intra','2018-06-21',10,1700000,0,0,0),
  ('120153060200000013000020221530101050010000001','1.5.3.01.01.05.001','Software manajemen barang',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kesehatan' LIMIT 1),3000000,'intra','2022-07-21',10,1800000,1200000,4,300000),
  ('120135060200000000000020241530101050010000001','1.5.3.01.01.05.001','System.Xml.XmlElement',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Kesehatan' LIMIT 1),256000000,'intra','2024-12-23',10,48640000,207360000,9,23040000),
  ('120153060100000000000020171530101050010000001','1.5.3.01.01.05.001','SOFWARE PENGEMBANGAN SISTEM PENDATAAN DAN PEMETAAN PENDIDIK DAN TENAGA KEPENDIDIKAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pendidikan' LIMIT 1),47005000,'intra','2017-05-15',10,47005000,0,0,0),
  ('120153060100000000000020171530101050010000002','1.5.3.01.01.05.001','PENERAPAN SISTEM DAN INFORMASI MANAJEMEN PENDIDIKAN',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pendidikan' LIMIT 1),49500000,'intra','2017-12-31',10,49500000,0,0,0),
  ('120153060100000000000020181530101050010000001','1.5.3.01.01.05.001','SOFTWARE APLIKASI SIMGURU',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pendidikan' LIMIT 1),49500000,'intra','2018-12-31',10,49500000,0,0,0),
  ('120153060100000000000020181530101050010000002','1.5.3.01.01.05.001','SOFTWARE APLIKASI SIMGURU',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pendidikan' LIMIT 1),49500000,'intra','2018-12-31',10,49500000,0,0,0),
  ('120153060100000000000020201530101050010000001','1.5.3.01.01.05.001','Aplikasi SIM PAUD',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pendidikan' LIMIT 1),98645000,'intra','2020-11-25',10,67067000,31578000,4,7894500),
  ('120153060500000000000020141530101050010000001','1.5.3.01.01.05.001','SOFTWARE/SISTEM INFORMASI SUMBER DAYA AIR',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pekerjaan Umum dan Penataan Ruang' LIMIT 1),1188852000,'intra','2014-06-30',10,1188852000,0,0,0),
  ('120153060500000000000020181530101050010000001','1.5.3.01.01.05.001','SISTIM APLIKASI PROGRAM SISMONPROREPBANG',(SELECT id FROM skpd WHERE regexp_replace(trim(nama),'\s+',' ','g')='Dinas Pekerjaan Umum dan Penataan Ruang' LIMIT 1),93000000,'intra','2018-07-02',10,93000000,0,0,0)
) AS v(nibar, kode_barang, nama_barang, skpd_id, nilai_perolehan, intra_ekstra,
       tgl_perolehan, masa_manfaat_smt, akumulasi_2025, nilai_buku_awal,
       sisa_masa_manfaat_smt, beban_penyusutan_per_smt)
WHERE NOT EXISTS (SELECT 1 FROM saldo_awal_2026 s WHERE s.nibar = v.nibar);

-- ── STEP 2: Register ke aset + catat transaksi ledger 'saldo_awal' ─────────
-- (identik dgn 20260702_03_saldo_awal_ke_ledger.sql — aman di-re-run, hanya
-- memproses baris yg nibar-nya belum ada di aset / belum py transaksi saldo_awal)
INSERT INTO aset (nibar, kode, nama_barang, nilai_perolehan, tgl_perolehan,
                  skpd_id, intra_ekstra, cara_perolehan, status)
SELECT s.nibar, s.kode_barang, s.nama_barang, COALESCE(s.nilai_perolehan, 0),
       s.tgl_perolehan, s.skpd_id, s.intra_ekstra, 'saldo_awal', 'aktif'
FROM saldo_awal_2026 s
WHERE s.nibar IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM aset a WHERE a.nibar = s.nibar);

INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_tujuan, payload, keterangan)
SELECT a.id, 'saldo_awal', '2025-S2', DATE '2025-12-31', COALESCE(s.nilai_perolehan, 0), s.skpd_id,
       jsonb_build_object(
         'akumulasi_2025',        s.akumulasi_2025,
         'nilai_buku_awal',       s.nilai_buku_awal,
         'sisa_masa_manfaat_smt', s.sisa_masa_manfaat_smt,
         'masa_manfaat_smt',      s.masa_manfaat_smt,
         'beban_per_smt',         s.beban_penyusutan_per_smt,
         'sumber',                'e-bmd baseline 2026 — backfill ATB 2026-07'
       ),
       'Saldo awal 2026 — backfill ATB (Import ATB.xlsx)'
FROM saldo_awal_2026 s
JOIN aset a ON a.nibar = s.nibar
WHERE NOT EXISTS (
  SELECT 1 FROM transaksi_bmd t WHERE t.aset_id = a.id AND t.jenis = 'saldo_awal'
);

-- ── STEP 3: Verifikasi ───────────────────────────────────────────────────
--   SELECT count(*) FROM aset WHERE cara_perolehan='saldo_awal' AND kode LIKE '1.5.3.%'; -- harus ada 120 baris baru
--   SELECT count(*) FROM aset a JOIN transaksi_bmd t ON t.aset_id=a.id AND t.jenis='saldo_awal'
--     WHERE a.kode LIKE '1.5.3.%'; -- cocok dgn jumlah aset 1.5.3
--   SELECT * FROM aset WHERE kode LIKE '1.5.3.%' AND skpd_id IS NULL; -- harus 0 baris (kalau ada, SKPD-nya gagal ke-resolve)
