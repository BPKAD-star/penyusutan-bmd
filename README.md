# Penyusutan BMD Kabupaten Kediri

Dashboard penyusutan Barang Milik Daerah berbasis Next.js + Supabase.

## Setup

### 1. Supabase — jalanin SQL dulu
Buka Supabase SQL Editor, jalanin file:
```
supabase/migrations/profiles.sql
```

### 2. Buat user admin pertama
Di Supabase Dashboard → Authentication → Users → Add User.
Lalu jalanin SQL:
```sql
INSERT INTO profiles (id, email, nama, role)
VALUES ('uuid-user-lu', 'email@lu.com', 'Nama Admin', 'admin');
```

### 3. Environment variables
Copy `.env.local.example` → `.env.local`, isi:
```
NEXT_PUBLIC_SUPABASE_URL=https://gvwparkboopglytnjbad.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
Anon key dan service role key ada di Supabase → Settings → API.

### 4. Install & jalanin lokal
```bash
npm install
npm run dev
```

### 5. Deploy ke Vercel
```bash
npm install -g vercel
vercel
```
Isi environment variables yang sama di Vercel dashboard.

## Fitur
- Login/logout via Supabase Auth
- Dashboard: ringkasan KPI + top 5 SKPD
- Menu Penyusutan: detail per aset, filter periode/SKPD/nama, export Excel
- Menu Rekap SKPD: agregat per SKPD, export Excel
- Admin: tambah/hapus user, ubah role

## Tambah periode baru (S2)
Jalanin engine Python:
```bash
# Edit PERIODE = "2026-S2" di engine_penyusutan.py
python3 engine_penyusutan.py
```
Dashboard otomatis deteksi periode baru via dropdown filter.
