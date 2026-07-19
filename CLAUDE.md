# Penyusutan BMD — panduan untuk Claude

Aplikasi penyusutan Barang Milik Daerah (BMD) pemda. Next.js 14 App Router +
React 18 + TypeScript + Tailwind + Supabase. Scope: LIVE data pemerintah daerah,
jadi **integritas data di atas segalanya** — hati-hati dengan perubahan skema &
apa pun yang menyentuh ledger atau engine.

## Aturan lintas-fitur (2026-07-19, JANGAN dilanggar)

- **PERFORMA Daftar Barang & Penyusutan — JANGAN diturunkan.** Setelah import
  massal (Peralatan & Mesin 218rb, dst → total aset ~227rb), dua halaman ini
  sempat 504/timeout/freeze. Yang MENYELAMATKAN & bikin stabil (bukan sekadar
  cepat): **(1) semua fn di RLS dibungkus InitPlan** — `(SELECT fn_is_admin())`,
  `(SELECT fn_is_viewer())` — supaya dievaluasi SEKALI bukan per-baris (policy
  `aset_select`, `trx_select`, `*_viewer_select`; migrasi 20260717_02,
  20260718_05/06); **(2) index `idx_aset_kode_pattern` (text_pattern_ops)** utk
  `kode LIKE 'gol.%'` (migrasi 20260718_06, PLAIN bukan CONCURRENTLY — Supabase
  SQL Editor bungkus transaksi jadi CONCURRENTLY gagal senyap). Saat bikin fitur
  baru: **JANGAN** ubah/copot policy RLS jadi fn telanjang lagi, JANGAN drop
  index kode, JANGAN bikin query yang narik semua baris golongan ke browser
  (paginasi/agregasi di server via RPC — pola `fn_daftar_barang`,
  `fn_rekap_bmd`, `fn_dashboard_rekap`). Kalau perlu tambah policy/fn di path
  panas, bungkus InitPlan.

- **BATAL/reversal transaksi: BLOKIR kalau aset punya transaksi LEBIH BARU
  setelah transaksi yang mau dibatalkan.** Berlaku SEMUA jenis pembatalan
  (batal_reklas, batal_penghapusan, batal_kapitalisasi, dst). Alasan: rantai
  event per-aset direplay kronologis di engine — membatalkan event di TENGAH
  rantai (mis. reklas lalu ada kapitalisasi di atasnya) merusak state. Batal
  hanya sah untuk event TERBARU aset itu. Pola batal = SELALU transaksi baru
  (`batal_*`, append-only) + engine mengabaikan event yang dibatalkan lewat
  `payload.target_trx_id` (pola `kapDibatalkan` di lib/engine/penyusutan.ts) —
  BUKAN hapus baris & BUKAN reklas-balik (reklas-balik salah utk lintas-golongan
  krn fresh-start dobel).

## Prinsip inti (jangan dilanggar)

- **Ledger append-only, TANPA PENGECUALIAN.** `transaksi_bmd` tidak pernah
  di-UPDATE/DELETE (dijaga trigger `fn_transaksi_bmd_immutable`) — ini prinsip
  MUTLAK, sudah pernah dicoba dilonggarkan (migrasi 17/18: escape hatch DELETE
  sempit utk "Hapus Kontrak Sepenuhnya") dan **terbukti berbahaya**: Daftar
  Barang & Penyusutan menyembunyikan barang BUKAN dengan cek `aset.status`
  langsung, tapi dgn **replay event ledger** (`SEMBUNYI` termasuk
  `batal_pengadaan`, lihat poin di bawah). Begitu baris `batal_pengadaan`
  (bukti "barang ini harus disembunyikan") ikut terhapus, replay-nya kehilangan
  jejak — barang yg sudah `status='dihapus'` MUNCUL LAGI di kedua laporan itu.
  Direvert migrasi `20260704_19_revert_hapus_ledger.sql` (+ perbaikan data yg
  sudah kena dampak: insert ulang `batal_pengadaan` utk aset yatim tanpa jejak
  ledger sama sekali). Koreksi = SELALU transaksi baru yang membalik (mis.
  `batal_penghapusan`, `batal_kapitalisasi`), tidak pernah hapus baris lama.
  **Kalau butuh "buang kontrak" tanpa nyentuh ledger**: arsipkan
  (`jurnal_header.approval_status='ditolak'`) — sudah otomatis disaring dari
  tampilan Pengadaan & dikecualikan dari cek No SK/BAST dipakai (lihat pola
  APPROVAL di bawah, fungsi `hapusKontrak` di Pengadaan.tsx). JANGAN bikin
  escape hatch DELETE lagi ke `transaksi_bmd` apapun alasannya.
