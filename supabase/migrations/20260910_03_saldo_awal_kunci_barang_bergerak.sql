-- ============================================================================
-- Saldo Awal → Daftar Barang Awal: perluas daftar kunci "Edit Spesifikasi" ke
-- SELURUH barang yang sudah BERGERAK — bukan cuma yang berubah spesifikasi/
-- golongan/SKPD (2026-09-10, keputusan user).
--
-- ══ LATAR ═════════════════════════════════════════════════════════════════
-- User melaporkan dua kasus yang MASIH bisa di-"Edit Spesifikasi" dari Saldo
-- Awal padahal barangnya sudah tak berdiri utuh lagi di register:
--   (a) barang yang sudah DIHAPUS di beberapa SKPD (termasuk Pengelola Barang);
--   (b) barang INDUK yang sudah DIPECAH (mis. "Tanah SMAN 2 Pare" NIBAR
--       …19731310101040020000005 — `status='dihapus'`, ledger `pemecahan_keluar`,
--       tapi `fn_aset_awal_2026_terkunci` mengembalikan FALSE).
--
-- Sebabnya dua hal, dan (1) yang paling penting:
--   1. **Migrasi 20260909_02 (kunci penghapusan) TERNYATA BELUM DIJALANKAN** —
--      diperiksa ke produksi 2026-09-10, badan `fn_aset_awal_2026_terkunci`
--      masih daftar 6 jenis yang lama. Migrasi INI sengaja dibuat SELF-CONTAINED
--      (memuat juga ketiga jenis penghapusan itu), jadi cukup menjalankan yang
--      ini saja; menjalankan 20260909_02 lebih dulu tetap aman (CREATE OR
--      REPLACE, idempotent).
--   2. Keluarga PEMECAHAN / PENGGABUNGAN / KAPITALISASI-SERAP / PENCATATAN
--      GANDA memang tak pernah masuk daftar sejak awal (migrasi 20260728_01).
--
-- ══ PRINSIPNYA ════════════════════════════════════════════════════════════
-- Daftar lama menjawab "apakah spesifikasi/golongan/SKPD-nya sudah berubah".
-- Daftar baru menambahkan "apakah barangnya sudah KELUAR dari register" —
-- dihapus, dipecah, digabung, diserap induk, atau dinonaktifkan sbg duplikat.
-- Menyunting spesifikasi baseline barang yang sudah tak ada di register bukan
-- cuma sia-sia: pintu itu menulis ke DUA tabel (snapshot + `aset` dicocokkan
-- NIBAR), jadi separuhnya mendarat di baris `aset` ber-`status='dihapus'`.
--
-- ══ YANG SENGAJA TETAP DI LUAR DAFTAR (jangan ditambahkan tanpa keputusan) ══
--   · `saldo_awal`, `saldo_awal_checkpoint` — WAJIB di luar. Migrasi 20260702_03
--     membuat baris `saldo_awal` sintetis di SETIAP aset baseline, dan Tutup
--     Tahun menulis checkpoint ke SETIAP aset aktif: kalau ikut, fiturnya mati
--     total di hari pertama (CLAUDE.md).
--   · `koreksi_nilai`, `kapitalisasi`, `akumulasi_kdp`, `reklas_komptabel`,
--     `koreksi_kuantitas` — murni ANGKA / keranjang laporan, tak menyentuh
--     kolom spesifikasi. Keputusan lama 2026-07-28, tidak diubah di sini.
--   · `pemanfaatan*`, `pengamanan*` — kustodi, barangnya tetap berdiri utuh.
--   · `batal_kapitalisasi` — baris ini mendarat di INDUK **dan** anak, jadi
--     memasukkannya akan ikut mengunci induk yang cuma berubah angkanya.
--     Anak yang pernah diserap sudah terkunci lewat `kapitalisasi_serap`.
--   · `batal_pengadaan` / `batal_hibah_masuk` / dst — asetnya lahir dari menu
--     Cara Perolehan, tak pernah ada di `aset_awal_2026`. Menambahkannya cuma
--     memperpanjang daftar yang harus dijaga kembar.
--
-- ══ DAMPAK — DIUKUR, BUKAN DIPERKIRAKAN (produksi 2026-09-10) ═════════════
--   `aset_awal_2026` total ........................... 471.671 baris
--   terkunci SEBELUM migrasi ini ..................... 97
--   terkunci SESUDAH ................................. 125   (+28)
--   Rincian tambahannya: penghapusan_pemindahtanganan 16 · penghapusan_sebab_lain 5
--   · batal_penghapusan 5 · pemecahan_keluar 4 · koreksi_pencatatan_ganda 2
--   · batal_koreksi_pencatatan_ganda 2 · kapitalisasi_serap 1 (ada irisan).
--   `penggabungan_*`, `kdp_selesai_*`, `pemecahan_masuk`, `batal_pemecahan*`
--   per hari ini 0 baris — didaftarkan sbg pencegahan, bukan perbaikan.
--
-- ⚠️ DAFTARNYA KEMBAR di DUA fungsi di bawah. Ubah satu, ubah dua-duanya —
-- kalau menyimpang, layar (yang memakai `_batch`) menampilkan 🔒 yang berbeda
-- dari yang benar-benar ditolak trigger, dan operator tak punya cara tahu.
-- Penegak sesungguhnya trigger `fn_aset_awal_2026_spek_only`; UI cuma membaca
-- hasil `_batch` untuk menampilkan 🔒 & mematikan centang.
-- CREATE OR REPLACE mempertahankan GRANT & `SET search_path` inline.
-- Tak ada perubahan data — murni definisi fungsi.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_terkunci(p_nibar text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM transaksi_bmd t
    JOIN aset a ON a.id = t.aset_id
    WHERE a.nibar = p_nibar
      AND t.jenis IN (
        -- identitas / spesifikasi / golongan / SKPD berubah (daftar asli)
        'koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
        'reklas_kode', 'reklas_golongan',
        'pengalihan_status', 'mutasi_internal',
        -- barang KELUAR dari register: dihapus
        'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_penghapusan',
        -- dipecah / digabung / diserap induk / dinonaktifkan sbg duplikat
        'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk',
        'penggabungan_keluar', 'penggabungan_masuk', 'batal_penggabungan', 'batal_penggabungan_masuk',
        'kapitalisasi_serap',
        'koreksi_pencatatan_ganda', 'batal_koreksi_pencatatan_ganda',
        -- KDP selesai → pindah jadi aset tetap
        'kdp_selesai_keluar', 'kdp_selesai_masuk'
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_terkunci_batch(p_nibars text[])
 RETURNS TABLE(nibar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT a.nibar
  FROM aset a
  JOIN transaksi_bmd t ON t.aset_id = a.id
  WHERE a.nibar = ANY(p_nibars)
    AND t.jenis IN (
      -- ⚠️ KEMBAR dgn fn_aset_awal_2026_terkunci di atas — jaga tetap sama.
      'koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
      'reklas_kode', 'reklas_golongan',
      'pengalihan_status', 'mutasi_internal',
      'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_penghapusan',
      'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk',
      'penggabungan_keluar', 'penggabungan_masuk', 'batal_penggabungan', 'batal_penggabungan_masuk',
      'kapitalisasi_serap',
      'koreksi_pencatatan_ganda', 'batal_koreksi_pencatatan_ganda',
      'kdp_selesai_keluar', 'kdp_selesai_masuk'
    )
$function$;

-- Pesan trigger disesuaikan — sebelumnya cuma menyebut "spesifikasi, golongan,
-- atau SKPD". Sisa badan fungsi TIDAK berubah (disalin utuh; CREATE OR REPLACE
-- akan membuang apa pun yang tak ditulis ulang).
CREATE OR REPLACE FUNCTION public.fn_aset_awal_2026_spek_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.nibar                    IS DISTINCT FROM OLD.nibar
  OR NEW.kode                     IS DISTINCT FROM OLD.kode
  OR NEW.skpd_id                  IS DISTINCT FROM OLD.skpd_id
  OR NEW.intra_ekstra             IS DISTINCT FROM OLD.intra_ekstra
  OR NEW.tgl_perolehan            IS DISTINCT FROM OLD.tgl_perolehan
  OR NEW.jumlah                   IS DISTINCT FROM OLD.jumlah
  OR NEW.harga_satuan             IS DISTINCT FROM OLD.harga_satuan
  OR NEW.nilai_perolehan          IS DISTINCT FROM OLD.nilai_perolehan
  OR NEW.akumulasi_2025           IS DISTINCT FROM OLD.akumulasi_2025
  OR NEW.nilai_buku_awal          IS DISTINCT FROM OLD.nilai_buku_awal
  OR NEW.sisa_masa_manfaat_smt    IS DISTINCT FROM OLD.sisa_masa_manfaat_smt
  OR NEW.masa_manfaat_smt         IS DISTINCT FROM OLD.masa_manfaat_smt
  OR NEW.beban_penyusutan_per_smt IS DISTINCT FROM OLD.beban_penyusutan_per_smt
  THEN
    RAISE EXCEPTION 'Saldo Awal 2026 beku: dari aplikasi hanya field SPESIFIKASI yang boleh dikoreksi. Angka penyusutan, kode barang, SKPD & tanggal perolehan tidak bisa diubah di sini.';
  END IF;
  -- Barang yang sudah BERGERAK di periode berjalan — berubah spesifikasi/
  -- golongan/SKPD, ATAU sudah keluar dari register (dihapus, dipecah, digabung,
  -- diserap induk, dinonaktifkan sbg duplikat). Koreksinya wajib lewat menu
  -- Koreksi supaya ada jejak ledger & rantai payload.prev-nya tidak rusak.
  IF fn_aset_awal_2026_terkunci(NEW.nibar) THEN
    RAISE EXCEPTION 'Barang % sudah bergerak di periode berjalan (koreksi spesifikasi/golongan, pindah SKPD, penghapusan, pemecahan, penggabungan, atau kapitalisasi). Koreksi lewat Pembukuan > Koreksi, bukan dari Saldo Awal.', NEW.nibar;
  END IF;
  RETURN NEW;
END $function$;

-- ── CEK SESUDAH DIJALANKAN ────────────────────────────────────────────────
--   -- 1. jumlah baris snapshot yang terkunci: 97 -> 125
--   SELECT count(*) FROM aset_awal_2026 x WHERE public.fn_aset_awal_2026_terkunci(x.nibar);
--
--   -- 2. kasus yang dilaporkan user — ketiganya HARUS true sekarang:
--   SELECT a.nibar, a.nama_barang, a.status,
--          public.fn_aset_awal_2026_terkunci(a.nibar) AS terkunci
--     FROM aset a
--    WHERE a.nibar = '120135060000000000000019731310101040020000005'   -- induk pemecahan SMAN 2 Pare
--       OR a.id IN (SELECT aset_id FROM transaksi_bmd
--                    WHERE jenis IN ('penghapusan_pemindahtanganan','penghapusan_sebab_lain'));
--
--   -- 3. kedua fungsi TIDAK menyimpang (HARUS 0 baris):
--   SELECT x.nibar FROM aset_awal_2026 x
--    WHERE public.fn_aset_awal_2026_terkunci(x.nibar)
--      AND x.nibar NOT IN (SELECT nibar FROM public.fn_aset_awal_2026_terkunci_batch(
--            ARRAY(SELECT nibar FROM aset_awal_2026 WHERE public.fn_aset_awal_2026_terkunci(nibar))));
--
--   -- 4. di layar: Saldo Awal → Daftar Barang Awal, SKPD "PENGELOLA BARANG",
--   --    Jenis 1.3.1, cari "sma" — baris induk "Tanah SMAN 2 Pare" (…0005)
--   --    HARUS ber-🔒 & centangnya mati.
-- ============================================================================
