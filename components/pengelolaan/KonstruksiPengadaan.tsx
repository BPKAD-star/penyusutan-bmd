'use client'
// Pekerjaan Konstruksi — sub-mode di Pengadaan Entry Manual.
//
// MODEL PAKET (keputusan user 2026-10-07; rancangan docs/kdp-per-termin-plan.md):
// 1 kartu jurnal_header (kategori 'konstruksi') = SATU PAKET PEKERJAAN dalam
// SATU tahun anggaran, berisi:
//   · daftar KONTRAK per komponen (perencanaan/fisik/pengawasan/biaya umum),
//   · barang KDP (1.3.6) — tiap barang = satu aset,
//   · TERMIN per barang, tiap termin menunjuk satu kontrak & berstatus sendiri.
// Termin DISETUJUI SATU PER SATU oleh admin pemda: termin pertama sebuah barang
// menerbitkan barangnya (NIBAR terbit sekali), berikutnya menambah nilai. Salah
// catat → BATAL termin itu saja. Tak ada lagi "Setujui Kontrak" / "Buka Kunci"
// satu kartu penuh. Status kartu DITURUNKAN dari terminnya.
// Penegak: RPC fn_kdp_setujui_termin/fn_kdp_batal_termin/fn_kdp_batal_semua +
// trigger fn_kdp_kartu_guard (migrasi 20261007_03).
import { useCallback, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import AsetPicker, { type AsetRingkas } from '@/components/AsetPicker'
import EditSpesifikasiModal from './EditSpesifikasiModal'
import PreviewKonstruksiModal from './PreviewKonstruksiModal'
import { formatRupiah2 } from '@/lib/export'
import { KDP_KONSTRUKSI_FIELDS, ASET_FIELD_COLS, ASET_NUM_COLS, angkaKolomAset } from '@/lib/asetFields'
import {
  barangKdpList, namaBarangKdp, kekuranganNamaKdp, ringkasBarangKdp, statusKartuKdp, adaTerminMenunggu,
  normalisasiKartuKdp, tahunKartuKdp, komponenLabelKdp, newIdKdp,
  type KontrakKonstruksiPayload, type PembayaranKdp, type BarangKdp, type KapInfo, type KontrakKdp,
} from '@/lib/kdp'
import { setujuiTerminKdp, batalTerminKdp, batalSemuaTerminKdp } from '@/lib/kdpAksi'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope } from '@/lib/roles'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi, konfirmasiGagal } from '@/shared/ui/konfirmasi'
import { KontrakKdpSection } from './konstruksi/KontrakKdpSection'
import { CreateKartu, EditKartuModal } from './konstruksi/KartuPaketForm'
import { BarangKdpCard, Baris } from './konstruksi/BarangKdpCard'

export type Kontrak = { id: string; skpd_id: number; no_sk: string; tanggal: string; approval_status: string; payload: KontrakKonstruksiPayload; created_by: string | null }

const FIELDS_KDP = KDP_KONSTRUKSI_FIELDS
const barangTotal = (b: BarangKdp) => (b.pembayaran || []).reduce((s, x) => s + Number(x.nominal || 0), 0)
/** Σ seluruh termin kartu (menunggu + disetujui) — angka rencana paket. */
export const kontrakTotal = (p: KontrakKonstruksiPayload) => barangKdpList(p).reduce((s, b) => s + barangTotal(b), 0)

// Loader bersama (daftar internal & PengadaanEntry). 'ditolak' = diarsipkan.
// Kartu sebelum model paket dinormalisasi DI MEMORI (lib/kdp.ts) — tersimpan
// begitu kartu itu disunting.
export async function fetchKonstruksiKontraks(supabase: ReturnType<typeof createClient>, skpdId: string | number): Promise<Kontrak[]> {
  if (!skpdId) return []
  const { data, error } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,approval_status,payload,created_by')
    .eq('kategori', 'konstruksi').eq('skpd_id', Number(skpdId)).order('created_at', { ascending: false })
  if (error) throw new Error(`gagal membaca kartu Pekerjaan Konstruksi: ${error.message}`)
  return ((data || []) as Kontrak[]).filter(k => k.approval_status !== 'ditolak')
    .map(k => ({ ...k, payload: normalisasiKartuKdp(k.payload || ({} as KontrakKonstruksiPayload), k).payload }))
}

