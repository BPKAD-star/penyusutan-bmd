# Rancangan: Pekerjaan Konstruksi (KDP) — kartu = paket, kontrak per komponen, setujui per termin

Status: **RANCANGAN, belum dikerjakan** (disusun 2026-10-07, menunggu persetujuan user).
Menggantikan pelonggaran "BAST perencanaan boleh lebih tua dari kontrak" yang dibuat
hari yang sama (commit 4a613f2, sudah di `main`) — begitu rancangan ini jalan, pengecualian
itu dicabut (§4.1). Pop-up penghalang Buka Kunci & nama jenis di `cekBolehBatal` dari commit
itu tetap dipakai.

---

## 0. Ringkasan satu paragraf

Kartu Pekerjaan Konstruksi berubah dari "satu kontrak" menjadi **satu paket pekerjaan**.
Di dalamnya ada **barang KDP** (seperti sekarang), **daftar kontrak** (perencanaan, fisik,
pengawasan, biaya umum — masing-masing bernomor, bertanggal, berpenyedia), dan **termin
pembayaran** yang tiap barisnya menunjuk satu kontrak. Termin **disetujui satu per satu**:
termin pertama sebuah barang menerbitkan barangnya (NIBAR terbit **sekali**), termin
berikutnya cuma menambah nilai barang yang sama. Salah catat dibereskan dengan **Batal
termin itu saja** — kartu tak pernah dibongkar seluruhnya, NIBAR tak pernah berganti.

---

## 1. Yang ditemukan saat menyusun rancangan (fakta, diukur ke produksi 2026-10-07)

| # | Temuan | Akibat bagi rancangan |
|---|---|---|
| F1 | Seluruh produksi baru punya **4 barang KDP**, dan **keempatnya sudah dibuka kunci** (status `draft`, nilai 0). Kartu konstruksi ada 4: 3 diarsipkan, 1 masih draft (RKB SMP Dharma Wanita, Diknas, 6 termin). | Tak ada KDP hidup yang ikut tergeser. Perombakan ini praktis tanpa beban data lama. |
| F2 | `batal_akumulasi_kdp` hari ini ber-payload **`{}`** dan semua pembacanya memperlakukannya sbg **pembatal SELURUH BARANG** (`fetchVoidedAsetIds(['batal_akumulasi_kdp'])`, `NOT EXISTS … batal_akumulasi_kdp` di LRA & IPA). | Batal per termin **tak bisa** memakai bentuk ini — satu termin dibatalkan, seluruh termin lain barang itu ikut lenyap dari laporan. Wajib pindah ke pembatalan **per baris** (`payload.target_trx_id`). |
| F3 | **Laporan BMD & Rekonsiliasi membaca nilai KDP dari `aset.nilai_perolehan` HARI INI**, dan barangnya baru tampil kalau `tgl_perolehan` (= BAST termin **terakhir**) ≤ akhir periode (`fn_rekap_bmd`, `fn_rekon_pos`). | **Cacat yang sudah ada sekarang**: KDP dengan termin S1 + S2 hilang dari Laporan BMD S1, padahal Laporan Pengadaan S1 menampilkan termin S1-nya → Rekonsiliasi S1 tak tie-out. Dengan setujui per termin, cacat ini akan muncul di SETIAP paket. Wajib ditutup (lihat §6). |
| F4 | **Engine tak punya titik mulai untuk barang yang lahir dari termin KDP** (`akumulasi_kdp` tak ada di daftar baseline `hitungJadwalAset`) → `return []`. | **Cacat yang sudah ada sekarang**: KDP yang direklas ke Gedung **tak pernah disusutkan**, tanpa satu pun error. Ditutup sekalian di §6. |
| F5 | Tahun buku hanya dijaga saat INSERT baris (`fn_cek_tahun_buku`); payload kartu boleh diubah kapan saja. | Termin tahun depan **bisa** dimasukkan ke kartu tahun ini (barang KDP yang sama). Kasus "perencanaan 2026, fisik 2027" tak lagi wajib lewat Kapitalisasi — lihat §4.6. |

