# Kamus — pasangan yang mirip tapi beda

> Glosarium istilah, kolom, dan konsep yang **namanya berdekatan tapi
> maknanya tidak**. Tiap baris di bawah sudah pernah jadi bug nyata, atau
> sedang jadi utang terbuka.
>
> **Peta seluruh dokumen: [../README.md](../README.md).**

**Kenapa dokumen ini murah tapi berguna.** Bug termahal di repo ini hampir tak
pernah lahir dari logika yang rumit — ia lahir dari dua hal yang **dikira
sama**. Satu kolom dibaca dari sumber yang salah, satu tombol dipakai untuk
maksud tombol sebelahnya, satu daftar disalin ke tempat kedua lalu menyimpang.
Semuanya berbentuk kekeliruan **kosakata**, bukan kekeliruan algoritma.

Kolom terakhir menunjuk ke [insiden.md](insiden.md) kalau kekeliruannya sudah
pernah terjadi. Yang bertanda ⬜ belum pernah menggigit — **belum**.

---

## Tabel

| Pasangan | Bedanya | Pernah bikin bug apa |
|---|---|---|
| **`uraian_barang`** vs **`nama_barang`** | `uraian_barang` = **baku kodefikasi** (`admin_kodefikasi_bmd.uraian`), read-only bagi operator. `nama_barang` = **spesifikasi bebas** yang diketik operator. Di cetakan KIR: kolom 5 "Nama Barang" ← `uraian_barang`, kolom 6 "Spesifikasi Nama Barang" ← `nama_barang` — **jangan tertukar** | [INS-16](insiden.md#ins-16) |
| **sumber `uraian_barang`**: kodefikasi vs kolom tersimpan | Daftar Barang & Penyusutan **lookup ke kodefikasi** (ikut kodefikasi terkini). KIBAR, KIR, Kendaraan, kartu Pengadaan/Perolehan Manual, Reklasifikasi, Inventarisasi **membaca kolom tersimpan**. Jadi pintu pembuat aset yang lupa mengisi kolomnya bikin layar terlihat benar sementara **cetakan kosong** | [INS-16](insiden.md#ins-16) |
| **`cara_perolehan`** vs **`asal_usul`** | `cara_perolehan` = pilihan tertutup (CHECK 6 nilai), **diisi otomatis menu Cara Perolehan saat approve** — fakta dari menu. `asal_usul` = teks **bebas** warisan e-BMD yang lebih rinci ("Pengadaan APBD" — menyebut sumber dana), boleh dikoreksi operator. **Sengaja TIDAK disinkronkan**; yang dipakai turunan tampilan `asalUsulTampil()` — isian operator menang, kalau kosong jatuh ke label `cara_perolehan` | ⬜ — pemisahan ini justru **pencegahan**: dua penulis untuk satu kolom = dua sumber kebenaran tanpa arbiter |
| **NIBAR** vs **kode register** | NIBAR = **akta lahir**, terbit sekali, tak pernah berubah (direklas pun tidak) — ini kunci join di DB. Kode register = **KTP**, mengikuti posisi terakhir (SKPD, tahun **masuk SKPD**, kode barang, intra/ekstra). **Kode register JANGAN dipakai sebagai kunci join** | ⬜ untuk campurnya; tapi lihat [INS-09](insiden.md#ins-09) untuk generator NIBAR |
| **panjang 45 digit** — NIBAR kita vs NIBAR warisan | Dua-duanya 45 digit tapi **susunan segmennya beda**: skema kita `[12][01\|02][3506][SKPD 14][tahun 4][kode barang 12][urut 7]`; warisan e-BMD `[8 urut internal][kode barang 12][SKPD 14][tahun 4][urut 7]` — kode barang & SKPD **tertukar posisi**. Panjangnya saja **tidak cukup** untuk menilai kesamaan; penyaringnya kepala `12013506`/`12023506` | ⬜ ditangkap sebelum rilis: tanpa penyaring, 150.108 barang tampil "bergeser" dan 148 yang benar-benar bergeser tenggelam |
| **`null`** vs **`false`** pada `bergeserDariNibar()` | `false` = "sudah dinilai, **tidak** bergeser". `null` = "**tak bisa dinilai**" (NIBAR kosong / warisan yang layoutnya beda). Yang `null` **tidak ditandai apa pun** di layar | ⬜ — pembedaannya justru yang menyelamatkan penanda ⚠ dari jadi tak berguna |
| **`aset.luas`** vs **`aset_bidang_tanah.luas`** | Dua sumber untuk satu besaran, **belum ada yang menang di level register** — ini **utang terbuka**, butuh keputusan user. Aturan sementara di Daftar Barang: Σ bidang menang **hanya kalau semua bidang berluas**, kalau belum lengkap jatuh ke `aset.luas`. Σ-nya **dihitung saat tampil, jangan pernah disimpan balik ke kolom** | ⬜ — tapi kelas masalahnya sama dengan cache `aset.pemanfaatan`: dua penulis, satu besaran, tanpa arbiter. → [../REFACTOR-PLAN.md](../REFACTOR-PLAN.md) §5 |
| **Pemanfaatan** vs **Pengamanan** vs **KIR** | **Pemanfaatan** = barang dipakai **pihak ketiga** (sewa/pinjam pakai/KSP/BGS-BSG/KSPI), ber-perjanjian, ber-ledger. **Pengamanan** = kustodi **hukum** ke seorang **pegawai** lewat BAST + Pakta Integritas, ber-ledger. **KIR** = penempatan **fisik di ruangan**, administratif, **non-ledger** (UPDATE/DELETE biasa, dan itu tidak melanggar append-only). Ketiganya berdiri sendiri — satu barang boleh punya ketiganya sekaligus | ⬜ |
| **`saldo_awal`** vs **`saldo_awal_checkpoint`** | `saldo_awal` = baseline **impor e-BMD 2025 asli**, sekali seumur hidup. `saldo_awal_checkpoint` = hasil **Tutup Tahun** (salinan `penyusutan_semester` S2 tahun yang ditutup). Engine mencari yang **TERBARU di antara keduanya**, bukan yang pertama — kalau salah, replay tahun berikutnya mulai dari 2025 lagi | ⬜ — dikunci test engine ("memulai replay dari checkpoint TERBARU") |
| **`aset.nibar`** vs **`aset_awal_2026.nibar`** | Satu barang, **dua nomor**. NIBAR itu kunci join antara register dan snapshot baseline — tapi keduanya diterbitkan pada momen yang berbeda, jadi untuk ratusan barang **isinya tidak sama**: 33 cuma beda nomor urut (barang dientri dua kali), 73 beda segmen kode barang/SKPD/tahun (kedua tabel membeku pada atribut yang berbeda). **Jangan berasumsi join lewat NIBAR selalu ketemu** — cocokkan juga dengan SKPD + kode + nilai + nama kalau hasilnya terasa kurang | [INS-20](insiden.md#ins-20) — Edit Spesifikasi di Daftar Barang Awal menulis ke dua tabel lewat NIBAR; untuk ±300 barang hanya satu tabel yang ter-update |
| **`aset_awal_2026`** vs **`penyusutan_semester`** | `aset_awal_2026` = **snapshot beku** 2025, display-only, **tidak pernah dibaca engine**. `penyusutan_semester` = **turunan** hasil engine, boleh dihitung ulang kapan saja. Keduanya bukan sumber kebenaran; sumber kebenarannya ledger | [INS-08](insiden.md#ins-08) — tabelnya "cuma dibaca lewat RPC" ternyata menyimpan bom waktu RLS |
| **intra** vs **ekstrakomptabel** | **Keduanya IKUT disusutkan** dengan aturan yang **sama persis** (keputusan user 2026-07-13; dulu engine bail-out untuk ekstra). Pemisahan "neraca hanya intra" terjadi di **LAPORAN**, bukan di engine. Konsekuensinya `reklas_komptabel` nol efek perhitungan — murni pindah keranjang laporan | ⬜ — dikunci test engine (ekstra menghasilkan jadwal identik dengan intra) |
| **SEMBUNYI** vs **LAHIR** vs **MUNCUL** vs **NETRAL** | Empat pertanyaan berbeda, bukan satu. **LAHIR** = "kapan barang ini mulai ADA" (pecahan/carve-out KDP yang mewarisi `tgl_perolehan` induk). **SEMBUNYI** = "sejak kapan berhenti tampil". **MUNCUL** = "pembatalan penyembunyian" — replay **kronologis**, bukan "batal selalu menang". **NETRAL** = tidak menyentuh visibilitas sama sekali (pengalihan, pemanfaatan, pengamanan). Sumber tunggalnya `lib/visibilitas.ts` | [INS-18](insiden.md#ins-18) |
| **`tgl_perolehan`** vs **periode event kelahiran** | `tgl_perolehan` **berbohong** untuk barang hasil pemecahan: pecahan sengaja mewarisi tanggal induknya supaya penyusutannya meneruskan sisa umur induk. Yang otoritatif soal "sudah ada atau belum" = periode **event `LAHIR`**-nya | [INS-18](insiden.md#ins-18) |
| **`penghapusan_*`** vs **`batal_pengadaan`** | `penghapusan_*` = **disposal sungguhan**, barang memang dilepas. `batal_pengadaan` = **koreksi input**, dicatat **mundur ke tanggal pengadaan aslinya** supaya barang dianggap tak pernah ada — bukan "berhenti sejak sekarang" | ⬜ |
| **Batal** vs **Akhiri / Kembalikan** | **Akhiri/Kembalikan** = peristiwanya **SAH lalu berakhir**; barisnya tetap dibaca laporan, barangnya tetap tampil sebagai riwayat. **Batal (`batal_*`)** = **KOREKSI salah catat**; peristiwanya dianggap **tak pernah terjadi**, barangnya keluar total dari kartu. Salah pilih meninggalkan jejak permanen | ⬜ — tapi ini kekeliruan kosakata paling mahal yang mungkin terjadi. → [panduan-operator.md](panduan-operator.md) §1 |
| **`payload.target_trx_id`** vs **`target_trx_ids`** | Hampir semua `batal_*` memakai bentuk **tunggal**. `batal_pengalihan` memakai **jamak** — sekali batal menganulir baris perginya DAN baris pulangnya, sebab membatalkan separuh menyisakan rantai yang tak nyambung. `fetchBatalTargets` membaca dua-duanya. Bentuk payload yang tak dikenali membuat filternya **tidak menyaring apa pun tanpa satu pun error** | [INS-15](insiden.md#ins-15) |
| **`payload.reversal`** vs **`batal_pengalihan`** | `reversal: true` = **pengembalian**, peristiwa **NYATA** yang tetap dibaca laporan (barang sempat dipakai lalu dipulangkan). `batal_pengalihan` = perpindahannya **dianggap tak pernah terjadi**. Sama-sama "barang balik ke asal", maknanya berlawanan | [INS-15](insiden.md#ins-15) |
| **`pengalihan_status`** vs **`mutasi_internal`** | `pengalihan_status` = perpindahan **antar-SKPD induk** (tujuan wajib level induk, butuh persetujuan SKPD tujuan). `mutasi_internal` = perpindahan **di dalam subtree** SKPD sendiri. Keduanya sama-sama menggeser kepemilikan period-aware dan menerbitkan kode register baru — jadi **selalu muncul berpasangan** di daftar jenis | [INS-11](insiden.md#ins-11) — predikat `idx_trx_pindah_id` memuat keduanya, kembar dengan `JENIS_DITARIK` |
| **`jurnal_header`** vs **`transaksi_bmd`** | Header = **"sampul" kartu, BOLEH diedit** (No SK, tanggal, keterangan) — jadi mengganti No SK tidak melanggar append-only. Baris ledger di bawahnya **beku selamanya**. Batasnya: edit tanggal **tidak boleh pindah semester** | ⬜ |
| **`admin_skpd.kode_skpd`** vs **`kode_lokasi`** | `kode_skpd` = identitas resmi yang **benar-benar terisi** (mis. `18.00.00.0000.0000`; 14 digitnya tanpa titik = segmen SKPD di NIBAR & kode register). `kode_lokasi` **KOSONG di seluruh 816 baris** (dicek 2026-08-03) — kolom yang namanya paling tepat justru yang tak pernah diisi | ⬜ tercatat: KIBAR dulu selalu "-"; halaman IPA **masih** menampilkan & mengurutkan pakai `kode_lokasi` telanjang |
| **`aset.pemanfaatan` / `aset.pengamanan`** vs **ledger** | Kolomnya **CACHE** untuk badge & filter cepat; **sumber kebenarannya ledger**. Cache-nya **tidak pernah auto-null** saat masa berakhir lewat (tak ada cron) — barang kedaluwarsa tetap terkunci sampai di-Akhiri manual | ⬜ keterbatasan yang **diketahui & diterima**, bukan bug. Jadi contoh baku "dua penulis tanpa arbiter" yang dikutip di seluruh dokumen |

---

## Cara memakai kamus ini

- **Sebelum menulis kode yang menyentuh salah satu nama di atas**, baca
  barisnya. Nyaris semuanya punya pasangan yang tampilannya mirip di layar dan
  di query.
- **Kalau menemukan pasangan baru yang membingungkan, tambahkan barisnya** —
  meski belum pernah bikin bug. Kolom terakhir boleh ⬜; justru itu bentuk
  pencegahan yang paling murah di repo ini.
- **Jangan menyalin isi baris ke dokumen lain.** Rincian dan sejarahnya tetap
  di rumahnya masing-masing ([../rules.md](../rules.md),
  [../CLAUDE.md](../CLAUDE.md), [../schema.md](../schema.md)); yang di sini
  cuma **pembedanya**, sependek mungkin supaya bisa dibaca sambil lalu.
