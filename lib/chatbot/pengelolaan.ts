// Alat baca PENGELOLAAN untuk pengguna istimewa Asisten AI (lib/chatbot/istimewa.ts):
// Penggunaan · Penerimaan/Pengeluaran Internal · Pemanfaatan · Reklasifikasi ·
// Koreksi · Kapitalisasi · Pengamanan · Penghapusan.
//
// PRINSIPNYA SATU: angka di sini harus SAMA dengan menu Pelaporan → Laporan
// Pengelolaan. Karena itu tiap menu dibaca lewat PEMUAT LAPORANNYA SENDIRI
// (lib/laporanPerpindahan, laporanReklas, laporanPenghapusan, laporanPengamanan,
// laporanKapitalisasi, laporanPemanfaatan) — aturan "transaksi mana yang sudah
// dibatalkan" berbeda-beda per menu (target_trx_id, replay peristiwa-terakhir,
// keanggotaan kartu) dan sudah berkali-kali jadi sumber angka salah yang senyap.
// Menyalinnya ke sini berarti chatbot & laporan resmi cepat atau lambat
// menyebut angka berbeda.
//
// ⚠️ SATU-SATUNYA SALINAN: `muatKoreksi` di bawah, kembar dgn `buildQuery` +
// `saring` di components/pelaporan/LaporanKoreksi.tsx (komponen 'use client',
// konstantanya tak bisa diimpor ke route server). Daftar jenisnya dikunci
// lib/chatbot/pengelolaan.test.ts terhadap sumber komponen itu; utangnya
// tercatat di REFACTOR-PLAN.md §5.
//
// Semuanya HANYA-BACA & memakai client SESI USER — cakupan se-kabupaten datang
// dari peran admin akun itu lewat RLS, bukan dari berkas ini.
import type { SupabaseClient } from '@supabase/supabase-js'
import { JENIS_TRANSAKSI_LABEL } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import { paginate } from '@/shared/db/paginate'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { muatLembarPerpindahan } from '@/lib/laporanPerpindahan'
import { muatLaporanReklas } from '@/lib/laporanReklas'
import { muatLaporanPenghapusan } from '@/lib/laporanPenghapusan'
import { FORMAT_PENGHAPUSAN } from '@/lib/formatPenghapusan'
import { muatLaporanPengamanan, orangPengamanan } from '@/lib/laporanPengamanan'
import { muatKapitalisasi } from '@/lib/laporanKapitalisasi'
import { muatPemanfaatan } from '@/lib/laporanPemanfaatan'

export const MENU_PENGELOLAAN = [
  'penggunaan', 'mutasi_internal', 'pemanfaatan', 'reklasifikasi',
  'koreksi', 'kapitalisasi', 'pengamanan', 'penghapusan',
] as const
export type MenuPengelolaan = typeof MENU_PENGELOLAAN[number]

export const LABEL_MENU: Record<MenuPengelolaan, string> = {
  penggunaan: 'Penggunaan (pengalihan status antar-SKPD)',
  mutasi_internal: 'Mutasi Internal (Penerimaan & Pengeluaran Internal)',
  pemanfaatan: 'Pemanfaatan',
  reklasifikasi: 'Reklasifikasi',
  koreksi: 'Koreksi',
  kapitalisasi: 'Kapitalisasi',
  pengamanan: 'Pengamanan',
  penghapusan: 'Penghapusan',
}

/** Arti kolom nilai tiap menu — BEDA-BEDA, jadi wajib disebut di jawaban. */
const LABEL_NILAI: Record<MenuPengelolaan, string> = {
  penggunaan: 'nilai perolehan barang yang berpindah',
  mutasi_internal: 'nilai perolehan barang yang berpindah',
  pemanfaatan: 'nilai pemanfaatan per perjanjian (pendapatan; Pinjam Pakai tanpa nilai)',
  reklasifikasi: 'nilai perolehan barang yang direklas',
  koreksi: 'selisih nilai koreksi (bertanda; koreksi spesifikasi/ganda bernilai 0)',
  kapitalisasi: 'nilai yang dikapitalisasi ke barang induk',
  pengamanan: 'nilai perolehan barang yang diamankan',
  penghapusan: 'nilai perolehan barang yang dihapus',
}

