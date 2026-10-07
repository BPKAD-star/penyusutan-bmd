'use client'
// Slide yang DIPAKAI BERSAMA materi "Inventarisasi Tanah" & "Inventarisasi Gedung
// dan Bangunan". Keduanya satu alur (LKI → Validasi → LHI → Tindak Lanjut) dan
// satu form (LkiForm) yang cuma dikonfigurasi lain per jenis aset, jadi slide-nya
// ditulis SEKALI dan diberi `JenisInv` — bukan disalin dua kali.
//
// ⚠️ Label tombol/kolom/pesan DISALIN dari layarnya (components/inventarisasi/
// LembarKerjaInventarisasi.tsx, ValidasiInventarisasi.tsx, LkiForm.tsx,
// BelumTercatatForm.tsx) dan aturannya dari lib/inventarisasi.ts (`kekuranganLki`),
// lib/inventarisasiBaru.ts, lib/tindakLanjut.ts. Kalau berubah di aplikasi,
// sesuaikan di sini — tak ada test yang menjaganya.
import type { ReactNode } from 'react'
import { SlideBersih, SlideTerang, Merek, Ikon, Jendela, Poin, Catatan, Tbl, AlurLangkah, Jejak, d, type NamaIkon } from '../bagian'
import { SlideSidebar } from '../SidebarMock'
import { KartuApp, Tombol, Lencana, Th, Contoh } from '../pengadaan/bahan'
import { SeksiMock, SesuaiMock, PetaMini } from './bahan'

export type JenisInv = {
  /** Nama materi di kaki slide. */
  materi: string
  nama: string
  kode: string
  /** Format LKI, mis. 'III.A.1'. */
  format: string
  judul: string
  tagline: ReactNode
  lencana: { t: string; nada: 'wajib' | 'amber' | 'ok' }[]
  /** Barang contoh di tiruan layar. */
  contoh: { kode: string; uraian: string; nama: string }
  /** Contoh kekurangan di pop-up "Isian belum lengkap" (di luar foto). */
  kurang: string[]
  /** Isian lembar "BMD Belum Tercatat" untuk jenis ini, berurutan. */
  isianBaru: string[]
}

// ── Sampul ──────────────────────────────────────────────────────────────────
export function SampulInv({ j }: { j: JenisInv }) {
  return (
    <SlideBersih materi={j.materi} tanpaKaki>
      <Jendela className="absolute right-14 top-[130px] w-[560px]" jeda={250}>
        <div className="bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-700">Inventarisasi › Lembar Kerja (LKI)</p>
            <Tombol>Isi Inventarisasi</Tombol>
          </div>
          <div className="mt-up rounded-xl border border-teal/40 bg-white shadow-md overflow-hidden" style={d(600)}>
            <div className="px-4 py-2 bg-teal/10 text-[12.5px] font-semibold text-teal">Format {j.format} — {j.nama}</div>
            <div className="p-4 space-y-1.5 text-[12.5px]">
              <p className="text-gray-400">Kode / Uraian <span className="ml-3 text-gray-700">{j.contoh.kode} · {j.contoh.uraian}</span></p>
              <p className="text-gray-400">Nama Barang <span className="ml-3 text-gray-700">{j.contoh.nama}</span></p>
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              {j.lencana.map((l, i) => <span key={l.t} className="mt-pop" style={d(1000 + i * 200)}><Lencana nada={l.nada}>{l.t}</Lencana></span>)}
            </div>
          </div>
        </div>
      </Jendela>
      <div className="absolute left-20 top-[150px] w-[580px]">
        <p className="mt-kiri inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal/10 border border-teal/30 text-[15px] font-semibold text-teal tracking-wide">
          <span className="mt-kedip w-2 h-2 rounded-full bg-amber-400" /> Materi Paparan · Bidang Pengelolaan BMD
        </p>
        <h1 className="mt-up mt-7 text-[50px] leading-[1.08] font-bold text-navy" style={d(200)}>{j.judul}</h1>
        <div className="mt-lebar mt-5 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-5 text-[26px] leading-snug font-semibold text-navy" style={d(550)}>Lembar Kerja Inventarisasi · Format {j.format}</p>
        <p className="mt-up mt-3 text-[19px] text-gray-500 leading-relaxed" style={d(700)}>{j.tagline}</p>
        <p className="mt-in mt-8 text-[17px] text-gray-400" style={d(1000)}><Merek kelas="text-[20px]" /> – BKAD Kabupaten Kediri</p>
      </div>
    </SlideBersih>
  )
}

