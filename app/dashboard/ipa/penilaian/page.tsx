// Rute lama "Input Penilaian" (IPA versi Kepmen) — dibiarkan hidup sebagai
// pengalih supaya pranala yang terlanjur tersebar tidak mati.
import { redirect } from 'next/navigation'

export default function PenilaianLamaPage() {
  redirect('/dashboard/ipa/capaian')
}
