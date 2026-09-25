import { describe, expect, it } from 'vitest'
import {
  akhirBulan, beriPeringkat, hitungSkpd, indeksDariSkor, kategoriDariSkor, nilaiDariAngka, ringkasKabupaten,
  nilaiIsianPada, skorIndikator, totalBobot,
  type BarisIsian, type BobotAspek, type Indikator, type NilaiIndikator,
} from './ipa'

// Bobot & indikator PERSIS seperti seed migrasi 20260925_03 (= sheet
// Bobot_Klaster & Bobot_Subindikator di Simulasi_IPA_Kabupaten_Kediri.xlsx).
const BOBOT: BobotAspek = {
  A: { INT: 0.25, KEP: 0.25, AKT: 0.25, LEG: 0.20, EKO: 0.05 },
  B: { INT: 0.20, KEP: 0.25, AKT: 0.25, LEG: 0.15, EKO: 0.15 },
  C: { INT: 0.20, KEP: 0.35, AKT: 0.25, LEG: 0.15, EKO: 0.05 },
  D: { INT: 0.30, KEP: 0.20, AKT: 0.30, LEG: 0.15, EKO: 0.05 },
}
const ind = (kode: string, aspek: Indikator['aspek'], urut: number, bobot: number, cara: Indikator['cara_skor'] = 'rasio'): Indikator => ({
  kode, aspek, urut, bobot, cara_skor: cara, nama: kode, sumber: 'otomatis',
  label_pembilang: '', label_penyebut: '', keterangan: null,
})
const INDIKATOR: Indikator[] = [
  ind('INT_KELENGKAPAN', 'INT', 1, 1),
  ind('KEP_RKBMD', 'KEP', 2, 0.3), ind('KEP_REKON', 'KEP', 3, 0.3), ind('KEP_ENTRY', 'KEP', 4, 0.4),
  ind('AKT_TLBPK', 'AKT', 5, 0.25), ind('AKT_TLINSP', 'AKT', 6, 0.25),
  ind('AKT_TLRB', 'AKT', 7, 0.25), ind('AKT_REALISASI', 'AKT', 8, 0.25),
  ind('LEG_TANAH', 'LEG', 9, 0.5), ind('LEG_PAJAK', 'LEG', 10, 0.5),
  ind('EKO_IDLE', 'EKO', 11, 1, 'target10'),
]
const PARAM = { targetEkoPersen: 10, ambangBobotBerlaku: 70 }
const a = (p: number, q: number): NilaiIndikator => nilaiDariAngka(p, q)

// Baris "PENGELOLA BARANG" (klaster D) di sheet Data_Unit — satu-satunya baris
// nyata yang terisi di berkas simulasi.
const PB: Record<string, NilaiIndikator> = {
  INT_KELENGKAPAN: a(17, 20),
  KEP_RKBMD: a(1, 1), KEP_REKON: a(2, 3), KEP_ENTRY: a(12, 15),
  AKT_TLBPK: a(3, 4), AKT_TLINSP: a(5, 5), AKT_TLRB: a(13, 15), AKT_REALISASI: a(85_000_000, 150_000_000),
  LEG_TANAH: a(13, 15), LEG_PAJAK: a(19, 20),
  EKO_IDLE: a(85_000_000, 1_500_000_000),
}

describe('hitungSkpd — sama dgn Excel Skor_Akhir', () => {
  const h = hitungSkpd({ skpdId: 1, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, nilai: PB, parameter: PARAM })
  const aspek = (k: string) => h.aspek.find(x => x.kode === k)!.skor!

  it('skor aspek', () => {
    expect(aspek('INT')).toBeCloseTo(85, 6)
    expect(aspek('KEP')).toBeCloseTo(100 * 0.3 + (200 / 3) * 0.3 + 80 * 0.4, 6) // 82
    expect(aspek('AKT')).toBeCloseTo((75 + 100 + 1300 / 15 + 8500 / 150) / 4, 6)
    expect(aspek('LEG')).toBeCloseTo((1300 / 15 + 95) / 2, 6)
    // 85jt / 1,5M = 5,667% → 100 − (10 − 5,667)×10 = 56,667 (sama dgn Excel)
    expect(aspek('EKO')).toBeCloseTo(100 - (10 - 85 / 15) * 10, 6)
  })

  it('skor akhir, indeks, kategori', () => {
    expect(h.skor).toBeCloseTo(82.2333, 3)
    expect(h.indeks).toBeCloseTo(3.467, 3)
    expect(h.kategori).toBe('Baik')
    expect(h.bobotBerlaku).toBeCloseTo(1, 9)
    expect(h.layakRanking).toBe(true)
  })
})

