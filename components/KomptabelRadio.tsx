'use client'
export default function KomptabelRadio({ value, onChange, name = 'komptabel' }: {
  value: string; onChange: (v: string) => void; name?: string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Komptabel :</label>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {[['', 'Semua'], ['intra', 'Intrakomptabel'], ['ekstra', 'Ekstrakomptabel']].map(([v, l]) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{l}
          </label>
        ))}
      </div>
    </div>
  )
}
