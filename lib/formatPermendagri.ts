// ============================================================================
// Format laporan Permendagri 47/2021 — cabang PEROLEHAN (IV.A)
//
// Rencana & keputusannya: docs/pelaporan-permendagri-plan.md
//
// KENAPA SATU BERKAS: keempat cara perolehan (Hibah 2.x, Hasil Inventarisasi
// 7.x, Tukar Menukar 8.x, Perolehan Lainnya 10.x) punya lembar yang IDENTIK di
// kolom (9)–(18) dan hanya berbeda pada SATU blok di tengah — dokumen sumber &
// lawan transaksinya. Menyalin halaman cetak per cara perolehan berarti empat
// tempat yang harus disunting tiap kali satu kolom bergeser, dan yang terlewat
// tak akan pernah error — ia cuma mencetak lembar yang beda susunan.
//
// ⚠️ PENOMORAN KOLOM DITULIS EKSPLISIT PER FORMAT, JANGAN DIHITUNG.
// Lembar Hibah (IV.A.2.2) menomori "(14)" DUA KALI — Jumlah Barang & Satuan
// Barang — lalu lompat ke (16). Itu salah ketik di sumbernya dan **tetap
// diikuti**: lembar resmi dicocokkan pemeriksa kolom per kolom, jadi merapikan
// penomoran justru membuatnya tak cocok. Tiga format lain menomori (14)(15)
// dengan benar. Jangan "membetulkan" yang di Hibah.
//
// ⚠️ PENANDA SUBTOTAL JUGA BERGESER antar format karena jumlah kolomnya beda
// (Hibah & Perolehan Lainnya 25–28; Inventarisasi & Tukar Menukar 26–29).
// ============================================================================

/** Kedalaman kodefikasi yang punya baris subtotal, dari yang PALING DALAM. */
export const SEG_SUBTOTAL = [6, 5, 4, 3] as const

/**
 * Tangga rekap IV.A.<n>.3–6. Satu tabel yang sama di empat kedalaman —
 * kolomnya identik (Kode · Nama · Jumlah Barang · Jumlah Rp), yang berbeda cuma
 * sampai level mana kode dijumlahkan.
 *
 * ⚠️ Urutannya BUKAN kebetulan: `.3` paling dalam, `.6` paling dangkal.
 */
export const TANGGA_REKAP = [
  { akhiran: 3, seg: 6, menurut: 'SUB RINCIAN OBJEK' },
  { akhiran: 4, seg: 5, menurut: 'RINCIAN OBJEK' },
  { akhiran: 5, seg: 4, menurut: 'OBJEK' },
  { akhiran: 6, seg: 3, menurut: 'JENIS' },
] as const

/** Banyaknya sel segmen kode di lembar rinci (kode penuh = 7 segmen). */
export const SEL_KODE = 7

// ── Kolom ───────────────────────────────────────────────────────────────────

export type KolomKey =
  | 'nama' | 'spek_nama' | 'nibar' | 'spek_lain' | 'jumlah' | 'satuan'
  | 'harga_satuan' | 'total_nilai' | 'kondisi' | 'keterangan'
  | 'tgl_perolehan'
  // blok khas per cara perolehan
  | 'sumber_dana' | 'pihak'
  | 'dok_nama' | 'dok_nomor' | 'dok_tanggal'
  | 'ba_tanggal' | 'ba_nomor'
  | 'penyebab'

export type Kolom = {
  key: KolomKey
  judul: string
  /** Nomor kolom di lembar aslinya — DITULIS, bukan dihitung (lihat kepala berkas). */
  nomor: number
  /** Judul grup di atasnya, kalau kolom ini bagian dari blok bertingkat. */
  grup?: string
  /** Lebar kolom dalam persen. Total seluruh kolom + blok kode = 100. */
  lebar: number
  rata?: 'kiri' | 'tengah' | 'kanan'
  /** Isi rumusnya, dicetak di baris nomor (mis. "(17) = (14)x(16)"). */
  rumus?: string
}

export type FormatPerolehan = {
  /** Kode lembar rinci, mis. 'IV.A.2.2'. */
  kode: string
  /** Awalan kode format tanpa akhiran, mis. 'IV.A.2' — dipakai tangga rekap. */
  awalan: string
  /** Jenis ledger yang disaring. */
  jenis: string
  /** Judul lembar, tanpa "BERUPA…(1)" yang diisi jenis asetnya. */
  judul: string
  kolom: Kolom[]
  /** Penanda subtotal untuk SEG_SUBTOTAL — searah, [6seg, 5seg, 4seg, 3seg]. */
  subtotal: readonly [number, number, number, number]
  /** Nomor isian di kaki lembar. */
  kaki: { tanggal: number; jabatan: number; nama: number }
}