- **Soft-delete.** Penghapusan barang = `aset.status='dihapus'` + transaksi, bukan
  DELETE. Tidak ada policy DELETE di `aset`.
- **Masa manfaat disimpan dalam TAHUN** di DB; konversi ×2 (ke semester) HANYA di
  engine (`lib/engine/penyusutan.ts`).
- **Periode semesteran**: `YYYY-S1` (Jan–Jun) / `YYYY-S2` (Jul–Des). Helper:
  `periodeDariTanggal` (lib/bmd.ts) & `fn_periode_dari_tanggal` (SQL).
- **penyusutan_semester = hasil engine** (turunan), bukan mirror `aset`. Engine
  event-driven replay ledger per aset.
- **Ekstrakomptabel IKUT disusutkan** (keputusan user 2026-07-13; dulu engine
  bail-out `if (ekstra) return []` — sudah dihapus). Aturan hitung sama persis
  dgn intra; pemisahan "neraca cuma intra" ada di LAPORAN (filter Komptabel,
  default 'intra' di Penyusutan & Laporan BMD). Konsekuensi: `reklas_komptabel`
  kini nol efek perhitungan — murni pindah keranjang laporan. Golongan 1.5.4
  Aset Lain-Lain BEKU (tak pernah akrual, dari mana pun asalnya — guard
  `perlakuan !== 'lain_lain'` di akrual); reklas keluar dari 1.5.4
  menghidupkan lagi. Setelah deploy perubahan ini, engine WAJIB di-run ulang
  utk periode 2026 supaya baris ekstra terisi.
- **Baseline beku**: `aset_awal_2026` (di-rename dari `saldo_awal_2026`,
  migrasi `20260710_03`) = foto saldo akhir 2025, display-only, tak pernah
  disentuh transaksi.
- **Baca dari tabel utama, bukan view.** Semua `v_*` (v_daftar_barang, v_dbar_*,
  v_trx_*, v_anomali_saldo_awal, dst.) SUDAH DIHAPUS. Menu register/daftar baca
  `aset` + `transaksi_bmd` (+ `skpd`, `jurnal_header`) langsung. Kunci: `aset.id`
  = `transaksi_bmd.aset_id`, dipakai untuk **visibilitas period-aware** (replay
  event `SEMBUNYI`=[kapitalisasi_serap, penghapusan_*, batal_pengadaan] vs
  `MUNCUL`=[batal_penghapusan, batal_kapitalisasi], filter
  `comparePeriode(e.periode, periode) <= 0`, diurutkan by **id ledger** — BUKAN
  dikelompokkan sembunyi-dulu-baru-muncul — supaya siklus hapus→batal→hapus lagi
  dalam periode yang sama tetap ikut aksi TERAKHIR). Jangan buat/andalkan view lagi
  tanpa alasan kuat — dulu Daftar Barang pakai `v_daftar_barang` yang `id`-nya BUKAN
  aset.id → filter sembunyi tak nyambung (barang dihapus tetap kehitung). Turunan
  yang dulu dari view direplikasi: golongan dari `kode` (`like 'x.%'`), nama SKPD
  dari `skpd`, jejak penghapusan dari ledger+`jurnal_header`.

## Tahun Buku (kunci tahun akuntansi, migrasi 23)

Tabel kontrol `tahun_buku` (tahun, status terbuka/terkunci) + log append-only
`tahun_buku_log`. **Model data TETAP satu ledger kontinu** — `transaksi_bmd`/
`aset` TIDAK dipecah per tahun, tidak ada `saldo_awal_2027` dst sebagai tabel
baru. Ini murni tabel kontrol yang dibaca trigger, sama pola dengan
`fn_jurnal_header_guard` (kunci semester) — cuma naik level ke tahun.

- **Dua guard mutlak** (`fn_cek_tahun_buku`, trigger BEFORE INSERT di
  `transaksi_bmd` DAN `jurnal_header`): (1) tanggal **tidak boleh** di masa
  depan (`> current_date`), TANPA KECUALI APA PUN; (2) tanggal **tidak boleh**
  jatuh di tahun `terkunci` — KECUALI whitelist jenis retroaktif di bawah.
