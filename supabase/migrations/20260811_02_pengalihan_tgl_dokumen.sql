-- Pengalihan Status: tanggal ledger = TANGGAL DOKUMEN, bukan tanggal Terima.
--
-- Membalik keputusan 2026-07-07 (migrasi 24), atas permintaan user 2026-08-11
-- setelah dampaknya terlihat di data hidup.
--
-- ── Apa yang salah dengan yang lama ────────────────────────────────────────
-- `fn_terima_pengalihan` menstempel ledger dgn `current_date`. Alasannya waktu
-- itu masuk akal: tanggal hari ini SELALU jatuh di tahun terbuka, jadi tak
-- pernah bisa ditolak guard tahun-buku, dan `pengalihan_status` tak perlu masuk
-- daftar putih retroaktif.
--
-- Harganya baru terasa 2026-08-11: 51 baris di 16 kartu, SK bertanggal
-- 30 Juni 2026 (2026-S1) tapi baru diterima 11 Agustus → seluruhnya mendarat di
-- 2026-S2 senilai Rp9.573.169.260,03. Kartunya menulis "Tgl. 2026-06-30 ·
-- 2026-S1" (dari header) sementara mutasinya muncul di Semester II (dari
-- ledger) — dua-duanya benar menurut sumbernya, tapi berdampingan begitu
-- terbaca seperti salah satu keliru.
--
-- Ia juga tak konsisten dgn Pengadaan, yang justru memakai tanggal BAST walau
-- di-approve berbulan kemudian. Dua pintu perpindahan barang, dua aturan.
--
-- ── Aturan barunya (keputusan user 2026-08-11) ─────────────────────────────
-- Selalu tanggal dokumen. Kalau tanggal itu di masa depan atau jatuh di tahun
-- yang sudah terkunci → DITOLAK dengan pesan yang menyuruh operator memeriksa
-- ulang tanggalnya (harus di tahun berjalan). SENGAJA fail-loud: mundur diam-
-- diam ke hari ini akan menyimpan tanggal yang bukan maunya siapa pun, dan
-- tak seorang pun akan tahu sampai laporannya dicetak.
--
-- Karena itu `pengalihan_status` TETAP TIDAK masuk daftar putih retroaktif
-- `fn_cek_tahun_buku` — penolakannya memang yang diinginkan. Guard di sini cuma
-- mendahuluinya supaya pesannya bisa dibaca operator, bukan pesan trigger.
--
-- ── Dua perubahan yang menyertainya, dan kenapa wajib sepaket ──────────────
-- Memperbaiki 51 baris lama berarti: batalkan, lalu terima ulang. Tapi
-- `fn_batal_pengalihan_barang` TIDAK PERNAH mengembalikan `approval_status` ke
-- 'pending', sementara `fn_terima_pengalihan` menolak kartu yang bukan
-- 'pending'. Jadi dgn kode lama kartu yang dibatalkan MATI SELAMANYA — SKPD
-- pengirim harus membuat kartu baru dari nol. Itu bukan jalan yang masuk akal
-- untuk sekadar membetulkan tanggal.
--   (a) pembatalan kini mengembalikan kartu ke 'pending' begitu baris
--       pengalihan TERAKHIR yang belum dibatalkan ikut dibatalkan;
--   (b) `fn_batal_seluruh_pengalihan` membatalkan satu kartu utuh sekali jalan
--       (16 klik, bukan 51 — dan tak ada kartu yang tertinggal separuh).
-- `draft_items` memang tak pernah dihapus `fn_terima_pengalihan`, jadi kartu
-- yang kembali ke 'pending' langsung bisa diterima ulang apa adanya.
--
-- ⚠️ Kartu yang kembali ke 'pending' membuat kunci "satu pintu" (migrasi 22)
-- ikut lepas, karena kunci itu memang membaca approval_status. Ditutup di
-- `fn_jurnal_header_guard`: kartu pengalihan yang SUDAH punya jejak ledger tak
-- boleh lagi diubah isinya (no_sk/tanggal/tujuan/draft_items) berapa pun
-- statusnya. Yang boleh berubah cuma kolom approval — itulah yang dipakai
-- kedua RPC di atas.

