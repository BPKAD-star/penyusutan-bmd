'use client'
// Materi "Entry Hibah" — Cara Perolehan › Hibah. Versi ringkas dari materi
// Pengadaan: kartu dokumen → barang → foto → setujui.
//
// ⚠️ Label isian, tombol, & pesan DISALIN dari layarnya
// (components/pengelolaan/PerolehanManual.tsx, DokumenBastField.tsx,
// EditSpesifikasiModal.tsx). Kalau labelnya diganti di aplikasi, sesuaikan di sini.
// Bahan layar tiruan dipakai bersama materi Pengadaan (../pengadaan/bahan).
import { SlideBersih, SlideTerang, Merek, Ikon, Jendela, Poin, Catatan, Tbl, AlurLangkah, Jejak, d, type NamaIkon } from '../bagian'
import { SlideSidebar } from '../SidebarMock'
import { KartuApp, Isian, Tombol, Lencana, Th, FotoMini, Tunjuk, Contoh } from '../pengadaan/bahan'

export const MATERI = 'Entry Hibah'

const KIRI = 'absolute left-0 top-0 w-[440px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[660px]'

// ── 1. Sampul ───────────────────────────────────────────────────────────────
export function Sampul() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <Jendela className="absolute right-14 top-[130px] w-[580px]" jeda={250}>
        <div className="bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-700">Pembukuan › Cara Perolehan › Hibah</p>
            <Tombol>+ Tambah Hibah</Tombol>
          </div>
          <div className="mt-up rounded-xl border border-amber-300 bg-white shadow-md overflow-hidden" style={d(600)}>
            <div className="px-4 py-2 bg-amber-50 text-[12.5px] font-semibold text-amber-700">⏳ Menunggu Persetujuan</div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <p className="text-gray-400">No. Dokumen <span className="ml-3 text-gray-700">BAST/H/012/2026</span></p>
              <p className="text-gray-400">Tgl <span className="ml-3 text-gray-700">12 Feb 2026</span></p>
              <p className="col-span-2 text-gray-400">Pihak Pemberi <span className="ml-3 text-gray-700">Pemerintah Provinsi Jawa Timur</span></p>
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              <span className="mt-pop" style={d(1000)}><Lencana nada="wajib">📎 BAST WAJIB</Lencana></span>
              <span className="mt-pop" style={d(1200)}><Lencana nada="wajib">📷 FOTO WAJIB</Lencana></span>
              <span className="mt-pop" style={d(1400)}><Lencana nada="amber">📅 TGL PEROLEHAN</Lencana></span>
            </div>
          </div>
        </div>
      </Jendela>
      <div className="absolute left-20 top-[150px] w-[560px]">
        <p className="mt-kiri inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal/10 border border-teal/30 text-[15px] font-semibold text-teal tracking-wide">
          <span className="mt-kedip w-2 h-2 rounded-full bg-amber-400" /> Materi Paparan · Bidang Pengelolaan BMD
        </p>
        <h1 className="mt-up mt-7 text-[56px] leading-[1.05] font-bold text-navy" style={d(200)}>Entry Hibah</h1>
        <div className="mt-lebar mt-5 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-5 text-[28px] leading-snug font-semibold text-navy" style={d(550)}>Cara Perolehan › Hibah</p>
        <p className="mt-up mt-3 text-[19px] text-gray-500 leading-relaxed" style={d(700)}>
          Barang yang diterima dari pihak lain —<br />dengan <b className="text-navy">BAST</b>, <b className="text-navy">foto</b>, dan <b className="text-navy">tanggal perolehan</b> yang benar.
        </p>
        <p className="mt-in mt-8 text-[17px] text-gray-400" style={d(1000)}><Merek kelas="text-[20px]" /> – BKAD Kabupaten Kediri</p>
      </div>
    </SlideBersih>
  )
}

