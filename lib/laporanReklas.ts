// ============================================================================
// Pemuat data menu & lembar REKLASIFIKASI — keluarga Permendagri IV.F.
//
// Dipakai BERSAMA oleh KETIGA tab menu Pelaporan → Pengelolaan → Reklasifikasi
// (Daftar Transaksi · Rekap per SKPD · Format Permendagri) DAN halaman cetak
// /cetak/reklas-permendagri.
//
// ⚠️ SATU PEMUAT UNTUK KETIGA TAB, dan itu keputusan sadar — beda dari keluarga
// perpindahan yang tab 1-nya punya query sendiri. Di sana bedanya memang nyata
// (tab 1 netral arah, tab 3 satu sisi saja). Di sini `arah` TIDAK mengubah
// baris mana yang ditarik sama sekali — satu baris reklas adalah penambahan di
// kode tujuan DAN pengurangan di kode asal — jadi dua query berarti dua jalan
// menuju angka yang sama, yang di repo ini selalu berakhir menyimpang diam-diam.
// Yang diubah `arah` cuma KODE MANA yang jadi kunci pengelompokan.
//
// ⚠️ SKPD DISARING DI MEMORI, bukan di query — dan itu terpaksa, bukan malas:
// baris reklasifikasi **tidak punya `skpd_asal`/`skpd_tujuan`** (barangnya tak
// berpindah SKPD, cuma berganti kodefikasi). Satu-satunya penunjuk SKPD-nya
// `aset.skpd_id`, dan menyaringnya di server butuh `aset!inner` +
// `.in('aset.skpd_id', <694 id untuk Dinas Pendidikan>)` — bentuk yang justru
// sudah berkali-kali jadi sebab timeout di repo ini.
//   ⚠️ Ini juga MEMPERBAIKI cacat lama: menu versi `LaporanTransaksi` menyaring
//   `skpd_asal.in.(…),skpd_tujuan.in.(…)` yang di ledger reklas SELALU NULL,
//   jadi memilih SKPD di sana menghasilkan **0 transaksi** yang kelihatan sah.
//
// ⚠️ Aman disaring di memori HANYA karena ledger reklas kecil (ratusan baris,
// bukan ratusan ribu). Supaya asumsi itu tak berubah diam-diam, sapuannya
// keyset & **MELEMPAR** kalau menembus `BATAS_SAPU` — bukan diam-diam memotong.
// Lembar bertanda tangan yang kurang baris jauh lebih mahal daripada halaman
// yang menolak tampil.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR, tak ada
// yang ditelan jadi "datanya memang kosong". Pemanggil menampilkan pesannya dan
// MENOLAK menyusun lembar.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { fetchPenyusutanAset } from '@/lib/rekon'
import { fetchReklasEvents, kodePada } from '@/lib/reklasKode'
import { petaNamaTingkat, sebutanPejabat, levelSkpd, type BarisKodefikasi } from '@/lib/formatPermendagri'
import { ALASAN_LABEL, JENIS_REKLAS, type AlasanReklas } from '@/lib/reklas'
import { sisiReklas, type ArahReklas } from '@/lib/formatReklas'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

/**
 * Pagu sapuan ledger reklasifikasi.
 *
 * Bukan paginasi tampilan — ini pengaman asumsi "ledger reklas kecil" yang jadi
 * dasar penyaringan SKPD di memori. Menembusnya berarti asumsinya sudah tak
 * berlaku dan penyaringannya harus dipindah ke server (lihat kepala berkas),
 * jadi yang benar MELEMPAR, bukan memotong.
 */
const BATAS_SAPU = 20000

