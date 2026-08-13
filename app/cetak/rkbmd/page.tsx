'use client'
// Cetak "Usulan Rencana Kebutuhan Barang Milik Daerah" — kelima jenis.
// Standalone, A4 landscape. Dua mode:
//   ?id=<uuid rkbmd>                        → satu dokumen
//   ?tahun=2027&jenis=pengadaan[&versi=..]  → SE-KABUPATEN, satu lembar per
//                                             SKPD (page-break antar SKPD)
//
// PENGADAAN punya bentuk sendiri: kolom 2 memuat hierarki Program → Kegiatan →
// Sub Kegiatan sebagai baris judul menjorok, barang menyusul di bawahnya.
// EMPAT JENIS LAIN datar (tak berkartu) dan kolomnya menyesuaikan kebutuhan
// masing-masing, tapi keempatnya WAJIB memuat empat hal yang sama (keputusan
// user 2026-08-10): Kode Barang/Uraian Barang · Spesifikasi Nama Barang/NIBAR ·
// Tanggal Perolehan · Nilai Perolehan.
//
// Tanggal & nilai perolehan dibaca dari SNAPSHOT di `rkbmd_item`, bukan di-join
// dari `aset` — lembar yang dicetak ulang harus sama dengan yang dulu
// ditandatangani. Uraian Barang justru sebaliknya: di-lookup dari kodefikasi
// supaya ikut nomenklatur terkini (pola Daftar Barang & Penyusutan).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { RKBMD_JENIS, nilaiItemRkbmd, type RkbmdPaket } from '@/lib/rkbmd'

const KABUPATEN = 'Kediri'
const JENIS_LABEL: Record<string, string> = Object.fromEntries(RKBMD_JENIS.map(j => [j.key, j.label]))

type SkpdRow = { id: number; nama: string; parent_id: number | null; kode_skpd: string | null }

/** Calon penanda tangan lembar se-Kabupaten. Dipilih BEBAS dari daftar pegawai
 *  (keputusan user 2026-08-13), bukan ditebak dari kolom `jabatan` seperti
 *  lembar per-SKPD — di se-kabupaten yang menandatangani itu Pengelola Barang,
 *  dan per 2026-08-13 tak satu pun dari 136 baris `admin_pegawai` berjabatan
 *  "Sekretaris Daerah", jadi tebakan otomatis apa pun pasti meleset. */
type Pegawai = { id: string | number; nama: string; nip: string | null; jabatan: string | null; skpd_id: number | null }

/** Pilihan penanda tangan disimpan supaya cetak ulang menghasilkan lembar yang
 *  SAMA — kalau tidak, dokumen yang sudah diedarkan bisa dicetak ulang dengan
 *  nama lain tanpa ada yang sadar. Pola & alasannya sama dgn `bmd_tahun_kerja_
 *  pilihan` (lib/tahunKerja.ts): preferensi tampilan, bukan gerbang wewenang. */
const KEY_TTD = 'bmd_rkbmd_ttd_sekab'
/** Idem untuk lembar per-SKPD, tapi DIPISAH PER SKPD: satu operator bisa
 *  mencetak lembar beberapa sub-OPD, dan satu kunci bersama akan membuat
 *  pilihan SKPD terakhir bocor ke lembar SKPD berikutnya. */
const keyTtdSkpd = (skpdId: number) => `bmd_rkbmd_ttd_skpd_${skpdId}`

/** Definitif → "Kepala <SKPD>"; Plt → "Plt. Kepala <SKPD>" (keputusan user
 *  2026-08-13). Ditulis SEKALI di sini karena dipakai blok tanda tangan
 *  sekaligus pratinjau di pop-up — dua tempat yang wajib berbunyi sama persis,
 *  kalau tidak operator menyetujui satu kalimat lalu yang tercetak kalimat lain. */
function sebutanKepala(plt: boolean, namaSkpd: string): string {
  return `${plt ? 'Plt. ' : ''}Kepala ${namaSkpd}`
}

type TtdTersimpan = { id?: string; plt?: boolean }

/** Isi localStorage itu data dari luar program: bisa cacat karena versi lama,
 *  suntingan manual, atau berbagi kunci dgn tab lain. Gagal mengurainya cukup
 *  berarti "belum pernah memilih" — jangan sampai menjatuhkan halaman cetak. */
function bacaTtdTersimpan(skpdId: number): TtdTersimpan | null {
  try {
    const s = localStorage.getItem(keyTtdSkpd(skpdId))
    return s ? (JSON.parse(s) as TtdTersimpan) : null
  } catch {
    return null
  }
}

type Item = {
  id: string; rkbmd_id: string; paket_id: string | null; no_urut: number | null
  kode: string | null; nibar: string | null; nama_barang: string | null; satuan: string | null
  kode_rekening: string | null
  jumlah_kebutuhan: number | null; jumlah_eksisting: number | null
  harga_satuan: number | null; total_anggaran: number | null
  tgl_perolehan: string | null; nilai_perolehan: number | null
  kondisi: string | null; peruntukan: string | null; bentuk: string | null
  jangka_waktu: string | null; estimasi_hasil: number | null; alasan: string | null
  keterangan: string | null
}

type Dok = { id: string; skpd_id: number; tahun_anggaran: number; jenis: string; versi: string; status: string }

