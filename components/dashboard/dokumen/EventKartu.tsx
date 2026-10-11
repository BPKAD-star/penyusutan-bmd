'use client'
// Satu kartu event di bagian 4 Dokumen Sumber: kepala (nama · tanggal · tempat ·
// ringkasan) yang bisa dibuka, lalu daftar MATERI & DOKUMENTASI. Tombol tambah/
// ubah/hapus hanya dirender untuk admin — cerminan RLS, bukan penjaganya.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { hapusEvent, hapusBerkas, bukaBerkasEvent } from '@/lib/eventBidangData'
import {
  berkasEvent, ringkasEvent, hostTautan, type EventBidang, type BerkasEvent, type JenisBerkasEvent,
} from '@/lib/eventBidang'
import { namaFileDariPath } from '@/lib/dokumenStorage'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import EventFormBerkas from './EventFormBerkas'

const pesan = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function EventKartu({ event, isAdmin, terbuka, onToggle, onEdit, onBerubah }: {
  event: EventBidang
  isAdmin: boolean
  terbuka: boolean
  onToggle: () => void
  onEdit: () => void
  /** Dipanggil sesudah tambah/hapus supaya daftar dimuat ulang. */
  onBerubah: () => void
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [form, setForm] = useState<JenisBerkasEvent | null>(null)
  const materi = berkasEvent(event, 'materi')
  const dokumentasi = berkasEvent(event, 'dokumentasi')

  async function buka(b: BerkasEvent) {
    try { await bukaBerkasEvent(supabase, b) } catch (e) { await konfirmasiGagal(konfirmasi, pesan(e), 'Gagal membuka') }
  }

  async function hapusItem(b: BerkasEvent) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: `Hapus ${b.jenis === 'materi' ? 'materi' : 'dokumentasi'} ini?`, subjudul: b.judul,
      isi: b.file_path
        ? <>Berkasnya ikut <b>dibuang dari penyimpanan</b> dan tak bisa dikembalikan.</>
        : <>Hanya tautannya yang dihapus dari daftar; berkas di Drive tidak tersentuh.</>,
      labelYa: 'Hapus',
    })).ya) return
    try { await hapusBerkas(supabase, b); onBerubah() }
    catch (e) { await konfirmasiGagal(konfirmasi, pesan(e), 'Gagal menghapus') }
  }

  async function hapusSemua() {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus event ini?', subjudul: event.nama,
      isi: <>Seluruh <b>{materi.length} materi</b> dan <b>{dokumentasi.length} dokumentasi</b> di dalamnya ikut terhapus
        (berkas unggahan dibuang dari penyimpanan). Berkas di Drive tidak tersentuh.</>,
      labelYa: 'Hapus event',
    })).ya) return
    try { await hapusEvent(supabase, event); onBerubah() }
    catch (e) { await konfirmasiGagal(konfirmasi, pesan(e), 'Gagal menghapus') }
  }

  const baris = (b: BerkasEvent) => (
    <li key={b.id} className="flex items-start justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
      <div className="min-w-0 text-xs">
        <p className="font-medium text-gray-800 break-words">{b.judul}</p>
        {b.keterangan && <p className="text-gray-500 mt-0.5 break-words">{b.keterangan}</p>}
        <p className="text-[11px] text-gray-400 mt-0.5 break-all">
          {b.file_path ? `📎 ${namaFileDariPath(b.file_path)}` : `🔗 ${hostTautan(b.url ?? '')}`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => void buka(b)} className="underline text-teal text-xs hover:opacity-80">
          {b.file_path ? 'Buka berkas' : 'Buka tautan ↗'}
        </button>
        {isAdmin && (
          <button onClick={() => void hapusItem(b)} title="Hapus"
            className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-500 hover:bg-red-600 text-white text-xs">🗑</button>
        )}
      </div>
    </li>
  )

  const bagian = (jenis: JenisBerkasEvent, judul: string, isi: BerkasEvent[], kosong: string) => (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-gray-700">{judul} <span className="text-gray-400 font-normal">({isi.length})</span></h4>
        {isAdmin && form !== jenis && (
          <button className="text-xs text-teal hover:underline" onClick={() => setForm(jenis)}>+ Tambah</button>
        )}
      </div>
      {isi.length === 0 ? <p className="text-xs text-gray-400">{kosong}</p> : <ul className="space-y-2">{isi.map(baris)}</ul>}
      {form === jenis && (
        <EventFormBerkas eventId={event.id} jenis={jenis} onBatal={() => setForm(null)}
          onSelesai={() => { setForm(null); onBerubah() }} />
      )}
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} aria-expanded={terbuka}
        className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm break-words">{event.nama}</p>
          <p className="text-xs text-gray-500 mt-1">
            {tglPanjang(event.tanggal)}{event.tempat ? ` · ${event.tempat}` : ''}
          </p>
          <p className="text-[11px] text-teal mt-1.5 font-medium">{ringkasEvent(event)}</p>
        </div>
        <span className="text-gray-400 text-xs flex-shrink-0 mt-1">{terbuka ? '▲' : '▼'}</span>
      </button>

      {terbuka && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-5">
          {event.keterangan && <p className="text-xs text-gray-600 pt-3 whitespace-pre-line">{event.keterangan}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
            {bagian('materi', 'Materi', materi, 'Belum ada materi.')}
            {bagian('dokumentasi', 'Dokumentasi', dokumentasi, 'Belum ada tautan dokumentasi.')}
          </div>
          {isAdmin && (
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button className="btn-secondary text-xs" onClick={onEdit}>✎ Ubah event</button>
              <button className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white" onClick={() => void hapusSemua()}>🗑 Hapus event</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
