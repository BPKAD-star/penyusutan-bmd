'use client'
// Lembar Kerja Inventarisasi (route /dashboard/inventarisasi/lembar-kerja).
//
// JENIS ASET DIPILIH DI HALAMAN (keputusan user 2026-10-01), bukan lagi 8
// sub-menu Sidebar: halaman dibuka polos, daftar baru dimuat setelah jenis
// dipilih — termasuk "Semua jenis" (migrasi 20261001_01). Format LKI tiap barang
// ikut jenis BARANGNYA sendiri (`golonganDariKode`), bukan jenis yang dipilih.
//
// MODEL PER-BARANG (keputusan user 2026-09-23, migrasi 20260923_03): daftar ini
// MEMBACA register hidup — barang baru langsung muncul, barang yang dihapus/
// dipindah langsung hilang — lalu tiap barang punya tombol "Isi Inventarisasi".
// Isian tersimpan begitu disimpan; tak ada "Ajukan". Pengelola Barang
// memvalidasinya per barang di menu Validasi.
//
// ⚠️ Daftar & ringkasan SENGAJA dua permintaan terpisah (pola 2026-09-22):
// ringkasan menghitung ratusan ribu barang (3,6 dtk untuk Dinas Pendidikan),
// halaman pertama cuma ratusan milidetik. Ringkasan dimuat di latar & boleh
// gagal tanpa menjatuhkan daftarnya.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import LkiForm from '@/components/inventarisasi/LkiForm'
import TimPanel from '@/components/inventarisasi/TimPanel'
import TransaksiSesudah from '@/components/inventarisasi/TransaksiSesudah'
import PemilihJenis, { useJenisTerpilih } from '@/components/inventarisasi/PemilihJenis'
import { fetchApprovalScope, SCOPE_KOSONG, type ApprovalScope } from '@/lib/roles'
import { formatRupiah2 } from '@/lib/export'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { FotoSel, fotoMini, useFotoThumbs } from '@/shared/ui/FotoBarang'
import {
  STATUS_BADGE, STATUS_LABEL, JENIS_INVENTARISASI, JENIS_SEMUA, golonganDariKode, konfigLki, normalKondisi,
  BUCKET_FOTO_INVENTARISASI,
  type InvBaris, type InvJawaban, type StatusTampil,
} from '@/lib/inventarisasi'
import {
  belumDiinventarisasi, jumlahRingkas, muatBelumTercatat, muatFotoIsian, muatIsian, muatLembar, muatRingkasSemua, simpanIsian,
  snapshotDariLembar, type BarisLembar, type FilterLembar, type RingkasPerJenis,
} from '@/lib/inventarisasiData'

const TAHUN = new Date().getFullYear()
const PER_HAL = 50

const SEMUA_KODE = JENIS_INVENTARISASI.map(j => j.kode)

/** `golongan` = jenis BARANG yang dibuka (menentukan format LKI-nya). */
type Terbuka = { baris: InvBaris; skpdId: number; golongan: string; readOnly: boolean; pesan?: string }