type Lembar = {
  dok: Dok
  skpd: SkpdRow | null
  /** Tebakan awal penanda tangan (pegawai SKPD itu yang jabatannya memuat
   *  "Kepala") — kini cuma PILIHAN AWAL di pop-up, bukan lagi keputusan akhir. */
  penanda: Pegawai | null
  pakets: RkbmdPaket[]
  items: Item[]
}

const tglID = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const HURUF = 'abcdefghijklmnopqrstuvwxyz'

// ── Kolom tambahan per jenis (di luar 4 kolom identitas barang yang wajib) ──
// `jumlahkan` menandai kolom mana yang dijumlahkan di baris JUMLAH. Tanpa
// penanda ini angka totalnya gampang jatuh di kolom yang salah (mis. di bawah
// Keterangan) — kekeliruan yang tak terlihat sampai lembarnya sudah dicetak.
type KolomEkstra = { judul: string; align?: 'right'; jumlahkan?: true; isi: (r: Item) => string }
const EKSTRA: Record<string, KolomEkstra[]> = {
  pemeliharaan: [
    { judul: 'Kondisi', isi: r => r.kondisi || '-' },
    { judul: 'Estimasi Biaya Pemeliharaan', align: 'right', jumlahkan: true, isi: r => formatRupiah(r.total_anggaran) },
  ],
  pemanfaatan: [
    { judul: 'Bentuk Pemanfaatan', isi: r => r.bentuk || '-' },
    { judul: 'Peruntukan', isi: r => r.peruntukan || '-' },
    { judul: 'Estimasi Hasil', align: 'right', jumlahkan: true, isi: r => formatRupiah(r.estimasi_hasil) },
    { judul: 'Jangka Waktu', isi: r => r.jangka_waktu || '-' },
  ],
  pemindahtanganan: [
    { judul: 'Bentuk Pemindahtanganan', isi: r => r.bentuk || '-' },
  ],
  penghapusan: [
    { judul: 'Sebab Penghapusan', isi: r => r.alasan || '-' },
  ],
}

/** Lima kolom identitas selalu di depan: No · Kode/Uraian · Spesifikasi/NIBAR ·
 *  Tgl Perolehan · Nilai Perolehan. */
const KOLOM_IDENTITAS = 5

/** Posisi (1-based) kolom yang memuat angka JUMLAH. Kalau tak ada kolom ekstra
 *  yang ditandai `jumlahkan`, yang dijumlahkan Nilai Perolehan (kolom ke-5). */
function posisiJumlah(ekstra: KolomEkstra[]): number {
  const i = ekstra.findIndex(k => k.jumlahkan)
  return i === -1 ? KOLOM_IDENTITAS : KOLOM_IDENTITAS + i + 1
}

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

