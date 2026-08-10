'use client'
// Form item RKBMD Pengadaan. Urutan isian ditentukan user 2026-08-10:
//   1. Program / Kegiatan / Sub Kegiatan  → di HEADER dokumen (RkbmdWorkspace),
//      bukan per item — satu dokumen RKBMD = satu sub kegiatan.
//   2. Pilih jenis aset
//   3. Pilih kode barang — HANYA dari SSH (rkbmd_standar jenis 'ssh') TA ini.
//      Di luar SSH tidak bisa: SSH-lah dasar penyusunan RKBMD Pengadaan.
//   4. Kuantitas
//   5. Keterangan
//   6. Total anggaran dihitung sistem (kuantitas × harga SSH)
//
// Harga TIDAK bisa diketik di sini — ia datang dari SSH. Kalau harganya keliru,
// yang diperbaiki SSH-nya, supaya seluruh SKPD ikut terkoreksi. Ini sengaja
// berbeda dari versi lama form ini yang membolehkan harga di-override diam-diam
// per dokumen.
//
// `jumlah_standar` (SBSK) & `jumlah_eksisting` tetap ikut disimpan sebagai
// ANGKA RUJUKAN read-only — keduanya sudah dipakai kolom laporan RKBMD dan
// dibekukan saat dokumen disusun supaya angka telaah tidak bergerak ketika aset
// berpindah. Bukan isian, jadi tidak menambah langkah bagi operator.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backdropClose } from '@/components/backdropClose'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { formatRupiah } from '@/lib/export'
import { fetchStandar, type StandarRow } from '@/lib/rkbmdStandar'
import type { RkbmdItem } from '@/lib/rkbmd'

