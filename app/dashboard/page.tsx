import { Suspense, cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { fetchPindahEvents, pindahAktif } from '@/lib/pengalihan'
import CaraPerolehanCards from '@/components/dashboard/CaraPerolehanCards'
import MutasiTransferCards from '@/components/dashboard/MutasiTransferCards'
import PenghapusanCards, { type PenghapusanData } from '@/components/dashboard/PenghapusanCards'

const PERIODE = '2026-S1'

function formatRp(val: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val)
}
const nf = (n: number) => n.toLocaleString('id-ID')

// ── Ikon per golongan (kartu "Total Aset per Jenis") ────────────────────────
// Outline 24×24 stroke-currentColor, satu gaya dgn ikon sidebar. Ukurannya
// sengaja dipatok: badge 36px (w-9) berisi ikon 20px (w-5) — ikon mengisi ~55%
// kotaknya, jadi tidak tenggelam maupun sesak. Kalau menambah golongan baru,
// tambahkan ikonnya di sini; yang tak terdaftar jatuh ke ikon kotak arsip.
const IKON_GOLONGAN: Record<string, React.ReactNode> = {
  // Tanah — pin peta
  '1.3.1': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></>,
  // Peralatan & Mesin — perangkat/komputer
  '1.3.2': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />,
  // Gedung & Bangunan — gedung kantor
  '1.3.3': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />,
  // Jalan, Jaringan & Irigasi — badan jalan bermarka
  '1.3.4': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4.5 21L8.25 3M19.5 21L15.75 3M12 4.5v3m0 3.75v3m0 3.75v3" />,
  // Aset Tetap Lainnya — buku (koleksi perpustakaan, tanaman, hewan)
  '1.3.5': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
  // Konstruksi Dalam Pengerjaan — crane menara
  '1.3.6': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4.5 21h6M7.5 21V4.5m-4 2.25h16.5M7.5 10.5l3.75-3.75M15.75 6.75v4.5m-1.875 0h3.75" />,
  // Aset Tidak Berwujud — kurung kode (perangkat lunak, lisensi)
  '1.5.3': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M17.25 6.75L22.5 12l-5.25 5.25M6.75 17.25L1.5 12l5.25-5.25M14.25 3.75l-4.5 16.5" />,
  // Aset Lain-Lain — kotak arsip barang rusak/tak terpakai
  '1.5.4': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M9.75 11.25l4.5 4.5m0-4.5l-4.5 4.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
}
const IKON_LAIN = IKON_GOLONGAN['1.5.4']

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
    let terakhir = 0
    for (;;) {
      const { data, error } = await sb.from('transaksi_bmd')
        .select('id,jenis,nilai,payload,aset(status)')
        .in('jenis', ['penghapusan_pemindahtanganan', 'penghapusan_sebab_lain'])
        .gt('id', terakhir)
        .order('id', { ascending: true })
        .limit(1000)
      // Gagal di tengah = angka SEBAGIAN. Kembalikan nol + pesan, jangan
      // hitungan separuh yang terlihat sah.
      if (error) return { data: nolPenghapusan(), err: error.message }
      if (!data || data.length === 0) break
      const rows = data as unknown as {
        id: number; jenis: string; nilai: number
        payload: { sub_jenis?: string } | null
        aset: { status: string } | null
      }[]
      for (const r of rows) {
        terakhir = r.id
        if (r.aset?.status !== 'dihapus') continue
        const nilai = r.nilai || 0
        if (r.jenis === 'penghapusan_sebab_lain') { out.sebabLain.n++; out.sebabLain.nilai += nilai; continue }
        const sub = r.payload?.sub_jenis
        if (sub === 'hibah') { out.hibah.n++; out.hibah.nilai += nilai }
        else if (sub === 'penjualan') { out.jual.n++; out.jual.nilai += nilai }
        else if (sub === 'tukar_menukar') { out.tukar.n++; out.tukar.nilai += nilai }
        else if (sub === 'penyertaan_modal') { out.modal.n++; out.modal.nilai += nilai }
        else { out.sebabLain.n++; out.sebabLain.nilai += nilai } // fallback data lama tanpa sub_jenis dikenal
      }
      if (rows.length < 1000) break
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
    const { data, error } = await sb.rpc('fn_dashboard_rekap')
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
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Ringkasan BMD Kabupaten Kediri — Periode {PERIODE}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total Nilai BMD</p>
          <Suspense fallback={<p className="text-2xl font-bold text-gray-200 animate-pulse">••••</p>}>
            <TotalNilai />
          </Suspense>
        </div>
      </div>

      {/* Total aset per jenis: jumlah unit + nilai rekapitulasi (harga perolehan) */}
      <Suspense fallback={<SectionSkeleton title="Total Aset per Jenis" sub="Memuat rekap register…" n={8} kolom={4} />}>
        <SectionJenis />
      </Suspense>

      {/* Perolehan */}
      <Section title="Total Barang per Cara Perolehan" sub="Jumlah barang masuk berdasarkan cara perolehan — klik utk rincian disetujui/menunggu">
        <Suspense fallback={<CardsSkeleton n={5} kolom={5} />}>
          <SeksiCaraPerolehan />
        </Suspense>
      </Section>

      {/* Mutasi & transfer */}
      <Suspense fallback={<SectionSkeleton title="Mutasi & Transfer" sub="Memuat riwayat perpindahan…" n={4} kolom={4} />}>
        <SectionMutasi />
      </Suspense>

      {/* Penghapusan */}
      <Suspense fallback={<SectionSkeleton title="Penghapusan Barang" sub="Memuat riwayat penghapusan…" n={5} kolom={5} />}>
        <SectionPenghapusan />
      </Suspense>
    </div>
  )
}

