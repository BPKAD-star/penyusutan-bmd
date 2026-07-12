-- ============================================================================
-- Bersihkan tabel lama `ai_chat_messages` — sempat dijalankan user sebelum
-- ditata ulang jadi `chat_messages_ai` (migrasi 20260712_08, konsisten dgn
-- penamaan chat_messages/chat_reads yg sudah ada). Kode aplikasi TIDAK PERNAH
-- di-deploy ke main/produksi dgn nama lama ini, jadi dijamin kosong — aman
-- di-drop. Jalankan SETELAH 20260712_08_ai_chat.sql.
-- ============================================================================
DROP TABLE IF EXISTS ai_chat_messages;
