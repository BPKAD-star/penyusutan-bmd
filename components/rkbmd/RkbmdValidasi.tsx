'use client'
// RKBMD > Validasi — antrean telaah bagi Pengelola Barang (admin pemda).
// Semua dokumen berstatus 'diajukan' dari SELURUH SKPD dikumpulkan di satu
// layar, supaya penelaah tidak perlu membuka SKPD satu per satu di menu Usulan
// (yang memang dibuat per-SKPD untuk penyusunnya).
//
// Telaahnya PER DOKUMEN, bukan per kartu: satu SKPD mengajukan seluruh kartunya
// sekaligus, dan menolak berarti seluruh dokumen kembali ke SKPD untuk direview
// (keputusan user 2026-08-10). Tidak ada setuju-sebagian.
//
// NON-LEDGER: menyetujui RKBMD tidak membuat aset atau baris `transaksi_bmd`
// apa pun; ia cuma membekukan dokumen perencanaan.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormShell from '@/components/pengelolaan/FormShell'
import { backdropClose } from '@/components/backdropClose'
import KonfirmasiModal from '@/shared/ui/KonfirmasiModal'
import { formatRupiah } from '@/lib/export'
import { RKBMD_JENIS, STATUS_META, type RkbmdStatus, type RkbmdPaket } from '@/lib/rkbmd'

const TAHUN_DEFAULT = new Date().getFullYear() + 1
const JENIS_LABEL: Record<string, string> = Object.fromEntries(RKBMD_JENIS.map(j => [j.key, j.label]))

type Antrean = {
  id: string
  skpd_id: number
  tahun_anggaran: number
  jenis: string
  versi: string
  status: RkbmdStatus
  diajukan_at: string | null
  admin_skpd: { nama: string } | null
  /** SKPD menyatakan tidak ada usulan (migrasi 20260813_02). WAJIB ditampilkan:
   *  tanpa penanda, dokumen nihil terlihat persis seperti dokumen yang lupa
   *  diisi, dan penelaah bisa menolaknya karena mengira SKPD-nya belum bekerja. */
  nihil: boolean
  dokumen_paths: string[]
  /** Signed URL lampiran, dirakit saat memuat antrean. Sengaja DIMUAT DI MUKA,
   *  bukan saat tombolnya diklik: membuat signed URL itu asinkron, dan
   *  `window.open` sesudah `await` akan diblokir peramban sbg pop-up. Antrean
   *  telaah selalu pendek, jadi biayanya kecil. */
  dokumen_url: string
  pakets: RkbmdPaket[]
  jumlah_item: number
  total: number
}

/** Dokumen yang BELUM ditetapkan. Daftar eksplisit, bukan "semua kecuali
 *  disetujui": status baru harus dipikirkan masuk tab mana, bukan diam-diam
 *  ikut ke sini. Kembar dengan `STATUS_BELUM` di RkbmdPelaporan. */
const STATUS_BELUM: RkbmdStatus[] = ['draft', 'diajukan', 'ditolak']

type Tab = 'usulan' | 'tervalidasi'

/** Keputusan yang sedang ditanyakan lewat pop-up. Satu state untuk ketiganya —
 *  ketiganya saling meniadakan, dan tiga bendera terpisah cepat atau lambat
 *  menyala dua-duanya. Kembar dengan `Konfirmasi` di StandarValidasi. */
type Konfirmasi = { aksi: 'setujui' | 'tolak' | 'buka'; h: Antrean }

