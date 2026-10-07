'use client'
// Materi "Inventarisasi Gedung dan Bangunan" — LKI Format III.A.3 (jenis aset 1.3.3).
// Slide yang sama dgn materi Tanah ada di ./Bersama; di sini data Gedung + slide
// yang khas Gedung: sebab "tidak ada", biaya atribusi, rumah negara, tanah milik.
//
// ⚠️ Mengikuti `LKI_CONFIG['1.3.3']` & `LKI_MATRIX` (lib/inventarisasi.ts): Luas,
// sebab tidak ada, atribusi, rumah negara (BAST Pemakaian & SIP), "di atas tanah
// milik" YA; Merek/Tipe, Spesifikasi Lainnya, nomor kendaraan TIDAK. Tabel
// `SEBAB_TIDAK_ADA` disalin dari berkas itu. Kalau aturannya berubah, sesuaikan di sini.
import type { ReactNode } from 'react'
import { SlideTerang, Tbl, Poin, Catatan, d } from '../bagian'
import { SlideSidebar } from '../SidebarMock'
import { KartuApp, Contoh } from '../pengadaan/bahan'
import { SeksiMock, SesuaiMock, Radio, Ketik } from './bahan'
import {
  SampulInv, PetaAlurInv, PenekananInv, LembarKerjaInv, Luas, SimpanFotoInv, SesudahSimpanInv,
  BelumTercatatInv, TemuanInv, DaftarPeriksaInv, TutupInv, type JenisInv, type KartuTiga,
} from './Bersama'

export const MATERI_GEDUNG = 'Inventarisasi Gedung dan Bangunan'

const GEDUNG: JenisInv = {
  materi: MATERI_GEDUNG, nama: 'Gedung dan Bangunan', kode: '1.3.3', format: 'III.A.3', judul: 'Inventarisasi Gedung dan Bangunan',
  tagline: <>Periksa tiap bangunan —<br />keberadaannya, <b className="text-navy">sebab bila tidak ada</b>, pemakainya, dan <b className="text-navy">fotonya</b>.</>,
  lencana: [{ t: '📷 FOTO WAJIB', nada: 'wajib' }, { t: '❓ SEBAB TIDAK ADA', nada: 'amber' }, { t: '🏠 BAST & SIP', nada: 'ok' }],
  contoh: { kode: '1.3.3.01.01.01.001', uraian: 'Bangunan Gedung Kantor Permanen', nama: 'Gedung Kantor Dinas' },
  kurang: ['Luas — pilih Sesuai atau Tidak Sesuai', 'Biaya atribusi (I) — belum dipilih', 'Berdiri di atas tanah milik (N) — belum dipilih'],
  isianBaru: [
    'Spesifikasi Nama Barang', 'Spesifikasi Lainnya', 'Provinsi / Kab. / Kec. / Desa', 'Detail Alamat (Jalan)', 'Titik Koordinat',
    'Kondisi Barang', 'Penggunaan', 'Keterangan', 'Luas', 'Asal Usul',
  ],
}

// ── 1–4. Pembuka & Lembar Kerja ─────────────────────────────────────────────
export const Sampul = () => <SampulInv j={GEDUNG} />
export const PetaAlur = () => <PetaAlurInv j={GEDUNG} />
export const LembarKerja = () => <LembarKerjaInv j={GEDUNG} />

const TIGA: KartuTiga[] = [
  { ikon: 'kamera', judul: 'Foto / denah wajib', nada: 'Satu lembar tak bisa disimpan tanpa foto.',
    poin: ['Data Sesuai → foto di register boleh dipakai', 'Ada yang Tidak Sesuai → unggah foto terbaru', 'Bangunan hilang / tak ditemukan tak perlu foto'] },
  { ikon: 'periksa', judul: '“Tidak ada karena…”', nada: 'Sebab yang dipilih menentukan laporan dan tindak lanjutnya.',
    poin: ['Force majeure, dibongkar → III.B.2', 'Direhab atau digabung → III.B.3', 'Seharusnya beberapa register → III.B.13'] },
  { ikon: 'gedung', judul: 'Rumah negara: BAST & SIP', nada: 'Bangunan yang dipakai pegawai harus jelas dasarnya.',
    poin: ['Nama & Status Pemakai wajib diisi', 'Ada BAST Pemakaian → nomornya wajib', 'Ada Surat Ijin Penghunian → nomornya wajib'] },
]
export const Penekanan = () => <PenekananInv j={GEDUNG} kartu={TIGA} />

