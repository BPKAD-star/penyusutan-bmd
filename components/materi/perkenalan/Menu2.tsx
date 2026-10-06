'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — penjelasan per menu sidebar (2/3):
// LRA, KIR, Inventarisasi, alur LKI→LHI→Tindak Lanjut, GIS Tanah, Kendaraan.
import { SlideSidebar } from '../SidebarMock'
import { Poin, Catatan, Tbl, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI } from './Pembuka'
import { PetaBesar } from './Kelengkapan'

// ── LRA ─────────────────────────────────────────────────────────────────────
export function Lra() {
  return (
    <SlideSidebar aktif="Pembukuan/LRA" materi={MATERI} label="Pembukuan" judul="LRA - Belanja Modal vs Entry BMD">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Catatan jeda={250} ikon="lampu">
          <b>Posisi saat ini:</b> data belanja masih berupa <b>impor</b>, belum terintegrasi (<i>not integrated yet</i>).
        </Catatan>
        <Poin jeda={500}>Lihat <b>total pencairan belanja modal</b> SKPD per jenis belanja.</Poin>
        <Poin jeda={700}>Lihat <b>total entry yang sudah disetujui</b> di aplikasi.</Poin>
        <Poin jeda={900}>Selisih keduanya langsung terbaca — petunjuk entry mana yang belum dibukukan.</Poin>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[470px] rounded-2xl border border-gray-200 bg-white shadow-2xl p-6" style={d(350)}>
        <p className="text-[16px] font-bold text-navy">Belanja modal per jenis</p>
        <div className="mt-5 space-y-4">
          {[['Peralatan & Mesin', 92, 80], ['Gedung & Bangunan', 70, 66], ['Jalan, Jaringan & Irigasi', 55, 30], ['Aset Tetap Lainnya', 24, 24]].map(([nama, lra, entry], i) => (
            <div key={nama as string}>
              <p className="text-[14.5px] text-gray-600 mb-1">{nama}</p>
              <div className="space-y-1">
                <div className="h-3 rounded-full bg-gray-100"><div className="mt-lebar h-full rounded-full bg-navy" style={{ width: `${lra}%`, ...d(700 + i * 150) }} /></div>
                <div className="h-3 rounded-full bg-gray-100"><div className="mt-lebar h-full rounded-full bg-teal" style={{ width: `${entry}%`, ...d(850 + i * 150) }} /></div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-5 text-[13.5px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-navy" />Pencairan (LRA)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal" />Entry disetujui</span>
        </div>
        <p className="mt-3 text-[12px] text-gray-400">Ilustrasi tampilan — angka bukan data sungguhan.</p>
      </div>
    </SlideSidebar>
  )
}

// ── KIR ─────────────────────────────────────────────────────────────────────
const RUANGAN: [string, string[]][] = [
  ['Ruang Kepala Bidang', ['Meja kerja', 'Kursi', 'Laptop', 'AC']],
  ['Ruang Rapat', ['Meja rapat', 'Kursi (12)', 'Proyektor']],
]

export function Kir() {
  return (
    <SlideSidebar aktif="Pembukuan/KIR" materi={MATERI} label="Pembukuan" judul="KIR - Ruangan apa, isi barangnya apa aja">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Poin jeda={250}>Daftar <b>ruangan per SKPD</b>, lengkap dengan penanggung jawab ruangan.</Poin>
        <Poin jeda={450}>Isi tiap ruangan: <b>barang apa saja</b> yang ada di dalamnya.</Poin>
        <Poin jeda={650}>Satu barang hanya berada di <b>satu ruangan</b>.</Poin>
        <Poin jeda={850}>Bisa dicetak sebagai <b>Kartu Inventaris Ruangan</b>.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        {RUANGAN.map(([nama, isi], i) => (
          <div key={nama} className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400 + i * 250)}>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-lg bg-navy text-white flex items-center justify-center"><Ikon nama="gedung" ukuran={24} /></span>
              <div>
                <p className="text-[20px] font-bold text-navy leading-tight">{nama}</p>
                <p className="text-[13.5px] text-gray-500">Penanggung jawab: pegawai SKPD</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {isi.map((x, j) => <span key={x} className="mt-pop px-3 py-1.5 rounded-md bg-teal/10 text-teal text-[15.5px] font-semibold" style={d(800 + i * 250 + j * 110)}>{x}</span>)}
            </div>
          </div>
        ))}
        <p className="text-[12px] text-gray-400">Ilustrasi tampilan — isi ruangan bukan data sungguhan.</p>
      </div>
    </SlideSidebar>
  )
}

// ── Inventarisasi ───────────────────────────────────────────────────────────
const TAHAP_INV: { ikon: NamaIkon; judul: string; isi: string; sorot?: boolean }[] = [
  { ikon: 'pensil', judul: 'Lembar Kerja Inventarisasi', isi: 'SKPD memeriksa tiap barang lalu mengisi hasilnya (LKI)' },
  { ikon: 'perisai', judul: 'Validasi', isi: 'Pengelola Barang memeriksa & mengesahkan isian' },
  { ikon: 'dokumen', judul: 'Laporan Hasil Inventarisasi', isi: 'LHI dalam 13 format, siap cetak' },
  { ikon: 'centang', judul: 'Tindak Lanjut', isi: 'Status terbaca otomatis dari keadaan barang', sorot: true },
]

export function Inventarisasi() {
  return (
    <SlideSidebar aktif="Inventarisasi" materi={MATERI} label="Menu Aplikasi" judul="5. Inventarisasi - LKI sampai Tindak Lanjut">
      <div className="grid grid-cols-4 gap-4 mt-2">
        {TAHAP_INV.map((t, i) => (
          <div key={t.judul} className={`mt-up relative rounded-2xl border bg-white shadow-lg p-6 h-[250px] ${t.sorot ? 'border-teal ring-2 ring-teal/30' : 'border-gray-200'}`} style={d(250 + i * 200)}>
            <span className="absolute right-4 top-2 text-[58px] font-bold text-navy/[0.07] leading-none select-none">{i + 1}</span>
            <span className={`w-14 h-14 rounded-xl flex items-center justify-center ${t.sorot ? 'bg-teal text-white' : 'bg-navy text-white'}`}><Ikon nama={t.ikon} ukuran={28} /></span>
            <p className="mt-4 text-[21px] font-bold text-navy leading-tight">{t.judul}</p>
            <p className="mt-2 text-[15.5px] text-gray-500 leading-snug">{t.isi}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Catatan jeda={1200} nada="teal" ikon="lampu">
          Menu <b>Tindak Lanjut</b> kita kembangkan agar proses inventarisasi ini <b>berjalan secara maksimal</b> — temuan tidak berhenti di laporan, tapi diikuti sampai selesai.
        </Catatan>
      </div>
    </SlideSidebar>
  )
}

// ── Alur LKI → LHI → Tindak Lanjut ──────────────────────────────────────────
const ALUR_LKI: [string, string, string][] = [
  ['Hilang (kecurian)', 'III.B.1', 'Reklas ke Aset Hilang → usulan penghapusan'],
  ['Tidak ditemukan', 'III.B.2', 'Reklas ke Aset Dalam Penelusuran → usulan penghapusan'],
  ['Belum dikapitalisasi', 'III.B.3 · 4', 'Kapitalisasi ke induk / telusuri data induk'],
  ['Dipakai pegawai', 'III.B.5', 'BAST Pengamanan ke pegawai pemakai'],
  ['Dipakai pihak lain', 'III.B.6', 'Reklas, lalu catat perjanjian Pemanfaatan'],
  ['Kondisi fisik berubah', 'III.B.7', 'Rusak berat → reklas, usulan penghapusan'],
  ['Data berubah', 'III.B.8', 'Koreksi → Spesifikasi Barang'],
  ['Tercatat ganda', 'III.B.9', 'Koreksi → Pencatatan Ganda'],
  ['Belum tercatat', 'III.B.11', 'Hasil Inventarisasi (Cara Perolehan)'],
  ['Kode barang salah', 'III.B.12', 'Reklasifikasi → Kesalahan Kodefikasi'],
  ['Kuantitas berubah', 'III.B.13', 'Koreksi → Pemecahan Barang'],
]

export function AlurLki() {
  return (
    <SlideSidebar aktif="Inventarisasi/Tindak Lanjut" materi={MATERI} label="Inventarisasi · Alur" judul="Temuan LKI → laporan LHI → tindak lanjut">
      <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden" style={d(250)}>
        <div className="grid grid-cols-[250px_120px_1fr] bg-navy text-white text-[14px] font-semibold tracking-wide uppercase px-5 py-2.5">
          <span>Temuan di LKI</span><span>Laporan (LHI)</span><span>Tindak lanjut</span>
        </div>
        {ALUR_LKI.map(([temuan, lhi, tindak], i) => (
          <div key={temuan} className={`mt-in grid grid-cols-[250px_120px_1fr] items-center px-5 h-[35px] text-[15.5px] ${i % 2 ? 'bg-gray-50' : ''}`} style={d(500 + i * 90)}>
            <span className="font-semibold text-navy">{temuan}</span>
            <span><Tbl>{lhi}</Tbl></span>
            <span className="text-gray-600">{tindak}</span>
          </div>
        ))}
      </div>
    </SlideSidebar>
  )
}

// ── GIS Tanah ───────────────────────────────────────────────────────────────
export function GisTanah() {
  return (
    <SlideSidebar aktif="GIS Tanah" materi={MATERI} label="Menu Aplikasi" judul="6. GIS - satu data tanah">
      <div className="absolute left-0 top-0 w-[450px] space-y-4">
        <Poin jeda={250} ikon="daftar"><b>Register tanah</b> apa yang ada di SKPD.</Poin>
        <Poin jeda={420} ikon="pin"><b>Titik koordinatnya</b> di mana.</Poin>
        <Poin jeda={590} ikon="map"><b>Bidangnya</b> ada berapa.</Poin>
        <Poin jeda={760} ikon="dokumen"><b>Sertipikatnya</b> yang mana.</Poin>
        <Poin jeda={930} ikon="tukar"><b>Rute</b> menuju titik tersebut (Google Maps).</Poin>
        <Poin jeda={1100} ikon="kamera">Lihat kondisi terbaru lewat <b>Street View</b>.</Poin>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[470px]" style={d(300)}>
        <div className="h-[330px] rounded-[20px] shadow-2xl border border-gray-200 bg-white p-2"><PetaBesar /></div>
        <div className="mt-up mt-4 flex gap-3" style={d(1200)}>
          <span className="flex-1 text-center px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-[15px] font-semibold text-gray-700 shadow-sm">🧭 Navigasi</span>
          <span className="flex-1 text-center px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-[15px] font-semibold text-gray-700 shadow-sm">👁 Street View</span>
        </div>
      </div>
    </SlideSidebar>
  )
}

// ── Kendaraan ───────────────────────────────────────────────────────────────
const CARI = ['Merk / Tipe', 'No. Polisi', 'No. Rangka', 'No. Mesin', 'No. BPKB', 'NIBAR']

export function Kendaraan() {
  return (
    <SlideSidebar aktif="Kendaraan" materi={MATERI} label="Menu Aplikasi" judul="7. Kendaraan - satu data kendaraan">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <p className="mt-in text-[19px] text-gray-600" style={d(250)}>Cari kendaraan dinas lewat:</p>
        <div className="mt-up flex flex-wrap gap-2.5" style={d(350)}>
          {CARI.map(c => <span key={c} className="px-3.5 py-2 rounded-lg bg-navy/[0.07] text-navy text-[17px] font-semibold">{c}</span>)}
        </div>
        <Poin jeda={650}>Menunjukkan <b>siapa penggunanya</b> — jika di menu <Tbl>Pengamanan</Tbl> sudah dibuatkan <b>BAST</b> dan <b>Pakta Integritas</b>.</Poin>
        <Poin jeda={850}>Satu halaman memuat merk, nomor-nomor identitas, nilai, kondisi, dan keterangan.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px]">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-2xl p-5" style={d(400)}>
          <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-3 px-4 text-[15px] text-gray-400"><Ikon nama="cari" ukuran={20} />Ketik merk, nomor polisi, rangka, mesin…</div>
          <div className="mt-4 rounded-xl border border-teal/40 bg-teal/[0.05] p-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-lg bg-navy text-white flex items-center justify-center"><Ikon nama="truk" ukuran={24} /></span>
              <div>
                <p className="text-[18px] font-bold text-navy leading-tight">Kendaraan dinas</p>
                <p className="text-[13.5px] text-gray-500">No. Polisi · Rangka · Mesin · BPKB</p>
              </div>
            </div>
            <div className="mt-up mt-4 flex items-center gap-2 text-[15px] text-gray-700" style={d(1200)}>
              <Ikon nama="orang" ukuran={20} className="text-teal" />Pengguna: <b className="text-navy">pegawai pemegang BAST pengamanan</b>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-gray-400">Ilustrasi tampilan — bukan data sungguhan.</p>
        </div>
      </div>
    </SlideSidebar>
  )
}
