'use client'
// Kartu "Total Barang per Cara Perolehan" + donut approve/belum-approve per jenis.
// Basis donut = JUMLAH BARANG (unit), bukan rupiah. Angka "disetujui" dipasok dari
// server (page.tsx, hitungan transaksi_bmd yg sudah ada — otomatis benar karena
// draft belum pernah masuk situ). Angka "pending" dihitung di client dari
// jurnal_header.payload.draft_items — SEMUA 5 kategori Cara Perolehan sudah
// pakai pola draft+approval yang sama (Hibah/Tukar Menukar/Hasil Inventarisasi/
// Perolehan Lainnya lewat PerolehanManual.tsx), jadi kategoriJurnal-nya diisi
// semua (dulu cuma Pengadaan sebelum menu2 itu dibangun ulang dgn pola sama).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GOLONGAN_REKAP, kodeLevel3 } from '@/lib/bmd'
import { barangKdpList, type KontrakKonstruksiPayload } from '@/lib/kdp'
import { backdropClose } from '@/components/backdropClose'

// ⚠️ `kategoriJurnal` JAMAK — Pengadaan punya DUA pintu masuk yang memakai
// kategori `jurnal_header` berbeda: entry non-fisik (`pengadaan`) dan Pekerjaan
// Fisik/Konstruksi (`konstruksi`). Sampai 2026-08-27 kartu ini cuma menyapu
// yang pertama, jadi kontrak konstruksi yang masih menunggu persetujuan TIDAK
// pernah terhitung di angka "menunggu" & tak muncul di popup-nya — hilang
// diam-diam, tanpa satu pun error. (Sisi "disetujui" tak kena: asetnya dibuat
// dgn `cara_perolehan='pengadaan'` sama spt non-fisik, jadi `fn_dashboard_rekap`
// sudah menghitungnya sejak awal.)
type CaraConfig = { key: string; label: string; jenisTransaksi: string; kategoriJurnal: string[] }
const CARA_LIST: CaraConfig[] = [
  { key: 'pengadaan', label: 'Pengadaan', jenisTransaksi: 'pengadaan', kategoriJurnal: ['pengadaan', 'konstruksi'] },
  { key: 'hibah', label: 'Hibah', jenisTransaksi: 'hibah_masuk', kategoriJurnal: ['hibah_masuk'] },
  { key: 'tukarMenukar', label: 'Tukar Menukar', jenisTransaksi: 'tukar_menukar', kategoriJurnal: ['tukar_menukar'] },
  { key: 'inventarisasi', label: 'Hasil Inventarisasi', jenisTransaksi: 'hasil_inventarisasi', kategoriJurnal: ['hasil_inventarisasi'] },
  { key: 'lainnya', label: 'Perolehan Lainnya', jenisTransaksi: 'perolehan_lainnya', kategoriJurnal: ['perolehan_lainnya'] },
]

const formatRp = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)
const nf = (n: number) => n.toLocaleString('id-ID')
/** Golongan yang punya kolom sendiri di matriks popup "disetujui". */
const KODE_GOL = new Set(GOLONGAN_REKAP.map(g => g.kode))

type DraftItemLite = { kode?: string; nama?: string; harga?: string }
type PayloadLite = { draft_items?: DraftItemLite[] } & Record<string, unknown>
type PendingHeaderLite = { id: string; no_sk: string; tanggal: string; skpd_id: number; kategori: string; payload: PayloadLite }

/** Satu barang yang menunggu persetujuan, sudah dinormalkan lintas kategori. */
type ItemPending = { nama: string; kode: string; nilai: number }

