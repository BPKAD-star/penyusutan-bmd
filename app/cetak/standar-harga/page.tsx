'use client'
import { ingatanCetak, KUNCI_TTD_STANDAR_SEKAB } from '@/lib/ingatanCetak'
import { namaBerkasCetak } from '@/lib/cetakLembar'
// Cetak Standar Harga — LAMPIRAN draft SK penetapan, satu berkas per jenis.
// Standalone, F4 landscape (sama dgn lembar RKBMD se-Kabupaten).
//
//   ?tahun=2027&jenis=ssh|hspk|asb|sbu|sbsk [&ttd=<id pegawai>&jabatan=bupati|sekda]
//
// ⚠️ SE-KABUPATEN, TANPA MODE PER-SKPD — dan itu bukan kelalaian. `rkbmd_standar`
// adalah BAK BERSAMA: satu barang cukup diusulkan sekali se-kabupaten, dan yang
// ditetapkan justru daftar gabungannya. Memecahnya per SKPD akan mencetak
// beberapa lembar yang saling memuat barang yang sama, dan pembacanya tak punya
// cara tahu mana yang berlaku.
//
// Konsekuensinya kolom "Diinput oleh" (yang ada di layar Pelaporan) SENGAJA
// TIDAK ikut tercetak: siapa yang pertama mengusulkan itu jejak proses, bukan
// isi ketetapan — dan mencantumkannya di lampiran SK membuat barang yang sama
// seolah milik satu SKPD saja.
//
// TANDA TANGAN CUMA DI SINI (keputusan user 2026-08-19): usulan per SKPD tidak
// perlu lembar bertanda tangan sendiri seperti RKBMD — yang diteken hanya
// keluaran akhirnya, karena inilah yang jadi lampiran SK.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRupiah } from '@/lib/export'
import { fetchStandar, STANDAR_CONFIG, type StandarJenis } from '@/lib/rkbmdStandar'
import {
  USULAN_JENIS, LABEL_NAMA, LABEL_NILAI,
  pakaiKodeBarang, pakaiHarga, pakaiTkdn, pakaiRekening, pakaiMerk,
  type UsulanJenis,
} from '@/lib/rkbmdStandarUsulan'

const KABUPATEN = 'Kediri'

/** Pilihan penanda tangan disimpan supaya cetak ulang menghasilkan lembar yang
 *  SAMA — pola & alasannya sama dgn `bmd_rkbmd_ttd_sekab` (app/cetak/rkbmd).
 *  Preferensi tampilan, bukan gerbang wewenang. */

/** Yang meneken SK standar harga. Dua pilihan saja & sengaja DIPAKU teksnya,
 *  bukan diambil dari kolom `jabatan` pegawainya: kolom itu memuat jabatan
 *  struktural (pernah mencetak "Kepala Sekretariat Daerah" — bukan Sekda) —
 *  pelajaran yang sama sudah didapat di lembar RKBMD se-Kabupaten. */
type JabatanTtd = 'bupati' | 'sekda'
const JABATAN: Record<JabatanTtd, string> = {
  bupati: `Bupati ${KABUPATEN}`,
  sekda: `Sekretaris Daerah Kabupaten ${KABUPATEN}`,
}

type Pegawai = { id: string | number; nama: string; nip: string | null; jabatan: string | null; skpd_id: number | null }
type TtdTersimpan = { id?: string; jabatan?: JabatanTtd }

/** Isi localStorage itu data dari luar program (versi lama, suntingan manual,
 *  tab lain). Gagal mengurainya cukup berarti "belum pernah memilih" — jangan
 *  sampai menjatuhkan halaman cetak. */
const ingatan = ingatanCetak<TtdTersimpan>(KUNCI_TTD_STANDAR_SEKAB)
const bacaTtdTersimpan = (): TtdTersimpan | null => ingatan.baca()

/** Satu bentuk baris untuk kelima jenis. `rkbmd_standar` & `rkbmd_sbsk` dua
 *  tabel berbeda (yang satu berharga, yang lain berkuantitas), tapi lembarnya
 *  dirakit dari susunan kolom yang sama — jadi bedanya diselesaikan SEKALI di
 *  sini, bukan lewat dua pohon JSX yang harus dijaga sejalan. */
type Baris = {
  key: string
  kode: string | null
  nama: string
  merk_tipe: string | null
  satuan: string | null
  harga: number | null
  tkdn: number | null
  kuantitas_standar: number | null
  satuan_pengukur: string | null
  rekening: string[]
  keterangan: string | null
}