-- ── 1. Terima pengalihan pakai tanggal dokumen ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_terima_pengalihan(p_header_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_h       jurnal_header%ROWTYPE;
  v_item    jsonb;
  v_aset    RECORD;
  v_n       integer := 0;
  v_periode text;
  v_tahun   integer;
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' THEN
    RAISE EXCEPTION 'Jurnal pengalihan status tidak ditemukan.';
  END IF;
  IF v_h.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Jurnal ini sudah %.', v_h.approval_status;
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD tujuan (atau admin) yang boleh menerima pengalihan ini.';
  END IF;

  -- Tanggal DOKUMEN. Dua penolakan di bawah ini sengaja mendahului trigger
  -- `fn_cek_tahun_buku` semata-mata supaya pesannya bisa dipahami operator —
  -- triggernya tetap jadi penegak sesungguhnya kalau jalur lain lolos.
  IF v_h.tanggal IS NULL THEN
    RAISE EXCEPTION 'Jurnal ini belum punya tanggal dokumen — isi dulu di SKPD asal.';
  END IF;
  IF v_h.tanggal > current_date THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) ada di masa depan. Periksa ulang tanggal SK/BAST-nya — tanggal ledger tidak boleh mendahului hari ini.',
      to_char(v_h.tanggal, 'DD-MM-YYYY');
  END IF;
  v_tahun := EXTRACT(YEAR FROM v_h.tanggal)::int;
  IF NOT EXISTS (SELECT 1 FROM tahun_buku WHERE tahun = v_tahun AND status = 'terbuka') THEN
    RAISE EXCEPTION 'Tanggal dokumen (%) jatuh di tahun % yang sudah TERKUNCI, jadi pengalihannya tidak bisa dicatat di sana. Periksa ulang tanggal dokumennya — harus di tahun buku yang masih berjalan.',
      to_char(v_h.tanggal, 'DD-MM-YYYY'), v_tahun;
  END IF;

  v_periode := fn_periode_dari_tanggal(v_h.tanggal);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_h.payload->'draft_items', '[]'::jsonb))
  LOOP
    SELECT id, skpd_id, status, nilai_perolehan, nama_barang, nibar INTO v_aset
    FROM aset WHERE id = (v_item->>'aset_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang % tidak ditemukan.', v_item->>'aset_id';
    END IF;
    IF v_aset.status <> 'aktif' OR v_aset.skpd_id IS DISTINCT FROM v_h.skpd_id THEN
      RAISE EXCEPTION 'Barang "%" (%) sudah berpindah/tidak aktif — minta SKPD asal merevisi jurnal.',
        COALESCE(v_aset.nama_barang, '-'), COALESCE(v_aset.nibar, '-');
    END IF;

    -- tanggal/periode = TANGGAL DOKUMEN (v_h.tanggal). `tgl_dokumen_sumber`
    -- tetap ditulis walau kini sama dgn kolom tanggal: pembacanya (laporan &
    -- audit) sudah mengandalkannya, dan baris lama memilikinya.
    INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, skpd_asal, skpd_tujuan, header_id, payload, keterangan)
    VALUES (v_aset.id, 'pengalihan_status', v_periode, v_h.tanggal, COALESCE(v_aset.nilai_perolehan, 0),
            v_h.skpd_id, v_h.skpd_tujuan, v_h.id,
            jsonb_build_object('no_sk', v_h.no_sk, 'tgl_dokumen_sumber', v_h.tanggal),
            'Pengalihan status penggunaan — ' || v_h.no_sk);
    UPDATE aset SET skpd_id = v_h.skpd_tujuan WHERE id = v_aset.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Jurnal ini tidak berisi barang.';
  END IF;

  UPDATE jurnal_header
  SET approval_status = 'disetujui', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_header_id;
  RETURN v_n;
END $function$;

