// ============================================================================
// Tindak Lanjut Inventarisasi — daftar temuan LHI + STATUS OTOMATIS.
//
// Keputusan user 2026-10-02: menu Tindak Lanjut melacak sendiri apakah temuan
// LHI (isian yang SUDAH DIVALIDASI) sudah dikerjakan di menu terkait. Tak ada
// isian manual "sudah/belum" — statusnya diturunkan dari KEADAAN barang saat
// ini (kode, status, kolom spesifikasi, kustodian, perjanjian) + baris ledger
// terakhir yang menjelaskan kenapa barangnya nonaktif.
//
// ⚠️ SENGAJA KEADAAN, BUKAN "ADA TRANSAKSI SESUDAH INVENTARISASI": kalau
// tindakannya dibatalkan (batal reklas, batal pemecahan, …), statusnya ikut
// kembali "Belum" dengan sendirinya. Pelajaran yang sama dgn kunci Saldo Awal
// (migrasi 20260916_01): riwayat append-only tak pernah hilang, keadaan pulih.
//
// ⚠️ MODUL INI TIDAK MENGUBAH APA PUN. "Kode tujuan reklas" hanya USULAN yang
// ditampilkan; kodenya baru berubah kalau SKPD menyimpan reklasifikasi di menu
// Reklasifikasi (dengan dokumen sumber/surat usulan). Validasi LHI tidak
// menyentuh register.
//
// Fungsi MURNI — pemuatnya di lib/tindakLanjutData.ts. Dikunci
// lib/tindakLanjut.test.ts.
// ============================================================================
import { klasifikasiLhi, normalKondisi, type InvBaris, type LhiKode, type SesuaiField } from '@/lib/inventarisasi'
import { isPengamananEligible } from '@/lib/pengamanan'

// ── Kode tujuan reklas ke Aset Lain-Lain (1.5.4) ────────────────────────────
// Dari master `admin_kodefikasi_bmd` (diperiksa 2026-10-02). Disepakati user.
const NO_GOL: Record<string, number> = { '1.3.1': 1, '1.3.2': 2, '1.3.3': 3, '1.3.4': 4, '1.3.5': 5, '1.3.6': 6 }
const pad3 = (n: number) => String(n).padStart(3, '0')

/** Rusak Berat — 1.5.4.01.01.01.001–005 (Tanah, PM, GB, JIJ, ATL). */
export const kodeRusakBerat = (gol: string) =>
  NO_GOL[gol] && NO_GOL[gol] <= 5 ? `1.5.4.01.01.01.${pad3(NO_GOL[gol])}` : null
/** Pinjam Pakai (dipakai Pusat / Pemda lain) — 1.5.4.01.01.03.009–013. */
export const kodePinjamPakai = (gol: string) =>
  NO_GOL[gol] && NO_GOL[gol] <= 5 ? `1.5.4.01.01.03.${pad3(8 + NO_GOL[gol])}` : null
/** Tidak digunakan dalam operasional (dipakai pihak lain) — 1.5.4.01.01.02.001–006. */
export const kodeTidakOperasional = (gol: string) =>
  NO_GOL[gol] ? `1.5.4.01.01.02.${pad3(NO_GOL[gol])}` : null
export const KODE_ASET_HILANG = '1.5.4.01.01.03.003'
export const KODE_DALAM_PENELUSURAN = '1.5.4.01.01.03.002'

// ── Keadaan barang saat ini ─────────────────────────────────────────────────
export type AsetKini = {
  id: string; kode: string; status: string
  nama_barang: string | null; kondisi_barang: string | null; satuan: string | null
  wilayah_kode: string | null; alamat_detail: string | null; merek_tipe: string | null
  no_polisi: string | null; no_rangka: string | null; no_mesin: string | null; no_bpkb: string | null
  spesifikasi_lainnya: string | null; luas: number | null; keterangan: string | null
  latitude: number | null; longitude: number | null; foto_paths: string[] | null
  pengamanan: string | null; pemanfaatan: string | null
  // Data teknis JIJ (20261002_01). Opsional: dari klien yang belum memuatnya → tak terlacak.
  jenis_perkerasan?: string | null; jenis_bahan_jembatan?: string | null
  no_ruas_jalan?: string | null; no_jaringan_irigasi?: string | null
}

