'use client'
// ============================================================================
// Cetak "Laporan Penerimaan BMD Berupa Aset Tetap Dengan Cara Perolehan Dari …"
// Standalone (tanpa sidebar), A4 landscape.
//   ?jenis=hibah_masuk|tukar_menukar|hasil_inventarisasi|perolehan_lainnya|pengadaan
//   &skpd=<id>                (WAJIB — lihat di bawah)
//   &periode=YYYY-Sx          (kosong = semua periode)
//
// ⚠️ SUSUNAN KOLOM BERTUMPUK, BUKAN DATAR (keputusan user 2026-08-20). Format
// bakunya 16 kolom datar; di sini "Kode Barang + Uraian Barang" ditumpuk dalam
// satu sel dan "Jumlah + Satuan" jadi satu kolom dua baris → 14 kolom. Bukan
// selera tata letak: NIBAR panjangnya 45 DIGIT, dan pada A4 landscape (lebar
// cetak ~277 mm) 16 kolom menyisakan ~17 mm per kolom — NIBAR-nya pasti
// terpotong atau memaksa font di bawah batas terbaca. Repo ini sudah pernah
// kena: lembar RKBMD 13 kolom terbukti mustahil muat di lebar 215 mm, makanya
// dipindah ke F4. Di sini kertasnya dipertahankan A4 (permintaan user), jadi
// yang dikompromikan jumlah kolomnya.
//
// LEBARNYA DISETEL MANUAL & TOTALNYA PERSIS 100% (lihat <colgroup>) — itulah
// yang membuat lembarnya "fit to window": dgn `table-fixed`, tak ada kolom yang
// bisa melar mengikuti isinya lalu mendorong yang lain keluar halaman.
//
// ⚠️ WAJIB PER-SKPD. Kepala lembar memuat "<kode> - <nama SKPD>", jadi satu
// berkas hanya sah untuk satu SKPD. Tombol di menu Pelaporan dimatikan selama
// SKPD belum dipilih — bukan dibiarkan menghasilkan lembar tanpa identitas.
//
// ⚠️ FAIL-CLOSED. Baris yang dibatalkan (`batal_*` cara perolehan /
// `koreksi_pencatatan_ganda`) WAJIB dibuang lewat `fetchVoidedAsetIds`; kalau
// pemeriksaannya gagal, lembarnya TIDAK dirakit sama sekali. Lembar yang
// ditandatangani dan dikirim ke inspektorat/BPK jauh lebih mahal daripada
// halaman yang menolak tampil (CLAUDE.md, modul pelaporan).
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchVoidedAsetIds } from '@/lib/voidedAset'
import { periodeDiminta } from '@/lib/laporanPerolehanPermendagri'
import { formatRupiah } from '@/lib/export'
import { pecahNibar } from '@/lib/kodeRegister'
import {
  fetchCalonTtd, calonTtdAwal, labelAsalTtd, sebutanKepala,
  type CalonTtd, type SkpdNode,
} from '@/lib/penandaTangan'

const KABUPATEN = 'Kediri'
const PROVINSI = 'Jawa Timur'

/** Judul & label kolom pihak, per cara perolehan. */
const JENIS_INFO: Record<string, { judul: string; pihak: string }> = {
  hibah_masuk: { judul: 'HIBAH', pihak: 'Pihak Pemberi Hibah' },
  tukar_menukar: { judul: 'TUKAR MENUKAR', pihak: 'Pihak Tukar Menukar' },
  hasil_inventarisasi: { judul: 'HASIL INVENTARISASI', pihak: 'Pihak Terkait' },
  perolehan_lainnya: { judul: 'PEROLEHAN LAINNYA', pihak: 'Pihak Terkait' },
  pengadaan: { judul: 'PENGADAAN', pihak: 'Penyedia' },
}

type SkpdRow = { id: number; parent_id: number | null }

// Node + SEMUA turunannya — samakan dgn SkpdCombobox.descendants & halaman
// cetak Laporan Pengadaan (URL cuma membawa satu id, bukan daftar).
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

