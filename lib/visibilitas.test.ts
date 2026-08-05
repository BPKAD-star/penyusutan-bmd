// Uji visibilitas aset PERIOD-AWARE (lib/visibilitas.ts).
//
// Aturan pokok yang dikunci di sini (keputusan user 2026-08-05): **peristiwa
// koreksi berlaku SEJAK periodenya, tidak surut.** Barang yang dipecah di
// 2026-S2 harus masih UTUH di 2026-S1 — induknya ada, pecahannya belum.
//
// Kenapa diuji: cacatnya tak bersuara. Waktu pecahan bocor ke periode lampau,
// induk DAN ketujuh pecahannya sama-sama tampil, jadi nilainya kehitung dobel
// di Daftar Barang & Rekonsiliasi BMD — tanpa satu pun pesan error.
import { describe, it, expect } from 'vitest'
import {
  lahirSetelah, tersembunyiPada, belumAdaPada,
  SEMBUNYI_PENYUSUTAN, SEMBUNYI_DAFTAR_BARANG, MUNCUL, LAHIR,
  type EventVisibilitas,
} from '@/lib/visibilitas'

let seq = 0
const ev = (jenis: string, periode: string): EventVisibilitas => ({ id: ++seq, periode, jenis })

// Gabungan ketiga uji, seperti yang dipakai fetchHiddenIds.
const tampil = (evs: EventVisibilitas[], periode: string, tgl: string | null = null,
  sembunyi: readonly string[] = SEMBUNYI_PENYUSUTAN) =>
  !lahirSetelah(evs, periode) && !tersembunyiPada(evs, periode, sembunyi) && !belumAdaPada(tgl, periode)

describe('pemecahan barang — insiden 2026-08-05', () => {
  // Kejadian nyata: Rehab Garasi Grogol (Dinas Koperasi) dipecah jadi 7 lapak
  // pada 27 Juli 2026 = 2026-S2. Pecahannya MEWARISI tgl_perolehan induk
  // (2023-05-03), jadi tanggal saja tak bisa dipakai menilai kapan ia ada.
  const TGL_INDUK = '2023-05-03'
  const pecahan = [ev('pemecahan_masuk', '2026-S2')]
  const induk = [ev('pemecahan_keluar', '2026-S2')]

  it('2026-S1: induk masih UTUH, pecahan BELUM ada', () => {
    expect(tampil(induk, '2026-S1', TGL_INDUK)).toBe(true)
    expect(tampil(pecahan, '2026-S1', TGL_INDUK)).toBe(false)
  })

  it('2026-S2: induk hilang, pecahan muncul', () => {
    expect(tampil(induk, '2026-S2', TGL_INDUK)).toBe(false)
    expect(tampil(pecahan, '2026-S2', TGL_INDUK)).toBe(true)
  })

  it('periode SESUDAHNYA tetap: pecahan ada, induk tidak', () => {
    expect(tampil(pecahan, '2027-S1', TGL_INDUK)).toBe(true)
    expect(tampil(induk, '2027-S1', TGL_INDUK)).toBe(false)
  })

  it('tahun-tahun sebelumnya pun pecahannya tak pernah ada', () => {
    for (const p of ['2023-S1', '2023-S2', '2024-S2', '2025-S2'])
      expect(tampil(pecahan, p, TGL_INDUK), `pecahan bocor ke ${p}`).toBe(false)
  })

  it('tanggal perolehan SAJA tidak cukup — inilah sebab bugnya', () => {
    // Uji lama cuma ini: tgl_perolehan induk 2023 ≤ 2026-S1 → "sudah ada".
    expect(belumAdaPada(TGL_INDUK, '2026-S1')).toBe(false)
    // Yang menyelamatkan justru event kelahirannya.
    expect(lahirSetelah(pecahan, '2026-S1')).toBe(true)
  })

  it('setelah Batal Pemecahan: induk balik, pecahan dibuang', () => {
    const indukBatal = [...induk, ev('batal_pemecahan', '2026-S2')]
    const pecahanBatal = [...pecahan, ev('batal_pemecahan_masuk', '2026-S2')]
    expect(tampil(indukBatal, '2026-S2', TGL_INDUK)).toBe(true)
    expect(tampil(pecahanBatal, '2026-S2', TGL_INDUK)).toBe(false)
    // Pecahan yang dibatalkan tetap tak pernah muncul di periode mana pun.
    expect(tampil(pecahanBatal, '2027-S1', TGL_INDUK)).toBe(false)
  })
})

