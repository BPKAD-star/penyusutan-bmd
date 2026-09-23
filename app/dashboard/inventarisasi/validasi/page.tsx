import { redirect } from 'next/navigation'

// Validasi kini per jenis aset (/dashboard/inventarisasi/validasi/<golongan>),
// sejalan dgn Lembar Kerja. Rute lama dipertahankan sbg pengalih supaya
// pranala yang terlanjur tersebar tidak mati.
export default function Page() {
  redirect('/dashboard/inventarisasi/validasi/1.3.1')
}
