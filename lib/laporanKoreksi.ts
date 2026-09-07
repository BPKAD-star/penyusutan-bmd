// ============================================================================
// Pemuat data lembar KOREKSI Permendagri — keluarga IV.G.
//
// Dipakai BERSAMA tab "Format Permendagri" di menu Pelaporan → Pengelolaan →
// Koreksi DAN halaman cetak /cetak/koreksi-permendagri. Dua jalur angka untuk
// lembar yang sama adalah cara paling gampang menghasilkan pratinjau yang
// berbeda dari berkas yang akhirnya ditandatangani.
//
// ── HANYA `koreksi_nilai` ───────────────────────────────────────────────────
// Alasannya panjang & ada di kepala lib/formatKoreksi.ts. Ringkasnya: seluruh
// kolom uang lembar IV.G adalah "Nilai Perolehan / Akumulasi / Nilai Buku,
// sebelum & setelah" — ia format tentang PERUBAHAN NILAI, dan empat alasan
// koreksi lain di aplikasi ini tak mengubah satu pun dari ketiganya.
//
// ── DARI MANA ANGKA "SEBELUM" & "SETELAH" ───────────────────────────────────
// Ini keputusan terpenting berkas ini, dan dua sisinya sengaja punya sumber
// yang berbeda:
//
//   SEBELUM  → BEKU di `payload` baris ledgernya (`nilai_lama`,
//              `akumulasi_lama`). Tak bisa dibaca dari `penyusutan_semester`:
//              koreksi nilai mengubah basis penyusutan, jadi begitu engine
//              di-run ulang, baris periode itu SUDAH memuat angka yang baru.
//              `akumulasi_lama` mulai dibekukan 2026-09-07 (Koreksi.tsx, pola
//              `penggabungan_masuk`); baris sebelum itu tak punya & sisi
//              "sebelum"-nya dicetak titik-titik.
//   SETELAH  → Nilai Perolehan dari `payload.nilai_perolehan_baru` (BEKU),
//              Akumulasi dari `penyusutan_semester` periode posisi (HIDUP).
//
// ⚠️ Nilai Perolehan "setelah" sengaja BEKU, bukan dibaca dari register/engine.
// Sebabnya kolom Selisih: lembar ini mencetak sebelum, setelah, DAN selisihnya
// berdampingan, dan pemeriksa akan mengurangkannya dengan kalkulator. Dengan
// angka beku, `selisih = setelah − sebelum` PERSIS sama dengan `payload.delta`
// alias `transaksi_bmd.nilai` — angka yang sama yang dipakai Rekonsiliasi &
// Laporan BMD. Kalau memakai nilai HIDUP, aset yang dikoreksi DUA KALI dalam
// satu periode akan menampilkan selisih milik koreksi terakhir di baris koreksi
// pertama, dan ketiga kolomnya tetap terlihat konsisten satu sama lain.
//
// ⚠️ Nilai Buku DITURUNKAN (`perolehan − akumulasi`) di kedua sisi, tidak
// dibaca dari `nilai_buku_akhir`. Itu yang menjamin identitas
// `NP − Akumulasi = NB` berlaku di lembar — kalau salah satunya dibaca dari
// sumber lain, ketiga kolom bisa tak saling menutup di kertas yang sudah
// ditandatangani.
//
// ⚠️ KETERBATASAN YANG DITERIMA & WAJIB DIINGAT: akumulasi "setelah" adalah
// posisi AKHIR PERIODE (hidup), sementara "sebelum" posisi AWAL periode (beku).
// Untuk aset yang dikoreksi sekali & engine sudah dijalankan, itu memang yang
// dimaksud formatnya. Untuk aset yang dikoreksi DUA KALI di periode yang sama,
// baris pertama akan menampilkan pergerakan akumulasi gabungan keduanya. Belum
// ditangani; kalau nanti perlu, yang dibutuhkan snapshot `akumulasi_baru` juga
// — bukan menghitungnya ulang di sini.
//
// ⚠️ FAIL-CLOSED (CLAUDE.md, modul pelaporan): tiap kegagalan MELEMPAR.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBatalTargets, BATAL_TARGET_JENIS } from '@/lib/voidedAset'
import { fetchPenyusutanAset } from '@/lib/rekon'
import { petaNamaTingkat, sebutanPejabat, levelSkpd, type BarisKodefikasi } from '@/lib/formatPermendagri'
import { descendantsOf, periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { UK } from '@/lib/formatKoreksi'
import type { ItemLaporan } from '@/lib/formatPermendagri'

/** Jenis ledger yang dilaporkan lembar IV.G. Lihat kepala berkas. */
export const JENIS_KOREKSI_NILAI = 'koreksi_nilai'

/**
 * Pagu sapuan. Sama alasannya dgn lib/laporanReklas.ts: SKPD disaring di memori
 * (baris koreksi tak punya `skpd_asal`/`skpd_tujuan`), jadi menembusnya berarti
 * asumsinya sudah tak berlaku — MELEMPAR, bukan memotong diam-diam.
 */
const BATAS_SAPU = 20000

export type BarisKoreksi = {
  id: number
  tanggal: string
  periode: string
  /** DELTA nilai perolehan (bertanda). Sama dengan `payload.delta`. */
  nilai: number
  keterangan: string | null
  aset_id: string | null
  payload: {
    nilai_lama?: number; nilai_perolehan_baru?: number; delta?: number
    akumulasi_lama?: number; basis_periode?: string
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
  /** Nama SKPD pemilik barang. */
  skpdNama?: string
  /**
   * Posisi SEBELUM & SETELAH koreksi. `null` = tak diketahui (bukan nol) —
   * dicetak titik-titik di lembar. Lihat kepala berkas.
   */
  npSebelum: number | null
  akSebelum: number | null
  npSetelah: number | null
  akSetelah: number | null
  /** `true` kalau baris ledgernya belum membawa snapshot `akumulasi_lama`. */
  tanpaSnapshot: boolean
  /** `true` kalau posisi penyusutan periode ini tak ada di `penyusutan_semester`. */
  tanpaPenyusutan: boolean
}

const SEL =
  'id,tanggal,periode,nilai,keterangan,aset_id,payload,'
  + 'header:header_id(no_sk,tanggal,jenis,keterangan,skpd_id),'
  + 'aset:aset_id(kode,nama_barang,uraian_barang,nibar,satuan,jumlah,'
  + 'keterangan,intra_ekstra,skpd_id)'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

export type PermintaanKoreksi = {
  /** SKPD sudut pandang. `null` = se-kabupaten (hanya untuk tab daftar/rekap). */
  skpdId: number | null
  /** `'2026-S1'` atau `'2026'` (AKHIR TAHUN = S1+S2). Kosong = seluruh periode. */
  periode: string
}

export type HasilKoreksi = {
  rows: BarisKoreksi[]
  namaTingkat: Map<string, string>
  skpd: { kode: string; nama: string } | null
  sebutan: string
  semuaSkpd: SkpdRow[]
  /** Baris yang sisi "sebelum"-nya tak diketahui (ledger lama tanpa snapshot). */
  tanpaSnapshot: number
  /** Baris yang posisi penyusutan periodenya tak ada. */
  tanpaPenyusutan: number
}

/**
 * Periode `penyusutan_semester` untuk kolom "Setelah Koreksi".
 *
 * ⚠️ "Akhir Tahun" (`'2026'`) → **`2026-S2`**, bukan S1: kolom itu POSISI,
 * sedangkan daftar barangnya ARUS. Kembar dgn `periodePosisi` di keluarga
 * perpindahan & reklas.
 */
export function periodePosisiKoreksi(periode: string): string {
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
 * Muat baris lembar IV.G.
 *
 * ⚠️ Keyset (`.gt('id', …)` + `.order('id')`) — bentuknya sengaja dibuat agar
 * dilayani partial index `idx_trx_koreksi_id` (migrasi 20260826_01), yang
 * predikatnya memuat `koreksi_nilai`. `jenis` bertipe ENUM tak pernah bisa jadi
 * index-cond di bawah RLS, jadi urutan yang dipakai menentukan index mana yang
 * sanggup melayani (CLAUDE.md "ronde 3").
 */
export async function muatLaporanKoreksi(
  supabase: SupabaseClient, p: PermintaanKoreksi,
): Promise<HasilKoreksi> {
  const semua = await semuaSkpdRows(supabase)
  let ini: SkpdRow | undefined
  let desc: number[] | null = null
  if (p.skpdId != null) {
    ini = semua.find(x => x.id === p.skpdId)
    if (!ini) throw new Error(`SKPD #${p.skpdId} tidak ditemukan.`)
    desc = descendantsOf(semua, p.skpdId)
  }

  const per = periodeDiminta(p.periode)
  const mentah: BarisKoreksi[] = []
  let terakhir = 0
  for (;;) {
    let q = supabase.from('transaksi_bmd').select(SEL)
      .eq('jenis', JENIS_KOREKSI_NILAI)
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (per.length === 1) q = q.eq('periode', per[0])
    else if (per.length > 1) q = q.in('periode', per)
    const { data, error } = await q
    if (error) throw new Error(`gagal membaca transaksi koreksi nilai: ${error.message}`)
    const baris = (data as never as BarisKoreksi[]) || []
    if (baris.length === 0) break
    mentah.push(...baris)
    terakhir = baris[baris.length - 1].id
    if (mentah.length > BATAS_SAPU) {
      throw new Error(
        `koreksi nilai melebihi ${BATAS_SAPU.toLocaleString('id-ID')} baris untuk periode ini. `
        + 'Penyaringan SKPD menu ini dilakukan di memori (baris koreksi tak punya kolom SKPD), '
        + 'jadi angkanya TIDAK ditampilkan daripada dipotong diam-diam.')
    }
    if (baris.length < 1000) break
  }

  const punyaAset = mentah.filter(r => r.aset)
  const dalamScope = desc
    ? punyaAset.filter(r => r.aset!.skpd_id != null && desc!.includes(r.aset!.skpd_id))
    : punyaAset

  // Koreksi yang sudah DIBATALKAN dibuang — tanpa ini koreksi yang dianggap tak
  // pernah terjadi tetap tampil sebagai perubahan nilai yang sah, dan angkanya
  // beda dgn engine, Laporan BMD, & Rekonsiliasi. Terscope ke aset yang ditanya.
  const dibatalkan = await fetchBatalTargets(
    supabase, BATAL_TARGET_JENIS.koreksi,
    dalamScope.map(r => r.aset_id).filter((x): x is string => !!x))
  const hidup = dalamScope.filter(r => !dibatalkan.has(r.id))

  // Posisi penyusutan AKHIR periode → sisi "Setelah Koreksi".
  // Aturan "golongan tak disusutkan → akumulasi 0, nilai buku = nilai
  // perolehan" ikut `fetchPenyusutanAset` (lib/rekon.ts), BUKAN ditulis ulang.
  const posPeriode = periodePosisiKoreksi(p.periode)
  const pos = posPeriode
    ? await fetchPenyusutanAset(
      supabase,
      hidup.filter(r => r.aset_id).map(r => ({ aset_id: r.aset_id!, kode: r.aset!.kode })),
      posPeriode)
    : new Map()

  const namaSkpd = new Map(semua.map(s => [s.id, s.nama]))
  let tanpaSnapshot = 0
  let tanpaPenyusutan = 0

  const rows: BarisKoreksi[] = hidup
    .map(r => {
      const a = r.aset!
      const q = r.aset_id ? pos.get(r.aset_id) : undefined
      const npLama = typeof r.payload?.nilai_lama === 'number' ? r.payload.nilai_lama : null
      const npBaru = typeof r.payload?.nilai_perolehan_baru === 'number'
        ? r.payload.nilai_perolehan_baru
        // Baris warisan tanpa `nilai_perolehan_baru` tapi ber-`nilai_lama`:
        // deltanya tetap terekam di kolom `nilai`, jadi sisi "setelah" bisa
        // diturunkan. Yang tak punya keduanya → null, dicetak titik-titik.
        : (npLama != null ? npLama + (r.nilai || 0) : null)
      const akLama = typeof r.payload?.akumulasi_lama === 'number' ? r.payload.akumulasi_lama : null
      if (akLama == null) tanpaSnapshot++
      if (!q && posPeriode) tanpaPenyusutan++
      return {
        ...r,
        skpdNama: a.skpd_id != null ? namaSkpd.get(a.skpd_id) : undefined,
        npSebelum: npLama,
        akSebelum: akLama,
        npSetelah: npBaru,
        akSetelah: q ? q.akumulasi : null,
        tanpaSnapshot: akLama == null,
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

  // ⚠️ Nama tiap tingkat dari KOLOM hierarki baris 7-segmen — `admin_kodefikasi_bmd`
  // hanya berisi baris 7 segmen, jadi mencari '1.3.2' di kolom `kode`
  // mengembalikan NOL baris tanpa error & seluruh baris subtotal tak bernama.
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
    tanpaSnapshot, tanpaPenyusutan,
  }
}

/**
 * `BarisKoreksi` → `ItemLaporan` berikut DUA BELAS ukuran lembar IV.G.
 *
 * ⚠️ SATU tempat, dipakai tab Pelaporan DAN halaman cetak. Dua salinan berarti
 * pratinjau & berkas bertanda tangan bisa menjumlah berbeda tanpa satu pun yang
 * berteriak — kelas kesalahan yang berulang kali sudah menggigit repo ini.
 *
 * ⚠️ **TAMBAH & KURANG dijumlah TERPISAH, bukan diturunkan dari nettonya.**
 * Kelompok berisi +100 dan −40 bernetto +60, sementara lembar IV.G.3–G.7
 * menuntut Tambah 100 & Kurang 40 di dua kolom berbeda. Menurunkannya dari
 * netto akan mencetak Tambah 60 & Kurang 0 — angka yang tetap kelihatan wajar
 * dan tetap menjumlah "benar" ke nettonya.
 *
 * ⚠️ KURANG disimpan sebagai bilangan POSITIF (besarannya), bukan negatif —
 * lembarnya punya kolom sendiri berjudul "Kurang", jadi tandanya sudah
 * dinyatakan judul kolom. Menyimpannya negatif membuat kolom Kurang tercetak
 * berisi minus semua & Σ-nya terbaca berlawanan arah.
 *
 * ⚠️ Nilai Buku DITURUNKAN (`perolehan − akumulasi`) di kedua sisi, bukan
 * dibaca dari `nilai_buku_akhir` — itu yang menjamin identitas
 * `NP − Akumulasi = NB` berlaku di lembar. Sisi yang tak diketahui menyumbang
 * 0 ke Σ kelompok (lembar mencetak titik-titik di baris barangnya) — nol adalah
 * satu-satunya nilai yang tak menggeser jumlah kelompok.
 */
export function itemKoreksi(r: BarisKoreksi): ItemLaporan<BarisKoreksi> {
  const npS = r.npSebelum ?? 0
  const akS = r.akSebelum ?? 0
  const npT = r.npSetelah ?? 0
  const akT = r.akSetelah ?? 0
  const nbS = npS - akS
  const nbT = npT - akT
  // `null` di salah satu sisi berarti selisihnya TAK DIKETAHUI, bukan nol —
  // jadi ia tak boleh ikut mengisi kolom Tambah/Kurang.
  const d = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a)
  const dNp = d(r.npSebelum, r.npSetelah)
  const dAk = d(r.akSebelum, r.akSetelah)
  const dNb = dNp == null || dAk == null ? null : dNp - dAk
  const naik = (v: number | null) => (v != null && v > 0 ? v : 0)
  const turun = (v: number | null) => (v != null && v < 0 ? -v : 0)
  return {
    kode: r.aset!.kode,
    jumlah: r.aset!.jumlah ?? 1,
    // `nilai` = delta perolehan, sejalan dgn `transaksi_bmd.nilai` — itu yang
    // dipakai Rekonsiliasi & Laporan BMD untuk baris koreksi.
    nilai: r.nilai || 0,
    data: r,
    ukuran: {
      [UK.npSebelum]: npS, [UK.akSebelum]: akS, [UK.nbSebelum]: nbS,
      [UK.npSetelah]: npT, [UK.akSetelah]: akT, [UK.nbSetelah]: nbT,
      [UK.npTambah]: naik(dNp), [UK.npKurang]: turun(dNp),
      [UK.akTambah]: naik(dAk), [UK.akKurang]: turun(dAk),
      [UK.nbTambah]: naik(dNb), [UK.nbKurang]: turun(dNb),
    },
  }
}