type Kolom = { judul: string; align?: 'right' | 'center'; isi: (r: Baris) => ReactNode }

/** Susunan kolom lembar, DITURUNKAN dari predikat bentuk di
 *  lib/rkbmdStandarUsulan (`pakaiKodeBarang`/`pakaiMerk`/…) — bukan lima daftar
 *  yang ditulis tangan. Predikat itulah yang juga menentukan kolom mana yang
 *  tampil di form usulan & wajib diisi, jadi lembar cetaknya mustahil
 *  menampilkan kolom yang tak pernah ada isiannya. */
function kolomUntuk(jenis: UsulanJenis, uraian: Map<string, string>): Kolom[] {
  const k: Kolom[] = []
  if (pakaiKodeBarang(jenis)) {
    k.push({ judul: 'Kode Barang', isi: r => r.kode || '-' })
    // Uraian baku di-lookup dari kodefikasi, BUKAN dari `nama` yang tersimpan:
    // `nama` itu spesifikasi yang diketik pengusul. Dua hal berbeda — pola yang
    // sama dgn Daftar Barang, Penyusutan, & lembar cetak RKBMD.
    k.push({ judul: 'Uraian Barang', isi: r => (r.kode && uraian.get(r.kode)) || '-' })
  }
  k.push({ judul: LABEL_NAMA[jenis], isi: r => r.nama })
  if (pakaiMerk(jenis)) k.push({ judul: 'Merk / Tipe', isi: r => r.merk_tipe || '-' })
  k.push({ judul: 'Satuan', isi: r => r.satuan || '-' })

  if (jenis === 'sbsk') {
    k.push({ judul: 'Satuan Pengukur', isi: r => r.satuan_pengukur || '-' })
    k.push({
      judul: LABEL_NILAI[jenis], align: 'right',
      isi: r => r.kuantitas_standar != null ? r.kuantitas_standar.toLocaleString('id-ID') : '-',
    })
  } else if (pakaiHarga(jenis)) {
    k.push({ judul: LABEL_NILAI[jenis], align: 'right', isi: r => formatRupiah(r.harga) })
  }

  // "-" berarti tak berTKDN, sengaja BUKAN "0%" — itu angka yang berbeda artinya
  // (pola yang sama dgn lembar cetak RKBMD Pengadaan).
  if (pakaiTkdn(jenis)) {
    k.push({ judul: 'TKDN (%)', align: 'right', isi: r => r.tkdn != null ? `${r.tkdn}` : '-' })
  }
  if (pakaiRekening(jenis)) {
    // Bisa lebih dari satu — hasil penggabungan antar-SKPD di bak bersama.
    // Ditumpuk ke bawah, bukan dipisah "; ": di kolom selebar ini satu baris
    // panjang akan membungkus di tempat yang salah dan kodenya jadi terpotong.
    k.push({
      judul: 'Kode Rekening',
      isi: r => r.rekening.length === 0 ? '-' : r.rekening.map(x => <div key={x}>{x}</div>),
    })
  }
  k.push({ judul: 'Keterangan', isi: r => r.keterangan || '' })
  return k
}

function judulCetak(j: UsulanJenis): string {
  // Empat jenis berharga sudah punya judul resminya di STANDAR_CONFIG — jangan
  // ditulis ulang di sini. SBSK tabelnya sendiri & tak ada di config itu.
  return j === 'sbsk' ? 'Standar Kebutuhan Barang Milik Daerah (SBSK)' : STANDAR_CONFIG[j as StandarJenis].judul
}

const JENIS_VALID = new Set(USULAN_JENIS.map(j => j.key))