export default function RkbmdValidasi() {
  const supabase = createClient()
  const [tahun, setTahun] = useState(TAHUN_DEFAULT)
  // SATU PINTU untuk seluruh keputusan telaah (keputusan user 2026-08-13):
  // Setujui, Tolak, DAN Buka Kunci ada di layar ini. Buka Kunci sebelumnya di
  // menu Usulan — tempat SKPD menyusun — sehingga wewenang Pengelola tercecer
  // di dua menu dan operator SKPD melihat tombol yang bukan haknya.
  const [tab, setTab] = useState<Tab>('usulan')
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState<Antrean[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<Antrean | null>(null)
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
    let q = supabase.from('rkbmd')
      .select('id,skpd_id,tahun_anggaran,jenis,versi,status,diajukan_at,dokumen_paths,nihil,admin_skpd(nama)')
      .eq('tahun_anggaran', tahun)
    // Tab menentukan lingkupnya, dan lingkup itu MUTLAK: tab "Tervalidasi" tak
    // boleh bisa memuat dokumen yang belum ditetapkan, sebaliknya juga.
    q = tab === 'tervalidasi' ? q.eq('status', 'disetujui') : q.in('status', STATUS_BELUM)
    const { data, error } = await q.order('diajukan_at', { ascending: true })
    if (error) { setErr(`gagal membaca antrean telaah: ${error.message}`); setRows([]); setLoading(false); return }

    const base = ((data || []) as unknown as Omit<Antrean, 'pakets' | 'jumlah_item' | 'total' | 'dokumen_url'>[])
      .map(h => ({ ...h, dokumen_url: '', pakets: [] as RkbmdPaket[], jumlah_item: 0, total: 0 }))

    // Tautan lampiran bertanda tangan — inilah yang ditelaah bersama angkanya.
    // Bucket privat → wajib signed URL (~1 jam), bukan public URL.
    await Promise.all(base.map(async h => {
      const p = h.dokumen_paths?.[0]
      if (!p) return
      const { data: sig } = await supabase.storage.from('dokumen-sumber').createSignedUrl(p, 3600)
      h.dokumen_url = sig?.signedUrl || ''
    }))

    // Kartu + rekap item untuk semua dokumen di antrean sekaligus — bukan N
    // query, dan tetap kecil karena yang berstatus 'diajukan' selalu sedikit.
    if (base.length > 0) {
      const byId = new Map(base.map(h => [h.id, h]))
      const ids = base.map(h => h.id)
      const [pk, it] = await Promise.all([
        supabase.from('rkbmd_paket').select('id,rkbmd_id,no_urut,program,kegiatan,sub_kegiatan,keterangan')
          .in('rkbmd_id', ids).order('no_urut'),
        supabase.from('rkbmd_item').select('rkbmd_id,total_anggaran').in('rkbmd_id', ids),
      ])
      if (pk.error || it.error) {
        setErr(`gagal membaca isi RKBMD: ${(pk.error || it.error)!.message}`)
        setRows([]); setLoading(false); return
      }
      for (const p of (pk.data || []) as RkbmdPaket[]) byId.get(p.rkbmd_id)?.pakets.push(p)
      for (const r of (it.data || []) as { rkbmd_id: string; total_anggaran: number | null }[]) {
        const h = byId.get(r.rkbmd_id)
        if (h) { h.jumlah_item += 1; h.total += r.total_anggaran || 0 }
      }
    }
    // Antrean telaah urut waktu pengajuan; daftar yang sudah ditetapkan tak
    // punya urutan alami itu (banyak yang `diajukan_at` sama) → urut SKPD.
    if (tab === 'tervalidasi') {
      base.sort((a, b) => (a.admin_skpd?.nama || '').localeCompare(b.admin_skpd?.nama || ''))
    }
    setRows(base)
    setLoading(false)
  }, [tahun, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Ketiga keputusan lewat satu jalur — pop-up sengaja DIBIARKAN TERBUKA selama
  // pekerjaannya berjalan (ditutup di `finally`, bukan saat tombolnya ditekan),
  // supaya ada keadaan "sedang diproses" yang dulu mustahil ditampilkan karena
  // `confirm()` membekukan seluruh tab. Lihat shared/ui/KonfirmasiModal.tsx.
  //
  // Buka Kunci ada di layar ini sejak 2026-08-13 (pindah dari menu Usulan):
  // menyetujui, menolak, dan membatalkan penetapan adalah tiga sisi dari satu
  // wewenang yang sama, jadi tempatnya satu layar.
  async function putuskan(k: Konfirmasi, catatan: string) {
    const { aksi, h } = k
    setBusy(h.id); setErr(''); setMsg('')
    try {
      if (aksi === 'setujui') {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('rkbmd').update({
          status: 'disetujui', approved_by: user?.id || null, approved_at: new Date().toISOString(),
        }).eq('id', h.id)
        if (error) { setErr(error.message); return }
        setMsg('RKBMD disetujui & ditetapkan.')
      } else if (aksi === 'tolak') {
        const { error } = await supabase.from('rkbmd')
          .update({ status: 'ditolak', catatan_telaah: catatan || null }).eq('id', h.id)
        if (error) { setErr(error.message); return }
        setMsg('RKBMD dikembalikan ke SKPD — seluruh kartunya ikut dibuka untuk direview.')
      } else {
        const { error } = await supabase.from('rkbmd').update({ status: 'draft' }).eq('id', h.id)
        if (error) { setErr(error.message); return }
        setMsg('Kunci dibuka — dokumen kembali ke draft di menu Usulan SKPD.')
      }
      await load()
    } finally {
      setBusy(null); setKonfirm(null)
    }
  }

  return (
    <FormShell
      judul="Validasi RKBMD"
      deskripsi="Satu pintu keputusan Pengelola Barang atas RKBMD seluruh SKPD: menelaah usulan yang masuk (setujui/tolak) dan membuka kunci dokumen yang sudah ditetapkan. Keputusan berlaku untuk satu dokumen utuh beserta semua kartunya."
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
          Menelaah RKBMD adalah wewenang Pengelola Barang (admin pemda). Anda tetap bisa melihat antreannya,
          tapi tombol Setujui/Tolak/Buka Kunci tidak tersedia.
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
        {([
          ['usulan', 'Usulan', 'Draft, diajukan, & yang dikembalikan — pantau siapa yang belum menyusun'],
          ['tervalidasi', 'Tervalidasi', 'Sudah ditetapkan. Di sinilah Buka Kunci kalau perlu diperbaiki'],
        ] as [Tab, string, string][]).map(([k, label, ket]) => (
          <button key={k} onClick={() => setTab(k)} title={ket}
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
              <th className="table-th">Versi</th>
              <th className="table-th">Kartu (Sub Kegiatan)</th>
              <th className="table-th text-right">Item</th>
              <th className="table-th text-right">Total Anggaran</th>
              <th className="table-th">Diajukan</th>
              <th className="table-th w-44">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">Memuat...</td></tr>
            ) : err ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-red-500">Data tidak ditampilkan karena terjadi kesalahan di atas.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center py-8 text-gray-400">
                {tab === 'tervalidasi'
                  ? `Belum ada RKBMD TA ${tahun} yang ditetapkan.`
                  : `Tidak ada usulan RKBMD TA ${tahun} yang sedang disusun atau menunggu telaah.`}
              </td></tr>
            ) : rows.map(h => (
              <tr key={h.id}>
                <td className="table-td text-xs text-gray-800">{h.admin_skpd?.nama || `SKPD #${h.skpd_id}`}</td>
                <td className="table-td text-xs">
                  {JENIS_LABEL[h.jenis] || h.jenis}
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${STATUS_META[h.status].cls}`}>
                    {STATUS_META[h.status].label}
                  </span>
                </td>
                <td className="table-td text-xs text-gray-500">{h.versi === 'perubahan' ? 'Perubahan' : 'Murni'}</td>
                <td className="table-td text-xs text-gray-500">
                  {h.nihil ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">NIHIL</span>
                  ) : h.pakets.length === 0 ? '—' : (
                    <>
                      <div className="text-gray-700">{h.pakets.length} kartu</div>
                      {h.pakets.slice(0, 2).map(p => (
                        <div key={p.id} className="text-[11px] text-gray-400 truncate max-w-xs">
                          {p.sub_kegiatan || '(sub kegiatan belum dipilih)'}
                        </div>
                      ))}
                      {h.pakets.length > 2 && (
                        <div className="text-[11px] text-gray-400">+{h.pakets.length - 2} lainnya</div>
                      )}
                    </>
                  )}
                </td>
                <td className="table-td text-xs text-right">{h.jumlah_item}</td>
                <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(h.total)}</td>
                <td className="table-td text-xs text-gray-400 whitespace-nowrap">{h.diajukan_at?.slice(0, 10) || '—'}</td>
                <td className="table-td whitespace-nowrap">
                  {/* Pop-up di tempat — dulu menautkan ke menu Usulan, yang justru
                      memaksa penelaah keluar dari antrean lalu memilih SKPD lagi. */}
                  <button onClick={() => setDetail(h)}
                    className="text-gray-500 hover:text-gray-700 text-xs mr-3">Lihat</button>
                  {/* Lampiran bertanda tangan — yang ditelaah bukan cuma
                      angkanya, tapi juga kecocokannya dengan berkas yang
                      diteken kepala kantor. Sejak migrasi 20260813_01 lampiran
                      ini SYARAT pengajuan, jadi normalnya selalu ada; kalau
                      kosong, dokumennya diajukan sebelum aturan itu berlaku. */}
                  {h.dokumen_url ? (
                    <a href={h.dokumen_url} target="_blank" rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-700 text-xs mr-3"
                      title="Buka lembar usulan bertanda tangan + surat pengantar">📄 Dokumen</a>
                  ) : (
                    <span className="text-amber-600 text-xs mr-3"
                      title="Dokumen ini tidak punya lampiran bertanda tangan">⚠ Tanpa lampiran</span>
                  )}
                  {/* Setujui/Tolak hanya untuk yang BENAR-BENAR menunggu
                      keputusan. Tab "Usulan" juga memuat draft & yang sudah
                      dikembalikan — dokumen itu ada di tangan SKPD, bukan di
                      tangan penelaah, jadi tombolnya tak boleh muncul. */}
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
        <KonfirmasiRkbmd
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
// Dokumen NIHIL sengaja diberi baris rincian sendiri: ia dan dokumen yang lupa
// diisi sama-sama berjumlah 0 item, dan penelaah yang tak melihat pembedanya
// bisa menolak SKPD yang justru sudah menyatakan sikapnya.
function KonfirmasiRkbmd({ k, busy, onYa, onBatal }: {
  k: Konfirmasi; busy: boolean; onYa: (catatan: string) => void; onBatal: () => void
}) {
  const { aksi, h } = k
  const subjudul = `${h.admin_skpd?.nama || `SKPD #${h.skpd_id}`} · ${JENIS_LABEL[h.jenis] || h.jenis}`
    + ` ${h.versi === 'perubahan' ? 'Perubahan' : 'Murni'} · TA ${h.tahun_anggaran}`
  const rincian = h.nihil
    ? [{ label: 'Isi dokumen', nilai: 'NIHIL (dinyatakan tidak ada usulan)' }]
    : [
        { label: 'Kartu', nilai: `${h.pakets.length} kartu` },
        { label: 'Item', nilai: `${h.jumlah_item} item` },
        { label: 'Total anggaran', nilai: formatRupiah(h.total) },
      ]

  if (aksi === 'setujui') {
    return (
      <KonfirmasiModal
        nada="teal" ikon="✓" judul="Tetapkan dokumen RKBMD ini?" subjudul={subjudul}
        rincian={rincian} labelYa="Ya, setujui" busy={busy} onYa={onYa} onBatal={onBatal}
        peringatan={h.dokumen_url ? undefined : <>
          Dokumen ini <b>tanpa lampiran bertanda tangan</b>. Normalnya lampiran itu syarat pengajuan
          (berlaku sejak migrasi 20260813_01) — periksa dulu sebelum menetapkannya.
        </>}
      >
        Dokumen dibekukan beserta <b>seluruh kartunya</b> dan masuk ke Pelaporan sebagai
        ketetapan. Untuk mengubahnya lagi harus lewat <b>Buka Kunci</b> di tab Tervalidasi.
      </KonfirmasiModal>
    )
  }

  if (aksi === 'tolak') {
    return (
      <KonfirmasiModal
        nada="merah" ikon="↩" judul="Kembalikan dokumen ke SKPD?" subjudul={subjudul}
        rincian={rincian} labelYa="Ya, kembalikan" busy={busy} onYa={onYa} onBatal={onBatal}
        catatan={{
          label: 'Catatan telaah',
          placeholder: 'Mis. sub kegiatan pada kartu 2 tidak sesuai nomenklatur; jumlah eksisting perlu dicek ulang.',
          petunjuk: <>Boleh dikosongkan, tapi SKPD tak akan tahu apa yang harus diperbaiki.</>,
        }}
      >
        Penolakan berlaku untuk <b>satu dokumen utuh</b> — seluruh kartunya kembali bisa disunting.
        Tidak ada setuju-sebagian.
      </KonfirmasiModal>
    )
  }

  return (
    <KonfirmasiModal
      nada="amber" ikon="🔓" judul="Batalkan penetapan dokumen ini?" subjudul={subjudul}
      rincian={rincian} labelYa="Ya, buka kunci" busy={busy} onYa={onYa} onBatal={onBatal}
      peringatan={<>
        Lampirannya ikut tercabut begitu isinya disunting, jadi untuk diajukan lagi lembarnya
        harus <b>dicetak &amp; ditandatangani ulang</b> kepala kantor.
      </>}
    >
      Dokumen kembali ke <b>draft</b> dan bisa disunting SKPD. Ia hilang dari menu Pelaporan
      sampai ditetapkan lagi.
    </KonfirmasiModal>
  )
}

// ── Pop-up rincian satu dokumen RKBMD, dikelompokkan per kartu ──────────────
// TKDN TIDAK disimpan di `rkbmd_item` — ia atribut barang di SSH, jadi ditarik
// lewat `standar_id`. Sengaja begitu: TKDN melekat pada barang standarnya, dan
// menyalinnya ke tiap item berarti dua sumber kebenaran yang bisa berbeda.
function DetailModal({ h, onClose }: { h: Antrean; onClose: () => void }) {
  const supabase = createClient()
  type Baris = {
    id: string; paket_id: string | null; no_urut: number | null; kode: string | null
    nama_barang: string | null; satuan: string | null; jumlah_kebutuhan: number | null
    jumlah_eksisting: number | null; harga_satuan: number | null; total_anggaran: number | null
    kode_rekening: string | null; keterangan: string | null; standar_id: number | null; tkdn: number | null
  }
  const [rows, setRows] = useState<Baris[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('rkbmd_item')
        .select('id,paket_id,no_urut,kode,nama_barang,satuan,jumlah_kebutuhan,jumlah_eksisting,harga_satuan,total_anggaran,kode_rekening,keterangan,standar_id')
        .eq('rkbmd_id', h.id).order('no_urut')
      if (!alive) return
      if (error) { setErr(`gagal membaca item: ${error.message}`); setRows([]); setLoading(false); return }

      const its = ((data || []) as Omit<Baris, 'tkdn'>[]).map(r => ({ ...r, tkdn: null as number | null }))
      const ids = [...new Set(its.map(r => r.standar_id).filter((x): x is number => x != null))]
      if (ids.length > 0) {
        const { data: std, error: e2 } = await supabase.from('rkbmd_standar').select('id,tkdn').in('id', ids)
        if (!alive) return
        if (e2) { setErr(`gagal membaca TKDN dari SSH: ${e2.message}`); setRows([]); setLoading(false); return }
        const tkdnById = new Map(((std || []) as { id: number; tkdn: number | null }[]).map(s => [s.id, s.tkdn]))
        for (const r of its) if (r.standar_id != null) r.tkdn = tkdnById.get(r.standar_id) ?? null
      }
      setRows(its)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [h.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDok = rows.reduce((s, r) => s + (r.total_anggaran || 0), 0)
  // Kartu yang punya isi, plus penampung untuk item tanpa kartu (4 jenis lain).
  const kelompok: { paket: RkbmdPaket | null; isi: Baris[] }[] = [
    ...h.pakets.map(p => ({ paket: p, isi: rows.filter(r => r.paket_id === p.id) })),
    ...(rows.some(r => r.paket_id == null) ? [{ paket: null, isi: rows.filter(r => r.paket_id == null) }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-6xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">
              RKBMD {JENIS_LABEL[h.jenis] || h.jenis} — {h.admin_skpd?.nama || `SKPD #${h.skpd_id}`}
            </h3>
            <p className="text-xs text-gray-500">
              TA {h.tahun_anggaran} · {h.versi === 'perubahan' ? 'Perubahan' : 'Murni'} ·
              {' '}{h.pakets.length} kartu · diajukan {h.diajukan_at?.slice(0, 10) || '—'}
            </p>
          </div>
          {/* Tombol Cetak SENGAJA TIDAK di sini (keputusan user 2026-08-13):
              lembar per-SKPD dicetak di menu Usulan (tempatnya disusun &
              ditandatangani), lembar se-Kabupaten di menu Pelaporan. Yang
              ditelaah di layar ini adalah LAMPIRAN bertanda tangan lewat
              tombol 📄 Dokumen di antrean — mencetak ulang dari sini justru
              menghasilkan lembar TANPA tanda tangan yang mudah tertukar
              dengan berkas yang sah. */}
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-5">
          {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Memuat rincian...</p>
          ) : err ? null : h.nihil ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-gray-700">Usulan NIHIL</p>
              <p className="text-xs text-gray-500 mt-1">
                SKPD ini menyatakan tidak ada usulan untuk jenis &amp; tahun anggaran tersebut.
                Periksa lampiran pernyataan bertanda tangannya sebelum menyetujui.
              </p>
            </div>
          ) : kelompok.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Dokumen ini belum berisi apa pun.</p>
          ) : (
            <>
              {kelompok.map(({ paket, isi }) => (
                <div key={paket?.id || 'tanpa-kartu'} className="rounded-lg border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50/60 px-4 py-2.5 space-y-0.5 text-xs">
                    {paket ? (
                      <>
                        <p><span className="text-gray-400 inline-block w-24">Program</span>: <span className="text-gray-800">{paket.program || '—'}</span></p>
                        <p><span className="text-gray-400 inline-block w-24">Kegiatan</span>: <span className="text-gray-800">{paket.kegiatan || '—'}</span></p>
                        <p><span className="text-gray-400 inline-block w-24">Sub Kegiatan</span>: <span className="text-gray-800">{paket.sub_kegiatan || '—'}</span></p>
                      </>
                    ) : (
                      <p className="text-gray-500">Item tanpa kartu program/kegiatan</p>
                    )}
                  </div>

                  {isi.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-gray-400">Kartu ini belum berisi item.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-y border-gray-100">
                          <tr>
                            <th className="table-th w-10">No</th>
                            <th className="table-th">Kode Rekening</th>
                            <th className="table-th">Kode Barang</th>
                            <th className="table-th">Spesifikasi Nama Barang</th>
                            <th className="table-th text-right">Jumlah</th>
                            <th className="table-th">Satuan</th>
                            <th className="table-th text-right">Harga Satuan</th>
                            <th className="table-th text-right">Nilai Total</th>
                            <th className="table-th text-right">TKDN</th>
                            <th className="table-th text-right">Di Neraca</th>
                            <th className="table-th">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {isi.map((r, i) => (
                            <tr key={r.id}>
                              <td className="table-td text-xs">{r.no_urut ?? i + 1}</td>
                              <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.kode_rekening || '—'}</td>
                              <td className="table-td text-xs whitespace-nowrap">{r.kode || '—'}</td>
                              <td className="table-td text-xs text-gray-800">{r.nama_barang || '—'}</td>
                              <td className="table-td text-xs text-right">{r.jumlah_kebutuhan ?? 0}</td>
                              <td className="table-td text-xs text-gray-500">{r.satuan || '—'}</td>
                              <td className="table-td text-xs text-right whitespace-nowrap">{formatRupiah(r.harga_satuan)}</td>
                              <td className="table-td text-xs text-right whitespace-nowrap font-medium">{formatRupiah(r.total_anggaran)}</td>
                              <td className="table-td text-xs text-right">{r.tkdn != null ? `${r.tkdn}%` : '—'}</td>
                              <td className="table-td text-xs text-right">{r.jumlah_eksisting ?? '—'}</td>
                              <td className="table-td text-xs text-gray-500">{r.keterangan || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-100">
                          <tr>
                            <td className="table-td text-xs font-semibold" colSpan={7}>Subtotal</td>
                            <td className="table-td text-xs text-right font-bold whitespace-nowrap">
                              {formatRupiah(isi.reduce((s, r) => s + (r.total_anggaran || 0), 0))}
                            </td>
                            <td className="table-td" colSpan={3} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-lg bg-teal/5 border border-teal/20 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Rencana Anggaran ({rows.length} item)</span>
                <span className="text-lg font-bold text-gray-900">{formatRupiah(totalDok)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
