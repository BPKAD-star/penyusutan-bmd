'use client'
// No.10: Kapitalisasi / penambahan masa manfaat (§6) — alur jurnal ala SIMBADA.
//   1. Pilih SKPD → list transaksi (ikon mata = rincian, sampah = batal).
//   2. Tambah: No Dokumen, Tanggal Dokumen, Keterangan.
//   3. Popup pilih INDUK (filter jenis + cari; kolom tgl perolehan).
//   4. Popup pilih ANAK (boleh > 1). ATURAN: anak harus 1 rumpun jenis dgn induk
//      & tanggal perolehan anak TIDAK boleh lebih awal dari induk.
//   5. Preview rinci (BPK-friendly) lalu Simpan → kapitalisasi di induk + anak
//      diserap ('kapitalisasi_serap'). Batal → 'batal_kapitalisasi' (kembali semula).
// Perhitungan final tetap di engine (overhaul_band); snapshot disimpan di payload.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3 } from '@/lib/bmd'
import { cariBand, type BandOverhaul } from '@/lib/engine/penyusutan'
import { KapitalisasiRincian, KapitalisasiDetailModal, type KapSnapshot, type KapAnak, type KapItem } from '@/components/KapitalisasiDetail'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'

type Barang = { id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai_perolehan: number; skpd_id: number | null; tgl_perolehan: string | null }
type IndukFig = { npLama: number; nbLama: number; akumLama: number; bebanLama: number; sisaLamaSmt: number; masaMaks: number | null }
type Jurnal = {
  id: number; aset_id: string; no_dokumen: string; tanggal: string; keterangan: string | null; nilai: number
  induk: { nibar: string | null; nama_barang: string | null; kode: string } | null
  anak: KapAnak[]; snapshot: KapSnapshot | null
}

const today = () => new Date().toISOString().slice(0, 10)

function computeSnapshot(fig: IndukFig, kode: string, rehab: number, bands: BandOverhaul[]): KapSnapshot {
  const persen = fig.npLama > 0 ? (rehab / fig.npLama) * 100 : 0
  const band = rehab > 0 ? cariBand(bands, kode, persen) : null
  const tambahan = band?.tambahan_tahun ?? 0
  const sisaTahunLama = fig.sisaLamaSmt / 2
  const masaBaruTahun = fig.masaMaks != null ? Math.min(sisaTahunLama + tambahan, fig.masaMaks) : sisaTahunLama + tambahan
  const sisaBaruSmt = Math.max(1, Math.round(masaBaruTahun * 2))
  const npBaru = fig.npLama + rehab
  const nbBaru = fig.nbLama + rehab
  const bebanBaru = sisaBaruSmt > 0 ? Math.round(nbBaru / sisaBaruSmt) : 0
  return {
    np_lama: fig.npLama, beban_lama: fig.bebanLama, akum_lama: fig.akumLama, nb_lama: fig.nbLama,
    sisa_lama_smt: fig.sisaLamaSmt, masa_maks_tahun: fig.masaMaks,
    rehab, persen, tambahan_tahun: tambahan, masa_baru_tahun: masaBaruTahun, sisa_baru_smt: sisaBaruSmt,
    np_baru: npBaru, nb_baru: nbBaru, beban_baru: bebanBaru, akum_baru: fig.akumLama,
  }
}

