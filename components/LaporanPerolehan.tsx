'use client'
// Laporan Cara Perolehan (Pengadaan/Hibah/Tukar Menukar/Hasil Inventarisasi/
// Perolehan Lainnya) — kolom detail spesifikasi barang, BEDA dari
// LaporanTransaksi generik (SUDAH DIHAPUS 2026-09-07; dulu dipakai menu spt
// Reklasifikasi/Koreksi yang gak butuh kolom sedetail ini).
//
// Kolom tab "Daftar Transaksi" (standarisasi 2026-09-27, permintaan user —
// disamakan susunannya dgn seluruh menu Pelaporan lain), kiri→kanan: SKPD ·
// Kode Barang+Uraian · Nama Barang+NIBAR · Merk/Tipe · Spesifikasi Lainnya ·
// Luas · [Pihak, kalau ada] · [No Kontrak+Tgl Kontrak (Pengadaan) ATAU No
// Dokumen (keempat manual)] · [No BAST+Tgl BAST+Semester (Pengadaan) ATAU
// Tanggal+Semester (keempat manual)] · [Nama Penyedia, Pengadaan saja] ·
// [Kode Rekening+Uraian, Kode Sub Kegiatan+Uraian, Pengadaan saja] · Nilai
// Perolehan+Komptabel · Keterangan.
// ⚠️ Pengadaan BEDA STRUKTUR dari keempat manual — Pengadaan py DUA dokumen
// (kontrak & BAST, `PUNYA_KONTRAK`/`adaKontrak`), keempat manual cuma py SATU
// (No/Tgl Dokumen). Jangan disamakan jadi satu kolom generik.
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel, formatRupiah2 } from '@/lib/export'
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
import { muatTerminKdp } from '@/lib/laporanKdpTrx'

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
  /**
   * ⚠️ `tanggal`/`no_bast` di HEADER — HANYA berarti sesuatu utk `pengadaan`.
   * Di sana `jurnal_header.no_sk`/`tanggal` = No/Tgl KONTRAK (beda dari BAST),
   * sementara `payload.no_bast` = Nomor BAST-nya sendiri (`tgl_bast` TIDAK
   * ikut ditarik — `r.tanggal` di baris ledger inilah tanggal BAST EFEKTIF,
   * `perolehanDate = payload.tgl_bast || tanggal` yang sudah dibekukan saat
   * approve, jadi tak perlu field kedua). Keempat menu manual (Hibah dkk)
   * cuma py SATU dokumen (`no_sk`/`tanggal` di header = No/Tgl Dokumen itu
   * sendiri) — `no_bast` di sana selalu kosong, jangan dibaca.
   */
  header: { no_sk: string; tanggal: string; nama_penyedia: string | null; sub_kegiatan: string | null; no_bast: string | null } | null
  skpd_tujuan: number | null
  aset_id: string | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    merek_tipe: string | null; spesifikasi_lainnya: string | null; intra_ekstra: string | null; status: string
    luas: number | string | null
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

/**
 * Cara perolehan yang membedakan KONTRAK dari BAST — cuma `pengadaan`.
 * Keempat menu manual (Hibah dkk) cuma py SATU dokumen (No/Tgl Dokumen di
 * header), jadi kolom dokumennya cuma SATU pasang, bukan dua.
 */
const PUNYA_KONTRAK = new Set(['pengadaan'])
/** Baris per halaman TAMPILAN tab Daftar Transaksi (data tetap dimuat semua). */
const PER_HAL = 200

/** Label kolom tanggal dokumen — permintaan user 2026-09-27, beda per jenis
 *  (Hibah menyebut "BAST", tiga lainnya "Dokumen") padahal field sumbernya
 *  sama (`r.tanggal`/`r.periode`). Cuma label, bukan sumber data kedua. */