async function TotalNilai() {
  const scan = await getScan()
  const totalNilai = Object.values(scan.gol).reduce((s, v) => s + v.nilai, 0)
  // Saat gagal: JANGAN tampilkan Rp0 — itu angka yang terlihat sah.
  return <p className="text-2xl font-bold text-teal">{scan.err ? '—' : formatRp(totalNilai)}</p>
}

async function SectionJenis() {
  const scan = await getScan()
  const gol = scan.gol
  const totalRegister = Object.values(gol).reduce((s, v) => s + v.count, 0)
  const totalNilai = Object.values(gol).reduce((s, v) => s + v.nilai, 0)

  return (
    <>
      {scan.err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          <span className="font-semibold">Rekap aset gagal dimuat</span> — {scan.err}.
          Angka di kartu di bawah <span className="font-semibold">bukan nol yang sebenarnya</span>, melainkan
          data yang tidak berhasil diambil. Muat ulang halaman; kalau berulang, kabari admin.
        </div>
      )}
      <Section title="Total Aset per Jenis"
        sub={`Register BMD — ${nf(totalRegister)} aset · ${formatRp(totalNilai)}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {GOLONGAN_REKAP.map(g => {
            const d = gol[g.kode] || { count: 0, nilai: 0 }
            return (
              <div key={g.kode} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-teal/10 text-teal flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      {IKON_GOLONGAN[g.kode] ?? IKON_LAIN}
                    </svg>
                  </span>
                  <p className="text-[11px] text-gray-400">{g.kode}</p>
                </div>
                <p className="text-xs text-gray-600 leading-tight mt-2 h-8">{g.uraian}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{nf(d.count)} <span className="text-xs font-normal text-gray-400">unit</span></p>
                <p className="text-xs font-medium text-teal mt-1">{formatRp(d.nilai)}</p>
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}

async function SeksiCaraPerolehan() {
  const scan = await getScan()
  const cn = scan.caraNilai
  const cc = scan.caraCount
  return (
    <CaraPerolehanCards
      approved={{ pengadaan: cc['pengadaan'] || 0, hibah: cc['hibah_masuk'] || 0, tukarMenukar: cc['tukar_menukar'] || 0, inventarisasi: cc['hasil_inventarisasi'] || 0, lainnya: cc['perolehan_lainnya'] || 0 }}
      approvedNilai={{ pengadaan: cn['pengadaan'] || 0, hibah: cn['hibah_masuk'] || 0, tukarMenukar: cn['tukar_menukar'] || 0, inventarisasi: cn['hasil_inventarisasi'] || 0, lainnya: cn['perolehan_lainnya'] || 0 }} />
  )
}

async function SectionMutasi() {
  const pindah = await getPindah()
  return (
    <Section title="Mutasi & Transfer" sub="Perpindahan barang antar / dalam SKPD — proporsi sudah di-acc vs masih menunggu persetujuan">
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
    <Section title="Penghapusan Barang" sub="Barang yang dihapus dari laporan (data tetap tersimpan) — klik utk rincian per SKPD">
      {hapus.err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
          <span className="font-semibold">Riwayat penghapusan gagal dimuat</span> — {hapus.err}.
          Angka di kartu di bawah <span className="font-semibold">bukan nol yang sebenarnya</span>.
        </div>
      )}
      <PenghapusanCards data={hapus.data} />
    </Section>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
      {children}
    </div>
  )
}

// Kerangka kartu selagi datanya menyusul. Tingginya sengaja dibuat mendekati
// kartu sungguhan supaya isinya tidak "meloncat" saat data tiba.
function CardsSkeleton({ n, kolom }: { n: number; kolom: 4 | 5 }) {
  // Kelas grid ditulis UTUH, bukan dirakit lewat template string — Tailwind
  // memindai kode sumber secara literal, jadi `lg:grid-cols-${kolom}` tak akan
  // pernah ikut ter-generate ke CSS-nya.
  const grid = kolom === 5
    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'
  return (
    <div className={grid} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="h-9 w-9 rounded-lg bg-gray-100" />
          <div className="h-3 w-3/4 rounded bg-gray-100 mt-3" />
          <div className="h-5 w-1/2 rounded bg-gray-100 mt-2" />
          <div className="h-3 w-2/3 rounded bg-gray-100 mt-2" />
        </div>
      ))}
    </div>
  )
}

function SectionSkeleton({ title, sub, n, kolom }: { title: string; sub: string; n: number; kolom: 4 | 5 }) {
  return (
    <Section title={title} sub={sub}>
      <CardsSkeleton n={n} kolom={kolom} />
    </Section>
  )
}
