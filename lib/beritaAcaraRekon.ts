// ============================================================================
// Berita Acara Rekonsiliasi BMD — Format V.2 Permendagri 47/2021.
//
// Bagian MURNI (tanpa I/O) dari fitur "Cetak BA Rekon" di menu Rekonsiliasi BMD.
// Angkanya TIDAK dihitung di sini: ia datang apa adanya dari state halaman
// Rekonsiliasi (`snapAwal`, `snapAkhir`, `mutasi`) supaya lembar yang
// ditandatangani mustahil berbeda dari angka yang barusan diproses di layar —
// alasan yang sama dgn "Export PDF = window.print() halaman itu sendiri"
// (CLAUDE.md). Modul ini cuma MENYUSUN ULANG angka itu ke dalam susunan baris
// yang diminta Permendagri.
//
// ⚠️ PEMETAAN KATEGORI → BARIS FORMAT ADALAH ATURAN INTEGRITAS, bukan tata
// letak. Format V.2 punya daftar baris yang TETAP (Cara Perolehan a–j,
// Penggunaan, internal, reklasifikasi, Koreksi, Penghapusan a–f) sementara
// aplikasi ini punya 27 `MutasiKey`. Kategori yang lupa dipetakan tidak
// menghasilkan satu pun error — ia cuma HILANG dari lembar bertanda tangan,
// dan jumlah Tambah/Kurang-nya diam-diam kurang. Karena itu:
//   · pemetaannya ditulis sebagai `Record<MutasiKey, …>` LENGKAP → TypeScript
//     menolak `MutasiKey` baru yang belum diberi rumah;
//   · dikunci `lib/beritaAcaraRekon.test.ts` (tiap kategori dipakai TEPAT
//     sekali — bukan cuma "ada", supaya salah tempel tidak bikin dobel).
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { measuresOf, KURANG_KEYS, type Komptabel, type Mutasi, type MutasiKey, type Snapshot } from '@/lib/rekon'
import { paginate } from '@/shared/db/paginate'

// ── Varian rekonsiliasi (4 pasangan pihak, permintaan user 2026-08-26) ───────
// Angkanya SAMA untuk keempatnya — yang berbeda cuma siapa yang duduk sebagai
// PIHAK PERTAMA/KEDUA dan judul kolom nilainya. Dijadikan data, bukan empat
// halaman cetak yang saling menyalin.
export type VarianBA =
  | 'pembantu_pengguna'
  | 'pengguna_pengelola'
  | 'pengguna_akuntansi_skpd'
  | 'pengelola_akuntansi_pemda'

export type PeranBA = {
  /** Kalimat "Dalam hal ini bertindak sebagai …" di lembar depan. */
  sebagai: string
  /** `role_bmd` di `admin_pegawai` yang paling mungkin — dipakai SEBAGAI SARAN
   *  awal di pop-up, bukan penyaring. `null` = tak ada padanannya di master
   *  pegawai (Pelaksana Fungsi Akuntansi tidak terdaftar sebagai role BMD),
   *  jadi operator memilih sendiri. */
  roleBmd: string | null
  /** true = dicari lebih dulu di SKPD terpilih & turunannya; false = se-kabupaten. */
  diSkpd: boolean
}

export type VarianInfo = {
  value: VarianBA
  label: string
  pertama: PeranBA
  kedua: PeranBA
  /** Judul kolom (11) di lampiran — Format V.2: "Laporan BMD Pengguna Barang (Rp)". */
  kolomNilai: string
  /** true = lembar milik SATU SKPD (kop suratnya menyebut SKPD itu), jadi
   *  filter SKPD di halaman Rekonsiliasi WAJIB terisi. */
  perSkpd: boolean
}

