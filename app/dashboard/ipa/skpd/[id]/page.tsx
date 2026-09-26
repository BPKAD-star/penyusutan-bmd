// Rute lama rincian IPA per SKPD — sejak 2026-09-26 isinya pindah ke menu
// Capaian SKPD. Dibiarkan hidup sbg pengalih supaya pranala lama tak mati.
import { redirect } from 'next/navigation'

export default function IpaSkpdLamaPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { tahun?: string; bulan?: string }
}) {
  const q = new URLSearchParams({ skpd: params.id })
  if (searchParams.tahun) q.set('tahun', searchParams.tahun)
  if (searchParams.bulan) q.set('bulan', searchParams.bulan)
  redirect(`/dashboard/ipa/capaian?${q.toString()}`)
}
