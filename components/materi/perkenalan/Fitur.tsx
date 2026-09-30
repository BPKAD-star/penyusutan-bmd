'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 5–8: yang bisa dikerjakan,
// alur pencatatan, fitur unggulan, keluaran laporan.
import type { ReactNode } from 'react'
import { SlideTerang, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI } from './Pembuka'

const KERJA: { ikon: NamaIkon; judul: string; ket: string; butir: string[]; kaki: string }[] = [
  {
    ikon: 'keranjang', judul: 'Mencatat perolehan', ket: 'Barang masuk ke register',
    butir: ['Pengadaan', 'Pekerjaan Konstruksi', 'Hibah', 'Tukar Menukar', 'Hasil Inventarisasi', 'Perolehan Lainnya'],
    kaki: 'Entri satu per satu atau Import Excel',
  },
  {
    ikon: 'tukar', judul: 'Mengelola barang', ket: 'Selama barang dipakai',
    butir: ['Penggunaan antar-SKPD', 'Mutasi internal', 'Pemanfaatan', 'Pengamanan', 'Reklasifikasi', 'Koreksi', 'Kapitalisasi', 'Penghapusan', 'KIR'],
    kaki: 'Tiap transaksi disertai dokumen dasarnya',
  },
  {
    ikon: 'periksa', judul: 'Rencana & periksa', ket: 'Sebelum dan sesudah tahun berjalan',
    butir: ['Standar Harga', 'RKBMD', 'Inventarisasi', 'Rekonsiliasi', 'IPA', 'Dokumen Sumber'],
    kaki: 'Usulan → validasi → penetapan',
  },
]

