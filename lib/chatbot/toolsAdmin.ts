// Alat BACA tambahan untuk pengguna ISTIMEWA Asisten AI (lib/chatbot/istimewa.ts).
//
// ATURAN YANG SAMA dgn lib/chatbot/tools.ts, jangan dilonggarkan:
//  - Semuanya HANYA-BACA. Tak ada insert/update/delete/rpc yang mengubah.
//  - Selalu dipanggil dgn client SESI USER (createClient), BUKAN service_role:
//    yang membatasi jawaban tetap RLS & wewenang fungsi SECURITY DEFINER-nya.
//    Cakupan se-kabupaten di sini datang dari PERAN ADMIN akun itu, bukan dari
//    kode ini — kalau perannya dicabut, alat-alat ini otomatis menyempit.
//  - Kegagalan dilaporkan sbg teks berawalan "GAGAL:" (bukan hasil kosong).
//  - Tak ada SQL bebas: model tak boleh merangkai query atas data pemda live.
//
// Gerbang SESUNGGUHNYA ada di route (penggunaIstimewa + peran admin) dan di
// dispatch-nya; alat-alat ini tak memeriksa siapa pemanggilnya.
import type { SupabaseClient } from '@supabase/supabase-js'
import { GOLONGAN_REKAP, JENIS_PEROLEHAN } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import { rekapPerGolongan, zeroRekap, type RekapRpcRow } from '@/lib/rekapBmd'
import { muatSkpd, turunanSkpd, type SkpdRow } from './skpdPohon'
import { rekapPerolehan } from './perolehan'
import {
  MENU_PENGELOLAAN, rekapPengelolaan, daftarPengelolaan,
  type MenuPengelolaan, type KonteksPengelolaan,
} from './pengelolaan'

const MAKS_BARIS = 30
const rp = (n: number | null | undefined) => formatRupiah2(n)
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
const GOL_URAIAN: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))
const teks = (v: unknown) => typeof v === 'string' ? v.trim() : ''

const JENIS_RKBMD = ['pengadaan', 'pemeliharaan', 'pemanfaatan', 'pemindahtanganan', 'penghapusan'] as const

