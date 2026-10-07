'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — penjelasan per menu sidebar (1/3):
// Dashboard, Saldo Awal, RKBMD, Pembukuan, Cara Perolehan, Pengelolaan.
// Isi mengikuti rekapan user 2026-10-04; nama menu/tab disalin dari aplikasi.
import { SlideSidebar } from '../SidebarMock'
import { Poin, Catatan, Jejak, AlurLangkah, KartuMenu, Ikon, d } from '../bagian'
import { MATERI } from './Pembuka'
import { DashboardMock } from './DashboardMock'

// ── Dashboard ───────────────────────────────────────────────────────────────
// Isi slide = tiruan layar Dashboard hidup (DashboardMock) — susunannya sama
// dgn app/dashboard/page.tsx; penjelasannya ditaruh di judul seksi layarnya.
export function Dashboard() {
  return (
    <SlideSidebar masuk aktif="Dashboard" materi={MATERI} label="Menu Aplikasi" judul="1. Dashboard (Ringkasan Sekilas)">
      <DashboardMock />
      <p className="absolute right-0 -bottom-5 text-[11px] text-gray-400">Ilustrasi tampilan — angka contoh, bukan data sungguhan.</p>
    </SlideSidebar>
  )
}

// ── Saldo Awal ──────────────────────────────────────────────────────────────
export function SaldoAwal() {
  return (
    <SlideSidebar aktif="Saldo Awal" materi={MATERI} label="Menu Aplikasi" judul="2. Saldo Awal (titik awal register)">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Poin jeda={250}><b>Rekapitulasi</b>: posisi barang akhir 2025 per jenis aset.</Poin>
        <Poin jeda={450}><b>Daftar Barang Awal</b>: barang saldo awal satu per satu.</Poin>
        <Poin jeda={650}>Jika <b>belum terkunci</b> (tidak ada pengelolaan data barang di 2026), kelengkapan <b>spesifikasi barang tahun 2025 ke bawah</b> dilengkapi di Daftar Barang Awal.</Poin>
        <div className="mt-up pl-11" style={d(850)}><Jejak langkah={['Saldo Awal', 'Daftar Barang Awal', 'centang barang', 'Edit Spesifikasi']} /></div>
        <Catatan jeda={1100} ikon="grafik">
          <b>Harap diperhatikan</b> — kelengkapan data ini masuk komponen penilaian <b>IPA</b>.
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        <KartuMenu ikon="grafik" judul="Rekapitulasi" isi="Posisi akhir 2025 per jenis aset — nilai perolehan, akumulasi, nilai buku." jeda={400} tinggi="h-[110px]" />
        <KartuMenu ikon="daftar" judul="Daftar Barang Awal" isi="Daftar register tahun 2025 ke bawah; spesifikasi barang bisa diedit di sini." jeda={600} tinggi="h-[110px]" sorot />
        <div className="mt-up flex items-center gap-3 rounded-xl bg-navy text-white px-5 py-4" style={d(900)}>
          <Ikon nama="bola" ukuran={30} className="text-amber-300 flex-shrink-0" />
          <p className="text-[16px] leading-snug">Barang saldo awal yang <b>spesifikasinya lengkap</b> menaikkan nilai IPA SKPD.</p>
        </div>
      </div>
    </SlideSidebar>
  )
}

// ── Saldo Awal: rekapitulasi total ──────────────────────────────────────────
// ANGKA STATIS dari layar Saldo Awal › Rekapitulasi (Rekap per Golongan, semua
// SKPD, semua komptabel) — disalin user 2026-10-06. Sengaja BUKAN tarikan DB:
// saldo awal itu foto BEKU akhir 2025 (aset_awal_2026), jadi angkanya memang
// tak akan bergeser; dan tarikan DB per-pengguna cuma menampilkan cakupan SKPD
// si pembuka paparan, bukan total se-kabupaten.
// Diperbarui 2026-10-07 (sesudah import ATL Diknas perolehan 2025, +17.771 barang,
// +Rp11.217.056.855): hanya baris 1.3.5 & TOTAL yang berubah. Kolom akumulasi &
// beban tak bergeser — ATL tidak disusutkan.
const REKAP_SALDO: [string, string, string, string, string, string, string][] = [
  ['1.3.1', 'Tanah', '2.732', '1.156.309.715.727,16', '–', '–', '1.156.309.715.727,16'],
  ['1.3.2', 'Peralatan dan Mesin', '660.470', '1.405.199.655.505,97', '1.153.374.148.816,37', '130.723.851.936,86', '251.825.506.705,55'],
  ['1.3.3', 'Gedung dan Bangunan', '8.350', '2.134.344.993.957,62', '449.825.289.390,70', '20.246.760.329,56', '1.684.519.704.566,93'],
  ['1.3.4', 'Jalan, Jaringan dan Irigasi', '8.127', '3.778.566.895.300,36', '2.441.033.217.008,63', '103.741.394.607,50', '1.337.533.678.291,94'],
  ['1.3.5', 'Aset Tetap Lainnya', '191.700', '184.477.261.086,82', '–', '–', '184.477.261.086,82'],
  ['1.3.6', 'Konstruksi Dalam Pengerjaan', '233', '195.710.710.149,00', '–', '–', '195.710.710.149,00'],
  ['1.5.3', 'Aset Tidak Berwujud', '120', '17.239.249.988,00', '10.100.715.667,93', '1.246.543.175,63', '7.138.534.320,07'],
  ['1.5.4', 'Aset Lain-Lain', '50.479', '124.500.266.399,63', '19.064.330.821,04', '187.458.607,59', '105.435.935.578,59'],
]
const TOTAL_SALDO = ['922.211', '8.996.348.748.114,56', '4.073.397.701.704,67', '256.146.008.657,14', '4.922.951.046.426,06']
const KOLOM_SALDO = ['Kode Jenis', 'Uraian', 'Kuantitas', 'Harga Perolehan', 'Akumulasi Penyusutan (Saldo Awal)', 'Beban Penyusutan / Smt', 'Nilai Buku']