/**
 * Barang menunggu persetujuan di SATU kartu — bentuk payloadnya BEDA antar
 * kategori dan itu bukan kelalaian penamaan:
 *   · Cara Perolehan biasa → `payload.draft_items[]`, tiap item punya `harga`;
 *   · Konstruksi/KDP       → `payload.barang[]`, tiap barang dibayar BERTERMIN
 *     sehingga nilainya = Σ `pembayaran[].nominal` (lihat lib/kdp.ts).
 *
 * Dinormalkan di satu tempat supaya ANGKA KARTU & ISI POPUP mustahil berbeda —
 * dua penghitung terpisah untuk satu fakta adalah pola yang di repo ini sudah
 * beberapa kali melahirkan "57 tampil 51" (lihat catatan `pindahAktif`).
 *
 * ⚠️ `barangKdpList` (bukan `payload.barang` telanjang) karena kontrak
 * konstruksi versi lama menyimpan SATU KDP secara datar (`kode_kdp` +
 * `pembayaran`) tanpa array `barang` — membacanya langsung akan melewatkan
 * kontrak lama tanpa satu pun tanda.
 */
function itemsPending(kategori: string, payload: PayloadLite): ItemPending[] {
  if (kategori === 'konstruksi') {
    return barangKdpList(payload as KontrakKonstruksiPayload).map(b => ({
      nama: b.nama || b.kode,
      kode: b.kode,
      nilai: (b.pembayaran || []).reduce((s, p) => s + Number(p.nominal || 0), 0),
    }))
  }
  return (payload.draft_items || []).map(d => ({
    nama: d.nama || d.kode || '',
    kode: d.kode || '',
    // Pembaca yang SAMA dgn versi sebelumnya — angka kartu tak boleh bergeser
    // gara-gara perubahan yang niatnya cuma menyambungkan konstruksi.
    nilai: parseFloat(d.harga || '0') || 0,
  }))
}

