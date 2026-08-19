'use client'
// Standar Harga → Validasi. Satu pintu keputusan Pengelola Barang, pola kembar
// dengan RKBMD → Validasi: dua tab (Usulan · Tervalidasi), Setujui · Tolak ·
// Buka Kunci semuanya di sini.
//
// ⚠️ MENYETUJUI DI SINI PUNYA AKIBAT NYATA, tidak seperti RKBMD. Menyetujui
// RKBMD cuma membekukan dokumen perencanaan; menyetujui usulan standar harga
// MEMASUKKAN barisnya ke BAK BERSAMA (`rkbmd_standar` / `rkbmd_sbsk`) yang
// dipakai seluruh SKPD menyusun RKBMD Pengadaan. Karena itu hasilnya dilaporkan
// apa adanya lewat `ringkasHasil` — berapa yang benar-benar baru, berapa yang
// ternyata sudah ada (rekeningnya digabung, barangnya TIDAK diduplikasi).
//
// "Buka Kunci" mengembalikan usulannya ke draft SEKALIGUS menarik barisnya dari
// bak bersama — dua hal itu satu paket, dan tak bisa dipisah (migrasi
// 20260814_01). Kalau salah satu barangnya sudah dipakai di dokumen RKBMD, DB
// MENOLAK seluruh operasinya: barangnya harus dilepas dulu dari RKBMD. Alurnya
// maju (usulan → ditetapkan → dipakai) dan mundur (dilepas → dibuka), tanpa
// potong kompas di tengah.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { backdropClose } from '@/components/backdropClose'
import KonfirmasiModal from '@/components/KonfirmasiModal'
import { formatRupiah } from '@/lib/export'
import {
  USULAN_JENIS, USULAN_STATUS_META, pakaiKodeBarang, pakaiRekening,
  fetchUsulanAntrean, fetchUsulanItems, setStatusUsulan, setujuiUsulan, ringkasHasil,
  bukaKunciUsulan, ringkasBukaKunci,
  type UsulanJenis, type UsulanHeader, type UsulanItem, type UsulanStatus,
} from '@/lib/rkbmdStandarUsulan'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const JENIS_LABEL: Record<string, string> = Object.fromEntries(USULAN_JENIS.map(j => [j.key, j.label]))

/** Kembar dengan STATUS_BELUM di RkbmdValidasi — daftar eksplisit supaya status
 *  baru harus dipikirkan masuk tab mana, bukan diam-diam ikut. */
const STATUS_BELUM: UsulanStatus[] = ['draft', 'diajukan', 'ditolak']

type Tab = 'usulan' | 'tervalidasi'
type Baris = UsulanHeader & { skpd_nama: string | null; jumlah_item: number }

/** Keputusan yang sedang ditanyakan lewat pop-up. Satu state untuk ketiganya —
 *  ketiganya saling meniadakan (tak mungkin menyetujui & menolak sekaligus),
 *  dan tiga bendera terpisah cepat atau lambat menyala dua-duanya. */
type Konfirmasi = { aksi: 'setujui' | 'tolak' | 'buka'; h: Baris }

