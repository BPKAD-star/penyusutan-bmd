'use client'
// ============================================================================
// Cetak SURAT USULAN REKLASIFIKASI BMD — dari menu Inventarisasi → Tindak
// Lanjut (Fase 2, keputusan user 2026-10-02).
//
// `?skpd=<id>&tahun=<TA inventarisasi>&ids=<id temuan,…>` — id temuan =
// `<id isian>|<format LHI>` (lib/tindakLanjut.ts). Isinya DIBACA ULANG lewat
// pemuat yang sama dgn menu Tindak Lanjut (`muatTindakLanjut`), bukan dititipkan
// lewat URL, jadi surat & layar mustahil berbeda.
//
// ⚠️ Surat ini USULAN. Kode barang di register TIDAK berubah karena surat ini;
// ia berubah saat SKPD menyimpan Reklasifikasi (surat ini diunggah sebagai
// dokumen sumbernya). Tanpa persetujuan Pengelola di aplikasi — surat ini yang
// memberi tahu Pengelola (keputusan user).
//
// Lampirannya LHI: tiap baris menyebut format LHI temuannya. Nomor surat yang
// belum diisi dibiarkan bertitik-titik — jangan mengarang nomor di lembar yang
// akan ditandatangani.
// ============================================================================
import { ingatanCetak, kunciTtdUsulanReklas } from '@/lib/ingatanCetak'
import { fetchSkpd } from '@/lib/skpdMaster'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah2 } from '@/lib/export'
import { LHI_LABEL } from '@/lib/inventarisasi'
import { muatTindakLanjut, type TemuanTLMuat } from '@/lib/tindakLanjutData'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, sebutanKepala,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
/** Diurai manual — `new Date('YYYY-MM-DD')` bisa mundur sehari di zona negatif. */
function tglPanjang(s: string): string {
  const [y, m, d] = (s || '').slice(0, 10).split('-')
  const bln = BULAN[Number(m) - 1]
  return y && bln && d ? `${Number(d)} ${bln} ${y}` : ''
}
const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

type TtdTersimpan = { id?: string; plt?: boolean; tgl?: string; nomor?: string }

