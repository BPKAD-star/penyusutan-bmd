'use client'
// ============================================================================
// Cetak lembar PEROLEHAN sesuai Format baku Permendagri 47/2021 (cabang IV.A).
//
//   ?jenis=hibah_masuk|hasil_inventarisasi|tukar_menukar|perolehan_lainnya
//   &skpd=<id>                WAJIB untuk lembar per-SKPD (2–6); lembar
//                             se-Kabupaten (7–10) tak memerlukannya
//   &periode=2026-S1          atau &periode=2026 (AKHIR TAHUN: S1+S2 digabung)
//   &komptabel=intra|ekstra|semua  (bawaan: intra)
//   &lembar=2,3,4,5,6         per-SKPD; 7,8,9,10 = se-KABUPATEN (bawaan: 2–6)
//
// Lembar yang dicentang dirangkai jadi SATU berkas dengan page-break, pola yang
// sama dengan BA Rekon: sekali cetak, sekali tanda tangan, dan tiap lembar tetap
// bisa diambil sendiri kalau diminta.
//
// ⚠️ SUSUNAN & PENOMORAN KOLOMNYA DATA, BUKAN JSX — lihat `FORMAT_PEROLEHAN`
// di lib/formatPermendagri.ts. Keempat cara perolehan identik di kolom (9)–(18)
// dan hanya berbeda pada satu blok dokumen di tengah.
//
// ⚠️ ANGKANYA DIMUAT `muatLembarPerolehan` — SAMA dengan tab "Format
// Permendagri" di menu Pelaporan. Dua jalur angka untuk lembar yang sama adalah
// cara paling gampang menghasilkan pratinjau yang berbeda dari berkas yang
// akhirnya ditandatangani, dan bedanya tak akan bersuara.
//
// ⚠️ BEDA DARI /cetak/perolehan (2026-08-20). Yang itu lembar RINGKAS 14 kolom
// A4 buatan sendiri; yang ini format BAKU Permendagri, F4 lanskap, dengan baris
// subtotal bertingkat. Keduanya sengaja hidup berdampingan.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'
import {
  FORMAT_PEROLEHAN, SEG_MIN_REKAP, segmenKode, labelKomptabel, cocokKomptabel,
  bolehLembarKabupaten,
  type FormatPerolehan, type ItemLaporan, type Komptabel,
} from '@/lib/formatPermendagri'
import {
  muatLembarPerolehan, muatLembarKabupaten, type BarisPerolehan,
} from '@/lib/laporanPerolehanPermendagri'
import { fetchApprovalScope } from '@/lib/roles'
import LembarPerolehanPermendagri from '@/components/pelaporan/LembarPerolehanPermendagri'
import LembarRekapKabupaten, { type ItemKab } from '@/components/pelaporan/LembarRekapKabupaten'

/** Penanda tangan lembar se-Kabupaten dipilih BEBAS dari seluruh pegawai —
 *  pola `bmd_rkbmd_ttd_sekab`. Yang meneken rekap se-kabupaten itu Pejabat
 *  Penatausahaan Barang, bukan kepala salah satu SKPD. */
const KEY_TTD_KAB = 'bmd_perolehan_ttd_sekab'
type Pegawai = { id: string; nama: string; nip: string | null; jabatan: string | null }

const KABUPATEN = 'Kediri'

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

/**
 * Isian kop (5) & (6). `'2026-S1'` → Semester I; `'2026'` → AKHIR TAHUN.
 *
 * ⚠️ Periode kosong sengaja tak dilayani halaman ini — kop-nya wajib menyebut
 * SATU tahun, dan "seluruh periode" akan membuatnya berbohong tentang isinya.
 */
function labelPeriode(periode: string): { judul: string; tahun: string } {
  if (/^\d{4}$/.test(periode)) return { judul: 'AKHIR TAHUN', tahun: periode }
  const [th, smt] = periode.split('-')
  return { judul: smt === 'S2' ? 'SEMESTER II' : 'SEMESTER I', tahun: th || String(new Date().getFullYear()) }
}

