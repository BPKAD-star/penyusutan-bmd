// Uji atribusi Beban & Akumulasi Rekonsiliasi BMD (Fase 3, DECISION-1 = Opsi A).
//
// Kenapa diuji: ini modul PELAPORAN yang angkanya dibawa ke inspektorat/BPK, dan
// kesalahannya tak bersuara — laporan yang salah atribusi tetap tampil rapi.
// Yang diuji cuma logika MURNI (attribusiPenyusutan + aggregateMutasi + rantai
// rekonsiliasinya); kolektor ber-I/O di berkas yang sama tidak, itu lapisan data.
//
// Patokan angkanya = contoh §6 docs/rekonsiliasi-bmd-plan.md, jadi kalau suatu
// saat aturan atribusinya digeser, yang gagal duluan adalah test ini — bukan
// laporan yang sudah terlanjur dikirim.
import { describe, it, expect } from 'vitest'
import {
  attribusiPenyusutan, aggregateMutasi, aggregatePositions,
  type MutasiLine, type MutasiKey, type PosAset, type Komptabel,
} from '@/lib/rekon'

const GOL = '1.3.2'  // Peralatan dan Mesin
const KOMP: Komptabel = 'intra'

const pos = (gol: string, perolehan: number, beban: number, akumulasi: number, komp: Komptabel = KOMP): PosAset =>
  ({ gol, komp, perolehan, beban, akumulasi, nilaiBuku: perolehan - akumulasi })

let seq = 0
function line(kategori: MutasiKey, aset_id: string, nilai: number, opts: { gol?: string; komp?: Komptabel; arah?: 'tambah' | 'kurang' } = {}): MutasiLine {
  const KURANG = ['hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan', 'hapus_sebab_lain',
    'pengalihan_keluar', 'koreksi_kurang', 'reklas_fungsi_keluar', 'reklas_kode_keluar']
  return {
    golongan: opts.gol ?? GOL, komp: opts.komp ?? KOMP, kategori,
    arah: opts.arah ?? (KURANG.includes(kategori) ? 'kurang' : 'tambah'),
    aset_id, nibar: null, kode: `${GOL}.01.01.001`, nama: aset_id,
    skpd_id: 1, tanggal: '2026-08-01', nilai, jenis: kategori, no_dokumen: `DOK-${++seq}`,
    beban: 0, akumulasi: 0,
  }
}

const sel = (m: ReturnType<typeof aggregateMutasi>, k: MutasiKey, gol = GOL, komp: Komptabel = KOMP) =>
  m[gol]?.[komp]?.[k] ?? { perolehan: 0, beban: 0, akumulasi: 0 }

