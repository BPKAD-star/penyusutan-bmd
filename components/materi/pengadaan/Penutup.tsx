'use client'
// Materi "Entry Belanja Modal · Pengadaan" — slide penutup: kalau terlanjur
// salah, daftar periksa, dan salam penutup.
import { SlideTerang, SlideBersih, Ikon, Tbl, d } from '../bagian'
import { MATERI } from './bahan'

export function TerlanjurSalah() {
  const kolom = [
    { judul: 'Masih draft', ikon: 'pensil' as const, isi: [
      'Ubah kontrak & BAST lewat ✎ Edit Kontrak & BAST.',
      'Ubah nama, foto, atau spesifikasi lewat ✎ Edit Spesifikasi.',
      'Barang keliru: centang lalu 🗑 Hapus, atau hapus draft kontrak.',
    ] },
    { judul: 'Sudah disetujui', ikon: 'gembok' as const, isi: [
      'Kartu terkunci. Minta admin 🔓 Buka Kunci, perbaiki, lalu setujui ulang.',
      'NIBAR digenerate ulang; barang lama tersimpan sebagai arsip.',
      'Buka Kunci ditolak bila barang sudah punya transaksi lebih baru.',
    ] },
    { judul: 'Barang sudah bergerak', ikon: 'ulang' as const, isi: [
      'Kode barang keliru → Reklasifikasi › Kesalahan Kodefikasi (dengan dokumen usulan).',
      'Nama, merek, atau foto kurang → Koreksi › Spesifikasi Barang.',
      'Nilai keliru → Koreksi › Nilai Perolehan.',
    ] },
  ]
  return (
    <SlideTerang materi={MATERI} label="Kalau terlanjur" judul="Salah entri — jalan perbaikannya">
      <div className="absolute inset-x-0 top-0 grid grid-cols-3 gap-6 items-start">
        {kolom.map((k, i) => (
          <div key={k.judul} className="mt-up rounded-2xl border border-gray-200 bg-white shadow-lg p-6" style={d(250 + i * 220)}>
            <span className="w-12 h-12 rounded-xl bg-teal text-white flex items-center justify-center"><Ikon nama={k.ikon} ukuran={26} /></span>
            <p className="mt-4 text-[24px] font-bold text-navy leading-tight">{k.judul}</p>
            <ul className="mt-5 space-y-4 text-[18px] leading-snug text-gray-700">
              {k.isi.map(x => <li key={x} className="flex items-start gap-2.5"><span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-in absolute left-0 right-0 bottom-0 text-center text-[16px] text-gray-500" style={d(1200)}>
        Semakin awal ketahuan, semakin murah perbaikannya — <b className="text-navy">teliti sebelum <Tbl>Setujui</Tbl></b>.
      </p>
    </SlideTerang>
  )
}

const CEK: { judul: string; butir: string[] }[] = [
  { judul: 'Kontrak & BAST', butir: [
    'Bentuk kontrak sesuai nilai belanja', 'No. Kontrak & No. BAST belum dipakai', 'Tgl BAST benar — itu tanggal perolehan',
    'Dokumen BAST terunggah (konstruksi: tiap termin)',
  ] },
  { judul: 'Kode barang', butir: [
    'Kode sesuai jenis barangnya, bukan sekadar nama mirip', 'Masa Manfaat bukan 0 / - (kecuali Tanah, ATL, KDP)',
    'Kode rekening sejalan dengan jenis aset', 'KDP: kode sesuai hasil akhir pekerjaan',
  ] },
  { judul: 'Barang & foto', butir: [
    'Spesifikasi Nama Barang terisi (konstruksi: tidak kembar)', 'Foto tiap unit — nomor seri / rangka terbaca',
    '🔍 Pratinjau: kolom penting tidak amber', 'Baru setelah itu ajukan untuk disetujui',
  ] },
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

export function TutupPengadaan() {
  return (
    <SlideBersih materi={MATERI} tanpaKaki>
      <div className="absolute left-20 top-1/2 -translate-y-1/2 w-[900px]">
        <h2 className="mt-up text-[72px] font-bold leading-none text-navy" style={d(200)}>Terima kasih</h2>
        <div className="mt-lebar mt-6 w-28 h-1.5 rounded-full bg-amber-400" style={d(450)} />
        <p className="mt-up mt-7 text-[28px] leading-snug font-semibold text-navy" style={d(600)}>
          <span className="text-teal">BAST</span> lengkap <span className="text-amber-500 mx-2">·</span>
          <span className="text-teal">Foto</span> tiap barang <span className="text-amber-500 mx-2">·</span>
          <span className="text-teal">Kode</span> yang teliti
        </p>
        <p className="mt-in mt-5 text-[20px] text-gray-500" style={d(900)}>Entry yang benar sejak awal adalah dasar laporan BMD yang dapat dipertanggungjawabkan.</p>
      </div>
    </SlideBersih>
  )
}