export default function CetakRkbmdPage() {
  const supabase = createClient()
  const [lembar, setLembar] = useState<Lembar[]>([])
  const [uraianByKode, setUraianByKode] = useState<Map<string, string>>(new Map())
  // Terisi HANYA di mode se-kabupaten (`?tahun=&jenis=`). Kop lembar itu satu
  // untuk seluruh dokumen, jadi tahun/jenis/versinya diambil dari FILTER, bukan
  // dari dokumen pertama yang kebetulan lolos.
  const [sekab, setSekab] = useState<{ tahun: number; jenis: string; versi: string | null } | null>(null)
  const [judulLingkup, setJudulLingkup] = useState('')
  // Daftar pegawai + pilihan penanda tangan (mode se-kabupaten saja).
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [skpdNama, setSkpdNama] = useState<Map<number, string>>(new Map())
  const [ttdId, setTtdId] = useState('')
  // ── Mode per-SKPD: penanda tangan DITANYAKAN, tidak lagi ditebak diam-diam.
  // `plt` menentukan sebutannya: "Kepala X" vs "Plt. Kepala X" (permintaan user
  // 2026-08-13). Pilihannya wajib dibuat SEBELUM lembarnya dicetak, jadi
  // pop-upnya terbuka sendiri begitu halaman selesai memuat.
  const [pegawaiSkpd, setPegawaiSkpd] = useState<Pegawai[]>([])
  const [ttdSkpdId, setTtdSkpdId] = useState('')
  const [plt, setPlt] = useState(false)
  const [tanyaTtd, setTanyaTtd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search)
      const id = p.get('id')
      const tahun = p.get('tahun')
      const jenisQ = p.get('jenis')
      const versiQ = p.get('versi')
      if (!id && !(tahun && jenisQ)) {
        setErr('Alamat cetak belum lengkap. Pakai ?id=<dokumen> atau ?tahun=<TA>&jenis=<jenis>.')
        setLoading(false); return
      }

      let q = supabase.from('rkbmd').select('id,skpd_id,tahun_anggaran,jenis,versi,status')
      if (id) q = q.eq('id', id)
      else {
        q = q.eq('tahun_anggaran', Number(tahun)).eq('jenis', jenisQ!)
        if (versiQ) q = q.eq('versi', versiQ)
      }
      const { data: hs, error: eh } = await q
      if (eh) { setErr(`gagal membaca dokumen: ${eh.message}`); setLoading(false); return }
      const doks = (hs || []) as Dok[]
      if (doks.length === 0) {
        setErr(id ? 'Dokumen RKBMD tidak ditemukan (mungkin sudah dihapus).'
                  : `Tidak ada dokumen RKBMD ${JENIS_LABEL[jenisQ!] || jenisQ} TA ${tahun}.`)
        setLoading(false); return
      }

      const ids = doks.map(d => d.id)
      const [pk, it] = await Promise.all([
        supabase.from('rkbmd_paket').select('id,rkbmd_id,no_urut,program,kegiatan,sub_kegiatan,keterangan')
          .in('rkbmd_id', ids).order('no_urut'),
        supabase.from('rkbmd_item').select('*').in('rkbmd_id', ids).order('no_urut'),
      ])
      if (pk.error || it.error) {
        setErr(`gagal membaca isi dokumen: ${(pk.error || it.error)!.message}`); setLoading(false); return
      }
      const pakets = (pk.data || []) as RkbmdPaket[]
      const items = (it.data || []) as Item[]

      // Uraian baku dari kodefikasi.
      const kodes = [...new Set(items.map(r => r.kode).filter((k): k is string => !!k))]
      if (kodes.length > 0) {
        const peta = new Map<string, string>()
        for (let i = 0; i < kodes.length; i += 500) {
          const { data: kd } = await supabase.from('admin_kodefikasi_bmd')
            .select('kode,uraian').in('kode', kodes.slice(i, i + 500))
          for (const k of (kd || []) as { kode: string; uraian: string | null }[]) peta.set(k.kode, k.uraian || '')
        }
        setUraianByKode(peta)
      }

      // Seluruh SKPD (untuk nama, kode, & rantai induk).
      const rows: SkpdRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama,parent_id,kode_skpd').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as SkpdRow[]))
        if (data.length < 1000) break
      }
      const skpdById = new Map(rows.map(s => [s.id, s]))

      // Pegawai SKPD dokumen — dipakai dua-duanya: menebak KEPALA kantor sbg
      // pilihan awal, DAN mengisi daftar pilihan di pop-up penanda tangan.
      // Tebakannya lewat `jabatan` yang memuat kata "Kepala", sengaja bukan
      // menebak nilai `role_bmd`. Tebakan yang meleset kini tidak lagi berakhir
      // di blok titik-titik: operator tinggal memilih sendiri di pop-up.
      const skpdIds = [...new Set(doks.map(d => d.skpd_id))]
      const pegawaiBySkpd = new Map<number, Pegawai[]>()
      const penandaBySkpd = new Map<number, Pegawai>()
      for (let i = 0; i < skpdIds.length; i += 200) {
        const { data: pgw } = await supabase.from('admin_pegawai')
          .select('id,nama,nip,jabatan,skpd_id').in('skpd_id', skpdIds.slice(i, i + 200)).order('nama')
        for (const g of (pgw || []) as Pegawai[]) {
          if (g.skpd_id == null) continue
          const arr = pegawaiBySkpd.get(g.skpd_id) || []
          arr.push(g); pegawaiBySkpd.set(g.skpd_id, arr)
          if (!penandaBySkpd.has(g.skpd_id) && (g.jabatan || '').toLowerCase().includes('kepala')) {
            penandaBySkpd.set(g.skpd_id, g)
          }
        }
      }

      const out: Lembar[] = doks.map(d => ({
        dok: d,
        skpd: skpdById.get(d.skpd_id) || null,
        penanda: penandaBySkpd.get(d.skpd_id) || null,
        pakets: pakets.filter(x => x.rkbmd_id === d.id),
        items: items.filter(x => x.rkbmd_id === d.id),
      }))
      out.sort((a, b) => (a.skpd?.nama || '').localeCompare(b.skpd?.nama || ''))

      // Keterangan layar (tak ikut tercetak). Kalau `versi` tak disebut di URL,
      // dokumen Murni & Perubahan ikut TERGABUNG — menu Pelaporan sudah
      // mewajibkan versi tunggal, tapi URL yang diketik tangan bisa melewatinya,
      // dan kopnya sendiri tak punya cara memberi tahu.
      setJudulLingkup(id ? '' : `Se-Kabupaten ${KABUPATEN} — ${out.length} SKPD`
        + (versiQ ? ` · versi ${versiQ}` : ' · ⚠ Murni + Perubahan tergabung (versi tak disaring)'))

      // Daftar penanda tangan. Se-kabupaten menariknya SE-PEMDA (yang meneken
      // rekap itu Pengelola Barang, bisa dari SKPD mana pun) — 136 baris per
      // 2026-08-13, cukup sekali tarik tanpa paginasi. Per-SKPD cukup pegawai
      // SKPD dokumen itu, yang sudah ditarik di atas.
      if (!id) {
        setSekab({ tahun: Number(tahun), jenis: jenisQ!, versi: versiQ })
        // Tuple ditulis eksplisit: tanpa itu `.map()` menyimpulkan
        // `(string | number)[][]`, yang tak bisa dipakai membangun Map.
        setSkpdNama(new Map(rows.map(s => [s.id, s.nama] as [number, string])))
        const { data: pg } = await supabase.from('admin_pegawai')
          .select('id,nama,nip,jabatan,skpd_id').order('nama')
        setPegawai((pg || []) as Pegawai[])
        const tersimpan = p.get('ttd') || localStorage.getItem(KEY_TTD) || ''
        if (tersimpan) setTtdId(tersimpan)
      } else {
        // Per-SKPD: `?id=` selalu satu dokumen, jadi satu SKPD & satu pilihan.
        const l = out[0]
        const sid = l.dok.skpd_id
        setPegawaiSkpd(pegawaiBySkpd.get(sid) || [])
        // Urutan sumber pilihan awal: URL (dipaksa pemanggil) → pilihan yang
        // tersimpan untuk SKPD ini → tebakan "Kepala". Pop-upnya tetap terbuka
        // supaya operator melihat & mengiyakan apa yang akan tercetak.
        const tsimpan = bacaTtdTersimpan(sid)
        setTtdSkpdId(p.get('ttd') || tsimpan?.id || (l.penanda ? String(l.penanda.id) : ''))
        setPlt(p.get('plt') === '1' || p.get('plt') === 'true' || !!tsimpan?.plt)
        setTanyaTtd(true)
      }
      setLembar(out)
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 1cm; } body { background: white; } }`}</style>

      <div className="max-w-6xl mx-auto mb-3 flex flex-wrap items-center justify-between gap-3 no-print px-4">
        <span className="text-sm text-gray-500">{judulLingkup}</span>
        <div className="flex flex-wrap items-center gap-3">
          {/* Pemilih penanda tangan se-Kabupaten — TIDAK ikut tercetak. Di sini
              dropdown polos, bukan pop-up seperti lembar per-SKPD: rekap
              se-kabupaten dicetak Pengelola Barang yang penanda tangannya
              nyaris selalu orang yang sama, jadi menanyakannya tiap kali cuma
              menghalangi. Yang per-SKPD ditanya karena berpindah-pindah SKPD
              dan punya pilihan Definitif/Plt. */}
          {sekab && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Penanda tangan:
              <select
                className="select-filter text-sm max-w-xs"
                value={ttdId}
                onChange={e => {
                  setTtdId(e.target.value)
                  // Disimpan supaya cetak ulang menghasilkan lembar yang sama.
                  if (e.target.value) localStorage.setItem(KEY_TTD, e.target.value)
                  else localStorage.removeItem(KEY_TTD)
                }}
              >
                <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
                {pegawai.map(g => (
                  <option key={String(g.id)} value={String(g.id)}>
                    {g.nama}{g.jabatan ? ` — ${g.jabatan}` : ''}
                    {g.skpd_id != null && skpdNama.get(g.skpd_id) ? ` (${skpdNama.get(g.skpd_id)})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* Mode per-SKPD: ringkasan pilihan + jalan masuk membuka pop-upnya
              lagi. Tanpa ini, satu-satunya cara mengubah penanda tangan adalah
              memuat ulang halaman. */}
          {!sekab && !loading && !err && (
            <button onClick={() => setTanyaTtd(true)}
              className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200">
              ✍ Penanda tangan: {pegawaiSkpd.find(g => String(g.id) === ttdSkpdId)?.nama || 'belum dipilih'}
              {plt ? ' (Plt.)' : ''}
            </button>
          )}
          <button onClick={() => window.print()} className="btn-primary text-sm">🖨 Cetak / Simpan PDF</button>
        </div>
      </div>

      {tanyaTtd && lembar[0] && (
        <TtdModal
          namaSkpd={lembar[0].skpd?.nama || `SKPD #${lembar[0].dok.skpd_id}`}
          pegawai={pegawaiSkpd}
          nilai={{ id: ttdSkpdId, plt }}
          onBatal={() => setTanyaTtd(false)}
          onPilih={(v) => {
            setTtdSkpdId(v.id); setPlt(v.plt); setTanyaTtd(false)
            // Disimpan supaya cetak ulang menghasilkan lembar yang SAMA —
            // lembar ini ditandatangani lalu dipindai jadi lampiran pengajuan,
            // jadi cetakan kedua yang berbeda nama akan menyulitkan penelaah.
            const sid = lembar[0].dok.skpd_id
            if (v.id) localStorage.setItem(keyTtdSkpd(sid), JSON.stringify(v))
            else localStorage.removeItem(keyTtdSkpd(sid))
          }}
        />
      )}

      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="bg-white p-8 text-sm text-gray-400">Memuat…</div>
        ) : err ? (
          <div className="bg-white p-8 text-sm text-red-600">{err}</div>
        ) : sekab ? (
          // Se-kabupaten: SATU dokumen menerus, kop sekali di atas.
          <LembarSeKabupaten sekab={sekab} lembar={lembar} uraianByKode={uraianByKode}
            ttd={pegawai.find(g => String(g.id) === ttdId) || null} />
        ) : (
          // Per-SKPD (`?id=`): lembar lengkap ber-kop & ber-tanda tangan.
          // Sudah benar menurut user (2026-08-13) — JANGAN diubah ikut-ikutan
          // waktu menyetel lembar se-kabupaten.
          lembar.map(l => (
            <LembarUsulan key={l.dok.id} l={l} uraianByKode={uraianByKode}
              ttd={pegawaiSkpd.find(g => String(g.id) === ttdSkpdId) || null} plt={plt} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Pop-up penanda tangan lembar per-SKPD ───────────────────────────────────
// Muncul sendiri saat halaman cetak dibuka (permintaan user 2026-08-13). Dua
// hal yang ditanyakan, dan keduanya tak bisa disimpulkan sistem sendiri:
//   (1) SIAPA yang meneken — tebakan lewat kata "Kepala" di kolom `jabatan`
//       sering meleset, dan yang meleset dulu berakhir sbg blok titik-titik;
//   (2) DEFINITIF atau Plt. — status ini tidak ada di `admin_pegawai` sama
//       sekali, jadi tak ada sumber data mana pun yang bisa menjawabnya.
// Pratinjau sebutannya ditampilkan apa adanya supaya yang disetujui di layar
// persis yang tercetak di kertas.
function TtdModal({ namaSkpd, pegawai, nilai, onPilih, onBatal }: {
  namaSkpd: string
  pegawai: Pegawai[]
  nilai: { id: string; plt: boolean }
  onPilih: (v: { id: string; plt: boolean }) => void
  onBatal: () => void
}) {
  const [id, setId] = useState(nilai.id)
  const [plt, setPlt] = useState(nilai.plt)
  const dipilih = pegawai.find(g => String(g.id) === id) || null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Penanda tangan lembar usulan</h3>
          <p className="text-xs text-gray-500 mt-0.5">{namaSkpd}</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nama penanda tangan</label>
            <select className="select-filter w-full" value={id} onChange={e => setId(e.target.value)}>
              <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
              {pegawai.map(g => (
                <option key={String(g.id)} value={String(g.id)}>
                  {g.nama}{g.jabatan ? ` — ${g.jabatan}` : ''}
                </option>
              ))}
            </select>
            {pegawai.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Belum ada pegawai terdaftar di SKPD ini. Lembarnya tetap bisa dicetak — blok tanda
                tangan dibiarkan bertitik-titik untuk ditulis tangan.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Status jabatan</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={!plt} onChange={() => setPlt(false)} /> Definitif
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={plt} onChange={() => setPlt(true)} /> Plt.
              </label>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-center text-xs">
            <p className="text-gray-400 mb-1">Yang akan tercetak:</p>
            <p className="text-gray-700">{sebutanKepala(plt, namaSkpd)}</p>
            <div className="h-6" />
            <p className="font-semibold underline text-gray-800">{dipilih?.nama || '(………………………………)'}</p>
            <p className="text-gray-700">NIP. {dipilih?.nip || '………………………'}</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onBatal}>Batal</button>
          <button className="btn-primary text-sm" onClick={() => onPilih({ id, plt })}>Terapkan</button>
        </div>
      </div>
    </div>
  )
}

// ── Satu lembar = satu dokumen RKBMD satu SKPD ──────────────────────────────
function LembarUsulan({ l, uraianByKode, ttd, plt }: {
  l: Lembar; uraianByKode: Map<string, string>; ttd: Pegawai | null; plt: boolean
}) {
  const { dok, skpd, pakets, items } = l
  const pengadaan = dok.jenis === 'pengadaan'
  const ekstra = EKSTRA[dok.jenis] || []
  // Rumus "total nilai" per jenis dipakai bersama menu Pelaporan — satu sumber
  // di lib/rkbmd.ts, jangan disalin ke sini.
  const total = items.reduce((s, r) => s + nilaiItemRkbmd(dok.jenis, r), 0)
  const pohon = pengadaan ? susunPohon(pakets, items) : []

  // Lebar tabel: 5 kolom identitas + kolom per jenis + Keterangan.
  const nKolom = pengadaan ? 12 : KOLOM_IDENTITAS + ekstra.length + 1

  return (
    <div className="bg-white p-8 shadow print:shadow-none print:p-0 mb-6 print:mb-0 print:break-after-page text-[10px] text-gray-900">
      <style>{`.brd{border:1px solid #6b7280}`}</style>

      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[12px]">Pemerintah Kabupaten {KABUPATEN}</p>
        <p className="font-bold uppercase text-[12px]">
          Usulan Rencana Kebutuhan {dok.versi === 'perubahan' ? 'Perubahan ' : ''}
          {JENIS_LABEL[dok.jenis] || dok.jenis} Barang Milik Daerah
        </p>
        <p className="font-bold uppercase text-[11px]">{skpd?.nama || `SKPD #${dok.skpd_id}`}</p>
        <p className="font-bold uppercase text-[11px]">Tahun {dok.tahun_anggaran}</p>
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

      {pengadaan ? (
        <TabelPengadaan pohon={pohon} total={total} uraianByKode={uraianByKode} />
      ) : (
        <TabelAset items={items} ekstra={ekstra} total={total} uraianByKode={uraianByKode} nKolom={nKolom} />
      )}

      <div className="mt-8 flex justify-end pr-16">
        <div className="text-center">
          <p>{KABUPATEN}, {tglID()}</p>
          <p>{sebutanKepala(plt, skpd?.nama || '…………………………')}</p>
          <div className="h-16" />
          <p className="font-semibold underline">{ttd?.nama || '(………………………………)'}</p>
          {/* Dulu baris ini mencetak `jabatan` pegawainya — yang berarti
              "Kepala <SKPD>" tercetak DUA KALI beruntun, dan begitu Plt.
              dipilih kedua baris itu justru saling bertentangan. Diganti NIP,
              sama dengan blok tanda tangan lembar se-Kabupaten. */}
          <p>NIP. {ttd?.nip || '………………………'}</p>
        </div>
      </div>
    </div>
  )
}

// ── Kepala tabel & baris JUMLAH — dipakai BERSAMA oleh lembar per-SKPD dan
// lembar se-Kabupaten. Sengaja dipisah dari tabelnya: dua mode itu harus punya
// susunan kolom yang SAMA PERSIS, dan menyalinnya akan jadi utang "ubah satu,
// samakan yang lain" yang di repo ini sudah berkali-kali dilanggar.
const JUDUL_PENGADAAN = ['Kode rekening', 'Kode barang', 'Uraian Barang', 'Spesifikasi Nama Barang',
  'Jumlah', 'Satuan', 'Harga Satuan', 'Nilai total']

/** Kolom (1-based) tempat angka JUMLAH jatuh di lembar Pengadaan = "Nilai total". */
const KOLOM_JUMLAH_PENGADAAN = 10

function TheadPengadaan() {
  return (
    <thead>
      <tr className="text-center">
        <th className="brd px-1 py-1 font-semibold" rowSpan={2}>No.</th>
        <th className="brd px-1 py-1 font-semibold" rowSpan={2}>Program / Kegiatan / Sub Kegiatan</th>
        <th className="brd px-1 py-1 font-semibold" colSpan={8}>Usulan BMD</th>
        <th className="brd px-1 py-1 font-semibold" rowSpan={2}>Jumlah barang<br />pada neraca</th>
        <th className="brd px-1 py-1 font-semibold" rowSpan={2}>Keterangan</th>
      </tr>
      <tr className="text-center">
        {JUDUL_PENGADAAN.map(h => <th key={h} className="brd px-1 py-1 font-semibold">{h}</th>)}
      </tr>
      <tr className="text-center text-[9px]">
        {Array.from({ length: 12 }, (_, i) => <td key={i} className="brd px-1">{i + 1}</td>)}
      </tr>
    </thead>
  )
}

/** Satu baris JUMLAH yang angkanya jatuh di kolom `kolomJumlah`. Posisinya
 *  dihitung, tidak ditulis tangan — angka total yang meleset satu kolom baru
 *  ketahuan setelah lembarnya dicetak & ditandatangani. */
function BarisJumlah({ label, total, nKolom, kolomJumlah }: {
  label: string; total: number; nKolom: number; kolomJumlah: number
}) {
  return (
    <tr className="font-semibold">
      <td className="brd px-1 py-1 text-right" colSpan={kolomJumlah - 1}>{label}</td>
      <td className="brd px-1 py-1 text-right">{formatRupiah(total)}</td>
      {nKolom > kolomJumlah && <td className="brd px-1 py-1" colSpan={nKolom - kolomJumlah} />}
    </tr>
  )
}

// ── Tabel Pengadaan (berkartu, 12 kolom) ────────────────────────────────────
function TabelPengadaan({ pohon, total, uraianByKode }: {
  pohon: Prog[]; total: number; uraianByKode: Map<string, string>
}) {
  return (
    <table className="border-collapse w-full">
      <TheadPengadaan />
      <tbody>
        {pohon.length === 0 ? (
          <tr><td className="brd px-1 py-4 text-center text-gray-400" colSpan={12}>
            Dokumen ini belum berisi kartu program/kegiatan.
          </td></tr>
        ) : pohon.map((prog, pi) => (
          <BlokProgram key={prog.nama} prog={prog} pi={pi} uraianByKode={uraianByKode} />
        ))}
      </tbody>
      <tfoot>
        <BarisJumlah label="JUMLAH" total={total} nKolom={12} kolomJumlah={KOLOM_JUMLAH_PENGADAAN} />
      </tfoot>
    </table>
  )
}

function BlokProgram({ prog, pi, uraianByKode }: { prog: Prog; pi: number; uraianByKode: Map<string, string> }) {
  return (
    <>
      <tr>
        <td className="brd px-1 py-0.5 align-top text-center">{pi + 1}.</td>
        <td className="brd px-1 py-0.5 align-top font-medium">{prog.nama}</td>
        {Array.from({ length: 10 }, (_, i) => <td key={i} className="brd px-1 py-0.5" />)}
      </tr>
      {prog.kegs.map((keg, ki) => (
        <BlokKegiatan key={keg.nama} keg={keg} ki={ki} uraianByKode={uraianByKode} />
      ))}
    </>
  )
}

function BlokKegiatan({ keg, ki, uraianByKode }: { keg: Keg; ki: number; uraianByKode: Map<string, string> }) {
  return (
    <>
      <tr>
        <td className="brd px-1 py-0.5" />
        <td className="brd px-1 py-0.5 align-top pl-4">{ki + 1}. {keg.nama}</td>
        {Array.from({ length: 10 }, (_, i) => <td key={i} className="brd px-1 py-0.5" />)}
      </tr>
      {keg.subs.map((sub, si) => <BlokSub key={sub.paket.id} sub={sub} si={si} uraianByKode={uraianByKode} />)}
    </>
  )
}

function BlokSub({ sub, si, uraianByKode }: { sub: Sub; si: number; uraianByKode: Map<string, string> }) {
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
          <td className="brd px-1 py-0.5" /><td className="brd px-1 py-0.5" />
          <td className="brd px-1 py-2 text-center text-gray-400" colSpan={10}>Belum ada usulan barang.</td>
        </tr>
      ) : sub.isi.map(r => (
        <tr key={r.id}>
          {/* Kolom "No." SENGAJA kosong di baris barang (permintaan user
              2026-08-13): yang dinomori cukup PROGRAM-nya. Nomor per barang
              menumpuk dua sistem penomoran di satu kolom yang sama ("1."
              program vs "1" barang), dan lembar ini ditelusuri per program. */}
          <td className="brd px-1 py-0.5" />
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

// ── Tabel empat jenis berbasis aset (datar) ─────────────────────────────────
// Kolom identitas barang WAJIB & seragam: Kode Barang/Uraian · Spesifikasi Nama
// Barang/NIBAR · Tgl Perolehan · Nilai Perolehan. Sisanya per jenis (EKSTRA).
function TheadAset({ ekstra, nKolom }: { ekstra: KolomEkstra[]; nKolom: number }) {
  return (
    <thead>
      <tr className="text-center">
        <th className="brd px-1 py-1 font-semibold">No.</th>
        <th className="brd px-1 py-1 font-semibold">Kode Barang /<br />Uraian Barang</th>
        <th className="brd px-1 py-1 font-semibold">Spesifikasi Nama Barang /<br />NIBAR</th>
        <th className="brd px-1 py-1 font-semibold">Tanggal<br />Perolehan</th>
        <th className="brd px-1 py-1 font-semibold">Nilai Perolehan</th>
        {ekstra.map(k => <th key={k.judul} className="brd px-1 py-1 font-semibold">{k.judul}</th>)}
        <th className="brd px-1 py-1 font-semibold">Keterangan</th>
      </tr>
      <tr className="text-center text-[9px]">
        {Array.from({ length: nKolom }, (_, i) => <td key={i} className="brd px-1">{i + 1}</td>)}
      </tr>
    </thead>
  )
}

// Empat jenis non-pengadaan TIDAK ikut pencabutan nomor (permintaan user
// 2026-08-13 menyebut "per barangnya" pada lembar Pengadaan, yang di sana
// nomornya bertumpuk dengan nomor program). Di sini tak ada program sama
// sekali, jadi mencabutnya cuma menyisakan kolom "No." yang kosong melompong.
function BarisAset({ r, no, ekstra, uraianByKode }: {
  r: Item; no: number; ekstra: KolomEkstra[]; uraianByKode: Map<string, string>
}) {
  return (
    <tr>
      <td className="brd px-1 py-0.5 text-center align-top">{no}</td>
      <td className="brd px-1 py-0.5 align-top">
        <div>{r.kode || '-'}</div>
        <div className="text-gray-600">{(r.kode && uraianByKode.get(r.kode)) || '-'}</div>
      </td>
      <td className="brd px-1 py-0.5 align-top">
        <div>{r.nama_barang || '-'}</div>
        <div className="text-gray-600 break-all">{r.nibar || '-'}</div>
      </td>
      <td className="brd px-1 py-0.5 align-top text-center whitespace-nowrap">{r.tgl_perolehan || '-'}</td>
      <td className="brd px-1 py-0.5 align-top text-right">{formatRupiah(r.nilai_perolehan)}</td>
      {ekstra.map(k => (
        <td key={k.judul} className={`brd px-1 py-0.5 align-top ${k.align === 'right' ? 'text-right' : ''}`}>
          {k.isi(r)}
        </td>
      ))}
      <td className="brd px-1 py-0.5 align-top">{r.keterangan || ''}</td>
    </tr>
  )
}

function TabelAset({ items, ekstra, total, uraianByKode, nKolom }: {
  items: Item[]; ekstra: KolomEkstra[]; total: number
  uraianByKode: Map<string, string>; nKolom: number
}) {
  return (
    <table className="border-collapse w-full">
      <TheadAset ekstra={ekstra} nKolom={nKolom} />
      <tbody>
        {items.length === 0 ? (
          <tr><td className="brd px-1 py-4 text-center text-gray-400" colSpan={nKolom}>
            Dokumen ini belum berisi usulan barang.
          </td></tr>
        ) : items.map((r, i) => (
          <BarisAset key={r.id} r={r} no={r.no_urut ?? i + 1} ekstra={ekstra} uraianByKode={uraianByKode} />
        ))}
      </tbody>
      <tfoot>
        <BarisJumlah label="JUMLAH" total={total} nKolom={nKolom} kolomJumlah={posisiJumlah(ekstra)} />
      </tfoot>
    </table>
  )
}

// ── Lembar SE-KABUPATEN ─────────────────────────────────────────────────────
// Bentuknya DIUBAH 2026-08-13 (permintaan user): dulu satu lembar utuh per SKPD
// — kop tiga baris, blok Kode/Nama SKPD, tabel, blok tanda tangan — lalu
// page-break, berulang 60+ kali. Sekarang SATU dokumen menerus: kop sekali di
// atas, lalu satu tabel panjang yang tiap SKPD-nya dibuka baris judul selebar
// tabel dan ditutup baris subtotalnya sendiri.
//
// TANDA TANGAN: SATU blok di AKHIR dokumen, bukan per SKPD (keputusan user
// 2026-08-13). Yang menandatangani rekap se-kabupaten itu Pengelola Barang,
// bukan 60+ kepala SKPD — dan lembar per-SKPD yang mereka tandatangani sudah
// ada sendiri (`?id=<uuid>`). Penanda tangannya DIPILIH dari daftar pegawai,
// tidak ditebak dari kolom `jabatan` seperti lembar per-SKPD: per 2026-08-13
// tak satu pun dari 136 baris `admin_pegawai` berjabatan "Sekretaris Daerah",
// jadi tebakan otomatis apa pun pasti meleset. Belum dipilih → dibiarkan
// bertitik-titik untuk ditulis tangan; JANGAN diisi nama lain.
function LembarSeKabupaten({ sekab, lembar, uraianByKode, ttd }: {
  sekab: { tahun: number; jenis: string; versi: string | null }
  lembar: Lembar[]
  uraianByKode: Map<string, string>
  ttd: Pegawai | null
}) {
  const pengadaan = sekab.jenis === 'pengadaan'
  const ekstra = EKSTRA[sekab.jenis] || []
  const nKolom = pengadaan ? 12 : KOLOM_IDENTITAS + ekstra.length + 1
  const kolomJumlah = pengadaan ? KOLOM_JUMLAH_PENGADAAN : posisiJumlah(ekstra)
  const total = lembar.reduce(
    (s, l) => s + l.items.reduce((a, r) => a + nilaiItemRkbmd(sekab.jenis, r), 0), 0)

  return (
    <div className="bg-white p-8 shadow print:shadow-none print:p-0 text-[10px] text-gray-900">
      <style>{`.brd{border:1px solid #6b7280}`}</style>

      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[12px]">Pemerintah Kabupaten {KABUPATEN}</p>
        <p className="font-bold uppercase text-[12px]">
          Usulan Rencana Kebutuhan {sekab.versi === 'perubahan' ? 'Perubahan ' : ''}
          {JENIS_LABEL[sekab.jenis] || sekab.jenis} Barang Milik Daerah
        </p>
        <p className="font-bold uppercase text-[12px]">Tahun {sekab.tahun}</p>
      </div>

      <table className="border-collapse w-full">
        {pengadaan ? <TheadPengadaan /> : <TheadAset ekstra={ekstra} nKolom={nKolom} />}
        <tbody>
          {lembar.length === 0 ? (
            <tr><td className="brd px-1 py-4 text-center text-gray-400" colSpan={nKolom}>
              Belum ada dokumen RKBMD yang cocok.
            </td></tr>
          ) : lembar.map(l => (
            <BlokSkpd key={l.dok.id} l={l} jenis={sekab.jenis} pengadaan={pengadaan}
              ekstra={ekstra} nKolom={nKolom} kolomJumlah={kolomJumlah} uraianByKode={uraianByKode} />
          ))}
        </tbody>
        <tfoot>
          <BarisJumlah label={`JUMLAH SE-KABUPATEN ${KABUPATEN.toUpperCase()}`}
            total={total} nKolom={nKolom} kolomJumlah={kolomJumlah} />
        </tfoot>
      </table>

      <div className="mt-8 flex justify-end pr-16">
        <div className="text-center">
          <p>{KABUPATEN}, {tglID()}</p>
          <p>{ttd?.jabatan || '…………………………'}</p>
          <div className="h-16" />
          <p className="font-semibold underline">{ttd?.nama || '(………………………………)'}</p>
          <p>NIP. {ttd?.nip || '………………………'}</p>
        </div>
      </div>
    </div>
  )
}

/** Satu SKPD di dalam lembar se-kabupaten: baris judul selebar tabel, isinya,
 *  lalu subtotal SKPD itu. Penomoran program dimulai lagi dari 1 di tiap SKPD —
 *  memang begitu bacanya, tiap SKPD menyusun programnya sendiri. */
function BlokSkpd({ l, jenis, pengadaan, ekstra, nKolom, kolomJumlah, uraianByKode }: {
  l: Lembar; jenis: string; pengadaan: boolean; ekstra: KolomEkstra[]
  nKolom: number; kolomJumlah: number; uraianByKode: Map<string, string>
}) {
  const subtotal = l.items.reduce((s, r) => s + nilaiItemRkbmd(jenis, r), 0)
  const pohon = pengadaan ? susunPohon(l.pakets, l.items) : []
  const nama = l.skpd?.nama || `SKPD #${l.dok.skpd_id}`
  return (
    <>
      {/* Tanpa warna latar: `bg-*` gampang tak ikut tercetak (browser membuang
          latar belakang kecuali "background graphics" dinyalakan), jadi
          pembedanya huruf tebal + kapital yang pasti terbawa ke kertas. */}
      <tr>
        <td className="brd px-1 py-1 font-bold uppercase" colSpan={nKolom}>
          {l.skpd?.kode_skpd ? `${l.skpd.kode_skpd} — ` : ''}{nama}
        </td>
      </tr>

      {pengadaan ? (
        pohon.length === 0 ? (
          <tr><td className="brd px-1 py-2 text-center text-gray-400" colSpan={nKolom}>
            Belum berisi kartu program/kegiatan.
          </td></tr>
        ) : pohon.map((prog, pi) => (
          <BlokProgram key={prog.nama} prog={prog} pi={pi} uraianByKode={uraianByKode} />
        ))
      ) : (
        l.items.length === 0 ? (
          <tr><td className="brd px-1 py-2 text-center text-gray-400" colSpan={nKolom}>
            Belum berisi usulan barang.
          </td></tr>
        ) : l.items.map((r, i) => (
          <BarisAset key={r.id} r={r} no={r.no_urut ?? i + 1} ekstra={ekstra} uraianByKode={uraianByKode} />
        ))
      )}

      <BarisJumlah label={`Jumlah ${nama}`} total={subtotal} nKolom={nKolom} kolomJumlah={kolomJumlah} />
    </>
  )
}
