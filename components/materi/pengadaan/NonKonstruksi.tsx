'use client'
// Materi "Entry Belanja Modal · Pengadaan" — jalur NON KONSTRUKSI: kontrak,
// BAST, tambah barang, draft, foto, pratinjau & persetujuan. Mock layarnya
// meniru components/pengelolaan/Pengadaan.tsx (label disalin dari sana).
import { SlideTerang, Poin, Catatan, Tbl, Ikon, d } from '../bagian'
import { MATERI, KartuApp, Isian, Tombol, Lencana, Th, FotoMini, Panah, Tunjuk, Contoh } from './bahan'

const KIRI = 'absolute left-0 top-0 w-[440px] space-y-4'
const KANAN = 'absolute right-0 top-0 w-[660px]'

// ── 1. Kontrak ──────────────────────────────────────────────────────────────
export function Kontrak() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi" judul="1. Buat Kontrak">
      <div className={KIRI}>
        <Poin jeda={250}>Tekan <Tbl>+ Tambah Pengadaan</Tbl>, lalu isi dua kartu: <b>Kontrak</b> dan <b>BAST</b>.</Poin>
        <Poin jeda={450}><b>Sumber Pengadaan</b> mengikuti nilai belanja: Bukti Pembelian → Kwitansi → Surat Pesanan / SPK → Surat Perjanjian.</Poin>
        <Poin jeda={650}><b>No. Kontrak tidak boleh sama</b> dengan kontrak lain di SKPD yang sama.</Poin>
        <Poin jeda={850}>Program / Kegiatan / Sub Kegiatan dipilih <b>berjenjang</b>; Nama PPK dipilih dari daftar pegawai.</Poin>
      </div>
      <KartuApp className={KANAN} judul="Kartu 1 — Kontrak" jeda={300}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Isian label="Sumber Pengadaan" nilai="Surat Perintah Kerja (SPK)" />
          <Isian label="No. Kontrak" nilai="027/123/418.xx/2026" />
          <Isian label="Tgl Kontrak" nilai="03 Agustus 2026" />
          <Isian label="Nama Penyedia" nilai="CV Maju Jaya" />
          <Isian className="col-span-2" label="Program / Kegiatan / Sub Kegiatan" nilai="Program › Kegiatan › Sub Kegiatan (dipilih berjenjang)" />
          <Isian label="Nama PPK (Pejabat Pembuat Komitmen)" nilai="ketik untuk mencari pegawai..." kosong />
          <Isian label="Keterangan Kontrak" nilai="Pengadaan peralatan kantor" />
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 2. BAST ─────────────────────────────────────────────────────────────────
export function Bast() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi" judul="2. Isi dan Upload BAST">
      <div className={KIRI}>
        <Poin jeda={250}><b>Tanpa dokumen BAST, kontrak tidak bisa disimpan</b> — dan kartu tidak bisa disetujui.</Poin>
        <Poin jeda={450}><b>Tgl BAST = tanggal perolehan barang</b>: bukan tanggal kontrak, bukan tanggal disetujui.</Poin>
        <Poin jeda={650}>Tgl BAST <b>tidak boleh lebih tua</b> dari tgl kontrak, dan tahunnya harus <b>belum ditutup</b>.</Poin>
        <Poin jeda={850}>No. BAST juga <b>tidak boleh kembar</b>. Unggah scan yang <b>lengkap dan terbaca</b>.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="dokumen">Berkas boleh <b>foto atau PDF</b> (JPG / PNG / WebP / PDF), lebih dari satu.</Catatan>
      </div>
      <KartuApp className={KANAN} judul="Kartu 2 — Berita Acara Serah Terima (BAST)" jeda={300}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Isian label="No. BAST" nilai="BAST/045/2026" />
          <Isian label={<>Tgl BAST <span className="text-gray-400">(= tgl perolehan efektif)</span></>} nilai="14 Agustus 2026" />
          <Isian className="col-span-2" label="Keterangan BAST" nilai="Penyerahan barang dalam keadaan baik" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
            <p className="text-[11.5px] text-gray-500">Dokumen BAST <span className="text-red-500">*</span> <span className="text-gray-400">— wajib</span></p>
            <div className="relative mt-2 inline-block"><Tombol gaya="kuning">📎 Upload Dokumen BAST</Tombol><Tunjuk className="-right-1 -top-1" /></div>
            <p className="mt-2 text-[11.5px] text-amber-700 leading-snug">Belum ada dokumen — wajib diunggah sebelum kontrak bisa disimpan.</p>
            <p className="mt-2"><Lencana nada="wajib">TIDAK BISA DISIMPAN</Lencana></p>
          </div>
          <div className="rounded-lg border border-teal/40 bg-teal/5 p-3">
            <p className="text-[11.5px] text-gray-500">Dokumen BAST <span className="text-red-500">*</span></p>
            <div className="mt-2"><Tombol gaya="kuning">📎 Upload Dokumen BAST</Tombol></div>
            <ul className="mt-2 space-y-1 text-[12px] text-gray-600">
              <li className="flex items-center gap-2"><Ikon nama="dokumen" ukuran={14} className="text-teal" /> BAST-045-2026.pdf <span className="text-red-500">×</span></li>
              <li className="flex items-center gap-2"><Ikon nama="dokumen" ukuran={14} className="text-teal" /> lampiran-BAST.jpg <span className="text-red-500">×</span></li>
            </ul>
            <p className="mt-2"><Lencana nada="ok">SIAP DISIMPAN</Lencana></p>
          </div>
        </div>
        <div className="mt-4 flex justify-end"><Tombol>Simpan Kontrak</Tombol></div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 3. Tambah barang ────────────────────────────────────────────────────────
