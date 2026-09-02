// ============================================================================
// Pemuat data lembar PERPINDAHAN format Permendagri — IV.B.1, IV.C, IV.D.
//
// Dipakai BERSAMA oleh tab "Format Permendagri" di menu Pelaporan dan halaman
// cetak /cetak/perpindahan-permendagri. Dua jalur angka untuk lembar yang sama
// adalah cara paling gampang menghasilkan pratinjau yang berbeda dari berkas
// yang akhirnya ditandatangani — dan bedanya tak akan bersuara.
//
// ⚠️ SATU PEMUAT UNTUK DUA JENIS LEDGER (`pengalihan_status` &
// `mutasi_internal`) DAN DUA ARAH, dan itu bukan penyederhanaan malas: kolom
// yang dibutuhkan semuanya identik, saringan pembatalannya SAMA
// (`batal_pengalihan` sengaja dipakai bersama — lihat CLAUDE.md "BATAL
// PERPINDAHAN"), dan index parsial yang melayaninya juga sama
// (`idx_trx_pindah_id`). Dua pemuat berarti dua tempat yang harus dijaga
// sepakat soal saringan pembatalan, dan yang menyimpang akan menampilkan
// perpindahan yang sudah dianulir sebagai masih berlaku.
//
// ⚠️ `arah` MENENTUKAN SISI MANA YANG DISARING, dan tanpanya IV.C (Penerimaan
// Internal) & IV.D (Pengeluaran Internal) akan memuat baris yang PERSIS SAMA:
// keduanya membaca `mutasi_internal` yang sama, cuma dari sudut pandang
// berlawanan. Tak ada error yang muncul kalau salah — cuma dua lembar resmi
// yang isinya kembar & sama-sama mengaku benar.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR, tak ada
// yang ditelan jadi "datanya memang kosong". Pemanggil menampilkan pesannya dan
// MENOLAK menyusun lembar.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { fetchPenyusutanAset } from '@/lib/rekon'
import { petaNamaTingkat, sebutanPejabat, levelSkpd, type BarisKodefikasi } from '@/lib/formatPermendagri'
import type { ArahLembar } from '@/lib/formatPerpindahan'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

/**
 * Baris ledger perpindahan + asetnya, seperlunya untuk mengisi kolom lembar.
 *
 * ⚠️ `akumulasi`/`nilaiBuku` DILENGKAPI SESUDAH baris ditarik (dari
 * `penyusutan_semester`), bukan ikut di query — keduanya posisi AKHIR PERIODE
 * per aset, bukan angka yang melekat pada transaksinya.
 */
