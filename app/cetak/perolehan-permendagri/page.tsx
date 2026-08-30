'use client'
// ============================================================================
// Cetak lembar PEROLEHAN sesuai Format baku Permendagri 47/2021 (cabang IV.A).
//
//   ?jenis=hibah_masuk|hasil_inventarisasi|tukar_menukar|perolehan_lainnya
//   &skpd=<id>                (WAJIB — kop lembar memuat identitas SKPD)
//   &periode=YYYY-Sx          (kosong = seluruh periode → lembar TAHUNAN)
//   &komptabel=intra|ekstra   (bawaan: intra)
//
// SATU BERKAS berisi LIMA lembar (page-break antar lembar), pola yang sama
// dengan BA Rekon: IV.A.<n>.2 rinci + IV.A.<n>.3–6 rekap. Sekali cetak, sekali
// tanda tangan, dan tiap lembar tetap bisa diambil sendiri kalau diminta.
//
// ⚠️ SUSUNAN & PENOMORAN KOLOMNYA DATA, BUKAN JSX — lihat `FORMAT_PEROLEHAN`
// di lib/formatPermendagri.ts. Keempat cara perolehan identik di kolom (9)–(18)
// dan hanya berbeda pada satu blok dokumen di tengah; menyalin halaman ini per
// cara perolehan berarti empat tempat yang harus disunting tiap satu kolom
// bergeser, dan yang terlewat tak akan pernah error — ia cuma mencetak lembar
// yang beda susunan.
//
// ⚠️ BEDA DARI /cetak/perolehan (2026-08-20). Yang itu lembar RINGKAS 14 kolom
// A4 buatan sendiri; yang ini format BAKU Permendagri, F4 lanskap, dengan baris
// subtotal bertingkat. Keduanya sengaja hidup berdampingan — jangan salah satu
// dihapus tanpa keputusan user.
//
// ⚠️ FAIL-CLOSED. Baris yang dianulir dibuang lewat `fetchVoidedAsetIds`; kalau
// pemeriksaannya gagal, lembarnya TIDAK dirakit sama sekali (CLAUDE.md, modul
// pelaporan).
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import {
  FORMAT_PEROLEHAN, SEG_MIN_REKAP, segmenKode, petaNamaTingkat,
  sebutanPejabat, levelSkpd,
  type FormatPerolehan, type ItemLaporan, type BarisKodefikasi,
} from '@/lib/formatPermendagri'
import LembarPerolehanPermendagri, {
  type BarisLembar,
} from '@/components/pelaporan/LembarPerolehanPermendagri'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

type SkpdRow = { id: number; parent_id: number | null; nama: string; kode_skpd: string | null }

function descendantsOf(all: SkpdRow[], root: number): number[] {
  const anak = new Map<number, number[]>()
  for (const s of all) {
    if (s.parent_id == null) continue
    const a = anak.get(s.parent_id) || []; a.push(s.id); anak.set(s.parent_id, a)
  }
  const out: number[] = []; const stack = [root]; const seen = new Set<number>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id); out.push(id)
    for (const c of anak.get(id) || []) stack.push(c)
  }
  return out
}

// Bentuk barisnya dipegang PENYAJI (satu rumah untuk satu fakta); di sini cuma
// ditambah `aset_id`, yang dibutuhkan penyaringan void tapi tak ikut dicetak.
type Baris = BarisLembar & { aset_id: string | null }

const SEL = 'id,tanggal,nilai,keterangan,aset_id,header:header_id(no_sk,payload),' +
  'aset:aset_id(kode,nama_barang,uraian_barang,nibar,spesifikasi_lainnya,satuan,jumlah,' +
  'harga_satuan,kondisi_barang,tgl_perolehan,keterangan,intra_ekstra)'

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

const keyTtd = (skpdId: number) => `bmd_perolehan_ttd_skpd_${skpdId}`
type TtdTersimpan = { id?: string; plt?: boolean; tgl?: string }

function bacaTtd(skpdId: number): TtdTersimpan | null {
  try {
    const v = localStorage.getItem(keyTtd(skpdId))
    return v ? (JSON.parse(v) as TtdTersimpan) : null
  } catch { return null }
}

/** '2026-S1' → 'SEMESTER I'; kosong = seluruh periode → lembar TAHUNAN. */
function labelPeriode(periode: string): { judul: string; tahun: string } {
  if (!periode) return { judul: 'TAHUNAN', tahun: String(new Date().getFullYear()) }
  const [th, smt] = periode.split('-')
  return { judul: smt === 'S1' ? 'SEMESTER I' : smt === 'S2' ? 'SEMESTER II' : 'TAHUNAN', tahun: th }
}