- **Tahun yang belum terdaftar di `tahun_buku` = default TERKUNCI** (fail-closed,
  bukan fail-open) — lebih aman. Makanya migrasi 23 WAJIB langsung seed baris
  tahun berjalan saat itu (2025=terkunci baseline, 2026=terbuka), supaya kerja
  normal tidak mendadak terblokir begitu migrasi di-deploy. **Tahun baru HARUS
  di-seed manual (INSERT status terbuka) sebelum tanggal masuk ke tahun itu** —
  ini nanti jadi bagian dari aksi "Tutup Tahun" (belum dibangun, lihat di bawah).
- **Whitelist retroaktif** (di `fn_cek_tahun_buku`, cuma utk `transaksi_bmd`):
  `batal_pengadaan`, `batal_penghapusan`, `batal_kapitalisasi` — tiga ini SUDAH
  sengaja dicatat mundur ke tanggal kejadian asli (lihat `lib/transaksi.ts`,
  `Kapitalisasi.tsx`, `Penghapusan.tsx`) supaya replay engine period-correct.
  **Daftar ini BELUM tentu final** — kalau nambah jenis baru yang perlu backdate
  ke tahun terkunci, tambahkan di sini, jangan bikin bypass umum.
  `pengalihan_status` **TIDAK** masuk whitelist ini — lihat poin
  `fn_terima_pengalihan` di bawah, itu ditutup dengan cara lain.
- **`fn_terima_pengalihan` pakai tanggal HARI INI, bukan tanggal dokumen**
  (migrasi 24, keputusan user 2026-07-07): pengalihan dianggap resmi terjadi
  pada tanggal SKPD tujuan klik Terima — persis pola `fn_kembalikan_pengalihan_
  barang` (migrasi 22), BUKAN pola Pengadaan (yg pakai tanggal BAST/dokumen
  walau di-approve belakangan). Ini SENGAJA beda dari pola Pengadaan supaya gap
  tahun-terkunci tertutup total (hari ini selalu di tahun terbuka, tak pernah
  butuh whitelist). Konsekuensi yg diterima: kalau approval telat berbulan-
  bulan, atribusi SKPD di `lib/pengalihan.ts` baru pindah pas tanggal Terima,
  bukan tanggal dokumen sumber. Tanggal dokumen asli tetap disimpan di
  `payload.tgl_dokumen_sumber` utk jejak audit.
- **Opsi B (checkpoint) — SUDAH DIBANGUN (migrasi 25).** Jenis ledger baru
  `saldo_awal_checkpoint` (BEDA dari `saldo_awal` yg khusus baseline impor
  e-BMD 2025 asli — bukan tabel `saldo_awal_20XX` baru, itu anti-pattern sama
  seperti tabel per-semester yg sudah ditolak). Payload REUSE persis struktur
  `saldo_awal` lama (`nilai_buku_awal`, `akumulasi_2025`, `sisa_masa_manfaat_smt`,
  `masa_manfaat_smt`, `beban_per_smt`) — disalin LANGSUNG dari
  `penyusutan_semester` periode S2 tahun yg ditutup (sudah final, tidak
  dihitung ulang).
  - `hitungJadwalAset` (lib/engine/penyusutan.ts) sekarang cari checkpoint
    TERBARU di antara `saldo_awal`/`saldo_awal_checkpoint` (bukan `.find()`
    ambil yg pertama lagi) dan `mulaiSetelah` dibaca dari periode baris itu
    sendiri (bukan konstanta `PERIODE_BASELINE` hardcoded) — replay tahun
    berikutnya mulai dari checkpoint, bukan dari 2025 lagi. Perubahan ini
    backward-compatible: utk aset yg belum pernah di-checkpoint (cuma py
    `saldo_awal` asli), hasilnya identik dgn sebelumnya.
  - **RPC `fn_tutup_tahun(p_tahun, p_catatan)`** (admin only, atomik):
    validasi tahun `terbuka` + SUDAH benar² berakhir (31 Des tahun itu <=
    hari ini — guard no-forward-date migrasi 23 otomatis menolak kalau belum,
    fungsi ini kasih pesan lebih jelas) → **BLOKIR TOTAL** kalau masih ada
    `jurnal_header` `approval_status='pending'` bertanggal di tahun itu
    (keputusan user 2026-07-07: blokir, bukan sekadar warning — supaya tidak
    ada barang "menggantung" yg later masuk ledger dgn tanggal tahun yg
    katanya sudah final) → checkpoint massal (`INSERT...SELECT` dari
    `penyusutan_semester`, cuma aset `status='aktif'`) → kunci tahun ini +
    buka tahun berikutnya (`tahun_buku`) → catat `tahun_buku_log`.
  - **RPC `fn_preview_tutup_tahun(p_tahun)`**: list jurnal pending (dipakai UI
    [app/dashboard/admin/tutup-tahun/page.tsx](app/dashboard/admin/tutup-tahun/page.tsx)
    sebelum admin coba menutup, biar bukan cuma exception mentah).