export const VARIAN_BA: VarianInfo[] = [
  {
    value: 'pembantu_pengguna',
    label: 'Pengurus Barang Pembantu ↔ Pengurus Barang Pengguna',
    pertama: { sebagai: 'Pengurus Barang Pembantu', roleBmd: 'pengurus_barang_pembantu', diSkpd: true },
    kedua: { sebagai: 'Pengurus Barang Pengguna', roleBmd: 'pengurus_barang', diSkpd: true },
    kolomNilai: 'Laporan BMD Pengurus Barang Pembantu (Rp)',
    perSkpd: true,
  },
  {
    value: 'pengguna_pengelola',
    label: 'Pengurus Barang Pengguna ↔ Pengurus Barang Pengelola',
    pertama: { sebagai: 'Pengurus Barang Pengguna', roleBmd: 'pengurus_barang', diSkpd: true },
    kedua: { sebagai: 'Pengurus Barang Pengelola', roleBmd: 'pengurus_barang_pengelola', diSkpd: false },
    kolomNilai: 'Laporan BMD Pengguna Barang (Rp)',
    perSkpd: true,
  },
  {
    value: 'pengguna_akuntansi_skpd',
    label: 'Pengurus Barang Pengguna ↔ Pelaksana Akuntansi SKPD',
    pertama: { sebagai: 'Pengurus Barang Pengguna', roleBmd: 'pengurus_barang', diSkpd: true },
    kedua: { sebagai: 'Pelaksana Fungsi Akuntansi SKPD', roleBmd: null, diSkpd: true },
    kolomNilai: 'Laporan BMD Pengguna Barang (Rp)',
    perSkpd: true,
  },
  {
    value: 'pengelola_akuntansi_pemda',
    label: 'Pengurus Barang Pengelola ↔ Pelaksana Akuntansi Pemda',
    pertama: { sebagai: 'Pengurus Barang Pengelola', roleBmd: 'pengurus_barang_pengelola', diSkpd: false },
    kedua: { sebagai: 'Pelaksana Fungsi Akuntansi Pemerintah Daerah', roleBmd: null, diSkpd: false },
    kolomNilai: 'Laporan BMD Pengelola Barang (Rp)',
    perSkpd: false,
  },
]

export const varianInfo = (v: VarianBA): VarianInfo =>
  VARIAN_BA.find(x => x.value === v) ?? VARIAN_BA[1]

// ── Identitas pihak & konfigurasi lembar ────────────────────────────────────
export type PihakBA = {
  nama: string
  nip: string
  pangkat: string
  jabatan: string
  /** "Dalam hal ini bertindak sebagai …" — default dari varian, boleh disunting:
   *  nomenklatur jabatan di tiap pemda tak selalu sama dgn Permendagri. */
  sebagai: string
}

export const pihakKosong = (sebagai: string): PihakBA =>
  ({ nama: '', nip: '', pangkat: '', jabatan: '', sebagai })

/** Cakupan angka yang dibawa lembar ini. */
export type CakupanKomptabel = 'intra' | 'semua'

export const KOMPS_DARI: Record<CakupanKomptabel, Komptabel[]> = {
  intra: ['intra'],
  semua: ['intra', 'ekstra'],
}

export const LABEL_CAKUPAN: Record<CakupanKomptabel, string> = {
  intra: 'Intrakomptabel',
  semua: 'Intrakomptabel dan Ekstrakomptabel',
}

export type KonfigBA = {
  varian: VarianBA
  cakupan: CakupanKomptabel
  /** (1) Kop surat ikut dicetak? BAWAANNYA MATI (keputusan user 2026-08-26):
   *  lembar ini umumnya dicetak di atas kertas yang SUDAH berkop, jadi kop yang
   *  ikut tercetak justru tumpang tindih dengan kop aslinya. */
  pakaiKop: boolean
  /** (1) Baris kop — satu baris per elemen. Dibiarkan bebas: tiap SKPD punya
   *  susunan kop & alamatnya sendiri, dan menebaknya salah lebih buruk. */
  kop: string[]
  /** (2) Nomor Berita Acara. Kosong → dicetak titik-titik. */
  nomor: string
  /** (5) Tempat penandatanganan. */
  tempat: string
  /** (3)(4) Tanggal Berita Acara, ISO `YYYY-MM-DD`. */
  tanggal: string
  pertama: PihakBA
  kedua: PihakBA
  /** (15) Catatan hasil rekonsiliasi — satu baris per butir. */
  catatanAwal: string
  catatanAkhir: string
  catatanTrx: string
}

