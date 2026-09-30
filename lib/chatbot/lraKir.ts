// Alat baca LRA & KIR untuk pengguna istimewa Asisten AI (lib/chatbot/istimewa.ts).
//
// Angkanya harus SAMA dgn menu Pelaporan → LRA dan Pelaporan → KIR, jadi:
//   - baris LRA & entry aplikasi ditarik `fetchLraData` (lib/lraData.ts) —
//     pemuat yang sama dgn halaman LRA;
//   - matriks, Check, & persilangan dihitung fungsi lib/lra.ts yang sama
//     (`rekapModal`, `rekapKapitalisasi`, `rekapReklas`, `rekapApp`,
//     `selisihMatrix`, `silangRekBarang`, `leafLra`);
//   - kartu ruangan ditarik `muatKartuKir` (lib/kirData.ts) — pemuat Laporan KIR.
// Tak ada rumus kedua di sini; berkas ini hanya menyusun kalimatnya.
//
// HANYA-BACA, client SESI USER (cakupan datang dari RLS + peran admin akun itu).
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatRupiah2 } from '@/lib/export'
import {
  JENIS_BM, BULAN_SINGKAT, GOL_URAIAN, TANPA_REK, TANPA_GOL,
  rekapModal, rekapKapitalisasi, rekapReklas, rekapApp, selisihMatrix, silangRekBarang, statusSilang, leafLra,
  type LraRow,
} from '@/lib/lra'
import { fetchLraData, LRA_COLS } from '@/lib/lraData'
import { muatKartuKir } from '@/lib/kirData'
import { tahunPerolehan } from '@/lib/kir'
import { lingkupDari, indukSkpd } from './skpdPohon'

const MAKS_BARIS = 30
const rp = (n: number | null | undefined) => formatRupiah2(n)
const fmtN = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
const teks = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const KELOMPOK_LRA = ['modal', 'barjas', 'semua'] as const

