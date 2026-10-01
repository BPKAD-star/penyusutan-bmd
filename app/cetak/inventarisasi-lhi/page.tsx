'use client'
// Cetak Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.13.
// Standalone (tanpa sidebar), A4 landscape. Query:
//   ?tahun=2026&golongan=1.3.3&kode=III.B.7[&skpd=<id>]
//   kode=semua → SEMUA format yang ada temuannya pada jenis aset itu, satu format
//   per halaman (format kosong dilewati). Penanda tangan & tanggal dipilih SEKALI.
// Subtree SKPD dihitung ulang di sini (URL ringkas, tak membawa daftar id) —
// pola sama dgn app/cetak/laporan-pengadaan/page.tsx.
import { useEffect, useMemo, useState } from 'react'
import { fetchSkpd } from '@/lib/skpdMaster'
import { createClient } from '@/lib/supabase/client'
import LhiTabel from '@/components/inventarisasi/LhiTabel'
import { useLhiData } from '@/components/inventarisasi/useLhiData'
import { konfigLki, LHI_URUT, type LhiKode, type Petugas } from '@/lib/inventarisasi'
import { fetchCalonTtd, calonTtdAwal, labelAsalTtd, type CalonTtd } from '@/lib/penandaTangan'
import { sebutanPejabat, levelSkpd } from '@/lib/formatPermendagri'
import { tglPanjang } from '@/lib/beritaAcaraRekon'
import { ingatanCetak, kunciTtdLhi } from '@/lib/ingatanCetak'
import { identitasLhi, nilaiBarisLhi } from '@/lib/inventarisasiLaporan'
import { muatTimUntukCetak } from '@/lib/inventarisasiData'

type SkpdRow = { id: number; parent_id: number | null; nama: string }

function descendantsOf(all: SkpdRow[], root: number): number[] {
  const childrenOf = new Map<number, number[]>()
  for (const s of all) {
    if (s.parent_id == null) continue
    const a = childrenOf.get(s.parent_id) || []; a.push(s.id); childrenOf.set(s.parent_id, a)
  }
  const out: number[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id); out.push(id)
    for (const c of childrenOf.get(id) || []) stack.push(c)
  }
  return out
}

const hariIni = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** ⚠️ TANPA Plt — kaki lembar ini mencetak PERAN (Pengguna / Kuasa Pengguna Barang),
 *  bukan jabatan struktural; "Plt. Pengguna Barang" bukan sebutan yang ada. */
type TtdTersimpan = { id?: string; tgl?: string }

