-- Saldo Awal → Daftar Barang Awal: kunci "Edit Spesifikasi" untuk aset yang
-- sudah kena PENGHAPUSAN di periode berjalan.
--
-- Latar (permintaan user 2026-09-09): user menghapus satu barang (Sepeda Motor,
-- Dinas Pendidikan, jurnal Hibah 2026-S1) lalu mendapati barisnya di Saldo Awal
-- masih bisa di-"Edit Spesifikasi". Prinsipnya: begitu ada transaksi periode
-- berjalan atas sebuah aset, baris baseline-nya tak boleh lagi disentuh dari
-- pintu Saldo Awal — perbaikannya wajib lewat menu Koreksi (ada jejak ledger).
--
-- Sampai kini daftar kunci (fn_aset_awal_2026_terkunci + _batch, KEMBAR) memuat:
--   koreksi_spesifikasi, batal_koreksi_spesifikasi, reklas_kode, reklas_golongan,
--   pengalihan_status, mutasi_internal
-- — semuanya jenis yang menyentuh kolom SPESIFIKASI / GOLONGAN / SKPD_ID.
-- Penghapusan tak menyentuh kolom itu, jadi secara teknis pintu Edit Spesifikasi
-- tak akan merusak apa pun; tapi menyunting spesifikasi baseline barang yang
-- SUDAH dihapus memang tak ada gunanya & bikin bingung. Ditambahkan:
--   penghapusan_pemindahtanganan, penghapusan_sebab_lain, batal_penghapusan
-- (batal_* ikut, pola yang sama dgn batal_koreksi_spesifikasi di sebelahnya —
--  siklus hapus → batal → hapus lagi tetap meninggalkan jejak ledger).
--
-- CATATAN LINGKUP: ini SENGAJA cuma keluarga penghapusan, bukan "semua jenis".
-- koreksi_nilai / kapitalisasi / pemanfaatan / pengamanan / reklas_komptabel
-- tetap TIDAK mengunci (keputusan lama — tak menyentuh kolom spesifikasi), dan
-- saldo_awal / saldo_awal_checkpoint WAJIB tetap di luar daftar (Tutup Tahun
-- menulis checkpoint ke SETIAP aset aktif — kalau ikut, fiturnya mati total).
--
-- Penegaknya trigger DB (fn_aset_awal_2026_spek_only memanggil fungsi ini);
-- UI cuma membaca hasil _batch untuk menampilkan 🔒 & mematikan centang.
-- CREATE OR REPLACE mempertahankan GRANT & `SET search_path` inline.

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
      AND t.jenis IN ('koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
                      'reklas_kode', 'reklas_golongan',
                      'pengalihan_status', 'mutasi_internal',
                      'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain',
                      'batal_penghapusan')
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
    AND t.jenis IN ('koreksi_spesifikasi', 'batal_koreksi_spesifikasi',
                    'reklas_kode', 'reklas_golongan',
                    'pengalihan_status', 'mutasi_internal',
                    'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain',
                    'batal_penghapusan')
$function$;

-- Pesan trigger disesuaikan — sebelumnya cuma menyebut "spesifikasi, golongan,
-- atau SKPD"; kini penghapusan juga mengunci. Sisa badan fungsi tak berubah.
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
  -- Barang yang sudah bergerak di periode berjalan (koreksi spesifikasi,
  -- reklas kode/golongan, pindah SKPD, ATAU penghapusan) → koreksi wajib lewat
  -- menu Koreksi supaya ada jejak ledger & rantai payload.prev-nya tidak rusak.
  IF fn_aset_awal_2026_terkunci(NEW.nibar) THEN
    RAISE EXCEPTION 'Barang % sudah punya transaksi di periode berjalan (koreksi spesifikasi/golongan, pindah SKPD, atau penghapusan). Koreksi lewat Pembukuan > Koreksi > Spesifikasi Barang, bukan dari Saldo Awal.', NEW.nibar;
  END IF;
  RETURN NEW;
END $function$;
