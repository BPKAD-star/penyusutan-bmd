-- ============================================================================
-- Chat Grup — satu ruang obrolan GLOBAL buat semua user terdaftar platform ini
-- (keputusan user 2026-07-10: "satu aja dulu, nanti dikembangin lagi" — jadi
-- SENGAJA belum ada konsep room/channel/DM, cukup 1 tabel pesan datar).
--
-- sender_id nunjuk ke admin_profiles (BUKAN langsung auth.users) supaya bisa
-- di-embed-join PostgREST buat ambil nama pengirim (admin_profiles.id sendiri
-- FK ke auth.users, jadi tetap konsisten user yg beneran terdaftar).
--
-- BUKAN ledger (bukan riwayat transaksi finansial) — data percakapan biasa,
-- boleh dihapus pemiliknya sendiri (beda dari transaksi_bmd yang append-only).
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id   uuid NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Satu ruang global: semua user login boleh baca semua pesan.
DROP POLICY IF EXISTS "chat_select" ON chat_messages;
CREATE POLICY "chat_select" ON chat_messages FOR SELECT TO authenticated USING (true);

-- Cuma boleh kirim pesan atas nama diri sendiri.
DROP POLICY IF EXISTS "chat_insert" ON chat_messages;
CREATE POLICY "chat_insert" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Boleh hapus pesan sendiri (moderasi/salah kirim) — admin juga boleh hapus
-- pesan siapa pun (moderasi grup).
DROP POLICY IF EXISTS "chat_delete" ON chat_messages;
CREATE POLICY "chat_delete" ON chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR fn_is_admin());

-- Realtime: aktifkan Postgres Changes utk tabel ini (biar pesan baru nongol
-- live tanpa reload). Dibungkus supaya re-runnable kalau sudah pernah ditambah.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
