-- Backfill titik koordinat REGISTER dari bidang, untuk tanah yang selama ini
-- cuma bertitik di aset_bidang_tanah (2026-09-23, lanjutan "TANAH disederhanakan:
-- koordinat & lokasi milik REGISTER" di CLAUDE.md).
--
-- Sejak putaran itu, GIS Tanah menampilkan pin dari `aset.latitude/longitude`,
-- jatuh ke titik BIDANG cuma sebagai cadangan untuk tanah yang registernya
-- belum bertitik. Ketahuan lewat pemakaian nyata: kartu "Blm titik" di daftar
-- (yang membaca `aset.latitude`) tetap menampilkan pin di peta (yang jatuh ke
-- cadangan bidang) -- dua sumber yang tak sinkron untuk satu tanah yang sama.
--
-- Migrasi ini sekali jalan: untuk tanah 1.3.1 aktif yang `latitude IS NULL`
-- tapi punya minimal satu baris `aset_bidang_tanah` berkoordinat, titik bidang
-- PALING AWAL (created_at, lalu id sbg pemecah seri) disalin ke `aset`. Bukan
-- rata-rata/gabungan -- satu tanah cuma bisa punya satu titik register, dan
-- titik-titik bidang pada tanah yang sama letaknya berdekatan (diverifikasi:
-- kasus TERBURUK, 3 bidang "Tanah Jalan Sukorejo - Brenggolo", jaraknya cuma
-- puluhan meter).
--
-- ⚠️ Non-ledger (koordinat data deskriptif, pola sama dgn migrasi 20260820_04)
-- -- UPDATE biasa, bukan event ledger.
--
-- Diverifikasi ke produksi SEBELUM ditulis (transaksi + ROLLBACK): 18 baris
-- tersentuh, cocok dgn daftar `aset_id` yang diperiksa satu per satu.
-- `aset_bidang_tanah` sendiri TIDAK disentuh -- bidang tetap bidang, register
-- cuma dilengkapi.

with pilihan as (
  select distinct on (b.aset_id) b.aset_id, b.latitude, b.longitude
  from aset_bidang_tanah b
  join aset a on a.id = b.aset_id
  where a.kode like '1.3.1.%' and a.status = 'aktif' and a.latitude is null
    and b.latitude is not null and b.longitude is not null
  order by b.aset_id, b.created_at asc, b.id asc
)
update aset a
set latitude = p.latitude, longitude = p.longitude
from pilihan p
where a.id = p.aset_id;