/**
 * Jenis ledger yang MENGUBAH status aktif/nonaktif barang (lib/transaksi.ts
 * `patchAsetDari`) dan relevan bagi tindak lanjut. Baris TERAKHIR di antara
 * jenis ini menjelaskan kenapa barang yang kini nonaktif jadi nonaktif.
 */
export const JENIS_PENENTU_STATUS = [
  'penghapusan_pemindahtanganan', 'penghapusan_sebab_lain', 'batal_penghapusan',
  'koreksi_pencatatan_ganda', 'batal_koreksi_pencatatan_ganda',
  'pemecahan_keluar', 'batal_pemecahan',
  'kapitalisasi_serap', 'batal_kapitalisasi',
  'penggabungan_keluar', 'batal_penggabungan',
] as const

export type KonteksTL = {
  aset: Map<string, AsetKini>
  /** aset_id → jenis ledger TERAKHIR di antara `JENIS_PENENTU_STATUS`. */
  jenisTerakhir: Map<string, string>
  /** aset_id yang masuk RKBMD Penghapusan berstatus diajukan / disetujui. */
  usulHapus: Set<string>
  /** isian (III.B.11) → status kartu Hasil Inventarisasi yang dibuat darinya
   *  (`jurnal_header.payload.inv_isian_id`, Fase 2). Tak ada = belum dibuat. */
  draftHasilInv?: Map<string, 'pending' | 'disetujui'>
  /** Tanda selesai MANUAL (Fase 3, tabel `inventarisasi_tindak_lanjut`),
   *  kunci `${isianId}|${lhi}`. */
  manual?: Map<string, TandaManual>
}

/** Satu tanda "selesai" yang dibuat SKPD sendiri, dgn catatan wajib. */
export type TandaManual = { id: string; catatan: string; dokumen_paths: string[]; ditandai_at: string }

/**
 * Format yang BOLEH ditandai selesai manual — KEMBAR dgn CHECK `lhi` di tabel
 * `inventarisasi_tindak_lanjut` (migrasi 20261002_02). Hanya yang tak punya jejak
 * di register. Yang dilacak dari keadaan register SENGAJA tak boleh: tanda manual
 * tak pulih sendiri kalau tindakannya dibatalkan. III.B.9 boleh sbg jalan kedua —
 * tumpang tindih SEBAGIAN diselesaikan lewat koreksi luas/nilai, bukan Pencatatan Ganda.
 */
export const BOLEH_TANDAI_MANUAL: readonly LhiKode[] = ['III.B.4', 'III.B.5', 'III.B.9', 'III.B.10']

/** Barang nonaktif KARENA jenis ledger tertentu (yang terakhir & belum dibatalkan). */
function nonaktifKarena(ctx: KonteksTL, asetId: string | null | undefined, jenis: readonly string[]): boolean {
  if (!asetId) return false
  const a = ctx.aset.get(asetId)
  if (!a || a.status === 'aktif') return false
  const j = ctx.jenisTerakhir.get(asetId)
  return !!j && jenis.includes(j)
}
const dihapus = (ctx: KonteksTL, id: string) => nonaktifKarena(ctx, id, ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])

// ── Temuan & tahapannya ─────────────────────────────────────────────────────
export type StatusTL = 'belum' | 'proses' | 'selesai' | 'manual'
export type TahapTL = { label: string; selesai: boolean | null } // null = tak bisa dilacak otomatis
export type MenuTL =
  | 'reklasifikasi' | 'koreksi' | 'kapitalisasi' | 'penghapusan' | 'rkbmd_penghapusan'
  | 'pengamanan' | 'pemanfaatan' | 'hasil_inventarisasi'

