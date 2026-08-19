// Alat BACA untuk Asisten AI (app/api/ai-chat) — tool-calling Anthropic.
//
// ⚠️⚠️ ATURAN KEAMANAN NOMOR SATU, JANGAN PERNAH DILANGGAR:
// Seluruh fungsi di sini menerima `SupabaseClient` dari pemanggilnya dan WAJIB
// dipanggil dengan client SESI USER (`createClient()` di lib/supabase/server.ts
// — anon key + cookie), BUKAN `createAdminClient()` (service_role).
//
// Sebabnya: satu-satunya yang membatasi jawaban chatbot ke SKPD si penanya
// adalah RLS. Kalimat "hormati kerahasiaan antar-SKPD" di system prompt itu
// IMBAUAN ke model, bukan penjaga — model yang salah menyimpulkan, atau
// pertanyaan yang dirangkai licik, akan menembusnya. Dengan service_role,
// satu pertanyaan bisa membocorkan data SKPD lain ke layar operator yang tak
// berhak, dan tak ada satu pun lapisan lain yang akan menahannya.
//
// SEMUANYA HANYA-BACA. Jangan tambahkan tool yang menulis (insert/update/
// delete/rpc yang mengubah): chatbot ini "penjelas, bukan pelaksana", dan
// eksekusi lewat percakapan bebas mustahil diaudit — siapa yang menyetujui,
// atas dasar kalimat apa. Kalau suatu saat terasa perlu, itu keputusan user
// tersendiri, bukan penambahan diam-diam di berkas ini.
import type { SupabaseClient } from '@supabase/supabase-js'
import { GOLONGAN_REKAP, kodeLevel3, perlakuanKode } from '@/lib/bmd'

/** Batas keras jumlah baris yang boleh dikembalikan ke model. Bukan sekadar
 *  penghemat token: tanpa ini, satu pertanyaan seperti "sebutkan semua barang"
 *  akan menarik ribuan baris register ke dalam percakapan yang lalu tersimpan
 *  permanen di `chat_messages_ai`. */
const MAKS_BARIS = 10

const rp = (n: number | null | undefined) =>
  n == null ? '-' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)

const GOL_URAIAN: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))

/**
 * Skema tool untuk Anthropic Messages API.
 *
 * Deskripsinya sengaja menyebut BATASAN, bukan cuma kegunaan — model memilih
 * tool dari teks ini, dan tool yang deskripsinya menjanjikan lebih dari yang
 * bisa diberikan akan dipanggil untuk pertanyaan yang salah lalu jawabannya
 * dikarang di atas hasil yang tak nyambung.
 */
export const TOOL_DEFS = [
  {
    name: 'rekap_aset',
    description:
      'Rekap jumlah unit & total nilai perolehan aset AKTIF per golongan (1.3.1 Tanah s.d. 1.5.4 Aset Lain-Lain), '
      + 'otomatis terbatas pada lingkup SKPD pengguna yang sedang bertanya. '
      + 'Pakai untuk pertanyaan "berapa jumlah/berapa banyak/total nilai barang". '
      + 'TIDAK memuat angka penyusutan (beban/akumulasi/nilai buku) — untuk itu pakai posisi_penyusutan per barang.',
    input_schema: {
      type: 'object' as const,
      properties: {
        golongan: {
          type: 'string',
          description: 'Opsional. Kode golongan level-3, mis. "1.3.1" untuk Tanah. Kosongkan untuk seluruh golongan.',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'cari_barang',
    description:
      `Cari barang di register berdasarkan nama, NIBAR, atau kode barang. Maksimal ${MAKS_BARIS} hasil, `
      + 'terbatas lingkup SKPD pengguna. Pakai untuk "barang apa saja yang...", atau untuk menemukan NIBAR '
      + 'sebelum memanggil posisi_penyusutan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kata_kunci: { type: 'string', description: 'Nama barang, NIBAR, atau awalan kode barang.' },
        golongan: { type: 'string', description: 'Opsional, kode golongan level-3 mis. "1.3.2".' },
      },
      required: ['kata_kunci'],
    },
  },
  {
    name: 'posisi_penyusutan',
    description:
      'Posisi penyusutan SATU barang pada suatu periode: nilai perolehan, beban semester, akumulasi, '
      + 'nilai buku, sisa semester, masa manfaat. Butuh NIBAR — kalau pengguna menyebut nama barang, '
      + 'cari NIBAR-nya dulu dengan cari_barang.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nibar: { type: 'string', description: 'NIBAR barang (angka panjang).' },
        periode: { type: 'string', description: 'Opsional, format TAHUN-S1 / TAHUN-S2 mis. "2026-S1". Kosongkan untuk periode terbaru yang sudah dihitung.' },
      },
      required: ['nibar'],
    },
  },
  {
    name: 'info_kode_barang',
    description:
      'Data referensi satu kode barang dari master Kodefikasi: uraian resmi, batas kapitalisasi '
      + '(pemisah intra/ekstrakomptabel), dan perlakuan penyusutannya. '
      + 'Pakai kalau ditanya "kode ini barang apa" atau soal batas kapitalisasi.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kode: { type: 'string', description: 'Kode barang lengkap, mis. "1.3.2.10.01.02.001".' },
      },
      required: ['kode'],
    },
  },
  {
    name: 'lingkup_saya',
    description:
      'Peran pengguna yang sedang bertanya & SKPD tempat ia bertugas. Pakai untuk memastikan jawaban '
      + 'menyebut lingkup yang benar ("di SKPD Anda, yaitu ..."), atau saat pengguna bertanya '
      + '"saya bisa lihat data apa saja".',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
]

