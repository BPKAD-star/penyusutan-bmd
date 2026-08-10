-- ============================================================================
-- RKBMD non-pengadaan: kolom yang kurang untuk form & lembar cetak keempat
-- jenis (pemeliharaan, pemanfaatan, pemindahtanganan, penghapusan).
--
-- Keputusan user 2026-08-10 (lanjutan). Lembar cetak keempatnya WAJIB memuat
-- Kode Barang/Uraian, Spesifikasi Nama Barang/NIBAR, Tanggal Perolehan, dan
-- Nilai Perolehan. Tiga yang pertama sudah ada di `rkbmd_item`; tanggal
-- perolehan belum.
--
-- ⚠️ DEPLOY-ORDERING: jalankan SEBELUM deploy kode.
-- ============================================================================

-- ── 1. Tanggal perolehan barang, DI-SNAPSHOT ────────────────────────────────
-- Disalin dari `aset` saat item disusun, BUKAN di-join saat cetak. Alasannya
-- sama dengan `jumlah_eksisting` yang sudah lebih dulu dibekukan: dokumen
-- perencanaan yang sudah diajukan/disetujui tidak boleh angkanya bergerak
-- ketika data aset berubah, dan `aset_id` bisa saja menunjuk barang yang kelak
-- dihapus/dipecah. Lembar yang dicetak ulang tahun depan harus sama persis
-- dengan yang dulu ditandatangani.
alter table rkbmd_item add column if not exists tgl_perolehan date;

-- ── 2. Estimasi hasil pemanfaatan ───────────────────────────────────────────
-- Kolom SENDIRI, sengaja BUKAN menumpang `total_anggaran`. Pemanfaatan itu
-- rencana PENERIMAAN (sewa/KSP), bukan belanja — menumpangkannya akan membuat
-- menu Pelaporan menjumlahkan pemasukan ke dalam "Total Rencana Anggaran" dan
-- angka itu ikut terbaca sebagai kebutuhan dana.
alter table rkbmd_item add column if not exists estimasi_hasil numeric;

-- ── 3. Kondisi barang: tiga pilihan baku ────────────────────────────────────
-- Dulu teks bebas, jadi "RB", "rusak berat", dan "Rusak Berat" bisa hidup
-- berdampingan dan tak bisa direkap. Tiga nilai ini yang diminta user.
-- ⚠️ SENGAJA BEDA dari `aset.kondisi_barang` yang punya 5 opsi (migrasi
-- 20260707_04 / 20260709_04): yang di sini kondisi yang DIUSULKAN dalam dokumen
-- perencanaan, bukan kondisi tercatat di register. Kalau suatu saat keduanya
-- mau disamakan, ubah dua-duanya sadar-sadar — jangan diam-diam.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rkbmd_item_kondisi_check'
  ) then
    alter table rkbmd_item add constraint rkbmd_item_kondisi_check
      check (kondisi is null or kondisi in ('Baik', 'Rusak Ringan', 'Rusak Berat'));
  end if;
end $$;
