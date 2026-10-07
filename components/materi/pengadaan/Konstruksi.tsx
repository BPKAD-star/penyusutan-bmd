'use client'
// Materi "Entry Belanja Modal · Pengadaan" — jalur PEKERJAAN KONSTRUKSI (KDP).
// Mock layarnya meniru components/pengelolaan/KonstruksiPengadaan.tsx.
import { SlideTerang, Poin, Catatan, Tbl, Ikon, d } from '../bagian'
import { MATERI, KartuApp, Tombol, Lencana, Th, FotoMini, Tunjuk, Contoh } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[440px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[660px]'

// Susunan Kartu → Barang → Kontrak → BAST (sama dgn layar sejak 2026-10-08):
// kontrak tampil di bawah barang, BAST-nya bertingkat di bawah kontraknya.
type BastMock = { no: string; file: string; tgl: string; nilai: string; ok: boolean }
const KONTRAK_MOCK: { komponen: string; no: string; tgl: string; info: string; bast: BastMock[] }[] = [
  { komponen: 'Perencanaan', no: '027/PRC/2026', tgl: '03 Mar 2026', info: 'SPK · CV Rancang Bangun · Nilai Rp 50.000.000',
    bast: [{ no: '027/BAST-PRC/2026', file: 'BAST-PRC-01.pdf', tgl: '02 Sep 2026', nilai: 'Rp 45.000.000', ok: true }] },
  { komponen: 'Fisik', no: '027/SPK/2026', tgl: '04 Jun 2026', info: 'Surat Perjanjian · CV Karya Mandiri · Nilai Rp 400.000.000',
    bast: [{ no: '027/BAST-FSK/2026', file: 'BAST-FSK-01.pdf', tgl: '30 Okt 2026', nilai: 'Rp 380.000.000', ok: true }] },
  { komponen: 'Pengawasan', no: '027/PWS/2026', tgl: '04 Jun 2026', info: 'SPK · CV Awas Teliti · Nilai Rp 25.000.000',
    bast: [{ no: '027/BAST-PWS/2026', file: 'BAST-PWS-01.pdf', tgl: '30 Okt 2026', nilai: 'Rp 22.500.000', ok: false }] },
]
// Kolom BAST SEJAJAR antar kontrak — persis tabel di layar (table-fixed).
const KOLOM_BAST = 'grid grid-cols-[1fr_150px_118px_92px] gap-2 items-start'

export function KartuKdp() {
  let n = 0
  return (
    <SlideTerang materi={MATERI} label="Pekerjaan Konstruksi · 2" judul="Barang → Kontrak → BAST">
      <div className={KIRI}>
        <Poin jeda={250}>Di bawah <b>barang KDP</b> tampil <b>kontraknya</b> per komponen — perencanaan, fisik, pengawasan.</Poin>
        <Poin jeda={450}>BAST ditambahkan <b>di bawah kontraknya</b> lewat <Tbl>+ Tambah BAST</Tbl> — kontrak &amp; komponennya sudah terisi sendiri.</Poin>
        <Poin jeda={650}>Tgl BAST <b>tidak boleh lebih tua</b> dari tgl kontraknya, dan wajib di tahun kartu. Dokumen BAST <b>wajib</b> diunggah.</Poin>
        <Poin jeda={850}>Biaya umum tanpa kontrak? <Tbl>+ BAST Biaya Umum (tanpa kontrak)</Tbl>.</Poin>
        <Poin jeda={1050}>Admin menekan <Tbl>✓ Setujui</Tbl> <b>per BAST</b>; yang keliru cukup <Tbl>↩ Batal</Tbl> BAST itu.</Poin>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={300} judul={<span><b>1.3.6.01.01.01.003 - Gedung dan Bangunan Dalam Pengerjaan</b></span>}>
          <div className="flex items-start justify-between gap-4 text-[12px]">
            <div className="grid grid-cols-[150px_1fr] gap-y-0.5">
              <span className="text-gray-400">Spesifikasi Nama Barang</span><span className="text-gray-700">Gedung Kantor Kecamatan</span>
              <span className="text-gray-400">Lokasi</span><span className="text-gray-700">Jl. Raya Kecamatan No. 1</span>
            </div>
            <div className="text-right flex items-start gap-2">
              <div>
                <p className="text-[10.5px] text-gray-400">Disetujui</p>
                <p className="text-[16px] font-bold text-navy leading-tight">Rp 425.000.000</p>
                <p className="text-[10px] text-amber-600">+ Rp 22.500.000 menunggu</p>
              </div>
              <FotoMini />
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-gray-200 divide-y divide-gray-100">
            {KONTRAK_MOCK.map((k, ki) => (
              <div key={k.no} className="px-3 py-1.5">
                <div className="mt-up relative flex items-start justify-between gap-2" style={d(600 + (n++) * 150)}>
                  <div className="text-[11.5px] min-w-0">
                    <p className="font-semibold text-gray-800">Kontrak {k.komponen} <span className="font-normal text-gray-600">· {k.no} · {k.tgl}</span></p>
                    <p className="text-[10.5px] text-gray-400 truncate">{k.info}</p>
                  </div>
                  <Tombol gaya="sekunder" className="!h-6 !px-2 !text-[11px]">+ Tambah BAST</Tombol>
                  {ki === 1 && <Tunjuk className="right-1 -top-1" jeda={1900} />}
                </div>
                {k.bast.map(t => (
                  <div key={t.no} className={`mt-up ${KOLOM_BAST} pl-5 pt-1 text-[11px]`} style={d(600 + (n++) * 150)}>
                    <span className="text-gray-600 truncate"><span className="text-gray-300 mr-1">↳</span>{t.no}</span>
                    <span><span className="text-teal">📎 {t.file}</span><span className="block text-[10px] text-gray-400">{t.tgl}</span></span>
                    <span className="text-right text-gray-700">{t.nilai}</span>
                    <span>{t.ok ? <Lencana nada="ok">DISETUJUI</Lencana> : <Lencana nada="amber">MENUNGGU</Lencana>}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Tombol gaya="sekunder" className="!h-7 !text-[11.5px]">+ Tambah Kontrak</Tombol>
            <Tombol gaya="sekunder" className="!h-7 !text-[11.5px]">+ BAST Biaya Umum (tanpa kontrak)</Tombol>
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
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">Dokumen tiap BAST</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug">BAST <b>tidak bisa ditambah</b> di bawah kontraknya tanpa dokumennya.</p>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <p className="text-[13.5px] font-bold text-amber-800">⚠ Belum bisa ditambahkan</p>
            <p className="mt-1 text-[12.5px] leading-snug text-amber-900">Dokumen BAST &ldquo;Perencanaan&rdquo; ini wajib diunggah sebelum BAST bisa ditambahkan.</p>
          </div>
        </div>
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(470)}>
          <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="kamera" ukuran={24} /></span>
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">Foto tiap barang KDP</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug">Diunggah lewat <b>✎ Edit Spesifikasi</b>. Gunakan foto <b>kondisi pekerjaan</b> di lapangan.</p>
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5">
            <p className="text-[13.5px] font-bold text-red-700">⚠ Belum bisa disetujui</p>
            <p className="mt-1 text-[12.5px] leading-snug text-red-900">Barang &ldquo;Pembangunan Gedung Kantor&rdquo; belum ada foto — lengkapi dulu lewat Edit Spesifikasi.</p>
          </div>
        </div>
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(690)}>
          <span className="w-11 h-11 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama="periksa" ukuran={24} /></span>
          <p className="mt-3 text-[21px] font-bold text-navy leading-tight">Nama barang unik</p>
          <p className="mt-1.5 text-[14.5px] text-gray-500 leading-snug"><b>Spesifikasi Nama Barang wajib</b> diisi dan <b>tidak boleh kembar</b> dalam satu kartu.</p>
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
