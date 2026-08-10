'use client'
// Halaman standar harga RKBMD — SATU komponen dipakai keempat menu (SSH, HSPK,
// ASB, SBU), dibedakan oleh `STANDAR_CONFIG` (lib/rkbmdStandar.ts). Keempatnya
// berbentuk sama; menyalin komponen ini empat kali = utang "ubah satu, samakan
// yang lain" yang di repo ini sudah berkali-kali dilanggar.
//
// Pola UI: tabel + tombol "＋ Tambah" di KANAN ATAS, isian lewat POP-UP
// (permintaan user 2026-08-10) — bukan form inline di atas tabel seperti
// halaman admin SSH/SBSK yang lama.
//
// BAK BERSAMA: baris dari SKPD mana pun tampil di sini. Yang boleh diubah/
// dihapus hanya milik SKPD sendiri + admin — sisanya tampil apa adanya dengan
// keterangan siapa yang menginput. Penegak sesungguhnya RLS di DB; penanda di
// UI cuma supaya tombolnya tidak muncul lalu error.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import KodefikasiPicker, { type KodefikasiHasil } from '@/components/KodefikasiPicker'
import RekeningPicker from '@/components/RekeningPicker'
import { backdropClose } from '@/components/backdropClose'
import { formatRupiah } from '@/lib/export'
import { type ApprovalScope, SCOPE_KOSONG, fetchApprovalScope } from '@/lib/roles'
import {
  STANDAR_CONFIG, SLOT_REKENING, fetchStandar, simpanStandar, ubahStandar, hapusStandar,
  type StandarJenis, type StandarRow,
} from '@/lib/rkbmdStandar'

const TAHUN_DEFAULT = new Date().getFullYear() + 1

/** Boleh ubah/hapus baris ini? = admin, atau baris milik SKPD sendiri/bawahannya.
 *  Cerminan RLS `rkbmd_standar_update/delete` (fn_skpd_visible = subtree). */
function milikSaya(scope: ApprovalScope, skpdId: number | null): boolean {
  if (scope.isAdmin) return true
  if (skpdId == null || scope.skpdId == null) return false
  return skpdId === scope.skpdId || scope.bawahan.has(skpdId)
}