export function BisaDikerjakan() {
  return (
    <SlideTerang materi={MATERI} label="Fitur" judul="Apa saja yang bisa dikerjakan">
      <div className="grid grid-cols-3 gap-6">
        {KERJA.map((k, i) => (
          <div key={k.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg h-[440px] flex flex-col overflow-hidden" style={d(200 + i * 180)}>
            <div className="flex items-center gap-4 px-6 py-5 bg-navy text-white">
              <div className="w-12 h-12 rounded-xl bg-white/[0.15] flex items-center justify-center"><Ikon nama={k.ikon} ukuran={26} /></div>
              <div>
                <p className="text-[21px] font-bold leading-tight">{k.judul}</p>
                <p className="text-[14px] text-white/70">{k.ket}</p>
              </div>
            </div>
            <div className="flex-1 px-6 py-5 flex flex-wrap content-start gap-2.5">
              {k.butir.map((b, j) => (
                <span key={b} className="mt-pop px-3.5 py-2 rounded-lg bg-teal/10 text-teal text-[16.5px] font-semibold" style={d(500 + i * 180 + j * 70)}>{b}</span>
              ))}
            </div>
            <p className="px-6 py-4 border-t border-gray-100 text-[15px] text-gray-500">{k.kaki}</p>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

const LANGKAH: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'pensil', judul: 'Entri draft', isi: 'Barang, nilai, dan spesifikasinya' },
  { ikon: 'kamera', judul: 'Lampirkan bukti', isi: 'Dokumen (BAST / SK) dan foto barang' },
  { ikon: 'cari', judul: 'Pratinjau', isi: 'Cek kelengkapan sebelum disetujui' },
  { ikon: 'perisai', judul: 'Disetujui', isi: 'NIBAR & kode register terbit' },
  { ikon: 'grafik', judul: 'Langsung terpakai', isi: 'Daftar Barang · Penyusutan · Laporan' },
]

export function Alur() {
  const xs = LANGKAH.map((_, i) => 116 + i * 230)
  return (
    <SlideTerang materi={MATERI} label="Cara kerja" judul="Dari entri sampai laporan — satu alur">
      <svg className="absolute left-0 top-[34px]" width="1152" height="120" viewBox="0 0 1152 120" aria-hidden>
        <line x1={xs[0]} y1="60" x2={xs[4]} y2="60" stroke="#cbd5e1" strokeWidth="4" pathLength={1} className="mt-gambar" style={d(200)} />
        <line x1={xs[0]} y1="60" x2={xs[4]} y2="60" stroke="#0d9488" strokeWidth="4" className="mt-alir mt-tak-cetak" />
      </svg>
      {LANGKAH.map((l, i) => (
        <div key={l.judul} className="absolute top-[50px] w-[220px] text-center" style={{ left: xs[i] - 110 }}>
          <div className="mt-pop mx-auto w-[88px] h-[88px] rounded-full bg-white border-4 border-teal text-teal flex items-center justify-center shadow-lg" style={d(350 + i * 220)}>
            <Ikon nama={l.ikon} ukuran={38} />
          </div>
          <p className="mt-up mt-5 text-[13px] font-bold tracking-widest text-teal" style={d(450 + i * 220)}>LANGKAH {i + 1}</p>
          <p className="mt-up mt-1 text-[22px] font-bold text-navy" style={d(480 + i * 220)}>{l.judul}</p>
          <p className="mt-up mt-1.5 text-[16px] text-gray-500 leading-snug px-2" style={d(510 + i * 220)}>{l.isi}</p>
        </div>
      ))}
      <div className="absolute left-0 right-0 bottom-0 grid grid-cols-2 gap-6">
        <Catatan ikon="perisai" judul="Ada pemeriksaan" jeda={1600}>
          Barang baru resmi masuk register <b>setelah disetujui</b> — sebelum itu masih draft dan bebas diperbaiki.
        </Catatan>
        <Catatan ikon="ulang" judul="Salah catat? Tetap berjejak" jeda={1780}>
          Perbaikan dilakukan lewat <b>Batal</b> atau <b>Koreksi</b> — riwayat barangnya tidak hilang.
        </Catatan>
      </div>
    </SlideTerang>
  )
}

function Catatan({ ikon, judul, jeda, children }: { ikon: NamaIkon; judul: string; jeda: number; children: ReactNode }) {
  return (
    <div className="mt-up flex gap-4 rounded-xl bg-navy/[0.05] border border-navy/10 px-5 py-4" style={d(jeda)}>
      <div className="w-11 h-11 rounded-lg bg-navy text-white flex items-center justify-center flex-shrink-0"><Ikon nama={ikon} /></div>
      <div>
        <p className="text-[18px] font-bold text-navy">{judul}</p>
        <p className="text-[16px] text-gray-600 leading-snug mt-0.5">{children}</p>
      </div>
    </div>
  )
}

// ── Ilustrasi mini untuk slide "fitur unggulan" ─────────────────────────────
function MiniPeta() {
  const pin: [number, number][] = [[46, 58], [112, 40], [150, 96], [74, 118]]
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full" aria-hidden>
      <rect width="200" height="160" rx="14" fill="#e6f4ef" />
      <path d="M-5 84 L205 66 M70 -5 L96 165 M140 -5 L128 165" stroke="#fff" strokeWidth="9" fill="none" />
      <rect x="14" y="14" width="44" height="30" rx="4" fill="#c9e8dc" /><rect x="150" y="116" width="38" height="30" rx="4" fill="#c9e8dc" />
      {pin.map(([x, y], i) => (
        <g key={i} className="mt-jatuh" style={d(500 + i * 260)}>
          <ellipse cx={x} cy={y + 2} rx="7" ry="2.5" fill="#000" opacity=".15" />
          <path d={`M${x} ${y} c-9 -11 -11 -15 -11 -20 a11 11 0 0 1 22 0 c0 5 -2 9 -11 20z`} fill="#0d9488" />
          <circle cx={x} cy={y - 20} r="4" fill="#fff" />
        </g>
      ))}
    </svg>
  )
}

function MiniQr() {
  // Pola tetap (bukan acak): hasil render server & peramban wajib sama.
  const hidup = '1110111 1000101 1011101 0010010 1110111 0101010 1011011'.split(' ')
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full" aria-hidden>
      <rect width="200" height="160" rx="14" fill="#eef2f7" />
      <rect x="48" y="28" width="104" height="104" rx="8" fill="#fff" stroke="#cbd5e1" />
      {hidup.flatMap((baris, y) => [...baris].map((c, x) => c === '1' && (
        <rect key={`${x}-${y}`} x={58 + x * 12} y={38 + y * 12} width="10" height="10" rx="1.5" fill="#1e3a5f"
          className="mt-pop" style={{ ...d(300 + (x + y) * 45), transformOrigin: `${63 + x * 12}px ${43 + y * 12}px` }} />
      )))}
      <rect x="44" y="30" width="112" height="4" rx="2" fill="#f44141" opacity=".85" className="mt-pindai mt-tak-cetak" style={{ ['--jarak' as string]: '96px' }} />
    </svg>
  )
}

function MiniSusut() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full" aria-hidden>
      <rect width="200" height="160" rx="14" fill="#eef2f7" />
      <path d="M28 22 V132 H182" stroke="#94a3b8" strokeWidth="2" fill="none" />
      {[0, 1, 2, 3, 4].map(i => (
        <rect key={i} x={40 + i * 28} y={40 + i * 17} width="18" height={92 - i * 17} rx="3" fill="#0d9488" opacity={0.9 - i * 0.13}
          className="mt-tinggi" style={{ ...d(350 + i * 140), transformOrigin: `${49 + i * 28}px 132px` }} />
      ))}
      <path d="M49 36 L77 53 L105 70 L133 87 L161 104" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round"
        pathLength={1} className="mt-gambar" style={d(1100)} />
    </svg>
  )
}

function MiniLaporan() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full" aria-hidden>
      <rect width="200" height="160" rx="14" fill="#e6f4ef" />
      <rect x="62" y="30" width="92" height="112" rx="6" fill="#fff" stroke="#cbd5e1" transform="rotate(6 108 86)" />
      <rect x="50" y="22" width="92" height="112" rx="6" fill="#fff" stroke="#94a3b8" />
      <rect x="60" y="34" width="46" height="7" rx="3" fill="#1e3a5f" className="mt-lebar" style={{ ...d(400), transformOrigin: '60px 37px' }} />
      {[0, 1, 2, 3, 4].map(i => (
        <rect key={i} x="60" y={52 + i * 14} width={i % 2 ? 58 : 72} height="5" rx="2.5" fill="#cbd5e1"
          className="mt-lebar" style={{ ...d(550 + i * 120), transformOrigin: `60px ${54 + i * 14}px` }} />
      ))}
      <g className="mt-pop" style={{ ...d(1300), transformOrigin: '146px 118px' }}>
        <circle cx="146" cy="118" r="20" fill="#0d9488" />
        <path d="M137 118 l6 6 l12 -13" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

