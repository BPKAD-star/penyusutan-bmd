'use client'
// Uji Konsistensi — Tahap 1: Rekonsiliasi BMD ↔ Laporan BMD.
//
// CLAUDE.md sudah lama mewajibkan keduanya SAMA PERSIS pada periode & scope yang
// sama ("selisih yang tersisa = bug, bukan beda definisi") sejak `fn_rekap_bmd`
// dibuat period-aware (migrasi 20260805_02). Tapi kewajiban itu hanya tertulis
// di dokumen, dan repo ini berkali-kali membuktikan aturan yang cuma tertulis
// akan dilanggar. Halaman ini yang menegakkannya atas DATA HIDUP — uji golden
// (tests/golden/rekonsiliasi.test.ts) menjaga logikanya, bukan datanya.
//
// Gunanya bukan sekadar berburu bug: ini lembar yang dicetak & disimpan sebagai
// bukti bahwa laporan sudah sepakat SEBELUM diserahkan ke inspektorat/BPK.
//
// ⚠️ SENGAJA hanya dua sumber (keputusan user 2026-08-12). Daftar Barang &
// Penyusutan menjumlah dengan menarik SEMUA barisnya ke browser — di SKPD besar
// (Dinas Pendidikan: 694 unit, ~150rb baris) itu sudah sering macet, dan
// halaman ini justru paling dibutuhkan di sana. Menambahkan keduanya butuh RPC
// agregat sendiri; kerjakan hanya kalau terbukti pernah meleset.
//
// Kedua sumber di sini sama-sama sudah agregat:
//   Rekonsiliasi → fetchSnapshot (replay visibilitas + pemilik-pada-periode)
//   Laporan BMD  → RPC fn_rekap_bmd (agregasi di SQL)
// Jalannya sengaja BEDA — itulah gunanya: kalau keduanya dihitung dengan cara
// yang sama, kesamaannya tak membuktikan apa pun.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assertOk } from '@/shared/db/query'
import { GOLONGAN_REKAP } from '@/lib/bmd'
import { formatRupiah, exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { fetchSnapshot, measuresOf, type Snapshot, type Komptabel } from '@/lib/rekon'
import { rekapPerGolongan, zeroRekap, type RekapRpcRow, type RekapUkuran } from '@/lib/rekapBmd'
import SkpdCombobox, { type SkpdSelection as OrgSelection } from '@/components/SkpdCombobox'
import TahunTerkunciNote from '@/components/TahunTerkunciNote'
import { tahunAwal } from '@/lib/tahunKerja'

// Toleransi pembanding. Angka rupiah disimpan `numeric` di DB lalu melewati
// float JS; beda pembulatan sepersekian sen bukan ketidaksepakatan laporan.
// Jangan dilonggarkan lebih dari ini — 1 rupiah pun sudah harus dipertanyakan.
const TOLERANSI = 0.01

type Ukuran = 'perolehan' | 'akumulasi' | 'nilaiBuku'
const UKURAN: { key: Ukuran; label: string }[] = [
  { key: 'perolehan', label: 'Nilai Perolehan' },
  { key: 'akumulasi', label: 'Akumulasi' },
  { key: 'nilaiBuku', label: 'Nilai Buku' },
]

type Sel = { rekon: number; bmd: number }
type Baris = {
  golongan: string; uraian: string; komp: Komptabel
  nilai: Record<Ukuran, Sel>
  cocok: boolean
}

// Agregat fn_rekap_bmd per golongan untuk SATU komptabel. Dipanggil dua kali
// (intra & ekstra) karena RPC-nya menyaring komptabel, bukan memecahnya.
//
// ⚠️ Turunannya WAJIB lewat `rekapPerGolongan` (lib/rekapBmd.ts), bukan dibaca
// mentah dari RPC. Halaman ini pernah membaca `nilai_buku_akhir` apa adanya —
// nol untuk golongan yang tak disusutkan — lalu menuduh Tanah & Aset Tetap
// Lainnya "TIDAK COCOK" sebesar seluruh nilai perolehannya, padahal Laporan BMD
// yang dibandingkannya menampilkan angka yang benar. Lihat lib/rekapBmd.ts.

export default function UjiKonsistensiPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgSelection>({ skpdId: null, descendantIds: null })
  // `tahun` disimpan sbg STRING — sama dgn Laporan BMD & Rekonsiliasi, supaya
  // pilihan Tahun Kerja dari localStorage bisa dipakai apa adanya.
  const [tahun, setTahun] = useState(() => tahunAwal(String(new Date().getFullYear())))
  const [smt, setSmt] = useState<1 | 2>(1)

  const [rows, setRows] = useState<Baris[] | null>(null)
  const [applied, setApplied] = useState<{ periode: string; skpd: string; namaSkpd: string } | null>(null)
  const namaSkpd = useNamaSkpd()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // ⚠️ Seluruh badan di dalam try, `setLoading(false)` di FINALLY: `fetchSnapshot`
  // memanggil kolektor fail-closed yang MELEMPAR. Tanpa ini tombolnya nyangkut
  // "Memeriksa..." selamanya tanpa keterangan — cacat yang sudah berulang di
  // repo ini (lihat CLAUDE.md, Daftar Barang 2026-07-29).
  async function proses() {
    const periode = `${tahun}-S${smt}`
    setLoading(true); setErr(''); setRows(null)
    try {
      const skpdIds = org.descendantIds ?? null
      const [snap, bmdIntra, bmdEkstra] = await Promise.all([
        fetchSnapshot(supabase, periode, skpdIds),
        rekapBmd(periode, skpdIds, 'intra'),
        rekapBmd(periode, skpdIds, 'ekstra'),
      ])
      setRows(susun(snap, bmdIntra, bmdEkstra))
      setApplied({ periode, skpd: org.skpdId == null ? 'Seluruh Kabupaten' : 'SKPD terpilih', namaSkpd: namaSkpd.nama })
    } catch (e) {
      setErr(`Gagal memeriksa: ${e instanceof Error ? e.message : String(e)}. Hasil tidak ditampilkan supaya tak terbaca sebagai "semuanya cocok".`)
    } finally {
      setLoading(false)
    }
  }

  async function rekapBmd(periode: string, skpdIds: number[] | null, komp: Komptabel) {
    const data = assertOk(await supabase.rpc('fn_rekap_bmd', {
      p_periode: periode, p_skpd_ids: skpdIds, p_komptabel: komp,
    }), `rekap BMD ${komp} periode ${periode}`)
    return rekapPerGolongan((data || []) as RekapRpcRow[])
  }

  const jumlahBeda = rows?.filter(r => !r.cocok).length ?? 0

  function exportExcel() {
    if (!rows) return
    exportToExcel(rows.map(r => ({
      Golongan: `${r.golongan} — ${r.uraian}`,
      Komptabel: r.komp === 'intra' ? 'Intrakomptabel' : 'Ekstrakomptabel',
      'Perolehan (Rekonsiliasi)': r.nilai.perolehan.rekon,
      'Perolehan (Laporan BMD)': r.nilai.perolehan.bmd,
      'Selisih Perolehan': r.nilai.perolehan.rekon - r.nilai.perolehan.bmd,
      'Akumulasi (Rekonsiliasi)': r.nilai.akumulasi.rekon,
      'Akumulasi (Laporan BMD)': r.nilai.akumulasi.bmd,
      'Selisih Akumulasi': r.nilai.akumulasi.rekon - r.nilai.akumulasi.bmd,
      'Nilai Buku (Rekonsiliasi)': r.nilai.nilaiBuku.rekon,
      'Nilai Buku (Laporan BMD)': r.nilai.nilaiBuku.bmd,
      'Selisih Nilai Buku': r.nilai.nilaiBuku.rekon - r.nilai.nilaiBuku.bmd,
      Status: r.cocok ? 'COCOK' : 'TIDAK COCOK',
    })), namaBerkasLaporan({
      laporan: 'Uji Konsistensi', periode: applied?.periode, skpd: applied?.namaSkpd,
    }))
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Uji Konsistensi</h1>
        <p className="text-gray-500 text-sm mt-1">
          Membandingkan Saldo Akhir <strong>Rekonsiliasi BMD</strong> dengan <strong>Laporan BMD</strong> pada
          periode & SKPD yang sama. Keduanya dihitung lewat jalur yang berbeda — Rekonsiliasi me-replay ledger
          di aplikasi, Laporan BMD mengagregasi di database — jadi kalau angkanya sama, itu bukti keduanya
          benar. Kalau berbeda, salah satunya bug dan laporannya <strong>jangan dikirim dulu</strong>.
        </p>
      </div>

      <div className="card p-5 mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">SKPD / Lokasi :</label>
          <SkpdCombobox lockToOperator allowClear
            onChangeSelection={sel => { setOrg(sel); namaSkpd.pilih(sel.skpdId) }}
            placeholder="Semua — atau ketik SKPD / Sub OPD / Lokasi..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Periode :</label>
          <input type="number" className="select-filter w-28" value={tahun}
            onChange={e => setTahun(e.target.value)} />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={smt === 1} onChange={() => setSmt(1)} /> Semester I
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={smt === 2} onChange={() => setSmt(2)} /> Semester II
          </label>
          <button className="btn-primary ml-2" disabled={loading} onClick={proses}>
            {loading ? 'Memeriksa...' : 'Periksa'}
          </button>
        </div>
        <TahunTerkunciNote tahun={Number(tahun)} />
      </div>

      {err && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {err}
        </div>
      )}

      {rows && (
        <>
          <div className={`rounded-lg px-4 py-3 text-sm mb-4 border ${
            jumlahBeda === 0 ? 'bg-green-50 border-green-200 text-green-800'
                             : 'bg-red-50 border-red-200 text-red-800'}`}>
            {jumlahBeda === 0
              ? <>✅ <strong>Cocok seluruhnya</strong> — Rekonsiliasi BMD & Laporan BMD sepakat pada semua golongan × komptabel untuk {applied?.periode}. Lembar ini bisa disimpan sebagai bukti.</>
              : <>❌ <strong>{jumlahBeda} sel tidak cocok</strong> pada {applied?.periode}. Ini bug, bukan beda definisi — jangan kirim laporannya sebelum ditelusuri.</>}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-600">{applied?.periode} · {applied?.skpd}</p>
              <button className="btn-secondary text-xs" onClick={exportExcel}>Export Excel</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th text-left" rowSpan={2}>Golongan</th>
                    <th className="table-th text-left" rowSpan={2}>Komptabel</th>
                    {UKURAN.map(u => (
                      <th key={u.key} className="table-th text-center border-l border-gray-200" colSpan={3}>{u.label}</th>
                    ))}
                    <th className="table-th text-center border-l border-gray-200" rowSpan={2}>Status</th>
                  </tr>
                  <tr>
                    {UKURAN.map(u => [
                      <th key={`${u.key}-r`} className="table-th text-right border-l border-gray-200">Rekonsiliasi</th>,
                      <th key={`${u.key}-b`} className="table-th text-right">Laporan BMD</th>,
                      <th key={`${u.key}-d`} className="table-th text-right">Beda</th>,
                    ])}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(r => (
                    <tr key={`${r.golongan}-${r.komp}`} className={r.cocok ? '' : 'bg-red-50/60'}>
                      <td className="table-td whitespace-nowrap">{r.golongan} — {r.uraian}</td>
                      <td className="table-td whitespace-nowrap">{r.komp === 'intra' ? 'Intra' : 'Ekstra'}</td>
                      {UKURAN.map(u => {
                        const s = r.nilai[u.key]
                        const beda = s.rekon - s.bmd
                        const ok = Math.abs(beda) <= TOLERANSI
                        return [
                          <td key={`${u.key}-r`} className="table-td text-right border-l border-gray-200 whitespace-nowrap">{tampil(s.rekon)}</td>,
                          <td key={`${u.key}-b`} className="table-td text-right whitespace-nowrap">{tampil(s.bmd)}</td>,
                          <td key={`${u.key}-d`} className={`table-td text-right whitespace-nowrap ${ok ? 'text-gray-300' : 'text-red-600 font-semibold'}`}>
                            {ok ? '–' : formatRupiah(beda)}
                          </td>,
                        ]
                      })}
                      <td className="table-td text-center">{r.cocok ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Beda di bawah {TOLERANSI} rupiah diabaikan (pembulatan numeric → float). Tahap 1 membandingkan
            Rekonsiliasi ↔ Laporan BMD saja; Daftar Barang & Penyusutan belum ikut karena keduanya menjumlah
            di browser dan berat di SKPD besar.
          </p>
        </>
      )}
    </div>
  )
}

const tampil = (n: number) => (Math.abs(n) < 0.005 ? '–' : formatRupiah(n))

// Susun baris pembanding. SEMUA golongan di GOLONGAN_REKAP selalu ditampilkan,
// termasuk yang dua-duanya nol: baris yang HILANG tak bisa dibedakan dari baris
// yang cocok, padahal "kedua laporan sama-sama kehilangan satu golongan" justru
// kegagalan yang paling perlu terlihat.
function susun(
  snap: Snapshot,
  bmdIntra: Map<string, RekapUkuran>,
  bmdEkstra: Map<string, RekapUkuran>,
): Baris[] {
  const out: Baris[] = []
  for (const g of GOLONGAN_REKAP) {
    for (const komp of ['intra', 'ekstra'] as Komptabel[]) {
      const r = measuresOf(snap, g.kode, komp)
      const b = (komp === 'intra' ? bmdIntra : bmdEkstra).get(g.kode) ?? zeroRekap()
      const nilai: Record<Ukuran, Sel> = {
        perolehan: { rekon: r.perolehan, bmd: b.perolehan },
        akumulasi: { rekon: r.akumulasi, bmd: b.akumulasi },
        nilaiBuku: { rekon: r.nilaiBuku, bmd: b.nilaiBuku },
      }
      out.push({
        golongan: g.kode, uraian: g.uraian, komp, nilai,
        cocok: UKURAN.every(u => Math.abs(nilai[u.key].rekon - nilai[u.key].bmd) <= TOLERANSI),
      })
    }
  }
  return out
}
