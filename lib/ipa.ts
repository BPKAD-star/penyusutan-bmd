// ============================================================================
// IPA — Indeks Pengelolaan Aset, kerangka LIMA ASPEK (keputusan user
// 2026-09-25, menggantikan versi Kepmen ST1–ST4). Sumber rumusnya berkas kerja
// "Simulasi_IPA_Kabupaten_Kediri.xlsx"; tabel & angka dasarnya di migrasi
// 20260925_03.
//
// MURNI: nol I/O. Semua angka masuk dari luar (lib/ipaData.ts), supaya
// seluruh aturan penilaian bisa diuji tanpa database (lib/ipa.test.ts).
//
// ALUR HITUNG (sama dgn Excel, dgn tiga beda yang DISENGAJA — lihat bawah):
//   1. skor indikator 0–100 = pembilang/penyebut × 100
//   2. skor aspek = rata-rata terbobot indikator di aspek itu; indikator N/A
//      dikeluarkan & bobotnya dibagi ulang proporsional
//   3. skor akhir = rata-rata terbobot aspek (bobot per KLASTER SKPD), aspek
//      N/A dikeluarkan dgn cara yang sama; "bobot berlaku" = Σ bobot aspek
//      yang ikut terhitung
//   4. indeks = 1 + skor/100 × 3 (skala 1–4)
//
// TIGA BEDA DARI EXCEL (semuanya keputusan user atau penutup celah):
//   (a) "BELUM DIISI" ≠ N/A. Di Excel penyebut kosong = N/A → bobotnya
//       dialihkan, jadi SKPD yang TIDAK mengisi justru untung. Di sini indikator
//       yang belum diisi/terverifikasi juga dikeluarkan dari skor, TAPI SKPD
//       itu ditandai "belum lengkap" & TIDAK ikut ranking. N/A cuma lahir dari
//       pernyataan eksplisit ("tidak ada temuan") atau data yang memang nol
//       (tak punya tanah, tak ada BAST).
//   (b) EKONOMI: rasio ≥ target → 100 (Excel menghukum yang melebihi target).
//   (c) Skor indikator DIBATASI 100 — di Excel realisasi > rencana bisa
//       menghasilkan skor > 100 dan menggelembungkan aspeknya.
// ============================================================================

export type KodeAspek = 'INT' | 'KEP' | 'AKT' | 'LEG' | 'EKO'
export type KodeKlaster = 'A' | 'B' | 'C' | 'D'
export type SumberIndikator = 'otomatis' | 'isian' | 'rekon' | 'pajak'
export type CaraSkor = 'rasio' | 'target10'
export type StatusIsian = 'diajukan' | 'diverifikasi' | 'ditolak'

export const ASPEK_URUT: KodeAspek[] = ['INT', 'KEP', 'AKT', 'LEG', 'EKO']
export const KLASTER_URUT: KodeKlaster[] = ['A', 'B', 'C', 'D']

export type Aspek = { kode: KodeAspek; nama: string; urut: number }
export type Indikator = {
  kode: string
  aspek: KodeAspek
  nama: string
  urut: number
  sumber: SumberIndikator
  cara_skor: CaraSkor
  bobot: number
  label_pembilang: string
  label_penyebut: string
  keterangan: string | null
}
/** klaster → aspek → bobot (0..1). */
export type BobotAspek = Record<KodeKlaster, Record<KodeAspek, number>>

export type Parameter = {
  targetEkoPersen: number
  ambangBobotBerlaku: number // persen, mis. 70
}

// ── Nilai masukan satu indikator ────────────────────────────────────────────
/**
 * `ada`   = punya pembilang & penyebut (> 0)
 * `na`    = memang tak berlaku (penyebut 0 dari data, atau "tidak ada temuan")
 * `belum` = belum dihitung / belum ada isian terverifikasi
 */
export type NilaiIndikator =
  | { status: 'ada'; pembilang: number; penyebut: number }
  | { status: 'na' }
  | { status: 'belum' }

export function nilaiDariAngka(pembilang: number | null | undefined, penyebut: number | null | undefined): NilaiIndikator {
  if (pembilang == null || penyebut == null) return { status: 'belum' }
  if (!(penyebut > 0)) return { status: 'na' }
  return { status: 'ada', pembilang, penyebut }
}

