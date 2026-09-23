import { redirect } from 'next/navigation'

// Model lama (daftar "lembar kerja" per SKPD × jenis aset) sudah dicabut —
// migrasi 20260923_03. Lembar Kerja kini per jenis aset & membaca register
// hidup; rute ini tinggal pengalih.
export default function Page() {
  redirect('/dashboard/inventarisasi/jenis/1.3.1')
}