describe('attribusiPenyusutan — contoh §6 rencana (Opsi A)', () => {
  // A lanjut tak berubah · B dibeli di P · C lanjut lalu dikapitalisasi +50 ·
  // D dihapus di P (beban_P 0 karena penyusutannya berhenti).
  const posAwal = new Map<string, PosAset>([
    ['A', pos(GOL, 100, 10, 40)],
    ['C', pos(GOL, 300, 30, 120)],
    ['D', pos(GOL, 80, 10, 30)],
  ])
  const posAkhir = new Map<string, PosAset>([
    ['A', pos(GOL, 100, 10, 50)],
    ['B', pos(GOL, 200, 20, 20)],
    ['C', pos(GOL, 350, 30, 150)],
  ])
  const lines = [
    line('pengadaan', 'B', 200),
    line('kapitalisasi', 'C', 50),
    line('hapus_penjualan', 'D', 80),
  ]
  const atr = attribusiPenyusutan(lines, posAwal, posAkhir)
  const mut = aggregateMutasi(atr.lines)
  const aw = aggregatePositions(posAwal)[GOL][KOMP]
  const ak = aggregatePositions(posAkhir)[GOL][KOMP]

  it('tidak mengubah array masukan (bebas efek samping)', () => {
    expect(lines.every(l => l.beban === 0 && l.akumulasi === 0)).toBe(true)
  })

  it('Saldo Awal & Saldo Akhir sesuai contoh', () => {
    expect(aw.perolehan).toBe(480)
    expect(aw.akumulasi).toBe(190)
    expect(ak.perolehan).toBe(650)
    expect(ak.akumulasi).toBe(220)
    expect(ak.beban).toBe(60)  // total beban periode berjalan
  })

  it('Beban baris SALDO AWAL = beban periode berjalan populasi LANJUT (A+C), bukan beban periode lalu', () => {
    // A(10) + C(30) = 40. D tak ikut: dia keluar, bebannya tidak melekat di sel ini.
    expect(atr.bebanSaldoAwal[GOL][KOMP]).toBe(40)
    // Sengaja dibedakan dari aw.beban (beban periode P−1 = 10+30+10 = 50) —
    // dulu kolom ini memakai angka itu, dan hasilnya kolom Beban tak pernah
    // menjumlah ke beban periode berjalan.
    expect(aw.beban).toBe(50)
  })

  it('OPSI A — baris Kapitalisasi cuma membawa Δ perolehan, beban & akumulasinya NOL', () => {
    expect(sel(mut, 'kapitalisasi')).toEqual({ perolehan: 50, beban: 0, akumulasi: 0 })
  })

  it('barang baru (Pengadaan) membawa beban_P; akumulasinya nol karena seluruh akumulasinya memang dari beban itu', () => {
    expect(sel(mut, 'pengadaan')).toEqual({ perolehan: 200, beban: 20, akumulasi: 0 })
  })

  it('barang keluar membawa −akumulasi periode LALU, bebannya nol', () => {
    expect(sel(mut, 'hapus_penjualan')).toEqual({ perolehan: 80, beban: 0, akumulasi: 30 })
  })

  it('kolom Beban menjumlah tepat ke beban penyusutan periode berjalan', () => {
    const totalBeban = atr.bebanSaldoAwal[GOL][KOMP] + atr.lines.reduce((s, l) => s + l.beban, 0)
    expect(totalBeban).toBe(ak.beban)
  })

  it('rantai Perolehan & Akumulasi tie-out (tak ada selisih)', () => {
    const t = atr.lines.filter(l => l.arah === 'tambah')
    const k = atr.lines.filter(l => l.arah === 'kurang')
    const sum = (rs: MutasiLine[], f: (l: MutasiLine) => number) => rs.reduce((s, l) => s + f(l), 0)

    expect(aw.perolehan + sum(t, l => l.nilai) - sum(k, l => l.nilai)).toBe(ak.perolehan)
    // Akumulasi memuat ΣBeban periode berjalan sbg suku tersendiri (§5.3).
    expect(aw.akumulasi + ak.beban + sum(t, l => l.akumulasi) - sum(k, l => l.akumulasi)).toBe(ak.akumulasi)
  })

  it('Nilai Buku diturunkan, BUKAN dijumlah vertikal — penjumlahan vertikal justru meleset', () => {
    const nbAwal = aw.perolehan - aw.akumulasi          // 290
    const nbTambah = (200 - 0) + (50 - 0)               // 250
    const nbKurang = 80 - 30                            // 50
    expect(nbAwal + nbTambah - nbKurang).toBe(490)      // hasil penjumlahan vertikal
    expect(ak.perolehan - ak.akumulasi).toBe(430)       // yang BENAR (turunan)
  })
})

describe('attribusiPenyusutan — reklasifikasi memindahkan aset antar sel', () => {
  const GOL_LAMA = '1.3.5', GOL_BARU = '1.3.2'
  // R pindah golongan di periode ini: perolehan 100, beban_P 10, akum akhir 60.
  const posAwal = new Map<string, PosAset>([['R', pos(GOL_LAMA, 100, 10, 50)]])
  const posAkhir = new Map<string, PosAset>([['R', pos(GOL_BARU, 100, 10, 60)]])
  const atr = attribusiPenyusutan([
    line('reklas_fungsi_keluar', 'R', 100, { gol: GOL_LAMA }),
    line('reklas_fungsi_masuk', 'R', 100, { gol: GOL_BARU }),
  ], posAwal, posAkhir)
  const mut = aggregateMutasi(atr.lines)

  it('sel ASAL: baris keluar membawa akumulasi lama, bebannya NOL', () => {
    // Kalau beban ikut dihitung di sel asal, rantai akumulasi sel itu kelebihan
    // sebesar beban tsb — aset sudah tak ada di sana pada akhir periode.
    expect(sel(mut, 'reklas_fungsi_keluar', GOL_LAMA)).toEqual({ perolehan: 100, beban: 0, akumulasi: 50 })
    expect(atr.bebanSaldoAwal[GOL_LAMA]).toBeUndefined()
  })

  it('sel TUJUAN: baris masuk membawa beban_P + akumulasi BAWAAN saja', () => {
    // akumulasi bawaan = 60 − 10; bagian beban-nya sudah ada di kolom Beban.
    expect(sel(mut, 'reklas_fungsi_masuk', GOL_BARU)).toEqual({ perolehan: 100, beban: 10, akumulasi: 50 })
  })

  it('beban periode tidak dobel walau asetnya muncul di dua sel', () => {
    const total = atr.lines.reduce((s, l) => s + l.beban, 0)
      + Object.values(atr.bebanSaldoAwal).reduce((s, c) => s + c.intra + c.ekstra, 0)
    expect(total).toBe(10)
  })

  it('rantai akumulasi kedua sel tie-out', () => {
    const awL = aggregatePositions(posAwal)[GOL_LAMA][KOMP]
    const akB = aggregatePositions(posAkhir)[GOL_BARU][KOMP]
    // Sel asal: 50 + beban 0 + masuk 0 − keluar 50 = 0 (aset sudah pindah).
    expect(awL.akumulasi + 0 + 0 - 50).toBe(0)
    // Sel tujuan: 0 + beban 10 + bawaan 50 − 0 = 60.
    expect(0 + akB.beban + 50 - 0).toBe(akB.akumulasi)
  })
})