const UNGGULAN: { gambar: ReactNode; judul: string; isi: string }[] = [
  { gambar: <MiniPeta />, judul: 'GIS Tanah', isi: 'Setiap tanah punya titik di peta, lengkap dengan bidang dan sertifikatnya.' },
  { gambar: <MiniQr />, judul: 'KIBAR ber-QR', isi: 'Pindai QR di badan barang — kartu identitas dan riwayatnya langsung tampil.' },
  { gambar: <MiniSusut />, judul: 'Penyusutan otomatis', isi: 'Beban, akumulasi, dan nilai buku dihitung per semester dari riwayat tiap barang.' },
  { gambar: <MiniLaporan />, judul: 'Format Permendagri 47/2021', isi: 'Lembar laporan resmi siap cetak, dan semuanya bisa diekspor ke Excel.' },
]

export function Unggulan() {
  return (
    <SlideTerang materi={MATERI} label="Fitur" judul="Empat fitur yang perlu dikenal">
      <div className="grid grid-cols-2 gap-5">
        {UNGGULAN.map((u, i) => (
          <div key={u.judul} className="mt-up flex items-center gap-6 rounded-2xl border border-gray-200 bg-white shadow-lg p-5 h-[218px]" style={d(200 + i * 160)}>
            <div className="w-[215px] h-[172px] flex-shrink-0">{u.gambar}</div>
            <div>
              <p className="text-[25px] font-bold text-navy leading-tight">{u.judul}</p>
              <p className="mt-2.5 text-[17px] text-gray-600 leading-relaxed">{u.isi}</p>
            </div>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

const KELUARAN: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'grafik', judul: 'Laporan BMD', isi: 'Semester I, Semester II, dan akhir tahun' },
  { ikon: 'tukar', judul: 'Rekonsiliasi BMD', isi: 'Kronologi mutasi + Berita Acara Rekonsiliasi' },
  { ikon: 'dokumen', judul: 'Laporan Perolehan & Pengelolaan', isi: 'Format lampiran Permendagri 47/2021' },
  { ikon: 'qr', judul: 'KIBAR & KIR', isi: 'Kartu identitas barang dan kartu inventaris ruangan' },
  { ikon: 'cetak', judul: 'Excel & PDF', isi: 'Setiap laporan bisa diekspor dan dicetak' },
]

export function Laporan() {
  const hx = 290, hy = 237
  const ys = KELUARAN.map((_, i) => 47 + i * 95)
  return (
    <SlideTerang materi={MATERI} label="Keluaran" judul="Satu data, banyak laporan">
      <svg className="absolute left-0 top-0" width="1152" height="474" viewBox="0 0 1152 474" aria-hidden>
        {ys.map((y, i) => {
          const jalur = `M${hx} ${hy} C ${hx + 150} ${hy}, ${520 - 150} ${y}, 520 ${y}`
          return (
            <g key={i}>
              <path d={jalur} fill="none" stroke="#cbd5e1" strokeWidth="2.5" pathLength={1} className="mt-gambar" style={d(500 + i * 130)} />
              <circle r="6" fill="#0d9488" className="mt-jalan mt-tak-cetak"
                style={{ offsetPath: `path('${jalur}')`, ['--lama' as string]: '3.2s', ...d(1400 + i * 420) }} />
            </g>
          )
        })}
      </svg>
      <div className="mt-pop absolute w-[250px] h-[250px] rounded-full bg-navy text-white flex flex-col items-center justify-center text-center shadow-2xl"
        style={{ left: hx - 210, top: hy - 125, ...d(150) }}>
        <span className="mt-riak mt-tak-cetak absolute inset-[62px] rounded-full border-2 border-teal/50" />
        <Ikon nama="daftar" ukuran={46} />
        <p className="mt-3 text-[25px] font-bold leading-tight">Data Barang</p>
        <p className="mt-1 text-[15px] text-white/70 px-8 leading-snug">register + riwayat transaksi</p>
      </div>
      {KELUARAN.map((k, i) => (
        <div key={k.judul} className="mt-kanan absolute left-[520px] right-0 h-[78px] flex items-center gap-4 rounded-xl border border-gray-200 bg-white shadow-md px-5"
          style={{ top: ys[i] - 39, ...d(650 + i * 130) }}>
          <div className="w-11 h-11 rounded-lg bg-teal/10 text-teal flex items-center justify-center flex-shrink-0"><Ikon nama={k.ikon} /></div>
          <div>
            <p className="text-[19px] font-bold text-navy leading-tight">{k.judul}</p>
            <p className="text-[15px] text-gray-500">{k.isi}</p>
          </div>
        </div>
      ))}
    </SlideTerang>
  )
}
