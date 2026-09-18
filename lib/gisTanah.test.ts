// Mengunci cakupan kode GIS Tanah (./gisTanah.ts) — KEMBAR dengan predikat
// partial index `idx_aset_tanah_skpd`/`idx_aset_tanah_nama` (migrasi
// 20260918_02). Kalau salah satu konstanta di sini diubah tanpa mengubah
// migrasinya, planner tak bisa membuktikan implikasi predikat & GIS Tanah
// timeout lagi — persis riwayat yang sudah dua kali terjadi (CLAUDE.md).
import { describe, it, expect } from 'vitest'
import { KODE_TANAH_IDLE, GIS_TANAH_KODE_FILTER } from './gisTanah'

describe('GIS Tanah — cakupan kode (2026-09-18)', () => {
  it('KODE_TANAH_IDLE persis kode idle land, bukan tetangganya di kelompok yang sama', () => {
    // Tetangganya (.002/.003 di kelompok yang sama) itu Peralatan&Mesin/Gedung
    // yang "tidak digunakan operasional" — bukan tanah. Kalau nilainya
    // bergeser ke situ, GIS akan kemasukan barang yang bukan bidang lahan.
    expect(KODE_TANAH_IDLE).toBe('1.5.4.01.01.02.001')
  })

  it('GIS_TANAH_KODE_FILTER memuat golongan 1.3.1 (prefix) DAN kode idle land (persis)', () => {
    expect(GIS_TANAH_KODE_FILTER).toBe('kode.like.1.3.1.%,kode.eq.1.5.4.01.01.02.001')
  })

  it('filter TIDAK melebar ke seluruh golongan 1.5.4', () => {
    // Predikat index-nya juga persis SATU kode, bukan `kode LIKE '1.5.4.%'` —
    // menguji ini menutup kemungkinan seseorang "merapikan" filternya jadi
    // prefix golongan penuh, yang akan menyeret seluruh keranjang campuran itu.
    expect(GIS_TANAH_KODE_FILTER).not.toContain('1.5.4.%')
    expect(GIS_TANAH_KODE_FILTER).toContain('kode.eq.')
  })
})
