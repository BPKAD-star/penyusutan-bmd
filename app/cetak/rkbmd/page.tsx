'use client'
// Cetak "Usulan Rencana Kebutuhan Pengadaan Barang Milik Daerah".
// Standalone, A4 landscape. Query: ?id=<uuid rkbmd>
//
// Bentuk lembarnya mengikuti format resmi: kolom 2 memuat hierarki
// Program → Kegiatan → Sub Kegiatan sebagai baris-baris judul yang MENJOROK,
// dan barisan barang muncul di bawah sub kegiatannya masing-masing. Karena itu
// kolom 2 di baris barang sengaja DIKOSONGKAN — bukan kelupaan: judulnya sudah
// dicetak sekali di baris judur di atasnya, mengulangnya per baris justru
// membuat lembar tak terbaca.
//
// Penomoran: kolom "No." memakai huruf/angka bertingkat (1. → 1. Kegiatan →
// a. sub kegiatan) persis seperti contoh formatnya, sedangkan barangnya
// bernomor urut sendiri di dalam tiap sub kegiatan.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import type { RkbmdPaket } from '@/lib/rkbmd'

type SkpdRow = { id: number; nama: string; parent_id: number | null; kode_skpd: string | null }

type Item = {
  id: string; paket_id: string | null; no_urut: number | null
  kode: string | null; nama_barang: string | null; satuan: string | null
  kode_rekening: string | null
  jumlah_kebutuhan: number | null; jumlah_eksisting: number | null
  harga_satuan: number | null; total_anggaran: number | null
  keterangan: string | null
}

type Dok = {
  id: string; skpd_id: number; tahun_anggaran: number; jenis: string; versi: string; status: string
}

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const HURUF = 'abcdefghijklmnopqrstuvwxyz'

/** SKPD induk paling atas — yang menandatangani sebagai Pengguna Barang. */
function akarSkpd(id: number, byId: Map<number, SkpdRow>): SkpdRow | undefined {
  let cur = byId.get(id)
  const seen = new Set<number>()
  while (cur?.parent_id != null && !seen.has(cur.id)) {
    seen.add(cur.id)
    const next = byId.get(cur.parent_id)
    if (!next) break
    cur = next
  }
  return cur
}

/** Kartu-kartu disusun jadi pohon Program → Kegiatan → Sub Kegiatan supaya
 *  judul program & kegiatan dicetak SEKALI walau dipakai beberapa sub kegiatan. */
type Sub = { paket: RkbmdPaket; isi: Item[] }
type Keg = { nama: string; subs: Sub[] }
type Prog = { nama: string; kegs: Keg[] }

function susunPohon(pakets: RkbmdPaket[], items: Item[]): Prog[] {
  const out: Prog[] = []
  for (const p of pakets) {
    const namaProg = p.program || '(program belum dipilih)'
    const namaKeg = p.kegiatan || '(kegiatan belum dipilih)'
    let prog = out.find(x => x.nama === namaProg)
    if (!prog) { prog = { nama: namaProg, kegs: [] }; out.push(prog) }
    let keg = prog.kegs.find(x => x.nama === namaKeg)
    if (!keg) { keg = { nama: namaKeg, subs: [] }; prog.kegs.push(keg) }
    keg.subs.push({ paket: p, isi: items.filter(i => i.paket_id === p.id) })
  }
  return out
}

function Th({ children, rowSpan, colSpan, className = '' }: {
  children?: React.ReactNode; rowSpan?: number; colSpan?: number; className?: string
}) {
  return <th rowSpan={rowSpan} colSpan={colSpan} className={`brd px-1 py-1 font-semibold ${className}`}>{children}</th>
}