export type TemuanTL = {
  id: string                  // `${isianId}|${lhi}`
  isianId: string
  asetId: string | null
  lhi: LhiKode
  tindakan: string
  tahap: TahapTL[]
  status: StatusTL
  /** Menu tempat mengerjakannya (tombol "Kerjakan →"). */
  menu: MenuTL[]
  /** Usulan kode tujuan reklas — USULAN, tidak pernah diterapkan otomatis. */
  kodeTujuan?: string | null
  /** Alasan Reklasifikasi yang cocok: 'kode' (kodefikasi, satu jenis aset) atau
   *  'golongan' (pindah jenis — ke Aset Lain-Lain). Dipakai isian otomatis. */
  alasanReklas?: 'kode' | 'golongan'
  /** Masih perlu direklas ke `kodeTujuan` (barang aktif & kodenya belum itu) —
   *  syarat masuk Surat Usulan Reklasifikasi. */
  perluReklas?: boolean
  /** Barang lain yang terlibat — untuk isian otomatis Kapitalisasi & Pencatatan Ganda. */
  relasi?: { induk?: string | null; anak?: string | null; kembar?: string | null }
  catatan?: string
  /** Boleh ditandai selesai manual (Fase 3). */
  bolehManual?: boolean
  /** Tanda selesai manual yang berlaku — membuat status "Selesai". */
  tandaManual?: TandaManual
}

export type IsianTL = Pick<InvBaris, 'id' | 'aset_id' | 'snapshot' | 'jawaban'> & { golongan: string }

function statusDari(tahap: TahapTL[]): StatusTL {
  if (tahap.length === 0 || tahap.every(t => t.selesai === null)) return 'manual'
  const terlacak = tahap.filter(t => t.selesai !== null)
  if (terlacak.every(t => t.selesai)) return tahap.some(t => t.selesai === null) ? 'proses' : 'selesai'
  return terlacak.some(t => t.selesai) ? 'proses' : 'belum'
}

const teks = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const samaTeks = (a: unknown, b: unknown) => teks(a) === teks(b)
const samaAngka = (a: unknown, b: unknown) => {
  const x = Number(a), y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005
}

/** Tahap reklas: selesai kalau kode register SEKARANG sama dgn kode tujuan. */
const tahapReklas = (a: AsetKini | undefined, kode: string | null, label: string): TahapTL =>
  ({ label: kode ? `${label} (${kode})` : label, selesai: kode && a ? a.kode === kode : kode ? false : null })

/** Tiga tahap penghapusan: [reklas?] → masuk RKBMD Penghapusan → dihapus. */
function tahapHapus(ctx: KonteksTL, id: string, reklas?: TahapTL): TahapTL[] {
  const hapus = dihapus(ctx, id)
  const out: TahapTL[] = []
  if (reklas) out.push(hapus ? { ...reklas, selesai: true } : reklas)
  out.push({ label: 'Diusulkan di RKBMD Penghapusan', selesai: hapus || ctx.usulHapus.has(id) })
  out.push({ label: 'Dihapus (menu Penghapusan)', selesai: hapus })
  return out
}

// Kolom III.B.8 yang dibandingkan dgn register. Data teknis JIJ punya kolom di
// `aset` sejak 20261002_01; kalau kolomnya tak termuat (`undefined`) → tak bisa
// dilacak (selesai: null), bukan "belum".
const cekJij = (k: 'jenis_perkerasan' | 'jenis_bahan_jembatan' | 'no_ruas_jalan' | 'no_jaringan_irigasi') =>
  (a: AsetKini, s: IsianTL) => a[k] === undefined ? null : samaTeks(a[k], s.jawaban[k]?.seharusnya)