---

## 2. Bentuk data (semua di `jurnal_header.payload`, jsonb — tanpa kolom/tabel baru)

```
jurnal_header (kategori 'konstruksi')
  no_sk      = Nama / No. Paket pekerjaan (wajib, kolom NOT NULL)
  tanggal    = tanggal kartu dibuat (bukan tanggal kontrak mana pun)
  approval_status = 'pending'   → belum ada termin disetujui
                    'disetujui' → minimal satu termin disetujui (DITURUNKAN, bukan diklik)
                    'ditolak'   → kartu diarsipkan (pola lama)
  payload:
    nama_pekerjaan, program, kegiatan, sub_kegiatan, ppk_paket?, keterangan
    kontrak: [                                   ← BARU, di tingkat kartu
      { id, komponen: 'perencanaan'|'fisik'|'pengawasan'|'biaya_umum',
        no_kontrak, tgl_kontrak, penyedia, ppk, nilai_kontrak?, dokumen_paths[] }
    ]
    barang: [
      { key, kode, nama, spec, foto[], aset_id,   ← seperti sekarang
        pembayaran: [
          { id,                                   ← BARU: id stabil (uuid)
            kontrak_id,                           ← BARU: termin ini dibayar atas kontrak mana
            komponen, no_bast, tgl_bast, kode_rekening, nominal, keterangan, dokumen_paths,
            status: 'menunggu'|'disetujui',       ← BARU
            trx_id,                               ← BARU: id baris akumulasi_kdp kalau disetujui
            dibuat_oleh, disetujui_oleh, disetujui_at }
        ] }
    ]
```

- **Satu kontrak bisa dipakai banyak termin** (fisik termin 1, 2, retensi). **Satu komponen
  boleh punya lebih dari satu kontrak** (mis. addendum, atau dua konsultan) — itu sebabnya
  daftar kontrak, bukan satu kolom per komponen.
- **Kontrak bisa dipakai lintas barang** di kartu yang sama (satu kontrak perencanaan untuk
  dua ruas jalan) — nominal termin tetap per barang.
- `trx_id` adalah jembatan payload ↔ ledger: pembatalan menunjuk baris itu.

### Baris ledger (append-only, tak berubah sifatnya)

| Peristiwa | Baris | Payload |
|---|---|---|
| Termin disetujui | `akumulasi_kdp`, tanggal = BAST, nilai = nominal | `komponen, no_bast, kode_rekening, dokumen_paths` (seperti sekarang) **+ dibekukan: `termin_id, kontrak_id, no_kontrak, tgl_kontrak, penyedia`** |
| Termin dibatalkan | `batal_akumulasi_kdp`, tanggal = **BAST termin itu** (retroaktif, koreksi input), nilai = −nominal | **`target_trx_id`** = id baris termin + `termin_id` |

**Tanpa nilai enum baru.** `batal_akumulasi_kdp` dipakai ulang, tapi aturan bacanya berubah:
- ber-`target_trx_id` → membatalkan **baris itu saja**;
- **tanpa** target (`{}`, hanya baris warisan 4 barang di F1) → membatalkan **seluruh termin
  barang itu yang lebih tua** dari baris pembatal (perilaku lama, dipertahankan untuk data lama).

Satu helper menerapkan aturan ini dan dipakai semua pembaca TS (`terminKdpDibatalkan()` di
lib/kdp.ts); padanan SQL-nya satu fungsi (`fn_kdp_termin_hidup`), dipakai LRA & IPA. Dua
salinan aturan = dua tempat yang menyimpang — keduanya dikunci test pembanding.

---

## 3. Mesin keadaan termin

```
             tambah                 Setujui (RPC)
   (tak ada) ──────▶ MENUNGGU ───────────────────▶ DISETUJUI
                      │  ▲  edit/hapus bebas          │
                      │  └────── Batal (RPC) ─────────┘
                      ▼
                    dihapus (lenyap dari payload; tak ada ledger)
```

