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
import type { InvBaris, LhiKode, SesuaiField } from '@/lib/inventarisasi'
import { normalKondisi } from '@/lib/inventarisasi'

export type KolomLhi = { key: string; label: string; grup?: string; angka?: boolean }

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

export function kolomLhi(k: LhiKode): KolomLhi[] {
  switch (k) {
    case 'III.B.3':
      return [
        ...INTI(),
        { key: 'induk_nibar', label: 'NIBAR', grup: 'Data Awal/Induk' },
        { key: 'induk_kode_barang', label: 'Kode Barang', grup: 'Data Awal/Induk' },
        { key: 'induk_kode_lokasi', label: 'Kode Lokasi', grup: 'Data Awal/Induk' },
        { key: 'induk_kode_register', label: 'Kode Register', grup: 'Data Awal/Induk' },
        { key: 'induk_nama_barang', label: 'Nama Barang', grup: 'Data Awal/Induk' },
        { key: 'induk_spesifikasi', label: 'Spesifikasi Nama Barang', grup: 'Data Awal/Induk' },
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
      return [
        ...INTI({ nibar: false }),
        { key: 'no_polisi', label: 'Nomor Polisi' },
        { key: 'no_rangka', label: 'No. Rangka' },
        { key: 'no_mesin', label: 'No. Mesin' },
        { key: 'harga_satuan', label: 'Harga Satuan Barang (Rp)', angka: true },
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
export function nilaiBarisLhi(k: LhiKode, b: InvBaris, no: number): Record<string, string | number> {
  const s = b.snapshot || {}
  const j = b.jawaban || {}
  const baru = j.baru || {}

  // Format III.B.11 — barang belum tercatat: seluruh data dari input manual.
  if (k === 'III.B.11') {
    return {
      no, kode_register: baru.kode_register || '', kode_barang: baru.kode_barang || '',
      nama_barang: baru.nama_barang || '', spesifikasi: baru.spesifikasi || '',
      merek_tipe: baru.merek_tipe || '', jumlah: baru.jumlah ?? '', satuan: baru.satuan || '',
      nilai: baru.nilai_perolehan ?? '', no_polisi: baru.no_polisi || '',
      no_rangka: baru.no_rangka || '', no_mesin: baru.no_mesin || '',
      harga_satuan: baru.harga_satuan ?? '', tgl_perolehan: baru.tgl_perolehan || '',
      alamat: baru.alamat || '', dasar_pencatatan: baru.dasar_pencatatan || '',
      kondisi_setelah: baru.kondisi || '', keterangan: j.keterangan || '',
    }
  }

  // Kode Barang & Nama Barang berpasangan: koreksi kodenya sekaligus membawa
  // uraian barunya. Jumlah & nilai perolehan TIDAK bisa diubah lewat LKI, jadi
  // selalu dari snapshot. "Kode Register" tak ada di sistem → dikosongkan.
  const kodeEfektif = j.kode_barang?.sesuai === false
    ? (j.kode_barang.kode_baru || '(kosong)')
    : (s.kode || '')
  const uraianEfektif = j.kode_barang?.sesuai === false
    ? (j.kode_barang.uraian_baru || '(kosong)')
    : (s.uraian_barang || '')
  const alamatEfektif = j.alamat?.sesuai === false
    ? [j.alamat.alamat_detail, j.alamat.wilayah_kode].filter(Boolean).join(' · ') || '(kosong)'
    : (s.alamat || '')

  const inti = {
    no,
    nibar: s.nibar || '',
    kode_register: '',
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
    case 'III.B.3':
      return {
        ...inti,
        induk_nibar: j.induk?.nibar || '', induk_kode_barang: j.induk?.kode_barang || '',
        induk_kode_lokasi: j.induk?.kode_lokasi || '', induk_kode_register: j.induk?.kode_register || '',
        induk_nama_barang: j.induk?.nama_barang || '', induk_spesifikasi: j.induk?.spesifikasi || '',
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
        ...inti,
        guna_pihak: p ? (label[p.pihak] || p.pihak) : '',
        guna_nama: p?.nama || '',
        guna_dokumen: p?.nama_dokumen || '',
        guna_dasar: p?.dasar_ada ? 'Ada' : 'Tidak ada dokumen penguasaan',
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
        sb_kode_register: '', sb_spesifikasi: s.nama_barang || '',
        sb_jumlah: s.jumlah ?? '', sb_alamat: s.alamat || '',
        st_kode_barang: kodeEfektif,
        st_nama_barang: uraianEfektif,
        st_kode_register: '',
        st_spesifikasi: efektif(j.spesifikasi, s.nama_barang),
        // Jumlah tak bisa diubah lewat LKI → sebelum = sesudah.
        st_jumlah: s.jumlah ?? '',
        st_alamat: alamatEfektif,
        satuan: efektif(j.satuan, s.satuan),
        nilai: s.nilai_perolehan ?? '',
        keterangan: [ekstra, j.keterangan].filter(Boolean).join(' — '),
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
      return inti
  }
}

/** Total nilai perolehan (baris "Jumlah (Rp)" di kaki tiap format). */
export function totalNilaiLhi(rows: Record<string, string | number>[]): number {
  return rows.reduce((s, r) => s + (typeof r.nilai === 'number' ? r.nilai : 0), 0)
}
