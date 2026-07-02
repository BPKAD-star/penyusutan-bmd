'use client'
export default function KomptabelRadio({ value, onChange, name = 'komptabel' }: {
  value: string; onChange: (v: string) => void; name?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Komptabel :</label>
      <div className="flex gap-4">
        {[['', 'Semua'], ['intra', 'Intrakomptabel'], ['ekstra', 'Ekstrakomptabel']].map(([v, l]) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{l}
          </label>
        ))}
      </div>
    </div>
  )
}