type Baris = {
  id: number
  tanggal: string
  nilai: number
  keterangan: string | null
  aset_id: string | null
  header: { no_sk: string; payload: { pihak?: string; sumber_dana?: string } | null } | null
  aset: {
    kode: string; uraian_barang: string | null; nama_barang: string | null; nibar: string | null
    spesifikasi_lainnya: string | null; satuan: string | null; jumlah: number | null
    harga_satuan: number | null; kondisi_barang: string | null; tgl_perolehan: string | null
    keterangan: string | null
  } | null
}

const SEL = 'id,tanggal,nilai,keterangan,aset_id,header:header_id(no_sk,payload),' +
  'aset:aset_id(kode,uraian_barang,nama_barang,nibar,spesifikasi_lainnya,satuan,jumlah,harga_satuan,kondisi_barang,tgl_perolehan,keterangan)'

/** '2026-02-24' → '24/02/2026'. Kosong → '' (bukan 'Invalid Date'). */
const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/**
 * '2026-08-20' → '20 Agustus 2026'.
 *
 * Diurai manual, SENGAJA bukan `new Date(s).toLocaleDateString`: `new Date`
 * membaca 'YYYY-MM-DD' sebagai tengah malam UTC, jadi di zona negatif
 * tanggalnya mundur sehari — lembar bertanda tangan tak boleh bergeser
 * tanggalnya hanya karena zona waktu peramban.
 */
function tglPanjang(s: string): string {
  const [y, m, d] = (s || '').slice(0, 10).split('-')
  const bln = BULAN[Number(m) - 1]
  return y && bln && d ? `${Number(d)} ${bln} ${y}` : ''
}

const todayStr = () => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** Pilihan penanda tangan DIPISAH PER SKPD — satu operator bisa mencetak lembar
 *  beberapa sub-OPD, dan satu kunci bersama akan membuat pilihan SKPD terakhir
 *  bocor ke lembar SKPD berikutnya (pola `bmd_rkbmd_ttd_skpd_<id>`).
 *  Preferensi tampilan, BUKAN gerbang wewenang. */
const keyTtd = (skpdId: number) => `bmd_perolehan_ttd_skpd_${skpdId}`
type TtdTersimpan = { id?: string; plt?: boolean; tgl?: string }

/** Isi localStorage itu data dari luar program (versi lama, suntingan manual,
 *  tab lain). Gagal mengurainya cukup berarti "belum pernah memilih" — jangan
 *  sampai menjatuhkan halaman cetak. */
function bacaTtd(skpdId: number): TtdTersimpan | null {
  try {
    const v = localStorage.getItem(keyTtd(skpdId))
    return v ? (JSON.parse(v) as TtdTersimpan) : null
  } catch {
    return null
  }
}

/** '2026-S1' → 'SEMESTER I'; kosong → 'AKHIR TAHUN' (seluruh periode). */
function labelPeriode(periode: string): { judul: string; tahun: string } {
  if (!periode) return { judul: 'AKHIR TAHUN', tahun: String(new Date().getFullYear()) }
  const [th, smt] = periode.split('-')
  return { judul: smt === 'S1' ? 'SEMESTER I' : smt === 'S2' ? 'SEMESTER II' : 'AKHIR TAHUN', tahun: th }
}

