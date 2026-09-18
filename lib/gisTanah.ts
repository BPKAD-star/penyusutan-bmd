// GIS Tanah — kode yang boleh tampil di peta & Daftar Bidang.
//
// Golongan 1.3.1 (Tanah) selalu ikut. Ditambah SATU kode di luar 1.3.1
// (keputusan user 2026-09-18): `1.5.4.01.01.02.001` "Aset Tetap Tanah Yang
// Tidak Digunakan Dalam Operasional Pemerintah" — tanah idle yang direklas ke
// Aset Lain-Lain, tapi tetap bidang tanah fisik milik Pemkab yang perlu
// dipetakan & dilacak sertifikatnya persis seperti Tanah aktif. Diverifikasi
// ke produksi 2026-09-18: 51 aset aktif di kode ini, semuanya sudah punya
// `luas`+`wilayah_kode` (dari Koreksi Spesifikasi — 1.5.4 sudah punya kolom
// gabungan sejak migrasi 20260908_01), tapi cuma 2 yang sudah bertitik
// koordinat. Sisanya itulah yang GIS ini lengkapi.
//
// ⚠️ SATU KODE PERSIS, BUKAN seluruh golongan 1.5.4 — golongan itu keranjang
// campuran (bekas reklas kendaraan/gedung/JIJ/ATL yang rusak berat atau idle).
// Tetangganya di kelompok kode yang sama (1.5.4.01.01.02.002/003,
// 1.5.4.01.01.01.002-005) itu Peralatan&Mesin/Gedung/JIJ/ATL, BUKAN tanah —
// kalau ikut ter-whitelist, GIS kemasukan barang yang bukan bidang lahan
// (nasib yang sama yang membuat JIJ 1.3.4 dicabut dari GIS 2026-07-15, lihat
// komentar kepala app/dashboard/gis/page.tsx).
//
// ⚠️ KEMBAR dengan predikat partial index `idx_aset_tanah_skpd` &
// `idx_aset_tanah_nama` (migrasi 20260918_02) — kalau kode ini berubah atau
// nambah, index-nya WAJIB ikut diubah. Beda sedikit saja, planner tak bisa
// membuktikan implikasinya & index-nya diabaikan DIAM-DIAM (sudah dua kali
// bikin GIS Tanah/Kendaraan timeout sebelum ini — CLAUDE.md).
export const KODE_TANAH_IDLE = '1.5.4.01.01.02.001'

/**
 * String siap-pakai utk `.or()` supabase-js — dipakai app/dashboard/gis/page.tsx
 * DAN components/gis/DaftarBidangTanah.tsx, supaya predikat `kode` di kedua
 * tempat SELALU identik satu sama lain dan dengan index di atas. Jangan
 * ditulis ulang manual di pemanggil — begitu ada yang menyalin lalu menyimpang
 * (mis. lupa memperbarui salah satunya saat kode ini berubah), planner
 * berhenti bisa membuktikan implikasi predikat index & GIS timeout lagi.
 */
export const GIS_TANAH_KODE_FILTER = `kode.like.1.3.1.%,kode.eq.${KODE_TANAH_IDLE}`
