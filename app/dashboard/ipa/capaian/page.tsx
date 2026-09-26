import CapaianSkpdIpa from '@/components/ipa/CapaianSkpdIpa'

// Capaian SKPD = halaman penilaian per SKPD (dulu /ipa/skpd/[id]) + pop-up
// isian capaian (dulu isi halaman ini sendiri). Parameter dibaca di server
// supaya komponennya tak butuh useSearchParams/Suspense.
export default function IpaCapaianPage({ searchParams }: { searchParams: { skpd?: string; tahun?: string; bulan?: string } }) {
  const skpd = Number(searchParams.skpd) || undefined
  const tahun = Number(searchParams.tahun) || undefined
  const bulan = Number(searchParams.bulan) || undefined
  return <CapaianSkpdIpa skpdAwal={skpd} tahunAwal={tahun} bulanAwal={bulan} />
}
