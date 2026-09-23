// ============================================================================
// Kolom "Penggunaan" di Daftar Barang — dua cache yang selama ini ditulis tapi
// TAK PERNAH ditampilkan di mana pun (diverifikasi lewat grep 2026-09-23:
// `aset.pemanfaatan` & `aset.pengamanan` cuma di-set/di-null-kan oleh menu
// Pemanfaatan & Pengamanan sendiri, nol pembaca).
//
// Aturannya sama persis dengan Σ luas bidang (lib/luasBidang.ts) yang MENANG
// atas kolom luas register: entri yang HIDUP (pemanfaatan/pengamanan aktif
// tahun berjalan) MENDUDUKI kolom Penggunaan, menggantikan — bukan menambah —
// teks baseline `penggunaan_pengamanan` (warisan impor e-BMD). Kalau
// keduanya kosong, jatuh ke teks baseline itu.
//
// Golongan Pemanfaatan (Tanah/Gedung/JIJ/Aset Lain-Lain) & Pengamanan
// (Peralatan&Mesin/Gedung) beririsan di Gedung & Bangunan (1.3.3) — satu
// gedung bisa punya PENGAMANAN (kustodi sebagian ruang) & PEMANFAATAN
// (sebagian disewakan) sekaligus. Keduanya SAH tampil bersamaan, jadi
// keduanya ditumpuk — tak ada yang diprioritaskan/dibuang.
//
// ⚠️ Bentuknya SENGAJA tiga ruas terpisah (bukan `baris: string[]` polos,
// versi pertama berkas ini) — layar 2026-09-23 menautkan HANYA ruas
// `pemanfaatan` jadi tautan hijau ke menu Pemanfaatan (lib/pengelolaan/
// Pemanfaatan.tsx); `pengamanan` tak bisa ditautkan sama (menu Pengamanan tak
// punya deep-link per barang), jadi keduanya wajib bisa dibedakan pemanggil.
// ============================================================================
import { namaPemakaiPengamanan } from '@/lib/pengamanan'

export type PenggunaanSumber = {
  pemanfaatan: string | null
  pengamanan: string | null
  penggunaan_pengamanan: string | null
}

export type PenggunaanTampil = {
  /** Nama pemakai saja (identitas dibuang) — null kalau tak ada kustodi aktif. */
  pengamanan: string | null
  /** Cache Pemanfaatan apa adanya ("Jenis — Pihak (s.d. tanggal)") — null
   *  kalau tak ada perjanjian pemanfaatan aktif. */
  pemanfaatan: string | null
  /** Teks baseline `penggunaan_pengamanan` — HANYA terisi kalau kedua ruas
   *  di atas kosong (keduanya MENDUDUKI ruas ini kalau ada). */
  dasar: string | null
}

export function penggunaanTampil(r: PenggunaanSumber): PenggunaanTampil {
  const pengamanan = namaPemakaiPengamanan(r.pengamanan)
  const pemanfaatan = r.pemanfaatan || null
  if (pengamanan || pemanfaatan) return { pengamanan, pemanfaatan, dasar: null }
  const dasar = (r.penggunaan_pengamanan || '').trim()
  return { pengamanan: null, pemanfaatan: null, dasar: dasar || null }
}