export type BarisReklas = {
  id: number
  tanggal: string
  periode: string
  nilai: number
  keterangan: string | null
  aset_id: string | null
  jenis: string
  payload: {
    kode_lama?: string; kode_baru?: string
    intra_ekstra_lama?: string; intra_ekstra?: string
    nama_lama?: string; nama_baru?: string
  } | null
  header: {
    no_sk: string | null; tanggal: string | null
    jenis: string | null; keterangan: string | null; skpd_id: number | null
  } | null
  aset: {
    kode: string; nama_barang: string | null; uraian_barang: string | null; nibar: string | null
    satuan: string | null; jumlah: number | null
    keterangan: string | null; intra_ekstra: string | null; skpd_id: number | null
  } | null

  // ── Dilengkapi sesudah query ────────────────────────────────────────────
  /**
   * Kode barang yang jadi KUNCI PENGELOMPOKAN lembar ini — `kode_baru` untuk
   * penambahan, `kode_lama` untuk pengurangan.
   *
   * ⚠️ Sengaja BUKAN `aset.kode`: kolom itu memuat posisi TERAKHIR barang, jadi
   * barang yang direklas dua kali akan dibukukan di golongan reklas TERBARU-nya
   * di lembar periode lampau — persis cacat yang sudah ditutup untuk baris
   * mutasi Rekonsiliasi 2026-08-27.
   */
  kodeUtama: string
  /** Kode barang di sisi LAWAN — isi blok "Reklasifikasi dari"/"…ke". */
  kodeLawan: string
  /**
   * Kode SEBELUM & SESUDAH reklas, apa adanya menurut ledger — TIDAK ikut
   * `arah`.
   *
   * ⚠️ Sengaja berdampingan dengan `kodeUtama`/`kodeLawan` yang justru ikut
   * arah. Tab "Daftar Transaksi" menjawab "sebelumnya apa, lalu jadi apa"
   * (permintaan user 2026-09-07) dan pertanyaan itu punya SATU jawaban entah
   * lembarnya penambahan atau pengurangan; menukarnya mengikuti arah membuat
   * panah di layar menunjuk terbalik separuh waktu. Untuk `reklas_komptabel`
   * keduanya SAMA — yang berpindah keranjang komptabelnya, bukan kodenya.
   */
  kodeLama: string
  kodeBaru: string
  /** Label alasan (kolom "Penyebab Reklasifikasi"), dari `jurnal_header.jenis`. */
  penyebab: string
  /**
   * Spesifikasi Nama Barang di sisi yang dilaporkan.
   *
   * ⚠️ Diputuskan DI SINI, bukan di penyaji. Reklas boleh sekalian mengganti
   * nama barang (`payload.nama_lama`/`nama_baru`), jadi lembar penambahan wajib
   * memuat nama SESUDAH & lembar pengurangan nama SEBELUM. Kalau pilihan itu
   * ditaruh di penyaji, penyaji jadi harus tahu sedang merender sisi yang mana —
   * dan begitu ia tahu, cabang berikutnya akan menyusul sampai berkasnya tak
   * terbaca (dikunci lib/formatReklas.test.ts "TIDAK bercabang per format").
   */
  namaSpek: string
  /** Nama SKPD pemilik barang. Dipakai tab Daftar Transaksi & Rekap per SKPD. */
  skpdNama?: string
  /** Posisi penyusutan akhir periode — kolom Akumulasi & Nilai Buku. */
  akumulasi?: number
  nilaiBuku?: number
  /**
   * `true` kalau posisi penyusutannya TIDAK ketemu di `penyusutan_semester`.
   * Sengaja dibedakan dari nol: nol berarti "memang belum tersusut", tak-ketemu
   * berarti "engine belum dijalankan untuk periode ini" — dan di lembar
   * bertanda tangan kedua keadaan itu tak boleh terlihat sama.
   */
  tanpaPenyusutan?: boolean
}

const SEL =
  'id,tanggal,periode,nilai,keterangan,aset_id,jenis,payload,'
  + 'header:header_id(no_sk,tanggal,jenis,keterangan,skpd_id),'
  + 'aset:aset_id(kode,nama_barang,uraian_barang,nibar,satuan,jumlah,'
  + 'keterangan,intra_ekstra,skpd_id)'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanReklas = {
  /** Sisi yang didaftar — dari `FORMAT_REKLAS[<cabang>].arah`. */
  arah: ArahReklas
  /** SKPD yang jadi sudut pandang. `null` = se-kabupaten (hanya untuk tab 1 & 2). */
  skpdId: number | null
  /** `'2026-S1'` atau `'2026'` (AKHIR TAHUN = S1+S2). Kosong = seluruh periode. */
  periode: string
}