describe('attribusiPenyusutan — anti-dobel', () => {
  it('satu aset dgn BEBERAPA baris di sel yang sama cuma diatribusi sekali', () => {
    // Kontrak konstruksi 3 termin di periode yang sama → 3 baris 'kdp' utk satu
    // aset KDP. Kalau tiap baris kebagian beban/akumulasi, angkanya 3x lipat.
    const posAwal = new Map<string, PosAset>()
    const posAkhir = new Map<string, PosAset>([['K', pos('1.3.6', 300, 0, 0)]])
    const atr = attribusiPenyusutan([
      line('kdp', 'K', 100, { gol: '1.3.6' }),
      line('kdp', 'K', 100, { gol: '1.3.6' }),
      line('kdp', 'K', 100, { gol: '1.3.6' }),
    ], posAwal, posAkhir)
    const m = aggregateMutasi(atr.lines)
    expect(sel(m, 'kdp', '1.3.6')).toEqual({ perolehan: 300, beban: 0, akumulasi: 0 })
    expect(atr.lines.filter(l => l.akumulasi !== 0 || l.beban !== 0).length).toBeLessThanOrEqual(1)
  })

  it('baris berkategori MASUK menang atas baris pengubah nilai saat rebutan label', () => {
    // Aset masuk lewat pengalihan DAN dikapitalisasi di periode yang sama.
    // Angkanya harus mendarat di baris yang menceritakan perpindahannya, bukan
    // di baris kapitalisasi yang kebetulan diproses lebih dulu.
    const posAwal = new Map<string, PosAset>()
    const posAkhir = new Map<string, PosAset>([['P', pos(GOL, 500, 25, 125)]])
    const atr = attribusiPenyusutan([
      line('kapitalisasi', 'P', 50),
      line('penggunaan_masuk', 'P', 450),
    ], posAwal, posAkhir)
    const m = aggregateMutasi(atr.lines)
    expect(sel(m, 'penggunaan_masuk')).toEqual({ perolehan: 450, beban: 25, akumulasi: 100 })
    expect(sel(m, 'kapitalisasi')).toEqual({ perolehan: 50, beban: 0, akumulasi: 0 })
  })

  it('aset yang TETAP di selnya tak dapat atribusi apa pun dari baris mutasinya', () => {
    const posAwal = new Map<string, PosAset>([['X', pos(GOL, 100, 10, 40)]])
    const posAkhir = new Map<string, PosAset>([['X', pos(GOL, 120, 10, 50)]])
    const atr = attribusiPenyusutan([line('koreksi_tambah', 'X', 20)], posAwal, posAkhir)
    expect(atr.lines[0]).toMatchObject({ beban: 0, akumulasi: 0 })
    expect(atr.bebanSaldoAwal[GOL][KOMP]).toBe(10)
  })

  it('golongan tak disusutkan (Tanah) tetap konsisten: beban & akumulasi nol', () => {
    const posAwal = new Map<string, PosAset>()
    const posAkhir = new Map<string, PosAset>([['T', pos('1.3.1', 1_000_000, 0, 0)]])
    const atr = attribusiPenyusutan([line('hibah', 'T', 1_000_000, { gol: '1.3.1' })], posAwal, posAkhir)
    expect(atr.lines[0]).toMatchObject({ beban: 0, akumulasi: 0 })
  })
})
