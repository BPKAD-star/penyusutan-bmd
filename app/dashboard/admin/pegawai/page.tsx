'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import PenugasanRangkapModal, { type PegawaiRingkas, type PenugasanRangkap } from '@/components/admin/PenugasanRangkapModal'
import CariBox from '@/components/admin/CariBox'
import { cocokCari } from '@/lib/cari'
import { jkDariNip } from '@/lib/usulanPengurus'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import type { BarisImportPegawai } from '@/lib/importPegawai'
import { useImportPegawai } from './useImportPegawai'

type Pegawai = {
  id: string
  nip: string | null
  nama: string
  pangkat: string | null
  golongan: string | null
  jabatan: string | null
  jenis_kelamin: string | null
  role_bmd: string
  skpd_id: number | null
  skpd: { nama: string } | null
}

const ROLE_BMD = [
  { value: 'pengelola_barang', label: 'Pengelola Barang' },
  { value: 'penatausahaan_barang_pengelola', label: 'Penatausahaan Barang Pengelola' },
  { value: 'pengurus_barang_pengelola', label: 'Pengurus Barang Pengelola' },
  { value: 'pengguna_barang', label: 'Pengguna Barang' },
  { value: 'penatausahaan_barang_pengguna', label: 'Penatausahaan Barang Pengguna' },
  { value: 'pengurus_barang', label: 'Pengurus Barang' },
  { value: 'pembantu_pengurus_barang', label: 'Pembantu Pengurus Barang' },
  { value: 'kuasa_pengguna_barang', label: 'Kuasa Pengguna Barang' },
  { value: 'pengurus_barang_pembantu', label: 'Pengurus Barang Pembantu' },
  { value: 'penanggung_jawab_ruangan', label: 'Penanggung Jawab Ruangan' },
]
// Posisi tiap role di hierarki (dipakai utk urutan tampil, BUKAN cuma dropdown) —
// urutan array ini SUDAH persis hierarki organisasi BMD: Pengelola → Pengguna → Sub-unit.
const ROLE_ORDER = new Map(ROLE_BMD.map((r, i) => [r.value, i]))

// ── Urutan SKPD sesuai menu Admin > SKPD (tree walk: induk dulu, lalu
// anak-anaknya; tiap level diurutkan by Kode SKPD — bukan alfabetis nama).
// Dipakai utk mengelompokkan Daftar Pegawai per SKPD sesuai hierarki yg sama.
type SkpdTreeRow = { id: number; nama: string; parent_id: number | null; kode_skpd: string | null }
function compareSkpd(a: SkpdTreeRow, b: SkpdTreeRow): number {
  if (a.kode_skpd == null && b.kode_skpd == null) return a.nama.localeCompare(b.nama)
  if (a.kode_skpd == null) return 1
  if (b.kode_skpd == null) return -1
  return a.kode_skpd.localeCompare(b.kode_skpd) || a.nama.localeCompare(b.nama)
}
function buildSkpdOrder(rows: SkpdTreeRow[]): Map<number, number> {
  const childrenOf = new Map<number, SkpdTreeRow[]>()
  for (const s of rows) {
    if (s.parent_id == null) continue
    const arr = childrenOf.get(s.parent_id) || []
    arr.push(s)
    childrenOf.set(s.parent_id, arr)
  }
  for (const arr of childrenOf.values()) arr.sort(compareSkpd)

  const order = new Map<number, number>()
  let i = 0
  function walk(node: SkpdTreeRow) {
    order.set(node.id, i++)
    for (const c of childrenOf.get(node.id) || []) walk(c)
  }
  for (const r of rows.filter(s => s.parent_id == null).sort(compareSkpd)) walk(r)
  return order
}