export type HasilReklas = {
  rows: BarisReklas[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  /** Sebutan pejabat penanda tangan, diturunkan dari LEVEL node SKPD. */
  sebutan: string
  /** Seluruh SKPD (dipakai pemanggil untuk mencari calon penanda tangan). */
  semuaSkpd: SkpdRow[]
  /**
   * Barang yang belum punya baris `penyusutan_semester` pada periode itu.
   * Bukan error — lembarnya tetap terbit — tapi WAJIB dikatakan di layar, kalau
   * tidak kolom Akumulasi & Nilai Buku yang kosong terbaca sebagai "memang nol".
   */
  tanpaPenyusutan: number
}

/**
 * Periode `penyusutan_semester` yang dipakai mengisi kolom Akumulasi & Nilai
 * Buku.
 *
 * ⚠️ Untuk "Akhir Tahun" (`'2026'`) jawabannya **`2026-S2`**, bukan S1: kolom
 * itu POSISI (saldo per akhir periode), sedangkan daftar barangnya ARUS
 * (peristiwa sepanjang tahun). Memakai S1 akan mencetak posisi pertengahan
 * tahun di lembar yang berjudul AKHIR TAHUN — angka yang tampak sah & tak akan
 * pernah ditolak siapa pun. Kembar dgn `periodePosisi` di lib/laporanPerpindahan.ts.
 */
export function periodePosisiReklas(periode: string): string {
  const per = periodeDiminta(periode)
  if (per.length === 0) return ''
  return per[per.length - 1]
}

async function semuaSkpdRows(supabase: SupabaseClient): Promise<SkpdRow[]> {
  const out: SkpdRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('admin_skpd')
      .select('id,parent_id,nama,kode_skpd').range(from, from + 999)
    if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as SkpdRow[]))
    if (data.length < 1000) break
  }
  return out
}

/**
 * Sapu baris ledger reklasifikasi untuk periode yang diminta.
 *
 * ⚠️ Keyset (`.gt('id', terakhir)` + `.order('id')`), BUKAN `.range()`/OFFSET:
 * tiga cacat yang di repo ini selalu berpasangan & ketiganya bikin angka salah
 * TANPA SUARA (CLAUDE.md). Urutan `id` juga yang menentukan index mana yang
 * sanggup melayani — `jenis` bertipe ENUM tak pernah bisa jadi index-cond di
 * bawah RLS, jadi bentuk ini sengaja dibuat agar dilayani partial index
 * `idx_trx_reklas_id` (migrasi 20260826_01), yang predikatnya memuat tepat
 * ketiga jenis di `JENIS_REKLAS` + `batal_reklas`.
 */
async function sapuBaris(supabase: SupabaseClient, periode: string): Promise<BarisReklas[]> {
  const per = periodeDiminta(periode)
  const out: BarisReklas[] = []
  let terakhir = 0
  for (;;) {
    let q = supabase.from('transaksi_bmd').select(SEL)
      .in('jenis', JENIS_REKLAS as never)
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    const { data, error } = await q
    if (error) throw new Error(`gagal membaca transaksi reklasifikasi: ${error.message}`)
    const baris = (data as never as BarisReklas[]) || []
    if (baris.length === 0) break
    out.push(...baris)
    terakhir = baris[baris.length - 1].id
    if (out.length > BATAS_SAPU) {
      throw new Error(
        `ledger reklasifikasi melebihi ${BATAS_SAPU.toLocaleString('id-ID')} baris untuk periode ini. `
        + 'Penyaringan SKPD menu ini dilakukan di memori (baris reklas tak punya kolom SKPD), '
        + 'jadi angkanya TIDAK ditampilkan daripada dipotong diam-diam — '
        + 'pindahkan penyaringannya ke server dulu (lihat kepala lib/laporanReklas.ts).')
    }
    if (baris.length < 1000) break
  }
  return out
}

