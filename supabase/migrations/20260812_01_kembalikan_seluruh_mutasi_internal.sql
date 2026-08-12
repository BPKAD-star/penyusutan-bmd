-- ============================================================================
-- Penerimaan Internal: "Kembalikan Semua" — satu kartu mutasi internal
-- dipulangkan sekali jalan.
--
-- Permintaan user 2026-08-12, menyamakan Penerimaan Internal dengan Penggunaan
-- yang sudah punya aksi setingkat KARTU (`fn_batal_seluruh_pengalihan`,
-- migrasi 20260811_02).
--
-- ⚠️ MESKI POLANYA KEMBAR, ARTINYA BEDA — jangan tertukar:
--   fn_batal_seluruh_pengalihan       = KOREKSI salah pilih barang; perpindahan
--                                       dianggap TAK PERNAH TERJADI, kartunya
--                                       balik ke 'pending' & bisa diterima ulang.
--   fn_kembalikan_seluruh_mutasi_...  = barang MEMANG sempat dipakai di sub-unit
--                                       ini lalu dipulangkan. Dua peristiwa
--                                       nyata, dua-duanya tetap terbaca laporan,
--                                       kartunya TETAP 'disetujui'.
-- Karena itu fungsi ini TIDAK menyentuh approval_status sama sekali.
--
-- Padanan "Batal" untuk mutasi_internal memang belum ada (tak ada jenis enum
-- `batal_mutasi_internal`). Kalau nanti dibangun, ikuti daftar periksa tujuh
-- titik di rules.md §1.7 — bukan sekadar menyalin fungsi ini.
--
-- Tidak ada perubahan enum/tabel, jadi urutan deploy bebas: kode lama tetap
-- jalan tanpa fungsi ini, dan fungsi ini tak dipakai siapa pun sebelum
-- komponennya ikut ter-deploy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_kembalikan_seluruh_mutasi_internal(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h    jurnal_header%ROWTYPE;
  v_aset uuid;
  v_n    integer := 0;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'mutasi_internal' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal mutasi internal yang sudah disetujui tidak ditemukan.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh mengembalikan barang ini.';
  END IF;

  -- Hanya barang yang MASIH di sini. Baris TERAKHIR per aset di kartu ini
  -- menentukan: ber-`reversal` = sudah pulang, jangan diikutkan. Tanpa saringan
  -- ini `fn_kembalikan_mutasi_internal` akan melempar "sudah tidak berada di
  -- SKPD penerima" untuk barang yang sudah dipulangkan, dan karena semuanya
  -- satu transaksi, SELURUH pengembalian ikut batal.
  --
  -- Wewenang & guard per barang tetap ditegakkan fungsi per-barang — fungsi ini
  -- cuma memutarnya, jangan disalin isinya ke sini (pola
  -- fn_batal_seluruh_pengalihan). Satu barang gagal → satu kartu batal utuh,
  -- jadi tak pernah tertinggal separuh.
  FOR v_aset IN
    SELECT x.aset_id FROM (
      SELECT DISTINCT ON (t.aset_id) t.aset_id, t.payload
      FROM transaksi_bmd t
      WHERE t.header_id = p_header_id AND t.jenis = 'mutasi_internal'
      ORDER BY t.aset_id, t.id DESC
    ) x
    WHERE COALESCE(x.payload->>'reversal', 'false') <> 'true'
  LOOP
    PERFORM fn_kembalikan_mutasi_internal(p_header_id, v_aset);
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Semua barang di kartu ini sudah dikembalikan — tidak ada yang tersisa.';
  END IF;
  RETURN v_n;
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_kembalikan_seluruh_mutasi_internal(uuid) TO authenticated;
