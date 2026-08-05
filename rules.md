# Rules — Aturan yang Tidak Boleh Dilanggar

> Aturan operasional untuk siapa pun (manusia maupun agent AI) yang menyentuh
> repo ini. Rinciannya per fitur ada di **[CLAUDE.md](CLAUDE.md)**; berkas ini
> adalah ringkasan yang wajib dibaca lebih dulu.
>
> **Peta seluruh dokumen: [README.md](README.md).**

**Konteks:** ini data **LIVE pemerintah daerah** yang dilaporkan ke
inspektorat/BPK. Setiap aturan di bawah lahir dari kerusakan nyata, bukan
kehati-hatian teoretis.

### Cara merujuk & menambah aturan

Nomor aturan dipakai sebagai **alamat** di seluruh dokumen lain dan di komentar
kode, jadi ia harus stabil:

- Format rujukan **selalu `§seksi.item`** — mis. `rules.md §1.7`, `§4.2`.
  Jangan pernah merujuk dengan nomor global (`§25`) — nomor global tidak ada
  lagi.
- **Penomoran ulang HARAM.** Aturan baru **ditambahkan di akhir seksinya**,
  ambil nomor berikutnya. Nomor aturan yang sudah dicabut ditandai
  *(dicabut, lihat …)* dan nomornya **tidak** dipakai ulang.
- Alasannya: dulu penomorannya global-berurutan, lalu §1 tumbuh dari 5 jadi 9
  item tanpa ada yang menggeser seksi di bawahnya → **ada dua item bernomor
  6–9**, dan rujukan `§6` jadi menunjuk dua aturan yang berbeda. Dirapikan
  2026-08-05.

---

## 1. Integritas Ledger

1. **`transaksi_bmd` append-only MUTLAK.** Tidak pernah UPDATE/DELETE (dijaga
   trigger `fn_transaksi_bmd_immutable`, berlaku juga untuk service_role).
   Koreksi = **transaksi baru yang membalik** (`batal_*`).
   Pernah dilonggarkan sekali (escape hatch DELETE) dan terbukti berbahaya:
   visibilitas barang diturunkan dari replay ledger, jadi menghapus baris
   `batal_pengadaan` membuat barang yang sudah dihapus **muncul lagi** di
   Daftar Barang & Penyusutan. Sudah direvert. **Jangan bikin escape hatch
   DELETE lagi, apa pun alasannya** — kalau butuh "buang kontrak", arsipkan
   (`jurnal_header.approval_status='ditolak'`).
2. **Soft-delete.** Penghapusan barang = `aset.status='dihapus'` + transaksi.
   Tidak ada policy DELETE di `aset`.
3. **Pembatalan hanya untuk event TERBARU aset itu.** Semua menu batal wajib
   memasang guard: jika ada transaksi dengan `id > trx_id_yang_dibatalkan`
   pada aset yang sama → blokir. Membatalkan event di tengah rantai merusak
   replay engine. Pengecualian sengaja: Batal Pemanfaatan & Pengamanan (event
   netral) — tapi keduanya tetap **menghitung** sebagai "transaksi lebih baru"
   yang memblokir batal di bawahnya.
4. **`penyusutan_semester` = turunan**, bukan sumber kebenaran. Boleh dihitung
   ulang kapan saja dari ledger.
5. **Baseline `aset_awal_2026` beku.** Angkanya tidak pernah berubah; hanya
   kolom spesifikasi yang boleh dikoreksi, itu pun hanya untuk barang yang
   belum pernah bergerak (dikunci trigger DB dua lapis, bukan cuma UI).
6. **"Berakhir" ≠ "Tidak pernah terjadi".** Setiap modul yang bisa dihentikan
   wajib membedakan dua aksi, dan **jangan pakai yang satu untuk maksud yang
   lain**:
   - **Selesai / Akhiri / Kembalikan** — peristiwanya SAH lalu berakhir.
     Barisnya tetap dibaca laporan, barangnya tetap tampil sebagai riwayat
     (badge "Selesai" / "Dikembalikan").
   - **Batal (`batal_*`)** — KOREKSI salah catat. Peristiwanya dianggap **tak
     pernah terjadi**: barisnya diabaikan seluruh pembaca dan barangnya keluar
     total dari kartu; kartu yang jadi kosong ikut hilang.

   Terpasang di Pemanfaatan (⏹ Akhiri vs 🗑 Batal), Pengamanan (⤺ Kembalikan
   vs 🗑 Batal), dan Pengalihan (Kembalikan vs 🗑 Batal). Tanpa pembedaan ini,
   salah pencet meninggalkan jejak permanen seolah barangnya benar-benar pernah
   pindah/dimanfaatkan — dan itu ikut menggeser turunan lain (mis. segmen tahun
   kode register).