export type ToolInput = Record<string, unknown>

const teks = (v: unknown) => typeof v === 'string' ? v.trim() : ''

/**
 * Jalankan satu tool. SELALU mengembalikan string yang siap dikirim balik ke
 * model sebagai `tool_result`.
 *
 * ⚠️ Kegagalan dilaporkan sebagai teks berawalan "GAGAL:" — BUKAN dilempar,
 * dan BUKAN dikembalikan sebagai hasil kosong. Hasil kosong akan dibaca model
 * sebagai "memang tidak ada barangnya", dan itu bentuk kegagalan senyap yang
 * paling mahal di aplikasi ini (rules.md §2.4, docs/insiden.md INS-06/INS-08) —
 * bedanya kali ini yang salah paham bukan operator, tapi model yang lalu
 * menyampaikannya dengan yakin. System prompt mewajibkan model meneruskan
 * kegagalan itu apa adanya.
 */
export async function jalankanTool(
  sb: SupabaseClient,
  nama: string,
  input: ToolInput,
): Promise<string> {
  try {
    switch (nama) {
      case 'rekap_aset': return await rekapAset(sb, teks(input.golongan))
      case 'cari_barang': return await cariBarang(sb, teks(input.kata_kunci), teks(input.golongan))
      case 'posisi_penyusutan': return await posisiPenyusutan(sb, teks(input.nibar), teks(input.periode))
      case 'info_kode_barang': return await infoKodeBarang(sb, teks(input.kode))
      case 'lingkup_saya': return await lingkupSaya(sb)
      default: return `GAGAL: tool "${nama}" tidak dikenal.`
    }
  } catch (e) {
    return `GAGAL: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ── rekap_aset ──────────────────────────────────────────────────────────────
// Lewat RPC `fn_dashboard_rekap()` yang SUDAH ADA & sudah dioptimasi, BUKAN
// query `aset` sendiri. Dua alasan, dua-duanya penting:
//   (1) Menghitung sendiri berarti `kode LIKE 'gol.%'` di bawah RLS — pola yang
//       di repo ini sudah EMPAT KALI berujung statement timeout (CLAUDE.md).
//       RPC ini menggantikan scan 418rb baris yang dulu bikin dashboard 504.
//   (2) Ia SECURITY DEFINER dan menghitung cakupan SKPD-nya SENDIRI di dalam
//       fungsi (fn_is_admin / fn_is_viewer / fn_my_skpd_scope dari auth.uid()),
//       jadi hasilnya tetap per-pengguna. ⚠️ Artinya penegak batas di sini
//       adalah ISI FUNGSI ITU, bukan RLS — kalau fungsinya kelak disunting,
//       cakupannya wajib ikut dijaga; RLS tak akan menolong sebagai cadangan.
async function rekapAset(sb: SupabaseClient, golongan: string): Promise<string> {
  const { data, error } = await sb.rpc('fn_dashboard_rekap')
  if (error) return `GAGAL membaca rekap aset: ${error.message}`
  if (!data) return 'GAGAL membaca rekap aset: jawaban kosong dari server.'

  const d = data as { gol?: { golongan: string; count: number; nilai: number }[] }
  let baris = (d.gol || []).map(r => ({
    kode: r.golongan,
    uraian: GOL_URAIAN[r.golongan] || r.golongan,
    n: Number(r.count) || 0,
    nilai: Number(r.nilai) || 0,
  }))
  if (golongan) baris = baris.filter(r => r.kode === golongan)

  if (baris.length === 0) {
    return golongan
      ? `Tidak ada aset aktif bergolongan ${golongan} (${GOL_URAIAN[golongan] || golongan}) di lingkup SKPD pengguna.`
      : 'Tidak ada aset aktif di lingkup SKPD pengguna.'
  }
  const totN = baris.reduce((s, r) => s + r.n, 0)
  const totRp = baris.reduce((s, r) => s + r.nilai, 0)
  return [
    'Rekap aset AKTIF (lingkup SKPD pengguna):',
    ...baris.map(r => `- ${r.kode} ${r.uraian}: ${rp(r.n)} unit, nilai perolehan Rp${rp(r.nilai)}`),
    `TOTAL: ${rp(totN)} unit, Rp${rp(totRp)}`,
  ].join('\n')
}

// ── cari_barang ─────────────────────────────────────────────────────────────
async function cariBarang(sb: SupabaseClient, kata: string, golongan: string): Promise<string> {
  if (!kata) return 'GAGAL: kata kunci pencarian kosong.'
  // Tanda koma/persen sengaja dibuang: keduanya memecah sintaks `or=` PostgREST
  // di tengah jalan & membuat seluruh filter ditolak (pelajaran yang sama sudah
  // didapat di kotak Cari Daftar Barang Awal, CLAUDE.md 2026-07-30).
  const q = kata.replace(/[,%()]/g, ' ').trim()
  if (!q) return 'GAGAL: kata kunci tidak mengandung karakter yang bisa dicari.'

  // Nama SKPD SENGAJA tidak ikut di-join. Daftar Barang pun mengambilnya lewat
  // query terpisah, bukan embed PostgREST — dan hasil pencarian ini toh sudah
  // terbatas pada lingkup si penanya, jadi kolomnya nyaris selalu sama.
  let sel = sb.from('aset')
    .select('nibar,kode,nama_barang,uraian_barang,merek_tipe,nilai_perolehan,tgl_perolehan,intra_ekstra,kondisi_barang')
    .eq('status', 'aktif')
    .or(`nama_barang.ilike.%${q}%,nibar.ilike.%${q}%,kode.ilike.${q}%`)
    .limit(MAKS_BARIS)
  if (golongan) sel = sel.like('kode', `${golongan}.%`)

  const { data, error } = await sel
  if (error) return `GAGAL mencari barang: ${error.message}`
  const rows = (data || []) as unknown as {
    nibar: string | null; kode: string; nama_barang: string | null; uraian_barang: string | null
    merek_tipe: string | null; nilai_perolehan: number; tgl_perolehan: string | null
    intra_ekstra: string | null; kondisi_barang: string | null
  }[]
  if (rows.length === 0) return `Tidak ada barang aktif yang cocok dengan "${kata}" di lingkup SKPD pengguna.`

  return [
    `Hasil pencarian "${kata}" (maksimal ${MAKS_BARIS} baris, lingkup SKPD pengguna):`,
    ...rows.map(r => [
      `- ${r.nama_barang || r.uraian_barang || '(tanpa nama)'}`,
      `NIBAR ${r.nibar || '-'}`,
      `kode ${r.kode}`,
      r.merek_tipe ? `merek ${r.merek_tipe}` : null,
      `nilai Rp${rp(r.nilai_perolehan)}`,
      r.tgl_perolehan ? `perolehan ${r.tgl_perolehan}` : null,
      r.intra_ekstra ? `${r.intra_ekstra}komptabel` : null,
      r.kondisi_barang ? `kondisi ${r.kondisi_barang}` : null,
    ].filter(Boolean).join(' · ')),
    rows.length === MAKS_BARIS
      ? `(Terpotong di ${MAKS_BARIS} baris — masih mungkin ada yang lain. Untuk daftar lengkap, arahkan pengguna ke menu Daftar Barang.)`
      : '',
  ].filter(Boolean).join('\n')
}

// ── posisi_penyusutan ───────────────────────────────────────────────────────
async function posisiPenyusutan(sb: SupabaseClient, nibar: string, periode: string): Promise<string> {
  if (!nibar) return 'GAGAL: NIBAR kosong.'
  const { data: aset, error: eAset } = await sb.from('aset')
    .select('id,nibar,kode,nama_barang,nilai_perolehan,tgl_perolehan,intra_ekstra,status')
    .eq('nibar', nibar).limit(1)
  if (eAset) return `GAGAL membaca barang: ${eAset.message}`
  const a = (aset || [])[0] as {
    id: string; nibar: string; kode: string; nama_barang: string | null
    nilai_perolehan: number; tgl_perolehan: string | null; intra_ekstra: string | null; status: string
  } | undefined
  if (!a) return `Barang dengan NIBAR ${nibar} tidak ditemukan di lingkup SKPD pengguna (mungkin milik SKPD lain, atau NIBAR-nya keliru).`

  let pq = sb.from('penyusutan_semester')
    .select('periode,nilai_perolehan,beban,akumulasi,nilai_buku_akhir,sisa_semester,masa_manfaat_tahun')
    .eq('aset_id', a.id)
  pq = periode ? pq.eq('periode', periode) : pq.order('periode', { ascending: false })
  const { data: peny, error: ePeny } = await pq.limit(1)
  if (ePeny) return `GAGAL membaca hasil penyusutan: ${ePeny.message}`
  const p = (peny || [])[0] as {
    periode: string; nilai_perolehan: number; beban: number; akumulasi: number
    nilai_buku_akhir: number; sisa_semester: number | null; masa_manfaat_tahun: number | null
  } | undefined

  const kepala = `${a.nama_barang || '(tanpa nama)'} · NIBAR ${a.nibar} · kode ${a.kode}`
    + `${a.status !== 'aktif' ? ` · STATUS: ${a.status}` : ''}`

  if (!p) {
    // Dibedakan tegas dari "nilainya nol". Golongan tak-disusutkan (Tanah, ATL,
    // KDP) memang TIDAK pernah punya baris engine — kalau ini dijawab "akumulasi
    // 0" model akan terdengar seperti melaporkan hasil hitungan, padahal tak ada
    // hitungan sama sekali.
    const perlakuan = perlakuanKode(a.kode)
    const golLabel = GOL_URAIAN[kodeLevel3(a.kode)] || kodeLevel3(a.kode)
    return perlakuan === 'tidak'
      ? `${kepala}\nGolongan ${golLabel} TIDAK disusutkan, jadi tidak ada baris perhitungan penyusutan. `
        + `Nilai perolehan Rp${rp(a.nilai_perolehan)}; nilai bukunya sama dengan nilai perolehan.`
      : `${kepala}\nBelum ada hasil perhitungan penyusutan${periode ? ` untuk periode ${periode}` : ''}. `
        + `Kemungkinan engine penyusutan belum dijalankan untuk periode itu. Nilai perolehan Rp${rp(a.nilai_perolehan)}.`
  }

  return [
    kepala,
    `Periode ${p.periode}${a.intra_ekstra ? ` · ${a.intra_ekstra}komptabel` : ''}`,
    `- Nilai perolehan: Rp${rp(p.nilai_perolehan)}`,
    `- Beban penyusutan semester ini: Rp${rp(p.beban)}`,
    `- Akumulasi penyusutan: Rp${rp(p.akumulasi)}`,
    `- Nilai buku akhir: Rp${rp(p.nilai_buku_akhir)}`,
    p.masa_manfaat_tahun != null ? `- Masa manfaat: ${p.masa_manfaat_tahun} tahun (${p.masa_manfaat_tahun * 2} semester)` : '',
    p.sisa_semester != null ? `- Sisa masa manfaat: ${p.sisa_semester} semester` : '',
  ].filter(Boolean).join('\n')
}

// ── info_kode_barang ────────────────────────────────────────────────────────
async function infoKodeBarang(sb: SupabaseClient, kode: string): Promise<string> {
  if (!kode) return 'GAGAL: kode barang kosong.'
  const { data, error } = await sb.from('admin_kodefikasi_bmd')
    .select('kode,uraian,batas_kapitalisasi').eq('kode', kode).limit(1)
  if (error) return `GAGAL membaca kodefikasi: ${error.message}`
  const r = (data || [])[0] as { kode: string; uraian: string | null; batas_kapitalisasi: number | null } | undefined
  if (!r) return `Kode "${kode}" tidak ditemukan di master Kodefikasi.`

  const gol = kodeLevel3(r.kode)
  const perlakuan = perlakuanKode(r.kode)
  const labelPerlakuan = perlakuan === 'penyusutan' ? 'disusutkan'
    : perlakuan === 'amortisasi' ? 'diamortisasi'
    : perlakuan === 'lain_lain' ? 'Aset Lain-Lain (beku selama masih di golongan ini)'
    : 'TIDAK disusutkan'
  return [
    `Kode ${r.kode} — ${r.uraian || '(uraian kosong)'}`,
    `Golongan ${gol} ${GOL_URAIAN[gol] || ''} · ${labelPerlakuan}`,
    r.batas_kapitalisasi != null
      ? `Batas kapitalisasi: Rp${rp(r.batas_kapitalisasi)} (nilai per item >= batas → intrakomptabel, di bawahnya → ekstrakomptabel)`
      : 'Batas kapitalisasi belum diisi di master — barang baru dengan kode ini diklasifikasi intrakomptabel secara bawaan.',
    // Masa manfaat SENGAJA tidak dijawab dari sini: yang dipakai engine adalah
    // angka yang menempel pada hasil perhitungan tiap barang, bukan satu angka
    // master yang bisa berbeda. Untuk itu ada posisi_penyusutan.
    'Masa manfaat per barang ada di hasil perhitungan penyusutan barang itu (pakai posisi_penyusutan), bukan di sini.',
  ].join('\n')
}

// ── lingkup_saya ────────────────────────────────────────────────────────────
async function lingkupSaya(sb: SupabaseClient): Promise<string> {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return 'GAGAL: sesi pengguna tidak terbaca.'
  const { data, error } = await sb.from('admin_profiles')
    .select('role,skpd_id,skpd:admin_skpd(nama),pegawai:admin_pegawai(nama)')
    .eq('id', user.id).limit(1)
  if (error) return `GAGAL membaca profil pengguna: ${error.message}`
  // `as unknown as` — bukan `as` biasa. supabase-js menyimpulkan embed
  // `admin_skpd(nama)` sebagai ARRAY (`{nama}[]`) padahal relasinya satu-ke-satu,
  // jadi cast langsung ditolak "neither type sufficiently overlaps". Pola yang
  // sama sudah dipakai di beberapa berkas lain (CLAUDE.md, catatan typecheck).
  const p = (data || [])[0] as unknown as {
    role: string | null; skpd_id: number | null
    skpd: { nama: string } | null; pegawai: { nama: string } | null
  } | undefined
  if (!p) return 'GAGAL: profil pengguna tidak ditemukan.'

  const lingkup = p.role === 'admin'
    ? 'seluruh SKPD se-kabupaten'
    : p.skpd?.nama
      ? `SKPD ${p.skpd.nama} beserta unit-unit di bawahnya`
      : 'belum ditetapkan SKPD-nya'
  return [
    `Pengguna: ${p.pegawai?.nama || user.email || '-'}`,
    `Peran: ${p.role || '-'}`,
    `Lingkup data yang boleh dilihat: ${lingkup}.`,
  ].join('\n')
}
