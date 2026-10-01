'use client'
// Laporan Hasil Inventarisasi (LHI) — Format III.B.1–III.B.13.
// LHI TIDAK diinput terpisah: seluruh isinya diturunkan dari jawaban Lembar
// Kerja (LKI) lewat klasifikasiLhi(). Satu barang bisa muncul di beberapa
// format sekaligus (mis. kondisi berubah DAN tercatat ganda).
//
// ⚠️ Jangan tertukar dgn menu Pelaporan → Laporan Perolehan → "Laporan Hasil
// Inventarisasi" — yang itu laporan CARA PEROLEHAN (jenis ledger
// `hasil_inventarisasi`), beda hal.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FormShell from '@/components/pengelolaan/FormShell'
import SkpdCombobox from '@/components/SkpdCombobox'
import LhiTabel from '@/components/inventarisasi/LhiTabel'
import RekapLhiPanel from '@/components/inventarisasi/RekapLhiPanel'
import { useLhiData } from '@/components/inventarisasi/useLhiData'
import { useNamaSkpd } from '@/components/useNamaSkpd'
import { useProfilRole } from '@/components/useProfilRole'
import { useSkpdTree } from '@/components/useSkpdTree'
import { exportToExcel } from '@/lib/export'
import { namaBerkasLaporan } from '@/lib/namaBerkas'
import {
  GOLONGAN_OPSI, LHI_LABEL, LHI_URUT, REKOMENDASI, konfigLki, type LhiKode,
} from '@/lib/inventarisasi'
import { identitasLhi, kolomLhi, nilaiBarisLhi } from '@/lib/inventarisasiLaporan'
import { barisExcelUbah } from '@/lib/inventarisasiLhiUbah'

const TAHUN_INI = new Date().getFullYear()

