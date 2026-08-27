// Susunan baris lembar LAPORAN BMD format Permendagri 47/2021 — Format IV.L.4.1
// s.d. IV.L.4.4. Keempatnya memakai SUSUNAN BARIS YANG SAMA PERSIS; yang beda
// cuma kolom nilainya & blok tanda tangan:
//
//   IV.L.4.1  Rekapitulasi Mutasi (per SKPD) : Saldo awal · Bertambah · Berkurang · Saldo akhir
//   IV.L.4.2  Laporan BMD          (per SKPD) : Jumlah BMD · Saldo akhir
//   IV.L.4.3  Rekapitulasi Mutasi (se-pemda)  : Saldo awal · Bertambah · Berkurang · Saldo akhir
//   IV.L.4.4  Laporan BMD          (se-pemda) : Jumlah BMD · Saldo akhir
//
// Karena itu daftar barisnya ditulis SEKALI di sini — kalau tiap halaman cetak
// menulis daftarnya sendiri, empat lembar resmi pelan-pelan menyimpang satu
// sama lain dan tak ada satu pun yang gagal saat itu terjadi.
//
// ⚠️ AKUMULASI PENYUSUTAN ADALAH BARIS, BUKAN KOLOM (keputusan user
// 2026-08-26, sesudah menyandingkan dgn lampiran aslinya). Formatnya memuat
// 1.3.7 / 1.5.5 / 1.5.6 sebagai baris tersendiri yang berperan sbg PENGURANG,
// dan kolom "Jumlah BMD"-nya sengaja diisi "–" (akun lawan tak punya jumlah
// unit). Konsekuensinya NILAI BUKU tak perlu kolom sendiri: ia muncul dengan
// sendirinya sebagai subtotal baris kelompok "Aset Tetap" (1.3) & "Aset
// Lainnya" (1.5). Menambahkan kolom Akumulasi/Nilai Buku DI SAMPING baris itu
// membuat angka yang sama tercetak dua kali dalam satu lembar & pembacanya tak
// punya cara tahu mana yang berlaku — jangan dilakukan.
//
// Terbukti foot di data hidup (BKAD 2026-S1 intra, diukur 2026-08-26):
//   Σ(1.3.1..1.3.6) 58.087.419.588 − akum 5.763.186.278 = 52.324.233.310 ✓
//   Σ(1.5.2..1.5.4)  3.349.005.357 − akum 2.477.536.505 =    871.468.852 ✓
import { GOLONGAN_REKAP, perlakuanKode, type Perlakuan } from '@/lib/bmd'
import type { RekapRpcRow } from '@/lib/rekapBmd'

/** Ukuran satu golongan pada satu periode. */
export type UkuranGolongan = { kuantitas: number; perolehan: number; akumulasi: number }
const nol = (): UkuranGolongan => ({ kuantitas: 0, perolehan: 0, akumulasi: 0 })

export type JenisBaris =
  | 'kelompok'   // baris tebal ber-subtotal (Aset Tetap / Aset Lainnya)
  | 'aset'       // golongan biasa — Saldo akhir = nilai perolehan (bruto)
  | 'akumulasi'  // akun lawan — Jumlah BMD "–", nilainya PENGURANG

export type BarisFormat = {
  /** Tiga sub-kolom "Kode Barang". Segmen kosong = sel dibiarkan hampa. */
  kode: [string, string, string]
  nama: string
  jenis: JenisBaris
  /** `aset`: golongan yang diambil angkanya. */
  golongan?: string
  /** `akumulasi`: golongan yang akumulasinya dijumlahkan ke baris ini. */
  sumberAkumulasi?: string[]
  /** `kelompok`: golongan anggota (bruto) & baris akumulasi yang dikurangkan. */
  anggota?: string[]
  anggotaAkumulasi?: string[]
}

/**
 * Golongan yang akumulasinya masuk ke sebuah baris akun lawan — DITURUNKAN dari
 * `perlakuanKode()`, sengaja bukan daftar yang diketik ulang. Pemetaannya
 * kebetulan 1:1 dengan tiga baris akumulasi yang diminta format:
 *   penyusutan (1.3.2/1.3.3/1.3.4) → 1.3.7
 *   amortisasi (1.5.3)             → 1.5.5
 *   lain_lain  (1.5.4)             → 1.5.6
 * Jadi menambah/memindah golongan di GOLONGAN_REKAP otomatis ikut benar di sini.
 */