/**
 * Muat baris lembar reklasifikasi dari sisi `arah`.
 *
 * ⚠️ **`arah` TIDAK menyaring baris** — ia menentukan kode mana yang jadi kunci
 * pengelompokan (`kodeUtama`) dan kode mana yang masuk blok lawan. Satu reklas
 * adalah penambahan di kode tujuan DAN pengurangan di kode asal; keduanya
 * peristiwa yang sama dilihat dari sisi berbeda. Lihat kepala lib/formatReklas.ts.
 *
 * ⚠️ `reklas_komptabel` IKUT, dan payloadnya memang tak punya `kode_lama`/
 * `kode_baru` — barangnya tak berpindah kodefikasi, yang berpindah keranjang
 * komptabelnya. Untuk baris itu `kodeUtama === kodeLawan`, dan yang menjelaskan
 * peristiwanya kolom "Penyebab Reklasifikasi" ("Ekstra → Intra Komptabel").
 * Membuangnya akan menghilangkan penambahan yang SUNGGUHAN dari lembar
 * INTRAKOMPTABEL — kop lembar ini menyatakan satu keranjang, dan barang yang
 * baru masuk keranjang itu memang bertambah di sana. Yang memisahkannya ke
 * lembar yang benar penyaring Komptabel di pemanggil.
 */