// ── 1. Skor indikator ───────────────────────────────────────────────────────
export function skorIndikator(n: NilaiIndikator, cara: CaraSkor, p: Pick<Parameter, 'targetEkoPersen'>): number | null {
  if (n.status !== 'ada') return null
  const persen = (n.pembilang / n.penyebut) * 100
  if (cara === 'target10') {
    // ≥ target → 100; di bawahnya berkurang 10 poin per 1% kekurangan.
    if (persen >= p.targetEkoPersen) return 100
    return Math.max(0, 100 - (p.targetEkoPersen - persen) * 10)
  }
  return Math.min(100, Math.max(0, persen))
}

// ── 2–4. Hitung satu SKPD ───────────────────────────────────────────────────
export type HasilIndikator = {
  kode: string
  nilai: NilaiIndikator
  skor: number | null
}
export type HasilAspek = {
  kode: KodeAspek
  skor: number | null
  bobot: number
  /** Ada indikator di aspek ini yang belum diisi/dihitung. */
  adaBelum: boolean
}
export type KategoriIndeks = 'Sangat Baik' | 'Baik' | 'Buruk' | 'Sangat Buruk'
export type HasilSkpd = {
  skpdId: number
  klaster: KodeKlaster
  indikator: HasilIndikator[]
  aspek: HasilAspek[]
  bobotBerlaku: number // 0..1
  skor: number | null // 0..100
  indeks: number | null // 1..4
  kategori: KategoriIndeks | null
  /** Jumlah indikator yang belum diisi / belum dihitung. */
  jumlahBelum: number
  /** Boleh ikut ranking: tak ada yang belum & bobot berlaku ≥ ambang. */
  layakRanking: boolean
  peringkat: number | null
}

/** Rata-rata terbobot atas entri yang skornya ada; null bila tak satu pun. */
export function rataTerbobot(entri: { skor: number | null; bobot: number }[]): { nilai: number | null; bobotAda: number } {
  let jumlah = 0
  let bobotAda = 0
  for (const e of entri) {
    if (e.skor == null) continue
    jumlah += e.skor * e.bobot
    bobotAda += e.bobot
  }
  return { nilai: bobotAda > 0 ? jumlah / bobotAda : null, bobotAda }
}

export function indeksDariSkor(skor: number): number {
  return 1 + (skor / 100) * 3
}

/**
 * Ambang disamakan dgn Excel (skor 85/70/55 ≡ indeks 3,55/3,10/2,65) supaya
 * label tak pernah bertentangan dgn skornya. Dibandingkan pada SKOR, bukan
 * indeks yang sudah dibulatkan — pembulatan bisa memindah SKPD antar kategori.
 */
export function kategoriDariSkor(skor: number): KategoriIndeks {
  if (skor >= 85) return 'Sangat Baik'
  if (skor >= 70) return 'Baik'
  if (skor >= 55) return 'Buruk'
  return 'Sangat Buruk'
}

export function hitungSkpd(args: {
  skpdId: number
  klaster: KodeKlaster
  indikator: Indikator[]
  bobotAspek: BobotAspek
  nilai: Record<string, NilaiIndikator>
  parameter: Parameter
}): HasilSkpd {
  const { skpdId, klaster, indikator, bobotAspek, nilai, parameter } = args
  const hasilInd: HasilIndikator[] = [...indikator]
    .sort((a, b) => a.urut - b.urut)
    .map(ind => {
      const n = nilai[ind.kode] ?? { status: 'belum' as const }
      return { kode: ind.kode, nilai: n, skor: skorIndikator(n, ind.cara_skor, parameter) }
    })

  const aspek: HasilAspek[] = ASPEK_URUT.map(kode => {
    const milik = indikator.filter(i => i.aspek === kode)
    const skor = rataTerbobot(milik.map(i => ({
      skor: hasilInd.find(h => h.kode === i.kode)?.skor ?? null,
      bobot: i.bobot,
    }))).nilai
    return {
      kode,
      skor,
      bobot: bobotAspek[klaster]?.[kode] ?? 0,
      adaBelum: milik.some(i => (nilai[i.kode]?.status ?? 'belum') === 'belum'),
    }
  })

  const akhir = rataTerbobot(aspek)
  const jumlahBelum = hasilInd.filter(h => h.nilai.status === 'belum').length
  const skor = akhir.nilai
  return {
    skpdId,
    klaster,
    indikator: hasilInd,
    aspek,
    bobotBerlaku: akhir.bobotAda,
    skor,
    indeks: skor == null ? null : indeksDariSkor(skor),
    kategori: skor == null ? null : kategoriDariSkor(skor),
    jumlahBelum,
    layakRanking: skor != null && jumlahBelum === 0 && akhir.bobotAda * 100 >= parameter.ambangBobotBerlaku - 1e-9,
    peringkat: null,
  }
}