export const TOOL_DEFS_ADMIN = [
  {
    name: 'cari_skpd',
    description:
      'Cari SKPD/unit berdasarkan nama (maks 10 hasil): id, nama, tingkat (1 = Pengguna Barang, 2 = Kuasa, 3 = Sub Kuasa). '
      + 'Pakai untuk mendapatkan skpd_id sebelum memanggil rekap_bmd_skpd.',
    input_schema: {
      type: 'object' as const,
      properties: { kata_kunci: { type: 'string', description: 'Sebagian nama SKPD, mis. "Pendidikan".' } },
      required: ['kata_kunci'],
    },
  },
  {
    name: 'rekap_bmd_skpd',
    description:
      'Rekap Laporan BMD per golongan (jumlah unit, nilai perolehan, akumulasi penyusutan, beban semester, nilai buku) '
      + 'pada SATU periode, untuk satu SKPD BERIKUT seluruh unit di bawahnya — atau se-kabupaten kalau skpd_id dikosongkan. '
      + 'Angka yang sama dgn menu Pelaporan → Laporan BMD. Butuh skpd_id dari cari_skpd. '
      + '⚠️ BERAT (belasan s.d. puluhan detik, se-kabupaten paling lama). Pakai HANYA kalau ditanya angka '
      + 'PENYUSUTAN (akumulasi/beban/nilai buku) atau periode tertentu. Untuk sekadar jumlah unit & nilai perolehan '
      + 'per jenis/golongan saat ini, pakai rekap_aset (jauh lebih cepat).',
    input_schema: {
      type: 'object' as const,
      properties: {
        periode: { type: 'string', description: 'Format TAHUN-S1 / TAHUN-S2, mis. "2026-S1".' },
        skpd_id: { type: 'number', description: 'Opsional. Kosongkan untuk se-kabupaten.' },
        komptabel: { type: 'string', description: '"intra" (bawaan, isi neraca) atau "ekstra".' },
      },
      required: ['periode'],
    },
  },
  {
    name: 'hitung_barang',
    description:
      'HITUNG berapa barang AKTIF per KODE BARANG (jumlah unit + total nilai perolehan), opsional dibatasi satu SKPD '
      + '(berikut seluruh unit di bawahnya) dan opsional dipecah per SKPD. Pencarian lewat URAIAN KODEFIKASI, jadi '
      + '"laptop" menemukan kode "Lap Top" DAN "Laptop" sekaligus — dilaporkan terpisah per kode, jangan digabung diam-diam. '
      + 'Pakai untuk "berapa Laptop di BKAD", "berapa kendaraan roda dua se-kabupaten", "SKPD mana saja yang punya Proyektor". '
      + 'Cepat (<1 dtk untuk pertanyaan wajar). Untuk SKPD tertentu: cari_skpd dulu untuk mendapat skpd_id. '
      + 'Hanya jumlah & nilai perolehan — TIDAK memuat penyusutan (pakai posisi_penyusutan / rekap_bmd_skpd). '
      + 'Kata yang terlalu umum ("meja", "alat") ditolak karena cocok dengan puluhan kode; persempit atau pakai awalan kode.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kata_kunci: { type: 'string', description: 'Sebagian uraian kode barang, mis. "laptop", "lap top", "printer".' },
        kode: { type: 'string', description: 'Opsional. Awalan kode barang, mis. "1.3.2.10.01". Boleh dipakai TANPA kata_kunci.' },
        skpd_id: { type: 'number', description: 'Opsional. Kosongkan untuk se-kabupaten. Ambil dari cari_skpd.' },
        per_skpd: { type: 'boolean', description: 'Opsional. true = rincikan per SKPD (se-kabupaten: per SKPD induk; dengan skpd_id: per unit).' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'rekap_perolehan',
    description:
      'Rekap PEROLEHAN barang per CARA PEROLEHAN (Pengadaan, Hibah, Tukar Menukar, Hasil Inventarisasi, Perolehan Lainnya) '
      + 'pada satu periode: jumlah barang & total nilai perolehan, opsional dirinci per SKPD dan/atau per golongan. '
      + 'Dibaca dari transaksi perolehan (ledger) dgn aturan YANG SAMA persis dgn menu Pelaporan → Laporan Perolehan '
      + '(transaksi yang dibatalkan/duplikat sudah dibuang), jadi angkanya sama dgn laporan resmi. '
      + 'Pakai untuk "berapa nilai hibah 2026", "pengadaan tahun ini berapa", "SKPD mana yang paling banyak menerima hibah", '
      + '"hibah berupa apa saja". Tanpa `cara` = keempat-lima cara sekaligus. '
      + 'BEDA dari rekap_aset (posisi aset aktif HARI INI per golongan): barang hibah yang kemudian dihapus tetap tercatat sbg perolehan di sini. '
      + 'Termin pekerjaan konstruksi (KDP) TIDAK termasuk. Untuk SKPD tertentu: cari_skpd dulu.',
    input_schema: {
      type: 'object' as const,
      properties: {
        periode: { type: 'string', description: 'TAHUN ("2026" = S1+S2) atau semester ("2026-S1"). Kosongkan untuk semua periode yang ada.' },
        cara: { type: 'string', description: `Opsional. Salah satu: ${JENIS_PEROLEHAN.join(', ')}. Kosongkan untuk semua cara.` },
        skpd_id: { type: 'number', description: 'Opsional. Batasi ke satu SKPD beserta unit di bawahnya (ambil dari cari_skpd).' },
        per_skpd: { type: 'boolean', description: 'Opsional. true = rincikan per SKPD (se-kabupaten: SKPD induk; dengan skpd_id: per unit).' },
        per_golongan: { type: 'boolean', description: 'Opsional. true = rincikan per golongan barang (Tanah, Gedung, dst.).' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'rekap_pengelolaan',
    description:
      'Rekap menu PENGELOLAAN pada satu periode: jumlah baris & nilai per menu, dirinci per sub-kelompok. Menunya: '
      + 'penggunaan (pengalihan status antar-SKPD), mutasi_internal (Penerimaan & Pengeluaran Internal), pemanfaatan '
      + '(sewa/pinjam pakai/KSP/BGS-BSG/KSPI), reklasifikasi, koreksi (nilai, spesifikasi, pencatatan ganda, pemecahan), '
      + 'kapitalisasi, pengamanan, penghapusan (pemindahtanganan: hibah/penjualan/tukar-menukar/penyertaan modal, & sebab lain). '
      + 'Angkanya dibaca lewat pemuat yang SAMA dgn menu Pelaporan → Laporan Pengelolaan (transaksi yang dibatalkan sudah dibuang). '
      + 'Pakai untuk "berapa penghapusan 2026", "ada berapa mutasi di Dinas X", "rekap pengelolaan tahun ini". '
      + 'Tanpa `menu` = kedelapan menu sekaligus (lebih lambat; sebut `menu` kalau pertanyaannya cuma satu). '
      + 'Dengan skpd_id, perpindahan dipisah Masuk / Keluar / antar-unit di dalam SKPD itu.',
    input_schema: {
      type: 'object' as const,
      properties: {
        periode: { type: 'string', description: 'TAHUN ("2026") atau semester ("2026-S1"). Kosong = tahun berjalan.' },
        menu: { type: 'string', description: `Opsional. Salah satu: ${MENU_PENGELOLAAN.join(', ')}.` },
        skpd_id: { type: 'number', description: 'Opsional. Satu SKPD beserta unit di bawahnya (ambil dari cari_skpd). Kosong = se-kabupaten.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'daftar_pengelolaan',
    description:
      'RINCIAN per barang/transaksi untuk SATU menu pengelolaan (maks 30 terbaru): tanggal, nomor dokumen, barang, NIBAR, kode, nilai, '
      + 'SKPD (untuk perpindahan: asal → tujuan), plus detail khas menunya — reklas: kode lama → baru; koreksi nilai: nilai lama → baru; '
      + 'kapitalisasi: induk, barang yang diserap, nilai sebelum/sesudah; pemanfaatan: mitra, masa, status, lingkup; '
      + 'pengamanan: nama pemakai, identitas, jabatan, pakta integritas; penghapusan: cara pemindahtanganan, akumulasi & nilai buku. '
      + 'Pakai sesudah rekap_pengelolaan, atau langsung untuk "barang apa saja yang dihapus tahun ini", "siapa pemakai motor X", '
      + '"pemanfaatan apa saja yang aktif". `kata_kunci` menyaring di nama barang/NIBAR/kode/nomor dokumen/SKPD/rincian.',
    input_schema: {
      type: 'object' as const,
      properties: {
        menu: { type: 'string', description: `Salah satu: ${MENU_PENGELOLAAN.join(', ')}.` },
        periode: { type: 'string', description: 'TAHUN ("2026") atau semester ("2026-S1"). Kosong = tahun berjalan.' },
        skpd_id: { type: 'number', description: 'Opsional. Satu SKPD beserta unit di bawahnya.' },
        kata_kunci: { type: 'string', description: 'Opsional. Saring hasil, mis. nama barang, nopol, nama pemakai, nomor dokumen.' },
      },
      required: ['menu'],
    },
  },
  {
    name: 'sebaran_golongan',
    description:
      'SKPD MANA SAJA yang memiliki aset AKTIF suatu golongan, berikut jumlah unit & nilai perolehan per SKPD induk '
      + '(unit di bawahnya digabung ke induk). Cepat. Pakai untuk "berapa SKPD yang punya ATB / apa saja / berapa nilainya per SKPD". '
      + 'Cocok untuk golongan kecil (mis. 1.5.3 ATB, 1.3.6 KDP, 1.5.4 Aset Lain-Lain); golongan raksasa seperti '
      + '1.3.2 Peralatan & Mesin (±219 rb aset) DITOLAK — untuk itu pakai rekap_bmd_skpd per SKPD.',
    input_schema: {
      type: 'object' as const,
      properties: { golongan: { type: 'string', description: 'Kode golongan level-3, mis. "1.5.3".' } },
      required: ['golongan'],
    },
  },
  {
    name: 'kartu_pending',
    description:
      'Kartu jurnal yang MENUNGGU PERSETUJUAN (status pending) se-kabupaten: jumlah per kategori (pengadaan, konstruksi, dst.) '
      + 'dan 15 kartu terbaru berikut SKPD-nya. Pakai untuk "berapa kontrak yang belum disetujui".',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'status_tahun_buku',
    description: 'Status tiap Tahun Buku (terbuka / terkunci) beserta kapan & catatan penutupannya.',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'status_rkbmd',
    description:
      'Status penyusunan RKBMD satu jenis & satu tahun anggaran: jumlah dokumen per status (draft/diajukan/disetujui/ditolak, '
      + 'termasuk yang NIHIL) dan daftar SKPD Pengguna Barang (tingkat 1) yang BELUM punya dokumen sama sekali. '
      + `Jenis: ${JENIS_RKBMD.join(', ')}.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        tahun_anggaran: { type: 'number', description: 'Mis. 2027.' },
        jenis: { type: 'string', description: 'Bawaan "pengadaan".' },
      },
      required: ['tahun_anggaran'],
    },
  },
]

export const NAMA_TOOL_ADMIN = new Set(TOOL_DEFS_ADMIN.map(t => t.name))

export async function jalankanToolAdmin(sb: SupabaseClient, nama: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (nama) {
      case 'cari_skpd': return await cariSkpd(sb, teks(input.kata_kunci))
      case 'rekap_bmd_skpd': return await rekapBmdSkpd(sb, teks(input.periode), input.skpd_id, teks(input.komptabel))
      case 'hitung_barang': return await hitungBarang(sb, teks(input.kata_kunci), teks(input.kode), input.skpd_id, input.per_skpd === true)
      case 'rekap_perolehan': return await rekapPerolehan(sb, teks(input.periode), teks(input.cara), input.skpd_id, input.per_skpd === true, input.per_golongan === true)
      case 'rekap_pengelolaan': return await alatPengelolaan(sb, 'rekap', input)
      case 'daftar_pengelolaan': return await alatPengelolaan(sb, 'daftar', input)
      case 'sebaran_golongan': return await sebaranGolongan(sb, teks(input.golongan))
      case 'kartu_pending': return await kartuPending(sb)
      case 'status_tahun_buku': return await statusTahunBuku(sb)
      case 'status_rkbmd': return await statusRkbmd(sb, Number(input.tahun_anggaran), teks(input.jenis))
      default: return `GAGAL: alat "${nama}" tidak dikenal.`
    }
  } catch (e) {
    return `GAGAL: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function cariSkpd(sb: SupabaseClient, kata: string): Promise<string> {
  const q = kata.replace(/[,%()*]/g, ' ').trim()
  if (!q) return 'GAGAL: kata kunci kosong.'
  const { data, error } = await sb.from('admin_skpd').select('id,nama,level').ilike('nama', `%${q}%`).order('level').order('nama').limit(10)
  if (error) return `GAGAL mencari SKPD: ${error.message}`
  const rows = (data || []) as unknown as { id: number; nama: string; level: number }[]
  if (rows.length === 0) return `Tidak ada SKPD yang namanya memuat "${kata}".`
  return [
    `Hasil pencarian SKPD "${kata}" (maks 10):`,
    ...rows.map(r => `- id ${r.id} · ${r.nama} · tingkat ${r.level}`),
    rows.length === 10 ? '(Mungkin masih ada yang lain — persempit kata kuncinya.)' : '',
  ].filter(Boolean).join('\n')
}

async function rekapBmdSkpd(sb: SupabaseClient, periode: string, skpdId: unknown, komptabel: string): Promise<string> {
  if (!/^\d{4}-S[12]$/.test(periode)) return 'GAGAL: periode harus berformat TAHUN-S1 atau TAHUN-S2, mis. 2026-S1.'
  const komp = komptabel === 'ekstra' ? 'ekstra' : 'intra'

  let ids: number[] | null = null
  let label = 'SELURUH KABUPATEN'
  if (skpdId != null && skpdId !== '') {
    const akar = Number(skpdId)
    if (!Number.isInteger(akar)) return 'GAGAL: skpd_id harus angka bulat (ambil dari cari_skpd).'
    const semua = await muatSkpd(sb)
    const ada = semua.find(s => s.id === akar)
    if (!ada) return `GAGAL: SKPD dengan id ${akar} tidak ditemukan.`
    ids = turunanSkpd(semua, akar)
    label = `${ada.nama} beserta ${ids.length - 1} unit di bawahnya`
  }

  const { data, error } = await sb.rpc('fn_rekap_bmd', { p_periode: periode, p_skpd_ids: ids, p_komptabel: komp })
  if (error) return `GAGAL membaca rekap BMD: ${error.message}`
  const rekap = rekapPerGolongan((data || []) as RekapRpcRow[])
  if (rekap.size === 0) return `Tidak ada data Laporan BMD ${komp}komptabel periode ${periode} untuk ${label}.`

  const golongan = [...rekap.keys()].sort()
  const tot = zeroRekap()
  const baris = golongan.map(g => {
    const r = rekap.get(g) as ReturnType<typeof zeroRekap>
    tot.kuantitas += r.kuantitas; tot.perolehan += r.perolehan; tot.akumulasi += r.akumulasi
    tot.beban += r.beban; tot.nilaiBuku += r.nilaiBuku
    return `- ${g} ${GOL_URAIAN[g] || ''}: ${fmtN(r.kuantitas)} unit · perolehan Rp${rp(r.perolehan)} · akumulasi Rp${rp(r.akumulasi)} · beban Rp${rp(r.beban)} · nilai buku Rp${rp(r.nilaiBuku)}`
  })
  return [
    `Laporan BMD ${komp}komptabel · periode ${periode} · ${label}:`,
    ...baris,
    `TOTAL: ${fmtN(tot.kuantitas)} unit · perolehan Rp${rp(tot.perolehan)} · akumulasi Rp${rp(tot.akumulasi)} · beban Rp${rp(tot.beban)} · nilai buku Rp${rp(tot.nilaiBuku)}`,
    'Catatan: golongan yang tidak disusutkan (Tanah, ATL, KDP) nilai bukunya = nilai perolehan.',
  ].join('\n')
}

/** Tanggal hari ini menurut WIB (YYYY-MM-DD) — server Vercel berjam UTC, dan
 *  status "Berakhir" pemanfaatan tak boleh bergeser sehari karenanya. */
const hariIniWib = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())

async function alatPengelolaan(sb: SupabaseClient, mode: 'rekap' | 'daftar', input: Record<string, unknown>): Promise<string> {
  const hariIni = hariIniWib()
  const periode = teks(input.periode) || hariIni.slice(0, 4)
  if (!/^\d{4}(-S[12])?$/.test(periode)) return 'GAGAL: periode harus berformat TAHUN (2026) atau TAHUN-S1 / TAHUN-S2 (2026-S1).'
  const menu = teks(input.menu)
  if (menu && !(MENU_PENGELOLAAN as readonly string[]).includes(menu)) {
    return `GAGAL: menu harus salah satu dari ${MENU_PENGELOLAAN.join(', ')}.`
  }
  if (mode === 'daftar' && !menu) return `GAGAL: sebutkan menu-nya (${MENU_PENGELOLAAN.join(', ')}).`

  const semua = await muatSkpd(sb)
  const namaSkpd = new Map(semua.map(x => [x.id, x.nama]))
  let lingkup: KonteksPengelolaan['lingkup'] = { skpdId: null, desc: null, label: 'SELURUH KABUPATEN' }
  if (input.skpd_id != null && input.skpd_id !== '') {
    const akar = Number(input.skpd_id)
    if (!Number.isInteger(akar)) return 'GAGAL: skpd_id harus angka bulat (ambil dari cari_skpd).'
    const ada = semua.find(x => x.id === akar)
    if (!ada) return `GAGAL: SKPD dengan id ${akar} tidak ditemukan.`
    const desc = turunanSkpd(semua, akar)
    lingkup = { skpdId: akar, desc, label: `${ada.nama}${desc.length > 1 ? ` beserta ${desc.length - 1} unit di bawahnya` : ''}` }
  }
  const k: KonteksPengelolaan = { lingkup, periode, hariIni, namaSkpd }
  return mode === 'rekap'
    ? rekapPengelolaan(sb, k, (menu || null) as MenuPengelolaan | null)
    : daftarPengelolaan(sb, k, menu as MenuPengelolaan, teks(input.kata_kunci))
}

type BarisHitung = { kode: string; uraian: string | null; skpd_id: number | null; jumlah: number; nilai_perolehan: number }

async function hitungBarang(sb: SupabaseClient, kata: string, kode: string, skpdId: unknown, perSkpd: boolean): Promise<string> {
  if (!kata && !kode) return 'GAGAL: isi kata_kunci (mis. "laptop") atau kode (awalan kode barang).'
  if (kode && !/^[0-9.]+$/.test(kode)) return 'GAGAL: kode harus berupa awalan angka & titik, mis. 1.3.2.10.01.'

  let ids: number[] | null = null
  let semua: SkpdRow[] = []
  let label = 'SELURUH KABUPATEN'
  const punyaSkpd = skpdId != null && skpdId !== ''
  if (punyaSkpd) {
    const akar = Number(skpdId)
    if (!Number.isInteger(akar)) return 'GAGAL: skpd_id harus angka bulat (ambil dari cari_skpd).'
    semua = await muatSkpd(sb)
    const ada = semua.find(s => s.id === akar)
    if (!ada) return `GAGAL: SKPD dengan id ${akar} tidak ditemukan.`
    ids = turunanSkpd(semua, akar)
    label = `${ada.nama}${ids.length > 1 ? ` beserta ${ids.length - 1} unit di bawahnya` : ''}`
  } else if (perSkpd) {
    semua = await muatSkpd(sb)
  }

  const { data, error } = await sb.rpc('fn_chatbot_hitung_barang', {
    p_kata: kata || null, p_kode: kode || null, p_skpd_ids: ids, p_per_skpd: perSkpd,
  })
  // ⚠️ Pesan penolakan "terlalu umum" datang dari fungsinya & sengaja diteruskan
  // apa adanya: model harus tahu ia perlu mempersempit, bukan menyimpulkan "0".
  if (error) return `GAGAL menghitung barang: ${error.message}`
  const rows = ((data || []) as unknown as BarisHitung[]).map(r => ({
    ...r, jumlah: Number(r.jumlah), nilai_perolehan: Number(r.nilai_perolehan),
  }))
  const cari = [kata && `"${kata}"`, kode && `kode ${kode}*`].filter(Boolean).join(' + ')
  if (rows.length === 0) {
    return `Tidak ada barang aktif yang cocok dengan ${cari} di ${label}. `
      + '(Bisa karena tidak ada kode barang dengan uraian itu, atau kodenya ada tapi belum ada asetnya.)'
  }

  // Ringkasan per KODE (dijumlah lintas SKPD kalau dipecah per SKPD).
  const perKode = new Map<string, { uraian: string | null; n: number; rp: number }>()
  for (const r of rows) {
    const c = perKode.get(r.kode) || { uraian: r.uraian, n: 0, rp: 0 }
    c.n += r.jumlah; c.rp += r.nilai_perolehan
    perKode.set(r.kode, c)
  }
  const totN = rows.reduce((t, r) => t + r.jumlah, 0)
  const totRp = rows.reduce((t, r) => t + r.nilai_perolehan, 0)
  const baris = [...perKode.entries()].sort((a, b) => b[1].n - a[1].n)
    .map(([k, c]) => `- ${k} · ${c.uraian || '(uraian tidak ada di kodefikasi)'}: ${fmtN(c.n)} unit · Rp${rp(c.rp)}`)

  const keluar = [
    `Barang AKTIF yang cocok dengan ${cari} di ${label}:`,
    ...baris,
    perKode.size > 1 ? `TOTAL: ${fmtN(totN)} unit · Rp${rp(totRp)}` : '',
  ]

  if (perSkpd) {
    const byId = new Map(semua.map(s => [s.id, s]))
    // Se-kabupaten: unit digabung ke SKPD induknya. Dengan skpd_id: per unit itu sendiri.
    const kunci = (id: number): number => {
      if (punyaSkpd) return id
      let s = byId.get(id)
      for (let i = 0; s && s.parent_id != null && i < 10; i++) s = byId.get(s.parent_id)
      return s ? s.id : id
    }
    const per = new Map<number, { n: number; rp: number }>()
    for (const r of rows) {
      if (r.skpd_id == null) continue
      const k = kunci(r.skpd_id)
      const c = per.get(k) || { n: 0, rp: 0 }
      c.n += r.jumlah; c.rp += r.nilai_perolehan
      per.set(k, c)
    }
    const urut = [...per.entries()].sort((a, b) => b[1].n - a[1].n)
    keluar.push(
      `Rincian per ${punyaSkpd ? 'unit' : 'SKPD induk'} (${urut.length} yang punya, semua kode di atas dijumlah):`,
      ...urut.slice(0, MAKS_BARIS).map(([id, c]) => `- ${byId.get(id)?.nama || `SKPD ${id}`}: ${fmtN(c.n)} unit · Rp${rp(c.rp)}`),
      urut.length > MAKS_BARIS ? `(Terpotong di ${MAKS_BARIS} — masih ada ${urut.length - MAKS_BARIS} lainnya.)` : '',
    )
  }
  keluar.push('Catatan: hanya aset berstatus aktif; nilai = nilai perolehan (bukan nilai buku).')
  return keluar.filter(Boolean).join('\n')
}

/** Batas baris yang boleh ditarik. Golongan di atas ini DITOLAK, bukan dipotong:
 *  jumlah per SKPD dari potongan baris akan tampak sah tapi kurang. */
const MAKS_BARIS_SEBARAN = 3000

async function sebaranGolongan(sb: SupabaseClient, golongan: string): Promise<string> {
  if (!/^1\.\d\.\d$/.test(golongan)) return 'GAGAL: golongan harus berformat level-3, mis. 1.5.3.'
  // `.eq('golongan')`, BUKAN `.like('kode', 'gol.%')` — LIKE tak pernah jadi
  // index-cond di bawah RLS (CLAUDE.md, empat ronde timeout); `golongan` kolom
  // GENERATED yang setara menurut definisi & terindeks.
  const rows: { skpd_id: number; nilai_perolehan: number }[] = []
  let kursor: string | null = null
  for (let halaman = 0; halaman < 3; halaman++) {
    let q = sb.from('aset').select('id,skpd_id,nilai_perolehan').eq('golongan', golongan).eq('status', 'aktif')
    if (kursor) q = q.gt('id', kursor)
    const { data, error } = await q.order('id').limit(1000)
    if (error) return `GAGAL membaca aset golongan ${golongan}: ${error.message}`
    const b = (data || []) as unknown as { id: string; skpd_id: number; nilai_perolehan: number }[]
    rows.push(...b)
    if (b.length < 1000) { kursor = null; break }
    kursor = b[b.length - 1].id
  }
  if (kursor) return `GAGAL: golongan ${golongan} terlalu besar (>${MAKS_BARIS_SEBARAN} aset) untuk dirinci per SKPD lewat alat ini. Pakai rekap_bmd_skpd untuk satu SKPD.`
  if (rows.length === 0) return `Tidak ada aset aktif golongan ${golongan} (${GOL_URAIAN[golongan] || '-'}) di lingkup akun ini.`

  const skpd = await muatSkpd(sb)
  const byId = new Map(skpd.map(s => [s.id, s]))
  const akar = (id: number): SkpdRow | undefined => {
    let s = byId.get(id)
    for (let i = 0; s && s.parent_id != null && i < 10; i++) s = byId.get(s.parent_id)
    return s
  }
  const per = new Map<number, { n: number; nilai: number }>()
  for (const r of rows) {
    const a = akar(r.skpd_id)?.id ?? r.skpd_id
    const c = per.get(a) || { n: 0, nilai: 0 }
    c.n += 1; c.nilai += Number(r.nilai_perolehan) || 0
    per.set(a, c)
  }
  const urut = [...per.entries()].sort((a, b) => b[1].nilai - a[1].nilai)
  const totRp = rows.reduce((s, r) => s + (Number(r.nilai_perolehan) || 0), 0)
  return [
    `Golongan ${golongan} ${GOL_URAIAN[golongan] || ''}: ${fmtN(rows.length)} aset aktif di ${urut.length} SKPD induk (${new Set(rows.map(r => r.skpd_id)).size} unit), total nilai perolehan Rp${rp(totRp)}.`,
    ...urut.slice(0, MAKS_BARIS).map(([id, c]) => `- ${byId.get(id)?.nama || `SKPD ${id}`}: ${fmtN(c.n)} aset · Rp${rp(c.nilai)}`),
    urut.length > MAKS_BARIS ? `(Terpotong di ${MAKS_BARIS} SKPD — masih ada ${urut.length - MAKS_BARIS} lainnya.)` : '',
  ].filter(Boolean).join('\n')
}

async function kartuPending(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.from('jurnal_header')
    .select('kategori,skpd_id,no_sk,tanggal').eq('approval_status', 'pending')
    .order('created_at', { ascending: false }).limit(500)
  if (error) return `GAGAL membaca kartu pending: ${error.message}`
  const rows = (data || []) as unknown as { kategori: string; skpd_id: number; no_sk: string | null; tanggal: string }[]
  if (rows.length === 0) return 'Tidak ada kartu jurnal yang menunggu persetujuan.'

  const perKategori = new Map<string, number>()
  for (const r of rows) perKategori.set(r.kategori, (perKategori.get(r.kategori) || 0) + 1)
  const terbaru = rows.slice(0, 15)
  const idSkpd = [...new Set(terbaru.map(r => r.skpd_id))]
  const { data: sk, error: eSk } = await sb.from('admin_skpd').select('id,nama').in('id', idSkpd)
  if (eSk) return `GAGAL membaca nama SKPD: ${eSk.message}`
  const nama = new Map(((sk || []) as unknown as { id: number; nama: string }[]).map(s => [s.id, s.nama]))

  return [
    `Kartu menunggu persetujuan: ${rows.length}${rows.length >= 500 ? '+ (dibatasi 500 baris)' : ''}`,
    ...[...perKategori.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`),
    '15 terbaru:',
    ...terbaru.map(r => `- ${r.kategori} · ${r.no_sk || '(tanpa nomor)'} · ${r.tanggal} · ${nama.get(r.skpd_id) || `SKPD ${r.skpd_id}`}`),
  ].join('\n')
}

async function statusTahunBuku(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.from('tahun_buku').select('tahun,status,ditutup_pada,catatan').order('tahun')
  if (error) return `GAGAL membaca tahun buku: ${error.message}`
  const rows = (data || []) as unknown as { tahun: number; status: string; ditutup_pada: string | null; catatan: string | null }[]
  if (rows.length === 0) return 'Belum ada tahun buku terdaftar (tahun yang tak terdaftar dianggap TERKUNCI).'
  return [
    'Tahun Buku:',
    ...rows.map(r => `- ${r.tahun}: ${r.status}${r.ditutup_pada ? ` (ditutup ${r.ditutup_pada.slice(0, 10)})` : ''}${r.catatan ? ` — ${r.catatan}` : ''}`),
    'Tahun yang tidak terdaftar dianggap TERKUNCI.',
  ].join('\n')
}

async function statusRkbmd(sb: SupabaseClient, tahun: number, jenisIn: string): Promise<string> {
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return 'GAGAL: tahun_anggaran tidak valid.'
  const jenis = jenisIn || 'pengadaan'
  if (!(JENIS_RKBMD as readonly string[]).includes(jenis)) return `GAGAL: jenis RKBMD harus salah satu dari ${JENIS_RKBMD.join(', ')}.`

  const { data, error } = await sb.from('rkbmd').select('skpd_id,status,nihil,versi')
    .eq('tahun_anggaran', tahun).eq('jenis', jenis).limit(1000)
  if (error) return `GAGAL membaca RKBMD: ${error.message}`
  const docs = (data || []) as unknown as { skpd_id: number; status: string; nihil: boolean | null; versi: string | null }[]
  if (docs.length >= 1000) return 'GAGAL: dokumen RKBMD melebihi 1.000 baris & mungkin terpotong.'

  const skpd = await muatSkpd(sb)
  const byId = new Map(skpd.map(s => [s.id, s]))
  const akarDari = (id: number): number => {
    let s = byId.get(id)
    for (let i = 0; s && s.parent_id != null && i < 10; i++) s = byId.get(s.parent_id)
    return s ? s.id : id
  }
  const punyaDok = new Set(docs.map(d => akarDari(d.skpd_id)))
  const belum = skpd.filter(s => s.level === 1 && !punyaDok.has(s.id)).map(s => s.nama).sort()

  const perStatus = new Map<string, number>()
  for (const d of docs) {
    const k = d.nihil ? `${d.status} (NIHIL)` : d.status
    perStatus.set(k, (perStatus.get(k) || 0) + 1)
  }
  return [
    `RKBMD ${jenis} TA ${tahun}: ${docs.length} dokumen (semua versi).`,
    ...(docs.length ? [...perStatus.entries()].map(([k, n]) => `- ${k}: ${n}`) : ['- (belum ada dokumen)']),
    `SKPD Pengguna Barang yang BELUM punya dokumen: ${belum.length} dari ${skpd.filter(s => s.level === 1).length}.`,
    ...belum.slice(0, MAKS_BARIS).map(n => `- ${n}`),
    belum.length > MAKS_BARIS ? `(Terpotong di ${MAKS_BARIS} — masih ada ${belum.length - MAKS_BARIS} lainnya.)` : '',
    'Catatan: dokumen milik sub-unit dihitung untuk SKPD induknya.',
  ].filter(Boolean).join('\n')
}