-- ── 2. Batal per barang: kembalikan kartu ke 'pending' kalau sudah kosong ───
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
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal pengalihan yang sudah disetujui tidak ditemukan.';
  END IF;

  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan pengalihan ini.';
  END IF;

  -- SEMUA baris pengalihan aset ini di kartu tsb — bisa 1 (baru dikirim) atau
  -- 2 (sudah sempat dikembalikan). Dibatalkan SEKALIGUS: membatalkan separuh
  -- menyisakan rantai yang tak nyambung, dan atribusi SKPD-nya jadi ngawur.
  SELECT array_agg(id ORDER BY id), max(id) INTO v_ids, v_id_terakhir
  FROM transaksi_bmd
  WHERE header_id = p_header_id AND aset_id = p_aset_id AND jenis = 'pengalihan_status';

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Tidak ada baris pengalihan untuk barang ini di kartu tersebut.';
  END IF;

  -- Guard baku repo ini: batal hanya sah untuk peristiwa TERBARU aset itu.
  -- Membatalkan yang di tengah rantai merusak replay kronologis di engine.
  SELECT count(*) INTO v_lebih_baru FROM transaksi_bmd
  WHERE aset_id = p_aset_id AND id > v_id_terakhir;
  IF v_lebih_baru > 0 THEN
    RAISE EXCEPTION 'Barang ini punya % transaksi LEBIH BARU setelah pengalihannya — batalkan yang lebih baru dulu.', v_lebih_baru;
  END IF;

  SELECT id, skpd_id, nilai_perolehan, nama_barang INTO v_aset
  FROM aset WHERE id = p_aset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Barang tidak ditemukan.'; END IF;

  -- Append-only: pembatalan = baris BARU, bukan hapus baris lama.
  -- `target_trx_ids` yang dipakai pembaca untuk mengabaikan baris-baris itu.
  INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai,
                             skpd_asal, skpd_tujuan, header_id, payload, keterangan)
  VALUES (p_aset_id, 'batal_pengalihan', fn_periode_dari_tanggal(current_date), current_date,
          COALESCE(v_aset.nilai_perolehan, 0), v_aset.skpd_id, v_h.skpd_id, p_header_id,
          jsonb_build_object('no_sk', v_h.no_sk, 'target_trx_ids', to_jsonb(v_ids)),
          'Batal pengalihan status — dianggap tidak pernah terjadi (' || COALESCE(v_h.no_sk, '-') || ')');

  PERFORM set_config('app.batal_pengalihan', '1', true);

  -- Kembalikan ke SKPD asal. Kalau barangnya sudah sempat dikembalikan, nilainya
  -- memang sudah sama — tapi kolomnya tetap disebut di SET supaya trigger kode
  -- register ikut terpanggil (klausa `UPDATE OF` menyala saat kolom DISEBUT,
  -- bukan saat nilainya berubah).
  UPDATE aset SET skpd_id = v_h.skpd_id WHERE id = p_aset_id;

  -- Kartu yang seluruh barangnya sudah dibatalkan kembali ke 'pending' supaya
  -- bisa diterima ULANG tanpa SKPD pengirim membuat kartu baru. Tanpa ini,
  -- kartu yang dibatalkan mati selamanya: fn_terima_pengalihan menolak apa pun
  -- yang bukan 'pending'. Isinya aman diterima ulang — `draft_items` tak pernah
  -- dihapus saat Terima.
  SELECT count(*) INTO v_sisa
  FROM transaksi_bmd t
  WHERE t.header_id = p_header_id AND t.jenis = 'pengalihan_status'
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

-- ── 3. Batal SELURUH kartu sekali jalan ────────────────────────────────────
-- Satu kartu selesai utuh atau tidak sama sekali. Membatalkan 51 barang satu
-- per satu berisiko berhenti di tengah dan meninggalkan kartu separuh — dan
-- kartu separuh itu tak akan kembali ke 'pending', jadi tak bisa diterima ulang
-- maupun dilanjutkan dengan mudah.
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
BEGIN
  SELECT * INTO v_h FROM jurnal_header WHERE id = p_header_id FOR UPDATE;
  IF NOT FOUND OR v_h.kategori <> 'pengalihan_status' OR v_h.approval_status <> 'disetujui' THEN
    RAISE EXCEPTION 'Jurnal pengalihan yang sudah disetujui tidak ditemukan.';
  END IF;
  IF NOT (fn_is_admin() OR fn_skpd_visible(v_h.skpd_tujuan)) THEN
    RAISE EXCEPTION 'Hanya SKPD penerima (atau admin) yang boleh membatalkan pengalihan ini.';
  END IF;

  -- Wewenang & guard per barang tetap ditegakkan fn_batal_pengalihan_barang —
  -- fungsi ini cuma memutarnya, jangan disalin isinya ke sini. Kalau salah satu
  -- barang punya transaksi lebih baru, SELURUH pembatalan ini batal (satu
  -- transaksi), jadi kartunya tak pernah tertinggal separuh.
  FOR v_aset IN
    SELECT DISTINCT t.aset_id FROM transaksi_bmd t
    WHERE t.header_id = p_header_id AND t.jenis = 'pengalihan_status'
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

GRANT EXECUTE ON FUNCTION public.fn_batal_seluruh_pengalihan(uuid) TO authenticated;

