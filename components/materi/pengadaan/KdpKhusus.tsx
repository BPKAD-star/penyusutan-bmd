'use client'
// Materi "Entry Belanja Modal · Pengadaan" — dua kasus khusus Pekerjaan
// Konstruksi (diskusi user 2026-10-06):
//   1. Perencanaan cair DULU, kontrak fisik menyusul (bulan/tahun berikutnya).
//   2. Perencanaan GELONDONGAN yang belum diketahui untuk berapa pekerjaan fisik.
// Keduanya memakai menu yang sudah ada (Pekerjaan Konstruksi, Koreksi ›
// Pemecahan, Kapitalisasi, Reklasifikasi) — tak ada fitur baru. Aturan yang
// disebut di slide (induk lebih tua dari anak, Check LRA hanya membaca entry
// disetujui, Pemecahan KDP tanpa data penyusutan) diperiksa ke kode 2026-10-06.
import { SlideTerang, Poin, Catatan, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[470px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[620px]'

// ── 1. Perencanaan dulu, fisik belakangan ───────────────────────────────────
const ALUR: { kapan: string; ikon: NamaIkon; judul: string; isi: string; ok?: string }[] = [
  { kapan: 'Maret', ikon: 'dokumen', judul: 'Perencanaan cair', isi: 'Kartu paket + kontrak perencanaan → termin Perencanaan → disetujui. Barang KDP terbit.', ok: 'Rekon April cocok' },
  { kapan: 'Juni', ikon: 'gedung', judul: 'Kontrak fisik — kartu yang SAMA', isi: 'Tambah kontrak fisik & pengawasan di kartu itu. Tiap termin disetujui menambah nilai barang yang sama.', ok: 'NIBAR tetap' },
  { kapan: 'Selesai', ikon: 'ulang', judul: 'Reklasifikasi', isi: 'KDP → Gedung & Bangunan. Penyusutan mulai sejak direklas.' },
  { kapan: 'Lintas tahun', ikon: 'tukar', judul: 'Kartu baru + Kapitalisasi', isi: 'Fisik tahun depan → kartu baru tahun itu. Selesai: Kapitalisasi (induk = KDP perencanaan) lalu Reklas.' },
]

export function PerencanaanDulu() {
  return (
    <SlideTerang materi={MATERI} label="Kasus khusus · 1" judul="Perencanaan cair dulu, fisik menyusul">
      <div className={KIRI}>
        <Poin jeda={250}>Perencanaan dicatat <b>saat cair</b>: kartu paket + kontrak perencanaan, termin disetujui — jangan menunggu kontrak fisik.</Poin>
        <Poin jeda={450}>Check LRA hanya membaca termin yang <b>sudah disetujui</b>. Termin yang masih menunggu tetap terbaca <b>selisih</b>.</Poin>
        <Poin jeda={650}>Kontrak fisik tahun yang sama ditambahkan ke <b>kartu yang sama</b> — barangnya tetap satu, NIBAR tak berganti.</Poin>
        <Poin jeda={850}>Selesai (BAPP) → <b>Reklasifikasi</b> ke Gedung; penyusutan mulai saat itu.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="kalender">
          <b>Satu kartu = satu tahun.</b> Fisik tahun depan → kartu baru tahun itu, lalu disatukan lewat <b>Kapitalisasi</b> (induk = KDP perencanaan) sebelum direklas.
        </Catatan>
      </div>
      <div className={KANAN}>
        <div className="relative pl-[92px]">
          <div className="mt-tinggi absolute left-[72px] top-3 bottom-3 w-[3px] rounded-full bg-teal/30" style={d(300)} />
          <div className="space-y-3">
            {ALUR.map((a, i) => (
              <div key={a.judul} className="mt-kanan relative" style={d(400 + i * 220)}>
                <span className="absolute -left-[92px] top-3 w-[60px] text-right text-[14px] font-bold text-navy">{a.kapan}</span>
                <span className="absolute -left-[31px] top-3 w-[22px] h-[22px] rounded-full bg-teal border-4 border-white shadow" />
                <div className="rounded-xl border border-gray-200 bg-white shadow-md px-4 py-3 flex gap-3">
                  <span className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center flex-shrink-0"><Ikon nama={a.ikon} ukuran={22} /></span>
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold text-navy leading-tight">{a.judul}</p>
                    <p className="mt-0.5 text-[14px] text-gray-600 leading-snug">{a.isi}</p>
                    {a.ok && <p className="mt-1 text-[13px] font-semibold text-teal">✓ {a.ok}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideTerang>
  )
}

// ── 2. Perencanaan gelondongan ──────────────────────────────────────────────
function Kotak({ judul, nilai, nada = 'putih', jeda }: { judul: string; nilai: string; nada?: 'putih' | 'teal' | 'abu'; jeda: number }) {
  const gaya = nada === 'teal' ? 'border-teal bg-teal/10' : nada === 'abu' ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
  return (
    <div className={`mt-pop rounded-xl border-2 ${gaya} px-4 py-2.5 shadow-sm`} style={d(jeda)}>
      <p className="text-[14.5px] font-bold text-navy leading-tight">{judul}</p>
      <p className="text-[13.5px] text-gray-600 tabular-nums">{nilai}</p>
    </div>
  )
}
const Panah = ({ teks, jeda }: { teks: string; jeda: number }) => (
  <div className="mt-in flex items-center gap-2 pl-6 text-[13px] font-semibold text-amber-700" style={d(jeda)}>
    <span className="text-[18px] leading-none">↓</span>{teks}
  </div>
)

export function PerencanaanGelondongan() {
  return (
    <SlideTerang materi={MATERI} label="Kasus khusus · 2" judul="Perencanaan gelondongan — dipecah saat dibutuhkan">
      <div className={KIRI}>
        <Poin jeda={250}>Belum tahu untuk <b>berapa pekerjaan fisik</b>? Catat dulu sebagai <b>satu KDP perencanaan</b>.</Poin>
        <Poin jeda={450}>Begitu satu pekerjaan fisik jelas: <b>Koreksi › Pemecahan Barang</b> → bagian untuk fisik itu + <b>sisa</b>.</Poin>
        <Poin jeda={650}>Bagian itu <b>dikapitalisasi</b> ke KDP fisiknya. Sisanya dipecah lagi saat fisik berikutnya muncul.</Poin>
        <Poin jeda={850}>Dasar pembagian: rincian DED per lokasi atau <b>proporsi nilai fisik</b> — unggah nota dinas / BA alokasinya.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="lampu">
          Total pecahan = nilai induk. Pecahan <b>mewarisi tanggal perolehan</b>, jadi tetap bisa jadi induk Kapitalisasi. Sisa yang tak kunjung terpakai <b>tinjau tiap akhir tahun</b>.
        </Catatan>
      </div>
      <div className={KANAN}>
        <div className="space-y-2">
          <Kotak judul="KDP Perencanaan (gelondongan)" nilai="Rp90.000.000" jeda={350} />
          <Panah teks="Pemecahan — pekerjaan fisik Gedung A sudah jelas" jeda={600} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Kotak judul="Perencanaan Gedung A" nilai="Rp54.000.000" nada="teal" jeda={800} />
              <Panah teks="Kapitalisasi ke KDP fisik Gedung A" jeda={1000} />
              <Kotak judul="KDP Gedung A (perencanaan + fisik)" nilai="→ direklas ke Gedung saat selesai" nada="teal" jeda={1200} />
            </div>
            <div className="space-y-2">
              <Kotak judul="Sisa perencanaan" nilai="Rp36.000.000" nada="abu" jeda={900} />
              <Panah teks="Dipecah lagi saat Gedung B jelas" jeda={1100} />
              <div className="grid grid-cols-2 gap-2">
                <Kotak judul="Gedung B" nilai="Rp27.000.000" nada="teal" jeda={1300} />
                <Kotak judul="Sisa" nilai="Rp9.000.000" nada="abu" jeda={1400} />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-in mt-3 text-[13px] text-gray-400" style={d(1600)}>Ilustrasi — angka contoh.</p>
      </div>
    </SlideTerang>
  )
}
