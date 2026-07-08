-- 20260710_05_seed_wilayah_kota_kediri.sql
-- Seed tabel `admin_wilayah` (sebelumnya `wilayah`, di-rename migrasi
-- 20260710_04) dengan data resmi Kota Kediri (1 kota, 3 kecamatan,
-- 46 kelurahan) — sebagian aset (tanah/gedung kantor) berlokasi administratif
-- di Kota Kediri, bukan cuma Kabupaten Kediri yang sudah di-seed migrasi 15.
--
-- SUMBER: cahyadsn/wilayah (github.com/cahyadsn/wilayah, file db/wilayah.sql,
-- branch master), lisensi MIT — SUMBER YANG SAMA PERSIS dipakai migrasi 15
-- utk Kab. Kediri, disusun dari Kepmendagri Kode dan Data Wilayah
-- Administrasi Pemerintahan. Difilter HANYA baris berkode '35.71'+ (Kota
-- Kediri + seluruh turunannya). `level`/`parent_kode` diturunkan dari jumlah
-- segmen kode (sama logika migrasi 15) — sumber aslinya cuma py kolom
-- (kode, nama). Induk '35' (Jawa Timur) sudah ada dari migrasi 15, tidak
-- perlu diulang.
--
-- ON CONFLICT DO NOTHING: aman dijalankan ulang. Urutan baris depth-first
-- (induk sebelum anak) agar FK parent_kode valid dalam satu statement INSERT.

INSERT INTO admin_wilayah (kode, nama, level, parent_kode) VALUES
('35.71','Kota Kediri',2,'35'),
('35.71.01','Mojoroto',3,'35.71'),
('35.71.01.1001','Bandar Lor',4,'35.71.01'),
('35.71.01.1002','Bandar Kidul',4,'35.71.01'),
('35.71.01.1003','Banjarmlati',4,'35.71.01'),
('35.71.01.1004','Pojok',4,'35.71.01'),
('35.71.01.1005','Sukorame',4,'35.71.01'),
('35.71.01.1006','Bujel',4,'35.71.01'),
('35.71.01.1007','Gayam',4,'35.71.01'),
('35.71.01.1008','Mrican',4,'35.71.01'),
('35.71.01.1009','Dermo',4,'35.71.01'),
('35.71.01.1010','Ngampel',4,'35.71.01'),
('35.71.01.1011','Mojoroto',4,'35.71.01'),
('35.71.01.1012','Campurejo',4,'35.71.01'),
('35.71.01.1013','Lirboyo',4,'35.71.01'),
('35.71.01.1014','Tamanan',4,'35.71.01'),
('35.71.02','Kota',3,'35.71'),
('35.71.02.1001','Semampir',4,'35.71.02'),
('35.71.02.1002','Balowerti',4,'35.71.02'),
('35.71.02.1003','Dandangan',4,'35.71.02'),
('35.71.02.1004','Ngadirejo',4,'35.71.02'),
('35.71.02.1005','Kampung Dalem',4,'35.71.02'),
('35.71.02.1006','Setonopande',4,'35.71.02'),
('35.71.02.1007','Ringinanom',4,'35.71.02'),
('35.71.02.1008','Pakelan',4,'35.71.02'),
('35.71.02.1009','Setonogedong',4,'35.71.02'),
('35.71.02.1010','Kemasan',4,'35.71.02'),
('35.71.02.1011','Jagalan',4,'35.71.02'),
('35.71.02.1012','Banjaran',4,'35.71.02'),
('35.71.02.1013','Kaliombo',4,'35.71.02'),
('35.71.02.1014','Ngronggo',4,'35.71.02'),
('35.71.02.1015','Manisrenggo',4,'35.71.02'),
('35.71.02.1016','Pocanan',4,'35.71.02'),
('35.71.02.1017','Rejomulyo',4,'35.71.02'),
('35.71.03','Pesantren',3,'35.71'),
('35.71.03.1001','Bangsal',4,'35.71.03'),
('35.71.03.1002','Pakunden',4,'35.71.03'),
('35.71.03.1003','Tosaren',4,'35.71.03'),
('35.71.03.1004','Jamsaren',4,'35.71.03'),
('35.71.03.1005','Singonegaran',4,'35.71.03'),
('35.71.03.1006','Blabak',4,'35.71.03'),
('35.71.03.1007','Betet',4,'35.71.03'),
('35.71.03.1008','Tinalan',4,'35.71.03'),
('35.71.03.1009','Bawang',4,'35.71.03'),
('35.71.03.1010','Ngletih',4,'35.71.03'),
('35.71.03.1011','Tempurejo',4,'35.71.03'),
('35.71.03.1012','Ketami',4,'35.71.03'),
('35.71.03.1013','Pesantren',4,'35.71.03'),
('35.71.03.1014','Banaran',4,'35.71.03'),
('35.71.03.1015','Burengan',4,'35.71.03')
ON CONFLICT (kode) DO NOTHING;