describe('N/A vs belum diisi', () => {
  it('N/A: bobot dialihkan ke indikator lain di aspek yang sama, tetap layak ranking', () => {
    const h = hitungSkpd({
      skpdId: 1, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
      nilai: { ...PB, LEG_TANAH: { status: 'na' } },
    })
    expect(h.aspek.find(x => x.kode === 'LEG')!.skor).toBeCloseTo(95, 6)
    expect(h.layakRanking).toBe(true)
  })

  it('aspek N/A seluruhnya: bobot berlaku turun', () => {
    const h = hitungSkpd({
      skpdId: 1, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
      nilai: { ...PB, EKO_IDLE: { status: 'na' } },
    })
    expect(h.bobotBerlaku).toBeCloseTo(0.95, 9)
    expect(h.layakRanking).toBe(true)
  })

  it('BELUM diisi: tidak dihitung, tapi SKPD keluar dari ranking (celah "kosongkan biar untung" ditutup)', () => {
    const h = hitungSkpd({
      skpdId: 1, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
      nilai: { ...PB, AKT_TLBPK: { status: 'belum' } },
    })
    expect(h.jumlahBelum).toBe(1)
    expect(h.layakRanking).toBe(false)
    expect(h.aspek.find(x => x.kode === 'AKT')!.adaBelum).toBe(true)
  })

  it('bobot berlaku di bawah ambang → tak layak ranking', () => {
    const h = hitungSkpd({
      skpdId: 1, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
      nilai: { ...PB, INT_KELENGKAPAN: { status: 'na' }, AKT_TLBPK: { status: 'na' }, AKT_TLINSP: { status: 'na' },
        AKT_TLRB: { status: 'na' }, AKT_REALISASI: { status: 'na' } },
    })
    expect(h.bobotBerlaku).toBeCloseTo(0.4, 9)
    expect(h.layakRanking).toBe(false)
  })

  it('tak ada data sama sekali → skor null, bukan 0', () => {
    const h = hitungSkpd({ skpdId: 1, klaster: 'A', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM, nilai: {} })
    expect(h.skor).toBeNull()
    expect(h.kategori).toBeNull()
    expect(h.jumlahBelum).toBe(11)
  })

  it('nilaiDariAngka: penyebut 0 = N/A, null = belum', () => {
    expect(nilaiDariAngka(0, 0).status).toBe('na')
    expect(nilaiDariAngka(null, 5).status).toBe('belum')
    expect(nilaiDariAngka(3, 5).status).toBe('ada')
  })
})

describe('skorIndikator', () => {
  it('rasio dibatasi 100 (realisasi > rencana tak menggelembungkan aspek)', () => {
    expect(skorIndikator(a(150, 100), 'rasio', PARAM)).toBe(100)
  })
  it('ekonomi: ≥ target = 100 (keputusan user), di bawah target −10/1%', () => {
    expect(skorIndikator(a(20, 100), 'target10', PARAM)).toBe(100)
    expect(skorIndikator(a(10, 100), 'target10', PARAM)).toBe(100)
    expect(skorIndikator(a(7, 100), 'target10', PARAM)).toBeCloseTo(70, 9)
    expect(skorIndikator(a(0, 100), 'target10', PARAM)).toBe(0)
  })
})

describe('indeks & kategori (skala 1–4)', () => {
  it('reskala linear', () => {
    expect(indeksDariSkor(0)).toBe(1)
    expect(indeksDariSkor(100)).toBe(4)
  })
  it('ambang = Excel (85/70/55 ≡ 3,55/3,10/2,65)', () => {
    expect(kategoriDariSkor(85)).toBe('Sangat Baik')
    expect(kategoriDariSkor(84.99)).toBe('Baik')
    expect(kategoriDariSkor(70)).toBe('Baik')
    expect(kategoriDariSkor(55)).toBe('Buruk')
    expect(kategoriDariSkor(54.99)).toBe('Sangat Buruk')
    expect(indeksDariSkor(85)).toBeCloseTo(3.55, 9)
    expect(indeksDariSkor(70)).toBeCloseTo(3.1, 9)
    expect(indeksDariSkor(55)).toBeCloseTo(2.65, 9)
  })
})

