// Uji pencocok kotak Cari (Daftar Pegawai & Daftar User).
import { describe, it, expect } from 'vitest'
import { cocokCari } from '@/lib/cari'

const BARIS = ['Irwan Chandra Wahyu Purnama, S.T., M.M.T.', '197305022003121006', 'Dinas Pekerjaan Umum dan Penataan Ruang']

describe('cocokCari', () => {
  it('kata kunci kosong meloloskan semua', () => {
    expect(cocokCari('', BARIS)).toBe(true)
    expect(cocokCari('   ', BARIS)).toBe(true)
  })

  it('cocok lewat nama, NIP, maupun SKPD', () => {
    expect(cocokCari('irwan', BARIS)).toBe(true)
    expect(cocokCari('197305022003121006', BARIS)).toBe(true)
    expect(cocokCari('pekerjaan umum', BARIS)).toBe(true)
  })

  it('tak peduli huruf besar/kecil', () => {
    expect(cocokCari('IRWAN CHANDRA', BARIS)).toBe(true)
  })

  it('AND antar kata, bukan OR', () => {
    // Mengetik lebih spesifik harus MEMPERSEMPIT. Kalau OR, "irwan kesehatan"
    // justru menarik seluruh pegawai Dinas Kesehatan ikut ke layar.
    expect(cocokCari('irwan pekerjaan', BARIS)).toBe(true)
    expect(cocokCari('irwan kesehatan', BARIS)).toBe(false)
  })

  it('NIP yang disalin berikut pemisah tetap ketemu', () => {
    // Di DB ia 18 angka rapat; operator menyalinnya dari surat dgn spasi/titik.
    expect(cocokCari('19730502 200312 1 006', BARIS)).toBe(true)
    expect(cocokCari('19730502.200312.1.006', BARIS)).toBe(true)
    expect(cocokCari('1973-0502', BARIS)).toBe(true)   // hanya jalur angka yang bisa
  })

  it('potongan NIP tetap ketemu apa adanya', () => {
    expect(cocokCari('006', BARIS)).toBe(true)         // lewat pencocokan teks biasa
  })

  it('angka pendek TIDAK lewat jalur cadangan NIP', () => {
    // Ambang 4 angka. '00-6' bukan substring teks mana pun, dan angkanya ('006')
    // terlalu pendek untuk jalur cadangan — kalau ambangnya dicabut, hampir
    // setiap NIP akan cocok dgn hampir setiap ketikan angka pendek berpemisah.
    expect(cocokCari('00-6', BARIS)).toBe(false)
  })

  it('bidang null/kosong diabaikan, tidak bikin lemparan', () => {
    expect(cocokCari('budi', ['Budi', null, undefined])).toBe(true)
    expect(cocokCari('budi', [null, undefined])).toBe(false)
  })

  it('tidak mencocoki lintas-bidang secara kebetulan', () => {
    // Pemisah ' · ' menjaga "purnama dinas" tak jadi satu kata bersambung.
    expect(cocokCari('m.m.t. dinas', BARIS)).toBe(true)
    expect(cocokCari('purnamadinas', BARIS)).toBe(false)
  })
})
