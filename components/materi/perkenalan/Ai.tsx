'use client'
// Materi "Perkenalan Aplikasi SMART Asset" — slide 5: era AI + tampilan chatbot.
// Percakapan di gambar adalah ILUSTRASI bentuk tampilan (tanpa angka sungguhan),
// bukan hasil tanya-jawab nyata.
import { SlideTerang, Ikon, Poin, d } from '../bagian'
import { MATERI } from './Pembuka'

function PanelChat() {
  return (
    <div className="mt-kanan absolute right-0 top-0 w-[470px]" style={d(350)}>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-navy text-white flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center"><Ikon nama="obrolan" ukuran={20} /></span>
          <div>
            <p className="text-[17px] font-bold leading-tight">Asisten AI</p>
            <p className="text-[12px] text-white/60">Tanya apa saja tentang data & aplikasi</p>
          </div>
        </div>
        <div className="p-4 space-y-3 h-[300px] bg-white">
          <div className="mt-up flex justify-end" style={d(800)}>
            <div className="max-w-[78%] rounded-lg px-3.5 py-2.5 text-[15px] bg-teal text-white">Ada berapa laptop di BKAD?</div>
          </div>
          <div className="mt-up flex" style={d(1500)}>
            <div className="max-w-[86%] rounded-lg px-3.5 py-2.5 text-[15px] bg-indigo-50 text-gray-800 leading-snug">
              <p className="text-[11px] font-medium text-indigo-600 mb-0.5">Asisten AI</p>
              Saya cek di register BKAD. Ada beberapa kode barang yang berbeda untuk laptop, jadi saya
              rinci per kode berikut jumlah dan nilainya. Mau saya pecah per unit kerja?
            </div>
          </div>
          <div className="mt-up flex justify-end" style={d(2300)}>
            <div className="max-w-[78%] rounded-lg px-3.5 py-2.5 text-[15px] bg-teal text-white">Berapa belanja modal SKPD saya tahun ini?</div>
          </div>
          <div className="mt-up flex" style={d(2900)}>
            <div className="rounded-lg px-3.5 py-2 text-[14px] bg-indigo-50 text-gray-500 italic mt-kedip">Asisten AI sedang mengetik...</div>
          </div>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
          <div className="flex-1 h-10 rounded-lg border border-gray-200 text-[14px] text-gray-400 flex items-center px-3">Tanya sesuatu ke AI...</div>
        </div>
      </div>
      <div className="mt-pop absolute -bottom-5 -right-2 w-16 h-16" style={d(600)}>
        <span className="mt-riak mt-tak-cetak absolute inset-0 rounded-full bg-teal/40" />
        <div className="relative w-full h-full rounded-full bg-teal text-white shadow-xl flex items-center justify-center"><Ikon nama="obrolan" ukuran={30} /></div>
      </div>
      <p className="mt-in absolute -bottom-9 left-0 text-[13px] text-gray-400" style={d(1200)}>Ilustrasi tampilan — tombol bulat di pojok kanan bawah aplikasi</p>
    </div>
  )
}

export function Ai() {
  return (
    <SlideTerang materi={MATERI} label="Era AI" judul="Era AI — saatnya dipakai dalam pekerjaan sehari-hari">
      <div className="absolute left-0 top-0 w-[600px] space-y-5">
        <p className="mt-in text-[21px] leading-relaxed text-gray-600" style={d(250)}>
          Sudah sepantasnya kita mengadopsi AI dalam pekerjaan sehari-hari. Di SMART Asset, <b className="text-navy">Asisten AI</b> sudah tersedia:
        </p>
        <Poin jeda={500}>Ditanya dengan bahasa sehari-hari, <b>tanpa menghafal menu</b>.</Poin>
        <Poin jeda={700}>Mencari barang, merekap per SKPD, dan menjawab cara memakai menu.</Poin>
        <Poin jeda={900}>Jawaban dari <b>data aplikasi</b>, dengan kode dan nilai yang bisa dicek ulang.</Poin>
        <Poin jeda={1100}>Satu tombol obrolan yang sama untuk <b>Asisten AI</b>, chat grup, dan admin.</Poin>
      </div>
      <PanelChat />
    </SlideTerang>
  )
}