describe('carve-out KDP (kdp_selesai_masuk) ikut aturan yang sama', () => {
  it('aset tetap hasil carve-out belum ada sebelum BAPP', () => {
    const asetTetap = [ev('kdp_selesai_masuk', '2026-S2')]
    expect(tampil(asetTetap, '2026-S1', '2024-01-10')).toBe(false)
    expect(tampil(asetTetap, '2026-S2', '2024-01-10')).toBe(true)
  })

  it('KDP-nya sendiri hilang dari Daftar Barang sejak carve-out, tapi tidak dari Penyusutan', () => {
    // Perbedaan varian daftar SEMBUNYI ini DISENGAJA & sudah lama begitu —
    // diuji supaya tak "dirapikan" jadi sama tanpa sadar.
    const kdp = [ev('kdp_selesai_keluar', '2026-S2')]
    expect(tersembunyiPada(kdp, '2026-S2', SEMBUNYI_DAFTAR_BARANG)).toBe(true)
    expect(tersembunyiPada(kdp, '2026-S2', SEMBUNYI_PENYUSUTAN)).toBe(false)
  })
})

describe('replay sembunyi/muncul', () => {
  it('penghapusan di semester DEPAN tak menghapus barang dari semester lalu', () => {
    const evs = [ev('penghapusan_sebab_lain', '2026-S2')]
    expect(tersembunyiPada(evs, '2026-S1', SEMBUNYI_PENYUSUTAN)).toBe(false)
    expect(tersembunyiPada(evs, '2026-S2', SEMBUNYI_PENYUSUTAN)).toBe(true)
  })

  it('siklus hapus→batal→hapus dalam SATU periode ikut aksi TERAKHIR (urut id ledger)', () => {
    const evs = [
      ev('penghapusan_sebab_lain', '2026-S2'),
      ev('batal_penghapusan', '2026-S2'),
      ev('penghapusan_sebab_lain', '2026-S2'),
    ]
    expect(tersembunyiPada(evs, '2026-S2', SEMBUNYI_PENYUSUTAN)).toBe(true)
    // Urutan array TIDAK boleh menentukan — yang menentukan periode lalu id.
    expect(tersembunyiPada([...evs].reverse(), '2026-S2', SEMBUNYI_PENYUSUTAN)).toBe(true)
  })

  it('batal SESUDAH hapus memunculkan lagi', () => {
    const evs = [ev('penghapusan_pemindahtanganan', '2026-S1'), ev('batal_penghapusan', '2026-S2')]
    expect(tersembunyiPada(evs, '2026-S1', SEMBUNYI_PENYUSUTAN)).toBe(true)
    expect(tersembunyiPada(evs, '2026-S2', SEMBUNYI_PENYUSUTAN)).toBe(false)
  })
})

describe('lahirSetelah', () => {
  it('tanpa event kelahiran → tak menghalangi (barang perolehan biasa)', () => {
    expect(lahirSetelah([ev('penghapusan_sebab_lain', '2026-S2')], '2026-S1')).toBe(false)
    expect(lahirSetelah([], '2026-S1')).toBe(false)
  })

  it('kalau ada beberapa, yang menentukan kemunculan PALING AWAL', () => {
    const evs = [ev('pemecahan_masuk', '2027-S1'), ev('pemecahan_masuk', '2026-S2')]
    expect(lahirSetelah(evs, '2026-S2')).toBe(false)
    expect(lahirSetelah(evs, '2026-S1')).toBe(true)
  })
})

describe('belumAdaPada', () => {
  it('tanggal perolehan di depan → belum ada', () => {
    expect(belumAdaPada('2026-08-01', '2026-S1')).toBe(true)
    expect(belumAdaPada('2026-06-30', '2026-S1')).toBe(false)
  })

  it('tanpa tanggal → dianggap sudah ada (jangan sembunyikan diam-diam)', () => {
    expect(belumAdaPada(null, '2026-S1')).toBe(false)
    expect(belumAdaPada('', '2026-S1')).toBe(false)
  })
})

describe('daftar jenis ledger', () => {
  it('LAHIR & SEMBUNYI tidak beririsan — satu jenis tak boleh punya dua arti', () => {
    const irisan = LAHIR.filter(j => (SEMBUNYI_DAFTAR_BARANG as readonly string[]).includes(j))
    expect(irisan).toEqual([])
  })

  it('MUNCUL & SEMBUNYI tidak beririsan', () => {
    const irisan = MUNCUL.filter(j => (SEMBUNYI_DAFTAR_BARANG as readonly string[]).includes(j))
    expect(irisan).toEqual([])
  })

  it('varian Daftar Barang = varian Penyusutan + kdp_selesai_keluar, tak lebih', () => {
    const beda = SEMBUNYI_DAFTAR_BARANG.filter(j => !(SEMBUNYI_PENYUSUTAN as readonly string[]).includes(j))
    expect(beda).toEqual(['kdp_selesai_keluar'])
  })
})
