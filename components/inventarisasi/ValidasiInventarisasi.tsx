'use client'
// Validasi Inventarisasi — SATU jenis aset (route
// /dashboard/inventarisasi/validasi/<golongan>).
//
// Daftar ini dibaca dari ISIAN yang tersimpan (`fn_inventarisasi_hasil`), BUKAN
// dari register hidup: barang yang sudah pindah SKPD, direklas, atau keluar dari
// Daftar Barang hilang dari register aktif, padahal justru itu yang paling
// butuh keterangan "ada transaksi apa sesudahnya".
//
// Wewenang (keputusan user 2026-09-23): VALIDASI = PENGELOLA BARANG (admin),
// per barang, bisa dicicil. Pengguna lain melihat daftar yang sama untuk
// SKPD-nya tanpa tombol aksi. Penegak sesungguhnya RPC, bukan tombol ini.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import LkiForm from '@/components/inventarisasi/LkiForm'
import TransaksiSesudah from '@/components/inventarisasi/TransaksiSesudah'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import {
  LHI_LABEL, STATUS_BADGE, STATUS_LABEL, klasifikasiLhi, konfigLki, normalKondisi,
  type InvBaris,
} from '@/lib/inventarisasi'
import {
  barisDariHasil, muatHasil, muatRingkas,
  type BarisHasil, type FilterHasil, type Ringkas,
} from '@/lib/inventarisasiData'

const TAHUN_INI = new Date().getFullYear()
const PER_HAL = 50

const TAB: { v: FilterHasil; l: string }[] = [
  { v: 'menunggu', l: 'Menunggu validasi' },
  { v: 'divalidasi', l: 'Divalidasi' },
  { v: 'berubah', l: 'Posisi berubah' },
  { v: 'semua', l: 'Semua' },
]