- **MENUNGGU**: hanya di payload. Bebas diedit & dihapus. Tak terlihat di laporan mana pun.
- **DISETUJUI**: punya baris ledger. **Terkunci** — nominal, tanggal, rekening, kontrak,
  dokumen tak bisa diubah (ditegakkan trigger DB, bukan cuma tombol).
- **Batal** mengembalikan termin ke MENUNGGU (isinya utuh, `trx_id` dikosongkan) supaya bisa
  diperbaiki lalu disetujui lagi, atau dihapus. Jejaknya tetap di ledger (pasangan baris +
  pembatalnya), terbaca di KIBAR mode Audit.

Keadaan **barang** diturunkan dari terminnya:

| Termin barang | `aset` |
|---|---|
| belum ada yang pernah disetujui | belum ada baris `aset` |
| ≥ 1 disetujui | `status='aktif'`, `nilai_perolehan` = Σ termin disetujui, `tgl_perolehan` = BAST termin disetujui **paling awal** |
| pernah disetujui, kini semuanya batal | `status='draft'`, `nilai_perolehan=0` — **baris aset & NIBAR-nya disimpan**, `aset_id` tetap di payload |
| disetujui lagi sesudah semua batal | barang yang SAMA diaktifkan lagi (`status='aktif'`) — **NIBAR tetap** |

⚠️ `tgl_perolehan` berubah dari "BAST terakhir" (keputusan 2026-07-13) menjadi **"BAST
pertama yang masih berlaku"**. Sebabnya: dengan persetujuan bertahap, "terakhir" terus
bergeser dan membuat barang lenyap dari laporan semester sebelumnya (F3). NIBAR ikut tahun
termin pertama — dan memang terbit saat termin pertama itu disetujui.

---

## 4. Alur langkah demi langkah (urutan yang diminta user)

Contoh paket dipakai sepanjang bagian ini: **"Gedung Serbaguna Kec. X"**, satu barang KDP.

| Langkah | Yang dilakukan operator | Payload | Ledger | `aset` |
|---|---|---|---|---|
| 1. Buat kartu | Nama paket, program/kegiatan/sub kegiatan | kartu baru, `pending` | — | — |
| 2. Barang & spesifikasi | + Barang KDP (kode 1.3.6), isi spesifikasi & foto | `barang[0]` | — | — |
| 3a. Kontrak | + Kontrak perencanaan (CV A, 01/03), fisik (CV B, 01/06), pengawasan (CV C, 01/06) | `kontrak[]` | — | — |
| 3b. Termin | + Termin P1 perencanaan Rp90jt, BAST 15/03, atas kontrak CV A | P1 `menunggu` | — | — |
| 4. Setujui P1 | Admin klik **Setujui** di baris P1 | P1 `disetujui`, `trx_id`=#1; kartu → `disetujui` | `akumulasi_kdp` #1 (15/03, +90jt) | **terbit**: NIBAR N1, aktif, 90jt, tgl 15/03 |
| 5. Termin fisik | + F1 Rp500jt BAST 20/07 (CV B) → Setujui | F1 `disetujui`, #2 | #2 (20/07, +500jt) | sama N1, 590jt |
| 6. Batal setujui | F1 ternyata salah nominal → **Batal** | F1 kembali `menunggu`, `trx_id` kosong | `batal_akumulasi_kdp` #3 (20/07, −500jt, target #2) | N1, 90jt |
| 7. Hapus termin | Hapus F1 (masih menunggu) | F1 lenyap | — | — |
| 8. Isi termin baru | + F1' Rp450jt BAST 20/07 → Setujui | F1' `disetujui`, #4 | #4 (+450jt) | N1, 540jt |
| 9. Hapus lagi | Batal F1' → hapus F1' | F1' lenyap | #5 (−450jt, target #4) | N1, 90jt |
| 10. Batal semua | **Batal Semua Termin** (satu tombol per kartu) | semua termin `menunggu`; kartu → `pending` | #6 (15/03, −90jt, target #1) | N1 **draft**, 0 |
| 11. Hapus semua termin | hapus termin menunggu satu per satu / sekaligus | `pembayaran: []` | — | tetap draft |
| 12. Hapus kartu | 🗑 Hapus | pernah punya ledger → **diarsipkan** (`ditolak`); tak pernah → DELETE | — | tetap draft (jejak audit) |