export async function muatLaporanReklas(
  supabase: SupabaseClient, p: PermintaanReklas,
): Promise<HasilReklas> {
  const semua = await semuaSkpdRows(supabase)
  let ini: SkpdRow | undefined
  let desc: number[] | null = null
  if (p.skpdId != null) {
    ini = semua.find(x => x.id === p.skpdId)
    if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
    desc = descendantsOf(semua, p.skpdId)
  }

  // Riwayat reklas SELURUH periode (bukan cuma yang diminta) — dibutuhkan untuk
  // menilai kode barang PADA SAAT transaksi, lihat `kodePada`. Sengaja memakai
  // `fetchReklasEvents` yang sudah ada, bukan menurunkannya dari sapuan di bawah:
  // sapuan itu dibatasi periode, dan reklas yang terjadi SESUDAH periode yang
  // dilihat justru yang membuktikan `aset.kode` sekarang bukan kode saat itu.
  const [mentah, reklasEv] = await Promise.all([
    sapuBaris(supabase, p.periode),
    fetchReklasEvents(supabase),
  ])

  const punyaAset = mentah.filter(r => r.aset)
  const dalamScope = desc
    ? punyaAset.filter(r => r.aset!.skpd_id != null && desc!.includes(r.aset!.skpd_id))
    : punyaAset

  // Reklas yang sudah DIBATALKAN (`batal_reklas`) dibuang. Tanpa ini barang yang
  // reklasnya dianggap tak pernah terjadi tetap tampil sebagai penambahan sah —
  // dan Daftar Barang, Penyusutan, serta Rekonsiliasi sudah membuangnya, jadi
  // lembar ini akan berbeda dari semuanya.
  // ⚠️ Terscope ke aset yang memang ditanya (`aset_id IN (…)`), bukan menyapu
  // seluruh ledger — pola `fetchVoidedAsetIds` terscope (CLAUDE.md).
  const dibatalkan = await fetchBatalTargets(
    supabase, BATAL_TARGET_JENIS.reklasifikasi,
    dalamScope.map(r => r.aset_id).filter((x): x is string => !!x))
  const hidup = dalamScope.filter(r => !dibatalkan.has(r.id))

  const namaSkpd = new Map(semua.map(s => [s.id, s.nama]))
  const berkode = hidup.map(r => {
    const a = r.aset!
    // Baris kode-bergeser membawa kedua kodenya di payload; baris komptabel tak
    // punya keduanya → kode SAAT ITU dari replay ledger, bukan `aset.kode` yang
    // memuat posisi terakhir.
    const kodeSaatItu = kodePada(reklasEv, r.aset_id || '', r.periode, r.id, a.kode || '')
    const kodeLama = typeof r.payload?.kode_lama === 'string' ? r.payload.kode_lama : kodeSaatItu
    const kodeBaru = typeof r.payload?.kode_baru === 'string' ? r.payload.kode_baru : kodeSaatItu
    // ⚠️ Pemetaan sisi → `sisiReklas()` (lib/formatReklas.ts), BUKAN ditulis
    // di sini. Ia aturan inti keluarga IV.F dan satu-satunya yang kalau
    // tertukar tetap menghasilkan lembar yang terisi penuh & foot dengan benar.
    // Dikunci lib/formatReklas.test.ts.
    return {
      ...r,
      ...sisiReklas(p.arah, {
        kodeLama, kodeBaru,
        namaLama: r.payload?.nama_lama, namaBaru: r.payload?.nama_baru,
        namaAset: a.nama_barang,
      }),
      kodeLama,
      kodeBaru,
      penyebab: ALASAN_LABEL[(r.header?.jenis || '') as AlasanReklas] || '',
      skpdNama: a.skpd_id != null ? namaSkpd.get(a.skpd_id) : undefined,
    }
  })

  // Posisi penyusutan akhir periode — aturan "golongan tak disusutkan → beban &
  // akumulasi 0, nilai buku = nilai perolehan" ikut `fetchPenyusutanAset`
  // (lib/rekon.ts), BUKAN ditulis ulang di sini: itu aturan yang sama yang
  // dipakai Rekonsiliasi & drill-down-nya, dan dua salinannya akan menyimpang.
  // ⚠️ Kode yang dioper `kodeUtama` (golongan SESUDAH reklas untuk lembar
  // penambahan) — itu yang menentukan barangnya disusutkan atau tidak. Memakai
  // `aset.kode` akan salah untuk barang yang direklas lagi sesudahnya.
  const posPeriode = periodePosisiReklas(p.periode)
  const pos = posPeriode
    ? await fetchPenyusutanAset(
      supabase,
      berkode.filter(r => r.aset_id).map(r => ({ aset_id: r.aset_id!, kode: r.kodeUtama })),
      posPeriode)
    : new Map()

  let tanpaPenyusutan = 0
  const rows: BarisReklas[] = berkode
    .map(r => {
      const q = r.aset_id ? pos.get(r.aset_id) : undefined
      // Tanpa periode (tab "Semua Periode") posisi penyusutan memang tak punya
      // titik acuan — itu BUKAN "engine belum jalan", jadi tak ikut dihitung
      // sebagai peringatan. Tab Format Permendagri selalu berperiode.
      if (!q && posPeriode) tanpaPenyusutan++
      return {
        ...r,
        akumulasi: q?.akumulasi ?? 0,
        nilaiBuku: q?.nilaiBuku ?? 0,
        tanpaPenyusutan: !q,
      }
    })
    // ⚠️ URUTAN TOTAL & WAJIB — mesin subtotal memancarkan baris kelompok saat
    // awalan kode BERUBAH, jadi barisnya harus sudah urut menaik menurut
    // `kodeUtama`. Kunci kedua & ketiga pemecah seri: tanpanya barang bernama
    // kembar bertukar tempat tiap kali lembarnya dicetak ulang.
    .sort((a, b) =>
      a.kodeUtama.localeCompare(b.kodeUtama)
      || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
      || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))

  // ⚠️ Nama tiap tingkat diambil dari KOLOM hierarki baris 7-segmen, BUKAN dari
  // baris ber-kode pendek: `admin_kodefikasi_bmd` hanya berisi baris 7 segmen,
  // jadi mencari '1.3.2' di kolom `kode` mengembalikan NOL baris tanpa satu pun
  // error & kolom Nama Barang di semua baris subtotal tinggal kosong.
  // ⚠️ KEDUA kode ikut ditanyakan — blok "Reklasifikasi dari" juga mencetak nama
  // barang, dan kode asalnya sering di golongan yang tak muncul di kolom utama.
  let namaTingkat = petaNamaTingkat([])
  const kodes = [...new Set(rows.flatMap(r => [r.kodeUtama, r.kodeLawan]).filter(Boolean))]
  if (kodes.length > 0) {
    const { data: kd, error: kdErr } = await supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,nama_jenis,nama_objek,nama_rincian,nama_sub_rincian')
      .in('kode', kodes)
    if (kdErr) throw new Error(`gagal membaca kodefikasi barang: ${kdErr.message}`)
    namaTingkat = petaNamaTingkat((kd || []) as BarisKodefikasi[])
  }

  return {
    rows,
    namaTingkat,
    skpd: ini ? { kode: ini.kode_skpd || '', nama: ini.nama } : null,
    sebutan: p.skpdId != null
      ? sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id]))))
      : 'Pengguna Barang',
    semuaSkpd: semua,
    tanpaPenyusutan,
  }
}
