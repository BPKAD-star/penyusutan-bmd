'use client'
// Tutup Tahun — Opsi B (checkpoint), migrasi 25. Admin only (RLS/RPC juga
// menegakkan ini di server, ini cuma UI). Alur:
//   1. Tampilkan status semua tahun_buku + preview blocker (jurnal pending)
//      utk tahun terbuka.
//   2. Kalau ada blocker, tombol Tutup disabled — tampilkan daftarnya.
//   3. Kalau bersih, admin isi catatan (opsional) → klik Tutup → fn_tutup_tahun
//      (checkpoint massal + kunci tahun ini + buka tahun berikutnya, atomik).
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type TahunRow = { tahun: number; status: 'terbuka' | 'terkunci'; ditutup_pada: string | null; catatan: string | null }
type Blocker = { kategori: string; no_sk: string; tanggal: string; skpd_nama: string }

const KATEGORI_LABEL: Record<string, string> = {
  pengadaan: 'Pengadaan (kontrak)',
  pengalihan_status: 'Pengalihan Status Penggunaan',
}

export default function TutupTahunPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [rows, setRows] = useState<TahunRow[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [loading, setLoading] = useState(true)
  const [catatan, setCatatan] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const tahunTerbuka = rows.filter(r => r.status === 'terbuka').map(r => r.tahun)
  const target = tahunTerbuka.length > 0 ? Math.max(...tahunTerbuka) : null

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('tahun_buku').select('tahun,status,ditutup_pada,catatan').order('tahun', { ascending: false })
    setRows((data as TahunRow[]) || [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (target == null) { setBlockers([]); return }
    ;(async () => {
      const { data } = await supabase.rpc('fn_preview_tutup_tahun', { p_tahun: target })
      setBlockers((data as Blocker[]) || [])
    })()
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const akhirTahun = target != null ? `${target}-12-31` : null
  const belumBerakhir = akhirTahun != null && akhirTahun > new Date().toISOString().slice(0, 10)

  // Aksi paling tak terbalikkan di seluruh aplikasi — dan satu-satunya yang
  // membekukan angka yang dilaporkan ke inspektorat/BPK. Karena itu ia
  // dijalankan lewat `kerjakan` (checkpoint massal seluruh aset aktif bisa
  // makan waktu) DAN akibatnya dipecah jadi baris rincian, bukan paragraf.
  async function tutup() {
    if (target == null) return
    await konfirmasi({
      nada: 'amber', ikon: '🔒', judul: `Tutup tahun buku ${target}?`,
      rincian: [
        { label: 'Dibekukan', nilai: `Posisi akhir ${target}` },
        { label: 'Otomatis terbuka', nilai: `Tahun ${target + 1}` },
        { label: 'Jurnal menggantung', nilai: blockers.length === 0 ? 'tidak ada' : `${blockers.length} — akan ditolak` },
      ],
      isi: <>Angka penyusutan {target} disalin jadi <b>checkpoint permanen</b>, dan tahun itu tak
        bisa menerima transaksi baru lagi. Laporannya tetap bisa dibuka — yang dikunci
        pencatatannya, bukan pembacaannya.</>,
      peringatan: <><b>Tidak bisa dibatalkan lewat aplikasi.</b> Pastikan seluruh transaksi {target} sudah
        masuk dan Engine sudah dijalankan untuk semester terakhirnya.</>,
      labelYa: `Ya, tutup tahun ${target}`,
      kerjakan: async () => {
        setBusy(true); setMsg('')
        const { data, error } = await supabase.rpc('fn_tutup_tahun', { p_tahun: target, p_catatan: catatan.trim() || null })
        setBusy(false)
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg(`✓ Tahun ${target} ditutup — ${data} aset di-checkpoint. Tahun ${target + 1} sekarang terbuka.`)
        setCatatan('')
        load()
      },
    })
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tutup Tahun</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bekukan posisi akhir tahun (checkpoint) & kunci — angka tahun itu jadi final/teraudit, tidak bisa ditambah transaksi baru lagi.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      <div className="card overflow-hidden mb-6">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">Tahun</th>
              <th className="table-th">Status</th>
              <th className="table-th">Ditutup Pada</th>
              <th className="table-th">Catatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="table-td text-center py-8 text-gray-400">Belum ada data tahun_buku.</td></tr>
            ) : rows.map(r => (
              <tr key={r.tahun}>
                <td className="table-td font-medium text-sm">{r.tahun}</td>
                <td className="table-td">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'terkunci' ? 'bg-gray-200 text-gray-700' : 'bg-teal/10 text-teal'}`}>
                    {r.status === 'terkunci' ? '🔒 Terkunci' : 'Terbuka'}
                  </span>
                </td>
                <td className="table-td text-xs text-gray-500">{r.ditutup_pada ? new Date(r.ditutup_pada).toLocaleString('id-ID') : '-'}</td>
                <td className="table-td text-xs text-gray-500">{r.catatan || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target == null ? (
        <div className="card p-6 text-center text-gray-400 text-sm">Tidak ada tahun berstatus terbuka — periksa tabel tahun_buku.</div>
      ) : (
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Tutup Tahun {target}</h2>

          {belumBerakhir && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ Tahun {target} belum berakhir (baru {new Date().toISOString().slice(0, 10)}) — tidak bisa ditutup sebelum 31 Desember {target}.
            </p>
          )}

          {blockers.length > 0 ? (
            <div>
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
                ⛔ Ada {blockers.length} jurnal pending bertanggal di {target} — selesaikan (setujui/tolak) semuanya dulu sebelum bisa menutup tahun ini.
              </p>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th">Kategori</th>
                      <th className="table-th">No. SK/Dokumen</th>
                      <th className="table-th">Tanggal</th>
                      <th className="table-th">SKPD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {blockers.map((b, i) => (
                      <tr key={i}>
                        <td className="table-td text-xs">{KATEGORI_LABEL[b.kategori] || b.kategori}</td>
                        <td className="table-td text-xs">{b.no_sk}</td>
                        <td className="table-td text-xs">{b.tanggal}</td>
                        <td className="table-td text-xs">{b.skpd_nama}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Tidak ada jurnal pending — aman untuk ditutup.
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Catatan (opsional)</label>
            <input className="select-filter w-full" value={catatan} onChange={e => setCatatan(e.target.value)}
              placeholder="mis. Ditutup setelah rekonsiliasi & audit BPK selesai" />
          </div>

          <button className="btn-primary" onClick={tutup} disabled={busy || blockers.length > 0 || belumBerakhir}>
            {busy ? 'Menutup...' : `Tutup Tahun ${target}`}
          </button>
        </div>
      )}
    </div>
  )
}
