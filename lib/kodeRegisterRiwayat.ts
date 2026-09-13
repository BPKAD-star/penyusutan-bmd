// KODE REGISTER pada sebuah PERIODE — replay riwayat `aset_kode_register`.
//
// **NIBAR = akta lahir, kode register = KTP** (CLAUDE.md). NIBAR terbit sekali
// dan tak pernah berubah; kode register mengikuti POSISI TERAKHIR barang — empat
// segmen tengahnya bergerak tiap barang pindah SKPD, pindah keranjang komptabel,
// atau direklas. `aset.kode_register` karena itu cuma menyimpan posisi HARI INI,
// dan membacanya untuk periode LAMPAU melanggar aturan lintas-fitur "PERISTIWA
// BERLAKU SEJAK PERIODENYA, TIDAK SURUT".
//
// Modul ini melayani **jalur MENTAH** saja — yang membaca tabel `aset` langsung:
//   · Export Penyusutan (`assembleRows`, sengaja tak lewat RPC supaya berkasnya
//     memuat SELURUH hasil filter, bukan halaman yang kebetulan terbuka);
//   · Export Audit/Mutasi Daftar Barang (`fetchAllRowsRaw`, sengaja tak lewat
//     RPC supaya barang yang di layar sudah tersembunyi tetap ikut).
// Layar & Export biasa Daftar Barang + layar Penyusutan sudah period-aware DI
// SERVER (`fn_dbar_kode_register_at`, migrasi 20260913_01) dan TIDAK memakai
// modul ini.
//
// ⚠️ KEMBAR DENGAN SQL. Aturan yang sama hidup di dua tempat & harus diubah
// bersamaan — dikunci `lib/sinkronisasiRpc.test.ts`:
//   1. modul ini (jalur mentah / Export, sisi TypeScript)
//   2. `fn_dbar_kode_register_at` (migrasi 20260913_01, sisi SQL)
//
// ⚠️ Cara bacanya KEMBAR dgn `ownersAt()` (lib/pengalihan.ts) & `kodePada()`
// (lib/reklasKode.ts) — ketiganya "baris terakhir yang sudah terjadi menang".
// Pickernya sengaja BELUM disatukan jadi satu generik: `kodePada` masih butuh
// parameter `trxId` ("tepat saat transaksi itu") yang di sini tak ada padanannya,
// dan menyatukan tiga modul sekaligus itu pekerjaan Fase 2 (REFACTOR-PLAN §5
// butir 2.2/2.4) yang layak jadi commit sendiri, bukan ditumpangkan di sini.
import type { SupabaseClient } from '@supabase/supabase-js'
import { comparePeriode } from '@/lib/bmd'

export type KodeRegEv = { id: number; periode: string; kodeLama: string | null; kodeBaru: string }
export type RiwayatKodeReg = Map<string, KodeRegEv[]>

/**
 * Seluruh riwayat perpindahan kode register, per aset.
 *
 * ⚠️ TANPA penyaringan `batal_*`, dan itu BUKAN kelalaian — ini beda paling
 * penting dari `fetchReklasEvents`. Di sana sumbernya LEDGER, jadi baris yang
 * dianulir `batal_reklas` wajib dibuang. Di sini sumbernya tabel RIWAYAT yang
 * ditulis trigger `trg_aset_kode_register`, dan **pembatalan MENAMBAH BARIS
 * BARU** yang memulihkan kode lama (cabang GUC `app.batal_pengalihan`).
 * Diverifikasi ke produksi: satu aset punya 4 baris
 *   pindah unit → pindah unit → batal pengalihan → pindah unit
 * dan rantainya utuh (`kodeBaru` baris ke-n === `kodeLama` baris ke-n+1). Jadi
 * "baris terakhir menang" sudah benar dengan sendirinya; menyaring pembatalan di
 * sini justru MENGANULIR pemulihannya.
 *
 * ⚠️ Sengaja TANPA filter periode — alasan sama dgn `fetchReklasEvents` &
 * `fetchPindahEvents`: perpindahan yang terjadi SESUDAH periode yang dilihat
 * justru yang membuktikan `aset.kode_register` sekarang BUKAN kode saat itu.
 * Memotongnya di query membuat jawabannya salah secara diam-diam.
 *
 * ⚠️ MELEMPAR kalau query gagal. Map kosong terbaca sebagai "tak ada barang yang
 * pernah pindah" → export lalu memakai kode terkini untuk SEMUA periode dan
 * berkasnya tetap kelihatan sah. Pemanggil wajib punya try/catch + tampilan
 * error (aturan kolektor fail-closed, CLAUDE.md).
 *
 * Biayanya ikut jumlah PERPINDAHAN, bukan besar register: 188 baris di produksi
 * per 2026-09-13 (67 aset), jadi satu halaman keyset sudah menghabiskannya.
 *
 * ⚠️ Dibaca sbg `authenticated`, jadi policy `akr_select` MENYARINGNYA — dan itu
 * justru benar di sini, tidak seperti di sisi SQL (di mana
 * `fn_dbar_kode_register_at` WAJIB `SECURITY DEFINER`; lihat migrasi 20260913_01).
 * Bedanya: fungsi SQL itu melayani SELURUH scope sebuah RPC sekaligus sehingga
 * penyaringan per-baris membuatnya menjawab SALAH, sementara kolektor ini cuma
 * dipakai untuk barang yang memang ada di berkas export operator itu. Terukur
 * sbg pengurus Dinas Pendidikan: 3 dari 188 baris terbaca — tepat aset yang ada
 * di scope-nya, dan 424 ms yang dibayar sekali per klik Export (berkasnya sendiri
 * belasan detik), bukan per pemuatan halaman.
 * ⚠️ Barang yang PADA periode itu milik operator tapi kini sudah pindah keluar
 * (ditambahkan `partitionByPeriodOwner`) tetap terbaca: `akr_select` memuat
 * `OR fn_aset_pernah_dikelola(aset_id)`, cerminan pelebaran `aset_select` di
 * migrasi 22. Tanpa klausa itu barang-barang itu akan jatuh ke kode terkini
 * diam-diam — periksa policy-nya dulu kalau kelak ia disunting.
 */