-- ── 4. Kartu berledger tak boleh diubah isinya, berapa pun statusnya ───────
CREATE OR REPLACE FUNCTION public.fn_jurnal_header_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.periode := fn_periode_dari_tanggal(NEW.tanggal);
    IF NEW.kategori = 'pengalihan_status' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Pengalihan status: SKPD tujuan wajib diisi.';
      END IF;
      IF EXISTS (SELECT 1 FROM admin_skpd WHERE id = NEW.skpd_tujuan AND parent_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Pengalihan status: tujuan harus level SKPD induk (bukan Sub OPD/Lokasi).';
      END IF;
    ELSIF NEW.kategori = 'mutasi_internal' THEN
      IF NEW.skpd_tujuan IS NULL THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan wajib diisi.';
      END IF;
      IF NEW.skpd_tujuan = NEW.skpd_id THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD tujuan tidak boleh sama dengan SKPD asal.';
      END IF;
      IF fn_skpd_root(NEW.skpd_id) IS DISTINCT FROM fn_skpd_root(NEW.skpd_tujuan) THEN
        RAISE EXCEPTION 'Mutasi internal: SKPD asal & tujuan harus dalam satu SKPD induk (tree) yang sama — lintas SKPD induk pakai menu Penggunaan.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: skpd & kategori tak boleh berubah (itu = jurnal lain, harus entry ulang).
  IF NEW.skpd_id IS DISTINCT FROM OLD.skpd_id
     OR NEW.kategori IS DISTINCT FROM OLD.kategori THEN
    RAISE EXCEPTION 'jurnal_header: skpd_id/kategori tidak boleh diubah — batalkan & buat jurnal baru.';
  END IF;

  -- Kartu pengalihan yang SUDAH punya jejak ledger: isinya beku SELAMANYA,
  -- termasuk saat pembatalan mengembalikan statusnya ke 'pending' (migrasi
  -- 20260811_02). Kunci "satu pintu" migrasi 22 membaca approval_status, jadi
  -- tanpa aturan ini status yang turun ikut melepas kuncinya — dan kartu bisa
  -- disunting setelah isinya terlanjur jadi peristiwa nyata di ledger.
  -- Kolom approval SENGAJA dibiarkan berubah: itulah yang dipakai
  -- fn_terima_pengalihan & fn_batal_pengalihan_barang.
  IF OLD.kategori = 'pengalihan_status'
     AND EXISTS (SELECT 1 FROM transaksi_bmd WHERE header_id = OLD.id) THEN
    IF NEW.no_sk       IS DISTINCT FROM OLD.no_sk
       OR NEW.tanggal  IS DISTINCT FROM OLD.tanggal
       OR NEW.keterangan IS DISTINCT FROM OLD.keterangan
       OR NEW.skpd_tujuan IS DISTINCT FROM OLD.skpd_tujuan
       OR NEW.payload  IS DISTINCT FROM OLD.payload THEN
      RAISE EXCEPTION 'Kartu pengalihan ini sudah pernah diterima & tercatat di ledger — isinya tidak bisa diubah lagi. Kalau barangnya keliru, batalkan pengalihannya lalu buat kartu baru.';
    END IF;
  END IF;

  -- SKPD tujuan terkunci begitu jurnal tidak lagi pending (sudah diputuskan
  -- penerima) — mengubahnya = jurnal lain, harus entry ulang.
  IF NEW.skpd_tujuan IS DISTINCT FROM OLD.skpd_tujuan
     AND COALESCE(OLD.approval_status, 'disetujui') <> 'pending' THEN
    RAISE EXCEPTION 'jurnal_header: SKPD tujuan tidak boleh diubah setelah jurnal diputuskan.';
  END IF;

  -- Tanggal baru wajib jatuh di semester yang sama dgn periode beku header.
  IF fn_periode_dari_tanggal(NEW.tanggal) <> OLD.periode THEN
    RAISE EXCEPTION
      'Tanggal (%) di luar semester jurnal (%). Untuk pindah semester, batalkan jurnal & entry ulang.',
      NEW.tanggal, OLD.periode;
  END IF;

  NEW.periode    := OLD.periode;   -- periode tetap beku
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- ── 5. Hapus kartu berledger: pesan yang bisa dibaca, bukan galat FK mentah ─
-- FK `transaksi_bmd_header_id_fkey` sudah menahannya (NO ACTION), jadi ini
-- bukan lubang keamanan — cuma pesannya yang tak bisa dipahami operator.
CREATE OR REPLACE FUNCTION public.fn_jurnal_header_hapus_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM transaksi_bmd WHERE header_id = OLD.id) THEN
    RAISE EXCEPTION 'Kartu "%" sudah punya transaksi di ledger, jadi tidak bisa dihapus. Ledger bersifat append-only — batalkan transaksinya, jangan hapus kartunya.',
      COALESCE(OLD.no_sk, '(tanpa no.)');
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_jurnal_header_hapus_guard ON jurnal_header;
CREATE TRIGGER trg_jurnal_header_hapus_guard BEFORE DELETE ON jurnal_header
  FOR EACH ROW EXECUTE FUNCTION fn_jurnal_header_hapus_guard();
