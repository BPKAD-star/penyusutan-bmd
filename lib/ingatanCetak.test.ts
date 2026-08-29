// Penjaga ingatan pilihan cetak (lib/ingatanCetak.ts).
//
// Yang dijaga: (1) menulis TIDAK PERNAH melempar — tiga pemanggil dulu menulis
// tanpa try/catch, dan `setItem` melempar di mode privat / kuota penuh dari
// dalam `onChange`, jadi memilih penanda tangan bisa menjatuhkan halaman cetak;
// (2) muatan cacat terbaca "belum pernah memilih", bukan meledak; (3) kunci
// warisan TIDAK BERUBAH — mengubahnya melenyapkan preferensi operator diam-diam.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ingatanCetak, ingatanTeksCetak,
  kunciTtdLaporanBmd, KUNCI_TTD_LAPORAN_BMD_PEMDA, kunciTtdMutasiBmd,
  kunciTtdPerolehan, kunciTtdRkbmdSkpd, KUNCI_TTD_RKBMD_SEKAB,
  KUNCI_TTD_STANDAR_SEKAB,
} from './ingatanCetak'

/** localStorage tiruan — vitest berjalan di `node`, jadi aslinya tak ada. */
function pasangStorage(opts: { setItemMelempar?: boolean; getItemMelempar?: boolean } = {}) {
  const isi = new Map<string, string>()
  const palsu: Storage = {
    get length() { return isi.size },
    clear: () => isi.clear(),
    key: (i: number) => [...isi.keys()][i] ?? null,
    getItem: (k: string) => {
      if (opts.getItemMelempar) throw new Error('SecurityError: site data diblokir')
      return isi.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (opts.setItemMelempar) throw new Error('QuotaExceededError')
      isi.set(k, v)
    },
    removeItem: (k: string) => { isi.delete(k) },
  }
  ;(globalThis as { localStorage?: Storage }).localStorage = palsu
  return isi
}
const cabutStorage = () => { delete (globalThis as { localStorage?: Storage }).localStorage }

afterEach(cabutStorage)

describe('ingatanCetak — muatan JSON', () => {
  beforeEach(() => { pasangStorage() })

  it('menyimpan lalu membaca kembali muatan apa adanya', () => {
    const ing = ingatanCetak<{ id: string; plt: boolean; tgl: string }>('uji')
    ing.simpan({ id: 'abc', plt: true, tgl: '2026-08-29' })
    expect(ing.baca()).toEqual({ id: 'abc', plt: true, tgl: '2026-08-29' })
  })

  it('null kalau belum pernah disetel', () => {
    expect(ingatanCetak('belum-pernah').baca()).toBeNull()
  })

  it('hapus mengosongkan', () => {
    const ing = ingatanCetak<{ a: number }>('uji')
    ing.simpan({ a: 1 })
    ing.hapus()
    expect(ing.baca()).toBeNull()
  })

  // Isi localStorage itu data dari LUAR program: versi lama, suntingan manual,
  // atau kunci yang dipakai bersama tab lain.
  it('muatan cacat terbaca null, bukan melempar', () => {
    const isi = pasangStorage()
    isi.set('uji', '{ini bukan json')
    expect(() => ingatanCetak('uji').baca()).not.toThrow()
    expect(ingatanCetak('uji').baca()).toBeNull()
  })
})

describe('ingatanTeksCetak — muatan teks polos', () => {
  beforeEach(() => { pasangStorage() })

  // ⚠️ RKBMD se-Kabupaten menyimpan id pegawai APA ADANYA sejak awal.
  // Membacanya lewat ingatanCetak (JSON) akan melempar lalu jadi null — pilihan
  // yang sudah tersimpan di peramban operator LENYAP tanpa satu pun error.
  it('regresi: id polos tetap terbaca, tidak di-JSON.parse', () => {
    const isi = pasangStorage()
    isi.set(KUNCI_TTD_RKBMD_SEKAB, '5f0c7b2e-uuid-bukan-json')
    expect(ingatanTeksCetak(KUNCI_TTD_RKBMD_SEKAB).baca()).toBe('5f0c7b2e-uuid-bukan-json')
    // Dan inilah yang akan terjadi kalau salah dipakai:
    expect(ingatanCetak<string>(KUNCI_TTD_RKBMD_SEKAB).baca()).toBeNull()
  })

  it('menyimpan tanpa tanda kutip tambahan', () => {
    const isi = pasangStorage()
    ingatanTeksCetak('uji').simpan('abc')
    expect(isi.get('uji')).toBe('abc')
  })
})