- Data referensi (`admin_kodefikasi_bmd`, `admin_overhaul_band`, `skpd`, dll) **satu kopi
  dibagi lintas tahun** (bukan per tahun) — TAPI editnya bisa ripple ke angka
  tahun lampau kalau engine di-run ulang tanpa proteksi.
- **`/api/engine/run` sudah dilindungi (migrasi tidak perlu, ini di kode API)**:
  (1) tolak total kalau tahun dari periode TARGET terkunci; (2) `hitungJadwalAset`
  selalu replay dari baseline sampai target — jadi walau target-nya tahun
  terbuka, replay bisa MELINTASI tahun terkunci di tengah (mis. run 2027 setelah
  2026 ditutup). Baris hasil utk periode di tahun terkunci di-FILTER SEBELUM
  upsert (`rowsDitulis`), jadi tetap dihitung di memori tapi TIDAK menimpa
  baris tersimpan tahun terkunci. Respons API sertakan
  `rows_dilindungi_tahun_terkunci` biar admin tahu kalau ada yg dilindungi.

**UI (selesai — badge + banner, BUKAN context global):**
- `components/useTahunBuku.ts` — `useDateBounds()` (min/max utk `<input
  type="date">` yg mengisi TANGGAL LEDGER, JANGAN dipakai utk field atribut/
  dokumen historis) & `useTahunBukuMap()` (map tahun→status).
- `components/TahunKerjaBadge.tsx` — badge "Tahun Kerja {tahun}" di TopBar,
  ambil MAX tahun berstatus terbuka.
- `components/TahunTerkunciNote.tsx` — banner info (bukan larangan — laporan
  tahun terkunci itu justru angka final/teraudit) di halaman yg punya
  pemilih tahun/semester: Daftar Barang, Penyusutan (juga dekat tombol
  "Jalankan Engine" — tombolnya sendiri SUDAH diblokir server-side, lihat poin di
  atas), Rekapitulasi Saldo Akhir.
- **BUKAN context global** — tiap halaman tetap kelola filter tahun/semester
  sendiri-sendiri seperti sebelumnya (keputusan sengaja, biar tidak refactor
  besar ~15 halaman sekaligus).
- **Pemilih "Tahun Kerja" di halaman login** (`app/login/page.tsx`, migrasi 26
  buka RLS `tahun_buku` utk `anon` — tak ada data sensitif di situ, cuma
  tahun/status/catatan admin): pilihan disimpan di `localStorage`
  (`lib/tahunKerja.ts`, key `bmd_tahun_kerja_pilihan`), dipakai sbg
  **DEFAULT AWAL** (`useState(() => tahunAwal(...))`) di 3 halaman yg py
  pemilih tahun: Daftar Barang, Penyusutan, Rekapitulasi Saldo Akhir.
  **BUKAN gerbang keamanan** — user tetap bebas ganti tahun apa pun di tiap
  halaman kapan saja, dan tetap bisa lihat tahun terkunci (memang gunanya).
  Penegak sesungguhnya tetap `tahun_buku` + trigger di server, terpisah total
  dari preferensi UI ini.

## Pengalihan Status Penggunaan (transfer antar SKPD, migrasi 21 + 22)

Jenis ketiga di menu Penghapusan (sisi KELUAR) + persetujuan SKPD tujuan di menu
Penggunaan (sisi MASUK, `PenggunaanMasuk.tsx`). Gabungan dua pola yang sudah ada:
kartu ber-SK (`jurnal_header` kategori `pengalihan_status`, WAJIB `skpd_tujuan`
level SKPD induk — combobox `rootOnly`) + draft-approve (barang di
`payload.draft_items`, `approval_status='pending'`; ledger & `aset` TIDAK
disentuh sampai SKPD tujuan menerima). Poin penting:

- **SATU PINTU (migrasi 22).** Begitu SKPD tujuan MENERIMA, SKPD asal (pengirim)
  TIDAK bisa apa-apa lagi — kartunya read-only. Pengembalian barang HANYA lewat
  SKPD PENERIMA (tombol "Kembalikan" per barang di `PenggunaanMasuk.tsx`).
