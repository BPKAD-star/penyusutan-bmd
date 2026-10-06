'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — penjelasan per menu sidebar (3/3):
// Daftar Barang, Penyusutan, IPA (lima aspek), Pelaporan, Admin.
import { SlideSidebar } from '../SidebarMock'
import { Poin, Catatan, KartuMenu, Ikon, Tbl, d, type NamaIkon } from '../bagian'
import { MATERI } from './Pembuka'

// ── Daftar Barang ───────────────────────────────────────────────────────────
export function DaftarBarang() {
  return (
    <SlideSidebar aktif="Daftar Barang" materi={MATERI} label="Menu Aplikasi" judul="8. Daftar Barang - KIB">
      <div className="absolute left-0 top-0 w-[470px] space-y-3.5">
        <Poin jeda={250}>Pilih <b>tahun dan semester</b> — angka mengikuti peristiwa <b>pada periodenya</b>.</Poin>
        <Poin jeda={430}>Kolom <b>menyesuaikan jenis aset</b> (tanah: luas; kendaraan: nopol, rangka, mesin).</Poin>
        <Poin jeda={610}>Kolom <b>Penggunaan</b> menautkan ke Pemanfaatan / Pengamanan; kolom <b>Lokasi</b> menandai tanah yang sudah bertitik.</Poin>
        <div className="mt-up rounded-xl border border-teal/40 bg-teal/[0.06] p-4 space-y-3" style={d(850)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-teal">KIBAR &amp; label QR — langsung dari sini</p>
          <p className="flex items-start gap-3 text-[16.5px] leading-snug text-gray-700">
            <span className="w-7 h-7 rounded-full bg-amber-400 text-white font-bold text-[14px] flex items-center justify-center flex-shrink-0">1</span>
            <span><b>Lihat KIBAR:</b> klik <b>ikon dokumen</b> di kolom paling kiri barang itu.</span>
          </p>
          <p className="flex items-start gap-3 text-[16.5px] leading-snug text-gray-700">
            <span className="w-7 h-7 rounded-full bg-amber-400 text-white font-bold text-[14px] flex items-center justify-center flex-shrink-0">2</span>
            <span><b>Cetak label:</b> <b>centang beberapa barang</b>, lalu tombol kuning <Tbl>Cetak Label</Tbl> (A4, 16 label per halaman).</span>
          </p>
        </div>
        <Poin jeda={1150}><b>Export Excel</b> dengan nama berkas yang seragam.</Poin>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[440px] rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden" style={d(350)}>
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <span className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-[13px] text-gray-600">2026</span>
          <span className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-[13px] text-gray-600">Semester I</span>
          <span className="relative ml-auto px-3 py-1.5 rounded-md bg-amber-400 text-white text-[13px] font-semibold">
            Cetak Label (2)
            <span className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-navy text-white text-[11px] font-bold flex items-center justify-center">2</span>
          </span>
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`mt-in flex items-center gap-3 px-4 h-[58px] border-b border-gray-100 ${i === 1 ? 'bg-teal/[0.06]' : ''}`} style={d(600 + i * 150)}>
            <div className="relative flex flex-col items-center gap-1">
              <span className="relative text-teal">
                <Ikon nama="dokumen" ukuran={18} />
                {i === 0 && <span className="absolute -top-2 -left-3 w-4 h-4 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center">1</span>}
              </span>
              <span className={`w-3.5 h-3.5 rounded border ${i < 2 ? 'bg-teal border-teal' : 'border-gray-300'}`} />
            </div>
            <div className="flex-1">
              <div className="h-3 w-40 rounded bg-gray-300" />
              <div className="mt-1.5 h-2.5 w-28 rounded bg-gray-200" />
            </div>
            <span className="text-teal"><Ikon nama="pin" ukuran={18} /></span>
            <div className="h-3 w-14 rounded bg-gray-200" />
          </div>
        ))}
        <p className="px-4 py-3 text-[12px] text-gray-400">Ilustrasi tampilan — bukan data sungguhan.</p>
      </div>
    </SlideSidebar>
  )
}

