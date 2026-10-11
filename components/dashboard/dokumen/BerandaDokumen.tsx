'use client'
// Halaman muka Dokumen Sumber: empat bagian — Peraturan · Siklus · Materi · Event
// (tiga pertama permintaan user 2026-09-30; Event 2026-10-11). Murni tampilan: seluruh state & pemuatan ada di
// components/dashboard/DokumenSumber.tsx, berkas ini hanya menggambar kotaknya.
import Link from 'next/link'
import { DAFTAR_SIKLUS, DAFTAR_PERATURAN, type SiklusConfig, type PeraturanConfig } from '@/lib/dokumenSiklus'
import { DAFTAR_MATERI } from '@/lib/materi'
import EventSection from './EventSection'

export default function BerandaDokumen({ isAdmin, tahunList, tahunMap, tahun, onTahun, jumlahPeraturan, onPeraturan, onSiklus }: {
  /** Hanya admin yang melihat tombol tambah/ubah/hapus di bagian Event (RLS penegaknya). */
  isAdmin: boolean
  tahunList: number[]
  tahunMap: Record<number, string>
  tahun: number | null
  onTahun: (t: number) => void
  /** `null` = tak terhitung → angkanya tidak ditampilkan. */
  jumlahPeraturan: Record<string, number> | null
  onPeraturan: (p: PeraturanConfig) => void
  onSiklus: (s: SiklusConfig) => void
}) {
  return (
    <div className="space-y-8">
      {/* 1. PERATURAN — sengaja paling atas & TANPA pemilih tahun: peraturan
          berlaku lintas tahun, yang ber-tahun cuma arsip per siklus. */}
      <Bagian nomor={1} judul="Peraturan" ket="Dasar hukum pengelolaan BMD — berlaku lintas tahun.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {DAFTAR_PERATURAN.map(p => (
            <button key={p.key} onClick={() => onPeraturan(p)}
              className="card p-4 text-left hover:border-teal border border-transparent transition-colors">
              <p className="font-semibold text-gray-800 text-sm">{p.label}</p>
              <p className="text-xs text-gray-400 mt-1">{p.panjang}</p>
              {jumlahPeraturan && (
                <p className="text-[11px] text-teal mt-2 font-medium">{jumlahPeraturan[p.key] ?? 0} dokumen</p>
              )}
            </button>
          ))}
        </div>
      </Bagian>

      <Bagian nomor={2} judul="Siklus" ket="Arsip dokumen legal (SK, BAST, perjanjian) per tahun & siklus pengelolaan BMD."
        kanan={tahunList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tahunList.map(t => (
              <button key={t} onClick={() => onTahun(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  t === tahun ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:border-teal'
                }`}>
                {t} {tahunMap[t] === 'terkunci' && <span className="ml-1 opacity-70" title="Tahun terkunci">🔒</span>}
              </button>
            ))}
          </div>
        )}>
        {tahunList.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">Belum ada tahun buku terdaftar.</div>
        ) : tahun === null ? (
          <div className="card p-8 text-center text-gray-400 text-sm">Memuat...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {DAFTAR_SIKLUS.map(s => (
              <button key={s.key} onClick={() => onSiklus(s)}
                className="card p-4 text-left hover:border-teal border border-transparent transition-colors">
                <p className="font-semibold text-gray-800 text-sm">{s.label}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{s.sumber.map(x => x.label).join(' · ')}</p>
              </button>
            ))}
          </div>
        )}
      </Bagian>

      <Bagian nomor={3} judul="Materi" ket="Materi paparan Bidang Pengelolaan BMD — dibuka sebagai presentasi, bisa di-Export PDF.">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DAFTAR_MATERI.map(m => (
            <Link key={m.slug} href={`/materi/${m.slug}`}
              className="card p-4 text-left hover:border-teal border border-transparent transition-colors flex flex-col">
              <p className="font-semibold text-gray-800 text-sm">{m.judul}</p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-3">{m.ringkas}</p>
              <p className="text-[11px] text-teal mt-3 font-medium">▶ Buka paparan · {m.jumlahSlide} slide</p>
            </Link>
          ))}
        </div>
      </Bagian>

      {/* 4. EVENT — arsip event Bidang Pengelolaan BMD: materi + tautan dokumentasi (Drive).
          Tak ikut pemilih tahun Siklus: punya penyaring tahunnya sendiri. */}
      <Bagian nomor={4} judul="Event" ket="Event yang diselenggarakan Bidang Pengelolaan BMD — materi dan tautan dokumentasinya.">
        <EventSection isAdmin={isAdmin} />
      </Bagian>
    </div>
  )
}

// Kepala satu bagian halaman (Peraturan · Siklus · Materi · Event). `kanan` = kendali
// yang hanya milik bagian itu (pemilih tahun cuma berlaku untuk Siklus).
function Bagian({ nomor, judul, ket, kanan, children }: {
  nomor: number; judul: string; ket: string; kanan?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-navy text-white text-xs font-bold flex items-center justify-center">{nomor}</span>
          <div>
            <h2 className="font-semibold text-gray-900">{judul}</h2>
            <p className="text-xs text-gray-400">{ket}</p>
          </div>
        </div>
        {kanan}
      </div>
      {children}
    </section>
  )
}