// Pangkat & golongan/ruang PNS baku (PP 11/2017 jo. PP 99/2000). Pangkat
// otomatis mengikuti golongan yang dipilih — operator tidak isi manual lagi.
const GOLONGAN_PANGKAT: { golongan: string; pangkat: string }[] = [
  { golongan: 'I/a',   pangkat: 'Juru Muda' },
  { golongan: 'I/b',   pangkat: 'Juru Muda Tingkat I' },
  { golongan: 'I/c',   pangkat: 'Juru' },
  { golongan: 'I/d',   pangkat: 'Juru Tingkat I' },
  { golongan: 'II/a',  pangkat: 'Pengatur Muda' },
  { golongan: 'II/b',  pangkat: 'Pengatur Muda Tingkat I' },
  { golongan: 'II/c',  pangkat: 'Pengatur' },
  { golongan: 'II/d',  pangkat: 'Pengatur Tingkat I' },
  { golongan: 'III/a', pangkat: 'Penata Muda' },
  { golongan: 'III/b', pangkat: 'Penata Muda Tingkat I' },
  { golongan: 'III/c', pangkat: 'Penata' },
  { golongan: 'III/d', pangkat: 'Penata Tingkat I' },
  { golongan: 'IV/a',  pangkat: 'Pembina' },
  { golongan: 'IV/b',  pangkat: 'Pembina Tingkat I' },
  { golongan: 'IV/c',  pangkat: 'Pembina Utama Muda' },
  { golongan: 'IV/d',  pangkat: 'Pembina Utama Madya' },
  { golongan: 'IV/e',  pangkat: 'Pembina Utama' },
]
const pangkatDariGolongan = (g: string) => GOLONGAN_PANGKAT.find(x => x.golongan === g)?.pangkat || ''

// Golongan PPPK (angka Romawi, tanpa pangkat gaya PNS). Disimpan apa adanya di
// kolom `golongan`; `pangkat` dikosongkan untuk PPPK. Tidak bentrok dgn golongan
// PNS karena PNS selalu ber-format "X/y" (ada garis miring).
const GOLONGAN_PPPK = ['I', 'IV', 'V', 'VI', 'VII', 'IX', 'X', 'XI']
const isGolonganPppk = (g: string) => GOLONGAN_PPPK.includes(g.trim())

// Data lama boleh tersimpan format bebas (mis. "III-b", "iv/e") — normalisasi
// supaya tetap kepilih di dropdown saat Edit.
function normalisasiGolongan(g: string): string {
  const m = g.trim().match(/^(I|II|III|IV)[\s/-]?([a-eA-E])$/)
  return m ? `${m[1]}/${m[2].toLowerCase()}` : g
}

const FORM_KOSONG = {
  nip: '', nama: '', golongan: '', jabatan: '', jenis_kelamin: '',
  role_bmd: 'pengurus_barang', skpd_id: '', non_asn: false,
}

// SKPD RSUD dikenali dari nama (samakan dgn guard fn_pegawai_nip_guard di DB).
const isNamaRsud = (nama: string | null | undefined) => /^\s*rsud/i.test(nama || '')

// ── Import Excel (upsert by NIP) ────────────────────────────────────────────
// Master data murni (bukan ledger) — commit LANGSUNG upsert ke admin_pegawai,
// tanpa draft/approval spt PerolehanImport (itu perlu krn nyentuh ledger; ini
// tidak). NIP yg sudah ada di-UPDATE (keputusan user 2026-07-14) — pas utk
// file "data terbaru dari BKD" yg dikirim berkala.
// Pembacaan & validasi berkasnya MURNI & bertest — lib/importPegawai.ts.
type ImportRow = BarisImportPegawai

