-- ============================================================================
-- Rapikan 6 baris `koreksi_nilai` manual 2026-07-10 — pakai mekanisme batal
-- yang benar, bukan koreksi bernilai negatif.
--
-- Permintaan user 2026-08-12.
--
-- ── Duduk perkaranya ───────────────────────────────────────────────────────
-- 10 Juli 2026 ada tiga batch SQL manual (16:31, 16:40, 16:51) yang menyentuh
-- DUA aset — bukan satu, seperti dikira semula:
--
--   A. Bagian Umum · "Perbaikan Perkerasan Halaman Rumah Dinas Bupati"
--      baseline 213.847.888 → kini 1.828.592.000
--      #10095 +1.614.744.112  "Koreksi nilai perolehan agar sama dgn file"
--      #10097 −1.614.744.112  "Batalkan koreksi_nilai — mekanisme salah"
--      #10099 +1.614.744.112  "Sinkron basis penyusutan ke nilai file"
--
--   B. Dinas Lingkungan Hidup · "PEMBANGUNAN TAMAN KEPALA KERETA API DI SLG"
--      baseline 1.118.060.700 → kini 169.105.349
--      #10094 −948.955.351 · #10096 +948.955.351 · #10098 −948.955.351
--
-- Pembatalan di tengah (#10097 / #10096) dilakukan sebagai **koreksi_nilai
-- bernilai lawan**, bukan `batal_koreksi_nilai`. Nettonya kebetulan benar, dan
-- Rekonsiliasi memang melaporkannya apa adanya — tapi apa adanya itu berarti
-- SATU peristiwa tampil sebagai TIGA transaksi, dan sebagian mendarat di kolom
-- yang berlawanan. Untuk Bagian Umum: Koreksi Nilai 3.229.488.224 (dua baris
-- positif) berdampingan dengan Koreksi Kurang 1.614.744.112. Auditor yang
-- membaca lembar mutasi akan bertanya, dan tak ada dokumen yang bisa menjawab.
--
-- ── Obatnya ────────────────────────────────────────────────────────────────
-- Anulir DUA baris pertama tiap aset dengan `batal_koreksi_nilai`
-- ber-`payload.target_trx_id`, sisakan baris ketiga sebagai satu-satunya
-- koreksi yang berlaku. Sesudahnya:
--   A → Koreksi Nilai (Tambah) 1.614.744.112, Koreksi Kurang NOL
--   B → Koreksi Kurang 948.955.351, Koreksi Nilai (Tambah) NOL
--
-- ── Kenapa angkanya TIDAK bergerak sama sekali ─────────────────────────────
-- Engine memperlakukan `koreksi_nilai.nilai` sebagai DELTA dan melewati baris
-- yang ada di `koreksiNilaiDibatalkan` (lib/engine/penyusutan.ts case
-- 'koreksi_nilai'). Dua baris yang dianulir adalah pasangan +Δ dan −Δ yang
-- saling meniadakan, jadi menghapus keduanya dari replay meninggalkan delta
-- akhir yang identik:
--   A: 213.847.888 + 1.614.744.112 = 1.828.592.000  (tetap)
--   B: 1.118.060.700 − 948.955.351 =   169.105.349  (tetap)
-- Ketiga baris juga berada di periode yang SAMA (2026-S2), jadi tak ada satu
-- pun periode yang pernah melihat nilai antara. `beban` ikut identik karena
-- dihitung ulang dari `nilaiBuku/sisaSmt` sesudah baris terakhir.
--
-- ⚠️ `aset.nilai_perolehan` SENGAJA TIDAK DISENTUH — baris ketiga tetap
-- berlaku, jadi nilainya memang sudah benar. Karena itu payload di bawah
-- sengaja TIDAK memuat `nilai_perolehan_baru`: kunci itulah yang dibaca
-- `patchAsetDari` (lib/transaksi.ts) untuk mengembalikan nilai aset, dan di
-- sini justru TIDAK boleh terjadi.
--
-- ⚠️ Guard baku "batal hanya untuk transaksi TERBARU" sengaja dilewati — ini
-- perbaikan data lewat migrasi, bukan aksi operator, dan guardnya memang
-- client-side. Dilanggar dengan aman KHUSUS di sini karena yang dianulir
-- adalah pasangan +Δ/−Δ yang saling meniadakan di periode yang sama; hasil
-- replay-nya sudah dibuktikan identik di atas. **Jangan jadikan ini preseden**
-- untuk membatalkan baris di tengah rantai yang tidak saling meniadakan.
--
-- ── Yang TIDAK bisa diperbaiki, dan itu diterima ───────────────────────────
-- Baris #10098 & #10099 yang tersisa payload-nya cuma `{"sumber": "..."}` —
-- tanpa `nilai_lama`/`nilai_baru` seperti koreksi yang lahir dari menu. Tak
-- bisa ditambal: `transaksi_bmd` append-only (trigger
-- `fn_transaksi_bmd_immutable`), payload lama tak boleh di-UPDATE. Dampaknya
-- nihil dalam praktik — keduanya `header_id IS NULL` jadi tak pernah muncul
-- sebagai kartu di menu Koreksi, sehingga tak ada tombol Batal yang akan
-- mencoba membaca kunci yang tak ada.
--
-- Idempoten: `WHERE NOT EXISTS` per target. Aman dijalankan ulang.
-- Tak ada perubahan skema/enum (`batal_koreksi_nilai` sudah ada sejak
-- 20260719_04) → urutan deploy bebas, dan tak ada perubahan kode yang menyertai.
-- ============================================================================

INSERT INTO transaksi_bmd (aset_id, jenis, periode, tanggal, nilai, header_id, payload, keterangan)
SELECT
  t.aset_id,
  'batal_koreksi_nilai',
  fn_periode_dari_tanggal(current_date),
  current_date,
  -- 0, bukan nilai yang dianulir: baris `batal_koreksi_nilai` tidak pernah
  -- dijumlahkan di baris mutasi mana pun (Rekonsiliasi cuma memakainya lewat
  -- `fetchBatalTargets`, yang membaca id target — bukan nilainya). Menaruh
  -- angka di sini hanya menambah peluang ada yang menjumlahkannya kelak.
  0,
  NULL,
  jsonb_build_object(
    'target_trx_id', t.id,
    'nilai_dianulir', t.nilai,
    'sumber', 'Rapikan koreksi manual 2026-07-10 (migrasi 20260812_06)'
  ),
  'Batal koreksi nilai — pembatalan lama dicatat sebagai koreksi bernilai lawan, dirapikan ke mekanisme batal'
FROM transaksi_bmd t
WHERE t.id IN (
        10095, 10097,   -- Bagian Umum — Perbaikan Perkerasan Halaman R. Dinas Bupati
        10094, 10096    -- Dinas Lingkungan Hidup — Taman Kepala Kereta Api SLG
      )
  AND t.jenis = 'koreksi_nilai'
  AND NOT EXISTS (
    SELECT 1 FROM transaksi_bmd b
    WHERE b.jenis = 'batal_koreksi_nilai'
      AND (b.payload->>'target_trx_id')::bigint = t.id
  );

-- ── Pemeriksaan sesudah dijalankan ─────────────────────────────────────────
-- 1. Nilai aset TIDAK boleh bergerak:
--      SELECT nama_barang, nilai_perolehan FROM aset
--      WHERE id IN ('1e110cb3-0f02-466c-a0e8-5f1e0d816841',
--                   'ddcb4b1b-b379-43ca-8896-a2b69ac82025');
--      -- harus tetap 1.828.592.000 dan 169.105.349
-- 2. Rekonsiliasi 2026-S2:
--      Bagian Umum 1.3.3 → Koreksi Nilai 1.614.744.112, Koreksi Kurang kosong
--      Dinas LH   1.3.3 → Koreksi Kurang   948.955.351, Koreksi Nilai kosong
-- 3. Engine boleh di-run ulang untuk 2026-S2 sebagai pembuktian — hasilnya
--    HARUS sama persis dengan sebelumnya. Kalau bergerak, berhenti dan periksa:
--    berarti asumsi "pasangan +Δ/−Δ saling meniadakan" tidak berlaku.
