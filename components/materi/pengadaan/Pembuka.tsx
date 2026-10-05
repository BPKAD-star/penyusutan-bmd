'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide 1–3: sampul, peta alur, dan
// tiga penekanan (BAST, foto, kodefikasi).
import { SlideBersih, SlideTerang, Merek, Ikon, Jendela, Poin, Catatan, AlurLangkah, Jejak, d, type NamaIkon } from '../bagian'
import { SlideSidebar } from '../SidebarMock'
import { MATERI, Tombol, Lencana } from './bahan'

export function Sampul() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <Jendela className="absolute right-14 top-[120px] w-[610px]" jeda={250}>
        <div className="bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-700">Pembukuan › Cara Perolehan › Pengadaan</p>
            <Tombol>+ Tambah Pengadaan</Tombol>
          </div>
          <div className="mt-up rounded-xl border border-amber-300 bg-white shadow-md overflow-hidden" style={d(600)}>
            <div className="px-4 py-2 bg-amber-50 text-[12.5px] font-semibold text-amber-700">⏳ Menunggu Persetujuan</div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <p className="text-gray-400">Nomor Kontrak <span className="ml-3 text-gray-700">027/123/418.xx/2026</span></p>
              <p className="text-gray-400">Nomor BAST <span className="ml-3 text-gray-700">BAST/045/2026</span></p>
              <p className="text-gray-400">Jenis Kontrak <span className="ml-3 text-gray-700">SPK</span></p>
              <p className="text-gray-400">Tanggal BAST <span className="ml-3 text-gray-700">14 Agu 2026</span></p>
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              <span className="mt-pop" style={d(1000)}><Lencana nada="wajib">📎 BAST WAJIB</Lencana></span>
              <span className="mt-pop" style={d(1200)}><Lencana nada="wajib">📷 FOTO WAJIB</Lencana></span>
              <span className="mt-pop" style={d(1400)}><Lencana nada="amber">⚠ KODE BARANG TELITI</Lencana></span>
            </div>
          </div>
          <div className="mt-up rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3" style={d(900)}>
            <div className="w-8 h-8 rounded bg-teal/15 flex items-center justify-center text-teal"><Ikon nama="keranjang" ukuran={18} /></div>
            <div className="flex-1 space-y-1.5"><div className="h-2.5 w-44 rounded bg-gray-200" /><div className="h-2 w-28 rounded bg-gray-100" /></div>
            <Tombol gaya="sekunder">🔍 Pratinjau</Tombol>
            <Tombol>✓ Setujui</Tombol>
          </div>
        </div>
      </Jendela>

      <div className="absolute left-20 top-[140px] w-[560px]">
        <p className="mt-kiri inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal/10 border border-teal/30 text-[15px] font-semibold text-teal tracking-wide">
          <span className="mt-kedip w-2 h-2 rounded-full bg-amber-400" /> Materi Paparan · Bidang Pengelolaan BMD
        </p>
        <h1 className="mt-up mt-7 text-[50px] leading-[1.05] font-bold text-navy" style={d(200)}>Entry Belanja Modal</h1>
        <div className="mt-lebar mt-5 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-5 text-[28px] leading-snug font-semibold text-navy" style={d(550)}>
          Cara Perolehan › Pengadaan
        </p>
        <p className="mt-up mt-3 text-[19px] text-gray-500 leading-relaxed" style={d(700)}>
          Non Konstruksi dan Pekerjaan Konstruksi,<br />dengan <b className="text-navy">BAST</b> dan <b className="text-navy">foto</b> yang wajib diunggah.
        </p>
        <p className="mt-in mt-8 text-[17px] text-gray-400" style={d(1000)}><Merek kelas="text-[20px]" /> – BKAD Kabupaten Kediri</p>
      </div>
    </SlideBersih>
  )
}