// ── 2. Peta alur ────────────────────────────────────────────────────────────
export function PetaAlur() {
  return (
    <SlideSidebar aktif="Pembukuan/Cara Perolehan/Hibah" materi={MATERI} label="Menu · Hibah" judul="Barang masuk tanpa membeli">
      <div className="absolute left-0 top-0 w-[450px] space-y-4">
        <Poin jeda={250}>Buka <Jejak langkah={['Pembukuan', 'Cara Perolehan', 'Hibah']} />, lalu pilih <b>Lokasi / SKPD</b> penerima.</Poin>
        <Poin jeda={450}>Satu dokumen (BAST) = <b>satu pemberi</b> dan <b>satu sumber dana</b>; isinya boleh banyak barang.</Poin>
        <Poin jeda={650}>Semua entri berupa <b>draft</b> dulu. Barang baru <b>resmi tercatat</b> di register setelah disetujui.</Poin>
        <Poin jeda={850}>Entry dilakukan <b>manual lewat form</b> — import Excel tidak tersedia, supaya BAST dan foto pasti terlampir.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Alur entry Hibah</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Dokumen & BAST', 'Barang', 'Spesifikasi & foto', 'Pratinjau', 'Setujui']} jeda={700} /></div>
        </div>
        <Catatan jeda={1200} nada="teal" ikon="lampu">
          Pola sama dengan <b>Pengadaan</b>. Bedanya: tidak ada kontrak &amp; kode rekening belanja, tetapi ada <b>Pihak Pemberi</b>, <b>Sumber Dana</b>, dan <b>tanggal perolehan per barang</b>.
        </Catatan>
        <Catatan jeda={1500} ikon="dokumen">
          Pembuat kartu <b>tidak bisa menyetujui kartunya sendiri</b> — persetujuan oleh admin / pengurus barang atasan.
        </Catatan>
      </div>
    </SlideSidebar>
  )
}

