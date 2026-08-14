// Standar Harga RKBMD — SSH · HSPK · ASB · SBU.
// Tabel `rkbmd_standar` + `rkbmd_standar_rekening` (migrasi 20260810_01).
//
// BAK BERSAMA lintas SKPD (keputusan user 2026-08-10): satu barang cukup
// diinput SEKALI se-kabupaten. Kalau SKPD lain memasukkan barang yang identitas­
// nya sama (kode + nama + satuan + harga), sistem tidak membuat baris kedua;
// kalau yang berbeda cuma kode rekeningnya, rekening itu DIGABUNG ke barang
// yang sama. Penegaknya UNIQUE index `uq_rkbmd_standar_identitas` + RPC
// `fn_rkbmd_standar_simpan` — bukan pengecekan di UI, supaya dua operator yang
// menyimpan bersamaan tetap tak bisa melahirkan baris kembar.
//
// ⚠️ Berkas ini HANYA MEMBACA (migrasi 20260814_01). Bak bersamanya diisi
// semata-mata lewat persetujuan usulan; lihat catatan di bawah blok fetchStandar
// dan lib/rkbmdStandarUsulan.ts.
//
// SBSK TIDAK di sini: bentuknya beda (kuantitas standar per satuan pengukur,
// bukan harga) dan tabelnya sendiri (`rkbmd_sbsk`). Yang disatukan cuma menunya.
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandarJenis = 'ssh' | 'hspk' | 'asb' | 'sbu'

export type StandarConfig = {
  jenis: StandarJenis
  judul: string
  deskripsi: string
  /** ssh/hspk bersandar ke kode barang BMD; asb/sbu tidak (bukan barang). */
  pakaiKodeBarang: boolean
  /** TKDN hanya bermakna untuk barang — honorarium & perjalanan dinas tidak punya. */
  pakaiTkdn: boolean
  /** Label kolom nama — beda kata untuk barang vs komponen belanja. */
  labelNama: string
  labelHarga: string
}

export const STANDAR_CONFIG: Record<StandarJenis, StandarConfig> = {
  ssh: {
    jenis: 'ssh',
    judul: 'Standar Satuan Harga (SSH)',
    deskripsi:
      'Acuan harga satuan barang per tahun anggaran (Permendagri 19/2016 Pasal 20). ' +
      'Satu bak bersama untuk seluruh SKPD — barang yang sudah diinput SKPD lain tidak perlu diinput ulang. ' +
      'Dipakai sebagai dasar penyusunan RKBMD Pengadaan.',
    pakaiKodeBarang: true,
    pakaiTkdn: true,
    labelNama: 'Spesifikasi Nama Barang',
    labelHarga: 'Harga Satuan',
  },
  hspk: {
    jenis: 'hspk',
    judul: 'Harga Satuan Pokok Kegiatan (HSPK)',
    deskripsi:
      'Harga satuan pekerjaan/bahan hasil analisis, dipakai menyusun rencana biaya kegiatan fisik. ' +
      'Bersandar ke kode barang BMD seperti SSH, dan sama-sama satu bak bersama lintas SKPD.',
    pakaiKodeBarang: true,
    pakaiTkdn: true,
    labelNama: 'Spesifikasi Nama Barang / Pekerjaan',
    labelHarga: 'Harga Satuan',
  },
  asb: {
    jenis: 'asb',
    judul: 'Analisis Standar Belanja (ASB)',
    deskripsi:
      'Penilaian kewajaran beban kerja & biaya suatu kegiatan. Komponennya BUKAN barang, ' +
      'jadi tidak memakai kode barang BMD — cukup uraian komponen belanja, satuan, dan besarannya.',
    pakaiKodeBarang: false,
    pakaiTkdn: false,
    labelNama: 'Uraian Komponen Belanja',
    labelHarga: 'Besaran / Pagu Satuan',
  },
  sbu: {
    jenis: 'sbu',
    judul: 'Standar Biaya Umum (SBU)',
    deskripsi:
      'Batas tertinggi biaya umum: honorarium, perjalanan dinas, rapat, dan sejenisnya. ' +
      'Bukan barang, jadi tanpa kode barang BMD dan tanpa TKDN.',
    pakaiKodeBarang: false,
    pakaiTkdn: false,
    labelNama: 'Uraian Komponen Biaya',
    labelHarga: 'Besaran Tertinggi',
  },
}

