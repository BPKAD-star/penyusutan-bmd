-- Dua aksi baru di modul Inventarisasi per-barang (migrasi 20260923_03),
-- keputusan user 2026-09-25.
--
-- (1) TOLAK — Pengelola Barang (admin), atas isian yang BELUM divalidasi
--     (status 'diisi'). Bedanya dari "Batal Validasi": Batal Validasi cuma
--     sah kalau isiannya SUDAH divalidasi (mengembalikan keputusan sendiri);
--     Tolak sebaliknya cuma sah kalau BELUM divalidasi — jalur langsung utk
--     "isian ini kurang, tolong lengkapi" tanpa muter lewat validasi-lalu-
--     batalkan. Statusnya TETAP 'diisi', yang berubah cuma `catatan_validator`
--     — kolom itu SUDAH dibaca UI di kedua sisi (ValidasiInventarisasi.tsx:308
--     & LembarKerjaInventarisasi.tsx:337 "↩ Dikembalikan: ..."), jadi Tolak
--     tinggal mengisinya lewat jalur yang lurus.
--     ⚠️ Catatan WAJIB diisi (beda dari Batal Validasi yang opsional) — satu-
--     satunya isi aksi ini adalah pesannya; tanpa itu SKPD cuma tahu "ditolak"
--     tanpa tahu apa yang salah.
--
-- (2) HAPUS ISIAN — SKPD sendiri (atau admin), atas isian miliknya yang masih
--     'diisi'. DELETE baris, bukan reset status — begitu dihapus, barang itu
--     kembali "belum diinventarisasi" & isi ulang dari nol (jawaban, foto,
--     catatan Pengelola — semuanya hilang bersama barisnya). Aman krn tabel
--     ini NON-LEDGER (beda dari transaksi_bmd): sudah di-UPDATE in-place sejak
--     awal oleh fn_inventarisasi_simpan/fn_inventarisasi_batal_validasi, jadi
--     DELETE di sini tak melanggar prinsip append-only manapun.
--     Cuma utk isian ber-aset_id (barang NYATA di register) — utk "BMD Belum
--     Tercatat" (aset_id NULL) tetap pakai fn_inventarisasi_hapus_belum_
--     tercatat yang sudah ada, pesannya beda konteks ("Daftar Barang tidak
--     tersentuh").
--     ⚠️ Cuma sah kalau status 'diisi' — kalau sudah 'divalidasi', WAJIB
--     "Batal Validasi" dulu (menu Pengelola Barang) baru bisa "Hapus Isian"
--     (menu SKPD). Rantai penuh yang diminta user (diisi → divalidasi →
--     batal validasi → hapus isian) diuji eksplisit di test.
--
-- Tak ada perubahan skema (kolom/CHECK/index) — murni dua RPC baru di atas
-- tabel & pola wewenang yang sudah ada.

CREATE OR REPLACE FUNCTION fn_inventarisasi_tolak(p_id uuid, p_catatan text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r inventarisasi_barang%ROWTYPE;
BEGIN
  IF NOT fn_is_admin() THEN
    RAISE EXCEPTION 'Hanya Pengelola Barang yang boleh menolak isian.';
  END IF;
  IF btrim(COALESCE(p_catatan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi — SKPD perlu tahu apa yang harus diperbaiki.';
  END IF;
  SELECT * INTO v_r FROM inventarisasi_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Isian tidak ditemukan.'; END IF;
  IF v_r.status <> 'diisi' THEN
    RAISE EXCEPTION 'Isian ini sudah divalidasi — batalkan validasinya dulu kalau mau ditolak.';
  END IF;
  UPDATE inventarisasi_barang SET catatan_validator = btrim(p_catatan) WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION fn_inventarisasi_hapus_isian(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r inventarisasi_barang%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM inventarisasi_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Isian tidak ditemukan.'; END IF;
  IF v_r.aset_id IS NULL THEN
    RAISE EXCEPTION 'Ini lembar "BMD Belum Tercatat" — hapus lewat tombol Hapus di lembar itu.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_r.skpd_id)) THEN
    RAISE EXCEPTION 'Anda tidak berwenang menghapus isian ini.';
  END IF;
  IF v_r.status = 'divalidasi' THEN
    RAISE EXCEPTION 'Isian ini sudah divalidasi — minta Pengelola Barang membatalkan validasinya dulu.';
  END IF;
  DELETE FROM inventarisasi_barang WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION fn_inventarisasi_tolak(uuid, text) FROM public;
REVOKE ALL ON FUNCTION fn_inventarisasi_hapus_isian(uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_tolak(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_inventarisasi_hapus_isian(uuid) TO authenticated;
