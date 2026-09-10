'use client'
// Laporan Cara Perolehan (Pengadaan/Hibah/Tukar Menukar/Hasil Inventarisasi/
// Perolehan Lainnya) — kolom detail spesifikasi barang, BEDA dari
// LaporanTransaksi generik (SUDAH DIHAPUS 2026-09-07; dulu dipakai menu spt
// Reklasifikasi/Koreksi yang gak butuh kolom sedetail ini). Kolom (kiri→kanan):
// [Pihak, kalau ada] Kode Barang, Uraian Barang, Spesifikasi Nama Barang+NIBAR,
// Merk/Tipe, Spesifikasi Lainnya, Komptabel, Nomor Dokumen Sumber, Tanggal
// Perolehan (BAST), Nilai Perolehan, Keterangan.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useProfilRole } from '@/components/useProfilRole'
import RekapMatrixTable, { type MatrixRow } from '@/components/RekapMatrixTable'
import { bangunPohonRekap, ratakanPohon, type LeafRekap } from '@/lib/rekapPohon'
import { useSkpdTree } from '@/components/useSkpdTree'
import { useTahunBukuMap } from '@/components/useTahunBuku'
import LaporanPengadaanPermendagri from '@/components/pelaporan/LaporanPengadaanPermendagri'
import PerolehanFormatPermendagri from '@/components/pelaporan/PerolehanFormatPermendagri'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'
import { lembarPerolehan } from '@/lib/permendagriFormat'
import { FORMAT_PEROLEHAN } from '@/lib/formatPermendagri'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { splitKodeUraian } from '@/lib/laporanPengadaan'
import { fetchUraianRekening } from '@/lib/rkbmdStandar'

type Trx = {
  id: number
  periode: string
  tanggal: string
  nilai: number
  keterangan: string | null
  payload: { pihak?: string; kode_rekening?: string } | null
  /**
   * ⚠️ `nama_penyedia` tinggal di HEADER, bukan di payload baris ledger —
   * diperiksa ke produksi 2026-09-08: 0 dari 501 baris perolehan punya kunci itu
   * di `transaksi_bmd.payload`, sementara 94 dari 94 header pengadaan punya.
   * Jadi kolom Nama Penyedia WAJIB lewat join ini.
   *
   * ⚠️ SATU RUAS SAJA (`payload->>nama_penyedia`), JANGAN `payload` UTUH.
   * Versi pertama kolom ini menarik `payload` seluruhnya dan itu MEMATIKAN
   * Laporan Hibah dalam sehari: `jurnal_header.payload` memuat `draft_items` —
   * seluruh barang dokumen itu — dan header hibah terbesar di produksi
   * **431 kB**. PostgREST menyisipkan header per BARIS, jadi 430 baris hibah ×
   * 431 kB ≈ 185 MB JSON untuk satu halaman → `canceling statement due to
   * statement timeout`. Dengan `->>` yang dikirim cuma satu string.
   * Sintaks arrow di dalam embedded resource sudah diuji ke API proyek ini
   * (HTTP 200; bentuk yang sengaja dirusak dibalas PGRST100), bukan diasumsikan.
   */
  header: { no_sk: string; nama_penyedia: string | null; sub_kegiatan: string | null } | null
  skpd_tujuan: number | null
  aset_id: string | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    merek_tipe: string | null; spesifikasi_lainnya: string | null; intra_ekstra: string | null; status: string
    /**
     * ⚠️ Keterangan yang DIISI OPERATOR per barang (field spesifikasi) —
     * `transaksi_bmd.keterangan` (baris ledger perolehan) memang SELALU
     * KOSONG, ia cuma dipakai sbg cadangan. Pola & alasan persis
     * `app/cetak/perolehan/page.tsx` (2026-08-20).
     */
    keterangan: string | null
  } | null
}

/**
 * Cara perolehan yang punya rekanan/penyedia di `jurnal_header.payload
 * .nama_penyedia`. SENGAJA diturunkan dari `jenis` di sini, BUKAN dijadikan
 * prop opsional baru: berkas ini sendiri sudah mencatat kenapa (lihat catatan
 * `lembarPerolehan` di bawah) — prop opsional yang lupa dikirim TIDAK
 * menghasilkan error TypeScript, jadi menu Perolehan berikutnya akan kehilangan
 * kolomnya DIAM-DIAM. Satu tempat, satu suntingan.
 *
 * Diperiksa ke produksi 2026-09-08: nama_penyedia terisi 66/66 baris pengadaan
 * & 0 di hibah/hasil inventarisasi — di sana lawan mainnya "Pihak Pemberi",
 * yang sudah punya kolomnya sendiri lewat `pihakLabel`.
 */
const PUNYA_PENYEDIA = new Set(['pengadaan'])

