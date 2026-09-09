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

  // ⚠️ Kolom tanggal `whitespace-nowrap` punya BATAS BAWAH KERAS: "25/05/2026"
  // di font 11px butuh ±56px, dan pada F4 lanskap (±1187px bersih) itu ±4,7%.
  // Di bawah itu tanggalnya MELEBER ke sel sebelah DI SETIAP BARIS, dan
  // `table-fixed` menyembunyikannya sampai kertasnya keluar — kelas kegagalan
  // yang sudah dua kali tercatat di CLAUDE.md (IV.B & IV.C).
  it('kolom tanggal tak pernah di bawah 5% (nowrap, batas bawah keras)', () => {
    for (const j of jenisList) {
      for (const k of kolomRingkas(j, new Map())!) {
        if (k.key.startsWith('tgl_')) expect(k.lebar, `${j}/${k.key}`).toBeGreaterThanOrEqual(5)
      }
    }
  })

  // Kode barang (18 karakter) & potongan pertama NIBAR (26 digit) sama-sama
  // wajib muat sebaris di sel bertumpuknya masing-masing.
  it('kolom bertumpuk (kode & spesifikasi/NIBAR) minimal 11%', () => {
    for (const j of jenisList) {
      const kolom = kolomRingkas(j, new Map())!
      expect(kolom[0].lebar, `${j}/kode`).toBeGreaterThanOrEqual(11)
      expect(kolom[1].lebar, `${j}/spek+nibar`).toBeGreaterThanOrEqual(11)
    }
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
