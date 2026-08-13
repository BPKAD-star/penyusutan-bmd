// Uji `pindahAktif` (lib/pengalihan.ts) — "barang mana yang SAAT INI sedang
// berpindah karena jenis X", angka kartu Mutasi & Transfer di Dashboard.
//
// Kenapa diuji: cacatnya tak bersuara — kartunya cuma menampilkan angka yang
// lebih kecil dari kenyataan, dan tak ada yang bisa membuktikan salahnya tanpa
// menghitung manual di ledger. Insiden 2026-08-13: Transfer Keluar/Masuk SKPD
// menampilkan 51 padahal 57 barang benar-benar berpindah.
import { describe, it, expect } from 'vitest'
import { pindahAktif, type Ev, type PindahEvents } from '@/lib/pengalihan'

let seq = 0
const ev = (jenis: string, periode: string, asal: number, tujuan: number,
  payload: Ev['payload'] = null): Ev => ({
  aset_id: 'x', id: ++seq, periode, jenis, skpd_asal: asal, skpd_tujuan: tujuan,
  nilai: 1_000_000, payload,
})
const map = (...evs: Ev[][]): PindahEvents =>
  new Map(evs.map((e, i) => [`aset-${i}`, e.map(r => ({ ...r, aset_id: `aset-${i}` }))]))

describe('pindahAktif — insiden 2026-08-13 (51 vs 57)', () => {
  // Kejadian nyata: 6 barang Dinas Perumahan (7) → Sekretariat Daerah (26) pada
  // 2026-S1, lalu dimutasi-internal ke Bagian Umum (187) di bawah Setda. Versi
  // lama menilai "masih berpindah?" dgn membandingkan aset.skpd_id (187) vs
  // skpd_tujuan baris pengalihan (26) → tidak sama → keenamnya hilang dari
  // hitungan, padahal pengalihannya jelas masih berlaku.
  const berlapis = [
    ev('pengalihan_status', '2026-S1', 7, 26),
    ev('mutasi_internal', '2026-S2', 26, 187),
  ]

  it('pengalihan tetap terhitung walau barangnya lalu dimutasi ke sub-unit', () => {
    expect(pindahAktif(map(berlapis), 'pengalihan_status').size).toBe(1)
  })

  it('mutasi internalnya terhitung sendiri, bukan menggantikan pengalihannya', () => {
    expect(pindahAktif(map(berlapis), 'mutasi_internal').size).toBe(1)
  })
})

describe('pindahAktif — yang TIDAK boleh terhitung', () => {
  it('barang yang sudah dikembalikan (payload.reversal) tak terhitung', () => {
    // 2 baris warisan di ledger (id 9658 & 9679, Juli 2026): pembuatnya sudah
    // dicabut, pembacanya wajib tetap ada.
    const pulang = [
      ev('pengalihan_status', '2026-S1', 7, 26),
      ev('pengalihan_status', '2026-S2', 26, 7, { reversal: true }),
    ]
    expect(pindahAktif(map(pulang), 'pengalihan_status').size).toBe(0)
  })

  it('aset tanpa baris jenis itu sama sekali tak terhitung', () => {
    const cuma = [ev('mutasi_internal', '2026-S1', 26, 187)]
    expect(pindahAktif(map(cuma), 'pengalihan_status').size).toBe(0)
  })

  // Pembatalan (`batal_pengalihan`) TIDAK diurus di sini — fetchPindahEvents
  // sudah membuang baris target berikut baris pembatalnya, dan aset yang
  // seluruh baris pindahnya dibatalkan dikeluarkan dari map. Uji itu ada di
  // buangYangDibatalkan; yang dikunci di sini cukup: map tanpa aset itu = 0.
  it('aset yang hilang dari map (semua baris pindahnya dibatalkan) = 0', () => {
    expect(pindahAktif(new Map(), 'pengalihan_status').size).toBe(0)
  })
})

describe('pindahAktif — yang berlaku adalah baris TERAKHIR', () => {
  it('pindah, dikembalikan, lalu dipindah lagi → terhitung', () => {
    const bolak = [
      ev('pengalihan_status', '2026-S1', 7, 26),
      ev('pengalihan_status', '2026-S1', 26, 7, { reversal: true }),
      ev('pengalihan_status', '2026-S2', 7, 30),
    ]
    const aktif = pindahAktif(map(bolak), 'pengalihan_status')
    expect(aktif.size).toBe(1)
    expect([...aktif.values()][0].skpd_tujuan).toBe(30)
  })

  it('urutan baris di array tidak menentukan — periode lalu id yang menentukan', () => {
    const acak = [
      ev('pengalihan_status', '2026-S2', 7, 30),
      ev('pengalihan_status', '2026-S1', 7, 26),
    ]
    expect([...pindahAktif(map(acak), 'pengalihan_status').values()][0].skpd_tujuan).toBe(30)
  })
})