/** Menu yang isinya POSISI (apa yang berlaku), bukan arus transaksi per periode. */
const MENU_POSISI: ReadonlySet<MenuPengelolaan> = new Set(['pemanfaatan', 'pengamanan'])

export type Lingkup = {
  skpdId: number | null
  /** SKPD itu beserta turunannya; null = se-kabupaten. */
  desc: number[] | null
  label: string
}

export type Butir = {
  /** Sub-kelompok untuk rekap (arah, cara, jenis koreksi, …). */
  kelompok: string
  tanggal: string
  noDok: string
  skpd: string
  barang: string
  nibar: string
  kode: string
  nilai: number | null
  /** Nilai yang melekat pada DOKUMEN, bukan barang (Pemanfaatan): dijumlah
   *  sekali per kunci ini supaya perjanjian berisi 3 barang tak terhitung 3×. */
  kunciNilai?: string
  /** Rincian tambahan siap cetak. */
  rinci: string[]
}
type HasilMenu = { butir: Butir[]; catatan: string[] }

const rp = (n: number | null | undefined) => formatRupiah2(n)
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
const MAKS_DAFTAR = 30

// ── Pemuat per menu ─────────────────────────────────────────────────────────

async function muatPindah(
  sb: SupabaseClient, jenis: 'pengalihan_status' | 'mutasi_internal', l: Lingkup, periode: string,
): Promise<HasilMenu> {
  // `arah: 'semua'` = salah satu sisi ada di lingkup. Arahnya ditentukan DI SINI
  // per baris — satu baris ledger merekam dua sisi sekaligus.
  const h = await muatLembarPerpindahan(sb, { jenis, arah: 'semua', skpdId: l.skpdId, periode })
  const dalam = l.desc ? new Set(l.desc) : null
  const butir = h.rows.map((r): Butir => {
    const masuk = !!dalam && r.skpd_tujuan != null && dalam.has(r.skpd_tujuan)
    const keluar = !!dalam && r.skpd_asal != null && dalam.has(r.skpd_asal)
    const kelompok = !dalam ? 'Perpindahan'
      : masuk && keluar ? 'Antar unit di dalam SKPD ini'
        : masuk ? 'Masuk (diterima)' : 'Keluar (diserahkan)'
    return {
      kelompok,
      tanggal: r.header?.tanggal || r.tanggal,
      noDok: r.header?.no_sk || r.payload?.no_sk || '-',
      skpd: `${r.asal_nama || '-'} → ${r.tujuan_nama || '-'}`,
      barang: r.aset?.nama_barang || r.aset?.uraian_barang || '-',
      nibar: r.aset?.nibar || '-', kode: r.aset?.kode || '-',
      nilai: Number(r.nilai) || 0,
      rinci: [
        r.aset?.merek_tipe ? `merek ${r.aset.merek_tipe}` : '',
        r.tanpaPenyusutan ? '' : `akumulasi Rp${rp(r.akumulasi)} · nilai buku Rp${rp(r.nilaiBuku)}`,
        r.payload?.reversal ? '(pengembalian)' : '',
        r.header?.keterangan ? `ket: ${r.header.keterangan}` : '',
      ].filter(Boolean),
    }
  })
  return { butir, catatan: ['Perpindahan yang sudah dibatalkan tidak dihitung.'] }
}

