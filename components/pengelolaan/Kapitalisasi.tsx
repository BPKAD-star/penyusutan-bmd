'use client'
// No.10: Kapitalisasi / penambahan masa manfaat (§6) — alur jurnal ala SIMBADA.
//   1. Pilih SKPD → list transaksi (ikon mata = rincian, sampah = batal).
//   2. Tambah: No Dokumen, Tanggal Dokumen, Keterangan.
//   3. Popup pilih INDUK (filter jenis + cari; kolom tgl perolehan).
//   4. Popup pilih ANAK (boleh > 1). ATURAN: anak harus 1 rumpun jenis dgn induk
//      & tanggal perolehan anak TIDAK boleh lebih awal dari induk.
//   5. Preview rinci (BPK-friendly) lalu Simpan → kapitalisasi di induk + anak
//      diserap ('kapitalisasi_serap'). Batal → 'batal_kapitalisasi' (kembali semula).
// Perhitungan final tetap di engine (overhaul_band); snapshot disimpan di payload.
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { catatTransaksi } from '@/lib/transaksi'
import { formatRupiah } from '@/lib/export'
import { periodeDariTanggal, GOLONGAN_DAFTAR_BARANG, kodeLevel3, parsePeriode, previousPeriode, formatPeriode } from '@/lib/bmd'
import { cariBand, type BandOverhaul } from '@/lib/engine/penyusutan'
import { KapitalisasiRincian, KapitalisasiDetailModal, type KapSnapshot, type KapAnak, type KapItem } from '@/components/KapitalisasiDetail'
import FormShell from './FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import { useDateBounds } from '@/components/useTahunBuku'
import { backdropClose } from '@/components/backdropClose'
import { useKonfirmasi } from '@/shared/ui/konfirmasi'
import { cekBolehBatal, cekBolehSisip } from '@/lib/guardPembatalan'