export type BarisPerpindahan = {
  id: number
  tanggal: string
  periode: string
  nilai: number
  keterangan: string | null
  aset_id: string | null
  skpd_asal: number | null
  skpd_tujuan: number | null
  payload: { no_sk?: string; reversal?: boolean; tgl_dokumen_sumber?: string } | null
  header: { no_sk: string; tanggal: string } | null
  aset: {
    kode: string; nama_barang: string | null; uraian_barang: string | null; nibar: string | null
    spesifikasi_lainnya: string | null; satuan: string | null; jumlah: number | null
    harga_satuan: number | null; tgl_perolehan: string | null; keterangan: string | null
    intra_ekstra: string | null; alamat_detail: string | null
    asal_usul: string | null; cara_perolehan: string | null
  } | null
  /** Nama SKPD/unit yang MENYERAHKAN. Dilengkapi sesudah query. */
  asal_nama?: string
  /**
   * Nama SKPD/unit yang MENERIMA. Dilengkapi sesudah query.
   *
   * ⚠️ Tak dipakai lembar IV.B/IV.C/IV.D (ketiganya tak punya kolomnya), tapi
   * WAJIB untuk rekap GABUNGAN IV.D.7 yang mencetak kedua pihak berdampingan.
   * Diisi di sini, bukan di pemuat terpisah, supaya kedua lembar itu mustahil
   * memakai nama SKPD yang berbeda untuk baris ledger yang sama.
   */
  tujuan_nama?: string
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
  'id,tanggal,periode,nilai,keterangan,aset_id,skpd_asal,skpd_tujuan,payload,'
  + 'header:header_id(no_sk,tanggal),'
  + 'aset:aset_id(kode,nama_barang,uraian_barang,nibar,spesifikasi_lainnya,satuan,jumlah,'
  + 'harga_satuan,tgl_perolehan,keterangan,intra_ekstra,alamat_detail,asal_usul,cara_perolehan)'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanPerpindahan = {
  /** Jenis ledger: `pengalihan_status` (IV.B.1) atau `mutasi_internal` (IV.C/IV.D). */
  jenis: string
  /**
   * Sisi yang didaftar — dari `FORMAT_PERPINDAHAN[<cabang>].arah`.
   *
   * `masuk`  → saring `skpd_tujuan` (lembar PENERIMAAN, IV.B.1 & IV.C)
   * `keluar` → saring `skpd_asal`   (lembar PENGELUARAN, IV.D)
   * `semua`  → salah satu sisi ada di scope (rekap GABUNGAN IV.D.7)
   */
  arah: ArahLembar | 'semua'
  /** SKPD yang jadi sudut pandang lembar. */
  skpdId: number
  /** `'2026-S1'` atau `'2026'` (AKHIR TAHUN = S1+S2). Kosong tak dilayani. */
  periode: string
}

export type HasilPerpindahan = {
  rows: BarisPerpindahan[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string }
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
 * pernah ditolak siapa pun.
 */
export function periodePosisi(periode: string): string {
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
 * Muat baris lembar perpindahan untuk satu SKPD, dari sisi `arah`.
 *
 * ⚠️ **SATU SISI SAJA, bukan "asal ATAU tujuan".** Judul lembarnya menyatakan
 * sisinya ("LAPORAN PENERIMAAN…" / "LAPORAN PENGELUARAN…"), jadi yang didaftar
 * cuma barang yang bergerak ke arah itu. Menyaring dengan
 * `skpd_asal.in.(…) OR skpd_tujuan.in.(…)` — pola tab "Daftar Transaksi" yang
 * memang netral arah — akan memasukkan barang yang bergerak ke arah sebaliknya
 * juga, lalu mencantumkan SKPD itu sendiri sebagai lawan transaksinya. Salah,
 * tampak sah, dan tak menghasilkan satu pun error. `'semua'` HANYA untuk rekap
 * gabungan IV.D.7, yang memang mendaftar kedua arah sekaligus.
 *
 * ⚠️ Baris ber-`payload.reversal` (pengembalian, mekanik "Kembalikan" yang sudah
 * DICABUT 2026-08-12) IKUT dihitung, dan itu disengaja: ledgernya menukar
 * asal↔tujuan, jadi bagi SKPD asal ia benar-benar penerimaan kembali —
 * `ownersAt` di lib/pengalihan.ts memperlakukannya begitu juga. Membuangnya
 * membuat lembar ini tak sepakat dengan siapa pemilik barangnya menurut
 * register. Per 2026-08-31 cuma ada 2 baris semacam itu di seluruh ledger,
 * semuanya `pengalihan_status`; `mutasi_internal` tak punya satu pun.
 */
export async function muatLembarPerpindahan(
  supabase: SupabaseClient, p: PermintaanPerpindahan,
): Promise<HasilPerpindahan> {
  const semua = await semuaSkpdRows(supabase)
  const ini = semua.find(x => x.id === p.skpdId)
  if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
  const desc = descendantsOf(semua, p.skpdId)

  // ⚠️ `.order('id')`, BUKAN `.order('periode')`/`('tanggal')`: `jenis` bertipe
  // ENUM tak pernah bisa jadi index-cond di bawah RLS (CLAUDE.md "ronde 3"),
  // jadi urutan yang dipakai menentukan index mana yang sanggup melayani.
  // Bentuk ini dilayani partial index `idx_trx_pindah_id` (migrasi 20260729_01)
  // `ON transaksi_bmd (id) WHERE jenis IN ('pengalihan_status','mutasi_internal')`
  // — predikat yang KEBETULAN memuat tepat dua jenis yang dilayani berkas ini.
  let qq = supabase.from('transaksi_bmd').select(SEL)
    .eq('jenis', p.jenis).order('id', { ascending: false })
  const per = periodeDiminta(p.periode)
  if (per.length === 1) qq = qq.eq('periode', per[0])
  else if (per.length > 1) qq = qq.in('periode', per)
  if (desc.length > 0) {
    if (p.arah === 'masuk') qq = qq.in('skpd_tujuan', desc)
    else if (p.arah === 'keluar') qq = qq.in('skpd_asal', desc)
    else {
      const list = desc.join(',')
      qq = qq.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
    }
  }

  const { data: trx, error: trxErr } = await qq.limit(5000)
  if (trxErr) throw new Error(`gagal membaca transaksi perpindahan: ${trxErr.message}`)

  // ⚠️ Komptabel TIDAK disaring di sini — saringannya saat render, supaya
  // pemilihnya bisa berganti tanpa menembak query kedua.
  const semuaBaris = ((trx as never as BarisPerpindahan[]) || []).filter(r => r.aset)

  // Perpindahan yang DIBATALKAN (`batal_pengalihan`, migrasi 20260729_07 &
  // 20260812_04) dibuang. Tanpa ini barang yang perpindahannya dianggap tak
  // pernah terjadi tetap tampil sebagai penerimaan sah — dan Daftar Barang,
  // Penyusutan, serta Rekonsiliasi sudah membuangnya, jadi lembar ini akan
  // berbeda dari semuanya.
  // ⚠️ Enum `batal_pengalihan` DIPAKAI BERSAMA `pengalihan_status` DAN
  // `mutasi_internal` — sengaja, bukan kelalaian penamaan (CLAUDE.md). Karena
  // itu satu daftar jenis ini benar untuk kedua cabang.
  // ⚠️ Payloadnya `target_trx_ids` JAMAK (sekali batal menganulir baris perginya
  // DAN baris pulangnya); `fetchBatalTargets` membaca dua bentuk.
  const dibatalkan = await fetchBatalTargets(
    supabase, BATAL_TARGET_JENIS.pengalihan,
    semuaBaris.map(r => r.aset_id).filter((x): x is string => !!x))
  const hidup = semuaBaris.filter(r => !dibatalkan.has(r.id))

  // Posisi penyusutan akhir periode — aturan "golongan tak disusutkan → beban &
  // akumulasi 0, nilai buku = nilai perolehan" ikut `fetchPenyusutanAset`
  // (lib/rekon.ts), BUKAN ditulis ulang di sini: itu aturan yang sama yang
  // dipakai Rekonsiliasi & drill-down-nya, dan dua salinannya akan menyimpang.
  const posPeriode = periodePosisi(p.periode)
  const pos = await fetchPenyusutanAset(
    supabase,
    hidup.filter(r => r.aset_id).map(r => ({ aset_id: r.aset_id!, kode: r.aset!.kode })),
    posPeriode)

  const namaSkpd = new Map(semua.map(s => [s.id, s.nama]))
  let tanpaPenyusutan = 0
  const rows = hidup
    .map(r => {
      const q = r.aset_id ? pos.get(r.aset_id) : undefined
      if (!q) tanpaPenyusutan++
      return {
        ...r,
        asal_nama: r.skpd_asal != null ? namaSkpd.get(r.skpd_asal) : undefined,
        tujuan_nama: r.skpd_tujuan != null ? namaSkpd.get(r.skpd_tujuan) : undefined,
        akumulasi: q?.akumulasi ?? 0,
        nilaiBuku: q?.nilaiBuku ?? 0,
        tanpaPenyusutan: !q,
      }
    })
    // ⚠️ URUTAN TOTAL & WAJIB — mesin subtotal memancarkan baris kelompok saat
    // awalan kode BERUBAH, jadi barisnya harus sudah urut menaik menurut kode.
    // Kunci kedua & ketiga pemecah seri: tanpanya barang bernama kembar
    // bertukar tempat tiap kali lembarnya dicetak ulang.
    .sort((a, b) =>
      (a.aset!.kode || '').localeCompare(b.aset!.kode || '')
      || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
      || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))

  // ⚠️ Nama tiap tingkat diambil dari KOLOM hierarki baris 7-segmen, BUKAN dari
  // baris ber-kode pendek: `admin_kodefikasi_bmd` hanya berisi baris 7 segmen,
  // jadi mencari '1.3.2' di kolom `kode` mengembalikan NOL baris tanpa satu pun
  // error & kolom Nama Barang di semua baris subtotal tinggal kosong.
  let namaTingkat = petaNamaTingkat([])
  const kodes = [...new Set(rows.map(r => r.aset!.kode))]
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
    skpd: { kode: ini.kode_skpd || '', nama: ini.nama },
    sebutan: sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id])))),
    semuaSkpd: semua,
    tanpaPenyusutan,
  }
}