export default function CetakRkbmdPage() {
  const supabase = createClient()
  const [dok, setDok] = useState<Dok | null>(null)
  const [pohon, setPohon] = useState<Prog[]>([])
  const [total, setTotal] = useState(0)
  const [skpd, setSkpd] = useState<SkpdRow | null>(null)
  const [induk, setInduk] = useState<SkpdRow | null>(null)
  const [pengguna, setPengguna] = useState<{ nama: string; nip: string | null } | null>(null)
  const [uraianByKode, setUraianByKode] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const id = new URLSearchParams(window.location.search).get('id')
      if (!id) { setErr('Parameter ?id= (dokumen RKBMD) belum diisi.'); setLoading(false); return }

      const { data: h, error: eh } = await supabase.from('rkbmd')
        .select('id,skpd_id,tahun_anggaran,jenis,versi,status').eq('id', id).maybeSingle()
      if (eh) { setErr(`gagal membaca dokumen: ${eh.message}`); setLoading(false); return }
      if (!h) { setErr('Dokumen RKBMD tidak ditemukan (mungkin sudah dihapus).'); setLoading(false); return }
      const dokumen = h as Dok
      setDok(dokumen)

      const [pk, it] = await Promise.all([
        supabase.from('rkbmd_paket').select('id,rkbmd_id,no_urut,program,kegiatan,sub_kegiatan,keterangan')
          .eq('rkbmd_id', id).order('no_urut'),
        supabase.from('rkbmd_item')
          .select('id,paket_id,no_urut,kode,nama_barang,satuan,kode_rekening,jumlah_kebutuhan,jumlah_eksisting,harga_satuan,total_anggaran,keterangan')
          .eq('rkbmd_id', id).order('no_urut'),
      ])
      if (pk.error || it.error) {
        setErr(`gagal membaca isi dokumen: ${(pk.error || it.error)!.message}`); setLoading(false); return
      }
      const pakets = (pk.data || []) as RkbmdPaket[]
      const items = (it.data || []) as Item[]
      setPohon(susunPohon(pakets, items))
      setTotal(items.reduce((s, r) => s + (r.total_anggaran || 0), 0))

      // Kolom 5 "Uraian Barang" = nama BAKU dari kodefikasi (bukan salinan di
      // item) supaya lembar cetak selalu ikut kodefikasi terkini — pola yang
      // sama dipakai Daftar Barang & Penyusutan.
      const kodes = [...new Set(items.map(r => r.kode).filter((k): k is string => !!k))]
      if (kodes.length > 0) {
        const { data: kd } = await supabase.from('admin_kodefikasi_bmd').select('kode,uraian').in('kode', kodes)
        setUraianByKode(new Map(((kd || []) as { kode: string; uraian: string | null }[])
          .map(k => [k.kode, k.uraian || ''])))
      }

      // SKPD + rantai induknya untuk kepala & blok tanda tangan.
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id,kode_skpd').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      const byId = new Map(rows.map(s => [s.id, s]))
      setSkpd(byId.get(dokumen.skpd_id) || null)
      setInduk(akarSkpd(dokumen.skpd_id, byId) || null)

      // Penanda tangan: Pengguna Barang SKPD itu. Kalau perannya belum
      // didaftarkan, blok tanda tangannya dibiarkan bertitik-titik supaya bisa
      // ditulis tangan — jangan diisi nama lain.
      const { data: pgw } = await supabase.from('admin_pegawai')
        .select('nama,nip').eq('skpd_id', dokumen.skpd_id).eq('role_bmd', 'pengguna_barang').limit(1)
      const g = ((pgw || []) as { nama: string; nip: string | null }[])[0]
      setPengguna(g || null)

      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-6xl mx-auto mb-3 flex justify-end no-print px-4">
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="bg-white p-8 text-sm text-gray-400">Memuat…</div>
        ) : err ? (
          <div className="bg-white p-8 text-sm text-red-600">{err}</div>
        ) : (
          <div className="bg-white p-8 shadow print:shadow-none print:p-0 text-[10px] text-gray-900">
            <style>{`.brd{border:1px solid #6b7280}`}</style>

            <div className="text-center mb-3">
              <p className="font-bold uppercase text-[12px]">
                Usulan Rencana Kebutuhan {dok?.versi === 'perubahan' ? 'Perubahan ' : ''}Pengadaan Barang Milik Daerah
              </p>
              <p className="font-bold uppercase text-[11px]">(Rencana Pengadaan)</p>
              <p className="font-bold uppercase text-[11px]">{skpd?.nama || `SKPD #${dok?.skpd_id}`}</p>
              <p className="font-bold uppercase text-[11px]">Tahun {dok?.tahun_anggaran}</p>
            </div>

            <table className="mb-2">
              <tbody>
                <tr>
                  <td className="pr-2 align-top">Kode SKPD</td><td className="pr-2 align-top">:</td>
                  <td className="align-top">{skpd?.kode_skpd || '-'}</td>
                </tr>
                <tr>
                  <td className="pr-2 align-top">Nama SKPD</td><td className="pr-2 align-top">:</td>
                  <td className="align-top">{skpd?.nama || '-'}</td>
                </tr>
              </tbody>
            </table>

            <table className="border-collapse w-full">
              <thead>
                <tr className="text-center">
                  <Th rowSpan={2}>No.</Th>
                  <Th rowSpan={2}>Program / Kegiatan / Sub Kegiatan</Th>
                  <Th colSpan={8}>Usulan BMD</Th>
                  <Th rowSpan={2}>Jumlah barang<br />pada neraca</Th>
                  <Th rowSpan={2}>Keterangan</Th>
                </tr>
                <tr className="text-center">
                  <Th>Kode rekening</Th>
                  <Th>Kode barang</Th>
                  <Th>Uraian Barang</Th>
                  <Th>Spesifikasi Nama Barang</Th>
                  <Th>Jumlah</Th>
                  <Th>Satuan</Th>
                  <Th>Harga Satuan</Th>
                  <Th>Nilai total</Th>
                </tr>
                <tr className="text-center text-[9px]">
                  {Array.from({ length: 12 }, (_, i) => <td key={i} className="brd px-1">{i + 1}</td>)}
                </tr>
              </thead>
              <tbody>
                {pohon.length === 0 ? (
                  <tr><td className="brd px-1 py-4 text-center text-gray-400" colSpan={12}>
                    Dokumen ini belum berisi kartu program/kegiatan.
                  </td></tr>
                ) : pohon.map((prog, pi) => (
                  <PohonProgram key={prog.nama} prog={prog} pi={pi} uraianByKode={uraianByKode} />
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="brd px-1 py-1 text-center" colSpan={9}>JUMLAH</td>
                  <td className="brd px-1 py-1 text-right">{formatRupiah(total)}</td>
                  <td className="brd px-1 py-1" colSpan={2} />
                </tr>
              </tfoot>
            </table>

            <div className="mt-8 flex justify-end pr-16">
              <div className="text-center">
                <p>…………, {tglID()}</p>
                <p>Pengguna Barang</p>
                <div className="h-16" />
                <p className="font-semibold underline">{pengguna?.nama || '(………………………………)'}</p>
                <p>NIP. {pengguna?.nip || '………………………'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Satu blok Program (beserta kegiatan & sub kegiatannya) ──────────────────
function PohonProgram({ prog, pi, uraianByKode }: {
  prog: Prog; pi: number; uraianByKode: Map<string, string>
}) {
  return (
    <>
      <tr>
        <td className="brd px-1 py-0.5 align-top text-center">{pi + 1}.</td>
        <td className="brd px-1 py-0.5 align-top font-medium">{prog.nama}</td>
        {Array.from({ length: 10 }, (_, i) => <td key={i} className="brd px-1 py-0.5" />)}
      </tr>
      {prog.kegs.map((keg, ki) => (
        <PohonKegiatan key={keg.nama} keg={keg} ki={ki} uraianByKode={uraianByKode} />
      ))}
    </>
  )
}

function PohonKegiatan({ keg, ki, uraianByKode }: {
  keg: Keg; ki: number; uraianByKode: Map<string, string>
}) {
  return (
    <>
      <tr>
        <td className="brd px-1 py-0.5" />
        <td className="brd px-1 py-0.5 align-top pl-4">{ki + 1}. {keg.nama}</td>
        {Array.from({ length: 10 }, (_, i) => <td key={i} className="brd px-1 py-0.5" />)}
      </tr>
      {keg.subs.map((sub, si) => (
        <PohonSub key={sub.paket.id} sub={sub} si={si} uraianByKode={uraianByKode} />
      ))}
    </>
  )
}

function PohonSub({ sub, si, uraianByKode }: {
  sub: Sub; si: number; uraianByKode: Map<string, string>
}) {
  const subtotal = sub.isi.reduce((s, r) => s + (r.total_anggaran || 0), 0)
  return (
    <>
      <tr>
        <td className="brd px-1 py-0.5" />
        <td className="brd px-1 py-0.5 align-top pl-8">
          {HURUF[si] || si + 1}. {sub.paket.sub_kegiatan || '(sub kegiatan belum dipilih)'}
        </td>
        {Array.from({ length: 10 }, (_, i) => <td key={i} className="brd px-1 py-0.5" />)}
      </tr>

      {sub.isi.length === 0 ? (
        <tr>
          <td className="brd px-1 py-0.5" />
          <td className="brd px-1 py-0.5" />
          <td className="brd px-1 py-2 text-center text-gray-400" colSpan={10}>Belum ada usulan barang.</td>
        </tr>
      ) : sub.isi.map((r, i) => (
        <tr key={r.id}>
          <td className="brd px-1 py-0.5 text-center align-top">{r.no_urut ?? i + 1}</td>
          {/* Kolom 2 sengaja kosong — hierarkinya sudah dicetak di baris judul. */}
          <td className="brd px-1 py-0.5" />
          <td className="brd px-1 py-0.5 align-top">{r.kode_rekening || '-'}</td>
          <td className="brd px-1 py-0.5 align-top">{r.kode || '-'}</td>
          <td className="brd px-1 py-0.5 align-top">{(r.kode && uraianByKode.get(r.kode)) || '-'}</td>
          <td className="brd px-1 py-0.5 align-top">{r.nama_barang || '-'}</td>
          <td className="brd px-1 py-0.5 align-top text-right">{r.jumlah_kebutuhan ?? 0}</td>
          <td className="brd px-1 py-0.5 align-top">{r.satuan || '-'}</td>
          <td className="brd px-1 py-0.5 align-top text-right">{formatRupiah(r.harga_satuan)}</td>
          <td className="brd px-1 py-0.5 align-top text-right">{formatRupiah(r.total_anggaran)}</td>
          <td className="brd px-1 py-0.5 align-top text-right">{r.jumlah_eksisting ?? 0}</td>
          <td className="brd px-1 py-0.5 align-top">{r.keterangan || ''}</td>
        </tr>
      ))}

      {sub.isi.length > 0 && (
        <tr>
          <td className="brd px-1 py-0.5" />
          <td className="brd px-1 py-0.5 text-right italic" colSpan={8}>Subtotal sub kegiatan</td>
          <td className="brd px-1 py-0.5 text-right font-semibold">{formatRupiah(subtotal)}</td>
          <td className="brd px-1 py-0.5" colSpan={2} />
        </tr>
      )}
    </>
  )
}
