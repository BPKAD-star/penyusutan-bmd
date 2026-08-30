'use client'
// ============================================================================
// Tab "Format Permendagri" di keempat menu Laporan Perolehan manual (Hibah,
// Hasil Inventarisasi, Tukar Menukar, Perolehan Lainnya).
//
// Operator memilih lembar mana yang mau disusun (IV.A.<n>.2 rinci + .3–.6
// rekap), melihat pratinjaunya, lalu mencetak. Filter Periode & SKPD datang
// dari komponen induk (LaporanPerolehan) supaya sama dengan dua tab lainnya.
//
// ⚠️ Angkanya dimuat `muatLembarPerolehan` — SAMA dengan halaman cetak. Dua
// jalur angka untuk lembar yang sama adalah cara paling gampang menghasilkan
// pratinjau yang berbeda dari berkas yang akhirnya ditandatangani, dan bedanya
// tak akan bersuara.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FORMAT_PEROLEHAN, TANGGA_REKAP, SEG_MIN_REKAP, segmenKode,
  type ItemLaporan,
} from '@/lib/formatPermendagri'
import { muatLembarPerolehan, type BarisPerolehan } from '@/lib/laporanPerolehanPermendagri'
import LembarPerolehanPermendagri from './LembarPerolehanPermendagri'

/** Daftar lembar yang bisa dicentang: rinci + empat kedalaman rekap. */
const PILIHAN = [
  { akhiran: 2, label: 'Rinci (per barang)' },
  ...TANGGA_REKAP.map(t => ({ akhiran: t.akhiran, label: `Rekap menurut ${t.menurut.toLowerCase()}` })),
]

function berupaDari(kodes: string[]): string {
  const kel = new Set(kodes.map(k => segmenKode(k).slice(0, SEG_MIN_REKAP).join('.')))
  if (kel.has('1.3') && kel.has('1.5')) return 'ASET TETAP DAN ASET LAINNYA'
  if (kel.has('1.5')) return 'ASET LAINNYA'
  if (kel.has('1.3')) return 'ASET TETAP'
  return '…………………………'
}

function labelPeriode(periode: string): { judul: string; tahun: string } {
  if (/^\d{4}$/.test(periode)) return { judul: 'AKHIR TAHUN', tahun: periode }
  const [th, smt] = periode.split('-')
  return { judul: smt === 'S2' ? 'SEMESTER II' : 'SEMESTER I', tahun: th || '' }
}

export default function PerolehanFormatPermendagri({ jenis, skpdId, periode }: {
  jenis: string
  skpdId: number | null
  periode: string
}) {
  const supabase = createClient()
  const f = FORMAT_PEROLEHAN[jenis]
  const [rows, setRows] = useState<BarisPerolehan[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [komptabel, setKomptabel] = useState<'intra' | 'ekstra'>('intra')
  const [pilih, setPilih] = useState<number[]>(PILIHAN.map(p => p.akhiran))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const siapDimuat = skpdId != null && !!periode

  useEffect(() => {
    if (!siapDimuat || !f) { setRows([]); setSkpd(null); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        const h = await muatLembarPerolehan(supabase, { jenis, skpdId: skpdId!, periode })
        if (batal) return
        setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd); setSebutan(h.sebutan)
      } catch (e) {
        // Fail-closed: modul pelaporan lebih baik menolak tampil daripada
        // menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setErr((e as Error).message); setRows([]); setSkpd(null) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan "Memuat…" SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
  }, [jenis, skpdId, periode, siapDimuat, f]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) {
    return (
      <div className="card p-6 text-sm text-gray-500">
        Cara perolehan ini belum punya format Permendagri di aplikasi ini.
      </div>
    )
  }

  const items: ItemLaporan<BarisPerolehan>[] = rows
    .filter(r => (r.aset!.intra_ekstra ?? 'intra') === komptabel)
    .map(r => ({ kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r }))

  const { judul: judulPeriode, tahun } = labelPeriode(periode)
  const urlCetak = `/cetak/perolehan-permendagri?jenis=${jenis}&skpd=${skpdId}`
    + `&periode=${periode}&komptabel=${komptabel}&lembar=${pilih.join(',')}`

  const toggle = (n: number) =>
    setPilih(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].sort((a, b) => a - b))

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">Lembar yang disusun</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PILIHAN.map(p => (
                <label key={p.akhiran} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={pilih.includes(p.akhiran)}
                    onChange={() => toggle(p.akhiran)} />
                  <span className="font-medium">{f.awalan}.{p.akhiran}</span>
                  <span className="text-gray-500">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter" value={komptabel}
              onChange={e => setKomptabel(e.target.value === 'ekstra' ? 'ekstra' : 'intra')}>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
            </select>
          </div>
          <div className="ml-auto">
            {/* ⚠️ Dimatikan berikut ALASANNYA — tombol mati tanpa keterangan itu
                kegagalan senyap: operator menekan, tak terjadi apa-apa, dan tak
                punya cara tahu kenapa. */}
            {siapDimuat && pilih.length > 0 && !err ? (
              <a href={urlCetak} target="_blank" rel="noreferrer" className="btn-primary whitespace-nowrap">
                🖨 Cetak / Simpan PDF
              </a>
            ) : (
              <span className="btn-primary opacity-50 cursor-not-allowed whitespace-nowrap"
                title={err ? 'Angkanya gagal dimuat — perbaiki dulu.'
                  : !periode ? 'Pilih Periode dulu — kop lembar menyebut satu semester atau satu tahun.'
                    : skpdId == null ? 'Pilih SKPD dulu — kop lembar memuat identitas SKPD.'
                      : 'Centang minimal satu lembar.'}>
                🖨 Cetak / Simpan PDF
              </span>
            )}
          </div>
        </div>
      </div>

      {err && (
        <div className="card p-4 border-l-4 border-red-500 text-sm text-red-700">
          Gagal menyiapkan lembar: {err}
          <p className="text-xs text-red-600 mt-1">
            Angka TIDAK ditampilkan — muat ulang halaman dulu.
          </p>
        </div>
      )}

      {!siapDimuat ? (
        <div className="card p-6 text-sm text-gray-500">
          Pilih <b>Periode</b> dan <b>SKPD</b> di atas untuk menyusun lembarnya.
          Kop lembar Permendagri memuat identitas SKPD dan menyebut satu semester
          atau satu tahun, jadi keduanya wajib.
        </div>
      ) : loading ? (
        <div className="card p-6 text-sm text-gray-400">Memuat…</div>
      ) : err ? null : (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3">
            Pratinjau — <b>{items.length.toLocaleString('id-ID')} barang</b> ·{' '}
            {judulPeriode} {tahun} · {komptabel === 'ekstra' ? 'Ekstrakomptabel' : 'Intrakomptabel'}.
            {/* Pratinjau sengaja tak memilih penanda tangan: pilihannya disimpan
                per SKPD di layar cetak supaya cetak ulang menghasilkan lembar
                yang SAMA — berkas ini diteken lalu dipindai. */}
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              <LembarPerolehanPermendagri
                f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
                berupa={berupaDari(items.map(i => i.kode))}
                labelKomptabel={komptabel === 'ekstra' ? 'EKSTRAKOMPTABEL' : 'INTRAKOMPTABEL'}
                judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                ttd={null} tglTtd="" lembar={pilih} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