- **Mutasi lintas-SKPD lewat RPC SECURITY DEFINER**, bukan insert/update client:
  `fn_terima_pengalihan` (materialize: ledger `pengalihan_status` + pindah
  `aset.skpd_id`, atomik), `fn_tolak_pengalihan` (status `ditolak`+alasan, ini
  status AKTIF di kategori ini — beda dgn Pengadaan yg legacy), dan
  `fn_kembalikan_pengalihan_barang` (penerima/admin ONLY: transaksi balik
  ber-payload `{reversal:true}` + aset kembali ke asal). Alasannya: RLS
  `aset`/`transaksi_bmd` menolak operator menulis di luar subtree SKPD-nya —
  jangan coba bypass dgn policy longgar. (`fn_batal_pengalihan_barang` LAMA
  di-DROP migrasi 22 — jangan dipakai lagi.)
- **Pengembalian = peristiwa BARU di periode BERJALAN** (`current_date`), BUKAN
  dibekukan ke periode jurnal asli. Supaya laporan periode ANTARA terima &
  kembali tetap menunjukkan barang di SKPD penerima; sejak periode kembali,
  balik ke SKPD asal.
- `pengalihan_status` TANPA efek finansial di engine (penyusutan jalan terus)
  dan BUKAN event SEMBUNYI — barang cuma pindah pemegang. Keanggotaan kartu:
  baris ledger TERBARU per (header, aset); `payload.reversal` = keluar.
- **Kepemilikan PERIOD-AWARE (`lib/pengalihan.ts`).** Daftar Barang & Penyusutan
  meng-atribusi SKPD per periode dgn replay ledger, BUKAN `aset.skpd_id` terkini:
  `fetchOwnerOverrides(periode)` → map aset_id→SKPD pemilik pd periode itu
  (skpd_tujuan baris terakhir dgn periode<=V; sebelum transfer pertama = skpd_asal
  awal). `partitionByPeriodOwner` menyesuaikan set saat filter SKPD: BUANG barang
  yg kini di scope tapi saat itu milik SKPD lain, TAMBAH barang yg saat itu milik
  scope tapi kini sudah pindah keluar (di-fetch by id, RLS `aset_select` diperluas
  migrasi 22 via `fn_aset_pernah_dikelola` supaya pengirim tetap bisa baca aset yg
  sudah pindah). Angka penyusutan engine tak berubah — hanya kolom/atribusi SKPD.
  ⚠️ Rekapitulasi Saldo Akhir (per SKPD) BELUM period-aware utk pengalihan.
- Selama pending: draft bebas diedit, jurnal boleh DELETE utuh (belum ada
  ledger). Pindah semester = hapus & entry ulang (guard semester sama spt
  ber-SK lain). `skpd_tujuan` terkunci begitu status bukan pending.
- Dokumen sumber (foto/PDF) → bucket **`dokumen-sumber`** (privat, 10MB,
  image+pdf — beda dari `aset-foto` yg image-only), path di
  `payload.dokumen_paths`, tampilkan via signed URL.

## Pola jurnal ber-SK (Penghapusan, Kapitalisasi, dan menu ber-No SK lain)

Menu yang punya "kartu jurnal" dengan No SK/No Dokumen + tanggal + daftar barang
memakai tabel **`jurnal_header`** (migrasi `20260704_07_jurnal_header.sql`):

- Header (`jurnal_header`) menyimpan No SK, tanggal, periode (beku), jenis,
  keterangan — **boleh diedit**. Baris ledger (`transaksi_bmd.header_id`) tetap
  beku. Jadi edit No SK/tanggal tidak melanggar aturan append-only.
- **Aturan edit tanggal (WAJIB diterapkan di setiap menu ber-SK baru):**
  - Ganti No SK / tanggal **boleh** selama tanggal tetap di **semester yang sama**.
  - Pindah semester **tidak boleh** lewat edit → user harus **batalkan & entry
    ulang**. Alasan: melindungi periode yang mungkin sudah dilaporkan ke
    atasan/inspektorat/BPK. Trigger `fn_jurnal_header_guard` menegakkan ini di DB;
    UI juga wajib memvalidasi (bandingkan `periodeDariTanggal(tglBaru)` dgn
    `header.periode`) supaya pesan error ramah.
  - `skpd_id` & `kategori` header tidak boleh diubah (itu = jurnal lain).