export function PetaAlur() {
  return (
    <SlideSidebar aktif="Pembukuan/Cara Perolehan/Pengadaan" materi={MATERI} label="Menu · Pengadaan" judul="Satu menu, dua jalur entry">
      <div className="absolute left-0 top-0 w-[450px] space-y-4">
        <Poin jeda={250}>Buka <Jejak langkah={['Pembukuan', 'Cara Perolehan', 'Pengadaan']} />, lalu pilih <b>Lokasi / SKPD</b>.</Poin>
        <Poin jeda={450}><b>Belanja modal dicatat saat barang diserahterimakan</b> — tanggal BAST menjadi tanggal perolehan.</Poin>
        <Poin jeda={650}>Semua entri berupa <b>draft</b> dulu. Barang baru <b>resmi tercatat</b> di register setelah disetujui.</Poin>
        <Poin jeda={850}>Pilih jalurnya sesuai jenis belanja: barang jadi <b>(Non Konstruksi)</b> atau pekerjaan fisik bertahap <b>(Konstruksi)</b>.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Non Konstruksi</p>
          <p className="mt-1 text-[14px] text-gray-500">Laptop, kendaraan, meja, alat — barang yang langsung jadi.</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Kontrak', 'BAST', 'Barang', 'Foto', 'Setujui']} jeda={700} /></div>
        </div>
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(650)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Pekerjaan Konstruksi (KDP)</p>
          <p className="mt-1 text-[14px] text-gray-500">Gedung, jalan, jaringan — dibayar per termin selama dikerjakan.</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Kontrak', 'Barang KDP', 'BAST per termin', 'Foto', 'Setujui']} jeda={1000} /></div>
        </div>
        <Catatan jeda={1400} nada="teal" ikon="lampu">
          Keduanya memakai <b>pola yang sama</b>: isi draft → lengkapi dokumen &amp; foto → <b>Pratinjau</b> → disetujui.
        </Catatan>
      </div>
    </SlideSidebar>
  )
}

const TIGA: { ikon: NamaIkon; judul: string; poin: string[]; nada: string }[] = [
  { ikon: 'dokumen', judul: 'BAST wajib diunggah', nada: 'Non Konstruksi: satu BAST per kontrak. Konstruksi: satu BAST per termin.',
    poin: ['Tanpa BAST, kontrak tak bisa disimpan', 'Tanpa BAST, kartu tak bisa disetujui', 'Foto atau PDF, boleh lebih dari satu'] },
  { ikon: 'kamera', judul: 'Foto barang wajib', nada: 'Setiap barang — per unit — harus punya foto sebelum disetujui.',
    poin: ['Diunggah lewat ✎ Edit Spesifikasi', 'Nomor rangka / seri / merek harus terbaca', 'Berlaku untuk persetujuan selanjutnya'] },
  { ikon: 'cari', judul: 'Kode barang: teliti', nada: 'Kode menentukan masa manfaat, batas kapitalisasi, dan masuk laporan mana barang itu.',
    poin: ['Kode tanpa masa manfaat tak disusutkan', 'Nama mirip belum tentu kode yang sama', 'Selaraskan dengan kode rekening belanja'] },
]

export function Penekanan() {
  return (
    <SlideTerang materi={MATERI} label="Tiga penekanan" judul="Yang tidak boleh terlewat">
      <div className="absolute inset-0 grid grid-cols-3 gap-6">
        {TIGA.map((c, i) => (
          <div key={c.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6 flex flex-col" style={d(250 + i * 220)}>
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={c.ikon} ukuran={26} /></span>
              <span className="text-[40px] font-bold text-navy/15 leading-none">{i + 1}</span>
            </div>
            <p className="mt-4 text-[28px] font-bold leading-tight text-navy">{c.judul}</p>
            <p className="mt-3 text-[17.5px] leading-snug text-gray-500">{c.nada}</p>
            <ul className="mt-5 space-y-3 text-[18px] text-gray-700">
              {c.poin.map(p => (
                <li key={p} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}