// ── Penyusutan ──────────────────────────────────────────────────────────────
export function Penyusutan() {
  return (
    <SlideSidebar aktif="Penyusutan" materi={MATERI} label="Menu Aplikasi" judul="9. Penyusutan">
      <div className="absolute left-0 top-0 w-[500px] space-y-3.5">
        <Poin jeda={250}>Dihitung dari <b>riwayat tiap barang</b>: perolehan, koreksi nilai, kapitalisasi, penghapusan.</Poin>
        <Poin jeda={430}>Hasilnya <b>beban semester, akumulasi, dan nilai buku</b>; masa manfaat diambil dari kodefikasi.</Poin>
        <Poin jeda={610}>Kapitalisasi (rehab) dapat <b>memperpanjang masa manfaat</b> sesuai ketentuan.</Poin>
        <Poin jeda={790}><b>Tanah, aset tetap lainnya, dan KDP</b> tidak disusutkan; ekstrakomptabel tetap dihitung, laporan dipisah intra/ekstra.</Poin>
        <Poin jeda={970}>Aman dijalankan ulang; angka <b>tahun yang sudah ditutup terkunci</b>.</Poin>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[420px] rounded-2xl border border-gray-200 bg-white shadow-2xl p-5" style={d(350)}>
        <p className="text-[16px] font-bold text-navy">Satu barang dari semester ke semester</p>
        <svg viewBox="0 0 440 250" className="mt-3 w-full" aria-hidden>
          {[40, 100, 160, 220].map(y => <line key={y} x1="30" x2="430" y1={y} y2={y} stroke="#e5e7eb" />)}
          <line x1="30" x2="430" y1="40" y2="40" stroke="#1e3a5f" strokeWidth="3" strokeDasharray="6 6" />
          <path d="M30 220 L130 190 L230 150 L330 110 L430 70" fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" pathLength={1} className="mt-gambar" style={d(700)} />
          <path d="M30 40 L130 70 L230 110 L330 150 L430 190" fill="none" stroke="#0d9488" strokeWidth="4" strokeLinecap="round" pathLength={1} className="mt-gambar" style={d(1000)} />
          {['S1', 'S2', 'S1', 'S2', 'S1'].map((t, i) => <text key={i} x={30 + i * 100} y="244" textAnchor="middle" fontSize="12" fill="#9ca3af">{t}</text>)}
        </svg>
        <div className="mt-2 flex flex-wrap gap-4 text-[13.5px] text-gray-600">
          <span className="flex items-center gap-1.5"><span className="w-4 h-1 bg-navy" />Nilai perolehan</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-1 bg-amber-400" />Akumulasi</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-1 bg-teal" />Nilai buku</span>
        </div>
        <p className="mt-3 text-[12px] text-gray-400">Ilustrasi pola — bukan data sungguhan.</p>
      </div>
    </SlideSidebar>
  )
}

// ── IPA: lima aspek ─────────────────────────────────────────────────────────
const ASPEK_IPA: { nama: string; ikon: NamaIkon; indikator: string[] }[] = [
  { nama: 'Integritas', ikon: 'periksa', indikator: ['Kelengkapan data administrasi'] },
  { nama: 'Kepatuhan', ikon: 'kalender', indikator: ['Ketepatan waktu RKBMD', 'Ketepatan waktu Rekonsiliasi', 'Ketepatan waktu Entry BMD'] },
  { nama: 'Akuntabilitas', ikon: 'ulang', indikator: ['TL temuan BPK', 'TL temuan Inspektorat', 'TL BMD Rusak Berat', 'Realisasi atas RKBMD'] },
  { nama: 'Legalitas', ikon: 'perisai', indikator: ['Sertipikat tanah', 'Pembayaran PKB'] },
  { nama: 'Ekonomi', ikon: 'grafik', indikator: ['Realisasi pendapatan atas aset idle'] },
]

