'use client'
// Penyambung halaman `/materi/<slug>` ke mesin presentasinya: memilih daftar
// slide menurut slug lalu menyerahkannya ke Deck. Halaman (server) tak bisa
// mengoper komponen ke client component, jadi pemilihannya dikerjakan di sini.
import Deck from './Deck'
import { ISI_MATERI } from './isiMateri'

export default function PaparanMateri({ slug }: { slug: string }) {
  const slides = ISI_MATERI[slug]
  if (!slides) return <p className="p-8 text-sm text-red-700" role="alert">Isi materi &quot;{slug}&quot; belum tersedia.</p>
  return <Deck kembali="/dashboard/dokumen-sumber" slides={slides.map((S, i) => <S key={i} />)} />
}