/** Sepuluh kolom pertama — IDENTIK di keempat format. `nomor` diisi pemanggil. */
function kolomAwal(nomorSatuan: number): Kolom[] {
  return [
    { key: 'nama', judul: 'Nama Barang', nomor: 10, lebar: 7.5, rata: 'kiri' },
    { key: 'spek_nama', judul: 'Spesifikasi Nama Barang', nomor: 11, lebar: 7, rata: 'kiri' },
    // ⚠️ NIBAR 45 digit — kolom ini TIDAK BOLEH dipersempit. Ia dipenggal dua
    // baris di batas segmen oleh `pecahNibar()`; kalau lebarnya kurang, baris
    // pertama membungkus sendiri lebih dulu dan hasilnya jadi TIGA baris.
    { key: 'nibar', judul: 'NIBAR', nomor: 12, lebar: 9.5, rata: 'kiri' },
    { key: 'spek_lain', judul: 'Spesifikasi Lainnya', nomor: 13, lebar: 6, rata: 'kiri' },
    { key: 'jumlah', judul: 'Jumlah Barang', nomor: 14, lebar: 3.2, rata: 'kanan' },
    { key: 'satuan', judul: 'Satuan Barang', nomor: nomorSatuan, lebar: 3.8, rata: 'tengah' },
    { key: 'harga_satuan', judul: 'Harga Satuan (Rp)', nomor: 16, lebar: 6, rata: 'kanan' },
    { key: 'total_nilai', judul: 'Total Nilai Barang (Rp)', nomor: 17, lebar: 6.5, rata: 'kanan', rumus: '(17) = (14)x(16)' },
    { key: 'kondisi', judul: 'Kondisi Barang', nomor: 18, lebar: 4.5, rata: 'tengah' },
  ]
}

/**
 * ⚠️ Kolom (12) diisi **NIBAR saja** (keputusan user 2026-08-30). Lembar aslinya
 * berjudul "NIBAR/NUSP"; NUSP tidak dipakai aplikasi ini, jadi judulnya pun
 * ditulis "NIBAR" supaya tak ada kolom yang menjanjikan isi yang tak pernah ada.
 */
