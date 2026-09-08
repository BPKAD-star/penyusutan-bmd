// ============================================================================
// Pemuat data lembar PENGHAPUSAN Permendagri — keluarga IV.K.
//
// Dipakai BERSAMA oleh KETIGA tab menu Pelaporan → Pengelolaan → Penghapusan
// DAN halaman cetak /cetak/penghapusan-permendagri. Dua jalur angka untuk
// lembar yang sama adalah cara paling gampang menghasilkan pratinjau yang
// berbeda dari berkas yang akhirnya ditandatangani.
//
// ⚠️ TIGA CABANG, DUA CARA MENYARING SKPD, dan itu bukan kelalaian:
//
//   `penghapusan_*`     → baris ledgernya TAK PUNYA `skpd_asal`/`skpd_tujuan`,
//                         jadi satu-satunya penunjuk SKPD-nya `aset.skpd_id`
//                         dan penyaringannya di MEMORI (pola lib/laporanReklas.ts).
//   `pengalihan_status` → punya kedua kolom itu; lembar IV.K.2 milik SKPD yang
//                         MELEPAS, jadi disaring `skpd_asal` DI SERVER —
//                         cerminan persis lembar IV.B.1.2 yang menyaring
//                         `skpd_tujuan` atas baris yang SAMA.
//
// ⚠️ Menyaring sisi yang salah pada cabang `pengalihan` menghasilkan lembar
// berkop "PENGHAPUSAN" yang berisi barang yang justru baru DITERIMA SKPD itu —
// terisi penuh, footing benar, tanpa satu pun error.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { fetchPenyusutanAset } from '@/lib/rekon'
import { petaNamaTingkat, sebutanPejabat, levelSkpd, type BarisKodefikasi } from '@/lib/formatPermendagri'
import { SUBJENIS_LABEL, JENIS_PENGHAPUSAN } from '@/lib/penghapusan'
import type { FormatPenghapusan } from '@/lib/formatPenghapusan'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'

/**
 * Baris `penghapusan_*` yang MASIH BERLAKU — replay "peristiwa terakhir menang"
 * per aset.
 *
 * ⚠️ **`batal_penghapusan` TIDAK membawa `target_trx_id`.** Payloadnya `{}`
 * (diverifikasi ke produksi 2026-09-08), jadi `fetchBatalTargets` — yang
 * mencocokkan per baris lewat payload — mengembalikan set KOSONG dan tak
 * menyaring apa pun. Itu persis bug yang membuat menu ini menampilkan 14 barang
 * (Rp252 M) sementara Dashboard & menu Pembukuan sama-sama menampilkan 0:
 * keenam asetnya sudah dibatalkan penghapusannya waktu uji coba, tapi baris
 * ledgernya tetap ada & ikut terhitung.
 *
 * Yang tersedia hanya URUTAN KEJADIAN pada aset itu, dan itu memang cukup —
 * pola & alasan PERSIS `fetchNetSerap`/`fetchNetRemoved` di lib/rekon.ts.
 *
 * ⚠️ Ini menjawab pertanyaan yang BERBEDA dari `fetchNetRemoved`: yang di sana
 * "aset ini sekarang terhapus atau tidak" (per ASET), yang di sini "baris
 * penghapusan MANA yang mewakilinya" (per BARIS). Laporan butuh yang kedua —
 * satu aset yang dihapus-batal-dihapus lagi punya BEBERAPA baris penghapusan,
 * dan cuma yang TERAKHIR boleh tampil; kalau tidak barangnya terhitung
 * berkali-kali. Itulah yang dulu dikerjakan `efektifPerAsetStatus="dihapus"` di
 * `LaporanTransaksi`, dengan cara membaca `aset.status`.
 *
 * ⚠️ Sengaja lewat LEDGER, bukan `aset.status`: status itu hasil akhir dari
 * BANYAK jenis peristiwa (reklas, kapitalisasi, pemecahan…), jadi ia tak bisa
 * menjawab pertanyaan tentang SATU jenis — pelajaran yang sama dgn kartu Mutasi
 * & Transfer di Dashboard (CLAUDE.md, INS-24).
 *
 * ⚠️ Diurutkan `(periode, id)`, bukan `id` saja — supaya sepakat dgn
 * `fetchNetRemoved` & replay visibilitas. MELEMPAR kalau query gagal
 * (fail-closed): set kosong berarti "tak ada yang berlaku" dan laporannya
 * diam-diam jadi kosong.
 */
export type EvHapus = { id: number; aset_id: string; periode: string; jenis: string }

