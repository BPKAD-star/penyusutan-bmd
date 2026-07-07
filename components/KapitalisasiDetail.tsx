'use client'
// Rincian kapitalisasi (sebelum → penambahan → sesudah) — dipakai di preview form
// Kapitalisasi dan di popup "mata" (menu Kapitalisasi & Penyusutan). Disusun
// se-eksplisit mungkin agar mudah diperiksa (BPK): semua angka induk sebelum,
// nilai/persen anak, dan hasil sesudah kapitalisasi.
import { formatRupiah } from '@/lib/export'

export type KapSnapshot = {
  np_lama: number; beban_lama: number; akum_lama: number; nb_lama: number
  sisa_lama_smt: number; masa_maks_tahun: number | null
  rehab: number; persen: number; tambahan_tahun: number
  masa_baru_tahun: number; sisa_baru_smt: number
  np_baru: number; nb_baru: number; beban_baru: number; akum_baru: number
}
export type KapAnak = { id: string; nibar: string | null; nama: string | null; nilai: number; tgl?: string | null }
export type KapItem = { no_dokumen: string; tanggal: string; keterangan?: string | null; snapshot: KapSnapshot | null; anak: KapAnak[] }

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 min-w-0">
      <span className="text-xs text-gray-500 min-w-0">{label}</span>
      <span className={`text-xs tabular-nums whitespace-nowrap flex-shrink-0 ${strong ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

export function KapitalisasiRincian({ item }: { item: KapItem }) {
  const s = item.snapshot
  return (
    <div className="space-y-4">
      <div className="text-sm">
        <p className="font-semibold text-gray-800">No. Dokumen: {item.no_dokumen}</p>
        <p className="text-xs text-gray-500">Tanggal dokumen: {item.tanggal}{item.keterangan ? ` · ${item.keterangan}` : ''}</p>
      </div>

      {!s ? (
        <p className="text-xs text-gray-400">Rincian perhitungan tidak tersimpan untuk transaksi ini.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sebelum */}
          <div className="border border-gray-200 rounded-lg p-3 min-w-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Induk — Sebelum</p>
            <Row label="Nilai perolehan induk" value={formatRupiah(s.np_lama)} />
            <Row label="Beban penyusutan / smt" value={formatRupiah(s.beban_lama)} />
            <Row label="Akumulasi penyusutan" value={formatRupiah(s.akum_lama)} />
            <Row label="Nilai buku induk" value={formatRupiah(s.nb_lama)} />
            <Row label="Sisa masa manfaat" value={`${s.sisa_lama_smt} smt`} />
            {s.masa_maks_tahun != null && <Row label="Masa manfaat maks (kode)" value={`${s.masa_maks_tahun} th`} />}
          </div>

          {/* Penambahan */}
          <div className="border border-gray-200 rounded-lg p-3 min-w-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Penambahan (Anak)</p>
            <ul className="mb-2 space-y-1">
              {item.anak.map(a => (
                <li key={a.id} className="text-xs text-gray-700 flex justify-between gap-3 min-w-0">
                  <span className="min-w-0 break-words">{a.nama || '-'}{a.tgl ? <span className="text-gray-400"> · {a.tgl}</span> : null}</span>
                  <span className="tabular-nums whitespace-nowrap flex-shrink-0">{formatRupiah(a.nilai)}</span>
                </li>
              ))}
            </ul>
            <Row label="Total nilai anak (rehab)" value={formatRupiah(s.rehab)} strong />
            <Row label="Persentase thd nilai induk" value={`${s.persen.toFixed(2)}%`} />
            <Row label="Tambahan masa manfaat" value={`+${s.tambahan_tahun} th`} />
          </div>

          {/* Sesudah */}
          <div className="border border-teal/40 bg-teal/5 rounded-lg p-3 min-w-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Induk — Sesudah</p>
            <Row label="Nilai perolehan baru" value={formatRupiah(s.np_baru)} strong />
            <Row label="Nilai buku baru" value={formatRupiah(s.nb_baru)} strong />
            <Row label="Masa manfaat baru" value={`${s.masa_baru_tahun} th (${s.sisa_baru_smt} smt)`} strong />
            <Row label="Beban penyusutan / smt baru" value={formatRupiah(s.beban_baru)} strong />
            <Row label="Akumulasi penyusutan" value={formatRupiah(s.akum_baru)} />
            <Row label="Sisa masa manfaat baru" value={`${s.sisa_baru_smt} smt`} strong />
          </div>
        </div>
      )}
    </div>
  )
}

// Popup: satu / beberapa rincian kapitalisasi, urut tertua → termuda.
export function KapitalisasiDetailModal({ title, items, onClose }: {
  title: string; items: KapItem[]; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400">Tidak ada data kapitalisasi.</p>
          ) : items.map((it, i) => (
            <div key={i}>
              {items.length > 1 && <p className="text-xs text-gray-400 mb-2">Kapitalisasi #{i + 1} (tertua → termuda)</p>}
              <KapitalisasiRincian item={it} />
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button className="btn-secondary" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