export default function CetakPerolehanPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [rows, setRows] = useState<Baris[]>([])
  const [skpd, setSkpd] = useState<{ kode: string; nama: string } | null>(null)
  const [jenis, setJenis] = useState('hibah_masuk')
  const [periode, setPeriode] = useState('')
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const [calon, setCalon] = useState<CalonTtd[]>([])
  const [ttdId, setTtdId] = useState('')
  const [plt, setPlt] = useState(false)
  const [tglTtd, setTglTtd] = useState(todayStr())

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const jns = q.get('jenis') || 'hibah_masuk'
        const per = q.get('periode') || ''
        const sk = q.get('skpd') ? Number(q.get('skpd')) : null
        setJenis(jns); setPeriode(per)
        if (!sk) throw new Error('SKPD belum dipilih. Lembar ini memuat identitas SKPD di kepalanya, jadi wajib per-SKPD.')

        // ── SKPD: identitas kepala lembar + subtree utk penyaringan ──────────
        const semua: (SkpdRow & { nama: string; kode_skpd: string | null })[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('admin_skpd')
            .select('id,parent_id,nama,kode_skpd').range(from, from + 999)
          if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
          if (!data || data.length === 0) break
          semua.push(...(data as typeof semua))
          if (data.length < 1000) break
        }
        const ini = semua.find(x => x.id === sk)
        if (!ini) throw new Error(`SKPD #${sk} tidak ditemukan.`)
        setSkpd({ kode: ini.kode_skpd || '', nama: ini.nama })
        setSkpdId(sk)
        const desc = descendantsOf(semua, sk)

        // ── Calon penanda tangan ────────────────────────────────────────────
        // ⚠️ WAJIB `fetchCalonTtd`, bukan `admin_pegawai` ber-`.eq('skpd_id')`
        // (CLAUDE.md): dari 816 SKPD hanya 57 yang punya pegawai berjabatan
        // "Kepala", sementara 756 di antaranya sub-SKPD — query polos membuat
        // lembar UPTD/Bidang nyaris selalu tak menemukan siapa pun, dan kepala
        // yang MERANGKAP tak terbaca sama sekali.
        // Gagal memuatnya TIDAK menjatuhkan lembar: blok tanda tangan tinggal
        // bertitik-titik, dan itu memang keadaan sah di sini.
        const byId = new Map<number, SkpdNode>(
          semua.map(x => [x.id, { id: x.id, nama: x.nama, parent_id: x.parent_id }]))
        let daftar: CalonTtd[] = []
        try { daftar = await fetchCalonTtd(supabase, sk, byId) } catch { daftar = [] }
        setCalon(daftar)

        // URL menang atas simpanan; simpanan menang atas tebakan. Tebakannya
        // sendiri cuma SARAN — status Definitif/Plt tak ada di data mana pun.
        const simpan = bacaTtd(sk)
        const awal = calonTtdAwal(daftar)
        const dariUrl = q.get('ttd')
        const idTerpilih = dariUrl || simpan?.id || awal?.id || ''
        setTtdId(idTerpilih)
        setPlt(q.get('plt') === '1' ? true
          : simpan?.plt ?? (daftar.find(c => c.id === idTerpilih)?.pltDisarankan ?? false))
        setTglTtd(q.get('tgl') || simpan?.tgl || todayStr())

        // ── Baris transaksi ────────────────────────────────────────────────
        // Bentuk query-nya SAMA dgn components/LaporanPerolehan.tsx, jadi ia
        // ikut dilayani partial index `idx_trx_perolehan_id` (20260820_03).
        // Tanpa index itu, `ORDER BY id DESC LIMIT n` di atas filter `jenis`
        // yang tak bisa jadi index-cond akan menyusuri seluruh ledger.
        let qq = supabase.from('transaksi_bmd').select(SEL)
          .eq('jenis', jns).order('id', { ascending: false })
        // ⚠️ `periode` bisa bernilai TAHUN saja (mis. `2026` = Akhir Tahun,
        // dikirim menu Pelaporan sejak 2026-08-30). `.eq('periode','2026')` tak
        // cocok dengan apa pun & menghasilkan lembar KOSONG yang kelihatan sah.
        const perList = periodeDiminta(per)
        if (perList.length === 1) qq = qq.eq('periode', perList[0])
        else if (perList.length > 1) qq = qq.in('periode', perList)
        if (desc.length > 0) {
          const list = desc.join(',')
          qq = qq.or(`skpd_asal.in.(${list}),skpd_tujuan.in.(${list})`)
        }
        const { data: trx, error: trxErr } = await qq.limit(2000)
        if (trxErr) throw new Error(trxErr.message)
        const semuaBaris = ((trx as never as Baris[]) || []).filter(r => r.aset)

        // ── Buang yang dianulir — TERSCOPE ke aset yang benar-benar ditanya ──
        const voided = await fetchVoidedAsetIds(
          supabase, [], semuaBaris.map(r => r.aset_id).filter((x): x is string => !!x))
        // Urut per JENIS ASET (permintaan user 2026-08-20) — lembar ini dibaca
        // per golongan, jadi urutan id ledger (kebetulan urut entry) menyulitkan
        // penelaah. Kunci kedua `nama_barang` supaya "…RD 1..6" berderet, dan
        // ketiga `nibar` sbg PEMECAH SERI: tanpa urutan total, barang bernama
        // kembar bisa bertukar tempat tiap kali lembarnya dicetak ulang.
        const urut = semuaBaris
          .filter(r => !(r.aset_id && voided.has(r.aset_id)))
          .sort((a, b) =>
            (a.aset!.kode || '').localeCompare(b.aset!.kode || '')
            || (a.aset!.nama_barang || '').localeCompare(b.aset!.nama_barang || '', 'id', { numeric: true })
            || (a.aset!.nibar || '').localeCompare(b.aset!.nibar || ''))
        setRows(urut)
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ttd = calon.find(c => c.id === ttdId) || null

  /** Simpan supaya cetak ulang menghasilkan lembar yang SAMA — lembar ini
   *  ditandatangani lalu dipindai, jadi versi kedua yang berbeda bikin kacau. */
  function simpanTtd(next: Partial<TtdTersimpan>) {
    if (skpdId == null) return
    const v: TtdTersimpan = { id: ttdId, plt, tgl: tglTtd, ...next }
    try { localStorage.setItem(keyTtd(skpdId), JSON.stringify(v)) } catch { /* kuota penuh / mode privat — abaikan */ }
  }

  const info = JENIS_INFO[jenis] || JENIS_INFO.hibah_masuk
  const { judul: judulPeriode, tahun } = labelPeriode(periode)
  const total = rows.reduce((s, r) => s + (r.nilai || 0), 0)

  // Nama bawaan saat "Save as PDF" — satu-satunya cara menyetelnya dari halaman.
  // Karakter terlarang Windows dibuang: nama SKPD boleh memuat garis miring.
  useEffect(() => {
    if (!skpd) return
    const bersih = (t: string) => t.replace(/[\\/:*?"<>|]/g, '-').trim()
    document.title = `Laporan Penerimaan ${info.judul}_${bersih(skpd.nama)}_${tahun}`
  }, [skpd, info.judul, tahun])

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-[1400px] mx-auto mb-3 flex flex-wrap items-center justify-end gap-3 no-print px-4">
        {siap && !gagal && (
          <>
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
                  // Ganti orang → centang Plt ikut pindah. Kalau tidak, "Plt."
                  // menempel ke kepala definitif hanya karena pilihan
                  // sebelumnya orang yang merangkap.
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
            {/* Definitif/Plt DITANYAKAN, tak ditebak diam-diam: statusnya tidak
                ada di `admin_pegawai` maupun di mana pun, jadi tak ada sumber
                data yang bisa menjawabnya. `pltDisarankan` cuma menaruh centang
                awal di tempat yang paling sering benar. */}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Status:
              <select className="select-filter text-sm" value={plt ? 'plt' : 'definitif'}
                onChange={e => { const v = e.target.value === 'plt'; setPlt(v); simpanTtd({ plt: v }) }}>
                <option value="definitif">Definitif</option>
                <option value="plt">Plt.</option>
              </select>
            </label>
          </>
        )}
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <div className="max-w-[1400px] mx-auto bg-white p-6 shadow print:shadow-none print:p-0">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan lembar: {gagal}</p>
        ) : (
          <>
            <div className="text-center leading-tight mb-3">
              <p className="font-bold text-[13px]">
                LAPORAN PENERIMAAN BMD BERUPA ASET TETAP DENGAN CARA PEROLEHAN DARI {info.judul}
              </p>
              <p className="font-bold text-[13px]">INTRAKOMPTABEL DAN EKSTRAKOMPTABEL</p>
              <p className="font-bold text-[13px]">{skpd?.kode ? `${skpd.kode} - ` : ''}{skpd?.nama}</p>
              <p className="text-[13px]">{judulPeriode}</p>
              <p className="text-[13px]">TAHUN {tahun}</p>
            </div>

            <table className="text-[11px] mb-2">
              <tbody>
                <tr><td className="pr-6">Provinsi</td><td>: Provinsi {PROVINSI}</td></tr>
                <tr><td className="pr-6">Kabupaten / Kota</td><td>: Kabupaten {KABUPATEN}</td></tr>
              </tbody>
            </table>

            {/* `table-fixed` + lebar per kolom: tanpa itu kolom NIBAR (45 digit)
                melar mengikuti isinya lalu mendorong kolom lain keluar halaman —
                pelajaran yang sama dgn lembar cetak Rekonsiliasi. */}
            <table className="w-full table-fixed border-collapse text-[7.5px] leading-tight">
              {/* Lebar disetel manual & totalnya 100% — inilah yang bikin lembar
                  "fit to window": `table-fixed` membagi lebar menurut colgroup,
                  jadi tak ada kolom yang bisa melar mengikuti isinya lalu
                  mendorong yang lain keluar halaman. Yang DIPANGKAS (permintaan
                  user 2026-08-20) kolom ber-isi pendek & seragam — Jumlah/Satuan
                  (ditumpuk), Kondisi, Tahun Perolehan, Tanggal BAST — dan NIBAR
                  yang kini dipenggal 2 baris di batas segmen. Kelegaan hasilnya
                  dialihkan ke kolom yang isinya panjang: uraian, spesifikasi,
                  pihak, no. BAST, & keterangan. */}
              <colgroup>
                <col className="w-[10%]" />{/* Kode Barang / Uraian */}
                <col className="w-[10%]" />{/* Spesifikasi Nama Barang */}
                {/* ⚠️ 11,5% + font 6,5px: potongan pertama NIBAR 26 DIGIT wajib
                    muat SEBARIS. Versi 9%/7,5px membuatnya membungkus sendiri
                    lebih dulu, jadi `<br/>` di batas segmen menghasilkan TIGA
                    baris — persis yang hendak dihindari. Hitungannya: lebar
                    cetak A4 landscape ±1047px, 11,5% ≈ 120px, dikurangi padding
                    ±8px; 26 digit @6,5px ≈ 94px, sisa ±18px. */}
                <col className="w-[11.5%]" />{/* NIBAR — 26+19 digit, 2 baris */}
                <col className="w-[6%]" />{/* Spesifikasi Lainnya */}
                <col className="w-[3.5%]" />{/* Jumlah + Satuan, ditumpuk */}
                <col className="w-[7%]" />{/* Nilai Satuan */}
                <col className="w-[7%]" />{/* Total Nilai */}
                <col className="w-[3.5%]" />{/* Kondisi */}
                <col className="w-[7%]" />{/* Sumber Dana */}
                <col className="w-[9%]" />{/* Pihak */}
                <col className="w-[4.5%]" />{/* Tahun Perolehan */}
                <col className="w-[4.5%]" />{/* Tanggal BAST */}
                <col className="w-[8.5%]" />{/* Nomor BAST */}
                <col className="w-[8%]" />{/* Keterangan */}
              </colgroup>
              <thead>
                <tr className="text-center font-semibold">
                  {['Kode Barang / Uraian', 'Spesifikasi Nama Barang', 'NIBAR', 'Spesifikasi Lainnya',
                    'Jumlah Satuan', 'Nilai Satuan', 'Total Nilai', 'Kondisi', 'Sumber Dana', info.pihak,
                    'Tahun Perolehan', 'Tanggal BAST', 'Nomor BAST', 'Keterangan'].map(h => (
                    <th key={h} className="border border-black px-1 py-1 align-middle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="align-top">
                    {/* Kode & Uraian DITUMPUK — inilah yang menghemat satu kolom. */}
                    <td className="border border-black px-1 py-0.5 break-words">
                      <div>{r.aset!.kode}</div>
                      <div>{r.aset!.uraian_barang || ''}</div>
                    </td>
                    <td className="border border-black px-1 py-0.5 break-words">{r.aset!.nama_barang || ''}</td>
                    {/* Dipenggal di BATAS SEGMEN (26+19) supaya baris kedua
                        selalu mulai dari kode barangnya — lihat `pecahNibar`.
                        NIBAR warisan e-BMD yang susunannya beda tak bisa dinilai
                        → ditampilkan utuh dgn `break-all`, bukan ditebak. */}
                    <td className="border border-black px-1 py-0.5 break-all text-[6.5px] tracking-tight">
                      {(() => {
                        const pecah = pecahNibar(r.aset!.nibar)
                        return pecah
                          ? <>{pecah[0]}<br />{pecah[1]}</>
                          : (r.aset!.nibar || '')
                      })()}
                    </td>
                    <td className="border border-black px-1 py-0.5 break-words">{r.aset!.spesifikasi_lainnya || ''}</td>
                    {/* Ditumpuk, bukan "1 Unit" sebaris — satuan seperti
                        "Meter Persegi" memaksa kolomnya selebar teks terpanjang
                        padahal angkanya cuma 1 digit. */}
                    <td className="border border-black px-1 py-0.5 text-center">
                      <div>{r.aset!.jumlah ?? 1}</div>
                      <div>{r.aset!.satuan || ''}</div>
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(r.aset!.harga_satuan ?? r.nilai)}</td>
                    <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(r.nilai)}</td>
                    <td className="border border-black px-1 py-0.5 text-center break-words">{r.aset!.kondisi_barang || ''}</td>
                    <td className="border border-black px-1 py-0.5 break-words">{r.header?.payload?.sumber_dana || ''}</td>
                    <td className="border border-black px-1 py-0.5 break-words">{r.header?.payload?.pihak || ''}</td>
                    {/* Tahun Perolehan = tanggal barang DIBUAT (bisa jauh sebelum
                        BAST untuk barang bekas); Tanggal BAST = tanggal ia jadi
                        milik pemkab. Dua tanggal berbeda — jangan disamakan. */}
                    <td className="border border-black px-1 py-0.5 text-center">{tglID(r.aset!.tgl_perolehan)}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{tglID(r.tanggal)}</td>
                    <td className="border border-black px-1 py-0.5 break-words">{r.header?.no_sk || ''}</td>
                    {/* ⚠️ `aset.keterangan` — keterangan yang DIISI OPERATOR per
                        barang (field spesifikasi). `transaksi_bmd.keterangan`
                        milik baris ledgernya & untuk perolehan memang selalu
                        kosong, jadi versi awal lembar ini menampilkan kolom
                        Keterangan HAMPA padahal datanya ada. Ledger dipakai
                        sebagai cadangan saja. */}
                    <td className="border border-black px-1 py-0.5 break-words">
                      {r.aset!.keterangan || r.keterangan || ''}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={14} className="border border-black px-1 py-3 text-center">Tidak ada penerimaan pada periode ini.</td></tr>
                )}
                <tr className="font-semibold">
                  <td className="border border-black px-1 py-0.5">TOTAL</td>
                  <td className="border border-black px-1 py-0.5" colSpan={5} />
                  <td className="border border-black px-1 py-0.5 text-right">{formatRupiah(total)}</td>
                  <td className="border border-black px-1 py-0.5" colSpan={7} />
                </tr>
              </tbody>
            </table>

            {/* Penanda tangan DIPILIH operator, bukan ditebak diam-diam — dan
                yang belum dipilih DIBIARKAN bertitik-titik. Mengarang nama di
                dokumen yang akan ditandatangani jauh lebih berbahaya daripada
                titik-titik yang jelas belum diisi (aturan yang sama dgn lembar
                RKBMD & Standar Harga). Baris di bawah nama = NIP, BUKAN
                `jabatan` pegawainya: kalau jabatan, "Kepala <SKPD>" tercetak
                dua kali beruntun & begitu Plt. dipilih keduanya bertentangan. */}
            <div className="flex justify-end mt-10 text-[11px]">
              <div className="text-center w-72">
                <p>Kabupaten {KABUPATEN}, {tglPanjang(tglTtd)}</p>
                <p>{sebutanKepala(plt, skpd?.nama || '…………………………')}</p>
                <div className="h-16" />
                <p className="font-semibold underline">{ttd?.nama || '(...................................)'}</p>
                <p>NIP. {ttd?.nip || '...........................'}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
