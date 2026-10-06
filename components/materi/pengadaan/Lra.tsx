'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide LRA: setelah entry disetujui,
// cocokkan dengan realisasi belanja (LRA) untuk bahan rekonsiliasi BMD.
//
// ⚠️ Istilah kolom & pesan di slide ini DISALIN dari layar
// app/dashboard/pelaporan/lra/page.tsx (kolom Check: LRA · + Kapitalisasi ·
// − Reklasifikasi · = Seharusnya · Entry Aplikasi · Selisih). Angkanya ILUSTRASI.
import { SlideSidebar } from '../SidebarMock'
import { SlideTerang, Poin, Catatan, Tbl, Ikon, d } from '../bagian'
import { MATERI, KartuApp, Th, Lencana, Contoh } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[450px] space-y-5'
const KANAN = 'absolute right-0 top-0 w-[470px]'

// ── 1. Kenapa perlu dicocokkan ──────────────────────────────────────────────
export function LraTujuan() {
  return (
    <SlideSidebar aktif="Pembukuan/LRA" materi={MATERI} label="Pembukuan · LRA" judul="Entry dicocokkan dengan realisasi">
      <div className={KIRI}>
        <Poin jeda={250}><b>LRA</b> = berapa belanja yang sudah <b>direalisasikan bendahara</b> (sisi keuangan).</Poin>
        <Poin jeda={450}><b>Entry Pengadaan yang disetujui</b> = berapa yang sudah <b>masuk BMD</b> (sisi aset, sudah ada BAST).</Poin>
        <Poin jeda={650}>Dua sisi itu <b>semestinya sama</b>. Bedanya adalah <b>pekerjaan rumah</b> yang harus dijelaskan.</Poin>
        <Catatan jeda={900} nada="teal" ikon="lampu">
          Hasilnya jadi <b>bahan rekonsiliasi BMD</b> dengan keuangan — dan bisa dicek <b>kapan saja</b>, tak perlu menunggu akhir semester.
        </Catatan>
      </div>
      <div className={KANAN}>
        <div className="grid grid-cols-2 gap-4">
          <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5 text-center" style={d(350)}>
            <span className="mx-auto w-12 h-12 rounded-xl bg-navy text-white flex items-center justify-center"><Ikon nama="hitung" ukuran={26} /></span>
            <p className="mt-3 text-[20px] font-bold text-navy leading-tight">Keuangan</p>
            <p className="mt-1 text-[14px] text-gray-500 leading-snug">Realisasi belanja modal oleh bendahara (LRA)</p>
          </div>
          <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5 text-center" style={d(550)}>
            <span className="mx-auto w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="daftar" ukuran={26} /></span>
            <p className="mt-3 text-[20px] font-bold text-navy leading-tight">BMD</p>
            <p className="mt-1 text-[14px] text-gray-500 leading-snug">Entry Pengadaan yang sudah disetujui</p>
          </div>
        </div>
        <div className="mt-up mt-4 rounded-2xl bg-navy text-white p-5" style={d(900)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-amber-300">Yang dibandingkan</p>
          <p className="mt-2 text-[17px] leading-snug font-semibold">
            LRA <span className="text-amber-300">+</span> Kapitalisasi <span className="text-amber-300">−</span> Reklasifikasi
            <span className="text-amber-300 mx-2">=?</span> Entry Aplikasi
          </p>
          <p className="mt-2 text-[14px] text-white/70 leading-snug">Per jenis belanja modal: 5.2.01 Tanah sampai 5.2.05 Aset Tetap Lainnya.</p>
        </div>
        <p className="mt-in mt-3 text-[13px] text-gray-400" style={d(1200)}>Posisi saat ini: data LRA masih berupa impor (diunggah admin), belum terintegrasi.</p>
      </div>
    </SlideSidebar>
  )
}

// ── 2. Dua arah selisih ─────────────────────────────────────────────────────
const ARAH: { judul: string; ikon: 'dokumen' | 'daftar'; tanda: string; arti: string; sebab: string[] }[] = [
  {
    judul: 'Sudah dibelanjakan, belum masuk BMD', ikon: 'dokumen', tanda: 'Selisih positif — LRA lebih besar',
    arti: 'Bendahara sudah merealisasikan belanja modal, tetapi barangnya belum tercatat di aset.',
    sebab: ['Pengadaan belum dientry', 'Kartu masih draft, belum disetujui', 'Barang belum diserahterimakan (BAST belum ada)', 'Belanja modal yang sebenarnya bukan aset belum ditandai Reklasifikasi'],
  },
  {
    judul: 'Sudah masuk aset, belum diposting di keuangan', ikon: 'daftar', tanda: 'Selisih negatif — Entry lebih besar',
    arti: 'Barang sudah ada BAST dan tercatat di BMD, tetapi realisasinya belum terlihat di LRA.',
    sebab: ['Pembayaran / posting di keuangan belum dilakukan', 'Belanja barang-jasa yang jadi aset belum ditandai Kapitalisasi', 'Realisasi tercatat di SKPD lain / di periode lain'],
  },
]

export function LraDuaArah() {
  return (
    <SlideTerang materi={MATERI} label="Membaca selisih" judul="Dua arah selisih, dua tindak lanjut">
      <div className="absolute inset-x-0 top-0 grid grid-cols-2 gap-6 items-start">
        {ARAH.map((a, i) => (
          <div key={a.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6" style={d(250 + i * 250)}>
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center flex-shrink-0"><Ikon nama={a.ikon} ukuran={26} /></span>
              <p className="text-[23px] font-bold text-navy leading-tight">{a.judul}</p>
            </div>
            <p className="mt-4"><Lencana nada={i === 0 ? 'wajib' : 'amber'}>{a.tanda}</Lencana></p>
            <p className="mt-3 text-[17px] leading-snug text-gray-600">{a.arti}</p>
            <p className="mt-4 text-[13px] font-semibold tracking-[0.12em] uppercase text-gray-400">Kemungkinan sebab</p>
            <ul className="mt-2 space-y-2.5 text-[17px] text-gray-700">
              {a.sebab.map(x => <li key={x} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-in absolute left-0 right-0 bottom-0 text-center text-[16px] text-gray-500" style={d(1200)}>
        Selisih belum tentu salah entry — <b className="text-navy">yang penting setiap selisih ada penjelasannya</b> sebelum rekonsiliasi.
      </p>
    </SlideTerang>
  )
}

// ── 3. Cara memakai ─────────────────────────────────────────────────────────
const JENIS: [string, string, string, string, number][] = [
  ['5.2.02', 'Peralatan dan Mesin', '1.250.000.000', '1.250.000.000', 0],
  ['5.2.03', 'Gedung dan Bangunan', '980.000.000', '1.100.000.000', -120000000],
  ['5.2.04', 'Jalan, Jaringan dan Irigasi', '640.000.000', '520.000.000', 120000000],
]
const rp = (n: number) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('id-ID')

export function LraCara() {
  return (
    <SlideSidebar aktif="Pembukuan/LRA" materi={MATERI} label="Pembukuan · LRA" judul="Cara mencocokkan">
      <div className={KIRI}>
        <Poin jeda={250}>Pilih <b>SKPD</b> dan <b>Tahun</b>, lalu klik <Tbl>Proses</Tbl>.</Poin>
        <Poin jeda={450}>Lihat tabel <b>Check</b>: jenis yang <b>✓</b> sudah cocok, yang <b>✗</b> punya selisih.</Poin>
        <Poin jeda={650}>Klik angka untuk <b>menelusuri transaksinya</b>; tandai <Tbl>Kapitalisasi</Tbl> / <Tbl>Reklasifikasi</Tbl> bila perlu.</Poin>
        <Poin jeda={850}>Ganti dasar ke <b>Kode Barang</b> untuk melihat <b>persilangan</b> rekening × golongan.</Poin>
        <Catatan jeda={1100} ikon="lampu">
          Selisih total <b>sama</b> di kedua dasar — hanya sebarannya yang bergeser.
        </Catatan>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={350} judul={<span className="flex items-center justify-between">Check — LRA vs Entry Aplikasi <Lencana nada="wajib">Selisih</Lencana></span>}>
          <table className="w-full text-[11.5px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr><Th>Jenis</Th><Th>LRA</Th><Th>Entry Aplikasi</Th><Th>Selisih</Th><Th tengah>Status</Th></tr>
            </thead>
            <tbody>
              {JENIS.map(([kode, nama, lra, entry, selisih]) => (
                <tr key={kode} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-2 text-gray-700"><span className="text-gray-400">{kode}</span> {nama}</td>
                  <td className="px-2.5 py-2 tabular-nums text-right">{lra}</td>
                  <td className="px-2.5 py-2 tabular-nums text-right">{entry}</td>
                  <td className={`px-2.5 py-2 tabular-nums text-right ${selisih === 0 ? 'text-gray-300' : 'text-red-600 font-semibold'}`}>{selisih === 0 ? '0' : rp(selisih)}</td>
                  <td className="px-2.5 py-2 text-center">{selisih === 0 ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11.5px] text-gray-500 leading-snug">
            Positif = LRA lebih besar (belum dientry). Negatif = entry lebih besar (belum diposting / belum ditandai kapitalisasi).
          </p>
        </KartuApp>
        <div className="mt-up mt-4 flex items-center gap-3 rounded-xl bg-teal/10 border border-teal/30 px-4 py-3 text-[14.5px] text-gray-700" style={d(900)}>
          <Ikon nama="cetak" className="text-teal flex-shrink-0" />
          <span><b>Export Excel</b> tersedia — dipakai sebagai lampiran berita acara rekonsiliasi.</span>
        </div>
      </div>
      <Contoh />
    </SlideSidebar>
  )
}
