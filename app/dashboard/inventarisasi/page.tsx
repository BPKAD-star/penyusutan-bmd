import { redirect } from 'next/navigation'

// Pintu masuk menu Inventarisasi → Lembar Kerja (jenis aset dipilih di sana).
export default function Page() {
  redirect('/dashboard/inventarisasi/lembar-kerja')
}
