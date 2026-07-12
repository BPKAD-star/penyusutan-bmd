-- ============================================================================
-- Chat AI (asisten) — opsi baru di ChatWidget, sejajar dgn Publik & DM manusia
-- tapi TERPISAH dari chat_messages: tiap baris di sini murni percakapan PRIBADI
-- user dgn AI (via OpenRouter, lihat app/api/ai-chat/route.ts), bukan pesan ke
-- sesama user. Dipisah tabel (bukan pakai chat_messages + recipient khusus)
-- supaya tak perlu bikin baris admin_profiles palsu utk "user AI", dan supaya
-- RLS-nya sederhana: tiap user cuma boleh lihat/insert/hapus barisnya sendiri.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages_ai (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES admin_profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 8000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_ai_user ON chat_messages_ai(user_id, id);

ALTER TABLE chat_messages_ai ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_ai_select ON chat_messages_ai;
CREATE POLICY chat_messages_ai_select ON chat_messages_ai FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_ai_insert ON chat_messages_ai;
CREATE POLICY chat_messages_ai_insert ON chat_messages_ai FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_ai_delete ON chat_messages_ai;
CREATE POLICY chat_messages_ai_delete ON chat_messages_ai FOR DELETE
  USING (user_id = auth.uid());
