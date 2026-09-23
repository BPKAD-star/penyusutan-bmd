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
// ============================================================================
import { namaPemakaiPengamanan } from '@/lib/pengamanan'

export type PenggunaanSumber = {
  pemanfaatan: string | null
  pengamanan: string | null
  penggunaan_pengamanan: string | null
}

export type PenggunaanTampil = {
  /** Baris yang tampil, urut: siapa yang memegang fisiknya dulu (Pengamanan),
   *  baru dalam bentuk apa dimanfaatkan (Pemanfaatan). Kosong = jatuh ke `dasar`. */
  baris: string[]
  /** true kalau `baris` datang dari cache aktif, bukan dari teks baseline. */
  aktif: boolean
}

export function penggunaanTampil(r: PenggunaanSumber): PenggunaanTampil {
  const baris: string[] = []
  const nama = namaPemakaiPengamanan(r.pengamanan)
  if (nama) baris.push(nama)
  if (r.pemanfaatan) baris.push(r.pemanfaatan)
  if (baris.length > 0) return { baris, aktif: true }
  const dasar = (r.penggunaan_pengamanan || '').trim()
  return { baris: dasar ? [dasar] : [], aktif: false }
}