// ── "Menambah masa manfaat aset yang sudah tercatat?" — INFO per barang KDP ──
function KapInfoPicker({ skpdId, value, onChange }: {
  skpdId: number; value: KapInfo | null | undefined; onChange: (v: KapInfo | null) => void
}) {
  const menambah = !!value?.menambah
  const [golongan, setGolongan] = useState('')
  const [target, setTarget] = useState<AsetRingkas | null>(null)
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Menambah masa manfaat aset yang sudah tercatat? <span className="text-gray-400">(info — reklas & kapitalisasi tetap manual nanti)</span></label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={!menambah} onChange={() => { onChange(null); setGolongan(''); setTarget(null) }} /> Tidak</label>
        <label className="flex items-center gap-1"><input type="radio" checked={menambah} onChange={() => onChange({ menambah: true, target_aset_id: value?.target_aset_id ?? null, target_nama: value?.target_nama ?? null })} /> Ya</label>
      </div>
      {menambah && (
        <div className="mt-2 space-y-2">
          {value?.target_aset_id ? (
            <div className="flex items-center justify-between gap-3 p-2 bg-teal/5 border border-teal/30 rounded-lg text-sm">
              <span className="text-gray-800">{value.target_nama || '(aset terpilih)'}</span>
              <button type="button" className="text-xs text-teal hover:underline flex-shrink-0"
                onClick={() => { onChange({ menambah: true, target_aset_id: null, target_nama: null }); setTarget(null) }}>Ganti</button>
            </div>
          ) : (
            <>
              <select className="select-filter w-full" value={golongan} onChange={e => { setGolongan(e.target.value); setTarget(null) }}>
                <option value="">— pilih jenis aset induk —</option>
                <option value="1.3.3">Gedung dan Bangunan</option>
                <option value="1.3.4">Jalan, Irigasi dan Jaringan</option>
              </select>
              {golongan && (
                <AsetPicker selected={target} skpdId={skpdId} kodePrefix={golongan}
                  onSelect={a => { setTarget(a); onChange(a ? { menambah: true, target_aset_id: a.id, target_nama: a.nama_barang } : null) }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function KonstruksiPengadaan({ skpdProp, embedded, startCreate, openId, onExit, onDataChange, hideAdd }: {
  skpdProp?: string; embedded?: boolean
  startCreate?: boolean; openId?: string; onExit?: () => void
  onDataChange?: () => void
  hideAdd?: boolean
} = {}) {
  const supabase = createClient()
  const onDataChangeRef = useRef(onDataChange)
  onDataChangeRef.current = onDataChange
  // Setujui & batal termin = ADMIN PEMDA SAJA (keputusan user 2026-10-07).
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [skpdInternal, setSkpdInternal] = useState('')
  const skpd = skpdProp !== undefined ? skpdProp : skpdInternal
  const [list, setList] = useState<Kontrak[]>([])
  const [selected, setSelected] = useState<Kontrak | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { void (async () => setScope(await fetchApprovalScope(supabase)))() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (skpdId: string) => {
    if (!skpdId) { setList([]); return }
    try { setList(await fetchKonstruksiKontraks(supabase, skpdId)) }
    catch (e) { setMsg(`Error: ${(e as Error).message}`) }
    onDataChangeRef.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(skpd); setSelected(null); setShowCreate(false) }, [skpd, load])
  useEffect(() => { if (openId) { const found = list.find(k => k.id === openId); if (found) setSelected(found) } }, [openId, list])

  const refreshSelected = async () => {
    if (!selected) return
    const { data, error } = await supabase.from('jurnal_header').select('id,skpd_id,no_sk,tanggal,approval_status,payload,created_by').eq('id', selected.id).single()
    if (error) { setMsg(`Error: gagal memuat ulang kartu: ${error.message}`); return }
    if (data) { const k = data as Kontrak; setSelected({ ...k, payload: normalisasiKartuKdp(k.payload, k).payload }) }
  }

  if (onExit) {
    return (
      <div className="space-y-4">
        {msg && <div className={`p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}
        {selected ? (
          <KontrakDetail kontrak={selected} isAdmin={scope.isAdmin} onBack={onExit}
            onMsg={setMsg} onChanged={async () => { await refreshSelected(); void load(skpd) }} />
        ) : startCreate ? (
          <>
            <button onClick={onExit} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali ke daftar
            </button>
            <CreateKartu skpdId={Number(skpd)} onSaved={() => { void load(skpd); onExit() }} />
          </>
        ) : (
          <div className="card p-8 text-center text-gray-400 text-sm">Memuat kartu…</div>
        )}
      </div>
    )
  }

  const menungguK = list.filter(k => statusKartuKdp(k.payload) === 'pending' || adaTerminMenunggu(k.payload))
  const selesaiK = list.filter(k => !menungguK.includes(k))

  const body = (
    <>
      {skpdProp === undefined && (
        <div className="card p-5 mb-4">
          <label className="block text-xs text-gray-500 mb-1">Lokasi / SKPD</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpdInternal(id); setMsg('') }} placeholder="Ketik nama SKPD..." />
        </div>
      )}
      {embedded && msg && <div className={`mb-4 p-3 rounded-lg text-sm max-w-2xl ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}
      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk mulai.</div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{list.length} paket konstruksi · {formatRupiah2(list.reduce((s, k) => s + kontrakTotal(k.payload), 0))}</span>
            {!hideAdd && <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Batal' : '+ Buat Kartu Paket'}</button>}
          </div>
          {!hideAdd && showCreate && <CreateKartu skpdId={Number(skpd)} onSaved={() => { setShowCreate(false); void load(skpd); setMsg('Kartu paket dibuat — tambah kontrak, barang KDP & termin.') }} />}
          {list.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada paket konstruksi untuk SKPD ini.</div>
          ) : (
            <>
              {menungguK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-700">⏳ Ada yang Menunggu ({menungguK.length})</h3>
                  {menungguK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={scope.isAdmin} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
                </section>
              )}
              {selesaiK.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600">✓ Semua Termin Disetujui ({selesaiK.length})</h3>
                  {selesaiK.map(k => <KontrakDetail key={k.id} inline kontrak={k} isAdmin={scope.isAdmin} onBack={() => load(skpd)} onMsg={setMsg} onChanged={() => load(skpd)} />)}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
  return embedded ? body : (
    <FormShell judul="Konstruksi" deskripsi="Satu kartu = satu paket pekerjaan dalam satu tahun anggaran. Termin disetujui satu per satu oleh admin pemda." msg={msg}>{body}</FormShell>
  )
}

// ── Kartu paket: kontrak + barang KDP (termin per barang) ───────────────────
export function KontrakDetail({ kontrak, isAdmin, onBack, onChanged, onMsg, inline }: {
  kontrak: Kontrak; isAdmin: boolean; onBack: () => void; onChanged: () => void; onMsg: (m: string) => void
  inline?: boolean
}) {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [busy, setBusy] = useState(false)
  const [showAddBarang, setShowAddBarang] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [specBarang, setSpecBarang] = useState<BarangKdp | null>(null)
  const [kapBarang, setKapBarang] = useState<BarangKdp | null>(null)
  const p = kontrak.payload || ({} as KontrakKonstruksiPayload)
  const barangs = barangKdpList(p)
  const kontraks = p.kontrak || []
  const tahun = tahunKartuKdp(kontrak.tanggal)
  const nDisetujui = barangs.reduce((s, b) => s + ringkasBarangKdp(b).nDisetujui, 0)
  const nMenunggu = barangs.reduce((s, b) => s + ringkasBarangKdp(b).nMenunggu, 0)
  const nilaiDisetujui = barangs.reduce((s, b) => s + ringkasBarangKdp(b).nilaiDisetujui, 0)
  const nilaiMenunggu = barangs.reduce((s, b) => s + ringkasBarangKdp(b).nilaiMenunggu, 0)
  const bolehUbah = kontrak.approval_status !== 'ditolak'

  // Tulis payload utuh. Bagian yang sudah disetujui dijaga trigger DB — kalau
  // layar ini basi (admin baru menyetujui di tab lain), simpan DITOLAK dgn pesan.
  async function simpanPayload(next: KontrakKonstruksiPayload): Promise<boolean> {
    const { error } = await supabase.from('jurnal_header').update({ payload: next }).eq('id', kontrak.id)
    if (error) { await konfirmasiGagal(konfirmasi, `Gagal menyimpan: ${error.message}`); onChanged(); return false }
    onChanged(); return true
  }
  const saveBarang = (next: BarangKdp[]) => simpanPayload({ ...p, barang: next })

  async function tambahBarang(kode: string, nama: string, kapInfo: KapInfo | null) {
    if (await saveBarang([...barangs, { key: newIdKdp(), kode, nama, pembayaran: [], kap_info: kapInfo }])) setShowAddBarang(false)
  }
  async function hapusBarang(b: BarangKdp) {
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus barang KDP ini dari kartu?', subjudul: namaBarangKdp(b),
      rincian: [{ label: 'Termin menunggu ikut terhapus', nilai: `${(b.pembayaran || []).length} termin` }],
      isi: <>Barang ini belum punya termin disetujui, jadi belum tercatat di Daftar Barang — yang dibuang cuma rancangannya.</>,
      labelYa: 'Hapus barang',
    })).ya) return
    await saveBarang(barangs.filter(x => x.key !== b.key))
  }
  async function tambahTermin(key: string, item: PembayaranKdp) {
    await saveBarang(barangs.map(b => b.key === key ? { ...b, pembayaran: [...(b.pembayaran || []), item] } : b))
  }
  async function hapusTermin(key: string, id: string) {
    await saveBarang(barangs.map(b => b.key === key ? { ...b, pembayaran: (b.pembayaran || []).filter(t => t.id !== id) } : b))
  }
  async function saveSpec(key: string, fields: Record<string, string>, foto: { replace?: string[]; append?: string[] }) {
    const spec: Record<string, string> = {}
    // `angkaKolomAset`, BUKAN pembaca rupiah — yang terakhir membuang tanda
    // minus (latitude belahan selatan; insiden 2026-08-20).
    for (const k of ASET_FIELD_COLS) {
      const v = fields[k]
      if (!v) continue
      if (ASET_NUM_COLS.has(k)) { const n = angkaKolomAset(v); if (n !== null) spec[k] = String(n) }
      else spec[k] = v
    }
    const calon = barangs.map(b => b.key === key ? { ...b, spec, foto: foto.replace ?? b.foto ?? [] } : b)
    const kurangNama = kekuranganNamaKdp(calon.filter(b => b.key === key || b.spec?.nama_barang?.trim()))
    if (kurangNama) { await konfirmasiGagal(konfirmasi, kurangNama); return }
    if (await saveBarang(calon)) { setSpecBarang(null); onMsg('Spesifikasi disimpan.') }
  }
  async function simpanKontrak(k: KontrakKdp) {
    const ada = kontraks.some(x => x.id === k.id)
    await simpanPayload({ ...p, kontrak: ada ? kontraks.map(x => x.id === k.id ? k : x) : [...kontraks, k] })
  }
  async function hapusKontrak(k: KontrakKdp) {
    if (!(await konfirmasi({ nada: 'merah', ikon: '🗑', judul: 'Hapus kontrak ini dari kartu?', subjudul: `${komponenLabelKdp(k.komponen)} · ${k.no_kontrak}`, labelYa: 'Hapus kontrak' })).ya) return
    await simpanPayload({ ...p, kontrak: kontraks.filter(x => x.id !== k.id) })
  }

  // Setujui / Batal termin: `kerjakan` MELEMPAR, pop-up gagalnya dibuka DI LUAR
  // `konfirmasi()` (KonfirmasiProvider cuma satu modal — lihat konfirmasi.tsx).
  async function setujui(b: BarangKdp, t: PembayaranKdp) {
    const r = ringkasBarangKdp(b)
    try {
      await konfirmasi({
        nada: 'teal', ikon: '✓', judul: 'Setujui termin ini?', subjudul: `${namaBarangKdp(b)} · ${komponenLabelKdp(t.komponen)}`,
        rincian: [{ label: 'Tgl BAST', nilai: t.tgl_bast }, { label: 'Nominal', nilai: formatRupiah2(t.nominal) }],
        isi: r.nDisetujui === 0
          ? <>Ini termin <b>pertama</b> barang ini yang disetujui: barang KDP-nya <b>terbit di Daftar Barang</b> (NIBAR baru) senilai termin ini.</>
          : <>Nilai barang KDP ini bertambah sebesar termin ini — barang & NIBAR-nya tetap.</>,
        labelYa: 'Ya, setujui',
        kerjakan: async () => {
          setBusy(true)
          try { await setujuiTerminKdp(supabase, kontrak.id, b.key, t.id!) } finally { setBusy(false) }
          onMsg('Termin disetujui. Jalankan ulang engine supaya Laporan BMD & Rekonsiliasi ikut.'); onChanged()
        },
      })
    } catch (e) {
      await konfirmasi({ nada: 'merah', ikon: '⚠', judul: 'Belum bisa disetujui', isi: (e as Error).message, labelYa: 'Mengerti', tanpaBatal: true })
      onChanged()
    }
  }
  async function batal(b: BarangKdp, t: PembayaranKdp) {
    const sisa = ringkasBarangKdp(b).nDisetujui - 1
    try {
      await konfirmasi({
        nada: 'amber', ikon: '↩', judul: 'Batalkan persetujuan termin ini?', subjudul: `${namaBarangKdp(b)} · ${komponenLabelKdp(t.komponen)}`,
        rincian: [{ label: 'Tgl BAST', nilai: t.tgl_bast }, { label: 'Nominal', nilai: formatRupiah2(t.nominal) }],
        isi: <>Termin kembali <b>Menunggu</b> (isinya utuh — bisa diperbaiki lalu disetujui lagi, atau dihapus).
          Pembatalannya tercatat mundur ke tanggal BAST-nya.</>,
        peringatan: sisa === 0 ? <>Ini termin disetujui <b>terakhir</b> barang ini — barangnya hilang dari Daftar Barang sampai ada termin disetujui lagi (NIBAR-nya tetap disimpan).</> : undefined,
        labelYa: 'Ya, batalkan',
        kerjakan: async () => {
          setBusy(true)
          try { await batalTerminKdp(supabase, kontrak.id, t.id!) } finally { setBusy(false) }
          onMsg('Persetujuan termin dibatalkan.'); onChanged()
        },
      })
    } catch (e) {
      await konfirmasiGagal(konfirmasi, (e as Error).message, 'Belum bisa dibatalkan')
      onChanged()
    }
  }
  async function batalSemua() {
    try {
      await konfirmasi({
        nada: 'amber', ikon: '↩', judul: 'Batalkan SEMUA termin disetujui di kartu ini?', subjudul: kontrak.no_sk,
        rincian: [{ label: 'Termin disetujui', nilai: `${nDisetujui} termin` }, { label: 'Nilai', nilai: formatRupiah2(nilaiDisetujui) }],
        isi: <>Semua termin kembali <b>Menunggu</b>; barang KDP-nya hilang dari Daftar Barang (NIBAR tetap disimpan).
          Sesudahnya kartu bisa disunting atau dihapus.</>,
        labelYa: 'Ya, batalkan semua',
        kerjakan: async () => {
          setBusy(true)
          try { await batalSemuaTerminKdp(supabase, kontrak.id) } finally { setBusy(false) }
          onMsg('Semua termin dibatalkan.'); onChanged()
        },
      })
    } catch (e) {
      await konfirmasiGagal(konfirmasi, (e as Error).message, 'Belum bisa dibatalkan')
      onChanged()
    }
  }
  async function hapus() {
    if (nDisetujui > 0) { await konfirmasiGagal(konfirmasi, 'Kartu ini masih punya termin disetujui — batalkan semua termin dulu.'); return }
    const { data: led, error: lErr } = await supabase.from('transaksi_bmd').select('id').eq('header_id', kontrak.id).limit(1)
    if (lErr) { await konfirmasiGagal(konfirmasi, `Gagal memeriksa riwayat kartu: ${lErr.message}`); return }
    if (led && led.length > 0) {
      // Pernah punya termin disetujui → ledger append-only → arsipkan.
      if (!isAdmin) { await konfirmasiGagal(konfirmasi, 'Kartu ini pernah punya termin disetujui — hanya admin pemda yang bisa mengarsipkannya.'); return }
      if (!(await konfirmasi({
        nada: 'merah', ikon: '📦', judul: 'Arsipkan kartu ini?', subjudul: kontrak.no_sk,
        isi: <>Kartu ini <b>pernah punya termin disetujui</b>, jadi tak bisa dihapus betulan — ia diarsipkan & hilang dari daftar.</>,
        peringatan: <>Riwayat ledgernya tetap tersimpan (append-only). Tidak bisa dibatalkan.</>,
        labelYa: 'Arsipkan',
      })).ya) return
      const { error } = await supabase.from('jurnal_header').update({ approval_status: 'ditolak' }).eq('id', kontrak.id)
      if (error) { await konfirmasiGagal(konfirmasi, `Gagal mengarsipkan: ${error.message}`); return }
      onMsg('Kartu diarsipkan.'); onBack(); return
    }
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus kartu ini?', subjudul: kontrak.no_sk,
      rincian: [{ label: 'Kontrak', nilai: `${kontraks.length}` }, { label: 'Barang KDP', nilai: `${barangs.length}` }],
      isi: <>Belum ada termin yang pernah disetujui — kartu beserta kontrak, barang & terminnya dihapus betulan.</>,
      peringatan: <>Tidak bisa dibatalkan.</>, labelYa: 'Hapus kartu',
    })).ya) return
    const { error } = await supabase.from('jurnal_header').delete().eq('id', kontrak.id)
    if (error) await konfirmasiGagal(konfirmasi, `Gagal menghapus kartu: ${error.message}`); else onBack()
  }

  return (
    <div className="space-y-4">
      {!inline && (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>Kembali
        </button>
      )}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">{p.nama_pekerjaan || kontrak.no_sk}</h2>
              <div className="space-y-0.5">
                <Baris label="Tahun Anggaran" value={tahun} />
                <Baris label="Program" value={p.program} />
                <Baris label="Kegiatan" value={p.kegiatan} />
                <Baris label="Sub Kegiatan" value={p.sub_kegiatan} />
                <Baris label="Keterangan" value={p.keterangan} />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">Disetujui ({nDisetujui} termin)</p>
              <p className="text-lg font-bold text-navy">{formatRupiah2(nilaiDisetujui)}</p>
              {nMenunggu > 0 && <p className="text-[11px] text-amber-600">{nMenunggu} termin menunggu · {formatRupiah2(nilaiMenunggu)}</p>}
              {bolehUbah && (
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button title="Edit kartu" onClick={() => setShowEdit(true)} className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                  {nDisetujui === 0 && (
                    <button title="Hapus / arsipkan kartu" onClick={() => void hapus()} className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Susunan Kartu → Barang → Kontrak → BAST (user 2026-10-08): kontrak tampil
            di bawah tiap barang. Tabel kontrak terpisah cuma untuk kartu yang sudah
            berkontrak tapi belum punya barang. */}
        {barangs.length === 0 && kontraks.length > 0 && (
          <KontrakKdpSection payload={p} tahunKartu={tahun} skpdId={kontrak.skpd_id} bolehUbah={bolehUbah}
            onSimpan={simpanKontrak} onHapus={hapusKontrak} />
        )}

        {barangs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm border-t border-gray-100">Belum ada barang KDP — tambahkan barang dulu, lalu kontrak & BAST-nya di bawah barang itu.</div>
        ) : barangs.map(b => (
          <BarangKdpCard key={b.key} barang={b} payload={p} kontraks={kontraks} tahunKartu={tahun} skpdId={kontrak.skpd_id}
            bolehUbah={bolehUbah} isAdmin={isAdmin} busy={busy}
            onSimpanKontrak={simpanKontrak} onHapusKontrak={k => void hapusKontrak(k)}
            onHapusBarang={() => void hapusBarang(b)} onEditSpec={() => setSpecBarang(b)} onUbahKapInfo={() => setKapBarang(b)}
            onTambahTermin={item => tambahTermin(b.key, item)} onHapusTermin={id => void hapusTermin(b.key, id)}
            onSetujui={t => void setujui(b, t)} onBatal={t => void batal(b, t)} />
        ))}

        {bolehUbah && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/40">
            {showAddBarang
              ? <TambahBarangPanel skpdId={kontrak.skpd_id} onTambah={(k, n, ki) => void tambahBarang(k, n, ki)} onCancel={() => setShowAddBarang(false)} />
              : <button className="btn-primary text-sm" onClick={() => setShowAddBarang(true)}>+ Tambah Barang KDP</button>}
          </div>
        )}

        <div className="p-4 border-t border-gray-100 flex justify-end items-center gap-3">
          {barangs.length > 0 && (
            <button className="btn-secondary text-sm" onClick={() => setShowPreview(true)} title="Lihat rincian & kelengkapan seluruh termin di kartu ini">🔍 Pratinjau</button>
          )}
          {isAdmin && nDisetujui > 0 && (
            <button className="btn-secondary text-sm !text-red-600" onClick={() => void batalSemua()} disabled={busy}>{busy ? 'Memproses...' : '↩ Batal Semua Termin'}</button>
          )}
          {!isAdmin && nMenunggu > 0 && <span className="text-xs text-gray-400">{nMenunggu} termin menunggu persetujuan admin pemda.</span>}
        </div>
      </div>

      {specBarang && (
        <EditSpesifikasiModal title={`Spesifikasi — ${namaBarangKdp(specBarang)}`} fieldKeys={FIELDS_KDP}
          storagePrefix={`draft/konstruksi/${kontrak.id}/${specBarang.key}`} initialFields={specBarang.spec || {}} initialFoto={specBarang.foto || []}
          single onSave={(fields, foto) => saveSpec(specBarang.key, fields, foto)} onClose={() => setSpecBarang(null)} />
      )}
      {kapBarang && (
        <KapInfoModal barang={kapBarang} skpdId={kontrak.skpd_id} onClose={() => setKapBarang(null)}
          onSimpan={async ki => { if (await saveBarang(barangs.map(x => x.key === kapBarang.key ? { ...x, kap_info: ki } : x))) setKapBarang(null) }} />
      )}
      {showEdit && (
        <EditKartuModal kontrak={kontrak} onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onMsg('Kartu diperbarui.'); onChanged() }} />
      )}
      {showPreview && (
        <PreviewKonstruksiModal judul={p.nama_pekerjaan || kontrak.no_sk}
          subjudul={`Tahun anggaran ${tahun} · ${kontraks.length} kontrak`} barangs={barangs} fieldKeys={FIELDS_KDP}
          onClose={() => setShowPreview(false)} />
      )}
    </div>
  )
}

function KapInfoModal({ barang, skpdId, onClose, onSimpan }: {
  barang: BarangKdp; skpdId: number; onClose: () => void; onSimpan: (ki: KapInfo | null) => Promise<void>
}) {
  const [ki, setKi] = useState<KapInfo | null>(barang.kap_info ?? null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800">Induk aset — {namaBarangKdp(barang)}</h3>
        <KapInfoPicker skpdId={skpdId} value={ki} onChange={setKi} />
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={() => void onSimpan(ki)}>Simpan</button>
        </div>
      </div>
    </div>
  )
}

// ── Panel tambah barang KDP (kode 1.3.6 + opsional induk aset) ──────────────
function TambahBarangPanel({ skpdId, onTambah, onCancel }: {
  skpdId: number; onTambah: (kode: string, nama: string, kapInfo: KapInfo | null) => void; onCancel: () => void
}) {
  const [kode, setKode] = useState<KodefikasiHasil | null>(null)
  const [kapInfo, setKapInfo] = useState<KapInfo | null>(null)
  const [err, setErr] = useState('')
  return (
    <div className="space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-800">Tambah Barang KDP</h3>
      <div><label className="block text-xs text-gray-500 mb-1">Kode Barang (jenis KDP — golongan 1.3.6)</label>
        <KodefikasiPicker picked={kode} onPick={setKode} golonganTetap="1.3.6" /></div>
      <p className="text-xs text-gray-500">
        Nama spesifik barang (mis. “Rehab ruas jalan A”) diisi di <b>Edit Spesifikasi</b> → Spesifikasi Nama Barang
        — wajib &amp; tidak boleh kembar sebelum termin pertamanya disetujui.
      </p>
      <KapInfoPicker skpdId={skpdId} value={kapInfo} onChange={setKapInfo} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" onClick={() => {
          if (!kode) { setErr('Pilih kode barang KDP dulu.'); return }
          onTambah(kode.kode, kode.uraian || kode.kode, kapInfo)
        }}>+ Tambah</button>
        <button className="btn-secondary text-sm" onClick={onCancel}>Batal</button>
      </div>
    </div>
  )
}

// Dipakai PengadaanEntry untuk menghitung kuantitas barang per status.
export function hitungBarangKdp(p: KontrakKonstruksiPayload) {
  let disetujui = 0, draft = 0
  for (const b of barangKdpList(p)) { if (ringkasBarangKdp(b).nDisetujui > 0) disetujui++; else draft++ }
  return { disetujui, draft }
}