async function muatReklas(sb: SupabaseClient, l: Lingkup, periode: string): Promise<HasilMenu> {
  // Arah tak menyaring baris (satu reklas = penambahan di tujuan & pengurangan
  // di asal); dipakai 'penambahan' supaya nama barangnya nama SESUDAH reklas.
  const h = await muatLaporanReklas(sb, { arah: 'penambahan', skpdId: l.skpdId, periode })
  const butir = h.rows.map((r): Butir => ({
    kelompok: r.penyebab || JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis,
    tanggal: r.header?.tanggal || r.tanggal,
    noDok: r.header?.no_sk || '-',
    skpd: r.skpdNama || '-',
    barang: r.namaSpek || r.aset?.nama_barang || '-',
    nibar: r.aset?.nibar || '-', kode: r.kodeBaru || r.aset?.kode || '-',
    nilai: Number(r.nilai) || 0,
    rinci: [
      r.kodeLama !== r.kodeBaru ? `kode ${r.kodeLama} → ${r.kodeBaru}` : '',
      r.payload?.intra_ekstra_lama && r.payload?.intra_ekstra && r.payload.intra_ekstra_lama !== r.payload.intra_ekstra
        ? `komptabel ${r.payload.intra_ekstra_lama} → ${r.payload.intra_ekstra}` : '',
      r.payload?.nama_lama && r.payload?.nama_baru && r.payload.nama_lama !== r.payload.nama_baru
        ? `nama "${r.payload.nama_lama}" → "${r.payload.nama_baru}"` : '',
      r.header?.keterangan ? `ket: ${r.header.keterangan}` : '',
    ].filter(Boolean),
  }))
  return { butir, catatan: ['Reklas yang sudah dibatalkan tidak dihitung. SKPD = yang mencatat jurnalnya.'] }
}

/**
 * ⚠️ KEMBAR dgn `JENIS_KOREKSI` di components/pelaporan/LaporanKoreksi.tsx &
 * predikat `idx_trx_koreksi_id`. `penggabungan_*` SENGAJA belum ikut (index-nya
 * belum memuatnya — menambahkannya di sini tanpa memperlebar index = timeout).
 */
export const JENIS_KOREKSI_CHAT = [
  'koreksi_nilai', 'koreksi_spesifikasi', 'koreksi_pencatatan_ganda',
  'pemecahan_keluar', 'pemecahan_masuk', 'batal_pemecahan', 'batal_pemecahan_masuk',
] as const

type TrxKoreksi = {
  id: number; aset_id: string | null; jenis: string; periode: string; tanggal: string
  nilai: number | null; keterangan: string | null; created_by: string | null
  payload: { nilai_lama?: number; nilai_perolehan_baru?: number } | null
  header: { no_sk: string | null; tanggal: string | null; skpd_id: number | null; keterangan: string | null } | null
  aset: { nibar: string | null; nama_barang: string | null; kode: string; skpd_id: number | null } | null
}

