'use client'
// Materi "Entry Belanja Modal · Pengadaan" — penekanan KODEFIKASI BMD.
//
// ⚠️ Angka di slide "Masa manfaat" (394 kode aktif tanpa masa manfaat di
// Peralatan & Mesin, dst.) DIUKUR dari admin_kodefikasi_bmd per 2026-10-05 —
// angka itu berubah begitu admin menonaktifkan/menambah kode. Kalau materinya
// dipakai jauh sesudah tanggal itu, ukur ulang (kueri ada di catatan CLAUDE.md
// bagian materi ini) atau ganti jadi kalimat tanpa angka.
import { SlideTerang, Poin, Catatan, Tbl, Ikon, d, type NamaIkon } from '../bagian'
import { MATERI, KartuApp, Tombol, Lencana, Th, Contoh } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[440px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[660px]'

const AKIBAT: { ikon: NamaIkon; judul: string; isi: string }[] = [
  { ikon: 'turun', judul: 'Masa manfaat', isi: 'Menentukan beban penyusutan tiap semester. Masa manfaat 0 → barang tidak disusutkan.' },
  { ikon: 'hitung', judul: 'Batas kapitalisasi', isi: 'Nilai ≥ batas → Intrakomptabel (masuk neraca). Di bawahnya → Ekstrakomptabel.' },
  { ikon: 'grafik', judul: 'Jenis aset (3 segmen awal)', isi: 'Menentukan barang masuk baris mana di Laporan BMD & Rekonsiliasi.' },
  { ikon: 'qr', judul: 'NIBAR memuat kode barang', isi: 'NIBAR tidak pernah berubah — kode keliru menempel selamanya, walau register kelak direklas.' },
]

export function KodeMenentukan() {
  return (
    <SlideTerang materi={MATERI} label="Kodefikasi BMD · 1" judul="Kode barang menentukan banyak hal">
      <div className="absolute left-0 top-0 w-[560px] space-y-2.5">
        {AKIBAT.map((a, i) => (
          <div key={a.judul} className="mt-kiri flex items-start gap-4 rounded-xl border border-gray-200 bg-white shadow-md px-4 py-2.5" style={d(250 + i * 200)}>
            <span className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center flex-shrink-0"><Ikon nama={a.ikon} ukuran={22} /></span>
            <div><p className="text-[18px] font-bold text-navy leading-tight">{a.judul}</p><p className="mt-0.5 text-[14.5px] text-gray-500 leading-snug">{a.isi}</p></div>
          </div>
        ))}
        <Catatan jeda={1150} nada="amber" ikon="lampu">Salah kode baru ketahuan <b>sesudah</b> disetujui → harus <b>Reklasifikasi</b> berikut dokumen usulannya. Lebih murah teliti sekarang.</Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[560px]">
        <KartuApp jeda={500} judul="Nama mirip, kode berbeda — contoh di master kodefikasi">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr><Th>Kode</Th><Th>Uraian</Th><Th>Masa</Th><Th>Kapitalisasi</Th><Th>Pencarian</Th></tr></thead>
              <tbody>
                <tr className="border-b border-gray-50"><td className="px-2.5 py-2.5 font-medium text-gray-700">1.3.2.10.01.<wbr />02.002</td><td className="px-2.5">Lap Top</td><td className="px-2.5 font-semibold text-teal">4 th</td><td className="px-2.5">Rp1.500.000</td><td className="px-2.5"><Lencana nada="ok">AKTIF</Lencana></td></tr>
                <tr><td className="px-2.5 py-2.5 font-medium text-gray-700">1.3.2.05.01.<wbr />05.094</td><td className="px-2.5">Laptop</td><td className="px-2.5 font-semibold text-amber-700">5 th</td><td className="px-2.5">Rp500.000</td><td className="px-2.5"><Lencana nada="info">NONAKTIF</Lencana></td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-gray-600">
            Kode yang <b>dinonaktifkan admin</b> tidak muncul di pencarian. Tapi <b>nama yang mirip</b> bisa berada di kode lain dengan masa manfaat &amp; batas kapitalisasi berbeda — pilih yang <b>sesuai jenis barangnya</b>.
          </p>
        </KartuApp>
        <div className="mt-up mt-4 rounded-xl bg-navy text-white p-4 text-[14.5px] leading-snug" style={d(1000)}>
          Contoh dampak: Rp12.500.000 per unit → masa manfaat <b>4 tahun</b> = beban <b>Rp1.562.500 / semester</b>; bila kodenya 5 tahun menjadi <b>Rp1.250.000</b>.
        </div>
      </div>
    </SlideTerang>
  )
}

export function KodeMasaManfaat() {
  return (
    <SlideTerang materi={MATERI} label="Kodefikasi BMD · 2" judul="Periksa Masa Manfaat di panel hasil">
      <div className={KIRI}>
        <Poin jeda={250}>Kode yang tak bermasa manfaat <b>sudah dicekal</b> admin lewat <Tbl>Kodefikasi BMD</Tbl> — tidak muncul di pencarian.</Poin>
        <Poin jeda={450}><b>Tetapi belum menyeluruh.</b> Di Peralatan &amp; Mesin masih ada <b>394 kode aktif</b> yang masa manfaatnya 0 (per 5 Okt 2026).</Poin>
        <Poin jeda={650}>Barang berkode masa manfaat 0 <b>tidak disusutkan</b> — wajar untuk Tanah, Aset Tetap Lainnya, KDP; <b>tidak wajar</b> untuk peralatan, gedung, jalan.</Poin>
        <Catatan jeda={950} nada="amber" ikon="lampu">Biasakan membaca baris <b>Masa Manfaat</b> di panel hasil. Tertulis <b>0 tahun</b> atau <b>-</b> pada Peralatan, Gedung, atau JIJ → <b>jangan dipakai</b>; tanyakan ke Pengelola Barang.</Catatan>
      </div>
      <div className={KANAN}>
        <div className="grid grid-cols-2 gap-4">
          <KartuApp jeda={350} aksen="teal" judul={<span className="text-teal">✓ Wajar</span>}>
            <div className="grid grid-cols-[110px_1fr] gap-y-1 text-[12px]">
              <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">1.3.2.10.01.02.002</span>
              <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">Lap Top</span>
              <span className="text-gray-500">Masa Manfaat</span><span className="font-bold text-teal">4 tahun</span>
              <span className="text-gray-500">Kapitalisasi</span><span className="font-medium text-gray-700">Rp1.500.000,00</span>
            </div>
          </KartuApp>
          <KartuApp jeda={550} aksen="amber" judul={<span className="text-amber-700">⚠ Periksa kembali</span>}>
            <div className="grid grid-cols-[110px_1fr] gap-y-1 text-[12px]">
              <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">1.3.2.09.04.03.068</span>
              <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">Hacksaw (Breacing)</span>
              <span className="text-gray-500">Masa Manfaat</span><span className="font-bold text-amber-700 bg-amber-100 rounded px-1.5 w-fit">0 tahun</span>
              <span className="text-gray-500">Kapitalisasi</span><span className="font-medium text-gray-700">-</span>
            </div>
          </KartuApp>
        </div>
        <KartuApp jeda={800} className="mt-4" judul="Kode aktif bermasa manfaat 0 (per 5 Okt 2026)">
          <table className="w-full text-[12.5px]">
            <thead><tr><Th>Jenis aset</Th><Th tengah>Kode aktif masa 0</Th><Th>Artinya</Th></tr></thead>
            <tbody>
              {[
                ['1.3.1 Tanah · 1.3.5 ATL · 1.3.6 KDP', '249 · 322 · 5', 'Wajar — memang tidak disusutkan', 'ok'],
                ['1.3.2 Peralatan dan Mesin', '394', 'Periksa — 09.04 (343) · 06.04 (30) · 02.05 (21)', 'amber'],
                ['1.3.3 Gedung · 1.3.4 JIJ', '0 · 0', 'Semua kode aktif sudah bermasa manfaat', 'ok'],
              ].map(([a, b, c, n]) => (
                <tr key={a} className="border-t border-gray-100">
                  <td className="px-2.5 py-2 font-medium text-gray-700">{a}</td>
                  <td className="px-2.5 py-2 text-center font-bold text-navy">{b}</td>
                  <td className="px-2.5 py-2"><span className={n === 'amber' ? 'text-amber-700 font-semibold' : 'text-gray-600'}>{c}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </KartuApp>
      </div>
    </SlideTerang>
  )
}

const REK: [string, string][] = [
  ['1.3.1 Tanah', '5.2.01'], ['1.3.2 Peralatan dan Mesin', '5.2.02'], ['1.3.3 Gedung dan Bangunan', '5.2.03'],
  ['1.3.4 Jalan, Jaringan, Irigasi', '5.2.04'], ['1.3.5 Aset Tetap Lainnya', '5.2.05'],
  ['1.3.6 KDP', '5.2.03 / 5.2.04'], ['1.5.3 Aset Tidak Berwujud', '5.2.06'],
]

export function KodeRekening() {
  return (
    <SlideTerang materi={MATERI} label="Kodefikasi BMD · 3" judul="Kode rekening harus sejalan dengan kode barang">
      <div className="absolute left-0 top-0 w-[500px] space-y-3.5">
        <Poin jeda={250}>Belanja modal tercatat dua kali: di <b>LRA</b> menurut <b>kode rekening</b>, di <b>neraca</b> menurut <b>kode barang</b>.</Poin>
        <Poin jeda={450}>Kalau keduanya <b>tidak sejalan</b>, uang yang sama menambah jenis aset yang berbeda di dua laporan.</Poin>
        <Poin jeda={650}>Aplikasi memberi <b>pop-up konfirmasi</b> — itu <b>peringatan, bukan larangan</b>. Anggap sebagai alarm: periksa dulu sebelum menekan lanjut.</Poin>
        <Catatan jeda={950} nada="amber" ikon="lampu">Kasus nyata: <b>Backdrop Rp19.955.000</b> dibeli dengan rekening <b>5.2.03 Gedung</b>, tetapi kode barangnya <b>1.3.2 Peralatan dan Mesin</b>.</Catatan>
      </div>
      <div className="absolute right-0 top-0 w-[600px]">
        <div className="mt-pop rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden" style={d(500)}>
          <div className="px-5 py-3.5 border-b border-gray-100"><h3 className="font-semibold text-amber-700 text-[16px]">⚠ Konfirmasi Kode Rekening</h3></div>
          <div className="p-5 space-y-2 text-[14.5px] leading-snug text-gray-700">
            <p>Jenis aset <b>1.3.2 — Peralatan dan Mesin</b> biasanya memakai rekening <b>5.2.02.xx</b>, tetapi kode rekening yang dipilih ada di objek <b>5.2.03</b>. Jenis aset &amp; kode rekening <b>TIDAK SINKRON</b>. Yakin melanjutkan?</p>
            <p className="text-[12.5px] text-gray-400">Kalau ini keliru, batalkan lalu perbaiki jenis aset atau kode rekening dulu. Kalau memang disengaja (mis. reklasifikasi/kapitalisasi), silakan lanjutkan.</p>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2"><Tombol gaya="sekunder">Batal, perbaiki dulu</Tombol><Tombol>Ya, tetap tambahkan</Tombol></div>
        </div>
            <table className="mt-up mt-3 w-full text-[13px] rounded-lg overflow-hidden border border-gray-200 bg-white shadow-md" style={d(1100)}>
              <tbody>
                {REK.map(([g, r]) => (<tr key={g} className="border-b border-gray-100 last:border-0"><td className="px-4 py-1 text-gray-700">{g}</td><td className="px-4 py-1 font-bold text-navy text-right">{r}</td></tr>))}
              </tbody>
            </table>
      </div>
      <Contoh />
    </SlideTerang>
  )
}