const golonganBerperlakuan = (p: Perlakuan): string[] =>
  GOLONGAN_REKAP.filter(g => perlakuanKode(g.kode) === p).map(g => g.kode)

const AKUM_TETAP = golonganBerperlakuan('penyusutan')
const AKUM_ATB = golonganBerperlakuan('amortisasi')
const AKUM_LAINNYA = golonganBerperlakuan('lain_lain')

/** Anggota bruto kelompok — golongan aset yang barisnya dicetak di kelompok itu. */
const ANGGOTA_TETAP = ['1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6']
const ANGGOTA_LAINNYA = ['1.5.2', '1.5.3', '1.5.4']

/**
 * Susunan baris lembar, URUT SEPERTI DI LAMPIRAN.
 *
 * ⚠️ `1.1.7 Persediaan` & `1.5.2 Kemitraan dengan Pihak Ketiga` TETAP DICETAK
 * walau aplikasi ini tak punya satu pun asetnya (0 baris, diverifikasi ke DB
 * 2026-08-26) — keputusan user: susunan lembar harus persis format resmi, dan
 * baris yang hadir-tapi-strip memberi tahu penelaah bahwa nilainya memang
 * nihil, bukan kelupaan dicetak. Kalau suatu saat datanya masuk, barisnya
 * langsung terisi tanpa mengubah apa pun di sini.
 *
 * ⚠️ TANDA `*)` DICABUT (keputusan user 2026-08-26). Lampiran aslinya menandai
 * Persediaan & Tanah dgn catatan kaki "tidak berlaku Intrakomptabel/
 * ekstrakomtable"; user memutuskan Tanah tetap diisi penuh di lembar mana pun
 * (Tanah memang tak pernah dipilah intra/ekstra), jadi tandanya tak lagi
 * menerangkan apa pun & catatan kakinya ikut dibuang. Jangan dikembalikan
 * tanpa keputusan baru — tanda yang tak ada akibatnya cuma menimbulkan tanya.
 */
export const BARIS_LAPORAN_BMD: BarisFormat[] = [
  { kode: ['1', '1', '7'], nama: 'Persediaan', jenis: 'aset', golongan: '1.1.7' },

  { kode: ['1', '3', ''], nama: 'Aset Tetap', jenis: 'kelompok', anggota: ANGGOTA_TETAP, anggotaAkumulasi: AKUM_TETAP },
  { kode: ['1', '3', '1'], nama: 'Tanah', jenis: 'aset', golongan: '1.3.1' },
  { kode: ['1', '3', '2'], nama: 'Peralatan dan Mesin', jenis: 'aset', golongan: '1.3.2' },
  { kode: ['1', '3', '3'], nama: 'Gedung dan Bangunan', jenis: 'aset', golongan: '1.3.3' },
  { kode: ['1', '3', '4'], nama: 'Jalan, Jaringan dan Irigasi', jenis: 'aset', golongan: '1.3.4' },
  { kode: ['1', '3', '5'], nama: 'Aset Tetap Lainnya', jenis: 'aset', golongan: '1.3.5' },
  { kode: ['1', '3', '6'], nama: 'Konstruksi Dalam Pengerjaan', jenis: 'aset', golongan: '1.3.6' },
  { kode: ['1', '3', '7'], nama: 'Akumulasi Penyusutan', jenis: 'akumulasi', sumberAkumulasi: AKUM_TETAP },

  { kode: ['1', '5', ''], nama: 'Aset Lainnya', jenis: 'kelompok', anggota: ANGGOTA_LAINNYA, anggotaAkumulasi: [...AKUM_ATB, ...AKUM_LAINNYA] },
  { kode: ['1', '5', '2'], nama: 'Kemitraan dengan Pihak Ketiga', jenis: 'aset', golongan: '1.5.2' },
  { kode: ['1', '5', '3'], nama: 'Aset Tidak Berwujud', jenis: 'aset', golongan: '1.5.3' },
  { kode: ['1', '5', '4'], nama: 'Aset Lain-lain', jenis: 'aset', golongan: '1.5.4' },
  { kode: ['1', '5', '5'], nama: 'Akumulasi Amortisasi Aset Tidak Berwujud', jenis: 'akumulasi', sumberAkumulasi: AKUM_ATB },
  { kode: ['1', '5', '6'], nama: 'Akumulasi Penyusutan Aset Lainnya', jenis: 'akumulasi', sumberAkumulasi: AKUM_LAINNYA },
]