// ── Peta alur ───────────────────────────────────────────────────────────────
export function PetaAlurInv({ j }: { j: JenisInv }) {
  return (
    <SlideSidebar aktif="Inventarisasi/Lembar Kerja (LKI)" materi={j.materi} label="Menu · Inventarisasi" judul={`Alur inventarisasi — ${j.nama}`}>
      <div className="absolute left-0 top-0 w-[450px] space-y-4">
        <Poin jeda={250}>Menu <b>Inventarisasi</b> punya empat bagian: <b>Lembar Kerja (LKI)</b>, <b>Validasi</b>, <b>Laporan Hasil (LHI)</b>, dan <b>Tindak Lanjut</b>.</Poin>
        <Poin jeda={450}><b>SKPD</b> memeriksa tiap {j.nama.toLowerCase()} di lapangan lalu mengisi LKI — satu barang, satu lembar (Format {j.format}).</Poin>
        <Poin jeda={650}><b>Pengelola Barang</b> memeriksa dan mengesahkan isiannya di menu Validasi.</Poin>
        <Poin jeda={850}>Temuan tidak berhenti di laporan: <b>Tindak Lanjut</b> membaca keadaan barang dan menandai mana yang sudah dikerjakan.</Poin>
      </div>
      <div className="absolute right-0 top-0 w-[470px] space-y-4">
        <div className="mt-kanan rounded-2xl border border-gray-200 bg-white shadow-xl p-5" style={d(400)}>
          <p className="text-[14px] font-bold tracking-wide text-teal uppercase">Alur inventarisasi {j.nama}</p>
          <div className="mt-3"><AlurLangkah kecil langkah={['Lembar Kerja', 'Isi LKI', 'Validasi', 'LHI', 'Tindak Lanjut']} jeda={700} /></div>
        </div>
        <Catatan jeda={1200} nada="teal" ikon="lampu">
          Pemilih <b>Jenis Aset</b> ada di dalam halamannya — pilih <b>{j.kode} — {j.nama}</b>. Format LKI tiap barang mengikuti jenisnya sendiri.
        </Catatan>
        <Catatan jeda={1500} ikon="dokumen">
          Yang masuk <b>LHI</b> hanya isian yang <b>sudah divalidasi</b> — angka yang masih bisa berubah tidak ikut dilaporkan.
        </Catatan>
      </div>
    </SlideSidebar>
  )
}

// ── Penekanan (tiga kartu) ──────────────────────────────────────────────────
export type KartuTiga = { ikon: NamaIkon; judul: string; nada: string; poin: string[] }

