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
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import { rekapPerGolongan, zeroRekap, type RekapRpcRow } from '@/lib/rekapBmd'

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

type SkpdRow = { id: number; nama: string; parent_id: number | null; level: number }

/** Seluruh pohon SKPD (816 baris; PostgREST memotong di 1.000, jadi kalau
 *  hasilnya menyentuh angka itu KITA MENOLAK — pohon terpotong akan diam-diam
 *  menghitung sub-unit yang hilang sebagai "tak ada"). */
async function muatSkpd(sb: SupabaseClient): Promise<SkpdRow[]> {
  const { data, error } = await sb.from('admin_skpd').select('id,nama,parent_id,level').order('id').limit(1000)
  if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
  const rows = (data || []) as unknown as SkpdRow[]
  if (rows.length >= 1000) throw new Error('daftar SKPD melebihi 1.000 baris & mungkin terpotong — alat ini perlu diperbarui.')
  return rows
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
    // Sub-unit ikut: rekap SKPD induk = dirinya + seluruh turunannya (sama dgn
    // descendantIds yang dipakai halaman Laporan BMD).
    const anak = new Map<number, number[]>()
    for (const s of semua) if (s.parent_id != null) anak.set(s.parent_id, [...(anak.get(s.parent_id) || []), s.id])
    ids = []
    const antre = [akar]
    while (antre.length) {
      const id = antre.pop() as number
      ids.push(id)
      antre.push(...(anak.get(id) || []))
    }
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
