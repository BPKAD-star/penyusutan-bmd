'use client'
// Validasi Inventarisasi (pengelola/admin) — daftar lembar kerja yang SUDAH
// diajukan SKPD, lintas SKPD, untuk ditinjau lalu divalidasi atau dikembalikan.
// Aksinya sendiri ada di halaman detail (satu tempat, biar tak ada dua sumber
// kebenaran); halaman ini murni antrian kerja.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import {
  STATUS_LABEL, STATUS_BADGE, konfigLki, type InvHeader, type InvStatus,
} from '@/lib/inventarisasi'

const HDR_COLS = 'id,skpd_id,tahun,golongan,status,catatan_validator,petugas,keterangan,diajukan_at,divalidasi_at,created_at'
const tglID = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function ValidasiInventarisasiPage() {
  const supabase = createClient()
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [rows, setRows] = useState<InvHeader[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<InvStatus | 'semua'>('diajukan')
  const [sayaSkpdInduk, setSayaSkpdInduk] = useState(false)

  useEffect(() => {
    (async () => {
      const [sc, { data }] = await Promise.all([
        fetchApprovalScope(supabase),
        supabase.from('inventarisasi')
          .select(`${HDR_COLS},skpd:admin_skpd(nama)`)
          .order('diajukan_at', { ascending: true, nullsFirst: false }),
      ])
      setScope(sc)
      setRows((data as never as InvHeader[]) || [])

      // Wewenang validasi = admin ATAU Pengurus Barang SKPD INDUK (level 1).
      // Perlu tahu apakah node user sendiri SKPD level 1 (parent_id NULL) —
      // pengurus level 2 (UPTD) tak boleh memvalidasi lembar level 3.
      if (sc.role === 'pengurus_barang' && sc.skpdId != null) {
        const { data: my } = await supabase.from('admin_skpd')
          .select('parent_id').eq('id', sc.skpdId).maybeSingle()
        setSayaSkpdInduk((my as { parent_id: number | null } | null)?.parent_id == null)
      }
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const terlihat = useMemo(
    () => rows.filter(r => status === 'semua' || r.status === status),
    [rows, status],
  )
  const jumlahDiajukan = useMemo(() => rows.filter(r => r.status === 'diajukan').length, [rows])

  const bolehValidasi = scope.isAdmin || sayaSkpdInduk
  if (!loading && !bolehValidasi) {
    return (
      <FormShell judul="Validasi Inventarisasi" deskripsi="" msg="">
        <div className="card p-6 text-sm text-gray-500">
          Halaman ini untuk admin/Pengelola Barang dan Pengurus Barang SKPD induk.
        </div>
      </FormShell>
    )
  }

  return (
    <FormShell
      judul="Validasi Inventarisasi"
      deskripsi={`Tinjau lembar kerja inventarisasi yang diajukan SKPD. ${jumlahDiajukan} menunggu validasi.`}
      msg=""
    >
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select className="select-filter" value={status} onChange={e => setStatus(e.target.value as InvStatus | 'semua')}>
            <option value="diajukan">Menunggu Validasi</option>
            <option value="divalidasi">Sudah Divalidasi</option>
            <option value="dikembalikan">Dikembalikan</option>
            <option value="draft">Draft</option>
            <option value="semua">Semua</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">SKPD</th>
                <th className="table-th whitespace-nowrap">Tahun</th>
                <th className="table-th whitespace-nowrap">Jenis Aset</th>
                <th className="table-th whitespace-nowrap">Diajukan</th>
                <th className="table-th whitespace-nowrap">Petugas</th>
                <th className="table-th whitespace-nowrap">Status</th>
                <th className="table-th whitespace-nowrap">Tinjau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : terlihat.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center py-10 text-gray-400">Tidak ada data.</td></tr>
              ) : terlihat.map(h => (
                <tr key={h.id}>
                  <td className="table-td text-sm">{h.skpd?.nama || `SKPD #${h.skpd_id}`}</td>
                  <td className="table-td text-xs text-gray-500">{h.tahun}</td>
                  <td className="table-td text-xs">{konfigLki(h.golongan).label}</td>
                  <td className="table-td text-xs text-gray-500 whitespace-nowrap">{tglID(h.diajukan_at)}</td>
                  <td className="table-td text-xs text-gray-500">{(h.petugas || []).length} orang</td>
                  <td className="table-td whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[h.status]}`}>
                      {STATUS_LABEL[h.status]}
                    </span>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <Link href={`/dashboard/inventarisasi/${h.id}`} className="text-teal hover:underline text-xs font-medium">
                      Tinjau
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormShell>
  )
}