export async function fetchRiwayatKodeRegister(supabase: SupabaseClient): Promise<RiwayatKodeReg> {
  type Row = { id: number; aset_id: string; periode: string; kode_lama: string | null; kode_register: string }
  const out: RiwayatKodeReg = new Map()

  let terakhir = 0
  for (;;) {
    // Keyset (bukan OFFSET) + urut `id` + `error` diperiksa — tiga cacat yang di
    // repo ini selalu berpasangan & ketiganya bikin angka salah TANPA SUARA
    // (rules.md §3). `ORDER BY id` dilayani `aset_kode_register_pkey`, jadi tak
    // ada index baru yang perlu ditambahkan untuk kolektor ini.
    const { data, error } = await supabase.from('aset_kode_register')
      .select('id,aset_id,periode,kode_lama,kode_register')
      .gt('id', terakhir).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`gagal membaca riwayat kode register: ${error.message}`)
    if (!data || data.length === 0) break
    const rows = data as unknown as Row[]
    for (const r of rows) {
      if (!r.kode_register) continue
      const arr = out.get(r.aset_id) || []
      arr.push({ id: r.id, periode: r.periode, kodeLama: r.kode_lama, kodeBaru: r.kode_register })
      out.set(r.aset_id, arr)
    }
    terakhir = rows[rows.length - 1].id
    if (rows.length < 1000) break
  }
  return out
}

// Baris riwayat TERAKHIR yang sudah terjadi pada akhir sebuah periode.
function terakhirSampai(evs: KodeRegEv[], periode: string): KodeRegEv | null {
  let pilih: KodeRegEv | null = null
  for (const e of evs) {
    if (comparePeriode(e.periode, periode) > 0) continue
    if (!pilih
        || comparePeriode(e.periode, pilih.periode) > 0
        || (comparePeriode(e.periode, pilih.periode) === 0 && e.id > pilih.id)) pilih = e
  }
  return pilih
}

// Baris riwayat PALING AWAL — `kodeLama`-nya = kode semula barang itu.
function paling(evs: KodeRegEv[]): KodeRegEv {
  return evs.reduce((a, b) =>
    (comparePeriode(b.periode, a.periode) < 0
      || (comparePeriode(b.periode, a.periode) === 0 && b.id < a.id)) ? b : a)
}

/**
 * Kode register satu barang pada AKHIR sebuah periode.
 *
 * ⚠️ `kodeKini === null` → tetap `null`. Barang `draft` sengaja belum berkode
 * ("nomor tak dibakar untuk yang mungkin tak jadi", CLAUDE.md) tapi riwayatnya
 * BISA sudah berisi — kontrak KDP yang dibuka kunci mengembalikan status ke
 * `draft` & meng-NULL-kan kolomnya, sementara baris riwayatnya tetap ada
 * (terukur: 1 aset di produksi). Tanpa penjaga ini fungsi ini akan MENERBITKAN
 * kode untuk barang yang belum resmi. Kembar dgn `CASE WHEN … IS NULL` di
 * `fn_daftar_barang`/`fn_penyusutan`.
 */
export function kodeRegisterPada(
  riwayat: RiwayatKodeReg, asetId: string, periode: string, kodeKini: string | null,
): string | null {
  if (kodeKini === null) return null
  const arr = riwayat.get(asetId)
  if (!arr || arr.length === 0) return kodeKini
  const t = terakhirSampai(arr, periode)
  if (t) return t.kodeBaru
  // Semua perpindahannya SESUDAH periode ini → kode semula. Baris warisan tanpa
  // `kode_lama` jatuh ke kode terkini: tebakan yang buruk, tapi jauh lebih baik
  // daripada string kosong yang membuat kolom identitas hilang tanpa jejak.
  return paling(arr).kodeLama ?? kodeKini
}
