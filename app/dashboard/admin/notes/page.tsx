'use client'
// Notes — saran & masukan tentang aplikasi (permintaan user 2026-08-16).
//
// Sengaja SESEDERHANA MUNGKIN: tulis lalu simpan, tidak ada alur ajukan/telaah/
// setujui. Begitu masukan butuh diajukan, orang berhenti mengirimkannya — dan
// yang paling berguna justru keluhan kecil yang tak akan pernah ditulis kalau
// harus lewat prosedur.
//
// Siapa melihat apa (ditegakkan RLS, migrasi 20260816_01 — bukan oleh layar ini):
//   · admin  → SELURUH catatan semua SKPD, jadi satu daftar
//   · lainnya → catatannya sendiri saja
// ⚠️ Catatan seorang operator TIDAK terlihat oleh rekan se-SKPD-nya. Itu
// disengaja: masukan tentang aplikasi sering menyinggung cara kerja unitnya
// sendiri, dan yang bisa dibaca sebelah meja akan ditulis setengah hati.
// Kalau suatu saat diminta se-SKPD, yang diubah policy `notes_select`-nya.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import CariBox from '@/components/admin/CariBox'
import { cocokCari } from '@/lib/cari'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'

type Note = {
  id: string
  author_id: string | null
  skpd_id: number | null
  penulis: string | null
  skpd_nama: string | null
  isi: string
  created_at: string
  updated_at: string
  selesai: boolean
  selesai_at: string | null
}

const COLS = 'id,author_id,skpd_id,penulis,skpd_nama,isi,created_at,updated_at,selesai,selesai_at'

/** "16 Agu 2026, 14.05" — tanggal saja tak cukup, dalam satu hari bisa ada
 *  beberapa catatan dan urutannya jadi tak terbaca. */