const labelTglDokumen = (jenis: string) => jenis === 'hibah_masuk' ? 'Tanggal BAST' : 'Tanggal Dokumen'

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
  // Paginasi TAMPILAN saja (2026-09-27) — barisnya sudah dimuat SEMUA, yang
  // dipotong cuma berapa yang dirender sekaligus supaya DOM tetap ringan.
  const [hal, setHal] = useState(0)

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
  //
  // ⚠️ HANYA aset yang statusnya BUKAN `aktif` yang ditanyakan (2026-09-27).
  // Tiap jalan menuju "void" menonaktifkan asetnya: `batal_*` cara perolehan
  // me-soft-delete (`dihapus`), Buka Kunci mengembalikannya ke `draft`,
  // `koreksi_pencatatan_ganda` → `dihapus`; dan satu-satunya jalan balik
  // (`batal_koreksi_pencatatan_ganda`) menghidupkannya lagi sekaligus
  // meng-un-void-nya. Jadi aset `aktif` PASTI tak ter-void, dan menanyakan
  // ribuan aset aktif per 200 cuma menambah permintaan yang — di mesin DB yang
  // sedang sesak — membuat Laporan Pengadaan tertahan "Memuat data..." dgn
  // permintaan pemeriksaan pembatalan yang tak kunjung pulang.
  // Aset yang tak terbaca (`aset` null) tetap ditanyakan — fail-closed.
  const saringVoid = useCallback(async <T extends { aset_id: string | null; aset: { status: string } | null }>(
    baris: T[],
  ): Promise<T[]> => {
    const perluDicek = baris.filter(r => r.aset_id && r.aset?.status !== 'aktif')
      .map(r => r.aset_id as string)
    if (perluDicek.length === 0) return baris
    const voided = await fetchVoidedAsetIds(supabase, [], perluDicek)
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
      .select('id,periode,tanggal,nilai,keterangan,payload,skpd_tujuan,aset_id,' +
        'header:header_id(no_sk,tanggal,nama_penyedia:payload->>nama_penyedia,sub_kegiatan:payload->>sub_kegiatan,no_bast:payload->>no_bast),' +
        'aset:aset_id(kode,uraian_barang,nama_barang,nibar,merek_tipe,spesifikasi_lainnya,intra_ekstra,status,luas,keterangan)')
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

  // ⚠️ SELURUH baris ditarik, TIDAK dipotong 500 lagi (2026-09-27). Pagu lama
  // `.limit(500)` membuat Laporan Hibah menampilkan 498 transaksi / Rp2,9 M
  // sementara Dashboard 1.247 barang / Rp333,7 M — kartu totalnya menjumlah
  // potongan, jadi angkanya salah tanpa terlihat terpotong. Keyset
  // (`.lt('id', terakhir)`, urut id turun) dilayani `idx_trx_perolehan_id`,
  // biayanya rata di halaman ke berapa pun (CLAUDE.md, aturan kolektor).
  // Hasilnya dipakai BERSAMA tab Daftar Transaksi, Rekap per SKPD, & Export —
  // satu tarikan, jadi ketiganya mustahil beda angka.
  useEffect(() => {
    let batal = false
    ;(async () => {
      setLoading(true); setVoidedErr(''); setHal(0)
      try {
        const semua: Trx[] = []
        let terakhir: number | null = null
        for (;;) {
          let q = buildQuery()
          if (terakhir != null) q = q.lt('id', terakhir)
          // `error` WAJIB dibaca: `const { data } = await` bikin query yang
          // gagal terbaca sebagai "datanya memang kosong".
          const { data, error } = await q.limit(1000)
          if (error) throw new Error(error.message)
          const baris = (data as never as Trx[]) || []
          if (baris.length === 0) break
          semua.push(...baris)
          terakhir = baris[baris.length - 1].id
          if (batal) return
          if (baris.length < 1000) break
        }
        const hidup = await saringVoid(semua)
        // Pengadaan juga memuat barang KDP (Pekerjaan Konstruksi) — satu baris
        // per barang, sama dgn tab Format Permendagri. Gagal membaca = laporan
        // DITOLAK (fail-closed), bukan tampil tanpa KDP. Lihat lib/laporanKdpTrx.ts.
        const kdp = jenis === 'pengadaan' ? await muatTerminKdp(supabase, { periode, descIds }) : []
        if (!batal) setRows([...hidup, ...kdp])
      } catch (e) {
        // Fail-closed (CLAUDE.md): modul pelaporan lebih baik menolak tampil
        // daripada menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setVoidedErr(pesanGagal(e as Error)); setRows([]) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan tabel "Memuat data..." SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
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
  const adaKontrak = PUNYA_KONTRAK.has(jenis)
  const labelTgl = labelTglDokumen(jenis)

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
  const urutSkpd = (a: Trx, b: Trx) => {
    const ia = indukNama(a) || unitNama(a), ib = indukNama(b) || unitNama(b)
    if (ia !== ib) return ia.localeCompare(ib, 'id')
    const ua = unitNama(a), ub = unitNama(b)
    if (ua !== ub) return ua.localeCompare(ub, 'id')
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1
    return b.id - a.id
  }
  const rowsUrut = useMemo(() => [...rows].sort(urutSkpd), [rows, skpdById]) // eslint-disable-line react-hooks/exhaustive-deps
  const nHal = Math.max(1, Math.ceil(rowsUrut.length / PER_HAL))
  // ⚠️ DIHITUNG, bukan ditulis tangan. Dulu `pihakLabel ? 11 : 10`, dan angka
  // seperti itu diam-diam meleset begitu ada kolom baru — baris "Tidak ada
  // transaksi" jadi tak selebar tabelnya & tak ada yang gagal.
  // Basis (2026-09-27, kolom disamakan lintas menu Cara Perolehan): SKPD ·
  // Kode Barang/Uraian · Nama Barang/NIBAR · Merk/Tipe · Spesifikasi Lainnya ·
  // Luas · [No Kontrak/Tgl Kontrak +] No Dokumen/Tgl+Semester (2 kolom, isi
  // beda per adaKontrak) · Nilai Perolehan/Komptabel · Keterangan = 10.
  const nKolom = 10 + (pihakLabel ? 1 : 0) + (adaPenyedia ? 1 : 0) + (adaAnggaran ? 2 : 0)

  const totalNilai = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  // Rekap per SKPD: dikumpulkan per SKPD PERSIS (leaf, bukan root lagi) lalu
  // disusun berjenjang oleh `bangunPohonRekap` (2026-09-10). Sejak 2026-09-27
  // DITURUNKAN dari `rows` yang sudah dimuat (seluruhnya) — dulu ia menarik
  // ulang lewat OFFSET, dua jalur untuk angka yang sama.
  const matrix: MatrixRow[] = useMemo(() => {
    if (!skpdLoaded) return []
    const leaf = new Map<number, LeafRekap>()
    for (const r of rows) {
      if (!r.skpd_tujuan) continue
      const nama = skpdById.get(r.skpd_tujuan)?.nama ?? `SKPD #${r.skpd_tujuan}`
      const g = kodeLevel3(r.aset?.kode || '')
      const l = leaf.get(r.skpd_tujuan) ?? { nama, cells: {} }
      const c = (l.cells[g] ??= { perolehan: 0, akumulasi: 0, beban: 0, nilaiBuku: 0 })
      c.perolehan += r.nilai || 0
      leaf.set(r.skpd_tujuan, l)
    }
    // Akar pohon: admin lihat SEMUA induk (level-1) yang punya data; yang
    // lain cuma lihat SKPD-nya sendiri (berapa pun levelnya) sbg akar.
    const akarIds = isAdmin
      ? [...new Set([...leaf.keys()].map(id => rootOf(id)?.id ?? id))]
      : (myScopeId != null ? [myScopeId] : [])
    return bangunPohonRekap(leaf, skpdById, akarIds)
  }, [rows, skpdLoaded, isAdmin, myScopeId, skpdById, rootOf])

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
    if (loading || voidedErr) return
    setExporting(true)
    // Sejak 2026-09-27 layar memuat SELURUH baris (sudah tersaring void), jadi
    // export memakai baris yang SAMA — tak ada tarikan kedua yang bisa
    // menghasilkan berkas berbeda dari yang tampil. Kegagalan memuat sudah
    // ditolak di loader (tombolnya mati selama `loading`/ada error).
    const hasil: Trx[] = [...rows]
    // Uraian belanja dilookup sekali lagi supaya berkas tak bergantung pada
    // efek layar yang mungkin belum selesai saat tombol ditekan.
    const uraianEx = adaAnggaran
      ? await fetchUraianRekening(supabase, hasil.map(rekKode).filter(Boolean))
      : new Map<string, string>()
    // Susunan kolom disamakan dgn layar (2026-09-27, standarisasi Daftar
    // Transaksi lintas menu Pelaporan) — sel tumpuk di layar jadi kolom
    // TERPISAH di sini: berkas kerja dipivot & disortir per kolom, dan kode
    // yang menempel pada uraiannya tak bisa dipakai sbg kunci.
    exportToExcel(hasil.sort(urutSkpd).map(r => ({
      // SKPD paling kiri: berkas ini dibaca & dipivot per SKPD.
      'SKPD': unitNama(r),
      'SKPD Induk': indukNama(r),
      'Kode Barang': r.aset?.kode || '',
      'Uraian Barang': r.aset?.uraian_barang || '',
      'Spesifikasi Nama Barang': r.aset?.nama_barang || '',
      'NIBAR': r.aset?.nibar || '',
      'Merk/Tipe': r.aset?.merek_tipe || '',
      'Spesifikasi Lainnya': r.aset?.spesifikasi_lainnya || '',
      'Luas': r.aset?.luas ?? '',
      ...(pihakLabel ? { [pihakLabel]: r.payload?.pihak || '' } : {}),
      ...(adaKontrak
        ? { 'No Kontrak': r.header?.no_sk || '', 'Tanggal Kontrak': r.header?.tanggal || '' }
        : { 'No Dokumen': r.header?.no_sk || '' }),
      ...(adaKontrak
        ? { 'No BAST': r.header?.no_bast || '' }
        : {}),
      [adaKontrak ? 'Tanggal BAST' : labelTgl]: r.tanggal,
      'Semester': r.periode,
      ...(adaPenyedia ? { 'Nama Penyedia': penyediaNama(r) } : {}),
      ...(adaAnggaran ? {
        'Kode Rekening': rekKode(r),
        'Uraian Belanja': uraianEx.get(rekKode(r)) || '',
        'Kode Sub Kegiatan': subKeg(r)[0],
        'Uraian Sub Kegiatan': subKeg(r)[1],
      } : {}),
      'Nilai Perolehan (Rp)': r.nilai,
      'Komptabel': (r.aset?.intra_ekstra || '').toUpperCase(),
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
              disabled={view === 'list' ? (exporting || loading || !!voidedErr) : matrix.length === 0} className="btn-primary">
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
        <RekapMatrixTable rows={matrix} golongan={GOLONGAN_REKAP} metric="perolehan" loading={loading} />
      ) : (
        <>
          <div className="card p-4 mb-4 max-w-xs">
            <p className="text-xs text-gray-500">{judul}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{rows.length.toLocaleString('id-ID')} <span className="text-xs font-normal text-gray-400">transaksi</span></p>
            <p className="text-xs text-teal font-medium">{formatRupiah2(totalNilai)}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">{rows.length.toLocaleString('id-ID')} transaksi</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">SKPD</th>
                    <th className="table-th">Kode Barang / Uraian Barang</th>
                    <th className="table-th">Nama Barang / NIBAR</th>
                    <th className="table-th">Merk/Tipe</th>
                    <th className="table-th">Spesifikasi Lainnya</th>
                    <th className="table-th text-right">Luas</th>
                    {pihakLabel && <th className="table-th">{pihakLabel}</th>}
                    {adaKontrak
                      ? <th className="table-th">No Kontrak / Tgl Kontrak</th>
                      : <th className="table-th">No Dokumen</th>}
                    {adaKontrak
                      ? <th className="table-th">No BAST / Tgl BAST / Semester</th>
                      : <th className="table-th">{labelTgl} / Semester</th>}
                    {adaPenyedia && <th className="table-th">Nama Penyedia</th>}
                    {adaAnggaran && <th className="table-th">Kode Rekening Belanja / Uraian</th>}
                    {adaAnggaran && <th className="table-th">Kode Sub Kegiatan / Uraian</th>}
                    <th className="table-th text-right">Nilai Perolehan / Komptabel</th>
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">Memuat data...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={nKolom} className="table-td text-center py-12 text-gray-400">Tidak ada transaksi</td></tr>
                  ) : rowsUrut.slice(hal * PER_HAL, (hal + 1) * PER_HAL).map(r => (
                    <tr key={r.id}>
                      <td className="table-td text-xs align-top">
                        <p className="font-medium">{unitNama(r)}</p>
                        {indukNama(r) && <p className="text-gray-400">{indukNama(r)}</p>}
                      </td>
                      <td className="table-td text-xs align-top">
                        <p className="font-medium">{r.aset?.kode || '-'}</p>
                        <p className="text-gray-400 mt-0.5">{r.aset?.uraian_barang || '-'}</p>
                      </td>
                      <td className="table-td text-xs align-top">
                        <p className="font-medium">{r.aset?.nama_barang || '-'}</p>
                        <p className="text-gray-400">{r.aset?.nibar || '-'}</p>
                      </td>
                      <td className="table-td text-xs align-top">{r.aset?.merek_tipe || '-'}</td>
                      <td className="table-td text-xs align-top">{r.aset?.spesifikasi_lainnya || '-'}</td>
                      <td className="table-td text-xs text-right align-top">{r.aset?.luas ?? '-'}</td>
                      {pihakLabel && <td className="table-td text-xs align-top">{r.payload?.pihak || '-'}</td>}
                      {adaKontrak ? (
                        <td className="table-td text-xs align-top">
                          <p className="font-medium">{r.header?.no_sk || '-'}</p>
                          <p className="text-gray-400">{r.header?.tanggal || '-'}</p>
                        </td>
                      ) : (
                        <td className="table-td text-xs align-top">{r.header?.no_sk || '-'}</td>
                      )}
                      {adaKontrak ? (
                        <td className="table-td text-xs align-top">
                          <p className="font-medium">{r.header?.no_bast || '-'}</p>
                          <p className="text-gray-400">{r.tanggal}</p>
                          <p className="text-gray-400">{r.periode}</p>
                        </td>
                      ) : (
                        <td className="table-td text-xs align-top">{r.tanggal}<br /><span className="text-gray-400">{r.periode}</span></td>
                      )}
                      {adaPenyedia && <td className="table-td text-xs align-top">{penyediaNama(r) || '-'}</td>}
                      {adaAnggaran && (
                        <td className="table-td text-xs align-top">
                          <p className="font-medium whitespace-nowrap">{rekKode(r) || '-'}</p>
                          {rekUraian(r) && <p className="text-gray-400">{rekUraian(r)}</p>}
                        </td>
                      )}
                      {adaAnggaran && (
                        <td className="table-td text-xs align-top">
                          <p className="font-medium whitespace-nowrap">{subKeg(r)[0] || '-'}</p>
                          {subKeg(r)[1] && <p className="text-gray-400">{subKeg(r)[1]}</p>}
                        </td>
                      )}
                      <td className="table-td text-xs text-right align-top">
                        <p className="font-medium">{formatRupiah2(r.nilai)}</p>
                        <p className="text-gray-400">{(r.aset?.intra_ekstra || '-').toUpperCase()}</p>
                      </td>
                      <td className="table-td text-xs text-gray-500 max-w-[200px] truncate align-top">{r.aset?.keterangan || r.keterangan || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Paginasi TAMPILAN — seluruh baris sudah dimuat & dijumlah di
                kartu atas; yang dipecah cuma perendaran tabelnya. */}
            {!loading && nHal > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>
                  Baris {(hal * PER_HAL + 1).toLocaleString('id-ID')}–{Math.min((hal + 1) * PER_HAL, rowsUrut.length).toLocaleString('id-ID')} dari {rowsUrut.length.toLocaleString('id-ID')}
                </span>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary" disabled={hal === 0} onClick={() => setHal(h => h - 1)}>← Sebelumnya</button>
                  <span>{hal + 1} / {nHal}</span>
                  <button className="btn-secondary" disabled={hal >= nHal - 1} onClick={() => setHal(h => h + 1)}>Berikutnya →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
