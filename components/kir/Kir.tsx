'use client'
// KIR (Kartu Inventaris Ruangan) — Format III.K.2.
//   1. Pilih SKPD (pengurus barang otomatis terkunci ke subtree-nya).
//   2. Tambah Ruangan (nama + kode opsional + Penanggung Jawab Ruangan dari
//      Daftar Pegawai; kalau belum terdaftar ada pintasan ke Usulan Pengurus
//      Barang, peran 'Penanggung Jawab Ruangan').
//   3. Tambah barang ke ruangan (centang) — Peralatan & Mesin, Aset Tetap
//      Lainnya, Aset Lain-Lain (lihat KIR_ELIGIBLE_GOLONGAN).
//   4. Edit nama ruangan / PJ, keluarkan barang, hapus ruangan, cetak KIR.
//
// NON-LEDGER: tabel kir_ruangan + kir_ruangan_aset saja (migrasi 20260727_02).
// TIDAK menyentuh transaksi_bmd maupun kolom apa pun di `aset` — penempatan
// ruangan itu data administratif, bukan peristiwa akuntansi. Karena itu di sini
// UPDATE/DELETE biasa (bukan pola batal_* append-only seperti menu ber-ledger).
//
// SATU BARANG = SATU RUANGAN: ditegakkan UNIQUE(aset_id) di DB; picker juga
// menyaring barang yang sudah ditempatkan supaya operator tak kena error mentah.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import {
  KIR_ELIGIBLE_GOLONGAN, isKirEligible, tahunPerolehan, toIsiRuangan,
  RUANGAN_COLS, ASET_PICKER_COLS, ASET_JOIN_COLS,
  type AsetKir, type IsiRuangan, type PegawaiRuangan, type Ruangan,
} from '@/lib/kir'

const GOL_LABEL: Record<string, string> = Object.fromEntries(GOLONGAN_REKAP.map(g => [g.kode, g.uraian]))
const golLabel = (kode: string) => GOL_LABEL[kodeLevel3(kode)] || kodeLevel3(kode)

type RuanganLengkap = Ruangan & { isi: IsiRuangan[] }