export default function StandarValidasi() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  const [tab, setTab] = useState<Tab>('usulan')
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState<Baris[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<Baris | null>(null)
  const [konfirm, setKonfirm] = useState<Konfirmasi | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single()
      setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const data = await fetchUsulanAntrean(supabase, tahun,
        tab === 'tervalidasi' ? ['disetujui'] : STATUS_BELUM)
      if (tab === 'tervalidasi') {
        data.sort((a, b) => (a.skpd_nama || '').localeCompare(b.skpd_nama || ''))
      }
      setRows(data)
    } catch (e) {
      setRows([]); setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [tahun, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Pop-up sengaja DIBIARKAN TERBUKA selama pekerjaannya berjalan (ditutup di
  // `finally`, bukan saat tombolnya ditekan): menyetujui usulan standar harga
  // memanggil RPC yang bisa memasukkan ratusan baris ke bak bersama, dan tanpa
  // keadaan "sedang diproses" layar cuma diam — persis keterbatasan `confirm()`
  // yang membuat pop-up ini dibangun.
  async function jalankan(id: string, fn: () => Promise<string>) {
    setBusy(id); setErr(''); setMsg('')
    try {
      setMsg(await fn())
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null); setKonfirm(null)
    }
  }

  function putuskan(k: Konfirmasi, catatan: string) {
    const { aksi, h } = k
    if (aksi === 'setujui') {
      jalankan(h.id, async () => ringkasHasil(await setujuiUsulan(supabase, h.id)))
    } else if (aksi === 'tolak') {
      jalankan(h.id, async () => {
        await setStatusUsulan(supabase, h.id, 'ditolak', catatan || null)
        return 'Usulan dikembalikan ke SKPD.'
      })
    } else {
      jalankan(h.id, async () => ringkasBukaKunci(await bukaKunciUsulan(supabase, h.id)))
    }
  }

  return (
    <FormShell
      judul="Validasi Standar Harga"
      deskripsi="Telaah usulan standar harga seluruh SKPD. Yang disetujui langsung menjadi acuan bersama — dasar penyusunan RKBMD Pengadaan."
      msg={msg}
      headerRight={
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tahun Anggaran</label>
          <input type="number" className="select-filter w-28" value={tahun}
            onChange={e => setTahun(Number(e.target.value) || TAHUN_DEFAULT)} />
        </div>
      }
    >
      {err && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

      {!isAdmin && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          Menelaah standar harga adalah wewenang Pengelola Barang (admin pemda). Anda tetap bisa melihat
          antreannya, tapi tombol Setujui/Tolak/Buka Kunci tidak tersedia.
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
        {([
          ['usulan', 'Usulan'],
          ['tervalidasi', 'Tervalidasi'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === k ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">SKPD</th>
              <th className="table-th">Jenis</th>
              <th className="table-th">Status</th>
              <th className="table-th text-right">Baris</th>
              <th className="table-th">Diajukan</th>
              <th className="table-th w-56">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : err ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-red-500">
                Data tidak ditampilkan karena terjadi kesalahan di atas.
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center py-8 text-gray-400">
                {tab === 'tervalidasi'
                  ? `Belum ada usulan standar harga TA ${tahun} yang ditetapkan.`
                  : `Tidak ada usulan standar harga TA ${tahun} yang sedang disusun atau menunggu telaah.`}
              </td></tr>
            ) : rows.map(h => (
              <tr key={h.id}>
                <td className="table-td text-xs text-gray-800">{h.skpd_nama || `SKPD #${h.skpd_id}`}</td>
                <td className="table-td text-xs">{JENIS_LABEL[h.jenis] || h.jenis}</td>
                <td className="table-td text-xs">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${USULAN_STATUS_META[h.status].cls}`}>
                    {USULAN_STATUS_META[h.status].label}
                  </span>
                </td>
                <td className="table-td text-xs text-right">{h.jumlah_item}</td>
                <td className="table-td text-xs text-gray-400 whitespace-nowrap">{h.diajukan_at?.slice(0, 10) || '—'}</td>
                <td className="table-td whitespace-nowrap">
                  <button onClick={() => setDetail(h)}
                    className="text-gray-500 hover:text-gray-700 text-xs mr-3">Lihat</button>
                  {/* Setujui/Tolak hanya untuk yang benar-benar menunggu keputusan —
                      draft & yang sudah dikembalikan ada di tangan SKPD. */}
                  {isAdmin && h.status === 'diajukan' && (
                    <>
                      <button onClick={() => setKonfirm({ aksi: 'setujui', h })} disabled={busy === h.id}
                        className="text-teal hover:underline text-xs font-medium mr-3">Setujui</button>
                      <button onClick={() => setKonfirm({ aksi: 'tolak', h })} disabled={busy === h.id}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">Tolak</button>
                    </>
                  )}
                  {isAdmin && h.status === 'disetujui' && (
                    <button onClick={() => setKonfirm({ aksi: 'buka', h })} disabled={busy === h.id}
                      className="text-gray-600 hover:text-gray-800 text-xs font-medium">Buka Kunci</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && <DetailModal h={detail} onClose={() => setDetail(null)} />}
      {konfirm && (
        <KonfirmasiStandar
          k={konfirm}
          busy={busy === konfirm.h.id}
          onBatal={() => setKonfirm(null)}
          onYa={(catatan) => putuskan(konfirm, catatan)}
        />
      )}
    </FormShell>
  )
}

// ── Isi pop-up untuk ketiga keputusan ───────────────────────────────────────
// Dipisah dari badan halaman supaya kalimatnya bisa dibaca berdampingan: yang
// paling gampang keliru di layar ini bukan tombolnya, melainkan mengira "Tolak"
// dan "Buka Kunci" sama-sama sekadar mengembalikan dokumen ke SKPD. Padahal
// yang satu belum pernah jadi acuan, yang lain MENARIK barisnya dari acuan
// bersama yang mungkin sudah dipakai SKPD lain menyusun anggaran.
function KonfirmasiStandar({ k, busy, onYa, onBatal }: {
  k: Konfirmasi; busy: boolean; onYa: (catatan: string) => void; onBatal: () => void
}) {
  const { aksi, h } = k
  const subjudul = `${h.skpd_nama || `SKPD #${h.skpd_id}`} · ${JENIS_LABEL[h.jenis] || h.jenis} · TA ${h.tahun}`
  const rincian = [
    { label: 'Jumlah baris', nilai: `${h.jumlah_item} baris` },
    { label: 'Diajukan', nilai: h.diajukan_at?.slice(0, 10) || '—' },
  ]

  if (aksi === 'setujui') {
    return (
      <KonfirmasiModal
        nada="teal" ikon="✓" judul="Tetapkan sebagai acuan bersama?" subjudul={subjudul}
        rincian={rincian} labelYa="Ya, setujui" busy={busy} onYa={onYa} onBatal={onBatal}
      >
        Seluruh barisnya <b>masuk ke acuan bersama</b> dan langsung bisa dipakai semua SKPD
        menyusun RKBMD Pengadaan. Barang yang sudah ada tidak diduplikasi — kode rekeningnya
        digabungkan ke barang yang sama.
      </KonfirmasiModal>
    )
  }

  if (aksi === 'tolak') {
    return (
      <KonfirmasiModal
        nada="merah" ikon="↩" judul="Kembalikan usulan ke SKPD?" subjudul={subjudul}
        rincian={rincian} labelYa="Ya, kembalikan" busy={busy} onYa={onYa} onBatal={onBatal}
        catatan={{
          label: 'Catatan telaah',
          placeholder: 'Mis. harga laptop di baris 3–7 melebihi pagu; lampirkan pembanding e-katalog.',
          petunjuk: <>Boleh dikosongkan, tapi SKPD tak akan tahu apa yang harus diperbaiki.</>,
        }}
      >
        Usulan kembali bisa disunting SKPD. Tidak ada baris yang masuk acuan bersama.
      </KonfirmasiModal>
    )
  }

  return (
    <KonfirmasiModal
      nada="amber" ikon="🔓" judul="Buka kunci usulan yang sudah ditetapkan?" subjudul={subjudul}
      rincian={rincian} labelYa="Ya, buka kunci" busy={busy} onYa={onYa} onBatal={onBatal}
      peringatan={<>
        Kalau ada barangnya yang <b>sudah dipakai di dokumen RKBMD</b>, permintaan ini
        ditolak <b>seluruhnya</b> — tidak ada yang ditarik sebagian. Lepaskan dulu barangnya
        dari RKBMD, baru usulan ini bisa dibuka.
      </>}
    >
      Barisnya <b>ditarik dari acuan bersama</b> sehingga tak bisa lagi dipakai SKPD mana pun,
      lalu dikembalikan ke meja SKPD: jadi draft lagi, atau digabung ke usulan yang sedang
      mereka susun kalau sudah ada.
    </KonfirmasiModal>
  )
}

// ── Pop-up rincian usulan ───────────────────────────────────────────────────
// Telaah dilakukan DI TEMPAT: penelaah tak perlu keluar ke menu Usulan lalu
// memilih SKPD lagi dari awal (pelajaran yang sama dgn pop-up Validasi RKBMD).
function DetailModal({ h, onClose }: { h: Baris; onClose: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<UsulanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const sbsk = h.jenis === 'sbsk'
  const adaKode = pakaiKodeBarang(h.jenis as UsulanJenis)
  const adaRek = pakaiRekening(h.jenis as UsulanJenis)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await fetchUsulanItems(supabase, h.id)
        if (alive) setItems(data)
      } catch (e) {
        if (alive) { setItems([]); setErr((e as Error).message) }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [h.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-5xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">
              Usulan {JENIS_LABEL[h.jenis] || h.jenis} — {h.skpd_nama || `SKPD #${h.skpd_id}`}
            </h3>
            <p className="text-xs text-gray-500">
              TA {h.tahun} · {h.jumlah_item} baris · diajukan {h.diajukan_at?.slice(0, 10) || '—'}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="p-5">
          {err && <div className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Memuat rincian...</p>
          ) : err ? null : items.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Usulan ini belum berisi baris apa pun.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th w-10">No</th>
                    {adaKode && <th className="table-th">Kode Barang</th>}
                    <th className="table-th">Nama / Uraian</th>
                    <th className="table-th">Satuan</th>
                    {sbsk && <th className="table-th">Satuan Pengukur</th>}
                    <th className="table-th text-right">{sbsk ? 'Kuantitas Standar' : 'Nilai'}</th>
                    {adaRek && <th className="table-th">Kode Rekening</th>}
                    <th className="table-th">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((it, i) => (
                    <tr key={it.id}>
                      <td className="table-td text-xs text-gray-400">{it.no_urut ?? i + 1}</td>
                      {adaKode && <td className="table-td text-xs whitespace-nowrap">{it.kode || '—'}</td>}
                      <td className="table-td text-xs text-gray-800">
                        {it.nama}
                        {it.merk_tipe && <span className="block text-[11px] text-gray-400">{it.merk_tipe}</span>}
                      </td>
                      <td className="table-td text-xs text-gray-500">{it.satuan || '—'}</td>
                      {sbsk && <td className="table-td text-xs text-gray-500">{it.satuan_pengukur || '—'}</td>}
                      <td className="table-td text-xs text-right whitespace-nowrap">
                        {sbsk ? (it.kuantitas_standar ?? '—') : formatRupiah(it.harga)}
                        {it.tkdn != null && <span className="block text-[10px] text-gray-400">TKDN {it.tkdn}%</span>}
                      </td>
                      {adaRek && (
                        <td className="table-td text-[11px] text-gray-500">
                          {it.rekening.length === 0 ? '—' : it.rekening.map(k => <div key={k}>{k}</div>)}
                        </td>
                      )}
                      <td className="table-td text-xs text-gray-500">{it.keterangan || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