async function muatKoreksi(
  sb: SupabaseClient, l: Lingkup, periode: string, namaSkpd: Map<number, string>,
): Promise<HasilMenu> {
  const per = periodeDiminta(periode)
  const semua = await paginate<number, TrxKoreksi>('transaksi koreksi', kursor => {
    let q = sb.from('transaksi_bmd')
      .select('id,aset_id,jenis,periode,tanggal,nilai,keterangan,created_by,payload,'
        + 'header:header_id(no_sk,tanggal,skpd_id,keterangan),aset:aset_id(nibar,nama_barang,kode,skpd_id)')
      .in('jenis', JENIS_KOREKSI_CHAT as never)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    if (kursor !== null) q = q.gt('id', kursor)
    return q.order('id').limit(1000) as unknown as PromiseLike<{ data: TrxKoreksi[] | null; error: { message: string } | null }>
  })
  // SKPD = yang MENCATAT jurnalnya (`header.skpd_id`), bukan posisi barang hari
  // ini — sama dgn Laporan Koreksi (insiden 2026-09-17).
  const dalam = l.desc ? new Set(l.desc) : null
  const scoped = semua.filter(r => r.aset).map(r => ({ r, skpd: r.header?.skpd_id ?? r.aset!.skpd_id }))
    .filter(x => !dalam || (x.skpd != null && dalam.has(x.skpd)))
  const dibatalkan = await fetchBatalTargets(
    sb, BATAL_TARGET_JENIS.koreksi, scoped.map(x => x.r.aset_id).filter((id): id is string => !!id))
  const hidup = scoped.filter(x => !dibatalkan.has(x.r.id))
  // Bawaan Laporan Koreksi: baris yang ditulis di LUAR aplikasi (created_by
  // NULL = perbaikan data admin lewat SQL) tak ditampilkan — tapi jumlahnya
  // WAJIB disebut, supaya hitungan ini tak terlihat "kurang" tanpa keterangan.
  const lewatMenu = hidup.filter(x => x.r.created_by != null)
  const nPerbaikan = hidup.length - lewatMenu.length
  const butir = lewatMenu.map(({ r, skpd }): Butir => ({
    kelompok: JENIS_TRANSAKSI_LABEL[r.jenis] || r.jenis,
    tanggal: r.header?.tanggal || r.tanggal,
    noDok: r.header?.no_sk || '-',
    skpd: skpd != null ? (namaSkpd.get(skpd) || `SKPD ${skpd}`) : '-',
    barang: r.aset?.nama_barang || '-', nibar: r.aset?.nibar || '-', kode: r.aset?.kode || '-',
    nilai: Number(r.nilai) || 0,
    rinci: [
      r.jenis === 'koreksi_nilai' && r.payload?.nilai_lama != null && r.payload?.nilai_perolehan_baru != null
        ? `nilai perolehan Rp${rp(r.payload.nilai_lama)} → Rp${rp(r.payload.nilai_perolehan_baru)}` : '',
      r.keterangan ? `ket: ${r.keterangan}` : (r.header?.keterangan ? `ket: ${r.header.keterangan}` : ''),
    ].filter(Boolean),
  }))
  return {
    butir,
    catatan: [
      'Koreksi yang sudah dibatalkan tidak dihitung. Penggabungan Barang belum tercakup.',
      nPerbaikan > 0 ? `${fmtN(nPerbaikan)} baris perbaikan data admin (ditulis di luar aplikasi) TIDAK ikut dihitung — sama dgn bawaan Laporan Koreksi.` : '',
    ].filter(Boolean),
  }
}

async function muatKap(sb: SupabaseClient, l: Lingkup, periode: string): Promise<HasilMenu> {
  const rows = await muatKapitalisasi(sb, { periode, descIds: l.desc })
  const butir = rows.map((r): Butir => {
    const s = r.payload.snapshot
    const anak = r.payload.anak || []
    const nilai = s?.np_baru != null && s?.np_lama != null
      ? s.np_baru - s.np_lama : anak.reduce((t, a) => t + (a.nilai || 0), 0)
    return {
      kelompok: 'Kapitalisasi',
      tanggal: r.tanggal, noDok: r.payload.no_dokumen || '-',
      skpd: r.skpd?.nama || '-',
      barang: `${r.aset?.nama_barang || '-'} (induk)`, nibar: r.aset?.nibar || '-', kode: r.aset?.kode || '-',
      nilai,
      rinci: [
        s ? `nilai perolehan induk Rp${rp(s.np_lama)} → Rp${rp(s.np_baru)}` : '',
        s ? `nilai buku Rp${rp(s.nb_lama)} → Rp${rp(s.nb_baru)}` : '',
        `${anak.length} barang diserap: ${anak.slice(0, 5).map(a => `${a.nama || '-'} (Rp${rp(a.nilai)})`).join('; ')}${anak.length > 5 ? '; …' : ''}`,
      ].filter(Boolean),
    }
  })
  return { butir, catatan: ['Satu baris = satu dokumen kapitalisasi (per barang induk). Yang sudah dibatalkan tidak dihitung.'] }
}