- **Tambah barang ("+")** ke jurnal yang sudah ada: aman untuk pola append murni
  (mis. Penghapusan — cukup insert baris ledger baru ber-`header_id` sama).
  ⚠️ Untuk Kapitalisasi, "tambah anak" BUKAN append murni: menambah nilai rehab
  bisa mengubah band overhaul & masa manfaat (recompute). Perlu keputusan desain
  terpisah, jangan diperlakukan seperti Penghapusan.
- Grouping kartu jurnal: by `header_id` (bukan lagi by `payload.no_sk`).

Saat membangun menu ber-SK berikutnya (Koreksi ber-SK, Reklasifikasi ber-SK, dll.)
gunakan pola `jurnal_header` yang sama + aturan kunci-semester di atas.

## Pola APPROVAL untuk menu Cara Perolehan (Pengadaan, Hibah, dst.)

Menu **Cara Perolehan** (Pengadaan sekarang; Hibah/Hasil Inventarisasi/Perolehan
Lainnya menyusul dgn pola sama — migrasi `20260704_12_approval_pengadaan.sql`)
butuh persetujuan admin sebelum barang resmi tercatat. Karena ledger append-only
mutlak (trigger nolak UPDATE/DELETE apa pun, termasuk barang yang "masih pending"),
solusinya BUKAN nulis ke `aset`/`transaksi_bmd` lalu filter visibility di semua
halaman pembaca — itu berisiko bocor kalau ada satu halaman yang kelupaan difilter.

Yang dipakai: **draft dulu, ledger ditulis saat approve**:
- Barang yang diinput operator ditampung di `jurnal_header.payload.draft_items`
  (JSON array) — BUKAN ledger asli. Bebas diedit/dihapus/diubah kuantitas selama
  masih `approval_status='pending'`, karena cuma UPDATE kolom biasa (jurnal_header
  bukan tabel append-only, cuma baris ledgernya yang beku).
- `jurnal_header.approval_status` ∈ {`pending`,`disetujui`,`ditolak`}. Default
  kolom = `disetujui` (supaya baris lama/kategori lain tak berubah perilaku) —
  kategori Cara Perolehan yang baru WAJIB insert eksplisit `approval_status:'pending'`.
  `'ditolak'` = LEGACY SAJA (fitur Tolak sudah DIHAPUS dari UI Pengadaan — alurnya
  disederhanakan jadi: user input → admin verifikasi → (salah) edit draft →
  Setujui; TIDAK ADA cabang tolak). Baris lama berstatus `ditolak` disaring dari
  tampilan & dari cek keunikan No SK/BAST (`.neq('approval_status','ditolak')`),
  tapi tak pernah dibuat baru.
- **Approve** (admin only, `fn_is_admin()`, ditegakkan trigger
  `fn_jurnal_header_approval_guard`): materialize `draft_items` → insert `aset`
  (kuantitas>1 di-split jadi N baris jumlah=1) + `transaksi_bmd` sekaligus, pakai
  **tanggal BAST** (atau tanggal setara serah terima) sbg tgl perolehan efektif —
  bukan tanggal kontrak, bukan tanggal approve. Baru sesudah ini barang muncul di
  Daftar Barang/Penyusutan/Laporan/Engine — otomatis, tanpa perlu filter tambahan
  di halaman-halaman itu, karena sebelumnya memang belum pernah ada di sana.
  Klasifikasi `intra_ekstra` per barang DIHITUNG OTOMATIS saat approve: nilai
  item vs `kodefikasi_bmd.batas_kapitalisasi` (`lib/bmd.ts`
  `klasifikasiKomptabel()` — nilai >= batas → intra, < batas → ekstra; tanpa
  batas terdaftar → default intra).
- **Import Excel (`PerolehanImport.tsx`, dipakai kelima menu Cara Perolehan)
  IKUT alur approval ini — TIDAK menulis langsung ke ledger** (sejak
  2026-07-13; dulu ia insert `aset`+`transaksi_bmd` langsung → barang loncat ke
  Daftar Barang tanpa approve & tak pernah muncul sbg kartu, tak bisa
  di-unapprove). Sekarang baris valid ditampung sbg `jurnal_header` draft
  `pending`, **dikelompokkan per No. BAST/Dokumen** (1 dokumen = 1 kartu),
  `draft_items`-nya mengikuti shape DraftItem menu tujuan (Pengadaan pakai
  `rekening` + tgl BAST header; Hibah dsb pakai `tglPerolehan` per item). NIBAR
  & `intra_ekstra` tetap DIGENERATE/DIHITUNG saat approve (kolom NIBAR di file
  Excel diabaikan — keputusan user 2026-07-13). Header pengadaan bertanggal =
  tgl BAST (jadi backdate ke tahun terkunci ditolak guard, sama spt entry
  manual pengadaan); header Hibah/dll bertanggal hari ini (tahun terbuka),
  tanggal perolehan asli tetap di item. No. Dokumen yg sudah ada dilewati
  (hindari kartu ganda).
