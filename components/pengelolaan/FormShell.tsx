'use client'
// Kerangka halaman form pengelolaan: judul + area pesan.
export default function FormShell({ judul, deskripsi, msg, children }: {
  judul: string; deskripsi: string; msg: string; children: React.ReactNode
}) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{judul}</h1>
        <p className="text-gray-500 text-sm mt-1">{deskripsi}</p>
      </div>
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>
      )}
      {children}
    </div>
  )
}
