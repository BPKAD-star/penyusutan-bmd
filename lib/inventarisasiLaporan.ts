// Definisi kolom & pembentukan baris untuk Laporan Hasil Inventarisasi (LHI)
// Format III.B.1–III.B.11 (Permendagri 47/2021). SATU sumber dipakai bersama
// oleh tabel di layar, export Excel, dan halaman cetak — supaya ketiganya tak
// pernah beda isi.
//
// Kolom INTI sama di hampir semua format (No, NIBAR, Kode Register, Kode Barang,
// Nama Barang, Nama Spesifikasi, Merek/Tipe, Jumlah, Satuan, Nilai Perolehan,
// Keterangan); tiap format menambah kolom khasnya sendiri — sebagian
// berkelompok (mis. "Data Awal/Induk", "Sebelum/Setelah Inventarisasi"), yang
// dirender sbg header dua baris lewat properti `grup`.
import type { InvBaris, InvJawaban, LhiKode, SesuaiField } from '@/lib/inventarisasi'
import { normalKondisi, labelSebab, konfigLki } from '@/lib/inventarisasi'
import { levelSkpd } from '@/lib/formatPermendagri'

export type KolomLhi = {
  key: string
  label: string
  /** Jalur header di atas kolom ini. String tunggal = satu tingkat; array =
   *  bertingkat (lampiran III.B.6 sampai 3 tingkat di atas nama kolom). */
  grup?: string | string[]
  angka?: boolean
  /** CETAK-ONLY — ambil nilai dari key baris lain (baris tetap dibentuk oleh
   *  `nilaiBarisLhi` versi datar, jadi Excel tak ikut terpecah). */
  sumber?: string
  /** CETAK-ONLY — hanya tampilkan isi bila baris[key] === sama. */
  syarat?: { key: string; sama: string }
  /** CETAK-ONLY — tampilkan tanda √ bila baris[key] === sama. */
  tanda?: { key: string; sama: string }
  /** Key baris lain yang ditumpuk DI BAWAH nilai kolom ini dalam satu sel
   *  (mis. Kode Barang di atas, Uraian Barang di bawahnya). Dipakai tabel layar
   *  & cetak; Excel memakai `kolomLhi()` yang tetap datar (satu kolom per data). */
  tumpuk?: string[]
}

export const jalurGrup = (k: KolomLhi): string[] =>
  k.grup == null ? [] : Array.isArray(k.grup) ? k.grup : [k.grup]

const YATIDAK = (v: boolean | undefined) => (v ? 'Ada' : 'Tidak ada')

/** Nilai SETELAH inventarisasi: pakai "seharusnya" bila dinyatakan Tidak Sesuai. */
function efektif(f: SesuaiField | undefined, semula: string | null | undefined): string {
  if (f && f.sesuai === false) return (f.seharusnya || '').trim() || '(kosong)'
  return semula || ''
}

// ── Kolom inti ──────────────────────────────────────────────────────────────
const INTI = (opts?: { merek?: boolean; nibar?: boolean }): KolomLhi[] => [
  { key: 'no', label: 'No.' },
  ...(opts?.nibar === false ? [] : [{ key: 'nibar', label: 'NIBAR' }]),
  { key: 'kode_register', label: 'Kode Register' },
  { key: 'kode_barang', label: 'Kode Barang' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'spesifikasi', label: 'Nama Spesifikasi Barang' },
  ...(opts?.merek === false ? [] : [{ key: 'merek_tipe', label: 'Merek/Tipe' }]),
  { key: 'jumlah', label: 'Jumlah', angka: true },
  { key: 'satuan', label: 'Satuan Barang' },
  { key: 'nilai', label: 'Nilai Perolehan Barang (Rp)', angka: true },
]
const KET: KolomLhi = { key: 'keterangan', label: 'Keterangan' }

// ── Bentuk CETAK ────────────────────────────────────────────────────────────
// Empat format menggambar sebagian kolomnya sbg petak centang bertingkat:
// III.B.5 (BAST & SIP → Ada|Tidak ada), III.B.6 (Penggunaan → 3 pihak → Ada
// {Nama Instansi, Nama Dokumen} | Tidak ada dokumen penguasaan), III.B.7 &
// III.B.11 (Kondisi → B|RR|RB).
//
// Pemekaran ini SENGAJA cuma dipakai halaman cetak (keputusan user
// 2026-07-28). Tabel di layar & export Excel tetap memakai `kolomLhi()` yang
// datar — kalau Excel ikut dipecah, nilainya tersebar ke beberapa kolom dan
// tak bisa lagi disaring/di-pivot. Baris datanya SATU sumber (`nilaiBarisLhi`,
// versi datar); kolom cetak menariknya lewat `sumber`/`syarat`/`tanda`,
// sehingga isi cetak & Excel mustahil berbeda.
const KONDISI_CENTANG = (dari: string, grup: string | string[]): KolomLhi[] => [
  { key: `${dari}_b`, label: 'Baik (B)', grup, tanda: { key: dari, sama: 'B' } },
  { key: `${dari}_rr`, label: 'Rusak Ringan (RR)', grup, tanda: { key: dari, sama: 'RR' } },
  { key: `${dari}_rb`, label: 'Rusak Berat (RB)', grup, tanda: { key: dari, sama: 'RB' } },
]