export default function Kir() {
  const supabase = createClient()

  const [skpd, setSkpd] = useState('')
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [ruangans, setRuangans] = useState<RuanganLengkap[]>([])
  const [pegawai, setPegawai] = useState<PegawaiRuangan[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [formRuangan, setFormRuangan] = useState<Ruangan | 'baru' | null>(null)
  const [tambahBarangKe, setTambahBarangKe] = useState<RuanganLengkap | null>(null)

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama || ''

  // Calon Penanggung Jawab Ruangan: pegawai di SKPD ini. Tidak dibatasi ke
  // role_bmd 'penanggung_jawab_ruangan' saja — di lapangan sering pegawai biasa
  // yang ditunjuk; peran resminya menyusul lewat Usulan. Yang sudah berperan
  // resmi ditandai di dropdown supaya tetap terlihat mana yang "sah".
  const loadPegawai = useCallback(async (skpdId: string) => {
    if (!skpdId) { setPegawai([]); return }
    const { data } = await supabase.from('admin_pegawai')
      .select('id,nama,nip,jabatan,role_bmd').eq('skpd_id', Number(skpdId)).order('nama')
    setPegawai((data as PegawaiRuangan[]) || [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRuangan = useCallback(async (skpdId: string) => {
    if (!skpdId) { setRuangans([]); return }
    setLoading(true)
    const { data: rs } = await supabase.from('kir_ruangan')
      .select(RUANGAN_COLS).eq('skpd_id', Number(skpdId)).order('nama')
    const list = ((rs as unknown as Ruangan[]) || []).map(r => ({ ...r, isi: [] as IsiRuangan[] }))

    if (list.length > 0) {
      const byId = new Map(list.map(r => [r.id, r]))
      const { data: isi } = await supabase.from('kir_ruangan_aset')
        .select(`id,ruangan_id,aset_id,keterangan,aset:aset_id(${ASET_JOIN_COLS})`)
        .in('ruangan_id', list.map(r => r.id))
      for (const row of (isi || []) as unknown as (Parameters<typeof toIsiRuangan>[0] & { ruangan_id: string })[]) {
        const baris = toIsiRuangan(row)
        if (baris) byId.get(row.ruangan_id)?.isi.push(baris)
      }
      for (const r of list) r.isi.sort((a, b) => (a.nibar || '').localeCompare(b.nibar || ''))
    }
    setRuangans(list)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRuangan(skpd); loadPegawai(skpd)
    setFormRuangan(null); setTambahBarangKe(null)
  }, [skpd, loadRuangan, loadPegawai])

  async function hapusRuangan(r: RuanganLengkap) {
    if (!confirm(
      `Hapus ruangan "${r.nama}"?${r.isi.length > 0 ? ` ${r.isi.length} barang di dalamnya akan dilepas dari ruangan ini.` : ''}\n\n` +
      'Barangnya sendiri TIDAK dihapus — tetap ada di Daftar Barang, hanya kehilangan penempatan ruangan.'
    )) return
    const { error } = await supabase.from('kir_ruangan').delete().eq('id', r.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg(`Ruangan "${r.nama}" dihapus.`)
    loadRuangan(skpd)
  }

  async function keluarkanBarang(r: RuanganLengkap, b: IsiRuangan) {
    if (!confirm(`Keluarkan "${b.nama_barang || b.uraian_barang || b.nibar}" dari ruangan "${r.nama}"? Barang jadi bebas ditempatkan di ruangan lain.`)) return
    const { error } = await supabase.from('kir_ruangan_aset').delete().eq('id', b.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setMsg('Barang dikeluarkan dari ruangan.')
    loadRuangan(skpd)
  }

  const totalBarang = ruangans.reduce((n, r) => n + r.isi.length, 0)

  return (
    <FormShell judul="KIR — Kartu Inventaris Ruangan" msg={msg}
      deskripsi="Pilih SKPD, buat ruangan beserta penanggung jawabnya, lalu tempatkan barang (Peralatan & Mesin, Aset Tetap Lainnya, Aset Lain-Lain). Satu barang hanya boleh berada di satu ruangan.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd}
            onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD di atas untuk melihat & membuat Kartu Inventaris Ruangan.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-gray-500">
              {skpdNama} — {ruangans.length} ruangan · {totalBarang} barang tercatat
            </span>
            <div className="flex items-center gap-2">
              {ruangans.length > 0 && (
                <Link href={`/cetak/kir?skpd=${skpd}`} target="_blank" className="btn-secondary text-xs">
                  🖨 Cetak Semua Ruangan
                </Link>
              )}
              <button className="btn-primary" onClick={() => { setMsg(''); setFormRuangan('baru') }}>+ Tambah Ruangan</button>
            </div>
          </div>

          {loading ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : ruangans.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada ruangan untuk SKPD ini.</div>
          ) : ruangans.map(r => (
            <div key={r.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-gray-800">
                      {r.nama}
                      {r.kode_ruangan && <span className="ml-2 text-xs font-normal text-gray-500">Kode: {r.kode_ruangan}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      Penanggung Jawab: {r.pj_nama
                        ? <>{r.pj_nama}{r.pj_nip ? ` — NIP ${r.pj_nip}` : ''}{r.pj_jabatan ? ` · ${r.pj_jabatan}` : ''}</>
                        : <span className="text-amber-600">belum ditetapkan</span>}
                    </p>
                    <p className="text-xs text-gray-500">{r.isi.length} barang</p>
                    {r.keterangan && <p className="text-xs text-gray-500">Keterangan: {r.keterangan}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/cetak/kir?ruangan=${r.id}`} target="_blank" title="Cetak KIR ruangan ini"
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">🖨</Link>
                    <button title="Tambah barang ke ruangan ini" onClick={() => { setMsg(''); setTambahBarangKe(r) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-teal hover:opacity-90 text-white">+</button>
                    <button title="Edit nama ruangan / penanggung jawab" onClick={() => { setMsg(''); setFormRuangan(r) }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">✎</button>
                    <button title="Hapus ruangan" onClick={() => hapusRuangan(r)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                  </div>
                </div>
              </div>

              {r.isi.length === 0 ? (
                <p className="px-5 py-8 text-center text-gray-400 text-sm">Belum ada barang di ruangan ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-th w-14 text-center">Aksi</th>
                        <th className="table-th">NIBAR / Kode Barang</th>
                        <th className="table-th">Nama Barang</th>
                        <th className="table-th">Spesifikasi Nama Barang</th>
                        <th className="table-th">Merek / Tipe</th>
                        <th className="table-th text-center">Th. Perolehan</th>
                        <th className="table-th text-center">Jumlah</th>
                        <th className="table-th text-right">Nilai Perolehan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {r.isi.map(b => (
                        <tr key={b.id}>
                          <td className="table-td text-center">
                            <button onClick={() => keluarkanBarang(r, b)} title="Keluarkan barang dari ruangan ini"
                              className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                          </td>
                          <td className="table-td">
                            <p className="text-xs text-gray-800">{b.nibar || '-'}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{b.kode} · {golLabel(b.kode)}</p>
                          </td>
                          <td className="table-td text-xs text-gray-600">{b.uraian_barang || '-'}</td>
                          <td className="table-td text-xs font-medium text-gray-800">{b.nama_barang || '-'}</td>
                          <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                          <td className="table-td text-center text-xs">{tahunPerolehan(b.tgl_perolehan)}</td>
                          <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                          <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formRuangan && skpd && (
        <RuanganModal
          // key = remount saat pindah ruangan, supaya isian form ikut ganti
          // (state modal diinisialisasi dari props sekali di mount).
          key={formRuangan === 'baru' ? 'baru' : formRuangan.id}
          skpdId={Number(skpd)}
          ruangan={formRuangan === 'baru' ? null : formRuangan}
          pegawai={pegawai}
          onClose={() => setFormRuangan(null)}
          onSaved={t => { setFormRuangan(null); setMsg(t); loadRuangan(skpd) }}
        />
      )}

      {tambahBarangKe && skpd && (
        <TambahBarangModal
          key={tambahBarangKe.id}
          skpdId={Number(skpd)}
          ruangan={tambahBarangKe}
          onClose={() => setTambahBarangKe(null)}
          onSaved={n => { setTambahBarangKe(null); setMsg(`${n} barang ditempatkan di ruangan "${tambahBarangKe.nama}".`); loadRuangan(skpd) }}
        />
      )}
    </FormShell>
  )
}

// ── Tambah / edit ruangan + penanggung jawab ────────────────────────────────
function RuanganModal({ skpdId, ruangan, pegawai, onClose, onSaved }: {
  skpdId: number; ruangan: Ruangan | null; pegawai: PegawaiRuangan[]
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const supabase = createClient()
  const [nama, setNama] = useState(ruangan?.nama || '')
  const [kode, setKode] = useState(ruangan?.kode_ruangan || '')
  const [pegawaiId, setPegawaiId] = useState(ruangan?.pegawai_id || '')
  const [ket, setKet] = useState(ruangan?.keterangan || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function simpan() {
    if (!nama.trim()) { setErr('Nama ruangan wajib diisi.'); return }
    setErr(''); setSaving(true)
    // Snapshot data PJ ikut disimpan — blok tanda tangan KIR yang sudah dicetak
    // harus tetap sesuai dokumen fisik walau data pegawai berubah nanti.
    const pj = pegawai.find(p => p.id === pegawaiId)
    const payload = {
      skpd_id: skpdId, nama: nama.trim(), kode_ruangan: kode.trim() || null,
      pegawai_id: pegawaiId || null,
      pj_nama: pj?.nama || null, pj_nip: pj?.nip || null, pj_jabatan: pj?.jabatan || null,
      keterangan: ket.trim() || null,
    }
    const { error } = ruangan
      ? await supabase.from('kir_ruangan').update(payload).eq('id', ruangan.id)
      : await supabase.from('kir_ruangan').insert(payload)
    setSaving(false)
    if (error) {
      setErr(error.message.includes('kir_ruangan_skpd_id_nama_key')
        ? `Sudah ada ruangan bernama "${nama.trim()}" di SKPD ini. Pakai nama lain.`
        : `Gagal menyimpan: ${error.message}`)
      return
    }
    onSaved(ruangan ? `Ruangan "${nama.trim()}" diperbarui.` : `Ruangan "${nama.trim()}" ditambahkan.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{ruangan ? 'Edit Ruangan' : 'Tambah Ruangan'}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Nama Ruangan</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)}
              placeholder="mis. Ruang Multimedia SMPN 1 Ngasem" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kode Ruangan <span className="text-gray-400">(opsional)</span></label>
            <input className="select-filter w-full" value={kode} onChange={e => setKode(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Penanggung Jawab Ruangan</label>
            <select className="select-filter w-full" value={pegawaiId} onChange={e => setPegawaiId(e.target.value)}>
              <option value="">— belum ditetapkan —</option>
              {pegawai.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nama}{p.nip ? ` (${p.nip})` : ''}{p.role_bmd === 'penanggung_jawab_ruangan' ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Tanda ✓ = sudah berperan resmi Penanggung Jawab Ruangan. Belum ada di daftar?{' '}
              <Link href="/dashboard/admin/usulan-pengurus" target="_blank" className="text-teal underline">
                Usulkan di halaman Usulan Pengurus Barang
              </Link>{' '}
              (pilih peran “Penanggung Jawab Ruangan”), lalu kembali ke sini.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan <span className="text-gray-400">(opsional)</span></label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
          {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Pilih barang untuk ditempatkan di ruangan ───────────────────────────────
function TambahBarangModal({ skpdId, ruangan, onClose, onSaved }: {
  skpdId: number; ruangan: Ruangan; onClose: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const [fGolongan, setFGolongan] = useState('')
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<AsetKir[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, AsetKir>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function tampilkan() {
    setLoading(true); setErr('')
    let q = supabase.from('aset').select(ASET_PICKER_COLS)
      .eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGolongan) q = q.like('kode', `${fGolongan}.%`)
    else q = q.or(KIR_ELIGIBLE_GOLONGAN.map(g => `kode.like.${g}.%`).join(','))
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nibar', { ascending: true }).limit(500)
    const kandidat = ((data as unknown as AsetKir[]) || []).filter(b => isKirEligible(b.kode))

    // Buang barang yang sudah ditempatkan di ruangan mana pun (1 barang = 1
    // ruangan). Dicek di sini supaya operator tidak kena error UNIQUE mentah
    // saat menyimpan; DB tetap penjaga sesungguhnya.
    const sudah = new Set<string>()
    for (let i = 0; i < kandidat.length; i += 200) {
      const { data: dipakai } = await supabase.from('kir_ruangan_aset')
        .select('aset_id').in('aset_id', kandidat.slice(i, i + 200).map(b => b.id))
      for (const d of (dipakai || []) as { aset_id: string }[]) sudah.add(d.aset_id)
    }
    setRows(kandidat.filter(b => !sudah.has(b.id)))
    setLoaded(true); setLoading(false)
  }

  function toggle(b: AsetKir) {
    setSel(prev => { const next = { ...prev }; if (next[b.id]) delete next[b.id]; else next[b.id] = b; return next })
  }
  function toggleAll() {
    setSel(prev => {
      const all = rows.length > 0 && rows.every(r => prev[r.id])
      if (all) return {}
      const next = { ...prev }; for (const r of rows) next[r.id] = r; return next
    })
  }
  const selList = Object.values(sel)
  const allSelected = rows.length > 0 && rows.every(r => sel[r.id])

  async function simpan() {
    if (selList.length === 0) { setErr('Centang minimal satu barang.'); return }
    setErr(''); setSaving(true)
    const { error } = await supabase.from('kir_ruangan_aset')
      .insert(selList.map(b => ({ ruangan_id: ruangan.id, aset_id: b.id })))
    setSaving(false)
    if (error) {
      setErr(error.message.includes('kir_ruangan_aset_aset_id_key')
        ? 'Ada barang yang baru saja ditempatkan di ruangan lain. Klik Tampilkan untuk menyegarkan daftar.'
        : `Gagal menyimpan: ${error.message}`)
      return
    }
    onSaved(selList.length)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-gray-800">Tambah Barang — {ruangan.nama}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Barang yang sudah ditempatkan di ruangan lain tidak ditampilkan (keluarkan dulu dari ruangan itu).</p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={fGolongan} onChange={e => setFGolongan(e.target.value)}>
                <option value="">Semua (yang boleh)</option>
                {KIR_ELIGIBLE_GOLONGAN.map(g => <option key={g} value={g}>{g} — {GOL_LABEL[g] || g}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama barang / NIBAR / kode..."
                value={fSearch} onChange={e => setFSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>

          {!loaded ? (
            <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan untuk memilih barang.</div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="table-th w-10 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                      <th className="table-th">Barang</th>
                      <th className="table-th">Merek / Tipe</th>
                      <th className="table-th text-center">Th. Perolehan</th>
                      <th className="table-th text-center">Jumlah</th>
                      <th className="table-th text-right">Nilai Perolehan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.length === 0 ? (
                      <tr><td colSpan={6} className="table-td text-center py-10 text-gray-400">Tidak ada barang tersedia untuk filter ini.</td></tr>
                    ) : rows.map(b => (
                      <tr key={b.id} className={sel[b.id] ? 'bg-teal/5' : ''}>
                        <td className="table-td text-center"><input type="checkbox" checked={!!sel[b.id]} onChange={() => toggle(b)} /></td>
                        <td className="table-td">
                          <p className="font-medium text-gray-800 text-xs">{b.nama_barang || b.uraian_barang || '-'}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode} · {golLabel(b.kode)}</p>
                        </td>
                        <td className="table-td text-xs text-gray-600">{b.merek_tipe || '-'}</td>
                        <td className="table-td text-center text-xs">{tahunPerolehan(b.tgl_perolehan)}</td>
                        <td className="table-td text-center text-xs">{b.jumlah} {b.satuan || ''}</td>
                        <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between sticky bottom-0 bg-white">
          <span className="text-sm text-gray-600">{selList.length} barang dipilih</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" onClick={simpan} disabled={saving || selList.length === 0}>
              {saving ? 'Menyimpan...' : 'Tempatkan di Ruangan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