export function TambahBarang() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi" judul="3. Tambah Barang">
      <div className={KIRI}>
        <Poin jeda={250}>Di kartu <b>Menunggu Persetujuan</b>, tekan <Tbl>+ Tambah Barang</Tbl>.</Poin>
        <Poin jeda={450}>Urutannya: <b>kode rekening belanja</b> → <b>Jenis BMD</b> → <b>Cari</b> kode → pilih dari hasil.</Poin>
        <Poin jeda={650}>Baca panel hasilnya — <b>Uraian Barang, Masa Manfaat, Nilai Kapitalisasi</b> — sebelum mengisi satuan, kuantitas, harga.</Poin>
        <Poin jeda={850}>Kuantitas &gt; 1 <b>langsung dipecah per unit</b>; spesifikasi &amp; foto diisi per unit.</Poin>
        <Catatan jeda={1150} nada="amber" ikon="lampu">Semua kolom bertanda <span className="text-red-500 font-bold">*</span> wajib. Yang kurang ditulis di baris amber — <b>tombolnya tidak dimatikan</b>.</Catatan>
      </div>
      <KartuApp className={KANAN} judul="+ Tambah Barang" jeda={300}>
        <div className="space-y-3">
          <Isian label="Kode Rekening Belanja (cari & pilih sampai Sub Rincian Objek)" nilai="5.2.02.10.002.00003" wajib />
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Isian label="Jenis BMD" nilai="1.3.2 — Peralatan dan Mesin" wajib />
            <Isian label="Cari kode / nama baku" nilai="lap top" />
            <Tombol gaya="sekunder">Cari</Tombol>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 grid grid-cols-[130px_1fr] gap-y-1 text-[12px]">
            <span className="text-gray-500">Kode</span><span className="font-medium text-gray-700">1.3.2.10.01.02.002</span>
            <span className="text-gray-500">Objek</span><span className="font-medium text-gray-700">KOMPUTER</span>
            <span className="text-gray-500">Rincian Objek</span><span className="font-medium text-gray-700">KOMPUTER UNIT</span>
            <span className="text-gray-500">Sub Rincian Objek</span><span className="font-medium text-gray-700">PERSONAL KOMPUTER</span>
            <span className="text-gray-500">Uraian Barang</span><span className="font-medium text-gray-700">Lap Top</span>
            <span className="text-gray-500">Masa Manfaat</span><span className="font-bold text-teal">4 tahun</span>
            <span className="text-gray-500">Nilai Kapitalisasi</span><span className="font-medium text-gray-700">Rp1.500.000,00</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Isian label="Satuan" nilai="Unit" wajib />
            <Isian label="Kuantitas" nilai="3" wajib />
            <Isian label="Harga / item" nilai="Rp 12.500.000" wajib />
          </div>
          <div className="flex items-center justify-between"><p className="text-[11.5px] text-gray-400">3 unit → 3 barang draft terpisah</p><Tombol>Tambah ke Draft</Tombol></div>
        </div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 4. Draft & Edit Spesifikasi ─────────────────────────────────────────────
const BARIS: [string, string, boolean][] = [
  ['Lap Top', 'Unit', true], ['Lap Top', 'Unit', true], ['Lap Top', 'Unit', false],
]

