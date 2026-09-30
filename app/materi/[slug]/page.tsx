import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cariMateri } from '@/lib/materi'
import PaparanMateri from '@/components/materi/PaparanMateri'

// Judul tab = nama bawaan berkas saat "Export PDF" (peramban memakai judul
// dokumen sbg nama berkas Save as PDF). Disetel lewat metadata, bukan
// `document.title` — materi bukan laporan ber-periode/ber-SKPD, jadi ia di luar
// susunan `namaBerkasLaporan`.
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const m = cariMateri(params.slug)
  return { title: m ? `Materi - ${m.judul}` : 'Materi tidak ditemukan' }
}

export default function MateriPage({ params }: { params: { slug: string } }) {
  if (!cariMateri(params.slug)) notFound()
  return <PaparanMateri slug={params.slug} />
}
