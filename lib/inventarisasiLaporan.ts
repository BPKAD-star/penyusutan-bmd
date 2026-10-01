// Definisi kolom & pembentukan baris untuk Laporan Hasil Inventarisasi (LHI)
// Format III.B.1–III.B.13 (Permendagri 47/2021). SATU sumber dipakai bersama
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
import { tglLhi, type IndukLive } from '@/lib/inventarisasiLhiKop'
import { KOLOM_UBAH, alamatLhi, barisUbah, efektif } from '@/lib/inventarisasiLhiUbah'
import { GRUP_GUNA, GRUP_INDUK, TAMPIL_TETAP } from '@/lib/inventarisasiLhiTampil'

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
  /** III.B.8: sel berisi DUA baris — `${key}_sb` (sebelum) di atas, `${key}_st`
   *  (sesudah) di bawah; yang kedua hijau tebal bila `${key}_beda`. */
  dua?: boolean
  /** Boleh dipatahkan di mana pun (NIBAR 45 digit tanpa spasi). */
  pecah?: boolean
  /** Isi sel = beberapa baris dipisah "\n" (mis. nama barang hasil pemecahan) —
   *  tiap baris dirender sendiri, jumlahnya bebas. */
  baris?: boolean
}

export const jalurGrup = (k: KolomLhi): string[] =>
  k.grup == null ? [] : Array.isArray(k.grup) ? k.grup : [k.grup]

const YATIDAK = (v: boolean | undefined) => (v ? 'Ada' : 'Tidak ada')

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
// Tiga format menggambar sebagian kolomnya sbg petak centang bertingkat:
// III.B.5 (BAST & SIP → Ada|Tidak ada), III.B.7 & III.B.11 (Kondisi → B|RR|RB).
// (III.B.6 tadinya ikut; sejak 2026-10-01 memakai tabel `TAMPIL_III_B_6`.)
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

/** Kolom versi CETAK — sama dgn `kolomLhi()` kecuali tiga format bercentang. */
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
  'III.B.6': [CATATAN_MEREK],
  'III.B.7': [CATATAN_MEREK],
  'III.B.8': [
    'Tiap kolom: baris ATAS = sebelum inventarisasi (data register), baris BAWAH = setelah inventarisasi. Tulisan hijau tebal = data berubah.',
  ],
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

/** Kolom untuk tabel layar & cetak. Excel memakai `kolomLhi()` (datar). */
export function kolomLhiTampil(k: LhiKode, cetak: boolean): KolomLhi[] {
  const tetap = TAMPIL_TETAP[k]
  if (tetap) return tetap
  return cetak ? kolomLhiCetak(k) : kolomLhi(k)
}

// Kop lampiran & data induk: lib/inventarisasiLhiKop.ts (diekspor ulang di sini).
export {
  PENGELOLA_BARANG_LHI, identitasLhi, tglLhi, kebutuhanIndukLive,
  type IdentitasLhi, type IndukLive,
} from '@/lib/inventarisasiLhiKop'

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
    case 'III.B.12':
      // Datar (Excel). Susunan yang DILIHAT ada di `TAMPIL_III_B_12`.
      return [
        { key: 'no', label: 'No' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'kode_lama', label: 'Kode Barang Lama' },
        { key: 'uraian_lama', label: 'Uraian Barang Lama' },
        { key: 'kode_baru', label: 'Kode Barang Baru' },
        { key: 'uraian_baru', label: 'Uraian Barang Baru' },
        KET,
      ]
    case 'III.B.1':
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_1`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.13':
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_13`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'luas', label: 'Luas', angka: true },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'pecahan', label: 'Nama Barang Hasil Pemecahan' },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
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
      // Datar (Excel): satu kolom per data. Susunan yang DILIHAT = `TAMPIL_III_B_6`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'alamat', label: 'Alamat' },
        { key: 'guna_pihak', label: 'Pihak', grup: GRUP_GUNA },
        { key: 'guna_nama', label: 'Nama Instansi / Pihak', grup: GRUP_GUNA },
        { key: 'guna_dasar', label: 'Dokumen Penguasaan', grup: GRUP_GUNA },
        { key: 'guna_dokumen', label: 'Nama Dokumen', grup: GRUP_GUNA },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.7':
      return [
        ...INTI(),
        { key: 'kondisi_sebelum', label: 'B / RR / RB', grup: 'Kondisi Fisik Sebelum Inventarisasi' },
        { key: 'kondisi_setelah', label: 'B / RR / RB', grup: 'Kondisi Fisik Setelah Inventarisasi' },
        KET,
      ]
    case 'III.B.8':
      // Datar & hanya keadaan SESUDAH — dipakai pemeriksa tipe/uji. Excel sungguhan
      // = `barisExcelUbah` (dua baris per barang), tabel = `TAMPIL_III_B_8`.
      return [
        { key: 'no', label: 'No' }, { key: 'nibar', label: 'NIBAR' },
        ...KOLOM_UBAH.map(k => ({ key: `${k.key}_st`, label: k.label })),
        { key: 'catatan', label: 'Catatan' },
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
    default: // III.B.2 (III.B.1 punya tabel sendiri)
      return [...INTI(), KET]
  }
}

