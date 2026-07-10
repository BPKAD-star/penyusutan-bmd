-- ============================================================================
-- Chat DM 1-on-1 + pelacak dibaca — pengembangan dari Chat Grup (migrasi
-- 20260710_14). recipient_id NULL tetap berarti pesan room publik (perilaku
-- lama tidak berubah); diisi = pesan privat 1-on-1 ke user tsb.
--
-- Bukan ledger — data percakapan biasa, boleh diubah/dihapus pemiliknya.
-- ============================================================================

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES admin_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);

-- Publik (recipient_id IS NULL): semua boleh baca, spt sebelumnya.
-- Privat: cuma pengirim & penerima yang boleh baca.
DROP POLICY IF EXISTS "chat_select" ON chat_messages;
CREATE POLICY "chat_select" ON chat_messages FOR SELECT TO authenticated
  USING (recipient_id IS NULL OR sender_id = auth.uid() OR recipient_id = auth.uid());

-- chat_insert & chat_delete tidak berubah (sender_id = auth.uid() utk insert;
-- delete sendiri atau admin) — tetap berlaku sama utk publik maupun DM.

-- Pelacak "sudah dibaca sampai id berapa" per room per user, biar badge
-- unread akurat lintas sesi/device. room_key = 'public' atau uuid lawan
-- bicara (as text).
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id      uuid NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  room_key     text NOT NULL,
  last_read_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, room_key)
);

ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_reads_own" ON chat_reads;
CREATE POLICY "chat_reads_own" ON chat_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