async function muatManfaat(sb: SupabaseClient, l: Lingkup, hariIni: string): Promise<HasilMenu> {
  const rows = await muatPemanfaatan(sb, { descIds: l.desc, jenis: '', hariIni })
  const butir = rows.map((r): Butir => ({
    kelompok: `${r.jenis} · ${r.status}`,
    tanggal: r.tglDok, noDok: r.noDok, skpd: r.skpd,
    barang: r.nama, nibar: r.nibar, kode: r.kode,
    nilai: r.nilai,
    kunciNilai: r.key.split('|')[0],
    rinci: [
      `mitra ${r.mitra}`,
      `masa ${r.mulai || '?'} s.d. ${r.berakhir || '?'}${r.persen != null ? ` (${Math.round(r.persen)}% berjalan)` : ''}`,
      `lingkup ${r.lingkup}`,
    ],
  }))
  return {
    butir,
    catatan: ['Pemanfaatan = POSISI (semua perjanjian yang tercatat, tidak disaring periode). Status dihitung terhadap tanggal hari ini. Nilai dihitung sekali per perjanjian.'],
  }
}

const CABANG_PENGAMANAN: [string, string][] = [['1.3.2', 'Peralatan & Mesin'], ['1.3.3', 'Gedung & Bangunan']]

async function muatAman(sb: SupabaseClient, l: Lingkup, periode: string): Promise<HasilMenu> {
  const hasil = await Promise.all(CABANG_PENGAMANAN.map(([g]) =>
    muatLaporanPengamanan(sb, { golongan: g, skpdId: l.skpdId, periode })))
  const butir: Butir[] = []
  hasil.forEach((h, i) => {
    const nama = new Map(h.semuaSkpd.map(s => [s.id, s.nama]))
    for (const r of h.rows) {
      const o = orangPengamanan(r)
      butir.push({
        kelompok: CABANG_PENGAMANAN[i][1],
        tanggal: r.header?.tanggal || r.tanggal, noDok: r.header?.no_sk || '-',
        skpd: r.aset?.skpd_id != null ? (nama.get(r.aset.skpd_id) || '-') : '-',
        barang: r.aset?.nama_barang || '-', nibar: r.aset?.nibar || '-', kode: r.aset?.kode || '-',
        nilai: Number(r.aset?.nilai_perolehan) || 0,
        rinci: [
          `pemakai ${o.nama || '-'}${o.identitas ? ` (${o.identitas})` : ''}${o.jabatan ? `, ${o.jabatan}` : ''}`,
          o.status ? `status ${o.status}` : '',
          r.aset?.no_polisi ? `no. polisi ${r.aset.no_polisi}` : '',
          o.paktaNo ? `pakta integritas ${o.paktaNo}${o.paktaTgl ? ` (${o.paktaTgl})` : ''}` : '',
        ].filter(Boolean),
      })
    }
  })
  return {
    butir,
    catatan: ['Pengamanan = POSISI: barang yang MASIH dipegang pemakainya pada akhir periode (yang sudah dikembalikan/dibatalkan tidak dihitung).'],
  }
}

