// Mengunci silsilah kategori Rincian Rekonsiliasi (./rincianRekonUrutan.ts) —
// permintaan user 2026-09-18. Yang paling penting dijaga: SETIAP `MutasiKey`
// muncul TEPAT SEKALI (pola yang sama dgn `BARIS_TRX`,
// lib/beritaAcaraRekon.test.ts) — kalau ada yang kelewat, baris ledger jenis
// itu nyasar ke urutan tak terduga tanpa satu pun error.
import { describe, it, expect } from 'vitest'
import { KATEGORI_LABEL, type MutasiKey } from './rekon'
import { URUTAN_KATEGORI_RINCIAN, urutanKategoriRincian } from './rincianRekonUrutan'

describe('URUTAN_KATEGORI_RINCIAN', () => {
  it('memuat SETIAP MutasiKey TEPAT SEKALI (tak ada yang kelewat/dobel)', () => {
    const semua = Object.keys(KATEGORI_LABEL) as MutasiKey[]
    expect(URUTAN_KATEGORI_RINCIAN.length).toBe(semua.length)
    expect(new Set(URUTAN_KATEGORI_RINCIAN).size).toBe(URUTAN_KATEGORI_RINCIAN.length)
    for (const k of semua) expect(URUTAN_KATEGORI_RINCIAN).toContain(k)
  })

  it('Cara Perolehan mendahului Transfer Masuk', () => {
    expect(urutanKategoriRincian('pengadaan')).toBeLessThan(urutanKategoriRincian('penggunaan_masuk'))
    expect(urutanKategoriRincian('lainnya')).toBeLessThan(urutanKategoriRincian('penggunaan_masuk'))
  })

  it('Transfer Masuk mendahului Transfer Keluar', () => {
    expect(urutanKategoriRincian('penggunaan_masuk')).toBeLessThan(urutanKategoriRincian('pengalihan_keluar'))
    expect(urutanKategoriRincian('internal_masuk')).toBeLessThan(urutanKategoriRincian('internal_keluar'))
  })

  it('pengalihan_keluar ("Penghapusan Pengalihan") masuk kelompok Transfer, BUKAN Penghapusan', () => {
    // Nama KATEGORI_LABEL-nya menyesatkan ("Penghapusan Pengalihan"), tapi
    // secara silsilah ia harus di grup Transfer Keluar — sebelum Koreksi
    // maupun Penghapusan sungguhan.
    expect(urutanKategoriRincian('pengalihan_keluar')).toBeLessThan(urutanKategoriRincian('koreksi_tambah'))
    expect(urutanKategoriRincian('pengalihan_keluar')).toBeLessThan(urutanKategoriRincian('hapus_penjualan'))
  })

  it('Pemecahan: INDUK (keluar) mendahului ANAK/pecahan (masuk) — kebalikan arah Tambah/Kurang biasa', () => {
    expect(urutanKategoriRincian('pemecahan_keluar')).toBeLessThan(urutanKategoriRincian('pemecahan_masuk'))
  })

  it('Kapitalisasi: induk yang menyerap mendahului anak yang diserap', () => {
    expect(urutanKategoriRincian('kapitalisasi')).toBeLessThan(urutanKategoriRincian('kapitalisasi_keluar'))
  })

  it('Penggabungan: induk/penerima mendahului sumber yang dilebur', () => {
    expect(urutanKategoriRincian('penggabungan_masuk')).toBeLessThan(urutanKategoriRincian('penggabungan_keluar'))
  })

  it('Reklasifikasi & Koreksi Nilai berada di dalam kelompok Koreksi, sebelum Penghapusan', () => {
    const kunciKoreksi: MutasiKey[] = [
      'koreksi_tambah', 'koreksi_kurang', 'kapitalisasi', 'kapitalisasi_keluar',
      'pemecahan_keluar', 'pemecahan_masuk', 'penggabungan_masuk', 'penggabungan_keluar',
      'reklas_fungsi_masuk', 'reklas_fungsi_keluar', 'reklas_kode_masuk', 'reklas_kode_keluar',
    ]
    const kunciPenghapusan: MutasiKey[] = ['hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain']
    const maxKoreksi = Math.max(...kunciKoreksi.map(urutanKategoriRincian))
    const minPenghapusan = Math.min(...kunciPenghapusan.map(urutanKategoriRincian))
    expect(maxKoreksi).toBeLessThan(minPenghapusan)
  })

  it('Penghapusan Sebab Lain di posisi PALING AKHIR', () => {
    const semuaLain = URUTAN_KATEGORI_RINCIAN.filter(k => k !== 'hapus_sebab_lain')
    const maxLain = Math.max(...semuaLain.map(urutanKategoriRincian))
    expect(urutanKategoriRincian('hapus_sebab_lain')).toBeGreaterThan(maxLain)
  })

  it('kategori yang tak terdaftar jatuh ke akhir (999), bukan melempar', () => {
    expect(urutanKategoriRincian('kategori_karangan_tak_pernah_ada' as MutasiKey)).toBe(999)
  })
})
