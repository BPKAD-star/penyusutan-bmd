import { Suspense, cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { fetchPindahEvents, pindahAktif } from '@/lib/pengalihan'
import CaraPerolehanCards from '@/components/dashboard/CaraPerolehanCards'
import MutasiTransferCards from '@/components/dashboard/MutasiTransferCards'
import { type PenghapusanData } from '@/components/dashboard/PenghapusanCards'
import { Section, SectionSkeleton, CardsSkeleton, ViewTotalNilai, ViewJenis, ViewHapus } from '@/components/dashboard/DashboardView'
import { CadanganTotalNilai, CadanganJenis, CadanganHapus, SimpanCacheDashboard } from '@/components/dashboard/CadanganDashboard'
import { rpcUlangJikaTimeout } from '@/lib/rpcUlang'
import Link from 'next/link'
import FitLayar from '@/components/dashboard/FitLayar'
import { GaugeIndeks } from '@/components/ipa/GaugeIndeks'
import { muatIndeksDashboard, type IndeksDashboard } from '@/lib/ipaData'

// ⚠️ Dashboard WAJIB mencerminkan ledger HIDUP. `@supabase/ssr` tak menyetel
// `cache: 'no-store'`, jadi query `.from(...).select(...)` (GET) — Penghapusan &
// Mutasi — diam-diam dilayani dari Next Data Cache: penghapusan/mutasi yang
// BARU dieksekusi tak pernah muncul di kartunya walau halaman di-reload, dan
// tak ada satu pun error. Seksi lain (Total Aset, Cara Perolehan) kebetulan
// selamat karena lewat `supabase.rpc()` yang POST & tak pernah di-cache Next.
// `force-dynamic` mematikan Data Cache utk seluruh fetch di halaman ini —
// halaman ini memang sudah dinamis (baca `cookies()`), jadi tak ada ongkos
// render tambahan; pola yang sama dgn app/kibar/[nibar]/page.tsx.
export const dynamic = 'force-dynamic'
// ⚠️ Dinaikkan 2026-09-22 bersama percobaan-ulang di `scanAset`. Bawaannya tak
// cukup untuk dua kali 8 dtk, dan percobaan kedua yang dipotong runtime justru
// menghasilkan 504 — kegagalan yang lebih buruk daripada strip merah yang
// hendak ditutup. Halaman ini streaming (`cache()` + slot), jadi angka besar di
// sini tak menahan bagian lain ikut tampil.
export const maxDuration = 60

type SB = ReturnType<typeof createClient>

// transaksi_bmd bersifat append-only: batal (pengalihan/penghapusan) DICATAT
// sebagai baris baru, bukan menghapus baris lama — jadi hitung baris mentah
// bisa kebesaran (baris yang sudah "dibatalkan" tetap ikut terhitung).
//
// Untuk PERPINDAHAN, yang menentukan berlaku/tidaknya adalah LEDGER-nya sendiri
// (`fetchPindahEvents` sudah membuang baris yang kena `batal_pengalihan`),
// BUKAN posisi `aset.skpd_id` hari ini — lihat alasan panjangnya di
// `pindahAktif` (lib/pengalihan.ts). Versi lama membandingkan `aset.skpd_id`
// dgn `skpd_tujuan` dan kurang hitung diam-diam untuk barang yang sesudah
// pindah SKPD dimutasi-internal lagi ke sub-unit di bawahnya.
//
// Dua jenisnya dihitung dari SATU tarikan ledger: `fetchPindahEvents` memang
// menarik keduanya sekaligus (partial index `idx_trx_pindah_id`), jadi
// memanggilnya dua kali cuma menarik baris yang sama persis dua kali.
//
// ⚠️ MENGEMBALIKAN `err`, BUKAN DIAM. Versi lama membungkusnya `try/catch {}`
// kosong → query gagal berarti kartu tampil "0 disetujui", dan nol itu terbaca
// operator sebagai "memang belum ada barang yang dipindah". Sama alasannya dgn
// scanAset di bawah (keluarga INS-06/INS-08).
async function countPindahAktif(sb: SB): Promise<{ transfer: number; mutasiInternal: number; err: string }> {
  try {
    const ev = await fetchPindahEvents(sb)
    return {
      transfer: pindahAktif(ev, 'pengalihan_status').size,
      mutasiInternal: pindahAktif(ev, 'mutasi_internal').size,
      err: '',
    }
  } catch (e) {
    return { transfer: 0, mutasiInternal: 0, err: e instanceof Error ? e.message : String(e) }
  }
}

const nolPenghapusan = (): PenghapusanData => ({
  hibah: { n: 0, nilai: 0 }, jual: { n: 0, nilai: 0 }, tukar: { n: 0, nilai: 0 },
  modal: { n: 0, nilai: 0 }, sebabLain: { n: 0, nilai: 0 },
})

// Penghapusan: hanya hitung baris yang aset-nya MASIH status 'dihapus' saat
// ini (kalau sudah di-batal_penghapusan, aset kembali 'aktif' — tak terhitung).
// 5 kategori: 4 mekanisme pemindahtanganan (sub_jenis) + 1 sebab lainnya (jenis
// sendiri, force majeure dkk) — masing-masing dgn jumlah barang & total nilai.
//
// ⚠️ KEYSET (`.gt('id', terakhir)` + `.order('id')`), BUKAN `.range()`. Versi
// lama memakai OFFSET TANPA `ORDER BY` sama sekali, dan itu menabrak tiga
// aturan repo ini sekaligus (CLAUDE.md, "kolektor halaman-demi-halaman"):
//   (1) paginasi tanpa urutan — Postgres tak menjamin urutan antar-halaman,
//       jadi begitu hasilnya >1.000 baris ada yang TERLEWAT & ada yang DOBEL
//       diam-diam; angka kartu Penghapusan salah tanpa satu pun pesan;
//   (2) OFFSET makin dalam makin lambat — halaman ke-N menyusuri lalu membuang
//       (N-1)×1.000 baris hanya untuk sampai ke barisnya;
//   (3) filternya CUMA `jenis`, dan `jenis` (ENUM) tak bisa jadi index-cond di
//       bawah RLS → tiap halaman menyapu ulang ledger 418rb baris demi beberapa
//       ratus baris penghapusan. Inilah penyumbang terbesar 7,9 dtk render
//       Dashboard. Diperbaiki migrasi 20260814_03 (`idx_trx_penghapusan_id`);
//       keyset di bawah yang membuat index itu benar-benar terpakai — ORDER BY
//       id + id > N dilayani index yang sama, tanpa node Sort.
//
// ⚠️ MENGEMBALIKAN `err`, BUKAN `catch {}` kosong seperti versi lama. Kartu
// Penghapusan yang tampil "0 barang · Rp0" karena query-nya timeout terbaca
// operator sebagai "memang belum ada barang yang dihapus" — keluarga
// INS-06/INS-08, sama alasannya dgn scanAset & countPindahAktif.
async function countPenghapusan(sb: SB): Promise<{ data: PenghapusanData; err: string }> {
  const out = nolPenghapusan()
  try {
    // ⚠️ `sub_jenis` dibaca dari `header:header_id(sub_jenis)`, BUKAN
    // `payload.sub_jenis` — ditemukan 2026-09-05 (user memeriksa sebelum
    // eksekusi penghapusan sungguhan): `insertLines()` di Penghapusan.tsx
    // menulis baris ledger dengan `payload: {}` KOSONG; `sub_jenis` hanya
    // pernah disimpan di `jurnal_header.sub_jenis` (header/kartu), tak pernah
    // disalin ke baris. Akibatnya `payload?.sub_jenis` SELALU `undefined` →
    // SEMUA penghapusan Hibah/Penjualan/Tukar Menukar/Penyertaan Modal jatuh
    // ke cabang `else` dan tercatat sbg "Karena Sebab Lainnya" — keempat
    // kartu mekanisme itu permanen 0 berapa pun banyaknya dieksekusi. Dibaca
    // lewat FK `header_id` (satu-satunya sumber sebenarnya), bukan
    // menduplikasi `sub_jenis` ke `payload` tiap baris (dua sumber yang bisa
    // menyimpang — pola yang sama dgn `cara_perolehan`/`asal_usul`).
    //
    // ⚠️ Dedup PER ASET, bukan per baris: siklus hapus → Batal Penghapusan
    // (aset balik 'aktif') → dihapus lagi (dgn sub_jenis lain, mis. tadinya
    // salah pilih "Sebab Lain" lalu dibetulkan jadi "Hibah") menghasilkan DUA
    // baris `penghapusan_*` utk aset yang SAMA. `aset.status` itu keadaan
    // SEKARANG, bukan per-baris, jadi tanpa dedup KEDUA baris lolos cek
    // `status==='dihapus'` & aset itu terhitung DUA KALI. Ditimpa per
    // `aset_id` sambil membaca urut id ASC → yang tersisa di map selalu
    // peristiwa TERAKHIR untuk aset itu.
    const terakhirPerAset = new Map<string, { jenis: string; nilai: number; sub: string | null; status: string | null }>()
    let terakhir = 0
    for (;;) {
      const { data, error } = await sb.from('transaksi_bmd')
        .select('id,aset_id,jenis,nilai,aset(status),header:header_id(sub_jenis)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])
        .gt('id', terakhir)
        .order('id', { ascending: true })
        .limit(1000)
      // Gagal di tengah = angka SEBAGIAN. Kembalikan nol + pesan, jangan
      // hitungan separuh yang terlihat sah.
      if (error) return { data: nolPenghapusan(), err: error.message }
      if (!data || data.length === 0) break
      const rows = data as unknown as {
        id: number; aset_id: string | null; jenis: string; nilai: number
        aset: { status: string } | null
        header: { sub_jenis: string | null } | null
      }[]
      for (const r of rows) {
        terakhir = r.id
        if (!r.aset_id) continue
        terakhirPerAset.set(r.aset_id, {
          // `nilai` = kolom `numeric` → supabase-js mengembalikannya sbg STRING.
          // Tanpa `Number()` di sini, `out.*.nilai += t.nilai` di bawah jadi
          // penggabungan string ("1262167700"+"17103000" → 1.26e17), bukan
          // penjumlahan — kartu tampil angka ngawur tanpa satu pun error.
          jenis: r.jenis, nilai: Number(r.nilai) || 0, sub: r.header?.sub_jenis ?? null, status: r.aset?.status ?? null,
        })
      }
      if (rows.length < 1000) break
    }
    for (const t of terakhirPerAset.values()) {
      if (t.status !== 'dihapus') continue
      if (t.jenis === 'penghapusan_sebab_lain') { out.sebabLain.n++; out.sebabLain.nilai += t.nilai; continue }
      if (t.sub === 'hibah') { out.hibah.n++; out.hibah.nilai += t.nilai }
      else if (t.sub === 'penjualan') { out.jual.n++; out.jual.nilai += t.nilai }
      else if (t.sub === 'tukar_menukar') { out.tukar.n++; out.tukar.nilai += t.nilai }
      else if (t.sub === 'penyertaan_modal') { out.modal.n++; out.modal.nilai += t.nilai }
      else { out.sebabLain.n++; out.sebabLain.nilai += t.nilai } // fallback: sub_jenis tak dikenal / header hilang
    }
  } catch (e) {
    return { data: nolPenghapusan(), err: e instanceof Error ? e.message : String(e) }
  }
  return { data: out, err: '' }
}

// Rekap register aset (aktif): count+nilai per golongan DAN per cara_perolehan
// (utk kartu jenis + donut cara perolehan). Agregasi dilakukan di DB lewat RPC
// fn_dashboard_rekap() (satu query GROUP BY) — BUKAN lagi paging seluruh tabel
// aset ke serverless lalu jumlah di JS. Perubahan 2026-07-16: setelah import
// Peralatan & Mesin (218rb baris) scan lama butuh ~230 request berurutan dalam
// satu invocation → 504 FUNCTION_INVOCATION_TIMEOUT. RPC-nya SECURITY DEFINER
// (bukan INVOKER spt yang sempat tertulis di sini — diperiksa ke DB 2026-08-14):
// ia menghitung cakupan SKPD-nya sendiri di dalam fungsi lewat `fn_is_admin()` /
// `fn_is_viewer()` / `fn_my_skpd_scope()`, jadi hasilnya tetap per-user persis
// spt scan lama — TAPI penegaknya isi fungsi itu, bukan RLS. Kalau menyuntingnya,
// cakupan itu WAJIB ikut disunting; RLS tak akan menolong sebagai jaring pengaman.
// PENTING: "disetujui" count HARUS dari aset aktif, BUKAN dari jumlah baris ledger
// jenis='pengadaan' (append-only, permanen — tak berkurang walau barangnya di-
// batal_pengadaan/unapprove kemudian, krn itu cuma nambah baris baru, bukan hapus
// baris lama). Register aset (status='aktif') adalah satu-satunya sumber yg
// mencerminkan kondisi TERKINI (sudah dikurangi soft-delete).
// ⚠️ MENGEMBALIKAN `err`, BUKAN DIAM (rules.md §2.4). Sampai 2026-08-10 fungsi
// ini menelan kegagalan (`if (!error && data)` + `catch {}` kosong) lalu
// mengembalikan objek kosong — semua kartu tampil **0 unit · 0** dan "Total
// Nilai BMD 0". Nol itu terbaca operator sebagai "asetnya belum diinput",
// padahal yang terjadi query-nya tembus statement timeout 8 dtk (agregat ini
// menyapu 418rb baris; terukur 1,4 dtk dalam kondisi TERBAIK, jadi memang
// dekat ambang). Keluarga INS-06/INS-08 — nol yang terlihat sah jauh lebih
// mahal daripada pesan error.
async function scanAset(sb: SB): Promise<{
  gol: Record<string, { count: number; nilai: number }>
  caraNilai: Record<string, number>
  caraCount: Record<string, number>
  err: string
}> {
  const gol: Record<string, { count: number; nilai: number }> = {}
  const caraNilai: Record<string, number> = {}
  const caraCount: Record<string, number> = {}
  try {
    // ⚠️ SATU KALI COBA ULANG KALAU TIMEOUT (akalan 2026-09-22, sementara
    // sampai mesin DB-nya pindah). Diukur ke produksi hari itu, sbg admin dgn
    // RLS aktif: panggilan DINGIN **9.248 ms** (lewat pagu 8.000 ms → 57014,
    // itulah strip merah yang "kadang" muncul) lawan panggilan HANGAT
    // **721 ms** dgn `shared hit=13.770`. Alasan lengkapnya di lib/rpcUlang.ts.
    const { data, error } = await rpcUlangJikaTimeout(() => sb.rpc('fn_dashboard_rekap'))
    if (error) return { gol, caraNilai, caraCount, err: error.message }
    if (!data) return { gol, caraNilai, caraCount, err: 'data kosong' }
    const d = data as {
      gol: { golongan: string; count: number; nilai: number }[]
      cara: { cara_perolehan: string; count: number; nilai: number }[]
    }
    for (const r of d.gol || []) gol[r.golongan] = { count: Number(r.count), nilai: Number(r.nilai) }
    for (const r of d.cara || []) {
      caraCount[r.cara_perolehan] = Number(r.count)
      caraNilai[r.cara_perolehan] = Number(r.nilai)
    }
  } catch (e) {
    return { gol, caraNilai, caraCount, err: e instanceof Error ? e.message : String(e) }
  }
  return { gol, caraNilai, caraCount, err: '' }
}

// ── Pengambil data ber-`cache()` ────────────────────────────────────────────
// `cache()` React men-dedup per PERMINTAAN: `getScan()` dipanggil dua komponen
// (angka "Total Nilai BMD" di kepala halaman & kartu per jenis) tapi RPC-nya
// tetap jalan SEKALI. Tanpa ini, memecah halaman jadi beberapa slot streaming
// justru MELIPATGANDAKAN query-nya.
//
// ⚠️ Ini dedup sebatas satu render, BUKAN cache lintas-permintaan. Sengaja:
// `fn_dashboard_rekap` memang SECURITY DEFINER, tapi ia menghitung cakupannya
// SENDIRI dari pemanggil (`fn_is_admin()` / `fn_is_viewer()` /
// `fn_my_skpd_scope()`, diverifikasi ke DB 2026-08-14), dan `fetchPindahEvents`
// dibaca langsung di bawah RLS — jadi hasil keduanya BEDA per user sesuai
// cakupan SKPD-nya. Menyimpannya di `unstable_cache`/cache global tanpa kunci
// identitas user = operator SKPD A melihat angka se-kabupaten milik user lain.
// JANGAN dijadikan cache lintas-permintaan tanpa memasukkan identitas user ke
// kuncinya.
const getScan = cache(() => scanAset(createClient()))
const getPindah = cache(() => countPindahAktif(createClient()))
const getHapus = cache(() => countPenghapusan(createClient()))

// Halaman ini SENGAJA tidak `async` lagi. Versi lama menunggu KETIGA query
// (`Promise.all`) sebelum mengirim satu byte pun HTML, jadi waktu tampilnya =
// query paling lambat — 7,9 dtk layar kosong. Sekarang kerangka halaman
// (judul, tajuk tiap seksi) terkirim SEKETIKA dan tiap seksi menyusul lewat
// <Suspense> begitu datanya siap, masing-masing tanpa menunggu yang lain.
export default function DashboardHome() {
  return (
    // `p-6` polos, TANPA `max-w-6xl mx-auto`: semua halaman lain di dashboard
    // memakai lebar penuh, jadi yang lama membuat Dashboard menjorok masuk ~250px
    // di kiri & kanan dan terasa tak sejajar dengan menu di sebelahnya.
    // `FitLayar`: zoom otomatis supaya muat satu layar tanpa scroll di setiap
    // ukuran jendela (lihat komponennya) — menggantikan tinggi-tinggi px yang
    // dulu disetel untuk satu kombinasi layar saja.
    <FitLayar>
    <div className="px-6 py-4">
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total Nilai BMD</p>
          {/* Pengganti skeleton = angka TERSIMPAN di browser pengguna ini (≤ 10 menit,
              redup + keterangan waktu), kalau ada. Server tetap SELALU menghitung
              ulang; lihat components/dashboard/cacheDashboard.ts. */}
          <Suspense fallback={<CadanganTotalNilai />}>
            <TotalNilai />
          </Suspense>
        </div>
      </div>

      {/* Total aset per jenis: jumlah unit + nilai rekapitulasi (harga perolehan) */}
      <Suspense fallback={<CadanganJenis />}>
        <SectionJenis />
      </Suspense>

      {/* Tiga seksi bawah di kolom kiri, kotak Indeks IPA di kolom kanan
          (mockup user 2026-09-25). Di bawah xl kotaknya turun ke bawah —
          lima kartu per baris tak muat kalau dijepit kolom 300 px di layar
          sempit. `minmax(0,1fr)`, bukan `1fr`: tanpanya kolom kiri ikut melar
          mengikuti isi terlebar & mendorong kotak IPA keluar layar. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div>
          {/* Perolehan */}
          <Section title="Total Barang per Cara Perolehan">
            <Suspense fallback={<CardsSkeleton n={5} kolom={5} />}>
              <SeksiCaraPerolehan />
            </Suspense>
          </Section>

          {/* Mutasi & transfer */}
          <Suspense fallback={<SectionSkeleton title="Mutasi & Transfer" sub="Memuat riwayat perpindahan…" n={4} kolom={4} />}>
            <SectionMutasi />
          </Suspense>

          {/* Penghapusan */}
          <Suspense fallback={<CadanganHapus />}>
            <SectionPenghapusan />
          </Suspense>
        </div>

        <div className="flex flex-col">
          <div className="mb-2">
            <h2 className="text-base font-semibold text-gray-800">Indeks Pengelolaan Aset</h2>
          </div>
          <Suspense fallback={<div className="card flex-1 p-4 animate-pulse min-h-[16rem]" aria-hidden="true" />}>
            <KartuIpa />
          </Suspense>
        </div>
      </div>
    </div>
    </FitLayar>
  )
}

// Kotak Indeks IPA: admin & pengawas melihat se-kabupaten, pengurus SKPD
// melihat SKPD induknya (lib/ipaData.ts `muatIndeksDashboard`). Angkanya dari
// snapshot bulanan `ipa_otomatis` + isian terverifikasi — murah, tak menghitung
// ulang apa pun. Gagal → kotak ini saja yang menampilkan pesannya; seksi lain
// dashboard tak ikut jatuh.
async function KartuIpa() {
  const sekarang = new Date()
  const tahun = sekarang.getFullYear()
  const bulan = sekarang.getMonth() + 1
  let data: IndeksDashboard | null = null
  let err = ''
  try { data = await muatIndeksDashboard(createClient(), tahun, bulan) }
  catch (e) { err = (e as Error).message }
  if (!data) {
    return (
      <div role="alert" className="card flex-1 p-4 text-sm text-red-700 bg-red-50 border border-red-200">
        Indeks IPA gagal dimuat — {err}
      </div>
    )
  }
  return (
    <Link href={data.href} className="card flex-1 p-4 flex flex-col items-center justify-center hover:shadow-md transition-shadow">
      <GaugeIndeks nilai={data.nilai} kategori={data.kategori} label={data.judul} ukuran={240} />
      <p className="text-xs text-gray-500 mt-2 text-center">{data.keterangan}</p>
      <p className="text-[11px] text-gray-400 mt-1">Tahun {tahun} · lihat rincian →</p>
    </Link>
  )
}

async function TotalNilai() {
  return <ViewTotalNilai scan={await getScan()} />
}

// Yang menyimpan angka `scan` ke cache browser cuma SATU seksi (ini), walau tiga
// seksi membacanya — cukup sekali per permintaan. Hanya hasil SUKSES yang
// disimpan: nol dari query gagal tak boleh muncul lagi sbg "angka tersimpan".
async function SectionJenis() {
  const scan = await getScan()
  return (
    <>
      {!scan.err && <SimpanCacheDashboard kunci="scan" data={scan} />}
      <ViewJenis scan={scan} />
    </>
  )
}

// ⚠️ `errApproved` DIOPER, bukan cuma dipakai SectionJenis. Seksi ini membaca
// `getScan()` yang SAMA, jadi kalau RPC-nya gagal, sisi "disetujui" di kelima
// kartu ini ikut nol — dan sampai 2026-09-06 nol itu tampil TANPA satu pun
// tanda di seksinya sendiri, lengkap dengan donut yang menghitung persentase
// dari angka yang tidak ada ("0% disetujui" padahal yang benar "tidak
// diketahui"). Banner di seksi ATAS tidak menutupinya: operator yang menggulir
// langsung ke seksi ini tak pernah melihatnya. Keluarga INS-06/INS-08 — nol
// yang terlihat sah lebih mahal daripada pesan error.
async function SeksiCaraPerolehan() {
  const scan = await getScan()
  const cn = scan.caraNilai
  const cc = scan.caraCount
  return (
    <CaraPerolehanCards
      errApproved={scan.err}
      approved={{ pengadaan: cc['pengadaan'] || 0, hibah: cc['hibah_masuk'] || 0, tukarMenukar: cc['tukar_menukar'] || 0, inventarisasi: cc['hasil_inventarisasi'] || 0, lainnya: cc['perolehan_lainnya'] || 0 }}
      approvedNilai={{ pengadaan: cn['pengadaan'] || 0, hibah: cn['hibah_masuk'] || 0, tukarMenukar: cn['tukar_menukar'] || 0, inventarisasi: cn['hasil_inventarisasi'] || 0, lainnya: cn['perolehan_lainnya'] || 0 }} />
  )
}

async function SectionMutasi() {
  const pindah = await getPindah()
  return (
    <Section title="Mutasi & Transfer">
      {/* Sama alasannya dgn banner scanAset: angka 0 yang lahir dari query
          gagal terbaca sebagai "belum ada perpindahan" — katakan apa adanya. */}
      {pindah.err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
          <span className="font-semibold">Riwayat perpindahan gagal dimuat</span> — {pindah.err}.
          Angka &ldquo;disetujui&rdquo; di bawah <span className="font-semibold">bukan nol yang sebenarnya</span>.
        </div>
      )}
      <MutasiTransferCards approved={{ transfer: pindah.transfer, mutasiInternal: pindah.mutasiInternal }} />
    </Section>
  )
}

async function SectionPenghapusan() {
  const hapus = await getHapus()
  return (
    <>
      {!hapus.err && <SimpanCacheDashboard kunci="hapus" data={hapus} />}
      <ViewHapus hapus={hapus} />
    </>
  )
}