async function muatHapus(sb: SupabaseClient, l: Lingkup, periode: string): Promise<HasilMenu> {
  const cabang = [FORMAT_PENGHAPUSAN.pemindahtanganan, FORMAT_PENGHAPUSAN.sebab_lain]
  const hasil = await Promise.all(cabang.map(f => muatLaporanPenghapusan(sb, { f, skpdId: l.skpdId, periode })))
  const butir: Butir[] = []
  hasil.forEach((h, i) => {
    for (const r of h.rows) {
      butir.push({
        kelompok: cabang[i].jenis === 'penghapusan_sebab_lain' ? 'Sebab Lain' : `Pemindahtanganan — ${r.caraPemindahtanganan || 'tanpa keterangan cara'}`,
        tanggal: r.header?.tanggal || r.tanggal, noDok: r.header?.no_sk || '-',
        skpd: r.skpdNama || '-',
        barang: r.aset?.nama_barang || '-', nibar: r.aset?.nibar || '-', kode: r.aset?.kode || '-',
        nilai: Number(r.nilai) || 0,
        rinci: [
          r.aset?.merek_tipe ? `merek ${r.aset.merek_tipe}` : '',
          r.aset?.no_polisi ? `no. polisi ${r.aset.no_polisi}` : '',
          r.tanpaPenyusutan ? '' : `akumulasi Rp${rp(r.akumulasi)} · nilai buku Rp${rp(r.nilaiBuku)}`,
          r.header?.keterangan ? `ket: ${r.header.keterangan}` : '',
        ].filter(Boolean),
      })
    }
  })
  return {
    butir,
    catatan: ['Penghapusan yang sudah dibatalkan tidak dihitung. Barang yang keluar karena PENGALIHAN STATUS ke SKPD lain ada di menu Penggunaan, bukan di sini.'],
  }
}

export type KonteksPengelolaan = {
  lingkup: Lingkup
  /** TAHUN / TAHUN-S1 / TAHUN-S2 — tidak boleh kosong. */
  periode: string
  hariIni: string
  namaSkpd: Map<number, string>
}

export function muatMenu(sb: SupabaseClient, menu: MenuPengelolaan, k: KonteksPengelolaan): Promise<HasilMenu> {
  switch (menu) {
    case 'penggunaan': return muatPindah(sb, 'pengalihan_status', k.lingkup, k.periode)
    case 'mutasi_internal': return muatPindah(sb, 'mutasi_internal', k.lingkup, k.periode)
    case 'pemanfaatan': return muatManfaat(sb, k.lingkup, k.hariIni)
    case 'reklasifikasi': return muatReklas(sb, k.lingkup, k.periode)
    case 'koreksi': return muatKoreksi(sb, k.lingkup, k.periode, k.namaSkpd)
    case 'kapitalisasi': return muatKap(sb, k.lingkup, k.periode)
    case 'pengamanan': return muatAman(sb, k.lingkup, k.periode)
    case 'penghapusan': return muatHapus(sb, k.lingkup, k.periode)
  }
}

// ── Penyusun jawaban ────────────────────────────────────────────────────────

/** Σ nilai: butir ber-`kunciNilai` dihitung SEKALI per kunci; `null` dilewati. */
export function jumlahNilai(butir: Butir[]): number {
  const sudah = new Set<string>()
  let t = 0
  for (const b of butir) {
    if (b.nilai == null) continue
    if (b.kunciNilai) { if (sudah.has(b.kunciNilai)) continue; sudah.add(b.kunciNilai) }
    t += b.nilai
  }
  return t
}

/** Kelompok yang cuma mengulang nama menunya — tak perlu baris rincian sendiri. */
const KELOMPOK_TUNGGAL: ReadonlySet<string> = new Set(['Kapitalisasi', 'Perpindahan'])

function ringkasMenu(menu: MenuPengelolaan, h: HasilMenu): string[] {
  if (h.butir.length === 0) return [`■ ${LABEL_MENU[menu]}: tidak ada.`]
  const per = new Map<string, Butir[]>()
  for (const b of h.butir) per.set(b.kelompok, [...(per.get(b.kelompok) || []), b])
  const keluar = [`■ ${LABEL_MENU[menu]}: ${fmtN(h.butir.length)} baris · Rp${rp(jumlahNilai(h.butir))} (${LABEL_NILAI[menu]})`]
  // Rincian per kelompok hanya kalau memang memecah sesuatu.
  if (per.size > 1 || !KELOMPOK_TUNGGAL.has([...per.keys()][0])) {
    for (const [k, bs] of [...per.entries()].sort((a, b) => b[1].length - a[1].length)) {
      keluar.push(`   - ${k}: ${fmtN(bs.length)} · Rp${rp(jumlahNilai(bs))}`)
    }
  }
  return keluar
}

