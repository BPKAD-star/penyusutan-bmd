# PLAN — Period Lock & Catch-up Penyusutan

> **Status: DEFERRED.** Jangan dibangun sampai user mulai submit laporan semester
> resmi (ke BPK/keuangan). Sebelum itu, pakai skenario A (re-run engine bebas).
> Dokumen ini spesifikasi buat dieksekusi nanti.

## 1. Masalah yang diselesaikan

Pengurus barang bisa entry barang **telat**: misal sekarang bulan Agustus (semester 2),
tapi baru meng-entry barang yang `tgl_perolehan`-nya di semester 1. Kalau semester 1
sudah dilaporkan resmi, mengubah angka penyusutan S1 = red flag audit (persis penyakit
e-BMD). Perlu mekanisme yang menjaga periode terkunci tetap utuh tapi akumulasi akhir tetap benar.

## 2. Yang SUDAH ditangani arsitektur (tidak perlu diubah)

- **Periode transaksi = dari `tgl_perolehan`, bukan tanggal entry.** Barang S1 yang
  dientri bulan 8 tetap ber-`periode = YYYY-S1`. (Lihat `PerolehanImport` / `catatTransaksi`
  → `periodeDariTanggal`.)
- **Engine idempotent, replay dari baseline.** `hitungJadwalAset` menghitung jadwal
  penuh dari baseline s.d. `targetPeriode` dan upsert tiap periode. Re-run engine untuk
  target 2026-S2 otomatis menghitung ulang 2026-S1 juga.
- **`created_at` (kapan dientri) terpisah dari `tanggal`/`periode` (kapan efektif)** di
  `transaksi_bmd` → jejak entry telat transparan buat auditor.

## 3. Dua skenario

| Skenario | Kondisi | Perlakuan |
|---|---|---|
| **A. Restate** | Periode S1 **belum** dilaporkan resmi (masih terbuka) | Re-run engine biasa; S1 dihitung ulang. Tidak perlu period-lock. |
| **B. Catch-up** | Periode S1 **sudah** dikunci (dilaporkan) | Angka S1 TIDAK diubah. Beban penyusutan S1 yang kelewat di-akumulasi dan dibebankan di periode terbuka pertama (S2) sebagai catch-up. Akumulasi akhir tahun tetap benar. |

## 4. Perubahan skema

Tabel baru `periode_lock`:
```sql
create table periode_lock (
  periode      text primary key,          -- 'YYYY-S1' | 'YYYY-S2'
  dikunci      boolean not null default false,
  dikunci_oleh uuid references auth.users(id),
  dikunci_pada timestamptz,
  catatan      text                        -- mis. no. surat penyerahan laporan
);
```
RLS: SELECT authenticated; INSERT/UPDATE admin only (via API service role).

## 5. Perubahan engine (`lib/engine/penyusutan.ts` + `/api/engine/run`)

1. Sebelum run, load set periode terkunci.
2. Saat replay per aset, untuk tiap periode:
   - Jika `periode` terkunci **dan** sudah ada baris `penyusutan_semester` untuk (aset, periode):
     **jangan overwrite** — pakai angka existing sebagai basis, jangan tulis ulang.
   - Jika `periode` terkunci **dan belum ada** baris (aset baru/telat masuk): **jangan
     buat baris di periode terkunci.** Sebaliknya, akumulasi `beban_seharusnya` periode
     itu ke variabel `catchUp`.
   - Di periode **terbuka pertama** setelah rentang terkunci: `beban = beban_normal + catchUp`,
     lalu reset `catchUp = 0`. Akumulasi & nilai buku menyesuaikan.
3. Kontrol: `nilai_buku` akhir tahun tetap = perolehan − akumulasi seharusnya (catch-up
   menjaga total benar walau distribusi antar-semester bergeser).
4. Simpan jejak catch-up di payload/kolom (mis. `beban` punya komponen `catch_up` di metadata)
   biar bisa dijelaskan ke auditor.

## 6. Perubahan UI

- Menu **Admin** atau **Penyusutan**: panel "Tutup / Kunci Periode" (admin only) —
  daftar periode + tombol Kunci/Buka + catatan.
- Indikator di halaman Penyusutan: badge "Periode Terkunci" saat melihat periode yang sudah dikunci.
- Saat entry transaksi ber-periode terkunci: tampilkan notifikasi "beban akan dibebankan
  sebagai catch-up di periode berjalan (S2)".

## 7. Edge cases

- Kapitalisasi/koreksi/penghapusan yang jatuh di periode terkunci → perlakuan sama:
  efek finansialnya di-catch-up di periode terbuka, periode terkunci tidak berubah.
- Buka-kunci periode (unlock) → hanya admin, harus dengan catatan; setelah unlock, re-run
  engine me-restate periode itu (kembali ke skenario A).
- Rekonsiliasi tahunan (PLAN utama §11 poin rekonsiliasi) memakai angka periode terkunci
  sebagai sumber resmi.