export default function CaraPerolehanCards({ approved, approvedNilai }: {
  approved: Record<string, number>
  approvedNilai?: Record<string, number>
}) {
  const supabase = createClient()
  const [pending, setPending] = useState<Record<string, number>>({})
  const [detail, setDetail] = useState<{ mode: 'approved' | 'pending'; cara: CaraConfig } | null>(null)

  // ⚠️ Kelima kategori ditarik BERBARENGAN, bukan satu per satu. Versi lama
  // memakai `for...of` dengan `await` di dalamnya, jadi kelimanya ANTRE:
  // waktunya menjumlah (di Network tab terlihat sbg lima permintaan
  // `jurnal_header?...` berderet ~200 ms masing-masing, total ~1 dtk sesudah
  // halaman ter-hydrate). Kelimanya saling bebas — tak ada satu pun yang
  // memakai hasil yang lain — jadi tak ada alasan diantrekan.
  // Paginasi DI DALAM satu kategori tetap berurutan: halaman berikutnya memang
  // baru bisa diminta setelah yang sekarang tiba.
  useEffect(() => {
    (async () => {
      const pasangan = await Promise.all(CARA_LIST.map(async c => {
        if (c.kategoriJurnal.length === 0) return [c.key, 0] as const
        let total = 0
        // `.in(...)` — satu cara perolehan bisa punya beberapa kategori kartu
        // (Pengadaan = non-fisik + konstruksi), lihat catatan di CARA_LIST.
        for (let from = 0; ; from += 500) {
          const { data } = await supabase.from('jurnal_header').select('kategori,payload')
            .in('kategori', c.kategoriJurnal).eq('approval_status', 'pending').range(from, from + 499)
          if (!data || data.length === 0) break
          for (const r of data as { kategori: string; payload: PayloadLite }[]) {
            total += itemsPending(r.kategori, r.payload || {}).length
          }
          if (data.length < 500) break
        }
        return [c.key, total] as const
      }))
      setPending(Object.fromEntries(pasangan))
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CARA_LIST.map(c => {
          const disetujui = approved[c.key] || 0
          const belum = pending[c.key] || 0
          return (
            <CaraCard key={c.key} cara={c} disetujui={disetujui} belum={belum} nilai={approvedNilai?.[c.key] || 0}
              onClickApproved={() => setDetail({ mode: 'approved', cara: c })}
              onClickPending={() => setDetail({ mode: 'pending', cara: c })} />
          )
        })}
      </div>
      {detail?.mode === 'approved' && (
        <ApprovedDetailModal cara={detail.cara} onClose={() => setDetail(null)} />
      )}
      {detail?.mode === 'pending' && (
        <PendingDetailModal cara={detail.cara} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function CaraCard({ cara, disetujui, belum, nilai, onClickApproved, onClickPending }: {
  cara: CaraConfig; disetujui: number; belum: number; nilai: number
  onClickApproved: () => void; onClickPending: () => void
}) {
  const total = disetujui + belum
  const pct = total > 0 ? Math.round((disetujui / total) * 100) : 100
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-600 leading-tight">{cara.label}</p>
      <p className="text-sm font-bold text-teal mb-1 truncate" title={formatRp(nilai)}>{formatRp(nilai)}</p>
      {/* ⚠️ `min-w-0` di baris ini & di kolom keterangan BUKAN hiasan: tanpa itu
          min-width flex item = min-content, jadi kolom keterangan menolak
          menyempit dan teksnya MELUBER keluar kartu — di layar sempit (mis.
          DevTools terbuka) tulisannya menimpa kartu sebelahnya. Dengan min-w-0
          ia membungkus ke bawah, tetap di dalam kartunya.
          KEMBAR dengan DonutCard di MutasiTransferCards.tsx — ubah satu,
          samakan yang lain. */}
      <div className="flex items-center gap-3 mt-1 min-w-0">
        <div
          className="relative flex-shrink-0"
          style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(#0d9488 ${pct}%, #fbbf24 ${pct}% 100%)` }}
          title={`${pct}% disetujui`}
        >
          <div className="absolute inset-[5px] bg-white rounded-full flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-700">{pct}%</span>
          </div>
        </div>
        <div className="text-xs space-y-1 min-w-0">
          <button onClick={onClickApproved} className="flex items-start gap-1.5 hover:underline text-left min-w-0" disabled={disetujui === 0}>
            <span className="w-2 h-2 rounded-full bg-teal inline-block flex-shrink-0 mt-1" />
            <span className="text-gray-700">{nf(disetujui)} disetujui</span>
          </button>
          <button onClick={onClickPending} className="flex items-start gap-1.5 hover:underline text-left min-w-0" disabled={belum === 0}>
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block flex-shrink-0 mt-1" />
            <span className="text-gray-700">{nf(belum)} menunggu</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Popup "Disetujui": breakdown SKPD × Jenis Aset — kuantitas & nilai ──────
// Bentuk MATRIKS: baris = SKPD, kolom = jenis aset (permintaan user
// 2026-08-27). Daftar datar sebelumnya melahirkan satu baris per kombinasi
// SKPD×golongan — untuk cara perolehan yang menyentuh banyak SKPD, satu SKPD
// terpecah jadi beberapa baris berjauhan dan membandingkan antar jenis aset
// praktis mustahil. Matriks memuat data yang sama dalam satu pandangan, dan
// memberi dua total sekaligus (per SKPD & per jenis aset).
//
// ⚠️ Kolomnya `GOLONGAN_REKAP` — daftar yang SAMA dipakai Laporan BMD &
// Rekonsiliasi, jadi susunannya tak bisa menyimpang diam-diam. Barang yang
// golongannya di luar daftar itu tetap dihitung, tapi masuk kolom "Lainnya"
// supaya TOTAL-nya tak pernah bohong (lihat `LAIN`).
type SelMatriks = { count: number; nilai: number }
type BarisMatriks = { skpd: string; sel: Record<string, SelMatriks>; count: number; nilai: number }

/** Kolom penampung golongan di luar GOLONGAN_REKAP — TIDAK ditampilkan kalau
 *  kosong. Ada supaya total kolom & total baris selalu cocok; tanpa itu barang
 *  bergolongan tak terduga hilang dari matriks tanpa satu pun tanda. */
const LAIN = 'lain'

function ApprovedDetailModal({ cara, onClose }: { cara: CaraConfig; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<BarisMatriks[]>([])

  useEffect(() => {
    (async () => {
      const skpdNama: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) skpdNama[s.id] = s.nama
        if (data.length < 1000) break
      }

      const agg = new Map<number, Record<string, SelMatriks>>()
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('aset')
          .select('kode,nilai_perolehan,skpd_id').eq('cara_perolehan', cara.jenisTransaksi).eq('status', 'aktif')
          .range(from, from + 999)
        if (!data || data.length === 0) break
        for (const r of data as { kode: string; nilai_perolehan: number; skpd_id: number }[]) {
          const g = kodeLevel3(r.kode)
          const kolom = KODE_GOL.has(g) ? g : LAIN
          const baris = agg.get(r.skpd_id) || {}
          const sel = baris[kolom] || { count: 0, nilai: 0 }
          sel.count += 1; sel.nilai += r.nilai_perolehan || 0
          baris[kolom] = sel
          agg.set(r.skpd_id, baris)
        }
        if (data.length < 1000) break
      }

      setRows([...agg.entries()]
        .map(([id, sel]) => ({
          skpd: skpdNama[id] || `SKPD #${id}`,
          sel,
          count: Object.values(sel).reduce((s, c) => s + c.count, 0),
          nilai: Object.values(sel).reduce((s, c) => s + c.nilai, 0),
        }))
        .sort((a, b) => a.skpd.localeCompare(b.skpd)))
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Kolom "Lainnya" cuma muncul kalau memang terpakai — normalnya tidak.
  const kolom = [
    ...GOLONGAN_REKAP.map(g => ({ kode: g.kode, judul: g.kode, tip: g.uraian })),
    ...(rows.some(r => r.sel[LAIN]) ? [{ kode: LAIN, judul: 'Lainnya', tip: 'Golongan di luar daftar baku' }] : []),
  ]
  const totalKolom = (k: string) => rows.reduce((s, r) => ({
    count: s.count + (r.sel[k]?.count || 0), nilai: s.nilai + (r.sel[k]?.nilai || 0),
  }), { count: 0, nilai: 0 })
  const totalUmum = { count: rows.reduce((s, r) => s + r.count, 0), nilai: rows.reduce((s, r) => s + r.nilai, 0) }

  return (
    <Modal title={`${cara.label} — Sudah Disetujui`} onClose={onClose} lebar="max-w-6xl">
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Belum ada data.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">
            Tiap sel: jumlah unit di atas, nilai perolehan di bawah. Kolom = jenis aset.
          </p>
          {/* Kolom SKPD dibuat `sticky` — dgn 9 kolom rupiah tabelnya pasti
              digeser mendatar, dan tanpa itu pembaca kehilangan acuan barisnya. */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-th text-left sticky left-0 bg-gray-50 z-10">SKPD</th>
                  {kolom.map(k => (
                    <th key={k.kode} className="table-th text-right whitespace-nowrap" title={k.tip}>{k.judul}</th>
                  ))}
                  <th className="table-th text-right whitespace-nowrap border-l border-gray-200">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="table-td sticky left-0 bg-white whitespace-nowrap">{r.skpd}</td>
                    {kolom.map(k => <SelAngka key={k.kode} sel={r.sel[k.kode]} />)}
                    <td className="table-td text-right border-l border-gray-200">
                      <SelIsi count={r.count} nilai={r.nilai} tebal />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td className="table-td sticky left-0 bg-gray-50 whitespace-nowrap">TOTAL</td>
                  {kolom.map(k => {
                    const t = totalKolom(k.kode)
                    return (
                      <td key={k.kode} className="table-td text-right">
                        {t.count === 0 ? <span className="text-gray-300">–</span> : <SelIsi count={t.count} nilai={t.nilai} tebal />}
                      </td>
                    )
                  })}
                  <td className="table-td text-right border-l border-gray-200">
                    <SelIsi count={totalUmum.count} nilai={totalUmum.nilai} tebal />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}

/** Sel matriks — kosong ditandai `–`, sengaja DIBEDAKAN dari nilai nol. */
function SelAngka({ sel }: { sel?: SelMatriks }) {
  return (
    <td className="table-td text-right">
      {!sel ? <span className="text-gray-300">–</span> : <SelIsi count={sel.count} nilai={sel.nilai} />}
    </td>
  )
}

function SelIsi({ count, nilai, tebal }: { count: number; nilai: number; tebal?: boolean }) {
  return (
    <div className="leading-tight whitespace-nowrap">
      <div className="text-[10px] text-gray-400">{nf(count)}</div>
      <div className={`tabular-nums ${tebal ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{formatRp(nilai)}</div>
    </div>
  )
}

// ── Popup "Menunggu": per SKPD → daftar kontrak → daftar barang ─────────────
function PendingDetailModal({ cara, onClose }: { cara: CaraConfig; onClose: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [bySkpd, setBySkpd] = useState<Record<string, PendingHeaderLite[]>>({})

  useEffect(() => {
    if (cara.kategoriJurnal.length === 0) { setLoading(false); return }
    (async () => {
      const skpdMap: Record<number, string> = {}
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        for (const s of data as { id: number; nama: string }[]) skpdMap[s.id] = s.nama
        if (data.length < 1000) break
      }
      const { data: headers } = await supabase.from('jurnal_header')
        .select('id,no_sk,tanggal,skpd_id,kategori,payload')
        .in('kategori', cara.kategoriJurnal).eq('approval_status', 'pending')
        .order('tanggal', { ascending: false })
      const grouped: Record<string, PendingHeaderLite[]> = {}
      for (const h of (headers || []) as PendingHeaderLite[]) {
        const nama = skpdMap[h.skpd_id] || `SKPD #${h.skpd_id}`
        ;(grouped[nama] ||= []).push({ ...h, payload: h.payload || {} })
      }
      setBySkpd(grouped)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const skpdNames = Object.keys(bySkpd).sort()

  return (
    <Modal title={`${cara.label} — Menunggu Persetujuan`} onClose={onClose}>
      {cara.kategoriJurnal.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Cara perolehan ini belum pakai alur draft/approval — data langsung masuk saat diinput.</p>
      ) : loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
      ) : skpdNames.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Tidak ada kontrak yang menunggu persetujuan.</p>
      ) : (
        <div className="space-y-4">
          {skpdNames.map(nama => (
            <div key={nama}>
              <p className="text-sm font-semibold text-gray-800 mb-2">{nama}</p>
              <div className="space-y-2">
                {bySkpd[nama].map(h => {
                  const items = itemsPending(h.kategori, h.payload)
                  const total = items.reduce((s, i) => s + i.nilai, 0)
                  return (
                    <div key={h.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-700">
                        Kontrak: {h.no_sk} · {h.tanggal} · {items.length} barang · {formatRp(total)}
                        {/* Penanda kontrak konstruksi — bentuk & alur entry-nya
                            beda (bertermin), jadi operator perlu tahu kartu ini
                            dibuka di menu Pekerjaan Fisik, bukan Entry Manual. */}
                        {h.kategori === 'konstruksi' && (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                            Konstruksi
                          </span>
                        )}
                      </p>
                      <ul className="text-xs text-gray-500 mt-1 list-disc list-inside">
                        {items.slice(0, 8).map((it, i) => <li key={i}>{it.nama} <span className="text-gray-400">({it.kode})</span></li>)}
                        {items.length > 8 && <li className="text-gray-400">...dan {items.length - 8} lainnya</li>}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// `lebar` — popup "disetujui" berbentuk MATRIKS 9 kolom, jadi ia butuh lebih
// lega daripada popup "menunggu" yang cuma daftar. Bawaannya tetap max-w-2xl
// supaya popup lain tak ikut berubah.
function Modal({ title, onClose, children, lebar = 'max-w-2xl' }: {
  title: string; onClose: () => void; children: React.ReactNode; lebar?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className={`card w-full ${lebar} max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
