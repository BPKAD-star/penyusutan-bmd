// Tampilan seksi Dashboard yang digambar MURNI dari angka — dipakai DUA sisi:
//   · server (app/dashboard/page.tsx) dgn angka yang baru dihitung, dan
//   · browser (CadanganDashboard.tsx) dgn angka tersimpan selama angka baru
//     belum tiba.
// Satu komponen untuk keduanya supaya versi tersimpan tak bisa menyimpang
// tampilannya dari versi asli. ⚠️ Karena itu berkas ini TANPA 'use client' dan
// tak boleh mengimpor apa pun yang khusus server (cookies, createClient server).
//
// Isinya dipindah apa adanya dari app/dashboard/page.tsx (2026-10-03); komentar
// alasan tiap keputusan tampilannya ikut pindah.
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah2 } from '@/lib/export'
import PenghapusanCards from '@/components/dashboard/PenghapusanCards'
import { jamCache, type ScanDashboard, type HapusDashboard } from '@/components/dashboard/cacheDashboard'

const nf = (n: number) => n.toLocaleString('id-ID')

// Penanda angka TERSIMPAN (bukan yang baru dihitung) — redup + keterangan waktu.
// Lewat prop, BUKAN div pembungkus: pembungkus menggeser `last:mb-0` seksi &
// kartunya melompat begitu angka baru menggantikannya.
const KELAS_REDUP = 'opacity-60 pointer-events-none select-none'
export const teksTersimpan = (t: number) => `Angka tersimpan pukul ${jamCache(t)} — memuat angka terbaru…`

// ── Ilustrasi per golongan (sisi kanan kartu "Total Aset per Jenis") ────────
// Berkasnya di public/dashboard/, sudah DIOLAH dari PNG 1920×1080 aslinya
// (±500 KB/gambar): latar putih dibuang jadi transparan, dipotong ke objeknya,
// diperkecil ke ±360×270 px (3× kotak tampil, tetap tajam di layar retina),
// lalu disimpan WebP → ±20 KB/gambar, 176 KB untuk kedelapannya.
// Daftarnya EKSPLISIT, sengaja tak dirakit dari kode golongan: golongan baru
// yang belum punya gambar cukup tak bergambar, bukan ikon gambar rusak.
// Mengganti gambar → ganti NAMA berkasnya juga, supaya peramban yang sudah
// menyimpan versi lama tak terus menampilkannya.
const ILUSTRASI_GOLONGAN: Record<string, string> = {
  '1.3.1': '/dashboard/aset-1-3-1.webp',
  '1.3.2': '/dashboard/aset-1-3-2.webp',
  '1.3.3': '/dashboard/aset-1-3-3.webp',
  '1.3.4': '/dashboard/aset-1-3-4.webp',
  '1.3.5': '/dashboard/aset-1-3-5.webp',
  '1.3.6': '/dashboard/aset-1-3-6.webp',
  '1.5.3': '/dashboard/aset-1-5-3.webp',
  '1.5.4': '/dashboard/aset-1-5-4.webp',
}

// Latar dua lengkung S di sisi kanan kartu, meniru gambar acuan user
// (2026-09-14): pita luar hijau sangat muda, bidang dalam hijau mint, keduanya
// berpangkal di tepi atas lalu melebar ke bawah-kiri. Koordinatnya dipetakan
// langsung dari acuan 1920×1080, jadi viewBox-nya pun sama.
// `slice` — BUKAN `none`: `none` meregangkan lengkungnya jadi pita miring kaku.
// Warna HEX utuh lewat atribut, bukan kelas Tailwind yang dirakit.
function LatarIlustrasi() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1920 1080" preserveAspectRatio="xMaxYMid slice"
      className="lg:max-xl:hidden absolute inset-0 w-full h-full pointer-events-none">
      <path fill="#ECFBF1" d="M1470,0 C1400,210 1160,330 960,460 C790,570 700,760 700,1080 L1920,1080 L1920,0 Z" />
      <path fill="#CDF1D9" d="M1480,0 C1420,230 1190,380 1070,520 C985,620 985,820 990,1080 L1920,1080 L1920,0 Z" />
    </svg>
  )
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    // `last:mb-0`: margin seksi TERAKHIR (Penghapusan) + padding halaman
    // membuat Dashboard lebih tinggi ±10 px dari layar 1920×1080 zoom 90%,
    // jadi muncul scrollbar untuk ruang kosong (keluhan user 2026-09-14).
    <div className="mb-5 last:mb-0">
      <div className="mb-2">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