export default function AdminPegawaiPage() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [list, setList] = useState<Pegawai[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [closingForm, setClosingForm] = useState(false) // true selama animasi bubble-out, sebelum unmount
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_KOSONG)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Popup Tambah/Edit Pegawai ditutup lewat animasi (bubble-out + fade-out,
  // lihat tailwind.config.ts) — tunda unmount sampai animasi selesai.
  function closeForm() {
    setClosingForm(true)
    setTimeout(() => { setShowForm(false); setClosingForm(false) }, 160)
  }

  // Import Excel — pop-up, pembacaan berkas, & commit-nya. Nama dipertahankan
  // lewat destructuring beralias supaya seluruh JSX tak berubah. Aturan
  // pembacaannya MURNI & bertest di lib/importPegawai.ts.
  const {
    terbuka: showImport, setTerbuka: setShowImport, rows: importRows,
    namaBerkas: importFileName, parsing: parsingImport, committing: committingImport,
    msg: importMsg, bacaBerkas: handleImportFile, commit: handleImportCommit,
  } = useImportPegawai(ROLE_BMD, load, { normalisasiGolongan, pangkatDariGolongan })

  const [skpdOrder, setSkpdOrder] = useState<Map<number, number>>(new Map())
  // id SKPD yang tergolong RSUD — hanya di sini Pengguna Barang boleh non-ASN (tanpa NIP).
  const [rsudIds, setRsudIds] = useState<Set<number>>(new Set())

  // Penugasan rangkap (hanya utk Pengguna Barang) — dikelompokkan per pegawai_id.
  const [rangkapMap, setRangkapMap] = useState<Map<string, PenugasanRangkap[]>>(new Map())
  const [rangkapPegawai, setRangkapPegawai] = useState<PegawaiRingkas | null>(null)

  const [cari, setCari] = useState('')

  async function load() {
    const { data } = await supabase.from('admin_pegawai').select('*,skpd:admin_skpd(nama)').order('nama')
    setList((data as never as Pegawai[]) || [])
    setLoading(false)
  }

  async function loadRangkap() {
    const rows: PenugasanRangkap[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('admin_pegawai_penugasan')
        .select('id,pegawai_id,skpd_id,no_sk,tmt,aktif,skpd:admin_skpd(nama)').range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as never as PenugasanRangkap[]))
      if (data.length < 1000) break
    }
    const m = new Map<string, PenugasanRangkap[]>()
    for (const r of rows) { const a = m.get(r.pegawai_id) || []; a.push(r); m.set(r.pegawai_id, a) }
    setRangkapMap(m)
  }

  async function loadSkpdOrder() {
    const rows: SkpdTreeRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id,kode_skpd').range(from, from + 999)
      if (!data || data.length === 0) break
      rows.push(...(data as SkpdTreeRow[]))
      if (data.length < 1000) break
    }
    setSkpdOrder(buildSkpdOrder(rows))
    setRsudIds(new Set(rows.filter(s => isNamaRsud(s.nama)).map(s => s.id)))
  }

  // Statistik ringkas pengganti deskripsi statis — 3 role operator lapangan yg
  // paling sering ditanyakan (beda dari role pengelola tingkat atas).
  const deskripsiStat = useMemo(() => {
    const total = list.length
    const cPengurus = list.filter(p => p.role_bmd === 'pengurus_barang').length
    const cPengurusPembantu = list.filter(p => p.role_bmd === 'pengurus_barang_pembantu').length
    const cPembantuPengurus = list.filter(p => p.role_bmd === 'pembantu_pengurus_barang').length
    return `${total} pegawai — Pengurus Barang: ${cPengurus} · Pengurus Barang Pembantu: ${cPengurusPembantu} · Pembantu Pengurus Barang: ${cPembantuPengurus}`
  }, [list])

  // Urutan tampil: per SKPD sesuai hierarki menu Admin > SKPD, lalu per Role BMD
  // sesuai hierarki organisasi (lihat ROLE_ORDER), lalu nama sbg tie-breaker.
  const sortedList = useMemo(() => {
    return [...list].sort((a, b) => {
      const oa = a.skpd_id != null ? skpdOrder.get(a.skpd_id) ?? Infinity : Infinity
      const ob = b.skpd_id != null ? skpdOrder.get(b.skpd_id) ?? Infinity : Infinity
      if (oa !== ob) return oa - ob
      const ra = ROLE_ORDER.get(a.role_bmd) ?? ROLE_BMD.length
      const rb = ROLE_ORDER.get(b.role_bmd) ?? ROLE_BMD.length
      if (ra !== rb) return ra - rb
      return a.nama.localeCompare(b.nama)
    })
  }, [list, skpdOrder])

  // Hasil saring kotak Cari. Kata kuncinya nama · NIP · SKPD — dan SKPD di sini
  // termasuk **SKPD rangkap**, bukan cuma penugasan pokoknya: mencari "Dinas
  // Perumahan" harus menemukan kepala dinas yang merangkap di situ, kalau tidak
  // operator menyimpulkan SKPD itu tak punya Pengguna Barang.
  const tampilList = useMemo(
    () => sortedList.filter(p => cocokCari(cari, [
      p.nama, p.nip, p.skpd?.nama,
      ...(rangkapMap.get(p.id) || []).map(r => r.skpd?.nama),
    ])),
    [sortedList, cari, rangkapMap]
  )

  useEffect(() => { load(); loadSkpdOrder(); loadRangkap() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditId(null)
    setForm(FORM_KOSONG)
    setClosingForm(false)
    setShowForm(true)
  }

  function openEdit(p: Pegawai) {
    setClosingForm(false)
    setEditId(p.id)
    const golonganNormal = p.golongan ? normalisasiGolongan(p.golongan) : ''
    setForm({
      nip: p.nip || '', nama: p.nama,
      golongan: GOLONGAN_PANGKAT.some(g => g.golongan === golonganNormal) ? golonganNormal
        : isGolonganPppk(p.golongan || '') ? (p.golongan || '').trim() : '',
      jabatan: p.jabatan || '', jenis_kelamin: p.jenis_kelamin || '',
      role_bmd: p.role_bmd, skpd_id: p.skpd_id != null ? String(p.skpd_id) : '',
      non_asn: !p.nip,  // pegawai tersimpan tanpa NIP = non-ASN
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Non-ASN (tanpa NIP) hanya sah utk Pengguna Barang di SKPD RSUD — samakan
    // dgn guard DB fn_pegawai_nip_guard supaya pesan errornya ramah lebih dulu.
    const skpdNum = form.skpd_id ? Number(form.skpd_id) : null
    const eligibleNonAsn = form.role_bmd === 'pengguna_barang' && skpdNum != null && rsudIds.has(skpdNum)
    const nonAsn = eligibleNonAsn && form.non_asn
    if (!nonAsn && !/^\d{18}$/.test(form.nip)) {
      setMsg('NIP harus tepat 18 angka, tanpa spasi.'); return
    }
    setSaving(true)
    setMsg('')

    const payload = {
      nip: nonAsn ? null : form.nip, nama: form.nama,
      pangkat: pangkatDariGolongan(form.golongan) || null, golongan: form.golongan || null,
      jabatan: form.jabatan || null, jenis_kelamin: form.jenis_kelamin || null,
      role_bmd: form.role_bmd, skpd_id: skpdNum,
    }

    const { error } = editId
      ? await supabase.from('admin_pegawai').update(payload).eq('id', editId)
      : await supabase.from('admin_pegawai').insert(payload)

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setMsg(editId ? 'Pegawai berhasil diperbarui.' : 'Pegawai berhasil ditambahkan.')
      closeForm()
      setForm(FORM_KOSONG)
      setEditId(null)
      load()
    }
    setSaving(false)
  }

  async function handleDelete(id: string, nama: string) {
    setMsg('')
    // Guard: pegawai yg punya AKUN LOGIN tak bisa dihapus (FK admin_profiles).
    const { count: cAkun } = await supabase.from('admin_profiles')
      .select('id', { count: 'exact', head: true }).eq('pegawai_id', id)
    if ((cAkun || 0) > 0) {
      setMsg('Error: Pegawai ini punya AKUN LOGIN. Hapus dulu akunnya di menu "Daftar User", baru hapus pegawainya.')
      return
    }
    if (!(await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus data pegawai ini?',
      subjudul: nama,
      isi: <>Sudah diperiksa: pegawai ini <b>tidak punya akun login</b>, jadi tak ada yang kehilangan
        akses.</>,
      peringatan: <>Kalau ia masih tertaut <b>Usulan Pengurus Barang yang sudah disetujui</b>,
        database akan menolak — batalkan persetujuannya dulu di menu itu.</>,
      labelYa: 'Hapus pegawai',
    })).ya) return
    const { error } = await supabase.from('admin_pegawai').delete().eq('id', id)
    if (error) {
      // Umumnya masih tertaut Usulan yg disetujui (FK admin_usulan_pengurus).
      setMsg('Error: Gagal hapus — kemungkinan pegawai ini masih terkait Usulan yang DISETUJUI. Buka menu "Usulan Pengurus Barang" → "Batal Setujui" dulu, baru hapus.')
      return
    }
    load()
  }

  // Non-ASN (tanpa NIP) hanya utk Pengguna Barang di SKPD RSUD (lihat migrasi
  // 20260724_03). eligible = boleh dicentang; nonAsn = sedang dicentang & eligible.
  const skpdIdNum = form.skpd_id ? Number(form.skpd_id) : null
  const nonAsnEligible = form.role_bmd === 'pengguna_barang' && skpdIdNum != null && rsudIds.has(skpdIdNum)
  const nonAsn = nonAsnEligible && form.non_asn

  return (
    <FormShell judul="Daftar Pegawai" deskripsi={deskripsiStat} msg={msg}>
      <div className="flex items-center gap-2 mb-4">
        <CariBox nilai={cari} onChange={setCari} jumlah={tampilList.length} total={sortedList.length}
          satuan="pegawai" placeholder="Cari nama, NIP, atau SKPD..." />
        <button
          onClick={() => { setShowImport(v => !v); if (showForm) closeForm() }}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {showImport ? 'Batal Import' : 'Import Excel'}
        </button>
        <button
          onClick={() => { setShowImport(false); if (showForm) closeForm(); else openCreate() }}
          className="btn-primary"
        >
          {showForm ? 'Batal' : '+ Tambah Pegawai'}
        </button>
      </div>

      {showImport && (
        <div className="card p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Import Excel</h2>
          <p className="text-xs text-gray-500 mb-4">
            Kolom yang dibaca: <b>NIP</b> (wajib), Nama, Golongan, Jabatan, Jenis Kelamin (L/P),
            Role BMD (slug atau label), SKPD ID (angka — id SKPD, bukan nama). NIP yang sudah ada
            di database akan <b>diperbarui</b>; NIP baru akan dibuat. Import hanya mengisi
            <b> penugasan pokok</b> (1 SKPD per pegawai); penugasan <b>rangkap</b> Pengguna Barang
            ditambahkan lewat tombol “Rangkap” di daftar, bukan dari file ini.
          </p>
          <input type="file" accept=".xlsx,.xls" className="text-sm mb-4"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
          {parsingImport && <p className="text-sm text-gray-400">Membaca file...</p>}
          {importMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${importMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importMsg}</div>
          )}
          {importRows.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {importRows.length} baris terbaca dari {importFileName} —{' '}
                  <span className="text-green-600 font-medium">{importRows.filter(r => r.valid).length} valid</span>
                  {importRows.some(r => !r.valid) && (
                    <span className="text-red-500"> · {importRows.filter(r => !r.valid).length} bermasalah</span>
                  )}
                </span>
                <button className="btn-primary" disabled={committingImport || importRows.filter(r => r.valid).length === 0}
                  onClick={handleImportCommit}>
                  {committingImport ? 'Memproses...' : `Import ${importRows.filter(r => r.valid).length} Baris`}
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th">Status</th><th className="table-th">NIP</th><th className="table-th">Nama</th>
                      <th className="table-th">Golongan</th><th className="table-th">Role BMD</th><th className="table-th">SKPD ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {importRows.map((r, i) => (
                      <tr key={i} className={r.valid ? '' : 'bg-red-50/50'}>
                        <td className="table-td text-xs">{r.valid ? <span className="text-green-600">OK</span> : <span className="text-red-500">{r.masalah.join(', ')}</span>}</td>
                        <td className="table-td text-xs">{r.nip}</td>
                        <td className="table-td text-xs">{r.nama}</td>
                        <td className="table-td text-xs">{r.golongan || '-'}</td>
                        <td className="table-td text-xs">{ROLE_BMD.find(x => x.value === r.role_bmd)?.label || r.role_bmd}</td>
                        <td className="table-td text-xs">{r.skpd_id ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showForm && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 ${closingForm ? 'animate-fade-out' : 'animate-fade-in'}`}
          onClick={closeForm}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto ${closingForm ? 'animate-bubble-out' : 'animate-bubble-in'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-gray-800">{editId ? 'Edit Pegawai' : 'Tambah Pegawai Baru'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">NIP <span className="text-gray-400">{nonAsn ? '(non-ASN — tanpa NIP)' : '(18 angka, tanpa spasi)'}</span></label>
                <input required={!nonAsn} disabled={nonAsn} inputMode="numeric" maxLength={18}
                  className="select-filter w-full disabled:bg-gray-50 disabled:text-gray-400" value={nonAsn ? '' : form.nip}
                  onChange={e => setForm(f => ({ ...f, nip: e.target.value.replace(/\D/g, '') }))}
                  placeholder={nonAsn ? '— tanpa NIP —' : '200110042023021001'} />
                {nonAsnEligible && (
                  <label className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={form.non_asn}
                      onChange={e => setForm(f => ({ ...f, non_asn: e.target.checked }))} />
                    Non-ASN (tanpa NIP) — pejabat BLUD/kontrak RSUD
                  </label>
                )}
                {!nonAsn && <p className="text-[11px] text-gray-400 mt-1">Format: tgl lahir (8) + TMT ASN (6) + kelamin (1&nbsp;=&nbsp;L, 2&nbsp;=&nbsp;P) + nomor urut (3). 3 digit terakhir = nomor urut dari masing-masing kantor.</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nama Lengkap</label>
                <input required className="select-filter w-full" value={form.nama}
                  onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Golongan</label>
                <select className="select-filter w-full" value={form.golongan}
                  onChange={e => setForm(f => ({ ...f, golongan: e.target.value }))}>
                  <option value="">— pilih golongan —</option>
                  <optgroup label="PNS">
                    {GOLONGAN_PANGKAT.map(g => <option key={g.golongan} value={g.golongan}>{g.golongan} — {g.pangkat}</option>)}
                  </optgroup>
                  <optgroup label="PPPK">
                    {GOLONGAN_PPPK.map(g => <option key={`pppk-${g}`} value={g}>Golongan {g} (PPPK)</option>)}
                  </optgroup>
                </select>
                {pangkatDariGolongan(form.golongan)
                  ? <p className="text-xs text-gray-400 mt-1">Pangkat: {pangkatDariGolongan(form.golongan)}</p>
                  : isGolonganPppk(form.golongan) && <p className="text-xs text-gray-400 mt-1">PPPK — Golongan {form.golongan}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jabatan</label>
                <input className="select-filter w-full" value={form.jabatan}
                  onChange={e => setForm(f => ({ ...f, jabatan: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jenis Kelamin</label>
                <select className="select-filter w-full" value={form.jenis_kelamin}
                  onChange={e => setForm(f => ({ ...f, jenis_kelamin: e.target.value }))}>
                  <option value="">— pilih —</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
                {!nonAsn && jkDariNip(form.nip) && form.jenis_kelamin && jkDariNip(form.nip) !== form.jenis_kelamin && (
                  <p className="text-[11px] text-amber-600 mt-1">⚠ Menurut NIP (digit ke-15 = {form.nip[14]}), harusnya <b>{jkDariNip(form.nip) === 'L' ? 'Laki-laki' : 'Perempuan'}</b>.</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Role BMD</label>
                <select className="select-filter w-full" value={form.role_bmd}
                  onChange={e => setForm(f => ({ ...f, role_bmd: e.target.value }))}>
                  {ROLE_BMD.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">SKPD</label>
                <SkpdCombobox value={form.skpd_id} onChange={id => setForm(f => ({ ...f, skpd_id: id }))}
                  placeholder="Ketik nama SKPD... (kosongkan jika tanpa SKPD)" allowClear />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">SKPD</th>
                <th className="table-th whitespace-nowrap">Nama</th>
                <th className="table-th whitespace-nowrap">NIP</th>
                <th className="table-th whitespace-nowrap">Golongan</th>
                <th className="table-th whitespace-nowrap">Pangkat</th>
                <th className="table-th whitespace-nowrap">Jabatan</th>
                <th className="table-th whitespace-nowrap">Gender</th>
                <th className="table-th whitespace-nowrap">Role BMD</th>
                <th className="table-th whitespace-nowrap">Edit</th>
                <th className="table-th whitespace-nowrap">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
              ) : tampilList.length === 0 ? (
                <tr><td colSpan={10} className="table-td text-center py-8 text-gray-400">
                  {/* Dibedakan: "belum ada" vs "tak ada yang cocok" — kalau
                      disamakan, operator mengira datanya hilang. */}
                  {sortedList.length === 0 ? 'Belum ada pegawai.' : `Tidak ada pegawai yang cocok dengan "${cari}".`}
                </td></tr>
              ) : tampilList.map(p => (
                <tr key={p.id}>
                  <td className="table-td text-xs text-gray-500 align-top">
                    <div className="whitespace-nowrap">{p.skpd?.nama || '—'}</div>
                    {p.role_bmd === 'pengguna_barang' && (() => {
                      const rk = rangkapMap.get(p.id) || []
                      return (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {rk.length > 0 && (
                            <span className="text-[11px] text-teal">
                              + Rangkap: {rk.map(r => r.skpd?.nama || `SKPD #${r.skpd_id}`).join(', ')}
                            </span>
                          )}
                          <button
                            onClick={() => setRangkapPegawai({ id: p.id, nama: p.nama, nip: p.nip, skpd_id: p.skpd_id, skpd_nama: p.skpd?.nama || null })}
                            className="text-[11px] text-gray-400 hover:text-teal underline"
                          >
                            {rk.length > 0 ? 'Kelola rangkap' : '+ Rangkap'}
                          </button>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="table-td whitespace-nowrap text-sm font-medium">{p.nama}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-400">{p.nip || <span className="italic text-gray-300">Non-ASN</span>}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">
                    {p.golongan ? (isGolonganPppk(p.golongan) ? `${p.golongan} (PPPK)` : p.golongan) : '—'}
                  </td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.pangkat || '—'}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.jabatan || '—'}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '—'}</td>
                  <td className="table-td whitespace-nowrap text-xs text-gray-500">{ROLE_BMD.find(r => r.value === p.role_bmd)?.label || p.role_bmd}</td>
                  <td className="table-td whitespace-nowrap">
                    <button onClick={() => openEdit(p)} className="text-teal hover:underline text-xs font-medium">Edit</button>
                  </td>
                  <td className="table-td whitespace-nowrap">
                    <button onClick={() => handleDelete(p.id, p.nama)} className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rangkapPegawai && (
        <PenugasanRangkapModal
          pegawai={rangkapPegawai}
          onClose={() => setRangkapPegawai(null)}
          onChanged={loadRangkap}
        />
      )}
    </FormShell>
  )
}
