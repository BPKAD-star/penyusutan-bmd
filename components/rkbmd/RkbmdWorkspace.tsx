'use client'
// Shell modul RKBMD: pemilih Tahun Anggaran + SKPD + versi (murni/perubahan),
// tab per 5 jenis, siklus dokumen (buat draft → ajukan → telaah setuju/tolak →
// buka kunci). Form input item per jenis menyusul (Stage 4/5) — di sini item
// ditampilkan read-only. Non-ledger: approve hanya membekukan status.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import ProgramPicker from '@/components/ProgramPicker'
import RkbmdPengadaanForm from '@/components/rkbmd/RkbmdPengadaanForm'
import RkbmdAsetForm from '@/components/rkbmd/RkbmdAsetForm'
import { formatRupiah } from '@/lib/export'
import {
  RKBMD_JENIS, STATUS_META, type RkbmdJenis, type RkbmdVersi,
  type RkbmdHeader, type RkbmdItem,
} from '@/lib/rkbmd'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const HEADER_COLS =
  'id,skpd_id,tahun_anggaran,jenis,versi,parent_id,program,kegiatan,sub_kegiatan,keterangan,status,catatan_telaah,diajukan_at,approved_at,created_at'

export default function RkbmdWorkspace() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [skpd, setSkpd] = useState('')
  const [versi, setVersi] = useState<RkbmdVersi>('murni')
  const [jenis, setJenis] = useState<RkbmdJenis>('pengadaan')

  const [headers, setHeaders] = useState<Record<string, RkbmdHeader>>({}) // key = jenis
  const [items, setItems] = useState<RkbmdItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const header = headers[jenis] as RkbmdHeader | undefined
  const canEditContent = !!header && (header.status === 'draft' || header.status === 'ditolak')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadHeaders = useCallback(async () => {
    if (!skpd) { setHeaders({}); setItems([]); return }
    setLoading(true); setMsg('')
    const { data, error } = await supabase.from('rkbmd').select(HEADER_COLS)
      .eq('skpd_id', Number(skpd)).eq('tahun_anggaran', tahun).eq('versi', versi)
    if (error) setMsg(`Error: ${error.message}`)
    const map: Record<string, RkbmdHeader> = {}
    for (const h of (data || []) as RkbmdHeader[]) map[h.jenis] = h
    setHeaders(map)
    setLoading(false)
  }, [skpd, tahun, versi]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHeaders() }, [loadHeaders])

  const loadItems = useCallback(async (rkbmdId: string | undefined) => {
    if (!rkbmdId) { setItems([]); return }
    const { data } = await supabase.from('rkbmd_item').select('*').eq('rkbmd_id', rkbmdId).order('no_urut')
    setItems((data || []) as RkbmdItem[])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadItems(header?.id) }, [header?.id, loadItems])

  async function buatDokumen() {
    if (!skpd) { setMsg('Error: pilih SKPD dulu.'); return }
    setBusy(true); setMsg('')
    let parent_id: string | null = null
    if (versi === 'perubahan') {
      const { data: murni } = await supabase.from('rkbmd').select('id,status')
        .eq('skpd_id', Number(skpd)).eq('tahun_anggaran', tahun).eq('jenis', jenis).eq('versi', 'murni').maybeSingle()
      if (!murni || (murni as { status: string }).status !== 'disetujui') {
        setMsg('Error: Perubahan RKBMD hanya bisa dibuat setelah RKBMD murni jenis ini DISETUJUI.')
        setBusy(false); return
      }
      parent_id = (murni as { id: string }).id
    }
    const { error } = await supabase.from('rkbmd').insert({
      skpd_id: Number(skpd), tahun_anggaran: tahun, jenis, versi, parent_id, status: 'draft',
    })
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Dokumen RKBMD dibuat (draft).'); await loadHeaders() }
    setBusy(false)
  }

  async function patchHeader(patch: Partial<RkbmdHeader>, okMsg: string) {
    if (!header) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('rkbmd').update(patch).eq('id', header.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg(okMsg); await loadHeaders() }
    setBusy(false)
  }

  async function hapusDokumen() {
    if (!header) return
    if (!confirm('Hapus dokumen RKBMD ini beserta seluruh itemnya? (hanya untuk draft)')) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('rkbmd').delete().eq('id', header.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Dokumen dihapus.'); await loadHeaders() }
    setBusy(false)
  }

  function tolak() {
    const alasan = prompt('Catatan penolakan / telaah (akan dikirim ke SKPD):')
    if (alasan === null) return
    patchHeader({ status: 'ditolak', catatan_telaah: alasan || null }, 'RKBMD ditolak & dikembalikan.')
  }

  return (
    <FormShell
      judul="RKBMD"
      deskripsi="Rencana Kebutuhan Barang Milik Daerah — perencanaan tahun anggaran berikutnya (Permendagri 19/2016 jo. 7/2024)."
      msg={msg}
    >
      {/* Filter */}
      <div className="card p-5 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
            <input type="number" className="select-filter w-28" value={tahun}
              onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
          </div>
          <div className="min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Lokasi</label>
            <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Versi</label>
            <select className="select-filter" value={versi} onChange={e => setVersi(e.target.value as RkbmdVersi)}>
              <option value="murni">RKBMD (murni)</option>
              <option value="perubahan">Perubahan RKBMD</option>
            </select>
          </div>
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai menyusun RKBMD.</div>
      ) : (
        <>
          {/* Tabs jenis */}
          <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
            {RKBMD_JENIS.map(j => {
              const h = headers[j.key]
              const active = jenis === j.key
              return (
                <button key={j.key} onClick={() => setJenis(j.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    active ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {j.label}
                  {h && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${STATUS_META[h.status].cls}`}>
                    {STATUS_META[h.status].label}
                  </span>}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : !header ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-gray-500 mb-1">{RKBMD_JENIS.find(j => j.key === jenis)!.deskripsi}</p>
              <p className="text-xs text-gray-400 mb-4">
                Belum ada dokumen {versi === 'perubahan' ? 'Perubahan ' : ''}RKBMD {jenis} untuk SKPD ini, TA {tahun}.
              </p>
              <button className="btn-primary" onClick={buatDokumen} disabled={busy}>
                {busy ? 'Membuat...' : `Buat RKBMD ${RKBMD_JENIS.find(j => j.key === jenis)!.label}`}
              </button>
            </div>
          ) : (
            <DokumenPanel
              header={header} items={items} isAdmin={isAdmin} busy={busy} canEditContent={canEditContent}
              reloadItems={() => loadItems(header.id)}
              onSaveHeader={patchHeader} onAjukan={() => patchHeader({ status: 'diajukan' }, 'RKBMD diajukan untuk ditelaah.')}
              onTarik={() => patchHeader({ status: 'draft' }, 'Pengajuan ditarik kembali ke draft.')}
              onSetujui={() => patchHeader({ status: 'disetujui' }, 'RKBMD disetujui & ditetapkan.')}
              onTolak={tolak} onBukaKunci={() => patchHeader({ status: 'draft' }, 'Kunci dibuka — dokumen kembali ke draft.')}
              onHapus={hapusDokumen}
            />
          )}
        </>
      )}
    </FormShell>
  )
}

// ── Panel satu dokumen RKBMD ──────────────────────────────────────────────
function DokumenPanel({
  header, items, isAdmin, busy, canEditContent, reloadItems,
  onSaveHeader, onAjukan, onTarik, onSetujui, onTolak, onBukaKunci, onHapus,
}: {
  header: RkbmdHeader; items: RkbmdItem[]; isAdmin: boolean; busy: boolean; canEditContent: boolean
  reloadItems: () => void
  onSaveHeader: (patch: Partial<RkbmdHeader>, okMsg: string) => void
  onAjukan: () => void; onTarik: () => void; onSetujui: () => void
  onTolak: () => void; onBukaKunci: () => void; onHapus: () => void
}) {
  const supabase = createClient()
  const [program, setProgram] = useState(header.program || '')
  const [kegiatan, setKegiatan] = useState(header.kegiatan || '')
  const [subKeg, setSubKeg] = useState(header.sub_kegiatan || '')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<RkbmdItem | null>(null)
  useEffect(() => {
    setProgram(header.program || ''); setKegiatan(header.kegiatan || ''); setSubKeg(header.sub_kegiatan || '')
  }, [header.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShowForm(false); setEditItem(null) }, [header.id])

  const canAddItem = canEditContent // semua jenis sudah didukung
  const formOpen = showForm || !!editItem

  async function hapusItem(it: RkbmdItem) {
    if (!confirm(`Hapus item ${it.kode || it.nama_barang || ''}?`)) return
    await supabase.from('rkbmd_item').delete().eq('id', it.id)
    reloadItems()
  }

  const total = items.reduce((s, it) => s + (it.total_anggaran || 0), 0)

  return (
    <div className="space-y-4">
      {/* Status + aksi siklus */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_META[header.status].cls}`}>
            {STATUS_META[header.status].label}
          </span>
          <span className="text-xs text-gray-400">{items.length} item · Total {formatRupiah(total)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {header.status === 'draft' && (
            <>
              <button className="btn-primary" onClick={onAjukan} disabled={busy || items.length === 0}
                title={items.length === 0 ? 'Tambah item dulu sebelum diajukan' : undefined}>Ajukan</button>
              <button className="text-sm text-red-500 hover:text-red-700 px-2" onClick={onHapus} disabled={busy}>Hapus dokumen</button>
            </>
          )}
          {header.status === 'diajukan' && (
            <>
              {!isAdmin && <button className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200" onClick={onTarik} disabled={busy}>Tarik kembali</button>}
              {isAdmin && <>
                <button className="btn-primary" onClick={onSetujui} disabled={busy}>Setujui</button>
                <button className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200" onClick={onTolak} disabled={busy}>Tolak</button>
              </>}
            </>
          )}
          {header.status === 'disetujui' && isAdmin && (
            <button className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200" onClick={onBukaKunci} disabled={busy}>Buka Kunci</button>
          )}
          {header.status === 'ditolak' && (
            <button className="btn-primary" onClick={onAjukan} disabled={busy || items.length === 0}>Ajukan ulang</button>
          )}
        </div>
      </div>

      {header.status === 'ditolak' && header.catatan_telaah && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <span className="font-medium">Catatan telaah:</span> {header.catatan_telaah}
        </div>
      )}

      {/* Program / Kegiatan / Sub Kegiatan — khusus Pengadaan (Pasal 28 ayat 4).
          Sejak 2026-08-10 DIPILIH dari master `admin_program` lewat ProgramPicker,
          bukan diketik bebas: nomenklatur Kepmendagri 050 harus persis supaya
          RKBMD bisa disandingkan dengan dokumen anggaran. Sub kegiatan ikut —
          kolomnya baru ada di `rkbmd` sejak migrasi 20260810_01. Tersusun ke
          BAWAH (bukan dua kolom) karena uraiannya panjang-panjang. */}
      {header.jenis === 'pengadaan' && (
        <div className="card p-4 max-w-3xl space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Program / Kegiatan / Sub Kegiatan</h3>
          {canEditContent ? (
            <>
              <ProgramPicker program={program} kegiatan={kegiatan} subKeg={subKeg}
                onChange={sel => { setProgram(sel.program); setKegiatan(sel.kegiatan); setSubKeg(sel.sub_kegiatan) }} />
              <button className="text-sm text-teal hover:underline" disabled={busy}
                onClick={() => onSaveHeader(
                  { program: program || null, kegiatan: kegiatan || null, sub_kegiatan: subKeg || null },
                  'Program / kegiatan / sub kegiatan disimpan.')}>
                Simpan program/kegiatan
              </button>
            </>
          ) : (
            <div className="space-y-1 text-xs">
              <p><span className="text-gray-400">Program</span> : <span className="text-gray-700">{header.program || '—'}</span></p>
              <p><span className="text-gray-400">Kegiatan</span> : <span className="text-gray-700">{header.kegiatan || '—'}</span></p>
              <p><span className="text-gray-400">Sub Kegiatan</span> : <span className="text-gray-700">{header.sub_kegiatan || '—'}</span></p>
            </div>
          )}
          {/* Total anggaran seluruh item dokumen ini = total untuk satu sub
              kegiatan, karena 1 dokumen RKBMD = 1 sub kegiatan. */}
          <div className="rounded-lg bg-teal/5 border border-teal/20 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-gray-600">Total anggaran program ini ({items.length} item)</span>
            <span className="text-base font-semibold text-gray-900">{formatRupiah(total)}</span>
          </div>
        </div>
      )}

      {/* Form tambah/edit item per jenis */}
      {canAddItem && formOpen && (
        header.jenis === 'pengadaan' ? (
          <RkbmdPengadaanForm
            rkbmdId={header.id} skpdId={header.skpd_id} tahun={header.tahun_anggaran} editItem={editItem}
            onSaved={() => { setShowForm(false); setEditItem(null); reloadItems() }}
            onCancel={() => { setShowForm(false); setEditItem(null) }}
          />
        ) : (
          <RkbmdAsetForm
            jenis={header.jenis} rkbmdId={header.id} skpdId={header.skpd_id} editItem={editItem}
            onSaved={() => { setShowForm(false); setEditItem(null); reloadItems() }}
            onCancel={() => { setShowForm(false); setEditItem(null) }}
          />
        )
      )}

      {/* Daftar item */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Daftar Item</h3>
          {canAddItem
            ? (!formOpen && <button className="btn-primary text-xs py-1.5" onClick={() => { setEditItem(null); setShowForm(true) }}>+ Tambah Item</button>)
            : (header.status === 'disetujui' && <span className="text-xs text-gray-400">Terkunci — sudah disetujui</span>)}
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Belum ada item.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th">No</th>
                  <th className="table-th">Kode</th>
                  <th className="table-th">Nama Barang</th>
                  <th className="table-th text-right">Ringkasan</th>
                  <th className="table-th">Keterangan</th>
                  {canAddItem && <th className="table-th">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="table-td text-xs">{it.no_urut ?? i + 1}</td>
                    <td className="table-td text-xs">{it.kode || it.nibar || '—'}</td>
                    <td className="table-td text-xs text-gray-700">{it.nama_barang || '—'}</td>
                    <td className="table-td text-xs text-right">{ringkasItem(header.jenis, it)}</td>
                    <td className="table-td text-xs text-gray-500">{it.keterangan || '—'}</td>
                    {canAddItem && (
                      <td className="table-td whitespace-nowrap">
                        <button onClick={() => { setEditItem(it); setShowForm(false) }} className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => hapusItem(it)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ringkasItem(jenis: RkbmdJenis, it: RkbmdItem): string {
  switch (jenis) {
    case 'pengadaan':
      return `${it.jumlah_kebutuhan ?? 0} ${it.satuan || ''} · ${formatRupiah(it.total_anggaran)}`
    case 'pemeliharaan':
      return formatRupiah(it.total_anggaran)
    case 'pemanfaatan':
      return [it.bentuk, it.jangka_waktu].filter(Boolean).join(' · ') || '—'
    case 'pemindahtanganan':
      return [it.bentuk, formatRupiah(it.nilai_perolehan)].filter(Boolean).join(' · ')
    case 'penghapusan':
      return formatRupiah(it.nilai_perolehan)
    default:
      return '—'
  }
}