describe('tak pernah melempar, apa pun keadaan storage-nya', () => {
  // ⚠️ Ini inti Fase 2c. `setItem` melempar di mode privat & saat kuota penuh,
  // dan di tiga pemanggil ia dipanggil dari dalam `onChange`/`onPilih` —
  // melempar di situ menjatuhkan halaman cetaknya.
  it('regresi 2026-08-29: simpan() tidak melempar saat setItem melempar', () => {
    pasangStorage({ setItemMelempar: true })
    expect(() => ingatanCetak('uji').simpan({ a: 1 })).not.toThrow()
    expect(() => ingatanTeksCetak('uji').simpan('abc')).not.toThrow()
  })

  it('baca() tidak melempar saat getItem melempar (site data diblokir)', () => {
    pasangStorage({ getItemMelempar: true })
    expect(ingatanCetak('uji').baca()).toBeNull()
    expect(ingatanTeksCetak('uji').baca()).toBeNull()
  })

  // Komponen 'use client' tetap dirender di server oleh App Router.
  it('aman saat localStorage TIDAK ADA sama sekali (render di server)', () => {
    cabutStorage()
    expect(ingatanCetak('uji').baca()).toBeNull()
    expect(() => ingatanCetak('uji').simpan({ a: 1 })).not.toThrow()
    expect(() => ingatanCetak('uji').hapus()).not.toThrow()
    expect(() => ingatanTeksCetak('uji').simpan('x')).not.toThrow()
  })
})

describe('kunci warisan — JANGAN diganti', () => {
  // Kunci = tempat preferensi operator tersimpan di peramban MEREKA.
  // Menggantinya tidak error sama sekali, cuma membuat semua pilihan yang
  // pernah disetel lenyap dan lembar cetak ulang mendadak bertitik-titik lagi.
  // Nilainya sengaja dikunci HARFIAH di sini, bukan diturunkan dari fungsinya.
  it('nilainya persis seperti sebelum disatukan', () => {
    expect(kunciTtdLaporanBmd(12)).toBe('bmd_laporanbmd_ttd_skpd_12')
    expect(KUNCI_TTD_LAPORAN_BMD_PEMDA).toBe('bmd_laporanbmd_ttd_pemda')
    expect(kunciTtdMutasiBmd(12)).toBe('bmd_mutasi_ttd_skpd_12')
    expect(kunciTtdMutasiBmd(null)).toBe('bmd_mutasi_ttd_pemda')
    expect(kunciTtdPerolehan(12)).toBe('bmd_perolehan_ttd_skpd_12')
    expect(kunciTtdRkbmdSkpd(12)).toBe('bmd_rkbmd_ttd_skpd_12')
    expect(KUNCI_TTD_RKBMD_SEKAB).toBe('bmd_rkbmd_ttd_sekab')
    expect(KUNCI_TTD_STANDAR_SEKAB).toBe('bmd_standar_ttd_sekab')
  })

  it('tiap lembar punya kunci sendiri — tak ada yang bocor ke lembar lain', () => {
    const semua = [
      kunciTtdLaporanBmd(12), KUNCI_TTD_LAPORAN_BMD_PEMDA,
      kunciTtdMutasiBmd(12), kunciTtdMutasiBmd(null),
      kunciTtdPerolehan(12), kunciTtdRkbmdSkpd(12),
      KUNCI_TTD_RKBMD_SEKAB, KUNCI_TTD_STANDAR_SEKAB,
    ]
    expect(new Set(semua).size).toBe(semua.length)
  })

  // Operator sering mencetak lembar beberapa sub-OPD berturut-turut; satu kunci
  // bersama akan membuat pilihan SKPD terakhir bocor ke lembar SKPD berikutnya.
  it('kunci per-SKPD benar-benar berbeda antar SKPD', () => {
    expect(kunciTtdRkbmdSkpd(12)).not.toBe(kunciTtdRkbmdSkpd(13))
    expect(kunciTtdPerolehan(12)).not.toBe(kunciTtdPerolehan(13))
    expect(kunciTtdLaporanBmd(12)).not.toBe(kunciTtdLaporanBmd(13))
    expect(kunciTtdMutasiBmd(12)).not.toBe(kunciTtdMutasiBmd(13))
  })
})