// ── 3. Tiga penekanan ───────────────────────────────────────────────────────
const TIGA: { ikon: NamaIkon; judul: string; nada: string; poin: string[] }[] = [
  { ikon: 'dokumen', judul: 'BAST wajib diunggah', nada: 'Satu dokumen hibah harus punya bukti serah terima.',
    poin: ['Tanpa BAST, dokumen tak bisa disimpan', 'No. Dokumen tak boleh kembar di SKPD', 'Foto atau PDF, boleh lebih dari satu'] },
  { ikon: 'kamera', judul: 'Foto tiap barang wajib', nada: 'Setiap unit harus punya foto sebelum disetujui.',
    poin: ['Diunggah lewat ✎ Edit Spesifikasi', 'Nomor seri / rangka / merek terbaca', 'Berlaku untuk persetujuan selanjutnya'] },
  { ikon: 'kalender', judul: 'Dua tanggal berbeda', nada: 'Tanggal BAST bukan otomatis tanggal barang dibuat.',
    poin: ['Tgl Dokumen = kapan hibah diterima', 'Tgl Perolehan = kapan barang dibuat', 'Barang bekas membawa akumulasi penyusutan'] },
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
            <p className="mt-4 text-[27px] font-bold leading-tight text-navy">{c.judul}</p>
            <p className="mt-3 text-[17.5px] leading-snug text-gray-500">{c.nada}</p>
            <ul className="mt-5 space-y-3 text-[18px] text-gray-700">
              {c.poin.map(p => <li key={p} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{p}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

// ── 4. Dokumen ──────────────────────────────────────────────────────────────
export function Dokumen() {
  return (
    <SlideTerang materi={MATERI} label="Langkah 1" judul="Buat dokumen hibah">
      <div className={KIRI}>
        <Poin jeda={250}>Tekan <Tbl>+ Tambah Hibah</Tbl>, lalu isi kartu dokumen.</Poin>
        <Poin jeda={450}><b>Pihak Pemberi Hibah</b> wajib — itu yang tercetak di Laporan Hibah.</Poin>
        <Poin jeda={650}><b>Sumber Dana</b> (mis. APBN, APBD Provinsi) muncul sebagai kolom di <b>Laporan Penerimaan BMD</b>.</Poin>
        <Poin jeda={850}><b>Tanpa dokumen BAST, dokumen tidak bisa disimpan.</b> Unggah scan yang lengkap dan terbaca.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="dokumen"><b>Tgl Dokumen</b> tidak boleh di masa depan dan harus di tahun yang masih terbuka.</Catatan>
      </div>
      <KartuApp className={KANAN} judul="Hibah Baru — SKPD penerima" jeda={300}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Isian label="No. Dokumen (BAST)" nilai="BAST/H/012/2026" wajib />
          <Isian label="Tgl Dokumen" nilai="12 Februari 2026" wajib />
          <Isian className="col-span-2" label="Pihak Pemberi Hibah" nilai="Pemerintah Provinsi Jawa Timur" wajib />
          <Isian label="Sumber Dana" nilai="APBD Provinsi Jawa Timur" />
          <Isian label="Keterangan" nilai="Hibah peralatan kantor" />
        </div>
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/50 p-3">
          <p className="text-[11.5px] text-gray-500">Dokumen BAST <span className="text-red-500">*</span> <span className="text-gray-400">— wajib</span></p>
          <div className="relative mt-2 inline-block"><Tombol gaya="kuning">📎 Upload Dokumen BAST</Tombol><Tunjuk className="-right-1 -top-1" /></div>
          <p className="mt-2 text-[11.5px] text-amber-700">Dokumen BAST wajib diunggah sebelum dokumen ini bisa disimpan.</p>
        </div>
        <div className="mt-4 flex justify-end"><Tombol>Simpan Dokumen</Tombol></div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 5. Barang ───────────────────────────────────────────────────────────────
export function Barang() {
  return (
    <SlideTerang materi={MATERI} label="Langkah 2" judul="Tambah barang ke dokumen">
      <div className={KIRI}>
        <Poin jeda={250}>Di kartu <b>Menunggu Persetujuan</b>, tekan <Tbl>+ Tambah Barang</Tbl>.</Poin>
        <Poin jeda={450}>Pilih <b>Jenis BMD</b> → <b>Cari</b> kode → pilih dari hasil. <b>Baca</b> Uraian Barang &amp; Masa Manfaat.</Poin>
        <Poin jeda={650}>Isi <b>Satuan, Kuantitas, Nilai / item</b>, dan <b>Tgl Perolehan</b> (wajib).</Poin>
        <Poin jeda={850}>Kuantitas &gt; 1 <b>dipecah per unit</b>; spesifikasi &amp; foto diisi per unit.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="lampu">
          Kode dengan <b>Masa Manfaat 0 / -</b> pada Peralatan, Gedung, atau JIJ <b>jangan dipakai</b> — barangnya tak disusutkan. Tanyakan ke Pengelola Barang.
        </Catatan>
      </div>
      <KartuApp className={KANAN} judul="+ Tambah Barang" jeda={300}>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Isian label="Jenis BMD" nilai="1.3.2 — Peralatan dan Mesin" wajib />
            <Isian label="Cari kode / nama baku" nilai="printer" />
            <Tombol gaya="sekunder">Cari</Tombol>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 grid grid-cols-[130px_1fr] gap-y-1 text-[12px]">
            <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">1.3.2.10.02.01.003</span>
            <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">Printer</span>
            <span className="text-gray-500">Masa Manfaat</span><span className="font-bold text-teal">5 tahun</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Isian label="Satuan" nilai="Unit" wajib />
            <Isian label="Kuantitas" nilai="2" wajib />
            <Isian label="Nilai / item" nilai="Rp 4.500.000" wajib />
            <Isian label="Tgl Perolehan" nilai="10 Jan 2026" wajib sorot />
          </div>
          <p className="text-[11.5px] text-gray-400">Tgl Perolehan boleh backdate ke tahun lama. Kuantitas &gt; 1 langsung dipecah jadi beberapa barang terpisah.</p>
          <div className="flex justify-end"><Tombol>Tambah ke Draft</Tombol></div>
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 6. Dua tanggal ──────────────────────────────────────────────────────────
export function DuaTanggal() {
  return (
    <SlideTerang materi={MATERI} label="Yang sering keliru" judul="Tanggal BAST ≠ tanggal perolehan">
      <div className="absolute inset-x-0 top-0">
        <div className="mt-up relative rounded-2xl border border-gray-200 bg-white shadow-lg px-10 pt-9 pb-8" style={d(250)}>
          <div className="relative h-24">
            <div className="absolute left-0 right-0 top-9 h-1.5 rounded-full bg-gray-200" />
            <div className="mt-lebar absolute left-[10%] w-[58%] top-9 h-1.5 rounded-full bg-amber-400" style={d(700)} />
            <div className="mt-pop absolute left-[10%] top-6 -ml-4" style={d(600)}>
              <span className="block w-9 h-9 rounded-full bg-amber-400 border-4 border-white shadow" />
              <p className="absolute top-10 left-1/2 -translate-x-1/2 w-[140px] text-center text-[14px] font-bold text-navy leading-tight">Maret 2024<br /><span className="font-normal text-gray-500">barang dibuat</span></p>
            </div>
            <div className="mt-pop absolute left-[68%] top-6 -ml-4" style={d(1100)}>
              <span className="block w-9 h-9 rounded-full bg-teal border-4 border-white shadow" />
              <p className="absolute top-10 left-1/2 -translate-x-1/2 w-[140px] text-center text-[14px] font-bold text-navy leading-tight">12 Feb 2026<br /><span className="font-normal text-gray-500">BAST hibah</span></p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-[13px] font-semibold tracking-[0.12em] uppercase text-amber-700">Tgl Perolehan (per barang)</p>
              <p className="mt-1 text-[16.5px] text-gray-700 leading-snug">Kapan barang <b>dibuat / diadakan oleh pemberi</b>. Dasar menghitung umur &amp; penyusutan.</p>
            </div>
            <div className="rounded-xl bg-teal/10 border border-teal/30 p-4">
              <p className="text-[13px] font-semibold tracking-[0.12em] uppercase text-teal">Tgl Dokumen (BAST)</p>
              <p className="mt-1 text-[16.5px] text-gray-700 leading-snug">Kapan hibah <b>diserahterimakan</b>. Dicatat di periode laporan itu.</p>
            </div>
          </div>
        </div>
        <p className="mt-in mt-5 text-[17.5px] leading-snug text-gray-600" style={d(1400)}>
          Barang bekas yang dibuat tahun-tahun lalu <b className="text-navy">masuk dengan akumulasi penyusutan sudah menempel</b> (kecuali Tanah, ATL, KDP) — umur dihitung sejak tahun pembuatannya, bukan sejak BAST.
          Isi Tgl Perolehan <b className="text-navy">sebenar mungkin</b>.
        </p>
      </div>
    </SlideTerang>
  )
}

// ── 7. Spesifikasi & foto ───────────────────────────────────────────────────
const BARIS: [string, boolean][] = [['Printer Epson L3250', true], ['Printer Epson L3250', false]]

export function SpekFoto() {
  return (
    <SlideTerang materi={MATERI} label="Langkah 3" judul="Spesifikasi & foto per barang">
      <div className={KIRI}>
        <Poin jeda={250}>Centang barang, lalu <Tbl>✎ Edit Spesifikasi</Tbl>: <b>Spesifikasi Nama Barang</b>, merek/tipe, kondisi, dll.</Poin>
        <Poin jeda={450} ikon="kamera"><b>Setiap unit wajib punya foto</b> — nomor seri / merek harus terbaca.</Poin>
        <Poin jeda={650} ikon="kamera">Centang beberapa unit sejenis lalu unggah — foto <b>ditambahkan</b> ke semuanya.</Poin>
        <Poin jeda={850}>Barang <b>beda jenis aset</b> tak bisa diedit bersamaan; kolomnya berbeda.</Poin>
        <div className="mt-up rounded-xl border border-red-200 bg-white shadow-lg p-4" style={d(1100)}>
          <p className="text-[14px] font-bold text-red-700">⚠ Belum bisa disetujui</p>
          <p className="mt-1 text-[13.5px] leading-snug text-gray-600">Barang &ldquo;Printer&rdquo; belum ada foto — lengkapi dulu.</p>
        </div>
      </div>
      <KartuApp className={KANAN} jeda={300} aksen="amber" judul={<span className="text-amber-700">⏳ Menunggu Persetujuan — BAST/H/012/2026</span>}>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <Th tengah>☐</Th><Th>Kode Barang</Th><Th>Spesifikasi Nama Barang</Th><Th>Tgl Perolehan</Th><Th tengah>Foto</Th>
            </tr></thead>
            <tbody>
              {BARIS.map(([n, foto], i) => (
                <tr key={i} className="mt-up border-b border-gray-50 last:border-0" style={d(700 + i * 150)}>
                  <td className="px-2.5 py-2 text-center">☑</td>
                  <td className="px-2.5 py-2"><p className="font-medium text-gray-700">1.3.2.10.02.01.003</p><p className="text-[10.5px] text-gray-400">Printer</p></td>
                  <td className="px-2.5 py-2 text-gray-700">{n}</td>
                  <td className="px-2.5 py-2 text-gray-600">10 Jan 2026</td>
                  <td className="px-2.5 py-2 text-center"><FotoMini kosong={!foto} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-teal/10 px-3 py-2 text-[12px] text-teal font-semibold">
          2 dipilih › <Tombol>✎ Edit Spesifikasi</Tombol> <Tombol gaya="sekunder">🗑 Hapus</Tombol>
        </div>
        <div className="mt-3 flex items-center gap-2"><Tombol>+ Tambah Barang</Tombol><Tombol gaya="sekunder">🔍 Pratinjau</Tombol><Tombol>✓ Setujui</Tombol></div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 8. Pratinjau & Setujui ──────────────────────────────────────────────────
export function Setujui() {
  return (
    <SlideTerang materi={MATERI} label="Langkah 4" judul="Pratinjau, lalu disetujui">
      <div className={KIRI}>
        <Poin jeda={250}><Tbl>🔍 Pratinjau</Tbl> menampilkan <b>seluruh isian</b> tiap barang; yang <b>kosong ditandai amber</b>. Operator SKPD boleh membukanya.</Poin>
        <Poin jeda={450}>Persetujuan oleh <b>admin / pengurus barang atasan</b>, bukan pembuat kartunya.</Poin>
        <Poin jeda={650}>Yang <b>disetujui terkunci</b>. Salah catat → <Tbl>🔓 Buka Kunci</Tbl>, perbaiki, setujui ulang.</Poin>
      </div>
      <div className={KANAN}>
        <div className="mt-up rounded-xl bg-navy text-white p-6" style={d(350)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-amber-300">Saat disetujui</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {['NIBAR & kode register terbit', 'Muncul di Daftar Barang', 'Mulai disusutkan', 'Kartu terkunci'].map((x, i) => (
              <span key={x} className="inline-flex items-center gap-2">{i > 0 && <span className="text-amber-300">›</span>}<span className="px-3 py-1.5 rounded-lg bg-white/[0.12]">{x}</span></span>
            ))}
          </div>
        </div>
        <div className="mt-up mt-5 rounded-xl border border-gray-200 bg-white shadow-lg p-5" style={d(700)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-teal">Di laporan</p>
          <p className="mt-2 text-[17px] leading-snug text-gray-700">
            Tampil di <Jejak langkah={['Pelaporan', 'Laporan Perolehan', 'Laporan Hibah']} /> berikut <b>Pihak Pemberi</b> dan <b>Sumber Dana</b> — dan ikut Laporan BMD &amp; Rekonsiliasi sebagai penambahan.
          </p>
        </div>
      </div>
    </SlideTerang>
  )
}

// ── 9. Salah entri ──────────────────────────────────────────────────────────
const PERBAIKAN: { judul: string; ikon: NamaIkon; isi: string[] }[] = [
  { judul: 'Masih draft', ikon: 'pensil', isi: ['Ubah No. Dokumen, tanggal, pemberi, sumber dana lewat ✎ Edit.', 'Ubah nama, foto, spesifikasi lewat ✎ Edit Spesifikasi.', 'Barang keliru: centang lalu 🗑 Hapus.'] },
  { judul: 'Sudah disetujui', ikon: 'gembok', isi: ['Kartu terkunci. Minta admin 🔓 Buka Kunci, perbaiki, setujui ulang.', 'NIBAR digenerate ulang; yang lama jadi arsip.', 'Ditolak bila barang sudah punya transaksi lebih baru.'] },
  { judul: 'Barang sudah bergerak', ikon: 'ulang', isi: ['Kode keliru → Reklasifikasi › Kesalahan Kodefikasi.', 'Nama / merek / foto kurang → Koreksi › Spesifikasi Barang.', 'Nilai keliru → Koreksi › Nilai Perolehan.'] },
]

export function Perbaikan() {
  return (
    <SlideTerang materi={MATERI} label="Kalau terlanjur" judul="Salah entri — jalan perbaikannya">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-6 items-start">
        {PERBAIKAN.map((k, i) => (
          <div key={k.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6" style={d(250 + i * 220)}>
            <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={k.ikon} ukuran={26} /></span>
            <p className="mt-4 text-[24px] font-bold text-navy leading-tight">{k.judul}</p>
            <ul className="mt-5 space-y-4 text-[18px] leading-snug text-gray-700">
              {k.isi.map(x => <li key={x} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

// ── 10. Daftar periksa ──────────────────────────────────────────────────────
const CEK: { judul: string; butir: string[] }[] = [
  { judul: 'Dokumen', butir: ['No. Dokumen belum dipakai', 'Pihak Pemberi & Sumber Dana terisi', 'Tgl Dokumen = tanggal BAST', 'Scan BAST terunggah & terbaca'] },
  { judul: 'Barang', butir: ['Kode sesuai jenis barangnya', 'Masa Manfaat bukan 0 / - (kecuali Tanah, ATL, KDP)', 'Tgl Perolehan = kapan barang dibuat', 'Nilai / item dan satuan terisi'] },
  { judul: 'Spesifikasi & foto', butir: ['Spesifikasi Nama Barang terisi', 'Foto tiap unit — seri / merek terbaca', '🔍 Pratinjau: kolom penting tidak amber', 'Baru setelah itu disetujui'] },
]

export function DaftarPeriksa() {
  return (
    <SlideTerang materi={MATERI} label="Ringkasan" judul="Daftar periksa sebelum disetujui">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-6 items-start">
        {CEK.map((c, i) => (
          <div key={c.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6" style={d(250 + i * 220)}>
            <p className="text-[22px] font-bold text-navy">{c.judul}</p>
            <ul className="mt-5 space-y-4">
              {c.butir.map((b, j) => (
                <li key={b} className="mt-kiri flex items-start gap-3 text-[18px] leading-snug text-gray-700" style={d(550 + i * 220 + j * 120)}>
                  <span className="mt-0.5 w-6 h-6 rounded-md border-2 border-teal text-teal flex items-center justify-center flex-shrink-0"><Ikon nama="centang" ukuran={15} tebal={3} /></span>{b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

// ── 11. Penutup ─────────────────────────────────────────────────────────────
export function Tutup() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <div className="absolute left-20 top-1/2 -translate-y-1/2 w-[900px]">
        <h2 className="mt-up text-[72px] font-bold leading-none text-navy" style={d(200)}>Terima kasih</h2>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-7 text-[28px] leading-snug font-semibold text-navy" style={d(600)}>
          <span className="text-teal">BAST</span> lengkap <span className="text-amber-500 mx-2">·</span>
          <span className="text-teal">Foto</span> tiap barang <span className="text-amber-500 mx-2">·</span>
          <span className="text-teal">Tanggal perolehan</span> yang benar
        </p>
        <p className="mt-in mt-5 text-[20px] text-gray-500" style={d(900)}>Hibah yang dicatat benar sejak awal membuat umur dan nilai buku barangnya dapat dipertanggungjawabkan.</p>
      </div>
    </SlideBersih>
  )
}