export type StandarRow = {
  id: number
  jenis: StandarJenis
  tahun: number
  kode: string | null
  nama: string
  satuan: string | null
  harga: number
  tkdn: number | null
  /** Merk/Tipe (migrasi 20260813_04). SENGAJA di luar `identitas`: rumus dedup
   *  itu kembar di tiga tempat, dan menambah ruas di sana harus persis sama di
   *  ketiganya. Konsekuensinya barang identik ber-merk beda tetap satu baris —
   *  merk pengusul pertama yang tercatat, usulan berikutnya hanya mengisi bila
   *  masih kosong. */
  merk_tipe: string | null
  keterangan: string | null
  skpd_id: number | null
  /** Dirakit dari `rkbmd_standar_rekening` — bisa lebih dari satu (hasil gabungan antar-SKPD). */
  rekening: string[]
  /** Nama SKPD pembuat, untuk kolom "Diinput oleh". */
  skpd_nama: string | null
}

const COLS = 'id,jenis,tahun,kode,nama,satuan,harga,tkdn,merk_tipe,keterangan,skpd_id,admin_skpd(nama)'

/** Jumlah slot rekening di FORM (permintaan user). Tabelnya sendiri tak dibatasi
 *  — batas keras akan mematahkan penggabungan begitu SKPD ke-6 datang. */
export const SLOT_REKENING = 5

/** Baris standar + rekeningnya untuk satu jenis & tahun.
 *  MELEMPAR kalau query gagal — halaman ini jadi dasar angka anggaran, jadi
 *  "kosong" tak boleh diam-diam berarti "query error" (rules.md fail-closed). */
export async function fetchStandar(
  supabase: SupabaseClient,
  jenis: StandarJenis,
  tahun: number,
): Promise<StandarRow[]> {
  const { data, error } = await supabase
    .from('rkbmd_standar')
    .select(COLS)
    .eq('jenis', jenis)
    .eq('tahun', tahun)
    .order('kode', { nullsFirst: false })
    .order('nama')
  if (error) throw new Error(`gagal membaca standar harga: ${error.message}`)

  const rows = ((data || []) as unknown as (Omit<StandarRow, 'rekening' | 'skpd_nama'> & {
    admin_skpd: { nama: string } | null
  })[]).map(r => ({ ...r, rekening: [] as string[], skpd_nama: r.admin_skpd?.nama ?? null }))

  if (rows.length === 0) return rows
  const byId = new Map(rows.map(r => [r.id, r]))
  const { data: rek, error: rekErr } = await supabase
    .from('rkbmd_standar_rekening')
    .select('standar_id,kode_rekening')
    .in('standar_id', rows.map(r => r.id))
    .order('kode_rekening')
  if (rekErr) throw new Error(`gagal membaca kode rekening standar: ${rekErr.message}`)
  for (const r of (rek || []) as { standar_id: number; kode_rekening: string }[]) {
    byId.get(r.standar_id)?.rekening.push(r.kode_rekening)
  }
  return rows
}

// ⚠️ TIDAK ADA fungsi tulis di berkas ini, dan itu disengaja (migrasi
// 20260814_01, keputusan user 2026-08-14). `simpanStandar`/`ubahStandar`/
// `hapusStandar` sudah DICABUT: GRANT tulis ke `rkbmd_standar` &
// `rkbmd_standar_rekening` dicabut dari `authenticated`, jadi satu-satunya
// penulisnya kini `fn_standar_usulan_setujui` (masuk) & `fn_standar_usulan_
// buka_kunci` (keluar). Membetulkan baris yang salah = Buka Kunci → SKPD
// perbaiki di usulannya → ajukan → setujui lagi.
//
// Kalau suatu saat terasa perlu menambahkan fungsi tulis di sini lagi, berarti
// ada yang hendak memintas Usulan → Validasi — dan itu justru lubang yang
// migrasi 20260814_01 tutup. Pintu masuknya lewat lib/rkbmdStandarUsulan.ts.

