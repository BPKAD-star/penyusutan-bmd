// Definisi kolom & pembentukan baris untuk Laporan Hasil Inventarisasi (LHI)
// Format III.B.1–III.B.13 (Permendagri 47/2021). SATU sumber dipakai bersama
// oleh tabel di layar, export Excel, dan halaman cetak — supaya ketiganya tak
// pernah beda isi.
//
// Sejak 2026-10-02 SEMUA format (III.B.1–III.B.13) memakai tabel baru dari susunan user:
// kode/uraian & nama/NIBAR & jumlah/satuan ditumpuk, lalu kolom khas tiap format, ditutup
// Catatan Inventarisasi. Susunan yang DILIHAT ada di `lib/inventarisasiLhiTampil.ts`
// (`TAMPIL_*`, `kolomPegawai`, `kolomBelumTercatat`); `kolomLhi()` di sini = versi DATAR
// utk Excel. Kolom ber-`grup` dirender sbg header bertingkat.
import type { InvBaris, InvJawaban, LhiKode, SesuaiField } from '@/lib/inventarisasi'
import { normalKondisi, labelSebab, konfigLki } from '@/lib/inventarisasi'
import { tglLhi, type IndukLive } from '@/lib/inventarisasiLhiKop'
import { KOLOM_UBAH, alamatLhi, barisUbah, efektif } from '@/lib/inventarisasiLhiUbah'
import { GRUP_GUNA, GRUP_INDUK, TAMPIL_TETAP, GRUP_GANDA, kolomBelumTercatat, kolomPegawai } from '@/lib/inventarisasiLhiTampil'

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

const KET: KolomLhi = { key: 'keterangan', label: 'Keterangan' }
/** Kode kondisi → kata penuh utk tabel III.B.7. */
const LABEL_KONDISI: Record<string, string> = { B: 'Baik', RR: 'Rusak Ringan', RB: 'Rusak Berat' }

// ── Bentuk CETAK ────────────────────────────────────────────────────────────
// Sejak 2026-10-02 TAK ADA lagi format yang menggambar petak centang bertingkat
// (III.B.5 & III.B.11 terakhir yang memakainya): layar, cetak, & Excel membaca
// kolom yang sama. `tanda`/`syarat`/`sumber` di `KolomLhi` dipertahankan hanya
// sebagai kemampuan penyaji (`nilaiSelCetak`).

/** Isi satu sel cetak. Baris tetap yang dari `nilaiBarisLhi`. */
export function nilaiSelCetak(k: KolomLhi, r: Record<string, string | number>): string | number {
  if (k.tanda) return r[k.tanda.key] === k.tanda.sama ? '√' : ''
  if (k.syarat && r[k.syarat.key] !== k.syarat.sama) return ''
  return r[k.sumber || k.key] ?? ''
}

// ── Catatan kaki ────────────────────────────────────────────────────────────
// Catatan bertanda *) **) ***) dari lampiran Permendagri ("Hanya diisi untuk BMD yang
// ada merek/tipe", dst.) SENGAJA TIDAK dicetak (permintaan user 2026-10-01) — itu
// keterangan cara mengisi formulir, bukan isi laporan. Yang tersisa hanya KETERANGAN
// MEMBACA tabel yang kita buat sendiri (III.B.8: atas = sebelum, bawah = sesudah, hijau
// = berubah), karena tanpa itu pembaca tak tahu apa arti dua baris dalam satu sel.
// Jangan menambahkan lagi catatan salinan lampiran di sini.
export const CATATAN_KAKI: Partial<Record<LhiKode, string[]>> = {
  'III.B.8': [
    'Tiap kolom: baris ATAS = sebelum inventarisasi (data register), baris BAWAH = setelah inventarisasi. Tulisan hijau tebal = data berubah.',
  ],
}

/** Kolom untuk tabel layar & cetak. Excel memakai `kolomLhi()` (datar). */
export function kolomLhiTampil(k: LhiKode, _cetak: boolean, golongan = ''): KolomLhi[] {
  // III.B.5 & III.B.11 bergantung golongan (BAST/SIP rumah negara; spesifikasi form LKI).
  if (k === 'III.B.5') return kolomPegawai(golongan, true)
  if (k === 'III.B.11') return kolomBelumTercatat(golongan, true)
  const tetap = TAMPIL_TETAP[k]
  if (tetap) return tetap
  return kolomLhi(k, golongan)
}

// Kop lampiran & data induk: lib/inventarisasiLhiKop.ts (diekspor ulang di sini).
export {
  PENGELOLA_BARANG_LHI, identitasLhi, tglLhi, kebutuhanIndukLive,
  type IdentitasLhi, type IndukLive,
} from '@/lib/inventarisasiLhiKop'