/**
 * Isian (1) "BERUPA…" — DITURUNKAN dari kelompok neraca yang benar-benar ada
 * datanya, bukan dipaku. Mengarang salah satunya membuat kop lembar berbohong
 * tentang isinya sendiri.
 */
function berupaDari(kodes: string[]): string {
  const kel = new Set(kodes.map(k => segmenKode(k).slice(0, SEG_MIN_REKAP).join('.')))
  if (kel.has('1.3') && kel.has('1.5')) return 'ASET TETAP DAN ASET LAINNYA'
  if (kel.has('1.5')) return 'ASET LAINNYA'
  if (kel.has('1.3')) return 'ASET TETAP'
  return '…………………………'
}

export default function CetakPerolehanPermendagriPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<BarisPerolehan[]>([])
  const [namaTingkat, setNamaTingkat] = useState<Map<string, string>>(new Map())
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [sebutan, setSebutan] = useState('Pengguna Barang')
  const [jenis, setJenis] = useState('hibah_masuk')
  const [periode, setPeriode] = useState('')
  const [komptabel, setKomptabel] = useState<Komptabel>('intra')
  const [lembar, setLembar] = useState<number[] | undefined>(undefined)
  const [rowsKab, setRowsKab] = useState<BarisPerolehan[]>([])
  const [namaKab, setNamaKab] = useState<Map<string, string>>(new Map())
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [ttdKabId, setTtdKabId] = useState('')
  const [peringatan, setPeringatan] = useState('')
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
        if (!per) throw new Error('Periode belum dipilih. Kop lembar ini menyebut satu semester atau satu tahun, jadi wajib berperiode.')
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        setJenis(jns); setPeriode(per)
        const kmp = q.get('komptabel')
        setKomptabel(kmp === 'ekstra' || kmp === 'semua' ? kmp : 'intra')
        const pilih = (q.get('lembar') || '').split(',').map(Number).filter(n => n >= 2 && n <= 10)
        setLembar(pilih.length > 0 ? pilih : undefined)
        setSkpdId(sk)

        // ⚠️ SKPD wajib HANYA untuk lembar per-SKPD. Lembar se-Kabupaten
        // menjumlah SELURUH SKPD — mensyaratkannya di situ bertentangan dengan
        // gunanya. (`lembar` kosong = bawaan 2–6, jadi tetap butuh SKPD.)
        const perluSkpd = pilih.length === 0 || pilih.some(n => n >= 2 && n <= 6)
        if (perluSkpd && !sk) {
          throw new Error('SKPD belum dipilih. Lembar per-SKPD (IV.A.…2–6) memuat identitas SKPD di kopnya, jadi wajib per-SKPD.')
        }

        if (perluSkpd && sk) {
          const h = await muatLembarPerolehan(supabase, { jenis: jns, skpdId: sk, periode: per })
          setRows(h.rows); setNamaTingkat(h.namaTingkat); setSkpd(h.skpd); setSebutan(h.sebutan)

          // ⚠️ WAJIB `fetchCalonTtd`, bukan `admin_pegawai` ber-`.eq('skpd_id')`:
          // dari 816 SKPD hanya 57 yang punya pegawai berjabatan "Kepala" & 756
          // di antaranya sub-SKPD. Gagal memuatnya TIDAK menjatuhkan lembar —
          // blok tanda tangan tinggal bertitik-titik, keadaan yang memang sah.
          const byId = new Map<number, SkpdNode>(
            h.semuaSkpd.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
          let daftar: CalonTtd[] = []
          try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
          setCalon(daftar)

          const simpan = bacaTtd(sk)
          const idTerpilih = q.get('ttd') || simpan?.id || calonTtdAwal(daftar)?.id || ''
          setTtdId(idTerpilih)
          setPlt(q.get('plt') === '1' ? true
            : simpan?.plt ?? (daftar.find(c => c.id === idTerpilih)?.pltDisarankan ?? false))
          setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())
        } else {
          setTglTtd(q.get('tgl') || todayStr())
        }

        // ── Lembar se-Kabupaten (IV.A.<n>.7–10) ────────────────────────────
        // ⚠️ GERBANGNYA DI SINI, SEBELUM MEMUAT. RLS tidak MENOLAK pengurus
        // barang SKPD — ia cuma mengembalikan lebih sedikit baris, sehingga
        // lembar berkop se-Kabupaten bisa terbit berisi satu SKPD saja: salah,
        // tampak sah, tanpa satu pun error. Menolak berikut ALASAN, bukan
        // sekadar menyembunyikan.
        if (pilih.some(n => n >= 7)) {
          const scope = await fetchApprovalScope(supabase)
          if (!bolehLembarKabupaten(scope.role)) {
            throw new Error(
              'Lembar se-Kabupaten (IV.A.…7–10) hanya untuk Pengelola Barang (Admin Pemda) '
              + '& Pengawas (Akuntansi/Auditor). Data yang bisa Anda baca terbatas pada SKPD '
              + 'Anda, jadi lembarnya akan berkop se-Kabupaten tapi berisi satu SKPD saja.')
          }
          const hk = await muatLembarKabupaten(supabase, { jenis: jns, periode: per })
          setRowsKab(hk.rows); setNamaKab(hk.namaTingkat)

          // Daftar calon penanda tangan. ⚠️ Kegagalannya SENGAJA tidak
          // menjatuhkan lembar — sama seperti `fetchCalonTtd` di atas: blok
          // tanda tangan tinggal bertitik-titik, dan itu keadaan yang memang
          // sah di sini. Yang TIDAK boleh cuma menelannya diam-diam, jadi
          // errornya tetap dibaca & dilaporkan sebagai peringatan.
          const { data: pg, error: pgErr } = await supabase.from('admin_pegawai')
            .select('id,nama,nip,jabatan').order('nama').limit(2000)
          if (pgErr) setPeringatan(`Daftar penanda tangan gagal dimuat (${pgErr.message}) — blok tanda tangan dibiarkan kosong.`)
          setPegawai((pg || []) as Pegawai[])
          try { setTtdKabId(q.get('ttdkab') || localStorage.getItem(KEY_TTD_KAB) || '') } catch { /* mode privat */ }
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
  // Lembar rinci ikut? (tak ada `lembar` = 2–6, jadi ikut.)
  const adaRinci = !lembar || lembar.includes(2)
  const adaPerSkpd = (!lembar || lembar.some(n => n >= 2 && n <= 6)) && skpdId != null
  const adaKab = !!lembar && lembar.some(n => n >= 7)
  const ttdKab = pegawai.find(x => x.id === ttdKabId) || null

  const itemsKab: ItemKab<BarisPerolehan>[] = rowsKab
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({
      kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0,
      data: r, skpdRoot: r.skpd_root || '(tanpa SKPD)',
    }))

  // Lembar ini menyatakan SATU komptabel di kop (2), jadi isinya wajib
  // benar-benar satu komptabel. Barang tanpa nilai kolom itu dianggap intra,
  // sejalan dengan `klasifikasiKomptabel` (bawaannya intra).
  const items: ItemLaporan<BarisPerolehan>[] = rows
    .filter(r => cocokKomptabel(komptabel, r.aset!.intra_ekstra))
    .map(r => ({ kode: r.aset!.kode, jumlah: r.aset!.jumlah ?? 1, nilai: r.nilai || 0, data: r }))

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

  // Berkas se-Kabupaten tak punya nama SKPD di judulnya.
  useEffect(() => {
    if (skpd || !adaKab) return
    document.title = `${f.awalan} se-Kabupaten ${KABUPATEN} ${tahun}`
  }, [skpd, adaKab, f.awalan, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* ORIENTASI DITENTUKAN OLEH LEMBAR YANG DICENTANG:
          · ada lembar RINCI → F4 LANSKAP. 17 kolom mustahil muat di lebar
            215 mm; lembar RKBMD 13 kolom saja sudah terbukti tak cukup.
          · hanya REKAP      → F4 POTRET. Cuma 4–6 kolom, jadi lanskap
            menyisakan lautan ruang kosong & bikin fontnya terlihat kecil.
          ⚠️ Versi pertama memakai `@page` BERNAMA (`page: rinci|rekap`) supaya
          satu berkas bisa memuat dua orientasi sekaligus. TERBUKTI TIDAK JALAN
          di Chrome — `size` pada @page bernama diabaikan, seluruh berkas ikut
          orientasi bawaan. Jangan dicoba lagi; yang berlaku sekarang SATU
          orientasi per berkas, dan itu justru membuat perilakunya bisa
          ditebak. Untuk mendapat rinci-lanskap + rekap-potret: pisahkan
          centangnya, cetak dua kali. */}
      <style>{`@media print {
        .no-print { display: none !important; }
        @page { size: ${adaRinci ? '330mm 215mm' : '215mm 330mm'}; margin: ${adaRinci ? '8mm' : '12mm'}; }
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
                onChange={e => setKomptabel(e.target.value as Komptabel)}>
                <option value="intra">Intrakomptabel</option>
                <option value="ekstra">Ekstrakomptabel</option>
                <option value="semua">Intra + Ekstra</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Tanggal:
              <input type="date" className="select-filter text-sm" value={tglTtd}
                onChange={e => { setTglTtd(e.target.value); simpanTtd({ tgl: e.target.value }) }} />
            </label>
            {/* Definitif/Plt DITANYAKAN, tak ditebak — statusnya tidak ada di
                `admin_pegawai` maupun di mana pun; `pltDisarankan` cuma menaruh
                centang awal di tempat yang paling sering benar. */}
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
        {siap && !gagal && adaKab && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Ttd se-Kabupaten:
            <select className="select-filter text-sm max-w-sm" value={ttdKabId}
              onChange={e => {
                setTtdKabId(e.target.value)
                try { localStorage.setItem(KEY_TTD_KAB, e.target.value) } catch { /* mode privat */ }
              }}>
              <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
              {pegawai.map(x => (
                <option key={x.id} value={x.id}>{x.nama}{x.jabatan ? ` — ${x.jabatan}` : ''}</option>
              ))}
            </select>
          </label>
        )}
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      {peringatan && (
        <div className="max-w-[1600px] mx-auto mb-3 px-4 no-print">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ⚠ {peringatan}
          </p>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0 space-y-10 print:space-y-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <>
            {adaPerSkpd && (
              <LembarPerolehanPermendagri
                f={f} items={items} namaTingkat={namaTingkat} skpd={skpd}
                berupa={berupaDari(items.map(i => i.kode))}
                labelKomptabel={labelKomptabel(komptabel)}
                judulPeriode={judulPeriode} tahun={tahun} sebutan={sebutan}
                ttd={ttd ? { nama: ttd.nama, nip: ttd.nip } : null}
                tglTtd={tglTtd} lembar={lembar} />
            )}
            {adaKab && (
              <div className={adaPerSkpd ? 'break-before-page' : ''}>
                <LembarRekapKabupaten
                  judulDasar={f.judul.replace(/^LAPORAN /, '')} awalan={f.awalan}
                  items={itemsKab} namaTingkat={namaKab}
                  berupa={berupaDari(itemsKab.map(i => i.kode))}
                  labelKomptabel={labelKomptabel(komptabel)}
                  judulPeriode={judulPeriode} tahun={tahun}
                  ttd={ttdKab ? { nama: ttdKab.nama, nip: ttdKab.nip } : null}
                  tglTtd={tglTtd} lembar={lembar} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