export function PenekananInv({ j, kartu, judul = 'Yang tidak boleh terlewat' }: { j: JenisInv; kartu: KartuTiga[]; judul?: string }) {
  return (
    <SlideTerang materi={j.materi} label="Tiga penekanan" judul={judul}>
      <div className="absolute inset-0 grid grid-cols-3 gap-6">
        {kartu.map((c, i) => (
          <div key={c.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6 flex flex-col" style={d(250 + i * 220)}>
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={c.ikon} ukuran={26} /></span>
              <span className="text-[40px] font-bold text-navy/15 leading-none">{i + 1}</span>
            </div>
            <p className="mt-4 text-[26px] font-bold leading-tight text-navy">{c.judul}</p>
            <p className="mt-3 text-[17px] leading-snug text-gray-500">{c.nada}</p>
            <ul className="mt-5 space-y-3 text-[17.5px] leading-snug text-gray-700">
              {c.poin.map(p => <li key={p} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{p}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </SlideTerang>
  )
}

// ── Langkah 1: Lembar Kerja ─────────────────────────────────────────────────
const STATUS: [string, 'info' | 'amber' | 'ok', string][] = [
  ['Belum diinventarisasi', 'info', 'Isi Inventarisasi'],
  ['Menunggu validasi', 'amber', 'Ubah Isian · Hapus Isian'],
  ['Divalidasi', 'ok', 'Lihat'],
]

export function LembarKerjaInv({ j }: { j: JenisInv }) {
  return (
    <SlideSidebar aktif="Inventarisasi/Lembar Kerja (LKI)" materi={j.materi} label="Langkah 1" judul="Buka Lembar Kerja, pilih barang">
      <div className="absolute left-0 top-0 w-[370px] space-y-4">
        <Poin jeda={250}>Buka <Jejak langkah={['Inventarisasi', 'Lembar Kerja (LKI)']} />, pilih <b>Jenis Aset</b> <b>{j.kode} — {j.nama}</b>.</Poin>
        <Poin jeda={450}>Cari lewat <b>nama, NIBAR, kode</b>, atau saring dengan <b>Status</b> — mis. <b>Belum diinventarisasi</b>.</Poin>
        <Poin jeda={650}>Klik <Tbl>Isi Inventarisasi</Tbl> pada barangnya — form LKI <b>Format {j.format}</b> terbuka.</Poin>
        <Poin jeda={850}><b>Tak ada tombol &ldquo;ajukan&rdquo;</b>: begitu disimpan, isian langsung antre di menu Validasi.</Poin>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[550px]" judul={`Lembar Kerja Inventarisasi — Format ${j.format} · Tahun 2026`} jeda={300}>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-3 text-[11px]">
          <div><p className="text-gray-500 mb-1">Jenis Aset</p><div className="h-7 rounded-md border border-gray-300 px-2 flex items-center truncate">{j.kode} — {j.nama}</div></div>
          <div><p className="text-gray-500 mb-1">Cari</p><div className="h-7 rounded-md border border-gray-300 px-2 flex items-center text-gray-400 truncate">Nama barang, NIBAR, kode…</div></div>
          <Tombol gaya="sekunder">Cari</Tombol>
        </div>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <Th>Kode / Uraian Barang</Th><Th>Nama Barang</Th><Th>Status</Th><Th>Aksi</Th>
            </tr></thead>
            <tbody>
              {STATUS.map(([st, nada, aksi], i) => (
                <tr key={st} className="mt-up border-b border-gray-50 last:border-0 align-top" style={d(650 + i * 180)}>
                  <td className="px-2.5 py-2"><p className="font-medium text-gray-700">{j.contoh.kode}</p><p className="text-[10px] text-gray-400">{j.contoh.uraian}</p></td>
                  <td className="px-2.5 py-2 text-gray-700">{j.contoh.nama}</td>
                  <td className="px-2.5 py-2"><Lencana nada={nada}>{st}</Lencana></td>
                  <td className="px-2.5 py-2 text-teal font-medium leading-snug">{aksi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </KartuApp>
      <Contoh />
    </SlideSidebar>
  )
}

// ── Langkah: luas, alamat & titik koordinat ─────────────────────────────────
export function Luas({ j, luas, wilayah, catatan }: {
  j: JenisInv
  luas: { lama: string; baru: string }
  wilayah: string
  catatan: ReactNode
}) {
  return (
    <SlideTerang materi={j.materi} label="Langkah 2 · Lokasi" judul="Luas, alamat, dan titik koordinat">
      <div className="absolute left-0 top-0 w-[470px] space-y-4">
        <Poin jeda={250}><b>Luas (m²)</b>: cocokkan dengan kenyataan. Tidak Sesuai → ketik <b>luas yang seharusnya</b> (angka lebih dari 0).</Poin>
        <Poin jeda={450}><b>Wilayah</b> dipilih berjenjang sampai desa; <b>Alamat Detail</b> (jalan) diisi <b>terpisah</b> — salah satunya boleh sesuai sementara yang lain tidak.</Poin>
        <Poin jeda={650}><b>Titik Koordinat</b>: Tidak Sesuai → <b>klik titik yang benar di peta</b> atau ketik koordinatnya. Kedua angka wajib terisi.</Poin>
        <Catatan jeda={1000} nada="teal" ikon="lampu">{catatan}</Catatan>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[620px]" judul="Form LKI — bagian F, J, O" jeda={300}>
        <div className="mt-up grid grid-cols-2 gap-x-5 gap-y-3 items-start" style={d(550)}>
          <SeksiMock kode="F" judul="Luas (m²)"><SesuaiMock lama={luas.lama} pilih="tidak" seharusnya={luas.baru} /></SeksiMock>
          <SeksiMock kode="J" judul="Wilayah"><SesuaiMock lama={wilayah} pilih="sesuai" /></SeksiMock>
          <SeksiMock kode="J" judul="Alamat Detail"><SesuaiMock lama="Jl. Contoh No. 12" pilih="sesuai" /></SeksiMock>
          <SeksiMock kode="O" judul="Titik Koordinat" sorot>
            <SesuaiMock lama="-7.8123, 112.0145" pilih="tidak" />
            <div className="mt-1.5"><PetaMini pinBaru /></div>
          </SeksiMock>
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── Langkah: simpan & foto ──────────────────────────────────────────────────
export function SimpanFotoInv({ j }: { j: JenisInv }) {
  return (
    <SlideTerang materi={j.materi} label="Langkah akhir" judul="Semua dijawab, foto disertakan, baru disimpan">
      <div className="absolute left-0 top-0 w-[500px] space-y-4">
        <Poin jeda={250}>Tombol <Tbl>Simpan Isian</Tbl> menolak lembar yang belum lengkap — kekurangannya tampil sebagai <b>pop-up</b>, bukan banner di puncak.</Poin>
        <Poin jeda={450} ikon="periksa"><b>Setiap bagian</b> Sesuai / Tidak Sesuai wajib dijawab. Kosong <b>tidak lagi</b> dibaca &ldquo;Sesuai&rdquo;.</Poin>
        <Poin jeda={650}>Tidak Sesuai → wajib menyebut <b>yang seharusnya</b>; kalau tidak, laporan mencetak &ldquo;(kosong)&rdquo;.</Poin>
        <Poin jeda={850} ikon="kamera"><b>Foto wajib</b> — minimal satu per lembar, diunggah di bagian <b>R. Foto / Denah</b>.</Poin>
        <div className="mt-up grid grid-cols-3 gap-2.5" style={d(1150)}>
          {[['Sesuai', 'Foto yang sudah ada di register boleh dipakai', 'ok'], ['Tidak Sesuai', 'Wajib unggah foto TERBARU', 'amber'], ['Hilang / tak ada', 'Tak perlu foto', 'info']].map(([a, b, n]) => (
            <div key={a} className="rounded-lg border border-gray-200 bg-white shadow-sm p-2.5">
              <Lencana nada={n as 'ok' | 'amber' | 'info'}>{a}</Lencana>
              <p className="mt-1.5 text-[13px] leading-snug text-gray-600">{b}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-kanan absolute right-0 top-0 w-[560px] rounded-2xl border border-amber-300 bg-white shadow-2xl overflow-hidden" style={d(400)}>
        <div className="px-5 py-3.5 bg-amber-50 flex items-center gap-3">
          <span className="text-[26px]">📷</span>
          <div><p className="text-[17px] font-bold text-gray-800 leading-tight">Foto barang belum disertakan</p><p className="text-[12.5px] text-gray-500">Lembar belum bisa disimpan.</p></div>
        </div>
        <div className="px-5 py-4 text-[13px] text-gray-700 space-y-2">
          <p>Sertakan <b>minimal satu foto</b> barang di bagian <b>R. Foto / Denah</b> sebelum menyimpan.</p>
          <p>Isian lain yang juga masih kurang:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {j.kurang.map(x => <li key={x}>{x}</li>)}
            <li>Foto barang (R) — sertakan minimal satu foto</li>
          </ul>
        </div>
        <div className="px-5 pb-4 flex justify-end"><Tombol>Mengerti</Tombol></div>
      </div>
      <Contoh />
    </SlideTerang>
  )
}

// ── Sesudah disimpan ────────────────────────────────────────────────────────
const SESUDAH: { ikon: NamaIkon; judul: string; isi: string[] }[] = [
  { ikon: 'ulang', judul: 'Dikembalikan', isi: ['Pengelola Barang menolak atau membatalkan validasi dengan catatan.', 'Catatannya tampil merah di Lembar Kerja: ↩ Dikembalikan.', 'Perbaiki lewat Ubah Isian, simpan lagi.'] },
  { ikon: 'pensil', judul: 'Salah isi', isi: ['Selama belum divalidasi: Ubah Isian atau Hapus Isian.', 'Hapus Isian → barang kembali Belum diinventarisasi.', 'Sudah divalidasi: minta Pengelola Barang membatalkan validasinya.'] },
  { ikon: 'gembok', judul: 'Posisi berubah', isi: ['Barang pindah SKPD atau direklas ke jenis lain → isian lama terkunci 🔒.', 'SKPD yang kini memegang wajib menginventarisasi ulang.', 'Daftarnya ada di Validasi → Posisi berubah.'] },
]

export function SesudahSimpanInv({ j }: { j: JenisInv }) {
  return (
    <SlideTerang materi={j.materi} label="Sesudah disimpan" judul="Validasi oleh Pengelola Barang">
      <div className="absolute inset-x-0 top-0">
        <div className="mt-up rounded-xl bg-navy text-white p-5" style={d(250)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-amber-300">Perjalanan satu isian</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            {['Simpan Isian', 'Menunggu validasi', 'Divalidasi (Pengelola Barang)', 'Masuk LHI', 'Tindak Lanjut'].map((x, i) => (
              <span key={x} className="inline-flex items-center gap-2">{i > 0 && <span className="text-amber-300">›</span>}<span className="px-3 py-1.5 rounded-lg bg-white/[0.12]">{x}</span></span>
            ))}
          </div>
          <p className="mt-3 text-[14.5px] text-white/70">Di menu Validasi, tab: <b className="text-white">Menunggu validasi · Divalidasi · Posisi berubah · Semua</b>. Pengelola bisa mengesahkan satu per satu atau centang massal.</p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-5 items-start">
          {SESUDAH.map((k, i) => (
            <div key={k.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-5" style={d(600 + i * 200)}>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-teal text-white flex items-center justify-center"><Ikon nama={k.ikon} ukuran={22} /></span>
                <p className="text-[21px] font-bold text-navy leading-tight">{k.judul}</p>
              </div>
              <ul className="mt-3.5 space-y-2.5 text-[15.5px] leading-snug text-gray-700">
                {k.isi.map(x => <li key={x} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </SlideTerang>
  )
}

// ── BMD belum tercatat (Format III.A.7) ─────────────────────────────────────
export function BelumTercatatInv({ j }: { j: JenisInv }) {
  return (
    <SlideSidebar aktif="Inventarisasi/Lembar Kerja (LKI)" materi={j.materi} label="Kalau barangnya belum ada di register" judul="BMD belum tercatat — Format III.A.7">
      <div className="absolute left-0 top-0 w-[400px] space-y-3.5">
        <Poin jeda={250}>Di Lembar Kerja, panel <b>BMD Belum Tercatat</b> → <Tbl>+ Tambah temuan</Tbl>, pilih jenis <b>{j.kode}</b>.</Poin>
        <Poin jeda={450}><b>Semua isian wajib</b> — termasuk <b>Tanggal Perolehan</b> (dasar penyusutan) dan <b>Nilai per item</b>.</Poin>
        <Poin jeda={650}>Kuantitas lebih dari 1 dicatat <b>satu barang per unit</b> saat didaftarkan.</Poin>
        <Poin jeda={850}>Belum menyentuh register. Temuannya jadi <b>III.B.11</b>; tindak lanjutnya <b>Cara Perolehan › Hasil Inventarisasi</b> — drafnya terisi dari lembar ini, <b>foto diunggah ulang</b> di kartu itu.</Poin>
      </div>
      <KartuApp className="absolute right-0 top-0 w-[520px]" judul={`BMD Belum Tercatat — ${j.nama}`} jeda={300}>
        <p className="text-[11.5px] text-gray-500 mb-2.5">Urutan isian pada form:</p>
        <ol className="columns-2 gap-x-5">
          {['Kode Barang', 'Satuan Barang', 'Kuantitas', 'Nilai per item', 'Tanggal Perolehan', ...j.isianBaru, 'Catatan Inventarisasi', 'Foto / Denah'].map((t, i) => (
            <li key={t} className="mt-kiri mb-2 break-inside-avoid flex items-center gap-2 text-[12px] text-gray-700" style={d(550 + i * 55)}>
              <span className="w-5 h-5 rounded-full bg-navy/10 text-navy text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span className="font-medium leading-tight">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-gray-400">Tanggal Perolehan tidak boleh di masa depan.</p>
      </KartuApp>
      <Contoh />
    </SlideSidebar>
  )
}

// ── Temuan → LHI → tindak lanjut ────────────────────────────────────────────
export function TemuanInv({ j, baris, ket }: { j: JenisInv; baris: [string, string, string][]; ket?: ReactNode }) {
  return (
    <SlideTerang materi={j.materi} label="Setelah divalidasi" judul="Temuan → laporan → tindak lanjut">
      <div className="absolute inset-x-0 top-0">
        <div className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden" style={d(250)}>
          <div className="grid grid-cols-[340px_150px_1fr] bg-navy text-white text-[13.5px] font-semibold tracking-wide uppercase px-5 py-2.5">
            <span>Temuan di LKI</span><span>Laporan (LHI)</span><span>Tindak lanjut</span>
          </div>
          {baris.map(([a, b, c], i) => (
            <div key={a} className={`mt-in grid grid-cols-[340px_150px_1fr] items-center px-5 py-[5px] text-[15px] leading-snug ${i % 2 ? 'bg-gray-50' : ''}`} style={d(450 + i * 80)}>
              <span className="font-semibold text-navy pr-3">{a}</span>
              <span><Tbl>{b}</Tbl></span>
              <span className="text-gray-600">{c}</span>
            </div>
          ))}
        </div>
        {ket && <p className="mt-in mt-3 text-[14.5px] leading-snug text-gray-500" style={d(450 + baris.length * 80)}>{ket}</p>}
      </div>
    </SlideTerang>
  )
}

// ── Daftar periksa & penutup ────────────────────────────────────────────────
export function DaftarPeriksaInv({ j, kelompok }: { j: JenisInv; kelompok: { judul: string; butir: string[] }[] }) {
  return (
    <SlideTerang materi={j.materi} label="Ringkasan" judul="Daftar periksa sebelum menyimpan lembar">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-6 items-start">
        {kelompok.map((c, i) => (
          <div key={c.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6" style={d(250 + i * 220)}>
            <p className="text-[22px] font-bold text-navy">{c.judul}</p>
            <ul className="mt-5 space-y-4">
              {c.butir.map((b, k) => (
                <li key={b} className="mt-kiri flex items-start gap-3 text-[17.5px] leading-snug text-gray-700" style={d(550 + i * 220 + k * 120)}>
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

export function TutupInv({ j, baris, penutup }: { j: JenisInv; baris: [string, string][]; penutup: string }) {
  return (
    <SlideBersih materi={j.materi} tanpaKaki>
      <div className="absolute left-20 top-1/2 -translate-y-1/2 w-[920px]">
        <h2 className="mt-up text-[72px] font-bold leading-none text-navy" style={d(200)}>Terima kasih</h2>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-7 text-[28px] leading-snug font-semibold text-navy" style={d(600)}>
          {baris.map(([a, b], i) => <span key={a}>{i > 0 && <span className="text-amber-500 mx-2">·</span>}<span className="text-teal">{a}</span> {b}</span>)}
        </p>
        <p className="mt-in mt-5 text-[20px] text-gray-500" style={d(900)}>{penutup}</p>
      </div>
    </SlideBersih>
  )
}