export function kolomLhi(k: LhiKode, golongan = ''): KolomLhi[] {
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
    case 'III.B.2':
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_2`.
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
        { key: 'alasan', label: 'Alasan Tidak Ada' },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.4':
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_4`.
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
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.5':
      // Datar (Excel); susunan yang DILIHAT sama kolomnya, sel ditumpuk.
      return kolomPegawai(golongan, false)
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
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_7`.
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
        { key: 'kondisi_sebelum', label: 'Kondisi Fisik Sebelum Inventarisasi' },
        { key: 'kondisi_setelah', label: 'Kondisi Fisik Setelah Inventarisasi' },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
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
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_9`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'g_nama', label: 'Nama Barang', grup: GRUP_GANDA },
        { key: 'g_nibar', label: 'NIBAR', grup: GRUP_GANDA },
        { key: 'g_tgl', label: 'Tanggal Perolehan', grup: GRUP_GANDA },
        { key: 'g_nilai', label: 'Nilai Perolehan', grup: GRUP_GANDA, angka: true },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.10':
      // Datar (Excel). Susunan yang DILIHAT = `TAMPIL_III_B_10`.
      return [
        { key: 'no', label: 'No' },
        { key: 'kode', label: 'Kode Barang' },
        { key: 'uraian', label: 'Uraian Barang' },
        { key: 'nama', label: 'Nama Barang' },
        { key: 'nibar', label: 'NIBAR' },
        { key: 'merek_tipe', label: 'Merk/Tipe' },
        { key: 'spek_lain', label: 'Spesifikasi Lainnya' },
        { key: 'alamat', label: 'Alamat' },
        { key: 'luas', label: 'Luas', angka: true },
        { key: 'jumlah', label: 'Jumlah', angka: true },
        { key: 'satuan', label: 'Satuan' },
        { key: 'tgl', label: 'Tanggal Perolehan' },
        { key: 'nilai', label: 'Nilai Perolehan', angka: true },
        { key: 'tanah_milik', label: 'Dibangun di Atas Tanah Milik' },
        { key: 'catatan', label: 'Catatan Inventarisasi' },
      ]
    case 'III.B.11':
      // Datar (Excel); susunan yang DILIHAT sama kolomnya, hanya sel ditumpuk.
      return kolomBelumTercatat(golongan, false)
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
    // Kunci lama (kode_barang, nama_barang, spesifikasi, ...) dipertahankan; yang
    // dipakai tabel baru: kode/uraian/nama/spek_lain/tgl/titik/kondisi/dok_*/catatan.
    // `keterangan` = Keterangan spesifikasi barang; `catatan` = Catatan Inventarisasi.
    const nilaiTotal = baru.nilai_perolehan ?? (Number(baru.jumlah) > 0 && Number(baru.harga_satuan) > 0
      ? Number(baru.jumlah) * Number(baru.harga_satuan) : '')
    return {
      no, kode_register: baru.kode_register || '', kode_barang: baru.kode_barang || '',
      kode: baru.kode_barang || '', uraian: baru.nama_barang || '',
      nama_barang: baru.nama_barang || '', spesifikasi: baru.spesifikasi || '', nama: baru.spesifikasi || '',
      merek_tipe: baru.merek_tipe || '', spek_lain: baru.spesifikasi_lainnya || '',
      jumlah: baru.jumlah ?? '', satuan: baru.satuan || '',
      nilai: nilaiTotal, harga_satuan: baru.harga_satuan ?? '',
      no_polisi: baru.no_polisi || '', no_rangka: baru.no_rangka || '', no_mesin: baru.no_mesin || '',
      no_bpkb: baru.no_bpkb || '',
      tgl_perolehan: baru.tgl_perolehan || '', tgl: tglLhi(baru.tgl_perolehan),
      // Alamat berjenjang Provinsi→Desa (admin_wilayah) + detail; `baru.alamat` teks
      // lepas dipertahankan sbg cadangan utk baris lama.
      alamat: [baru.wilayah_kode ? wilayahLabel(baru.wilayah_kode) : '', baru.alamat_detail].filter(Boolean).join(' · ') || baru.alamat || '',
      titik: baru.latitude != null && baru.longitude != null ? `${baru.latitude}, ${baru.longitude}` : '',
      kondisi: LABEL_KONDISI[baru.kondisi || ''] || '', kondisi_setelah: baru.kondisi || '',
      penggunaan: baru.penggunaan || '', keterangan: baru.keterangan || '',
      luas: baru.luas ?? '', jenis_hak: baru.jenis_hak || '',
      dok_nomor: baru.nomor_dokumen_kepemilikan || '', dok_tgl: tglLhi(baru.tanggal_dokumen_kepemilikan),
      dok_nama: baru.nama_dokumen_kepemilikan || '',
      asal_usul: baru.asal_usul || '', dasar_pencatatan: baru.dasar_pencatatan || '',
      catatan: j.keterangan || '',
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
    case 'III.B.2':
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        alasan: alasanTidakAda(j, noun), catatan: j.keterangan || '',
      }
    case 'III.B.4':
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), nilai: inti.nilai,
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
    case 'III.B.5': {
      const p = j.penggunaan
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        // Alamat lengkap Provinsi→Desa + detail (keadaan SESUDAH), sama dgn III.B.6.
        alamat: alamatLhi(s, j, wilayahLabel).st,
        pemakai_pengguna: p?.nama || '',
        pemakai_nama: p?.nama_pemakai || '', pemakai_status: p?.status_pemakai || '',
        pemakai_bast: YATIDAK(p?.bast_pemakaian), pemakai_bast_nomor: p?.bast_pemakaian ? (p.bast_nomor || '') : '',
        pemakai_sip: YATIDAK(p?.sip), pemakai_sip_nomor: p?.sip ? (p.sip_nomor || '') : '',
        catatan: j.keterangan || '',
      }
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
    case 'III.B.7': {
      const kata = (v: string | null | undefined) => LABEL_KONDISI[normalKondisi(v) || ''] || v || ''
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        tgl: tglLhi(s.tgl_perolehan), jumlah: inti.jumlah, satuan: inti.satuan, nilai: inti.nilai,
        // Kata penuh ("Baik"), bukan B/RR/RB — snapshot menyimpan 'Baik'/'Rusak Ringan'/…
        kondisi_sebelum: kata(s.kondisi), kondisi_setelah: kata(j.kondisi),
        catatan: j.keterangan || '',
      }
    }
    case 'III.B.8':
      return barisUbah(b, no, wilayahLabel)
    case 'III.B.9': {
      const g = j.ganda_data || {}
      // Tanggal kembaran dibekukan sejak 2026-10-02; isian lama → baca register.
      const live = g.aset_id ? indukLive[g.aset_id] : undefined
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        jumlah: inti.jumlah, satuan: inti.satuan,
        tgl: tglLhi(s.tgl_perolehan), nilai: inti.nilai,
        g_nama: g.nama_barang || '', g_nibar: g.nibar || '',
        g_tgl: tglLhi(g.tgl_perolehan || live?.tgl_perolehan),
        g_nilai: g.nilai_perolehan ?? live?.nilai_perolehan ?? '',
        catatan: j.keterangan || '',
      }
    }
    case 'III.B.10': {
      const label: Record<string, string> = {
        pemda: 'Pemerintah Daerah', pemda_lain: 'Pemerintah Daerah Lainnya',
        pempus: 'Pemerintah Pusat', pihak_lain: 'Pihak Lain',
      }
      const t = j.tanah_milik
      return {
        no, kode: kodeEfektif, uraian: uraianEfektif,
        nama: inti.spesifikasi, nibar: inti.nibar, merek_tipe: inti.merek_tipe,
        spek_lain: efektif(j.spesifikasi_lainnya, s.spesifikasi_lainnya),
        // Alamat lengkap Provinsi→Desa + detail (keadaan SESUDAH), sama dgn III.B.5/6.
        alamat: alamatLhi(s, j, wilayahLabel).st,
        luas: j.luas?.sesuai === false ? (j.luas.seharusnya || '').trim() || '(kosong)' : (s.luas ?? ''),
        jumlah: inti.jumlah, satuan: inti.satuan,
        tgl: tglLhi(s.tgl_perolehan), nilai: inti.nilai,
        tanah_milik: t ? `${label[t] || t}${j.tanah_milik_nama ? ` — ${j.tanah_milik_nama}` : ''}` : '',
        catatan: j.keterangan || '',
      }
    }
  }
}

/** Total nilai perolehan (baris "Jumlah (Rp)" di kaki tiap format). */
export function totalNilaiLhi(rows: Record<string, string | number>[]): number {
  return rows.reduce((s, r) => s + (typeof r.nilai === 'number' ? r.nilai : 0), 0)
}

/**
 * Kolom "Alasan Tidak Ada" III.B.2: "<sebab> : <keterangan>" — force majeure memuat
 * cerita petugas, dibongkar memuat bangunan penggantinya. Kosong utk lembar lama /
 * golongan yang tak menanyakan sebab.
 */
function alasanTidakAda(j: InvJawaban, noun: string): string {
  const v = j.sebab_tidak_ada
  const l = v === 'force_majeure' ? 'Force majeure' : labelSebab(v, noun)
  if (!l) return ''
  const rel = j.sebab_relasi
  const tambahan = v === 'force_majeure' ? (j.sebab_penjelasan || '').trim()
    : v === 'dibongkar_baru' && rel ? `${rel.nibar || '—'} ${rel.nama_barang || ''}`.trim() : ''
  return tambahan ? `${l} : ${tambahan}` : l
}