/** Baris RPC `fn_rekap_bmd` → ukuran per golongan (menjumlahkan seluruh SKPD). */
export function ukuranPerGolongan(rows: RekapRpcRow[]): Map<string, UkuranGolongan> {
  const out = new Map<string, UkuranGolongan>()
  for (const r of rows) {
    const c = out.get(r.golongan) ?? nol()
    c.kuantitas += Number(r.kuantitas) || 0
    c.perolehan += Number(r.perolehan) || 0
    c.akumulasi += Number(r.akumulasi) || 0
    out.set(r.golongan, c)
  }
  return out
}

const jumlah = (peta: Map<string, UkuranGolongan>, kode: string[], ambil: (u: UkuranGolongan) => number) =>
  kode.reduce((s, k) => s + (peta.get(k) ? ambil(peta.get(k)!) : 0), 0)

/** Nilai satu baris lembar. `null` = sel dicetak "–" (bukan nol). */
export type NilaiBaris = { jumlahBmd: number | null; saldoAkhir: number | null }

/**
 * Hitung isi satu baris lembar dari peta golongan.
 *
 * ⚠️ Baris `akumulasi` mengembalikan nilai POSITIF; yang membuatnya jadi
 * pengurang adalah cara mencetaknya (dalam kurung) & subtotal kelompok yang
 * MENGURANGKANNYA. Menyimpannya negatif di sini akan membuat subtotal
 * menjumlahkan dua kali negatif tanpa ada yang menyadarinya.
 *
 * Golongan yang tak ada di peta (mis. 1.1.7 Persediaan, 1.5.2 Kemitraan — nol
 * baris di aplikasi ini) mengembalikan `null` → tercetak "–", sengaja DIBEDAKAN
 * dari golongan yang datanya ada tapi kebetulan bernilai 0.
 */
export function nilaiBaris(b: BarisFormat, peta: Map<string, UkuranGolongan>): NilaiBaris {
  if (b.jenis === 'akumulasi') {
    const src = b.sumberAkumulasi ?? []
    const ada = src.some(k => peta.has(k))
    return { jumlahBmd: null, saldoAkhir: ada ? jumlah(peta, src, u => u.akumulasi) : null }
  }
  if (b.jenis === 'kelompok') {
    const bruto = jumlah(peta, b.anggota ?? [], u => u.perolehan)
    const akum = jumlah(peta, b.anggotaAkumulasi ?? [], u => u.akumulasi)
    return {
      jumlahBmd: jumlah(peta, b.anggota ?? [], u => u.kuantitas),
      saldoAkhir: bruto - akum,
    }
  }
  const u = b.golongan ? peta.get(b.golongan) : undefined
  return u ? { jumlahBmd: u.kuantitas, saldoAkhir: u.perolehan } : { jumlahBmd: null, saldoAkhir: null }
}

// ── Format IV.L.4.1 & IV.L.4.3 — Rekapitulasi Mutasi ────────────────────────

/** Angka mutasi satu golongan; ketiganya BRUTO (nilai perolehan). */
export type MutasiGolongan = { saldoAwal: number; penambahan: number; pengurangan: number; saldoAkhir: number }

export type SumberMutasi = {
  /** Per golongan, dari Model 3 — sudah bruto & sudah foot. */
  mutasi: Map<string, MutasiGolongan>
  /** Akumulasi penyusutan/amortisasi pada awal & akhir periode, per golongan. */
  akumAwal: Map<string, number>
  akumAkhir: Map<string, number>
  /** Beban penyusutan periode berjalan, per golongan. */
  beban: Map<string, number>
}

export type NilaiBarisMutasi = {
  saldoAwal: number | null
  penambahan: number | null
  pengurangan: number | null
  saldoAkhir: number | null
}

const jml = (m: Map<string, number>, kode: string[]) =>
  kode.reduce((s, k) => s + (m.get(k) ?? 0), 0)