export function Draft() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi" judul="4. Edit Spesifikasi Data Barang">
      <div className={KIRI}>
        <Poin jeda={250}>Tiap unit jadi <b>satu baris draft</b>. Centang barang, lalu tekan <Tbl>✎ Edit Spesifikasi</Tbl>.</Poin>
        <Poin jeda={450}><b>Spesifikasi Nama Barang wajib diisi</b> — itu nama yang tampil di Daftar Barang, bukan sekadar uraian baku.</Poin>
        <Poin jeda={650}>Barang <b>beda jenis aset</b> tidak bisa diedit bersamaan; kolomnya berbeda.</Poin>
        <Poin jeda={850}>Kotak <b>Cari</b> membantu menemukan barang di kontrak yang berisi puluhan baris.</Poin>
        <Catatan jeda={1150} nada="teal" ikon="kamera">Kolom <b>Foto</b> menunjukkan barang mana yang belum difoto — kotak amber putus-putus.</Catatan>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={300} aksen="amber" judul={<span className="text-amber-700">⏳ Menunggu Persetujuan — Kontrak 027/123/418.xx/2026</span>}>
          <div className="h-8 rounded-md border border-gray-300 bg-white px-3 flex items-center text-[12px] text-gray-400 mb-3">Cari kode rekening, uraian, nama barang, merek/tipe, harga...</div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>
                <Th tengah>☐</Th><Th>Kode Barang</Th><Th>Spesifikasi Nama Barang</Th><Th>Kode Rekening</Th><Th tengah>Foto</Th><Th tengah>Komptabel</Th>
              </tr></thead>
              <tbody>
                {BARIS.map(([n, , foto], i) => (
                  <tr key={i} className="mt-up border-b border-gray-50 last:border-0" style={d(700 + i * 150)}>
                    <td className="px-2.5 py-2 text-center">{i < 2 ? '☑' : '☐'}</td>
                    <td className="px-2.5 py-2"><p className="font-medium text-gray-700">1.3.2.10.01.02.002</p><p className="text-[10.5px] text-gray-400">{n}</p></td>
                    <td className="px-2.5 py-2 text-gray-700">{i < 2 ? 'Laptop ASUS Vivobook 14' : n}</td>
                    <td className="px-2.5 py-2 text-gray-600">5.2.02.10.002.00003</td>
                    <td className="px-2.5 py-2 text-center"><FotoMini kosong={!foto} /></td>
                    <td className="px-2.5 py-2 text-center text-gray-600">Intra</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-teal/10 px-3 py-2 text-[12px] text-teal font-semibold">
            2 dipilih <Panah /> <Tombol gaya="utama">✎ Edit Spesifikasi</Tombol> <Tombol gaya="sekunder">🗑 Hapus</Tombol>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Tombol>+ Tambah Barang</Tombol><Tombol gaya="sekunder">🔍 Pratinjau</Tombol><Tombol>✓ Setujui</Tombol>
          </div>
        </KartuApp>
      </div>
      <Contoh />
    </SlideTerang>
  )
}

// ── 5. Foto wajib ───────────────────────────────────────────────────────────
export function Foto() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi · Catatan" judul="Foto barang — wajib sebelum disetujui">
      <div className="absolute left-0 top-0 w-[440px] space-y-3.5">
        <Poin jeda={250} ikon="kamera"><b>Setiap barang punya foto sendiri</b> — dicek per unit, bukan per kontrak.</Poin>
        <Poin jeda={450} ikon="kamera">Foto harus <b>menunjukkan barangnya</b>: bentuk, merek, dan nomor seri / rangka yang terbaca.</Poin>
        <Poin jeda={650} ikon="kamera">Centang <b>beberapa unit sejenis</b> lalu unggah — foto <b>ditambahkan</b> ke semuanya, tidak menimpa.</Poin>
        <div className="mt-up rounded-xl border border-red-200 bg-white shadow-lg p-4" style={d(950)}>
          <p className="text-[14px] font-bold text-red-700">⚠ Belum bisa disetujui</p>
          <p className="mt-1 text-[13.5px] leading-snug text-gray-600">Barang &ldquo;Lap Top&rdquo; belum ada foto — lengkapi dulu (✎ Edit Spesifikasi) sebelum kontrak ini disetujui.</p>
        </div>
      </div>
      <KartuApp className={KANAN} judul="Edit Spesifikasi — Lap Top" jeda={300}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Isian className="col-span-2" label="Spesifikasi Nama Barang" nilai="Laptop ASUS Vivobook 14" wajib />
          <Isian label="Merek / Tipe" nilai="ASUS X1404" />
          <Isian label="Kondisi Barang" nilai="Baik" />
          <Isian className="col-span-2" label="Spesifikasi Lainnya" nilai="Core i5 · RAM 16 GB · SSD 512 GB · S/N ABC123456" />
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[11.5px] text-gray-500 mb-2">Foto Barang (maks 10MB/foto) <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1].map(i => (
              <div key={i} className="mt-pop relative" style={d(700 + i * 200)}>
                <div className="h-[84px] rounded border border-gray-200 bg-gradient-to-br from-blue-100 to-teal/30 flex items-center justify-center text-teal"><Ikon nama="kamera" ukuran={30} /></div>
                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[12px] leading-5 text-center">×</span>
              </div>
            ))}
            <div className="mt-pop h-[84px] rounded border-2 border-dashed border-amber-400 bg-amber-50 flex flex-col items-center justify-center text-amber-700 text-[11.5px] font-semibold" style={d(1100)}>
              <span className="text-[22px] leading-none">+</span>Unggah foto
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-gray-400">Pilih berkas gambar (JPG / PNG / WebP). Boleh lebih dari satu.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Tombol gaya="sekunder">Batal</Tombol><Tombol>Simpan</Tombol></div>
      </KartuApp>
      <Contoh />
    </SlideTerang>
  )
}