export async function rekapPengelolaan(
  sb: SupabaseClient, k: KonteksPengelolaan, menuDiminta: MenuPengelolaan | null,
): Promise<string> {
  const daftar = menuDiminta ? [menuDiminta] : [...MENU_PENGELOLAAN]
  // allSettled, bukan all: satu menu yang gagal tak boleh menghapus tujuh yang
  // berhasil — TAPI kegagalannya ditulis di tempatnya, tak pernah jadi "tidak ada".
  const hasil = await Promise.allSettled(daftar.map(m => muatMenu(sb, m, k)))
  const keluar = [`Rekap PENGELOLAAN BMD · periode ${k.periode} · ${k.lingkup.label} (sumber sama dgn Laporan Pengelolaan):`]
  const catatan = new Set<string>()
  hasil.forEach((h, i) => {
    const m = daftar[i]
    if (h.status === 'rejected') {
      keluar.push(`■ ${LABEL_MENU[m]}: GAGAL dibaca — ${h.reason instanceof Error ? h.reason.message : String(h.reason)}. JANGAN anggap nol.`)
      return
    }
    keluar.push(...ringkasMenu(m, h.value))
    if (menuDiminta || h.value.butir.length > 0) for (const c of h.value.catatan) catatan.add(c)
    if (MENU_POSISI.has(m) && h.value.butir.length > 0 && !menuDiminta) catatan.add(`${LABEL_MENU[m]} adalah posisi, bukan arus periode.`)
  })
  keluar.push('Catatan:', ...[...catatan].map(c => `- ${c}`),
    '- "Baris" = satu barang per transaksi (Kapitalisasi: satu dokumen). Arti kolom nilai berbeda tiap menu — jangan dijumlah lintas menu.',
    '- Untuk rincian barang per transaksi pakai daftar_pengelolaan.')
  return keluar.join('\n')
}

export async function daftarPengelolaan(
  sb: SupabaseClient, k: KonteksPengelolaan, menu: MenuPengelolaan, kata: string,
): Promise<string> {
  const h = await muatMenu(sb, menu, k)
  const q = kata.toLowerCase()
  const cocok = q
    ? h.butir.filter(b => [b.barang, b.nibar, b.kode, b.noDok, b.skpd, b.kelompok, ...b.rinci].join(' ').toLowerCase().includes(q))
    : h.butir
  const judul = `${LABEL_MENU[menu]} · ${MENU_POSISI.has(menu) ? 'posisi' : `periode ${k.periode}`} · ${k.lingkup.label}${kata ? ` · cari "${kata}"` : ''}`
  if (cocok.length === 0) {
    return `${judul}: tidak ada${q && h.butir.length ? ` yang cocok (dari ${fmtN(h.butir.length)} baris)` : ''}.\n${h.catatan.map(c => `- ${c}`).join('\n')}`
  }
  const urut = [...cocok].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nibar.localeCompare(b.nibar))
  return [
    `${judul}: ${fmtN(cocok.length)} baris · Rp${rp(jumlahNilai(cocok))} (${LABEL_NILAI[menu]})`,
    ...urut.slice(0, MAKS_DAFTAR).map(b => [
      `- [${b.kelompok}] ${b.tanggal} · dok ${b.noDok}`,
      `${b.barang}`, `NIBAR ${b.nibar}`, `kode ${b.kode}`,
      b.nilai == null ? 'tanpa nilai' : `Rp${rp(b.nilai)}`,
      `SKPD ${b.skpd}`,
      ...b.rinci,
    ].join(' · ')),
    cocok.length > MAKS_DAFTAR ? `(Ditampilkan ${MAKS_DAFTAR} terbaru dari ${fmtN(cocok.length)} — persempit dengan kata_kunci, skpd_id, atau periode semester.)` : '',
    ...h.catatan.map(c => `Catatan: ${c}`),
  ].filter(Boolean).join('\n')
}
