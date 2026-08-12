-- ============================================================================
-- BATAL MUTASI INTERNAL — dan pencabutan "Kembalikan" dari mutasi internal.
--
-- Keputusan user 2026-08-12. Dua perubahan, dan memang sepaket.
--
-- ── (A) Kenapa `batal_pengalihan` DIPAKAI ULANG, bukan enum baru ───────────
-- Godaan pertamanya menambah `batal_mutasi_internal`. Itu justru pilihan yang
-- BERBAHAYA di repo ini: `batal_pengalihan` sudah tersangkut di enam pembaca
-- yang seluruhnya harus disisir ulang kalau ada jenis kembar (rules.md §1.7) —
-- `buangYangDibatalkan` (lib/pengalihan.ts), `fn_rekap_bmd`,
-- `BATAL_TARGET_JENIS`, partial index `idx_trx_pindah_id`, cabang GUC
-- `app.batal_pengalihan` di trigger kode register, dan Rekonsiliasi. Sejarah
-- `batal_pengalihan` sendiri membuktikan biayanya: ia kelewat TIGA ronde.
--
-- Memakai ulang enum yang sudah ada membuat lima dari enam pembaca itu benar
-- TANPA disentuh sama sekali, karena semuanya menyaring lewat
-- `payload.target_trx_ids` — bukan lewat jenis baris yang dibatalkan:
--   * `idx_trx_pindah_id` sudah memuat ketiga jenis sejak 20260729_07;
--   * `JENIS_PINDAH` sudah memuat `mutasi_internal`;
--   * `fn_rekap_bmd` sudah membuang target `batal_pengalihan`.
-- Namanya jadi sedikit meleset ("pengalihan" untuk mutasi internal), dan itu
-- harga yang MURAH dibanding satu pembaca yang kelupaan lalu menampilkan angka
-- berbeda dari Daftar Barang tanpa satu pun error.
--
-- Kedua RPC di bawah karena itu DIGENERALKAN, bukan disalin: satu implementasi
-- guard "tak boleh ada transaksi lebih baru", satu implementasi pemulihan kode
-- register, satu implementasi "kartu balik ke pending". Jenis baris yang
-- dibatalkan diturunkan dari `jurnal_header.kategori` — untuk dua kategori ini
-- nama kategori dan nama jenis ledgernya memang sama persis.
--
-- ── (B) Kenapa "Kembalikan" DICABUT dari mutasi internal ───────────────────
-- Permintaan user: dalam praktiknya barang yang sudah dipindah nyaris tak
-- pernah dipulangkan di tahun yang sama; kalaupun berpindah lagi, itu tahun
-- berikutnya dan ke unit lain. User sendiri mengira "Kembalikan" berarti
-- "batal" — dua tombol yang sama-sama memulangkan barang tapi berlawanan arti
-- memang mengundang salah pencet.
--
-- Tidak ada kemampuan yang hilang: pengembalian yang SUNGGUHAN punya dokumen
-- sendiri, jadi bentuk yang benar adalah kartu Pengeluaran Internal BARU ke
-- arah sebaliknya — bukan baris reversal yang digantungkan pada kartu lama.
-- Justru cara lama yang janggal: ia menempelkan peristiwa 2026-S2 pada dokumen
-- bertanggal 2026-S1, persis jenis ketidakcocokan tanggal yang baru saja
-- diperbaiki 20260812_02.
--
-- AMAN karena datanya kosong: `mutasi_internal` punya 6 baris dan
-- **0 baris ber-`payload.reversal`** (dicek 2026-08-12). Tak ada riwayat yang
-- perlu terus dibaca, jadi RPC-nya boleh benar-benar dicabut.
--
-- ⚠️ `pengalihan_status` SENGAJA TIDAK IKUT dicabut di migrasi ini: di sana ada
-- 2 baris reversal hidup, jadi pembacanya (`payload.reversal` di
-- lib/pengalihan.ts, PenggunaanMasuk, fn_rekap_bmd) WAJIB tetap ada apa pun
-- keputusan soal tombolnya. Butuh keputusan tersendiri.
--
-- ⚠️ Ini MELONGGARKAN rules.md §1.6 untuk mutasi internal — di sana tertulis
-- setiap modul yang bisa dihentikan wajib membedakan "Kembalikan" vs "Batal".
-- Pembedaan itu tetap berlaku untuk Pemanfaatan & Pengamanan, yang "berakhir"-
-- nya adalah perubahan keadaan pada perjanjian YANG SAMA sehingga tak punya
-- dokumen baru untuk diwakili. Untuk perpindahan barang, pengembalian nyata
-- SELALU punya dokumen sendiri — jadi di sini pembedaan itu mubazir, bukan
-- dilanggar. rules.md perlu dicatat mengikuti keputusan ini.
--
-- Tak ada nilai enum baru → urutan deploy bebas. Tapi jalankan SEBELUM deploy
-- kode kalau ingin tombol Batal-nya langsung berfungsi.
-- ============================================================================