const tglID = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function ValidasiInventarisasi({ golongan }: { golongan: string }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const config = konfigLki(golongan)

  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [siap, setSiap] = useState(false)
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [filter, setFilter] = useState<FilterHasil>('menunggu')
  const [cariKetik, setCariKetik] = useState('')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(0)

  const [rows, setRows] = useState<BarisHasil[]>([])
  const [adaLagi, setAdaLagi] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [ringkas, setRingkas] = useState<Ringkas | null>(null)
  const [dicentang, setDicentang] = useState<Set<string>>(new Set())
  const [lihat, setLihat] = useState<{ baris: InvBaris; skpdId: number; pesan: string } | null>(null)
  const seq = useRef(0)

  const pengelola = scope.isAdmin

  useEffect(() => {
    void fetchApprovalScope(supabase).then(sc => {
      setScope(sc)
      if (sc.isAdmin || sc.isViewer || sc.skpdId == null) setSiap(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const muat = useCallback(async () => {
    const saya = ++seq.current
    setLoading(true); setErr(''); setDicentang(new Set())
    try {
      const data = await muatHasil(supabase, {
        tahun, golongan, skpdIds, filter, cari, limit: PER_HAL + 1, offset: hal * PER_HAL,
      })
      if (saya !== seq.current) return
      setAdaLagi(data.length > PER_HAL)
      setRows(data.slice(0, PER_HAL))
    } catch (e) {
      if (saya !== seq.current) return
      setErr(e instanceof Error ? e.message : String(e))
      setRows([]); setAdaLagi(false)
    } finally {
      if (saya === seq.current) setLoading(false)
    }
  }, [tahun, golongan, skpdIds, filter, cari, hal]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatRingkasan = useCallback(() => {
    setRingkas(null)
    // Di latar & boleh gagal — hitungan tab cuma hilang, daftarnya tetap.
    muatRingkas(supabase, { tahun, golongan, skpdIds }).then(setRingkas).catch(() => setRingkas(null))
  }, [tahun, golongan, skpdIds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (siap) void muat() }, [siap, muat])
  useEffect(() => { if (siap) muatRingkasan() }, [siap, muatRingkasan])

  const hitungTab = (v: FilterHasil): number | null => {
    if (!ringkas) return null
    if (v === 'menunggu') return ringkas.menunggu
    if (v === 'divalidasi') return ringkas.divalidasi
    if (v === 'berubah') return ringkas.berubah
    return ringkas.menunggu + ringkas.divalidasi + ringkas.berubah
  }

  const bisaDivalidasi = (r: BarisHasil) => pengelola && r.status === 'diisi' && !r.posisi
  const bisaDitolak = (r: BarisHasil) => pengelola && r.status === 'diisi' && !r.posisi
  const bisaDibatalkan = (r: BarisHasil) => pengelola && r.status === 'divalidasi' && !r.posisi
  const calon = useMemo(() => rows.filter(bisaDivalidasi), [rows, pengelola]) // eslint-disable-line react-hooks/exhaustive-deps

  function namaBarang(r: BarisHasil) {
    return r.aset_id
      ? (r.snapshot?.nama_barang || r.snapshot?.uraian_barang || '—')
      : (r.jawaban?.baru?.nama_barang || '(BMD Belum Tercatat)')
  }

  async function validasi(ids: string[], judul: string) {
    await konfirmasi({
      nada: 'teal', ikon: '✓', judul,
      isi: <>Isian yang divalidasi <b>tidak bisa diubah SKPD</b> lagi, dan ikut dimuat di Laporan Hasil
        Inventarisasi. Kalau nanti ternyata keliru, batalkan validasinya supaya SKPD mengisi ulang.</>,
      labelYa: ids.length > 1 ? `Validasi ${ids.length} barang` : 'Ya, validasi',
      kerjakan: async () => {
        const { data, error } = await supabase.rpc('fn_inventarisasi_validasi', { p_ids: ids })
        if (error) { setMsg(`Error: ${error.message}`); return }
        const h = (data || {}) as { divalidasi?: number; dilewati?: number }
        setMsg(`${h.divalidasi ?? 0} barang divalidasi` +
          (h.dilewati ? ` · ${h.dilewati} dilewati (sudah divalidasi atau posisinya berubah)` : '') + '.')
        await muat(); muatRingkasan()
      },
    })
  }

  async function tolak(r: BarisHasil) {
    await konfirmasi({
      nada: 'merah', ikon: '✕', judul: 'Tolak isian ini?',
      subjudul: namaBarang(r),
      isi: <>Isian <b>tetap tersimpan</b>, tidak divalidasi. SKPD melihat catatan di bawah di Lembar Kerja
        & bisa langsung memperbaikinya.</>,
      catatan: {
        label: 'Alasan penolakan (wajib)',
        placeholder: 'Mis. foto kondisi barang belum diunggah, atau kondisi tercatat tidak sesuai foto.',
        petunjuk: <>Tanpa alasan yang jelas, SKPD tak tahu apa yang perlu dibenahi.</>,
      },
      labelYa: 'Ya, tolak',
      kerjakan: async catatan => {
        const { error } = await supabase.rpc('fn_inventarisasi_tolak', { p_id: r.id, p_catatan: catatan })
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Isian ditolak — catatan tampil di Lembar Kerja SKPD.')
        await muat(); muatRingkasan()
      },
    })
  }

  async function batalValidasi(r: BarisHasil) {
    await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan validasi barang ini?',
      subjudul: namaBarang(r),
      isi: <>Isiannya kembali ke <b>Menunggu validasi</b> dan bisa disunting lagi oleh SKPD di Lembar Kerja.</>,
      catatan: {
        label: 'Catatan untuk SKPD (boleh dikosongkan)',
        placeholder: 'Mis. kondisi tercatat "Baik" padahal fotonya menunjukkan rusak berat.',
        petunjuk: <>Catatan ini tampil di Lembar Kerja SKPD — tanpa catatan, SKPD tak tahu apa yang perlu dibenahi.</>,
      },
      labelYa: 'Ya, batalkan validasi',
      kerjakan: async catatan => {
        const { error } = await supabase.rpc('fn_inventarisasi_batal_validasi', { p_id: r.id, p_catatan: catatan || null })
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Validasi dibatalkan — SKPD bisa mengisi ulang lembarnya.')
        await muat(); muatRingkasan()
      },
    })
  }

  function bukaLihat(r: BarisHasil) {
    setLihat({
      baris: barisDariHasil(r), skpdId: r.skpd_id,
      pesan: r.posisi ? 'Barang ini sudah berpindah/keluar sejak diinventarisasi — hasilnya terkunci.'
        : 'Lembar dibuka untuk ditelaah. Isian diubah oleh SKPD di Lembar Kerja.',
    })
  }

  const semuaDicentang = calon.length > 0 && calon.every(r => dicentang.has(r.id))

  return (
    <FormShell
      judul={`Validasi Inventarisasi — ${config.label}`}
      deskripsi={pengelola
        ? 'Telaah isian lembar kerja per barang lalu validasi. Bisa dicicil — tak perlu menunggu seluruh barang SKPD selesai diisi.'
        : 'Status validasi isian inventarisasi SKPD Anda. Validasi dilakukan Pengelola Barang.'}
      msg={msg}
    >
      <div className="card p-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKPD / Unit</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setSkpdIds(sel.descendantIds); setHal(0); setSiap(true) }}
            placeholder="Semua SKPD — atau ketik nama SKPD / unit..." />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun</label>
            <select className="select-filter" value={tahun} onChange={e => { setTahun(Number(e.target.value)); setHal(0) }}>
              {[TAHUN_INI, TAHUN_INI - 1, TAHUN_INI - 2].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <form className="flex gap-2 items-end flex-1 min-w-[280px]"
            onSubmit={e => { e.preventDefault(); setCari(cariKetik); setHal(0) }}>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" value={cariKetik} onChange={e => setCariKetik(e.target.value)}
                placeholder="Nama barang, NIBAR, kode barang, kode register..." />
            </div>
            <button type="submit" className="btn-secondary text-sm">Cari</button>
          </form>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TAB.map(t => {
            const n = hitungTab(t.v)
            return (
              <button key={t.v} onClick={() => { setFilter(t.v); setHal(0) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === t.v
                  ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {t.l}{n != null ? ` (${n.toLocaleString('id-ID')})` : ''}
              </button>
            )
          })}
        </div>
        {filter === 'berubah' && (
          <p className="text-[11px] text-gray-500">
            Barang yang sesudah diinventarisasi pindah SKPD, direklas ke jenis aset lain, atau keluar dari
            Daftar Barang. Hasilnya terkunci di posisi lama; di posisi barunya barang itu wajib
            diinventarisasi lagi. Kuncinya terbuka sendiri kalau barangnya kembali ke posisi semula.
          </p>
        )}
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {pengelola && calon.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <button className="btn-primary text-sm" disabled={dicentang.size === 0}
            onClick={() => validasi([...dicentang], `Validasi ${dicentang.size} barang yang dicentang?`)}>
            ✓ Validasi yang dicentang ({dicentang.size})
          </button>
          <span className="text-[11px] text-gray-400">Centang hanya berlaku untuk halaman ini.</span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {pengelola && (
                  <th className="table-th w-8">
                    <input type="checkbox" checked={semuaDicentang} disabled={calon.length === 0}
                      onChange={e => setDicentang(e.target.checked ? new Set(calon.map(r => r.id)) : new Set())} />
                  </th>
                )}
                <th className="table-th">SKPD</th>
                <th className="table-th">Barang</th>
                <th className="table-th whitespace-nowrap">Kondisi</th>
                <th className="table-th">Masuk Laporan (LHI)</th>
                <th className="table-th whitespace-nowrap">Diisi</th>
                <th className="table-th">Status</th>
                <th className="table-th whitespace-nowrap text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!siap || loading ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-gray-400">
                  {err ? 'Daftar tidak bisa dimuat.' : 'Tidak ada isian untuk filter ini.'}
                </td></tr>
              ) : rows.map(r => {
                const lhi = klasifikasiLhi(barisDariHasil(r))
                const sebelum = r.aset_id ? normalKondisi(r.snapshot?.kondisi) : null
                const sesudah = r.aset_id ? r.jawaban?.kondisi : r.jawaban?.baru?.kondisi
                return (
                  <tr key={r.id} className="align-top">
                    {pengelola && (
                      <td className="table-td">
                        {bisaDivalidasi(r) && (
                          <input type="checkbox" checked={dicentang.has(r.id)}
                            onChange={e => setDicentang(prev => {
                              const n = new Set(prev); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n
                            })} />
                        )}
                      </td>
                    )}
                    <td className="table-td text-xs text-gray-600">{r.skpd_nama || `SKPD #${r.skpd_id}`}</td>
                    <td className="table-td text-xs">
                      <p className="font-medium text-gray-800">{namaBarang(r)}</p>
                      <p className="text-gray-500">
                        {r.aset_id ? `${r.snapshot?.kode || '—'} · ${r.snapshot?.uraian_barang || '—'}`
                          : `${r.jawaban?.baru?.kode_barang || '—'} · belum tercatat (III.A.7)`}
                      </p>
                      {r.aset_id && <p className="text-gray-400 break-all">{r.snapshot?.nibar || '—'}</p>}
                    </td>
                    <td className="table-td text-xs whitespace-nowrap">
                      {r.aset_id ? (
                        <>
                          {sebelum || '—'} → <b className={sesudah && sebelum && sesudah !== sebelum ? 'text-amber-700' : ''}>{sesudah || '—'}</b>
                          {r.jawaban?.keberadaan && r.jawaban.keberadaan !== 'ada' && (
                            <p className="text-red-600">{r.jawaban.keberadaan === 'hilang' ? 'Hilang' : 'Tidak ditemukan'}</p>
                          )}
                        </>
                      ) : (sesudah || '—')}
                    </td>
                    <td className="table-td text-xs">
                      <div className="flex flex-wrap gap-1">
                        {lhi.length === 0 ? <span className="text-gray-300">—</span> : lhi.map(k => (
                          <span key={k} title={LHI_LABEL[k]} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{k}</span>
                        ))}
                      </div>
                    </td>
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">{tglID(r.diisi_at)}</td>
                    <td className="table-td text-xs">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.status === 'diisi' && r.catatan_validator && (
                        <p className="mt-1 text-[11px] text-gray-500">↩ {r.catatan_validator}</p>
                      )}
                      <TransaksiSesudah transaksi={r.transaksi_sesudah || []} posisi={r.posisi}
                        skpdBaru={r.posisi_skpd_nama} golonganBaru={r.posisi_golongan} />
                    </td>
                    <td className="table-td text-xs text-right whitespace-nowrap">
                      <button onClick={() => bukaLihat(r)} className="text-gray-600 hover:underline">Lihat</button>
                      {bisaDivalidasi(r) && (
                        <button onClick={() => validasi([r.id], 'Validasi isian barang ini?')}
                          className="ml-3 text-teal hover:underline font-medium">✓ Validasi</button>
                      )}
                      {bisaDitolak(r) && (
                        <button onClick={() => tolak(r)} className="ml-3 text-red-600 hover:underline font-medium">
                          ✕ Tolak
                        </button>
                      )}
                      {bisaDibatalkan(r) && (
                        <button onClick={() => batalValidasi(r)} className="ml-3 text-amber-700 hover:underline font-medium">
                          ↩ Batal Validasi
                        </button>
                      )}
                      <a href={`/cetak/inventarisasi-lki?id=${r.id}`} target="_blank" rel="noopener noreferrer"
                        className="ml-3 text-gray-500 hover:text-gray-800" title="Cetak lembar kerja barang ini">🖨</a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Halaman {hal + 1}</span>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={hal === 0 || loading} onClick={() => setHal(h => h - 1)}>← Sebelumnya</button>
            <button className="btn-secondary text-xs" disabled={!adaLagi || loading} onClick={() => setHal(h => h + 1)}>Berikutnya →</button>
          </div>
        </div>
      </div>

      {lihat && (
        <LkiForm
          baris={lihat.baris}
          config={config}
          golongan={golongan}
          skpdId={lihat.skpdId}
          readOnly
          pesanReadOnly={lihat.pesan}
          onSimpan={async () => {}}
          onTutup={() => setLihat(null)}
        />
      )}
    </FormShell>
  )
}