export default function CetakLhiPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [golongan, setGolongan] = useState('1.3.3')
  const [kode, setKode] = useState<LhiKode | 'semua'>('III.B.7')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [skpdRows, setSkpdRows] = useState<SkpdRow[]>([])
  const [petugas, setPetugas] = useState<Petugas[]>([])
  const [timErr, setTimErr] = useState('')
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [tglTtd, setTglTtd] = useState(hariIni())

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search)
      const t = Number(q.get('tahun')) || new Date().getFullYear()
      const g = q.get('golongan') || '1.3.3'
      const k = (q.get('kode') as LhiKode | 'semua') || 'III.B.7'
      const sk = q.get('skpd') ? Number(q.get('skpd')) : null
      setTahun(t); setGolongan(g); setKode(k); setSkpdId(sk)

      if (sk) {
        const all = await fetchSkpd<SkpdRow>(supabase, 'id,parent_id,nama')
        setSkpdRows(all)
        setSkpdIds(descendantsOf(all, sk))
        // Tim per SKPD per tahun (cadangan: tim SKPD induk). Gagal membacanya
        // tak menjatuhkan laporan — blok petugasnya saja yang kosong, dan
        // itu DIKATAKAN di layar, bukan disembunyikan.
        try { setPetugas((await muatTimUntukCetak(supabase, sk, t)).petugas) }
        catch (e) { setTimErr(e instanceof Error ? e.message : String(e)) }

        // Calon penanda tangan — WAJIB `fetchCalonTtd` (dari 816 SKPD hanya 57 yang
        // punya pegawai berjabatan "Kepala"; yang merangkap pun harus ikut). Gagal
        // memuatnya tak menjatuhkan lembar — blok tanda tangan tinggal bertitik-titik.
        let daftar: CalonTtd[] = []
        try {
          daftar = await fetchCalonTtd(supabase, sk, new Map(all.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }])))
        } catch { daftar = [] }
        setCalon(daftar)
        const simpan = ingatanCetak<TtdTersimpan>(kunciTtdLhi(sk)).baca()
        setTtdId(q.get('ttd') || simpan?.id || calonTtdAwal(daftar)?.id || '')
        setTglTtd(q.get('tgl') || simpan?.tgl || hariIni())
      }
      setSiap(true)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { loading, err, barisUntuk, indukLive, wilayahLabel } = useLhiData({ tahun, golongan, skpdIds })
  // Daftar format yang dicetak: satu format, atau (kode=semua) hanya yang ADA temuannya.
  // Tiap format membentuk barisnya sendiri dgn nomor urut 1..n.
  const lembar = useMemo(() => {
    if (!siap) return []
    const daftar: LhiKode[] = kode === 'semua' ? LHI_URUT.filter(k => barisUntuk(k).length > 0) : [kode]
    return daftar.map(k => ({
      kode: k,
      rows: barisUntuk(k).map((b, i) => nilaiBarisLhi(k, b, i + 1, indukLive, wilayahLabel)),
    }))
  }, [siap, barisUntuk, kode, indukLive, wilayahLabel])
  const namaSkpd = skpdId ? skpdRows.find(r => r.id === skpdId)?.nama : undefined

  // Butir (3)–(5) kop lampiran — `identitasLhi` (lib/inventarisasiLaporan.ts),
  // SATU sumber dgn tabel di layar: Kuasa PB / PB dari SKPD yang dipilih,
  // Pengelola Barang = Badan Keuangan dan Aset Daerah.
  const identitas = useMemo(() => identitasLhi(skpdId, skpdRows), [skpdId, skpdRows])

  // Sebutan penanda tangan mengikuti LEVEL SKPD yang dilaporkan: level pengguna
  // barang → Pengguna Barang, di bawahnya → Kuasa Pengguna Barang. Se-kabupaten
  // (tanpa SKPD) ditandatangani Pengelola Barang. Dipakai `sebutanPejabat` yang
  // sama dgn lembar Permendagri lain, supaya sebutannya tak menyimpang.
  const sebutan = useMemo(() => {
    if (!skpdId) return 'Pengelola Barang'
    return sebutanPejabat(levelSkpd(skpdId, new Map(skpdRows.map(r => [r.id, r.parent_id]))))
  }, [skpdId, skpdRows])
  const ttd = calon.find(c => c.id === ttdId) || null
  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    ingatanCetak<TtdTersimpan>(kunciTtdLhi(skpdId)).simpan({ id: ttdId, tgl: tglTtd, ...next })
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err} — laporan TIDAK ditampilkan supaya tak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat.
        </div>
      )}
      {timErr && (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tim pelaksana tidak terbaca ({timErr}) — blok petugas di lembar ini kosong.
        </div>
      )}
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-[1400px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && skpdId != null && (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Tanggal:
              <input type="date" className="select-filter text-sm" value={tglTtd}
                onChange={e => { setTglTtd(e.target.value); simpanTtd({ tgl: e.target.value }) }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Penanda tangan ({sebutan}):
              <select className="select-filter text-sm max-w-sm" value={ttdId}
                onChange={e => { setTtdId(e.target.value); simpanTtd({ id: e.target.value }) }}>
                <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
                {calon.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nama}{c.jabatan ? ` — ${c.jabatan}` : ''}{labelAsalTtd(c)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
      </div>

      <div className="max-w-[1400px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {!siap || loading ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : (
          lembar.length === 0 ? (
            <p className="py-8 text-center text-gray-400 text-sm">Tidak ada format yang memiliki temuan.</p>
          ) : lembar.map((l, i) => (
            // Satu format = satu (atau lebih) halaman; format kosong sudah dilewati di `lembar`.
            <section key={l.kode} className={i < lembar.length - 1 ? 'print:break-after-page mb-10 print:mb-0' : ''}>
              <LhiTabel kode={l.kode} rows={l.rows} golongan={golongan} identitas={identitas} cetak
                jenisAset={konfigLki(golongan).label} tahun={tahun} />

              <div className="mt-8 flex justify-between text-[11px]">
                <div>
                  {petugas.length > 0 && (
                    <>
                      <p className="font-semibold mb-1">Pelaksana / Petugas Inventarisasi</p>
                      <ol className="list-decimal ml-4 space-y-0.5">
                        {petugas.map(p => <li key={p.pegawai_id}>{p.nama}{p.nip ? ` — NIP. ${p.nip}` : ''}</li>)}
                      </ol>
                    </>
                  )}
                </div>
                <div className="text-center">
                  <p>Kediri, {tglPanjang(tglTtd)}</p>
                  <p>{sebutan}</p>
                  <div className="h-16" />
                  {/* Belum dipilih → tetap bertitik-titik. JANGAN diisi nama lain. */}
                  <p className="font-semibold underline">{ttd ? ttd.nama : '(………………………………)'}</p>
                  <p>NIP. {ttd?.nip || '……………………………'}</p>
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
