import DetailSkpdIpa from '@/components/ipa/DetailSkpdIpa'

export default function IpaSkpdPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { tahun?: string; bulan?: string }
}) {
  const tahun = Number(searchParams.tahun) || undefined
  const bulan = Number(searchParams.bulan) || undefined
  return <DetailSkpdIpa key={params.id} skpdId={Number(params.id)} tahunAwal={tahun} bulanAwal={bulan} />
}
