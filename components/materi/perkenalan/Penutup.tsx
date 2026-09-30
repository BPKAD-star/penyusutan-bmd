'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 14–16: aturan main saat
// mencatat, langkah sesudah paparan, penutup.
import { SlideGelap, SlideTerang, Merek, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI } from './Pembuka'

const ATURAN: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'dokumen', judul: 'Dokumen dasar wajib', isi: 'BAST, SK, atau perjanjian diunggah saat transaksi dicatat.' },
  { ikon: 'kamera', judul: 'Foto barang wajib', isi: 'Perolehan baru tidak bisa disetujui tanpa foto barangnya.' },
  { ikon: 'kalender', judul: 'Pakai tanggal dokumen', isi: 'Bukan tanggal yang akan datang, bukan tahun yang sudah ditutup.' },
  { ikon: 'ulang', judul: 'Salah catat → Batal / Koreksi', isi: 'Tidak ada hapus diam-diam; riwayat barang tetap utuh.' },
  { ikon: 'tukar', judul: 'Pindah SKPD perlu diterima', isi: 'Barang baru berpindah setelah SKPD tujuan menekan Terima.' },
  { ikon: 'gembok', judul: 'Tahun yang ditutup terkunci', isi: 'Angka yang sudah dilaporkan tidak berubah lagi.' },
]

export function AturanMain() {
  return (
    <SlideTerang materi={MATERI} label="Aturan main" judul="Yang perlu diingat saat mencatat">
      <div className="grid grid-cols-3 gap-5">
        {ATURAN.map((a, i) => (
          <div key={a.judul} className="mt-up relative rounded-2xl border border-gray-200 bg-white shadow-md p-6 h-[218px] overflow-hidden" style={d(200 + i * 120)}>
            <span className="absolute right-4 top-2 text-[64px] font-bold text-navy/[0.06] leading-none select-none">{i + 1}</span>
            <div className="mt-pop w-14 h-14 rounded-xl bg-navy text-white flex items-center justify-center" style={d(380 + i * 120)}>
              <Ikon nama={a.ikon} ukuran={28} />
            </div>
            <p className="mt-4 text-[21px] font-bold text-navy leading-tight">{a.judul}</p>
            <p className="mt-2 text-[16px] text-gray-600 leading-snug">{a.isi}</p>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

const TINDAK = [
  ['Login & periksa nama profil', 'pojok kanan atas layar'],
  ['Cocokkan Daftar Barang dengan kondisi sebenarnya', 'jenis, jumlah, dan kondisi barang'],
  ['Lengkapi titik koordinat seluruh tanah', 'menu GIS Tanah'],
  ['Lengkapi spesifikasi & foto barang', 'Edit Spesifikasi atau Koreksi'],
  ['Sampaikan kendala yang ditemui', 'chat di aplikasi atau menu Notes'],
]

export function Tindak() {
  return (
    <SlideTerang materi={MATERI} label="Tindak lanjut" judul="Langkah setelah paparan ini">
      <div className="absolute left-0 top-0 w-[660px]">
        <svg className="absolute left-[21px] top-[22px]" width="4" height="376" aria-hidden>
          <line x1="2" y1="0" x2="2" y2="376" stroke="#0d9488" strokeWidth="4" strokeOpacity=".3" pathLength={1} className="mt-gambar" style={{ ...d(300), animationDuration: '2.2s' }} />
        </svg>
        <div className="space-y-[22px]">
          {TINDAK.map(([judul, ket], i) => (
            <div key={judul} className="mt-kiri relative flex items-center gap-5" style={d(300 + i * 320)}>
              <span className="mt-pop w-[46px] h-[46px] rounded-full bg-teal text-white flex items-center justify-center flex-shrink-0 shadow-md" style={d(450 + i * 320)}>
                <Ikon nama="centang" ukuran={24} tebal={3} />
              </span>
              <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-3">
                <p className="text-[19.5px] font-bold text-navy leading-tight">{judul}</p>
                <p className="text-[15px] text-gray-500 mt-0.5">{ket}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-kanan absolute right-0 top-0 w-[440px] rounded-2xl bg-navy text-white p-8 shadow-2xl" style={d(900)}>
        <p className="text-[14px] font-semibold tracking-[0.18em] uppercase text-amber-300">Butuh bantuan?</p>
        <div className="mt-5 flex gap-4">
          <div className="relative w-14 h-14 flex-shrink-0">
            <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full bg-teal-light/40" />
            <div className="relative w-full h-full rounded-full bg-teal flex items-center justify-center"><Ikon nama="obrolan" ukuran={28} /></div>
          </div>
          <div>
            <p className="text-[20px] font-bold">Chat di aplikasi</p>
            <p className="text-[16px] text-white/70 leading-snug mt-1">Tombol bulat di pojok kanan bawah: tanya Asisten AI, grup, atau admin langsung.</p>
          </div>
        </div>
        <div className="mt-6 flex gap-4">
          <div className="w-14 h-14 rounded-full bg-white/[0.12] border border-white/20 flex items-center justify-center flex-shrink-0"><Ikon nama="lampu" ukuran={28} /></div>
          <div>
            <p className="text-[20px] font-bold">Saran & masukan</p>
            <p className="text-[16px] text-white/70 leading-snug mt-1 mb-2">Tulis di menu:</p>
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
              <span className="px-2.5 py-1 rounded-md bg-white/[0.15]">Admin</span><span className="text-amber-300">›</span>
              <span className="px-2.5 py-1 rounded-md bg-white/[0.15]">Notes</span>
            </span>
          </div>
        </div>
      </div>
    </SlideTerang>
  )
}

export function Penutup() {
  return (
    <SlideGelap materi={MATERI} tanpaKaki>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="relative w-[150px] h-[150px]">
          <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full border-2 border-teal-light/60" />
          <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full border-2 border-teal-light/60" style={d(1200)} />
          <div className="mt-pop absolute inset-0 rounded-full bg-white shadow-2xl flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kab-kediri.png" alt="Logo Kabupaten Kediri" className="w-[94px] h-[94px] object-contain" />
          </div>
        </div>
        <h2 className="mt-up mt-9 text-[76px] font-bold leading-none" style={d(250)}>Terima kasih</h2>
        <div className="mt-lebar mt-7 w-28 h-1.5 rounded-full bg-amber-400" style={{ ...d(500), transformOrigin: 'center' }} />
        <p className="mt-up mt-7 text-[26px] font-medium text-white/[0.85]" style={d(650)}>
          Data lengkap <span className="text-amber-300 mx-2">·</span> Laporan terpercaya <span className="text-amber-300 mx-2">·</span> Aset terjaga
        </p>
        <p className="mt-in mt-10 text-[17px] text-white/60" style={d(950)}>
          <Merek gelap /> <span className="mx-2">—</span> Badan Keuangan dan Aset Daerah Kabupaten Kediri
        </p>
      </div>
    </SlideGelap>
  )
}