export const FORMAT_PEROLEHAN: Record<string, FormatPerolehan> = {
  // ── Hibah / Sumbangan ─────────────────────────────────────────────────────
  hibah_masuk: {
    kode: 'IV.A.2.2',
    awalan: 'IV.A.2',
    jenis: 'hibah_masuk',
    judul: 'LAPORAN PEROLEHAN/PENERIMAAN BMD DARI HIBAH/SUMBANGAN ATAU YANG SEJENIS BERUPA',
    // ⚠️ `satuan` bernomor 14 — SAMA dengan `jumlah`. Salah ketik di lembar
    // asli, sengaja diikuti. Lihat kepala berkas.
    kolom: [
      ...kolomAwal(14),
      { key: 'sumber_dana', judul: 'Sumber Dana', nomor: 19, lebar: 5, rata: 'kiri' },
      { key: 'pihak', judul: 'Pihak Pemberi Hibah/Sumbangan Atau Yang Sejenis', nomor: 20, lebar: 7, rata: 'kiri' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 21, lebar: 5, rata: 'tengah' },
      { key: 'ba_tanggal', judul: 'Tanggal', nomor: 22, grup: 'Berita Acara Serah Terima/dokumen pendukung lainnya', lebar: 4.5, rata: 'tengah' },
      { key: 'ba_nomor', judul: 'Nomor', nomor: 23, grup: 'Berita Acara Serah Terima/dokumen pendukung lainnya', lebar: 5, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 24, lebar: 5.3, rata: 'kiri' },
    ],
    subtotal: [25, 26, 27, 28],
    kaki: { tanggal: 29, jabatan: 30, nama: 31 },
  },

  // ── Hasil Inventarisasi ───────────────────────────────────────────────────
  hasil_inventarisasi: {
    kode: 'IV.A.7.2',
    awalan: 'IV.A.7',
    jenis: 'hasil_inventarisasi',
    judul: 'LAPORAN PEROLEHAN/PENERIMAAN BMD DARI HASIL INVENTARISASI BERUPA',
    kolom: [
      ...kolomAwal(15),
      { key: 'dok_nama', judul: 'Nama dokumen', nomor: 19, grup: 'Dokumen Lainnya', lebar: 5, rata: 'kiri' },
      { key: 'dok_nomor', judul: 'Nomor', nomor: 20, grup: 'Dokumen Lainnya', lebar: 4.5, rata: 'kiri' },
      { key: 'dok_tanggal', judul: 'Tanggal', nomor: 21, grup: 'Dokumen Lainnya', lebar: 4, rata: 'tengah' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 22, lebar: 5, rata: 'tengah' },
      { key: 'ba_tanggal', judul: 'Tanggal', nomor: 23, grup: 'Berita Acara Hasil Inventarisasi/dokumen pendukung lainnya', lebar: 4, rata: 'tengah' },
      { key: 'ba_nomor', judul: 'Nomor', nomor: 24, grup: 'Berita Acara Hasil Inventarisasi/dokumen pendukung lainnya', lebar: 4.5, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 25, lebar: 5.3, rata: 'kiri' },
    ],
    subtotal: [26, 27, 28, 29],
    kaki: { tanggal: 30, jabatan: 31, nama: 32 },
  },

  // ── Tukar Menukar ─────────────────────────────────────────────────────────
  tukar_menukar: {
    kode: 'IV.A.8.2',
    awalan: 'IV.A.8',
    jenis: 'tukar_menukar',
    judul: 'LAPORAN PEROLEHAN/PENERIMAAN BMD DARI HASIL TUKAR MENUKAR BERUPA',
    kolom: [
      ...kolomAwal(15),
      { key: 'dok_tanggal', judul: 'Tanggal', nomor: 19, grup: 'Perjanjian Tukar Menukar', lebar: 4.5, rata: 'tengah' },
      { key: 'dok_nomor', judul: 'Nomor', nomor: 20, grup: 'Perjanjian Tukar Menukar', lebar: 4.5, rata: 'kiri' },
      // Mitra memakai `payload.pihak` yang sama dengan Pihak Pemberi Hibah —
      // satu kolom di DB, label berbeda per cara perolehan (pola `pihakLabel`
      // di PerolehanManual).
      { key: 'pihak', judul: 'Mitra Tukar Menukar', nomor: 21, lebar: 5.5, rata: 'kiri' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 22, lebar: 5, rata: 'tengah' },
      { key: 'ba_tanggal', judul: 'Tanggal', nomor: 23, grup: 'Berita Acara Serah Terima', lebar: 4, rata: 'tengah' },
      { key: 'ba_nomor', judul: 'Nomor', nomor: 24, grup: 'Berita Acara Serah Terima', lebar: 4.5, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 25, lebar: 5.3, rata: 'kiri' },
    ],
    subtotal: [26, 27, 28, 29],
    kaki: { tanggal: 30, jabatan: 31, nama: 32 },
  },

  // ── Perolehan / Penerimaan Lainnya ────────────────────────────────────────
  perolehan_lainnya: {
    kode: 'IV.A.10.2',
    awalan: 'IV.A.10',
    jenis: 'perolehan_lainnya',
    judul: 'LAPORAN PEROLEHAN/PENERIMAAN BMD DARI PEROLEHAN/PENERIMAAN LAINNYA',
    // ⚠️ Tak ada kolom BAST di sini — dokumen satu-satunya adalah "Dokumen
    // Sumber Perolehan", jadi Nomor & Tanggal-nya dilayani `no_sk`/`tanggal`
    // jurnal_header. Yang belum tersimpan cuma NAMA dokumennya & Penyebab.
    kolom: [
      ...kolomAwal(15),
      { key: 'dok_nama', judul: 'Nama Dokumen', nomor: 19, grup: 'Dokumen Sumber Perolehan', lebar: 5.5, rata: 'kiri' },
      { key: 'dok_nomor', judul: 'Nomor', nomor: 20, grup: 'Dokumen Sumber Perolehan', lebar: 5, rata: 'kiri' },
      { key: 'dok_tanggal', judul: 'Tanggal', nomor: 21, grup: 'Dokumen Sumber Perolehan', lebar: 4.5, rata: 'tengah' },
      { key: 'tgl_perolehan', judul: 'Tanggal, Bulan, Tahun Perolehan', nomor: 22, lebar: 5, rata: 'tengah' },
      { key: 'penyebab', judul: 'Penyebab Perolehan', nomor: 23, lebar: 6, rata: 'kiri' },
      { key: 'keterangan', judul: 'Keterangan', nomor: 24, lebar: 5.8, rata: 'kiri' },
    ],
    subtotal: [25, 26, 27, 28],
    kaki: { tanggal: 29, jabatan: 30, nama: 31 },
  },
}