export default function CetakUsulanReklasPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<TemuanTLMuat[]>([])
  const [uraian, setUraian] = useState<Record<string, string>>({})
  const [nilai, setNilai] = useState<Record<string, number>>({})
  const [skpd, setSkpd] = useState<{ id: number; nama: string } | null>(null)
  const [tahun, setTahun] = useState('')
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [plt, setPlt] = useState(false)
  const [tglTtd, setTglTtd] = useState(todayStr())
  const [nomor, setNomor] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const sk = Number(q.get('skpd'))
        const th = Number(q.get('tahun')) || new Date().getFullYear()
        const ids = new Set((q.get('ids') || '').split(',').filter(Boolean))
        if (!sk) throw new Error('SKPD belum dipilih — satu surat untuk satu SKPD.')
        if (ids.size === 0) throw new Error('Belum ada temuan yang dipilih. Centang kolom "Usul" di menu Tindak Lanjut.')
        setTahun(String(th))

        const semua = await fetchSkpd<{ id: number; parent_id: number | null; nama: string }>(supabase, 'id,parent_id,nama')
        const ini = semua.find(x => x.id === sk)
        if (!ini) throw new Error(`SKPD #${sk} tidak ditemukan.`)
        setSkpd({ id: sk, nama: ini.nama })

        // Fail-closed: surat yang ditandatangani tak boleh memuat daftar setengah.
        const temuan = (await muatTindakLanjut(supabase, { tahun: th, skpdIds: [sk] }))
          .filter(t => ids.has(t.id) && t.perluReklas)
        if (temuan.length === 0) throw new Error('Temuan yang dipilih sudah tidak perlu direklas (mungkin sudah direklasifikasi).')
        setRows(temuan)

        const kode = [...new Set(temuan.flatMap(t => [t.snapshot?.kode, t.kodeTujuan]).filter((x): x is string => !!x))]
        const [k, a] = await Promise.all([
          supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', kode),
          supabase.from('aset').select('id,nilai_perolehan').in('id', temuan.map(t => t.asetId).filter((x): x is string => !!x)),
        ])
        if (k.error) throw new Error(`gagal membaca uraian kodefikasi: ${k.error.message}`)
        if (a.error) throw new Error(`gagal membaca nilai perolehan: ${a.error.message}`)
        setUraian(Object.fromEntries(((k.data || []) as { kode: string; uraian: string | null }[]).map(r => [r.kode, r.uraian || ''])))
        setNilai(Object.fromEntries(((a.data || []) as { id: string; nilai_perolehan: number }[]).map(r => [r.id, Number(r.nilai_perolehan) || 0])))

        // Penanda tangan — WAJIB fetchCalonTtd (sub-unit & kepala rangkap). Gagal
        // memuatnya tak menjatuhkan surat: blok tanda tangan bertitik-titik.
        const byId = new Map<number, SkpdNode>(semua.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)
        const simpan = ingatanCetak<TtdTersimpan>(kunciTtdUsulanReklas(sk)).baca()
        const idAwal = simpan?.id || calonTtdAwal(daftar)?.id || ''
        setTtdId(idAwal)
        setPlt(simpan?.plt ?? (daftar.find(c => c.id === idAwal)?.pltDisarankan ?? false))
        setTglTtd(simpan?.tgl || todayStr())
        setNomor(simpan?.nomor || '')
        setSiap(true)
      } catch (e) {
        setGagal(e instanceof Error ? e.message : String(e))
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!skpd) return
    ingatanCetak<TtdTersimpan>(kunciTtdUsulanReklas(skpd.id)).simpan({ id: ttdId, plt, tgl: tglTtd, nomor })
  }, [skpd, ttdId, plt, tglTtd, nomor])

  useEffect(() => {
    if (!skpd) return
    document.title = namaBerkasLaporan({ laporan: 'Surat Usulan Reklasifikasi', periode: tahun, skpd: skpd.nama })
  }, [skpd, tahun])

  const ttd = calon.find(c => c.id === ttdId) || null
  const total = useMemo(() => rows.reduce((s, t) => s + (t.asetId ? nilai[t.asetId] || 0 : 0), 0), [rows, nilai])

  if (gagal) return <div className="p-8 text-sm text-red-700">Surat tidak dirakit — {gagal}</div>
  if (!siap || !skpd) return <div className="p-8 text-sm text-gray-400">Memuat…</div>

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 2cm; } body { background: white; } }`}</style>

      <div className="max-w-3xl mx-auto mb-3 no-print card p-4 space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nomor Surat</label>
            <input className="select-filter w-full" value={nomor} onChange={e => setNomor(e.target.value)} placeholder="kosongkan = bertitik-titik" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Surat</label>
            <input type="date" className="select-filter w-full" value={tglTtd} onChange={e => setTglTtd(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Penanda Tangan</label>
            <select className="select-filter w-full" value={ttdId}
              onChange={e => { setTtdId(e.target.value); setPlt(calon.find(c => c.id === e.target.value)?.pltDisarankan ?? false) }}>
              <option value="">— belum dipilih (bertitik-titik) —</option>
              {calon.map(c => <option key={c.id} value={c.id}>{c.nama}{labelAsalTtd(c)}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!plt} onChange={() => setPlt(false)} />Definitif</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={plt} onChange={() => setPlt(true)} />Plt.</label>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-white p-10 shadow print:shadow-none text-sm text-gray-900 leading-relaxed">
        <div className="flex justify-end mb-4">Kediri, {tglPanjang(tglTtd) || '....................'}</div>
        <table className="mb-4"><tbody>
          <tr><td className="pr-3 align-top">Nomor</td><td className="pr-2 align-top">:</td><td>{nomor || '............................'}</td></tr>
          <tr><td className="pr-3 align-top">Lampiran</td><td className="pr-2 align-top">:</td><td>1 (satu) berkas — Laporan Hasil Inventarisasi (LHI) Tahun {tahun}</td></tr>
          <tr><td className="pr-3 align-top">Perihal</td><td className="pr-2 align-top">:</td><td className="font-semibold">Usulan Reklasifikasi Barang Milik Daerah</td></tr>
        </tbody></table>

        <div className="mb-4">
          <p>Kepada Yth.</p>
          <p>Kepala Badan Keuangan dan Aset Daerah</p>
          <p>selaku Pengelola Barang Kabupaten Kediri</p>
          <p>di -</p>
          <p className="ml-8">Tempat</p>
        </div>

        <p className="mb-3 text-justify">
          Berdasarkan hasil inventarisasi Barang Milik Daerah Tahun {tahun} pada <b>{skpd.nama}</b> sebagaimana tertuang dalam
          Laporan Hasil Inventarisasi (LHI) terlampir, bersama ini kami mengusulkan reklasifikasi Barang Milik Daerah
          sebagai berikut:
        </p>

        <table className="w-full border border-gray-800 border-collapse mb-2 text-xs">
          <thead><tr className="bg-gray-100">
            {['No', 'NIBAR / Nama Barang', 'Kode Barang Semula', 'Kode Barang Usulan', 'Nilai Perolehan (Rp)', 'Dasar (LHI)'].map(h =>
              <th key={h} className="border border-gray-800 px-1.5 py-1 text-left align-top">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((t, i) => {
              const lama = t.snapshot?.kode || ''
              const baru = t.kodeTujuan || ''
              return (
                <tr key={t.id} className="align-top">
                  <td className="border border-gray-800 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-800 px-1.5 py-1">
                    <p>{t.snapshot?.nama_barang || '-'}</p>
                    <p className="text-[10px] text-gray-600 break-all">{t.snapshot?.nibar || '-'}</p>
                  </td>
                  <td className="border border-gray-800 px-1.5 py-1"><p>{lama}</p><p className="text-gray-600">{uraian[lama] || t.snapshot?.uraian_barang || ''}</p></td>
                  <td className="border border-gray-800 px-1.5 py-1"><p>{baru}</p><p className="text-gray-600">{uraian[baru] || ''}</p></td>
                  <td className="border border-gray-800 px-1.5 py-1 text-right whitespace-nowrap">{formatRupiah2(t.asetId ? nilai[t.asetId] || 0 : 0)}</td>
                  <td className="border border-gray-800 px-1.5 py-1">{t.lhi}<p className="text-gray-600">{LHI_LABEL[t.lhi]}</p></td>
                </tr>
              )
            })}
            <tr className="font-semibold">
              <td colSpan={4} className="border border-gray-800 px-1.5 py-1 text-right">JUMLAH ({rows.length} barang)</td>
              <td className="border border-gray-800 px-1.5 py-1 text-right whitespace-nowrap">{formatRupiah2(total)}</td>
              <td className="border border-gray-800 px-1.5 py-1" />
            </tr>
          </tbody>
        </table>

        <p className="mb-10 mt-4 text-justify">
          Demikian usulan ini kami sampaikan. Reklasifikasi akan kami catat pada aplikasi dengan surat ini sebagai dokumen
          sumbernya. Atas perhatian Bapak/Ibu kami ucapkan terima kasih.
        </p>

        <div className="flex justify-end">
          <div className="text-center min-w-[16rem]">
            <p>{ttd ? sebutanKepala(plt, skpd.nama) : `Kepala ${skpd.nama}`}</p>
            <div className="h-20" />
            <p className="font-semibold underline">{ttd?.nama || '....................................'}</p>
            <p>NIP. {ttd?.nip || '....................................'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