// Kerangka kartu selagi datanya menyusul. Tingginya sengaja dibuat mendekati
// kartu sungguhan supaya isinya tidak "meloncat" saat data tiba.
export function CardsSkeleton({ n, kolom }: { n: number; kolom: 4 | 5 }) {
  // Kelas grid ditulis UTUH, bukan dirakit lewat template string — Tailwind
  // memindai kode sumber secara literal, jadi `lg:grid-cols-${kolom}` tak akan
  // pernah ikut ter-generate ke CSS-nya.
  const grid = kolom === 5
    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2'
  return (
    <div className={grid} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card p-3 animate-pulse">
          <div className="h-9 w-9 rounded-lg bg-gray-100" />
          <div className="h-3 w-3/4 rounded bg-gray-100 mt-2" />
          <div className="h-5 w-1/2 rounded bg-gray-100 mt-2" />
          <div className="h-3 w-2/3 rounded bg-gray-100 mt-1.5" />
        </div>
      ))}
    </div>
  )
}

export function SectionSkeleton({ title, sub, n, kolom }: { title: string; sub: string; n: number; kolom: 4 | 5 }) {
  return (
    <Section title={title} sub={sub}>
      <CardsSkeleton n={n} kolom={kolom} />
    </Section>
  )
}

/** Angka "Total Nilai BMD" di kanan atas. `redup` = angka tersimpan, bukan yang baru dihitung. */
export function ViewTotalNilai({ scan, tersimpanPada }: { scan: ScanDashboard; tersimpanPada?: number }) {
  const redup = tersimpanPada != null
  const totalNilai = Object.values(scan.gol).reduce((s, v) => s + v.nilai, 0)
  const totalRegister = Object.values(scan.gol).reduce((s, v) => s + v.count, 0)
  // Saat gagal: JANGAN tampilkan Rp0 — itu angka yang terlihat sah.
  return (
    <>
      <p className={`text-2xl font-bold ${redup ? 'text-gray-400' : 'text-teal'}`}>{scan.err ? '—' : formatRupiah2(totalNilai)}</p>
      {/* Jumlah unit register — dipindah ke sini dari sub-judul "Total Aset per
          Jenis" (permintaan user 2026-09-10). */}
      {!scan.err && <p className="text-xs text-gray-400 mt-0.5">{nf(totalRegister)} aset{redup ? ` · tersimpan ${jamCache(tersimpanPada)}` : ''}</p>}
    </>
  )
}