/**
 * Lebar blok "Kode Barang" (persen) = sisa dari 100 setelah kolom lain.
 *
 * ⚠️ Inilah yang membuat lembarnya "fit to window": dengan `table-fixed` dan
 * total lebar PERSIS 100%, tak ada kolom yang bisa melar mengikuti isinya lalu
 * mendorong yang lain keluar halaman. Pelajaran lembar RKBMD & `/cetak/
 * perolehan` — dua-duanya pernah kena. Dikunci test.
 */
export function lebarKodeBlok(f: FormatPerolehan): number {
  const dipakai = f.kolom.reduce((a, k) => a + k.lebar, 0)
  return Math.round((100 - dipakai) * 100) / 100
}

// ── Kodefikasi ──────────────────────────────────────────────────────────────

/** `'1.3.2.05.02.06.121'` → `['1','3','2','05','02','06','121']`. */
export const segmenKode = (kode: string): string[] => (kode || '').split('.')

/**
 * Awalan `n` segmen pertama. `n` lebih besar dari panjang kode → kodenya utuh
 * (bukan `undefined` yang menyamar jadi kelompok tersendiri).
 */
export function prefixSeg(kode: string, n: number): string {
  return segmenKode(kode).slice(0, n).join('.')
}

// ── Mesin subtotal ──────────────────────────────────────────────────────────

/** Satu barang, seperlunya saja — sisanya dibawa `data` untuk dirender. */
export type ItemLaporan<T> = { kode: string; jumlah: number; nilai: number; data: T }

/**
 * Kedalaman TERDANGKAL di lembar REKAP: 2 segmen = kelompok neraca
 * (`1.3` Aset Tetap, `1.5` Aset Lainnya).
 *
 * ⚠️ Lembar rinci mulai dari 3 segmen, rekap dari 2 — bukan kelalaian, memang
 * begitu lembar aslinya: keempat lembar rekap menampilkan baris `x. x.` di
 * paling atas, sedangkan lembar rinci mulai di `x x x`.
 */
export const SEG_MIN_REKAP = 2

export type BarisGrup = {
  tipe: 'grup'
  /** Kedalaman segmen kelompok ini. */
  seg: number
  kode: string
  jumlah: number
  nilai: number
  /** Penanda subtotal di lembar asli (mis. 25) — hanya di lembar RINCI. */
  penanda?: number
}
export type BarisItem<T> = { tipe: 'item'; kode: string; data: T; jumlah: number; nilai: number }
export type BarisRinci<T> = BarisGrup | BarisItem<T>

/** Total per (kedalaman, awalan). Satu sapuan, dipakai rinci MAUPUN rekap. */
function petaTotal<T>(items: ItemLaporan<T>[], segs: number[]): Map<string, { jumlah: number; nilai: number }> {
  const m = new Map<string, { jumlah: number; nilai: number }>()
  for (const it of items) {
    for (const seg of segs) {
      if (segmenKode(it.kode).length < seg) continue
      const k = `${seg}|${prefixSeg(it.kode, seg)}`
      const t = m.get(k) || { jumlah: 0, nilai: 0 }
      t.jumlah += it.jumlah; t.nilai += it.nilai
      m.set(k, t)
    }
  }
  return m
}

/**
 * Menyusuri `items` sekali, memancarkan baris KELOMPOK tiap kali awalannya
 * berubah — dari dangkal ke dalam, sehingga `1.3.2` selalu tercetak sebelum
 * `1.3.2.05`.
 *
 * ⚠️ Urutan masuk menentukan segalanya, jadi `items` WAJIB sudah urut menaik
 * menurut `kode`. Fungsi ini sengaja TIDAK mengurutkan sendiri: pemanggilnya
 * sudah punya urutan total (kode → nama → NIBAR sebagai pemecah seri), dan
 * mengurutkan ulang di sini akan diam-diam membuang pemecah serinya sehingga
 * barang bernama kembar bertukar tempat tiap kali lembarnya dicetak ulang.
 */