export default function LaporanInventarisasiPage() {
  const [tahun, setTahun] = useState(TAHUN_INI)
  const [golongan, setGolongan] = useState('1.3.3')
  const [skpdIds, setSkpdIds] = useState<number[] | null>(null)
  const [skpdId, setSkpdId] = useState<number | null>(null)
  const { nama: skpdNama, pilih: pilihNamaSkpd } = useNamaSkpd()
  const [kode, setKode] = useState<LhiKode>('III.B.7')

  // Admin pemda & auditor (pengawas) mendapat dua tab — Rekap per SKPD (halaman
  // awal) dan Format Permendagri. Pengurus Barang langsung Format Permendagri,
  // tanpa pemilih tab (keputusan user 2026-10-01).
  const { role, skpdId: myScopeId } = useProfilRole()
  const { byId: pohonSkpd, childrenOf, loaded: skpdLoaded } = useSkpdTree()
  const bolehRekap = role === 'admin' || role === 'pengawas'
  const [tabPilih, setTabPilih] = useState<'rekap' | 'format' | null>(null)
  const tab = bolehRekap ? (tabPilih ?? 'rekap') : 'format'
  // Pemilih SKPD hanya untuk admin/auditor, atau pengurus yang SKPD-nya punya
  // unit di bawahnya. Pengurus tanpa unit bawahan: cakupannya sudah SKPD-nya
  // sendiri (dibatasi RLS), jadi pemilihnya hanya kotak yang tak punya pilihan.
  const punyaAnak = myScopeId != null && (childrenOf.get(myScopeId)?.length ?? 0) > 0
  const tampilPemilihSkpd = bolehRekap || punyaAnak
  const sendirian = role !== null && skpdLoaded && !tampilPemilihSkpd
  useEffect(() => {
    if (!sendirian || myScopeId == null) return
    setSkpdId(myScopeId); void pilihNamaSkpd(myScopeId)
  }, [sendirian, myScopeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { baris, loading, err, barisUntuk, hitungPerFormat, indukLive, wilayahLabel } = useLhiData({ tahun, golongan, skpdIds, aktif: tab === 'format' && role !== null })
  // Butir (3)–(5) kop: Kuasa PB / PB dari SKPD yang dipilih, Pengelola = BKAD.
  const identitas = useMemo(() => identitasLhi(skpdId, [...pohonSkpd.values()]), [skpdId, pohonSkpd])
  const hitung = useMemo(() => hitungPerFormat(), [hitungPerFormat])
  const nFormatBerisi = LHI_URUT.filter(k => (hitung[k] || 0) > 0).length

  // Format yang dibuka otomatis = yang pertama punya temuan. Hanya dijalankan
  // saat DATA berganti (filter diubah / selesai memuat), bukan saat operator
  // memilih format — pilihan manual ke format kosong tak boleh dilompati balik.
  // Format yang sedang terpilih tetap dipertahankan kalau ia sudah berisi.
  useEffect(() => {
    if (loading || err || baris.length === 0) return
    if ((hitung[kode] || 0) > 0) return
    const pertama = LHI_URUT.find(k => (hitung[k] || 0) > 0)
    if (pertama) setKode(pertama)
  }, [baris, loading, err]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => barisUntuk(kode).map((b, i) => nilaiBarisLhi(kode, b, i + 1, indukLive, wilayahLabel)),
    [barisUntuk, kode, indukLive, wilayahLabel],
  )

  function handleExport() {
    const kolom = kolomLhi(kode)
    exportToExcel(
      // III.B.8: dua baris per barang (Sebelum/Sesudah) + "Kolom yang berubah" —
      // warna font tak bisa dibuat di Excel, jadi perubahannya dinyatakan sbg kolom.
      kode === 'III.B.8' ? barisExcelUbah(rows) : rows.map(r => {
        const o: Record<string, unknown> = {}
        for (const k of kolom) o[k.grup ? `${k.grup} — ${k.label}` : k.label] = r[k.key] ?? ''
        return o
      }),
      namaBerkasLaporan({ laporan: 'LHI', periode: tahun, golongan: golongan, skpd: skpdNama }),
      kode,
    )
  }

  const cetakUrl = `/cetak/inventarisasi-lhi?tahun=${tahun}&golongan=${golongan}&kode=${encodeURIComponent(kode)}${skpdId ? `&skpd=${skpdId}` : ''}`

  return (
    <FormShell
      judul="Laporan Hasil Inventarisasi (LHI)"
      deskripsi="Format III.B.1–III.B.13 (Permendagri 47/2021). Isi laporan diturunkan otomatis dari Lembar Kerja Inventarisasi."
      msg=""
      headerRight={
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/inventarisasi/lembar-kerja?jenis=${golongan}`} className="btn-secondary text-sm">← Lembar Kerja</Link>
          {tab === 'format' && <a href={cetakUrl} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
            🖨 Cetak / PDF
          </a>}
          {tab === 'format' && <button onClick={handleExport} disabled={rows.length === 0} className="btn-primary">Export Excel</button>}
        </div>
      }
    >
      {bolehRekap && (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          {([['rekap', 'Rekap per SKPD'], ['format', 'Format Permendagri']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setTabPilih(v)}
              className={`px-4 py-1.5 rounded-md transition-colors ${tab === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'rekap' ? <RekapLhiPanel /> : (<>
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err} — laporan TIDAK ditampilkan supaya tak ada yang terbaca sebagai lengkap padahal sebagian gagal dimuat.
        </div>
      )}
      {/* Filter: SKPD satu baris penuh, lalu Tahun / Jenis Aset / Format Laporan.
          Format Laporan dibuat DROPDOWN (bukan 11 kartu) — daftar sepanjang itu
          bikin halaman ramai & sulit dibaca; jumlah temuan tetap ditampilkan
          di tiap opsi supaya operator tahu mana yang berisi. */}
      <div className="card p-4 mb-4 space-y-3">
        {tampilPemilihSkpd && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">SKPD</label>
            <SkpdCombobox lockToOperator allowClear
              onChangeSelection={sel => { setSkpdIds(sel.descendantIds); setSkpdId(sel.skpdId); pilihNamaSkpd(sel.skpdId) }}
              placeholder="Semua SKPD — atau ketik nama SKPD..." />
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tahun</label>
            <select className="select-filter" value={tahun} onChange={e => setTahun(Number(e.target.value))}>
              {[TAHUN_INI, TAHUN_INI - 1, TAHUN_INI - 2].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jenis Aset</label>
            <select className="select-filter" value={golongan} onChange={e => setGolongan(e.target.value)}>
              {GOLONGAN_OPSI.map(g => <option key={g.kode} value={g.kode}>{g.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[320px]">
            <label className="block text-xs text-gray-500 mb-1">Format Laporan</label>
            <select className="select-filter w-full" value={kode} onChange={e => setKode(e.target.value as LhiKode)}>
              {LHI_URUT.map(k => {
                const n = hitung[k] || 0
                // Format tanpa temuan diabu-abukan: tak perlu dicetak. Tetap bisa dipilih.
                return (
                  <option key={k} value={k} style={n === 0 ? { color: '#9ca3af' } : { fontWeight: 600 }}>
                    {k} — {LHI_LABEL[k]} ({n})
                  </option>
                )
              })}
            </select>
            {!loading && !err && baris.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">
                {nFormatBerisi === 0
                  ? 'Tidak ada temuan pada jenis aset ini — tidak ada format yang perlu dicetak.'
                  : `${nFormatBerisi} dari ${LHI_URUT.length} format ada temuan (angka dalam kurung = jumlah barang); format berwarna abu-abu tidak ada temuan.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4 mb-4 text-xs text-gray-600">
        <b>Rekomendasi tindak lanjut:</b> {REKOMENDASI[kode].saran}
        {REKOMENDASI[kode].menu !== '—' && <> <span className="text-gray-400">(menu: {REKOMENDASI[kode].menu})</span></>}
        <p className="text-[11px] text-gray-400 mt-1">
          Inventarisasi tidak mengeksekusi apa pun ke buku besar — tindak lanjut dikerjakan manual di menu terkait.
          Laporan ini hanya memuat isian yang <b>sudah divalidasi</b> Pengelola Barang.
        </p>
      </div>

      <div className="card p-4 overflow-x-auto">
        {loading ? (
          <p className="py-8 text-center text-gray-400 text-sm">Memuat data...</p>
        ) : err ? null : baris.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">
            Belum ada isian inventarisasi {konfigLki(golongan).label} tahun {tahun} yang divalidasi.
          </p>
        ) : (
          <LhiTabel kode={kode} rows={rows} jenisAset={konfigLki(golongan).label} tahun={tahun} identitas={identitas} />
        )}
      </div>
      </>)}
    </FormShell>
  )
}