Hasil akhir langkah 12: **setiap periode bernilai nol**, laporan perolehan kosong, ledger
memuat pasangan-pasangan yang saling meniadakan — persis "tak pernah terjadi".

### 4.1 Aturan isian (ditolak dengan pesan, tombol tak dimatikan diam-diam)

- Termin **wajib** menunjuk kontrak. Pengecualian yang diusulkan: komponen **biaya umum**
  boleh tanpa kontrak (honor/ATK/perizinan umumnya tanpa kontrak) — *keputusan user, §10*.
- **Tgl BAST ≥ tgl kontrak termin itu sendiri.** Aturan "perencanaan boleh lebih tua"
  dicabut: perencanaan kini punya kontraknya sendiri.
- Dokumen BAST wajib per termin (seperti sekarang).
- Setujui termin pertama sebuah barang mensyaratkan: kode, Spesifikasi Nama Barang (tak
  kembar), foto (seperti syarat approve sekarang).

### 4.2 Penjaga saat SETUJUI termin (RPC, satu transaksi)

1. Wewenang: admin pemda / Pengurus Barang atasan (sama dgn sekarang), **dan bukan pembuat
   termin itu** (pemisahan tugas pindah dari tingkat kartu ke tingkat termin).
2. Tahun BAST masih terbuka (sudah dijaga `fn_cek_tahun_buku` saat INSERT).
3. Barangnya **masih KDP** (`aset.kode` golongan 1.3.6) dan `status` aktif/draft — bukan
   sudah direklas, dikapitalisasi, dipecah, atau dihapus. Termin sesudah barang selesai
   direklas jadi Gedung ditolak dgn pesan: *setujui sebelum reklas, atau catat lewat
   Kapitalisasi ke barang Gedungnya.*
4. **Tak menyisip mundur** di depan peristiwa non-KDP (pola `cekBolehSisip`): kalau barang
   sudah punya transaksi selain termin (mis. reklas 10/11), termin ber-BAST lebih tua dari
   itu ditolak. Termin lain sesama KDP **tidak** menghalangi — urutan antar termin tak
   mengubah apa pun karena KDP tak disusutkan.

### 4.3 Penjaga saat BATAL termin (RPC, satu transaksi)

1. Wewenang sama dengan Setujui (admin / Pengurus Barang atasan).
2. Tahun BAST termin itu masih terbuka — pembatalan bertanggal BAST aslinya.
3. Barang **tak punya peristiwa non-KDP sesudah termin itu** (reklas, kapitalisasi,
   pemecahan, koreksi, penghapusan, pengalihan, …) yang masih berlaku → ditolak dgn pop-up
   yang menyebut nama & periode transaksi penghalangnya (sudah dipasang hari ini di
   `cekBolehBatal`). Termin lain & pembatalannya **tak** menghalangi.
4. Kalau termin terakhir yang tersisa ikut batal → barang `draft`, nilai 0.

### 4.4 Yang tak bisa diubah sesudah termin disetujui

| Ingin mengubah | Caranya |
|---|---|
| Nominal / tanggal / rekening / dokumen termin | Batal termin → edit → Setujui lagi |
| Data kontrak yang sudah dipakai termin disetujui | Batal termin-termin yang memakainya dulu (nomor/tanggal kontraknya sudah dibekukan di ledger) |
| Spesifikasi / foto barang yang sudah terbit | menu Koreksi → Spesifikasi (seperti sekarang) |
| Hapus barang KDP dari kartu | hanya kalau tak satu pun terminnya disetujui |
| Hapus kontrak dari kartu | hanya kalau tak satu pun termin (menunggu/disetujui) memakainya |

