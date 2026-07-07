'use client'
// Pemilih tampilan rekap: Model 1 (per golongan) / Model 2 (matriks per SKPD per
// jenis). Saat Model 2 aktif, muncul pilihan metrik yang ditampilkan.
import { METRIC_LABEL, type Metric, type MetricOrAll } from '@/components/RekapMatrixTable'

const METRIC_OPTIONS: { value: MetricOrAll; label: string }[] = [
  ...(['perolehan', 'akumulasi', 'beban', 'nilaiBuku'] as Metric[]).map(m => ({ value: m, label: METRIC_LABEL[m] })),
  { value: 'semua', label: 'Semua nilai' },
]

export default function RekapModelControls({ model, onModel, metric, onMetric }: {
  model: 1 | 2
  onModel: (m: 1 | 2) => void
  metric: MetricOrAll
  onMetric: (m: MetricOrAll) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0">Model tampilan :</label>
        <div className="flex gap-4">
          {[[1, 'Model 1 — per golongan'], [2, 'Model 2 — per SKPD per jenis']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name="rekap-model" checked={model === v} onChange={() => onModel(v as 1 | 2)} />
              {l}
            </label>
          ))}
        </div>
      </div>

      {model === 2 && (
        <div className="flex items-start gap-3">
          <label className="w-40 text-sm text-gray-600 text-right flex-shrink-0 pt-0.5">Tampilkan nilai :</label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {METRIC_OPTIONS.map(o => (
              <label key={o.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="rekap-metric" checked={metric === o.value} onChange={() => onMetric(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