export function RekapSaldoAwal() {
  return (
    <SlideSidebar aktif="Saldo Awal/Rekapitulasi" materi={MATERI} label="Saldo Awal" judul="Rekapitulasi saldo awal 2026">
      <div className="mt-up rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden" style={d(250)}>
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-3 text-[12px] text-gray-500">
          <span className="px-2.5 py-1 rounded-md bg-white border border-gray-200 font-semibold text-gray-700">Rekap per Golongan</span>
          Posisi saldo awal 2026 (baseline e-BMD / akhir 2025) · semua SKPD · semua komptabel
        </div>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="border-b border-gray-100 text-[9.5px] uppercase tracking-wide text-gray-500">
              {KOLOM_SALDO.map((k, i) => <th key={k} className={`px-2 py-2 font-semibold ${i < 2 ? 'text-left' : 'text-right'}`}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {REKAP_SALDO.map((r, i) => (
              <tr key={r[0]} className="mt-in border-b border-gray-50" style={d(450 + i * 90)}>
                {r.map((c, j) => <td key={j} className={`px-2 py-2 ${j < 2 ? 'text-left text-gray-700' : 'text-right text-gray-800'} ${c === '–' ? 'text-gray-300' : ''}`}>{c}</td>)}
              </tr>
            ))}
            <tr className="mt-in bg-gray-50 font-bold text-gray-900" style={d(1300)}>
              <td className="px-2 py-2 text-left text-[10px]">TOTAL</td><td />
              {TOTAL_SALDO.map((c, j) => <td key={j} className={`px-2 py-2 text-right ${j === 4 ? 'text-teal' : ''}`}>{c}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-in mt-3 text-[14px] text-gray-500 leading-snug" style={d(1500)}>
        <b className="text-navy">Foto beku akhir 2025</b> — tidak bergeser oleh transaksi 2026. Dari sini seluruh perjalanan barang di 2026 dimulai.
      </p>
    </SlideSidebar>
  )
}

// ── RKBMD ───────────────────────────────────────────────────────────────────
export function Rkbmd() {
  return (
    <SlideSidebar aktif="RKBMD" materi={MATERI} label="Menu Aplikasi" judul="3. RKBMD (Standar harga dan perencanaan)">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Poin jeda={250}><b>Standar Harga</b>: SSH, HSPK, ASB, SBU, dan SBSK — diusulkan SKPD, ditelaah, lalu jadi acuan bersama.</Poin>
        <Poin jeda={450}><b>Perencanaan</b> (RKBMD): usulan kebutuhan pengadaan, pemeliharaan, pemanfaatan, pemindahtanganan, dan penghapusan.</Poin>
        <Poin jeda={650}>Barang dipilih dari standar harga — <b>harga tidak diketik sendiri</b>.</Poin>
        <Catatan jeda={900} ikon="bola">
          RKBMD jadi komponen penilaian <b>IPA</b>. Untuk <b>2027</b>, jika ada usulan RKBMD, <b>silakan dicoba diisi di aplikasi</b>.
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-5">
        {[['Standar Harga', 'kalender'], ['Perencanaan', 'dokumen']].map(([judul, ikon], i) => (
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
    </SlideSidebar>
  )
}

// ── Pembukuan ───────────────────────────────────────────────────────────────
export function Pembukuan() {
  return (
    <SlideSidebar aktif="Pembukuan" materi={MATERI} label="Menu Aplikasi" judul="4. Pembukuan (hidangan utama aplikasi)">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Poin jeda={250}>Tempat <b>semua peristiwa barang dicatat</b>: masuk, dipakai, dipindah, dikoreksi, dihapus.</Poin>
        <Poin jeda={450}>Tiap catatan <b>berdokumen</b> (BAST/SK) dan tercatat siapa yang mengentrinya.</Poin>
        <Poin jeda={650}>Salah catat → <b>dibatalkan atau dikoreksi</b>; riwayat barang tetap utuh, tidak ada yang dihapus diam-diam.</Poin>
        <Poin jeda={850}>Begitu disetujui, langsung terpakai di <b>Daftar Barang, Penyusutan, dan Laporan</b>.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] grid grid-cols-2 gap-4">
        <KartuMenu ikon="keranjang" judul="Cara Perolehan" isi="Barang masuk ke register" jeda={400} tinggi="h-[128px]" />
        <KartuMenu ikon="tukar" judul="Pengelolaan" isi="Selama barang dipakai" jeda={550} tinggi="h-[128px]" />
        <KartuMenu ikon="hitung" judul="LRA" isi="Belanja modal vs entry" jeda={700} tinggi="h-[128px]" />
        <KartuMenu ikon="gedung" judul="KIR" isi="Isi barang tiap ruangan" jeda={850} tinggi="h-[128px]" />
      </div>
    </SlideSidebar>
  )
}

// ── Cara Perolehan ──────────────────────────────────────────────────────────
export function CaraPerolehan() {
  return (
    <SlideSidebar aktif="Pembukuan/Cara Perolehan" materi={MATERI} label="Pembukuan" judul="Cara Perolehan (Barang masuk ke register)">
      <div className="absolute left-0 top-0 w-[450px] space-y-4">
        <Poin jeda={250}>Lima menu: <b>Pengadaan, Hibah, Tukar Menukar, Hasil Inventarisasi, Perolehan Lainnya</b>.</Poin>
        <Poin jeda={450}><b>Wajib melampirkan dokumen sumber (BAST)</b> dan <b>foto barang</b> sebelum disetujui.</Poin>
        <Poin jeda={650}>Pengadaan diklasifikasikan menjadi <b>Pekerjaan Konstruksi</b> dan <b>Non Konstruksi</b>.</Poin>
        <Poin jeda={850}><b>Spesifikasi Nama Barang wajib diisi</b>; di konstruksi, nama tiap barang tidak boleh kembar.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Non Konstruksi</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Kontrak + BAST', 'Barang + Nilai', 'Spesifikasi']} jeda={700} /></div>
        </div>
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(650)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Pekerjaan Konstruksi (KDP)</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Kontrak', 'Barang', 'BAST + Nilai', 'Spesifikasi']} jeda={950} /></div>
        </div>
        <div className="mt-up rounded-2xl bg-navy text-white p-5" style={d(1200)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-amber-300">Alur persetujuan</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
            {['Entri draft', 'BAST & foto', 'Pratinjau', 'Disetujui'].map((x, i) => (
              <span key={x} className="inline-flex items-center gap-2">{i > 0 && <span className="text-amber-300">›</span>}<span className="px-2.5 py-1.5 rounded-lg bg-white/[0.12]">{x}</span></span>
            ))}
          </div>
          <p className="mt-3 text-[13.5px] text-white/70">NIBAR dan kode register terbit saat disetujui.</p>
        </div>
      </div>
    </SlideSidebar>
  )
}

// ── Pengelolaan ─────────────────────────────────────────────────────────────
const PENGELOLAAN = ['Penggunaan', 'Penerimaan Internal', 'Pengeluaran Internal', 'Pemanfaatan', 'Reklasifikasi', 'Koreksi', 'Kapitalisasi', 'Pengamanan', 'Penghapusan', 'WasDal']

export function Pengelolaan() {
  return (
    <SlideSidebar aktif="Pembukuan/Pengelolaan" materi={MATERI} label="Pembukuan" judul="Pengelolaan (tempat pusingnya pengurus barang)">
      <div className="absolute left-0 top-0 w-[450px] space-y-5">
        <Poin jeda={250}>Pengurus barang <b>bisa melaksanakannya sendiri</b>, dengan pantauan dari admin.</Poin>
        <Poin jeda={450}>Tiap peristiwa dicatat dengan dokumen dasarnya, lalu otomatis menggerakkan <b>Daftar Barang, Penyusutan, dan Laporan</b>.</Poin>
        <Poin jeda={650}>Detail tiap menu bisa kita telusuri langsung di aplikasi.</Poin>
        <Catatan jeda={900} nada="teal" ikon="lampu">
          <b>Segera:</b> cakupan kegiatan pengurus barang kita naikkan ke tahap <b>pengelolaan</b>, tidak hanya entri belanja modal 😊
        </Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[470px] grid grid-cols-2 gap-3">
        {PENGELOLAAN.map((x, i) => (
          <div key={x} className="mt-pop rounded-xl border border-gray-200 bg-white shadow-md px-4 h-[60px] flex items-center gap-3" style={d(350 + i * 90)}>
            <span className="w-7 h-7 rounded-full bg-teal text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0">{i + 1}</span>
            <p className="text-[17px] font-bold text-navy leading-tight">{x}</p>
          </div>
        ))}
      </div>
    </SlideSidebar>
  )
}

