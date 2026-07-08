-- Stage A dari penataan ulang nama tabel (prefix admin_/aset_awal_ biar
-- terklasifikasi rapi di daftar tabel Supabase). HANYA 7 tabel referensi yang
-- dikonfirmasi AMAN lewat audit menyeluruh: tidak ada satu pun fungsi SQL yang
-- menyebut nama tabelnya di badan kode (beda dgn profiles/skpd yang dipakai
-- fn_is_admin/fn_skpd_visible dkk — itu Stage B terpisah, DITUNDA krn
-- risikonya app-wide outage kalau meleset). RLS policy 7 tabel ini semua cuma
-- fn_is_admin()/true (bukan subquery literal) dan FK ke tabel-tabel ini ikut
-- otomatis ter-rename (Postgres tracking by OID) — jadi aman "ALTER ... RENAME"
-- polos tanpa perlu recreate policy/fungsi apa pun.

ALTER TABLE jenis_aset      RENAME TO admin_jenis_aset;
ALTER TABLE kodefikasi_bmd  RENAME TO admin_kodefikasi_bmd;
ALTER TABLE overhaul_band   RENAME TO admin_overhaul_band;
ALTER TABLE pegawai         RENAME TO admin_pegawai;
ALTER TABLE satuan_bmd      RENAME TO admin_satuan_bmd;
ALTER TABLE wilayah         RENAME TO admin_wilayah;
ALTER TABLE saldo_awal_2026 RENAME TO aset_awal_2026;