7. **DAFTAR PERIKSA menambah jenis `batal_*` baru.** Menambah nilai enum + RPC
   itu bagian yang mudah; yang berkali-kali kelewat adalah PEMBACA-nya.
   `batal_pengalihan` (2026-07-29) kelewat **tiga ronde**, semuanya baru ketemu
   setelah dianggap selesai. Sisir tujuh tempat ini:
   1. **Engine** (`lib/engine/penyusutan.ts`) — kalau jenisnya memengaruhi nilai.
   2. **Kolektor period-aware** (`lib/pengalihan.ts`, `lib/rekon.ts`) — buang
      baris yang dianulir DI KOLEKTOR, supaya semua pemanggil bersih otomatis.
   3. **Keanggotaan kartu** di komponen pengelolaan — **kedua sisi** (pengirim
      dan penerima). Ini yang paling sering lolos: ledger sudah benar tapi
      barangnya masih nongol di kartu.
   4. **Modul pelaporan** — daftarkan di `BATAL_TARGET_JENIS` (lib/voidedAset.ts)
      lalu teruskan sebagai prop `batalJenis`/filter. Laporan yang tak menyaring
      menampilkan angka yang **beda** dengan Daftar Barang & Rekonsiliasi.
   5. **KIBAR** — kartu yang DICETAK; jangan memuat peristiwa yang dianulir.
   6. **Partial index** yang predikatnya kembar dengan daftar jenis di kode
      (mis. `idx_trx_pindah_id` vs `JENIS_DITARIK`) — ubah dua-duanya sekaligus.
   7. **`fn_aset_awal_2026_terkunci` + `_batch`** kalau jenisnya menyentuh
      `skpd_id`, kolom spesifikasi, atau golongan.

   ⚠️ Perhatikan juga **bentuk payload**: `fetchBatalTargets` membaca
   `payload.target_trx_id` (tunggal) DAN `target_trx_ids` (jamak). Kalau jenis
   baru memakai bentuk lain, filternya **tidak menyaring apa pun tanpa satu pun
   error** — kegagalan senyap yang paling mahal di repo ini.
8. **Nomor yang DITERBITKAN jangan pernah dihitung ulang saat tampil.** NIBAR &
   kode register dialokasikan sekali lalu dibekukan. Menghitungnya dari urutan
   baris membuat satu barang hilang menggeser nomor semua barang di bawahnya —
   padahal nomor itu tercetak di label barang, KIR, dan BAST, jadi kertas dan
   layar jadi tak cocok tanpa ada yang sadar. Alokasi lewat **tabel counter**
   (`kode_register_seq`, `UPDATE … RETURNING`), bukan `LIKE 'prefix%'` yang
   pernah membuat generator NIBAR timeout lalu mengulang nomor dari 1.
9. **PERISTIWA BERLAKU SEJAK PERIODENYA, TIDAK SURUT** (keputusan user
   2026-08-05). Koreksi apa pun — pemecahan, reklasifikasi, kapitalisasi,
   penghapusan, pengalihan — mengubah keadaan barang **mulai periode
   peristiwanya**, bukan sejak awal waktu. Barang yang dipecah di 2026-S2 wajib
   masih **utuh** kalau laporan 2026-S1 dibuka: induknya ada, pecahannya belum.
   Berlaku di semua halaman period-aware (Daftar Barang, Penyusutan,
   Rekonsiliasi BMD).

   **Jangan menilai "sudah ada atau belum" dari `tgl_perolehan` saja.** Pecahan
   hasil Pemecahan Barang sengaja MEWARISI `tgl_perolehan` induknya — itu benar
   untuk penyusutan (pecahan meneruskan sisa umur induk, bukan memulai umur
   baru), tapi membuat tanggalnya berbohong soal kapan barang itu ada. Yang
   otoritatif adalah **periode event kelahirannya** (daftar `LAHIR` di
   `lib/visibilitas.ts`). Insiden 2026-08-05: pemecahan 27 Juli 2026 → saat
   2026-S1 dibuka, induk yang masih utuh DAN ketujuh pecahannya tampil
   bersamaan, jadi nilainya kehitung **dobel** di Daftar Barang maupun
   Rekonsiliasi BMD — tanpa satu pun pesan error.

   **Bikin pintu baru yang MEMBUAT aset dengan `tgl_perolehan` warisan/mundur
   (bukan tanggal peristiwanya) → WAJIB daftarkan jenis ledgernya di `LAHIR`.**
   Logikanya SATU tempat (`lib/visibilitas.ts`, dipakai bertiga) & dikunci
   `lib/visibilitas.test.ts` — jangan disalin lagi ke halaman.

   ⚠️ **Yang sengaja TIDAK ikut aturan ini**, jangan "dirapikan" tanpa
   keputusan: `batal_pengadaan`, `batal_hibah_masuk` dkk, dan
   `koreksi_pencatatan_ganda` memang dicatat MUNDUR ke tanggal aslinya supaya
   barangnya hilang dari SEMUA periode — di situ maksudnya "tak pernah ada",
   bukan "berhenti sejak sekarang". Terpisah dari itu, kolom Nilai Perolehan di
   **Daftar Barang** membaca `aset.nilai_perolehan` TERKINI, jadi kapitalisasi/
   koreksi nilai di S2 ikut terlihat saat membuka S1 (Penyusutan & Rekonsiliasi
   tidak — keduanya memakai angka engine per periode). Belum diputuskan.