function jalanKelompok<T>(
  items: ItemLaporan<T>[], segMin: number, segMax: number,
  emitGrup: (b: BarisGrup) => void,
  emitItem?: (it: ItemLaporan<T>) => void,
): void {
  const segs: number[] = []
  for (let s = segMin; s <= segMax; s++) segs.push(s)
  const total = petaTotal(items, segs)
  const terakhir = new Map<number, string>()

  for (const it of items) {
    const panjang = segmenKode(it.kode).length
    for (const seg of segs) {
      // Kode yang lebih pendek dari tingkat ini tak punya kelompok di sini —
      // tanpa penjaga ini ia melahirkan baris kelompok kembar berisi kode yang
      // sama persis di beberapa tingkat sekaligus.
      if (panjang < seg) continue
      const pre = prefixSeg(it.kode, seg)
      if (terakhir.get(seg) === pre) continue
      terakhir.set(seg, pre)
      // Kelompok yang LEBIH DALAM wajib ikut terbuka lagi; kalau tidak,
      // kelompok bernama sama di cabang lain dikira sudah tercetak.
      for (const d of segs) if (d > seg) terakhir.delete(d)
      const t = total.get(`${seg}|${pre}`) || { jumlah: 0, nilai: 0 }
      emitGrup({ tipe: 'grup', seg, kode: pre, jumlah: t.jumlah, nilai: t.nilai })
    }
    emitItem?.(it)
  }
}

/**
 * Baris lembar RINCI (IV.A.<n>.2): kelompok 3→6 segmen berikut subtotalnya,
 * masing-masing DI ATAS anggotanya, lalu baris barangnya.
 *
 * Kelompok tampil lebih dulu memang bentuk lembar aslinya — pemeriksa membaca
 * totalnya dulu, baru rinciannya.
 */
export function susunRinci<T>(
  items: ItemLaporan<T>[], subtotal: readonly [number, number, number, number],
): BarisRinci<T>[] {
  // SEG_SUBTOTAL = [6,5,4,3] sejajar indeks dengan subtotal = [25,26,27,28].
  const penandaUntuk = new Map<number, number>()
  SEG_SUBTOTAL.forEach((seg, i) => penandaUntuk.set(seg, subtotal[i]))

  const out: BarisRinci<T>[] = []
  jalanKelompok(items, 3, 6,
    g => out.push({ ...g, penanda: penandaUntuk.get(g.seg) }),
    it => out.push({ tipe: 'item', kode: it.kode, data: it.data, jumlah: it.jumlah, nilai: it.nilai }))
  return out
}

/**
 * Baris lembar REKAP (IV.A.<n>.3–6) — hierarki yang SAMA, dipotong di
 * kedalaman `segMax`, tanpa baris barang.
 *
 * ⚠️ Sengaja memakai penyusun yang SAMA dengan `susunRinci` (`jalanKelompok` di
 * atas satu `petaTotal`). Menulis agregasi tersendiri untuk lembar rekap berarti
 * dua jalan menuju angka yang sama, dan kalau keduanya menyimpang tak satu pun
 * laporan akan berteriak — lembar rinci & rekapnya dalam SATU berkas yang
 * ditandatangani cuma tak lagi cocok. Dikunci test.
 */
export function susunRekap<T>(items: ItemLaporan<T>[], segMax: number): BarisGrup[] {
  const out: BarisGrup[] = []
  jalanKelompok(items, SEG_MIN_REKAP, segMax, g => out.push(g))
  return out
}

/** Total per awalan `seg` segmen, urut menaik menurut kode (tanpa hierarki). */
export function totalPer<T>(items: ItemLaporan<T>[], seg: number): { kode: string; jumlah: number; nilai: number }[] {
  const m = petaTotal(items, [seg])
  return [...m.entries()]
    .map(([k, v]) => ({ kode: k.slice(k.indexOf('|') + 1), ...v }))
    .sort((a, b) => a.kode.localeCompare(b.kode))
}

/** Jumlah seluruh lembar — baris JUMLAH (14) di IV.A.<n>.6. */
export function totalSemua<T>(items: ItemLaporan<T>[]): { jumlah: number; nilai: number } {
  return items.reduce((a, it) => ({ jumlah: a.jumlah + it.jumlah, nilai: a.nilai + it.nilai }),
    { jumlah: 0, nilai: 0 })
}

