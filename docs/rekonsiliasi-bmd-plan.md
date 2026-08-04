# Rencana Implementasi — Berita Acara Rekonsiliasi BMD

Status: **Fase 1–3 SUDAH JALAN** (per 2026-08-04). Disepakati dari sesi diskusi
2026-07-20; DECISION-1 dijawab user 2026-08-04 (**Opsi A**, lihat §5.4).
Rincian status per fase & sisa pekerjaannya ada di §10.

Kodenya: `lib/rekon.ts` (snapshot period-correct, dekomposisi mutasi, atribusi
beban/akumulasi) + `app/dashboard/pelaporan/rekonsiliasi/page.tsx` (tabel) +
`components/pelaporan/RekonDetailModal.tsx` (drill-down) + `lib/rekon.test.ts`
(uji atribusi, memakai contoh angka §6 sebagai patokan).

Menu baru: **Pelaporan → Laporan BMD → Rekonsiliasi BMD** (halaman terpisah,
sibling di bawah Laporan BMD). Read-only, tanpa perubahan skema/ledger. Export
Excel.

---

## 1. Tujuan & keputusan kunci (LOCKED)

Laporan mutasi BMD gaya Berita Acara Rekonsiliasi: menjelaskan **transaksi apa
saja** yang terjadi di sebuah SKPD, **per semester**, per jenis aset, dengan
rantai `Saldo Awal + Penambahan − Pengurangan = Saldo Akhir` untuk **4 ukuran**
(Nilai Perolehan, Beban Penyusutan, Akumulasi Penyusutan, Nilai Buku) × **2
kolom komptabel** (Intra & Ekstra).

Keputusan yang sudah dikunci:

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Period-correctness | **Fork A** — period-correct betulan (S1 beku walau S2 bergerak). Jadi alat pembanding untuk menemukan yang missed di Laporan BMD. |
| 2 | Kolom Beban & Akumulasi | **Atribusi penuh** per kategori (selama sel itu ada transaksi). |
| 3 | Kapitalisasi | **Baris sendiri** di Penambahan. |
| 4 | Pemecahan | **Diabaikan** (net-nol). |
| 5 | "Perolehan dari rekening Belanja Jasa" | `pengadaan` dengan `payload.kode_rekening` diawali **`5.1`**. Tanpa rekening / bukan pengadaan → Cara Perolehan biasa (Opsi B). |
| 6 | Urutan jenis aset | Tanah → Peralatan & Mesin → Gedung & Bangunan → Jalan/Jaringan/Irigasi → Aset Tetap Lainnya → KDP → Aset Tidak Berwujud → Aset Lain-Lain (`GOLONGAN_REKAP`, sudah urut ini). |

---

## 2. Struktur laporan (per golongan, per semester)