type KolomUbah = { label: string; cek: (a: AsetKini, s: IsianTL) => boolean | null }
const KOLOM_UBAH: { key: keyof InvBaris['jawaban']; kolom: KolomUbah }[] = [
  { key: 'spesifikasi', kolom: { label: 'Spesifikasi Nama Barang', cek: (a, s) => samaTeks(a.nama_barang, s.jawaban.spesifikasi?.seharusnya) } },
  { key: 'merek_tipe', kolom: { label: 'Merk/Tipe', cek: (a, s) => samaTeks(a.merek_tipe, s.jawaban.merek_tipe?.seharusnya) } },
  { key: 'spesifikasi_lainnya', kolom: { label: 'Spesifikasi Lainnya', cek: (a, s) => samaTeks(a.spesifikasi_lainnya, s.jawaban.spesifikasi_lainnya?.seharusnya) } },
  { key: 'no_polisi', kolom: { label: 'No. Polisi', cek: (a, s) => samaTeks(a.no_polisi, s.jawaban.no_polisi?.seharusnya) } },
  { key: 'no_rangka', kolom: { label: 'No. Rangka', cek: (a, s) => samaTeks(a.no_rangka, s.jawaban.no_rangka?.seharusnya) } },
  { key: 'no_mesin', kolom: { label: 'No. Mesin', cek: (a, s) => samaTeks(a.no_mesin, s.jawaban.no_mesin?.seharusnya) } },
  { key: 'no_bpkb', kolom: { label: 'No. BPKB', cek: (a, s) => samaTeks(a.no_bpkb, s.jawaban.no_bpkb?.seharusnya) } },
  { key: 'luas', kolom: { label: 'Luas', cek: (a, s) => samaAngka(a.luas, s.jawaban.luas?.seharusnya) } },
  { key: 'wilayah', kolom: { label: 'Wilayah', cek: (a, s) => !!s.jawaban.wilayah?.wilayah_kode && a.wilayah_kode === s.jawaban.wilayah.wilayah_kode } },
  { key: 'alamat_detail', kolom: { label: 'Alamat Detail', cek: (a, s) => samaTeks(a.alamat_detail, s.jawaban.alamat_detail?.seharusnya) } },
  { key: 'satuan', kolom: { label: 'Satuan', cek: (a, s) => samaTeks(a.satuan, s.jawaban.satuan?.seharusnya) } },
  { key: 'keterangan_barang', kolom: { label: 'Keterangan', cek: (a, s) => samaTeks(a.keterangan, s.jawaban.keterangan_barang?.seharusnya) } },
  { key: 'jenis_perkerasan', kolom: { label: 'Jenis Perkerasan', cek: cekJij('jenis_perkerasan') } },
  { key: 'jenis_bahan_jembatan', kolom: { label: 'Jenis Bahan Jembatan', cek: cekJij('jenis_bahan_jembatan') } },
  { key: 'no_ruas_jalan', kolom: { label: 'No. Ruas Jalan', cek: cekJij('no_ruas_jalan') } },
  { key: 'no_jaringan_irigasi', kolom: { label: 'No. Jaringan Irigasi', cek: cekJij('no_jaringan_irigasi') } },
]

function tahapUbahData(a: AsetKini | undefined, s: IsianTL): TahapTL[] {
  const j = s.jawaban
  const out: TahapTL[] = []
  for (const { key, kolom } of KOLOM_UBAH) {
    if ((j[key] as SesuaiField | undefined)?.sesuai !== false) continue
    out.push({ label: kolom.label, selesai: a ? kolom.cek(a, s) : false })
  }
  if (j.koordinat?.sesuai === false) {
    const ok = !!a && j.latitude != null && j.longitude != null && a.latitude != null && a.longitude != null
      && Math.abs(a.latitude - j.latitude) < 1e-6 && Math.abs(a.longitude - j.longitude) < 1e-6
    out.push({ label: 'Titik Koordinat', selesai: ok })
  }
  if (j.foto_barang?.sesuai === false) {
    // Selesai = register sudah punya foto yang BELUM ada saat diinventarisasi.
    const lama = new Set(s.snapshot?.foto_paths || [])
    out.push({ label: 'Foto barang terbaru', selesai: !!a && (a.foto_paths || []).some(p => !lama.has(p)) })
  }
  return out
}