/** Bentuk satu baris laporan sesuai format. Key-nya cocok dgn `kolomLhi`. */
export function nilaiBarisLhi(
  k: LhiKode, b: InvBaris, no: number,
  /** Data induk dari register — HANYA untuk isian lama yang tak membekukannya. */
  indukLive: IndukLive = {},
  /** Kode wilayah (desa) → nama Provinsi→Desa. Tanpa itu kode ditampilkan apa adanya. */
  wilayahLabel: (kode: string | null | undefined) => string = kode => kode || '',
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
      alamat: [baru.wilayah_kode ? wilayahLabel(baru.wilayah_kode) : '', baru.alamat_detail].filter(Boolean).join(' · ') || baru.alamat || '',
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
    case 'III.B.1':
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        catatan: j.keterangan || '',
      }
    case 'III.B.13':
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        luas: s.luas ?? '', tgl: tglLhi(s.tgl_perolehan),
        jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        pecahan: (j.sebab_pecahan || []).map(n => n.trim()).filter(Boolean).join('\n'),
        catatan: j.keterangan || '',
      }
    case 'III.B.12':
      // Kode LAMA = yang tercatat di register (snapshot "sebelum"); kode BARU =
      // jawaban petugas di bagian B–C. `kodeEfektif`/`uraianEfektif` sudah
      // memilih jawaban itu saat "Tidak Sesuai" (dan "(kosong)" kalau lupa diisi).
      return {
        no, nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        kode_lama: s.kode || '', uraian_lama: s.uraian_barang || '',
        kode_baru: kodeEfektif, uraian_baru: uraianEfektif,
        // Tindak lanjutnya Reklasifikasi — bukan koreksi data (kode bukan atribut
        // yang bisa diubah di tempat; lihat REKOMENDASI).
        keterangan: ['Perlu di Reklas', j.keterangan].filter(Boolean).join(' — '),
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
      return {
        no,
        kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar,
        merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan),
        jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        // Alamat lengkap: wilayah Provinsi→Desa + alamat detail (keadaan SESUDAH).
        alamat: alamatLhi(s, j, wilayahLabel).st,
        guna_pihak: p ? (label[p.pihak] || p.pihak) : '',
        guna_nama: p?.nama || '',
        guna_dasar: p ? (p.dasar_ada ? 'Ada' : 'Tidak ada') : '',
        guna_dokumen: p?.nama_dokumen || '',
        catatan: j.keterangan || '',
      }
    }
    case 'III.B.7':
      return {
        ...inti,
        kondisi_sebelum: normalKondisi(s.kondisi) || '',
        kondisi_setelah: j.kondisi || '',
      }
    case 'III.B.8':
      return barisUbah(b, no, wilayahLabel)
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
    default: // III.B.2 (III.B.1 punya tabel sendiri)
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

/**
 * Teks sebab "tidak ada" utk kolom Keterangan III.B.2 (kosong utk lembar lama):
 * force majeure memuat penjelasan petugas, dibongkar memuat bangunan penggantinya.
 */
function sebabTeks(j: InvJawaban, noun: string): string {
  const l = labelSebab(j.sebab_tidak_ada, noun)
  if (!l) return ''
  const rel = j.sebab_relasi
  const tambahan = j.sebab_tidak_ada === 'force_majeure' ? (j.sebab_penjelasan || '').trim()
    : j.sebab_tidak_ada === 'dibongkar_baru' && rel
      ? `${noun} baru: ${rel.nibar || '—'} ${rel.nama_barang || ''}`.trim() : ''
  return `Tidak ada: ${l}${tambahan ? ` — ${tambahan}` : ''}`
}
