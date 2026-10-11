'use client'
// Isi bagian 4 "Event" di halaman Dokumen Sumber: arsip event yang diselenggarakan
// Bidang Pengelolaan BMD — tiap event berisi materi & tautan dokumentasi (Drive).
// Semua pengguna login boleh melihat; tambah/ubah/hapus hanya admin (RLS
// `be_*`/`beb_*`, tombolnya cuma cerminan). Aturan & lapisan data:
// lib/eventBidang.ts, lib/eventBidangData.ts. Migrasi 20261011_01.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { muatEvent, simpanEvent } from '@/lib/eventBidangData'
import { daftarTahunEvent, tahunEvent, type EventBidang } from '@/lib/eventBidang'
import { useAsyncData } from '@/shared/ui/useAsyncData'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import EventKartu from './EventKartu'

const pesan = (e: unknown) => (e instanceof Error ? e.message : String(e))
const hariIni = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function EventSection({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const { data, loading, error, run } = useAsyncData<EventBidang[]>()
  const [tahun, setTahun] = useState<number | null>(null)
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nama, setNama] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [tempat, setTempat] = useState('')
  const [ket, setKet] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const muat = useCallback(
    () => run(() => muatEvent(supabase)),
    [run], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => { void muat() }, [muat])

  const tahunList = useMemo(() => daftarTahunEvent(data ?? []), [data])
  const tampil = useMemo(
    () => (data ?? []).filter(e => tahun === null || tahunEvent(e.tanggal) === tahun),
    [data, tahun],
  )
  // Tahun terpilih yang event-nya sudah terhapus semua → kembali ke "Semua",
  // bukan daftar kosong yang terbaca "eventnya hilang".
  useEffect(() => {
    if (tahun !== null && data && !tahunList.includes(tahun)) setTahun(null)
  }, [data, tahun, tahunList])

  function bukaForm(e?: EventBidang) {
    setErr('')
    setEditId(e?.id ?? null)
    setNama(e?.nama ?? ''); setTanggal(e?.tanggal ?? hariIni())
    setTempat(e?.tempat ?? ''); setKet(e?.keterangan ?? '')
    setFormOpen(true)
  }
  const tutupForm = () => { setFormOpen(false); setEditId(null); setErr('') }

  async function simpan() {
    if (!nama.trim()) { setErr('Nama event wajib diisi.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) { setErr('Tanggal event wajib diisi.'); return }
    setErr(''); setSaving(true)
    try {
      await simpanEvent(supabase, editId, { nama, tanggal, tempat, keterangan: ket })
      tutupForm()
      await muat()
    } catch (e) {
      await konfirmasiGagal(konfirmasi, pesan(e))
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: string) => setTerbuka(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tahunList.length > 1 && (
            <>
              <ChipTahun aktif={tahun === null} onClick={() => setTahun(null)}>Semua</ChipTahun>
              {tahunList.map(t => <ChipTahun key={t} aktif={tahun === t} onClick={() => setTahun(t)}>{t}</ChipTahun>)}
            </>
          )}
        </div>
        {isAdmin && !formOpen && <button className="btn-primary text-xs" onClick={() => bukaForm()}>+ Tambah Event</button>}
      </div>

      {formOpen && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">{editId ? 'Ubah event' : 'Event baru'}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Nama event</label>
              <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)}
                placeholder="mis. Bimtek Penatausahaan BMD Semester I 2026" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tanggal</label>
              <input type="date" className="select-filter w-full" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tempat (opsional)</label>
            <input className="select-filter w-full" value={tempat} onChange={e => setTempat(e.target.value)} placeholder="mis. Aula Setda Kab. Kediri" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan (opsional)</label>
            <textarea className="select-filter w-full" rows={2} value={ket} onChange={e => setKet(e.target.value)}
              placeholder="mis. Peserta: pengurus barang seluruh SKPD" />
          </div>
          {!editId && <p className="text-[11px] text-gray-400">Materi dan tautan dokumentasi ditambahkan sesudah event tersimpan.</p>}
          {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary text-xs" onClick={tutupForm} disabled={saving}>Batal</button>
            <button className="btn-primary text-xs" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="card p-6 text-center text-gray-400 text-sm">Memuat...</div>
      ) : error ? (
        <div className="card p-4 text-xs text-red-600" role="alert">Gagal memuat event: {error}</div>
      ) : tampil.length === 0 ? (
        <div className="card p-6 text-center text-gray-400 text-sm">
          {data && data.length > 0 ? 'Tidak ada event di tahun ini.' : isAdmin ? 'Belum ada event. Klik "+ Tambah Event" untuk mencatat yang pertama.' : 'Belum ada event.'}
        </div>
      ) : (
        <div className="space-y-3">
          {tampil.map(e => (
            <EventKartu key={e.id} event={e} isAdmin={isAdmin} terbuka={terbuka.has(e.id)}
              onToggle={() => toggle(e.id)} onEdit={() => bukaForm(e)} onBerubah={() => void muat()} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChipTahun({ aktif, onClick, children }: { aktif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        aktif ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:border-teal'
      }`}>{children}</button>
  )
}