## 2. Fail-Closed (angka salah > halaman error)

1. **Kolektor data WAJIB cek `error` lalu MELEMPAR.** `const { data } = await
   supabase...` tanpa `error` adalah bom waktu: query gagal → `data` null →
   fungsi mengembalikan set/array kosong → artinya **kebalikan** dari
   kenyataan (mis. "tidak ada yang dibatalkan"), dan tidak ada satu pun pesan.
   Ini pernah membuat Rekonsiliasi, Laporan BMD, dan Laporan Pengadaan salah
   angka serentak tanpa suara.
2. **Pemanggil kolektor WAJIB `try/catch/finally`.** Seluruh badan fungsi
   loader di dalam `try`; `setLoading(false)` di **`finally`**, bukan di akhir
   jalur sukses; state error **ditampilkan**. Tanpa ini, satu query gagal =
   halaman beku "Memuat..." selamanya tanpa keterangan (kejadian nyata di
   Daftar Barang, 2026-07-29).
3. **Tombol Export ikut dibungkus.** Excel setengah jadi yang terlanjur
   terunduh tidak punya tanda apa pun bahwa isinya kurang.
4. **Modul pelaporan menolak menampilkan angka saat ada kegagalan.** Halaman
   error jauh lebih murah daripada angka kurang-sebagian yang terlihat sah
   lalu ikut dilaporkan ke inspektorat/BPK.

## 3. Kolektor Halaman-demi-Halaman

1. **Paginasi WAJIB keyset** (`.gt('id', terakhir)` + `.order('id')`), bukan
    `.range()`/OFFSET. OFFSET makin dalam makin lambat dan cepat atau lambat
    satu halaman tembus statement timeout; keyset biayanya rata.
2. **Selalu ada `ORDER BY`.** Tanpa itu Postgres tidak menjamin urutan
    antar-halaman → begitu hasil > 1.000 baris ada yang terlewat DIAM-DIAM.
    **Jangan pernah menjawab timeout dengan mencabut `ORDER BY`.**
3. **Menambah `.order()` → pastikan ada index yang memuat kolom urutnya.**
4. **Scope-kan ke `aset_id` bila pemanggil tahu asetnya.** Jangan menyapu
    seluruh ledger hanya untuk menanyakan status belasan aset — biayanya
    tumbuh mengikuti ledger, dan index cuma menggeser ambang timeout-nya.

## 4. Performa di Bawah RLS

1. **Semua fungsi di policy RLS dibungkus InitPlan**: `(SELECT fn_is_admin())`,
    `(SELECT fn_is_viewer())` — supaya dievaluasi sekali, bukan per baris.
    Jangan pernah mengembalikannya jadi fungsi telanjang.
2. **Operator non-leakproof TIDAK PERNAH bisa jadi index-cond di bawah RLS** —
    berlaku untuk `LIKE` (`~~`) **dan** `=` pada kolom ENUM. Postgres selalu
    mengevaluasinya setelah qual sekuriti, berapa pun index yang ada.
    Obatnya **partial index** yang predikatnya **sama persis** dengan qual di
    kode. Beda sedikit → planner tak bisa membuktikan implikasi dan index
    diabaikan **diam-diam** (tak ada error, cuma lambat lagi).
3. **Verifikasi EXPLAIN WAJIB dengan RLS aktif** (`SET LOCAL role
    authenticated` + `request.jwt.claims`). Sebagai service_role/superuser,
    query yang rusak tetap terlihat 0,2 detik — verifikasi tanpa RLS pernah
    meloloskan perbaikan yang sebenarnya belum menyelesaikan apa pun.