/**
 * Bagian MURNI dari replay di atas — dipisah supaya bisa diuji tanpa DB.
 *
 * Mengembalikan id baris penghapusan yang MASIH BERLAKU: satu per aset,
 * peristiwa terakhirnya, dan hanya kalau peristiwa itu bukan `batal_penghapusan`.
 */
export function penghapusanEfektif(rows: EvHapus[]): Set<number> {
  const terakhir = new Map<string, { periode: string; id: number; hapus: boolean }>()
  for (const r of rows) {
    const cur = terakhir.get(r.aset_id)
    if (!cur || r.periode > cur.periode || (r.periode === cur.periode && r.id > cur.id)) {
      terakhir.set(r.aset_id, { periode: r.periode, id: r.id, hapus: r.jenis !== 'batal_penghapusan' })
    }
  }
  const out = new Set<number>()
  for (const s of terakhir.values()) if (s.hapus) out.add(s.id)
  return out
}

async function fetchPenghapusanEfektif(
  supabase: SupabaseClient, asetIds: string[],
): Promise<Set<number>> {
  const rows: EvHapus[] = []
  const uniq = [...new Set(asetIds)]
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await supabase.from('transaksi_bmd')
      .select('id,aset_id,periode,jenis')
      .in('jenis', [...JENIS_PENGHAPUSAN, 'batal_penghapusan'] as never)
      .in('aset_id', uniq.slice(i, i + 200))
    if (error) throw new Error(`gagal membaca riwayat penghapusan: ${error.message}`)
    rows.push(...((data || []) as EvHapus[]))
  }
  return penghapusanEfektif(rows)
}

/**
 * Pagu sapuan cabang ber-`scope: 'aset'`. Bukan paginasi tampilan — ini
 * pengaman asumsi "ledger penghapusan kecil" yang jadi dasar penyaringan SKPD
 * di memori. Menembusnya berarti asumsinya sudah tak berlaku, jadi yang benar
 * MELEMPAR bukan memotong diam-diam.
 */
const BATAS_SAPU = 20000

export type BarisPenghapusan = {
  id: number
  tanggal: string
  periode: string
  nilai: number
  keterangan: string | null
  aset_id: string | null
  skpd_asal: number | null
  skpd_tujuan: number | null
  payload: { no_sk?: string; reversal?: boolean; tgl_dokumen_sumber?: string } | null
  header: {
    no_sk: string | null; tanggal: string | null
    jenis: string | null; sub_jenis: string | null; keterangan: string | null
  } | null
  aset: {
    kode: string; nama_barang: string | null; uraian_barang: string | null; nibar: string | null
    spesifikasi_lainnya: string | null; satuan: string | null; jumlah: number | null
    harga_satuan: number | null; tgl_perolehan: string | null; keterangan: string | null
    intra_ekstra: string | null; alamat_detail: string | null; skpd_id: number | null
    asal_usul: string | null; cara_perolehan: string | null
  } | null

  // ── Dilengkapi sesudah query ────────────────────────────────────────────
  /** Nama SKPD pemilik barang (cabang `aset`) / pelepas (cabang `asal`). */
  skpdNama?: string
  /** SKPD penerima — kolom "Penerima Penyerahan", hanya cabang `pengalihan`. */
  penerima?: string
  /** Label cara pemindahtanganan dari `jurnal_header.sub_jenis`. */
  caraPemindahtanganan: string
  /** Posisi penyusutan akhir periode — kolom Akumulasi & Nilai Buku. */
  akumulasi?: number
  nilaiBuku?: number
  /**
   * `true` kalau posisinya TIDAK ketemu di `penyusutan_semester`. Sengaja
   * dibedakan dari nol: nol berarti "memang belum tersusut", tak-ketemu berarti
   * "engine belum dijalankan" — di lembar bertanda tangan keduanya tak boleh
   * terlihat sama.
   */
  tanpaPenyusutan?: boolean
}

const SEL =
  'id,tanggal,periode,nilai,keterangan,aset_id,skpd_asal,skpd_tujuan,payload,'
  + 'header:header_id(no_sk,tanggal,jenis,sub_jenis,keterangan),'
  + 'aset:aset_id(kode,nama_barang,uraian_barang,nibar,spesifikasi_lainnya,satuan,jumlah,'
  + 'harga_satuan,tgl_perolehan,keterangan,intra_ekstra,alamat_detail,skpd_id,asal_usul,cara_perolehan)'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanPenghapusan = {
  /** Registry cabangnya — menentukan jenis ledger DAN cara menyaring SKPD. */
  f: FormatPenghapusan
  /** SKPD sudut pandang. `null` = se-kabupaten (hanya untuk tab daftar/rekap). */
  skpdId: number | null
  /** `'2026-S1'` atau `'2026'` (AKHIR TAHUN = S1+S2). Kosong = seluruh periode. */
  periode: string
}