// ── 6. Pratinjau & Setujui ──────────────────────────────────────────────────
const KOLOM_PRATINJAU = ['Spesifikasi Nama Barang', 'Merek / Tipe', 'No. Polisi', 'Kondisi', 'Foto']
const ISI_PRATINJAU: (string | null)[][] = [
  ['Laptop ASUS Vivobook 14', 'ASUS X1404', 'n/a', 'Baik', '1 foto'],
  ['Laptop ASUS Vivobook 14', 'ASUS X1404', 'n/a', null, '1 foto'],
  ['Lap Top', null, 'n/a', null, null],
]

export function Setujui() {
  return (
    <SlideTerang materi={MATERI} label="Non Konstruksi · Catatan" judul="Pratinjau, lalu disetujui">
      <div className={KIRI}>
        <Poin jeda={250}><Tbl>🔍 Pratinjau</Tbl> menampilkan <b>seluruh isian</b> tiap barang; yang <b>kosong ditandai amber</b>.</Poin>
        <Poin jeda={450}>Pratinjau bisa dibuka <b>operator SKPD</b> — periksa dulu sebelum menunggu admin.</Poin>
        <Poin jeda={650}>Persetujuan oleh <b>admin / pengurus barang atasan</b> — bukan oleh pembuat kartunya sendiri.</Poin>
        <Poin jeda={850}>Yang <b>disetujui terkunci</b>. Salah catat → <b>Buka Kunci</b>, perbaiki, setujui ulang.</Poin>
      </div>
      <div className={KANAN}>
        <KartuApp jeda={300} judul="Pratinjau kelengkapan — 1.3.2 Peralatan dan Mesin">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>{KOLOM_PRATINJAU.map(k => <Th key={k}>{k}</Th>)}</tr></thead>
              <tbody>
                {ISI_PRATINJAU.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className={`px-2.5 py-2 ${c == null ? 'bg-amber-100 text-amber-800 font-semibold' : 'text-gray-700'}`}>{c ?? 'kosong'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-amber-700">⚠ 4 kolom belum terisi — peringatan, bukan larangan; sebagian memang tak berlaku.</p>
        </KartuApp>
        <div className="mt-up mt-4 rounded-xl bg-navy text-white p-5" style={d(900)}>
          <p className="text-[13px] font-semibold tracking-[0.15em] uppercase text-amber-300">Saat disetujui</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            {['NIBAR & kode register terbit', 'Tgl perolehan = tgl BAST', 'Muncul di Daftar Barang', 'Mulai disusutkan', 'Kartu terkunci'].map((x, i) => (
              <span key={x} className="inline-flex items-center gap-2">{i > 0 && <span className="text-amber-300">›</span>}<span className="px-2.5 py-1.5 rounded-lg bg-white/[0.12]">{x}</span></span>
            ))}
          </div>
        </div>
      </div>
      <Contoh />
    </SlideTerang>
  )
}