export function ViewJenis({ scan, tersimpanPada }: { scan: ScanDashboard; tersimpanPada?: number }) {
  const gol = scan.gol
  const redup = tersimpanPada != null
  return (
    <>
      {scan.err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          <span className="font-semibold">Rekap aset gagal dimuat</span> — {scan.err}.
          Angka di kartu di bawah <span className="font-semibold">bukan nol yang sebenarnya</span>, melainkan
          data yang tidak berhasil diambil. Muat ulang halaman; kalau berulang, kabari admin.
        </div>
      )}
      {/* Sub-judul "Register BMD — N aset · Rp…" dipindah: jumlah aset kini di
          bawah "Total Nilai BMD" (kanan atas), lihat ViewTotalNilai. */}
      <Section title="Total Aset per Jenis" sub={redup ? teksTersimpan(tersimpanPada) : undefined}>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2${redup ? ` ${KELAS_REDUP}` : ''}`} aria-busy={redup || undefined}>
          {GOLONGAN_REKAP.map(g => {
            const d = gol[g.kode] || { count: 0, nilai: 0 }
            return (
              // Tinggi 164 px (dulu ±111): di 1920×1080 zoom 90% halaman
              // menyisakan ruang kosong di bawah, jadi kartu jenis aset yang
              // dibesarkan (permintaan user 2026-09-14).
              <div key={g.kode} className="card relative overflow-hidden min-h-[164px] flex gap-2 px-4 py-4">
                {/* Latar dua lengkung, menggantikan ikon di pojok kiri atas.
                    Ikut disembunyikan di 1024–1279 px bersama gambarnya —
                    latar tanpa objek di depannya cuma noda. */}
                {ILUSTRASI_GOLONGAN[g.kode] && <LatarIlustrasi />}
                {/* Kolom kiri: jenis aset + nilai perolehan RATA KIRI ATAS,
                    jumlah unit RATA KIRI BAWAH (`justify-between`). Kolom ini
                    tak boleh menyusut (angka rupiah tak boleh terpotong); kolom
                    gambar yang MENGALAH. */}
                <div className="relative z-10 flex-shrink-0 flex flex-col justify-between">
                  <div>
                    {/* `w-0 min-w-full` + nowrap: judul tetap SATU BARIS tapi
                        TIDAK ikut menentukan lebar kolom — kalau ikut, judul
                        panjang (KDP) melebarkan kolom & gambarnya menciut.
                        Ekornya boleh melewati kolom (z-10 di atas gambar). */}
                    <p className="w-0 min-w-full whitespace-nowrap text-xs min-[1800px]:text-[13px] text-gray-700 leading-tight" title={`${g.kode} · ${g.uraian}`}>
                      <span className="text-gray-400">{g.kode}</span> · {g.uraian}
                    </p>
                    {/* Gagal → `–`, BUKAN `0`. Angka nol di kartu ini tak bisa
                        dibedakan dari golongan yang memang belum ada isinya.
                        Ukurannya naik bertahap: di layar sempit angka 20 digit
                        itu yang menjepit gambar. */}
                    <p className="text-sm 2xl:text-base min-[1800px]:text-lg font-bold text-teal mt-1 whitespace-nowrap">{scan.err ? <span className="text-gray-300">–</span> : formatRupiah2(d.nilai)}</p>
                  </div>
                  <p className="text-xl min-[1800px]:text-2xl font-bold text-gray-900 whitespace-nowrap leading-none">
                    {scan.err ? <span className="text-gray-300">–</span>
                              : <>{nf(d.count)} <span className="text-xs font-normal text-gray-500">unit</span></>}
                  </p>
                </div>
                {ILUSTRASI_GOLONGAN[g.kode] && (
                  <div className="lg:max-xl:hidden relative flex-1 min-w-0 flex items-center justify-end">
                    {/* eslint-disable-next-line @next/next/no-img-element -- berkas statis yang SUDAH dioptimasi; next/image cuma menambah panggilan optimizer */}
                    <img src={ILUSTRASI_GOLONGAN[g.kode]} alt="" aria-hidden="true"
                      width={160} height={120} decoding="async" draggable={false}
                      className="w-full max-w-[160px] h-auto max-h-[124px] object-contain object-right select-none drop-shadow-[0_4px_6px_rgba(15,23,42,0.18)]" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}

export function ViewHapus({ hapus, tersimpanPada }: { hapus: HapusDashboard; tersimpanPada?: number }) {
  const redup = tersimpanPada != null
  return (
    <Section title="Penghapusan Barang" sub={redup ? teksTersimpan(tersimpanPada) : undefined}>
      {hapus.err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
          <span className="font-semibold">Riwayat penghapusan gagal dimuat</span> — {hapus.err}.
          Angka di kartu di bawah <span className="font-semibold">bukan nol yang sebenarnya</span>.
        </div>
      )}
      {/* Versi tersimpan TAK BISA DIKLIK: pop-up rincian yang terbuka akan
          lenyap begitu angka baru menggantikan kartu ini (komponennya dibongkar). */}
      {redup
        ? <div className={KELAS_REDUP} aria-busy="true"><PenghapusanCards data={hapus.data} /></div>
        : <PenghapusanCards data={hapus.data} />}
    </Section>
  )
}