/** Satu blok pihak di III.B.6: Ada {Nama Instansi, Nama Dokumen} | Tidak ada. */
const PIHAK_GUNA = (id: string, judul: string, labelNama: string): KolomLhi[] => [
  {
    key: `${id}_nama`, label: labelNama, grup: ['Penggunaan', judul, 'Ada'],
    sumber: 'guna_nama', syarat: { key: 'guna_pihak', sama: judul },
  },
  {
    key: `${id}_dok`, label: 'Nama Dokumen', grup: ['Penggunaan', judul, 'Ada'],
    sumber: 'guna_dokumen', syarat: { key: 'guna_pihak', sama: judul },
  },
  {
    key: `${id}_tidak`, label: 'Tidak ada dokumen penguasaan', grup: ['Penggunaan', judul],
    tanda: { key: `${id}_flag_tidak`, sama: 'ya' },
  },
]

/** Kolom versi CETAK — sama dgn `kolomLhi()` kecuali empat format bercentang. */
export function kolomLhiCetak(k: LhiKode): KolomLhi[] {
  switch (k) {
    case 'III.B.5':
      return [
        ...INTI(), { key: 'alamat', label: 'Alamat' },
        { key: 'pemakai_nama', label: 'Nama Pemakai', grup: 'Pemakai' },
        { key: 'pemakai_status', label: 'Status Pemakai', grup: 'Pemakai' },
        { key: 'bast_ada', label: 'Ada', grup: ['Pemakai', 'BAST Pemakaian'], tanda: { key: 'pemakai_bast', sama: 'Ada' } },
        { key: 'bast_tidak', label: 'Tidak ada', grup: ['Pemakai', 'BAST Pemakaian'], tanda: { key: 'pemakai_bast', sama: 'Tidak ada' } },
        { key: 'sip_ada', label: 'Ada', grup: ['Pemakai', 'Surat Ijin Penghunian'], tanda: { key: 'pemakai_sip', sama: 'Ada' } },
        { key: 'sip_tidak', label: 'Tidak ada', grup: ['Pemakai', 'Surat Ijin Penghunian'], tanda: { key: 'pemakai_sip', sama: 'Tidak ada' } },
        KET,
      ]
    case 'III.B.6':
      return [
        ...INTI(), { key: 'alamat', label: 'Alamat' },
        ...PIHAK_GUNA('pp', 'Pemerintah Pusat', 'Nama Instansi'),
        ...PIHAK_GUNA('pd', 'Pemerintah Daerah Lainnya', 'Nama Instansi'),
        ...PIHAK_GUNA('pl', 'Pihak Lain', 'Nama Pihak Lain'),
        KET,
      ]
    case 'III.B.7':
      return [
        ...INTI(),
        ...KONDISI_CENTANG('kondisi_sebelum', 'Kondisi Fisik Sebelum Inventarisasi (√)'),
        ...KONDISI_CENTANG('kondisi_setelah', 'Kondisi Fisik Setelah Inventarisasi (√)'),
        KET,
      ]
    case 'III.B.11': {
      const dasar = kolomLhi(k)
      const i = dasar.findIndex(c => c.key === 'kondisi_setelah')
      return [
        ...dasar.slice(0, i),
        ...KONDISI_CENTANG('kondisi_setelah', 'Kondisi Barang'),
        ...dasar.slice(i + 1),
      ]
    }
    default:
      return kolomLhi(k)
  }
}

/** Isi satu sel cetak. Baris tetap yang dari `nilaiBarisLhi`. */
export function nilaiSelCetak(k: KolomLhi, r: Record<string, string | number>): string | number {
  if (k.tanda) return r[k.tanda.key] === k.tanda.sama ? '√' : ''
  if (k.syarat && r[k.syarat.key] !== k.syarat.sama) return ''
  return r[k.sumber || k.key] ?? ''
}

