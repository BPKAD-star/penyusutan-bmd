'use client'
// Kolom paling kiri tabel Daftar Barang: ikon dokumen (buka KIBAR barang itu) +
// kotak centang di bawahnya (pilih untuk Cetak Label). Dulu dua pekerjaan ini
// ada di menu Pelaporan → KIBAR yang terpisah; isinya tidak berubah, hanya
// tempatnya. Bukan bagian `cols` Daftar Barang — kolom itu juga menentukan
// susunan tampilan per jenis aset, sedangkan kolom ini aksi, bukan data.
import Link from 'next/link'

export function IkonDokumen({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  )
}

export function KolomKibarHead({ semua, sebagian, onToggle, disabled }: {
  semua: boolean; sebagian: boolean; onToggle: () => void; disabled?: boolean
}) {
  return (
    <th className="table-th w-12 text-center whitespace-nowrap" title="KIBAR & label: centang barang lalu klik Cetak Label">
      <div className="flex flex-col items-center gap-1">
        <span>KIBAR</span>
        <input type="checkbox" checked={semua} disabled={disabled}
          ref={el => { if (el) el.indeterminate = !semua && sebagian }}
          onChange={onToggle} aria-label="Pilih semua barang di halaman ini untuk cetak label" />
      </div>
    </th>
  )
}

export function KolomKibarCell({ nibar, checked, onToggle, striped }: {
  nibar: string | null; checked: boolean; onToggle: () => void; striped?: boolean
}) {
  return (
    <td className={`table-td align-top text-center ${striped ? 'bg-gray-50/50' : 'bg-white'}`}>
      <div className="flex flex-col items-center gap-1.5">
        {nibar ? (
          <Link href={`/kibar/${nibar}`} target="_blank" rel="noopener noreferrer"
            className="text-teal hover:text-teal-light" title="Buka KIBAR (Kartu Identitas Barang)">
            <IkonDokumen />
          </Link>
        ) : (
          <span className="text-gray-300" title="Barang ini belum punya NIBAR, jadi belum punya KIBAR"><IkonDokumen /></span>
        )}
        <input type="checkbox" checked={checked} disabled={!nibar} onChange={onToggle}
          aria-label="Pilih untuk cetak label" />
      </div>
    </td>
  )
}