-- ── 1. Batal per barang — kini melayani pengalihan DAN mutasi internal ─────
CREATE OR REPLACE FUNCTION public.fn_batal_pengalihan_barang(p_header_id uuid, p_aset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h           jurnal_header%ROWTYPE;
  v_aset        RECORD;
  v_ids         bigint[];
  v_id_terakhir bigint;
  v_lebih_baru  integer;
  v_sisa        integer;
  v_jenis       jenis_transaksi_bmd;
  v_label       text;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND
     OR v_h.kategori NOT IN ('pengalihan_status', 'mutasi_internal')
     OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal perpindahan yang sudah disetujui tidak ditemukan.';
  END IF;

  -- Nama kategori header = nama jenis ledgernya, untuk dua kategori ini.
  v_jenis := v_h.kategori::jenis_transaksi_bmd;
  v_label := CASE WHEN v_h.kategori = 'mutasi_internal'
                  THEN 'mutasi internal' ELSE 'pengalihan status' END;

  -- Wewenang: admin + SKPD PENERIMA. "Satu pintu" (migrasi 22) tetap utuh —
  -- SKPD asal tidak berwenang, di kedua kategori.
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan % ini.', v_label;
  END IF;

  -- SEMUA baris perpindahan aset ini di kartu tsb — bisa 1 (baru dikirim) atau
  -- 2 (kartu pengalihan yang sempat dikembalikan). Dibatalkan SEKALIGUS:
  -- membatalkan separuh menyisakan rantai yang tak nyambung.
  SELECT array_agg(id ORDER BY id), max(id) INTO v_ids, v_id_terakhir
  FROM transaksi_bmd
  WHERE header_id = p_header_id AND aset_id = p_aset_id AND jenis = v_jenis;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Tidak ada baris perpindahan untuk barang ini di kartu tersebut.';
  END IF;

  -- Guard baku repo ini: batal hanya sah untuk peristiwa TERBARU aset itu.
  SELECT count(*) INTO v_lebih_baru FROM transaksi_bmd
  WHERE aset_id = p_aset_id AND id > v_id_terakhir;
  IF v_lebih_baru > 0 THEN
    RAISE EXCEPTION 'Barang ini punya % transaksi LEBIH BARU setelah perpindahannya — batalkan yang lebih baru dulu.', v_lebih_baru;
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Barang tidak ditemukan.'; END IF;

  -- Append-only: pembatalan = baris BARU. `target_trx_ids` yang dibaca seluruh
  -- pembaca untuk mengabaikan baris-baris itu — dan karena penyaringnya id
  -- baris, bukan jenisnya, jalur mutasi internal langsung ikut benar.
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai,
                             skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (p_aset_id, 'batal_pengalihan', fn_periode_dari_tanggal(current_date), current_date,
          COALESCE(v_aset.nilai_perolehan, 0), v_aset.skpd_id, v_h.skpd_id, p_header_id,
          jsonb_build_object('no_sk', v_h.no_sk, 'target_trx_ids', to_jsonb(v_ids),
                             'kategori', v_h.kategori),
          'Batal ' || v_label || ' — dianggap tidak pernah terjadi (' || COALESCE(v_h.no_sk, '-') || ')');

  PERFORM set_config('app.batal_pengalihan', '1', true);

  -- Kembalikan ke SKPD asal. Kolomnya tetap disebut di SET walau nilainya bisa
  -- sudah sama, supaya trigger kode register ikut terpanggil (`UPDATE OF`
  -- menyala saat kolom DISEBUT, bukan saat nilainya berubah).
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = p_aset_id;

  -- Kartu yang seluruh barangnya dibatalkan kembali ke 'pending' supaya bisa
  -- diterima ULANG tanpa SKPD pengirim membuat kartu baru. `draft_items` tak
  -- pernah dihapus saat Terima, jadi isinya aman diterima ulang.
  SELECT count(*) INTO v_sisa
  FROM transaksi_bmd t
  WHERE t.header_id = p_header_id AND t.jenis = v_jenis
    AND NOT EXISTS (
      SELECT 1 FROM transaksi_bmd b
      WHERE b.jenis = 'batal_pengalihan' AND b.header_id = p_header_id
        AND b.payload->'target_trx_ids' @> to_jsonb(t.id)
    );
  IF v_sisa = 0 THEN
    UPDATE jurnal_header
    SET approval_status = 'pending', approved_by = NULL, approved_at = NULL
    WHERE id = p_header_id;
  END IF;
END $function$;

-- ── 2. Batal SELURUH kartu — ikut digeneralkan ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_batal_seluruh_pengalihan(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h     jurnal_header%ROWTYPE;
  v_aset  uuid;
  v_n     integer := 0;
  v_jenis jenis_transaksi_bmd;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND
     OR v_h.kategori NOT IN ('pengalihan_status', 'mutasi_internal')
     OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal perpindahan yang sudah disetujui tidak ditemukan.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan kartu ini.';
  END IF;

  v_jenis := v_h.kategori::jenis_transaksi_bmd;

  -- Wewenang & guard per barang tetap ditegakkan fungsi per-barang — fungsi ini
  -- cuma memutarnya. Satu barang gagal → SELURUH pembatalan batal (satu
  -- transaksi), jadi kartunya tak pernah tertinggal separuh.
  FOR v_aset IN
    SELECT DISTINCT t.aset_id FROM transaksi_bmd t
    WHERE t.header_id = p_header_id AND t.jenis = v_jenis
      AND NOT EXISTS (
        SELECT 1 FROM transaksi_bmd b
        WHERE b.jenis = 'batal_pengalihan' AND b.header_id = p_header_id
          AND b.payload->'target_trx_ids' @> to_jsonb(t.id)
      )
  LOOP
    PERFORM fn_batal_pengalihan_barang(p_header_id, v_aset);
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Tidak ada barang yang masih perlu dibatalkan di kartu ini.';
  END IF;
  RETURN v_n;
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_batal_pengalihan_barang(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_batal_seluruh_pengalihan(uuid) TO authenticated;

-- ── 3. Cabut "Kembalikan" dari mutasi internal ─────────────────────────────
-- Aman: 0 baris `mutasi_internal` ber-`payload.reversal`, jadi tak ada riwayat
-- yang perlu terus dibaca. Pengembalian sungguhan = kartu Pengeluaran Internal
-- BARU ke arah sebaliknya, yang memang punya dokumennya sendiri.
-- `fn_kembalikan_pengalihan_barang` (pengalihan) SENGAJA DIBIARKAN — di sana
-- ada 2 baris reversal hidup.
DROP FUNCTION IF EXISTS public.fn_kembalikan_seluruh_mutasi_internal(uuid);
DROP FUNCTION IF EXISTS public.fn_kembalikan_mutasi_internal(uuid, uuid);