/**
 * Cara perolehan yang punya SANDARAN ANGGARAN — kode rekening belanja
 * (`transaksi_bmd.payload.kode_rekening`, per barang) & sub kegiatan
 * (`jurnal_header.payload.sub_kegiatan`, per dokumen). Kolomnya ditambahkan
 * 2026-09-09 atas permintaan user: dua keterangan itu sudah lama tersimpan &
 * sudah dicetak di lembar Format Permendagri, tapi tab "Daftar Transaksi" —
 * yang justru paling sering dipakai kerja harian — tak pernah menampilkannya.
 *
 * ⚠️ HANYA `pengadaan`, dan itu bukan kelalaian: hibah/tukar menukar/hasil
 * inventarisasi/perolehan lainnya TIDAK dibiayai APBD, jadi keempatnya tak
 * pernah punya kode rekening maupun sub kegiatan. Menambahkan kolomnya di sana
 * cuma melahirkan dua kolom yang SELALU '-'.
 *
 * ⚠️ Diturunkan dari `jenis` di sini — SAMA alasannya dgn PUNYA_PENYEDIA di
 * atas: prop opsional yang lupa dikirim tak menghasilkan error TypeScript, jadi
 * menu Perolehan berikutnya akan kehilangan kolomnya DIAM-DIAM.
 */
const PUNYA_ANGGARAN = new Set(['pengadaan'])

