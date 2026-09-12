'use client'
// Pemilih tampilan rekap: Rekap per Golongan (dulu "Model 1") / Rekap per SKPD
// (dulu "Model 2") / Mutasi Tambah-Kurang (dulu "Model 3"). Saat Rekap per SKPD
// aktif, muncul pilihan metrik yang ditampilkan.
//
// ⚠️ Relabeling 2026-09-11 (permintaan user, "diselaraskan kyk pelaporan
// lainnya") — MURNI TAMPILAN: nama & gaya tombolnya diganti dari radio "Model
// N" jadi pill tab (pola yang sama dgn tab bar Perolehan/Reklasifikasi/Koreksi/
// dst.), TAPI posisi & pemanggilnya di kedua halaman TIDAK dipindah — masih di
// dalam kartu "Filter data", masih 3 opsi yang sama, `model` masih bertipe
// `1 | 2 | 3` apa adanya. Tak ada logika/alur data yang disentuh: baik
// Laporan BMD (yang tombol Cetak Format IV.L.4.1–4.4-nya bersandar pada Model 1
// & Model 3) maupun Saldo Awal → Rekapitulasi (yang cuma pakai Model 1 & 2)
// sama-sama tetap jalan seperti sebelumnya.
import { METRIC_LABEL, type Metric, type MetricOrAll } from '@/components/RekapMatrixTable'

const METRIC_OPTIONS: { value: MetricOrAll; label: string }[] = [
  ...(['perolehan', 'akumulasi', 'beban', 'nilaiBuku'] as Metric[]).map(m => ({ value: m, label: METRIC_LABEL[m] })),
  { value: 'semua', label: 'Semua nilai' },
]

const MODEL_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Rekap per Golongan',
  2: 'Rekap per SKPD',
  3: 'Mutasi (Tambah-Kurang)',
}

export default function RekapModelControls({ model, onModel, metric, onMetric, models = [1, 2] }: {
  model: 1 | 2 | 3
  onModel: (m: 1 | 2 | 3) => void
  metric: MetricOrAll
  onMetric: (m: MetricOrAll) => void
  models?: readonly (1 | 2 | 3)[] // opsi Model 3 (mutasi) cuma relevan di Saldo Akhir, bukan Saldo Awal
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
        <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0">Tampilan :</label>
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          {models.map(v => (
            <button key={v} type="button" onClick={() => onModel(v)}
              className={`px-4 py-1.5 rounded-md transition-colors ${model === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {MODEL_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      {model === 2 && (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
          <label className="sm:w-40 text-sm text-gray-600 sm:text-right flex-shrink-0 sm:pt-0.5">Tampilkan nilai :</label>
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