// `intra_ekstra` IKUT dibaca (2026-08-27) — dipakai `anakInvalid` menegakkan
// syarat "anak & induk harus sekomptabel"; lihat alasannya di sana.
type Barang = { id: string; nibar: string | null; kode: string; nama_barang: string | null; nilai_perolehan: number; skpd_id: number | null; tgl_perolehan: string | null; intra_ekstra: string | null }
const BARANG_COLS = 'id,nibar,kode,nama_barang,nilai_perolehan,skpd_id,tgl_perolehan,intra_ekstra'
const kompLabel = (v: string | null) => (v === 'ekstra' ? 'Ekstrakomptabel' : 'Intrakomptabel')
type IndukFig = { npLama: number; nbLama: number; akumLama: number; bebanLama: number; sisaLamaSmt: number; masaMaks: number | null }
type Jurnal = {
  id: number; aset_id: string; no_dokumen: string; tanggal: string; keterangan: string | null; nilai: number
  induk: { nibar: string | null; nama_barang: string | null; kode: string } | null
  anak: KapAnak[]; snapshot: KapSnapshot | null
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Pembatalan satu transaksi kapitalisasi — SATU sumber, dipakai tombol
 * 🗑 Batal DAN ✎ Ubah.
 *
 * ⚠️ Diekstrak saat Ubah dibuat (2026-08-27). Ini aturan integritas (guard
 * rantai + pemulihan nilai perolehan + menghidupkan tiap anak), jadi dua
 * salinannya akan menyimpang cepat atau lambat — CODING-STANDARD §1.2
 * mewajibkan ekstraksi sejak kemunculan KEDUA untuk yang seperti ini.
 *
 * Reversal DICATAT DI TANGGAL TRANSAKSI ASLI, bukan hari ini: kalau pakai hari
 * ini, batalnya bisa jatuh di semester berbeda dari kapitalisasinya sehingga di
 * periode asli barang anak tetap terlihat "terserap".
 *
 * ⚠️ TIDAK transaksional — `catatTransaksi` menulis satu baris per panggilan.
 * Urutannya sengaja: guard → induk → tiap anak. Gagal di tengah dilaporkan apa
 * adanya; pemanggil WAJIB memuat ulang daftar supaya layar tak memamerkan
 * keadaan yang sudah tidak benar.
 */
async function batalkanKapitalisasi(
  supabase: ReturnType<typeof createClient>, j: Jurnal, skpdFallback: number,
): Promise<{ error?: string }> {
  // Guard rantai: induk tak boleh punya transaksi LEBIH BARU setelah kapitalisasi
  // ini (mis. reklas/kapitalisasi lagi di atasnya) — batalkan yang lebih baru
  // dulu, kalau tidak replay engine rusak. (Anak yg terserap sudah tersembunyi
  // dari semua menu sehingga tak mungkin menerima transaksi baru → cukup jaga
  // induk.)
  const guard = await cekBolehBatal(
    supabase,
    [{ aset_id: j.aset_id, trx_id: j.id, label: j.induk?.nama_barang || j.induk?.nibar }],
    'kapitalisasi ini',
  )
  if (!guard.boleh) return { error: guard.pesan }
  // Nilai perolehan induk dikembalikan: nilai SEKARANG − rehab transaksi ini.
  const { data: a } = await supabase.from('aset').select('nilai_perolehan,skpd_id').eq('id', j.aset_id).single()
  const npRestore = (a?.nilai_perolehan ?? 0) - j.nilai
  const { error } = await catatTransaksi(supabase, {
    asetId: j.aset_id, jenis: 'batal_kapitalisasi', tanggal: j.tanggal, nilai: j.nilai,
    skpdAsal: a?.skpd_id ?? skpdFallback,
    payload: { target_trx_id: j.id, nilai_perolehan_baru: npRestore, no_dokumen: j.no_dokumen },
    keterangan: `Pembatalan kapitalisasi ${j.no_dokumen}`,
  })
  if (error) return { error }
  for (const a2 of j.anak) {
    const { error: e2 } = await catatTransaksi(supabase, {
      asetId: a2.id, jenis: 'batal_kapitalisasi', tanggal: j.tanggal, nilai: a2.nilai, skpdAsal: skpdFallback,
      payload: { induk_id: j.aset_id, no_dokumen: j.no_dokumen }, keterangan: `Batal serap dari ${j.no_dokumen}`,
    })
    if (e2) return { error: `Sebagian batal gagal: ${e2}` }
  }
  return {}
}

/**
 * Pratinjau angka induk sesudah kapitalisasi.
 *
 * ⚠️ `akumSerap` = Σ akumulasi penyusutan barang ANAK (keputusan user
 * 2026-08-27). Anak yang sudah berdiri sendiri & sudah tersusut membawa serta
 * akumulasinya ke induk — kalau tidak, akumulasi itu lenyap bersama anaknya
 * lewat `kapitalisasi_serap` dan nilai buku kelompok melonjak persis sebesar
 * itu, tanpa satu pun pesan error. Untuk anak yang belum pernah disusutkan
 * (KDP hasil reklas) nilainya 0 → hasilnya identik dengan perilaku lama.
 *
 * `nb_baru` sengaja tetap diturunkan dari `nbLama + rehab − akumSerap` (bukan
 * `npBaru − akumBaru`) supaya rumusnya persis sama seperti sebelumnya saat
 * `akumSerap` nol — pratinjau lama tak bergeser sedikit pun.
 */
function computeSnapshot(
  fig: IndukFig, kode: string, rehab: number, bands: BandOverhaul[], akumSerap = 0, periodeKap = '',
): KapSnapshot {
  const persen = fig.npLama > 0 ? (rehab / fig.npLama) * 100 : 0
  const band = rehab > 0 ? cariBand(bands, kode, persen) : null
  const tambahan = band?.tambahan_tahun ?? 0
  const sisaTahunLama = fig.sisaLamaSmt / 2
  const masaBaruTahun = fig.masaMaks != null ? Math.min(sisaTahunLama + tambahan, fig.masaMaks) : sisaTahunLama + tambahan
  const sisaBaruSmt = Math.max(1, Math.round(masaBaruTahun * 2))
  const npBaru = fig.npLama + rehab
  const nbBaru = Math.max(0, fig.nbLama + rehab - akumSerap)
  const bebanBaru = sisaBaruSmt > 0 ? Math.round(nbBaru / sisaBaruSmt) : 0
  return {
    np_lama: fig.npLama, beban_lama: fig.bebanLama, akum_lama: fig.akumLama, nb_lama: fig.nbLama,
    sisa_lama_smt: fig.sisaLamaSmt, masa_maks_tahun: fig.masaMaks,
    rehab, persen, tambahan_tahun: tambahan, masa_baru_tahun: masaBaruTahun, sisa_baru_smt: sisaBaruSmt,
    np_baru: npBaru, nb_baru: nbBaru, beban_baru: bebanBaru,
    akum_diserap: akumSerap, akum_baru: fig.akumLama + akumSerap,
    periode_kap: periodeKap || undefined,
    periode_dasar: periodeKap ? formatPeriode(previousPeriode(parsePeriode(periodeKap))) : undefined,
  }
}

export default function Kapitalisasi() {
  const supabase = createClient()
  const konfirmasi = useKonfirmasi()
  const [skpdList, setSkpdList] = useState<{ id: number; nama: string }[]>([])
  const [golonganLabels, setGolonganLabels] = useState<Record<string, string>>({})
  const [bands, setBands] = useState<BandOverhaul[]>([])
  const [skpd, setSkpd] = useState('')
  const [jurnals, setJurnals] = useState<Jurnal[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [mode, setMode] = useState<'list' | 'tambah'>('list')
  const [detail, setDetail] = useState<KapItem[] | null>(null)
  // Transaksi yang sedang diubah — sudah DIBATALKAN saat ✎ ditekan; nilainya
  // cuma dipakai mengisi ulang form (termasuk `snapshot` lamanya sbg posisi
  // induk SEBELUM kapitalisasi). null = membuat transaksi baru.
  const [ubah, setUbah] = useState<Jurnal | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const rows: { id: number; nama: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      setSkpdList(rows)
    })()
    supabase.from('admin_overhaul_band').select('kode_prefix,band_no,pct_min,pct_max,tambahan_tahun').then(({ data }) => setBands((data as BandOverhaul[]) || []))
    ;(async () => {
      const { data: jenis } = await supabase.from('admin_jenis_aset').select('id,nama')
      const namaById = new Map((jenis || []).map(j => [j.id, j.nama]))
      const labels: Record<string, string> = {}
      await Promise.all(GOLONGAN_DAFTAR_BARANG.map(async prefix => {
        const { data } = await supabase.from('admin_kodefikasi_bmd').select('jenis_aset_id').eq('kode_jenis', prefix).not('jenis_aset_id', 'is', null).limit(1)
        const id = data?.[0]?.jenis_aset_id
        labels[prefix] = (id != null && namaById.get(id)) || prefix
      }))
      setGolonganLabels(labels)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadList = useCallback(async (skpdId: string) => {
    if (!skpdId) { setJurnals([]); return }
    setLoadingList(true)
    const [{ data: kap }, { data: batal }] = await Promise.all([
      supabase.from('transaksi_bmd')
        .select('id,aset_id,tanggal,keterangan,nilai,payload,aset:aset_id(nibar,nama_barang,kode)')
        .eq('jenis', 'kapitalisasi').eq('skpd_asal', Number(skpdId)).order('id', { ascending: true }),
      supabase.from('transaksi_bmd').select('payload').eq('jenis', 'batal_kapitalisasi').eq('skpd_asal', Number(skpdId)),
    ])
    const cancelled = new Set<number>()
    for (const b of (batal || []) as { payload: { target_trx_id?: number } }[]) {
      const t = Number(b.payload?.target_trx_id); if (Number.isFinite(t)) cancelled.add(t)
    }
    const rows = (kap || []) as unknown as {
      id: number; aset_id: string; tanggal: string; keterangan: string | null; nilai: number
      payload: { no_dokumen?: string; anak?: KapAnak[]; snapshot?: KapSnapshot }; aset: Jurnal['induk']
    }[]
    setJurnals(rows.filter(r => !cancelled.has(r.id)).map(r => ({
      id: r.id, aset_id: r.aset_id, no_dokumen: r.payload?.no_dokumen || '(tanpa no. dok)', tanggal: r.tanggal,
      keterangan: r.keterangan, nilai: r.nilai, induk: r.aset, anak: r.payload?.anak || [], snapshot: r.payload?.snapshot || null,
    })))
    setLoadingList(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList(skpd); setMode('list') }, [skpd, loadList])

  async function batal(j: Jurnal) {
    if (!(await konfirmasi({
      nada: 'amber', ikon: '↩', judul: 'Batalkan kapitalisasi ini?',
      subjudul: `No. Dok ${j.no_dokumen}`,
      rincian: [
        { label: 'Barang induk', nilai: j.induk?.nama_barang || j.induk?.nibar || '—' },
        { label: 'Nilai rehab dibalik', nilai: formatRupiah(j.nilai) },
        { label: 'Barang anak aktif lagi', nilai: `${j.anak.length} barang` },
      ],
      isi: <>Nilai perolehan induk &amp; masa manfaatnya <b>kembali seperti semula</b>, dan barang anak
        yang tadinya terserap muncul lagi sebagai barang tersendiri.</>,
      peringatan: <>Ditolak kalau induknya sudah punya transaksi lebih baru — batalkan yang lebih
        baru dulu. Jalankan <b>Engine</b> lagi setelah ini supaya angka penyusutannya ikut berubah.</>,
      labelYa: 'Ya, batalkan',
    })).ya) return
    const { error } = await batalkanKapitalisasi(supabase, j, Number(skpd))
    if (error) { setMsg(`Error: ${error}`); loadList(skpd); return }
    setMsg('Kapitalisasi dibatalkan — kembali seperti semula. Jalankan engine untuk memperbarui penyusutan.')
    loadList(skpd)
  }

  // ── ✎ Ubah = BATAL DULU, lalu form terisi ulang ────────────────────────────
  //
  // ⚠️ Bentuk ini SENGAJA, dan bukan "tambah anak lewat (+)". `transaksi_bmd`
  // append-only: baris kapitalisasi yang sudah ada tak bisa di-UPDATE, jadi
  // menambah anak belakangan mau tak mau jadi kapitalisasi KEDUA — dan band
  // overhaul-nya lalu dihitung dari persentase yang berbeda (r2 ÷ nilai
  // perolehan yang SUDAH naik), bukan dari (r1+r2) ÷ nilai awal. Untuk satu
  // dokumen rehab yang barangnya kurang tercentang, hasilnya SALAH, bukan
  // sekadar beda. Catatan ini sudah lama ada di CLAUDE.md ("tambah anak BUKAN
  // append murni — perlu keputusan desain terpisah").
  //
  // ⚠️ Batal dijalankan SEKARANG, bukan nanti saat Simpan. Alasannya
  // kebenaran angka, bukan kenyamanan: sesudah batal, `aset.nilai_perolehan`
  // induk sudah pulih & barang anak kembali `aktif`, jadi form di belakang ini
  // membaca dunia yang BERSIH — persis seperti membuat transaksi baru. Kalau
  // batal ditunda sampai Simpan, form akan menghitung di atas nilai perolehan
  // yang masih menggelembung oleh kapitalisasi lama, dan picker anak pun tak
  // bisa menampilkan barang yang masih berstatus terserap.
  //
  // Konsekuensi yang DITERIMA: kalau operator menutup form tanpa menyimpan,
  // kapitalisasinya memang sudah batal. Itu dikatakan terus terang di pop-up —
  // dan hasilnya sama saja dengan menekan 🗑 lalu "+ Tambah Transaksi", yang
  // memang alur manualnya selama ini.
  async function mulaiUbah(j: Jurnal) {
    if (!(await konfirmasi({
      nada: 'amber', ikon: '✎', judul: 'Ubah kapitalisasi ini?',
      subjudul: `No. Dok ${j.no_dokumen}`,
      rincian: [
        { label: 'Barang induk', nilai: j.induk?.nama_barang || j.induk?.nibar || '—' },
        { label: 'Barang anak', nilai: `${j.anak.length} barang` },
        { label: 'Nilai kapitalisasi', nilai: formatRupiah(j.nilai) },
      ],
      isi: <>Kapitalisasi ini <b>dibatalkan lebih dulu</b>, lalu formnya dibuka kembali sudah terisi —
        induk &amp; barang anaknya bebas diganti, termasuk menukar mana yang jadi induk.</>,
      peringatan: <>Kalau form ditutup tanpa disimpan, kapitalisasinya <b>tetap batal</b> dan harus
        disusun ulang. Jalankan <b>Engine</b> lagi setelah selesai.</>,
      labelYa: 'Ya, ubah',
    })).ya) return
    const { error } = await batalkanKapitalisasi(supabase, j, Number(skpd))
    if (error) { setMsg(`Error: ${error}`); loadList(skpd); return }
    setUbah(j)
    setMsg('')
    setMode('tambah')
  }

  const skpdNama = skpdList.find(s => String(s.id) === skpd)?.nama

  return (
    <FormShell judul="Kapitalisasi" msg={msg}
      deskripsi="Pilih SKPD, buat transaksi kapitalisasi: barang induk + barang anak (penambahan masa manfaat). Nilai anak diserap ke induk.">
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-3">
          <label className="w-32 text-sm text-gray-600 text-right flex-shrink-0">Lokasi / SKPD :</label>
          <SkpdCombobox lockToOperator value={skpd} onChange={id => { setSkpd(id); setMsg('') }}
            placeholder="Ketik nama SKPD / Sub OPD / Lokasi..." />
        </div>
      </div>

      {!skpd ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Pilih SKPD untuk melihat & membuat transaksi kapitalisasi.</div>
      ) : mode === 'tambah' ? (
        <TambahKapitalisasi
          skpdId={Number(skpd)} skpdNama={skpdNama || ''} bands={bands} golonganLabels={golonganLabels}
          ubah={ubah}
          onCancel={() => {
            // Saat mengubah, kapitalisasi lamanya SUDAH batal (lihat mulaiUbah).
            // Katakan apa adanya — kalau tidak, operator mengira "Kembali" =
            // membatalkan penyuntingan, padahal datanya memang sudah terbalik.
            setMsg(ubah
              ? `Kapitalisasi ${ubah.no_dokumen} sudah dibatalkan dan TIDAK disusun ulang. Buat transaksi baru kalau memang masih diperlukan, lalu jalankan engine.`
              : '')
            setUbah(null); setMode('list'); loadList(skpd)
          }}
          onSaved={(n) => {
            setMode('list')
            setMsg(`${ubah ? 'Kapitalisasi diperbarui' : 'Kapitalisasi tersimpan'} — ${n} barang anak diserap ke induk. Jalankan engine untuk memperbarui penyusutan.`)
            setUbah(null); loadList(skpd)
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{skpdNama} — {jurnals.length} transaksi kapitalisasi</span>
            <button className="btn-primary" onClick={() => { setMsg(''); setUbah(null); setMode('tambah') }}>+ Tambah Transaksi</button>
          </div>

          {loadingList ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Memuat...</div>
          ) : jurnals.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 text-sm">Belum ada kapitalisasi untuk SKPD ini.</div>
          ) : jurnals.map(j => (
            <div key={j.id} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-4">
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-gray-800">No. Dok: {j.no_dokumen}</p>
                  <p className="text-xs text-gray-500">Tgl. {j.tanggal}{j.keterangan ? ` · ${j.keterangan}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Nilai Kapitalisasi</p>
                    <p className="font-semibold text-gray-800">{formatRupiah(j.nilai)}</p>
                  </div>
                  <button title="Lihat rincian penambahan masa manfaat"
                    onClick={() => setDetail([{ no_dokumen: j.no_dokumen, tanggal: j.tanggal, keterangan: j.keterangan, snapshot: j.snapshot, anak: j.anak }])}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">👁</button>
                  {/* Amber = membatalkan keadaan yang sudah berlaku (nada yang
                      sama dgn Buka Kunci di KonfirmasiModal) — Ubah memang
                      membatalkan dulu, bukan menyunting di tempat. */}
                  <button title="Ubah kapitalisasi (dibatalkan lalu disusun ulang)" onClick={() => mulaiUbah(j)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-amber-500 hover:bg-amber-600 text-white">✎</button>
                  <button title="Batalkan kapitalisasi" onClick={() => batal(j)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded bg-red-500 hover:bg-red-600 text-white">🗑</button>
                </div>
              </div>
              <div className="px-5 py-3 text-sm">
                <p className="text-xs text-gray-400 mb-1">Barang Induk</p>
                <p className="font-medium text-gray-800 text-xs">{j.induk?.nama_barang || '-'}</p>
                <p className="text-gray-400 text-xs">{j.induk?.nibar || '-'} · {j.induk?.kode || '-'}</p>
                <p className="text-xs text-gray-400 mt-3 mb-1">Barang Anak (diserap) — {j.anak.length}</p>
                {j.anak.length === 0 ? <p className="text-gray-400 text-xs">-</p> : (
                  <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                    {j.anak.map(a => (
                      <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-gray-700">{a.nama || '-'} <span className="text-gray-400">· {a.nibar || '-'}{a.tgl ? ` · ${a.tgl}` : ''}</span></span>
                        <span className="text-gray-600">{formatRupiah(a.nilai)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && <KapitalisasiDetailModal title="Rincian Kapitalisasi" items={detail} onClose={() => setDetail(null)} />}
    </FormShell>
  )
}

// ── Form tambah ─────────────────────────────────────────────────────────────
function TambahKapitalisasi({ skpdId, skpdNama, bands, golonganLabels, ubah, onCancel, onSaved }: {
  skpdId: number; skpdNama: string; bands: BandOverhaul[]; golonganLabels: Record<string, string>
  /** Transaksi yang sedang diubah — SUDAH dibatalkan sebelum form ini dibuka.
   *  null = membuat transaksi baru. */
  ubah?: Jurnal | null
  onCancel: () => void; onSaved: (n: number) => void
}) {
  const supabase = createClient()
  const dateBounds = useDateBounds()
  const [noDok, setNoDok] = useState('')
  const [tgl, setTgl] = useState(today())
  const [ket, setKet] = useState('')
  const [induk, setInduk] = useState<Barang | null>(null)
  const [anak, setAnak] = useState<Barang[]>([])
  const [fig, setFig] = useState<IndukFig | null>(null)
  const [modal, setModal] = useState<'induk' | 'anak' | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Isi ulang dari transaksi yang sedang diubah. Baris `aset` DIBACA ULANG dari
  // DB, tidak diambil dari kartu: pembatalan barusan sudah memulihkan
  // `nilai_perolehan` induk & menghidupkan lagi barang anak, dan nilai di kartu
  // itu foto SEBELUM pemulihan.
  useEffect(() => {
    if (!ubah) return
    ;(async () => {
      setNoDok(ubah.no_dokumen === '(tanpa no. dok)' ? '' : ubah.no_dokumen)
      setTgl(ubah.tanggal)
      setKet(ubah.keterangan || '')
      const ids = [ubah.aset_id, ...ubah.anak.map(a => a.id)]
      const { data } = await supabase.from('aset')
        .select(BARANG_COLS).in('id', ids)
      const rows = (data || []) as Barang[]
      setInduk(rows.find(r => r.id === ubah.aset_id) ?? null)
      setAnak(ubah.anak.map(a => rows.find(r => r.id === a.id)).filter((b): b is Barang => !!b))
    })()
  }, [ubah]) // eslint-disable-line react-hooks/exhaustive-deps

  // Posisi induk SEBELUM kapitalisasi = posisi pada AKHIR periode sebelum
  // tanggal dokumen — yaitu keadaan pembuka periode kapitalisasi, persis state
  // yang dipakai engine saat memproses event ini.
  //
  // ⚠️ Sampai 2026-08-27 ini membaca baris `penyusutan_semester` TERBARU
  // (`order periode desc limit 1`). Untuk kapitalisasi bertanggal 27 Agustus
  // 2026 (2026-S2), baris terbaru itu 2026-S2 — yakni posisi SESUDAH beban
  // semester berjalan. Akibatnya kolom "Induk — Sebelum" menampilkan akumulasi
  // 30.121.751,2 padahal posisi pembukanya 27.970.197,2, dan nilai buku +
  // beban baru ikut meleset. Ketahuan user saat menguji pratinjau untuk BPK.
  //
  // Membaca periode P−1 juga membuat cabang khusus "sedang mengubah" tak perlu
  // lagi: kapitalisasi hidup di periode P, jadi baris P−1 TIDAK PERNAH
  // terpengaruh olehnya — bersih baik sebelum maupun sesudah pembatalan, dan
  // tak bergantung pada apakah engine sudah dijalankan ulang.
  useEffect(() => {
    setFig(null)
    if (!induk) return
    ;(async () => {
      const { data: k } = await supabase.from('admin_kodefikasi_bmd').select('masa_manfaat_tahun').eq('kode', induk.kode).single()
      const masaMaks = k?.masa_manfaat_tahun ?? null
      const npLama = induk.nilai_perolehan
      // Nilai buku DITURUNKAN (`np − akum`), bukan dibaca dari
      // `nilai_buku_akhir`: `npLama` datang dari register (memuat semua
      // peristiwa s.d. hari ini) sementara akumulasi dari baris P−1. Menurunkan
      // menjamin pratinjaunya konsisten sendiri — tak mungkin menampilkan
      // np − akum ≠ nb.
      const dasar = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
      const { data: ps } = await supabase.from('penyusutan_semester')
        .select('akumulasi,beban,sisa_semester').eq('aset_id', induk.id).eq('periode', dasar).limit(1)
      if (ps && ps.length) {
        const akumLama = Number(ps[0].akumulasi) || 0
        setFig({
          npLama, akumLama, nbLama: Math.max(0, npLama - akumLama),
          bebanLama: Number(ps[0].beban) || 0, sisaLamaSmt: ps[0].sisa_semester, masaMaks,
        })
        return
      }
      // Belum ada baris engine untuk P−1 → pakai baseline e-BMD.
      const { data: sa } = await supabase.from('transaksi_bmd').select('payload').eq('aset_id', induk.id).eq('jenis', 'saldo_awal').limit(1)
      const p = (sa?.[0]?.payload || {}) as { nilai_buku_awal?: number; akumulasi_2025?: number; beban_per_smt?: number; sisa_masa_manfaat_smt?: number }
      const akumLama = p.akumulasi_2025 ?? 0
      setFig({
        npLama, akumLama, nbLama: Math.max(0, npLama - akumLama),
        bebanLama: p.beban_per_smt ?? 0, sisaLamaSmt: p.sisa_masa_manfaat_smt ?? 0, masaMaks,
      })
    })()
  }, [induk, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Akumulasi penyusutan tiap ANAK, dibaca pada periode SEBELUM tanggal
  // dokumen (pola sama dgn Penggabungan Barang). WAJIB dibekukan ke payload:
  // engine mereplay SATU aset per panggilan, jadi saat memproses induk ia tak
  // punya akses ke jadwal anaknya — angka ini tak bisa diturunkan belakangan.
  //
  // ⚠️ Anak TANPA baris engine di periode itu dihitung 0, dan itu memang BENAR,
  // bukan kelonggaran: kalau `penyusutan_semester` tak punya barisnya, aset itu
  // tak menyumbang akumulasi apa pun ke laporan mana pun — menyerap 0 justru
  // yang menjaga totalnya kekal. Kasus nyatanya KDP hasil reklas (golongan
  // 1.3.6 tak pernah disusutkan). Karena itu di sini TIDAK diblokir seperti
  // Penggabungan Barang; yang dilakukan menampilkannya supaya operator sadar.
  const [akumAnak, setAkumAnak] = useState<Record<string, number>>({})
  const [anakTanpaBaris, setAnakTanpaBaris] = useState<string[]>([])

  useEffect(() => {
    if (anak.length === 0) { setAkumAnak({}); setAnakTanpaBaris([]); return }
    const periodeSebelum = formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))
    ;(async () => {
      const { data } = await supabase.from('penyusutan_semester')
        .select('aset_id,akumulasi').eq('periode', periodeSebelum).in('aset_id', anak.map(a => a.id))
      const map: Record<string, number> = {}
      for (const r of (data || []) as { aset_id: string; akumulasi: number }[]) map[r.aset_id] = Number(r.akumulasi) || 0
      setAkumAnak(map)
      setAnakTanpaBaris(anak.filter(a => map[a.id] == null).map(a => a.nama_barang || a.nibar || a.id))
    })()
  }, [anak, tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  const rehab = anak.reduce((s, a) => s + (a.nilai_perolehan || 0), 0)
  const akumSerap = anak.reduce((s, a) => s + (akumAnak[a.id] || 0), 0)
  const snap = induk && fig && rehab > 0 ? computeSnapshot(fig, induk.kode, rehab, bands, akumSerap, periodeDariTanggal(tgl)) : null
  const anakInfo = (): KapAnak[] => anak.map(a => ({
    id: a.id, nibar: a.nibar, nama: a.nama_barang, nilai: a.nilai_perolehan, tgl: a.tgl_perolehan,
    akum: akumAnak[a.id] || 0,
  }))

  const indukLevel3 = induk ? kodeLevel3(induk.kode) : ''
  const anakInvalid = (b: Barang): string | null => {
    if (induk && kodeLevel3(b.kode) !== indukLevel3) return 'beda jenis aset'
    if (induk?.tgl_perolehan && b.tgl_perolehan && b.tgl_perolehan < induk.tgl_perolehan) return 'lebih tua dari induk'
    // ⚠️ KOMPTABEL WAJIB SAMA (dipasang 2026-08-27). Aturannya sudah lama
    // dinyatakan aplikasi ini sendiri — teks di menu Reklasifikasi berbunyi
    // "Ekstra → Intra Komptabel … dibutuhkan SEBELUM kapitalisasi (mensyaratkan
    // komptabel sama)" — tapi tak pernah ditegakkan di sini.
    // Menyerap anak ekstra ke induk intra memindahkan nilai antar kolom
    // komptabel TANPA satu pun baris `reklas_komptabel`. Rekonsiliasi tetap
    // tie-out (intra naik oleh Kapitalisasi, ekstra turun oleh baris serap),
    // jadi tak ada yang berteriak — padahal di atas kertas itu reklasifikasi
    // yang tak pernah didokumenkan. Reklas komptabelnya dulu, baru kapitalisasi.
    if (induk && (b.intra_ekstra ?? 'intra') !== (induk.intra_ekstra ?? 'intra')) {
      return `beda komptabel (${kompLabel(b.intra_ekstra)} vs induk ${kompLabel(induk.intra_ekstra)}) — reklas komptabelnya dulu`
    }
    // ⚠️ Anak tak boleh LEBIH MUDA dari tanggal dokumen. Tanpa ini, rehab masuk
    // ke induk pada periode ketika barang anaknya BELUM ADA — nilai bertambah
    // dari ketiadaan, dan rantai Rekonsiliasi tetap menutup karena Kapitalisasi
    // memang baris penambahan yang sah.
    if (tgl && b.tgl_perolehan && b.tgl_perolehan > tgl) return `diperoleh ${b.tgl_perolehan}, lebih baru dari tanggal dokumen`
    return null
  }

  async function simpan() {
    if (!noDok.trim()) { setErr('No. Dokumen wajib diisi.'); return }
    if (!induk) { setErr('Pilih barang induk dulu.'); return }
    if (anak.length === 0) { setErr('Pilih minimal satu barang anak.'); return }
    const bad = anak.find(a => anakInvalid(a))
    if (bad) { setErr(`Barang anak "${bad.nama_barang}" ${anakInvalid(bad)} — tidak boleh.`); return }
    if (!fig) { setErr('Data induk belum siap, coba sebentar lagi.'); return }
    setErr(''); setSaving(true)
    // ⚠️ Guard rantai arah MAJU (dipasang 2026-08-27). Selama ini rantai cuma
    // dijaga saat MEMBATALKAN (`cekBolehBatal`); membuat kapitalisasi bertanggal
    // MUNDUR ke aset yang sudah punya peristiwa sesudahnya sama sekali tak
    // diperiksa. Engine mengurutkan replay by periode → tanggal → created_at,
    // bukan by id, jadi baris baru bertanggal tua diproses SEBELUM peristiwa
    // yang sudah ada — rantai state berubah tanpa satu pun baris lama disentuh
    // dan tanpa satu pun error. Induk & SEMUA anak ikut diperiksa.
    const urut = await cekBolehSisip(
      supabase,
      [{ aset_id: induk.id, label: induk.nama_barang || induk.nibar },
       ...anak.map(a => ({ aset_id: a.id, label: a.nama_barang || a.nibar }))],
      tgl, 'tanggal dokumen kapitalisasi ini',
    )
    if (!urut.boleh) { setErr(urut.pesan); setSaving(false); return }
    const snapshot = computeSnapshot(fig, induk.kode, rehab, bands, akumSerap, periodeDariTanggal(tgl))
    // ⚠️ `fig.npLama`, BUKAN `induk.nilai_perolehan`. Untuk transaksi baru
    // keduanya sama persis (fig diisi dari kolom itu). Bedanya cuma muncul saat
    // MENGUBAH dgn induk yang sama: di situ `fig.npLama` datang dari snapshot
    // lama — nilai perolehan induk SEBELUM kapitalisasi yang barusan
    // dibatalkan — sedangkan `induk.nilai_perolehan` bergantung pada apakah
    // pembacaan aset terjadi sebelum atau sesudah pemulihan. Memakai `fig`
    // membuat angkanya tak bergantung pada urutan itu.
    const npLama = fig.npLama
    const { error } = await catatTransaksi(supabase, {
      asetId: induk.id, jenis: 'kapitalisasi', tanggal: tgl, nilai: rehab, skpdAsal: induk.skpd_id,
      payload: {
        no_dokumen: noDok.trim(), nilai_rehab: rehab, persen_rehab: Math.round(snapshot.persen * 100) / 100,
        tambahan_tahun: snapshot.tambahan_tahun, nilai_perolehan_lama: npLama,
        nilai_perolehan_baru: npLama + rehab,
        // ⚠️ DELTA yang dibaca engine (lib/engine/penyusutan.ts case
        // 'kapitalisasi'). Dibekukan di sini karena engine mereplay satu aset
        // per panggilan & tak bisa melihat jadwal anaknya. Baris kapitalisasi
        // LAMA tak punya kunci ini → engine berperilaku persis seperti dulu.
        akumulasi_diserap: akumSerap,
        anak: anakInfo(), snapshot,
      },
      keterangan: ket.trim() || undefined,
    })
    if (error) { setErr(`Error: ${error}`); setSaving(false); return }
    for (const a of anak) {
      const { error: e2 } = await catatTransaksi(supabase, {
        asetId: a.id, jenis: 'kapitalisasi_serap', tanggal: tgl, nilai: a.nilai_perolehan, skpdAsal: a.skpd_id,
        payload: { induk_id: induk.id, induk_nibar: induk.nibar, no_dokumen: noDok.trim() },
        keterangan: `Diserap ke induk ${induk.nibar || induk.kode} (kapitalisasi ${noDok.trim()})`,
      })
      if (e2) { setErr(`Kapitalisasi tercatat, tapi serap barang anak gagal: ${e2}`); setSaving(false); return }
    }
    setSaving(false); onSaved(anak.length)
  }

  return (
    <div className="space-y-4">
      {ubah && (
        <div className="max-w-3xl rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
          Kapitalisasi <b>No. Dok {ubah.no_dokumen}</b> sudah <b>dibatalkan</b> — induk kembali ke nilai semula
          dan {ubah.anak.length} barang anaknya aktif lagi. Susun ulang di bawah lalu <b>Simpan</b>.
          <br />
          Kalau lu tekan <b>← Kembali</b> tanpa menyimpan, kapitalisasinya tetap batal dan harus dibuat dari awal.
        </div>
      )}

      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            {ubah ? 'Susun Ulang Kapitalisasi' : 'Kapitalisasi Baru'} — {skpdNama}
          </h2>
          <button className="btn-secondary text-xs" onClick={onCancel}>← Kembali</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Dokumen</label>
            <input className="select-filter w-full" value={noDok} onChange={e => setNoDok(e.target.value)} placeholder="mis. 027/1234/418.xx/2026" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tanggal Dokumen</label>
            <input type="date" className="select-filter w-full" min={dateBounds.min} max={dateBounds.max}
              value={tgl} onChange={e => setTgl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Keterangan / No. kontrak rehab</label>
            <input className="select-filter w-full" value={ket} onChange={e => setKet(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Induk</label>
          <button className="btn-secondary text-xs" onClick={() => setModal('induk')}>{induk ? 'Ganti Induk' : 'Pilih Barang Induk'}</button>
        </div>
        {induk ? (
          <div className="p-3 bg-teal/5 border border-teal/30 rounded-lg text-sm">
            <p className="font-medium text-gray-800">{induk.nama_barang || '-'}</p>
            {/* Nilai dari `fig` — lihat alasannya di `simpan()`. Sebelum fig
                termuat, kolom register dipakai sbg tampilan sementara. */}
            {/* Komptabel ikut ditampilkan sejak syarat "anak harus sekomptabel"
                ditegakkan (2026-08-27) — tanpa itu operator tak punya cara tahu
                kenapa barang anak tertentu ditolak. */}
            <p className="text-xs text-gray-500 mt-0.5">{induk.nibar || '-'} · {induk.kode} · Tgl {induk.tgl_perolehan || '-'} · {kompLabel(induk.intra_ekstra)} · Nilai {formatRupiah(fig ? fig.npLama : induk.nilai_perolehan)}</p>
          </div>
        ) : <p className="text-xs text-gray-400">Belum dipilih.</p>}
      </div>

      <div className="card p-5 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Barang Anak (penambahan) — {anak.length} dipilih</label>
          <button className="btn-secondary text-xs" disabled={!induk} onClick={() => setModal('anak')}>{anak.length ? 'Ubah Anak' : 'Pilih Anak Barang'}</button>
        </div>
        {!induk ? <p className="text-xs text-gray-400">Pilih induk dulu (anak harus 1 rumpun jenis & tgl ≥ induk).</p>
          : anak.length === 0 ? <p className="text-xs text-gray-400">Belum dipilih.</p> : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {anak.map(a => (
                <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-gray-700">{a.nama_barang || '-'} <span className="text-gray-400">· {a.nibar || '-'} · {a.kode} · Tgl {a.tgl_perolehan || '-'}</span></span>
                  <span className="text-gray-600">{formatRupiah(a.nilai_perolehan)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>

      {/* Anak tanpa baris engine = akumulasi 0 yang DIBEKUKAN ke ledger. Untuk
          KDP hasil reklas itu memang benar (golongan 1.3.6 tak pernah
          disusutkan), tapi kalau sebabnya cuma "engine belum dijalankan untuk
          periode itu", angka 0 tadi ikut permanen. Karena itu diberitahukan —
          bukan diblokir: memblokir akan mematikan alur KDP yang sah. */}
      {anakTanpaBaris.length > 0 && (
        <div className="max-w-3xl rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
          <b>{anakTanpaBaris.length} barang anak belum punya hasil penyusutan</b> pada periode{' '}
          {formatPeriode(previousPeriode(parsePeriode(periodeDariTanggal(tgl))))} — akumulasi yang ikut pindah ke
          induk dihitung <b>nol</b> untuk barang itu: {anakTanpaBaris.join(', ')}.
          <br />
          Itu <b>benar</b> kalau barangnya memang belum pernah disusutkan (mis. KDP yang baru direklas). Kalau
          bukan, jalankan <b>Engine</b> untuk periode itu dulu — angka nol ini ikut tersimpan permanen di ledger.
        </div>
      )}

      {snap && (
        <div className="card p-5 max-w-4xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview Perhitungan · Acuan periode {periodeDariTanggal(tgl)}</p>
          <KapitalisasiRincian item={{ no_dokumen: noDok || '(belum diisi)', tanggal: tgl, keterangan: ket, snapshot: snap, anak: anakInfo() }} />
        </div>
      )}

      {err && <p className="text-sm text-red-600 max-w-3xl">{err}</p>}
      <div className="max-w-3xl">
        <button className="btn-primary" onClick={simpan} disabled={saving || !induk || anak.length === 0}>
          {saving ? 'Menyimpan...' : 'Simpan Kapitalisasi'}
        </button>
      </div>

      {modal && (
        <BarangModal
          skpdId={skpdId} golonganLabels={golonganLabels}
          title={modal === 'induk' ? 'Pilih Barang Induk' : 'Pilih Barang Anak (penambahan)'}
          confirmLabel={modal === 'induk' ? 'Pilih Barang' : 'Pilih Anak Barang'}
          multi={modal === 'anak'}
          excludeIds={modal === 'anak' && induk ? [induk.id] : []}
          initialSelected={modal === 'induk' ? (induk ? [induk] : []) : anak}
          initialGolongan={modal === 'anak' ? indukLevel3 : ''}
          invalidFn={modal === 'anak' ? anakInvalid : undefined}
          onClose={() => setModal(null)}
          onConfirm={(sel) => { if (modal === 'induk') { setInduk(sel[0] || null); setAnak([]) } else setAnak(sel); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Popup pemilih barang ────────────────────────────────────────────────────
function BarangModal({ skpdId, golonganLabels, title, confirmLabel, multi, excludeIds = [], initialSelected = [], initialGolongan = '', invalidFn, onClose, onConfirm }: {
  skpdId: number; golonganLabels: Record<string, string>; title: string; confirmLabel: string; multi: boolean
  excludeIds?: string[]; initialSelected?: Barang[]; initialGolongan?: string
  invalidFn?: (b: Barang) => string | null; onClose: () => void; onConfirm: (sel: Barang[]) => void
}) {
  const supabase = createClient()
  const [fGol, setFGol] = useState(initialGolongan)
  const [fSearch, setFSearch] = useState('')
  const [rows, setRows] = useState<Barang[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, Barang>>(Object.fromEntries(initialSelected.map(b => [b.id, b])))

  async function tampilkan() {
    setLoading(true)
    let q = supabase.from('aset').select(BARANG_COLS).eq('status', 'aktif').eq('skpd_id', skpdId)
    if (fGol) q = q.like('kode', `${fGol}.%`)
    if (fSearch) q = q.or(`nama_barang.ilike.%${fSearch}%,nibar.ilike.%${fSearch}%,kode.ilike.${fSearch}%`)
    const { data } = await q.order('nilai_perolehan', { ascending: false }).limit(500)
    setRows(((data as unknown as Barang[]) || []).filter(b => !excludeIds.includes(b.id)))
    setLoaded(true); setLoading(false)
  }

  function pick(b: Barang) {
    if (invalidFn && invalidFn(b)) return
    setSel(prev => {
      if (!multi) return { [b.id]: b }
      const next = { ...prev }
      if (next[b.id]) delete next[b.id]; else next[b.id] = b
      return next
    })
  }

  const selList = Object.values(sel)
  const selTotal = selList.reduce((s, b) => s + b.nilai_perolehan, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdropClose(onClose)}>
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
              <select className="select-filter" value={fGol} onChange={e => setFGol(e.target.value)}>
                <option value="">Semua Jenis</option>
                {GOLONGAN_DAFTAR_BARANG.map(g => <option key={g} value={g}>{g} — {golonganLabels[g] || '...'}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">Cari</label>
              <input className="select-filter w-full" placeholder="Nama / NIBAR / kode..." value={fSearch}
                onChange={e => setFSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') tampilkan() }} />
            </div>
            <button className="btn-primary" onClick={tampilkan} disabled={loading}>{loading ? 'Memuat...' : 'Tampilkan'}</button>
          </div>
          {invalidFn && (
            <p className="text-xs text-gray-400 mt-2">
              Hanya barang yang 1 rumpun jenis dgn induk, <b>sekomptabel</b> dgn induk, dan tanggal perolehannya
              antara tgl induk s.d. tgl dokumen yang bisa dipilih. Baris yang tak memenuhi tetap ditampilkan
              beserta <span className="text-red-500">alasannya</span> — supaya jelas kenapa, bukan sekadar hilang.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {!loaded ? <div className="py-10 text-center text-gray-400 text-sm">Atur filter lalu klik Tampilkan.</div> : (
            <table className="w-full">
              <thead className="bg-gray-50 border-y border-gray-100 sticky top-0">
                <tr>
                  <th className="table-th w-10" />
                  <th className="table-th">Barang</th>
                  <th className="table-th">Tgl Perolehan</th>
                  <th className="table-th text-right">Nilai Perolehan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="table-td text-center py-10 text-gray-400">Tidak ada barang aktif untuk filter ini.</td></tr>
                ) : rows.map(b => {
                  const bad = invalidFn?.(b) ?? null
                  return (
                    <tr key={b.id} onClick={() => pick(b)}
                      className={bad ? 'opacity-50 cursor-not-allowed' : sel[b.id] ? 'bg-teal/5 cursor-pointer' : 'cursor-pointer'}>
                      <td className="table-td text-center">
                        <input type={multi ? 'checkbox' : 'radio'} checked={!!sel[b.id]} disabled={!!bad} readOnly />
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-800 text-xs">{b.nama_barang || '-'}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.nibar || '-'} · {b.kode}{bad && <span className="text-red-500"> · {bad}</span>}</p>
                      </td>
                      <td className="table-td text-xs text-gray-600">{b.tgl_perolehan || '-'}</td>
                      <td className="table-td text-right text-xs">{formatRupiah(b.nilai_perolehan)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">{selList.length} dipilih{multi ? ` · ${formatRupiah(selTotal)}` : ''}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={selList.length === 0} onClick={() => onConfirm(selList)}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