// ── Tanggal & terbilang ─────────────────────────────────────────────────────
// ⚠️ Kembar dgn `BULAN`/`tglPanjang` di app/cetak/perolehan/page.tsx. Sengaja
// diurai manual, BUKAN `new Date(s).toLocaleDateString`: `new Date('YYYY-MM-DD')`
// dibaca sebagai tengah malam UTC, jadi di zona negatif tanggalnya MUNDUR
// SEHARI — lembar bertanda tangan tak boleh bergeser tanggalnya karena zona
// waktu peramban.
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const uraiTgl = (s: string): [number, number, number] | null => {
  const [y, m, d] = (s || '').slice(0, 10).split('-').map(Number)
  return y && m && d ? [y, m, d] : null
}

/** '2026-08-26' → '26 Agustus 2026'. Kosong/rusak → ''. */
export function tglPanjang(s: string): string {
  const t = uraiTgl(s)
  return t ? `${t[2]} ${BULAN[t[1] - 1]} ${t[0]}` : ''
}

/** '2026-08-26' → 'Rabu'. Dibangun sbg tanggal LOKAL (bukan UTC) — lihat di atas. */
export function hariDari(s: string): string {
  const t = uraiTgl(s)
  return t ? HARI[new Date(t[0], t[1] - 1, t[2]).getDay()] : ''
}

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh',
  'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas']

/**
 * Bilangan → kata, gaya Berita Acara ("Dua Puluh Enam", "Dua Ribu Dua Puluh
 * Enam"). Hanya dipakai untuk tanggal & tahun, jadi cukup sampai ribuan.
 */
export function terbilang(n: number): string {
  const x = Math.floor(Math.abs(n))
  if (x === 0) return 'Nol'
  if (x < 12) return SATUAN[x]
  if (x < 20) return `${SATUAN[x - 10]} Belas`
  if (x < 100) return `${SATUAN[Math.floor(x / 10)]} Puluh${x % 10 ? ` ${SATUAN[x % 10]}` : ''}`
  if (x < 200) return `Seratus${x % 100 ? ` ${terbilang(x % 100)}` : ''}`
  if (x < 1000) return `${SATUAN[Math.floor(x / 100)]} Ratus${x % 100 ? ` ${terbilang(x % 100)}` : ''}`
  if (x < 2000) return `Seribu${x % 1000 ? ` ${terbilang(x % 1000)}` : ''}`
  return `${terbilang(Math.floor(x / 1000))} Ribu${x % 1000 ? ` ${terbilang(x % 1000)}` : ''}`
}

/** (3)(4) "hari ini Rabu tanggal Dua Puluh Enam bulan Agustus tahun Dua Ribu …" */
export function kalimatTanggal(s: string): { hari: string; tanggal: string; bulan: string; tahun: string } {
  const t = uraiTgl(s)
  if (!t) return { hari: '', tanggal: '', bulan: '', tahun: '' }
  return {
    hari: hariDari(s),
    tanggal: terbilang(t[2]),
    bulan: BULAN[t[1] - 1],
    tahun: terbilang(t[0]),
  }
}

/**
 * (8) Tanggal cut-off yang direkonsiliasi — akhir periode, BUKAN tanggal BA.
 * '2026-S1' → '30 Juni 2026'; '2026-S2' → '31 Desember 2026'.
 */
export function tanggalCutoff(periode: string): string {
  const [th, smt] = (periode || '').split('-')
  if (!th) return ''
  return smt === 'S1' ? `30 Juni ${th}` : `31 Desember ${th}`
}

export const labelSemester = (periode: string) =>
  periode.endsWith('S1') ? 'Semester I' : periode.endsWith('S2') ? 'Semester II' : periode

/**
 * Nama bawaan berkas saat "Save as PDF" — satu-satunya cara menyetelnya dari
 * halaman adalah lewat `document.title` (pola app/cetak/perolehan/page.tsx).
 * Karakter terlarang Windows dibuang: nama SKPD boleh memuat garis miring &
 * dialog simpan akan menolaknya.
 */