export default function RkbmdPengadaanForm({ rkbmdId, paketId, skpdId, tahun, editItem, onSaved, onCancel }: {
  rkbmdId: string
  /** Kartu Program/Kegiatan/Sub Kegiatan tempat item ini bernaung (migrasi 20260810_02). */
  paketId: string
  skpdId: number
  tahun: number
  editItem: RkbmdItem | null
  onSaved: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const editing = !!editItem

  const [sshRows, setSshRows] = useState<StandarRow[]>([])
  const [loadingSsh, setLoadingSsh] = useState(true)
  const [golongan, setGolongan] = useState(editItem?.kode ? kodeLevel3(editItem.kode) : '')
  const [standarId, setStandarId] = useState<string>(editItem?.standar_id != null ? String(editItem.standar_id) : '')
  const [kuantitas, setKuantitas] = useState(editItem?.jumlah_kebutuhan != null ? String(editItem.jumlah_kebutuhan) : '')
  const [rekening, setRekening] = useState(editItem?.kode_rekening || '')
  const [keterangan, setKeterangan] = useState(editItem?.keterangan || '')
  const [eksisting, setEksisting] = useState<number>(editItem?.jumlah_eksisting ?? 0)
  const [standarSbsk, setStandarSbsk] = useState<number | null>(editItem?.jumlah_standar ?? null)
  const [lihatEksisting, setLihatEksisting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // SSH TA ini, sekali. Fail-closed: kalau gagal, jangan biarkan terbaca
  // "SSH-nya memang kosong" — operator bisa salah menyimpulkan harus mengisi
  // SSH lagi padahal query-nya yang gagal.
  useEffect(() => {
    let alive = true
    setLoadingSsh(true)
    fetchStandar(supabase, 'ssh', tahun)
      .then(rows => { if (alive) { setSshRows(rows); setErr('') } })
      .catch(e => { if (alive) { setSshRows([]); setErr((e as Error).message) } })
      .finally(() => { if (alive) setLoadingSsh(false) })
    return () => { alive = false }
  }, [tahun]) // eslint-disable-line react-hooks/exhaustive-deps

  const pilihan = useMemo(
    () => (golongan ? sshRows.filter(r => r.kode && kodeLevel3(r.kode) === golongan) : []),
    [sshRows, golongan])

  const dipilih = sshRows.find(r => String(r.id) === standarId) || null
  const harga = dipilih?.harga ?? 0
  const total = (Number(kuantitas) || 0) * harga

  // Golongan yang benar-benar punya isi di SSH — supaya operator tak memilih
  // jenis aset lalu menemukan daftarnya kosong tanpa penjelasan.
  const golonganAda = useMemo(() => {
    const set = new Set(sshRows.filter(r => r.kode).map(r => kodeLevel3(r.kode!)))
    return GOLONGAN_REKAP.filter(g => set.has(g.kode))
  }, [sshRows])

  // Begitu barang dipilih: tarik eksisting (aset aktif SKPD ini) + SBSK.
  // Rekening terisi otomatis kalau barang itu cuma punya satu.
  useEffect(() => {
    if (!dipilih) return
    setRekening(prev => (prev && dipilih.rekening.includes(prev)) ? prev
      : (dipilih.rekening.length === 1 ? dipilih.rekening[0] : ''))
    let alive = true
    ;(async () => {
      const [asetRes, sbskRes] = await Promise.all([
        supabase.from('aset').select('jumlah').eq('status', 'aktif').eq('skpd_id', skpdId).eq('kode', dipilih.kode!),
        supabase.from('rkbmd_sbsk').select('kuantitas_standar').eq('tahun', tahun).eq('kode', dipilih.kode!).maybeSingle(),
      ])
      if (!alive) return
      setEksisting(((asetRes.data || []) as { jumlah: number | null }[]).reduce((s, x) => s + (x.jumlah || 0), 0))
      setStandarSbsk((sbskRes.data as { kuantitas_standar: number } | null)?.kuantitas_standar ?? null)
    })()
    return () => { alive = false }
  }, [standarId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dipilih) { setErr('Pilih barang dari SSH dulu.'); return }
    const qty = Number(kuantitas)
    if (!kuantitas || isNaN(qty) || qty <= 0) { setErr('Kuantitas harus lebih dari 0.'); return }
    if (dipilih.rekening.length > 1 && !rekening) { setErr('Barang ini punya beberapa kode rekening — pilih salah satu.'); return }

    setSaving(true); setErr('')
    const payload = {
      rkbmd_id: rkbmdId,
      paket_id: paketId,
      standar_id: dipilih.id,
      kode: dipilih.kode,
      nama_barang: dipilih.nama,
      satuan: dipilih.satuan,
      kode_rekening: rekening || null,
      jumlah_standar: standarSbsk,
      jumlah_eksisting: eksisting,
      jumlah_kebutuhan: qty,
      harga_satuan: harga,
      total_anggaran: total,
      keterangan: keterangan.trim() || null,
    }
    let error
    if (editing) {
      ({ error } = await supabase.from('rkbmd_item').update(payload).eq('id', editItem!.id))
    } else {
      // Nomor urut dihitung PER KARTU, bukan per dokumen — di lembar cetak tiap
      // sub kegiatan bernomor sendiri mulai dari 1.
      const { data: last } = await supabase.from('rkbmd_item').select('no_urut')
        .eq('paket_id', paketId).order('no_urut', { ascending: false }).limit(1).maybeSingle()
      const next = ((last as { no_urut: number | null } | null)?.no_urut || 0) + 1;
      ({ error } = await supabase.from('rkbmd_item').insert({ ...payload, no_urut: next }))
    }
    if (error) { setErr(`Error: ${error.message}`); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  return (
    <form onSubmit={submit} className="card p-5 mb-4 space-y-4 border-teal/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{editing ? 'Edit Item Pengadaan' : 'Tambah Item Pengadaan'}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Tutup</button>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      {loadingSsh ? (
        <p className="text-xs text-gray-400">Memuat daftar SSH TA {tahun}...</p>
      ) : sshRows.length === 0 && !err ? (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Belum ada barang di SSH TA {tahun}. RKBMD Pengadaan hanya boleh memakai barang yang sudah terdaftar di
          SSH — isi dulu lewat menu <span className="font-medium">RKBMD → Standar Harga → SSH</span>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">1. Jenis Aset</label>
              <select className="select-filter w-full" value={golongan}
                onChange={e => { setGolongan(e.target.value); setStandarId('') }}>
                <option value="">— pilih jenis aset —</option>
                {golonganAda.map(g => <option key={g.kode} value={g.kode}>{g.kode} — {g.uraian}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Hanya jenis yang sudah ada isinya di SSH TA {tahun}.</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">2. Kode Barang (dari SSH)</label>
              <select className="select-filter w-full" value={standarId} disabled={!golongan}
                onChange={e => setStandarId(e.target.value)}>
                <option value="">{golongan ? '— pilih barang —' : 'pilih jenis aset dulu'}</option>
                {pilihan.map(r => (
                  <option key={r.id} value={String(r.id)}>
                    {r.kode} — {r.nama}{r.satuan ? ` (${r.satuan})` : ''} · {formatRupiah(r.harga)}
                  </option>
                ))}
              </select>
              {golongan && pilihan.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">Tidak ada barang jenis ini di SSH TA {tahun}.</p>
              )}
            </div>
          </div>

          {dipilih && (
            <>
              {dipilih.rekening.length > 0 && (
                <div className="max-w-lg">
                  <label className="block text-xs text-gray-500 mb-1">Kode Rekening Belanja</label>
                  {dipilih.rekening.length === 1 ? (
                    <div className="select-filter w-full bg-gray-100 text-gray-700">{dipilih.rekening[0]}</div>
                  ) : (
                    <select className="select-filter w-full" value={rekening} onChange={e => setRekening(e.target.value)}>
                      <option value="">— pilih salah satu —</option>
                      {dipilih.rekening.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {dipilih.rekening.length === 1
                      ? 'Terisi otomatis — barang ini baru punya satu kode rekening di SSH.'
                      : 'Barang ini punya beberapa kode rekening (gabungan antar-SKPD) — pilih yang sesuai anggaran Anda.'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">3. Kuantitas</label>
                  <input type="number" min={0} step="any" required className="select-filter w-full"
                    value={kuantitas} onChange={e => setKuantitas(e.target.value)} />
                  {dipilih.satuan && <p className="text-[11px] text-gray-400 mt-1">{dipilih.satuan}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Harga Satuan (SSH)</label>
                  <div className="select-filter w-full bg-gray-100 text-gray-700">{formatRupiah(harga)}</div>
                  <p className="text-[11px] text-gray-400 mt-1">Terkunci — perbaiki lewat menu SSH bila keliru.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">5. Total Anggaran</label>
                  <div className="select-filter w-full bg-teal/5 text-gray-900 font-semibold">{formatRupiah(total)}</div>
                  <p className="text-[11px] text-gray-400 mt-1">Dihitung sistem: kuantitas × harga.</p>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 px-4 py-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-6 gap-y-1">
                <span>Angka rujukan (bukan isian) —</span>
                <span>
                  Eksisting di SKPD ini:{' '}
                  {eksisting > 0 ? (
                    <button type="button" onClick={() => setLihatEksisting(true)}
                      className="font-medium text-teal hover:underline"
                      title="Lihat barangnya di Daftar Barang">
                      {eksisting} ↗
                    </button>
                  ) : (
                    <span className="font-medium text-gray-700">0</span>
                  )}
                </span>
                <span>Standar SBSK: <span className="font-medium text-gray-700">{standarSbsk ?? '—'}</span></span>
                {standarSbsk != null && (
                  <span>Selisih: <span className="font-medium text-gray-700">{Math.max(standarSbsk - eksisting, 0)}</span></span>
                )}
              </div>

              {lihatEksisting && (
                <EksistingModal skpdId={skpdId} kode={dipilih.kode!} nama={dipilih.nama}
                  onClose={() => setLihatEksisting(false)} />
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">4. Keterangan</label>
                <input className="select-filter w-full" value={keterangan} onChange={e => setKeterangan(e.target.value)} />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving || !dipilih} className="btn-primary">
              {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Item'}
            </button>
            <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Batal</button>
          </div>
        </>
      )}
    </form>
  )
}

// ── Pop-up "barang eksisting" ───────────────────────────────────────────────
// Angka Eksisting selama ini cuma total tanpa cara memeriksanya — operator harus
// pindah ke Daftar Barang, menyaring SKPD & kode, lalu kembali. Di sini
// barangnya ditampilkan langsung. Ringan: satu query terindeks (skpd_id + kode +
// status), dan jumlah barang satu kode di satu SKPD selalu kecil.
function EksistingModal({ skpdId, kode, nama, onClose }: {
  skpdId: number; kode: string; nama: string; onClose: () => void
}) {
  const supabase = createClient()
  type Baris = {
    id: string; nibar: string | null; kode_register: string | null
    nama_barang: string | null; merek_tipe: string | null; tgl_perolehan: string | null
    jumlah: number | null; satuan: string | null; nilai_perolehan: number | null
    kondisi_barang: string | null
  }
  const [rows, setRows] = useState<Baris[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('aset')
        .select('id,nibar,kode_register,nama_barang,merek_tipe,tgl_perolehan,jumlah,satuan,nilai_perolehan,kondisi_barang')
        .eq('status', 'aktif').eq('skpd_id', skpdId).eq('kode', kode)
        .order('tgl_perolehan', { ascending: false }).order('id')
        .limit(1000)
      if (!alive) return
      if (error) { setErr(`gagal membaca daftar barang: ${error.message}`); setRows([]) }
      else setRows((data || []) as Baris[])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [skpdId, kode]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnit = rows.reduce((s, r) => s + (r.jumlah || 0), 0)
  const totalNilai = rows.reduce((s, r) => s + (r.nilai_perolehan || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-5xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">Barang eksisting di SKPD ini</h3>
            <p className="text-xs text-gray-500">{kode} — {nama}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="p-5">
          {err && <div className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Memuat...</p>
          ) : err ? null : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Tidak ada barang aktif dengan kode ini di SKPD ini.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {rows.length} baris · {totalUnit} unit · nilai perolehan {formatRupiah(totalNilai)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-th">NIBAR / Kode Register</th>
                      <th className="table-th">Nama Barang</th>
                      <th className="table-th">Merek / Tipe</th>
                      <th className="table-th">Tgl Perolehan</th>
                      <th className="table-th text-right">Jumlah</th>
                      <th className="table-th text-right">Nilai Perolehan</th>
                      <th className="table-th">Kondisi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className="table-td text-xs">
                          <div>{r.nibar || '—'}</div>
                          {r.kode_register && <div className="text-[11px] text-gray-400">REG {r.kode_register}</div>}
                        </td>
                        <td className="table-td text-xs text-gray-700">{r.nama_barang || '—'}</td>
                        <td className="table-td text-xs text-gray-500">{r.merek_tipe || '—'}</td>
                        <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.tgl_perolehan || '—'}</td>
                        <td className="table-td text-xs text-right">{r.jumlah ?? '—'} {r.satuan || ''}</td>
                        <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(r.nilai_perolehan)}</td>
                        <td className="table-td text-xs text-gray-500">{r.kondisi_barang || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
