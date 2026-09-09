// Penjaga lebar kolom lembar RINCI ringkas (Hibah/Hasil Inventarisasi/
// Tukar Menukar/Perolehan Lainnya, IV.A.x.2, 2026-09-09). `table-fixed` di
// LembarRinciPerolehanRingkas.tsx BUTUH total lebar tepat 100 — kalau tidak,
// kolom terakhir melar atau menyempit tanpa satu pun error, dan begitu
// dicetak lembarnya tak lagi "fit to window".
import { describe, it, expect } from 'vitest'
import { kolomRingkas } from '@/components/pelaporan/LembarRinciPerolehanRingkas'

describe('kolomRingkas — lebar kolom', () => {
  const jenisList = ['hibah_masuk', 'hasil_inventarisasi', 'perolehan_lainnya', 'tukar_menukar']

  it('total lebar TEPAT 100 untuk keempat jenis', () => {
    for (const j of jenisList) {
      const kolom = kolomRingkas(j, new Map())
      expect(kolom, j).not.toBeNull()
      const total = kolom!.reduce((s, k) => s + k.lebar, 0)
      expect(total, j).toBe(100)
    }
  })

  it('sembilan kolom PERTAMA identik urutan & lebarnya di keempat jenis', () => {
    // SubtotalRow/TotalRow di komponen mengasumsikan ini — kalau berubah,
    // colSpan-nya jatuh di kolom yang salah tanpa satu pun error.
    const semua = jenisList.map(j => kolomRingkas(j, new Map())!.slice(0, 9).map(k => ({ key: k.key, lebar: k.lebar })))
    for (const k of semua.slice(1)) expect(k).toEqual(semua[0])
  })

  it('jenis tak dikenal mengembalikan null (jatuh ke lembar official lama)', () => {
    expect(kolomRingkas('entah_apa', new Map())).toBeNull()
  })

  it('setiap jenis punya kunci kolom yang UNIK (tak ada dua kolom sama)', () => {
    for (const j of jenisList) {
      const kolom = kolomRingkas(j, new Map())!
      const kunci = kolom.map(k => k.key)
      expect(new Set(kunci).size, j).toBe(kunci.length)
    }
  })
})
