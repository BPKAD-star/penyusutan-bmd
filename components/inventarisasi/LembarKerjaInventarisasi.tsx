'use client'
// Lembar Kerja Inventarisasi — SATU jenis aset (route
// /dashboard/inventarisasi/jenis/<golongan>).
//
// MODEL PER-BARANG (keputusan user 2026-09-23, migrasi 20260923_03): daftar ini
// MEMBACA register hidup — barang baru langsung muncul, barang yang dihapus/
// dipindah langsung hilang — lalu tiap barang punya tombol "Isi Inventarisasi".
// Isian tersimpan begitu disimpan; tak ada "Ajukan". Pengelola Barang
// memvalidasinya per barang di menu Validasi.
//
// ⚠️ Daftar & ringkasan SENGAJA dua permintaan terpisah (pola 2026-09-22):
// ringkasan menghitung ratusan ribu barang (3,6 dtk untuk Dinas Pendidikan),
// halaman pertama cuma ratusan milidetik. Ringkasan dimuat di latar & boleh
// gagal tanpa menjatuhkan daftarnya.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import LkiForm from '@/components/inventarisasi/LkiForm'
import TimPanel from '@/components/inventarisasi/TimPanel'
import TransaksiSesudah from '@/components/inventarisasi/TransaksiSesudah'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import { formatRupiah2 } from '@/lib/export'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import {
  STATUS_BADGE, STATUS_LABEL, konfigLki, normalKondisi,
  type InvBaris, type InvJawaban, type StatusTampil,
} from '@/lib/inventarisasi'
import {
  belumDiinventarisasi, muatBelumTercatat, muatIsian, muatLembar, muatRingkas, simpanIsian,
  snapshotDariLembar, type BarisLembar, type FilterLembar, type Ringkas,
} from '@/lib/inventarisasiData'

const TAHUN = new Date().getFullYear()
const PER_HAL = 50

type Terbuka = { baris: InvBaris; skpdId: number; readOnly: boolean; pesan?: string }

