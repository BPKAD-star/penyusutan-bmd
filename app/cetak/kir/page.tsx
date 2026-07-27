'use client'
// Cetak Kartu Inventaris Ruangan (KIR) — Format III.K.2. Standalone, A4 landscape,
// satu halaman per ruangan (page-break antar ruangan).
// Query:
//   ?ruangan=<id kir_ruangan>  → satu ruangan
//   ?skpd=<id admin_skpd>      → seluruh ruangan milik SKPD itu
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  tahunPerolehan, toIsiRuangan, RUANGAN_COLS, ASET_JOIN_COLS,
  type IsiRuangan, type Ruangan,
} from '@/lib/kir'

type SkpdRow = { id: number; nama: string; parent_id: number | null; kode_skpd: string | null }
type Kartu = Ruangan & { isi: IsiRuangan[] }

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/** SKPD induk paling atas — dicetak sbg "Pengguna Barang" (yg dipilih = Kuasa Pengguna Barang). */
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

function Kolom({ n, children, className = '' }: { n: number; children: React.ReactNode; className?: string }) {
  return <td className={`brd px-1 py-0.5 align-top ${className}`} data-col={n}>{children}</td>
}

function KartuRuangan({ r, skpdById, pengurus }: {
  r: Kartu; skpdById: Map<number, SkpdRow>; pengurus: { nama: string; nip: string | null } | null
}) {
  const skpd = skpdById.get(r.skpd_id)
  const induk = akarSkpd(r.skpd_id, skpdById)

  return (
    <div className="bg-white p-8 shadow print:shadow-none print:p-0 mb-6 print:mb-0 print:break-after-page text-[10px] text-gray-900">
      <style>{`.brd{border:1px solid #6b7280}`}</style>

      <p className="text-right text-[10px] mb-2">FORMAT III.K.2</p>
      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[12px]">Pemerintah Kabupaten Kediri</p>
        <p className="font-bold uppercase text-[12px]">Kartu Inventaris Ruangan (KIR)</p>
        <p className="font-bold uppercase text-[12px]">Barang Milik Daerah</p>
      </div>

      <table className="mb-2">
        <tbody>
          <tr>
            <td className="pr-2 align-top">Kuasa Pengguna Barang</td><td className="pr-2 align-top">:</td>
            <td className="align-top">{skpd?.nama || `SKPD #${r.skpd_id}`}</td>
          </tr>
          <tr>
            <td className="pr-2 align-top">Pengguna Barang</td><td className="pr-2 align-top">:</td>
            <td className="align-top">{induk?.nama || skpd?.nama || '-'}</td>
          </tr>
          <tr>
            <td className="pr-2 align-top">Kode Lokasi</td><td className="pr-2 align-top">:</td>
            <td className="align-top">{skpd?.kode_skpd || '-'}</td>
          </tr>
          <tr>
            <td className="pr-2 align-top">Nama Ruangan</td><td className="pr-2 align-top">:</td>
            <td className="align-top">{r.nama}{r.kode_ruangan ? ` (${r.kode_ruangan})` : ''}</td>
          </tr>
        </tbody>
      </table>

      <table className="border-collapse w-full">
        <thead>
          <tr className="text-center font-semibold">
            <th className="brd px-1 py-1" rowSpan={2}>No</th>
            <th className="brd px-1 py-1" rowSpan={2}>NIBAR</th>
            <th className="brd px-1 py-1" rowSpan={2}>Nomor Register</th>
            <th className="brd px-1 py-1" rowSpan={2}>Kode Barang</th>
            <th className="brd px-1 py-1" rowSpan={2}>Nama Barang</th>
            <th className="brd px-1 py-1" rowSpan={2}>Spesifikasi Nama Barang</th>
            <th className="brd px-1 py-1" colSpan={2}>Satuan</th>
            <th className="brd px-1 py-1" rowSpan={2}>Jumlah</th>
            <th className="brd px-1 py-1" rowSpan={2}>Satuan</th>
            <th className="brd px-1 py-1" rowSpan={2}>Keterangan</th>
          </tr>
          <tr className="text-center font-semibold">
            <th className="brd px-1 py-1">Merk / Tipe</th>
            <th className="brd px-1 py-1">Tahun Perolehan</th>
          </tr>
          <tr className="text-center text-[9px]">
            {Array.from({ length: 11 }, (_, i) => <td key={i} className="brd px-1">{i + 1}</td>)}
          </tr>
        </thead>
        <tbody>
          {r.isi.length === 0 ? (
            <tr><td className="brd px-1 py-3 text-center text-gray-400" colSpan={11}>Belum ada barang di ruangan ini.</td></tr>
          ) : r.isi.map((b, i) => (
            <tr key={b.id}>
              <Kolom n={1} className="text-center">{i + 1}</Kolom>
              <Kolom n={2} className="break-all">{b.nibar || '-'}</Kolom>
              {/* Aplikasi ini memakai NIBAR sebagai satu-satunya nomor register
                  barang (tidak ada kolom nomor register terpisah di `aset`) —
                  kolom 3 tetap ada demi kesesuaian format, isinya sama. */}
              <Kolom n={3} className="break-all">{b.nibar || '-'}</Kolom>
              <Kolom n={4}>{b.kode}</Kolom>
              <Kolom n={5}>{b.uraian_barang || '-'}</Kolom>
              <Kolom n={6}>{b.nama_barang || '-'}</Kolom>
              <Kolom n={7}>{b.merek_tipe || '-'}</Kolom>
              <Kolom n={8} className="text-center">{tahunPerolehan(b.tgl_perolehan)}</Kolom>
              <Kolom n={9} className="text-center">{b.jumlah}</Kolom>
              <Kolom n={10}>{b.satuan || '-'}</Kolom>
              <Kolom n={11}>{b.keterangan || ''}</Kolom>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-right mt-6 mr-16">Kediri, {tglID()}</p>
      <div className="mt-2 flex justify-between px-8">
        <div className="text-center">
          <p>Pengurus Barang</p>
          <div className="h-16" />
          <p className="font-semibold underline">{pengurus?.nama || '(………………………………)'}</p>
          <p>NIP. {pengurus?.nip || '………………………'}</p>
        </div>
        <div className="text-center">
          <p>Penanggung Jawab Ruangan</p>
          <div className="h-16" />
          <p className="font-semibold underline">{r.pj_nama || '(………………………………)'}</p>
          <p>NIP. {r.pj_nip || '………………………'}</p>
        </div>
      </div>
    </div>
  )
}

export default function CetakKirPage() {
  const supabase = createClient()
  const [kartu, setKartu] = useState<Kartu[]>([])
  const [skpdById, setSkpdById] = useState<Map<number, SkpdRow>>(new Map())
  const [pengurus, setPengurus] = useState<Map<number, { nama: string; nip: string | null }>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search)
      const ruanganId = p.get('ruangan')
      const skpdId = p.get('skpd')
      if (!ruanganId && !skpdId) { setLoading(false); return }

      let q = supabase.from('kir_ruangan').select(RUANGAN_COLS)
      q = ruanganId ? q.eq('id', ruanganId) : q.eq('skpd_id', Number(skpdId))
      const { data: rs } = await q.order('nama')
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

        // SKPD (+ rantai induknya) untuk blok kepala kartu.
        const rows: SkpdRow[] = []
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id,kode_skpd').range(from, from + 999)
          if (!data || data.length === 0) break
          rows.push(...(data as SkpdRow[]))
          if (data.length < 1000) break
        }
        setSkpdById(new Map(rows.map(s => [s.id, s])))

        // Pengurus Barang per SKPD untuk blok tanda tangan kiri.
        const skpdIds = [...new Set(list.map(r => r.skpd_id))]
        const { data: pgw } = await supabase.from('admin_pegawai')
          .select('nama,nip,skpd_id').eq('role_bmd', 'pengurus_barang').in('skpd_id', skpdIds)
        const pm = new Map<number, { nama: string; nip: string | null }>()
        for (const g of (pgw || []) as { nama: string; nip: string | null; skpd_id: number }[]) {
          if (!pm.has(g.skpd_id)) pm.set(g.skpd_id, { nama: g.nama, nip: g.nip })
        }
        setPengurus(pm)
      }

      setKartu(list)
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
        ) : kartu.length === 0 ? (
          <div className="bg-white p-8 text-sm text-gray-500">Ruangan tidak ditemukan.</div>
        ) : (
          kartu.map(r => <KartuRuangan key={r.id} r={r} skpdById={skpdById} pengurus={pengurus.get(r.skpd_id) || null} />)
        )}
      </div>
    </div>
  )
}