### 4.5 Reklas KDP → Gedung (BAPP) & sesudahnya

Tak berubah: menu Reklasifikasi. Sesudah reklas, kartu masih bisa dibuka & termin yang sudah
disetujui tetap tampil, tapi termin baru untuk barang itu ditolak (§4.2 butir 3). Retensi
yang cair sesudah BAPP → Kapitalisasi ke barang Gedungnya, atau Batal reklas dulu.

### 4.6 Lintas tahun

Contoh: perencanaan cair 2026, fisik 2027.
- 2026: kartu dibuat, P1 disetujui → barang KDP 90jt. Tutup Tahun 2026 → posisi KDP masuk
  checkpoint (lihat §6).
- 2027: **kartu yang sama** dibuka, kontrak fisik ditambah, termin fisik 2027 disetujui →
  barang yang sama naik nilainya. **Tanpa Kapitalisasi.**
- Yang tak bisa: membatalkan P1 di 2027 (tahun 2026 sudah dikunci) — benar, angka 2026 sudah
  final.
- Kartu tahun lalu yang masih punya kontrak/termin terbuka harus tetap muncul di daftar kartu
  tahun berjalan (penyaring daftar kartu disesuaikan).

Perencanaan **gelondongan** (satu kontrak perencanaan untuk beberapa paket fisik) tetap:
satu kartu perencanaan → Pemecahan → Kapitalisasi ke masing-masing KDP fisik. Rancangan ini
tak mengubahnya.

---

## 5. Penegakan di DB (migrasi)

| Migrasi | Isi |
|---|---|
| **M1** `fn_kdp_setujui_termin(header, barang_key, termin_id, nibar)` | SECURITY DEFINER, satu transaksi: periksa §4.2 → buat/aktifkan `aset` (termin pertama: insert dgn NIBAR yang dikirim klien, dijaga UNIQUE `aset_nibar_key`) → insert `akumulasi_kdp` → perbarui nilai & tgl_perolehan aset → tulis status termin & `trx_id` ke payload → turunkan `approval_status` kartu. |
| **M2** `fn_kdp_batal_termin(header, termin_id)` + `fn_kdp_batal_semua(header)` | Periksa §4.3 → insert `batal_akumulasi_kdp` ber-`target_trx_id` → perbarui aset (draft kalau habis) → termin kembali `menunggu`. |
| **M3** trigger `fn_kdp_termin_guard` di `jurnal_header` (kategori konstruksi) | Menolak lewat UPDATE biasa: (a) status termin menjadi/keluar dari `disetujui`; (b) mengubah isi termin `disetujui`; (c) menghapus termin `disetujui`, barang yang punya termin disetujui, atau kontrak yang dipakai termin. Pengecualian HANYA penanda transaksi `app.kdp_via_rpc` yang dinyalakan M1/M2 — pola persis `app.standar_via_usulan` (20260814_01). |
| **M4** `fn_kdp_termin_hidup` + revisi `fn_lra_belanja_modal`, `fn_ipa_hitung_otomatis`, `fn_ipa_rincian` | Pembatalan per baris (§2). Bedah teks atas definisi HIDUP (pola 20260926_02), dijaga hitungan pola sebelum/sesudah & `SET work_mem` tetap ada. |

Tanpa nilai enum baru, tanpa kolom baru. **Deploy-ordering: M1–M4 SEBELUM kode.** Kalau
terbalik, tombol Setujui per termin gagal (RPC belum ada) — pesannya tampil, tak ada yang
tertulis.

Pengganti yang dicabut: `approveKontrakKonstruksi` & `unapproveKontrakKonstruksi`
(lib/kdp.ts) serta tombol 🔓 Buka Kunci kartu konstruksi. Banner penunjuk NIBAR pengganti
(lib/kibarPengganti.ts) tetap dipertahankan untuk data lama.

---

