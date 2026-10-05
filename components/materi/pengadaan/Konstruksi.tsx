'use client'
// Materi "Entry Belanja Modal · Pengadaan" — jalur PEKERJAAN KONSTRUKSI (KDP).
// Mock layarnya meniru components/pengelolaan/KonstruksiPengadaan.tsx.
import { SlideTerang, Poin, Catatan, Tbl, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI, KartuApp, Isian, Tombol, Lencana, Th, FotoMini, Tunjuk, Contoh } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[440px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[660px]'

const LANGKAH: { ikon: NamaIkon; judul: string; isi: string; tanda?: string }[] = [
  { ikon: 'dokumen', judul: 'Buat kontrak', isi: 'Tekan + Buat Kontrak: nama pekerjaan, No. & Tgl Kontrak, bentuk kontrak (SPK / Surat Perjanjian), PPK.' },
  { ikon: 'gedung', judul: 'Tambah barang KDP', isi: 'Satu kontrak bisa memuat beberapa barang (mis. beberapa ruas jalan). Kode hanya golongan 1.3.6.' },
  { ikon: 'hitung', judul: 'Rincian per termin', isi: 'Perencanaan, Fisik, Biaya Umum, Pengawasan — tiap termin bertanggal BAST dan bernilai.', tanda: 'BAST per termin' },
  { ikon: 'kamera', judul: 'Spesifikasi & foto', isi: 'Nama barang (tak boleh kembar), lokasi, dan foto tiap barang KDP.', tanda: 'Foto wajib' },
  { ikon: 'centang', judul: 'Pratinjau & setujui', isi: 'Disetujui sekaligus satu kontrak: seluruh barang & termin tercatat dalam satu langkah.' },
]

export function AlurKonstruksi() {
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi · 1" judul="Alur entry konstruksi (KDP)">
      <div className="absolute inset-x-0 top-0 grid grid-cols-5 gap-4">
        {LANGKAH.map((l, i) => (
          <div key={l.judul} className="mt-up relative rounded-2xl border border-gray-200 bg-white shadow-lg p-5 h-[268px]" style={d(250 + i * 200)}>
            <div className="flex items-center justify-between">
              <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={l.ikon} ukuran={24} /></span>
              <span className="text-[34px] font-bold text-navy/15 leading-none">{i + 1}</span>
            </div>
            <p className="mt-4 text-[20px] font-bold text-navy leading-tight">{l.judul}</p>
            <p className="mt-2 text-[14.5px] text-gray-500 leading-snug">{l.isi}</p>
            {l.tanda && <span className="absolute left-5 bottom-4"><Lencana nada="wajib">{l.tanda}</Lencana></span>}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 grid grid-cols-2 gap-5">
        <Catatan jeda={1500} nada="teal" ikon="lampu">Nilai tiap barang = <b>jumlah seluruh termin</b>-nya. Komptabelnya <b>Intra</b>; golongan 1.3.6 tidak disusutkan sampai direklas.</Catatan>
        <Catatan jeda={1700} nada="amber" ikon="dokumen">Beda dengan Non Konstruksi: BAST <b>diunggah per termin</b>, bukan satu untuk seluruh kontrak.</Catatan>
      </div>
    </SlideTerang>
  )
}

const TERMIN: [string, string, string, string][] = [
  ['Perencanaan', 'BAST-PRC-01.pdf', '02 Sep 2026', 'Rp 45.000.000'],
  ['Fisik — Termin 1', 'BAST-FSK-01.pdf', '30 Okt 2026', 'Rp 380.000.000'],
  ['Pengawasan', 'BAST-PWS-01.pdf', '30 Okt 2026', 'Rp 22.500.000'],
]

export function KartuKdp() {
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi · 2" judul="Kartu barang KDP & rincian termin">
      <div className={KIRI}>
        <Poin jeda={250}>Tiap barang KDP punya <b>tabel termin</b>: komponen, <b>dokumen &amp; tanggal BAST</b>, rekening, nilai.</Poin>
        <Poin jeda={450}><Tbl>+ Tambah Rincian</Tbl> <b>ditolak</b> bila dokumen BAST termin itu belum diunggah.</Poin>
        <Poin jeda={650}>Tgl BAST termin <b>tidak boleh lebih tua</b> dari tgl kontrak. Daftar otomatis <b>urut tanggal</b>.</Poin>
        <Poin jeda={850}>Selesai satu termin, <b>kode rekening &amp; tanggal BAST dikosongkan</b> — supaya termin berikut tak mewarisi isian lama.</Poin>
        <Poin jeda={1050}>Foto barang tampil di bawah <b>Nilai</b>; belum ada foto = belum bisa disetujui.</Poin>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={300} judul={<span><b>1.3.6.01.01.01.003 - Gedung dan Bangunan Dalam Pengerjaan</b></span>}>
          <div className="grid grid-cols-[1fr_190px] gap-4">
            <div className="grid grid-cols-[140px_1fr] gap-y-1 text-[12px] content-start">
              <span className="text-gray-400">Spesifikasi Nama Barang</span><span className="text-gray-700">Pembangunan Gedung Kantor Kecamatan</span>
              <span className="text-gray-400">Lokasi</span><span className="text-gray-700">Jl. Raya Kecamatan No. 1</span>
              <span className="text-gray-400">Komptabel</span><span className="text-gray-700">Intra</span>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Nilai (Σ termin)</p>
              <p className="text-[19px] font-bold text-navy">Rp 447.500.000</p>
              <div className="mt-1 flex justify-end"><FotoMini /></div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr><Th>Komponen</Th><Th>Dokumen dan Tanggal BAST</Th><Th>Rekening</Th><Th>Nilai</Th></tr></thead>
              <tbody>
                {TERMIN.map(([k, f, t, n], i) => (
                  <tr key={k} className="mt-up border-b border-gray-50 last:border-0" style={d(700 + i * 150)}>
                    <td className="px-2.5 py-2 font-medium text-gray-700">{k}</td>
                    <td className="px-2.5 py-2"><p className="text-teal">📎 {f}</p><p className="text-[10.5px] text-gray-400">{t}</p></td>
                    <td className="px-2.5 py-2"><p className="text-gray-700">5.2.03.01.001.00001</p><p className="text-[10.5px] text-gray-400">Belanja Modal Gedung</p></td>
                    <td className="px-2.5 py-2 text-gray-700">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="relative mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <Tombol gaya="utama">+ Tambah Rincian</Tombol>
            <span className="text-[12px] text-amber-800">Komponen: Fisik · Termin 2 — <b>📎 dokumen BAST termin ini wajib</b></span>
            <Tunjuk className="right-3 -top-1.5" jeda={1800} />
          </div>
        </KartuApp>
      </div>
      <Contoh />
    </SlideTerang>
  )
}

export function AturanKonstruksi() {
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi · 3" judul="Tiga penjaga sebelum KDP disetujui">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-6 items-start">
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(250)}>
          <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="dokumen" ukuran={24} /></span>
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">BAST tiap termin</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug">Rincian termin <b>tidak bisa ditambah</b> tanpa dokumennya.</p>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <p className="text-[13.5px] font-bold text-amber-800">⚠ Belum bisa ditambahkan</p>
            <p className="mt-1 text-[12.5px] leading-snug text-amber-900">Dokumen BAST termin &ldquo;Perencanaan&rdquo; ini wajib diunggah sebelum rincian bisa ditambahkan.</p>
          </div>
        </div>
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(470)}>
          <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="kamera" ukuran={24} /></span>
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">Foto tiap barang KDP</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug">Diunggah lewat <b>✎ Edit Spesifikasi</b>. Gunakan foto <b>kondisi pekerjaan</b> di lapangan.</p>
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5">
            <p className="text-[13.5px] font-bold text-red-700">⚠ Belum bisa disetujui</p>
            <p className="mt-1 text-[12.5px] leading-snug text-red-900">Barang &ldquo;Pembangunan Gedung Kantor&rdquo; belum ada foto — lengkapi dulu sebelum kontrak ini disetujui.</p>
          </div>
        </div>
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(690)}>
          <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="periksa" ukuran={24} /></span>
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">Nama barang unik</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug"><b>Spesifikasi Nama Barang wajib</b> diisi dan <b>tidak boleh kembar</b> dalam kontrak.</p>
          <div className="mt-4 space-y-2">
            {['Ruas Jalan Desa A – Desa B', 'Ruas Jalan Desa C – Desa D'].map(n => (
              <div key={n} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700">{n}<Lencana nada="ok">UNIK</Lencana></div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-gray-700">Ruas Jalan Desa A – Desa B<Lencana nada="wajib">KEMBAR</Lencana></div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <Catatan jeda={1200} nada="teal" ikon="lampu">Penolakan selalu muncul sebagai <b>pop-up berikut alasannya</b> — baca isinya, lengkapi, lalu ulangi. Tidak ada yang dilewatkan diam-diam.</Catatan>
      </div>
      <Contoh />
    </SlideTerang>
  )
}

const KODE_KDP: [string, string, string][] = [
  ['1.3.6.01.01.01.001', 'Tanah Dalam Pengerjaan', '→ 1.3.1 Tanah'],
  ['1.3.6.01.01.01.002', 'Peralatan dan Mesin Dalam Pengerjaan', '→ 1.3.2 Peralatan dan Mesin'],
  ['1.3.6.01.01.01.003', 'Gedung dan Bangunan Dalam Pengerjaan', '→ 1.3.3 Gedung dan Bangunan'],
  ['1.3.6.01.01.01.004', 'Jalan, Irigasi, dan jaringan Dalam Pengerjaan', '→ 1.3.4 Jalan, Irigasi, Jaringan'],
  ['1.3.6.01.01.01.005', 'Aset Tetap Lainnya Dalam Pengerjaan', '→ 1.3.5 Aset Tetap Lainnya'],
]

export function KodeKdp() {
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi · 4" judul="Pilih kode KDP sesuai hasil akhirnya">
      <div className={KIRI}>
        <Poin jeda={250}>Hanya ada <b>lima kode KDP</b>; masing-masing sesuai jenis aset yang kelak <b>dihasilkan</b>.</Poin>
        <Poin jeda={450}>Pilih menurut <b>apa yang dibangun</b>: gedung → 003, jalan / jembatan / irigasi → 004. Jangan sembarang karena &ldquo;terdekat&rdquo;.</Poin>
        <Poin jeda={650}>KDP <b>tidak disusutkan</b> (masa manfaat 0 — memang wajar). Penyusutan dimulai setelah <b>direklas</b> ke jenis tujuan.</Poin>
        <Catatan jeda={950} nada="amber" ikon="lampu">Saat <b>Reklasifikasi</b> nanti, kode tujuan <b>perlu dipilih teliti lagi</b> — masa manfaat kode tujuan itulah yang dipakai menyusutkan.</Catatan>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={300} judul="Kode barang KDP (golongan 1.3.6)">
          <div className="space-y-2">
            {KODE_KDP.map(([k, u, t], i) => (
              <div key={k} className={`mt-kanan grid grid-cols-[150px_1fr_220px] items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] ${i === 2 || i === 3 ? 'border-teal bg-teal/5' : 'border-gray-200'}`} style={d(500 + i * 130)}>
                <span className="font-semibold text-gray-700">{k}</span><span className="text-gray-700">{u}</span><span className="text-teal font-semibold">{t}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-gray-500 leading-snug">Untuk konstruksi gedung dan jalan, kodenya <b>003</b> dan <b>004</b>. Alurnya: KDP → <Tbl>Reklasifikasi</Tbl> ke jenis tujuan → bila menambah aset induk, <Tbl>Kapitalisasi</Tbl>.</p>
        </KartuApp>
      </div>
    </SlideTerang>
  )
}