export type HasilPenghapusan = {
  rows: BarisPenghapusan[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  sebutan: string
  semuaSkpd: SkpdRow[]
  tanpaPenyusutan: number
}

/**
 * Periode `penyusutan_semester` untuk kolom Akumulasi & Nilai Buku.
 *
 * ⚠️ "Akhir Tahun" (`'2026'`) → **`2026-S2`**, bukan S1: kolom itu POSISI,
 * sedangkan daftar barangnya ARUS. Kembar dgn keluarga perpindahan/reklas/koreksi.
 */
export function periodePosisiPenghapusan(periode: string): string {
  const per = periodeDiminta(periode)
  return per.length === 0 ? '' : per[per.length - 1]
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
 * Muat baris lembar penghapusan untuk satu cabang.
 *
 * ⚠️ `.order('id')`, BUKAN `.order('periode')`/`('tanggal')`: `jenis` bertipe
 * ENUM tak pernah bisa jadi index-cond di bawah RLS, jadi urutan yang dipakai
 * menentukan index mana yang sanggup melayani (CLAUDE.md "ronde 3"). Bentuk ini
 * dilayani `idx_trx_penghapusan_id` (migrasi 20260814_03) untuk cabang
 * `penghapusan_*` dan `idx_trx_pindah_id` (20260729_07) untuk `pengalihan_status`.
 */
export async function muatLaporanPenghapusan(
  supabase: SupabaseClient, p: PermintaanPenghapusan,
): Promise<HasilPenghapusan> {
  const semua = await semuaSkpdRows(supabase)
  let ini: SkpdRow | undefined
  let desc: number[] | null = null
  if (p.skpdId != null) {
    ini = semua.find(x => x.id === p.skpdId)
    if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
    desc = descendantsOf(semua, p.skpdId)
  }

  const per = periodeDiminta(p.periode)
  const mentah: BarisPenghapusan[] = []
  let terakhir = 0
  for (;;) {
    let q = supabase.from('transaksi_bmd').select(SEL)
      .eq('jenis', p.f.jenis)
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    // ⚠️ Cabang `asal` disaring DI SERVER — barisnya punya `skpd_asal` & itu
    // qual leakproof yang terindeks, jadi tak ada alasan menariknya ke memori.
    if (p.f.scope === 'asal' && desc && desc.length > 0) q = q.in('skpd_asal', desc)
    const { data, error } = await q
    if (error) throw new Error(`gagal membaca transaksi penghapusan: ${error.message}`)
    const baris = (data as never as BarisPenghapusan[]) || []
    if (baris.length === 0) break
    mentah.push(...baris)
    terakhir = baris[baris.length - 1].id
    if (p.f.scope === 'aset' && mentah.length > BATAS_SAPU) {
      throw new Error(
        `ledger penghapusan melebihi ${BATAS_SAPU.toLocaleString('id-ID')} baris untuk periode ini. `
        + 'Penyaringan SKPD cabang ini dilakukan di memori (baris penghapusan tak punya kolom '
        + 'SKPD), jadi angkanya TIDAK ditampilkan daripada dipotong diam-diam.')
    }
    if (baris.length < 1000) break
  }

  const punyaAset = mentah.filter(r => r.aset)
  const dalamScope = p.f.scope === 'asal' || !desc
    ? punyaAset
    : punyaAset.filter(r => r.aset!.skpd_id != null && desc!.includes(r.aset!.skpd_id))

  // Yang sudah DIBATALKAN dibuang — tanpa ini penghapusan yang dianggap tak
  // pernah terjadi tetap tampil sebagai penghapusan sah, dan angkanya beda dgn
  // Dashboard, Daftar Barang, Penyusutan, & Rekonsiliasi.
  //
  // ⚠️ **DUA MEKANIK YANG BERBEDA, dan menyamakannya adalah bug nyata
  // (2026-09-08).** `batal_pengalihan` membawa `payload.target_trx_ids`, jadi
  // pembatalannya bisa dicocokkan PER BARIS lewat `fetchBatalTargets`.
  // `batal_penghapusan` TIDAK — payloadnya `{}` — jadi jalur yang sama
  // mengembalikan set kosong & tak menyaring apa pun. Gejalanya: menu ini
  // menampilkan 14 barang (Rp252 M) sementara Dashboard & Pembukuan sama-sama
  // 0, karena keenam asetnya sudah dibatalkan penghapusannya waktu uji coba.
  // Untuk cabang `penghapusan_*` yang benar replay "peristiwa terakhir menang"
  // — lihat `fetchPenghapusanEfektif`.
  const asetIds = dalamScope.map(r => r.aset_id).filter((x): x is string => !!x)
  let hidup: BarisPenghapusan[]
  if (p.f.jenis === 'pengalihan_status') {
    const dibatalkan = await fetchBatalTargets(supabase, BATAL_TARGET_JENIS.pengalihan, asetIds)
    hidup = dalamScope.filter(r => !dibatalkan.has(r.id))
  } else {
    const efektif = await fetchPenghapusanEfektif(supabase, asetIds)
    hidup = dalamScope.filter(r => efektif.has(r.id))
  }

  // Posisi penyusutan akhir periode. Aturan "golongan tak disusutkan →
  // akumulasi 0, nilai buku = nilai perolehan" ikut `fetchPenyusutanAset`
  // (lib/rekon.ts), BUKAN ditulis ulang di sini.
  const posPeriode = periodePosisiPenghapusan(p.periode)
  const pos = posPeriode
    ? await fetchPenyusutanAset(
      supabase,
      hidup.filter(r => r.aset_id).map(r => ({ aset_id: r.aset_id!, kode: r.aset!.kode })),
      posPeriode)
    : new Map()

  const namaSkpd = new Map(semua.map(s => [s.id, s.nama]))
  let tanpaPenyusutan = 0
  const rows: BarisPenghapusan[] = hidup
    .map(r => {
      const a = r.aset!
      const q = r.aset_id ? pos.get(r.aset_id) : undefined
      if (!q && posPeriode) tanpaPenyusutan++
      return {
        ...r,
        skpdNama: p.f.scope === 'asal'
          ? (r.skpd_asal != null ? namaSkpd.get(r.skpd_asal) : undefined)
          : (a.skpd_id != null ? namaSkpd.get(a.skpd_id) : undefined),
        penerima: r.skpd_tujuan != null ? namaSkpd.get(r.skpd_tujuan) : undefined,
        caraPemindahtanganan: SUBJENIS_LABEL[r.header?.sub_jenis || ''] || '',
        akumulasi: q?.akumulasi ?? 0,
        nilaiBuku: q?.nilaiBuku ?? 0,
        tanpaPenyusutan: !q,
      }
    })
    // ⚠️ URUTAN TOTAL & WAJIB — mesin subtotal memancarkan baris kelompok saat
    // awalan kode BERUBAH, jadi barisnya harus sudah urut menaik menurut kode.
    // Kunci kedua & ketiga pemecah seri: tanpanya barang bernama kembar
    // bertukar tempat tiap kali lembarnya dicetak ulang.
    .sort((x, y) =>
      (x.aset!.kode || '').localeCompare(y.aset!.kode || '')
      || (x.aset!.nama_barang || '').localeCompare(y.aset!.nama_barang || '', 'id', { numeric: true })
      || (x.aset!.nibar || '').localeCompare(y.aset!.nibar || ''))

  // ⚠️ Nama tiap tingkat dari KOLOM hierarki baris 7-segmen —
  // `admin_kodefikasi_bmd` hanya berisi baris 7 segmen, jadi mencari '1.3.2' di
  // kolom `kode` mengembalikan NOL baris tanpa error & seluruh baris subtotal
  // tinggal kosong namanya.
  let namaTingkat = petaNamaTingkat([])
  const kodes = [...new Set(rows.map(r => r.aset!.kode).filter(Boolean))]
  if (kodes.length > 0) {
    const { data: kd, error: kdErr } = await supabase.from('admin_kodefikasi_bmd')
      .select('kode,uraian,nama_jenis,nama_objek,nama_rincian,nama_sub_rincian')
      .in('kode', kodes)
    if (kdErr) throw new Error(`gagal membaca kodefikasi barang: ${kdErr.message}`)
    namaTingkat = petaNamaTingkat((kd || []) as BarisKodefikasi[])
  }

  return {
    rows, namaTingkat,
    skpd: ini ? { kode: ini.kode_skpd || '', nama: ini.nama } : null,
    sebutan: p.skpdId != null
      ? sebutanPejabat(levelSkpd(p.skpdId, new Map(semua.map(s => [s.id, s.parent_id]))))
      : 'Pengguna Barang',
    semuaSkpd: semua,
    tanpaPenyusutan,
  }
}