export function IpaAspek() {
  return (
    <SlideSidebar aktif="IPA" materi={MATERI} label="Menu Aplikasi" judul="10. Indeks Pengelolaan Aset (IPA) - 5 aspek">
      <div className="grid grid-cols-5 gap-3 mt-1">
        {ASPEK_IPA.map((a, i) => (
          <div key={a.nama} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden h-[330px]" style={d(250 + i * 150)}>
            <div className="bg-navy text-white px-4 py-4">
              <span className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center"><Ikon nama={a.ikon} ukuran={22} /></span>
              <p className="mt-2.5 text-[21px] font-bold leading-tight">{a.nama}</p>
            </div>
            <ul className="px-4 py-4 space-y-2.5">
              {a.indikator.map(x => (
                <li key={x} className="flex gap-2 text-[15px] leading-snug text-gray-700">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-teal flex-shrink-0" />{x}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-in mt-6 text-center text-[17.5px] text-gray-500" style={d(1300)}>
        Tiap indikator punya <b className="text-navy">rincian per barang</b> yang menunjukkan apa yang masih perlu ditindaklanjuti.
      </p>
    </SlideSidebar>
  )
}

// ── Pelaporan ───────────────────────────────────────────────────────────────
export function Pelaporan() {
  return (
    <SlideSidebar aktif="Pelaporan" materi={MATERI} label="Menu Aplikasi" judul="11. Pelaporan - all in one reporting">
      <div className="absolute left-0 top-0 w-[540px] grid grid-cols-2 gap-3">
        <KartuMenu ikon="keranjang" judul="Laporan Perolehan" isi="Lima cara perolehan, format Permendagri" jeda={300} tinggi="h-[118px]" />
        <KartuMenu ikon="tukar" judul="Laporan Pengelolaan" isi="Penggunaan sampai penghapusan" jeda={440} tinggi="h-[118px]" />
        <KartuMenu ikon="grafik" judul="Laporan BMD" isi="Semester I, II, dan akhir tahun" jeda={580} tinggi="h-[118px]" />
        <KartuMenu ikon="periksa" judul="Rekonsiliasi BMD" isi="Kronologi mutasi + Berita Acara" jeda={720} tinggi="h-[118px]" sorot />
        <KartuMenu ikon="hitung" judul="Uji Konsistensi" isi="Cocokkan laporan satu dengan lainnya" jeda={860} tinggi="h-[118px]" />
        <KartuMenu ikon="gedung" judul="KIR" isi="Kartu inventaris ruangan" jeda={1000} tinggi="h-[118px]" />
      </div>
      <div className="absolute right-0 top-0 w-[380px] space-y-4">
        <Catatan jeda={900} nada="teal" ikon="periksa">
          <b>Rekonsiliasi</b> bisa dipakai pengurus barang untuk <b>self-check</b> sebagai bahan pertimbangan sebelum rekon dengan pengurus barang pengelola.
        </Catatan>
        <Catatan jeda={1150} ikon="cetak">
          Setiap laporan bisa <b>diekspor ke Excel</b> dan <b>dicetak menjadi PDF</b>.
        </Catatan>
      </div>
    </SlideSidebar>
  )
}

// ── Admin ───────────────────────────────────────────────────────────────────
export function Admin() {
  return (
    <SlideSidebar aktif="Admin" materi={MATERI} label="Menu Aplikasi" judul="12. Admin - pendukung data dan arsip">
      <div className="grid grid-cols-2 gap-5 mt-1">
        <KartuMenu ikon="orang" judul="Usulan Pengurus Barang" isi="Data pengurus barang tahun berjalan, diusulkan lalu disahkan" jeda={250} tinggi="h-[124px]" />
        <KartuMenu ikon="daftar" judul="Kodefikasi" isi="Kode dan uraian barang baku, masa manfaat, dan batas kapitalisasi" jeda={400} tinggi="h-[124px]" />
        <KartuMenu ikon="map" judul="Dokumen Sumber" isi="Peraturan · Dokumen pengelolaan BMD · Materi paparan" jeda={550} tinggi="h-[124px]" />
        <KartuMenu ikon="lampu" judul="Notes" isi="Saran & masukan — bila ada pengembangan yang cukup masuk akal, tuliskan di sini" jeda={700} tinggi="h-[124px]" />
      </div>
      <p className="mt-in mt-7 text-center text-[17.5px] text-gray-500" style={d(1100)}>
        Notes terbuka untuk semua pengguna — usulan fitur dibaca admin dan dipertimbangkan.
      </p>
    </SlideSidebar>
  )
}