export default function LembarKerjaInventarisasi({ golongan }: { golongan: string }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const config = konfigLki(golongan)

  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [skpdSiap, setSkpdSiap] = useState(false)
  const [cariKetik, setCariKetik] = useState('')
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState<FilterLembar>('semua')
  const [hal, setHal] = useState(0)

  const [rows, setRows] = useState<BarisLembar[]>([])
  const [adaLagi, setAdaLagi] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [ringkas, setRingkas] = useState<Ringkas | null>(null)
  const [ringkasErr, setRingkasErr] = useState('')
  const [belumTercatat, setBelumTercatat] = useState<InvBaris[]>([])
  const [terbuka, setTerbuka] = useState<Terbuka | null>(null)
  const seq = useRef(0)

  const pengawas = scope.isViewer
  // SkpdCombobox hanya MEMANCARKAN pilihan awal untuk pengguna yang terkunci
  // ke SKPD-nya (non-admin). Admin & pengawas tak pernah menerima pancaran itu,
  // jadi tanpa cabang ini daftarnya tak akan pernah dimuat sama sekali.
  useEffect(() => {
    void fetchApprovalScope(supabase).then(sc => {
      setScope(sc)
      if (sc.isAdmin || sc.isViewer || sc.skpdId == null) setSkpdSiap(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const muat = useCallback(async () => {
    const saya = ++seq.current
    setLoading(true); setErr('')
    try {
      const data = await muatLembar(supabase, {
        golongan, skpdIds, status, cari, limit: PER_HAL + 1, offset: hal * PER_HAL,
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
  }, [golongan, skpdIds, status, cari, hal]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatSamping = useCallback(() => {
    // Ringkasan — di latar, gagal cuma jadi "tak terhitung".
    setRingkas(null); setRingkasErr('')
    muatRingkas(supabase, { tahun: TAHUN, golongan, skpdIds })
      .then(setRingkas)
      .catch(e => setRingkasErr(e instanceof Error ? e.message : String(e)))
    if (skpdId != null) {
      muatBelumTercatat(supabase, { tahun: TAHUN, golongan, skpdId })
        .then(setBelumTercatat)
        .catch(e => setErr(e instanceof Error ? e.message : String(e)))
    } else {
      setBelumTercatat([])
    }
  }, [golongan, skpdIds, skpdId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (skpdSiap) void muat() }, [skpdSiap, muat])
  useEffect(() => { if (skpdSiap) muatSamping() }, [skpdSiap, muatSamping])

  async function buka(r: BarisLembar) {
    setMsg('')
    try {
      const baris: InvBaris = r.inv_id
        ? await muatIsian(supabase, r.inv_id)
        : { id: '', aset_id: r.aset_id, snapshot: snapshotDariLembar(r), jawaban: {}, foto_paths: [] }
      const validasi = r.inv_status === 'divalidasi'
      setTerbuka({
        baris, skpdId: r.skpd_id,
        readOnly: pengawas || validasi,
        pesan: pengawas ? 'Akun pengawas hanya bisa melihat.'
          : validasi ? 'Isian ini sudah divalidasi Pengelola Barang. Untuk mengubahnya, minta Pengelola membatalkan validasinya di menu Validasi.'
          : undefined,
      })
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function bukaBelumTercatat(b: InvBaris | null) {
    if (skpdId == null) return
    const baris: InvBaris = b || { id: '', aset_id: null, snapshot: {}, jawaban: {}, foto_paths: [] }
    const validasi = b?.status === 'divalidasi'
    setTerbuka({
      baris, skpdId, readOnly: pengawas || validasi,
      pesan: validasi ? 'Lembar ini sudah divalidasi Pengelola Barang.' : undefined,
    })
  }

  async function simpan(t: Terbuka, jawaban: InvJawaban, foto: string[]) {
    await simpanIsian(supabase, {
      id: t.baris.id || null, asetId: t.baris.aset_id,
      skpdId: t.baris.aset_id ? null : t.skpdId, golongan, jawaban, foto,
    })
    setMsg(t.baris.aset_id
      ? 'Isian tersimpan — barang ini masuk antrean validasi Pengelola Barang.'
      : 'Lembar BMD Belum Tercatat tersimpan.')
    await muat()
    muatSamping()
  }

  async function hapusBelumTercatat(b: InvBaris) {
    await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus lembar "BMD Belum Tercatat" ini?',
      isi: <>Temuan ini dibuang dari hasil inventarisasi. Daftar Barang tidak tersentuh — barangnya
        memang belum pernah tercatat di sana.</>,
      labelYa: 'Hapus lembar',
      kerjakan: async () => {
        const { error } = await supabase.rpc('fn_inventarisasi_hapus_belum_tercatat', { p_id: b.id })
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Lembar BMD Belum Tercatat dihapus.')
        muatSamping()
      },
    })
  }

  const statusBaris = (r: BarisLembar): StatusTampil => r.inv_status || 'belum'
  const belum = ringkas ? belumDiinventarisasi(ringkas) : null

  return (
    <FormShell
      judul={`Lembar Kerja Inventarisasi — ${config.label}`}
      deskripsi={`Format ${config.format} · Tahun ${TAHUN}. Daftar ini membaca Daftar Barang terkini — pilih barang lalu klik "Isi Inventarisasi". Tak perlu diajukan: Pengelola Barang memvalidasi per barang di menu Validasi.`}
      msg={msg}
    >
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-56 flex-shrink-0">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Unit</label>
            <SkpdCombobox lockToOperator allowClear
              onChangeSelection={sel => {
                setSkpdId(sel.skpdId); setSkpdIds(sel.descendantIds); setHal(0); setSkpdSiap(true)
              }}
              placeholder="Semua SKPD..." />
          </div>
          <form className="flex gap-2 items-end flex-1 min-w-[220px]"
            onSubmit={e => { e.preventDefault(); setCari(cariKetik); setHal(0) }}>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" value={cariKetik} onChange={e => setCariKetik(e.target.value)}
                placeholder="Nama barang, NIBAR, kode register, kode barang, merek, no. polisi..." />
            </div>
            <button type="submit" className="btn-secondary text-sm">Cari</button>
          </form>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select className="select-filter" value={status}
              onChange={e => { setStatus(e.target.value as FilterLembar); setHal(0) }}>
              <option value="semua">Semua barang</option>
              <option value="belum">Belum diinventarisasi</option>
              <option value="diisi">Menunggu validasi</option>
              <option value="divalidasi">Divalidasi</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
          {ringkas ? (
            <>
              <span><b>{ringkas.total_aset.toLocaleString('id-ID')}</b> barang aktif</span>
              <span className="text-gray-500">{(belum ?? 0).toLocaleString('id-ID')} belum diinventarisasi</span>
              <span className="text-amber-700">{ringkas.menunggu.toLocaleString('id-ID')} menunggu validasi</span>
              <span className="text-teal">{ringkas.divalidasi.toLocaleString('id-ID')} divalidasi</span>
            </>
          ) : ringkasErr ? (
            <span className="text-amber-700">Jumlah tak terhitung ({ringkasErr}) — daftarnya tetap bisa dipakai.</span>
          ) : skpdSiap ? (
            <span className="text-gray-400">menghitung jumlah…</span>
          ) : null}
        </div>
        {ringkas && ringkas.berubah > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs">
            🔒 {ringkas.berubah.toLocaleString('id-ID')} barang yang sudah diinventarisasi di sini kini
            pindah SKPD, direklas, atau keluar dari Daftar Barang — hasilnya terkunci di posisi lama.{' '}
            <Link href={`/dashboard/inventarisasi/validasi/${golongan}`} className="underline font-medium">
              Lihat di menu Validasi → Posisi berubah
            </Link>
          </div>
        )}
      </div>

      {skpdId != null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 items-start">
          <div className="card p-4">
            <TimPanel skpdId={skpdId} tahun={TAHUN} bolehUbah={!pengawas} />
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-gray-800">BMD Belum Tercatat (Format III.A.7)</p>
              {!pengawas && (
                <button onClick={() => bukaBelumTercatat(null)} className="btn-primary text-xs">+ Tambah temuan</button>
              )}
            </div>
            {belumTercatat.length === 0 ? (
              <p className="text-xs text-gray-400">Belum ada temuan untuk unit ini.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {belumTercatat.map(b => {
                  const st: StatusTampil = b.status || 'diisi'
                  return (
                    <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-medium text-gray-800">{b.jawaban?.baru?.nama_barang || '(tanpa nama)'}</p>
                        <p className="text-gray-400">{b.jawaban?.baru?.kode_barang || '—'} · {b.jawaban?.baru?.spesifikasi || '—'}</p>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span>
                        <button onClick={() => bukaBelumTercatat(b)} className="text-teal hover:underline font-medium">
                          {st === 'diisi' && !pengawas ? 'Ubah' : 'Lihat'}
                        </button>
                        {st === 'diisi' && !pengawas && (
                          <button onClick={() => hapusBelumTercatat(b)} className="text-red-500 hover:text-red-700">Hapus</button>
                        )}
                        <a href={`/cetak/inventarisasi-lki?id=${b.id}`} target="_blank" rel="noopener noreferrer"
                          className="text-gray-500 hover:text-gray-800">🖨</a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="card overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">Kode / Uraian Barang</th>
                <th className="table-th">Nama Barang / NIBAR</th>
                {config.merekTipe && <th className="table-th">Merek / Tipe</th>}
                <th className="table-th whitespace-nowrap">Tgl Perolehan</th>
                <th className="table-th whitespace-nowrap text-right">Nilai Perolehan</th>
                <th className="table-th whitespace-nowrap">Kondisi Tercatat</th>
                <th className="table-th">Status Inventarisasi</th>
                <th className="table-th whitespace-nowrap text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!skpdSiap || loading ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-10 text-gray-400">
                  {err ? 'Daftar tidak bisa dimuat.' : 'Tidak ada barang untuk filter ini.'}
                </td></tr>
              ) : rows.map(r => {
                const st = statusBaris(r)
                return (
                  <tr key={r.aset_id} className="align-top">
                    <td className="table-td text-xs">
                      <p className="text-gray-700 whitespace-nowrap">{r.kode}</p>
                      <p className="text-gray-400">{r.uraian || '—'}</p>
                    </td>
                    <td className="table-td text-xs">
                      <p className="font-medium text-gray-800">{r.nama_barang || '—'}</p>
                      <p className="text-gray-400 break-all">{r.nibar || '—'}</p>
                      {r.kode_register && <p className="text-gray-400 break-all">REG {r.kode_register}</p>}
                      <p className="text-gray-400">{r.skpd_nama || ''}</p>
                    </td>
                    {config.merekTipe && <td className="table-td text-xs text-gray-600">{r.merek_tipe || '—'}</td>}
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.tgl_perolehan || '—'}</td>
                    <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah2(r.nilai_perolehan || 0)}</td>
                    <td className="table-td text-xs text-gray-500">{normalKondisi(r.kondisi_barang) || '—'}</td>
                    <td className="table-td text-xs">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[st]}`}>
                        {STATUS_LABEL[st]}
                      </span>
                      {st === 'diisi' && r.inv_catatan && (
                        <p className="mt-1 text-[11px] text-red-600">↩ Dikembalikan: {r.inv_catatan}</p>
                      )}
                      <TransaksiSesudah transaksi={r.transaksi_sesudah || []} />
                    </td>
                    <td className="table-td text-xs text-right whitespace-nowrap">
                      <button onClick={() => buka(r)} className="text-teal hover:underline font-medium">
                        {st === 'belum' ? (pengawas ? 'Lihat' : 'Isi Inventarisasi')
                          : st === 'diisi' && !pengawas ? 'Ubah Isian' : 'Lihat'}
                      </button>
                      {r.inv_id && (
                        <a href={`/cetak/inventarisasi-lki?id=${r.inv_id}`} target="_blank" rel="noopener noreferrer"
                          className="ml-3 text-gray-500 hover:text-gray-800" title="Cetak lembar kerja barang ini">🖨</a>
                      )}
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

      {terbuka && (
        <LkiForm
          baris={terbuka.baris}
          config={config}
          golongan={golongan}
          skpdId={terbuka.skpdId}
          readOnly={terbuka.readOnly}
          pesanReadOnly={terbuka.pesan}
          onSimpan={(jawaban, foto) => simpan(terbuka, jawaban, foto)}
          onTutup={() => setTerbuka(null)}
        />
      )}
    </FormShell>
  )
}