/**
 * Isi satu baris lembar Rekapitulasi Mutasi (IV.L.4.1 / IV.L.4.3).
 *
 * ⚠️ BARIS AKUMULASI DIISI DI KEEMPAT KOLOM (keputusan user 2026-08-26).
 * Lampiran contohnya menampilkan "–" di Saldo awal/Bertambah/Berkurang, tapi
 * kalau diikuti apa adanya baris subtotal "Aset Tetap" TIDAK FOOT — selisihnya
 * persis sebesar beban penyusutan periode itu, tanpa satu pun baris yang
 * menjelaskan dari mana. Karena itu:
 *
 *     Saldo awal  = akumulasi awal periode
 *     Bertambah   = beban penyusutan periode berjalan
 *     Berkurang   = akumulasi yang LEPAS karena penghapusan/pelepasan
 *                   (diturunkan: awal + beban − akhir)
 *     Saldo akhir = akumulasi akhir periode
 *
 * `Berkurang` sengaja DITURUNKAN, bukan ditarik dari ledger tersendiri: dengan
 * begitu barisnya foot SECARA ALJABAR (awal + tambah − kurang = akhir) apa pun
 * yang terjadi di data, jadi lembar resmi tak mungkin menampilkan penjumlahan
 * yang tak nyambung. Kalau nanti ada jalur ledger khusus untuk pelepasan
 * akumulasi, ia boleh menggantikan turunan ini — TAPI identitas di atas wajib
 * tetap dijaga.
 *
 * ⚠️ Nilai dikembalikan POSITIF; yang membuatnya pengurang adalah cara
 * mencetaknya (dalam kurung) & subtotal kelompok yang MENGURANGKANNYA.
 */
export function nilaiBarisMutasi(b: BarisFormat, s: SumberMutasi): NilaiBarisMutasi {
  if (b.jenis === 'akumulasi') {
    const src = b.sumberAkumulasi ?? []
    if (!src.some(k => s.akumAwal.has(k) || s.akumAkhir.has(k))) {
      return { saldoAwal: null, penambahan: null, pengurangan: null, saldoAkhir: null }
    }
    const awal = jml(s.akumAwal, src)
    const akhir = jml(s.akumAkhir, src)
    const tambah = jml(s.beban, src)
    return { saldoAwal: awal, penambahan: tambah, pengurangan: awal + tambah - akhir, saldoAkhir: akhir }
  }

  if (b.jenis === 'kelompok') {
    const ang = b.anggota ?? []
    const akm = b.anggotaAkumulasi ?? []
    const amb = (f: (m: MutasiGolongan) => number) =>
      ang.reduce((t, k) => t + (s.mutasi.get(k) ? f(s.mutasi.get(k)!) : 0), 0)
    // Subtotal = bruto anggota DIKURANGI baris akumulasi, kolom per kolom —
    // supaya tiap kolom sama dengan hasil menjumlahkan angka yang TERLIHAT di
    // kolom itu, dan Saldo akhir-nya sama persis dgn lembar IV.L.4.2/4.4.
    const akumAwal = jml(s.akumAwal, akm)
    const akumAkhir = jml(s.akumAkhir, akm)
    const akumTambah = jml(s.beban, akm)
    return {
      saldoAwal: amb(m => m.saldoAwal) - akumAwal,
      penambahan: amb(m => m.penambahan) - akumTambah,
      pengurangan: amb(m => m.pengurangan) - (akumAwal + akumTambah - akumAkhir),
      saldoAkhir: amb(m => m.saldoAkhir) - akumAkhir,
    }
  }

  const m = b.golongan ? s.mutasi.get(b.golongan) : undefined
  return m
    ? { saldoAwal: m.saldoAwal, penambahan: m.penambahan, pengurangan: m.pengurangan, saldoAkhir: m.saldoAkhir }
    : { saldoAwal: null, penambahan: null, pengurangan: null, saldoAkhir: null }
}

/** '2026-S1' → { semester: 'I', tahun: '2026' }. */
export function pecahPeriode(p: string): { semester: string; tahun: string } {
  const [th, smt] = (p || '').split('-')
  return { semester: smt === 'S1' ? 'I' : smt === 'S2' ? 'II' : '', tahun: th || '' }
}

/** Judul komptabel di kop lembar. Kosong = gabungan keduanya. */
export function labelKomptabel(k: string): string {
  if (k === 'intra') return 'INTRAKOMPTABEL'
  if (k === 'ekstra') return 'EKSTRAKOMPTABEL'
  return 'INTRAKOMPTABEL DAN EKSTRAKOMPTABEL'
}