## 6. Engine penyusutan — KDP ikut punya baris per semester

Perubahan di `hitungJadwalAset` (lib/engine/penyusutan.ts), **khusus barang yang lahir dari
termin KDP**; tanah/ATL/barang lain tak tersentuh:

1. Titik mulai = periode **sebelum termin pertama yang berlaku**; nilai awal 0.
2. Tiap `akumulasi_kdp` yang berlaku → `nilaiPerolehan += nilai`, `nilaiBuku += nilai`.
   Yang dibatalkan (per baris maupun warisan) diabaikan — helper yang sama dgn §2.
3. Selama masih KDP (perlakuan 'tidak'): baris per semester **tetap ditulis** dgn beban 0 &
   akumulasi 0 (sekarang: tak ditulis sama sekali).
4. `reklas_golongan` ke Gedung → fresh start dari nilai buku saat itu (aturan yang sudah ada)
   → **mulai disusutkan**. Ini menutup F4.
5. Tutup Tahun otomatis membuat checkpoint KDP (karena barisnya kini ada) → tahun berikutnya
   melanjutkan dari situ.

Akibatnya `fn_rekap_bmd` & `fn_rekon_pos` — yang sudah memakai `penyusutan_semester` bila
barisnya ada — **otomatis membaca nilai KDP per periode**. Tak ada perubahan di kedua fungsi
itu. Ini menutup F3.

⚠️ Konsekuensi yang perlu diputuskan: KDP akan muncul di menu Penyusutan (beban 0) kalau
filter jenis aset 1.3.6 dipilih — §10.

⚠️ Seperti biasa, **engine wajib dijalankan ulang** sesudah termin disetujui/dibatalkan
supaya Laporan BMD & Rekonsiliasi memakai angka terbaru. Sebelum dijalankan, laporan jatuh
ke nilai register (perilaku sekarang).

---

## 7. Dampak ke tiap keluaran