export default function Kapitalisasi() {
  const supabase = createClient()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [bands, setBands] = useState<BandOverhaul[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [detail, setDetail] = useState<KapItem[] | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
    supabase.from('overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun').then(({ data }) => setBands((data as BandOverhaul[]) || []))
    ;(async () => {
      const { data: jenis } = await supabase.from('jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('kodefikasi_bmd').select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadList = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingList(true)
    const [{ data: kap }, { data: batal }] = await Promise.all([
      supabase.from('transaksi_bmd')
        .select('id,aset_id,tanggal,keterangan,nilai,payload,aset:aset_id(nibar,nama_barang,kode)')
        .eq('jenis', 'kapitalisasi').eq('skpd_asal', Number(skpdId)).order('id', { ascending: true }),
      supabase.from('transaksi_bmd').select('payload').eq('jenis', 'batal_kapitalisasi').eq('skpd_asal', Number(skpdId)),
    ])
    const cancelled = new Set<number>()
    for (const b of (batal || []) as { payload: { target_trx_id?: number } }[]) {
      const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) cancelled.add(t)
    }
    const rows = (kap || []) as unknown as {
      id: number; aset_id: string; tanggal: string; keterangan: string | null; nilai: number
      payload: { no_dokumen?: string; anak?: KapAnak[]; snapshot?: KapSnapshot }; aset: Jurnal['induk']
    }[]
    setJurnals(rows.filter(r => !cancelled.has(r.id)).map(r => ({
      id: r.id, aset_id: r.aset_id, no_dokumen: r.payload?.no_dokumen || '(tanpa no. dok)', tanggal: r.tanggal,
      keterangan: r.keterangan, nilai: r.nilai, induk: r.aset, anak: r.payload?.anak || [], snapshot: r.payload?.snapshot || null,
    })))
    setLoadingList(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList(skpd); setMode('list') }, [skpd, loadList])

  async function batal(j: Jurnal) {
    if (!confirm(`Batalkan kapitalisasi No. Dok ${j.no_dokumen}? Nilai induk & masa manfaat kembali seperti semula, dan ${j.anak.length} barang anak aktif lagi.`)) return
    // Nilai perolehan induk dikembalikan: nilai sekarang − rehab transaksi ini.
    const { data: a } = await supabase.from('aset').select('nilai_perolehan,skpd_id').eq('id', j.aset_id).single()
    const npRestore = (a?.nilai_perolehan ?? 0) - j.nilai
    // Batal = koreksi kesalahan → reversal DICATAT DI PERIODE TRANSAKSI ASLI (j.tanggal),
    // bukan hari ini. Kalau pakai hari ini, batal jatuh di semester berbeda dari kapitalisasi
    // sehingga di view periode asli aset tetap "terserap" (beda dgn Daftar Barang yg langsung).
    const { error } = await catatTransaksi(supabase, {
      asetId: j.aset_id, jenis: 'batal_kapitalisasi', tanggal: j.tanggal, nilai: j.nilai, skpdAsal: a?.skpd_id ?? Number(skpd),
      payload: { target_trx_id: j.id, nilai_perolehan_baru: npRestore, no_dokumen: j.no_dokumen },
      keterangan: `Pembatalan kapitalisasi ${j.no_dokumen}`,
    })
    if (error) { setMsg(`Error: ${error}`); return }
    for (const a2 of j.anak) {
      const { error: e2 } = await catatTransaksi(supabase, {
        asetId: a2.id, jenis: 'batal_kapitalisasi', tanggal: j.tanggal, nilai: a2.nilai, skpdAsal: Number(skpd),
        payload: { induk_id: j.aset_id, no_dokumen: j.no_dokumen }, keterangan: `Batal serap dari ${j.no_dokumen}`,
      })
      if (e2) { setMsg(`Sebagian batal gagal: ${e2}`); loadList(skpd); return }
    }
    setMsg('Kapitalisasi dibatalkan — kembali seperti semula. Jalankan engine untuk memperbarui penyusutan.')
    loadList(skpd)
  }

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Kapitalisasi" msg={msg}
      deskripsi="Pilih SKPD, buat transaksi kapitalisasi: barang induk + barang anak (penambahan masa manfaat). Nilai anak diserap ke induk.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk melihat & membuat transaksi kapitalisasi.</div>
      ) : mode === 'tambah' ? (
        <TambahKapitalisasi
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} bands={bands} golonganLabels={golonganLabels}
          onCancel={() => setMode('list')}
          onSaved={(n) => { setMode('list'); setMsg(`Kapitalisasi tersimpan — ${n} barang anak diserap ke induk. Jalankan engine untuk memperbarui penyusutan.`); loadList(skpd) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} transaksi kapitalisasi</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setMode('tambah') }}>+ Tambah Transaksi</button>
          </div>

          {loadingList ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada kapitalisasi untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-4">
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-gray-800">No. Dok: {j.no_dokumen}</p>
                  <p className="text-xs text-gray-500">Tgl. {j.tanggal}{j.keterangan ? ` · ${j.keterangan}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Nilai Kapitalisasi</p>
                    <p className="font-semibold text-gray-800">{formatRupiah(j.nilai)}</p>
                  </div>
                  <button title="Lihat rincian penambahan masa manfaat"
                    onClick={() => setDetail([{ no_dokumen: j.no_dokumen, tanggal: j.tanggal, keterangan: j.keterangan, snapshot: j.snapshot, anak: j.anak }])}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">👁</button>
                  <button title="Batalkan kapitalisasi" onClick={() => batal(j)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                </div>
              </div>
              <div className="px-5 py-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Barang Induk</p>
                <p className="font-medium text-gray-800 text-xs">{j.induk?.nama_barang || '-'}</p>
                <p className="text-gray-400 text-xs">{j.induk?.nibar || '-'} · {j.induk?.kode || '-'}</p>
                <p className="text-xs text-gray-400 mt-3 mb-1">Barang Anak (diserap) — {j.anak.length}</p>
                {j.anak.length === 0 ? <p className="text-gray-400 text-xs">-</p> : (
                  <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                    {j.anak.map(a => (
                      <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-gray-700">{a.nama || '-'} <span className="text-gray-400">· {a.nibar || '-'}{a.tgl ? ` · ${a.tgl}` : ''}</span></span>
                        <span className="text-gray-600">{formatRupiah(a.nilai)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && <KapitalisasiDetailModal title="Rincian Kapitalisasi" items={detail} onClose={() => setDetail(null)} />}
    </FormShell>
  )
}

// ── Form tambah ─────────────────────────────────────────────────────────────
function TambahKapitalisasi({ skpdId, skpdNama, bands, golonganLabels, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; bands: BandOverhaul[]; golonganLabels: Record<string, string>
  onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noDok, setNoDok] = useState('')
  const [tgl, setTgl] = useState(today())
  const [ket, setKet] = useState('')
  const [induk, setInduk] = useState<Barang | null>(null)
  const [anak, setAnak] = useState<Barang[]>([])
  const [fig, setFig] = useState<IndukFig | null>(null)
  const [modal, setModal] = useState<'induk' | 'anak' | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setFig(null)
    if (!induk) return
    (async () => {
      const { data: k } = await supabase.from('kodefikasi_bmd').select('masa_manfaat_tahun').eq('kode', induk.kode).single()
      const masaMaks = k?.masa_manfaat_tahun ?? null
      const { data: ps } = await supabase.from('penyusutan_semester')
        .select('nilai_buku_akhir,akumulasi,beban,sisa_semester,periode').eq('aset_id', induk.id).order('periode', { ascending: false }).limit(1)
      if (ps && ps.length) {
        setFig({ npLama: induk.nilai_perolehan, nbLama: ps[0].nilai_buku_akhir, akumLama: ps[0].akumulasi, bebanLama: ps[0].beban, sisaLamaSmt: ps[0].sisa_semester, masaMaks })
        return
      }
      const { data: sa } = await supabase.from('transaksi_bmd').select('payload').eq('aset_id', induk.id).eq('jenis', 'saldo_awal').limit(1)
      const p = (sa?.[0]?.payload || {}) as { nilai_buku_awal?: number; akumulasi_2025?: number; beban_per_smt?: number; sisa_masa_manfaat_smt?: number }
      setFig({
        npLama: induk.nilai_perolehan, nbLama: p.nilai_buku_awal ?? induk.nilai_perolehan, akumLama: p.akumulasi_2025 ?? 0,
        bebanLama: p.beban_per_smt ?? 0, sisaLamaSmt: p.sisa_masa_manfaat_smt ?? 0, masaMaks,
      })
    })()
  }, [induk]) // eslint-disable-line react-hooks/exhaustive-deps

  const rehab = anak.reduce((s, a) => s + (a.nilai_perolehan || 0), 0)
  const snap = induk && fig && rehab > 0 ? computeSnapshot(fig, induk.kode, rehab, bands) : null
  const anakInfo = (): KapAnak[] => anak.map(a => ({ id: a.id, nibar: a.nibar, nama: a.nama_barang, nilai: a.nilai_perolehan, tgl: a.tgl_perolehan }))

  const indukLevel3 = induk ? kodeLevel3(induk.kode) : ''
  const anakInvalid = (b: Barang): string | null => {
    if (induk && kodeLevel3(b.kode) !== indukLevel3) return 'beda jenis aset'
    if (induk?.tgl_perolehan && b.tgl_perolehan && b.tgl_perolehan < induk.tgl_perolehan) return 'lebih tua dari induk'
    return null
  }

  async function simpan() {
    if (!noDok.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (!induk) { setErr('Pilih barang induk dulu.'); return }
    if (anak.length === 0) { setErr('Pilih minimal satu barang anak.'); return }
    const bad = anak.find(a => anakInvalid(a))
    if (bad) { setErr(`Barang anak "${bad.nama_barang}" ${anakInvalid(bad)} — tidak boleh.`); return }
    if (!fig) { setErr('Data induk belum siap, coba sebentar lagi.'); return }
    setErr(''); setSaving(true)
    const snapshot = computeSnapshot(fig, induk.kode, rehab, bands)
    const { error } = await catatTransaksi(supabase, {
      asetId: induk.id, jenis: 'kapitalisasi', tanggal: tgl, nilai: rehab, skpdAsal: induk.skpd_id,
      payload: {
        no_dokumen: noDok.trim(), nilai_rehab: rehab, persen_rehab: Math.round(snapshot.persen * 100) / 100,
        tambahan_tahun: snapshot.tambahan_tahun, nilai_perolehan_lama: induk.nilai_perolehan,
        nilai_perolehan_baru: induk.nilai_perolehan + rehab, anak: anakInfo(), snapshot,
      },
      keterangan: ket.trim() || undefined,
    })
    if (error) { setErr(`Error: ${error}`); setSaving(false); return }
    for (const a of anak) {
      const { error: e2 } = await catatTransaksi(supabase, {
        asetId: a.id, jenis: 'kapitalisasi_serap', tanggal: tgl, nilai: a.nilai_perolehan, skpdAsal: a.skpd_id,
        payload: { induk_id: induk.id, induk_nibar: induk.nibar, no_dokumen: noDok.trim() },
        keterangan: `Diserap ke induk ${induk.nibar || induk.kode} (kapitalisasi ${noDok.trim()})`,
      })
      if (e2) { setErr(`Kapitalisasi tercatat, tapi serap barang anak gagal: ${e2}`); setSaving(false); return }
    }
    setSaving(false); onSaved(anak.length)
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Kapitalisasi Baru — {skpdNama}</h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
            <input className="select-filter w-full" value={noDok} onChange={e => setNoDok(e.target.value)} placeholder="mis. 027/1234/418.xx/2026" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
            <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
              value={tgl} onChange={e => setTgl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan / No. kontrak rehab</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Induk</label>
          <button className="btn-secondary text-xs" onClick={() => setModal('induk')}>{induk ? 'Ganti Induk' : 'Pilih Barang Induk'}</button>
        </div>
        {induk ? (
          <div className="p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
            <p className="font-medium text-gray-800">{induk.nama_barang || '-'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{induk.nibar || '-'} · {induk.kode} · Tgl {induk.tgl_perolehan || '-'} · Nilai {formatRupiah(induk.nilai_perolehan)}</p>
          </div>
        ) : <p className="text-xs text-gray-400">Belum dipilih.</p>}
      </div>

      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Anak (penambahan) — {anak.length} dipilih</label>
          <button className="btn-secondary text-xs" disabled={!induk} onClick={() => setModal('anak')}>{anak.length ? 'Ubah Anak' : 'Pilih Anak Barang'}</button>
        </div>
        {!induk ? <p className="text-xs text-gray-400">Pilih induk dulu (anak harus 1 rumpun jenis & tgl ≥ induk).</p>
          : anak.length === 0 ? <p className="text-xs text-gray-400">Belum dipilih.</p> : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {anak.map(a => (
                <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-gray-700">{a.nama_barang || '-'} <span className="text-gray-400">· {a.nibar || '-'} · {a.kode} · Tgl {a.tgl_perolehan || '-'}</span></span>
                  <span className="text-gray-600">{formatRupiah(a.nilai_perolehan)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>

      {snap && (
        <div className="card p-5 max-w-4xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview Perhitungan · Acuan periode {periodeDariTanggal(tgl)}</p>
          <KapitalisasiRincian item={{ no_dokumen: noDok || '(belum diisi)', tanggal: tgl, keterangan: ket, snapshot: snap, anak: anakInfo() }} />
        </div>
      )}

      {err && <p className="text-sm text-red-600 max-w-3xl">{err}</p>}
      <div className="max-w-3xl">
        <button className="btn-primary" onClick={simpan} disabled={saving || !induk || anak.length === 0}>
          {saving ? 'Menyimpan...' : 'Simpan Kapitalisasi'}
        </button>
      </div>

      {modal && (
        <BarangModal
          skpdId={skpdId} golonganLabels={golonganLabels}
          title={modal === 'induk' ? 'Pilih Barang Induk' : 'Pilih Barang Anak (penambahan)'}
          confirmLabel={modal === 'induk' ? 'Pilih Barang' : 'Pilih Anak Barang'}
          multi={modal === 'anak'}
          excludeIds={modal === 'anak' && induk ? [induk.id] : []}
          initialSelected={modal === 'induk' ? (induk ? [induk] : []) : anak}
          initialGolongan={modal === 'anak' ? indukLevel3 : ''}
          invalidFn={modal === 'anak' ? anakInvalid : undefined}
          onClose={() => setModal(null)}
          onConfirm={(sel) => { if (modal === 'induk') { setInduk(sel[0] || null); setAnak([]) } else setAnak(sel); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Popup pemilih barang ────────────────────────────────────────────────────
function BarangModal({ skpdId, golonganLabels, title, confirmLabel, multi, excludeIds = [], initialSelected = [], initialGolongan = '', invalidFn, onClose, onConfirm }: {
  skpdId: number; golonganLabels: Record<string, string>; title: string; confirmLabel: string; multi: boolean
  excludeIds?: string[]; initialSelected?: Barang[]; initialGolongan?: string
  invalidFn?: (b: Barang) => string | null; onClose: () => void; onConfirm: (sel: Barang[]) => void
}) {
  const supabase = createClient()
  const [fGol, setFGol] = useState(initialGolongan)
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>(Object.fromEntries(initialSelected.map(b => [b.id, b])))

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset').select('id,nibar,kode,nama_barang,nilai_perolehan,skpd_id,tgl_perolehan').eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGol) q = q.like('kode', `${fGol}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows(((data as unknown as Barang[]) || []).filter(b => !excludeIds.includes(b.id)))
    setLoaded(true); setLoading(false)
  }

  function pick(b: Barang) {
    if (invalidFn && invalidFn(b)) return
    setSel(prev => {
      if (!multi) return { [b.id]: b }
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={fGol} onChange={e => setFGol(e.target.value)}>
                <option value="">Semua Jenis</option>
                {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
          {invalidFn && <p className="text-xs text-gray-400 mt-2">Hanya barang 1 rumpun jenis & tanggal perolehan ≥ induk yang bisa dipilih.</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {!loaded ? <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan.</div> : (
            <table className="w-full">
              <thead className="bg-gray-50 border-y border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th w-10" />
                  <th className="table-th">Barang</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                ) : rows.map(b => {
                  const bad = invalidFn?.(b) ?? null
                  return (
                    <tr key={b.id} onClick={() => pick(b)}
                      className={bad ? 'opacity-50 cursor-not-allowed' : sel[b.id] ? 'bg-teal/5 cursor-pointer' : 'cursor-pointer'}>
                      <td className="table-td text-center">
                        <input type={multi ? 'checkbox' : 'radio'} checked={!!sel[b.id]} disabled={!!bad} readOnly />
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode}{bad && <span className="text-red-500"> · {bad}</span>}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{b.tgl_perolehan || '-'}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{selList.length} dipilih{multi ? ` · ${formatRupiah(selTotal)}` : ''}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={selList.length === 0} onClick={() => onConfirm(selList)}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