export default function CetakStandarHargaPage() {
  const supabase = createClient()
  const [jenis, setJenis] = useState<UsulanJenis | null>(null)
  const [tahun, setTahun] = useState(0)
  const [rows, setRows] = useState<Baris[]>([])
  const [uraian, setUraian] = useState<Map<string, string>>(new Map())
  const [pegawai, setPegawai] = useState<Pegawai[]>([])
  const [skpdNama, setSkpdNama] = useState<Map<number, string>>(new Map())
  const [ttdId, setTtdId] = useState('')
  const [jabatan, setJabatan] = useState<JabatanTtd>('bupati')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search)
      const th = Number(p.get('tahun'))
      const jn = p.get('jenis') as UsulanJenis | null
      if (!th || !jn || !JENIS_VALID.has(jn)) {
        setErr('Alamat cetak belum lengkap. Pakai ?tahun=<TA>&jenis=ssh|hspk|asb|sbu|sbsk.')
        setLoading(false); return
      }
      setTahun(th); setJenis(jn)

      try {
        // ── Isi lembar. Fail-closed (rules.md): kegagalan query DILEMPAR &
        // lembarnya tidak dirakit sama sekali. Lampiran SK yang kurang beberapa
        // baris jauh lebih mahal daripada halaman yang menolak tampil — yang
        // pertama ikut ditandatangani, yang kedua ketahuan seketika.
        let isi: Baris[] = []
        if (jn === 'sbsk') {
          const { data, error } = await supabase.from('rkbmd_sbsk')
            .select('id,tahun,kode,spesifikasi,satuan_pengukur,kuantitas_standar,satuan,keterangan')
            .eq('tahun', th).order('kode')
          if (error) throw new Error(`gagal membaca standar kebutuhan: ${error.message}`)
          isi = ((data || []) as {
            id: number; kode: string; spesifikasi: string | null; satuan_pengukur: string
            kuantitas_standar: number; satuan: string | null; keterangan: string | null
          }[]).map(r => ({
            key: `sbsk-${r.id}`, kode: r.kode, nama: r.spesifikasi || '-', merk_tipe: null,
            satuan: r.satuan, harga: null, tkdn: null,
            kuantitas_standar: r.kuantitas_standar, satuan_pengukur: r.satuan_pengukur,
            rekening: [], keterangan: r.keterangan,
          }))
        } else {
          const data = await fetchStandar(supabase, jn as StandarJenis, th)
          isi = data.map(r => ({
            key: `std-${r.id}`, kode: r.kode, nama: r.nama, merk_tipe: r.merk_tipe,
            satuan: r.satuan, harga: r.harga, tkdn: r.tkdn,
            kuantitas_standar: null, satuan_pengukur: null,
            rekening: r.rekening, keterangan: r.keterangan,
          }))
        }

        if (isi.length === 0) {
          setErr(`Belum ada ${judulCetak(jn)} TA ${th} yang ditetapkan. `
            + 'Isinya datang dari usulan SKPD yang sudah disetujui di menu Validasi Standar Harga.')
          setLoading(false); return
        }
        setRows(isi)

        // Uraian baku per kode barang. ASB/SBU tak berkode → tak ada yang dicari.
        const kodes = [...new Set(isi.map(r => r.kode).filter((k): k is string => !!k))]
        if (kodes.length > 0) {
          const peta = new Map<string, string>()
          for (let i = 0; i < kodes.length; i += 500) {
            const { data: kd, error: e2 } = await supabase.from('admin_kodefikasi_bmd')
              .select('kode,uraian').in('kode', kodes.slice(i, i + 500))
            if (e2) throw new Error(`gagal membaca uraian kodefikasi: ${e2.message}`)
            for (const k of (kd || []) as { kode: string; uraian: string | null }[]) {
              peta.set(k.kode, k.uraian || '')
            }
          }
          setUraian(peta)
        }

        // ── Daftar calon penanda tangan: SE-PEMDA, bukan per SKPD. Yang meneken
        // ketetapan se-kabupaten itu Bupati/Sekda, bisa terdaftar di SKPD mana
        // pun — pola & alasannya sama dgn lembar RKBMD se-Kabupaten.
        const { data: pg, error: ePg } = await supabase.from('admin_pegawai')
          .select('id,nama,nip,jabatan,skpd_id').order('nama')
        if (ePg) throw new Error(`gagal membaca daftar pegawai: ${ePg.message}`)
        setPegawai((pg || []) as Pegawai[])

        const skpd: { id: number; nama: string }[] = []
        for (let from = 0; ; from += 1000) {
          const { data } = await supabase.from('admin_skpd').select('id,nama').range(from, from + 999)
          if (!data || data.length === 0) break
          skpd.push(...(data as { id: number; nama: string }[]))
          if (data.length < 1000) break
        }
        setSkpdNama(new Map(skpd.map(s => [s.id, s.nama] as [number, string])))

        const tersimpan = bacaTtdTersimpan()
        setTtdId(p.get('ttd') || tersimpan?.id || '')
        const jbt = (p.get('jabatan') || tersimpan?.jabatan) as JabatanTtd | null
        if (jbt === 'bupati' || jbt === 'sekda') setJabatan(jbt)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nama berkas unduhan. Chrome & Edge memakai `document.title` sebagai nama
  // bawaan "Save as PDF" — tak ada cara lain menyetelnya dari halaman.
  useEffect(() => {
    if (loading || err || !jenis) return
    const label = USULAN_JENIS.find(j => j.key === jenis)?.label || jenis
    document.title = namaBerkasCetak('Standar Harga', label, `Kab ${KABUPATEN}`, tahun)
  }, [loading, err, jenis, tahun])

  const kolom = useMemo(() => jenis ? kolomUntuk(jenis, uraian) : [], [jenis, uraian])
  const ttd = pegawai.find(g => String(g.id) === ttdId) || null

  // Disimpan APA ADANYA, termasuk saat namanya belum dipilih: pilihan jabatan
  // sendiri sudah berharga (yang menandatangani SK standar harga jarang
  // berganti), dan membuang simpanan hanya karena nama masih kosong membuat
  // pilihan itu hilang tiap kali halaman dibuka lagi.
  function simpanTtd(next: { id?: string; jabatan?: JabatanTtd }) {
    const v: TtdTersimpan = { id: next.id ?? ttdId, jabatan: next.jabatan ?? jabatan }
    // ⚠️ Dulu `localStorage.setItem` telanjang — melempar di mode privat &
    // saat kuota penuh, dari dalam handler pemilih, jadi memilih penanda
    // tangan bisa menjatuhkan halaman cetaknya.
    ingatan.simpan(v)
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      {/* F4 landscape — sama dgn lembar RKBMD se-Kabupaten. Daftar SSH bisa
          ribuan baris, jadi `thead` diminta berulang di tiap halaman & baris
          dijaga tidak terpotong di tengah.
          ⚠️ Tanggal, judul, & URL di tepi hasil cetak itu header/footer BAWAAN
          BROWSER — tak bisa disentuh CSS. Matikan lewat "Headers and footers"
          di dialog Print. Identitas kita sendiri dicetak di kanan atas lembar. */}
      <style>{`@media print {
        .no-print { display: none !important; }
        @page { size: 330mm 215mm; margin: 1cm; }
        body { background: white; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }`}</style>

      <div className="max-w-6xl mx-auto mb-3 flex flex-wrap items-center justify-between gap-3 no-print px-4">
        <span className="text-sm text-gray-500">
          {jenis ? `${judulCetak(jenis)} — TA ${tahun}` : ''}
          {!loading && !err && ` · ${rows.length} baris`}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {!loading && !err && (
            <>
              {/* Dropdown polos, bukan pop-up seperti lembar RKBMD per-SKPD:
                  lembar ini dicetak Pengelola Barang dan penanda tangannya
                  nyaris selalu orang yang sama, jadi menanyakannya tiap kali
                  cuma menghalangi. */}
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Ditandatangani
                <select className="select-filter text-sm" value={jabatan}
                  onChange={e => {
                    const v = e.target.value as JabatanTtd
                    setJabatan(v); simpanTtd({ jabatan: v })
                  }}>
                  <option value="bupati">{JABATAN.bupati}</option>
                  <option value="sekda">{JABATAN.sekda}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Nama:
                <select className="select-filter text-sm max-w-xs" value={ttdId}
                  onChange={e => { setTtdId(e.target.value); simpanTtd({ id: e.target.value }) }}>
                  <option value="">— belum dipilih (dibiarkan bertitik-titik) —</option>
                  {pegawai.map(g => (
                    <option key={String(g.id)} value={String(g.id)}>
                      {g.nama}{g.jabatan ? ` — ${g.jabatan}` : ''}
                      {g.skpd_id != null && skpdNama.get(g.skpd_id) ? ` (${skpdNama.get(g.skpd_id)})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button onClick={() => window.print()} className="btn-primary text-sm" disabled={loading || !!err}>
            🖨 Cetak / Simpan PDF
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="bg-white p-8 text-sm text-gray-400">Memuat…</div>
        ) : err ? (
          <div className="bg-white p-8 text-sm text-red-600">{err}</div>
        ) : jenis && (
          <Lembar jenis={jenis} tahun={tahun} rows={rows} kolom={kolom} ttd={ttd} jabatan={jabatan} />
        )}
      </div>
    </div>
  )
}

// ── Lembar lampiran ─────────────────────────────────────────────────────────
function Lembar({ jenis, tahun, rows, kolom, ttd, jabatan }: {
  jenis: UsulanJenis; tahun: number; rows: Baris[]; kolom: Kolom[]
  ttd: Pegawai | null; jabatan: JabatanTtd
}) {
  const nKolom = kolom.length + 1 // + kolom No.

  return (
    <div className="bg-white p-8 shadow print:shadow-none print:p-0 text-[10px] text-gray-900">
      <style>{`.brd{border:1px solid #6b7280}`}</style>
      <p className="text-right text-[9px] text-gray-500 mb-1">BMD | Kabupaten {KABUPATEN}</p>

      {/* Blok lampiran SK — nomor & tanggalnya DIKOSONGKAN untuk ditulis tangan
          atau diketik saat SK-nya disusun. Aplikasi ini tidak menyimpan nomor
          SK di mana pun, dan mengarang nomor di lembar yang akan diteken jauh
          lebih berbahaya daripada titik-titik yang jelas belum diisi. */}
      <div className="flex justify-end mb-3">
        <table className="text-[9px]">
          <tbody>
            <tr><td className="pr-2 align-top" colSpan={3}>LAMPIRAN</td></tr>
            <tr><td className="pr-2 align-top" colSpan={3}>KEPUTUSAN {JABATAN[jabatan].toUpperCase()}</td></tr>
            <tr>
              <td className="pr-2 align-top">NOMOR</td><td className="pr-2 align-top">:</td>
              <td className="align-top">………………………………</td>
            </tr>
            <tr>
              <td className="pr-2 align-top">TANGGAL</td><td className="pr-2 align-top">:</td>
              <td className="align-top">………………………………</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-center mb-3">
        <p className="font-bold uppercase text-[12px]">Pemerintah Kabupaten {KABUPATEN}</p>
        <p className="font-bold uppercase text-[12px]">{judulCetak(jenis)}</p>
        <p className="font-bold uppercase text-[11px]">Tahun Anggaran {tahun}</p>
      </div>

      <table className="border-collapse w-full">
        <thead>
          <tr className="text-center">
            <th className="brd px-1 py-1 font-semibold">No.</th>
            {kolom.map(k => <th key={k.judul} className="brd px-1 py-1 font-semibold">{k.judul}</th>)}
          </tr>
          <tr className="text-center text-[9px]">
            {Array.from({ length: nKolom }, (_, i) => <td key={i} className="brd px-1">{i + 1}</td>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="brd px-1 py-0.5 text-center align-top">{i + 1}</td>
              {kolom.map(k => (
                <td key={k.judul}
                  className={`brd px-1 py-0.5 align-top ${k.align === 'right' ? 'text-right' : k.align === 'center' ? 'text-center' : ''}`}>
                  {k.isi(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* SENGAJA TIDAK ada baris JUMLAH rupiah. Yang berjajar di kolom nilai
              itu HARGA SATUAN barang-barang yang berbeda — menjumlahkannya
              menghasilkan angka yang tak berarti apa pun, dan begitu tercetak
              di lampiran SK ia akan dikutip orang sebagai "nilai standar harga".
              (Bandingkan lembar RKBMD, yang memang menjumlahkan rencana
              anggaran.) Yang berguna & jujur cuma banyaknya baris. */}
          <tr className="font-semibold">
            <td className="brd px-1 py-1 text-right" colSpan={nKolom}>
              Jumlah keseluruhan: {rows.length.toLocaleString('id-ID')} baris
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Tanggal DIKOSONGKAN untuk ditulis tangan — lembar ini diteken entah
          kapan setelah dicetak, jadi mencetak tanggal hari ini justru memaksa
          penanda tangan mencoret (pola lembar RKBMD se-Kabupaten).
          Belum memilih nama → dibiarkan bertitik-titik; JANGAN diisi nama lain. */}
      <div className="mt-8 flex justify-end pr-16">
        <div className="text-center">
          <p>{KABUPATEN}, ……… - ……… - {tahun - 1}</p>
          <p className="uppercase">{JABATAN[jabatan]},</p>
          <div className="h-16" />
          <p className="font-semibold underline uppercase">{ttd?.nama || '(………………………………)'}</p>
          {/* Bupati itu jabatan politis & tidak ber-NIP, jadi barisnya memang
              tak dicetak — bukan karena datanya kosong. Sekda ber-NIP. */}
          {jabatan === 'sekda' && <p>NIP. {ttd?.nip || '………………………'}</p>}
        </div>
      </div>
    </div>
  )
}