Contoh angka = paket §4 berhenti di langkah 8 (P1 90jt S1, F1 dibatalkan, F1' 450jt S2),
ditambah W1 pengawasan 30jt BAST 25/08.

| Keluaran | Sumber | Perubahan | Angka contoh |
|---|---|---|---|
| **Laporan Pengadaan → Daftar Transaksi** | `lib/laporanKdpTrx.ts` | pembatalan per baris; No/Tgl Kontrak & Penyedia diambil dari **payload baris** (kontrak termin), cadangan header untuk data lama | S1: P1 90jt (CV A). S2: F1' 450jt (CV B), W1 30jt (CV C). F1 tak tampil |
| **Laporan Pengadaan → Rekap per SKPD** | turunan baris yang sama | ikut | S2: 480jt |
| **Laporan Pengadaan → Format Permendagri** | `lib/laporanPengadaan.ts` | idem Daftar Transaksi | idem |
| **Laporan BMD Model 1/2** | `fn_rekap_bmd` + baris engine | tak diubah — benar lewat §6 | KDP S1 = 90jt; S2 = 570jt |
| **Laporan BMD Model 3** (mutasi) | `app/dashboard/pelaporan/bmd/page.tsx` | pembatalan per baris | S2 Penambahan 480jt |
| **Daftar Barang** | `fn_daftar_barang` (register) | tak diubah | tampil sejak S1 (tgl perolehan 15/03), nilai register 570jt — sama sifatnya dgn barang lain |
| **Rekonsiliasi BMD** | mutasi `lib/rekon.ts` + posisi `fn_rekon_pos` | mutasi: pembatalan per baris; posisi: benar lewat §6 | S2: saldo awal 90 + pengadaan 480 = saldo akhir 570, selisih 0 |
| **BA Rekon (Format V.2)** | angka Rekonsiliasi | ikut | idem |
| **LRA → Entryan Aplikasi** | `fn_lra_belanja_modal` | M4 | Juli 450jt, Agustus 30jt, Maret 90jt |
| **IPA → Realisasi** | `fn_ipa_hitung_otomatis`, `fn_ipa_rincian` | M4 | Σ termin berlaku |
| **KIBAR** | lib/kibarAktif.ts | pembatal ber-target sudah terbaca; tambah aturan warisan `{}` | mode Laporan: P1, F1', W1; mode Audit: + F1 dicoret |
| **Dashboard** | aset aktif per cara perolehan | tak diubah | 570jt di Pengadaan |
| **Penyusutan** | `penyusutan_semester` | KDP kini punya baris (beban 0) | §10 |

Setiap baris tabel ini jadi butir uji (§9).

---

## 8. Kartu lama

- 3 kartu arsip (`ditolak`) & 4 barang draft: **tak disentuh**. Barisnya tetap terbaca lewat
  aturan pembatalan warisan (`{}` = seluruh barang).
- 1 kartu draft (RKB SMP Dharma Wanita): dibaca otomatis — `no_sk`/`tanggal`/`penyedia` kartu
  dijadikan satu kontrak **fisik**, keenam terminnya `menunggu` & menunjuk kontrak itu.
  Kalau di antaranya ada termin perencanaan/pengawasan, operator tinggal menambah kontraknya
  & memindahkan rujukan termin sebelum menyetujui. Tak ada skrip data.

---

## 9. Rencana uji (wajib hijau sebelum push)

1. **Unit (lib):** mesin keadaan termin; `terminKdpDibatalkan` (per baris, warisan `{}`,
   siklus setujui→batal→setujui); aturan isian §4.1; penurunan status kartu & barang.
2. **Engine:** KDP termin S1+S2 → baris S1 90, S2 570; batal F1 tak dihitung; reklas ke
   Gedung → beban mulai periode reklas; checkpoint tahun berikutnya.
3. **Golden Rekonsiliasi:** fixture paket §4 → tie-out S1 & S2 selisih 0; varian "batal
   semua" → semua nol.
4. **Pembanding SQL↔TS:** `fn_kdp_termin_hidup` vs `terminKdpDibatalkan` atas fixture sama.
5. **Produksi, transaksi + ROLLBACK, RLS aktif** (uid pengurus Dinas Pendidikan): jalankan
   langkah 1–12 §4 lewat RPC, periksa tiap keluaran §7 di tiap langkah.
6. **Manual di layar** sesudah deploy: alur §4 lengkap, termasuk pop-up penolakan (§4.2–4.3).

---

## 10. Keputusan yang dibutuhkan dari user

1. **Biaya umum boleh tanpa kontrak?** Usul: ya (opsional); tiga komponen lain wajib.
2. **Siapa menyetujui termin?** Usul: sama dgn sekarang — admin pemda & Pengurus Barang
   atasan, bukan pembuat terminnya.
3. **KDP tampil di menu Penyusutan** (beban 0)? Usul: disembunyikan dari layar Penyusutan,
   tetap ada di tabelnya (dibutuhkan Laporan BMD & Rekonsiliasi).
4. **Lintas tahun pakai kartu yang sama** (§4.6)? Usul: ya — Kapitalisasi hanya untuk
   perencanaan gelondongan & termin sesudah reklas.
5. **`tgl_perolehan` KDP = BAST termin pertama** (membalik keputusan 2026-07-13 "BAST
   terakhir")? Usul: ya — tanpa itu barang lenyap dari laporan semester awal (F3).
6. **Tombol Buka Kunci kartu dicabut**, diganti Batal per termin & "Batal Semua Termin"?
   Usul: ya.

## 11. Urutan pengerjaan yang diusulkan

1. Lib murni + test (bentuk payload, mesin keadaan, aturan pembatalan).
2. Engine §6 + golden test.
3. Migrasi M1–M4, diuji ke produksi dalam transaksi + ROLLBACK.
4. Layar kartu (kontrak, termin berstatus, tombol per termin).
5. Pembaca laporan §7.
6. Uji alur penuh §9, lalu CLAUDE.md + materi paparan Pengadaan (slide KDP) diperbarui.
