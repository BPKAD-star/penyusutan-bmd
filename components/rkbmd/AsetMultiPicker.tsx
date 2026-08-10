'use client'
// Pemilih BANYAK barang sekaligus — dipakai RKBMD Pemindahtanganan &
// Penghapusan (permintaan user 2026-08-10). Di dua jenis itu satu SKPD biasanya
// mengusulkan puluhan barang dalam satu tahun anggaran; memilihnya satu per
// satu berarti bolak-balik buka-tutup form untuk tiap barang.
//
// Aturan seleksi mengikuti pola `draftSeleksi` yang sudah dipakai Pengadaan:
//   • Centang TETAP tersimpan waktu kata kuncinya diganti — supaya barang bisa
//     dikumpulkan dari beberapa pencarian.
//   • Karena itu bisa ada barang tercentang di LUAR hasil pencarian saat ini,
//     dan itu WAJIB kelihatan. Di sini semuanya ditampilkan utuh di daftar
//     "terpilih" di bawah, jadi tak ada yang tersembunyi.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import type { AsetRingkas } from '@/components/AsetPicker'

export default function AsetMultiPicker({ terpilih, onChange, skpdId, kodePrefix }: {
  terpilih: AsetRingkas[]
  onChange: (next: AsetRingkas[]) => void
  skpdId: number
  kodePrefix?: string
}) {
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<AsetRingkas[]>([])
  const [mencari, setMencari] = useState(false)
  const [err, setErr] = useState('')
  const [sudahCari, setSudahCari] = useState(false)

  const idsTerpilih = new Set(terpilih.map(a => a.id))

  async function cari() {
    setMencari(true); setErr('')
    let query = supabase.from('aset')
      .select('id,nibar,kode,nama_barang,uraian_barang,merek_tipe,tgl_perolehan,nilai_perolehan,skpd_id,status,skpd:admin_skpd(nama)')
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (kodePrefix) query = query.like('kode', `${kodePrefix}%`)
    // Koma & kurung dibuang — satu koma memecah sintaks `or=` di tengah jalan
    // dan PostgREST menolak SELURUH filter; nama barang e-BMD banyak yang berkoma.
    const term = q.trim().replace(/[,()]/g, '')
    if (term) query = query.or([
      `nibar.ilike.%${term}%`,
      `nama_barang.ilike.%${term}%`,
      `uraian_barang.ilike.%${term}%`,
      `merek_tipe.ilike.%${term}%`,
      `kode.ilike.%${term}%`,
    ].join(','))
    const { data, error } = await query.order('kode').order('nibar').limit(200)
    if (error) { setErr(`Gagal mencari barang: ${error.message}`); setHasil([]) }
    else setHasil((data as unknown as AsetRingkas[]) || [])
    setSudahCari(true)
    setMencari(false)
  }

  function toggle(a: AsetRingkas) {
    onChange(idsTerpilih.has(a.id) ? terpilih.filter(x => x.id !== a.id) : [...terpilih, a])
  }

  /** Centang-semua = semua yang LOLOS pencarian saat ini, bukan seluruh isi SKPD. */
  function pilihSemuaHasil() {
    const baru = hasil.filter(a => !idsTerpilih.has(a.id))
    onChange([...terpilih, ...baru])
  }

  const totalNilai = terpilih.reduce((s, a) => s + (a.nilai_perolehan || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="select-filter flex-1"
          placeholder="Cari NIBAR / uraian barang / nama barang / merek / kode..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cari() } }}
        />
        <button type="button" className="btn-secondary" onClick={cari} disabled={mencari}>
          {mencari ? '...' : 'Cari'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        Kosongkan kotak cari lalu tekan &ldquo;Cari&rdquo; untuk melihat seluruh barang
        {kodePrefix ? ' jenis ini' : ''} di SKPD. Centang boleh dikumpulkan dari beberapa pencarian —
        yang sudah dicentang tidak hilang saat kata kuncinya diganti.
      </p>

      {err && <p className="text-xs text-red-600">{err}</p>}

      {sudahCari && (
        hasil.length === 0 ? (
          <p className="text-xs text-gray-400">Tidak ada barang yang cocok.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-xs text-gray-500">{hasil.length} barang ditemukan</span>
              <button type="button" onClick={pilihSemuaHasil} className="text-xs text-teal hover:underline">
                Centang semua hasil ini
              </button>
            </div>
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {hasil.map(a => {
                const dipilih = idsTerpilih.has(a.id)
                return (
                  <label key={a.id}
                    className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${dipilih ? 'bg-teal/5' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={dipilih} onChange={() => toggle(a)} className="mt-0.5 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-gray-800">{a.nama_barang || a.uraian_barang || '-'}</span>
                      <span className="block text-[11px] text-gray-400">
                        {a.nibar || '-'} · {a.kode}{a.merek_tipe ? ` · ${a.merek_tipe}` : ''}
                        {a.tgl_perolehan ? ` · ${a.tgl_perolehan}` : ''} · {formatRupiah(a.nilai_perolehan)}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      )}

      <div className="rounded-lg border border-teal/30 bg-teal/5">
        <div className="flex items-center justify-between px-3 py-2 border-b border-teal/20">
          <span className="text-xs font-medium text-gray-700">
            Terpilih: {terpilih.length} barang · nilai perolehan {formatRupiah(totalNilai)}
          </span>
          {terpilih.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700">
              Kosongkan
            </button>
          )}
        </div>
        {terpilih.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400">Belum ada barang dicentang.</p>
        ) : (
          <ul className="divide-y divide-teal/10 max-h-52 overflow-y-auto">
            {terpilih.map(a => (
              <li key={a.id} className="flex items-start justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0">
                  <span className="block text-xs text-gray-800">{a.nama_barang || a.uraian_barang || '-'}</span>
                  <span className="block text-[11px] text-gray-400">{a.nibar || '-'} · {a.kode}</span>
                </span>
                <button type="button" onClick={() => toggle(a)}
                  className="text-red-500 hover:text-red-700 text-xs flex-shrink-0" title="Keluarkan dari pilihan">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