// ── Nama tiap tingkat kodefikasi ────────────────────────────────────────────
//
// Kolom "Nama Barang" terisi di SETIAP baris — baris barang maupun baris
// subtotal. Namanya diambil dari `admin_kodefikasi_bmd`, yang menyimpan seluruh
// hierarkinya sebagai KOLOM di baris 7-segmen yang sama:
//
//   3 seg → nama_jenis        4 seg → nama_objek
//   5 seg → nama_rincian      6 seg → nama_sub_rincian      7 seg → uraian
//
// ⚠️ Tabel itu HANYA berisi baris 7 segmen (15.353 baris, diverifikasi ke
// produksi 2026-08-30) — TIDAK ada baris tersendiri untuk awalan yang lebih
// pendek. Jadi `.in('kode', <daftar awalan>)` akan mengembalikan NOL baris tanpa
// satu pun error, dan kolom Nama Barang di semua baris subtotal tinggal kosong.
// Ambil dari kolom hierarkinya, jangan mencari barisnya.

/** Baris kodefikasi seperlunya — bentuknya sengaja minimal supaya mudah diuji. */
export type BarisKodefikasi = {
  kode: string
  uraian: string | null
  nama_jenis: string | null
  nama_objek: string | null
  nama_rincian: string | null
  nama_sub_rincian: string | null
}

/**
 * Kelompok neraca (2 segmen) — tingkat terdangkal lembar REKAP.
 *
 * ⚠️ Sengaja konstanta: tingkat ini TIDAK ADA di `admin_kodefikasi_bmd` dalam
 * bentuk apa pun (bukan sekadar tak ada barisnya — kolomnya pun tak ada).
 */
export const NAMA_KELOMPOK: Record<string, string> = {
  '1.3': 'ASET TETAP',
  '1.5': 'ASET LAINNYA',
}

/**
 * Peta `awalan kode` → nama, untuk SELURUH tingkat 2–7.
 *
 * Dirakit dari baris kodefikasi yang memang dipakai lembar ini; awalan yang tak
 * terwakili tak masuk peta, dan pemanggil menampilkan kodenya saja — lebih jujur
 * daripada mengarang nama di lembar yang akan ditandatangani.
 */
export function petaNamaTingkat(rows: BarisKodefikasi[]): Map<string, string> {
  const m = new Map<string, string>(Object.entries(NAMA_KELOMPOK))
  for (const r of rows) {
    const isi = (seg: number, nama: string | null) => {
      const nm = (nama || '').trim()
      if (!nm) return
      const pre = prefixSeg(r.kode, seg)
      if (pre) m.set(pre, nm)
    }
    isi(3, r.nama_jenis)
    isi(4, r.nama_objek)
    isi(5, r.nama_rincian)
    isi(6, r.nama_sub_rincian)
    isi(7, r.uraian)
  }
  return m
}

// ── Penanda tangan ──────────────────────────────────────────────────────────

/**
 * Sebutan pejabat di kaki lembar, diturunkan dari LEVEL SKPD
 * (keputusan user 2026-08-30):
 *
 *   level 1 (SKPD induk)      → Pengguna Barang
 *   level 2+ (sub unit)       → Kuasa Pengguna Barang
 *
 * Lembar aslinya menuliskan ketiga kemungkinan sekaligus ("Kuasa Pengguna
 * Barang, Pengguna Barang atau Pengelola Barang") untuk dicoret salah satunya;
 * di sini yang benar langsung dipilih, karena levelnya sudah diketahui.
 *
 * ⚠️ `Pengelola Barang` sengaja TIDAK pernah dihasilkan otomatis — itu jabatan
 * pemda (BPKAD selaku pengelola), bukan turunan dari posisi SKPD di pohon, dan
 * menebaknya dari kedalaman node akan salah untuk BPKAD sendiri.
 */
export function sebutanPejabat(levelSkpd: number): string {
  return levelSkpd <= 1 ? 'Pengguna Barang' : 'Kuasa Pengguna Barang'
}

/**
 * Kedalaman node SKPD (1 = akar). Menaiki `parent_id` sampai habis.
 *
 * Dibatasi 20 langkah: data pohon SKPD datang dari tabel yang bisa saja
 * memuat lingkaran (parent menunjuk balik), dan lembar cetak tak boleh
 * membeku gara-gara itu.
 */
export function levelSkpd(id: number, parentOf: Map<number, number | null>): number {
  let level = 1
  let kini = parentOf.get(id) ?? null
  for (let i = 0; i < 20 && kini != null; i++) {
    level++
    kini = parentOf.get(kini) ?? null
  }
  return level
}