- **Pengadaan Konstruksi = MULTI-KDP** (`KonstruksiPengadaan.tsx` + `lib/kdp.ts`,
  redesign 2026-07-13). 1 kontrak konstruksi (kategori `konstruksi`) bisa berisi
  **beberapa barang KDP** (mis. paket jalan → beberapa ruas) — semua di
  `payload.barang[]` (JSON, TANPA kolom/tabel baru). Tiap barang = 1 aset KDP
  (1.3.6) dgn rincian termin sendiri (`pembayaran[]`: perencanaan/fisik/
  biaya_umum/pengawasan); **nilai barang = Σ termin**. Approve/unapprove
  **ATOMIK per kontrak**: `approveKontrakKonstruksi` materialize SEMUA barang
  sekaligus (aset dibuat dulu semua → seluruh event `akumulasi_kdp` di-insert
  satu batch, all-or-nothing); `unapproveKontrakKonstruksi` balik SEMUA termin
  (`batal_akumulasi_kdp`) + sembunyikan SEMUA aset (`status='draft'`) → kalau
  10 barang, ke-10-nya hilang dari Daftar Barang sampai disetujui ulang. NIBAR
  digenerate ulang saat approve. **Kompat mundur**: payload single-KDP lama
  (`kode_kdp`+`pembayaran` flat) dibaca via `barangKdpList()` sbg 1 barang
  implisit; begitu di-save/unapprove, dinormalisasi ke `barang[]`. ⚠️ Backdate
  termin ke tahun terkunci ditolak guard (`akumulasi_kdp`/`batal_akumulasi_kdp`
  BELUM di-whitelist `fn_cek_tahun_buku`) — sama kendala pre-existing single-KDP.
  Tabel per-termin lama `proyek_konstruksi`/`proyek_barang`/`proyek_termin`
  (Opsi B, migrasi 20260712_01..04) TAK PERNAH dipakai UI → di-drop migrasi
  `20260713_01` (defensif: batal kalau ada isinya). Fungsi dead di `lib/kdp.ts`
  (`buatPaket`/`tambahBarang`/`setujuiTermin`/`reklasKdp`/dll) SUDAH dihapus
  2026-07-13 — yang tersisa cuma model merge-ke-Pengadaan (`barangKdpList`,
  `approveKontrakKonstruksi`, `unapproveKontrakKonstruksi`).
- **Kontrak DISETUJUI terkunci total** (read-only, tak ada edit/batal per-baris
  spt sebelumnya). Untuk mengubah: admin **"Buka Kunci"** (unapprove) →
  semua barang di `batal_pengadaan` (soft-delete retroaktif ke tgl asli,
  headerId disertakan di ledger reversal-nya supaya bisa dilacak balik) →
  kontrak balik ke draft (`draft_items` direkonstruksi dari barang yg dibatalkan)
  → edit → **Setujui ulang** (NIBAR digenerate ULANG, yg lama tetap tersimpan di
  aset yg sudah dihapus itu, utk audit).
- **Hapus kontrak**: draft murni (belum pernah disetujui) → hapus biasa, aman
  (`DELETE jurnal_header`, tak ada baris ledger yg nyantol). Kontrak yg PERNAH
  disetujui-lalu-dibuka-kunci (`hasLedger=true`, punya jejak ledger) → **TIDAK
  BOLEH dihapus** — diarsipkan (`UPDATE jurnal_header SET
  approval_status='ditolak'`) sbg gantinya: ledger tetap utuh (append-only
  aman), kontrak otomatis hilang dari tampilan Pengadaan, No SK/BAST bebas
  dipakai ulang (uniqueness check sudah `.neq('approval_status','ditolak')`).
  UI: satu tombol 🗑 yang sama (`hapusKontrak`), perilaku menyesuaikan
  `h.hasLedger` (arsipkan vs hapus beneran).