/** Turunkan seluruh temuan tindak lanjut satu isian tervalidasi. */
export function temuanDariIsian(s: IsianTL, ctx: KonteksTL): TemuanTL[] {
  const j = s.jawaban || {}
  const id = s.aset_id
  const a = id ? ctx.aset.get(id) : undefined
  const gol = s.golongan
  const kodes = klasifikasiLhi({ ...s, foto_paths: [] } as InvBaris)
  const out: TemuanTL[] = []
  const tambah = (lhi: LhiKode, t: Omit<TemuanTL, 'id' | 'isianId' | 'asetId' | 'lhi' | 'status' | 'perluReklas' | 'bolehManual' | 'tandaManual'>) => {
    const tid = `${s.id}|${lhi}`
    let status = statusDari(t.tahap)
    // Tanda manual hanya diakui untuk format yang memang boleh ditandai, dan
    // hanya selama yang otomatis BELUM selesai sendiri.
    // III.B.5 cuma untuk barang di luar menu Pengamanan (yang di dalamnya terlacak
    // dari kustodian, jadi tak boleh dipintas dgn tanda manual).
    const formatBoleh = BOLEH_TANDAI_MANUAL.includes(lhi) && (lhi !== 'III.B.5' || status === 'manual')
    const bolehManual = formatBoleh && status !== 'selesai'
    const tanda = formatBoleh ? ctx.manual?.get(tid) : undefined
    const tahap = tanda
      ? [...t.tahap, { label: `Ditandai selesai manual (${tanda.ditandai_at.slice(0, 10)}): ${tanda.catatan}`, selesai: true }]
      : t.tahap
    if (tanda) status = 'selesai'
    out.push({
      id: tid, isianId: s.id, asetId: id, lhi, status,
      perluReklas: !!t.kodeTujuan && !!a && a.status === 'aktif' && a.kode !== t.kodeTujuan,
      bolehManual: bolehManual || !!tanda, tandaManual: tanda,
      ...t, tahap,
    })
  }

  for (const lhi of kodes) {
    switch (lhi) {
      case 'III.B.1':
        tambah(lhi, {
          tindakan: 'Reklas ke Aset Hilang, lalu usulan penghapusan',
          tahap: tahapHapus(ctx, id!, tahapReklas(a, KODE_ASET_HILANG, 'Reklas ke Aset Hilang')),
          menu: ['reklasifikasi', 'rkbmd_penghapusan', 'penghapusan'], kodeTujuan: KODE_ASET_HILANG, alasanReklas: 'golongan',
        })
        break
      case 'III.B.2': {
        // Sebab yang sudah pasti (force majeure / dibongkar) → langsung diusulkan
        // hapus. Tanpa sebab ("tidak ditemukan") → telusuri dulu.
        const pasti = j.sebab_tidak_ada === 'force_majeure' || j.sebab_tidak_ada === 'dibongkar_baru'
        tambah(lhi, pasti ? {
          tindakan: 'Usulan penghapusan',
          tahap: tahapHapus(ctx, id!), menu: ['rkbmd_penghapusan', 'penghapusan'],
        } : {
          tindakan: 'Reklas ke Aset Dalam Penelusuran, lalu usulan penghapusan',
          tahap: tahapHapus(ctx, id!, tahapReklas(a, KODE_DALAM_PENELUSURAN, 'Reklas ke Aset Dalam Penelusuran')),
          menu: ['reklasifikasi', 'rkbmd_penghapusan', 'penghapusan'], kodeTujuan: KODE_DALAM_PENELUSURAN, alasanReklas: 'golongan',
        })
        break
      }
      case 'III.B.3': {
        // Anak = barang yang diserap; induk = yang menyerap. "Direhab jadi
        // bangunan baru": barang INI induknya, anaknya bangunan baru itu.
        const rehab = j.sebab_tidak_ada === 'rehab_bangunan_baru'
        const anak = rehab ? j.sebab_relasi?.aset_id : id
        const indukId = rehab ? id : (j.atribusi === 'ya_induk_diketahui' ? j.induk?.aset_id : j.sebab_relasi?.aset_id)
        const induk = rehab ? s.snapshot?.nama_barang : (j.induk?.nama_barang || j.sebab_relasi?.nama_barang)
        tambah(lhi, {
          tindakan: `Kapitalisasi ke induk${induk ? ` "${induk}"` : ''}`,
          tahap: [{ label: 'Diserap ke induk (menu Kapitalisasi)', selesai: anak ? nonaktifKarena(ctx, anak, ['kapitalisasi_serap', 'penggabungan_keluar']) : null }],
          menu: ['kapitalisasi'], relasi: { induk: indukId || null, anak: anak || null },
        })
        break
      }
      case 'III.B.4':
        tambah(lhi, { tindakan: 'Telusuri data induk', tahap: [], menu: [], catatan: 'Belum bisa dilacak otomatis — penandaan manual menyusul.' })
        break
      case 'III.B.5': {
        const bisa = !!a && isPengamananEligible(a.kode)
        tambah(lhi, {
          tindakan: 'BAST Pengamanan ke pegawai pemakai',
          tahap: [{ label: 'Tercatat di menu Pengamanan', selesai: bisa ? !!a?.pengamanan : null }],
          menu: bisa ? ['pengamanan'] : [],
          catatan: bisa ? undefined : 'Jenis barang ini belum bisa dicatat di menu Pengamanan — penandaan manual menyusul.',
        })
        break
      }
      case 'III.B.6': {
        const pihak = j.penggunaan?.pihak
        const tujuan = pihak === 'pihak_lain' ? kodeTidakOperasional(gol) : kodePinjamPakai(gol)
        const label = pihak === 'pihak_lain' ? 'Reklas ke Aset Tidak Digunakan Operasional' : 'Reklas ke Aset Pinjam Pakai'
        tambah(lhi, {
          tindakan: `${label}, lalu catat perjanjiannya`,
          tahap: [
            tahapReklas(a, tujuan, label),
            { label: 'Perjanjian tercatat di menu Pemanfaatan', selesai: !!a?.pemanfaatan },
          ],
          menu: ['reklasifikasi', 'pemanfaatan'], kodeTujuan: tujuan, alasanReklas: 'golongan',
        })
        break
      }
      case 'III.B.7': {
        if (j.kondisi === 'RB') {
          const tujuan = kodeRusakBerat(gol)
          tambah(lhi, {
            tindakan: 'Reklas ke Aset Rusak Berat, lalu usulan penghapusan',
            tahap: tahapHapus(ctx, id!, tujuan ? tahapReklas(a, tujuan, 'Reklas ke Aset Rusak Berat') : undefined),
            menu: [...(tujuan ? ['reklasifikasi' as const] : []), 'rkbmd_penghapusan', 'penghapusan'], kodeTujuan: tujuan,
            alasanReklas: 'golongan',
          })
        } else {
          tambah(lhi, {
            tindakan: 'Perbarui kondisi barang di register',
            tahap: [{ label: `Kondisi register = ${j.kondisi === 'B' ? 'Baik' : 'Rusak Ringan'}`, selesai: !!a && normalKondisi(a.kondisi_barang) === j.kondisi }],
            menu: ['koreksi'],
          })
        }
        break
      }
      case 'III.B.8':
        tambah(lhi, { tindakan: 'Koreksi data barang', tahap: tahapUbahData(a, s), menu: ['koreksi'] })
        break
      case 'III.B.9': {
        const kembar = j.ganda_data?.aset_id
        const ok = [id, kembar].some(x => nonaktifKarena(ctx, x, ['koreksi_pencatatan_ganda', 'penggabungan_keluar']))
        tambah(lhi, {
          tindakan: 'Koreksi Pencatatan Ganda',
          tahap: [{ label: 'Salah satu dinonaktifkan (Pencatatan Ganda / Penggabungan)', selesai: ok }],
          menu: ['koreksi'], relasi: { kembar: kembar || null },
          catatan: 'Kalau barangnya hanya tumpang tindih sebagian, koreksi luas/nilai-nya saja — penandaan manual menyusul.',
        })
        break
      }
      case 'III.B.10':
        tambah(lhi, { tindakan: 'Penyelesaian status tanah dengan pemiliknya', tahap: [], menu: [], catatan: 'Belum bisa dilacak otomatis — penandaan manual menyusul.' })
        break
      case 'III.B.11': {
        // Dilacak lewat kartu Hasil Inventarisasi yang dibuat DARI isian ini
        // (`payload.inv_isian_id`). Tanpa konteksnya → tak bisa dinilai.
        const st = ctx.draftHasilInv?.get(s.id)
        tambah(lhi, {
          tindakan: 'Catat lewat Cara Perolehan → Hasil Inventarisasi',
          tahap: ctx.draftHasilInv ? [
            { label: 'Kartu draft dibuat dari isian LKI', selesai: !!st },
            { label: 'Disetujui (barang masuk register)', selesai: st === 'disetujui' },
          ] : [],
          menu: ['hasil_inventarisasi'],
        })
        break
      }
      case 'III.B.12': {
        const baru = j.kode_barang?.kode_baru || null
        tambah(lhi, {
          tindakan: 'Surat usulan reklas, lalu Reklasifikasi Kesalahan Kodefikasi',
          tahap: [tahapReklas(a, baru, 'Kode register sudah diubah')],
          menu: ['reklasifikasi'], kodeTujuan: baru, alasanReklas: 'kode',
        })
        break
      }
      case 'III.B.13':
        tambah(lhi, {
          tindakan: 'Pemecahan Barang',
          tahap: [{ label: 'Dipecah (menu Koreksi → Pemecahan)', selesai: nonaktifKarena(ctx, id, ['pemecahan_keluar']) }],
          menu: ['koreksi'],
        })
        break
    }
  }
  return out
}

