// Pesan hasil satu aksi di halaman Profil. Konvensi lama halaman ini: awalan
// "Error" = merah, selain itu hijau.
export default function PesanProfil({ pesan }: { pesan: string }) {
  if (!pesan) return null
  return <p className={`text-xs mt-2 ${pesan.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{pesan}</p>
}

export const galat = (e: unknown) => `Error: ${e instanceof Error ? e.message : String(e)}`