Satu tabel **per golongan** (8 tabel, urut poin #6). Tiap tabel punya kolom:

```
                                  |------------- INTRA -------------|------------- EKSTRA ------------|
Baris                             | Perolehan  Beban  Akumulasi  NB | Perolehan  Beban  Akumulasi  NB |
```

Baris (mengikuti image target):

```
SALDO AWAL
Penambahan
  Cara Perolehan
    Pengadaan
    Hibah
    Tukar Menukar
    Hasil Inventarisasi
    Perolehan Lainnya
  Perolehan dari rekening Belanja Jasa
  Penggunaan (transfer masuk)
  Kapitalisasi                         ← baris baru (keputusan #3)
  Koreksi Nilai
  Reklasifikasi
    Intra
    Ekstra
    Perubahan Fungsi
    Kesalahan Kodefikasi
JUMLAH PENAMBAHAN
Pengurangan
  Penghapusan Pemindahtanganan
    Penjualan
    Hibah
    Tukar Menukar
    Penyertaan Modal
  Penghapusan Sebab Lain
  Penghapusan Pengalihan (transfer keluar)
  Koreksi Kurang
  Reklasifikasi
    Intra
    Ekstra
    Perubahan Fungsi
    Kesalahan Kodefikasi
JUMLAH PENGURANGAN
SALDO AKHIR
```

Dua semester ditampilkan berdampingan (atau dua blok: S1 lalu S2) dengan rantai:
`S1.SaldoAkhir ≡ S2.SaldoAwal`, `S2.SaldoAkhir ≡ SaldoAwal tahun depan`.

---

## 3. Pemetaan kategori → sumber ledger (LOCKED)

Baris tabel diturunkan dari `transaksi_bmd.jenis` (+ payload) pada periode
tersebut. Golongan dari `kode` (`kodeLevel3`), komptabel dari `intra_ekstra`.

| Baris laporan | `jenis` (+ payload) |
|---|---|
| Cara Perolehan → Pengadaan | `pengadaan`, `payload.kode_rekening` **≠ 5.1** (5.2/kosong/lain) |
| Perolehan dari rekening Belanja Jasa | `pengadaan`, `payload.kode_rekening` **diawali 5.1** |
| Cara Perolehan → Hibah / Tukar / Hasil Inventarisasi / Perolehan Lainnya | `hibah_masuk` / `tukar_menukar` / `hasil_inventarisasi` / `perolehan_lainnya` |
| Penggunaan (transfer masuk) | `pengalihan_status` — tujuan in-scope, asal luar scope |
| Kapitalisasi | `kapitalisasi` (abaikan yang di-`batal_kapitalisasi`; jangan dobel `kapitalisasi_serap`) |
| Koreksi Nilai / Koreksi Kurang | `koreksi_nilai`, delta `+` / `−` (`payload.delta`) |
| Reklasifikasi → Intra / Ekstra | `reklas_komptabel` (pindah antar kolom Intra↔Ekstra) |
| Reklasifikasi → Perubahan Fungsi | `reklas_golongan` (keluar golongan asal, masuk golongan tujuan) |
| Reklasifikasi → Kesalahan Kodefikasi | `reklas_kode` (keluar kode asal, masuk kode tujuan) |
| Penghapusan Pemindahtanganan → Penjualan/Hibah/Tukar/Penyertaan Modal | `penghapusan_pemindahtanganan`, `payload.sub_jenis` = `penjualan`/`hibah`/`tukar_menukar`/`penyertaan_modal` |
| Penghapusan Sebab Lain | `penghapusan_sebab_lain` |
| Penghapusan Pengalihan (transfer keluar) | `pengalihan_status` — asal in-scope, tujuan luar scope |

**Void / batal** (retroaktif) ikut aturan Model 3 yang sudah teruji: `batal_*`
& `koreksi_pencatatan_ganda` menyaring aset dari Penambahan (dianggap tak pernah
ada); `batal_penghapusan`/`batal_reklas`/`batal_kapitalisasi` membatalkan efek
di baris terkait. Lihat `VOID_JENIS`, `fetchVoidedAsetIds`,
`fetchPenghapusanNetRemoved`, `fetchReklasDibatalkan` di
`app/dashboard/pelaporan/bmd/page.tsx`.

**Diabaikan**: `pemecahan_keluar`/`pemecahan_masuk` (net-nol, keputusan #4),
`mutasi_internal` (dalam satu SKPD induk — netral untuk rekap per SKPD induk),
`koreksi_spesifikasi`/`reklas_komptabel` yang nol-efek nilai perolehan tetap
dicatat di kolom komptabel (pindah keranjang).

---

## 4. Sumber angka & period-correctness (Fork A) — INTI

### 4.1 Kenapa `fn_rekap_bmd` TIDAK cukup

`fn_rekap_bmd` ([20260716_06](../supabase/migrations/20260716_06_fn_rekap_saldo_awal_dan_bmd.sql))
period-aware sebagian: `tgl_perolehan <= periode` ✓ dan `penyusutan_semester.periode`
✓, **tapi**:
- `WHERE a.status = 'aktif'` (status **sekarang**) → aset yang dihapus di S2 hilang dari S1. ❌
- `GROUP BY a.skpd_id` (SKPD **sekarang**) → aset yang dialihkan di S2 salah atribusi di S1. ❌
- `sum(a.nilai_perolehan)` (perolehan **sekarang**, sudah termasuk kapitalisasi belakangan) → S1 ikut naik kalau ada kapitalisasi S2. ❌

Ketiganya melanggar syarat "S1 harus utuh". Maka Rekonsiliasi butuh **snapshot
period-correct** sendiri.

### 4.2 Definisi snapshot period-correct pada periode `P`

Untuk tiap aset, **state pada akhir `P`** = baris `penyusutan_semester(P)`:
`(nilai_perolehan, beban, akumulasi, nilai_buku_akhir)` — ini SUDAH beku per
periode & sudah mencerminkan kapitalisasi/koreksi *s.d.* P (bukan yang setelahnya).

Himpunan aset yang **masuk snapshot P** ditentukan **replay ledger** (sama persis
dengan halaman Penyusutan & Daftar Barang, bukan `status` terkini):
- **Visibilitas**: diperoleh `tgl_perolehan ≤ P` **dan** tidak tersembunyi pada P
  (`SEMBUNYI`/`MUNCUL` dengan `comparePeriode(e.periode, P) ≤ 0`). Reuse pola
  `fetchHiddenIds`.
- **Kepemilikan**: SKPD pemilik pada P via `fetchOwnerOverrides(P)`
  (`lib/pengalihan.ts`) — bukan `aset.skpd_id` terkini.

Golongan non-disusutkan (Tanah 1.3.1, KDP 1.3.6, Aset Lain-Lain 1.5.4 beku):
tak punya baris `penyusutan_semester` → perolehan diambil period-correct dari
ledger/aset (perolehan s.d. P), beban/akumulasi = 0, nilai buku = perolehan.

> **Konsekuensi tie-out**: target rekonsiliasi yang benar = **snapshot
> period-aware ini** (identik dengan angka halaman **Penyusutan**). Di titik
> yang berbeda dengan Laporan BMD sekarang (`fn_rekap_bmd`), **itulah "yang
> missed"** yang justru ingin ditemukan (keputusan #1). Lihat §9.

### 4.3 Rekomendasi: naikkan Laporan BMD ke standar yang sama

Supaya "Saldo Akhir Rekonsiliasi = Laporan BMD" benar-benar tercapai (bukan dua
angka beda), disarankan `fn_rekap_bmd` juga diperbaiki jadi period-correct
(visibilitas + kepemilikan + `nilai_perolehan` per periode). **Perlu keputusan
terpisah** (lihat §11) — bisa fase lanjutan.

---

## 5. Aturan atribusi 4 ukuran (LOCKED prinsip; contoh di §6)

### 5.1 Invarian rekonsiliasi (jaminan tie-out)

> **Setiap aset menyumbang PERSIS SEKALI** ke dekomposisi periode. Kalau tiap
> aset dihitung tepat sekali, maka `Σ Penambahan − Σ Pengurangan = SaldoAkhir −
> SaldoAwal` untuk keempat ukuran secara otomatis.

Kontribusi aset ke ukuran `M` pada periode `P`:
- **Aset BARU di P** (ada di snapshot P, tidak di P−1): `+M_P` di baris kategori
  masuknya (Pengadaan/Hibah/.../Pengalihan masuk/Reklas masuk).
- **Aset KELUAR di P** (ada di P−1, tidak di P): `−M_{P−1}` di baris kategori
  keluarnya (Penghapusan/Pengalihan keluar/Reklas keluar).
- **Aset LANJUT** (ada di P−1 dan P): `ΔM = M_P − M_{P−1}` di baris peristiwa
  yang mengubahnya (Kapitalisasi/Koreksi), atau untuk Akumulasi lewat Beban (§5.3).

### 5.2 Nilai Perolehan (stok — paling lugas)

- Pengadaan/Belanja Jasa/Hibah/dst: `+nilai_perolehan_P` aset baru.
- Kapitalisasi: `+Δperolehan` (nilai rehab) aset lanjut.
- Koreksi Nilai/Kurang: `±Δperolehan` (`payload.delta`).
- Penghapusan/Pengalihan/Reklas keluar: `−perolehan_{P−1}`.
- Reklas Komptabel: pindah perolehan **antar kolom Intra↔Ekstra** golongan sama.

Ini sudah dilakukan Model 3 untuk 1 ukuran — tinggal diperluas & dihaluskan
kategorinya.

### 5.3 Beban & Akumulasi (atribusi penuh — bagian tersulit)

- **Beban (kolom, flow periode)**: tiap baris menampilkan `Σ beban_P` populasi
  barisnya. Total kolom Beban = total penyusutan periode. Atribusi:
  - Aset baru → beban_P-nya di baris masuk.
  - Aset lanjut tak-dimodifikasi → beban_P di baris **Saldo Awal**.
  - Aset lanjut dimodifikasi (kapitalisasi/koreksi) → lihat aturan split §5.4.
  - Aset keluar → beban_P (bagian periode sebelum keluar, jika ada) sebagai memo baris keluar.
- **Akumulasi (stok)**: roll-forward
  `SaldoAkhir_Akum = SaldoAwal_Akum + Σ Beban(semua baris) + Σ Akum_bawaan(transfer/reklas masuk) − Σ Akum_keluar(pengurangan)`.
  - Aset baru **perolehan** (Pengadaan dll): Akum-nya = beban_P (sudah di kolom
    Beban) → kontribusi baris Akumulasi = 0 (hindari dobel).
  - Aset **transfer/reklas masuk**: bawa Akum lama → kontribusi Akumulasi =
    `akum_P − beban_P` (bagian bawaan saja; beban_P sudah di kolom Beban).
  - Aset keluar: `−akum_{P−1}`.
- **Nilai Buku**: turunan per baris = `Perolehan − Akumulasi`.

### 5.4 Split Kapitalisasi & Koreksi Nilai pada aset LANJUT (satu-satunya titik yang perlu dikonfirmasi)

Aset yang sudah ada sejak Saldo Awal, lalu di-kapitalisasi/koreksi di periode
yang sama, tetap menyusut **dan** berubah nilainya. Aturan yang diusulkan (pasti
reconcile):
- **Perolehan**: `Δperolehan` (nilai rehab / delta koreksi) → baris
  Kapitalisasi / Koreksi.
- **Beban**: seluruh `beban_P` aset itu tetap di baris **Saldo Awal** (dia
  populasi awal). Baris Kapitalisasi/Koreksi **tidak** membebani ulang.
- **Akumulasi**: `Δakum` aset = `beban_P` (sudah lewat kolom Beban di Saldo
  Awal). Efek kapitalisasi terhadap masa manfaat sudah otomatis tercermin di
  `beban_P` hasil engine → tak perlu koreksi manual.

> **DECISION-1 — DIJAWAB (user, 2026-08-04): OPSI A**, yakni usulan di atas —
> beban aset yang di-kapitalisasi/dikoreksi tetap PENUH di baris Saldo Awal;
> baris Kapitalisasi/Koreksi cuma membawa Δ perolehan, bebannya nol.
> Alasan yang dipakai: (1) tiap aset menyumbang persis sekali ke tiap ukuran →
> rantainya pasti tie-out tanpa selisih pembulatan; (2) engine cuma menghasilkan
> SATU angka beban per aset per periode — efek kapitalisasi terhadap masa manfaat
> sudah melebur di dalamnya, jadi angka split-nya bukan dibaca melainkan dikarang.
> Konsekuensi yang diterima: baris Kapitalisasi tak menceritakan "rehab ini
> menambah beban sekian"; dampaknya baru terbaca lewat naiknya beban di baris
> Saldo Awal periode berikutnya.
> Ditegakkan di `attribusiPenyusutan` (lib/rekon.ts) & dikunci test
> `lib/rekon.test.ts` ("OPSI A — baris Kapitalisasi cuma membawa Δ perolehan").

---

## 6. Contoh angka (bukti reconcile)

Golongan Peralatan & Mesin, Intra, 1 SKPD. Periode S2 (`P`), S1 = `P−1`.

Populasi:
- **A** (lanjut, tak berubah): S1 → NP 100, Akum 40, NB 60, beban/smt 10. S2 → beban 10, Akum 50, NB 50.
- **B** (dibeli di S2 via Pengadaan 5.2): NP 200, beban S2 = 20, Akum 20, NB 180.
- **C** (lanjut, di-kapitalisasi S2 +50): S1 → NP 300, Akum 120, NB 180. S2 → NP 350, beban 30, Akum 150, NB 200.
- **D** (dihapus/dijual di S2): S1 → NP 80, Akum 30, NB 50.

| Baris | Perolehan | Beban | Akumulasi | Nilai Buku |
|---|--:|--:|--:|--:|
| **Saldo Awal** (A,C,D) | 100+300+80 = **480** | 10+30 = **40** | 40+120+30 = **190** | **290** |
| Pengadaan (B) | +200 | +20 | +0¹ | +180 |
| Kapitalisasi (C) | +50 | 0 | +0 | +50 |
| **Jumlah Penambahan** | **250** | **20** | **0** | **230** |
| Penghapusan Pemindahtanganan → Penjualan (D) | −80 | 0² | −30 | −50 |
| **Jumlah Pengurangan** | **80** | **0** | **30** | **50** |
| **Saldo Akhir** (A,B,C) | 100+200+350 = **650** | (memo) | 50+20+150 = **220** | **430** |

Cek rantai:
- Perolehan: 480 + 250 − 80 = **650** ✓
- Akumulasi: 190 + [ΣBeban 40+20 = 60] + [Akum bawaan masuk 0] − [Akum keluar 30] = **220** ✓
  (¹ Akum B lewat Beban=20, bukan baris Akumulasi → hindari dobel. Beban A(10)+C(30) di Saldo Awal, B(20) di Pengadaan = total beban 60.)
- Nilai Buku: 290 + 230 − 50 = **470**? → **≠ 430**. ⚠️

> **Catatan penting dari contoh**: Nilai Buku **tidak** bisa di-roll-forward
> naif seperti Perolehan/Akumulasi, karena Beban (yang menurunkan NB) bukan baris
> Penambahan/Pengurangan. **NB per baris dihitung turunan `Perolehan −
> Akumulasi`, dan "Jumlah/Saldo" NB = Perolehan gabungan − Akumulasi gabungan**,
> BUKAN penjumlahan kolom NB antar baris. Di Saldo Akhir: 650 − 220 = **430** ✓.
> Ini akan ditegakkan di kode: kolom NB selalu diturunkan, tak pernah dijumlah
> vertikal.

---

## 7. Arsitektur teknis

Prinsip: agregasi di **server (RPC, SECURITY INVOKER → tunduk RLS)**, hindari
narik ratusan ribu baris ke browser. Pelajaran RLS terbaru (set-membership
InitPlan, `20260720_01`) tetap berlaku.

Komponen:

1. **RPC snapshot period-correct** — `fn_rekon_snapshot(p_periode, p_skpd_ids, p_komptabel)`
   → agregat `(golongan, intra_ekstra)` dari 4 ukuran, dengan:
   - perolehan/beban/akum/NB dari `penyusutan_semester(p_periode)` (join aset;
     non-disusutkan pakai perolehan period-correct),
   - visibilitas period-aware (replay `SEMBUNYI`/`MUNCUL`) & kepemilikan
     period-aware (pengalihan) **di SQL**, atau
   - **Alternatif berisiko-rendah**: reuse mesin client (`fetchHiddenIds`,
     `fetchOwnerOverrides`, fetch `penyusutan_semester`) yang sudah ada di
     halaman Penyusutan, dibungkus fungsi agregasi. Dipertimbangkan karena
     replay period-aware di SQL non-trivial. **DECISION-2** (lihat §11).

2. **RPC / logika mutasi** — dekomposisi Penambahan/Pengurangan per kategori ×
   4 ukuran. Basis: `prosesMutasi` di Laporan BMD (sudah menangani void, net-
   removed, reklas dibatalkan, pengalihan masuk/keluar) — diperluas dari 1 ke 4
   ukuran + kategori halus + intra/ekstra.

3. **Halaman** `app/dashboard/pelaporan/rekonsiliasi/page.tsx` — filter (SKPD
   `lockToOperator`, Tahun; **dua semester dihitung sekaligus**), tombol Proses,
   render 8 tabel, Export.

4. **Komponen tabel** `components/RekonTable.tsx` — baris hierarkis + kolom
   Intra/Ekstra × 4 ukuran; NB selalu diturunkan (§6).

Reuse: `GOLONGAN_REKAP`, `kodeLevel3`, `parsePeriode/previousPeriode/formatPeriode`,
`exportToExcel`, `SkpdCombobox lockToOperator`, `fetchOwnerOverrides`,
pola `fetchHiddenIds`.

---

## 8. Export Excel

Satu workbook; per golongan bisa jadi satu sheet atau blok terpisah dalam satu
sheet, mengikuti struktur §2 (baris hierarkis, kolom Intra/Ekstra × 4 ukuran,
dua semester). Pakai `exportToExcel` (`lib/export.ts`). NB tetap diturunkan.

---

## 9. Rantai 2 semester & invarian tie-out (QA)

- `S1.SaldoAwal` = snapshot(tahun−1 S2) / checkpoint / `aset_awal_2026` (tahun baseline).
- `S1.SaldoAkhir` = snapshot(`YYYY-S1`) = `S2.SaldoAwal` (harus **identik**, dihitung sekali).
- `S2.SaldoAkhir` = snapshot(`YYYY-S2`) = SaldoAwal tahun depan.

Self-check yang WAJIB lolos (ditampilkan sebagai indikator di UI, mis. badge
"reconcile ✓/✗"):
1. `Σ Penambahan − Σ Pengurangan = SaldoAkhir − SaldoAwal` untuk Perolehan &
   Akumulasi, tiap golongan, tiap kolom Intra/Ekstra, tiap semester.
2. `S1.SaldoAkhir ≡ S2.SaldoAwal`.
3. `SaldoAkhir` (semua ukuran) **≡ halaman Penyusutan** periode sama, golongan
   sama, komptabel sama.
4. NB per baris = Perolehan − Akumulasi.

Selisih dengan **Laporan BMD (fn_rekap_bmd)** dicatat, bukan disembunyikan — itu
justru output yang dicari (keputusan #1).

---

## 10. Fase implementasi

- ~~**Fase 0**~~ **SELESAI** — DECISION-1 dijawab (Opsi A, §5.4); DECISION-2
  diambil jalur "reuse mesin client" (§7 alternatif berisiko-rendah).
- ~~**Fase 1**~~ **SELESAI** — snapshot period-correct + halaman + tabel Saldo
  Awal/Akhir 4 ukuran × intra/ekstra × 8 golongan.
- ~~**Fase 2**~~ **SELESAI** — dekomposisi mutasi utk **Nilai Perolehan** +
  baris "Selisih (belum terpetakan)" sbg penyeimbang.
- ~~**Fase 3**~~ **SELESAI (2026-08-04)** — atribusi **Beban & Akumulasi**
  (`attribusiPenyusutan`, lib/rekon.ts). Aturannya per SEL (golongan ×
  komptabel), bukan per aset global — itu yang bikin reklasifikasi antar
  golongan tetap tie-out di kedua selnya. Yang menegakkan kebenaran adalah uji
  keanggotaan sel (aset ada di P−1 / di P), BUKAN daftar kategori; daftar
  `MASUK_KEYS`/`KELUAR_KEYS` cuma menentukan baris mana yang kebagian label
  ketika satu aset punya beberapa baris di sel yang sama.

  **Sisa yang belum, dan sengaja:**
  - **Fase 2b** — `reklas_komptabel` (baris Reklasifikasi → Intra/Ekstra) masih
    belum punya `MutasiKey`; angkanya jatuh ke baris **Selisih**. Rantainya tetap
    reconcile, cuma tak berlabel.
  - **Badge reconcile** (§9) belum ada; untuk sekarang baris Selisih yang jadi
    penunjuknya — nol artinya cocok sempurna.
- **Fase 4** — badge reconcile + polish. (Export Excel **sudah** ada dan kini
  membawa keempat ukuran untuk semua baris.)
- **Fase 5 (opsional/terpisah)** — naikkan `fn_rekap_bmd` (Laporan BMD) ke
  standar period-correct supaya dua laporan konsisten (§4.3).

> ⚠️ **Catatan cara baca kolom Akumulasi** (konsekuensi §5.3 yang gampang
> disalahpahami saat tie-out): kolom Akumulasi **tidak** menjumlah vertikal
> seperti Nilai Perolehan. Akumulasi bertambah karena **beban**, dan beban ada di
> kolomnya sendiri — bukan baris Penambahan. Rantainya: `Saldo Awal + Beban
> periode + akumulasi bawaan barang masuk − akumulasi barang keluar = Saldo
> Akhir`. Ini juga sebabnya self-check §9 #1 untuk Akumulasi harus dibaca sebagai
> rantai berikut suku ΣBeban, bukan `Σ Penambahan − Σ Pengurangan` polos —
> contoh angka §6 memang begitu (190 + 60 + 0 − 30 = 220).

---

## 11. Item yang MASIH perlu keputusan

- ~~**DECISION-1**~~ (§5.4) **DIJAWAB 2026-08-04: Opsi A** — beban aset yang
  dikapitalisasi/dikoreksi tetap penuh di baris Saldo Awal.
- ~~**DECISION-2**~~ (§7) **DIAMBIL: reuse mesin client** (`fetchHiddenIds`,
  `fetchOwnerOverrides`, `penyusutan_semester`) — kebenaran dulu. Konsekuensinya
  beratnya ikut jumlah aset dalam scope: se-pemda ≈ 227rb posisi aset ditahan di
  browser untuk DUA periode. Pemindahan agregasi ke RPC sudah terdaftar di
  REFACTOR-PLAN §"Rekonsiliasi & Laporan BMD"; **ukur dulu sebagai pengurus SKPD
  TERBESAR sebelum menyimpulkan** (rules.md §18).
- **DECISION-3** (§4.3, Fase 5): apakah `fn_rekap_bmd`/Laporan BMD ikut
  dinaikkan ke period-correct sekarang atau nanti. **Belum diputuskan.**
- **Data quality**: `kode_rekening` teks bebas & hanya di Pengadaan → baris
  "Belanja Jasa" hanya menangkap pengadaan ber-5.1 yang benar terisi. Perlu
  disepakati bahwa yang kosong = Cara Perolehan biasa (sudah, Opsi B).

## 12. Prinsip yang tidak dilanggar

- Read-only; tanpa ubah `transaksi_bmd`/`aset`/skema. Append-only ledger aman.
- RPC SECURITY INVOKER (tunduk RLS); pola InitPlan/set-membership dijaga.
- Period-correct = replay ledger + `penyusutan_semester` per periode (BUKAN
  `status`/`skpd_id`/`nilai_perolehan` terkini).
