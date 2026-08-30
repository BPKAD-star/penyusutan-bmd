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
  labelKomptabel, cocokKomptabel, REKAP_KABUPATEN, bolehLembarKabupaten,
  type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import { fetchApprovalScope } from '@/lib/roles'
import {
  muatLembarPerolehan, muatLembarKabupaten, type BarisPerolehan,
} from '@/lib/laporanPerolehanPermendagri'
import LembarPerolehanPermendagri from './LembarPerolehanPermendagri'
import LembarRekapKabupaten, { type ItemKab } from './LembarRekapKabupaten'

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
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [pilih, setPilih] = useState<number[]>(PILIHAN.map(p => p.akhiran))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  // Peran menentukan boleh-tidaknya kelompok SE-KABUPATEN — lihat
  // `bolehLembarKabupaten`: alasannya kebenaran lembar, bukan wewenang.
  const [role, setRole] = useState<string | null>(null)
  const [pilihKab, setPilihKab] = useState<number[]>([])

  useEffect(() => {
    void (async () => {
      try { setRole((await fetchApprovalScope(supabase)).role) } catch { setRole(null) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const bolehKab = bolehLembarKabupaten(role)

  const [rowsKab, setRowsKab] = useState<BarisPerolehan[]>([])
  const [namaKab, setNamaKab] = useState<Map<string, string>>(new Map())

  // ⚠️ DUA PRASYARAT YANG BERBEDA, dan ini bukan detail: lembar SE-KABUPATEN
  // menjumlah SELURUH SKPD, jadi mensyaratkan pemilihan SKPD di situ justru
  // bertentangan dengan gunanya. Yang per-SKPD butuh keduanya; yang
  // se-Kabupaten cukup periode.
  const siapPerSkpd = skpdId != null && !!periode
  const siapKab = !!periode

  useEffect(() => {
    if (!f) return
    const perluSkpd = siapPerSkpd && pilih.length > 0
    const perluKab = siapKab && pilihKab.length > 0 && bolehKab
    if (!perluSkpd && !perluKab) { setRows([]); setSkpd(null); setRowsKab([]); return }
    let batal = false
    void (async () => {
      setLoading(true); setErr('')
      try {
        if (perluSkpd) {
          const h = await muatLembarPerolehan(supabase, { jenis, skpdId: skpdId!, periode })
          if (batal) return
          setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd); setSebutan(h.sebutan)
        } else { setRows([]); setSkpd(null) }
        if (perluKab) {
          const hk = await muatLembarKabupaten(supabase, { jenis, periode })
          if (batal) return
          setRowsKab(hk.rows); setNamaKab(hk.namaTingkat)
        } else { setRowsKab([]) }
      } catch (e) {
        // Fail-closed: modul pelaporan lebih baik menolak tampil daripada
        // menyajikan angka kurang-sebagian yang kelihatan sah.
        if (!batal) { setErr((e as Error).message); setRows([]); setSkpd(null); setRowsKab([]) }
      } finally {
        // Di `finally`, BUKAN di akhir jalur sukses — kalau tidak, satu query
        // yang melempar meninggalkan "Memuat…" SELAMANYA.
        if (!batal) setLoading(false)
      }
    })()
    return () => { batal = true }
    // `pilih`/`pilihKab` sengaja ikut: kelompok yang tak dicentang tak perlu
    // ditarik datanya sama sekali (se-Kabupaten itu query paling mahal di sini).
  }, [jenis, skpdId, periode, siapPerSkpd, siapKab, pilih.length, pilihKab.length, bolehKab, f]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) {
    return (
      <div className="card p-6 text-sm text-gray-500">
        Cara perolehan ini belum punya format Permendagri di aplikasi ini.
      </div>
    )
  }

  const items: ItemLaporan<BarisPerolehan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({ kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r }))

  const { judul: judulPeriode, tahun } = labelPeriode(periode)
  const itemsKab: ItemKab<BarisPerolehan>[] = rowsKab
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0,
      data: r, skpdRoot: r.skpd_root || '(tanpa SKPD)',
    }))

  const pilihAktif = siapPerSkpd ? pilih : []
  const kabAktif = bolehKab ? pilihKab : []
  const semuaPilih = [...pilihAktif, ...kabAktif].sort((a, b) => a - b)
  // `skpd` hanya disertakan kalau memang ada lembar per-SKPD yang diminta —
  // halaman cetak mensyaratkannya HANYA untuk kelompok itu.
  const urlCetak = `/cetak/perolehan-permendagri?jenis=${jenis}`
    + (pilihAktif.length > 0 ? `&skpd=${skpdId}` : '')
    + `&periode=${periode}&komptabel=${komptabel}&lembar=${semuaPilih.join(',')}`

  /** Kenapa tombol Cetak mati / pratinjau kosong — dikatakan, bukan didiamkan. */
  const kurang = !periode ? 'Pilih Periode dulu.'
    : semuaPilih.length === 0
      ? (pilih.length > 0 && skpdId == null
        ? 'Lembar per-SKPD butuh SKPD — pilih SKPD di atas, atau centang kelompok Se-Kabupaten yang tidak memerlukannya.'
        : 'Centang minimal satu lembar.')
      : ''

  const toggle = (n: number) =>
    setPilih(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n].sort((a, b) => a - b))

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        {/* Baris 1: cakupan. Centang lembar sengaja di BARIS SENDIRI, di bawah
            pemilih Periode & SKPD milik induk (permintaan user 2026-08-30) —
            bersebelahan, kelimanya mendesak tombol Cetak keluar layar. */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Lembar yang disusun</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
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

        {/* Kelompok SE-KABUPATEN — lembar yang menjumlah SELURUH SKPD. */}
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Se-Kabupaten{' '}
            <span className="text-gray-400">
              — menjumlah SELURUH SKPD, jadi filter SKPD di atas tidak berlaku untuk kelompok ini.
            </span>
          </p>
          {bolehKab ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {REKAP_KABUPATEN.map(r => (
                <label key={r.akhiran} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={pilihKab.includes(r.akhiran)}
                    onChange={() => setPilihKab(p2 => p2.includes(r.akhiran)
                      ? p2.filter(x => x !== r.akhiran)
                      : [...p2, r.akhiran].sort((a, b) => a - b))} />
                  <span className="font-medium">{f.awalan}.{r.akhiran}</span>
                  <span className="text-gray-500">
                    Rekap menurut {r.menurut.toLowerCase()}
                    {r.perSkpd && ' (per Pengguna Barang)'}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            // ⚠️ MENOLAK BERIKUT ALASAN, bukan menyembunyikan. Tanpa keterangan,
            // operator cuma melihat kelompok yang tak bisa dicentang & tak punya
            // cara tahu kenapa.
            <p className="text-sm text-gray-400">
              Hanya untuk <b>Pengelola Barang (Admin Pemda)</b> &amp; <b>Pengawas
              (Akuntansi/Auditor)</b>. Data yang bisa Anda baca terbatas pada SKPD Anda,
              jadi lembarnya akan berkop se-Kabupaten tapi berisi satu SKPD saja.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Komptabel</label>
            <select className="select-filter" value={komptabel}
              onChange={e => setKomptabel(e.target.value as Komptabel)}>
              <option value="intra">Intrakomptabel</option>
              <option value="ekstra">Ekstrakomptabel</option>
              <option value="semua">Intra + Ekstra</option>
            </select>
          </div>
          {/* Orientasi kertas ikut centangnya — dikatakan di layar supaya
              operator tak perlu mencetak dulu untuk tahu. Satu berkas hanya
              bisa satu orientasi (lihat catatan di halaman cetak). */}
          <p className="text-xs text-gray-500 self-end">
            Kertas: <b>F4 {pilihAktif.includes(2) ? 'lanskap' : 'potret'}</b>
            {pilihAktif.includes(2) && semuaPilih.length > 1 && (
              <span> — rekap ikut lanskap. Mau rekap potret? Cetak {f.kode} sendiri
                dulu, lalu centang rekapnya saja.</span>
            )}
          </p>
          <div className="ml-auto">
            {/* ⚠️ Dimatikan berikut ALASANNYA — tombol mati tanpa keterangan itu
                kegagalan senyap: operator menekan, tak terjadi apa-apa, dan tak
                punya cara tahu kenapa. */}
            {!kurang && !err ? (
              <a href={urlCetak} target="_blank" rel="noreferrer" className="btn-primary whitespace-nowrap">
                🖨 Cetak / Simpan PDF
              </a>
            ) : (
              <span className="btn-primary opacity-50 cursor-not-allowed whitespace-nowrap"
                title={err ? 'Angkanya gagal dimuat — perbaiki dulu.' : kurang}>
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

      {kurang ? (
        <div className="card p-6 text-sm text-gray-500">
          {kurang}
          <p className="text-xs text-gray-400 mt-2">
            Lembar <b>per-SKPD</b> (IV.A.…2–6) memuat identitas SKPD di kop, jadi wajib
            memilih SKPD. Lembar <b>Se-Kabupaten</b> (IV.A.…7–10) menjumlah seluruh SKPD,
            jadi cukup Periode.
          </p>
        </div>
      ) : loading ? (
        <div className="card p-6 text-sm text-gray-400">Memuat…</div>
      ) : err ? null : (
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-3">
            Pratinjau — <b>{(pilihAktif.length > 0 ? items.length : itemsKab.length).toLocaleString('id-ID')} barang</b> ·{' '}
            {judulPeriode} {tahun} · {labelKomptabel(komptabel).toLowerCase()}.
            {/* Pratinjau sengaja tak memilih penanda tangan: pilihannya disimpan
                per SKPD di layar cetak supaya cetak ulang menghasilkan lembar
                yang SAMA — berkas ini diteken lalu dipindai. */}
            {' '}Penanda tangan &amp; tanggal dipilih di layar cetak.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[1100px] space-y-10">
              {pilihAktif.length > 0 && (
                <LembarPerolehanPermendagri
                  f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
                  berupa={berupaDari(items.map(i => i.kode))}
                  labelKomptabel={labelKomptabel(komptabel)}
                  judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                  ttd={null} tglTtd="" lembar={pilihAktif} />
              )}
              {kabAktif.length > 0 && (
                <LembarRekapKabupaten
                  judulDasar={f.judul.replace(/^LAPORAN /, '')} awalan={f.awalan}
                  items={itemsKab} namaTingkat={namaKab}
                  berupa={berupaDari(itemsKab.map(i => i.kode))}
                  labelKomptabel={labelKomptabel(komptabel)}
                  judulPeriode={judulPeriode} tahun={tahun}
                  ttd={null} tglTtd="" lembar={kabAktif} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
