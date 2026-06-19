-- Jalanin ini di Supabase SQL Editor SEBELUM deploy dashboard

-- Tabel profiles (role management)
CREATE TABLE IF NOT EXISTS profiles (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     text,
  nama      text,
  role      text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- User hanya bisa lihat profil sendiri
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admin bisa lihat semua profil
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin bisa update role
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role bisa insert (untuk create-user API)
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- RLS untuk penyusutan_periode: semua authenticated user bisa READ
ALTER TABLE penyusutan_periode ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read penyusutan"
  ON penyusutan_periode FOR SELECT
  TO authenticated
  USING (true);

-- RLS untuk tabel referensi (skpd, kodefikasi_bmd, dll)
ALTER TABLE skpd ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read skpd"
  ON skpd FOR SELECT TO authenticated USING (true);

ALTER TABLE kodefikasi_bmd ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kodefikasi"
  ON kodefikasi_bmd FOR SELECT TO authenticated USING (true);

ALTER TABLE jenis_aset ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read jenis_aset"
  ON jenis_aset FOR SELECT TO authenticated USING (true);
