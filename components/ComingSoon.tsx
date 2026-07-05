// Placeholder halaman yang belum dibangun — dipakai RKBMD, Inventarisasi, WasDal.
export default function ComingSoon({ judul, deskripsi }: { judul: string; deskripsi?: string }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
        {deskripsi && <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>}
      </div>
      <div className="card p-16 text-center">
        <p className="text-4xl mb-3">🚧</p>
        <p className="text-lg font-semibold text-gray-700">Segera Hadir</p>
        <p className="text-sm text-gray-400 mt-1">Menu {judul} sedang dalam pengembangan.</p>
      </div>
    </div>
  )
}
