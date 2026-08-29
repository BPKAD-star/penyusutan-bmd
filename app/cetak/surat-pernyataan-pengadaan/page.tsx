'use client'
import { namaBerkasCetak } from '@/lib/cetakLembar'
// ============================================================================
// Cetak "Surat Pernyataan" — pengakuan pencatatan BMD hasil Pengadaan APBD.
// Standalone (tanpa sidebar, TANPA kop surat — permintaan user 2026-08-26).
//   ?id=<jurnal_header.id>      (WAJIB — satu kontrak pengadaan yang SUDAH disetujui)
//   &nomor=<nomor surat>        (WAJIB — diisi lewat pop-up di kartu kontrak)
//
// Tombolnya ada di kartu kontrak DISETUJUI (Pengadaan.tsx, ApprovedCard), di
// atas "🔓 Buka Kunci". Pop-upnya CUMA minta Nomor Surat — SATU-SATUNYA input
// manual. Sisanya, TERMASUK blok tanggal "Pada hari ini... tanggal... bulan...
// tahun..." (item 3-5), diambil dari `jurnal_header.created_at`: kapan operator
// pertama kali men-ENTRY kontrak ini ke sistem (bukan tanggal kontrak/BAST, dan
// bukan tanggal dibuka lembar ini) — keputusan user 2026-08-26, dikonfirmasi
// eksplisit lewat AskUserQuestion supaya tak menebak field legal-document ini.
//
// ⚠️ FAIL-CLOSED: kontrak yang belum `disetujui` DITOLAK — surat ini menyatakan
// "telah dilakukan pencatatan", jadi tak sah dicetak untuk draft yang belum
// resmi tercatat.
// ============================================================================
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { bentukKontrakLabel } from '@/lib/bentukKontrak'
import { fetchUraianRekening, labelRekening } from '@/lib/rkbmdStandar'
import { rantaiKeAtas, type SkpdNode } from '@/lib/penandaTangan'

const KABUPATEN = 'Kediri'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** 'YYYY-MM-DD' → {hari, tanggal, bulan, tahun}, diurai MANUAL dari komponen
 *  tanggal LOKAL (bukan `new Date(iso)` yang membaca ISO sbg UTC lalu bisa
 *  mundur sehari di zona negatif — pelajaran `tglPanjang` di cetak/perolehan). */