- **Koreksi PASCA-approve** (mis. kelebihan kuantitas baru ketahuan setelah
  disetujui, TANPA lewat unapprove): pakai jenis ledger `batal_pengadaan`
  (soft-delete `aset.status='dihapus'`, `berhenti=true` di engine, masuk
  `SEMBUNYI`). Beda dari `penghapusan_*` (itu utk disposal sungguhan) — ini
  murni koreksi input, DICATAT MUNDUR ke tanggal pengadaan aslinya (bukan hari
  ini) supaya barang dianggap tidak pernah ada sejak awal, bukan cuma berhenti
  dari sekarang.
- Draft item sudah **per-unit** sejak ditambahkan (kuantitas dipecah saat itu
  juga, bukan saat approve) — supaya tiap unit bisa beda spesifikasi/no. seri/
  foto sebelum di-approve (mis. 5 kendaraan beda nomor rangka/mesin). Field
  spesifikasi (termasuk `nama_barang`, "Spesifikasi Nama Barang") ikut sistem
  `fields` generik yg sama (lihat bagian wide-table di bawah) — semua diedit
  lewat checklist+popup, TIDAK ada field yang cuma bisa diisi sekali di form
  tambah barang (kecuali `uraian_barang`, yg baku dari kodefikasi & memang
  sengaja read-only). Centang barang **beda golongan** sekaligus → tombol Edit
  Spesifikasi disabled (`allSameGolongan()`, lib/asetFields.ts) — kolomnya beda,
  tak boleh digabung/union.

## Spesifikasi barang: wide table + field per golongan (lib/asetFields.ts)

Field spesifikasi (mis. no. rangka/mesin utk Peralatan&Mesin, dokumen
kepemilikan/lokasi utk Tanah) disimpan sbg kolom **nullable lebar di `aset`**
(satu tabel utk semua golongan — migrasi `20260704_13`, `_14`, `_16`), BUKAN
tabel terpisah per jenis aset. `FieldKey` (lib/asetFields.ts) = nama kolom DB
PERSIS 1:1 (termasuk `nama_barang` — bukan lagi top-level field terpisah,
lihat pola APPROVAL di atas) — jaga tetap sinkron kalau ada rename kolom lagi.
`GOLONGAN_FIELDS` cuma py **3 template** dipetakan ke 8 golongan: TANAH-like
(Tanah/Gedung&Bangunan/Jalan-Jaringan-Irigasi — py dokumen kepemilikan +
`jenis_hak` dropdown + lokasi), PERALATAN_MESIN (kendaraan, no. rangka/mesin/
polisi/BPKB), ASET_LAINNYA-like (ATL/KDP/ATB/Aset Lain-Lain — versi ringkas
tanpa no. kendaraan). Field lokasi fisik = `wilayah_kode` (FK ke tabel
`admin_wilayah`, dipilih via `WilayahPicker` berjenjang Provinsi→Kab→Kec→Desa,
data di-seed migrasi `_15` khusus Jatim+Kab.Kediri) + `alamat_detail` (jalan)
+ `latitude`/`longitude` (dipilih via `MapPicker`, Leaflet+OpenStreetMap,
WAJIB di-`next/dynamic({ssr:false})` krn butuh `window`). Kolom lama
`titik_koordinat`/`lokasi` sudah DI-DROP (migrasi
`20260710_04_drop_titik_koordinat_lokasi.sql`) — dikonfirmasi kosong di
seluruh baris live sebelum di-drop, tidak ada data yang hilang. Form edit
spesifikasi selalu lewat **popup**
(`EditSpesifikasiModal`) — field-nya bisa banyak & beda per golongan, jangan
taruh inline di baris tabel (bikin panjang/scroll). Baris tabel cukup
ringkasan satu baris + tombol buka popup.

## Foto barang (Supabase Storage)

Bucket `aset-foto` (privat, limit 10MB, hanya image/jpeg|png|webp — lihat migrasi
13). Path disimpan di `aset.foto_paths text[]`. Karena bucket privat, tampilkan
foto pakai **signed URL** (`createSignedUrl`/`createSignedUrls`, expiry ~1 jam),
BUKAN public URL. Draft (belum py `aset.id`) pakai prefix `draft/<key-client>/...`
— aman dipakai selamanya, tidak perlu dipindah saat materialize ke aset asli.

## Layout UI

- Kotak pemilih "Lokasi / SKPD" di menu pengelolaan pakai card full-width
  (tanpa `max-w-3xl`).

## Lingkungan kerja

- Tidak ada node/node_modules lokal (deploy via Vercel). **Tidak bisa jalankan
  `tsc`/build/test lokal** — verifikasi lewat review manual yang teliti.
- Migrasi SQL dijalankan user di Supabase SQL Editor sesuai urutan nama file.