/**
 * Isian (1) "BERUPA…" — DITURUNKAN dari kelompok neraca yang benar-benar ada
 * datanya, bukan dipaku. Kalau lembar memuat 1.3.x saja ia "ASET TETAP"; kalau
 * bercampur, dikatakan apa adanya. Mengarang salah satunya membuat kop lembar
 * berbohong tentang isinya sendiri.
 */
function berupaDari(kodes: string[]): string {
  const kel = new Set(kodes.map(k => segmenKode(k).slice(0, SEG_MIN_REKAP).join('.')))
  const punya = (k: string) => kel.has(k)
  if (punya('1.3') && punya('1.5')) return 'ASET TETAP DAN ASET LAINNYA'
  if (punya('1.5')) return 'ASET LAINNYA'
  if (punya('1.3')) return 'ASET TETAP'
  return '…………………………'
}

// ── Halaman ─────────────────────────────────────────────────────────────────

export default function CetakPerolehanPermendagriPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<Baris[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [jenis, setJenis] = useState('hibah_masuk')
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState<'intra' | 'ekstra'>('intra')
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [plt, setPlt] = useState(false)
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const jns = q.get('jenis') || 'hibah_masuk'
        if (!FORMAT_PEROLEHAN[jns]) {
          throw new Error(`Cara perolehan "${jns}" belum punya format Permendagri di aplikasi ini.`)
        }
        const per = q.get('periode') || ''
        const komp = q.get('komptabel') === 'ekstra' ? 'ekstra' : 'intra'
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        setJenis(jns); setPeriode(per); setKomptabel(komp)  // komptabel awal; bisa diganti di bilah atas
        if (!sk) throw new Error('SKPD belum dipilih. Kop lembar ini memuat identitas SKPD, jadi wajib per-SKPD.')

        const semua: SkpdRow[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('admin_skpd')
            .select('id,parent_id,nama,kode_skpd').range(from, from + 999)
          if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
          if (!data || data.length === 0) break
          semua.push(...(data as SkpdRow[]))
          if (data.length < 1000) break
        }
        const ini = semua.find(x => x.id === sk)
        if (!ini) throw new Error(`SKPD #${sk} tidak ditemukan.`)
        setSkpd({ kode: ini.kode_skpd || '', nama: ini.nama }); setSkpdId(sk)
        // Sebutan pejabat penanda tangan diturunkan dari LEVEL node SKPD.
        setSebutan(sebutanPejabat(levelSkpd(sk, new Map(semua.map(s => [s.id, s.parent_id])))))
        const desc = descendantsOf(semua, sk)

        const byId = new Map<number, SkpdNode>(
          semua.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)
        const simpan = bacaTtd(sk)
        const awal = calonTtdAwal(daftar)
        const idTerpilih = q.get('ttd') || simpan?.id || awal?.id || ''
        setTtdId(idTerpilih)
        setPlt(q.get('plt') === '1' ? true
          : simpan?.plt ?? (daftar.find(c => c.id === idTerpilih)?.pltDisarankan ?? false))
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())

        // Bentuk query SAMA dgn LaporanPerolehan & /cetak/perolehan supaya ikut
        // dilayani partial index `idx_trx_perolehan_id` (migrasi 20260820_03).
        let qq = supabase.from('transaksi_bmd').select(SEL)
          .eq('jenis', jns).order('id', { ascending: false })
        if (per) qq = qq.eq('periode', per)
        if (desc.length > 0) {
          const list = desc.join(',')
          qq = qq.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
        }
        const { data: trx, error: trxErr } = await qq.limit(2000)
        if (trxErr) throw new Error(trxErr.message)

        // ⚠️ Komptabel TIDAK disaring di sini — saringannya di `items` saat
        // render, supaya pemilih di bilah atas bisa mengganti lembar tanpa
        // memuat ulang seluruh data (dan tanpa menembak query kedua).
        const semuaBaris = ((trx as never as Baris[]) || []).filter(r => r.aset)

        const voided = await fetchVoidedAsetIds(
          supabase, [], semuaBaris.map(r => r.aset_id).filter((x): x is string => !!x))

        // ⚠️ URUTAN TOTAL & WAJIB — mesin subtotal memancarkan kelompok saat
        // awalan kode BERUBAH, jadi barisnya harus sudah urut menaik menurut
        // kode. Kunci kedua & ketiga pemecah seri: tanpanya barang bernama
        // kembar bertukar tempat tiap lembar dicetak ulang.
        const urut = semuaBaris
          .filter(r => !(r.aset_id && voided.has(r.aset_id)))
          .sort((a, b) =>
            (a.aset!.kode || '').localeCompare(b.aset!.kode || '')
            || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
            || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))
        setRows(urut)

        // ── Nama tiap tingkat kodefikasi ────────────────────────────────────
        // ⚠️ Diambil dari KOLOM hierarki baris 7-segmen, BUKAN dari baris
        // ber-kode pendek: tabel itu hanya berisi baris 7 segmen, jadi mencari
        // '1.3.2' di kolom `kode` mengembalikan nol baris tanpa satu pun error.
        const kodes = [...new Set(urut.map(r => r.aset!.kode))]
        if (kodes.length > 0) {
          const { data: kd, error: kdErr } = await supabase.from('admin_kodefikasi_bmd')
            .select('kode,uraian,nama_jenis,nama_objek,nama_rincian,nama_sub_rincian')
            .in('kode', kodes)
          if (kdErr) throw new Error(`gagal membaca kodefikasi barang: ${kdErr.message}`)
          setNamaTingkat(petaNamaTingkat((kd || []) as BarisKodefikasi[]))
        }
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const f: FormatPerolehan = FORMAT_PEROLEHAN[jenis] || FORMAT_PEROLEHAN.hibah_masuk
  const ttd = calon.find(c => c.id === ttdId) || null
  const { judul: judulPeriode, tahun } = labelPeriode(periode)
  const labelKomptabel = komptabel === 'ekstra' ? 'EKSTRAKOMPTABEL' : 'INTRAKOMPTABEL'

  // Lembar ini menyatakan SATU komptabel di kop (2), jadi isinya wajib
  // benar-benar satu komptabel. Barang tanpa nilai kolom itu dianggap intra,
  // sejalan dengan `klasifikasiKomptabel` (bawaannya intra).
  const items: ItemLaporan<Baris>[] = rows
    .filter(r => (r.aset!.intra_ekstra ?? 'intra') === komptabel)
    .map(r => ({
    kode: r.aset!.kode,
    jumlah: r.aset!.jumlah ?? 1,
    nilai: r.nilai || 0,
    data: r,
    }))
  const berupa = berupaDari(items.map(i => i.kode))
  const nama = (kode: string) => namaTingkat.get(kode) || ''

  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    const v: TtdTersimpan = { id: ttdId, plt, tgl: tglTtd, ...next }
    try { localStorage.setItem(keyTtd(skpdId), JSON.stringify(v)) } catch { /* kuota/mode privat */ }
  }

  useEffect(() => {
    if (!skpd) return
    const bersih = (t: string) => t.replace(/[\\/:*?"<>|]/g, '-').trim()
    document.title = `${f.kode} ${bersih(skpd.nama)} ${tahun}`
  }, [skpd, f.kode, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* F4 lanskap (keputusan user 2026-08-30) — 17 kolom mustahil muat di A4;
          lembar RKBMD 13 kolom saja sudah terbukti tak cukup di lebar 215 mm. */}
      <style>{`@media print {
        .no-print { display: none !important; }
        @page { size: 330mm 215mm; margin: 8mm; }
        body { background: white; }
        .break-before-page { break-before: page; }
      }`}</style>

      <div className="max-w-[1600px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && !gagal && (
          <>
            <p className="mr-auto text-xs text-gray-500">
              💡 Di dialog Print, <b>hilangkan centang &quot;Headers and footers&quot;</b> — tanggal,
              URL, &amp; judul tab di tepi kertas itu bawaan peramban, tak bisa dihapus dari halaman.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Komptabel:
              <select className="select-filter text-sm" value={komptabel}
                onChange={e => setKomptabel(e.target.value === 'ekstra' ? 'ekstra' : 'intra')}>
                <option value="intra">Intrakomptabel</option>
                <option value="ekstra">Ekstrakomptabel</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Tanggal:
              <input type="date" className="select-filter text-sm" value={tglTtd}
                onChange={e => { setTglTtd(e.target.value); simpanTtd({ tgl: e.target.value }) }} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Penanda tangan:
              <select className="select-filter text-sm max-w-sm" value={ttdId}
                onChange={e => {
                  const v = e.target.value
                  const p = calon.find(c => c.id === v)?.pltDisarankan ?? false
                  setTtdId(v); setPlt(p); simpanTtd({ id: v, plt: p })
                }}>
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
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <div className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0 space-y-10 print:space-y-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <>
            <LembarPerolehanPermendagri
              f={f} items={items} namaTingkat={namaTingkat} skpd={skpd} berupa={berupa}
              labelKomptabel={labelKomptabel} judulPeriode={judulPeriode} tahun={tahun}
              sebutan={sebutan} ttd={ttd ? { nama: ttd.nama, nip: ttd.nip } : null}
              tglTtd={tglTtd} />
          </>
        )}
      </div>
    </div>
  )
}