// ── Catatan kaki ────────────────────────────────────────────────────────────
// Tiap format di lampiran punya catatan kaki bertanda *) **) dst. yang
// menjelaskan kolom mana yang kondisional. Hanya dicantumkan untuk format yang
// memang merender kolom bersangkutan — di lampiran, III.B.8 masih membawa
// catatan "*) merek/tipe" padahal tabelnya tak punya kolom itu (sisa salin
// dari format sebelumnya), jadi tak diikutkan.
const CATATAN_MEREK = '*) Hanya diisi untuk BMD yang ada merek/tipe.'

export const CATATAN_KAKI: Partial<Record<LhiKode, string[]>> = {
  'III.B.1': [CATATAN_MEREK],
  'III.B.2': [CATATAN_MEREK],
  'III.B.3': [CATATAN_MEREK],
  'III.B.5': [
    CATATAN_MEREK,
    '**) Hanya diisi apabila digunakan oleh pengguna barang lainnya atau PNS pemerintah daerah yang bersangkutan.',
    '***) Hanya diisi untuk rumah negara.',
  ],
  'III.B.6': [
    CATATAN_MEREK,
    '**) Hanya diisi dalam hal digunakan oleh pemerintah pusat.',
    '***) Hanya diisi dalam hal digunakan oleh pemerintah daerah lainnya.',
    '****) Hanya diisi dalam hal digunakan oleh pihak lain.',
  ],
  'III.B.7': [CATATAN_MEREK],
  'III.B.9': [
    CATATAN_MEREK,
    '**) Hanya diisi untuk BMD yang tercatat ganda.',
    '***) Hanya diisi dalam hal tercatat ganda dengan pengguna barang lainnya.',
  ],
  'III.B.11': [
    CATATAN_MEREK,
    '**) Hanya diisi untuk kendaraan dinas.',
  ],
}

const GRUP_INDUK = 'Data Awal Induk'

/**
 * Susunan III.B.3 yang DILIHAT (layar & cetak) — mengikuti contoh tabel user
 * (2026-10-01): Kode Barang/Uraian Barang & Nama Barang/NIBAR ditumpuk dalam
 * satu sel, lalu blok "Data Awal Induk" berisi empat kolom yang sama (tanpa
 * Kode Lokasi / Kode Register yang dulu ada). Excel tetap datar (`kolomLhi`).
 */