export default function LembarKerjaInventarisasi() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [jenis, setJenisRaw, jenisSiap] = useJenisTerpilih('bmd_inv_lki_jenis')
  // null = "Semua jenis" (RPC menerima NULL); dipakai HANYA saat jenis sudah dipilih.
  const golongan = jenis && jenis !== JENIS_SEMUA ? jenis : null
  const config = golongan ? konfigLki(golongan) : null

  const [scope, setScope] = useState<ApprovalScope>(SCOPE_KOSONG)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [skpdSiap, setSkpdSiap] = useState(false)
  const [cariKetik, setCariKetik] = useState('')
  const [cari, setCari] = useState('')
  const [status, setStatus] = useState<FilterLembar>('semua')
  const [hal, setHal] = useState(0)

  const [rows, setRows] = useState<BarisLembar[]>([])
  const [adaLagi, setAdaLagi] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [ringkasPer, setRingkasPer] = useState<RingkasPerJenis | null>(null)
  const [ringkasErr, setRingkasErr] = useState('')
  const [belumTercatat, setBelumTercatat] = useState<(InvBaris & { golongan: string })[]>([])
  const [terbuka, setTerbuka] = useState<Terbuka | null>(null)
  const seq = useRef(0)

  const pengawas = scope.isViewer
  // SkpdCombobox hanya MEMANCARKAN pilihan awal untuk pengguna yang terkunci
  // ke SKPD-nya (non-admin). Admin & pengawas tak pernah menerima pancaran itu,
  // jadi tanpa cabang ini daftarnya tak akan pernah dimuat sama sekali.
  useEffect(() => {
    void fetchApprovalScope(supabase).then(sc => {
      setScope(sc)
      if (sc.isAdmin || sc.isViewer || sc.skpdId == null) setSkpdSiap(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setJenis = (v: string) => { setJenisRaw(v); setHal(0) }

  const muat = useCallback(async () => {
    if (!jenis) return
    const saya = ++seq.current
    setLoading(true); setErr('')
    try {
      const data = await muatLembar(supabase, {
        golongan, skpdIds, status, cari, limit: PER_HAL + 1, offset: hal * PER_HAL,
      })
      if (saya !== seq.current) return
      setAdaLagi(data.length > PER_HAL)
      setRows(data.slice(0, PER_HAL))
    } catch (e) {
      if (saya !== seq.current) return
      setErr(e instanceof Error ? e.message : String(e))
      setRows([]); setAdaLagi(false)
    } finally {
      if (saya === seq.current) setLoading(false)
    }
  }, [jenis, golongan, skpdIds, status, cari, hal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ringkasan KEDELAPAN jenis — di latar, gagal cuma jadi "tak terhitung".
  // Tak ikut `jenis`, jadi berpindah jenis tak menghitung ulang apa pun; angkanya
  // juga yang mengisi pemilih jenis (berapa yang belum per jenis).
  const muatRingkasan = useCallback(() => {
    setRingkasPer(null); setRingkasErr('')
    muatRingkasSemua(supabase, { tahun: TAHUN, golongan: SEMUA_KODE, skpdIds })
      .then(setRingkasPer)
      .catch(e => setRingkasErr(e instanceof Error ? e.message : String(e)))
  }, [skpdIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatBelum = useCallback(() => {
    if (jenis && skpdId != null) {
      muatBelumTercatat(supabase, { tahun: TAHUN, golongan, skpdId })
        .then(setBelumTercatat)
        .catch(e => setErr(e instanceof Error ? e.message : String(e)))
    } else {
      setBelumTercatat([])
    }
  }, [jenis, golongan, skpdId]) // eslint-disable-line react-hooks/exhaustive-deps

  const muatSamping = useCallback(() => { muatRingkasan(); muatBelum() }, [muatRingkasan, muatBelum])

  // Foto yang DIUNGGAH saat inventarisasi (kolom "Foto Inventarisasi") — satu
  // query kecil atas isian di halaman ini. Hiasan: gagal memuat cuma jadi
  // peringatan, tabelnya tetap tampil (pola `useFotoThumbs`).
  const [fotoIsian, setFotoIsian] = useState<Record<string, string[]>>({})
  const [fotoErr, setFotoErr] = useState('')
  useEffect(() => {
    const ids = rows.map(r => r.inv_id).filter((x): x is string => !!x)
    if (ids.length === 0) { setFotoIsian({}); setFotoErr(''); return }
    let batal = false
    muatFotoIsian(supabase, ids)
      .then(m => { if (!batal) { setFotoIsian(m); setFotoErr('') } })
      .catch(e => { if (!batal) { setFotoIsian({}); setFotoErr(e instanceof Error ? e.message : String(e)) } })
    return () => { batal = true }
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const thumbs = useFotoThumbs(
    rows.map(r => fotoMini(r.inv_id ? fotoIsian[r.inv_id] : undefined)).filter((x): x is string => !!x),
    BUCKET_FOTO_INVENTARISASI)

  useEffect(() => { if (skpdSiap) void muat() }, [skpdSiap, muat])
  useEffect(() => { if (skpdSiap) muatRingkasan() }, [skpdSiap, muatRingkasan])
  useEffect(() => { if (skpdSiap) muatBelum() }, [skpdSiap, muatBelum])

  async function buka(r: BarisLembar) {
    setMsg('')
    try {
      const baris: InvBaris = r.inv_id
        ? await muatIsian(supabase, r.inv_id)
        : { id: '', aset_id: r.aset_id, snapshot: snapshotDariLembar(r), jawaban: {}, foto_paths: [] }
      const validasi = r.inv_status === 'divalidasi'
      setTerbuka({
        baris, skpdId: r.skpd_id, golongan: golonganDariKode(r.kode),
        readOnly: pengawas || validasi,
        pesan: pengawas ? 'Akun pengawas hanya bisa melihat.'
          : validasi ? 'Isian ini sudah divalidasi Pengelola Barang. Untuk mengubahnya, minta Pengelola membatalkan validasinya di menu Validasi.'
          : undefined,
      })
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function bukaBelumTercatat(b: InvBaris | null, gol: string) {
    if (skpdId == null || !gol) return
    const baris: InvBaris = b || { id: '', aset_id: null, snapshot: {}, jawaban: {}, foto_paths: [] }
    const validasi = b?.status === 'divalidasi'
    setTerbuka({
      baris, skpdId, golongan: gol, readOnly: pengawas || validasi,
      pesan: validasi ? 'Lembar ini sudah divalidasi Pengelola Barang.' : undefined,
    })
  }

  async function simpan(t: Terbuka, jawaban: InvJawaban, foto: string[]) {
    await simpanIsian(supabase, {
      id: t.baris.id || null, asetId: t.baris.aset_id,
      skpdId: t.baris.aset_id ? null : t.skpdId, golongan: t.golongan, jawaban, foto,
    })
    setMsg(t.baris.aset_id
      ? 'Isian tersimpan — barang ini masuk antrean validasi Pengelola Barang.'
      : 'Lembar BMD Belum Tercatat tersimpan.')
    await muat()
    muatSamping()
  }

  async function hapusIsian(r: BarisLembar) {
    const id = r.inv_id
    if (!id) return
    await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus isian barang ini?',
      subjudul: r.nama_barang || r.kode,
      isi: <>Isian yang tersimpan <b>dihapus total</b> — barang ini kembali ke status &ldquo;belum
        diinventarisasi&rdquo; dan harus diisi ulang dari awal (jawaban, foto, & catatan Pengelola Barang
        ikut hilang). Daftar Barang tidak tersentuh.</>,
      labelYa: 'Ya, hapus isian',
      kerjakan: async () => {
        const { error } = await supabase.rpc('fn_inventarisasi_hapus_isian', { p_id: id })
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Isian dihapus — barang ini bisa diinventarisasi ulang.')
        await muat(); muatSamping()
      },
    })
  }

  async function hapusBelumTercatat(b: InvBaris) {
    await konfirmasi({
      nada: 'merah', ikon: '🗑', judul: 'Hapus lembar "BMD Belum Tercatat" ini?',
      isi: <>Temuan ini dibuang dari hasil inventarisasi. Daftar Barang tidak tersentuh — barangnya
        memang belum pernah tercatat di sana.</>,
      labelYa: 'Hapus lembar',
      kerjakan: async () => {
        const { error } = await supabase.rpc('fn_inventarisasi_hapus_belum_tercatat', { p_id: b.id })
        if (error) { setMsg(`Error: ${error.message}`); return }
        setMsg('Lembar BMD Belum Tercatat dihapus.')
        muatSamping()
      },
    })
  }

  const statusBaris = (r: BarisLembar): StatusTampil => r.inv_status || 'belum'
  const ringkas = !ringkasPer || !jenis ? null
    : golongan ? ringkasPer[golongan] ?? null
    : jumlahRingkas(SEMUA_KODE.map(k => ringkasPer[k] ?? null))
  const belum = ringkas ? belumDiinventarisasi(ringkas) : null
  // Angka di pemilih jenis: berapa yang BELUM diinventarisasi per jenis.
  const hitungJenis: Record<string, number | null> = {}
  if (ringkasPer) {
    for (const k of SEMUA_KODE) { const x = ringkasPer[k]; hitungJenis[k] = x ? belumDiinventarisasi(x) : null }
    const tot = jumlahRingkas(SEMUA_KODE.map(k => ringkasPer[k] ?? null))
    hitungJenis[JENIS_SEMUA] = tot ? belumDiinventarisasi(tot) : null
  }
  const tampilMerek = !config || config.merekTipe
  const nKolom = tampilMerek ? 9 : 8

  return (
    <FormShell
      judul={`Lembar Kerja Inventarisasi${config ? ` — ${config.label}` : jenis === JENIS_SEMUA ? ' — Semua Jenis Aset' : ''}`}
      deskripsi={`${config ? `Format ${config.format}` : 'Format III.A.1–III.A.6 mengikuti jenis tiap barang'} · Tahun ${TAHUN}. Daftar ini membaca Daftar Barang terkini — pilih barang lalu klik "Isi Inventarisasi". Tak perlu diajukan: Pengelola Barang memvalidasi per barang di menu Validasi.`}
      msg={msg}
    >
      <PemilihJenis value={jenis} onChange={setJenis} hitung={hitungJenis} labelHitung="barang belum diinventarisasi" />

      <div className="card p-4 mb-4 space-y-3">
        {/* Grid 2 kolom KEMBAR dgn baris Tim/BMD di bawah — supaya batas kolom
            (garis tengah) SKPD↔Cari sejajar dgn batas Tim Pelaksana↔BMD Belum
            Tercatat. Padding p-4 di kartu ini simetris kiri-kanan, jadi garis
            tengahnya tetap sama walau lebar kartu berbeda dgn baris di bawah. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-1">SKPD / Unit</label>
            <SkpdCombobox lockToOperator allowClear
              onChangeSelection={sel => {
                setSkpdId(sel.skpdId); setSkpdIds(sel.descendantIds); setHal(0); setSkpdSiap(true)
              }}
              placeholder="Semua SKPD..." />
          </div>
          <div className="flex gap-2 items-end min-w-0">
            <form className="flex gap-2 items-end flex-1 min-w-0"
              onSubmit={e => { e.preventDefault(); setCari(cariKetik); setHal(0) }}>
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-500 mb-1">Cari</label>
                <input className="select-filter w-full" value={cariKetik} onChange={e => setCariKetik(e.target.value)}
                  placeholder="Nama barang, NIBAR, kode register, kode barang, merek, no. polisi..." />
              </div>
              <button type="submit" className="btn-secondary text-sm">Cari</button>
            </form>
            <div className="flex-shrink-0">
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select className="select-filter" value={status}
                onChange={e => { setStatus(e.target.value as FilterLembar); setHal(0) }}>
                <option value="semua">Semua barang</option>
                <option value="belum">Belum diinventarisasi</option>
                <option value="diisi">Menunggu validasi</option>
                <option value="divalidasi">Divalidasi</option>
              </select>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
          {ringkas ? (
            <>
              <span><b>{ringkas.total_aset.toLocaleString('id-ID')}</b> barang aktif</span>
              <span className="text-gray-500">{(belum ?? 0).toLocaleString('id-ID')} belum diinventarisasi</span>
              <span className="text-amber-700">{ringkas.menunggu.toLocaleString('id-ID')} menunggu validasi</span>
              <span className="text-teal">{ringkas.divalidasi.toLocaleString('id-ID')} divalidasi</span>
            </>
          ) : ringkasErr ? (
            <span className="text-amber-700">Jumlah tak terhitung ({ringkasErr}) — daftarnya tetap bisa dipakai.</span>
          ) : !jenis ? null : skpdSiap ? (
            <span className="text-gray-400">menghitung jumlah…</span>
          ) : null}
        </div>
        {ringkas && ringkas.berubah > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs">
            🔒 {ringkas.berubah.toLocaleString('id-ID')} barang yang sudah diinventarisasi di sini kini
            pindah SKPD, direklas, atau keluar dari Daftar Barang — hasilnya terkunci di posisi lama.{' '}
            <Link href={`/dashboard/inventarisasi/validasi?jenis=${jenis}`} className="underline font-medium">
              Lihat di menu Validasi → Posisi berubah
            </Link>
          </div>
        )}
      </div>

      {skpdId != null && jenis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 items-start">
          {/* min-w-0 di KEDUA kolom — tanpa ini, isi "BMD Belum Tercatat" yang
              ber-whitespace-nowrap (tombol Ubah/Hapus/🖨 sebaris) memaksa
              lebar minimum kolomnya membengkak (grid item default
              min-width:auto = min-content), sehingga kolom kanan jadi LEBIH
              LEBAR dari kolom Tim Pelaksana walau sama-sama diberi 1fr. */}
          <div className="card p-4 min-w-0">
            <TimPanel skpdId={skpdId} tahun={TAHUN} bolehUbah={!pengawas} />
          </div>
          <div className="card p-4 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-gray-800">BMD Belum Tercatat (Format III.A.7)</p>
              {!pengawas && (golongan ? (
                <button onClick={() => bukaBelumTercatat(null, golongan)} className="btn-primary text-xs">+ Tambah temuan</button>
              ) : (
                // Mode "Semua jenis": format III.A.7-nya tetap per jenis aset,
                // jadi jenis temuannya WAJIB dipilih dulu — lewat pilihan ini
                // sekaligus, bukan tombol yang ditolak sesudah ditekan.
                <select className="select-filter text-xs" value=""
                  onChange={e => { if (e.target.value) bukaBelumTercatat(null, e.target.value) }}>
                  <option value="">+ Tambah temuan — pilih jenis…</option>
                  {JENIS_INVENTARISASI.map(j => <option key={j.kode} value={j.kode}>{j.kode} — {j.label}</option>)}
                </select>
              ))}
            </div>
            {belumTercatat.length === 0 ? (
              <p className="text-xs text-gray-400">Belum ada temuan untuk unit ini.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {belumTercatat.map(b => {
                  const st: StatusTampil = b.status || 'diisi'
                  return (
                    <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{b.jawaban?.baru?.nama_barang || '(tanpa nama)'}</p>
                        <p className="text-gray-400 truncate">{b.jawaban?.baru?.kode_barang || '—'} · {b.jawaban?.baru?.spesifikasi || '—'}{!golongan && ` · ${b.golongan}`}</p>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap flex-shrink-0">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span>
                        <button onClick={() => bukaBelumTercatat(b, b.golongan)} className="text-teal hover:underline font-medium">
                          {st === 'diisi' && !pengawas ? 'Ubah' : 'Lihat'}
                        </button>
                        {st === 'diisi' && !pengawas && (
                          <button onClick={() => hapusBelumTercatat(b)} className="text-red-500 hover:text-red-700">Hapus</button>
                        )}
                        <a href={`/cetak/inventarisasi-lki?id=${b.id}`} target="_blank" rel="noopener noreferrer"
                          className="text-gray-500 hover:text-gray-800">🖨</a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}
      {fotoErr && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Foto inventarisasi tidak bisa dimuat ({fotoErr}). Daftar barangnya tetap benar.
        </div>
      )}

      <div className="card overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-th whitespace-nowrap">Kode / Uraian Barang</th>
                <th className="table-th">Nama Barang / NIBAR</th>
                {tampilMerek && <th className="table-th">Merek / Tipe</th>}
                <th className="table-th whitespace-nowrap">Tgl Perolehan</th>
                <th className="table-th whitespace-nowrap text-right">Nilai Perolehan</th>
                <th className="table-th whitespace-nowrap">Kondisi Tercatat</th>
                <th className="table-th whitespace-nowrap text-center">Foto Inventarisasi</th>
                <th className="table-th">Status Inventarisasi</th>
                <th className="table-th whitespace-nowrap text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!jenisSiap ? (
                <tr><td colSpan={nKolom} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : !jenis ? (
                <tr><td colSpan={nKolom} className="table-td text-center py-10 text-gray-500">
                  Pilih jenis aset di atas untuk menampilkan daftar barang.
                </td></tr>
              ) : !skpdSiap || loading ? (
                <tr><td colSpan={nKolom} className="table-td text-center py-10 text-gray-400">Memuat...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={nKolom} className="table-td text-center py-10 text-gray-400">
                  {err ? 'Daftar tidak bisa dimuat.' : 'Tidak ada barang untuk filter ini.'}
                </td></tr>
              ) : rows.map(r => {
                const st = statusBaris(r)
                return (
                  <tr key={r.aset_id} className="align-top">
                    <td className="table-td text-xs">
                      <p className="text-gray-700 whitespace-nowrap">{r.kode}</p>
                      <p className="text-gray-400">{r.uraian || '—'}</p>
                    </td>
                    <td className="table-td text-xs">
                      <p className="font-medium text-gray-800">{r.nama_barang || '—'}</p>
                      <p className="text-gray-400 break-all">{r.nibar || '—'}</p>
                      {r.kode_register && <p className="text-gray-400 break-all">REG {r.kode_register}</p>}
                      <p className="text-gray-400">{r.skpd_nama || ''}</p>
                    </td>
                    {tampilMerek && <td className="table-td text-xs text-gray-600">{r.merek_tipe || '—'}</td>}
                    <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.tgl_perolehan || '—'}</td>
                    <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah2(r.nilai_perolehan || 0)}</td>
                    <td className="table-td text-xs text-gray-500">{normalKondisi(r.kondisi_barang) || '—'}</td>
                    <td className="table-td text-center">
                      {/* Foto yang DIUNGGAH petugas saat inventarisasi — bukan foto
                          register. Barang yang belum diinventarisasi tak punya
                          isian, jadi selnya "-". Klik → ukuran asli. */}
                      <FotoSel besar bucket={BUCKET_FOTO_INVENTARISASI} judul={r.nama_barang}
                        paths={r.inv_id ? (fotoIsian[r.inv_id] || []) : []}
                        thumbUrl={(() => { const m = fotoMini(r.inv_id ? fotoIsian[r.inv_id] : undefined); return m ? thumbs[m] : undefined })()} />
                    </td>
                    <td className="table-td text-xs">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[st]}`}>
                        {STATUS_LABEL[st]}
                      </span>
                      {st === 'diisi' && r.inv_catatan && (
                        <p className="mt-1 text-[11px] text-red-600">↩ Dikembalikan: {r.inv_catatan}</p>
                      )}
                      <TransaksiSesudah transaksi={r.transaksi_sesudah || []} />
                    </td>
                    <td className="table-td text-xs text-right whitespace-nowrap">
                      <button onClick={() => buka(r)} className="text-teal hover:underline font-medium">
                        {st === 'belum' ? (pengawas ? 'Lihat' : 'Isi Inventarisasi')
                          : st === 'diisi' && !pengawas ? 'Ubah Isian' : 'Lihat'}
                      </button>
                      {st === 'diisi' && !pengawas && (
                        <button onClick={() => hapusIsian(r)} className="ml-3 text-red-500 hover:text-red-700">
                          Hapus Isian
                        </button>
                      )}
                      {r.inv_id && (
                        <a href={`/cetak/inventarisasi-lki?id=${r.inv_id}`} target="_blank" rel="noopener noreferrer"
                          className="ml-3 text-gray-500 hover:text-gray-800" title="Cetak lembar kerja barang ini">🖨</a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>Halaman {hal + 1}</span>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" disabled={!jenis || hal === 0 || loading} onClick={() => setHal(h => h - 1)}>← Sebelumnya</button>
            <button className="btn-secondary text-xs" disabled={!jenis || !adaLagi || loading} onClick={() => setHal(h => h + 1)}>Berikutnya →</button>
          </div>
        </div>
      </div>

      {terbuka && (
        <LkiForm
          baris={terbuka.baris}
          config={konfigLki(terbuka.golongan)}
          golongan={terbuka.golongan}
          skpdId={terbuka.skpdId}
          readOnly={terbuka.readOnly}
          pesanReadOnly={terbuka.pesan}
          onSimpan={(jawaban, foto) => simpan(terbuka, jawaban, foto)}
          onTutup={() => setTerbuka(null)}
        />
      )}
    </FormShell>
  )
}