// ── Format import Excel ─────────────────────────────────────────────────────
// Judul kolom berkas import DITURUNKAN dari `STANDAR_CONFIG`, bukan ditulis
// tangan: berkas yang diunduh operator dan pembacanya (StandarImport) wajib
// menyebut kolom yang sama persis, dan label per jenis memang berbeda
// ("Harga Satuan" vs "Besaran / Pagu Satuan"). Menulis daftarnya dua kali akan
// membuat format yang diunduh perlahan menyimpang dari yang bisa dibaca.

/** Judul kolom lembar isian, urut kiri ke kanan.
 *  Merk/Tipe ikut untuk jenis yang berbasis barang — kolomnya sudah ada di form
 *  usulan sejak 20260813_04, dan berkas import yang tak memuatnya akan
 *  memaksa operator mengetik ulang merk satu per satu sesudah mengimpor. */
export function kolomTemplate(jenis: StandarJenis): string[] {
  const cfg = STANDAR_CONFIG[jenis]
  return [
    ...(cfg.pakaiKodeBarang ? ['Kode Barang'] : []),
    cfg.labelNama,
    ...(cfg.pakaiKodeBarang ? ['Merk / Tipe'] : []),
    'Satuan',
    cfg.labelHarga,
    ...(cfg.pakaiTkdn ? ['TKDN (%)'] : []),
    ...Array.from({ length: SLOT_REKENING }, (_, i) => `Kode Rekening ${i + 1}`),
    'Keterangan',
  ]
}

/** Unduh berkas format: satu lembar isian (judul kolom saja) + satu lembar
 *  Petunjuk.
 *
 *  ⚠️ Lembar isian sengaja TANPA baris contoh. Contoh yang duduk di lembar data
 *  akan ikut terbaca sebagai barang sungguhan begitu berkasnya diunggah tanpa
 *  dihapus — dan di bak bersama lintas SKPD, barang karangan yang terlanjur
 *  masuk akan dipakai SKPD lain menyusun anggaran. Contohnya ditaruh di lembar
 *  Petunjuk, tempat ia tak bisa ikut terimpor. */
