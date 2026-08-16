'use client'
// Kotak Cari untuk daftar master (Daftar Pegawai & Daftar User).
//
// ⚠️ Selalu menampilkan "N dari M" saat sedang menyaring. Tanpa itu, daftar yang
// tersaring tak bisa dibedakan dari daftar yang memang cuma berisi segitu —
// operator lalu menyimpulkan pegawainya belum terdaftar dan menambahkannya lagi.
// Aturan yang sama sudah dipakai bilah aksi draft Pengadaan.
export default function CariBox({ nilai, onChange, jumlah, total, satuan, placeholder }: {
  nilai: string
  onChange: (v: string) => void
  jumlah: number
  total: number
  satuan: string            // mis. 'pegawai' / 'user'
  placeholder?: string
}) {
  const menyaring = nilai.trim() !== ''
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="relative flex-1 max-w-md">
        <input
          className="select-filter w-full pr-8"
          value={nilai}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Cari nama, NIP, atau SKPD...'}
        />
        {menyaring && (
          <button type="button" onClick={() => onChange('')} title="Kosongkan pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
            ×
          </button>
        )}
      </div>
      {menyaring && (
        <span className={`text-xs whitespace-nowrap ${jumlah === 0 ? 'text-amber-600' : 'text-gray-500'}`}>
          {jumlah === 0
            ? `Tidak ada ${satuan} yang cocok (dari ${total.toLocaleString('id-ID')})`
            : `${jumlah.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} ${satuan}`}
        </span>
      )}
    </div>
  )
}
