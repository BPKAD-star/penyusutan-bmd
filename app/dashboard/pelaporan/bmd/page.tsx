'use client'
// Laporan BMD — gabungan dari menu "Rekapitulasi" lama (/dashboard/saldo-akhir/
// rekapitulasi, dipindahkan ke sini 2026-07-10 supaya nggak ada 2 menu yang
// isinya tumpang tindih). Harga perolehan dari tabel `aset` LIVE (baseline +
// perolehan baru, period-aware) + akumulasi/beban/nilai buku dari hasil engine
// (penyusutan_semester) pada periode terpilih. Model 1: per golongan. Model 2:
// matriks per SKPD × per jenis. Model 3: mutasi saldo awal/akhir.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/export'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import KomptabelRadio from '@/components/KomptabelRadio'
import RekapTable, { type RekapRow } from '@/components/RekapTable'
import RekapMatrixTable, { METRIC_LABEL, type MatrixRow, type MatrixCell, type MetricOrAll, type Metric } from '@/components/RekapMatrixTable'
import RekapMutasiTable, { type MutasiRow, type MutasiDetail, type MutasiDetailLine } from '@/components/RekapMutasiTable'
import RekapModelControls from '@/components/RekapModelControls'
import { useSkpdTree } from '@/components/useSkpdTree'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'
import { fetchVoidedAsetIds, fetchBatalTargets, BATAL_TARGET_JENIS, fetchPemecahanBatal, kunciPemecahan } from '@/lib/voidedAset'
import { fetchReklasEvents, kodePada, JENIS_REKLAS_KODE } from '@/lib/reklasKode'
import { rekapPerGolongan, nilaiBukuSel, zeroRekap, type RekapRpcRow } from '@/lib/rekapBmd'
import { assertOk } from '@/shared/db/query'

// ── Model 3: jenis ledger per kategori Penambahan/Pengurangan (nilai
// perolehan) — diverifikasi ke kode asli tiap alur (Pengadaan/PerolehanManual/
// Penghapusan/Reklasifikasi), lihat plan. `mutasi_internal` sengaja tidak
// diikutkan (tidak diminta user, netral kalau scope "Semua" spt pengalihan_status).
// batal_pengadaan/batal_hibah_masuk/dst & koreksi_pencatatan_ganda SENGAJA
// TIDAK dihitung sebagai Pengurangan (keputusan user 2026-07-10) — itu koreksi
// "barang dianggap tidak pernah ada" (salah input/duplikat), bukan pengurangan
// riil dari register yang sebelumnya benar. Saldo Awal/Akhir tetap akurat krn
// keduanya dihitung langsung dari snapshot `aset` LIVE (status='aktif'), tidak
// bergantung pada breakdown Penambahan/Pengurangan ini.
//
// Konsekuensinya: baris Cara Perolehan (Penambahan) yang belakangan di-batal/
// koreksi HARUS ikut disaring juga dari Penambahan (bukan cuma tidak dihitung
// sbg Pengurangan) — kalau tidak, barang yang sudah "dianggap tidak pernah
// ada" tetap nongol sbg Penambahan padahal sudah hilang dari Daftar Barang.
// Daftar jenis void-nya (dulu konstanta VOID_JENIS lokal di file ini) kini ada
// di lib/voidedAset.ts — dipakai bersama Rekonsiliasi & Laporan Perolehan supaya
// tidak drift. Sifatnya sama: kumpulkan aset_id yang PERNAH kena event ini
// (across ALL periode — batal_* selalu dicatat mundur ke tgl asli, jadi
// retroaktif menghapus dari SEMUA periode, bukan cuma periode saat diklik).
const JENIS_CARA_PEROLEHAN = ['pengadaan', 'hibah_masuk', 'tukar_menukar', 'hasil_inventarisasi', 'perolehan_lainnya']
// Termin kontrak konstruksi → menaikkan nilai aset KDP (1.3.6). WAJIB ikut
// Penambahan: Saldo Awal/Akhir (fn_rekap_bmd) SUDAH mencakup golongan 1.3.6,
// sedangkan Model 3 tak punya baris penyeimbang — tanpa ini baris KDP tidak
// foot (Awal + Tambah − Kurang ≠ Akhir) sebesar nilai termin periode itu.
const JENIS_KDP_M3 = ['akumulasi_kdp']
const JENIS_PENGHAPUSAN_M3 = ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain']
// Pemecahan Barang — WAJIB ikut sejak fn_rekap_bmd jadi period-correct
// (20260805_02). Sebelumnya induk yang sudah dipecah berstatus 'dihapus' dan
// karenanya hilang dari Saldo Awal MAUPUN Saldo Akhir, jadi pemecahan tak
// kelihatan sama sekali dan Model 3 "foot" secara kebetulan. Sekarang Saldo
// Awal memuatnya kembali (benar), jadi tanpa baris ini rekonsiliasinya meleset
// tepat sebesar nilai induk yang pecahannya pindah kolom komptabel — kasus
// nyata: Rehab Garasi Grogol Rp167.324.933, induk intra → 7 pecahan ekstra.
const JENIS_PECAH_M3 = ['pemecahan_keluar', 'pemecahan_masuk']
// Penggabungan Barang (migrasi 20260811_01) — alasannya PERSIS sama dgn
// Pemecahan di atas: Saldo Awal memuat seluruh baris yang nanti dilebur, Saldo
// Akhir cuma memuat induknya (dengan nilai gabungan), jadi tanpa dua baris
// mutasi ini Model 3 tidak foot.
// ⚠️ `penggabungan_masuk.nilai` = DELTA (Σ barang sumber), bukan nilai penuh
// hasil gabungan — induknya sendiri sudah ada di Saldo Awal. Lihat JENIS_GABUNG
// di lib/rekon.ts; kedua modul WAJIB membacanya dengan cara yang sama, kalau
// tidak Rekonsiliasi & Laporan BMD berbeda angka.
const JENIS_GABUNG_M3 = ['penggabungan_keluar', 'penggabungan_masuk']
// Reklasifikasi — KEDUA jenis (lib/reklasKode.ts), bukan cuma
// `reklas_golongan`. Yang menentukan baris mutasi bukan NAMA jenisnya melainkan
// apakah golongan level-3 berubah; tak ada penjaga di DB yang memaksa
// `reklas_kode` tinggal di golongan yang sama. Versi lama diam-diam tak
// membuatkan baris mutasinya kalau ia melintas, sementara snapshot-nya sudah
// pindah golongan → tidak foot, tanpa pesan apa pun.
const JENIS_REKLAS_M3 = [...JENIS_REKLAS_KODE]
// Koreksi Nilai → mutasi. Ia MENGUBAH nilai perolehan barang yang sudah ada,
// jadi bukan barang masuk/keluar — tapi Saldo Awal & Saldo Akhir sama-sama
// memakai `penyusutan_semester.nilai_perolehan` yang SUDAH memuat koreksi itu,
// jadi tanpa baris mutasinya laporan tak mungkin foot. Presedennya persis
// `akumulasi_kdp` di atas: kenaikan nilai atas aset yang sudah ada, dihitung
// sebagai Penambahan. `nilai` = DELTA ± (lib/transaksi.ts), dan delta itu
// teleskopik — jumlah seluruh delta dalam periode = perubahan bersihnya, jadi
// koreksi berulang atas barang yang sama tak perlu perlakuan "yang terakhir
// menang". Terukur 2026-08-11: 6 baris di 1.3.3 intra, netto Rp665.788.761 —
// tepat sebesar sisa selisih Model 3 yang selama ini tak terjelaskan.
const JENIS_KOREKSI_NILAI_M3 = ['koreksi_nilai']