describe('beriPeringkat — per klaster', () => {
  const buat = (id: number, klaster: 'A' | 'D', skorInt: number, lengkap = true) =>
    hitungSkpd({
      skpdId: id, klaster, indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
      nilai: { ...PB, INT_KELENGKAPAN: a(skorInt, 100), ...(lengkap ? {} : { AKT_TLBPK: { status: 'belum' } as NilaiIndikator }) },
    })
  it('kecamatan dibandingkan dgn kecamatan; seri = peringkat sama; tak lengkap = tanpa peringkat', () => {
    const hasil = beriPeringkat([buat(1, 'A', 90), buat(2, 'A', 50), buat(3, 'A', 90), buat(4, 'D', 10), buat(5, 'A', 99, false)])
    const p = (id: number) => hasil.find(h => h.skpdId === id)!.peringkat
    expect(p(1)).toBe(1)
    expect(p(3)).toBe(1)
    expect(p(2)).toBe(3)
    expect(p(4)).toBe(1)
    expect(p(5)).toBeNull()
  })
})

describe('nilaiIsianPada — capaian bulanan', () => {
  const baris: BarisIsian[] = [
    { indikator: 'AKT_TLBPK', tidak_ada: false, pembilang: 1, penyebut: 4, tanggal_capaian: '2026-02-10', status: 'diverifikasi', created_at: '2026-02-10T01:00:00Z' },
    { indikator: 'AKT_TLBPK', tidak_ada: false, pembilang: 3, penyebut: 4, tanggal_capaian: '2026-05-02', status: 'diverifikasi', created_at: '2026-05-02T01:00:00Z' },
    { indikator: 'AKT_TLBPK', tidak_ada: false, pembilang: 4, penyebut: 4, tanggal_capaian: '2026-06-01', status: 'diajukan', created_at: '2026-06-01T01:00:00Z' },
  ]
  it('memakai capaian terverifikasi terakhir s.d. akhir bulan', () => {
    expect(nilaiIsianPada(baris, 'AKT_TLBPK', akhirBulan(2026, 1))).toEqual({ status: 'belum' })
    expect(nilaiIsianPada(baris, 'AKT_TLBPK', akhirBulan(2026, 3))).toEqual({ status: 'ada', pembilang: 1, penyebut: 4 })
    // Juni: baris 4/4 masih diajukan → belum dihitung
    expect(nilaiIsianPada(baris, 'AKT_TLBPK', akhirBulan(2026, 6))).toEqual({ status: 'ada', pembilang: 3, penyebut: 4 })
  })
  it('"tidak ada temuan" = N/A', () => {
    const b: BarisIsian[] = [{ indikator: 'AKT_TLINSP', tidak_ada: true, pembilang: null, penyebut: null, tanggal_capaian: '2026-01-05', status: 'diverifikasi', created_at: '2026-01-05T00:00:00Z' }]
    expect(nilaiIsianPada(b, 'AKT_TLINSP', '2026-12-31')).toEqual({ status: 'na' })
  })
  it('akhirBulan bebas zona waktu & tahun kabisat', () => {
    expect(akhirBulan(2028, 2)).toBe('2028-02-29')
    expect(akhirBulan(2026, 12)).toBe('2026-12-31')
  })
})

describe('totalBobot', () => {
  it('seed tiap klaster = 100%', () => {
    for (const k of ['A', 'B', 'C', 'D'] as const) expect(totalBobot(Object.values(BOBOT[k]))).toBe(1)
  })
})

describe('ringkasKabupaten', () => {
  const buat = (id: number, skorInt: number | null) => hitungSkpd({
    skpdId: id, klaster: 'D', indikator: INDIKATOR, bobotAspek: BOBOT, parameter: PARAM,
    nilai: skorInt == null ? {} : { ...PB, INT_KELENGKAPAN: a(skorInt, 100) },
  })
  it('rata-rata skor SKPD yang punya skor; SKPD tanpa data tak ikut dirata-rata', () => {
    const h = [buat(1, 100), buat(2, 0), buat(3, null)]
    const r = ringkasKabupaten(h)
    const skorRata = (h[0].skor! + h[1].skor!) / 2
    expect(r.indeks).toBeCloseTo(indeksDariSkor(skorRata), 9)
    expect(r.kategori).toBe(kategoriDariSkor(skorRata))
    expect(r.total).toBe(3)
    expect(r.lengkap).toBe(2)
  })
  it('tak satu pun berskor → null, bukan indeks 1', () => {
    expect(ringkasKabupaten([buat(1, null)])).toMatchObject({ indeks: null, kategori: null })
  })
})