export function unduhTemplateStandar(jenis: StandarJenis, tahun: number): void {
  const cfg = STANDAR_CONFIG[jenis]
  const kolom = kolomTemplate(jenis)

  const wb = XLSX.utils.book_new()

  const wsIsi = XLSX.utils.aoa_to_sheet([kolom])
  wsIsi['!cols'] = kolom.map(k => ({ wch: Math.max(k.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, wsIsi, 'Isian')

  const petunjuk: string[][] = [
    [`Format import ${cfg.judul} — Tahun Anggaran ${tahun}`],
    [''],
    ['Cara pakai:'],
    ['1. Isi lembar "Isian". Satu baris = satu barang/komponen. Jangan mengubah judul kolomnya.'],
    ['2. Baris kosong diabaikan. Simpan sebagai .xlsx.'],
    ['3. Unggah lewat RKBMD → Standar Harga → Usulan → pilih jenis ' + cfg.jenis.toUpperCase() + ' → Import Excel.'],
    ['4. Sebelum tersimpan, semua baris diperiksa dulu & ditampilkan di layar.'],
    ['5. Isinya masuk ke USULAN, belum jadi acuan bersama. Ajukan dulu, lalu ditetapkan Pengelola di menu Validasi.'],
    [''],
    ['Keterangan kolom:'],
    ...(cfg.pakaiKodeBarang
      ? [['Kode Barang', 'WAJIB. Kode kodefikasi BMD, mis. 1.3.2.10.01.02.001. Harus sudah terdaftar di master kodefikasi.']]
      : []),
    [cfg.labelNama, 'WAJIB. Nama/uraian sedetail mungkin — inilah yang membedakan satu barang dari barang lain di bak bersama.'],
    ...(cfg.pakaiKodeBarang
      ? [['Merk / Tipe', 'Opsional, mis. Asus ExpertBook B1. Tidak ikut menentukan barang ini sama atau beda dengan usulan SKPD lain.']]
      : []),
    ['Satuan', 'Opsional, mis. Unit / Buah / Set. Sebaiknya diisi: satuan ikut menentukan barang ini dianggap sama atau beda.'],
    [cfg.labelHarga, 'WAJIB. Angka, tanpa "Rp". Titik ribuan boleh (1.500.000), koma untuk desimal.'],
    ...(cfg.pakaiTkdn ? [['TKDN (%)', 'Opsional. Angka 0–100. Kosongkan bila tidak diketahui.']] : []),
    [`Kode Rekening 1–${SLOT_REKENING}`, 'Opsional, boleh lebih dari satu. Kode rekening belanja 6 segmen, mis. 5.2.02.10.001.00002. Harus terdaftar di master rekening.'],
    ['Keterangan', 'Opsional.'],
    [''],
    ['Contoh pengisian (JANGAN disalin apa adanya — ini cuma gambaran):'],
    kolom,
    contohBaris(jenis),
    [''],
    ['Catatan penting:'],
    ['· Acuan bersamanya milik seluruh SKPD. Saat usulan ini DISETUJUI, barang yang identitasnya sama'],
    ['  (kode + nama + satuan + harga) tidak akan diduplikasi — kode rekening Anda digabungkan ke barang yang sudah ada.'],
    ['· Karena itu, beda harga = barang yang BERBEDA. Untuk memperbaiki harga, ubah barisnya di usulan'],
    ['  ini selagi masih draft — jangan diimpor ulang dengan harga baru.'],
  ]
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjuk)
  wsPetunjuk['!cols'] = [{ wch: 34 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'Petunjuk')

  XLSX.writeFile(wb, `Format-Import-${cfg.jenis.toUpperCase()}-TA${tahun}.xlsx`)
}

function contohBaris(jenis: StandarJenis): string[] {
  const cfg = STANDAR_CONFIG[jenis]
  return [
    ...(cfg.pakaiKodeBarang ? ['1.3.2.10.01.02.001'] : []),
    cfg.pakaiKodeBarang ? 'P.C Unit — Core i5, RAM 16GB, SSD 512GB' : 'Honorarium Narasumber Eselon II (per jam)',
    ...(cfg.pakaiKodeBarang ? ['Lenovo ThinkCentre M70q'] : []),
    cfg.pakaiKodeBarang ? 'Unit' : 'OJ',
    '17500000',
    ...(cfg.pakaiTkdn ? ['40'] : []),
    '5.2.02.10.001.00002',
    ...Array.from({ length: SLOT_REKENING - 1 }, () => ''),
    '',
  ]
}

// ── Nama belanja di balik kode rekening ─────────────────────────────────────
// "5.2.02.02.001.00004" sendirian tak memberi tahu apa pun; operator harus hafal
// atau menebak. Yang dibutuhkan: "…00004 — Belanja Modal Kendaraan Bermotor
// Beroda Dua" (permintaan user 2026-08-13).
//
// ⚠️ KUNCI JOIN-nya `admin_rekening.kode_sub_rincian`, **BUKAN** `kode_rekening`.
// Kolom yang bernama `kode_rekening` di tabel itu isinya cuma level TERATAS —
// harfiah `'5'` (Belanja) di SELURUH 406 barisnya (diverifikasi ke DB
// 2026-08-13). Menjoin ke kolom yang namanya paling cocok itu mengembalikan 0
// baris TANPA satu pun error, dan uraiannya tinggal kosong — persis bentuk
// kegagalan senyap yang di repo ini sudah berkali-kali makan korban. Kode
// lengkap 6 segmen ada di `kode_sub_rincian`, namanya di `uraian_sub_rincian`.
//
// SENGAJA tidak melempar: uraian itu HIASAN di atas kode yang sudah benar, dan
// cadangannya (menampilkan kodenya saja) persis sama dengan tampilan hari ini.
// Menjatuhkan form penyusunan anggaran gara-gara label gagal dibaca jelas lebih
// merugikan daripada label yang absen.
export async function fetchUraianRekening(
  supabase: SupabaseClient,
  kodes: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(kodes.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await supabase.from('admin_rekening')
      .select('kode_sub_rincian,uraian_sub_rincian')
      .in('kode_sub_rincian', uniq.slice(i, i + 200))
    for (const r of (data || []) as { kode_sub_rincian: string | null; uraian_sub_rincian: string | null }[]) {
      if (r.kode_sub_rincian && r.uraian_sub_rincian) out.set(r.kode_sub_rincian, r.uraian_sub_rincian)
    }
  }
  return out
}

/** "<kode> — <nama belanja>", atau kodenya saja kalau namanya tak ketemu. */
export function labelRekening(kode: string, uraian: Map<string, string>): string {
  const u = uraian.get(kode)
  return u ? `${kode} — ${u}` : kode
}