/**
 * Peringkat DI DALAM klaster — kecamatan dibandingkan dgn kecamatan. Skor sama
 * → peringkat sama (pola COUNTIFS di Excel: 1 + jumlah yang lebih tinggi).
 * Yang tak layak ranking tetap null.
 */
export function beriPeringkat(hasil: HasilSkpd[]): HasilSkpd[] {
  return hasil.map(h => {
    if (!h.layakRanking || h.skor == null) return { ...h, peringkat: null }
    const lebihTinggi = hasil.filter(o =>
      o.klaster === h.klaster && o.layakRanking && o.skor != null && o.skor > h.skor! + 1e-9).length
    return { ...h, peringkat: lebihTinggi + 1 }
  })
}

// ── Isian SKPD: baris terverifikasi terakhir yang berlaku per tanggal ───────
export type BarisIsian = {
  indikator: string
  tidak_ada: boolean
  pembilang: number | null
  penyebut: number | null
  tanggal_capaian: string // YYYY-MM-DD
  status: StatusIsian
  created_at: string
}

/**
 * Capaian yang BERLAKU per akhir bulan tertentu: baris terverifikasi dgn
 * tanggal capaian ≤ batas, yang paling akhir (tanggal, lalu waktu input).
 * Yang masih diajukan / ditolak tak pernah dihitung.
 */
export function nilaiIsianPada(baris: BarisIsian[], indikator: string, batas: string): NilaiIndikator {
  const kandidat = baris
    .filter(b => b.indikator === indikator && b.status === 'diverifikasi' && b.tanggal_capaian <= batas)
    .sort((a, b) => a.tanggal_capaian === b.tanggal_capaian
      ? a.created_at.localeCompare(b.created_at)
      : a.tanggal_capaian.localeCompare(b.tanggal_capaian))
  const akhir = kandidat[kandidat.length - 1]
  if (!akhir) return { status: 'belum' }
  if (akhir.tidak_ada) return { status: 'na' }
  return nilaiDariAngka(akhir.pembilang, akhir.penyebut)
}

/** 'YYYY-MM-DD' hari terakhir bulan itu — diurai manual, bebas zona waktu. */
export function akhirBulan(tahun: number, bulan: number): string {
  const hari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate()
  return `${tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
}

export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember']

// ── Tampilan ────────────────────────────────────────────────────────────────
export const WARNA_KATEGORI: Record<KategoriIndeks, string> = {
  'Sangat Baik': 'bg-emerald-100 text-emerald-800',
  'Baik': 'bg-sky-100 text-sky-800',
  'Buruk': 'bg-amber-100 text-amber-800',
  'Sangat Buruk': 'bg-red-100 text-red-800',
}

export const LABEL_SUMBER: Record<SumberIndikator, string> = {
  otomatis: 'Otomatis dari data aplikasi',
  isian: 'Diisi SKPD, diverifikasi Pengelola Barang',
  rekon: 'Periode Admin + pelaksanaan diisi SKPD',
  pajak: 'Bukti pajak per kendaraan',
}

/** Bobot tiap klaster / aspek WAJIB 100% — dicek di layar Pengaturan. */
export function totalBobot(nilai: number[]): number {
  return Math.round(nilai.reduce((s, x) => s + x, 0) * 10000) / 10000
}