/** Aset yang keadaannya perlu dimuat untuk menilai isian-isian ini. */
export function asetDibutuhkan(isian: IsianTL[]): string[] {
  const ids = new Set<string>()
  for (const s of isian) {
    if (s.aset_id) ids.add(s.aset_id)
    const r = s.jawaban?.sebab_relasi?.aset_id
    const g = s.jawaban?.ganda_data?.aset_id
    if (r) ids.add(r)
    if (g) ids.add(g)
  }
  return [...ids]
}

/** Satu baris rekap per SKPD (Fase 3). `kunci` = id SKPD pengelompokan. */
export type RekapTL = { kunci: number; temuan: number } & Record<StatusTL, number>

/**
 * Rekap jumlah temuan per SKPD (biasanya SKPD INDUK, lewat `kelompok`). Satu
 * temuan = satu baris (barang × format LHI) — sama dgn daftar di layar, jadi
 * angkanya bisa dicocokkan. Diurut % selesai menaik (yang paling tertinggal di atas).
 */
export function rekapTindakLanjut<T extends { skpdId: number; status: StatusTL }>(
  temuan: readonly T[], kelompok: (skpdId: number) => number,
): RekapTL[] {
  const m = new Map<number, RekapTL>()
  for (const t of temuan) {
    const k = kelompok(t.skpdId)
    const r = m.get(k) || { kunci: k, temuan: 0, belum: 0, proses: 0, selesai: 0, manual: 0 }
    r.temuan++; r[t.status]++
    m.set(k, r)
  }
  const pct = (r: RekapTL) => (r.temuan ? r.selesai / r.temuan : 0)
  return [...m.values()].sort((a, b) => pct(a) - pct(b) || b.temuan - a.temuan || a.kunci - b.kunci)
}

export const STATUS_TL_LABEL: Record<StatusTL, string> = {
  belum: 'Belum', proses: 'Sebagian', selesai: 'Selesai', manual: 'Tandai manual',
}