const SUB_METRICS: Metric[] = ['perolehan', 'akumulasi', 'beban', 'nilaiBuku']

export default function LaporanBmdPage() {
  const supabase = createClient()
  const { rootOf } = useSkpdTree()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  // Default 'intra' (angka neraca) — sejak ekstra ikut disusutkan (2026-07-13),
  // "Semua" = campuran intra+ekstra, bukan lagi tampilan default yang aman.
  const [komptabel, setKomptabel] = useState('intra')
  const [tahun, setTahun] = useState(() => tahunAwal('2026'))
  const [smt, setSmt] = useState('2')
  const [model, setModel] = useState<1 | 2 | 3>(1)
  const [metric, setMetric] = useState<MetricOrAll>('perolehan')
  const [rows, setRows] = useState<RekapRow[] | null>(null)
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [mutasiRows, setMutasiRows] = useState<MutasiRow[] | null>(null)
  const [mutErr, setMutErr] = useState('')
  // Error Model 1 & 2 (Model 3 sudah punya `mutErr` sejak awal). WAJIB
  // ditampilkan — lihat komentar di blok catch `proses()`.
  const [err, setErr] = useState('')
  const [mutasiDetail, setMutasiDetail] = useState<MutasiDetail>({})
  // Periode saldo awal yang belum pernah dihitung engine (kosong = aman).
  const [awalTakTerhitung, setAwalTakTerhitung] = useState('')
  const [loading, setLoading] = useState(false)
  // `smt` = '1' | '2' | 'TH'. 'TH' (Akhir Tahun) HANYA untuk Model 3 — Model 1
  // & 2 memang laporan posisi "s.d. periode", jadi akhir tahun = sama dengan
  // Semester II dan pilihannya tak berarti apa-apa di sana.
  const smtEfektif = smt === 'TH' ? '2' : smt
  const periode = `${tahun}-S${smtEfektif}`

  // ── Periode pembanding Model 3 (keputusan user 2026-08-10) ────────────────
  // Saldo Awal mengikuti JENIS laporannya, bukan selalu semester sebelumnya:
  //   Semester I   → saldo awal TAHUN  ({tahun-1}-S2), mutasi = S1
  //   Semester II  → saldo akhir S1    ({tahun}-S1),   mutasi = S2
  //   Akhir Tahun  → saldo awal TAHUN  ({tahun-1}-S2), mutasi = S1 + S2
  //
  // ⚠️ Saldo awal tahun sengaja diambil lewat `fn_rekap_bmd({tahun-1}-S2)`,
  // BUKAN dari tabel `aset_awal_2026`. Alasannya: dua ujung laporan harus
  // dilihat dengan LENSA YANG SAMA, kalau tidak selisihnya tak akan pernah
  // bisa direkonsiliasi. Diverifikasi 2026-08-10 — keduanya cuma beda
  // 14.000.000 / 3 barang, dan ketiganya sudah teridentifikasi (kamar mandi
  // SDN yang `ekstra` di register tapi `intra` di snapshot; INS-20).
  const periodeAwal = smt === '2' ? `${tahun}-S1` : `${Number(tahun) - 1}-S2`
  // Periode ledger yang ditarik sebagai mutasi.
  const periodeMutasi = smt === 'TH' ? [`${tahun}-S1`, `${tahun}-S2`] : [periode]
  const labelPeriode = smt === 'TH' ? `${tahun} (setahun)` : periode

  // (`rootId`/`mtxKey` DIHAPUS bersama blok rekonsiliasi nilai buku per sel —
  // aturannya kini per BARIS RPC lewat `nilaiBukuSel`, jadi tak ada lagi yang
  // perlu bertanya "sel root ini punya hasil engine atau tidak" belakangan.)

  // Ambil/siapkan sel matriks (skpd root × golongan) sekali.
  function ensureCell(mtx: Record<number, MatrixRow>, skpdId: number, g: string): MatrixCell {
    const root = rootOf(skpdId)
    const rid = root?.id ?? skpdId
    const rnama = root?.nama ?? `SKPD #${skpdId}`
    mtx[rid] ??= { skpdId: rid, skpdNama: rnama, cells: {} }
    return (mtx[rid].cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
  }

  async function proses() {
    setLoading(true); setRows([]); setErr('')
    try {
    const mtx: Record<number, MatrixRow> = {}

    // Agregasi (perolehan + penyusutan engine) per (skpd_id, golongan) dilakukan
    // di DB via RPC fn_rekap_bmd (satu query: aset LIVE ⋈ penyusutan_semester,
    // period-aware & komptabel di SQL) — BUKAN lagi paging seluruh aset +
    // penyusutan_semester ke browser (ratusan request se-kabupaten sejak import
    // 218rb baris P&M). Rollup SKPD induk TETAP di client.
    //
    // ⚠️ Aturan nilai buku (golongan tak disusutkan / sel tanpa hasil engine →
    // nilai buku = nilai perolehan) hidup di `lib/rekapBmd.ts`, SATU tempat.
    // Dulu ia ditulis ulang di sini untuk Model 1 & Model 2 dengan cara yang
    // sedikit berbeda, dan halaman Uji Konsistensi tak menulisnya sama sekali —
    // yang bikin Tanah & ATL dilaporkan "TIDAK COCOK" sebesar seluruh nilai
    // perolehannya (2026-08-16). Jangan disalin balik ke sini.
    const data = assertOk(await supabase.rpc('fn_rekap_bmd', {
      p_periode: periode,
      p_skpd_ids: org.descendantIds ?? null,
      p_komptabel: komptabel || null,
    }), `rekap BMD periode ${periode}`)
    const raw = (data || []) as RekapRpcRow[]
    for (const r of raw) {
      const c = ensureCell(mtx, r.skpd_id, r.golongan)
      c.perolehan += Number(r.perolehan)
      // akumulasi/beban sudah 0 utk sel tanpa hasil engine (LEFT JOIN) — aman
      // dijumlah tanpa syarat. Yang butuh cadangan cuma nilai buku.
      c.akumulasi += Number(r.akumulasi)
      c.beban += Number(r.beban)
      c.nilaiBuku += nilaiBukuSel(r)
    }

    const perGol = rekapPerGolongan(raw)
    setRows(GOLONGAN_REKAP.map(g => {
      const u = perGol.get(g.kode) ?? zeroRekap()
      return {
        kode: g.kode, uraian: g.uraian, disusutkan: g.disusutkan,
        kuantitas: u.kuantitas, perolehan: u.perolehan,
        akumulasi: u.akumulasi, beban: u.beban, nilaiBuku: u.nilaiBuku,
      }
    }))
    setMatrix(Object.values(mtx).sort((a, b) => a.skpdNama.localeCompare(b.skpdNama)))
    } catch (e) {
      // MENOLAK menampilkan angka. Sebelum 2026-08-10 blok ini tidak ada:
      // `const { data } =` menelan error, `(data || [])` bikin loop nol kali,
      // dan SELURUH tabel terisi 0 tanpa satu pun pesan — nol yang terbaca
      // operator sebagai "belum ada aset". Keluarga INS-06/INS-08.
      setErr(`${(e as Error).message} — angka TIDAK ditampilkan supaya tidak ada nol yang terbaca sebagai "belum ada data". Coba Proses lagi; kalau berulang, kabari admin.`)
      setRows(null); setMatrix([])
    } finally {
      setLoading(false)   // di `finally`, bukan akhir jalur sukses (rules.md §2.2)
    }
  }

  // ── Model 3: mutasi (Saldo Awal + Penambahan − Pengurangan = Saldo Akhir) ──

  // Snapshot nilai perolehan per golongan pada suatu periode (barang aktif,
  // sudah diperoleh s.d. periode itu) — versi ringkas dari step 1 `proses()`
  // di atas, tanpa join penyusutan (Model 3 cuma butuh nilai perolehan).
  //
  // ⚠️ Mengembalikan `adaHasilEngine` juga — lihat `bannerAwalTakTerhitung`.
  async function snapshotPerolehan(pPeriode: string): Promise<{ perGol: Record<string, number>; adaHasilEngine: boolean }> {
    const out: Record<string, number> = {}
    // Reuse fn_rekap_bmd (period-aware perolehan per golongan sudah dihitung di
    // SQL); Model 3 cuma butuh kolom perolehan-nya, penyusutan diabaikan.
    // MELEMPAR kalau gagal — ditangkap `.catch` di prosesMutasi(). Tanpa ini,
    // snapshot yang gagal jadi `{}` dan Model 3 menampilkan Saldo Awal NOL,
    // yang lalu "menjelaskan" seluruh saldo akhir sebagai penambahan.
    const data = assertOk(await supabase.rpc('fn_rekap_bmd', {
      p_periode: pPeriode,
      p_skpd_ids: org.descendantIds ?? null,
      p_komptabel: komptabel || null,
    }), `snapshot perolehan periode ${pPeriode}`)
    let countPeny = 0
    for (const r of (data || []) as { golongan: string; perolehan: number; count_peny: number }[]) {
      out[r.golongan] = (out[r.golongan] || 0) + Number(r.perolehan)
      countPeny += Number(r.count_peny) || 0
    }
    return { perGol: out, adaHasilEngine: countPeny > 0 }
  }

  async function fetchSkpdMapM3(): Promise<Record<number, string>> {
    const map: Record<number, string> = {}
    for (let from = 0; ; from += 1000) {
      const data = assertOk(await supabase.from('admin_skpd').select('id,nama').range(from, from + 999), 'daftar SKPD')
      if (!data || data.length === 0) break
      for (const s of data as { id: number; nama: string }[]) map[s.id] = s.nama
      if (data.length < 1000) break
    }
    return map
  }

  // Baris ledger + join aset relevan (kode/nama/nibar/skpd/komptabel) utk satu
  // grup jenis, dalam periode terpilih.
  async function fetchLedgerM3(jenisList: string[]) {
    type Row = {
      id: number; aset_id: string; nilai: number; tanggal: string; skpd_asal: number | null; skpd_tujuan: number | null
      jenis: string; header_id: string | null; periode: string
      payload: Record<string, unknown> | null
      aset: { kode: string; nama_barang: string | null; nibar: string | null; skpd_id: number; intra_ekstra: string | null } | null
    }
    // ⚠️ KEYSET (`.gt('id', …)` + `.order('id')`), BUKAN `.range()`/OFFSET.
    // Versi lama memakai `.range()` TANPA `.order()` sama sekali — dua cacat
    // yang di repo ini selalu berpasangan & keduanya bikin ANGKA LAPORAN SALAH
    // TANPA SUARA (rules.md §3, CLAUDE.md "kolektor halaman-demi-halaman"):
    // Postgres tak menjamin urutan antar-halaman, jadi begitu satu grup jenis
    // melewati 1.000 baris ada yang terlewat DAN ada yang dobel; dan OFFSET
    // makin dalam makin lambat sampai tembus statement timeout.
    //
    // Hari ini masih laten — mutasi se-kabupaten 2026-S1 = 83 baris, 2026-S2 =
    // 147 (terukur 2026-08-18), jauh di bawah 1.000. Diperbaiki SEBELUM
    // meledak, bukan sesudah: kalau ia meledak, gejalanya cuma angka Model 3
    // yang tak foot, tanpa satu pun pesan error.
    //
    // Urutan + filternya dilayani `idx_trx_periode_jenis_id` (periode, jenis,
    // id) — index yang lahir dari insiden yang sama (migrasi 20260728_05).
    const out: Row[] = []
    let terakhir = 0
    for (;;) {
      // `.in('periode', ...)` — Akhir Tahun menarik S1 DAN S2 sekaligus.
      const data = assertOk(await supabase.from('transaksi_bmd')
        .select('id,jenis,header_id,aset_id,nilai,tanggal,periode,skpd_asal,skpd_tujuan,payload,aset:aset_id(kode,nama_barang,nibar,skpd_id,intra_ekstra)')
        .in('periode', periodeMutasi).in('jenis', jenisList as never)
        .gt('id', terakhir).order('id', { ascending: true }).limit(1000),
        `ledger periode ${labelPeriode} (${jenisList.join(', ')})`)
      if (!data || data.length === 0) break
      const rows = data as unknown as Row[]
      out.push(...rows)
      terakhir = rows[rows.length - 1].id
      if (rows.length < 1000) break
    }
    return out
  }

  // (fetchVoidedAsetIds lokal dipindah ke lib/voidedAset.ts — dipakai bersama
  // Rekonsiliasi & Laporan Perolehan. 'batal_akumulasi_kdp' disertakan saat
  // dipanggil karena Model 3 kini ikut menghitung termin KDP: kontrak
  // konstruksi yang dibuka kunci membalik SEMUA terminnya, jadi tak boleh
  // dihitung sbg Penambahan.)

  // (`fetchReklasDibatalkan` lokal DIHAPUS 2026-08-10 — ia menyapu SELURUH
  // ledger `batal_reklas` sepanjang masa padahal yang ditanya cuma segelintir
  // aset di satu periode. Diganti `fetchBatalTargets(supabase, ['batal_reklas'],
  // asetIds)` dari lib/voidedAset.ts: fungsinya identik, tapi TERSCOPE dan
  // sekaligus menghapus salinan implementasi kedua.)

  // aset_id yang NET-terhapus (penghapusan_* belum dibatalkan). batal_penghapusan
  // dicatat per-aset (bukan target_trx_id) & di-backdate ke periode penghapusan
  // asal, jadi tak bisa dipetakan per-trx spt reklas — pakai replay "event
  // TERAKHIR menang" (periode DESC, id DESC) yg sama dgn model visibilitas app:
  // kalau event terakhir penghapusan → net-terhapus (masuk Pengurangan); kalau
  // batal_penghapusan → net-aktif kembali (JANGAN dihitung sbg Pengurangan,
  // supaya hapus→batal netto nol & Model 3 rekonsiliasi). Tanpa ini, penghapusan
  // yg sudah dibatalkan tetap nyantol sbg Pengurangan hantu (SaldoAwal=SaldoAkhir
  // tapi Pengurangan≠0).
  // ⚠️ TERSCOPE ke `asetIds` (rules.md §3.4). Versi lama menyapu SELURUH
  // riwayat penghapusan sepanjang masa lalu dipaginasi dengan `.range()` —
  // padahal yang ditanya cuma status belasan aset di SATU periode. Itu yang
  // bikin Model 3 timeout (INS-21); biayanya tumbuh mengikuti ledger, jadi
  // index pun cuma menggeser ambangnya.
  // ── Kode barang PADA SAAT sebuah transaksi terjadi ─────────────────────────
  // CERMIN KLIEN dari CTE `kode_at` di `fn_rekap_bmd` (migrasi 20260811_01) —
  // ubah satu, samakan yang lain. Bedanya cuma titik acuannya: snapshot bertanya
  // "kode di AKHIR periode P", baris mutasi bertanya "kode saat transaksi ini".
  //
  // Kenapa harus setepat itu: barang yang DIPEROLEH lalu DIREKLAS dalam periode
  // yang sama. Saldo Awal 0, Saldo Akhir di golongan TUJUAN. Kalau baris
  // perolehannya dicatat di golongan tujuan (kode terkini), golongan itu dapat
  // +X dari perolehan DAN +X lagi dari "Reklasifikasi Masuk" — dobel, sementara
  // golongan asal tinggal −X yang tak pernah ada isinya. Dicatat di golongan
  // ASAL, keduanya saling meniadakan dan laporannya foot.
  //
  // Per 2026-08-11 tak ada satu pun aset yang punya reklas DAN mutasi lain di
  // periode yang sama, jadi ini TIDAK menggeser angka mana pun hari ini. Ia
  // dipasang supaya kasus itu tak menghidupkan lagi selisih yang baru saja
  // ditutup — persis pola yang sudah dua kali terjadi di modul ini.
  // Aturannya sendiri hidup di lib/reklasKode.ts — dipakai bersama Rekonsiliasi
  // BMD, yang wajib menghasilkan Saldo Akhir SAMA PERSIS dgn halaman ini.

  async function fetchPenghapusanNetRemoved(asetIds: string[]): Promise<Set<string>> {
    const latest = new Map<string, { periode: string; id: number; removed: boolean }>()
    const uniq = [...new Set(asetIds)]
    for (let i = 0; i < uniq.length; i += 200) {
      const data = assertOk(await supabase.from('transaksi_bmd')
        .select('id,aset_id,periode,jenis')
        .in('jenis', [...JENIS_PENGHAPUSAN_M3, 'batal_penghapusan'] as never)
        .in('aset_id', uniq.slice(i, i + 200)),
        'riwayat penghapusan')
      for (const r of (data || []) as { id: number; aset_id: string; periode: string; jenis: string }[]) {
        // periode 'YYYY-SN' urut secara leksikal (S1<S2, 2026<2027).
        const cur = latest.get(r.aset_id)
        const menang = !cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id)
        if (menang) latest.set(r.aset_id, { periode: r.periode, id: r.id, removed: r.jenis !== 'batal_penghapusan' })
      }
    }
    const out = new Set<string>()
    for (const [asetId, s] of latest) if (s.removed) out.add(asetId)
    return out
  }

  async function prosesMutasi() {
    setLoading(true); setMutasiRows(null); setMutErr(''); setAwalTakTerhitung('')

    const inScope = (skpdId: number | null) => skpdId != null && (org.descendantIds === null || org.descendantIds.includes(skpdId))
    const lolosKomptabel = (ie: string | null) => !komptabel || ie === komptabel

    const gagal = (e: Error) => {
      setMutErr(`Gagal menyusun mutasi: ${e.message}. Angka tidak ditampilkan supaya tak ada yang terbaca sebagai sah padahal datanya tak lengkap.`)
      return null
    }

    // ── DUA TAHAP, sengaja (rules.md §3.4; pola yang sama dgn computeMutasiLines
    // di lib/rekon.ts). TAHAP 1 menarik baris ledger PERIODE INI; TAHAP 2 baru
    // menanyakan status void/batal/net-hapus — dan HANYA untuk aset yang muncul
    // di tahap 1.
    //
    // Versi lama menanyakan keduanya sekaligus, dengan kolektor tahap 2 yang
    // menyapu SELURUH ledger tanpa scope. Itu yang bikin Model 3 timeout
    // (INS-21: "gagal membaca transaksi pembatalan
    // (batal_koreksi_pencatatan_ganda)"), dan biayanya tumbuh terus mengikuti
    // ledger — bukan mengikuti banyaknya mutasi yang sedang dilaporkan.
    //
    // fetchVoidedAsetIds & fetchBatalTargets MELEMPAR sejak 2026-07-28 (dulu
    // errornya ditelan & set void jadi kosong → barang yang dianulir ikut
    // terhitung). Model 3 lebih baik menolak tampil daripada salah angka.
    // ⚠️ DUA SNAPSHOT DIJALANKAN BERURUTAN, BUKAN PARALEL — dan itu justru
    // membuatnya LEBIH CEPAT SELESAI. `fn_rekap_bmd` sendirian ±2–5 dtk;
    // menembakkan dua sekaligus bersama enam tarikan ledger membuat semuanya
    // berebut CPU, dan `statement_timeout` (8 dtk) berlaku PER STATEMENT —
    // jadi yang tadinya 2 dtk bisa jadi 9 dtk lalu dibatalkan, padahal total
    // kerjanya sama saja. Diukur 2026-08-10: S1 5,1 dtk & S2 2,2 dtk sendiri-
    // sendiri; bersamaan → keduanya timeout. Kalau nanti tergoda menjadikannya
    // Promise.all lagi demi "lebih cepat", ukur dulu — ini kasus di mana
    // paralel justru kalah.
    const snapAwal = await snapshotPerolehan(periodeAwal).catch(gagal)
    if (!snapAwal) { setLoading(false); return }
    const snapAkhir = await snapshotPerolehan(periode).catch(gagal)
    if (!snapAkhir) { setLoading(false); return }
    const saldoAwal = snapAwal.perGol
    const saldoAkhir = snapAkhir.perGol
    // ── Peringatan: posisi AWAL diambil dari periode yang ENGINE-nya kosong ───
    // `fn_rekap_bmd` memakai `COALESCE(penyusutan_semester.nilai_perolehan,
    // aset.nilai_perolehan)`. Untuk periode yang tak pernah dihitung engine,
    // ruas pertama selalu NULL — jadi seluruh kolom Saldo Awal diam-diam
    // memakai nilai perolehan HARI INI, termasuk koreksi nilai & kapitalisasi
    // yang baru terjadi SESUDAH periode itu. Laporannya lalu tak mungkin foot,
    // dan tak ada satu pun pesan yang memberi tahu kenapa.
    //
    // Nyata per 2026-08-11: engine cuma punya 2026-S1 & 2026-S2, jadi mode
    // Semester I dan Akhir Tahun 2026 (yang saldo awalnya di 2025-S2) meleset
    // Rp665.788.761 — persis koreksi nilai dua gedung yang dicatat di 2026-S2:
    //   Perbaikan Perkerasan Halaman Rumah Dinas Bupati  213.847.888 → 1.828.592.000
    //   PEMBANGUNAN TAMAN KEPALA KERETA API DI SLG     1.118.060.700 →   169.105.349
    //
    // Dideteksi lewat `count_peny` yang MEMANG SUDAH dikembalikan RPC-nya —
    // bukan daftar tahun yang di-hardcode, supaya ia ikut benar sendiri begitu
    // tahun ditutup (`fn_tutup_tahun` mengisi checkpoint & engine punya baris).
    setAwalTakTerhitung(!snapAwal.adaHasilEngine ? periodeAwal : '')

    // Yang ringan boleh paralel: semuanya sudah tersaring `periode` di SQL.
    const tahap1 = await Promise.all([
      fetchSkpdMapM3(),
      fetchLedgerM3(JENIS_CARA_PEROLEHAN),
      fetchLedgerM3(JENIS_KDP_M3),
      fetchLedgerM3(JENIS_PENGHAPUSAN_M3),
      fetchLedgerM3(JENIS_PECAH_M3),
      fetchLedgerM3(JENIS_GABUNG_M3),
      fetchLedgerM3(['pengalihan_status']),
      fetchLedgerM3(JENIS_REKLAS_M3),
      fetchLedgerM3(JENIS_KOREKSI_NILAI_M3),
    ]).catch(gagal)
    if (!tahap1) { setLoading(false); return }
    const [skpdMap, rowsCara, rowsKdp, rowsHapus, pecahRows, gabungRows, rowsAlih, rowsReklas, rowsKoreksi] = tahap1

    // Aset yang tersentuh mutasi periode ini — dipakai untuk MENSCOPE kolektor
    // tahap 2 (rules.md §3.4). `rowsReklas` ikut supaya set "reklas dibatalkan"
    // mencakup pembatalan atas reklas DI LUAR periode laporan juga: `kodePada`
    // membaca riwayat sepanjang masa, jadi penyaringnya harus seluas itu pula.
    const asetTerlibat = [...rowsCara, ...rowsKdp, ...rowsHapus, ...pecahRows, ...gabungRows,
                          ...rowsAlih, ...rowsReklas, ...rowsKoreksi].map(r => r.aset_id)

    const tahap2 = await Promise.all([
      // KDP: kontrak yang dibuka kunci membalik SEMUA terminnya, jadi asetnya
      // tak boleh dihitung sbg Penambahan.
      fetchVoidedAsetIds(supabase, ['batal_akumulasi_kdp'],
        [...rowsCara, ...rowsKdp].map(r => r.aset_id)),
      // Pengalihan yang DIBATALKAN — kalau tidak disaring, perpindahan yang
      // sudah dianulir tetap muncul sbg mutasi masuk/keluar dan angkanya beda
      // dgn Daftar Barang & Rekonsiliasi.
      fetchBatalTargets(supabase, BATAL_TARGET_JENIS.pengalihan, rowsAlih.map(r => r.aset_id)),
      // Menggantikan fetchReklasDibatalkan lokal yang sudah dihapus.
      fetchBatalTargets(supabase, BATAL_TARGET_JENIS.reklasifikasi, asetTerlibat),
      fetchPenghapusanNetRemoved(rowsHapus.map(r => r.aset_id)),
      fetchPemecahanBatal(supabase, pecahRows.map(r => r.aset_id)),
      // Penggabungan yang dibatalkan — per baris ledger (payload.target_trx_id),
      // bukan per (kartu, aset) spt pemecahan.
      fetchBatalTargets(supabase, BATAL_TARGET_JENIS.penggabungan, gabungRows.map(r => r.aset_id)),
      // Koreksi Nilai yang sudah dibatalkan — deltanya dianggap tak pernah ada,
      // persis perlakuan reklas & pengalihan yang dianulir.
      fetchBatalTargets(supabase, ['batal_koreksi_nilai'], rowsKoreksi.map(r => r.aset_id)),
      // Riwayat reklas — dipakai `kodePada` untuk menaruh tiap baris mutasi di
      // golongannya SAAT ITU. Sengaja tak discope ke aset (lihat lib-nya).
      fetchReklasEvents(supabase),
    ]).catch(gagal)
    if (!tahap2) { setLoading(false); return }
    const [voided, pengalihanDibatalkan, reklasDibatalkan, penghapusanNetRemoved, pecahBatal,
           gabungBatal, koreksiDibatalkan, reklasEvents] = tahap2

    const tambah: Record<string, number> = {}
    const kurang: Record<string, number> = {}
    const detail: MutasiDetail = {}
    function addLine(map: Record<string, number>, arah: 'tambah' | 'kurang', g: string, line: MutasiDetailLine) {
      map[g] = (map[g] || 0) + line.nilai
      const d = (detail[g] ??= { tambah: [], kurang: [] })
      d[arah].push(line)
    }

    // Cara Perolehan → Penambahan (kecuali yang belakangan di-batal/koreksi —
    // itu dianggap tidak pernah ada; daftar jenisnya di lib/voidedAset.ts)
    // Golongan sebuah baris mutasi = golongan barang SAAT transaksi itu terjadi,
    // bukan golongannya sekarang. Lihat `buatKodePada` di atas untuk alasannya.
    const golPada = (r: { aset_id: string; id: number; periode: string; aset: { kode: string } | null }) =>
      kodeLevel3(kodePada(reklasEvents, r.aset_id, r.periode, r.id, r.aset!.kode))

    for (const r of rowsCara) {
      if (!r.aset || voided.has(r.aset_id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(tambah, 'tambah', golPada(r), {
        kategori: 'Cara Perolehan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Termin KDP → Penambahan (golongan 1.3.6). Kategori sendiri supaya kebeda
    // dari Cara Perolehan di rincian; nilai = nominal termin pada periode ini.
    // Kontrak yang dibuka kunci sudah tersaring lewat `voided`
    // (batal_akumulasi_kdp) — lihat pemanggilan fetchVoidedAsetIds di atas.
    for (const r of rowsKdp) {
      if (!r.aset || voided.has(r.aset_id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      addLine(tambah, 'tambah', golPada(r), {
        kategori: 'Konstruksi Dalam Pengerjaan (termin)', tanggal: r.tanggal,
        skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Penghapusan → Pengurangan. Hanya yg NET-terhapus (belum dibatalkan) yg
    // dihitung; dedup per aset supaya siklus hapus→batal→hapus (>1 event
    // penghapusan seperiode) tak dobel-hitung nilainya.
    const hapusSeen = new Set<string>()
    for (const r of rowsHapus) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      if (!penghapusanNetRemoved.has(r.aset_id) || hapusSeen.has(r.aset_id)) continue
      hapusSeen.add(r.aset_id)
      addLine(kurang, 'kurang', golPada(r), {
        kategori: 'Penghapusan', tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Pemecahan Barang: induk KELUAR dari selnya, tiap pecahan MASUK ke selnya.
    // Sering beda kolom komptabel (induk intra → pecahan ekstra), jadi per
    // golongan × komptabel ini mutasi sungguhan, bukan net-nol yang bisa
    // diabaikan. Pembatalan disaring per (kartu, aset) — satu induk boleh
    // dipecah, dibatalkan, lalu dipecah lagi.
    for (const r of pecahRows) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      if (pecahBatal.has(kunciPemecahan(r.header_id, r.aset_id))) continue
      const keluar = r.jenis === 'pemecahan_keluar'
      addLine(keluar ? kurang : tambah, keluar ? 'kurang' : 'tambah', golPada(r), {
        kategori: keluar ? 'Pemecahan Barang (induk dipecah)' : 'Pemecahan Barang (pecahan baru)',
        tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Penggabungan Barang: tiap barang SUMBER keluar sebesar nilai
    // perolehannya, INDUK menerima delta-nya (Σ sumber). Kalau semuanya sekolom
    // komptabel, Penambahan & Pengurangan sama besar dan Saldo Akhir tak
    // bergeser — memang begitu maksudnya: yang dirapikan pencatatannya, bukan
    // kekayaannya. Yang dijaga baris ini justru kasus sebaliknya, saat induk &
    // sumber beda kolom/golongan.
    for (const r of gabungRows) {
      if (!r.aset || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      if (gabungBatal.has(r.id)) continue
      const keluar = r.jenis === 'penggabungan_keluar'
      addLine(keluar ? kurang : tambah, keluar ? 'kurang' : 'tambah', golPada(r), {
        kategori: keluar ? 'Penggabungan Barang (barang dilebur)' : 'Penggabungan Barang (nilai masuk ke induk)',
        tanggal: r.tanggal, skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Pengalihan Status: masuk ke Penambahan (tujuan in-scope, asal tidak) /
    // Pengurangan (asal in-scope, tujuan tidak) — netral kalau scope "Semua".
    for (const r of rowsAlih) {
      if (!r.aset || !lolosKomptabel(r.aset.intra_ekstra)) continue
      // Sudah dibatalkan → perpindahannya dianggap tak pernah terjadi, jadi
      // tak boleh muncul sbg Pengalihan Masuk/Keluar. Tanpa baris ini angka
      // Model 3 beda dgn Daftar Barang & Rekonsiliasi yang sudah membuangnya.
      if (pengalihanDibatalkan.has(r.id)) continue
      const asalIn = inScope(r.skpd_asal)
      const tujuanIn = inScope(r.skpd_tujuan)
      const g = golPada(r)
      const line = (skpdId: number | null): MutasiDetailLine => ({
        kategori: tujuanIn && !asalIn ? 'Pengalihan Masuk' : 'Pengalihan Keluar', tanggal: r.tanggal,
        skpdNama: skpdMap[skpdId || 0] || '-', namaBarang: r.aset!.nama_barang, nibar: r.aset!.nibar, nilai: r.nilai,
      })
      if (tujuanIn && !asalIn) addLine(tambah, 'tambah', g, line(r.skpd_asal))
      else if (asalIn && !tujuanIn) addLine(kurang, 'kurang', g, line(r.skpd_tujuan))
    }

    // Reklasifikasi: golongan ASAL (payload.kode_lama) → Pengurangan, golongan
    // TUJUAN (payload.kode_baru) → Penambahan. Di sini `kodePada` TIDAK dipakai
    // — barisnya sendiri yang menyatakan kode sebelum & sesudah.
    //
    // ⚠️ Hanya kalau golongan level-3-nya BENAR-BENAR berubah. Reklas di dalam
    // golongan yang sama (30 dari 31 baris per 2026-08-11 — semuanya di 1.5.4)
    // akan menghasilkan +X dan −X di SEL YANG SAMA: totalnya memang nol, tapi
    // kolom Penambahan & Pengurangan menggelembung oleh mutasi yang tak pernah
    // menyeberang ke mana pun, dan pembacanya mengira ada barang berpindah.
    for (const r of rowsReklas) {
      if (!r.aset || reklasDibatalkan.has(r.id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      const kodeLama = typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : null
      const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : null
      if (!kodeLama || !kodeBaru) continue
      const golLama = kodeLevel3(kodeLama)
      const golBaru = kodeLevel3(kodeBaru)
      if (golLama === golBaru) continue
      const skpdNama = skpdMap[r.aset.skpd_id] || '-'
      addLine(kurang, 'kurang', golLama, {
        kategori: 'Reklasifikasi Keluar', tanggal: r.tanggal, skpdNama, namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
      addLine(tambah, 'tambah', golBaru, {
        kategori: 'Reklasifikasi Masuk', tanggal: r.tanggal, skpdNama, namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: r.nilai,
      })
    }

    // Koreksi Nilai → Penambahan (delta +) / Pengurangan (delta −).
    // `nilai` sudah berupa selisih bertanda, jadi yang dilaporkan cuma
    // perubahannya — BUKAN nilai perolehan barangnya, yang memang sudah duduk
    // di Saldo Awal. Barang yang sama dikoreksi beberapa kali muncul beberapa
    // baris; itu disengaja, karena itulah isi ledgernya, dan jumlah bertandanya
    // tetap sama dengan perubahan bersih.
    for (const r of rowsKoreksi) {
      if (!r.aset || koreksiDibatalkan.has(r.id) || !inScope(r.aset.skpd_id) || !lolosKomptabel(r.aset.intra_ekstra)) continue
      if (!r.nilai) continue
      const naik = r.nilai > 0
      addLine(naik ? tambah : kurang, naik ? 'tambah' : 'kurang', golPada(r), {
        kategori: naik ? 'Koreksi Nilai (bertambah)' : 'Koreksi Nilai (berkurang)', tanggal: r.tanggal,
        skpdNama: skpdMap[r.aset.skpd_id] || '-',
        namaBarang: r.aset.nama_barang, nibar: r.aset.nibar, nilai: Math.abs(r.nilai),
      })
    }

    setMutasiDetail(detail)
    setMutasiRows(GOLONGAN_REKAP.map(g => {
      const sa = saldoAwal[g.kode] || 0
      const sk = saldoAkhir[g.kode] || 0
      return { kode: g.kode, uraian: g.uraian, saldoAwal: sa, penambahan: tambah[g.kode] || 0, pengurangan: kurang[g.kode] || 0, saldoAkhir: sk }
    }))
    setLoading(false)
  }

  // Baris keterangan di ATAS tabel Model 3. Selalu memuat identitas laporannya
  // (periode & lingkupnya) supaya berkas yang beredar bisa berdiri sendiri —
  // nama file gampang diganti orang, isi sheet tidak.
  function catatanMutasi(): string[] {
    const out = [
      `Laporan BMD — Mutasi (Model 3). Saldo Awal = posisi ${periodeAwal}; ` +
      `mutasi ${smt === 'TH' ? `sepanjang tahun ${tahun}` : `periode ${periode}`}; ` +
      `Saldo Akhir = posisi ${periode}. Komptabel: ${komptabel || 'semua'}.`,
    ]
    if (awalTakTerhitung) {
      out.push(
        `PERHATIAN — Saldo Awal (${awalTakTerhitung}) belum pernah dihitung engine penyusutan. ` +
        `Untuk periode itu tidak ada hasil penyusutan tersimpan, sehingga kolom Saldo Awal memakai ` +
        `nilai perolehan yang berlaku pada saat berkas ini dibuat — sudah termasuk koreksi nilai & ` +
        `kapitalisasi yang dicatat SESUDAH periode tersebut.`,
        `Akibatnya Saldo Awal + Penambahan - Pengurangan BISA TIDAK SAMA dengan Saldo Akhir. ` +
        `Selisih itu bukan kesalahan penjumlahan. Untuk angka yang bisa direkonsiliasi, pakai ` +
        `periode yang kedua ujungnya sudah dihitung engine (mis. Semester II).`,
      )
    }
    return out
  }

  function handleExport() {
    if (model === 1) {
      if (!rows) return
      exportToExcel(rows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian, 'Kuantitas': r.kuantitas, 'Harga Perolehan': r.perolehan,
        [`Akumulasi Penyusutan s.d. ${periode}`]: r.disusutkan ? r.akumulasi : '',
        [`Beban Penyusutan ${periode}`]: r.disusutkan ? r.beban : '',
        'Nilai Buku': r.nilaiBuku,
      })), `Laporan_BMD_${periode}`, 'Laporan BMD')
      return
    }
    if (model === 3) {
      if (!mutasiRows) return
      // Peringatan yang sama dgn banner di layar WAJIB ikut ke berkasnya.
      // Berkas inilah yang dikirim ke inspektorat/BPK; bannernya tidak ikut,
      // dan pembacanya tak punya cara lain untuk tahu.
      exportToExcel(mutasiRows.map(r => ({
        'Kode Jenis': r.kode, 'Uraian': r.uraian,
        [`Saldo Awal (posisi ${periodeAwal})`]: r.saldoAwal,
        [`Penambahan ${labelPeriode}`]: r.penambahan,
        [`Pengurangan ${labelPeriode}`]: r.pengurangan,
        [`Saldo Akhir (posisi ${periode})`]: r.saldoAkhir,
      })), `Laporan_BMD_Mutasi_${smt === 'TH' ? tahun : periode}`, 'Laporan BMD Mutasi',
        catatanMutasi())
      return
    }
    const metrics: Metric[] = metric === 'semua' ? SUB_METRICS : [metric]
    exportToExcel(matrix.map(r => {
      const row: Record<string, unknown> = { SKPD: r.skpdNama }
      for (const g of GOLONGAN_REKAP) {
        const c = r.cells[g.kode]
        for (const m of metrics) {
          const applicable = (m !== 'akumulasi' && m !== 'beban') || g.disusutkan
          const key = metric === 'semua' ? `${g.uraian} — ${METRIC_LABEL[m]}` : g.uraian
          row[key] = applicable ? (c?.[m] || 0) : ''
        }
      }
      return row
    }), `Laporan_BMD_${periode}_per_SKPD`, 'Laporan BMD per SKPD')
  }

  // Export ikut fail-closed (rules.md §2.3): kalau ada kegagalan, tombolnya
  // tidak muncul sama sekali — Excel setengah jadi yang terlanjur terunduh tak
  // punya tanda apa pun bahwa isinya kurang.
  const hasData = !err && !mutErr && (
    model === 1 ? (rows && rows.length > 0) : model === 3 ? (mutasiRows && mutasiRows.length > 0) : matrix.length > 0)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laporan BMD</h1>
        <p className="text-gray-500 text-sm mt-1">Rekapitulasi & penyusutan s.d. periode {periode}, per golongan BMD.</p>
      </div>
      {mutErr && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{mutErr}</div>
      )}
      {err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{err}</div>
      )}
      {awalTakTerhitung && (
        <div role="alert" className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-4">
          <p className="font-semibold">Saldo Awal ({awalTakTerhitung}) belum pernah dihitung engine.</p>
          <p className="mt-1">
            Untuk periode itu tak ada hasil penyusutan tersimpan, jadi kolom Saldo Awal
            memakai <span className="font-medium">nilai perolehan yang berlaku hari ini</span> — sudah termasuk
            koreksi nilai &amp; kapitalisasi yang baru dicatat SESUDAH periode tersebut.
            Akibatnya <span className="font-medium">Saldo Awal + Penambahan − Pengurangan bisa tidak sama dengan
            Saldo Akhir</span>, dan selisihnya bukan kesalahan penjumlahan.
          </p>
          <p className="mt-1">
            Untuk angka yang bisa direkonsiliasi, pakai periode yang kedua ujungnya sudah dihitung engine
            (mis. Semester II), atau bandingkan dengan menu Saldo Awal.
          </p>
        </div>
      )}

      {/* Batasan yang DISENGAJA & disampaikan terbuka (audit Pelaporan 2026-07-25):
          keanggotaan & pemilik dihitung dari register TERKINI (aset.status /
          aset.skpd_id), bukan replay s.d. periode. Untuk periode berjalan tak ada
          bedanya; untuk periode LAMPAU angkanya bisa bergeser kalau setelahnya ada
          penghapusan / pengalihan. Nilai perolehan sendiri SUDAH period-correct
          sejak migrasi 20260725_05. Rekonsiliasi BMD (lib/rekon.ts) period-aware
          penuh → itu rujukan angka periodik resmi. */}
      <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs leading-relaxed">
        <b>Catatan periode lampau.</b> Keanggotaan barang &amp; SKPD pemilik pada laporan ini
        mengikuti <b>register terkini</b>. Untuk periode berjalan angkanya sama saja, tetapi saat
        menampilkan <b>periode yang sudah lewat</b>, barang yang setelah itu dihapus atau dialihkan
        ke SKPD lain dapat menggeser angka. Untuk laporan periodik resmi yang tidak berubah
        (mis. lampiran BPK/Inspektorat), gunakan <b>Rekonsiliasi BMD</b>.
      </div>

      <div className="card p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Filter data</h2>
        <div className="space-y-3 max-w-3xl">
          {/* Pindah ke Model 1/2 sambil membawa 'TH' bikin TAK ADA radio yang
              tercentang (pilihannya cuma ada di Model 3) padahal datanya jalan
              — jatuh ke S2. Turunkan ke '2' supaya layar & angka sepakat. */}
          <RekapModelControls
            model={model}
            onModel={m => { setModel(m); if (m !== 3 && smt === 'TH') setSmt('2') }}
            metric={metric} onMetric={setMetric} models={[1, 2, 3]}
          />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
            <SkpdCombobox lockToOperator onChangeSelection={setOrg} allowClear placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
          </div>
          <KomptabelRadio value={komptabel} onChange={setKomptabel} />
          <div className="flex items-center gap-3">
            <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">
              {model === 3 ? 'Periode laporan :' : 'Sampai Semester :'}
            </label>
            <select className="select-filter w-28" value={tahun} onChange={e => setTahun(e.target.value)}>
              {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex gap-4">
              {/* "Akhir Tahun" HANYA untuk Model 3 — Model 1 & 2 laporan posisi
                  "s.d. periode", jadi di sana akhir tahun = Semester II. */}
              {(model === 3
                ? [['1', 'Semester I'], ['2', 'Semester II'], ['TH', 'Akhir Tahun']]
                : [['1', 'Semester I'], ['2', 'Semester II']]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="smt" checked={smt === v} onChange={() => setSmt(v)} />{l}
                </label>
              ))}
            </div>
          </div>
          {model === 3 && (
            <div className="flex items-start gap-3">
              <span className="w-40 flex-shrink-0" />
              <p className="text-xs text-gray-500">
                Saldo Awal = posisi <span className="font-medium">{periodeAwal}</span> ·
                mutasi {smt === 'TH' ? 'sepanjang tahun' : `periode ${periode}`} ·
                Saldo Akhir = posisi <span className="font-medium">{periode}</span>.
              </p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0" />
            <button className="btn-primary" onClick={model === 3 ? prosesMutasi : proses} disabled={loading}>{loading ? 'Memproses...' : 'Proses'}</button>
            {hasData && <button className="btn-secondary" onClick={handleExport}>Export Excel</button>}
            {/* Lembar resmi Permendagri 47/2021 Format IV.L.4.2 — HANYA di
                Model 1 (laporan posisi per golongan); Model 2 matriks per SKPD
                & Model 3 mutasi punya format lampirannya sendiri (IV.L.4.1)
                yang belum dibangun, jadi tombolnya sengaja tak muncul di sana
                supaya tak ada yang mengira lembar ini mewakili angka Model 3.
                ⚠️ WAJIB per-SKPD: kepala lembar memuat identitas SKPD, jadi
                tanpa SKPD terpilih ia menghasilkan lembar tanpa identitas.
                Dimatikan berikut ALASANNYA — tombol mati tanpa keterangan itu
                kegagalan senyap. */}
            {hasData && model === 1 && (
              org.skpdId ? (
                <a href={`/cetak/laporan-bmd?periode=${periode}&skpd=${org.skpdId}&komptabel=${komptabel}`}
                  target="_blank" rel="noreferrer" className="btn-secondary whitespace-nowrap">
                  🖨 Cetak Format IV.L.4.2
                </a>
              ) : (
                <span className="btn-secondary opacity-50 cursor-not-allowed whitespace-nowrap"
                  title="Pilih SKPD dulu — lembar Format IV.L.4.2 memuat identitas SKPD di kepalanya, jadi hanya sah per-SKPD.">
                  🖨 Cetak Format IV.L.4.2
                </span>
              )
            )}
          </div>
        </div>
      </div>

      <TahunTerkunciNote tahun={Number(tahun)} />

      {(model !== 3 && rows === null) || (model === 3 && mutasiRows === null) ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          Atur filter lalu klik <span className="font-medium text-gray-600">Proses</span>.
        </div>
      ) : model === 1 ? (
        <RekapTable rows={rows!} loading={loading}
          labelAkumulasi={`Akumulasi s.d. ${periode}`} labelBeban={`Beban ${periode}`} />
      ) : model === 3 ? (
        <RekapMutasiTable rows={mutasiRows!} detail={mutasiDetail} loading={loading} />
      ) : (
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric={metric} loading={loading} />
      )}
    </div>
  )
}