4. **Setiap migrasi import massal wajib diakhiri `ANALYZE`** tabel yang diisi.
    Import besar mengubah distribusi data; rencana query yang tadinya sehat
    bisa berbalik jadi full scan tanpa satu baris kode pun berubah.
5. **Sesudah import besar, uji ulang halaman berat sebagai pengurus barang
    SKPD TERBESAR**, bukan cuma sebagai admin. Import massal bisa
    membangunkan lagi timeout yang sudah "beres".
6. **Jangan menarik semua baris golongan ke browser.** Paginasi/agregasi di
    server via RPC (pola `fn_daftar_barang`, `fn_rekap_bmd`).
7. **Sebelum membuat halaman yang membaca tabel besar LANGSUNG, cek policy-nya
    sudah InitPlan atau belum** — tabel yang selama ini hanya dibaca lewat RPC
    SECURITY DEFINER bisa menyimpan bom waktu RLS.

## 5. Skema & Migrasi

1. **Baca dari tabel utama, bukan view.** Semua `v_*` sudah dihapus; jangan
    membuat/mengandalkan view baru tanpa alasan kuat.
2. **Jangan pisah `aset`/`transaksi_bmd` per jenis aset maupun per tahun.**
    Jenis adalah atribut aset yang bisa berubah (reklas), bukan atribut
    transaksi. Kalau skala jadi masalah → PARTISI by `periode`, bukan by jenis.
3. **Migrasi PLAIN, bukan `CONCURRENTLY`** — Supabase SQL Editor membungkus
    skrip jadi satu transaksi, `CREATE INDEX CONCURRENTLY` gagal senyap.
4. **Deploy-ordering**: migrasi (enum `ADD VALUE`, policy, guard, tabel baru)
    dijalankan **SEBELUM** deploy kode. Kode yang sudah memfilter nilai enum
    baru akan error kalau enumnya belum ada; guard yang belum ada membuka
    jendela wewenang. Urutan per fitur ada di CLAUDE.md.
5. **Konstanta kembar wajib diubah berpasangan** — mis. `JENIS_PINDAH`
    (lib/pengalihan.ts) ↔ predikat `idx_trx_pindah_id`; `KOREKSI_SPEK_COLS`;
    daftar kunci di `fn_aset_awal_2026_terkunci` ↔ `_terkunci_batch`;
    `COLS` Daftar Barang ↔ `BASE_COLS` Daftar Barang Awal.

## 6. Wewenang & Lintas-SKPD

1. **Penegakan di DB, bukan di UI.** UI hanya cerminan supaya tombolnya tidak
    muncul; RLS/trigger/RPC yang menolak.
2. **Operasi lintas-SKPD lewat RPC SECURITY DEFINER**, jangan melonggarkan
    policy `aset`/`transaksi_bmd` sebagai gantinya.
3. **Pembuat kartu tidak boleh menyetujui kartunya sendiri** (Cara Perolehan).
    Admin pemda dikecualikan.
4. **Tanggal masa depan selalu ditolak.** Tahun terkunci menolak transaksi
    bertanggal di dalamnya kecuali whitelist retroaktif yang eksplisit
    (`batal_pengadaan`, `batal_penghapusan`, `batal_kapitalisasi`). Tahun yang
    belum terdaftar = **terkunci** (fail-closed).

## 7. Alur Kerja Pengembangan

1. **Type-check WAJIB bersih**: `npx tsc --noEmit -p tsconfig.json` → **0
    error** (sejak 2026-08-05, dijaga CI). Exit code-nya boleh dibaca apa
    adanya; aturan lama "saring ke berkas yang disentuh" sudah **dicabut**.
    Error apa pun yang muncul berarti dari perubahanmu — jangan dibiarkan
    menumpuk lagi. Sekali satu lolos, penyaringan manual itu kembali, dan
    bersamanya kembali pula kebiasaan mengabaikan output.
2. **`git add` sebut berkas satu per satu**, jangan `.` atau `-A` — repo ini
    selalu punya untracked yang bukan bagian pekerjaan (file `.xlsx` besar,
    migrasi orang lain, `docs/`).
3. **Pesan commit rinci**: judul `tipe(skop): ringkas`, lalu bullet WHY dan
    keputusan desainnya — bukan satu baris. Push langsung ke `main`.
4. **Kalau ada migrasi baru: ingatkan menjalankan migrasinya dulu** sebelum
    push, sesuai deploy-ordering.
5. **Selesai ngoding = langsung sediakan perintah commit + push** (satu blok
    `bash` siap klik) tanpa diminta. Menjalankannya tetap keputusan user.
