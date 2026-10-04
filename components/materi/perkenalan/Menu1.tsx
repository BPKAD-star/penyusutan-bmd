'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — penjelasan per menu sidebar (1/3):
// Dashboard, Saldo Awal, RKBMD, Pembukuan, Cara Perolehan, Pengelolaan.
// Isi mengikuti rekapan user 2026-10-04; nama menu/tab disalin dari aplikasi.
import { SlideTerang, Poin, Catatan, Jejak, AlurLangkah, KartuMenu, Ikon, d } from '../bagian'
import { MATERI } from './Pembuka'

// ── Dashboard ───────────────────────────────────────────────────────────────
const RINGKAS: [string, number, number][] = [
  ['Pengadaan', 70, 18], ['Hibah', 46, 10], ['Tukar Menukar', 12, 5], ['Hasil Inventarisasi', 24, 8], ['Perolehan Lainnya', 18, 6],
]

export function Dashboard() {
  return (
    <SlideTerang materi={MATERI} label="Menu · Dashboard" judul="Dashboard — ringkasan sekilas">
      <div className="absolute left-0 top-0 w-[570px] space-y-5">
        <Poin jeda={250}>Ringkasan <b>jenis aset</b>: jumlah unit dan nilainya.</Poin>
        <Poin jeda={450}><b>Cara perolehan</b>: pengadaan, hibah, dan lainnya.</Poin>
        <Poin jeda={650}><b>Pengelolaan</b>: mutasi dan transfer yang sedang berjalan.</Poin>
        <Poin jeda={850}><b>Penghapusan</b>: per sebab, lengkap dengan jumlah dan nilai.</Poin>
        <Poin jeda={1050}>Semuanya dibaca <b>mulai dari statusnya sampai nilainya</b> — disetujui atau masih menunggu.</Poin>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[520px] rounded-2xl border border-gray-200 bg-white shadow-2xl p-6" style={d(350)}>
        <p className="text-[16px] font-bold text-navy">Cara Perolehan</p>
        <div className="mt-4 space-y-3.5">
          {RINGKAS.map(([nama, setuju, tunggu], i) => (
            <div key={nama}>
              <div className="flex justify-between text-[14px] text-gray-600 mb-1"><span>{nama}</span><span className="text-gray-400">nilai</span></div>
              <div className="flex h-3.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="mt-lebar h-full bg-teal" style={{ width: `${setuju}%`, ...d(700 + i * 120) }} />
                <div className="mt-lebar h-full bg-amber-400" style={{ width: `${tunggu}%`, ...d(900 + i * 120) }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-5 text-[13.5px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal" />Disetujui</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400" />Menunggu persetujuan</span>
        </div>
        <p className="mt-4 text-[12px] text-gray-400">Ilustrasi tampilan — angka bukan data sungguhan.</p>
      </div>
    </SlideTerang>
  )
}

// ── Saldo Awal ──────────────────────────────────────────────────────────────
export function SaldoAwal() {
  return (
    <SlideTerang materi={MATERI} label="Menu · Saldo Awal" judul="Saldo Awal — titik awal register">
      <div className="absolute left-0 top-0 w-[600px] space-y-5">
        <Poin jeda={250}><b>Rekapitulasi</b>: posisi barang akhir 2025 per jenis aset.</Poin>
        <Poin jeda={450}><b>Daftar Barang Awal</b>: barang saldo awal satu per satu.</Poin>
        <Poin jeda={650}>Kelengkapan <b>spesifikasi barang tahun 2025 ke bawah</b> dilengkapi di Daftar Barang Awal.</Poin>
        <div className="mt-up pl-11" style={d(850)}><Jejak langkah={['Saldo Awal', 'Daftar Barang Awal', 'centang barang', 'Edit Spesifikasi']} /></div>
        <Catatan jeda={1100} ikon="grafik">
          <b>Harap diperhatikan</b> — kelengkapan data ini masuk komponen penilaian <b>IPA</b>.
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[480px] space-y-4">
        <KartuMenu ikon="grafik" judul="Rekapitulasi" isi="Posisi akhir 2025 per jenis aset — nilai perolehan, akumulasi, nilai buku." jeda={400} tinggi="h-[110px]" />
        <KartuMenu ikon="daftar" judul="Daftar Barang Awal" isi="Daftar register tahun 2025 ke bawah; spesifikasi barang bisa diedit di sini." jeda={600} tinggi="h-[110px]" sorot />
        <div className="mt-up flex items-center gap-3 rounded-xl bg-navy text-white px-5 py-4" style={d(900)}>
          <Ikon nama="bola" ukuran={30} className="text-amber-300 flex-shrink-0" />
          <p className="text-[16px] leading-snug">Barang saldo awal yang <b>spesifikasinya lengkap</b> menaikkan nilai IPA SKPD.</p>
        </div>
      </div>
    </SlideTerang>
  )
}

// ── RKBMD ───────────────────────────────────────────────────────────────────
export function Rkbmd() {
  return (
    <SlideTerang materi={MATERI} label="Menu · RKBMD" judul="RKBMD — standar harga dan perencanaan">
      <div className="absolute left-0 top-0 w-[560px] space-y-5">
        <Poin jeda={250}><b>Standar Harga</b>: SSH, HSPK, ASB, SBU, dan SBSK — diusulkan SKPD, ditelaah, lalu jadi acuan bersama.</Poin>
        <Poin jeda={450}><b>RKBMD</b>: usulan kebutuhan pengadaan, pemeliharaan, pemanfaatan, pemindahtanganan, dan penghapusan.</Poin>
        <Poin jeda={650}>Barang dipilih dari standar harga — <b>harga tidak diketik sendiri</b>.</Poin>
        <Catatan jeda={900} ikon="bola">
          RKBMD jadi komponen penilaian <b>IPA</b>. Untuk <b>2027</b>, jika ada usulan RKBMD, <b>silakan dicoba diisi di aplikasi</b>.
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[520px] space-y-5">
        {[['Standar Harga', 'kalender'], ['RKBMD', 'dokumen']].map(([judul, ikon], i) => (
          <div key={judul} className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400 + i * 250)}>
            <div className="flex items-center gap-3 mb-3.5">
              <span className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center"><Ikon nama={ikon as 'kalender' | 'dokumen'} ukuran={22} /></span>
              <p className="text-[20px] font-bold text-navy">{judul}</p>
            </div>
            <AlurLangkah langkah={['Usulan', 'Validasi', 'Pelaporan']} jeda={800 + i * 250} />
            <p className="mt-3 text-[14px] text-gray-500">
              {i === 0 ? 'SKPD mengusulkan, Pengelola Barang menelaah, yang disetujui jadi acuan se-kabupaten.' : 'SKPD menyusun & mengajukan, Pengelola Barang menelaah, hasilnya bisa dicetak.'}
            </p>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

// ── Pembukuan ───────────────────────────────────────────────────────────────
export function Pembukuan() {
  return (
    <SlideTerang materi={MATERI} label="Menu · Pembukuan" judul="Pembukuan — menu utama aplikasi">
      <div className="absolute left-0 top-0 w-[590px] space-y-5">
        <Poin jeda={250}>Tempat <b>semua peristiwa barang dicatat</b>: masuk, dipakai, dipindah, dikoreksi, dihapus.</Poin>
        <Poin jeda={450}>Tiap catatan <b>berdokumen</b> (BAST/SK) dan tercatat siapa yang mengentrinya.</Poin>
        <Poin jeda={650}>Salah catat → <b>dibatalkan atau dikoreksi</b>; riwayat barang tetap utuh, tidak ada yang dihapus diam-diam.</Poin>
        <Poin jeda={850}>Begitu disetujui, langsung terpakai di <b>Daftar Barang, Penyusutan, dan Laporan</b>.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[520px] grid grid-cols-2 gap-4">
        <KartuMenu ikon="keranjang" judul="Cara Perolehan" isi="Barang masuk ke register" jeda={400} tinggi="h-[128px]" />
        <KartuMenu ikon="tukar" judul="Pengelolaan" isi="Selama barang dipakai" jeda={550} tinggi="h-[128px]" />
        <KartuMenu ikon="hitung" judul="LRA" isi="Belanja modal vs entry" jeda={700} tinggi="h-[128px]" />
        <KartuMenu ikon="gedung" judul="KIR" isi="Isi barang tiap ruangan" jeda={850} tinggi="h-[128px]" />
      </div>
    </SlideTerang>
  )
}

// ── Cara Perolehan ──────────────────────────────────────────────────────────
export function CaraPerolehan() {
  return (
    <SlideTerang materi={MATERI} label="Pembukuan · Cara Perolehan" judul="Cara Perolehan — barang masuk ke register">
      <div className="absolute left-0 top-0 w-[570px] space-y-4">
        <p className="mt-in text-[17px] font-semibold text-gray-500" style={d(200)}>Lima menu:</p>
        <div className="mt-up flex flex-wrap gap-2" style={d(300)}>
          {['Pengadaan', 'Hibah', 'Tukar Menukar', 'Hasil Inventarisasi', 'Perolehan Lainnya'].map(x => (
            <span key={x} className="px-3.5 py-1.5 rounded-lg bg-navy/[0.07] text-navy text-[17px] font-semibold">{x}</span>
          ))}
        </div>
        <Poin jeda={500}><b>Wajib melampirkan dokumen sumber (BAST)</b> dan <b>foto barang</b> sebelum disetujui.</Poin>
        <Poin jeda={700}>Pengadaan diklasifikasikan menjadi <b>Pekerjaan Konstruksi</b> dan <b>Non Konstruksi</b>.</Poin>
        <Poin jeda={900}><b>Spesifikasi Nama Barang wajib diisi</b>; di konstruksi, nama tiap barang tidak boleh kembar.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[520px] space-y-4">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400)}>
          <p className="text-[15px] font-bold tracking-wide text-teal uppercase">Non Konstruksi</p>
          <div className="mt-3"><AlurLangkah langkah={['Kontrak + BAST', 'Barang + Nilai', 'Spesifikasi']} jeda={700} /></div>
        </div>
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(650)}>
          <p className="text-[15px] font-bold tracking-wide text-teal uppercase">Pekerjaan Konstruksi (KDP)</p>
          <div className="mt-3"><AlurLangkah langkah={['Kontrak', 'Barang', 'BAST + Nilai', 'Spesifikasi']} jeda={950} /></div>
        </div>
        <div className="mt-up rounded-2xl bg-navy text-white p-5" style={d(1200)}>
          <p className="text-[14px] font-semibold tracking-[0.15em] uppercase text-amber-300">Alur persetujuan</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            {['Entri draft', 'BAST & foto', 'Pratinjau', 'Disetujui'].map((x, i) => (
              <span key={x} className="inline-flex items-center gap-2">{i > 0 && <span className="text-amber-300">›</span>}<span className="px-3 py-1.5 rounded-lg bg-white/[0.12]">{x}</span></span>
            ))}
          </div>
          <p className="mt-3 text-[14.5px] text-white/70">NIBAR dan kode register terbit saat disetujui.</p>
        </div>
      </div>
    </SlideTerang>
  )
}

// ── Pengelolaan ─────────────────────────────────────────────────────────────
const PENGELOLAAN = ['Penggunaan', 'Penerimaan Internal', 'Pengeluaran Internal', 'Pemanfaatan', 'Reklasifikasi', 'Koreksi', 'Kapitalisasi', 'Pengamanan', 'Penghapusan', 'WasDal']

export function Pengelolaan() {
  return (
    <SlideTerang materi={MATERI} label="Pembukuan · Pengelolaan" judul="Pengelolaan — menu utama pengelolaan BMD">
      <div className="absolute left-0 top-0 w-[580px] space-y-5">
        <Poin jeda={250}>Pengurus barang <b>bisa melaksanakannya sendiri</b>, dengan pantauan dari admin.</Poin>
        <Poin jeda={450}>Tiap peristiwa dicatat dengan dokumen dasarnya, lalu otomatis menggerakkan <b>Daftar Barang, Penyusutan, dan Laporan</b>.</Poin>
        <Poin jeda={650}>Detail tiap menu bisa kita telusuri langsung di aplikasi.</Poin>
        <Catatan jeda={900} nada="teal" ikon="lampu">
          <b>Segera:</b> cakupan kegiatan pengurus barang kita naikkan ke tahap <b>pengelolaan</b>, tidak hanya entri belanja modal 😊
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[520px] grid grid-cols-2 gap-3">
        {PENGELOLAAN.map((x, i) => (
          <div key={x} className="mt-pop rounded-xl border border-gray-200 bg-white shadow-md px-4 h-[60px] flex items-center gap-3" style={d(350 + i * 90)}>
            <span className="w-7 h-7 rounded-full bg-teal text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0">{i + 1}</span>
            <p className="text-[17px] font-bold text-navy leading-tight">{x}</p>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