export default function LaporanPerolehan({ judul, deskripsi, jenis, filePrefix, pihakLabel }: {
  judul: string
  deskripsi: string
  jenis: string
  filePrefix: string
  /** Diisi (mis. "Pihak Pemberi Hibah") utk Hibah/Tukar Menukar → tambah kolom paling kiri. Null utk yang lain. */
  pihakLabel?: string | null
}) {
  // ⚠️ ADA/TIDAKNYA tab "Format Permendagri" DITURUNKAN dari registry, bukan
  // dari prop (R5, docs/pelaporan-permendagri.md). Dulu ia prop opsional
  // `enableModel3` — dan prop opsional yang lupa dikirim TIDAK menghasilkan
  // error TypeScript, jadi menu Perolehan keenam yang lupa mendaftarkannya akan
  // kehilangan tabnya DIAM-DIAM. Sekarang mustahil: yang punya entri di
  // registry dapat tabnya sendiri, yang tidak, tidak.
  //
  // ⚠️ Nama "Model 3" DICABUT dari nomenklatur menu ini (keputusan user
  // 2026-08-29) karena angkanya menyesatkan: di Laporan BMD & Saldo Awal
  // "Model 1/2/3" adalah penamaan aplikasi untuk tiga bentuk rekap (per
  // golongan / matriks per SKPD / mutasi), sedangkan di sini "Model 3" dipakai
  // untuk hal yang sama sekali BERBEDA — lembar resmi Format IV.A. Satu kata,
  // dua arti, di modul yang sama. Kode formatnya tetap terbaca, tapi dicetak
  // DI LEMBARNYA (LaporanPengadaanTabel).
  const lembar = lembarPerolehan(jenis)
  const { role, skpdId: myScopeId } = useProfilRole()
  const isAdmin = role === 'admin'
  const supabase = createClient()
  const { byId: skpdById, childrenOf, rootOf, loaded: skpdLoaded } = useSkpdTree()
  // Rekap per SKPD = wewenang admin pemda ATAU siapa pun yang punya anak SKPD
  // di bawahnya (keputusan user 2026-09-10) — tanpa anak, rekapnya cuma bakal
  // 1 baris (dirinya sendiri), sama saja dgn total yang sudah ada di tab
  // Daftar Transaksi, jadi tabnya tak usah ditawarkan sama sekali.
  const bolehRekap = isAdmin || (myScopeId != null && (childrenOf.get(myScopeId)?.length ?? 0) > 0)
  const tahunBuku = useTahunBukuMap()
  const [rows, setRows] = useState<Trx[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const namaSkpd = useNamaSkpd()
  const [periodeList, setPeriodeList] = useState<string[]>([])
  const [periode, setPeriode] = useState('')
  const [descIds, setDescIds] = useState<number[] | null>(null)
  const [selSkpdId, setSelSkpdId] = useState<number | null>(null) // SKPD terpilih (utk footer lembar Permendagri)
  // Rekap per SKPD: matriks per SKPD (root) x per golongan — dibangun lazy saat view dipindah.
  const [view, setView] = useState<'list' | 'matrix' | 'permendagri'>('list')
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [matrixLoading, setMatrixLoading] = useState(false)

  useEffect(() => {
    // ⚠️ `order('id')`, BUKAN `order('periode')` — `jenis` (ENUM) tak bisa jadi
    // index-cond di bawah RLS (CLAUDE.md "ronde 3"), jadi urutan yang dipakai
    // menentukan index mana yang sanggup melayani. Diukur ke DB dgn RLS aktif:
    // order('periode') menyusuri idx_trx_periode MUNDUR sambil membuang
    // ~421rb baris jenis lain → 14.408 ms (di atas statement_timeout 8 dtk,
    // TIMEOUT nyata, bukan teori). order('id') dilayani `idx_trx_perolehan_id`
    // (partial index yg SAMA dipakai buildQuery di bawah) → 19,8 ms.
    supabase.from('transaksi_bmd').select('periode').eq('jenis', jenis)
      .order('id', { ascending: false }).limit(1000)
      .then(({ data }) => setPeriodeList([...new Set((data || []).map(r => r.periode))].sort().reverse()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Aset yang dianggap TAK PERNAH diperoleh (batal_* cara perolehan / koreksi
  // ganda). Dipakai menggantikan filter `aset.status='dihapus'` yang TIDAK
  // period-correct — status terkini juga kena `penghapusan_*` (peristiwa periode
  // LAIN), jadi barang yang sah diperoleh periode ini ikut hilang begitu kelak
  // dihapus. Lihat lib/voidedAset.ts.
  // fetchVoidedAsetIds MELEMPAR kalau query-nya gagal (sejak 2026-07-28) — dulu
  // errornya ditelan & set void jadi kosong, artinya "tak ada yang dibatalkan"
  // dan barang yang sudah dianulir tetap tampil sebagai perolehan sah. Di sini
  // kegagalan itu ditandai supaya operator tahu angkanya belum bisa dipercaya.
  const [voidedErr, setVoidedErr] = useState('')

  /**
   * kode_sub_rincian → nama belanja, untuk kolom "Kode Rekening".
   * ⚠️ Kunci join-nya `admin_rekening.kode_sub_rincian`, BUKAN `kode_rekening`
   * — kolom yang namanya paling menggoda itu isinya cuma level teratas
   * (harfiah '5') di SELURUH barisnya, jadi menjoin ke sana mengembalikan 0
   * baris TANPA error & uraiannya tinggal kosong (CLAUDE.md 2026-08-13).
   * Sengaja TIDAK fail-closed: uraian itu hiasan di atas kode yang sudah benar,
   * dan cadangannya (kode saja) persis tampilan sebelum kolom ini ada.
   */
  const [uraianRek, setUraianRek] = useState<Map<string, string>>(new Map())

  // ⚠️ DITANYAKAN PER BARIS YANG SUDAH DITARIK, bukan disapu di muka
  // (2026-08-20). Versi lama memanggil `fetchVoidedAsetIds(supabase)` TANPA
  // daftar aset, di sebuah useEffect ber-deps `[]` — jadi ia menyisir SELURUH
  // `transaksi_bmd` (418rb baris) cuma untuk menanyakan status paling banyak
  // 500 baris laporan. Itu TIMEOUT, dan TIDAK bisa ditambal index: `jenis`
  // bertipe ENUM tak pernah bisa jadi index-cond di bawah RLS (CLAUDE.md
  // "ronde 3"). Obatnya memang sudah tertulis di sana — scope-kan, jangan
  // tambah index. Ini pemanggil tak-terscope yang TERAKHIR.
  //
  // Urutannya jadi terbalik, dan itu memang syaratnya: tarik barisnya DULU,
  // baru tanya status void aset-aset itu — `jenis IN (...) AND aset_id IN
  // (...)` dilayani idx_trx_jenis_aset, biayanya tetap kecil selamanya.
  //
  // Berlaku ke KELIMA menu Laporan Perolehan sekaligus (Pengadaan, Hibah,
  // Tukar Menukar, Hasil Inventarisasi, Perolehan Lainnya) — komponen ini
  // dipakai bersama.
  const saringVoid = useCallback(async <T extends { aset_id: string | null }>(baris: T[]): Promise<T[]> => {
    const voided = await fetchVoidedAsetIds(
      supabase, [], baris.map(r => r.aset_id).filter((id): id is string => !!id))
    return baris.filter(r => !(r.aset_id && voided.has(r.aset_id)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * ⚠️ NETRAL, jangan menyebut query tertentu. Sampai 2026-09-08 pesan ini
   * berbunyi "Gagal memuat daftar transaksi yang dibatalkan: …" dan dipakai
   * untuk SETIAP kegagalan di loader — termasuk saat yang tumbang justru query
   * UTAMA-nya. Akibatnya strip merah menunjuk ke `fetchVoidedAsetIds` yang
   * sebenarnya sehat (terukur 17 ms), dan penelusurannya berangkat dari
   * tersangka yang salah. Kelas yang sama dgn "merah palsu" di
   * lib/sinkronisasiRpc.test.ts §7: penjelasan yang keliru lebih mahal daripada
   * tak ada penjelasan.
   *
   * Yang benar-benar gagal tetap terbaca dari `e.message` — `fetchVoidedAsetIds`
   * melempar dgn awalan "gagal membaca transaksi pembatalan (…)", jadi kalau
   * memang dia yang tumbang, pesannya menyebut dirinya sendiri.
   */
  const pesanGagal = (e: Error) =>
    `Gagal memuat laporan: ${e.message}. Angka di halaman ini TIDAK ditampilkan — muat ulang halaman dulu.`

  const buildQuery = useCallback(() => {
    let q = supabase.from('transaksi_bmd')
      .select('id,periode,tanggal,nilai,keterangan,payload,skpd_tujuan,aset_id,header:header_id(no_sk,nama_penyedia:payload->>nama_penyedia,sub_kegiatan:payload->>sub_kegiatan),aset:aset_id(kode,uraian_barang,nama_barang,nibar,merek_tipe,spesifikasi_lainnya,intra_ekstra,status,keterangan)')
      .eq('jenis', jenis)
      .order('id', { ascending: false })
    // ⚠️ `periode` bisa bernilai TAHUN saja (mis. `2026` = Akhir Tahun) —
    // `.eq('periode','2026')` tak akan cocok dengan apa pun dan menghasilkan
    // "0 transaksi" yang kelihatan sah. `periodeDiminta` yang menerjemahkannya
    // jadi S1+S2 tahun itu; satu semester tetap `.eq`.
    const per = periodeDiminta(periode)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    if (descIds && descIds.length > 0) {
      const list = descIds.join(',')
      q = q.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
    }
    return q
  }, [periode, descIds, jenis]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ;(async () => {
      setLoading(true); setVoidedErr('')
      try {
        // `error` WAJIB dibaca: `const { data } = await` bikin query yang gagal
        // terbaca sebagai "datanya memang kosong" — 0 transaksi yang kelihatan
        // sah padahal query-nya tumbang.
        const { data, error } = await buildQuery().limit(500)
        if (error) throw new Error(error.message)
        setRows(await saringVoid((data as never as Trx[]) || []))
      } catch (e) {
        // Fail-closed (CLAUDE.md): modul pelaporan lebih baik menolak tampil
        // daripada menyajikan angka kurang-sebagian yang kelihatan sah.
        setVoidedErr(pesanGagal(e as Error)); setRows([])
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan tabel "Memuat data..." SELAMANYA.
        setLoading(false)
      }
    })()
  }, [buildQuery, saringVoid])

  // ── Pilihan periode ────────────────────────────────────────────────────────
  // ⚠️ TAHUNNYA DARI `tahun_buku`, BUKAN dari periode yang kebetulan berisi.
  // Versi sebelumnya menurunkan daftar dari `periodeList` — periode yang punya
  // transaksi — sehingga SEMESTER YANG BELUM ADA TRANSAKSINYA TAK BISA DIPILIH
  // sama sekali. Itu salah dua kali: (a) periode kosong adalah jawaban yang
  // SAH, lembarnya memang mencetak "tidak ada perolehan pada periode ini" dan
  // itulah yang dibutuhkan saat pemeriksa menanyakannya; (b) `periodeList`
  // disaring `.limit(1000)` baris TERBARU, jadi untuk jenis yang barisnya
  // banyak, tahun-tahun lama akan lenyap dari dropdown TANPA satu pun tanda.
  // `tahun_buku` itu tabel kecil yang memang mendefinisikan tahun kerja
  // aplikasi — tepat untuk dipakai di sini.
  // ⚠️ HANYA TAHUN KERJA BERJALAN (keputusan user 2026-08-30) — tahun terkunci
  // sengaja TIDAK ditawarkan di sini, walau tabelnya memuatnya. Sejalan dengan
  // badge "Tahun Kerja" di TopBar: tahun terbuka TERBESAR.
  // ⚠️ Konsekuensi yang DITERIMA: lembar Permendagri untuk tahun yang sudah
  // ditutup tak bisa dibuat dari layar ini. Kalau kelak dibutuhkan (laporan
  // final teraudit memang sering diminta), yang diubah cuma penyaring di bawah
  // — datanya sendiri tetap ada & tab lain masih bisa membacanya lewat
  // "Semua Periode".
  const tahunTerbuka = Object.entries(tahunBuku)
    .filter(([, st]) => st === 'terbuka').map(([t]) => Number(t))
  const tahunKerja = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : new Date().getFullYear()
  const tahunList = [String(tahunKerja)]

  // ── Identitas SKPD baris ────────────────────────────────────────────────
  // `skpd_tujuan` = SKPD PENERIMA barang; terisi 100% di ketiga jenis yang ada
  // datanya (diperiksa ke produksi 2026-09-08).
  // ⚠️ UNIT-nya yang ditampilkan, bukan cuma induk — alasan & pelajarannya sama
  // dgn Laporan Koreksi: dua Bagian di bawah Sekretariat Daerah sama-sama
  // tertulis "Sekretariat Daerah" kalau yang dipakai `rootOf` saja, dan itu
  // persis yang bikin satu kartu "hilang" 2026-09-08. Induk ikut sbg baris
  // kedua, karena nama Bagian/UPTD sering tak menyebut induknya.
  const unitNama = (r: Trx) =>
    r.skpd_tujuan == null ? '(tanpa SKPD)' : (skpdById.get(r.skpd_tujuan)?.nama ?? `SKPD #${r.skpd_tujuan}`)
  const indukNama = (r: Trx) => {
    if (r.skpd_tujuan == null) return ''
    const root = rootOf(r.skpd_tujuan)
    return root && root.id !== r.skpd_tujuan ? root.nama : ''
  }
  const penyediaNama = (r: Trx) => r.header?.nama_penyedia || ''
  const adaPenyedia = PUNYA_PENYEDIA.has(jenis)
  const adaAnggaran = PUNYA_ANGGARAN.has(jenis)

  // ── Sandaran anggaran ────────────────────────────────────────────────────
  const rekKode = (r: Trx) => r.payload?.kode_rekening || ''
  const rekUraian = (r: Trx) => uraianRek.get(rekKode(r)) || ''
  /** `sub_kegiatan` disimpan ProgramPicker sbg "kode — uraian" (satu string). */
  const subKeg = (r: Trx) => splitKodeUraian(r.header?.sub_kegiatan)

  // Uraian belanja untuk baris yang SEDANG tampil. Dipisah dari query utama
  // supaya kegagalannya tak menjatuhkan tabel (lihat catatan `uraianRek`).
  useEffect(() => {
    if (!adaAnggaran) return
    const kode = [...new Set(rows.map(rekKode).filter(Boolean))]
    if (kode.length === 0) { setUraianRek(new Map()); return }
    let hidup = true
    fetchUraianRekening(supabase, kode).then(m => { if (hidup) setUraianRek(m) })
    return () => { hidup = false }
  }, [rows, adaAnggaran]) // eslint-disable-line react-hooks/exhaustive-deps

  // Urut: induk → unit → tanggal terbaru → id. Dipakai layar DAN export supaya
  // berkasnya sama susunannya dgn yang dilihat operator.
  // ⚠️ Pemecah seri `id` WAJIB: satu dokumen berisi banyak barang ber-SKPD &
  // tanggal SAMA, dan tanpa urutan TOTAL isinya bisa bergeser tiap render
  // (`Array.prototype.sort` tak dijamin stabil di semua mesin).
  // ⚠️ Ini TIDAK menggeser baris mana yang tampil: pagu 500 dipasang di QUERY
  // (`.limit(500)` ber-`order('id')`), jadi yang 500 itu tetap "terbaru" —
  // pengurutan ini cuma menata ulang yang sudah tertarik.
  const urutSkpd = (a: Trx, b: Trx) => {
    const ia = indukNama(a) || unitNama(a), ib = indukNama(b) || unitNama(b)
    if (ia !== ib) return ia.localeCompare(ib, 'id')
    const ua = unitNama(a), ub = unitNama(b)
    if (ua !== ub) return ua.localeCompare(ub, 'id')
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1
    return b.id - a.id
  }
  const rowsUrut = [...rows].sort(urutSkpd)
  // ⚠️ DIHITUNG, bukan ditulis tangan. Dulu `pihakLabel ? 11 : 10`, dan angka
  // seperti itu diam-diam meleset begitu ada kolom baru — baris "Tidak ada
  // transaksi" jadi tak selebar tabelnya & tak ada yang gagal.
  const nKolom = 9 + 1 + (pihakLabel ? 1 : 0) + (adaPenyedia ? 1 : 0) + (adaAnggaran ? 2 : 0)

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  // Rekap per SKPD: dikumpulkan per SKPD PERSIS (leaf, bukan root lagi) lalu
  // disusun berjenjang oleh `bangunPohonRekap` (2026-09-10) — dibangun full
  // (tak dibatasi 500 spt daftar transaksi).
  useEffect(() => {
    if (view !== 'matrix' || !skpdLoaded) return
    ;(async () => {
      setMatrixLoading(true); setVoidedErr('')
      try {
      const leaf = new Map<number, LeafRekap>()
      for (let from = 0; ; from += 1000) {
        const { data, error } = await buildQuery().range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        // Disaring PER HALAMAN — daftar aset yang ditanya ikut kecil, jadi
        // biayanya datar berapa pun besar ledgernya.
        for (const r of await saringVoid((data as never as Trx[]))) {
          if (!r.skpd_tujuan) continue
          const nama = skpdById.get(r.skpd_tujuan)?.nama ?? `SKPD #${r.skpd_tujuan}`
          const g = kodeLevel3(r.aset?.kode || '')
          const l = leaf.get(r.skpd_tujuan) ?? { nama, cells: {} }
          const c = (l.cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
          c.perolehan += r.nilai || 0
          leaf.set(r.skpd_tujuan, l)
        }
        if (data.length < 1000) break
      }
      // Akar pohon: admin lihat SEMUA induk (level-1) yang punya data; yang
      // lain cuma lihat SKPD-nya sendiri (berapa pun levelnya) sbg akar.
      const akarIds = isAdmin
        ? [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
        : (myScopeId != null ? [myScopeId] : [])
      setMatrix(bangunPohonRekap(leaf, skpdById, akarIds))
      } catch (e) {
        setVoidedErr(pesanGagal(e as Error)); setMatrix([])
      } finally { setMatrixLoading(false) }
    })()
  }, [view, buildQuery, skpdLoaded, saringVoid, isAdmin, myScopeId, skpdById, rootOf]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExportMatrix() {
    // Seluruh jenjang diratakan (bukan cuma baris teratas) — berkas Excel
    // wajib membawa rinciannya utuh, bukan cuma yang kelihatan sebelum di-expand.
    exportToExcel(ratakanPohon(matrix).map(({ row: r, namaBerindentasi }) => {
      const row: Record<string, unknown> = { SKPD: namaBerindentasi }
      let total = 0
      for (const g of GOLONGAN_REKAP) {
        const v = r.cells[g.kode]?.perolehan || 0
        row[g.uraian] = v
        total += v
      }
      row['Total'] = total
      return row
    }), namaBerkasLaporan({ laporan: filePrefix, periode, skpd: namaSkpd.nama, akhiran: ['per SKPD'] }), 'Rekap per SKPD')
  }

  async function handleExport() {
    setExporting(true); setVoidedErr('')
    // ⚠️ Dulu barisnya disaring dgn `voided?.has(...)`. Optional chaining itu
    // berarti set yang GAGAL dimuat (null) menghasilkan berkas Excel TANPA
    // saringan sama sekali — dan berkas yang sudah terunduh tak punya satu pun
    // tanda bahwa isinya salah. Sekarang kegagalan MEMBATALKAN exportnya.
    const hasil: Trx[] = []
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await buildQuery().range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        hasil.push(...await saringVoid((data as never as Trx[])))
        if (data.length < 1000) break
      }
    } catch (e) {
      setVoidedErr(pesanGagal(e as Error)); setExporting(false); return
    }
    // ⚠️ Dilookup ULANG untuk himpunan EXPORT, bukan memakai `uraianRek` milik
    // layar: layar dibatasi 500 baris terbaru sementara berkas ini memuat
    // SEMUANYA, jadi memakai peta layar akan mengosongkan kolom uraian untuk
    // baris ke-501 dan seterusnya — kekosongan yang di Excel terbaca sbg
    // "rekening ini memang tak punya nama".
    const uraianEx = adaAnggaran
      ? await fetchUraianRekening(supabase, hasil.map(rekKode).filter(Boolean))
      : new Map<string, string>()
    exportToExcel(hasil.sort(urutSkpd).map(r => ({
      // SKPD paling kiri: berkas ini dibaca & dipivot per SKPD.
      'SKPD': unitNama(r),
      'SKPD Induk': indukNama(r),
      ...(pihakLabel ? { [pihakLabel]: r.payload?.pihak || '' } : {}),
      'Kode Barang': r.aset?.kode || '',
      'Uraian Barang': r.aset?.uraian_barang || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'NIBAR': r.aset?.nibar || '',
      'Merk/Tipe': r.aset?.merek_tipe || '',
      'Spesifikasi Lainnya': r.aset?.spesifikasi_lainnya || '',
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
      'Nomor Dokumen Sumber': r.header?.no_sk || '',
      ...(adaPenyedia ? { 'Nama Penyedia': penyediaNama(r) } : {}),
      // Empat kolom TERPISAH di berkas (bukan ditumpuk seperti di layar):
      // berkas kerja dipivot & disortir per kolom, dan kode yang menempel pada
      // uraiannya tak bisa dipakai sbg kunci.
      ...(adaAnggaran ? {
        'Kode Rekening': rekKode(r),
        'Uraian Belanja': uraianEx.get(rekKode(r)) || '',
        'Kode Sub Kegiatan': subKeg(r)[0],
        'Uraian Sub Kegiatan': subKeg(r)[1],
      } : {}),
      'Tanggal Perolehan (BAST)': r.tanggal,
      'Periode': r.periode,
      'Nilai Perolehan (Rp)': r.nilai,
      // aset.keterangan = diisi operator lewat field spesifikasi;
      // transaksi_bmd.keterangan (ledger perolehan) selalu kosong, cadangan saja.
      'Keterangan': r.aset?.keterangan || r.keterangan || '',
    })), namaBerkasLaporan({ laporan: filePrefix, periode, skpd: namaSkpd.nama }), 'Laporan')
    setExporting(false)
  }

  return (
    <div className="p-6">
      {voidedErr && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{voidedErr}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
          <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cetak lembar "Laporan Penerimaan BMD" (format Permendagri).
              ⚠️ WAJIB per-SKPD: kepala lembarnya memuat "<kode> - <nama SKPD>",
              jadi tanpa SKPD terpilih ia akan menghasilkan lembar tanpa
              identitas. Dimatikan berikut ALASANNYA — tombol mati tanpa
              keterangan itu kegagalan senyap: operator menekan, tak terjadi
              apa-apa, dan tak punya cara tahu kenapa. */}
          {view === 'list' && (
            selSkpdId ? (
              <a href={`/cetak/perolehan?jenis=${jenis}&skpd=${selSkpdId}${periode ? `&periode=${periode}` : ''}`}
                target="_blank" rel="noreferrer" className="btn-secondary whitespace-nowrap">
                🖨 Cetak PDF
              </a>
            ) : (
              <span className="btn-secondary opacity-50 cursor-not-allowed whitespace-nowrap"
                title="Pilih SKPD dulu — lembar ini memuat identitas SKPD di kepalanya, jadi hanya sah per-SKPD.">
                🖨 Cetak PDF
              </span>
            )
          )}
          {/* Lembar FORMAT BAKU Permendagri 47/2021 — beda dari "Cetak PDF" di
              sebelahnya, yang lembar ringkas 14 kolom buatan sendiri. Satu
              berkas berisi lima lembar: IV.A.<n>.2 rinci + .3–.6 rekap.
              ⚠️ Hanya untuk cara perolehan yang formatnya sudah dibangun —
              Pengadaan (IV.A.1.2.x) belum, karena masih terkunci keputusan
              biaya atribusi & kaki rekonsiliasi LRA
              (docs/pelaporan-permendagri-plan.md §6). */}
          {view === 'list' && FORMAT_PEROLEHAN[jenis] && (
            selSkpdId ? (
              <a href={`/cetak/perolehan-permendagri?jenis=${jenis}&skpd=${selSkpdId}${periode ? `&periode=${periode}` : ''}`}
                target="_blank" rel="noreferrer" className="btn-secondary whitespace-nowrap"
                title={`Format ${FORMAT_PEROLEHAN[jenis].kode} + rekap ${FORMAT_PEROLEHAN[jenis].awalan}.3–.6 (F4 lanskap)`}>
                🖨 Format {FORMAT_PEROLEHAN[jenis].kode}
              </a>
            ) : (
              <span className="btn-secondary opacity-50 cursor-not-allowed whitespace-nowrap"
                title="Pilih SKPD dulu — kop lembar Permendagri memuat identitas SKPD, jadi hanya sah per-SKPD.">
                🖨 Format {FORMAT_PEROLEHAN[jenis].kode}
              </span>
            )
          )}
          {view !== 'permendagri' && (
            <button onClick={view === 'list' ? handleExport : handleExportMatrix}
              disabled={view === 'list' ? exporting : matrix.length === 0} className="btn-primary">
              {view === 'list' ? (exporting ? 'Mengekspor...' : 'Export Excel') : 'Export Excel'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        <button onClick={() => setView('list')}
          className={`px-4 py-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          Daftar Transaksi
        </button>
        {/* Rekap per SKPD = admin ATAU siapa pun yang punya anak SKPD di
            bawahnya (keputusan user 2026-09-10) — lihat `bolehRekap`. Yang
            tak punya anak tak dapat tab ini sama sekali. */}
        {bolehRekap && (
          <button onClick={() => setView('matrix')}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === 'matrix' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            Rekap per SKPD
          </button>
        )}
        {/* ⚠️ SATU sumber untuk "tab ini ada atau tidak": `lembarPerolehan()`
            (lib/permendagriFormat.ts). `FORMAT_PEROLEHAN` di bawah menjawab
            pertanyaan LAIN — susunan kolom lembarnya — dan tak boleh ikut
            menentukan keberadaan tab, kalau tidak dua daftar bisa menyimpang
            lalu tabnya muncul tanpa isi (atau sebaliknya). */}
        {lembar && (
          <button onClick={() => setView('permendagri')}
            className={`px-4 py-1.5 rounded-md transition-colors ${view === 'permendagri' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            Format Permendagri
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Periode</label>
          <select className="select-filter" value={periode} onChange={e => setPeriode(e.target.value)}>
            <option value="">Semua Periode</option>
            {/* Tiap tahun SELALU menawarkan ketiganya — semester yang belum ada
                transaksinya tetap bisa dipilih & dicetak (hasilnya lembar
                "tidak ada perolehan pada periode ini", yang memang sah).
                ⚠️ "Akhir Tahun" bernilai TAHUN saja (mis. `2026`), bukan string
                kosong — kosong berarti SELURUH periode yang pernah ada, yang
                melintasi tahun lain & membuat kop lembar Permendagri berbohong
                tentang isinya. `periodeDiminta()` yang menerjemahkannya jadi
                S1+S2 tahun itu.
                ⚠️ Semester II = Jul–Des SAJA, tidak kumulatif: ini laporan ARUS,
                dan S2 kumulatif membuat barang Februari tercetak dua kali kalau
                orang mencetak S1 lalu S2. */}
            {tahunList.flatMap(t => [
              <option key={`${t}-S1`} value={`${t}-S1`}>{t} — Semester I</option>,
              <option key={`${t}-S2`} value={`${t}-S2`}>{t} — Semester II</option>,
              <option key={t} value={t}>{t} — Akhir Tahun</option>,
            ])}
          </select>
        </div>
        <div className="min-w-[280px]">
          <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setDescIds(sel.descendantIds); setSelSkpdId(sel.skpdId); namaSkpd.pilih(sel.skpdId) }}
            placeholder="Semua SKPD — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {view === 'permendagri' ? (
        // Pengadaan punya tabelnya sendiri (sudah lama ada); keempat cara
        // perolehan manual memakai penyusun lembar IV.A.<n>.2–10.
        FORMAT_PEROLEHAN[jenis]
          ? <PerolehanFormatPermendagri jenis={jenis} skpdId={selSkpdId} periode={periode} />
          // Lembar Pengadaan kini paham nilai TAHUN (Akhir Tahun) juga — lihat
          // periodeDiminta() di lib/laporanPengadaan.ts (2026-09-09, biar
          // selaras dgn keempat menu perolehan manual lainnya).
          : <LaporanPengadaanPermendagri periode={periode}
              skpdId={selSkpdId} namaSkpd={namaSkpd.nama} descIds={descIds} />
      ) : view === 'matrix' ? (
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={matrixLoading} />
      ) : (
        <>
          <div className="card p-4 mb-4 max-w-xs">
            <p className="text-xs text-gray-500">{judul}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span></p>
            <p className="text-xs text-teal font-medium">{formatRupiah(totalNilai)}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">{rows.length} transaksi (maks. 500 ditampilkan — export untuk semua)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">SKPD</th>
                    {pihakLabel && <th className="table-th">{pihakLabel}</th>}
                    <th className="table-th">Kode Barang</th>
                    <th className="table-th">Spesifikasi Nama Barang / NIBAR</th>
                    <th className="table-th">Merk/Tipe</th>
                    <th className="table-th">Spesifikasi Lainnya</th>
                    <th className="table-th">Komptabel</th>
                    <th className="table-th">No. Dokumen Sumber</th>
                    {adaPenyedia && <th className="table-th">Nama Penyedia</th>}
                    {adaAnggaran && <th className="table-th">Kode Rekening</th>}
                    {adaAnggaran && <th className="table-th">Sub Kegiatan</th>}
                    <th className="table-th">Tgl Perolehan (BAST)</th>
                    <th className="table-th text-right">Nilai Perolehan</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rowsUrut.map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs">
                        <p className="font-medium">{unitNama(r)}</p>
                        {indukNama(r) && <p className="text-gray-400">{indukNama(r)}</p>}
                      </td>
                      {pihakLabel && <td className="table-td text-xs">{r.payload?.pihak || '-'}</td>}
                      <td className="table-td text-xs align-top">
                        <p className="font-medium">{r.aset?.kode || '-'}</p>
                        <p className="text-gray-400 mt-0.5">{r.aset?.uraian_barang || '-'}</p>
                      </td>
                      <td className="table-td text-xs">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs">{r.aset?.merek_tipe || '-'}</td>
                      <td className="table-td text-xs">{r.aset?.spesifikasi_lainnya || '-'}</td>
                      <td className="table-td text-xs">{(r.aset?.intra_ekstra || '-').toUpperCase()}</td>
                      <td className="table-td text-xs">{r.header?.no_sk || '-'}</td>
                      {adaPenyedia && <td className="table-td text-xs">{penyediaNama(r) || '-'}</td>}
                      {adaAnggaran && (
                        <td className="table-td text-xs">
                          <p className="font-medium whitespace-nowrap">{rekKode(r) || '-'}</p>
                          {rekUraian(r) && <p className="text-gray-400">{rekUraian(r)}</p>}
                        </td>
                      )}
                      {adaAnggaran && (
                        <td className="table-td text-xs">
                          <p className="font-medium whitespace-nowrap">{subKeg(r)[0] || '-'}</p>
                          {subKeg(r)[1] && <p className="text-gray-400">{subKeg(r)[1]}</p>}
                        </td>
                      )}
                      <td className="table-td text-xs">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
                      <td className="table-td text-xs text-right">{formatRupiah(r.nilai)}</td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px] truncate">{r.aset?.keterangan || r.keterangan || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
