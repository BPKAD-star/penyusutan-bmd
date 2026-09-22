// ============================================================================
// Mengunci `idsKonsolidasi` (./konsolidasiSkpd.ts) — versi BERSAMA dipakai
// Penyusutan & GIS Tanah (Peta + Daftar Bidang). Kasusnya sengaja kembar dgn
// `app/dashboard/daftar-barang/useFilterDaftarBarang.test.tsx` (versi
// PERTAMA, atas bentuk objek `SelSkpd`) — rumusnya sama, cuma bentuk
// parameternya beda (dua nilai terpisah, bukan satu objek).
// ============================================================================
import { describe, it, expect } from 'vitest'
import { idsKonsolidasi } from './konsolidasiSkpd'

describe('idsKonsolidasi', () => {
  it('konsolidasi=true → descendantIds mentah (subtree penuh) apa adanya', () => {
    expect(idsKonsolidasi(7, [7, 8, 9], true)).toEqual([7, 8, 9])
  })

  it('konsolidasi=false & SKPD terpilih → dipersempit ke SATU id itu', () => {
    expect(idsKonsolidasi(7, [7, 8, 9], false)).toEqual([7])
  })

  it('konsolidasi=false tapi belum pilih SKPD (se-kabupaten) → tak berlaku, tetap null', () => {
    expect(idsKonsolidasi(null, null, false)).toBeNull()
  })

  it('konsolidasi=true tapi belum pilih SKPD → tetap null (tak ada subtree)', () => {
    expect(idsKonsolidasi(null, null, true)).toBeNull()
  })

  it('descendantIds mentah TIDAK ikut berubah — kembali ke konsolidasi memberi hasil semula', () => {
    const desc = [7, 8, 9]
    idsKonsolidasi(7, desc, false)
    expect(desc).toEqual([7, 8, 9])
    expect(idsKonsolidasi(7, desc, true)).toEqual([7, 8, 9])
  })
})