function waktu(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function NotesPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [tulis, setTulis] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editIsi, setEditIsi] = useState('')
  const [cari, setCari] = useState('')

  // ⚠️ Seluruh badan di dalam try, `setLoading(false)` di FINALLY, dan error
  // DITAMPILKAN — aturan baku repo ini (rules.md §2.2). Daftar kosong yang
  // sebenarnya "query gagal" akan terbaca sebagai "belum ada catatan", lalu
  // orang menulis ulang catatan yang sudah pernah dikirim.
  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const [sc, res] = await Promise.all([
        fetchApprovalScope(supabase),
        supabase.from('admin_notes').select(COLS).order('created_at', { ascending: false }).limit(1000),
      ])
      if (res.error) throw new Error(res.error.message)
      setScope(sc)
      setNotes((res.data || []) as unknown as Note[])
    } catch (e) {
      setErr(`Gagal memuat catatan: ${(e as Error).message}`)
      setNotes([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function jalankan(fn: () => Promise<void>, sukses: string) {
    setBusy(true); setErr(''); setMsg('')
    try {
      await fn()
      setMsg(sukses)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function simpanBaru() {
    const isi = tulis.trim()
    if (!isi) return
    await jalankan(async () => {
      // `author_id` WAJIB dikirim: policy `notes_insert` memeriksanya, dan
      // trigger menimpanya dengan auth.uid() supaya tak bisa dipalsukan.
      // `.select()` juga wajib — insert yang ditolak RLS TIDAK melempar,
      // ia cuma mengembalikan 0 baris.
      const { data, error } = await supabase.from('admin_notes')
        .insert({ isi, author_id: scope.userId }).select('id')
      if (error) throw new Error(`gagal menyimpan catatan: ${error.message}`)
      if (!data || data.length === 0) throw new Error('Catatan ditolak database — coba muat ulang halaman lalu masuk lagi.')
      setTulis('')
    }, 'Catatan tersimpan. Terima kasih atas masukannya.')
  }

  async function simpanEdit(id: string) {
    const isi = editIsi.trim()
    if (!isi) return
    await jalankan(async () => {
      const { data, error } = await supabase.from('admin_notes')
        .update({ isi }).eq('id', id).select('id')
      if (error) throw new Error(`gagal memperbarui catatan: ${error.message}`)
      if (!data || data.length === 0) throw new Error('Perubahan ditolak — catatan ini bukan milikmu.')
      setEditId(null)
    }, 'Catatan diperbarui.')
  }

  // ⚠️ Lewat RPC (fn_admin_notes_tandai), BUKAN `.update()` langsung ke tabel —
  // policy `notes_update` membatasi UPDATE hanya utk penulis sendiri (keputusan
  // 2026-08-16: admin sekalipun tidak boleh menyunting isi catatan orang lain).
  // "Selesai" itu status alur kerja ADMIN, bukan isi catatan, jadi jalannya
  // sendiri lewat RPC yang cuma menyentuh dua kolom ini & mengecek fn_is_admin()
  // di sisi server (bukan cuma disembunyikan di layar).
  async function tandaiSelesai(n: Note, selesai: boolean) {
    await jalankan(async () => {
      const { error } = await supabase.rpc('fn_admin_notes_tandai', { p_id: n.id, p_selesai: selesai })
      if (error) throw new Error(`gagal menandai status: ${error.message}`)
    }, selesai ? 'Ditandai selesai.' : 'Tanda selesai dibatalkan.')
  }

  async function hapus(n: Note) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus catatan ini?',
      subjudul: [n.penulis, n.skpd_nama].filter(Boolean).join(' · ') || undefined,
      isi: <>Masukan yang sudah dihapus tak bisa dipulihkan.</>,
      labelYa: 'Hapus catatan',
    })).ya) return
    await jalankan(async () => {
      const { data, error } = await supabase.from('admin_notes').delete().eq('id', n.id).select('id')
      if (error) throw new Error(`gagal menghapus catatan: ${error.message}`)
      if (!data || data.length === 0) throw new Error('Penghapusan ditolak — catatan ini di luar wewenangmu.')
    }, 'Catatan dihapus.')
  }

  // Kotak Cari hanya berguna di tampilan admin (banyak SKPD jadi satu daftar).
  const tampil = useMemo(
    () => (scope.isAdmin ? notes.filter(n => cocokCari(cari, [n.penulis, n.skpd_nama, n.isi])) : notes),
    [notes, cari, scope.isAdmin]
  )

  const milikSendiri = (n: Note) => scope.userId != null && n.author_id === scope.userId

  return (
    <FormShell
      judul="Notes"
      deskripsi={scope.isAdmin
        ? 'Saran & masukan dari seluruh SKPD tentang aplikasi ini, terkumpul jadi satu.'
        : 'Tulis saran & masukan Anda tentang aplikasi ini. Tidak perlu diajukan — cukup disimpan, dan langsung terbaca Pengelola Barang.'}
      msg={msg}
    >
      {err && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {/* Kotak tulis ada untuk SEMUA, admin sekalipun — admin juga pemakai
          aplikasi ini dan punya catatannya sendiri. */}
      <div className="card p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Tulis catatan</label>
        <p className="text-xs text-gray-400 mb-2">
          Apa yang menyulitkan, apa yang keliru, apa yang Anda harap ada. Sebutkan menunya
          supaya mudah ditelusuri.
        </p>
        <textarea
          className="select-filter w-full min-h-[110px] leading-relaxed"
          value={tulis}
          onChange={e => setTulis(e.target.value)}
          placeholder="mis. Di menu Daftar Barang, kolom Lokasi sering kosong padahal di GIS sudah diisi..."
        />
        <div className="flex items-center justify-end gap-3 mt-3">
          <span className="text-xs text-gray-400">{tulis.trim().length} karakter</span>
          <button className="btn-primary" onClick={simpanBaru} disabled={busy || tulis.trim() === ''}>
            {busy ? 'Menyimpan...' : 'Simpan catatan'}
          </button>
        </div>
      </div>

      {scope.isAdmin && notes.length > 0 && (
        <div className="card p-4 mb-4">
          <CariBox nilai={cari} onChange={setCari} jumlah={tampil.length} total={notes.length}
            satuan="catatan" placeholder="Cari penulis, SKPD, atau isi catatan..." />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">
            {scope.isAdmin ? 'Semua catatan' : 'Catatan Anda'}
          </p>
          <span className="text-xs text-gray-400">{notes.length} catatan</span>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-gray-400">Memuat...</p>
        ) : tampil.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            {notes.length === 0
              ? (scope.isAdmin ? 'Belum ada catatan masuk dari SKPD mana pun.' : 'Anda belum menulis catatan.')
              : `Tidak ada catatan yang cocok dengan "${cari}".`}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tampil.map(n => (
              <li key={n.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1.5">
                  {/* Identitas penulis dari SNAPSHOT, bukan join ke profil hari
                      ini — lihat alasannya di migrasi 20260816_01. */}
                  <span className="text-sm font-medium text-gray-800">{n.penulis || 'Tanpa nama'}</span>
                  {n.skpd_nama && <span className="text-xs text-gray-500">· {n.skpd_nama}</span>}
                  <span className="text-xs text-gray-400">· {waktu(n.created_at)}</span>
                  {n.updated_at !== n.created_at && (
                    <span className="text-[11px] text-gray-400 italic" title={`Disunting ${waktu(n.updated_at)}`}>
                      (disunting)
                    </span>
                  )}
                  {n.selesai && (
                    <span className="text-[11px] font-medium text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                      ✓ Ditangani{n.selesai_at ? ` · ${waktu(n.selesai_at)}` : ''}
                    </span>
                  )}
                </div>

                {editId === n.id ? (
                  <div>
                    <textarea className="select-filter w-full min-h-[90px] leading-relaxed"
                      value={editIsi} onChange={e => setEditIsi(e.target.value)} />
                    <div className="flex justify-end gap-2 mt-2">
                      <button className="btn-secondary text-xs" onClick={() => setEditId(null)} disabled={busy}>Batal</button>
                      <button className="btn-primary text-xs" onClick={() => simpanEdit(n.id)}
                        disabled={busy || editIsi.trim() === ''}>Simpan</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* `whitespace-pre-wrap`: orang menulis masukan bernomor &
                        berparagraf; tanpa ini semuanya luruh jadi satu blok. */}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.isi}</p>
                    <div className="flex gap-3 mt-2">
                      {milikSendiri(n) && (
                        <button className="text-xs text-gray-500 hover:text-gray-700" disabled={busy}
                          onClick={() => { setEditId(n.id); setEditIsi(n.isi) }}>✎ Ubah</button>
                      )}
                      {/* Admin boleh menghapus catatan siapa pun (membersihkan
                          yang sudah ditindaklanjuti), tapi TIDAK boleh
                          menyuntingnya — lihat policy `notes_update`. */}
                      {(milikSendiri(n) || scope.isAdmin) && (
                        <button className="text-xs text-red-500 hover:text-red-700" disabled={busy}
                          onClick={() => hapus(n)}>🗑 Hapus</button>
                      )}
                      {/* Menandai "selesai" itu wewenang admin (yang menindak-
                          lanjuti masukan), bukan penulis catatan — RLS-nya lihat
                          fn_admin_notes_tandai di migrasi 20260905_01. */}
                      {scope.isAdmin && (
                        <button className={`text-xs ${n.selesai ? 'text-gray-500 hover:text-gray-700' : 'text-teal hover:opacity-80'}`}
                          disabled={busy} onClick={() => tandaiSelesai(n, !n.selesai)}>
                          {n.selesai ? '↩ Batal Tertangani' : '✓ Tandai Selesai'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormShell>
  )
}