// ── 5. Isi form ─────────────────────────────────────────────────────────────
const BAGIAN: [string, string][] = [
  ['A', 'NIBAR'], ['B–C', 'Kode Barang & Nama Barang'], ['D', 'Nama Spesifikasi Barang'], ['F', 'Luas (m²)'],
  ['J', 'Wilayah'], ['J', 'Alamat Detail'], ['O', 'Titik Koordinat'], ['F', 'Satuan Barang'],
  ['G', 'Keberadaan Barang'], ['I', 'Biaya atribusi'], ['K', 'Kondisi Barang'], ['L', 'Penggunaan Barang'],
  ['M', 'Tercatat Ganda'], ['N', 'Di atas tanah milik'], ['Q', 'Keterangan Barang'], ['Q', 'Catatan Inventarisasi'], ['R', 'Foto / Denah'],
]
const KHAS = new Set(['G', 'I', 'N'])

export function FormGedung() {
  return (
    <SlideTerang materi={MATERI_GEDUNG} label="Langkah 2 · Isi LKI" judul="Isi form — satu bangunan, satu lembar">
      <div className="absolute left-0 top-0 w-[460px] space-y-4">
        <Poin jeda={250}>Form terbuka dari <Tbl>Isi Inventarisasi</Tbl>. Bagian berkode huruf, urutannya seperti di kartu kanan.</Poin>
        <Poin jeda={450}>Hampir tiap bagian = kotak biru <b>Tercatat</b> + <b>Sesuai / Tidak Sesuai</b>; bila tidak sesuai, <b>sebutkan yang seharusnya</b>.</Poin>
        <Poin jeda={650}>Jumlah dan nilai perolehan <b>hanya tampil</b> — tak bisa diubah lewat inventarisasi.</Poin>
        <Catatan jeda={1000} nada="amber" ikon="lampu">
          Bagian yang <b>khas bangunan</b> (ditandai amber): <b>G</b> sebab tidak ada, <b>I</b> biaya atribusi, <b>N</b> tanah milik — dibahas di slide berikut.
        </Catatan>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[640px]" judul="Form LKI — Format III.A.3 · Gedung dan Bangunan" jeda={300}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-2.5">
            <SeksiMock kode="B–C" judul="Kode Barang & Nama Barang"><SesuaiMock lama="1.3.3.01.01.01.001 · Bangunan Gedung Kantor Permanen" pilih="sesuai" /></SeksiMock>
            <SeksiMock kode="D" judul="Nama Spesifikasi Barang"><SesuaiMock lama="Gedung Kantor Dinas" pilih="sesuai" /></SeksiMock>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Bagian yang ditanyakan untuk Gedung</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {BAGIAN.map(([k, t], i) => (
                <p key={t + i} className={`mt-in text-[11px] leading-tight ${KHAS.has(k) ? 'text-amber-700 font-semibold' : 'text-gray-700'}`} style={d(600 + i * 45)}><span className="text-gray-400 mr-1">{k}.</span>{t}</p>
              ))}
            </div>
            <p className="mt-3 text-[10.5px] text-gray-400 leading-snug"><b>Tidak ditanyakan:</b> Merek / Tipe · Spesifikasi Lainnya · nomor kendaraan.</p>
          </div>
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 6. Luas, alamat, titik ──────────────────────────────────────────────────
export const LuasGedung = () => (
  <Luas j={GEDUNG} luas={{ lama: '240 m²', baru: '256' }} wilayah="Desa Contoh, Kec. Contoh, Kabupaten Kediri"
    catatan={<>Satu register = satu lembar. Kalau ternyata seharusnya <b>beberapa register</b>, pilih sebab itu di <b>Keberadaan</b> — jangan mengubah luas jadi gabungan.</>} />
)

// ── 7. Sebab "tidak ada" ────────────────────────────────────────────────────
const SEBAB: [string, string, string, string][] = [
  ['Force majeure (bencana, kebakaran, dsb.)', 'Penjelasan kejadian (bebas diketik)', 'III.B.2', 'Usulan penghapusan'],
  ['Dibongkar total dan sudah ada bangunan baru', 'Pilih bangunan baru pengganti', 'III.B.2', 'Usulan penghapusan'],
  ['Direhab dan jadi bangunan baru', 'Pilih bangunan baru (anak)', 'III.B.3', 'Kapitalisasi ke induk'],
  ['Digabung dengan bangunan lain', 'Pilih bangunan induk', 'III.B.3', 'Kapitalisasi ke induk'],
  ['Seharusnya ada beberapa register', 'Nama tiap bangunan (minimal 2)', 'III.B.13', 'Koreksi → Pemecahan Barang'],
]

export function SebabTidakAda() {
  return (
    <SlideTerang materi={MATERI_GEDUNG} label="Langkah 3 · Keberadaan" judul="“Tidak ada karena…” menentukan laporan">
      <div className="absolute inset-x-0 top-0">
        <div className="mt-up flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white shadow-md px-5 py-3" style={d(250)}>
          <span className="text-[13px] font-semibold text-gray-700"><span className="text-gray-400 mr-1">G.</span>Keberadaan Barang</span>
          <Radio label="Ada" /><Radio label="Tidak ada / tidak ditemukan" aktif /><Radio label="Hilang karena kecurian" />
          <span className="text-[12.5px] text-gray-400">→ sebab muncul <b>hanya</b> bila memilih &ldquo;Tidak ada / tidak ditemukan&rdquo;</span>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="grid grid-cols-[340px_300px_110px_1fr] bg-navy text-white text-[13px] font-semibold tracking-wide uppercase px-5 py-2.5">
            <span>Tidak ada karena…</span><span>Yang wajib diisi</span><span>Laporan</span><span>Tindak lanjut</span>
          </div>
          {SEBAB.map(([a, b, c, e], i) => (
            <div key={a} className={`mt-in grid grid-cols-[340px_300px_110px_1fr] items-center px-5 py-3 text-[15.5px] leading-snug ${i % 2 ? 'bg-gray-50' : ''}`} style={d(450 + i * 130)}>
              <span className="font-semibold text-navy pr-3">{a}</span>
              <span className="text-gray-600 pr-3">{b}</span>
              <span><Tbl>{c}</Tbl></span>
              <span className="text-gray-600">{e}</span>
            </div>
          ))}
        </div>
        <p className="mt-in mt-3 text-[14.5px] leading-snug text-gray-500" style={d(1300)}>
          Bangunan yang dipilih dicari <b>hanya di SKPD lembar ini</b>, jenis 1.3.3, dan tak boleh barang itu sendiri. <b>Hilang karena kecurian</b> tak punya sebab — langsung <Tbl>III.B.1</Tbl>.
        </p>
      </div>
    </SlideTerang>
  )
}

// ── 8. Biaya atribusi ───────────────────────────────────────────────────────
export function Atribusi() {
  return (
    <SlideSidebar aktif="Inventarisasi/Lembar Kerja (LKI)" materi={MATERI_GEDUNG} label="Langkah 4 · Nilai perolehan" judul="Biaya atribusi / menambah kapasitas">
      <div className="absolute left-0 top-0 w-[410px] space-y-4">
        <Poin jeda={250}>Pertanyaan: apakah nilai perolehan bangunan ini <b>biaya atribusi</b> — mis. rehab atau perluasan yang <b>menambah kapasitas manfaat</b> tapi belum digabung ke induknya?</Poin>
        <Poin jeda={450}><b>Ya, induk diketahui</b> → pilih bangunan induknya → <Tbl>III.B.3</Tbl>.</Poin>
        <Poin jeda={650}><b>Ya, induk tidak diketahui</b> → <Tbl>III.B.4</Tbl>: data induknya perlu ditelusuri.</Poin>
        <Poin jeda={850}><b>Bukan</b> → aman, tidak masuk laporan.</Poin>
        <Poin jeda={1050}>Tindak lanjut: nilai bangunan ini digabung ke induk lewat menu <Tbl>Kapitalisasi</Tbl>.</Poin>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[520px]" judul="Form LKI — bagian I" jeda={300}>
        <SeksiMock kode="I" judul="Apakah nilai perolehan merupakan biaya atribusi / menambah kapasitas manfaat?" sorot besar>
          <div className="space-y-3">
            <Radio besar label={<>Ya — data awal/induknya <b>diketahui</b></>} aktif />
            <div className="ml-6 space-y-2">
              <p className="text-[12.5px] text-gray-500">Induk dicari <b>hanya di SKPD lembar ini</b> dan jenis <b>1.3.3</b>.</p>
              <Ketik besar nilai="Gedung Kantor Dinas Induk (contoh)" />
              <p className="text-[12.5px] text-teal">Induk: NIBAR… — Gedung Kantor Dinas Induk</p>
            </div>
            <Radio besar label={<>Ya — data awal/induknya <b>tidak diketahui</b></>} />
            <Radio besar label="Bukan biaya atribusi / tidak menambah kapasitas manfaat" />
          </div>
        </SeksiMock>
      </KartuApp>
      <Contoh />
    </SlideSidebar>
  )
}

// ── 9. Penggunaan (rumah negara) & tanah milik ──────────────────────────────
function Cek({ label, nilai }: { label: string; nilai?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-2 text-[13px] text-gray-700"><span className="w-4 h-4 rounded-sm border border-teal bg-teal text-white text-[11px] leading-[14px] text-center flex-shrink-0">✓</span>{label}</span>
      {nilai && <Ketik besar nilai={nilai} />}
    </div>
  )
}

const Pilihan = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-2">{children}</div>

export function PenggunaanTanahMilik() {
  return (
    <SlideTerang materi={MATERI_GEDUNG} label="Langkah 5 · Pemakai & tanahnya" judul="Dipakai siapa, berdiri di tanah siapa">
      <div className="absolute inset-x-0 top-0 grid grid-cols-[1.3fr_1fr] gap-6 items-stretch h-[440px]">
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5 flex flex-col" style={d(250)}>
          <SeksiMock kode="L" judul="Penggunaan Barang" besar>
            <Pilihan>
              <Radio besar label="Operasional / Tidak ada pihak lain" />
              <Radio besar label="Pegawai / Pengguna Barang lainnya" aktif />
            </Pilihan>
            <div className="ml-6 mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Ketik besar nilai="Nama Pemakai *" kosong /><Ketik besar nilai="Status Pemakai *" kosong />
              <Cek label="Ada BAST Pemakaian" nilai="Nomor BAST Pemakaian *" />
              <Cek label="Ada Surat Ijin Penghunian" nilai="Nomor Surat Ijin Penghunian *" />
            </div>
            <div className="mt-2.5 text-[13px] text-gray-500">Tiga pilihan lain: <Radio besar label="Pemerintah Pusat" /> · <Radio besar label="Pemda Lainnya" /> · <Radio besar label="Pihak Lain" /></div>
          </SeksiMock>
          <p className="mt-auto pt-3 text-[15.5px] leading-snug text-gray-600 border-t border-gray-100">
            Pegawai → <Tbl>III.B.5</Tbl> → <b>BAST Pengamanan</b> (bangunan disertai SIP). Pusat / Pemda lain / Pihak lain → <Tbl>III.B.6</Tbl>.
          </p>
        </div>
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5 flex flex-col" style={d(500)}>
          <SeksiMock kode="N" judul="Gedung dan Bangunan di atas tanah milik" besar>
            <Pilihan>
              <Radio besar label="Pemerintah Daerah (sendiri)" aktif /><Radio besar label="Pemerintah Pusat" />
              <Radio besar label="Pemerintah Daerah Lainnya" /><Radio besar label="Pihak Lain" />
            </Pilihan>
            <div className="mt-3"><Ketik besar nilai="Sebutkan pemilik tanah" kosong /></div>
            <p className="mt-3 text-[13.5px] text-gray-500 leading-snug">Bagian ini <b>wajib dijawab</b>; kolom pemilik muncul bila bukan Pemda.</p>
          </SeksiMock>
          <p className="mt-auto pt-3 text-[15.5px] leading-snug text-gray-600 border-t border-gray-100">
            Bukan tanah Pemda → <Tbl>III.B.10</Tbl>: status tanah diselesaikan dengan pemiliknya — <b>ditandai selesai manual</b> di Tindak Lanjut.
          </p>
        </div>
      </div>
    </SlideTerang>
  )
}

// ── 10–12. Simpan, sesudah simpan, belum tercatat ───────────────────────────
export const SimpanFoto = () => <SimpanFotoInv j={GEDUNG} />
export const SesudahSimpan = () => <SesudahSimpanInv j={GEDUNG} />
export const BelumTercatat = () => <BelumTercatatInv j={GEDUNG} />

// ── 13. Temuan → laporan → tindak lanjut ────────────────────────────────────
const TEMUAN: [string, string, string][] = [
  ['Hilang karena kecurian', 'III.B.1', 'Reklas ke Aset Hilang, lalu usulan penghapusan'],
  ['Tidak ada: force majeure / dibongkar', 'III.B.2', 'Usulan penghapusan (RKBMD Penghapusan → Penghapusan)'],
  ['Direhab / digabung / biaya atribusi', 'III.B.3 · 4', 'Kapitalisasi ke induk (B.4: telusuri data induk dulu)'],
  ['Seharusnya beberapa register', 'III.B.13', 'Koreksi → Pemecahan Barang'],
  ['Dipakai pegawai (rumah negara)', 'III.B.5', 'BAST Pengamanan ke pegawai pemakai, disertai SIP'],
  ['Dipakai pihak lain', 'III.B.6', 'Reklas ke Aset Lain-Lain (1.5.4), lalu catat Pemanfaatan'],
  ['Kondisi berubah', 'III.B.7', 'Rusak Berat → reklas, usulan penghapusan · lainnya → Koreksi'],
  ['Data berubah (luas, alamat, titik, foto…)', 'III.B.8', 'Koreksi → Spesifikasi Barang'],
  ['Tercatat ganda', 'III.B.9', 'Koreksi → Pencatatan Ganda'],
  ['Di atas tanah bukan milik Pemda', 'III.B.10', 'Selesaikan status tanah dengan pemilik — tandai manual'],
  ['Kode salah · bangunan belum tercatat', 'III.B.12 · 11', 'Reklasifikasi · Cara Perolehan → Hasil Inventarisasi'],
]
export const Temuan = () => (
  <TemuanInv j={GEDUNG} baris={TEMUAN}
    ket={<>Reklas ke <b>Aset Lain-Lain (1.5.4)</b> hanya <b>usulan</b> — kode baru berlaku saat SKPD menyimpan Reklasifikasi. Status Tindak Lanjut dibaca otomatis dari keadaan register.</>} />
)

// ── 14–15. Daftar periksa & penutup ─────────────────────────────────────────
export const DaftarPeriksa = () => (
  <DaftarPeriksaInv j={GEDUNG} kelompok={[
    { judul: 'Identitas & lokasi', butir: ['Kode & nama sesuai bangunannya', 'Luas (m²) cocok dengan kenyataan', 'Wilayah & alamat jalan dicek terpisah', 'Titik koordinat dicek di peta'] },
    { judul: 'Status bangunan', butir: ['Tidak ada → sebab dipilih & dilengkapi', 'Biaya atribusi dijawab (induk dipilih bila ya)', 'Rumah negara: nomor BAST / SIP terisi', 'Di atas tanah milik siapa (N) dijawab'] },
    { judul: 'Foto & simpan', butir: ['Foto / denah tiap bangunan disertakan', 'Tidak Sesuai → sebut yang seharusnya + foto terbaru', 'Bangunan belum tercatat → + Tambah temuan', 'Simpan Isian, lalu pantau Validasi'] },
  ]} />
)
export const Tutup = () => (
  <TutupInv j={GEDUNG} baris={[['Foto', 'tiap bangunan'], ['Sebab', 'yang jelas'], ['Pemakai', 'tercatat']]}
    penutup="Bangunan yang diperiksa satu per satu menjaga nilai buku dan penyusutannya tetap dapat dipertanggungjawabkan." />
)