export function namaBerkasBA(namaSkpd: string, periode: string): string {
  const bersih = (namaSkpd || '').replace(/[\\/:*?"<>|]/g, '-').trim()
  return `Berita Acara Rekonsiliasi_${bersih || 'Kab Kediri'}_${periode}`
}

// ── Lampiran 1 & 2: Saldo Awal / Saldo Akhir ────────────────────────────────
/**
 * Satu baris tabel saldo.
 *
 * `nilai === null` berarti **pos itu tidak dicatat aplikasi ini** (Persediaan,
 * Kemitraan dengan Pihak Ketiga) atau baris judul — sengaja DIBEDAKAN dari 0.
 * Mencetak "0" untuk pos yang tak pernah dihitung sama saja menyatakan
 * saldonya nihil, dan itu pernyataan yang tak berhak dibuat aplikasi ini.
 */
export type BarisSaldo = {
  no: string
  uraian: string
  indent: 0 | 1
  nilai: number | null
  judul: boolean
}

const golPerolehan = (snap: Snapshot | undefined, gol: string, komps: Komptabel[]) =>
  komps.reduce((s, k) => s + measuresOf(snap, gol, k).perolehan, 0)

const golAkumulasi = (snap: Snapshot | undefined, gol: string, komps: Komptabel[]) =>
  komps.reduce((s, k) => s + measuresOf(snap, gol, k).akumulasi, 0)

/** Golongan Aset Tetap (kelompok B) menurut GOLONGAN_REKAP — diturunkan, bukan
 *  diketik ulang, supaya golongan baru tak perlu disunting di dua tempat. */
const GOL_TETAP = GOLONGAN_REKAP.filter(g => g.kode.startsWith('1.3.')).map(g => g.kode)

/**
 * Susunan baris Format V.2 lampiran Saldo Awal / Saldo Akhir.
 *
 * ⚠️ Baris akumulasi dicetak NEGATIF. Kolom (11) adalah satu kolom nilai
 * bertanda; akumulasi yang tampil positif di sebelah nilai perolehan mustahil
 * dibaca sebagai pengurang, dan yang membacanya adalah penelaah yang
 * menandatangani.
 */
export function barisSaldoBA(snap: Snapshot | undefined, komps: Komptabel[]): BarisSaldo[] {
  const P = (gol: string) => golPerolehan(snap, gol, komps)
  const A = (gol: string) => golAkumulasi(snap, gol, komps)
  const judul = (no: string, uraian: string): BarisSaldo =>
    ({ no, uraian, indent: 0, nilai: null, judul: true })
  const isi = (no: string, uraian: string, nilai: number | null): BarisSaldo =>
    ({ no, uraian, indent: 1, nilai, judul: false })

  const akumTetap = GOL_TETAP.reduce((s, g) => s + A(g), 0)

  return [
    judul('A.', 'ASET LANCAR'),
    // Persediaan tidak dicatat aplikasi BMD ini (ranah SIPD/keuangan).
    isi('', 'Persediaan', null),
    judul('B.', 'ASET TETAP'),
    isi('1.', 'Tanah', P('1.3.1')),
    isi('2.', 'Peralatan dan Mesin', P('1.3.2')),
    isi('3.', 'Gedung dan Bangunan', P('1.3.3')),
    isi('4.', 'Jalan, Jaringan dan Irigasi', P('1.3.4')),
    isi('5.', 'Aset Tetap Lainnya', P('1.3.5')),
    isi('6.', 'Konstruksi Dalam Pengerjaan', P('1.3.6')),
    isi('7.', 'Akumulasi Penyusutan', akumTetap === 0 ? 0 : -akumTetap),
    judul('C.', 'ASET LAINNYA'),
    isi('1.', 'Kemitraan dengan Pihak Ketiga', null),
    isi('2.', 'Aset Tidak Berwujud', P('1.5.3')),
    isi('3.', 'Aset Lain-lain', P('1.5.4')),
    isi('4.', 'Akumulasi Amortisasi Aset Tidak Berwujud', A('1.5.3') === 0 ? 0 : -A('1.5.3')),
    isi('5.', 'Akumulasi Penyusutan Aset Lainnya', A('1.5.4') === 0 ? 0 : -A('1.5.4')),
  ]
}

// ── Lampiran 3: transaksi per jenis aset ────────────────────────────────────
/** Nilai perolehan per kategori mutasi, SUDAH digabung antar kolom komptabel. */
export type SelBA = Partial<Record<MutasiKey, number>>

export function selBA(mut: Mutasi | undefined, golongan: string, komps: Komptabel[]): SelBA {
  const out: SelBA = {}
  for (const k of komps) {
    const cell = mut?.[golongan]?.[k]
    if (!cell) continue
    for (const [key, u] of Object.entries(cell) as [MutasiKey, { perolehan: number }][]) {
      if (!u) continue
      out[key] = (out[key] ?? 0) + u.perolehan
    }
  }
  return out
}

const KURANG_SET = new Set<MutasiKey>(KURANG_KEYS)

export type BarisTrx = {
  no: string
  huruf: string
  uraian: string
  /** Kategori pembentuk. Kosong (di baris BUKAN judul) = pos Permendagri yang
   *  aplikasi ini belum punya MENUnya (mis. divestasi, putusan pengadilan) —
   *  sel nilainya diisi 0, BUKAN dikosongkan. Beda dari "Persediaan"/"Kemitraan
   *  dengan Pihak Ketiga" di lampiran Saldo Awal/Akhir: pos itu di luar cakupan
   *  aplikasi BMD SELAMANYA (ranah SIPD/keuangan), sedangkan baris di sini
   *  cuma menunggu menunya dibangun — 0 lebih jujur karena sejajar dengan
   *  baris lain yang memang tak bermutasi periode ini (keputusan user
   *  2026-08-26, membatalkan sikap "dikosongkan" sebelumnya). */
  keys: MutasiKey[]
  judul: boolean
}

/**
 * Susunan baris Format V.2 lampiran (17)–(23), berikut kategori mutasi
 * aplikasi ini yang mengisinya.
 *
 * ⚠️ SETIAP `MutasiKey` HARUS muncul TEPAT SEKALI di seluruh daftar ini —
 * kalau tidak, jumlah Tambah/Kurang lembar ini tak lagi sama dengan tabel
 * Rekonsiliasi di layar, tanpa satu pun error. Dikunci test.
 */
export const BARIS_TRX: BarisTrx[] = [
  { no: '1', huruf: '', uraian: 'Cara Perolehan', keys: [], judul: true },
  // Pengadaan lewat rekening Belanja Jasa (5.1) sama-sama belanja APBD — beda
  // rekening, bukan beda cara perolehan. Termin kontrak konstruksi juga masuk
  // sini, tapi sejak 2026-08-27 ia sudah dipetakan ke `pengadaan`/`belanja_jasa`
  // di hulu (lib/rekon.ts), jadi tak lagi butuh kategori sendiri.
  // ⚠️ Format V.2 (17)(24) menyediakan sub-baris "LRA … Rp …" di bawah baris
  // ini — SENGAJA DIHILANGKAN (keputusan user 2026-08-26): aplikasi ini tak
  // menautkan lembar ini ke menu LRA, dan sub-baris kosong yang cuma diketik
  // manual dinilai lebih mengganggu daripada berguna. Beda dari "kosong ≠ nol"
  // yang berlaku di tempat lain — di sini elemen formatnya memang dibuang,
  // bukan dikosongkan.
  { no: '', huruf: 'a.', uraian: 'Pengadaan dari APBD', keys: ['pengadaan', 'belanja_jasa'], judul: false },
  { no: '', huruf: 'b.', uraian: 'Hibah', keys: ['hibah'], judul: false },
  { no: '', huruf: 'c.', uraian: 'pelaksanaan dari perjanjian/kontrak', keys: [], judul: false },
  { no: '', huruf: 'd.', uraian: 'ketentuan peraturan perundang-undangan', keys: [], judul: false },
  { no: '', huruf: 'e.', uraian: 'putusan pengadilan', keys: [], judul: false },
  { no: '', huruf: 'f.', uraian: 'divestasi', keys: [], judul: false },
  { no: '', huruf: 'g.', uraian: 'hasil Inventarisasi', keys: ['inventarisasi'], judul: false },
  { no: '', huruf: 'h.', uraian: 'hasil tukar menukar', keys: ['tukar'], judul: false },
  { no: '', huruf: 'i.', uraian: 'pembatalan Penghapusan', keys: [], judul: false },
  { no: '', huruf: 'j.', uraian: 'perolehan lainnya', keys: ['lainnya'], judul: false },
  { no: '2', huruf: '', uraian: 'Penggunaan', keys: [], judul: true },
  { no: '', huruf: 'a.', uraian: 'pengalihan atau penyerahan BMD', keys: ['penggunaan_masuk'], judul: false },
  { no: '3', huruf: '', uraian: 'penerimaan internal Pengguna Barang', keys: ['internal_masuk'], judul: false },
  { no: '4', huruf: '', uraian: 'pengeluaran internal Pengguna Barang', keys: ['internal_keluar'], judul: false },
  {
    no: '5', huruf: '', uraian: 'reklasifikasi', judul: false,
    keys: ['reklas_fungsi_masuk', 'reklas_kode_masuk', 'reklas_fungsi_keluar', 'reklas_kode_keluar'],
  },
  {
    // Kapitalisasi, Pemecahan & Penggabungan Barang semuanya PEMBETULAN
    // pencatatan atas barang yang sudah ada — bukan perolehan baru. Menaruhnya
    // di "Cara Perolehan" akan membuat lembar ini menyatakan pemda menerima
    // barang yang sebenarnya cuma dipecah/digabung nomor registernya.
    no: '6', huruf: '', uraian: 'Koreksi', judul: false,
    keys: ['kapitalisasi', 'koreksi_tambah', 'pemecahan_masuk', 'penggabungan_masuk',
      'koreksi_kurang', 'pemecahan_keluar', 'penggabungan_keluar'],
  },
  { no: '7', huruf: '', uraian: 'Penghapusan', keys: [], judul: true },
  {
    no: '', huruf: 'a.', uraian: 'Pemindahtanganan BMD', judul: false,
    keys: ['hapus_penjualan', 'hapus_hibah', 'hapus_tukar', 'hapus_penyertaan'],
  },
  { no: '', huruf: 'b.', uraian: 'Penyerahan atau Pengalihan Status Penggunaan', keys: ['pengalihan_keluar'], judul: false },
  { no: '', huruf: 'c.', uraian: 'Putusan Pengadilan berkekuatan hukum tetap', keys: [], judul: false },
  { no: '', huruf: 'd.', uraian: 'ketentuan peraturan perundang-undangan', keys: [], judul: false },
  { no: '', huruf: 'e.', uraian: 'Pemusnahan', keys: [], judul: false },
  { no: '', huruf: 'f.', uraian: 'Sebab lain', keys: ['hapus_sebab_lain'], judul: false },
]

export type BarisTrxNilai = BarisTrx & {
  /** null HANYA untuk baris judul (header seksi, tak pernah punya angka) atau
   *  kolom yang secara struktural tak berlaku untuk baris itu (mis. kolom
   *  Kurang di baris Cara Perolehan — kategori itu memang selalu penambahan).
   *  Baris DATA tanpa kategori pembentuk (belum ada menunya) tampil 0, bukan
   *  null — lihat komentar `BarisTrx.keys`. */
  tambah: number | null
  kurang: number | null
}

export function barisTrxBA(sel: SelBA): BarisTrxNilai[] {
  return BARIS_TRX.map(b => {
    if (b.keys.length === 0) {
      return b.judul ? { ...b, tambah: null, kurang: null } : { ...b, tambah: 0, kurang: 0 }
    }
    let tambah = 0, kurang = 0
    for (const k of b.keys) {
      const v = sel[k] ?? 0
      if (KURANG_SET.has(k)) kurang += v
      else tambah += v
    }
    // Baris yang hanya punya kategori satu arah tak perlu memamerkan "0" di
    // kolom seberangnya — kolom yang penuh nol menenggelamkan angka yang berisi.
    const adaTambah = b.keys.some(k => !KURANG_SET.has(k))
    const adaKurang = b.keys.some(k => KURANG_SET.has(k))
    return { ...b, tambah: adaTambah ? tambah : null, kurang: adaKurang ? kurang : null }
  })
}

export function totalTrxBA(sel: SelBA): { tambah: number; kurang: number } {
  let tambah = 0, kurang = 0
  for (const [k, v] of Object.entries(sel) as [MutasiKey, number][]) {
    if (KURANG_SET.has(k)) kurang += v || 0
    else tambah += v || 0
  }
  return { tambah, kurang }
}

/** true kalau golongan ini punya mutasi pada periode → dibuatkan lembarnya. */
export function adaTransaksiBA(sel: SelBA): boolean {
  const t = totalTrxBA(sel)
  return t.tambah !== 0 || t.kurang !== 0
}

/**
 * Sisa yang belum terpetakan ke baris mana pun — rumusnya SAMA PERSIS dgn baris
 * "Selisih (belum terpetakan)" di tabel Rekonsiliasi (halaman rekonsiliasi,
 * `nilaiBaris` kasus 'selisih'), supaya dua lembar itu tak bisa berbeda.
 *
 * Isinya a.l. reklasifikasi komptabel Intra↔Ekstra — yang, kalau lembar ini
 * dicetak Intrakomptabel saja, memang perpindahan keluar yang tak punya baris
 * di Format V.2. Nol berarti rantai Saldo Awal + Tambah − Kurang = Saldo Akhir
 * cocok sempurna.
 */
export function selisihBA(sel: SelBA, awal: number, akhir: number): number {
  const t = totalTrxBA(sel)
  return (akhir - awal) - (t.tambah - t.kurang)
}

/**
 * Format angka lembar cetak — negatif dalam KURUNG, bukan tanda minus
 * (permintaan user 2026-08-27, konvensi akuntansi baku). Baris "Akumulasi
 * Penyusutan" & sejenisnya disimpan negatif di data (lihat `barisSaldoBA`),
 * jadi tanpa ini lembar bertanda tangan mencetak "-5.518.654.408" — bukan
 * salah hitung, tapi bukan format resmi yang biasa dibaca BPK/inspektorat.
 *
 * Satu fungsi dipakai DUA tempat: sel tabel (`BeritaAcaraRekon.tsx`) & kalimat
 * "Catatan Hasil Rekonsiliasi" (`catatanSelisihBA` di bawah) — kalau
 * masing-masing menulis formatternya sendiri, salah satu gampang ketinggalan
 * saat konvensinya berubah lagi.
 */
export function angkaBA(v: number): string {
  const n = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(v || 0))
  return v < 0 ? `(${n})` : n
}

/**
 * Catatan (15) yang WAJIB ikut tercetak: setiap jenis aset yang rantainya tak
 * menutup disebut berikut angkanya.
 *
 * Format V.2 tidak punya baris "selisih", jadi tanpa ini lembar bertanda tangan
 * bisa memuat Tambah/Kurang yang tak menjelaskan seluruh perubahan saldo — dan
 * tak ada apa pun di lembar itu yang memberi tahu pembacanya. Ditaruh di
 * "Catatan Hasil Rekonsiliasi" karena itulah tempat yang memang disediakan
 * formatnya, jadi fidelitas formatnya tetap utuh.
 */
export function catatanSelisihBA(
  snapAwal: Snapshot | undefined, snapAkhir: Snapshot | undefined,
  mut: Mutasi | undefined, komps: Komptabel[],
): string[] {
  const out: string[] = []
  for (const g of GOLONGAN_REKAP) {
    const sel = selBA(mut, g.kode, komps)
    const s = selisihBA(sel, golPerolehan(snapAwal, g.kode, komps), golPerolehan(snapAkhir, g.kode, komps))
    if (Math.round(s) === 0) continue
    out.push(
      `${g.kode} ${g.uraian}: selisih Rp ${angkaBA(s)} ` +
      'belum terpetakan ke baris Format V.2 (a.l. reklasifikasi Intrakomptabel↔Ekstrakomptabel).',
    )
  }
  return out
}

/** Teks catatan operator (satu butir per baris) → array butir. */
export const butirCatatan = (teks: string): string[] =>
  (teks || '').split('\n').map(s => s.trim()).filter(Boolean)

// ── Kolektor pegawai (calon penanda tangan kedua pihak) ─────────────────────
export type PegawaiBA = {
  id: string
  nama: string
  nip: string | null
  pangkat: string | null
  golongan: string | null
  jabatan: string | null
  role_bmd: string | null
  skpd_id: number | null
}

/** "Penata Tingkat I / III/d" — kolom "Pangkat/Gol" Format V.2 memang gabungan. */
export function pangkatGol(p: { pangkat: string | null; golongan: string | null }): string {
  return [p.pangkat, p.golongan].filter(Boolean).join(' / ')
}

/**
 * Seluruh pegawai master (`admin_pegawai`).
 *
 * Sengaja TIDAK disaring ke SKPD terpilih: PIHAK KEDUA justru sering dari luar
 * SKPD itu (Pengurus Barang Pengelola & Pelaksana Akuntansi Pemda ada di BKAD),
 * dan tabelnya kecil — ratusan baris, bukan ratusan ribu. Penyortiran
 * "SKPD ini dulu" dikerjakan di pop-upnya.
 *
 * MELEMPAR kalau gagal: daftar yang diam-diam kosong terbaca operator sebagai
 * "pegawainya belum terdaftar", lalu lembarnya dicetak bertitik-titik padahal
 * orangnya ada (pelajaran yang sama dgn `fetchCalonTtd`).
 */
export function fetchPegawaiBA(supabase: SupabaseClient): Promise<PegawaiBA[]> {
  return paginate<string, PegawaiBA>('daftar pegawai', kursor => {
    // ⚠️ `.gt()` DULU, baru `.order()/.limit()` — sesudah `.order()` builder-nya
    // sudah jadi TransformBuilder yang tak punya `.gt()` lagi (pola
    // `fetchAllBase` di lib/rekon.ts).
    let q = supabase.from('admin_pegawai')
      .select('id,nama,nip,pangkat,golongan,jabatan,role_bmd,skpd_id')
    if (kursor) q = q.gt('id', kursor)
    return q.order('id', { ascending: true }).limit(1000) as unknown as
      PromiseLike<{ data: PegawaiBA[] | null; error: { message: string } | null }>
  })
}

/**
 * Saran awal untuk satu pihak: pegawai ber-`role_bmd` yang dicari, didahulukan
 * yang ada di dalam `lingkup` (SKPD terpilih + turunannya).
 *
 * ⚠️ SARAN, bukan keputusan — operator tetap boleh mengganti/mengetik sendiri.
 * `roleBmd: null` (Pelaksana Akuntansi) sengaja tak pernah menghasilkan saran:
 * perannya tidak ada di master pegawai, jadi tebakan apa pun pasti mengarang.
 */
export function saranPihak(
  daftar: PegawaiBA[], peran: PeranBA, lingkup: Set<number> | null,
): PegawaiBA | null {
  if (!peran.roleBmd) return null
  const cocok = daftar.filter(p => p.role_bmd === peran.roleBmd)
  if (peran.diSkpd && lingkup) {
    const di = cocok.find(p => p.skpd_id != null && lingkup.has(p.skpd_id))
    if (di) return di
  }
  return cocok[0] ?? null
}

export const pihakDariPegawai = (p: PegawaiBA, sebagai: string): PihakBA => ({
  nama: p.nama,
  nip: p.nip || '',
  pangkat: pangkatGol(p),
  jabatan: p.jabatan || '',
  sebagai,
})