function pecahTanggal(ymd: string): { hari: string; tanggal: string; bulan: string; tahun: string } | null {
  const [y, m, d] = (ymd || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const dow = new Date(y, m - 1, d).getDay()
  return { hari: HARI[dow], tanggal: String(d), bulan: BULAN[m - 1], tahun: String(y) }
}

/** timestamptz (UTC) → 'YYYY-MM-DD' pada zona Asia/Jakarta — supaya "kapan user
 *  entry" cocok dgn kalender WIB yang dialami operator, bukan tanggal UTC yang
 *  bisa mundur/maju sehari dekat tengah malam. */
function tanggalJakarta(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const tglID = (s: string | null | undefined) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : s
}

type HeaderPayload = {
  sub_kegiatan?: string; nama_penyedia?: string; nama_ppk?: string
  no_bast?: string; tgl_bast?: string
}
type Header = {
  id: string; no_sk: string; tanggal: string; jenis: string; skpd_id: number
  payload: HeaderPayload; approval_status: string; created_at: string
}
type Pegawai = { nama: string; nip: string | null; pangkat: string | null; golongan: string | null; jabatan: string | null; skpd_id: number | null }
type SkpdRow = SkpdNode & { level: number }

export default function CetakSuratPernyataanPengadaanPage() {
  const supabase = createClient()
  const [siap, setSiap] = useState(false)
  const [gagal, setGagal] = useState('')
  const [header, setHeader] = useState<Header | null>(null)
  const [skpd, setSkpd] = useState<SkpdRow | null>(null)
  const [pengurus, setPengurus] = useState<Pegawai | null>(null)
  const [ppk, setPpk] = useState<Pegawai | null>(null)
  const [subKode, setSubKode] = useState('')
  const [subNama, setSubNama] = useState('')
  const [rekeningKode, setRekeningKode] = useState('')
  const [rekeningNama, setRekeningNama] = useState('')
  const [total, setTotal] = useState(0)
  const [nomor, setNomor] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const q = new URLSearchParams(window.location.search)
        const id = q.get('id')
        const nmr = q.get('nomor') || ''
        setNomor(nmr)
        if (!id) throw new Error('Kontrak tidak diketahui (id kosong).')
        if (!nmr.trim()) throw new Error('Nomor surat belum diisi.')

        const { data: h, error: hErr } = await supabase.from('jurnal_header')
          .select('id,no_sk,tanggal,jenis,skpd_id,payload,approval_status,created_at')
          .eq('id', id).eq('kategori', 'pengadaan').maybeSingle()
        if (hErr) throw new Error(`gagal membaca kontrak: ${hErr.message}`)
        if (!h) throw new Error('Kontrak tidak ditemukan.')
        if (h.approval_status !== 'disetujui') {
          throw new Error('Kontrak ini belum disetujui — surat pernyataan hanya untuk kontrak yang sudah resmi tercatat.')
        }
        setHeader(h as Header)

        const sub = (h.payload as HeaderPayload)?.sub_kegiatan || ''
        const [sk, ...sisa] = sub.split(' — ')
        setSubKode(sub ? sk.trim() : '')
        setSubNama(sisa.join(' — ').trim())

        // ── SKPD (leaf + rantai ke akar, utk lingkup pencarian PPK) ──────────
        const semua: SkpdRow[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('admin_skpd')
            .select('id,nama,parent_id,level').range(from, from + 999)
          if (error) throw new Error(`gagal membaca daftar SKPD: ${error.message}`)
          if (!data || data.length === 0) break
          semua.push(...(data as SkpdRow[]))
          if (data.length < 1000) break
        }
        const byId = new Map<number, SkpdNode>(semua.map(s => [s.id, s]))
        const ini = semua.find(s => s.id === h.skpd_id)
        if (!ini) throw new Error(`SKPD #${h.skpd_id} tidak ditemukan.`)
        setSkpd(ini)
        const rantai = rantaiKeAtas(h.skpd_id, byId)

        // ── Pengurus Barang / Pengurus Barang Pembantu (di SKPD kartu ini
        // SENDIRI, bukan rantai) — level 1 ("SKPD") → pengurus_barang; level
        // 2/3 ("sub OPD") → pengurus_barang_pembantu. Tak ketemu → dibiarkan
        // bertitik-titik, pola yang sama dgn lembar cetak lain di repo ini. ──
        const roleBmd = ini.level <= 1 ? 'pengurus_barang' : 'pengurus_barang_pembantu'
        const { data: pgw } = await supabase.from('admin_pegawai')
          .select('nama,nip,pangkat,golongan,jabatan,skpd_id')
          .eq('skpd_id', h.skpd_id).eq('role_bmd', roleBmd).order('nama').limit(1)
        setPengurus((pgw?.[0] as Pegawai) || null)

        // ── PPK: NIP-nya tak tersimpan di payload (cuma nama), jadi dicari
        // lewat nama di rantai SKPD yang sama dgn picker saat kontrak dibuat
        // (usePegawaiSkpd). Tak ketemu/dobel nama → NIP dibiarkan kosong,
        // bukan ditebak. ──
        const namaPpk = (h.payload as HeaderPayload)?.nama_ppk || ''
        if (namaPpk && rantai.length > 0) {
          const { data: ppkRows } = await supabase.from('admin_pegawai')
            .select('nama,nip,pangkat,golongan,jabatan,skpd_id')
            .eq('nama', namaPpk).in('skpd_id', rantai).limit(1)
          setPpk((ppkRows?.[0] as Pegawai) || null)
        }

        // ── Barang: total nilai + kode rekening (dedup by aset, aset aktif
        // saja — sama pola dgn fetchPengadaanJurnals). ──
        const { data: trx, error: trxErr } = await supabase.from('transaksi_bmd')
          .select('id,aset_id,nilai,payload,aset:aset_id(status)')
          .eq('jenis', 'pengadaan').eq('header_id', id).order('id', { ascending: false })
        if (trxErr) throw new Error(`gagal membaca barang: ${trxErr.message}`)
        const seen = new Set<string>()
        let tot = 0
        const rekSet = new Set<string>()
        for (const r of (trx || []) as unknown as { aset_id: string | null; nilai: number; payload: { kode_rekening?: string } | null; aset: { status: string } | null }[]) {
          if (!r.aset_id || seen.has(r.aset_id)) continue
          seen.add(r.aset_id)
          if (r.aset?.status !== 'aktif') continue
          tot += r.nilai || 0
          if (r.payload?.kode_rekening) rekSet.add(r.payload.kode_rekening)
        }
        setTotal(tot)
        const rekList = [...rekSet]
        setRekeningKode(rekList.join(', '))
        if (rekList.length > 0) {
          const uraian = await fetchUraianRekening(supabase, rekList)
          setRekeningNama(rekList.map(k => labelRekening(k, uraian)).join('; '))
        }
      } catch (e) {
        setGagal((e as Error).message)
      } finally {
        setSiap(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!header) return
    document.title = namaBerkasCetak('Surat Pernyataan Pengadaan', header.no_sk)
  }, [header])

  const tgl = header ? pecahTanggal(tanggalJakarta(header.created_at)) : null
  const labelPengurus = skpd ? (skpd.level <= 1 ? 'Pengurus Barang' : 'Pengurus Barang Pembantu') : 'Pengurus Barang'

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 2.5cm 2cm; } body { background: white; } }`}</style>

      <div className="max-w-[800px] mx-auto mb-3 flex justify-end no-print px-4">
        <button onClick={() => window.print()} disabled={!siap || !!gagal} className="btn-primary text-sm">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <div className="max-w-[800px] mx-auto bg-white p-10 shadow print:shadow-none print:p-0 text-[13px] leading-relaxed">
        {!siap ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat…</p>
        ) : gagal ? (
          <p className="py-8 text-center text-red-600 text-sm">Gagal menyiapkan surat: {gagal}</p>
        ) : header && tgl ? (
          <>
            <div className="text-center mb-6">
              <p className="font-bold underline">SURAT PERNYATAAN</p>
              <p className="font-bold">Nomor : {nomor}</p>
            </div>

            <p className="mb-4">
              Pada hari ini {tgl.hari}, tanggal {tgl.tanggal} bulan {tgl.bulan} tahun {tgl.tahun}, bertempat di {KABUPATEN},
              yang bertanda tangan dibawah ini :
            </p>

            <table className="mb-4">
              <tbody>
                <tr><td className="w-36 align-top pr-2">Nama</td><td className="w-4 align-top">:</td><td>{pengurus?.nama || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">NIP</td><td className="align-top">:</td><td>{pengurus?.nip || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Pangkat/Gol</td><td className="align-top">:</td><td>{[pengurus?.pangkat, pengurus?.golongan].filter(Boolean).join(' / ') || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Jabatan</td><td className="align-top">:</td><td>{pengurus?.jabatan || '.....................................'}</td></tr>
              </tbody>
            </table>

            <p className="mb-4">
              Selaku &quot;Pengurus Barang&quot;, pada {skpd?.nama || '.....................................'} menyatakan bahwa,
              telah dilakukan pencatatan atau pembukuan sebagai Barang Milik Daerah yang diperoleh dari pengadaan APBD
              dengan rincian sebagai berikut:
            </p>

            <table className="mb-6">
              <tbody>
                <tr><td className="w-36 align-top pr-2">Kode sub Kegiatan</td><td className="w-4 align-top">:</td><td>{subKode || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Nama sub kegiatan</td><td className="align-top">:</td><td>{subNama || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Kode belanja</td><td className="align-top">:</td><td>{rekeningKode || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Uraian belanja</td><td className="align-top">:</td><td>{rekeningNama || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Bentuk Kontrak</td><td className="align-top">:</td><td>{bentukKontrakLabel(header.jenis)}</td></tr>
                <tr><td className="align-top pr-2 pl-4">a. Nama penyedia</td><td className="align-top">:</td><td>{header.payload.nama_penyedia || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2 pl-4">b. Nomor</td><td className="align-top">:</td><td>{header.no_sk}</td></tr>
                <tr><td className="align-top pr-2 pl-4">c. Tanggal</td><td className="align-top">:</td><td>{tglID(header.tanggal)}</td></tr>
                <tr><td className="align-top pr-2">Tanggal BAST</td><td className="align-top">:</td><td>{tglID(header.payload.tgl_bast) || '.....................................'}</td></tr>
                <tr><td className="align-top pr-2">Nilai (Rp.)</td><td className="align-top">:</td><td>{formatRupiah(total)}</td></tr>
              </tbody>
            </table>

            <p className="mb-8">
              Demikian surat pernyataan ini dibuat untuk dipergunakan seperlunya, apabila terdapat kekeliruan akan
              dilakukan perbaikan sesuai ketentuan.
            </p>

            <div className="flex justify-between">
              <div className="w-64 text-center">
                <p>Mengetahui,</p>
                <p>Pejabat Pembuat Komitmen</p>
                <div className="h-16" />
                <p className="font-semibold underline">{ppk?.nama || header.payload.nama_ppk || '.....................................'}</p>
                <p>NIP. {ppk?.nip || '.....................................'}</p>
              </div>
              <div className="w-64 text-center">
                <p>&nbsp;</p>
                <p>{labelPengurus}</p>
                <div className="h-16" />
                <p className="font-semibold underline">{pengurus?.nama || '.....................................'}</p>
                <p>NIP. {pengurus?.nip || '.....................................'}</p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