export const TOOL_DEFS_LRA_KIR = [
  {
    name: 'rekap_lra',
    description:
      'Rekap LRA BELANJA MODAL satu tahun (menu Pelaporan → LRA): per jenis belanja (5.2.01 Tanah s.d. 5.2.05 Aset Tetap Lainnya) — '
      + 'realisasi LRA hasil import, + kapitalisasi (belanja barang/jasa yang ditandai), − reklasifikasi keluar, dibandingkan dgn '
      + 'ENTRY APLIKASI (pengadaan yang sudah dicatat), berikut SELISIH-nya (Check). Selisih positif = realisasi LRA belum seluruhnya dientri. '
      + 'Ikut dilaporkan: persilangan rekening × kode barang (belanja dari rekening A tapi barangnya golongan B). '
      + 'Opsional: per_bulan (realisasi vs entry tiap bulan), per_skpd (SKPD mana selisihnya terbesar). '
      + 'Pakai untuk "berapa realisasi belanja modal 2026", "SKPD mana yang belum entry belanja modalnya", "ada selisih LRA?". '
      + 'Belanja barang & jasa (5.1) yang TIDAK ditandai bukan bagian rekap ini — cari lewat daftar_lra.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tahun: { type: 'number', description: 'Tahun anggaran, mis. 2026. Kosong = tahun berjalan.' },
        skpd_id: { type: 'number', description: 'Opsional. Satu SKPD beserta unit di bawahnya (ambil dari cari_skpd).' },
        per_skpd: { type: 'boolean', description: 'Opsional. true = rincikan per SKPD (se-kabupaten: SKPD induk; dengan skpd_id: per unit), urut selisih terbesar.' },
        per_bulan: { type: 'boolean', description: 'Opsional. true = total LRA vs entry aplikasi per bulan.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'daftar_lra',
    description:
      'Cari TRANSAKSI realisasi LRA (hasil import, maks 30 terbaru): tanggal, nomor bukti, kode rekening, uraian, keterangan, nilai, '
      + 'SKPD, dan tandanya (kapitalisasi / reklas keluar). Bawaan hanya belanja modal (5.2); kelompok "barjas" = belanja barang & jasa (5.1), '
      + '"semua" = keduanya. Bisa disaring kata_kunci (uraian/keterangan/nomor bukti/awalan kode rekening), jenis (mis. "5.2.02"), '
      + 'bulan, atau ditandai. Pakai untuk "belanja modal apa saja di Dinas X", "cari SP2D nomor …", "transaksi LRA yang ditandai kapitalisasi".',
    input_schema: {
      type: 'object' as const,
      properties: {
        tahun: { type: 'number', description: 'Tahun anggaran. Kosong = tahun berjalan.' },
        skpd_id: { type: 'number', description: 'Opsional. Satu SKPD beserta unit di bawahnya.' },
        kelompok: { type: 'string', description: `Opsional: ${KELOMPOK_LRA.join(', ')}. Bawaan "modal".` },
        jenis: { type: 'string', description: 'Opsional. Tiga segmen kode rekening, mis. "5.2.02".' },
        bulan: { type: 'number', description: 'Opsional, 1–12.' },
        ditandai: { type: 'boolean', description: 'Opsional. true = hanya yang ditandai kapitalisasi / reklas keluar.' },
        kata_kunci: { type: 'string', description: 'Opsional. Dicari di uraian, keterangan, nomor bukti, dan awalan kode rekening.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'rekap_kir',
    description:
      'KIR (Kartu Inventaris Ruangan) — POSISI TERKINI penempatan barang di ruangan: daftar ruangan per SKPD, penanggung jawabnya, '
      + 'jumlah & nilai barang di tiap ruangan, dan isi ruangannya. kata_kunci mencari di nama ruangan, penanggung jawab, SKPD, DAN barang '
      + '(nama, NIBAR, kode, merek) — jadi bisa menjawab "barang X ada di ruangan mana" maupun "ruangan Y isinya apa". '
      + 'KIR tidak ber-periode & hanya memuat barang yang SUDAH ditempatkan operator ke ruangan (bukan seluruh barang SKPD).',
    input_schema: {
      type: 'object' as const,
      properties: {
        skpd_id: { type: 'number', description: 'Opsional. Satu SKPD beserta unit di bawahnya.' },
        kata_kunci: { type: 'string', description: 'Opsional. Nama ruangan, penanggung jawab, atau barang (nama/NIBAR/kode/merek).' },
      },
      required: [] as string[],
    },
  },
]

export const NAMA_TOOL_LRA_KIR = new Set(TOOL_DEFS_LRA_KIR.map(t => t.name))

export async function jalankanLraKir(
  sb: SupabaseClient, nama: string, input: Record<string, unknown>, hariIni: string,
): Promise<string> {
  if (nama === 'rekap_kir') return rekapKir(sb, input.skpd_id, teks(input.kata_kunci))
  const tahun = input.tahun == null || input.tahun === '' ? Number(hariIni.slice(0, 4)) : Number(input.tahun)
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return 'GAGAL: tahun tidak valid (mis. 2026).'
  if (nama === 'rekap_lra') return rekapLra(sb, tahun, input.skpd_id, input.per_skpd === true, input.per_bulan === true)
  if (nama === 'daftar_lra') return daftarLra(sb, tahun, input)
  return `GAGAL: alat "${nama}" tidak dikenal.`
}

// ── rekap_lra ───────────────────────────────────────────────────────────────
const ketSelisih = (d: number) => Math.abs(d) < 0.5 ? 'cocok' : d > 0 ? 'LRA lebih besar — belum seluruhnya dientri' : 'entry aplikasi lebih besar dari LRA'

async function rekapLra(sb: SupabaseClient, tahun: number, skpdId: unknown, perSkpd: boolean, perBulan: boolean): Promise<string> {
  const l = await lingkupDari(sb, skpdId)
  if ('galat' in l) return l.galat
  // Cakupan 'rekap': hanya belanja modal + baris yang ditandai — setara untuk
  // seluruh fungsi rekap di bawah (lihat lib/lraData.ts), ±330 baris, bukan 32 rb.
  const dataLra = await fetchLraData(sb, String(tahun), l.desc, 'rekap')
  const lra = dataLra.lra, appRows = dataLra.appRows
  if (lra.length === 0 && appRows.length === 0) {
    return `Tidak ada data LRA maupun entry pengadaan tahun ${tahun} di ${l.label}. (LRA diisi lewat Import di menu Pelaporan → LRA.)`
  }
  const mLra = rekapModal(lra), mKap = rekapKapitalisasi(lra), mRek = rekapReklas(lra), mApp = rekapApp(appRows)
  const sel = selisihMatrix(mLra, mKap, mRek, mApp)
  const nModal = lra.filter(r => r.kelompok === 'modal').length
  const nKap = lra.filter(r => r.klasifikasi === 'kapitalisasi').length
  const nRek = lra.filter(r => r.klasifikasi === 'reklas_keluar').length

  const keluar = [
    `LRA Belanja Modal tahun ${tahun} · ${l.label} (sumber sama dgn menu Pelaporan → LRA):`,
    ...JENIS_BM.map(j => {
      const g = j.grup
      return `- ${g} ${j.uraian}: LRA Rp${rp(mLra.totalJenis[g])} · +kapitalisasi Rp${rp(mKap.totalJenis[g])} · −reklas Rp${rp(mRek.totalJenis[g])}`
        + ` · entry aplikasi Rp${rp(mApp.totalJenis[g])} · selisih Rp${rp(sel.perJenis[g])} (${ketSelisih(sel.perJenis[g])})`
    }),
    `TOTAL: LRA Rp${rp(mLra.totalKeseluruhan)} · +kapitalisasi Rp${rp(mKap.totalKeseluruhan)} · −reklas Rp${rp(mRek.totalKeseluruhan)}`
      + ` · entry aplikasi Rp${rp(mApp.totalKeseluruhan)} · selisih Rp${rp(sel.total)} (${ketSelisih(sel.total)})`,
    `Jumlah baris: ${fmtN(nModal)} transaksi belanja modal · ${fmtN(nKap)} ditandai kapitalisasi · ${fmtN(nRek)} ditandai reklas keluar.`,
  ]
  // Yang jatuh di luar lima jenis TIDAK boleh hilang diam-diam.
  if (Math.abs(mLra.luarJenis) > 0.5) keluar.push(`Di luar 5.2.01–05 (LRA): Rp${rp(mLra.luarJenis)} — tidak masuk tabel di atas.`)
  if (Math.abs(mApp.luarJenis) > 0.5) keluar.push(`Entry aplikasi ber-rekening di luar 5.2.01–05 (mis. 5.1 atau tanpa rekening): Rp${rp(mApp.luarJenis)} — tidak masuk tabel di atas.`)

  // Persilangan rekening × kode barang.
  // Seluruh baris tanpa golongan = migrasi 20260909_01 belum jalan → "tak bisa
  // dinilai", BUKAN "tak ada persilangan".
  if (appRows.length > 0 && appRows.every(r => r.golongan == null)) {
    keluar.push('Persilangan rekening × kode barang: tidak bisa dinilai (kolom golongan tak tersedia).')
  } else {
    const s = silangRekBarang(appRows)
    const selSilang: string[] = []
    for (const b of s.baris) for (const k of s.kolom) {
      const v = s.sel[b]?.[k] ?? 0
      if (v !== 0 && statusSilang(b === TANPA_REK ? null : b, k === TANPA_GOL ? null : k) === false) {
        selSilang.push(`   - rekening ${b} → barang ${k} ${GOL_URAIAN[k] || ''}: Rp${rp(v)}`)
      }
    }
    keluar.push(s.nSelSilang === 0
      ? 'Persilangan rekening × kode barang: tidak ada (semua entry berekening sepadan dgn golongan barangnya).'
      : `Persilangan rekening × kode barang: Rp${rp(s.nilaiSilang)} di ${s.nSelSilang} kombinasi —`, ...selSilang)
  }

  if (perBulan) {
    keluar.push('Per bulan (LRA belanja modal vs entry aplikasi):',
      ...BULAN_SINGKAT.map((b, i) => ({ b, a: mLra.totalBulan[i], c: mApp.totalBulan[i] }))
        .filter(x => Math.abs(x.a) > 0.5 || Math.abs(x.c) > 0.5)
        .map(x => `- ${x.b}: LRA Rp${rp(x.a)} · entry Rp${rp(x.c)}`))
  }

  if (perSkpd) {
    const leaf = leafLra(lra, appRows)
    const nama = new Map(l.semua.map(s => [s.id, s.nama]))
    const per = new Map<number, { lra: number; kap: number; rek: number; app: number }>()
    for (const [id, c] of leaf) {
      const k = l.skpdId != null ? id : indukSkpd(l.semua, id)
      const x = per.get(k) || { lra: 0, kap: 0, rek: 0, app: 0 }
      x.lra += c.totalLra; x.kap += c.kapitalisasi; x.rek += c.reklas; x.app += c.belanjaModal
      per.set(k, x)
    }
    const urut = [...per.entries()].map(([id, x]) => ({ id, ...x, d: x.lra + x.kap - x.rek - x.app }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    keluar.push(
      `Per ${l.skpdId != null ? 'unit' : 'SKPD induk'} (${urut.length} SKPD, urut selisih terbesar; ${urut.filter(x => Math.abs(x.d) < 0.5).length} sudah cocok):`,
      ...urut.slice(0, MAKS_BARIS).map(x => `- ${nama.get(x.id) || `SKPD ${x.id}`}: LRA Rp${rp(x.lra)} · +kap Rp${rp(x.kap)} · −reklas Rp${rp(x.rek)} · entry Rp${rp(x.app)} · selisih Rp${rp(x.d)}`),
      urut.length > MAKS_BARIS ? `(Terpotong di ${MAKS_BARIS} — masih ada ${urut.length - MAKS_BARIS} lainnya.)` : '',
    )
    // Entry aplikasi per SKPD memakai SELURUH nilainya (termasuk yang rekeningnya
    // di luar 5.2.01–05), jadi total per-SKPD bisa beda dari tabel per jenis.
    if (Math.abs(mApp.luarJenis) > 0.5) keluar.push('Catatan: kolom entry per SKPD memuat seluruh entry (termasuk yang rekeningnya di luar 5.2.01–05), jadi jumlahnya bisa lebih besar dari tabel per jenis.')
  }
  keluar.push('Catatan: selisih = LRA + kapitalisasi − reklas − entry aplikasi. Entry aplikasi dikelompokkan menurut KODE REKENING pengadaannya. Termasuk termin konstruksi (KDP).')
  return keluar.filter(Boolean).join('\n')
}

// ── daftar_lra ──────────────────────────────────────────────────────────────
async function daftarLra(sb: SupabaseClient, tahun: number, input: Record<string, unknown>): Promise<string> {
  const kelompok = teks(input.kelompok) || 'modal'
  if (!(KELOMPOK_LRA as readonly string[]).includes(kelompok)) return `GAGAL: kelompok harus salah satu dari ${KELOMPOK_LRA.join(', ')}.`
  const jenis = teks(input.jenis)
  if (jenis && !/^\d\.\d\.\d{2}$/.test(jenis)) return 'GAGAL: jenis harus tiga segmen kode rekening, mis. 5.2.02.'
  const bulan = input.bulan == null || input.bulan === '' ? null : Number(input.bulan)
  if (bulan !== null && (!Number.isInteger(bulan) || bulan < 1 || bulan > 12)) return 'GAGAL: bulan harus 1–12.'
  // Koma/kurung/persen/bintang dibuang: memecah sintaks `or=` PostgREST.
  const q = teks(input.kata_kunci).replace(/[,%()*\\]/g, ' ').trim()

  const l = await lingkupDari(sb, input.skpd_id)
  if ('galat' in l) return l.galat

  let sel = sb.from('lra_realisasi').select(LRA_COLS, { count: 'exact' }).eq('tahun', tahun)
  if (l.desc) sel = sel.in('skpd_id', l.desc)
  if (kelompok !== 'semua') sel = sel.eq('kelompok', kelompok)
  if (jenis) sel = sel.eq('kode_grup3', jenis)
  if (bulan !== null) sel = sel.eq('bulan', bulan)
  if (input.ditandai === true) sel = sel.not('klasifikasi', 'is', null)
  if (q) sel = sel.or(`uraian.ilike.%${q}%,keterangan.ilike.%${q}%,no_bukti.ilike.%${q}%,kode_rekening.ilike.${q}%`)
  const { data, error, count } = await sel.order('id', { ascending: false }).limit(MAKS_BARIS)
  if (error) return `GAGAL membaca transaksi LRA: ${error.message}`
  const rows = (data || []) as unknown as LraRow[]

  const saring = [
    kelompok === 'modal' ? 'belanja modal (5.2)' : kelompok === 'barjas' ? 'belanja barang & jasa (5.1)' : 'semua kelompok',
    jenis ? `jenis ${jenis}` : '', bulan !== null ? `bulan ${BULAN_SINGKAT[bulan - 1]}` : '',
    input.ditandai === true ? 'yang ditandai' : '', q ? `cari "${q}"` : '',
  ].filter(Boolean).join(' · ')
  const judul = `Transaksi LRA ${tahun} · ${l.label} · ${saring}`
  if (rows.length === 0) return `${judul}: tidak ada.`
  const nama = new Map(l.semua.map(s => [s.id, s.nama]))
  const label: Record<string, string> = { kapitalisasi: 'DITANDAI kapitalisasi', reklas_keluar: 'DITANDAI reklas keluar' }
  return [
    `${judul}: ${count != null ? fmtN(count) : '≥' + rows.length} transaksi${(count ?? 0) > rows.length ? `, ditampilkan ${rows.length} terbaru` : ''}.`,
    ...rows.map(r => [
      `- ${r.tanggal} · bukti ${r.no_bukti || '-'}`,
      `${r.kode_rekening} ${r.uraian || ''}`.trim(),
      `Rp${rp(r.debit)}`,
      `SKPD ${nama.get(r.skpd_id) || r.skpd_id}`,
      r.keterangan ? `ket: ${r.keterangan}` : '',
      r.klasifikasi ? `${label[r.klasifikasi] || r.klasifikasi}${r.jenis_tujuan ? ` → ${r.jenis_tujuan}` : ''}` : '',
    ].filter(Boolean).join(' · ')),
    (count ?? 0) > rows.length ? '(Untuk jumlah & total nilainya pakai rekap_lra; persempit dengan kata_kunci / jenis / bulan / skpd_id.)' : '',
  ].filter(Boolean).join('\n')
}

// ── rekap_kir ───────────────────────────────────────────────────────────────
async function rekapKir(sb: SupabaseClient, skpdId: unknown, kata: string): Promise<string> {
  const l = await lingkupDari(sb, skpdId)
  if ('galat' in l) return l.galat
  const kartu = await muatKartuKir(sb, l.desc)
  if (kartu.length === 0) return `Belum ada ruangan KIR tercatat di ${l.label}. (Ruangan dibuat di menu Pembukuan → KIR.)`

  const q = kata.toLowerCase()
  const cocokRuang = (r: typeof kartu[number]) =>
    [r.nama, r.kode_ruangan, r.skpdNama, r.pj_nama, r.pj_nip].join(' ').toLowerCase().includes(q)
  const cocokBarang = (b: typeof kartu[number]['isi'][number]) =>
    [b.nama_barang, b.uraian_barang, b.nibar, b.kode, b.merek_tipe].join(' ').toLowerCase().includes(q)
  // Ruangan yang namanya cocok tampil UTUH; ruangan lain hanya barang yang cocok.
  const tampil = kartu.map(r => ({ r, isi: !q || cocokRuang(r) ? r.isi : r.isi.filter(cocokBarang) }))
    .filter(x => !q || cocokRuang(x.r) || x.isi.length > 0)

  const totBarang = kartu.reduce((n, r) => n + r.isi.length, 0)
  const totNilai = kartu.reduce((n, r) => n + r.isi.reduce((m, b) => m + (Number(b.nilai_perolehan) || 0), 0), 0)
  const kepala = `KIR (posisi terkini) · ${l.label}: ${fmtN(kartu.length)} ruangan · ${fmtN(totBarang)} barang ditempatkan · Rp${rp(totNilai)}`
  if (tampil.length === 0) return `${kepala}\nTidak ada ruangan maupun barang yang cocok dengan "${kata}".`

  const keluar = [q ? `${kepala}\nCocok dengan "${kata}": ${fmtN(tampil.length)} ruangan.` : kepala]
  let sisaBarang = MAKS_BARIS
  for (const { r, isi } of tampil.slice(0, MAKS_BARIS)) {
    const nilai = r.isi.reduce((m, b) => m + (Number(b.nilai_perolehan) || 0), 0)
    keluar.push(`■ ${r.nama}${r.kode_ruangan ? ` (${r.kode_ruangan})` : ''} · ${r.skpdNama} · PJ: ${r.pj_nama || 'belum ditetapkan'}${r.pj_nip ? ` (NIP ${r.pj_nip})` : ''}`
      + ` · ${fmtN(r.isi.length)} barang · Rp${rp(nilai)}`)
    for (const b of isi) {
      if (sisaBarang-- <= 0) break
      keluar.push(`   - ${b.nama_barang || b.uraian_barang || '-'} · NIBAR ${b.nibar || '-'} · kode ${b.kode}`
        + `${b.merek_tipe ? ` · merek ${b.merek_tipe}` : ''} · tahun ${tahunPerolehan(b.tgl_perolehan)} · Rp${rp(b.nilai_perolehan)}`)
    }
  }
  const nBarangTampil = tampil.reduce((n, x) => n + x.isi.length, 0)
  if (tampil.length > MAKS_BARIS) keluar.push(`(Ruangan terpotong di ${MAKS_BARIS} dari ${fmtN(tampil.length)}.)`)
  if (nBarangTampil > MAKS_BARIS) keluar.push(`(Rincian barang terpotong di ${MAKS_BARIS} dari ${fmtN(nBarangTampil)} — persempit dengan kata_kunci atau skpd_id.)`)
  keluar.push('Catatan: KIR hanya memuat barang yang SUDAH ditempatkan ke ruangan; barang SKPD yang belum ditempatkan tidak muncul di sini.')
  return keluar.join('\n')
}