const TAMPIL_III_B_3: KolomLhi[] = [
  { key: 'no', label: 'No' },
  { key: 'kode', label: 'Kode Barang / Uraian Barang', tumpuk: ['uraian'] },
  { key: 'nama', label: 'Nama Barang / NIBAR', tumpuk: ['nibar'] },
  { key: 'merek_tipe', label: 'Merk/Tipe' },
  { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
  { key: 'tgl', label: 'Tanggal Perolehan', angka: true },
  { key: 'nilai', label: 'Nilai Perolehan', angka: true },
  { key: 'induk_kode', label: 'Kode Barang / Uraian Barang', grup: GRUP_INDUK, tumpuk: ['induk_uraian'] },
  { key: 'induk_nama', label: 'Nama Barang / NIBAR', grup: GRUP_INDUK, tumpuk: ['induk_nibar'] },
  { key: 'induk_tgl', label: 'Tanggal Perolehan', grup: GRUP_INDUK, angka: true },
  { key: 'induk_nilai', label: 'Nilai Perolehan', grup: GRUP_INDUK, angka: true },
  KET,
]

/** Kolom untuk tabel layar & cetak. Excel memakai `kolomLhi()` (datar). */
export function kolomLhiTampil(k: LhiKode, cetak: boolean): KolomLhi[] {
  if (k === 'III.B.3') return TAMPIL_III_B_3
  return cetak ? kolomLhiCetak(k) : kolomLhi(k)
}

// ── Kop lampiran: butir (3) Kuasa PB · (4) PB · (5) Pengelola Barang ────────
/**
 * Pengelola Barang = Badan Keuangan dan Aset Daerah, TETAP untuk semua LHI
 * (keputusan user 2026-10-01). Beda dari `sebutanPejabat` (kaki lembar lain), yang
 * sengaja tak pernah menebak Pengelola Barang.
 */
export const PENGELOLA_BARANG_LHI = 'Badan Keuangan dan Aset Daerah'

/** Tiga baris identitas di kop lampiran. Yang tak diketahui dibiarkan bertitik-titik. */
export type IdentitasLhi = { kuasa?: string; pengguna?: string; pengelola?: string }

/**
 * Isi butir (3)–(5) dari SKPD yang dipilih (keputusan user 2026-10-01):
 *
 *   SKPD level 1 (Pengguna Barang) → Kuasa PB = SKPD itu sendiri, PB = SKPD itu
 *   SKPD level 2+ (sub unit)       → Kuasa PB = SKPD itu, PB = SKPD INDUK (akar)
 *   Pengelola Barang               → selalu Badan Keuangan dan Aset Daerah
 *
 * Tanpa SKPD (se-kabupaten) Kuasa & Pengguna dibiarkan bertitik-titik — tak ada
 * satu unit pun yang bisa disebut — tapi Pengelola tetap terisi.
 * ⚠️ Level 3 (sub kuasa) ikut aturan "sub unit" (sebutan lembar lain,
 * `sebutanPejabat`, juga tak membedakan level 2 dari 3).
 */
export function identitasLhi(
  skpdId: number | null | undefined,
  skpd: { id: number; parent_id: number | null; nama: string }[],
): IdentitasLhi {
  const pengelola = PENGELOLA_BARANG_LHI
  if (skpdId == null) return { pengelola }
  const byId = new Map(skpd.map(x => [x.id, x]))
  const ini = byId.get(skpdId)
  if (!ini) return { pengelola }
  if (levelSkpd(skpdId, new Map(skpd.map(x => [x.id, x.parent_id]))) <= 1) {
    return { kuasa: ini.nama, pengguna: ini.nama, pengelola }
  }
  // Naik ke akar. Dibatasi 20 langkah (pola `levelSkpd`): pohon yang memuat
  // lingkaran tak boleh membekukan lembar cetak.
  let akar = ini
  for (let i = 0; i < 20 && akar.parent_id != null; i++) {
    const atas = byId.get(akar.parent_id)
    if (!atas) break
    akar = atas
  }
  return { kuasa: ini.nama, pengguna: akar.id === ini.id ? undefined : akar.nama, pengelola }
}

// ── Data induk (LHI III.B.3) ────────────────────────────────────────────────
export type IndukLive = Record<string, {
  uraian_barang: string | null; tgl_perolehan: string | null; nilai_perolehan: number | null
}>

/** `YYYY-MM-DD` → `dd/mm/yyyy` (tanggal diurai manual, bukan `new Date` — geser zona waktu). */
export function tglLhi(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

/**
 * id aset induk yang datanya (uraian/tanggal/nilai) TIDAK ikut dibekukan di isian
 * — yaitu isian yang dibuat sebelum 2026-10-01. Hanya untuk isian ini laporan
 * perlu membaca register.
 */
export function kebutuhanIndukLive(baris: Pick<InvBaris, 'jawaban'>[]): string[] {
  const ids = new Set<string>()
  for (const b of baris) {
    const j = b.jawaban || {}
    const calon = [j.induk, j.sebab_tidak_ada === 'digabung' ? j.sebab_relasi : undefined]
    for (const p of calon) {
      if (p?.aset_id && (p.nilai_perolehan == null || !p.tgl_perolehan || !p.uraian)) ids.add(p.aset_id)
    }
  }
  return [...ids]
}

export function kolomLhi(k: LhiKode): KolomLhi[] {
  switch (k) {
    case 'III.B.3':
      // Datar (Excel): satu kolom per data supaya bisa disaring/di-pivot. Susunan
      // yang DILIHAT (sel bertumpuk) ada di `TAMPIL_III_B_3`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'induk_kode', label: 'Kode Barang', grup: GRUP_INDUK },
        { key: 'induk_uraian', label: 'Uraian Barang', grup: GRUP_INDUK },
        { key: 'induk_nama', label: 'Nama Barang', grup: GRUP_INDUK },
        { key: 'induk_nibar', label: 'NIBAR', grup: GRUP_INDUK },
        { key: 'induk_tgl', label: 'Tanggal Perolehan', grup: GRUP_INDUK },
        { key: 'induk_nilai', label: 'Nilai Perolehan', grup: GRUP_INDUK, angka: true },
        KET,
      ]
    case 'III.B.4':
      return [...INTI({ merek: false }), KET]
    case 'III.B.5':
      return [
        ...INTI(), { key: 'alamat', label: 'Alamat' },
        { key: 'pemakai_nama', label: 'Nama Pemakai', grup: 'Pemakai' },
        { key: 'pemakai_status', label: 'Status Pemakai', grup: 'Pemakai' },
        { key: 'pemakai_bast', label: 'BAST Pemakaian', grup: 'Pemakai' },
        { key: 'pemakai_sip', label: 'Surat Ijin Penghunian', grup: 'Pemakai' },
        KET,
      ]
    case 'III.B.6':
      return [
        ...INTI(), { key: 'alamat', label: 'Alamat' },
        { key: 'guna_pihak', label: 'Pihak', grup: 'Penggunaan' },
        { key: 'guna_nama', label: 'Nama Instansi/Pihak', grup: 'Penggunaan' },
        { key: 'guna_dokumen', label: 'Nama Dokumen', grup: 'Penggunaan' },
        { key: 'guna_dasar', label: 'Dokumen Penguasaan', grup: 'Penggunaan' },
        KET,
      ]
    case 'III.B.7':
      return [
        ...INTI(),
        { key: 'kondisi_sebelum', label: 'B / RR / RB', grup: 'Kondisi Fisik Sebelum Inventarisasi' },
        { key: 'kondisi_setelah', label: 'B / RR / RB', grup: 'Kondisi Fisik Setelah Inventarisasi' },
        KET,
      ]
    case 'III.B.8':
      return [
        { key: 'no', label: 'No.' }, { key: 'nibar', label: 'NIBAR' },
        { key: 'sb_kode_barang', label: 'Kode Barang', grup: 'Sebelum Inventarisasi' },
        { key: 'sb_nama_barang', label: 'Nama Barang', grup: 'Sebelum Inventarisasi' },
        { key: 'sb_kode_register', label: 'Kode Register', grup: 'Sebelum Inventarisasi' },
        { key: 'sb_spesifikasi', label: 'Spesifikasi Nama Barang', grup: 'Sebelum Inventarisasi' },
        { key: 'sb_jumlah', label: 'Jumlah', grup: 'Sebelum Inventarisasi', angka: true },
        { key: 'sb_alamat', label: 'Alamat', grup: 'Sebelum Inventarisasi' },
        { key: 'st_kode_barang', label: 'Kode Barang', grup: 'Setelah Inventarisasi' },
        { key: 'st_nama_barang', label: 'Nama Barang', grup: 'Setelah Inventarisasi' },
        { key: 'st_kode_register', label: 'Kode Register', grup: 'Setelah Inventarisasi' },
        { key: 'st_spesifikasi', label: 'Spesifikasi Nama Barang', grup: 'Setelah Inventarisasi' },
        { key: 'st_jumlah', label: 'Jumlah', grup: 'Setelah Inventarisasi', angka: true },
        { key: 'st_alamat', label: 'Alamat', grup: 'Setelah Inventarisasi' },
        { key: 'satuan', label: 'Satuan Barang' },
        { key: 'nilai', label: 'Nilai Perolehan Barang (Rp)', angka: true },
        KET,
      ]
    case 'III.B.9':
      return [
        ...INTI(),
        { key: 'tgl_perolehan', label: 'Tanggal, Bulan, Tahun Perolehan' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'g_nibar', label: 'NIBAR', grup: 'Data Pencatatan Ganda' },
        { key: 'g_kode_barang', label: 'Kode Barang', grup: 'Data Pencatatan Ganda' },
        { key: 'g_nama_barang', label: 'Nama Barang', grup: 'Data Pencatatan Ganda' },
        { key: 'g_spesifikasi', label: 'Nama Spesifikasi Barang', grup: 'Data Pencatatan Ganda' },
        { key: 'g_jumlah', label: 'Jumlah', grup: 'Data Pencatatan Ganda', angka: true },
        { key: 'g_satuan', label: 'Satuan Barang', grup: 'Data Pencatatan Ganda' },
        { key: 'g_nilai', label: 'Nilai Perolehan Barang', grup: 'Data Pencatatan Ganda', angka: true },
        { key: 'g_tgl', label: 'Tgl/Bln/Th Perolehan', grup: 'Data Pencatatan Ganda' },
        { key: 'g_pemegang', label: 'Pengelola/Pengguna Barang Lainnya', grup: 'Data Pencatatan Ganda' },
        KET,
      ]
    case 'III.B.10':
      return [
        ...INTI({ merek: false }),
        { key: 'tgl_perolehan', label: 'Tanggal, Bulan, Tahun Perolehan' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'tanah_milik', label: 'Dibangun di atas tanah milik' },
        KET,
      ]
    case 'III.B.11':
      // Urutan kolom di lampiran BEDA dari format lain — tanpa NIBAR (barang
      // belum tercatat), Kode Register di posisi 5 (bukan 2), nomor kendaraan
      // menempel di belakang Merek/Tipe, dan Harga Satuan mendahului Nilai
      // Perolehan. Jangan disamakan dgn INTI().
      return [
        { key: 'no', label: 'No.' },
        { key: 'kode_barang', label: 'Kode Barang' },
        { key: 'nama_barang', label: 'Nama Barang' },
        { key: 'spesifikasi', label: 'Nama Spesifikasi Barang' },
        { key: 'kode_register', label: 'Kode Register' },
        { key: 'merek_tipe', label: 'Merek/Tipe' },
        { key: 'no_polisi', label: 'Nomor Polisi' },
        { key: 'no_rangka', label: 'No. Rangka' },
        { key: 'no_mesin', label: 'No. Mesin' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan Barang' },
        { key: 'harga_satuan', label: 'Harga Satuan Barang (Rp)', angka: true },
        { key: 'nilai', label: 'Nilai Perolehan Barang (Rp)', angka: true },
        { key: 'tgl_perolehan', label: 'Tanggal, Bulan, Tahun Perolehan' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'dasar_pencatatan', label: 'Dasar pencatatan' },
        { key: 'kondisi_setelah', label: 'Kondisi Barang (B/RR/RB)' },
        KET,
      ]
    default: // III.B.1 & III.B.2
      return [...INTI(), KET]
  }
}

/** Bentuk satu baris laporan sesuai format. Key-nya cocok dgn `kolomLhi`. */
export function nilaiBarisLhi(
  k: LhiKode, b: InvBaris, no: number,
  /** Data induk dari register — HANYA untuk isian lama yang tak membekukannya. */
  indukLive: IndukLive = {},
): Record<string, string | number> {
  const s = b.snapshot || {}
  const j = b.jawaban || {}
  const baru = j.baru || {}
  // Kata benda utk teks sebab "tidak ada" — ikut golongan barangnya.
  const noun = konfigLki((s.kode || '').split('.').slice(0, 3).join('.')).sebabNoun

  // Format III.B.11 — barang belum tercatat: seluruh data dari input manual.
  if (k === 'III.B.11') {
    return {
      no, kode_register: baru.kode_register || '', kode_barang: baru.kode_barang || '',
      nama_barang: baru.nama_barang || '', spesifikasi: baru.spesifikasi || '',
      merek_tipe: baru.merek_tipe || '', jumlah: baru.jumlah ?? '', satuan: baru.satuan || '',
      nilai: baru.nilai_perolehan ?? '', no_polisi: baru.no_polisi || '',
      no_rangka: baru.no_rangka || '', no_mesin: baru.no_mesin || '',
      harga_satuan: baru.harga_satuan ?? '', tgl_perolehan: baru.tgl_perolehan || '',
      // Alamat kini berjenjang (admin_wilayah) + detail; `baru.alamat` teks
      // lepas dipertahankan sbg cadangan utk baris lama.
      alamat: [baru.alamat_detail, baru.wilayah_kode].filter(Boolean).join(' · ') || baru.alamat || '',
      dasar_pencatatan: baru.dasar_pencatatan || '',
      kondisi_setelah: baru.kondisi || '', keterangan: j.keterangan || '',
    }
  }

  // Kode Barang & Nama Barang berpasangan: koreksi kodenya sekaligus membawa
  // uraian barunya. Jumlah & nilai perolehan TIDAK bisa diubah lewat LKI, jadi
  // selalu dari snapshot. Kode Register dari snapshot (sejak 2026-09-23 —
  // sebelumnya dikosongkan karena aplikasi belum punya kode register); ia
  // juga tak bisa diubah lewat LKI, jadi sebelum = sesudah.
  const kodeEfektif = j.kode_barang?.sesuai === false
    ? (j.kode_barang.kode_baru || '(kosong)')
    : (s.kode || '')
  const uraianEfektif = j.kode_barang?.sesuai === false
    ? (j.kode_barang.uraian_baru || '(kosong)')
    : (s.uraian_barang || '')
  // Wilayah & Alamat Detail kini DUA field terpisah (keputusan user
  // 2026-09-28) — digabung SATU string di sini seperti sebelumnya, murni
  // supaya kolom LHI yang cuma punya satu "Alamat" tak perlu dipecah dua.
  const wilayahEfektif = j.wilayah?.sesuai === false
    ? (j.wilayah.wilayah_kode || '(kosong)') : (s.wilayah || '')
  const alamatDetailEfektif = j.alamat_detail?.sesuai === false
    ? (j.alamat_detail.seharusnya || '(kosong)') : (s.alamat || '')
  const alamatEfektif = [alamatDetailEfektif, wilayahEfektif].filter(Boolean).join(' · ')

  const inti = {
    no,
    nibar: s.nibar || '',
    kode_register: s.kode_register || '',
    kode_barang: kodeEfektif,
    nama_barang: uraianEfektif,
    spesifikasi: efektif(j.spesifikasi, s.nama_barang),
    merek_tipe: efektif(j.merek_tipe, s.merek_tipe),
    jumlah: s.jumlah ?? '',
    satuan: efektif(j.satuan, s.satuan),
    nilai: s.nilai_perolehan ?? '',
    keterangan: j.keterangan || '',
    alamat: alamatEfektif,
    tgl_perolehan: s.tgl_perolehan || '',
  }

  switch (k) {
    case 'III.B.3': {
      // Dari bagian G ("tidak ada karena ..."): digabung → induk = pilihan
      // petugas; direhab jadi bangunan baru → barang ini SENDIRI induknya &
      // bangunan baru (anak) disebut di Keterangan, supaya kolom induk tak
      // menunjuk barang yang salah. Bagian I (atribusi) → induk pilihan petugas.
      const rel = j.sebab_relasi
      const dariSebab = j.keberadaan === 'tidak_ditemukan' ? j.sebab_tidak_ada : undefined
      const indukDigabung = dariSebab === 'digabung' ? rel : undefined
      const rehab = dariSebab === 'rehab_bangunan_baru'
      const pilih = indukDigabung ?? (rehab ? undefined : j.induk)
      // "Data Awal Induk" = yang DIBEKUKAN saat induk dipilih; isian lama jatuh
      // ke register (kurang tepat bila induknya sudah berubah, tapi lebih baik
      // daripada sel kosong di lembar bertanda tangan).
      const live = pilih?.aset_id ? indukLive[pilih.aset_id] : undefined
      const induk = rehab
        ? {
          kode: s.kode || '', uraian: s.uraian_barang || '', nama: s.nama_barang || '',
          nibar: s.nibar || '', tgl: s.tgl_perolehan || '', nilai: s.nilai_perolehan ?? '',
        }
        : {
          kode: pilih?.kode_barang || '', uraian: pilih?.uraian || live?.uraian_barang || '',
          nama: pilih?.nama_barang || '', nibar: pilih?.nibar || '',
          tgl: pilih?.tgl_perolehan || live?.tgl_perolehan || '',
          nilai: pilih?.nilai_perolehan ?? live?.nilai_perolehan ?? '',
        }
      const catatSebab = dariSebab === 'digabung' ? `Tidak ada: ${labelSebab('digabung', noun)}`
        : rehab ? `Tidak ada: ${labelSebab('rehab_bangunan_baru', noun)} — anak: ${rel?.nibar || '—'} ${rel?.nama_barang || ''}`.trim()
        : ''
      return {
        no,
        kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar,
        merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), nilai: inti.nilai,
        induk_kode: induk.kode, induk_uraian: induk.uraian,
        induk_nama: induk.nama, induk_nibar: induk.nibar,
        induk_tgl: tglLhi(induk.tgl), induk_nilai: induk.nilai,
        keterangan: [catatSebab, j.keterangan].filter(Boolean).join(' — '),
      }
    }
    case 'III.B.5':
      return {
        ...inti,
        pemakai_nama: j.penggunaan?.nama_pemakai || j.penggunaan?.nama || '',
        pemakai_status: j.penggunaan?.status_pemakai || '',
        pemakai_bast: YATIDAK(j.penggunaan?.bast_pemakaian),
        pemakai_sip: YATIDAK(j.penggunaan?.sip),
      }
    case 'III.B.6': {
      const p = j.penggunaan
      const label: Record<string, string> = {
        pempus: 'Pemerintah Pusat', pemda_lain: 'Pemerintah Daerah Lainnya',
        pihak_lain: 'Pihak Lain', pemda: 'Pemerintah Daerah',
      }
      const pihak = p ? (label[p.pihak] || p.pihak) : ''
      // Penanda utk kolom centang "Tidak ada dokumen penguasaan" di versi
      // cetak — perlu dua syarat sekaligus (pihaknya siapa DAN dokumennya tak
      // ada), sedangkan `tanda` cuma membandingkan satu key. Diabaikan oleh
      // tabel layar & Excel karena kolomnya tak terdaftar di `kolomLhi()`.
      const takAdaDok = !!p && !p.dasar_ada
      return {
        ...inti,
        guna_pihak: pihak,
        guna_nama: p?.nama || '',
        guna_dokumen: p?.nama_dokumen || '',
        guna_dasar: p?.dasar_ada ? 'Ada' : 'Tidak ada dokumen penguasaan',
        pp_flag_tidak: takAdaDok && pihak === 'Pemerintah Pusat' ? 'ya' : '',
        pd_flag_tidak: takAdaDok && pihak === 'Pemerintah Daerah Lainnya' ? 'ya' : '',
        pl_flag_tidak: takAdaDok && pihak === 'Pihak Lain' ? 'ya' : '',
      }
    }
    case 'III.B.7':
      return {
        ...inti,
        kondisi_sebelum: normalKondisi(s.kondisi) || '',
        kondisi_setelah: j.kondisi || '',
      }
    case 'III.B.8': {
      // Format III.B.8 hanya menyediakan kolom Kode/Nama/Register/Spesifikasi/
      // Jumlah/Alamat. Atribut lain yang juga bisa dikoreksi lewat LKI —
      // Merek/Tipe (III.A.2/5/6), nomor kendaraan (III.A.2), data teknis JIJ
      // (III.A.4) — tak punya kolomnya, jadi dirangkum ke Keterangan supaya
      // barang yang HANYA berubah di situ tak tampil sebagai baris kosong.
      const ekstra = ([
        [j.merek_tipe, 'Merek/Tipe'],
        [j.no_polisi, 'No. Polisi'],
        [j.no_rangka, 'No. Rangka'],
        [j.no_mesin, 'No. Mesin'],
        [j.jenis_perkerasan, 'Jenis Perkerasan Jalan'],
        [j.jenis_bahan_jembatan, 'Jenis Bahan Struktur Jembatan'],
        [j.no_ruas_jalan, 'No. Ruas Jalan'],
        [j.no_jaringan_irigasi, 'No. Jaringan Irigasi'],
      ] as const)
        .filter(([f]) => f?.sesuai === false)
        .map(([f, label]) => `${label} → ${f?.seharusnya || '(kosong)'}`)
        .join('; ')

      return {
        no, nibar: s.nibar || '',
        sb_kode_barang: s.kode || '', sb_nama_barang: s.uraian_barang || '',
        sb_kode_register: s.kode_register || '', sb_spesifikasi: s.nama_barang || '',
        sb_jumlah: s.jumlah ?? '', sb_alamat: s.alamat || '',
        st_kode_barang: kodeEfektif,
        st_nama_barang: uraianEfektif,
        st_kode_register: s.kode_register || '',
        st_spesifikasi: efektif(j.spesifikasi, s.nama_barang),
        // Jumlah tak bisa diubah lewat LKI → sebelum = sesudah.
        st_jumlah: s.jumlah ?? '',
        st_alamat: alamatEfektif,
        satuan: efektif(j.satuan, s.satuan),
        nilai: s.nilai_perolehan ?? '',
        keterangan: [
          j.keberadaan === 'tidak_ditemukan' && j.sebab_tidak_ada === 'beberapa_register'
            ? `Seharusnya ${(j.sebab_pecahan || []).length || 'beberapa'} register (${(j.sebab_pecahan || []).filter(Boolean).join('; ')}) — tindak lanjut Pemecahan Barang` : '',
          ekstra, j.keterangan,
        ].filter(Boolean).join(' — '),
      }
    }
    case 'III.B.9': {
      const g = j.ganda_data || {}
      return {
        ...inti,
        g_nibar: g.nibar || '', g_kode_barang: g.kode_barang || '', g_nama_barang: g.nama_barang || '',
        g_spesifikasi: g.spesifikasi || '', g_jumlah: g.jumlah ?? '', g_satuan: g.satuan || '',
        g_nilai: g.nilai_perolehan ?? '', g_tgl: g.tgl_perolehan || '', g_pemegang: g.pemegang || '',
      }
    }
    case 'III.B.10': {
      const label: Record<string, string> = {
        pemda: 'Pemerintah Daerah', pemda_lain: 'Pemerintah Daerah Lainnya',
        pempus: 'Pemerintah Pusat', pihak_lain: 'Pihak Lain',
      }
      const t = j.tanah_milik
      return {
        ...inti,
        tanah_milik: t ? `${label[t] || t}${j.tanah_milik_nama ? ` — ${j.tanah_milik_nama}` : ''}` : '',
      }
    }
    default: // III.B.1 & III.B.2
      return {
        ...inti,
        keterangan: [
          j.keberadaan === 'tidak_ditemukan' ? sebabTeks(j, noun) : '', j.keterangan,
        ].filter(Boolean).join(' — '),
      }
  }
}

/** Total nilai perolehan (baris "Jumlah (Rp)" di kaki tiap format). */
export function totalNilaiLhi(rows: Record<string, string | number>[]): number {
  return rows.reduce((s, r) => s + (typeof r.nilai === 'number' ? r.nilai : 0), 0)
}

/** Teks sebab "tidak ada" utk kolom Keterangan III.B.2 (kosong utk lembar lama). */
function sebabTeks(j: InvJawaban, noun: string): string {
  const l = labelSebab(j.sebab_tidak_ada, noun)
  return l ? `Tidak ada: ${l}` : ''
}