export default function StandarHargaWorkspace({ jenis }: { jenis: StandarJenis }) {
  const cfg = STANDAR_CONFIG[jenis]
  const supabase = createClient()

  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [rows, setRows] = useState<StandarRow[]>([])
  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [cari, setCari] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [modal, setModal] = useState<{ mode: 'baru' } | { mode: 'edit'; row: StandarRow } | null>(null)

  useEffect(() => { (async () => setScope(await fetchApprovalScope(supabase)))() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fail-closed: kegagalan query ditampilkan & tabel dikosongkan, TIDAK
  // dibiarkan terbaca sebagai "belum ada standar harga" (rules.md).
  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      setRows(await fetchStandar(supabase, jenis, tahun))
    } catch (e) {
      setRows([]); setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [jenis, tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function hapus(r: StandarRow) {
    if (!confirm(`Hapus "${r.nama}"${r.kode ? ` (${r.kode})` : ''} dari ${cfg.judul} TA ${tahun}?\n\nIni bak bersama — SKPD lain yang memakainya akan kehilangan acuan ini.`)) return
    try {
      await hapusStandar(supabase, r.id)
      setMsg('Baris dihapus.'); load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const q = cari.trim().toLowerCase()
  const tampil = !q ? rows : rows.filter(r =>
    r.nama.toLowerCase().includes(q) ||
    (r.kode || '').toLowerCase().includes(q) ||
    (r.satuan || '').toLowerCase().includes(q) ||
    r.rekening.some(k => k.toLowerCase().includes(q)))

  return (
    <FormShell
      judul={cfg.judul}
      deskripsi={cfg.deskripsi}
      msg={msg}
      headerRight={
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
            <input type="number" className="select-filter w-28" value={tahun}
              onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
          </div>
          <button className="btn-primary whitespace-nowrap" onClick={() => { setErr(''); setModal({ mode: 'baru' }) }}>
            ＋ Tambah
          </button>
        </div>
      }
    >
      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>
      )}

      <div className="card p-4 mb-4">
        <label className="block text-xs text-gray-500 mb-1">Cari</label>
        <input className="select-filter w-full max-w-lg" value={cari} onChange={e => setCari(e.target.value)}
          placeholder="nama, kode barang, satuan, atau kode rekening..." />
        <p className="text-xs text-gray-400 mt-2">
          {loading ? 'Memuat...' : `${tampil.length} dari ${rows.length} baris — TA ${tahun}, seluruh SKPD.`}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {cfg.pakaiKodeBarang && <th className="table-th">Kode Barang</th>}
              <th className="table-th">{cfg.labelNama}</th>
              <th className="table-th">Satuan</th>
              <th className="table-th text-right">{cfg.labelHarga}</th>
              <th className="table-th">Kode Rekening</th>
              {cfg.pakaiTkdn && <th className="table-th text-right">TKDN</th>}
              <th className="table-th">Keterangan</th>
              <th className="table-th">Diinput oleh</th>
              <th className="table-th w-28">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : err ? (
              <tr><td colSpan={9} className="table-td text-center py-8 text-red-500">Data tidak ditampilkan karena terjadi kesalahan di atas.</td></tr>
            ) : tampil.length === 0 ? (
              <tr><td colSpan={9} className="table-td text-center py-8 text-gray-400">
                {rows.length === 0 ? `Belum ada ${cfg.judul} untuk TA ${tahun}.` : 'Tidak ada yang cocok dengan pencarian.'}
              </td></tr>
            ) : tampil.map(r => {
              const boleh = milikSaya(scope, r.skpd_id)
              return (
                <tr key={r.id}>
                  {cfg.pakaiKodeBarang && <td className="table-td text-xs whitespace-nowrap">{r.kode || '—'}</td>}
                  <td className="table-td text-xs text-gray-800">{r.nama}</td>
                  <td className="table-td text-xs text-gray-500">{r.satuan || '—'}</td>
                  <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(r.harga)}</td>
                  <td className="table-td text-xs text-gray-600">
                    {r.rekening.length === 0 ? '—' : (
                      <div className="space-y-0.5">
                        {r.rekening.map(k => <div key={k} className="whitespace-nowrap">{k}</div>)}
                      </div>
                    )}
                  </td>
                  {cfg.pakaiTkdn && <td className="table-td text-xs text-right">{r.tkdn != null ? `${r.tkdn}%` : '—'}</td>}
                  <td className="table-td text-xs text-gray-500">{r.keterangan || '—'}</td>
                  <td className="table-td text-xs text-gray-400">{r.skpd_nama || 'Admin Pemda'}</td>
                  <td className="table-td whitespace-nowrap">
                    {boleh ? (
                      <>
                        <button onClick={() => { setErr(''); setModal({ mode: 'edit', row: r }) }}
                          className="text-teal hover:underline text-xs font-medium mr-3">Edit</button>
                        <button onClick={() => hapus(r)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium">Hapus</button>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-300" title="Baris milik SKPD lain — hubungi mereka atau admin bila perlu diubah">🔒</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <StandarModal
          jenis={jenis} tahun={tahun}
          row={modal.mode === 'edit' ? modal.row : null}
          onClose={() => setModal(null)}
          onSaved={(m) => { setModal(null); setMsg(m); load() }}
        />
      )}
    </FormShell>
  )
}

// ── Pop-up isian ────────────────────────────────────────────────────────────
function StandarModal({ jenis, tahun, row, onClose, onSaved }: {
  jenis: StandarJenis; tahun: number; row: StandarRow | null
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const cfg = STANDAR_CONFIG[jenis]
  const supabase = createClient()
  const editing = !!row

  const [picked, setPicked] = useState<KodefikasiHasil | null>(
    row?.kode ? { kode: row.kode, uraian: null, nama_objek: null, nama_rincian: null, nama_sub_rincian: null, masa_manfaat_tahun: null, batas_kapitalisasi: null } : null)
  const [nama, setNama] = useState(row?.nama || '')
  const [satuan, setSatuan] = useState(row?.satuan || '')
  const [harga, setHarga] = useState(row ? String(row.harga) : '')
  // Selalu SLOT_REKENING slot; yang sudah terisi ditaruh di depan. Baris yang
  // punya lebih dari 5 rekening (hasil gabungan banyak SKPD) tetap ditampilkan
  // seluruhnya supaya menyimpan tidak diam-diam MEMBUANG rekening SKPD lain.
  const [rekening, setRekening] = useState<string[]>(() => {
    const awal = row?.rekening ?? []
    const n = Math.max(SLOT_REKENING, awal.length)
    return Array.from({ length: n }, (_, i) => awal[i] || '')
  })
  const [tkdn, setTkdn] = useState(row?.tkdn != null ? String(row.tkdn) : '')
  const [keterangan, setKeterangan] = useState(row?.keterangan || '')
  const [satuanList, setSatuanList] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('admin_satuan_bmd').select('nama').order('nama')
      .then(({ data }) => setSatuanList(((data || []) as { nama: string }[]).map(s => s.nama)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setRek(i: number, v: string) {
    setRekening(prev => prev.map((x, j) => (j === i ? v : x)))
  }

  async function simpan() {
    if (cfg.pakaiKodeBarang && !picked) { setErr('Pilih jenis aset & kode barang dulu.'); return }
    if (!nama.trim()) { setErr(`${cfg.labelNama} wajib diisi.`); return }
    const nHarga = Number(harga)
    if (!harga || isNaN(nHarga) || nHarga < 0) { setErr(`${cfg.labelHarga} wajib diisi dengan angka ≥ 0.`); return }
    const nTkdn = tkdn.trim() === '' ? null : Number(tkdn)
    if (nTkdn != null && (isNaN(nTkdn) || nTkdn < 0 || nTkdn > 100)) { setErr('TKDN harus antara 0 sampai 100.'); return }

    // Dedup di dalam form sendiri: dua slot berisi rekening yang sama akan
    // ditolak UNIQUE (standar_id, kode_rekening) dgn pesan mentah.
    const rek = [...new Set(rekening.map(r => r.trim()).filter(Boolean))]

    setSaving(true); setErr('')
    try {
      if (editing) {
        await ubahStandar(supabase, row!.id, {
          nama: nama.trim(), satuan: satuan || null, harga: nHarga, tkdn: nTkdn,
          keterangan: keterangan.trim() || null,
          kode: cfg.pakaiKodeBarang ? (picked?.kode ?? null) : null,
          rekening: rek,
        }, row!.rekening)
        onSaved('Perubahan disimpan.')
      } else {
        const hasil = await simpanStandar(supabase, {
          jenis, tahun,
          kode: cfg.pakaiKodeBarang ? (picked?.kode ?? null) : null,
          nama: nama.trim(), satuan: satuan || null, harga: nHarga, tkdn: nTkdn,
          keterangan: keterangan.trim() || null, rekening: rek,
        })
        // Pesan jujur: kalau ternyata sudah ada, katakan siapa yang menginput
        // dan apa yang sebenarnya terjadi pada rekeningnya.
        if (hasil.status === 'sudah_ada') {
          onSaved(hasil.rekening_baru > 0
            ? `Barang ini sudah ada di sistem (diinput ${hasil.pemilik_skpd}). Tidak dibuat baris baru — ${hasil.rekening_baru} kode rekening Anda digabungkan ke barang yang sama.`
            : `Barang ini sudah ada di sistem (diinput ${hasil.pemilik_skpd}) dengan kode rekening yang sama persis. Tidak ada yang perlu ditambahkan.`)
        } else {
          onSaved(`Ditambahkan ke ${cfg.judul} TA ${tahun}.`)
        }
      }
    } catch (e) {
      setErr((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-800">
            {editing ? 'Edit' : 'Tambah'} {cfg.judul} — TA {tahun}
          </h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {cfg.pakaiKodeBarang && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset & Kode Barang</label>
              <KodefikasiPicker picked={picked} onPick={r => {
                setPicked(r)
                if (r) setNama(prev => prev || r.uraian || '')
              }} />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">{cfg.labelNama}</label>
            <input className="select-filter w-full" value={nama} onChange={e => setNama(e.target.value)}
              placeholder={cfg.pakaiKodeBarang ? 'mis. Kursi Kerja Staf, rangka besi, busa 5cm' : 'mis. Honorarium Narasumber Eselon II'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Satuan</label>
              <select className="select-filter w-full" value={satuan} onChange={e => setSatuan(e.target.value)}>
                <option value="">— pilih satuan —</option>
                {satuanList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{cfg.labelHarga} (Rp)</label>
              <input type="number" min={0} step="any" className="select-filter w-full" value={harga}
                onChange={e => setHarga(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Kode Rekening Belanja <span className="text-gray-400">(boleh lebih dari satu)</span>
            </label>
            <div className="space-y-2">
              {rekening.map((k, i) => (
                <RekeningPicker key={i} value={k} onChange={v => setRek(i, v)} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Kalau barang yang sama sudah diinput SKPD lain dengan rekening berbeda, kode rekening Anda
              akan digabungkan ke barang itu — bukan dibuatkan baris baru.
            </p>
          </div>

          {cfg.pakaiTkdn && (
            <div className="max-w-xs">
              <label className="block text-xs text-gray-500 mb-1">TKDN (%)</label>
              <input type="number" min={0} max={100} step="any" className="select-filter w-full" value={tkdn}
                onChange={e => setTkdn(e.target.value)} placeholder="0 – 100, kosongkan bila tak diketahui" />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Keterangan</label>
            <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn-primary" onClick={simpan} disabled={saving}>
            {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
  )
}
